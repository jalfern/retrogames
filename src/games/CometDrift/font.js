// COMET DRIFT GP — the game's OWN bitmap font (#440 polish 3).
//
// The HUD used to lean on the browser default (`bold Npx monospace`), which is
// the same generic face every OS draws — not a designed look (docs/ART.md: build
// the look from the original, never a system fallback). This is a chunky 3x5
// arcade face authored for the canyon racer: rounded numerals, one-cell gaps,
// every glyph generated in code. No font assets.

export const CW = 3
export const CH = 5

// 0/1 rows, 5 tall x 3 wide. Uppercase; drawText uppercases its input.
export const FONT = {
    '0': ['010', '101', '101', '101', '010'],
    '1': ['010', '110', '010', '010', '111'],
    '2': ['110', '001', '010', '100', '111'],
    '3': ['111', '001', '011', '001', '111'],
    '4': ['101', '101', '111', '001', '001'],
    '5': ['111', '100', '110', '001', '110'],
    '6': ['011', '100', '111', '101', '011'],
    '7': ['111', '001', '010', '010', '010'],
    '8': ['111', '101', '111', '101', '111'],
    '9': ['111', '101', '111', '001', '110'],
    A: ['010', '101', '111', '101', '101'],
    B: ['110', '101', '110', '101', '110'],
    C: ['011', '100', '100', '100', '011'],
    D: ['110', '101', '101', '101', '110'],
    E: ['111', '100', '110', '100', '111'],
    F: ['111', '100', '110', '100', '100'],
    G: ['011', '100', '101', '101', '011'],
    H: ['101', '101', '111', '101', '101'],
    I: ['111', '010', '010', '010', '111'],
    J: ['001', '001', '001', '101', '010'],
    K: ['101', '110', '100', '110', '101'],
    L: ['100', '100', '100', '100', '111'],
    M: ['101', '111', '111', '101', '101'],
    N: ['110', '101', '101', '101', '101'],
    O: ['010', '101', '101', '101', '010'],
    P: ['110', '101', '110', '100', '100'],
    Q: ['010', '101', '101', '110', '011'],
    R: ['110', '101', '110', '110', '101'],
    S: ['011', '100', '010', '001', '110'],
    T: ['111', '010', '010', '010', '010'],
    U: ['101', '101', '101', '101', '111'],
    V: ['101', '101', '101', '101', '010'],
    W: ['101', '101', '111', '111', '101'],
    X: ['101', '101', '010', '101', '101'],
    Y: ['101', '101', '010', '010', '010'],
    Z: ['111', '001', '010', '100', '111'],
    '-': ['000', '000', '111', '000', '000'],
    '=': ['000', '111', '000', '111', '000'],
    '/': ['001', '001', '010', '100', '100'],
    ':': ['000', '010', '000', '010', '000'],
    '.': ['000', '000', '000', '000', '010'],
    ',': ['000', '000', '000', '010', '100'],
    '!': ['010', '010', '010', '000', '010'],
    '<': ['001', '010', '100', '010', '001'],
    '>': ['100', '010', '001', '010', '100'],
    '+': ['000', '010', '111', '010', '000'],
    "'": ['010', '010', '000', '000', '000'],
    ' ': ['000', '000', '000', '000', '000'],
}

export function glyph(ch) {
    return FONT[ch] || FONT[' ']
}

// advance in cells for a whole string (one-cell gap between glyphs, none trailing)
export function textCells(str) {
    const n = String(str).length
    return n === 0 ? 0 : n * (CW + 1) - 1
}

export function textW(str, scale) {
    return textCells(str) * scale
}

// drawText — the whole HUD renders through here. y is the baseline (like the
// fillText calls it replaces), so existing layout coords survive; caps sit
// CH cells tall above it. align: 'left' | 'center' | 'right', relative to x.
export function drawText(ctx, str, x, y, color = '#ffffff', scale = 1, align = 'left') {
    const s = String(str).toUpperCase()
    let ox = x
    if (align === 'center') ox = x - Math.round(textW(s, scale) / 2)
    else if (align === 'right') ox = x - textW(s, scale)
    const top = y - CH * scale
    ctx.fillStyle = color
    for (let i = 0; i < s.length; i++) {
        const g = glyph(s[i])
        const cx = ox + i * (CW + 1) * scale
        for (let r = 0; r < CH; r++) {
            const row = g[r]
            for (let c = 0; c < CW; c++) {
                if (row[c] === '1') ctx.fillRect(cx + c * scale, top + r * scale, scale, scale)
            }
        }
    }
    return textW(s, scale)
}
