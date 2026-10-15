import { makeGame, step } from '../../src/games/DigDug/sim.js'
import { decide } from '../../src/games/DigDug/planner.js'
const gs = makeGame(Number(process.argv[2] || 0))
let prevEscapes = 0
for (let i = 0; i < 60000; i++) {
    const inp = decide(gs)
    step(gs, inp)
    const esc = gs.events.filter((e) => e.type === 'escaped').length
    const hook = gs.events.filter((e) => e.type === 'hook').length
    const e = gs.enemies[0]
    if (gs.kills === 7 && (esc || hook || i % 120 === 0)) {
        console.log(i, 'p', Math.round(gs.player.x), Math.round(gs.player.y),
            'e', e ? `${Math.round(e.x)},${Math.round(e.y)} s${e.stage} ghost=${e.ghost} flee=${e.flee} st=${e.state}` : 'NONE',
            'h', gs.harpoon ? gs.harpoon.state + ':' + gs.harpoon.attached : '-', 'esc+', esc, 'hook+', hook, 'cool', gs._cool)
    }
    if (gs.round > 0 || gs.end) break
    gs.events.length = 0
}
