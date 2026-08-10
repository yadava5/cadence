<p align="center">
  <img src="docs/assets/banner-light.svg#gh-light-mode-only" width="800" alt="Cadence">
  <img src="docs/assets/banner-dark.svg#gh-dark-mode-only" width="800" alt="Cadence">
</p>

<h1 align="center">Cadence</h1>

<p align="center">
  <strong>A full-stack calendar and task manager that turns plain-English input into scheduled, structured work — with a four-parser NLP pipeline, multi-calendar support, and owner-scoped multi-tenant data access.</strong>
</p>

<p align="center">
  <a href="https://usecadenceapp.vercel.app"><strong>Live App</strong></a> •
  <a href="https://usecadenceapp.vercel.app/system-card"><strong>System Card</strong></a> •
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#getting-started">Getting Started</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/tests-Vitest%20%2B%20Playwright-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/TypeScript-5.8-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-19.1-61dafb" alt="React">
  <img src="https://img.shields.io/badge/PostgreSQL-15-336791" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/license-PolyForm%20Noncommercial-orange" alt="License">
</p>

<p align="center">
  Cadence is one of six projects presented together at
  <a href="https://yadava5.github.io/Portfolio-2.0/">yadava5.github.io/Portfolio-2.0</a>.
</p>

---

## Overview

Cadence is a production calendar and task-management app built end-to-end in TypeScript. Type a sentence like _"Meet John tomorrow at 3pm for project review #high-priority"_ and Cadence extracts the date, priority, and people, files the result on the right calendar, and flags any scheduling conflicts before they happen.

Under the hood it pairs a React 19 frontend with a serverless PostgreSQL backend, a four-stage NLP pipeline, and a single catch-all API function that fits an entire REST surface into one serverless deployment.

### Why it's interesting

- **Natural-language task entry** — a four-parser pipeline (dates → hashtags → priority → named entities) with confidence-weighted conflict resolution over overlapping spans.
- **One function, full API** — 37 route handlers are dispatched by a single catch-all serverless function, keeping the whole backend inside Vercel's Hobby-tier 12-function limit without collapsing any handler logic.
- **End-to-end type safety** — types and Zod validation schemas are shared between the client and server, so the contract is enforced in one place.
- **Real scheduling logic** — multi-calendar visibility, recurring events (rrule), and drag-and-drop.
- **Serverless-first data layer** — pure SQL over `pg` with connection pooling, composite indexes, and an in-memory TTL cache tuned for cold starts.

---

## Features

### Task management

- **Multi-pane layout** — 1–3 resizable vertical panes, each with independent filtering
- **Dual view modes** — folder grid with hover previews, or a traditional list
- **Kanban board** — drag-and-drop status columns
- **Smart grouping** — organize by task list, due date, or priority
- **File attachments** — upload and preview images, PDFs, and documents (Vercel Blob)
- **Task analytics** — completion metrics and trends dashboard, computed client-side from the loaded task set

### Smart input (NLP)

The smart-input box runs text through four parsers in priority order and then resolves overlapping detections into a clean title plus structured metadata:

```
"Meet John tomorrow at 3pm for project review #high-priority"
     │
     ▼
┌──────────────────────────────────────────────────────────────┐
│  1. ChronoDateParser   → "tomorrow at 3pm"   → Date object     │
│  2. HashtagParser      → "#high-priority"    → explicit label  │
│  3. PriorityParser     → "high priority"     → PRIORITY = HIGH  │
│  4. CompromiseNLPParser → "John"             → PERSON entity    │
│  ─────────────────────────────────────────────────────────────│
│     Conflict resolution → overlapping spans ranked by parser   │
│                            priority + confidence               │
└──────────────────────────────────────────────────────────────┘
     │
     ▼
Title: "Meet John for project review"
Meta:  { date: Date, priority: HIGH, person: "John" }
```

**Capabilities**

