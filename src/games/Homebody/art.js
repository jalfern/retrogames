// HOMEBODY — all look, generated in code (no assets).
//
// The Sims (PC, 2000) seen from above: warm suburban greens, wood floors and
// striped wallpaper, chunky readable furniture, little people with a spinning
// mood gem over their heads, and a blue-bar needs panel on the right. Textures
// (grass grain, plank seams, wallpaper stripes) are baked once into offscreen
// layers at module load — pure drawing, nothing here touches the sim.

import {
    W, H, TILE, COLS, ROWS, LOT_Y, PANEL_X, MAP,
    tileX, tileY, CATALOG, DEF, NEEDS, WIN_CONTENT,
} from './sim.js'

const P = {
    grass: '#69a23f', grass2: '#5d9236', grass3: '#77b04a',
    path: '#c9b48a', path2: '#bda87e',
    floor: '#c89a62', floor2: '#bd8d55', floorSeam: '#9a6f3f',
    wall: '#7c5030', wallTop: '#96653f', wallLine: '#5f3c22',
    paper: '#e8d9ae', paperStripe: '#d9c18c',
    ink: '#3c2a17', ink2: '#5d4426',
    barBg: '#2a3448', barBlue: '#3f7fd1', barGreen: '#57b45c', barRed: '#e23b2e', barAmber: '#e8a13a',
    panel: '#1c2436', panelEdge: '#41527a',
    sky: '#a8d4ee',
}

// deterministic texture rng (decoration only)
let _s = 0x5eed80d1
const rnd = () => { _s = (Math.imul(_s, 1664525) + 1013904223) >>> 0; return _s / 4294967296 }

let groundLayer = null
export function groundCanvas() {
    if (groundLayer) return groundLayer
    const cv = document.createElement('canvas')
    cv.width = W; cv.height = H
    const g = cv.getContext('2d')
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const ch = MAP[r][c]
            const x = tileX(c), y = tileY(r)
            if (ch === '.') {
                g.fillStyle = P.grass; g.fillRect(x, y, TILE, TILE)
                for (let i = 0; i < 7; i++) {
                    g.fillStyle = rnd() < 0.5 ? P.grass2 : P.grass3
                    g.fillRect(x + Math.floor(rnd() * TILE), y + Math.floor(rnd() * TILE), 2, 1)
                }
            } else if (ch === 'p') {
                g.fillStyle = P.path; g.fillRect(x, y, TILE, TILE)
                g.fillStyle = P.path2
                for (let i = 0; i < 4; i++) g.fillRect(x + 2 + (i % 2) * 14, y + 4 + Math.floor(i / 2) * 14, 12, 10)
            } else if (ch === 'F' || ch === 'D') {
                g.fillStyle = P.floor; g.fillRect(x, y, TILE, TILE)
                g.fillStyle = P.floorSeam
                g.fillRect(x, y, TILE, 1)
                g.fillRect(x + (r % 2 ? 10 : 22), y, 1, TILE)
                for (let i = 0; i < 3; i++) if (rnd() < 0.5) g.fillRect(x + Math.floor(rnd() * TILE), y + 8 + Math.floor(rnd() * 20), 3, 1)
            } else {
                // wall: brick-ish band with lighter cap
                g.fillStyle = P.wall; g.fillRect(x, y, TILE, TILE)
                g.fillStyle = P.wallTop; g.fillRect(x, y, TILE, 8)
                g.fillStyle = P.wallLine
                g.fillRect(x, y + 8, TILE, 1)
                g.fillRect(x + (r % 2 ? 8 : 20), y + 8, 1, TILE - 8)
                g.fillRect(x, y + 20, TILE, 1)
            }
        }
    }
    // wallpaper strip just inside the house north edge
    for (let c = 2; c <= 10; c++) {
        const x = tileX(c)
        g.fillStyle = P.paper; g.fillRect(x, tileY(1) + TILE - 8, TILE, 8)
        g.fillStyle = P.paperStripe
        for (let i = 0; i < 4; i++) g.fillRect(x + 3 + i * 8, tileY(1) + TILE - 8, 2, 8)
    }
    groundLayer = cv
    return cv
}

