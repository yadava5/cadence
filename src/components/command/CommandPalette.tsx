import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  Check,
  Clock,
  CornerDownLeft,
  LayoutList,
  Link2,
  ListPlus,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

import { useCommandPaletteStore } from '@/stores/commandPaletteStore';
import { useInsightsStore } from '@/stores/insightsStore';
import {
  useCalendarCommandStore,
  type CalendarViewType,
} from '@/stores/calendarCommandStore';
import { useUIStore } from '@/stores/uiStore';
import { useThemeStore } from '@/stores/themeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useAllEvents } from '@/hooks/useEvents';
import { useAllTasks } from '@/hooks/useTasks';
import { useCalendars } from '@/hooks/useCalendars';
import { useCreateEvent } from '@/hooks/useEvents';
import { useCreateTask } from '@/hooks/useTasks';
import { parseQuickAdd } from '@/lib/quickAdd';
import type { CalendarEvent, Task } from '@shared/types';

/**
 * Lightweight fuzzy scorer: exact substring beats subsequence; earlier matches
 * rank higher. Returns 0 for no match. Dependency-free and good enough for the
 * palette's small in-memory event/task/action lists.
 */
function fuzzyScore(text: string, query: string): number {
  if (!query) return 1;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = t.indexOf(q);
  if (idx !== -1) return 1000 - idx;
  let ti = 0;
  let qi = 0;
  let score = 0;
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) {
      score += 1;
      qi += 1;
    }
    ti += 1;
  }
  return qi === q.length ? score : 0;
}

const VIEW_DEFS: {
  view: CalendarViewType;
  label: string;
  keywords: string[];
  icon: React.ReactNode;
}[] = [
  {
    view: 'timeGridWeek',
    label: 'Week',
    keywords: ['week'],
    icon: <CalendarRange className="h-4 w-4" />,
  },
  {
    view: 'timeGridDay',
    label: 'Day',
    keywords: ['day', 'today view'],
    icon: <CalendarClock className="h-4 w-4" />,
  },
  {
    view: 'dayGridMonth',
    label: 'Month',
    keywords: ['month'],
    icon: <CalendarDays className="h-4 w-4" />,
  },
  {
    view: 'listWeek',
    label: 'Agenda',
    keywords: ['agenda', 'list', 'schedule'],
    icon: <LayoutList className="h-4 w-4" />,
  },
];

function eventWhen(ev: CalendarEvent): string {
  try {
    const start = new Date(ev.start);
    if (ev.allDay) return format(start, 'EEE, MMM d');
    return `${format(start, 'EEE, MMM d')} · ${format(start, 'p')}`;
  } catch {
    return '';
  }
}

// Module-level throttle timestamp. Kept outside the component so it is immune
// to re-renders/re-mounts of CommandPalette (a component-scoped ref reset
// between rapid presses, letting the guard slip).
let lastPaletteToggleAt = 0;

