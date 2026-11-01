// RALLY CO-DRIVER SIM (#1251) — the night rally in one pure module:
// car physics in track space (s along the ribbon, lat across it), the
// co-driver's note pipeline (calls → pace card → corner grading), laps and
// stage time. No DOM, no clock, no Math.random: the seed drives everything
// the sim consumes (the determinism law), so rallycheck runs it in plain
// Node and the browser draws what state() says.
//
// Track space is the whole trick: the car's progress is s (arc length,
// wraps at L) and its cross position lat (+ right of the centerline). The
// ribbon never ends, so there is no win-by-reach goal to game — the stage
// ends when two laps are done, and the only score is the clock.

import { makeStage, stageAt, visibleAhead, distAhead, cornerAhead, kappaAt, slopeAt, postsFor, STAGE_L, ROAD_HALF, SHOULDER, FOG_RANGE } from './stage.js'
import { mulberry32 } from './stage.js'
import { decideCoCall, applyCallEvent, resolvePassed, coCallFromPad, leadDist, LATE_WINDOW, callLabel } from './calls.js'

export { STAGE_L, ROAD_HALF, SHOULDER, FOG_RANGE, visibleAhead, stageAt, distAhead, cornerAhead, kappaAt, slopeAt, postsFor, mulberry32, leadDist, LATE_WINDOW, callLabel }

// physics constants (per tick at 60 Hz)
export const VMAX = 4.6
export const ACCEL = 0.055
export const BRAKE = 0.09
export const DRAG = 0.995
export const OFF_DRAG = 0.965
export const OFF_CAP = 2.5
export const STEER = 0.078
export const LAPS = 2

// Stage variety (#1407): curated seeds (every one rallycheck-proven to have
// >= 10 corners and to be CPU-winnable) and weather presets. Weather scales
// two sim laws — the fog wall (fog multiplier on FOG_RANGE, fed to
// visibleAhead) and grip (a multiplier on the DRIFT_K centrifugal term).
// It changes HOW the same ribbon drives, never the ribbon itself.
export const WEATHERS = {
    clear: { fog: 1.0, grip: 1.0 },
    mist: { fog: 0.62, grip: 1.0 },
    rain: { fog: 0.8, grip: 1.22 },
}
export const WEATHER_ORDER = ['clear', 'mist', 'rain']
export const CURATED = [
    { seed: 1, name: 'LAKE' },
    { seed: 7, name: 'PINE' },
    { seed: 11, name: 'TARN' },
    { seed: 23, name: 'MIRE' },
    { seed: 42, name: 'FELL' },
]
// DRIFT_K — the centrifugal pull of a curve: lat += v·sin(align) − v²·κ·K.
// This is what makes corners REAL: a curve of curvature κ flings the car
// outward, and the driver must counter-steer (and brake for severity) to
// keep the line. Without it the ribbon is a straight with labels on it.
export const DRIFT_K = 1.8

// Gears for the engine note (shell audio, but pure so rallycheck can pin it):
// stepped-RPM — pitch snaps between ratios instead of one continuous sweep.
export const GEAR_STEPS = [0, 0.9, 1.6, 2.3, 3.1, 3.9]
// gearOf(v) → { gear: 0..GEAR_STEPS.length-2, frac: 0..1 within the gear }
export function gearOf(v) {
    let i = 0
    while (i < GEAR_STEPS.length - 1 && v >= GEAR_STEPS[i + 1]) i++
    const lo = GEAR_STEPS[i], hi = GEAR_STEPS[i + 1]
    return { gear: i, frac: Math.max(0, Math.min(1, (v - lo) / (hi - lo))) }
}

// controlS(st) → s of the lap's time-control mark (#1427 depth): the midpoint
// of the straight farthest from the start line (score = distance of the gap
// midpoint to s=0 on either side), so the flyspeaker sits mid-lap — never a
// step past the lap line, which would stamp a bogus near-zero S-split. Far from
// any corner too, so the mark never reads as a note. Pure geometry off the
// corner list — zero rng draws, identical across weather presets (rallycheck).
export function controlS(st) {
    const cs = st.corners.map((c) => c.s).sort((a, b) => a - b)
    let best = st.L / 2, bestScore = -1
    for (let i = 0; i < cs.length; i++) {
        const a = cs[i]
        const b = i + 1 < cs.length ? cs[i + 1] : cs[0] + st.L
        const m = (a + b) / 2 % st.L
        const score = Math.min(m, st.L - m) // how mid-lap the midpoint sits
        if (score > bestScore) { bestScore = score; best = m }
    }
    return best
}

