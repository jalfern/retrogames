// JOUST — runtime art. Every sprite (riders, eggs, troll hand, stone, lava,
// sky) is drawn in code, Williams-arcade palette, no assets.

export const PAL = {
    p1: { knight: '#38b8f8', plume: '#f8f8f8', mount: '#b858f8', wing: '#8828c8', beak: '#f8d800' },
    p2: { knight: '#58f878', plume: '#f8f8f8', mount: '#28a858', wing: '#187838', beak: '#f8d800' },
    bounder: { knight: '#f83800', plume: '#f8d800', mount: '#f8a800', wing: '#c06800', beak: '#f8f8f8' },
    hunter: { knight: '#f8d800', plume: '#f83800', mount: '#a85800', wing: '#783800', beak: '#f8f8f8' },
    shadow: { knight: '#181818', plume: '#a800cc', mount: '#282850', wing: '#141430', beak: '#a8a8a8' },
}

const SPR = new Map()

function sprite(key, w, h, draw) {
    if (SPR.has(key)) return SPR.get(key)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = false
    draw(g, w, h)
    SPR.set(key, c)
    return c
}

const px = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h) }

// A rider, origin at the mount's centre. Wings vary by flap frame (0 up,
// 1 mid/glide, 2 down). Lance held upright — the jousting weapon.
export function riderSprite(kind, frame) {
    const p = PAL[kind] || PAL.p1
    return sprite(`rider-${kind}-${frame}`, 40, 44, (g, w, h) => {
        const cx = w / 2
        const cy = h / 2 + 8
        // wings
        const wy = frame === 0 ? -8 : frame === 2 ? 4 : -1
        px(g, cx - 17, cy - 2 + wy * 0.6, 8, 3, p.wing)
        px(g, cx + 9, cy - 2 + wy * 0.6, 8, 3, p.wing)
        px(g, cx - 13, cy + wy * 0.9, 6, 3, p.wing)
        px(g, cx + 7, cy + wy * 0.9, 6, 3, p.wing)
        px(g, cx - 15, cy - 1 + wy * 0.75, 4, 3, p.wing)
        px(g, cx + 11, cy - 1 + wy * 0.75, 4, 3, p.wing)
        // mount body
        px(g, cx - 9, cy - 3, 18, 6, p.mount)
        px(g, cx - 7, cy - 4, 14, 1, p.mount)
        px(g, cx - 9, cy + 3, 18, 1, p.wing)
        // head + beak (faces travel dir; index.jsx mirrors)
        px(g, cx + 8, cy - 4, 4, 4, p.mount)
        px(g, cx + 12, cy - 3, 3, 2, p.beak)
        px(g, cx + 9, cy - 3, 1, 1, '#000000')
        // legs / feet
        px(g, cx - 5, cy + 3, 2, 3, p.wing)
        px(g, cx + 3, cy + 3, 2, 3, p.wing)
        // knight torso
        px(g, cx - 3, cy - 12, 6, 8, p.knight)
        px(g, cx - 4, cy - 10, 2, 5, p.knight)
        px(g, cx + 2, cy - 10, 2, 5, p.knight)
        // helmet + visor + plume
        px(g, cx - 2, cy - 16, 5, 4, '#c8c8d8')
        px(g, cx + 1, cy - 15, 2, 2, '#101018')
        px(g, cx - 2, cy - 18, 1, 3, p.plume)
        px(g, cx - 3, cy - 19, 2, 2, p.plume)
        // lance, held high: shaft + tip  (tip ~26 px above centre)
        px(g, cx + 3, cy - 26, 1, 16, '#e0d8c0')
        px(g, cx + 2, cy - 30, 3, 4, '#f8f8f8')
        px(g, cx + 3, cy - 31, 1, 2, '#f8f8f8')
    })
}

export function eggSprite(kind, cracked) {
    const col = kind === 'bounder' ? '#58d8f8' : kind === 'hunter' ? '#f8b800' : '#a058f8'
    const dark = kind === 'bounder' ? '#2088a8' : kind === 'hunter' ? '#a86800' : '#6018a0'
    return sprite(`egg-${kind}-${cracked ? 1 : 0}`, 12, 14, (g) => {
        px(g, 3, 1, 6, 1, col)
        px(g, 2, 2, 8, 8, col)
        px(g, 1, 3, 10, 6, col)
        px(g, 3, 10, 6, 2, dark)
        px(g, 2, 4, 2, 4, dark)
        px(g, 4, 3, 2, 2, '#f8f8f8')
        if (cracked) {
            px(g, 5, 2, 1, 3, '#101010')
            px(g, 6, 5, 1, 2, '#101010')
            px(g, 4, 6, 1, 2, '#101010')
            px(g, 6, 7, 2, 1, '#101010')
        }
    })
}

export function handSprite() {
    return sprite('hand', 20, 34, (g) => {
        const g1 = '#b8b8c8'
        const g2 = '#787888'
        px(g, 7, 12, 6, 22, g1)
        px(g, 7, 12, 2, 22, g2)
        // three fingers
        px(g, 3, 4, 3, 10, g1)
        px(g, 8, 2, 3, 12, g1)
        px(g, 13, 5, 3, 9, g1)
        px(g, 3, 4, 1, 10, g2)
        px(g, 8, 2, 1, 12, g2)
        px(g, 13, 5, 1, 9, g2)
        px(g, 3, 3, 3, 2, g1)
        px(g, 8, 1, 3, 2, g1)
        px(g, 13, 4, 3, 2, g1)
        px(g, 2, 12, 15, 4, g2)
    })
}

