/**
 * The landing page's chips, checked against the parser that produces them.
 *
 * These assertions run the app's real SmartParser, not a stand in. That is the
 * point: the showcase's previous fixture claimed a parse the product cannot
 * produce, and the only check that would have caught it is one that executes
 * the parser. If the parser's behaviour changes, this fails and the landing
 * page is corrected, rather than the page quietly lying.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { parseShowcase, toShowcase } from '../showcaseParse';
import { FINALE_SENTENCES, SHOWCASE_SENTENCES } from '@/pages/welcomeSentences';

describe('the landing showcase sentences', () => {
  beforeAll(() => {
    // Only the clock is faked: the parser is dynamically imported and must
    // still resolve. Monday 10 August 2026, so "thursday" and "friday" are
    // three and four days out and keep their weekday names.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0, 0));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('reads the timed sentence as an event, with its real fields', async () => {
    const result = await parseShowcase(SHOWCASE_SENTENCES[0]);

    expect(SHOWCASE_SENTENCES[0]).toBe('Coffee with Priya thursday 10am');
    expect(result.chips).toEqual([
      ['event', 'Coffee with Priya'],
      ['when', 'Thursday at 10:00 AM'],
      ['tag', 'Social'],
    ]);
    expect(result.filed).toMatchObject({ kind: 'event', day: 3 });
  });

  it('reads the dated sentence as a task, with priority and tag', async () => {
    const result = await parseShowcase(SHOWCASE_SENTENCES[1]);

    expect(SHOWCASE_SENTENCES[1]).toBe('Ship the report friday p1 #work');
    expect(result.chips).toEqual([
      ['task', 'Ship the report'],
      ['due', 'Friday'],
      ['priority', 'high'],
      ['tag', 'Work'],
    ]);
    expect(result.filed).toMatchObject({ kind: 'task', day: 4 });
  });

  it('never labels a hashtag a list, because the parser has no lists', async () => {
    for (const sentence of [...SHOWCASE_SENTENCES, ...FINALE_SENTENCES]) {
      const { chips } = await parseShowcase(sentence);
      expect(chips.map(([kind]) => kind)).not.toContain('list');
    }
  });

  it('shows one chip per distinct value', async () => {
    // "#work" and the word "report" both resolve to the label Work.
    const { chips } = await parseShowcase('Ship the report friday p1 #work');
    const tagValues = chips.filter(([kind]) => kind === 'tag');

    expect(tagValues).toHaveLength(1);
    expect(new Set(chips.map((c) => c.join(':'))).size).toBe(chips.length);
  });

  it('files every finale sentence on the weekday it names', async () => {
    const results = await Promise.all(FINALE_SENTENCES.map(parseShowcase));

    for (const [i, result] of results.entries()) {
      expect(
        result.filed,
        `${FINALE_SENTENCES[i]} produced no date`
      ).not.toBeNull();
      expect(
        result.filed!.day,
        `${FINALE_SENTENCES[i]} landed off the working week`
      ).not.toBeNull();
      expect(result.filed!.label.length).toBeGreaterThan(0);
    }
  });

  it('degrades to a bare title when the parser gives nothing back', () => {
    const result = toShowcase('a sentence', {
      title: 'A sentence',
      hasWhen: false,
      allDay: false,
      extraTags: [],
    });

    expect(result.chips).toEqual([['task', 'A sentence']]);
    expect(result.filed).toBeNull();
  });
});
