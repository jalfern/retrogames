// GAUNTLET attract layout — the single source of truth the shell draws from
// and attractcheck audits. Rule 6 (#365): one informational message at a time,
// cycling, and nothing over the HUD band. The old attract stacked the tagline,
// a blinking prompt, the hi-score and a "DEMO PLAYS THE PROVEN FULL QUEST"
// caption at y = CH-14 — the caption sat directly over the HUD strip's level
// name, the HI readout and the JALFERN.COM watermark. The canvas is fixed
// 320x240 (view 256x200 + panel 64, HUD band HT=40); every line here lands
// above y=200 at real size, pinned by gauntletcheck.

import { cycleAttract } from '../../utils/attractLines.js'

export const HOLD = 144
export const HUD = 40

export const INFO_MSGS = [
    'ARROWS WALK AND FACE',
    'SPACE SWINGS THE SWORD',
    'X LOOSES THE ARROWS',
    'FOOD HOLDS OFF DEATH',
    'V SUMMONS THE VOICE',
    'TEN MAZES AWAITS',
]

// #1641: while the trained net actually holds seat 2 in the live demo, the
// ticker says so — these lines join the cycle ONLY when netdemo is driving
// (the shell passes them; the planner-replay fallback keeps INFO_MSGS and
// stops claiming the brain). Same fit rule: one short line.
export const NET_MSGS = [...INFO_MSGS, 'BC NET PLAYS SEAT 2', 'HELD-OUT 8/8 WINS']

export const PRESS = 'PRESS ANY KEY TO CHOOSE'
import { WATCH_ATTRACT_HINT } from '../../utils/watch.js'

export const DIM = 'rgba(3,3,12,0.55)'

const CHAR_EM = 0.6

const fitSize = (text, w, max) => Math.max(9, Math.min(max, Math.floor((w * 0.92) / (CHAR_EM * text.length))))

export function attractFrame(tick, w, h, hud = HUD, hi = 0, msgs = INFO_MSGS) {
    const msg = cycleAttract(tick, msgs, HOLD)
    const lines = [
        { text: msg, x: w / 2, y: h * 0.42, size: fitSize(msg, w, 10), col: '#8fa3d8', glow: 0 },
        { text: PRESS, x: w / 2, y: Math.min(h * 0.58, h - hud - 40), size: fitSize(PRESS, w, 18), col: '#e9f7ff', glow: 0, blink: true },
        { text: WATCH_ATTRACT_HINT, x: w / 2, y: Math.min(h * 0.64, h - hud - 32), size: fitSize(WATCH_ATTRACT_HINT, w, 9), col: '#8fa3d8', glow: 0 },
        { text: `HI-SCORE ${String(hi).padStart(6, '0')}`, x: w / 2, y: Math.min(h * 0.70, h - hud - 24), size: 8, col: '#5dc8ff', glow: 0 },
    ]
    return lines.filter((l) => !l.blink || Math.floor(tick / 24) % 2 === 0)
}

export const estWidth = (l) => CHAR_EM * l.size * l.text.length
