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
// For #1372 the flagship tail flips the same way: change `<=` to `<` in the
// qaMiniFlagship line — A9b goes red (mini would idle while studio's reserve
// covers the only queue item). For #1377 turn the reboot `break` in
// floor.js throughputLine into `continue` — B5c goes red (a counter delta
// across a server reboot is nonsense, never a rate). For #1430 drop the
// `content !== headContent` guard in lib/statepark.mjs newestReport — D2a goes
// red (a checkout-reverted STATE.md is the newest file on disk and would
// masquerade as the fresh report). For #2121 flip `age > capSec` to `false`
// in scripts/lib/lanebusy.mjs — E3 goes red (a server that outlived every cap
// would wedge the lane's kicks forever). For #2797 three flips: delete the
// holder-skip block in kick_slot (warden.sh) — F2 goes red (a live build on
// the other slot stacks idle comments toward a false stalled); remove the
// target clear in the skip branch — F3 goes red (the skipped slot would stay
// exempt from never-dry forever); in idle-kick.mjs revert the catch to
// `issues = []` — F4 goes red (a GitHub blip fabricates a KICK), and revert
// the held union to building-qa-only — F5 goes red (one lane per game breaks
// for builders, the Nov 22 double-kick). All four verified by hand.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { builderLadder, lanePlan } from './lib/lanes.mjs'
import { laneVerdict } from './lib/lanebusy.mjs'
import { parkPath, newestReport, readReport, parkReport } from './lib/statepark.mjs'
import { flagshipStage, heldGames, qaIdleStage, weakestStage } from './lib/idle.mjs'
import { slotsLine, throughputLine } from '../src/pages/floor.js'
import { trialVerdict, reportText, laneSplit, VERDICT_FILE,
    usageWindow, spark, streamStats, laneOfClaims, boxMisses, parseSpanName, BOX_MIN } from './studiotrial.mjs'

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

// A9 — QA mini flagship fallback (#1372): the #878 flagship stage is mini's
// tail when feedback AND queue leave it nothing. Queue outranks the flagship
// stage per tick (e-prime), and whether the gap survives studio's share is a
// runtime warden fact (STUDIO_FLAGSHIPPED), pinned in C below.
{
    const fb = iss(1, ['feedback'])
    const q = (n, day) => iss(n, ['game-queue'], { created_at: `2026-10-${day}T00:00:00Z` })
    ok(lanePlan({ issues: [fb], freeA: false, freeB: false }).qaMiniFlagship === false,
        'A9a feedback exists -> mini works feedback, no flagship flag')
    ok(lanePlan({ issues: [q(4, 10)], freeA: false, freeB: false, studioUp: true }).qaMiniFlagship === true,
        'A9b queue 1 absorbed by studio reserve -> mini idle -> flagship eligible (mutant line: <= flipped to <)')
    ok(lanePlan({ issues: [q(4, 10)], freeA: false, freeB: false, studioUp: false }).qaMiniFlagship === false,
        'A9c studio down -> mini takes the queue item instead (queue wins the tick)')
    ok(lanePlan({ issues: [q(4, 10), q(5, 11)], freeA: false, freeB: false, studioUp: true }).qaMiniFlagship === false,
        'A9d queue survives for mini -> queue build, not flagship')
    ok(lanePlan({ issues: [q(4, 10), q(5, 11)], freeA: true, freeB: true }).qaMiniFlagship === true,
        'A9e queue covered by the two builders -> mini idle -> flagship eligible')
    ok(lanePlan({ issues: [], freeA: false, freeB: false }).qaMiniFlagship === true,
        'A9f board fully dry -> flagship fallback is mini\'s tail')
}

// A10 — #2280: mini2 reserves mini's share too (same ladder shape, one step
// down). Mutant note: flip `miniReserve` to 0 or drop miniUp and these reddens.
{
    const q = (n, day) => iss(n, ['game-queue'], { created_at: `2026-10-${day}T00:00:00Z` })
    ok(lanePlan({ issues: [q(4, 10)], freeA: false, freeB: false, studioUp: true, miniUp: true }).qaMini2Queue === false,
        'A10a queue 1 absorbed by studio reserve -> nothing left for mini2')
    ok(lanePlan({ issues: [q(4, 10), q(5, 11)], freeA: false, freeB: false, studioUp: true, miniUp: true }).qaMini2Queue === false,
        'A10b queue 2: studio + mini take theirs -> mini2 stays out (mutant line: miniReserve dropped)')
    ok(lanePlan({ issues: [q(4, 10), q(5, 11), q(6, 12)], freeA: false, freeB: false, studioUp: true, miniUp: true }).qaMini2Queue === true,
        'A10c queue 3 survives builders+studio+mini shares -> mini2 joins the queue')
    ok(lanePlan({ issues: [q(4, 10), q(5, 11)], freeA: false, freeB: false, studioUp: true, miniUp: false }).qaMini2Queue === true,
        'A10d mini down -> its share passes to mini2 (no idle while a game waits)')
    ok(lanePlan({ issues: [q(4, 10)], freeA: false, freeB: false, studioUp: true, miniUp: true }).qaMini2Flagship === true,
        'A10e all shares consumed -> mini2 flagship-eligible (tail rule)')
    ok(lanePlan({ issues: [q(4, 10), q(5, 11), q(6, 12)], freeA: false, freeB: false, studioUp: true, miniUp: true }).qaMini2Flagship === false,
        'A10f queue reaches mini2 -> queue wins the tick, not flagship')
    ok(lanePlan({ issues: [] }).qaMini2Flagship === true,
        'A10g fully dry -> both mini lanes flagship-eligible (warden sequences them, claims collide safely)')
}

