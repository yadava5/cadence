import React, { useEffect, useRef } from 'react';

interface AuthLayoutProps {
  children: React.ReactNode;
}

/**
 * Persistent auth background and global cursor glow tracker for Login/Signup.
 * Keeps the animated gradient mounted between route transitions to avoid snaps.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let rafId: number | null = null;
    const handleMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const update = () => {
        const targets = el.querySelectorAll<HTMLElement>('.cursor-glow-border');
        targets.forEach((btn) => {
          const rect = btn.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          btn.style.setProperty('--glow-x', `${x}%`);
          btn.style.setProperty('--glow-y', `${y}%`);
        });
      };
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };
    window.addEventListener('mousemove', handleMove);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMove);
    };
  }, []);

  return (
    // `dark` forces the on-brand near-black auth surface regardless of the
    // app's chosen theme — the calendar product stays light, the entry is
    // cohesive with the rest of the portfolio.
    <div
      ref={containerRef}
      className="dark auth-gradient-bg min-h-svh w-full flex items-center justify-center p-4 sm:p-6 md:p-10"
    >
      <div className="relative z-10 flex w-full flex-col items-center">
        {/* Cadence wordmark — the caret-on-timeline logomark (mirrors
            CadenceTile in the Welcome landing) beside "cadence" in the mono
            voice, so the auth entry is cohesive with the rest of the brand. */}
        <div
          role="img"
          aria-label="Cadence"
          className="mb-8 flex select-none items-center gap-2 font-mono text-sm font-semibold tracking-tight text-white"
        >
          <svg
            width={22}
            height={22}
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
              <g>
                <path
                  d="M25.6 15.2 L29 18.6 L32.4 15.2"
                  stroke="#34d399"
                  strokeWidth="2.4"
                />
                <path d="M29 18.6 V33" stroke="#34d399" strokeWidth="2.4" />
              </g>
            </g>
          </svg>
          cadence
        </div>
        {children}
      </div>
    </div>
  );
}
