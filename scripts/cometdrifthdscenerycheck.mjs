// cometdrifthdscenerycheck — COMET DRIFT HD trackside scenery (#639).
//
// Node-only. Proves three things about the dressing on every course in the
// pack: it BUILDS (a deterministic plan that resolves to finite px centres),
// its RULES hold (the racing line is clear — nothing inside the sim's 216px
// wall clamp; every prop clears every passing leg by its footprint; only
// barriers/tire-walls are solid; a phone-friendly cap; the signature race-circuit
// categories are present), and the race is UNAFFECTED (because no prop is
// reachable, the certified autopilot still wins the whole race).
//
//   npm run cometdrifthdscenerycheck
//   npm run cometdrifthdscenerycheck -- --mutate    # parks a prop on the racing
//                                                    # line — this run MUST go red
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TRACK, COURSES, selectCourse } from '../src/games/CometDrift/track.js'
import { makeGame, step, decide, LAPS } from '../src/games/CometDrift/sim.js'
import { tracksidePlan, tracksideAudit, resolvePlan, ROOF_Y, STAND_SCALE_START, STAND_SCALE_STRAIGHT, SHADOW_IDS } from '../src/games/CometDriftHD/scenery.js'
import { elevAt, wallTopSideAt } from '../src/games/CometDriftHD/scene.js'
import { crowdSwellGain, CROWD_R_MIN, CROWD_R_MAX, CROWD_BURST, CROWD_PERIOD } from '../src/games/CometDriftHD/audio.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SELF = fileURLToPath(import.meta.url)
const SCENERY_SRC = resolve(HERE, '../src/games/CometDriftHD/scenery.js')
const MUTATE = process.argv.includes('--mutate')

