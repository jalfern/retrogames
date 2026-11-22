// art.js — DOUBLE DRAGON S1 look, designed from the 1987 Technōs cabinet:
// night suburb, chain-link and hedges, asphalt with grain, chunky pixel
// brawlers. Everything generated in code; no borrowed sprites. The original's
// palette at a glance: sodium-lamp blue-black night, Billy's red headband and
// white gi, Williams' green cap, Amon's brown vest, Abobo's slab of charcoal.

import { W, H, DEEP_TOP, DEEP_BOT, rescueReady, ENEMY_DEF, TIP } from './sim.js'

// ------------------------------------------------------------- pixel font ---
// 5x7, one string per glyph, '#' = ink. Original to this repo (arcade-cabinet
// proportions, cut for 320x224).
const FONT = {
    "0": ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    "1": ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    "2": ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    "3": ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    "4": ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    "5": ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    "6": ['.###.', '#...#', '#....', '####.', '#...#', '#...#', '.###.'],
    "7": ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    "8": ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    "9": ['.###.', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
    "A": ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    "B": ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    "C": ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    "D": ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    "E": ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    "F": ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    "G": ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
    "H": ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    "I": ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    "J": ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    "K": ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    "L": ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    "M": ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    "N": ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    "O": ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    "P": ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    "Q": ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    "R": ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    "S": ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    "T": ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    "U": ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    "V": ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    "W": ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
    "X": ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    "Y": ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    "Z": ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    " ": ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
    "-": ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
    "!": ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
    ".": ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
    "/": ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '.#...'],
    ":": ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
    '\'': ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
}

export function textWidth(s, scale = 1) {
    return s.length * 6 * scale - scale
}

export function text(ctx, s, x, y, color = '#fff', scale = 1) {
    ctx.fillStyle = color
    let cx = x
    for (const ch of s.toUpperCase()) {
        const g = FONT[ch] || FONT['?'] || FONT[' ']
        for (let row = 0; row < 7; row++) {
            const r = g[row]
            for (let col = 0; col < 5; col++) if (r[col] === '#') ctx.fillRect(cx + col * scale, y + row * scale, scale, scale)
        }
        cx += 6 * scale
    }
}

// drop-shadowed arcade label (double draw, no gradients)
export function label(ctx, s, x, y, color, scale = 1, shadow = '#000') {
    if (shadow) text(ctx, s, x + scale, y + scale, shadow, scale)
    text(ctx, s, x, y, color, scale)
}

// ---------------------------------------------------------------- backdrop ---
const R = (n) => { // deterministic 0..1 from integer
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
}

