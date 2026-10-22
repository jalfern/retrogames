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

// #542: the world triples (2560² -> 8192²). The layouts scale x3 about their
// own bbox center and re-centre in the bigger box: laps land ~3x longer at the
// unchanged top speed, and the traced hairpins — which at x3 would all become
// flat-out sweepers — are pulled back in (TIGHTEN) so the signature corners
// stay brakeable at ~105px radius instead of crawling at 67px. Ground textures
// bake at TEX (not TX) so the 2D Mode 7 renderer keeps a sane canvas: the
// texture just samples the world at TEX/TX. SUNDBANK follows the traced DAYTONA
// ROAD COURSE centerline and CORKSCOMB the traced Laguna Seca (reference.js);
// the harness grades the match. Shape is uniform-scaling invariant, so the
// reference gates ride through untouched.
export const TX = 8192
export const TY = 8192
export const TEX = 2560             // bake resolution — decoupled from the world (#542)
export const TEX_S = TEX / TX      // texture px per world px
// #782: the world tripled in #542 (legs now 3x farther apart) but ROAD_R stayed
// at 64 — so two karts (KART.w 76 each = 152px) could not fit side-by-side on a
// 128px ribbon; there was no room to drift or pass. The #513 narrowing to 64 was
// for the old 2560 world where wide roads overlapped at the hairpins; that
// constraint is gone, so the surface opens back up while every centerline stays
// true to its reference. WALL_R stays under the HD wall floor (220px sim clamp).
export const ROAD_R = 96              // half-width of asphalt — fits two karts + drift room (#782)
export const KERB_R = ROAD_R + 14    // painted kerb strip
export const WALL_R = ROAD_R + 36    // sand ends, cliff face: the wall

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
    ],    // the bowl: the banked Turns 1-2 and the International Horseshoe ride high,
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
    // #530 item 3: the lake bed barely rolls — salt flats and old runway
    // slabs; a washboard drop off the north berm and a rise past the tower
    drylake: [
        [0, 0], [0.1, 26], [0.24, -20], [0.4, -52], [0.52, -4], [0.66, 40], [0.8, 16], [0.92, 4],
    ],
}
export const ELEV_MAX_GRADE = 0.095

// #530: the banking law. BANK_K: the curvature that reads as FULL bank (the
// #502 visual measure — a ~450px sweeper); BANK_MAX: the road's maximum roll
// about its tangent, radians (the outside edge of a full-bank bend sits
// ROAD_R·tan(BANK_MAX) above the inside). buildPoints stores the signed roll
// on every point as `p.bank`; the surface height offset at lateral u (px, in
// the +PERP direction) is u·tan(p.bank), so the outside (u = -sign(k)·R) is
// the high side — that is what makes a bowl flat-out.
export const BANK_K = 0.0022
export const BANK_MAX = 0.26

// #542 world growth: layouts are authored at the old 2560 span and grown x3
// about their bbox center into the 8192 box. HEIGHTS grow with them (dh and ds
// both x3 => the authored grades carry through unchanged, cap included), so
// crests read at circuit size. TIGHTEN pulls the signature hairpin apexes
// back in after growing — x3 alone would turn every brakeable corner into a
// flat-out sweeper. Pulls were tuned by scripts/comet-tighten.mjs against the
// ~105px brakeable target (apex ~5.5 px/tick, drift pays for holding more).
const WORLD_SC = 3
const TIGHTEN = {
    gulch: [],
    // Daytona's braking corners: Turns 1-2, the kinks, the horseshoe and the
    // Bus Stop pulled to ~105px apexes (tuner passes, tighten5).
    sandbank: [[1, -13, -27], [2, 31, 17], [3, -35, 9], [4, 28, -12], [5, -30, 0], [6, 21, 12],
        [7, -38, -114], [8, 4, 42], [9, 9, -41], [10, -38, 18], [11, 26, -15], [12, -7, 41],
        [13, -12, -34], [14, 149, 89]],
    // Laguna's: the Corkscomb, the andretti hook exit and the keyhole.
    corkscomb: [[2, -25, -17], [3, 24, 1], [4, -16, 25], [12, -26, -92], [13, 89, 37],
        [14, -91, 46], [30, 77, 58], [31, -82, -17], [32, 37, -76]],
    // #530 item 3: the runway fold — the NE hairpin's four knots pulled toward
    // the fold's centre until the apex reads brakeable (~100px grown), the
    // same target the traced circuits tune to.
    drylake: [[6, -113, -54], [7, -119, 194], [8, 135, 335], [9, 378, 284]],
}

