// TETRIS (NES) — runtime art. Blocks, panel chrome and a 3x5 bitmap font,
// all generated in code. Imports nothing browser-hostile except the canvas.

export const NES = [
    null,
    '#f83800', // L  orange-red
    '#0000f8', // J  blue
    '#f8d800', // O  yellow
    '#00b800', // S  green
    '#f80000', // Z  red
    '#00e8f8', // I  cyan
    '#a800cc', // T  purple
]

const TILES = new Map()

function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16)
    const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)))
    const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)))
    const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)))
    return `rgb(${r},${g},${b})`
}

// One NES block: bevelled tile with the inner square, drawn once per colour
// into an offscreen canvas and blitted per cell.
export function blockTile(id) {
    if (TILES.has(id)) return TILES.get(id)
    const base = NES[id]
    const c = document.createElement('canvas')
    c.width = 8
    c.height = 8
    const g = c.getContext('2d')
    g.fillStyle = base
    g.fillRect(0, 0, 8, 8)
    g.fillStyle = shade(base, 1.55)
    g.fillRect(0, 0, 8, 1); g.fillRect(0, 0, 1, 8)
    g.fillRect(1, 1, 6, 1); g.fillRect(1, 1, 1, 6)
    g.fillStyle = shade(base, 0.45)
    g.fillRect(0, 7, 8, 1); g.fillRect(7, 0, 1, 8)
    g.fillRect(1, 6, 6, 1); g.fillRect(6, 1, 1, 6)
    g.fillStyle = shade(base, 1.25)
    g.fillRect(3, 3, 3, 3)
    TILES.set(id, c)
    return c
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
    S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
    U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'],
    W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
    Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
    '-': ['000', '000', '111', '000', '000'], ':': ['000', '010', '000', '010', '000'],
    '.': ['000', '000', '000', '000', '010'], '/': ['001', '001', '010', '100', '100'],
    '+': ['000', '010', '111', '010', '000'], ' ': ['000', '000', '000', '000', '000'],
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

// The marquee column of coloured blocks, like the NES side art.
export function artColumn(ctx, x, y, h, t, s = 8) {
    const seq = [1, 5, 6, 3, 7, 2, 4]
    let yy = y - (t % s)
    let i = Math.floor(t / s)
    while (yy < y + h) {
        const id = (((seq[((i % seq.length) + seq.length) % seq.length]) - 1) % 7) + 1
        ctx.drawImage(blockTile(id), x, yy, s, s)
        ctx.drawImage(blockTile(id), x + s, yy, s, s)
        yy += s
        i++
    }
}
