// COMET DRIFT GP — the pure machine. step(g, inp) mutates state; nothing
// here reads the clock, the DOM or Math.random: every die is mulberry32 off
// the seed, so the Node harness, the attract demo and a phone replay all run
// the identical race. No items — this kart's whole economy is the DRIFT:
// hold it mid-corner and the charge pays a mini-turbo on release. The same
// drive() runs the player and every rival; brains differ only in skill and
// in who computes the input (keys, the seeded rival mistakes, or decide()).

import { TRACK, CHECKPOINTS, surfaceAt, TX, TY, COURSE, courseIndex } from './track.js'

export const LAPS = 4

export const CFG = {
    top: 8.6, acc: 0.075, brake: 0.24, coast: 0.014,
    kerbTop: 7.2, sandTop: 3.4,
    steer: 0.062, driftMul: 1.6, slide: 0.12, gripV: 2.7,
    spinT: 45, bumpV: 0.42, bumpCd: 12,
    wallLimit: 132, kartR: 34,
    boostAcc: 0.16,
    count: 180,
    // apex grace (#471): crossing zero steering mid-drift (heading aligned
    // with the target for a tick) is not a drift release — while drift and
    // speed are held, the slide survives that long of steering-zero. Without
    // it, the ideal line (or a human's apex correction) dumps the charge at
    // every apex and the ladder never pays in a real race.
    driftGrace: 9,
}

// the drift charge ladder: hold 50 ticks for the blue spark and a small
// turbo, 105 for violet, 165 for the gold comet. Releasing early banks the
// highest tier reached — a half-held drift is a half boost, never nothing.
export const TIERS = [
    { t: 50, dur: 42, over: 1.6 },
    { t: 105, dur: 66, over: 2.6 },
    { t: 165, dur: 90, over: 3.6 },
]

// the Gulch's seven-car field — original drivers, skill in top-speed units.
export const RIVALS = [
    { name: 'BLAZE', color: 'blaze', skill: 0.86 },
    { name: 'DUSTY', color: 'dusty', skill: 0.845 },
    { name: 'NOVA', color: 'nova', skill: 0.83 },
    { name: 'REX', color: 'rex', skill: 0.815 },
    { name: 'ZEPPA', color: 'zeppa', skill: 0.8 },
    { name: 'GRIZZ', color: 'grizz', skill: 0.785 },
]
export const PLAYER = { name: 'COMET', color: 'comet', isPlayer: true }

const T = TRACK
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }

// mulberry32 as a stateless step over a number — the seed rides INSIDE the
// state object, so snapshots stay JSON and two runs of one seed are equal
// by construction.
function rngStep(s) {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return [s, (((t ^ (t >>> 14)) >>> 0) / 4294967296)]
}
const rnd = (g) => { const [s, v] = rngStep(g.rngState); g.rngState = s; return v }

function mkKart(def, row) {
    const back = 60 + row * 92
    const i = Math.round((T.N - back / (T.len / T.N))) % T.N
    const p = T.pts[(i + T.N) % T.N]
    const side = row % 2 ? 1 : -1
    const lat = side * 44
    return {
        ...def, row,
        x: p.x + Math.cos(p.a + Math.PI / 2) * lat,
        y: p.y + Math.sin(p.a + Math.PI / 2) * lat,
        a: p.a, v: 0, idx: i, hint: i,
        boostT: 0, boostTier: -1, spinT: 0, driftT: 0, charge: -1, steerVis: 0, driftG: 0,
        cp: 0, lap: 0, lapStart: 0, lapTimes: [], place: row + 1,
        finished: false, finishT: 0,
        offroad: false, bumpCd: 0, anim: 0, goT: 0,
        mist: 0, mistWide: false,
    }
}

export function makeGame(seed = 0) {
    const g = {
        tick: 0, phase: 'count', count: CFG.count, seed: seed >>> 0,
        course: COURSE.id,
        rngState: (seed >>> 0) | 1,
        // the player starts LAST (row 6): the whole race is the overtake
        karts: [mkKart(PLAYER, 6), ...RIVALS.map((d, i) => mkKart(d, i))],
        events: [], end: null,
    }
    for (const k of g.karts) k.goT = Math.floor(rnd(g) * 7)
    return g
}

function progress(k) {
    return k.lap * T.len + (k.finished ? T.len : T.pts[k.idx].s)
}

