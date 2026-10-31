// LANECHECK — the #1258 fleet planner + slot wiring, pinned offline.
//
//   npm run lanecheck
//
// Layer A runs the pure core (scripts/lib/lanes.mjs, floor.js slotsLine,
// studiotrial verdict/report) over fixtures; layer B pins the wiring across
// warden.sh, forge.sh, the plist, the claim scripts, watch panes, telemetry
// board.json slots, the board JSX and both playbooks. One alias, no new
// framework (AGENTS rule 6).
//
// Mutant proof (required one): flip `queueFree > freeSlots` to `>=` in
// scripts/lib/lanes.mjs — A6's "queue 2, both builders free" fixture goes red
// (QA would steal a builder's game). For #1290 the same works on the reserve:
// flip `studioUp && qaStudioQueue` to `false` in lib/lanes.mjs — A8d goes red
// (mini would collide with studio on the last item). Both verified by hand.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { builderLadder, lanePlan } from './lib/lanes.mjs'
import { slotsLine } from '../src/pages/floor.js'
import { trialVerdict, reportText, laneSplit, VERDICT_FILE } from './studiotrial.mjs'

const here = dirname(fileURLToPath(import.meta.url))
let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

const L = (name) => ({ name })
const iss = (number, labels, { user = 'jalfern', state = 'open', created_at = '2026-10-01T00:00:00Z' } = {}) =>
    ({ number, title: `t${number}`, state, user: { login: user }, created_at, labels: labels.map(L), pull_request: undefined })

section('A. pure planner')

// A1 — ladder order: corpse → steer → next → oldest queue → newest queue → feedback
{
    const issues = [
        iss(5, ['game-queue'], { created_at: '2026-10-20T00:00:00Z' }),
        iss(3, ['building', 'stalled']),                       // stalled corpse waits for Jon
        iss(9, ['next']),
        iss(7, ['steer']),
        iss(4, ['game-queue'], { created_at: '2026-10-10T00:00:00Z' }),
        iss(1, ['feedback']),
    ]
    const ladder = builderLadder(issues).map((i) => i.number)
    ok(JSON.stringify(ladder) === JSON.stringify([7, 9, 4, 5, 1]), `A1 ladder order: got ${ladder}`)
}

// A2 — unclaimable labels never enter the ladder
{
    const ladder = builderLadder([
        iss(1, ['game-queue', 'needs-approval']),
        iss(2, ['game-queue', 'waiting-jon', 'question']),
        iss(3, ['game-queue', 'building-qa']),
    ]).map((i) => i.number)
    ok(ladder.length === 0, `A2 parked/QA-held items excluded: got ${ladder}`)
}

// A3 — steer counts only from jalfern
{
    const ladder = builderLadder([
        iss(1, ['steer'], { user: 'rando' }),
        iss(2, ['next']),
    ]).map((i) => i.number)
    ok(JSON.stringify(ladder) === JSON.stringify([2]), `A3 rando steer outranked: got ${ladder}`)
}

// A4 — two free slots get two DISTINCT targets; kick flags follow
{
    const plan = lanePlan({
        issues: [iss(4, ['game-queue'], { created_at: '2026-10-10T00:00:00Z' }),
            iss(5, ['game-queue'], { created_at: '2026-10-20T00:00:00Z' })],
        freeA: true, freeB: true, bLoaded: true,
    })
    ok(plan.targets.a === 4 && plan.targets.b === 5, `A4 distinct targets a/b: got ${JSON.stringify(plan.targets)}`)
    ok(plan.kick.a && plan.kick.b, 'A4 both free slots kick')
}

// A5 — a busy slot passes its ladder position to the next free slot
{
    const plan = lanePlan({ issues: [iss(4, ['game-queue'])], freeA: false, freeB: true, bLoaded: true })
    ok(plan.targets.b === 4 && !plan.targets.a && plan.kick.b && !plan.kick.a,
        `A5 busy a, b inherits ladder head: got ${JSON.stringify(plan.targets)}`)
}

// A6 — slot b not loaded (job missing / trial reverted): never a target
{
    const plan = lanePlan({ issues: [iss(4, ['game-queue']), iss(5, ['game-queue'])],
        freeA: false, freeB: true, bLoaded: false })
    ok(!plan.targets.b && !plan.kick.b, 'A6 unloaded slot b takes nothing')
}

