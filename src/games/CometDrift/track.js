// COMET DRIFT GP — SUNSET GULCH as pure data.
//
// One closed Catmull-Rom centerline through hand-placed control points,
// sampled into a polyline where every point carries tangent, arc length and
// curvature. The renderer bakes its Mode 7 ground texture from this data, the
// sim asks it what surface a kart is on, and scripts/cometcheck.mjs audits
// it before anyone drives: minimum radius, no self-crossing road, gates and
// the line on asphalt. The course runs COUNTER-clockwise (the Gulch turns
// left out of the gate) — start/finish at index 0 on the bottom straight.
//
// World units = texture pixels (ground texture TX x TY, 1:1 with the world),
// y grows DOWN.

export const TX = 2048
export const TY = 2048
export const ROAD_R = 140             // half-width of asphalt
export const KERB_R = ROAD_R + 16    // painted kerb strip
export const WALL_R = ROAD_R + 76    // sand ends, cliff face: the wall

// The Gulch: a long start straight east, a sweeper up the right side, the
// ridge straight westbound along the top, a wide left horseshoe in the north
// west, and an S down the left side back onto the line. Every corner was
// widened until cometcheck proved min radius >= 200 with no road overlap —
// 200 is flat-out at top speed (8.6 < 0.052 * 200).
const CONTROL = [
    [1250, 1795], [1450, 1765], [1640, 1650], [1790, 1490], [1840, 1290], [1810, 1080],
    [1700, 860], [1500, 680], [1250, 570], [980, 520], [730, 560], [560, 720],
    [505, 930], [540, 1150], [600, 1360], [700, 1540], [850, 1680], [1010, 1760],
]

function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t; const t3 = t2 * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

function build() {
    const pts = []
    const n = CONTROL.length
    const SEG = 26
    for (let i = 0; i < n; i++) {
        const p0 = CONTROL[(i - 1 + n) % n]; const p1 = CONTROL[i]
        const p2 = CONTROL[(i + 1) % n]; const p3 = CONTROL[(i + 2) % n]
        for (let j = 0; j < SEG; j++) {
            const t = j / SEG
            pts.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), y: catmull(p0[1], p1[1], p2[1], p3[1], t) })
        }
    }
    let s = 0
    const N = pts.length
    for (let i = 0; i < N; i++) {
        const p = pts[i]; const q = pts[(i + 1) % N]; const o = pts[(i - 1 + N) % N]
        p.i = i
        p.a = Math.atan2(q.y - o.y, q.x - o.x)
        p.d = Math.hypot(q.x - p.x, q.y - p.y)
    }
    for (let i = 0; i < N; i++) {
        const p = pts[i]
        p.s = s
        s += p.d
        let da = pts[(i + 1) % N].a - p.a
        while (da > Math.PI) da -= Math.PI * 2
        while (da < -Math.PI) da += Math.PI * 2
        p.k = da / Math.max(1, p.d)
    }
    return { pts, len: s, N }
}

const T = build()

function nearest(x, y, hint = -1) {
    let bi = 0; let bd = Infinity
    const scan = (i) => {
        const p = T.pts[i]
        const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y)
        if (d < bd) { bd = d; bi = i }
    }
    if (hint >= 0) {
        for (let w = -160; w <= 160; w++) scan((hint + w + T.N * 2) % T.N)
    } else {
        for (let i = 0; i < T.N; i += 2) scan(i)
    }
    const p = T.pts[bi]
    const lat = (x - p.x) * -Math.sin(p.a) + (y - p.y) * Math.cos(p.a)
    return { i: bi, lat, dist: Math.sqrt(bd), s: p.s, a: p.a }
}

function aheadK(i, n = 40) {
    let k = 0
    for (let w = 0; w < n; w++) k = Math.max(k, Math.abs(T.pts[(i + w) % T.N].k))
    return k
}

const pct = (f) => f * T.len
export const START = { i: 0, s: 0 }
export const CHECKPOINTS = [0.2, 0.4, 0.6, 0.8].map((f) => Math.round(pct(f)))

// Trackside scenery placed by index so the list is identical in Node, the
// browser and the harness — no dice. Cacti and mesa spires outside the cliff.
export const SCENERY = []
for (let i = 0; i < T.N; i += 8) {
    const p = T.pts[i]
    if (p.s < 300 || p.s > T.len - 240) continue
    const side = (i % 16 === 0) ? 1 : -1
    const off = WALL_R + 110 + ((i * 7) % 90)
    SCENERY.push({
        x: p.x + Math.cos(p.a + Math.PI / 2) * side * off,
        y: p.y + Math.sin(p.a + Math.PI / 2) * side * off,
        a: p.a,
        kind: (i % 24 === 0) ? 'spire' : 'cactus',
        h: 80 + (i % 5) * 18,
    })
}

export const TRACK = { ...T, ROAD_R, KERB_R, WALL_R, nearest, aheadK }

export function surfaceAt(x, y, hint) {
    const n = nearest(x, y, hint)
    const a = Math.abs(n.lat)
    const surf = a <= ROAD_R ? 'road' : a <= KERB_R ? 'kerb' : a <= WALL_R ? 'sand' : 'wall'
    return { ...n, surf }
}