// A11 — #3093: `lane:manual` is a hand-run lane's claim (docs/MANUAL-LANE.md).
// No automatic ladder may reach these issues, the QA fall-through never counts
// them, and the warden's kick targets skip them. Mutant proof: drop the
// `manualHeld` filter in builderLadder — A11a/A11b go red (a manual claim
// would ride the corpse rung straight to an idle builder).
{
    const M = ['lane:manual']
    ok(builderLadder([iss(1, ['game-queue', ...M]), iss(2, ['next', ...M]), iss(3, ['feedback', ...M])]).length === 0,
        'A11a lane:manual items enter the builder ladder')
    const mixed = builderLadder([
        iss(1, ['building', ...M]),      // hand claim: must NOT surface as a corpse
        iss(2, ['building']),           // builder corpse: must still surface first
        iss(3, ['game-queue', ...M], { created_at: '2026-10-05T00:00:00Z' }),
    ]).map((i) => i.number)
    ok(JSON.stringify(mixed) === JSON.stringify([2]),
        `A11b manual claim outranks/contaminates the corpse rung: got ${mixed}`)
    const plan = lanePlan({ issues: [iss(1, ['game-queue', ...M]), iss(2, ['game-queue'])],
        freeA: true, freeB: true, bLoaded: true })
    ok(plan.targets.a === 2 && plan.targets.b == null && plan.counts.queueFree === 1,
        `A11c targets/queueFree count manual work: got ${JSON.stringify(plan)}`)
    // manual feedback is not claimable QA work AND does not count as feedback
    // that keeps a QA lane off its flagship tail (same law as waiting-jon #3074).
    // NOTE idle.mjs's contract: raw string labels (idle-kick.mjs's jq shape).
    const siss = (n, labels, title, body) => ({ number: n, title, body, state: 'open',
        user: { login: 'jalfern' }, created_at: '2026-10-01T00:00:00Z', labels, pull_request: undefined })
    const mfb = siss(1, ['feedback', ...M], 'QA — contra: scroll lock', 'contra level 2 scroll freezes')
    ok(qaIdleStage({ issues: [mfb], gapsByGame: { SSX: ['gap one'] } }) !== null,
        'A11d manual feedback blocks the QA flagship tail')
    ok(qaIdleStage({ issues: [siss(1, ['feedback'], 'QA — ssx: gap one', 'SSX gap one detail')],
        gapsByGame: { SSX: ['gap one'] } }) === null,
        'A11d2 claimable feedback must still outrank the flagship tail')
    const namedFix = siss(1, ['feedback', ...M], 'QA — contra: scroll lock', 'contra level 2 scroll freezes')
    const games = [{ dir: 'Contra', label: 'CONTRA', gaps: [] }]
    ok(weakestStage({ games, qaIssues: [namedFix] }) === null,
        'A11e manual-owned feedback scores its game as weakest (a fix no automatic lane may take is not weakness)')
    ok(weakestStage({ games, qaIssues: [siss(1, ['feedback'], 'QA — contra: scroll lock', 'contra level 2 scroll freezes')] }) !== null,
        'A11e2 ordinary feedback must still score weakness (the filter is manual-only)')
    // the manual item still OWNS the gap it names (suppression direction stays)
    ok(flagshipStage({ gapsByGame: { SSX: ['gap one'] }, qaIssues: [Object.assign(iss(1, ['feedback', ...M]), { title: 'QA — ssx', body: 'SSX repeats the opening words of gap one, verbatim here' })], buildingQa: [] }) === null,
        'A11f manual feedback stopped owning the gap it names')
}