// Stone slab: 8px brick with mortar, highlight cap, speckle. Cracked variant
// for ledges that will not forgive a second visit.
export function stoneTile(cracked, warm = 0) {
    return sprite(`stone-${cracked ? 1 : 0}-${warm}`, 16, 8, (g) => {
        const base = warm ? '#6c5848' : '#58606c'
        const lite = warm ? '#b09878' : '#a0b0c0'
        px(g, 0, 0, 16, 8, base)
        px(g, 0, 0, 16, 2, lite)
        px(g, 0, 7, 16, 1, '#28303c')
        px(g, 7, 2, 1, 5, '#303840')
        px(g, 0, 4, 16, 1, '#404854')
        px(g, 3, 3, 1, 1, lite)
        px(g, 11, 5, 2, 1, '#38404c')
        if (cracked) {
            px(g, 4, 2, 1, 3, '#181c22')
            px(g, 5, 5, 1, 2, '#181c22')
            px(g, 10, 1, 1, 4, '#181c22')
            px(g, 11, 4, 2, 1, '#181c22')
        }
        if (warm > 0) {
            px(g, 0, 6, 16, 1, `rgba(248,120,0,${0.25 * warm})`)
        }
    })
}

const FONT = {
    '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
    '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'],
    '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'],
    '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
    A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
    C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'],
    E: ['111', '100', '111', '100', '111'], F: ['111', '100', '111', '100', '100'],
    G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
    I: ['111', '010', '010', '010', '111'], J: ['001', '001', '001', '101', '010'],
    K: ['101', '110', '100', '110', '101'], L: ['100', '100', '100', '100', '111'],
    M: ['101', '111', '111', '101', '101'], N: ['101', '111', '111', '111', '101'],
    O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
    Q: ['010', '101', '101', '110', '011'], R: ['110', '101', '110', '110', '101'],
    S: ['011', '000', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
    U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'],
    W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
    Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
    '-': ['000', '000', '111', '000', '000'], ':': ['000', '010', '000', '010', '000'],
    '.': ['000', '000', '000', '000', '010'], '!': ['010', '010', '010', '000', '010'],
    ' ': ['000', '000', '000', '000', '000'], '?': ['110', '001', '010', '000', '010'],
}

export function text5(ctx, str, x, y, color = '#fff', scale = 1) {
    ctx.fillStyle = color
    let cx = x
    for (const ch of String(str).toUpperCase()) {
        const glyph = FONT[ch] || FONT[' ']
        for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 3; c++) {
                if (glyph[r][c] === '1') ctx.fillRect(cx + c * scale, y + r * scale, scale, scale)
            }
        }
        cx += 4 * scale
    }
    return cx
}

export function textWidth(str, scale = 1) {
    return String(str).length * 4 * scale - scale
}

// deterministic starfield: fixed positions, gentle twinkle
const STARS = []
{
    let s = 20261013
    for (let i = 0; i < 42; i++) {
        s = (s * 1103515245 + 12345) >>> 0
        const x = (s >>> 8) % 256
        s = (s * 1103515245 + 12345) >>> 0
        const y = (s >>> 8) % 110
        s = (s * 1103515245 + 12345) >>> 0
        STARS.push([x, y + 4, s >>> 31])
    }
}

export function paintSky(ctx, W, H, groundY, t) {
    const grd = ctx.createLinearGradient(0, 0, 0, groundY)
    grd.addColorStop(0, '#101038')
    grd.addColorStop(0.55, '#282868')
    grd.addColorStop(1, '#503878')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, W, groundY)
    for (const [x, y, b] of STARS) {
        const on = ((t >> 5) + x + y) % 7 !== 0
        if (on) px(ctx, x, y, 1, 1, b ? '#f8f8f8' : '#a0a0c8')
    }
    // distant mountain silhouettes, two ridges
    ctx.fillStyle = '#1c1c48'
    ctx.beginPath()
    ctx.moveTo(0, groundY)
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, groundY - 14 - Math.abs(((x * 7919) % 37) - 18) * 0.8)
    ctx.lineTo(W, groundY)
    ctx.fill()
    ctx.fillStyle = '#251c50'
    ctx.beginPath()
    ctx.moveTo(0, groundY)
    for (let x = 0; x <= W; x += 12) ctx.lineTo(x, groundY - 6 - Math.abs(((x * 104729) % 23) - 11) * 0.6)
    ctx.lineTo(W, groundY)
    ctx.fill()
}

export function paintLava(ctx, x0, x1, top, H, t) {
    const grd = ctx.createLinearGradient(0, top, 0, H)
    grd.addColorStop(0, '#f8a800')
    grd.addColorStop(0.35, '#f83800')
    grd.addColorStop(1, '#601000')
    ctx.fillStyle = grd
    ctx.fillRect(x0, top, x1 - x0, H - top)
    // flicker crust
    for (let x = x0; x < x1; x += 6) {
        const ph = ((x * 31 + t) >> 3) % 5
        if (ph === 0) px(ctx, x, top + 1 + ((x + t >> 4) % 3) * 2, 4, 1, '#f8e000')
        else if (ph === 3) px(ctx, x + 2, top + 4 + ((x * 7 + t >> 5) % 4) * 2, 3, 1, '#a02000')
    }
    px(ctx, x0, top, x1 - x0, 1, '#f8f800')
}

// tiny knight glyph for the lives row
export function lifeGlyph(ctx, x, y, col) {
    px(ctx, x, y + 2, 7, 3, col)
    px(ctx, x + 2, y, 3, 2, '#c8c8d8')
    px(ctx, x - 2, y + 3, 2, 1, col)
    px(ctx, x + 7, y + 3, 2, 1, col)
}