let skyCache = null
function sky(ctx) {
    if (skyCache) { ctx.drawImage(skyCache, 0, 0); return }
    const c = document.createElement('canvas')
    c.width = W; c.height = DEEP_TOP + 6
    const g = c.getContext('2d')
    for (let y = 0; y < c.height; y++) {
        const t = y / c.height
        const r = Math.round(12 + t * 26)
        const gg = Math.round(14 + t * 22)
        const b = Math.round(44 + t * 40)
        g.fillStyle = `rgb(${r},${gg},${b})`
        g.fillRect(0, y, W, 1)
    }
    // stars
    for (let i = 0; i < 46; i++) {
        const sx = Math.floor(R(i) * W)
        const sy = Math.floor(R(i + 90) * 70)
        g.fillStyle = R(i + 7) > 0.7 ? '#fff' : '#9fb3e8'
        g.fillRect(sx, sy, 1, 1)
    }
    // moon
    g.fillStyle = '#e8e3c8'
    g.beginPath(); g.arc(258, 34, 11, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#d6d0b0'
    g.fillRect(252, 28, 3, 3); g.fillRect(261, 38, 2, 2); g.fillRect(256, 40, 2, 2)
    skyCache = c
    ctx.drawImage(c, 0, 0)
}

// far house silhouettes + lit windows, parallax p (0..1 fraction of camX)
function houses(ctx, camX) {
    const off = (camX * 0.3) % 96
    for (let i = -1; i < 5; i++) {
        const bx = Math.round(i * 96 - off)
        const seed = Math.floor(camX * 0.3 / 96) + i
        const hgt = 34 + Math.floor(R(seed * 3) * 22)
        const top = DEEP_TOP - hgt + 4
        ctx.fillStyle = '#141b33'
        ctx.fillRect(bx, top, 62, hgt)
        // roof
        ctx.fillStyle = '#0d1226'
        ctx.fillRect(bx - 3, top - 4, 68, 5)
        // lit windows — deterministic per house
        for (let wI = 0; wI < 6; wI++) {
            if (R(seed * 7 + wI) > 0.48) {
                ctx.fillStyle = R(seed * 11 + wI) > 0.6 ? '#ffd98a' : '#b8933f'
                ctx.fillRect(bx + 6 + (wI % 3) * 18, top + 8 + Math.floor(wI / 3) * 14, 7, 8)
            }
        }
    }
}

function pylons(ctx, camX) {
    const off = (camX * 0.55) % 160
    ctx.fillStyle = '#0b0f1e'
    ctx.strokeStyle = '#0b0f1e'
    for (let i = -1; i < 4; i++) {
        const px = Math.round(i * 160 - off)
        ctx.fillRect(px, 66, 3, DEEP_TOP - 62)
        ctx.fillRect(px - 6, 66, 15, 2)
        // wire sag to next pole
        for (let t = 0; t <= 16; t++) {
            const wx = px + t * 10
            const wy = 68 + Math.round(Math.sin((t / 16) * Math.PI) * 6)
            ctx.fillRect(wx, wy, 10, 1)
        }
    }
}

function fenceHedge(ctx, camX) {
    const off = (camX * 0.8) % 40
    // chain-link fence strip
    for (let i = -1; i < 9; i++) {
        const fx = Math.round(i * 40 - off)
        ctx.fillStyle = '#2c3550'
        ctx.fillRect(fx, DEEP_TOP - 26, 2, 26)
        ctx.fillStyle = '#232b44'
        ctx.fillRect(fx - 20, DEEP_TOP - 24, 2, 24)
    }
    ctx.fillStyle = '#1c2338'
    ctx.fillRect(0, DEEP_TOP - 26, W, 2)
    ctx.fillRect(0, DEEP_TOP - 8, W, 2)
    // hedge blobs along the fence foot
    for (let x = 0; x < W; x += 8) {
        const wx = x + camX * 0.8
        const h = 5 + Math.floor(R(Math.floor(wx / 8)) * 7)
        ctx.fillStyle = R(Math.floor(wx / 8)) > 0.5 ? '#1d3a24' : '#16301d'
        ctx.fillRect(x, DEEP_TOP - h, 8, h + 2)
    }
}

// S3 the hideout (issue #2807): the yard look — corrugated rust wall, high
// transoms, pipes, hanging chain-lamps, oily concrete. Same law as everything
// else here: cut in code at native res, designed from the cabinet.
let wallCache = null
function wall(ctx) {
    if (wallCache) { ctx.drawImage(wallCache, 0, 0); return }
    const c = document.createElement('canvas')
    c.width = W; c.height = DEEP_TOP + 2
    const g = c.getContext('2d')
    for (let y = 0; y < c.height; y++) {
        const t = y / c.height
        g.fillStyle = `rgb(${Math.round(15 + t * 10)},${Math.round(12 + t * 7)},${Math.round(15 + t * 6)})`
        g.fillRect(0, y, W, 1)
    }
    wallCache = c
    ctx.drawImage(c, 0, 0)
}

function corrugation(ctx, camX) {
    const off = Math.round(camX * 0.7)
    for (let x = -8; x < W + 8; x += 6) {
        const wx = x + off
        const ph = ((wx % 6) + 6) % 6
        if (ph < 1) { ctx.fillStyle = '#2b211d'; ctx.fillRect(x, 6, 1, DEEP_TOP - 4) }
        else if (ph >= 3 && ph < 4) { ctx.fillStyle = '#0d0a0e'; ctx.fillRect(x, 6, 1, DEEP_TOP - 4) }
    }
    // sheet joins every 96 world px + rivet rows
    const jx = ((-off % 96) + 96) % 96
    for (let x = jx - 96; x < W + 96; x += 96) {
        ctx.fillStyle = '#0b0809'; ctx.fillRect(x, 6, 2, DEEP_TOP - 4)
        ctx.fillStyle = '#392d24'
        for (const ry of [14, 60, 106]) { ctx.fillRect(x - 3, ry, 2, 2); ctx.fillRect(x + 3, ry, 2, 2) }
    }
}

function transoms(ctx, camX, tick) {
    const off = Math.round((camX * 0.7) % 92)
    for (let i = -1; i < 5; i++) {
        const bx = i * 92 - off
        const seed = Math.floor(camX * 0.7 / 92) + i
        ctx.fillStyle = '#18171b'
        ctx.fillRect(bx, 12, 34, 20)
        ctx.fillStyle = '#241d16'
        ctx.fillRect(bx - 2, 10, 38, 3)
        // mullions
        ctx.fillStyle = '#2e2820'
        ctx.fillRect(bx + 10, 12, 2, 20); ctx.fillRect(bx + 22, 12, 2, 20)
        if (R(seed * 7) > 0.55) {                    // some glass wears sodium light
            const flick = R(seed * 3) > 0.8 && tick % 90 < 12
            ctx.fillStyle = flick ? '#3d2f16' : '#54401d'
            ctx.fillRect(bx + 2, 14, 7, 16); ctx.fillRect(bx + 13, 14, 8, 16)
            ctx.fillStyle = 'rgba(255,217,138,0.25)'
            ctx.fillRect(bx + 2, 14, 7, 5); ctx.fillRect(bx + 13, 14, 8, 5)
        }
        // grime streaks under the glass
        ctx.fillStyle = 'rgba(8,6,10,0.55)'
        ctx.fillRect(bx + 4 + Math.floor(R(seed) * 8), 32, 2, 8 + Math.floor(R(seed + 5) * 10))
    }
}

function pipes(ctx, camX) {
    const off = Math.round((camX * 0.7) % 118)
    ctx.fillStyle = '#37302a'
    ctx.fillRect(0, 44, W, 3)
    ctx.fillStyle = '#241f1a'
    ctx.fillRect(0, 47, W, 1)
    for (let i = -1; i < 4; i++) {
        const px = i * 118 - off
        ctx.fillStyle = '#453b30'
        ctx.fillRect(px, 42, 4, 7)                    // flanges
        ctx.fillStyle = '#3d342a'
        ctx.fillRect(px + 46, 47, 3, 10)             // short drop
        ctx.fillStyle = '#59493a'
        ctx.fillRect(px + 44, 57, 7, 2)
        // valve wheel
        ctx.fillStyle = '#6b2f28'
        ctx.fillRect(px + 84, 50, 8, 2)
        ctx.fillRect(px + 87, 47, 2, 8)
    }
}

function graffiti(ctx, camX) {
    const tags = [{ x: 150, s: 'DD' }, { x: 640, s: '87' }, { x: 430, s: 'DD' }]
    for (const t of tags) {
        const sx = t.x - camX
        if (sx > -24 && sx < W + 24) {
            ctx.save()
            ctx.globalAlpha = 0.8
            text(ctx, t.s, sx, 84, '#6b2b22', 1)
            ctx.restore()
        }
    }
}

function hangingLamps(ctx, camX, tick) {
    const off = Math.round((camX * 0.85) % 176)
    for (let i = -1; i < 3; i++) {
        const lx = i * 176 - off + 60
        const seed = Math.floor(camX * 0.85 / 176) + i
        const sway = lampSwayAt(seed, tick)
        // chain
        ctx.fillStyle = '#2c2620'
        for (let s = 0; s < 46; s += 3) ctx.fillRect(lx + Math.round(sway * (s / 46)), s, 1, 2)
        // shade + bulb
        const bx = lx + sway
        ctx.fillStyle = '#3f3527'
        ctx.fillRect(bx - 7, 46, 14, 4)
        ctx.fillRect(bx - 5, 50, 10, 2)
        ctx.fillStyle = '#ffd98a'
        ctx.fillRect(bx - 2, 52, 4, 3)
    }
}

function yardFloor(ctx, camX) {
    for (let y = DEEP_TOP; y < H; y++) {
        const t = (y - DEEP_TOP) / (H - DEEP_TOP)
        ctx.fillStyle = `rgb(${Math.round(48 + t * 16)},${Math.round(42 + t * 13)},${Math.round(36 + t * 11)})`
        ctx.fillRect(0, y, W, 1)
    }
    // skirt where wall meets floor + hazard stripes
    ctx.fillStyle = '#171310'
    ctx.fillRect(0, DEEP_TOP - 4, W, 4)
    const so = Math.round(camX % 16)
    for (let x = -16; x < W + 16; x += 16) {
        const wx = x + so
        if (((wx % 32) + 32) % 32 < 16) { ctx.fillStyle = '#8a6a1e'; ctx.fillRect(x, DEEP_TOP - 4, 8, 3) }
    }
    // concrete pours
    const jo = Math.round(camX % 64)
    ctx.fillStyle = '#221c18'
    for (let x = -64; x < W + 64; x += 64) ctx.fillRect(x - jo, DEEP_TOP + 2, 1, H - DEEP_TOP - 2)
    ctx.fillRect(0, 174, W, 1)
    // oil + swarf
    for (let i = 0; i < 4; i++) {
        const wx = 150 * i + 70
        const sx = wx - camX
        if (sx > -46 && sx < W + 46) {
            ctx.fillStyle = 'rgba(8,8,12,0.55)'
            ctx.beginPath(); ctx.ellipse(sx, DEEP_BOT - 2 - (i % 2) * 18, 20 + (i % 3) * 6, 4 + (i % 2) * 2, 0, 0, Math.PI * 2); ctx.fill()
        }
    }
    for (let gy = DEEP_TOP + 6; gy < H; gy += 5) {
        for (let gx = 0; gx < W; gx += 5) {
            const wx = Math.floor((gx + camX) / 5)
            if (R(wx * 71 + gy * 13) > 0.9) { ctx.fillStyle = '#39312a'; ctx.fillRect(gx, gy, 2, 1) }
        }
    }
}

// #2877 — swarf: the concrete between the pours lives. Bolt heads, swarf
// curls and flat steel chips scatter around the yard's four oil seeps,
// world-anchored so they scroll as one skin with the pours. Spots are built
// once from the deterministic hash — the floor never shimmers frame to frame.
export const SWARF_SPOTS = []
for (let i = 0; i < 4; i++) {
    for (let c = 0; c < 7; c++) {
        SWARF_SPOTS.push({
            wx: 150 * i + 70 + Math.round((R(i * 91 + c * 17) - 0.5) * 52),
            wy: DEEP_TOP + 8 + Math.round(R(i * 53 + c * 29) * (H - DEEP_TOP - 14)),
            kind: R(i * 7 + c * 3) > 0.66 ? 2 : R(i * 11 + c * 5) > 0.5 ? 1 : 0,
        })
    }
}
SWARF_SPOTS.forEach(Object.freeze)
Object.freeze(SWARF_SPOTS)

function swarf(ctx, camX) {
    for (const s of SWARF_SPOTS) {
        const sx = s.wx - camX
        if (sx < -4 || sx > W + 4) continue
        if (s.kind === 2) {                            // bolt head: dark with a glint
            ctx.fillStyle = '#4b5058'; ctx.fillRect(sx, s.wy, 2, 2)
            ctx.fillStyle = '#9aa2ac'; ctx.fillRect(sx, s.wy, 1, 1)
        } else if (s.kind === 1) {                     // swarf curl: three stepped slivers
            ctx.fillStyle = '#6d737c'
            ctx.fillRect(sx, s.wy, 2, 1); ctx.fillRect(sx + 1, s.wy + 1, 2, 1); ctx.fillRect(sx + 2, s.wy + 2, 1, 1)
        } else {                                       // flat steel chip
            ctx.fillStyle = '#828a94'; ctx.fillRect(sx, s.wy, 3, 1)
        }
    }
}

// #2877 — the leaking drum: set-dressing on a beat. A speck gathers at the
// weep stain, falls eight pixels, and the wet spot at the drum's foot pulses
// on the splash. Pure render-side cycle — nothing enters the sim.
export const DRIP_T = 72
export function dripPhase(tick) {
    const ph = ((tick % DRIP_T) + DRIP_T) % DRIP_T
    return { ph, fall: ph < 40 ? Math.round(ph * 0.2) : -1, splash: ph >= 40 && ph < 48 }
}

function drawWarehouse(ctx, camX, tick) {
    wall(ctx)
    corrugation(ctx, camX)
    transoms(ctx, camX, tick)
    pipes(ctx, camX)
    graffiti(ctx, camX)
    hangingLamps(ctx, camX, tick)
    yardFloor(ctx, camX)
    swarf(ctx, camX)
    // warm pools under the lamps, brighter than the street's sodium haze —
    // #2877: the pool rides its lamp. A swinging shade over a frozen pool is
    // wallpaper; light sliding across the concrete is a yard.
    const off = Math.round((camX * 0.85) % 176)
    for (let i = -1; i < 3; i++) {
        const lx = i * 176 - off + 60
        const seed = Math.floor(camX * 0.85 / 176) + i
        const px = lx + lampSwayAt(seed, tick)
        const g = ctx.createRadialGradient(px, DEEP_TOP + 16, 2, px, DEEP_TOP + 16, 60)
        g.addColorStop(0, 'rgba(255,196,110,0.14)')
        g.addColorStop(0.7, 'rgba(255,196,110,0.05)')
        g.addColorStop(1, 'rgba(255,196,110,0)')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(px, DEEP_TOP + 16, 60, 0, Math.PI * 2); ctx.fill()
    }
}

export function drawBackground(ctx, camX, _tick, stage = 1) {
    if (stage === 2) { drawWarehouse(ctx, camX, _tick); return }
    sky(ctx)
    houses(ctx, camX)
    pylons(ctx, camX)
    fenceHedge(ctx, camX)
    // sidewalk + curb
    ctx.fillStyle = '#3a3f52'
    ctx.fillRect(0, DEEP_TOP - 6, W, 6)
    ctx.fillStyle = '#2a2e3f'
    ctx.fillRect(0, DEEP_TOP, W, 2)
    // asphalt band with grain + tar seams
    for (let y = DEEP_TOP + 2; y < H; y++) {
        const t = (y - DEEP_TOP) / (H - DEEP_TOP)
        ctx.fillStyle = `rgb(${Math.round(38 + t * 14)},${Math.round(40 + t * 14)},${Math.round(50 + t * 14)})`
        ctx.fillRect(0, y, W, 1)
    }
    for (let gy = DEEP_TOP + 4; gy < H; gy += 3) {
        for (let gx = 0; gx < W; gx += 4) {
            const wx = Math.floor((gx + camX) / 4)
            if (R(wx * 131 + gy * 17) > 0.82) {
                ctx.fillStyle = R(wx + gy) > 0.5 ? '#333746' : '#262a38'
                ctx.fillRect(gx, gy, 2, 1)
            }
        }
    }
    // oil stain patches
    for (let i = 0; i < 3; i++) {
        const wx = 180 * i + 90
        const sx = wx - camX
        if (sx > -40 && sx < W + 40) {
            ctx.fillStyle = 'rgba(10,12,20,0.5)'
            ctx.beginPath(); ctx.ellipse(sx, DEEP_BOT - 4, 22, 5, 0, 0, Math.PI * 2); ctx.fill()
        }
    }
    // sodium lamp glow pools (world-anchored)
    for (let i = 0; i < 6; i++) {
        const lx = i * 190 + 60 - camX
        if (lx > -80 && lx < W + 80) {
            const g = ctx.createRadialGradient(lx, DEEP_TOP + 20, 4, lx, DEEP_TOP + 20, 70)
            g.addColorStop(0, 'rgba(255,190,90,0.16)')
            g.addColorStop(1, 'rgba(255,190,90,0)')
            ctx.fillStyle = g
            ctx.fillRect(lx - 70, DEEP_TOP - 20, 140, 120)
        }
    }
}

// foreground props drawn after entities whose feet are nearer than them
export const PROPS = [
    { x: 210, y: DEEP_BOT + 6, kind: 'bin' },
    { x: 520, y: DEEP_BOT + 8, kind: 'hydrant' },
    { x: 810, y: DEEP_BOT + 6, kind: 'bin' },
]

export function drawProp(ctx, p, camX, tick = 0) {
    const sx = Math.round(p.x - camX)
    if (sx < -30 || sx > W + 30) return
    if (p.kind === 'bin') {
        ctx.fillStyle = '#31404e'
        ctx.fillRect(sx - 7, p.y - 16, 14, 16)
        ctx.fillStyle = '#243240'
        ctx.fillRect(sx - 8, p.y - 18, 16, 3)
        ctx.fillStyle = '#1a242f'
        ctx.fillRect(sx - 5, p.y - 12, 10, 2)
    } else if (p.kind === 'drum') {
        // #2877: the yard's drums sit IN the lamp light — a grounded shadow
        // that leans with the cast, and on one of them the weep stain finally
        // weeps: a speck falls on a beat, the wet spot pulses at the foot.
        drawShadow(ctx, sx + castPx(p.x), p.y + 1, 15, 0.32)
        ctx.fillStyle = '#4e3a22'                    // rusted oil drum
        ctx.fillRect(sx - 7, p.y - 18, 14, 18)
        ctx.fillStyle = '#66502e'
        ctx.fillRect(sx - 7, p.y - 18, 4, 18)
        ctx.fillStyle = '#2c2012'
        ctx.fillRect(sx - 8, p.y - 16, 16, 2); ctx.fillRect(sx - 8, p.y - 6, 16, 2)
        ctx.fillStyle = '#755c34'
        ctx.fillRect(sx - 4, p.y - 20, 8, 3)
        ctx.fillStyle = '#1c150c'
        ctx.fillRect(sx + 2, p.y - 12, 3, 4)        // weeping stain
        if (p.leak) {
            const d = dripPhase(tick)
            if (d.fall >= 0) {
                ctx.fillStyle = '#8fa2b0'
                ctx.fillRect(sx + 3, p.y - 8 + d.fall, 1, 2)
            }
            ctx.fillStyle = d.splash ? '#2a2118' : '#191309'
            ctx.fillRect(sx + 2, p.y - 1, d.splash ? 5 : 3, 1)
        }
    } else if (p.kind === 'pallet') {
        drawShadow(ctx, sx + castPx(p.x), p.y + 1, 20, 0.3)
        ctx.fillStyle = '#5a4326'                    // stacked pallets
        ctx.fillRect(sx - 12, p.y - 4, 24, 3)
        ctx.fillRect(sx - 10, p.y - 7, 20, 3)
        ctx.fillStyle = '#3c2c18'
        ctx.fillRect(sx - 12, p.y - 1, 24, 1)
        ctx.fillRect(sx - 4, p.y - 7, 2, 6); ctx.fillRect(sx + 3, p.y - 7, 2, 6)
    } else {
        ctx.fillStyle = '#7a2a2a'
        ctx.fillRect(sx - 3, p.y - 12, 6, 12)
        ctx.fillRect(sx - 5, p.y - 14, 10, 3)
        ctx.fillStyle = '#953636'
        ctx.fillRect(sx - 4, p.y - 9, 8, 2)
    }
}

// S2 weapons-wall sprites (#2807): the barrel that hides the steel, and the
// blade in flight. Same law as everything else here — cut in code, designed
// from the cabinet, drawn at native res.
// S3: crates are the yard's version of the barrel — same solidity, X-braced
// pine, and the same three-hit story written in the wood.
function drawCrate(ctx, x, y, sx, bar) {
    drawShadow(ctx, sx + castPx(bar.x), y + 1, 16, 0.35)
    ctx.fillStyle = '#5f4220'
    ctx.fillRect(x - 9, y - 20, 18, 20)
    ctx.fillStyle = '#77562c'                       // lit boards
    ctx.fillRect(x - 9, y - 19, 18, 3)
    ctx.fillRect(x - 9, y - 11, 18, 3)
    ctx.fillRect(x - 9, y - 3, 18, 3)
    ctx.fillStyle = '#3c2812'                       // X brace + border
    for (let i = 0; i < 18; i++) {
        ctx.fillRect(x - 9 + i, y - 17 + Math.round(i * 14 / 18), 1, 2)
        ctx.fillRect(x - 9 + i, y - 3 - Math.round(i * 14 / 18), 1, 2)
    }
    ctx.fillRect(x - 9, y - 20, 18, 1)
    ctx.fillRect(x - 9, y - 1, 18, 1)
    if (bar.hp <= 2) {
        ctx.fillStyle = '#1c1208'
        ctx.fillRect(x + 2, y - 16, 1, 7); ctx.fillRect(x + 3, y - 10, 1, 3)
    }
    if (bar.hp <= 1) {
        ctx.fillRect(x - 6, y - 14, 1, 8); ctx.fillRect(x - 5, y - 7, 3, 1)
        ctx.fillRect(x - 9, y - 20, 18, 1)         // lid splitting
    }
}

// S3 foreground for the yard: oil drum and pallet, nearer than the fight band
export const PROPS_YARD = [
    { x: 180, y: DEEP_BOT + 7, kind: 'drum', leak: true },
    { x: 470, y: DEEP_BOT + 9, kind: 'pallet' },
    { x: 780, y: DEEP_BOT + 7, kind: 'drum' },
]

// Marian — tied to the yard post all stage 2 (#2807: "Marian's rescue
// ending"). Two rope bands until Billy cuts them; then the cheer.
// #2825 item 2: she lives while she waits — a sway, a hair flick, a blink;
// and the freed cheer hops, waves and throws a heart.
export function drawMarian(ctx, m, camX, tick = 0) {
    const sx = Math.round(m.x - camX)
    if (sx < -30 || sx > W + 30) return
    const hop = m.freed && Math.floor(m.cheer / 8) % 2 === 0 ? -2 : 0
    const sway = m.freed ? 0 : (Math.floor(tick / 24) % 2 ? 1 : 0)   // worried shifting
    const hair = Math.floor(tick / 16) % 2 ? 1 : 0
    const blink = !m.freed && tick % 170 < 4
    const y = Math.round(m.y) + hop
    drawShadow(ctx, sx + castPx(m.x), Math.round(m.y) + 1, 12, 0.3)
    // the post — coil of cut rope at its foot once she's free
    ctx.fillStyle = '#3c2c18'
    ctx.fillRect(sx + 4, Math.round(m.y) - 30, 4, 30)
    ctx.fillStyle = '#281d10'
    ctx.fillRect(sx + 4, Math.round(m.y) - 30, 1, 30)
    ctx.fillStyle = '#4a3620'
    ctx.fillRect(sx + 3, Math.round(m.y) - 1, 6, 1)
    // legs + skirt
    ctx.fillStyle = '#3a5a8c'
    ctx.fillRect(sx - 4, y - 12, 8, 6)
    ctx.fillStyle = '#d8a06a'
    ctx.fillRect(sx - 3, y - 6, 2, 6); ctx.fillRect(sx + 1, y - 6, 2, 6)
    ctx.fillStyle = '#8a3040'
    ctx.fillRect(sx - 4, y - 1, 3, 2); ctx.fillRect(sx + 1, y - 1, 3, 2)
    // torso (sways while tied)
    ctx.fillStyle = '#d0507a'
    ctx.fillRect(sx - 4 + sway, y - 22, 8, 10)
    // arms — bound in front, waving in the cheer
    ctx.fillStyle = '#d8a06a'
    if (!m.freed) {
        ctx.fillRect(sx + 3, y - 19, 3, 2)
        ctx.fillRect(sx - 6, y - 19, 3, 2)
    } else if (Math.floor(m.cheer / 6) % 2) {          // left up, right pumping
        ctx.fillRect(sx - 7, y - 29, 2, 8)
        ctx.fillRect(sx + 4, y - 25, 2, 6)
    } else {                                            // right up, left pumping
        ctx.fillRect(sx + 5, y - 29, 2, 8)
        ctx.fillRect(sx - 6, y - 25, 2, 6)
    }
    // head + hair (flicks at the tips)
    ctx.fillStyle = '#e8b98a'
    ctx.fillRect(sx - 3 + sway, y - 30, 6, 6)
    ctx.fillStyle = '#6a4022'
    ctx.fillRect(sx - 4 + sway, y - 31, 8, 3)
    ctx.fillRect(sx - 4 + sway, y - 28, 2, 8)
    ctx.fillRect(sx + 2 + sway, y - 28, 2, 7 + hair)
    if (!m.freed && !blink) {
        ctx.fillStyle = '#1a1208'
        ctx.fillRect(sx - 1 + sway, y - 28, 1, 1)
    }
    // ropes hold until the cut
    if (!m.freed) {
        ctx.fillStyle = '#cbbf9a'
        ctx.fillRect(sx - 5, y - 17, 13, 2)
        ctx.fillRect(sx - 5, y - 11, 13, 2)
        ctx.fillStyle = '#9c8f6d'
        ctx.fillRect(sx + 4, y - 17, 4, 2)
        if (m.cuts === 1) {                         // one band parted
            ctx.fillStyle = '#332724'
            ctx.fillRect(sx - 1, y - 17, 3, 2)
        }
    } else {
        ctx.fillStyle = '#9c8f6d'                   // cut rope coiled on the boards
        ctx.fillRect(sx - 4, Math.round(m.y) - 3, 8, 2)
        ctx.fillRect(sx - 3, Math.round(m.y) - 5, 6, 2)
        // #2825: the cheer throws a heart — it floats up and fades out
        if (m.cheer < 80 && Math.floor(m.cheer / 3) % 2) {
            const hy = y - 36 - Math.floor(m.cheer / 3)
            ctx.fillStyle = m.cheer < 56 ? '#ff9ec0' : '#e86a92'
            ctx.fillRect(sx - 2, hy, 2, 2); ctx.fillRect(sx + 1, hy, 2, 2)
            ctx.fillRect(sx - 2, hy + 2, 5, 2); ctx.fillRect(sx, hy + 4, 1, 1)
        }
    }
}

// #2891: Marian off the post — the opening movie's victim. Walks, runs with
// arms up when the gang closes, rides Abobo's shoulder-height hold with a
// HELP! bubble, legs kicking the whole way. Same palette as the yard edition.
export function drawIntroMarian(ctx, m, camX, tick = 0) {
    const sx = Math.round(m.x - camX)
    if (sx < -40 || sx > W + 40) return
    const held = m.grabbed
    const y = Math.round(m.y) - (held ? m.lift : 0)
    const stepF = Math.floor(m.anim / 6) % 2
    const kick = Math.floor(tick / 5) % 2
    if (!held) drawShadow(ctx, sx, Math.round(m.y) + 1, 12, 0.3)
    // legs
    ctx.fillStyle = '#d8a06a'
    if (held) {                                       // pedalling at arm's length
        ctx.fillRect(sx - 3, y - 6 + (kick ? 2 : 0), 2, 6)
        ctx.fillRect(sx + 1, y - 6 + (kick ? 0 : 2), 2, 6)
    } else if (m.scared) {                            // running: long stride
        ctx.fillRect(sx - 5 + (stepF ? 2 : 0), y - 6, 3, 6)
        ctx.fillRect(sx + 2 - (stepF ? 2 : 0), y - 7, 3, 7)
    } else {                                          // a stroll
        ctx.fillRect(sx - 3 + (stepF ? 1 : -1), y - 6, 2, 6)
        ctx.fillRect(sx + 1 + (stepF ? -1 : 1), y - 6, 2, 6)
    }
    // skirt + torso
    ctx.fillStyle = '#3a5a8c'
    ctx.fillRect(sx - 4, y - 12, 8, 6)
    ctx.fillStyle = '#d0507a'
    ctx.fillRect(sx - 4, y - 22, 8, 10)
    // arms — up and waving when the night turns, swinging on the stroll
    ctx.fillStyle = '#d8a06a'
    if (held || m.scared) {
        const flap = Math.floor(tick / 7) % 2
        ctx.fillRect(sx - 7, y - 28 - flap, 2, 8)
        ctx.fillRect(sx + 5, y - 27 - (1 - flap), 2, 8)
    } else {
        ctx.fillRect(sx - 6, y - 20 + (stepF ? 1 : 0), 2, 6)
        ctx.fillRect(sx + 4, y - 20 - (stepF ? 1 : 0), 2, 6)
    }
    // head + hair (tips flick on the run)
    ctx.fillStyle = '#e8b98a'
    ctx.fillRect(sx - 3, y - 30, 6, 6)
    ctx.fillStyle = '#6a4022'
    ctx.fillRect(sx - 4, y - 31, 8, 3)
    ctx.fillRect(sx - 4, y - 28, 2, 8)
    ctx.fillRect(sx + 2, y - 28, 2, 7 + (Math.floor(tick / 16) % 2))
    // HELP! — the bubble rides the hold, blinks like the cabinet's talk boxes
    if (m.bubble > 0 && m.bubble % 10 < 7) {
        const bw = textWidth('HELP!', 1) + 6
        const bx = sx - Math.round(bw / 2)
        const by = y - 46
        ctx.fillStyle = '#f4f1e4'
        ctx.fillRect(bx, by, bw, 11)
        ctx.fillRect(sx - 1, by + 11, 3, 2)
        label(ctx, 'HELP!', bx + 3, by + 3, '#7a1e2e', 1)
    }
}

export function drawBarrel(ctx, bar, camX) {
    const sx = Math.round(bar.x - camX)
    if (sx < -30 || sx > W + 30) return
    const jx = bar.shake > 0 ? (bar.shake % 2 ? 1 : -1) : 0
    const x = sx + jx
    const y = Math.round(bar.y)
    if (bar.kind === 'crate') return drawCrate(ctx, x, y, sx, bar)
    drawShadow(ctx, sx, y + 1, 15, 0.35)
    ctx.fillStyle = '#7a4a26'
    ctx.fillRect(x - 7, y - 18, 14, 18)
    ctx.fillStyle = '#8f5a2e'                       // lit belly staves
    ctx.fillRect(x - 4, y - 18, 3, 18)
    ctx.fillStyle = '#5f3a1e'                       // seam staves
    ctx.fillRect(x - 1, y - 18, 1, 18); ctx.fillRect(x + 4, y - 18, 1, 18)
    ctx.fillStyle = '#3c2612'                       // iron hoops
    ctx.fillRect(x - 8, y - 16, 16, 2); ctx.fillRect(x - 8, y - 5, 16, 2)
    ctx.fillStyle = '#916134'                       // rim
    ctx.fillRect(x - 7, y - 19, 14, 2)
    if (bar.hp <= 2) {                              // cracks tell the story
        ctx.fillStyle = '#241408'
        ctx.fillRect(x + 1, y - 14, 1, 6); ctx.fillRect(x + 2, y - 9, 1, 3)
    }
    if (bar.hp <= 1) {
        ctx.fillRect(x - 5, y - 12, 1, 7); ctx.fillRect(x - 4, y - 6, 2, 1)
        ctx.fillRect(x - 8, y - 16, 16, 1)         // hoop splitting
    }
}

export function drawProjectile(ctx, pr, camX) {
    const sx = Math.round(pr.x - camX)
    if (sx < -20 || sx > W + 20) return
    const y = Math.round(pr.y) - 14                // flat throw, blade height
    const dir = pr.vx >= 0 ? 1 : -1
    // #2819 item 1: the cabinet tumbles the blade across three faces — flat,
    // angled, edge-on — with a lamp-flash on every rotation.
    const f = pr.spin % 12
    if (f < 5) {
        ctx.fillStyle = '#cfd6de'
        ctx.fillRect(sx - 4 * dir, y, 8, 2)
        ctx.fillStyle = '#eef2f6'
        ctx.fillRect(sx + 4 * dir, y, 3, 1)        // point catches the lamp
        ctx.fillStyle = '#3a2c1c'
        ctx.fillRect(sx - 7 * dir, y, 3, 2)        // grip
    } else if (f < 8) {
        ctx.fillStyle = '#cfd6de'                   // mid-rotation, angled
        ctx.fillRect(sx + (dir > 0 ? -3 : -4), y - 3, 7, 2)
        ctx.fillRect(sx + (dir > 0 ? 0 : -4), y - 1, 4, 2)
        ctx.fillStyle = '#3a2c1c'
        ctx.fillRect(sx + (dir > 0 ? -5 : 2), y - 4, 3, 2)
    } else {
        ctx.fillStyle = '#9aa4ae'                   // edge-on: narrow and dark
        ctx.fillRect(sx, y - 4, 2, 9)
        ctx.fillStyle = '#3a2c1c'
        ctx.fillRect(sx, y + 4, 2, 3)
    }
    if (f === 0) {                                 // spin flash once per revolution
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(sx + (dir > 0 ? 3 : -5), y - 1, 2, 1)
    }
}

export function drawShadow(ctx, x, y, w = 16, a = 0.35) {
    ctx.fillStyle = `rgba(0,0,0,${a})`
    ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), w / 2, 3, 0, 0, Math.PI * 2); ctx.fill()
}

