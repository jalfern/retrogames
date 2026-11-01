// SSX — the Node audit. Boots the pure game, pins every load-bearing rule,
// proves the autopilot wins all three heats AND Showoff, re-proves both at a
// 0.75x trick economy with the chain capped at x3 (the slack rule), and
// replays identical scripts to identical hashes. No browser, no randomness.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { makeGame, step, CFG, PLACE_PTS, cloneGame, stateHash, CARVE_FADE, grabKindFor, GRAB_NAMES, GRAB_POSES, flipDirFromTilt, bodyFromTilt, STICK_TILT } from '../src/games/SSX/sim.js'
import { decide, PACE, SKILL, MISS, missChance } from '../src/games/SSX/planner.js'
import { buildCourse, terrainY, slopePos, COURSE_COUNT, HEATS, tournament, rotationName, gapAt, expressAt, chuteAt, GAP_X, EXPRESS, DS, WALL_X, sceneryPlan, SHELF_PROPS, outcropAt, gladeDefs } from '../src/games/SSX/course.js'
import { MUSIC } from '../src/utils/AudioController.js'
import { computeStandings } from '../src/games/SSX/net.js'
import * as THREE from 'three'
import { MUSIC_TRACKS, MUSIC_STEP, START_VISTA, propYaw, buildScenery, PLACEHOLDER_IDS, primitivesToKeep, swapPlaceholders, surfaceInfo, windAt, flagSway, crowdPlan, crowdHop, crowdHype, animateDecor, CROWD, makeRider, poseRider } from '../src/games/SSX/art.js'
import { plant, pull } from './lib/mutateguard.mjs'

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log(`PASS ${name}`) } else { fail++; console.log(`FAIL ${name}`) } }

// #808 mutant: side-blind 'across' yaw (the old `-p.th`) — one stand in every
// pair turns its back, and the facing gate below MUST catch it.
const ART_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'SSX', 'art.js')
const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const YAW_GOOD = 'p.th + Math.sign(e.x) * Math.PI / 2'
const YAW_BAD = 'p.th - Math.sign(e.x) * Math.PI / 2'
if (process.argv.includes('--mutate')) {
    let src = readFileSync(ART_SRC, 'utf8')
    if (!src.includes(YAW_GOOD)) { console.error('MUTATE: facing law not found — stale code.'); process.exit(2) }
    plant(ART_SRC, src.replace(YAW_GOOD, YAW_BAD))
    let done = false
    try {
        const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8' })
        done = child.status !== 0
        console.log(done ? 'ok  mutant detected: child run failed as demanded' : 'FAIL mutant escaped: child run still green')
    } finally {
        pull(ART_SRC)
    }
    process.exit(done ? 0 : 1)
}

const run = (g, ticks, inp = {}) => { for (let i = 0; i < ticks; i++) step(g, inp) }
const autopilot = (g, maxT = 400000) => {
    let t = 0
    while (!g.end && t < maxT) { step(g, g.phase === 'run' ? decide(g, g.riders[0]) : {}); t++ }
    return g
}
const hasEv = (g, type, pred = () => true) => g.events.some((e) => e.type === type && pred(e))
const clear = (g) => g.events.splice(0)

// ---- 1. boots ---------------------------------------------------------------
{
    const g = makeGame('race')
    ok('boots: race game exists with 6 riders', g.riders.length === 6)
    ok('boots: starts on countdown', g.phase === 'count' && g.count === 180)
    run(g, 181)
    ok('boots: countdown releases to run', g.phase === 'run')
    const s = makeGame('showoff')
    ok('boots: showoff timer', Math.round(s.showoffLeft) === CFG.showoffTime)
    ok('boots: six courses exist (#889)', COURSE_COUNT === 6)
    ok('#889 the race is still three heats', HEATS === 3)
    ok('#889 seed 0 keeps the classic triple', JSON.stringify(tournament(0)) === '[0,1,2]')
    ok('#889 odd seeds rotate to the backcountry', JSON.stringify(tournament(1)) === '[3,4,5]' && JSON.stringify(tournament(7)) === '[3,4,5]')
    ok('#889 every seed rides three distinct mountains', [0, 1, 2, 3].every((s) => new Set(tournament(s)).size === 3))
    // #911: the HUD ribbon names the tour — the same law the triple rotates on
    ok('#911 ribbon names the classic side on even seeds', rotationName(0) === 'CLASSIC SIDE' && rotationName(4) === 'CLASSIC SIDE')
    ok('#911 ribbon names the backcountry on odd seeds', rotationName(1) === 'BACKCOUNTRY' && rotationName(9) === 'BACKCOUNTRY')
    ok('#911 rotation name and the triple agree for every seed',
        [0, 1, 2, 3, 4, 5, 6, 7].every((s) => (tournament(s)[0] < 3) === (rotationName(s) === 'CLASSIC SIDE')))
}

// ---- #911 express chute envelope ---------------------------------------------
{
    let n = 0
    for (let c = 0; c < COURSE_COUNT; c++) {
        const co = buildCourse(c)
        for (const ch of co.chutes) {
            const sMid = ((ch.i0 + ch.i1) / 2) * DS
            ok(`${co.name} chute ${n}: envelope peaks at the lane centre`, chuteAt(co, sMid, ch.x) > 0.9)
            ok(`${co.name} chute ${n}: envelope dies outside the trough`,
                chuteAt(co, sMid, ch.x + ch.w + 0.3) === 0 && chuteAt(co, sMid, ch.x - ch.w - 0.3) === 0)
            ok(`${co.name} chute ${n}: envelope and ridden law agree`,
                [-1.6, -0.7, 0, 0.7, 1.6].every((dx) =>
                    [0.02, 0.25, 0.5, 0.75, 0.98].every((f) => {
                        const s = (ch.i0 + 0.5 + f * (ch.i1 - ch.i0 - 1)) * DS
                        return (expressAt(co, s, ch.x + dx) > 1) === (chuteAt(co, s, ch.x + dx) > 0)
                    })))
            n++
        }
    }
    ok('#911 every one of the six courses carries a chute', n >= 8)
}

// ---- 2. course integrity ----------------------------------------------------
for (let c = 0; c < COURSE_COUNT; c++) {
    const co = buildCourse(c)
    ok(`course ${co.name}: long enough`, co.N > 150)
    let mono = true
    for (let i = 1; i < co.N; i++) if (co.segs[i].y > co.segs[i - 1].y + 1e-9) mono = false
    ok(`course ${co.name}: whole mountain falls downhill`, mono)
    ok(`course ${co.name}: drop is real`, co.segs[0].y - co.segs[co.N - 1].y > 8)
    ok(`course ${co.name}: features on the map`, co.kickers.length >= 3 && (c === 2 ? co.pipes.length === 2 : co.obstacles.length >= 8))
    const inside = co.kickers.every((k) => k.i0 > 4 && k.i1 < co.N - 2) &&
        co.rails.every((r) => r.i0 > 4 && r.i1 < co.N - 2) &&
        co.obstacles.every((o) => o.i > 4 && o.i < co.N - 2)
    ok(`course ${co.name}: features within bounds`, inside)
    ok(`course ${co.name}: deterministic build`, JSON.stringify(buildCourse(c)) === JSON.stringify(co))
    // #889 — doubled length and a full set of route choices on every mountain
    ok(`course ${co.name}: #889 doubled length (${co.length} m)`, co.length >= 1200)
    ok(`course ${co.name}: #889 route choices present`,
        co.gaps.length >= 1 && co.chutes.length >= 1 && co.kickers.some((k) => k.gap))
    ok(`course ${co.name}: #889 gaps are clean ground`, co.gaps.every((gp) =>
        gp.i0 > 12 && gp.i1 < co.N - 6 &&
        co.chutes.every((ch) => ch.i1 * DS <= gp.s0 - 8 || ch.i0 * DS >= gp.s1 + 8) &&
        co.rails.every((rl) => rl.i1 * DS <= gp.s0 - 8 || rl.i0 * DS >= gp.s1 + 8) &&
        co.kickers.every((k) => k.gap || k.i1 * DS <= gp.s0 - 40 || k.i0 * DS >= gp.s1 + 8) &&
        co.obstacles.every((ob) => (ob.i * DS < gp.s0 - 2 || ob.i * DS > gp.s1 + 2) || Math.abs(ob.x) >= GAP_X)))
}
{ // #889: the high line exists across the mountain range
    let highN = 0
    for (let c = 0; c < COURSE_COUNT; c++) highN += buildCourse(c).rails.filter((r) => r.high).length
    ok('#889 the high line exists on every rail course (BIG AIR BASIN is pipes-only by character)', highN === COURSE_COUNT - 1)
}
{ // #889 regression: the ONLINE tournament spans HEATS, not the course catalog —
    // the cabinet scores heat idx 0..HEATS-1, so the standings reducer must say
    // done there (with 6 courses in the catalog, COURSE_COUNT meant never).
    const seats = [0, 1]
    const fin = { 0: [40, 41, 42], 1: [43, 44, 45] }
    const st = computeStandings(seats, fin, HEATS)
    ok('#889 online standings close after HEATS heats', st.done && st.podium[0] === 0)
    ok('#889 a 6-slot heats table is NOT done at HEATS=3 (the bug shape)', computeStandings(seats, { 0: [1, 1, 1, 1, null, null], 1: [2, 2, 2, 2, null, null] }, 6).done === false)
}

