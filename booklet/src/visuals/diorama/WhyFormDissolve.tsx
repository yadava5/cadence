import React from "react";
import { COLORS } from "../../theme";
import { SceneFrame, IsoSolid, makeProject } from "./primitives";

/**
 * WHY — the form dissolving. An isometric "New Event" modal slab with a stack
 * of empty field rows on its face; the top field lifts off and resolves into a
 * single emerald sentence chip that flies up and away — the six boxes
 * collapsing into one line you type.
 *
 * Near-white linework; emerald is the single accent — it marks only the
 * escaping sentence.
 */

const LINE = COLORS.ON_DARK;
const EMERALD = COLORS.EMERALD_400;

const P = makeProject(2.0, 104, 122);

const OX = -30;
const OY = -22;
const W = 60;
const D = 44;
const Z = 6;
const ROWS = 6;

export const WhyFormDissolve: React.FC = () => {
  const rowY = (r: number) => OY + 5 + r * ((D - 9) / (ROWS - 1));
  return (
    <SceneFrame lineColor={LINE} cornerLabels={{ topLeft: "NEW EVENT", bottomRight: "THE FORM" }}>
      {/* the modal as a solid slab */}
      <IsoSolid P={P} origin={[OX, OY, 0]} size={[W, D, Z]} face={{ top: 0.05, left: 0.16, right: 0.1 }} strokeWidth={1.3} />

      {/* field rows on the top face (z = Z) */}
      {Array.from({ length: ROWS }).map((_, r) => {
        const a = P(OX + 4, rowY(r), Z);
        const b = P(OX + W - 4, rowY(r), Z);
        const title = r === 0;
        return (
          <g key={r}>
            <line x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="currentColor" strokeWidth={title ? 1.3 : 0.7} opacity={title ? 0.9 : 0.5} />
            <circle cx={a.sx} cy={a.sy} r={1.3} fill="currentColor" opacity={0.7} />
          </g>
        );
      })}
      {/* "6 fields" bracket down the right edge */}
      {(() => {
        const t = P(OX + W, OY + 2, Z);
        const b = P(OX + W, OY + D - 2, Z);
        const mid = P(OX + W, OY + D / 2, Z);
        return (
          <g opacity={0.55}>
            <line x1={t.sx + 5} y1={t.sy} x2={b.sx + 5} y2={b.sy} stroke="currentColor" strokeWidth={0.5} strokeDasharray="3 2" />
            <text x={mid.sx + 9} y={mid.sy + 2} fontFamily="ui-monospace, monospace" fontSize={5.4} letterSpacing="0.4" fill="currentColor">
              6 fields
            </text>
          </g>
        );
      })()}

      {/* the escaping sentence — an emerald chip lifting off the top field */}
      <g style={{ color: EMERALD }}>
        {(() => {
          const start = P(OX + W / 2, rowY(0), Z);
          const chipCx = 150;
          const chipCy = 40;
          const cw = 80;
          const ch = 18;
          return (
            <>
              <path
                d={`M ${start.sx} ${start.sy} Q ${(start.sx + chipCx) / 2 + 6} ${(start.sy + chipCy) / 2 - 26} ${chipCx - cw / 2 + 4} ${chipCy}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.85}
              />
              <circle cx={start.sx} cy={start.sy} r={1.8} fill="currentColor" />
              <rect x={chipCx - cw / 2} y={chipCy - ch / 2} width={cw} height={ch} rx={ch / 2} fill="currentColor" fillOpacity={0.15} stroke="currentColor" strokeWidth={1.2} />
              <text x={chipCx} y={chipCy + 2.6} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={6.6} letterSpacing="0.2" fill="currentColor">
                lunch tomorrow 1pm
              </text>
              <text x={chipCx} y={chipCy + 16} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={4.6} letterSpacing="1" fill="currentColor" opacity={0.9}>
                ONE SENTENCE
              </text>
            </>
          );
        })()}
      </g>
    </SceneFrame>
  );
};
