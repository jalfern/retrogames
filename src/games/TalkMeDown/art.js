// TALK ME DOWN — all art generated in code (RETRO bar, #1252). NES-era squad
// aesthetic: beveled steel panel, red 7-seg fuse, colored wire arcs, a cream
// typewritten manual with rule numbers in the red margin. 640x360 native.
import { WIRE_COLORS, GLYPHS, RULEBOOK, variantPool } from './engine.js'

export const W = 640
export const H = 360
export const PANEL = { x: 8, y: 8, w: 400, h: 336 }
export const RAIL = { x: 416, y: 8, w: 216, h: 336 }

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
export function drawFuse(g, x, y, secs, urgent) {
    const mm = Math.max(0, Math.floor(secs / 60))
    const ss = Math.max(0, secs % 60)
    const col = urgent ? (secs % 2 ? '#ff5b5b' : P.fuseRed) : P.fuseRed
    ;[Math.floor(mm / 10), mm % 10].forEach((d, i) => { if (i > 0 || mm >= 10) segDigit(g, x + i * 10, y, d, col) })
    g.fillStyle = col; g.fillRect(x + 21, y + 12, 2, 2); g.fillRect(x + 21, y + 6, 2, 2)
    ;[Math.floor(ss / 10), ss % 10].forEach((d, i) => segDigit(g, x + 26 + i * 10, y, d, col))
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
    // serial plate
    g.fillStyle = P.plate; g.fillRect(PANEL.x + 128, PANEL.y + 8, 116, 24)
    g.fillStyle = P.plateHi; g.fillRect(PANEL.x + 128, PANEL.y + 8, 116, 2); g.fillRect(PANEL.x + 128, PANEL.y + 8, 2, 24)
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

function drawWireShape(g, x0, y0, x1, y1, color, lit, pulse) {
    const midY = (y0 + y1) / 2
    g.strokeStyle = lit ? P.wireHi[color] : P.wire[color]
    g.lineWidth = 3
    if (pulse) { g.strokeStyle = '#ffffff'; g.lineWidth = 4 }
    g.beginPath(); g.moveTo(x0, y0)
    g.bezierCurveTo(x0, midY, x1, midY, x1, y1)
    g.stroke()
    g.lineWidth = 1
    if (lit) { // filament glow core
        g.strokeStyle = 'rgba(255,255,220,0.75)'
        g.beginPath(); g.moveTo(x0, y0)
        g.bezierCurveTo(x0, midY, x1, midY, x1, y1)
        g.stroke()
    }
}

export function drawNeon(g, r, m, cursorSub, pulseWire, tick) {
    // terminal strips top and bottom
    g.fillStyle = '#8a8f98'
    g.fillRect(r.x + 6, r.y + r.h - 12, r.w - 12, 4)
    g.fillRect(r.x + 6, r.y + 18, r.w - 12, 4)
    const n = m.wires.length
    m.wires.forEach((w, i) => {
        const x = r.x + 22 + i * Math.floor((r.w - 56) / Math.max(1, n - 1))
        const lit = w.lit && !m.solved
        if (w.cut) { // severed: two stubs + dangling end
            const midY = r.y + r.h / 2
            g.strokeStyle = P.wire[w.color]; g.lineWidth = 3
            g.beginPath(); g.moveTo(x, r.y + 20); g.lineTo(x - 3, midY - 6); g.stroke()
            g.beginPath(); g.moveTo(x + 1, r.y + r.h - 10); g.lineTo(x + 5, midY + 10); g.stroke()
            g.lineWidth = 1
        } else {
            drawWireShape(g, x, r.y + 20, x + 2, r.y + r.h - 10, w.color, lit, pulseWire === i && tick % 12 < 6)
        }
        if (cursorSub === i && !m.solved) {
            g.fillStyle = tick % 20 < 12 ? '#ffe66b' : '#fff'
            g.fillRect(x - 4, r.y + r.h - 18, 9, 3)
        }
    })
    g.font = FONT(6); g.fillStyle = '#7d838d'; g.fillText('NEON', r.x + 8, r.y + 14)
}

export function drawDialModule(g, r, m, pulse, tick) {
    // knob plate + value + SET key
    g.fillStyle = '#141416'; g.fillRect(r.x + 8, r.y + 22, 44, 30)
    g.fillStyle = P.fuseDim; g.fillRect(r.x + 10, r.y + 24, 40, 26)
    segDigit(g, r.x + 18, r.y + 28, m.dial, P.amber, '#3d2c10')
    const cx = r.x + 74, cy = r.y + r.h / 2 + 4
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
    for (let i = 0; i < 6; i++) {
        const kx = r.x + 10 + i * Math.floor((r.w - 24) / 6), kw = Math.floor((r.w - 24) / 6) - 4
        const ky = r.y + 20, kh = r.h - 28
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
    if (m.solved) {
        g.fillStyle = P.safe; g.fillRect(r.x + 4, r.y + 4, 6, 6)
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
    D: ['digits are 0-9', 'serial = plate on', 'the bomb'],
    G: ['GLYPH MAP', '0 STAR   1 DIAMOND', '2 CLUB   3 SPADE', '4 BOLT   5 MOON'],
}

// drawManual — the typewritten page seat 2 owns. page: 0 N / 1 D / 2 G,
// line = seat-2 cursor, stamps = live module stamps (highlight what matters).
export function drawManual(g, page, line, stamps, tick, hidden) {
    bevel(g, RAIL, '#5d4a2f', '#2e2415')
    if (hidden) {
        g.fillStyle = '#2b2e33'; g.fillRect(RAIL.x + 6, RAIL.y + 6, RAIL.w - 12, RAIL.h - 12)
        g.font = FONT(7); g.fillStyle = '#7d838d'
        g.fillText('THE MANUAL', RAIL.x + 40, RAIL.y + 160)
        g.fillText('IS SOMEONE', RAIL.x + 44, RAIL.y + 176)
        g.fillText("ELSE'S JOB", RAIL.x + 52, RAIL.y + 192)
        g.fillText('B: LOOK ANYWAY', RAIL.x + 28, RAIL.y + 216)
        return
    }
    g.fillStyle = P.cream; g.fillRect(RAIL.x + 6, RAIL.y + 6, RAIL.w - 12, RAIL.h - 12)
    g.fillStyle = P.creamLo; g.fillRect(RAIL.x + 6, RAIL.y + RAIL.h - 18, RAIL.w - 12, 12)
    g.fillStyle = P.margin; g.fillRect(RAIL.x + 24, RAIL.y + 6, 1, RAIL.h - 12)
    // binder rings
    for (let i = 0; i < 3; i++) { g.fillStyle = '#8a8f98'; g.beginPath(); g.arc(RAIL.x + 13, RAIL.y + 40 + i * 110, 4, 0, 7); g.fill(); g.fillStyle = P.cream; g.beginPath(); g.arc(RAIL.x + 13, RAIL.y + 40 + i * 110, 2, 0, 7); g.fill() }
    const key = ['N', 'D', 'G'][page]
    g.font = FONT(8); g.fillStyle = P.ink
    g.fillText(PAGE_NAME[key], RAIL.x + 32, RAIL.y + 26)
    g.fillStyle = '#b7ab86'; g.fillRect(RAIL.x + 32, RAIL.y + 32, RAIL.w - 44, 1)
    g.font = FONT(7)
    const pool = variantPool(key, 99)
    let y = RAIL.y + 46
    pool.forEach((v, idx) => {
        const rule = RULEBOOK[key].find(r => r.id === key + v)
        const live = stamps.includes(rule.id)
        const lines = wrapText(g, rule.text, RAIL.w - 52)
        if (line === idx) {
            g.fillStyle = '#2f7d43'
            g.fillText('>', RAIL.x + 28, y)
            g.fillStyle = 'rgba(47,125,67,0.12)'
            g.fillRect(RAIL.x + 26, y - 8, RAIL.w - 38, lines.length * 10 + 3)
        }
        g.fillStyle = live ? P.margin : '#8a8168'
        g.fillText(rule.id, RAIL.x + 34, y)
        g.fillStyle = P.ink
        lines.forEach((ln, li) => g.fillText(ln, RAIL.x + 58, y + li * 10))
        y += lines.length * 10 + 8
    })
    g.font = FONT(6); g.fillStyle = '#6b6350'
    FOOTER[key].forEach((ln, i) => g.fillText(ln, RAIL.x + 30, RAIL.y + RAIL.h - 64 + i * 9))
    g.font = FONT(6); g.fillStyle = '#8a8168'
    g.fillText('< PAGE >   A: FLAG', RAIL.x + 44, RAIL.y + RAIL.h - 14)
    if (stamps.length && tick % 40 < 24) {
        g.font = FONT(7); g.fillStyle = P.margin
        g.fillText('LIVE: ' + stamps.join(' '), RAIL.x + 30, RAIL.y + 38 + 8)
    }
}

// ---- chrome bits -----------------------------------------------------------
export function drawOrderRail(g, order, flag) {
    const y = PANEL.y + PANEL.h - 32
    g.fillStyle = '#0a0d0b'; g.fillRect(PANEL.x + 8, y, PANEL.w - 16, 22)
    g.fillStyle = P.lcd; g.fillRect(PANEL.x + 10, y + 2, PANEL.w - 20, 18)
    g.font = FONT(7); g.fillStyle = P.lcdTxt
    const msg = order ? `PARTNER: ${order}` : (flag ? `READ RULE ${flag}` : 'PARTNER HOLDING THE MANUAL...')
    g.fillText(msg.slice(0, 42), PANEL.x + 14, y + 14)
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
