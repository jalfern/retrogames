// SKYWARD — the autopilot. One controller per craft, honest proportional
// steering: it aims the nose at the next objective and lets the same physics
// the player rides do the rest. The attract mode flies this, and
// scripts/skywardcheck.mjs graduates on it — proof the school is winnable.

import { CFG } from './sim.js'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

// signed angle error of `want` from `heading` (both 0 = +z, CCW positive x)
function turnErr(heading, want) {
    let e = want - heading
    while (e > Math.PI) e -= Math.PI * 2
    while (e < -Math.PI) e += Math.PI * 2
    return e
}
function bearingTo(p, tx, tz) {
    return Math.atan2(tx - p.x, tz - p.z)
}

export function decide(g) {
    if (g.done) return {}
    if (g.phase === 'ring') return flyTo(g, ringTarget(g), 0.9)
    if (g.phase === 'spot') return glideHome(g)
    if (g.phase === 'drop') return beltRun(g)
    return cruise(g)
}

function flyTo(g, t, gain = 1) {
    const e = turnErr(g.heading, bearingTo(g.p, t.x, t.z))
    const dAlt = t.y - g.p.y
    const d = Math.hypot(g.p.x - t.x, g.p.z - t.z)
    const pad = {
        x: clamp(e * 1.9 * gain, -1, 1),
        y: clamp(dAlt / Math.max(d * 0.28, 6), -1, 1),
    }
    if (t.thrust) pad.a = true
    if (t.drop) pad.b = true
    return pad
}

function ringTarget(g) {
    const r = g.world.rings[Math.min(g.ringsPassed, g.world.rings.length - 1)]
    return { x: r.x, y: r.y, z: r.z }
}

function glideHome(g) {
    const w = g.world
    const p = g.p
    const padD = Math.hypot(p.x - w.pad.x, p.z - w.pad.z)
    const gh = p.y - w.terrainHeight(p.x, p.z)

    // far out and low: hunt lift before committing
    if (gh < 34 && padD > 120) {
        let best = null, bd = 1e9
        for (const c of w.thermals) {
            const d = Math.hypot(p.x - c.x, p.z - c.z)
            if (d < bd) { bd = d; best = c }
        }
        if (best && bd < 160) {
            const e = turnErr(g.heading, bearingTo(p, best.x, best.z))
            return { x: clamp(e * 1.1, -1, 1), y: 0 }
        }
    }

    // spiral above the pad until the height matches a straight final
    // (~8:1 glide), then RELEASE and fly it straight down to the bullseye
    const spiralR = 45
    const altForFinal = padD / 8 + 1.5
    if (padD > spiralR * 0.7 && gh > altForFinal + 3) {
        // ride the circle: aim at the tangent point 90° around the pad
        const vx = p.x - w.pad.x, vz = p.z - w.pad.z
        const d = Math.max(Math.hypot(vx, vz), 1)
        const side = 1 // consistent clockwise pattern
        const tx = w.pad.x + (-vz / d) * spiralR
        const tz = w.pad.z + (vx / d) * spiralR
        void side
        const e = turnErr(g.heading, bearingTo(p, tx, tz))
        return { x: clamp(e * 1.6, -1, 1), y: 0.1 }
    }
    if (padD >= 12) {
        const e = turnErr(g.heading, bearingTo(p, w.pad.x, w.pad.z))
        return { x: clamp(e * 1.4, -1, 1), y: clamp((gh - padD / 8.5) * 0.4, -0.15, 0.4) }
    }
    return { x: 0, y: 0.35 } // over the bullseye: flare
}

function beltRun(g) {
    const w = g.world
    const doneAll = g.dropIdx >= w.targets.length
    const t = doneAll
        ? { x: w.school.x, z: w.school.z + 40 }
        : w.targets[g.dropIdx]
    const hover = w.terrainHeight(t.x, t.z) + 10
    const d = Math.hypot(g.p.x - t.x, g.p.z - t.z)
    const e = turnErr(g.heading, bearingTo(g.p, t.x, t.z))
    const needAlt = hover - g.p.y
    const grounded = g.p.y < w.terrainHeight(g.p.x, g.p.z) + 1.6
    const guard = Math.max(hover, w.terrainHeight(g.p.x, g.p.z) + 12)
    // cruise at heading until close, then brake to a hover over the target
    const thr = doneAll ? 1 : clamp((d - 6) / 26, -1, 1)
    return {
        x: clamp(e * 1.6, -1, 1),
        y: thr,
        // altitude bands: below the line (route guard or target hover) climb;
        // above it settle. Grounded always ignites — it must lift off.
        a: grounded || (g.p.y < guard ? g.vy < 1.6 : g.vy < -1.6),
        b: !doneAll && d < 9 && g.speed < 4.5 && Math.abs(needAlt) < 9,
    }
}

function cruise(g) {
    // attract / free-flight loop: a lazy circuit of the isle at 48 m
    const a = g.t * 0.05
    const t = { x: Math.sin(a) * 360, y: 48, z: -60 + Math.cos(a) * 360 }
    return flyTo(g, t, 0.8)
}