// A7 — QA studio queue-fallthrough matrix
{
    const fb = iss(1, ['feedback'])
    const q1 = iss(4, ['game-queue'], { created_at: '2026-10-10T00:00:00Z' })
    const q2 = iss(5, ['game-queue'], { created_at: '2026-10-11T00:00:00Z' })
    const q3 = iss(6, ['game-queue'], { created_at: '2026-10-12T00:00:00Z' })
    ok(lanePlan({ issues: [fb, q1], freeA: true, freeB: true }).qaStudioQueue === false,
        'A7a feedback exists -> normal studio path, no queue flag')
    ok(lanePlan({ issues: [q1], freeA: false, freeB: false }).qaStudioQueue === true,
        'A7a2 builders busy + queue 1 -> studio may take the queue')
    ok(lanePlan({ issues: [q1], freeA: true, freeB: false }).qaStudioQueue === false,
        'A7b queue 1, a free -> the builder takes it, no QA steal')
    ok(lanePlan({ issues: [q1, q2], freeA: true, freeB: true }).qaStudioQueue === false,
        'A7c queue 2, both builders free -> no QA steal (this is the mutant line)')
    ok(lanePlan({ issues: [q1, q2, q3], freeA: true, freeB: true }).qaStudioQueue === true,
        'A7d queue 3 > 2 free slots -> QA takes the third')
}

// A8 — QA mini queue-fallthrough matrix (#1290): mini takes the queue only
// after builders AND studio (when it can run) take theirs.
{
    const fb = iss(1, ['feedback'])
    const q = (n, day) => iss(n, ['game-queue'], { created_at: `2026-10-${day}T00:00:00Z` })
    ok(lanePlan({ issues: [fb, q(4, 10)], freeA: true, freeB: true }).qaMiniQueue === false,
        'A8a feedback exists -> mini keeps the feedback path, no queue flag')
    ok(lanePlan({ issues: [q(4, 10)], freeA: false, freeB: false, studioUp: true }).qaMiniQueue === false,
        'A8b builders busy, queue 1, studio up -> the item is studio\'s, mini waits')
    ok(lanePlan({ issues: [q(4, 10)], freeA: false, freeB: false, studioUp: false }).qaMiniQueue === true,
        'A8c studio down -> mini takes studio\'s share (no lane idles)')
    ok(lanePlan({ issues: [q(4, 10), q(5, 11)], freeA: false, freeB: false, studioUp: true }).qaMiniQueue === true,
        'A8d busy builders, queue 2, studio up -> one survives for mini')
    ok(lanePlan({ issues: [q(4, 10), q(5, 11)], freeA: true, freeB: true, studioUp: true }).qaMiniQueue === false,
        'A8e both builders free, queue 2 -> builders cover it, no QA steal')
    ok(lanePlan({ issues: [q(4, 10), q(5, 11), q(6, 12)], freeA: true, freeB: true, studioUp: true }).qaMiniQueue === false,
        'A8f queue 3, two builders + studio -> studio takes the third, mini still waits')
    ok(lanePlan({ issues: [q(4, 10), q(5, 11), q(6, 12), q(7, 13)], freeA: true, freeB: true, studioUp: true }).qaMiniQueue === true,
        'A8g queue 4 -> the fourth survives for mini')
    ok(lanePlan({ issues: [q(4, 10), q(5, 11)], freeA: false, freeB: true, bLoaded: false, studioUp: true }).qaMiniQueue === true,
        'A8h slot b unloaded -> one free builder, studio takes one, mini the last')
    ok(lanePlan({ issues: [q(4, 10)], freeA: false, freeB: false, studioUp: true }).counts.studioReserve === 1,
        'A8i reserve counted when studio is queue-bound and up')
}

section('B. board slots + trial verdict')

// B1 — slotsLine pure: null-safe, honest idle/up, trial/fleet word
{
    ok(slotsLine(null) === null && slotsLine(undefined) === null, 'B1a malformed slots hide the row')
    const s = slotsLine({ a: { pid: 1, up: '01:02' }, b: null, qaStudio: { pid: 2, up: '05' }, qaMini: null,
        trial: { since: '2026-10-30T12:00:00Z', reported: false } })
    ok(s && /builder-a:up 01:02/.test(s.text) && /builder-b:idle/.test(s.text) && /fleet:trial/.test(s.text),
        `B1b slots text: got ${s && s.text}`)
    ok(s && s.busy === 1, 'B1c busy counts builder slots only')
    const r = slotsLine({ a: null, b: null, verdict: 'revert 2026-11-01T00:00:00Z (before 2/day after 1/day)' })
    ok(r && /fleet:revert/.test(r.text), `B1d verdict word: got ${r && r.text}`)
}

