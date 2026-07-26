import React from 'react';
import { BodyPage } from '../templates/BodyPage';
import { StatBig } from '../primitives/StatBig';
import { SourceNote } from '../primitives/SourceNote';
import { COLORS, FONTS, SECTION_INK } from '../theme';
import { INSIDE } from '../content';
import { FigureCard, Waffle, Bullet, LogTimeAxis } from '../visuals/charts';
import { DataPath } from '../visuals/flows';

const SECTION_LABEL = 'INSIDE';
const ACCENT = SECTION_INK['03_INSIDE'];

type PageProps = {
  parity: 'recto' | 'verso';
  pageNumber: number;
  totalPages: number;
};
type Fact = { k: string; v: string };

const Para: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p
    style={{
      fontFamily: FONTS.SANS,
      fontSize: 11,
      lineHeight: 1.5,
      letterSpacing: '-0.005em',
      color: COLORS.INK,
      margin: 0,
    }}
  >
    {children}
  </p>
);

const Lede: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p
    style={{
      fontFamily: FONTS.SERIF,
      fontStyle: 'italic',
      fontSize: 16,
      lineHeight: 1.4,
      color: COLORS.INK_MUTED,
      margin: '0 0 16px',
      maxWidth: '5.9in',
    }}
  >
    {children}
  </p>
);

const HonestNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      marginTop: 16,
      borderLeft: `2px solid ${COLORS.EMERALD_400}`,
      paddingLeft: 12,
      fontFamily: FONTS.SERIF,
      fontStyle: 'italic',
      fontSize: 12.5,
      lineHeight: 1.4,
      color: COLORS.INK,
    }}
  >
    {children}
  </div>
);

/** The dark app-panel fact grid — 2×2 k/v pairs on the near-black ground. */
const FactGrid: React.FC<{ facts: readonly Fact[] }> = ({ facts }) => (
  <div
    style={{
      background: COLORS.GROUND,
      borderRadius: 8,
      border: `1px solid ${COLORS.GROUND_ELEVATED}`,
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      overflow: 'hidden',
    }}
  >
    {facts.map((f, i) => (
      <div
        key={f.k}
        style={{
          padding: '12px 13px',
          borderRight:
            i % 2 === 0 ? `1px solid ${COLORS.ON_DARK_HAIRLINE}` : 'none',
          borderTop: i >= 2 ? `1px solid ${COLORS.ON_DARK_HAIRLINE}` : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}
      >
        <span
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 7.5,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: COLORS.EMERALD_400,
          }}
        >
          {f.k}
        </span>
        <span
          style={{
            fontFamily: FONTS.MONO,
            fontSize: 9,
            lineHeight: 1.35,
            color: COLORS.ON_DARK,
          }}
        >
          {f.v}
        </span>
      </div>
    ))}
  </div>
);

const SourceRail: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      position: 'absolute',
      bottom: '0.68in',
      left: '0.75in',
      right: '0.75in',
    }}
  >
    <SourceNote color={COLORS.EMERALD_700}>{children}</SourceNote>
  </div>
);

// ── p15 · the dispatcher ────────────────────────────────────────────────────

