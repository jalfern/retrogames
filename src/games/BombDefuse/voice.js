// BOMB DEFUSE — spoken-command grammar (#1711). Heard words are COACHING:
// they pulse the matching control but never act (#1247 — the pad commits).
// Every phrase banks a voiceCmd through recordVoiceCmd in the shell.
// #1812 item 9: colour+wire pairs, a WAIT warning pulse, urgency words, and
// letter-tolerance for the recogniser's common mis-hears (read→red).

const COLOR_WORDS = { RED: 0, BLUE: 1, GREEN: 2, YELLOW: 3 }
const SYNC_WORDS = ['BOTH', 'TOGETHER', 'SYNC', 'TURN', 'KEYS', 'HURRY', 'NOW', 'FASTER', 'QUICK', 'FAST']
const HOLD_WORDS = ['HOLD', 'VENT', 'STEADY', 'STABILIZE', 'BAR', 'PIN']
const SEAT_WORDS = ['SEAT', 'PRESS', 'GAUGE', 'NEEDLE', 'GREEN']
const WARN_WORDS = ['WAIT', 'NO', 'STOP', 'EASE']
const WIRE_WORDS = ['WIRE', 'WIRES', 'WIR']

// dmax(a, b, k) — is the Damerau-Levenshtein distance (no repeat transposes)
// between two same-case words at most k? Bounded: stops early, k ≤ 2.
function dmax(a, b, k) {
    if (a === b) return false // exact hits are handled before this
    if (Math.abs(a.length - b.length) > k) return false
    let prev2 = null
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
    for (let i = 1; i <= a.length; i++) {
        const cur = [i]
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            let d = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1)
            cur.push(d)
        }
        if (Math.min(...cur) > k) return false // whole frontier out of range
        prev2 = prev
        prev = cur
    }
    return prev[b.length] <= k
}

// nearColor(w) — a mis-heard colour? SHORT targets (RED) keep a tight leash of
// 1 edit or common words like "said" start coaching wires; 4+ letter colours
// take 2 because homophones mis-spell wide (blew→blue, gren→green).
function nearColor(w) {
    if (w.length < 3) return null
    for (const [word, color] of Object.entries(COLOR_WORDS)) {
        if (dmax(w, word, word.length >= 4 ? 2 : 1)) return color
    }
    return null
}

// parseCall(text) -> { kind:'color', color } | { kind:'sync' } | { kind:'hold', seat }
//                  | { kind:'seat', seat } | { kind:'warn' } | null
export function parseCall(text, holder = 0) {
    const up = String(text || '').toUpperCase().replace(/[^A-Z ]/g, ' ').trim()
    if (!up) return null
    const words = up.split(/\s+/)
    // A warning outranges everything: "NO, not that one!" must never coach a wire.
    if (words.some((w) => WARN_WORDS.includes(w))) return { kind: 'warn' }
    // A phrase that NAMES a wire coaches its colour first — that IS the step.
    const paired = words.some((w) => WIRE_WORDS.includes(w))
    if (paired) {
        for (const w of words) {
            const c = COLOR_WORDS[w]
            if (c !== undefined) return { kind: 'color', color: c }
        }
        for (const w of words) {
            const c = nearColor(w)
            if (c !== null) return { kind: 'color', color: c }
        }
    }
    // Action words name the step the crew is IN ("vent the red bar" → hold),
    // so they read before bare colours. GREEN lands here too: it drives the
    // needle to green — as a wire colour it needs the pairing above.
    for (const w of words) {
        if (SYNC_WORDS.includes(w)) return { kind: 'sync' }
        if (HOLD_WORDS.includes(w)) return { kind: 'hold', seat: holder }
        if (SEAT_WORDS.includes(w)) return { kind: 'seat', seat: 1 - holder }
    }
    // Bare colours coach the blade: "red!" → red.
    for (const w of words) {
        const c = COLOR_WORDS[w]
        if (c !== undefined) return { kind: 'color', color: c }
    }
    // Mis-hears of colours, last so real words win first: read→red, blew→blue.
    for (const w of words) {
        const c = nearColor(w)
        if (c !== null) return { kind: 'color', color: c }
    }
    return null
}