- Natural-language dates/times: "next Friday", "in 2 hours", "tomorrow morning" (chrono-node)
- Explicit `#hashtag` labels and inferred priority ("urgent", "high priority", "low")
- Entity recognition for people, places, and organizations (compromise)
- Real-time syntax highlighting with per-tag confidence indicators
- Voice input via the Web Speech API

### Calendar & events

- **Multi-calendar support** — separate calendars with color coding and visibility toggles
- **Conflict detection (API only)** — `EventService.getConflicts` computes overlap start, end and duration against the user's other events, exposed at `GET /api/events/conflicts`. It is **not** wired into the save path and no UI surfaces it yet.
- **Recurring events** — rrule-based daily, weekly, monthly, and custom patterns
- **Drag & drop** — schedule tasks directly onto the calendar
- **Multiple views** — day grid, time grid, and agenda list (FullCalendar)

---

## Architecture

### System overview

```mermaid
flowchart TB
    subgraph Frontend["Frontend (React 19)"]
        UI[UI Components]
        Zustand[Zustand Stores]
        TanStack[TanStack Query]
    end

    subgraph API["API (single catch-all Vercel function)"]
        Dispatch[Path Dispatcher<br/>37 routes]
        Middleware[Middleware Pipeline]
    end

    subgraph Services["Service Layer"]
        TaskSvc[TaskService]
        EventSvc[EventService]
        CalSvc[CalendarService]
        TagSvc[TagService]
        AttachSvc[AttachmentService]
    end

    subgraph Data["Data Layer"]
        PG[(PostgreSQL)]
        Cache[In-Memory Cache]
        Blob[Vercel Blob]
    end

    UI --> Zustand
    UI --> TanStack
    TanStack --> Dispatch
    Dispatch --> Middleware
    Middleware --> Services
    Services --> PG
    Services --> Cache
    AttachSvc --> Blob
```

### The single catch-all function

Vercel's Hobby tier caps a deployment at 12 serverless functions. Rather than merge or drop endpoints, Cadence keeps every handler intact under `server-handlers/` and wires them into **one** entry point, `api/index.ts`. That dispatcher:

- matches the request path against a route table of **37 handlers** (health, auth, account, calendars, events, tags, task-lists, tasks, attachments, uploads, Google integration),
- restores the dynamic-segment params (`req.query.id`) that Vercel's filesystem router would normally inject for the 6 `[id]` routes,
- and delegates to the original handler byte-for-byte — so the whole REST surface ships as a single function.

### Middleware pipeline

Every request passes through a composable middleware chain before reaching a handler:

```mermaid
flowchart LR
    A[Request] --> B[CORS]
    B --> C[Request ID]
    C --> D[Rate Limit]
    D --> E[Auth]
    E --> F[Validation]
    F --> G[Handler]
    G --> H[Response]

    style A fill:#e1f5fe
    style H fill:#c8e6c9
```

| Middleware     | Purpose                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------ |
| **CORS**       | Cross-origin handling with configurable origins                                                  |
| **Request ID** | UUID per request for tracing and logging                                                         |
| **Rate Limit** | Configurable presets (read 200, write 50, api 100 per 15 min; auth 5 per 15 min; upload 10/hour) |
| **Auth**       | JWT verification with access/refresh token rotation                                              |
| **Validation** | Zod schema validation for body, query, and params                                                |

### State management

Client and server state are deliberately separated:

```mermaid
flowchart TB
    subgraph Client["Client State (Zustand)"]
        UI[uiStore<br/>Modals, Layout]
        Theme[themeStore<br/>Dark/Light Mode]
        Auth[authStore<br/>User Session]
    end

    subgraph Server["Server State (TanStack Query)"]
        Tasks[useTasks<br/>CRUD + Optimistic]
        Events[useEvents<br/>Calendar Data]
        Calendars[useCalendars<br/>Visibility]
    end

    subgraph Features
        Optimistic[Optimistic Updates]
        Cache[Stale-While-Revalidate]
        Invalidation[Structured Query Keys]
    end

    Server --> Features
```

