/**
 * In-app reminder subsystem.
 *
 * When the "Desktop notifications" preference is on, this polls the user's
 * events and scheduled tasks and fires a reminder for anything starting/due
 * within a short lead window — as a native `Notification` when the browser
 * permission is granted, otherwise as an in-app toast.
 *
 * Honest scope: these are in-app reminders that only fire while Cadence is
 * open in a tab. This is NOT background push — we never register a service
 * worker or send anything server-side.
 */
import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAllEvents } from './useEvents';
import { useAllTasks } from './useTasks';
import { useSettingsStore } from '@/stores/settingsStore';

/** Fire when an item starts/comes due within this many ms. */
const LEAD_MS = 15 * 60 * 1000;
const POLL_MS = 30 * 1000;

export function useEventReminders(): void {
  const enabled = useSettingsStore((s) => s.desktopNotifications);
  const { data: events = [] } = useAllEvents();
  const { data: tasks = [] } = useAllTasks();
  // Keys we've already reminded about this session (id + timestamp, so a
  // rescheduled item re-notifies).
  const notified = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const fire = (key: string, title: string, body: string) => {
      if (notified.current.has(key)) return;
      notified.current.add(key);
      const canNative =
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted';
      if (canNative) {
        try {
          new Notification(title, { body });
          return;
        } catch {
          // Some browsers throw on construction outside a user gesture — fall
          // through to the toast.
        }
      }
      toast(title, { description: body });
    };

    const check = () => {
      const now = Date.now();

      for (const ev of events) {
        const start = new Date(ev.start).getTime();
        if (Number.isNaN(start)) continue;
        if (start >= now && start - now <= LEAD_MS) {
          const when = ev.allDay
            ? format(new Date(ev.start), 'EEE, MMM d')
            : format(new Date(ev.start), 'p');
          fire(
            `event:${ev.id}:${start}`,
            `Upcoming: ${ev.title || 'Event'}`,
            `Starts at ${when}`
          );
        }
      }

      for (const t of tasks) {
        if (t.completed || !t.scheduledDate) continue;
        const due = new Date(t.scheduledDate).getTime();
        if (Number.isNaN(due)) continue;
        if (due >= now && due - now <= LEAD_MS) {
          fire(
            `task:${t.id}:${due}`,
            `Task due soon: ${t.title || 'Task'}`,
            `Due ${format(new Date(t.scheduledDate), 'p')}`
          );
        }
      }
    };

    // Run once immediately, then on an interval.
    check();
    const id = window.setInterval(check, POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, events, tasks]);
}