// ---- 3. rule pins -----------------------------------------------------------
{ // gravity feeds the hill, carving takes it back
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]
    p.x = 0; p.v = 10
    const v0 = p.v
    run(g, 60)
    ok('gravity accelerates downhill', p.v > v0 + 1)
    const g2 = makeGame('race'); run(g2, 181); clear(g2)
    const q = g2.riders[0]; q.x = 0; q.v = 20
    const before = q.v
    run(g2, 60, { steer: 1 })
    ok('hard carving bleeds speed', q.v < before + 4.5)
}
{ // powder: off-piste sucks the speed out toward 14 m/s
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]; p.x = 1.25; p.v = 24
    run(g, 60)
    ok('powder drag caps off-piste speed', p.v < 20)
}
{ // wall: hard edge of the valley crashes you
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]; p.x = WALL_X - 0.03; p.v = 18
    run(g, 8, { steer: 1 })
    ok('the rock wall bails you', p.tumble > 0 && hasEv(g, 'crash'))
}
{ // #731 rock tops are bounce pads: down from above = points, not punishment
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]
    const ob = g.course.obstacles.find((o) => o.kind === 'rock')
    const os = ob.i * DS
    p.air = true; p.s = os; p.x = ob.x; p.v = 20; p.vy = -1
    p.y = terrainY(g.course, os, ob.x) + 1.1 - 0.05
    const s0 = p.score
    let t = 0
    while (!hasEv(g, 'rockbounce') && t < 10) { step(g, {}); t++ }
    ok('#731 landing on a rock from above bounces', hasEv(g, 'rockbounce') && p.air && p.vy > 0)
    ok('#731 the bounce pays points', p.score - s0 === CFG.rockPts)
    ok('#731 a bounce is not a bail', p.tumble === 0)
}
{ // #731 second contact with the same rock crashes; trees never bounce
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]
    const ob = g.course.obstacles.find((o) => o.kind === 'rock')
    p.air = true; p.s = ob.i * DS; p.x = ob.x; p.v = 20; p.vy = -1
    p.bounceOb = ob.i
    p.y = terrainY(g.course, ob.i * DS, ob.x) + 1.1 - 0.05
    step(g, {})
    ok('#731 re-landing on a bounced rock is a crash', p.tumble > 0 && hasEv(g, 'crash', (e) => e.what === 'rock'))
    const g2 = makeGame('race'); run(g2, 181); clear(g2)
    const q = g2.riders[0]
    const tr = g2.course.obstacles.find((o) => o.kind === 'tree')
    q.air = true; q.s = tr.i * DS; q.x = tr.x; q.v = 6; q.vy = -1
    q.y = terrainY(g2.course, tr.i * DS, tr.x) + 1.2
    let t = 0
    while (!hasEv(g2, 'crash') && t < 300) { step(g2, {}); t++ }
    ok('#731 trees still swallow you whole', hasEv(g2, 'crash', (e) => e.what === 'tree') && !hasEv(g2, 'rockbounce'))
}
{ // #731 head-on at ground level still bails
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]
    const ob = g.course.obstacles.find((o) => o.kind === 'rock')
    p.s = ob.i * DS - 2; p.x = ob.x; p.v = 18; p.air = false
    let t = 0
    while (!hasEv(g, 'crash') && t < 60) { step(g, {}); t++ }
    ok('#731 riding into a rock face still bails', p.tumble > 0 && hasEv(g, 'crash', (e) => e.what === 'rock'))
}
{ // #731 scenery plan: four tree species, per-instance tint/scale, ids on the shelf
    const shelfIds = new Set(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/models/shelf.json'))).entries.map((e) => e.id))
    let speciesOk = true, tintOk = true, varietyOk = true, shelfOk = true
    for (let c = 0; c < COURSE_COUNT; c++) {
        const plan = sceneryPlan(buildCourse(c))
        const trees = plan.filter((e) => e.id.startsWith('tree'))
        const species = new Set(trees.map((e) => e.id))
        if (species.size < 4) speciesOk = false
        if (!trees.every((e) => e.tint != null && e.tint > 0.7 && e.tint < 1.3)) tintOk = false
        if (new Set(trees.map((e) => e.scale.toFixed(3))).size < 8 || new Set(trees.map((e) => e.rot.toFixed(3))).size < 8) varietyOk = false
        if (!plan.every((e) => SHELF_PROPS.includes(e.id) && shelfIds.has(e.id))) shelfOk = false
    }
    ok('#731 every course carries all four tree species', speciesOk)
    ok('#731 every tree instance carries an in-range tint', tintOk)
    ok('#731 scale and rotation vary across trees', varietyOk)
    ok('#731 every plan id is a real shelf prop', shelfOk)
}
{ // #808 facing law (extended #844): every side-aware prop — 'across' stands
    // AND 'along' fence panels — shows its face to the racing line from
    // whichever side it sits on; the front (local +z rotated by the yaw
    // art.js applies) must look at the nearest centreline point. The old
    // 'along' yaw (-p.th - π/2) baked in a side: right-hand fences faced
    // outbound and every fence skewed by 2θ on curves.
    let facingOk = true, facingN = 0
    for (let c = 0; c < COURSE_COUNT; c++) {
        const co = buildCourse(c)
        for (const e of sceneryPlan(co)) {
            if (e.orient !== 'across' && e.orient !== 'along') continue
            facingN++
            const p = slopePos(co, e.s, e.x)
            const yaw = propYaw(e, p)
            const fx = Math.sin(yaw), fz = Math.cos(yaw)
            let bx = 0, bz = 0, bd = Infinity
            for (let s = 0; s <= (co.N - 1) * DS; s += DS / 4) {
                const q = slopePos(co, s, 0)
                const dd = (q.x - p.x) ** 2 + (q.z - p.z) ** 2
                if (dd < bd) { bd = dd; bx = q.x; bz = q.z }
            }
            const dx = bx - p.x, dz = bz - p.z
            if ((fx * dx + fz * dz) / (Math.hypot(dx, dz) || 1) < 0.3) facingOk = false
        }
    }
    ok(`#808 ${facingN} across/along props audited (≥ 20)`, facingN >= 20)
    ok('#808 every facing prop looks at the racing line', facingOk)
}
{ // #844: 'along' fence panels lie lengthwise along the piste (long axis is
    // the model's local x) — not broadside across the fall line
    let axisOk = true, axisN = 0
    for (let c = 0; c < COURSE_COUNT; c++) {
        const co = buildCourse(c)
        for (const e of sceneryPlan(co)) {
            if (e.orient !== 'along') continue
            axisN++
            const p = slopePos(co, e.s, e.x)
            const yaw = propYaw(e, p)
            const ax = Math.cos(yaw), az = -Math.sin(yaw)
            const { seg } = { seg: co.segs[Math.min(co.N - 1, Math.round(e.s / DS))] }
            const d = Math.abs(ax * Math.sin(seg.th) + az * Math.cos(seg.th))
            if (d < 0.9) axisOk = false
        }
    }
    ok(`#844 ${axisN} fence panels audited (≥ 20)`, axisN >= 20)
    ok('#844 fence panels run along the piste, not broadside', axisOk)
}
{ // #844 exposed rock faces: authored outcrops per course, and the plan lays
    // a run of angular/snow-topped rock on the authored side, clear of the
    // fence line and of the gully walls; the piste itself stays snow
    let spanN = 0, clusterOk = true, cleanOk = true, inSpanOk = true, idsOk = true
    const ROCK_IDS = new Set(['rock', 'rock_angular', 'rock_snow', 'boulder', 'boulder_snow'])
    for (let c = 0; c < COURSE_COUNT; c++) {
        const co = buildCourse(c)
        spanN += co.outcrops.length
        if (co.outcrops.length < 1) clusterOk = false
        for (const oc of co.outcrops) {
            for (const gl of co.gullies) {
                if (oc.s0 < gl.s1 + 40 && oc.s1 > gl.s0 - 40) cleanOk = false
            }
            const props = sceneryPlan(co).filter((e) => ROCK_IDS.has(e.id)
                && e.s >= oc.s0 - 1 && e.s <= oc.s1 + 1 && Math.sign(e.x) === oc.side && Math.abs(e.x) > WALL_X + 0.6)
            if (props.length < 6) clusterOk = false
        }
        if (!sceneryPlan(co).every((e) => SHELF_PROPS.includes(e.id))) idsOk = false
        for (let s = 60; s < co.N * DS - 40; s += DS) {
            for (const x of [-1.4, -0.7, 0, 0.7, 1.4]) {
                if (surfaceInfo(co, s, x).rockT > 0.05) inSpanOk = false
            }
        }
    }
    ok('#844 every course has ≥1 authored outcrop span, ≥5 total', clusterOk && spanN >= 5)
    ok('#844 outcrops cluster ≥6 rock props on their side', clusterOk)
    ok('#844 outcrops avoid the gully walls', cleanOk)
    ok('#844 outcrop ids are real shelf props', idsOk)
    ok('#844 outcrops never touch the piste (|x|<1.5 stays snow)', inSpanOk)
}
{ // #975 the day glade is plan data, the primitives mirror the plan 1:1, and
    // the shelf swap degrades per model: a placeholder survives exactly when
    // its own GLB failed to load. Nothing with legs (or a trunk) stands in a
    // crevasse — painted == ridden from the very first frame.
    const day = [], night = []
    for (let c = 0; c < COURSE_COUNT; c++) {
        const co = buildCourse(c)
        ;(co.theme === 'day' ? day : night).push(co)
    }
    ok('#975 the glade is day-only', day.length >= 2 && night.every((co) => gladeDefs(co).length === 0))
    ok('#975 the day glade carries ≥14 big trees per course', day.every((co) => gladeDefs(co).length >= 14))
    ok('#975 glade defs are deterministic', JSON.stringify(gladeDefs(day[0])) === JSON.stringify(gladeDefs(day[0])))
    ok('#975 every glade tree is in the scenery plan (survives attachShelf)', day.every((co) => {
        const plan = sceneryPlan(co)
        return gladeDefs(co).every((d) => plan.some((e) => Math.abs(e.s - d.s) < 1 && Math.abs(e.x - d.x) < 0.01 && e.id.startsWith('tree') && e.scale >= 1.5))
    }))
    let gapClean = true
    for (let c = 0; c < COURSE_COUNT; c++) {
        const co = buildCourse(c)
        for (const e of sceneryPlan(co)) {
            if (PLACEHOLDER_IDS.includes(e.id) && gapAt(co, e.s) !== null && Math.abs(e.x) < GAP_X) gapClean = false
        }
        const ph = buildScenery(co).children.filter((o) => o.userData.ph != null).length
        const exp = sceneryPlan(co).reduce((n, e) => n + (PLACEHOLDER_IDS.includes(e.id) ? (e.id.startsWith('tree') ? 2 : 1) : 0), 0)
        if (ph !== exp) gapClean = false
    }
    ok('#975 placeholder count mirrors the plan on every course', gapClean)
    {
        const co = buildCourse(0)
        const plan = sceneryPlan(co)
        let posOk = true
        for (const ch of buildScenery(co).children) {
            const k = ch.userData.ph
            if (k == null) continue
            const e = plan[k]
            const p = slopePos(co, e.s, e.x)
            if (Math.hypot(ch.position.x - p.x, ch.position.z - p.z) > 0.01) posOk = false
            if (Math.abs(ch.scale.x - e.scale) > 1e-9) posOk = false
        }
        ok('#975 every primitive sits on its plan slot (id/pos/scale parity)', posOk)
    }
    ok('#975 no placeholder stands in a crevasse', (() => {
        for (let c = 0; c < COURSE_COUNT; c++) {
            const co = buildCourse(c)
            const plan = sceneryPlan(co)
            for (const ch of buildScenery(co).children) {
                const k = ch.userData.ph
                if (k == null) continue
                const e = plan[k]
                if (gapAt(co, e.s) !== null && Math.abs(e.x) < GAP_X) return false
            }
        }
        return true
    })())
    {
        const co = buildCourse(0)
        const plan = sceneryPlan(co)
        const loaded = {}
        for (const id of new Set(plan.map((e) => e.id))) loaded[id] = {}
        ok('#975 full shelf keeps zero primitives', primitivesToKeep(plan, loaded).size === 0)
        const half = { ...loaded }
        let pineN = 0
        plan.forEach((e, k) => { if (e.id === 'tree_pine') pineN++ })
        half.tree_pine = null
        const keep = primitivesToKeep(plan, half)
        ok('#975 a failed model keeps exactly its own primitives', keep.size === pineN
            && [...keep].every((k) => plan[k].id === 'tree_pine'))
        half.tree_pine = {}
        { // #975: the removal walk reaches NESTED primitives — the scenery
            // group lives a level below world; a children-only scan left all
            // 360 placeholders double-drawing in the browser.
            const THREE = await import('three')
            const world2 = new THREE.Group()
            world2.add(buildScenery(co))
            const expN = plan.reduce((n, e) => n + (PLACEHOLDER_IDS.includes(e.id) ? (e.id.startsWith('tree') ? 2 : 1) : 0), 0)
            const removed = swapPlaceholders(world2, plan, loaded)
            let left = 0
            world2.traverse((o) => { if (o.userData.ph != null) left++ })
            ok('#975 swap removes nested placeholders (360 -> 0)', removed === expN && left === 0)
            const world3 = new THREE.Group()
            world3.add(buildScenery(co))
            const halfModels = { ...loaded }
            halfModels.tree_pine = null
            swapPlaceholders(world3, plan, halfModels)
            let leftPine = 0
            world3.traverse((o) => { if (o.userData.ph != null) leftPine++ })
            ok('#975 failed-model primitives survive the nested swap', leftPine === 2 * pineN)
        }
        const noFlag = { ...loaded }
        noFlag.flag = null
        ok('#975 non-placeholder ids never enter the keep set', primitivesToKeep(plan, noFlag).size === 0)
    }
}
{ // clean landing banks the trick; a half-finished flip eats it
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]
    p.air = true; p.y = terrainY(g.course, p.s, p.x) + 6; p.vy = 2; p.spin = 540; p.grab = 1
    let t = 0; while (p.air && t < 300) { step(g, {}); t++ }
    ok('spin+grab banks on landing', hasEv(g, 'land', (e) => /540/.test(e.name || '')) && p.score > 0)
    const g2 = makeGame('race'); run(g2, 181); clear(g2)
    const q = g2.riders[0]
    q.air = true; q.y = terrainY(g2.course, q.s, q.x) + 6; q.vy = 2; q.flip = 200
    t = 0; while (q.air && t < 300) { step(g2, {}); t++ }
    ok('a half-done flip is a bail', q.tumble > 0 && hasEv(g2, 'crash'))
}
{ // #791 doubles: big normal air opens the ledger to a second flip; short air stays single
    const launch = (who, airT, dy, vy, dir, held) => {
        const g = makeGame('race'); run(g, 181); clear(g)
        g.course.obstacles.length = 0
        const p = g.riders[who]
        p.x = 0; p.v = 24
        p.air = true; p.airT = airT; p.spin = 0; p.flip = 0; p.grab = 0; p.over = false
        p.y = terrainY(g.course, p.s, p.x) + dy; p.vy = vy
        let t = 0; let maxF = 0
        const evs = []
        while (!evs.some((e) => (e.type === 'land' || e.type === 'crash') && e.who === who) && t < 400) {
            maxF = Math.max(maxF, Math.abs(p.flip))
            step(g, held ? { flip: dir } : {})
            evs.push(...g.events.splice(0))
            t++
        }
        return { e: evs.find((x) => x.who === who && (x.type === 'land' || x.type === 'crash')), maxF, p }
    }
    const d = launch(0, 0, 60, 2, 1, true)
    ok('#791 a held flip through big normal air banks a DOUBLE BACKFLIP without OVER',
        !!d.e && d.e.type === 'land' && /DOUBLE BACKFLIP/.test(d.e.name) && !d.e.over)
    ok('#791 the double is capped where a clean landing still fits (720+~20)',
        d.maxF >= 740 && d.maxF < 750)
    ok('#791 a double pays both rotations (≥ 700 flip points)', !!d.e && d.e.pts >= 700)
    const s = launch(0, 0, 2, 2, 1, true)
    ok('#791 short air stays single: the second flip only opens past a second of hang',
        !!s.e && s.e.type === 'land' && !/DOUBLE/.test(s.e.name) && s.maxF <= 328)
    const f = launch(0, 0, 60, 2, 2, true)
    ok('#791 the ledger names the direction: held front flip banks DOUBLE FRONTFLIP',
        !!f.e && f.e.type === 'land' && /DOUBLE FRONTFLIP/.test(f.e.name))
    ok('#791 a half-finished double (560°+) is still a bail', (() => {
        const g = makeGame('race'); run(g, 181); clear(g)
        g.course.obstacles.length = 0
        const p = g.riders[0]
        p.x = 0; p.v = 24
        p.air = true; p.airT = 1.2; p.spin = 0; p.grab = 0; p.over = false; p.flip = 560
        p.y = terrainY(g.course, p.s, p.x) + 3; p.vy = -4
        let t = 0; while (!hasEv(g, 'crash') && t < 300) { step(g, {}); t++ }
        return p.tumble > 0 && hasEv(g, 'crash')
    })())
    {
        const airRide = (rid, flip, extra) => {
            const g = makeGame('race'); run(g, 181); clear(g)
            const r = g.riders[rid]
            Object.assign(r, { air: true, airT: 0.2, spin: 0, grab: 0, over: false, v: 24, x: 0, flip, ...extra })
            r.y = terrainY(g.course, r.s, r.x) + 30; r.vy = 2
            return decide(g, r).flip
        }
        ok('#791 seat 1 opens the second flip when the hang pays, and releases inside the clean window',
            airRide(1, 0) === true && airRide(1, 500) === true && airRide(1, 660) === true && airRide(1, 668) === false)
        ok('#791 seat 2 (skill 0.78) never reaches for the double — it releases at the single',
            airRide(2, 0) === true && airRide(2, 324) === false && airRide(2, 500) === false)
        ok('#791 the double is seat-1 only — seat 3 (skill 0.72) never reaches past its single',
            airRide(3, 324) === false)
    }
}
{ // chains multiply; bails reset to x1
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]
    const bankOnce = () => {
        p.air = true; p.y = terrainY(g.course, p.s, p.x) + 5; p.vy = 1; p.spin = 360; p.flip = 0; p.grab = 0
        let t = 0; while (p.air && t < 300) { step(g, {}); t++ }
    }
    bankOnce(); clear(g)
    bankOnce()
    const e = g.events.find((ev) => ev.type === 'land')
    ok('second clean trick pays x2', e && e.mult === 2)
    p.tumble = 1; p.chain = 0
}
{ // OVER: full meter at takeoff doubles the ledger
    const base = (() => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        p.meter = 50
        p.air = true; p.y = terrainY(g.course, p.s, p.x) + 5; p.vy = 1; p.spin = 360
        let t = 0; while (p.air && t < 300) { step(g, {}); t++ }
        return g.events.find((e) => e.type === 'land').pts
    })()
    const over = (() => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        p.meter = 100
        p.air = true; p.y = terrainY(g.course, p.s, p.x) + 5; p.vy = 1; p.spin = 360; p.over = true
        let t = 0; while (p.air && t < 300) { step(g, {}); t++ }
        const e = g.events.find((ev) => ev.type === 'land')
        ok('OVER is announced in the name', /OVER/.test(e.name))
        return e.pts
    })()
    ok('OVER doubles the pay', over === base * 2)
}
{ // boost: spends meter, lifts the ceiling to 38 (pace 1)
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]; p.meter = 60; p.x = 0; p.v = 28
    run(g, 120, { boost: true })
    ok('boost drains the meter', p.meter < 60 - 20)
    ok('boost raises the ceiling', p.v > CFG.top + 2 && p.v <= CFG.boostTop + 0.01)
}
{ // crash penalty: speed, meter and chain all dump
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]; p.v = 26; p.meter = 80; p.chain = 2
    p.x = WALL_X - 0.03
    run(g, 8, { steer: 1 })
    ok('crash dumps speed', p.v < 20)
    ok('crash dumps half the meter', Math.abs(p.meter - 40) < 1)
    ok('crash resets the chain', p.chain === 0)
}
{ // rails: grind pays trickle points and ignores spins
    const g = makeGame('race', 0)
    g.phase = 'run'; g.count = 0
    const p = g.riders[0]
    const rl = g.course.rails[0]
    p.s = rl.i0 * DS + 2; p.x = rl.x; p.v = 20
    clear(g)
    run(g, 45, { steer: 1 })
    ok('grind trickles points', hasEv(g, 'grind', (e) => e.pts > 0) || p.score > 0)
    ok('grind pins the line', p.grind !== null && Math.abs(p.x - rl.x) < 0.05)
}
{ // finish: places count and standings book correctly
    const g = makeGame('race'); run(g, 181); clear(g)
    const finishS = g.course.finish * DS
    g.riders[1].s = finishS + 1
    step(g, {})
    ok('CPU crossing first books 10 pts', g.standings[1] === PLACE_PTS[0])
    p: {
        const p = g.riders[0]; p.s = finishS + 1
        step(g, {})
        ok('player crossing second books 7 pts', g.standings[0] === PLACE_PTS[1] && p.place === 2)
        ok('heat ends when the player finishes', g.phase === 'heatEnd')
    }
}
{ // heat progression: a win walks three heats off the seed rotation (#889)
    const g = autopilot(makeGame('race'))
    ok('race wins end after three heats', g.end === 'win' && g.heat === HEATS - 1 && g.place === 1)
    ok('winner books every heat', g.standings[0] === PLACE_PTS[0] * HEATS)
}
{ // #889 the rotation names: seed 0 classic, seed 1 backcountry
    const names = (seed) => {
        const g = makeGame('race', seed)
        const seen = [g.course.name]
        let t = 0
        while (!g.end && t < 400000) {
            const before = g.events.length
            step(g, g.phase === 'run' ? decide(g, g.riders[0]) : {})
            for (const e of g.events.slice(before)) if (e.type === 'heat') seen.push(g.course.name)
            t++
        }
        return seen.join('|')
    }
    ok('#889 seed 0 rides ALPINE → NEON → BASIN', names(0) === 'ALPINE GLADE|NEON HEIGHTS|BIG AIR BASIN')
    ok('#889 seed 1 rides BACKCOUNTRY → TIMBER → PIPE WORKS', names(1) === 'BACKCOUNTRY BOWL|TIMBER LINE|PIPE WORKS')
}

