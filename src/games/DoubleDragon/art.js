// art.js — DOUBLE DRAGON S1 look, designed from the 1987 Technōs cabinet:
// night suburb, chain-link and hedges, asphalt with grain, chunky pixel
// brawlers. Everything generated in code; no borrowed sprites. The original's
// palette at a glance: sodium-lamp blue-black night, Billy's red headband and
// white gi, Williams' green cap, Amon's brown vest, Abobo's slab of charcoal.

import { W, H, DEEP_TOP, DEEP_BOT } from './sim.js'

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

export function drawBackground(ctx, camX, _tick) {
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

export function drawProp(ctx, p, camX) {
    const sx = Math.round(p.x - camX)
    if (sx < -30 || sx > W + 30) return
    if (p.kind === 'bin') {
        ctx.fillStyle = '#31404e'
        ctx.fillRect(sx - 7, p.y - 16, 14, 16)
        ctx.fillStyle = '#243240'
        ctx.fillRect(sx - 8, p.y - 18, 16, 3)
        ctx.fillStyle = '#1a242f'
        ctx.fillRect(sx - 5, p.y - 12, 10, 2)
    } else {
        ctx.fillStyle = '#7a2a2a'
        ctx.fillRect(sx - 3, p.y - 12, 6, 12)
        ctx.fillRect(sx - 5, p.y - 14, 10, 3)
        ctx.fillStyle = '#953636'
        ctx.fillRect(sx - 4, p.y - 9, 8, 2)
    }
}

export function drawShadow(ctx, x, y, w = 16, a = 0.35) {
    ctx.fillStyle = `rgba(0,0,0,${a})`
    ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), w / 2, 3, 0, 0, Math.PI * 2); ctx.fill()
}

// ------------------------------------------------------------- the fighters ---
const SKIN = '#d8a06a', SKIN_D = '#b57d46'
const CFG = { punchOn: 4, kickOn: 6 }
const PAL = {
    billy: { head: '#e8e8ec', body: '#dcdce4', trim: '#c8302f', legs: '#dcdce4', shoes: '#5a3a24', band: '#c8302f' },
    williams: { head: '#d8d8dc', body: '#2f8f74', trim: '#1d6b52', legs: '#3a3f52', shoes: '#22262f', band: '#2f8f74' },
    amon: { head: '#8a5a34', body: '#8a5a34', trim: '#5f3d22', legs: '#2c2f3c', shoes: '#1c1e26', band: null },
    abobo: { head: '#6a4a2c', body: '#2e3138', trim: '#1c1e24', legs: '#17191f', shoes: '#0e0f13', band: null },
}

// generic pixel fighter. pose: idle|walk|jump|punch|kick|spin|windup|attack|
// hurt|down|getup|grab|grabbed|dying ; t = anim tick; s = scale (abobo 1.3)
function fighter(ctx, sx, sy, face, pose, t, pal, s = 1) {
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
    const hx = sway + (pose === 'charge' ? 3 : 0) // lean: shoulders lead the body-check
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
    if (pal === PAL.billy) { R(-4 + hx, -30 + bob, 8, 2, pal.band); R(-7 + hx, -29 + bob, 3, 2, pal.band) } // headband + tail
    if (pal === PAL.williams) { R(-5 + hx, -31 + bob, 10, 3, pal.band); R(2 + hx, -30 + bob, 4, 2, '#1d6b52') } // cap + brim
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
    } else if (pose === 'hurt') {
        R(-7, -20 + bob, 3, 8, SKIN); R(4, -18 + bob, 3, 6, SKIN)
    } else {
        R(3 + sway, -20 + bob, 3, 8, SKIN)                  // guard stance (arms counter-swing on the walk)
        R(-6 - sway, -19 + bob, 3, 7, SKIN)
    }
    ctx.restore()
}

export function drawBilly(ctx, b, camX) {
    const sx = Math.round(b.x - camX)
    const sy = Math.round(b.y)
    if (sx < -40 || sx > W + 40) return
    const inv = b.inv > 0 && b.state !== 'dying'
    if (inv && Math.floor(b.inv / 4) % 2 === 0) return
    let pose = 'idle'
    if (b.state === 'walk') pose = 'walk'
    else if (b.state === 'jump') pose = 'jump'
    else if (b.state === 'punch') pose = b.stateT >= CFG.punchOn ? 'punch' : 'windup'
    else if (b.state === 'kick') pose = b.stateT >= CFG.kickOn ? 'kick' : 'windup'
    else if (b.state === 'spin') pose = 'spin'
    else if (b.state === 'grabbed') pose = 'grabbed'
    else if (b.state === 'dying') pose = 'dying'
    drawShadow(ctx, sx, sy + 1, 14, 0.35 - b.z * 0.02)
    const lift = Math.round(b.z)
    if (b.state === 'dying') {
        if (b.stateT > 26) return
        if (b.stateT > 16) ctx.globalAlpha = 1 - (b.stateT - 16) / 10
    }
    fighter(ctx, sx, sy - lift, b.face, pose, b.anim, PAL.billy)
    if (b.weapon === 'stick') {
        ctx.fillStyle = '#8a6a3c'
        const stickAt = pose === 'punch' || pose === 'attack' ? 16 : pose === 'spin' ? 12 : 7
        ctx.fillRect(sx + (pose === 'windup' ? -12 : stickAt * b.face), sy - lift - 21, 9 * b.face, 2)
    }
    ctx.globalAlpha = 1
}