let pass = 0; let fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  ok  ${msg}`) } else { fail++; console.log(`  FAIL ${msg}`) } }

// mutant: barriers drop onto the racing line — place()'s clamp veto is loosened
// AND the barrier offset is pulled inside the sim wall, so a prop really lands on
// the asphalt. ESM caches the module, so the edited file is only observable to a
// FRESH process: mutate on disk, re-run this check in a child, demand it exits
// red, then restore.
const PAIRS = [
    ['const min = Math.max(r, clampPx + 16)', 'const min = Math.max(r, 20)'],
    ["off: 252, scale: 1, orient: 'along', r: 48 })", "off: 60, scale: 1, orient: 'along', r: 48 })"],
    // #675 mutants: the constant-ground regression and the tall roof, both must
    // be caught by the grounding / stand-roof gates.
    ['e.baseY = propGroundY(e.i, e.side)', 'e.baseY = 1.82'],
    ['export const ROOF_Y = 3.4', 'export const ROOF_Y = 4'],
]
if (MUTATE) {
    let src = readFileSync(SCENERY_SRC, 'utf8')
    if (!PAIRS.every(([good]) => src.includes(good))) { console.error('MUTATE: load-bearing lines not found — stale code.'); process.exit(2) }
    for (const [good, bad] of PAIRS) src = src.replace(good, bad)
    writeFileSync(SCENERY_SRC, src)
    console.log('  ..    mutated: barriers sit on the racing line — the child run MUST be red')
    let done = false
    try {
        const child = spawnSync(process.execPath, [SELF], { encoding: 'utf8' })
        done = child.status !== 0
        console.log(done ? '  ok  mutant detected: child run failed as demanded' : '  FAIL mutant escaped: child run still green')
    } finally {
        let s = readFileSync(SCENERY_SRC, 'utf8')
        for (const [good, bad] of PAIRS) s = s.replace(bad, good)
        writeFileSync(SCENERY_SRC, s)
        console.log('  ..    mutation restored')
    }
    process.exit(done ? 0 : 1)
}

const SIGNATURE = ['grandstand', 'pit_building', 'billboard', 'sign', 'barrier', 'tire_wall', 'marshal_post', 'flag']

// CROWD LAW (#675, once): full voice at the stands, silent at the horizon,
// monotone between — and the murmur burst must cover its own period, so the
// bed is continuous, not dotted.
ok(crowdSwellGain(0) === 1 && crowdSwellGain(CROWD_R_MIN) === 1, 'crowd law: full gain inside R_MIN')
ok(crowdSwellGain(CROWD_R_MAX) === 0 && crowdSwellGain(1e4) === 0, 'crowd law: silent at/beyond R_MAX')
{
    let mono = true; let prev = 1
    for (let d = 0; d <= CROWD_R_MAX; d += 25) { const gv = crowdSwellGain(d); if (gv > prev + 1e-9) mono = false; prev = gv }
    ok(mono, 'crowd law: monotone decrease with distance')
    const mid = crowdSwellGain((CROWD_R_MIN + CROWD_R_MAX) / 2)
    ok(Math.abs(mid - 0.5) < 1e-9, `crowd law: smoothstep midpoint (got ${mid})`)
}
ok(CROWD_BURST * 60 >= CROWD_PERIOD, `crowd bed: burst ${CROWD_BURST}s covers its ${CROWD_PERIOD}-tick period (no dead air)`)

// STAND ROOF LAW (#675, once): the chase eye sits ~2.4u over the asphalt and
// the nearest stand edge is ~8u out at the line; with the boost FOV punch the
// frame ceiling is ~28° up, so the roof may top out at most ~4.6u above the
// stand base — the old 4.4u-local roof at 1.2 scale (5.3u) swept the top
// corners and cut the dusk sky.
const ROOF_TOP_LOCAL = ROOF_Y + 0.4 // + half-thickness + the -0.12 tilt
ok(ROOF_TOP_LOCAL * STAND_SCALE_START <= 4.6, `stand roof: start stands top out ${(ROOF_TOP_LOCAL * STAND_SCALE_START).toFixed(2)}u over the base (≤ 4.6)`)
ok(ROOF_TOP_LOCAL * STAND_SCALE_STRAIGHT <= 4.6, `stand roof: straight stands top out ${(ROOF_TOP_LOCAL * STAND_SCALE_STRAIGHT).toFixed(2)}u over the base (≤ 4.6)`)

for (const c of COURSES) {
    selectCourse(c.id)
    const plan = tracksidePlan()
    const audit = tracksideAudit(plan)

    // BOOT: a non-trivial deterministic plan, all centres finite.
    ok(plan.length > 20, `${c.id}: plan builds (${plan.length} props)`)
    ok(plan.every((e) => Number.isFinite(e.wx) && Number.isFinite(e.wz)), `${c.id}: all prop centres finite`)
    const again = resolvePlan(tracksidePlan())
    ok(again.every((e, k) => e.wx === plan[k].wx && e.wz === plan[k].wz), `${c.id}: plan is deterministic`)

    // RULES: racing line clear — no prop within the sim clamp.
    ok(audit.violations.length === 0, `${c.id}: no prop inside its required clearance`)
    ok(audit.minClearancePx > TRACK.WALL_R, `${c.id}: nearest prop ${audit.minClearancePx}px is outside the wall (${TRACK.WALL_R}px)`)
    ok(audit.minClearancePx > 216, `${c.id}: nothing sits inside the 216px sim clamp`)
    ok(audit.solidsAreBarriersOnly, `${c.id}: only barriers/tire-walls are solid (${audit.solidCount} solid)`)
    ok(audit.count <= audit.cap, `${c.id}: prop count ${audit.count} within phone cap ${audit.cap}`)
    for (const id of SIGNATURE) ok(audit.categories[id] === true, `${c.id}: has ${id}`)

    // GROUNDING (#675): every prop stands on the TRUE plateau surface of its
    // own side (the wall-top law, banking included) — not the old constant
    // (2.07−0.25 = 1.82). The mutant below pins the stamp; the <1.70 probe
    // proves the law actually moves props (the constant never could).
    ok(plan.every((e) => Math.abs(e.baseY - (elevAt(e.i) + wallTopSideAt(e.i, e.side) - 0.25)) < 1e-9), `${c.id}: every prop baseY rides its side's plateau`)
    ok(again.every((e, k) => e.baseY === plan[k].baseY), `${c.id}: baseY is deterministic`)
    ok(plan.some((e) => e.baseY < 1.70), `${c.id}: some prop stands below the old constant ground (1.82)`)
    const grounded = plan.filter((e) => SHADOW_IDS[e.id])
    ok(grounded.length > 0 && grounded.every((e) => SHADOW_IDS[e.id] > 0.5 && SHADOW_IDS[e.id] < 2.5), `${c.id}: every tree/rock carries a contact-shadow radius (${grounded.length} props)`)

    // UNAFFECTED: the certified autopilot still wins the whole race with the
    // dressing on (props never collide — nothing inside the clamp). While it
    // runs we watch how close the player gets to the stands: the crowd swell
    // (#675) is only real if the racing line actually passes within hearing.
    let g = makeGame(0)
    const stands = plan.filter((e) => e.id === 'grandstand')
    let minStandD = Infinity
    const maxTicks = 120000
    let ticks = 0
    while (!g.end && ticks < maxTicks) {
        step(g, decide(g))
        const P = g.karts[0]
        for (const s of stands) {
            const dd = Math.hypot(P.x - s.wx, P.y - s.wz)
            if (dd < minStandD) minStandD = dd
        }
        ticks++
    }
    ok(g.end && g.karts[0].finished && g.karts[0].lap >= LAPS, `${c.id}: autopilot still wins ${LAPS} laps (${ticks} ticks)`)
    ok(minStandD < CROWD_R_MAX, `${c.id}: the racing line passes within crowd range (${minStandD.toFixed(0)}px < ${CROWD_R_MAX}px)`)
    ok(crowdSwellGain(minStandD) > 0.3, `${c.id}: the swell is audible at the line (peak gain ${crowdSwellGain(minStandD).toFixed(2)})`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
