import { makeGame, step } from '../../src/games/DigDug/sim.js'
import { decide } from '../../src/games/DigDug/planner.js'
const gs = makeGame(0)
for (let i = 250; i < 360; i++) {
    const inp = decide(gs)
    step(gs, inp)
    const p = gs.player
    console.log(i, 'p', p.x.toFixed(1), p.y.toFixed(1), 'dir', p.dir.join(','), 'cool', gs._cool,
        'h', gs.harpoon ? gs.harpoon.state + ':' + gs.harpoon.attached + ':' + gs.harpoon.len.toFixed(0) : '-',
        'in', Object.keys(inp).filter((k) => inp[k]).join(''),
        gs.events.map((e) => e.type + (e.how || '') + (e.id ? '#' + e.id : '')).join(' '))
    gs.events.length = 0
    if (gs.lives < 3) break
}
