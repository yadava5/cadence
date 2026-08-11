/**
 * Deleting a task from the kanban board.
 *
 * The board renders the same TaskItem the list view does, with `calendarMode`
 * false, so the row's ⋮ menu — Delete included — is on screen here too. Its
 * `onDelete` used to be an empty callback holding a "hidden in kanban" comment,
 * which made Delete a silent no-op; once deletes became undoable it got worse,
 * because a task carrying files takes the confirmation path and the dialog's
 * own Delete button did nothing either. A destructive confirmation with no
 * effect is the failure this file exists to prevent.
 *
 * So the board is mounted whole rather than TaskItem in isolation: the bug was
 * never in the component, it was in what the board handed it. The assertions
 * therefore land on the API call and the toast — evidence the click reached the
 * real `handleDeleteTask` from useTaskManagement, which is the same handler
 * TaskPaneContainer gives the list view.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TaskKanbanBoard } from '../TaskKanbanBoard';
import type { Task } from '@shared/types';

vi.mock('@/services/api', () => ({
  taskApi: {
    fetchTasks: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    toggleTask: vi.fn(),
    scheduleTask: vi.fn(),
  },
  calendarApi: {
    fetchCalendars: vi.fn(),
    createCalendar: vi.fn(),
    updateCalendar: vi.fn(),
    deleteCalendar: vi.fn(),
  },
  attachmentsApi: { delete: vi.fn() },
  DEFAULT_CALENDAR_COLORS: [],
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

import { taskApi, calendarApi } from '@/services/api';

const mockTaskApi = taskApi as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;
const mockCalendarApi = calendarApi as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;

/**
 * No `taskListId` on purpose. The board filters by
 * `selectedKanbanTaskListId ?? activeTaskGroupId`, which starts at 'default',
 * and 'default' means "tasks belonging to no list". A fixture with a list id
 * renders an empty board, which looks like the wiring broke.
 */
const plainTask: Task = {
  id: 'task-1',
  title: 'Ship the report',
  completed: false,
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  updatedAt: new Date('2026-08-01T10:00:00.000Z'),
};

const taskWithFile: Task = {
  ...plainTask,
  attachments: [
    {
      id: 'a1',
      name: 'deck.pdf',
      type: 'application/pdf',
      size: 2048,
      url: 'https://example.com/deck.pdf',
      uploadedAt: new Date('2026-08-01T10:00:00.000Z'),
      taskId: 'task-1',
    },
  ],
};

const renderBoard = async (task: Task) => {
  mockTaskApi.fetchTasks.mockResolvedValue([task]);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <TaskKanbanBoard />
      </TooltipProvider>
    </QueryClientProvider>
  );
  await screen.findByText('Ship the report');
};

/** Open the row menu and pick Delete, exactly as a user would on the board. */
const chooseDelete = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByLabelText('Task options for "Ship the report"'));
  await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
};

/** The options sonner was handed for the most recent toast. */
const lastToastOptions = () => {
  const calls = vi.mocked(toast).mock.calls;
  return calls[calls.length - 1]?.[1] as
    | { action?: { label: string; onClick: () => void } }
    | undefined;
};

describe('deleting a task from the kanban board', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskApi.deleteTask.mockResolvedValue(undefined);
    mockTaskApi.updateTask.mockResolvedValue(plainTask);
    mockCalendarApi.fetchCalendars.mockResolvedValue([]);
    // useTaskManagement also fetches task lists over raw fetch; keep that off
    // the network and empty, or the first list it returns becomes the active
    // group and filters the fixture off the board.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true, data: [] }),
      })
    );
  });

  it('actually deletes, and offers the same Undo the list view does', async () => {
    const user = userEvent.setup();
    await renderBoard(plainTask);

    await chooseDelete(user);

    await waitFor(() =>
      expect(mockTaskApi.deleteTask).toHaveBeenCalledWith('task-1')
    );
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      'Deleted “Ship the report”',
      expect.anything()
    );
    expect(lastToastOptions()?.action?.label).toBe('Undo');
  });

  it('reaches the same confirmation when the task carries files', async () => {
    const user = userEvent.setup();
    await renderBoard(taskWithFile);

    await chooseDelete(user);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('1 attached file');
    expect(dialog).toHaveTextContent('cannot be undone');
    expect(mockTaskApi.deleteTask).not.toHaveBeenCalled();
  });

  it('confirming that dialog deletes the task, rather than doing nothing', async () => {
    const user = userEvent.setup();
    await renderBoard(taskWithFile);

    await chooseDelete(user);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(mockTaskApi.deleteTask).toHaveBeenCalledWith('task-1')
    );
  });

  it('cancelling that dialog keeps the task', async () => {
    const user = userEvent.setup();
    await renderBoard(taskWithFile);

    await chooseDelete(user);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(mockTaskApi.deleteTask).not.toHaveBeenCalled();
  });
});
