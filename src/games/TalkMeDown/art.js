// TALK ME DOWN — all art generated in code (RETRO bar, #1252). NES-era squad
// aesthetic: beveled steel panel, red 7-seg fuse, colored wire arcs, a cream
// typewritten manual with rule numbers in the red margin. 640x360 native.
import { WIRE_COLORS, GLYPHS, RULEBOOK, variantPool, BACK_FACT_STAMPS } from './engine.js'
import { ACCEPTED_HINT, KEY_CALL_HINT } from './voice.js'

export const W = 640
export const H = 360
export const PANEL = { x: 8, y: 8, w: 400, h: 336 }
export const RAIL = { x: 416, y: 8, w: 216, h: 336 }
// #1888 phone manual seat: on a touch device the guest IS the rulebook
// reader, so the page takes the bomb panel's 400px bay (the LCD rail keeps
// its exact y-band, the squad plate shrinks to the right strip). One size
// bump: rule type 7 -> 9px native = ~2mm at a 6-inch landscape scale.
export const MANUAL_WIDE = { x: 8, y: 8, w: 400, h: 296 }

const P = {
    bench: '#17151c', benchHi: '#242031',
    steel: '#4a4f57', steelHi: '#7a808b', steelLo: '#2b2e33', seam: '#1c1e22',
    plate: '#3a3e45', plateHi: '#5c626c',
    fuseRed: '#ff2f2f', fuseDim: '#3d1214', amber: '#ffb62e',
    lcd: '#0e2416', lcdTxt: '#78ff96',
    cream: '#efe6c8', creamLo: '#d8cba4', ink: '#23201a', margin: '#c0392b',
    safe: '#41e05a', lock: '#ff3b30', off: '#2a2d31',
    wire: ['#e8323c', '#3f6ff5', '#f2c93c', '#37c24a', '#e8e8e0', '#232326'],
    wireHi: ['#ff7a80', '#8fb0ff', '#ffe385', '#86ef95', '#ffffff', '#5a5a60'],
    key: '#26282d', keyHi: '#3d4047', keyLo: '#15161a',
    led: '#33161a', ledOn: '#ffd23e',
}

const FONT = size => `${size}px "Press Start 2P", monospace`

// ---- 7-seg fuse ------------------------------------------------------------
const SEG = [
    [1, 1, 5, 1], [7, 1, 1, 5], [7, 7, 1, 5], [1, 13, 5, 1],
    [1, 7, 1, 5], [7, 13, 1, 0], [1, 7, 5, 1],
]
const DIG = [
    [1, 1, 1, 1, 1, 1, 0], [0, 1, 1, 0, 0, 0, 0], [1, 1, 0, 1, 1, 0, 1],
    [1, 1, 1, 1, 0, 0, 1], [0, 1, 1, 0, 0, 1, 1], [1, 0, 1, 1, 0, 1, 1],
    [1, 0, 1, 1, 1, 1, 1], [1, 1, 1, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 0, 1, 1],
]
export function segDigit(g, x, y, d, color, dim = P.fuseDim) {
    SEG.forEach((s, i) => {
        if (s[3] === 0) return
        g.fillStyle = DIG[d][i] ? color : dim
        g.fillRect(x + s[0], y + s[1], s[2], s[3])
    })
}
export function drawFuse(g, x, y, secs, urgent, tick = 0) {
    const mm = Math.max(0, Math.floor(secs / 60))
    const ss = Math.max(0, secs % 60)
    const col = urgent ? (secs % 2 ? '#ff5b5b' : P.fuseRed) : P.fuseRed
    ;[Math.floor(mm / 10), mm % 10].forEach((d, i) => { if (i > 0 || mm >= 10) segDigit(g, x + i * 10, y, d, col) })
    g.fillStyle = col; g.fillRect(x + 21, y + 12, 2, 2); g.fillRect(x + 21, y + 6, 2, 2)
    ;[Math.floor(ss / 10), ss % 10].forEach((d, i) => segDigit(g, x + 26 + i * 10, y, d, col))
    // #1305: last-10-s urgency — the whole fuse bezel throbs, not just digits.
    // Pulse alpha never reaches 0 so a screenshot at any phase catches it.
    if (urgent) {
        g.strokeStyle = `rgba(255,47,47,${(0.45 + 0.55 * (0.5 + 0.5 * Math.sin(tick / 5))).toFixed(2)})`
        g.lineWidth = 2; g.strokeRect(x - 8, y - 6, 112, 34); g.lineWidth = 1
    }
}

// ---- bench + panel -----------------------------------------------------------
export function drawBench(g) {
    g.fillStyle = P.bench; g.fillRect(0, 0, W, H)
    g.fillStyle = P.benchHi
    for (let i = 0; i < 90; i++) g.fillRect((i * 71 + 13) % W, (i * 47 + 7) % H, 2, 1)
}

function bevel(g, r, hi = P.steelHi, lo = P.steelLo) {
    g.fillStyle = P.steel; g.fillRect(r.x, r.y, r.w, r.h)
    g.fillStyle = hi; g.fillRect(r.x, r.y, r.w, 2); g.fillRect(r.x, r.y, 2, r.h)
    g.fillStyle = lo; g.fillRect(r.x, r.y + r.h - 2, r.w, 2); g.fillRect(r.x + r.w - 2, r.y, 2, r.h)
}

