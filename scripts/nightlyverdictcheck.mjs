// #1358: the verdict workflow must contain verdict jobs ONLY — offline, no network.
//
//   npm run nightlyverdictcheck
//
// The bug: shoreperf (continue-on-error: true, macos-14) lived inside nightly.yml.
// When the macOS pool failed to provision for a dispatched run the job went
// `cancelled` at start (0 steps, runs 41219217859 / 41231552162) — and GitHub
// propagates a CANCELLED job to the run conclusion even though continue-on-error
// neutralizes it for success()/failure() (heal ran green in both runs). The runs
// ended `cancelled`, so every green-streak consumer reset although static+smoke
// passed. Fix: shoreperf moved to shoreperf-nightly.yml (own concurrency group);
// nightly.yml's conclusion is now purely the deterministic suite.
//
// Mutant proof: re-insert `continue-on-error: true` into nightly.yml -> A1 red.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// Comments carry the war stories (#1358 names its own symptoms); assertions
// run on CODE only, so a trail note can never fake a gate red or green.
const strip = (s) => s.replace(/#.*$/gm, '')
const wf = (f) => strip(readFileSync(join(here, '..', '.github', 'workflows', f), 'utf8'))

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

// top-level job names: two-space indented `name:` keys inside the jobs: block.
function jobNames(src) {
  const jobs = src.slice(src.indexOf('\njobs:'))
  return [...jobs.matchAll(/^  ([a-z][a-z0-9-]*):$/gm)].map((m) => m[1])
}
// the cron line(s) of a workflow's `on.schedule`.
function crons(src) {
  return [...src.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1])
}

const nightly = wf('nightly.yml')
const shore = wf('shoreperf-nightly.yml')

section('A. nightly.yml = verdict jobs only')

// A1 — THE GUARD (#1358): no advisory job may live in the verdict workflow.
// continue-on-error covers failures but NOT job cancellation; an advisory job
// here can always poison the run conclusion via a scheduling cancel.
ok(!nightly.includes('continue-on-error'),
  'nightly.yml has no continue-on-error job (advisory jobs poison the run verdict via cancels)')

// A2 — the poison actually left: no shoreperf invocation remains.
ok(!nightly.includes('shoreperf'),
  'nightly.yml runs no shoreperf (the #1358 advisory job is gone from the verdict path)')

// A3 — exact verdict job set (a new job must earn its place here deliberately).
const set = jobNames(nightly).sort().join(',')
ok(set === 'full-smoke,full-static,heal,report',
  `nightly.yml jobs are exactly the verdict set (got: ${set})`)

// A4 — deterministic pool only: every verdict job runs on ubuntu-latest, so no
// macOS-capacity flake can ever touch the file main-ok.sh reads.
const runners = [...nightly.matchAll(/runs-on:\s*(\S+)/g)].map((m) => m[1])
ok(runners.length > 0 && runners.every((r) => r === 'ubuntu-latest'),
  `every nightly.yml job runs on ubuntu-latest (got: ${runners.join(',')})`)

section('B. shoreperf-nightly.yml keeps #680 intact, advisory')

ok(shore.includes('scripts/shoreperf.mjs --profile desktop,qhd,phone'),
  'shoreperf workflow runs the full desktop/qhd/phone profile set (#680)')
ok(shore.includes('SHOREPERF_ASSUME_QUIET') && shore.includes('runs-on: macos-14'),
  'quiet-box assumptions preserved (macos-14 Metal runner + ASSUME_QUIET)')
ok(/continue-on-error:\s*true/.test(shore),
  'shoreperf job stays continue-on-error (a perf blip must stay advisory here too)')

// B4 — own concurrency group: nightly dispatches and perf dispatches can never
// queue each other; cancel-in-progress means a fresh dispatch supersedes backlog.
const shoreGroup = shore.match(/group:\s*(\S+)/)?.[1]
ok(shoreGroup === 'shoreperf-nightly',
  `shoreperf workflow has its own concurrency group (got: ${shoreGroup})`)
ok(/cancel-in-progress:\s*true/.test(shore),
  'shoreperf cancels in-progress (newest numbers win; nothing stacks behind a macOS flake)')
ok(!/group:\s*nightly\s*$/.test(shore), 'shoreperf workflow does not share the nightly group')

// B6 — the trend keeps the quiet-hours window: same cron as the verdict nightly.
const nCron = crons(nightly)[0]
const sCron = crons(shore)[0]
ok(sCron === nCron && sCron === '15 6 * * *',
  `shoreperf keeps the nightly quiet window (nightly ${nCron}, shoreperf ${sCron})`)

section('C. consumers read the split honestly')

const mainok = strip(readFileSync(join(here, 'main-ok.sh'), 'utf8'))
// C1 — the freeze signal blocks real failures only; a cancelled advisory-run
// must never read as red (it is what left the #1358 evidence muddy in reverse).
ok(mainok.includes('failure') && mainok.includes('timed_out') && !/concl.*cancelled/.test(mainok),
  'main-ok.sh blocks only failure/timed_out (cancelled never wedges merges)')
ok(mainok.includes('nightly.yml') && !mainok.includes('shoreperf-nightly'),
  'main-ok.sh reads nightly.yml only — the file the split keeps advisory-free')

// C2 — shiftreport treats a cancelled run as a fact, not silence (#1358 lesson
// generalized from #1259): excluded from durations, counted on its own.
const shift = strip(readFileSync(join(here, 'shiftreport.mjs'), 'utf8'))
ok(shift.includes("conclusion !== 'cancelled'") && /cancelledMain/.test(shift),
  'shiftreport separates cancelled runs from finished ones (vanish != silence)')

section('D. wiring tripwires')

const pkg = readFileSync(join(here, '..', 'package.json'), 'utf8')
ok(pkg.includes('"nightlyverdictcheck"'), 'package.json carries the nightlyverdictcheck alias')
const checks = readFileSync(join(here, 'checks.mjs'), 'utf8')
ok(checks.includes("'nightlyverdictcheck'"), 'checks.mjs CORE replays nightlyverdictcheck nightly')
const ci = wf('ci.yml')
ok(ci.includes('npm run nightlyverdictcheck'), 'ci.yml static job runs nightlyverdictcheck')

console.log(`\x1b[1m\nnightlyverdictcheck: ${pass} gates, ${fails.length} failures\x1b[0m`)
for (const f of fails) console.error(`FAIL ${f}`)
process.exit(fails.length ? 1 : 0)