export const InsideDispatchPage: React.FC<PageProps> = (p) => {
  const c = INSIDE.dispatch;
  return (
    <BodyPage
      {...p}
      sectionLabel={SECTION_LABEL}
      sectionColor={ACCENT}
      eyebrow={c.eyebrow}
      headline={c.headline}
    >
      <Lede>{c.lede}</Lede>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          columnGap: '0.5in',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Para>{c.body}</Para>
          {/* before → after */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <StatBig
              value={c.before.value}
              label={c.before.label}
              tier="metricMedium"
              color={COLORS.INK}
            />
            <span
              style={{
                fontFamily: FONTS.MONO,
                fontSize: 22,
                color: COLORS.EMERALD_500,
              }}
            >
              →
            </span>
            <StatBig
              value={c.after.value}
              label={c.after.label}
              tier="metricMedium"
              color={COLORS.EMERALD_600}
            />
          </div>
          <div
            style={{
              fontFamily: FONTS.MONO,
              fontSize: 8.5,
              color: COLORS.INK_MUTED,
            }}
          >
            {c.exact}
          </div>
        </div>
        <FactGrid facts={c.facts} />
      </div>
      <div
        style={{
          marginTop: 14,
          fontFamily: FONTS.SERIF,
          fontStyle: 'italic',
          fontSize: 13,
          color: COLORS.INK_MUTED,
        }}
      >
        {c.ratio}.
      </div>

      {/* the routes as units + the cap it cleared */}
      <div
        style={{
          marginTop: 18,
          display: 'grid',
          gridTemplateColumns: '1.25fr 1fr',
          columnGap: '0.4in',
          alignItems: 'stretch',
        }}
      >
        <FigureCard
          label="36 routes · one function"
          source="api/index.ts"
          caption="Every route lives in one catch-all: 34 product handlers plus a health and a test diagnostic — 36 entries, one serverless function."
        >
          <Waffle
            total={36}
            cols={18}
            cell={12}
            gap={4}
            segments={[
              {
                count: 34,
                color: COLORS.EMERALD_400,
                label: '34 product handlers',
              },
              {
                count: 2,
                color: COLORS.HAIRLINE_STRONG,
                label: 'health + test',
                hollow: true,
              },
            ]}
          />
        </FigureCard>
        <FigureCard
          label="the cap, cleared"
          source="vercel.json"
          caption="Vercel's Hobby tier caps a deployment at 12 functions. Cadence ships one."
        >
          <Bullet
            min={0}
            max={14}
            value={1}
            cap={{ at: 12, label: 'Hobby cap · 12' }}
            valueLabel="1 function"
            ticks={[0, 6, 12]}
          />
        </FigureCard>
      </div>

      {/* how the one function routes — static patterns beat :param, Vercel-style */}
      <div
        style={{
          marginTop: 16,
          borderTop: `1pt solid ${COLORS.INK}`,
          paddingTop: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontFamily: FONTS.MONO,
              fontSize: 8.5,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: ACCENT,
            }}
          >
            the route table · static wins
          </span>
          <span
            style={{
              fontFamily: FONTS.MONO,
              fontSize: 7.5,
              color: COLORS.INK_SUBTLE,
            }}
          >
            api/index.ts
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            { path: 'GET /api/tasks', to: 'tasks handler', tag: 'static' },
            {
              path: 'GET /api/tasks/:id',
              to: 'tasks/[id] · :id → req.query',
              tag: ':param',
            },
            {
              path: 'GET /api/health',
              to: 'health diagnostic · not counted',
              tag: 'static',
            },
          ].map((r, i) => (
            <div
              key={r.path}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.9in 1fr 0.7in',
                columnGap: 12,
                alignItems: 'baseline',
                padding: '6px 0',
                borderBottom: i < 2 ? `0.5pt solid ${COLORS.HAIRLINE}` : 'none',
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: 9.5,
                  color: COLORS.INK,
                }}
              >
                {r.path}
              </span>
              <span
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: 8.5,
                  color: COLORS.EMERALD_700,
                }}
              >
                → {r.to}
              </span>
              <span
                style={{
                  justifySelf: 'end',
                  fontFamily: FONTS.MONO,
                  fontSize: 7.5,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: COLORS.INK_SUBTLE,
                }}
              >
                {r.tag}
              </span>
            </div>
          ))}
        </div>
      </div>

      <SourceRail>{c.source}</SourceRail>
    </BodyPage>
  );
};

// ── p16 · the data path ─────────────────────────────────────────────────────

export const InsideDataPage: React.FC<PageProps> = (p) => {
  const c = INSIDE.data;
  return (
    <BodyPage
      {...p}
      sectionLabel={SECTION_LABEL}
      sectionColor={ACCENT}
      eyebrow={c.eyebrow}
      headline={c.headline}
    >
      <Lede>{c.lede}</Lede>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.05fr 1fr',
          columnGap: '0.5in',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Para>{c.body}</Para>
          <HonestNote>{c.honest}</HonestNote>
        </div>
        <FactGrid facts={c.facts} />
      </div>

      {/* the pinned path — how an unqualified query reaches the right tenant */}
      <div style={{ marginTop: 20 }}>
        <FigureCard
          label="the pinned path · one query"
          source="lib/config/database.ts:66,72–74"
          caption="TLS is verified against the inlined Supabase Root 2021 CA, then every connection is pinned to search_path=public — so “FROM tasks” always resolves in the right tenant, never the co-tenant's schema."
        >
          <DataPath />
        </FigureCard>
      </div>

      {/* the two pins, as a before → after — what each one closed */}
      <div
        style={{
          marginTop: 16,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}
      >
        {[
          {
            k: 'TLS identity',
            was: 'sslmode=no-verify',
            now: 'CA-pinned · rejectUnauthorized',
            closed: 'closes the MITM window',
          },
          {
            k: 'Schema',
            was: 'pooled, co-tenant schema',
            now: '--search_path=public (pinned)',
            closed: 'no cross-tenant resolve',
          },
        ].map((d) => (
          <div
            key={d.k}
            style={{
              border: `0.5pt solid ${COLORS.HAIRLINE}`,
              borderLeft: `2.5px solid ${ACCENT}`,
              borderRadius: 6,
              background: COLORS.PAPER_ELEVATED,
              padding: '11px 13px',
            }}
          >
            <div
              style={{
                fontFamily: FONTS.MONO,
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: ACCENT,
                marginBottom: 6,
              }}
            >
              {d.k}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: 8.5,
                  color: COLORS.INK_SUBTLE,
                  textDecoration: 'line-through',
                }}
              >
                {d.was}
              </span>
              <span
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: 11,
                  color: COLORS.EMERALD_500,
                }}
              >
                →
              </span>
              <span
                style={{
                  fontFamily: FONTS.MONO,
                  fontSize: 8.5,
                  color: COLORS.INK,
                }}
              >
                {d.now}
              </span>
            </div>
            <div
              style={{
                fontFamily: FONTS.SERIF,
                fontStyle: 'italic',
                fontSize: 10,
                color: COLORS.INK_MUTED,
                marginTop: 6,
              }}
            >
              {d.closed}
            </div>
          </div>
        ))}
      </div>

      <SourceRail>{c.source}</SourceRail>
    </BodyPage>
  );
};

