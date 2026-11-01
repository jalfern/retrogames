#!/usr/bin/env node
// #601 step 1: turn "what changed" into "what CI runs".
//   node scripts/ciscope.mjs <changed-files.txt>   -> GitHub outputs keys/docs
//   node scripts/ciscope.mjs --selftest              -> fixture assertions
import { readFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { classify, touchesShared, CORE, SCOPES, PINS } from './checks.mjs';

if (process.argv.includes('--selftest')) {
  const cases = [
    { files: ['docs/ART.md'], docs: true, keys: [], shared: false },
    { files: ['src/games/Pong/index.jsx'], docs: false, keys: ['pong'], shared: false },
    { files: ['src/games/SSX/index.jsx', 'public/models/ssx/rogue.glb'], docs: false, keys: ['ssx'], shared: false },
    { files: ['src/utils/AudioController.js'], docs: false, all: true, shared: true },
    { files: ['.github/workflows/ci.yml'], docs: false, all: true, shared: false },
    { files: ['src/games/CivilizationV/index.jsx'], docs: false, all: true, shared: false },
    { files: ['src/games/Pong/attract.js'], docs: false, keys: ['pong', 'attract'], shared: false },
    { files: ['src/games/Pong/index.jsx', 'src/games/Pong/attract.js'], docs: false, keys: ['pong', 'attract'], shared: false },
    { files: ['scripts/lib/harness.mjs'], docs: true, keys: [], shared: true },
    { files: ['package-lock.json'], docs: false, all: true, shared: false },
    { files: ['relay/worker.js'], docs: false, all: true, shared: true },
    // #1387: docs-shaped but pinned — checks read these files' raw text, so
    // editing them must face the checks (was: docs=true; #1299 rode through).
    { files: ['scripts/telemetry.sh'], docs: false, all: true, shared: false },
    { files: ['scripts/forge.sh'], docs: false, all: true, shared: false },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = classify(c.files);
    const sh = touchesShared(c.files);
    const want = c.all ? null : [...c.keys].sort();
    const ok = got.docs === c.docs && sh === c.shared && (c.all
      ? got.keys.includes('all')
      : JSON.stringify([...got.keys].sort()) === JSON.stringify(want));
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.files.join(',')} -> docs=${got.docs} keys=${got.keys.length ? got.keys.length > 4 ? `[${got.keys.length} keys incl ${got.keys.includes('all') ? 'all' : 'scoped'}]` : `[${got.keys}]` : '[]'} shared=${sh}`);
    if (!ok) bad++;
  }
  const require = createRequire(import.meta.url);
  const scripts = require('../package.json').scripts;
  for (const [k, s] of Object.entries(SCOPES)) {
    for (const a of [...s.lint, ...s.checks.map((c) => (Array.isArray(c) ? c[0] : c)), ...s.smoke]) {
      if (!scripts[a]) { console.log(`FAIL scope ${k}: alias ${a} missing from package.json`); bad++; }
    }
  }
  for (const c of [...CORE.lint, ...CORE.checks, ...CORE.smoke]) {
    const a = Array.isArray(c) ? c[0] : c;   // CORE may carry [alias, mutate] like SCOPES
    if (!scripts[a]) { console.log(`FAIL core: alias ${a} missing from package.json`); bad++; }
  }
  // #1387 pin-map guard: checks.mjs derives which docs-shaped files the
  // CI-run check scripts read as raw text. Every pin must map to >=1 scope,
  // and classify() must refuse to call it docs — else a PR editing that file
  // stales the check that pins it without ever running it (the #1299 hole).
  // Runs here because --selftest is the one step docs-only PRs always run.
  const pinEntries = Object.entries(PINS).sort();
  if (!pinEntries.length) { console.log('FAIL pin-map empty — derivation silently died'); bad++; }
  if (!(PINS['scripts/telemetry.sh'] || []).includes('core')) {
    console.log('FAIL pin anchor: scripts/telemetry.sh must pin to core (read by shiftreportcheck, #1299/#1387)'); bad++;
  }
  if (!(PINS['scripts/main-ok.sh'] || []).includes('core')) {
    console.log('FAIL pin anchor: scripts/main-ok.sh must pin to core (read by nightlyverdictcheck, #1387)'); bad++;
  }
  for (const [f, ks] of pinEntries) {
    const c = classify([f]);
    if (!ks.length || c.docs || !ks.every((k) => c.keys.includes(k))) {
      console.log(`FAIL pin ${f} -> [${ks}] classify docs=${c.docs} keys=${c.keys.length > 4 ? '[all]' : `[${c.keys}]`}`); bad++;
    }
  }
  console.log(bad ? `ciscope: ${bad} FAILURES` : `ciscope: ${cases.length + 1} cases + ${pinEntries.length} pins ok (selftest)`);
  process.exit(bad ? 1 : 0);
}

const file = process.argv[2];
if (file === '--all') {
  const { keys } = classify(['.github/workflows/ci.yml']);
  const line = `docs=false\nkeys=${JSON.stringify(keys)}\nshared=true`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line + '\n');
  console.log(line);
  process.exit(0);
}
if (!file) { console.error('usage: ciscope.mjs <changed-files.txt> | --all | --selftest'); process.exit(2); }
const files = readFileSync(file, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const { docs, keys } = classify(files);
const line = `docs=${docs}\nkeys=${JSON.stringify(keys)}\nshared=${touchesShared(files)}`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line + '\n');
console.log(line);