function grown(id, control) {
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity
    for (const [x, y] of control) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x)
        y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    }
    const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2
    const out = control.map(([x, y]) => [TX / 2 + (x - cx) * WORLD_SC, TY / 2 + (y - cy) * WORLD_SC])
    for (const [i, dx, dy] of TIGHTEN[id] || []) {
        out[i] = [out[i][0] + dx, out[i][1] + dy]
    }
    return out
}

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
    [1633, 100], [1513, 165], [1393, 120], [1286, 220], [1178, 377],
    [909, 452], [632, 523], [498, 757], [236, 885],
    [213, 1119], [412, 1348], [566, 1596], [397, 1841], [227, 2081], [330, 2219],
    [619, 2280], [910, 2338],
]

// ---------------------------------------------------------------------------
// DRY LAKE BED (late-afternoon heat, #530 item 3 — the optional third the
// #493 pack left on the board). Hand-authored like the Gulch (never traced
// from a map): an airfield circuit on a salt flat in the Sebring spirit — a
// huge main straight along the bottom, fast sweepers up the east side, the
// signature: a hard braking hairpin at the north-east end (the runway turn),
// a long back straight west, and the kinked pit straight home. The hairpin
// apex is pulled to brakeable radius with TIGHTEN below; everything else is
// flat-out — the lap is won and lost at the fold.
const CONTROL_DRYLAKE = [
    [900, 1750], [1350, 1750], [1750, 1750], [2050, 1760],
    [2270, 1650], [2360, 1420], [2330, 1170], [2240, 960],
    [2070, 865], [1880, 880], [1600, 850], [1300, 850],
    [1020, 850], [760, 900], [590, 1060], [510, 1280],
    [495, 1500], [520, 1650], [590, 1730],
]

export const COURSES = [
    {
        id: 'gulch', name: 'SUNSET GULCH', short: 'GULCH',
        tagline: 'SUNSET GULCH - 4 LAPS', palette: 'dusk', control: grown('gulch', CONTROL_GULCH),
        landmark: 'arch',
    },
    {
        id: 'sandbank', name: 'SANDBANK SPEED BOWL', short: 'SANDBANK',
        tagline: 'SANDBANK SPEED BOWL - 4 LAPS', palette: 'noon', control: grown('sandbank', CONTROL_SANDBANK),
        landmark: 'gantry',
        // #502 item 3: the Bus Stop braking complex — the double-kink onto the
        // front straight. Renderers paint a tire-bar wall + concrete apron on
        // the inside of the bends inside this lap-fraction range so a player
        // SEES the slow bit coming.
        brakeCue: [0.84, 0.965],
    },
    {
        id: 'corkscomb', name: 'CORKSCOMB DUNES', short: 'CORKSCOMB',
        tagline: 'CORKSCOMB DUNES - 4 LAPS', palette: 'dawn', control: grown('corkscomb', CONTROL_CORKSCOMB),
        // #511 item 3: the dunes get their own line structure — a wind-carved
        // dune crest (art.js duneCrest law), not the Gulch's sandstone arch.
        landmark: 'dune',
    },
    {
        id: 'drylake', name: 'DRY LAKE BED', short: 'DRY LAKE',
        tagline: 'DRY LAKE BED - 4 LAPS', palette: 'heat', control: grown('drylake', CONTROL_DRYLAKE),
        // #530 item 3: the airfield gets its own line structure — the old
        // windmill by the start line, not the arch, gantry or dune.
        landmark: 'windmill',
    },
]

