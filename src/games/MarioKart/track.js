// SUPER MARIO KART — the course as pure data.
//
// Everything the road IS lives here: a closed Catmull-Rom centerline through
// hand-placed control points, sampled into a polyline whose every point knows
// its tangent, arc length and curvature. The renderer builds its Mode 7 ground
// texture FROM this data, the sim asks it what surface a kart is standing on,
// and scripts/kartcheck.mjs audits it before anyone drives on it — the same
// contract Spy Hunter's script.js signs for a straight road, extended to a
// circuit: minimum radius, no self-crossing road, every feature on asphalt.
//
// World units = texture pixels (the ground texture is TX x TY, 1:1 with the
// world). y grows DOWN. The course runs one lap clockwise from the start
// gate at index 0, which sits on the long bottom straight.

export const TX = 2048
export const TY = 2048
export const ROAD_R = 190            // half-width of asphalt
export const KERB_R = ROAD_R + 20    // red/white rumble strip
export const WALL_R = ROAD_R + 66    // grass ends, barrier: the wall

// Hand-carved MARIO CIRCUIT: long start straight with the dash panels, a
// sweeping right-hander, a kink, an S back up the right side, the top
// straight heading home westbound, a tight-but-legal hairpin in the
// north-west, and an S-chicane down the left cheek back to the line.
const CONTROL = [
    [900, 1690], [1250, 1676],
    [1520, 1600], [1760, 1450], [1848, 1230],
    [1775, 1015], [1615, 905],
    [1575, 735], [1645, 560], [1770, 430],
    [1690, 285], [1440, 215], [1160, 202],
    [860, 228], [620, 320],
    [462, 480], [412, 672], [482, 852],
    [545, 1030], [505, 1200], [430, 1360], [442, 1520],
    [560, 1640], [730, 1692],
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
    // Tangent, arc length, curvature (radians per world px).
    let s = 0
    const N = pts.length
    // pass 1: tangents and segment lengths (a point's curvature needs the
    // NEXT point's tangent, so it cannot ride in this loop — the first
    // version shipped 623 NaN curvatures for exactly that reason).
    for (let i = 0; i < N; i++) {
        const p = pts[i]; const q = pts[(i + 1) % N]; const o = pts[(i - 1 + N) % N]
        p.i = i
        p.a = Math.atan2(q.y - o.y, q.x - o.x)
        p.d = Math.hypot(q.x - p.x, q.y - p.y)
    }
    // pass 2: arc length and curvature
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

// nearest(x, y, hint) — the centerline point closest to a world position,
// with its signed lateral offset (positive = right of the direction of
// travel). The hint is the caller's last known index; the window is wide
// enough that even a full infield cut re-locks on the correct stretch.
function nearest(x, y, hint = -1) {
    let bi = 0; let bd = Infinity
    const scan = (i) => {
        const p = T.pts[i]
        const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y)
        if (d < bd) { bd = d; bi = i }
    }
    if (hint >= 0) {
        for (let w = -150; w <= 150; w++) scan((hint + w + T.N * 2) % T.N)
    } else {
        for (let i = 0; i < T.N; i += 2) scan(i)
    }
    const p = T.pts[bi]
    const lat = (x - p.x) * -Math.sin(p.a) + (y - p.y) * Math.cos(p.a)
    return { i: bi, lat, dist: Math.sqrt(bd), s: p.s, a: p.a }
}

// Maximum |curvature| over the next n points — how hard the road bends
// right where you are heading. The physics and the CPU brake lines off it.
function aheadK(i, n = 40) {
    let k = 0
    for (let w = 0; w < n; w++) k = Math.max(k, Math.abs(T.pts[(i + w) % T.N].k))
    return k
}

// Features are placed by arc length so the audit can ask "is the dash panel
// on the asphalt?" and get an arithmetic answer, not a screenshot.
const pct = (f) => f * T.len
const BOOST_FRACS = [0.055, 0.115, 0.40, 0.63]
export const BOOSTS = BOOST_FRACS.map((f) => {
    const s = pct(f)
    const i = T.pts.find((p) => p.s >= s).i ?? 0
    const p = T.pts[i]
    return { s0: s - 55, s1: s + 55, i, x: p.x, y: p.y, a: p.a }
})

const BOX_ROWS = [
    { f: 0.215 },   // exit of turn 1, across the racing line
    { f: 0.50 },    // mid top straight
    { f: 0.80 },    // exit of the left chicane
]
export const BOXES = []
for (const row of BOX_ROWS) {
    const s = pct(row.f)
    const p = T.pts.find((q) => q.s >= s)
    for (const lat of [-110, 0, 110]) {
        BOXES.push({
            x: p.x + Math.cos(p.a + Math.PI / 2) * lat,
            y: p.y + Math.sin(p.a + Math.PI / 2) * lat,
            lat, s,
        })
    }
}

// Scenery: trees and grandstands outside the barrier, placed by index so the
// list is the same in Node, in the browser, and in the harness — no dice.
export const SCENERY = []
for (let i = 0; i < T.N; i += 9) {
    const p = T.pts[i]
    if (p.s < 260 || (p.s > T.len - 200)) continue    // clear of the start gantry
    const side = (i % 18 === 0) ? 1 : -1
    const off = WALL_R + 90 + ((i * 7) % 60)
    const kind = (i % 27 === 0) ? 'stand' : 'tree'
    SCENERY.push({
        x: p.x + Math.cos(p.a + Math.PI / 2) * side * off,
        y: p.y + Math.sin(p.a + Math.PI / 2) * side * off,
        a: p.a, kind, h: 90 + (i % 5) * 16,
    })
}

export const START = { i: 0, s: 0 }
// Checkpoint gates: four of them, and the lap only closes if all four were
// armed in order — cutting the chicane to fake a lap is arithmetic-ally
// impossible, which is exactly what the harness asserts.
export const CHECKPOINTS = [0.2, 0.4, 0.6, 0.8].map((f) => Math.round(pct(f)))

export const TRACK = { ...T, ROAD_R, KERB_R, WALL_R, nearest, aheadK }

// What is under a wheel (or a whole kart): road, kerb, grass, or wall.
export function surfaceAt(x, y, hint) {
    const n = nearest(x, y, hint)
    const a = Math.abs(n.lat)
    const surf = a <= ROAD_R ? 'road' : a <= KERB_R ? 'kerb' : a <= WALL_R ? 'grass' : 'wall'
    return { ...n, surf }
}
