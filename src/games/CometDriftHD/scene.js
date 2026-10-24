// COMET DRIFT HD — the SUNSET GULCH as real geometry (MODERN bar, docs/ART.md).
//
// World mapping: the sim lives in a 2048² px plane, y down. The 3D world is
// that plane at 1/60 scale: X = x*S, Z = y*S, up = +Y. A sim heading angle `a`
// becomes three-yaw `-a` (a left turn in the sim turns left on screen). The
// sim (CometDrift/sim.js) and the course data (track.js) are reused UNCHANGED
// — everything here is renderer. Geometry builders are Node-safe (pure math +
// BufferGeometry); anything touching `document` (canvas textures) lives in the
// texture/material factories so scripts/cometdrifthdcheck.mjs can audit the
// circuit in Node without a DOM.

import * as THREE from 'three'
import { TRACK, SCENERY, bankAt } from '../CometDrift/track.js'
import { REFERENCES } from '../CometDrift/reference.js'
import { BANDS } from '../CometDrift/bands.js'
import { selectorGeom } from '../CometDrift/selector.js'

export const S = 1 / 60
const T = TRACK
const PERP = (a) => [-Math.sin(a), Math.cos(a)]

// #530 item 2: the road BAND from the real maps (bands.js ← comet-bands.mjs).
// The published track maps paint asphalt + kerbs + run-off, and the band is
// wider at the banked escape areas, narrower where the road threads the trees.
// Half-band fractions of the map span convert to course px with the live
// centerline's bbox span (the arcade layouts sit on the un-mirrored map —
// cometcheck's own alignment rule — so map LEFT/RIGHT ride scene side -1/+1).
// Widths normalise by the lap median, because the arcade asphalt is fatter
// than the map's drawn road: what transfers is the corner-to-corner RATIO.
// Three-tap smoothing kills the hairpin spikes the far-cap can't (two lap
// sections reading as one wide escape), and the inside-of-bend clamp keeps the
// ribbon from folding. Gulch has no traced map: ratio null, rings stay constant.
const BAND_CACHE = new Map()
function bandContext(id = T.id) {
    if (BAND_CACHE.has(id)) return BAND_CACHE.get(id)
    const b = BANDS[id]
    let ctx = null
    if (b) {
        let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity
        for (const p of T.pts) {
            x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x)
            y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y)
        }
        const span = Math.max(x1 - x0, y1 - y0)
        const med = (arr) => { const s = [...arr].sort((u, v) => u - v); return s[Math.floor(s.length / 2)] * span }
        ctx = { span, medL: med(b.left), medR: med(b.right) }
    }
    BAND_CACHE.set(id, ctx)
    return ctx
}

// smoothed measured half-band ratio (0.7..1.7) for one side at point i, or
// null when the course has no traced map. `side` is the ribbon side (+1 PERP).
export function bandRatioAt(i, side, courseId = T.id) {
    const ctx = bandContext(courseId)
    if (!ctx) return null
    const b = BANDS[courseId]
    const arr = side > 0 ? b.right : b.left
    const N = T.N
    const at = (k) => {
        const u = (((k / N) % 1) + 1) % 1
        const len = arr.length
        const x = u * len
        const i0 = Math.floor(x) % len
        const i1 = (i0 + 1) % len
        return arr[i0] + (arr[i1] - arr[i0]) * (x - Math.floor(x))
    }
    const med = side > 0 ? ctx.medR : ctx.medL
    const r = (at(i - 2) + at(i) + at(i + 2)) * ctx.span / (3 * med)
    return Math.min(1.7, Math.max(0.7, r))
}

// painted kerb outer radius: uniform 12px on the Gulch, 8..18px on the
// measured courses (wide escapes get the deeper kerb run).
export const kerbOuterAt = (i, side) => {
    const r = bandRatioAt(i, side)
    return T.ROAD_R + (r === null ? 12 : Math.min(18, Math.max(8, 12 * r)))
}

// per-side wall foot: the map's escape width, floor 220px (the #513 sim-clamp
// margin), ceiling 300px so trackside props (placed from 306px) always stand
// on the plateau, never inside the wall band (#675 floating-prop lesson), and
// capped so a hairpin inside never exceeds 0.8·R (the folded-fin fix).
export const wallOffSideAt = (i, side) => {
    const r = bandRatioAt(i, side)
    let w = wallOffAt(i)
    if (r !== null) w = Math.min(300, Math.max(220, w * r))
    const p = T.pts[i]
    const R = 1 / Math.max(Math.abs(p.k), 1e-6)
    if (p.k * side > 0) w = Math.max(170, Math.min(w, R * 0.8))
    return w
}

// #530 item 4: the `?ref=1` debug overlay — the traced real-map centerline
// (reference.js) fitted onto the shipped circuit: uniform scale to the
// centerline bbox span, bbox-centred, best of direct / mirror-x (the same
// alignment rule cometcheck grades with). 32 traced points are Catmull-
// smoothed onto the lap and ride 0.14u over the asphalt at the nearest
// centerline height — where the arcade spread/tighten moved the road off the
// map, the line visibly leaves it. Null on courses without a reference.
const CATMULL4 = (p0, p1, p2, p3, t) => {
    const t2 = t * t; const t3 = t2 * t
    return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3)
}
export function refOverlayStats(courseId = T.id) {
    const ref = REFERENCES[courseId]
    if (!ref) return null
    const M = ref.pts.length
    const seg = Math.max(2, Math.round(256 / M))
    const smooth = []
    for (let i = 0; i < M; i++) {
        const p0 = ref.pts[(i - 1 + M) % M]; const p1 = ref.pts[i]
        const p2 = ref.pts[(i + 1) % M]; const p3 = ref.pts[(i + 2) % M]
        for (let j = 0; j < seg; j++) {
            const t = j / seg
            smooth.push([CATMULL4(p0[0], p1[0], p2[0], p3[0], t), CATMULL4(p0[1], p1[1], p2[1], p3[1], t)])
        }
    }
    let rx0 = Infinity; let rx1 = -Infinity; let ry0 = Infinity; let ry1 = -Infinity
    for (const [x, y] of smooth) {
        rx0 = Math.min(rx0, x); rx1 = Math.max(rx1, x)
        ry0 = Math.min(ry0, y); ry1 = Math.max(ry1, y)
    }
    const rcx = (rx0 + rx1) / 2; const rcy = (ry0 + ry1) / 2
    let gx0 = Infinity; let gx1 = -Infinity; let gy0 = Infinity; let gy1 = -Infinity
    for (const p of T.pts) {
        gx0 = Math.min(gx0, p.x); gx1 = Math.max(gx1, p.x)
        gy0 = Math.min(gy0, p.y); gy1 = Math.max(gy1, p.y)
    }
    const gcx = (gx0 + gx1) / 2; const gcy = (gy0 + gy1) / 2
    const span = Math.max(gx1 - gx0, gy1 - gy0)
    const fit = (mirror) => {
        let sum = 0
        const coords = new Float32Array(smooth.length * 3)
        for (let k = 0; k < smooth.length; k++) {
            const wx = gcx + (mirror ? rcx - smooth[k][0] : smooth[k][0] - rcx) * span
            const wy = gcy + (smooth[k][1] - rcy) * span
            const n = T.nearest(wx, wy)
            sum += Math.abs(n.lat)
            coords[k * 3] = wx * S
            coords[k * 3 + 1] = T.pts[n.i].h * S + 0.14
            coords[k * 3 + 2] = wy * S
        }
        return { coords, meanPx: sum / smooth.length }
    }
    const direct = fit(false); const mirrored = fit(true)
    const useMirror = mirrored.meanPx < direct.meanPx
    const best = useMirror ? mirrored : direct
    return { coords: best.coords, count: smooth.length, mirror: useMirror, meanPx: best.meanPx, spanPx: span }
}
// #518: the road's world height at point i (px profile → units, up +Y).
export const elevAt = (i) => T.pts[i].h * S

// #530: the rolled road. World-Y of the asphalt under lateral `lat` (px,
// +PERP direction) at point i, and the surface tilt (rad) the mesh sync rides
// so the buggies sit ON the banked surface instead of floating over it.
export const roadRollYAt = (i, lat) => lat * S * Math.tan(T.pts[i].bank)
export const roadRollAt = (i) => T.pts[i].bank

// rockier than a sine: two detuned waves give the rim a natural profile.
// #471: the shipped walls towered over the road and blocked the view — tops
// dropped to ~1.7–3.3u and the face set back outside the sim's clamp. The
// noise stays small: a big setback wobble self-intersects on tight inner
// curves and grows jagged fins at the apexes.
// #542: with the chase cam closer and lower, the rim came down again to
// ~1.4–2.2u so the eye (≈2.4u over the asphalt) clears it on the straights
// and the wall frames the corners instead of walling off the horizon.
const wallTopAt = (i) => 2.07 + Math.sin(i * 0.37 + 1.7) * 0.35 + Math.sin(i * 0.131) * 0.25
// #513 floor: the sim clamps karts at 216px, so the face must never dip
// inside it, whatever the shared road width does — 4px of visible margin.
const wallOffAt = (i) => Math.max(220, T.WALL_R + 16 + Math.sin(i * 0.53) * 4 + Math.sin(i * 0.19 + 4) * 3)
// #518: plateau/wall tops are ABSOLUTE world Y now — the terrain rides the
// course height profile, so anything standing on it (scenery, the camera
// collision lip) reads the elevated value.
export const plateauYAt = (i) => elevAt(i) + wallTopAt(i) - 0.25
export const wallTopYAt = (i) => elevAt(i) + wallTopAt(i)
// #675: where a trackside prop ACTUALLY stands. The old plan used a CONSTANT
// (2.07 − 0.25) above the local road, but the plateau surface follows the wall
// top — wallTopAt swings ±0.6u around the loop and the outside wall climbs
// with banking — so props floated up to ~0.6u off the sand (the "floating
// pines": canopy above the rim, trunk lost behind the wall, no base to read).
// The prop's own side is the law: plateauGeo(side) rides wallTopSideAt.
export const propGroundY = (i, side) => elevAt(i) + wallTopSideAt(i, side) - 0.25
// #502 item 4: the banking cue. Through the bowl's sweepers the OUTSIDE
// strata climb with bankAt(i) (see track.js) — a taller wall against the
// lean, straights untouched. Node-safe; cometdrifthdcheck pins the law.
export const BANK_RISE = 1.15
export const wallTopSideAt = (i, side) => {
    const p = T.pts[i]
    return wallTopAt(i) + (p.k * side < 0 ? bankAt(i) * BANK_RISE : 0)
}

