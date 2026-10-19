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

// #513: the world grows to 2560² and the asphalt NARROWS (ROAD_R 140 → 80 → 64).
// A real hairpin / Corkscrew / Bus Stop is a braking corner whose own two road
// legs cannot fit inside the old 280 px-wide canyon — the narrower lane plus the
// bigger world is the room they need; 64 keeps the real map's closest leg pairs
// clear at the re-tuned span. SUNDBANK follows the traced DAYTONA ROAD COURSE
// centerline and CORKSCOMB the traced Laguna Seca (reference.js); the harness
// grades the match. SUNSET GULCH keeps its original data unchanged.

export const TX = 2560
export const TY = 2560
export const ROAD_R = 64              // half-width of asphalt (narrowed again #513)
export const KERB_R = ROAD_R + 12    // painted kerb strip
export const WALL_R = ROAD_R + 52    // sand ends, cliff face: the wall

export const COURSE_KEY = 'retrogames:comet.course'

// #518: elevation. Each course carries a closed height profile along the lap:
// anchors [lap-fraction, height-px] interpolated by periodic Catmull-Rom onto
// every polyline point (`p.h`, up-positive px; start/finish pinned at 0 so the
// HD floor and the 2D apron stay put). `p.grade` = dh/ds along the direction of
// travel (+ uphill), the only number the sim reads. No bridges or crossovers:
// the road never crosses another leg's height band — the profile only rolls the
// ground the road already lies on. Grades stay under ~9% (arcade, not stunt).
const ELEV = {
    // canyon roll: a crest on the ridge straight, a dip in the north horseshoe
    gulch: [
        [0, 0], [0.16, 40], [0.3, -55], [0.46, -90], [0.6, -18], [0.74, 80],
        [0.86, 52], [0.94, -26],
    ],
    // the bowl: the banked Turns 1-2 and the International Horseshoe ride high,
    // the Bus Stop complex and the front straight sit low
    sandbank: [
        [0, 0], [0.1, 12], [0.22, 48], [0.34, 64], [0.44, 38], [0.56, 6],
        [0.66, -16], [0.78, -54], [0.88, -62], [0.95, -24],
    ],
    // the map's story is the descent: up the Rahal straight to the Andretti
    // hook, then the Corkscomb drops the field 160px down the hillside
    corkscomb: [
        [0, 0], [0.12, 52], [0.24, 104], [0.36, 96], [0.46, 10], [0.56, -64],
        [0.66, -110], [0.76, -58], [0.86, 16], [0.94, 22],
    ],
}
export const ELEV_MAX_GRADE = 0.095

// Unevenly spaced knots make Catmull-Rom overshoot (the Gulch hit a 30% grade
// between two tight anchors). Resample the authored anchors onto a uniform
// fraction grid first — uniform knots keep the periodic spline's tangent (and
// therefore the grade) bounded — then evaluate the profile on that grid.
function uniformize(elev, n = 48) {
    const out = []
    const m = elev.length
    for (let k = 0; k < n; k++) {
        const f = k / n
        let j = 0
        while (j < m && elev[j][0] <= f) j++
        const ia = (j - 1 + m) % m; const ib = j % m
        let fa = elev[ia][0]; let fb = elev[ib][0]
        if (ib === 0) fb += 1
        const t = (f - fa) / Math.max(1e-6, fb - fa)
        out.push([f, elev[ia][1] + (elev[ib][1] - elev[ia][1]) * t])
    }
    return out
}

function catmullH(anchors, f) {
    const n = anchors.length
    const seg = Math.min(n - 1, Math.floor(f * n))
    const ia = seg
    const ib = (seg + 1) % n
    const fa = anchors[ia][0]; let fb = anchors[ib][0]
    if (ib === 0) fb += 1
    const t = Math.max(0, Math.min(1, (f - fa) / Math.max(1e-6, fb - fa)))
    return catmull(anchors[(ia - 1 + n) % n][1], anchors[ia][1], anchors[ib][1], anchors[(ib + 1) % n][1], t)
}

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
    [1283, 1284], [1463, 1224], [1563, 1141], [1563, 1044], [1516, 947], [1482, 852],
    [1517, 761], [1592, 673], [1812, 655], [1964, 637], [2031, 706], [2058, 818],
    [2132, 881], [2258, 859], [2403, 786], [2427, 556], [2310, 332], [2090, 204],
    [1837, 180], [1586, 185], [1325, 185], [1092, 190], [902, 214], [685, 180],
    [438, 214], [241, 356], [168, 584], [207, 805], [385, 971], [604, 1073],
    [829, 1160], [1048, 1246],
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
    [1222, 2428], [1550, 2448], [1670, 2318], [1716, 2213], [1674, 2144], [1561, 2111],
    [1373, 2075], [1250, 1915], [1195, 1658], [1311, 1423], [1565, 1277], [1845, 1194],
    [2139, 1146], [2371, 1032], [2292, 778], [2132, 530], [1959, 286], [1732, 160],
    [1440, 213], [1173, 330], [909, 452], [632, 523], [498, 757], [236, 885],
    [213, 1119], [412, 1348], [566, 1596], [397, 1841], [227, 2081], [330, 2219],
    [619, 2280], [910, 2338],
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

function buildPoints(control, elev) {
    const UGRID = uniformize(elev)
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
    // #518: height rides the lap fraction; grade is dh/ds along travel, the
    // only slope number the sim reads. Central difference across the two
    // neighbouring segments keeps it continuous through the lap seam.
    // Authored amplitudes are advisory: profiles get rescaled until the
    // steepest section sits under ELEV_MAX_GRADE, so every course pitches the
    // same arcade amount whatever the author wrote.
    for (let i = 0; i < N; i++) pts[i].h = catmullH(UGRID, pts[i].s / s)
    let rawMax = 0
    for (let i = 0; i < N; i++) {
        const nx = pts[(i + 1) % N]; const pv = pts[(i - 1 + N) % N]
        rawMax = Math.max(rawMax, Math.abs(nx.h - pv.h) / Math.max(1, pv.d + pts[i].d))
    }
    const scale = rawMax > ELEV_MAX_GRADE ? ELEV_MAX_GRADE / rawMax : 1
    let hMin = 0; let hMax = 0; let maxGrade = 0
    if (scale !== 1) for (let i = 0; i < N; i++) pts[i].h *= scale
    for (let i = 0; i < N; i++) {
        const p = pts[i]
        const nx = pts[(i + 1) % N]; const pv = pts[(i - 1 + N) % N]
        p.grade = (nx.h - pv.h) / Math.max(1, pv.d + p.d)
        hMin = Math.min(hMin, p.h); hMax = Math.max(hMax, p.h)
        maxGrade = Math.max(maxGrade, Math.abs(p.grade))
    }
    return { pts, len: s, N, hMin, hMax, maxGrade }
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
    const t = buildPoints(c.control, ELEV[c.id])
    BUILT.set(c.id, {
        def: c,
        pts: t.pts, len: t.len, N: t.N,
        hMin: t.hMin, hMax: t.hMax, maxGrade: t.maxGrade,
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
        hMin: t.hMin, hMax: t.hMax, maxGrade: t.maxGrade,
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