// ---- 3d. #889 route choices: crevasses, chutes, high rails ------------------
{ // a crevasse: speed flies, a crawl gets swallowed, the shoulder survives
    const co = buildCourse(3)
    const gp = co.gaps[0]
    const trial = (v, x) => {
        const g = makeGame('race')
        g.course = co
        g.phase = 'run'; g.count = 0
        clear(g)
        const p = g.riders[0]
        p.s = gp.s0 - DS * 2; p.x = x; p.v = v; p.y = terrainY(co, p.s, x)
        for (let i = 0; i < 150 && p.s < gp.s1 + 20; i++) step(g, {})
        return g.events.some((e) => e.type === 'crash' && e.what === 'gap' && e.who === 0)
    }
    ok('#889 a fast fall-line flies the crevasse', !trial(28, 0))
    ok('#889 a crawl off the lip gets swallowed', trial(6, 0))
    ok('#889 the shoulder line skirts it (slow but alive)', !trial(6, GAP_X + 0.25))
    ok('#889 the crest launch rides the hash (deterministic)', (() => {
        const two = [0, 1].map(() => {
            const g = makeGame('race')
            g.course = co
            g.phase = 'run'; g.count = 0
            const p = g.riders[0]
            p.s = gp.s0 - DS * 2; p.x = 0; p.v = 28; p.y = terrainY(co, p.s, 0)
            run(g, 40)
            return stateHash(g)
        })
        return two[0] === two[1]
    })())
    ok('#889 gapAt reports the span and rim', (() => {
        const a = gapAt(co, gp.s0 + 4), b = gapAt(co, gp.s1 + 4)
        return a !== null && a.rim === gp.rim && b === null
    })())
}
{ // chutes: the trough carries more ground than the same push on open snow
    const co = buildCourse(0)
    const ch = co.chutes[0]
    const trial = (x) => {
        const g = makeGame('race')
        g.course = co
        g.phase = 'run'; g.count = 0
        const p = g.riders[0]
        p.s = ch.i0 * DS + 2; p.x = x; p.v = 20; p.y = terrainY(co, p.s, x)
        const s0 = p.s
        for (let i = 0; i < 30 && p.s < ch.i1 * DS; i++) step(g, {})
        return p.s - s0
    }
    ok('#889 the express chute outruns the snow beside the line', trial(ch.x) > trial(0) * 1.2)
    ok('#889 expressAt reads the lane and saturates', expressAt(co, ch.i0 * DS + 10, ch.x) === EXPRESS && expressAt(co, ch.i0 * DS + 10, ch.x + ch.w + 0.5) === 1)
}
{ // high rails pay double trickle against the standard rail
    const co = buildCourse(0)
    const hi = co.rails.find((r) => r.high)
    const lo = co.rails.find((r) => !r.high)
    const grind = (rl) => {
        const g = makeGame('race')
        g.course = co
        g.phase = 'run'; g.count = 0
        const p = g.riders[0]
        p.s = rl.i0 * DS + 2; p.x = rl.x; p.v = 20; p.y = terrainY(co, p.s, rl.x)
        clear(g)
        step(g, {})   // snap onto the rail first
        for (let i = 0; i < 40 && p.grind; i++) step(g, {})
        return p.score
    }
    ok('#889 the high line pays roughly double the low rail', grind(hi) > grind(lo) * 1.7)
}

