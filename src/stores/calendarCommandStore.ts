import { create } from 'zustand';
import type { CalendarEvent } from '@shared/types';

/**
 * Calendar view identifiers, mirrored from CalendarView so this store carries
 * no import cycle back into the calendar components.
 */
export type CalendarViewType =
  'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek';

/**
 * Imperative intents the command palette (or any caller) can hand to the
 * calendar surface. RightPane owns the FullCalendar instance and executes
 * these against its API, so callers never need a ref to the calendar.
 */
export type CalendarCommand =
  | { type: 'view'; view: CalendarViewType }
  | { type: 'goto'; dateISO: string }
  | { type: 'today' }
  | { type: 'prev' }
  | { type: 'next' }
  | { type: 'openEvent'; event: CalendarEvent }
  | { type: 'newEvent' };

interface CalendarCommandState {
  /** The pending command plus a nonce so repeat commands still re-trigger. */
  command: (CalendarCommand & { nonce: number }) | null;
  dispatch: (command: CalendarCommand) => void;
  clear: () => void;
}

/**
 * A one-shot command channel between the command palette and the calendar.
 *
 * The palette lives in the app shell (always mounted) while the calendar
 * (RightPane) only mounts in calendar view. Routing intents through this store
 * means a command dispatched from the task view is picked up as soon as the
 * calendar mounts, with no timing races or window-event plumbing.
 */
export const useCalendarCommandStore = create<CalendarCommandState>((set) => ({
  command: null,
  dispatch: (command) =>
    set({ command: { ...command, nonce: Date.now() + Math.random() } }),
  clear: () => set({ command: null }),
}));
