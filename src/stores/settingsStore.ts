import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export type DateDisplayMode = 'relative' | 'absolute';
export type AppViewMode = 'calendar' | 'task';
export type CalendarSubView =
  'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek';
export type SavedTaskGrouping = 'taskList' | 'dueDate' | 'priority';
export type TaskCompletionControl = 'checkbox' | 'status-tag';
export type DefaultViewPreference = 'calendar' | 'tasks' | 'last-used';

export interface SavedTaskPaneConfig {
  id: string;
  grouping: SavedTaskGrouping;
  filterValue?: string;
  selectedTaskListId: string | null;
  showCompleted: boolean;
}

interface SettingsState {
  dateDisplayMode: DateDisplayMode;
  /** Expanded/collapsed state of the SmartTaskInput quick-add in the left pane when in task view */
  taskViewInputExpanded: boolean;
  /** Expanded/collapsed state of the mini calendar in the left pane when in calendar view */
  calendarViewMiniCalendarExpanded: boolean;
  /** Expanded/collapsed state of the main sidebar */
  sidebarExpanded: boolean;
  /** App-level view mode: calendar vs task */
  appViewMode: AppViewMode;
  /** Calendar sub-view when in calendar mode */
  calendarSubView: CalendarSubView;
  /** Multi-pane setup for the task list view */
  taskPaneSetup: SavedTaskPaneConfig[];
  /** Saved sizes (percentages) for the task pane layout */
  taskPaneLayoutSizes: number[];
  /** Whether the enhanced input panel is visible in task view */
  enhancedInputVisible: boolean;
  /** Selected task list for the enhanced input panel (task view) */
  enhancedInputTaskListId: string | null;
  /** Selected task list for the left pane SmartTaskInput (calendar view) */
  leftSmartInputTaskListId: string | null;
  /** How task completion is controlled/rendered in list view */
  taskCompletionControl: TaskCompletionControl;
  /** Whether to show the sidebar task analytics summary */
  showSidebarTaskAnalytics: boolean;
  /** In-app reminders for upcoming events/tasks while the app is open */
  desktopNotifications: boolean;
  /** Persist unsaved event-dialog drafts to localStorage while typing */
  autoSaveDrafts: boolean;
  /** Enable non-essential app-wide keyboard shortcuts (⌘P/⌘,/⌘?/⌘Q, Cmd+F) */
  keyboardShortcutsEnabled: boolean;
  /** Which view the app boots into (or remembers the last used one) */
  defaultView: DefaultViewPreference;
  /** Last app view the user was on — backs the "Remember last used" option */
  lastUsedAppView: AppViewMode;

