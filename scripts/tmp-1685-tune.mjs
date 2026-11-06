import { makeGame, step, botInput, CFG } from '../src/games/ArenaArchery/sim.js'
import { buildArena } from '../src/games/ArenaArchery/levels.js'

function drive(arena, skills, opts = {}) {
    const g = makeGame(buildArena(arena), opts)
    const cap = opts.maxTicks || CFG.matchTicks + 240
    const actions = []
    while (!g.end && g.tick < cap) {
        step(g, botInput(g, 0, skills[0]), botInput(g, 1, skills[1]))
        for (const e of g.events) if (e.type === 'loose' || e.type === 'hit') actions.push({ tick: g.tick, type: e.type })
        g.events.length = 0
    }
    const firstHit = actions.find((a) => a.type === 'hit')
    let worst = 0
    if (firstHit) {
        let prev = firstHit.tick
        for (let i = actions.indexOf(firstHit) + 1; i < actions.length; i++) {
            const gap = actions[i].tick - prev
            if (gap > worst) worst = gap
            prev = actions[i].tick
        }
    }
    return { g, worst }
}

for (const rng of [90, 110, 130, 150, 170, 200]) {
    CFG.bot0Range = rng
    CFG.bot0Release = 0.5
    const rows = []
    for (const a of [0, 1]) {
        let sumW = 0, n = 0, p1sum = 0, wins = 0
        for (let r = 0; r < 12; r++) {
            const { g, worst } = drive(a, [1, 0])
            sumW += worst; n++; p1sum += g.p[1].score
            if (g.end === 'win' && g.winner === 0) wins++
        }
        const { g: sl } = drive(a, [1, 0], { quiver: CFG.quiver - 1, quiverMax: CFG.quiver - 1, p2Gift: 1 })
        rows.push(`a${a}: gap=${(sumW / n / 30).toFixed(1)}s P1=${(p1sum / n).toFixed(1)} p0win=${wins}/12 slack=${sl.end === 'win' && sl.winner === 0 ? 'WIN' : 'LOSE ' + sl.p[0].score + '-' + sl.p[1].score}`)
    }
    console.log(`bot0Range=${rng}:  ${rows.join('  |  ')}`)
}
