// SUPER MARIO KART — runtime art. The SNES palette, the Mode 7 ground
// texture, and every sprite are painted in code; no assets.
//
// The ground is built from the track DATA in track.js (a closed centerline):
// the same annuli the sim's surfaceAt() reads (road / kerb / grass / wall)
// are painted as concentric strokes, so what you see is what you drive. The
// palette is NAMED (SNES below) — the #226 art fix lives in it, and
// scripts/kartcheck.mjs asserts the road is grey, not the old tan.
//
// Node-safe on import: nothing here touches `document` until a paint
// function is CALLED, so the check can import SNES / KART and grade the
// contract without a browser.

import { TRACK, BOOSTS, TX, TY, ROAD_R, KERB_R, WALL_R } from './track.js'

// A named SNES-style palette (~16 scene colours + the kart's structural
// greys). Every color the renderer uses is a role, never a literal, so a
// "make the road grey" change is one line and the harness can pin it.
export const SNES = {
    // asphalt
    road:      '#8a8a92',   // the road — GREY (the whole point of #226)
    roadShade: '#66666e',   // worn edges / wear
    // the continuous red/white rumble kerb
    kerbRed:   '#d82800',
    kerbWhite: '#f8f8f8',
    // track features
    dash:      '#f8d800',   // dash panel
    dashEdge:  '#d85800',   // dash arrows
    startA:    '#f8f8f8',   // start line
    startB:    '#181818',
    // the ground beyond the barrier
    grass:     '#30a028',
    grassDark: '#289020',
    grassGrain:'#248018',
    // the low barrier ring
    barrier:   '#3a3a46',
    barrierTop:'#c8c8d2',
    // trackside trees
    trunk:     '#784818',
    leaf:      '#186810',
    leafLight: '#208018',
    // the kart's own structure
    wheel:     '#141418',
    wheelHub:  '#9a9aa2',
    outline:   '#101018',
}

// The kart's aspect contract: WIDER than tall, two animation frames. The
// player and every CPU use the same sprite bank, so "wider than tall" is one
// number, and the harness pins it.
export const KART = { w: 76, h: 54, frames: 2 }

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
// Concentric strokes, WIDEST first. Each stroke is centred on the centerline,
// so a narrower stroke drawn later paints the centre of the last and leaves
// its outer annulus. The order below is therefore the ring order from the
// outer grass in to the road:
//   [WALL_R-6, WALL_R]  barrierTop   (the low wall's light top rail)
//   [KERB_R,   WALL_R-6] barrier     (the low wall's dark body)
//   [ROAD_R,   KERB_R]  kerbWhite + kerbRed dashes  (the rumble strip)
//   [ROAD_R-4, ROAD_R]  roadShade    (worn edges, both sides)
//   [0,        ROAD_R-4] road        (grey asphalt)
export function buildGround() {
    const c = document.createElement('canvas')
    c.width = TX; c.height = TY
    const x = c.getContext('2d')

    // grass base: checker + grain, the infield and everything beyond the wall
    x.fillStyle = SNES.grass; x.fillRect(0, 0, TX, TY)
    x.fillStyle = SNES.grassDark
    for (let gy = 0; gy < TY; gy += 64) for (let gx = ((gy / 64) % 2) * 64; gx < TX; gx += 128) x.fillRect(gx, gy, 64, 64)
    x.fillStyle = SNES.grassGrain
    for (let i = 0; i < TX * TY / 900; i++) x.fillRect((i * 149) % TX, (i * 383) % TY, 2, 3)

    const T = TRACK
    const path = new Path2D()
    path.moveTo(T.pts[0].x, T.pts[0].y)
    for (let i = 1; i < T.N; i++) path.lineTo(T.pts[i].x, T.pts[i].y)
    path.closePath()
    x.lineJoin = 'round'; x.lineCap = 'round'

    // the low barrier (light top rail, then the dark body inside it)
    x.strokeStyle = SNES.barrierTop; x.lineWidth = WALL_R * 2; x.stroke(path)
    x.strokeStyle = SNES.barrier;    x.lineWidth = WALL_R * 2 - 12; x.stroke(path)
    // the rumble kerb: white base, then red dashes around the same band
    x.strokeStyle = SNES.kerbWhite;  x.lineWidth = KERB_R * 2; x.stroke(path)
    x.setLineDash([30, 30])
    x.strokeStyle = SNES.kerbRed;    x.lineWidth = KERB_R * 2; x.stroke(path)
    x.setLineDash([])
    // the road: worn grey edges, then the flat grey centre
    x.strokeStyle = SNES.roadShade;  x.lineWidth = ROAD_R * 2; x.stroke(path)
    x.strokeStyle = SNES.road;       x.lineWidth = ROAD_R * 2 - 8; x.stroke(path)
    // a thin dashed centre line so the grey reads as a road, not a slab
    x.setLineDash([44, 30])
    x.strokeStyle = SNES.kerbWhite;  x.lineWidth = 5; x.stroke(path)
    x.setLineDash([])

    // dash panels: data-placed by arc length in track.js, painted here
    for (const b of BOOSTS) {
        x.save(); x.translate(b.x, b.y); x.rotate(b.a)
        x.fillStyle = SNES.dash; x.fillRect(-54, -ROAD_R + 16, 108, 2 * ROAD_R - 32)
        x.fillStyle = SNES.dashEdge
        for (let k = 0; k < 3; k++) {
            const cx = -36 + k * 36
            x.beginPath()
            x.moveTo(cx, -60); x.lineTo(cx + 22, 0); x.lineTo(cx, 60); x.lineTo(cx + 8, 60); x.lineTo(cx + 30, 0); x.lineTo(cx + 8, -60)
            x.closePath(); x.fill()
        }
        x.restore()
    }

    // start line: a checker band across the road at the gate
    const s0 = T.pts[0]
    x.save(); x.translate(s0.x, s0.y); x.rotate(s0.a)
    for (let r = 0; r < 3; r++) for (let col = 0; col < 16; col++) {
        x.fillStyle = (r + col) % 2 ? SNES.startA : SNES.startB
        x.fillRect(-24 + r * 16, -ROAD_R + col * 24, 16, 24)
    }
    x.restore()

    // the grandstand: a fixed block on the inside of the start straight
    x.fillStyle = SNES.barrier; x.fillRect(1040, 1060, 260, 130)
    x.fillStyle = SNES.outline; x.fillRect(1040, 1060, 260, 26)
    x.fillStyle = SNES.kerbRed
    for (let i = 0; i < 6; i++) x.fillRect(1052 + i * 42, 1108, 24, 44)
    return x.getImageData(0, 0, TX, TY)
}

