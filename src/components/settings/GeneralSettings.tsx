import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/Input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useAllEvents } from '@/hooks/useEvents';
import { useAllTasks } from '@/hooks/useTasks';
import { authAPI } from '@/services/api/auth';
import {
  buildExportJson,
  buildEventsIcs,
  downloadBlob,
  exportDateStamp,
} from '@/utils/exportData';
import {
  CalendarClock,
  RefreshCw,
  Monitor,
  Moon,
  Sun,
  Trash2,
  Download,
  CalendarDays,
  CheckSquare,
  Tag,
} from 'lucide-react';
import {
  useSettingsStore,
  type TaskCompletionControl,
  type DefaultViewPreference,
} from '@/stores/settingsStore';

/**
 * Connected accounts — Google Calendar connect + manual pull sync.
 * Renders nothing when the server has no Google OAuth configured (503),
 * so the card never shows a dead affordance.
 */
function GoogleCalendarCard() {
  const jwtTokens = useAuthStore((s) => s.jwtTokens);
  const [state, setState] = useState<
    'unknown' | 'unavailable' | 'idle' | 'connecting' | 'syncing'
  >('unknown');
  const [message, setMessage] = useState<string | null>(null);

  const authedFetch = (input: string, init?: RequestInit) =>
    fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwtTokens?.accessToken ?? ''}`,
        ...(init?.headers ?? {}),
      },
    });

  useEffect(() => {
    // One availability probe; 503 = not configured on this deployment.
    let cancelled = false;
    authedFetch(
      `/api/google/calendar?redirectUri=${encodeURIComponent(
        `${window.location.origin}/auth/google/callback`
      )}`
    )
      .then((r) => {
        if (!cancelled) setState(r.status === 503 ? 'unavailable' : 'idle');
      })
      .catch(() => {
        if (!cancelled) setState('unavailable');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === 'unknown' || state === 'unavailable') return null;

  const connect = async () => {
    setState('connecting');
    setMessage(null);
    try {
      const redirectUri = `${window.location.origin}/auth/google/callback`;
      const resp = await authedFetch(
        `/api/google/calendar?redirectUri=${encodeURIComponent(redirectUri)}`
      );
      const payload = await resp.json();
      if (!resp.ok || !payload.data?.authUrl) {
        throw new Error(payload.error?.message || 'Could not start connect');
      }
      window.location.href = payload.data.authUrl;
    } catch (error) {
      setMessage((error as Error).message);
      setState('idle');
    }
  };

  const syncNow = async () => {
    setState('syncing');
    setMessage(null);
    try {
      const resp = await authedFetch('/api/google/calendar', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const payload = await resp.json();
      if (!resp.ok) {
        throw new Error(payload.error?.message || 'Sync failed');
      }
      setMessage(`Synced ${payload.data?.synced ?? 0} events from Google.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setState('idle');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected accounts</CardTitle>
        <CardDescription>
          Pull your Google Calendar into TaskFlow (read-only — we never write to
          your Google account)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={connect}
            disabled={state !== 'idle'}
            className="flex items-center gap-2"
          >
            <CalendarClock className="h-4 w-4" />
            {state === 'connecting'
              ? 'Opening Google…'
              : 'Connect Google Calendar'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={syncNow}
            disabled={state !== 'idle'}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {state === 'syncing' ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        <p className="text-xs text-muted-foreground">
          Uses Google&apos;s official OAuth with the minimal read-only calendar
          scope; your Google tokens are stored server-side only.
        </p>
      </CardContent>
    </Card>
  );
}

