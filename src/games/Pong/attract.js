// PONG attract layout — the single source of truth the shell draws from
// and pongcheck audits. Rule 6 (#365): one informational message at a time,
// cycling, and nothing clipped at the frame edge — the old attract stacked
// "ATTRACT MODE" over a 40px "PRESS ARROW KEYS TO START" that overflowed
// the 600px-wide canvas.

import { cycleAttract } from '../../utils/attractLines.js'

export const HOLD = 144

export const INFO_MSGS = [
    'UP/DOWN MOVE YOUR PADDLE',
    'THE RIGHT PADDLE IS THE CPU',
]

export const PRESS = 'PRESS ARROW KEYS TO START'
export const DIM = 'rgba(0,0,0,0.55)'

const CHAR_EM = 0.6

const fitSize = (text, w, max) => Math.max(9, Math.min(max, Math.floor((w * 0.92) / (CHAR_EM * text.length))))

export function attractFrame(tick, w, h) {
    const msg = cycleAttract(tick, INFO_MSGS, HOLD)
    const lines = [
        { text: 'PONG', x: w / 2, y: h * 0.26, size: fitSize('PONG', w, Math.floor(h * 0.16)), col: '#ffffff', glow: 0 },
        { text: msg, x: w / 2, y: h * 0.42, size: fitSize(msg, w, 15), col: '#9aa4b2', glow: 0 },
        { text: PRESS, x: w / 2, y: h * 0.58, size: fitSize(PRESS, w, 18), col: '#ffd23f', glow: 0, blink: true },
    ]
    return lines.filter((l) => !l.blink || Math.floor(tick / 24) % 2 === 0)
}

export const estWidth = (l) => CHAR_EM * l.size * l.text.length
