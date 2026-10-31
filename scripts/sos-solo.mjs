import { createGame, stepGame, makeCpuEmitter, simState } from '../src/games/ShortOrderShout/engine.js'

let wins = 0
for (let s = 1; s <= 10; s++) {
    const gs = createGame(s, 1)
    const em = [makeCpuEmitter(0)]
    for (let t = 0; t < 9000 && !gs.done; t++) stepGame(gs, em.map((f) => f({ gs, tick: t })))
    const r = simState(gs)
    if (r.win) wins++
    console.log('seed', s, 'score', r.score, 'served', r.served, 'strikes', r.strikes, 'win', r.win, 'tick', r.tick)
}
console.log('solo wins', wins, '/10')