// #718: the sand floor. It was a flat plane at -1.5 — a fit for Gulch that
// #518's elevation work sank under: Sandbank's road dips to -3.1 and
// Corkscomb's to -4.8, so a quarter of those laps drove BELOW the sand. The
// floor now hangs FLOOR_MARGIN under the selected course's lowest asphalt
// edge (camber included, which pushes the outside edge ~0.3u deeper than the
// centerline) and never above the dusk constant, so Gulch keeps its look and
// every course gets a floor its road can't pierce. Node-safe.
export const FLOOR_DUSK = -1.5
export const FLOOR_MARGIN = 0.6
export const asphaltMinY = () => {
    let m = Infinity
    for (let i = 0; i < T.N; i++) m = Math.min(m, elevAt(i) - T.ROAD_R * S * Math.abs(Math.tan(T.pts[i].bank)))
    return m
}
export const courseFloorY = () => Math.min(FLOOR_DUSK, asphaltMinY() - FLOOR_MARGIN)

// #478 item 7 — wall variety: one strata texture tiled the whole loop, so the
// same 8-band pattern read as copy-paste every few seconds at speed. Each lap
// section carries its own rock tint (vertex colours multiply the shared map),
// cycling four stone families 16 times around the lap with smoothstep blends —
// no hard seams, and the exact same field at the start/finish seam because the
// step count divides clean. The two walls run two steps out of phase so a
// straight shows varied stone left AND right, not one mirrored strip.
export const WALL_TINT_PALETTE = [
    [1.00, 0.94, 0.84],
    [0.90, 0.74, 0.58],
    [0.72, 0.54, 0.44],
    [0.96, 0.84, 0.66],
]
export const WALL_TINT_STEPS = 16
const wallPhase = (side) => (side > 0 ? 2 : 0)
export const wallTint = (i, side) => {
    const u = (((i % T.N) + T.N) % T.N) / T.N
    const x = u * WALL_TINT_STEPS + wallPhase(side)
    const k = Math.floor(x)
    const f = x - k
    const sm = f * f * (3 - 2 * f)
    const L = WALL_TINT_PALETTE.length
    const a = WALL_TINT_PALETTE[((k % L) + L) % L]
    const b = WALL_TINT_PALETTE[(((k + 1) % L) + L) % L]
    return [a[0] + (b[0] - a[0]) * sm, a[1] + (b[1] - a[1]) * sm, a[2] + (b[2] - a[2]) * sm]
}

// #530 residual (Jon's post-#518 item 3): dips darken slightly, an ambient-
// occlusion feel cheap enough for vertex colours. The shade is 1 on crests and
// straights and sinks to 1 - AO_MAX in the deepest ground the course reaches,
// driven by whichever is worse: where the asphalt sits in the course's height
// range, or the local dip (#530's crest/dip law) so sharp bottoms darken even
// when the overall range is shallow. A flat course (Gulch: hMax - hMin = 0)
// returns 1 everywhere, so its shipped look is untouched. Node-safe.
export const AO_MAX = 0.28
const AO_FLAT = 1e-6
export const aoShade = (i) => {
    const range = T.hMax - T.hMin
    if (!(range > AO_FLAT)) return 1
    const p = T.pts[((i % T.N) + T.N) % T.N]
    const low = 1 - (p.h - T.hMin) / range
    return 1 - AO_MAX * Math.max(low, p.dip || 0)
}

// ---- #502 item 1: per-course sky tint (the 2D `paletteFor` idiom, #493).
// HD used to wear the dusk skin on EVERY circuit — fog, sun, hemisphere/ambient
// fill, dome stops, mesas and the sand floor were dusk constants, so Sandbank's
// noon bowl read as sunset. Each palette id carries the full lighting law the
// scene applies on course swap; dusk is the shipped look, unchanged stop for
// stop. Node-safe: plain data only.
export const COURSE_TINTS = {
    dusk: {
        fog: 0x8a4a3c, fogD: 0.0072,
        sun: 0xffc090, sunI: 3.6, sunElev: 0.12,
        hemiSky: 0xd06a50, hemiGround: 0x553018, hemiI: 1.8,
        amb: 0x6a4050, ambI: 0.95,
        mesa: 0x4e222c, floor: 0xa87850, plateau: 0xd8a888, hills: 0x6e3a44,
        starGain: 1, sunWash: 0xffffff,
        sky: ['#1a0f24', '#452038', '#7c3030', '#c05830', '#ff9050', '#e07038', '#8a3a28', '#40201a'],
    },
    noon: {
        fog: 0x9db2c2, fogD: 0.0048,
        sun: 0xfff6d0, sunI: 4.2, sunElev: 0.62,
        hemiSky: 0x9cc4e8, hemiGround: 0x6a5a44, hemiI: 2.2,
        amb: 0x94acc4, ambI: 1.1,
        mesa: 0x8a7080, floor: 0xb89468, plateau: 0xe8c898, hills: 0xa28d9c,
        starGain: 0.08, sunWash: 0xfff4da,
        sky: ['#1e4c8c', '#36649c', '#4c84bc', '#7cb0d8', '#a8d0e8', '#c8d8e0', '#9a8468', '#54443a'],
    },
    dawn: {
        fog: 0x8a6a78, fogD: 0.0062,
        sun: 0xffecc8, sunI: 3.8, sunElev: 0.28,
        hemiSky: 0x9a6a88, hemiGround: 0x4a3440, hemiI: 1.9,
        amb: 0x7a5a70, ambI: 1.0,
        mesa: 0x7a4c60, floor: 0xb08468, plateau: 0xe0b890, hills: 0x94647a,
        starGain: 0.45, sunWash: 0xffecd0,
        sky: ['#221a3e', '#40284c', '#6c3a5c', '#a04c64', '#e08858', '#ffb070', '#8a5048', '#38243a'],
    },
}
export const SKY_STOPS = [0, 0.28, 0.38, 0.44, 0.49, 0.53, 0.62, 1]
export const tintFor = (id) => COURSE_TINTS[id] || COURSE_TINTS.dusk

// ---- #511 item 2 (rest): per-course env wash. #502 put sky/fog/lights on the
// course palette, but the #471 equirect wash that gives the liveries their
// sky-glass reflections stayed one hard-coded dusk canvas — Sandbank's noon
// bowls reflected sunset. Each palette carries the full wash law; dusk
// reproduces the shipped canvas stop for stop. Node-safe: plain data only.
export const ENV_WASHES = {
    dusk: {
        stops: [['#241432', 0], ['#7c3a34', 0.36], ['#e07a38', 0.46], ['#8a4428', 0.56], ['#40281c', 1]],
        sun: ['#ffe6aa', '#ff9646'], sunX: 88, sunY: 28, sunR: 20,
    },
    noon: {
        stops: [['#1e4c8c', 0], ['#4c84bc', 0.36], ['#c8d8e0', 0.46], ['#b89468', 0.56], ['#54443a', 1]],
        sun: ['#fffae1', '#fff4da'], sunX: 88, sunY: 10, sunR: 24,
    },
    dawn: {
        stops: [['#221a3e', 0], ['#6c3a5c', 0.36], ['#ffb070', 0.46], ['#b08468', 0.56], ['#38243a', 1]],
        sun: ['#ffecd0', '#ffb070'], sunX: 88, sunY: 20, sunR: 22,
    },
}
export const envWashFor = (id) => ENV_WASHES[id] || ENV_WASHES.dusk

