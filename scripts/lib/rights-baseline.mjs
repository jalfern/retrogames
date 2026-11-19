// QA #2787 helper — counts commit-time (pre-tick) liveRights violations across
// audited autopilot careers. Run pre-law and post-law to measure the delta.
import { makeGame, step, createAutopilot, liveRights, SHIFT } from '../../src/games/FloorBoss/sim.js'
const seeds = process.argv[2] ? process.argv[2].split(',').map(Number) : [1337, 107, 4242, 42, 55]
let total = 0
const per = {}
for (const seed of seeds) {
    const gs = makeGame(seed)
    const ap = createAutopilot()
    let n = 0
    while (!gs.end && gs.tick < SHIFT + 10) {
        n += liveRights(gs).length // commit-time (pre-tick) occupancy — post-tick fabricates same-cadence cross-clips (#2783 law)
        step(gs, [ap(gs)])
    }
    per[seed] = n
    total += n
}
console.log(JSON.stringify({ per, total, won: Object.keys(per).length }))
