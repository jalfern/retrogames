// SSX — course.js : the six mountains. Pure data + geometry helpers, no DOM,
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
//
// #889 — the mountain got bigger. Six original courses, each ~2x the length of
// the original three, each with its own character, and every course carries
// route choices: `gaps` (crevasses you launch over or skirt on the shoulder),
// `chutes` (express troughs that trade the feature line for raw speed) and
// high `rails` (the point line up in the powder band). The RACE is still three
// heats (HEATS), but `tournament(seed)` rotates which three of the six you
// ride — and online rooms run the same rotation off the host seed.

export const DS = 4                       // metres per segment

const smooth01 = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u) }

// #889 route-choice constants (pinned by ssxcheck)
export const GAP_DEPTH = 9               // m a crevasse sinks below its rim
export const GAP_X = 1.15              // |x| under which a crevasse swallows you (the shoulder route lives beyond it)
export const EXPRESS = 1.45            // s-progress multiplier inside a chute

// Every course is chunks of {n, curve, drop}; curve is rad/m of heading turn,
// drop is metres of fall per metre travelled. Chunks are hand-authored spines,
// fixed forever. #889 doubled every spine and gave each a second character
// half, so each mountain reads as a different place, not a recolor.
const SPINES = [
    {   // ALPINE GLADE — the classic day run: summit drop-in, long S's, gullies,
        // a crevasse below the shoulder and an express chute past the step.
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
            // #889 back half — the face keeps falling: a second S district
            { n: 26, curve: 0.014, drop: 0.070 },
            { n: 18, curve: 0.000, drop: 0.095 },
            { n: 22, curve: -0.016, drop: 0.080 },
            { n: 24, curve: 0.000, drop: 0.060 },
            { n: 20, curve: 0.018, drop: 0.085 },
            { n: 16, curve: -0.012, drop: 0.105 },
            { n: 26, curve: 0.000, drop: 0.055 },
            { n: 22, curve: 0.008, drop: 0.070 },
            { n: 20, curve: 0.000, drop: 0.060 },
        ],
        gullies: [{ f0: 0.30, f1: 0.41 }, { f0: 0.62, f1: 0.71 }],
        // #844: authored stretches where the shoulder runs out in exposed rock
        // faces instead of pure snow shoulders (f = fraction, side = which)
        outcrops: [{ f0: 0.16, f1: 0.25, side: 1 }, { f0: 0.48, f1: 0.56, side: -1 }, { f0: 0.82, f1: 0.90, side: 1 }],
        // #889 crevasses: a launch lip is built straight before each span; fly
        // the fall line or take the shoulder around it.
        gaps: [{ f: 0.265, w: 6, power: 3.8 }, { f: 0.575, w: 5, power: 3.4 }],
        // #889 express chutes: sunk troughs that carry speed past the features
        chutes: [{ f0: 0.45, f1: 0.53, x: 0.85, w: 0.5 }, { f0: 0.76, f1: 0.84, x: -0.8, w: 0.5 }],
        // f = fraction of the run, x = lateral fraction of the piste
        kickers: [
            { f: 0.12, x: -0.25, power: 2.6, w: 0.22 },
            { f: 0.185, x: 0.30, power: 3.2, w: 0.24 },
            { f: 0.40, x: -0.15, power: 2.4, w: 0.22 },
            { f: 0.49, x: 0.10, power: 3.6, w: 0.26 },
            { f: 0.70, x: -0.05, power: 3.0, w: 0.24 },
            { f: 0.85, x: 0.20, power: 2.8, w: 0.22 },
        ],
        rails: [
            { f0: 0.36, f1: 0.40, x: 0.55 },
            { f0: 0.70, f1: 0.75, x: -0.55 },
            // #889 high line: up in the powder band, double trickle, slow to reach
            { f0: 0.46, f1: 0.51, x: 1.30, high: true },
        ],
        pipes: [],
        obst: [0.10, 0.21, 0.44, 0.52, 0.66, 0.74, 0.80, 0.90, 0.94],
    },
    {   // NEON HEIGHTS — the night city: summit stage, harder lines, gullies,
        // two crevasses under the lights and a catwalk rail above the crowd.
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
            // #889 back half — the district below the skyline
            { n: 18, curve: 0.022, drop: 0.085 },
            { n: 14, curve: 0.000, drop: 0.110 },
            { n: 16, curve: -0.020, drop: 0.095 },
            { n: 22, curve: 0.000, drop: 0.070 },
            { n: 18, curve: 0.018, drop: 0.080 },
            { n: 16, curve: 0.000, drop: 0.105 },
            { n: 20, curve: -0.014, drop: 0.075 },
            { n: 18, curve: 0.000, drop: 0.065 },
            { n: 22, curve: 0.012, drop: 0.070 },
            { n: 18, curve: 0.000, drop: 0.060 },
        ],
        gullies: [{ f0: 0.16, f1: 0.22 }, { f0: 0.46, f1: 0.52 }, { f0: 0.64, f1: 0.68 }],
        outcrops: [{ f0: 0.28, f1: 0.38, side: -1 }, { f0: 0.74, f1: 0.86, side: 1 }],
        gaps: [{ f: 0.325, w: 5, power: 3.6 }, { f: 0.605, w: 6, power: 3.8 }],
        chutes: [{ f0: 0.19, f1: 0.26, x: -0.8, w: 0.5 }, { f0: 0.48, f1: 0.55, x: 0.8, w: 0.5 }],
        kickers: [
            { f: 0.11, x: 0.00, power: 3.0, w: 0.24 },
            { f: 0.235, x: -0.35, power: 2.4, w: 0.22 },
            { f: 0.42, x: 0.25, power: 3.4, w: 0.26 },
            { f: 0.52, x: -0.20, power: 2.8, w: 0.24 },
            { f: 0.72, x: 0.05, power: 3.8, w: 0.26 },
            { f: 0.86, x: -0.10, power: 2.6, w: 0.22 },
        ],
        rails: [
            { f0: 0.17, f1: 0.22, x: -0.50 },
            { f0: 0.36, f1: 0.40, x: 0.55 },
            { f0: 0.50, f1: 0.55, x: -0.55 },
            { f0: 0.66, f1: 0.71, x: 0.50 },
            { f0: 0.78, f1: 0.83, x: 1.30, high: true },
        ],
        pipes: [],
        obst: [0.08, 0.15, 0.24, 0.30, 0.40, 0.48, 0.58, 0.66, 0.74, 0.82, 0.88, 0.93],
    },
    {   // BIG AIR BASIN — the halfpipe run: rim start, two walls, monster
        // kickers doubled down the whole length of the basin.
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
            // #889 back half — the far rim keeps rolling
            { n: 22, curve: 0.010, drop: 0.070 },
            { n: 20, curve: 0.000, drop: 0.085 },
            { n: 24, curve: -0.010, drop: 0.065 },
            { n: 22, curve: 0.000, drop: 0.075 },
            { n: 20, curve: 0.012, drop: 0.070 },
            { n: 18, curve: 0.000, drop: 0.080 },
            { n: 22, curve: -0.008, drop: 0.065 },
            { n: 20, curve: 0.000, drop: 0.070 },
            { n: 22, curve: 0.000, drop: 0.060 },
        ],
        gullies: [{ f0: 0.40, f1: 0.50 }, { f0: 0.86, f1: 0.95 }],
        outcrops: [{ f0: 0.56, f1: 0.66, side: -1 }],
        gaps: [{ f: 0.48, w: 5, power: 4.0 }],
        chutes: [{ f0: 0.68, f1: 0.74, x: 0.9, w: 0.45 }],
        kickers: [
            { f: 0.30, x: 0.00, power: 4.2, w: 0.34 },
            { f: 0.36, x: 0.00, power: 3.6, w: 0.30 },
            { f: 0.52, x: 0.00, power: 4.6, w: 0.36 },
            { f: 0.60, x: 0.00, power: 4.4, w: 0.34 },
            { f: 0.72, x: 0.00, power: 4.0, w: 0.34 },
        ],
        rails: [],
        pipes: [
            { f: 0.10, power: 5.2, w: 1.0 },
            { f: 0.88, power: 5.2, w: 1.0 },
        ],
        obst: [0.20, 0.40, 0.62, 0.80],
    },
    {   // BACKCOUNTRY BOWL (#889) — the long cruiser: wide-open day face, giant
        // rollers, one thundering canyon gap, and river chutes that hum.
        name: 'BACKCOUNTRY BOWL', theme: 'day',
        chunks: [
            { n: 10, curve: 0.000, drop: 0.045 },   // summit traverse
            { n: 16, curve: 0.000, drop: 0.110 },   // the drop-away
            { n: 26, curve: 0.010, drop: 0.060 },
            { n: 24, curve: 0.000, drop: 0.075 },
            { n: 26, curve: -0.012, drop: 0.065 },
            { n: 28, curve: 0.000, drop: 0.070 },
            { n: 24, curve: 0.012, drop: 0.060 },
            { n: 26, curve: 0.000, drop: 0.075 },
            { n: 24, curve: -0.010, drop: 0.065 },
            { n: 28, curve: 0.000, drop: 0.060 },
            { n: 26, curve: 0.014, drop: 0.070 },
            { n: 24, curve: 0.000, drop: 0.065 },
            { n: 26, curve: -0.012, drop: 0.060 },
            { n: 28, curve: 0.000, drop: 0.055 },
            { n: 26, curve: 0.010, drop: 0.060 },
            { n: 24, curve: 0.000, drop: 0.055 },
            { n: 28, curve: -0.010, drop: 0.055 },
            { n: 26, curve: 0.000, drop: 0.050 },
            { n: 24, curve: 0.008, drop: 0.045 },
        ],
        gullies: [{ f0: 0.30, f1: 0.38 }, { f0: 0.48, f1: 0.56 }],
        outcrops: [{ f0: 0.18, f1: 0.26, side: 1 }, { f0: 0.68, f1: 0.76, side: -1 }],
        gaps: [{ f: 0.36, w: 6, power: 4.2 }],
        chutes: [{ f0: 0.50, f1: 0.58, x: -0.85, w: 0.5 }, { f0: 0.78, f1: 0.85, x: 0.8, w: 0.5 }],
        kickers: [
            { f: 0.14, x: -0.30, power: 2.6, w: 0.24 },
            { f: 0.28, x: 0.25, power: 2.8, w: 0.24 },
            { f: 0.44, x: -0.20, power: 2.4, w: 0.22 },
            { f: 0.58, x: 0.30, power: 3.0, w: 0.26 },
            { f: 0.72, x: -0.15, power: 2.6, w: 0.24 },
            { f: 0.86, x: 0.10, power: 2.8, w: 0.22 },
        ],
        rails: [
            { f0: 0.20, f1: 0.24, x: -0.55 },
            { f0: 0.64, f1: 0.70, x: 1.30, high: true },   // ridge catwalk
        ],
        pipes: [],
        obst: [0.12, 0.22, 0.30, 0.42, 0.50, 0.62, 0.70, 0.80, 0.90],
    },
    {   // TIMBER LINE (#889) — the tight forest slalom: short alternating turns,
        // dense trees, gaps between the trunks and a boardwalk high line.
        name: 'TIMBER LINE', theme: 'dusk',
        chunks: [
            { n: 10, curve: 0.000, drop: 0.045 },   // ridge traverse
            { n: 14, curve: 0.000, drop: 0.115 },   // drop into the trees
            { n: 14, curve: 0.024, drop: 0.085 },
            { n: 12, curve: -0.026, drop: 0.090 },
            { n: 14, curve: 0.022, drop: 0.080 },
            { n: 12, curve: -0.024, drop: 0.095 },
            { n: 14, curve: 0.026, drop: 0.085 },
            { n: 12, curve: -0.022, drop: 0.090 },
            { n: 14, curve: 0.020, drop: 0.080 },
            { n: 12, curve: -0.026, drop: 0.095 },
            { n: 14, curve: 0.024, drop: 0.085 },
            { n: 12, curve: -0.020, drop: 0.090 },
            { n: 14, curve: 0.026, drop: 0.080 },
            { n: 12, curve: -0.024, drop: 0.090 },
            { n: 14, curve: 0.022, drop: 0.075 },
            { n: 12, curve: -0.020, drop: 0.085 },
            { n: 14, curve: 0.018, drop: 0.080 },
            { n: 12, curve: -0.022, drop: 0.085 },
            { n: 14, curve: 0.020, drop: 0.070 },
            { n: 12, curve: -0.018, drop: 0.080 },
            { n: 16, curve: 0.000, drop: 0.065 },
            { n: 14, curve: 0.014, drop: 0.070 },
            { n: 12, curve: -0.012, drop: 0.075 },
            { n: 14, curve: 0.000, drop: 0.060 },
        ],
        gullies: [{ f0: 0.34, f1: 0.40 }, { f0: 0.56, f1: 0.62 }],
        outcrops: [{ f0: 0.24, f1: 0.30, side: 1 }],
        gaps: [{ f: 0.50, w: 5, power: 3.4 }],
        chutes: [{ f0: 0.20, f1: 0.26, x: 0.85, w: 0.45 }, { f0: 0.64, f1: 0.70, x: -0.85, w: 0.45 }],
        kickers: [
            { f: 0.16, x: -0.30, power: 2.2, w: 0.20 },
            { f: 0.30, x: 0.28, power: 2.4, w: 0.20 },
            { f: 0.38, x: -0.25, power: 2.2, w: 0.20 },
            { f: 0.58, x: 0.30, power: 2.6, w: 0.22 },
            { f: 0.72, x: -0.28, power: 2.2, w: 0.20 },
            { f: 0.86, x: 0.15, power: 2.4, w: 0.22 },
        ],
        rails: [
            { f0: 0.40, f1: 0.45, x: 1.30, high: true },   // boardwalk
        ],
        pipes: [],
        obst: [0.10, 0.14, 0.18, 0.24, 0.28, 0.34, 0.38, 0.46, 0.56, 0.62, 0.68, 0.74, 0.80, 0.86, 0.92],
    },
    {   // PIPE WORKS (#889) — the night park: two halfpipes, rails at every
        // tier, wall after wall after wall. Showoff's playground, and the
        // tightest lines on the mountain.
        name: 'PIPE WORKS', theme: 'night',
        chunks: [
            { n: 10, curve: 0.000, drop: 0.045 },   // lift-tower traverse
            { n: 14, curve: 0.000, drop: 0.110 },   // the drop-in
            { n: 22, curve: 0.008, drop: 0.070 },
            { n: 20, curve: 0.000, drop: 0.075 },
            { n: 22, curve: -0.010, drop: 0.065 },
            { n: 20, curve: 0.000, drop: 0.080 },
            { n: 22, curve: 0.010, drop: 0.070 },
            { n: 20, curve: 0.000, drop: 0.075 },
            { n: 24, curve: -0.008, drop: 0.065 },
            { n: 22, curve: 0.000, drop: 0.070 },
            { n: 22, curve: 0.012, drop: 0.065 },
            { n: 20, curve: 0.000, drop: 0.075 },
            { n: 24, curve: -0.010, drop: 0.060 },
            { n: 22, curve: 0.000, drop: 0.055 },
            { n: 22, curve: 0.000, drop: 0.050 },
        ],
        gullies: [{ f0: 0.30, f1: 0.46 }, { f0: 0.80, f1: 0.90 }],
        outcrops: [{ f0: 0.50, f1: 0.58, side: 1 }, { f0: 0.66, f1: 0.74, side: -1 }],
        gaps: [{ f: 0.56, w: 5, power: 3.8 }],
        chutes: [{ f0: 0.66, f1: 0.72, x: -0.85, w: 0.5 }],
        kickers: [
            { f: 0.30, x: 0.00, power: 3.6, w: 0.30 },
            { f: 0.36, x: -0.35, power: 2.4, w: 0.22 },
            { f: 0.44, x: 0.30, power: 2.8, w: 0.24 },
            { f: 0.68, x: -0.30, power: 2.8, w: 0.24 },
            { f: 0.78, x: 0.00, power: 4.2, w: 0.34 },
            { f: 0.86, x: 0.20, power: 2.6, w: 0.22 },
        ],
        rails: [
            { f0: 0.20, f1: 0.25, x: -0.50 },
            { f0: 0.48, f1: 0.53, x: 0.55 },
            { f0: 0.70, f1: 0.75, x: 1.30, high: true },
        ],
        pipes: [
            { f: 0.12, power: 5.0, w: 1.0 },
            { f: 0.62, power: 5.4, w: 1.0 },
        ],
        obst: [0.18, 0.28, 0.40, 0.48, 0.62, 0.74, 0.82, 0.90],
    },
]