// generic ribbon: sample(i) returns the two edge points in px (with height);
// closed ring, seam duplicated once for continuous UVs.
function buildRibbon(sample, vScale, colorAt) {
    const pos = []
    const uv = []
    const col = []
    const idx = []
    const N = T.N
    for (let i = 0; i <= N; i++) {
        const j = i % N
        const s0 = sample(j)
        const v = T.pts[j].s * S * vScale
        pos.push(s0.ax * S, s0.ay, s0.az * S)
        pos.push(s0.bx * S, s0.by, s0.bz * S)
        uv.push(0, v, 1, v)
        if (colorAt) {
            const c = colorAt(j)
            col.push(c[0], c[1], c[2], c[0], c[1], c[2])
        }
        if (i < N) {
            const a = i * 2
            idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
        }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    if (colorAt) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return geo
}

// The road spans the full width, so build it directly (both edges on one band):
function roadGeo() {
    return buildRibbon((i) => {
        const p = T.pts[i]; const y = p.h * S
        const [pxu, pyu] = PERP(p.a)
        // #530: the bowl rolls about the tangent — the outside edge of a
        // banked bend sits ROAD_R·tan(p.bank) above the inside (track.js).
        const rb = T.ROAD_R * S * Math.tan(p.bank)
        return {
            ax: p.x + pxu * T.ROAD_R, ay: y + 0.06 + rb, az: p.y + pyu * T.ROAD_R,
            bx: p.x - pxu * T.ROAD_R, by: y + 0.06 - rb, bz: p.y - pyu * T.ROAD_R,
        }
    }, 1 / 5, (j) => {
        // #530 residual: asphalt darkens in dips (see aoShade).
        const s = aoShade(j)
        return [s, s, s]
    })
}

function kerbGeo(side) {
    return buildRibbon((i) => {
        const p = T.pts[i]; const y = p.h * S
        const [pxu, pyu] = PERP(p.a)
        // #530: the kerb inherits the bowl's roll at the asphalt edge, so the
        // painted band stays watertight with the road ribbon.
        const rb = S * Math.tan(p.bank)
        // #530 item 2: kerb depth follows the measured band ratio corner to corner.
        const kr = kerbOuterAt(i, side)
        return {
            ax: p.x + pxu * side * kr, ay: y + 0.07 + side * kr * rb, az: p.y + pyu * side * kr,
            bx: p.x + pxu * side * T.ROAD_R, by: y + 0.07 + side * T.ROAD_R * rb, bz: p.y + pyu * side * T.ROAD_R,
        }
    }, 1 / 0.85)
}

function gutterGeo(side) {
    return buildRibbon((i) => {
        const p = T.pts[i]; const y = p.h * S
        const [pxu, pyu] = PERP(p.a)
        // #530 item 2: the run-off's outer edge is the map-measured escape width
        // for THIS side (wallOffSideAt), so wide escapes and tree-tight legs read
        // differently corner to corner instead of one uniform ring.
        const w = wallOffSideAt(i, side)
        const kr = kerbOuterAt(i, side)
        // #530: the runoff eases from the bowl's roll at the kerb edge to
        // flat at the cliff foot — the wall geometry stays put.
        const rb = S * Math.tan(p.bank)
        return {
            ax: p.x + pxu * side * w, ay: y + 0.045, az: p.y + pyu * side * w,
            bx: p.x + pxu * side * kr, by: y + 0.045 + side * kr * rb, bz: p.y + pyu * side * kr,
        }
    }, 1 / 3, (j) => {
        // #530 residual: the run-off sinks with the asphalt into a dip.
        const s = aoShade(j)
        return [s, s, s]
    })
}

function wallGeo(side) {
    return buildRibbon((i) => {
        const p = T.pts[i]; const y = p.h * S
        const [pxu, pyu] = PERP(p.a)
        // offsetting to the INSIDE of a bend collapses the ring once the
        // offset exceeds the local turn radius — the ribbon folded into
        // jagged fins at the hairpins. Clamp inside-wall offsets under the
        // radius so the band stays a band (inside wallOffSideAt, #530 item 2).
        const w = wallOffSideAt(i, side)
        return {
            ax: p.x + pxu * side * w, ay: y + 0.02, az: p.y + pyu * side * w,
            bx: p.x + pxu * side * w, by: y + wallTopSideAt(i, side), bz: p.y + pyu * side * w,
        }
    }, 1 / 7, (j) => {
        // #530 residual: the stone sinks into shadow in a dip too (aoShade ×
        // the #478 per-section tint).
        const s = aoShade(j)
        const t = wallTint(j, side)
        return [t[0] * s, t[1] * s, t[2] * s]
    })
}

function plateauGeo(side) {
    return buildRibbon((i) => {
        const p = T.pts[i]; const y = p.h * S
        const [pxu, pyu] = PERP(p.a)
        const w = wallOffSideAt(i, side)
        const o = w + 430
        const h = y + wallTopSideAt(i, side) - 0.25
        return {
            ax: p.x + pxu * side * o, ay: h, az: p.y + pyu * side * o,
            bx: p.x + pxu * side * w, by: h, bz: p.y + pyu * side * w,
        }
    }, 1 / 9)
}

// Node-safe audit surface for cometdrifthdcheck: ring counts, closures, and the
// hard fact the renderer claims — walls rise, the road is flat, nothing NaNs.
export function trackGeometryStats() {
    const probe = (geo) => {
        const p = geo.getAttribute('position')
        let nan = 0; let minY = Infinity; let maxY = -Infinity
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i)
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) nan++
            minY = Math.min(minY, y); maxY = Math.max(maxY, y)
        }
        return { verts: p.count, nan, minY, maxY }
    }
    const geos = {
        road: roadGeo(),
        kerbL: kerbGeo(-1), kerbR: kerbGeo(1),
        gutterL: gutterGeo(-1), gutterR: gutterGeo(1),
        wallL: wallGeo(-1), wallR: wallGeo(1),
        plateauL: plateauGeo(-1), plateauR: plateauGeo(1),
    }
    const out = {}
    for (const k of Object.keys(geos)) out[k] = probe(geos[k])
    let offMin = Infinity; let offMax = -Infinity; let topMin = Infinity; let topMax = -Infinity
    const N = T.N
    const offL = new Array(N); const offR = new Array(N)
    const kerbL = new Array(N); const kerbR = new Array(N)
    for (let i = 0; i < N; i++) {
        const off = wallOffAt(i); const top = wallTopAt(i)
        offMin = Math.min(offMin, off); offMax = Math.max(offMax, off)
        topMin = Math.min(topMin, top); topMax = Math.max(topMax, top)
        offL[i] = wallOffSideAt(i, -1); offR[i] = wallOffSideAt(i, 1)
        kerbL[i] = kerbOuterAt(i, -1) - T.ROAD_R; kerbR[i] = kerbOuterAt(i, 1) - T.ROAD_R
    }
    const ctx = bandContext()
    const mean = (v) => v.reduce((a, x) => a + x, 0) / v.length
    const std = (v) => Math.sqrt(mean(v.map((x) => (x - mean(v)) ** 2)))
    const band = {
        id: T.id,
        has: ctx !== null,
        spanPx: ctx ? ctx.span : null,
        offL, offR, kerbL, kerbR,
        offStdL: std(offL), offStdR: std(offR),
        asymMean: mean(offL.map((x, i) => Math.abs(x - offR[i]))),
        kerbMin: Math.min(...kerbL, ...kerbR), kerbMax: Math.max(...kerbL, ...kerbR),
        offMinPx: Math.min(...offL, ...offR), offMaxPx: Math.max(...offL, ...offR),
    }
    return { stats: out, geos, band, laps: { vertsExpected: (N + 1) * 2 }, bounds: { offMin, offMax, topMin, topMax, simClampPx: 216, elevMin: T.hMin * S, elevMax: T.hMax * S, maxGrade: T.maxGrade } }
}

// ---- #478 item 3: wheel-spin blur, driver body, nose art, landing squash.
// All Node-safe pure math + geometry so cometdrifthdcheck can gate the laws
// without a browser.

// Spin blur law: spokes streak in above a trot and fully merge at top speed
// (top ~8.6 px/tick). 0 below 2.5, 1 by 7 — monotonic.
export const spinBlurAt = (v) => Math.min(1, Math.max(0, (v - 2.5) / 4.5))

// Landing squash law: suspension compresses under LOAD at crest/landing
// moments — the road slope dropping away while climbing into it at speed.
// 0 when the slope is steady, rising, or the kart is slow.
export const landingSquash = (prevGrade, grade, v) =>
    (v > 2 && prevGrade > 0.02 ? Math.min(0.16, Math.max(0, prevGrade - grade) * v * 1.4) : 0)

// Spoke set for one wheel: three bars per face (rolls with the wheel) plus a
// lagging ghost set whose opacity rides spinBlurAt — the streak. Shared per-kart
// materials so syncMeshes drives all four wheels with two uniform writes.
export function buildSpokes(sharpMat, ghostMat, { len = 0.32, faceX = 0.071, bar = 0.02 } = {}) {
    const sharp = new THREE.Group()
    const ghost = new THREE.Group()
    const barGeo = new THREE.BoxGeometry(bar, len, bar)
    for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            const ang = (i * Math.PI) / 3
            const s = new THREE.Mesh(barGeo, sharpMat)
            s.rotation.x = ang; s.position.x = side * faceX
            sharp.add(s)
            const gh = new THREE.Mesh(barGeo, ghostMat)
            gh.rotation.x = ang - Math.PI / 12; gh.position.x = side * faceX
            ghost.add(gh)
        }
    }
    return { sharp, ghost }
}

// The driver: helmeted head, visor, torso, both arms reaching the wheel —
// the nubs that make an empty cockpit read as a person at speed.
export function buildDriver(accentHex) {
    const g = new THREE.Group()
    const suit = new THREE.MeshStandardMaterial({ color: 0x241c28, roughness: 0.85, metalness: 0.1 })
    const helm = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.4, metalness: 0.3 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x14101a, roughness: 0.6 })
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), helm)
    head.position.set(0, 0.52, 0)
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.055, 0.05), dark)
    visor.position.set(0, 0.53, 0.09)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.16), suit)
    torso.position.set(0, 0.38, -0.02)
    const armGeo = new THREE.BoxGeometry(0.055, 0.055, 0.2)
    const armL = new THREE.Mesh(armGeo, suit); armL.position.set(-0.155, 0.42, 0.05); armL.rotation.x = -0.5
    const armR = new THREE.Mesh(armGeo, suit); armR.position.set(0.155, 0.42, 0.05); armR.rotation.x = -0.5
    g.add(head, visor, torso, armL, armR)
    g.userData.parts = ['head', 'visor', 'torso', 'armL', 'armR']
    return g
}

