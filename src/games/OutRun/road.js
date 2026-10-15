// OUT RUN — road.js : the route and the projector. No DOM, no React, no
// Math.random (a seeded LCG only) — this is the same module scripts/outruncheck.mjs
// imports in plain Node, so the road you drive is the road the harness audited.
//
// THE PROJECTION is the classic arcade pseudo-3D (Jake Gordon / OutRun style),
// NOT Mode 7: the world is a long strip of flat segments at increasing depth z;
// each is projected to a screen band by `scale = CAM_DEPTH / dz`, so far strips
// are narrow and high, near strips wide and low. Curves are an accumulated
// lateral shift while painting; HILLS are a real per-segment world height `y`,
// so an ascending crest genuinely hides the road on the far side (the projector
// clamps a segment once it drops below the one before it — exactly how the
// cabinet lost sight of the road over Alp-Impact's brow).
//
// THE ROUTE is a merge-back fork LATTICE, like the arcade map: at depth d the
// road sits in "column" c (0..d). At the checkpoint the road forks — steer LEFT
// and you stay in column c (the easier line), steer RIGHT and you take column
// c+1 (longer, tighter, meaner timer). Summing the columns over depths 0..4 is
// 1+2+3+4+5 = 15 distinct stages, and the five columns at depth 5 are five
// different finish goals — no two routes through the country are the same drive.

export const SEG_LEN = 200
export const ROAD_W = 2200                 // half-width of the tarmac, world units
export const LANES = 3
export const CAM_H = 1000
export const FOV = 100
export const CAM_DEPTH = 1 / Math.tan((FOV / 2) * Math.PI / 180)
export const DRAW = 200                    // segments the renderer walks forward
export const FORK_SEGS = 26              // how far back the fork island opens

export const easeIn = (a, b, p) => a + (b - a) * Math.pow(p, 2)
export const easeInOut = (a, b, p) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5)

