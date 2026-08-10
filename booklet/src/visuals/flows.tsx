import React from "react";
import { COLORS, FONTS } from "../theme";

/**
 * Flow diagrams for the System Card — the sankey-ish parse flow, the data path,
 * the 5-stage parse() timeline, the responsive breakpoint, and the three-tier
 * architecture. All print-safe SVG/flow, Cadence emerald-on-ink, honest to the
 * repo. Text lives outside clipped boxes; SVG roots are `overflow: visible`.
 */

const MONO = "ui-monospace, monospace";

// ── Parse flow — sentence → readers → resolve → typed output ────────────

export const ParseFlow: React.FC = () => {
  const W = 560;
  const H = 208;
  const inX = 96;
  const inY = 104;
  const parsers = [
    { y: 40, label: "chrono", claim: "time", prio: "p10", c: COLORS.EMERALD_500 },
    { y: 104, label: "priority", claim: "flag", prio: "p8", c: COLORS.EMERALD_600 },
    { y: 168, label: "compromise", claim: "language", prio: "p6", c: COLORS.HAIRLINE_STRONG },
  ];
  const boxL = 168;
  const boxR = 300;
  const resX = 372;
  const resW = 74;
  const outX = 470;
  const ribbon = (x1: number, y1: number, x2: number, y2: number, c: string, sw = 2) => {
    const mx = (x1 + x2) / 2;
    return <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} fill="none" stroke={c} strokeWidth={sw} strokeOpacity={0.5} strokeLinecap="round" />;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      {/* input pill */}
      <rect x={12} y={inY - 30} width={inX - 24} height={60} rx={8} fill={COLORS.GROUND} />
      <text x={12 + (inX - 24) / 2} y={inY - 12} textAnchor="middle" fontFamily={MONO} fontSize={7} letterSpacing="0.18em" fill={COLORS.STEEL_SUBTLE}>YOU TYPE</text>
      <text x={12 + (inX - 24) / 2} y={inY + 2} textAnchor="middle" fontFamily={MONO} fontSize={7.6} fill={COLORS.ON_DARK}>one plain</text>
      <text x={12 + (inX - 24) / 2} y={inY + 12} textAnchor="middle" fontFamily={MONO} fontSize={7.6} fill={COLORS.ON_DARK}>sentence</text>

      {/* input → parser ribbons */}
      {parsers.map((p) => ribbon(inX, inY, boxL, p.y, p.c))}
      {/* parser boxes */}
      {parsers.map((p) => (
        <g key={p.label}>
          <rect x={boxL} y={p.y - 18} width={boxR - boxL} height={36} rx={5} fill={COLORS.PAPER} stroke={p.c} strokeWidth={1.3} />
          <rect x={boxL} y={p.y - 18} width={4} height={36} rx={2} fill={p.c} />
          <text x={boxL + 12} y={p.y - 3} fontFamily={MONO} fontSize={8.5} fontWeight={700} fill={COLORS.INK}>{p.label}</text>
          <text x={boxL + 12} y={p.y + 9} fontFamily={MONO} fontSize={6.6} fill={COLORS.INK_MUTED}>claims {p.claim}</text>
          <text x={boxR - 8} y={p.y - 5} textAnchor="end" fontFamily={MONO} fontSize={6.4} fontWeight={700} fill={p.c}>{p.prio}</text>
        </g>
      ))}
      {/* parser → resolve ribbons */}
      {parsers.map((p) => ribbon(boxR, p.y, resX, inY, p.c))}
      {/* resolve node */}
      <rect x={resX} y={inY - 26} width={resW} height={52} rx={6} fill={COLORS.EMERALD_TINT} stroke={COLORS.EMERALD_500} strokeWidth={1.4} />
      <text x={resX + resW / 2} y={inY - 8} textAnchor="middle" fontFamily={MONO} fontSize={8} fontWeight={700} fill={COLORS.EMERALD_700}>resolve</text>
      <text x={resX + resW / 2} y={inY + 3} textAnchor="middle" fontFamily={MONO} fontSize={6} fill={COLORS.INK_MUTED}>one tag</text>
      <text x={resX + resW / 2} y={inY + 12} textAnchor="middle" fontFamily={MONO} fontSize={6} fill={COLORS.INK_MUTED}>per span</text>
      {/* resolve → output */}
      {ribbon(resX + resW, inY, outX, inY, COLORS.EMERALD_500, 2.4)}
      {/* output stack */}
      <g>
        <rect x={outX} y={inY - 34} width={W - outX - 6} height={26} rx={5} fill={COLORS.GROUND} />
        <text x={outX + 10} y={inY - 22} fontFamily={MONO} fontSize={6} letterSpacing="0.12em" fill={COLORS.STEEL_SUBTLE}>TITLE</text>
        <text x={outX + 10} y={inY - 12} fontFamily={MONO} fontSize={7.4} fill={COLORS.ON_DARK}>clean title</text>
        {["date", "time", "priority", "list"].map((t, i) => (
          <g key={t}>
            <rect x={outX + (i % 2) * 42} y={inY - 2 + Math.floor(i / 2) * 17} width={38} height={13} rx={6.5} fill="none" stroke={COLORS.EMERALD_500} strokeWidth={1} />
            <text x={outX + (i % 2) * 42 + 19} y={inY + 7 + Math.floor(i / 2) * 17} textAnchor="middle" fontFamily={MONO} fontSize={6.2} fill={COLORS.EMERALD_700}>{t}</text>
          </g>
        ))}
      </g>
    </svg>
  );
};

