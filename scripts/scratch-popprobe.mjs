// THROWAWAY probe for #2330-5: does the champion route have safe ledges where
// holding Shift while falling would catch them, with the run still clearing?
import { makeGame, step, CFG } from '../src/games/PrinceOfPersia/sim.js'
import { decide } from '../src/games/PrinceOfPersia/planner.js'

function run(mode) {
  let g = makeGame(0)
  const counts = {}
  let deaths = 0, ticks = 0
  const grabs = []
  for (; !(g.status === 'win' || g.status === 'lost') && ticks < 60 * 60 * 16; ticks++) {
    const inp = decide(g)
    if (mode === 'fall' && !g.p.hang && !g.p.onGround && g.p.vy > 0) inp.shift = true
    step(g, inp)
    for (const e of g.events) {
      counts[e.type] = (counts[e.type] || 0) + 1
      if (e.type === 'grab') grabs.push({ t: e.t, lvl: g.levelIndex, room: g.room, x: Math.round(g.p.x), y: Math.round(g.p.y) })
      if (e.type === 'die') deaths++
    }
    g.events.length = 0
  }
  console.log(`mode=${mode} status=${g.status} level=${g.levelIndex} deaths=${deaths} ticks=${ticks} grabs=${grabs.length} climbs=${counts.climb || 0}`)
  if (grabs.length) console.log('  grab samples:', JSON.stringify(grabs.slice(0, 6)))
  if (deaths) {
    // where did it die?
    let g2 = makeGame(0)
    for (let t = 0; !(g2.status === 'win' || g2.status === 'lost') && t < ticks; t++) {
      const inp = decide(g2)
      if (mode === 'fall' && !g2.p.hang && !g2.p.onGround && g2.p.vy > 0) inp.shift = true
      step(g2, inp)
      for (const e of g2.events) if (e.type === 'die') console.log('  death:', JSON.stringify(e), 'lvl', g2.levelIndex, 'room', g2.room)
      g2.events.length = 0
    }
  }
}

run('base')
run('fall')