/** Public entry point — always mounted in the app shell, owns the ⌘K shortcut. */
export function CommandPalette() {
  const open = useCommandPaletteStore((s) => s.open);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const toggle = useCommandPaletteStore((s) => s.toggle);
  const shortcutsEnabled = useSettingsStore((s) => s.keyboardShortcutsEnabled);

  useEffect(() => {
    // ⌘K is a keyboard shortcut — respect the global toggle.
    if (!shortcutsEnabled) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        // Throttle: rapid ⌘K mashing flipped the Radix dialog open→closed
        // faster than its 200ms open/close transition, which left an orphan
        // dialog node and a stuck `body { pointer-events: none }` (whole page
        // frozen until the next click). Ignoring toggles inside the transition
        // window keeps the dialog lifecycle from racing itself.
        const now = Date.now();
        if (now - lastPaletteToggleAt < 300) return;
        lastPaletteToggleAt = now;
        toggle();
      }
    };
    // Capture phase so we win over any element-level handlers.
    document.addEventListener('keydown', handler, { capture: true });
    return () =>
      document.removeEventListener('keydown', handler, { capture: true });
  }, [toggle, shortcutsEnabled]);

  // Safety net: if a race ever leaves the body pointer-events lock behind after
  // the palette closes (and no other modal is open), release it so the page
  // never gets stuck unclickable.
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => {
      const anyModalOpen = document.querySelector(
        '[data-slot="dialog-content"][data-state="open"], [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
      );
      if (!anyModalOpen && document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = '';
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden p-0 sm:max-w-[640px] gap-0 top-[15%] translate-y-0"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Type to create an event or task, navigate the calendar, or jump to
          anything.
        </DialogDescription>
        {open && <CommandPaletteBody onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CommandPaletteBody({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [parsed, setParsed] = useState<Awaited<
    ReturnType<typeof parseQuickAdd>
  > | null>(null);
  const inFlightRef = useRef(false);

  const { data: events = [] } = useAllEvents();
  const { data: tasks = [] } = useAllTasks();
  const { data: calendars = [] } = useCalendars();
  const createEvent = useCreateEvent();
  const createTask = useCreateTask();

  const dispatchCalendar = useCalendarCommandStore((s) => s.dispatch);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const openInsights = useInsightsStore((s) => s.setOpen);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  const defaultCalendar = useMemo(
    () => calendars.find((c) => c.isDefault) || calendars[0],
    [calendars]
  );

  const trimmed = query.trim();

  // Debounced live preview of the parse (labels only). Actions re-parse the
  // current text synchronously on select, so what you get always matches what
  // you typed even if you hit Enter before this settles.
  useEffect(() => {
    if (!trimmed) {
      setParsed(null);
      return;
    }
    let active = true;
    const id = setTimeout(() => {
      parseQuickAdd(trimmed).then((r) => {
        if (active) setParsed(r);
      });
    }, 110);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [trimmed]);

  // ---- action runners ------------------------------------------------------

  const runCreateEvent = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const p = await parseQuickAdd(query);
      if (!p.title) return;
      const start =
        p.start ??
        (() => {
          const d = new Date();
          d.setMinutes(0, 0, 0);
          d.setHours(d.getHours() + 1);
          return d;
        })();
      const end = p.end ?? new Date(start.getTime() + 60 * 60 * 1000);
      // Fall back to the universal default calendar. An empty calendarName
      // fails validateEvent ("Calendar is required"), so if the calendars query
      // hasn't resolved yet (e.g. ⌘K quick-add moments after login) the create
      // silently failed while still toasting success. 'Personal' is the default
      // calendar for every seeded/new account and offline mode.
      const calendarName = defaultCalendar?.name ?? 'Personal';
      createEvent.mutate({
        title: p.title,
        start,
        end,
        allDay: p.allDay,
        calendarName,
        color: defaultCalendar?.color,
      });
      toast.success('Event created', { description: p.title });
      onClose();
      setCurrentView('calendar');
      dispatchCalendar({ type: 'goto', dateISO: start.toISOString() });
    } finally {
      inFlightRef.current = false;
    }
  }, [
    query,
    createEvent,
    defaultCalendar,
    onClose,
    setCurrentView,
    dispatchCalendar,
  ]);

  const runCreateTask = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const p = await parseQuickAdd(query);
      if (!p.title) return;
      createTask.mutate({
        title: p.title,
        scheduledDate: p.start,
        priority: p.priority,
        tags: p.extraTags.length ? p.extraTags : undefined,
        parsedMetadata: { originalInput: query, cleanTitle: p.title },
      });
      toast.success('Task added', { description: p.title });
      onClose();
    } finally {
      inFlightRef.current = false;
    }
  }, [query, createTask, onClose]);

  const runGoto = useCallback(
    (date: Date) => {
      onClose();
      setCurrentView('calendar');
      dispatchCalendar({ type: 'goto', dateISO: date.toISOString() });
    },
    [onClose, setCurrentView, dispatchCalendar]
  );

  const runView = useCallback(
    (view: CalendarViewType) => {
      onClose();
      setCurrentView('calendar');
      dispatchCalendar({ type: 'view', view });
    },
    [onClose, setCurrentView, dispatchCalendar]
  );

  const runOpenEvent = useCallback(
    (ev: CalendarEvent) => {
      onClose();
      setCurrentView('calendar');
      dispatchCalendar({ type: 'openEvent', event: ev });
    },
    [onClose, setCurrentView, dispatchCalendar]
  );

  const runOpenTask = useCallback(
    (task: Task) => {
      onClose();
      setCurrentView('task');
      toast('Opened Tasks', { description: task.title });
    },
    [onClose, setCurrentView]
  );

  const runNewEvent = useCallback(() => {
    onClose();
    setCurrentView('calendar');
    dispatchCalendar({ type: 'newEvent' });
  }, [onClose, setCurrentView, dispatchCalendar]);

  const runNewTask = useCallback(() => {
    onClose();
    setCurrentView('task');
    useSettingsStore.getState().setTaskViewInputExpanded(true);
    // Let the task view + collapsible quick-add mount, then focus it.
    window.setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(
        'input[aria-label="Smart task input with highlighting"]'
      );
      el?.focus();
      el?.scrollIntoView({ block: 'nearest' });
    }, 240);
  }, [onClose, setCurrentView]);

  const runToday = useCallback(() => {
    onClose();
    setCurrentView('calendar');
    dispatchCalendar({ type: 'today' });
  }, [onClose, setCurrentView, dispatchCalendar]);

  const runInsights = useCallback(() => {
    onClose();
    openInsights(true);
  }, [onClose, openInsights]);

  const runToggleTheme = useCallback(() => {
    toggleTheme();
    onClose();
  }, [toggleTheme, onClose]);

  const runConnectGoogle = useCallback(async () => {
    onClose();
    // Refresh a near-expired Cadence token before spending it, and force one
    // refresh + retry on a 401 — the raw ~15-min access token would otherwise
    // 401 and the connect would silently fail with "isn't available right now".
    await useAuthStore.getState().refreshTokenIfNeeded();
    const redirectUri = `${window.location.origin}/auth/google/callback`;
    const send = () =>
      fetch(
        `/api/google/calendar?redirectUri=${encodeURIComponent(redirectUri)}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${
              useAuthStore.getState().jwtTokens?.accessToken ?? ''
            }`,
          },
        }
      );
    try {
      let resp = await send();
      if (resp.status === 401) {
        const refreshed = await useAuthStore
          .getState()
          .refreshTokenIfNeeded(true);
        if (refreshed) resp = await send();
      }
      if (resp.status === 401) {
        toast.error(
          'Your session expired — sign in again to connect Google Calendar.'
        );
        return;
      }
      const payload = await resp.json().catch(() => null);
      if (resp.ok && payload?.data?.authUrl) {
        window.location.href = payload.data.authUrl as string;
      } else {
        toast.error('Google Calendar connect isn’t available right now');
      }
    } catch {
      toast.error('Could not start Google connect');
    }
  }, [onClose]);

  // ---- derived lists -------------------------------------------------------

  const eventMatches = useMemo(() => {
    if (!trimmed) {
      // Empty state: show the soonest upcoming events.
      const now = Date.now();
      return [...events]
        .filter((e) => new Date(e.start).getTime() >= now - 12 * 3600 * 1000)
        .sort((a, b) => +new Date(a.start) - +new Date(b.start))
        .slice(0, 5);
    }
    return events
      .map((e) => ({ e, s: fuzzyScore(e.title, trimmed) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6)
      .map((x) => x.e);
  }, [events, trimmed]);

  const taskMatches = useMemo(() => {
    if (!trimmed) return [];
    return tasks
      .map((t) => ({ t, s: fuzzyScore(t.title, trimmed) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6)
      .map((x) => x.t);
  }, [tasks, trimmed]);

  const viewMatches = useMemo(() => {
    if (!trimmed) return [];
    const normalized = trimmed
      .toLowerCase()
      .replace(/^(go to|goto|switch to|show|open)\s+/, '')
      .replace(/\s+view$/, '')
      .trim();
    if (!normalized) return [];
    return VIEW_DEFS.filter((v) =>
      v.keywords.some((k) => k.startsWith(normalized) || normalized === k)
    );
  }, [trimmed]);

  // Quick actions, fuzzy-filtered by the query so they stay reachable by name.
  const actions = useMemo(() => {
    const all = [
      {
        id: 'new-event',
        label: 'New event',
        hint: 'Open the event form',
        icon: <CalendarPlus className="h-4 w-4" />,
        run: runNewEvent,
      },
      {
        id: 'new-task',
        label: 'New task',
        hint: 'Focus the quick-add',
        icon: <ListPlus className="h-4 w-4" />,
        run: runNewTask,
      },
      {
        id: 'today',
        label: 'Go to today',
        hint: 'Jump the calendar to today',
        icon: <CalendarClock className="h-4 w-4" />,
        run: runToday,
      },
      {
        id: 'insights',
        label: 'Where your week goes',
        hint: 'Time-by-calendar insights',
        icon: <BarChart3 className="h-4 w-4" />,
        run: runInsights,
      },
      {
        id: 'connect-google',
        label: 'Connect Google Calendar',
        hint: 'Read-only calendar sync',
        icon: <Link2 className="h-4 w-4" />,
        run: runConnectGoogle,
      },
      {
        id: 'toggle-theme',
        label: resolvedTheme === 'dark' ? 'Switch to light' : 'Switch to dark',
        hint: 'Toggle theme',
        icon:
          resolvedTheme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          ),
        run: runToggleTheme,
      },
    ];
    if (!trimmed) return all;
    return all
      .map((a) => ({ a, s: fuzzyScore(a.label, trimmed) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.a);
  }, [
    trimmed,
    resolvedTheme,
    runNewEvent,
    runNewTask,
    runToday,
    runInsights,
    runConnectGoogle,
    runToggleTheme,
  ]);

  const showCreate = trimmed.length > 0 && Boolean(parsed?.title);
  const whenLabel =
    parsed?.whenLabel ||
    (parsed?.start ? format(parsed.start, "EEE, MMM d 'at' p") : undefined);
  const createEventFirst = Boolean(parsed?.hasWhen);

  const createEventItem = showCreate && (
    <CommandItem
      key="create-event"
      value="__create_event__"
      onSelect={runCreateEvent}
      className="gap-3"
    >
      <CalendarPlus className="h-4 w-4 shrink-0 text-primary" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate">
          Create event: <span className="font-medium">{parsed?.title}</span>
        </span>
        {whenLabel && (
          <span className="text-xs text-muted-foreground">{whenLabel}</span>
        )}
      </div>
    </CommandItem>
  );

  const createTaskItem = showCreate && (
    <CommandItem
      key="create-task"
      value="__create_task__"
      onSelect={runCreateTask}
      className="gap-3"
    >
      <ListPlus className="h-4 w-4 shrink-0 text-primary" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate">
          Create task: <span className="font-medium">{parsed?.title}</span>
        </span>
        {(whenLabel || parsed?.priority) && (
          <span className="text-xs text-muted-foreground">
            {[
              whenLabel,
              parsed?.priority ? `${parsed.priority} priority` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>
    </CommandItem>
  );

  return (
    <Command
      shouldFilter={false}
      className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Create an event or task, jump to a date, search…"
        autoFocus
      />
      <CommandList className="max-h-[min(420px,60vh)]">
        <CommandEmpty>No matches. Keep typing to create it.</CommandEmpty>

        {showCreate && (
          <CommandGroup heading="Create">
            {createEventFirst ? (
              <>
                {createEventItem}
                {createTaskItem}
              </>
            ) : (
              <>
                {createTaskItem}
                {createEventItem}
              </>
            )}
          </CommandGroup>
        )}

        {(parsed?.hasWhen || viewMatches.length > 0) && (
          <CommandGroup heading="Navigate">
            {parsed?.hasWhen && parsed.start && (
              <CommandItem
                key="goto-date"
                value="__goto_date__"
                onSelect={() => runGoto(parsed.start as Date)}
                className="gap-3"
              >
                <ArrowRight className="h-4 w-4 shrink-0" />
                <span>
                  Go to{' '}
                  <span className="font-medium">
                    {format(parsed.start, 'EEEE, MMMM d')}
                  </span>
                </span>
              </CommandItem>
            )}
            {viewMatches.map((v) => (
              <CommandItem
                key={`view-${v.view}`}
                value={`__view_${v.view}__`}
                onSelect={() => runView(v.view)}
                className="gap-3"
              >
                <span className="shrink-0 text-muted-foreground">{v.icon}</span>
                <span>Switch to {v.label} view</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {eventMatches.length > 0 && (
          <CommandGroup heading={trimmed ? 'Events' : 'Upcoming'}>
            {eventMatches.map((ev) => (
              <CommandItem
                key={`event-${ev.id}`}
                value={`__event_${ev.id}__`}
                onSelect={() => runOpenEvent(ev)}
                className="gap-3"
              >
                <span
                  className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: ev.color || 'var(--primary)' }}
                />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{ev.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {eventWhen(ev)}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {taskMatches.length > 0 && (
          <CommandGroup heading="Tasks">
            {taskMatches.map((t) => (
              <CommandItem
                key={`task-${t.id}`}
                value={`__task_${t.id}__`}
                onSelect={() => runOpenTask(t)}
                className="gap-3"
              >
                {t.completed ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{t.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {actions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              {actions.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`__action_${a.id}__`}
                  onSelect={a.run}
                  className="gap-3"
                >
                  <span className="shrink-0 text-muted-foreground">
                    {a.icon}
                  </span>
                  <span>{a.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {a.hint}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>

      <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          {showCreate
            ? 'Parsed from your text'
            : 'Type “lunch with Sam tomorrow 1pm”'}
        </span>
        <span className="flex items-center gap-2">
          <kbd className="rounded border px-1">↑</kbd>
          <kbd className="rounded border px-1">↓</kbd>
          <span>to navigate</span>
          <kbd className="inline-flex items-center gap-0.5 rounded border px-1">
            <CornerDownLeft className="h-3 w-3" />
          </kbd>
          <span>select</span>
          <kbd className="rounded border px-1">esc</kbd>
        </span>
      </div>
    </Command>
  );
}
