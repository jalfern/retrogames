// BLOB BATTLE — look, generated at runtime. The cabinet's identity: glossy
// enamel orbs with a specular dot, a midnight-indigo stage with a dithered
// glow, chrome well walls, and a chunky 3x5 house font. Nothing here is
// borrowed from another title's art.js.

const W = 368, H = 240
export const CANVAS = { W, H }

export const PALETTE = {
    bg: '#0c0c22',
    bgGlow: '#1b1440',
    wall: '#8f9bc4',
    wallDark: '#3c4468',
    ink: '#f2f6ff',
    dim: '#7d86ad',
    good: '#4dff9a',
    bad: '#ff4d6d',
    gold: '#ffd23c',
}

const ORB_COLORS = {
    1: { hi: '#ff8ab4', mid: '#ff2d78', lo: '#8f0a3c' },
    2: { hi: '#9df6ff', mid: '#22d3ee', lo: '#0a5f78' },
    3: { hi: '#c4ff9e', mid: '#54d42e', lo: '#1d6410' },
    4: { hi: '#ffe89a', mid: '#ffc32d', lo: '#8a5c06' },
    5: { hi: '#9aa4bd', mid: '#5a6478', lo: '#2c3346' },
}

const cache = new Map()

export function orbSprite(size) {
    const key = 'orb' + size
    if (cache.has(key)) return cache.get(key)
    const out = {}
    for (const id of [1, 2, 3, 4, 5]) {
        const c = document.createElement('canvas')
        c.width = size
        c.height = size
        const g = c.getContext('2d')
        const p = ORB_COLORS[id]
        const r = size / 2
        const grd = g.createRadialGradient(r * 0.68, r * 0.6, size * 0.1, r, r, r * 1.05)
        grd.addColorStop(0, p.hi)
        grd.addColorStop(0.45, p.mid)
        grd.addColorStop(1, p.lo)
        g.fillStyle = grd
        g.beginPath()
        g.arc(r, r, r - 0.5, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = 'rgba(0,0,0,0.55)'
        g.stroke()
        // specular dot — the enamel shine that makes these read as orbs
        g.fillStyle = 'rgba(255,255,255,0.85)'
        g.beginPath()
        g.arc(size * 0.32, size * 0.3, Math.max(1, size * 0.12), 0, Math.PI * 2)
        g.fill()
        if (id === 5) {
            // garbage: riveted slab — a flat dark band with two bolts
            g.fillStyle = 'rgba(0,0,0,0.35)'
            g.fillRect(2, size * 0.62, size - 4, 2)
            g.fillStyle = 'rgba(255,255,255,0.25)'
            g.fillRect(3, 3, 2, 2)
            g.fillRect(size - 5, 3, 2, 2)
        }
        out[id] = c
    }
    cache.set(key, out)
    return out
}

// the champion (#863): a gold glossy orb wearing a three-point crown — the
// crowned winner on the win-screen podium. The canvas is taller than the orb so
// the crown clears the head. Cached by size like orbSprite.
export function championOrb(size) {
    const key = 'champ' + size
    if (cache.has(key)) return cache.get(key)
    const c = document.createElement('canvas')
    const h = Math.ceil(size * 1.32)
    c.width = size
    c.height = h
    const g = c.getContext('2d')
    const cx = size / 2
    const r = size / 2
    const cy = h - r // orb sits at the bottom, crown above
    const grd = g.createRadialGradient(cx - r * 0.32, cy - r * 0.3, size * 0.08, cx, cy, r * 1.04)
    grd.addColorStop(0, '#fff3c8')
    grd.addColorStop(0.45, PALETTE.gold)
    grd.addColorStop(1, '#7a4e05')
    g.fillStyle = grd
    g.beginPath()
    g.arc(cx, cy, r - 0.5, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(0,0,0,0.5)'
    g.lineWidth = 1
    g.stroke()
    // specular dot
    g.fillStyle = 'rgba(255,255,255,0.9)'
    g.beginPath()
    g.arc(size * 0.34, cy - r * 0.35, Math.max(1, size * 0.12), 0, Math.PI * 2)
    g.fill()
    // crown: a gold band + three points with bright tips, resting on the orb
    const baseY = cy - r + 1
    const cw = r * 1.5
    g.fillStyle = PALETTE.gold
    g.fillRect(cx - cw / 2, baseY - 3, cw, 3)
    for (const dx of [-cw / 2, 0, cw / 2]) {
        g.beginPath()
        g.moveTo(cx + dx - r * 0.3, baseY - 2)
        g.lineTo(cx + dx, baseY - size * 0.22)
        g.lineTo(cx + dx + r * 0.3, baseY - 2)
        g.closePath()
        g.fill()
    }
    g.fillStyle = '#ffffff'
    for (const dx of [-cw / 2, 0, cw / 2]) g.fillRect(cx + dx - 1, baseY - size * 0.22, 2, 2)
    cache.set(key, c)
    return c
}

// ---- 3x5 house font ---------------------------------------------------------
const FONT = {
    ' ': ['...', '...', '...', '...', '...'],
    A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
    B: ['XX.', 'X.X', 'XX.', 'X.X', 'XX.'],
    C: ['.XX', 'X..', 'X..', 'X..', '.XX'],
    D: ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'],
    E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
    F: ['XXX', 'X..', 'XX.', 'X..', 'X..'],
    G: ['.XX', 'X..', 'X.X', 'X.X', '.XX'],
    H: ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'],
    I: ['XXX', '.X.', '.X.', '.X.', 'XXX'],
    J: ['..X', '..X', '..X', 'X.X', '.X.'],
    K: ['X.X', 'X.X', 'XX.', 'X.X', 'X.X'],
    L: ['X..', 'X..', 'X..', 'X..', 'XXX'],
    M: ['X.X', 'XXX', 'XXX', 'X.X', 'X.X'],
    N: ['X.X', 'XX.', 'X.X', '.XX', 'X.X'],
    O: ['.X.', 'X.X', 'X.X', 'X.X', '.X.'],
    P: ['XX.', 'X.X', 'XX.', 'X..', 'X..'],
    Q: ['.X.', 'X.X', 'X.X', 'XX.', '.XX'],
    R: ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'],
    S: ['.XX', 'X..', '.X.', '..X', 'XX.'],
    T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
    U: ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'],
    V: ['X.X', 'X.X', 'X.X', 'X.X', '.X.'],
    W: ['X.X', 'X.X', 'XXX', 'XXX', 'X.X'],
    X: ['X.X', 'X.X', '.X.', 'X.X', 'X.X'],
    Y: ['X.X', 'X.X', '.X.', '.X.', '.X.'],
    Z: ['XXX', '..X', '.X.', 'X..', 'XXX'],
    0: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
    1: ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
    2: ['XX.', '..X', '.X.', 'X..', 'XXX'],
    3: ['XX.', '..X', '.X.', '..X', 'XX.'],
    4: ['X.X', 'X.X', 'XXX', '..X', '..X'],
    5: ['XXX', 'X..', 'XX.', '..X', 'XX.'],
    6: ['.XX', 'X..', 'XX.', 'X.X', '.X.'],
    7: ['XXX', '..X', '.X.', '.X.', '.X.'],
    8: ['.X.', 'X.X', '.X.', 'X.X', '.X.'],
    9: ['.X.', 'X.X', '.XX', '..X', '.X.'],
    ':': ['...', '.X.', '...', '.X.', '...'],
    '!': ['.X.', '.X.', '.X.', '...', '.X.'],
    '.': ['...', '...', '...', '...', '.X.'],
    '-': ['...', '...', 'XXX', '...', '...'],
    '/': ['..X', '..X', '.X.', 'X..', 'X..'],
    '?': ['XX.', '..X', '.X.', '...', '.X.'],
    '>': ['X..', '.X.', '..X', '.X.', 'X..'],
    '<': ['..X', '.X.', 'X..', '.X.', '..X'],
}

export function textWidth(str, scale = 1) {
    return String(str).length * 4 * scale - scale
}

export function text(ctx, str, x, y, color, scale = 1) {
    ctx.fillStyle = color
    for (let i = 0; i < String(str).length; i++) {
        const g = FONT[String(str)[i]] || FONT['?']
        for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 3; c++) {
                if (g[r][c] === 'X') ctx.fillRect(x + (i * 4 + c) * scale, y + r * scale, scale, scale)
            }
        }
    }
}

