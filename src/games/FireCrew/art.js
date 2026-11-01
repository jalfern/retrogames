// FIRE CREW — every pixel generated at runtime (#1254). Night palette: deep
// indigo street, amber fire, timber browns, reflective-chartreuse trim. The
// darkness pass is the game's signature: the interior is smoke-black and only
// the crew's lights (hose cone, rescue lamp, flares) and the fire itself punch
// through — the same lightAt() laws the sim uses to decide who can SEE what.
import { W, H, T, LOFT_Y1, LADDER_X, HYDRANT, AMBULANCE, ENGINE, STREET, WALL, OUT, FUEL, EMPTY, lightAt } from './sim.js'

export const VW = W * T
export const VH = H * T

const hash = (x, y, s = 0) => {
    let h = Math.imul(x * 374761393 + y * 668265263 + s * 2246822519, 0x01000193) >>> 0
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

// --- static base layer (prerendered once per run) ---------------------------

export function makeBackdrop() {
    const el = document.createElement('canvas')
    el.width = VW; el.height = VH
    const g = el.getContext('2d')
    // night sky/lot
    g.fillStyle = '#0c1024'
    g.fillRect(0, 0, VW, VH)
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
        const t = y * W + x
        const px = x * T; const py = y * T
        const n = hash(x, y)
        const tile = BACK[t]
        if (tile === STREET) {
            g.fillStyle = n < 0.5 ? '#232733' : '#262b38'
            g.fillRect(px, py, T, T)
            if (hash(x, y, 7) < 0.12) { g.fillStyle = '#2e3341'; g.fillRect(px + (n * 10) | 0, py + (hash(x, y, 8) * 10) | 0, 2, 1) }
            if (y === 19 && x % 4 < 2) { g.fillStyle = '#4a4f2a'; g.fillRect(px + 2, py + 7, 8, 2) } // lane dashes
            g.fillStyle = '#171a24'
            if (y === 16) g.fillRect(px, py, T, 2) // curb
        } else if (tile === EMPTY) {
            g.fillStyle = n < 0.5 ? '#3d2b1c' : '#42301f' // warehouse planks
            g.fillRect(px, py, T, T)
            g.fillStyle = '#332417'
            g.fillRect(px, py + 7, T, 1)
            g.fillRect(px + ((x + y) % 2 ? 5 : 11), py, 1, 7)
        } else if (tile === WALL || tile === OUT) {
            g.fillStyle = y <= LOFT_Y1 && x > 0 && x < W - 1 ? '#4a3320' : '#543a24' // loft decking / timber
            g.fillRect(px, py, T, T)
            g.fillStyle = '#3a2716'
            g.fillRect(px, py + T - 2, T, 2)
            g.fillRect(px + T - 1, py, 1, T)
            if (hash(x, y, 3) < 0.3) { g.fillStyle = '#66492c'; g.fillRect(px + 2, py + 3, T - 4, 3) } // knot board
        } else if (tile === FUEL) {
            g.fillStyle = n < 0.5 ? '#3d2b1c' : '#42301f'
            g.fillRect(px, py, T, T)
            g.fillStyle = '#6b4a26' // crate
            g.fillRect(px + 2, py + 2, T - 4, T - 4)
            g.fillStyle = '#523a1e'
            g.fillRect(px + 2, py + 7, T - 4, 2)
            g.fillStyle = '#805a30'
            g.fillRect(px + 3, py + 3, 2, 2)
        }
    }
    // roof edge + door frame
    g.fillStyle = '#241708'
    g.fillRect(0, LOFT_Y1 * T + T * 0, VW, 0)
    g.fillStyle = '#1a1008'
    g.fillRect(14 * T, 15 * T, 2 * T, T)
    g.fillStyle = '#0d0805'
    g.fillRect(14 * T + 2, 15 * T + 2, 2 * T - 4, T - 2)
    return el
}
let BACK = null // grid snapshot for the backdrop builder
export function drawBackdrop(ctx, g) {
    BACK = g.tile
    ctx.drawImage(makeBackdrop(), 0, 0)
}

// --- actors ------------------------------------------------------------------

function helmet(ctx, px, py, face) {
    ctx.fillStyle = '#f4d03f'
    ctx.fillRect(px + 3, py + 1, 10, 4)
    ctx.fillRect(px + 1, py + 3, 14, 2)
    ctx.fillStyle = '#d4ac0d'
    ctx.fillRect(px + (face === 2 ? 1 : face === 0 ? 11 : 6), py + 1, 3, 2)
}