export function drawGround(ctx) {
    ctx.drawImage(groundCanvas(), 0, 0)
}

// ---------------------------------------------------------------- gate ------
export function drawGate(ctx, _t) {
    const x = tileX(5), y = tileY(12)
    ctx.fillStyle = '#8a6134'; ctx.fillRect(x + 4, y + 4, 6, 24); ctx.fillRect(x + 22, y + 4, 6, 24)
    ctx.fillStyle = '#a8794a'; ctx.fillRect(x + 4, y + 8, 24, 4); ctx.fillRect(x + 4, y + 18, 24, 4)
    ctx.fillStyle = '#d8c79a'
    ctx.beginPath(); ctx.arc(x + 24, y + 14, 1.6, 0, 7); ctx.fill()
}

// ------------------------------------------------------------ furniture ----
export function drawItemAt(ctx, id, x, y, t) {
    switch (id) {
        case 'bed': {
            ctx.fillStyle = '#7a4a28'; ctx.fillRect(x + 2, y + 2, 28, 28)
            ctx.fillStyle = '#d8e6f0'; ctx.fillRect(x + 5, y + 5, 22, 8)
            ctx.fillStyle = '#4f7fc4'; ctx.fillRect(x + 5, y + 13, 22, 16)
            ctx.fillStyle = '#5d8fd6'; ctx.fillRect(x + 5, y + 13, 22, 3)
            ctx.fillStyle = '#3c5f92'; ctx.fillRect(x + 5, y + 24, 22, 2)
            break
        }
        case 'fridge': {
            ctx.fillStyle = '#e8eef2'; ctx.fillRect(x + 6, y + 3, 20, 26)
            ctx.fillStyle = '#c2cdd6'; ctx.fillRect(x + 6, y + 12, 20, 2)
            ctx.fillStyle = '#8a99a8'; ctx.fillRect(x + 20, y + 6, 2, 5); ctx.fillRect(x + 20, y + 16, 2, 5)
            break
        }
        case 'stove': {
            ctx.fillStyle = '#c9cdd4'; ctx.fillRect(x + 5, y + 5, 22, 22)
            ctx.fillStyle = '#5c626c'
            ctx.beginPath(); ctx.arc(x + 11, y + 11, 3.4, 0, 7); ctx.fill()
            ctx.beginPath(); ctx.arc(x + 21, y + 11, 3.4, 0, 7); ctx.fill()
            ctx.fillStyle = '#8f96a2'; ctx.fillRect(x + 8, y + 19, 16, 6)
            if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = '#ff8a3a'; ctx.fillRect(x + 10, y + 20, 3, 3) }
            break
        }
        case 'toilet': {
            ctx.fillStyle = '#f0f4f7'; ctx.fillRect(x + 9, y + 4, 14, 10)
            ctx.beginPath(); ctx.ellipse(x + 16, y + 20, 8, 8, 0, 0, 7); ctx.fillStyle = '#f0f4f7'; ctx.fill()
            ctx.fillStyle = '#c2cdd6'
            ctx.beginPath(); ctx.ellipse(x + 16, y + 20, 5, 5, 0, 0, 7); ctx.fill()
            break
        }
        case 'tv': {
            ctx.fillStyle = '#4c3a26'; ctx.fillRect(x + 3, y + 6, 26, 20)
            const flick = Math.floor(t * 6) % 3
            ctx.fillStyle = ['#3f6ad1', '#57a0d8', '#7fc6e8'][flick]
            ctx.fillRect(x + 6, y + 9, 20, 12)
            ctx.fillStyle = '#d8ecf8'; ctx.fillRect(x + 8 + flick * 5, y + 11, 4, 3)
            ctx.fillStyle = '#2c2115'; ctx.fillRect(x + 12, y + 26, 8, 3)
            break
        }
        case 'radio': {
            ctx.fillStyle = '#8a5a30'; ctx.fillRect(x + 6, y + 8, 20, 16)
            ctx.fillStyle = '#5f3c22'; ctx.fillRect(x + 9, y + 11, 8, 10)
            for (let i = 0; i < 3; i++) { ctx.fillStyle = '#d8c79a'; ctx.fillRect(x + 19, y + 12 + i * 4, 4, 2) }
            const w = Math.floor(t * 8) % 3
            ctx.fillStyle = '#ffd24a'; ctx.fillRect(x + 19, y + 12 + w * 4, 4, 2)
            break
        }
        case 'phone': {
            ctx.fillStyle = '#d8606a'; ctx.fillRect(x + 9, y + 6, 14, 14)
            ctx.fillStyle = '#b04048'; ctx.fillRect(x + 11, y + 16, 10, 4)
            ctx.strokeStyle = '#5f3c22'; ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(x + 16, y + 20); ctx.quadraticCurveTo(x + 22, y + 24, x + 20, y + 28); ctx.stroke()
            break
        }
        case 'shower': {
            ctx.fillStyle = '#cfe3ee'; ctx.fillRect(x + 4, y + 4, 24, 24)
            ctx.fillStyle = '#a8c8dc'; ctx.fillRect(x + 4, y + 4, 24, 3)
            ctx.fillStyle = '#7fb2cc'
            for (let i = 0; i < 4; i++) ctx.fillRect(x + 7 + i * 5, y + 9, 2, 6 + (i % 2) * 3)
            break
        }
        case 'sofa': {
            ctx.fillStyle = '#8c4f6f'; ctx.fillRect(x + 3, y + 4, 26, 24)
            ctx.fillStyle = '#a8628a'; ctx.fillRect(x + 6, y + 8, 20, 14)
            ctx.fillStyle = '#7a3f5e'; ctx.fillRect(x + 3, y + 4, 26, 5)
            ctx.fillStyle = '#c47aa6'; ctx.fillRect(x + 8, y + 11, 6, 8); ctx.fillRect(x + 18, y + 11, 6, 8)
            break
        }
        case 'plant': {
            ctx.fillStyle = '#a05c36'; ctx.fillRect(x + 11, y + 19, 10, 9)
            ctx.fillStyle = '#3f7d38'
            for (let i = 0; i < 5; i++) {
                const a = -1.57 + (i - 2) * 0.5 + Math.sin(t * 1.2 + i) * 0.04
                ctx.beginPath()
                ctx.ellipse(x + 16 + Math.cos(a) * 7, y + 14 + Math.sin(a) * 7, 5, 2.6, a, 0, 7)
                ctx.fill()
            }
            ctx.fillStyle = '#57a04a'
            ctx.beginPath(); ctx.arc(x + 16, y + 12, 4, 0, 7); ctx.fill()
            break
        }
        case 'rug': {
            ctx.fillStyle = '#7d4f8c'
            ctx.beginPath(); ctx.ellipse(x + 16, y + 16, 13, 10, 0, 0, 7); ctx.fill()
            ctx.fillStyle = '#9a6cab'
            ctx.beginPath(); ctx.ellipse(x + 16, y + 16, 9, 6.6, 0, 0, 7); ctx.fill()
            ctx.fillStyle = '#c49ad4'
            ctx.beginPath(); ctx.ellipse(x + 16, y + 16, 4.4, 3, 0, 0, 7); ctx.fill()
            break
        }
        case 'lamp': {
            ctx.fillStyle = '#5d4426'; ctx.fillRect(x + 15, y + 10, 3, 18)
            ctx.fillStyle = '#d8c79a'; ctx.fillRect(x + 10, y + 4, 12, 8)
            ctx.fillStyle = '#ffe9a8'; ctx.fillRect(x + 12, y + 8, 8, 3)
            break
        }
        case 'mail': {
            ctx.fillStyle = '#5d4426'; ctx.fillRect(x + 14, y + 12, 4, 16)
            ctx.fillStyle = '#3f7fd1'; ctx.fillRect(x + 8, y + 4, 16, 11)
            ctx.fillStyle = '#2c5aa0'; ctx.fillRect(x + 8, y + 4, 16, 3)
            ctx.fillStyle = '#e8eef2'; ctx.fillRect(x + 21, y + 7, 2, 4)
            break
        }
        default: break
    }
    // soft ground shadow under solids
    if (!DEF[id]?.decor) {
        ctx.fillStyle = 'rgba(30,20,10,0.18)'
        ctx.beginPath(); ctx.ellipse(x + 16, y + 30, 12, 3, 0, 0, 7); ctx.fill()
    }
}