// Per-livery nose art beyond the one stripe: four deterministic motifs keyed
// to the driver index, so seven karts read as seven entries at a glance.
export function buildNoseArt(accentHex, variant) {
    const g = new THREE.Group()
    const m = new THREE.MeshStandardMaterial({ color: accentHex, metalness: 0.25, roughness: 0.35 })
    m.userData.ghost = true
    const v = ((variant | 0) % 4 + 4) % 4
    if (v === 0) {
        for (let i = 0; i < 2; i++) {
            const c = new THREE.Mesh(new THREE.BoxGeometry(0.26 - i * 0.08, 0.02, 0.05), m)
            c.position.set(0, 0.405, 0.44 + i * 0.12); g.add(c)
        }
    } else if (v === 1) {
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.06), m); a.position.set(0, 0.405, 0.5); g.add(a)
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.4), m); b.position.set(0, 0.405, 0.62); g.add(b)
    } else if (v === 2) {
        for (const sx of [-1, 1]) {
            const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.7), m)
            s.position.set(sx * 0.24, 0.405, 0.05); g.add(s)
        }
    } else {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 12), m)
        ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.405, 0.72); g.add(ring)
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.02, 0.05), m); cap.position.set(0, 0.53, -0.52); g.add(cap)
    }
    return g
}

// ---- karts: exposed-wheel buggies assembled from primitives, livery per
// driver. Node-safe: plain materials, no textures.
export function buildKart(hex, accentHex, variant = 0) {
    const g = new THREE.Group()
    const body = new THREE.MeshStandardMaterial({ color: hex, metalness: 0.3, roughness: 0.32 })
    body.userData.ghost = true // #1002: the livery is what the asphalt mirrors
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c161e, metalness: 0.2, roughness: 0.7 })
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 1.0), body)
    chassis.position.y = 0.3
    g.add(chassis)
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.42), body)
    nose.position.set(0, 0.28, 0.62)
    g.add(nose)
    const pod = new THREE.BoxGeometry(0.14, 0.12, 0.55)
    const podL = new THREE.Mesh(pod, dark); podL.position.set(-0.3, 0.26, -0.05); g.add(podL)
    const podR = new THREE.Mesh(pod, dark); podR.position.set(0.3, 0.26, -0.05); g.add(podR)
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.05, 0.22), body)
    wing.position.set(0, 0.5, -0.52)
    g.add(wing)
    const strutGeo = new THREE.BoxGeometry(0.05, 0.18, 0.05)
    for (const sx of [-0.18, 0.18]) {
        const strut = new THREE.Mesh(strutGeo, dark)
        strut.position.set(sx, 0.4, -0.5)
        g.add(strut)
    }
    // #471: the boxes read toy-like — cockpit hollow, nose stripe, brake lights
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.5), dark)
    cockpit.position.set(0, 0.36, 0.02)
    g.add(cockpit)
    const stripeMat = new THREE.MeshStandardMaterial({ color: accentHex, emissive: new THREE.Color(accentHex), emissiveIntensity: 0.18, metalness: 0.25, roughness: 0.35 })
    stripeMat.userData.ghost = true
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.5), stripeMat)
    stripe.position.set(0, 0.41, 0.55)
    g.add(stripe)
    const brakeMat = new THREE.MeshStandardMaterial({ color: 0x601010, emissive: 0xff2010, emissiveIntensity: BRAKE_IDLE, roughness: 0.6 })
    const brakes = []
    for (const sx of [-0.2, 0.2]) {
        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.02), brakeMat)
        bl.position.set(sx, 0.5, -0.631)
        g.add(bl)
        brakes.push(bl)
    }
    // #478 item 3: the boxed helmet/visor moved into buildDriver (index.jsx
    // mounts it on every kart, primitive or GLB, so the driver survives the
    // model swap). Per-livery nose art past the single stripe:
    const noseArt = buildNoseArt(accentHex, variant)
    g.add(noseArt)
    g.userData.noseArt = noseArt
    const wheelGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.13, 14)
    wheelGeo.rotateZ(Math.PI / 2)
    // #478 item 3: accent spokes + lagging ghosts — sharp at rest, merged into
    // a streak at top speed (opacities driven by spinBlurAt in syncMeshes).
    const spinMats = {
        sharp: new THREE.MeshStandardMaterial({ color: accentHex, metalness: 0.45, roughness: 0.4, transparent: true, opacity: 1 }),
        ghost: new THREE.MeshStandardMaterial({ color: accentHex, metalness: 0.45, roughness: 0.4, transparent: true, opacity: 0 }),
    }
    const wheels = []
    const wheelDefs = []
    const mk = (sx, sz, front) => {
        const pivot = new THREE.Group()
        pivot.position.set(sx * 0.42, 0.24, sz)
        const w = new THREE.Mesh(wheelGeo, dark)
        pivot.add(w)
        const sp = buildSpokes(spinMats.sharp, spinMats.ghost)
        // on the PIVOT (not the rolling mesh): the roll list drives them once
        pivot.add(sp.sharp, sp.ghost)
        g.add(pivot)
        if (front) wheels.push(pivot)
        wheelDefs.push({ node: pivot, front, baseQuat: pivot.quaternion.clone(), steerSign: 1, rollSign: 1, meshes: [w, sp.sharp, sp.ghost] })
    }
    mk(-1, 0.52, true); mk(1, 0.52, true); mk(-1, -0.45, false); mk(1, -0.45, false)
    g.userData.wheels = wheels
    g.userData.wheelDefs = wheelDefs
    g.userData.spinMats = spinMats
    g.userData.body = body
    g.userData.brakes = brakes
    return g
}

// #477: sim heading -> three yaw. The sim drives along (cos a, sin a) in the
// (x,y) px plane, mapped to world (X,Z) = (x*S, y*S) with up +Y. The buggy's
// nose is local +Z, and rotating +Z by yaw θ lands it on (sin θ, cos θ); to
// chase (cos a, sin a) we need θ = π/2 − a. The old −a pointed the nose 90°
// off — Jon's "drives as if its front were the driver's left door" bug.
export const kartYaw = (a) => Math.PI / 2 - a

// Model footprint: the GLB is ~3.4 m / 1.46 m wide; the road half-width is
// ROAD_R·S ≈ 2.33u and kartR·S ≈ 0.57u, so the authored buggy scales to about
// a kart's footprint at ~0.48×.
export const BUGGY_SCALE = 0.48

// #481 item 2: the blob shadow was a 0.72r disc fixed to world Z — too big
// for the 0.48× buggy and misaligned the moment the kart pointed anywhere but
// down the axis. Measured from the real GLB bounds: paint+cage span z −1.61..1.83
// (3.44 m) and wheels span x ±0.99 (1.98 m), so the footprint is the ellipse
// the shadow must hug.
export const BUGGY_FOOT = { l: +(3.44 * BUGGY_SCALE).toFixed(3), w: +(1.98 * BUGGY_SCALE).toFixed(3) }

// Two-pass ellipse (Node-safe: no canvas texture): a soft wide halo under a
// tighter dark core fakes the penumbra. Callers steer rotation.y by kartYaw.
export function makeBlobShadow() {
    const g = new THREE.Group()
    const ellipse = (sx, sz) => {
        const geo = new THREE.CircleGeometry(0.5, 20)
        geo.rotateX(-Math.PI / 2)
        geo.scale(sx, 1, sz)
        return geo
    }
    const mk = (sx, sz, opacity) => new THREE.Mesh(
        ellipse(sx * BUGGY_FOOT.w, sz * BUGGY_FOOT.l),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: false }))
    const halo = mk(1.14, 1.08, 0.14)
    const core = mk(0.8, 0.78, 0.32)
    g.add(halo, core)
    g.userData.parts = ['halo', 'core']
    g.userData.halo = halo
    g.userData.core = core
    return g
}

// #1002: kart reflections. A real probe mirror is out of reach on this
// budget (the README's standing gap), so the asphalt gets the agreed cheap
// version: a stretched, flattened, livery-darkened GHOST under each kart.
// Only meshes whose material carries `userData.ghost` join the clone (body +
// accent trim — the dark wheels are already owned by the blob shadow), the
// clone shares geometry, and each ghost material is its own instance so the
// per-kart opacity can ride distance and speed.
export const GHOST = {
    dark: 0.42,      // livery darken — a smear of the car, not a second car
    emissive: 0.12,  // lamps do not glow in the reflection
    flatten: 0.30,   // y squash: the smear lies on the road
    stretchK: 0.035, // per speed unit the smear stretches along the nose
    stretchMax: 0.45,
    range: 34,       // world units from the camera — ghosts beyond this are gone
    y: 0.03,         // just above the asphalt, under the blob shadow plane
    base: 0.5,       // opacity at the camera, fading linearly to 0 at range
}
export function buildKartGhost(source) {
    const g = new THREE.Group()
    const mats = []
    const cache = new Map()
    const drop = []
    const clone = source.clone(true)
    clone.traverse((o) => {
        if (!o.isMesh) return
        const src = o.material
        if (!src || !src.userData || !src.userData.ghost) { drop.push(o); return }
        if (!cache.has(src)) {
            const m = src.clone()
            m.color.multiplyScalar(GHOST.dark)
            if (m.emissive) { m.emissive.multiplyScalar(GHOST.emissive) }
            m.transparent = true
            m.opacity = 0
            m.depthWrite = false
            m.envMap = null
            m.envMapIntensity = 0
            cache.set(src, m)
            mats.push(m)
        }
        o.material = cache.get(src)
    })
    for (const o of drop) { const p = o.parent; if (p) p.remove(o) }
    g.add(clone)
    return { group: g, mats }
}