export function drawPanelShell(g) {
    bevel(g, PANEL)
    g.fillStyle = P.seam; g.fillRect(PANEL.x + 4, PANEL.y + 58, PANEL.w - 8, 1)
    // fuse housing
    g.fillStyle = '#141416'; g.fillRect(PANEL.x + 10, PANEL.y + 8, 108, 26)
    g.fillStyle = P.fuseDim; g.fillRect(PANEL.x + 12, PANEL.y + 10, 104, 22)
    // serial plate — the number itself moved to the BACK (#1802); the front
    // only tells you where it went (the original hides it — shout the joke).
    g.fillStyle = P.plate; g.fillRect(PANEL.x + 128, PANEL.y + 8, 116, 24)
    g.fillStyle = P.plateHi; g.fillRect(PANEL.x + 128, PANEL.y + 8, 116, 2); g.fillRect(PANEL.x + 128, PANEL.y + 8, 2, 24)
    g.font = FONT(6); g.fillStyle = '#5c626c'
    g.fillText('SERIAL: SEE BACK', PANEL.x + 134, PANEL.y + 23)
    // bolt
    const bx = PANEL.x + 256, by = PANEL.y + 20
    g.fillStyle = '#8a8f98'; g.beginPath()
    for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3
        const px = bx + Math.round(11 * Math.cos(a)), py = by + Math.round(11 * Math.sin(a))
        i ? g.lineTo(px, py) : g.moveTo(px, py)
    }
    g.closePath(); g.fill()
    g.fillStyle = '#5c626c'; g.fillRect(bx - 3, by - 3, 6, 6)
    // LED bar
    for (let i = 0; i < 9; i++) { g.fillStyle = P.off; g.fillRect(PANEL.x + 288 + i * 12, PANEL.y + 14, 8, 8) }
    // strike breakers
    for (let i = 0; i < 3; i++) { g.fillStyle = '#1c1e22'; g.fillRect(PANEL.x + 372 + i * 0, PANEL.y, 0, 0); g.beginPath(); g.arc(PANEL.x + 380 - i * 14, PANEL.y + 18, 5, 0, 7); g.fillStyle = '#20242a'; g.fill() }
    // labels
    g.font = FONT(7); g.fillStyle = '#9aa0aa'
    g.fillText('BOMB  SQUAD', PANEL.x + 12, PANEL.y + 48)
    g.fillText('STRIKES', PANEL.x + 336, PANEL.y + 48)
}

export function drawLeds(g, n) {
    for (let i = 0; i < 9; i++) {
        g.fillStyle = i < n ? P.ledOn : P.led
        g.fillRect(PANEL.x + 288 + i * 12, PANEL.y + 14, 8, 8)
        if (i < n) { g.fillStyle = '#fff2b0'; g.fillRect(PANEL.x + 290 + i * 12, PANEL.y + 15, 3, 2) }
    }
}

export function drawBoltColor(g, c) {
    const bx = PANEL.x + 256, by = PANEL.y + 20
    g.fillStyle = P.wire[c]; g.beginPath()
    for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3
        const px = bx + Math.round(8 * Math.cos(a)), py = by + Math.round(8 * Math.sin(a))
        i ? g.lineTo(px, py) : g.moveTo(px, py)
    }
    g.closePath(); g.fill()
    g.fillStyle = '#141416'; g.fillRect(bx - 2, by - 2, 4, 4)
}

export function drawStrikes(g, n) {
    for (let i = 0; i < 3; i++) {
        const cx = PANEL.x + 380 - i * 14, cy = PANEL.y + 18
        g.beginPath(); g.arc(cx, cy, 5, 0, 7)
        g.fillStyle = i < n ? P.lock : '#20242a'; g.fill()
        if (i < n) { g.fillStyle = '#ffb3ad'; g.fillRect(cx - 2, cy - 2, 2, 2) }
    }
}

// ---- modules ---------------------------------------------------------------
export function moduleRect(i, count) {
    const top = PANEL.y + 64
    const hh = (PANEL.h - 100 - (count - 1) * 6) / count
    return { x: PANEL.x + 8, y: top + i * (hh + 6), w: PANEL.w - 16, h: hh }
}

function stampPlate(g, r, stamp) {
    g.fillStyle = '#d9d2b8'; g.fillRect(r.x + r.w - 40, r.y + 4, 36, 12)
    g.fillStyle = '#8c8468'; g.fillRect(r.x + r.w - 40, r.y + 4, 36, 1)
    g.font = FONT(8); g.fillStyle = '#201d16'
    g.fillText(stamp, r.x + r.w - 35, r.y + 14)
}

// #1373: `sag` bows the wire sideways at mid-span — loose wire hangs, it does
// not run in ruler-straight parallel lines. Deterministic per wire index, so
// every frame draws the same snake.
function drawWireShape(g, x0, y0, x1, y1, color, lit, pulse, sag = 0) {
    const midY = (y0 + y1) / 2
    g.strokeStyle = lit ? P.wireHi[color] : P.wire[color]
    g.lineWidth = 3
    if (pulse) { g.strokeStyle = '#ffffff'; g.lineWidth = 4 }
    g.beginPath(); g.moveTo(x0, y0)
    g.bezierCurveTo(x0 + sag, midY, x1 + sag, midY, x1, y1)
    g.stroke()
    g.lineWidth = 1
    if (lit) { // filament glow core
        g.strokeStyle = 'rgba(255,255,220,0.75)'
        g.beginPath(); g.moveTo(x0, y0)
        g.bezierCurveTo(x0 + sag, midY, x1 + sag, midY, x1, y1)
        g.stroke()
    }
}