export function drawEnemy(ctx, e, camX) {
    const sx = Math.round(e.x - camX)
    if (sx < -50 || sx > W + 50) return
    const sy = Math.round(e.y)
    const def = { williams: 1, amon: 1.12, abobo: 1.38 }[e.kind]
    let pose = 'walk'
    if (e.state === 'idle') pose = 'idle'
    else if (e.state === 'windup') pose = 'windup'
    else if (e.state === 'attack') pose = 'attack'
    else if (e.state === 'stagger') pose = 'hurt'
    else if (e.state === 'down') pose = 'down'
    else if (e.state === 'dying') pose = 'dying'
    else if (e.state === 'getup') pose = 'getup'
    else if (e.state === 'grab') pose = 'grab'
    else if (e.state === 'chargewind') pose = 'windup'
    else if (e.state === 'charge') pose = 'charge'
    if ((e.state === 'getup') && Math.floor(e.inv / 3) % 2 === 0) return
    drawShadow(ctx, sx, sy + 1, 14 * def, 0.35)
    if (e.state === 'dying') {
        if (e.stateT > 30) return
        ctx.globalAlpha = 1 - e.stateT / 30
    }
    fighter(ctx, sx, sy, e.face, pose === 'getup' ? 'jump' : pose, e.anim, PAL[e.kind], def)
    if (e.hasStick) {
        ctx.fillStyle = '#8a6a3c'
        ctx.fillRect(sx + (pose === 'attack' ? 16 : pose === 'windup' ? -12 : 8) * e.face, sy - 22 * def, 10 * e.face, 2)
    }
    ctx.globalAlpha = 1
}

export function drawPickup(ctx, p, camX) {
    const sx = Math.round(p.x - camX)
    if (sx < -20 || sx > W + 20) return
    const bobY = Math.round(Math.sin(p.bob / 9) * 2)
    drawShadow(ctx, sx, Math.round(p.y) + 1, 12, 0.3)
    ctx.fillStyle = '#b58a4a'
    ctx.fillRect(sx - 6, Math.round(p.y) - 10 + bobY, 12, 2)
    ctx.fillStyle = '#e8c87a'
    ctx.fillRect(sx - 6, Math.round(p.y) - 10 + bobY, 4, 2)
}

// ------------------------------------------------------------------- HUD ---
export function drawHud(ctx, gs) {
    ctx.fillStyle = 'rgba(4,6,14,0.72)'
    ctx.fillRect(0, 0, W, 17)
    // the app chrome wears the top-left corner (ARCADE badge + FEEDBACK); the
    // cabinet reads one line below it, and lives sit clear of the sound chip
    label(ctx, '1UP', 78, 6, '#ff5a52', 1)
    label(ctx, String(gs.score).padStart(6, '0'), 102, 6, '#fff', 1)
    label(ctx, 'HI', 150, 6, '#ffd98a', 1)
    label(ctx, String(Math.max(gs.hi, gs.score)).padStart(6, '0'), 166, 6, '#fff', 1)
    // lives as headbands
    for (let i = 0; i < gs.billy.lives; i++) {
        ctx.fillStyle = '#c8302f'
        ctx.fillRect(222 + i * 12, 8, 8, 3)
        ctx.fillStyle = '#e8e8ec'
        ctx.fillRect(222 + i * 12 + 2, 5, 4, 3)
    }
    if (gs.billy.weapon === 'stick') label(ctx, 'STICK', 78, 11, '#e8c87a', 1)
    // #2810 item 6: wave ticks where the cabinet shows the stage number — the
    // current wave blinks before it starts, fills gold once it is live/cleared
    for (let i = 0; i < 3; i++) {
        const live = i < gs.waveIdx || (i === gs.waveIdx && gs.waveActive)
        ctx.fillStyle = live ? '#ffd98a' : (i === gs.waveIdx && gs.tick % 30 < 18 ? '#8a7333' : '#3a3f52')
        ctx.fillRect(102 + i * 6, 19, 4, 3)
    }
    // score delta floats under the HUD on each KO/pickup, arcade-style
    if (gs.scoreFlash && gs.scoreFlash.t % 8 < 6) {
        const s = '+' + gs.scoreFlash.v
        label(ctx, s, Math.round((W - textWidth(s, 1)) / 2), 26, '#ffd93c', 1)
    }
}

// wave / banner one-message-at-a-time overlays (never over the HUD)
export function drawBanner(ctx, gs) {
    if (gs.mode === 'clear') {
        label(ctx, 'STAGE CLEAR!', 96, 84, '#ffd98a', 2)
        label(ctx, 'BONUS 500', 118, 112, '#fff', 1)
    } else if (gs.mode === 'gameover') {
        label(ctx, 'GAME OVER', 104, 92, '#ff5a52', 2)
    }
}

// attract headline cycle — one message at a time (ART.md law)
export function drawAttract(ctx, phase, tick) {
    const msgs = [
        ['DOUBLE DRAGON', '#c8302f', 2],
        ['2 AGAINST THE WALL', '#fff', 1],
        ['WALNUTS STREET', '#ffd98a', 1],
        ['PUNCH  KICK  JUMP', '#8fd0ff', 1],
    ]
    const [s, col, sc] = msgs[phase % msgs.length]
    const w = textWidth(s, sc)
    const y = phase === 0 ? 54 : 78
    if (tick % 40 < 30) label(ctx, s, Math.round((W - w) / 2), y, col, sc)
    // shell branding sits low-center; the coin-op invite stays above it
    label(ctx, 'PRESS ANY KEY', Math.round((W - textWidth('PRESS ANY KEY', 1)) / 2), 118, Math.floor(tick / 24) % 2 ? '#fff' : '#9fb3e8', 1)
}