// B2 — trial verdict: strict rise keeps, tie/decline reverts; report honest
{
    ok(trialVerdict({ closedBefore: new Array(8).fill('x'), closedAfter: new Array(12).fill('x') }).keep === true,
        'B2a 12 > 8 in 48h windows -> keep')
    ok(trialVerdict({ closedBefore: new Array(8).fill('x'), closedAfter: new Array(8).fill('x') }).keep === false,
        'B2b tie is "did not go up" -> revert')
    const t = reportText({ since: '2026-10-30T12:00:00Z', until: '2026-11-01T12:00:00Z',
        verdict: trialVerdict({ closedBefore: new Array(8).fill('x'), closedAfter: new Array(4).fill('x') }) })
    ok(/VERDICT: REVERT/.test(t) && /tokens\/s/.test(t) && /items\/day/.test(t),
        'B2c report names the verdict out loud and states the metric honestly')
    ok(VERDICT_FILE === '/tmp/forge/studio-lanes.verdict', 'B2d verdict file is the path warden step 4 reads')
}

// B3 — lane split (#1290): ships classified by LAST claim lineage; mini visible
{
    const rows = [
        { claims: ['FORGE (a): claimed 2026-10-30T01:00Z — plan: x'] },
        { claims: ['FORGE (b): claimed 2026-10-30T01:00Z — plan: x', 'FORGE (b): checkpoint 2026-10-30T02:00Z'] },
        { claims: ['QA (studio): claimed 2026-10-30T01:00Z — plan: x'] },
        { claims: ['QA (builder): claimed 2026-10-30T01:00Z — plan: x'] },
        { claims: ['QA (mini): claimed 2026-10-30T01:00Z — plan: x'] },
        { claims: ['QA (mbp): claimed 2026-10-30T01:00Z — plan: x'] },
        { claims: [] },
        { claims: ['QA (mini): claimed 2026-10-30T01:00Z — plan: x', 'QA (studio): claimed 2026-10-30T03:00Z (last claim was mini\'s) — plan: y'] },
        { claims: ['WARDEN: builder b idle, kicked a session'] },
    ]
    const s = laneSplit(rows)
    ok(s.builder === 2 && s.studioQa === 3 && s.mini === 1 && s.other === 3,
        `B3a lineage split builder/studioQa/mini/other: got ${JSON.stringify(s)}`)
    ok(s.studioQa === 3 && s.mini === 1,
        'B3b takeover (mini->studio) counts studio, the parked mbp and unclaimed land in other')
    const t = reportText({ since: '2026-10-30T12:00:00Z', until: '2026-11-01T12:00:00Z',
        verdict: trialVerdict({ closedBefore: new Array(8).fill('x'), closedAfter: new Array(12).fill('x') }),
        split: { builder: 2, studioQa: 3, mini: 1, other: 3 } })
    ok(/mini QA 1/.test(t) && /Lane split \(after window\)/.test(t),
        'B3c report shows mini ships on their own line')
    ok(!/Lane split/.test(reportText({ since: 'a', until: 'b', verdict: trialVerdict({}) })),
        'B3d no split passed -> no split line (pre-#1290 report shape unchanged)')
}

section('C. wiring tripwires')
const read = (f) => readFileSync(join(here, f), 'utf8')
const warden = read('warden.sh'), forge = read('forge.sh'), qac = read('qa-claim.sh')
const plist = read('com.jalfern.forge-b.plist'), watch = read('watch.sh')
const telem = read('telemetry.sh'), fcli = read('forge')
const forgeMd = read('FORGE.md'), qaMd = read('FORGE-QA.md')
const pkg = read('../package.json'), checks = read('checks.mjs'), ci = read('../.github/workflows/ci.yml')
const board = read('../src/pages/ForgeBoard.jsx'), floor = read('../src/pages/floor.js')

ok(/SLOT=a/.test(forge) && /a\|b\) SLOT=\$a/.test(forge), 'forge.sh parses its slot (default a)')
ok(forge.includes('THE FORGE on slot $SLOT'), 'forge.sh names the slot in the prompt (identity = pgrep-able)')
ok(/5178/.test(forge) && /5173/.test(forge), 'forge.sh: port 5173 slot a, 5178 slot b')
ok(forge.includes('target-$SLOT') && forge.includes('forge-claim.sh'), 'forge.sh hands over the warden target + claim script')

ok(plist.includes('<string>com.jalfern.forge-b</string>') && /<string>b<\/string>/.test(plist)
    && plist.includes('--foreground') && plist.includes('<key>RunAtLoad</key>\n    <false/>'),
'com.jalfern.forge-b.plist: right label, slot arg b, foreground, no calendar (the warden owns its clock)')

