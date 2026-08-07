import React from "react";
import { COLORS } from "../theme";

/**
 * CadenceMark — the app's mark (logos/cadence.svg), hand-transcribed as inline
 * SVG so the print/PDF path never fetches an asset. The geometry is the tile
 * glyph verbatim — a caret landing on a timeline, three faint beats — but the
 * always-dark app chip is DROPPED: its #0A0A0B fill IS the cover ground, so on
 * these pages the tile would read as an empty outline. Every colour is
 * resolved from theme.ts (no currentColor, no prefers-color-scheme):
 * timeline ON_DARK @0.82 (measured APCA Lc -76 on GROUND), beats @0.40
 * (Lc -24 — above the Lc 15 invisibility floor; @0.28 measured -13 and was
 * rejected), caret EMERALD_400 (Lc -66).
 */
export const CadenceMark: React.FC<{
  /** Rendered glyph height in px; width follows the 30:20.4 crop. */
  height: number;
  style?: React.CSSProperties;
}> = ({ height, style }) => (
  <svg
    aria-hidden
    width={(height * 30) / 20.4}
    height={height}
    viewBox="9 13.8 30 20.4"
    fill="none"
    style={style}
  >
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* timeline */}
      <path d="M10,33 H38" stroke={COLORS.ON_DARK} strokeOpacity={0.82} strokeWidth={2} />
      {/* faint beats */}
      <path d="M15,30.5 V33" stroke={COLORS.ON_DARK} strokeOpacity={0.4} strokeWidth={1.5} />
      <path d="M22,30.5 V33" stroke={COLORS.ON_DARK} strokeOpacity={0.4} strokeWidth={1.5} />
      <path d="M36,30.5 V33" stroke={COLORS.ON_DARK} strokeOpacity={0.4} strokeWidth={1.5} />
      {/* the downbeat: a caret that lands on the timeline */}
      <path d="M25.6,15.2 L29,18.6 L32.4,15.2" stroke={COLORS.EMERALD_400} strokeWidth={2.4} />
      <path d="M29,18.6 V33" stroke={COLORS.EMERALD_400} strokeWidth={2.4} />
    </g>
  </svg>
);
