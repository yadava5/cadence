import React from "react";
import { COLORS, FONTS } from "../theme";
import { COVER } from "../content";

/**
 * WeekField — TaskFlow's cover motif. The app's own story, told as one image:
 * a plain-English sentence dissolving into typed chips (event/when/where ·
 * task/due/priority) that land on a MON–FRI week grid. "you type → it reads →
 * it files," lifted straight from the landing ParseShowcase (Welcome.tsx).
 *
 * NOT the sibling JobTracker book's envelope field, and not topographic — this
 * is native TaskFlow UI, rendered as print art. Pure HTML + inline styles on
 * the app's near-black ground with one soft emerald glow; no external assets,
 * so it is PDF-safe.
 *
 *   front — example 1, all three beats (an event → THU), joined by a thin
 *           emerald thread: the pipeline, read top to bottom.
 *   back  — the RESIDUE of example 2: the caret reset to the start with the
 *           sentence dissolving away behind it, and the task already filed
 *           on FRI. The sentence is going, not missing; no chips — the
 *           closing line ("you already said it") is the caption. Below the
 *           grid, the brand's mark is drawn at page scale: the caret falls
 *           from under the FRI column and lands on a five-beat timeline —
 *           the downbeat, closing the leaf the way the logo closes the
 *           wordmark (logos/cadence.svg, transcribed in visuals/Mark.tsx).
 */

export type WeekFieldProps = {
  widthIn: number;
  heightIn: number;
  variant: "front" | "back";
};

const DOTS = `radial-gradient(${COLORS.ON_DARK_HAIRLINE} 0.6px, transparent 0.6px)`;

const BeatLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontFamily: FONTS.MONO,
      fontSize: 9.5,
      fontWeight: 600,
      letterSpacing: "0.3em",
      textTransform: "uppercase",
      // STEEL, not STEEL_SUBTLE: measured APCA Lc -42 vs -23 on this ground.
      color: COLORS.STEEL,
    }}
  >
    {children}
  </div>
);

/** The thread between beats — a short emerald tick, the pipeline's downbeat. */
const BeatTick: React.FC = () => (
  <div
    style={{
      width: 1,
      height: 16,
      marginLeft: 2,
      marginTop: 7,
      marginBottom: 7,
      background: COLORS.EMERALD_400,
      opacity: 0.35,
    }}
  />
);

/**
 * The app's input bar.
 *
 * `spent` is the back cover's state and it is not the same as empty. An empty
 * box with a blinking caret reads as *before* anything was typed, which
 * contradicts the task already sitting filed on the week below it — the page
 * would be showing an effect with no cause. So the caret resets to the start
 * and the sentence trails off behind it, dissolving left to right: the words
 * are leaving, the task they became has stayed. It is the same dissolve the
 * front cover uses between the sentence and its chips, run to completion.
 */
const InputBar: React.FC<{ text?: string; spent?: boolean }> = ({ text, spent }) => {
  const fade =
    "linear-gradient(to right, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.34) 34%," +
    " rgba(0,0,0,0.12) 64%, rgba(0,0,0,0) 92%)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "14px 16px",
        borderRadius: 10,
        border: `1px solid ${COLORS.ON_DARK_HAIRLINE}`,
        background: COLORS.GROUND_ELEVATED,
        fontFamily: FONTS.MONO,
        fontSize: 17,
        color: COLORS.ON_DARK,
        overflow: "hidden",
      }}
    >
      <span style={{ color: COLORS.EMERALD_500 }}>&rsaquo;</span>
      {spent ? (
        <>
          <span style={{ color: COLORS.EMERALD_400 }}>&#9613;</span>
          <span
            style={{
              color: COLORS.ON_DARK,
              whiteSpace: "nowrap",
              WebkitMaskImage: fade,
              maskImage: fade,
            }}
          >
            {text}
          </span>
        </>
      ) : (
        <>
          {text ? <span>{text}</span> : null}
          <span style={{ color: COLORS.EMERALD_400 }}>&#9613;</span>
        </>
      )}
    </div>
  );
};

