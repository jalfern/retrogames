import { makeGame, stepGame, TABLE } from '../src/games/Pinball/sim.js'
const gs = makeGame(140)
console.log('initial balls:', gs.pucks.length, 'launched:', gs.launched)
gs.launched = true
gs.pucks.length = 0
gs.spinnerTurns = 0; gs.rampLHits = 0; gs.rampLLit = false; gs.score = 0; gs.kbLUsed = false
const bx = Math.round((TABLE.rampL.x1 + TABLE.rampL.x2) / 2)
console.log('fed at bx', bx, 'range', TABLE.rampL.x1, TABLE.rampL.x2)
gs.pucks.push({ bx, by: 400, vx: 0, vy: -520, prevY: 400, launched: true, laneCurved: false, spin: 0, spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false, magHeld: false, magHoldT: 0 })
for (let t = 0; t < 600; t++) {
  stepGame(gs, 1000 / 60)
  const p = gs.pucks[0]
  if (t % 20 === 0 || gs.spinnerTurns > 0) {
    console.log(`t=${t} bx=${p.bx.toFixed(1)} by=${p.by.toFixed(1)} vy=${p.vy?.toFixed(0)} spinnerTurns=${gs.spinnerTurns} rampLHits=${gs.rampLHits} lit=${gs.rampLLit} kbL=${gs.kbLUsed}`)
  }
}
console.log('FINAL spinnerTurns', gs.spinnerTurns, 'rampLHits', gs.rampLHits, 'lit', gs.rampLLit, 'kbLUsed', gs.kbLUsed)
