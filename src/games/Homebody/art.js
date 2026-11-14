// HOMEBODY — all look, generated in code (no assets).
//
// The Sims (PC, 2000) seen from above: warm suburban greens, wood floors and
// striped wallpaper, chunky readable furniture, little people with a spinning
// mood gem over their heads, and a blue-bar needs panel on the right. Textures
// (grass grain, plank seams, wallpaper stripes) are baked once into offscreen
// layers at module load — pure drawing, nothing here touches the sim.

import {
    W, H, TILE, COLS, ROWS, LOT_Y, PANEL_X, MAP, relLevel,
    tileX, tileY, CATALOG, DEF, NEEDS, WIN_CONTENT, RED_AT, EXT_ROOM,
    CAT_TABS, tabCards,   // #2222: the catalog's category shelves
    SPEED_MULT,   // #2227: the speed dial
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

export function drawGround(ctx, s) {
    ctx.drawImage(groundCanvas(), 0, 0)
    if (s && s.ext) ctx.drawImage(extCanvas(), 0, 0)
}

// -------------------------------------------------------- spare room bake ----
// The #1806 expansion overlay: the same plank/brick styles the main ground bake
// uses, painted at the EXT_ROOM cells, so the new wing looks native — plus a
// swung-open door in the shared wall at (4,11), two east-wall windows and a
// wallpaper strip along the new north wall. Static geometry, baked once.
let extLayer = null
function extCanvas() {
    if (extLayer) return extLayer
    const cv = document.createElement('canvas')
    cv.width = W; cv.height = H
    const g = cv.getContext('2d')
    const bakeWall = (x, y, r) => {
        g.fillStyle = P.wall; g.fillRect(x, y, TILE, TILE)
        g.fillStyle = P.wallTop; g.fillRect(x, y, TILE, 8)
        g.fillStyle = P.wallLine
        g.fillRect(x, y + 8, TILE, 1)
        g.fillRect(x + (r % 2 ? 8 : 20), y + 8, 1, TILE - 8)
        g.fillRect(x, y + 20, TILE, 1)
    }
    const bakeFloor = (x, y, r) => {
        g.fillStyle = P.floor; g.fillRect(x, y, TILE, TILE)
        g.fillStyle = P.floorSeam
        g.fillRect(x, y, TILE, 1)
        g.fillRect(x + (r % 2 ? 10 : 22), y, 1, TILE)
    }
    for (const [r, c] of EXT_ROOM.walls) bakeWall(tileX(c), tileY(r), r)
    for (const [r, c] of EXT_ROOM.floor) bakeFloor(tileX(c), tileY(r), r)
    // doorway in the shared wall: planked threshold, slab swung into the room
    {
        const [dr, dc] = EXT_ROOM.door
        const x = tileX(dc), y = tileY(dr)
        bakeFloor(x, y, dr)
        g.fillStyle = P.wallLine; g.fillRect(x, y, 1, TILE); g.fillRect(x + TILE - 1, y, 1, TILE)
        g.fillStyle = '#7a4a28'; g.fillRect(x + 22, y + 3, 4, 26)
        g.fillStyle = '#5f3c22'; g.fillRect(x + 22, y + 3, 4, 1); g.fillRect(x + 22, y + 28, 4, 1)
        g.fillStyle = '#ffd24a'; g.fillRect(x + 23, y + 7, 2, 2)
    }
    // windows in the east wall (from EXT_ROOM.windows — the single source the
    // night-lit pass lights up after dusk)
    for (const [r, c] of EXT_ROOM.windows) {
        const x = tileX(c), y = tileY(r)
        bakeWall(x, y, r)
        g.fillStyle = '#5f3c22'; g.fillRect(x + 4, y + 8, 20, 14)
        g.fillStyle = '#a8d4ee'; g.fillRect(x + 6, y + 10, 16, 10)
        g.fillStyle = '#5f3c22'
        g.fillRect(x + 13, y + 10, 2, 10); g.fillRect(x + 6, y + 14, 16, 2)
        g.fillStyle = '#96653f'; g.fillRect(x + 3, y + 22, 22, 2)
        g.fillStyle = 'rgba(255,240,170,0.35)'; g.fillRect(x + 7, y + 11, 5, 2)
    }
    // wallpaper strip along the room's north wall, matching the house's own
    for (const c of [12, 13, 14]) {
        const x = tileX(c)
        g.fillStyle = P.paper; g.fillRect(x, tileY(2) + TILE - 8, TILE, 8)
        g.fillStyle = P.paperStripe
        for (let i = 0; i < 4; i++) g.fillRect(x + 3 + i * 8, tileY(2) + TILE - 8, 2, 8)
    }
    extLayer = cv
    return cv
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
        case 'petkit': {
            // adoption card: drafting paper, a cat silhouette in gold
            ctx.fillStyle = '#2c3e63'; ctx.fillRect(x + 3, y + 6, 26, 22)
            ctx.fillStyle = '#3d5484'
            for (let i = 0; i < 4; i++) ctx.fillRect(x + 3, y + 9 + i * 5, 26, 1)
            ctx.fillStyle = '#ffd24a'
            // ears + head
            ctx.beginPath(); ctx.moveTo(x + 11, y + 10); ctx.lineTo(x + 13, y + 6); ctx.lineTo(x + 15, y + 10); ctx.closePath(); ctx.fill()
            ctx.beginPath(); ctx.moveTo(x + 17, y + 10); ctx.lineTo(x + 19, y + 6); ctx.lineTo(x + 21, y + 10); ctx.closePath(); ctx.fill()
            ctx.beginPath(); ctx.arc(x + 16, y + 14, 5, 0, Math.PI * 2); ctx.fill()
            // body + curled tail
            ctx.beginPath(); ctx.ellipse(x + 16, y + 23, 8, 4, 0, 0, Math.PI * 2); ctx.fill()
            ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 24, y + 22, 3, -Math.PI / 2, Math.PI); ctx.stroke()
            ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1; ctx.strokeRect(x + 3.5, y + 6.5, 25, 21)
            break
        }
        case 'kidkit': {
            // adoption card: drafting paper, a small figure in gold with a star
            ctx.fillStyle = '#2c3e63'; ctx.fillRect(x + 3, y + 6, 26, 22)
            ctx.fillStyle = '#3d5484'
            for (let i = 0; i < 4; i++) ctx.fillRect(x + 3, y + 9 + i * 5, 26, 1)
            ctx.fillStyle = '#ffd24a'
            ctx.beginPath(); ctx.arc(x + 16, y + 11, 3.6, 0, Math.PI * 2); ctx.fill()
            ctx.beginPath(); ctx.moveTo(x + 12, y + 15); ctx.lineTo(x + 20, y + 15); ctx.lineTo(x + 18.5, y + 24); ctx.lineTo(x + 13.5, y + 24); ctx.closePath(); ctx.fill()
            ctx.fillRect(x + 9, y + 16, 2.6, 6); ctx.fillRect(x + 20.4, y + 16, 2.6, 6)
            star(ctx, x + 24, y + 10, 3.2, '#ffd24a')
            ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1; ctx.strokeRect(x + 3.5, y + 6.5, 25, 21)
            break
        }
        case 'roomkit': {
            // blueprint card: brick Cottage with gold roof on drafting paper
            ctx.fillStyle = '#2c3e63'; ctx.fillRect(x + 3, y + 6, 26, 22)
            ctx.fillStyle = '#3d5484'
            for (let i = 0; i < 4; i++) ctx.fillRect(x + 3, y + 9 + i * 5, 26, 1)
            ctx.fillStyle = '#96653f'; ctx.fillRect(x + 8, y + 14, 16, 11)
            ctx.fillStyle = '#c9873f'
            ctx.beginPath(); ctx.moveTo(x + 16, y + 4); ctx.lineTo(x + 4, y + 14); ctx.lineTo(x + 28, y + 14); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#ffd24a'; ctx.fillRect(x + 14, y + 18, 5, 7)
            ctx.fillStyle = '#a8d4ee'; ctx.fillRect(x + 9, y + 16, 4, 4)
            ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1; ctx.strokeRect(x + 3.5, y + 6.5, 25, 21)
            break
        }
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
        case 'paper': {
            // #2238: two sheets tossed on the gravel — cream newsprint, dark
            // masthead, grey text rows, folded twice.
            ctx.fillStyle = '#e2dbc6'; ctx.fillRect(x + 6, y + 11, 22, 5)
            ctx.fillStyle = '#efe9d8'; ctx.fillRect(x + 4, y + 13, 24, 13)
            ctx.fillStyle = '#4a4034'; ctx.fillRect(x + 7, y + 15, 18, 3)
            ctx.fillStyle = '#8d8571'
            ctx.fillRect(x + 7, y + 20, 8, 1); ctx.fillRect(x + 17, y + 20, 8, 1)
            ctx.fillRect(x + 7, y + 22, 6, 1); ctx.fillRect(x + 15, y + 22, 10, 1)
            ctx.fillStyle = '#d9d2bc'; ctx.fillRect(x + 4, y + 18, 24, 1)
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
// #2076: the quarrel and the cold war now stage themselves ON the residents.
// fx 'spat' — a storm puff with a gold bolt rides over the head and the body
// shakes itself away from its partner; fx 'cold' — a lasting sullen lean the
// other way, eyes averted, while the grudge holds. `lean` is the direction to
// recoil (−1 left, +1 right), computed by the caller from the partner's side.
export function drawPerson(ctx, p, t, active, fx = null, lean = 0) {
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
    const leanA = fx === 'spat' ? lean * 0.14 + Math.sin(t * 22 + p.x) * 0.035 : fx === 'cold' ? lean * 0.07 : 0
    if (leanA) { ctx.save(); ctx.translate(x, y + 11); ctx.rotate(leanA); ctx.translate(-x, -(y + 11)) }
    body(ctx, p, t, bob, fx, lean)
    if (leanA) ctx.restore()
    // #2143: Ivy of FRIENDS+ arrives with the market basket — woven pixels,
    // greens and a tomato on top; it swings on the walk, rests when she hangs.
    if (p.gift) {
        const bx = x + 8, fy = y + 4
        const swing = p.path && p.path.length ? Math.sin(p.walkPhase * 2) * 0.12 : 0
        ctx.save(); ctx.translate(bx, fy); ctx.rotate(swing)
        ctx.fillStyle = '#c9995c'
        ctx.fillRect(-5, 0, 10, 6)
        ctx.fillStyle = '#8a6238'
        ctx.fillRect(-5, 0, 10, 1)
        ctx.fillRect(-5, 3, 10, 1)
        ctx.fillRect(-1, 0, 1, 6)
        ctx.fillStyle = '#4fae5f'
        ctx.fillRect(-4, -3, 3, 3); ctx.fillRect(1, -2, 3, 2)
        ctx.fillStyle = '#d1483f'
        ctx.beginPath(); ctx.arc(0.5, -1.5, 1.6, 0, 7); ctx.fill()
        ctx.restore()
    }
    // #2076: the spat tell — a little storm cloud throwing a bolt over this head
    if (fx === 'spat') {
        const cy = y - 34 + Math.sin(t * 3 + p.x) * 1
        ctx.fillStyle = '#66707f'
        ctx.beginPath()
        ctx.arc(x - 4, cy + 0.5, 4.2, 0, 7); ctx.arc(x + 2, cy - 1.5, 3.6, 0, 7); ctx.arc(x + 6, cy + 1, 3, 0, 7)
        ctx.fill()
        ctx.fillStyle = '#3c2a17'
        ctx.fillRect(x - 6, cy + 3.4, 12, 1)
        ctx.fillStyle = '#ffd24a'
        ctx.beginPath()
        ctx.moveTo(x + 2, cy + 4); ctx.lineTo(x - 1, cy + 9); ctx.lineTo(x + 1.5, cy + 9); ctx.lineTo(x - 0.5, cy + 13.5)
        ctx.lineTo(x + 4.5, cy + 7.5); ctx.lineTo(x + 2, cy + 7.5)
        ctx.closePath(); ctx.fill()
    }
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
    // alarm pulse: a need just crossed red — ripple the gem
    if (p.alarmT > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 18)
        ctx.strokeStyle = `rgba(255,90,70,${((0.4 + 0.5 * pulse) * Math.min(1, p.alarmT)).toFixed(3)})`
        ctx.lineWidth = 1.6
        ctx.beginPath(); ctx.arc(gx, gy, 7 + pulse * 2.5, 0, 7); ctx.stroke()
    }
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

function body(ctx, p, t, bob, fx = null, lean = 0) {
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
    ctx.fillStyle = p.name === 'Fern' ? '#2f7d3a' : p.name === 'Mira' ? '#7a4a28' : p.name === 'Ivy' ? '#5d3b63' : '#3c2a17'
    ctx.beginPath(); ctx.arc(x, y - 12.4 + bob, 5.4, Math.PI, 0); ctx.fill()
    // eyes — on a cold war they turn away from the partner (#2076)
    ctx.fillStyle = '#241a10'
    const ex = (p.face >= 0 ? 1.4 : -1.4) + (fx === 'cold' ? lean * 1.1 : 0)
    ctx.fillRect(x - 2 + ex, y - 12 + bob, 1.4, 1.6)
    ctx.fillRect(x + 1 + ex, y - 12 + bob, 1.4, 1.6)
    // #2076: mid-spat the brows knife down toward the partner
    if (fx === 'spat') {
        ctx.fillStyle = '#5a2018'
        ctx.fillRect(x - 3 + ex, y - 14.4 + bob, 3, 1)
        ctx.fillRect(x + 1 + ex, y - 13.8 + bob, 3, 1)
    }
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
// --------------------------------------------------------------- pet (#2197) --
// Miso — a tabby loaf with a life of her own: stripe-backed walk with a
// swaying tail, a sleeping comma with rising Zzz, and pink purr sparks while
// someone coos at her. One sprite for every state; flip by facing.
export function drawPet(ctx, p, t) {
    const x = p.x, y = p.y
    ctx.save(); ctx.translate(x, y); ctx.scale(p.face, 1)
    if (p.asleep) {
        // the loaf: a low mound, ears pricked, tail curling around the front
        ctx.fillStyle = '#d98e4a'
        ctx.beginPath(); ctx.ellipse(0, -5, 11, 6, 0, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(-8, -9, 4.5, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#b56f31'
        ctx.beginPath(); ctx.moveTo(-11, -12); ctx.lineTo(-9.5, -15.5); ctx.lineTo(-8, -12); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(-6, -12.5); ctx.lineTo(-4.5, -15.5); ctx.lineTo(-3, -12); ctx.closePath(); ctx.fill()
        ctx.strokeStyle = '#8a5626'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(9, -4, 3.5, -Math.PI * 0.9, Math.PI * 0.4); ctx.stroke()
        ctx.strokeStyle = '#5b3a1e'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(-10.5, -9); ctx.lineTo(-8, -9); ctx.stroke()   // closed eye
        ctx.fillStyle = '#b56f31'
        ctx.fillRect(-2, -8, 3, 1.5); ctx.fillRect(3, -7, 3, 1.5)                    // stripes
    } else {
        const step = Math.sin(p.walkPhase * 2) * 1.5
        const moving = p.path && p.path.length
        // legs: two-pixel pistons while the path runs
        ctx.fillStyle = '#8a5626'
        const l1 = moving ? Math.round(step) : 0, l2 = moving ? -l1 : 0
        ctx.fillRect(-6, -4, 2, 4 + l1); ctx.fillRect(-1, -4, 2, 4 + l2)
        ctx.fillRect(4, -4, 2, 4 + l2)
        // body + head
        ctx.fillStyle = '#d98e4a'
        ctx.beginPath(); ctx.ellipse(0, -8, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(8, -11, 4, 0, Math.PI * 2); ctx.fill()
        // ears
        ctx.fillStyle = '#b56f31'
        ctx.beginPath(); ctx.moveTo(5.5, -13.5); ctx.lineTo(6.5, -17); ctx.lineTo(8, -13.8); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(9, -13.8); ctx.lineTo(10.5, -17); ctx.lineTo(11.5, -13.5); ctx.closePath(); ctx.fill()
        // tail: a sine wave off the back
        ctx.strokeStyle = '#d98e4a'; ctx.lineWidth = 2
        const sway = Math.sin(t * 3 + p.walkPhase) * 2.5
        ctx.beginPath(); ctx.moveTo(-8, -10); ctx.quadraticCurveTo(-13, -12 + sway, -12, -17 + sway); ctx.stroke()
        // stripes + eye
        ctx.fillStyle = '#b56f31'
        ctx.fillRect(-3, -11, 3, 1.5); ctx.fillRect(1, -11.5, 3, 1.5)
        ctx.fillStyle = '#241305'
        ctx.fillRect(9, -12, 1.5, 1.5)
    }
    ctx.restore()
    if (p.purrT > 0) {
        // pink sparks lifting off the head on the real clock
        const k = p.purrT / 1.4
        ctx.globalAlpha = Math.min(1, p.purrT)
        ctx.fillStyle = '#ff9fc4'
        for (const [px, py] of [[-5, 0], [0, -2], [5, 0]]) ctx.fillRect(x + px - 1, y - 20 - (1 - k) * 8 + py, 2, 2)
        ctx.globalAlpha = 1
    }
    if (p.asleep && Math.floor(t) % 2 === 0) {
        ctx.fillStyle = '#cfe0ff'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
        ctx.fillText('z', x + 8, y - 14 - (t % 1) * 3)
    }
}

// ---------------------------------------------------------------- kid (#2203) --
// Pip — a small person, drawn small on purpose: big head, short quick steps,
// a daypack that bounces. Walking scamper, a curled-up bedtime bundle with
// Zzz, tear-arcs while the cry law has them wailing, and gold sparkle-bounces
// when someone tumbles in to play. Same palette family as the residents.
export function drawKid(ctx, p, t) {
    const x = Math.round(p.x), y = Math.round(p.y)
    // shadow
    ctx.fillStyle = 'rgba(30,20,10,0.20)'
    ctx.beginPath(); ctx.ellipse(x, y + 8, 5.5, 2, 0, 0, 7); ctx.fill()
    if (p.asleep) {
        // the bedtime bundle: curled on the floorboards, pack as a pillow
        ctx.fillStyle = '#8a6238'
        ctx.beginPath(); ctx.ellipse(x - 2, y + 1, 8, 4.4, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#e8a13a'
        ctx.beginPath(); ctx.ellipse(x + 3, y - 1, 6, 4, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#3b6ea8'
        ctx.beginPath(); ctx.ellipse(x - 9, y + 1, 3.4, 2.6, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#e8c29a'
        ctx.beginPath(); ctx.arc(x + 8, y - 3, 4.4, 0, 7); ctx.fill()
        ctx.fillStyle = '#c9995c'
        ctx.beginPath(); ctx.arc(x + 8, y - 4.4, 4.4, Math.PI, 0); ctx.fill()
        ctx.fillStyle = '#241a10'
        ctx.fillRect(x + 9, y - 3.4, 1.8, 1)
        if (Math.floor(t) % 2 === 0) {
            ctx.fillStyle = '#cfe0ff'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
            ctx.fillText('z', x + 12, y - 8 - (t % 1) * 3)
        }
        return
    }
    const moving = p.path && p.path.length
    const bob = moving ? Math.abs(Math.sin(p.walkPhase * 2)) * -1.6 : Math.sin(t * 3 + p.x) * 0.5
    const leg = moving ? Math.sin(p.walkPhase * 2) * 2.6 : 0
    ctx.save(); ctx.translate(x, y); ctx.scale(p.face, 1)
    // legs — quick little pistons
    ctx.fillStyle = '#8a6238'
    ctx.fillRect(-3, 1 + Math.max(0, leg), 2.4, 7 - Math.max(0, leg))
    ctx.fillRect(0.6, 1 + Math.max(0, -leg), 2.4, 7 - Math.max(0, -leg))
    ctx.fillStyle = '#3c2a17'
    ctx.fillRect(-3, 7 + Math.max(0, leg), 2.6, 1.4); ctx.fillRect(0.6, 7 + Math.max(0, -leg), 2.6, 1.4)
    // daypack behind the torso — it bounces on the scamper
    ctx.fillStyle = '#3b6ea8'
    ctx.fillRect(-7, -5 + bob + (moving ? Math.sin(p.walkPhase * 2) * 0.8 : 0), 4, 7)
    ctx.fillStyle = '#2c5aa0'
    ctx.fillRect(-7, -3 + bob, 4, 1.4)
    // torso
    ctx.fillStyle = '#e8a13a'
    ctx.fillRect(-4.4, -6 + bob, 9, 8)
    ctx.fillStyle = 'rgba(0,0,0,0.14)'
    ctx.fillRect(-4.4, 0 + bob, 9, 1.6)
    // arms
    ctx.fillStyle = '#e8a13a'
    ctx.fillRect(-6, -5 + bob - leg * 0.6, 2, 6)
    ctx.fillRect(4, -5 + bob + leg * 0.6, 2, 6)
    ctx.fillStyle = '#e8c29a'
    ctx.fillRect(-6, 0.4 + bob - leg * 0.6, 2, 1.6); ctx.fillRect(4, 0.4 + bob + leg * 0.6, 2, 1.6)
    // big head, flaxen fringe
    ctx.fillStyle = '#e8c29a'
    ctx.beginPath(); ctx.arc(0, -11.4 + bob, 6, 0, 7); ctx.fill()
    ctx.fillStyle = '#c9995c'
    ctx.beginPath(); ctx.arc(0, -12.8 + bob, 6, Math.PI, 0); ctx.fill()
    ctx.fillRect(-6, -13.4 + bob, 12, 2)
    // eyes — wide and bright, or scrunched shut mid-wail
    ctx.fillStyle = '#241a10'
    const crying = p.cryT > 2.6
    if (crying) {
        ctx.fillRect(-3.4, -11.6 + bob, 2.4, 1)
        ctx.fillRect(1, -11.6 + bob, 2.4, 1)
        ctx.beginPath(); ctx.arc(0, -8.6 + bob, 1.6, 0, Math.PI); ctx.fill()
    } else {
        const ex = 1.2
        ctx.fillRect(-2.6 + ex, -11.8 + bob, 1.6, 1.8)
        ctx.fillRect(1 + ex, -11.8 + bob, 1.6, 1.8)
    }
    ctx.restore()
    // tears — two blue arcs while the wail lasts
    if (crying) {
        const k = (p.cryT - 2.6) / 0.6
        ctx.globalAlpha = Math.max(0, Math.min(1, k))
        ctx.fillStyle = '#7fb6e8'
        const drop = ((t * 14) % 6)
        ctx.beginPath(); ctx.arc(x - 4, y - 10 + drop, 1.2, 0, 7); ctx.fill()
        ctx.beginPath(); ctx.arc(x + 4.4, y - 10 + ((drop + 3) % 6), 1.2, 0, 7); ctx.fill()
        ctx.globalAlpha = 1
    }
    // giggle sparkles — gold stars bouncing off the head after play
    if (p.giggleT > 0) {
        const k = p.giggleT / 1.4
        ctx.globalAlpha = Math.min(1, p.giggleT)
        for (const [px, ph] of [[-6, 0], [0, 0.5], [6, 0.2]]) star(ctx, x + px, y - 20 - (1 - k) * 9 + ph * 2, 2, '#ffd24a')
        ctx.globalAlpha = 1
    }
}

export function nightTint(ctx, hour, ext) {
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
        // #1814: the wing glows too once it stands — warm panes over the
        // baked sky-blue glass, same mullions, selling "someone moved in"
        if (ext) {
            for (const [wr, wc] of EXT_ROOM.windows) {
                const x = tileX(wc), y = tileY(wr)
                ctx.fillStyle = `rgba(255,224,138,${(a * 0.9).toFixed(3)})`
                ctx.fillRect(x + 6, y + 10, 16, 10)
                ctx.fillStyle = `rgba(120,86,34,${(a * 0.5).toFixed(3)})`
                ctx.fillRect(x + 13, y + 10, 2, 10); ctx.fillRect(x + 6, y + 14, 16, 2)
            }
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
            ctx.fillStyle = P.barBg; ctx.fillRect(PANEL_X + 26, y, 64, 7)
            ctx.fillStyle = needColor(p.needs[n]); ctx.fillRect(PANEL_X + 27, y + 1, Math.max(2, 62 * p.needs[n]), 5)
            if (p.needs[n] <= 0.12 && Math.floor(t * 3) % 2 === 0) {
                ctx.strokeStyle = '#ff6a5c'; ctx.lineWidth = 1
                ctx.strokeRect(PANEL_X + 26.5, y - 0.5, 64, 7)
            }
            ctx.fillStyle = p.needs[n] <= RED_AT ? '#ff8a7c' : '#cfe0f2'
            ctx.font = 'bold 7px monospace'; ctx.textAlign = 'right'
            ctx.fillText(String(Math.round(p.needs[n] * 100)), PANEL_X + 100, y - 1)
            ctx.textAlign = 'left'
            y += 10
        }
        y += 8
    }
    // BONDS (#1817): heart = the two residents, leaf = Fern; four pips per
    // bond, filled by level. The FAMILY pip pulses — earned is shown.
    const by = y + 2
    ctx.fillStyle = '#9fb4d8'; ctx.font = 'bold 9px monospace'
    ctx.fillText('BONDS', PANEL_X + 12, by)
    // #2070: a grudge runs the household heart ash-dark — the panel shows the
    // chill until the pair makes up (the spark comes back with the level).
    bondRow(ctx, PANEL_X + 12, by + 12, 'heart', s.grudge ? '#8c3b34' : '#e2574c', relLevel(s.rel.house), 'HOUSE')
    bondRow(ctx, PANEL_X + 12, by + 26, 'leaf', '#4fae5f', relLevel(s.rel.fern), 'FERN')
    // #2143: the third point of the triangle — flower = Ivy, the market neighbour
    bondRow(ctx, PANEL_X + 12, by + 40, 'flower', '#a3579b', relLevel(s.rel.ivy), 'IVY')
    // #2203: the child — a gold star once Pip is home
    if (s.kid) bondRow(ctx, PANEL_X + 12, by + 54, 'star', '#ffd24a', relLevel(s.rel.kid), 'PIP')
    if (relLevel(s.rel.house) === 3 && Math.floor(t * 2.5) % 2 === 0) {
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1
        ctx.strokeRect(PANEL_X + 12 + 3 * 8 + 0.5, by + 12 + 0.5, 5, 5)
    }
    if (relLevel(s.rel.fern) === 3 && Math.floor(t * 2.5) % 2 === 0) {
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1
        ctx.strokeRect(PANEL_X + 12 + 3 * 8 + 0.5, by + 26 + 0.5, 5, 5)
    }
    if (relLevel(s.rel.ivy) === 3 && Math.floor(t * 2.5) % 2 === 0) {   // #2143
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1
        ctx.strokeRect(PANEL_X + 12 + 3 * 8 + 0.5, by + 40 + 0.5, 5, 5)
    }
    // speed dial (#2227): the original's clock control, sitting above the wish
    // meter — four gears, the chosen one gold; the pause pip pulses while the
    // world stands still. DIAL is shared with speedHit() so the tap route can
    // never drift from what's painted, and generous 19×14 cells keep it legal
    // thumbs on a phone (the same lesson the #2222 tab row learned).
    ctx.lineWidth = 1
    ctx.fillStyle = '#9fb4d8'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('SPEED', DIAL.x, DIAL.y - 11)
    for (let i = 0; i < SPEED_MULT.length; i++) {
        const x = DIAL.x + i * (DIAL.cw + DIAL.gap)
        const on = s.speed === i
        ctx.fillStyle = on ? '#2c3c5e' : '#1a2336'
        ctx.fillRect(x, DIAL.y, DIAL.cw, DIAL.ch)
        ctx.strokeStyle = on ? (i === 0 && Math.floor(t * 2.5) % 2 === 0 ? '#8c6a2e' : '#ffd24a') : '#31405e'
        ctx.strokeRect(x + 0.5, DIAL.y + 0.5, DIAL.cw - 1, DIAL.ch - 1)
        ctx.fillStyle = on ? '#ffd24a' : '#7186ad'
        if (i === 0) {
            ctx.fillRect(x + 6, DIAL.y + 3, 2, DIAL.ch - 6)
            ctx.fillRect(x + 11, DIAL.y + 3, 2, DIAL.ch - 6)
        } else {
            const tw = 5 * i - 1
            const ox = x + (DIAL.cw - tw) / 2
            ctx.beginPath()
            for (let k = 0; k < i; k++) {
                const bx = ox + k * 5
                ctx.moveTo(bx, DIAL.y + 3.5)
                ctx.lineTo(bx + 4, DIAL.y + DIAL.ch / 2)
                ctx.lineTo(bx, DIAL.y + DIAL.ch - 3.5)
                ctx.closePath()
            }
            ctx.fill()
        }
    }
    // lifetime wish meter
    ctx.fillStyle = '#9fb4d8'; ctx.font = 'bold 9px monospace'
    ctx.fillText('LIFETIME WISH', PANEL_X + 12, H - 92)
    ctx.fillStyle = P.barBg; ctx.fillRect(PANEL_X + 12, H - 80, 90, 9)
    ctx.fillStyle = '#ffd24a'; ctx.fillRect(PANEL_X + 13, H - 79, 88 * Math.min(1, s.content / WIN_CONTENT), 7)
    ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 8px monospace'
    ctx.fillText(`${Math.floor(s.content)}/${WIN_CONTENT}`, PANEL_X + 62, H - 78)
}

// #2227 — dial geometry shared by draw and hit-test; speedHit -> gear 0..3, -1 off.
export const DIAL = { x: PANEL_X + 12, y: H - 124, cw: 19, ch: 14, gap: 4 }

export function speedHit(px, py) {
    if (px < DIAL.x || px > DIAL.x + SPEED_MULT.length * (DIAL.cw + DIAL.gap) - DIAL.gap) return -1
    if (py < DIAL.y || py > DIAL.y + DIAL.ch) return -1
    const i = Math.floor((px - DIAL.x) / (DIAL.cw + DIAL.gap))
    if (i < 0 || i >= SPEED_MULT.length) return -1
    if (px - DIAL.x - i * (DIAL.cw + DIAL.gap) > DIAL.cw) return -1
    return i
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

// #1817 — bond row: a glyph (heart/leaf), four level pips, target label.
function bondRow(ctx, x, y, glyph, col, lv, label) {
    if (glyph === 'heart') {
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.arc(x + 4, y + 1.5, 2.6, Math.PI, 0)
        ctx.arc(x + 8, y + 1.5, 2.6, Math.PI, 0)
        ctx.lineTo(x + 6, y + 6.5)
        ctx.closePath(); ctx.fill()
    } else if (glyph === 'leaf') {
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.ellipse(x + 6, y + 2, 2.4, 4, -Math.PI / 4, 0, 7)
        ctx.fill()
        ctx.strokeStyle = col; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(x + 7.5, y + 3.5); ctx.lineTo(x + 10, y + 6); ctx.stroke()
    } else if (glyph === 'star') {
        // #2203: Pip's BONDS glyph — a five-point gold star
        star(ctx, x + 5.5, y + 3, 4.4, col)
    } else {
        ctx.fillStyle = col
        for (const [dx, dy] of [[0, -2.3], [2.3, 0], [0, 2.3], [-2.3, 0]]) { ctx.beginPath(); ctx.arc(x + 5 + dx, y + 3 + dy, 1.9, 0, 7); ctx.fill() }
        ctx.fillStyle = '#ffd24a'
        ctx.beginPath(); ctx.arc(x + 5, y + 3, 1.3, 0, 7); ctx.fill()
    }
    for (let i = 0; i < 4; i++) {
        const px = x + 14 + i * 8
        if (i < lv) { ctx.fillStyle = col; ctx.fillRect(px, y + 1, 6, 6) }
        else {
            ctx.fillStyle = P.barBg; ctx.fillRect(px, y + 1, 6, 6)
            ctx.strokeStyle = '#33405e'; ctx.lineWidth = 1
            ctx.strokeRect(px + 0.5, y + 1.5, 5, 5)
        }
    }
    ctx.fillStyle = '#8fa2c8'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'left'
    ctx.fillText(label, x + 50, y + 2)
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
// tray geometry shared by draw + hit-test. #2222: cards are sized to the
// widest shelf (6) — flipping shelves beats the old 35px wall of sixteen.
const TRAY_CW = Math.floor((PANEL_X - 12 - 5 * 4) / 6)
const TAB_H = 13
const CARD_Y = 17     // card row top, below the tab row

export function drawCatalog(ctx, s) {
    const y = H - TRAY_H
    ctx.fillStyle = 'rgba(20,26,40,0.92)'; ctx.fillRect(0, y, PANEL_X, TRAY_H)
    ctx.strokeStyle = P.panelEdge; ctx.strokeRect(0.5, y + 0.5, PANEL_X - 1, TRAY_H - 1)
    // shelf tabs — the original's catalog chrome: four tabs, one open shelf
    const tw = Math.floor((PANEL_X - 12) / CAT_TABS.length)
    CAT_TABS.forEach((t, i) => {
        const x = 6 + i * tw
        const on = s.tab === i
        ctx.fillStyle = on ? '#2c3c5e' : '#1a2336'
        ctx.fillRect(x, y + 2, tw - 4, TAB_H)
        if (on) { ctx.strokeStyle = '#ffd24a'; ctx.strokeRect(x + 0.5, y + 2.5, tw - 5, TAB_H - 1) }
        ctx.fillStyle = on ? '#ffd24a' : '#7186ad'
        ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(t.id, x + (tw - 4) / 2, y + 2 + TAB_H / 2 + 0.5)
    })
    const cards = tabCards(s)
    const cw = TRAY_CW, gap = 4
    cards.forEach((gi, k) => {
        const d = CATALOG[gi]
        const x = 6 + k * (cw + gap)
        const cy = y + CARD_Y
        const afford = s.money >= d.price
        ctx.fillStyle = gi === s.sel ? '#3a4c74' : '#232d44'
        ctx.fillRect(x, cy, cw, TRAY_H - CARD_Y - 4)
        ctx.strokeStyle = gi === s.sel ? '#ffd24a' : afford ? '#41527a' : '#31405e'
        ctx.strokeRect(x + 0.5, cy + 0.5, cw - 1, TRAY_H - CARD_Y - 5)
        ctx.globalAlpha = afford ? 1 : 0.45
        drawItemAt(ctx, d.id, x + cw / 2 - 16, cy + 1, 0)
        ctx.globalAlpha = 1
        ctx.fillStyle = afford ? '#cfe0ff' : '#5f7095'
        ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.fillText(`§${d.price}`, x + cw / 2, cy + TRAY_H - CARD_Y - 16)
        ctx.fillStyle = '#7186ad'; ctx.textAlign = 'left'
        ctx.fillText(String(k + 1), x + 3, cy + 2)   // digit badges — per shelf, every card
    })
    ctx.globalAlpha = 1
}

// tap a shelf tab -> its index, or -1
export function tabHit(px, py) {
    const y = H - TRAY_H
    if (py < y + 2 || py > y + 2 + TAB_H) return -1
    const tw = Math.floor((PANEL_X - 12) / CAT_TABS.length)
    const i = Math.floor((px - 6) / tw)
    return i >= 0 && i < CAT_TABS.length ? i : -1
}

export function catalogHit(px, py, s) {
    if (py < H - TRAY_H + CARD_Y) return -1
    const cards = tabCards(s)
    const cw = TRAY_CW, gap = 4
    const k = Math.floor((px - 6) / (cw + gap))
    if (k >= cards.length) return -1
    if (k < 0 || px - 6 - k * (cw + gap) > cw) return -1
    return cards[k]
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

// -------------------------------------------------------------- say -------
// #2135: the spoken-word bubble — the original showed dialogue over the
// speakers, not just in a log. A cream plate with a tail, wrapped to two
// lines, fading on the real clock. Sits in world space so it rides the jolt.
export function drawSay(ctx, b) {
    const a = Math.min(1, b.life / 0.8)
    ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const lines = []; let cur = ''
    for (const w of b.text.split(' ')) {
        const t = cur ? cur + ' ' + w : w
        if (ctx.measureText(t).width > 150 && cur) { lines.push(cur); cur = w } else cur = t
    }
    if (cur) lines.push(cur)
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16
    const bh = lines.length * 12 + 9
    const x = Math.max(4, Math.min(W - bw - 4, b.x - bw / 2))
    let y = b.y - 34 - bh
    if (y < 6) y = b.y + 24
    ctx.globalAlpha = a
    ctx.fillStyle = 'rgba(248,244,230,0.93)'
    rr(ctx, x, y, bw, bh, 5); ctx.fill()
    const tx = Math.max(x + 8, Math.min(x + bw - 8, b.x))
    ctx.beginPath(); ctx.moveTo(tx - 4, y + bh - 1); ctx.lineTo(tx + 4, y + bh - 1); ctx.lineTo(tx, y + bh + 6); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = `rgba(122,92,44,${(0.8 * a).toFixed(3)})`; ctx.lineWidth = 1
    rr(ctx, x + 0.5, y + 0.5, bw - 1, bh - 1, 5); ctx.stroke()
    ctx.fillStyle = `rgba(60,42,23,${a.toFixed(3)})`
    lines.forEach((l, i) => ctx.fillText(l, x + bw / 2, y + 9 + i * 12 + 1))
    ctx.globalAlpha = 1
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
