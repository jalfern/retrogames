import { makeGame, step, stateOf } from '../../src/games/GrindCity/sim.js'
import { botPad, makeBot } from '../../src/games/GrindCity/planner.js'

const s = makeGame(Number(process.argv[2] || 7), 'run')
s.phase = 'play'
const bot = makeBot()
let lastEv = 0
for (let t = 0; t < 7200 && !s.done; t++) {
    const pad = botPad(stateOf(s), bot)
    step(s, pad)
    while (lastEv < s.events.length) {
        const e = s.events[lastEv++]
        if (/^(ollie|launch|land|grind|gap|bail|bank|win|goal|flip|grab|letter|trick|manual:start)/.test(e))
            console.log(t, e, 'x=' + s.x.toFixed(1), 'z=' + s.z.toFixed(1), 'v=' + s.speed.toFixed(1), 'armed=' + !!s.gapArmed, 'hole=' + !!s.overHole, s.msg ? '|' + s.msg : '')
    }
}
console.log('END gap=' + s.gapDone, 'score=' + s.score, 'won=' + s.won, JSON.stringify(s.goalsDone), JSON.stringify(s.letters))