// #995: the dusk sun hangs low at a fixed azimuth, so a shadow falls AWAY
// from it, not under the kart's nose — the halo counter-rotates against the
// yaw-steered group to hold the world-fixed sun line, stretches along it, and
// softens as the kart rides higher (crests and banked rims lift the body off
// its own shadow). Pure so cometdrifthdsandcheck gates the law at Node.
export const SUN_SHADOW = { az: 0.92, stretch: 1.7, core: 0.32, halo: 0.14, liftK: 0.3 }
export function sunShadow(h) {
    const lift = Math.max(0, h)
    const soft = 1 - Math.min(0.5, lift * SUN_SHADOW.liftK)
    return {
        az: SUN_SHADOW.az,
        stretch: SUN_SHADOW.stretch + Math.min(0.6, lift * 0.25),
        core: +(SUN_SHADOW.core * soft).toFixed(3),
        halo: +(SUN_SHADOW.halo * soft).toFixed(3),
    }
}

// #481 item 4: exhaust outlets from the authored model, not guessed — the
// chrome pipes run the flanks (x ±0.70 m) and exit at the tail (z −1.61 m,
// y ≈ 0.46 m). In kart-root units (the group scales by BUGGY_SCALE).
export const BUGGY_EXHAUST = { x: 0.70, y: 0.46, z: -1.61 }
export const exhaustOutlets = () => [1, -1].map((s) => ({
    x: +(s * BUGGY_EXHAUST.x * BUGGY_SCALE).toFixed(3),
    y: +(BUGGY_EXHAUST.y * BUGGY_SCALE).toFixed(3),
    z: +(BUGGY_EXHAUST.z * BUGGY_SCALE).toFixed(3),
}))

// #481 item 3: taillights are lamps, not off-black — a dim idle glow so they
// read as lenses before the brake pedal, full blaze behind it.
export const BRAKE_IDLE = 0.35
export const BRAKE_ON = 1.8

// #481 item 5: front-wheel steer travel — 0.45 rad read stiff against the
// body's drift rotation at speed.
export const STEER_MAX = 0.62

// Cached GLB load. Browser-only: dynamic-imports GLTFLoader so importing this
// module in Node (the harness) never pulls DOM/WebGL code. Resolves null on any
// failure so the caller can keep the primitive fallback — the race never dies.
let buggyPromise = null
export function loadBuggy() {
    if (!buggyPromise) {
        buggyPromise = (async () => {
            const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
            const url = `${import.meta.env.BASE_URL || '/'}models/vehicles/dune_buggy.glb`
            const gltf = await new GLTFLoader().loadAsync(url)
            return gltf.scene
        })().catch(() => null)
    }
    return buggyPromise
}

// Wire a cloned dune buggy for one driver: deep-clone every material so rival
// liveries don't bleed, recolour Paint_Orange (body) and Accent_Yellow (trim),
// arm the taillights as brake lamps, and collect the four wheel pivots with the
// signs that make them spin/steer correctly through the model's baked 180° flip
// on the right-hand nodes (derivation and proof in scripts/cometdrifthdcheck).
export function decorateBuggy(root, hex, accentHex) {
    const matCache = new Map()
    let body = null
    let brakeMat = null
    root.traverse((o) => {
        if (!o.isMesh) return
        if (!matCache.has(o.material)) matCache.set(o.material, o.material.clone())
        const m = matCache.get(o.material)
        o.material = m
        const nm = m.name || ''
        if (nm === 'Paint_Orange') { m.color = new THREE.Color(hex); m.userData.ghost = true; body = m }
        else if (nm === 'Accent_Yellow') { m.color = new THREE.Color(accentHex); m.emissive = new THREE.Color(accentHex); m.emissiveIntensity = 0.22; m.userData.ghost = true }
        else if (nm === 'Taillight_Red') { m.emissive = new THREE.Color(0xff2010); m.emissiveIntensity = BRAKE_IDLE; brakeMat = m }
    })
    const wheels = []
    // #478 item 3: accent spokes + ghosts on the authored wheels too, sized in
    // buggy metres (the group later scales by BUGGY_SCALE). They inherit the
    // pivot's baked flip and join the roll list, so they spin with the tires.
    const spinMats = {
        sharp: new THREE.MeshStandardMaterial({ color: accentHex, metalness: 0.45, roughness: 0.4, transparent: true, opacity: 1 }),
        ghost: new THREE.MeshStandardMaterial({ color: accentHex, metalness: 0.45, roughness: 0.4, transparent: true, opacity: 0 }),
    }
    for (const [name, side, front] of [['Wheel_FL', 1, true], ['Wheel_FR', -1, true], ['Wheel_RL', 1, false], ['Wheel_RR', -1, false]]) {
        const node = root.getObjectByName(name)
        if (!node) continue
        const meshes = node.children.filter((c) => c.isMesh)
        const sp = buildSpokes(spinMats.sharp, spinMats.ghost, { len: 0.66, faceX: 0.17, bar: 0.05 })
        node.add(sp.sharp, sp.ghost)
        wheels.push({ node, front, side, baseQuat: node.quaternion.clone(), steerSign: side, rollSign: side, meshes: [...meshes, sp.sharp, sp.ghost] })
    }
    return { group: root, body, brakeMat, wheels, spinMats }
}

