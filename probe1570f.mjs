// probe1570c — what pins the chain at toDoorway stall (seed 3): joints, omegas, contacts.
import { createRobotSim, createAutopilot, WIN_TICKS } from './src/utils/robot/index.js'
import { CANNON } from './src/utils/robot/physics.js'

const seed = Number(process.argv[2] || 3)
const sim = createRobotSim(seed)
const ap = createAutopilot(sim)
let lastPhase = ''
let n = 0
for (let i = 0; i < WIN_TICKS; i++) {
    const s = sim.step({ pad: ap() })
    const ph = ap.phaseInfo()
    const name = ph.split(':')[0]
    if (name !== lastPhase) { lastPhase = name; if (name === 'toDoorway') n = 0 }
    if (name !== 'toDoorway') continue
    n++
    if (n !== 60 && n !== 200 && n !== 400 && n !== 528) continue
    const a = sim.arm
    const ja = a.joints
    const om = (prox, dist, axis) => {
        const aw = dist.quaternion.vmult(axis)
        return (dist.angularVelocity.x - prox.angularVelocity.x) * aw.x + (dist.angularVelocity.y - prox.angularVelocity.y) * aw.y + (dist.angularVelocity.z - prox.angularVelocity.z) * aw.z
    }
    const SEG = new CANNON.Vec3(-1, 0, 0), YAW = new CANNON.Vec3(0, 1, 0)
    console.log(`n=${n} joints=[y=${ja.yaw.toFixed(3)} p1=${ja.phi1.toFixed(3)} p2=${ja.phi2.toFixed(3)} gw=${ja.gamw.toFixed(3)}] omegas=[y=${om(a.bodies.base, a.bodies.yoke, YAW).toFixed(2)} p1=${om(a.bodies.yoke, a.bodies.upper, SEG).toFixed(2)} p2=${om(a.bodies.upper, a.bodies.fore, SEG).toFixed(2)} gw=${om(a.bodies.fore, a.bodies.hand, SEG).toFixed(2)}] tau=[y=${a.torqueNow.yaw.toFixed(2)} p1=${a.torqueNow.phi1.toFixed(2)} p2=${a.torqueNow.phi2.toFixed(2)} gw=${a.torqueNow.gamw.toFixed(2)}] integ=[y=${a.integral.yaw.toFixed(2)} p1=${a.integral.phi1.toFixed(2)} p2=${a.integral.phi2.toFixed(2)}] handPos=[${a.bodies.hand.position.x.toFixed(3)},${a.bodies.hand.position.y.toFixed(3)},${a.bodies.hand.position.z.toFixed(3)}] can=[${sim.can.position.x.toFixed(3)},${sim.can.position.y.toFixed(3)},${sim.can.position.z.toFixed(3)}]`)
    // contacts touching can / hand group bodies
    const names = new Map(sim.world.bodies.map((b) => [b.id, b.kitName || `#${b.id}`]))
    console.log(`   doorA=${sim.cabinet.angle().toFixed(3)} doorPos=[${sim.cabinet.body.position.x.toFixed(3)},${sim.cabinet.body.position.z.toFixed(3)}]`); const touches = new Set()
    for (const eq of sim.world.contacts) {
        const A = names.get(eq.bi.id), B = names.get(eq.bj.id)
        if (true) touches.add(`${A}<->${B}`)
    }
    console.log(`   contacts: ${[...touches].join(', ') || 'none'}`)
}