export function drawCrew(ctx, f, t) {
    const px = f.x * T; const py = f.y * T
    const stepF = f.moving ? Math.floor(f.moving / 6) % 2 : 0
    if (f.downT > 0) {
        if (Math.floor(t / 8) % 2) {
            ctx.strokeStyle = '#ff5040'
            ctx.beginPath(); ctx.moveTo(px + 4, py + 4); ctx.lineTo(px + 12, py + 12)
            ctx.moveTo(px + 12, py + 4); ctx.lineTo(px + 4, py + 12); ctx.stroke()
        }
        ctx.fillStyle = '#7a1d1d'
        ctx.fillRect(px + 3, py + 8, 10, 5)
        return
    }
    if (f.hurtT > 0 && Math.floor(t / 3) % 2) ctx.globalAlpha = 0.4
    // coat
    ctx.fillStyle = f.seat === 1 ? '#1d3a8f' : f.seat === 2 ? '#7a2f10' : '#20262e'
    ctx.fillRect(px + 3, py + 5, 10, 8)
    // reflective trim
    ctx.fillStyle = '#c8ff32'
    ctx.fillRect(px + 3, py + 8 + stepF, 10, 1)
    // legs shuffle
    ctx.fillStyle = '#141a22'
    ctx.fillRect(px + 4 + stepF * 2, py + 13, 3, 3)
    ctx.fillRect(px + 9 - stepF * 2, py + 13, 3, 3)
    helmet(ctx, px, py, f.face)
    // facing tool
    const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][f.face]
    ctx.fillStyle = f.seat === 1 ? '#39d7ff' : f.seat === 2 ? '#ffd24a' : '#aab4c2'
    ctx.fillRect(px + 8 + d[0] * 7 - 1, py + 8 + d[1] * 7 - 1, 3, 3)
    if (f.carrying) {
        ctx.fillStyle = '#e8d9c8'
        ctx.fillRect(px + 4, py - 5, 8, 5)
        ctx.fillStyle = '#c98'
        ctx.fillRect(px + 5, py - 4, 2, 2)
    }
    ctx.globalAlpha = 1
}

export function drawVictim(ctx, v, _t) {
    if (v.state === 'rescued' || v.state === 'lost' || v.state === 'carried' || v.state === 'hidden') return
    const px = v.x * T; const py = v.y * T
    const wave = Math.floor(v.wave / 10) % 2
    ctx.fillStyle = '#e8dcc8'
    ctx.fillRect(px + 4, py + 4, 8, 9)
    ctx.fillStyle = '#b8ac98'
    ctx.fillRect(px + 5, py + 2, 6, 4) // head, hair
    ctx.fillStyle = '#ffe66b' // waving arm
    ctx.fillRect(wave ? px + 11 : px + 2, wave ? py - 1 : py + 1, 3, 5)
}

// --- fire, water, smoke --------------------------------------------------------

export function drawFire(ctx, g, t) {
    for (let i = 0; i < W * H; i++) {
        const c = g.cell[i]
        if (!c) continue
        if (c.gone) {
            const px = (i % W) * T; const py = ((i / W) | 0) * T
            ctx.fillStyle = '#05040a'
            ctx.fillRect(px + 1, py + 1, T - 2, T - 2)
            ctx.fillStyle = '#1c1208'
            for (let k = 0; k < 4; k++) if (hash(px, py + k) < 0.6) ctx.fillRect(px + (hash(px + k, py) * 12) | 0, py + (hash(px, py - k) * 12) | 0, 3, 2)
            continue
        }
        if (!c.burning && c.heat < 20) continue
        const x = i % W; const y = (i / W) | 0
        const px = x * T; const py = y * T
        if (c.heat > 0 && !c.burning) { ctx.fillStyle = `rgba(20,8,4,${Math.min(0.7, c.heat / 100)})`; ctx.fillRect(px, py, T, T) }
        if (!c.burning) continue
        const f = Math.floor(t / 7 + hash(x, y, 5) * 3) % 3
        ctx.fillStyle = '#c8371a'
        ctx.fillRect(px + 1 + (f === 1 ? 1 : 0), py + 3, T - 2, T - 4)
        ctx.fillStyle = '#ff7a1a'
        ctx.fillRect(px + 2 + (f === 2 ? -1 : 1), py + 4 - f, T - 6, T - 7)
        ctx.fillStyle = '#ffd24a'
        ctx.fillRect(px + 5 + (f === 0 ? 1 : 0), py + 6 - (f === 2 ? 1 : 0), T - 10, T - 11)
        if (hash(x, y, Math.floor(t / 12)) < 0.14) {
            ctx.fillStyle = '#ffab40'
            ctx.fillRect(px + (hash(x + 1, y, t | 0) * 12) | 0, py - 3 - (hash(x, y + 1, t | 0) * 4) | 0, 2, 2) // ember
        }
    }
}

