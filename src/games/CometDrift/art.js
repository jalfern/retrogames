// COMET DRIFT GP — runtime art, v2 (#435 polish): SUNSET GULCH as a CANYON,
// not a racetrack. Layered sedimentary strata on the walls, a worn sandstone
// rim instead of painted kerbs, worn wheel grooves in the asphalt, flat-topped
// mesas on the dusk horizon, and exposed-wheel dune buggies instead of winged
// karts. Every colour is a NAMED role (never a literal at the call site) so
// cometcheck can pin the look in one line. No assets; all synthesized.
//
// Node-safe on import: nothing touches `document` until a paint function is
// CALLED, so the harness can grade PALETTE / MESA_* / KART / LIVERY without
// a DOM.

import { TRACK, TX, TY, ROAD_R, KERB_R, WALL_R } from './track.js'

export const PALETTE = {
    // the dusk sky, top to horizon: plum to ember
    skyTop:    '#1d1230',
    skyMid:    '#7c2f4a',
    skyLow:    '#ff7a30',
    sun:       '#ffe070',
    sunGlow:   '#ff8c30',
    glint:     '#f2b890',
    // flat-topped mesas: far band hazier and higher-pitched, near dark plum
    mesaFar:   '#6b3b52',
    mesaNear:  '#331b32',
    // the canyon wall, foot (road-side shadow) to lit rim, in strata
    rockShadow:'#40201a',
    rockDark:  '#5a2a20',
    rockMid:   '#7c3e2c',
    rockLight: '#a45838',
    rimLit:    '#d09050',
    crack:     '#33160f',
    // the sand apron between asphalt and cliff: lit near the road, shaded at
    // the wall foot, with grain and scattered pebbles
    apron:     '#d8a068',
    apronMid:  '#c08850',
    apronShade:'#9a6438',
    grain:     '#b87c44',
    pebble:    '#805632',
    // the Gulch's worn toll-road: plum-slate asphalt, darker wheel grooves,
    // a crumbled sandstone edge where the asphalt meets the sand
    road:      '#3a3244',
    roadPatch: '#322a3c',
    groove:    '#241e2c',
    sandEdge:  '#c8a878',
    // start line: bone over charcoal, set into the asphalt
    bone:      '#ece0cc',
    coal:      '#241c20',
    // trackside flora and hoodoos
    cactus:    '#2a6830',
    cactusLt:  '#3c8040',
    hoodoo:    '#96604a',
    hoodooCap: '#6a4030',
    // buggies' shared structure
    wheel:     '#141016',
    wheelLug:  '#9a929c',
    outline:   '#100c12',
    cage:      '#2c2430',
    engine:    '#585060',
    suit:      '#e8dcc4',
}

// rear-view buggy aspect: WIDER than tall; sprite bank is
// [steer pose][rev frame] — three poses × two rev frames.
export const KART = { w: 76, h: 54, frames: 3 }

// one row per driver: chassis, helmet, and the accent stripe on the nose plate
export const LIVERY = {
    comet: { chassis: '#28c8e8', helmet: '#f8f8f8', accent: '#f0c828' },
    blaze: { chassis: '#e02818', helmet: '#ff8018', accent: '#f8f8f8' },
    dusty: { chassis: '#d8781c', helmet: '#f0c040', accent: '#201820' },
    nova:  { chassis: '#f0c020', helmet: '#202028', accent: '#e02818' },
    rex:   { chassis: '#28a038', helmet: '#b0f060', accent: '#12121a' },
    zeppa: { chassis: '#9030c8', helmet: '#e080f8', accent: '#f0c828' },
    grizz: { chassis: '#6a7058', helmet: '#282820', accent: '#d8d0b8' },
}

// ---- mesa horizons as PURE profiles (harness-gradable, DOM-free) ----
// A mesa skyline is square waves, not jagged sines: long flat tops separated
// by sharp cliff drops. Each returned band is 512 samples around the full
// circle; `runs` reports the longest flat-top run so the harness can demand
// plateaus (a sine ridge would never have one).
function mesaBand(base, waves) {
    const a = new Float32Array(512)
    for (let i = 0; i < 512; i++) {
        let h = base
        for (const [len, ph, amp, duty] of waves) h += (((i + ph) % len) < len * duty ? amp : 0)
        a[i] = h
    }
    return a
}
export const MESA_FAR = mesaBand(30, [[97, 11, 14, 0.44], [173, 5, 16, 0.38], [61, 29, 8, 0.5]])
export const MESA_NEAR = mesaBand(10, [[131, 47, 12, 0.4], [211, 19, 9, 0.5], [83, 61, 6, 0.42]])
export function longestFlatRun(a) {
    let best = 1; let run = 1
    for (let i = 1; i < a.length; i++) {
        if (a[i] === a[i - 1]) { run++; if (run > best) best = run } else run = 1
    }
    return best
}

