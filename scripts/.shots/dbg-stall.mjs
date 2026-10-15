import { makeGame, step } from '../../src/games/DigDug/sim.js'
import { decide } from '../../src/games/DigDug/planner.js'
const gs = makeGame(Number(process.argv[2] || 2))
for (let i = 0; i < 30000; i++) {
    step(gs, decide(gs))
    gs.events.length = 0
    if (gs.round > 0 || gs.end) break
    if (i > 2000 && gs.kills === 7 && i % 400 === 0) {
        const e = gs.enemies[0]
        console.log(i, 'p', Math.round(gs.player.x), Math.round(gs.player.y), 'e', e && `${e.kind} ${Math.round(e.x)},${Math.round(e.y)} s${e.stage} flee=${e.flee} ghost=${e.ghost} st=${e.state} path=${e.path.length} breath=${e.breathT} fire=${e.fireT}`, 'kills', gs.kills, 'queue', gs.queue.length, 'tick', gs.tick, 'phase', gs.roundPhase, gs.phaseT, 'deadT', gs.player.deadT, 'lives', gs.lives)
    }
}
