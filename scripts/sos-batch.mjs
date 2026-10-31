import { createGame, stepGame, makeCpuEmitter, simState } from '../src/games/ShortOrderShout/engine.js'

let wins = 0, tot = 0
for (let s = 1; s <= 12; s++) {
    const gs = createGame(s, 2)
    const em = [makeCpuEmitter(0), makeCpuEmitter(1)]
    for (let t = 0; t < 9000 && !gs.done; t++) stepGame(gs, em.map((f) => f({ gs, tick: t })))
    const r = simState(gs)
    if (r.win) wins++
    tot += r.served
    console.log('seed', s, 'score', r.score, 'served', r.served, 'strikes', r.strikes, 'win', r.win, 'tick', r.tick)
}
console.log('wins', wins, '/12 served', tot)