// ---- #2877: the cast law (S3 yard) -------------------------------------
// The swaying chain-lamps are the yard's only key light: the shade swings,
// the pool follows it across the concrete, and every grounded shadow leans
// AGAINST the lamp above it. On the street (stage 1) the sodium lamps are
// dead fittings — there the cast stays off and shadows stand under the feet.
// This is render state only: juice, never sim, never stateHash (KO-flash law).
let castOn = false, castTick = 0, castCam = 0
export function setLampLight(tick, camX, on) { castOn = !!on; castTick = tick; castCam = camX }
// lamp n's sway, the one formula hangingLamps, the pools and the cast all
// share: seeded phase, ±1.5px, one cycle per 34*2π ticks (≈214).
export const lampSwayAt = (n, tick) => Math.round(Math.sin(tick / 34 + n * 2) * 1.5)
// lamp n hangs at screen x = n*176 + 60 − camX*0.85; a floor point at world x
// sits under lamp n when n = (wx − camX*0.15 − 60) / 176 (nearest), so the
// drift is per-spot: the yard breathes in phases as it scrolls.
export const lampNAt = (wx, camX) => Math.round((wx - camX * 0.15 - 60) / 176)
export const castAt = (wx, tick, camX) => -lampSwayAt(lampNAt(wx, camX), tick)
export const castPx = (wx) => (castOn ? castAt(wx, castTick, castCam) : 0) // exported: ddragoncheck pins the street gate