  // Actions
  setDateDisplayMode: (mode: DateDisplayMode) => void;
  setTaskViewInputExpanded: (expanded: boolean) => void;
  toggleTaskViewInput: () => void;
  setCalendarViewMiniCalendarExpanded: (expanded: boolean) => void;
  toggleCalendarViewMiniCalendar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  toggleSidebar: () => void;
  setAppViewMode: (view: AppViewMode) => void;
  setCalendarSubView: (view: CalendarSubView) => void;
  setTaskPaneSetup: (setup: SavedTaskPaneConfig[]) => void;
  setTaskPaneLayoutSizes: (sizes: number[]) => void;
  setEnhancedInputVisible: (visible: boolean) => void;
  setEnhancedInputTaskListId: (taskListId: string | null) => void;
  setLeftSmartInputTaskListId: (taskListId: string | null) => void;
  setTaskCompletionControl: (mode: TaskCompletionControl) => void;
  setShowSidebarTaskAnalytics: (visible: boolean) => void;
  setDesktopNotifications: (enabled: boolean) => void;
  setAutoSaveDrafts: (enabled: boolean) => void;
  setKeyboardShortcutsEnabled: (enabled: boolean) => void;
  setDefaultView: (view: DefaultViewPreference) => void;
  setLastUsedAppView: (view: AppViewMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      (set, get) => ({
        dateDisplayMode: 'relative',
        taskViewInputExpanded: true,
        calendarViewMiniCalendarExpanded: true,
        sidebarExpanded: true,
        appViewMode: 'calendar',
        calendarSubView: 'timeGridWeek',
        taskPaneSetup: [
          {
            id: 'pane-1',
            grouping: 'taskList',
            selectedTaskListId: null,
            showCompleted: false,
          },
        ],
        taskPaneLayoutSizes: [],
        enhancedInputVisible: false,
        enhancedInputTaskListId: null,
        leftSmartInputTaskListId: null,
        taskCompletionControl: 'checkbox',
        showSidebarTaskAnalytics: true,
        desktopNotifications: false,
        autoSaveDrafts: true,
        keyboardShortcutsEnabled: true,
        defaultView: 'calendar',
        lastUsedAppView: 'calendar',

        setDateDisplayMode: (mode) =>
          set({ dateDisplayMode: mode }, false, 'setDateDisplayMode'),
        setTaskViewInputExpanded: (expanded) =>
          set(
            { taskViewInputExpanded: expanded },
            false,
            'setTaskViewInputExpanded'
          ),
        toggleTaskViewInput: () =>
          set(
            { taskViewInputExpanded: !get().taskViewInputExpanded },
            false,
            'toggleTaskViewInput'
          ),
        setCalendarViewMiniCalendarExpanded: (expanded) =>
          set(
            { calendarViewMiniCalendarExpanded: expanded },
            false,
            'setCalendarViewMiniCalendarExpanded'
          ),
        toggleCalendarViewMiniCalendar: () =>
          set(
            {
              calendarViewMiniCalendarExpanded:
                !get().calendarViewMiniCalendarExpanded,
            },
            false,
            'toggleCalendarViewMiniCalendar'
          ),
        setSidebarExpanded: (expanded) =>
          set({ sidebarExpanded: expanded }, false, 'setSidebarExpanded'),
        toggleSidebar: () =>
          set(
            { sidebarExpanded: !get().sidebarExpanded },
            false,
            'toggleSidebar'
          ),
        setAppViewMode: (view) =>
          set({ appViewMode: view }, false, 'setAppViewMode'),
        setCalendarSubView: (view) =>
          set({ calendarSubView: view }, false, 'setCalendarSubView'),
        setTaskPaneSetup: (setup) =>
          set({ taskPaneSetup: setup }, false, 'setTaskPaneSetup'),
        setTaskPaneLayoutSizes: (sizes) =>
          set({ taskPaneLayoutSizes: sizes }, false, 'setTaskPaneLayoutSizes'),
        setEnhancedInputVisible: (visible) =>
          set(
            { enhancedInputVisible: visible },
            false,
            'setEnhancedInputVisible'
          ),
        setEnhancedInputTaskListId: (taskListId) =>
          set(
            { enhancedInputTaskListId: taskListId },
            false,
            'setEnhancedInputTaskListId'
          ),
        setLeftSmartInputTaskListId: (taskListId) =>
          set(
            { leftSmartInputTaskListId: taskListId },
            false,
            'setLeftSmartInputTaskListId'
          ),
        setTaskCompletionControl: (mode) =>
          set(
            { taskCompletionControl: mode },
            false,
            'setTaskCompletionControl'
          ),
        setShowSidebarTaskAnalytics: (visible) =>
          set(
            { showSidebarTaskAnalytics: visible },
            false,
            'setShowSidebarTaskAnalytics'
          ),
        setDesktopNotifications: (enabled) =>
          set(
            { desktopNotifications: enabled },
            false,
            'setDesktopNotifications'
          ),
        setAutoSaveDrafts: (enabled) =>
          set({ autoSaveDrafts: enabled }, false, 'setAutoSaveDrafts'),
        setKeyboardShortcutsEnabled: (enabled) =>
          set(
            { keyboardShortcutsEnabled: enabled },
            false,
            'setKeyboardShortcutsEnabled'
          ),
        setDefaultView: (view) =>
          set({ defaultView: view }, false, 'setDefaultView'),
        setLastUsedAppView: (view) =>
          set({ lastUsedAppView: view }, false, 'setLastUsedAppView'),
      }),
      {
        name: 'settings-store',
        partialize: (state) => ({
          dateDisplayMode: state.dateDisplayMode,
          taskViewInputExpanded: state.taskViewInputExpanded,
          calendarViewMiniCalendarExpanded:
            state.calendarViewMiniCalendarExpanded,
          sidebarExpanded: state.sidebarExpanded,
          appViewMode: state.appViewMode,
          calendarSubView: state.calendarSubView,
          taskPaneSetup: state.taskPaneSetup,
          taskPaneLayoutSizes: state.taskPaneLayoutSizes,
          enhancedInputVisible: state.enhancedInputVisible,
          enhancedInputTaskListId: state.enhancedInputTaskListId,
          leftSmartInputTaskListId: state.leftSmartInputTaskListId,
          taskCompletionControl: state.taskCompletionControl,
          showSidebarTaskAnalytics: state.showSidebarTaskAnalytics,
          desktopNotifications: state.desktopNotifications,
          autoSaveDrafts: state.autoSaveDrafts,
          keyboardShortcutsEnabled: state.keyboardShortcutsEnabled,
          defaultView: state.defaultView,
          lastUsedAppView: state.lastUsedAppView,
        }),
      }
    ),
    { name: 'settings-store' }
  )
);
