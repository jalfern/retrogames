import { makeGame, step } from '../../src/games/DigDug/sim.js'
import { decide } from '../../src/games/DigDug/planner.js'
const gs = makeGame(0)
for (let i = 0; i < 340; i++) {
    const inp = decide(gs)
    step(gs, inp)
    if (i % 20 === 0 || gs.events.some((e) => ['death', 'hook', 'pumpKill', 'puff'].includes(e.type))) {
        console.log(i, JSON.stringify({
            inp: Object.keys(inp).filter((k) => inp[k]).join(''),
            p: [+gs.player.x.toFixed(0), +gs.player.y.toFixed(0), Math.floor((gs.player.y - 16) / 16), Math.floor(gs.player.x / 16), gs.player.deadT],
            h: gs.harpoon ? gs.harpoon.state + ':' + gs.harpoon.attached : '-',
            en: gs.enemies.map((e) => `${e.kind[0]}@${e.x.toFixed(0)},${e.y.toFixed(0)}s${e.stage}${e.ghost ? 'G' : ''}${e.flee ? 'F' : ''}${e.state === 'gone' ? 'X' : ''}`),
            kills: gs.kills, lives: gs.lives,
            ev: gs.events.filter((e) => ['death', 'hook', 'pumpKill'].includes(e.type)).map((e) => e.type + (e.how || '')),
        }))
    }
    gs.events.length = 0
    if (gs.end) { console.log('END', gs.end); break }
}
