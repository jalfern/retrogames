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
    // The march runs in CELL space (the grid is indexed in cells), so the step has to be
    // a cell-space increment. Dividing the world delta by `n` -- which is all this did
    // until the world got scaled -- advances 1/CELL of the intended distance per
    // iteration, so the march stops a fifth of the way to the target and reports clear
    // sight through every wall it never reached. Line of sight is the one thing a stealth
    // game may not get wrong twice, and it is why a guard could see you through a
    // doorway you could see him through and neither of you could explain it.
    const sx = dx / n / CELL, sy = dy / n / CELL
    let x = ax / CELL - level.ox, y = az / CELL - level.oz
    for (let i = 1; i <= n; i++) {
        x += sx; y += sy
        if (blocksSight(at(level, Math.round(x), Math.round(y)))) return false
    }
    return true
}

/** Where a sight ray from A toward B is stopped. Used for torch beams and investigations. */
export function castWorld(level, ax, az, dirX, dirZ, maxDist) {
    const n = Math.max(1, Math.ceil(maxDist / SAMPLE))
    const step = maxDist / n
    // Same cell-space step as `losWorld`, and the same lesson: the distance this returns
    // is what the camera rig trusts. Inflated by CELL, it believed a wall 1.3 m behind
    // the raccoon was 2.9 m away and drove the camera into the brick -- a screen full of
    // blurred wall, which is exactly what the first playtest reported.
    // `dirX` here is a UNIT vector (unlike `losWorld`, whose delta is the whole
    // distance), so the cell-space step is the world step divided by CELL. Getting
    // this wrong twice in one function is the argument for the two numeric assertions
    // heistcheck now makes about this file: they fail by metres, not by vibes.
    const sx = dirX * step / CELL, sy = dirZ * step / CELL
    let x = ax / CELL - level.ox, y = az / CELL - level.oz
    for (let i = 1; i <= n; i++) {
        x += sx; y += sy
        if (blocksSight(at(level, Math.round(x), Math.round(y)))) return { x: (x - level.ox) * CELL, z: (y - level.oz) * CELL, dist: (i - 1) * step, hit: true }
    }
    const hx = (ax + dirX * maxDist) / CELL - level.ox, hy = (az + dirZ * maxDist) / CELL - level.oz
    return { x: (hx - 0) * CELL, z: (hy - 0) * CELL, dist: maxDist, hit: false }
}

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
/**
 * How fast suspicion fills, in units of "whole meter" per second. `1.0` = noticed.
 *
 * The constant was 2.6, which at 5 m in a torch gave 2.4 seconds of standing in a beam
 * before anything happened. That is not stealth, that is a spectator: the player is
 * supposed to feel the beam fill and *move*, and the first playtest put it plainly --
 * "I have to be on top of him before he catches me". So:
 *
 *   torch, 5 m, no cover   ~1.1 s     <- the moment of "oh no", then you run
 *   torch, 9 m             ~2.0 s
 *   dark, 4 m, crouched    ~4 s+      cover and darkness still earn their keep
 *   already alert          ~0.7 s     a guard who has seen you once is not slow twice
 *
 * Distance falloff has a floor (`dist * 0.8`) so close range is not absurdly instant.
 * `heistplay` times the beam, so this is a promise and not a comment.
 */
export function detectRate(dist, align, mods = {}) {
    if (align <= 0) return 0
    const base = 4.6 * align / Math.max(2.6, dist * 0.8)
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