// ------------------------------------------------------------- the fighters ---
const SKIN = '#d8a06a', SKIN_D = '#b57d46'
const CFG = { punchOn: 4, kickOn: 6 }
const PAL = {
    billy: { head: '#e8e8ec', body: '#dcdce4', trim: '#c8302f', legs: '#dcdce4', shoes: '#5a3a24', band: '#c8302f' },
    // Jimmy (S4 blue seat): same skin, blue everything else — 1987 arcade palette
    jimmy: { head: '#e8e8ec', body: '#dcdce4', trim: '#2f5fd0', legs: '#dcdce4', shoes: '#5a3a24', band: '#2f5fd0' },
    williams: { head: '#d8d8dc', body: '#2f8f74', trim: '#1d6b52', legs: '#3a3f52', shoes: '#22262f', band: '#2f8f74' },
    amon: { head: '#8a5a34', body: '#8a5a34', trim: '#5f3d22', legs: '#2c2f3c', shoes: '#1c1e26', band: null },
    abobo: { head: '#6a4a2c', body: '#2e3138', trim: '#1c1e24', legs: '#17191f', shoes: '#0e0f13', band: null },
    // S3 the duel: Williams the lieutenant — the same green, worn better:
    // deeper shade, tan canvas pants, and the red sweep over the cap.
    duel: { head: '#d8d8dc', body: '#26775d', trim: '#174a38', legs: '#8a7550', shoes: '#22262f', band: '#26775d', sweep: '#b03030' },
}