// ---- GPU particles: pooled additive point systems (sparks, dust, flames).
// Positions/velocities are integrated here at tick rate; the pool is fixed so
// allocation never happens mid-race. Node-safe (no map until the browser adds
// one) so the check can count pools.
export function makePool(count, size) {
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const vel = new Float32Array(count * 3)
    const life = new Float32Array(count)
    const maxLife = new Float32Array(count)
    const geo = new THREE.BufferGeometry()
    const posAttr = new THREE.BufferAttribute(pos, 3)
    posAttr.setUsage(THREE.DynamicDrawUsage)
    const colAttr = new THREE.BufferAttribute(col, 3)
    colAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', posAttr)
    geo.setAttribute('color', colAttr)
    const mat = new THREE.PointsMaterial({
        size, vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 1,
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    let head = 0
    let alive = 0
    const tmp = new THREE.Color()
    return {
        points,
        get aliveCount() { return alive },
        spawn(x, y, z, vx, vy, vz, ttl, colorHex) {
            const i = head; head = (head + 1) % count
            pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z
            vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz
            life[i] = ttl; maxLife[i] = ttl
            tmp.set(colorHex)
            col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b
        },
        step(gravity, floor = 0) {
            let n = 0
            for (let i = 0; i < count; i++) {
                if (life[i] <= 0) { col[i * 3] = 0; col[i * 3 + 1] = 0; col[i * 3 + 2] = 0; continue }
                life[i]--
                pos[i * 3] += vel[i * 3]; pos[i * 3 + 1] += vel[i * 3 + 1]; pos[i * 3 + 2] += vel[i * 3 + 2]
                vel[i * 3 + 1] += gravity
                const f = life[i] / maxLife[i]
                col[i * 3] *= 0.86 + 0.12 * f
                col[i * 3 + 1] *= 0.86 + 0.12 * f
                col[i * 3 + 2] *= 0.86 + 0.12 * f
                if (pos[i * 3 + 1] < floor) pos[i * 3 + 1] = floor
                n++
            }
            alive = n
            posAttr.needsUpdate = true
            colAttr.needsUpdate = true
        },
        clear() {
            life.fill(0); col.fill(0); alive = 0
            posAttr.needsUpdate = true; colAttr.needsUpdate = true
        },
        // #1016: bright live particles for the 2D bloom fallback (refuge tier).
        glowEntries(minLuma) {
            const out = []
            for (let i = 0; i < count; i++) {
                if (life[i] <= 0) continue
                const luma = 0.2126 * col[i * 3] + 0.7152 * col[i * 3 + 1] + 0.0722 * col[i * 3 + 2]
                if (luma < minLuma) continue
                out.push({ x: pos[i * 3], y: pos[i * 3 + 1], z: pos[i * 3 + 2], r: col[i * 3], g: col[i * 3 + 1], b: col[i * 3 + 2], f: life[i] / maxLife[i] })
            }
            return out
        },
    }
}

// ---- gold streaks (#478 item 4): camera-aligned additive quads, not tripled
// points. Each live streak billboards onto the camera plane: its long axis is
// the velocity projected into that plane (screen-right fallback when velocity
// points at/away from the viewer), so a dash always reads as a motion dash at
// any camera angle and never smears into depth. Head/tail taper + per-tick
// fade match the point pools' look. Node-safe: without a camera the axes are
// identity, so the check can measure quad geometry with no renderer.
export const streakLen = (len, speed) => len * (0.3 + 0.7 * Math.min(1, speed / 0.05))
export function makeStreakPool(count, opts = {}) {
    const width = opts.width || 0.075
    const pos = new Float32Array(count * 4 * 3)
    const col = new Float32Array(count * 4 * 3)
    const idx = new Uint16Array(count * 6)
    for (let i = 0; i < count; i++) {
        const b = i * 4
        idx[i * 6] = b; idx[i * 6 + 1] = b + 1; idx[i * 6 + 2] = b + 2
        idx[i * 6 + 3] = b; idx[i * 6 + 4] = b + 2; idx[i * 6 + 5] = b + 3
    }
    const geo = new THREE.BufferGeometry()
    const posAttr = new THREE.BufferAttribute(pos, 3)
    posAttr.setUsage(THREE.DynamicDrawUsage)
    const colAttr = new THREE.BufferAttribute(col, 3)
    colAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', posAttr)
    geo.setAttribute('color', colAttr)
    geo.setIndex(new THREE.BufferAttribute(idx, 1))
    const mat = new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    const x = new Float32Array(count); const y = new Float32Array(count); const z = new Float32Array(count)
    const vx = new Float32Array(count); const vy = new Float32Array(count); const vz = new Float32Array(count)
    const life = new Float32Array(count); const maxLife = new Float32Array(count)
    const len = new Float32Array(count)
    const r = new Float32Array(count); const g = new Float32Array(count); const b = new Float32Array(count)
    let head = 0
    let alive = 0
    const tint = new THREE.Color()
    const right = new THREE.Vector3()
    const dir = new THREE.Vector3()
    const axis = new THREE.Vector3()
    const side = new THREE.Vector3()
    return {
        mesh,
        get aliveCount() { return alive },
        spawn(px, py, pz, ivx, ivy, ivz, ttl, colorHex, streakLen0) {
            const i = head; head = (head + 1) % count
            x[i] = px; y[i] = py; z[i] = pz
            vx[i] = ivx; vy[i] = ivy; vz[i] = ivz
            life[i] = ttl; maxLife[i] = ttl
            len[i] = streakLen0 || 0.28
            tint.set(colorHex)
            r[i] = tint.r; g[i] = tint.g; b[i] = tint.b
        },
        step(gravity, floor = 0, camera = null) {
            if (camera && camera.quaternion) {
                right.set(1, 0, 0).applyQuaternion(camera.quaternion)
                dir.set(0, 0, -1).applyQuaternion(camera.quaternion)
            } else {
                right.set(1, 0, 0); dir.set(0, 0, -1)
            }
            let n = 0
            for (let i = 0; i < count; i++) {
                const vb = i * 12
                if (life[i] <= 0) { col.fill(0, vb, vb + 12); continue }
                life[i]--
                x[i] += vx[i]; y[i] += vy[i]; z[i] += vz[i]
                vy[i] += gravity
                if (y[i] < floor) y[i] = floor
                const f = life[i] / maxLife[i]
                const k = 0.86 + 0.12 * f
                r[i] *= k; g[i] *= k; b[i] *= k
                const dot = vx[i] * dir.x + vy[i] * dir.y + vz[i] * dir.z
                axis.set(vx[i] - dir.x * dot, vy[i] - dir.y * dot, vz[i] - dir.z * dot)
                const spdSq = vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]
                if (axis.lengthSq() < 0.01 * spdSq + 1e-12) axis.copy(right)
                axis.normalize()
                side.crossVectors(axis, dir)
                if (side.lengthSq() < 1e-9) side.set(0, 1, 0)
                side.normalize()
                const Lh = streakLen(len[i], Math.hypot(vx[i], vy[i], vz[i])) * 0.5
                const Wh = width * 0.5
                const hx = x[i]; const hy = y[i]; const hz = z[i]
                const ax = axis.x * Lh; const ay = axis.y * Lh; const az = axis.z * Lh
                const sx = side.x * Wh; const sy = side.y * Wh; const sz = side.z * Wh
                pos[vb] = hx - ax - sx; pos[vb + 1] = hy - ay - sy; pos[vb + 2] = hz - az - sz
                pos[vb + 3] = hx + ax - sx; pos[vb + 4] = hy + ay - sy; pos[vb + 5] = hz + az - sz
                pos[vb + 6] = hx + ax + sx; pos[vb + 7] = hy + ay + sy; pos[vb + 8] = hz + az + sz
                pos[vb + 9] = hx - ax + sx; pos[vb + 10] = hy - ay + sy; pos[vb + 11] = hz - az + sz
                const tr = r[i] * 0.35; const tg = g[i] * 0.35; const tb = b[i] * 0.35
                col[vb] = tr; col[vb + 1] = tg; col[vb + 2] = tb
                col[vb + 3] = r[i]; col[vb + 4] = g[i]; col[vb + 5] = b[i]
                col[vb + 6] = r[i]; col[vb + 7] = g[i]; col[vb + 8] = b[i]
                col[vb + 9] = tr; col[vb + 10] = tg; col[vb + 11] = tb
                n++
            }
            alive = n
            posAttr.needsUpdate = true
            colAttr.needsUpdate = true
        },
        clear() {
            life.fill(0); col.fill(0); alive = 0
            posAttr.needsUpdate = true; colAttr.needsUpdate = true
        },
        // #1016: bright live streak heads for the 2D bloom fallback (refuge tier).
        glowEntries(minLuma) {
            const out = []
            for (let i = 0; i < count; i++) {
                if (life[i] <= 0) continue
                const luma = 0.2126 * r[i] + 0.7152 * g[i] + 0.0722 * b[i]
                if (luma < minLuma) continue
                out.push({ x: x[i], y: y[i], z: z[i], r: r[i], g: g[i], b: b[i], f: life[i] / maxLife[i] })
            }
            return out
        },
    }
}

// ---- #1016: the 2D bloom fallback for the classic-WebGL refuge. The refuge
// builds no TSL post chain (no WebGPU/node backend), so the gold-spark payoff
// goes flat there. This is the cheap substitute: the shell hands it the pools'
// bright heads (pool.glowEntries(minLuma)) plus the live camera, and gets back
// additive screen-space glow discs — the same "gold only" law the node chain's
// luminance threshold enforces, in the linear working space three colours in:
// gold heads (luma ≈0.68) pass, violet (0.31) / blue (0.43) and the dusk sky
// never do, and the per-tick ×0.86 decay fades each disc as its spark dies.
// Pure + deterministic: Node and browser agree, so cometdrifthdcheck can gate
// the law headlessly.
export const BLOOM2D_MIN_LUMA = 0.55
export const BLOOM2D_SPREAD = 2.6
export const BLOOM2D_MAX_DISCS = 48
export const bloomLuma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b
export function bloomDiscs(entries, camera, W, H, opts = {}) {
    const minLuma = opts.minLuma ?? BLOOM2D_MIN_LUMA
    const spread = opts.spread ?? BLOOM2D_SPREAD
    const focal = (H * 0.5) / Math.tan(((camera.fov || 64) * Math.PI) / 360)
    const out = []
    const v = new THREE.Vector3()
    const c = new THREE.Vector3()
    camera.getWorldPosition(c)
    for (const e of entries) {
        const luma = bloomLuma(e.r, e.g, e.b)
        if (luma < minLuma) continue
        v.set(e.x, e.y, e.z)
        const dist = v.distanceTo(c)
        if (dist < 1e-6) continue
        v.project(camera)
        if (v.z > 1) continue
        const sx = (v.x * 0.5 + 0.5) * W
        const sy = (-v.y * 0.5 + 0.5) * H
        if (sx < -80 || sx > W + 80 || sy < -80 || sy > H + 80) continue
        const rad = Math.min(96, Math.max(4, focal * spread / dist))
        out.push({ x: sx, y: sy, r: rad, a: Math.min(0.65, luma * 0.55 * (0.35 + 0.65 * (e.f ?? 1))), c: [e.r, e.g, e.b] })
    }
    out.sort((p, q) => q.r - p.r)
    return out.slice(0, opts.maxDiscs ?? BLOOM2D_MAX_DISCS)
}

// ---- dusk sky: banding breakers + twinkling stars (#478 item 6). Node-safe
// laws. The 8-bit dusk gradient bands visibly on OLED/phones, so the sky
// texture gets a deterministic ±DITHER_AMP hash noise: same pixels, same
// noise, every boot. Stars live ONLY in the upper band (dir.y >= STAR_Y_MIN)
// so the dusk rim and the sun stay clean, and twinkle() is the brightness law
// the shell animates per tick — additive points, never geometry churn.
export const DITHER_AMP = 1.5
const ihash = (x, y) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
export const skyNoise = (x, y) => (ihash(x, y) - 0.5) * 2 * DITHER_AMP
export function applySkyDither(data, w, h, amp = DITHER_AMP) {
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4
            const n = (ihash(x, y) - 0.5) * 2 * amp
            data[i] = Math.min(255, Math.max(0, data[i] + n))
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n))
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n))
        }
    }
    return data
}
export const STAR_COUNT = 56
export const STAR_Y_MIN = 0.55
export const twinkle = (phase, tick) => 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(tick * 0.055 + phase * Math.PI * 2))
export function makeStarDefs(count = STAR_COUNT, seed = 7) {
    const defs = []
    for (let s = 0; s < count; s++) {
        const y = STAR_Y_MIN + (0.98 - STAR_Y_MIN) * ihash(s + 1, seed * 13 + 3)
        const az = ihash(s * 7 + 3, seed + 11) * Math.PI * 2
        const r = Math.sqrt(Math.max(0, 1 - y * y))
        defs.push({
            dir: [r * Math.cos(az), y, r * Math.sin(az)],
            phase: ihash(s + 5, seed * 3 + 1),
            gain: 0.55 + 0.45 * ihash(seed, s + 9),
        })
    }
    return defs
}

// ---- HUD scale + safe-area top (#478 item 8) --------------------------------
// The old law took the SMALLER of the two ratios, so a 390x844 portrait phone
// (width-bound at 0.93) drew an instrument cluster sized for a 420px-wide
// strip — POS read 7px, the ladder pips 3px. A tall narrow viewport has all
// its room vertically: portrait viewports now get a height-driven lift (up to
// 1.3x) on top of the fit ratio, and the floor moves 0.72 -> 0.85 so even a
// 320px phone draws legible digits. Landscape and desktop are untouched: the
// portrait factor is 1 unless h > 1.4w.
export const HUD_MIN = 0.85
export const HUD_PORTRAIT_MAX = 1.3
export const hudScale = (w, h) => {
    const base = Math.min(h / 240, w / 420)
    const portrait = h > w * 1.4 ? Math.min(HUD_PORTRAIT_MAX, h / 560) : 1
    return Math.max(HUD_MIN, Math.min(2, base * portrait))
}
// The #437 corner chrome sits at 12px + var(--sat) with a ~29px button; the
// HUD row must start below it on NOTCHED phones too, so the band rides the
// same safe-area inset the chrome does.
export const CHROME_BAND = 46
export const hudTop = (safeTop) => CHROME_BAND + Math.max(0, safeTop)

