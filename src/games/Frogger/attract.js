// FROGGER attract layout — the single source of truth the shell draws from
// and froggercheck audits. Rule 6 (#365): one informational message at a time,
// cycling, nothing clipped. The old attract stacked "GET ACROSS. DON'T GET
// FLATTENED." over "HOP ON LOGS - AVOID THE TURTLES' NAPS" at once, a wall of
// rules text on the demo. The canvas is fixed 260x266 (13 cols x 20px, HUD 26);
// lines stay inside the dimmed gameplay area below the HUD.

import { cycleAttract } from '../../utils/attractLines.js'

export const HOLD = 144
export const HUD = 26

export const INFO_MSGS = [
    'GET ACROSS',
    'HOP ON LOGS',
    'DON\'T GET FLATTENED',
    'AVOID THE TURTLES\' NAPS',
]

export const PRESS = 'TAP OR PRESS ANY KEY'
export const DIM = 'rgba(0,0,0,0.55)'

const CHAR_EM = 0.6

const fitSize = (text, w, max) => Math.max(9, Math.min(max, Math.floor((w * 0.92) / (CHAR_EM * text.length))))

export function attractFrame(tick, w, h, hud = HUD) {
    const msg = cycleAttract(tick, INFO_MSGS, HOLD)
    const region = h - hud
    const lines = [
        { text: 'FROGGER', x: w / 2, y: hud + region * 0.36, size: fitSize('FROGGER', w, 26), col: '#5adb5a', glow: 0 },
        { text: msg, x: w / 2, y: hud + region * 0.52, size: fitSize(msg, w, 11), col: '#ffffff', glow: 0 },
        { text: PRESS, x: w / 2, y: hud + region * 0.70, size: fitSize(PRESS, w, 11), col: '#ffe14d', glow: 0, blink: true },
    ]
    return lines.filter((l) => !l.blink || Math.floor(tick / 24) % 2 === 0)
}

export const estWidth = (l) => CHAR_EM * l.size * l.text.length
