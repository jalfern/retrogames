// Q*BERT — the pure SFX recipe table: one sim event -> a list of player ops.
// Zero DOM, zero audioController — scripts/qbertcheck.mjs pins the contract
// against THIS table in plain Node, both ways: every event the sim emits is
// either voiced (VOICED) or explicitly silent (SILENT), and every voice in
// the table is heard in the sim. The shell (index.jsx) is a dumb player: it
// runs each op through audioController and nothing else.
//
// Op shapes (all times in seconds):
//   tone:  { k: 'tone',  at, f, d, type, v }        fixed pitch, starts at `at`
//   sweep: { k: 'sweep', f0, f1, d, type, v }       linear f0 -> f1, now (playSweep
//                                                   has no delay seam, so sweeps
//                                                   never carry `at`)
//   fanfare / jingle: { k: 'fanfare' } | { k: 'jingle' }  -> playFanfare / playDeath

const note = (at, f, d = 0.06, type = 'square', v = 0.08) => ({ k: 'tone', at, f, d, type, v })
const sweep = (f0, f1, d, type = 'triangle', v = 0.08) => ({ k: 'sweep', f0, f1, d, type, v })

// Contract: the event types that MUST make a sound. `points` is voiced per
// score (25 / 50 / 100); every other type is keyed on `t` alone.
export const VOICED = [
    'hop', 'points', 'discride', 'snakespawn', 'snakelure', 'ballspawn',
    'runnerspawn', 'slickspawn', 'slickwipe', 'death', 'clear', 'over',
    'oneup', 'coilyhop',
]

// Contract: events the sim emits that are silent on purpose.
export const SILENT = ['land', 'fall']

export function sfxFor(e) {
    if (!e || typeof e.t !== 'string') return []
    switch (e.t) {
        case 'hop':
            return [sweep(520, 880, 0.07, 'square', 0.05)]
        case 'points':
            // the ledger's three voices, each its own shape:
            if (e.pts === 100) {
                // heli-jump: coin-timbre up-arpeggio, four bright staccato notes
                return [note(0, 880), note(0.045, 1109), note(0.09, 1319), note(0.135, 1760, 0.12)]
            }
            if (e.pts === 50) {
                // round trip: a two-note up-arpeggio — audible, but plainly
                // smaller than the heli
                return [note(0, 988), note(0.05, 1319, 0.1)]
            }
            return [note(0, 980, 0.05, 'square', 0.06)]
        case 'discride':
            return [sweep(300, 900, 0.25, 'triangle', 0.08)]
        case 'snakespawn':
            return [sweep(180, 90, 0.25, 'sawtooth', 0.08)]
        case 'snakelure':
            return [sweep(900, 200, 0.3, 'triangle', 0.09)]
        case 'ballspawn':
            return [note(0, 240, 0.05, 'square', 0.05)]
        case 'runnerspawn':
            return [sweep(220, 320, 0.12, 'square', 0.05)]
        case 'slickspawn':
            return [sweep(140, 60, 0.3, 'sawtooth', 0.07)]
        case 'slickwipe':
            return [note(0, 180, 0.04, 'triangle', 0.04)]
        case 'death':
            return [sweep(600, 120, 0.4, 'square', 0.1)]
        case 'clear':
            return [{ k: 'fanfare' }]
        case 'over':
            return [{ k: 'jingle' }]
        case 'oneup':
            // the 1-up jingle: four rising notes, the classic "you earned a life"
            return [note(0, 784), note(0.05, 988), note(0.1, 1175), note(0.15, 1568, 0.12)]
        case 'coilyhop':
            // Coily's iconic drop tick: one soft descending boing
            return [sweep(392, 110, 0.26, 'triangle', 0.07)]
        default:
            return []
    }
}