export function drawNeon(g, r, m, cursorSub, pulseWire, tick) {
    // #1373 fix: the 148 px span only fits a one-module bomb; from round 3
    // (two bays) modules are ~115 px tall and the wires + lower strip spilled
    // into the bay below. Scale the span to the module instead.
    const top = r.y + Math.max(20, (r.h - Math.min(148, r.h - 24)) / 2)
    const bot = top + Math.min(148, r.h - 24)
    // terminal strips top and bottom
    g.fillStyle = '#8a8f98'
    g.fillRect(r.x + 6, bot - 2, r.w - 12, 4)
    g.fillRect(r.x + 6, top - 2, r.w - 12, 4)
    const n = m.wires.length
    m.wires.forEach((w, i) => {
        const x = r.x + 22 + i * Math.floor((r.w - 56) / Math.max(1, n - 1))
        const lit = w.lit && !m.solved
        // #1373: strain-relief nubs where the wire leaves each terminal strip
        // (rubber grommets keep the sag honest), plus a per-wire sideways bow.
        const sag = ((i * 5 + n) % 7) - 3
        g.fillStyle = '#141416'
        g.fillRect(x - 3, top + 3, 7, 3)
        g.fillRect(x - 3, bot - 6, 7, 3)
        g.fillStyle = '#565b63'
        g.fillRect(x - 3, top + 3, 7, 1)
        g.fillRect(x - 3, bot - 6, 7, 1)
        if (w.cut) { // severed: two stubs + dangling end
            const midY = (top + bot) / 2
            g.strokeStyle = P.wire[w.color]; g.lineWidth = 3
            g.beginPath(); g.moveTo(x, top + 2); g.quadraticCurveTo(x - 4 + sag, midY - 16, x - 3, midY - 6); g.stroke()
            g.beginPath(); g.moveTo(x + 1, bot - 2); g.quadraticCurveTo(x + 6 + sag, midY + 4, x + 5, midY + 10); g.stroke()
            g.lineWidth = 1
        } else {
            drawWireShape(g, x, top + 2, x + 2, bot - 2, w.color, lit, pulseWire === i && tick % 12 < 6, sag)
        }
        if (cursorSub === i && !m.solved) {
            g.fillStyle = tick % 20 < 12 ? '#ffe66b' : '#fff'
            g.fillRect(x - 4, bot + 6, 9, 3)
        }
    })
    g.font = FONT(6); g.fillStyle = '#7d838d'; g.fillText('NEON', r.x + 8, r.y + 14)
}

export function drawDialModule(g, r, m, pulse, tick) {
    // knob plate + value + SET key, arranged across the module mid-line
    const cy = r.y + r.h / 2
    g.fillStyle = '#141416'; g.fillRect(r.x + 10, cy - 15, 44, 30)
    g.fillStyle = P.fuseDim; g.fillRect(r.x + 12, cy - 13, 40, 26)
    segDigit(g, r.x + 20, cy - 9, m.dial, P.amber, '#3d2c10')
    const cx = r.x + 90
    g.fillStyle = '#6b7078'; g.beginPath(); g.arc(cx, cy, 16, 0, 7); g.fill()
    g.fillStyle = '#3c4046'; g.beginPath(); g.arc(cx, cy, 12, 0, 7); g.fill()
    const ang = -Math.PI / 2 + (m.dial / 10) * Math.PI * 2
    g.strokeStyle = '#ffe66b'; g.lineWidth = 3
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 10 * Math.cos(ang), cy + 10 * Math.sin(ang)); g.stroke()
    g.lineWidth = 1
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2
        g.fillStyle = '#9aa0aa'
        g.fillRect(cx + 19 * Math.cos(a) - 1, cy + 19 * Math.sin(a) - 1, 2, 2)
    }
    const sx = r.x + r.w - 66, sy = r.y + r.h / 2 - 8
    const hot = pulse && tick % 12 < 6
    g.fillStyle = hot ? '#7dffb0' : P.key; g.fillRect(sx, sy, 54, 18)
    g.fillStyle = hot ? '#3faf6c' : P.keyHi; g.fillRect(sx, sy, 54, 2); g.fillRect(sx, sy, 2, 18)
    g.fillStyle = P.keyLo; g.fillRect(sx, sy + 16, 54, 2); g.fillRect(sx + 52, sy, 2, 18)
    g.font = FONT(8); g.fillStyle = hot ? '#093' : '#c9cfda'; g.fillText('SET', sx + 16, sy + 12)
    g.font = FONT(6); g.fillStyle = '#7d838d'; g.fillText('DIAL', r.x + 8, r.y + 14)
}

function glyphPath(g, gi, cx, cy, s, color) {
    g.fillStyle = color
    if (gi === 0) { // STAR
        g.beginPath()
        for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + i * Math.PI / 5
            const rad = i % 2 ? s * 0.45 : s
            const px = cx + rad * Math.cos(a), py = cy + rad * Math.sin(a)
            i ? g.lineTo(px, py) : g.moveTo(px, py)
        }
        g.closePath(); g.fill()
    } else if (gi === 1) { // DIAMOND
        g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 0.7, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s * 0.7, cy)
        g.closePath(); g.fill()
    } else if (gi === 2) { // CLUB
        g.beginPath(); g.arc(cx, cy - s * 0.4, s * 0.45, 0, 7); g.fill()
        g.beginPath(); g.arc(cx - s * 0.5, cy + s * 0.2, s * 0.45, 0, 7); g.fill()
        g.beginPath(); g.arc(cx + s * 0.5, cy + s * 0.2, s * 0.45, 0, 7); g.fill()
        g.fillRect(cx - 1, cy, 3, s)
    } else if (gi === 3) { // SPADE
        g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 0.8, cy + s * 0.2)
        g.arc(cx, cy + s * 0.15, s * 0.8, 0.1, Math.PI - 0.1, false)
        g.lineTo(cx, cy - s)
        g.closePath(); g.fill()
        g.fillRect(cx - 1, cy + s * 0.2, 3, s * 0.8)
    } else if (gi === 4) { // BOLT
        g.beginPath()
        g.moveTo(cx + 2, cy - s); g.lineTo(cx - s * 0.6, cy + 1); g.lineTo(cx - 1, cy + 1)
        g.lineTo(cx - 2, cy + s); g.lineTo(cx + s * 0.6, cy - 1); g.lineTo(cx + 1, cy - 1)
        g.closePath(); g.fill()
    } else { // MOON
        g.beginPath(); g.arc(cx, cy, s * 0.9, 0, 7); g.fill()
        g.fillStyle = '#0e0f12'
        g.beginPath(); g.arc(cx + s * 0.5, cy - s * 0.25, s * 0.75, 0, 7); g.fill()
    }
}

