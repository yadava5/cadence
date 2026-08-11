/**
 * Does the serverless function still compile to a module format Node can load?
 *
 * On 2026-08-11 every /api route in production started answering
 * FUNCTION_INVOCATION_FAILED — a crash at module load, before any handler runs.
 * The cause was one deleted file. `api/tsconfig.json` is what @vercel/node reads
 * to compile the function, because TypeScript resolves the nearest tsconfig
 * walking up from the entrypoint. With it gone the search reached the root
 * `tsconfig.json`, which is solution-style (`"files": []`, only `references`)
 * and states no `module` at all — so TypeScript fell back to its CommonJS
 * default and emitted `exports.x = ...` into a function whose package.json says
 * `"type": "module"`. Node rejects that combination outright:
 *
 *     ReferenceError: exports is not defined in ES module scope
 *
 * Nothing in CI could see it. The typecheck project passes (it never emits),
 * the Vite build never touches `api/`, and no test loads the function the way
 * the runtime does. The front end deployed perfectly, so the API was down and
 * green at the same time.
 *
 * This check reproduces the exact mechanism offline, in about a second:
 *
 *   1. ask TypeScript which config it resolves from `api/` — the same search
 *      the builder performs, so a deleted, renamed or moved file is caught by
 *      the resolution itself rather than by a name this script hardcodes;
 *   2. compile the real entrypoint with those options and assert the EMITTED
 *      JavaScript is ESM. Asserting on the artifact rather than on the value of
 *      `compilerOptions.module` means it keeps working however the setting is
 *      spelled, and fails if a future TypeScript changes its defaults. It has
 *      to be a real `createProgram` emit: under `NodeNext` the format of a file
 *      is decided by the nearest package.json, and the cheap `transpileModule`
 *      path cannot see one — the first version of this check used it and
 *      reported CommonJS for a tree that builds and boots correctly;
 *   3. confirm the other half of the incompatibility is still true — that the
 *      package.json shipped beside the function declares `"type": "module"`.
 *
 * If step 3 ever stops holding, CommonJS emit becomes loadable and this check
 * says so instead of failing for a reason that no longer exists.
 *
 * usage: node scripts/check-serverless-emit.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = path.join(ROOT, 'api', 'index.ts');
const API_DIR = path.dirname(ENTRY);

const problems = [];
const note = (msg) => console.log(`  ${msg}`);

console.log('Serverless function emit check\n');

/* 1 ─ which tsconfig does the builder actually read? ---------------------- */

if (!fs.existsSync(ENTRY)) {
  console.error(
    `The serverless entrypoint is missing: ${path.relative(ROOT, ENTRY)}`
  );
  process.exit(1);
}

const configPath = ts.findConfigFile(
  API_DIR,
  ts.sys.fileExists,
  'tsconfig.json'
);
if (!configPath) {
  problems.push('TypeScript resolves no tsconfig.json at all from api/.');
}

const resolved = configPath ? path.relative(ROOT, configPath) : '(none)';
note(`entrypoint      ${path.relative(ROOT, ENTRY)}`);
note(`resolved config ${resolved}`);

// The root config is solution-style and specifies no module format. If the
// search lands there, emit silently becomes CommonJS — the outage above.
if (configPath && path.dirname(configPath) === ROOT) {
  problems.push(
    'The config resolved from api/ is the ROOT tsconfig.json. api/tsconfig.json ' +
      'is missing or renamed, so the function will be compiled with the root ' +
      "project's settings — which declare no module format. This is the exact " +
      'configuration that took production down on 2026-08-11.'
  );
}

/* 2 ─ what does the entrypoint actually compile to? ---------------------- */

let compilerOptions = {};
if (configPath) {
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) {
    problems.push(
      `Could not read ${resolved}: ${ts.flattenDiagnosticMessageText(read.error.messageText, ' ')}`
    );
  } else {
    const parsed = ts.parseJsonConfigFileContent(
      read.config,
      ts.sys,
      path.dirname(configPath)
    );
    compilerOptions = parsed.options;
  }
}

// A real program, not `ts.transpileModule`. Under `NodeNext` the emitted format
// of a given file depends on the `type` of the nearest package.json, and
// transpileModule has no filesystem host to look that up with — it assumes
// CommonJS and would fail this check against a tree that builds and boots
// perfectly. Asking for the wrong answer quickly is not a saving.
const program = ts.createProgram({
  rootNames: [ENTRY],
  options: {
    ...compilerOptions,
    noEmit: false,
    declaration: false,
    outDir: undefined,
    sourceMap: false,
  },
});

let emitted = '';
const entrySource = program.getSourceFile(ENTRY);
program.emit(entrySource, (_name, text) => {
  emitted = text;
});

const moduleName =
  ts.ModuleKind[compilerOptions.module] ?? String(compilerOptions.module);
note(
  `module setting  ${compilerOptions.module === undefined ? '(unset → CommonJS default)' : moduleName}`
);
note(
  `implied format  ${ts.ModuleKind[entrySource?.impliedNodeFormat] ?? '(none — not a NodeNext resolution)'}`
);

if (!emitted) {
  problems.push(
    'The compiler produced no output for the entrypoint, so this check has no ' +
      'artifact to judge. Treated as a failure: a gate that cannot obtain its ' +
      'own evidence must not report success.'
  );
}

// Assert on the artifact, not the setting. CommonJS emit assigns to `exports`
// and calls `require(...)`; ESM emit uses import/export statements.
const looksCommonJs =
  /(^|\n)\s*exports\.\w/.test(emitted) ||
  /(^|\n)\s*(const|var)\s+\w+\s*=\s*require\(/.test(emitted);
const looksEsm = /(^|\n)\s*(import|export)\s/.test(emitted);

if (looksCommonJs) {
  problems.push(
    'The entrypoint compiles to CommonJS. The first offending line is:\n      ' +
      (
        emitted.split('\n').find((l) => /exports\.\w|require\(/.test(l)) || ''
      ).trim()
  );
} else if (!looksEsm) {
  problems.push(
    'The compiled entrypoint contains neither ESM nor CommonJS module syntax, so ' +
      'this check cannot tell what it is. That is a failure: a gate that cannot ' +
      'read its own evidence must not report success.'
  );
} else {
  note('emitted format  ESM');
}

/* 3 ─ is CommonJS actually fatal here? ----------------------------------- */

const pkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
);
note(`package type    ${pkg.type ?? '(unset → CommonJS)'}`);

if (pkg.type !== 'module') {
  problems.push(
    'The root package.json no longer declares "type": "module". That is not ' +
      'wrong by itself, but it is half of the incompatibility this check ' +
      'exists to catch, so the reasoning above needs rechecking before this ' +
      'check is trusted again.'
  );
}

/* ------------------------------------------------------------------------ */

console.log('');
if (problems.length) {
  console.error('FAIL — the deployed function would crash at module load.\n');
  for (const p of problems) console.error(`  • ${p}\n`);
  console.error(
    'Every /api route would answer FUNCTION_INVOCATION_FAILED while the front\n' +
      'end deploys normally. See the header of api/tsconfig.json.'
  );
  process.exit(1);
}

console.log(
  'PASS — the function compiles to ESM, which is what Node will load.'
);
