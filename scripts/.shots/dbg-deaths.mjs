import { makeGame, step } from '../../src/games/DigDug/sim.js'
import { decide } from '../../src/games/DigDug/planner.js'
const seed = Number(process.argv[2] || 0)
const gs = makeGame(seed)
let lastLives = gs.lives
for (let i = 0; i < 6000; i++) {
    const inp = decide(gs)
    step(gs, inp)
    const d = gs.events.filter((e) => e.type === 'death')
    if (d.length) {
        const e = d[0]
        console.log('death', e.how, 'tick', gs.tick, 'round', gs.round, 'kills', gs.kills,
            'p', [Math.round(gs.player.x), Math.round(gs.player.y), Math.floor((gs.player.y - 16) / 16), Math.floor(gs.player.x / 16)],
            'en', gs.enemies.map((x) => `${x.kind[0]}@${Math.round(x.x)},${Math.round(x.y)}s${x.stage}${x.ghost ? 'G' : ''}${x.flee ? 'F' : ''}${x.fireT > 0 ? 'B' + x.fireDir : ''}${x.state === 'gone' ? 'X' : ''}`).join(' '))
        if (--lastLives <= 0) break
    }
    gs.events.length = 0
    if (gs.end) { console.log('END', gs.end, 'score', gs.score); break }
}
