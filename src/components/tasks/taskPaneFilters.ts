/**
 * Pane filtering and sorting for TaskPaneContainer.
 *
 * Lives in its own module so the due-date buckets can be exercised directly in
 * several timezones. They are the one part of this file that is wrong in a way
 * you cannot see by reading it: a task due on a calendar day arrives as UTC
 * midnight, which is the previous evening everywhere west of Greenwich, so the
 * old instant comparison against local midnight dropped a "today" task out of
 * Today for every viewer in the Americas.
 */

import type { Task } from '@shared/types';
import type { TaskPaneConfig } from '@/stores/uiStore';
import {
  calendarDayNumber,
  calendarWeekday,
  getCalendarDate,
  getTodayCalendarDate,
} from '@/utils/dueDate';

/**
 * Generate filtered tasks for a specific pane configuration
 */
export function filterTasksForPane(
  tasks: Task[],
  paneConfig: TaskPaneConfig,
  sortBy: string,
  sortOrder: string,
  searchValue?: string
): Task[] {
  let filteredTasks = [...tasks];

  // Apply grouping filter
  switch (paneConfig.grouping) {
    case 'taskList': {
      // Use selectedTaskListId if available, otherwise fall back to filterValue
      const targetTaskListId =
        paneConfig.selectedTaskListId || paneConfig.filterValue;
      if (targetTaskListId) {
        filteredTasks = filteredTasks.filter(
          (task) =>
            task.taskListId === targetTaskListId ||
            (!task.taskListId && targetTaskListId === 'default')
        );
      }
      break;
    }
    case 'dueDate': {
      // Buckets are calendar-day comparisons, never instant comparisons. The
      // day numbers come from the same helpers the due-date badge uses, so a
      // row's bucket and the date it displays can never disagree.
      const todayParts = getTodayCalendarDate();
      const todayNumber = calendarDayNumber(todayParts);
      // The coming Sunday, keeping the previous boundary (a Sunday "today"
      // yields the Sunday a week out) and now including that whole Sunday
      // rather than only its first instant.
      const thisWeekEndNumber = todayNumber + (7 - calendarWeekday(todayParts));
      const nextWeekEndNumber = thisWeekEndNumber + 7;

      if (paneConfig.filterValue) {
        filteredTasks = filteredTasks.filter((task) => {
          if (!task.scheduledDate) return paneConfig.filterValue === 'no-date';

          const dayNumber = calendarDayNumber(
            getCalendarDate(new Date(task.scheduledDate))
          );
          switch (paneConfig.filterValue) {
            case 'today':
              return dayNumber === todayNumber;
            case 'tomorrow':
              return dayNumber === todayNumber + 1;
            case 'this-week':
              return dayNumber >= todayNumber && dayNumber <= thisWeekEndNumber;
            case 'next-week':
              return (
                dayNumber > thisWeekEndNumber && dayNumber <= nextWeekEndNumber
              );
            case 'later':
              return dayNumber > nextWeekEndNumber;
            case 'no-date':
              // A dated task is never "No Due Date". Without this case it fell
              // to `default` and the pane showed the entire list under that
              // heading.
              return false;
            default:
              return true;
          }
        });
      }
      break;
    }
    case 'priority': {
      if (paneConfig.filterValue) {
        filteredTasks = filteredTasks.filter(
          (task) =>
            task.priority === paneConfig.filterValue ||
            (!task.priority && paneConfig.filterValue === 'none')
        );
      }
      break;
    }
  }

  // Apply completion filter
  if (!paneConfig.showCompleted) {
    filteredTasks = filteredTasks.filter((task) => !task.completed);
  }

  // Apply search filter
  if (searchValue && searchValue.trim()) {
    const searchTerm = searchValue.toLowerCase().trim();
    filteredTasks = filteredTasks.filter((task) =>
      task.title.toLowerCase().includes(searchTerm)
    );
  }

  // Apply sorting
  filteredTasks.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'title': {
        comparison = a.title.localeCompare(b.title);
        break;
      }
      case 'dueDate': {
        const aDate = a.scheduledDate?.getTime() || 0;
        const bDate = b.scheduledDate?.getTime() || 0;
        comparison = aDate - bDate;
        break;
      }
      case 'priority': {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const aPriority =
          priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
        const bPriority =
          priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
        comparison = bPriority - aPriority; // High to low
        break;
      }
      case 'createdAt':
      default: {
        comparison = b.createdAt.getTime() - a.createdAt.getTime(); // Newest first
        break;
      }
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return filteredTasks;
}