// generic pixel fighter. pose: idle|walk|jump|punch|kick|spin|windup|attack|
// hurt|down|getup|grab|grabbed|dying ; t = anim tick; s = scale (abobo 1.3);
// lean = forward pitch in px (#2819: the barrel-hop read)
function fighter(ctx, sx, sy, face, pose, t, pal, s = 1, lean = 0) {
    const u = (v) => Math.round(v * s)
    const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(sx + u(x) * face, sy + u(y), u(w), u(h)) }
    // mirrored rects keep the facing flip crisp around x=0
    const walk = pose === 'walk' ? Math.floor(t / 6) % 4 : 0
    const breathe = pose === 'idle' ? (Math.floor(t / 24) % 2) : 0
    const legSwing = [[-3, 3], [-1, 1], [3, -3], [1, -1]][walk]
    // #2810 item 1: the cabinet's fighters bounce on the balls of their feet —
    // a small vertical bob on the stride plus a shoulder counter-swing that
    // leans the torso against the leading leg.
    const bobY = pose === 'walk' ? [0, -1, -1, 0][walk] : 0
    const sway = pose === 'walk' ? -Math.sign(legSwing[0]) : 0
    const hx = sway + (pose === 'charge' ? 3 : 0) + lean // lean: shoulders lead the body-check / the hop
    const bulk = s >= 1.3 ? 1 : 0                  // #2810 item 8: Abobo's slabs wider
    ctx.save()
    if (pose === 'down') {
        // sprawled flat
        R(-9, -6, 20, 6, pal.body)
        R(11, -9, 7, 7, pal.head)
        if (pal.band) R(11, -9, 7, 2, pal.band)
        R(-11, -4, 4, 4, pal.legs)
        ctx.restore(); return
    }
    if (pose === 'dying') {
        // #2810 item 2: tumble out backwards off the hit — the body pivots
        // over the heels, arms and legs flail, then it settles into the sprawl.
        const p = Math.min(1, t / 12)
        const fl = t < 10 ? (Math.floor(t / 2) % 2 ? -3 : 2) : 0
        ctx.translate(sx, sy)
        ctx.rotate(-face * 1.25 * p)
        const F = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(u(x) * face, u(y), u(w), u(h)) }
        F(-9, -6 + Math.abs(fl), 20, 6, pal.body)
        F(11, -9 + Math.abs(fl), 7, 7, pal.head)
        if (pal.band) F(11, -9 + Math.abs(fl), 7, 2, pal.band)
        F(-11, -4 - fl, 4, 4, pal.legs)
        F(-6, -11 - fl, 4, 3, SKIN)
        ctx.restore(); return
    }
    const bob = (pose === 'jump' ? -1 : breathe) + bobY
    // legs
    if (pose === 'kick') {
        R(-2, -10, 4, 10, pal.legs)                       // stand leg
        R(2, -14, 12, 4, pal.legs); R(13, -15, 4, 3, pal.shoes) // kicking leg
    } else if (pose === 'jump') {
        R(-4, -12, 4, 7, pal.legs); R(1, -12, 4, 7, pal.legs)
        R(-5, -6, 5, 3, pal.shoes); R(1, -6, 5, 3, pal.shoes)
    } else if (pose === 'walk') {
        R(legSwing[0], -10, 4, 10, pal.legs)
        R(legSwing[1], -10, 4, 10, pal.legs)
        R(legSwing[0] - 1, -1, 5, 2, pal.shoes)
        R(legSwing[1] - 1, -1, 5, 2, pal.shoes)
    } else {
        R(-3, -10, 4, 10, pal.legs); R(1, -10, 4, 10, pal.legs)
        R(-4, -1, 5, 2, pal.shoes); R(1, -1, 5, 2, pal.shoes)
    }
    // torso
    R(-5 + hx, -22 + bob, 10 + 2 * bulk, 12, pal.body)
    if (pal.band) R(-5 + hx, -16 + bob, 10 + 2 * bulk, 3, pal.trim)
    // head
    R(-4 + hx - bulk, -30 + bob, 8 + 2 * bulk, 8, pal.head)
    if (pal === PAL.billy || pal === PAL.jimmy) { R(-4 + hx, -30 + bob, 8, 2, pal.band); R(-7 + hx, -29 + bob, 3, 2, pal.band) } // headband + tail (both dragons)
    if (pal === PAL.williams) { R(-5 + hx, -31 + bob, 10, 3, pal.band); R(2 + hx, -30 + bob, 4, 2, '#1d6b52') } // cap + brim
    if (pal === PAL.duel) {
        R(-5 + hx, -31 + bob, 10, 3, pal.band); R(2 + hx, -30 + bob, 5, 2, '#174a38')   // cap + longer brim
        R(-5 + hx, -28 + bob, 10, 2, pal.sweep)                                            // red sweep
    }
    if (pal === PAL.abobo) { R(-6 + hx, -31 + bob, 12, 2, '#14161b'); R(-5 + hx, -26 + bob, 10, 2, SKIN_D) }   // dark brow band, shadowed face
    if (pal === PAL.amon) { R(-4 + hx, -26 + bob, 8, 2, SKIN_D) }
    R(2 + hx, -27 + bob, 1, 1, '#1a1208') // eye toward the fight
    // arms
    if (pose === 'punch') {
        R(3, -20 + bob, 11, 3, SKIN)                 // jab out
        R(13, -21 + bob, 3, 4, SKIN_D)
        R(-6, -19 + bob, 3, 7, SKIN)                 // back arm guard
    } else if (pose === 'windup') {
        R(-8, -21 + bob, 4, 8, SKIN)                 // cocked back
        R(-4, -19 + bob, 3, 6, SKIN)
    } else if (pose === 'attack') {
        R(3, -19 + bob, 13, 4, SKIN)
        R(15, -20 + bob, 4, 5, SKIN_D)
    } else if (pose === 'spin') {
        const f = Math.floor(t / 4) % 4
        if (f === 0 || f === 2) { R(2, -20 + bob, 12, 3, SKIN); R(-14, -20 + bob, 12, 3, SKIN) }
        else if (f === 1) { R(2, -24 + bob, 12, 3, SKIN); R(-6, -12 + bob, 12, 3, SKIN) }
        else { R(-6, -24 + bob, 12, 3, SKIN); R(2, -12 + bob, 12, 3, SKIN) }
    } else if (pose === 'grab' || pose === 'grabbed') {
        R(3, -21 + bob, 8, 3, SKIN)                  // reaching/clutched arms
        R(9, -22 + bob, 3, 4, SKIN_D)
    } else if (pose === 'relief') {
        // #2857: freed from a grip — arms thrown up, fists clear of the crown.
        R(4, -32 + bob, 3, 11, SKIN); R(-7, -31 + bob, 3, 10, SKIN)
        R(4, -34 + bob, 3, 2, SKIN_D); R(-7, -33 + bob, 3, 2, SKIN_D)
    } else if (pose === 'flourish') {
        // #2857: the KO strut, two beats — t counts down from the CFG's
        // flourishTicks. First half: a flick of the wrist off the shoulder;
        // second half: a cocked shoulder check back toward the fallen man.
        if (t > 10) {
            R(3, -20 + bob, 9, 3, SKIN)               // arm flicked out
            R(12, -24 + bob, 3, 5, SKIN_D)            // hand snapped up
            R(15, -26 + bob, 2, 2, '#ffffff')         // the flick's spark
        } else {
            R(2, -18 + bob, 6, 4, SKIN)               // arm cocked across the chest
            R(-6, -19 + bob, 3, 7, SKIN)
        }
    } else if (pose === 'hurt') {
        R(-7, -20 + bob, 3, 8, SKIN); R(4, -18 + bob, 3, 6, SKIN)
    } else {
        R(3 + sway, -20 + bob, 3, 8, SKIN)                  // guard stance (arms counter-swing on the walk)
        R(-6 - sway, -19 + bob, 3, 7, SKIN)
    }
    ctx.restore()
}