// ---- #511 item 4: the attract screen's vertical stack. Fractions of H put
// the title baseline 0.06H above the course-name line — at lite scale (u≈1.5
// on 640x426) that gap is ~26px under a 46px title, so 'HD · CORKSCOMB
// DUNES' wrote straight over 'COMET DRIFT', and at 840x420 the letter-spaced
// noon name ran edge-to-edge over the POS panel and the minimap. The stack is
// now computed from the glyph boxes it holds, not from fractions: every block
// clears the next by ATTRACT_GAP, the whole column shrinks (ua, floored so it
// stays readable) when the band runs out, and the spaced name carries a fit
// scale clamped to the corridor between the two HUD columns. Node-safe.
export const ATTRACT_GAP = 6
export const ATTRACT_UA_MIN = 0.55
export const ATTRACT_CHAR_W = 0.62
export const ATTRACT_NAME_LEFT = 70
export const ATTRACT_NAME_RIGHT = 74
export function attractLayout(u, W, H, best = 0, nameLen = 13) {
    const build = (ua) => {
        const gap = ATTRACT_GAP * ua
        const ft = 30 * ua; const fn = 16 * ua; const fs = 11 * ua
        const fm = 10 * ua; const fb = 8 * ua; const fk = 10 * ua
        const pbs = Math.min(52 * ua, H * 0.058)
        const title = { fs: ft, y: ft * 0.78 }
        const name = { fs: fn, y: title.y + ft * 0.22 + gap + fn * 0.78 }
        const sel = { fs: fs, y: name.y + fn * 0.22 + gap * 1.2 + fs * 0.78 }
        const prev = { top: sel.y + fs * 0.22 + gap * 1.2, size: pbs }
        const msg = { fs: fm, y: prev.top + pbs + gap + fm * 0.78 }
        const bestO = best > 0
            ? { fs: fb, y: msg.y + fm * 0.22 + gap * 0.6 + fb * 0.78, step: fb + 2 * ua }
            : null
        const lastY = bestO ? bestO.y + (best - 1) * bestO.step + fb * 0.22 : msg.y + fm * 0.22
        const blink = { fs: fk, y: lastY + gap + fk * 0.78 }
        return { ua, ft, fn, title, name, sel, prev, msg, best: bestO, blink, bottom: blink.y + fk * 0.22 }
    }
    const b0 = 0.16 * H; const b1 = 0.78 * H
    const pad = 8 * u
    let ua = u
    const full = build(ua)
    if (b0 + pad + full.bottom > b1 - pad) ua = Math.max(ATTRACT_UA_MIN, (b1 - b0 - pad * 2) / full.bottom)
    const L = build(ua)
    const availW = Math.max(80, W - (ATTRACT_NAME_LEFT + ATTRACT_NAME_RIGHT) * u)
    const estW = (2 * nameLen + 5) * ATTRACT_CHAR_W * L.name.fs
    return {
        band: [b0, b1], gap: ATTRACT_GAP * ua, availW, ua,
        title: { fs: L.ft, y: b0 + L.title.y },
        name: { fs: L.fn, y: b0 + L.name.y, estW, fit: Math.min(1, availW / Math.max(1, estW)) },
        sel: { fs: L.sel.fs, y: b0 + L.sel.y },
        prev: { top: b0 + L.prev.top, size: L.prev.size },
        msg: { fs: L.msg.fs, y: b0 + L.msg.y },
        best: L.best ? { fs: L.best.fs, y: b0 + L.best.y, step: L.best.step } : null,
        blink: { fs: L.blink.fs, y: b0 + L.blink.y },
    }
}

// ---- #794: the HD attract's chevron BUTTONS. The 2D twin solved the phone
// title in #534 (thumb-sized hit-boxes flanking the name, centre stays the
// start zone); HD drew the chevrons as plain text and any tap launched. This
// places the shared #534 contract (selector.js) on the HD stack: the row
// rides attractLayout's sel line, the boxes flank the MEASURED name, and the
// clamp keeps both boxes fully on-screen at any viewport. Returns the same
// geom shape selectorHit consumes, so one hit test serves both twins.
export const SELECT_HW = 34
export const SELECT_HH = 22
export const SELECT_GAP = 8
export function attractSelectGeom(W, H, u, selY, nameHalfW) {
    const hw = Math.max(1, Math.round(SELECT_HW * u))
    const hh = Math.max(1, Math.round(SELECT_HH * u))
    const want = Math.round(nameHalfW + SELECT_GAP * u + hw)
    const off = Math.max(hw + Math.round(16 * u), Math.min(want, Math.round(W / 2 - hw - Math.round(2 * u))))
    return selectorGeom(W, H, u, { rowY: Math.round(selY), off, hw, hh })
}

// ---- #502 item 3: the Bus Stop braking cue (Sandbank). Tire-bar walls hug
// the INSIDE of every bend inside TRACK.brakeCue, so the double-kink announces
// itself as the slow bit long before the brake mark. Node-safe: defs first,
// meshes only when the browser passes materials.
export const TIRE_R = 0.62
export const TIRE_SPACING = 15
export function brakeCueDefs() {
    if (!T.brakeCue) return []
    const [f0, f1] = T.brakeCue
    const N = T.N
    const bars = []
    let last = -1e9
    for (let i = 0; i < N; i++) {
        const f = i / N
        if (f < f0 || f > f1) continue
        const p = T.pts[i]
        const side = Math.sign(p.k)
        if (!side || Math.abs(p.k) < 0.00008) continue
        const s = p.s
        if (s - last < TIRE_SPACING) continue
        last = s
        const [pxu, pyu] = PERP(p.a)
        const off = T.KERB_R + 16
        bars.push({
            x: p.x + pxu * side * off, z: p.y + pyu * side * off, y: p.h * S,
            a: p.a, side, f: +f.toFixed(3), color: bars.length % 2 ? 'white' : 'red',
        })
    }
    return bars
}

export function buildTireBars(redMat, whiteMat) {
    const g = new THREE.Group()
    const bars = brakeCueDefs()
    if (!bars.length) return g
    const cyl = new THREE.CylinderGeometry(TIRE_R, TIRE_R, 0.5, 10)
    for (const b of bars) {
        const m = new THREE.Mesh(cyl, b.color === 'red' ? redMat : whiteMat)
        m.position.set(b.x * S, b.y + 0.25, b.z * S)
        m.rotation.x = Math.PI / 2
        m.rotation.z = -b.a
        g.add(m)
    }
    return g
}

// ---- the structure over the line: the Gulch's landmark arch, now standing
// 5 metres off the asphalt. Legs land in the sand gutter, safely outside the
// sim's wall limit — the karts never touch it. Browser can pass a strata
// texture for the rock; Node-safe without one.
// #502 item 2: the landmark is per-course. Sandbank SPEED BOWL's is the
// Daytona-style start/finish gantry — a wide timing-line bridge with twin
// trussed towers and a three-lamp signal board, not a sandstone arch.
export function buildArch(strataMap) {
    if (T.landmark === 'gantry') return buildGantry(strataMap)
    const g = new THREE.Group()
    const strata = new THREE.MeshStandardMaterial({ color: 0xb07050, map: strataMap || null, metalness: 0.05, roughness: 0.9 })
    const darker = new THREE.MeshStandardMaterial({ color: 0x6e3c28, map: strataMap || null, metalness: 0.05, roughness: 0.95 })
    const p = T.pts[0]
    const leg = new THREE.BoxGeometry(0.36, 2.3, 0.36)
    for (const s of [-1, 1]) {
        const m = new THREE.Mesh(leg, strata)
        g.add(m)
        m.position.set(s * 3.15, 1.15, 0)
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.6), darker)
        foot.position.set(s * 3.15, 0.11, 0)
        g.add(foot)
    }
    const span = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.24, 8, 20, Math.PI), strata)
    g.add(span)
    span.position.y = 2.3
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.56), darker)
    key.position.set(0, 2.3 + 3.15, 0)
    g.add(key)
    // sit it on the line, squared to the road; #518: the line rides the profile
    g.position.set(p.x * S, p.h * S, p.y * S)
    g.rotation.y = -p.a + Math.PI / 2
    return g
}

export const GANTRY_SPAN = 7.6
export const GANTRY_DECK_Y = 4.6
export function buildGantry(strataMap) {
    const g = new THREE.Group()
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, map: strataMap || null, metalness: 0.35, roughness: 0.55 })
    const beam = new THREE.MeshStandardMaterial({ color: 0x565c66, metalness: 0.3, roughness: 0.6 })
    const concrete = new THREE.MeshStandardMaterial({ color: 0xb8b0a4, map: strataMap || null, metalness: 0.02, roughness: 0.95 })
    const tower = new THREE.BoxGeometry(0.42, GANTRY_DECK_Y, 0.42)
    for (const s of [-1, 1]) {
        const t = new THREE.Mesh(tower, steel)
        t.position.set(s * 3.5, GANTRY_DECK_Y / 2, 0)
        g.add(t)
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.3, 0.85), concrete)
        foot.position.set(s * 3.5, 0.15, 0)
        g.add(foot)
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(GANTRY_SPAN, 0.55, 0.5), steel)
    deck.position.y = GANTRY_DECK_Y
    g.add(deck)
    const braceGeo = new THREE.BoxGeometry(0.14, 1.9, 0.14)
    for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(braceGeo, beam)
        b.position.set(-2.85 + i * 1.9, GANTRY_DECK_Y + 0.85, 0)
        b.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.62
        g.add(b)
    }
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.72, 0.14), beam)
    board.position.set(0, GANTRY_DECK_Y - 0.62, 0)
    g.add(board)
    const lampGeo = new THREE.BoxGeometry(0.3, 0.3, 0.16)
    const lampCols = [0xd03028, 0xe0a030, 0x30b048]
    for (let i = 0; i < 3; i++) {
        const lamp = new THREE.Mesh(lampGeo, new THREE.MeshStandardMaterial({
            color: lampCols[i], emissive: lampCols[i], emissiveIntensity: 0.55, roughness: 0.4,
        }))
        lamp.position.set((i - 1) * 0.78, GANTRY_DECK_Y - 0.62, 0.09)
        g.add(lamp)
    }
    const p = T.pts[0]
    g.position.set(p.x * S, p.h * S, p.y * S)
    g.rotation.y = -p.a + Math.PI / 2
    return g
}