// Deterministic LCG. Every stage rebuilds to the identical road; the planner and
// the harness rely on that (a shifted road is a different route than audited).
export function rng(seed) {
    let s = (seed >>> 0) || 1
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

// ---- scenes ----------------------------------------------------------------
// One palette + prop set per depth; depth 4 is the coast-and-skyline goal run.
export const SCENES = [
    { name: 'SEASIDE',        sky: ['#1a6fb0', '#4fb0e0', '#ffcaa0'], sun: true,  band: 'ocean',   road: ['#6b6b73', '#73737b'], rumble: ['#c0392b', '#e8e8ee'], grass: ['#1f7a3a', '#238a42'], props: ['palm', 'palm', 'sign', 'billboard', 'rock'] },
    { name: 'DESERT',         sky: ['#d98f3a', '#f0c060', '#ffe6b0'], sun: true,  band: 'mesa',    road: ['#8a7a5c', '#93836a'], rumble: ['#7a4a20', '#d8c090'], grass: ['#c9a860', '#d0af66'], props: ['cactus', 'mesa', 'sign', 'windmill', 'rock'] },
    { name: 'ALPINE',         sky: ['#2a5f9e', '#7fb0e0', '#e8f4ff'], sun: false, band: 'mountain',road: ['#565a66', '#5f636e'], rumble: ['#20304f', '#e8eef8'], grass: ['#2e6a55', '#357a60'], props: ['pine', 'pine', 'sign', 'boulder', 'lamp'] },
    { name: 'COUNTRYSIDE',    sky: ['#3a8fd0', '#8fd0f0', '#f0f8ff'], sun: true,  band: 'fields',  road: ['#66666e', '#6e6e76'], rumble: ['#b03030', '#e8e8ee'], grass: ['#3f9a3a', '#48aa44'], props: ['flower', 'tree', 'sign', 'tower', 'bush'] },
    { name: 'CAPITAL COAST',  sky: ['#1a4f9e', '#6fb0e8', '#ffd0a0'], sun: true,  band: 'skyline', road: ['#5f5f68', '#67676f'], rumble: ['#20202f', '#f0f0f6'], grass: ['#2f7f4a', '#36895a'], props: ['palm', 'lamp', 'billboard', 'flower', 'sign'] },
]

export const laneX = (lane) => (lane - (LANES - 1) / 2) * (2 / LANES)   // -0.66..0.66 (fraction of road half-width)

const addSegment = (segs, curve, y) => {
    const n = segs.length
    segs.push({ index: n, curve, y, sprites: [] })
}

// one section of road: ease-in / hold / ease-out on both curve and hill
const addRoad = (segs, enter, hold, leave, curve, hill) => {
    const startY = segs.length ? segs[segs.length - 1].y : 0
    const endY = startY + hill * SEG_LEN
    const total = enter + hold + leave
    for (let i = 0; i < enter; i++) addSegment(segs, easeIn(0, curve, i / enter), easeInOut(startY, endY, i / total))
    for (let i = 0; i < hold; i++) addSegment(segs, curve, easeInOut(startY, endY, (enter + i) / total))
    for (let i = 0; i < leave; i++) addSegment(segs, easeInOut(curve, 0, i / leave), easeInOut(startY, endY, (enter + hold + i) / total))
}

// Build the one-and-only layout of stage (depth, col). Depth 0..4, col 0..depth.
// id 1..15 runs the lattice top-to-bottom, left-to-right — the same numbering a
// player's route reaches, so the harness can name the stage it just cleared.
export function buildStage(depth, col) {
    const id = (depth * (depth + 1)) / 2 + col + 1
    const rand = rng(id * 2654435761 + 12345)
    const diff = col + depth * 0.35                     // 0 .. ~5.4, right-and-deep is hardest
    const segs = []
    addRoad(segs, 40, 60, 40, 0, 0)                      // a straight to feel the throttle
    const curves = 4 + Math.round(depth)                 // more corners the deeper you go
    for (let s = 0; s < curves; s++) {
        const dir = rand() < 0.5 ? -1 : 1
        const mag = (0.9 + rand() * (1.4 + diff * 0.22)) * dir
        const hill = (rand() < 0.55 ? -1 : 1) * Math.round(8 + rand() * (12 + diff * 3))
        const len = 40 + Math.round(rand() * 40)
        addRoad(segs, len, Math.round(len * 0.8), len, mag, hill)
        if (rand() < 0.5) addRoad(segs, 20, 20, 20, 0, 0)   // a short link straight
    }
    addRoad(segs, 30, FORK_SEGS, 4, 0, 0)              // the run-in to the fork, dead straight
    const segCount = segs.length
    const length = segCount * SEG_LEN
    const theme = SCENES[Math.min(depth, SCENES.length - 1)]

    // roadside props, seeded. Kept clear of the racing lanes; the far side of a
    // curve is where they hurt, so that is where the interesting ones sit.
    const propType = () => theme.props[Math.floor(rand() * theme.props.length)]
    for (let i = 30; i < segCount - FORK_SEGS; i++) {
        if (rand() < 0.16) {
            const side = rand() < 0.5 ? -1 : 1
            const off = side * (1.25 + rand() * 1.4)     // just off the tarmac edge
            segs[i].sprites.push({ offset: off, type: propType() })
        }
        if (rand() < 0.05) segs[i].sprites.push({ offset: (rand() < 0.5 ? -1 : 1) * (2.6 + rand() * 1.8), type: theme.band === 'mountain' ? 'pine' : propType() })
    }
    // a goal gantry on the last straight of a final-stage depth
    if (depth === 4) segs[segCount - 8].sprites.push({ offset: 0, type: 'goal', big: true })

    // traffic: slower cars scattered down the stage, each in a lane at a fixed pace
    const cars = []
    const nCars = 5 + Math.round(diff)
    for (let k = 0; k < nCars; k++) {
        cars.push({
            f: 0.12 + rand() * 0.82,                     // starting fraction along the stage
            lane: Math.floor(rand() * LANES),
            spd: 0.30 + rand() * 0.26,                   // fraction of HIGH top speed
            hue: Math.floor(rand() * 6),
        })
    }

    const timeBonus = Math.max(24, Math.round(46 - diff * 3.4))   // harder = a tighter purse

    return { id, depth, col, diff, theme, segs, segCount, length, cars, timeBonus, forkFrom: segCount - FORK_SEGS }
}

export const stageById = (id) => {
    const depth = Math.floor((Math.sqrt(8 * (id - 1) + 1) - 1) / 2)
    return buildStage(depth, id - 1 - (depth * (depth + 1)) / 2)
}

export const TOTAL_STAGES = 15
export const GOALS = LANES + 2                          // five columns at depth 5

// ---- the projector ---------------------------------------------------------
// World point (x lateral frac-of-half-width? no — raw world units) -> screen.
// worldX/worldY raw world units, worldZ absolute track z.
export function projectPoint(worldX, worldY, worldZ, camX, camY, camZ, W, H) {
    const dz = worldZ - camZ
    const scale = CAM_DEPTH / (dz > 1 ? dz : 1)
    return {
        x: Math.round(W / 2 + scale * (worldX - camX) * W / 2),
        y: Math.round(H / 2 - scale * (worldY - camY) * H / 2),
        w: Math.round(scale * ROAD_W * W / 2),
        scale,
    }
}

export const segmentAt = (st, z) => {
    const i = Math.floor(z / SEG_LEN) % st.segCount
    return st.segs[i < 0 ? 0 : i]
}