export function drawItem(ctx, it, t) {
    drawItemAt(ctx, it.id, tileX(it.c), tileY(it.r), t)
}

// --------------------------------------------------------------- people ----
export function drawPerson(ctx, p, t, active) {
    const bob = p.path && p.path.length ? Math.sin(p.walkPhase) * 1.6 : Math.sin(t * 2 + p.x) * 0.6
    const x = Math.round(p.x), y = Math.round(p.y)
    const fainted = p.faintT > 0
    // shadow
    ctx.fillStyle = 'rgba(30,20,10,0.22)'
    ctx.beginPath(); ctx.ellipse(x, y + 11, 7, 2.4, 0, 0, 7); ctx.fill()
    if (fainted) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 2)
        body(ctx, p, t, 0)
        ctx.restore()
        // dizzy stars
        for (let i = 0; i < 3; i++) {
            const a = t * 3 + i * 2.1
            star(ctx, x + Math.cos(a) * 10, y - 10 + Math.sin(a) * 3, 2.4, '#ffd24a')
        }
        return
    }
    body(ctx, p, t, bob)
    // mood gem — a spinning kite above the head (ours, not theirs)
    const m = p.mood > 0.7 ? 2 : p.mood > 0.4 ? 1 : 0
    const col = ['#e23b2e', '#e8a13a', '#4ec24f'][m]
    const gx = x, gy = y - 22 + Math.sin(t * 2.4 + p.y) * 1.4
    const sw = 3.4 + Math.abs(Math.sin(t * 2.2)) * 2.6
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.moveTo(gx, gy - 5.4); ctx.lineTo(gx + sw, gy); ctx.lineTo(gx, gy + 5.4); ctx.lineTo(gx - sw, gy)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillRect(gx - 1, gy - 3, 1.6, 3)
    // working tie peek / interaction ring
    if (p.use) {
        const frac = Math.min(1, p.use.t / (p.use.def.id === 'bed' ? 20 : p.use.dur))
        ctx.strokeStyle = active ? '#ffd24a' : '#ffffff'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(x, y + 14, 9, -1.57, -1.57 + frac * 6.283); ctx.stroke()
        if (p.use.def.id === 'bed') {
            ctx.fillStyle = '#cfe0f2'
            ctx.font = 'bold 9px monospace'
            ctx.fillText('z', x + 8 + (Math.floor(t * 2) % 2) * 2, y - 14 - (Math.floor(t * 2) % 2) * 2)
        }
    }
    if (active) {
        ctx.strokeStyle = 'rgba(255,210,74,0.9)'; ctx.lineWidth = 1.4
        ctx.beginPath(); ctx.ellipse(x, y + 11, 9, 3.4, 0, 0, 7); ctx.stroke()
    }
}

