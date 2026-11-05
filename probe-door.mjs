import { createRobotSim, createAutopilot } from './src/utils/robot/index.js'

const seed = Number(process.argv[2] || 1)
const sim = createRobotSim(seed)
const ap = createAutopilot(sim)
let lastPhase = ''
const minD = {}
for (let i = 0; i < 4200; i++) {
    const pad = ap()
    const s = sim.step({ pad })
    const ph = ap.phaseInfo()
    const name = ph.split(':')[0]
    if (name !== lastPhase) { console.log(`t=${i} phase ${lastPhase} -> ${name} held=${s.held} door=${s.doorA.toFixed(2)} hand=[${s.hand.map((v) => v.toFixed(2))}]`); lastPhase = name }
    const ch = sim.cabinet.handlePos()
    const d = Math.hypot(s.hand[0] - ch.x, s.hand[1] - ch.y, s.hand[2] - ch.z)
    if (name.startsWith('toDoor') || name.startsWith('lowerDoor') || name.startsWith('latchDoor')) minD[name] = Math.min(minD[name] ?? 9, d)
    if (s.done) { console.log('done at', i); break }
}
console.log('min handle dist by phase:', minD)
const ch = sim.cabinet.handlePos()
console.log('final: door=', sim.cabinet.angle().toFixed(3), 'handle=', ch, 'hand=', sim.state().hand, 'held=', sim.state().held)
