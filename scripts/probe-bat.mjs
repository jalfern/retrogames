// Temporary probe for #1560 — bat roam behavior after the sim fix.
import { createSim, R } from '../src/games/Adventure/sim.js'
import { seedRng } from '../src/utils/gameContract.js'

const step = (sim) => { sim.step({}); sim.events.length = 0 }

// 1. distinct rooms visited by the bat, 6000 ticks, no input
const rooms = []
for (let sd = 1; sd <= 10; sd++) {
    const sim = createSim(seedRng(sd))
    const seen = new Set([sim.bat.room])
    for (let t = 0; t < 6000; t++) { step(sim); seen.add(sim.bat.room) }
    rooms.push(seen.size)
    if (sd <= 3) console.log(`seed ${sd}: bat rooms=${seen.size} [${[...seen].join(',')}] endRoom=${sim.bat.room} carries=${sim.bat.carrying}`)
}
console.log('distinct bat rooms / 6000 ticks, seeds 1..10:', rooms.join(','), `median=${rooms.sort((a,b)=>a-b)[5]}`)

// 2. steal events per run + what the bat ever carries
for (const sd of [1, 42]) {
    const sim = createSim(seedRng(sd))
    const stolen = {}
    for (let t = 0; t < 20000; t++) {
        step(sim)
        for (const e of sim.events) if (e === 'steal') stolen[sim.bat.carrying] = (stolen[sim.bat.carrying] || 0) + 1
        sim.events.length = 0
        if (sim.dead) break
    }
    console.log(`seed ${sd}: steals by item ${JSON.stringify(stolen)}`)
}