export function GeneralSettings() {
  const { user, authMethod } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const navigate = useNavigate();
  const [exportingData, setExportingData] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const { data: events = [] } = useAllEvents();
  const { data: tasks = [] } = useAllTasks();

  const taskCompletionControl = useSettingsStore(
    (s) => s.taskCompletionControl
  );
  const setTaskCompletionControl = useSettingsStore(
    (s) => s.setTaskCompletionControl
  );
  const showSidebarTaskAnalytics = useSettingsStore(
    (s) => s.showSidebarTaskAnalytics
  );
  const setShowSidebarTaskAnalytics = useSettingsStore(
    (s) => s.setShowSidebarTaskAnalytics
  );
  const desktopNotifications = useSettingsStore((s) => s.desktopNotifications);
  const setDesktopNotifications = useSettingsStore(
    (s) => s.setDesktopNotifications
  );
  const autoSaveDrafts = useSettingsStore((s) => s.autoSaveDrafts);
  const setAutoSaveDrafts = useSettingsStore((s) => s.setAutoSaveDrafts);
  const keyboardShortcutsEnabled = useSettingsStore(
    (s) => s.keyboardShortcutsEnabled
  );
  const setKeyboardShortcutsEnabled = useSettingsStore(
    (s) => s.setKeyboardShortcutsEnabled
  );
  const defaultView = useSettingsStore((s) => s.defaultView);
  const setDefaultView = useSettingsStore((s) => s.setDefaultView);

  const handleExportData = async () => {
    try {
      setExportingData(true);
      const settingsSnapshot = useSettingsStore.getState();
      const json = buildExportJson(events, tasks, {
        dateDisplayMode: settingsSnapshot.dateDisplayMode,
        taskCompletionControl: settingsSnapshot.taskCompletionControl,
        defaultView: settingsSnapshot.defaultView,
        desktopNotifications: settingsSnapshot.desktopNotifications,
        autoSaveDrafts: settingsSnapshot.autoSaveDrafts,
        keyboardShortcutsEnabled: settingsSnapshot.keyboardShortcutsEnabled,
      });
      downloadBlob(
        json,
        `taskflow-export-${exportDateStamp()}.json`,
        'application/json'
      );
      toast.success('Export ready', {
        description: `${events.length} events and ${tasks.length} tasks downloaded`,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to export data'
      );
    } finally {
      setExportingData(false);
    }
  };

  const handleExportIcs = () => {
    if (events.length === 0) {
      toast('No events to export');
      return;
    }
    downloadBlob(
      buildEventsIcs(events),
      `taskflow-events-${exportDateStamp()}.ics`,
      'text/calendar'
    );
    toast.success('Calendar (.ics) downloaded', {
      description: `${events.length} events`,
    });
  };

  const handleConfirmDelete = async () => {
    const token = useAuthStore.getState().getValidAccessToken();
    if (!token) {
      toast.error('Your session has expired. Please sign in again.');
      return;
    }
    setDeleting(true);
    try {
      const res = await authAPI.deleteAccount(token);
      if (!res.success) {
        toast.error(res.message || 'Failed to delete account');
        setDeleting(false);
        return;
      }
      toast.success('Your account and all data were deleted');
      setDeleteDialogOpen(false);
      // Clear the local session, then land on the public landing page.
      await useAuthStore.getState().logout();
      navigate('/welcome', { replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete account'
      );
      setDeleting(false);
    }
  };

  const requestNotifications = async (enabled: boolean) => {
    if (!enabled) {
      setDesktopNotifications(false);
      return;
    }
    // Turning on: request browser permission where available. We keep the
    // preference on even if permission is denied — reminders then fall back to
    // in-app toasts (see useEventReminders).
    try {
      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'default'
      ) {
        const result = await Notification.requestPermission();
        if (result === 'denied') {
          toast('Reminders will show in-app', {
            description:
              'Browser notifications are blocked; TaskFlow will use in-app toasts instead.',
          });
        }
      }
    } catch {
      // Some browsers throw if called outside a user gesture — ignore.
    }
    setDesktopNotifications(true);
  };

  return (
    <div className="space-y-6">
      {/* Account Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Account Overview</CardTitle>
          <CardDescription>
            Your account information and current plan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">
                Account Type
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant={authMethod === 'google' ? 'secondary' : 'outline'}
                >
                  {authMethod === 'google' ? 'Google Account' : 'Local Account'}
                </Badge>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">
                Member Since
              </Label>
              <p className="mt-1 text-sm">
                {authMethod === 'jwt' && user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'N/A'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appearance Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize how the application looks and feels
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-3 block">Theme</Label>
            <div className="flex gap-2">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('light')}
                className="flex items-center gap-2"
              >
                <Sun className="h-4 w-4" />
                Light
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('dark')}
                className="flex items-center gap-2"
              >
                <Moon className="h-4 w-4" />
                Dark
              </Button>
              <Button
                variant={theme === 'system' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('system')}
                className="flex items-center gap-2"
              >
                <Monitor className="h-4 w-4" />
                System
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connected accounts */}
      <GoogleCalendarCard />

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Application Preferences</CardTitle>
          <CardDescription>
            Configure default behavior and notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-0.5 min-w-0 flex-1">
              <Label htmlFor="completion-control">
                Task Completion Control
              </Label>
              <p className="text-sm text-muted-foreground">
                Choose whether to use a checkbox or a status tag icon in list
                view
              </p>
            </div>
            <div className="min-w-40 shrink-0">
              <Select
                value={taskCompletionControl}
                onValueChange={(v) =>
                  setTaskCompletionControl(v as TaskCompletionControl)
                }
              >
                <SelectTrigger id="completion-control" className="w-full">
                  <SelectValue placeholder="Select control" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checkbox">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="w-4 h-4" /> Checkbox
                    </div>
                  </SelectItem>
                  <SelectItem value="status-tag">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4" /> Status Tag (icon)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="sidebar-analytics">
                Sidebar Task Analytics Summary
              </Label>
              <p className="text-sm text-muted-foreground">
                Show a compact analytics card above Task Lists in the sidebar
              </p>
            </div>
            <Switch
              id="sidebar-analytics"
              checked={showSidebarTaskAnalytics}
              onCheckedChange={setShowSidebarTaskAnalytics}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="notifications">Desktop Notifications</Label>
              <p className="text-sm text-muted-foreground">
                In-app reminders for events and tasks starting soon (while
                TaskFlow is open). Uses browser notifications when allowed,
                otherwise in-app alerts.
              </p>
            </div>
            <Switch
              id="notifications"
              checked={desktopNotifications}
              onCheckedChange={(on) => void requestNotifications(on)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-save">Auto-save Drafts</Label>
              <p className="text-sm text-muted-foreground">
                Save an unfinished event as you type and restore it the next
                time you open the create dialog
              </p>
            </div>
            <Switch
              id="auto-save"
              checked={autoSaveDrafts}
              onCheckedChange={setAutoSaveDrafts}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="keyboard-shortcuts">Keyboard Shortcuts</Label>
              <p className="text-sm text-muted-foreground">
                Enable keyboard shortcuts (⌘K command palette, ⌘F search, ⌘,
                settings, and more)
              </p>
            </div>
            <Switch
              id="keyboard-shortcuts"
              checked={keyboardShortcutsEnabled}
              onCheckedChange={setKeyboardShortcutsEnabled}
            />
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-4">
            <Label htmlFor="default-view">Default View</Label>
            <div className="min-w-40 shrink-0">
              <Select
                value={defaultView}
                onValueChange={(v) =>
                  setDefaultView(v as DefaultViewPreference)
                }
              >
                <SelectTrigger id="default-view" className="w-full">
                  <SelectValue placeholder="Select default view" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="calendar">Calendar View</SelectItem>
                  <SelectItem value="tasks">Task View</SelectItem>
                  <SelectItem value="last-used">Remember Last Used</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>
            Export your data or delete your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border rounded-lg">
            <div className="min-w-0">
              <h4 className="font-medium">Export Data</h4>
              <p className="text-sm text-muted-foreground">
                Download all your tasks, events, and settings as JSON — or your
                events as a calendar (.ics) file
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={handleExportIcs}
                title="Export events as .ics"
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                .ics
              </Button>
              <Button
                variant="outline"
                onClick={handleExportData}
                disabled={exportingData}
              >
                {exportingData ? (
                  <>
                    <Download className="mr-2 h-4 w-4 animate-pulse" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Export JSON
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border border-destructive/20 rounded-lg bg-destructive/5">
            <div className="min-w-0">
              <h4 className="font-medium text-destructive">Delete Account</h4>
              <p className="text-sm text-muted-foreground">
                Permanently delete your account and all data
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmText('');
                setDeleteDialogOpen(true);
              }}
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground shrink-0"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Typed-confirmation dialog for irreversible account deletion */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(o) => {
          if (!deleting) setDeleteDialogOpen(o);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account and every calendar, event,
              task, list, and attachment tied to it. This cannot be undone. Type{' '}
              <span className="font-semibold text-foreground">DELETE</span> to
              confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              aria-label="Type DELETE to confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteConfirmText !== 'DELETE' || deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {deleting ? 'Deleting…' : 'Delete account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