- **Zustand** (~2KB) handles UI state — modals, layout, theme, session — with instant updates.
- **TanStack Query** owns server state with caching, optimistic updates, and background sync.

### Database schema

```mermaid
erDiagram
    users ||--o{ tasks : owns
    users ||--o{ calendars : owns
    users ||--o{ task_lists : owns

    tasks ||--o{ task_tags : has
    tasks ||--o{ attachments : has

    calendars ||--o{ events : contains

    task_lists ||--o{ tasks : groups

    tags ||--o{ task_tags : references

    users {
        uuid id PK
        string email UK
        string name
        string passwordHash
        timestamp createdAt
    }

    tasks {
        uuid id PK
        uuid userId FK
        uuid taskListId FK
        string title
        text description
        enum priority
        boolean completed
        timestamp scheduledDate
    }

    events {
        uuid id PK
        uuid calendarId FK
        string title
        timestamp start
        timestamp end
        string recurrence
    }
```

The schema is provisioned by versioned SQL migrations that add strategic composite indexes — ordered by cardinality — for the hot paths: priority filtering, calendar-view date ranges (`events_calendarId_start_end_idx`), and scheduled-date lookups.

---

## Tech Stack

### Frontend

| Category      | Technologies                                      |
| ------------- | ------------------------------------------------- |
| **Framework** | React 19.1, TypeScript 5.8, Vite 5.4              |
| **State**     | Zustand 5.0 (client), TanStack Query 5.8 (server) |
| **UI**        | Tailwind CSS v4, Radix UI, shadcn/ui              |
| **Calendar**  | FullCalendar 6.1 (daygrid, timegrid, interaction) |
| **NLP**       | chrono-node 2.8, compromise 14.14                 |
| **DnD**       | react-dnd 16.0, @dnd-kit/core 6.3                 |
| **Forms**     | react-hook-form 7.6, Zod 3.25                     |
| **Animation** | Framer Motion 12.2                                |

### Backend

| Category         | Technologies                       |
| ---------------- | ---------------------------------- |
| **Runtime**      | Node.js 20, Vercel Serverless      |
| **Database**     | PostgreSQL 15, pure SQL via `pg` 8 |
| **Auth**         | JWT, bcryptjs, Google OAuth        |
| **Validation**   | Zod (shared with the frontend)     |
| **File Storage** | Vercel Blob                        |

### Infrastructure

| Category       | Technologies                             |
| -------------- | ---------------------------------------- |
| **Deployment** | Vercel (single serverless fn + static)   |
| **Database**   | PostgreSQL with connection pooling       |
| **Caching**    | In-memory TTL cache; Redis for local dev |
| **CI/CD**      | GitHub Actions                           |

---

## Performance

**Bundle splitting** — Vite's `manualChunks` isolates the heaviest dependencies so they load only when needed:

| Chunk         | Contents                                                  | Loaded when            |
| ------------- | --------------------------------------------------------- | ---------------------- |
| **calendar**  | FullCalendar (core, daygrid, timegrid, list, interaction) | Calendar view opens    |
| **nlp**       | chrono-node, compromise                                   | Smart input is focused |
| **analytics** | recharts                                                  | Analytics dashboard    |
| **pdf**       | pdfjs-dist                                                | An attachment previews |

Routes are code-split with `React.lazy()` and the production build is tree-shaken and minified.

**Data layer** — connection pooling, composite indexes ordered by cardinality, and an in-memory TTL cache with automatic cleanup:

```typescript
// lib/utils/cache.ts — the constructor is positional, not an options object
export const taskListCache = new InMemoryCache<CachedTaskList[]>(
  5 * 60 * 1000, // TTL: 5 minutes
  500, // max entries, then eviction
  true // auto-cleanup timer
);
```

Eviction is insertion-order, not LRU: at capacity `set()` drops the first key the
`Map` yields, so a hot entry inserted early is evicted before a cold one inserted
late. The class also exposes `invalidatePattern(pattern)` for glob or regex
invalidation, but **nothing calls it yet** — cached entries currently expire on TTL
rather than being invalidated on write.