// ---- sky: a fixed parallax mask, sampled against the camera heading ----
export function buildSky() {
    const mtn = new Float32Array(512)
    for (let i = 0; i < 512; i++) {
        const t = (i / 512) * Math.PI * 2
        mtn[i] = 26 + 14 * Math.abs(Math.sin(t * 3 + 1)) + 10 * Math.abs(Math.sin(t * 7 + 2)) + 6 * Math.abs(Math.sin(t * 13))
    }
    const cloud = new Uint8Array(60 * 256)
    for (let y = 0; y < 60; y++) for (let xx = 0; xx < 256; xx++) {
        const v = Math.sin(xx * 0.10 + y * 0.04) + Math.sin(xx * 0.047 - y * 0.11 + 2) + Math.sin(xx * 0.021 + y * 0.18)
        cloud[y * 256 + xx] = y >= 6 && y <= 52 && v > 1.0 ? 1 : 0
    }
    return { mtn, cloud }
}

// ---- the kart: wider than tall, round wheels, a helmeted driver, a dark
// outline, and a two-frame running cycle (the rev frame hops the body while
// the wheels sink). col = chassis, helmet = the cap. ----
function kartSprite(col, helmet) {
    const dark = SNES.outline
    const mk = (frame) => {
        const bob = frame ? -2 : 0
        const sink = frame ? 2 : 0
        return sprite(`mkart-${col}-${helmet}-${frame}`, KART.w, KART.h, (g) => {
            // two round wheels, dark with a hub — they sink on the rev frame
            const wy = 41 + sink
            for (const wx of [15, 61]) {
                g.fillStyle = SNES.wheel
                g.beginPath(); g.arc(wx, wy, 11, 0, Math.PI * 2); g.fill()
                g.strokeStyle = dark; g.lineWidth = 2; g.beginPath(); g.arc(wx, wy, 11, 0, Math.PI * 2); g.stroke()
                g.fillStyle = SNES.wheelHub; g.beginPath(); g.arc(wx, wy, 4.5, 0, Math.PI * 2); g.fill()
            }
            // a wide, rounded chassis in the kart colour, dark-outlined
            g.fillStyle = col
            roundRect(g, 20, 24 + bob, 36, 22, 5); g.fill()
            g.strokeStyle = dark; g.lineWidth = 2; roundRect(g, 20, 24 + bob, 36, 22, 5); g.stroke()
            g.fillStyle = shade(col, 0.62); g.fillRect(24, 40 + bob, 28, 5)   // engine / rear
            // the driver: shoulders up to a rounded, dark-outlined helmet
            g.fillStyle = col; roundRect(g, 31, 14 + bob, 14, 12, 4); g.fill()
            g.fillStyle = helmet
            g.beginPath(); g.arc(38, 12 + bob, 9, 0, Math.PI * 2); g.fill()
            g.strokeStyle = dark; g.lineWidth = 2; g.beginPath(); g.arc(38, 12 + bob, 9, 0, Math.PI * 2); g.stroke()
            g.fillStyle = shade(helmet, 0.45); g.fillRect(31, 11 + bob, 14, 3)  // visor band
            g.fillStyle = shade(helmet, 1.5); g.fillRect(33, 5 + bob, 6, 2)      // cap highlight
        })
    }
    return [mk(0), mk(1)]
}

