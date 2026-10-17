// COMET DRIFT GP — runtime art. The dusk-canyon palette, the Mode 7 ground
// texture, the sky band and every kart are painted in code; no assets.
//
// The ground is built from the track DATA in track.js: the same annuli the
// sim's surfaceAt() reads (road / kerb / sand / cliff) are painted as
// concentric strokes, widest first, so what you see is exactly what you
// drive. The palette is NAMED — every colour is a role, never a literal at
// the call site — so cometcheck can pin the look ("the road is slate, the
// kerb is canyon orange") in one line.
//
// Node-safe on import: nothing touches `document` until a paint function is
// CALLED, so the harness can grade PALETTE / KART / MINIMAP without a DOM.

import { TRACK, TX, TY, ROAD_R, KERB_R, WALL_R } from './track.js'

export const PALETTE = {
    // the dusk sky, top to horizon
    skyTop:    '#241840',
    skyMid:    '#7a3560',
    skyLow:    '#e87838',
    sun:       '#ffd860',
    sunGlow:   '#ff9838',
    cloud:     '#e8b090',
    // layered mesa silhouettes
    mesaFar:   '#6a3a58',
    mesaNear:  '#45264420',
    mesaSolid: '#452644',
    // the canyon floor beyond the cliff
    sand:      '#d89858',
    sandDark:  '#c88848',
    sandGrain: '#b87838',
    // the cliff face that is the wall
    cliff:     '#5a3028',
    cliffTop:  '#8a5038',
    // the Gulch's raceway: dark slate asphalt
    road:      '#3a3a44',
    roadShade: '#30303a',
    edge:      '#ece4d4',
    center:    '#f0c828',
    // canyon-orange rumble strip
    kerbA:     '#e03820',
    kerbB:     '#f0e8d8',
    // start gate
    startA:    '#ece4d4',
    startB:    '#201820',
    // trackside flora and spires
    cactus:    '#2a6830',
    cactusLt:  '#3c8040',
    spire:     '#7a4838',
    spireDark: '#5f3628',
    // karts' shared structure
    wheel:     '#12121a',
    wheelHub:  '#8a8a94',
    outline:   '#141018',
    suit:      '#e8e4d8',
}

// rear-view kart aspect: WIDER than tall; sprite bank is
// [steer pose][rev frame] — three poses × two rev frames, so "it animates"
// and "it leans" are both one number the harness can pin.
export const KART = { w: 72, h: 50, frames: 3 }

