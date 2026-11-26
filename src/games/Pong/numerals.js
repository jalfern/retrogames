// numerals.js — the machine's video type, drawn as blocks (#3536).
//
// The 1972 table had no fonts. Its score was drawn by the video circuit as
// seven-segment digits — bar segments with visible gaps — and that blocky
// face is what people remember. `fillText(..., 'monospace')` never read as
// the machine; these bars do. Pure geometry (digitRects / titleRects) lives
// here so pongcheck §numerals can pin the shapes in Node; the draw helpers
// just fill the same rects.

// Which of the seven bars (a top, b top-right, c bottom-right, d bottom,
// e bottom-left, f top-left, g middle) each digit lights.
export const SEG = {
    0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
    5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
}

export const digitSegments = (d) => SEG[d] || ''

const SEG_W = 0.52 // digit width as a fraction of height (the machine's proportion)

// Segment bars for one digit in a local box (0,0)-(w,h). Bar thickness is
// h/8, gaps h/16 — the notches between segments are the whole look, so no
// two bars may touch: verticals run strictly between the horizontal bars.
export function digitRects(d, h) {
    const on = digitSegments(d)
    const w = Math.round(h * SEG_W)
    const t = Math.max(2, Math.round(h / 8))
    const g = Math.max(1, Math.round(h / 16))
    const mid = Math.round((h - t) / 2) // middle bar's y
    const half = Math.max(2, mid - t - 2 * g) // vertical bar length, gapped both ends
    const r = []
    if (on.includes('a')) r.push([g, 0, w - 2 * g, t])
    if (on.includes('f')) r.push([0, t + g, t, half])
    if (on.includes('b')) r.push([w - t, t + g, t, half])
    if (on.includes('g')) r.push([g, mid, w - 2 * g, t])
    if (on.includes('e')) r.push([0, mid + t + g, t, half])
    if (on.includes('c')) r.push([w - t, mid + t + g, t, half])
    if (on.includes('d')) r.push([g, h - t, w - 2 * g, t])
    return { w, rects: r }
}

// A score (0–99) centered at cx, top at y. One digit below ten, two above —
// the field centers like the port's fillText did, so layout never shifts.
export function drawBlockScore(ctx, cx, y, n, h, color) {
    const s = String(Math.max(0, Math.min(99, Math.round(n))))
    const gap = Math.round(h * 0.18)
    const rects = [...s].map((d) => digitRects(Number(d), h))
    const total = rects.reduce((a, r) => a + r.w, 0) + gap * (rects.length - 1)
    ctx.fillStyle = color
    let x = Math.round(cx - total / 2)
    for (const r of rects) {
        for (const [rx, ry, rw, rh] of r.rects) ctx.fillRect(x + rx, Math.round(y + ry), rw, rh)
        x += r.w + gap
    }
}

// 5×7 pixel letters for the attract title — the P·O·N·G word-mark. (Rows of
// the era's video blocks; original artwork, drawn here, never copied.)
export const TITLE_GLYPHS = {
    P: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....', 'X....', 'X....'],
    O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
    N: ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X', 'X...X', 'X...X'],
    G: ['.XXX.', 'X...X', 'X....', 'X..XX', 'X...X', 'X...X', '.XXX.'],
    '-': ['.....', '.....', '.....', 'XXXX.', '.....', '.....', '.....'],
    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
}

// Lit cells for a word-mark, unit grid; one cell is (h/7)² on screen.
const TITLE_GAP = 1 // fixed one-cell letter gap — never scales with cell size

export function titleRects(text, h) {
    const cell = h / 7
    const cells = []
    let cols = 0
    for (const ch of text) {
        const g = TITLE_GLYPHS[ch] || TITLE_GLYPHS[' ']
        g.forEach((row, ry) => {
            for (let rx = 0; rx < 5; rx++) if (row[rx] === 'X') cells.push([cols + rx, ry])
        })
        cols += 5 + TITLE_GAP
    }
    return { w: (cols - TITLE_GAP) * cell, h: cell * 7, cell, cells }
}

// Largest word-mark height that still fits 92% of a w-wide canvas — at the
// small end (667×375 phone table, 242px wide) a fixed 64px title clipped the
// P and G; the mark must shrink with the cabinet.
export const titleFit = (w, h) => {
    const ratio = titleRects('PONG', 7).w / 7 // ≈ 23/7, height-independent
    return Math.floor(Math.min(h * 0.13, 64, (w * 0.92) / ratio))
}

// Word-mark centered at cx, baseline-ish bottom at y.
export function drawBlockTitle(ctx, cx, y, text, h, color) {
    const t = titleRects(text, h)
    const x0 = Math.round(cx - t.w / 2)
    const y0 = Math.round(y - t.h)
    ctx.fillStyle = color
    for (const [gx, gy] of t.cells) {
        ctx.fillRect(x0 + Math.round(gx * t.cell), y0 + Math.round(gy * t.cell), Math.ceil(t.cell), Math.ceil(t.cell))
    }
}