export function drawGlyphModule(g, r, m, cursorSub, pulseGlyph, seqDone, tick) {
    const kh = Math.min(96, r.h - 28)
    const ky = r.y + (r.h - kh) / 2 + 4
    for (let i = 0; i < 6; i++) {
        const kx = r.x + 10 + i * Math.floor((r.w - 24) / 6), kw = Math.floor((r.w - 24) / 6) - 4
        const wasPressed = !m.solved && (seqDone || []).includes(i)
        const hot = (cursorSub === i && !m.solved && tick % 20 < 12) || wasPressed
        const pulse = pulseGlyph === i && tick % 12 < 6
        g.fillStyle = pulse ? '#1d7a4a' : hot ? '#454a52' : P.key
        g.fillRect(kx, ky, kw, kh)
        g.fillStyle = pulse ? '#7dffb0' : P.keyHi; g.fillRect(kx, ky, kw, 2); g.fillRect(kx, ky, 2, kh)
        g.fillStyle = P.keyLo; g.fillRect(kx, ky + kh - 2, kw, 2); g.fillRect(kx + kw - 2, ky, 2, kh)
        glyphPath(g, i, kx + kw / 2, ky + kh / 2, 7, m.solved ? '#2e5f3c' : wasPressed ? '#7dffb0' : '#cfd5df')
    }
    g.font = FONT(6); g.fillStyle = '#7d838d'; g.fillText('GLYPH', r.x + 8, r.y + 14)
}

// sequence progress dots for GLYPH modules
export function drawSeqDots(g, r, pressed) {
    for (let i = 0; i < 3; i++) {
        g.fillStyle = i < pressed ? P.safe : '#20242a'
        g.fillRect(r.x + r.w - 52 + i * 10, r.y + r.h - 6, 6, 3)
    }
}

export function moduleFrame(g, r, m, selected, cursorFlash, tick) {
    g.fillStyle = '#26292e'; g.fillRect(r.x, r.y, r.w, r.h)
    g.fillStyle = '#181a1e'; g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4)
    // #1373: brushed-aluminium grain — horizontal streaks seeded from the
    // stamp so the texture is welded to the module, not a per-frame shimmer.
    const seed = m.stamp.charCodeAt(0) * 31 + m.stamp.charCodeAt(1)
    for (let i = 0; i < 8; i++) {
        const gy = r.y + 5 + ((seed * (i + 3) * 17) % Math.max(1, r.h - 10))
        g.fillStyle = i % 2 ? 'rgba(255,255,255,0.030)' : 'rgba(255,255,255,0.018)'
        g.fillRect(r.x + 4, gy, r.w - 8, 1)
    }
    // corner screws, bottom edge (top corners carry the label + lamp)
    for (const sx of [r.x + 5, r.x + r.w - 5]) {
        const sy = r.y + r.h - 5
        g.fillStyle = '#6b7078'; g.beginPath(); g.arc(sx, sy, 2.5, 0, 7); g.fill()
        g.fillStyle = '#22252a'
        g.fillRect(sx - 2, sy - 0.5, 4, 1)
        g.fillRect(sx - 0.5, sy - 2, 1, 4)
    }
    if (m.solved) {
        // #1305: a real panel lamp — bezel ring + soft halo, readable at a glance
        // next to the red lock strobe. (Was a flat 6px square.)
        const lx = r.x + 7, ly = r.y + 7
        g.fillStyle = 'rgba(65,224,90,0.10)'; g.beginPath(); g.arc(lx, ly, 10, 0, 7); g.fill()
        g.fillStyle = 'rgba(65,224,90,0.22)'; g.beginPath(); g.arc(lx, ly, 6, 0, 7); g.fill()
        g.fillStyle = '#101a12'; g.beginPath(); g.arc(lx, ly, 4.5, 0, 7); g.fill()
        g.fillStyle = P.safe; g.beginPath(); g.arc(lx, ly, 3, 0, 7); g.fill()
        g.fillStyle = '#d6ffdd'; g.fillRect(lx - 1, ly - 2, 2, 1)
        g.font = FONT(7); g.fillStyle = '#2f7d43'; g.fillText('SAFE', r.x + 14, r.y + 11)
        if (m.flash > 0 && tick % 8 < 4) { g.fillStyle = 'rgba(65,224,90,0.18)'; g.fillRect(r.x, r.y, r.w, r.h) }
    } else if (m.locked > 0 && tick % 16 < 8) {
        g.fillStyle = 'rgba(255,59,48,0.22)'; g.fillRect(r.x, r.y, r.w, r.h)
        g.strokeStyle = P.lock; g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
    }
    if (selected) {
        g.strokeStyle = cursorFlash > 0 && tick % 8 < 4 ? '#fff' : '#ffe66b'
        g.lineWidth = 2; g.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); g.lineWidth = 1
    }
    stampPlate(g, r, m.stamp)
}

