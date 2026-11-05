import { createRobotSim } from './src/utils/robot/index.js'

const sim = createRobotSim(5)
const arm = sim.arm
const t = [0.4, 0.96, -0.01]
arm.setTarget(t[0], t[1], t[2])
// replicate solve()'s IK to get desired joints
const shoulder = { x: arm.target.x, y: 0, z: 0 } // not used; recompute below
console.log('raw target:', t, 'clamped target:', [arm.target.x, arm.target.y, arm.target.z])
for (let i = 0; i < 600; i++) sim.step({ pad: { x: 0, y: 0, a: false, b: false } })
const g = arm.graspPoint()
const j = arm.joints
console.log('converged joints:', {
    yaw: +j.yaw.toFixed(3), phi1: +j.phi1.toFixed(3), phi2: +j.phi2.toFixed(3), gamw: +j.gamw.toFixed(3),
})
console.log('grasp:', g.map((v) => (v * 1000).toFixed(1)), 'target:', (t * 1).map((v) => v * 1000))
// base strain + plate
console.log('strainN:', arm.baseStrainN(), 'baseDelta:', arm.baseDelta())
// how far is the hand body COM from where IK thinks the wrist is?
console.log('hand pos:', arm.bodies ? 'n/a' : 'n/a')
