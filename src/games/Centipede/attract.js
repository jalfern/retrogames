// CENTIPEDE attract layout — the single source of truth the shell draws from
// and attractcheck audits. Rule 6 (#365): one informational message at a time,
// cycling, nothing clipped. The old attract stacked "ATTRACT MODE" over
// "PRESS ANY KEY" at once, while a third "PRESS SPACE" line and the HUD title
// collided on the demo — a wall of text plus a harness-y "ATTRACT MODE" label.

import { cycleAttract } from '../../utils/attractLines.js'

export const HOLD = 144

export const INFO_MSGS = [
    'ARROWS: MOVE',
    'SPACE: FIRE',
    'SHOOT THE CENTIPEDE',
    'MUSHROOMS SLOW IT DOWN',
]

export const PRESS = 'PRESS ANY KEY TO START'
export const DIM = 'rgba(0,0,0,0.55)'

const CHAR_EM = 0.6

const fitSize = (text, w, max) => Math.max(9, Math.min(max, Math.floor((w * 0.92) / (CHAR_EM * text.length))))

export function attractFrame(tick, w, h) {
    const msg = cycleAttract(tick, INFO_MSGS, HOLD)
    const lines = [
        { text: 'CENTIPEDE', x: w / 2, y: h * 0.26, size: fitSize('CENTIPEDE', w, Math.floor(h * 0.16)), col: '#ff5c8a', glow: 0 },
        { text: msg, x: w / 2, y: h * 0.42, size: fitSize(msg, w, 15), col: '#9aa4b2', glow: 0 },
        { text: PRESS, x: w / 2, y: h * 0.58, size: fitSize(PRESS, w, 18), col: '#ffd23f', glow: 0, blink: true },
    ]
    return lines.filter((l) => !l.blink || Math.floor(tick / 24) % 2 === 0)
}

export const estWidth = (l) => CHAR_EM * l.size * l.text.length
