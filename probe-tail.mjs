import { createRobotSim, createAutopilot } from './src/utils/robot/index.js'

const seed = Number(process.argv[2] || 2)
const sim = createRobotSim(seed)
const ap = createAutopilot(sim)
let lastPhase = ''
for (let i = 0; i < 4200; i++) {
    const pad = ap()
    const s = sim.step({ pad })
    const ph = ap.phaseInfo()
    const name = ph.split(':')[0]
    if (name !== lastPhase && (i > 2000 || process.env.ALL)) { console.log(`t=${i} ${lastPhase}->${name} held=${s.held} door=${s.doorA.toFixed(2)} can=[${s.canPos.x.toFixed(2)},${s.canPos.y.toFixed(2)},${s.canPos.z.toFixed(2)}] dz=${s.drawerZ.toFixed(2)} crate=[${s.cratePos.x.toFixed(2)},${s.cratePos.y.toFixed(2)},${s.cratePos.z.toFixed(2)}]`) }
    if (name !== lastPhase) lastPhase = name
    if (s.done) { console.log('done', i); break }
}
const s = sim.state()
console.log('goals', JSON.stringify(s.goals))
console.log('door angle', sim.cabinet.angle().toFixed(3), 'closed?', sim.cabinet.closed?.(), 'can in?', sim.cabinet.interiorContains(s.canPos))
console.log('canPos', s.canPos.x.toFixed(3), s.canPos.y.toFixed(3), s.canPos.z.toFixed(3), 'drawerZ', s.drawerZ.toFixed(3), 'crate', s.cratePos.y.toFixed(3), s.cratePos.z.toFixed(3), 'open?', sim.drawer.open(), sim.drawer.closed())
