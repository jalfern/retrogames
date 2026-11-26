import { makeGame, stepGame, TABLE } from '../src/games/Pinball/sim.js'
const trace = (bx, vx, vy, label, ticks=140) => {
  const gs = makeGame(140)
  gs.launched = true
  gs.pucks.length = 0
  gs.spinnerTurns = 0; gs.rampLHits = 0; gs.rampLLit = false; gs.score = 0; gs.kbLUsed = false
  gs.pucks.push({ bx, by: 400, vx, vy, prevY: 400, launched: true, laneCurved: false, spin: 0, spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false, magHeld: false, magHoldT: 0 })
  console.log(`\n=== ${label} (bx=${bx} vx=${vx} vy=${vy}) ===`)
  let maxTurns = 0
  for (let t = 0; t < ticks; t++) {
    stepGame(gs, 1000 / 60)
    const p = gs.pucks[0]
    if (!p) { console.log(`t=${t} puck gone (drained)`); break }
    if (gs.spinnerTurns > 0 && t % 1 === 0 && t < 130) console.log(`t=${t} bx=${p.bx.toFixed(1)} by=${p.by.toFixed(1)} vy=${p.vy?.toFixed(0)} turns=${gs.spinnerTurns}`)
    if (p.by > 600) { console.log(`t=${t} drained bx=${p.bx.toFixed(1)} by=${p.by.toFixed(1)}`); break }
  }
  const p = gs.pucks[0]
  console.log(`FINAL turns=${gs.spinnerTurns} rampLLit=${gs.rampLLit} kbL=${gs.kbLUsed} bx=${p?p.bx.toFixed(1):'gone'} by=${p?p.by.toFixed(1):'gone'}`)
}
trace(60, 0, -520, 'standard feed (rig)')
trace(60, -60, -520, 'left-drift feed')
trace(48, -60, -520, 'left edge bx=48, vx=-60')
trace(44, 0, -520, 'corridor left edge bx=44')
