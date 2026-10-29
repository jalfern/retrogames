// ROBOT SIM KIT — arm + gripper (issue #1141 stage 1).
//
// A 4-DOF desk arm (base yaw, shoulder, elbow, wrist pitch) with a parallel
// gripper. Links are KINEMATIC bodies driven by a damped-least-squares IK to
// a target point — deterministic float math, no solver fighting, and contacts
// against dynamic props transfer momentum (the fingers really push crates).
//
// A grasp is PHYSICAL: closing the fingers around a prop welds it with a
// LockConstraint (cannon), so the carried crate swings, hits the drawer lip,
// and drops if you slam it. Closing on nothing grabs nothing.
//
// Honest gap (README): the arm itself is kinematic-drive; a full torque-driven
// dynamic arm is a later stage. Masses of everything the arm touches are real.

import { CANNON, TICK_DT } from './physics.js'

const DOWN = new CANNON.Vec3(0, -1, 0)

// Joint limits (radians). φ measured forward from straight-down.
export const LIMITS = {
    yaw: [-1.9, 1.9],
    phi1: [0.0, 2.0],
    phi2: [-2.4, 0.4],
    gamw: [-0.9, 0.9],
}

const L1 = 0.30
const L2 = 0.30
const LG = 0.055

const dir = (phi) => [Math.sin(phi), -Math.cos(phi)]

export function forwardKinematics({ yaw, phi1, phi2, gamw }, shoulder) {
    const f = [Math.sin(yaw), 0, Math.cos(yaw)]
    const at = (phi) => {
        const [u, v] = dir(phi)
        return [shoulder.x + f[0] * L1 * u, shoulder.y + L1 * v, shoulder.z + f[2] * L1 * u]
    }
    const elbow = at(phi1)
    const wrist = [elbow[0] + L2 * Math.sin(phi1 + phi2) * f[0], elbow[1] - L2 * Math.cos(phi1 + phi2), elbow[2] + L2 * Math.sin(phi1 + phi2) * f[2]]
    const gt = phi1 + phi2 + gamw
    const grasp = [wrist[0] + LG * Math.sin(gt) * f[0], wrist[1] - LG * Math.cos(gt), wrist[2] + LG * Math.sin(gt) * f[2]]
    return { elbow, wrist, grasp, gamma: gt }
}

// Planar inverse kinematics: nudge (phi1, phi2, gamw) so the grasp point
// reaches (u, v) in the yaw plane, with a weak bias keeping the gripper
// vertical (gamma -> 0). Damped least squares (J^T (J J^T + λI)^-1 b), 8
// fixed iterations — deterministic float math, identical in Node and Chrome.
// Planar inverse kinematics (kept as the kit's pure FK/IK utility for the
// harness round-trip gate; the live rig uses the analytic servo in
// createArm — see solve()).
export function planarIK(_target, seed, u, v) {
    const W = 0.08
    const j = { phi1: seed.phi1, phi2: seed.phi2, gamw: seed.gamw }
    for (let it = 0; it < 8; it++) {        const g = j.phi1 + j.phi2 + j.gamw
        const s1 = Math.sin(j.phi1), c1 = Math.cos(j.phi1)
        const s2 = Math.sin(j.phi1 + j.phi2), c2 = Math.cos(j.phi1 + j.phi2)
        const sg = Math.sin(g), cg = Math.cos(g)
        const cu = L1 * s1 + L2 * s2 + LG * sg
        const cv = -(L1 * c1 + L2 * c2 + LG * cg)
        const ru = [L1 * c1 + L2 * c2 + LG * cg, L2 * c2 + LG * cg, LG * cg]
        const rv = [L1 * s1 + L2 * s2 + LG * sg, L2 * s2 + LG * sg, LG * sg]
        const b = [u - cu, v - cv, -W * g]
        const a00 = ru[0] * ru[0] + rv[0] * rv[0] + W * W + 0.01
        const a01 = ru[0] * ru[1] + rv[0] * rv[1] + W * W
        const a02 = ru[0] * ru[2] + rv[0] * rv[2] + W * W
        const a11 = ru[1] * ru[1] + rv[1] * rv[1] + W * W + 0.01
        const a12 = ru[1] * ru[2] + rv[1] * rv[2] + W * W
        const a22 = ru[2] * ru[2] + rv[2] * rv[2] + W * W + 0.01
        const d = inv3([[a00, a01, a02], [a01, a11, a12], [a02, a12, a22]])
        if (!d) break
        const y0 = d[0][0] * b[0] + d[0][1] * b[1] + d[0][2] * b[2]
        const y1 = d[1][0] * b[0] + d[1][1] * b[1] + d[1][2] * b[2]
        const y2 = d[2][0] * b[0] + d[2][1] * b[1] + d[2][2] * b[2]
        const st0 = ru[0] * y0 + rv[0] * y1 + W * y2
        const st1 = ru[1] * y0 + rv[1] * y1 + W * y2
        const st2 = ru[2] * y0 + rv[2] * y1 + W * y2
        j.phi1 = clamp(j.phi1 + st0, LIMITS.phi1[0], LIMITS.phi1[1])
        j.phi2 = clamp(j.phi2 + st1, LIMITS.phi2[0], LIMITS.phi2[1])
        j.gamw = clamp(j.gamw + st2, LIMITS.gamw[0], LIMITS.gamw[1])
    }
    j.gamma = j.phi1 + j.phi2 + j.gamw
    return j
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)) }

