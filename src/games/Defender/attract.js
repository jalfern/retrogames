// DEFENDER attract layout — the single source of truth the shell draws from
// and attractcheck audits. Rule 6 (#365): one informational message at a time,
// cycling, nothing clipped. The old attract stacked "ATTRACT MODE" over
// "PRESS ANY KEY TO START" at once — a wall of text on the demo, plus the
// harness-y "ATTRACT MODE" label leaked onto the title screen.

import { cycleAttract } from '../../utils/attractLines.js'

export const HOLD = 144

export const INFO_MSGS = [
    'ARROWS: THRUST & TURN',
    'SPACE: FIRE',
    'RESCUE THE LANDERS',
    'WATCH THE MINIMAP',
]

export const PRESS = 'PRESS ANY KEY TO START'
export const DIM = 'rgba(0,0,0,0.55)'

const CHAR_EM = 0.6

const fitSize = (text, w, max) => Math.max(9, Math.min(max, Math.floor((w * 0.92) / (CHAR_EM * text.length))))

export function attractFrame(tick, w, h) {
    const msg = cycleAttract(tick, INFO_MSGS, HOLD)
    const lines = [
        { text: 'DEFENDER', x: w / 2, y: h * 0.26, size: fitSize('DEFENDER', w, Math.floor(h * 0.16)), col: '#ff4d4d', glow: 0 },
        { text: msg, x: w / 2, y: h * 0.42, size: fitSize(msg, w, 15), col: '#9fe39f', glow: 0 },
        { text: PRESS, x: w / 2, y: h * 0.58, size: fitSize(PRESS, w, 18), col: '#ffd23f', glow: 0, blink: true },
    ]
    return lines.filter((l) => !l.blink || Math.floor(tick / 24) % 2 === 0)
}

export const estWidth = (l) => CHAR_EM * l.size * l.text.length
