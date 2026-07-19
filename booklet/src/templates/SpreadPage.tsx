import React from 'react';
import { Page } from '../primitives/Page';
import { Eyebrow } from '../primitives/Eyebrow';
import { COLORS, FONTS, SECTION, SECTION_INK, type SectionKey } from '../theme';
import { BUILD } from '../content';

/** Live area = trim height minus the top/bottom content margins. */
const LIVE_HEIGHT = `calc(11in - 0.875in - 1in)`;

/**
 * BUILD spread (pages 24 / 25) — the end-to-end journey read across the gutter.
 * Left half: type → parse → resolve. Right half: resolve → dispatch → persist.
 * The RESOLVE stage is repeated as the hinge so the two halves read as one
 * continuous ribbon once bound.
 */
export type SpreadPageProps = {
  half: 'left' | 'right';
  parity: 'recto' | 'verso';
  pageNumber: number;
  totalPages: number;
  sectionLabel: string;
  sectionColor: string;
};

const HINGE = 'RESOLVE';

/** Per-stage detail — a plain-language "what happens" and where it runs.
 *  Derived from BUILD.pipeline sub-copy + the HOW/INSIDE chapters; nothing new. */
const STAGE_DETAIL: Record<string, { does: string; where: string }> = {
  TYPE: {
    does: 'You type one plain sentence into the smart input — no dialog, no fields to tab through.',
    where: 'client · smart-input',
  },
  PARSE: {
    does: 'chrono, priority, and compromise each run over the line, claiming the spans they understand.',
    where: 'client · SmartParser.ts',
  },
  RESOLVE: {
    does: 'The resolver keeps one tag per span — highest priority, then confidence — and the reading appears as chips.',
    where: 'client · resolve',
  },
  DISPATCH: {
    does: 'The chosen record posts through one Vercel function that routes all 32 handlers by URL path.',
    where: 'one function · api/index.ts',
  },
  PERSIST: {
    does: 'Written to Supabase Postgres over CA-pinned TLS, then rendered back onto the week.',
    where: 'Postgres · pinned TLS',
  },
};