function body(ctx, p, t, bob) {
    const x = Math.round(p.x), y = Math.round(p.y)
    const leg = p.path && p.path.length ? Math.sin(p.walkPhase * 2) * 3 : 0
    // legs
    ctx.fillStyle = '#3c2a17'
    ctx.fillRect(x - 4, y + 2 + Math.max(0, leg), 3, 9 - Math.max(0, leg))
    ctx.fillRect(x + 1, y + 2 + Math.max(0, -leg), 3, 9 - Math.max(0, -leg))
    // torso
    ctx.fillStyle = p.hue
    ctx.fillRect(x - 5, y - 6 + bob, 10, 10)
    ctx.fillStyle = 'rgba(0,0,0,0.15)'
    ctx.fillRect(x - 5, y + 1 + bob, 10, 2)
    // arms
    ctx.fillStyle = p.hue
    ctx.fillRect(x - 7, y - 5 + bob - leg * 0.5, 2, 7)
    ctx.fillRect(x + 5, y - 5 + bob + leg * 0.5, 2, 7)
    // head
    ctx.fillStyle = '#e8c29a'
    ctx.beginPath(); ctx.arc(x, y - 11 + bob, 5.4, 0, 7); ctx.fill()
    // hair
    ctx.fillStyle = p.name === 'Fern' ? '#2f7d3a' : p.name === 'Mira' ? '#7a4a28' : '#3c2a17'
    ctx.beginPath(); ctx.arc(x, y - 12.4 + bob, 5.4, Math.PI, 0); ctx.fill()
    // eyes
    ctx.fillStyle = '#241a10'
    const ex = p.face >= 0 ? 1.4 : -1.4
    ctx.fillRect(x - 2 + ex, y - 12 + bob, 1.4, 1.6)
    ctx.fillRect(x + 1 + ex, y - 12 + bob, 1.4, 1.6)
}

