import { ReactNode, useCallback, useState, useRef, useEffect } from 'react';
import { CalendarView, CalendarViewType } from '../calendar';
import {
  EMPTY_CALENDAR_FILTERS,
  type CalendarFilterState,
} from '../calendar/calendarFilters';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCalendarCommandStore } from '@/stores/calendarCommandStore';
import { lazy, Suspense } from 'react';
const LazyConsolidatedCalendarHeader = lazy(async () => ({
  default: (await import('../calendar/ConsolidatedCalendarHeader'))
    .ConsolidatedCalendarHeader,
}));
const LazyEventCreationDialog = lazy(async () => ({
  default: (await import('../dialogs/EventCreationDialog')).EventCreationDialog,
}));
const LazyEventDisplayDialog = lazy(async () => ({
  default: (await import('../dialogs/EventDisplayDialog')).EventDisplayDialog,
}));
const LazyScheduleMeetingDialog = lazy(async () => ({
  default: (await import('../dialogs/ScheduleMeetingDialog'))
    .ScheduleMeetingDialog,
}));
import type { CalendarEvent } from '@shared/types';
import type FullCalendar from '@fullcalendar/react';

interface RightPaneProps {
  children?: ReactNode;
  calendarRef?: React.RefObject<FullCalendar | null>;
}