// ---- manual rail -----------------------------------------------------------
export function wrapText(g, str, max) {
    const words = str.split(' ')
    const lines = []
    let cur = ''
    for (const w of words) {
        const cand = cur ? `${cur} ${w}` : w
        if (g.measureText(cand).width > max && cur) { lines.push(cur); cur = w } else cur = cand
    }
    if (cur) lines.push(cur)
    return lines
}

const PAGE_NAME = { N: 'PAGE N — WIRES', D: 'PAGE D — DIALS', G: 'PAGE G — GLYPHS' }
const FOOTER = {
    N: ['COLOR MAP', '0 RED   1 BLUE', '2 YELLOW 3 GREEN', '4 WHITE 5 BLACK'],
    D: ['digits are 0-9', 'serial = the plate', 'on the BACK — flip!'],
    G: ['GLYPH MAP', '0 STAR   1 DIAMOND', '2 CLUB   3 SPADE', '4 BOLT   5 MOON'],
}

// drawManual — the typewritten page seat 2 owns. page: 0 N / 1 D / 2 G,
// line = seat-2 cursor, stamps = live module stamps (highlight what matters).
// #1888: `rect` lets the phone guest seat take the wide bay (MANUAL_WIDE);
// a wide page bumps every type a step (+2px, +2 leading) so the rulebook
// reads on a 6-inch screen. Default RAIL keeps pixel-for-pixel the desktop
// page (existing pixel gates stay pinned).
export function drawManual(g, page, line, stamps, tick, hidden, flag, flipped = 0, rect = RAIL) {
    const wide = rect.w > 300
    const lh = wide ? 12 : 10
    const r = rect
    bevel(g, r, '#5d4a2f', '#2e2415')
    if (hidden) {
        g.fillStyle = '#2b2e33'; g.fillRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12)
        g.font = FONT(7 + (wide ? 2 : 0)); g.fillStyle = '#7d838d'
        g.fillText('THE MANUAL', r.x + 40, r.y + 160)
        g.fillText('IS SOMEONE', r.x + 44, r.y + 176)
        g.fillText("ELSE'S JOB", r.x + 52, r.y + 192)
        g.fillText('B: LOOK ANYWAY', r.x + 28, r.y + 216)
        return
    }
    g.fillStyle = P.cream; g.fillRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12)
    g.fillStyle = P.creamLo; g.fillRect(r.x + 6, r.y + r.h - 18, r.w - 12, 12)
    g.fillStyle = P.margin; g.fillRect(r.x + 24, r.y + 6, 1, r.h - 12)
    // binder rings
    for (let i = 0; i < 3; i++) { g.fillStyle = '#8a8f98'; g.beginPath(); g.arc(r.x + 13, r.y + 40 + i * (wide ? 96 : 110), 4, 0, 7); g.fill(); g.fillStyle = P.cream; g.beginPath(); g.arc(r.x + 13, r.y + 40 + i * (wide ? 96 : 110), 2, 0, 7); g.fill() }
    const key = ['N', 'D', 'G'][page]
    g.font = FONT(8 + (wide ? 2 : 0)); g.fillStyle = P.ink
    g.fillText(PAGE_NAME[key], r.x + 32, r.y + 26)
    g.fillStyle = '#b7ab86'; g.fillRect(r.x + 32, r.y + 32, r.w - 44, 1)
    g.font = FONT(7 + (wide ? 2 : 0))
    const fs = 7 + (wide ? 2 : 0)
    const pool = variantPool(key, 99)
    const blocks = pool.map(v => wrapText(g, RULEBOOK[key].find(r2 => r2.id === key + v).text, r.w - 66))
    // fit pass (#1888): the wide page's footer sits higher (shorter bay) —
    // if the rule block would walk into it, drop one leading step first.
    const footTop = r.y + r.h - (wide ? 78 : 73)
    let lh2 = lh
    if (wide && r.y + 44 + blocks.reduce((a, b) => a + b.length * lh2 + 8, 0) - 8 > footTop - 4) lh2 = fs + 1
    let y = r.y + (wide ? 44 : 46)
    pool.forEach((v, idx) => {
        const rule = RULEBOOK[key].find(r2 => r2.id === key + v)
        const live = stamps.includes(rule.id)
        const lines = blocks[idx]
        if (line === idx) {
            g.fillStyle = '#2f7d43'
            g.fillText('>', r.x + 28, y)
            g.fillStyle = 'rgba(47,125,67,0.12)'
            g.fillRect(r.x + 26, y - 8, r.w - 38, lines.length * lh2 + 3)
        }
        g.fillStyle = live ? P.margin : '#8a8168'
        g.fillText(rule.id, r.x + 34, y)
        g.fillStyle = P.ink
        lines.forEach((ln, li) => g.fillText(ln, r.x + 58, y + li * lh2))
        // #1373: seat 2's flag (A/F) leaves a paperclip on the rule line —
        // the page itself records what the manual player shouted about.
        if (flag && flag === rule.id) {
            const clipX = r.x + r.w - 22
            const clipY = y - 11
            g.strokeStyle = '#9aa0aa'; g.lineWidth = 1
            g.beginPath()
            g.moveTo(clipX + 1, clipY + 11)
            g.lineTo(clipX + 1, clipY + 3)
            g.arc(clipX + 3, clipY + 3, 2, Math.PI, 0)
            g.lineTo(clipX + 5, clipY + 13)
            g.lineTo(clipX + 2.5, clipY + 13)
            g.lineTo(clipX + 2.5, clipY + 6)
            g.stroke()
        }
        y += lines.length * lh2 + 8
    })
    g.font = FONT(6 + (wide ? 2 : 0)); g.fillStyle = '#6b6350'
    FOOTER[key].forEach((ln, i) => g.fillText(ln, r.x + 30, r.y + r.h - (wide ? 78 : 73) + i * (wide ? 10 : 9)))
    // #1802: the flip conversation. When a LIVE rule on this page reads a
    // back-plate fact (serial/batteries), seat 2 gets the word — the manual
    // player is the one who must shout "FLIP IT". Greys out once the bomb
    // is already on its back (gs.flip via simState).
    if (stamps.some(s => BACK_FACT_STAMPS.includes(s) && s[0] === key)) {
        if (flipped) {
            g.fillStyle = '#9a917a'
            g.fillText('BACK IS UP — READ IT ALOUD', r.x + 30, r.y + r.h - (wide ? 46 : 44))
        } else {
            g.fillStyle = tick % 40 < 26 ? '#b0541f' : '#8a8168'
            g.fillText('ASK THEM TO FLIP IT!', r.x + 30, r.y + r.h - (wide ? 46 : 44))
        }
    }
    // #1373: the accepted-call shapes, printed right on the page (#1247) —
    // a manual player who never read a screen knows exactly what to shout.
    g.fillStyle = '#4a4436'
    g.fillText('MIC V — OR X TYPES IT', r.x + 30, r.y + r.h - (wide ? 37 : 35))
    g.fillText('"CUT RED" "DIAL 7" "SET"', r.x + 30, r.y + r.h - (wide ? 28 : 26))
    g.font = FONT(6 + (wide ? 2 : 0)); g.fillStyle = '#8a8168'
    g.fillText('< PAGE >   A: FLAG', r.x + 44, r.y + r.h - 14)
}

