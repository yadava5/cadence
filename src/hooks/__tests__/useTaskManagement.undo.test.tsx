/**
 * Deleting a task offers it back.
 *
 * The row leaves optimistically, so the toast is the only record that anything
 * happened; if it ever stops carrying an Undo action, a delete becomes silent
 * and unrecoverable again. Undo re-creates the task from the snapshot, which
 * is asserted field by field here because a restore that quietly drops the
 * list or the due date is worse than no restore at all.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { toast } from 'sonner';
import { useTaskManagement } from '../useTaskManagement';
import { taskApi } from '../../services/api';
import type { Task } from '@shared/types';

vi.mock('../../services/api', () => ({
  taskApi: {
    fetchTasks: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    toggleTask: vi.fn(),
    scheduleTask: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const mockTaskApi = taskApi as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;

const deletedTask: Task = {
  id: 'task-1',
  title: 'Ship the report',
  completed: false,
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  updatedAt: new Date('2026-08-01T10:00:00.000Z'),
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
    },
  ],
};

const wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

/** The options sonner was handed for the most recent toast. */
const lastToastOptions = () => {
  const calls = vi.mocked(toast).mock.calls;
  return calls[calls.length - 1]?.[1] as
    | { action?: { label: string; onClick: () => void }; duration?: number }
    | undefined;
};

describe('deleting a task from the task panes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskApi.fetchTasks.mockResolvedValue([deletedTask]);
    mockTaskApi.deleteTask.mockResolvedValue(undefined);
    mockTaskApi.createTask.mockResolvedValue({
      ...deletedTask,
      id: 'task-restored',
    });
    mockTaskApi.updateTask.mockResolvedValue(deletedTask);
    // useTaskManagement also fetches task lists; keep that off the network.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true, data: [] }),
      })
    );
  });

  const setup = async () => {
    const view = renderHook(
      () => useTaskManagement({ includeTaskOperations: true }),
      { wrapper }
    );
    await waitFor(() => expect(view.result.current.tasks).toHaveLength(1));
    return view;
  };

  it('deletes the task and offers an Undo that names it', async () => {
    const { result } = await setup();

    act(() => result.current.handleDeleteTask('task-1'));

    await waitFor(() =>
      expect(mockTaskApi.deleteTask).toHaveBeenCalledWith('task-1')
    );
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      'Deleted “Ship the report”',
      expect.anything()
    );
    expect(lastToastOptions()?.action?.label).toBe('Undo');
    expect(lastToastOptions()?.duration).toBeGreaterThan(3000);
  });

  it('restores the list, due date, priority and tags on Undo', async () => {
    const { result } = await setup();

    act(() => result.current.handleDeleteTask('task-1'));
    await waitFor(() => expect(lastToastOptions()?.action).toBeDefined());

    await act(async () => {
      lastToastOptions()!.action!.onClick();
    });

    await waitFor(() => expect(mockTaskApi.createTask).toHaveBeenCalled());
    expect(mockTaskApi.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Ship the report',
        taskListId: 'list-work',
        scheduledDate: new Date('2026-08-14T00:00:00.000Z'),
        priority: 'high',
      })
    );
    expect(
      mockTaskApi.createTask.mock.calls[0][0].tags.map(
        (t: { displayText: string }) => t.displayText
      )
    ).toEqual(['Work']);
  });

  it('puts a completed task back completed', async () => {
    mockTaskApi.fetchTasks.mockResolvedValue([
      { ...deletedTask, completed: true, status: 'done' },
    ]);
    const { result } = await setup();

    act(() => result.current.handleDeleteTask('task-1'));
    await waitFor(() => expect(lastToastOptions()?.action).toBeDefined());

    await act(async () => {
      lastToastOptions()!.action!.onClick();
    });

    await waitFor(() =>
      expect(mockTaskApi.updateTask).toHaveBeenCalledWith('task-restored', {
        completed: true,
        status: 'done',
      })
    );
  });
});
