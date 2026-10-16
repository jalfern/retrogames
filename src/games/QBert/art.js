// Q*BERT — runtime art. Every cube, creature and glyph is drawn in code,
// Gottlieb-arcade palette, no assets.

export const PAL = {
    side1: '#f8a800', side2: '#c05800', rim: '#f8f858',
    green: '#00d800', greenDark: '#009000',
    blue: '#2858c8', orange: '#f88000',
    cycle: ['#2038d8', '#00c000', '#f8d800', '#f83800', '#a828c8'],
    bert: '#f88000', bertDark: '#c05000', bertFoot: '#f8d800',
    coily: '#00c850', coilyDark: '#008838', coilyBelly: '#f8e878',
    ball: '#f83800', discA: '#3858f8', discB: '#f8f8f8',
    ugg: '#58d8f8', wrongway: '#f85858', slick: '#202870',
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

// cube top half-w / half-h for the iso diamond
export const HW = 15, HH = 8

// top color for a cube state: mode1 -> checker(0) or green(1); mode2 -> cycle
export function cubeTopCol(mode, color, checker) {
    if (mode === 1) return color === 1 ? PAL.green : (checker ? PAL.blue : PAL.orange)
    return PAL.cycle[color % PAL.cycle.length]
}
export function cubeDarkCol(mode, color, checker) {
    if (mode === 1) return color === 1 ? PAL.greenDark : (checker ? '#1838a0' : '#c05800')
    const c = PAL.cycle[color % PAL.cycle.length]
    return shade(c, 0.62)
}

function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16)
    const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k)
    return `rgb(${r},${g},${b})`
}

// one iso cube: diamond top + two side faces. Keyed by look, cached.
export function cubeSprite(topCol, darkCol) {
    const key = `cube-${topCol}-${darkCol}`
    return sprite(key, HW * 2, HH * 2 + 10, (g) => {
        // sides
        g.fillStyle = PAL.side1
        g.beginPath()
        g.moveTo(0, HH); g.lineTo(HW, HH * 2); g.lineTo(HW, HH * 2 + 10); g.lineTo(0, HH + 10)
        g.closePath(); g.fill()
        g.fillStyle = PAL.side2
        g.beginPath()
        g.moveTo(HW * 2, HH); g.lineTo(HW, HH * 2); g.lineTo(HW, HH * 2 + 10); g.lineTo(HW * 2, HH + 10)
        g.closePath(); g.fill()
        px(g, HW - 1, HH * 2, 1, 10, shade(PAL.side2, 0.75))
        // top diamond
        g.fillStyle = topCol
        g.beginPath()
        g.moveTo(HW, 0); g.lineTo(HW * 2, HH); g.lineTo(HW, HH * 2); g.lineTo(0, HH)
        g.closePath(); g.fill()
        px(g, HW - 6, HH - 2, 8, 1, shade(topCol, 1.35))
        // rim
        g.strokeStyle = PAL.rim
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(HW + 0.5, 0.5); g.lineTo(HW * 2 - 0.5, HH + 0.5); g.lineTo(HW + 0.5, HH * 2 + 0.5); g.lineTo(0.5, HH + 0.5)
        g.closePath(); g.stroke()
    })
}

export const CUBE_W = HW * 2
export const CUBE_TOP_H = HH * 2

