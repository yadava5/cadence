import React from "react";
import { COLORS, FONTS } from "../theme";

/**
 * Chart vocabulary for the System Card — a deliberately VARIED, print-safe set
 * so the booklet proves its points without leaning on the bar chart. Every
 * figure is pure SVG/flow layout (no animation, no external asset), sized for
 * the 8.5×11 page, and drawn in Cadence's one-accent language: emerald for the
 * product/primary series, neutral ink/steel for reference series.
 *
 * HONESTY: every number rendered here traces to content.ts / the repo. Nothing
 * is invented to fill space — the shapes add structure and legibility only.
 *
 * CLIPPING: text never sits inside an `overflow: hidden` box; SVG roots use
 * `overflow: visible`; axis/label geometry is computed with margins so nothing
 * collides at export size.
 */

// ── shared figure chrome ─────────────────────────────────────────────────────

const FIG_CARD: React.CSSProperties = {
  border: `0.5pt solid ${COLORS.HAIRLINE}`,
  borderRadius: 6,
  background: COLORS.PAPER_ELEVATED,
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 9,
};

export const FigureCard: React.FC<{
  label: string;
  source?: string;
  caption?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ label, source, caption, children, style }) => (
  <div style={{ ...FIG_CARD, ...style }}>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
      <span
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 8.5,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: COLORS.EMERALD_600,
        }}
      >
        {label}
      </span>
      {source && <span style={{ fontFamily: FONTS.MONO, fontSize: 7, color: COLORS.INK_SUBTLE }}>{source}</span>}
    </div>
    {children}
    {caption && (
      <div style={{ fontFamily: FONTS.SERIF, fontStyle: "italic", fontSize: 10.5, lineHeight: 1.35, color: COLORS.INK_MUTED }}>
        {caption}
      </div>
    )}
  </div>
);

const Legend: React.FC<{ items: ReadonlyArray<{ color: string; label: string; swatch?: "square" | "dot" | "line" | "hollow" }> }> = ({ items }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 14px" }}>
    {items.map((it) => (
      <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: FONTS.MONO, fontSize: 7.5, letterSpacing: "0.04em", color: COLORS.INK_MUTED }}>
        {it.swatch === "line" ? (
          <span style={{ width: 11, height: 2, background: it.color, borderRadius: 2 }} />
        ) : it.swatch === "hollow" ? (
          <span style={{ width: 8, height: 8, borderRadius: 2, border: `1.2px solid ${it.color}` }} />
        ) : it.swatch === "dot" ? (
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: it.color }} />
        ) : (
          <span style={{ width: 8, height: 8, borderRadius: 2, background: it.color }} />
        )}
        {it.label}
      </span>
    ))}
  </div>
);

// ── 1 · Waffle / unit (dot) chart ────────────────────────────────────────────

export const Waffle: React.FC<{
  total: number;
  cols: number;
  segments: ReadonlyArray<{ count: number; color: string; label: string; hollow?: boolean }>;
  cell?: number;
  gap?: number;
  showLegend?: boolean;
}> = ({ total, cols, segments, cell = 13, gap = 4, showLegend = true }) => {
  // Assign each cell index to a segment, in order.
  const fill: Array<{ color: string; hollow?: boolean } | null> = Array(total).fill(null);
  let idx = 0;
  for (const seg of segments) {
    for (let k = 0; k < seg.count && idx < total; k++, idx++) fill[idx] = { color: seg.color, hollow: seg.hollow };
  }
  const rows = Math.ceil(total / cols);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <svg
        width={cols * cell + (cols - 1) * gap}
        height={rows * cell + (rows - 1) * gap}
        viewBox={`0 0 ${cols * cell + (cols - 1) * gap} ${rows * cell + (rows - 1) * gap}`}
        style={{ display: "block", overflow: "visible", maxWidth: "100%" }}
      >
        {Array.from({ length: total }).map((_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const f = fill[i];
          const x = c * (cell + gap);
          const y = r * (cell + gap);
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={cell}
              height={cell}
              rx={2.5}
              fill={f && !f.hollow ? f.color : "none"}
              stroke={f ? f.color : COLORS.HAIRLINE}
              strokeWidth={f?.hollow ? 1.2 : 0.6}
              fillOpacity={f && !f.hollow ? 1 : 1}
            />
          );
        })}
      </svg>
      {showLegend && <Legend items={segments.map((s) => ({ color: s.color, label: s.label, swatch: s.hollow ? "hollow" : "square" }))} />}
    </div>
  );
};

// ── 2 · Lollipop / dot plot on a shared value axis ───────────────────────────

