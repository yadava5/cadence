/**
 * Event Service - Concrete implementation of BaseService for Event operations
 */
import {
  BaseService,
  type ServiceContext,
  type UserOwnedEntity,
  MAX_LIST_ROWS,
} from './BaseService.js';
import { query } from '../config/database.js';

/**
 * Event entity interface extending base
 */
export interface EventEntity extends UserOwnedEntity {
  title: string;
  description: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  recurrence: string | null;
  calendarId: string;
  createdAt: Date;
  updatedAt: Date;

  // Relations (optional for different query contexts)
  calendar?: {
    id: string;
    name: string;
    color: string;
    isVisible: boolean;
  };
}

/**
 * Event creation DTO
 */
export interface CreateEventDTO {
  title: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
  notes?: string;
  calendarId: string;
  allDay?: boolean;
  recurrence?: string;
}

/**
 * Event update DTO
 */
export interface UpdateEventDTO {
  title?: string;
  start?: Date;
  end?: Date;
  description?: string;
  location?: string;
  notes?: string;
  calendarId?: string;
  allDay?: boolean;
  recurrence?: string;
}

/**
 * Event filters interface
 */
export interface EventFilters {
  calendarId?: string;
  start?: Date;
  end?: Date;
  search?: string;
  allDay?: boolean;
  hasRecurrence?: boolean;
  calendarIds?: string[];
}

/**
 * Event conflict interface
 */
export interface EventConflict {
  conflictingEvent: EventEntity;
  overlapStart: Date;
  overlapEnd: Date;
  overlapDuration: number; // in minutes
}

/**
 * Recurrence rule limits, enforced server-side.
 *
 * ## What actually hangs a calendar
 *
 * The old validator checked that each part's *key* was in an allowlist and
 * never looked at a single *value*, so `RRULE:FREQ=SECONDLY` was accepted and
 * stored. The client expands with `rule.between(rangeStart, rangeEnd, true)`
 * (`src/utils/recurrence.ts`), which walks occurrences from DTSTART forward, so
 * a SECONDLY rule is ~2.6 million Date objects for a single month view — for
 * one POST. That is the whole hang, and the FREQ allowlist is the whole fix.
 *
 * ## Why an unbounded rule is NOT rejected here
 *
 * Because expansion is window-bounded, occurrence *density* is what matters and
 * total count is not: unbounded `FREQ=WEEKLY` costs ~1000 iterations over 20
 * years. Rejecting rules with neither COUNT nor UNTIL would also break shipped,
 * working behaviour — `ends: 'never'` is the DEFAULT in the recurrence editor
 * (`src/components/dialogs/RecurrenceSection.tsx:56`,
 * `EventCreationDialog.tsx:620`) and `generateRRule` emits COUNT/UNTIL only for
 * 'after'/'on', so "Never ends" would start returning 400. Two committed tests
 * (`EventService.test.ts:377` and `:891`) also pin unbounded weekly rules as
 * valid.
 *
 * ## The ceiling
 *
 * 1000 occurrences, applied to an explicit COUNT. At the coarsest useful
 * granularity that is a daily event for 2.7 years or a weekly one for 19 —
 * past any real calendar entry, and it matches `MAX_LIST_ROWS`, the ceiling
 * already used for list reads. It is a sanity bound on a number a client sends,
 * not the DoS control; note that the editor's occurrence input has `min={1}`
 * and no max, so a user can type 100000 today and gets a named 400 instead of a
 * stored rule.
 *
 * `BYSETPOS` is in the key allowlist and was not before. `generateRRule` emits
 * it for monthly "2nd Tuesday" and yearly nth-weekday rules
 * (`src/utils/recurrence.ts:78,85`), so those were rejected by the API in
 * production — a live bug, independent of everything above.
 */
const RRULE_ALLOWED_KEYS = new Set([
  'FREQ',
  'INTERVAL',
  'COUNT',
  'UNTIL',
  'BYDAY',
  'BYMONTH',
  'BYMONTHDAY',
  'BYSETPOS',
  'WKST',
]);
const RRULE_ALLOWED_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const MAX_RRULE_COUNT = 1000;
const MAX_RRULE_INTERVAL = 1000;

