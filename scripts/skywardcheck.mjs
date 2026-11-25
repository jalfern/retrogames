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
import { makeGame, step, checkout, stateOf, stormBed, stormCue } from '../src/games/Skyward/sim.js'
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
