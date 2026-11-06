import { makeGame, step, botInput, CFG } from '../src/games/ArenaArchery/sim.js'
import { buildArena } from '../src/games/ArenaArchery/levels.js'
function drive(arena, skills) {
    const g = makeGame(buildArena(arena))
    const cap = CFG.matchTicks + 200
    let hits = 0
    while (!g.end && g.tick < cap) {
        step(g, botInput(g, 0, skills[0]), botInput(g, 1, skills[1]))
        for (const e of g.events) if (e.type === 'hit') hits++
        g.events.length = 0
    }
    return { end: g.end, winner: g.winner, score: `${g.p[0].score}-${g.p[1].score}`, hits, tick: g.tick }
}
for (const [a, s] of [[0,[1,1]],[1,[1,1]],[0,[1,0]],[1,[1,0]],[0,[0,1]],[1,[0,1]]]) {
    // run 5x to see variance
    const runs = []
    for (let i = 0; i < 5; i++) runs.push(drive(a, s))
    const sum = (f) => runs.reduce((t, r) => t + f(r), 0)
    console.log(`arena=${a} skills=${JSON.stringify(s)}: ends=${runs.map(r=>r.end).join(',')} wins=${runs.map(r=>r.winner).join(',')} scores=${runs.map(r=>r.score).join(',')} avgHits=${(sum(r=>r.hits)/runs.length).toFixed(1)} avgTick=${(sum(r=>r.tick)/runs.length)|0}`)
}
