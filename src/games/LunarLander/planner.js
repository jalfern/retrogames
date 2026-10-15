// LUNAR LANDER — planner.js : the autopilot. It flies the SAME pure sim the
// player and the harness fly, with honest powered-descent guidance, and emits an
// input script. The attract demo replays that script tick-for-tick, and
// scripts/landercheck.mjs re-runs it (plus the slack re-win on thinner tanks) to
// prove the game is genuinely winnable.
//
// The policy is what the arcade pilot's thumb learns: an approach law where the
// sink speed scales with altitude, the tilt closes the horizontal error, and the
// throttle is the bang-bang answer to the vertical acceleration demanded
// (coast when gravity is already enough). Terminal phase over the pad is a
// gentle hover-sink pulse. Docking solves a constant-accel intercept against
// the orbiter's future position.

import { makeGame, step, CFG, ORBIT_Y } from './sim.js'
import { WORLD_W } from './terrain.js'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function steerTo(g, desired) {
    if (desired > g.rot + 0.028) return 1
    if (desired < g.rot - 0.028) return -1
    return 0
}

export function decide(g) {
    if (g.phase === 'crashed') return { rot: 0, thrust: false }
    if (g.phase === 'landed') {
        // time the launch so the climb meets the orbiter at mid-map — waiting
        // on the pad is free fuel. Sticky once lit: if the orbiter turns
        // around mid-climb we still climb and hold the band, never abort
        // back down onto the pad.
        const S = WORLD_W + 80
        const vx = g.orb.vx
        const d = vx > 0 ? (((512 - g.orb.x) % S) + S) % S : (((g.orb.x - 512) % S) + S) % S
        const tPass = d / Math.abs(vx)
        const climbT = Math.sqrt(2 * Math.max(20, ORBIT_Y - g.y) / CFG.gravity) * 1.35
        if (g.holdAt == null && tPass <= climbT + 0.5) g.holdAt = 1
        return { rot: 0, thrust: g.holdAt != null }
    }

    if (g.phase === 'descent') {
        g.holdAt = null
        const pad = g.terrain.pads[2]                                  // the wide centre pad
        const pfy = pad.y + 10
        const d = g.y - pfy
        if (d < 26) {                                              // terminal hover-sink
            const want = g.vy < -4 || g.vy > 2
            return { rot: steerTo(g, 0), thrust: want }
        }
        // energy law: sink no faster than what full throttle can still kill
        // over the remaining distance (coast = free fuel; gravity is the
        // engine you aim, not the enemy you hover against), then brake.
        const netA = CFG.thrust - CFG.gravity
        const vAllow = Math.sqrt(2 * netA * Math.max(0, d - 14)) * 0.85
        const vd = -clamp(vAllow, 5, 20)
        const netY = clamp(2.2 * (vd - g.vy), -CFG.gravity, CFG.thrust * 0.9)
        const ax = clamp(0.5 * (pad.cx - g.x) - 1.7 * g.vx, -24, 24)
        const ty = netY + CFG.gravity
        const desired = Math.atan2(ax, Math.max(4, ty))
        const thrust = Math.hypot(ax, ty) > CFG.thrust * 0.25
        return { rot: steerTo(g, desired), thrust }
    }

    // ---- ascent: bang-bang climb-and-hold, one rule for the whole trip.
    // Rising: burn until the ballistic apex reaches the line, then coast.
    // Falling: tap only below the line. Duty lands near gravity/thrust —
    // the cheapest hold there is; the orbiter sweeps past on its own.
    const padTop = g.terrain.pads.reduce((m, p) => Math.max(m, p.y), 0)
    const apex = g.vy >= 0 ? g.y + (g.vy * g.vy) / (2 * CFG.gravity) : g.y
    const thrust = g.vy >= 0 ? apex < ORBIT_Y - 4 : g.y < ORBIT_Y - 10
    const ax = clamp(0.5 * (512 - g.x) - 1.4 * g.vx, -6, 6)
    const tiltCap = g.y < padTop + 60 ? 0 : 0.2
    return { rot: steerTo(g, clamp(ax / CFG.thrust, -tiltCap, tiltCap)), thrust }
}

export function plan(opts = {}) {
    const g = makeGame(opts.seed || 0)
    const script = []
    const maxTicks = opts.maxTicks || 36000
    let minFuel = g.fuel
    while (!g.end && g.tick < maxTicks) {
        const inp = decide(g)
        script.push(inp)
        step(g, inp)
        minFuel = Math.min(minFuel, g.fuel)
    }
    return {
        script, won: g.win, end: g.end,
        cycles: g.cycle, crashes: g.crashes, score: g.score, ticks: g.tick,
        minFuel,
    }
}