function rank(g) {
    const score = (k) => (k.finished ? 1e12 - k.finishT : progress(k))
    const order = [...g.karts].sort((a, b) => score(b) - score(a))
    order.forEach((k, i) => { k.place = i + 1 })
}

function spin(k, g, why, by) {
    if (k.spinT > 0 || k.finished) return
        k.spinT = CFG.spinT
    k.boostT = 0; k.boostTier = -1; k.driftT = 0; k.charge = -1; k.driftG = 0
    g.events.push({ e: 'spin', who: k.name, why, by })
}

function tierFor(charge) {
    let t = -1
    for (let i = 0; i < TIERS.length; i++) if (charge >= TIERS[i].t) t = i
    return t
}

// One kart, one tick. Player and CPU run THIS function; only the input
// source differs. The drift is the machine's heartbeat: charge while held,
// pay the ladder on release.
function drive(g, k, inp) {
    if (k.finished) {
        k.v *= 0.97
        k.x += Math.cos(k.a) * k.v; k.y += Math.sin(k.a) * k.v
        return
    }
    if (k.spinT > 0) {
        k.spinT--
        k.a += 0.34
        k.v *= 0.975
    } else {
        const surf = surfaceAt(k.x, k.y, k.hint)
        k.hint = surf.i; k.idx = surf.i
        k.offroad = surf.surf !== 'road'
        const top = surf.surf === 'sand' ? CFG.sandTop : surf.surf === 'kerb' ? CFG.kerbTop : CFG.top
        const boost = k.boostT > 0
        const cap = top + (boost ? TIERS[k.boostTier].over : 0)
        if (boost) { k.boostT--; if (k.v < cap) k.v += CFG.boostAcc; if (k.boostT === 0) k.boostTier = -1 }
        const steer = typeof inp.steer === 'number' ? inp.steer : ((inp.l ? -1 : 0) + (inp.r ? 1 : 0))
        const thr = typeof inp.thr === 'number' ? inp.thr : (inp.u ? 1 : 0)
        const brk = typeof inp.brk === 'number' ? inp.brk : (inp.d ? 1 : 0)
        if (thr > 0 && k.v < (boost ? cap : top)) k.v += CFG.acc * thr
        else if (thr <= 0 && k.v > top && !boost) k.v -= CFG.coast * 6
        if (brk > 0) k.v -= CFG.brake * brk
        if (thr <= 0 && brk <= 0 && k.v <= top && !boost) k.v -= CFG.coast
        if (surf.surf === 'sand' && k.v > top) k.v -= 0.22
        if (k.v > cap) k.v -= 0.2
        // slipstream: a kart in the narrow window dead ahead leaves a vacuum
        // the chaser rides — pack racing closes on straights and overtakes
        // happen in the open. Pure position math, no dice: deterministic for
        // every seed, and the same law applies to the leader chasing traffic.
        for (const o of g.karts) {
            if (o === k || o.spinT > 0) continue
            const dx = o.x - k.x; const dy = o.y - k.y
            const f = dx * Math.cos(k.a) + dy * Math.sin(k.a)
            const l = dx * -Math.sin(k.a) + dy * Math.cos(k.a)
            if (f > 55 && f < 190 && Math.abs(l) < 46) { k.v += 0.02; break }
        }
        k.steerVis = steer
        const grip = Math.min(1, k.v / CFG.gripV)
        const dr = inp.drift && k.v > 4.5 && (Math.abs(steer) > 0 || k.driftG > 0)
        if (dr) {
            k.driftG = Math.abs(steer) > 0 ? CFG.driftGrace : k.driftG - 1
            k.driftT++
            k.charge = Math.max(k.charge, k.driftT)
            k.a += steer * CFG.steer * grip * CFG.driftMul
            k.x += Math.cos(k.a + steer * Math.PI * 0.35) * k.v * CFG.slide
            k.y += Math.sin(k.a + steer * Math.PI * 0.35) * k.v * CFG.slide
        } else {
            if (k.driftT > 0 && k.charge >= 0) {
                const t = tierFor(k.charge)
                if (t >= 0) {
                    // the Comet engine breathes deeper than the field's kits
                    k.boostT = Math.round(TIERS[t].dur * (k.isPlayer ? 1.45 : 1)); k.boostTier = t
                    g.events.push({ e: 'boost', who: k.name, tier: t })
                }
            }
            k.driftT = 0; k.charge = -1; k.driftG = 0
            k.a += steer * CFG.steer * grip
        }
        if (surf.surf === 'wall') {
            // clamp EVERY tick: a one-shot clamp lets speed sneak past the
            // cliff between cooldowns
            const p = T.pts[surf.i]
            const side = Math.sign(surf.lat)
            k.x = p.x + Math.cos(p.a + Math.PI / 2) * side * CFG.wallLimit
            k.y = p.y + Math.sin(p.a + Math.PI / 2) * side * CFG.wallLimit
            if (k.bumpCd === 0) {
                k.v *= CFG.bumpV
                k.bumpCd = CFG.bumpCd
                g.events.push({ e: 'bump', who: k.name })
            }
        }
    }
    if (k.bumpCd > 0) k.bumpCd--
    k.v = Math.max(0, k.v)
    k.x += Math.cos(k.a) * k.v
    k.y += Math.sin(k.a) * k.v
    k.x = Math.max(30, Math.min(TX - 30, k.x))
    k.y = Math.max(30, Math.min(TY - 30, k.y))
    k.anim++
}

