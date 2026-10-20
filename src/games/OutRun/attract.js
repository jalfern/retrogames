// OUT RUN attract layout — the single source of truth the shell draws from
// and attractcheck audits. Rule 6 (#365): one informational message at a
// time, cycling, nothing clipped. The old attract stacked two static rules
// lines ("STEER + GAS…" over "BEAT THE CLOCK…") over the demo at once; they
// are now one cycling slot, and the tagline joins the cycle.

import { cycleAttract } from '../../utils/attractLines.js'

export const HOLD = 144

export const INFO_MSGS = [
    'SEGAL 1986 · SUNSET HIGHWAY',
    'STEER · GAS · BRAKE · GEARS',
    'BEAT THE CLOCK',
    'FORK YOUR ROUTE · 5 GOALS',
]

export const PRESS = 'PRESS ANY KEY TO START'
export const DIM = 'rgba(3,4,12,0.55)'

const CHAR_EM = 0.6

const fitSize = (text, w, max) => Math.max(9, Math.min(max, Math.floor((w * 0.92) / (CHAR_EM * text.length))))

export function attractFrame(tick, w, h, hi = 0) {
    const msg = cycleAttract(tick, INFO_MSGS, HOLD)
    const title = 'OUT RUN'
    const hiLine = `HI-SCORE ${String(hi).padStart(6, '0')}`
    const lines = [
        { text: title, x: w / 2, y: h * 0.26, size: fitSize(title, w, Math.floor(h * 0.15)), col: '#ff5d5d', glow: 18 },
        { text: msg, x: w / 2, y: h * 0.42, size: fitSize(msg, w, 10), col: '#5d7094', glow: 0 },
        { text: PRESS, x: w / 2, y: h * 0.58, size: fitSize(PRESS, w, 18), col: '#e9f7ff', glow: 4, blink: true },
        { text: hiLine, x: w / 2, y: h * 0.70, size: fitSize(hiLine, w, 9), col: '#ffd23f', glow: 3 },
    ]
    return lines.filter((l) => !l.blink || Math.floor(tick / 24) % 2 === 0)
}

export const estWidth = (l) => CHAR_EM * l.size * l.text.length