export function drawBilly(ctx, b, camX, props) { drawFighter(ctx, b, camX, PAL.billy, props) }
export function drawJimmy(ctx, b, camX, props) { drawFighter(ctx, b, camX, PAL.jimmy, props) }

function drawFighter(ctx, b, camX, pal, props) {
    const sx = Math.round(b.x - camX)
    const sy = Math.round(b.y)
    if (sx < -40 || sx > W + 40) return
    const inv = b.inv > 0 && b.state !== 'dying'
    if (inv && Math.floor(b.inv / 4) % 2 === 0) return
    // #2819 item 6: clearing waist-high wood must READ as clearing wood —
    // over a barrel/crate the body pitches forward and the shadow squashes
    // flat between the slats, not the generic jump-height fade.
    const hop = b.z > 8 && Array.isArray(props)
        && props.some((q) => Math.abs(q.x - b.x) <= 14 && Math.abs(q.y - b.y) <= 12)
    let pose = 'idle'
    if (b.state === 'walk') pose = 'walk'
    else if (b.state === 'jump') pose = 'jump'
    else if (b.state === 'punch') pose = b.stateT >= CFG.punchOn ? 'punch' : 'windup'
    else if (b.state === 'kick') pose = b.stateT >= CFG.kickOn ? 'kick' : 'windup'
    else if (b.state === 'spin') pose = 'spin'
    else if (b.state === 'throw') pose = b.stateT >= 4 ? 'punch' : 'windup'
    else if (b.state === 'whip') pose = b.stateT >= 8 ? 'attack' : 'windup'
    else if (b.state === 'grabbed') pose = 'grabbed'
    else if (b.state === 'down') pose = 'down'   // #2891: the movie leaves them sprawled
    else if (b.state === 'dying') pose = 'dying'
    // #2857 seat tells over the neutral states — relief after a freed grip,
    // the KO flourish over an idle or a walk. Juice rides the pose, nothing else.
    if (b.relief > 0 && pose === 'idle') pose = 'relief'
    else if (b.flourish > 0 && (pose === 'idle' || pose === 'walk')) pose = 'flourish'
    if (hop) drawShadow(ctx, sx + castPx(b.x), sy + 1, 10, 0.22)
    else drawShadow(ctx, sx + castPx(b.x), sy + 1, 14, 0.35 - b.z * 0.02)
    const lift = Math.round(b.z)
    if (b.state === 'dying') {
        if (b.stateT > 26) return
        if (b.stateT > 16) ctx.globalAlpha = 1 - (b.stateT - 16) / 10
    }
    fighter(ctx, sx, sy - lift, b.face, pose, pose === 'flourish' ? b.flourish : b.anim, pal, 1,
        hop ? 1 : pose === 'flourish' && b.flourish <= 10 ? 1 : 0)
    // #2857 guardian telegraph: speed lines off the trailing shoulder while
    // this dragon sprints the holder of his brother — seat-tinted by the
    // band (red answers red, blue answers blue), shimmering on the guard clock.
    if (b.guard > 0 && b.state !== 'grabbed' && b.state !== 'dying') {
        ctx.globalAlpha = b.guard > 5 ? 0.8 : b.guard > 2 ? 0.55 : 0.3
        for (let i = 0; i < 3; i++) {
            if ((b.guard + i) % 2) continue
            ctx.fillStyle = pal.band || pal.trim
            ctx.fillRect(sx - b.face * (10 + i * 4), sy - lift - 13 - i * 4, 3, 2)
        }
        if (b.guard % 2 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - b.face * 6, sy - lift - 22, 1, 1) }
        ctx.globalAlpha = 1
    }
    if (b.weapon === 'stick') {
        ctx.fillStyle = '#8a6a3c'
        const stickAt = pose === 'punch' || pose === 'attack' ? 16 : pose === 'spin' ? 12 : 7
        ctx.fillRect(sx + (pose === 'windup' ? -12 : stickAt * b.face), sy - lift - 21, 9 * b.face, 2)
    } else if (b.weapon === 'knife') {
        ctx.fillStyle = '#cfd6de'                   // blade kept low at the hip
        ctx.fillRect(sx + 4 * b.face, sy - lift - 16, 6 * b.face, 2)
        ctx.fillStyle = '#3a2c1c'
        ctx.fillRect(sx + 2 * b.face, sy - lift - 16, 2 * b.face, 2)
    } else if (b.weapon === 'whip') {
        ctx.fillStyle = '#5a3a20'                   // coil at the belt
        ctx.fillRect(sx - 4, sy - lift - 13, 8, 2)
        ctx.fillRect(sx - 4, sy - lift - 11, 2, 2)
    }
    if (b.state === 'whip' && b.stateT >= 8 && b.stateT <= 16) {
        // the lash: a cracking line out to full reach, pixel-stepped
        const lit = b.lash > 0   // #2819 item 2: the bite tick burns brighter
        ctx.fillStyle = lit ? '#7c4c20' : '#4a2f18'
        const t = (b.stateT - 8) / 8
        let lx = sx, ly = sy - lift - 20
        for (let i = 0; i <= 12; i++) {
            const f = i / 12
            lx = sx + b.face * Math.round(6 + f * 28 * (0.6 + t * 0.4))
            ly = sy - lift - 20 + Math.round(Math.sin(f * Math.PI * (1.5 - t)) * 6 * f)
            ctx.fillRect(lx, ly, 2, 1)
        }
        if (lit) {                              // white crack at the tip
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(lx - 1, ly - 1, 3, 2)
        }
    }
    ctx.globalAlpha = 1
}

