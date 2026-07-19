import React from "react";
import { COLORS } from "../../theme";
import { SceneFrame, IsoSolid, Marker, makeProject } from "./primitives";

/**
 * BUILD — the journey. An isometric ground plate with a raised emerald ribbon
 * threading four stations — type → parse → dispatch → persist — from a sentence
 * marker at the back to a database cylinder at the front. The whole pipeline as
 * one continuous run across the plate.
 */

const LINE = COLORS.ON_DARK;
const EMERALD = COLORS.EMERALD_400;

const P = makeProject(1.95, 104, 128);

const poly = (pts: { sx: number; sy: number }[]) => pts.map((p) => `${p.sx.toFixed(2)},${p.sy.toFixed(2)}`).join(" ");

const stations: { x: number; y: number; label: string }[] = [
  { x: -24, y: -24, label: "type" },
  { x: -8, y: -8, label: "parse" },
  { x: 8, y: 8, label: "dispatch" },
  { x: 24, y: 24, label: "persist" },
];

export const BuildJourney: React.FC = () => {
  // ground plate corners
  const g0 = P(-36, -36, 0);
  const g1 = P(36, -36, 0);
  const g2 = P(36, 36, 0);
  const g3 = P(-36, 36, 0);

  return (
    <SceneFrame lineColor={LINE} cornerLabels={{ topLeft: "PIPELINE", bottomRight: "SHIP" }}>
      {/* ground plate + grid */}
      <polygon points={poly([g0, g1, g2, g3])} fill="currentColor" fillOpacity={0.04} stroke="currentColor" strokeWidth={1.0} strokeLinejoin="round" />
      {Array.from({ length: 5 }).map((_, i) => {
        const t = ((i + 1) / 6) * 72 - 36;
        const a = P(t, -36, 0);
        const b = P(t, 36, 0);
        const c = P(-36, t, 0);
        const d = P(36, t, 0);
        return (
          <g key={i} opacity={0.28}>
            <line x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="currentColor" strokeWidth={0.4} />
            <line x1={c.sx} y1={c.sy} x2={d.sx} y2={d.sy} stroke="currentColor" strokeWidth={0.4} />
          </g>
        );
      })}

      {/* emerald ribbon connecting the stations */}
      <g style={{ color: EMERALD }}>
        {(() => {
          const pts = stations.map((s) => P(s.x, s.y, 6));
          const dPath = `M ${pts[0]!.sx} ${pts[0]!.sy} ` + pts.slice(1).map((p) => `L ${p.sx} ${p.sy}`).join(" ");
          return <path d={dPath} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" opacity={0.9} />;
        })()}
      </g>

      {/* sentence marker at the back */}
      {(() => {
        const s = P(stations[0]!.x, stations[0]!.y, 16);
        return (
          <g>
            <rect x={s.sx - 30} y={s.sy - 9} width={60} height={14} rx={3} fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={0.9} />
            <text x={s.sx} y={s.sy - 0.4} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={5.6} letterSpacing="0.3" fill="currentColor" opacity={0.9}>
              a sentence
            </text>
          </g>
        );
      })()}

      {/* station cubes (first three) */}
      {stations.slice(0, 3).map((s, i) => (
        <g key={s.label}>
          <IsoSolid P={P} origin={[s.x - 3.5, s.y - 3.5, 0]} size={[7, 7, 6]} face={{ top: 0.22, left: 0.13, right: 0.08 }} strokeWidth={1.1} />
          {(() => {
            const lbl = P(s.x, s.y + 4.5, 6);
            return (
              <text x={lbl.sx} y={lbl.sy + 10} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={5.4} letterSpacing="0.3" fontWeight={600} fill="currentColor">
                {s.label}
              </text>
            );
          })()}
          {i === 1 && <Marker at={[P(s.x, s.y, 6).sx, P(s.x, s.y, 6).sy]} kind="ring" size={1.8} />}
        </g>
      ))}

      {/* persist → database cylinder at the front */}
      {(() => {
        const c = P(stations[3]!.x, stations[3]!.y, 0);
        const cx = c.sx;
        const cy = c.sy - 8;
        const rx = 15;
        const ry = 5.5;
        const bh = 20;
        return (
          <g>
            <path d={`M ${cx - rx} ${cy} L ${cx - rx} ${cy + bh} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy + bh} L ${cx + rx} ${cy}`} fill="currentColor" fillOpacity={0.06} stroke="currentColor" strokeWidth={1.0} />
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={EMERALD} fillOpacity={0.14} stroke="currentColor" strokeWidth={1.0} />
            <text x={cx} y={cy + bh + 12} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={5.4} letterSpacing="0.4" fontWeight={600} fill="currentColor">
              persist
            </text>
          </g>
        );
      })()}
    </SceneFrame>
  );
};
