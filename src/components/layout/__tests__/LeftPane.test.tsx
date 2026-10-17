import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeftPane } from '../LeftPane';
import { useUIStore } from '@/stores/uiStore';
import { useTaskManagement } from '@/hooks/useTaskManagement';
import { useCalendarManagement } from '@/hooks/useCalendarManagement';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ReactNode } from 'react';

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn(),
}));

vi.mock('@/hooks/useTaskManagement', () => ({
  useTaskManagement: vi.fn(),
}));

vi.mock('@/hooks/useCalendarManagement', () => ({
  useCalendarManagement: vi.fn(),
}));

vi.mock('@/hooks/useCalendarExport', () => ({
  useCalendarExport: () => vi.fn(),
}));

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: vi.fn(),
}));

type BaseSidebarPaneProps = {
  additionalHeaderContent?: ReactNode;
  mainContent?: ReactNode;
  footerListContent?: ReactNode;
};

vi.mock('../BaseSidebarPane', () => ({
  BaseSidebarPane: ({
    additionalHeaderContent,
    mainContent,
    footerListContent,
  }: BaseSidebarPaneProps) => (
    <div>
      <div data-testid="header-slot">{additionalHeaderContent}</div>
      <div data-testid="main-slot">{mainContent}</div>
      <div data-testid="footer-slot">{footerListContent}</div>
    </div>
  ),
}));

vi.mock('@/components/tasks/TaskList', () => ({
  TaskList: () => <div data-testid="task-list">TaskList</div>,
}));

vi.mock('@/components/calendar/CalendarList', () => ({
  CalendarList: () => <div data-testid="calendar-list">CalendarList</div>,
}));

vi.mock('@/components/tasks/TaskGroupList', () => ({
  TaskGroupList: () => <div data-testid="task-group-list">TaskGroupList</div>,
}));

vi.mock('@/components/calendar/EventOverview', () => ({
  EventOverview: () => <div data-testid="event-overview">EventOverview</div>,
}));

vi.mock('@/components/smart-input/SmartTaskInput', () => ({
  SmartTaskInput: () => (
    <div data-testid="smart-task-input">SmartTaskInput</div>
  ),
}));

vi.mock('@/components/tasks/TaskAnalyticsSummary', () => ({
  TaskAnalyticsSummary: () => (
    <div data-testid="task-analytics">TaskAnalyticsSummary</div>
  ),
}));

describe('LeftPane Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useUIStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentView: 'calendar',
    });

    (useTaskManagement as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      tasks: [],
      tasksLoading: false,
      addTask: { isPending: false },
      handleAddTask: vi.fn(),
      handleToggleTask: vi.fn(),
      handleEditTask: vi.fn(),
      handleDeleteTask: vi.fn(),
      handleScheduleTask: vi.fn(),
      handleRemoveTag: vi.fn(),
      taskGroups: [],
      activeTaskGroupId: 'all',
      showCreateTaskDialog: false,
      setShowCreateTaskDialog: vi.fn(),
      handleAddTaskGroup: vi.fn(),
      handleEditTaskGroup: vi.fn(),
      handleCreateTaskGroup: vi.fn(),
      handleSelectTaskGroup: vi.fn(),
      handleUpdateTaskGroupIcon: vi.fn(),
      handleUpdateTaskGroupColor: vi.fn(),
      handleDeleteTaskGroup: vi.fn(),
      handleOpenCreateTaskDialog: vi.fn(),
    });

    (
      useCalendarManagement as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      calendars: [],
      calendarsLoading: false,
      handleToggleCalendar: vi.fn(),
      handleAddCalendar: vi.fn(),
      handleEditCalendar: vi.fn(),
      handleDeleteCalendar: vi.fn(),
    });

    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      taskViewInputExpanded: true,
      toggleTaskViewInput: vi.fn(),
      calendarViewMiniCalendarExpanded: true,
      toggleCalendarViewMiniCalendar: vi.fn(),
      leftSmartInputTaskListId: null,
      setLeftSmartInputTaskListId: vi.fn(),
      showSidebarTaskAnalytics: false,
    });
  });

  // The left pane must mirror the active top-level view: 'calendar' shows
  // calendar content (mini calendar + upcoming events + calendar list), 'task'
  // shows task content (quick-add input + task list + task groups). A prior
  // regression had these swapped — clicking "Calendar" surfaced the task list
  // in the sidebar and vice versa.
  it('shows calendar content (not task content) in calendar view', async () => {
    render(<LeftPane />);

    // Calendar-aligned content
    expect(await screen.findByTestId('event-overview')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-list')).toBeInTheDocument();

    // Task content must NOT leak into the calendar-view sidebar
    expect(screen.queryByTestId('task-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-group-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-task-input')).not.toBeInTheDocument();
  });

  it('shows task content (not calendar content) in task view', async () => {
    (useUIStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentView: 'task',
    });

    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      taskViewInputExpanded: true,
      toggleTaskViewInput: vi.fn(),
      calendarViewMiniCalendarExpanded: false,
      toggleCalendarViewMiniCalendar: vi.fn(),
      leftSmartInputTaskListId: null,
      setLeftSmartInputTaskListId: vi.fn(),
      showSidebarTaskAnalytics: true,
    });

    render(<LeftPane />);

    // Task-aligned content
    expect(await screen.findByTestId('task-list')).toBeInTheDocument();
    expect(screen.getByTestId('task-group-list')).toBeInTheDocument();
    expect(await screen.findByTestId('task-analytics')).toBeInTheDocument();

    // Calendar content must NOT leak into the task-view sidebar
    expect(screen.queryByTestId('calendar-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('event-overview')).not.toBeInTheDocument();
  });

  it('renders the SmartTaskInput quick-add in task view when expanded', async () => {
    (useUIStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      currentView: 'task',
    });

    render(<LeftPane />);

    expect(await screen.findByTestId('smart-task-input')).toBeInTheDocument();
  });

  it('does not render the SmartTaskInput quick-add in calendar view', () => {
    render(<LeftPane />);

    expect(screen.queryByTestId('smart-task-input')).not.toBeInTheDocument();
  });
});
