// MISSILE COMMAND attract layout — the single source of truth the shell draws
// from and attractcheck audits. Rule 6 (#365): one informational message at a
// time, cycling, nothing clipped. The old attract stacked "ATTRACT MODE" (a
// harness leak) over "CLICK TO START" with no dim over the undimmed demo.

import { cycleAttract } from '../../utils/attractLines.js'

export const HOLD = 144

export const INFO_MSGS = [
    'MOVE THE MOUSE TO AIM',
    'CLICK TO FIRE ABMS',
    'SIX CITIES TO DEFEND',
    'SPLASH DAMAGES WARHEADS',
    // #3695: the arcade's own three buttons — keys now name the battery.
    'KEYS 1 2 3 FIRE EACH BATTERY',
    // #3630 slice 2: advertise the hot-seat — one wave each, both scores up.
    'PRESS 2 FOR TWO PLAYER',
    // #3698 item 3: the wave-7 threat gets its own ad line — the scripted
    // sighting below teaches the bend, this one names it.
    'SMART BOMBS EVADE BLASTS',
]

export const PRESS = 'PRESS ANY KEY TO START'
export const DIM = 'rgba(0,0,0,0.55)'

const CHAR_EM = 0.6

const fitSize = (text, w, max) => Math.max(9, Math.min(max, Math.floor((w * 0.92) / (CHAR_EM * text.length))))

export function attractFrame(tick, w, h) {
    const msg = cycleAttract(tick, INFO_MSGS, HOLD)
    const lines = [
        { text: 'MISSILE COMMAND', x: w / 2, y: h * 0.26, size: fitSize('MISSILE COMMAND', w, Math.floor(h * 0.16)), col: '#ff0000', glow: 0 },
        { text: msg, x: w / 2, y: h * 0.42, size: fitSize(msg, w, 15), col: '#00ffff', glow: 0 },
        { text: PRESS, x: w / 2, y: h * 0.58, size: fitSize(PRESS, w, 18), col: '#ffffff', glow: 0, blink: true },
    ]
    return lines.filter((l) => !l.blink || Math.floor(tick / 24) % 2 === 0)
}

export const estWidth = (l) => CHAR_EM * l.size * l.text.length
