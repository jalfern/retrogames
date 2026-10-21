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
import { tracksidePlan, tracksideAudit, resolvePlan } from '../src/games/CometDriftHD/scenery.js'

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

    // UNAFFECTED: the certified autopilot still wins the whole race with the
    // dressing on (props never collide — nothing inside the clamp).
    let g = makeGame(0)
    const maxTicks = 120000
    let ticks = 0
    while (!g.end && ticks < maxTicks) {
        step(g, decide(g))
        ticks++
    }
    ok(g.end && g.karts[0].finished && g.karts[0].lap >= LAPS, `${c.id}: autopilot still wins ${LAPS} laps (${ticks} ticks)`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
