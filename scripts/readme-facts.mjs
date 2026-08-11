#!/usr/bin/env node
/**
 * Verify — and repair — every number the README asserts.
 *
 * WHY THIS EXISTS
 *
 * The README used to say "36 route handlers". A 37th landed on 2026-08-07 and
 * the sentence did not move. It said "550 backend tests" in one place and
 * "551" in three others, from a correction that reached three sites out of
 * four. Nobody was careless; a prose document simply has no mechanism that
 * makes a stale number *fail*. Hand-maintained figures drift, always, and
 * they drift silently, which is the part that matters — a README whose
 * numbers are quietly wrong is worse than one with no numbers, because it
 * spends credibility it no longer has.
 *
 * So the numbers stop being prose and become assertions.
 *
 * THE DESIGN, AND WHY IT IS NOT MARKERS
 *
 * The obvious approach is to fence each number in an HTML comment and
 * regenerate it. That fails here for two reasons: the counts appear inside a
 * mermaid diagram, where an HTML comment is a syntax error, and markers make
 * the source unreadable at exactly the density this README uses them.
 *
 * Instead each fact declares the SITES where it is asserted, as regexes that
 * capture the digits. The checker recomputes the fact and compares.
 *
 * The load-bearing rule is this:
 *
 *     A SITE REGEX THAT MATCHES ZERO TIMES IS A FAILURE.
 *
 * Not a skip. A failure. That is the whole point. If a claim is reworded so
 * its regex no longer matches, the fact has escaped its check and the file
 * has silently stopped being verified — which is the exact condition that let
 * "36 handlers" survive a year. A checker that quietly passes when it can no
 * longer find what it was checking is not a checker.
 *
 * TWO CLASSES OF FACT
 *
 *   static  — recomputable from source, cheaply, with no build and no
 *             database. Route-table entries, CREATE POLICY statements, files
 *             on disk. These are recomputed on every run.
 *
 *   recorded — require executing something (a suite, a coverage pass). These
 *             are read from docs/readme-facts.json, which carries the value,
 *             the command that produced it and the date it was taken. A
 *             checker that runs suites becomes slow, then flaky, then
 *             disabled — and a disabled checker is how the drift started. So
 *             the fast path never runs a suite; `--record` does, deliberately.
 *
 * The two classes are tied together by INVARIANTS (see below), so a recorded
 * figure cannot go stale without a static one noticing.
 *
 * USAGE
 *   node scripts/readme-facts.mjs            # --check: verify, exit 1 on drift
 *   node scripts/readme-facts.mjs --write    # rewrite the README to match
 *   node scripts/readme-facts.mjs --record   # re-run the suites, refresh the artifact
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const README = join(REPO, 'README.md');
const ARTIFACT = join(REPO, 'docs', 'readme-facts.json');

/* ── helpers ─────────────────────────────────────────────────────────── */

const read = (p) => readFileSync(join(REPO, p), 'utf8');

/** Every file under `dir` matching `test`, skipping node_modules and dotdirs. */
function walk(dir, test, acc = []) {
  const abs = join(REPO, dir);
  if (!existsSync(abs)) return acc;
  for (const name of readdirSync(abs)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const rel = join(dir, name);
    if (statSync(join(REPO, rel)).isDirectory()) walk(rel, test, acc);
    else if (test(name)) acc.push(rel);
  }
  return acc;
}

const isTestFile = (n) => /\.test\.tsx?$/.test(n);

/** Count occurrences of a regex in a file's text. */
const countIn = (path, re) => (read(path).match(re) || []).length;

/**
 * Entries in the `const ROUTES: Array<[string[], Handler]> = [ ... ]` literal
 * in api/index.ts. Counted from the array itself rather than from the import
 * list, because an imported handler that is never routed is not a route.
 */
function countRoutes() {
  const lines = read('api/index.ts').split('\n');
  const start = lines.findIndex((l) => /^const ROUTES\b/.test(l));
  if (start === -1)
    throw new Error(
      'api/index.ts: could not find the `const ROUTES` declaration'
    );
  let n = 0;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\];/.test(lines[i])) return n;
    if (/^\s*\[\[/.test(lines[i])) n++;
  }
  throw new Error(
    'api/index.ts: the ROUTES array is not terminated by `];` at column 0'
  );
}

