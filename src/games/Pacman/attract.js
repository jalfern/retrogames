// PAC-MAN attract layout — the single source of truth the shell draws from
// and pacmancheck audits. Rule 6 (#365): one informational message at a
// time, cycling, and no text over ghost art — the maze dims behind the
// attract lines and the old static "ATTRACT MODE" + prompt pair becomes a
// single cycling slot.

import { cycleAttract } from '../../utils/attractLines.js'
import { COLS, ROWS, CELL_SIZE } from './move.js'

export const W = COLS * CELL_SIZE
export const H = ROWS * CELL_SIZE
export const HOLD = 144
export const DIM = 'rgba(0,0,0,0.62)'

export const INFO_MSGS = [
    'EAT EVERY DOT — DODGE THE GHOSTS',
    'A POWER PELLET FLIPS THE HUNT',
]

export const pressMsg = (touch) => (touch ? 'TAP TO START' : 'PRESS ARROW KEYS TO START')

const CHAR_EM = 0.6

export function attractFrame(tick, touch) {
    const msg = cycleAttract(tick, INFO_MSGS, HOLD)
    const lines = [
        { text: msg, x: W / 2, y: H / 2 - 24, size: 10, col: '#ffd23f', glow: 0 },
        { text: pressMsg(touch), x: W / 2, y: H / 2 + 8, size: 14, col: '#ffffff', glow: 0, blink: true },
    ]
    return lines.filter((l) => !l.blink || Math.floor(tick / 24) % 2 === 0)
}

export const estWidth = (l) => CHAR_EM * l.size * l.text.length