// cactus / hoodoo from SCENERY, standing on the plateau rim. Node-safe.
export function buildSceneryItem(sc) {
    const g = new THREE.Group()
    const h = sc.h * S
    if (sc.kind === 'cactus') {
        const green = new THREE.MeshStandardMaterial({ color: 0x3f6b34, roughness: 0.8 })
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, h * 1.15, 7), green)
        trunk.position.y = h * 0.575
        g.add(trunk)
        const armGeo = new THREE.CylinderGeometry(0.09, 0.1, h * 0.42, 6)
        const a1 = new THREE.Mesh(armGeo, green); a1.position.set(-0.28, h * 0.62, 0); g.add(a1)
        const a2 = new THREE.Mesh(armGeo, green); a2.position.set(0.26, h * 0.5, 0); g.add(a2)
        const k1 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 6), green); k1.rotation.z = Math.PI / 2; k1.position.set(-0.15, h * 0.44, 0); g.add(k1)
        const k2 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 6), green); k2.rotation.z = Math.PI / 2; k2.position.set(0.14, h * 0.32, 0); g.add(k2)
    } else {
        const rock = new THREE.MeshStandardMaterial({ color: 0x6e3c2a, roughness: 0.92 })
        const cap = new THREE.MeshStandardMaterial({ color: 0x3c2018, roughness: 0.95 })
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.62, h * 1.6, 7), rock)
        shaft.position.y = h * 0.8
        g.add(shaft)
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.5, 0.34, 7), cap)
        top.position.y = h * 1.6 + 0.1
        g.add(top)
    }
    const near = T.nearest(sc.x, sc.y, -1)
    g.position.set(sc.x * S, plateauYAt(near.i), sc.y * S)
    return g
}

// far mesas: a dark silhouette ring on the ember horizon. #471: pushed out
// and trimmed down so they frame the sky instead of walling it off.
// #542: the ring used to be pinned at the OLD course's center and radius —
// when the world tripled, the track ran out past it and karts drove under the
// silhouettes. The ring now derives from the live track bounds: always outside
// the furthest track point, so the mesas stay horizon scenery on every course.
// live bounding box of the selected course in world units (x, z, radius) —
// the horizon furniture hangs off this so it rings EVERY course, not just the
// one it was authored for (#542).
export function worldAnchor() {
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity
    for (const p of T.pts) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
        minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y)
    }
    const cx = (minX + maxX) / 2 * S
    const cz = (minZ + maxZ) / 2 * S
    let R = 0
    for (const p of T.pts) {
        const d = Math.hypot(p.x * S - cx, p.y * S - cz)
        if (d > R) R = d
    }
    return { cx, cz, R }
}

export function mesaDefs() {
    const { cx, cz, R } = worldAnchor()
    const shapes = []
    let maxW = 0
    for (let i = 0; i < 14; i++) {
        const h = (4.5 + ((i * 37) % 4) * 2.4) * (R / 60)
        const w = (6.5 + ((i * 53) % 5) * 3) * (R / 60)
        if (w > maxW) maxW = w
        shapes.push({ h, w })
    }
    const base = R + maxW + 12
    const defs = []
    for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2 + Math.sin(i * 3.1) * 0.2
        const r = base + (i % 4) * 14 + Math.sin(i * 7.7) * 5
        defs.push({ x: cx + Math.cos(ang) * r, z: cz + Math.sin(ang) * r, h: shapes[i].h, w: shapes[i].w, ang })
    }
    return defs
}

// #675: rolling hills. The horizon shipped flat-topped mesas but nothing
// between them and the plateau, so the middle distance was empty sand. The
// hills ring sits just OUTSIDE the furthest track point (clearance-checked,
// same #542 law as the mesas) and well INSIDE the mesa base: low, rounded,
// overlapping shoulders — the soft counter-shape to the mesas' hard tops.
export const HILL_RING = 26 // world units past the outermost track point
export function hillDefs() {
    const { cx, cz, R } = worldAnchor()
    const defs = []
    for (let i = 0; i < 18; i++) {
        const ang = (i / 18) * Math.PI * 2 + Math.sin(i * 5.3) * 0.16
        const w = Math.min((4 + ((i * 29) % 5) * 1.2) * (R / 60), HILL_RING - 5) // keep ≥5u of corridor past the line
        const h = w * (0.30 + ((i * 17) % 3) * 0.08)
        const r = R + HILL_RING + ((i * 41) % 5) * 3
        defs.push({ x: cx + Math.cos(ang) * r, z: cz + Math.sin(ang) * r, w, h, ang })
    }
    return defs
}

export function buildHills(color = 0x6e3a44, floorY = FLOOR_DUSK) {
    const g = new THREE.Group()
    const soil = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 })
    for (const d of hillDefs()) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(d.w, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), soil)
        m.scale.y = d.h / d.w
        m.position.set(d.x, floorY, d.z)
        m.rotation.y = d.ang
        g.add(m)
    }
    return g
}

const w0 = (d) => d.w * 0.9

export function buildMesas(color = 0x4e222c, floorY = FLOOR_DUSK) {
    const g = new THREE.Group()
    const rock = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 })
    for (const d of mesaDefs()) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(w0(d), d.w, d.h, 6), rock)
        m.position.set(d.x, d.h / 2 + floorY + 0.1, d.z)
        m.rotation.y = d.ang
        g.add(m)
    }
    return g
}

// #1002: the mesas cast nothing — at a low dusk sun they should drag long
// soft shadows across the sand. One baked gradient quad per mesa is the
// honest cheap version: dark at the mesa, fading to nothing, oriented on the
// same world shadow line the kart halos hold (SUN_SHADOW.az), and capped so
// no shadow tip ever crosses into the track corridor (#542 law).
export const MESA_SHADOW = {
    az: 0.92,     // must equal SUN_SHADOW.az — one shadow line for the whole world
    lenK: 2.6,    // shadow length per unit of mesa height (the low sun)
    wK: 1.15,     // the penumbra widens the base
    margin: 8,    // the far end stays this far past the outermost track point
    minL: 3,      // shorter than this it cannot read — no quad
    y: 0.02,      // just above the floor, under the mesa footing
    opacity: 0.5,
}
export function buildMesaShadows(floorY = FLOOR_DUSK, mat) {
    const g = new THREE.Group()
    g.name = 'mesaShadows'
    const { cx, cz, R } = worldAnchor()
    const dx = Math.sin(MESA_SHADOW.az)
    const dz = Math.cos(MESA_SHADOW.az)
    const theta = Math.atan2(-dz, dx)
    const m = mat || new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: MESA_SHADOW.opacity, depthWrite: false })
    for (const d of mesaDefs()) {
        const r = Math.hypot(d.x - cx, d.z - cz)
        const L = Math.min(MESA_SHADOW.lenK * d.h, r - (R + MESA_SHADOW.margin))
        if (L < MESA_SHADOW.minL) continue
        const W = MESA_SHADOW.wK * d.w
        const geo = new THREE.PlaneGeometry(L, W)
        geo.rotateX(-Math.PI / 2)
        const q = new THREE.Mesh(geo, m)
        q.rotation.y = theta
        q.position.set(d.x + dx * (L / 2), floorY + MESA_SHADOW.y, d.z + dz * (L / 2))
        g.add(q)
    }
    return g
}

// #542 corridor audit (Node-safe): nothing that is not the track itself may
// stand where the camera or a kart can reach. Mesas must clear the furthest
// track point by their footprint plus a camera margin; cacti/spires must clear
// the centerline past the kart's own reach (it rides ±2.2u, the eye swings
// wider) so tall scenery never passes within arm's length of the lens.
export function cameraCorridorAudit() {
    const REACH = 3.5
    const violations = []
    const clearToTrack = (ux, uz, footprint) => {
        let best = Infinity
        for (let i = 0; i < T.N; i += 3) {
            const p = T.pts[i]
            const d = Math.hypot(p.x * S - ux, p.y * S - uz)
            if (d < best) best = d
        }
        return best - footprint
    }
    for (const d of mesaDefs()) {
        const clr = clearToTrack(d.x, d.z, d.w)
        if (clr < REACH) violations.push({ kind: 'mesa', x: +d.x.toFixed(1), z: +d.z.toFixed(1), clearance: +clr.toFixed(1) })
    }
    for (const d of hillDefs()) {
        const clr = clearToTrack(d.x, d.z, d.w)
        if (clr < REACH) violations.push({ kind: 'hill', x: +d.x.toFixed(1), z: +d.z.toFixed(1), clearance: +clr.toFixed(1) })
    }
    for (const sc of SCENERY) {
        const fp = sc.kind === 'spire' ? 0.8 : 0.4
        const clr = clearToTrack(sc.x * S, sc.y * S, fp)
        if (clr < REACH) violations.push({ kind: sc.kind, x: +(sc.x * S).toFixed(1), z: +(sc.y * S).toFixed(1), clearance: +clr.toFixed(1) })
    }
    return { violations, reach: REACH, sceneryCount: SCENERY.length, mesaCount: mesaDefs().length }
}