export function drawFx(ctx, g, t) {
    for (const d of g.drops) {
        ctx.fillStyle = t % 2 ? '#7fd8ff' : '#39a8e0'
        ctx.fillRect(d.x * T + 4 + (hash(d.x, d.y, t) * 8 | 0), d.y * T + 4 + (hash(d.y, d.x, t) * 8 | 0), 3, 3)
    }
    for (const fl of g.flares) {
        const r = 8 * T * (fl.t > 200 ? (220 - fl.t) / 20 : 1)
        const grd = ctx.createRadialGradient(fl.x * T + 8, fl.y * T + 8, 4, fl.x * T + 8, fl.y * T + 8, Math.max(8, r))
        grd.addColorStop(0, 'rgba(255,240,180,0.55)')
        grd.addColorStop(1, 'rgba(255,240,180,0)')
        ctx.fillStyle = grd
        ctx.beginPath(); ctx.arc(fl.x * T + 8, fl.y * T + 8, Math.max(8, r), 0, 7); ctx.fill()
    }
}

// --- smoke: the wind, drawn (#1411) -------------------------------------------
// Tile haze from the sim's advected field, jittered per frame so the plume
// reads as moving even between drift ticks. Sits under the darkness pass so
// lights still punch through it; fire glow (drawn last) bleeds over both.

export function drawSmoke(ctx, g) {
    const t = (g.tick >> 2) & 1023
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < W; x++) {
            const s = g.smoke[y * W + x]
            if (s <= 0.04) continue
            const jx = ((hash(x, y, t) - 0.5) * 6) | 0
            const jy = ((hash(y, x, t ^ 0x5a) - 0.5) * 6) | 0
            ctx.globalAlpha = Math.min(0.5, s * 0.48)
            ctx.fillStyle = s > 0.55 ? '#8f8883' : '#6e6a66'
            ctx.fillRect(x * T + jx, y * T + jy, T, T)
        }
    }
    ctx.globalAlpha = 1
}

// --- darkness: the information split, drawn ------------------------------------

export function drawDarkness(ctx, g) {
    ctx.fillStyle = '#000'
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < W; x++) {
            const l = lightAt(g, x, y, 0)
            if (l >= 0.999) continue
            ctx.globalAlpha = Math.min(0.92, (1 - l) * 0.92)
            ctx.fillRect(x * T, y * T, T, T)
        }
    }
    ctx.globalAlpha = 1
    // warm glow behind the dark so fires bleed through smoke
    for (let i = 0; i < W * H; i++) {
        const c = g.cell[i]
        if (!c || !c.burning) continue
        const cx = (i % W) * T + 8; const cy = ((i / W) | 0) * T + 8
        const grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, 26)
        grd.addColorStop(0, 'rgba(255,140,40,0.28)')
        grd.addColorStop(1, 'rgba(255,140,40,0)')
        ctx.fillStyle = grd
        ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 7); ctx.fill()
    }
}

// --- props -------------------------------------------------------------------

export function drawProps(ctx, g, t) {
    // engine + ladder
    const ex = ENGINE.x * T; const ey = ENGINE.y * T
    ctx.fillStyle = '#c8202a'
    ctx.fillRect(ex - 2 * T, ey - T, 4 * T, 2.4 * T)
    ctx.fillStyle = '#8f161e'
    ctx.fillRect(ex - 2 * T, ey + 0.4 * T, 4 * T, 0.9 * T)
    ctx.fillStyle = '#9fd8ff'
    ctx.fillRect(ex - 1.9 * T, ey - 0.8 * T, 1.4 * T, 0.8 * T)
    ctx.fillStyle = '#111'
    ctx.fillRect(ex - 1.7 * T, ey + 1.1 * T, 8, 6)
    ctx.fillRect(ex + 0.7 * T, ey + 1.1 * T, 8, 6)
    for (let k = 0; k < 3; k++) if (Math.floor(t / 20 + k) % 3) { ctx.fillStyle = '#ff3b30'; ctx.fillRect(ex - T + k * 8, ey - T - 4, 5, 3) } // beacons
    const lx = LADDER_X * T + 8
    ctx.strokeStyle = '#aab4c2'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(lx, ey - T)
    ctx.lineTo(lx, ey - T - g.ladder * (ey - (LOFT_Y1 + 1) * T))
    ctx.stroke()
    ctx.lineWidth = 1
    if (g.ladder > 0.05) {
        ctx.strokeStyle = '#7e8a99'
        const top = ey - T - g.ladder * (ey - (LOFT_Y1 + 1) * T)
        for (let ry = ey - T - 6; ry > top; ry -= 8) { ctx.beginPath(); ctx.moveTo(lx - 3, ry); ctx.lineTo(lx + 3, ry); ctx.stroke() }
    }
    // hydrant
    ctx.fillStyle = '#e03a2f'
    ctx.fillRect(HYDRANT.x * T + 5, HYDRANT.y * T + 3, 6, 10)
    ctx.fillRect(HYDRANT.x * T + 3, HYDRANT.y * T + 5, 10, 3)
    ctx.fillStyle = '#ffd24a'
    ctx.fillRect(HYDRANT.x * T + 6, HYDRANT.y * T + 1, 4, 3)
    // ambulance
    ctx.fillStyle = '#e8e8ee'
    ctx.fillRect(AMBULANCE.x0 * T, AMBULANCE.y0 * T + 4, (AMBULANCE.x1 - AMBULANCE.x0 + 1) * T, 2 * T - 8)
    ctx.fillStyle = '#e03a2f'
    ctx.fillRect(AMBULANCE.x0 * T + 4, AMBULANCE.y0 * T + 12, 5, 1)
    ctx.fillRect(AMBULANCE.x0 * T + 6, AMBULANCE.y0 * T + 9, 1, 7)
    ctx.fillStyle = Math.floor(t / 16) % 2 ? '#ff3b30' : '#5ab0ff'
    ctx.fillRect(AMBULANCE.x1 * T + 6, AMBULANCE.y0 * T, 8, 4)
}

