/**
 * The badge is what a task row shows. It rendered a date-only due date a day
 * early with a time nobody set ("August 18th, 2026 at 8:00 PM" for a due date
 * of 2026-08-19), because a UTC-midnight value was formatted on the viewer's
 * local clock.
 *
 * The timed case is the positive control: it *must* still follow the viewer's
 * zone, so a TZ switch that stops taking effect fails the file instead of
 * making it green.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from 'vitest';
import { render, screen } from '@testing-library/react';
import { DueDateBadge } from '../DueDateBadge';
import { useSettingsStore } from '@/stores/settingsStore';

const ORIGINAL_TZ = process.env.TZ;
const ZONES = ['UTC', 'America/New_York', 'Asia/Kolkata'] as const;

/** Expected badge text for 2026-08-15T17:26:43.021Z, per zone. */
const TIMED_LABEL: Record<(typeof ZONES)[number], string> = {
  UTC: 'Saturday at 5:26 PM',
  'America/New_York': 'Saturday at 1:26 PM',
  'Asia/Kolkata': 'Saturday at 10:56 PM',
};

describe.each(ZONES)('DueDateBadge in %s', (zone) => {
  beforeAll(() => {
    process.env.TZ = zone;
    vi.useFakeTimers();
    // Monday 10 August 2026, 12:00 local.
    vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0, 0));
  });

  // Set before each render, never while a badge is mounted (that would be a
  // state update outside act()).
  beforeEach(() => {
    useSettingsStore.setState({ dateDisplayMode: 'relative' });
  });

  afterAll(() => {
    vi.useRealTimers();
    process.env.TZ = ORIGINAL_TZ;
  });

  it('shows an all-day due date as the day it names, with no time', () => {
    render(
      <DueDateBadge
        taskId="slides"
        date={new Date('2026-08-19T00:00:00.000Z')}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('due-date-badge')).toHaveTextContent(
      'August 19th, 2026'
    );
    expect(screen.getByTestId('due-date-badge')).not.toHaveTextContent(/PM|AM/);
  });

  it('shows a timed due date on the local clock (positive control)', () => {
    render(
      <DueDateBadge
        taskId="proposal"
        date={new Date('2026-08-15T17:26:43.021Z')}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('due-date-badge')).toHaveTextContent(
      TIMED_LABEL[zone]
    );
  });

  it('shows an all-day due date in absolute mode without a time', () => {
    useSettingsStore.setState({ dateDisplayMode: 'absolute' });

    render(
      <DueDateBadge
        taskId="groceries"
        date={new Date('2026-08-16T00:00:00.000Z')}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('due-date-badge')).toHaveTextContent(
      '08/16/2026'
    );
    expect(screen.getByTestId('due-date-badge')).not.toHaveTextContent('@');
  });
});
