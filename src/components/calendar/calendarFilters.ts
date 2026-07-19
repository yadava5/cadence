/**
 * Shared calendar Filter state — kept in its own tiny module so both the
 * (lazy-loaded) ConsolidatedCalendarHeader and the eagerly-loaded RightPane can
 * import the type + helpers without dragging the whole header into RightPane's
 * chunk (which would defeat the header's lazy boundary).
 */

/**
 * `calendarNames === undefined` means "no calendar-name narrowing" (all visible
 * calendars shown); an array narrows to that explicit subset.
 */
export interface CalendarFilterState {
  calendarNames: string[] | undefined;
  allDayOnly: boolean;
  startDate?: Date;
  endDate?: Date;
}

export const EMPTY_CALENDAR_FILTERS: CalendarFilterState = {
  calendarNames: undefined,
  allDayOnly: false,
  startDate: undefined,
  endDate: undefined,
};

/** Count of independent active filter facets — drives the trigger badge. */
export function activeFilterCount(f: CalendarFilterState): number {
  let n = 0;
  if (f.calendarNames !== undefined) n += 1;
  if (f.allDayOnly) n += 1;
  if (f.startDate && f.endDate) n += 1;
  return n;
}