/**
 * The single Google OAuth scope the app asks a user to consent to, read from
 * the `const CAL_SCOPE = '…'` declaration in server-handlers/google/calendar.ts.
 *
 * This one is a STRING rather than a count, which is the reason `text` sites
 * exist. It is also the fact most worth pinning: the landing page told visitors
 * for months that Cadence asked only for `calendar.readonly` and could not
 * touch their events, while the code had been upgraded to `calendar.events`
 * (read AND write) and google/meeting.ts was creating events and emailing
 * attendees with `sendUpdates=all`. Nothing failed, because nothing checked.
 * A wrong number is embarrassing; a wrong consent claim is a lie about what a
 * user is agreeing to hand over.
 */
function googleScope() {
  const m = read('server-handlers/google/calendar.ts').match(
    /^const CAL_SCOPE = '([^']+)';$/m
  );
  if (!m)
    throw new Error(
      "server-handlers/google/calendar.ts: could not find the `const CAL_SCOPE = '…'` declaration"
    );
  return m[1];
}

const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];
const toWord = (n) => WORDS[n] ?? String(n);
const withCommas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const stripCommas = (s) => s.replace(/,/g, '');

/* ── the facts ───────────────────────────────────────────────────────── */

/**
 * `sites` regexes MUST contain exactly one capture group, around the number.
 *
 * A site may be a bare RegExp (checked against README.md) or an object:
 *   { re, file }  — check some other file instead
 *   { re, word }  — the number is spelled out in English ("seven")
 *   { re, text }  — the fact is a string, compared verbatim, not a number
 *
 * Claim sites outside the README matter more than they look. The doc comment
 * at the top of api/index.ts said "numbered 36" for as long as the README did,
 * and was corrected in the same sweep — a number repeated in a second file is
 * a number that will be corrected in one file and not the other.
 *
 * THE LANDING PAGE IS A CLAIM SITE TOO. src/pages/Welcome.tsx is the first
 * thing a visitor reads and it makes exactly the same kind of assertions the
 * README does — a handler count, a Google scope — with exactly the same
 * tendency to rot. It said "34 handlers" against a route table of 37, and
 * advertised a read-only Google scope the app had stopped requesting. Prose
 * that is shown to strangers deserves the checker more than prose shown to
 * contributors, not less.
 */