// ── p17 · auth + secrets ────────────────────────────────────────────────────

export const InsideAuthPage: React.FC<PageProps> = (p) => {
  const c = INSIDE.auth;
  return (
    <BodyPage
      {...p}
      sectionLabel={SECTION_LABEL}
      sectionColor={ACCENT}
      eyebrow={c.eyebrow}
      headline={c.headline}
    >
      <Lede>{c.lede}</Lede>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.05fr 1fr',
          columnGap: '0.5in',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Para>{c.body}</Para>
          <HonestNote>{c.honest}</HonestNote>
        </div>
        <FactGrid facts={c.facts} />
      </div>

      {/* token lifetimes on a log time axis — short access, long refresh */}
      <div style={{ marginTop: 20 }}>
        <FigureCard
          label="token lifetimes · log scale"
          source="jwt.ts · RefreshTokenService.ts"
          caption="A short access token (15m) rides alongside a long refresh token (7d); every refresh rotates the pair. Auth endpoints are rate-limited to 5 attempts per 15-minute window."
        >
          <LogTimeAxis
            minMinutes={1}
            maxMinutes={20160}
            ticks={[
              { minutes: 1, label: '1m' },
              { minutes: 60, label: '1h' },
              { minutes: 1440, label: '1d' },
              { minutes: 10080, label: '7d' },
            ]}
            markers={[
              {
                minutes: 15,
                label: 'access · 15m',
                sub: 'short-lived',
                color: COLORS.EMERALD_500,
                above: true,
              },
              {
                minutes: 10080,
                label: 'refresh · 7d',
                sub: 'rotated on use',
                color: COLORS.EMERALD_700,
                above: true,
              },
            ]}
          />
        </FigureCard>
      </div>

      {/* the three defenses, in one line each — rotation · rate-limit · at-rest */}
      <div
        style={{
          marginTop: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 0,
          borderTop: `1pt solid ${COLORS.INK}`,
          borderBottom: `0.5pt solid ${COLORS.HAIRLINE}`,
        }}
      >
        {[
          {
            v: 'rotate',
            k: 'every refresh',
            n: 'reuse of a spent token revokes the whole family',
          },
          {
            v: '5 / 15m',
            k: 'rate limit',
            n: 'per un-spoofable client IP, not X-Forwarded-For',
          },
          {
            v: 'AES-256',
            k: 'at rest',
            n: 'the Google refresh token, GCM-sealed before the DB',
          },
        ].map((x, i) => (
          <div
            key={x.k}
            style={{
              padding: '11px 14px',
              borderLeft: i === 0 ? 'none' : `0.5pt solid ${COLORS.HAIRLINE}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <span
              style={{
                fontFamily: FONTS.MONO,
                fontSize: 15,
                fontWeight: 700,
                color: COLORS.EMERALD_600,
                letterSpacing: '-0.01em',
                lineHeight: 1,
              }}
            >
              {x.v}
            </span>
            <span
              style={{
                fontFamily: FONTS.MONO,
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: COLORS.INK_MUTED,
              }}
            >
              {x.k}
            </span>
            <span
              style={{
                fontFamily: FONTS.SERIF,
                fontStyle: 'italic',
                fontSize: 9.5,
                lineHeight: 1.25,
                color: COLORS.INK_SUBTLE,
              }}
            >
              {x.n}
            </span>
          </div>
        ))}
      </div>

      <SourceRail>{c.source}</SourceRail>
    </BodyPage>
  );
};
