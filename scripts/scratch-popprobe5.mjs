import { makeGame, step, CFG } from '../src/games/PrinceOfPersia/sim.js'
import { decide } from '../src/games/PrinceOfPersia/planner.js'

function trace(slack) {
  const clock0 = CFG.clock
  CFG.slack = slack
  CFG.clock = Math.floor(clock0 * (slack ? 0.75 : 1))
  try {
    const g = makeGame(0)
    const T = CFG.T
    let t = 0, deaths = 0
    const ev = []
    let wasGround = true
    while (!(g.status === 'win' || g.status === 'lost') && t++ < 3000) {
      const inp = decide(g)
      const p = g.p
      if (g.levelIndex === 1 && Math.floor(p.x / T / 10) === 1) {
        const air = !p.onGround && !p.hang
        if (wasGround && air) ev.push(`TAKEOFF t${t} x${(p.x / T).toFixed(1)} vx${p.vx.toFixed(2)} vy${p.vy.toFixed(2)} shift${inp.shift ? 1 : 0}`)
        if (!wasGround && p.onGround) ev.push(`LAND t${t} x${(p.x / T).toFixed(1)} y${(p.y / T).toFixed(2)}`)
        if (p.hang && !wasGround) ev.push(`HANG t${t} x${(p.x / T).toFixed(1)}`)
        wasGround = p.onGround
      } else if (g.levelIndex !== 1) { wasGround = p.onGround }
      step(g, inp)
      for (const e of g.events) {
        if (g.levelIndex === 1) ev.push(`  ev ${e.type}${e.why ? ':' + e.why : ''} t${e.t}`)
        if (e.type === 'die') deaths++
      }
      g.events.length = 0
      if (ev.length > 40) break
    }
    console.log(`=== slack=${slack} deaths=${deaths} ===`)
    console.log(ev.join('\n'))
  } finally { CFG.slack = false; CFG.clock = clock0 }
}
trace(false)
trace(true)
