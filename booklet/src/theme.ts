/**
 * Cadence System Card — design tokens (self-contained).
 *
 * This booklet ships standalone: every token is inlined here so
 * `cadence/booklet` builds with no external package. The palette
 * is Cadence's OWN identity, pulled verbatim from the app's landing + auth
 * surface (src/pages/Welcome.tsx): a near-black ink ground and a SINGLE emerald
 * accent. The app is deliberately monochrome-plus-one — "one signature glow —
 * emerald, soft, never a gradient wash" (Welcome.tsx:90) — so unlike the
 * sibling Applied book (four semantic accents), Cadence carries one accent
 * across all five chapters and differentiates them through the section
 * signatures and line-art, not hue.
 *
 *   Ground   #0A0A0B   the app background (Welcome.tsx:198)
 *   Panel    #0F1011   the elevated card (Welcome.tsx:95, 257)
 *   Emerald  #34D399   emerald-400 — the one accent (Welcome.tsx bg-emerald-400)
 *
 * Bright emerald rides the dark surfaces (cover, dividers, device panels);
 * EMERALD_DEEP (#059669) is its legible-on-white counterpart for eyebrows,
 * footers, and rules on the light editorial pages.
 */

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export const COLORS = {
  // Paper (light content pages)
  PAPER: "#FFFFFF",
  PAPER_WARM: "#FBFCFC",
  PAPER_ELEVATED: "#F4F6F6",
  SURFACE: "#EBEEEE",

  // Hairlines (light pages)
  HAIRLINE: "#D8DCDC",
  HAIRLINE_STRONG: "#9BA3A3",

  // Ink (primary text + the near-black full-bleed ground)
  INK: "#0A0A0B",
  INK_SOFT: "#141517",
  INK_MUTED: "rgba(10, 10, 11, 0.62)",
  INK_SUBTLE: "rgba(10, 10, 11, 0.38)",

  // On-dark inks (text over the #0A0A0B ground) — app values verbatim
  ON_DARK: "#F7F8F8",
  ON_DARK_MUTED: "rgba(247, 248, 248, 0.66)",
  ON_DARK_SUBTLE: "rgba(247, 248, 248, 0.40)",
  ON_DARK_HAIRLINE: "rgba(247, 248, 248, 0.12)",

  // Dark grounds — cover / dividers / device panels (app values verbatim)
  GROUND: "#0A0A0B",
  GROUND_ELEVATED: "#0F1011",
  GROUND_PANEL: "#141517",

  // On-dark neutral text steps from the app (Welcome.tsx)
  STEEL: "#8A8F98", // muted on dark
  STEEL_SUBTLE: "#63666C", // subtle on dark

  // ── The single accent: emerald (Tailwind emerald scale — the app's) ──
  EMERALD_300: "#6EE7B7", // chip text on dark (Welcome.tsx text-emerald-300)
  EMERALD_400: "#34D399", // PRIMARY accent — icons, dots, dividers
  EMERALD_500: "#10B981", // core
  EMERALD_600: "#059669", // deep — legible on white (editorial eyebrows/rules)
  EMERALD_700: "#047857", // deeper — fine text on white

  // ── Accent tints (fills, bands) ──
  EMERALD_TINT: "rgba(52, 211, 153, 0.10)",
  EMERALD_TINT_STRONG: "rgba(52, 211, 153, 0.16)",
  EMERALD_GLOW: "rgba(52, 211, 153, 0.06)", // the "one signature glow"

  // Status
  SUCCESS: "#059669",
  DANGER: "#E5484D",
  DANGER_TINT: "rgba(229, 72, 77, 0.08)",

  // Neutral scale
  NEUTRAL_300: "#D4D4D4",
  NEUTRAL_400: "#9CA3AF",
  NEUTRAL_500: "#6B7280",
  NEUTRAL_600: "#4B5563",
  NEUTRAL_700: "#374151",
} as const;

// ---------------------------------------------------------------------------
// Fonts — Instrument Serif + Plus Jakarta Sans + Monaspace Neon (mono).
// ---------------------------------------------------------------------------

