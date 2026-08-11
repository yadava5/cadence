import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Command,
  Flag,
  KeyRound,
  Layers,
  Link2,
  ListChecks,
  Lock,
  ServerCog,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  parseShowcase,
  type ShowcaseChip,
  type ShowcaseParse,
} from '@/lib/showcaseParse';
import { FINALE_SENTENCES, SHOWCASE_SENTENCES } from './welcomeSentences';

/**
 * Public landing — the front door before the app. It tells one story, in five
 * beats: the FORM is the friction → so we deleted it → here's what runs when
 * you hit enter → here are the receipts → try it. It shares the dark house
 * identity of the auth surface (near-black ink, mono labels, hairline rules,
 * a single emerald accent) so landing → login → app reads as one product.
 *
 * The centrepiece is the ParseShowcase: it does not describe the parser, it
 * runs a real sentence through it. You type, it reads, it files. Every chip
 * on this page is a field the app's own parser returned for the sentence
 * shown above it, resolved in the browser at runtime, so the page cannot
 * claim a parse the product does not produce. The sentences themselves live
 * in ./welcomeSentences and are asserted against that parser in
 * src/lib/__tests__/showcaseParse.test.ts.
 *
 * The page is layered with restrained, reduced-motion-safe micro-interactions
 * — a living token→chip background, a cursor-lit signature card, magnetic CTAs,
 * count-up receipts, a decoding headline, a hidden quick-parse (press "/"), and
 * a signature finale where one sentence collapses into the Cadence mark.
 * Every flourish degrades to a clean static state under prefers-reduced-motion.
 *
 * Every number on this page is verified against the repo; nothing is invented.
 */

/* ------------------------------------------------------------------ */
/* Motion preference — read once and keep in sync. Under              */
/* prefers-reduced-motion every animated component degrades to its    */
/* final, static state so nothing important hides behind motion.      */
/* ------------------------------------------------------------------ */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    )
      return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/* ------------------------------------------------------------------ */
/* LivingBackground — the page's app-native ambient layer. Faint      */
/* plain-English tokens drift, then "parse" into little emerald chips  */
/* that settle onto a ghost week-grid. Low-alpha, cursor-reactive,     */
/* fixed behind the content. Under reduced motion it paints one static */
/* frame (grid + a few settled chips) and never animates.              */
/* ------------------------------------------------------------------ */
function LivingBackground() {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const WORDS = [
      'lunch with sam',
      'tomorrow 1pm',
      'ship the report',
      'friday',
      'p1',
      '#work',
      'standup 9am',
      'gym',
      'call mom',
      'review pr',
      'coffee 3pm',
      'dentist',
      '#home',
      'payday',
      '1:1 with lee',
      'flight 6am',
    ];
    const FONT = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const COLS = 7;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const cellCenter = () => {
      const c = Math.floor(rand(0, COLS));
      const bandTop = h * 0.16;
      const bandH = h * 0.68;
      return {
        x: (w / COLS) * c + w / COLS / 2,
        y: bandTop + rand(0.12, 0.85) * bandH,
      };
    };

    const drawGrid = () => {
      const bandTop = h * 0.16;
      const bandH = h * 0.68;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= COLS; i++) {
        const x = (w / COLS) * i;
        ctx.beginPath();
        ctx.moveTo(x, bandTop);
        ctx.lineTo(x, bandTop + bandH);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.02)';
      for (let r = 1; r < 5; r++) {
        const y = bandTop + (bandH / 5) * r;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.restore();
    };

    type Tok = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      word: string;
      state: 'drift' | 'parse' | 'chip';
      tx: number;
      ty: number;
      t: number;
    };
    const spawn = (): Tok => ({
      x: rand(0, w),
      y: rand(0, h),
      vx: rand(-0.12, 0.12),
      vy: rand(-0.05, 0.05),
      word: WORDS[(Math.random() * WORDS.length) | 0],
      state: 'drift',
      tx: 0,
      ty: 0,
      t: 0,
    });
    const N = Math.max(9, Math.min(16, Math.floor(w / 120)));
    const toks: Tok[] = Array.from({ length: N }, spawn);

    const drawChip = (t: Tok, alpha: number) => {
      ctx.font = FONT;
      const label = t.word.length > 15 ? t.word.slice(0, 15) : t.word;
      const tw = ctx.measureText(label).width;
      const padX = 6;
      const hh = 16;
      const ww = tw + padX * 2 + 8;
      const x = t.x - ww / 2;
      const y = t.y - hh / 2;
      const r = 5;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + ww, y, x + ww, y + hh, r);
      ctx.arcTo(x + ww, y + hh, x, y + hh, r);
      ctx.arcTo(x, y + hh, x, y, r);
      ctx.arcTo(x, y, x + ww, y, r);
      ctx.closePath();
      ctx.fillStyle = `rgba(16,185,129,${0.1 * alpha})`;
      ctx.strokeStyle = `rgba(52,211,153,${0.5 * alpha})`;
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgba(110,231,183,${0.9 * alpha})`;
      ctx.beginPath();
      ctx.arc(x + padX + 2, t.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(167,243,208,${0.85 * alpha})`;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + padX + 8, t.y);
    };

    let raf = 0;
    let last = performance.now();
    let parseTimer = 0;

    const frame = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      ctx.clearRect(0, 0, w, h);
      drawGrid();
      const p = pointerRef.current;

      parseTimer += dt;
      if (parseTimer > 1500) {
        parseTimer = 0;
        const cand = toks.filter((t) => t.state === 'drift');
        if (cand.length) {
          const t = cand[(Math.random() * cand.length) | 0];
          const c = cellCenter();
          t.state = 'parse';
          t.tx = c.x;
          t.ty = c.y;
          t.t = 0;
        }
      }

      ctx.font = FONT;
      ctx.textBaseline = 'middle';
      for (const t of toks) {
        if (t.state === 'drift') {
          t.x += t.vx * dt;
          t.y += t.vy * dt;
          const dx = t.x - p.x;
          const dy = t.y - p.y;
          const d2 = dx * dx + dy * dy;
          let boost = 0;
          if (d2 < 140 * 140) {
            const d = Math.sqrt(d2) || 1;
            const f = (140 - d) / 140;
            t.x += (dx / d) * f * 0.6;
            t.y += (dy / d) * f * 0.6;
            boost = f * 0.5;
          }
          if (t.x < -60) t.x = w + 40;
          if (t.x > w + 60) t.x = -40;
          if (t.y < -20) t.y = h + 20;
          if (t.y > h + 20) t.y = -20;
          ctx.fillStyle = `rgba(148,163,158,${0.06 + boost})`;
          ctx.fillText(t.word, t.x, t.y);
        } else if (t.state === 'parse') {
          t.t = Math.min(1, t.t + dt / 900);
          const e = 1 - Math.pow(1 - t.t, 3);
          const lerp = Math.min(1, (dt / 900) * 3);
          t.x += (t.tx - t.x) * lerp;
          t.y += (t.ty - t.y) * lerp;
          ctx.fillStyle = `rgba(148,163,158,${(1 - e) * 0.12})`;
          ctx.fillText(t.word, t.x, t.y);
          if (e > 0.55) drawChip(t, (e - 0.55) / 0.45);
          if (t.t >= 1) {
            t.state = 'chip';
            t.t = 0;
          }
        } else {
          t.t = Math.min(1, t.t + dt / 1400);
          drawChip(t, 1 - t.t);
          if (t.t >= 1) Object.assign(t, spawn());
        }
      }
      raf = requestAnimationFrame(frame);
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, w, h);
      drawGrid();
      ctx.font = FONT;
      ctx.textBaseline = 'middle';
      toks.slice(0, 7).forEach((t, i) => {
        if (i % 2 === 0) {
          ctx.fillStyle = 'rgba(148,163,158,0.08)';
          ctx.fillText(t.word, t.x, t.y);
        } else {
          const c = cellCenter();
          t.x = c.x;
          t.y = c.y;
          drawChip(t, 0.8);
        }
      });
    };

    const onMove = (e: MouseEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    const onLeave = () => {
      pointerRef.current = { x: -9999, y: -9999 };
    };
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else if (!reduced) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    window.addEventListener('resize', resize);
    if (reduced) {
      drawStatic();
    } else {
      window.addEventListener('mousemove', onMove, { passive: true });
      window.addEventListener('mouseleave', onLeave);
      document.addEventListener('visibilitychange', onVisibility);
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduced]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}