// Q*BERT. pose: 0 idle, 1 hop-up, 2 hop-down, 3 dying
export function bertSprite(pose, facing) {
    return sprite(`bert-${pose}-${facing}`, 18, 20, (g) => {
        const b = PAL.bert, d = PAL.bertDark
        const footY = pose === 1 ? 15 : pose === 2 ? 17 : 18
        // big hind feet
        px(g, 1, footY, 6, 3, PAL.bertFoot)
        px(g, 11, footY, 6, 3, PAL.bertFoot)
        if (pose === 1) { px(g, 2, footY + 2, 5, 1, shade(PAL.bertFoot, 0.7)); px(g, 11, footY + 2, 5, 1, shade(PAL.bertFoot, 0.7)) }
        // body
        px(g, 3, 8, 12, 10, b)
        px(g, 2, 10, 14, 6, b)
        px(g, 3, 16, 12, 2, d)
        // long snout (faces `facing`: 1 right, -1 left)
        const fx = facing > 0 ? 13 : -1
        px(g, fx < 0 ? 1 : 14, 10, 4, 3, b)
        px(g, fx < 0 ? 0 : 16, 11, 2, 2, b)
        // eyes on the stalk
        px(g, 5, 4, 3, 5, b)
        px(g, 10, 4, 3, 5, b)
        px(g, 4, 1, 4, 4, '#f8f8f8')
        px(g, 10, 1, 4, 4, '#f8f8f8')
        if (pose === 3) {
            px(g, 5, 2, 2, 1, '#101010'); px(g, 4, 2, 1, 1, '#101010'); px(g, 6, 2, 1, 1, '#101010')
            px(g, 11, 2, 2, 1, '#101010'); px(g, 10, 2, 1, 1, '#101010'); px(g, 12, 2, 1, 1, '#101010')
        } else {
            px(g, 5 + (facing > 0 ? 1 : 0), 2, 1, 2, '#101010')
            px(g, 11 + (facing > 0 ? 1 : 0) - 1, 2, 1, 2, '#101010')
        }
        // little arms
        px(g, 1, 12, 2, 3, d)
        px(g, 15, 12, 2, 3, d)
    })
}

// The red ball ricochets cube by cube down the edge. On each cube it compresses
// on impact (a squash) and springs back to round — the rubber-ball "boing" the
// old static 10x10 circle never had. ballScale is a PURE model of that per-cube
// bounce (no DOM, no Math.random), pinned in Node by qbertcheck exactly like the
// Coily coil and the spinning-disc models; ballSprite below is only the painter.
export const BALL_FRAMES = 8     // squash frames per cube (one full boing cycle)
export const BALL_R = 4.5        // the round ball's radius (the old 10x10 circle)
export const BALL_SQUASH = 0.5   // vertical scale at impact (the deepest flatten)
export const BALL_DECAY = 5.0    // how fast the boing damps back toward round
export const BALL_W = 22         // sprite box: wide enough for the impact flare
export const BALL_H = 18         // sprite box: tall enough for the rebound stretch
export const BALL_BOT = 15       // the surface line: the ball's rest bottom (sprite y)
export function ballScale(f) {
    // f in [0, BALL_FRAMES): one boing. p=0 is impact (the deepest squash); the
    // ball springs past round (a stretch) and damps back toward round before the
    // cube ahead, so the next impact starts a fresh squash. sx keeps the footprint.
    const p = f / BALL_FRAMES
    const sy = 1 + (BALL_SQUASH - 1) * Math.cos(p * Math.PI * 2) * Math.exp(-p * BALL_DECAY)
    return { sy, sx: 1 / sy }
}

// one boing frame of the ball: a bottom-anchored, rimmed ellipse that flattens
// wide on impact and stretches tall on the rebound. Its bottom stays on the
// surface line (BALL_BOT) so it reads as compressing AGAINST the cube it hits.
export function ballSprite(frame) {
    const f = ((frame % BALL_FRAMES) + BALL_FRAMES) % BALL_FRAMES
    const { sy, sx } = ballScale(f)
    return sprite(`ball-${f}`, BALL_W, BALL_H, (g) => {
        const cx = BALL_W / 2
        const ry = BALL_R * sy
        const rx = BALL_R * sx
        const cy = BALL_BOT - ry
        // rim: a touch darker and one px proud, so the ball has an edge
        g.fillStyle = shade(PAL.ball, 0.72)
        g.beginPath(); g.ellipse(cx, cy, rx + 1, ry + 1, 0, 0, Math.PI * 2); g.fill()
        // body
        g.fillStyle = PAL.ball
        g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill()
        // lit top cap: a paler, raised ellipse reads as the 3D sphere
        if (ry > 2) {
            g.fillStyle = '#f8a878'
            g.beginPath(); g.ellipse(cx - rx * 0.25, cy - ry * 0.4, Math.max(1, rx * 0.4), Math.max(1, ry * 0.35), 0, 0, Math.PI * 2); g.fill()
        }
    })
}

