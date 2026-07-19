import React from "react";
import { COLORS } from "../../theme";
import { SceneFrame, IsoSolid, makeProject } from "./primitives";

/**
 * PROOF — the receipt. An isometric test report slab: rows of ticks on its
 * face, with the running count "1,145" stamped in emerald at the foot. The
 * ticks are the single accent — every row green, nothing pending.
 */

const LINE = COLORS.ON_DARK;
const EMERALD = COLORS.EMERALD_400;

const P = makeProject(2.0, 100, 104);

const OX = -22;
const OY = -30;
const W = 44;
const D = 64;
const Z = 5;
const ROWS = 9;

export const ProofReceipt: React.FC = () => {
  const rowY = (r: number) => OY + 6 + r * ((D - 12) / (ROWS - 1));
  return (
    <SceneFrame lineColor={LINE} cornerLabels={{ topLeft: "TEST REPORT", bottomRight: "ALL GREEN" }}>
      {/* the report as a solid slab */}
      <IsoSolid P={P} origin={[OX, OY, 0]} size={[W, D, Z]} face={{ top: 0.05, left: 0.15, right: 0.09 }} strokeWidth={1.3} />

      {/* rows with emerald ticks on the top face */}
      {Array.from({ length: ROWS }).map((_, r) => {
        const tick = P(OX + 6, rowY(r), Z);
        const a = P(OX + 13, rowY(r), Z);
        const b = P(OX + W - 5, rowY(r), Z);
        return (
          <g key={r}>
            <path d={`M ${tick.sx - 2.5} ${tick.sy} l 1.8 2 l 3.6 -4.4`} fill="none" stroke={EMERALD} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
            <line x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="currentColor" strokeWidth={0.7} opacity={0.5} />
          </g>
        );
      })}

      {/* the count stamp — emerald, below the slab */}
      <g style={{ color: EMERALD }}>
        {(() => {
          const stamp = P(OX + W / 2, OY + D + 8, 0);
          return (
            <>
              <rect x={stamp.sx - 38} y={stamp.sy - 2} width={76} height={24} rx={5} fill="currentColor" fillOpacity={0.13} stroke="currentColor" strokeWidth={1.2} />
              <text x={stamp.sx} y={stamp.sy + 12} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={14} fontWeight={700} letterSpacing="-0.02em" fill="currentColor">
                1,145
              </text>
              <text x={stamp.sx} y={stamp.sy + 19.5} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={4.2} letterSpacing="1.4" fill="currentColor" opacity={0.9}>
                TESTS · GREEN
              </text>
            </>
          );
        })()}
      </g>
    </SceneFrame>
  );
};