/* ------------------------------------------------------------------ */
/* MagneticLink — a primary CTA that leans toward the cursor and       */
/* springs back on leave. Reduced motion → a plain, still link.        */
/* ------------------------------------------------------------------ */
function MagneticLink({
  to,
  className,
  children,
  strength = 0.3,
  target,
  rel,
}: {
  to: string;
  className?: string;
  children: React.ReactNode;
  strength?: number;
  target?: string;
  rel?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const reduced = useReducedMotion();
  const raf = useRef(0);

  const onMove = (e: React.MouseEvent) => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const clamp = (v: number) => Math.max(-12, Math.min(12, v));
    const x = clamp((e.clientX - (r.left + r.width / 2)) * strength);
    const y = clamp((e.clientY - (r.top + r.height / 2)) * strength);
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.transform = `translate(${x}px, ${y - 2}px)`;
    });
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    el.style.transform = '';
  };

  return (
    <Link
      ref={ref}
      to={to}
      target={target}
      rel={rel}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn(
        'will-change-transform transition-transform duration-200 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none',
        className
      )}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* CountUp — a number that rolls up from zero the first time it        */
/* scrolls into view. Tabular numerals keep the width steady so the    */
/* count never nudges the layout. Reduced motion → the final value.    */
/* ------------------------------------------------------------------ */
function CountUp({
  to,
  thousands = false,
  suffix = '',
  duration = 1100,
}: {
  to: number;
  thousands?: boolean;
  suffix?: string;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(() => (reduced ? to : 0));
  const started = useRef(false);

  useEffect(() => {
    if (reduced) {
      setVal(to);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVal(to);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !started.current) {
          started.current = true;
          io.disconnect();
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            setVal(Math.round(eased * to));
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration, reduced]);

  const shown = thousands ? val.toLocaleString('en-US') : String(val);
  return (
    <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {shown}
      {suffix}
    </span>
  );
}

/**
 * Wraps a card title so a leading integer (e.g. "1,000+" or "34") counts up
 * on scroll-in; titles that don't start with a number render untouched.
 */
function AnimatedTitle({ title }: { title: string }) {
  const m = title.match(/^([\d,]+)(\+?)(.*)$/s);
  if (!m) return <>{title}</>;
  const to = parseInt(m[1].replace(/,/g, ''), 10);
  return (
    <>
      <CountUp to={to} thousands={m[1].includes(',')} suffix={m[2]} />
      {m[3]}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* DecodeText — a headline that scrambles then resolves the first time */
/* it scrolls into view (on-theme: a sentence settling into meaning).  */
/* The real text ships in the DOM from first paint (crawlers, reduced  */
/* motion, and screen readers always get it); the scramble is a        */
/* transient flourish layered over a size-locked box, so it never      */
/* shifts the layout.                                                  */
/* ------------------------------------------------------------------ */
function DecodeText({ text, className }: { text: string; className?: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(text);
  const played = useRef(false);

  useEffect(() => {
    if (reduced) {
      setDisplay(text);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setDisplay(text);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || played.current) return;
        played.current = true;
        io.disconnect();
        const glyphs = 'abcdefghijklmnopqrstuvwxyz';
        const start = performance.now();
        const DURATION = 900;
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / DURATION);
          const revealed = Math.floor(t * text.length);
          let out = '';
          for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (i < revealed || c === ' ' || !/[a-z]/i.test(c)) out += c;
            else out += glyphs[(Math.random() * glyphs.length) | 0];
          }
          setDisplay(out);
          if (t < 1) requestAnimationFrame(step);
          else setDisplay(text);
        };
        requestAnimationFrame(step);
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, text]);

  return (
    <span
      ref={ref}
      className={cn('relative inline-block overflow-hidden', className)}
    >
      <span aria-hidden className="invisible">
        {text}
      </span>
      <span aria-hidden className="absolute inset-0">
        {display}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* CadenceTile — the caret-on-timeline logomark, drawn inline so it can  */
/* animate. An emerald caret stands over a hairline timeline; `caretLand` */
/* plays the one-shot "downbeat" (used by the finale), while in the nav   */
/* the same beat fires on hover via CSS. Always-dark chip, one accent —   */
/* the app's house rule. Decorative: the adjacent text is the a11y name.  */
/* ------------------------------------------------------------------ */
function CadenceTile({
  px = 22,
  caretLand = false,
}: {
  px?: number;
  caretLand?: boolean;
}) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <rect
        x="0.75"
        y="0.75"
        width="46.5"
        height="46.5"
        rx="12"
        fill="#0a0a0b"
        stroke="rgba(128,128,128,0.35)"
        strokeWidth="1"
      />
      <g strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M10 33 H38"
          stroke="#f7f8f8"
          strokeOpacity="0.82"
          strokeWidth="2"
        />
        <path
          d="M15 30.5 V33"
          stroke="#f7f8f8"
          strokeOpacity="0.28"
          strokeWidth="1.5"
        />
        <path
          d="M22 30.5 V33"
          stroke="#f7f8f8"
          strokeOpacity="0.28"
          strokeWidth="1.5"
        />
        <path
          d="M36 30.5 V33"
          stroke="#f7f8f8"
          strokeOpacity="0.28"
          strokeWidth="1.5"
        />
        <g className="cad-caret" data-land={caretLand ? 'true' : undefined}>
          <path
            d="M25.6 15.2 L29 18.6 L32.4 15.2"
            stroke="#34d399"
            strokeWidth="2.4"
          />
          <path d="M29 18.6 V33" stroke="#34d399" strokeWidth="2.4" />
        </g>
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* CadenceWordmark — the site wordmark in the nav: the logomark beside    */
/* "cadence" set in the page's own mono voice. The emerald caret beats on  */
/* hover; the letters lift toward the cursor (restraint carried over from  */
/* the old mark). Reduced motion → it sits perfectly still.                */
/* ------------------------------------------------------------------ */
function CadenceWordmark() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  const onMove = (e: React.MouseEvent) => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.querySelectorAll<HTMLElement>('[data-l]').forEach((l) => {
        const r = l.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const d = Math.sqrt(dx * dx + dy * dy);
        const f = Math.max(0, 1 - d / 70);
        l.style.transform = `translateY(${(-4 * f).toFixed(2)}px)`;
        l.style.color = f > 0.05 ? `rgba(52,211,153,${0.5 + f * 0.5})` : '';
      });
    });
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    el.querySelectorAll<HTMLElement>('[data-l]').forEach((l) => {
      l.style.transform = '';
      l.style.color = '';
    });
  };

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Cadence"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="cad-mark flex select-none items-center gap-2"
    >
      <CadenceTile px={22} />
      <span
        aria-hidden
        className="font-mono text-[0.95rem] font-semibold tracking-tight text-[#f7f8f8]"
      >
        {'cadence'.split('').map((ch, i) => (
          <span key={i} data-l className="cad-letter">
            {ch}
          </span>
        ))}
      </span>
    </div>
  );
}

