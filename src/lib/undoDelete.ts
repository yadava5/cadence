/**
 * Undo for deletes.
 *
 * Deleting a task or an event was instant, silent and unrecoverable: the row
 * left the list and nothing said so. A confirmation dialog on every delete
 * taxes the common case, so the answer here is an undo affordance instead: the
 * row goes immediately, a toast names what went, and Undo puts it back.
 *
 * Both endpoints hard-delete (`DELETE FROM tasks|events`; there is no
 * soft-delete column and no restore route), so Undo re-creates the row. What
 * that can and cannot carry back is the whole design constraint:
 *
 * EVENTS restore completely. The `events` table stores title, start, end,
 * allDay, description, location, notes and its calendar, and every one of them
 * round-trips through `createEvent`. `color` and `exceptions` exist on the
 * client type but have no column at all, so nothing persisted is lost. Only
 * the row's id and createdAt are new.
 *
 * TASKS restore every field a user can see except their files. `createTask`
 * carries title, list, due date, priority, tags and the original quick-add
 * text; completion state is re-applied straight afterwards because create
 * always starts a task incomplete. Attachments are the exception: they cascade
 * out of the database with the task, and the re-created task would have to
 * re-register each file against a blob we cannot prove still exists. Rather
 * than an Undo that silently drops files, a task that has attachments asks for
 * confirmation before it is deleted at all, and skips the undo path.
 *
 * Not restored either way: the row's id and its original creation timestamp,
 * and for a completed task the exact moment it was completed.
 */

import type { CalendarEvent, Task } from '@shared/types';
import type { CreateEventData, CreateTaskData } from '@/services/api';

/**
 * How long the undo affordance stays on screen. Long enough to notice a
 * misclick and reach the button, short enough that it is not still sitting
 * there when you have moved on.
 */
export const UNDO_WINDOW_MS = 8000;

/**
 * True when deleting this task would lose something Undo cannot bring back,
 * i.e. it has files attached. Those deletes ask for confirmation instead.
 */
export const taskDeleteIsRecoverable = (task: Task): boolean =>
  !task.attachments || task.attachments.length === 0;

/** The create payload that reconstructs a deleted task. */
export const taskRestoreData = (task: Task): CreateTaskData => ({
  title: task.title,
  taskListId: task.taskListId,
  scheduledDate: task.scheduledDate,
  priority: task.priority,
  // Date/time tags are not stored on a task; the due date is the canonical
  // representation and is restored above.
  tags: task.tags?.filter((tag) => tag.type !== 'date' && tag.type !== 'time'),
  parsedMetadata: task.parsedMetadata,
});

/**
 * The completion state to re-apply after a restore, or `null` when the task
 * was incomplete and the freshly created row is already right.
 */
export const taskRestoreCompletion = (
  task: Task
): { completed: boolean; status: NonNullable<Task['status']> } | null => {
  if (!task.completed && (!task.status || task.status === 'not_started')) {
    return null;
  }
  return {
    completed: task.completed,
    status: task.status ?? (task.completed ? 'done' : 'not_started'),
  };
};

/** The create payload that reconstructs a deleted event. */
export const eventRestoreData = (event: CalendarEvent): CreateEventData => ({
  title: event.title,
  start: new Date(event.start),
  end: new Date(event.end),
  allDay: event.allDay,
  description: event.description,
  location: event.location,
  notes: event.notes,
  calendarName: event.calendarName || '',
  color: event.color,
  recurrence: event.recurrence,
  exceptions: event.exceptions,
});

/** The toast headline, e.g. "Deleted “Buy milk”", with a sane fallback. */
export const deletedLabel = (
  title: string | undefined,
  kind: string
): string => (title?.trim() ? `Deleted “${title.trim()}”` : `Deleted ${kind}`);