// createSim(seed, players, weather) — weather is a preset key of WEATHERS
// (default 'clear'); an unknown key degrades to clear rather than throwing,
// so a stale shell state can never take the sim down. Weather changes NO
// rng draws: the stage geometry is byte-identical across presets.
export function createSim(seed = 1, players = 2, weather = 'clear') {
    const w = WEATHERS[weather] || WEATHERS.clear
    const stage = makeStage(seed)
    const rng = mulberry32((seed ^ 0x9e3779b9) | 0)
    // the co-driver's bookkeeping is per-corner, independent of laps: called
    // is a ring the car refills every lap (a corner called on lap 1 is a
    // fresh corner on lap 2 — notes are per pass, like the real thing).
    const co = {
        kind: players >= 2 ? 'cpu' : 'off',
        nextIdx: 0,
        called: new Array(stage.corners.length).fill(null),
        prevPad: {},
        lastCall: null,
        lap: 0,
    }
    const gs = {
        seed,
        stage,
        rng,
        weather: WEATHERS[weather] ? weather : 'clear',
        w,
        tick: 0,
        done: false,
        win: false,
        lapsDone: 0,
        LAPS,
        car: { s: 0, lat: 0, v: 0, align: 0, off: false, prevS: 0 },
        co,
        card: [],
        stats: { called: 0, correct: 0, late: 0, missed: 0, offTicks: 0 },
        timeMs: 0,
        lastLapMs: 0,
        splits: [], // per-lap split times in ms (the lap-line banner reads these)
        // #1427 checkpoint clock: one time-control mark per lap at gs.control;
        // controlMs records the stage clock at each crossing (the S-splits)
        control: controlS(stage),
        controlMs: [],
        vis: 0,
        events: [], // { t, kind, ... } for juice + juiceaudit
    }
    gs.vis = visibleAhead(stage, 0, FOG_RANGE * w.fog)
    return gs
}

// cpuCoDriverPad(gs) → raw co-driver pad this tick (the seat emits PADS;
// coCallFromPad judges the edge). One tick high, next tick low — a tap.
export function cpuCoDriverPad(gs) {
    const call = decideCoCall(gs)
    if (!call) return {}
    const pad = {}
    if (call.dir < 0) pad.left = true
    else if (call.dir > 0) pad.right = true
    else pad.up = true
    if (call.sev >= 3) pad.b = true
    else if (call.sev === 2) pad.a = true
    return pad
}

// cpuDriverPad(gs) → raw driver pad. The autopilot obeys HUMAN rules — it is
// the harness's fair play and the attract demo: it reads ONLY the pace card
// (what was called) and the visible road (visibleAhead + cornerAhead), never
// the stage truth past the crests. rallycheck's win gate is this function.
export function cpuDriverPad(gs) {
    const car = gs.car
    const st = gs.stage
    const pad = { up: true }
    // 1) what was called: the nearest live card entry still ahead
    let note = null
    for (const n of gs.card) {
        if (n.atS == null) continue
        const d = distAhead(st, car.s, n.atS)
        if (d > 0 && d < 700 && (!note || d < note.d)) note = { ...n, d }
    }
    // 2) what is visible: the nearest real corner the road admits
    let seen = null
    for (const c of cornerAhead(st, car.s, gs.vis)) {
        if (c.d < 300) { seen = c; break }
    }
    // counter-steer target: a named corner sets the angle (severity = how
    // hard), and a PROPORTIONAL RETURN against the drift — desired -= lat·g
    // — is how a human keeps the line honest without knowing the radius.
    const active = seen || (note && note.d < 340 ? note : null)
    let desired = 0
    if (active) desired = active.dir * (0.10 + 0.13 * active.sev) * (car.v / VMAX)
    desired -= car.lat * 0.006
    const diff = desired - car.align
    if (diff < -0.05) pad.left = true
    else if (diff > 0.05) pad.right = true
    // throttle: lift before a close threat, brake inside the flat — but a
    // stopped car always creeps forward (a human never holds the brake on a
    // live corner: the threat distance must shrink to release it)
    const threat = (seen && seen.d < 240) ? seen : (note && note.d < 340 ? note : null)
    if (threat) {
        if (threat.d < 50 + 30 * threat.sev) { pad.up = false; pad.down = true }
        else if (threat.d < 95 + 55 * threat.sev) pad.up = false
    }
    if (car.v < 0.6) { pad.down = false; pad.up = true }
    // off the ribbon: get back home
    if (car.off) {
        if (car.lat > 0) pad.left = true
        else pad.right = true
        pad.up = true
        pad.down = false
    }
    return pad
}

