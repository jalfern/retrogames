// COMET DRIFT HD bank voices (#478 item 5). Node-safe: pure data + a pure
// mapper, so cometdrifthdcheck pins the ladder's voices without a browser or
// an AudioContext. index.jsx dispatches each op to audioController.
//
// Each tier already has its own whoosh (#471 item 7). GOLD adds a bell chime
// the other two never ring: an ascending sine arpeggio that tops out on a high
// sparkle, so banking the top tier sounds earned, not just louder.

export const GOLD_BELL = 3136 // G7 — the sparkle only GOLD rings

// [freq, dur, type, vol, delay] — rising, short, pure (bell, not chiptune square)
export const GOLD_CHIME = [
    [1568, 0.16, 'sine', 0.10, 0.00],
    [2093, 0.16, 'sine', 0.09, 0.07],
    [2637, 0.22, 'sine', 0.08, 0.14],
    [GOLD_BELL, 0.28, 'sine', 0.07, 0.21],
]

// The bank voices for a COMET tier: whoosh ladder, plus the gold bell on tier 2.
export function bankVoices(tier) {
    const v = []
    if (tier === 0) v.push({ k: 'sweep', a: 340, b: 900, d: 0.3, t: 'square', g: 0.1 })
    else if (tier === 1) {
        v.push({ k: 'sweep', a: 240, b: 1150, d: 0.42, t: 'sawtooth', g: 0.11 })
        v.push({ k: 'tone', f: 1240, d: 0.09, t: 'square', g: 0.07 })
    } else {
        v.push({ k: 'sweep', a: 180, b: 1450, d: 0.55, t: 'sawtooth', g: 0.12 })
        v.push({ k: 'noise', d: 0.22, g: 0.1 })
        for (const c of GOLD_CHIME) v.push({ k: 'tone', f: c[0], d: c[1], t: c[2], g: c[3], delay: c[4] })
    }
    return v
}
