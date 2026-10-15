/**
 * Is every stateful @radix-ui internal package installed exactly once?
 *
 * Radix splits its primitives across small internal packages — react-dialog
 * and react-menu both sit on top of react-dismissable-layer, react-primitive,
 * react-presence and so on — and each package pins those internals to an
 * EXACT version, never a range. So the moment two top-level radix packages
 * disagree about an internal's version, npm cannot hoist one copy and installs
 * a separate one under each parent. The module is then loaded more than once,
 * and every module-level binding inside it exists more than once with it.
 *
 * That is not a tidiness problem. react-dismissable-layer keeps the saved
 * value of `document.body.style.pointerEvents` in module scope: a layer stores
 * the current value on mount and restores it on unmount, so that nested modals
 * hand the "outside is inert" state back and forth correctly. Split the module
 * and they no longer share the ledger. On 2026-10-15 a dependency bump left
 * react-tooltip pinning react-dismissable-layer 1.1.19 while react-dialog,
 * react-menu, react-popover and react-select had moved to 1.1.20 — five
 * instances — and the delete-confirmation dialog opened from a task row's ⋮
 * menu did this:
 *
 *   - the menu set body pointer-events to "none" and saved "";
 *   - the dialog, a DIFFERENT instance, saved the menu's "none" as its own
 *     "original" and so never blocked the outside at all;
 *   - the menu unmounted and restored "";
 *   - closing the dialog restored its saved "none" — permanently.
 *
 * The task really was deleted, so nothing looked wrong, and then the whole
 * page stopped accepting clicks until a reload. Measured in Chromium against
 * the production bundle, not inferred.
 *
 * Nothing could see it coming. `npm ci` is happy — the tree is valid, just
 * duplicated. The build is happy. Lint and typecheck cannot reach it. The one
 * thing that did notice was two unit tests, and only by accident: the leaked
 * body style poisoned a LATER test in the same file, so the tests that
 * actually drive the dialog passed in isolation while the bug was live. A gate
 * that depends on test ordering is not a gate.
 *
 * This one reads the lockfile and nothing else — no install, no node_modules,
 * node builtins only — so it can run as the first step of a job and cost
 * nothing. It asks one question: does the lock place any @radix-ui package
 * below the top level?
 *
 * Deliberately not restricted to @radix-ui parents. A nested copy under a
 * non-radix dependent splits the module identically, and `cmdk` depends on
 * react-dialog and react-primitive, so that parent is a live possibility here.
 *
 * usage: node scripts/check-radix-dedupe.mjs
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = path.join(ROOT, 'package-lock.json');

/**
 * Internal packages that are safe to duplicate, with the reason. Keep this
 * minimal and justify every entry by reading the package, not by assuming:
 * the point of the allowlist is to stay small enough that a new name appearing
 * here is itself a prompt to check what that module keeps in scope.
 *
 * An entry that no longer matches anything is reported as stale but does NOT
 * fail — a gate that goes red when the problem is fully fixed is worse than no
 * gate.
 */
const DUPLICATION_IS_INERT = {
  // One function. Its entire state is a React.useRef, which is per component
  // instance, not per module. No module-level mutable binding, no document or
  // window access, no side effect at import time — so N copies behave exactly
  // like one. (Its only module-scope values are esbuild's pure __defProp /
  // __name keep-names helpers. Those matter for manual-chunk cycles, which
  // vite.config.ts's CIRCULAR_CHUNK guard covers, not for shared state.)
  '@radix-ui/react-use-previous':
    'stateless hook — state lives in a per-instance useRef, nothing in module scope',
};

const note = (msg) => console.log(`  ${msg}`);
const problems = [];

/** Keep the failure readable when 20 packages share one pin. */
const list = (names, max = 6) =>
  names.length <= max
    ? names.join(', ')
    : `${names.slice(0, max).join(', ')} +${names.length - max} more`;

/* 1 ─ read the lock ------------------------------------------------------ */

if (!fs.existsSync(LOCK)) {
  console.error('FAIL — package-lock.json not found at ' + LOCK);
  process.exit(1);
}

const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
const packages = lock.packages;

note(`lockfileVersion ${lock.lockfileVersion ?? '(unset)'}`);

if (!packages || typeof packages !== 'object') {
  console.error(
    'FAIL — this lockfile has no "packages" map, so the check cannot see the\n' +
      'installed tree at all. That is a failure, not a pass: the lock format\n' +
      'changed (lockfileVersion 1?) and this script needs updating before it\n' +
      'can be trusted again.'
  );
  process.exit(1);
}

/* 2 ─ can this gate still see what it checks? ---------------------------- */

