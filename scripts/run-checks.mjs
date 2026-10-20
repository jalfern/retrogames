#!/usr/bin/env node
// #601 step 2: the nightly full replay of scripts/checks.mjs — every lint,
// every check, mutants ON (PR `static` runs the same table scoped and
// mutant-free). Runs in series, keeps going past failures, exits 1 if any
// deterministic check died. `--smoke` replays the browser steps instead.
import { spawnSync } from 'node:child_process';
import { CORE, SCOPES } from './checks.mjs';

const smokeMode = process.argv.includes('--smoke');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const failed = [];

function run(label, args) {
  process.stdout.write(`\n::group::${label}\n`);
  const r = spawnSync(npm, ['run', ...args], { stdio: 'inherit' });
  const code = r.status ?? 1;
  process.stdout.write(`::endgroup::${code === 0 ? '' : ` ${label} exit=${code}`}\n`);
  if (code !== 0) failed.push(label);
}

if (smokeMode) {
  for (const s of CORE.smoke) run(s, [s]);
  for (const [k, sc] of Object.entries(SCOPES)) for (const s of sc.smoke) run(s, [s]);
} else {
  for (const l of new Set([...CORE.lint, ...Object.values(SCOPES).flatMap((s) => s.lint)])) run(l, [l]);
  const seen = new Set();
  for (const cs of [CORE.checks, ...Object.values(SCOPES).map((s) => s.checks)]) {
    for (const c of cs) {
      const [alias, mutate] = Array.isArray(c) ? c : [c, false];
      const args = mutate ? [alias, '--', '--mutate'] : [alias];
      const key = args.join(' ');
      if (seen.has(key)) continue;
      seen.add(key);
      run(key, args);
    }
  }
}

console.log(failed.length ? `NIGHTLY RED (${failed.length}): ${failed.join(', ')}` : 'NIGHTLY GREEN');
process.exit(failed.length ? 1 : 0);
