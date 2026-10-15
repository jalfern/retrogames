// GAUNTLET — synthesized audio signatures (issue #275 item 5, sound pass).
// Pure data + a pure classifier: index.jsx plays it through the AudioController,
// gauntletcheck asserts the rules in plain Node. No canvas, no audio at import.
//
// Every narrator line type has its OWN buzz signature (a short arpeggio of
// note frequencies with its own waveform) so the strip's lines read as
// distinct voice, and the stairs-clear is a 4-note fanfare rather than one sweep.

export const NARRATOR = {
    enter:   { wave: 'square',   notes: [392, 523] },
    intro:   { wave: 'triangle', notes: [330, 415] },
    death:   { wave: 'sawtooth', notes: [196, 147, 98] },
    warn:    { wave: 'sawtooth', notes: [220, 262, 220] },
    reward:  { wave: 'square',   notes: [523, 659, 784] },
    cleared: { wave: 'triangle', notes: [659, 880, 1047] },
}

// stairs-clear: C-E-G-C, four distinct rising notes (was a single 330->990 sweep)
export const STAIRS_FANFARE = [523, 659, 784, 1047]

// route a narrator line to its buzz signature by its narrative role
export const narratorKind = (m) => {
    const t = String(m).toUpperCase()
    if (/DEATH|DEAD/.test(t)) return 'death'
    if (/SEALED|LOCKED|FIND A KEY|NEEDS FOOD/.test(t)) return 'warn'
    if (/RESTORED|DONE|A KEY|HALLS CLEAR/.test(t)) return 'reward'
    if (/ENTERS/.test(t)) return 'enter'
    if (/CLEARED/.test(t)) return 'cleared'
    return 'intro'
}

export const buzz = (kind) => NARRATOR[kind] || NARRATOR.intro