// ---- 3b. carved tracks ----------------------------------------------------
{ // the slope remembers your line for ~5 s, nothing when straight or airborne
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]; p.x = 0; p.v = 20
    run(g, 40, { steer: 1 })
    ok('hard carving leaves grooves', p.carves.length >= 30)
    const nAir = p.carves.length
    p.air = true; p.y = terrainY(g.course, p.s, p.x) + 4; p.vy = 0
    run(g, 20, { steer: 1 })
    ok('airborne boards carve nothing', p.carves.length === nAir)
    const g2 = makeGame('race'); run(g2, 181); clear(g2)
    const q = g2.riders[0]; q.x = 0; q.v = 20
    run(g2, 40, { steer: 1 })
    ok('carving marks accumulate', q.carves.length > 0)
    run(g2, CARVE_FADE + 5)
    ok('carved tracks fade within ~5 s', q.carves.length === 0)
    const g3 = makeGame('race'); run(g3, 181); clear(g3)
    run(g3, 40)
    ok('straight riding leaves no grooves', g3.riders[0].carves.length === 0)
}

// ---- 3c. steer sign + tuck/scrub (#547) ------------------------------------
{ // the render basis: +x must land on the rider's RIGHT on the chase-cam
    // screen (cam looks along d=(sin th, cos th) -> right = d × up = (-cos, sin)).
    // The old (+cos, -sin) basis mirrored the mountain: steer steered backwards.
    const co = buildCourse(0)
    const probe = (x) => {
        const p = slopePos(co, 400, x), p0 = slopePos(co, 400, 0)
        return (p.x - p0.x) * -Math.cos(p.th) + (p.z - p0.z) * Math.sin(p.th)
    }
    ok('+x is screen-right on the chase-cam', probe(0.5) > 0)
    ok('-x is screen-left on the chase-cam', probe(-0.5) < 0)
    { // and the input drives it the honest way: ArrowRight (steer +1) pushes x right
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]; p.x = 0; p.v = 20
        run(g, 20, { steer: 1 })
        const pa = slopePos(g.course, p.s, p.x), p0 = slopePos(g.course, p.s, 0)
        const lat = (pa.x - p0.x) * -Math.cos(p0.th) + (pa.z - p0.z) * Math.sin(p0.th)
        ok('steer right carves right — sim AND screen', p.x > 0.1 && lat > 0)
    }
}
{ // tuck (↑) is faster than sitting tall; scrub (↓) checks speed
    const fresh = (v) => { const g = makeGame('race'); run(g, 181); clear(g); const p = g.riders[0]; p.x = 0; p.v = v; return g }
    const a = fresh(12), b = fresh(12), d = fresh(12)
    run(a, 90)
    run(b, 90, { tuck: true })
    run(d, 90, { scrub: true })
    ok('tuck (↑) outruns sitting tall', b.riders[0].v > a.riders[0].v + 1)
    ok('scrub (↓) bleeds speed', d.riders[0].v < a.riders[0].v - 1)
    ok('tuck reads on the rig state', b.riders[0].tuck === true)
    ok('the upright board neither tucks nor scrubs', a.riders[0].tuck === false && a.riders[0].scrub === false)
}
{ // steering stays live while the ollie charges (#547: stick up charged a
    // jump-lock before; steering must survive the charge)
    const g = makeGame('race'); run(g, 181); clear(g)
    const p = g.riders[0]; p.x = 0; p.v = 18
    run(g, 12, { jump: true, steer: 1 })
    ok('steering is live mid-jump-charge', p.crouch === true && p.x > 0.05)
}

// ---- 4. win proofs -----------------------------------------------------------
{
    const g = autopilot(makeGame('race'))
    ok('PROVEN: the autopilot is MOUNTAIN CHAMPION', g.end === 'win')
    const p = g.riders[0]
    ok('the champion actually thrashed the field', p.tricksLanded > 0 && p.crashes === 0)
    const so = autopilot(makeGame('showoff'))
    ok('PROVEN: showoff clears the house target', so.end === 'win' && so.riders[0].score >= CFG.showoffTarget)
    const g1 = autopilot(makeGame('race', 1))
    ok('PROVEN: the backcountry rotation is winnable too (#889)', g1.end === 'win' && g1.place === 1 && g1.riders[0].crashes === 0)
    ok('#889 the field actually risks the crevasses (seeded gap falls)', g1.events.filter((e) => e.type === 'crash' && e.what === 'gap' && e.who !== 0).length >= 2)
}

// ---- 5. slack rule -----------------------------------------------------------
{ // one fewer of every supply the winning script consumes
    const gain = CFG.boostGain, cap = CFG.comboCap
    CFG.slack = true; CFG.boostGain = gain * 0.75; CFG.comboCap = 3
    try {
        const g = autopilot(makeGame('race'))
        ok('SLACK: race still wins at 0.75x trick economy, chain cap x3', g.end === 'win')
        const g1 = autopilot(makeGame('race', 1))
        ok('SLACK: the backcountry rotation still wins (#889)', g1.end === 'win')
        const so = autopilot(makeGame('showoff'))
        ok('SLACK: showoff still clears', so.end === 'win')
    } finally { CFG.slack = false; CFG.boostGain = gain; CFG.comboCap = cap }
}