export function drawEnemy(ctx, e, camX) {
    const sx = Math.round(e.x - camX)
    if (sx < -50 || sx > W + 50) return
    const sy = Math.round(e.y)
    const def = { williams: 1, amon: 1.12, abobo: 1.38, duel: 1.18 }[e.kind]
    let pose = 'walk'
    if (e.state === 'idle') pose = 'idle'
    else if (e.state === 'windup') pose = 'windup'
    else if (e.state === 'aim') pose = 'windup'
    else if (e.state === 'cast') pose = 'attack'
    else if (e.state === 'attack') pose = 'attack'
    else if (e.state === 'stagger') pose = 'hurt'
    else if (e.state === 'down') pose = 'down'
    else if (e.state === 'dying') pose = 'dying'
    else if (e.state === 'getup') pose = 'getup'
    else if (e.state === 'grab') pose = 'grab'
    else if (e.state === 'chargewind') pose = 'windup'
    else if (e.state === 'charge') pose = 'charge'
    if ((e.state === 'getup') && Math.floor(e.inv / 3) % 2 === 0) return
    // #2857 cadence readability: the blue seat's jabs rock a man wider than
    // the red's do — a 3 px wobble vs 2, read at a glance over the yard.
    // The shadow stays planted; only the body sways.
    const jx = pose === 'hurt' && e.wob > 0 ? ((Math.floor(e.anim / 2) % 2) ? 1 : -1) * (e.wob > 5 ? 3 : 2) : 0
    drawShadow(ctx, sx + castPx(e.x), sy + 1, 14 * def, 0.35)
    if (e.state === 'dying') {
        if (e.stateT > 30) return
        ctx.globalAlpha = 1 - e.stateT / 30
    }
    fighter(ctx, sx + jx, sy, e.face, pose === 'getup' ? 'jump' : pose, e.anim, PAL[e.kind], def)
    // #2874: hits SHOW — every landed blow lights the man white for a flash,
    // and a wounded goon wears a thin bank over his head, so a newcomer sees
    // the hits counting long before the KO popup pays.
    if (e.flash > 0 && e.state !== 'dying') {
        ctx.globalAlpha = 0.22 + e.flash * 0.05
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(sx - 7 * def, sy - 28 * def, 14 * def, 28 * def)
        ctx.globalAlpha = 1
    }
    if (e.state !== 'dying' && e.hp > 0 && e.hp < ENEMY_DEF[e.kind].hp) {
        const bw = Math.round(16 * def)
        ctx.fillStyle = '#3a1d1d'
        ctx.fillRect(sx - Math.round(bw / 2), sy - 33 * def, bw, 2)
        ctx.fillStyle = '#ffd93c'
        ctx.fillRect(sx - Math.round(bw / 2), sy - 33 * def, Math.max(2, Math.round(bw * e.hp / ENEMY_DEF[e.kind].hp)), 2)
    }
    if (e.hasStick) {
        ctx.fillStyle = '#8a6a3c'
        ctx.fillRect(sx + (pose === 'attack' ? 16 : pose === 'windup' ? -12 : 8) * e.face, sy - 22 * def, 10 * e.face, 2)
    }
    if (e.hasKnife) {
        // S3 steel in a goon's hand: held low at the hip, cocked back in the
        // aim, arm out the instant it flies
        ctx.fillStyle = '#cfd6de'
        const kx = pose === 'windup' ? -11 : pose === 'attack' ? 13 : 7
        ctx.fillRect(sx + kx * e.face, sy - 18 * def, 7 * e.face, 2)
        ctx.fillStyle = '#3a2c1c'
        ctx.fillRect(sx + (kx - 3) * e.face, sy - 18 * def, 3 * e.face, 2)
    }
    ctx.globalAlpha = 1
}

export function drawPickup(ctx, p, camX) {
    const sx = Math.round(p.x - camX)
    if (sx < -20 || sx > W + 20) return
    // #2819 item 3: steel spat from wood lands clattering — two decaying hops
    const cl = p.clatter || 0
    const hopY = cl > 0 ? -Math.round(Math.abs(Math.sin((14 - cl) * 0.9)) * cl * 0.28) : 0
    const stuck = (p.stick || 0) > 0
    const bobY = (stuck ? 0 : Math.round(Math.sin(p.bob / 9) * 2)) + hopY
    const y = Math.round(p.y) + bobY
    drawShadow(ctx, sx, Math.round(p.y) + 1, 12, 0.3)
    if (stuck && p.kind === 'knife') {
        // #2819 item 1: the blade stands proud of the asphalt and quivers
        const jit = p.stick > 15 ? p.stick % 2 : 0
        ctx.fillStyle = '#cfd6de'
        ctx.fillRect(sx - 1 + jit, y - 8, 2, 8)
        ctx.fillStyle = '#3a2c1c'
        ctx.fillRect(sx - 1 + jit, y - 11, 2, 3)
        ctx.fillStyle = '#eef2f6'
        ctx.fillRect(sx + jit, y - 7, 1, 3)
        return
    }
    if (p.kind === 'knife') {
        ctx.fillStyle = '#cfd6de'
        ctx.fillRect(sx - 5, y - 8, 9, 2)
        ctx.fillStyle = '#eef2f6'
        ctx.fillRect(sx + 4, y - 8, 2, 1)
        ctx.fillStyle = '#3a2c1c'
        ctx.fillRect(sx - 7, y - 8, 2, 2)
        // #2819 item 4: steel winks on a 24-frame clock so a knife reads as
        // steel at a glance, distinct from the stick's steady gold glint
        if (Math.floor(p.bob / 12) % 2 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(sx + 4, y - 9, 1, 1) }
    } else if (p.kind === 'whip') {
        ctx.fillStyle = '#5a3a20'
        ctx.fillRect(sx - 5, y - 9, 10, 2)         // coiled lash
        ctx.fillRect(sx - 5, y - 7, 2, 3)
        ctx.fillRect(sx + 3, y - 7, 2, 3)
        ctx.fillStyle = '#8a6a3c'
        ctx.fillRect(sx - 1, y - 10, 3, 2)         // handle
    } else {
        ctx.fillStyle = '#b58a4a'
        ctx.fillRect(sx - 6, y - 10, 12, 2)
        ctx.fillStyle = '#e8c87a'
        ctx.fillRect(sx - 6, y - 10, 4, 2)
    }
}

