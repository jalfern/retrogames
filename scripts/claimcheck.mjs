// #1234 / #3072: claim liveness gates — offline, stubbed gh, no network.
//
//   npm run claimcheck
//
// The #1234 bug: holder() took the claimer from the newest `claimed` comment but
// measured age from ANY comment starting QA — so the "claim dead" strip that
// frees an item restarted its own 90-min lockout (observed live on #1221 at
// ~15:05Z: strip posted, claim refused "held by mini (newest QA comment 0
// min ago)"). Bookkeeping that frees (claim dead / yielding / waiting on Jon)
// must not extend the lockout.
//
// The #3072 bug (the fix's other half): the liveness regex then required the
// literal words claimed|checkpoint — and a lane that checkpoints in prose or
// sha form (`FORGE (b): ec760a3 — sim core live`, #3067, 2026-11-23) refreshed
// nothing. Live lanes were treated as dead and the warden re-kicked held items.
// Liveness is now ANY comment in the lane namespace except the three named
// releases, in all three readers (forge-claim.sh, qa-claim.sh, warden.sh).
//
// Layer A drives qa-claim.sh through a stub gh (fixture comment stream + POST
// capture), layer C drives forge-claim.sh — including the #3053 fixture
// verbatim. Layer B pins the registration and the three-file consistency.
// Mutant proof: restore the word-only regex in qa-claim.sh -> A1/A3 go red;
// narrow it in forge-claim.sh -> C1 goes red.

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

function runScript(scriptPath, comments, lane) {
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
    const out = execFileSync('bash', [scriptPath, '900', lane, 'test plan'], {
      env: { ...process.env, GH: stub, QA_STUB_STATE: state },
      encoding: 'utf8',
      timeout: 60000,
    })
    return done(0, out)
  } catch (e) {
    return done(e.status ?? -1, `${e.stdout || ''}${e.stderr || ''}`)
  }
}
const runClaim = (comments, node) => runScript(script, comments, node)

section('A. live behaviour via stubbed gh')

// A1 — THE BUG (#1221, 2026-10-29 ~15:05Z): strip frees mini's stale claim;
// studio must be able to claim immediately, not 90 min after the strip.
{
  const { code, out, posted } = runClaim([
    cmt('QA (mini): claimed 2026-10-29T11:38Z — plan: old', 200),
    cmt('QA (studio): claim dead — newest QA comment >90 min old; qa/x resumable.', 2),
  ], 'studio')
  ok(code === 0 && out.includes('CLAIMED #900 for studio'), `A1 strip then claim succeeds: code=${code} out=${out.trim()}`)
  ok(/no live comment for \d{2,} min/.test(posted[posted.length - 1] || ''),
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

// A8 — #1258 unified namespace: a BUILDER-held item blocks QA too (#878 says
// one lane per game; the whole-queue QA lane must still respect a builder).
{
  const { code, out } = runClaim([cmt('FORGE (b): claimed recently — plan: x', 5)], 'studio')
  ok(code === 1 && out.includes('REFUSED') && out.includes('held by b'), `A8 builder claim blocks QA: code=${code}`)
}

section('C. forge-claim.sh — the same rule, builder side (#3072)')
const fscript = join(here, 'forge-claim.sh')
const runForge = (comments, slot) => runScript(fscript, comments, slot)

// C1 — #3053 verbatim (slot b on #3067, 2026-11-23): a sha-form checkpoint
// from the holder must hold the item; the other slot's claim is REFUSED.
// This is the exact fixture the word-only regex lost a live lane over.
{
  const { code, out } = runForge([
    cmt('FORGE (b): claimed 2026-11-23T21:01Z — plan: x', 200),
    cmt('FORGE (b): ec760a3 — sim core live. Canopy-drop frogmen: perch → coil → gravity drop.', 10),
  ], 'a')
  ok(code === 1 && out.includes('REFUSED') && out.includes('held by b'), `C1 sha checkpoint holds: code=${code} out=${out.trim()}`)
}

// C2 — the holder itself resumes on its own checkpoint ("already yours",
// no extra post) — step-1b resume must work off prose, not magic words.
{
  const { code, out, posted } = runForge([
    cmt('FORGE (a): claimed ages ago — plan: x', 200),
    cmt('FORGE (a): 7fbc06b — harness leg live', 10),
  ], 'a')
  ok(code === 0 && out.includes('already yours') && posted.length === 2,
    `C2 own checkpoint resumes silently: code=${code} posted=${posted.length}`)
}

// C3 — explicit releases stay releases in the builder namespace too.
{
  const { code, out } = runForge([
    cmt('FORGE (b): claimed ages ago — plan: x', 200),
    cmt('FORGE (b): yielding to a', 2),
  ], 'a')
  ok(code === 0 && out.includes('CLAIMED'), `C3 yielding does not lock: code=${code}`)
}

// C4 — the corpse path survives: a dead lane's last checkpoint still expires.
{
  const { code, out } = runForge([
    cmt('FORGE (b): claimed ages ago — plan: x', 200),
    cmt('FORGE (b): deadbeef — last gasp before the crash', 120),
  ], 'a')
  ok(code === 0 && out.includes('CLAIMED'), `C4 stale checkpoint expires (>90 min): code=${code}`)
}

// C5 — unified namespace, both directions: a QA checkpoint holds a builder off.
{
  const { code, out } = runForge([
    cmt('QA (mini): claimed ages ago — plan: x', 200),
    cmt('QA (mini): cafe123 — repro captured', 10),
  ], 'a')
  ok(code === 1 && out.includes('REFUSED') && out.includes('held by mini'), `C5 QA checkpoint holds builder: code=${code}`)
}

section('B. wiring tripwires')
const claim = readFileSync(script, 'utf8')
const LIVE = '): (?!yielding|claim dead|waiting on Jon)'
ok(claim.includes(LIVE),
  'holder() liveness = any lane-namespace comment minus the three named releases (#3072)')
ok(!claim.includes('(claimed|checkpoint)'),
  'word-only liveness regex is gone (#3053: it starved a live lane on #3067)')
ok(!claim.includes('startswith("QA")'), 'holder() no longer ages from any QA-prefixed comment')
ok(/api -X DELETE .*labels\/game-queue|for l in game-queue next steer/.test(claim),
  'qa-claim strips queue labels when QA takes a queue item (#1258 whole queue)')
const fclaim = readFileSync(join(here, 'forge-claim.sh'), 'utf8')
ok(fclaim.includes('^(QA|FORGE)') && fclaim.includes('labels[]=building'),
  'forge-claim.sh exists and shares the unified liveness namespace (#1258)')
ok(fclaim.includes(LIVE), 'forge-claim.sh measures the same liveness as qa-claim.sh (#3072)')
ok(!fclaim.includes('(claimed|checkpoint)'), 'no word-only liveness regex in forge-claim.sh (#3072)')
const wardenSrc = readFileSync(join(here, 'warden.sh'), 'utf8')
ok(wardenSrc.includes(LIVE),
  'warden.sh kick_slot measures the same liveness rule — three readers, one regex (#3072)')
ok(wardenSrc.includes('target-held-live') && wardenSrc.includes('pgrep -f "$HPAT"') && wardenSrc.includes('lane_driven "$HDEV"'),
  'warden skip-kicks when a comment-stale holder is provably alive (session pgrep / pinned port) (#3072)')
const forgeMd = readFileSync(join(here, 'FORGE.md'), 'utf8')
ok(forgeMd.includes('FORGE (<slot>): checkpoint <sha>'),
  'FORGE.md prescribes the checkpoint shape every reader agrees on (#3072)')
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
