/**
 * Client-side data export helpers.
 *
 * `buildExportJson` gathers the signed-in user's events, tasks and app settings
 * into a single JSON document; `buildEventsIcs` renders the events as a standard
 * iCalendar (.ics) file. `downloadBlob` performs the actual browser download.
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

// --- iCalendar (.ics) ------------------------------------------------------

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function toIcsUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(
      date.getUTCDate()
    )}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(
      date.getUTCSeconds()
    )}Z`
  );
}

function toIcsDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** Strip HTML so a rich-text event description becomes plain ICS text. */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function buildEventsIcs(events: CalendarEvent[]): string {
  const now = toIcsUtc(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cadence//Calendar Export//EN',
    'CALSCALE:GREGORIAN',
  ];

  for (const ev of events) {
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${icsEscape(String(ev.id))}@taskflow`);
    lines.push(`DTSTAMP:${now}`);
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(start)}`);
      // iCalendar all-day DTEND is exclusive; add a day.
      const endExclusive = new Date(end);
      endExclusive.setDate(endExclusive.getDate() + 1);
      lines.push(`DTEND;VALUE=DATE:${toIcsDate(endExclusive)}`);
    } else {
      lines.push(`DTSTART:${toIcsUtc(start)}`);
      lines.push(`DTEND:${toIcsUtc(end)}`);
    }
    lines.push(`SUMMARY:${icsEscape(ev.title || 'Untitled')}`);
    if (ev.description) {
      lines.push(`DESCRIPTION:${icsEscape(stripHtml(ev.description))}`);
    }
    if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
    if (ev.recurrence) {
      // Stored as an RRULE body (e.g. "FREQ=WEEKLY;INTERVAL=1"); prefix if bare.
      const rule = ev.recurrence.startsWith('RRULE:')
        ? ev.recurrence.slice('RRULE:'.length)
        : ev.recurrence;
      lines.push(`RRULE:${rule}`);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  // RFC 5545 uses CRLF line breaks.
  return lines.join('\r\n');
}