// --- HUD -----------------------------------------------------------------------

export function drawHud(ctx, g, CLOCK) {
    ctx.fillStyle = 'rgba(4,6,14,0.72)'
    ctx.fillRect(0, 0, VW, 14)
    ctx.fillStyle = '#ffd24a'
    ctx.font = 'bold 9px monospace'
    ctx.fillText(`RESCUED ${g.rescued}/6`, 6, 10)
    const lost = g.lost ? ` LOST ${g.lost}` : ''
    ctx.fillStyle = g.lost ? '#ff6a5a' : '#8b93a7'
    ctx.fillText(lost.trim(), 90, 10)
    const left = Math.max(0, CLOCK - g.tick)
    ctx.fillStyle = left < 600 && Math.floor(g.tick / 20) % 2 ? '#ff3b30' : '#e8ecf5'
    const tl = `${Math.floor(left / 3600)}:${String(Math.floor((left % 3600) / 60)).padStart(2, '0')}`
    ctx.fillText(tl, VW / 2 - 10, 10)
    // wind vane
    const wx = VW - 40
    ctx.fillStyle = '#8b93a7'
    ctx.fillText('WIND', wx - 26, 10)
    if (g.wind.dir === -1) { ctx.fillStyle = '#5c6470'; ctx.fillText('CALM', wx, 10) }
    else {
        const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][g.wind.dir]
        ctx.strokeStyle = g.wind.gust === 2 ? '#ff8a5a' : g.wind.gust === 1 ? '#ffd24a' : '#7fd8ff'
        ctx.lineWidth = g.wind.gust + 1
        ctx.beginPath(); ctx.moveTo(wx + 6 - d[0] * 6, 7 - d[1] * 4); ctx.lineTo(wx + 6 + d[0] * 6, 7 + d[1] * 4); ctx.stroke()
        ctx.lineWidth = 1
    }
    // tank + battery
    ctx.fillStyle = '#20242e'
    ctx.fillRect(6, VH - 10, 60, 6); ctx.fillRect(72, VH - 10, 40, 6)
    ctx.fillStyle = '#39d7ff'
    ctx.fillRect(6, VH - 10, (60 * g.crew[0].tank) / 100, 6)
    ctx.fillStyle = '#c8ff32'
    ctx.fillRect(72, VH - 10, (40 * g.crew[0].battery) / 100, 6)
    ctx.fillStyle = '#0c1024'
    ctx.fillRect(6, VH - 18, 150, 7)
    ctx.fillStyle = '#8fd3ff'
    ctx.font = '8px monospace'
    ctx.fillText('WATER', 8, VH - 12.5)
    ctx.fillStyle = '#b7ff5a'
    ctx.fillText('LIGHT', 74, VH - 12.5)
    if (g.messageT > 0) {
        ctx.font = 'bold 11px monospace'
        const w = ctx.measureText(g.message).width + 14
        ctx.fillStyle = 'rgba(4,6,14,0.8)'
        ctx.fillRect(VW / 2 - w / 2, VH - 46, w, 16)
        ctx.fillStyle = '#ffd24a'
        ctx.fillText(g.message, VW / 2 - w / 2 + 7, VH - 35)
    }
}
