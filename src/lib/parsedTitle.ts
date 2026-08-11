/**
 * Builds the task/event title from the raw quick-add text.
 *
 * The parsers already report the exact span each token was matched at, so the
 * title is the raw text with the spans that became *structured fields* removed
 * — otherwise the headline interaction files "Coffee with Priya thursday 10am"
 * as a title while also setting Thursday 10:00 as the date, i.e. it shows the
 * date twice and the title is not clean.
 *
 * Three rules, deliberately conservative about eating real words:
 *
 * 1. `#hashtag` spans are always removed — they are chip-only syntax.
 * 2. Priority spans are removed only when the match is an explicit *marker*:
 *    `p1`/`p2`/`p3`, or a phrase containing the literal word "priority"
 *    ("high priority", "top priority"). Ordinary English that the priority
 *    parser also reads as a hint — `urgent`, `later`, `someday`, `no rush` —
 *    still sets the priority but stays in the title, because it carries
 *    meaning as prose ("Buy milk later" must not become "Buy milk").
 * 3. Date/time spans are removed only when they sit at an edge of the input —
 *    nothing but whitespace, other date spans and removed markers between the
 *    span and the start or the end of the text. A date phrase at the edge
 *    reads as an annotation ("Gym friday", "p1 Send invoice friday #finance");
 *    one in the middle of a sentence is usually part of the title itself
 *    ("Write the Friday newsletter").
 *
 * Whitespace is normalised exactly once, after every removal.
 */

import type { ParsedTag } from '@shared/types';

/** The slice of a parsed tag that title-building needs. */
type TitleSpan = Pick<ParsedTag, 'type' | 'source' | 'startIndex' | 'endIndex'>;

const HASHTAG_SOURCE = 'hashtag-parser';

/**
 * `p1` and any "… priority …" phrase are syntax the user typed to steer the
 * app; every other priority keyword is a normal word and is kept.
 */
const isPriorityMarker = (text: string): boolean =>
  /^p[123]$/i.test(text.trim()) || /\bpriority\b/i.test(text);

const isUsableSpan = (span: TitleSpan, text: string): boolean =>
  Number.isInteger(span.startIndex) &&
  Number.isInteger(span.endIndex) &&
  span.startIndex >= 0 &&
  span.endIndex > span.startIndex &&
  span.endIndex <= text.length;

/** Replace the given spans with spaces, so a single normalisation pass closes the gaps. */
const blankOut = (text: string, spans: readonly TitleSpan[]): string => {
  if (spans.length === 0) return text;
  const chars = Array.from(text);
  for (const span of spans) {
    for (let i = span.startIndex; i < span.endIndex; i += 1) {
      chars[i] = ' ';
    }
  }
  return chars.join('');
};

const normalize = (text: string): string =>
  text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.:;])/g, '$1')
    .trim();

/**
 * Remove the parsed spans that became structured fields from `rawText`.
 * Falls back to the trimmed raw text when the input is nothing but tokens
 * (e.g. "tomorrow 1pm"), so a task is never created with an empty title.
 */
export function buildTaskTitle(
  rawText: string,
  tags: readonly TitleSpan[] = []
): string {
  const raw = rawText ?? '';
  if (!raw.trim()) return raw.trim();

  const usable = tags.filter((tag) => isUsableSpan(tag, raw));

  const markerSpans = usable.filter((tag) => {
    const matched = raw.slice(tag.startIndex, tag.endIndex);
    if (tag.source === HASHTAG_SOURCE) {
      // Guard against stale parse indices: only strip a span still shaped like a hashtag.
      return matched.startsWith('#');
    }
    return tag.type === 'priority' && isPriorityMarker(matched);
  });

  const dateSpans = usable.filter(
    (tag) =>
      (tag.type === 'date' || tag.type === 'time') &&
      raw.slice(tag.startIndex, tag.endIndex).trim() !== ''
  );

  // Edge test runs against a copy with every candidate span blanked, so
  // "… thursday 10am #catchup" still counts the date as trailing.
  const masked = blankOut(raw, [...markerSpans, ...dateSpans]);
  const removableDates = dateSpans.filter(
    (span) =>
      masked.slice(0, span.startIndex).trim() === '' ||
      masked.slice(span.endIndex).trim() === ''
  );

  const removals = [...markerSpans, ...removableDates];
  if (removals.length === 0) return normalize(raw);

  return normalize(blankOut(raw, removals)) || raw.trim();
}