const FACTS = {
  routes: {
    kind: 'static',
    describe: 'route handlers in the api/index.ts ROUTES table',
    compute: countRoutes,
    sites: [
      /(\d+) route handlers are dispatched/g,
      /Path Dispatcher<br\/>(\d+) routes/g,
      /route table of \*\*(\d+) handlers\*\*/g,
      /# (\d+) route handlers dispatched by/g,
      {
        re: /per-file handlers under \.\.\/server-handlers \(formerly api\/\*\) numbered\s+\*?\s*(\d+)\./g,
        file: 'api/index.ts',
      },
      {
        re: /title: '(\d+) handlers, one function'/g,
        file: 'src/pages/Welcome.tsx',
      },
    ],
  },

  /**
   * A string fact, asserted at two sites in two different trees. The landing
   * page has to name the scope it names, and src/services/api/auth.ts — which
   * builds the sign-in consent URL and is where a visitor's browser actually
   * carries the request to Google — has to ask for that same scope. Pinning
   * both is what stops the page and the consent screen from drifting apart:
   * either one moving alone now fails the check.
   */
  googleCalendarScope: {
    kind: 'static',
    describe:
      'the Google OAuth scope requested (CAL_SCOPE in server-handlers/google/calendar.ts)',
    compute: googleScope,
    sites: [
      {
        re: /requests one Google scope, (https:\/\/\S+?)\. It grants read and write/g,
        file: 'src/pages/Welcome.tsx',
        text: true,
      },
      {
        re: /'openid email profile (https:\/\/\S+?)',/g,
        file: 'src/services/api/auth.ts',
        text: true,
      },
    ],
  },

  rlsPolicies: {
    kind: 'static',
    describe: 'CREATE POLICY statements in 0002_enable_rls.sql',
    compute: () =>
      countIn('lib/config/migrations/0002_enable_rls.sql', /CREATE POLICY/gi),
    sites: [
      /and (\d+) policies across the/g,
      /— the (\d+) policies and the/g,
      /\| the (\d+) policies, and/g,
    ],
  },

  rlsTables: {
    kind: 'static',
    describe: 'tables given ENABLE ROW LEVEL SECURITY in 0002_enable_rls.sql',
    compute: () =>
      countIn(
        'lib/config/migrations/0002_enable_rls.sql',
        /ENABLE ROW LEVEL SECURITY/gi
      ),
    sites: [
      /policies across the (\d+) tenant tables/g,
      { re: /pair for all (\w+) tenant tables/g, word: true },
      { re: /`FORCE` on all (\w+) tenant tables/g, word: true },
    ],
  },

  e2eSpecs: {
    kind: 'static',
    describe: 'Playwright spec files under e2e/',
    compute: () => walk('e2e', (n) => /\.spec\.tsx?$/.test(n)).length,
    sites: [/The (\d+) Playwright specs (?:under|in)/g],
  },

  testFilesOnDisk: {
    kind: 'static',
    describe: '*.test.ts(x) files anywhere in the tree',
    compute: () => walk('.', isTestFile).length,
    sites: [/tree holds (\d+) `\\?\*\.test\.ts\(x\)`? files on disk/g],
  },

  testFilesPackages: {
    kind: 'static',
    describe:
      '*.test.ts(x) files under packages/, which the root configs do not glob',
    compute: () => walk('packages', isTestFile).length,
    sites: [/the other (\d+) live in/g, /those last (\d+) files/g],
  },

  testFilesRoot: {
    kind: 'static',
    describe:
      'test files the two root Vitest configs execute (on disk minus packages/)',
    compute: () =>
      walk('.', isTestFile).length - walk('packages', isTestFile).length,
    sites: [/run \*\*(\d+) test files/g],
  },

  /* ── recorded: these need a run ── */

  /* Both config names appear in the same code block, so these anchor on the
     filename rather than on the arrow. `vitest\.config\.ts` cannot match
     inside `vitest.backend.config.ts` — the character after `vitest.` differs
     — which is what keeps the two rows from capturing each other's numbers. */
  testFilesFrontend: {
    kind: 'recorded',
    describe: 'test files executed by vitest.config.ts',
    sites: [
      /(\d+) frontend \(`vitest\.config\.ts`\)/g,
      /# vitest\.config\.ts\s+→\s+(\d+) files/g,
    ],
  },
  testFilesBackend: {
    kind: 'recorded',
    describe: 'test files executed by vitest.backend.config.ts',
    sites: [
      /(\d+) backend \(`vitest\.backend\.config\.ts`\)/g,
      /# vitest\.backend\.config\.ts\s+→\s+(\d+) files/g,
    ],
  },
  testsTotal: {
    kind: 'recorded',
    describe: 'tests executed by the two root Vitest configs',
    sites: [
      /for ([\d,]+) tests:/g,
      /So ([\d,]+) is the two-root-config total/g,
      /why ([\d,]+) is not the number of tests/g,
      /\*\*The test counts\.\*\* ([\d,]+) is exactly/g,
    ],
  },
  testsFrontend: {
    kind: 'recorded',
    describe: 'tests executed by vitest.config.ts',
    sites: [
      /tests: ([\d,]+) frontend and/g,
      /# vitest\.config\.ts\s+→\s+\d+ files, ([\d,]+) tests/g,
      /\| Frontend\s+\|\s+([\d,]+)\s+\|/g,
    ],
  },
  testsBackend: {
    kind: 'recorded',
    describe: 'tests executed by vitest.backend.config.ts',
    sites: [
      /frontend and ([\d,]+) backend, with \d+ skipped/g,
      /# vitest\.backend\.config\.ts\s+→\s+\d+ files, ([\d,]+) tests/g,
      /\| Backend\s+\|\s+([\d,]+)\s+\|/g,
    ],
  },
  /* "with 0 skipped" was, until now, the one claim in the Testing section
     that nothing checked: it sat inside another fact's regex as literal text
     and was never compared against anything. A skipped security test and a
     passing one produce the same green tick — the README says exactly that
     two paragraphs later — so the count it cites has to be measured, not
     typed. Recording it also forced `parseVitest` to stop reading only the
     parenthesised total, which had made a skip invisible. */
  testsSkipped: {
    kind: 'recorded',
    describe: 'tests skipped across the two root Vitest configs',
    sites: [/backend, with ([\d,]+) skipped/g],
  },

  coverageBackendLines: {
    kind: 'recorded',
    describe:
      'v8 line coverage over api/ and lib/, per vitest.backend.config.ts',
    sites: [
      /\| \*\*([\d.]+)%\*\* \|/g,
      /so ([\d.]+)% is scoped to exactly those two trees/g,
    ],
  },
  coverageBackendBranches: {
    kind: 'recorded',
    describe: 'v8 branch coverage over api/ and lib/',
    sites: [/\| \*\*[\d.]+%\*\* \|\s+([\d.]+)% \|/g],
  },
};

