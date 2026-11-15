// GARDEN GUARD sound spine (#2336) — the pure, provable half of the audio.
// sim.js stays DOM-free and plays nothing; the shell does the actual
// scheduling through AudioController. What lives HERE is the mapping the
// game owes the player at the moments the fleet's law names — win and lose —
// as plain data + a recorder-friendly `endCue`, so gardencheck can drive a
// real won run and a real lost run and PROVE each fires its sting once,
// without a browser. The bed name lives here too so the check can pin that
// the shell starts exactly the bed the synth engine carries.

// the sustained bed the lawn plays under (name in AudioController.MUSIC)
export const BED = 'garden'

// The end-of-game sting as a list of synth steps:
// ['tone', freq, dur, type, vol, delay] | ['sweep', f0, f1, dur, type, vol, delay]
// Win: the fleet's up-fanfare; lose: a soft minor fall, lower than the
// breach sweep so defeat reads differently from a lost lane.
const DESCEND = [
    [64, 0], [60, 0.11], [57, 0.22], [52, 0.33],
]
export function endSteps(done) {
    if (done === 'win') return [['fanfare']]
    if (done === 'lose') {
        return DESCEND.map(([n, d]) => ['tone', 440 * Math.pow(2, (n - 69) / 12), 0.22, 'square', 0.09, d])
    }
    return []
}

// play/drain the end sting on any sink (real AudioController in the shell,
// a recorder in gardencheck). Returns how many cues the sink was asked for —
// 0 for an unfinished game — so callers and checks count from one source.
export function endCue(done, ac) {
    const steps = endSteps(done)
    if (!ac || !steps.length) return 0
    if (done === 'win') ac.playFanfare()
    else for (const st of steps) ac.playTone(...st.slice(1))
    return steps.length
}
