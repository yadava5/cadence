/**
 * What an undo can actually carry back.
 *
 * Both delete endpoints hard-delete, so Undo re-creates the row and these
 * mappers are the entire fidelity contract. The assertions here are the claim
 * the toast makes on the user's behalf: if a field stops round-tripping, this
 * fails rather than a task quietly coming back missing its list or its tags.
 */

import { describe, it, expect } from 'vitest';
import type { CalendarEvent, Task } from '@shared/types';
import {
  deletedLabel,
  eventRestoreData,
  taskDeleteIsRecoverable,
  taskRestoreCompletion,
  taskRestoreData,
} from '../undoDelete';

const task: Task = {
  id: 'task-1',
  title: 'Ship the report',
  completed: false,
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  updatedAt: new Date('2026-08-02T10:00:00.000Z'),
  scheduledDate: new Date('2026-08-14T00:00:00.000Z'),
  priority: 'high',
  taskListId: 'list-work',
  tags: [
    {
      id: 'tag-1',
      type: 'label',
      value: 'work',
      displayText: 'Work',
      iconName: 'Tag',
      color: '#10b981',
    },
    {
      id: 'tag-2',
      type: 'date',
      value: new Date('2026-08-14T00:00:00.000Z'),
      displayText: 'Friday',
      iconName: 'Calendar',
    },
  ],
  parsedMetadata: {
    originalInput: 'Ship the report friday p1 #work',
    cleanTitle: 'Ship the report',
  },
};

const event: CalendarEvent = {
  id: 'event-1',
  title: 'Design review',
  start: new Date('2026-08-12T18:00:00.000Z'),
  end: new Date('2026-08-12T19:00:00.000Z'),
  description: '<p>Bring the deck</p>',
  location: 'Room 3',
  notes: 'ask about the migration',
  calendarName: 'Work',
  allDay: false,
  recurrence: 'FREQ=WEEKLY;BYDAY=WE',
};

describe('restoring a deleted task', () => {
  it('carries the list, due date, priority, tags and quick-add text', () => {
    const restored = taskRestoreData(task);

    expect(restored.title).toBe('Ship the report');
    expect(restored.taskListId).toBe('list-work');
    expect(restored.scheduledDate).toEqual(
      new Date('2026-08-14T00:00:00.000Z')
    );
    expect(restored.priority).toBe('high');
    expect(restored.parsedMetadata).toEqual({
      originalInput: 'Ship the report friday p1 #work',
      cleanTitle: 'Ship the report',
    });
    expect(restored.tags?.map((t) => t.displayText)).toEqual(['Work']);
  });

  it('drops the date/time tags, whose meaning lives in the due date', () => {
    // Re-sending them would file the due date twice, once as a chip.
    expect(taskRestoreData(task).tags?.some((t) => t.type === 'date')).toBe(
      false
    );
  });

  it('re-applies completion, which a created task never has', () => {
    expect(taskRestoreCompletion(task)).toBeNull();
    expect(taskRestoreCompletion({ ...task, completed: true })).toEqual({
      completed: true,
      status: 'done',
    });
    expect(taskRestoreCompletion({ ...task, status: 'in_progress' })).toEqual({
      completed: false,
      status: 'in_progress',
    });
  });

  it('treats a task with files as unrecoverable', () => {
    expect(taskDeleteIsRecoverable(task)).toBe(true);
    expect(taskDeleteIsRecoverable({ ...task, attachments: [] })).toBe(true);
    expect(
      taskDeleteIsRecoverable({
        ...task,
        attachments: [
          {
            id: 'a1',
            name: 'deck.pdf',
            type: 'application/pdf',
            size: 10,
            url: 'https://example.com/deck.pdf',
            uploadedAt: new Date(),
            taskId: 'task-1',
          },
        ],
      })
    ).toBe(false);
  });
});

describe('restoring a deleted event', () => {
  it('carries every column the events table has', () => {
    const restored = eventRestoreData(event);

    expect(restored).toMatchObject({
      title: 'Design review',
      description: '<p>Bring the deck</p>',
      location: 'Room 3',
      notes: 'ask about the migration',
      calendarName: 'Work',
      allDay: false,
      recurrence: 'FREQ=WEEKLY;BYDAY=WE',
    });
    expect(restored.start).toEqual(new Date('2026-08-12T18:00:00.000Z'));
    expect(restored.end).toEqual(new Date('2026-08-12T19:00:00.000Z'));
  });

  it('survives an event with no calendar name', () => {
    // createEvent validates a required calendar; an empty string reaches that
    // validator rather than silently posting `undefined`.
    expect(
      eventRestoreData({ ...event, calendarName: undefined })
    ).toMatchObject({ calendarName: '' });
  });
});

describe('the toast headline', () => {
  it('names the thing that went', () => {
    expect(deletedLabel('Buy milk', 'task')).toBe('Deleted “Buy milk”');
  });

  it('falls back to the kind when there is no title', () => {
    expect(deletedLabel('   ', 'task')).toBe('Deleted task');
    expect(deletedLabel(undefined, 'event')).toBe('Deleted event');
  });
});
