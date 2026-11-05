// Probe: how does the rigid chain behave driving to a target?
import { createRobotSim } from './src/utils/robot/index.js'

const sim = createRobotSim(5)
const arm = sim.arm
const t = [0.4, 0.96, -0.01]
arm.setTarget(t[0], t[1], t[2])
console.log('target:', t, 'home grasp:', arm.graspPoint())
for (let i = 0; i < 480; i++) {
    sim.step({ pad: { x: 0, y: 0, a: false, b: false } })
    if (i % 40 === 0 || i >= 470) {
        const g = arm.graspPoint()
        const d = Math.hypot(g[0] - t[0], g[1] - t[1], g[2] - t[2])
        const j = arm.joints
        console.log(
            `t=${i} target=(${arm.target.x.toFixed(3)},${arm.target.y.toFixed(3)},${arm.target.z.toFixed(3)}) grasp=(${g.map((v) => (v * 1000).toFixed(0)).join(',')}) err=${(d * 1000).toFixed(0)}mm ` +
            `yaw=${j.yaw.toFixed(2)} phi1=${j.phi1.toFixed(2)} phi2=${j.phi2.toFixed(2)} gamw=${j.gamw.toFixed(2)} ` +
            `torque=${JSON.stringify(arm.torqueNow)}`
        )
    }
}
console.log('strainN:', arm.baseStrainN(), 'baseDelta:', arm.baseDelta())