export const GULCH = COURSES[0]
export const SANDBANK = COURSES[1]
export const CORKSCOMB = COURSES[2]
export const DRYLAKE = COURSES[3]

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
    // #530: the banked roll (see BANK_MAX above). The magnitude reuses the
    // #502 visual measure — window-max |k| over ±14, full bank at BANK_K —
    // signed toward each bend's inside, then eased over ±8 samples so a
    // double apex (the Corkscomb) re-rolls THROUGH flat at the inflection
    // instead of stepping from one lean to the other across a hairpin.
    const raw = new Array(N)
    for (let i = 0; i < N; i++) {
        const p = pts[i]
        let m = 0
        for (let w = -14; w <= 14; w++) {
            const kk = Math.abs(pts[(i + w + N) % N].k)
            if (kk > m) m = kk
        }
        raw[i] = -Math.sign(p.k) * BANK_MAX * Math.min(1, m / BANK_K)
    }
    for (let i = 0; i < N; i++) {
        let sum = 0
        for (let w = -8; w <= 8; w++) sum += raw[(i + w + N) % N]
        pts[i].bank = sum / 17
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
    // #530 item 2: crest/dip feel. A crest is where the grade flips up->down:
    // a short look BACK averages uphill (grade > 0) while a look AHEAD averages
    // downhill (grade < 0), so (b - a) peaks at the brow. dip is the mirror.
    // Normalised 0..1 across the lap, so the renderer's FOV punch and dip
    // darkening are height-invariant and identical for Node and the browser.
    const CD = crestDipLaw(pts)
    for (let i = 0; i < N; i++) { pts[i].crest = CD.crest[i]; pts[i].dip = CD.dip[i] }
    return { pts, len: s, N, hMin, hMax, maxGrade, crestPeak: CD.crestPeak, dipPeak: CD.dipPeak }
}

// #530 item 2 — the crest/dip law, exported so the harness pins the attached
// `p.crest`/`p.dip` against the same source instead of a mirror. Averages the
// grade ahead vs behind a point over +/-win samples; a brow reads look-back
// positive and look-ahead negative (crest), a bottom the reverse (dip). Each
// lane is then scaled by its own course peak so the strongest feature = 1.
export function crestDipLaw(pts, win = 6) {
    const N = pts.length
    const sum = (i, sgn) => { let m = 0; for (let w = 1; w <= win; w++) m += pts[(i + sgn * w + N) % N].grade; return m / win }
    const crest = new Array(N); const dip = new Array(N)
    const cr = new Array(N); const dr = new Array(N)
    let cMax = 0; let dMax = 0
    for (let i = 0; i < N; i++) {
        const a = sum(i, 1); const b = sum(i, -1)
        // a brow needs BOTH sides: climbing behind (b>0) and descending ahead
        // (a<0). The product is zero on a persistent climb or the start/finish
        // seam (where grade stays positive), so only real summits/dips light up.
        cr[i] = Math.max(0, b) * Math.max(0, -a)
        dr[i] = Math.max(0, a) * Math.max(0, -b)
        if (cr[i] > cMax) cMax = cr[i]
        if (dr[i] > dMax) dMax = dr[i]
    }
    for (let i = 0; i < N; i++) {
        crest[i] = cMax > 0 ? cr[i] / cMax : 0
        dip[i] = dMax > 0 ? dr[i] / dMax : 0
    }
    return { crest, dip, crestPeak: cMax, dipPeak: dMax }
}

// #530 item 2 (crest-lip dust) — the brow-break plume law. Over a crest the far
// edge drops out of frame; the #757 FOV dip implies that break, and this sells
// it with dust kicked off the lip. Pure and height-invariant so the harness pins
// it in Node without Chrome: the kart must be BOTH over a genuine brow (crest
// above THR) and moving (v above VMIN) — a crawling cart on a rise kicks nothing.
// Intensity grows with crest strength and sub-linearly with speed, clamped 0..1.
export function crestDust(crest, v) {
    const THR = 0.35
    const VMIN = 1.5
    if (!(crest > THR) || !(v > VMIN)) return 0
    const strength = (crest - THR) / (1 - THR)
    const speed = Math.min(1, (v - VMIN) / (8 - VMIN))
    return strength * (0.4 + 0.6 * speed)
}

