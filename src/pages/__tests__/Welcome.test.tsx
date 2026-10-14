/**
 * The landing page renders, and its chips come from the real parser.
 *
 * This is the check the old page could not have: its chips were a fixture, so
 * nothing could disagree with them. Here the page is mounted, the parser it
 * imports on demand is the app's own, and the assertions are about what that
 * parser produced. A chip labelled "list" or a `!high` priority would fail,
 * because the parser has neither.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Welcome from '../Welcome';
import { SHOWCASE_SENTENCES } from '../welcomeSentences';

const renderPage = () =>
  render(
    <MemoryRouter>
      <Welcome />
    </MemoryRouter>
  );

/**
 * The parsed label is relative to the clock, so the clock is pinned.
 *
 * `thursday 10am` goes through the app's own parser, and
 * ChronoDateParser.formatDisplayText prefers 'Today at ...' and 'Tomorrow
 * at ...' over a weekday name. So the assertion below — which is about the
 * parse, not about the calendar — read 'Tomorrow at 10:00 AM' for the whole of
 * any Wednesday and 'Today at 10:00 AM' on a Thursday before 10:00. It has
 * been red in those windows since it was written (2026-08-10): the parser's
 * tomorrow branch is older than the test (2025-12-30) and the asserted string
 * has not changed since.
 *
 * Pinned to a Monday at 15:00 UTC: every offset from UTC-12 to UTC+14 reads
 * that instant as a Monday or a Tuesday, so the parsed Thursday is always two
 * or three days out — inside formatDisplayText's within-the-week weekday
 * branch and clear of its today/tomorrow branches. That makes the expectation
 * correct in any timezone, not just the runner's; the extremes and the
 * midnight case were run (Etc/GMT+12, Pacific/Kiritimati, Asia/Tokyo).
 *
 * Only `Date` is faked: the async helpers below wait on real timers.
 */
const PINNED_NOW = new Date('2026-10-12T15:00:00.000Z'); // a Monday

describe('the landing page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(PINNED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders without the parser having resolved yet', () => {
    renderPage();

    expect(screen.getByText(/one sentence, three beats/i)).toBeInTheDocument();
    // Nothing is claimed before the parse lands.
    expect(screen.queryByText('list')).not.toBeInTheDocument();
  });

  it('fills the showcase from the real parse of its first sentence', async () => {
    renderPage();

    expect(SHOWCASE_SENTENCES[0]).toBe('Coffee with Priya thursday 10am');
    // The title appears on the chip and again on the card it files.
    expect(
      await screen.findAllByText('Coffee with Priya', {}, { timeout: 5000 })
    ).not.toHaveLength(0);
    expect(screen.getByText('Thursday at 10:00 AM')).toBeInTheDocument();
    // The field names are the parser's, and it has no notion of a list.
    expect(screen.getAllByText('tag').length).toBeGreaterThan(0);
    expect(screen.queryByText('list')).not.toBeInTheDocument();
  });

  it('never shows the priority syntax the parser does not have', async () => {
    const { container } = renderPage();

    await screen.findAllByText('Coffee with Priya', {}, { timeout: 5000 });
    expect(container.textContent).not.toContain('!high');
  });
});
