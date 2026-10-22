// SSX — planner.js : the autopilot. It IS the CPU field (sim.js asks it for
// every rider input, every tick), it drives the attract demo, and it is the
// witness scripts/ssxcheck.mjs uses to prove each heat is winnable — and still
// winnable at a 0.75x trick economy (the slack rule). No DOM, no Math.random;
// the constants mirror sim.js CFG and the harness pins that they agree.

import { segAt, terrainY, DS } from './course.js'

// pace and skill per CPU seat (seat 1 = front of the grid, the quickest)
export const PACE = [0.88, 0.85, 0.82, 0.79, 0.76]
export const SKILL = [0.92, 0.78, 0.72, 0.62, 0.55]

// #791 seeded miss rate: the field is error-prone, not just pace-limited.
// A seat takes a wipeout on landing with missChance(skill, pace) — slower and
// less skilled seats fall more often — so places change hands. The roll rides
// the LCG seeded into g._rs (sim.js makeGame), so every crash is replayable.
export const MISS = { base: 0.55, paceK: 0.6 }
export const missChance = (skill, pace) => MISS.base * (1 - skill) * (1 + MISS.paceK * (PACE[0] - pace))

const roll = (g) => { g._rs = (Math.imul(g._rs, 1664525) + 1013904223) >>> 0; return g._rs / 4294967296 }

// sim.js calls this at every CPU takeoff: the roll commits the seat to either
// a clean landing or a wipeout (crash what='miss') when it comes back down.
export const cpuMiss = (g, r) => roll(g) < missChance(SKILL[r.id - 1], PACE[r.id - 1])

// mirrors CFG in sim.js (ssxcheck pins these against CFG to catch drift)
const CFGP = { G: 22, STEER: 1.15, CENT: 0.30, flipRate: 520 }

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export function decide(g, r, hot = false) {
    const inp = { steer: 0, jump: false, boost: false, grab: false, flip: false }
    if (g.phase !== 'run' || r.tumble > 0) return inp
    const c = g.course
    const skill = r.isP ? 1 : SKILL[r.id - 1]
    const { seg } = segAt(c, r.s)

    if (r.air) {
        // predicted hang: how long until the slope meets the board again
        const gy = terrainY(c, r.s + r.v * 0.6, r.x)
        const ttl = (r.vy + Math.sqrt(Math.max(0, r.vy * r.vy + 2 * CFGP.G * (r.y - gy)))) / CFGP.G

        // spins: commit early, both directions earn the same ledger
        const dir = ((r.seedPhase * 5.1) % 2) < 1 ? 1 : -1
        if (skill > 0.45 && ttl > 0.55) inp.steer = dir

        // grab: mid-air, one grab per jump
        if (skill > 0.4 && !r.grab && r.airT > 0.12 && r.airT < Math.max(0.2, ttl - 0.25)) inp.grab = true

        // flips: only when the hang can be bought back in 360s of rotation
        const wantFlip = (r.over || skill > 0.72) && ttl > 1.05
        if (wantFlip && r.airT > 0.14 && r.flip < (r.over && skill > 0.9 ? 720 : 360) - 40 && ttl - r.airT > 0.35) inp.flip = true
        return inp
    }

    // ---- ground line ----
    let aim = Math.sin(r.s * 0.012 + r.seedPhase) * 0.3
    let nextK = null
    for (const k of c.kickers) {
        const lipS = k.lip * DS
        if (lipS > r.s + 4 && lipS - r.s < 70) { aim = k.x; nextK = { lipS, k }; break }
    }
    for (const p of c.pipes) {
        const s0 = p.i0 * DS
        if (s0 > r.s + 4 && s0 - r.s < 55) { aim = 0; nextK = null }
    }
    // rails: the skilled ride them when they line up
    if (skill > 0.72 && !nextK) {
        for (const rl of c.rails) {
            const s0 = rl.i0 * DS
            if (s0 > r.s && s0 - r.s < 45 && Math.abs(rl.x - r.x) < 0.9) { aim = rl.x; break }
        }
    }
    // obstacles veto the line
    for (const ob of c.obstacles) {
        const os = ob.i * DS
        if (os > r.s + 1 && os - r.s < Math.max(16, r.v * 0.9) && Math.abs(ob.x - r.x) < ob.r + 0.3) {
            aim = ob.x > r.x ? clamp(r.x - 0.8, -1, 1) : clamp(r.x + 0.8, -1, 1)
        }
    }
    const feed = seg.curve * CFGP.CENT * 30 / CFGP.STEER
    inp.steer = clamp((aim - r.x) * 2.4 + feed, -1, 1)

    // crouch into the lip, snap the release at it
    if (nextK) {
        const d = nextK.lipS - r.s
        inp.jump = d < nextK.k.power * 2 + r.v * 0.30 && d > r.v * 0.07
    }

    // spend the meter on the straights
    // #791 attract hotness: the demo keeps its tank full into the lips and
    // refuels on the fall (inp.fuel — sim.js only honours it for a hot input),
    // so it arrives at kickers OVER: the doubled pay and the over-the-top
    // names are the original's attract signature. Only the attract witness
    // (hot=true) gets this; the race witness and the CPU field keep the cold
    // spend path byte-identical.
    const keep = hot ? 70 : 45
    const lipClose = hot && nextK && nextK.lipS - r.s < 40
    if (hot) inp.fuel = true
    if (r.meter > keep && Math.abs(seg.curve) < 0.012 && !lipClose) inp.boost = true
    return inp
}
