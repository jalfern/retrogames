import { createGame, stepGame, makeCpuEmitter, cpuPlan, simState } from '../src/games/ShortOrderShout/engine.js'

const gs = createGame(7, 2)
const em = [makeCpuEmitter(0), makeCpuEmitter(1)]
let lastHash = -1
for (let t = 0; t < 1200 && !gs.done; t++) {
    const pads = em.map((f) => f({ gs, tick: t }))
    stepGame(gs, pads)
    const st = simState(gs)
    if (st.hash !== lastHash && t % 50 < 2) {
        lastHash = st.hash
        console.log(t, JSON.stringify({
            c0: st.cooks[0], c1: st.cooks[1],
            tickets: st.tickets.map((x) => x.dish + ':' + x.left),
            board: st.board, burners: st.burners, pot: st.pot,
            plan0: (() => { const p = cpuPlan(gs, 0); return { path: (p.path || []).join('') || '-', act: p.act || '-', face: p.thenFace || '-' } })(),
        }))
    }
}
console.log('final', JSON.stringify({ score: gs.score, strikes: gs.strikes, served: gs.served, fx: gs.fx.map((f) => f.k + (f.msg || '')).slice(-8) }))
