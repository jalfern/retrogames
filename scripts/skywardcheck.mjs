// skywardcheck — SKYWARD / Gullwing Isle (issue #3105 rung 1), audited in
// plain Node against the SAME sim.js + planner.js the tab runs (zero DOM,
// zero Math.random). Expectations are literal numbers, not the sim's own
// constants — a check that imports the number it audits cannot see the
// number change (the TETRIS lesson).
//
//   npm run skywardcheck              geometry, rules, graduation, determinism
//   npm run skywardcheck -- --mutate  prove the pins can feel pain

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { makeGame, step, checkout, stateOf, stormBed, stormCue, engineBed, engineCue, windBed, sockPose, stripZone, stripScore, planeTouch, beltTouch, planeGoAround, scuffTell } from '../src/games/Skyward/sim.js'
import { decide } from '../src/games/Skyward/planner.js'
import { plant, pull } from './lib/mutateguard.mjs'
import { Report } from './lib/harness.mjs'

const SELF = fileURLToPath(import.meta.url)
const SIMF = 'src/games/Skyward/sim.js'
const WORLDF = 'src/games/Skyward/world.js'
const r = new Report('skywardcheck')
r.info('boot', 'sim.js + planner.js imported in Node, zero DOM, zero Math.random')

const drive = (g, pad = {}, n = 1) => { for (let i = 0; i < n; i++) step(g, pad); return g }
const clear = (g) => { const e = [...g.events]; g.events.length = 0; return e }
const runAuto = (g, cap) => { let n = 0; while (n < cap) { step(g, decide(g)); g.events.length = 0; n++; if (g.done) break }; return n }
void runAuto