// #530 item 5 — the sprite height-anchor law (2D twin). Mode 7 keeps the ground
// flat, and the horizon already bobs with the CAMERA's own height+grade (index.jsx
// bobTarget, scale ELEV_SCREEN on p.h). But the arch and trackside props are drawn
// at a fixed `HZ + CAM_H*s`, so they ride the horizon rigidly and slide over/under
// the ground line as the kart crests a brow. This law plants a sprite on its OWN
// terrain elevation, relative to the camera's, using the SAME px-per-world-height
// scale as the horizon bob (so it stays consistent and bounded, not a raw projection).
// It returns a screen-space y offset (positive = down): a prop uphill of the eye
// (terr > camTerrain) lifts onto the horizon (negative), a prop in a dip sinks
// (positive), and when the two heights match it is exactly 0 — so on flat/datum
// ground the anchoring is byte-identical to the pre-#530 look. Pure and DOM-free
// so the harness pins it in Node; the renderer must be the only caller.
export const ELEV_SCREEN = 0.035
export function spriteFootShift(terr, camTerrain) {
    return -(terr - camTerrain) * ELEV_SCREEN
}

// scenery placed by index so the list is identical in Node, the browser and
// the harness — no dice. Cacti and mesa spires outside the cliff.
// #542: a lateral offset alone is not enough on a grown course — the loop
// folds back on itself, and apex scenery can sit shoulder-high next to the
// OPPOSITE leg. Items must clear every track point, not just their own.
function buildScenery(track) {
    const out = []
    const clearOfAll = (x, y) => {
        for (let j = 0; j < track.N; j += 2) {
            const q = track.pts[j]
            const dx = q.x - x; const dy = q.y - y
            if (dx * dx + dy * dy < 260 * 260) return false
        }
        return true
    }
    for (let i = 0; i < track.N; i += 8) {
        const p = track.pts[i]
        if (p.s < 300 || p.s > track.len - 240) continue
        const side = (i % 16 === 0) ? 1 : -1
        const off = WALL_R + 190 + ((i * 7) % 120)
        const x = p.x + Math.cos(p.a + Math.PI / 2) * side * off
        const y = p.y + Math.sin(p.a + Math.PI / 2) * side * off
        if (!clearOfAll(x, y)) continue
        out.push({
            x, y,
            a: p.a,
            kind: (i % 24 === 0) ? 'spire' : 'cactus',
            h: 80 + (i % 5) * 18,
            elev: p.h,
            si: i,
        })
    }
    return out
}

// ---- per-course APIs over a built polyline -----------------------------------
function makeNearest(track) {
    // #542: the hint window is ~1180 px — the px reach of the old
    // 160-sample window. Counting samples instead tripled it with the grown
    // spacing and let s hop between the legs flanking start/finish.
    const W = Math.max(24, Math.round(1180 / Math.max(1, track.len / track.N)))
    return function nearest(x, y, hint = -1) {
        let bi = 0; let bd = Infinity
        const scan = (i) => {
            const p = track.pts[i]
            const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y)
            if (d < bd) { bd = d; bi = i }
        }
        if (hint >= 0) {
            for (let w = -W; w <= W; w++) scan((hint + w + track.N * 2) % track.N)
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
    const t = buildPoints(c.control, ELEV[c.id].map(([f, h]) => [f, h * WORLD_SC]))
    BUILT.set(c.id, {
        def: c,
        pts: t.pts, len: t.len, N: t.N,
        hMin: t.hMin, hMax: t.hMax, maxGrade: t.maxGrade,
        crestPeak: t.crestPeak, dipPeak: t.dipPeak,
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
        id: t.def.id, name: t.def.name, short: t.def.short, palette: t.def.palette, landmark: t.def.landmark || 'arch',
        brakeCue: t.def.brakeCue || null,
        pts: t.pts, len: t.len, N: t.N,
        ROAD_R, KERB_R, WALL_R,
        hMin: t.hMin, hMax: t.hMax, maxGrade: t.maxGrade,
        crestPeak: t.crestPeak, dipPeak: t.dipPeak,
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

// ---- #502 item 4: the banking measure ----------------------------------------
// Sandbank is "banked" today only in feel; the player never SEES it. Both
// renderers cue the sweeps off one number: smoothed |curvature| over a
// ±14-sample window normalized to BANK_K (a ~450px sweeper). 0 on the
// straights, 1 in full bank. HD raises the OUTSIDE strata through it,
// the 2D bake lays a rim-shadow band; cometcheck pins the law.
export function bankAt(i) {
    const N = TRACK.N
    let m = 0
    for (let w = -14; w <= 14; w++) {
        const kk = Math.abs(TRACK.pts[(i + w + N) % N].k)
        if (kk > m) m = kk
    }
    return Math.min(1, m / BANK_K)
}
