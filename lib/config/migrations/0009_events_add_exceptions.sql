-- 0009_events_add_exceptions.sql
-- ============================================================================
-- Give a recurring event's deleted occurrences somewhere to live.
--
-- HAND-RUN against the target database, same as 0001–0008. Nothing in the app
-- applies it. Apply it BEFORE deploying the EventService change that writes the
-- column: an UPDATE naming a column that does not exist fails the whole
-- statement, so the order matters for "delete this occurrence" (the only
-- caller that sends `exceptions`).
--
-- ## WHAT WAS WRONG
--
-- "Delete this occurrence" sends `PUT /api/events/:id { exceptions: [...] }`.
-- The client has always modelled exceptions (`CalendarEvent.exceptions`, and
-- `src/utils/recurrence.ts` skips them during expansion), but the server had no
-- column, no DTO field and no SET clause for them, so the request returned 200
-- and the occurrence came back on the next fetch. Only offline mode, which
-- keeps events in localStorage, ever remembered one. An .ics export of a
-- server-backed calendar could not carry EXDATEs the server had thrown away.
--
-- ## SHAPE
--
-- TEXT[] of ISO-8601 instants, exactly the strings the client compares against
-- (`start.toISOString()` of the occurrence). Not TIMESTAMP[]: the comparison is
-- string equality, and the service canonicalises each entry through
-- `new Date(...).toISOString()` on the way in, so the stored form is the
-- compared form. NOT NULL DEFAULT '{}' so every existing row reads as "no
-- exceptions" rather than NULL, and no reader needs a null check.
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS`.
-- ============================================================================

BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS "exceptions" TEXT[] NOT NULL DEFAULT '{}';

COMMIT;