// ------------------------------------------------------------------- HUD ---
export function drawHud(ctx, gs, playing = true) {
    ctx.fillStyle = 'rgba(4,6,14,0.72)'
    ctx.fillRect(0, 0, W, 17)
    // the app chrome wears the top-left corner (ARCADE badge + FEEDBACK); the
    // cabinet reads one line below it, and lives sit clear of the sound chip
    // #2833: second wind at a glance — a seat that came back from drained
    // blinks its tag and bands white for a beat and a half (the banner's
    // length), so the fresh life reads without hunting the bank.
    const wind = (p) => p && gs.tick - p.backAt < 90 && gs.tick % 12 < 6
    label(ctx, '1UP', 78, 6, wind(gs.billy) ? '#ffffff' : '#ff5a52', 1)
    label(ctx, String(gs.score).padStart(6, '0'), 102, 6, '#fff', 1)
    label(ctx, 'HI', 150, 6, '#ffd98a', 1)
    label(ctx, String(Math.max(gs.hi, gs.score)).padStart(6, '0'), 166, 6, '#fff', 1)
    // #2899 right-corner clearance law: the app chrome pins PAUSE at the
    // viewport's top-right, and at mid-size windows (1280x800 and narrower)
    // the letterboxed canvas is flush with that corner — the button covers the
    // canvas's rightmost ~26 px of its top 13 rows. So HUD ink keeps out of
    // that box: the headband banks ride 10px pitch columns ending at x=292,
    // capped at four bands each. Mirrors the left flank's x=78 law (#2895).
    for (let i = 0; i < Math.min(gs.billy.lives, 4); i++) {
        ctx.fillStyle = wind(gs.billy) ? '#ffffff' : '#c8302f'
        ctx.fillRect(214 + i * 10, 8, 8, 3)
        ctx.fillStyle = '#e8e8ec'
        ctx.fillRect(214 + i * 10 + 2, 5, 4, 3)
    }
    // co-op (S4): 2P sits right of 1UP; blue headbands, blue label (2023's
    // blue-Billy is exactly this trim blue). Out seat: dimmed slot + the ready
    // blink when its bank still holds lives — the arcade's seat invitation.
    if (gs.jimmy) {
        // #2833: the tiny blue 2P tag — 12px of chrome in the gap between
        // the HI score and the band column; it clears the weapon label zone
        // (x=78, y=11) by a street. #2899: one px left, so the tag's drop
        // shadow never touches the 1P column's first band.
        label(ctx, '2P', 202, 6, wind(gs.jimmy) ? '#ffffff' : '#5a8ae8', 1)
        if (gs.jimmy.out) {
            // #2899: the empty-seat slot rides column 0; the READY blink
            // drops a row below the strip's band line (y=14), clear of the
            // chrome corner box and of the X-chain tag (x>=305, y=19).
            ctx.fillStyle = '#3a3f52'
            ctx.fillRect(254, 8, 8, 3)
            ctx.fillRect(256, 5, 4, 3)
            if (gs.jimmy.lives > 0 && gs.tick % 40 < 24) label(ctx, 'READY', 254, 14, '#2f5fd0', 1)
        }
        for (let i = 0; i < Math.min(gs.jimmy.lives, 4); i++) {
            ctx.fillStyle = gs.jimmy.out ? '#3a3f52' : wind(gs.jimmy) ? '#ffffff' : '#2f5fd0'
            ctx.fillRect(254 + i * 10, 8, 8, 3)
            ctx.fillStyle = gs.jimmy.out ? '#5a5f72' : '#e8e8ec'
            ctx.fillRect(254 + i * 10 + 2, 5, 4, 3)
        }
    }
    const WL = { stick: 'STICK', knife: 'KNIFE', whip: 'WHIP' }
    // #2819 item 5: the cabinet tints the weapon label per type — steel white,
    // leather brown, wood gold — so the HUD reads the hand at a glance
    const WC = { stick: '#e8c87a', knife: '#e8ecf2', whip: '#b07840' }
    if (gs.billy.weapon) label(ctx, WL[gs.billy.weapon] || 'STICK', 78, 11, WC[gs.billy.weapon] || '#e8c87a', 1)
    // #2810 item 6: wave ticks where the cabinet shows the stage number — the
    // current wave blinks before it starts, fills gold once it is live/cleared
    for (let i = 0; i < 3; i++) {
        const live = i < gs.waveIdx || (i === gs.waveIdx && gs.waveActive)
        ctx.fillStyle = live ? '#ffd98a' : (i === gs.waveIdx && gs.tick % 30 < 18 ? '#8a7333' : '#3a3f52')
        ctx.fillRect(102 + i * 6, 19, 4, 3)
    }
    // S3: the cabinet numbers its chapters — Walnuts Street or the hideout
    label(ctx, gs.stage === 2 ? '2-1' : '1-1', 124, 19, gs.stage === 2 ? '#ff9a7a' : '#8fd0ff', 1)
    // #2874: show the cost — a lost life blinks its seat tag and bank at the
    // HUD's left flank (the score popup owns the centre, so the two never
    // crowd each other). A newcomer reads WHICH seat fell and how many left.
    if (gs.livesFx && gs.livesFx.t % 8 < 6) {
        const p = gs.livesFx.tag === 'billy' ? gs.billy : gs.jimmy
        if (p) label(ctx, `${gs.livesFx.tag === 'billy' ? '1UP' : '2P'} LIVES X${Math.max(p.lives, 0)}`, 8, 26,
            gs.livesFx.tag === 'billy' ? '#ff5a52' : '#5a8ae8', 1)
    }
    // #2874: the arcade marquee's promise, kept — for the first seconds of a
    // fresh street the cabinet names its keys; then it gets out of the way.
    if (playing && gs.tipT > 0 && gs.mode === 'play' && !gs.intro && (gs.tipT > 60 || gs.tipT % 8 < 6)) {
        label(ctx, gs.tipText || TIP, Math.round((W - textWidth(gs.tipText || TIP, 1)) / 2), 34, '#8fd0ff', 1)
    }
    // score delta floats under the HUD on each KO/pickup, arcade-style
    if (gs.scoreFlash && gs.scoreFlash.t % 8 < 6) {
        const s = '+' + gs.scoreFlash.v
        const px = Math.round((W - textWidth(s, 1)) / 2)
        label(ctx, s, px, 26, '#ffd93c', 1)
        // #2882: the chain rides the popup — the cabinet tags a hot take ×N
        if (gs.scoreFlash.m > 1) label(ctx, 'X' + gs.scoreFlash.m, px + textWidth(s, 1) + 5, 26, '#ff7a3c', 1)
    }
    // #2882: while the chain is hot the HUD wears its multiplier — a blinking
    // X2/X3/X4 on the right, so the streak reads at a glance between popups
    if (gs.chain >= 2 && gs.chainT > 0 && gs.tick % 20 < 14) {
        const t = 'X' + gs.chain
        label(ctx, t, W - textWidth(t, 1) - 4, 19, '#ff7a3c', 1)
    }
}

// wave / banner one-message-at-a-time overlays (never over the HUD)
export function drawBanner(ctx, gs) {
    if (gs.intro) {
        // #2891: the movie names its own crime — one caption, clear of the HUD
        if (gs.intro.takenT > 0 && (gs.intro.takenT > 18 || gs.intro.takenT % 6 < 4)) {
            const s = 'MARIAN TAKEN!'
            label(ctx, s, Math.round((W - textWidth(s, 2)) / 2), 84, '#ff9ec0', 2)
        }
        return
    }
    if (gs.mode === 'clear') {
        if (gs.bannerKind === 'rescue') {
            label(ctx, 'MARIAN SAVED!', 84, 76, '#ff9ec0', 2)
            label(ctx, 'THANKS, BILLY!', 108, 108, '#fff', 1)
            label(ctx, 'BONUS 1000', 118, 124, '#ffd98a', 1)
        } else {
            label(ctx, 'STAGE CLEAR!', 96, 78, '#ffd98a', 2)
            label(ctx, 'BONUS 500', 118, 106, '#fff', 1)
            label(ctx, 'TO THE HIDEOUT', 104, 122, '#ff9a7a', 1)
        }
    } else if (gs.mode === 'gameover') {
        label(ctx, 'GAME OVER', 104, 92, '#ff5a52', 2)
    } else if (gs.mode === 'play' && gs.stage === 2) {
        if (gs.banner > 0 && (gs.banner > 20 || gs.banner % 6 < 4)) {
            label(ctx, 'STAGE 2', 116, 78, '#ff9a7a', 2)
            label(ctx, 'THE HIDEOUT', 102, 108, '#fff', 1)
        } else if (gs.duelIntro > 0) {
            // #2825 item 4: the boss wave announces itself before the exchange
            label(ctx, 'WILLIAMS', 112 + (gs.duelIntro % 8 < 4 ? 0 : 1), 78, '#ff5a52', 2)
            label(ctx, 'THE LIEUTENANT', 96, 108, '#fff', 1)
        } else if (rescueReady(gs) && gs.tick % 40 < 28) {
            label(ctx, 'CUT HER LOOSE!', 96, 84, '#ff9ec0', 1)
        }
    }
}

// attract headline cycle — one message at a time (ART.md law)
export function drawAttract(ctx, phase, tick) {
    const msgs = [
        ['DOUBLE DRAGON', '#c8302f', 2],
        ['BLUE DRAGON: JIMMY LEE', '#2f5fd0', 1],
        ['2 AGAINST THE WALL', '#fff', 1],
        ['WALNUTS STREET', '#ffd98a', 1],
        ['THE HIDEOUT', '#ff9a7a', 1],
        ['KNIFE  WHIP  BARRELS', '#e8c87a', 1],
        ['RESCUE MARIAN', '#ff9ec0', 1],
        ['PUNCH  KICK  JUMP', '#8fd0ff', 1],
    ]
    const [s, col, sc] = msgs[phase % msgs.length]
    const w = textWidth(s, sc)
    const y = phase === 0 ? 54 : 78
    if (tick % 40 < 30) label(ctx, s, Math.round((W - w) / 2), y, col, sc)
    // shell branding sits low-center; the coin-op invite stays above it
    label(ctx, 'PRESS ANY KEY', Math.round((W - textWidth('PRESS ANY KEY', 1)) / 2), 118, Math.floor(tick / 24) % 2 ? '#fff' : '#9fb3e8', 1)
    // #2874: and the invite finally says WHICH keys — permanent, quiet blue,
    // never flashing (one-message law: the headline still owns the flicker).
    label(ctx, TIP, Math.round((W - textWidth(TIP, 1)) / 2), 134, '#4a6db8', 1)
}
