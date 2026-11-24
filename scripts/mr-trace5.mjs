import { makeGame, step, autoPad } from '../src/games/MarbleRush/sim.js'
const gs = makeGame(1, 4)
while (!gs.done) {
    const pad = autoPad(gs)
    step(gs, pad)
    if (gs.tick % 15 === 0 || gs.events.length) console.log(`t=${gs.t.toFixed(2)} s=${gs.s.toFixed(1)} u=${gs.u.toFixed(2)} v=${gs.v.toFixed(2)} air=${gs.air} th=${pad.throttle} br=${pad.brake ? 1 : 0} ev=${gs.events.map(e => e.type).join(',')}`)
}
