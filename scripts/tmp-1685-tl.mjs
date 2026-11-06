// TEMP repro 6: [1,0] KNOCKBACK full-match timeline.
import { makeGame, step, botInput, CFG } from '../src/games/ArenaArchery/sim.js'
import { buildArena } from '../src/games/ArenaArchery/levels.js'

function drive() {
    const g = makeGame(buildArena(1))
    const cap = CFG.matchTicks + 200
    const log = []
    while (!g.end && g.tick < cap) {
        const i1 = botInput(g, 0, 1)
        const i2 = botInput(g, 1, 0)
        g.cmds.push({ tick: g.tick, p1: i1, p2: i2 })
        step(g, i1, i2)
        for (const e of g.events) {
            if (e.type === 'loose' || e.type === 'hit' || e.type === 'pull' || e.type === 'dryout' || e.type === 'respawn')
                log.push(`t${g.tick} ${e.type}${e.who !== undefined ? ' p' + e.who : ''}${e.cell !== undefined ? ' @(' + (e.cell % g.W) + ',' + Math.floor(e.cell / g.W) + ')' : ''}`)
        }
        g.events.length = 0
    }
    return { g, log }
}
const { g, log } = drive()
console.log(`END: ${g.end} winner=${g.winner} scores=${g.p[0].score}-${g.p[1].score} tick=${g.tick}`)
// compress: show state snapshots every 3s + all events
const g2 = makeGame(buildArena(1))
const byTick = new Map(g.cmds.map((c) => [c.tick, c]))
let nextSnap = 0
const evIdx = 0
let shown = 0
for (let t = 0; t < g.tick && t < 1800; t++) {
    const c = byTick.get(g2.tick)
    const s = (p) => `${p.alive ? 'A' : 'd'}q${p.quiver}${p.firing ? 'F' : ''}@${p.x.toFixed(0)}`
    if (g2.tick >= nextSnap) {
        const st = g2.stuck.map((x) => `(${x.cell % g2.W},${Math.floor(x.cell / g2.W)})`).join('')
        console.log(`--- t${g2.tick} stuck[${st}] P1 ${s(g2.p[0])} in=${JSON.stringify(c && c.p1)} P2 ${s(g2.p[1])} in=${JSON.stringify(c && c.p2)}`)
        nextSnap += 90
    }
    const n = byTick.get(g2.tick)
    step(g2, n ? n.p1 : null, n ? n.p2 : null)
}
console.log('\nevents (first 1800 ticks):')
console.log(log.filter((l) => l.startsWith('t') && +l.slice(1).split(' ')[0] < 1800).join('\n'))