/**
 * Cross-class invariants. These are what stop a recorded number from going
 * stale unnoticed: add a test file and the static counts move, the sum stops
 * agreeing, and --check tells you to re-record instead of shipping a README
 * that is arithmetically impossible.
 */
const INVARIANTS = [
  {
    name: 'the two root configs account for every test file outside packages/',
    holds: (f) =>
      f.testFilesFrontend + f.testFilesBackend ===
      f.testFilesOnDisk - f.testFilesPackages,
    explain: (f) =>
      `${f.testFilesFrontend} frontend + ${f.testFilesBackend} backend = ` +
      `${f.testFilesFrontend + f.testFilesBackend}, but the tree holds ` +
      `${f.testFilesOnDisk} test files of which ${f.testFilesPackages} are under packages/, ` +
      `leaving ${f.testFilesOnDisk - f.testFilesPackages}. A test file was added or removed ` +
      `since the last --record.`,
  },
  {
    name: 'the frontend and backend test counts sum to the stated total',
    holds: (f) => f.testsFrontend + f.testsBackend === f.testsTotal,
    explain: (f) =>
      `${f.testsFrontend} + ${f.testsBackend} = ${f.testsFrontend + f.testsBackend}, ` +
      `not ${f.testsTotal}.`,
  },
  {
    name: 'testFilesRoot is on-disk minus packages/',
    holds: (f) => f.testFilesRoot === f.testFilesOnDisk - f.testFilesPackages,
    explain: (f) =>
      `${f.testFilesRoot} != ${f.testFilesOnDisk} - ${f.testFilesPackages}`,
  },
];

/* ── resolve ─────────────────────────────────────────────────────────── */

function loadArtifact() {
  if (!existsSync(ARTIFACT))
    fail(
      `${relative(REPO, ARTIFACT)} is missing.\n` +
        `      Recorded facts (test counts, coverage) have no source without it.\n` +
        `      Run: node scripts/readme-facts.mjs --record`
    );
  return JSON.parse(readFileSync(ARTIFACT, 'utf8'));
}

