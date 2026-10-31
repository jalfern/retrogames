import { createGame, stepGame, makeCpuEmitter, cpuPlan } from '../src/games/ShortOrderShout/engine.js'

const gs = createGame(Number(process.argv[2] || 1), 2)
const em = [makeCpuEmitter(0), makeCpuEmitter(1)]
for (let t = 0; t < 520 && !gs.done; t++) {
    const pads = em.map((f) => f({ gs, tick: t }))
    const before = gs.burners.map((b) => b.state).join(',')
    stepGame(gs, pads)
    const after = gs.burners.map((b) => b.state).join(',')
    if (before !== after || gs.burners.some((b) => b.state === 'ready')) {
        if (t % 7 === 0 || before !== after) {
            console.log(t, 'burners=' + after, gs.cooks.map((c) => `${c.x},${c.y}:${c.face}:${c.holding || '-'}`).join(' | '),
                'plan0=' + JSON.stringify(cpuPlan(gs, 0)).slice(0, 80))
        }
    }
}
