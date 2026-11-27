// 1981-style cabinet tunes — original note tables, synthesized at runtime via
// AudioController (never a copy of any cabinet recording). The harness pins
// this file's shape: time-ordered, valid notes, strictly rising (verse),
// strictly fast-and-rising (one-up sting), strictly falling (game-over sting),
// and three DISTINCT tunes. #3703

// A4 = 440 Hz — the one absolute the era's cabinets had.
export const freqOf = midi => 440 * Math.pow(2, (midi - 69) / 12)

// Opening verse: a short rising carnival-organ run — the "the run begins"
// figure, played once when a crossing starts. 5 ascending notes.
export const OPENING_VERSE = [
    { midi: 60, dur: 0.09, at: 0.00, vol: 0.09 },
    { midi: 64, dur: 0.09, at: 0.10, vol: 0.09 },
    { midi: 67, dur: 0.09, at: 0.20, vol: 0.09 },
    { midi: 72, dur: 0.14, at: 0.30, vol: 0.10 },
    { midi: 76, dur: 0.22, at: 0.46, vol: 0.10 },
]

// One-up sting: a fast run-up against the ceiling — the classic bonus-life
// bugle, four quick notes and a hold. Distinct from the home chime (which
// spends its bottom octave) and from the game-over sting (which falls).
export const ONE_UP_STING = [
    { midi: 60, dur: 0.05, at: 0.00, vol: 0.10 },
    { midi: 64, dur: 0.05, at: 0.05, vol: 0.10 },
    { midi: 67, dur: 0.05, at: 0.10, vol: 0.10 },
    { midi: 72, dur: 0.05, at: 0.15, vol: 0.10 },
    { midi: 76, dur: 0.20, at: 0.20, vol: 0.11 },
]

// Game-over sting: a descending defeat figure — the last figure the player
// hears, distinct from every other one-shot and never overlapping a death's
// own splat/splash.
export const GAME_OVER_STING = [
    { midi: 72, dur: 0.12, at: 0.00, vol: 0.10 },
    { midi: 67, dur: 0.12, at: 0.13, vol: 0.10 },
    { midi: 64, dur: 0.13, at: 0.26, vol: 0.10 },
    { midi: 60, dur: 0.36, at: 0.41, vol: 0.11 },
]
