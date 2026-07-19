/**
 * TaskFlow System Card — copy + verified data (self-contained).
 *
 * Every number here is verified against the taskflow-calendar-main repo
 * (branch main) and carries a `source · file:line` rail where it is a
 * measured/enforced fact. Nothing is invented. A few deliberate honesty calls,
 * grounded in the code rather than a marketing line:
 *
 *   · "32 serverless handlers" is the figure the app itself reports
 *     (Welcome.tsx:276) and the dispatcher's own docstring records
 *     (api/index.ts:6). A literal count of the current tree is 34 handler
 *     files / 34 routes — the two extra are `health` + `test` diagnostics;
 *     34 − 2 = 32 product handlers. We print 32 and note the count.
 *   · "1,145 tests" is the app-reported green figure (Welcome.tsx:219, 278).
 *     A static count of `it()/test()` calls across the tree is ~1,249
 *     (634 frontend + 615 backend/handler). We print the reported figure and
 *     note the static count, the same way the app states it.
 *   · Google Calendar sync is genuinely ONE-WAY: a read-only pull. The handler
 *     requests only the `calendar.readonly` scope (google/calendar.ts:25).
 *
 * The parse showcase examples are the app's OWN landing examples, verbatim
 * (Welcome.tsx:34–66) — real smart-input behavior, not a benchmark.
 */

import type { SectionKey } from "./theme";

// ---------------------------------------------------------------------------
// Brand / masthead
// ---------------------------------------------------------------------------

export const BRAND = {
  name: "TaskFlow",
  wordmark: "task_flow",
  subtitle: "Type it the way you'd say it. It lands where it belongs.",
  author: "Ayush Yadav",
  year: "2026",
  liveUrl: "taskflow-calendar-ashy.vercel.app",
  qrTarget: "https://taskflow-calendar-ashy.vercel.app",
} as const;

export const MASTHEAD = {
  volume: "Vol. 01 · System Card",
  kicker:
    "A calendar and task manager you drive in plain English — one sentence parsed into a scheduled event or task, filed by a parser that shows its work.",
  colophonLines: [
    "© 2026 · Ayush Yadav",
    "Calendar + tasks + NLP · React 19 SPA",
    "Serverless on Vercel · Supabase Postgres",
  ],
} as const;

// ---------------------------------------------------------------------------
// Welcome / endpaper — ≤ 80 words.
// ---------------------------------------------------------------------------

export const ABSTRACT = {
  greeting: "Welcome.",
  body:
    "Every calendar app hands you a form: title, date, start, end, priority, list. TaskFlow deletes the form. You type one plain sentence — “Lunch with Sam tomorrow 1pm” — and a three-stage parser reads the time, the language, and the priority, shows you its reading as chips, then files it as an event or a task on the week. Behind it: a React 19 app, one serverless dispatcher, a CA-pinned Postgres, and 1,145 tests.",
} as const;

// ---------------------------------------------------------------------------
// Cover motif — the app's own "one sentence, three beats" showcase, verbatim.
// Encodes: plain sentence → typed chips (event/when/where · task/due/priority)
// → landing on a MON–FRI week grid. (Welcome.tsx:34–68)
// ---------------------------------------------------------------------------