// tickSim(gs, pads) — advance exactly one tick. pads = [driver, co] raw pads
// (the contract's shape; a missing co pad leaves the co-driver idle).
export function tickSim(gs, pads) {
    if (gs.done) return gs
    const [dIn, cIn] = [pads && pads[0] || {}, pads && pads[1] || null]
    const car = gs.car
    const st = gs.stage
    gs.tick++
    gs.timeMs += 1000 / 60

    // ---- co-driver: decide → pad → edge judge → card -------------------
    let coPad = cIn
    if (coPad == null && gs.co.kind === 'cpu') coPad = cpuCoDriverPad(gs)
    if (coPad) {
        const call = coCallFromPad(gs.co.prevPad, coPad)
        if (call) {
            gs.co.lastCall = call
            const linked = applyCallEvent(gs, call, gs.co.kind === 'cpu' ? 'cpu' : 'human')
            gs.events.push({ t: gs.tick, kind: linked >= 0 ? 'note' : 'noisecall', call })
        }
        gs.co.prevPad = coPad
    } else {
        gs.co.prevPad = {}
    }

    // ---- driver physics --------------------------------------------------
    const steer = (dIn.left ? -1 : 0) + (dIn.right ? 1 : 0)
    if (dIn.up && car.v < VMAX) car.v += ACCEL
    car.v *= DRAG
    if (dIn.down) car.v = Math.max(0, car.v - BRAKE)
    if (dIn.a) { // handbrake: looser line, slower
        car.align += steer * 0.05 * (0.4 + 0.6 * car.v / VMAX)
        car.v *= 0.988
    }
    if (steer) car.align += steer * STEER * (0.35 + 0.65 * car.v / VMAX) * (1 - 0.3 * Math.abs(car.align))
    else car.align *= 0.982
    car.align = Math.max(-1.35, Math.min(1.35, car.align))
    if (Math.abs(car.align) > 0.95) car.v *= 0.985 // wide: scrubbing speed

    const ds = car.v * Math.cos(car.align)
    const dlat = car.v * Math.sin(car.align)
    // rain loosens the grip law (grip > 1 flings the car wider in a curve);
    // a preset never removes grip, it only takes some of it away
    const drift = car.v * car.v * kappaAt(st, car.s) * DRIFT_K * gs.w.grip
    car.prevS = car.s
    car.s = (car.s + ds) % st.L
    if (car.s < 0) car.s += st.L
    car.lat += dlat - drift
    car.lat = Math.max(-85, Math.min(85, car.lat))
    car.off = Math.abs(car.lat) > ROAD_HALF
    if (car.off) {
        car.v = Math.min(car.v * OFF_DRAG, OFF_CAP)
        gs.stats.offTicks++
    }

    // ---- corners passed → grade the co-driver ------------------------------
    // crossed this tick: the corner sat within this tick's travel ahead of
    // prevS and is now just behind s (wrap-safe, fires exactly once —
    // ds is bounded by VMAX < 5, so the a/b windows cannot alias).
    for (let i = 0; i < st.corners.length; i++) {
        const a = distAhead(st, car.prevS, st.corners[i].s)
        const b = distAhead(st, car.s, st.corners[i].s)
        if (a <= 5 && b >= st.L - 10) resolvePassed(gs, i)
    }

    // ---- laps -------------------------------------------------------------
    if (car.prevS > car.s) {
        gs.lapsDone++
        const split = Math.round(gs.timeMs - gs.lastLapMs)
        gs.lastLapMs = gs.timeMs
        gs.splits.push(split)
        gs.events.push({ t: gs.tick, kind: 'lap', laps: gs.lapsDone, split })
        if (gs.lapsDone >= gs.LAPS) {
            gs.done = true
            gs.win = true
            gs.events.push({ t: gs.tick, kind: 'finish' })
            return gs
        }
        // the co-driver's note flow is continuous (unbounded nextIdx) — no
        // reset here; resolvePassed cleared each corner's stamp on the pass
    }

    // ---- time control (#1427) — one crossing per lap --------------------
    // same straddle shape as the corner grading: the mark sat within this
    // tick's travel ahead of prevS and is now just behind s. The length-vs-
    // lapsDone guard lets each lap stamp exactly one S-split.
    if (gs.controlMs.length === gs.lapsDone) {
        const aC = distAhead(st, car.prevS, gs.control)
        const bC = distAhead(st, car.s, gs.control)
        if (aC <= 5 && bC >= st.L - 10) {
            gs.controlMs.push(Math.round(gs.timeMs))
            gs.events.push({ t: gs.tick, kind: 'control', ms: gs.controlMs[gs.controlMs.length - 1] })
        }
    }

    // ---- visibility (crest honesty; the fog wall shortens in weather) --------
    gs.vis = visibleAhead(st, car.s, FOG_RANGE * gs.w.fog)

    // card aging: entries whose corner is behind the car fall off
    gs.card = gs.card.filter((n) => {
        if (n.atS == null) return gs.tick - n.t < 720
        return distAhead(st, car.s, n.atS) > 0
    })
    return gs
}

