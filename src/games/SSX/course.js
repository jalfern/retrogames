// SSX — course.js : the three mountains. Pure data + geometry helpers, no DOM,
// no Math.random. A course is a downhill centerline integrated segment by
// segment (heading from curve, height from drop), with kickers, rails,
// halfpipes and obstacles parked along it. The sim, the autopilot, the
// renderer and the Node harness all read the SAME numbers, so the mountain the
// harness proves rideable is the mountain that paints.
//
// #638 — mountain feel. Each course is an OPEN FACE first: broad snow shoulders
// where the piste falls, rock walls only inside `gullies` spans (smoothed in and
// out). Rollers and moguls (`undulate`) and turn banking (`bankTurn`) are lift
// added inside terrainY — the single surface — so riders ride exactly what they
// see. Every spine starts on a summit plateau, then the drop falls away.

export const DS = 4                       // metres per segment

const smooth01 = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u) }

// Every course is chunks of {n, curve, drop}; curve is rad/m of heading turn,
// drop is metres of fall per metre travelled. Chunks are seeded permutational
// seasoning on a hand-authored spine, so each course is fixed forever.
const SPINES = [
    {   // ALPINE GLADE — the classic day run: summit drop-in, long S's, gullies.
        name: 'ALPINE GLADE', theme: 'day',
        chunks: [
            { n: 10, curve: 0.000, drop: 0.045 },   // summit traverse (#638)
            { n: 16, curve: 0.000, drop: 0.115 },   // the drop-away below the top
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
        gullies: [{ f0: 0.30, f1: 0.41 }, { f0: 0.62, f1: 0.71 }],
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
    {   // NEON HEIGHTS — the night city: summit stage, harder lines, gullies.
        name: 'NEON HEIGHTS', theme: 'night',
        chunks: [
            { n: 10, curve: 0.000, drop: 0.042 },   // summit traverse (#638)
            { n: 14, curve: 0.000, drop: 0.120 },   // the drop-away below the top
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
        gullies: [{ f0: 0.16, f1: 0.22 }, { f0: 0.46, f1: 0.52 }, { f0: 0.64, f1: 0.68 }],
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
    {   // BIG AIR BASIN — the halfpipe run: rim start, two walls, monster kickers.
        name: 'BIG AIR BASIN', theme: 'dusk',
        chunks: [
            { n: 10, curve: 0.000, drop: 0.045 },   // rim traverse (#638)
            { n: 12, curve: 0.000, drop: 0.110 },   // the drop-away below the rim
            { n: 22, curve: 0.010, drop: 0.065 },
            { n: 20, curve: 0.000, drop: 0.080 },
            { n: 22, curve: -0.012, drop: 0.070 },
            { n: 20, curve: 0.000, drop: 0.090 },
            { n: 22, curve: 0.012, drop: 0.065 },
            { n: 20, curve: 0.000, drop: 0.075 },
            { n: 24, curve: -0.008, drop: 0.060 },
            { n: 22, curve: 0.000, drop: 0.080 },
        ],
        gullies: [{ f0: 0.40, f1: 0.50 }, { f0: 0.86, f1: 0.95 }],
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
    const gullies = (def.gullies || []).map((gl) => ({ s0: gl.f0 * N * DS, s1: gl.f1 * N * DS }))
    return {
        name: def.name, theme: def.theme, idx: ((idx % COURSE_COUNT) + COURSE_COUNT) % COURSE_COUNT,
        segs, N, length: N * DS, kickers, rails, pipes, obstacles, gullies,
        rollPhase: idx * 1.7,
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
            const ax = Math.abs(x)
            const wall = Math.max(0, Math.min(1, (ax - 0.35) / 0.65))
            const fade = 1 - smooth01((ax - 1.4) / 1.2)
            lift = Math.max(lift, p.power * Math.sin(Math.PI * t) * (0.35 + 0.65 * wall * wall) * fade)
        }
    }
    return lift
}

// ---- mountain shaping (#638) -------------------------------------------------

// How open the face is at s: 1 = open mountain side, 0 = gully walls. The
// walls ease in and out over ~22 m so the mountain breathes.
export function openness(c, s) {
    let o = 1
    for (const gl of c.gullies) {
        if (s > gl.s0 - 70 && s < gl.s1 + 70) {
            const e = Math.min(s - (gl.s0 - 70), (gl.s1 + 70) - s) / 70
            o = Math.min(o, 1 - smooth01(e))
        }
    }
    return o
}

// Rollers and moguls down the face (never the centerline heights — segs stay
// monotone downhill). Summed gradient stays under ~0.25 m/m so crests read as
// shaped snow, not launch walls.
export function undulate(c, s) {
    const p = c.rollPhase
    return 0.36 * Math.sin(s * 0.349 + p) + 0.11 * Math.sin(s * 1.047 + p * 2.3 + 1.7)
}

// Banked turns: the outside of a curve lifts, the inside drops (centreline at
// x=0 untouched). Bigger curve = steeper bank; it keeps climbing the shoulder.
export function bankTurn(c, s, x) {
    const { seg } = segAt(c, s)
    return -seg.curve * x * 26
}

// Side of the piste: a snow shoulder that climbs to a distant ridge closing
// the valley; inside a gully an extra rock wall rises ON TOP of the ridge
// (never below it — an overhang would read as a black blade in the sky).
// Near the summit the shoulders taper low so the run falls away below you.
function bank(x, open, s) {
    const a = Math.abs(x)
    if (a <= 1) return 0
    const q = a - 1
    const taper = 0.28 + 0.72 * smooth01((s - 30) / 140)
    // the shoulder climbs to a ridge by q~9 and then the outer mesh SINKS
    // below the ridge line: far columns can never poke over the near crest in
    // silhouette (that overhang read as a black blade in the sky)
    const rise = 8 * smooth01(Math.min(q, 9) / 8) + Math.max(0, Math.min(q, 9) - 8) * 3.2
    const sink = Math.max(0, q - 9)
    const shoulder = rise * taper - sink * sink * 0.55
    // canyon wall: broken jagged rim (two frequencies + per-side offset),
    // higher near the piste, faded out beyond the ridge
    const side = x > 0 ? 1 : -1
    const jag = 0.62 + 0.38 * Math.abs(Math.sin(s * 0.021 + 1.4 + side) * Math.sin(s * 0.0083 + 5.1)
        * (0.85 + 0.3 * Math.sin(s * 0.061 * side + q * 2.1)))
    const wc = Math.min(q, 10)
    const wall = Math.min(24, wc * wc * 2.2) * jag * (1 - smooth01((q - 5) / 10))
    return shoulder + wall * (1 - open)
}

export function terrainY(c, s, x) {
    const { i, seg } = segAt(c, s)
    const f = (s - i * DS) / DS
    const nxt = c.segs[Math.min(c.N - 1, i + 1)]
    const y = seg.y + (nxt.y - seg.y) * f
    return y + bank(x, openness(c, s), s) + featureLift(c, s, x) + undulate(c, s) + bankTurn(c, s, x)
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

// ---- scenery plan (#638) -----------------------------------------------------
// Deterministic prop layout in shelf ids (#637). Pure data so the harness can
// pin it; art.js turns entries into real models (primitive fallback included).
const shash = (n) => { const v = Math.sin(n * 78.233) * 43758.5453; return v - Math.floor(v) }

export const SHELF_PROPS = ['tree_pine', 'tree_oak', 'rock', 'boulder', 'fence', 'flag', 'marshal_post', 'billboard']

export function sceneryPlan(c) {
    const out = []
    let n = 0
    const push = (id, s, x, scale, orient) => out.push({ id, s, x, scale, rot: shash(n++) * Math.PI * 2, orient })
    // crash obstacles first — the things that bite must stand where you see them
    for (const ob of c.obstacles) {
        const s = ob.i * DS
        if (ob.kind === 'tree') push(shash(ob.i * 3.1) < 0.68 ? 'tree_pine' : 'tree_oak', s, ob.x, shash(ob.i * 1.9) < 0.5 ? 1.1 : 1.35, 'rand')
        else push(shash(ob.i * 5.7) < 0.5 ? 'boulder' : 'rock', s, ob.x, 1.25, 'rand')
    }
    // slalom flags gating the line
    for (let i = 14; i < c.N - 6; i += 7) {
        push('flag', i * DS, ((i / 7 | 0) % 2 ? 1 : -1) * 1.12, 1, 'rand')
    }
    // marker fence along the piste edge wherever the face is open
    for (let i = 8; i < c.N - 4; i += 4) {
        const s = i * DS
        if (openness(c, s) > 0.75) {
            push('fence', s, -(WALL_X + 0.3), 1.3, 'along')
            push('fence', s, WALL_X + 0.3, 1.3, 'along')
        }
    }
    // scatter the face: pines and oaks on the shoulders, rocks on the snow
    for (let i = 5; i < c.N - 3; i++) {
        const s = i * DS
        const r1 = shash(i * 1.37 + 11.3)
        if (r1 < 0.24) {
            const side = r1 < 0.12 ? 1 : -1
            push(shash(i * 4.3) < 0.75 ? 'tree_pine' : 'tree_oak', s, side * (2.5 + shash(i * 2.9) * 3.6), 1.5 + shash(i * 6.1), 'rand')
        }
        if (shash(i * 3.71 + 5) < 0.08) {
            push(shash(i * 9.1) < 0.5 ? 'rock' : 'boulder', s, (i % 2 ? 1 : -1) * (1.95 + shash(i * 7.7) * 1.1), 1.3, 'rand')
        }
    }
    // the summit gate and the finish banner
    push('flag', 2 * DS, -0.55, 1, 'rand')
    push('flag', 2 * DS, 0.55, 1, 'rand')
    push('marshal_post', 3 * DS, WALL_X + 0.7, 1, 'rand')
    push('billboard', (c.N - 8) * DS, -(WALL_X + 1.4), 1.4, 'across')
    return out
}