export const COURSE_COUNT = SPINES.length

// #889: the RACE is still three heats (rule 6 stands), but WHICH three of the
// six mountains you ride rotates on the game seed. Even seeds ride the classic
// front face — seed 0 keeps the original ALPINE → NEON → BASIN opening — odd
// seeds ride the backcountry side. Online rooms inherit the host seed, so every
// box in a room rotates to the same triple.
export const HEATS = 3
export function tournament(seed) {
    const base = ((((seed | 0) % 2) + 2) % 2) * 3
    return [0, 1, 2].map((h) => (base + h) % COURSE_COUNT)
}

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
    const rails = def.rails.map((r) => ({ i0: Math.round(r.f0 * N), i1: Math.round(r.f1 * N), x: r.x, high: !!r.high }))
    const pipes = (def.pipes || []).map((p) => {
        const i = Math.round(p.f * N)
        return { i0: i, i1: i + 14, x: 0, power: p.power, w: p.w }
    })
    // #889 crevasses: each span gets a launch lip bolted to the snow right
    // before it — the crest launch in sim.js throws anyone fast enough over
    // the span; the span behind it sinks GAP_DEPTH below the rim (featureLift
    // carries the sink so the natural-surface readers never mistake it for terrain).
    const gaps = []
    for (const gp of (def.gaps || [])) {
        const i0 = Math.round(gp.f * N)
        const li = i0 - 1
        const lip0 = li - Math.round(6 + gp.power)
        kickers.push({ i0: lip0, i1: li, x: 0, power: gp.power, w: 0.30, lip: li, gap: true })
        gaps.push({ i0, i1: i0 + gp.w, s0: i0 * DS, s1: (i0 + gp.w) * DS, rim: segs[i0].y })
    }
    const overGap = (s) => gaps.some((gp) => s > gp.s0 - 2 && s < gp.s1 + 2)
    const obstacles = placeObst(def, seed)
        // #889: nothing stands in a crevasse — the sim must not bite on props
        // the renderer skips (painted == ridden).
        .filter((o) => !overGap(o.f * N * DS) || Math.abs(o.x) >= GAP_X + 0.25)
        .map((o) => ({ ...o, i: Math.round(o.f * N) }))
    const gullies = (def.gullies || []).map((gl) => ({ s0: gl.f0 * N * DS, s1: gl.f1 * N * DS }))
    const outcrops = (def.outcrops || []).map((o) => ({ s0: o.f0 * N * DS, s1: o.f1 * N * DS, side: o.side }))
    const chutes = (def.chutes || []).map((ch) => ({
        i0: Math.round(ch.f0 * N), i1: Math.round(ch.f1 * N), x: ch.x, w: ch.w,
    }))
    return {
        name: def.name, theme: def.theme, idx: ((idx % COURSE_COUNT) + COURSE_COUNT) % COURSE_COUNT,
        segs, N, length: N * DS, kickers, rails, pipes, obstacles, gullies, outcrops, gaps, chutes,
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

// #889 crevasse at s: the span (or null). Riders under GAP_X lateral between
// s0 and s1 are over the hole.
export function gapAt(c, s) {
    for (const gp of c.gaps) if (s > gp.s0 && s < gp.s1) return gp
    return null
}

// #889 express chute factor at (s, x): 1 outside, EXPRESS inside a trough.
export function expressAt(c, s, x) {
    for (const ch of c.chutes) {
        if (s > ch.i0 * DS && s < ch.i1 * DS && Math.abs(x - ch.x) < ch.w) return EXPRESS
    }
    return 1
}

// feature lift at (s, x): kicker wedges ramp toward their lip, halfpipe walls
// arc up across the piste. Grounded riders ride this exact surface.
// #889: the same channel carries NEGATIVE lift — crevasse sinks and the carved
// express troughs — so the painted surface and the ridden surface stay one.
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
    for (const gp of c.gaps) {
        if (i >= gp.i0 && i <= gp.i1) {
            const ax = Math.abs(x)
            const fall = 1 - smooth01((ax - 1.0) / 0.4)   // full hole to 1.0, funnel to 1.4 — the shoulder route lives beyond
            lift = Math.min(lift, -GAP_DEPTH * fall)
        }
    }
    for (const ch of c.chutes) {
        if (i >= ch.i0 && i <= ch.i1) {
            const t = (i - ch.i0) / (ch.i1 - ch.i0)
            const dx = Math.abs(x - ch.x)
            const edge = dx < ch.w * 0.6 ? 1 : 1 - (dx - ch.w * 0.6) / (ch.w * 0.4)
            lift = Math.min(lift, -1.5 * Math.sin(Math.PI * t) * Math.max(0, edge))
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

// #844 exposed rock faces: how strongly an authored outcrop is showing at s,
// eased in/out over ~24 m so the rock band breathes like the gullies do.
// Returns the weight plus the side it climbs on (0 when off-span).
export function outcropAt(c, s) {
    let side = 0, w = 0
    for (const oc of c.outcrops) {
        if (s > oc.s0 - 24 && s < oc.s1 + 24) {
            const e = Math.min(s - (oc.s0 - 24), (oc.s1 + 24) - s) / 24
            const ww = smooth01(e)
            if (ww > w) { w = ww; side = oc.side }
        }
    }
    return { side, w }
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

export const SHELF_PROPS = ['tree_pine', 'tree_pine_snow', 'tree_pine_tall', 'tree_oak', 'rock', 'rock_snow', 'rock_angular', 'boulder', 'boulder_snow', 'fence', 'flag', 'marshal_post', 'billboard', 'grandstand']

export function sceneryPlan(c) {
    const out = []
    let n = 0
    const push = (id, s, x, scale, orient, tint = null) => out.push({ id, s, x, scale, rot: shash(n++) * Math.PI * 2, orient, tint })
    const treeAt = (k) => {
        const tr = shash(k)
        return tr < 0.34 ? 'tree_pine' : tr < 0.56 ? 'tree_pine_snow' : tr < 0.78 ? 'tree_pine_tall' : 'tree_oak'
    }
    // #889: nothing with legs stands in a crevasse — the hole stays empty air
    const overGap = (s, x) => gapAt(c, s) !== null && Math.abs(x) < GAP_X
    // crash obstacles first — the things that bite must stand where you see them
    for (const ob of c.obstacles) {
        const s = ob.i * DS
        if (overGap(s, ob.x)) continue
        if (ob.kind === 'tree') push(treeAt(ob.i * 3.1), s, ob.x, 1.05 + shash(ob.i * 1.9) * 0.4, 'rand', 0.88 + shash(ob.i * 7.3) * 0.28)
        else push(shash(ob.i * 5.7) < 0.5 ? 'boulder' : 'rock', s, ob.x, 1.25, 'rand')
    }
    // slalom flags gating the line
    for (let i = 14; i < c.N - 6; i += 7) {
        const fx = ((i / 7 | 0) % 2 ? 1 : -1) * 1.12
        if (overGap(i * DS, fx)) continue
        push('flag', i * DS, fx, 1, 'rand')
    }
    // marker fence along the piste edge wherever the face is open
    for (let i = 8; i < c.N - 4; i += 4) {
        const s = i * DS
        if (openness(c, s) > 0.75) {
            push('fence', s, -(WALL_X + 0.3), 1.3, 'along')
            push('fence', s, WALL_X + 0.3, 1.3, 'along')
        }
    }
    // #844: rock faces — a run of angular outcrops and snow-topped slabs down
    // the authored side, shoulder-high relief to match the rock-band shading
    for (const oc of c.outcrops) {
        let k = 0
        for (let s = oc.s0; s <= oc.s1; s += DS * 2.5) {
            const r = shash(oc.s0 * 0.31 + k * 3.13)
            const id = r < 0.5 ? 'rock_angular' : r < 0.78 ? 'rock_snow' : 'boulder_snow'
            push(id, s, oc.side * (2.6 + shash(k * 1.7 + oc.s1 * 0.13) * 1.8),
                1.4 + shash(k * 5.9 + oc.s0 * 0.07) * 1.2, 'rand')
            k++
        }
    }
    // scatter the face: pines and oaks on the shoulders, rocks on the snow
    for (let i = 5; i < c.N - 3; i++) {
        const s = i * DS
        const r1 = shash(i * 1.37 + 11.3)
        if (r1 < 0.24) {
            const side = r1 < 0.12 ? 1 : -1
            const x = side * (2.5 + shash(i * 2.9) * 3.6)
            if (!overGap(s, x)) push(treeAt(i * 4.3), s, x, 1.35 + shash(i * 6.1) * 0.9, 'rand', 0.85 + shash(i * 5.3) * 0.3)
        }
        if (shash(i * 3.71 + 5) < 0.08) {
            const x = (i % 2 ? 1 : -1) * (1.95 + shash(i * 7.7) * 1.1)
            if (!overGap(s, x)) push(shash(i * 9.1) < 0.5 ? 'rock' : 'boulder', s, x, 1.3, 'rand')
        }
    }
    // the summit gate and the finish banner
    push('flag', 2 * DS, -0.55, 1, 'rand')
    push('flag', 2 * DS, 0.55, 1, 'rand')
    push('marshal_post', 3 * DS, WALL_X + 0.7, 1, 'across')
    push('billboard', (c.N - 8) * DS, -(WALL_X + 1.4), 1.4, 'across')
    // #665: a bank of seats at the line — two grandstands straddling the
    // finish, parked back until the face is open so no gully pierces them
    let gs = (c.N - 5) * DS
    while (gs > 40 && (openness(c, gs) < 0.7 || gapAt(c, gs))) gs -= DS
    push('grandstand', gs, -(WALL_X + 2.6), 1.7, 'across')
    push('grandstand', gs, WALL_X + 2.6, 1.7, 'across')
    return out
}
