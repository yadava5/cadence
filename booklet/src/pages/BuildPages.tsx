import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { BodyPage } from "../templates/BodyPage";
import { SourceNote } from "../primitives/SourceNote";
import { COLORS, FONTS, SECTION_INK } from "../theme";
import { BUILD, COVER } from "../content";
import { ArchLayers } from "../visuals/flows";

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

      {/* where each layer runs — the stack as three tiers */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontFamily: FONTS.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.EMERALD_600, marginBottom: 10 }}>
          one repo · three tiers
        </div>
        <ArchLayers tiers={c.archTiers} />
        <p style={{ fontFamily: FONTS.SERIF, fontStyle: "italic", fontSize: 12, lineHeight: 1.4, color: COLORS.INK_MUTED, margin: "12px 0 0", maxWidth: "6.1in" }}>
          {c.archNote}
        </p>
      </div>

      <div style={{ position: "absolute", bottom: "0.68in", left: "0.75in", right: "0.75in" }}>
        <SourceNote color={COLORS.EMERALD_700}>{c.source}</SourceNote>
      </div>
    </BodyPage>
  );
};

// ── p27 · TRY IT — the QR + live app send-off (second-to-last recto) ─────────

export const BuildClosingPage: React.FC<PageProps> = (p) => {
  const c = BUILD.closing;
  return (
    <BodyPage {...p} sectionLabel={SECTION_LABEL} sectionColor={ACCENT} eyebrow={c.eyebrow} headline="">
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
        <div style={{ fontFamily: FONTS.SERIF, fontStyle: "italic", fontSize: 62, lineHeight: 0.95, color: COLORS.INK }}>{c.headline}</div>
        <div style={{ fontFamily: FONTS.SERIF, fontStyle: "italic", fontSize: 17, lineHeight: 1.35, color: COLORS.INK_MUTED, maxWidth: "5.6in" }}>
          {c.tagline}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.9in 1fr", columnGap: "0.4in", alignItems: "start" }}>
        {/* QR on a paper card — the reader's door to the live product */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div
            style={{
              background: COLORS.PAPER,
              borderRadius: 12,
              padding: 16,
              border: `1px solid ${COLORS.HAIRLINE}`,
              boxShadow: `0 1px 6px rgba(10,10,11,0.06)`,
            }}
          >
            <QRCodeSVG value={c.qrTarget} size={148} level="M" marginSize={0} fgColor={COLORS.GROUND} />
          </div>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.EMERALD_600, textAlign: "center" }}>
            {c.qrCaption}
          </div>
          <div style={{ fontFamily: FONTS.SANS, fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.01em", color: COLORS.INK, textAlign: "center", wordBreak: "break-word" }}>
            {c.liveUrl}
          </div>
        </div>

        {/* right column — the two entry points + the seeded note */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ClosingCard label={c.liveLabel} value={c.liveUrl} arrow={c.leftArrowLabel} />
          <ClosingCard label={c.spaceLabel} value={c.spaceUrl} arrow={c.rightArrowLabel} />
          <p style={{ fontFamily: FONTS.SERIF, fontStyle: "italic", fontSize: 12.5, lineHeight: 1.4, color: COLORS.INK_MUTED, margin: 0 }}>
            {c.alsoNote}
          </p>
        </div>
      </div>

      {/* try these — the app's two real landing examples, sentence → chips */}
      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontFamily: FONTS.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.EMERALD_600 }}>
            try these
          </span>
          <span style={{ fontFamily: FONTS.SERIF, fontStyle: "italic", fontSize: 11, color: COLORS.INK_SUBTLE }}>two real sentences · type them in</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {COVER.examples.map((ex) => (
            <div
              key={ex.text}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                gap: 14,
                padding: "11px 0",
                borderTop: `0.5pt solid ${COLORS.HAIRLINE}`,
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: 11.5,
                  color: COLORS.ON_DARK,
                  background: COLORS.GROUND,
                  borderRadius: 7,
                  padding: "9px 13px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  justifySelf: "start",
                }}
              >
                <span style={{ color: COLORS.EMERALD_500 }}>&rsaquo;</span> {ex.text}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: COLORS.HAIRLINE_STRONG, fontFamily: FONTS.MONO, fontSize: 12 }}>→</span>
                <span
                  style={{
                    fontFamily: FONTS.MONO,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: COLORS.EMERALD_700,
                    border: `1px solid ${COLORS.EMERALD_TINT_STRONG}`,
                    background: COLORS.EMERALD_TINT,
                    borderRadius: 999,
                    padding: "4px 11px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ex.filed.kind} → {COVER.days[ex.filed.day]}
                </span>
              </span>
            </div>
          ))}
          <div style={{ borderTop: `0.5pt solid ${COLORS.HAIRLINE}` }} />
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          borderTop: `1pt solid ${COLORS.INK}`,
          paddingTop: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <span style={{ fontFamily: FONTS.MONO, fontSize: 9, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.EMERALD_600 }}>
          {c.microNote}
        </span>
        <span style={{ fontFamily: FONTS.SERIF, fontStyle: "italic", fontSize: 12, color: COLORS.INK_MUTED }}>turn the page to close.</span>
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
      padding: "13px 15px 11px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}
  >
    <span style={{ fontFamily: FONTS.MONO, fontSize: 8, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: COLORS.EMERALD_400 }}>{label}</span>
    <span style={{ fontFamily: FONTS.SANS, fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.01em", color: COLORS.ON_DARK, wordBreak: "break-word" }}>{value}</span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONTS.MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.STEEL }}>
      <span style={{ color: COLORS.EMERALD_400 }}>→</span> {arrow}
    </span>
  </div>
);
