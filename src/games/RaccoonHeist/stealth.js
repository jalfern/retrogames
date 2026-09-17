// RACCOON HEIST — the physics of being seen.
//
// Deliberately pure: no three.js, no DOM, no mutable state. Everything here is a
// function of the level grid and a handful of numbers, which means the whole stealth
// model is testable in Node (`npm run heistcheck`) without opening a browser. The
// engine keeps the timers and the AI state machines; this file answers questions.
//
// Two ideas hold the model together:
//   - **Sight is occlusion, not distance.** A guard never "sees through" the dumpster
//     he is standing next to. `canSee` is one DDA-ish ray over the grid, and cover is
//     geometry, not a stealth skill meter.
//   - **Noise is an event, not a stat.** Actions *emit* noise with a radius; guards
//     inside the radius hear it and decide. That single shape gives us trash cans,
//     thunder, puddles and thrown shinies for free, and it is why lightning is the
//     most valuable item in the game: it suppresses the event, not a modifier.

import { T, CELL, blocksSight, at } from './levels.js'

const SAMPLE = 0.22   // metres per occlusion sample; well under one cell (2.2 m) so no wall is ever stepped over

/**
 * Can point A see point B? Marches the grid and stops at the first sight blocker.
 * Bushes are NOT blockers: a hedge never hides you from a torch, it just makes you
 * hard to make out, which is what `coverOf` (vis × 0.2) is for. Splitting "blocks
 * sight" from "reduces visibility" is what stops the model turning into a mush of
 * fudge factors.
 *
 * @returns {boolean} true when nothing solid is in the way
 */
export function losWorld(level, ax, az, bx, bz) {
    const dx = bx - ax, dy = bz - az
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) return true
    const n = Math.ceil(len / SAMPLE)
    const sx = dx / n, sy = dy / n
    let x = ax / CELL - level.ox, y = az / CELL - level.oz
    for (let i = 1; i < n; i++) {
        x += sx; y += sy
        if (blocksSight(at(level, Math.round(x), Math.round(y)))) return false
    }
    return true
}

/** Where a sight ray from A toward B is stopped. Used for torch beams and investigations. */
export function castWorld(level, ax, az, dirX, dirZ, maxDist) {
    const n = Math.ceil(maxDist / SAMPLE)
    const sx = dirX / n, sy = dirZ / n
    let x = ax / CELL - level.ox, y = az / CELL - level.oz
    for (let i = 1; i < n; i++) {
        x += sx; y += sy
        if (blocksSight(at(level, Math.round(x), Math.round(y)))) return { x: (x - level.ox) * CELL, z: (y - level.oz) * CELL, dist: (i - 1) * SAMPLE, hit: true }
    }
    const hx = (ax + dirX * maxDist) / CELL - level.ox, hy = (az + dirZ * maxDist) / CELL - level.oz
    return { x: (hx - 0) * CELL, z: (hy - 0) * CELL, dist: maxDist, hit: false }
}

/** Shortest signed angle difference, in radians, wrapped to [-PI, PI]. */
export function angleTo(fromAng, dx, dz) {
    // Model convention: heading 0 faces +Z, and yaw increases toward +X (three's Y-up
    // rotation is right-handed about +Y, so a yaw of +a turns +Z toward +X).
    return wrapPi(Math.atan2(dx, dz) - fromAng)
}

export function wrapPi(a) {
    let x = a
    while (x > Math.PI) x -= Math.PI * 2
    while (x < -Math.PI) x += Math.PI * 2
    return x
}

/**
 * How squarely a target sits in a cone: 1 dead centre, 0 at or beyond the edge.
 * Smooth, because a hard edge makes guards flicker at the boundary of their vision —
 * which reads as a bug even when it is correct.
 */
export function coneAlign(angDiff, half) {
    const a = Math.abs(angDiff)
    if (a >= half) return 0
    return 1 - Math.pow(a / half, 1.6)
}

/**
 * What cover a cell gives. Geometry, not a skill check: a hedge is see-through-ish, a
 * dumpster is invisible while you are in it, and a puddle is *worse* than open ground
 * because it screams when you step in it.
 */
