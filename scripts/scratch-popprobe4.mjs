import { makeGame, step, CFG } from '../src/games/PrinceOfPersia/sim.js'
import { decide } from '../src/games/PrinceOfPersia/planner.js'
import { makeLevel, SPIKE } from '../src/games/PrinceOfPersia/levels.js'

function trace(slack, maxDeaths = 1) {
  const clock0 = CFG.clock
  CFG.slack = slack
  CFG.clock = Math.floor(clock0 * (slack ? 0.75 : 1))
  try {
    const g = makeGame(0)
    // spike cells in level 1 (absolute coords)
    const lv = makeLevel(1)
    const spikes = []
    for (let r = 0; r < lv.H; r++) for (let c = 0; c < lv.W; c++) if (lv.grid[r * lv.W + c] === SPIKE) spikes.push(`c${c},r${r}`)
    let t = 0, deaths = 0
    let log = []
    while (!(g.status === 'win' || g.status === 'lost') && t++ < 4000) {
      const inp = decide(g)
      const p = g.p
      const L = Math.floor(p.y / CFG.T), C = Math.floor(p.x / CFG.T)
      // log while in level1 room1 (cols 10..19) and falling or hanging
      if (g.levelIndex === 1 && Math.floor(C / 10) === 1 && (!p.onGround || p.hang) && t > 1300) {
        log.push(`t${t} x${p.x.toFixed(0)} y${p.y.toFixed(0)} vy${p.vy.toFixed(1)} hang=${p.hang ? 'Y' : 'n'} shift=${inp.shift ? 1 : 0} roomSolidBelow=${(lv.grid[(L + 1) * lv.W + C] ?? '?')}`)
      }
      step(g, inp)
      for (const e of g.events) { if (e.type === 'die') deaths++ }
      g.events.length = 0
    }
    console.log(`=== slack=${slack} status=${g.status} level=${g.levelIndex} deaths=${deaths} ===`)
    console.log('L1 spikes:', spikes.slice(0, 12).join(' '))
    console.log(log.slice(-14).join('\n'))
  } finally { CFG.slack = false; CFG.clock = clock0 }
}
trace(false)
trace(true)
