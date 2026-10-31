import { createGame, stepGame, makeCpuEmitter, cpuPlan } from '../src/games/ShortOrderShout/engine.js'

const gs = createGame(Number(process.argv[2] || 7), Number(process.argv[3] || 1))
const em = [makeCpuEmitter(0)]
for (let t = 0; t < 3400 && !gs.done; t++) {
    const pads = em.map((f) => f({ gs, tick: t }))
    stepGame(gs, pads)
    if (false && gs.cooks[0].holding === 'soup') {
        const c = gs.cooks[0]
        const pl = cpuPlan(gs, 0)
        console.log(t, c.x + ',' + c.y, c.face, 'moveCd=' + c.moveCd, 'pad=' + JSON.stringify(pads[0]), 'plan=' + JSON.stringify(pl.path ? pl.path.join('') : null) + ' act=' + (pl.act || '-'))
    }
}
