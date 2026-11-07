// BOMB DEFUSE — spoken-command grammar (#1711). Heard words are COACHING:
// they pulse the matching control but never act (#1247 — the pad commits).
// Every phrase banks a voiceCmd through recordVoiceCmd in the shell.

const COLOR_WORDS = { RED: 0, BLUE: 1, GREEN: 2, YELLOW: 3 }
const SYNC_WORDS = ['BOTH', 'TOGETHER', 'SYNC', 'TURN', 'KEYS', 'HURRY', 'NOW']
const HOLD_WORDS = ['HOLD', 'VENT', 'STEADY', 'STABILIZE', 'BAR', 'PIN']
const SEAT_WORDS = ['SEAT', 'PRESS', 'GAUGE', 'NEEDLE', 'GREEN']

// parseCall(text) -> { kind:'color', color } | { kind:'sync' } | { kind:'hold', seat }
//                  | { kind:'seat', seat } | null
export function parseCall(text, holder = 0) {
    const up = String(text || '').toUpperCase().replace(/[^A-Z ]/g, ' ').trim()
    if (!up) return null
    for (const w of up.split(/\s+/)) {
        if (COLOR_WORDS[w] !== undefined) return { kind: 'color', color: COLOR_WORDS[w] }
    }
    for (const w of up.split(/\s+/)) {
        if (SYNC_WORDS.includes(w)) return { kind: 'sync' }
        if (HOLD_WORDS.includes(w)) return { kind: 'hold', seat: holder }
        if (SEAT_WORDS.includes(w)) return { kind: 'seat', seat: 1 - holder }
    }
    return null
}