---

## Testing

Cadence ships with a broad automated test suite. The two Vitest projects run **83 test files — 58 frontend (`vitest.config.ts`) and 25 backend (`vitest.backend.config.ts`) — for 1,186 tests: 635 frontend and 551 backend, with 0 skipped.** Those are the figures the two root configs actually execute, taken from their run summaries. The tree holds 93 `*.test.ts(x)` files on disk; the other 10 live in `packages/backend` and `packages/shared`, which the root configs do not glob — they run under their own workspace-level Vitest configs (`npm test`, which fans out across workspaces). The 13 Playwright specs under `e2e/` run separately again. So 1,186 is the two-root-config total, not a whole-repo total.

The 12 that used to be skipped are the Postgres row-level-security module. They needed a live database from an environment variable that no workflow set, so they had never executed — anywhere, once. They now start their own `postgres:16` via testcontainers when `RLS_TEST_PG_ADMIN_URL` is absent, which means the isolation policies are _demonstrated_ rather than merely written. CI additionally asserts that the suite ran and that nothing was skipped, because a skipped security test and a passing one produce the same green tick.

Those policies are not a test fixture. RLS is **live in production**: `0002_enable_rls.sql` applies `ENABLE` + `FORCE ROW LEVEL SECURITY` and 22 policies across the 7 tenant tables, and since 2026-08-03 the deployed app connects as `cadence_app`, a `NOSUPERUSER NOBYPASSRLS` role (`0003_create_cadence_app_role.sql`). Every statement runs inside a transaction that binds `app.user_id` (`lib/config/database.ts`), so Postgres refuses cross-tenant rows — and refuses everything when the binding is absent. `users` and `user_profiles` are excluded from `0002`, because they are read before a user is authenticated. A later migration, `0004_enable_rls_on_identity_tables.sql`, turns RLS on for those two as well without changing who can read or write any row — and its own header is emphatic that this is uniformity and defence in depth, **not** a hole being closed: `anon` and `authenticated` were measured on 2026-08-07 to hold zero privileges on every table in `public`. Like `0002` and `0003` it is hand-run against the target database; nothing in the app applies it automatically. See `docs/RLS-CUTOVER.md`.

Coverage, measured rather than asserted:

| Suite    | Tests |       Line |    Branch |
| -------- | ----: | ---------: | --------: |
| Backend  |   551 | **67.89%** |    76.27% |
| Frontend |   635 |  see below | see below |

These figures were recorded on 2026-08-10 by `npm run readme:record`, which runs both
suites and writes `docs/readme-facts.json`. Every countable claim on this page is checked
against the code by `npm run readme:check`, which runs in CI and fails the build when a
number drifts — or when a sentence is reworded so that its number escapes checking, which
is how the previous set went stale unnoticed. The figures below this line are the
exception, and they say so.

**The frontend row is deliberately blank, because the number is not reproducible.**
`vitest.config.ts` declares no `coverage` block at all, so v8 gets no `include` and the
denominator is whatever that particular run happened to load — a hand-built
`npx vitest run --config vitest.config.ts --coverage` on 2026-08-10 reported 17.79% lines
against 66.9% branches, where an earlier run reported 18.0% / 67.1%. Those are not a
regression; they are two different denominators. There is no npm script for it and no gate.

The shape of the reading is still informative, and it is why no gate is coming: line
coverage far below branch coverage is the signature of a surface exercised by Playwright,
which a v8 pass over a Vitest run cannot observe. A line-coverage gate here would push
effort toward shallow tests that raise the number and find nothing. Fixing the _measurement_
means declaring a `coverage.include` in `vitest.config.ts`; until then the honest entry is
no entry.

```bash
npm run test:backend:coverage   # backend, with coverage
```

| Layer             | Tooling                  | Focus                                 |
| ----------------- | ------------------------ | ------------------------------------- |
| **Unit**          | Vitest + Testing Library | Components, hooks, services, parsers  |
| **Integration**   | Vitest                   | API handlers and the middleware chain |
| **E2E**           | Playwright               | Complete user workflows               |
| **Accessibility** | Testing Library          | ARIA compliance, keyboard navigation  |

