import { createGame, stepGame, makeCpuEmitter } from '../src/games/ShortOrderShout/engine.js'

const gs = createGame(Number(process.argv[2] || 7), Number(process.argv[3] || 1))
const em = Array.from({length: Number(process.argv[3]||1)}, (_,i)=>makeCpuEmitter(i))
for (let t = 0; t < 3400 && !gs.done; t++) {
    const pads = em.map((f) => f({ gs, tick: t }))
    stepGame(gs, pads)
    const fx = gs.fx.filter((f) => f.tick === t)
    if (fx.length) {
        const c = gs.cooks[0]
        console.log(t, fx.map((f) => f.k + (f.item ? ':' + f.item : '') + (f.msg ? ':' + f.msg : '')).join(','),
            '| cook', c.x + ',' + c.y, c.face, 'hold=' + c.holding, 'pot=' + gs.pot.state + '/' + gs.pot.stir)
    }
}