function checkpoints(g, k, prevS) {
    if (k.finished || prevS === undefined) return
    const s = T.pts[k.idx].s
    const wrapped = prevS > T.len * 0.7 && s < T.len * 0.3
    if (!wrapped) {
        for (let ci = 0; ci < CHECKPOINTS.length; ci++) {
            const c = CHECKPOINTS[ci]
            if (prevS < c && s >= c && (ci === 0 || k.cp & (1 << (ci - 1)))) k.cp |= 1 << ci
        }
    }
    const crossed = prevS > T.len - 500 && s < 500
    if (crossed && k.cp === (1 << CHECKPOINTS.length) - 1) {
        k.lap++
        k.lapTimes.push(g.tick - k.lapStart)
        k.lapStart = g.tick
        k.cp = 0
        g.events.push({ e: 'lap', who: k.name, lap: k.lap, t: k.lapTimes[k.lapTimes.length - 1] })
        if (k.lap >= LAPS) {
            k.finished = true
            k.finishT = g.tick
            g.events.push({ e: 'finish', who: k.name, place: k.place, t: k.finishT })
        }
    }
}

// the shared driver brain: apex line, curvature brake, drift with release
// timing, traffic avoidance, and (for the rivals) the seeded mistakes and
// the defensive shuffle. Skill scales nerve and top speed.
function brain(g, k, skill, driftSmart) {
    const inp = { u: true, d: false, l: false, r: false, drift: false }
    if (g.phase !== 'race' || k.finished) { if (g.phase !== 'race') inp.u = false; return inp }
    if (g.tick - k.lapStart < k.goT) inp.u = false
    const look = 4 + Math.round(k.v * 2.6)
    const t = T.pts[(k.idx + look) % T.N]
    const kmax = T.aheadK((k.idx + look) % T.N, look + 8)
    const arc = look * (T.len / T.N)
    let lat = -Math.sign(t.k) * Math.min(44, Math.abs(t.k) * 3.6e4)
    lat = Math.max(-arc * 0.3, Math.min(arc * 0.3, lat))
    // traffic: a kart in the cone ahead nudges the line to the open side
    for (const o of g.karts) {
        if (o === k || o.finished) continue
        const dx = o.x - k.x; const dy = o.y - k.y
        const f = dx * Math.cos(k.a) + dy * Math.sin(k.a)
        const l = dx * -Math.sin(k.a) + dy * Math.cos(k.a)
        if (f > 20 && f < 340 && Math.abs(l) < 56) lat += (l > 0 ? -1 : 1) * 30
    }
    lat = Math.max(-48, Math.min(48, lat))
    // defend: a chaser within two lengths behind pulls the line to centre
    for (const o of g.karts) {
        if (o === k || o.finished) continue
        const gap = progress(k) - progress(o)
        if (gap > 60 && gap < 460) lat *= 0.6
    }
    // seeded mistakes: only the human rivals roll — the autopilot is the
    // certified line and never errs (the harness's win proof rides that)
    if (!driftSmart && k.mist === 0 && k.spinT === 0 && kmax > 0.0025 && rnd(g) < 0.0016 + (1 - skill) * 0.004) {
        k.mist = 26
        k.mistWide = rnd(g) < 0.72
        if (!k.mistWide && skill < 0.93) { spin(k, g, 'overdriven', 'itself'); return inp }
    }
    if (k.mist > 0) {
        k.mist--
        if (k.mistWide) lat *= 1.9
        if (kmax > 0.0025) { inp.d = false; inp.u = true }
    }
    const tx = t.x + Math.cos(t.a + Math.PI / 2) * lat
    const ty = t.y + Math.sin(t.a + Math.PI / 2) * lat
    const want = Math.atan2(ty - k.y, tx - k.x)
    const da = wrap(want - k.a)
    if (da < -0.02) inp.l = true
    if (da > 0.02) inp.r = true
    const fear = skill * 0.05
    const vmax = Math.min(CFG.top * skill, fear / Math.max(kmax, 9e-4))
    if (k.v > vmax + 0.4) { inp.d = true; inp.u = false }
    // drift is driven by the CORNER, not the current misalignment: hold it
    // through the bend, and the straight after it pays the turbo
    const bend = kmax > (driftSmart ? 0.0015 : 0.0024)
    if (k.v > 5 && bend) inp.drift = true
    return inp
}

