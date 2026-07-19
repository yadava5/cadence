import React from "react";
import { COLORS } from "../../theme";
import { SceneFrame, IsoSolid, makeProject } from "./primitives";

/**
 * INSIDE — the dispatcher. One isometric function block (emerald) fans out to a
 * lattice of small handler nodes — the "one serverless function, 32 handlers"
 * story — and drains into a database cylinder. The single bright block is the
 * catch-all; the many faint nodes are the routes it holds.
 */

const LINE = COLORS.ON_DARK;
const EMERALD = COLORS.EMERALD_400;

const P = makeProject(2.1, 92, 128);

export const InsideDispatcher: React.FC = () => {
  const dispatch = P(0, 0, 22); // top of the central block

  // Handler nodes: a 4×4 lattice up-and-right of the block (16 shown, ×32).
  const nodes: { sx: number; sy: number }[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      nodes.push(P(8 + c * 8, -26 + r * 8, 30));
    }
  }

  const dbTop = P(-6, 22, 6);
  const cx = dbTop.sx;
  const cy = dbTop.sy;
  const rx = 17;
  const ry = 6.5;
  const bh = 24;

  return (
    <SceneFrame lineColor={LINE} cornerLabels={{ topLeft: "API/INDEX.TS", bottomRight: "1 FUNCTION" }}>
      {/* fan lines dispatcher → handler nodes */}
      <g opacity={0.5}>
        {nodes.map((n, i) => (
          <line key={i} x1={dispatch.sx} y1={dispatch.sy} x2={n.sx} y2={n.sy} stroke="currentColor" strokeWidth={0.4} />
        ))}
      </g>
      {nodes.map((n, i) => (
        <rect key={i} x={n.sx - 3.4} y={n.sy - 3.4} width={6.8} height={6.8} rx={1} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeWidth={0.7} opacity={0.85} />
      ))}
      {/* ×32 tag — anchored to the right edge, growing left so it never clips */}
      <text x={202} y={44} textAnchor="end" fontFamily="ui-monospace, monospace" fontSize={9} fontWeight={700} letterSpacing="0.5" fill="currentColor">
        × 32
      </text>

      {/* database cylinder */}
      <g>
        <line x1={dispatch.sx} y1={dispatch.sy + 4} x2={cx} y2={cy - 2} stroke={EMERALD} strokeWidth={1.1} strokeDasharray="3 2" opacity={0.85} />
        <path d={`M ${cx - rx} ${cy} L ${cx - rx} ${cy + bh} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy + bh} L ${cx + rx} ${cy}`} fill="currentColor" fillOpacity={0.06} stroke="currentColor" strokeWidth={1.1} />
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="currentColor" fillOpacity={0.1} stroke="currentColor" strokeWidth={1.1} />
        <ellipse cx={cx} cy={cy + 9} rx={rx} ry={ry} fill="none" stroke="currentColor" strokeWidth={0.5} opacity={0.5} />
        <text x={cx} y={cy + bh + 14} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={6} letterSpacing="0.6" fill="currentColor" opacity={0.85}>
          POSTGRES
        </text>
      </g>

      {/* the one dispatcher block — emerald, drawn last so it sits on top */}
      <g style={{ color: EMERALD }}>
        <IsoSolid P={P} origin={[-7, -7, 10]} size={[14, 14, 12]} face={{ top: 0.3, left: 0.2, right: 0.12 }} strokeWidth={1.6} color="currentColor" />
        {(() => {
          const lbl = P(0, 7, 10);
          return (
            <text x={lbl.sx} y={lbl.sy + 12} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={6.4} fontWeight={700} letterSpacing="0.4" fill="currentColor">
              dispatch
            </text>
          );
        })()}
      </g>
    </SceneFrame>
  );
};
