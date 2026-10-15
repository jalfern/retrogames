// TETRIS (NES) — the per-action sound set as pure data (issue #214).
// music.js owns the Korobeiniki tempo; this owns the SFX the shell plays on
// each sim event. Pure so scripts/tetrischeck.mjs can pin the VARIETY: no two
// actions may share a signature, and a line-clear must get a longer, higher
// arpeggio as it clears more rows (a Tetris is its own fanfare). The shell
// (index.jsx) turns each descriptor into an audioController call — nothing in
// here touches the Web Audio API.

// tone  = one playTone(f, dur, wave, vol)
// noise = one playNoise(dur, vol)
// seq   = an arpeggio: playTone for each note, gap seconds apart
// death = playDeath()
export const SFX = {
    rot:   { kind: 'tone',  f: 620,  dur: 0.04, wave: 'square', vol: 0.05 },
    drop:  { kind: 'tone',  f: 150,  dur: 0.03, wave: 'square', vol: 0.05 },
    lock:  { kind: 'noise', dur: 0.035, vol: 0.10 },
    level: { kind: 'seq',   notes: [880, 1175], gap: 0.09, dur: 0.14, wave: 'square', vol: 0.07 },
    over:  { kind: 'death' },
}

// A line-clear arpeggio that grows with the clear: one note per row on a
// rising scale; a Tetris (4) is a separate, higher fanfare so the best clear
// is unmistakable in the mix.
const CLEAR_SCALE = [392, 523, 659, 784]     // G4 C5 E5 G5
const TETRIS_FANFARE = [523, 659, 784, 1046] // C5 E5 G5 C6

export function clearSfx(n) {
    const k = Math.max(1, Math.min(4, n | 0))
    if (k === 4) return { kind: 'seq', notes: TETRIS_FANFARE, gap: 0.05, dur: 0.12, wave: 'square', vol: 0.09 }
    return { kind: 'seq', notes: CLEAR_SCALE.slice(0, k), gap: 0.06, dur: 0.10, wave: 'square', vol: 0.07 }
}

// A canonical, comparable string for a descriptor — the thing the harness
// pins. Two descriptors with the same sig would be indistinguishable by ear.
export function sig(spec) {
    if (!spec) return ''
    if (spec.kind === 'tone') return `tone:${spec.f}:${spec.dur}:${spec.wave || 'square'}`
    if (spec.kind === 'noise') return `noise:${spec.dur}:${spec.vol}`
    if (spec.kind === 'seq') return `seq:${spec.notes.join('_')}:${spec.gap}:${spec.dur}`
    return spec.kind
}
