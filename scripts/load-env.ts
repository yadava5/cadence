/**
 * Load `.env` then `.env.local` into `process.env`, as an IMPORT SIDE EFFECT.
 *
 * WHY THIS IS ITS OWN MODULE
 *
 * `dev-server.ts` used to carry this as a `loadEnv()` function under the
 * comment "Load env files before importing anything else", called at the top of
 * the module body. That comment described an impossible ordering: `import`
 * declarations are hoisted, and every imported module is fully evaluated before
 * one line of the importing module's body runs. So the call happened AFTER
 * `packages/backend/src/utils/jwt.ts` had already been evaluated, and that file
 * deliberately throws at module load when `JWT_SECRET` is missing. `npm run dev`
 * therefore died with "Error: JWT_SECRET is not set. Refusing to start" on a
 * fresh clone that had a perfectly good `.env.local` sitting next to it. The
 * loader was not broken; it simply never got to run.
 *
 * Moving the work into a module and importing it FIRST is what actually buys
 * the ordering, because module evaluation follows import order. It is the same
 * reason `import 'dotenv/config'` is spelled that way rather than as a call.
 *
 * Node's `--env-file` would also work and needs no file at all, but `--env-file`
 * is fatal when the file is absent and `--env-file-if-exists` only landed in
 * Node 22.9; `package.json` pins `engines.node` to `22.x`, so a contributor on
 * 22.4 would get a different, worse failure than the one being fixed here.
 *
 * The parsing is deliberately unchanged from the original: same two files, same
 * order, same last-write-wins behaviour (`.env.local` overrides `.env`). This
 * commit is about WHEN it runs, not about what it does; `.env.local`'s
 * `DATABASE_URL` is byte identical to the one `npm run dev:api` exports inline,
 * so nothing downstream sees a different value than it did before.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const envFiles = ['.env', '.env.local'];
for (const file of envFiles) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) {
    const content = readFileSync(path, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
  }
}