const SPR = new Map()
function sprite(key, w, h, draw) {
    if (SPR.has(key)) return SPR.get(key)
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = false
    draw(g, w, h)
    SPR.set(key, c)
    return c
}

function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16)
    const r = Math.min(255, Math.round(((n >> 16) & 255) * k))
    const g = Math.min(255, Math.round(((n >> 8) & 255) * k))
    const b = Math.min(255, Math.round((n & 255) * k))
    return `rgb(${r},${g},${b})`
}

function roundRect(g, x, y, w, h, r) {
    g.beginPath()
    g.moveTo(x + r, y)
    g.arcTo(x + w, y, x + w, y + h, r)
    g.arcTo(x + w, y + h, x, y + h, r)
    g.arcTo(x, y + h, x, y, r)
    g.arcTo(x, y, x + w, y, r)
    g.closePath()
}

// offset polyline at signed lateral distance from the centerline, as Path2D
function offsetPath(lat) {
    const p = new Path2D()
    for (let i = 0; i < TRACK.N; i++) {
        const q = TRACK.pts[i]
        const x = q.x + Math.cos(q.a + Math.PI / 2) * lat
        const y = q.y + Math.sin(q.a + Math.PI / 2) * lat
        if (i === 0) p.moveTo(x, y); else p.lineTo(x, y)
    }
    p.closePath()
    return p
}

// ---- the Mode 7 ground: one 2048² texture painted once at boot ----
//
// Concentric strokes over the centerline, WIDEST first — each narrower stroke
// paints the middle of the last and leaves its annulus, so the wall reads as
// stacked strata climbing away from the road:
//   [WALL_R-4,  WALL_R]      rimLit      (sun catching the canyon rim)
//   [WALL_R-14, WALL_R-4]    rockLight
//   [KERB_R+22, WALL_R-14]   rockMid
//   [KERB_R+8,  KERB_R+22]   rockDark
//   [ROAD_R+16, KERB_R+8]    rockShadow  (the wall's cast shade on the sand)
//   [ROAD_R+2,  ROAD_R+16]   apron bands (sand, shade grading toward wall)
//   [ROAD_R,    ROAD_R+2]    sandEdge    (crumbled sandstone eating the edge)
//   [0,         ROAD_R]      road        + grooves, patches, sealed cracks
// Dashed strokes at the strata boundaries lay vertical cracks across the
// bands. There is NO painted kerb and NO centre dash anywhere — this is a
// canyon toll-road, not a circuit.
export function buildGround() {
    const c = document.createElement('canvas')
    c.width = TX; c.height = TY
    const x = c.getContext('2d')

    // desert floor: dune patchwork + grain + pebbles
    x.fillStyle = PALETTE.apron; x.fillRect(0, 0, TX, TY)
    x.fillStyle = PALETTE.apronMid
    for (let gy = 0; gy < TY; gy += 96) for (let gx = ((gy / 96) % 2) * 96; gx < TX; gx += 192) x.fillRect(gx, gy, 96, 96)
    x.fillStyle = PALETTE.grain
    for (let i = 0; i < TX * TY / 620; i++) x.fillRect((i * 173) % TX, (i * 419) % TY, 2, 3)
    x.fillStyle = PALETTE.pebble
    for (let i = 0; i < 520; i++) x.fillRect((i * 307 + 91) % TX, (i * 733 + 57) % TY, 3, 2)

    const path = new Path2D()
    path.moveTo(TRACK.pts[0].x, TRACK.pts[0].y)
    for (let i = 1; i < TRACK.N; i++) path.lineTo(TRACK.pts[i].x, TRACK.pts[i].y)
    path.closePath()
    x.lineJoin = 'round'; x.lineCap = 'round'
    // widest first: each narrower stroke masks the middle of the last and
    // leaves its annulus visible
    const band = (color, outer, dash = null) => {
        if (dash) x.setLineDash(dash); else x.setLineDash([])
        x.strokeStyle = color; x.lineWidth = outer * 2; x.stroke(path)
        x.setLineDash([])
    }

    // strata: foot-shadow out to the lit rim, then the sand apron, then the
    // crumbled sandstone edge nibbling the last pixels of asphalt
    band(PALETTE.rimLit, WALL_R)
    band(PALETTE.rockLight, WALL_R - 4)
    band(PALETTE.rockMid, WALL_R - 14)
    band(PALETTE.rockDark, KERB_R + 22)
    band(PALETTE.rockShadow, KERB_R + 8)
    band(PALETTE.apronShade, ROAD_R + 16)
    band(PALETTE.apronMid, ROAD_R + 12)
    band(PALETTE.apron, ROAD_R + 7)
    // strata cracks: dashed strokes laying vertical fractures across the rock
    band(PALETTE.crack, WALL_R - 4, [4, 26])
    band(PALETTE.crack, KERB_R + 22, [3, 41])
    // asphalt, then the sandstone crumble laid over its outer edge
    band(PALETTE.road, ROAD_R)
    band(PALETTE.sandEdge, ROAD_R + 2, [22, 7])

    // worn racing grooves: twin tracks darker than the fresh asphalt
    x.strokeStyle = PALETTE.groove; x.lineWidth = 13
    x.stroke(offsetPath(-58)); x.stroke(offsetPath(58))

    // patch kit: deterministic darker repairs scattered along the road
    x.fillStyle = PALETTE.roadPatch
    for (let i = 0; i < TRACK.N; i += 9) {
        const q = TRACK.pts[i]
        const lat = ((i * 53) % 180) - 90
        const px = q.x + Math.cos(q.a + Math.PI / 2) * lat
        const py = q.y + Math.sin(q.a + Math.PI / 2) * lat
        x.save(); x.translate(px, py); x.rotate(q.a + (i % 3) * 0.5)
        x.fillRect(-16 - (i % 2) * 10, -8, 32 + (i % 2) * 20, 16)
        x.restore()
    }
    // sealed cracks crossing the road, every ~60 samples
    x.strokeStyle = PALETTE.groove; x.lineWidth = 2
    for (let i = 0; i < TRACK.N; i += 60) {
        const q = TRACK.pts[i]
        const nx = Math.cos(q.a + Math.PI / 2); const ny = Math.sin(q.a + Math.PI / 2)
        x.beginPath()
        x.moveTo(q.x - nx * 110, q.y - ny * 110)
        x.lineTo(q.x + nx * 110, q.y + ny * 110)
        x.stroke()
    }

    // start/finish: a bone-over-charcoal band set into the asphalt
    const s0 = TRACK.pts[0]
    x.save(); x.translate(s0.x, s0.y); x.rotate(s0.a)
    for (let r = 0; r < 3; r++) for (let col = 0; col < 15; col++) {
        x.fillStyle = (r + col) % 2 ? PALETTE.bone : PALETTE.coal
        x.fillRect(-24 + r * 16, -ROAD_R + col * 18.6, 16, 18.6)
    }
    x.restore()
    return x.getImageData(0, 0, TX, TY)
}