// The flying disc is a flat disc spinning about its vertical axis. Seen at the
// cabinet's shallow angle its projected width oscillates as it turns (broadside
// -> a thin edge-on sliver -> broadside); that oscillation is the "it is
// spinning" cue the old 26x8 bar of shifting dashes never had. discHalfW is a
// PURE model (no DOM, no Math.random) so qbertcheck pins it in Node exactly
// like the Coily coil model; discSprite below is only the painter.
export const DISC_FRAMES = 8
export const DISC_R = 14          // broadside half-width -> 28px across, larger than the old 26px bar
export const DISC_RY = 4          // the ellipse's vertical half (the shallow camera angle)
export const DISC_MINW = 2        // the edge-on floor, so the disc never fully vanishes
export function discHalfW(i) {
    return Math.max(DISC_MINW, DISC_R * Math.abs(Math.cos((i / DISC_FRAMES) * Math.PI * 2)))
}

// one spin frame of the disc: a rimmed, hubbed ellipse whose width is
// discHalfW(f) — full and lit when broadside, a thin spindle sliver edge-on.
export function discSprite(phase) {
    const f = ((phase % DISC_FRAMES) + DISC_FRAMES) % DISC_FRAMES
    return sprite(`disc-${f}`, DISC_R * 2, DISC_RY * 2 + 2, (g) => {
        const cx = DISC_R, cy = DISC_RY + 1
        const rx = Math.max(1, discHalfW(f))
        // rim: the disc's edge, a touch darker and one px proud
        g.fillStyle = shade(PAL.discA, 0.62)
        g.beginPath(); g.ellipse(cx, cy, rx, DISC_RY + 1, 0, 0, Math.PI * 2); g.fill()
        // body
        g.fillStyle = PAL.discA
        g.beginPath(); g.ellipse(cx, cy, rx, DISC_RY, 0, 0, Math.PI * 2); g.fill()
        // lit top face: a paler, slightly raised ellipse reads as the 3D top
        if (rx > 2) {
            g.fillStyle = shade(PAL.discA, 1.5)
            g.beginPath(); g.ellipse(cx, cy - 1, Math.max(1, rx - 1.5), Math.max(1, DISC_RY - 1.5), 0, 0, Math.PI * 2); g.fill()
        }
        // the spindle hub: stays visible even when the disc is edge-on
        px(g, cx - 1, cy - 2, 2, 4, PAL.discB)
    })
}

// Coily's body is a real spring, not a stack of bars: N thin oval coils whose
// whole stack wiggles by a travelling sinusoid (coilX) that advances one phase
// per frame, so the near/far edges shimmer as he hops. This model is PURE (no
// DOM, no Math.random), so qbertcheck pins it in Node exactly like the PoP
// light model; coilySprite below is only the painter.
export const COILS = 5
export const COIL_W = 15
export const COIL_H = 4
export const COIL_TOP = 7
export const COIL_SPACING = 3
export const COIL_AMPL = 1.6
export const COIL_WAVE = Math.PI / 2
export function coilX(i, f = 0) {
    return COIL_AMPL * Math.sin((i / (COILS - 1)) * Math.PI * 2 + f * COIL_WAVE)
}
export function coilY(i) {
    return COIL_TOP + i * COIL_SPACING
}

