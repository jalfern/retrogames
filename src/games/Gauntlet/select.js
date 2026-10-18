// GAUNTLET character-select geometry + tap test (issue #403).
// index.jsx draws the four hero cards from cardRect and answers touches
// with heroAt, so the pixels a finger hits and the pixels on screen are
// one definition — they cannot drift apart. gauntletcheck proves the
// test in plain Node.

export const CARD_W = 60
export const CARD_H = 78
export const CARD_Y = 108
export const CARD_STEP = 72
export const FIRST_CARD_CX = 52

export function cardCenter(i) { return FIRST_CARD_CX + i * CARD_STEP }

export function cardRect(i) {
    return { x: cardCenter(i) - CARD_W / 2, y: CARD_Y, w: CARD_W, h: CARD_H }
}

// which hero card a canvas-space (x, y) lands on, or null in the gaps
export function heroAt(x, y) {
    for (let i = 0; i < 4; i++) {
        const r = cardRect(i)
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i
    }
    return null
}
