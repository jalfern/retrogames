// probe1570g — when/what closes the door after doorOpen (seed 3).
import { createRobotSim, createAutopilot, WIN_TICKS } from './src/utils/robot/index.js'

const seed = Number(process.argv[2] || 3)
const sim = createRobotSim(seed)
const ap = createAutopilot(sim)
let lastPhase = ''
let prevA = null
for (let i = 0; i < WIN_TICKS; i++) {
    const s = sim.step({ pad: ap() })
    const ph = ap.phaseInfo()
    const name = ph.split(':')[0]
    if (name !== lastPhase) { lastPhase = name }
    const a = s.doorA
    if (prevA !== null && a - prevA > 0.02) {
        const hand = s.hand, can = s.canPos
        console.log(`t=${i} ph=${ph} doorA ${prevA} -> ${a} held=${s.held} hand=[${hand[0].toFixed(3)},${hand[1].toFixed(3)},${hand[2].toFixed(3)}] can=[${can.x.toFixed(3)},${can.y.toFixed(3)},${can.z.toFixed(3)}]`)
    }
    prevA = a
}
