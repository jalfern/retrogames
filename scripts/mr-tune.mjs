import { makeGame, step, autoPad, stateHash } from '../src/games/MarbleRush/sim.js'
import { STAGES } from '../src/games/MarbleRush/course.js'
const times = []
for (let stage = 0; stage < 5; stage++) {
    const ts = []
    for (const seed of [1, 7, 42, 99]) {
        const gs = makeGame(seed, stage)
        let guard = 0
        while (!gs.done && guard < 60 * 200) { step(gs, autoPad(gs)); guard++ }
        ts.push(gs.done && !gs.fail ? gs.t : null)
        if (gs.fail) console.log(`  stage ${stage + 1} seed ${seed}: FAIL s=${gs.s.toFixed(1)} u=${gs.u.toFixed(2)} t=${gs.t.toFixed(1)} v=${gs.v.toFixed(1)}`)
    }
    times.push(ts)
    console.log(`stage ${stage + 1} (${STAGES[stage].name}): times ${ts.map(t => t === null ? 'FAIL' : t.toFixed(1)).join(' ')} | medals ${STAGES[stage].medals.join('/')}`)
}
