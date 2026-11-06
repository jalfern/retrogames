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
    if (firstHit) { let prev = firstHit.tick; for (let i = actions.indexOf(firstHit) + 1; i < actions.length; i++) { const gap = actions[i].tick - prev; if (gap > worst) worst = gap; prev = actions[i].tick } }
    return { g, worst }
}
for (const rng of [110, 120, 130, 140]) {
    CFG.bot0Range = rng; CFG.bot0Release = 0.5; CFG.bot0Lobs = false
    const out = []
    for (const a of [0, 1]) {
        // [1,0]: slack rule + gap
        const { g: n } = drive(a, [1, 0])
        const { g: sl } = drive(a, [1, 0], { quiver: CFG.quiver - 1, quiverMax: CFG.quiver - 1, p2Gift: 1 })
        const slk = sl.end === 'win' && sl.winner === 0
        // [0,1]: worst gap over 12 runs
        let wsum = 0, wn = 0
        for (let r = 0; r < 12; r++) { const { worst } = drive(a, [0, 1]); wsum += worst; wn++ }
        out.push(`a${a}: 10slack=${slk ? 'WIN' : 'LOSto' + sl.p[0].score + '-' + sl.p[1].score} 10win=${n.winner === 0} 01gap=${(wsum / wn / 30).toFixed(1)}s`)
    }
    console.log(`range=${rng}: ${out.join(' | ')}`)
}
