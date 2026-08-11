/**
 * The sentences the landing page runs through the parser.
 *
 * They live in their own module so the page and the test that executes them
 * cannot drift apart: every sentence here is asserted against the real
 * SmartParser in src/lib/__tests__/showcaseParse.test.ts, and the page renders
 * whatever that parser returns. Adding a sentence without a passing assertion
 * is what put a fabricated parse on the page in the first place.
 *
 * Chosen for two properties: they parse cleanly (no leftover words in the
 * title, no invented fields), and they name a weekday, so each one files onto
 * a stable column of the mini week.
 */

/** The centrepiece: one timed sentence, one dated sentence. */
export const SHOWCASE_SENTENCES = [
  'Coffee with Priya thursday 10am',
  'Ship the report friday p1 #work',
] as const;

/** The closing band: one sentence per weekday, filed on click. */
export const FINALE_SENTENCES = [
  'email the team friday 9am #standup',
  'lunch with sam tuesday noon',
  'design review wednesday 2pm p1',
  'gym monday 7am',
  'ship the release thursday 4pm #launch',
] as const;
