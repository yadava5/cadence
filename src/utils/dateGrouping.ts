import {
  format,
  isToday,
  isTomorrow,
  isThisWeek,
  isAfter,
  isBefore,
  startOfDay,
} from 'date-fns';
import {
  calendarDayNumber,
  calendarWeekdayName,
  formatCalendarDate,
  getCalendarDate,
  getTodayCalendarDate,
  isAllDayDate,
} from './dueDate';

/**
 * Date grouping utilities for tasks and events
 * Extracted from EventOverview to provide consistent date grouping across components
 */

export interface GroupedItems<T> {
  [key: string]: T[];
}

export interface DayKeyOptions {
  /**
   * Treat an exactly-midnight value as a whole calendar day and group it by
   * its calendar parts instead of the viewer's local clock. Opt-in: task due
   * dates need it (a UTC-midnight due date otherwise lands a day early, and
   * "today" reads as "Overdue", west of GMT), calendar events do not — they
   * carry their own `allDay` flag and are unaffected by this module's change.
   */
  allDayAware?: boolean;
}

/**
 * Day key for an all-day value, computed from calendar parts only — same
 * vocabulary as the local-clock path below.
 */
const getAllDayKey = (date: Date): string => {
  const parts = getCalendarDate(date);
  const diff =
    calendarDayNumber(parts) - calendarDayNumber(getTodayCalendarDate());

  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';

  // Same Monday-start week as today? (mirrors isThisWeek({ weekStartsOn: 1 }))
  const now = new Date();
  const daysSinceMonday = (now.getDay() + 6) % 7;
  if (diff <= 6 - daysSinceMonday) return calendarWeekdayName(parts);

  return formatCalendarDate(parts, 'short'); // Jan 15, etc.
};

/**
 * Determine the appropriate day key for an item based on its date
 */
export const getDayKey = (
  date: Date | null,
  options: DayKeyOptions = {}
): string => {
  if (!date) {
    return 'No Due Date';
  }

  const itemDate = new Date(date);

  if (options.allDayAware && isAllDayDate(itemDate)) {
    return getAllDayKey(itemDate);
  }

  const now = new Date();

  if (isBefore(itemDate, startOfDay(now))) {
    return 'Overdue';
  } else if (isToday(itemDate)) {
    return 'Today';
  } else if (isTomorrow(itemDate)) {
    return 'Tomorrow';
  } else if (isThisWeek(itemDate, { weekStartsOn: 1 })) {
    return format(itemDate, 'EEEE'); // Wednesday, Thursday, etc.
  } else {
    return format(itemDate, 'MMM d'); // Jan 15, etc.
  }
};

/**
 * Group items by date using a date extraction function
 */
export const groupItemsByDate = <T>(
  items: T[],
  getDateFn: (item: T) => Date | null,
  options: DayKeyOptions = {}
): GroupedItems<T> => {
  const groups: GroupedItems<T> = {};

  items.forEach((item) => {
    const itemDate = getDateFn(item);
    const dayKey = getDayKey(itemDate, options);

    if (!groups[dayKey]) {
      groups[dayKey] = [];
    }
    groups[dayKey].push(item);
  });

  return groups;
};

/**
 * Define the order of day keys for consistent display
 * Earlier items should appear first
 */
export const getDayKeyOrder = (dayKeys: string[]): string[] => {
  const orderMap: Record<string, number> = {
    Overdue: 0,
    Today: 1,
    Tomorrow: 2,
    Monday: 3,
    Tuesday: 4,
    Wednesday: 5,
    Thursday: 6,
    Friday: 7,
    Saturday: 8,
    Sunday: 9,
    'No Due Date': 100, // Should appear last
  };

  return dayKeys.sort((a, b) => {
    const orderA = orderMap[a] ?? 50; // Default order for date strings (e.g., "Jan 15")
    const orderB = orderMap[b] ?? 50;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    // For date strings with same default order, sort alphabetically
    return a.localeCompare(b);
  });
};

/**
 * Get formatted time string for display
 */
export const getTimeString = (date: Date | null, allDay = false): string => {
  if (!date) return '';
  if (allDay) return 'All day';
  return format(new Date(date), 'h:mm a');
};

/**
 * Check if an item is overdue based on its date
 */
export const isItemOverdue = (date: Date | null): boolean => {
  if (!date) return false;
  return isBefore(new Date(date), startOfDay(new Date()));
};

/**
 * Filter items to show only upcoming ones (today forward)
 */
export const filterUpcomingItems = <T>(
  items: T[],
  getDateFn: (item: T) => Date | null,
  maxItems?: number
): T[] => {
  const now = new Date();

  const filtered = items
    .filter((item) => {
      const itemDate = getDateFn(item);
      if (!itemDate) return true; // Include items without dates

      const itemStart = new Date(itemDate);
      // Show items from today forward
      return isAfter(itemStart, now) || isToday(itemStart);
    })
    .sort((a, b) => {
      const dateA = getDateFn(a);
      const dateB = getDateFn(b);

      // Sort by date, items with dates come first
      if (dateA && dateB) {
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      } else if (dateA && !dateB) {
        return -1; // Items with dates come first
      } else if (!dateA && dateB) {
        return 1; // Items without dates come last
      } else {
        return 0; // Both have no date
      }
    });

  return maxItems ? filtered.slice(0, maxItems) : filtered;
};