// ---- the back panel (#1797) --------------------------------------------------
// The maintenance side of the block: a riveted plate bolted over the module
// bays, a hazard stencil, the battery bank D5/G5 demand aloud, and — since
// #1802 — the SERIAL on its ID plate. The fuse and the strike breakers stay
// drawn by the caller — pressure never hides.
// #1917 THE RAIL: the three holders are a slide-rail tray with a SEEDED cell
// layout. The rail opens at the right; a cell with another cell between it and
// the opening has its pull-tab clipped (dark slate), the open-end cell wears a
// bright amber tab. < > moves the hand; the action line names what A does for
// THIS slot — never lies (plate truth, hash truth, engine truth: one rail).
export function drawBack(g, batteries, tick, serial = 'XX0X0', held = 0, trayIn = null, selIn = 2) {
    const tray = Array.isArray(trayIn) && trayIn.length === 3
        ? trayIn.map(v => (v ? 1 : 0))
        : [0, 1, 2].map(i => (i < batteries ? 1 : 0)) // pre-rail callers: the classic left-packed plate
    const sel = selIn >= 0 && selIn <= 2 ? selIn | 0 : 2
    let open = -1
    for (let j = 2; j >= 0; j--) if (tray[j]) { open = j; break }
    bevel(g, PANEL, '#3f444c', '#1f2226')
    g.fillStyle = '#33373d'; g.fillRect(PANEL.x + 6, PANEL.y + 50, PANEL.w - 12, PANEL.h - 58)
    g.fillStyle = '#42474e'; g.fillRect(PANEL.x + 6, PANEL.y + 50, PANEL.w - 12, 2); g.fillRect(PANEL.x + 6, PANEL.y + 50, 2, PANEL.h - 58)
    // #1802: this is where the SERIAL lives — a dark ID plate riveted to the
    // maintenance side. The original hides it here ("Serial Port!"); reading it
    // aloud is the flip's whole payoff. The bolt/LED bar stay hidden.
    g.fillStyle = '#3a3e45'; g.fillRect(PANEL.x + 124, PANEL.y + 4, 224, 32)
    g.fillStyle = '#20242a'; g.fillRect(PANEL.x + 124, PANEL.y + 4, 224, 1)
    g.fillStyle = '#141416'; g.fillRect(PANEL.x + 132, PANEL.y + 9, 132, 22)
    g.fillStyle = '#8a8f98'; g.fillRect(PANEL.x + 132, PANEL.y + 9, 132, 1); g.fillRect(PANEL.x + 132, PANEL.y + 9, 1, 22)
    g.font = FONT(6); g.fillStyle = '#7d838d'
    g.fillText('SERIAL', PANEL.x + 138, PANEL.y + 17)
    g.font = FONT(10); g.fillStyle = '#d8dce2'
    g.fillText(String(serial).slice(0, 6), PANEL.x + 138, PANEL.y + 28)
    g.font = FONT(6); g.fillStyle = '#5c626c'
    g.fillText('FACT PLATE', PANEL.x + 272, PANEL.y + 24)
    // rivets
    g.fillStyle = '#20242a'
    for (const [rx, ry] of [[16, 60], [PANEL.w - 22, 60], [16, PANEL.h - 18], [PANEL.w - 22, PANEL.h - 18], [124 + 4, 12], [124 + 216, 12]]) {
        g.beginPath(); g.arc(PANEL.x + rx, PANEL.y + ry, 3, 0, 7); g.fill()
    }
    g.font = FONT(8); g.fillStyle = '#8a8f98'
    g.fillText('MAINTENANCE PANEL', PANEL.x + 96, PANEL.y + 82)
    g.font = FONT(6); g.fillStyle = '#6b7078'
    g.fillText('PROPERTY OF BOMB SQUAD - DO NOT LOSE', PANEL.x + 60, PANEL.y + 98)
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#b98a1e' : '#2a2d31'; g.fillRect(PANEL.x + 20 + i * 30, PANEL.y + 108, 30, 6) }
    g.font = FONT(7); g.fillStyle = P.amber
    g.fillText('BATTERIES', PANEL.x + 152, PANEL.y + 136)
    g.font = FONT(5); g.fillStyle = '#5c626c'
    g.fillText('< > PICKS THE CELL', PANEL.x + 236, PANEL.y + 136)
    // the rail itself: a groove the cells slide along, open at the right end
    g.fillStyle = '#141519'; g.fillRect(PANEL.x + 112, PANEL.y + 150, 214, 74)
    g.fillStyle = '#20242a'; g.fillRect(PANEL.x + 112, PANEL.y + 150, 214, 2); g.fillRect(PANEL.x + 112, PANEL.y + 222, 214, 2)
    g.fillStyle = tick % 60 < 38 ? '#8a6512' : '#4a4f57'
    g.fillText('OPEN', PANEL.x + 330, PANEL.y + 146)
    for (let i = 0; i < 3; i++) {
        const bx = PANEL.x + 118 + i * 68, by = PANEL.y + 146
        const occ = tray[i] === 1
        const pullable = occ && i === open
        if (occ) {
            // the pull-tab tells the rail law: bright amber = free at the open
            // end; dark slate = clipped behind a neighbor (it goes first).
            g.fillStyle = pullable ? '#8a6512' : '#3a4148'; g.fillRect(bx + 14, by, 16, 8)
            g.fillStyle = '#c98f1f'; g.fillRect(bx, by + 6, 44, 74)
            g.fillStyle = P.amber; g.fillRect(bx + 3, by + 9, 38, 68)
            g.fillStyle = '#8a6512'
            g.fillRect(bx + 8, by + 22, 28, 3); g.fillRect(bx + 8, by + 38, 28, 3)
            if (pullable) { g.fillStyle = '#3a2c08'; g.fillText('>', bx + 34, by + 30) }
        } else {
            g.fillStyle = '#1c1e22'; g.fillRect(bx + 14, by, 16, 8)
            g.fillStyle = '#1c1e22'; g.fillRect(bx, by + 6, 44, 74)
            g.fillStyle = '#141519'; g.fillRect(bx + 4, by + 10, 36, 66)
        }
        g.font = FONT(6); g.fillStyle = occ ? '#3a2c08' : '#3d4148'
        g.fillText(String(i + 1), bx + 19, by + 80)
        // the hand: pulsing corner brackets on the selected slot
        if (i === sel) {
            g.fillStyle = tick % 40 < 26 ? '#ffd23e' : '#8a6d14'
            const cx = bx - 4, cy = by - 6, cw = 52, ch = 92
            g.fillRect(cx, cy, 10, 2); g.fillRect(cx + cw - 10, cy, 10, 2)
            g.fillRect(cx, cy + ch - 2, 10, 2); g.fillRect(cx + cw - 10, cy + ch - 2, 10, 2)
            g.fillRect(cx, cy, 2, 10); g.fillRect(cx + cw - 2, cy, 2, 10)
            g.fillRect(cx, cy + ch - 10, 2, 10); g.fillRect(cx + cw - 2, cy + ch - 10, 2, 10)
        }
    }
    // #1909 THE DRAIN: the pocket — a battery in hand sits clipped to the
    // plate's corner, and the action line names what A does right now. The
    // empty slots above already show the drain (they are drawn live).
    if (held > 0) {
        const hx = PANEL.x + 344, hy = PANEL.y + PANEL.h - 92
        g.fillStyle = '#20242a'; g.fillRect(hx - 4, hy - 4, 52, 40) // pocket clip
        g.fillStyle = '#c98f1f'; g.fillRect(hx, hy, 32, 26)
        g.fillStyle = P.amber; g.fillRect(hx + 2, hy + 3, 28, 20)
        g.fillStyle = '#8a6512'; g.fillRect(hx + 5, hy + 9, 22, 2)
        g.fillStyle = '#d8dce2'; g.fillRect(hx + 34, hy - 4, 6, 5); g.fillRect(hx + 34, hy + 25, 6, 5)
        g.font = FONT(6); g.fillStyle = P.amber
        g.fillText('IN HAND', hx - 2, hy + 44)
    }
    // the action line is the selected slot's truth, never the plate's average
    g.font = FONT(6)
    const line = held > 0 ? 'A PUTS IT BACK'
        : batteries <= 0 ? 'PLATE EMPTY'
            : tray[sel] === 0 ? 'EMPTY SLOT'
                : sel === open ? 'A PULLS IT OUT' : 'BLOCKED - IT CLIPS RIGHT'
    g.fillStyle = held > 0 ? '#ffd23e' : sel === open && batteries > 0 && tray[sel] === 1 ? '#7dffb0' : '#5c626c'
    g.fillText(line, PANEL.x + 130, PANEL.y + PANEL.h - 60)
    g.font = FONT(6); g.fillStyle = tick % 50 < 32 ? '#7dffb0' : '#41544a'
    g.fillText('DOWN TILTS IT BACK', PANEL.x + 122, PANEL.y + PANEL.h - 48)
}