// ---- 6. determinism ----------------------------------------------------------
{
    const a = makeGame('race'), b = makeGame('race')
    const script = []
    for (let i = 0; i < 4000; i++) script.push(i % 500 < 20 ? { steer: 1, boost: i % 7 === 0 } : {})
    let ha = [], hb = []
    for (let i = 0; i < script.length; i++) {
        step(a, script[i]); step(b, script[i])
        if (i % 500 === 0) { ha.push(stateHash(a)); hb.push(stateHash(b)) }
    }
    ok('replay is hash-for-hash identical', ha.join(',') === hb.join(','))
    const g = cloneGame(a)
    ok('cloneGame snapshots without aliasing', stateHash(g) === stateHash(a) && g !== a)
    // no Math.random anywhere in the deterministic spine
    const here = dirname(fileURLToPath(import.meta.url))
    const spine = ['course.js', 'sim.js', 'planner.js'].map((f) => readFileSync(join(here, '..', 'src', 'games', 'SSX', f), 'utf8'))
    ok('no Math.random in course/sim/planner', spine.every((src) => !/Math\.random\s*\(/.test(src)))
}

// ---- 7. planner/CFG agreement -----------------------------------------------
{
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'SSX', 'planner.js'), 'utf8')
    const grab = (k) => Number(src.match(new RegExp(`${k}: ([0-9.]+)`))?.[1])
    ok('planner mirrors CFG.G', grab('G') === CFG.G)
    ok('planner mirrors CFG.STEER', grab('STEER') === CFG.STEER)
    ok('planner mirrors CFG.CENT', grab('CENT') === CFG.CENT)
    ok('planner mirrors CFG.flipRate', grab('flipRate') === CFG.flipRate)
    ok('#791 planner mirrors CFG.revertSpin', grab('revertSpin') === CFG.revertSpin)
    ok('#791 miss rate mirrors the planner LCG modulus', Number(src.match(/1664525/)?.[0]) === 1664525)
    ok('CPU seats are honest under the player top', PACE.every((v) => v < 1))
}

// ---- 8. feel pass (#780): soundtrack beds + summit vista --------------------
{
    const themes = []
    for (let c = 0; c < COURSE_COUNT; c++) themes.push(buildCourse(c).theme)
    ok('#780 every mountain theme has a big-beat bed',
        themes.every((t) => MUSIC_TRACKS[t] && MUSIC[MUSIC_TRACKS[t]]))
    let bedsOk = true, stepsOk = true
    for (const t of Object.keys(MUSIC_TRACKS)) {
        const P = MUSIC[MUSIC_TRACKS[t]]
        if (!P || P.lead.length !== P.bass.length || P.lead.length !== P.perc.length || P.lead.length % 8 !== 0) { bedsOk = false; continue }
        if (!P.perc.some((v) => v === 1) || !P.perc.some((v) => v === 2)) bedsOk = false
        if (MUSIC_STEP[MUSIC_TRACKS[t]] !== P.step) stepsOk = false
        if (!(P.step >= 0.1 && P.step <= 0.17)) stepsOk = false
    }
    ok('#780 beds are driving kick/tek patterns of equal lanes', bedsOk)
    ok('#780 resting tempo pinned to the track grid, liftable band', stepsOk)
}
{
    const V = START_VISTA
    ok('#780 the start camera is twice the chase-cam distance back', V.back >= 9.5 * 2)
    ok('#780 the start camera towers over the gate', V.up >= 10)
    ok('#780 the vista looks down the whole face, not into the near slope', V.look >= 48)
    ok('#780 the vista FOV opens wider than the chase rig', V.fov > 70 && V.fov < 100)
}

// ---- 9. #791 CPU miss rate: the field falls, places change hands ------------
{
    ok('#791 the witness (skill 1) is exempt from the miss rate', missChance(1, PACE[0]) === 0)
    let mono = true
    for (let i = 1; i < SKILL.length; i++) if (!(missChance(SKILL[i], PACE[i]) >= missChance(SKILL[i - 1], PACE[i - 1]))) mono = false
    ok('#791 miss chance rises with seat number, stays sane',
        mono && SKILL.every((s, i) => missChance(s, PACE[i]) > 0 && missChance(s, PACE[i]) < 0.5))
    ok('#791 the miss knobs are exported and mirrored', MISS.base > 0 && MISS.paceK > 0)

    const driveRace = (seed) => {
        const g = makeGame('race', seed)
        const orders = []
        let cur = []
        let t = 0
        while (!g.end && t < 400000) {
            step(g, g.phase === 'run' ? decide(g, g.riders[0]) : {})
            for (const e of g.events.slice(-2)) {
                if (e.type === 'heat') { if (cur.length) orders.push(cur.join('')); cur = [] }
                if (e.type === 'finish' && e.who !== 0) cur.push(e.who)
            }
            t++
        }
        if (cur.length) orders.push(cur.join(''))
        return { g, orders }
    }

    let cpuFalls = 0, missFalls = 0, witnessClean = true, seedWin = true
    const allOrders = []
    for (const seed of [0, 7, 13]) {
        const { g, orders } = driveRace(seed)
        const falls = g.events.filter((e) => e.type === 'crash' && e.who !== 0)
        cpuFalls += falls.length
        missFalls += falls.filter((e) => e.what === 'miss').length
        if (g.riders[0].crashes !== 0) witnessClean = false
        if (g.end !== 'win') seedWin = false
        allOrders.push(...orders)
    }
    ok('#791 the CPU field actually takes falls', cpuFalls >= 4)
    ok('#791 seeded wipeouts land as what=miss crashes', missFalls >= 2)
    ok('#791 places change hands among the rivals', new Set(allOrders).size >= 2)
    ok('#791 the witness still thrashes a fallible field', witnessClean && seedWin)

    const d1 = driveRace(7), d2 = driveRace(7)
    const crashSeq = (g) => g.events.filter((e) => e.type === 'crash').map((e) => `${e.who}:${e.what}`).join(',')
    ok('#791 every seeded fall replays exactly', crashSeq(d1.g) === crashSeq(d2.g) && stateHash(d1.g) === stateHash(d2.g))
    ok('#791 seeded misses ride the g._rs LCG, not Math.random',
        !/Math\.random\s*\(/.test(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'SSX', 'planner.js'), 'utf8')))
}

// ---- 9a. #791 slice 10: line-bobble — the field clips lines, not just landings --
{
    // recovery odds scale with skill: a skilled seat saves a clip, a rookie eats it
    ok('#791 the bobble knobs are exported and sane',
        CFG.bobbleK > 0 && CFG.bobbleK <= 1 && CFG.bobbleDrag > 0.5 && CFG.bobbleDrag < 1 &&
        CFG.bobbleKick > 0 && CFG.bobbleMeter >= 0 && CFG.bobbleT > 0)
    let mono = true
    for (let i = 1; i < SKILL.length; i++) if (!(CFG.bobbleK * SKILL[i] <= CFG.bobbleK * SKILL[i - 1])) mono = false
    ok('#791 clip recovery rises with seat skill and stays sane',
        mono && SKILL.every((s) => CFG.bobbleK * s > 0 && CFG.bobbleK * s < 1))
    ok('#791 the bobble gate reads the seat skill and rides the seeded LCG',
        /SKILL\[r\.id - 1\]/.test(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'SSX', 'sim.js'), 'utf8')) &&
        !/Math\.random\s*\(/.test(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'SSX', 'sim.js'), 'utf8')))

    // a deterministic bobble: seed the LCG so a weak seat recovers off a rock
    const bob = makeGame('race'); run(bob, 181); clear(bob)
    const rb = bob.riders[5]
    const rob = bob.course.obstacles.find((o) => o.kind === 'rock')
    rb.air = false; rb.s = rob.i * DS; rb.x = rob.x; rb.v = 20; rb.meter = 60
    rb.y = terrainY(bob.course, rob.i * DS, rob.x)
    bob._rs = 0
    const v0 = rb.v, m0 = rb.meter
    step(bob, {})
    ok('#791 a CPU that clips a rock bobbles past it, not a wipeout',
        hasEv(bob, 'bobble', (e) => e.who === 5) && rb.tumble === 0 && rb.bobble > 0)
    ok('#791 a clip costs speed and meter but keeps the rider rolling',
        rb.v < v0 && rb.v > v0 * 0.6 && rb.meter < m0 && !hasEv(bob, 'crash'))
    ok('#791 the clip knocks the board off its line', Math.abs(rb.x - rob.x) >= rob.r)

    // the player is never exempt: the same contact is a straight bailing
    const pla = makeGame('race'); run(pla, 181); clear(pla)
    const p = pla.riders[0]
    const pob = pla.course.obstacles.find((o) => o.kind === 'rock')
    p.air = false; p.s = pob.i * DS; p.x = pob.x; p.v = 20
    p.y = terrainY(pla.course, pob.i * DS, pob.x)
    pla._rs = 0
    step(pla, {})
    ok('#791 the player still bails on an obstacle — never bobbles',
        !hasEv(pla, 'bobble') && p.tumble > 0 && hasEv(pla, 'crash', (e) => e.who === 0))

    // across heats: the field actually bobbles, the witness is clean, places move
    const raceBob = (seed) => {
        const g = makeGame('race', seed)
        let t = 0
        while (!g.end && t < 400000) { step(g, g.phase === 'run' ? decide(g, g.riders[0]) : {}); t++ }
        return g
    }
    let bobbles = 0, obCrash = 0, playerBob = 0, orders = []
    for (const seed of [0, 4, 5, 6, 8, 9]) {
        const g = raceBob(seed)
        const bobs = g.events.filter((e) => e.type === 'bobble')
        bobbles += bobs.length
        playerBob += bobs.filter((e) => e.who === 0).length
        obCrash += g.events.filter((e) => e.type === 'crash' && (e.what === 'rock' || e.what === 'tree')).length
        orders.push(g.riders.filter((r) => r.id !== 0 && r.finished).map((r) => r.place).join(''))
    }
    ok('#791 the CPU field bobbles past obstacles across heats', bobbles >= 6)
    ok('#791 a bobble is never credited to the player', playerBob === 0)
    ok('#791 bobbles soften but never erase the obstacle fall', obCrash >= 1)
    ok('#791 places still change hands with the bobble in play', new Set(orders).size >= 2)

    // determinism: the same seed replays bobble-for-bobble
    const seq = (g) => g.events.filter((e) => e.type === 'bobble' || e.type === 'crash').map((e) => `${e.type}:${e.who}:${e.what}`).join(',')
    const r1 = raceBob(4), r2 = raceBob(4)
    ok('#791 the bobble sequence replays exactly, hash included',
        seq(r1) === seq(r2) && stateHash(r1) === stateHash(r2) && hasEv(r1, 'bobble'))
    const rc = cloneGame(r1); rc.riders[5].bobble = (rc.riders[5].bobble + 3) % 34
    ok('#791 the off-balance wobble rides the replay hash', stateHash(rc) !== stateHash(r1))
}

