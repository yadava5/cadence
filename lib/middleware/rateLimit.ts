/**
 * Rate limiting middleware for Vercel API routes
 */
import { createHash } from 'node:crypto';
import type { VercelResponse } from '@vercel/node';
import type { AuthenticatedRequest } from '../types/api.js';
import { RateLimitError } from '../types/api.js';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /**
   * Counter namespace. REQUIRED, and distinct per limiter.
   *
   * Every limiter used to increment ONE entry per caller because the store key
   * was just the caller identity. All presets therefore shared a single
   * counter, and the strictest `max` won: two `/api/health` probes (max 100)
   * pushed the same counter that `auth` reads with max 5, so login and refresh
   * answered 429 before a credential was ever submitted. Observed in
   * production on 2026-08-10 — three requests from one page context returned
   * `x-ratelimit-limit: 100 / remaining: 91`, then `100 / 90`, then
   * `5 / 0`, all with an identical `x-ratelimit-reset`.
   *
   * The store key is `${bucket}:${callerKey}`, so a counter can only ever be
   * shared by limiters that deliberately name the same bucket.
   */
  bucket: string;
  windowMs: number; // Time window in milliseconds
  max: number; // Maximum requests per window
  keyGenerator?: (req: AuthenticatedRequest) => string;
  /**
   * NOT IMPLEMENTED. Both flags are accepted and ignored: honouring them needs
   * the response status, which this middleware never observes (it counts on
   * the way in, before the handler runs). Left in the type because callers may
   * already pass them; do not rely on them until they actually do something.
   */
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

/** Options accepted by {@link rateLimit} — everything optional except `bucket`. */
export type RateLimitOptions = Partial<Omit<RateLimitConfig, 'bucket'>> &
  Pick<RateLimitConfig, 'bucket'>;

/**
 * Hard ceiling on tracked entries.
 *
 * The cleanup interval below cannot be relied on (see the store comment), so
 * the map has to be self-limiting: without a cap, a caller cycling distinct
 * keys grows it until the function instance dies.
 *
 * Eviction is a known, accepted weakness: a flood of distinct keys can push
 * out an attacker's own `auth:` entry and hand them a fresh login counter.
 * That is tolerable only because this store was never a security boundary in
 * the first place (it is per-instance and best-effort — again, see below); the
 * cap is chosen high enough that reaching it takes far more traffic than the
 * limiter would have allowed a single caller anyway.
 */
const MAX_ENTRIES = 10_000;
/** Evict in chunks so the sort cost amortises instead of running per insert. */
const EVICT_CHUNK = Math.max(1, Math.floor(MAX_ENTRIES * 0.1));

/**
 * In-memory store for rate limiting.
 *
 * HONEST GUARANTEE: this is a plain `Map` living inside one serverless
 * function instance. It is therefore
 *   - per-instance, not shared: Vercel runs many concurrent instances, so the
 *     effective limit is roughly `max × instances`, and a caller routed to a
 *     cold instance starts from zero;
 *   - not durable: the counter dies with the instance;
 *   - best-effort only. Treat it as protection against accidental hammering
 *     and casual scripts, NOT as a security control. Anything that must not be
 *     brute-forced needs a real shared store (Redis/Upstash) or defence at the
 *     credential layer — neither of which exists here today.
 */
class MemoryStore {
  private store = new Map<string, { count: number; resetTime: number }>();

