// THROWAWAY probe 2: shadow-conditional grab — only hold Shift while falling
// when this level carries no shadow (L5+). Is that the safe-ledge rule?
import { makeGame, step } from '../src/games/PrinceOfPersia/sim.js'
import { decide } from '../src/games/PrinceOfPersia/planner.js'

function run(mode) {
  let g = makeGame(0)
  const counts = {}
  let deaths = 0, ticks = 0
  const grabs = []
  for (; !(g.status === 'win' || g.status === 'lost') && ticks < 60 * 60 * 16; ticks++) {
    const inp = decide(g)
    const falling = !g.p.hang && !g.p.onGround && g.p.vy > 0
    if (mode === 'fall-noshadow' && falling && !g.shadow) inp.shift = true
    step(g, inp)
    for (const e of g.events) {
      counts[e.type] = (counts[e.type] || 0) + 1
      if (e.type === 'grab') grabs.push(`t${e.t} L${g.levelIndex}R${g.room} @${Math.round(g.p.x)},${Math.round(g.p.y)}`)
      if (e.type === 'die') { deaths++; if (deaths <= 4) console.log('  death:', JSON.stringify(e), 'L' + g.levelIndex, 'R' + g.room, 'shadow?', !!g.shadow) }
    }
    g.events.length = 0
  }
  console.log(`mode=${mode} status=${g.status} level=${g.levelIndex} deaths=${deaths} ticks=${ticks} grabs=${grabs.length} climbs=${counts.climb || 0} strains=${counts.strain || 0}`)
  console.log('  grabs:', grabs.join('  ') || 'none')
}

run('fall-noshadow')
