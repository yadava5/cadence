import React from "react";
import { COLORS } from "../../theme";
import { SceneFrame, IsoSolid, makeProject } from "./primitives";

/**
 * HOW — the three-stage parse. An isometric stack of three slabs — chrono,
 * priority, compromise — that one sentence falls through, top to bottom. The
 * sentence enters as a ribbon at the top and leaves as a cluster of emerald
 * chips at the bottom. The stack order is the parser's real priority order
 * (10 → 8 → 6).
 */

const LINE = COLORS.ON_DARK;
const EMERALD = COLORS.EMERALD_400;

const P = makeProject(2.35, 108, 120);

const STAGES = [
  { label: "chrono", z: 34, prio: "p10" },
  { label: "priority", z: 18, prio: "p8" },
  { label: "compromise", z: 2, prio: "p6" },
];
const W = 32;
const H = 8;

export const HowParsePipeline: React.FC = () => (
  <SceneFrame lineColor={LINE} cornerLabels={{ topLeft: "SMARTPARSER", bottomRight: "3 STAGES" }}>
    {/* incoming sentence ribbon */}
    {(() => {
      const top = P(0, 0, 60);
      const enter = P(0, 0, STAGES[0]!.z + H);
      return (
        <g>
          <rect x={top.sx - 40} y={top.sy - 12} width={80} height={15} rx={3} fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={0.9} />
          <text x={top.sx} y={top.sy - 1.5} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={6.4} letterSpacing="0.3" fill="currentColor" opacity={0.9}>
            one sentence
          </text>
          <line x1={top.sx} y1={top.sy + 3} x2={enter.sx} y2={enter.sy} stroke="currentColor" strokeWidth={1.2} opacity={0.7} />
          <circle cx={enter.sx} cy={enter.sy} r={1.6} fill="currentColor" />
        </g>
      );
    })()}

    {/* the three stage slabs */}
    {STAGES.map((s) => (
      <g key={s.label}>
        <IsoSolid P={P} origin={[-W / 2, -W / 2, s.z]} size={[W, W, H]} face={{ top: 0.16, left: 0.11, right: 0.06 }} strokeWidth={1.2} />
        {(() => {
          // Stage name left-aligned at the frame edge (clears the slabs);
          // priority tag hugs the slab's right corner.
          const label = P(-W / 2, W / 2, s.z + H / 2);
          const prio = P(W / 2, -W / 2, s.z + H / 2);
          return (
            <>
              <text x={8} y={label.sy + 2} textAnchor="start" fontFamily="ui-monospace, monospace" fontSize={7} fontWeight={700} letterSpacing="0.2" fill="currentColor">
                {s.label}
              </text>
              <text x={prio.sx + 5} y={prio.sy + 2} fontFamily="ui-monospace, monospace" fontSize={5.6} letterSpacing="0.4" fill="currentColor" opacity={0.7}>
                {s.prio}
              </text>
            </>
          );
        })()}
      </g>
    ))}

    {/* emerald chips emerging at the bottom */}
    <g style={{ color: EMERALD }}>
      {(() => {
        const out = P(0, 0, STAGES[2]!.z);
        const base = P(0, 0, -14);
        const chips = [
          { dx: -34, dy: 2, t: "event" },
          { dx: 2, dy: 12, t: "when" },
          { dx: 36, dy: 0, t: "where" },
        ];
        return (
          <>
            <line x1={out.sx} y1={out.sy} x2={base.sx} y2={base.sy} stroke="currentColor" strokeWidth={1.1} opacity={0.8} />
            {chips.map((c) => (
              <g key={c.t}>
                <rect x={base.sx + c.dx - 17} y={base.sy + c.dy - 7} width={34} height={13} rx={6.5} fill="currentColor" fillOpacity={0.16} stroke="currentColor" strokeWidth={1} />
                <text x={base.sx + c.dx} y={base.sy + c.dy + 2.4} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={5.4} letterSpacing="0.2" fill="currentColor">
                  {c.t}
                </text>
              </g>
            ))}
          </>
        );
      })()}
    </g>
  </SceneFrame>
);
