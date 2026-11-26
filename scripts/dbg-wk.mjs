// TEMP debug: trace tick phases of a route run (seed/variant args)
import { createSim } from '../src/games/Adventure/sim.js'
import { seedRng } from '../src/utils/gameContract.js'
import { makeRoute } from '../src/games/Adventure/route.js'

const seed = Number(process.argv[2] || 4)
const variant = Number(process.argv[3] || 1)
const sim = createSim(seedRng(seed), variant)
const w = makeRoute(sim)
let r = w.next(), n = 0
let lr = sim.room, lc = sim.carrying
const ld = sim.dragons.map((d) => `${d.alive ? d.room : 'x'}`)
let lb = sim.bat.carrying
let lastLog = 0
while (!r.done && n < 60000) {
    sim.step(r.value || {})
    sim.events.length = 0
    n++
    const dr = sim.dragons.map((d) => `${d.alive ? d.room : 'x'}`).join(',')
    const idle = n - lastLog
    if (sim.room !== lr || sim.carrying !== lc || dr !== ld.join(',') || sim.bat.carrying !== lb || sim.dead || sim.won || idle > 3000) {
        console.log(`t${n}(gap${idle}) room ${lr}->${sim.room} carry ${lc}->${sim.carrying} dragons[${ld}]->[${dr}] bat ${lb}->${sim.bat.carrying || '-'} p(${sim.player.x.toFixed(0)},${sim.player.y.toFixed(0)}) gates ${Object.entries(sim.gateOpen).filter(([, v]) => v).map(([k]) => k)} bridged ${[...sim.bridged].join('|') || '-'} dead=${sim.dead} won=${sim.won}`)
        lr = sim.room; lc = sim.carrying; lb = sim.bat.carrying
        ld.length = 0; ld.push(...dr.split(',')); lastLog = n
    }
    if (sim.dead) break
    r = w.next()
}
console.log(`END n=${n} val=${JSON.stringify(r.value)} won=${sim.won}`)