function star(ctx, x, y, r, col) {
    ctx.fillStyle = col
    ctx.beginPath()
    for (let i = 0; i < 5; i++) {
        const a = -1.57 + i * 2.513
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
        ctx.lineTo(x + Math.cos(a + 0.626) * r * 0.45, y + Math.sin(a + 0.626) * r * 0.45)
    }
    ctx.closePath(); ctx.fill()
}

// ----------------------------------------------------------------- night ---
export function nightTint(ctx, hour) {
    let a = 0
    if (hour >= 19) a = Math.min(0.42, (hour - 19) / 3 * 0.42)
    else if (hour < 7) a = hour < 5 ? 0.42 : (7 - hour) / 2 * 0.42
    if (a <= 0) return
    ctx.fillStyle = `rgba(24,32,72,${a.toFixed(3)})`
    ctx.fillRect(0, 0, W, H)
    // lit windows along the south wall by night
    if (a > 0.2) {
        for (const wc of [3, 5, 7, 9]) {
            const x = tileX(wc), y = tileY(8)
            ctx.fillStyle = `rgba(255,224,138,${(a * 0.9).toFixed(3)})`
            ctx.fillRect(x + 6, y + 12, 20, 14)
            ctx.fillStyle = `rgba(120,86,34,${(a * 0.5).toFixed(3)})`
            ctx.fillRect(x + 15, y + 12, 2, 14)
        }
    }
}

// ------------------------------------------------------------------ HUD ----
const NEED_ICON = { hunger: 'fork', energy: 'moon', fun: 'star', social: 'chat', bladder: 'drop' }

function needColor(v) {
    return v > 0.55 ? P.barGreen : v > 0.25 ? P.barAmber : P.barRed
}

