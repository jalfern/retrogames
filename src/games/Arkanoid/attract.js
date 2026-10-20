// ARKANOID attract layout — the single source of truth the shell draws from
// and arkanoidcheck audits. Rule 6 (#365): one informational message at a
// time, cycling, and nothing in the paddle keep-out band below.

import { W, CFG } from './sim.js'
import { cycleAttract } from '../../utils/attractLines.js'

export const PADDLE_TOP = CFG.paddleY
export const HOLD = 144 // ~2.4s per message at 60fps

export const INFO_MSGS = [
    'BREAK THE WALLS — SLAY DOH',
    'DEMO PLAYS THE PROVEN FULL CLEAR',
]

// The lines the attract screen draws this frame. The press prompt blinks; the
// two INFO_MSGS collapse into one cycling slot so the demo never gets a wall.
export function attractFrame(tick, hiScore) {
    const msg = cycleAttract(tick, INFO_MSGS, HOLD)
    const lines = [
        { text: 'ARKANOID', x: W / 2, y: 76, size: 26, col: '#ff5db0', glow: 12 },
        { text: msg, x: W / 2, y: 110, size: 8, col: '#8fa3d8', glow: 0 },
        { text: 'PRESS ANY KEY TO START', x: W / 2, y: 132, size: 9, col: '#ffd23f', glow: 5, blink: true },
        { text: `HI-SCORE ${String(hiScore).padStart(6, '0')}`, x: W / 2, y: 152, size: 8, col: '#5dc8ff', glow: 3 },
    ]
    return lines.filter((l) => !l.blink || Math.floor(tick / 24) % 2 === 0)
}