export const FONTS = {
  SANS: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
  SERIF: '"Instrument Serif", Georgia, "Times New Roman", serif',
  MONO: '"Monaspace Neon", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

// ---------------------------------------------------------------------------
// Section color map — Cadence is single-accent, so every chapter carries the
// same emerald on the dark dividers; SECTION_INK is the legible-on-white
// emerald for content-page eyebrows and page-number footers. Chapters are
// distinguished by their signature line-art and giant numerals, not by hue —
// the deliberate house rule inherited from the app.
//
//   01 WHY     the friction of forms
//   02 HOW     the three-stage parse
//   03 INSIDE  the serverless engine room
//   04 PROOF   the receipts
//   05 BUILD   the stack + journey
// ---------------------------------------------------------------------------

export const SECTION = {
  "01_WHY": COLORS.EMERALD_400,
  "02_HOW": COLORS.EMERALD_400,
  "03_INSIDE": COLORS.EMERALD_400,
  "04_PROOF": COLORS.EMERALD_400,
  "05_BUILD": COLORS.EMERALD_400,
} as const;

export const SECTION_INK = {
  "01_WHY": COLORS.EMERALD_600,
  "02_HOW": COLORS.EMERALD_600,
  "03_INSIDE": COLORS.EMERALD_600,
  "04_PROOF": COLORS.EMERALD_600,
  "05_BUILD": COLORS.EMERALD_600,
} as const;

export type SectionKey = keyof typeof SECTION;

// ---------------------------------------------------------------------------
// Typography — sized for a held-in-hand 8.5"×11" page (px at 96 CSS DPI;
// printed pt = px ÷ 1.333). Ported from the proven booklet ladder.
// ---------------------------------------------------------------------------

export const TYPE = {
  // Display — cover title, divider numerals
  display: { size: 220, weight: 700, tracking: "-0.03em", lh: 0.92 },
  displayMedium: { size: 112, weight: 700, tracking: "-0.025em", lh: 1 },

  // Section title on divider pages (italic serif)
  sectionTitle: { size: 80, weight: 400, tracking: "0", lh: 1, italic: true },

  // Page headlines and subheads
  h1: { size: 36, weight: 700, tracking: "-0.02em", lh: 1.08 },
  h2: { size: 22, weight: 600, tracking: "-0.015em", lh: 1.2 },

  // Italic serif subheads
  subheadLarge: { size: 20, weight: 400, italic: true, lh: 1.2 },
  subheadMedium: { size: 18, weight: 400, italic: true, lh: 1.25 },
  subheadSmall: { size: 14, weight: 400, italic: true, lh: 1.3 },

  // Body
  body: { size: 11, weight: 400, tracking: "-0.005em", lh: 1.46 },

  // Pull quotes (serif italic)
  pullQuote: { size: 28, weight: 400, tracking: "0", lh: 1.25, italic: true },
  pullQuoteSmall: { size: 24, weight: 400, tracking: "0", lh: 1.25, italic: true },

  // Supporting
  caption: { size: 10, weight: 500, tracking: "0.02em", lh: 1.25 },
  mono: { size: 10, weight: 500, tracking: "0.04em", lh: 1.2 },
  pageNum: { size: 9, weight: 500, tracking: "0.04em", lh: 1 },

  // Monaspace UPPERCASE eyebrow
  eyebrow: { size: 10, weight: 500, tracking: "0.12em", lh: 1 },
  eyebrowLarge: { size: 14, weight: 500, tracking: "0.12em", lh: 1 },

  // Subtitle under divider number
  dividerSubtitle: { size: 24, weight: 400, tracking: "-0.01em", lh: 1.2 },

  // Small caps on callouts
  approvalLabel: { size: 10, weight: 600, tracking: "0.18em", lh: 1 },

  // Metric tiers — the numeric voice (mono 700, tabular)
  metricHero: { size: 92, weight: 700, tracking: "-0.03em", lh: 0.95 },
  metricLarge: { size: 60, weight: 700, tracking: "-0.02em", lh: 1 },
  metricMedium: { size: 44, weight: 700, tracking: "-0.03em", lh: 1 },
  metricSmall: { size: 30, weight: 700, tracking: "-0.02em", lh: 1 },
} as const;

// ---------------------------------------------------------------------------
// Page geometry — 8.5"×11" trim, 0.125" bleed, asymmetric margins.
// ---------------------------------------------------------------------------

export const PAGE = {
  trimW: 8.5,
  trimH: 11,
  bleedIn: 0.125,
  margin: {
    outer: 0.75,
    top: 0.875,
    bottom: 1.0,
    inner: 0.75,
  },
  grid: {
    cols: 4,
    gutterIn: 0.25,
  },
} as const;

// ---------------------------------------------------------------------------
// Card chrome
// ---------------------------------------------------------------------------

export const CARD = {
  bg: COLORS.PAPER_ELEVATED,
  border: `1px solid ${COLORS.HAIRLINE}`,
  radius: 6,
  padding: 10,
} as const;

// ---------------------------------------------------------------------------
// Color utility — hex → rgba().
// ---------------------------------------------------------------------------

export function hexWithAlpha(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