// the face-up nudge: where the tilt lives, printed while there is nothing to
// shout about. Pulses bright when a FLIP call reached the mic (#1247 law —
// heard words make things visible, they never act).
export function drawFlipHint(g, pulse, tick) {
    g.font = FONT(7)
    g.fillStyle = pulse && tick % 16 < 10 ? '#ffd23e' : '#8a9098'
    g.fillText('^ UP FLIPS IT', PANEL.x + 96, PANEL.y + 48)
}

// ---- chrome bits -----------------------------------------------------------
// #1415: the defuser's LCD rail carries the accepted call shapes etched under
// the glass — the manual page got them at #1373, seat 1 had nothing. Text is
// the shared ACCEPTED_HINT const (grammar/page/footer can never drift). The
// frame grows downward (flush with the panel bottom) so the glass and the
// order-text pixels keep their exact coordinates — existing pixel gates stay
// pinned. The footer glows LCD-green while the mic listens, dim steel while
// it is off: the hint doubles as a quiet mic-state echo.
export function drawOrderRail(g, order, flag, flicker = 0, micOn = false) {
    const y = PANEL.y + PANEL.h - 32
    g.fillStyle = '#0a0d0b'; g.fillRect(PANEL.x + 8, y, PANEL.w - 16, 32)
    g.fillStyle = P.lcd; g.fillRect(PANEL.x + 10, y + 2, PANEL.w - 20, 18)
    // #1305: an arriving order lands with a 2-frame LCD flicker (the glass
    // stutters before the text settles), synced to the partner blip.
    if (flicker > 0) {
        if (flicker % 2 === 0) { g.fillStyle = 'rgba(120,255,150,0.18)'; g.fillRect(PANEL.x + 10, y + 2, PANEL.w - 20, 18) }
        g.fillStyle = 'rgba(120,255,150,0.5)'
        g.fillRect(PANEL.x + 10, y + 4 + ((flicker * 7) % 14), PANEL.w - 20, 2)
    }
    g.font = FONT(7); g.fillStyle = P.lcdTxt
    const msg = order ? `PARTNER: ${order}` : (flag ? `READ RULE ${flag}` : 'PARTNER HOLDING THE MANUAL...')
    if (!(flicker > 2 && flicker % 2 === 0)) g.fillText(msg.slice(0, 42), PANEL.x + 14, y + 14)
    g.font = FONT(6); g.fillStyle = micOn ? '#5fd680' : '#6f747d'
    // #1894: the footer says two true things — while the mic listens it glows
    // with the accepted shapes (one source, ACCEPTED_HINT); while it is off
    // it coaches the keyboard channel instead. Both consts live in voice.js.
    g.fillText(micOn ? ACCEPTED_HINT : KEY_CALL_HINT, PANEL.x + 12, y + 29)
}