export function drawPanel(ctx, s, t) {
    ctx.fillStyle = P.panel; ctx.fillRect(PANEL_X, LOT_Y, W - PANEL_X - 4, H - LOT_Y - 8)
    ctx.strokeStyle = P.panelEdge; ctx.lineWidth = 2
    ctx.strokeRect(PANEL_X + 1, LOT_Y + 1, W - PANEL_X - 6, H - LOT_Y - 10)
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillStyle = '#9fb4d8'; ctx.font = 'bold 10px monospace'
    ctx.fillText('HOUSEHOLD', PANEL_X + 10, LOT_Y + 8)
    let y = LOT_Y + 26
    for (const p of s.people) {
        const isActive = s.people[s.active] === p
        ctx.fillStyle = p.hue
        ctx.beginPath(); ctx.arc(PANEL_X + 16, y + 6, 6, 0, 7); ctx.fill()
        ctx.fillStyle = isActive ? '#ffd24a' : '#8fa2c8'
        ctx.font = 'bold 10px monospace'
        ctx.fillText(p.name.toUpperCase() + (p.working ? ' · AT WORK' : ''), PANEL_X + 28, y + 1)
        y += 16
        for (const n of NEEDS) {
            needIcon(ctx, PANEL_X + 14, y + 4, NEED_ICON[n], needColor(p.needs[n]))
            ctx.fillStyle = P.barBg; ctx.fillRect(PANEL_X + 26, y, 76, 7)
            ctx.fillStyle = needColor(p.needs[n]); ctx.fillRect(PANEL_X + 27, y + 1, Math.max(2, 74 * p.needs[n]), 5)
            if (p.needs[n] <= 0.12 && Math.floor(t * 3) % 2 === 0) {
                ctx.strokeStyle = '#ff6a5c'; ctx.lineWidth = 1
                ctx.strokeRect(PANEL_X + 26.5, y - 0.5, 76, 7)
            }
            y += 10
        }
        y += 8
    }
    // lifetime wish meter
    ctx.fillStyle = '#9fb4d8'; ctx.font = 'bold 9px monospace'
    ctx.fillText('LIFETIME WISH', PANEL_X + 12, H - 92)
    ctx.fillStyle = P.barBg; ctx.fillRect(PANEL_X + 12, H - 80, 90, 9)
    ctx.fillStyle = '#ffd24a'; ctx.fillRect(PANEL_X + 13, H - 79, 88 * Math.min(1, s.content / WIN_CONTENT), 7)
    ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 8px monospace'
    ctx.fillText(`${Math.floor(s.content)}/${WIN_CONTENT}`, PANEL_X + 62, H - 78)
}

function needIcon(ctx, x, y, kind, col) {
    ctx.fillStyle = col
    switch (kind) {
        case 'fork':
            ctx.fillRect(x - 1, y - 4, 1.4, 8)
            ctx.fillRect(x - 4, y - 4, 1.2, 4); ctx.fillRect(x + 2.4, y - 4, 1.2, 4)
            break
        case 'moon':
            ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill()
            ctx.fillStyle = P.barBg; ctx.beginPath(); ctx.arc(x + 2.4, y - 1, 3.4, 0, 7); ctx.fill()
            break
        case 'star': star(ctx, x, y, 4, col); break
        case 'chat':
            ctx.fillRect(x - 4, y - 4, 8, 6)
            ctx.beginPath(); ctx.moveTo(x - 2, y + 2); ctx.lineTo(x - 2, y + 5); ctx.lineTo(x + 1, y + 2); ctx.closePath(); ctx.fill()
            break
        case 'drop':
            ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.quadraticCurveTo(x + 4.6, y + 1, x, y + 4.6); ctx.quadraticCurveTo(x - 4.6, y + 1, x, y - 5); ctx.fill()
            break
        default: break
    }
}