// ---- 9b. #791 analog steer: edge pressure, not binary twitch -----------------
{
    const RAMP = Math.round(60 / CFG.PRESS)
    ok('#791 the pressure knob is exported and sane', CFG.PRESS >= 6 && CFG.PRESS <= 20)
    const fresh = () => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]; p.x = 0; p.v = 20
        return g
    }

    const g = fresh(); const p = g.riders[0]
    ok('#791 a rider starts with no edge pressure', p.press === 0)
    step(g, { steer: 1 })
    ok('#791 the first frame of a held turn is a shallow bite, not full lock', p.press > 0 && p.press < 1)
    let t = 1
    while (p.press < 1 && t < 60) { step(g, { steer: 1 }); t++ }
    ok('#791 held steer loads the edge fully in ~0.1 s', Math.abs(t - RAMP) <= 1)
    run(g, RAMP + 1)
    ok('#791 releasing lets the edge come back to neutral', p.press < 1e-9)

    const h = fresh(); const q = h.riders[0]
    run(h, RAMP * 2, { steer: 0.5 })
    ok('#791 a half-pressure target holds halfway over — analog, not binary', Math.abs(q.press - 0.5) < 1e-9)

    const deep = fresh(); run(deep, 12, { steer: 1 })
    const shal = fresh(); run(shal, 12, { steer: 0.5 })
    ok('#791 deeper pressure carves a wider line', Math.abs(deep.riders[0].x) > Math.abs(shal.riders[0].x) * 1.4)

    const tap = fresh(); run(tap, 2, { steer: 1 }); run(tap, RAMP + 2)
    ok('#791 a quick tap nips the edge and never locks', tap.riders[0].press < 1e-9 && Math.abs(tap.riders[0].x) < 0.05)

    const s = fresh(); run(s, RAMP * 2, { steer: 9 })
    ok('#791 input saturates at the rail', s.riders[0].press === 1)

    const a = fresh(); const ar = a.riders[0]
    ar.air = true; ar.y = terrainY(a.course, ar.s, ar.x) + 6; ar.vy = 4
    run(a, RAMP + 6, { steer: 1 })
    const binary = CFG.spinRate * (RAMP + 6) / 60
    ok('#791 air rotation is pressure-scaled too', Math.abs(ar.spin) > binary * 0.5 && Math.abs(ar.spin) < binary * 0.9)

    const z1 = fresh(), z2 = fresh()
    run(z1, 10, { steer: 1 }); run(z2, 10, { steer: 1 })
    ok('#791 pressure history rides the replay hash', stateHash(z1) === stateHash(z2) && stateHash(z1) !== stateHash(fresh()))
}

// ---- 9c. #791 slice 6: authentic grabs — the name follows the reach --------
{
    const name = (k) => GRAB_NAMES[k]
    ok('#791 the grab vocabulary is six authentic names', JSON.stringify(GRAB_NAMES) === JSON.stringify(['INDY', 'MUTE', 'METHOD', 'SALISBURY', 'NOSEGRAB', 'TAILGRAB']))
    ok('#791 every grab has its own pose', GRAB_POSES.length === 6 && new Set(GRAB_POSES).size === 6)

    // hand: steer sign at grab picks the reaching hand, stance decides front/back
    ok('#791 front hand + toe = MUTE (regular, steer left)', name(grabKindFor(-0.5, false, false, true)) === 'MUTE')
    ok('#791 back hand + toe = INDY (regular, steer right)', name(grabKindFor(0.5, false, false, true)) === 'INDY')
    ok('#791 back hand + heel press = METHOD', name(grabKindFor(0.5, false, true, true)) === 'METHOD')
    ok('#791 front hand + heel press = SALISBURY', name(grabKindFor(-0.5, false, true, true)) === 'SALISBURY')
    ok('#791 front hand committed forward = NOSEGRAB', name(grabKindFor(-0.5, true, false, true)) === 'NOSEGRAB')
    ok('#791 back hand committed aft = TAILGRAB', name(grabKindFor(0.5, true, false, true)) === 'TAILGRAB')
    ok('#791 goofy mirrors the hands', name(grabKindFor(-0.5, false, false, false)) === 'INDY' && name(grabKindFor(0.5, false, false, false)) === 'MUTE')
    ok('#791 flip commits fore for the front hand, aft for the back — mirrored on goofy',
        name(grabKindFor(0.5, true, false, true)) === 'TAILGRAB' && name(grabKindFor(0.5, true, false, false)) === 'NOSEGRAB' && name(grabKindFor(-0.5, true, false, false)) === 'TAILGRAB')

    // end-to-end: the banked trick name comes from the live inputs, not a cycle
    const air = (inp, pre = 0) => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        p.x = 0; p.v = 20
        if (pre) run(g, pre)
        p.air = true; p.y = terrainY(g.course, p.s, p.x) + 3; p.vy = -1
        run(g, 2, inp)
        run(g, 40)
        const ev = g.events.find((e) => e.type === 'land' && e.who === 0)
        return ev ? ev.name : null
    }
    ok('#791 steering left into the grab banks a MUTE', /MUTE/.test(air({ grab: true, steer: -1 }) || ''))
    ok('#791 steering right into the grab banks an INDY', /INDY/.test(air({ grab: true, steer: 1 }) || ''))
    ok('#791 the same grab at a different tick names the same trick',
        air({ grab: true, steer: 1 }, 60) === air({ grab: true, steer: 1 }))
    ok('#791 heel press renames the same hand reach',
        /METHOD/.test(air({ grab: true, steer: 1, scrub: true }) || '') && /INDY/.test(air({ grab: true, steer: 1 }) || ''))

    const g1 = makeGame('race'); run(g1, 181)
    const g2 = makeGame('race'); run(g2, 181)
    ok('#791 a named grab still rides the replay hash', (() => {
        const setup = (g) => { const p = g.riders[0]; p.x = 0; p.v = 20; p.air = true; p.y = terrainY(g.course, p.s, p.x) + 3; p.vy = -1; return p }
        setup(g1); setup(g2)
        run(g1, 2, { grab: true, steer: -1 }); run(g2, 2, { grab: true, steer: -1 })
        run(g1, 40); run(g2, 40)
        return stateHash(g1) === stateHash(g2)
    })())
}

// ---- 9d. #791 attract hotness: the demo throws OVERs visibly ----------------
{
    ok('#791 the attract fuel knob is exported and sane', CFG.attractFuel >= 10 && CFG.attractFuel <= 60)
    const heat1 = (hot, hashes = false) => {
        const g = makeGame('race')
        let overs = 0, crashes = 0, fullTakeoffs = 0, takeoffs = 0, maxScore = 0, t = 0
        const hs = []
        while (!g.end && g.heat === 0 && t < 400000) {
            step(g, g.phase === 'run' ? (hot ? decide(g, g.riders[0], true) : decide(g, g.riders[0])) : {})
            const p = g.riders[0]
            maxScore = Math.max(maxScore, p.score)
            if (hashes && t % 500 === 0) hs.push(stateHash(g))
            for (const e of g.events) {
                if (e.type === 'jump' && e.who === 0) { takeoffs++; if (p.meter >= 100) fullTakeoffs++ }
                if (e.type === 'land' && e.who === 0 && e.over) overs++
                if (e.type === 'crash' && e.who === 0) crashes++
            }
            g.events.splice(0)
            t++
        }
        return { overs, crashes, fullTakeoffs, takeoffs, maxScore, hs }
    }
    const cold = heat1(false)
    const hot = heat1(true, true)
    ok('#791 the race economy is untouched — the cold witness arrives short at the lips',
        cold.fullTakeoffs <= 2 && cold.overs <= 1)
    ok('#791 the hot demo arrives OVER at almost every lip', hot.fullTakeoffs >= hot.takeoffs - 2)
    ok('#791 the hot demo banks doubled OVER pay — visibly hotter than the race line',
        hot.overs >= 4 && hot.overs > cold.overs * 2 && hot.maxScore > cold.maxScore)
    ok('#791 the hot demo rides clean — hot, not sloppy', hot.crashes === 0)
    const hot2 = heat1(true, true)
    ok('#791 the hot attract demo replays hash-for-hash', hot.hs.join(',') === hot2.hs.join(','))
}

// ---- 9d. #791 landing impact drives the body: stomp pose + sized burst ----
{
    const drop = (h, vy) => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        p.x = 0; p.v = 8
        p.air = true; p.airT = 0.9   // rollers hang long enough to bank (base ≥ 60)
        p.y = terrainY(g.course, p.s, p.x) + h
        p.vy = vy
        const evs = []
        let t = 0
        while (!evs.some((e) => e.type === 'land') && t < 180) { step(g, {}); evs.push(...g.events.splice(0)); t++ }
        const e = evs.find((x) => x.type === 'land')
        const st = p.stomp
        t = 0
        while (p.stomp > 0 && t < 300 && !p.air) { step(g, {}); t++ }
        return { e, st, zeroed: p.stomp === 0 }
    }
    const soft = drop(0.35, -1)
    const hard = drop(6, -2)
    ok('#791 a touchdown reports finite impact, harder falls hit bigger',
        !!soft.e && !!hard.e && Number.isFinite(soft.e.impact) && Number.isFinite(hard.e.impact) && hard.e.impact > soft.e.impact + 4)
    ok('#791 the body stomps on touchdown — harder landings stomp deeper and longer',
        soft.st > 0 && hard.st > soft.st)
    ok('#791 the stomp is a beat, not a state — it relaxes back to stand',
        soft.zeroed && hard.zeroed && soft.st > 0 && hard.st > soft.st)
    ok('#791 a rider cruising the snow carries no stomp',
        (() => { const g = makeGame('race'); run(g, 240); return g.riders[0].stomp === 0 })())
    ok('#791 a bail never stomps — the tumble owns the body', (() => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        p.x = 0; p.v = 8; p.air = true; p.airT = 0.5
        p.y = terrainY(g.course, p.s, p.x) + 5; p.vy = -2
        p.flip = 200
        let t = 0
        while (!hasEv(g, 'crash') && t < 180) { step(g, {}); t++ }
        return hasEv(g, 'crash') && p.stomp === 0
    })())
    ok('#791 a takeoff clears any stomp still ringing', (() => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        p.stomp = 12; p.stompPow = 0.8
        step(g, { jump: true })
        step(g, {})
        return p.air === true && p.stomp === 0
    })())
    const wit = autopilot(makeGame('race'))
    const lands = wit.events.filter((e) => e.type === 'land')
    ok('#791 every banked landing of a full race carries its impact',
        lands.length >= 10 && lands.every((e) => Number.isFinite(e.impact) && e.impact >= 0))
    ok('#791 impact + stomp ride the replay hash', stateHash(wit) === stateHash(autopilot(makeGame('race'))))
}

