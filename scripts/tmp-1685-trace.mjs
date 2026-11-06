// TEMP repro 2: find the freeze window, dump per-tick bot state inside it.
import { makeGame, step, botInput, CFG } from '../src/games/ArenaArchery/sim.js'
import { buildArena } from '../src/games/ArenaArchery/levels.js'

function drive(opts) {
    const g = makeGame(buildArena(opts.arena), opts)
    const skills = opts.skills
    const cap = opts.maxTicks || CFG.matchTicks + 200
    const actions = []
    while (!g.end && g.tick < cap) {
        const i1 = botInput(g, 0, skills[0])
        const i2 = botInput(g, 1, skills[1])
        g.cmds.push({ tick: g.tick, p1: i1, p2: i2 })
        step(g, i1, i2)
        for (const e of g.events) if (e.type === 'loose' || e.type === 'hit') actions.push({ tick: g.tick, type: e.type, who: e.who })
        g.events.length = 0
    }
    return { g, actions }
}

// find the worst post-kill gap over a few runs
let best = null
for (let run = 0; run < 60; run++) {
    const { g, actions } = drive({ arena: 0, skills: [1, 0] })
    const fi = actions.findIndex((a) => a.type === 'hit')
    if (fi < 0) continue
    let worst = 0, wi = fi
    for (let i = fi + 1; i < actions.length; i++) {
        const gap = actions[i].tick - actions[i - 1].tick
        if (gap > worst) { worst = gap; wi = i }
    }
    if (!best || worst > best.worst) best = { worst, wi, actions, g }
    if (best.worst > 500) break
}
console.log('worst gap', best.worst, 'ticks =', (best.worst / 30).toFixed(1), 's')
const { actions, g } = best
const A = best.actions[best.wi - 1], B = best.actions[best.wi]
console.log('window: tick', A.tick, '(', A.type, A.who, ') -> tick', B.tick, '(', B.type, B.who, ')')

// replay to the window and dump every 15 ticks
const { replay } = await import('../src/games/ArenaArchery/sim.js')
const g2 = replay(buildArena(0), g.cmds.map((c) => ({ ...c })), { maxTicks: g.tick + 2 })
const tick = g2.tick
// drive from scratch to A.tick, then trace
const g3 = makeGame(buildArena(0))
const byTick = new Map(g.cmds.map((c) => [c.tick, c]))
while (g3.tick < A.tick + 5) {
    const c = byTick.get(g3.tick)
    step(g3, c ? c.p1 : null, c ? c.p2 : null)
}
for (let t = 0; t < best.worst && !g3.end; t++) {
    const c = byTick.get(g3.tick)
    if (t % 15 === 0) {
        const s = (p) => `${p.alive ? 'A' : 'd'} q${p.quiver} ${p.firing ? 'F' : '-'} c${p.charge.toFixed(2)} @${p.x.toFixed(0)},${p.y.toFixed(0)}`
        const i1 = c ? c.p1 : null, i2 = c ? c.p2 : null
        console.log(`t${g3.tick} stuck=${g3.stuck.length} fly=${g3.arrows.filter((a) => a.state === 'fly').length} | P1 ${s(g3.p[0])} in=${JSON.stringify(i1)} | P2 ${s(g3.p[1])} in=${JSON.stringify(i2)}`)
    }
    const n1 = byTick.get(g3.tick)
    step(g3, n1 ? n1.p1 : null, n1 ? n1.p2 : null)
}
console.log('end state tick', g3.tick, 'end', g3.end)