export const COVER = {
  masthead: "TaskFlow · System Card",
  wordmark: "task_flow",
  title: "TaskFlow",
  marginNote: "you type · it reads · it files",
  days: ["MON", "TUE", "WED", "THU", "FRI"] as const,
  examples: [
    {
      text: "Lunch with Sam tomorrow 1pm at Patterson's",
      chips: [
        ["event", "Lunch with Sam"],
        ["when", "tomorrow · 1:00 PM"],
        ["where", "Patterson's"],
      ] as ReadonlyArray<readonly [string, string]>,
      filed: {
        kind: "event" as const,
        day: 3, // THU
        top: "34%",
        label: "Lunch with Sam",
        detail: "1:00 PM · Patterson's",
      },
    },
    {
      text: "Ship the report by Friday !high #work",
      chips: [
        ["task", "Ship the report"],
        ["due", "Friday"],
        ["priority", "high"],
        ["list", "work"],
      ] as ReadonlyArray<readonly [string, string]>,
      filed: {
        kind: "task" as const,
        day: 4, // FRI
        top: "12%",
        label: "Ship the report",
        detail: "due · !high · #work",
      },
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// Chapter TOC
// ---------------------------------------------------------------------------

export const CHAPTERS = [
  { num: "01", name: "WHY", pages: "04 – 07", sectionKey: "01_WHY" as const },
  { num: "02", name: "HOW", pages: "08 – 13", sectionKey: "02_HOW" as const },
  { num: "03", name: "INSIDE", pages: "14 – 17", sectionKey: "03_INSIDE" as const },
  { num: "04", name: "PROOF", pages: "18 – 22", sectionKey: "04_PROOF" as const },
  { num: "05", name: "BUILD", pages: "23 – 27", sectionKey: "05_BUILD" as const },
] as const;

export const TOC = {
  chapterTaglines: {
    WHY: "the form is the friction",
    HOW: "chrono · compromise · priority",
    INSIDE: "one dispatcher, pinned TLS",
    PROOF: "1,145 tests, and the receipts",
    BUILD: "the stack and the journey",
  } as Record<string, string>,
  chapterGlyphs: {
    WHY: "¶",
    HOW: "⌘",
    INSIDE: "◍",
    PROOF: "✓",
    BUILD: "⚑",
  } as Record<string, string>,
  audience: [
    { key: "Engineers", val: "read the parser, the dispatcher, the pool." },
    { key: "Reviewers", val: "start at §01, finish at the stack." },
    { key: "Users", val: "the parse showcase on page 20 is the whole idea." },
  ],
  readingPaths: [
    { key: "Skim · 5 min", val: "headlines, the pipeline, the tests hero." },
    { key: "Deep · 20 min", val: "cover to cover — built for one sitting." },
    { key: "Diagrams only", val: "the parse (p.09), the dispatcher (p.15)." },
  ],
  atAGlance: [
    { key: "3 stages", val: "chrono · compromise · priority rules." },
    { key: "1 function", val: "32 handlers behind one Vercel dispatcher." },
    { key: "1,145 tests", val: "green · strict headers · zero third-party." },
  ],
  glossary: [
    { term: "chrono", def: "natural-language date/time parser." },
    { term: "compromise", def: "in-browser NLP — names, places, verbs." },
    { term: "chip", def: "a parsed field, shown before it is saved." },
    { term: "dispatcher", def: "one function routing all 32 handlers." },
    { term: "search_path", def: "the schema a pooled connection resolves to." },
    { term: "AES-GCM", def: "authenticated encryption for stored tokens." },
  ],
  colophon: [
    "© 2026 · Ayush Yadav",
    "TaskFlow · System Card Vol. 01",
    "React 19 · Vercel · Supabase",
  ],
  teaser:
    "A printed walkthrough of a live app — the why, the parse, and the receipts. Read it with the demo open.",
} as const;

// ---------------------------------------------------------------------------
// The three parser stages — reused across HOW / INSIDE.
// Priorities + engines from src/components/smart-input/parsers/SmartParser.ts,
// listed in execution order (chrono → priority → compromise).
// ---------------------------------------------------------------------------

export const STAGES = [
  {
    id: "chrono",
    n: "1",
    label: "chrono",
    priority: "10",
    engine: "chrono-node",
    reads: "time",
    blurb:
      "The highest-priority stage. Chrono-node reads dates and times from ordinary phrasing — “tomorrow 1pm”, “by Friday”, “next Tuesday 9–10” — with forwardDate on, so a bare weekday always means the next one.",
  },
  {
    id: "priority",
    n: "2",
    label: "priority rules",
    priority: "8",
    engine: "regex rules",
    reads: "priority",
    blurb:
      "A deterministic rule layer. Regular expressions map “!high”, “p1”, “urgent”, “asap” to a priority level with an explicit confidence — hand-written, auditable, and instant.",
  },
  {
    id: "compromise",
    n: "3",
    label: "compromise",
    priority: "6",
    engine: "compromise (nlp)",
    reads: "language",
    blurb:
      "An in-browser NLP pass. Compromise tags the parts of speech and named entities — people, places, the action verb — so “Lunch with Sam at Patterson's” yields a title, a person, and a location without a single form field.",
  },
] as const;

// ---------------------------------------------------------------------------
// Section 01 — WHY
// ---------------------------------------------------------------------------

export const WHY = {
  divider: { subtitle: "every calendar app hands you a form — the form is the friction" },

  forms: {
    eyebrow: "§01 · THE FORM",
    headline: "Every calendar makes you fill a form.",
    pullQuote:
      "You already said it in your head — “lunch with Sam tomorrow at one.” Then the app asks you to say it again, in six boxes.",
    body: [
      "Open any calendar to add something and the same modal appears: a title field, a date picker, a start time, an end time, a dropdown for the list, a toggle for priority. You know exactly what you want before the dialog opens. The dialog exists to make you re-enter it, one field at a time.",
      "That is friction masquerading as structure. The structured record is worth having — but demanding that a human hand-assemble it, every single time, is the tax that keeps calendars mostly empty.",
    ],
    coda:
      "So the app should not open a form. It should read the sentence you already have.",
    fields: [
      { label: "TITLE", filler: "________________" },
      { label: "DATE", filler: "▾ pick a day" },
      { label: "START", filler: "▾ : " },
      { label: "END", filler: "▾ : " },
      { label: "LIST", filler: "▾ choose" },
      { label: "PRIORITY", filler: "○ ○ ○" },
    ],
  },

  friction: {
    eyebrow: "§01 · THE COST",
    headline: "Friction is where scheduling dies.",
    lede:
      "The cost of the form is not the thirty seconds. It is the thought you never bother to file because filing it is more work than remembering it.",
    beforeTitle: "FILL THE FORM",
    withTitle: "TYPE THE SENTENCE",
    before: [
      "Open a dialog; tab through six fields to log one lunch.",
      "Re-type a time you already know into a fiddly picker.",
      "Pick the list from a dropdown, set priority from a toggle.",
      "Give up on quick thoughts — the form is not worth it.",
      "Two conventions to remember: yours, and the app's.",
    ],
    with: [
      "Type one sentence the way you'd text it to a friend.",
      "“tomorrow 1pm” is the time — no picker, no tabbing.",
      "“#work !high” sets the list and priority inline.",
      "A fleeting thought costs a sentence, so you file it.",
      "One convention: plain English. The parser learns yours.",
    ],
    gate: "The form is only ever as complete as your patience. A sentence never runs out of patience.",
  },

  plain: {
    eyebrow: "§01 · THE REFRAME",
    headline: "The input should read plain English.",
    body: [
      "Reframe the product. A calendar is not a database front-end you must populate; it is a place to put what you already decided. The real task is comprehension: given a sentence, what is the event or task, when is it, how urgent, and does it clash with anything already there?",
      "Solve that and the form disappears. You describe; the app parses, shows you its reading, and files. The interface stops being a set of boxes to fill and becomes a line you talk to.",
    ],
    thesis:
      "If the app can read the sentence, you never have to fill the form.",
    reframe: [
      { from: "“open the New Event dialog”", to: "type what you mean" },
      { from: "“pick a date and a time”", to: "say “tomorrow 1pm”" },
      { from: "“set the list and priority”", to: "add “#work !high”" },
    ],
    handoff: "So: how do you turn a sentence into a scheduled thing? Turn the page.",
  },
} as const;

// ---------------------------------------------------------------------------
// Section 02 — HOW
// ---------------------------------------------------------------------------

export const HOW = {
  divider: { subtitle: "three stages read one sentence — time, language, priority — then it files" },

  pipeline: {
    eyebrow: "§02 · THE PIPELINE",
    headline: "One sentence, three readers.",
    lede:
      "The SmartParser is a multi-stage pipeline. Three parsers run over the same sentence in priority order, each claiming the spans it understands; a resolver settles overlaps; and what's left is a clean title plus a set of typed tags.",
    body:
      "Every parser returns tagged spans with a confidence. Where two parsers claim overlapping text, the higher-priority — then higher-confidence — tag wins, and the loser is dropped. The pipeline never guesses silently: it shows the reading as chips before anything is written.",
    steps: [
      { n: "1", label: "chrono", detail: "dates + times", accept: "priority 10" },
      { n: "2", label: "priority rules", detail: "!high · p1 · urgent", accept: "priority 8" },
      { n: "3", label: "compromise", detail: "names · places · verbs", accept: "priority 6" },
      { n: "◇", label: "resolve", detail: "overlaps → one winner", accept: "by priority" },
    ],
    stages5: [
      "run all applicable parsers",
      "detect overlapping tags",
      "resolve by priority, then confidence",
      "generate the clean title",
      "compute overall confidence",
    ],
    source: "source · smart-input/parsers/SmartParser.ts:16–56 (parsers + 5 stages)",
  },

  chrono: {
    eyebrow: "§02 · STAGE 1 · TIME",
    headline: "It reads the time first.",
    body: [
      "The first and highest-priority stage is chrono-node. It lifts dates and times out of ordinary phrasing — “tomorrow 1pm”, “by Friday”, “next Tuesday 9–10am” — and marks whether the match carried an actual clock time or only a day.",
      "It runs with forwardDate enabled, so a bare “Friday” always resolves to the next Friday, never a past one. A date-only match is normalized to midnight so a lunch on a day doesn't silently inherit the current minute.",
    ],
    stat: { value: "10", label: "parser priority · runs first" },
    stat2: { value: "forwardDate", label: "bare weekday → the next one" },
    note: "hasTime keys off isCertain('hour' | 'minute') — a day and a time are handled differently.",
    source: "source · smart-input/parsers/ChronoDateParser.ts:24,30,39,46",
  },

  compromise: {
    eyebrow: "§02 · STAGE 3 · LANGUAGE",
    headline: "It reads the language.",
    body: [
      "When the time is out, compromise reads the rest of the sentence as language. The in-browser NLP library tags parts of speech and named entities — the person in “with Sam”, the place in “at Patterson's”, the action verb that becomes the title.",
      "It is the lowest-priority stage on purpose: dates and priorities are unambiguous and claim their spans first, so compromise interprets only what those deterministic passes left behind.",
    ],
    stat: { value: "compromise", label: "in-browser NLP · zero calls" },
    stat2: { value: "6", label: "parser priority · runs last" },
    note: "`import nlp from 'compromise'` — the language pass runs entirely on the client.",
    source: "source · smart-input/parsers/CompromiseNLPParser.ts:6,22",
  },

  priority: {
    eyebrow: "§02 · STAGE 2 · PRIORITY",
    headline: "Rules, not guesses, for priority.",
    body: [
      "Between time and language sits a deterministic rule layer. A table of regular expressions maps the way people actually flag urgency — “p1”, “!high”, “urgent”, “asap”, “when possible” — to a level and a confidence you can read off the source.",
      "Todoist-style “p1/p2/p3” score 0.95; “urgent / critical / asap” score 0.85; a bare “high” scores 0.75. Confidence is not a black box — it is a number sitting next to each pattern in the code.",
    ],
    // Real rows from PriorityParser.ts:15–68 (pattern → level · confidence).
    rows: [
      { pattern: "p1 / p2 / p3", level: "high · med · low", conf: "0.95" },
      { pattern: "urgent · critical · asap", level: "high", conf: "0.85" },
      { pattern: "high", level: "high", conf: "0.75" },
      { pattern: "medium", level: "medium", conf: "0.70" },
      { pattern: "low priority · someday", level: "low", conf: "0.80" },
    ],
    note: "Every pattern carries an explicit confidence — auditable, not learned.",
    source: "source · smart-input/parsers/PriorityParser.ts:15–68",
  },

  resolve: {
    eyebrow: "§02 · RESOLVE + FILE",
    headline: "Overlaps resolve; then it files.",
    lede:
      "Two parsers can claim the same words. The resolver keeps exactly one tag per span — the highest priority, then the highest confidence — and drops the rest, so the reading is never double-counted.",
    body:
      "What survives becomes the record: a clean title with the matched spans removed, plus typed tags for date, time, priority, and list. TaskFlow shows that reading as chips, checks the new event against the calendar for time conflicts, and only then writes it — as an event on the grid or a task in its list.",
    bands: [
      { range: "overlap", verb: "COMPARE", detail: "same span, two parsers." },
      { range: "priority", verb: "RANK", detail: "chrono > priority > compromise." },
      { range: "tie", verb: "CONFIDENCE", detail: "higher score wins the span." },
    ],
    loopNote:
      "conflict detection runs at write time: a new event is checked against existing ones for an overlapping window before it is saved.",
    source: "source · SmartParser.ts:92–188 (detect + resolve) · events/conflicts.ts",
  },
} as const;

// ---------------------------------------------------------------------------
// Section 03 — INSIDE
// ---------------------------------------------------------------------------

export const INSIDE = {
  divider: { subtitle: "a React 19 SPA, one serverless dispatcher, and a pinned Postgres" },

  dispatch: {
    eyebrow: "§03 · THE DISPATCHER",
    headline: "32 handlers, one function.",
    lede:
      "Vercel's Hobby tier caps a deployment at 12 serverless functions. TaskFlow has 32 API handlers. So all of them ship inside a single catch-all function that routes by URL path.",
    body:
      "Every former per-file handler is imported into one dispatcher and matched against a route table — static patterns winning over “:id” params — with the dynamic segments injected back into req.query exactly as Vercel's filesystem router would have. One function, byte-for-byte the same handlers, no framework routing assumptions.",
    before: { value: "32", label: "API handlers" },
    after: { value: "1", label: "serverless function" },
    ratio: "12-function cap, cleared",
    exact: "34 route entries — 32 product handlers + health + test",
    facts: [
      { k: "FRONTEND", v: "React 19.1 SPA · Vite · TanStack Query" },
      { k: "API", v: "one @vercel/node function · path router" },
      { k: "ROUTING", v: "static wins over :param · req.query params" },
      { k: "SPA", v: "everything non-/api rewrites to index.html" },
    ],
    source: "source · api/index.ts:1–132 · vercel.json (functions + rewrites)",
  },

  data: {
    eyebrow: "§03 · THE DATA PATH",
    headline: "Pinned TLS, pinned schema.",
    lede:
      "The database is Supabase Postgres, reached over pure SQL with the pg pool. Two things are pinned: the TLS identity of the server, and the schema every connection resolves against.",
    body:
      "The pool verifies the server against the inlined Supabase Root 2021 CA with rejectUnauthorized on — closing the MITM exposure of the old sslmode=no-verify. And because the pooler is co-tenanted with another app that connects as schema=lifequest, every connection is pinned to --search_path=public, so an unqualified “FROM tasks” can never resolve against the wrong tenant's schema.",
    facts: [
      { k: "ENGINE", v: "Supabase Postgres · pg pool · pure SQL" },
      { k: "TLS", v: "Supabase Root 2021 CA · rejectUnauthorized: true" },
      { k: "SCHEMA", v: "options: --search_path=public (pinned)" },
      { k: "RESILIENCE", v: "idle-error swallow · transient retry-once" },
    ],
    honest:
      "The search_path pin is the fix for a real, intermittent 500: a pooled connection left on schema=lifequest was resolving TaskFlow's unqualified queries against the wrong schema.",
    source: "source · lib/config/database.ts:13–20,66,72–74,122–150 · supabaseCA.ts",
  },

  auth: {
    eyebrow: "§03 · AUTH + SECRETS",
    headline: "Rotation, rate limits, and AES-GCM.",
    lede:
      "Auth is stateless JWT with rotation. A short-lived access token (15m) rides alongside a refresh token (7d); refreshing rotates the pair and blacklists the old one, and a whole token family is revoked if a used token reappears.",
    body:
      "The server refuses to start without a JWT_SECRET — no constant-secret fallback. Auth endpoints are rate-limited to 5 attempts per 15 minutes, keyed off the platform's un-spoofable client IP, never the attacker-controllable first X-Forwarded-For hop. And the one third-party secret worth stealing — the Google OAuth refresh token — is encrypted at rest with AES-256-GCM before it touches the database.",
    facts: [
      { k: "ACCESS / REFRESH", v: "15m / 7d · rotated on every refresh" },
      { k: "REUSE", v: "used token reappears → revoke the family" },
      { k: "RATE LIMIT", v: "auth: 5 / 15 min · per real client IP" },
      { k: "AT REST", v: "AES-256-GCM · v1:iv:tag:ct · 12-byte nonce" },
    ],
    honest:
      "The in-memory rotation map is best-effort within a warm instance; correctness rests on the signed, expiring JWT plus an explicit blacklist check — a durable rotation table is the tracked next step.",
    source: "source · jwt.ts:18–19 · RefreshTokenService.ts:79–169 · rateLimit.ts:186–191 · tokenCrypto.ts:25–66",
  },
} as const;

// ---------------------------------------------------------------------------
// Section 04 — PROOF
// ---------------------------------------------------------------------------

export const PROOF = {
  divider: { subtitle: "1,145 tests, a live parse showcase, and a calendar that folds to fit" },

  tests: {
    eyebrow: "§04 · THE NUMBER",
    headline: "1,145 tests, green.",
    hero: "1,145",
    heroLabel: "tests passing · frontend + backend",
    body:
      "Correctness is not asserted, it is run. The app reports 1,145 passing tests across the parser, the API handlers, the services, and the React UI — with strict security headers and zero third-party network calls as standing invariants, not aspirations.",
    exact: "1,145 reported green · static count of it()/test() ≈ 1,249 (634 frontend + 615 backend)",
    ciValue: "0",
    ciLabel: "third-party calls — CSP connect-src 'self'",
    ciBody:
      "The Content-Security-Policy pins connect-src to 'self', so the running app cannot phone home: no analytics, no fonts-CDN, no external inference. The tests and the headers are the receipts the landing page prints.",
    source: "source · Welcome.tsx:219,278 · vercel.json (CSP connect-src 'self')",
  },

  parse: {
    eyebrow: "§04 · THE SHOWCASE",
    headline: "You type. It reads. It files.",
    lede:
      "The signature TaskFlow moment, rendered here from the app's own landing examples: one sentence, three beats. You type a line; the parser reads it into typed chips; the result lands on the week.",
    illustrativeNote: "The app's real landing examples (Welcome.tsx:34–66), verbatim.",
    rows: [
      { subject: "Lunch with Sam tomorrow 1pm at Patterson's", chips: "event · when · where", filed: "event → THU", kind: "event" },
      { subject: "Ship the report by Friday !high #work", chips: "task · due · priority · list", filed: "task → FRI", kind: "task" },
    ],
    legendGate: "no forms were opened in the making of that event",
    source: "source · Welcome.tsx:34–66,88–176 (ParseShowcase)",
  },

  adapt: {
    eyebrow: "§04 · IT FOLDS TO FIT",
    headline: "A week that folds to a phone.",
    lede:
      "The calendar carries month, week, day, and agenda views, color-coded calendars, and recurrence. On a phone, the seven-column week doesn't shrink — it folds.",
    body:
      "Below 768px the week and month grids stop cramming seven columns into a narrow viewport and fall back to a readable agenda list (FullCalendar's listWeek). It is the same data, re-composed for the device — a deliberate collapse, not a squeeze.",
    facts: [
      { k: "VIEWS", v: "month · week · day · agenda · recurrence" },
      { k: "MOBILE", v: "< 768px · week/month → listWeek agenda" },
      { k: "SYNC", v: "Google Calendar · one-way pull · read-only" },
      { k: "SCOPE", v: "calendar.readonly — it can only read" },
    ],
    honest:
      "Google sync is intentionally one-way: the handler requests only the calendar.readonly scope, so TaskFlow imports your events and never writes back.",
    source: "source · CalendarView.tsx:96–107 · google/calendar.ts:2,25",
  },

  security: {
    eyebrow: "§04 · THE POSTURE",
    headline: "Strict by default.",
    body:
      "Every response carries a strict header set applied at the edge: HSTS with preload, X-Content-Type-Options nosniff, X-Frame-Options DENY, a locked Referrer-Policy, a Permissions-Policy that disables camera, microphone, and geolocation, and a Content-Security-Policy that frame-ancestors 'none' and keeps connect-src on 'self'.",
    stats: [
      { value: "HSTS", label: "preload · 2-year max-age", note: "vercel.json" },
      { value: "DENY", label: "X-Frame-Options · no framing", note: "vercel.json" },
      { value: "'self'", label: "CSP connect-src · no exfil", note: "vercel.json" },
    ],
    honest:
      "These are enforced in vercel.json headers for every path — not documentation, configuration.",
    handoffQuote:
      "An app that reads your sentence should be the only thing reading it.",
  },
} as const;

// ---------------------------------------------------------------------------
// Section 05 — BUILD
// ---------------------------------------------------------------------------

export const BUILD = {
  divider: { subtitle: "type · parse · resolve · file · persist — the stack behind the sentence" },

  pipeline: {
    eyebrowLeft: "§05 · THE JOURNEY · LEFT",
    eyebrowRight: "§05 · THE JOURNEY · RIGHT",
    headlineLeft: "From a sentence…",
    headlineRight: "…to a row in Postgres.",
    subLeft:
      "You type a line. The three-stage parser reads it, the resolver settles overlaps, and the reading appears as chips — all on the client, before a byte is sent.",
    subRight:
      "The chosen record posts through the one dispatcher to its handler, is checked for conflicts, and is written to Supabase Postgres over pinned TLS — then rendered back onto the week.",
    stages: [
      { n: "1", label: "TYPE", detail: "one plain sentence", accentKey: "01_WHY" },
      { n: "2", label: "PARSE", detail: "chrono · priority · compromise", accentKey: "02_HOW" },
      { n: "3", label: "RESOLVE", detail: "overlaps → chips", accentKey: "02_HOW" },
      { n: "4", label: "DISPATCH", detail: "one function · 32 routes", accentKey: "03_INSIDE" },
      { n: "5", label: "PERSIST", detail: "Postgres · pinned TLS", accentKey: "03_INSIDE" },
    ],
    registry:
      "The parse runs client-side; only the resolved event or task crosses the wire — through the single dispatcher to its handler.",
    source: "source · SmartParser.ts · api/index.ts · lib/config/database.ts",
  },

  stack: {
    eyebrow: "§05 · THE STACK",
    headline: "What it is built on.",
    lede:
      "A React 19 single-page app where the sentence is read, and a serverless Postgres backend where the record lands — one repo, npm workspaces, no ORM on the hot path.",
    rows: [
      { area: "FRONTEND", tech: "React 19.1 · Vite · TypeScript", note: "the SPA that reads the sentence" },
      { area: "CALENDAR", tech: "FullCalendar · @dnd-kit · Radix UI", note: "month/week/day/agenda + drag" },
      { area: "NLP", tech: "chrono-node · compromise · regex rules", note: "the three-stage parser, on the client" },
      { area: "STATE", tech: "TanStack Query · Zod · Tailwind v4", note: "data fetching, validation, styling" },
      { area: "API", tech: "@vercel/node · one dispatcher · pg", note: "32 handlers, pure SQL, no ORM" },
      { area: "DATA", tech: "Supabase Postgres · CA-pinned TLS · JWT", note: "rotation, rate limits, AES-GCM" },
    ],
    source: "source · package.json · api/index.ts · lib/config/database.ts",
  },

  closing: {
    eyebrow: "END",
    headline: "Type it.",
    tagline: "Run a real sentence through all three stages and watch it land on the week — in your browser.",
    liveLabel: "LIVE WEB APP",
    liveUrl: "taskflow-calendar-ashy.vercel.app",
    spaceLabel: "DEMO ACCOUNT",
    spaceUrl: "john@example.com · password123",
    leftArrowLabel: "open it",
    rightArrowLabel: "type a sentence",
    microNote: "one sentence · three stages · zero forms",
  },
} as const;

// ---------------------------------------------------------------------------
// Back cover
// ---------------------------------------------------------------------------

export const BACK_COVER = {
  qrTarget: "https://taskflow-calendar-ashy.vercel.app",
  qrCaption: "scan to open the live app",
  spaceNote: "Demo account, seeded with a real week: john@example.com · password123",
  colophon: ["TaskFlow", "System Card · Vol. 01", "Ayush Yadav · 2026"],
  closingLine: "— You already said it. It just needed reading.",
} as const;

// Re-export SectionKey so pages can pull the chapter type from content.
export type { SectionKey };
