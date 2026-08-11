/**
 * Quick-add parsing for the command palette.
 *
 * Reuses the app's existing multi-stage NLP pipeline (SmartParser → chrono,
 * compromise, priority) so a single typed sentence in ⌘K produces the same
 * structured result as the sidebar smart-input: a clean title, a date/time
 * window, and a priority.
 */
import type { ParsedTag, Priority } from '@shared/types';
import type { SmartParser as SmartParserType } from '@/components/smart-input/parsers/SmartParser';

export interface QuickAddResult {
  /** Cleaned, capitalized title (parsed tokens removed). Falls back to raw. */
  title: string;
  /** Whether a date/time was detected in the phrase. */
  hasWhen: boolean;
  /** Start of the event window, if a date/time was detected. */
  start?: Date;
  /** End of the event window (start + 1h for timed, end-of-day for all-day). */
  end?: Date;
  /** True when only a date (no clock time) was detected → all-day event. */
  allDay: boolean;
  /** Detected priority, if any (used for task creation). */
  priority?: Priority;
  /** Human label for the detected date/time, e.g. "Tomorrow at 1:00 PM". */
  whenLabel?: string;
  /** Non date/time tags (people, labels…) preserved for task metadata. */
  extraTags: ParsedTag[];
}

// Module-level singleton so we build the (heavier) compromise/chrono parser once.
let parserInstance: SmartParserType | null = null;
async function getParser(): Promise<SmartParserType> {
  if (!parserInstance) {
    const mod = await import('@/components/smart-input/parsers/SmartParser');
    parserInstance = new mod.SmartParser();
  }
  return parserInstance;
}

function capitalize(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Parse a free-text phrase into event/task fields. Never throws — on any
 * parser error it degrades to using the raw text as the title.
 */
export async function parseQuickAdd(query: string): Promise<QuickAddResult> {
  const raw = query.trim();
  const fallback: QuickAddResult = {
    title: capitalize(raw),
    hasWhen: false,
    allDay: false,
    extraTags: [],
  };
  if (!raw) return fallback;

  try {
    const parser = await getParser();
    const result = await parser.parse(raw);

    const whenTag = result.tags.find(
      (t) => t.type === 'time' || t.type === 'date'
    );
    const priorityTag = result.tags.find((t) => t.type === 'priority');
    const extraTags = result.tags.filter(
      (t) => t.type !== 'time' && t.type !== 'date'
    );

    const hasTime = whenTag?.type === 'time';
    const start =
      whenTag && whenTag.value instanceof Date ? whenTag.value : undefined;

    let end: Date | undefined;
    let allDay = false;
    if (start) {
      if (hasTime) {
        end = new Date(start.getTime() + 60 * 60 * 1000);
      } else {
        allDay = true;
        end = start;
      }
    }

    // Build the title by removing the date/time and priority spans, plus any
    // explicit `#hashtag` spans, from the original text. We deliberately keep
    // people/label/project words (e.g. "lunch with Sam") in the title — the NLP
    // pipeline's cleanText strips those too, which would leave a meaningless
    // title like "With" — but an explicit `#tag` is chip-only, never title text.
    const spansToRemove = result.tags
      .filter(
        (t) =>
          t.type === 'date' ||
          t.type === 'time' ||
          t.type === 'priority' ||
          t.source === 'hashtag-parser'
      )
      .sort((a, b) => b.startIndex - a.startIndex);
    let cleaned = raw;
    for (const tag of spansToRemove) {
      cleaned = cleaned.slice(0, tag.startIndex) + cleaned.slice(tag.endIndex);
    }
    cleaned = cleaned
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.:;])/g, '$1')
      .trim();

    return {
      title: capitalize(cleaned || result.cleanText.trim() || raw),
      hasWhen: Boolean(start),
      start,
      end,
      allDay,
      priority:
        priorityTag && typeof priorityTag.value === 'string'
          ? (priorityTag.value as Priority)
          : undefined,
      whenLabel: whenTag?.displayText,
      extraTags,
    };
  } catch {
    return fallback;
  }
}