/**
 * Parse an RFC 5545 UNTIL value (`19970902T090000Z` or `19970902`).
 *
 * `new Date()` cannot read this format — `new Date('20241231T235959Z')` is an
 * Invalid Date — which is why it is parsed by hand. The round-trip check
 * rejects impossible dates that `Date.UTC` would silently roll over
 * (`20241340` becoming 2025-02-09).
 */
function parseRRuleUntil(value: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(
    value
  );
  if (!match) return null;

  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  const parsed = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
  );

  if (Number.isNaN(parsed.getTime())) return null;
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return parsed;
}

/**
 * EventService - Handles all event-related operations
 */
export class EventService extends BaseService<
  EventEntity,
  CreateEventDTO,
  UpdateEventDTO,
  EventFilters
> {
  protected getTableName(): string {
    return 'events';
  }

  protected getEntityName(): string {
    return 'Event';
  }

  /**
   * Find an event by id, scoped to the authenticated user.
   *
   * SECURITY: without this override the inherited BaseService.findById would
   * return ANY event by id (cross-tenant IDOR read of another user's calendar
   * data). The authenticated route always supplies context.userId.
   */
  async findById(
    id: string,
    context?: ServiceContext
  ): Promise<EventEntity | null> {
    const params: unknown[] = [id];
    let where = 'id = $1';
    if (context?.userId) {
      params.push(context.userId);
      where += ` AND "userId" = $${params.length}`;
    }
    const res = await query(
      `SELECT * FROM events WHERE ${where} LIMIT 1`,
      params,
      this.db
    );
    if (res.rowCount === 0) return null;
    return this.transformEntity(res.rows[0]);
  }

  /**
   * Delete an event, scoped to the authenticated user.
   *
   * SECURITY: without this override the inherited BaseService.delete would
   * delete ANY event by id (cross-tenant IDOR delete). Returns false when no
   * row matched (not found OR not owned) → route responds 404.
   */
  async delete(id: string, context?: ServiceContext): Promise<boolean> {
    const params: unknown[] = [id];
    let where = 'id = $1';
    if (context?.userId) {
      params.push(context.userId);
      where += ` AND "userId" = $${params.length}`;
    }
    const res = await query(
      `DELETE FROM events WHERE ${where}`,
      params,
      this.db
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Override create to satisfy required relations (user, calendar)
   */
  async create(
    data: CreateEventDTO,
    context?: ServiceContext
  ): Promise<EventEntity> {
    try {
      this.log('create', { data }, context);
      await this.validateCreate(data, context);
      await this.ensureUserExists(context?.userId, 'dev@example.com');

      const inserted = await query(
        `INSERT INTO events (id, title, description, start, "end", "allDay", location, notes, recurrence, "userId", "calendarId", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         RETURNING *`,
        [
          data.title.trim(),
          data.description?.trim() || null,
          data.start,
          data.end,
          data.allDay ?? false,
          data.location?.trim() || null,
          data.notes?.trim() || null,
          data.recurrence || null,
          context!.userId!,
          data.calendarId,
        ],
        this.db
      );

      const row = inserted.rows[0];
      this.log('create:success', { id: row.id }, context);
      return this.transformEntity(row);
    } catch (error) {
      this.log(
        'create:error',
        { error: (error as Error).message, data },
        context
      );
      throw error;
    }
  }

  protected buildWhereClause(
    filters: EventFilters,
    context?: ServiceContext
  ): { sql: string; params: unknown[] } {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (context?.userId) {
      params.push(context.userId);
      clauses.push('"userId" = $' + params.length);
    }
    if (filters.calendarId) {
      params.push(filters.calendarId);
      clauses.push('"calendarId" = $' + params.length);
    }
    if (filters.calendarIds && filters.calendarIds.length > 0) {
      const placeholders = filters.calendarIds
        .map((_, i) => '$' + (params.length + i + 1))
        .join(',');
      params.push(...filters.calendarIds);
      clauses.push('"calendarId" IN (' + placeholders + ')');
    }
    if (filters.start) {
      params.push(filters.start);
      clauses.push('"end" >= $' + params.length);
    }
    if (filters.end) {
      params.push(filters.end);
      clauses.push('start <= $' + params.length);
    }
    if (filters.search) {
      params.push('%' + filters.search + '%');
      const idx = params.length;
      clauses.push(
        `(title ILIKE $${idx} OR description ILIKE $${idx} OR location ILIKE $${idx} OR notes ILIKE $${idx})`
      );
    }
    if (filters.allDay !== undefined) {
      params.push(filters.allDay);
      clauses.push('"allDay" = $' + params.length);
    }
    if (filters.hasRecurrence !== undefined) {
      clauses.push(
        filters.hasRecurrence ? 'recurrence IS NOT NULL' : 'recurrence IS NULL'
      );
    }
    const sql = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    return { sql, params };
  }

  async findAll(
    filters: EventFilters = {},
    context?: ServiceContext
  ): Promise<EventEntity[]> {
    try {
      this.log('findAll', { filters }, context);
      const { sql, params } = this.buildWhereClause(filters, context);
      const order = 'ORDER BY start ASC, "createdAt" DESC';
      const res = await query<EventEntity>(
        `SELECT * FROM events ${sql} ${order} LIMIT $${params.length + 1}`,
        [...params, MAX_LIST_ROWS + 1],
        this.db
      );
      const base = this.capRows(res.rows, context).map((row) =>
        this.transformEntity(row)
      );
      return await this.enrichEntities(base, context);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.log('findAll:error', { error: message, filters }, context);
      throw error;
    }
  }

  protected async enrichEntities(
    entities: EventEntity[],
    _context?: ServiceContext
  ): Promise<EventEntity[]> {
    if (!entities.length) return entities;
    const calendarIds = Array.from(new Set(entities.map((e) => e.calendarId)));
    const placeholders = calendarIds.map((_, i) => `$${i + 1}`).join(',');
    type CalendarSummary = {
      id: string;
      name: string;
      color: string;
      isVisible: boolean;
    };
    const calendars = await query<CalendarSummary>(
      `SELECT id, name, color, "isVisible" FROM calendars WHERE id IN (${placeholders})`,
      calendarIds,
      this.db
    );
    const calMap = new Map<string, CalendarSummary>();
    calendars.rows.forEach((calendar) => calMap.set(calendar.id, calendar));
    return entities.map((e) => ({ ...e, calendar: calMap.get(e.calendarId) }));
  }

  /**
   * Validate event creation
   */
  protected async validateCreate(
    data: CreateEventDTO,
    context?: ServiceContext
  ): Promise<void> {
    if (!data.title?.trim()) {
      throw new Error('VALIDATION_ERROR: Event title is required');
    }

    if (!data.start || !data.end) {
      throw new Error(
        'VALIDATION_ERROR: Event start and end dates are required'
      );
    }

    // Validate start is before end (unless it's all-day)
    if (!data.allDay && data.start >= data.end) {
      throw new Error('VALIDATION_ERROR: Event start must be before end time');
    }

    // Validate calendar exists and user owns it
    if (context?.userId) {
      const calendar = await query(
        'SELECT id FROM calendars WHERE id = $1 AND "userId" = $2 LIMIT 1',
        [data.calendarId, context.userId],
        this.db
      );
      if (calendar.rowCount === 0) {
        throw new Error(
          'VALIDATION_ERROR: Calendar not found or access denied'
        );
      }
    }

    // Validate recurrence format if provided
    if (data.recurrence) {
      const problem = this.validateRRule(data.recurrence);
      if (problem) {
        throw new Error(`VALIDATION_ERROR: Recurrence rule ${problem}`);
      }
    }
  }

  /**
   * Validate event updates
   */
  protected async validateUpdate(
    id: string,
    data: UpdateEventDTO,
    context?: ServiceContext
  ): Promise<void> {
    if (data.title !== undefined && !data.title?.trim()) {
      throw new Error('VALIDATION_ERROR: Event title cannot be empty');
    }

    if (context?.userId) {
      const hasAccess = await this.checkOwnership(id, context.userId);
      if (!hasAccess) {
        throw new Error('AUTHORIZATION_ERROR: Access denied');
      }
    }

    // Get current event data for validation
    const currentRes = await query(
      'SELECT start, "end", "allDay" FROM events WHERE id = $1',
      [id],
      this.db
    );
    const currentEvent = currentRes.rows[0];

    if (!currentEvent) {
      throw new Error('NOT_FOUND: Event not found');
    }

    // Validate start/end relationship
    const start =
      (typeof data.start === 'string' ? new Date(data.start) : data.start) ??
      currentEvent.start;
    const end =
      (typeof data.end === 'string' ? new Date(data.end) : data.end) ??
      currentEvent.end;
    const allDay = data.allDay ?? currentEvent.allDay;

    if (!allDay && start >= end) {
      throw new Error('VALIDATION_ERROR: Event start must be before end time');
    }

    // Validate calendar if being updated
    if (data.calendarId && context?.userId) {
      const calendar = await query(
        'SELECT id FROM calendars WHERE id = $1 AND "userId" = $2 LIMIT 1',
        [data.calendarId, context.userId],
        this.db
      );
      if (calendar.rowCount === 0) {
        throw new Error(
          'VALIDATION_ERROR: Calendar not found or access denied'
        );
      }
    }

    // Validate recurrence format if provided
    if (data.recurrence) {
      const problem = this.validateRRule(data.recurrence);
      if (problem) {
        throw new Error(`VALIDATION_ERROR: Recurrence rule ${problem}`);
      }
    }
  }

  /**
   * Update event by ID
   */
  async update(
    id: string,
    data: UpdateEventDTO,
    context?: ServiceContext
  ): Promise<EventEntity | null> {
    await this.validateUpdate(id, data, context);

    const sets: string[] = [];
    const params: Array<string | boolean | null | Date> = [];

    if (data.title !== undefined) {
      params.push(data.title.trim());
      sets.push(`title = $${params.length}`);
    }
    if (data.description !== undefined) {
      params.push(data.description?.trim() || null);
      sets.push(`description = $${params.length}`);
    }
    if (data.start !== undefined) {
      const d =
        typeof data.start === 'string' ? new Date(data.start) : data.start;
      params.push(d);
      sets.push(`start = $${params.length}`);
    }
    if (data.end !== undefined) {
      const d = typeof data.end === 'string' ? new Date(data.end) : data.end;
      params.push(d);
      sets.push(`"end" = $${params.length}`);
    }
    if (data.allDay !== undefined) {
      params.push(!!data.allDay);
      sets.push(`"allDay" = $${params.length}`);
    }
    if (data.location !== undefined) {
      params.push(data.location?.trim() || null);
      sets.push(`location = $${params.length}`);
    }
    if (data.notes !== undefined) {
      params.push(data.notes?.trim() || null);
      sets.push(`notes = $${params.length}`);
    }
    if (data.recurrence !== undefined) {
      params.push(data.recurrence || null);
      sets.push(`recurrence = $${params.length}`);
    }
    if (data.calendarId !== undefined) {
      params.push(data.calendarId);
      sets.push(`"calendarId" = $${params.length}`);
    }

    params.push(new Date());
    sets.push(`"updatedAt" = $${params.length}`);
    params.push(id);

    const sql = `UPDATE events SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`;
    const res = await query(sql, params, this.db);
    if (res.rowCount === 0) return null;
    const base = this.transformEntity(res.rows[0]);
    const [enriched] = await this.enrichEntities([base], context);
    return enriched;
  }

  /**
   * Find events by date range
   */
  async findByDateRange(
    start: Date,
    end: Date,
    context?: ServiceContext
  ): Promise<EventEntity[]> {
    const filters: EventFilters = { start, end };
    return await this.findAll(filters, context);
  }

  /**
   * Find events by calendar
   */
  async findByCalendar(
    calendarId: string,
    context?: ServiceContext
  ): Promise<EventEntity[]> {
    const filters: EventFilters = { calendarId };
    return await this.findAll(filters, context);
  }

  /**
   * Find upcoming events
   */
  async findUpcoming(
    limit: number = 10,
    context?: ServiceContext
  ): Promise<EventEntity[]> {
    if (!context?.userId) {
      throw new Error('AUTHORIZATION_ERROR: User ID required');
    }

    try {
      this.log('findUpcoming', { limit }, context);

      const now = new Date();
      const res = await query<EventEntity>(
        `SELECT e.*
         FROM events e
         JOIN calendars c ON c.id = e."calendarId"
         WHERE e."userId" = $1 AND e.start >= $2 AND c."isVisible" = true
         ORDER BY e.start ASC
         LIMIT $3`,
        [context.userId!, now, limit],
        this.db
      );
      const base = res.rows.map((row) => this.transformEntity(row));
      const enriched = await this.enrichEntities(base, context);
      this.log('findUpcoming:success', { count: enriched.length }, context);
      return enriched;
    } catch (error) {
      this.log('findUpcoming:error', { error: error.message, limit }, context);
      throw error;
    }
  }

  /**
   * Search events by query
   */
  async search(
    query: string,
    context?: ServiceContext
  ): Promise<EventEntity[]> {
    const filters: EventFilters = { search: query };
    return await this.findAll(filters, context);
  }

  /**
   * Get event conflicts for a new or updated event
   */
  async getConflicts(
    eventData: CreateEventDTO | UpdateEventDTO,
    excludeId?: string,
    context?: ServiceContext
  ): Promise<EventConflict[]> {
    if (!context?.userId) {
      throw new Error('AUTHORIZATION_ERROR: User ID required');
    }

    if (!eventData.start || !eventData.end) {
      return []; // No conflicts if no time specified
    }

    try {
      this.log('getConflicts', { eventData, excludeId }, context);

      const params: Array<string | Date> = [
        context.userId!,
        eventData.end!,
        eventData.start!,
      ];
      const and: string[] = ['e."userId" = $1', 'e.start < $2', 'e."end" > $3'];
      if (excludeId) {
        params.push(excludeId);
        and.push('e.id <> $' + params.length);
      }
      if (eventData.calendarId) {
        params.push(eventData.calendarId);
        and.push('e."calendarId" = $' + params.length);
      }
      const sql = `SELECT e.* FROM events e WHERE ${and.join(' AND ')}`;
      const res = await query<EventEntity>(sql, params, this.db);
      const conflictingEvents = res.rows;

      const conflicts: EventConflict[] = conflictingEvents.map(
        (conflictEvent) => {
          const overlapStart = new Date(
            Math.max(eventData.start!.getTime(), conflictEvent.start.getTime())
          );
          const overlapEnd = new Date(
            Math.min(eventData.end!.getTime(), conflictEvent.end.getTime())
          );
          const overlapDuration = Math.round(
            (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60)
          );

          return {
            conflictingEvent: this.transformEntity(conflictEvent),
            overlapStart,
            overlapEnd,
            overlapDuration,
          };
        }
      );

      this.log(
        'getConflicts:success',
        { conflictCount: conflicts.length },
        context
      );
      return conflicts;
    } catch (error) {
      this.log(
        'getConflicts:error',
        { error: error.message, eventData },
        context
      );
      throw error;
    }
  }

  /**
   * Get events for a specific month (optimized for calendar view)
   */
  async findByMonth(
    year: number,
    month: number,
    context?: ServiceContext
  ): Promise<EventEntity[]> {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    return await this.findByDateRange(startOfMonth, endOfMonth, context);
  }

  /**
   * Get events for today
   */
  async findToday(context?: ServiceContext): Promise<EventEntity[]> {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );

    return await this.findByDateRange(startOfDay, endOfDay, context);
  }

  /**
   * Get events for this week
   */
  async findThisWeek(context?: ServiceContext): Promise<EventEntity[]> {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return await this.findByDateRange(startOfWeek, endOfWeek, context);
  }

  /**
   * Create recurring events (basic implementation)
   */
  async createRecurring(
    data: CreateEventDTO,
    context?: ServiceContext
  ): Promise<EventEntity[]> {
    if (!data.recurrence) {
      // If no recurrence, create single event
      const event = await this.create(data, context);
      return [event];
    }

    // For now, create just the master event
    // In a full implementation, you'd parse the RRULE and create instances
    const masterEvent = await this.create(data, context);

    // TODO: Implement full recurring event logic with RRULE parsing
    // This would involve:
    // 1. Parsing the RRULE string
    // 2. Generating occurrence dates
    // 3. Creating individual event instances or using a virtual approach

    return [masterEvent];
  }

  /**
   * Move event to different calendar
   */
  async moveToCalendar(
    eventId: string,
    newCalendarId: string,
    context?: ServiceContext
  ): Promise<EventEntity> {
    return await this.update(eventId, { calendarId: newCalendarId }, context);
  }

  /**
   * Duplicate event
   */
  async duplicate(id: string, context?: ServiceContext): Promise<EventEntity> {
    const originalEvent = await this.findById(id, context);
    if (!originalEvent) {
      throw new Error('NOT_FOUND: Event not found');
    }

    // Create duplicate with modified title
    const duplicateData: CreateEventDTO = {
      title: `Copy of ${originalEvent.title}`,
      start: originalEvent.start,
      end: originalEvent.end,
      description: originalEvent.description,
      location: originalEvent.location,
      notes: originalEvent.notes,
      calendarId: originalEvent.calendarId,
      allDay: originalEvent.allDay,
      recurrence: originalEvent.recurrence,
    };

    return await this.create(duplicateData, context);
  }

  /**
   * RRULE validation. Returns a human-readable problem, or null when valid.
   *
   * The predecessor inspected only the KEY of each `KEY=VALUE` part, so every
   * value was unchecked: `FREQ=SECONDLY` passed, `INTERVAL=abc` passed,
   * `COUNT=-5` passed. See the block comment above `RRULE_ALLOWED_KEYS` for
   * what is bounded here and what deliberately is not.
   */
  validateRRule(rrule: string): string | null {
    if (!rrule.startsWith('RRULE:')) {
      return 'must start with "RRULE:"';
    }

    const body = rrule.slice('RRULE:'.length);
    if (!body.trim()) {
      return 'has no parts';
    }

    const parts = new Map<string, string>();
    for (const segment of body.split(';')) {
      if (!segment) continue;

      const separator = segment.indexOf('=');
      if (separator < 1) {
        return `has a malformed part "${segment}"`;
      }

      const key = segment.slice(0, separator).toUpperCase();
      // Value keeps its original case so it can be quoted back verbatim in the
      // message; the two places that compare it uppercase at the comparison.
      const value = segment.slice(separator + 1);

      if (!RRULE_ALLOWED_KEYS.has(key)) {
        return `has an unsupported part "${key}"`;
      }
      if (parts.has(key)) {
        return `repeats "${key}"`;
      }
      if (!value) {
        return `has an empty value for "${key}"`;
      }
      parts.set(key, value);
    }

    const freq = parts.get('FREQ')?.toUpperCase();
    if (!freq) {
      return 'is missing FREQ';
    }
    if (!RRULE_ALLOWED_FREQUENCIES.includes(freq)) {
      return `has FREQ=${freq}; only ${RRULE_ALLOWED_FREQUENCIES.join(', ')} are supported`;
    }

    const interval = parts.get('INTERVAL');
    if (interval !== undefined) {
      if (!/^\d+$/.test(interval)) {
        return `has a non-numeric INTERVAL "${interval}"`;
      }
      const parsed = Number(interval);
      if (parsed < 1 || parsed > MAX_RRULE_INTERVAL) {
        return `has INTERVAL=${parsed}; must be between 1 and ${MAX_RRULE_INTERVAL}`;
      }
    }

    const count = parts.get('COUNT');
    const until = parts.get('UNTIL');

    if (count !== undefined && until !== undefined) {
      return 'sets both COUNT and UNTIL; RFC 5545 allows at most one';
    }

    if (count !== undefined) {
      if (!/^\d+$/.test(count)) {
        return `has a non-numeric COUNT "${count}"`;
      }
      const parsed = Number(count);
      if (parsed < 1) {
        return 'has COUNT=0; a rule must have at least one occurrence';
      }
      if (parsed > MAX_RRULE_COUNT) {
        return `has COUNT=${parsed}; the maximum is ${MAX_RRULE_COUNT}`;
      }
    }

    if (until !== undefined && parseRRuleUntil(until.toUpperCase()) === null) {
      return `has an unparseable UNTIL "${until}"`;
    }

    return null;
  }
}
