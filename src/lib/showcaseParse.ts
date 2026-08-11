/**
 * The landing page's parse showcase, derived from the real parser.
 *
 * The showcase used to be a hand written fixture, and it drifted: it fed
 * "Ship the report by Friday !high #work" and claimed a title of "Ship the
 * report", a `!high` priority and a `list` of work. Run that sentence through
 * the app and none of it holds. `!` is not syntax, `#work` produces a tag and
 * not a list, and the title keeps the words the parser did not consume. The
 * other example claimed a `where` chip for a token the parser reports as a
 * person. A landing page that describes the parser will always drift from it,
 * so this one runs it instead: every chip on the page is a field the parser
 * returned for the sentence shown above it.
 *
 * Everything here is derived, with two presentational exceptions that are not
 * claims: which column of the mini week a filed card sits in comes from the
 * parsed weekday, and how far down the column it sits comes from the parsed
 * hour.
 */

import type { ParsedTag } from '@shared/types';
import { parseQuickAdd, type QuickAddResult } from '@/lib/quickAdd';

/** A chip: the field name the parser produced, and its value. */
export type ShowcaseChip = [kind: string, value: string];

export interface ShowcaseFiled {
  /** A sentence with a clock time files as an event; a bare date as a task. */
  kind: 'event' | 'task';
  /** Column of the MON..FRI mini week, or null when the day is a weekend. */
  day: number | null;
  /** Vertical position in the column, from the parsed hour. */
  top: string;
  label: string;
  detail: string;
}

export interface ShowcaseParse {
  text: string;
  chips: ShowcaseChip[];
  filed: ShowcaseFiled | null;
}

/**
 * The field name to show for a tag the parser attached. A `#hashtag` and a
 * word the NLP stage categorised both arrive as `label`, and both become a
 * tag on the created task, so both read "tag". None of them is a list: the
 * parser has no concept of one.
 */
const CHIP_KIND_BY_TAG_TYPE: Record<string, string> = {
  label: 'tag',
  person: 'person',
  location: 'location',
  project: 'project',
};

const HASHTAG_SOURCE = 'hashtag-parser';

/**
 * One chip per distinct value. "#work" and the word "report" both resolve to
 * the label "Work", and two identical chips read as a bug; the hashtag wins
 * because the user typed it on purpose.
 */
const dedupeTags = (tags: readonly ParsedTag[]): ParsedTag[] => {
  const byValue = new Map<string, ParsedTag>();
  for (const tag of tags) {
    const key = `${tag.type}:${String(tag.value).toLowerCase()}`;
    const existing = byValue.get(key);
    if (!existing || tag.source === HASHTAG_SOURCE) byValue.set(key, tag);
  }
  return [...byValue.values()];
};

/** Monday is column 0; Saturday and Sunday have no column. */
const weekColumn = (date: Date): number | null => {
  const column = date.getDay() - 1;
  return column >= 0 && column <= 4 ? column : null;
};

/** Working hours span the column; anything outside it pins to an edge. */
const columnTop = (start: Date | undefined, allDay: boolean): string => {
  if (!start || allDay) return '8%';
  const fraction = (start.getHours() + start.getMinutes() / 60 - 7) / 12;
  return `${Math.round(Math.min(0.78, Math.max(0.06, fraction)) * 100)}%`;
};

/** Shape one parse result into the beats the showcase renders. */
export function toShowcase(
  text: string,
  result: QuickAddResult
): ShowcaseParse {
  const timed = result.hasWhen && !result.allDay;
  const kind: 'event' | 'task' = timed ? 'event' : 'task';

  // The priority is already its own chip, taken from the parsed value ("high")
  // rather than the marker that set it ("P1"); the parser also leaves the
  // priority in the tag list, and showing it twice reads as a bug.
  const tags = dedupeTags(
    result.extraTags.filter((tag) => tag.type !== 'priority')
  );
  const chips: ShowcaseChip[] = [[kind, result.title]];

  if (result.whenLabel) chips.push([timed ? 'when' : 'due', result.whenLabel]);
  if (result.priority) chips.push(['priority', result.priority]);
  for (const tag of tags) {
    chips.push([
      CHIP_KIND_BY_TAG_TYPE[tag.type] ?? tag.type,
      tag.displayText || String(tag.value),
    ]);
  }

  const detail = [
    result.whenLabel,
    result.priority,
    ...tags.map((tag) => tag.displayText || String(tag.value)),
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    text,
    chips,
    filed: result.start
      ? {
          kind,
          day: weekColumn(result.start),
          top: columnTop(result.start, result.allDay),
          label: result.title,
          detail,
        }
      : null,
  };
}

/**
 * Run one showcase sentence through the app's parser. `parseQuickAdd` never
 * throws: if the parser chunk fails to load the result is the sentence as its
 * own title and no other chips, which is honest rather than invented.
 */
export async function parseShowcase(text: string): Promise<ShowcaseParse> {
  return toShowcase(text, await parseQuickAdd(text));
}
