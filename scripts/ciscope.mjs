#!/usr/bin/env node
// #601 step 1: turn "what changed" into "what CI runs".
//   node scripts/ciscope.mjs <changed-files.txt>   -> GitHub outputs keys/docs
//   node scripts/ciscope.mjs --selftest              -> fixture assertions
import { readFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { classify, touchesShared, CORE, SCOPES } from './checks.mjs';

if (process.argv.includes('--selftest')) {
  const cases = [
    { files: ['docs/ART.md', 'scripts/forge.sh'], docs: true, keys: [], shared: false },
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
  for (const a of [...CORE.lint, ...CORE.checks, ...CORE.smoke]) {
    if (!scripts[a]) { console.log(`FAIL core: alias ${a} missing from package.json`); bad++; }
  }
  console.log(bad ? `ciscope: ${bad} FAILURES` : `ciscope: ${cases.length + 1} cases ok (selftest)`);
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