function fail(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

function resolveFacts() {
  const artifact = loadArtifact();
  const values = {};
  for (const [id, fact] of Object.entries(FACTS)) {
    if (fact.kind === 'static') {
      values[id] = fact.compute();
    } else {
      const rec = artifact.facts?.[id];
      if (rec === undefined)
        fail(
          `fact "${id}" is recorded, but ${relative(REPO, ARTIFACT)} has no entry for it.\n` +
            `      Run: node scripts/readme-facts.mjs --record`
        );
      values[id] = rec.value;
    }
  }
  return { values, artifact };
}

/* ── check / write ───────────────────────────────────────────────────── */

function run(mode) {
  const { values, artifact } = resolveFacts();
  const problems = [];
  let rewrites = 0;

  /* Every file any site touches, loaded once and written back only if dirty. */
  const files = new Map();
  const load = (rel) => {
    if (!files.has(rel))
      files.set(rel, {
        text: readFileSync(join(REPO, rel), 'utf8'),
        dirty: false,
      });
    return files.get(rel);
  };

  const lineOf = (src, index) => src.slice(0, index).split('\n').length;

  for (const [id, fact] of Object.entries(FACTS)) {
    const expected = values[id];
    for (const raw of fact.sites) {
      const site =
        raw instanceof RegExp ? { re: raw, word: false, text: false } : raw;
      const rel = site.file ?? 'README.md';
      const entry = load(rel);
      const re = new RegExp(
        site.re.source,
        site.re.flags.includes('g') ? site.re.flags : site.re.flags + 'g'
      );

      const matches = [...entry.text.matchAll(re)];

      /* The rule that makes this a checker and not a decoration. */
      if (matches.length === 0) {
        problems.push(
          `${id}: a claim site in ${rel} matched NOTHING.\n` +
            `      pattern  ${site.re}\n` +
            `      This means the sentence was reworded and this fact is no longer\n` +
            `      verified anywhere. Update the pattern in scripts/readme-facts.mjs,\n` +
            `      or delete the site if the claim is genuinely gone.`
        );
        continue;
      }

      for (const m of matches) {
        const found = m[1];
        /* `text` compares verbatim: a scope string has no numeric reading, and
           routing it through Number() would make every value NaN and every
           comparison silently false. */
        const ok = site.word
          ? found === toWord(expected)
          : site.text
            ? found === String(expected)
            : Number(stripCommas(found)) === Number(expected);
        if (ok) continue;

        const want = site.word
          ? toWord(expected)
          : site.text
            ? String(expected)
            : found.includes(',')
              ? withCommas(expected)
              : String(expected);

        if (mode === 'write') {
          const replaced = m[0].replace(found, want);
          entry.text =
            entry.text.slice(0, m.index) +
            replaced +
            entry.text.slice(m.index + m[0].length);
          entry.dirty = true;
          rewrites++;
        } else {
          problems.push(
            `${id}: ${rel}:${lineOf(entry.text, m.index)} says ${found}, but ${fact.describe} is ${expected}.\n` +
              `      context  ${m[0].trim().slice(0, 90)}`
          );
        }
      }
    }
  }

  for (const inv of INVARIANTS) {
    if (!inv.holds(values)) {
      problems.push(
        `invariant broken — ${inv.name}\n      ${inv.explain(values)}`
      );
    }
  }

  /* The README prints the date its recorded figures were taken. That date is
     itself a claim, so it is checked against the artifact rather than trusted:
     otherwise numbers can be refreshed while the date stays put, which reads
     as more provenance than actually exists.

     THIS USED TO ANCHOR ON THE WRONG SENTENCE. It matched "…on 2026-08-10
     reported 17.79% lines", which is the FRONTEND coverage anecdote — a
     deliberately one-off hand measurement that `--record` does not take and
     that the README explicitly presents as non-reproducible. Tying it to the
     artifact meant `--write` would silently re-date a hand measurement to the
     day some unrelated backend run happened, inventing provenance for the one
     figure on the page that is documented as having none. It passed review
     only because both dates happened to be 2026-08-10 on the day it was
     written. It now anchors on a sentence about the recorded figures. */
  const readme = load('README.md');
  const dateSite =
    /figures were recorded on (\d{4}-\d{2}-\d{2}) by `npm run readme:record`/;
  const dm = readme.text.match(dateSite);
  if (!dm) {
    problems.push(
      `the recorded-figures date sentence no longer matches its pattern (${dateSite}).\n` +
        `      A recorded number without its date is a number with no provenance.`
    );
  } else if (dm[1] !== artifact.recordedAt) {
    if (mode === 'write') {
      readme.text = readme.text.replace(dateSite, (s) =>
        s.replace(dm[1], artifact.recordedAt)
      );
      readme.dirty = true;
      rewrites++;
    } else {
      problems.push(
        `the README says the coverage figures were read on ${dm[1]}, but ` +
          `${relative(REPO, ARTIFACT)} was recorded ${artifact.recordedAt}.`
      );
    }
  }

  // The recorded figures are only evidence if the run that produced them
  // passed. `--record` writes `suiteOutcome` but nothing ever asserted it, so a
  // red run's numbers could be written and then agree with the README forever
  // after. That is the same shape as a claim site matching zero times: a check
  // that cannot fail. It nearly happened during the 2026-08-10 pass, when the
  // backend suite was briefly red while another agent was mid-fix.
  const outcome = artifact.suiteOutcome;
  if (!outcome) {
    problems.push(
      `${relative(REPO, ARTIFACT)} carries no suiteOutcome, so there is no evidence ` +
        'the run behind these figures passed. Re-run --record.'
    );
  } else if (!outcome.allGreen) {
    problems.push(
      'the recorded figures came from a suite that did not pass ' +
        `(frontend ${outcome.frontend?.failed ?? '?'} failed, ` +
        `backend ${outcome.backend?.failed ?? '?'} failed). ` +
        'Numbers from a red run are not evidence. Fix the suite, then re-run --record.'
    );
  }

  if (mode === 'write') {
    const written = [];
    for (const [rel, entry] of files) {
      if (!entry.dirty) continue;
      writeFileSync(join(REPO, rel), entry.text);
      written.push(rel);
    }
    console.log(
      rewrites === 0
        ? '  ✓ Everything already agrees with the source. Nothing rewritten.'
        : `  ✓ rewrote ${rewrites} number${rewrites === 1 ? '' : 's'} in ${written.join(', ')}.`
    );
    if (problems.length) {
      console.error(
        '\n  Some problems cannot be fixed by rewriting a number:\n'
      );
      for (const p of problems) console.error(`  ✗ ${p}\n`);
      process.exit(1);
    }
    return;
  }

  if (problems.length) {
    console.error(
      `\n  Claim sites disagree with the code in ${problems.length} place(s):\n`
    );
    for (const p of problems) console.error(`  ✗ ${p}\n`);
    console.error(
      `  Fix by re-running the source of truth, not by editing prose:\n` +
        `    node scripts/readme-facts.mjs --record   # if a suite or coverage moved\n` +
        `    node scripts/readme-facts.mjs --write    # then apply to the README\n`
    );
    process.exit(1);
  }

  const n = Object.keys(FACTS).length;
  const sites = Object.values(FACTS).reduce((a, f) => a + f.sites.length, 0);
  console.log(
    `  ✓ ${n} facts, asserted at ${sites} sites across ${files.size} file(s), ` +
      `all agree with the code (${INVARIANTS.length} invariants hold).`
  );
}

/* ── record ──────────────────────────────────────────────────────────── */

/**
 * Vitest's summary lines. The shapes that matter:
 *
 *   Tests  635 passed (635)
 *   Tests  540 passed | 11 skipped (551)
 *   Tests  2 failed | 549 passed (551)
 *
 * The parenthesised figure is the TOTAL, and reading only that made a skipped
 * suite indistinguishable from a passing one — `540 passed | 11 skipped (551)`
 * recorded exactly the same 551 as `551 passed (551)`. The README's claim is
 * "551 backend, with 0 skipped", and a recorder that cannot see a skip cannot
 * check the second half of that sentence. So the breakdown is parsed too, and
 * `skipped` becomes a fact in its own right.
 */
function parseVitest(out) {
  const files = out.match(/Test Files\s+.*?\((\d+)\)/);
  const tests = out.match(/Tests\s+(.*?)\((\d+)\)/);
  if (!files || !tests)
    throw new Error(
      'could not find Vitest\'s "Test Files"/"Tests" summary lines in the output'
    );
  const breakdown = tests[1];
  const pick = (word) => {
    const m = breakdown.match(new RegExp(`(\\d+)\\s+${word}`));
    return m ? Number(m[1]) : 0;
  };
  return {
    files: Number(files[1]),
    tests: Number(tests[2]),
    passed: pick('passed'),
    skipped: pick('skipped'),
    failed: pick('failed'),
  };
}

/** The v8 text reporter's "All files" row: `All files | 67.9 | 76.3 | ...` */
function parseCoverage(out) {
  const row = out.match(/All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/);
  if (!row)
    throw new Error(
      'could not find the v8 reporter\'s "All files" coverage row'
    );
  return { lines: Number(row[1]), branches: Number(row[2]) };
}

function record() {
  /* Vitest colourises its output depending on the environment, and the v8
     coverage reporter puts the escape sequences BETWEEN a label and its
     delimiter:

       \x1b[33;1mAll files    \x1b[0m | \x1b[33;1m  70.17\x1b[0m | ...

     `parseCoverage` matches `All files\s*\|`, and `\s*` does not match an
     escape sequence, so --record died with "could not find the v8 reporter's
     All files coverage row" while the row was sitting right there. That made
     the recorded figures refreshable only where vitest happened not to
     colourise — and --record is the prescribed remedy whenever a route or a
     test file moves, so it has to work wherever it is run. Strip once here, at
     the point of capture, rather than teaching every parser below about ANSI. */
  const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');

  const sh = (cmd) => {
    console.log(`  → ${cmd}`);
    try {
      return stripAnsi(
        execSync(cmd, {
          cwd: REPO,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      );
    } catch (e) {
      /* Vitest exits non-zero on a failing test but still prints its summary.
         We want the summary either way — a red suite still has a real count,
         and recording it is more honest than refusing to. */
      return stripAnsi(`${e.stdout || ''}${e.stderr || ''}`);
    }
  };

  /* The backend suite is invoked ONCE and parsed twice. Running it again for
     the coverage row would double the slowest step and — worse — could pair a
     coverage figure with a test count from a different run. */
  const feOut = sh('npx vitest run --config vitest.config.ts');
  const beOut = sh(
    'npx vitest run --config vitest.backend.config.ts --coverage'
  );
  const fe = parseVitest(feOut);
  const be = parseVitest(beOut);
  const cov = parseCoverage(beOut);

  const today = new Date().toISOString().slice(0, 10);
  const artifact = {
    $comment:
      'Recorded facts for README.md — figures that require executing something. ' +
      'Regenerate with `node scripts/readme-facts.mjs --record`, then apply with `--write`. ' +
      'Do not hand-edit: the point of this file is that these numbers have a command behind them.',
    recordedAt: today,
    machine: `${process.platform}-${process.arch}, node ${process.version}`,
    facts: {
      testFilesFrontend: {
        value: fe.files,
        command: 'npx vitest run --config vitest.config.ts',
      },
      testsFrontend: {
        value: fe.tests,
        command: 'npx vitest run --config vitest.config.ts',
      },
      testFilesBackend: {
        value: be.files,
        command: 'npx vitest run --config vitest.backend.config.ts',
      },
      testsBackend: {
        value: be.tests,
        command: 'npx vitest run --config vitest.backend.config.ts',
      },
      testsTotal: {
        value: fe.tests + be.tests,
        command: 'the sum of the two runs above',
      },
      testsSkipped: {
        value: fe.skipped + be.skipped,
        command: 'the "N skipped" segment of both Vitest summary lines',
      },
      coverageBackendLines: {
        value: cov.lines,
        command: 'npm run test:backend:coverage',
      },
      coverageBackendBranches: {
        value: cov.branches,
        command: 'npm run test:backend:coverage',
      },
    },
    /* Recorded but deliberately NOT asserted anywhere in the README. A green
       artifact must not be mistakable for a green suite: `--record` keeps the
       counts from a failing run on purpose, so without this block a red suite
       and a clean one leave identical files behind. */
    suiteOutcome: {
      frontend: { passed: fe.passed, failed: fe.failed, skipped: fe.skipped },
      backend: { passed: be.passed, failed: be.failed, skipped: be.skipped },
      allGreen: fe.failed === 0 && be.failed === 0,
    },
  };
  writeFileSync(ARTIFACT, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`\n  ✓ wrote ${relative(REPO, ARTIFACT)} (recorded ${today})`);
  console.log('    Now run: node scripts/readme-facts.mjs --write');
}

/* ── main ────────────────────────────────────────────────────────────── */

const arg = process.argv[2] ?? '--check';
if (arg === '--record') record();
else if (arg === '--write') run('write');
else if (arg === '--check') run('check');
else {
  console.error(
    `unknown option ${arg}\nusage: readme-facts.mjs [--check|--write|--record]`
  );
  process.exit(2);
}
