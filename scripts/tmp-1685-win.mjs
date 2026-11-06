import { makeGame, step, botInput, CFG } from '../src/games/ArenaArchery/sim.js'
import { buildArena } from '../src/games/ArenaArchery/levels.js'
function drive(arena, skills) {
    const g = makeGame(buildArena(arena))
    const cap = CFG.matchTicks + 200
    let last = null
    while (!g.end && g.tick < cap) {
        step(g, botInput(g, 0, skills[0]), botInput(g, 1, skills[1]))
        for (const e of g.events) if (e.type === 'hit') last = { tick: g.tick, who: e.who, score: g.p[0].score + '-' + g.p[1].score }
        g.events.length = 0
    }
    return { end: g.end, winner: g.winner, final: g.p[0].score + '-' + g.p[1].score, tick: g.tick, last }
}
// single run detail for [1,0] arena 0 and arena 1
for (const a of [0, 1]) {
    const r = drive(a, [1, 0])
    console.log(`arena=${a} [1,0]: end=${r.end} winner=${r.winner} final=${r.final} tick=${r.tick} lastHit=${JSON.stringify(r.last)}`)
}