ok(warden.includes('scripts/lanes.mjs') && warden.includes('A_TARGET'), 'warden takes its plan from lanes.mjs')
ok(warden.includes('kick_slot a') && warden.includes('kick_slot b'), 'warden kicks both builder slots')
ok(warden.includes('launchctl bootstrap') && warden.includes('forge-b'), 'warden self-bootstraps the slot-b job from main')
ok(warden.includes('origin/main:scripts/$SLOTB_JOB.plist'), 'slot-b plist is read from origin/main, not the lagging working tree (quiet-never-fire guard)')
ok(warden.includes('studio-lanes.verdict') && warden.includes('revert'), 'warden enforces the trial verdict')
ok(/builder \'"\$s"\' idle|"WARDEN: builder \$s idle"/.test(warden), 'per-slot kick comments (two stall counters, #1258)')
ok(warden.includes('QA_STUDIO_QUEUE'), 'warden routes studio QA onto the queue')
ok(warden.includes('QA_MINI_QUEUE') && /node" == mini && "\$QA_MINI_QUEUE"/.test(warden),
    'warden routes mini QA onto the queue (#1290)')
ok(warden.includes('--studio-up'), 'warden feeds studio liveness to the planner (#1290 reserve)')
ok(qaMd.includes('mini included #1290'), 'FORGE-QA.md e-prime names mini as a queue-build node (#1290)')
ok(warden.includes('"$B_LOADED" == 0'), 'builder-slot QA spill parked while slot b is loaded')
ok(warden.includes('studiotrial.mjs'), 'warden ticks the trial clock')
ok(warden.includes('builders=$nb/2'), 'pulse line carries slot liveness')

ok(read('forge-claim.sh').includes('yielding to') && qac.includes('(QA|FORGE)'),
    'claim scripts share one liveness namespace and yield on collision')

ok(watch.includes('BUILDER·B') && watch.includes('n=5'), 'watch.sh shows slot b (pane + resize bits)')
const qafa = read('forge-qa.sh'), tapStudio = read('com.jalfern.tap-studio.plist')
ok(tapStudio.includes('<string>com.jalfern.tap-studio</string>') && /<string>8011<\/string>/.test(tapStudio)
    && /<string>8000<\/string>/.test(tapStudio) && tapStudio.includes('stream-studio.log')
    && tapStudio.includes('<key>KeepAlive</key>'),
    'tap-studio plist: :8011 -> :8000 -> stream-studio.log, KeepAlive')
ok(qafa.includes('http://127.0.0.1:8011/v1/models') && qafa.includes('omlxtapstudio')
    && qafa.includes('!= 502'),
    'forge-qa.sh routes the studio session through tap :8011, fail-open (#1268)')
ok(qafa.includes('JOB=com.jalfern.tap-studio') && qafa.includes('origin/main:scripts/$JOB.plist')
    && qafa.includes('launchctl bootstrap'),
    'forge-qa.sh self-bootstraps tap-studio from origin/main (merge = install, slot-b pattern)')
ok(watch.includes('LANE=studio') && watch.includes('TAPPORT=8011'),
    'watch.sh --live splits a live pane on QA·STUDIO over its own stream')
ok(telem.includes("board['slots']") && telem.includes('opencode run.*THE FORGE on slot b'),
    'telemetry bakes live slots into board.json')
ok(floor.includes('export const slotsLine'), 'floor.js owns the pure slotsLine')
ok(board.includes('slotsLine') && board.includes('data-slots'), 'ForgeBoard renders the slots line')
ok(fcli.includes('builder-b') && fcli.includes('studiotrial.mjs'), 'forge status names slots and shows the trial')

ok(forgeMd.includes('scripts/forge-claim.sh') && !forgeMd.includes('gh issue edit <n> --add-label building'),
    'FORGE.md claims via the atomic script, never by hand')
ok(qaMd.includes('Queue build (#1258'), 'FORGE-QA.md carries the queue fallthrough (whole queue both ways; #1290 extends the heading to mini)')

ok(pkg.includes('"lanecheck"'), 'package.json carries the lanecheck alias')
ok(checks.includes("'lanecheck'"), 'checks.mjs CORE replays lanecheck nightly')
ok(ci.includes('npm run lanecheck'), 'ci.yml static job runs lanecheck')

console.log(`\x1b[1m\nlanecheck: ${pass} gates, ${fails.length} failures\x1b[0m`)
for (const f of fails) console.error(`FAIL ${f}`)
process.exit(fails.length ? 1 : 0)
