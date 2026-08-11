/**
 * RRULE validation — what the server accepts, and what it must not.
 *
 * The predecessor checked that each `KEY=VALUE` part's KEY was in an allowlist
 * and never looked at a value, so `RRULE:FREQ=SECONDLY` was stored happily.
 * The client expands with `rule.between(rangeStart, rangeEnd, true)`
 * (`src/utils/recurrence.ts`), which walks occurrences from DTSTART forward —
 * so a SECONDLY rule is ~2.6 million Date objects for one month view, from one
 * POST. The FREQ allowlist is the fix for that.
 *
 * ## A deliberate deviation, pinned here
 *
 * The audit also asked for COUNT-or-UNTIL to be REQUIRED. That is not
 * implemented, and this file pins the opposite, because two independent facts
 * say unbounded rules are valid behaviour in this app:
 *
 *   - `ends: 'never'` is the DEFAULT in the recurrence editor
 *     (`RecurrenceSection.tsx:56`, `EventCreationDialog.tsx:620`) and
 *     `generateRRule` emits COUNT/UNTIL only for 'after'/'on'. Requiring a
 *     bound would make "Never ends" return 400 — and `src/components/**` was
 *     off-limits to this change, so it could not have been fixed on the way
 *     past.
 *   - Two committed EventService tests (`:377`, `:891`) already assert
 *     unbounded weekly rules are accepted.
 *
 * Because expansion is window-bounded, occurrence DENSITY is what matters and
 * total count is not: unbounded `FREQ=WEEKLY` is ~1000 iterations over 20
 * years. COUNT is still capped, as a sanity bound on a number the client sends.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventService } from '../EventService.js';

vi.mock('../../config/database.js', () => {
  const query = vi.fn();
  return { query, pool: { query } };
});

const service = new EventService();
const problem = (rule: string) => service.validateRRule(rule);

describe('EventService.validateRRule', () => {
  describe('rejects', () => {
    it.each([
      ['RRULE:FREQ=SECONDLY'],
      ['RRULE:FREQ=SECONDLY;COUNT=10'],
      ['RRULE:FREQ=MINUTELY;COUNT=5'],
      ['RRULE:FREQ=HOURLY;UNTIL=20261231T235959Z'],
    ])('the high-frequency rule %s', (rule) => {
      expect(problem(rule)).toMatch(/only DAILY, WEEKLY, MONTHLY, YEARLY/);
    });

    it('a rule with no FREQ at all', () => {
      expect(problem('RRULE:INTERVAL=1;BYDAY=MO')).toBe('is missing FREQ');
    });

    it('a COUNT above the ceiling', () => {
      expect(problem('RRULE:FREQ=DAILY;COUNT=100000')).toBe(
        'has COUNT=100000; the maximum is 1000'
      );
    });

    it.each([
      ['RRULE:FREQ=DAILY;COUNT=abc'],
      ['RRULE:FREQ=DAILY;COUNT=0'],
      ['RRULE:FREQ=DAILY;COUNT=-3'],
    ])('a nonsensical COUNT in %s', (rule) => {
      expect(problem(rule)).not.toBeNull();
    });

    it.each([
      ['RRULE:FREQ=DAILY;INTERVAL=0'],
      ['RRULE:FREQ=DAILY;INTERVAL=abc'],
      ['RRULE:FREQ=DAILY;INTERVAL=99999'],
    ])('a nonsensical INTERVAL in %s', (rule) => {
      expect(problem(rule)).not.toBeNull();
    });

    it('an unparseable UNTIL', () => {
      expect(problem('RRULE:FREQ=DAILY;UNTIL=garbage')).toMatch(
        /unparseable UNTIL/
      );
    });

    it('an impossible date in UNTIL that Date.UTC would roll over', () => {
      expect(problem('RRULE:FREQ=DAILY;UNTIL=20241340')).toMatch(
        /unparseable UNTIL/
      );
    });

    it('COUNT and UNTIL together, which RFC 5545 forbids', () => {
      expect(
        problem('RRULE:FREQ=DAILY;COUNT=5;UNTIL=20261231T235959Z')
      ).toMatch(/at most one/);
    });

    it('a part outside the key allowlist', () => {
      expect(problem('RRULE:FREQ=DAILY;EXDATE=20240101')).toMatch(
        /unsupported part "EXDATE"/
      );
    });

    it('a missing RRULE: prefix', () => {
      expect(problem('FREQ=DAILY')).toBe('must start with "RRULE:"');
    });

    it('a repeated key', () => {
      expect(problem('RRULE:FREQ=DAILY;FREQ=WEEKLY')).toMatch(/repeats "FREQ"/);
    });

    it('an empty value', () => {
      expect(problem('RRULE:FREQ=')).toMatch(/empty value/);
    });
  });

  describe('accepts', () => {
    it.each([
      // The two rules committed EventService tests already depend on.
      ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'],
      ['RRULE:FREQ=WEEKLY;BYDAY=TU,TH'],
      ['RRULE:FREQ=DAILY;COUNT=10'],
      ['RRULE:FREQ=DAILY;COUNT=30'],
      ['RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15;UNTIL=20241231T235959Z'],
      ['RRULE:FREQ=YEARLY;INTERVAL=2'],
      ['RRULE:FREQ=DAILY;UNTIL=20261231'],
    ])('%s', (rule) => {
      expect(problem(rule)).toBeNull();
    });

    it('an unbounded rule — "Never ends" is the editor default', () => {
      expect(problem('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO')).toBeNull();
    });

    it('BYSETPOS, which the old allowlist rejected', () => {
      // `generateRRule` emits BYSETPOS for monthly "2nd Tuesday" and yearly
      // nth-weekday rules (`src/utils/recurrence.ts:78,85`). The old validator
      // had no BYSETPOS key, so the API rejected both in production.
      expect(problem('RRULE:FREQ=MONTHLY;INTERVAL=1;BYDAY=TU;BYSETPOS=2')).toBe(
        null
      );
      expect(
        problem('RRULE:FREQ=YEARLY;INTERVAL=1;BYMONTH=3;BYDAY=MO;BYSETPOS=1')
      ).toBeNull();
    });

    it('a COUNT exactly at the ceiling', () => {
      expect(problem('RRULE:FREQ=DAILY;COUNT=1000')).toBeNull();
    });
  });
});