// lapProgress(gs) → { total, done } — the NOTES-card lap-progress strip.
// `total` is the stage's corner count; `done` lists, in track order, the
// corners the car has ALREADY PASSED this lap (each with the true dir/sev).
// The no-leak law: a corner enters `done` only once it is at or behind the
// car (distAhead(car → corner) === 0), so the strip can never show the shape
// of what is ahead — only how much of this lap is done. rallycheck pins it.
export function lapProgress(gs) {
    const st = gs.stage
    const done = st.corners.filter((c) => c.s <= gs.car.s + 1e-9)
        .map((c) => ({ dir: c.dir, sev: c.sev }))
    return { total: st.corners.length, done }
}

// stateHash — the determinism digest (quantized, stable across platforms).
export function stateHash(gs) {
    const c = gs.car
    const h = [
        gs.tick,
        Math.round(c.s * 100), Math.round(c.lat * 100),
        Math.round(c.v * 1000), Math.round(c.align * 1000),
        gs.lapsDone,
        gs.stats.called, gs.stats.correct, gs.stats.late, gs.stats.missed, gs.stats.offTicks,
        gs.card.length + ':' + gs.card.map((n) => n.linked + n.dir + n.sev).join(','),
        gs.done ? 1 : 0,
        gs.controlMs.length + ':' + gs.controlMs.join(','),
    ].join('|')
    let hv = 2166136261 >>> 0
    for (let i = 0; i < h.length; i++) {
        hv ^= h.charCodeAt(i)
        hv = Math.imul(hv, 16777619)
    }
    return hv >>> 0
}

// state — the contract's JSON shape.
export function state(gs) {
    const c = gs.car
    return {
        tick: gs.tick,
        score: Math.round(gs.timeMs),
        done: gs.done,
        win: gs.win,
        players: gs.co.kind === 'off' ? 1 : 2,
        seed: gs.seed,
        weather: gs.weather,
        laps: gs.lapsDone,
        LAPS: gs.LAPS,
        speed: Math.round(c.v * 100) / 100,
        off: c.off,
        vis: Math.round(gs.vis),
        progress: lapProgress(gs),
        card: gs.card.map((n) => ({
            label: callLabel({ dir: n.dir, sev: n.sev }),
            d: n.atS == null ? null : Math.round(distAhead(gs.stage, c.s, n.atS)),
        })),
        stats: { ...gs.stats },
        splits: [...gs.splits],
        control: Math.round(gs.control),
        controls: [...gs.controlMs],
        hash: stateHash(gs),
    }
}