// ── Data path — request → pool(TLS verify) → search_path pin → table ─────────

export const DataPath: React.FC = () => {
  const nodes = [
    { label: "query", sub: "FROM tasks", kind: "plain" as const },
    { label: "pg pool", sub: "verify TLS ✓", kind: "lock" as const },
    { label: "search_path", sub: "= public", kind: "pin" as const },
    { label: "public.tasks", sub: "right tenant", kind: "db" as const },
  ];
  const W = 540;
  const H = 96;
  const boxW = 108;
  const gap = (W - boxW * nodes.length) / (nodes.length - 1);
  const y = 26;
  const bh = 44;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      {nodes.map((n, i) => {
        const x = i * (boxW + gap);
        const emerald = n.kind === "lock" || n.kind === "pin" || n.kind === "db";
        const c = emerald ? COLORS.EMERALD_500 : COLORS.HAIRLINE_STRONG;
        return (
          <g key={n.label}>
            {i < nodes.length - 1 && (
              <g>
                <line x1={x + boxW} y1={y + bh / 2} x2={x + boxW + gap} y2={y + bh / 2} stroke={COLORS.HAIRLINE_STRONG} strokeWidth={1.1} />
                <path d={`M ${x + boxW + gap - 5} ${y + bh / 2 - 3} l 5 3 l -5 3`} fill="none" stroke={COLORS.HAIRLINE_STRONG} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}
            <rect x={x} y={y} width={boxW} height={bh} rx={6} fill={emerald ? COLORS.EMERALD_TINT : COLORS.SURFACE} stroke={c} strokeWidth={1.2} />
            <text x={x + boxW / 2} y={y + 19} textAnchor="middle" fontFamily={MONO} fontSize={8.4} fontWeight={700} fill={COLORS.INK}>{n.label}</text>
            <text x={x + boxW / 2} y={y + 32} textAnchor="middle" fontFamily={MONO} fontSize={6.8} fill={emerald ? COLORS.EMERALD_700 : COLORS.INK_MUTED}>{n.sub}</text>
          </g>
        );
      })}
      <text x={0} y={H - 4} fontFamily={MONO} fontSize={6.4} fill={COLORS.INK_SUBTLE}>rejectUnauthorized: true</text>
      <text x={W} y={H - 4} textAnchor="end" fontFamily={MONO} fontSize={6.4} fill={COLORS.INK_SUBTLE}>co-tenant pooler, pinned</text>
    </svg>
  );
};

// ── 5-stage parse() timeline (numbered horizontal) ───────────────────────────