// ---- 9e. #791 boost is a sustained rising engine, not a one-shot whine ------
{
    ok('#791 the boost-rev knob is exported and sane', CFG.boostRev >= 0.2 && CFG.boostRev <= 3)
    const fresh = () => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]; p.x = 0; p.v = 20; p.meter = 100
        return g
    }

    const g = fresh(); const p = g.riders[0]
    ok('#791 a cold rider idles — the engine bed starts at rest', p.boostHum === 0)

    step(g, { boost: true })
    ok('#791 the first frame of a held boost is a kick, not redline', p.boostHum > 0 && p.boostHum < 1)

    const climb = [p.boostHum]
    let topped = -1
    for (let t = 1; t < 120 && p.meter > 0; t++) {
        step(g, { boost: true })
        climb.push(p.boostHum)
        if (p.boostHum >= 1 && topped < 0) topped = t
    }
    let mono = true
    for (let i = 1; i < climb.length; i++) if (climb[i] < climb[i - 1] - 1e-9) mono = false
    ok('#791 the pitch climbs every frame the Shift stays down — a rising engine', mono)
    ok('#791 held boost winds up to the redline', topped >= 0)
    const REV_FRAMES = Math.round(60 / CFG.boostRev)
    ok('#791 the wind-up takes ~1/rev seconds, then holds', Math.abs(topped - REV_FRAMES) <= 2 && p.boostHum === 1)
    ok('#791 the redline is a ceiling, not a runaway — it saturates at 1', climb.every((h) => h <= 1))

    step(g, {})
    ok('#791 letting go cuts the engine back to idle', p.boost === false && p.boostHum === 0)

    step(g, { boost: true })
    ok('#791 a fresh hold re-kicks from the floor, not mid-pitch', p.boostHum > 0 && p.boostHum < 0.05)

    const h = fresh(); run(h, 40, { boost: true })
    const b = fresh(); run(b, 40)
    const h2 = fresh(); run(h2, 40, { boost: true })
    ok('#791 the engine rev rides the replay hash — same hold, same hum',
        h.riders[0].boostHum > 0 && h.riders[0].boostHum === h2.riders[0].boostHum && stateHash(h) === stateHash(h2))
    ok('#791 the rev changes the run — a boosted line hashes apart from a coasted one',
        stateHash(h) !== stateHash(b))
}

// ---- 9f. #791 slice 9: revert — land spun against the takeoff carve --------
{
    ok('#791 the revert knobs are exported and sane',
        CFG.revertPts >= 100 && CFG.revertPts <= 400 && CFG.revertTake >= 0.1 && CFG.revertTake <= 0.5 && CFG.revertSpin >= 60 && CFG.revertSpin <= 240)

    const launch = (steerHeld) => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]; p.x = 0; p.v = 20
        run(g, 10, { steer: steerHeld, jump: true })
        step(g, {})
        return p
    }
    ok('#791 a carve-loaded takeoff signs the board', launch(1).takeSpin === 1 && launch(-1).takeSpin === -1)
    ok('#791 a straight takeoff owns no direction', launch(0).takeSpin === 0)

    const drop = (takeSpin, spin) => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        p.x = 0; p.v = 8
        p.air = true; p.airT = 0.9
        p.takeSpin = takeSpin; p.spin = spin
        p.y = terrainY(g.course, p.s, p.x) + 4; p.vy = -2
        let t = 0
        while (!hasEv(g, 'land') && t < 180) { step(g, {}); t++ }
        return { e: g.events.find((x) => x.type === 'land'), meter: p.meter, takeSpin: p.takeSpin }
    }
    const back = drop(1, 240)
    const rev = drop(1, -240)
    ok('#791 spinning against the takeoff carve banks a REVERT',
        !!rev.e && rev.e.revert === true && /REVERT/.test(rev.e.name))
    ok('#791 spinning with the carve is just a spin — no revert',
        !!back.e && !back.e.revert && !/REVERT/.test(back.e.name))
    ok('#791 the revert pays its bonus on top of the same spin — nothing else',
        !!rev.e && !!back.e && rev.e.pts - back.e.pts === CFG.revertPts)
    ok('#791 the revert is style, not fuel — the bonus never feeds the boost meter',
        !!rev.e && !!back.e && Math.abs(rev.meter - back.meter) < 1e-9)
    const weak = drop(1, -60)
    ok('#791 a small opposite wiggle does not revert', !!weak.e && !weak.e.revert)
    const flat = drop(0, -240)
    ok('#791 an unloaded takeoff has nothing to revert', !!flat.e && !flat.e.revert)
    ok('#791 landing forgets the carve — the next jump starts clean', rev.takeSpin === 0)
    {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        p.x = 0; p.v = 8; p.air = true; p.airT = 0.9; p.takeSpin = 1; p.spin = -300; p.flip = 200
        p.y = terrainY(g.course, p.s, p.x) + 5; p.vy = -2
        let t = 0
        while (!hasEv(g, 'crash') && t < 180) { step(g, {}); t++ }
        ok('#791 a bail eats the revert with the rest of the trick',
            hasEv(g, 'crash') && p.takeSpin === 0 && !hasEv(g, 'land', (e) => e.revert))
    }
    const hs = (takeSpin, spin) => {
        const g = makeGame('race'); run(g, 181)
        const p = g.riders[0]; p.x = 0; p.v = 8; p.air = true; p.airT = 0.9
        p.takeSpin = takeSpin; p.spin = spin
        p.y = terrainY(g.course, p.s, p.x) + 4; p.vy = -2
        run(g, 60)
        return stateHash(g)
    }
    ok('#791 the carve and the revert ride the replay hash',
        hs(1, -240) === hs(1, -240) && hs(1, -240) !== hs(1, 240))
    {
        const g = makeGame('race')
        let reverts = 0, crashes = 0, t = 0
        while (!g.end && g.heat === 0 && t < 400000) {
            step(g, g.phase === 'run' ? decide(g, g.riders[0], true) : {})
            for (const e of g.events) {
                if (e.type === 'land' && e.who === 0 && e.revert) reverts++
                if (e.type === 'crash' && e.who === 0) crashes++
            }
            g.events.splice(0)
            t++
        }
        ok('#791 the hot attract demo throws REVERTs visibly — and lands them clean', reverts >= 2 && crashes === 0)
    }
}

// ---- #791 slice 11: wind + crowd life ----------------------------------------
// The face is never frozen: every flag rides one deterministic wind field, and
// the finish grandstands hop as the line comes up. Pure art.js functions — the
// sim is untouched — so the gates are pure too.
{
    let lo = 1, hi = 0, sum = 0, sum2 = 0, m = 0
    for (let t = 0; t < 6000; t++) {
        for (const s of [0, 37.3, 91.5, 240, 512]) {
            const w = windAt(t, s)
            lo = Math.min(lo, w); hi = Math.max(hi, w); sum += w; sum2 += w * w; m++
        }
    }
    ok('#791 the wind field stays inside [0,1]', lo >= 0 && hi <= 1)
    ok('#791 the wind actually breathes — gust + ripple give real variance',
        Math.sqrt(sum2 / m - (sum / m) ** 2) > 0.12)
    ok('#791 the wind is deterministic', windAt(1234, 88.25) === windAt(1234, 88.25))
    ok('#791 the gust travels — far-apart points at one tick differ',
        Math.abs(windAt(900, 0) - windAt(900, 160)) > 1e-3)

    let lmax = 0, bounded = true
    for (let t = 0; t < 3000; t++) {
        const sw = flagSway(t, 0.7, 64)
        lmax = Math.max(lmax, Math.abs(sw.lean))
        if (sw.stretch < 0.85 || sw.stretch > 1.15 || Math.abs(sw.lean) > 0.16) bounded = false
    }
    ok('#791 flag lean is a bend, not a breakage (|lean| ≤ 0.16 rad, stretch ±15%)', bounded)
    ok('#791 flags lean hard when the wind blows', lmax >= 0.05)
    ok('#791 neighbouring flags are out of phase — the line never claps in unison',
        flagSway(777, 0, 40).lean !== flagSway(777, 1.9, 40).lean)
    {
        const series = []
        for (let t = 0; t < 2400; t++) series.push([windAt(t, 200), Math.abs(flagSway(t, 0.3, 200).lean)])
        series.sort((a, b) => b[0] - a[0])
        let hiSum = 0, loSum = 0
        for (let i = 0; i < 240; i++) hiSum += series[i][1]
        for (let i = series.length - 240; i < series.length; i++) loSum += series[i][1]
        ok('#791 gustier ticks lean deeper on average — the flags read the wind', hiSum > loSum * 1.5)
    }

    const A = crowdPlan(3), B = crowdPlan(9)
    ok('#791 every grandstand packs the tiers — 12+ spectators, three rows',
        A.length >= 12 && new Set(A.map((b) => b.y.toFixed(2))).size === 3)
    ok('#791 seats are seeded, not gridded — two stands differ',
        A.length !== B.length || A.some((b, i) => b.x !== B[i].x || b.c !== B[i].c))
    ok('#791 the crowd wears a kit, not one colour', new Set(A.map((b) => b.c)).size >= 4)
    ok('#791 a stand rebuilds identically — replay-safe crowds',
        JSON.stringify(crowdPlan(3)) === JSON.stringify(crowdPlan(3)))

    let hopMax = 0, allZero = true
    for (let t = 0; t < 3000; t++) {
        if (crowdHop(t, A[0], 0) !== 0) allZero = false
        hopMax = Math.max(hopMax, crowdHop(t, A[0], 1))
    }
    ok('#791 far up the face the seats stay still — hype 0 is seated', allZero)
    ok('#791 hype has hop in it, bounded by the crowd constant',
        hopMax > 0.08 && hopMax <= CROWD.hop + 1e-9)
    ok('#791 no two spectators land on the same beat', crowdHop(512, A[0], 1) !== crowdHop(512, A[1], 1))
    ok('#791 hype: full at the line, dead far up, monotone, symmetric through the finish',
        crowdHype(500, 520) === 1 && crowdHype(0, 520) === 0 &&
        crowdHype(520, 500) === crowdHype(500, 520) &&
        crowdHype(420, 500) > crowdHype(320, 500))
    {
        const fm = { rotation: { z: 0 }, scale: { x: 1 } }
        const cm = { position: { y: 0.91 }, rotation: { z: 0 } }
        const grp = {
            userData: {
                anim: {
                    flags: [{ m: fm, s: 120, phase: 0.4, baseZ: 0, baseS: 1 }],
                    crowd: [{ m: cm, y0: 0.91, b: crowdPlan(3)[0] }],
                },
            },
        }
        const n1 = animateDecor(grp, 1234, 1)
        const n2 = animateDecor(grp, 1290, 1)
        ok('#791 the frame animator drives both tag lists and counts them',
            n1 === 2 && n2 === 2 && (fm.rotation.z !== 0 || fm.scale.x !== 1) && cm.position.y >= 0.91)
        ok('#791 a world with no shelf attached degrades whole — zero touched',
            animateDecor({ userData: {} }, 10, 1) === 0)
    }
}

