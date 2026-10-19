// COMET DRIFT GP — the course pack. Each circuit is pure data: one closed
// Catmull-Rom centerline through hand-placed control points, sampled into a
// polyline where every point carries tangent, arc length and curvature. The
// renderer bakes its Mode 7 ground texture from this data, the sim asks it
// what surface a kart is on, and scripts/cometcheck.mjs audits every course
// before anyone drives: minimum radius, no self-crossing road, gates and the
// line on asphalt, autopilot win.
//
// World units = texture pixels (ground texture TX x TY, 1:1 with the world),
// y grows DOWN. Courses run COUNTER-clockwise (left out of the gate, like
// Daytona's banking); start/finish at index 0 on the bottom straight.
//
// #493: TRACK / SCENERY / CHECKPOINTS are the LIVE view of the SELECTED
// course — `selectCourse(id)` swaps their contents in place, so every module
// that holds `const T = TRACK` (sim, art, HD scene) sees the new circuit the
// moment it is chosen. The choice persists in localStorage
// (`retrogames:comet.course`) so HD respects it at load. No selection =
// SUNSET GULCH, byte-identical to pre-#493 data.

// #513: the world grows to 2560² and the asphalt NARROWS (ROAD_R 140 → 80).
// A real hairpin / Corkscrew / Bus Stop is a braking corner whose own two road
// legs cannot fit inside the old 280 px-wide canyon — the narrower lane plus the
// bigger world is the room they need. SUNDBANK now follows the Daytona ROAD
// COURSE centerline and CORKSCOMB follows Laguna Seca (see reference.js); the
// harness grades the match. SUNSET GULCH keeps its original data unchanged.

export const TX = 2560
export const TY = 2560
export const ROAD_R = 80              // half-width of asphalt (narrowed #513)
export const KERB_R = ROAD_R + 12    // painted kerb strip
export const WALL_R = ROAD_R + 52    // sand ends, cliff face: the wall

export const COURSE_KEY = 'retrogames:comet.course'

// ---------------------------------------------------------------------------
// SUNSET GULCH (dusk). The long start straight east, a sweeper up the right
// side, the ridge straight westbound along the top, a wide left horseshoe in
// the north west, and an S down the left side back onto the line. Every corner
// was widened until cometcheck proved min radius >= 200 with no road overlap —
// 200 is flat-out at top speed (8.6 < 0.052 * 200).
const CONTROL_GULCH = [
    [1250, 1795], [1450, 1765], [1640, 1650], [1790, 1490], [1840, 1290], [1810, 1080],
    [1700, 860], [1500, 680], [1250, 570], [980, 520], [730, 560], [560, 720],
    [505, 930], [540, 1150], [600, 1360], [700, 1540], [850, 1680], [1010, 1760],
]

// ---------------------------------------------------------------------------
// SANDBANK SPEED BOWL (noon, #493, layout redone #513). The control points are
// placed on the DAYTONA ROAD COURSE centerline traced from the real Wikimedia
// map (reference.js ← extract-comet-references.mjs ← daytona-road-course.png):
// the long front straight into the banked Turns 1-2 up the right, the back
// straight across the top, the International Horseshoe (T3-4) down the left,
// the T5-7 kinks at the far end and the Bus Stop braking complex — then the
// tight legs are spread until the road clears itself and corners rounded to the
// sim's 60 px minimum radius (shape audit stays <=3% of the map box). Names,
// art and the world stay ours; cometcheck grades the match and the autopilot's
// braking.
const CONTROL_SANDBANK = [
    [1286, 1282], [1513, 1228], [1664, 1130], [1668, 1010], [1641, 930], [1635, 874],
    [1663, 823], [1723, 773], [1835, 731], [1929, 728], [1986, 773], [2033, 830],
    [2102, 861], [2196, 856], [2322, 798], [2355, 575], [2261, 363], [2059, 242],
    [1817, 219], [1575, 224], [1323, 224], [1099, 229], [915, 252], [706, 219],
    [468, 252], [278, 389], [208, 608], [245, 822], [417, 982], [628, 1081],
    [845, 1164], [1056, 1247],
]

// ---------------------------------------------------------------------------
// CORKSCOMB DUNES (dawn, #493 course 2, layout redone #513). Control points on
// the LAGUNA SECA centerline traced from the real Wikimedia map (reference.js ←
// extract-comet-references.mjs ← Laguna_Seca.svg): Rahal straight, the Andretti
// hook at the top, the Corkscomb (the map's Corkscrew double-apex) cutting
// down the middle, the Snake descent and the keyhole onto the start straight.
// Spread + rounded against the same self-clearance and minimum-radius audits.
// Shape is the arcade re-proportion of the CC BY-SA map (credited in the
// README); names, art and the world stay ours.
const CONTROL_CORKSCOMB = [
    [1136, 2302], [1256, 2288], [1302, 2261], [1331, 2230], [1341, 2191], [1336, 2136],
    [1302, 2046], [1255, 1934], [1198, 1654], [1310, 1419], [1555, 1277], [1825, 1197],
    [2109, 1150], [2332, 1041], [2256, 796], [2102, 556], [1935, 322], [1716, 200],
    [1434, 251], [1177, 364], [923, 481], [655, 550], [526, 775], [274, 899],
    [251, 1125], [443, 1345], [592, 1585], [429, 1821], [265, 2053], [364, 2185],
    [643, 2245], [924, 2300],
]

