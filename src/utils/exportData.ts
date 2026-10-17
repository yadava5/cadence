/**
 * Client-side data export helpers.
 *
 * `buildExportJson` gathers the signed-in user's events, tasks and app settings
 * into a single JSON document; `downloadBlob` performs the actual browser
 * download. The iCalendar (.ics) export lives in `./ics`, loaded on demand.
 * All are pure/DOM-only — no network, nothing leaves the browser except the
 * file the user saves.
 */
import type { CalendarEvent, Task } from '@shared/types';

export function downloadBlob(
  contents: string,
  filename: string,
  mime: string
): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** yyyy-MM-dd for filenames, in local time. */
export function exportDateStamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface ExportPayload {
  exportedAt: string;
  app: 'Cadence';
  version: 1;
  counts: { events: number; tasks: number };
  events: CalendarEvent[];
  tasks: Task[];
  settings?: Record<string, unknown>;
}

export function buildExportJson(
  events: CalendarEvent[],
  tasks: Task[],
  settings?: Record<string, unknown>
): string {
  const payload: ExportPayload = {
    exportedAt: new Date().toISOString(),
    app: 'Cadence',
    version: 1,
    counts: { events: events.length, tasks: tasks.length },
    events,
    tasks,
    settings,
  };
  return JSON.stringify(payload, null, 2);
}
