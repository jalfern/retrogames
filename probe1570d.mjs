// probe1570d — lift6 deep trace: why far-reach payload lift creeps.
import { createRobotSim, createAutopilot, WIN_TICKS } from './src/utils/robot/index.js'
import { CANNON } from './src/utils/robot/physics.js'

const seed = Number(process.argv[2] || 3)
const sim = createRobotSim(seed)
const ap = createAutopilot(sim)
let lastPhase = ''
let n = 0
const SEG = new CANNON.Vec3(-1, 0, 0), YAW = new CANNON.Vec3(0, 1, 0)
const names = new Map(sim.world.bodies.map((b) => [b.id, b.kitName || `#${b.id}`]))
for (let i = 0; i < WIN_TICKS; i++) {
    const s = sim.step({ pad: ap() })
    const ph = ap.phaseInfo()
    const name = ph.split(':')[0]
    if (name !== lastPhase) { lastPhase = name; if (name === 'lift6') n = 0 }
    if (name !== 'lift6') continue
    n++
    if (n % 8 !== 1) continue
    const a = sim.arm
    const ja = a.joints
    const om = (prox, dist, axis) => {
        const aw = dist.quaternion.vmult(axis)
        return (dist.angularVelocity.x - prox.angularVelocity.x) * aw.x + (dist.angularVelocity.y - prox.angularVelocity.y) * aw.y + (dist.angularVelocity.z - prox.angularVelocity.z) * aw.z
    }
    const touches = new Set()
    for (const eq of sim.world.contacts) {
        const A = names.get(eq.bi.id), B = names.get(eq.bj.id)
        if (A === 'can' || B === 'can') touches.add(`${A}<->${B}`)
    }
    console.log(`n=${n} tgt.y=${a.target.y.toFixed(3)} gp=[${a.graspPoint()[0].toFixed(3)},${a.graspPoint()[1].toFixed(3)},${a.graspPoint()[2].toFixed(3)}] ja=[y=${ja.yaw.toFixed(2)} p1=${ja.phi1.toFixed(2)} p2=${ja.phi2.toFixed(2)} gw=${ja.gamw.toFixed(2)}] om=[y=${om(a.bodies.base, a.bodies.yoke, YAW).toFixed(2)} p1=${om(a.bodies.yoke, a.bodies.upper, SEG).toFixed(2)} p2=${om(a.bodies.upper, a.bodies.fore, SEG).toFixed(2)}] tau=[y=${a.torqueNow.yaw.toFixed(1)} p1=${a.torqueNow.phi1.toFixed(1)} p2=${a.torqueNow.phi2.toFixed(1)} gw=${a.torqueNow.gamw.toFixed(1)}] integ=[p1=${a.integral.phi1.toFixed(2)} p2=${a.integral.phi2.toFixed(2)}] can.y=${sim.can.position.y.toFixed(3)} contacts=${[...touches].join(',') || '-'}`)
}
