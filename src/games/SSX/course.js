// SSX — course.js : the three mountains. Pure data + geometry helpers, no DOM,
// no Math.random. A course is a downhill centerline integrated segment by
// segment (heading from curve, height from drop), with kickers, rails,
// halfpipes and obstacles parked along it. The sim, the autopilot, the
// renderer and the Node harness all read the SAME numbers, so the mountain the
// harness proves rideable is the mountain that paints.

export const DS = 4                       // metres per segment

// Every course is chunks of {n, curve, drop}; curve is rad/m of heading turn,
// drop is metres of fall per metre travelled. Chunks are seeded permutational
// seasoning on a hand-authored spine, so each course is fixed forever.
const SPINES = [
    {   // ALPINE GLADE — the classic day run: long S's, glades, two rails.
        name: 'ALPINE GLADE', theme: 'day',
        chunks: [
            { n: 26, curve: 0.000, drop: 0.055 },
            { n: 22, curve: 0.016, drop: 0.075 },
            { n: 18, curve: 0.000, drop: 0.100 },
            { n: 22, curve: -0.018, drop: 0.070 },
            { n: 26, curve: 0.000, drop: 0.060 },
            { n: 20, curve: 0.020, drop: 0.085 },
            { n: 16, curve: -0.010, drop: 0.110 },
            { n: 26, curve: 0.000, drop: 0.065 },
            { n: 22, curve: -0.020, drop: 0.075 },
            { n: 20, curve: 0.006, drop: 0.090 },
            { n: 24, curve: 0.000, drop: 0.055 },
        ],
        // f = fraction of the run, x = lateral fraction of the piste
        kickers: [
            { f: 0.13, x: -0.25, power: 2.6, w: 0.22 },
            { f: 0.30, x: 0.30, power: 3.2, w: 0.24 },
            { f: 0.47, x: -0.15, power: 2.4, w: 0.22 },
            { f: 0.62, x: 0.10, power: 3.6, w: 0.26 },
            { f: 0.80, x: -0.05, power: 3.0, w: 0.24 },
        ],
        rails: [
            { f0: 0.36, f1: 0.40, x: 0.55 },
            { f0: 0.70, f1: 0.75, x: -0.55 },
        ],
        pipes: [],
        obst: [0.10, 0.21, 0.26, 0.41, 0.52, 0.58, 0.68, 0.74, 0.86, 0.92],
    },
    {   // NEON HEIGHTS — the night city: harder lines, rails everywhere.
        name: 'NEON HEIGHTS', theme: 'night',
        chunks: [
            { n: 22, curve: 0.000, drop: 0.070 },
            { n: 18, curve: -0.022, drop: 0.090 },
            { n: 14, curve: 0.000, drop: 0.110 },
            { n: 18, curve: 0.024, drop: 0.080 },
            { n: 22, curve: 0.000, drop: 0.075 },
            { n: 16, curve: -0.024, drop: 0.100 },
            { n: 14, curve: 0.000, drop: 0.120 },
            { n: 18, curve: 0.020, drop: 0.085 },
            { n: 22, curve: 0.000, drop: 0.070 },
            { n: 16, curve: -0.018, drop: 0.095 },
            { n: 20, curve: 0.000, drop: 0.060 },
        ],
        kickers: [
            { f: 0.11, x: 0.00, power: 3.0, w: 0.24 },
            { f: 0.28, x: -0.35, power: 2.4, w: 0.22 },
            { f: 0.44, x: 0.25, power: 3.4, w: 0.26 },
            { f: 0.58, x: -0.20, power: 2.8, w: 0.24 },
            { f: 0.76, x: 0.05, power: 3.8, w: 0.26 },
        ],
        rails: [
            { f0: 0.17, f1: 0.22, x: -0.50 },
            { f0: 0.34, f1: 0.38, x: 0.55 },
            { f0: 0.50, f1: 0.55, x: -0.55 },
            { f0: 0.66, f1: 0.71, x: 0.50 },
        ],
        pipes: [],
        obst: [0.08, 0.16, 0.24, 0.33, 0.42, 0.54, 0.63, 0.72, 0.82, 0.90],
    },
    {   // BIG AIR BASIN — the halfpipe run: two walls and monster kickers.
        name: 'BIG AIR BASIN', theme: 'dusk',
        chunks: [
            { n: 20, curve: 0.000, drop: 0.050 },
            { n: 22, curve: 0.010, drop: 0.065 },
            { n: 20, curve: 0.000, drop: 0.080 },
            { n: 22, curve: -0.012, drop: 0.070 },
            { n: 20, curve: 0.000, drop: 0.090 },
            { n: 22, curve: 0.012, drop: 0.065 },
            { n: 20, curve: 0.000, drop: 0.075 },
            { n: 24, curve: -0.008, drop: 0.060 },
            { n: 22, curve: 0.000, drop: 0.080 },
        ],
        kickers: [
            { f: 0.30, x: 0.00, power: 4.2, w: 0.34 },
            { f: 0.52, x: 0.00, power: 4.6, w: 0.36 },
            { f: 0.72, x: 0.00, power: 4.0, w: 0.34 },
        ],
        rails: [],
        pipes: [
            { f: 0.10, power: 5.2, w: 1.0 },
            { f: 0.88, power: 5.2, w: 1.0 },
        ],
        obst: [0.20, 0.40, 0.62, 0.80],
    },
]

export const COURSE_COUNT = SPINES.length

