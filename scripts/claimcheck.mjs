// #1234: qa-claim.sh liveness gate — offline, stubbed gh, no network.
//
//   npm run claimcheck
//
// The bug: holder() took the claimer from the newest `claimed` comment but
// measured age from ANY comment starting QA — so the "claim dead" strip that
// frees an item restarted its own 90-min lockout (observed live on #1221 at
// ~15:05Z: strip posted, claim refused "held by mini (newest QA comment 0
// min ago)"). Liveness is now `QA (<node>): claimed|checkpoint` only;
// bookkeeping (claim dead / yielding / waiting on Jon) must not extend it.
//
// Layer A drives the real script through a stub gh (fixture comment stream +
// POST capture), so the whole refuse/resume/claim path runs. Layer B pins the
// registration. Mutant proof: restore startswith("QA") in holder() -> A1 goes
// red (the strip restarts the lockout again).

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'qa-claim.sh')

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

const NOW = Date.now()
const minAgo = (m) => new Date(NOW - m * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z')
const cmt = (body, min) => ({ body, created_at: minAgo(min) })

const STUB = `#!/bin/bash
method=GET; endpoint=""; body=""
shift
while [ $# -gt 0 ]; do
  case "$1" in
    -X) method="$2"; shift 2;;
    -f) case "$2" in body=*) body="\${2#body=}";; esac; method=POST; shift 2;;
    --paginate) shift;;
    *) endpoint="$1"; shift;;
  esac
done
case "$endpoint" in
  */labels*) ;;
  *comments*)
    if [ "$method" = POST ]; then
      jq -nc --arg b "$body" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{body:$b,created_at:$t}' >> "$QA_STUB_STATE"
    else
      jq -s '.' "$QA_STUB_STATE"
    fi
    ;;
esac
exit 0
`

function runClaim(comments, node) {
  const dir = mkdtempSync(join(tmpdir(), 'claimcheck-'))
  const state = join(dir, 'state.jsonl')
  writeFileSync(state, comments.map((c) => JSON.stringify(c)).join('\n') + (comments.length ? '\n' : ''))
  const stub = join(dir, 'gh')
  writeFileSync(stub, STUB, { mode: 0o755 })
  const done = (code, out) => ({
    code, out,
    posted: readFileSync(state, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).body),
  })
  try {
    const out = execFileSync('bash', [script, '900', node, 'test plan'], {
      env: { ...process.env, GH: stub, QA_STUB_STATE: state },
      encoding: 'utf8',
      timeout: 60000,
    })
    return done(0, out)
  } catch (e) {
    return done(e.status ?? -1, `${e.stdout || ''}${e.stderr || ''}`)
  }
}

section('A. live behaviour via stubbed gh')

// A1 — THE BUG (#1221, 2026-10-29 ~15:05Z): strip frees mini's stale claim;
// studio must be able to claim immediately, not 90 min after the strip.
{
  const { code, out, posted } = runClaim([
    cmt('QA (mini): claimed 2026-10-29T11:38Z — plan: old', 200),
    cmt('QA (studio): claim dead — newest QA comment >90 min old; qa/x resumable.', 2),
  ], 'studio')
  ok(code === 0 && out.includes('CLAIMED #900 for studio'), `A1 strip then claim succeeds: code=${code} out=${out.trim()}`)
  ok(/no claim\/checkpoint for \d{2,} min/.test(posted[posted.length - 1] || ''),
    'A1 posted note cites the stale claimed age, not the strip age')
}

// A2 — a fresh foreign claim is still refused.
{
  const { code, out } = runClaim([cmt('QA (mini): claimed now-ish — plan: x', 5)], 'studio')
  ok(code === 1 && out.includes('REFUSED') && out.includes('held by mini'), `A2 live claim refused: code=${code}`)
}

// A3 — checkpoint keeps a claim alive (activity, not bookkeeping).
{
  const { code, out } = runClaim([
    cmt('QA (mini): claimed long ago — plan: x', 200),
    cmt('QA (mini): checkpoint. pushed branch qa/x', 10),
  ], 'studio')
  ok(code === 1 && out.includes('held by mini'), `A3 checkpoint extends liveness: code=${code}`)
}

// A4 — yielding is bookkeeping: frees, does not extend.
{
  const { code, out } = runClaim([
    cmt('QA (mini): claimed 2026-10-29T11:38Z — plan: x', 200),
    cmt('QA (mini): yielding to studio', 2),
  ], 'studio')
  ok(code === 0 && out.includes('CLAIMED'), `A4 yielding does not lock: code=${code}`)
}

// A5 — waiting-on-Jon frees too (5b removes building-qa at the same time).
{
  const { code } = runClaim([
    cmt('QA (mini): claimed ages ago — plan: x', 200),
    cmt('QA: waiting on Jon — review PR #999', 2),
  ], 'studio')
  ok(code === 0, `A5 waiting-on-Jon does not lock: code=${code}`)
}

// A6 — resume: own claim inside the window says "already yours", posts nothing.
{
  const { code, out } = runClaim([cmt('QA (studio): claimed recently — plan: x', 10)], 'studio')
  ok(code === 0 && out.includes('already yours'), `A6 own claim resumes: code=${code}`)
}

// A7 — clean issue claims and lands label+comment (post-and-recheck path).
{
  const { code, out } = runClaim([], 'studio')
  ok(code === 0 && out.includes('CLAIMED #900 for studio'), `A7 clean issue claims: code=${code}`)
}

section('B. wiring tripwires')
const claim = readFileSync(script, 'utf8')
ok(/test\("\^QA \\\\\(\[a-z0-9-\]\+\\\\\): \(claimed\|checkpoint\)"\)\)/.test(claim),
  'holder() measures age from claimed|checkpoint only (#1234)')
ok(!claim.includes('startswith("QA")'), 'holder() no longer ages from any QA-prefixed comment')
const pkg = readFileSync(join(here, '..', 'package.json'), 'utf8')
ok(pkg.includes('"claimcheck"'), 'package.json carries the claimcheck alias')
const checks = readFileSync(join(here, 'checks.mjs'), 'utf8')
ok(checks.includes("'claimcheck'"), 'checks.mjs CORE replays claimcheck nightly')
const ci = readFileSync(join(here, '..', '.github', 'workflows', 'ci.yml'), 'utf8')
ok(ci.includes('npm run claimcheck'), 'ci.yml static job runs claimcheck')
const playbook = readFileSync(join(here, 'FORGE-QA.md'), 'utf8')
ok(playbook.includes('claimed') && playbook.includes('#1234'),
  'FORGE-QA.md step 2 states the liveness rule')

console.log(`\x1b[1m\nclaimcheck: ${pass} gates, ${fails.length} failures\x1b[0m`)
for (const f of fails) console.error(`FAIL ${f}`)
process.exit(fails.length ? 1 : 0)
