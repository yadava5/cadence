/**
 * The headline quick-add interaction: one sentence becomes a title plus
 * structured fields. These tests run the *real* parsing pipeline (chrono +
 * compromise + priority + hashtag) so they pin what the user actually sees,
 * not a hand-built tag list.
 *
 * "Today" is frozen to Monday 2026-08-10 12:00 local so weekday phrases resolve
 * deterministically.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SmartParser } from '@/components/smart-input/parsers/SmartParser';
import { buildTaskTitle } from '@/lib/parsedTitle';
import type { ParsedTag } from '@shared/types';

const parser = new SmartParser();

const parse = async (input: string) => {
  const result = await parser.parse(input);
  return {
    title: buildTaskTitle(input, result.tags),
    tags: result.tags,
  };
};

const dateTag = (tags: ParsedTag[]) =>
  tags.find((t) => t.type === 'date' || t.type === 'time');
const priorityTag = (tags: ParsedTag[]) =>
  tags.find((t) => t.type === 'priority');

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0)); // Monday 10 Aug 2026, local
});

afterAll(() => {
  vi.useRealTimers();
});

describe('buildTaskTitle — date/time spans', () => {
  it('removes the date phrase from the reported defect', async () => {
    const { title, tags } = await parse(
      'Coffee with Priya thursday 10am #catchup'
    );

    expect(title).toBe('Coffee with Priya');
    expect(dateTag(tags)?.value).toBeInstanceOf(Date);
  });

  it.each([
    ['Buy milk tomorrow 1pm', 'Buy milk'],
    ['Team sync next monday 9:30am', 'Team sync'],
    ['Gym friday', 'Gym'],
    ['Workshop 2pm to 4pm', 'Workshop'],
    ['Dinner with mom on friday at 7pm', 'Dinner with mom'],
  ])('%s -> %s', async (input, expected) => {
    const { title, tags } = await parse(input);

    expect(title).toBe(expected);
    // The date is still parsed — only the duplicate text is gone.
    expect(dateTag(tags)).toBeDefined();
  });

  it('keeps a weekday that is part of the title', async () => {
    const { title, tags } = await parse('Write the Friday newsletter');

    // "Friday" sits mid-sentence, so it is title text, not an annotation.
    expect(title).toBe('Write the Friday newsletter');
    expect(dateTag(tags)).toBeDefined();
  });

  it('falls back to the raw text when the input is only a date', async () => {
    const { title } = await parse('tomorrow 1pm');

    expect(title).toBe('tomorrow 1pm');
  });

  it('leaves no doubled or edge whitespace behind', async () => {
    const { title } = await parse('Call   the   dentist   tomorrow 1pm');

    expect(title).toBe('Call the dentist');
    expect(title).not.toMatch(/\s{2,}|^\s|\s$/);
  });
});

describe('buildTaskTitle — priority spans', () => {
  it('removes an explicit p1 marker and the hashtag, and the trailing date', async () => {
    const { title, tags } = await parse(
      'p1 Send invoice to Acme friday #finance'
    );

    expect(title).toBe('Send invoice to Acme');
    expect(priorityTag(tags)?.value).toBe('high');
    expect(dateTag(tags)).toBeDefined();
    expect(tags.some((t) => t.type === 'label' && t.value === 'finance')).toBe(
      true
    );
  });

  it('removes an explicit "… priority" phrase', async () => {
    const { title, tags } = await parse('Review the Q3 budget high priority');

    expect(title).toBe('Review the Q3 budget');
    expect(priorityTag(tags)?.value).toBe('high');
  });

  /**
   * Deliberate: only *markers* (`p1`, "… priority") are syntax. Ordinary words
   * that also hint at priority stay in the title — there is no principled line
   * that eats "someday" but keeps "later", and eating "later" would turn
   * "Buy milk later" into "Buy milk". The priority is still applied.
   */
  it.each([
    ['Buy milk later', 'Buy milk later', 'low'],
    ['urgent Fix the login bug', 'urgent Fix the login bug', 'high'],
    ['Plan trip someday', 'Plan trip someday', 'low'],
    ['Call mom no rush', 'Call mom no rush', 'low'],
  ])(
    'keeps the prose priority hint in %s',
    async (input, expected, expectedPriority) => {
      const { title, tags } = await parse(input);

      expect(title).toBe(expected);
      expect(priorityTag(tags)?.value).toBe(expectedPriority);
    }
  );
});

describe('buildTaskTitle — hashtags and robustness', () => {
  it('removes every hashtag chip', async () => {
    const { title } = await parse('Renew passport #travel #admin');

    expect(title).toBe('Renew passport');
  });

  it('returns the input unchanged when nothing was parsed', async () => {
    const { title } = await parse('Refactor the widget module');

    expect(title).toBe('Refactor the widget module');
  });

  it('ignores stale spans that no longer match the text', () => {
    const stale = [
      { type: 'label', source: 'hashtag-parser', startIndex: 4, endIndex: 9 },
      {
        type: 'date',
        source: 'chrono-date-parser',
        startIndex: 90,
        endIndex: 99,
      },
    ] as const;

    expect(buildTaskTitle('Buy milk', stale)).toBe('Buy milk');
  });
});
