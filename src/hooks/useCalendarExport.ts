/**
 * Export one calendar's events as an .ics download.
 *
 * Reads events and calendars through the same React Query entries the
 * calendar view renders from (fetching only if they are missing or stale), so
 * the file holds what the user is looking at. The iCalendar builder, with its
 * time-zone table, is loaded on first use rather than in the main bundle.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { calendarApi, eventApi } from '../services/api';
import { exportDateStamp, downloadBlob } from '../utils/exportData';
import { calendarQueryKeys } from './useCalendars';
import { eventQueryKeys } from './useEvents';

/** Matches `useAllEvents`, so a fresh cache entry is reused, not refetched. */
const STALE_TIME = 2 * 60 * 1000;

export function useCalendarExport(): (calendarName: string) => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(
    async (calendarName: string) => {
      try {
        const [events, calendars, ics] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: eventQueryKeys.all,
            queryFn: eventApi.fetchEvents,
            staleTime: STALE_TIME,
          }),
          queryClient.fetchQuery({
            queryKey: calendarQueryKeys.all,
            queryFn: calendarApi.fetchCalendars,
            staleTime: STALE_TIME,
          }),
          import('../utils/ics'),
        ]);

        const calendar = calendars.find((c) => c.name === calendarName);
        const selected = ics.eventsInCalendar(events, {
          id: calendar?.id,
          name: calendarName,
        });
        if (selected.length === 0) {
          toast(`No events in “${calendarName}” to export`);
          return;
        }

        downloadBlob(
          ics.buildEventsIcs(selected, { calendarName }),
          ics.icsFilename(calendarName, exportDateStamp()),
          'text/calendar;charset=utf-8'
        );
        const recurring = selected.filter((e) => e.recurrence).length;
        toast.success(`Exported “${calendarName}”`, {
          description:
            `${selected.length} ${selected.length === 1 ? 'event' : 'events'}` +
            (recurring ? `, ${recurring} recurring` : '') +
            ' · .ics for Google Calendar, Apple Calendar or Outlook',
        });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? `Couldn’t export “${calendarName}”: ${error.message}`
            : `Couldn’t export “${calendarName}”`
        );
      }
    },
    [queryClient]
  );
}