// Coily: a coiled spring (a Slinky seen from the side) with a head. Each coil is
// a dark-rimmed oval with a bright front and a pale belly band, and the whole
// stack wiggles by coilX(i, frame). The head's tongue flicks out on alternate
// frames.
export function coilySprite(frame) {
    return sprite(`coily-${frame}`, 22, 22, (g) => {
        const rx = COIL_W / 2, ry = COIL_H / 2
        for (let i = 0; i < COILS; i++) {
            const cx = 11 + coilX(i, frame)
            const cy = coilY(i)
            g.fillStyle = PAL.coilyDark
            g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill()
            g.fillStyle = PAL.coily
            g.beginPath(); g.ellipse(cx, cy - 0.5, rx - 1, ry - 0.5, 0, 0, Math.PI * 2); g.fill()
            px(g, cx - rx + 2, cy, COIL_W - 4, 1, PAL.coilyBelly)
        }
        // head
        px(g, 8, 0, 8, 6, PAL.coily)
        px(g, 8, 5, 8, 1, PAL.coilyBelly)
        px(g, 9, 1, 2, 2, '#f8f8f8'); px(g, 13, 1, 2, 2, '#f8f8f8')
        px(g, 9, 2, 1, 1, '#101010'); px(g, 13, 2, 1, 1, '#101010')
        // mouth + a flicking forked tongue (longer on alternate frames)
        px(g, 10, 4, 4, 1, '#f83800')
        const tl = 1 + (frame % 2)
        px(g, 12, 5, 1, tl, '#f83800')
        if (tl > 1) { px(g, 11, 5 + tl, 1, 1, '#f83800'); px(g, 13, 5 + tl, 1, 1, '#f83800') }
    })
}

export function runnerSprite(kind, frame) {
    const c = kind === 'ugg' ? PAL.ugg : PAL.wrongway
    return sprite(`run-${kind}-${frame}`, 22, 12, (g) => {
        px(g, 0, 4, 22, 5, c)
        px(g, 2, 3, 18, 1, shade(c, 1.4))
        px(g, 0, 9, 22, 1, shade(c, 0.55))
        const fx = kind === 'ugg' ? 17 : 1
        px(g, fx, 2, 4, 4, c)
        px(g, fx + 1, 3, 1, 1, '#101010')
        // legs shuffle
        const lo = frame % 2
        px(g, 3 + lo * 2, 9, 2, 2, shade(c, 0.55))
        px(g, 9 - lo * 2, 9, 2, 2, shade(c, 0.55))
        px(g, 15 + lo * 2, 9, 2, 2, shade(c, 0.55))
    })
}

export function slickSprite() {
    return sprite('slick', HW * 2, HH * 2, (g) => {
        g.fillStyle = PAL.slick
        g.beginPath()
        g.moveTo(HW, 0); g.lineTo(HW * 2, HH); g.lineTo(HW, HH * 2); g.lineTo(0, HH)
        g.closePath(); g.fill()
        px(g, HW - 5, HH - 2, 7, 1, '#7888f8')
        px(g, HW + 1, HH + 1, 5, 1, '#404898')
    })
}

export function tunnelSprite(side) {
    return sprite(`tun-${side}`, 18, 14, (g) => {
        px(g, 0, 0, 18, 14, '#101018')
        g.fillStyle = '#000000'
        g.beginPath(); g.ellipse(9, 7, 7, 5, 0, 0, Math.PI * 2); g.fill()
        px(g, side > 0 ? 0 : 16, 2, 2, 10, '#383850')
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
    '*': ['000', '101', '010', '101', '000'], '#': ['101', '111', '101', '111', '101'],
    '@': ['010', '101', '111', '101', '011'],
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

const STARS = []
{
    let s = 19820816
    for (let i = 0; i < 36; i++) {
        s = (s * 1103515245 + 12345) >>> 0
        const x = (s >>> 8) % 256
        s = (s * 1103515245 + 12345) >>> 0
        const y = (s >>> 8) % 46
        STARS.push([x, y + 6])
    }
}

export function paintBg(ctx, Wn, Hn) {
    const grd = ctx.createLinearGradient(0, 0, 0, Hn)
    grd.addColorStop(0, '#101040')
    grd.addColorStop(0.7, '#301858')
    grd.addColorStop(1, '#481828')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, Wn, Hn)
    for (const [x, y] of STARS) px(ctx, x, y, 1, 1, '#a8a8e0')
}

export function lifeGlyph(ctx, x, y) {
    px(ctx, x + 1, y + 3, 5, 4, PAL.bert)
    px(ctx, x + 2, y, 3, 3, '#f8f8f8')
    px(ctx, x + 3, y + 1, 1, 1, '#101010')
    px(ctx, x, y + 7, 2, 1, PAL.bertFoot)
    px(ctx, x + 5, y + 7, 2, 1, PAL.bertFoot)
}