// ---------------------------------------------------------- geometry ----
{
    const g = makeGame(7)
    const w = g.world
    r.check('free-flight spawn is airborne over the bay', g.p.y > 20 && w.terrainHeight(g.p.x, g.p.z) < 1 && w.waterHeightAt(g.p.x, g.p.z, 0) > -1, `y=${g.p.y}`)
    r.check('the ring line runs south over open water, 8 rings, z strictly increasing',
        w.rings.length === 8 && w.rings.every((ring, i) => w.terrainHeight(ring.x, ring.z) < -2 && (i === 0 || ring.z > w.rings[i - 1].z) && ring.y > 6 && ring.y < 20))
    const padH = w.terrainHeight(w.pad.x, w.pad.z)
    r.check('the spot-landing pad is dry sand, 2–3 m up', padH > 1.5 && padH < 3.5, `h=${padH.toFixed(1)}`)
    r.check('every drop target sits on dry ground below 4 m',
        w.targets.every((t) => { const h = w.terrainHeight(t.x, t.z); return h > 0.4 && h < 4 }),
        w.targets.map((t) => w.terrainHeight(t.x, t.z).toFixed(1)).join(','))
    r.check('the belt corridor stays low between the dock and every target', (() => {
        const pts = [{ x: w.school.x + 30, z: w.school.z + 40 }, ...w.targets]
        for (let i = 0; i < pts.length - 1; i++) {
            for (let s = 0; s <= 10; s++) {
                const x = pts[i].x + (pts[i + 1].x - pts[i].x) * s / 10
                const z = pts[i].z + (pts[i + 1].z - pts[i].z) * s / 10
                if (w.terrainHeight(x, z) > 6) return false
            }
        }
        return true
    })())
    r.check('the glider launch sits on high ground (saddle), north of the pad',
        w.terrainHeight(w.launch.x, w.launch.z) > 40 && w.launch.z < w.pad.z - 200)
    r.check('the storm cell sits offshore, clear of the courses',
        w.terrainHeight(w.storm.x, w.storm.z) < 0 && Math.hypot(w.storm.x - w.targets[0].x, w.storm.z - w.targets[0].z) > 200)
    r.check('the Gerstner emit carries the same wave count the sim rides',
        (w.waterGLSL().match(/vec4\(/g) || []).length === w.waves.length)
}

// -------------------------------------------------------- core rules ----
{
    const g = makeGame(11)
    checkout(g, 'ring')
    const r0 = g.world.rings[0]
    g.p = { x: r0.x, y: r0.y, z: r0.z }
    step(g, {})
    const evs = clear(g)
    r.check('passing the ACTIVE ring scores and advances the gate',
        g.ringsPassed === 1 && evs.some((e) => e.kind === 'ring' && e.idx === 1))
    // ring 2 ahead, ring 5 well behind: touching a dead ring must not score
    g.p = { x: g.world.rings[4].x, y: g.world.rings[4].y, z: g.world.rings[4].z }
    step(g, {})
    r.check('a non-active ring never scores (sequence law)', g.ringsPassed === 1)
    // clean sweep + finish
    for (let i = 1; i < 8; i++) { const ri = g.world.rings[i]; g.p = { x: ri.x, y: ri.y, z: ri.z }; step(g, {}) }
    clear(g)
    r.check('all 8 rings finish the event with 800 + a time bonus (≤1000)',
        g.grad.ring != null && g.grad.ring >= 800 && g.grad.ring <= 1000 && g.phase === 'free', `ring=${g.grad.ring}`)

    const h2 = makeGame(12)
    checkout(h2, 'spot')
    const w = h2.world
    h2.p = { x: w.pad.x + 1, y: w.terrainHeight(w.pad.x, w.pad.z) + 0.72, z: w.pad.z + 1 }
    h2.vy = -1
    h2.speed = 9
    step(h2, {})
    clear(h2)
    r.check('a soft touch on the bullseye scores 1000', h2.grad.spot === 1000, `got ${h2.grad.spot}`)

    const h3 = makeGame(12)
    checkout(h3, 'spot')
    const hx = w.pad.x + 20, hz = w.pad.z + 6
    h3.p = { x: hx, y: Math.max(w.terrainHeight(hx, hz), 0.5) + 0.66, z: hz }
    h3.vy = -1
    h3.speed = 9
    step(h3, {})
    clear(h3)
    r.check('the same touch 21 m off the centre scores the 200 band', h3.grad.spot === 200, `got ${h3.grad.spot}`)

    const h4 = makeGame(14)
    checkout(h4, 'spot')
    h4.p = { x: 20, y: Math.max(w.terrainHeight(20, 260), w.waterHeightAt(20, 260, h4.t)) - 0.1, z: 260 }
    h4.vy = -2
    h4.speed = 9
    step(h4, {})
    const h4ev = clear(h4)
    r.check('touching the sea is a splash, not a landing (back to the saddle)',
        h4.grad.spot == null && h4ev.some((e) => e.kind === 'splash') && h4.respawnT > 0)

    // #3302 — the SECOND STRIP: runway landings, zone-scored Pilotwings-style
    // (farther down pays more). Literal numbers throughout, per house law.
    const stripLand = (s, x, z, heading, vy, speed) => {
        const h = makeGame(s)
        checkout(h, 'spot')
        // y off THIS seed's ground — shoulders blend seed-noise, only the
        // core deck is exact, so the spawn must read the game's own world
        h.p = { x, y: h.world.terrainHeight(x, z) + 0.6, z }
        h.heading = heading; h.vy = vy; h.speed = speed; h.roll = 0; h.pitch = 0
        step(h, {})
        return { h, evs: clear(h) }
    }
    {
        const deep = stripLand(21, 120, 130, Math.PI / 2, -1, 10)
        r.check('touching down deep on the strip pays FULL STRIP 700',
            deep.h.grad.spot === 700 && deep.evs.some((e) => e.kind === 'land' && e.strip === true && e.zone === 4 && e.aligned === true),
            `got ${deep.h.grad.spot}`)
        const short = stripLand(22, -10, 130, Math.PI / 2, -1, 10)
        r.check('a short touchdown (first quarter) pays 150',
            short.h.grad.spot === 150 && short.evs.some((e) => e.kind === 'land' && e.zone === 1), `got ${short.h.grad.spot}`)
        const mid = stripLand(23, 40, 130, Math.PI / 2, -1, 10)
        r.check('the second quarter pays 300', mid.h.grad.spot === 300, `got ${mid.h.grad.spot}`)
        const lng = stripLand(24, 85, 130, Math.PI / 2, -1, 10)
        r.check('the third quarter pays 450', lng.h.grad.spot === 450, `got ${lng.h.grad.spot}`)
        const crab = stripLand(25, 120, 130, Math.PI / 2 + 0.45, -1, 10)
        r.check('crabbed onto the strip past ~17° is a scuff, not a zone',
            crab.h.grad.spot === 60 && crab.evs.some((e) => e.kind === 'land' && e.aligned === false), `got ${crab.h.grad.spot}`)
        const hot = stripLand(26, 120, 130, Math.PI / 2, -1, 14)
        r.check('a fast arrival on the strip still tumbles like anywhere else',
            hot.h.grad.spot == null && hot.evs.some((e) => e.kind === 'tumble') && hot.h.respawnT > 0)
        const beside = stripLand(27, 120, 138.5, Math.PI / 2, -1, 10)
        r.check('a soft touch beside the strip is sand, not runway (the mat law pays 60)',
            beside.h.grad.spot === 60 && beside.evs.some((e) => e.kind === 'land' && e.strip === undefined))

        const zn = stripZone(w, 50, 130)
        r.check('stripZone: the middle of the strip reads u 80 at half distance',
            zn !== null && zn.u === 80 && Math.abs(zn.frac - 0.5) < 1e-9)
        r.check('stripZone: half a metre outside the edge line is off',
            stripZone(w, 120, 136.9) !== null && stripZone(w, 120, 137.1) === null)
        r.check('stripZone: past either end is off',
            stripZone(w, 151, 130) === null && stripZone(w, -31, 130) === null)
        const al = stripScore(w, 120, 130, Math.PI / 2 + 0.29, -1, 10)
        const notal = stripScore(w, 120, 130, Math.PI / 2 + 0.31, -1, 10)
        r.check('alignment: ±0.29 rad still pays the zone, ±0.31 crabbs it to 60',
            al.score === 700 && al.aligned === true && notal.score === 60 && notal.aligned === false)
        r.check('a hard arrival is not the strip\'s business (null — the tumble law owns it)',
            stripScore(w, 120, 130, Math.PI / 2, -4.3, 10) === null && stripScore(w, 120, 130, Math.PI / 2, -1, 12.5) === null)

        let bad = 0
        for (const s of [1, 7, 42, 99, 123, 4242, 99991]) {
            const ww = makeGame(s).world
            for (let i = 0; i <= 32; i++) {
                const x = -30 + 5 * i // −30..130, the straight core
                for (const zz of [123.5, 130, 136.5]) if (Math.abs(ww.terrainHeight(x, zz) - 2.6) > 0.01) bad++
            }
            for (let t = 0; t < 400; t += 0.5) if (ww.stormAt(130, 137, t).s > 0.02) bad++
        }
        r.check('the strip deck is exact 2.6 m and storm-free across seeds and sweeps', bad === 0, `bad=${bad}`)
        r.check('no bullseye point lies on the strip (the mat keeps its court)', (() => {
            for (let a = 0; a < Math.PI * 2; a += 0.1) {
                if (stripZone(w, w.pad.x + Math.cos(a) * 24, w.pad.z + Math.sin(a) * 24) !== null) return false
            }
            return true
        })())

        const BANDS = new Set([1000, 700, 450, 200, 60])
        let autoStrip = 0, outside = 0
        for (const s of [1, 7, 42, 99, 123]) {
            const h = makeGame(s)
            checkout(h, 'spot')
            let n = 0
            while (h.grad.spot == null && n++ < 20000) {
                for (const e of h.events) if (e.kind === 'land' && e.strip) autoStrip++
                h.events.length = 0
                step(h, decide(h))
                if (h.done) break
            }
            if (!BANDS.has(h.grad.spot)) outside++
        }
        r.check('honesty: the autopilot still flies the mat — it never takes the strip (5 seeds)',
            autoStrip === 0 && outside === 0, `strip=${autoStrip} bands=${outside}`)

        const hst = makeGame(33)
        checkout(hst, 'spot')
        hst.p = { x: 60, y: 10, z: 130 }
        const st2 = stateOf(hst)
        r.check('stateOf: the glider reports its strip position (u 90 mid-strip), plain JSON',
            st2.strip !== null && st2.strip.u === 90 && JSON.stringify(st2).length > 10)
        r.check('stateOf: a non-glider craft never reports a strip', stateOf(makeGame(33)).strip === null)
    }

    const h5 = makeGame(15)
    checkout(h5, 'drop')
    const t0 = h5.world.targets[0]
    h5.p = { x: t0.x, y: h5.world.terrainHeight(t0.x, t0.z) + 8, z: t0.z }
    h5.vel = { x: 0, y: 0, z: 0 }
    h5.vy = 0
    h5.speed = 0
    step(h5, { b: true })
    let guard = 0
    while (h5.crates.length && guard++ < 240) step(h5, {})
    clear(h5)
    r.check('a still-hover drop over the target scores in the top two bands',
        h5.dropped.length === 1 && h5.dropped[0].score >= 222, JSON.stringify(h5.dropped))

    const h6 = makeGame(16)
    drive(h6, { a: true }, 30)
    r.check('in free flight the throttle button near nothing never invents an event', h6.phase === 'free')
}

// ------------------------------------------------- thunderpass (rung 2) ----
{
    const g = makeGame(7)
    const w = g.world
    r.check('the thunderpass line drives east through the cell, 5 gates, all over open sea',
        w.passRings.length === 5 && w.passRings.every((p, i) => w.terrainHeight(p.x, p.z) < -2 && (i === 0 || p.x > w.passRings[i - 1].x) && p.y > 8 && p.y < 32)
        && Math.hypot(w.passStart.x - w.storm.x, w.passStart.z - w.storm.z) > w.storm.r)
    r.check('the storm is REAL for the plane: held at the core it sinks, in fair air it does not', (() => {
        // 3 s window: the core pull is ~1.3 m/s net under the buffet bob,
        // a 1 s read is inside the noise (gusts lift the hull between hits)
        const sink = (x, z) => {
            const h = makeGame(21)
            h.p = { x, y: 30, z }
            h.heading = Math.PI / 2; h.pitch = 0; h.roll = 0; h.speed = 38; h.vy = 0
            const y0 = h.p.y
            for (let i = 0; i < 180; i++) step(h, {})
            return y0 - h.p.y
        }
        const cp = w.stormPos(0) // #3267: the core is wherever the cell STANDS, not the old anchor
        const core = sink(cp.x, cp.z)
        const fair = sink(0, -600)
        return core > 2.0 && Math.abs(fair) < 0.5
    })())

    checkout(g, 'pass')
    r.check('checkout puts the plane eastbound at the front of the cell',
        g.phase === 'pass' && g.craft === 'plane' && Math.abs(g.heading - Math.PI / 2) < 0.01 && g.passIdx === 0)
    // out-of-order: park on the LAST gate — the sequence law says no score
    const last = g.world.passRings[4]
    g.p = { x: last.x, y: last.y, z: last.z }
    step(g, {})
    r.check('a non-active pass gate never scores (sequence law)', g.passIdx === 0)
    // clean sweep
    for (let i = 0; i < 5; i++) { const pg = g.world.passRings[i]; g.p = { x: pg.x, y: pg.y, z: pg.z }; step(g, {}) }
    const fin = g.events.filter((e) => e.kind === 'finish')
    g.events.length = 0
    r.check('all 5 gates finish with 700 + a time bonus (≤1000) and earn STORM WINGS',
        g.grad.pass != null && g.grad.pass >= 700 && g.grad.pass <= 1000 && g.stormWings && g.phase === 'free'
        && fin.some((e) => e.event === 'THUNDERPASS'), `pass=${g.grad.pass}`)
    r.check('the licence math stays core-three: a pass alone never graduates and never scores',
        !g.done && g.score === 0, `score=${g.score} done=${g.done}`)

    const SEEDS = [1, 7, 42, 99, 123]
    let allPass = true
    const ps = []
    for (const s of SEEDS) {
        const h = makeGame(s)
        checkout(h, 'pass')
        let n = 0
        while (h.grad.pass == null && n++ < 12000) { step(h, decide(h)); h.events.length = 0; if (h.done) break }
        const ok = h.grad.pass != null && h.grad.pass >= 700 && h.grad.pass <= 1000 && h.stormWings
        if (!ok) allPass = false
        ps.push(`${s}:${h.grad.pass ?? 'fail'}`)
    }
    r.check('the storm is beatable: the autopilot clears THUNDERPASS on all five seeds', allPass, ps.join(' '))

    // ---------------------------------------------- living storm (#3267) ----
    // Sweep the clock a full hour: the cell must actually wander (bounded),
    // stay offshore and clear of every course, never greet the pass start
    // deep — and the weather answer must ride WITH the painted cell, so the
    // clouds are never a lie over still physics.
    {
        let maxDx = 0, maxDz = 0, offshore = true, coursesClear = true, startShallow = true
        for (let t = 0; t <= 3600; t += 0.25) {
            const p = w.stormPos(t)
            maxDx = Math.max(maxDx, Math.abs(p.x - w.storm.x))
            maxDz = Math.max(maxDz, Math.abs(p.z - w.storm.z))
            if (w.terrainHeight(p.x, p.z) >= 0) offshore = false
            if (w.targets.some((tt) => Math.hypot(p.x - tt.x, p.z - tt.z) < 200)
                || Math.hypot(p.x - w.pad.x, p.z - w.pad.z) < 300
                || Math.hypot(p.x - w.school.x, p.z - w.school.z) < 300
                || Math.hypot(p.x - w.launch.x, p.z - w.launch.z) < 300
                || w.rings.some((rg) => Math.hypot(p.x - rg.x, p.z - rg.z) < 300)) coursesClear = false
            if (w.stormAt(w.passStart.x, w.passStart.z, t).s >= 0.35) startShallow = false
        }
        r.check('the cell wanders — a memorised storm is a stale storm (#3267)', maxDx > 40 && maxDz > 20, `dx=${maxDx.toFixed(0)} dz=${maxDz.toFixed(0)}`)
        r.check('the wander is bounded — a slow sweep, never a teleport storm', maxDx <= 75 && maxDz <= 45, `dx=${maxDx.toFixed(0)} dz=${maxDz.toFixed(0)}`)
        r.check('the drifting centre stays offshore all hour', offshore)
        r.check('the drift never brings the cell onto a course (targets < 200 m, pads/rings < 300 m)', coursesClear)
        r.check('the pass start line never deepens past s 0.35', startShallow)
        r.check('the weather rides with the painted cell (physics follows stormPos)', (() => {
            // points the STATIC cell can never reach (380 m > r·1.25 = 375)
            // catch weather only when the drifting cell has carried its edge
            // over them — east and west extremes both, same frame.
            let seenE = false, seenW = false
            for (let t = 0; t <= 3600; t += 0.25) {
                const p = w.stormPos(t)
                if (p.x - w.storm.x > 50 && w.stormAt(w.storm.x + 380, w.storm.z, t).s > 0.05) seenE = true
                if (w.storm.x - p.x > 50 && w.stormAt(w.storm.x - 380, w.storm.z, t).s > 0.05) seenW = true
            }
            return seenE && seenW
        })())
    }
}

// ------------------------------------------- fair weather line (#3272-2) ----
    // Gates stay fixed and the cell moves — that stays. But the air the
    // memorised keyboard line ploughs must be CONTINUOUS (the old ±55 m hard
    // ring edge switched +2.7 m/s of updraft across zero distance — a phase
    // lottery, not a lesson), the dunk must stay within one taught correction,
    // and the drift phase must actually differ per seed (the old (r>>>13)
    // read bits 13+, so every seed under 8192 shared phase 0 — the sweep was
    // the SAME wall-clock lottery on every seed).
    {
        const w = makeGame(11).world
        // (a) no vertical-current cliff anywhere on the field: |Δvy| ≤ 0.9 m/s
        // per 4 m along a radius, at several clocks across the drift envelope.
        let cliff = 0, upMax = -9
        for (const tc of [0, 17, 41, 73, 119, 220, 281]) {
            let prev = null
            for (let d = 0; d <= 400; d += 4) {
                const p = w.stormPos(tc)
                const vy = w.stormAt(p.x + d, p.z, tc).vy
                if (prev !== null && Math.abs(vy - prev) > 0.9) cliff++
                prev = vy
                upMax = Math.max(upMax, vy)
            }
        }
        r.check('the rising ring is continuous — no cliff deeper than 0.9 m/s per 4 m (#3272-2)', cliff === 0, `cliffs=${cliff}`)
        r.check('the west-edge rise still exists — updraft peaks at ≥ 1.4 m/s (#3267 design kept)', upMax >= 1.4, `up=${upMax.toFixed(2)}`)
        // (b) the per-seed phase is real: cells at t=0 spread across the drift,
        // ≥ 40 distinct offsets over seeds 1..64 (the degenerate law gave one).
        const ph0 = new Set()
        for (let s = 1; s <= 64; s++) ph0.add(makeGame(s).world.stormPos(0).x.toFixed(1))
        r.check('every small seed gets its own drift phase (≥ 40 of 64 distinct)', ph0.size >= 40, `distinct=${ph0.size}`)
        r.check('the phase is still seed-deterministic', (() => {
            const a = makeGame(77).world.stormPos(0), b = makeGame(77).world.stormPos(0)
            return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9
        })())
        // (c) the straight-and-level keyboard line still dunks (that is the
        // course) but within ONE taught correction: the air integral over the
        // core segment stays in [−19.5, −8] m with total spread ≤ 7.0 m across
        // seeds and clock extremes. Measured pre-fix spread: 7.2 m AND the seed
        // axis added nothing (phase pinned at 0).
        let lo = 0, hi = -99
        for (const s of [1, 7, 13, 42, 99, 2026]) {
            const ws = makeGame(s).world
            for (const t0 of [0, 60, 120, 180, 240, 300]) {
                let sink = 0
                const g1 = ws.passRings[1].x - ws.passStart.x, g3 = ws.passRings[3].x - ws.passStart.x
                for (let d = g1 - 8; d <= g3 + 8; d += 4) {
                    const t = t0 + d / 38
                    sink += ws.stormAt(ws.passStart.x + d, ws.passStart.z, t).vy / 38 * 4
                }
                lo = Math.min(lo, sink); hi = Math.max(hi, sink)
            }
        }
        r.check('the keyboard-line dunk is bounded — a taught correction covers every phase',
            lo >= -19.5 && hi <= -8 && hi - lo <= 7.0, `worst=${lo.toFixed(1)} best=${hi.toFixed(1)} spread=${(hi - lo).toFixed(1)}`)
    }

    // ------------------------------------------ sky-dim bearing (#3272 item 3) ----
    // The sky dome dims toward world.skyDimDir(t, cam) — a camera→deck bearing
    // off the SAME stormPos(t) the weather answers at. The old shader leaned on
    // a fixed east vector, so the darkening (and the lightning flash) lit air
    // the drifting cell had left behind. Expectations are literal bearings
    // dumped from the drift law — a check that recomputes the formula cannot
    // see the formula move.
{
        const RENDERF = 'src/games/Skyward/renderer.js'
        const src = readFileSync(RENDERF, 'utf8')
        const CAM = [208, 30, -70] // chase-cam parked at the pass start line
        const LIT = [
            [7, 0, 0.917572, 0.396486, 0.029318],
            [7, 105, 0.933818, 0.345363, 0.093321],
            [7, 315, 0.878704, 0.475734, 0.039455],
            [11, 75, 0.937451, 0.348012, 0.008564],
            [11, 135, 0.880061, 0.469667, 0.070036],
            [42, 45, 0.870337, 0.465483, 0.160748],
            [42, 390, 0.936075, 0.350917, 0.024914],
        ]
        let litBad = 0
        for (const [s, t, x, y, z] of LIT) {
            const d = makeGame(s).world.skyDimDir(t, CAM[0], CAM[1], CAM[2])
            if (Math.abs(d.x - x) > 5e-4 || Math.abs(d.y - y) > 5e-4 || Math.abs(d.z - z) > 5e-4) litBad++
        }
        r.check('the dim bearing matches the drift law (literal bearings, 3 seeds × times)', litBad === 0, `off=${litBad}`)
        r.check('the bearing is a unit vector over seeds, hours and cameras', (() => {
            for (const s of [7, 11, 42, 2026]) {
                const ws = makeGame(s).world
                for (const t of [0, 61, 173, 400]) {
                    for (const c of [[0, 60, 520], [470, 30, -70], [-300, 15, 200]]) {
                        const d = ws.skyDimDir(t, ...c)
                        if (Math.abs(Math.hypot(d.x, d.y, d.z) - 1) > 1e-9) return false
                    }
                }
            }
            return true
        })())
        // the cell wanders ±64 m — from the pass line that swings the bearing
        // a visible 12°+. A fixed vector (the bug) never moves: zero spread.
        let zlo = 9, zhi = -9
        for (let t = 0; t <= 420; t += 5) { const d = makeGame(7).world.skyDimDir(t, ...CAM); zlo = Math.min(zlo, d.z); zhi = Math.max(zhi, d.z) }
        r.check('the dim tracks the drift — the bearing swings > 0.12 over one sweep (fixed vector = 0)', zhi - zlo > 0.12, `z spread=${(zhi - zlo).toFixed(3)}`)
        // and it aims at the DECK, not the water: from the pass line the cell
        // centre sits 18–28° up; the whole band would sink below the horizon
        // if the deck height were dropped.
        let yBad = 0
        for (const s of [7, 11, 42]) {
            const ws = makeGame(s).world
            for (let t = 0; t <= 420; t += 15) { const d = ws.skyDimDir(t, ...CAM); if (d.y < 0.30 || d.y > 0.55) yBad++ }
        }
        r.check('the dim centres on the cloud deck (elevation 0.30–0.55, not the waterline)', yBad === 0, `out=${yBad}`)
        // wiring: the shader must consume the bearing, and the dead fixed
        // vector must be gone from the dim expression.
        r.check('the renderer feeds skyDimDir(this frame, camera) into the sky',
            src.includes('world.skyDimDir(t, camera.position.x') && src.includes('skyMat.uniforms.uStormDir.value.set(sd.x, sd.y, sd.z)'))
        r.check('the sky shader dims on the camera-relative bearing (and the fixed east vector is gone)',
            src.includes('dot(normalize(uStormDir), normalize(vW - uCam))') && !src.includes('dot(normalize(vec3(0.86,0.34,-0.06))'))
    }

// --------------------------------------------------- juice (#3138) ----
{
    const fly = (s, xOff, until) => {
        const g = makeGame(s)
        checkout(g, 'ring')
        const r0 = g.world.rings[0]
        g.p = { x: r0.x + xOff, y: r0.y, z: r0.z - 40 }
        g.heading = 0; g.pitch = 0; g.roll = 0; g.speed = 38; g.vy = 0
        g._zPrev = g.p.z
        const evs = []
        for (let i = 0; i < 200; i++) { step(g, {}); evs.push(...g.events); g.events.length = 0; if (until && until(g)) break }
        return { g, evs }
    }
    const nm = fly(7, 14, (g) => g.p.z > g.world.rings[0].z + 2)
    r.check('a ring missed by a few metres sings a near-miss event at the crossing',
        nm.evs.some((e) => e.kind === 'near' && e.idx === 1) && nm.g.ringsPassed === 0,
        JSON.stringify(nm.evs))
    const cl = fly(7, 0, (g) => g.p.z > g.world.rings[0].z + 2)
    r.check('a clean pass scores and never doubles up with near-miss noise',
        cl.evs.some((e) => e.kind === 'ring' && e.idx === 1) && !cl.evs.some((e) => e.kind === 'near'),
        JSON.stringify(cl.evs))
    const fr = fly(7, 26, (g) => g.p.z > g.world.rings[0].z + 2)
    r.check('a wide miss stays silent (the near window is real)', !fr.evs.some((e) => e.kind === 'near'),
        JSON.stringify(fr.evs))
    {
        const g = makeGame(7)
        checkout(g, 'ring')
        const r0 = g.world.rings[0]
        g.p = { x: r0.x, y: r0.y, z: r0.z - 20 }
        g.heading = 0; g.pitch = 0; g.roll = 0; g.speed = 38; g.vy = 0; g._zPrev = g.p.z
        let n = 0
        while (g.ringsPassed === 0 && n++ < 200) { step(g, {}); g.events.length = 0 }
        g.p.z = r0.z - 15; g._zPrev = g.p.z
        const evs = []
        for (let i = 0; i < 40; i++) { step(g, {}); evs.push(...g.events); g.events.length = 0 }
        r.check('re-crossing a passed ring says nothing (sequence law reaches near-miss too)',
            g.ringsPassed === 1 && !evs.some((e) => e.kind === 'near'), JSON.stringify(evs))
    }
    // the lift signal the shimmer audio reads — honest, and outside the hash
    const gg = makeGame(7)
    checkout(gg, 'spot')
    const p0 = gg.world.thermalPos(gg.world.thermals[0], gg.t)
    gg.p = { x: p0.x, y: 70, z: p0.z }
    step(gg, {})
    const inLift = gg.lift
    gg.p = { x: 300, y: 70, z: 600 }
    step(gg, {})
    r.check('the sim answers lift honestly: strong under the cumulus, none in fair air',
        inLift > 1.0 && gg.lift < 0.05, `in=${inLift.toFixed(2)} out=${gg.lift.toFixed(2)}`)
    r.check('lift is a juice channel — it never enters state or the score hash',
        !('lift' in stateOf(gg)))
}

// ------------------------------------------------ thermals drift (rung 2) ----
{
    const w = makeGame(7).world
    let maxD = 0, liftOk = false
    for (let t = 0; t < 900; t++) {
        for (const c of w.thermals) {
            const p = w.thermalPos(c, t)
            maxD = Math.max(maxD, Math.hypot(p.x - c.x, p.z - c.z))
        }
    }
    r.check('thermals drift with the breeze and stay on station (≤ 26 m)', maxD <= 26, `maxDrift=${maxD.toFixed(1)}`)
    const c0 = w.thermals[0]
    for (let t = 0; t < 900 && !liftOk; t++) {
        const p = w.thermalPos(c0, t)
        if (Math.hypot(p.x - c0.x, p.z - c0.z) > 12) {
            liftOk = w.thermalLift(p.x, p.z, t) > w.thermalLift(c0.x, c0.z, t) + 1.0
        }
    }
    r.check('the lift follows the cloud, not the home spot (what you see is what you get)', liftOk)
    const a = makeGame(7), b = makeGame(7)
    let same = true
    for (let t = 0; t < 500; t += 7) {
        const pa = a.world.thermalPos(a.world.thermals[1], t), pb = b.world.thermalPos(b.world.thermals[1], t)
        if (pa.x !== pb.x || pa.z !== pb.z) same = false
    }
    r.check('the drift is seed-deterministic', same)
}

// ------------------------------------------------ storm audio law (#3272) ----
{
    // The bed follows depth honestly, and it stays a bed: monotonic in gain
    // and cutoff, silent in fair air, capped low enough that weather never
    // drowns the ring tones.
    let mono = true
    let prevB = null
    for (let s = 0; s <= 1.0001; s += 0.02) {
        const b = stormBed(s)
        if (prevB && (b.gain < prevB.gain - 1e-9 || b.cut < prevB.cut)) mono = false
        prevB = b
    }
    r.check('the rain bed rises monotonically with cell depth, silent in fair air',
        mono && stormBed(0).gain === 0 && stormBed(0.01).gain === 0 && stormBed(0.5).gain > 0,
        JSON.stringify(stormBed(0.5)))
    r.check('the bed is a bed, not a blast (gain ≤ 0.06, cutoff ≤ 1200)',
        stormBed(1).gain <= 0.06 && stormBed(1).cut <= 1200,
        JSON.stringify(stormBed(1)))
    r.check('the bed law survives garbage (NaN/±∞ in ⇒ silence out, never poison the graph)',
        stormBed(NaN).gain === 0 && stormBed(-2).gain === 0 && stormBed(Infinity).gain === 0)

    // Edge laws with hysteresis: one sting per dive, re-armed by a climb out;
    // hovering at a threshold must not machine-gun.
    const seq = (arr) => arr.map((s, i) => stormCue(s, i ? arr[i - 1] : 0))
    r.check('first contact warns, core stings, a climb-out re-arms the sting',
        JSON.stringify(seq([0, 0.04, 0.2, 0.55, 0.7, 0.9, 0.3, 0.6])) ===
        JSON.stringify([null, null, 'warn', 'core', null, null, null, 'core']))
    r.check('buffeting at the core edge cannot re-sting (hysteresis)',
        seq([0, 0.5, 0.52, 0.54, 0.49, 0.51, 0.53]).filter((c) => c === 'core').length === 1)
    r.check('hovering at the warn edge cannot re-warn (hysteresis)',
        seq([0, 0.07, 0.05, 0.07, 0.04, 0.07]).filter((c) => c === 'warn').length === 2)
    r.check('stormCue survives garbage (NaN in ⇒ nothing)', stormCue(NaN, NaN) === null)

    // Honesty: EVERY craft reads its depth — the bed the cabinet drives is the
    // cell the world put the hull in, on glider and belt as much as the plane.
    const gl = makeGame(9); checkout(gl, 'spot')
    const cp = gl.world.stormPos(gl.t)
    gl.p = { x: cp.x, y: 60, z: cp.z }
    step(gl, {})
    r.check('the glider reads storm depth (bed follows every craft)', gl.stormS > 0.5, `s=${gl.stormS.toFixed(2)}`)
    const bl = makeGame(9); checkout(bl, 'drop')
    const cp2 = bl.world.stormPos(bl.t)
    bl.p = { x: cp2.x, y: 50, z: cp2.z }
    bl.vel = { x: 0, y: 0, z: 0 }
    step(bl, {})
    r.check('the belt reads storm depth too', bl.stormS > 0.5, `s=${bl.stormS.toFixed(2)}`)
    r.check('fair air over the bay says nothing to any craft', (() => {
        const a = makeGame(9); step(a, {}); const sa = a.stormS
        const b = makeGame(9); checkout(b, 'spot'); b.p = { x: a.p.x, y: 60, z: a.p.z }; step(b, {})
        const c = makeGame(9); checkout(c, 'drop'); c.p = { x: a.p.x, y: 50, z: a.p.z }; c.vel = { x: 0, y: 0, z: 0 }; step(c, {})
        return sa < 0.001 && b.stormS < 0.001 && c.stormS < 0.001
    })(), `plane=${makeGame(9).stormS.toFixed(2)}`)
}

// ------------------------------------------------- engine audio law (#3295) ----
{
    // The motor bed: plane loudness/pitch rise with airspeed and climb load,
    // the belt answers its fan, the glider is motorless — and deep rain ducks
    // the engine instead of duelling it. It stays a bed: quieter than the rain
    // cap, so it never drowns the ring tones.
    let monoS = true, monoF = true
    for (let v = 6; v <= 60; v += 2) {
        const b = engineBed('plane', v, 0, false, 0)
        if (monoS && b.raw < (engineBed('plane', v - 2, 0, false, 0)).raw - 1e-9) monoS = false
        if (monoF && b.freq < (engineBed('plane', v - 2, 0, false, 0)).freq) monoF = false
    }
    r.check('the plane bed rises with airspeed (gain and pitch)', monoS && monoF,
        JSON.stringify(engineBed('plane', 34, 0, false, 0)))
    r.check('a climbing hull loads the engine (louder AND brighter than level)', (() => {
        const lvl = engineBed('plane', 34, 0, false, 0)
        const up = engineBed('plane', 34, 8, false, 0)
        return up.raw > lvl.raw && up.freq > lvl.freq
    })())
    r.check('a deep-stall hull nearly cuts out (bed floor, not silence, not blast)', (() => {
        const stall = engineBed('plane', 10, 0, false, 0)
        const max = engineBed('plane', 60, 12, false, 0)
        return stall.raw > 0 && stall.raw < 0.006 && max.raw <= 0.034 && max.freq <= 150
    })())
    r.check('the belt answers its fan — thrusting bites a whole tone higher', (() => {
        const idle = engineBed('belt', 0, 0, false, 0)
        const gas = engineBed('belt', 4, 2, true, 0)
        return gas.raw > idle.raw && gas.freq > idle.freq && idle.raw > 0.006
    })())
    r.check('the glider is motorless — silence under every input', (() => {
        const probes = [[34, 0, false, 0], [12, -6, true, 1], [7, 3, false, 0.4]]
        return probes.every(([v, vy, th, s]) => {
            const b = engineBed('glider', v, vy, th, s)
            return b.gain === 0 && b.raw === 0 && b.freq === 0
        })
    })())
    r.check('deep rain ducks the engine (halves it at the core) and never duels', (() => {
        const fair = engineBed('plane', 34, 0, false, 0)
        const core = engineBed('plane', 34, 0, false, 1)
        let duckMono = true
        for (let s = 0; s <= 1.0001; s += 0.05) {
            const g = engineBed('plane', 34, 0, false, s).gain
            if (g > fair.raw + 1e-9 || g > fair.gain + 1e-9) duckMono = false
        }
        return core.gain === +(fair.raw * 0.5).toFixed(4) && duckMono && core.raw === fair.raw
    })(), JSON.stringify(engineBed('plane', 34, 0, false, 1)))
    r.check('the law survives garbage (NaN/±∞ in ⇒ finite bed out, never poison the graph)', (() => {
        const b = engineBed('plane', NaN, Infinity, false, -2)
        const c = engineBed('belt', -5, NaN, true, Infinity)
        return [b.gain, b.freq, b.raw, c.gain, c.freq, c.raw].every(Number.isFinite) && b.gain >= 0
    })())

    // Edge cues with hysteresis: spool from near-silence, cut only at a true
    // death; jitter between the arming lines must not chirp.
    const eseq = (arr) => arr.map((r0, i) => engineCue(r0, i ? arr[i - 1] : 0))
    r.check('boarding spins the prop (from silence to cruise: one spool)',
        eseq([0, 0.013, 0.018]).filter((c) => c === 'spool').length === 1)
    r.check('the motor dies only into true zero (glider on: one cut; belt fan toggles keep it alive)',
        eseq([0.014, 0.010, 0]).filter((c) => c === 'cut').length === 1 &&
        eseq([0.014, 0.026, 0.014, 0.026]).every((c) => c === 'spool' || c === null) &&
        eseq([0.014, 0.026, 0.014, 0.026]).filter((c) => c === 'spool').length === 1)
    r.check('jitter between the arming lines cannot re-spool (hysteresis)',
        eseq([0.004, 0.005, 0.0055, 0.0125, 0.008, 0.013, 0.005]).filter((c) => c === 'spool').length === 1)
    r.check('engineCue survives garbage (NaN in ⇒ nothing; zero into a live raw cuts)', engineCue(NaN, NaN) === null && engineCue(undefined, 5) === 'cut')

    // Honesty: the cues ride the UNDUCKED raw so flying through the core
    // can't fake an engine death; and a driven plane run spools on boarding.
    const deep = engineBed('plane', 34, 0, false, 1)
    r.check('storm never fakes a cue — cue rides raw, only gain ducks',
        engineCue(deep.raw, deep.raw) === null && deep.gain < deep.raw)
    r.check('a driven plane spools once on boarding and keeps hums honest for four seconds', (() => {
        const g = makeGame(11)
        let prev = 0, spools = 0, off = 0
        for (let i = 0; i < 240; i++) {
            step(g, {})
            const b = engineBed(g.craft, g.speed, g.vy, g.thrusting, g.stormS)
            if (engineCue(b.raw, prev) === 'spool') spools++
            if (b.raw === 0) off++
            prev = b.raw
        }
        return spools === 1 && off === 0 && prev >= 0.012
    })())

    // The bed touches NOTHING on the score spine: same seed, same hash, and
    // stateOf grows no new key — presentation-only, replay-honest.
    {
        const a = makeGame(5)
        for (let i = 0; i < 600; i++) step(a, decide(a))
        const b = makeGame(5)
        for (let i = 0; i < 600; i++) step(b, decide(b))
        r.check('driving the law changes nothing on the score spine (hash + keys identical)',
            a.hash === b.hash && !('engine' in stateOf(a)) && !('gain' in stateOf(a)))
    }
}

// ────────────────── rich load & wind law (#3300 items 1+3) ──────────────────
{
    // The rich voice (#3300 item 1) opens with load: `cut` is the filter
    // brightness the loudness already implies — a working engine is loud AND
    // bright (the storm bed's pairing), and the glider has none of either.
    let monoC = true
    for (let v = 22; v <= 60; v += 2) {
        if (engineBed('plane', v, 0, false, 0).cut < engineBed('plane', v - 2, 0, false, 0).cut) monoC = false
    }
    r.check('engine brightness rides load (cut opens with pitch and gain)',
        monoC && engineBed('plane', 10, 0, false, 0).cut <= 700 && engineBed('plane', 60, 12, false, 0).cut >= 2000,
        JSON.stringify(engineBed('plane', 34, 0, false, 0)))
    r.check('the belt fan opens its filter with thrust too',
        engineBed('belt', 0, 0, true, 0).cut > engineBed('belt', 0, 0, false, 0).cut)
    r.check('the motorless glider is silent in every field — gain, freq AND cut',
        engineBed('glider', 19, -8, true, 1).cut === 0 && engineBed('glider', 19, -8, true, 1).gain === 0)
    r.check('the cut field survives garbage (NaN/±∞ in ⇒ finite cut out)',
        Number.isFinite(engineBed('plane', NaN, 30, false, -2).cut) && Number.isFinite(engineBed('belt', 1, NaN, true, Infinity).cut))

    // #3300 item 3 — windBed: the glider's air-rush. Glider-only (motorless
    // honesty: planes and belts already own motors), rising with AIRSPEED (the
    // stick still teaches — a float is hushed, a dive roars), capped far below
    // the motor so it whispers, and ducked by storm depth like everything else.
    r.check('wind blows for the glider only — plane and belt stay on their motors',
        windBed('plane', 19, 0).gain === 0 && windBed('belt', 4, 0).gain === 0 && windBed('glider', 19, 0).gain > 0)
    let monoW = true
    for (let v = 10; v <= 22; v += 1) {
        if (windBed('glider', v, 0).gain < windBed('glider', v - 1, 0).gain - 1e-9) monoW = false
        if (windBed('glider', v, 0).cut < windBed('glider', v - 1, 0).cut) monoW = false
    }
    r.check('the rush grows with airspeed (gain and brightness monotonic; a slow float stays hushed)',
        monoW && windBed('glider', 9, 0).gain === 0 && windBed('glider', 7, 0).gain === 0)
    r.check('the rush is a whisper, not a second motor (gain ≤ 0.03, cut ≤ 700)',
        windBed('glider', 19, 0).gain <= 0.03 && windBed('glider', 19, 0).cut <= 700,
        JSON.stringify(windBed('glider', 19, 0)))
    r.check('rain owns the core for the wind too (storm halves the rush, never raises it)', (() => {
        const g0 = windBed('glider', 16, 0).gain
        const g1 = windBed('glider', 16, 1).gain
        let monoD = true
        for (let s = 0; s <= 1.0001; s += 0.05) if (windBed('glider', 16, s).gain > g0 + 1e-9) monoD = false
        return Math.abs(g1 - g0 * 0.5) < 1e-3 && g1 < g0 && monoD
    })(), JSON.stringify(windBed('glider', 16, 1)))
    r.check('the wind law survives garbage (NaN/±∞ in ⇒ finite, never poisoned)',
        [windBed('glider', NaN, NaN), windBed('glider', -5, 2), windBed('glider', Infinity, Infinity)].every(
            (b) => Number.isFinite(b.gain) && Number.isFinite(b.cut) && b.gain >= 0))
}

// ─────────────── the airfield speaks and shows itself (#3310) ───────────────
{
    // item 6 — sockPose: the sock streams DOWNWIND, droops at slack wind and
    // flutters on the sim clock. Literals, not the law's own constants.
    const east = sockPose({ x: 3, z: 0 }, 1.0)
    r.check('a steady east stream blows the sock east, flat and mid-flutter',
        east.dir && east.dir.x === 1 && east.dir.z === 0 && east.droop === 0 && east.flutter === 0.682,
        JSON.stringify(east))
    const north = sockPose({ x: 0, z: 4.4 }, 3.7)
    r.check('the sock heading follows the wind vector (a z-only stream streams along z, at full strength)',
        north.dir && north.dir.x === 0 && north.dir.z === 1 && north.flutter === 1)
    const calm = sockPose({ x: 0, z: 0 }, 2.2)
    r.check('dead calm: the sock points nowhere and hangs at full droop',
        calm.dir === null && calm.droop === 0.9 && calm.sway === 0)
    r.check('slack wind droops the tail and the droop dries out at 2.2 m/s',
        Math.abs(sockPose({ x: 0.5, z: 0 }, 1).droop - 0.695) < 0.001 && sockPose({ x: 2.2, z: 0 }, 1).droop === 0)
    let droopMono = true
    for (let v = 0.2; v <= 4; v += 0.2) if (sockPose({ x: v, z: 0 }, 1).droop > sockPose({ x: v - 0.2, z: 0 }, 1).droop + 1e-9) droopMono = false
    r.check('the droop is monotonic in wind strength', droopMono)
    const snap = sockPose({ x: 2, z: 0 }, 1.0, { x: -2.5, z: 0 })
    r.check('a stronger gust flips the sock (the snap is real wind, not decoration)',
        snap.dir && snap.dir.x === -1 && snap.droop > 0.6)
    let swayBound = true, swayLo = 9, swayHi = -9
    for (let t = 0; t <= 120; t += 0.05) {
        const s = sockPose({ x: 4.4, z: 0 }, t).sway
        if (!(Math.abs(s) <= 0.15)) swayBound = false
        if (s < swayLo) swayLo = s
        if (s > swayHi) swayHi = s
    }
    r.check('flutter rides the sim clock — bounded and swinging, never a statue',
        swayBound && swayHi - swayLo > 0.1, `${swayLo.toFixed(3)}..${swayHi.toFixed(3)}`)
    r.check('the sock pose survives garbage (NaN/±∞ wind ⇒ finite angles or a resting null dir)',
        Number.isFinite(sockPose({ x: NaN, z: Infinity }, 1).droop) && sockPose({}, 1).dir === null
        && [sockPose({ x: Infinity, z: 2 }, 5), sockPose({ x: NaN, z: NaN }, 5)].every(
            (p) => p.dir === null || Number.isFinite(p.dir.x)))

    // item 2 — the numbers painted on the asphalt must read exactly what the
    // scoring pays, and every decal must sit inside the zone it names.
    r.check('the four painted numbers equal the scoring table',
        readFileSync('src/games/Skyward/renderer.js', 'utf8').includes('[150, 300, 450, 700]'))
    {
        const gS = makeGame(5)
        const R = gS.world.runway
        const frac = [0, 1, 2, 3].map((i) => { const q = stripZone(gS.world, R.ax + ((i + 0.5) / 4) * gS.world.STRIP_LEN, R.az); return q ? q.frac : -1 })
        r.check('band centres carry their own zone (0.125/0.375/0.625/0.875 on the deck)',
            frac.every((f, i) => Math.abs(f - (i + 0.5) / 4) < 1e-9), frac.join(','))
    }

    // item 4 — dusk contrast: deck and markings must carry an emissive floor,
    // or the strip sinks into dimmed sand when the cell soaks the beach.
    r.check('deck and markings carry emissive floors (dusk cannot sink the airfield)', (() => {
        const src = readFileSync('src/games/Skyward/renderer.js', 'utf8')
        return src.includes('emissive: 0x10151c') && src.includes('emissive: 0x7b8187')
    })())
}

// -------------------------------------------------------- graduation ----
{
    const SEEDS = [1, 7, 42, 99, 123]
    let wings = 0
    let allOk = true
    const scores = []
    for (const s of SEEDS) {
        const g = makeGame(s)
        checkout(g, 'ring')
        let n = 0
        while (g.grad.ring == null && n++ < 18000) { step(g, decide(g)); g.events.length = 0 }
        if (g.grad.ring == null) { allOk = false; scores.push(`${s}:ring-fail`); continue }
        checkout(g, 'spot')
        n = 0
        while (g.grad.spot == null && n++ < 18000) { step(g, decide(g)); g.events.length = 0 }
        if (g.grad.spot == null) { allOk = false; scores.push(`${s}:spot-fail`); continue }
        checkout(g, 'drop')
        n = 0
        while (g.grad.drop == null && n++ < 18000) { step(g, decide(g)); g.events.length = 0 }
        if (g.grad.drop == null) { allOk = false; scores.push(`${s}:drop-fail`); continue }
        scores.push(`${s}:${g.score}`)
        if (g.score >= 1500) wings++
        r.check(`seed ${s}: done flag + license follow the score`, g.done && g.license &&
            (g.score >= 2400 ? g.license === 'ACE' : g.score >= 1500 ? g.license === 'WINGS' : g.license === 'STUDENT'),
            `${g.score} ${g.license}`)
    }
    r.check('the school is winnable: the autopilot graduates on all five seeds', allOk, scores.join(' '))
    r.check('at least three of five graduate WINGS or higher (the syllabus is fair, not automatic)', wings >= 3, `wings+ = ${wings}`)
}

// ----------------------------------------------------- determinism ----
{
    const pair = (s) => {
        const g = makeGame(s)
        const hs = []
        for (let n = 0; n < 1800; n++) { step(g, decide(g)); g.events.length = 0; if (n % 300 === 299) hs.push(g.hash) }
        return hs.join(',')
    }
    r.check('same seed + same pads ⇒ identical hashes (seed 7)', pair(7) === pair(7))
    r.check('same seed + same pads ⇒ identical hashes (seed 99)', pair(99) === pair(99))
    r.check('different seeds diverge', pair(7) !== pair(42))
}

// ------------------------------------------------------ state/contract ----
{
    const g = makeGame(5)
    drive(g, { right: true, a: true }, 600)
    const st = stateOf(g)
    r.check('state() is plain JSON with tick/score/done', ['tick', 'score', 'done', 'hash', 'seed'].every((k) => k in st) && JSON.stringify(st).length > 10)
    r.check('state hash is a uint32', Number.isInteger(st.hash) && st.hash >= 0 && st.hash <= 0xffffffff)
}

// ------------------------------------------------------- fuzz limits ----
{
    let seed = 987654321
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    let bad = 0, events = 0
    const g = makeGame(31)
    for (let i = 0; i < 6000; i++) {
        step(g, {
            x: rnd() * 2 - 1, y: rnd() * 2 - 1, a: rnd() < 0.4, b: rnd() < 0.1,
            left: rnd() < 0.2, right: rnd() < 0.2, up: rnd() < 0.2, down: rnd() < 0.2,
        })
        events += g.events.length
        g.events.length = 0
        if (!Number.isFinite(g.p.x + g.p.y + g.p.z) || Math.abs(g.p.x) > 1600 || Math.abs(g.p.z) > 1600 || g.p.y > 500 || g.p.y < -40) bad++
        if (g.done) g.done = false
    }
    r.check('6000 fuzz ticks: no NaN, no escapes from the world', bad === 0, `bad=${bad}`)
    r.check('the fuzz still triggers real events (the toy is alive)', events > 5, `events=${events}`)
}

// ----------------------------------------------------------- mutants ----
// ── #3319 — the plane answers the runway (Pilotwings' landing test) ────────
    {
        const w = makeGame(21).world
        // pure planeTouch: zones mirror the glider's; bands are the plane's own
        const full = planeTouch(w, 120, 130, Math.PI / 2, -1, 30)
        r.check('planeTouch: deep + aligned + slow = FULL STRIP 700',
            full && full.zone === 4 && full.score === 700 && full.aligned === true, JSON.stringify(full))
        const short = planeTouch(w, -10, 130, Math.PI / 2, -1, 30)
        r.check('planeTouch: first quarter pays 150', short && short.zone === 1 && short.score === 150, JSON.stringify(short))
        const crab = planeTouch(w, 120, 130, Math.PI / 2 + 0.45, -1, 30)
        r.check('planeTouch: crabbed past ~17° is a scuff (60), not a zone',
            crab && crab.zone === 0 && crab.score === 60 && crab.aligned === false, JSON.stringify(crab))
        r.check('planeTouch: cruise speed (36) is too hot — no catch', planeTouch(w, 120, 130, Math.PI / 2, -1, 36) === null)
        r.check('planeTouch: a steep sink (−3) is not soft — no catch', planeTouch(w, 120, 130, Math.PI / 2, -3, 30) === null)
        r.check('planeTouch: off-strip — no catch', planeTouch(w, 120, 160, Math.PI / 2, -1, 30) === null)

        // #3331 item 1 — the go-around window, pure law beside the catch.
        r.check('#3331 planeGoAround: hot (≥ ceiling), shallow, straight, on-strip is the bounce window', (() => {
            const a = planeGoAround(w, 100, 130, Math.PI / 2, -1, 34.5) // exactly at the ceiling
            const b = planeGoAround(w, 100, 130, Math.PI / 2, -0.1, 44.9)
            return !!a && !!b && a.hot === 34.5 && a.u === 130
        })())
        r.check('#3331 planeGoAround: slow (the catch owns it), steep, crabbed, missile-fast or off-strip → null',
            planeGoAround(w, 100, 130, Math.PI / 2, -1, 34.4) === null &&
            planeGoAround(w, 100, 130, Math.PI / 2, -2.5, 36) === null &&
            planeGoAround(w, 100, 130, Math.PI / 2 + 0.45, -1, 36) === null &&
            planeGoAround(w, 100, 130, Math.PI / 2, -1, 45) === null &&
            planeGoAround(w, 100, 148, Math.PI / 2, -1, 36) === null)
        r.check('#3331 the catch and the bounce tile the speed axis with no gap and no overlap',
            planeTouch(w, 100, 130, Math.PI / 2, -1, 34.4) !== null && planeGoAround(w, 100, 130, Math.PI / 2, -1, 34.4) === null &&
            planeTouch(w, 100, 130, Math.PI / 2, -1, 34.5) === null && planeGoAround(w, 100, 130, Math.PI / 2, -1, 34.5) !== null)

        // #3331 item 4 — the scuff tell, pure geometry on short final.
        r.check('#3331 scuffTell: straight reads 0, the crab limit reads 1, monotonic between', (() => {
            const a = scuffTell(w, 100, 130, Math.PI / 2, 3)
            const m = scuffTell(w, 100, 130, Math.PI / 2 + 0.2, 3)
            const b = scuffTell(w, 100, 130, Math.PI / 2 + 0.3, 3)
            return !!a && a.tell === 0 && !!b && b.tell === 1 && m.tell > 0 && m.tell < 1 &&
                scuffTell(w, 100, 130, Math.PI / 2 + 0.25, 3).tell > m.tell
        })())
        r.check('#3331 scuffTell: corridor, window and altitude gates hold (off-axis, short, high → null)',
            scuffTell(w, 100, 150, Math.PI / 2, 3) === null && // 20 m off the axis (> TELL_V)
            scuffTell(w, -60, 130, Math.PI / 2, 3) === null && // 30 m short of the threshold
            scuffTell(w, -50, 130, Math.PI / 2, 3) !== null && // inside the 25 m window
            scuffTell(w, 100, 130, Math.PI / 2, 20) === null) // cruise height is not short final
        r.check('#3331 scuffTell: dir signs which way the nose is off',
            scuffTell(w, 100, 130, Math.PI / 2 - 0.25, 3).dir === -1 &&
            scuffTell(w, 100, 130, Math.PI / 2 + 0.25, 3).dir === 1)

        // whole-hull rules through step(): touchdown banks the strip as the
        // plane's OWN best, not an exam score — licence math stays core-three.
        const planeStrip = (seed, x, z, heading, vy, speed, pad = {}, cap = 400) => {
            const h = makeGame(seed)
            h.craft = 'plane'; h.phase = 'free'
            h.p = { x, y: Math.max(w.terrainHeight(x, z), w.waterHeightAt(x, z, 0)) + 1.2, z }
            h.heading = heading; h.speed = speed; h.vy = vy
            h.pitch = Math.asin(Math.max(-1, Math.min(1, vy / speed)))
            const evs = []
            let n = 0
            while (n++ < cap && !h.ground && evs.every((e) => e.kind !== 'crash')) { step(h, pad); evs.push(...clear(h)) }
            return { h, evs }
        }
        const ld = planeStrip(31, 100, 130, Math.PI / 2, -1, 30)
        r.check('the plane touches down: wheels-down event (plane, strip, FULL STRIP)',
            ld.evs.some((e) => e.kind === 'land' && e.craft === 'plane' && e.zone === 4 && e.aligned === true),
            ld.evs.map((e) => e.kind).join(','))
        r.check('a plane landing banks to the WHEELS badge (land=700), NOT the licence score',
            ld.h.land === 700 && ld.h.score === 0 && ld.h.grad.spot === null && !ld.h.done,
            `land=${ld.h.land} score=${ld.h.score} done=${ld.h.done}`)

        // #3331 item 1 SUPERSEDES #3319's "hot still crashes": a hot-but-
        // SHALLOW, straight pass bounces (the first failure teaches). The
        // shape of the failure that remains — steep, crabbed, missile-fast —
        // is unchanged, and nothing is banked by a bounce.
        const hot = planeStrip(32, 100, 130, Math.PI / 2, -1, 36, {}, 90)
        {
            const gi = hot.evs.findIndex((e) => e.kind === 'goaround')
            const ci = hot.evs.findIndex((e) => e.kind === 'crash')
            r.check('#3331 too hot AND shallow on the strip (36 m/s) bounces — go-around, no crash, nothing banked',
                gi >= 0 && (ci === -1 || ci > gi) && hot.h.land === 0,
                `gi=${gi} ci=${ci} land=${hot.h.land} evs=${hot.evs.map((e) => e.kind).join(',')}`)
        }
        const steep = planeStrip(32, 100, 130, Math.PI / 2, -3, 36)
        r.check('#3331 steep AND fast still crashes — the bounce forgives shallow, not dive-in',
            steep.evs.some((e) => e.kind === 'crash') && steep.evs.every((e) => e.kind !== 'goaround'),
            steep.evs.map((e) => e.kind).join(','))
        const missile = planeStrip(32, 100, 130, Math.PI / 2, -1, 46)
        r.check('#3331 past the bounce window (46 m/s) is not an approach — still crashes',
            missile.evs.some((e) => e.kind === 'crash') && missile.evs.every((e) => e.kind !== 'goaround'),
            missile.evs.map((e) => e.kind).join(','))
        const crabHot = planeStrip(32, 100, 130, Math.PI / 2 + 0.45, -1, 36)
        r.check('#3331 crabbed AND hot crashes like #3319 — the bounce only speaks to a straight hull',
            crabHot.evs.some((e) => e.kind === 'crash') && crabHot.evs.every((e) => e.kind !== 'goaround'),
            crabHot.evs.map((e) => e.kind).join(','))

        // rollout → coast → ground crew recovers, no crash counted
        const roll = makeGame(33)
        roll.craft = 'plane'; roll.phase = 'free'
        roll.p = { x: 100, y: 3.6, z: 130 }; roll.heading = Math.PI / 2; roll.speed = 30; roll.vy = -1
        let rollEvs = []
        let rn = 0
        while (rn++ < 1200 && rollEvs.every((e) => e.kind !== 'crew') && rollEvs.every((e) => e.kind !== 'crash')) { step(roll, {}); rollEvs.push(...clear(roll)) }
        r.check('after touchdown the plane rolls out and the ground crew recovers her (crew, not crash)',
            rollEvs.some((e) => e.kind === 'crew') && roll.crashes === 0, rollEvs.map((e) => e.kind).join(','))

        // #3331 item 5 — the rollout can EARN: straight and long pays onto the
        // badge best; a crabbed hull slides off the dash and gets nothing.
        {
            const ro = rollEvs.find((e) => e.kind === 'rollout')
            r.check('#3331 a clean rollout pays +100 onto the ✈ best (crew end, dist ≥ 12, offset ≤ 2)',
                !!ro && ro.clean === true && ro.via === 'crew' && ro.dist >= 12 && ro.maxV <= 2 && ro.credit === 100 && roll.land === 800,
                `ro=${JSON.stringify(ro)} land=${roll.land}`)
            r.check('#3331 the rollout reward never touches the licence spine (score/grad/done clean)',
                roll.score === 0 && roll.grad.spot === null && !roll.done, `score=${roll.score} done=${roll.done}`)
        }
        {
            const cr = makeGame(35)
            cr.craft = 'plane'; cr.phase = 'free'
            const y0c = Math.max(cr.world.terrainHeight(100, 130), cr.world.waterHeightAt(100, 130, 0))
            cr.p = { x: 100, y: y0c + 1.2, z: 130 }
            cr.heading = Math.PI / 2 + 0.25; cr.speed = 30; cr.vy = -1
            const crEvs = []
            let cn = 0
            while (cn++ < 1400 && crEvs.every((e) => e.kind !== 'crew') && crEvs.every((e) => e.kind !== 'crash')) { step(cr, {}); crEvs.push(...clear(cr)) }
            const ro = crEvs.find((e) => e.kind === 'rollout')
            const ldEv = crEvs.find((e) => e.kind === 'land')
            r.check('#3331 a crabbed rollout drifts off the centreline dash and earns nothing (the law can\'t be faked)',
                !!ro && ro.clean === false && ro.maxV > 2 && ro.credit === 0 && ldEv && cr.land === ldEv.score,
                `ro=${JSON.stringify(ro)} land=${cr.land}`)
        }
        // stateOf addenda: the tell on approach, the roll meter on the deck
        {
            const hs = makeGame(38)
            hs.craft = 'plane'; hs.phase = 'free'
            hs.p = { x: 40, y: Math.max(hs.world.terrainHeight(40, 130), 0) + 4, z: 130 }
            hs.heading = Math.PI / 2 + 0.25; hs.speed = 30; hs.vy = -0.5
            const sA = stateOf(hs)
            r.check('#3331 stateOf.scuff reads hot on a crabbed approach',
                sA.scuff !== null && sA.scuff.tell >= 0.5 && sA.roll === null, JSON.stringify(sA.scuff))
            const hs2 = makeGame(37)
            hs2.craft = 'plane'; hs2.phase = 'free'
            hs2.p = { x: 100, y: Math.max(hs2.world.terrainHeight(100, 130), 0) + 1.2, z: 130 }
            hs2.heading = Math.PI / 2; hs2.speed = 30; hs2.vy = -1
            let nG = 0
            while (nG++ < 5 && !hs2.ground) step(hs2, {})
            const sG = stateOf(hs2)
            r.check('#3331 stateOf.roll meters the rollout while she rides the deck (scuff nulls down)',
                sG.roll !== null && sG.roll.d >= 0 && sG.ground === true && sG.scuff === null, JSON.stringify(sG.roll))
        }

        // wheels-abort: stick back mid-roll lifts her off for a touch-and-go
        const ab = makeGame(34)
        ab.craft = 'plane'; ab.phase = 'free'
        ab.p = { x: 60, y: 3.6, z: 130 }; ab.heading = Math.PI / 2; ab.speed = 30; ab.vy = -1
        let abEvs = []
        let an = 0
        while (an++ < 40 && !ab.ground) { step(ab, {}); abEvs.push(...clear(ab)) }
        const groundedAt = ab.ground !== null
        {
            const rf = ab.ground
            let fn = 0
            while (fn++ < 40 && ab.ground) { step(ab, {}); abEvs.push(...clear(ab)) } // #3331: let her roll a line first
            void rf
        }
        an = 0
        while (an++ < 120 && abEvs.every((e) => e.kind !== 'wheels')) { step(ab, { y: 1 }); abEvs.push(...clear(ab)) }
        let an2 = 0
        while (an2++ < 60 && abEvs.every((e) => e.kind !== 'crash') && ab.p.y < 60) { step(ab, { y: 1 }); abEvs.push(...clear(ab)) }
        r.check('wheels-abort: stick back during the rollout is a touch-and-go (wheels, climbs clear, no crash)',
            groundedAt && abEvs.some((e) => e.kind === 'wheels') && ab.ground === null && ab.crashes === 0 && ab.p.y > 6,
            `grounded=${groundedAt} y=${ab.p.y.toFixed(1)} crashes=${ab.crashes} evs=${abEvs.map((e) => e.kind).join(',')}`)
        {
            // #3331 — the reward survives a touch-and-go, and the cabinet's
            // last word is the credit: rollout fires AFTER the wheels event.
            const abRo = abEvs.find((e) => e.kind === 'rollout')
            const abWh = abEvs.find((e) => e.kind === 'wheels')
            const abLd = abEvs.find((e) => e.kind === 'land')
            r.check('#3331 touch-and-go banks rollout credit too, emitted after wheels so it banners last',
                !!abRo && abRo.via === 'abort' && abRo.clean === true && !!abWh && !!abLd &&
                abEvs.indexOf(abRo) > abEvs.indexOf(abWh) && ab.land === abLd.score + 100,
                `ro=${JSON.stringify(abRo)} land=${ab.land}`)
        }

        // autopilot honesty: the mat-seeking planner never parks the plane on the strip
        let planeStripAuto = 0
        for (const s of [1, 7, 42, 99, 123]) {
            const h = makeGame(s)
            let n = 0
            while (n++ < 20000 && !h.done) {
                for (const e of h.events) if (e.kind === 'land' && e.craft === 'plane') planeStripAuto++
                step(h, decide(h))
            }
        }
        r.check('honesty: the autopilot never lands the plane on the strip (5 seeds)', planeStripAuto === 0, `n=${planeStripAuto}`)

        // determinism: a scripted soft arrival replays to an identical hash
        const replayHash = () => {
            const h = makeGame(88)
            h.craft = 'plane'; h.phase = 'free'
            h.p = { x: 60, y: 3.6, z: 130 }; h.heading = Math.PI / 2; h.speed = 30; h.vy = -1; h.pitch = Math.asin(-1 / 30)
            let n = 0
            while (n++ < 200) step(h, {})
            return `${h.hash}:${h.land}`
        }
        r.check('determinism: a plane landing replays identical (hash + banked WHEELS)', replayHash() === replayHash(), replayHash())

        // stateOf exposes the plane's strip work to the harness/contract
        const stp = stateOf(ld.h)
        r.check('stateOf: reports the banked plane landing (land 700), plain JSON',
            stp.land === 700 && JSON.stringify(stp).length > 10, `land=${stp.land}`)
    }

    // ── #3332 — the belt answers the runway (park law) ──────────────────────
    {
        const w = makeGame(21).world
        // pure beltTouch: zones mirror the strip table; quietness is the belt's own
        const full = beltTouch(w, 120, 130, Math.PI / 2, -1, 3)
        r.check('beltTouch: deep + aligned + quiet = FULL STRIP 700',
            full && full.zone === 4 && full.score === 700 && full.aligned === true, JSON.stringify(full))
        const short = beltTouch(w, -10, 130, Math.PI / 2, -1, 3)
        r.check('beltTouch: first quarter pays 150', short && short.zone === 1 && short.score === 150, JSON.stringify(short))
        const crab = beltTouch(w, 120, 130, Math.PI / 2 + 0.45, -1, 3)
        r.check('beltTouch: crabbed past ~17° is a scuff (60), not a zone',
            crab && crab.zone === 0 && crab.score === 60 && crab.aligned === false, JSON.stringify(crab))
        r.check('beltTouch: a firm sink (−2.5) is not quiet — no catch', beltTouch(w, 120, 130, Math.PI / 2, -2.5, 3) === null)
        r.check('beltTouch: crossing at 4.5 m/s is not quiet — no catch', beltTouch(w, 120, 130, Math.PI / 2, -1, 4.5) === null)
        r.check('beltTouch: climbing away (+1.5) is a departure, not an arrival', beltTouch(w, 120, 130, Math.PI / 2, 1.5, 3) === null)
        r.check('beltTouch: off-strip — no catch', beltTouch(w, 120, 160, Math.PI / 2, -1, 3) === null)

        // whole-hull: a QUIET descent (throttle-pulsed, what a pilot does) parks
        const quiet = (h) => ({ a: h.vy < -1.6 })
        const beltDrop = (seed, x, vy0, ctrl, cap = 500) => {
            const h = makeGame(seed)
            h.craft = 'belt'; h.phase = 'free'
            const y = Math.max(w.terrainHeight(x, 130), w.waterHeightAt(x, 130, 0)) + 1.2
            h.p = { x, y, z: 130 }
            h.heading = Math.PI / 2; h.speed = 3; h.vy = vy0
            h.vel = { x: 3, z: 0 }
            const evs = []
            let n = 0
            while (n++ < cap && !h.park && evs.every((e) => e.kind !== 'crash')) { step(h, ctrl ? ctrl(h) : {}); evs.push(...clear(h)) }
            return { h, evs }
        }
        const pk = beltDrop(41, 100, -1, quiet)
        r.check('the belt parks on a quiet arrival: strip touchdown event (belt, strip, FULL STRIP)',
            pk.evs.some((e) => e.kind === 'land' && e.craft === 'belt' && e.zone === 4 && e.aligned === true),
            pk.evs.map((e) => e.kind).join(','))
        r.check('a belt landing banks the HOVER (beltLand=700), NOT the licence score',
            pk.h.beltLand === 700 && pk.h.score === 0 && pk.h.grad.drop === null && !pk.h.done,
            `beltLand=${pk.h.beltLand} score=${pk.h.score} done=${pk.h.done}`)

        // today's edges stay today's: firm sinks settle (no park, no crash, no
        // score), hot arrivals crash — the crossing law fires ONCE, so a
        // zeroed settle vy must never sneak a park on the next tick
        const f = beltDrop(42, 100, -1, null)
        r.check('a firm arrival (no throttle) settles unscored — today\'s law intact, no park next tick',
            !f.h.park && f.evs.every((e) => e.kind !== 'crash' && e.kind !== 'land') && f.h.beltLand === 0,
            `park=${!!f.h.park} evs=${f.evs.map((e) => e.kind).join(',')} bank=${f.h.beltLand}`)
        const hot = beltDrop(42, 100, -6, null)
        r.check('a hot arrival (−6 m/s) on the strip still crashes — the school does not forgive dives',
            hot.evs.some((e) => e.kind === 'crash') && hot.h.beltLand === 0, hot.evs.map((e) => e.kind).join(','))

        // parked is parked: locked on the deck, crew-chocked against the wind;
        // throttle lets go and a second quiet arrival pays again (best kept)
        const px = pk.h.p.x, pz = pk.h.p.z
        for (let i = 0; i < 40; i++) step(pk.h, {})
        r.check('parked is parked: 40 ticks on the deck, locked and crash-free',
            pk.h.park !== null && Math.abs(pk.h.p.x - px) < 1e-9 && Math.abs(pk.h.p.z - pz) < 1e-9 && pk.h.crashes === 0,
            `x=${pk.h.p.x.toFixed(2)} z=${pk.h.p.z.toFixed(2)} crashes=${pk.h.crashes}`)
        const lkv = pk.evs
        let ln = 0
        while (ln++ < 60 && lkv.every((e) => e.kind !== 'liftoff')) { step(pk.h, { a: true }); lkv.push(...clear(pk.h)) }
        while (ln++ < 120 && pk.h.p.y < 3.9) { step(pk.h, { a: true }); lkv.push(...clear(pk.h)) } // climb clear of the deck
        const glide = (h) => ({ a: h.vy < -1.0 }) // damp the descent before the deck reaches the firm band
        ln = 0
        while (ln++ < 600 && !pk.h.park) { step(pk.h, glide(pk.h)); lkv.push(...clear(pk.h)) }
        r.check('throttle lifts her off (liftoff) and a second quiet arrival parks again with the best banked',
            lkv.some((e) => e.kind === 'liftoff') && pk.h.park !== null && pk.h.beltLand === 700 && pk.h.crashes === 0,
            `evs=${lkv.map((e) => e.kind).join(',')} bank=${pk.h.beltLand}`)

        // autopilot honesty: the mat/drop-seeking planner never parks the belt
        // on the strip while graduating
        let beltStripAuto = 0
        for (const s of [1, 7, 42, 99, 123]) {
            const h = makeGame(s)
            let n = 0
            while (n++ < 20000 && !h.done) {
                for (const e of h.events) if (e.kind === 'land' && e.craft === 'belt') beltStripAuto++
                step(h, decide(h))
            }
        }
        r.check('honesty: the autopilot never parks the belt on the strip (5 seeds)', beltStripAuto === 0, `n=${beltStripAuto}`)

        // determinism: a scripted quiet arrival replays to an identical hash
        const replayHash = () => {
            const h = makeGame(88)
            h.craft = 'belt'; h.phase = 'free'
            const y = Math.max(w.terrainHeight(100, 130), w.waterHeightAt(100, 130, 0)) + 1.2
            h.p = { x: 100, y: y, z: 130 }; h.heading = Math.PI / 2; h.speed = 3; h.vy = -1
            h.vel = { x: 3, z: 0 }
            let n = 0
            while (n++ < 200 && !h.park) step(h, quiet(h))
            return `${h.hash}:${h.beltLand}:${h.park && h.park.zone}`
        }
        r.check('determinism: a belt landing replays identical (hash + banked HOVER + zone)', replayHash() === replayHash(), replayHash())

        // stateOf exposes the belt's strip work to the harness/contract
        const sb = stateOf(pk.h)
        r.check('stateOf: reports the banked belt landing and the park (plain JSON)',
            sb.beltLand === 700 && sb.parked === true && JSON.stringify(sb).length > 10,
            `beltLand=${sb.beltLand} parked=${sb.parked}`)
    }

if (process.argv.includes('--mutate')) {
    const MUTANTS = [
        ['the ring pass stops counting', SIMF, 'g.ringsPassed++', 'g.ringsPassed += 0'],
        ['a dead ring scores as if active', SIMF, 'if (d < CFG.RING_R + 1.5) {', 'if (Math.hypot(g.p.x - g.world.rings[7].x, g.p.y - g.world.rings[7].y, g.p.z - g.world.rings[7].z) < CFG.RING_R + 1.5) {'],
        ['the bullseye pays the 200 band', SIMF, 'PAD_BANDS: [[4.5, 1000], [9, 700], [15, 450], [24, 200]]', 'PAD_BANDS: [[4.5, 200], [9, 700], [15, 450], [24, 200]]'],
        ['sea contact becomes a landing', SIMF, "if (ter < 0.4) { ev(g, 'splash')", "if (false) { ev(g, 'splash')"],
        ['crates forget to score on landing', SIMF, 'let score = 0\n            for (const [rad, pts] of CFG.DROP_BANDS)', 'let score = 0\n            for (const [rad, pts] of [])'],
        ['the license thresholds vanish', SIMF, 'ACE: 2400, WINGS: 1500,', 'ACE: 0, WINGS: 0,'],
        ['the storm stops pulling the plane down', SIMF, 'g.p.y += st.vy * 0.6 * dt', 'g.p.y += 0 * st.vy * dt'],
        ['a dead thunderpass gate scores as if active', SIMF, 'const pg = w.passRings[g.passIdx]', 'const pg = w.passRings[4]'],
        ['near-miss crossing detection dies', SIMF, 'else if (d < CFG.RING_R + 7.5 && g.p.z >= r.z && g._zPrev < r.z) {', 'else if (false && d < CFG.RING_R + 7.5 && g.p.z >= r.z && g._zPrev < r.z) {'],
        ['the lift signal reads zero everywhere', SIMF, 'g.lift = w.thermalLift(g.p.x, g.p.z, g.t)', 'g.lift = 0 * w.thermalLift(g.p.x, g.p.z, g.t)'],
        ['the storm stops drifting', WORLDF, 'Math.sin(t * 0.045 + stormPh) * 64', '0 * Math.sin(t * 0.045 + stormPh) * 64'],
        ['physics ignores the painted drift (the clouds lie)', WORLDF, 'const p = stormPos(t)', 'const p = storm'],
        ['the cell wanders inland', WORLDF, '+ stormPh) * 64 +', '+ stormPh) * 192 +'],
        ['the rain bed ignores cell depth', SIMF, 'return { gain: +(0.006 + 0.048 * d * d).toFixed(4), cut: Math.round(240 + 760 * d) }', 'return { gain: 0, cut: 0 }'],
        ['the core sting loses its hysteresis (machine-gun thunder)', SIMF, "if (a >= 0.5 && b < 0.38) return 'core'", "if (a >= 0.5) return 'core'"],
        ['the glider stops reading storm depth (silent bed on the saddle craft)', SIMF, 'g.stormS = storm.s // #3272: the bed follows EVERY craft, not just the plane\n    g.lift = w.thermalLift(g.p.x, g.p.z, g.t)', 'g.lift = w.thermalLift(g.p.x, g.p.z, g.t)'],
        ['the ring edge goes hard again (phase lottery returns)', WORLDF, 'const ring = 1.4 * Math.exp(-(dr * dr) / (2 * 34 * 34))', 'const ring = Math.abs(dr) < 55 ? 1.4 : 0'],
        ['storm phase collapses to one for small seeds (the clock-only lottery)', WORLDF, '((r * 2654435761) >>> 0) % 6283', '(r >>> 13) % 6283'],
        ['the sky dims toward the dead east again (JS-side fixed bearing)', 'src/games/Skyward/renderer.js', 'const sd = world.skyDimDir(t, camera.position.x, camera.position.y, camera.position.z)', 'const sd = { x: 0.86, y: 0.34, z: -0.06 }'],
        ['the sky shader ignores the bearing uniform (fixed east returns in GLSL)', 'src/games/Skyward/renderer.js', 'dot(normalize(uStormDir), normalize(vW - uCam))', 'dot(normalize(vec3(0.86,0.34,-0.06)), normalize(vP))'],
        ['the dim bearing aims at the cell home, not its place (#3272-3)', WORLDF, 'const q = stormPos(t)', 'const q = storm'],
        ['the sky deck sinks to the waterline (#3272-3)', WORLDF, 'const SKY_DECK_Y = 185', 'const SKY_DECK_Y = 2'],
        ['the plane engine goes silent (no bed, back to per-action beeps)', SIMF, 'raw = 0.004 + 0.030 * load', 'raw = 0 * load'],
        ['storm duels the engine instead of ducking it', SIMF, 'gain: +(raw * (1 - 0.5 * d)).toFixed(4),', 'gain: +(raw * (1 + 0.5 * d)).toFixed(4),'],
        ['the spool cue loses its hysteresis (chirping boarding)', SIMF, "if (b < 0.006 && a >= 0.012) return 'spool'", "if (a >= 0.012) return 'spool'"],
        ['the glider grows an engine (the bed sings on a motorless wing)', SIMF, 'raw = thrusting ? 0.026 : 0.014\n        freq = thrusting ? 128 : 92', 'raw = thrusting ? 0.026 : 0.014\n        freq = thrusting ? 128 : 92\n    } else {\n        raw = 0.020; freq = 110'],
        ['the strip pays nothing', SIMF, "finishEvent(g, 'spot', strip.score)", "finishEvent(g, 'spot', 0)"],
        ['the far strip zone collapses onto the short one', SIMF, 'STRIP_ZONES: [[0.25, 150], [0.5, 300], [0.75, 450], [1, 700]]', 'STRIP_ZONES: [[0.25, 150], [0.5, 150], [0.75, 150], [1, 150]]'],
        ['the strip alignment law goes blind', SIMF, 'if (Math.abs(e) > CFG.STRIP_ALIGN) return', 'if (false) return'],
        ['the strip carves below its deck', WORLDF, 'if (d <= runway.half) h = runway.deck', 'if (d <= runway.half) h = runway.deck - 2'],
        ['#3319 the plane catches cruise speed too (hot arrivals land)', SIMF, 'if (!(vy > -CFG.PLANE_SINK && vy < CFG.PLANE_CLIMB && speed < CFG.PLANE_SPEED)) return null', 'if (!(vy > -CFG.PLANE_SINK && vy < CFG.PLANE_CLIMB)) return null'],
        ['#3319 the plane sink band is disabled (dives pay zones)', SIMF, 'vy > -CFG.PLANE_SINK && vy < CFG.PLANE_CLIMB', 'vy > -99 && vy < CFG.PLANE_CLIMB'],
        ['#3319 a plane landing banks nothing (badge stays empty)', SIMF, 'g.land = Math.max(g.land, touch.score)', 'g.land = Math.max(g.land, 0)'],
        ['#3319 the rollout has no friction (coasts off the end, no crew)', SIMF, 'g.speed *= CFG.PLANE_FRICTION', 'g.speed *= 1'],
        ['#3319 the wheels-abort is dead (no touch-and-go)', SIMF, 'if (sy > 0 && g.speed >= CFG.PLANE_LIFTOFF) {', 'if (false) {'],
        ['#3319 the departure grace never arms (the deck splats its own go-around)', SIMF, 'g._depart = 1.5 // grace to climb clear before the crash law re-arms', 'g._depart = 0'],
        ['#3331 the go-around window is dead (hot arrivals splat again)', SIMF, 'if (!(speed >= CFG.PLANE_SPEED && speed < CFG.PLANE_HOT_MAX)) return null', 'if (true) return null'],
        ['#3331 the bounce forgets its grace (bounces straight into a crash)', SIMF, '                g._depart = 1.5', '                g._depart = 0'],
        ['#3331 the clean rollout pays no credit (the ✈ best never grows)', SIMF, 'if (clean) g.land = Math.max(g.land, gd.score + CFG.ROLL_CREDIT)', 'if (clean) g.land = Math.max(g.land, gd.score)'],
        ['#3331 the scuff tell always says straight (no warning before the deck)', SIMF, 'const tell = clamp((Math.abs(e) - CFG.TELL_GRIP) / (CFG.STRIP_ALIGN - CFG.TELL_GRIP), 0, 1)', 'const tell = 0'],
        ['#3332 the strip forgets the belt (settle stays scoreless)', SIMF, "ev(g, 'land', { craft: 'belt', strip: true,", "ev(g, 'settle', { craft: 'belt', strip: false,"],
        ['#3332 the park band ignores the sink (dives park too)', SIMF, 'if (!(vy > -CFG.BELT_SINK && vy < CFG.BELT_RISE && speed < CFG.BELT_SPEED)) return null', 'if (!(vy < CFG.BELT_RISE && speed < CFG.BELT_SPEED)) return null'],
        ['#3332 the park band ignores the drift (fast crossings park)', SIMF, 'if (!(vy > -CFG.BELT_SINK && vy < CFG.BELT_RISE && speed < CFG.BELT_SPEED)) return null', 'if (!(vy > -CFG.BELT_SINK && vy < CFG.BELT_RISE)) return null'],
        ['#3332 the bank forgets the belt (HOVER stays empty)', SIMF, 'g.beltLand = Math.max(g.beltLand, touch.score)', 'g.beltLand = Math.max(g.beltLand, 0)'],
        ['#3332 the park never releases (throttle-deaf pad)', SIMF, "if (a) { g.park = null; ev(g, 'liftoff') }", "if (false) { g.park = null; ev(g, 'liftoff') }"],
        ['#3332 the crossing fires every tick (a firm settle parks a tick late)', SIMF, 'if (g.phase === \'free\' && g.respawnT <= 0 && g._air) {', 'if (g.phase === \'free\' && g.respawnT <= 0) {'],
        ['#3332 the crew never chocks (a parked belt blows downwind)', SIMF, 'g.p.y = deck + 0.8\n        g.vy = 0; g.vel.x = 0; g.vel.z = 0; g.speed = 0\n        g.roll = lerp(g.roll, 0, 0.2)', 'g.p.y = deck + 0.8\n        g.p.x += w.wind.x * dt; g.p.z += w.wind.z * dt\n        g.vy = 0; g.vel.x = 0; g.vel.z = 0; g.speed = 0\n        g.roll = lerp(g.roll, 0, 0.2)'],
        ['#3300 wind blows on the plane too (motorless honesty broken)', SIMF, "if (craft !== 'glider') return { gain: 0, cut: 0 }", "if (craft !== 'plane') return { gain: 0, cut: 0 }"],
        ['#3300 the wind ignores the storm (rush duels the rain)', SIMF, 'gain: +((0.003 + 0.024 * k * k) * (1 - 0.5 * d)).toFixed(4)', 'gain: +(0.003 + 0.024 * k * k).toFixed(4)'],
        ['#3300 the rush ignores airspeed (a constant hiss teaches nothing)', SIMF, 'if (v <= 9) return { gain: 0, cut: 0 } // a slow float stays hushed', 'if (v <= 999) return { gain: 0, cut: 0 } // a slow float stays hushed'],
        ['#3300 the wind bed shouts (rush drowns the ring tones)', SIMF, 'gain: +((0.003 + 0.024 * k * k) * (1 - 0.5 * d)).toFixed(4)', 'gain: +((0.03 + 0.24 * k * k) * (1 - 0.5 * d)).toFixed(4)'],
        ['#3300 the engine stays dark at full throttle (cut frozen shut)', SIMF, 'cut = 600 + 1600 * load', 'cut = 600'],
        ['#3310 a slack sock streams as if in a gale (the droop law dies)', SIMF, 'const droop = clamp(1 - sp / 2.2, 0, 1) * 0.9', 'const droop = 0'],
        ['#3310 the sock flies in dead calm (dir never rests)', SIMF, 'if (!Number.isFinite(sp) || sp < 0.05) return { dir: null, droop: 0.9, sway: 0, flutter: 0 }', 'if (false) return { dir: null, droop: 0.9, sway: 0, flutter: 0 }'],
        ['#3310 the painted zone whites sink into dusk again (no emissive floor)', 'src/games/Skyward/renderer.js', 'const white = new THREE.MeshLambertMaterial({ color: 0xf2f4f5, emissive: 0x7b8187 })', 'const white = new THREE.MeshLambertMaterial({ color: 0xf2f4f5 })'],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { r.check(`mutant anchor: ${name}`, false, file); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, [SELF], { encoding: 'utf8' })
        if (res.status !== 0) { died++; r.check(`mutant dies: ${name}`, true) }
        else r.check(`mutant dies: ${name}`, false, 'child passed despite the bug')
        pull(file)
    }
    r.check(`all ${MUTANTS.length} mutants die`, died === MUTANTS.length, `${died}/${MUTANTS.length}`)
}

r.exit()