const cpuInput = (g, k) => brain(g, k, k.skill, false)

// the autopilot that drives the attract demo AND the harness win-proof:
// same brain, top skill, smarter drift release.
export function decide(g) {
    return brain(g, g.karts[0], 1.0, true)
}

function kartBump(g) {
    for (let i = 0; i < g.karts.length; i++) {
        for (let j = i + 1; j < g.karts.length; j++) {
            const a = g.karts[i]; const b = g.karts[j]
            const dx = b.x - a.x; const dy = b.y - a.y
            const d = Math.hypot(dx, dy)
            if (d > 0 && d < CFG.kartR * 2) {
                const push = (CFG.kartR * 2 - d) / 2
                const nx = dx / d; const ny = dy / d
                a.x -= nx * push; a.y -= ny * push
                b.x += nx * push; b.y += ny * push
                const dv = Math.abs(a.v - b.v)
                if (a.v > b.v) a.v -= dv * 0.04; else b.v -= dv * 0.04
            }
        }
    }
}

export function step(g, inp) {
    g.tick++
    if (g.end) return
    const P = g.karts[0]
    if (g.phase === 'count') {
        const prev = Math.ceil(g.count / 60)
        g.count--
        const now = Math.ceil(g.count / 60)
        if (now !== prev && now > 0) g.events.push({ e: 'count', n: now })
        if (g.count <= 0) {
            g.phase = 'race'
            g.events.push({ e: 'go' })
            for (const k of g.karts) k.lapStart = g.tick
        }
    }
    const locked = g.phase !== 'race'
    const pin = locked ? {} : inp || {}
    const pd = { u: !!pin.u, d: !!pin.d, l: !!pin.l, r: !!pin.r, drift: !!(pin.drift || pin.a || pin.b) }
    if (typeof pin.steer === 'number') pd.steer = pin.steer
    if (typeof pin.thr === 'number') pd.thr = pin.thr
    if (typeof pin.brk === 'number') pd.brk = pin.brk
    drive(g, P, pd)
    for (let i = 1; i < g.karts.length; i++) drive(g, g.karts[i], cpuInput(g, g.karts[i]))
    for (const k of g.karts) {
        checkpoints(g, k, k.lastS)
        k.lastS = T.pts[k.idx].s
    }
    kartBump(g)
    rank(g)
    if (P.finished && !g.end) {
        g.end = P.place === 1 ? 'win' : 'lose'
        g.events.push({ e: 'end', place: P.place, t: P.finishT })
    }
    g.events.splice(0, Math.max(0, g.events.length - 300))
}

export function stateHash(g) {
    let h = 2166136261
    const mix = (n) => { h ^= Math.round(n * 100) & 0xffffffff; h = Math.imul(h, 16777619) }
    mix(g.tick); mix(g.phase === 'race' ? 1 : 0); mix(g.rngState)
    for (const k of g.karts) { mix(k.x); mix(k.y); mix(k.a); mix(k.v); mix(k.lap); mix(k.place); mix(k.boostT); mix(k.driftT) }
    mix(courseIndex(g.course) + 1)
    return (h >>> 0).toString(16)
}

export function fmtTime(ticks) {
    const s = ticks / 60
    const m = Math.floor(s / 60)
    const r = s - m * 60
    return `${m}:${r.toFixed(2).padStart(5, '0')}`
}
