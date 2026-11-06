// TEMP repro for #1685: bot-vs-bot stalemate — measure the longest gap
// between action events (loose|hit) AFTER the first kill.
import { makeGame, step, botInput, CFG } from '../src/games/ArenaArchery/sim.js'
import { buildArena, ARENAS_COUNT } from '../src/games/ArenaArchery/levels.js'

function drive(opts) {
    const g = makeGame(buildArena(opts.arena), opts)
    const skills = opts.skills || [1, 1]
    const cap = opts.maxTicks || CFG.matchTicks + 200
    const actions = [] // {tick, type, who}
    while (!g.end && g.tick < cap) {
        const i1 = botInput(g, 0, skills[0])
        const i2 = botInput(g, 1, skills[1])
        step(g, i1, i2)
        for (const e of g.events) {
            if (e.type === 'loose' || e.type === 'hit') actions.push({ tick: g.tick, type: e.type, who: e.who })
        }
        g.events.length = 0
    }
    return { g, actions }
}

const FPS = 30
for (const skills of [[1, 1], [1, 0], [0, 1]]) {
    for (let arena = 0; arena < ARENAS_COUNT; arena++) {
        let worst = 0, worstAt = 0, firstKill = null
        const samples = []
        for (let run = 0; run < 30; run++) {
            const { g, actions } = drive({ arena, skills })
            const firstHit = actions.find((a) => a.type === 'hit')
            if (!firstHit) { samples.push('no-kill'); continue }
            // gaps between consecutive actions after the first kill
            let prev = firstHit.tick
            for (let i = actions.indexOf(firstHit) + 1; i < actions.length; i++) {
                const gap = actions[i].tick - prev
                if (gap > worst) { worst = gap; worstAt = prev }
                prev = actions[i].tick
            }
            if (firstKill === null) firstKill = firstHit.tick
        }
        console.log(`skills=${JSON.stringify(skills)} arena=${arena}: worst post-kill action gap ${worst} ticks = ${(worst / FPS).toFixed(1)} s (at tick ${worstAt}); first kills around tick ~${firstKill}`)
    }
}