/** Small section eyebrow: "01 · the problem" in mono caps. */
function Eyebrow({ index, label }: { index: string; label: string }) {
  return (
    <p className="mb-4 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-[#63666c]">
      <span className="text-emerald-500/80">{index}</span> · {label}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Reveal — reduced-motion-safe scroll-in. Under prefers-reduced-motion */
/* (or without IntersectionObserver) content is shown immediately with  */
/* no transform, so nothing important hides behind an animation.        */
/* ------------------------------------------------------------------ */
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
      className={cn(
        'transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none',
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5',
        className
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ParseShowcase — the hero artifact: one sentence, three beats.        */
/* Each sentence types itself in, resolves into staggered chips, and    */
/* files a single chip onto the mini week. The card is cursor-lit       */
/* (spotlight + tilt + traveling beam-border). Under reduced motion the */
/* cycle still advances (instant swap) and everything renders in its    */
/* final state.                                                         */
/*                                                                      */
/* The chips are not written here. Each sentence is fed to the app's    */
/* own parser on mount and the beats render whatever it returns, so the */
/* page cannot claim a parse the product does not produce. Until the    */
/* parser resolves (it is imported on demand) the chip row stays empty  */
/* rather than showing a placeholder that might be wrong.               */
/* ------------------------------------------------------------------ */
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'] as const;

function ParseShowcase() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // Per-example reveal state, layered on top of the cross-fade cycle.
  const [typed, setTyped] = useState(reduced ? Infinity : 0);
  const [chipsIn, setChipsIn] = useState(reduced);
  const [filedIn, setFiledIn] = useState(reduced);

  // Filled from the real parser once it has loaded.
  const [parses, setParses] = useState<(ShowcaseParse | null)[]>(() =>
    SHOWCASE_SENTENCES.map(() => null)
  );

  useEffect(() => {
    let live = true;
    void Promise.all(SHOWCASE_SENTENCES.map(parseShowcase)).then((results) => {
      if (live) setParses(results);
    });
    return () => {
      live = false;
    };
  }, []);

  const outerRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  // The cycle — kept structurally identical to the shipped behavior so both
  // examples always advance (instantly under reduced motion, cross-faded
  // otherwise). Motion preference must never freeze the story on one example.
  useEffect(() => {
    let swapTimer: number | undefined;
    const id = window.setInterval(() => {
      if (reduced) {
        setIndex((i) => (i + 1) % SHOWCASE_SENTENCES.length);
        return;
      }
      setVisible(false);
      swapTimer = window.setTimeout(() => {
        setIndex((i) => (i + 1) % SHOWCASE_SENTENCES.length);
        setVisible(true);
      }, 260);
    }, 5200);
    return () => {
      window.clearInterval(id);
      if (swapTimer) window.clearTimeout(swapTimer);
    };
  }, [reduced]);

  // Drive the type → chips → file sequence whenever the active example changes.
  useEffect(() => {
    const text = SHOWCASE_SENTENCES[index];
    if (reduced) {
      setTyped(Infinity);
      setChipsIn(true);
      setFiledIn(true);
      return;
    }
    setTyped(0);
    setChipsIn(false);
    setFiledIn(false);
    let i = 0;
    const typer = window.setInterval(() => {
      i += 1;
      setTyped(i);
      if (i >= text.length) window.clearInterval(typer);
    }, 26);
    const chipsTimer = window.setTimeout(
      () => setChipsIn(true),
      text.length * 26 + 140
    );
    const filedTimer = window.setTimeout(
      () => setFiledIn(true),
      text.length * 26 + 140 + 4 * 80 + 260
    );
    return () => {
      window.clearInterval(typer);
      window.clearTimeout(chipsTimer);
      window.clearTimeout(filedTimer);
    };
  }, [index, reduced]);

  const onCardMove = (e: React.MouseEvent) => {
    if (reduced) return;
    const el = outerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty('--mx', `${(px * 100).toFixed(2)}%`);
      el.style.setProperty('--my', `${(py * 100).toFixed(2)}%`);
      el.style.setProperty('--ry', `${((px - 0.5) * 6).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${((0.5 - py) * 6).toFixed(2)}deg`);
    });
  };
  const onCardLeave = () => {
    const el = outerRef.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  const text = SHOWCASE_SENTENCES[index];
  const ex = parses[index];
  const shownText = typed >= text.length ? text : text.slice(0, typed);
  const typing = typed < text.length;

  return (
    <div
      ref={outerRef}
      onMouseMove={onCardMove}
      onMouseLeave={onCardLeave}
      className="tf-card group relative mx-auto w-full max-w-2xl text-left"
    >
      {/* one signature glow — emerald, soft, never a gradient wash */}
      <div
        className="pointer-events-none absolute -top-20 left-1/2 h-56 w-[34rem] -translate-x-1/2 rounded-full bg-emerald-400/[0.06] blur-3xl"
        aria-hidden
      />
      <div className="tf-tilt relative">
        <div className="tf-beam" aria-hidden />
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0f1011]">
          <div className="tf-spot" aria-hidden />
          <div className="relative">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.3em] text-[#63666c]">
                one sentence, three beats
              </span>
              <span className="font-mono text-[0.62rem] text-[#63666c]">
                live logic · the real parser
              </span>
            </div>

            <div
              className={cn(
                'px-5 py-5 transition-opacity duration-300 motion-reduce:transition-none',
                visible ? 'opacity-100' : 'opacity-0'
              )}
            >
              {/* Beat 1 — you type */}
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.3em] text-[#63666c]">
                you type
              </p>
              <p className="mt-2 min-h-[2.6rem] rounded-lg border border-white/[0.06] bg-[#0a0a0b] px-4 py-3 font-mono text-sm text-[#d6d8db]">
                <span className="mr-2 text-emerald-500/70">›</span>
                {shownText}
                <span
                  className={cn(
                    'ml-0.5 text-emerald-400 motion-reduce:animate-none',
                    typing ? '' : 'animate-pulse'
                  )}
                >
                  ▍
                </span>
              </p>

              {/* Beat 2 — it reads */}
              <p className="mt-5 font-mono text-[0.62rem] uppercase tracking-[0.3em] text-[#63666c]">
                it reads
              </p>
              <div className="mt-2 flex min-h-[2rem] flex-wrap gap-2">
                {(ex?.chips ?? []).map(([kind, value], i) => (
                  <span
                    key={kind + value}
                    style={{ transitionDelay: `${i * 80}ms` }}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 font-mono text-[0.65rem] text-emerald-300',
                      'transition-all duration-300 ease-out will-change-transform motion-reduce:transition-none',
                      'hover:-translate-y-0.5 hover:border-emerald-400/50 hover:bg-emerald-400/20',
                      chipsIn
                        ? 'opacity-100 translate-y-0 scale-100'
                        : 'opacity-0 translate-y-1 scale-95'
                    )}
                  >
                    <span className="text-emerald-500/70">{kind}</span> {value}
                  </span>
                ))}
              </div>

              {/* Beat 3 — it files */}
              <p className="mt-5 font-mono text-[0.62rem] uppercase tracking-[0.3em] text-[#63666c]">
                it files
              </p>
              <div className="mt-2 grid grid-cols-5 overflow-hidden rounded-lg border border-white/[0.06]">
                {DAYS.map((day, i) => (
                  <div
                    key={day}
                    className="group/cell relative h-28 border-r border-white/[0.05] last:border-r-0"
                  >
                    <p className="border-b border-white/[0.05] py-1.5 text-center font-mono text-[0.6rem] tracking-widest text-[#63666c]">
                      {day}
                    </p>
                    <div className="relative h-[calc(100%-1.75rem)]">
                      {ex?.filed && ex.filed.day === i && (
                        <div
                          className={cn(
                            'absolute inset-x-1 rounded-md px-1.5 py-1 transition-all duration-500 ease-out will-change-transform motion-reduce:transition-none',
                            ex.filed.kind === 'event'
                              ? 'border border-emerald-400/40 bg-emerald-400/15'
                              : 'border border-dashed border-emerald-400/40 bg-emerald-400/[0.07]',
                            filedIn
                              ? 'opacity-100 translate-y-0 scale-100'
                              : 'opacity-0 -translate-y-2 scale-95'
                          )}
                          style={{ top: ex.filed.top }}
                        >
                          <p className="flex items-center gap-1 truncate text-[0.65rem] font-medium text-emerald-200">
                            {ex.filed.kind === 'task' && (
                              <Flag className="h-2.5 w-2.5 shrink-0" />
                            )}
                            {ex.filed.label}
                          </p>
                          <p className="truncate font-mono text-[0.55rem] text-emerald-400/70">
                            {ex.filed.detail}
                          </p>
                          {/* hover-detail — the full filed record on demand */}
                          <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 hidden w-max max-w-[10rem] -translate-x-1/2 rounded-md border border-emerald-400/30 bg-[#0a0a0b] px-2 py-1.5 text-left shadow-xl group-hover/cell:block">
                            <p className="font-mono text-[0.55rem] uppercase tracking-widest text-emerald-500/80">
                              filed · {ex.filed.kind}
                            </p>
                            <p className="mt-0.5 text-[0.62rem] text-emerald-100">
                              {ex.filed.label}
                            </p>
                            <p className="font-mono text-[0.55rem] text-emerald-400/70">
                              {ex.filed.detail}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 min-h-[1rem] text-center font-mono text-[0.62rem] uppercase tracking-widest text-[#63666c]">
        {ex?.filed &&
          `no forms were opened in the making of that ${ex.filed.kind}`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* QuickParseEgg — the hidden delighter. Press "/" anywhere (outside a  */
/* field) and a quick-parse bar appears; type a plain sentence and      */
/* watch it resolve into chips live. Esc closes; focus is restored.     */
/*                                                                      */
/* It runs the app's own parser, the same one the showcase above uses.  */
/* It used to run a hand-rolled reader that recognised token shapes the */
/* product does not have (a "!high" priority, a "#work" list), so what  */
/* a visitor typed here and what the app would do with it could differ. */
/* ------------------------------------------------------------------ */
function QuickParseEgg() {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(
    'Coffee with Priya thursday 10am #catchup'
  );
  const [chips, setChips] = useState<ShowcaseChip[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Debounced so a fast typist does not queue a parse per keystroke.
  useEffect(() => {
    if (!open) return;
    if (!value.trim()) {
      setChips([]);
      return;
    }
    let live = true;
    const id = window.setTimeout(() => {
      void parseShowcase(value).then((result) => {
        if (live) setChips(result.chips);
      });
    }, 110);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [open, value]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable);
      if (!open && e.key === '/' && !typing) {
        e.preventDefault();
        restoreRef.current = document.activeElement as HTMLElement;
        setOpen(true);
      } else if (open && e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      restoreRef.current?.focus?.();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Quick parse"
      className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-10 sm:items-center sm:pb-0"
    >
      <button
        aria-label="Close quick parse"
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
      />
      <div
        className={cn(
          'relative w-full max-w-lg overflow-hidden rounded-xl border border-emerald-400/25 bg-[#0f1011] shadow-2xl',
          !reduced && 'motion-safe:animate-[tf-pop_0.2s_ease-out]'
        )}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-emerald-500/80">
            you found the quick-parse
          </span>
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-[#63666c]">
            esc to close
          </span>
        </div>
        <div className="px-4 py-4">
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#0a0a0b] px-3 py-2.5">
            <span className="font-mono text-sm text-emerald-500/70">›</span>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="Type a plain sentence…"
              className="w-full bg-transparent font-mono text-sm text-[#f7f8f8] placeholder:text-[#63666c] focus:outline-none"
            />
          </div>
          <p className="mt-4 font-mono text-[0.6rem] uppercase tracking-[0.3em] text-[#63666c]">
            it reads
          </p>
          <div className="mt-2 flex min-h-[2rem] flex-wrap gap-2">
            {chips.length === 0 ? (
              <span className="font-mono text-[0.7rem] text-[#63666c]">
                waiting for a sentence…
              </span>
            ) : (
              chips.map(([kind, val]) => (
                <span
                  key={kind + val}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 font-mono text-[0.65rem] text-emerald-300"
                >
                  <span className="text-emerald-500/70">{kind}</span> {val}
                </span>
              ))
            )}
          </div>
          <p className="mt-4 font-mono text-[0.58rem] uppercase tracking-widest text-[#63666c]">
            the app&apos;s own parser, running here
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SignatureEnding — the page's own sign-off, as a full-bleed band at   */
/* the very bottom (the AutoML-landing treatment, in Cadence's voice).  */
/* One plain sentence collapses, the Cadence mark forms on the same     */
/* downbeat, and the chip snaps onto a ghost week that runs edge to     */
/* edge and bleeds off the bottom of the page. Once filed, a calm       */
/* emerald pulse sweeps the columns — the page's resting heartbeat.     */
/* Clicking the band files ANOTHER sentence (each targets a different   */
/* day). Reduced motion shows the resolved composition, no animation.   */
/* ------------------------------------------------------------------ */
function SignatureEnding() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);
  const [runIdx, setRunIdx] = useState(0);
  const [collapse, setCollapse] = useState(reduced);
  const [snap, setSnap] = useState(reduced);
  const [mark, setMark] = useState(reduced);
  const played = useRef(reduced);
  const timers = useRef<number[]>([]);

  // The card's title, day and time come from the parser, not from a table
  // written alongside the sentence. The table used to say this sentence filed
  // a card called "Standup"; the parser titles it "Email the team" and files
  // the hashtag as a tag.
  const [parses, setParses] = useState<(ShowcaseParse | null)[]>(() =>
    FINALE_SENTENCES.map(() => null)
  );

  useEffect(() => {
    let live = true;
    void Promise.all(FINALE_SENTENCES.map(parseShowcase)).then((results) => {
      if (live) setParses(results);
    });
    return () => {
      live = false;
    };
  }, []);

  const play = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [
      window.setTimeout(() => setCollapse(true), 200),
      window.setTimeout(() => setSnap(true), 750),
      window.setTimeout(() => setMark(true), 1350),
    ];
  };

  useEffect(() => {
    if (reduced) {
      setCollapse(true);
      setSnap(true);
      setMark(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setCollapse(true);
      setSnap(true);
      setMark(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || played.current) return;
        played.current = true;
        io.disconnect();
        play();
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, [reduced]);

  const replay = () => {
    if (reduced) return; // resolved composition stays put
    played.current = true;
    setRunIdx((i) => (i + 1) % FINALE_SENTENCES.length);
    setCollapse(false);
    setSnap(false);
    setMark(false);
    play();
  };

  const sentence = FINALE_SENTENCES[runIdx];
  const filed = parses[runIdx]?.filed ?? null;

  return (
    <section className="relative border-t border-white/[0.06] bg-[#0c0c0d]">
      <button
        ref={ref}
        type="button"
        onClick={replay}
        aria-label="Cadence signature: a plain sentence files itself onto the week. Activate to file another sentence."
        className="block w-full cursor-pointer text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-400/60"
      >
        <div className="pt-20 text-center">
          <p className="mb-6 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-[#63666c]">
            <span className="text-emerald-500/80">✳</span> · the last sentence
            · click to file another
          </p>

          {/* The sentence — collapses toward the week below. */}
          <p
            key={`s-${runIdx}`}
            className={cn(
              'mx-auto max-w-xl px-6 text-center font-mono text-base text-[#8a8f98] transition-all duration-700 ease-out motion-reduce:transition-none sm:text-lg',
              collapse
                ? 'scale-95 opacity-0 [letter-spacing:-0.05em] blur-[1px]'
                : 'scale-100 opacity-100'
            )}
            aria-hidden={collapse}
          >
            <span className="text-emerald-500/60">› </span>
            {sentence}
          </p>

          {/* The mark it forms — the caret lands as the chip files. */}
          <div
            className={cn(
              'mt-8 text-center transition-all duration-700 ease-out motion-reduce:transition-none',
              mark ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
            )}
          >
            <div
              role="img"
              aria-label="Cadence"
              className="flex items-center justify-center gap-3"
            >
              <CadenceTile px={44} caretLand={mark && !reduced} />
              <span
                aria-hidden
                className="font-mono text-3xl font-semibold tracking-tight text-[#f7f8f8] sm:text-4xl"
              >
                cadence
              </span>
            </div>
            <p className="mt-4 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-[#63666c]">
              a sentence, filed. that is the whole idea.
            </p>
          </div>
        </div>

        {/* The ghost week — full bleed, edge to edge, running off the page
            bottom. The chip snaps onto the sentence's day; once it lands, a
            calm emerald pulse sweeps the columns left to right. */}
        <div className="mt-12 grid w-full grid-cols-5 border-t border-white/10 bg-[#0f1011]">
          {DAYS.map((d, i) => {
            const target = filed !== null && i === filed.day;
            return (
              <div
                key={d}
                className={cn(
                  'relative h-32 border-r border-white/[0.05] transition-colors duration-500 last:border-r-0 sm:h-40',
                  target && snap && 'bg-emerald-400/[0.04]'
                )}
              >
                <p className="border-b border-white/[0.05] py-2 text-center font-mono text-[0.6rem] tracking-widest text-[#63666c]">
                  {d}
                </p>
                {target && (
                  <div
                    key={`chip-${runIdx}`}
                    className={cn(
                      'absolute inset-x-2 top-10 rounded-md border border-emerald-400/50 bg-emerald-400/15 px-2 py-2 transition-all duration-500 will-change-transform motion-reduce:transition-none sm:inset-x-3 sm:top-12',
                      snap
                        ? 'translate-y-0 scale-100 opacity-100'
                        : '-translate-y-16 scale-110 opacity-0'
                    )}
                    style={{
                      transitionTimingFunction: snap
                        ? 'cubic-bezier(0.34, 1.56, 0.64, 1)'
                        : 'ease-out',
                    }}
                  >
                    <p className="truncate text-[0.68rem] font-medium leading-tight text-emerald-100">
                      {filed.label}
                    </p>
                    <p className="truncate font-mono text-[0.55rem] text-emerald-400/70">
                      {filed.detail}
                    </p>
                  </div>
                )}
                {/* the resting heartbeat — motion-safe only */}
                <span
                  aria-hidden
                  className="cad-colpulse pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-emerald-400/[0.09] to-transparent"
                  data-on={mark && !reduced ? 'true' : undefined}
                  style={{ ['--pd' as string]: `${i * 0.72}s` }}
                />
              </div>
            );
          })}
        </div>
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The form that the product deletes — six fields for one thought.      */
/* ------------------------------------------------------------------ */
const FORM_FIELDS = [
  'Title',
  'Date',
  'Start time',
  'End time',
  'Priority',
  'List',
] as const;

function TheForm() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="rounded-xl border border-white/10 bg-[#0f1011] p-5">
        <p className="mb-4 font-mono text-[0.62rem] uppercase tracking-[0.3em] text-[#63666c]">
          new event
        </p>
        <div className="space-y-2.5">
          {FORM_FIELDS.map((f) => (
            <div key={f} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-right font-mono text-[0.62rem] text-[#63666c]">
                {f}
              </span>
              <span className="h-8 flex-1 rounded-md border border-dashed border-white/10 bg-[#0a0a0b]" />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <span className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-[#63666c]">
            Cancel
          </span>
          <span className="rounded-md bg-white/10 px-3 py-1.5 text-xs text-[#8a8f98]">
            Save
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Implementation — the three-stage pipeline + the stack it runs on.    */
/* ------------------------------------------------------------------ */
const PIPELINE = [
  {
    stage: 'chrono',
    reads: 'the time',
    example: '“tomorrow 1pm” → a real Date',
  },
  {
    stage: 'compromise',
    reads: 'the language',
    example: '“Lunch with Sam” → title + people',
  },
  {
    stage: 'rules',
    reads: 'the priority',
    example: '“p1 #work” → priority + tag',
  },
] as const;

const STACK = [
  {
    icon: ServerCog,
    title: '36 handlers, one function',
    body: 'Every API handler ships inside a single catch-all dispatcher that routes by URL path — byte-for-byte the same handlers, no framework routing assumptions.',
  },
  {
    icon: Lock,
    title: 'Postgres over pinned TLS',
    body: 'A Supabase Postgres, reached over a CA-pinned connection with rejectUnauthorized — the certificate is verified, not trusted blindly.',
  },
  {
    icon: ShieldCheck,
    title: 'Auth that assumes attack',
    body: 'Short-lived JWTs with refresh-token rotation, strict per-IP limits on auth (5 requests / 15 min), and Google refresh tokens sealed with AES-256-GCM at rest.',
  },
] as const;

const NEW_CAPS = [
  {
    icon: Command,
    title: '⌘K command palette',
    body: 'Create, jump to a date, search events and tasks, switch view — the same parser powers quick-add, all from the keyboard.',
  },
  {
    icon: BarChart3,
    title: 'Where your week goes',
    body: 'A panel that reads your real events and shows time by calendar, per-day load, and your busiest day — computed client-side, no tracking.',
  },
  {
    icon: Link2,
    title: 'Google Calendar, read and write',
    body: 'Cadence requests one Google scope, https://www.googleapis.com/auth/calendar.events. It grants read and write on your events, never full calendar management and never Gmail. Reads pull your Google events in. Writes happen only when you schedule a meeting from Cadence: it creates the event, attaches a Google Meet link if you ask for one, and Google emails every attendee the invite.',
  },
] as const;

const RECEIPTS = [
  {
    icon: ListChecks,
    title: '1,000+ tests, green',
    body: 'Across the parser, the serverless handlers, and the React UI — correctness is run, not asserted.',
  },
  {
    icon: Lock,
    title: 'Zero third-party calls',
    body: 'The Content-Security-Policy pins connect-src to ‘self’, so the running app cannot phone home — no analytics, no CDN, no external inference.',
  },
  {
    icon: Smartphone,
    title: 'It folds to fit',
    body: 'On a phone the seven-column week becomes a readable agenda instead of cramming seven columns into a palm.',
  },
  {
    icon: KeyRound,
    title: 'A week that persists',
    body: 'Real accounts are real: the demo user keeps its seeded week between visits, on the same Postgres the app runs on.',
  },
] as const;

/* ------------------------------------------------------------------ */

export default function WelcomePage() {
  return (
    <div className="dark relative min-h-screen overflow-x-clip bg-[#0a0a0b] text-[#d6d8db]">
      <LivingBackground />
      <QuickParseEgg />

      <div className="relative z-10">
        {/* Nav */}
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0a0a0b]/80 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
            <CadenceWordmark />
            <nav className="flex items-center gap-2">
              <Link
                to="/login"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#d6d8db] transition-colors hover:border-white/25 hover:text-white"
              >
                Sign in
              </Link>
            </nav>
          </div>
        </header>

        {/* Hero */}
        <section className="relative mx-auto w-full max-w-6xl px-6 pb-20 pt-16 text-center sm:pt-24">
          <Reveal>
            <p className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/10 px-4 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-[#8a8f98]">
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                aria-hidden
              />
              calendar · tasks · plain-english NLP
            </p>
          </Reveal>
          <Reveal delay={60}>
            <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight text-[#f7f8f8] sm:text-6xl">
              Type it the way you’d say it.
              <span className="block text-[#8a8f98]">
                It lands where it belongs.
              </span>
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[#8a8f98]">
              One plain sentence becomes an event on the calendar, a task in its
              list, a priority set, a conflict caught — filed by a parser that
              shows its work.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <MagneticLink
                to="/login"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[#f7f8f8] px-6 py-3 font-medium text-[#0a0a0b]"
              >
                Try the live demo <ArrowRight className="h-4 w-4" />
              </MagneticLink>
            </div>
            <p className="mt-4 font-mono text-[0.65rem] uppercase tracking-widest text-[#63666c]">
              demo account · john@example.com / password123 · seeded with a real
              week
            </p>
          </Reveal>
        </section>

        {/* 01 — The problem */}
        <section className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <Eyebrow index="01" label="the problem" />
              <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-[#f7f8f8] sm:text-4xl">
                The form is the friction.
              </h2>
              <p className="mt-5 max-w-md text-base leading-relaxed text-[#8a8f98]">
                Open any calendar and it hands you the same paperwork: a title,
                a date, a start, an end, a priority, a list. Six fields to write
                down a single thought. You came to schedule one lunch — and
                filled out a form to do it.
              </p>
              <p className="mt-4 max-w-md text-base leading-relaxed text-[#d6d8db]">
                The calendar was never the friction.{' '}
                <span className="text-emerald-300">The form is.</span>
              </p>
            </Reveal>
            <Reveal delay={100}>
              <TheForm />
            </Reveal>
          </div>
        </section>

        {/* 02 — The solution (+ ParseShowcase) */}
        <section className="border-y border-white/[0.06] bg-[#0c0c0d]">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <Reveal className="text-center">
              <Eyebrow index="02" label="the solution" />
              <h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-[#f7f8f8] sm:text-4xl">
                So we deleted the form.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#8a8f98]">
                Type the thought the way you’d text it to a friend. A parser
                with three NLP readers (explicit #hashtags matched separately)
                reads the time, the language, and the priority, shows you
                exactly what it understood, then files it — event or task — on
                the week. No dialog. No fields. One line.
              </p>
            </Reveal>
            <Reveal delay={120} className="mt-12">
              <ParseShowcase />
            </Reveal>
          </div>
        </section>

        {/* 03 — Under the hood */}
        <section className="mx-auto w-full max-w-6xl px-6 py-20">
          <Reveal>
            <Eyebrow index="03" label="under the hood" />
            <h2 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-[#f7f8f8] sm:text-4xl">
              What runs the moment you hit enter.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[#8a8f98]">
              The magic is a pipeline you can read. Three parsing stages hand
              off in order — each one catching a different part of your
              sentence; explicit #hashtags are matched separately.
            </p>
          </Reveal>

          {/* The pipeline */}
          <Reveal delay={80} className="mt-10">
            <ol className="grid gap-4 sm:grid-cols-3">
              {PIPELINE.map((p, i) => (
                <li
                  key={p.stage}
                  className="relative rounded-xl border border-white/10 bg-[#0f1011] p-6"
                >
                  <span className="font-mono text-[0.62rem] uppercase tracking-[0.3em] text-emerald-500/80">
                    stage {i + 1}
                  </span>
                  <p className="mt-3 font-mono text-lg font-semibold text-[#f7f8f8]">
                    {p.stage}
                  </p>
                  <p className="mt-1 text-sm text-[#8a8f98]">reads {p.reads}</p>
                  <p className="mt-4 rounded-md border border-white/[0.06] bg-[#0a0a0b] px-3 py-2 font-mono text-[0.7rem] text-emerald-300/90">
                    {p.example}
                  </p>
                  {i < PIPELINE.length - 1 && (
                    <ArrowRight
                      className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-white/15 sm:block"
                      aria-hidden
                    />
                  )}
                </li>
              ))}
            </ol>
          </Reveal>

          {/* The stack it runs on */}
          <Reveal delay={40} className="mt-14">
            <p className="mb-4 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-[#63666c]">
              and the stack it files into
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {STACK.map((s) => (
                <div
                  key={s.title}
                  className="rounded-xl border border-white/10 bg-[#0f1011] p-6"
                >
                  <s.icon className="h-5 w-5 text-emerald-400" />
                  <h3 className="mt-4 font-semibold text-[#f7f8f8]">
                    <AnimatedTitle title={s.title} />
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#8a8f98]">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Newest surface area */}
          <Reveal delay={40} className="mt-10">
            <p className="mb-4 flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-[#63666c]">
              <Layers className="h-3.5 w-3.5 text-emerald-500/80" /> and, newly,
              three ways in
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {NEW_CAPS.map((c) => (
                <div
                  key={c.title}
                  className="rounded-xl border border-white/10 bg-[#0f1011] p-6"
                >
                  <c.icon className="h-5 w-5 text-emerald-400" />
                  <h3 className="mt-4 font-semibold text-[#f7f8f8]">
                    {c.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#8a8f98]">
                    {c.body}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* 04 — The receipts */}
        <section className="border-t border-white/[0.06] bg-[#0c0c0d]">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <Reveal>
              <Eyebrow index="04" label="the receipts" />
              <h2 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-[#f7f8f8] sm:text-4xl">
                Proof, not promises.
              </h2>
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {RECEIPTS.map((r, i) => (
                <Reveal delay={i * 60} key={r.title}>
                  <div className="flex h-full gap-4 rounded-xl border border-white/10 bg-[#0f1011] p-6">
                    <r.icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                    <div>
                      <h3 className="font-semibold text-[#f7f8f8]">
                        <AnimatedTitle title={r.title} />
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-[#8a8f98]">
                        {r.body}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* 05 — Try it */}
        <section className="mx-auto w-full max-w-6xl px-6 py-24 text-center">
          <Reveal>
            <Eyebrow index="05" label="try it" />
            <h2 className="mx-auto max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-[#f7f8f8] sm:text-5xl">
              <DecodeText text="Watch a sentence become your week." />
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-[#8a8f98]">
              The demo is the real app on real Postgres — sign in, type a plain
              sentence, and watch it file itself. Then read exactly how it
              works.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <MagneticLink
                to="/login"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 font-medium text-[#052e1b]"
              >
                <CalendarClock className="h-4 w-4" /> Try the live demo
              </MagneticLink>
            </div>
            <p className="mt-4 font-mono text-[0.65rem] uppercase tracking-widest text-[#63666c]">
              john@example.com / password123
            </p>
          </Reveal>
        </section>

        <footer className="mx-auto w-full max-w-6xl border-t border-white/10 px-6 py-8 text-center">
          <p className="font-mono text-[0.6rem] uppercase tracking-widest text-[#4a4d53]">
            psst — press <span className="text-emerald-500/70">/</span> to parse
            a sentence
          </p>
          <p className="mt-3 font-mono text-[0.65rem] uppercase tracking-widest text-[#63666c]">
            Cadence · calendar &amp; tasks, in plain English · by Ayush Yadav
          </p>
          <a
            href="/system-card"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block font-mono text-[0.65rem] uppercase tracking-widest text-[#63666c] underline-offset-4 transition-colors hover:text-[#8a8f98] hover:underline"
          >
            System Card
          </a>
        </footer>

        {/* Signature finale — the page's last image, full bleed at the very
            bottom, below the footer meta (AutoML-landing style). */}
        <SignatureEnding />
      </div>
    </div>
  );
}