```bash
npm run test:all       # full suite (backend workspaces + frontend)
npm run test:frontend  # frontend, watch mode
npm run test:backend   # backend (vitest.backend.config.ts)
npm run test:e2e       # Playwright end-to-end
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for PostgreSQL and Redis)

### Quick start

```bash
# Clone
git clone https://github.com/yadava5/cadence.git
cd cadence

# Install
npm install

# Start database services
npm run docker:up

# Run migrations
npm run db:migrate

# Start frontend + API
npm run dev
```

The app runs at `http://localhost:5173` (frontend) with the API on `http://localhost:3000`.

### Environment variables

Create a `.env.local`:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/calendar

# Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# File storage
BLOB_READ_WRITE_TOKEN=your-vercel-blob-token
```

### Common scripts

| Command             | Description                         |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Start frontend + API in development |
| `npm run build`     | Build all packages for production   |
| `npm run test:all`  | Run the complete test suite         |
| `npm run lint`      | ESLint across all workspaces        |
| `npm run docker:up` | Start PostgreSQL and Redis          |

---

## Project Structure

```
cadence/
├── src/                    # Frontend React application
│   ├── components/         # UI components (140+ files)
│   │   ├── calendar/       # Calendar views and controls
│   │   ├── tasks/          # Task management
│   │   ├── smart-input/    # NLP-powered input (parsers/)
│   │   ├── dialogs/        # Modal dialogs
│   │   └── ui/             # Base UI primitives
│   ├── hooks/              # Custom hooks + TanStack Query
│   ├── stores/             # Zustand state stores
│   └── services/api/       # API client layer
│
├── api/                    # Single catch-all serverless entry (index.ts)
├── server-handlers/        # 37 route handlers dispatched by api/index.ts
│
├── lib/                    # Backend utilities
│   ├── services/           # Business logic layer
│   ├── middleware/         # Request pipeline
│   └── config/             # Database, env, migrations
│
├── packages/
│   ├── backend/            # Local dev/Express server + migrations
│   └── shared/             # Shared types & Zod validation
│
└── docker/                 # Docker configuration
```

---

## Technical Decisions

**Pure SQL over an ORM.** Cadence uses `pg` with hand-written SQL for direct control over queries and joins, smaller serverless bundles and faster cold starts, and fully transparent, debuggable queries.

**Hybrid state management.** Splitting UI state (Zustand) from server state (TanStack Query) keeps the client bundle tiny while getting caching, optimistic updates, and background sync for free on the server side.

**Composable middleware over Express.** A custom, type-safe middleware chain avoids Express overhead in a serverless environment, keeps each stage independently testable, and makes the pipeline trivial to reorder.

---

## Implemented vs delegated vs planned

Being precise about this is the point.

### Implemented here

- **The four-parser pipeline and its conflict resolution** — `src/components/smart-input/parsers/SmartParser.ts`. Parsers are sorted by declared priority (dates 10, hashtags 9, priority 8, entities 6); `detectConflicts` then walks every pair of detections, merges overlapping spans into conflict groups with union bounds, and `resolveConflicts` keeps one winner per group ranked by parser priority and confidence. Clean text and the aggregate confidence score are computed from the survivors, and a parser that throws is caught and dropped rather than failing the whole parse.
- **The catch-all dispatcher** — `api/index.ts` matches the request path against a table of segment arrays, restores the dynamic-segment params (`req.query.id`) that Vercel's filesystem router would otherwise inject, and calls the original handler under `server-handlers/` unchanged. The handlers were never rewritten to fit the function cap; only the routing was.
- **The middleware chain** — `lib/middleware/` is hand-written: `composeMiddleware`, a `MiddlewarePipeline` class, and `conditionalMiddleware` / `methodMiddleware` combinators over CORS, request ID, rate limiting, auth, Zod validation and error handling. None of it is Express.
- **The RLS policy set** — the 22 policies and the `ENABLE` + `FORCE` pair for all seven tenant tables are written by hand in `lib/config/migrations/0002_enable_rls.sql`, and `lib/config/database.ts` binds `app.user_id` with `set_config(..., true)` so the binding is transaction-local and cannot survive a connection's return to the shared pooler.
- **The TTL cache** — `lib/utils/cache.ts` is a `Map` with per-entry expiry, insertion-order eviction at a size cap, an `unref`'d cleanup timer, glob-style `invalidatePattern`, and hit/miss/set/invalidation counters.

### Delegated, on purpose

- **The NLP primitives — chrono-node and compromise.** chrono-node resolves "next Friday" and "in 2 hours" against a reference date; compromise does the part-of-speech work behind person, place and organization detection. Both are large bodies of edge cases that a hand-rolled matcher gets wrong quietly rather than loudly. Cadence supplies the priority ordering, the span arithmetic and the conflict resolution over their output — it does not re-implement date parsing or entity tagging.
- **Calendar rendering — FullCalendar.** Day grid, time grid, list view, and the drag-and-drop hit testing that turns a drop position into a date and time. Reproducing that is a long tail of layout and timezone bugs for no gain in what the product actually does; the interesting work is what an event _means_, and that stays here.
- **Recurrence — rrule.** RFC 5545 recurrence is a specification with a reference implementation, so `src/utils/recurrence.ts` builds and reads RRULE strings through `RRule` and `rrulestr` instead of inventing a grammar. The caveat: `EventService.isValidRRule` on the server is a shallow keyword check on the way into the database, not a full RFC parse.
- **The Postgres driver — `pg`.** "Pure SQL, no ORM" is a decision about how queries are written, not about the wire protocol. `pg` owns the protocol, the connection pool and type coercion; Cadence owns every statement that runs. A hand-rolled driver would add risk to the one layer where correctness is already someone else's finished problem.

### Planned / not in this build

- **Conflict detection is not connected to anything.** `EventService.getConflicts` computes overlap start, end and duration, and `GET /api/events/conflicts` exposes it, but nothing under `src/` calls it — no client method, no hook, no UI. Saving an event that overlaps another still succeeds without a warning. Flagged inline under [Features](#features) as well, because it is the kind of thing a reader would otherwise assume.
- **Two of the three cache instances have no readers.** `taskListCache` is read by `TaskService` and invalidated by `TaskListService`; `calendarMetadataCache` and `apiResponseCache` are constructed in `lib/utils/cache.ts` and never referenced again.
- **Rate limiting is per instance, not global.** The store behind `rateLimit` in `lib/middleware/rateLimit.ts` is a process-local `Map`, so every ceiling in `rateLimitPresets` binds one warm Vercel instance rather than a user across the deployment.
- **Token revocation is per instance too.** `TokenBlacklistService` holds a `Set` in memory and `RefreshTokenService` a `Map`. A refresh token's real validity check is its signature and expiry; the blacklist is best-effort reuse detection inside one warm instance. A durable Postgres-backed rotation table is the intended fix and is not built.
- **Redis is provisioned but nothing connects to it.** `docker-compose.yml` starts `redis:7-alpine` and `lib/config/api.ts` carries a `REDIS` block, but no Redis client is a dependency of any workspace. The distributed cache and shared rate-limit store it exists for are unwritten.
- **Google Calendar sync is one-way and windowed.** `server-handlers/google/calendar.ts` pulls a fixed window — 30 days back to 90 days ahead — from the user's primary calendar into a per-user "Google" calendar, upserting on `("userId", "googleEventId")`. There is no sync token, no push channel and no delete propagation, and edits made in Cadence never travel back. The only write to Google in the whole repo is one `events.insert` — `server-handlers/google/meeting.ts` calling `GoogleOAuthService.insertCalendarEvent` for the explicit meeting-creation flow.

---

## Verify it

Every figure above ends in a file you can open or a command you can run.

**The test counts.** 1,186 is exactly two commands, one per root Vitest config:

```bash
npm run test:frontend:run   # vitest.config.ts          → 58 files, 635 tests
npm run test:backend:run    # vitest.backend.config.ts  →  25 files, 551 tests
```

The `include` globs in those two files are the whole explanation for why 1,186 is not the number of tests in the repository. `vitest.config.ts` takes `src/**/*.test.ts(x)` and excludes `packages/`, `api/`, `lib/` and `test/`; `vitest.backend.config.ts` takes `api/`, `lib/` and `server-handlers/` and excludes `src/`. Neither reaches `packages/backend` or `packages/shared` — those run under `npm run test:all`, which fans `test:run` across the workspaces first. The 13 Playwright specs in `e2e/` run under `npm run test:e2e`.

**Two caveats on that sentence, both worth knowing before you trust it.** First,
`npm run test:all` **exits 1 on a clean checkout**: `packages/backend`'s
`comprehensive-requirements.test.ts` skips all 25 of its cases without a database, but its
`afterAll` teardown still tries to connect and fails with `ECONNREFUSED ::1:5432`. Run
`npm run docker:up` first. Second, and more important, **`ci.yml` runs only
`test:frontend:run` and `test:backend:run`** — so `packages/backend` and `packages/shared`,
those last 10 files, are exercised by no workflow. They are runnable locally and ungated in
CI, which is not the same as tested.

**Coverage.**

```bash
npm run test:backend:coverage   # vitest run --config vitest.backend.config.ts --coverage
```

The v8 provider and its `include: ['api/**/*.ts', 'lib/**/*.ts']` are declared in `vitest.backend.config.ts`, so 67.89% is scoped to exactly those two trees and nothing else. The frontend row is the same kind of pass over `vitest.config.ts`; there is deliberately no script and no gate for it, for the reason given in [Testing](#testing).

**The database isolation claims.**

| Open this                                                | What it settles                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `lib/config/migrations/0002_enable_rls.sql`              | the 22 policies, and `ENABLE` + `FORCE` on all seven tenant tables                            |
| `lib/config/migrations/0003_create_cadence_app_role.sql` | that `cadence_app` is created `NOSUPERUSER NOBYPASSRLS`, so the policies bind the app         |
| `lib/config/database.ts`                                 | `set_config('app.user_id', …, true)` — transaction-local, so it cannot leak across the pooler |
| `lib/__tests__/rls.postgres.test.ts`                     | the policies enforced against a real `postgres:16`, not asserted in prose                     |
| `docs/RLS-CUTOVER.md`                                    | the cutover itself, dated, with the checks that were run after the switch                     |

**CI.** `.github/workflows/ci.yml` runs lint, typecheck, both unit suites and the build on every push and pull request to `main`. The last step of its backend job is the one worth reading: it parses the Vitest JSON report and fails the build if `rls.postgres.test.ts` reports zero tests or any skip, because a security suite that skipped and one that passed produce the same green tick. `codeql.yml`, `gitleaks.yml` and `scorecard.yml` run alongside it.

**The running thing.** [usecadenceapp.vercel.app](https://usecadenceapp.vercel.app) is the deployment these claims describe, and the [system card](https://usecadenceapp.vercel.app/system-card) is the longer account of what it does and what it does not.

---

## Author

**Ayush Yadav** — sole author and maintainer.
[github.com/yadava5](https://github.com/yadava5)

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Note that Cadence is licensed for noncommercial use (below).

---

## License

Cadence is **source-available** under the [PolyForm Noncommercial License 1.0.0](LICENSE).

You may use, run, self-host, study, and modify it for any **noncommercial** purpose. **Commercial use of any kind requires a separate license** — contact Ayush Yadav at **aesh.03.23@gmail.com** to discuss commercial licensing or sponsorship.

See the [LICENSE](LICENSE) file for the full terms.

---

<p align="center">
  Built with React, TypeScript, and PostgreSQL · <a href="https://usecadenceapp.vercel.app">usecadenceapp.vercel.app</a>
</p>