export function drawTopBar(ctx, s) {
    ctx.fillStyle = 'rgba(18,24,38,0.88)'
    ctx.fillRect(0, 0, W, LOT_Y - 4)
    ctx.fillStyle = '#ffd24a'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('HOMEBODY', 10, 18)
    const hh = Math.floor(s.hour) % 24
    const mm = Math.floor((s.hour % 1) * 60)
    ctx.fillStyle = '#dfe8f5'; ctx.font = 'bold 13px monospace'
    ctx.fillText(`DAY ${s.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 180, 18)
    ctx.fillStyle = '#7fe08a'
    ctx.fillText(`§${s.money}`, 340, 18)
    ctx.fillStyle = s.build ? '#ffd24a' : '#8fa2c8'
    ctx.font = 'bold 11px monospace'
    ctx.fillText(s.build ? 'BUY MODE — tap floor to place · B to leave' : 'B / ⚒ : BUY MODE', 420, 18)
}

// -------------------------------------------------------------- catalog ----
export const TRAY_H = 56
export function drawCatalog(ctx, s) {
    const y = H - TRAY_H
    ctx.fillStyle = 'rgba(20,26,40,0.92)'; ctx.fillRect(0, y, PANEL_X, TRAY_H)
    ctx.strokeStyle = P.panelEdge; ctx.strokeRect(0.5, y + 0.5, PANEL_X - 1, TRAY_H - 1)
    const cw = 44, gap = 4
    CATALOG.forEach((d, i) => {
        const x = 6 + i * (cw + gap)
        const afford = s.money >= d.price
        ctx.fillStyle = i === s.sel ? '#3a4c74' : '#232d44'
        ctx.fillRect(x, y + 4, cw, TRAY_H - 8)
        ctx.strokeStyle = i === s.sel ? '#ffd24a' : afford ? '#41527a' : '#31405e'
        ctx.strokeRect(x + 0.5, y + 4.5, cw - 1, TRAY_H - 9)
        ctx.globalAlpha = afford ? 1 : 0.45
        drawItemAt(ctx, d.id, x + cw / 2 - 16, y + 2, 0)
        ctx.globalAlpha = 1
        ctx.fillStyle = afford ? '#cfe0ff' : '#5f7095'
        ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.fillText(`§${d.price}`, x + cw / 2, y + TRAY_H - 14)
        if (i < 9) { ctx.fillStyle = '#7186ad'; ctx.fillText(String(i + 1), x + 4, y + 6) }
    })
    ctx.globalAlpha = 1
}

export function catalogHit(px, py) {
    if (py < H - TRAY_H) return -1
    const cw = 44, gap = 4
    const i = Math.floor((px - 6) / (cw + gap))
    if (i < 0 || i >= CATALOG.length) return -1
    if (px - 6 - i * (cw + gap) > cw) return -1
    return i
}

// -------------------------------------------------------------- cursor ----
export function drawBuildCursor(ctx, s, ok) {
    const x = tileX(s.cursor.c), y = tileY(s.cursor.r)
    ctx.strokeStyle = ok ? '#7fe08a' : '#ff6a5c'
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2)
    if (ok) {
        ctx.globalAlpha = 0.55
        drawItemAt(ctx, CATALOG[s.sel].id, x, y, 0)
        ctx.globalAlpha = 1
    }
}

// -------------------------------------------------------------- thoughts ---
export function drawThoughts(ctx, s) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    let y = LOT_Y + 8
    for (const th of s.thoughts) {
        const a = Math.min(1, th.t / 2)
        ctx.font = '10px monospace'
        const w = ctx.measureText(th.text).width + 14
        ctx.fillStyle = `rgba(248,244,230,${(0.88 * a).toFixed(3)})`
        rr(ctx, 12, y, Math.min(w, PANEL_X - 24), 15, 4); ctx.fill()
        ctx.fillStyle = `rgba(60,42,23,${a.toFixed(3)})`
        ctx.fillText(th.text, 19, y + 3)
        y += 19
    }
}
function rr(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

// --------------------------------------------------------------- atmo -----
export function drawClouds(ctx, t) {
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    for (let i = 0; i < 3; i++) {
        const cx = ((t * 6 + i * 230) % (W + 120)) - 60
        const cy = 70 + i * 120
        ctx.beginPath(); ctx.ellipse(cx, cy, 34, 12, 0, 0, 7); ctx.fill()
        ctx.beginPath(); ctx.ellipse(cx + 22, cy + 4, 22, 9, 0, 0, 7); ctx.fill()
    }
}
