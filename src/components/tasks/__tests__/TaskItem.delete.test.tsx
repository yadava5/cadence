/**
 * Deleting a task row.
 *
 * The common case does not stop to ask: the delete is undoable, and a modal on
 * every delete is friction on the case that is almost always intended. The one
 * exception is a task carrying files, which cascade out of the database with
 * it and cannot be re-registered by a restore, so that delete confirms first
 * and says what it will cost.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TaskItem } from '../TaskItem';
import type { Task } from '@shared/types';

vi.mock('../AttachmentPreviewDialog', () => ({ default: () => null }));

const baseTask: Task = {
  id: 'task-1',
  title: 'Ship the report',
  completed: false,
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  updatedAt: new Date('2026-08-01T10:00:00.000Z'),
};

const withFile: Task = {
  ...baseTask,
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

const renderItem = (task: Task, onDelete: () => void) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <TaskItem
          task={task}
          onToggle={vi.fn()}
          onEdit={vi.fn()}
          onDelete={onDelete}
          onSchedule={vi.fn()}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

const chooseDelete = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByLabelText('Task options for "Ship the report"'));
  await user.click(await screen.findByText('Delete'));
};

describe('deleting a task', () => {
  it('deletes straight away when the delete is undoable', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderItem(baseTask, onDelete);

    await chooseDelete(user);

    expect(onDelete).toHaveBeenCalledWith('task-1');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('asks first when the task carries files, and names the cost', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderItem(withFile, onDelete);

    await chooseDelete(user);

    expect(onDelete).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('1 attached file');
    expect(dialog).toHaveTextContent('cannot be undone');
  });

  it('cancelling the confirmation keeps the task', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderItem(withFile, onDelete);

    await chooseDelete(user);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('confirming the dialog deletes the task', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderItem(withFile, onDelete);

    await chooseDelete(user);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith('task-1');
  });
});