// ---- sky: two parallax mesa bands + a setting sun + ember glint, sampled
// against the camera heading in the renderer (profiles are exported pure) ----
export function buildSky() {
    const glint = new Uint8Array(40 * 256)
    for (let y = 0; y < 40; y++) for (let xx = 0; xx < 256; xx++) {
        const v = Math.sin(xx * 0.09 + y * 0.05) + Math.sin(xx * 0.05 - y * 0.13 + 2) + Math.sin(xx * 0.023 + y * 0.2 + 1)
        glint[y * 256 + xx] = y >= 4 && y <= 34 && v > 1.05 ? 1 : 0
    }
    return { far: MESA_FAR, near: MESA_NEAR, glint }
}

// ---- buggies: an exposed-wheel desert racer seen from behind — fat knobby
// rears outside the body, low wide tub, flat nose plate with the livery
// stripe, roll cage hoop over the driver, finned engine block behind the seat,
// twin exhaust bores at the tail. Three steer poses (nose + front wheels
// shift, body leans) × two rev frames (body hops, flames pop). ----
function kartSprite(colorKey, steer, rev) {
    const L = LIVERY[colorKey]
    const so = steer * 3
    const bob = rev ? -1 : 0
    const sink = rev ? 1 : 0
    return sprite(`cd-${colorKey}-${steer}-${rev}`, KART.w, KART.h, (g) => {
        // front knobbies peeking past the nose plate, shifted with the steer
        for (const fx of [27 + so * 0.7, 49 - so * 0.7]) {
            g.fillStyle = PALETTE.wheel
            g.beginPath(); g.arc(fx, 22 + bob, 5.5, 0, Math.PI * 2); g.fill()
            g.fillStyle = PALETTE.wheelLug; g.fillRect(fx - 1, 20 + bob, 2, 2); g.fillRect(fx - 1, 24 + bob, 2, 2)
        }
        // flat nose plate with the livery stripe across it
        g.fillStyle = shade(L.chassis, 1.2)
        roundRect(g, 26 + so * 0.7, 19 + bob, 24, 8, 2); g.fill()
        g.fillStyle = L.accent
        g.fillRect(35 + so * 0.7, 20 + bob, 6, 6)
        g.strokeStyle = PALETTE.outline; g.lineWidth = 1.4
        roundRect(g, 26 + so * 0.7, 19 + bob, 24, 8, 2); g.stroke()
        // fat rear knobbies OUTSIDE the tub, laced with lugs
        for (const wx of [9, 67]) {
            g.fillStyle = PALETTE.wheel
            roundRect(g, wx - 6, 30 + sink, 12, 18, 4); g.fill()
            g.strokeStyle = PALETTE.outline; g.lineWidth = 1.2; g.stroke()
            g.fillStyle = PALETTE.wheelLug
            g.fillRect(wx - 3, 34 + sink, 6, 2); g.fillRect(wx - 3, 40 + sink, 6, 2)
        }
        // the tub: a low wide body with flared shoulders
        g.fillStyle = L.chassis
        g.beginPath()
        g.moveTo(14, 44 + bob); g.lineTo(23 + so, 25 + bob); g.lineTo(53 + so, 25 + bob); g.lineTo(62, 44 + bob)
        g.closePath(); g.fill()
        g.strokeStyle = PALETTE.outline; g.lineWidth = 1.6; g.stroke()
        // finned engine block behind the seat
        g.fillStyle = PALETTE.engine
        g.fillRect(30 + so * 0.5, 40 + bob, 16, 6)
        g.fillStyle = shade(PALETTE.engine, 1.35)
        for (let f = 0; f < 3; f++) g.fillRect(31 + f * 5 + so * 0.5, 41 + bob, 2, 4)
        // roll cage: hoop + crossbar over the driver
        g.strokeStyle = PALETTE.cage; g.lineWidth = 3
        g.beginPath(); g.arc(38 + so * 0.5, 33 + bob, 9, Math.PI, 0); g.stroke()
        g.strokeStyle = PALETTE.outline; g.lineWidth = 1.2
        g.beginPath(); g.arc(38 + so * 0.5, 33 + bob, 10.5, Math.PI, 0); g.stroke()
        // the driver: shoulders in the suit, helmet under the bar
        g.fillStyle = PALETTE.suit; roundRect(g, 31 + so * 0.5, 34 + bob, 14, 8, 3); g.fill()
        g.fillStyle = L.helmet; g.beginPath(); g.arc(38 + so * 0.5, 32 + bob, 6, 0, Math.PI * 2); g.fill()
        g.strokeStyle = PALETTE.outline; g.lineWidth = 1.2; g.stroke()
        g.fillStyle = PALETTE.outline; g.fillRect(34 + so * 0.5, 31 + bob, 8, 3)
        // twin exhaust bores at the tail (flames pop on the rev frame)
        g.fillStyle = '#1c1820'
        g.fillRect(24, 45 + bob, 7, 5); g.fillRect(45, 45 + bob, 7, 5)
        if (rev) {
            g.fillStyle = '#f8a020'
            g.fillRect(25, 50 + bob, 5, 3); g.fillRect(46, 50 + bob, 5, 3)
        }
    })
}

export function buildSprites() {
    const out = {}
    for (const key of Object.keys(LIVERY)) {
        out[key] = []
        for (const steer of [-1, 0, 1]) {
            out[key][steer + 1] = [kartSprite(key, steer, 0), kartSprite(key, steer, 1)]
        }
    }
    return out
}

// the HUD minimap: the centerline folded into a small box, computed once,
// pure — the renderer stamps kart dots onto it live.
export function minimapPath(boxW, boxH) {
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity
    for (const p of TRACK.pts) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
    }
    const sc = Math.min((boxW - 4) / (maxX - minX), (boxH - 4) / (maxY - minY))
    const ox = (boxW - (maxX - minX) * sc) / 2; const oy = (boxH - (maxY - minY) * sc) / 2
    const pts = []
    for (let i = 0; i < TRACK.N; i += 4) {
        pts.push([ox + (TRACK.pts[i].x - minX) * sc, oy + (TRACK.pts[i].y - minY) * sc])
    }
    const project = (x, y) => [ox + (x - minX) * sc, oy + (y - minY) * sc]
    return { pts, project }
}