/** The MON–FRI week with one filed entry. */
const WeekGrid: React.FC<{
  ex: (typeof COVER.examples)[number];
  heightIn: number;
}> = ({ ex, heightIn }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      borderRadius: 10,
      border: `1px solid ${COLORS.ON_DARK_HAIRLINE}`,
      overflow: "hidden",
    }}
  >
    {COVER.days.map((day, i) => (
      <div
        key={day}
        style={{
          position: "relative",
          height: `${heightIn}in`,
          borderRight:
            i < COVER.days.length - 1 ? `1px solid rgba(247,248,248,0.06)` : "none",
        }}
      >
        <div
          style={{
            padding: "7px 0",
            textAlign: "center",
            borderBottom: `1px solid rgba(247,248,248,0.06)`,
            fontFamily: FONTS.MONO,
            fontSize: 9,
            letterSpacing: "0.2em",
            color: COLORS.STEEL_SUBTLE,
          }}
        >
          {day}
        </div>
        {ex.filed.day === i && (
          <div
            style={{
              position: "absolute",
              left: 6,
              right: 6,
              top: ex.filed.top,
              padding: "7px 9px",
              borderRadius: 7,
              border:
                ex.filed.kind === "event"
                  ? `1px solid ${COLORS.EMERALD_TINT_STRONG}`
                  : `1px dashed ${COLORS.EMERALD_TINT_STRONG}`,
              background: COLORS.EMERALD_TINT,
            }}
          >
            <div
              style={{
                fontFamily: FONTS.SANS,
                fontSize: 11,
                fontWeight: 600,
                color: COLORS.EMERALD_300,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {ex.filed.label}
            </div>
            <div
              style={{
                fontFamily: FONTS.MONO,
                fontSize: 8.5,
                // EMERALD_300 at 0.9: the old 0.7-alpha emerald measured
                // APCA Lc -39 on the tinted card; this is ~ -70.
                color: COLORS.EMERALD_300,
                opacity: 0.9,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {ex.filed.detail}
            </div>
          </div>
        )}
      </div>
    ))}
  </div>
);

export const WeekField: React.FC<WeekFieldProps> = ({ widthIn, heightIn, variant }) => {
  // *In props are reserved API knobs; the layer fills its positioned parent.
  void widthIn;
  void heightIn;

  const ex = variant === "front" ? COVER.examples[0]! : COVER.examples[1]!;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        background: COLORS.GROUND,
        overflow: "hidden",
      }}
    >
      {/* faint dotted engineering grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: DOTS,
          backgroundSize: "26px 26px",
          opacity: 0.5,
        }}
      />
      {/* the one signature glow — emerald, soft, upper area */}
      <div
        style={{
          position: "absolute",
          top: "-8%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "9in",
          height: "5in",
          background: `radial-gradient(closest-side, ${COLORS.EMERALD_GLOW}, transparent)`,
          filter: "blur(8px)",
        }}
      />

      {variant === "front" ? (
        /* Three beats in the top ~68%, joined by the emerald thread — leaves
           the lower third for the title block the cover composes over this. */
        <div
          style={{
            position: "absolute",
            top: "1.7in",
            left: "0.7in",
            right: "0.7in",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Beat 1 — you type */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <BeatLabel>you type</BeatLabel>
            <InputBar text={ex.text} />
          </div>

          <BeatTick />

          {/* Beat 2 — it reads */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <BeatLabel>it reads</BeatLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ex.chips.map(([kind, value]) => (
                <span
                  key={kind + value}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: `1px solid ${COLORS.EMERALD_TINT_STRONG}`,
                    background: COLORS.EMERALD_TINT,
                    fontFamily: FONTS.MONO,
                    fontSize: 12,
                    color: COLORS.EMERALD_300,
                  }}
                >
                  <span style={{ color: COLORS.EMERALD_500 }}>{kind}</span> {value}
                </span>
              ))}
            </div>
          </div>

          <BeatTick />

          {/* Beat 3 — it files (the MON–FRI week, tall enough to matter) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <BeatLabel>it files</BeatLabel>
            <WeekGrid ex={ex} heightIn={2.35} />
          </div>
        </div>
      ) : (
        /* Back: the residue. The caret has reset to the start and the sentence
           is trailing off behind it, spent; the task it became sits filed on
           the week. Showing the sentence leaving rather than simply absent is
           what makes the filed task read as its consequence. Below the grid the mark lands
           at page scale, so the leaf composes to its bottom edge instead of
           trailing off: the caret drops from under FRI (where the task
           filed) onto a margin-to-margin timeline whose five beats sit on
           the five column centres. */
        <>
          <div
            style={{
              position: "absolute",
              top: "1.85in",
              left: "0.7in",
              right: "0.7in",
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            <InputBar text={ex.text} spent />
            <WeekGrid ex={ex} heightIn={3.05} />
          </div>
          {/* The downbeat. The grid's bottom border lands at 5.70in (measured
              in-browser — WeekGrid's heightIn includes its header row); a
              hairline thread falls from that edge under FRI into the caret,
              which keeps the logo's own proportions (~4× logos/cadence.svg —
              wedge 27×14, stem 58) so it stays legible AS the mark, and lands
              on a margin-to-margin timeline at 7.6in. px = in × 96; column
              width 7.35in/5, FRI centre at 4.5 columns = 635px. Timeline
              ON_DARK @0.35 (measured APCA Lc -19) with beats @0.4 (Lc -24);
              @0.28 measured Lc -13 — under the invisibility floor, rejected. */}
          <svg
            aria-hidden
            style={{ position: "absolute", top: "5.7in", left: "0.7in" }}
            width={7.35 * 96}
            height={2.05 * 96}
            viewBox={`0 0 ${7.35 * 96} ${2.05 * 96}`}
            fill="none"
          >
            <g strokeLinecap="round" strokeLinejoin="round">
              {/* the fall — quiet structure, not accent */}
              <path d="M635,1 V110.4" stroke={COLORS.ON_DARK} strokeOpacity={0.35} strokeWidth={1.2} />
              {/* the timeline */}
              <path d="M0,182.4 H705.6" stroke={COLORS.ON_DARK} strokeOpacity={0.35} strokeWidth={1.2} />
              {/* MON–THU beats stay faint; FRI's beat is the emerald landing */}
              {[0, 1, 2, 3].map((i) => (
                <path
                  key={i}
                  d={`M${70.56 + 141.12 * i},177.9 V186.9`}
                  stroke={COLORS.ON_DARK}
                  strokeOpacity={0.4}
                  strokeWidth={1.3}
                />
              ))}
              {/* the caret, landing */}
              <path d="M621.5,110.4 L635,124.4 L648.5,110.4" stroke={COLORS.EMERALD_400} strokeWidth={3} />
              <path d="M635,124.4 V182.4" stroke={COLORS.EMERALD_400} strokeWidth={3} />
            </g>
          </svg>
        </>
      )}

      {/* scrim so the title block reads cleanly over the lower third */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "3.6in",
          background: `linear-gradient(to top, ${COLORS.GROUND} 20%, rgba(10,10,11,0.86) 52%, rgba(10,10,11,0) 100%)`,
        }}
      />
    </div>
  );
};