// ---- the full sprite bank ----
export function buildSprites() {
    return {
        mario:  kartSprite('#e02020', '#e02020'),
        daisy:  kartSprite('#f8b800', '#f878b8'),
        yoshi:  kartSprite('#20b020', '#e05028'),
        peach:  kartSprite('#f878b8', '#f8d8f8'),
        bowser: kartSprite('#58a818', '#d89000'),
        banana: sprite('banana', 26, 20, (x) => {
            x.fillStyle = '#f8d800'
            x.beginPath(); x.ellipse(13, 12, 11, 6, -0.4, 0, 7); x.fill()
            x.fillStyle = '#a87800'; x.fillRect(3, 12, 5, 4); x.fillRect(18, 6, 5, 4)
        }),
        shell: sprite('shell', 30, 26, (x) => {
            x.fillStyle = '#20c020'; x.beginPath(); x.ellipse(15, 13, 13, 10, 0, 0, 7); x.fill()
            x.fillStyle = '#a8f8a8'; x.beginPath(); x.ellipse(15, 10, 8, 5, 0, 0, 7); x.fill()
            x.fillStyle = '#186000'; x.fillRect(2, 18, 26, 4)
        }),
        box: sprite('box', 40, 40, (x) => {
            x.fillStyle = '#f8b800'; x.fillRect(2, 2, 36, 36)
            x.fillStyle = '#d87800'; x.fillRect(2, 2, 36, 4); x.fillRect(2, 34, 36, 4); x.fillRect(2, 2, 4, 36); x.fillRect(34, 2, 4, 36)
            x.fillStyle = '#f8f8f8'; x.font = 'bold 26px monospace'; x.fillText('?', 12, 30)
        }),
        mushroom: sprite('mushroom', 30, 26, (x) => {
            x.fillStyle = '#e02020'; x.beginPath(); x.ellipse(15, 12, 13, 10, 0, Math.PI, 0); x.fill()
            x.fillStyle = '#f8e8c8'; x.fillRect(8, 12, 14, 12)
            x.fillStyle = '#f8f8f8'; x.beginPath(); x.arc(8, 7, 3, 0, 7); x.arc(21, 6, 4, 0, 7); x.fill()
        }),
        tree: sprite('tree', 70, 96, (x) => {
            x.fillStyle = SNES.trunk; x.fillRect(30, 58, 10, 38)
            x.fillStyle = SNES.leaf; x.beginPath(); x.arc(35, 40, 26, 0, 7); x.fill()
            x.fillStyle = SNES.leafLight; x.beginPath(); x.arc(27, 32, 16, 0, 7); x.arc(45, 36, 14, 0, 7); x.fill()
        }),
        stand: sprite('stand', 110, 74, (x) => {
            x.fillStyle = '#585868'; x.fillRect(4, 20, 102, 54)
            x.fillStyle = '#303040'; x.fillRect(4, 20, 102, 8)
            for (let r = 0; r < 3; r++) for (let c2 = 0; c2 < 12; c2++) {
                x.fillStyle = ['#e02020', '#2050e0', '#f8d800', '#f8f8f8', '#20a020'][(r * 7 + c2 * 3) % 5]
                x.fillRect(8 + c2 * 8, 32 + r * 14, 5, 8)
            }
            x.fillStyle = SNES.kerbRed; x.fillRect(4, 8, 102, 10)
        }),
        gantry: sprite('gantry', 120, 120, (x) => {
            x.fillStyle = '#e8e8e8'; x.fillRect(6, 10, 12, 110); x.fillRect(102, 10, 12, 110)
            x.fillStyle = SNES.kerbRed; x.fillRect(0, 0, 120, 26)
            x.fillStyle = '#f8f8f8'; x.font = 'bold 11px monospace'; x.fillText('MARIO CIRCUIT', 12, 17)
        }),
    }
}