export const RightPane = ({
  children,
  calendarRef: externalCalendarRef,
}: RightPaneProps) => {
  const internalCalendarRef = useRef<FullCalendar>(null);
  const calendarRef = externalCalendarRef || internalCalendarRef;
  const [currentView, setCurrentView] =
    useState<CalendarViewType>('timeGridWeek');
  const { calendarSubView, setCalendarSubView } = useSettingsStore();

  // Toolbar search + filter state (owned here so both the header controls and
  // the calendar grid stay in sync).
  const [searchValue, setSearchValue] = useState('');
  const [filters, setFilters] = useState<CalendarFilterState>(
    EMPTY_CALENDAR_FILTERS
  );

  // Initialize calendar sub-view from settings on mount and when settings change
  useEffect(() => {
    if (calendarSubView && calendarSubView !== currentView) {
      setCurrentView(calendarSubView);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarSubView]);

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [displayDialogOpen, setDisplayDialogOpen] = useState(false);
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );
  const [initialEventData, setInitialEventData] = useState<
    Partial<CalendarEvent> | undefined
  >();

  /**
   * Handle event click from calendar
   */
  const handleEventClick = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
    setDisplayDialogOpen(true);
  }, []);

  /**
   * Handle event creation from calendar (when user clicks on a date/time slot)
   */
  const handleEventCreate = useCallback((event: Partial<CalendarEvent>) => {
    setInitialEventData(event);
    setCreateDialogOpen(true);
  }, []);

  /**
   * Handle create event button click from header
   */
  const handleCreateEvent = useCallback(() => {
    setInitialEventData(undefined);
    setCreateDialogOpen(true);
  }, []);

  /**
   * Open the "Schedule a Google meeting" dialog from the calendar toolbar.
   */
  const handleScheduleMeeting = useCallback(() => {
    setMeetingDialogOpen(true);
  }, []);

  // Open Settings (General → Connected accounts) without prop-drilling; the
  // MainLayout listens for this event to reveal the settings dialog.
  const openSettings = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('app:open-settings', { detail: { section: 'general' } })
    );
  }, []);

  /**
   * Handle editing an event from the display dialog
   */
  const handleEditEvent = useCallback(
    (event: CalendarEvent) => {
      setInitialEventData(event);
      setDisplayDialogOpen(false);
      setCreateDialogOpen(true);
    },
    [setCreateDialogOpen, setDisplayDialogOpen, setInitialEventData]
  );

  /**
   * Handle calendar view change
   */
  const handleViewChange = useCallback(
    (view: CalendarViewType) => {
      setCurrentView(view);
      try {
        setCalendarSubView(view);
      } catch {
        // Ignore settings persistence failures
      }
      // Imperatively drive the FullCalendar instance too. The React-state ->
      // effect path in CalendarView lagged a selection behind (grid stuck on the
      // previous view). We defer to a microtask so the change lands right after
      // React flushes this event (FullCalendar uses flushSync internally, which
      // warns if invoked mid-render) — reliable, and no visible lag.
      queueMicrotask(() => {
        const api = calendarRef.current?.getApi();
        if (api && api.view.type !== view) {
          api.changeView(view);
        }
      });
    },
    [setCalendarSubView, setCurrentView, calendarRef]
  );

  /**
   * Navigate to today
   */
  const handleTodayClick = useCallback(() => {
    const calendarApi = calendarRef.current?.getApi();
    calendarApi?.today();
  }, [calendarRef]);

  /**
   * Navigate to previous period
   */
  const handlePrevClick = useCallback(() => {
    const calendarApi = calendarRef.current?.getApi();
    calendarApi?.prev();
  }, [calendarRef]);

  /**
   * Navigate to next period
   */
  const handleNextClick = useCallback(() => {
    const calendarApi = calendarRef.current?.getApi();
    calendarApi?.next();
  }, [calendarRef]);

  // Execute imperative calendar intents dispatched by the ⌘K command palette.
  // Routing through a store (instead of a ref) means a command fired while the
  // calendar was unmounted (task view) still runs the moment it mounts.
  const calendarCommand = useCalendarCommandStore((s) => s.command);
  const clearCalendarCommand = useCalendarCommandStore((s) => s.clear);
  useEffect(() => {
    if (!calendarCommand) return;

    const runWithApi = (
      fn: (api: NonNullable<ReturnType<FullCalendar['getApi']>>) => void
    ) => {
      const api = calendarRef.current?.getApi();
      if (api) {
        fn(api);
        return;
      }
      // Calendar may still be mounting; retry on the next frame.
      requestAnimationFrame(() => {
        const late = calendarRef.current?.getApi();
        if (late) fn(late);
      });
    };

    switch (calendarCommand.type) {
      case 'view':
        handleViewChange(calendarCommand.view);
        break;
      case 'goto':
        runWithApi((api) => api.gotoDate(new Date(calendarCommand.dateISO)));
        break;
      case 'today':
        handleTodayClick();
        break;
      case 'prev':
        handlePrevClick();
        break;
      case 'next':
        handleNextClick();
        break;
      case 'openEvent': {
        const ev = calendarCommand.event;
        if (ev.start) runWithApi((api) => api.gotoDate(new Date(ev.start)));
        setSelectedEvent(ev);
        setDisplayDialogOpen(true);
        break;
      }
      case 'newEvent':
        setInitialEventData(undefined);
        setCreateDialogOpen(true);
        break;
    }

    clearCalendarCommand();
  }, [
    calendarCommand,
    clearCalendarCommand,
    calendarRef,
    handleViewChange,
    handleTodayClick,
    handlePrevClick,
    handleNextClick,
  ]);

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden right-pane-container">
      {/* Consolidated Calendar Header */}
      <Suspense fallback={null}>
        <LazyConsolidatedCalendarHeader
          currentView={currentView}
          onViewChange={handleViewChange}
          onTodayClick={handleTodayClick}
          onPrevClick={handlePrevClick}
          onNextClick={handleNextClick}
          onCreateEvent={handleCreateEvent}
          onScheduleMeeting={handleScheduleMeeting}
          calendarRef={calendarRef}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          filters={filters}
          onFiltersChange={setFilters}
        />
      </Suspense>

      {/* Calendar Content - Full Integration */}
      <div className="flex-1 min-h-0" style={{ overscrollBehavior: 'none' }}>
        <CalendarView
          onEventClick={handleEventClick}
          onEventCreate={handleEventCreate}
          currentView={currentView}
          onViewChange={handleViewChange}
          onTodayClick={handleTodayClick}
          onPrevClick={handlePrevClick}
          onNextClick={handleNextClick}
          calendarRef={calendarRef}
          searchValue={searchValue}
          filterCalendarNames={filters.calendarNames}
          filterAllDayOnly={filters.allDayOnly}
          filterStartDate={filters.startDate}
          filterEndDate={filters.endDate}
          className="h-full"
        />
      </div>

      {/* Custom children content */}
      {children}

      {/* Event Creation Dialog */}
      <Suspense fallback={null}>
        <LazyEventCreationDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          initialEventData={initialEventData}
        />
      </Suspense>

      {/* Event Display Dialog */}
      <Suspense fallback={null}>
        <LazyEventDisplayDialog
          open={displayDialogOpen}
          onOpenChange={setDisplayDialogOpen}
          event={selectedEvent}
          onEdit={handleEditEvent}
        />
      </Suspense>

      {/* Schedule a Google meeting (invite people + optional Meet link) */}
      {meetingDialogOpen && (
        <Suspense fallback={null}>
          <LazyScheduleMeetingDialog
            open={meetingDialogOpen}
            onOpenChange={setMeetingDialogOpen}
            onOpenSettings={openSettings}
          />
        </Suspense>
      )}
    </div>
  );
};
