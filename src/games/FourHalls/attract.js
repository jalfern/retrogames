// FOUR HALLS attract layout — the single source of truth the shell draws from
// and attractcheck audits. Rule 6 (#365): one informational message at a time,
// cycling, and nothing over the HUD band. The old attract stacked the tagline,
// a blinking prompt, the hi-score and a "DEMO PLAYS THE PROVEN FULL QUEST"
// caption at y = CH-14 — the caption sat directly over the narrator strip's
// level name and the JALFERN.COM watermark. The canvas is fixed 320x240
// (view 224x200 + panel 96, HUD band HT=40); every line here lands above
// y=200 at real size.

import { cycleAttract } from '../../utils/attractLines.js'

export const HOLD = 144
export const HUD = 40

export const INFO_MSGS = [
    'ARROWS WALK AND TURN',
    'SPACE SWINGS THE SWORD',
    'X LOOSES THE ARROWS',
    'FOOD HOLDS OFF DEATH',
    'FOUR MAZES AWAITS',
]

export const PRESS = 'PRESS ANY KEY TO CHOOSE'
export const DIM = 'rgba(3,3,12,0.55)'

const CHAR_EM = 0.6

const fitSize = (text, w, max) => Math.max(9, Math.min(max, Math.floor((w * 0.92) / (CHAR_EM * text.length))))

export function attractFrame(tick, w, h, hud = HUD, hi = 0) {
    const msg = cycleAttract(tick, INFO_MSGS, HOLD)
    const lines = [
        { text: msg, x: w / 2, y: h * 0.42, size: fitSize(msg, w, 10), col: '#8fa3d8', glow: 0 },
        { text: PRESS, x: w / 2, y: Math.min(h * 0.58, h - hud - 40), size: fitSize(PRESS, w, 18), col: '#e9f7ff', glow: 0, blink: true },
        { text: `HI-SCORE ${String(hi).padStart(6, '0')}`, x: w / 2, y: Math.min(h * 0.70, h - hud - 24), size: 8, col: '#5dc8ff', glow: 0 },
    ]
    return lines.filter((l) => !l.blink || Math.floor(tick / 24) % 2 === 0)
}

export const estWidth = (l) => CHAR_EM * l.size * l.text.length