// one row per driver: chassis, helmet, and the suit worn under the wing
export const LIVERY = {
    comet: { chassis: '#28c8e8', helmet: '#f8f8f8', accent: '#f0c828' },
    blaze: { chassis: '#e02818', helmet: '#ff8018', accent: '#f8f8f8' },
    dusty: { chassis: '#d8781c', helmet: '#f0c040', accent: '#201820' },
    nova:  { chassis: '#f0c020', helmet: '#202028', accent: '#e02818' },
    rex:   { chassis: '#28a038', helmet: '#b0f060', accent: '#12121a' },
    zeppa: { chassis: '#9030c8', helmet: '#e080f8', accent: '#f0c828' },
    grizz: { chassis: '#6a7058', helmet: '#282820', accent: '#d8d0b8' },
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

// ---- the Mode 7 ground: one 2048² texture painted once at boot ----
//
// Concentric strokes over the centerline, WIDEST first — each narrower
// stroke paints the middle of the last and leaves its annulus:
//   [WALL_R-7, WALL_R] cliffTop   (the sunlit rim of the canyon wall)
//   [KERB_R,   WALL_R-7] cliff    (the shaded face)
//   [ROAD_R,   KERB_R]   kerbB + kerbA dashes (the rumble strip)
//   [ROAD_R-7, ROAD_R]   edge     (painted fog line, both sides)
//   [0,        ROAD_R-7] road     (slate asphalt, shade at the seams)
//   + a dashed gold centre line so the slate reads as a raceway
export function buildGround() {
    const c = document.createElement('canvas')
    c.width = TX; c.height = TY
    const x = c.getContext('2d')

    x.fillStyle = PALETTE.sand; x.fillRect(0, 0, TX, TY)
    x.fillStyle = PALETTE.sandDark
    for (let gy = 0; gy < TY; gy += 72) for (let gx = ((gy / 72) % 2) * 72; gx < TX; gx += 144) x.fillRect(gx, gy, 72, 72)
    x.fillStyle = PALETTE.sandGrain
    for (let i = 0; i < TX * TY / 850; i++) x.fillRect((i * 173) % TX, (i * 419) % TY, 2, 3)

    const path = new Path2D()
    path.moveTo(TRACK.pts[0].x, TRACK.pts[0].y)
    for (let i = 1; i < TRACK.N; i++) path.lineTo(TRACK.pts[i].x, TRACK.pts[i].y)
    path.closePath()
    x.lineJoin = 'round'; x.lineCap = 'round'

    x.strokeStyle = PALETTE.cliffTop; x.lineWidth = WALL_R * 2; x.stroke(path)
    x.strokeStyle = PALETTE.cliff;    x.lineWidth = WALL_R * 2 - 14; x.stroke(path)
    x.strokeStyle = PALETTE.kerbB;    x.lineWidth = KERB_R * 2; x.stroke(path)
    x.setLineDash([28, 28])
    x.strokeStyle = PALETTE.kerbA;    x.lineWidth = KERB_R * 2; x.stroke(path)
    x.setLineDash([])
    x.strokeStyle = PALETTE.edge;     x.lineWidth = ROAD_R * 2 - 10; x.stroke(path)
    x.strokeStyle = PALETTE.roadShade; x.lineWidth = ROAD_R * 2 - 16; x.stroke(path)
    x.strokeStyle = PALETTE.road;     x.lineWidth = ROAD_R * 2 - 28; x.stroke(path)
    x.setLineDash([46, 38])
    x.strokeStyle = PALETTE.center;   x.lineWidth = 5; x.stroke(path)
    x.setLineDash([])

    // start/finish: a checker band across the mouth of the Gulch
    const s0 = TRACK.pts[0]
    x.save(); x.translate(s0.x, s0.y); x.rotate(s0.a)
    for (let r = 0; r < 3; r++) for (let col = 0; col < 15; col++) {
        x.fillStyle = (r + col) % 2 ? PALETTE.startA : PALETTE.startB
        x.fillRect(-24 + r * 16, -ROAD_R + col * 18.6, 16, 18.6)
    }
    x.restore()
    return x.getImageData(0, 0, TX, TY)
}

// ---- sky: parallax mesa silhouettes + a setting sun, sampled against the
// camera heading in the renderer ----
export function buildSky() {
    const mtn = new Float32Array(512)
    for (let i = 0; i < 512; i++) {
        const t = (i / 512) * Math.PI * 2
        mtn[i] = 22 + 12 * Math.abs(Math.sin(t * 2 + 0.7)) + 9 * Math.abs(Math.sin(t * 5 + 1.9)) + 5 * Math.abs(Math.sin(t * 11 + 0.3))
    }
    const streak = new Uint8Array(40 * 256)
    for (let y = 0; y < 40; y++) for (let xx = 0; xx < 256; xx++) {
        const v = Math.sin(xx * 0.09 + y * 0.05) + Math.sin(xx * 0.05 - y * 0.13 + 2) + Math.sin(xx * 0.023 + y * 0.2 + 1)
        streak[y * 256 + xx] = y >= 4 && y <= 34 && v > 1.05 ? 1 : 0
    }
    return { mtn, streak }
}

// ---- karts: a chunky wedge-tail racer seen from behind — wing, twin
// exhausts, fat rear rubbers, driver's helmet and shoulders above the hoop.
// Three steer poses (nose fender + wheel shift) × two rev frames (the body
// hops, wheels sink, flames pop). ----
function kartSprite(colorKey, steer, rev) {
    const L = LIVERY[colorKey]
    const so = steer * 3
    const bob = rev ? -1 : 0
    const sink = rev ? 1 : 0
    return sprite(`cd-${colorKey}-${steer}-${rev}`, KART.w, KART.h, (g) => {
        // the far (front) wheels peek past the nose, shifted with the steer
        for (const fx of [26 + so * 0.6, 46 - so * 0.6]) {
            g.fillStyle = PALETTE.wheel
            g.beginPath(); g.arc(fx, 24 + bob, 4.5, 0, Math.PI * 2); g.fill()
            g.fillStyle = PALETTE.wheelHub; g.beginPath(); g.arc(fx, 24 + bob, 2, 0, Math.PI * 2); g.fill()
        }
        // the nose wing: a lighter slat across the far end
        g.fillStyle = shade(L.chassis, 1.25)
        roundRect(g, 26 + so * 0.6, 21 + bob, 20, 7, 3); g.fill()
        g.strokeStyle = PALETTE.outline; g.lineWidth = 1.4
        roundRect(g, 26 + so * 0.6, 21 + bob, 20, 7, 3); g.stroke()
        // near wheels: fat, dark, with hubs
        for (const wx of [10, 62]) {
            g.fillStyle = PALETTE.wheel
            roundRect(g, wx - 5, 32 + sink, 10, 14, 3); g.fill()
            g.fillStyle = PALETTE.wheelHub; g.fillRect(wx - 2, 36 + sink, 4, 4)
        }
        // body: a wedge narrowing toward the nose
        g.fillStyle = L.chassis
        g.beginPath()
        g.moveTo(16, 46 + bob); g.lineTo(24 + so, 26 + bob); g.lineTo(48 + so, 26 + bob); g.lineTo(56, 46 + bob)
        g.closePath(); g.fill()
        g.strokeStyle = PALETTE.outline; g.lineWidth = 1.6; g.stroke()
        // the livery stripe runs down the spine
        g.fillStyle = L.accent
        g.beginPath()
        g.moveTo(33 + so * 0.5, 27 + bob); g.lineTo(39 + so * 0.5, 27 + bob); g.lineTo(42, 45 + bob); g.lineTo(30, 45 + bob)
        g.closePath(); g.fill()
        // the roll hoop, then the driver: shoulders in the suit, helmet above
        g.fillStyle = PALETTE.outline; g.fillRect(28 + so * 0.5, 28 + bob, 16, 3)
        g.fillStyle = PALETTE.suit; roundRect(g, 29 + so * 0.5, 31 + bob, 14, 8, 3); g.fill()
        g.fillStyle = L.helmet; g.beginPath(); g.arc(36 + so * 0.5, 30 + bob, 6, 0, Math.PI * 2); g.fill()
        g.strokeStyle = PALETTE.outline; g.lineWidth = 1.2; g.stroke()
        g.fillStyle = PALETTE.outline; g.fillRect(32 + so * 0.5, 29 + bob, 8, 3)
        // twin exhausts at the tail
        g.fillStyle = '#20202a'
        g.fillRect(22, 45 + bob, 6, 4); g.fillRect(44, 45 + bob, 6, 4)
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
