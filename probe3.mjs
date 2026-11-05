// Probe: what does solve() actually command? Recompute the IK the same way
// arm.js does and print desired vs actual each window.
import { createRobotSim } from './src/utils/robot/index.js'
import { LIMITS } from './src/utils/robot/arm.js'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

const sim = createRobotSim(5)
const arm = sim.arm
const t = [0.4, 0.96, -0.01]
arm.setTarget(t[0], t[1], t[2])
const L1 = 0.3, L2 = 0.3, LG = 0.055
const sh = arm.shoulder
for (let i = 0; i < 600; i++) sim.step({ pad: { x: 0, y: 0, a: false, b: false } })
const j = arm.joints
const dx = arm.target.x - sh.x, dzw = arm.target.z - sh.z, dy = arm.target.y - sh.y
const yawd = Math.atan2(dx, Math.max(0.06, dzw))
const f = Math.max(1e-6, Math.hypot(dx, dzw))
const wd = -(dy + LG)
const r = Math.min(Math.hypot(f, wd), L1 + L2 - 0.002)
const psi = Math.atan2(f, Math.max(1e-6, wd))
const c2 = (r * r - L1 * L1 - L2 * L2) / (2 * L1 * L2)
const phi2d = -Math.acos(clamp(c2, -1, 1))
const phi1d = clamp(psi - Math.atan2(L2 * Math.sin(phi2d), L1 + L2 * Math.cos(phi2d)), LIMITS.phi1[0], LIMITS.phi1[1])
const phi2dC = clamp(phi2d, LIMITS.phi2[0], LIMITS.phi2[1])
console.log('target(clamped):', [arm.target.x, arm.target.y, arm.target.z])
console.log('shoulder:', sh, 'dy', dy.toFixed(3), 'f', f.toFixed(3), 'wd', wd.toFixed(3), 'r', r.toFixed(3))
console.log('desired yaw/phi1/phi2/gamw:', yawd.toFixed(3), phi1d.toFixed(3), phi2dC.toFixed(3), (-(phi1d + phi2dC)).toFixed(3))
console.log('actual ', j.yaw.toFixed(3), j.phi1.toFixed(3), j.phi2.toFixed(3), j.gamw.toFixed(3))
console.log('gamma actual:', (j.phi1 + j.phi2 + j.gamw).toFixed(3), 'grasp:', arm.graspPoint().map((v) => (v * 1000).toFixed(0)))
// contacts involving arm bodies?
const names = sim.world.contacts.filter((c) => (c.bi.kitName || '').match(/yoke|upper|fore|hand|finger/) || (c.bj.kitName || '').match(/yoke|upper|fore|hand|finger/))
  .map((c) => `${c.bi.kitName ?? c.bi.id}|${c.bj.kitName ?? c.bj.id}`)
console.log('arm contacts:', names.length, [...new Set(names)].slice(0, 8).join(' '))