// If radix is gone, or the key shape changed, every lookup below returns
// nothing and the check would report a confident PASS over an empty set.
const TOP_LEVEL = /^node_modules\/(@radix-ui\/[^/]+)$/;
const topLevel = new Map();
for (const [key, meta] of Object.entries(packages)) {
  const m = key.match(TOP_LEVEL);
  if (m) topLevel.set(m[1], meta?.version ?? '(unknown)');
}

note(`top-level @radix-ui packages  ${topLevel.size}`);

if (topLevel.size === 0) {
  console.error(
    'FAIL — the lock contains no top-level @radix-ui package. Either radix was\n' +
      'removed from the project (in which case delete this check) or the key\n' +
      'shape this script matches on has changed. Refusing to pass over\n' +
      'evidence it cannot read.'
  );
  process.exit(1);
}

/* 3 ─ any @radix-ui package installed below the top level? --------------- */

// Matches at any depth: node_modules/<parent...>/node_modules/@radix-ui/<name>
const NESTED = /^node_modules\/.+\/node_modules\/(@radix-ui\/[^/]+)$/;

/** name -> [{ key, parent, version }] */
const nested = new Map();
const allowed = [];

for (const [key, meta] of Object.entries(packages)) {
  const m = key.match(NESTED);
  if (!m) continue;
  const name = m[1];
  const parent = key
    .slice(0, key.lastIndexOf('/node_modules/'))
    .replace(/^node_modules\//, '');
  const entry = { key, parent, version: meta?.version ?? '(unknown)' };
  if (DUPLICATION_IS_INERT[name]) {
    allowed.push({ name, ...entry });
    continue;
  }
  if (!nested.has(name)) nested.set(name, []);
  nested.get(name).push(entry);
}

const nestedCount =
  [...nested.values()].reduce((n, v) => n + v.length, 0) + allowed.length;
note(`nested @radix-ui copies       ${nestedCount}`);
for (const a of allowed) {
  note(
    `  allowed  ${a.name} under ${a.parent} — ${DUPLICATION_IS_INERT[a.name]}`
  );
}

for (const [name, used] of [...Object.keys(DUPLICATION_IS_INERT)].map((n) => [
  n,
  allowed.filter((a) => a.name === n),
])) {
  if (used.length === 0) {
    note(
      `  stale allowlist entry: ${name} is no longer duplicated — drop it from ` +
        'DUPLICATION_IS_INERT (not a failure)'
    );
  }
}

/* 4 ─ name the laggard, so the message is actionable --------------------- */

/**
 * For a duplicated internal, which top-level radix packages pin which version
 * of it? The odd one out is the package that needs moving.
 */
const pinnedBy = (name) => {
  const byVersion = new Map();
  for (const [key, meta] of Object.entries(packages)) {
    const m = key.match(TOP_LEVEL);
    if (!m) continue;
    const pin = meta?.dependencies?.[name];
    if (!pin) continue;
    if (!byVersion.has(pin)) byVersion.set(pin, []);
    byVersion.get(pin).push(m[1].replace('@radix-ui/', ''));
  }
  return [...byVersion.entries()].sort((a, b) => b[1].length - a[1].length);
};

if (nested.size) {
  for (const [name, copies] of nested) {
    problems.push(
      `${name} is installed ${copies.length + 1} times — once at the top level ` +
        `(${topLevel.get(name) ?? 'absent'}) and under: ` +
        list(copies.map((c) => `${c.parent}@${c.version}`))
    );
    const pins = pinnedBy(name);
    if (pins.length > 1) {
      const [majorityPin] = pins[0];
      const odd = pins.slice(1);
      problems.push(
        `  └─ pinned as: ` +
          pins.map(([v, who]) => `${v} by ${list(who, 4)}`).join('  |  ') +
          `. Move ${list(odd.flatMap(([, who]) => who))} onto ${majorityPin}, ` +
          'which the rest already use.'
      );
    }
  }
}

/* ------------------------------------------------------------------------ */

console.log('');
if (problems.length) {
  console.error('FAIL — split module instances of @radix-ui internals.\n');
  for (const p of problems) console.error(`  • ${p}\n`);
  console.error(
    'Why this fails the build: these packages hold shared state in MODULE scope\n' +
      "— react-dismissable-layer keeps document.body's saved pointer-events\n" +
      'there. Loaded twice, two modals no longer share it, and closing a dialog\n' +
      'opened from a menu can leave `pointer-events: none` on <body> for good,\n' +
      'so the page silently stops accepting clicks. npm ci, the build, lint and\n' +
      'typecheck are all green on such a tree.\n\n' +
      'Fix by moving the packages that pin the old version onto the same\n' +
      'internals generation as the rest, so npm can hoist a single copy — not\n' +
      'by adding names to the allowlist in this script. Only a package with no\n' +
      'module-level state belongs there.'
  );
  process.exit(1);
}

console.log(
  'PASS — every stateful @radix-ui internal is installed exactly once.'
);