export const SpreadPage: React.FC<SpreadPageProps> = ({
  half,
  parity,
  pageNumber,
  totalPages,
  sectionLabel,
  sectionColor,
}) => {
  const { pipeline } = BUILD;
  const stages =
    half === 'left' ? pipeline.stages.slice(0, 3) : pipeline.stages.slice(2, 5);
  const headline =
    half === 'left' ? pipeline.headlineLeft : pipeline.headlineRight;
  const sub = half === 'left' ? pipeline.subLeft : pipeline.subRight;

  return (
    <Page
      parity={parity}
      pageNumber={pageNumber}
      totalPages={totalPages}
      sectionLabel={sectionLabel}
      sectionColor={sectionColor}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: LIVE_HEIGHT,
        }}
      >
        <Eyebrow color={SECTION_INK['05_BUILD']} style={{ marginBottom: 6 }}>
          {half === 'left' ? pipeline.eyebrowLeft : pipeline.eyebrowRight}
        </Eyebrow>

        <div style={{ textAlign: half === 'right' ? 'right' : 'left' }}>
          <h1
            style={{
              fontFamily: FONTS.SANS,
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              color: COLORS.INK,
              margin: 0,
            }}
          >
            {headline}
          </h1>
          <p
            style={{
              fontFamily: FONTS.SERIF,
              fontStyle: 'italic',
              fontSize: 14,
              lineHeight: 1.4,
              color: COLORS.INK_MUTED,
              margin: '6px 0 0',
              maxWidth: '5.4in',
              marginLeft: half === 'right' ? 'auto' : 0,
            }}
          >
            {sub}
          </p>
        </div>

        {/* Ribbon fills the live area; the connectors grow to distribute the
            three stage cards evenly from the header down to the foot note. */}
        <div
          style={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            paddingTop: 20,
            paddingBottom: '1.55in',
          }}
        >
          {stages.map((s, i) => {
            const accent = SECTION[s.accentKey as SectionKey];
            const bridge = s.label === HINGE;
            const d = STAGE_DETAIL[s.label];
            return (
              <React.Fragment key={s.label}>
                <StageCard
                  n={s.n}
                  label={s.label}
                  detail={s.detail}
                  accent={accent}
                  bridge={bridge}
                  does={d?.does}
                  where={d?.where}
                />
                {i < stages.length - 1 && <Connector />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Foot — the wire note (left) or ship targets (right) */}
      <div
        style={{
          position: 'absolute',
          left: '0.75in',
          right: '0.75in',
          bottom: '1.2in',
        }}
      >
        {half === 'left' ? (
          <div
            style={{
              borderTop: `1pt solid ${COLORS.INK}`,
              paddingTop: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span
              style={{
                fontFamily: FONTS.MONO,
                fontSize: 8.5,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: SECTION_INK['05_BUILD'],
                whiteSpace: 'nowrap',
              }}
            >
              on the wire
            </span>
            <span
              style={{
                fontFamily: FONTS.SERIF,
                fontStyle: 'italic',
                fontSize: 13,
                color: COLORS.INK,
                lineHeight: 1.35,
              }}
            >
              {BUILD.pipeline.registry}
            </span>
          </div>
        ) : (
          <div
            style={{
              borderTop: `1pt solid ${COLORS.INK}`,
              paddingTop: 12,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 16,
              fontFamily: FONTS.MONO,
              fontSize: 8.5,
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: COLORS.INK_MUTED,
            }}
          >
            <span style={{ color: COLORS.EMERALD_600 }}>
              {BUILD.closing.liveUrl}
            </span>
            <span>·</span>
            <span style={{ color: COLORS.INK_MUTED }}>
              {BUILD.closing.spaceUrl}
            </span>
          </div>
        )}
      </div>

      {/* gutter continuity marker — sits in the clear band between the foot
          note (bottom 1.2in) and the page-number footer (bottom 0.5in) so it
          never collides with the section label. */}
      <div
        style={{
          position: 'absolute',
          bottom: '0.86in',
          [half === 'left' ? 'right' : 'left']: '0.75in',
          fontFamily: FONTS.MONO,
          fontSize: 8,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: SECTION_INK['05_BUILD'],
        }}
      >
        {half === 'left'
          ? 'the journey continues →'
          : '← resolve bridges the fold'}
      </div>
    </Page>
  );
};

const StageCard: React.FC<{
  n: string;
  label: string;
  detail: string;
  accent: string;
  bridge: boolean;
  does?: string;
  where?: string;
}> = ({ n, label, detail, accent, bridge, does, where }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 14,
      border: `0.5pt solid ${bridge ? accent : COLORS.HAIRLINE}`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 5,
      background: bridge ? COLORS.EMERALD_TINT : COLORS.PAPER_ELEVATED,
      padding: '14px 16px',
    }}
  >
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: '50%',
        background: accent,
        color: COLORS.GROUND,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONTS.MONO,
        fontSize: 15,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {n}
    </div>
    <div style={{ flex: 1 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              fontFamily: FONTS.SANS,
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: COLORS.INK,
            }}
          >
            {label}
          </span>
          {bridge && (
            <span
              style={{
                fontFamily: FONTS.MONO,
                fontSize: 7.5,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: accent,
              }}
            >
              the hinge
            </span>
          )}
        </div>
        {where && (
          <span
            style={{
              fontFamily: FONTS.MONO,
              fontSize: 7.5,
              letterSpacing: '0.04em',
              color: COLORS.INK_SUBTLE,
              whiteSpace: 'nowrap',
            }}
          >
            {where}
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: FONTS.MONO,
          fontSize: 9,
          color: COLORS.INK_MUTED,
          marginTop: 2,
        }}
      >
        {detail}
      </div>
      {does && (
        <div
          style={{
            fontFamily: FONTS.SERIF,
            fontStyle: 'italic',
            fontSize: 11.5,
            lineHeight: 1.35,
            color: COLORS.INK,
            marginTop: 7,
          }}
        >
          {does}
        </div>
      )}
    </div>
  </div>
);

/** A vertical link between stage cards that GROWS to fill the slack, so the
 *  three cards distribute evenly down the page instead of clustering. */
const Connector: React.FC = () => (
  <div
    style={{
      flexGrow: 1,
      minHeight: 26,
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
    aria-hidden
  >
    <span
      style={{
        position: 'absolute',
        top: 4,
        bottom: 4,
        width: 1.5,
        background: COLORS.HAIRLINE_STRONG,
      }}
    />
    <span
      style={{
        position: 'relative',
        background: COLORS.PAPER,
        color: COLORS.HAIRLINE_STRONG,
        fontSize: 15,
        lineHeight: 1,
        padding: '3px 0',
      }}
    >
      ↓
    </span>
  </div>
);
