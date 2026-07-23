import React from "react";
import { COLORS, FONTS, PAGE } from "../theme";
import { BRAND, COVER, MASTHEAD } from "../content";
import { WeekField } from "../visuals/WeekField";

/**
 * Front cover (page 01). A full-bleed near-black field carrying the app's own
 * story — a plain sentence resolving into typed chips that land on a MON–FRI
 * week (WeekField) — with a title block lower-left over a scrim and a vertical
 * mono margin callout. The one accent is emerald; the wordmark is the app's
 * `cadence`, closed by the emerald caret that is the brand's downbeat.
 */
export const CoverPage: React.FC = () => (
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
    <WeekField widthIn={8.75} heightIn={11.25} variant="front" />

    {/* Masthead — top-left */}
    <div
      style={{
        position: "absolute",
        top: "0.7in",
        left: "0.7in",
        fontFamily: FONTS.MONO,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: COLORS.ON_DARK_MUTED,
      }}
    >
      {COVER.masthead}
    </div>

    {/* Beats pill — top-right, seeds the "three beats" idea up front. */}
    <div
      style={{
        position: "absolute",
        top: "0.62in",
        right: "0.62in",
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "7px 13px",
        borderRadius: 999,
        background: "rgba(15, 16, 17, 0.72)",
        border: `0.5pt solid ${COLORS.ON_DARK_HAIRLINE}`,
      }}
    >
      {["you type", "it reads", "it files"].map((l, i) => (
        <React.Fragment key={l}>
          {i > 0 && <span style={{ color: COLORS.STEEL_SUBTLE }}>·</span>}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontFamily: FONTS.MONO,
              fontSize: 8,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: COLORS.ON_DARK,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.EMERALD_400 }} />
            {l}
          </span>
        </React.Fragment>
      ))}
    </div>

    {/* Vertical margin callout — right edge */}
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
        color: COLORS.ON_DARK_SUBTLE,
      }}
    >
      calendar &amp; tasks, in plain English
    </div>

    {/* Title block — lower-left */}
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
          display: "flex",
          alignItems: "baseline",
          fontFamily: FONTS.MONO,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.04em",
          color: COLORS.ON_DARK_MUTED,
        }}
      >
        {COVER.wordmark}
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
          fontFamily: FONTS.SANS,
          fontSize: 80,
          fontWeight: 700,
          letterSpacing: "-0.035em",
          lineHeight: 0.92,
          color: COLORS.ON_DARK,
        }}
      >
        Cad<span style={{ color: COLORS.EMERALD_400 }}>ence</span>
      </div>
      <div
        style={{
          fontFamily: FONTS.SERIF,
          fontStyle: "italic",
          fontSize: 23,
          lineHeight: 1.22,
          color: COLORS.ON_DARK_MUTED,
          maxWidth: "5.4in",
        }}
      >
        {BRAND.subtitle}
      </div>
      <div
        style={{
          marginTop: 6,
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: FONTS.MONO,
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: COLORS.ON_DARK,
        }}
      >
        <span>
          {BRAND.author} · {BRAND.year}
        </span>
        <span style={{ width: 28, height: 1, background: COLORS.ON_DARK_HAIRLINE }} />
        <span style={{ color: COLORS.ON_DARK_SUBTLE }}>{MASTHEAD.volume}</span>
      </div>
    </div>
  </section>
);