{ // #791 slice 12: the invert — a grabbed board rolled about its long axis
    const airInvert = (opts = {}) => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        Object.assign(p, { air: true, y: terrainY(g.course, p.s, p.x) + 8, vy: 1.5, spin: 0, flip: 0, grab: 0, over: false, invert: 0, invertSign: 1, press: opts.press || 0 })
        let t = 0
        while (p.air && t < 400) {
            if (opts.hold && t >= (opts.hold[0] || 0) && t < (opts.hold[1] ?? 400)) step(g, { grab: true, invert: true })
            else step(g, opts.press !== undefined ? {} : {})
            t++
        }
        return { g, p, e: g.events.find((ev) => (ev.type === 'land' || ev.type === 'crash') && ev.who === 0) }
    }
    const nike = airInvert({ hold: [0, 60] })
    ok('#791 a held grab+invert rolls the board and lands a named NIKE INVERT',
        nike.e && nike.e.type === 'land' && /NIKE INVERT/.test(nike.e.name) && nike.e.invert === 1)
    ok('#791 the invert pays its rotation (≥ 400)', nike.e && nike.e.pts >= 400)
    const solid = airInvert({ press: -0.9, hold: [0, 60] })
    ok('#791 steering left at the shove names the SOLID direction',
        solid.e && solid.e.type === 'land' && /SOLID INVERT/.test(solid.e.name) && solid.p.invertSign === -1)
    const half = airInvert({ hold: [0, 33] })   // 33 × 7° = 231° — past the escape hatch, short of the window
    ok('#791 a half-done invert eats it — invertCheck is law like flipCheck',
        half.e && half.e.type === 'crash' && half.p.tumble > 0)
    const nograb = (() => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        Object.assign(p, { air: true, y: terrainY(g.course, p.s, p.x) + 8, vy: 1.5, spin: 0, flip: 0, grab: 0, over: false, invert: 0 })
        let t = 0; while (p.air && t < 400) { step(g, { invert: true }); t++ }
        const e = g.events.find((ev) => ev.type === 'land')
        ok('#791 hands off the board, no invert: V alone never rolls it',
            p.invert === 0 && e && !/INVERT/.test(e.name))
        return e ? e.pts : 0
    })()
    ok('#791 the invert scores on top of the same air with hands off (Δ ≥ 400)',
        nike.e.pts - nograb >= 400)
    const invHash = () => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        Object.assign(p, { air: true, y: terrainY(g.course, p.s, p.x) + 8, vy: 1.5, spin: 0, flip: 0, grab: 0, over: false, invert: 0 })
        let t = 0; while (p.air && t < 400) { step(g, { grab: true, invert: true }); t++ }
        return stateHash(g)
    }
    ok('#791 the invert rolls identically on replay — and hashes apart from hands-off',
        invHash() === invHash() && invHash() !== stateHash((() => { const g = makeGame('race'); run(g, 181); clear(g); return g })()))
}

// ---- #894 analogue touch stick (Jon's #873 answer: use analogue) ----------
{
    ok('#894 tilt law: forward commits FRONT (2), back commits BACK (1), neutral nothing',
        flipDirFromTilt(-1) === 2 && flipDirFromTilt(1) === 1 && flipDirFromTilt(0) === 0)
    ok('#894 the flip commits at the threshold, not before',
        flipDirFromTilt(-(STICK_TILT.flip - 0.05)) === 0 && flipDirFromTilt(-STICK_TILT.flip) === 2 &&
        flipDirFromTilt(STICK_TILT.flip) === 1 && flipDirFromTilt(STICK_TILT.flip - 0.05) === 0)
    ok('#894 the law is odd-symmetric and saturates both ends',
        flipDirFromTilt(-0.77) === flipDirFromTilt(-1) && flipDirFromTilt(0.77) === flipDirFromTilt(1))
    ok('#894 body tilt splits tuck/scrub around a neutral band',
        bodyFromTilt(-0.9).tuck && !bodyFromTilt(-0.9).scrub &&
        bodyFromTilt(0.9).scrub && !bodyFromTilt(0.9).tuck &&
        !bodyFromTilt(-(STICK_TILT.body - 0.1)).tuck && !bodyFromTilt(0).scrub)
    // sim integration: the direction the tilt commits must reach the trick
    // ledger with the right sign — front rotates negative, back positive.
    const airFlipPeak = (dir) => {
        const g = makeGame('race'); run(g, 181); clear(g)
        const p = g.riders[0]
        Object.assign(p, { air: true, y: terrainY(g.course, p.s, p.x) + 8, vy: 1.5, spin: 0, flip: 0, grab: 0, over: false, invert: 0 })
        let peak = 0, t = 0
        while (p.air && t < 400) { step(g, { flip: dir }); if (p.air) peak = p.flip; t++ }
        return peak
    }
    const frontPeak = airFlipPeak(flipDirFromTilt(-0.9))
    const backPeak = airFlipPeak(flipDirFromTilt(0.9))
    ok('#894 a tilt-committed FLIP rotates the ledger FRONT, not back',
        frontPeak < -20 && backPeak > 20, `front ${frontPeak.toFixed(0)} back ${backPeak.toFixed(0)}`)
    const src = readFileSync(join(SRC_DIR, 'games', 'SSX', 'index.jsx'), 'utf8')
    ok('#894 the pad mounts a physical stick (base + knob)',
        /data-ssx-stick="1"/.test(src) && /data-ssx-stick-knob="1"/.test(src))
    ok('#894 the discrete FRNT touch button is gone — tilt picks the direction',
        !src.includes("'FRNT', 'KeyC'") && /flipDirFromTilt\(tiltY\) \|\| 1 : 1/.test(src))
    ok('#894 stick depth outranks the canvas drag on the steer line',
        /steer: tiltActive \? tiltX : dragSteer !== null/.test(src))
    ok('#894 tilt reaches the body verbs beside the arrows',
        /bodyFromTilt\(tiltY\)\.tuck/.test(src) && /bodyFromTilt\(tiltY\)\.scrub/.test(src))
}

// #828 (Jon, pad + pause): source gates on the input layer of index.jsx —
// '?' pauses whatever layout delivers it (key === '?' needs no shiftKey; a
// non-US keyboard or synthesized event used to fall through to keys.add), and
// the physical stick rides the analog steer line beside the canvas drag.
{
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/games/SSX/index.jsx'), 'utf8')
    ok(/e\.key === '\?' \? 'Question'/.test(src), '#828 "?" pauses by key, not only shift+Slash (layout-proof pause)')
    ok(/import \{ padState \}/.test(src) && /padState\.engaged \? padState\.x/.test(src),
        '#828 left stick analog steer: index.jsx reads padState.x on the steer line')
}

// ---- #904 (Jon, phone): flips somersault front/back, inverts/carves roll ----
// The rig is root -> yaw -> roll (art.js); the board is built long-axis = local
// x, up = +y. A FRONT/BACK somersault swings the nose into the vertical plane of
// travel = a rotation about z; a board-roll (invert, rail-up carve) keeps the nose
// level and tips the deck edge-first = about x. The old code had these swapped, so
// committing a flip tipped the board left/right — Jon: "flips are around the wrong
// axes — left/right instead of front/back." These gates read the posed board's real
// world axes, so they go red if flip/invert ever trade places again.
{
    const q = new THREE.Quaternion()
    const nose = new THREE.Vector3()
    const up = new THREE.Vector3()
    const posed = (r) => {
        const rig = makeRider(0xffffff)
        rig.userData.yaw.rotation.set(0, 0, 0)
        poseRider(rig, r, 0)
        rig.updateMatrixWorld(true)
        const rot = rig.userData.roll.getWorldQuaternion(q)
        nose.set(1, 0, 0).applyQuaternion(rot)
        up.set(0, 1, 0).applyQuaternion(rot)
        return { noseY: nose.y, noseZ: nose.z, upZ: up.z }
    }
    const AIR = { tumble: 0, crouch: false, tuck: false, grab: false, grabKind: 0, steerSm: 0 }
    const f = posed({ ...AIR, air: true, flip: 90, invert: 0 })
    ok('#904 a flip pitches the nose into the vertical plane — a FRONT/BACK somersault about z',
        Math.abs(f.noseY) > 0.5 && Math.abs(f.noseZ) < 0.3)
    const iv = posed({ ...AIR, air: true, flip: 0, invert: 90 })
    ok('#904 an invert keeps the nose level and tips the deck on its edge — a board-roll about x',
        Math.abs(iv.noseY) < 0.15 && Math.abs(iv.upZ) > 0.5)
    const cv = posed({ ...AIR, air: false, flip: 0, invert: 0, steerSm: 1 })
    ok('#904 carving lifts a rail while the nose stays down the fall line — tilt about x',
        Math.abs(cv.noseY) < 0.1 && Math.abs(cv.upZ) > 0.1)
}

console.log(`\n${pass}/${pass + fail} ${fail ? 'FAILURES: ' + fail : 'PASS'}`)
process.exit(fail ? 1 : 0)