// ---- stage ------------------------------------------------------------------
let stageCache = null

export function stage() {
    if (stageCache) return stageCache
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')
    const grd = g.createLinearGradient(0, 0, 0, H)
    grd.addColorStop(0, PALETTE.bgGlow)
    grd.addColorStop(0.6, PALETTE.bg)
    grd.addColorStop(1, '#060614')
    g.fillStyle = grd
    g.fillRect(0, 0, W, H)
    // dithered horizon glow under the playfield
    for (let y = 0; y < 40; y++) {
        const a = (1 - y / 40) * 0.12
        g.fillStyle = `rgba(120,80,255,${a.toFixed(3)})`
        for (let x = 0; x < W; x += (y % 2 ? 4 : 2)) g.fillRect(x, H - 40 + y, y % 2 ? 2 : 1, 1)
    }
    // sparse hard stars
    let s = 0x5eed1e
    for (let i = 0; i < 70; i++) {
        s = (s * 1103515245 + 12345) >>> 0
        const x = s % W
        s = (s * 1103515245 + 12345) >>> 0
        const y = (s % (H - 30))
        g.fillStyle = i % 3 ? 'rgba(200,210,255,0.35)' : 'rgba(255,240,180,0.8)'
        g.fillRect(x, y, 1, 1)
    }
    stageCache = c
    return c
}

export function wellFrame(ctx, x, y, cols, rows, cell) {
    ctx.fillStyle = 'rgba(4,4,16,0.9)'
    ctx.fillRect(x - 3, y - 3, cols * cell + 6, rows * cell + 6)
    ctx.strokeStyle = PALETTE.wallDark
    ctx.lineWidth = 2
    ctx.strokeRect(x - 4, y - 4, cols * cell + 8, rows * cell + 8)
    ctx.strokeStyle = PALETTE.wall
    ctx.lineWidth = 1
    ctx.strokeRect(x - 1.5, y - 1.5, cols * cell + 3, rows * cell + 3)
}
