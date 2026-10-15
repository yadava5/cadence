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

/**
 * The confirmation is reached from the row's ⋮ menu, so two Radix modal layers
 * hand over: the menu closes as the dialog opens. Each dismissable layer saves
 * document.body's pointer-events on mount and restores it on unmount, and that
 * saved value is module-level state — so if the menu and the dialog resolve to
 * *different copies* of @radix-ui/react-dismissable-layer, the dialog captures
 * the menu's `none` as its own "original" and closing the dialog restores
 * `none` permanently. The page then takes no clicks at all until a reload.
 *
 * That is not a jsdom artifact; it reproduces in Chromium against the
 * production bundle. It is also easy to reintroduce by accident: every
 * @radix-ui package pins its internal packages to an *exact* version, so a
 * dependency bump that moves react-dialog/react-menu without moving
 * react-tooltip leaves npm unable to hoist one copy, and this is the result.
 * Assert it directly rather than relying on the leak tripping a later test.
 */
const expectPageStillClickable = () =>
  expect(document.body.style.pointerEvents).toBe('');

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

  it('cancelling the confirmation keeps the task, and the page still takes clicks', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderItem(withFile, onDelete);

    await chooseDelete(user);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(onDelete).not.toHaveBeenCalled();
    expectPageStillClickable();
    // The row is still operable, which is what a user would actually notice.
    await user.click(
      screen.getByLabelText('Task options for "Ship the report"')
    );
    expect(await screen.findByText('Delete')).toBeInTheDocument();
  });

  it('confirming the dialog deletes the task, and the page still takes clicks', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderItem(withFile, onDelete);

    await chooseDelete(user);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith('task-1');
    expectPageStillClickable();
  });
});