export const Lollipop: React.FC<{
  rows: ReadonlyArray<{ label: string; value: number; sub?: string; highlight?: boolean }>;
  min: number;
  max: number;
  ticks: number[];
  format?: (v: number) => string;
  labelW?: number;
  height?: number;
}> = ({ rows, min, max, ticks, format = (v) => `${v}`, labelW = 92, height }) => {
  const W = 320;
  const plotL = labelW;
  const plotR = W - 30;
  const rowH = 22;
  const H = height ?? rows.length * rowH + 22;
  const x = (v: number) => plotL + ((v - min) / (max - min)) * (plotR - plotL);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      {/* gridlines + tick labels */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} y1={6} x2={x(t)} y2={H - 14} stroke={COLORS.HAIRLINE} strokeWidth={0.5} />
          <text x={x(t)} y={H - 4} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={6.6} fill={COLORS.INK_SUBTLE}>
            {format(t)}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const cy = 14 + i * rowH;
        const c = r.highlight ? COLORS.EMERALD_500 : COLORS.HAIRLINE_STRONG;
        const dot = r.highlight ? COLORS.EMERALD_500 : COLORS.INK_SOFT;
        return (
          <g key={r.label}>
            <text x={plotL - 8} y={cy + 2.5} textAnchor="end" fontFamily="ui-monospace, monospace" fontSize={8} fontWeight={r.highlight ? 700 : 500} fill={COLORS.INK}>
              {r.label}
            </text>
            {r.sub && (
              <text x={plotL - 8} y={cy + 11} textAnchor="end" fontFamily="ui-monospace, monospace" fontSize={6} fill={COLORS.INK_SUBTLE}>
                {r.sub}
              </text>
            )}
            <line x1={plotL} y1={cy} x2={x(r.value)} y2={cy} stroke={c} strokeWidth={r.highlight ? 2 : 1.2} />
            <circle cx={x(r.value)} cy={cy} r={r.highlight ? 4.2 : 3.2} fill={dot} />
            <text x={x(r.value) + 8} y={cy + 2.5} fontFamily="ui-monospace, monospace" fontSize={7.5} fontWeight={700} fill={r.highlight ? COLORS.EMERALD_700 : COLORS.INK_MUTED}>
              {format(r.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// ── 3 · Donut (proportion) ───────────────────────────────────────────────────

export const Donut: React.FC<{
  segments: ReadonlyArray<{ value: number; color: string; label: string }>;
  size?: number;
  thickness?: number;
  centerValue?: string;
  centerSub?: string;
}> = ({ segments, size = 118, thickness = 20, centerValue, centerSub }) => {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", overflow: "visible", flexShrink: 0 }}>
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {segments.map((s) => {
            const frac = s.value / total;
            const dash = frac * circ;
            const el = (
              <circle
                key={s.label}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </g>
        {centerValue && (
          <text x={cx} y={cy - 1} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={20} fontWeight={700} letterSpacing="-0.02em" fill={COLORS.INK}>
            {centerValue}
          </text>
        )}
        {centerSub && (
          <text x={cx} y={cy + 11} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={6.2} letterSpacing="0.1em" fill={COLORS.INK_SUBTLE}>
            {centerSub}
          </text>
        )}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0, transform: "translateY(1px)" }} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: FONTS.MONO, fontSize: 12, fontWeight: 700, color: COLORS.INK, fontVariantNumeric: "tabular-nums" }}>
                {s.value.toLocaleString()}
              </span>
              <span style={{ fontFamily: FONTS.MONO, fontSize: 7, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.INK_MUTED }}>{s.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── 4 · Heat matrix (directive × source) ─────────────────────────────────────

export const HeatMatrix: React.FC<{
  cols: readonly string[];
  rows: ReadonlyArray<{ label: string; cells: readonly boolean[] }>;
  onColor?: string;
}> = ({ cols, rows, onColor = COLORS.EMERALD_400 }) => {
  const labelW = 96;
  const cellW = 46;
  const cellH = 17;
  const headH = 40;
  const W = labelW + cols.length * cellW;
  const H = headH + rows.length * cellH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      {/* column headers — rotated so they never collide */}
      {cols.map((c, ci) => {
        const cx = labelW + ci * cellW + cellW / 2;
        return (
          <text
            key={c}
            x={cx}
            y={headH - 6}
            transform={`rotate(-32 ${cx} ${headH - 6})`}
            textAnchor="start"
            fontFamily="ui-monospace, monospace"
            fontSize={6.6}
            fill={COLORS.INK_MUTED}
          >
            {c}
          </text>
        );
      })}
      {rows.map((row, ri) => {
        const y = headH + ri * cellH;
        return (
          <g key={row.label}>
            <text x={labelW - 8} y={y + cellH / 2 + 2.4} textAnchor="end" fontFamily="ui-monospace, monospace" fontSize={7.2} fill={COLORS.INK}>
              {row.label}
            </text>
            {row.cells.map((on, ci) => {
              const x = labelW + ci * cellW;
              return (
                <g key={ci}>
                  <rect x={x + 3} y={y + 2} width={cellW - 6} height={cellH - 4} rx={2.5} fill={on ? onColor : "none"} fillOpacity={on ? 0.9 : 1} stroke={on ? onColor : COLORS.HAIRLINE} strokeWidth={0.6} />
                  {on && (
                    <path d={`M ${x + cellW / 2 - 3} ${y + cellH / 2} l 2 2.4 l 4 -5`} fill="none" stroke={COLORS.GROUND} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
};

// ── 5 · Log time axis (durations / lifetimes) ────────────────────────────────

export const LogTimeAxis: React.FC<{
  /** markers in minutes */
  markers: ReadonlyArray<{ minutes: number; label: string; sub?: string; color?: string; above?: boolean }>;
  minMinutes?: number;
  maxMinutes?: number;
  ticks: ReadonlyArray<{ minutes: number; label: string }>;
}> = ({ markers, minMinutes = 1, maxMinutes = 43200, ticks }) => {
  const W = 320;
  const H = 78;
  const axisY = 44;
  const L = 14;
  const R = W - 14;
  const lmin = Math.log10(minMinutes);
  const lmax = Math.log10(maxMinutes);
  const x = (m: number) => L + ((Math.log10(m) - lmin) / (lmax - lmin)) * (R - L);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      <line x1={L} y1={axisY} x2={R} y2={axisY} stroke={COLORS.HAIRLINE_STRONG} strokeWidth={1} />
      {ticks.map((t) => (
        <g key={t.label}>
          <line x1={x(t.minutes)} y1={axisY - 3} x2={x(t.minutes)} y2={axisY + 3} stroke={COLORS.HAIRLINE_STRONG} strokeWidth={0.7} />
          <text x={x(t.minutes)} y={axisY + 13} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={6.2} fill={COLORS.INK_SUBTLE}>
            {t.label}
          </text>
        </g>
      ))}
      {markers.map((mk) => {
        const mx = x(mk.minutes);
        const c = mk.color ?? COLORS.EMERALD_500;
        const above = mk.above ?? true;
        const ly = above ? axisY - 12 : axisY + 24;
        return (
          <g key={mk.label}>
            <line x1={mx} y1={above ? ly : axisY} x2={mx} y2={above ? axisY : ly} stroke={c} strokeWidth={1.2} />
            <circle cx={mx} cy={axisY} r={3.4} fill={COLORS.PAPER} stroke={c} strokeWidth={1.8} />
            <text x={mx} y={above ? ly - 8 : ly + 6} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={7.4} fontWeight={700} fill={c}>
              {mk.label}
            </text>
            {mk.sub && (
              <text x={mx} y={above ? ly - 1 : ly + 13} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={5.6} fill={COLORS.INK_SUBTLE}>
                {mk.sub}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

// ── 6 · Bullet / gauge (used vs cap) ─────────────────────────────────────────

export const Bullet: React.FC<{
  min: number;
  max: number;
  value: number;
  cap: { at: number; label: string };
  valueLabel: string;
  ticks?: number[];
}> = ({ min, max, value, cap, valueLabel, ticks = [] }) => {
  const W = 320;
  const H = 52;
  const L = 8;
  const R = W - 8;
  const barY = 20;
  const barH = 14;
  const x = (v: number) => L + ((v - min) / (max - min)) * (R - L);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      {/* track */}
      <rect x={L} y={barY} width={R - L} height={barH} rx={4} fill={COLORS.SURFACE} stroke={COLORS.HAIRLINE} strokeWidth={0.5} />
      {/* value fill */}
      <rect x={L} y={barY} width={Math.max(x(value) - L, 5)} height={barH} rx={4} fill={COLORS.EMERALD_400} />
      {/* cap line */}
      <line x1={x(cap.at)} y1={barY - 5} x2={x(cap.at)} y2={barY + barH + 5} stroke={COLORS.DANGER} strokeWidth={1.6} />
      <text x={x(cap.at)} y={barY - 8} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={6.6} fontWeight={700} fill={COLORS.DANGER}>
        {cap.label}
      </text>
      {/* value label */}
      <text x={x(value) + 8} y={barY + barH / 2 + 2.6} fontFamily="ui-monospace, monospace" fontSize={7.4} fontWeight={700} fill={COLORS.EMERALD_700}>
        {valueLabel}
      </text>
      {ticks.map((t) => (
        <text key={t} x={x(t)} y={barY + barH + 13} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={6} fill={COLORS.INK_SUBTLE}>
          {t}
        </text>
      ))}
    </svg>
  );
};

// ── 7 · Priority ladder (ranked rungs) ───────────────────────────────────────

export const PriorityLadder: React.FC<{
  rungs: ReadonlyArray<{ label: string; value: number; sub?: string; highlight?: boolean }>;
  max: number;
}> = ({ rungs, max }) => {
  const W = 300;
  const rowH = 30;
  const H = rungs.length * rowH + 6;
  const L = 74;
  const R = W - 34;
  const w = (v: number) => ((v / max) * (R - L));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      {rungs.map((r, i) => {
        const y = 6 + i * rowH;
        const c = r.highlight ? COLORS.EMERALD_400 : COLORS.SURFACE;
        const stroke = r.highlight ? COLORS.EMERALD_500 : COLORS.HAIRLINE_STRONG;
        return (
          <g key={r.label}>
            <text x={L - 10} y={y + 12} textAnchor="end" fontFamily="ui-monospace, monospace" fontSize={8.5} fontWeight={r.highlight ? 700 : 600} fill={COLORS.INK}>
              {r.label}
            </text>
            {r.sub && (
              <text x={L - 10} y={y + 21} textAnchor="end" fontFamily="ui-monospace, monospace" fontSize={5.8} fill={COLORS.INK_SUBTLE}>
                {r.sub}
              </text>
            )}
            {/* rung block */}
            <rect x={L} y={y} width={w(r.value)} height={18} rx={3} fill={c} stroke={stroke} strokeWidth={0.8} />
            <text x={L + w(r.value) - 8} y={y + 12.5} textAnchor="end" fontFamily="ui-monospace, monospace" fontSize={8} fontWeight={700} fill={r.highlight ? COLORS.GROUND : COLORS.INK_MUTED}>
              {r.value}
            </text>
            {/* rung side rails */}
            <line x1={L + w(r.value) + 5} y1={y + 9} x2={R + 6} y2={y + 9} stroke={COLORS.HAIRLINE} strokeWidth={0.5} strokeDasharray="2 3" />
          </g>
        );
      })}
    </svg>
  );
};

// ── 8 · Span map (a sentence with per-parser claim bars) ─────────────────────

type Span = { text: string; parser?: "chrono" | "priority" | "compromise"; tag?: string };

const SPAN_COLOR: Record<string, string> = {
  chrono: COLORS.EMERALD_500,
  priority: COLORS.EMERALD_700,
  compromise: COLORS.HAIRLINE_STRONG,
};

export const SpanMap: React.FC<{ tokens: ReadonlyArray<Span> }> = ({ tokens }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "12px 7px", padding: "2px 0 4px" }}>
      {tokens.map((tk, i) => {
        const c = tk.parser ? SPAN_COLOR[tk.parser] : undefined;
        return (
          <span key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontFamily: FONTS.MONO, fontSize: 10.5, color: tk.parser ? COLORS.INK : COLORS.INK_SUBTLE, fontWeight: tk.parser ? 600 : 400 }}>{tk.text}</span>
            <span style={{ width: "100%", height: 3, borderRadius: 2, background: c ?? "transparent" }} />
            <span style={{ fontFamily: FONTS.MONO, fontSize: 5.6, letterSpacing: "0.08em", textTransform: "uppercase", color: c ?? "transparent", height: 7 }}>{tk.tag ?? ""}</span>
          </span>
        );
      })}
    </div>
  </div>
);

// ── 9 · Horizontal process ribbon (compact flow) ─────────────────────────────

export const ProcessRibbon: React.FC<{
  steps: ReadonlyArray<{ label: string; sub?: string }>;
  accent?: string;
}> = ({ steps, accent = COLORS.EMERALD_500 }) => (
  <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
    {steps.map((s, i) => (
      <React.Fragment key={s.label}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: accent, flexShrink: 0 }} />
            <span style={{ fontFamily: FONTS.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.INK }}>{s.label}</span>
          </div>
          {s.sub && <span style={{ fontFamily: FONTS.MONO, fontSize: 6.6, color: COLORS.INK_MUTED, paddingLeft: 13 }}>{s.sub}</span>}
        </div>
        {i < steps.length - 1 && (
          <span style={{ display: "flex", alignItems: "flex-start", paddingTop: 1, color: COLORS.HAIRLINE_STRONG, fontFamily: FONTS.MONO, fontSize: 11, margin: "0 4px" }}>→</span>
        )}
      </React.Fragment>
    ))}
  </div>
);

export { Legend };
