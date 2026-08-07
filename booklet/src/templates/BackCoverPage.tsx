import React from "react";
import { COLORS, FONTS, PAGE } from "../theme";
import { BACK_COVER } from "../content";
import { WeekField } from "../visuals/WeekField";
import { CadenceMark } from "../visuals/Mark";

/**
 * Back cover (page 28) — a PURE CLOSING that ANSWERS the front cover rather
 * than repeating it. The field is the RESIDUE of the cover's motif (variant
 * "back"): an empty prompt with a resting caret and the second example's task
 * already filed on FRI — the sentence is gone, which is exactly what the
 * closing line says. Below the grid the field draws the brand's downbeat at
 * page scale (see WeekField), so the leaf reads composed to its bottom edge:
 * prompt → week → caret falling onto the timeline → closing line. The app's
 * mark also stands over the colophon upper-left as the printer's device.
 * No QR, no live URL, no CTA — the Try-It page (27) sends the reader to the
 * product; this page just closes the book.
 */
export const BackCoverPage: React.FC = () => (
  <section
    className="page"
    data-bleed="true"
    style={{
      background: COLORS.GROUND,
      color: COLORS.ON_DARK,
      position: "relative",
      overflow: "hidden",
    }}
  >
    <WeekField widthIn={8.75} heightIn={11.25} variant="back" />

    {/* Colophon — upper-left (mirrors the cover masthead), the mark standing
        over it as the printer's device */}
    <div
      style={{
        position: "absolute",
        top: "0.66in",
        left: "0.7in",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <CadenceMark height={24} />
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: COLORS.ON_DARK_MUTED,
          lineHeight: 1.7,
        }}
      >
        {BACK_COVER.colophon.map((line, i) => (
          <React.Fragment key={i}>
            {line}
            <br />
          </React.Fragment>
        ))}
      </div>
    </div>

    {/* fin marker — top-right, mirrors the cover's beats pill position */}
    <div
      style={{
        position: "absolute",
        top: "0.66in",
        right: "0.66in",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 13px",
        borderRadius: 999,
        background: "rgba(15, 16, 17, 0.72)",
        border: `0.5pt solid ${COLORS.ON_DARK_HAIRLINE}`,
        fontFamily: FONTS.MONO,
        fontSize: 8,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: COLORS.ON_DARK,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.EMERALD_400 }} />
      {BACK_COVER.fin}
    </div>

    {/* Vertical margin callout — right edge (mirrors the cover). MUTED, not
        SUBTLE: measured APCA Lc -24 for SUBTLE on this ground vs -54. */}
    <div
      style={{
        position: "absolute",
        right: "0.4in",
        bottom: `${PAGE.margin.bottom}in`,
        writingMode: "vertical-rl",
        fontFamily: FONTS.MONO,
        fontSize: 8.5,
        fontWeight: 500,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: COLORS.ON_DARK_MUTED,
      }}
    >
      {BACK_COVER.marginNote}
    </div>

    {/* Closing block — lower-left, mirrors the cover title block but quiet */}
    <div
      style={{
        position: "absolute",
        left: "0.7in",
        bottom: "0.95in",
        right: "0.7in",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.04em",
          color: COLORS.ON_DARK_MUTED,
        }}
      >
        {BACK_COVER.wordmark}
        <span
          style={{
            display: "inline-block",
            width: 2,
            height: 11,
            marginLeft: 3,
            borderRadius: 1,
            background: COLORS.EMERALD_400,
            transform: "translateY(1px)",
          }}
        />
      </div>
      <div
        style={{
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: 46,
          lineHeight: 1.08,
          letterSpacing: "-0.01em",
          color: COLORS.ON_DARK,
          maxWidth: "6.2in",
        }}
      >
        {BACK_COVER.closingLine}
      </div>
      <div
        style={{
          marginTop: 4,
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: FONTS.MONO,
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: COLORS.ON_DARK_MUTED,
        }}
      >
        <span style={{ width: 28, height: 1, background: COLORS.ON_DARK_HAIRLINE }} />
        <span>{BACK_COVER.title} · end</span>
      </div>
    </div>
  </section>
);