// A12 — #3093 wiring: pulse carries the manual count; the fallback ladder,
// both playbooks and the protocol doc name lane:manual.
{
    const warden = readFileSync(join(here, 'warden.sh'), 'utf8')
    ok(/MANUAL=\$\(count_label lane:manual\)/.test(warden), 'A12a pulse count for lane:manual missing from warden.sh')
    ok(/manual=\$MANUAL/.test(warden), 'A12b pulse line does not carry manual=$MANUAL')
    ok(/lane:manual/.test(warden), 'A12c the warden fallback ladder still offers manual issues')
    const forgeMd = readFileSync(join(here, 'FORGE.md'), 'utf8')
    ok(/lane:manual/.test(forgeMd) && /MANUAL-LANE\.md/.test(forgeMd), 'A12d FORGE.md lost the manual-lane skip/pointer')
    const qaMd = readFileSync(join(here, 'FORGE-QA.md'), 'utf8')
    ok(/lane:manual/.test(qaMd), 'A12e FORGE-QA.md lost the manual-lane skip')
    const doc = readFileSync(join(here, '..', 'docs', 'MANUAL-LANE.md'), 'utf8')
    ok(/forge-merge\.sh/.test(doc) && /lane:manual/.test(doc) && /STATE\.md/.test(doc),
        'A12f docs/MANUAL-LANE.md missing its merge path, claim label or STATE.md law')
    ok(/MANUAL-LANE\.md/.test(readFileSync(join(here, '..', 'AGENTS.md'), 'utf8')),
        'A12g AGENTS.md lost the pointer to the manual-lane protocol')
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

// B4 — aggregate throughput math (#1299): all-stream tokens/hr, stream stats,
// time-box misses, sparkline chart — pinned offline against fixtures.
{
    // B4a usageWindow: tz from `start`, partial-hour fractions, quiet coverage
    const day = (n) => Array.from({ length: 24 }, () => n)
    const usage = { start: '2026-10-29T00:00:00-07:00', heatmap: [{ date: '2026-10-29', tokens: day(1000) }] }
    const full = usageWindow(usage, Date.parse('2026-10-29T07:00:00Z'), Date.parse('2026-10-30T07:00:00Z'))
    ok(full && full.tokens === 24000 && full.hours === 24, `B4a full local day: ${JSON.stringify(full && { t: full.tokens, h: full.hours })}`)
    const part = usageWindow(usage, Date.parse('2026-10-29T08:00:00Z'), Date.parse('2026-10-29T09:30:00Z'))
    ok(part && part.tokens === 1500 && part.hours === 1.5, `B4b partial window fractions the boundary hour: ${JSON.stringify(part && { t: part.tokens, h: part.hours })}`)
    const quiet = usageWindow({ start: '2026-10-29T00:00:00-07:00', heatmap: [{ date: '2026-10-29', tokens: day(0) }] },
        Date.parse('2026-10-29T07:00:00Z'), Date.parse('2026-10-30T07:00:00Z'))
    ok(quiet && quiet.tokens === 0 && quiet.hours === 24, 'B4c quiet hours still count as coverage')
    ok(usageWindow(null, 0, 1) === null && usageWindow({ heatmap: [] }, 0, 1) === null,
        'B4d missing usage payload is null, never a throw')

    // B4e spark
    ok(spark([0, 50, 100]) === '▁▅█' && spark([]) === '·' && spark([0, 0, 0]) === '···',
        `B4e sparkline scale + zero handling: ${spark([0, 50, 100])}`)

    // B4f streamStats from ledger rows
    const rows = [
        { ts: 1000, tps: { omlx: { n: 2 } } },          // before window — ignored
        { ts: 2000, tps: { omlx: { n: 3 } } },
        { ts: 2300, tps: { omlx: { n: 1 } } },
        { ts: 2600, tps: { omlx: { n: 0 } } },
        { ts: 3000, tps: { omlxmini: { n: 9 } } },       // other box — ignored
    ]
    const st = streamStats(rows, 'omlx', 1500 * 1000, 2500 * 1000)
    ok(st && st.samples === 2 && st.mean === 2 && st.max === 3 && st.since === '1970-01-01T00:33:20Z',
        `B4f stream stats mean/max/window: ${JSON.stringify(st)}`)
    ok(streamStats(rows, 'omlxmbp', 0, 9e12) === null, 'B4g box with no samples -> null (honest line)')

    // B4h laneOfClaims: last lineage wins; parked/unknown lanes are null
    ok(laneOfClaims(['FORGE (a): claimed x', 'FORGE (b): claimed y']) === 'b', 'B4h takeover moves the ship')
    ok(laneOfClaims(['QA (mini): claimed x']) === 'qaMini' && laneOfClaims(['QA (studio): checkpoint x']) === 'qaStudio'
        && laneOfClaims(['QA (mbp): claimed x']) === null && laneOfClaims([]) === null,
        'B4i lanes map, parked mbp + unclaimed are null')

    // B4j boxMisses: spans vs ships across the four lanes
    const H = 3600e3
    const t0 = Date.parse('2026-11-01T00:00:00Z')
    const spans = [
        { lane: 'a', startMs: t0, endMs: t0 + 178 * 60e3, alive: false },   // hit, shipped
        { lane: 'b', startMs: t0, endMs: t0 + 175 * 60e3, alive: false },   // hit, missed
        { lane: 'b', startMs: t0 + 200 * 60e3, endMs: t0 + 260 * 60e3, alive: false }, // short, not hit
        { lane: 'qaMini', startMs: t0, endMs: t0 + 61 * 60e3, alive: false }, // hit, missed
        { lane: 'qaStudio', startMs: t0, endMs: t0 + 59 * 60e3, alive: true }, // alive — excluded
        { lane: 'a', startMs: t0 - 50 * H, endMs: t0 - 49 * H, alive: false },  // outside window
    ]
    const ships = [{ lane: 'a', atMs: t0 + 100 * 60e3 }, { lane: 'b', atMs: t0 + 195 * 60e3 }] // b's ship lands between spans
    const m = boxMisses(spans, ships, t0 - 48 * H, t0 + 48 * H)
    ok(m.a.n === 1 && m.a.hit === 1 && m.a.miss === 0, `B4j shipped span clears: ${JSON.stringify(m.a)}`)
    ok(m.b.n === 2 && m.b.hit === 1 && m.b.miss === 1, `B4k short span not a hit; missed span counted: ${JSON.stringify(m.b)}`)
    ok(m.qaMini.n === 1 && m.qaMini.miss === 1 && m.qaStudio.n === 0, 'B4l QA lanes separate; alive span never judged')

    // B4m span-name parsing (log naming IS the identity)
    ok(parseSpanName('qa-studio-20261031-134321.log').lane === 'qaStudio'
        && parseSpanName('qa-20261031-131259.log').lane === 'qaMini'
        && parseSpanName('20261030-203144.log').lane === 'builder'
        && parseSpanName('notes.txt') === null && parseSpanName('dev-b-wizardry.log') === null,
        'B4m session-log names map to lanes; foreign files rejected')
    ok(BOX_MIN.a === 180 && BOX_MIN.b === 180 && BOX_MIN.qaStudio === 60 && BOX_MIN.qaMini === 60,
        'B4n time boxes: 3 h builders, 1 h QA (matches the prompts)')

    // B4o reportText with perf — every #1299 face, honestly degraded without
    const perf = {
        boxes: [{ name: 'Studio', before: { tokens: 48000, hours: 48 }, after: { tokens: 96000, hours: 48 },
            streams: { samples: 100, mean: 1.4, max: 4, since: '2026-10-31T21:00:00Z' } },
        { name: 'Mini', before: { tokens: 20000, hours: 48 }, after: null, streams: null }],
        spansBefore: { a: { n: 2, hit: 1, miss: 1 }, b: { n: 0, hit: 0, miss: 0 }, qaStudio: { n: 5, hit: 2, miss: 1 }, qaMini: { n: 20, hit: 10, miss: 5 }, qaX: { n: 0, hit: 0, miss: 0 } },
        spansAfter: { a: { n: 1, hit: 0, miss: 0 }, b: { n: 1, hit: 1, miss: 1 }, qaStudio: { n: 0, hit: 0, miss: 0 }, qaMini: { n: 3, hit: 2, miss: 2 } },
        chartLines: ['Studio ▁▂|▃▄'], chartSince: '2026-10-29T02:20:00Z',
        honesty: ['ledger span note'],
    }
    const pt = reportText({ since: '2026-10-31T02:20:00Z', until: '2026-11-02T02:20:00Z',
        verdict: trialVerdict({ closedBefore: new Array(8).fill('x'), closedAfter: new Array(12).fill('x') }), perf })
    ok(/Tokens\/hr — EVERY stream/.test(pt) && /Studio: before 1k\/hr → after 2k\/hr/.test(pt),
        'B4o tokens/hr lines present, summed across streams')
    ok(/Mini: before 0\.4k\/hr → after —/.test(pt) && /Mini streams: no ledger samples yet/.test(pt),
        'B4p missing window/streams degrade to honest placeholders, never zeros')
    ok(/builders 1\/2 · studio QA 1\/5 · mini QA 5\/20/.test(pt) && /mini QA 2\/3/.test(pt),
        'B4q box-miss lines per window, builders summed over slots')
    ok(/▁▂\|▃▄/.test(pt) && /10-29 → 11-02/.test(pt) && /ledger span note/.test(pt),
        'B4r chart line with fleet-on marker + span label + honesty carried')
    ok(/usage counters/.test(pt) && !/nothing persisted it before/.test(pt),
        'B4s perf report states where tokens/hr come from (old paragraph would lie)')
    ok(/nothing persisted it before/.test(reportText({ since: 'a', until: 'b', verdict: trialVerdict({}) })),
        'B4t no perf -> pre-#1299 metric-honesty paragraph stays word-for-word')
}

// B5 — live aggregate throughput (#1377): throughputLine over telemetry-shaped
// fixtures — hour-window deltas off the servers' cumulative counters, reboot
// resets, honest drops, stream mean, freshness. No browser, no clock.
{
    // B5a null-safety: junk in, hidden line out — never a throw
    ok(throughputLine(null) === null && throughputLine(undefined) === null
        && throughputLine([]) === null && throughputLine([{}, { ts: 'x' }]) === null,
        'B5a malformed samples hide the line')

    // B5b plain deltas + stream mean. studio 1M->4M over 1200 s = 9.0M/hr;
    // mini flat = honest 0/hr; n = round(mean(3,4,2)) = 3.
    const smp = (ts, omlx, mini) => ({
        ts,
        tps: {
            omlx: { tot: omlx[0], n: omlx[1] },
            omlxmini: { tot: mini[0], n: mini[1] },
        },
    })
    const rows5 = [smp(0, [1e6, 2], [250000, 1]), smp(600, [2e6, 3], [500000, 1]), smp(1200, [4e6, 1], [750000, 1])]
    const t5 = throughputLine(rows5, 1200 * 1000)
    ok(t5 && t5.text === 'throughput: studio 9.0M/hr · mini 1.5M/hr (n=3)',
        `B5b per-box hour deltas + stream mean: ${t5 && t5.text}`)

    // B5c reboot guard: counters are cumulative-since-boot; 9e8@300 -> 1e6@600
    // means the server restarted. Walk back stops at ts 600: 3M over 600 s
    // = 18.0M/hr. The 50@0 row is the OLD session's own early counter — small
    // enough to pass a naive tot<=last check, and the break must never reach
    // it (mutant proof: delete the break -> first becomes ts 0 at 50/hr).
    const t5c = throughputLine([
        { ts: 0, tps: { omlx: { tot: 50, n: 1 }, omlxmini: { tot: null, n: 0 } } },
        { ts: 300, tps: { omlx: { tot: 9e8, n: 1 }, omlxmini: { tot: null, n: 0 } } },
        smp(600, [1e6, 1], [null, 0]), smp(1200, [4e6, 1], [null, 0])], 1200 * 1000)
    ok(t5c && t5c.boxes.length === 1 && t5c.boxes[0].rate === 18e6,
        `B5c counter reset walks back to the boot boundary: ${t5c && JSON.stringify(t5c.boxes)}`)

    // B5d honest drops: span < 5 min, only one tot row, tot missing on every
    // row (pre-#1299 schema), or tot null (stats unreachable) all hide.
    ok(throughputLine([smp(0, [1, 1], [null, 0]), smp(100, [2, 1], [null, 0])], 100 * 1000) === null,
        'B5d sub-5-min window is too young to extrapolate')
    ok(throughputLine([{ ts: 0, tps: { omlx: { n: 1 }, omlxmini: { n: 0 } } },
        { ts: 600, tps: { omlx: { n: 1 }, omlxmini: { n: 0 } } },
        { ts: 1200, tps: { omlx: { n: 1 }, omlxmini: { n: 0 } } }], 1200 * 1000) === null,
        'B5e tot missing/null on every row (pre-#1299) hides the whole line')

    // B5f freshness: a newest sample past 2x FRESH_MS is yesterday's weather.
    ok(throughputLine(rows5, 1200 * 1000 + 2 * 15 * 60 * 1000 + 1) === null,
        'B5f stale sample window hides the line (injected now)')

    // B5g hour window: rows older than the newest minus 3600 s are ignored —
    // rate is the hour's delta (5760/hr), not since-boot (3600/hr).
    const t5g = throughputLine([
        { ts: 0, tps: { omlx: { tot: 0, n: 0 } } },
        { ts: 2400, tps: { omlx: { tot: 1200, n: 0 } } },
        { ts: 3600, tps: { omlx: { tot: 1800, n: 0 } } },
        { ts: 6600, tps: { omlx: { tot: 6600, n: 0 } } },
    ], 6600 * 1000)
    ok(t5g && t5g.boxes.length === 1 && t5g.boxes[0].rate === 5760,
        `B5g trailing-hour window bounds the delta: ${t5g && JSON.stringify(t5g.boxes)}`)

    // B5h stream suffix is honest: no `n` fields anywhere -> no "(n=…)".
    const t5h = throughputLine([{ ts: 0, tps: { omlx: { tot: 0 } } }, { ts: 600, tps: { omlx: { tot: 2000 } } }], 600 * 1000)
    ok(t5h && !/\(n=/.test(t5h.text) && t5h.text === 'throughput: studio 12.0k/hr',
        `B5h no stream counts -> no (n=) suffix, k-format: ${t5h && t5h.text}`)
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
ok(warden.includes('QA_MINI_FLAGSHIP') && warden.includes('qa-flagship:mini')
    && /com\.jalfern\.forge-qa"/.test(warden),
    'warden routes mini QA onto the flagship gap the #878 block left standing (#1372)')
ok(/STUDIO_FLAGSHIPPED=1/.test(warden),
    'a studio flagship kick consumes the gap so mini cannot double up on it (#1372)')
ok(qaMd.includes('mini included #1290'), 'FORGE-QA.md e-prime names mini as a queue-build node (#1290)')
ok(warden.includes('"$B_LOADED" == 0'), 'builder-slot QA spill parked while slot b is loaded')
ok(warden.includes('studiotrial.mjs'), 'warden ticks the trial clock')
ok(warden.includes('builders=$nb/2'), 'pulse line carries slot liveness')

ok(read('forge-claim.sh').includes('yielding to') && qac.includes('(QA|FORGE)'),
    'claim scripts share one liveness namespace and yield on collision')

ok(watch.includes('BUILDER·B') && watch.includes('n=5'), 'watch.sh shows slot b (pane + resize bits; n=5 lanes since MBP retired #2286, incl. mini2 #2280)')
ok(!watch.includes('pane qa-mbp') && !watch.includes('QA·MBP  up'),
    'watch.sh retired the QA·MBP pane (#2286, Jon 2026-11-14)')
ok(watch.includes('allow-set-title off') && watch.includes('pane-border-status top')
    && watch.includes('pane-border-format') && watch.includes("set_title \"$FIRST\" 'BUILDER·A'")
    && watch.includes("'BUILDER·A · output'"),
    'watch.sh bakes the always-visible pane labels (#2286: border status + titles, no in-pane overwrite)')
ok(watch.includes('-s qwen') && !watch.includes('-s retro'),
    'watch.sh nests Jon\'s Qwen chat as session "qwen" (#2286, was "retro")')
ok(watch.includes("P1='opencode run.*QA MASTER on node '") && watch.includes("P2='mini\\.'"),
    'watch.sh QA·MINI matches the launcher text, not the pre-#1422 omlxmini model string (#2286)')
ok(watch.includes('bake_fit') && read('watch-fit.mjs').includes('codePointAt')
    && watch.includes('FIT=$FITPATH'),
    'watch.sh bakes watch-fit.mjs: log lines trim to pane width in cells, headers cannot scroll away (#2286)')
const qafa = read('forge-qa.sh'), tapStudio = read('com.jalfern.tap-studio.plist')
ok(tapStudio.includes('<string>com.jalfern.tap-studio</string>') && /<string>8011<\/string>/.test(tapStudio)
    && /<string>8000<\/string>/.test(tapStudio) && tapStudio.includes('stream-studio.log')
    && tapStudio.includes('<key>KeepAlive</key>'),
    'tap-studio plist: :8011 -> :8000 -> stream-studio.log, KeepAlive')
ok(qafa.includes('TAPPORT=8011') && qafa.includes('omlxtapstudio') && qafa.includes('!= 502')
    && qafa.includes('http://127.0.0.1:$TAPPORT/v1/models'),
    'forge-qa.sh routes the studio session through tap :8011, fail-open (#1268)')
ok(qafa.includes('JOB=com.jalfern.tap-studio') && qafa.includes('origin/main:scripts/$JOB.plist')
    && qafa.includes('launchctl bootstrap'),
    'forge-qa.sh self-bootstraps tap-studio from origin/main (merge = install, slot-b pattern)')
ok(watch.includes('LANE=studio') && watch.includes('TAPPORT=8011'),
    'watch.sh --live splits a live pane on QA·STUDIO over its own stream')
const tapB = read('com.jalfern.tap-builderb.plist'), tapMini = read('com.jalfern.tap-mini.plist')
ok(tapB.includes('<string>com.jalfern.tap-builderb</string>') && /<string>8012<\/string>/.test(tapB)
    && /<string>8000<\/string>/.test(tapB) && tapB.includes('stream-builderb.log')
    && tapB.includes('<key>KeepAlive</key>'),
    'tap-builderb plist: :8012 -> :8000 -> stream-builderb.log, KeepAlive (#1356)')
ok(tapMini.includes('<string>com.jalfern.tap-mini</string>') && /<string>8013<\/string>/.test(tapMini)
    && /<string>18000<\/string>/.test(tapMini) && tapMini.includes('stream-mini.log')
    && tapMini.includes('<key>KeepAlive</key>'),
    'tap-mini plist: :8013 -> :18000 -> stream-mini.log, KeepAlive (#1356)')
ok(forge.includes('8012') && forge.includes('omlxtapb') && forge.includes('com.jalfern.tap-builderb')
    && forge.includes('origin/main:scripts/$TAPJOB.plist') && forge.includes('launchctl bootstrap'),
    'forge.sh routes slot b through its own tap :8012 and self-bootstraps the plist (#1356)')
ok(qafa.includes('TAPPORT=8013') && qafa.includes('omlxtapmini')
    && qafa.includes('SRC_PROV=omlxmini') && qafa.includes('!= 502'),
    'forge-qa.sh routes the mini session through tap :8013, cloned from omlxmini, fail-open (#1356)')
ok(watch.includes('typeset -A PANEID') && watch.includes('PANEID[$key]=$id')
    && watch.includes('-t "${PANEID[qa-studio]}"') && !/live-studio[^\n]*"\$SESSION:0\./.test(watch),
    'watch.sh targets lanes by captured pane id, never the shifted 0.N index (#1356)')
ok(watch.includes('LANE=builderb') && watch.includes('TAPPORT=8012')
    && watch.includes('LANE=mini') && watch.includes('TAPPORT=8013'),
    'watch.sh --live gives BUILDER·B and QA·MINI their own live panes (#1356)')

// #2280 — the mini's second QA slot: node, ports, tap, pane, board, trial.
{
    const tapMini2 = read('com.jalfern.tap-mini2.plist')
    const qaMini2Pl = read('com.jalfern.forge-qa-mini2.plist')
    ok(qaMini2Pl.includes('<string>com.jalfern.forge-qa-mini2</string>')
        && qaMini2Pl.includes('<string>mini2</string>') && qaMini2Pl.includes('--foreground')
        && qaMini2Pl.includes('origin/main:scripts/forge-qa.sh') && qaMini2Pl.includes('qa-mini2-launchd.log'),
        'forge-qa-mini2 plist: foreground launchd job running origin/main forge-qa.sh mini2')
    ok(tapMini2.includes('<string>com.jalfern.tap-mini2</string>') && /<string>8014<\/string>/.test(tapMini2)
        && /<string>18000<\/string>/.test(tapMini2) && tapMini2.includes('stream-mini2.log')
        && tapMini2.includes('<key>KeepAlive</key>'),
        'tap-mini2 plist: :8014 -> :18000 -> stream-mini2.log, KeepAlive (#2280)')
    ok(qafa.includes('mini2)') && qafa.includes('DEV=5179') && qafa.includes('QA MASTER on node $NODE'),
        'forge-qa.sh knows the mini2 node (own identity, dev port 5179)')
    ok(qafa.includes('JOB=com.jalfern.tap-mini2') && qafa.includes('TAPPORT=8014')
        && qafa.includes('omlxtapmini2') && qafa.includes('SRC_PROV=omlxmini'),
        'forge-qa.sh routes mini2 through its own tap :8014 cloned from omlxmini (#2280)')
    // lane ports must be one per lane — the prompt's "never another lane's port" law
    {
        const ports = qafa.match(/DEV=\d+/g) || []
        ok(new Set(ports).size === ports.length && ports.length >= 5,
            `forge-qa.sh: every node has a unique DEV port (${ports.join(' ')})`)
    }
    ok(warden.includes('mini2 18000 QA_WAITING 1 com.jalfern.forge-qa-mini2 5179'),
        'warden step 5 LANES carries the mini2 lane (#2280)')
    ok(warden.includes('--mini-up "$MINI_UP"') && warden.includes('MINI_UP=1') && warden.includes('tail -11'),
        'warden computes MINI_UP (idle+up+job), passes it to the planner, and evals the two new vars')
    ok(warden.includes('"$node" == mini2 && "$QA_MINI2_QUEUE" == 1'),
        'mini2 earns the queue fallthrough from the planner flag (#2280)')
    ok(warden.includes('QA MASTER on node mini2\\\\.') && warden.includes('lane_driven 5179'),
        'warden watches mini2 identity (pgrep + port witness)')
    ok(warden.includes('! MINI_FLAGSHIPPED') && warden.includes('QA_MINI2_FLAGSHIP')
        && warden.includes('qa-flagship:mini2'),
        'mini2 flagship fallback runs only after studio AND mini declined the gap (#2280)')
    ok(qaMini2Pl.includes('StartInterval') && /<integer>900<\/integer>/.test(qaMini2Pl),
        'forge-qa-mini2 job self-ticks every 15 min like its mini sibling')
    ok(watch.includes('QA·MINI·2') && watch.includes('pane qa-mini2') && watch.includes('PANEID[qa-mini]'),
        'watch.sh opens a QA·MINI·2 pane below QA·MINI (#2280)')
    ok(watch.includes('LANE=mini2') && watch.includes('TAPPORT=8014'),
        'watch.sh --live gives QA·MINI·2 its own live pane over tap :8014 (#2280)')
    ok(/P2='mini\\\.'/.test(watch) && /P2='mini2\\\.'/.test(watch) && !/Z3=/.test(watch),
        'QA·MINI matches node mini. exactly — mini2 never lands in its pane (#2280; #2286 moved the patterns into the panes as the warden no longer sizes by liveness)')
    ok(telem.includes("'qaMini2': live('opencode run.*QA MASTER on node mini2\\\\.')"),
        'board.json slots carries qaMini2 live (#2280)')
    ok(floor.includes("cell('qa·mini·2', slots.qaMini2)"),
        'floor.js slotsLine names the qa·mini·2 lane (#2280)')
    ok(laneOfClaims(['QA (mini2): claimed x']) === 'qaMini2',
        'trial attribution: mini2 claims map to qaMini2 (#2280)')
    ok(parseSpanName('qa-mini2-20261115-021212.log')?.lane === 'qaMini2'
        && parseSpanName('qa-20261115-021212.log')?.lane === 'qaMini',
        'span names: qa-mini2-* is its own lane, plain qa-* stays mini (#2280)')
    ok(BOX_MIN.qaMini2 === 60, 'mini2 time-box 60 min like mini QA (#2280)')
}
ok(telem.includes("board['slots']") && telem.includes('opencode run.*THE FORGE on slot b'),
    'telemetry bakes live slots into board.json')
ok(floor.includes('export const slotsLine'), 'floor.js owns the pure slotsLine')
ok(board.includes('slotsLine') && board.includes('data-slots'), 'ForgeBoard renders the slots line')
ok(floor.includes('export const throughputLine'), 'floor.js owns the pure throughputLine (#1377)')
ok(board.includes('throughputLine') && board.includes('data-throughput'),
    'ForgeBoard renders the throughput line (#1377)')
ok(telem.includes("'samples': samples"), 'telemetry.sh feeds board.json samples — the #1377 source')
ok(fcli.includes('builder-b') && fcli.includes('studiotrial.mjs'), 'forge status names slots and shows the trial')

ok(forgeMd.includes('scripts/forge-claim.sh') && !forgeMd.includes('gh issue edit <n> --add-label building'),
    'FORGE.md claims via the atomic script, never by hand')
ok(qaMd.includes('Queue build (#1258'), 'FORGE-QA.md carries the queue fallthrough (whole queue both ways; #1290 extends the heading to mini)')

ok(pkg.includes('"lanecheck"'), 'package.json carries the lanecheck alias')
ok(checks.includes("'lanecheck'"), 'checks.mjs CORE replays lanecheck nightly')
ok(ci.includes('npm run lanecheck'), 'ci.yml static job runs lanecheck')

section('D. statepark — race-proof STATE.md handoff (#1430)')

// D1 — parks are slot-scoped; the shared legacy path stays separate
{
    ok(parkPath('a') !== parkPath('b') && /STATE\.a\.parked\.md$/.test(parkPath('a')),
        'D1a each slot parks on its own path')
    let threw = false
    try { parkPath('A b') } catch { threw = true }
    ok(threw, 'D1b a bad slot name throws instead of colliding')
}

// D2 — the #1430 failure mode, pinned: after a parallel checkout reverted
// STATE.md, the reverted copy is the NEWEST file but is HEAD content — never
// serve it as a fresh report (mutant line: drop the `!== headContent` test in
// lib/statepark.mjs newestReport and this goes red).
{
    const head = '# STATE — session 67\nold report\n'
    const rep72 = '# STATE — session 72\nthe handoff\n'
    const r = newestReport([
        { path: 'STATE.md', mtimeMs: 300, content: head },
        { path: '/p/STATE.b.parked.md', mtimeMs: 200, content: rep72 },
        { path: '/p/STATE.parked.md', mtimeMs: 100, content: head },
    ], head)
    ok(r && r.path === '/p/STATE.b.parked.md' && r.content === rep72,
        `D2a checkout-reverted STATE.md cannot masquerade: got ${r && r.path}`)
    ok(newestReport([{ path: 'STATE.md', mtimeMs: 300, content: head }], head) === null,
        'D2b nothing differs from HEAD -> NO-REPORT, never a stale one')
}

// D3 — full fs simulation of the two lanes kicked on one tick: slot a parks
// old content and reverts STATE.md while slot b's report is in flight; b's
// next-session read must still find its report on the slot path.
{
    const dir = mkdtempSync(join(tmpdir(), 'statepark-'))
    try {
        const head = 'session-67 report\n'
        const rep72 = 'session-72 REPORT — the live handoff\n'
        const st = join(dir, 'STATE.md')
        const put = (p, c, t) => { writeFileSync(p, c); utimesSync(p, t / 1000, t / 1000) }
        put(st, head, 1000)                                     // HEAD copy on disk
        put(join(dir, 'STATE.parked.md'), head, 1100)          // a parks old content
        put(st, rep72, 2000)                                   // b writes its report (step 9)
        parkReport({ content: rep72, slot: 'b', parkDir: dir, legacy: false,
            fs: { mkdirSync: () => {}, writeFileSync: (p, c) => put(p, c, 2100) } })
        put(st, head, 3000)                                    // a's step-1 revert lands LAST
        const { report } = readReport({ statePath: st, parkDir: dir, headContent: head })
        ok(report && report.content === rep72 && report.path === join(dir, 'STATE.b.parked.md'),
            `D3a parallel-lane race loses nothing: got ${report && `${report.path}`}`)
        ok(report && report.mtimeMs === 2100,
            `D3b freshness is the slot park, not the reverted STATE.md: ${report && report.mtimeMs}`)
        // a legacy-only writer (old playbook text, pre-merge sessions) is still found
        rmSync(join(dir, 'STATE.b.parked.md'))
        const { report: legacy } = readReport({ statePath: st, parkDir: dir, headContent: head })
        ok(legacy === null,
            'D3c migration stays honest: only HEAD-equal copies left -> NO-REPORT')
    } finally { rmSync(dir, { recursive: true, force: true }) }
}

// D4 — the playbook commands exist and name the tool, so sessions actually run
// them: step 1 parks slot-scoped first, step 9 self-parks, QA reads via the CLI.
{
    ok(forgeMd.includes('cp STATE.md /tmp/forge/STATE.<slot>.parked.md && cp STATE.md /tmp/forge/STATE.parked.md && git checkout -- STATE.md')
        && !/STATE\.<slot>\.parked\.md \/tmp\/forge\/STATE\.parked\.md/.test(forgeMd)
        && forgeMd.includes('node scripts/statepark.mjs read'),
        'D4a FORGE.md step 1 parks slot-scoped before reverting, one cp per destination (#2547), and names the reader')
    ok(forgeMd.includes('node scripts/statepark.mjs park <slot>'),
        'D4b FORGE.md step 9 parks the report it just wrote')
    ok(qaMd.includes('node scripts/statepark.mjs read'),
        'D4c FORGE-QA.md step 1 takes the handoff from the park reader (QA is a reader)')
    const cliDir = mkdtempSync(join(tmpdir(), 'statepark-cli-'))
    const out = execFileSync('node', [join(here, 'statepark.mjs'), 'read'],
        { cwd: cliDir, encoding: 'utf8', env: { ...process.env, STATEPARK_DIR: cliDir } })
    ok(out.trim() === 'NO-REPORT', `D4d empty checkout reads honest NO-REPORT: got ${out.trim()}`)
    rmSync(cliDir, { recursive: true, force: true })
}

// ---- E. LANE-BUSY WITNESS (#2121) ------------------------------------------
// pgrep misses serve-hosted sessions; the pinned DEV port + live opencode
// ancestry is what the warden kicks behind. E1-E5 pin the pure decision,
// E6-E9 pin that warden.sh actually consults it at every kick site.
{
    const now = 1000000
    const live = { pid: 100, startedSec: now - 600, chain: ['zsh -s', 'node vite --port 5176 --strictPort'] }
    const ghost = { pid: 101, startedSec: now - 600, chain: ['/opt/homebrew/bin/opencode.exe serve --service', 'npm run dev --port 5176 --strictPort', 'node vite --port 5176 --strictPort'] }
    ok(laneVerdict([ghost], 5400, now).driven === true,
        'E1 serve-hosted dev server on the pinned port blocks the kick (the #2121 sighting)')
    ok(laneVerdict([live], 5400, now).driven === false,
        'E2 orphaned server (chain without opencode — reparented to launchd) is FREE: crash recovery must still kick')
    ok(laneVerdict([{ ...ghost, startedSec: now - 5401 }], 5400, now).driven === false,
        'E3 a server older than the cap is FREE even with live ancestry — the guard cannot wedge kicks forever')
    ok(laneVerdict([], 5400, now).driven === false && laneVerdict(undefined, 5400, now).driven === false,
        'E4 no listeners (and no witness at all) is FREE')
    ok(laneVerdict([{ pid: 3, startedSec: now + 50, chain: ['opencode serve', 'vite'] }], 5400, now).driven === false,
        'E5 clock-skew nonsense (negative age) never blocks a kick')
    ok(warden.includes('origin/main:scripts/lib/lanebusy.mjs'),
        'E6 warden materialises lanebusy from origin/main (sleepwatch law)')
    ok(warden.includes('[[ -s "$LBJ" ]] || return 1'),
        'E7 a broken/missing probe cannot block a kick (fail-open, the other direction from E1)')
    ok(/LANES=\(\s*\n?\s*"mini 18000[^"]*5174"[\s\S]*"studio 8000[^"]*5176"/.test(warden)
        && warden.includes('lane_driven "$dev"'),
        'E8 every QA lane spec carries its pinned DEV port (forge-qa.sh map) and the loop consults it')
    ok(warden.includes('lane_driven "$dev"') && (warden.match(/lane_driven/g) || []).length >= 5,
        'E9 guard sits at kick_slot, the QA loop AND both flagship fallbacks (>=5 sites incl. definition)')
}

// ---- F. TARGET-HELD SKIP (#2797) -------------------------------------------
// The planner assigns by LABELS; the holder fact lives in the comments, which
// its stdin never carries. Without a holder check at the kick site, a free
// slot gets targeted at an issue the OTHER slot is live inside — claim layer
// refuses (#878), session burns proving it, idle comments stack toward a
// false `stalled`. Observed in BOTH directions on 2026-11-22 (#2917 slot-a,
// #2919 slot-b). F1-F3 pin the skip at the kick site, F4 pins the target
// clear that keeps the skipped slot eligible for never-dry, F5-F6 pin
// idle-kick: fail-closed on a dead fetch, and the builder flagship rung
// honoring builder-held titles like the QA rung already does.
{
    const kick = read('idle-kick.mjs')
    ok(/target-held skip/.test(warden)
        && warden.includes('^(QA|FORGE) \\\\([a-z0-9-]+\\\\): (?!yielding|claim dead|waiting on Jon)')
        && /"\$HAGE" -lt 90/.test(warden),
        'F1 kick_slot consults forge-claim\'s holder() namespace — any live (QA|FORGE) comment < 90m old on the other slot blocks the kick (#2797, widened #3072)')
    const skipAt = warden.search(/target held by .*#2797/)
    const stallAt = warden.search(/add_label "\$n" stalled/)
    ok(skipAt > -1 && stallAt > -1 && skipAt < stallAt,
        'F2 the holder-skip returns BEFORE the 3-kick stall rule — a live build elsewhere can never be labeled stalled by its own targeting (#2797)')
    ok(/if \[\[ "\$s" == a \]\]; then A_TARGET=""; else B_TARGET=""; fi/.test(warden),
        'F3 a skipped target is cleared — 4b exempts target-owning slots from never-dry; skipped != owned, the slot must stay eligible')
    ok(/catch\s*{[^}]*console\.log\('NONE'\)[^}]*process\.exit\(0\)/.test(kick),
        'F4 idle-kick fails CLOSED: a gh api failure answers NONE, not KICK-from-nothing (the header promise, #2797)')
    ok(/heldGames\(issues\.filter\(\(i\) => i\.labels\.includes\('building-qa'\) \|\| i\.labels\.includes\('building'\)\)/.test(kick),
        'F5 the builder flagship rung holds building ∪ building-qa — one lane per game, builder included (qaIdleStage already did, #2797)')
    const RG = { 'R-TYPE': ['capsule list gap'], 'SSX': [], 'Emberwood': [], 'COMET DRIFT HD': [], 'Myst': [], 'DOUBLE DRAGON': [] }
    ok(heldGames([{ title: 'POLISH — R-TYPE: Options pods' }]).join() === 'R-TYPE'
        && flagshipStage({ gapsByGame: RG, qaIssues: [], buildingQa: heldGames([{ title: 'POLISH — R-TYPE: Options pods' }]) }) === null
        && flagshipStage({ gapsByGame: RG, qaIssues: [], buildingQa: [] }).index === 0,
        'F6 fixture: a live building issue naming R-TYPE holds the title and the stage dies with it; unheld, the same gaps still kick')
}

console.log(`\x1b[1m\nlanecheck: ${pass} gates, ${fails.length} failures\x1b[0m`)
for (const f of fails) console.error(`FAIL ${f}`)
process.exit(fails.length ? 1 : 0)