  get(key: string): { count: number; resetTime: number } | undefined {
    const entry = this.store.get(key);
    if (entry && entry.resetTime < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  set(key: string, value: { count: number; resetTime: number }): void {
    this.store.set(key, value);
  }

  increment(
    key: string,
    windowMs: number
  ): { count: number; resetTime: number } {
    const now = Date.now();
    const entry = this.get(key);

    if (!entry) {
      // Only a NEW key can grow the map, so this is the only place that needs
      // to enforce the ceiling.
      if (this.store.size >= MAX_ENTRIES) {
        this.evict();
      }
      const newEntry = { count: 1, resetTime: now + windowMs };
      this.set(key, newEntry);
      return newEntry;
    }

    entry.count++;
    this.set(key, entry);
    return entry;
  }

  /** Drop expired entries first; only then evict live ones by soonest reset. */
  private evict(): void {
    this.cleanup();
    if (this.store.size < MAX_ENTRIES) return;

    const byExpiry = Array.from(this.store.entries()).sort(
      (a, b) => a[1].resetTime - b[1].resetTime
    );
    const overflow = this.store.size - MAX_ENTRIES + EVICT_CHUNK;
    for (let i = 0; i < overflow && i < byExpiry.length; i++) {
      this.store.delete(byExpiry[i][0]);
    }
  }

  cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.store.entries());
    for (let i = 0; i < entries.length; i++) {
      const [key, entry] = entries[i];
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}

// Global store instance
const store = new MemoryStore();

// Opportunistic cleanup of expired entries.
//
// In a long-lived Node process this fires every 5 minutes. In a serverless
// function it very often does NOT: the instance is frozen between invocations
// and killed when it goes idle, so the timer may never run once. The ceiling in
// `increment()` is what actually bounds memory; this is only an optimisation
// for the dev server and for warm instances. `unref()` so it can never hold a
// process (or a test runner) open.
const cleanupTimer: unknown = setInterval(() => store.cleanup(), 5 * 60 * 1000);
if (
  cleanupTimer &&
  typeof (cleanupTimer as { unref?: () => void }).unref === 'function'
) {
  (cleanupTimer as { unref: () => void }).unref();
}

// Test-only helper to reset the in-memory store between test cases.
export function resetRateLimitStore(): void {
  store.clear();
}

/** Test-only view of the store's size, for the bounded-growth assertion. */
export function rateLimitStoreSize(): number {
  return store.size;
}

/**
 * Identity of the caller a counter belongs to.
 *
 * Prefixed by kind so a user id can never collide with an IP literal.
 */
function callerKey(req: AuthenticatedRequest): string {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  const ip = getClientIP(req);
  if (ip) {
    return `ip:${ip}`;
  }

  return `fp:${unidentifiedCallerFingerprint(req)}`;
}

/**
 * Fallback identity when no IP can be resolved at all.
 *
 * Previously this collapsed to the literal string `'anonymous'`, which meant
 * every caller whose IP was unknown shared ONE counter — one client could
 * exhaust the login allowance for all of them. Spreading them over a coarse
 * request fingerprint is strictly better on that axis.
 *
 * It is deliberately NOT a throttle boundary: these headers are entirely
 * client-controlled, so anyone who wants a fresh bucket per request can have
 * one (which is exactly what the `getClientIP` comment below warns about for
 * X-Forwarded-For). Its only job is DoS-spreading — stopping one unidentifiable
 * caller from denying service to another.
 *
 * This path is close to unreachable in practice: Vercel always sets
 * `x-vercel-forwarded-for`, and even locally `getClientIP` falls back to the
 * socket's remote address. It is reached by mocks and by exotic proxies.
 */
function unidentifiedCallerFingerprint(req: AuthenticatedRequest): string {
  const header = (name: string): string => {
    const value = req.headers?.[name];
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(',');
    return '';
  };

  const material = [
    header('user-agent'),
    header('accept-language'),
    header('accept-encoding'),
  ].join('|');

  return createHash('sha256').update(material).digest('base64url').slice(0, 16);
}

/**
 * Default rate limit configuration
 */
const defaultConfig: Omit<RateLimitConfig, 'bucket'> = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  keyGenerator: callerKey,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  message: 'Too many requests, please try again later',
};

/**
 * Rate limiting middleware
 */
export function rateLimit(config: RateLimitOptions) {
  const options = { ...defaultConfig, ...config };

  return async (
    req: AuthenticatedRequest,
    res: VercelResponse,
    next: () => void
  ) => {
    // Namespaced: only limiters naming the same bucket share a counter.
    const key = `${options.bucket}:${options.keyGenerator!(req)}`;
    const entry = store.increment(key, options.windowMs);

    // Set rate limit headers. These now describe the bucket that was actually
    // consulted — before namespacing they reported this limiter's `max` over a
    // count accumulated by every other limiter, which made them actively
    // misleading.
    res.setHeader('X-RateLimit-Limit', options.max.toString());
    res.setHeader(
      'X-RateLimit-Remaining',
      Math.max(0, options.max - entry.count).toString()
    );
    res.setHeader(
      'X-RateLimit-Reset',
      Math.ceil(entry.resetTime / 1000).toString()
    );

    // Check if rate limit exceeded
    if (entry.count > options.max) {
      res.setHeader(
        'Retry-After',
        Math.ceil((entry.resetTime - Date.now()) / 1000).toString()
      );

      const error = new RateLimitError(options.message);
      res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    next();
  };
}

/**
 * Get client IP address
 */
function getClientIP(req: AuthenticatedRequest): string | undefined {
  // SECURITY: never trust the *first* X-Forwarded-For hop — it is fully
  // client-controlled, so keying the limiter off it lets an attacker mint a
  // fresh bucket per request (rotate the header) and defeat throttling.
  // On Vercel the platform sets authoritative, un-spoofable headers: prefer
  // `x-vercel-forwarded-for`, then `x-real-ip`. Only as a last resort do we
  // read X-Forwarded-For, and then the LAST hop (the one the trusted proxy
  // appended), not the first.
  const vercelIP = req.headers['x-vercel-forwarded-for'];
  if (typeof vercelIP === 'string' && vercelIP.trim()) {
    return vercelIP.split(',')[0].trim();
  }

  const realIP = req.headers['x-real-ip'];
  if (typeof realIP === 'string' && realIP.trim()) {
    return realIP.trim();
  }

  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const hops = forwarded
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    // Last hop is appended by the trusted edge; first is attacker-controllable.
    return hops[hops.length - 1];
  }

  return req.connection?.remoteAddress || req.socket?.remoteAddress;
}

/** Names of the shipped presets. Each one owns a bucket of the same name. */
export type RateLimitPresetName =
  | 'auth'
  | 'authRefresh'
  | 'api'
  | 'read'
  | 'write'
  | 'upload'
  | 'health';

/**
 * Predefined rate limit configurations
 */
export const rateLimitPresets: Record<
  RateLimitPresetName,
  ReturnType<typeof rateLimit>
> = {
  // Credential endpoints: login and register.
  //
  // Deliberately strict and unchanged at 5 per 15 minutes — throttling
  // credential stuffing is the entire point of this preset, and now that the
  // bucket is namespaced those 5 are 5 *credential submissions*, not 5 requests
  // of any kind. A legitimate user gets five password attempts per quarter hour
  // from one address; an attacker gets 20 guesses an hour per address.
  auth: rateLimit({
    bucket: 'auth',
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: 'Too many authentication attempts, please try again later',
  }),

  // Token refresh — NOT a credential submission, and must not be priced like
  // one. A signed-in session refreshes on its own schedule (the access token is
  // an hour) and again after any 401, and `authStore.refreshTokenIfNeeded`
  // treats a failed refresh as "session dead" and forces a re-login — which the
  // login limiter then also blocks. Sharing the login bucket therefore turned a
  // 429 here into a self-reinforcing lockout.
  //
  // 60 per 15 minutes absorbs the honest worst case: several tabs and devices
  // on one NAT address, each recovering from a 401 burst. It is not a
  // brute-force boundary and does not need to be — refresh tokens are
  // high-entropy, single-use and rotated, with reuse invalidating the whole
  // family (see RefreshTokenService), which is the real defence.
  //
  // Keyed by the default caller key, i.e. `req.user.id` when a user is present,
  // IP otherwise. In practice it is IP-keyed: `/api/auth/refresh` runs no
  // `authenticateJWT()` (it must work with an EXPIRED access token), so
  // `req.user` is unset. The refresh token in the body is deliberately not used
  // as the key — it is unverified attacker-controlled input at that point, so
  // keying off it would let anyone mint unlimited buckets.
  authRefresh: rateLimit({
    bucket: 'auth-refresh',
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 60,
    message: 'Too many token refresh attempts, please try again later',
  }),

  // Standard rate limiting for API endpoints
  api: rateLimit({
    bucket: 'api',
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
  }),

  // Lenient rate limiting for read operations
  read: rateLimit({
    bucket: 'read',
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // 200 requests per window
  }),

  // Strict rate limiting for write operations
  write: rateLimit({
    bucket: 'write',
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 50 requests per window
  }),

  // Very strict rate limiting for file uploads
  upload: rateLimit({
    bucket: 'upload',
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 uploads per hour
    message: 'Upload limit exceeded, please try again later',
  }),

  // Uptime probe / keep-alive (`/api/health`).
  //
  // Kept limited rather than exempt: the endpoint is unauthenticated, so
  // "unlimited" is a free invocation-burning target. But it gets its own
  // generous bucket because scheduled probes are exactly the traffic that used
  // to exhaust the login allowance. 120/minute is far above any monitor's poll
  // rate, and the handler's own 5s probe cache already bounds database load.
  health: rateLimit({
    bucket: 'health',
    windowMs: 60 * 1000, // 1 minute
    max: 120,
    message: 'Too many health checks, please try again later',
  }),
};
