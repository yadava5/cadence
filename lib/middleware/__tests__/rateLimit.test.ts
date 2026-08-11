/**
 * Rate limiting middleware test suite
 * Tests rate limit enforcement, memory store, headers, presets, and IP detection
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  rateLimit,
  rateLimitPresets,
  rateLimitStoreSize,
  resetRateLimitStore,
} from '../rateLimit';
import { createMockRequest, createMockResponse } from '../../__tests__/helpers';
import type { VercelResponse } from '@vercel/node';
import type { AuthenticatedRequest } from '../../types/api';

describe('Rate Limit Middleware', () => {
  let mockNext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockNext = vi.fn();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    resetRateLimitStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('rateLimit', () => {
    it('should allow requests within rate limit', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };
      const res = createMockResponse();

      const middleware = rateLimit({ bucket: 'test', max: 5, windowMs: 60000 });

      // Make 3 requests (under limit of 5)
      await middleware(req, res, mockNext);
      await middleware(req, res, mockNext);
      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(3);
      expect(vi.mocked(res.status)).not.toHaveBeenCalledWith(429);
    });

    it('should block requests exceeding rate limit', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };
      const res = createMockResponse();

      const middleware = rateLimit({ bucket: 'test', max: 3, windowMs: 60000 });

      // Make 4 requests (exceeds limit of 3)
      await middleware(req, res, mockNext);
      await middleware(req, res, mockNext);
      await middleware(req, res, mockNext);
      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(3);
      expect(vi.mocked(res.status)).toHaveBeenCalledWith(429);
    });

    it('should set rate limit headers on every request', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };
      const res = createMockResponse();

      const middleware = rateLimit({
        bucket: 'test',
        max: 10,
        windowMs: 60000,
      });

      await middleware(req, res, mockNext);

      expect(vi.mocked(res.setHeader)).toHaveBeenCalledWith(
        'X-RateLimit-Limit',
        '10'
      );
      expect(vi.mocked(res.setHeader)).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        '9'
      );
      expect(vi.mocked(res.setHeader)).toHaveBeenCalledWith(
        'X-RateLimit-Reset',
        expect.any(String)
      );
    });

    it('should decrement remaining count with each request', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };

      const middleware = rateLimit({ bucket: 'test', max: 5, windowMs: 60000 });

      // First request
      const res1 = createMockResponse();
      await middleware(req, res1, mockNext);
      expect(vi.mocked(res1.setHeader)).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        '4'
      );

      // Second request
      const res2 = createMockResponse();
      await middleware(req, res2, mockNext);
      expect(vi.mocked(res2.setHeader)).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        '3'
      );

      // Third request
      const res3 = createMockResponse();
      await middleware(req, res3, mockNext);
      expect(vi.mocked(res3.setHeader)).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        '2'
      );
    });

    it('should set Retry-After header when rate limited', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };
      const res = createMockResponse();

      const middleware = rateLimit({ bucket: 'test', max: 2, windowMs: 60000 });

      // Exceed limit
      await middleware(req, res, mockNext);
      await middleware(req, res, mockNext);
      await middleware(req, res, mockNext);

      expect(vi.mocked(res.setHeader)).toHaveBeenCalledWith(
        'Retry-After',
        expect.any(String)
      );
    });

    it('should use user ID as key when authenticated', async () => {
      const user1Req = createMockRequest() as AuthenticatedRequest;
      user1Req.user = {
        id: 'user-1',
        email: 'user1@example.com',
        name: 'User 1',
      };

      const user2Req = createMockRequest() as AuthenticatedRequest;
      user2Req.user = {
        id: 'user-2',
        email: 'user2@example.com',
        name: 'User 2',
      };

      const middleware = rateLimit({ bucket: 'test', max: 2, windowMs: 60000 });

      // User 1 makes 2 requests
      const res1a = createMockResponse();
      await middleware(user1Req, res1a, mockNext);
      const res1b = createMockResponse();
      await middleware(user1Req, res1b, mockNext);

      // User 2 should still be allowed (different user)
      const res2 = createMockResponse();
      await middleware(user2Req, res2, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(3);
    });

    it('should use IP address as key when not authenticated', async () => {
      const req1 = createMockRequest({
        headers: { 'x-forwarded-for': '192.168.1.1' },
      }) as AuthenticatedRequest;

      const req2 = createMockRequest({
        headers: { 'x-forwarded-for': '192.168.1.2' },
      }) as AuthenticatedRequest;

      const middleware = rateLimit({ bucket: 'test', max: 2, windowMs: 60000 });

      // IP 1 makes 2 requests
      await middleware(req1, createMockResponse(), mockNext);
      await middleware(req1, createMockResponse(), mockNext);

      // IP 2 should still be allowed (different IP)
      await middleware(req2, createMockResponse(), mockNext);

      expect(mockNext).toHaveBeenCalledTimes(3);
    });

    it('should use custom key generator if provided', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      const res = createMockResponse();

      const customKeyGen = vi.fn(() => 'custom-key-123');
      const middleware = rateLimit({
        bucket: 'test',
        max: 2,
        windowMs: 60000,
        keyGenerator: customKeyGen,
      });

      await middleware(req, res, mockNext);

      expect(customKeyGen).toHaveBeenCalledWith(req);
    });

    it('should reset rate limit after window expires', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };

      const middleware = rateLimit({ bucket: 'test', max: 2, windowMs: 60000 });

      // Make 2 requests (at limit)
      await middleware(req, createMockResponse(), mockNext);
      await middleware(req, createMockResponse(), mockNext);

      // Advance time past window
      vi.advanceTimersByTime(61000);

      // Should be allowed again
      await middleware(req, createMockResponse(), mockNext);

      expect(mockNext).toHaveBeenCalledTimes(3);
    });

    it('should include custom message in rate limit error', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };
      const res = createMockResponse();

      const customMessage = 'Custom rate limit message';
      const middleware = rateLimit({
        bucket: 'test',
        max: 1,
        windowMs: 60000,
        message: customMessage,
      });

      await middleware(req, res, mockNext);
      await middleware(req, res, mockNext);

      expect(vi.mocked(res.json)).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: customMessage,
          }),
        })
      );
    });

    it('should return error response with correct structure', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };
      const res = createMockResponse();

      const middleware = rateLimit({ bucket: 'test', max: 1, windowMs: 60000 });

      await middleware(req, res, mockNext);
      await middleware(req, res, mockNext);

      expect(vi.mocked(res.status)).toHaveBeenCalledWith(429);
      expect(vi.mocked(res.json)).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'RATE_LIMIT_EXCEEDED',
            message: expect.any(String),
            timestamp: expect.any(String),
          }),
        })
      );
    });

    it('should handle concurrent requests from same user', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };

      const middleware = rateLimit({ bucket: 'test', max: 5, windowMs: 60000 });

      // Make 3 concurrent requests
      const promises = [
        middleware(req, createMockResponse(), mockNext),
        middleware(req, createMockResponse(), mockNext),
        middleware(req, createMockResponse(), mockNext),
      ];

      await Promise.all(promises);

      expect(mockNext).toHaveBeenCalledTimes(3);
    });

    it('should handle requests with no user and no IP', async () => {
      const req = createMockRequest({
        headers: {},
      }) as AuthenticatedRequest;
      const res = createMockResponse();

      const middleware = rateLimit({ bucket: 'test', max: 2, windowMs: 60000 });

      // Should still work with 'anonymous' key
      await middleware(req, res, mockNext);
      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(2);
    });
  });

  describe('IP Detection', () => {
    it('should extract IP from x-forwarded-for header', async () => {
      const req = createMockRequest({
        headers: { 'x-forwarded-for': '203.0.113.1' },
      }) as AuthenticatedRequest;
      const res = createMockResponse();

      const keyGenSpy = vi.fn((req) => {
        return req.user?.id || '203.0.113.1';
      });

      const middleware = rateLimit({
        bucket: 'test',
        max: 2,
        windowMs: 60000,
        keyGenerator: keyGenSpy,
      });

      await middleware(req, res, mockNext);

      expect(keyGenSpy).toHaveBeenCalled();
    });

    it('should extract first IP from x-forwarded-for chain', async () => {
      const req = createMockRequest({
        headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.1, 192.0.2.1' },
      }) as AuthenticatedRequest;
      const res = createMockResponse();

      const middleware = rateLimit({ bucket: 'test', max: 2, windowMs: 60000 });

      await middleware(req, res, mockNext);
      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(2);
    });

    it('should use x-real-ip header if x-forwarded-for not present', async () => {
      const req = createMockRequest({
        headers: { 'x-real-ip': '203.0.113.5' },
      }) as AuthenticatedRequest;
      const res = createMockResponse();

      const middleware = rateLimit({ bucket: 'test', max: 2, windowMs: 60000 });

      await middleware(req, res, mockNext);
      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(2);
    });

    it('should use cf-connecting-ip header for Cloudflare', async () => {
      const req = createMockRequest({
        headers: { 'cf-connecting-ip': '203.0.113.10' },
      }) as AuthenticatedRequest;
      const res = createMockResponse();

      const middleware = rateLimit({ bucket: 'test', max: 2, windowMs: 60000 });

      await middleware(req, res, mockNext);
      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(2);
    });
  });

  describe('rateLimitPresets', () => {
    it('auth preset should have strict limits', async () => {
      const req = createMockRequest({
        headers: { 'x-forwarded-for': '203.0.113.1' },
      }) as AuthenticatedRequest;

      // Should allow 5 requests max
      for (let i = 0; i < 5; i++) {
        await rateLimitPresets.auth(req, createMockResponse(), mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(5);

      // 6th request should be blocked
      await rateLimitPresets.auth(req, createMockResponse(), mockNext);

      expect(mockNext).toHaveBeenCalledTimes(5); // Still 5
    });

    it('api preset should have moderate limits', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };

      // Should allow 100 requests
      for (let i = 0; i < 100; i++) {
        await rateLimitPresets.api(req, createMockResponse(), mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(100);
    });

    it('read preset should have higher limits than write', async () => {
      const readReq = createMockRequest() as AuthenticatedRequest;
      readReq.user = {
        id: 'user-read',
        email: 'read@example.com',
        name: 'Read',
      };

      const writeReq = createMockRequest() as AuthenticatedRequest;
      writeReq.user = {
        id: 'user-write',
        email: 'write@example.com',
        name: 'Write',
      };

      // Read allows 200
      for (let i = 0; i < 200; i++) {
        await rateLimitPresets.read(readReq, createMockResponse(), mockNext);
      }

      // Write allows 50
      for (let i = 0; i < 50; i++) {
        await rateLimitPresets.write(writeReq, createMockResponse(), mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(250); // 200 + 50
    });

    it('upload preset should have very strict limits', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };

      // Should allow 10 requests max
      for (let i = 0; i < 10; i++) {
        await rateLimitPresets.upload(req, createMockResponse(), mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(10);

      // 11th request should be blocked
      const res = createMockResponse();
      await rateLimitPresets.upload(req, res, mockNext);

      expect(vi.mocked(res.status)).toHaveBeenCalledWith(429);
    });

    it('upload preset should have custom message', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };
      const res = createMockResponse();

      // Exceed upload limit
      for (let i = 0; i < 11; i++) {
        await rateLimitPresets.upload(req, createMockResponse(), mockNext);
      }

      await rateLimitPresets.upload(req, res, mockNext);

      expect(vi.mocked(res.json)).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('Upload limit exceeded'),
          }),
        })
      );
    });
  });

  describe('Memory Store Cleanup', () => {
    it('should clean up expired entries periodically', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };

      const middleware = rateLimit({ bucket: 'test', max: 5, windowMs: 60000 });

      // Make requests
      await middleware(req, createMockResponse(), mockNext);

      // Advance time to expire entries
      vi.advanceTimersByTime(61000);

      // Trigger cleanup (happens every 5 minutes in actual code)
      vi.advanceTimersByTime(5 * 60 * 1000);

      // Make new request - should start fresh count
      await middleware(req, createMockResponse(), mockNext);

      expect(mockNext).toHaveBeenCalledTimes(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero max limit', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };
      const res = createMockResponse();

      const middleware = rateLimit({ bucket: 'test', max: 0, windowMs: 60000 });

      await middleware(req, res, mockNext);

      expect(vi.mocked(res.status)).toHaveBeenCalledWith(429);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle very short window', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };

      const middleware = rateLimit({ bucket: 'test', max: 2, windowMs: 100 });

      // Make 2 requests
      await middleware(req, createMockResponse(), mockNext);
      await middleware(req, createMockResponse(), mockNext);

      // Wait for window to expire
      vi.advanceTimersByTime(150);

      // Should be allowed again
      await middleware(req, createMockResponse(), mockNext);

      expect(mockNext).toHaveBeenCalledTimes(3);
    });

    it('should handle very large window', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };

      const middleware = rateLimit({
        bucket: 'test',
        max: 2,
        windowMs: 24 * 60 * 60 * 1000,
      }); // 24 hours

      await middleware(req, createMockResponse(), mockNext);
      await middleware(req, createMockResponse(), mockNext);

      // Even after 1 hour, should still be at limit
      vi.advanceTimersByTime(60 * 60 * 1000);

      await middleware(req, createMockResponse(), mockNext);

      expect(mockNext).toHaveBeenCalledTimes(2);
    });

    it('should handle negative remaining count', async () => {
      const req = createMockRequest() as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test' };

      const middleware = rateLimit({ bucket: 'test', max: 1, windowMs: 60000 });

      // Exceed limit significantly
      await middleware(req, createMockResponse(), mockNext);
      await middleware(req, createMockResponse(), mockNext);
      const res3 = createMockResponse();
      await middleware(req, res3, mockNext);

      // Remaining should not go negative (clamped to 0)
      expect(vi.mocked(res3.setHeader)).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        '0'
      );
    });
  });

  /**
   * Bucket isolation — the defect that broke login in production.
   *
   * Every one of these uses ONE caller identity and varies only the bucket. If
   * the identities differed the assertions would pass under the old global-key
   * scheme too, and would prove nothing.
   */
  describe('Bucket Isolation', () => {
    const CALLER_IP = '203.0.113.77';
    const caller = () =>
      createMockRequest({
        headers: { 'x-vercel-forwarded-for': CALLER_IP },
      }) as AuthenticatedRequest;

    it('health-check traffic does not consume the login allowance', async () => {
      // `/api/health` is the scheduled uptime probe / Supabase keep-alive. On
      // the shared counter its traffic alone kept login and refresh at 429.
      for (let i = 0; i < 12; i++) {
        await rateLimitPresets.health(caller(), createMockResponse(), mockNext);
      }
      expect(mockNext).toHaveBeenCalledTimes(12);

      const loginNext = vi.fn();
      for (let i = 0; i < 5; i++) {
        const res = createMockResponse();
        await rateLimitPresets.auth(caller(), res, loginNext);
        expect(vi.mocked(res.status)).not.toHaveBeenCalledWith(429);
      }
      expect(loginNext).toHaveBeenCalledTimes(5);
    });

    it('api traffic does not consume the login allowance', async () => {
      for (let i = 0; i < 100; i++) {
        await rateLimitPresets.api(caller(), createMockResponse(), mockNext);
      }
      expect(mockNext).toHaveBeenCalledTimes(100);

      const loginNext = vi.fn();
      for (let i = 0; i < 5; i++) {
        await rateLimitPresets.auth(caller(), createMockResponse(), loginNext);
      }
      expect(loginNext).toHaveBeenCalledTimes(5);
    });

    it('read/write/upload traffic does not consume the login allowance', async () => {
      for (let i = 0; i < 50; i++) {
        await rateLimitPresets.read(caller(), createMockResponse(), mockNext);
        await rateLimitPresets.write(caller(), createMockResponse(), mockNext);
      }
      for (let i = 0; i < 10; i++) {
        await rateLimitPresets.upload(caller(), createMockResponse(), mockNext);
      }
      expect(mockNext).toHaveBeenCalledTimes(110);

      const loginNext = vi.fn();
      for (let i = 0; i < 5; i++) {
        await rateLimitPresets.auth(caller(), createMockResponse(), loginNext);
      }
      expect(loginNext).toHaveBeenCalledTimes(5);
    });

    it('login and refresh do not share a bucket', async () => {
      // Exhaust login for this caller.
      for (let i = 0; i < 5; i++) {
        await rateLimitPresets.auth(caller(), createMockResponse(), mockNext);
      }
      const blockedLogin = createMockResponse();
      await rateLimitPresets.auth(caller(), blockedLogin, mockNext);
      expect(vi.mocked(blockedLogin.status)).toHaveBeenCalledWith(429);
      expect(mockNext).toHaveBeenCalledTimes(5);

      // The same caller's session must still be able to refresh — otherwise a
      // 429 here clears auth and forces a re-login that is also 429'd.
      const refreshNext = vi.fn();
      const refreshRes = createMockResponse();
      await rateLimitPresets.authRefresh(caller(), refreshRes, refreshNext);

      expect(refreshNext).toHaveBeenCalledTimes(1);
      expect(vi.mocked(refreshRes.status)).not.toHaveBeenCalledWith(429);
      // Not merely "under its own larger max": the refresh counter must be
      // untouched by the six login attempts, i.e. this is its FIRST request.
      // On a shared counter the remaining would be 60 - 7 = 53.
      expect(vi.mocked(refreshRes.setHeader)).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        '59'
      );
    });

    it('refresh traffic does not consume the login allowance', async () => {
      for (let i = 0; i < 20; i++) {
        await rateLimitPresets.authRefresh(
          caller(),
          createMockResponse(),
          mockNext
        );
      }
      expect(mockNext).toHaveBeenCalledTimes(20);

      const loginNext = vi.fn();
      for (let i = 0; i < 5; i++) {
        await rateLimitPresets.auth(caller(), createMockResponse(), loginNext);
      }
      expect(loginNext).toHaveBeenCalledTimes(5);
    });

    it('reports headers for the bucket that was actually consulted', async () => {
      // Production returned `limit 100 / remaining 91`, then `limit 5 /
      // remaining 0`, with an identical reset — one counter, two stories.
      const apiRes = createMockResponse();
      await rateLimitPresets.api(caller(), apiRes, mockNext);
      expect(vi.mocked(apiRes.setHeader)).toHaveBeenCalledWith(
        'X-RateLimit-Limit',
        '100'
      );
      expect(vi.mocked(apiRes.setHeader)).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        '99'
      );

      const loginRes = createMockResponse();
      await rateLimitPresets.auth(caller(), loginRes, mockNext);
      expect(vi.mocked(loginRes.setHeader)).toHaveBeenCalledWith(
        'X-RateLimit-Limit',
        '5'
      );
      // 4, not 0: the api request above belongs to a different counter.
      expect(vi.mocked(loginRes.setHeader)).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        '4'
      );
    });

    it('limiters that name the SAME bucket still share a counter', async () => {
      // The other direction — namespacing is opt-in sharing, not isolation by
      // accident. Login and register both use the `auth` preset on purpose.
      const first = rateLimit({ bucket: 'shared', max: 3, windowMs: 60000 });
      const second = rateLimit({ bucket: 'shared', max: 3, windowMs: 60000 });

      await first(caller(), createMockResponse(), mockNext);
      await first(caller(), createMockResponse(), mockNext);
      await second(caller(), createMockResponse(), mockNext);
      expect(mockNext).toHaveBeenCalledTimes(3);

      const res = createMockResponse();
      await second(caller(), res, mockNext);
      expect(vi.mocked(res.status)).toHaveBeenCalledWith(429);
      expect(mockNext).toHaveBeenCalledTimes(3);
    });
  });

  describe('Callers With No Resolvable IP', () => {
    // The key used to collapse to the literal 'anonymous', so one such caller
    // could exhaust every limiter for all of them. They are now spread over a
    // coarse request fingerprint — DoS-spreading only, trivially spoofable, and
    // not a throttle boundary. Both directions are pinned.
    const noIpRequest = (userAgent: string) =>
      createMockRequest({
        headers: { 'user-agent': userAgent, 'accept-language': 'en-US' },
      }) as AuthenticatedRequest;

    it('two different unidentifiable callers do not share a counter', async () => {
      const middleware = rateLimit({
        bucket: 'no-ip',
        max: 2,
        windowMs: 60000,
      });

      await middleware(
        noIpRequest('agent-one'),
        createMockResponse(),
        mockNext
      );
      await middleware(
        noIpRequest('agent-one'),
        createMockResponse(),
        mockNext
      );

      const res = createMockResponse();
      await middleware(noIpRequest('agent-two'), res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(3);
      expect(vi.mocked(res.status)).not.toHaveBeenCalledWith(429);
    });

    it('the same unidentifiable caller does share a counter', async () => {
      const middleware = rateLimit({
        bucket: 'no-ip',
        max: 2,
        windowMs: 60000,
      });

      await middleware(
        noIpRequest('agent-one'),
        createMockResponse(),
        mockNext
      );
      await middleware(
        noIpRequest('agent-one'),
        createMockResponse(),
        mockNext
      );

      const res = createMockResponse();
      await middleware(noIpRequest('agent-one'), res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(2);
      expect(vi.mocked(res.status)).toHaveBeenCalledWith(429);
    });
  });

  describe('Store Growth', () => {
    it('stays bounded when the cleanup interval never fires', async () => {
      // Serverless instances are frozen between invocations, so the 5-minute
      // interval may never run. A one-hour window with frozen fake timers means
      // nothing ever expires: the only thing that can bound the map is the cap.
      let n = 0;
      const middleware = rateLimit({
        bucket: 'growth',
        max: 5,
        windowMs: 60 * 60 * 1000,
        keyGenerator: () => `caller-${n++}`,
      });
      const req = createMockRequest() as AuthenticatedRequest;
      // A minimal response — 12k EventEmitter-backed mocks would be wasteful.
      const res = {
        setHeader: () => {},
        status: () => res,
        json: () => res,
      } as unknown as VercelResponse;

      for (let i = 0; i < 12000; i++) {
        await middleware(req, res, mockNext);
      }

      expect(n).toBe(12000);
      expect(rateLimitStoreSize()).toBeLessThanOrEqual(10000);
      expect(rateLimitStoreSize()).toBeGreaterThan(0);
    });
  });
});
