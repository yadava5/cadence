import React from "react";
import { BodyPage } from "../templates/BodyPage";
import { SourceNote } from "../primitives/SourceNote";
import { COLORS, FONTS, SECTION_INK } from "../theme";
import { BUILD } from "../content";

const SECTION_LABEL = "BUILD";
const ACCENT = SECTION_INK["05_BUILD"];

type PageProps = { parity: "recto" | "verso"; pageNumber: number; totalPages: number };

// ── p26 · the stack ─────────────────────────────────────────────────────────

export const BuildStackPage: React.FC<PageProps> = (p) => {
  const c = BUILD.stack;
  return (
    <BodyPage {...p} sectionLabel={SECTION_LABEL} sectionColor={ACCENT} eyebrow={c.eyebrow} headline={c.headline}>
      <p style={{ fontFamily: FONTS.SERIF, fontStyle: "italic", fontSize: 16, lineHeight: 1.4, color: COLORS.INK_MUTED, margin: "0 0 18px", maxWidth: "5.9in" }}>
        {c.lede}
      </p>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {c.rows.map((r) => (
          <div
            key={r.area}
            style={{
              display: "grid",
              gridTemplateColumns: "1.1in 1fr",
              gap: 16,
              alignItems: "baseline",
              padding: "12px 0",
              borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
            }}
          >
            <span style={{ fontFamily: FONTS.MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.EMERALD_600 }}>
              {r.area}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontFamily: FONTS.SANS, fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.01em", color: COLORS.INK }}>{r.tech}</span>
              <span style={{ fontFamily: FONTS.SERIF, fontStyle: "italic", fontSize: 12, color: COLORS.INK_MUTED }}>{r.note}</span>
            </div>
          </div>
        ))}
        <div style={{ borderTop: `0.5pt solid ${COLORS.HAIRLINE}` }} />
      </div>
      <div style={{ position: "absolute", bottom: "0.68in", left: "0.75in", right: "0.75in" }}>
        <SourceNote color={COLORS.EMERALD_700}>{c.source}</SourceNote>
      </div>
    </BodyPage>
  );
};

// ── p27 · closing ───────────────────────────────────────────────────────────

export const BuildClosingPage: React.FC<PageProps> = (p) => {
  const c = BUILD.closing;
  return (
    <BodyPage {...p} sectionLabel={SECTION_LABEL} sectionColor={ACCENT} eyebrow={c.eyebrow} headline="">
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
        <div style={{ fontFamily: FONTS.SERIF, fontStyle: "italic", fontSize: 84, lineHeight: 0.95, color: COLORS.INK }}>{c.headline}</div>
        <div style={{ fontFamily: FONTS.SERIF, fontStyle: "italic", fontSize: 18, lineHeight: 1.35, color: COLORS.INK_MUTED, maxWidth: "5.4in" }}>
          {c.tagline}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "0.4in", marginTop: 22 }}>
        <ClosingCard label={c.liveLabel} value={c.liveUrl} arrow={c.leftArrowLabel} />
        <ClosingCard label={c.spaceLabel} value={c.spaceUrl} arrow={c.rightArrowLabel} />
      </div>

      <div
        style={{
          marginTop: 26,
          borderTop: `1pt solid ${COLORS.INK}`,
          paddingTop: 14,
          fontFamily: FONTS.MONO,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: COLORS.EMERALD_600,
        }}
      >
        {c.microNote}
      </div>
    </BodyPage>
  );
};

const ClosingCard: React.FC<{ label: string; value: string; arrow: string }> = ({ label, value, arrow }) => (
  <div
    style={{
      background: COLORS.GROUND,
      borderRadius: 10,
      border: `1px solid ${COLORS.GROUND_ELEVATED}`,
      padding: "16px 16px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}
  >
    <span style={{ fontFamily: FONTS.MONO, fontSize: 8, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: COLORS.EMERALD_400 }}>{label}</span>
    <span style={{ fontFamily: FONTS.SANS, fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", color: COLORS.ON_DARK, wordBreak: "break-word" }}>{value}</span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONTS.MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.STEEL }}>
      <span style={{ color: COLORS.EMERALD_400 }}>→</span> {arrow}
    </span>
  </div>
);