export const COURSES = [
    {
        id: 'gulch', name: 'SUNSET GULCH', short: 'GULCH',
        tagline: 'SUNSET GULCH - 4 LAPS', palette: 'dusk', control: CONTROL_GULCH,
    },
    {
        id: 'sandbank', name: 'SANDBANK SPEED BOWL', short: 'SANDBANK',
        tagline: 'SANDBANK SPEED BOWL - 4 LAPS', palette: 'noon', control: CONTROL_SANDBANK,
    },
    {
        id: 'corkscomb', name: 'CORKSCOMB DUNES', short: 'CORKSCOMB',
        tagline: 'CORKSCOMB DUNES - 4 LAPS', palette: 'dawn', control: CONTROL_CORKSCOMB,
    },
]

export const GULCH = COURSES[0]
export const SANDBANK = COURSES[1]
export const CORKSCOMB = COURSES[2]

function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t; const t3 = t2 * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

function buildPoints(control) {
    const pts = []
    const n = control.length
    const SEG = 26
    for (let i = 0; i < n; i++) {
        const p0 = control[(i - 1 + n) % n]; const p1 = control[i]
        const p2 = control[(i + 1) % n]; const p3 = control[(i + 2) % n]
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

// scenery placed by index so the list is identical in Node, the browser and
// the harness — no dice. Cacti and mesa spires outside the cliff.
function buildScenery(track) {
    const out = []
    for (let i = 0; i < track.N; i += 8) {
        const p = track.pts[i]
        if (p.s < 300 || p.s > track.len - 240) continue
        const side = (i % 16 === 0) ? 1 : -1
        const off = WALL_R + 110 + ((i * 7) % 90)
        out.push({
            x: p.x + Math.cos(p.a + Math.PI / 2) * side * off,
            y: p.y + Math.sin(p.a + Math.PI / 2) * side * off,
            a: p.a,
            kind: (i % 24 === 0) ? 'spire' : 'cactus',
            h: 80 + (i % 5) * 18,
        })
    }
    return out
}

// ---- per-course APIs over a built polyline -----------------------------------
function makeNearest(track) {
    return function nearest(x, y, hint = -1) {
        let bi = 0; let bd = Infinity
        const scan = (i) => {
            const p = track.pts[i]
            const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y)
            if (d < bd) { bd = d; bi = i }
        }
        if (hint >= 0) {
            for (let w = -160; w <= 160; w++) scan((hint + w + track.N * 2) % track.N)
        } else {
            for (let i = 0; i < track.N; i += 2) scan(i)
        }
        const p = track.pts[bi]
        const lat = (x - p.x) * -Math.sin(p.a) + (y - p.y) * Math.cos(p.a)
        return { i: bi, lat, dist: Math.sqrt(bd), s: p.s, a: p.a }
    }
}

function makeAheadK(track) {
    return function aheadK(i, n = 40) {
        let k = 0
        for (let w = 0; w < n; w++) k = Math.max(k, Math.abs(track.pts[(i + w) % track.N].k))
        return k
    }
}

const pctOf = (track, f) => Math.round(f * track.len)

const BUILT = new Map()
for (const c of COURSES) {
    const t = buildPoints(c.control)
    BUILT.set(c.id, {
        def: c,
        pts: t.pts, len: t.len, N: t.N,
        checkpoints: [0.2, 0.4, 0.6, 0.8].map((f) => pctOf(t, f)),
        nearest: makeNearest(t),
        aheadK: makeAheadK(t),
        scenery: buildScenery(t),
    })
}

// ---- the LIVE course: contents swap in place, identities never change -----
export const TRACK = {}
export const SCENERY = []
export const CHECKPOINTS = []

function adopt(courseId) {
    const t = BUILT.get(courseId) || BUILT.get('gulch')
    for (const k of Object.keys(TRACK)) delete TRACK[k]
    Object.assign(TRACK, {
        id: t.def.id, name: t.def.name, short: t.def.short, palette: t.def.palette,
        pts: t.pts, len: t.len, N: t.N,
        ROAD_R, KERB_R, WALL_R,
        nearest: t.nearest, aheadK: t.aheadK,
    })
    SCENERY.length = 0
    SCENERY.push(...t.scenery)
    CHECKPOINTS.length = 0
    CHECKPOINTS.push(...t.checkpoints)
    return t.def
}

let currentId = 'gulch'
try {
    if (typeof localStorage !== 'undefined') {
        const v = localStorage.getItem(COURSE_KEY)
        if (v && BUILT.has(v)) currentId = v
    }
} catch { /* private mode: stay on the Gulch */ }

export let COURSE = adopt(currentId)

export function selectCourse(id) {
    if (!BUILT.has(id)) id = 'gulch'
    currentId = id
    COURSE = adopt(id)
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(COURSE_KEY, id)
    } catch { /* private mode: this session only */ }
    return COURSE
}

export function courseIndex(id = currentId) {
    const i = COURSES.findIndex((c) => c.id === id)
    return i < 0 ? 0 : i
}

export function surfaceAt(x, y, hint) {
    const n = TRACK.nearest(x, y, hint)
    const a = Math.abs(n.lat)
    const surf = a <= ROAD_R ? 'road' : a <= KERB_R ? 'kerb' : a <= WALL_R ? 'sand' : 'wall'
    return { ...n, surf }
}

export const START = { i: 0, s: 0 }