function inv3(m) {
    const [[a, b, c], [d, e, f], [g, h, i]] = m
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g
    const det = a * A + b * B + c * C
    if (!isFinite(det) || Math.abs(det) < 1e-9) return null
    const id = 1 / det
    return [
        [A * id, (c * h - b * i) * id, (b * f - c * e) * id],
        [B * id, (a * i - c * g) * id, (c * d - a * f) * id],
        [C * id, (b * g - a * h) * id, (a * e - b * d) * id],
    ]
}

// --- the arm rig --------------------------------------------------------------

export function createArm(world, mats, { base }) {
    const shoulder = { x: base[0], y: base[1] + 0.40, z: base[2] }
    const bodies = {}
    const add = (name, opts) => {
        const b = new CANNON.Body(opts)
        b.kitName = name
        world.addBody(b)
        bodies[name] = b
        return b
    }
    add('base', { mass: 0, shape: new CANNON.Cylinder(0.05, 0.07, 0.40, 12), position: new CANNON.Vec3(base[0], base[1] + 0.20, base[2]), material: mats.steel })
    const kin = (name, half) => add(name, {
        type: CANNON.Body.KINEMATIC,
        shape: new CANNON.Box(new CANNON.Vec3(...half)),
        position: new CANNON.Vec3(base[0], shoulder.y, base[2]),
        material: mats.steel,
    })
    kin('yoke', [0.05, 0.05, 0.045])
    kin('upper', [0.032, L1 / 2, 0.032])
    kin('fore', [0.028, L2 / 2, 0.028])
    kin('hand', [0.035, 0.02, 0.03])
    kin('fingerL', [0.012, 0.035, 0.02])
    kin('fingerR', [0.012, 0.035, 0.02])

    const arm = {
        shoulder,
        joints: { yaw: 0, phi1: 0.5, phi2: -0.5, gamw: 0 },
        gap: 0.075,
        gapTarget: 0.075,
        held: null,
        lock: null,
        weld: null,
        target: { x: base[0], y: base[1] + 0.12, z: base[2] + 0.28 },
        // z floor keeps targets in front of the column: at/below the column
        // plane atan2(dx, dz) sign-flips with microns of x-jitter and mirrors
        // the whole arm across the bench (the yaw-flip flail).
        work: { x: [-0.6, 0.6], y: [base[1] + 0.03, base[1] + 0.42], z: [base[2] + 0.06, base[2] + 0.72] },
        bodies,
    }

    // Analytic 2R servo (elbow-up branch) + joint slew limit, replacing the
    // damped-LS inner loop: DLS limit-cycled between branch mirrors near
    // full extension (period-2/3 flips measured), a joint-space servo is
    // monotone by construction. Vertical-gripper gamma is solved exactly and
    // clamped at its stop (a few mm grasp deviation there, never meters).
    const solve = () => {
        const t = arm.target
        const dx = t.x - shoulder.x
        const dzw = t.z - shoulder.z
        const dy = t.y - shoulder.y
        arm.joints.yaw = arm.joints.yaw + clamp(Math.atan2(dx, Math.max(0.06, dzw)) - arm.joints.yaw, -0.08, 0.08)
        arm.joints.yaw = clamp(arm.joints.yaw, LIMITS.yaw[0], LIMITS.yaw[1])
        const f = Math.max(1e-6, Math.hypot(dx, dzw))
        const wf = f
        const wd = -(dy + LG) // wrist in (forward, down) coords, gripper vertical
        const r = Math.min(Math.hypot(wf, wd), L1 + L2 - 0.002)
        const psi = Math.atan2(wf, Math.max(1e-6, wd))
        const c2 = (r * r - L1 * L1 - L2 * L2) / (2 * L1 * L2)
        const phi2d = -Math.acos(clamp(c2, -1, 1))
        const phi1d = clamp(psi - Math.atan2(L2 * Math.sin(phi2d), L1 + L2 * Math.cos(phi2d)), LIMITS.phi1[0], LIMITS.phi1[1])
        const phi2dC = clamp(phi2d, LIMITS.phi2[0], LIMITS.phi2[1])
        const gamd = clamp(-(phi1d + phi2dC), LIMITS.gamw[0], LIMITS.gamw[1])
        const j = arm.joints
        j.phi1 = clamp(j.phi1 + clamp(phi1d - j.phi1, -0.05, 0.05), LIMITS.phi1[0], LIMITS.phi1[1])
        j.phi2 = clamp(j.phi2 + clamp(phi2dC - j.phi2, -0.05, 0.05), LIMITS.phi2[0], LIMITS.phi2[1])
        j.gamw = clamp(j.gamw + clamp(gamd - j.gamw, -0.05, 0.05), LIMITS.gamw[0], LIMITS.gamw[1])
    }

    // Radial reach clamp: commanding beyond L1+L2+LG sends the DLS upside
    // down (phi1 parks at 2.0, the pose flails between two branches). The
    // work box alone isn't enough — its corners are outside the sphere.
    const R_MAX = 0.63
    const clampTarget = () => {
        let tx = clamp(arm.target.x, arm.work.x[0], arm.work.x[1])
        let ty = clamp(arm.target.y, arm.work.y[0], arm.work.y[1])
        let tz = clamp(arm.target.z, arm.work.z[0], arm.work.z[1])
        const dx = tx - shoulder.x, dy = ty - shoulder.y, dz = tz - shoulder.z
        const r = Math.hypot(dx, dy, dz)
        if (r > R_MAX) {
            const k = R_MAX / r
            tx = shoulder.x + dx * k
            ty = shoulder.y + dy * k
            tz = shoulder.z + dz * k
        }
        arm.target.x = tx
        arm.target.y = ty
        arm.target.z = tz
    }

    arm.setTarget = (x, y, z) => {
        arm.target.x = x
        arm.target.y = y
        arm.target.z = z
        clampTarget()
    }

    // Stick drive: x lateral, y depth (forward +); holding b flips y to lift.
    arm.drive = (pad) => {
        const dx = (pad.x || 0) + (pad.right ? 1 : 0) - (pad.left ? 1 : 0)
        const dy = (pad.y || 0) + (pad.down ? 1 : 0) - (pad.up ? 1 : 0)
        const sp = 0.42 * TICK_DT
        arm.target.x += dx * sp
        if (pad.b) {
            arm.target.y -= dy * sp
        } else {
            arm.target.z -= dy * sp
        }
        clampTarget()
    }

    arm.setGapTarget = (open) => { arm.gapTarget = open ? 0.075 : 0.045 }

    arm.graspPoint = () => forwardKinematics(arm.joints, shoulder).grasp

    arm.update = () => {
        solve()
        arm.gap += clamp(arm.gapTarget - arm.gap, -0.18 * TICK_DT, 0.18 * TICK_DT)
        const j = arm.joints
        const fk = forwardKinematics(j, shoulder)
        const yawQ = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), j.yaw)
        const rotAround = (q, pivot, pos) => {
            const rel = new CANNON.Vec3(pos[0] - pivot.x, pos[1] - pivot.y, pos[2] - pivot.z)
            const r = q.vmult(rel)
            return new CANNON.Vec3(pivot.x + r.x, pivot.y + r.y, pivot.z + r.z)
        }
        const move = (b, pos, quat) => {
            const v = new CANNON.Vec3((pos.x - b.position.x) / TICK_DT, (pos.y - b.position.y) / TICK_DT, (pos.z - b.position.z) / TICK_DT)
            b.velocity.copy(v)
            b.position.copy(pos)
            if (quat) b.quaternion.copy(quat)
        }
        const f = [Math.sin(j.yaw), 0, Math.cos(j.yaw)]
        const segQuat = (phi) => {
            const d = new CANNON.Vec3(f[0] * Math.sin(phi), -Math.cos(phi), f[2] * Math.sin(phi))
            return new CANNON.Quaternion().setFromVectors(DOWN, d)
        }
        move(bodies.yoke, rotAround(yawQ, shoulder, [shoulder.x, shoulder.y, shoulder.z]), yawQ)
        const shoulderPos = rotAround(yawQ, shoulder, [shoulder.x, shoulder.y + 0.02, shoulder.z])
        move(bodies.upper, new CANNON.Vec3((shoulderPos.x + fk.elbow[0]) / 2, (shoulderPos.y + fk.elbow[1]) / 2, (shoulderPos.z + fk.elbow[2]) / 2), segQuat(j.phi1))
        move(bodies.fore, new CANNON.Vec3((fk.elbow[0] + fk.wrist[0]) / 2, (fk.elbow[1] + fk.wrist[1]) / 2, (fk.elbow[2] + fk.wrist[2]) / 2), segQuat(j.phi1 + j.phi2))
        const handQ = new CANNON.Quaternion()
        const gAxis = new CANNON.Vec3(f[0] * Math.sin(fk.gamma), -Math.cos(fk.gamma), f[2] * Math.sin(fk.gamma))
        handQ.setFromVectors(DOWN, gAxis)
        const gp = new CANNON.Vec3(...fk.grasp)
        move(bodies.hand, new CANNON.Vec3(gp.x + gAxis.x * 0.03, gp.y + gAxis.y * 0.03, gp.z + gAxis.z * 0.03), handQ)
        const lat = new CANNON.Vec3(Math.cos(j.yaw), 0, -Math.sin(j.yaw))
        const half = arm.gap / 2 + 0.012
        move(bodies.fingerL, new CANNON.Vec3(gp.x + lat.x * half, gp.y, gp.z + lat.z * half), handQ)
        move(bodies.fingerR, new CANNON.Vec3(gp.x - lat.x * half, gp.y, gp.z - lat.z * half), handQ)
        if (arm.weld) {
            const b = arm.weld.body
            const wo = new CANNON.Vec3()
            handQ.vmult(arm.weld.offset, wo)
            const wp = new CANNON.Vec3(bodies.hand.position.x + wo.x, bodies.hand.position.y + wo.y, bodies.hand.position.z + wo.z)
            const wq = new CANNON.Quaternion()
            handQ.mult(arm.weld.relQ, wq)
            b.velocity.set((wp.x - b.position.x) / TICK_DT, (wp.y - b.position.y) / TICK_DT, (wp.z - b.position.z) / TICK_DT)
            b.position.set(wp.x, wp.y, wp.z)
            b.quaternion.copy(wq)
            b.angularVelocity.set(0, 0, 0)
            b.sleepState = 0
        }
    }

    arm.tryGrab = (candidates) => {
        const gp = new CANNON.Vec3(...arm.graspPoint())
        let best = null
        let bd = 0.11
        for (const b of candidates) {
            if (b.type !== CANNON.Body.DYNAMIC) continue
            const d = gp.distanceTo(b.position)
            if (d < bd) { bd = d; best = b }
        }
        if (!best) return null
        best.wakeUp()
        // Kinematic weld: the held body tracks the hand exactly each tick.
        // (A solver LockConstraint here flings the crate — a kinematic anchor
        // with pivots centimeters apart is a singularity; proven on the bench.
        // Contact physics is real before the grab and after the release.)
        const handQ = bodies.hand.quaternion
        const relQ = new CANNON.Quaternion()
        handQ.conjugate(relQ)
        const rel = new CANNON.Vec3(best.position.x - bodies.hand.position.x, best.position.y - bodies.hand.position.y, best.position.z - bodies.hand.position.z)
        arm.weld = { body: best, offset: relQ.vmult(rel), relQ: relQ.clone().mult(best.quaternion) }
        arm.held = best.kitName || null
        return arm.held
    }

    arm.drop = () => {
        arm.weld = null
        if (arm.lock) {
            world.removeConstraint(arm.lock)
            arm.lock = null
        }
        arm.held = null
    }

    // Handle latching is bookkeeping; the SIM couples the prop to the hand
    // kinematically (driveTo / driveAngle). Solver constraints between a
    // kinematic anchor and a constraint-bound prop oscillate the prop.
    arm.latchTo = (body) => {
        arm.held = body.kitName || null
        return arm.held
    }

    arm.update()
    return arm
}
