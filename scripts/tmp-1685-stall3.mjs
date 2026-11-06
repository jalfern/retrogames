// TEMP repro 5: KNOCKBACK stall trace.
import { makeGame, step, botInput, CFG } from '../src/games/ArenaArchery/sim.js'
import { buildArena } from '../src/games/ArenaArchery/levels.js'

const SKILLS = [0, 1], ARENA = 1
function drive() {
    const g = makeGame(buildArena(ARENA))
    const cap = CFG.matchTicks + 200
    const actions = []
    while (!g.end && g.tick < cap) {
        const i1 = botInput(g, 0, SKILLS[0])
        const i2 = botInput(g, 1, SKILLS[1])
        g.cmds.push({ tick: g.tick, p1: i1, p2: i2 })
        step(g, i1, i2)
        for (const e of g.events) if (e.type === 'loose' || e.type === 'hit') actions.push({ tick: g.tick, type: e.type, who: e.who })
        g.events.length = 0
    }
    return { g, actions }
}
let best = null
for (let run = 0; run < 20; run++) {
    const { g, actions } = drive()
    const fi = actions.findIndex((a) => a.type === 'hit')
    if (fi < 0) continue
    let worst = 0, wi = fi
    for (let i = fi + 1; i < actions.length; i++) {
        const gap = actions[i].tick - actions[i - 1].tick
        if (gap > worst) { worst = gap; wi = i }
    }
    if (!best || worst > best.worst) best = { worst, wi, actions, g }
    if (best.worst > 600) break
}
console.log('worst gap', best.worst, 'ticks =', (best.worst / 30).toFixed(1), 's')
const A = best.actions[best.wi - 1], B = best.actions[best.wi]
console.log('window:', A.tick, '(', A.type, A.who, ') ->', B.tick, '(', B.type, B.who, ')')
const g3 = makeGame(buildArena(ARENA))
const byTick = new Map(best.g.cmds.map((c) => [c.tick, c]))
while (g3.tick < A.tick + 2) {
    const c = byTick.get(g3.tick)
    step(g3, c ? c.p1 : null, c ? c.p2 : null)
}
for (let t = 0; t < Math.min(best.worst, 700) && !g3.end; t++) {
    if (t % 30 === 0) {
        const s = (p) => `${p.alive ? 'A' : 'd'} q${p.quiver} ${p.firing ? 'F' : '-'} c${p.charge.toFixed(2)} @${p.x.toFixed(0)},${p.y.toFixed(0)} g${p.grounded ? 1 : 0}`
        const c = byTick.get(g3.tick)
        const st = g3.stuck.map((s) => `(${s.cell % g3.W},${Math.floor(s.cell / g3.W)})o${s.owner}`).join(' ')
        const fly = g3.arrows.filter((a) => a.state === 'fly').length
        console.log(`t${g3.tick} stuck=[${st}] fly=${fly} | P1 ${s(g3.p[0])} in=${JSON.stringify(c && c.p1)} | P2 ${s(g3.p[1])} in=${JSON.stringify(c && c.p2)}`)
    }
    const n = byTick.get(g3.tick)
    step(g3, n ? n.p1 : null, n ? n.p2 : null)
}
console.log('match end:', best.g.end, 'scores', best.g.p[0].score, '-', best.g.p[1].score, 'at tick', best.g.tick)
