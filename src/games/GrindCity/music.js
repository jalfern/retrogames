// GRIND CITY — the music bed + impact pitch law (#3167).
// Pure code, no DOM/AudioContext: the cabinet schedules these voices from its
// sim ticks (pause stops the clock → the bed stops too; the replay runs the
// sim's silent path). grindcheck proves the laws; gcdrive proves the wiring.
// The groove is ours — an original sunbaked A-minor pentatonic loop, nothing
// sampled or borrowed.

export const STEP = 7   // sim ticks per eighth note — ~129 BPM at 60 Hz
export const BAR = 16   // eighths per loop

// Bass: syncopated, low, triangle. A–F–G walk under the line.
const BASS = { 0: 110.0, 3: 110.0, 6: 87.31, 8: 110.0, 11: 98.0, 14: 82.41 }
// Riff: pentatonic answer-phrase, quiet square so SFX stay on top.
const RIFF = { 2: 587.33, 5: 659.25, 7: 440.0, 10: 523.25, 13: 880.0 }

// Voices for eighth-note index i (any integer — wraps into the bar).
// Tone: {f, d, g, type}; hat: {hat:true, d, g}. Rests return fewer voices.
export function bedVoices(i) {
    const s = ((i % BAR) + BAR) % BAR
    const v = []
    if (BASS[s] !== undefined) v.push({ f: BASS[s], d: 0.22, g: 0.05, type: 'triangle' })
    if (RIFF[s] !== undefined) v.push({ f: RIFF[s], d: 0.09, g: 0.028, type: 'square' })
    if (s % 2 === 1) v.push({ hat: true, d: 0.03, g: 0.016 })
    return v
}

// Landing thud law (#3167): more air in = heavier sound out.
// v is the sim's |vy| at touchdown (0.4..9). Pitch falls and gain rises
// monotonically with impact — the "height-scaled" weight the gap brief owed.
export function landThud(v) {
    const k = Math.max(0, Math.min(9, isFinite(v) ? v : 0))
    return { f: Math.max(58, 172 - k * 13), g: Math.min(0.24, 0.05 + k * 0.022), d: 0.10 + k * 0.012 }
}
