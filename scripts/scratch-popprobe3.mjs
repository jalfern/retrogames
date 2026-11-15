import { makeGame, step, CFG } from '../src/games/PrinceOfPersia/sim.js'
import { decide } from '../src/games/PrinceOfPersia/planner.js'

const clock0 = CFG.clock
CFG.slack = true
CFG.clock = Math.floor(clock0 * 0.75)
try {
  const g = makeGame(0)
  let t = 0, deaths = 0
  while (!(g.status === 'win' || g.status === 'lost') && t++ < 60 * 60 * 60) {
    step(g, decide(g))
    for (const e of g.events) {
      if (e.type === 'die') { deaths++; if (deaths <= 6) console.log('death', deaths, JSON.stringify(e), 'L' + g.levelIndex, 'R' + g.room, 'tick', t) }
    }
    g.events.length = 0
  }
  console.log(`status=${g.status} level=${g.levelIndex} deaths=${deaths} ticks=${t} clock=${g.clock}`)
} finally { CFG.slack = false; CFG.clock = clock0 }
