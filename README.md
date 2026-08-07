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
- **One function, full API** — 36 route handlers are dispatched by a single catch-all serverless function, keeping the whole backend inside Vercel's Hobby-tier 12-function limit without collapsing any handler logic.
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
        Dispatch[Path Dispatcher<br/>36 routes]
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

- matches the request path against a route table of **36 handlers** (health, auth, account, calendars, events, tags, task-lists, tasks, attachments, uploads, Google integration),
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

| Middleware     | Purpose                                             |
| -------------- | --------------------------------------------------- |
| **CORS**       | Cross-origin handling with configurable origins     |
| **Request ID** | UUID per request for tracing and logging            |
| **Rate Limit** | Configurable presets (read: 100/min, write: 30/min) |
| **Auth**       | JWT verification with access/refresh token rotation |
| **Validation** | Zod schema validation for body, query, and params   |

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

**Data layer** — connection pooling, composite indexes ordered by cardinality, and a pattern-invalidating in-memory cache with automatic cleanup:

```typescript
const cache = new InMemoryCache({
  maxSize: 500,
  defaultTTL: 300000, // 5 minutes
  cleanupInterval: 60000,
});

cache.invalidatePattern('tasks:*');
```

---

## Testing

Cadence ships with a broad automated test suite. The two Vitest projects run **83 test files — 58 frontend (`vitest.config.ts`) and 25 backend (`vitest.backend.config.ts`) — for 1,185 tests: 635 frontend and 550 backend, with 0 skipped.** Those are the figures the two root configs actually execute, taken from their run summaries. The tree holds 93 `*.test.ts(x)` files on disk; the other 10 live in `packages/backend` and `packages/shared`, which the root configs do not glob — they run under their own workspace-level Vitest configs (`npm test`, which fans out across workspaces). The 13 Playwright specs under `e2e/` run separately again. So 1,185 is the two-root-config total, not a whole-repo total.

The 11 that used to be skipped are the Postgres row-level-security module. They needed a live database from an environment variable that no workflow set, so they had never executed — anywhere, once. They now start their own `postgres:16` via testcontainers when `RLS_TEST_PG_ADMIN_URL` is absent, which means the isolation policies are _demonstrated_ rather than merely written. CI additionally asserts that the suite ran and that nothing was skipped, because a skipped security test and a passing one produce the same green tick.

Those policies are not a test fixture. RLS is **live in production**: `0002_enable_rls.sql` applies `ENABLE` + `FORCE ROW LEVEL SECURITY` and 22 policies across the 7 tenant tables, and since 2026-08-03 the deployed app connects as `cadence_app`, a `NOSUPERUSER NOBYPASSRLS` role (`0003_create_cadence_app_role.sql`). Every statement runs inside a transaction that binds `app.user_id` (`lib/config/database.ts`), so Postgres refuses cross-tenant rows — and refuses everything when the binding is absent. `users` and `user_profiles` are deliberately excluded, because they are read before a user is authenticated. See `docs/RLS-CUTOVER.md`.

Coverage, measured rather than asserted:

| Suite    | Tests |      Line | Branch |
| -------- | ----: | --------: | -----: |
| Backend  |   550 | **67.7%** |  76.3% |
| Frontend |   635 |     18.0% |  67.1% |

The frontend line figure is low and is not a gap to close with component unit tests. That surface is exercised by the Playwright suite, which a v8 coverage pass over a Vitest run cannot observe — 18% lines against 67% branches is the signature of exactly that. No line-coverage gate is set on it, because such a gate pushes effort toward shallow tests that raise the number and find nothing.

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
├── server-handlers/        # 36 route handlers dispatched by api/index.ts
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