// #1894 CALL-BY-KEY: the composition rides the LCD glass itself — same
// coords the order text owns (this is the seat's mouth), amber like a hotline
// so it can never be mistaken for a printed PARTNER order. The caret blinks
// on the sim's own clock; a line full to CALL_LINE_MAX stops growing and the
// last chars stay visible (the shout is what was typed, not what fits).
export function drawCallLine(g, buf, tick) {
    const y = PANEL.y + PANEL.h - 32
    g.fillStyle = '#120e06'; g.fillRect(PANEL.x + 10, y + 2, PANEL.w - 20, 18)
    g.font = FONT(7); g.fillStyle = '#ffcf5e'
    const caret = tick % 40 < 24 ? '_' : ' '
    g.fillText(`CALL> ${buf}${caret}`.slice(0, 42), PANEL.x + 14, y + 14)
}

export function drawBanner(g, text, ok, tick) {
    const w = Math.min(300, 120 + text.length * 7)
    const x = (W - w) / 2, y = 40
    g.fillStyle = '#0a0d0b'; g.fillRect(x - 2, y - 2, w + 4, 22)
    g.fillStyle = ok ? '#123a1f' : '#3a1414'
    g.fillRect(x, y, w, 18)
    g.font = FONT(8); g.fillStyle = ok ? '#7dffb0' : '#ff9d94'
    g.fillText(text.slice(0, 34), x + 8, y + 12)
    void tick
}

export function drawFlag(g, r, stamp, tick) {
    if (tick % 24 < 14) {
        g.font = FONT(7); g.fillStyle = '#ffd23e'
        g.fillText(`READ ${stamp}`, r.x + 44, r.y + 12)
    }
}

// ---- over screens ----------------------------------------------------------
export function drawBoom(g, tick) {
    const p = Math.min(1, tick / 40)
    g.fillStyle = `rgba(255,120,40,${0.5 * (1 - p)})`; g.fillRect(0, 0, W, H)
    g.fillStyle = '#0c0a10'
    for (let i = 0; i < 9; i++) g.fillRect(i * 74 + 6, H - 60 - ((i * 37) % 40), 54, 60 + ((i * 37) % 40))
    g.fillStyle = `rgba(255,90,30,${0.7 * (1 - p)})`
    g.beginPath(); g.arc(W / 2, H / 2 - 20, 60 + tick, 0, 7); g.fill()
}

export function drawWinStamp(g, tick) {
    g.save()
    g.translate(W / 2, H / 2 + 10)
    g.rotate(-0.08)
    const s = Math.min(1, tick / 20)
    g.scale(s, s)
    g.strokeStyle = '#ffd23e'; g.lineWidth = 4
    g.strokeRect(-130, -34, 260, 68)
    g.font = FONT(16); g.fillStyle = '#ffd23e'
    g.fillText('SQUAD CHIEF', -104, 8)
    g.restore()
}
