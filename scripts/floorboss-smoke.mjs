import { makeGame, step, state, createAutopilot, QUOTA, SHIFT } from '../src/games/FloorBoss/sim.js'

const seed = Number(process.argv[2] || 7)
const gs = makeGame(seed)
const ap = createAutopilot()
let lastEv = new Set()
while (!gs.end && gs.tick < SHIFT + 10) {
    step(gs, [ap(gs)])
    for (const e of gs.ev) {
        const key = `${e.type}:${Math.floor(gs.tick / 300)}`
        if (!lastEv.has(key)) { lastEv.add(key); console.log(gs.tick, JSON.stringify(e)) }
    }
}
const s = state(gs)
console.log('END', s.end, s.endReason, 'score', s.score, '/', QUOTA, 'shipped', s.shipped, 'expired', s.expired, 'stows', s.stows, 'racks', s.racks.length, 'robots', s.robots.length, 'ticks', s.tick)
