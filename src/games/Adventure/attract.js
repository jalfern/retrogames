// ADVENTURE attract layout — the single source of truth the shell draws from
// and attractcheck audits. Rule 6 (#365): one informational message at a time,
// cycling. The old attract stacked "PRESS ANY KEY" over "TO START" and cycled
// nothing. The canvas is 160x192 (Atari 2600); every line here lands inside
// the frame at real size, sized down by fitSize at narrow widths.

import { cycleAttract } from '../../utils/attractLines.js'

export const HOLD = 144

export const INFO_MSGS = [
    'FIND THE GOLDEN CHALICE',
    'CARRY IT TO THE GOLD CASTLE',
    'YORGLES HUNT THE CHALICE',
    'THE DRAGON WATCHES THE LAIR',
    'KEYS OPEN THE GATES',
]

export const PRESS = 'PRESS ANY KEY TO START'
export const DIM = 'rgba(0,0,0,0.55)'

const CHAR_EM = 0.6

const fitSize = (text, w, max) => Math.max(9, Math.min(max, Math.floor((w * 0.92) / (CHAR_EM * text.length))))

export function attractFrame(tick, w, h, variant = 1) {
    const msg = cycleAttract(tick, INFO_MSGS, HOLD)
    const lines = [
        { text: msg, x: w / 2, y: h * 0.42, size: fitSize(msg, w, 10), col: '#ffff00', glow: 0 },
        { text: PRESS, x: w / 2, y: h * 0.58, size: fitSize(PRESS, w, 18), col: '#ffffff', glow: 0, blink: true },
        // #1572 item 3 — SELECT GAME: the variant number the cart's dot
        // matrix carried. Big digit in the cart palette, cycle hint below.
        { text: 'SELECT GAME', x: w / 2, y: h * 0.72, size: fitSize('SELECT GAME', w, 10), col: '#ffff00', glow: 0 },
        { text: String(variant), x: w / 2, y: h * 0.82, size: 28, col: '#ffff00', glow: 0 },
        { text: '< > TO CHANGE', x: w / 2, y: h * 0.92, size: 7, col: '#ffffff', glow: 0 },
    ]
    return lines.filter((l) => !l.blink || Math.floor(tick / 24) % 2 === 0)
}

export const estWidth = (l) => CHAR_EM * l.size * l.text.length