const lcg = (s) => () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }

// deterministic side-placement for obstacles: pure function of index+seed
function placeObst(def, seed) {
    const rnd = lcg(seed * 2654435761 + 7)
    const out = []
    for (let k = 0; k < def.obst.length; k++) {
        const f = def.obst[k]
        const side = k % 2 ? 1 : -1
        const jitter = 0.28 + rnd() * 0.55
        const kind = rnd() < 0.62 ? 'tree' : 'rock'
        out.push({ f, x: side * jitter, kind, r: kind === 'tree' ? 0.16 : 0.20 })
        // a twin on the far verge half the time for texture
        if (rnd() < 0.5) out.push({ f: f + 0.02, x: -side * (0.9 + rnd() * 0.4), kind: rnd() < 0.5 ? 'tree' : 'rock', r: 0.18 })
    }
    return out
}

export function buildCourse(idx) {
    const def = SPINES[((idx % COURSE_COUNT) + COURSE_COUNT) % COURSE_COUNT]
    const seed = 1000 + idx * 77
    const segs = []
    let th = 0, cx = 0, cz = 0, y = 90
    // integrate heading/position first from curve; height follows drop
    const raw = []
    for (const ch of def.chunks) {
        for (let k = 0; k < ch.n; k++) {
            raw.push({ curve: ch.curve, drop: ch.drop })
        }
    }
    const N = raw.length
    for (let i = 0; i < N; i++) {
        th += raw[i].curve * DS
        segs.push({ cx, cz, y, th, curve: raw[i].curve, drop: raw[i].drop })
        cx += Math.sin(th) * DS
        cz += Math.cos(th) * DS
        y -= raw[i].drop * DS
    }
    const kickers = def.kickers.map((k) => {
        const i = Math.round(k.f * N)
        return { i0: i, i1: i + Math.round(6 + k.power), x: k.x, power: k.power, w: k.w, lip: i + Math.round(6 + k.power) }
    })
    const rails = def.rails.map((r) => ({ i0: Math.round(r.f0 * N), i1: Math.round(r.f1 * N), x: r.x }))
    const pipes = (def.pipes || []).map((p) => {
        const i = Math.round(p.f * N)
        return { i0: i, i1: i + 14, x: 0, power: p.power, w: p.w }
    })
    const obstacles = placeObst(def, seed).map((o) => ({ ...o, i: Math.round(o.f * N) }))
    return {
        name: def.name, theme: def.theme, idx: ((idx % COURSE_COUNT) + COURSE_COUNT) % COURSE_COUNT,
        segs, N, length: N * DS, kickers, rails, pipes, obstacles,
        finish: N - 4,
    }
}

export function segAt(c, s) {
    let i = Math.floor(s / DS)
    if (i < 0) i = 0
    if (i > c.N - 1) i = c.N - 1
    return { i, seg: c.segs[i] }
}

// feature lift at (s, x): kicker wedges ramp toward their lip, halfpipe walls
// arc up across the piste. Grounded riders ride this exact surface.
export function featureLift(c, s, x) {
    let lift = 0
    const i = s / DS
    for (const k of c.kickers) {
        if (i >= k.i0 && i <= k.i1) {
            const dx = Math.abs(x - k.x)
            if (dx < k.w) {
                const t = (i - k.i0) / (k.i1 - k.i0)
                const edge = dx < k.w * 0.6 ? 1 : 1 - (dx - k.w * 0.6) / (k.w * 0.4)
                lift = Math.max(lift, k.power * t * t * Math.max(0, edge))
            }
        }
    }
    for (const p of c.pipes) {
        if (i >= p.i0 && i <= p.i1) {
            const t = (i - p.i0) / (p.i1 - p.i0)
            const wall = Math.max(0, Math.abs(x) - 0.35) / 0.65
            lift = Math.max(lift, p.power * Math.sin(Math.PI * t) * (0.35 + 0.65 * wall * wall))
        }
    }
    return lift
}

// side bank beyond the piste edges, and the hard rock wall at |x|>=1.75
function bank(x) {
    const a = Math.abs(x)
    if (a <= 1) return 0
    return (a - 1) * (a - 1) * 9
}

export function terrainY(c, s, x) {
    const { i, seg } = segAt(c, s)
    const f = (s - i * DS) / DS
    const nxt = c.segs[Math.min(c.N - 1, i + 1)]
    const y = seg.y + (nxt.y - seg.y) * f
    return y + bank(x) + featureLift(c, s, x)
}

// world position of a point on the slope — the renderer lives by this
// Lateral sign (#547): +x is the rider's RIGHT — the side that appears on the
// right of the chase-cam screen. The camera looks along d = (sin th, cos th),
// so screen-right = d × up = (-cos th, sin th); the old (+cos, -sin) basis
// mirrored the mountain and every steer input steered backwards.
export function slopePos(c, s, x) {
    const { i, seg } = segAt(c, s)
    const f = (s - i * DS) / DS
    const nxt = c.segs[Math.min(c.N - 1, i + 1)]
    const cx = seg.cx + (nxt.cx - seg.cx) * f
    const cz = seg.cz + (nxt.cz - seg.cz) * f
    const th = seg.th + (nxt.th - seg.th) * f
    return { x: cx - Math.cos(th) * x * 9, z: cz + Math.sin(th) * x * 9, y: terrainY(c, s, x), th }
}

export const WALL_X = 1.75