export const StageTimeline: React.FC<{ stages: readonly string[] }> = ({ stages }) => {
  const W = 540;
  const n = stages.length;
  const segW = W / n;
  const H = 62;
  const y = 20;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      <line x1={segW / 2} y1={y} x2={W - segW / 2} y2={y} stroke={COLORS.HAIRLINE_STRONG} strokeWidth={1} />
      {stages.map((s, i) => {
        const cx = segW * i + segW / 2;
        return (
          <g key={i}>
            <circle cx={cx} cy={y} r={9} fill={COLORS.EMERALD_400} />
            <text x={cx} y={y + 3.4} textAnchor="middle" fontFamily={MONO} fontSize={8} fontWeight={700} fill={COLORS.GROUND}>{i + 1}</text>
            {wrapText(s, 15).map((line, li) => (
              <text key={li} x={cx} y={y + 24 + li * 9} textAnchor="middle" fontFamily={MONO} fontSize={6.8} fill={COLORS.INK}>{line}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
};

function wrapText(s: string, max: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

// ── Responsive breakpoint threshold (viewport width axis) ─────────────────────

export const BreakpointThreshold: React.FC = () => {
  const W = 320;
  const H = 118;
  const L = 12;
  const R = W - 12;
  const bpX = L + 0.5 * (R - L); // 768 sits mid-axis, purely illustrative placement
  const axisY = 96;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      {/* left region — agenda (narrow) */}
      <rect x={L} y={14} width={bpX - L - 6} height={64} rx={5} fill={COLORS.SURFACE} stroke={COLORS.HAIRLINE} strokeWidth={0.6} />
      <text x={(L + bpX - 6) / 2} y={27} textAnchor="middle" fontFamily={MONO} fontSize={6.4} letterSpacing="0.1em" fill={COLORS.EMERALD_700}>{"< 768px · AGENDA"}</text>
      {[0, 1, 2].map((r) => (
        <g key={r}>
          <line x1={L + 8} y1={38 + r * 12} x2={bpX - 16} y2={38 + r * 12} stroke={COLORS.HAIRLINE_STRONG} strokeWidth={0.7} />
          <circle cx={L + 5} cy={38 + r * 12} r={1.6} fill={COLORS.EMERALD_500} />
        </g>
      ))}
      {/* right region — 7-col grid */}
      <rect x={bpX + 6} y={14} width={R - bpX - 6} height={64} rx={5} fill={COLORS.SURFACE} stroke={COLORS.HAIRLINE} strokeWidth={0.6} />
      <text x={(bpX + 6 + R) / 2} y={27} textAnchor="middle" fontFamily={MONO} fontSize={6.4} letterSpacing="0.1em" fill={COLORS.INK_MUTED}>{"≥ 768px · WEEK"}</text>
      {Array.from({ length: 7 }).map((_, c) => (
        <line key={c} x1={bpX + 16 + c * ((R - bpX - 28) / 7)} y1={34} x2={bpX + 16 + c * ((R - bpX - 28) / 7)} y2={72} stroke={COLORS.HAIRLINE_STRONG} strokeWidth={0.6} />
      ))}
      {/* axis + breakpoint marker */}
      <line x1={L} y1={axisY} x2={R} y2={axisY} stroke={COLORS.HAIRLINE_STRONG} strokeWidth={1} />
      <line x1={bpX} y1={12} x2={bpX} y2={axisY + 4} stroke={COLORS.EMERALD_500} strokeWidth={1.4} strokeDasharray="3 3" />
      <circle cx={bpX} cy={axisY} r={3.4} fill={COLORS.PAPER} stroke={COLORS.EMERALD_500} strokeWidth={1.8} />
      <text x={bpX} y={axisY + 15} textAnchor="middle" fontFamily={MONO} fontSize={7.4} fontWeight={700} fill={COLORS.EMERALD_700}>768px</text>
      <text x={L} y={axisY + 15} fontFamily={MONO} fontSize={6.2} fill={COLORS.INK_SUBTLE}>narrow</text>
      <text x={R} y={axisY + 15} textAnchor="end" fontFamily={MONO} fontSize={6.2} fill={COLORS.INK_SUBTLE}>wide</text>
    </svg>
  );
};

// ── Architecture tiers — where each layer runs ───────────────────────────────

export const ArchLayers: React.FC<{
  tiers: ReadonlyArray<{ zone: string; runs: string; items: readonly string[] }>;
}> = ({ tiers }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {tiers.map((t, i) => (
      <div key={t.zone} style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "0.9in 1fr auto",
              alignItems: "center",
              gap: 12,
              padding: "9px 12px",
              borderRadius: 5,
              background: i === 1 ? COLORS.EMERALD_TINT : COLORS.PAPER_ELEVATED,
              border: `0.5pt solid ${i === 1 ? COLORS.EMERALD_500 : COLORS.HAIRLINE}`,
              borderLeft: `3px solid ${COLORS.EMERALD_500}`,
            }}
          >
            <span style={{ fontFamily: FONTS.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.EMERALD_700 }}>{t.zone}</span>
            <span style={{ display: "flex", flexWrap: "wrap", gap: "3px 8px" }}>
              {t.items.map((it) => (
                <span key={it} style={{ fontFamily: FONTS.MONO, fontSize: 8, color: COLORS.INK }}>{it}</span>
              ))}
            </span>
            <span style={{ fontFamily: FONTS.SERIF, fontStyle: "italic", fontSize: 9.5, color: COLORS.INK_MUTED, whiteSpace: "nowrap" }}>{t.runs}</span>
          </div>
        </div>
      </div>
    ))}
  </div>
);
