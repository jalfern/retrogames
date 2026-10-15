// LUNAR LANDER — terrain.js : seeded vector terrain, the same module the
// renderer draws and the Node harness (scripts/landercheck.mjs) audits.
//
// The arcade's look: a jagged white line over a black void, cut by five flat
// landing pads marked with their point values. The centre pad is the widest
// (and pays least — 20); the edge pads sit high and narrow and pay 100.
// Terrain idx 0..∞ cycles the difficulty and the score multiplier.

import { mulberry32 } from './rng.js'

export const WORLD_W = 1024
export const STEP = 8
export const NPTS = WORLD_W / STEP + 1
export const GROUND_MIN = 50
export const GROUND_MAX = 300

// pad slots: grid index, half-span in segments, value — the classic 100·50·20·50·100
export const PAD_SLOTS = [
    { i: 12, half: 2, val: 100, hi: [190, 280] },
    { i: 34, half: 3, val: 50, hi: [150, 235] },
    { i: 64, half: 4, val: 20, hi: [105, 160] },
    { i: 94, half: 3, val: 50, hi: [150, 235] },
    { i: 116, half: 2, val: 100, hi: [190, 280] },
]

export const PAD_PTS = { 100: 44, 50: 60, 20: 76 }   // rendered width per value

export function genTerrain(seed, idx = 0) {
    const rnd = mulberry32((seed ^ Math.imul(idx + 1, 2654435761)) >>> 0)
    const pts = new Float64Array(NPTS)
    const pads = PAD_SLOTS.map((s) => {
        const y = Math.round(s.hi[0] + rnd() * (s.hi[1] - s.hi[0]))
        return { i0: s.i - s.half, i1: s.i + s.half, y, val: s.val, cx: s.i * STEP }
    })
    for (const p of pads) for (let i = p.i0; i <= p.i1; i++) pts[i] = p.y

    // fill the rough ground between pads: a random walk whose ends are pinned
    // to the pads and whose middle is free to kick up into peaks and holes.
    const anchors = []
    for (const p of pads) { anchors.push(p.i0, p.i1) }
    anchors.sort((a, b) => a - b)
    const filled = new Uint8Array(NPTS)
    for (const p of pads) for (let i = p.i0; i <= p.i1; i++) filled[i] = 1
    for (let seg = 0; seg < anchors.length - 1; seg++) {
        const a = anchors[seg], b = anchors[seg + 1]
        if (b - a < 2 || filled[a + 1] === 1) continue   // a and b are the same pad's edges
        const ya = pts[a], yb = pts[b]
        let h = ya
        for (let i = a + 1; i < b; i++) {
            const t = (i - a) / (b - a)
            const base = ya + (yb - ya) * t
            h = base + (rnd() * 2 - 1) * 46
            const dip = Math.sin(Math.PI * t)
            h = base + (h - base) * (0.35 + 0.65 * dip)
            pts[i] = Math.max(GROUND_MIN, Math.min(GROUND_MAX, h))
        }
    }
    // beyond the outermost pads to the screen edges: easy ramp ground
    const last = pads[4]
    for (let i = last.i1 + 1; i < NPTS; i++) {
        pts[i] = Math.max(GROUND_MIN, Math.min(GROUND_MAX, pts[i - 1] + (rnd() * 2 - 1) * 14 + (i % 6 === 0 ? 8 : 0)))
    }
    const first = pads[0]
    for (let i = first.i0 - 1; i >= 0; i--) {
        pts[i] = Math.max(GROUND_MIN, Math.min(GROUND_MAX, pts[i + 1] + (rnd() * 2 - 1) * 14 + (i % 6 === 0 ? 8 : 0)))
    }
    return { pts, pads, idx }
}

// interpolated surface height at world x
export function terrainY(pts, x) {
    const fx = Math.max(0, Math.min(WORLD_W, x)) / STEP
    const i = Math.floor(fx)
    if (i >= NPTS - 1) return pts[NPTS - 1]
    const t = fx - i
    return pts[i] + (pts[i + 1] - pts[i]) * t
}

// the pad whose span contains x (all of the feet must sit inside it to land there)
export function padAt(terrain, x) {
    for (const p of terrain.pads) {
        if (x >= p.i0 * STEP && x <= p.i1 * STEP) return p
    }
    return null
}
