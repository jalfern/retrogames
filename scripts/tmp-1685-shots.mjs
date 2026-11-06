import { makeGame, step, botInput, CFG } from '../src/games/ArenaArchery/sim.js'
import { buildArena } from '../src/games/ArenaArchery/levels.js'
function drive(arena, skills) {
    const g = makeGame(buildArena(arena))
    const cap = CFG.matchTicks + 240
    const shots = []
    while (!g.end && g.tick < cap) {
        const i1 = botInput(g, 0, skills[0])
        const i2 = botInput(g, 1, skills[1])
        const before = g.p[1].quiver
        step(g, i1, i2)
        // detect P1 (id 1) loose
        for (const e of g.events) {
            if (e.type === 'loose' && e.who === 1) {
                shots.push({ tick: g.tick, adx: Math.abs(g.p[1].x - g.p[0].x).toFixed(0), charge: e.charge.toFixed(2) })
            }
        }
        g.events.length = 0
    }
    return { g, shots }
}
const { g, shots } = drive(0, [1, 0])
console.log(`[1,0] arena0: P1 fired ${shots.length} shots, P1 score=${g.p[1].score}, P0 score=${g.p[0].score}, end=${g.end}`)
for (const s of shots.slice(0, 20)) console.log(`  P1 loose @t${s.tick} adx=${s.adx} charge=${s.charge}`)