export function coverOf(cellType, crouching) {
    let vis = 1
    if (cellType === T.BUSH) vis *= 0.2
    // A plinth or a stack of crates is waist-high: it does not hide you, it hides
    // half of you. That is worth ~0.4 and it is the difference between "crouch behind
    // the urn and wait" being theatre or being a coin flip.
    if (cellType === T.CRATE) vis *= 0.4
    if (cellType === T.DUMP) vis *= 0.25
    if (crouching) vis *= 0.55
    if (cellType === T.WATER) vis *= 1.25
    return vis
}

/**
 * How fast a watcher accumulates suspicion of a target, per second.
 * 1.0 means "seen plainly at 4 m in the open". Reaches 1 and the guard goes ALERT.
 *
 * The 1/dist falloff is softened at close range (max(1.6, d)) so a raccoon standing
 * right next to a guard in the open is *immediately* obvious rather than taking a
 * comically long second to notice.
 */
export function detectRate(dist, align, mods = {}) {
    if (align <= 0) return 0
    const base = 2.6 * align / Math.max(1.6, dist)
    return base * (mods.cover ?? 1) * (mods.light ?? 1) * (mods.aware ?? 1)
}

/**
 * Light level at a world point, from the level's lamps only (guards' torches are
 * added by the engine because they move). Returns 0..1.6; multiplied into detectRate
 * as `light`, so standing in a lamplit patch of yard is genuinely dangerous.
 */
export function lightAt(lamps, wx, wz, floor = 0.45) {
    let best = floor
    for (const l of lamps) {
        const d = Math.hypot(l.x - wx, l.z - wz)
        const v = 1.55 / (1 + d * d * 0.34)
        if (v > best) best = v
    }
    return Math.min(1.6, best)
}

/**
 * A noise event. The engine pushes these into a queue; guards within `r` hear it and
 * go look. `mask` is the thunder window: while it is true the event never happens,
 * which is the entire reason the storm is a mechanic and not weather.
 */
export function makeNoise(x, z, r, kind, opts = {}) {
    return { x, z, r, kind, loud: opts.loud ?? 1, t: opts.t ?? 0 }
}

export function hears(noise, gx, gz, guardHear, masked) {
    if (masked) return 0
    const d = Math.hypot(noise.x - gx, noise.z - gz)
    const reach = Math.max(0.5, guardHear * noise.loud)
    if (d > noise.r + reach) return 0
    // Strength 1 at the inner edge, 0 at the outer edge: guards close to the noise
    // walk straight to it, guards at the fringe merely glance that way.
    const inner = noise.r
    if (d <= inner) return 1
    return Math.max(0, 1 - (d - inner) / reach)
}

/**
 * The walk cycle of a patrol: which waypoint to head for next, ping-pong or loop.
 * Pure so the audit can prove a route is walkable without running the sim.
 */
export function nextWaypoint(i, n, loop) {
    if (loop) return (i + 1) % n
    // ping-pong: 0,1,2,1,0,1,...
    if (n === 1) return 0
    const period = (n - 1) * 2
    let k = i % period
    if (k >= n) k = period - k
    return k
}

/** Decodes what the player is doing into the numbers the sim cares about. */
export function moveProfile(crew, input) {
    const crouch = !!input.crouch
    const dash = !!input.dash && (input.wind ?? 1) > 0.05
    const speed = (dash ? 5.0 : crouch ? 1.35 : 2.75) * (crew?.speed ?? 1)
    const noise = dash ? 8.5 : crouch ? 0 : 3.6
    return { speed, noise, crouch, dash }
}

/** Score for one job: loot, nerve, crew still standing, and how fast you were. */
export function tally({ lootValue, totalValue, delivered, secs, par, caught, shinies }) {
    const clean = delivered ? Math.max(0, par - secs) : 0
    const v = Math.round(
        lootValue * 1 + clean * 6 + (caught === 0 ? 400 : 0) + shinies * 15
        - (totalValue - lootValue) * 0.5
    )
    return { value: Math.max(0, v), clean, complete: delivered > 0 && lootValue >= totalValue }
}
