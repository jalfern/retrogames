// quick engine smoke: determinism + CPU cooks serve tickets
import { createGame, stepGame, makeCpuEmitter, simState } from '../src/games/ShortOrderShout/engine.js'

function run(seed, seats) {
    const gs = createGame(seed, seats)
    const em = Array.from({ length: seats }, (_, i) => makeCpuEmitter(i))
    for (let t = 0; t < 9000 && !gs.done; t++) {
        const pads = em.map((f) => f({ gs, tick: t }))
        stepGame(gs, pads)
    }
    return simState(gs)
}

const a = run(7, 2)
const b = run(7, 2)
console.log('seed 7 2P:', JSON.stringify({ tick: a.tick, score: a.score, served: a.served, strikes: a.strikes, win: a.win, hash: a.hash }))
console.log('determinism:', a.hash === b.hash ? 'OK' : 'FAIL ' + a.hash + ' vs ' + b.hash)
const c = run(11, 1)
console.log('seed 11 1P:', JSON.stringify({ tick: c.tick, score: c.score, served: c.served, strikes: c.strikes, win: c.win }))
for (const s of [1, 2, 3, 4, 5]) {
    const r = run(s, 2)
    console.log(`seed ${s}: score=${r.score} served=${r.served} strikes=${r.strikes} win=${r.win}`)
}
