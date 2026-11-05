// ROBOT SIM KIT — arm + gripper (issue #1141 stages 1–3).
//
// A 4-DOF desk arm (base yaw, shoulder, elbow, wrist pitch) with a parallel
// gripper. Stage 3 made the joints TORQUE-DRIVEN: the servo commands
// τ = Kp·θ_err + Kd·ω_err + gravity feedforward, clamped at per-joint τ_max
// (desk-arm class figures in JOINT_SPECS, transcribed with provenance), and
// θ̈ = τ/I integrates the joint at fixed dt. Fast direction changes lag,
// saturation is observable, and the carried payload's mass loads the distal
// joints for real. Links remain KINEMATIC bodies (their contact pushes still
// transfer momentum — the fingers really shove crates); the stage-1 solver
// lessons (kinematic anchor + constraint = fling) still stand.
//
// A grasp is a FORCE-CLOSURE budget, not a flag: n·μ·F_clamp from the 2F-85
// SimReady record must cover m·(g+|a|) of the carried asset, smoothed — slam
// a crate into the drawer lip and it slips out. Closing on nothing holds
// nothing; a load the pads can't statically hold is refused at the grab.

import { CANNON, TICK_DT, COLLISION, LINK_MASK } from './physics.js'
import { assetFor } from './assets.js'

const DOWN = new CANNON.Vec3(0, -1, 0)
const G = 9.82

// Joint limits (radians). φ measured forward from straight-down.
export const LIMITS = {
    yaw: [-1.9, 1.9],
    phi1: [0.0, 2.0],
    phi2: [-2.4, 0.4],
    gamw: [-0.9, 0.9],
}

// Stage 3: per-joint actuator spec. τ_max/inertia/rated speed are desk-arm
// class figures (280 mm reach class, ~250 g rated payload scaled to the kit's
// SimReady masses), tuned so a rated carry holds statically at ≥1.5× margin
// and the full working envelope is crossed inside the task clock. Gains are
// ζ=1 at ωn·dt≈0.3 (discrete-stability budget with a 3× safety factor —
// ωn·dt ≥ 1 turns the torque-limited servo into a max-ω relay that period-2
// flips the whole rig; measured).
// physicsProvenance: class estimate, transcribed from published arm-class
// data — recorded in the manifest, recomputable by robokitcheck (gate 11).
// servoK (stage 4a): the rigid chain runs a VELOCITY servo — ω_des =
// clamp(servoK·θ_err, ±ω_max), τ = kd·(ω_des − ω_joint) + gravity ff. A pure
// stiffness PD on a true multibody chain is only stable at gains tuned to the
// exact reflected inertia, which swings with pose and payload; the velocity
// form bounds joint speed regardless, so saturation and reaction stay honest.
export const JOINT_SPECS = {
    yaw: { tauMax: 8.0, inertia: 0.055, omegaMax: 2.6, kp: 12, kd: 1.7, servoK: 3.2, ki: 3, intCap: 1.5 },
    phi1: { tauMax: 12.0, inertia: 0.045, omegaMax: 2.4, kp: 16, kd: 1.9, servoK: 4.0, ki: 3, intCap: 3.0 },
    phi2: { tauMax: 8.0, inertia: 0.022, omegaMax: 2.8, kp: 8, kd: 1.0, servoK: 4.2, ki: 3, intCap: 2.0 },
    gamw: { tauMax: 2.5, inertia: 0.006, omegaMax: 3.0, kp: 2, kd: 0.25, servoK: 5.0, ki: 3, intCap: 0.8 },
}

// Reflected rotor/gearbox inertia floors (kg·m² about the joint axis). Real
// gearhead joints carry motor inertia reflected through the ratio; cannon's
// raw box inertias for thin links are ~100× below the stage-3 virtual joints
// the τ spec was tuned against, and a ±τmax pair on those put ±50 rad/s of
// spin into the chain EVERY tick — the solver churned the arm into a limp rag
// (the stage-4a collapse, measured: servo error 991 mm, strain 1772 N).
// Floors apply per body axis; bodies keep their own inertia above the floor.
export const INERTIA_FLOORS = {
    yoke: { y: JOINT_SPECS.yaw.inertia },
    upper: { x: JOINT_SPECS.phi1.inertia },
    fore: { x: JOINT_SPECS.phi2.inertia },
    hand: { x: JOINT_SPECS.gamw.inertia },
}

// Raise a body's local inertia to its joint's reflected floor; the floor is
// recorded on the body so snapshot/restore (which calls
// updateMassProperties) can re-apply it.
export function applyInertiaFloors(b) {
    const floor = INERTIA_FLOORS[b.kitName]
    if (!floor) return
    for (const ax of ['x', 'y', 'z']) {
        const f = floor[ax]
        if (!f) continue
        const cur = b.invInertia[ax] > 0 ? 1 / b.invInertia[ax] : Infinity
        if (cur < f) b.invInertia[ax] = 1 / f
    }
    b.updateInertiaWorld(true)
    b.kitInertiaFloors = floor
}

// Link masses (kg): arm links class-estimated; hand+fingers = the 2F-85
// recorded mass from the SimReady manifest (mass travels with the asset).
export const LINK_MASSES = { upper: 0.55, fore: 0.35 }
export const GRIPPER_MASS = assetFor('gripper').physics.massKg

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

// --- force closure (stage 3) --------------------------------------------------
// A parallel gripper holds by friction: budget = contacts·μ_eff·F_clamp, all
// from the 2F-85 SimReady record (grip block) and the carried asset's own
// transcribed surface friction. Held while the smoothed inertial demand of the
// prop stays under budget; a sustained crash (real contact deceleration)
// breaks the weld — the SLIP the stage-1 README promised.
export const SLIP_EMA = 0.1
export const SLIP_SLACK = 1.5
// Gross-slip criterion: pads visibly grinding while the servo fights an
// obstacle = force closure already lost (the deviation can't grow if the
// pads hold). 20 mm of sustained displacement is a crash, not a graze —
// measured: door grazes peak ~13 mm, wall slams run past 20 within ticks.
export const SLIP_GRIND = 0.02
export const GRIND_EMA = 0.15

export function forceClosureFor(body) {
    const grip = assetFor('gripper').grip
    const surf = body.material && Number.isFinite(body.material.friction) ? body.material.friction : grip.padFriction
    const muEff = Math.min(grip.padFriction, surf)
    return {
        muEff,
        budgetN: grip.contacts * muEff * grip.clampForceN,
        demandN: body.mass * G,
        safety: grip.safety,
    }
}

// --- the arm rig --------------------------------------------------------------
//
// Stage 4a (#1570 item 1): every arm link is a DYNAMIC cannon body joined at
// its joint by a real solver hinge (base→yoke yaw, yoke→upper shoulder,
// upper→fore elbow, fore→hand wrist) and the fingers lock to the hand with a
// sliding pivot (the gap is still commanded). The stage-3 torque law
// (τ = Kp·θ_err − Kd·ω_err + gravity feedforward, clamped at τ_max) is now an
// ACTUATOR: the torque is applied as an equal-and-opposite pair across each
// joint, so the reaction pushes back through the chain onto the base (item 2:
// a fixed base reads it as strain, a mobile base slides or tips). Joint
// angles are READ from the body poses — heavy payloads and collisions move
// the chain, not just the readout.
//
// The carried-cargo weld stays stage-3 (kinematic pose law + force-closure
// slip monitor): a solver lock to the hand flings the crate (stage-1
// gotcha), and the payload's load on the chain is transmitted as the rigidly
// carried body's net force+moment (weight + inertial) applied at the weld
// point on the hand — the honest multibody load, without the fling.

const YAW_AXIS = new CANNON.Vec3(0, 1, 0)
const SEG_AXIS = new CANNON.Vec3(-1, 0, 0) // +torque = +φ (seg from straight-down toward forward)

// Stage 4a collision tiers: fixtures (bench/drawer/door/column/plate) are
// group 4; arm links are group 16 with those bits masked off — links still
// shove CARGO (crate/can, group 1) but no longer catch on fixture geometry.
// The stage-3 chain was kinematic and ghosted through the drawer; a dynamic
// chain catches (measured: hand/finger|drawer pinned a target 118 mm short)
// and the catch is solver churn, not gameplay. Cargo↔fixture stays solid,
// and a held crate pressed into anything still loads the chain for real.
const FIXTURE_GROUP = COLLISION.FIXTURE
const LINK_GROUP = COLLISION.LINK

export const LINK_MASS_YOKE = 0.20
export const FINGER_MASS = 0.05
// hand + 2 fingers = the 2F-85 recorded 0.25 kg exactly (mass travels with
// the asset — a chain heavier than the manifest breaks the SimReady promise).
export const GRIPPER_HAND_MASS = assetFor('gripper').physics.massKg - 2 * FINGER_MASS
export const BASE_PLATE_MASS = 2.0
export const BASE_PLATE = { half: [0.12, 0.025, 0.12] }

// Gravity moment arms along the gripper axis (m, from wrist): the hand body's
// COM sits 30 mm beyond the grasp point (graspPoint reads hand COM − 30 mm),
// the fingers hang at grasp level. The stage-3 FF used LG for the whole
// gripper — a ~0.5 N·m mismatch at horizontal reach that left a ~30 mm
// steady-state sag on the real chain (measured, #1570).
export const GRIPPER_CG = 0.085
export const FINGER_CG = 0.055

export function createArm(world, mats, { base, rigid = true, mobileBase = false }) {
    const shoulder = { x: base[0], y: base[1] + 0.40, z: base[2] }
    const bodies = {}
    const add = (name, opts) => {
        const b = new CANNON.Body(opts)
        b.kitName = name
        world.addBody(b)
        bodies[name] = b
        return b
    }
    add('base', { mass: rigid && mobileBase ? 1.0 : 0, shape: new CANNON.Cylinder(0.05, 0.07, 0.40, 12), position: new CANNON.Vec3(base[0], base[1] + 0.20, base[2]), material: mats.steel, collisionFilterGroup: FIXTURE_GROUP })
    if (mobileBase && rigid) {
        // Mobile base plate under the post: friction against the bench lets
        // a fast swing or a heavy lift slide or tip it (stage 4a item 2).
        bodies.basePlate = add('basePlate', {
            mass: BASE_PLATE_MASS,
            shape: new CANNON.Box(new CANNON.Vec3(...BASE_PLATE.half)),
            position: new CANNON.Vec3(base[0], base[1] + BASE_PLATE.half[1], base[2]),
            material: mats.steel,
            collisionFilterGroup: FIXTURE_GROUP,
        })
    }
    const dyn = (name, half, mass) => {
        const b = add(name, {
            mass,
            shape: new CANNON.Box(new CANNON.Vec3(...half)),
            position: new CANNON.Vec3(base[0], shoulder.y, base[2]),
            material: mats.steel,
            collisionFilterGroup: LINK_GROUP,
            collisionFilterMask: LINK_MASK,
        })
        applyInertiaFloors(b)
        return b
    }
    const kin = (name, half) => add(name, {
        type: CANNON.Body.KINEMATIC,
        shape: new CANNON.Box(new CANNON.Vec3(...half)),
        position: new CANNON.Vec3(base[0], shoulder.y, base[2]),
        material: mats.steel,
    })
    if (rigid) {
        dyn('yoke', [0.05, 0.05, 0.045], LINK_MASS_YOKE)
        dyn('upper', [0.032, L1 / 2, 0.032], LINK_MASSES.upper)
        dyn('fore', [0.028, L2 / 2, 0.028], LINK_MASSES.fore)
        dyn('hand', [0.035, 0.02, 0.03], GRIPPER_HAND_MASS)
        dyn('fingerL', [0.012, 0.035, 0.02], FINGER_MASS)
        dyn('fingerR', [0.012, 0.035, 0.02], FINGER_MASS)
    } else {
        kin('yoke', [0.05, 0.05, 0.045])
        kin('upper', [0.032, L1 / 2, 0.032])
        kin('fore', [0.028, L2 / 2, 0.028])
        kin('hand', [0.035, 0.02, 0.03])
        kin('fingerL', [0.012, 0.035, 0.02])
        kin('fingerR', [0.012, 0.035, 0.02])
    }
    const gripperAsset = assetFor('gripper')
    bodies.hand.simready = gripperAsset.id
    bodies.hand.simreadyMass = gripperAsset.physics.massKg

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

    // Stage 3: analytic 2R pose solver (elbow-up branch) sets joint DESIREDs;
    // per-joint torque actuators integrate the real motion. The stage-1 direct
    // slew-limit integrator had no dynamics — no lag, no saturation, no load.
    const spin = { yaw: 0, phi1: 0, phi2: 0, gamw: 0 }
    const integral = { yaw: 0, phi1: 0, phi2: 0, gamw: 0 }
    const torqueNow = { yaw: 0, phi1: 0, phi2: 0, gamw: 0 }
    const saturated = { yaw: false, phi1: false, phi2: false, gamw: false }

    // Stage 4a (rigid chain): joints are read from the body poses; the stage-3
    // torque law becomes an equal-and-opposite actuator pair across each
    // solver hinge, so the reaction reaches the base.
    const constraints = []
    let fingerLockL = null
    let fingerLockR = null
    let basePlateInit = null
    const linkBodies = () => [bodies.yoke, bodies.upper, bodies.fore, bodies.hand, bodies.fingerL, bodies.fingerR]

    const readJoints = () => {
        const fz = bodies.yoke.quaternion.vmult(new CANNON.Vec3(0, 0, 1))
        const yaw = Math.atan2(fz.x, fz.z)
        const f = new CANNON.Vec3(Math.sin(yaw), 0, Math.cos(yaw))
        const segAngle = (b) => {
            const d = b.quaternion.vmult(DOWN)
            return Math.atan2(d.x * f.x + d.z * f.z, -d.y)
        }
        const phi1 = segAngle(bodies.upper)
        const phi2 = segAngle(bodies.fore) - phi1
        const gamw = segAngle(bodies.hand) - phi1 - phi2
        return { yaw, phi1, phi2, gamw }
    }

    const jointOmega = (prox, dist, axisLocal) => {
        const aw = dist.quaternion.vmult(axisLocal)
        return (dist.angularVelocity.x - prox.angularVelocity.x) * aw.x
            + (dist.angularVelocity.y - prox.angularVelocity.y) * aw.y
            + (dist.angularVelocity.z - prox.angularVelocity.z) * aw.z
    }

    const wake = (b) => { b.sleepState = 0 }

    const actuateRigid = (name, desired, tauComp, prox, dist, axisLocal, ja, w) => {
        const sp = JOINT_SPECS[name]
        const lim = LIMITS[name]
        const e = clamp(desired, lim[0], lim[1]) - ja[name]
        // Velocity servo: command a joint rate from the position error (rate-
        // and direction-limited), then torque to hold that rate. A velocity
        // loop alone leaves a small steady-state offset against any residual
        // torque (solver-compliant hinges, FF model error), so each joint also
        // carries a clamped integral term — a plain Ki — with anti-windup at
        // τ saturation. Ki is capped low: it erases pose lag without
        // springing the chain if a real obstacle pins it.
        const intCap = sp.intCap
        let iTerm = integral[name]
        // Integrate at rest only (|ω| small): sag lives in the settled pose,
        // while transit is exactly when Ki must stay quiet (ki ungated by rate
        // wound up and flailed the pull-open — measured). |e| window covers the
        // sag band (seed-3's 0.1-rad droop sat outside a 0.08 gate and never
        // integrated away); caps bound whatever does accumulate.
        if (intCap > 0 && Math.abs(e) < 0.3 && Math.abs(w) < 0.25) {
            iTerm = clamp(iTerm + sp.ki * e * TICK_DT, -intCap, intCap)
        } else iTerm *= 0.95 // target moved away: bleed the stale hold torque
        const wDes = clamp(e * sp.servoK, -sp.omegaMax, sp.omegaMax)
        let tauPD = sp.kd * (wDes - w)
        if (Math.abs(w) > sp.omegaMax) tauPD = sp.kd * (clamp(w, -sp.omegaMax, sp.omegaMax) - w) // speed governor
        if ((ja[name] <= lim[0] && wDes < 0) || (ja[name] >= lim[1] && wDes > 0)) tauPD = -sp.kd * w // limit brake
        const effort = tauPD + tauComp + iTerm
        saturated[name] = Math.abs(effort) > sp.tauMax
        if (saturated[name] && Math.sign(effort) === Math.sign(iTerm)) iTerm = integral[name] // anti-windup: don't grow into a wall
        integral[name] = iTerm
        const tau = clamp(effort, -sp.tauMax, sp.tauMax)
        torqueNow[name] = tau
        const aw = dist.quaternion.vmult(axisLocal)
        dist.applyTorque(new CANNON.Vec3(aw.x * tau, aw.y * tau, aw.z * tau))
        prox.applyTorque(new CANNON.Vec3(-aw.x * tau, -aw.y * tau, -aw.z * tau))
    }

    // The carried payload's net load on the hand: weight + inertial demand of
    // the rigidly carried body, applied at the weld point (force + moment).
    const handPrevV = new CANNON.Vec3()
    let handFirstV = true
    const applyPayloadLoad = () => {
        if (!arm.weld) return
        const m = arm.weld.body.mass
        const hand = bodies.hand
        const a = new CANNON.Vec3()
        if (handFirstV) { handFirstV = false }
        else {
            a.set((hand.velocity.x - handPrevV.x) / TICK_DT,
                (hand.velocity.y - handPrevV.y) / TICK_DT,
                (hand.velocity.z - handPrevV.z) / TICK_DT)
        }
        handPrevV.copy(hand.velocity)
        const F = new CANNON.Vec3(-m * a.x, -m * (G + a.y), -m * a.z)
        // applyForce's point is body-local; the weld offset IS hand-local.
        hand.applyForce(F, arm.weld.offset)
    }

    // Gravity torque the actuators must counter, from the current pose and
    // the carried payload (real masses come from the SimReady manifest; the
    // gripper's moment arms are the real body COMs — GRIPPER_CG/FINGER_CG).
    const gravityTorques = (j, payloadKg) => {
        const s1 = Math.sin(j.phi1)
        const s12 = Math.sin(j.phi1 + j.phi2)
        const sg = Math.sin(j.phi1 + j.phi2 + j.gamw)
        const uU = (L1 / 2) * s1
        const uF = L1 * s1 + (L2 / 2) * s12
        const uW = L1 * s1 + L2 * s12
        const mFin = 2 * FINGER_MASS
        return {
            yaw: 0,
            phi1: G * (LINK_MASSES.upper * uU + LINK_MASSES.fore * uF
                + GRIPPER_HAND_MASS * (uW + GRIPPER_CG * sg) + mFin * (uW + FINGER_CG * sg)
                + payloadKg * (uW + (LG + 0.045) * sg)),
            phi2: G * (LINK_MASSES.fore * (L2 / 2) * s12
                + GRIPPER_HAND_MASS * (L2 * s12 + GRIPPER_CG * sg) + mFin * (L2 * s12 + FINGER_CG * sg)
                + payloadKg * (L2 * s12 + (LG + 0.045) * sg)),
            gamw: G * (GRIPPER_HAND_MASS * GRIPPER_CG + mFin * FINGER_CG + payloadKg * (LG + 0.045)) * sg,
        }
    }

    // Payload compensation share: the controller compensates the links fully
    // and the taught payload at 90% — a carried crate still sags the wrist a
    // few millimetres (real pendant arms droop under untaught mass), visible
    // on the effort bars but inside the pick tolerances. (Full compensation
    // was tried against the rigid chain's lift-out stall and regressed more
    // seeds than it fixed — the residual belongs to the integral, not the ff.)
    const PAYLOAD_COMP = 0.9

    const actuate = (name, desired, tauG, tauComp) => {
        const sp = JOINT_SPECS[name]
        const lim = LIMITS[name]
        const e = clamp(desired, lim[0], lim[1]) - arm.joints[name]
        const effort = sp.kp * e - sp.kd * spin[name] + tauComp
        saturated[name] = Math.abs(effort) > sp.tauMax
        const tau = clamp(effort, -sp.tauMax, sp.tauMax)
        torqueNow[name] = tau
        // Plant: motor torque minus the joint's true gravity load.
        spin[name] = clamp(spin[name] + ((tau - tauG) / sp.inertia) * TICK_DT, -sp.omegaMax, sp.omegaMax)
        let th = arm.joints[name] + spin[name] * TICK_DT
        if (th <= lim[0] || th >= lim[1]) {
            th = clamp(th, lim[0], lim[1])
            spin[name] = 0
        }
        arm.joints[name] = th
    }

    const solve = () => {
        const t = arm.target
        const dx = t.x - shoulder.x
        const dzw = t.z - shoulder.z
        const dy = t.y - shoulder.y
        const payloadKg = arm.weld ? arm.weld.payloadKg : 0
        const yawd = Math.atan2(dx, Math.max(0.06, dzw))
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
        if (rigid) {
            const ja = readJoints()
            Object.assign(arm.joints, ja)
            // Real gravity acts on the link bodies; the feedforward (90% of the
            // taught payload load) is the only gravity term the controller adds.
            const tc = gravityTorques(ja, payloadKg * PAYLOAD_COMP)
            for (const b of linkBodies()) wake(b)
            if (bodies.basePlate) { wake(bodies.basePlate); wake(bodies.base) }
            actuateRigid('yaw', yawd, tc.yaw, bodies.base, bodies.yoke, YAW_AXIS, ja, jointOmega(bodies.base, bodies.yoke, YAW_AXIS))
            actuateRigid('phi1', phi1d, tc.phi1, bodies.yoke, bodies.upper, SEG_AXIS, ja, jointOmega(bodies.yoke, bodies.upper, SEG_AXIS))
            actuateRigid('phi2', phi2dC, tc.phi2, bodies.upper, bodies.fore, SEG_AXIS, ja, jointOmega(bodies.upper, bodies.fore, SEG_AXIS))
            actuateRigid('gamw', gamd, tc.gamw, bodies.fore, bodies.hand, SEG_AXIS, ja, jointOmega(bodies.fore, bodies.hand, SEG_AXIS))
            applyPayloadLoad()
        } else {
            const j = arm.joints
            const tg = gravityTorques(j, payloadKg)
            const tc = gravityTorques(j, payloadKg * PAYLOAD_COMP)
            actuate('yaw', yawd, tg.yaw, tc.yaw)
            actuate('phi1', phi1d, tg.phi1, tc.phi1)
            actuate('phi2', phi2dC, tg.phi2, tc.phi2)
            actuate('gamw', gamd, tg.gamw, tc.gamw)
        }
    }

    // Radial reach clamp: commanding beyond L1+L2+LG sends the DLS upside
    // down (phi1 parks at 2.0, the pose flails between two branches). The
    // work box alone isn't enough — its corners are outside the sphere.
    // 0.65 (was 0.63): the open cabinet handle sits 0.647 from the shoulder,
    // and the old conservative sphere stopped the final-close latch 17 mm
    // short on the far seeds. The planar solver self-clamps at L1+L2−2 mm,
    // so the sphere only needs to guard the yaw-plane corner cases.
    const R_MAX = 0.65
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

    // Closed gap clears the widest carried asset (65 mm carton): the 2F-85
    // stroke is 85 mm and the grip's holding is the weld/friction law, not
    // solver interpenetration — closing to 45 mm around a 65 mm crate made
    // cannon eject the prop at grab, faking a 20 m/s "crash" every pick.
    arm.setGapTarget = (open) => { arm.gapTarget = open ? 0.075 : 0.066 }

    arm.graspPoint = () => {
        if (rigid) {
            // Grasp point = hand COM minus the 30 mm COM-to-grasp shift along
            // the gripper axis (the hand's local -Y).
            const g = bodies.hand.quaternion.vmult(DOWN, new CANNON.Vec3())
            const p = bodies.hand.position
            return [p.x - 0.03 * g.x, p.y - 0.03 * g.y, p.z - 0.03 * g.z]
        }
        return forwardKinematics(arm.joints, shoulder).grasp
    }

    arm.update = () => {
        solve()
        arm.gap += clamp(arm.gapTarget - arm.gap, -0.18 * TICK_DT, 0.18 * TICK_DT)
        if (rigid) {
            // Fingers ride the hand through their locks; the commanded gap
            // slides the hand-local pivots (prismatic command, solver-followed).
            const half = arm.gap / 2 + 0.012
            fingerLockL.pivotA.set(half, 0.03, 0)
            fingerLockR.pivotA.set(-half, 0.03, 0)
        } else {
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
        }
        if (arm.weld) {
            const b = arm.weld.body
            // bodies.hand.quaternion directly: the stage-3 handQ was function-
            // scoped, but the rigid/kinematic split moved it into the else
            // block — a weld under the rigid chain ReferenceErrored on grab.
            const handQ = bodies.hand.quaternion
            const wo = new CANNON.Vec3()
            handQ.vmult(arm.weld.offset, wo)
            const wp = new CANNON.Vec3(bodies.hand.position.x + wo.x, bodies.hand.position.y + wo.y, bodies.hand.position.z + wo.z)
            arm.weld.cmdP.set(wp.x, wp.y, wp.z)
            const wq = new CANNON.Quaternion()
            handQ.mult(arm.weld.relQ, wq)
            // Carry velocity = the weld point's OWN motion (feedforward), not
            // the error to the actual pose — error-velocity plus a position
            // snap double-applies the step and leaves a steady contact-free
            // shimmer that a force-closure monitor reads as a 30 N grind.
            const wv = arm.weld.prevWp || wp
            b.velocity.set((wp.x - wv.x) / TICK_DT, (wp.y - wv.y) / TICK_DT, (wp.z - wv.z) / TICK_DT)
            arm.weld.prevWpOld = arm.weld.prevWp ? arm.weld.prevWp.clone() : wp.clone()
            arm.weld.prevWp = new CANNON.Vec3(wp.x, wp.y, wp.z)
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
        if (!best) { arm.gripRefused = null; return null }
        best.wakeUp()
        // Force-closure gate (stage 3): n·μ·F_clamp must cover the static
        // weight times the safety factor before the weld is even granted.
        // μ_eff = min(pad rubber, asset surface) — the weaker interface wins.
        const fc = forceClosureFor(best)
        if (fc.budgetN < fc.demandN * fc.safety) {
            arm.gripRefused = { slot: best.kitName || String(best.id), budgetN: fc.budgetN, demandN: fc.demandN }
            return null
        }
        arm.gripRefused = null
        // Kinematic weld: the held body tracks the hand exactly each tick.
        // (A solver LockConstraint here flings the crate — a kinematic anchor
        // with pivots centimeters apart is a singularity; proven on the bench.
        // Contact physics is real before the grab and after the release.)
        const handQ = bodies.hand.quaternion
        const relQ = new CANNON.Quaternion()
        handQ.conjugate(relQ)
        const rel = new CANNON.Vec3(best.position.x - bodies.hand.position.x, best.position.y - bodies.hand.position.y, best.position.z - bodies.hand.position.z)
        arm.weld = {
            body: best,
            offset: relQ.vmult(rel),
            relQ: relQ.clone().mult(best.quaternion),
            payloadKg: best.mass,
            holdBudgetN: fc.budgetN,
            slipS: best.mass * G,
            devS: 0,
            cmdP: new CANNON.Vec3(best.position.x, best.position.y, best.position.z),
            prevP: new CANNON.Vec3(best.position.x, best.position.y, best.position.z),
            prevD: { x: 0, y: 0, z: 0 },
        }
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

    // Run after world.step: two honest failure modes of a friction grasp —
    // (1) whip crash: contact deceleration of the carried prop (measured
    //     from position deltas — written servo velocities would count a held-
    //     still crush as 60 m/s²), EMA'd so landing transients don't shed;
    // (2) grind: the weld command and the prop's actual pose diverging —
    //     something is in the way and the pads are sliding on it.
    arm.postStep = () => {
        arm.strainN = readStrainN()
        if (!arm.weld) { arm.slipDemand = 0; arm.grind = 0; return null }
        const b = arm.weld.body
        const dx = b.position.x - arm.weld.prevP.x
        const dy = b.position.y - arm.weld.prevP.y
        const dz = b.position.z - arm.weld.prevP.z
        const a = Math.hypot(dx - arm.weld.prevD.x, dy - arm.weld.prevD.y, dz - arm.weld.prevD.z) / (TICK_DT * TICK_DT)
        arm.weld.prevD = { x: dx, y: dy, z: dz }
        arm.weld.prevP.set(b.position.x, b.position.y, b.position.z)
        const demand = b.mass * (G + a)
        arm.weld.slipS += (demand - arm.weld.slipS) * SLIP_EMA
        arm.slipDemand = Math.round(arm.weld.slipS * 10) / 10
        // Deviation from the predicted pose (weld point plus its own feed-
        // forward integration): zero in free carry at any speed, nonzero only
        // when the solver actually held the prop back.
        const pw = arm.weld.prevWpOld
        const px = 2 * arm.weld.cmdP.x - pw.x
        const py = 2 * arm.weld.cmdP.y - pw.y
        const pz = 2 * arm.weld.cmdP.z - pw.z
        const dev = Math.hypot(b.position.x - px, b.position.y - py, b.position.z - pz)
        arm.weld.devS += (dev - arm.weld.devS) * GRIND_EMA
        arm.grind = Math.round(arm.weld.devS * 1000) / 1000
        if (arm.weld.slipS > arm.weld.holdBudgetN * SLIP_SLACK || arm.weld.devS > SLIP_GRIND) {
            const slot = arm.held
            arm.drop()
            return slot
        }
        return null
    }

    arm.torquePct = () => {
        const out = {}
        for (const k of Object.keys(JOINT_SPECS)) out[k] = Math.round((torqueNow[k] / JOINT_SPECS[k].tauMax) * 100)
        return out
    }
    arm.satCount = () => Object.values(saturated).filter(Boolean).length
    arm.spin = spin
    arm.integral = integral
    arm.torqueNow = torqueNow
    arm.saturated = saturated
    arm.gripRefused = null
    arm.slipDemand = 0
    arm.rigid = rigid
    arm.constraints = constraints
    // Strain is READ from the yaw hinge's solved impulses at post-step time and
    // cached: the multiplier is only meaningful right after world.step, and
    // snapshot/restore must carry the same number state() last showed (an
    // uncached read made gate 15 diverge after restore).
    arm.strainN = 0
    const readStrainN = () => {
        const c = arm.yawHinge
        if (!c) return 0
        const dt = TICK_DT
        const fx = (c.equationX.multiplier / dt)
        const fy = (c.equationY.multiplier / dt)
        const fz = (c.equationZ.multiplier / dt)
        return Math.round(Math.hypot(fx, fy, fz) * 100) / 100
    }
    arm.baseStrainN = () => arm.strainN
    arm.baseDelta = () => {
        if (!bodies.basePlate || !basePlateInit) return null
        const p = bodies.basePlate.position
        const q = bodies.basePlate.quaternion
        const up = q.vmult(new CANNON.Vec3(0, 1, 0), new CANNON.Vec3())
        return {
            dx: Math.round((p.x - basePlateInit.x) * 10000) / 10000,
            dz: Math.round((p.z - basePlateInit.z) * 10000) / 10000,
            tiltDeg: Math.round((Math.acos(Math.max(-1, Math.min(1, up.y))) * 180 / Math.PI) * 100) / 100,
        }
    }

    // Handle latching is bookkeeping; the SIM couples the prop to the hand
    // kinematically (driveTo / driveAngle). Solver constraints between a
    // kinematic anchor and a constraint-bound prop oscillate the prop.
    arm.latchTo = (body) => {
        arm.held = body.kitName || null
        return arm.held
    }

    // --- place the links at the stage-3 home pose, then join the chain -------
    {
        const j0 = { yaw: 0, phi1: 0.5, phi2: -0.5, gamw: 0 }
        const fk = forwardKinematics(j0, shoulder)
        const f0 = [Math.sin(j0.yaw), 0, Math.cos(j0.yaw)]
        const segQuat = (phi) => {
            const d = new CANNON.Vec3(f0[0] * Math.sin(phi), -Math.cos(phi), f0[2] * Math.sin(phi))
            return new CANNON.Quaternion().setFromVectors(DOWN, d)
        }
        const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
        const place = (b, pos, quat) => {
            b.position.set(pos[0], pos[1], pos[2])
            b.quaternion.copy(quat)
            b.velocity.set(0, 0, 0)
            b.angularVelocity.set(0, 0, 0)
            b.wakeUp()
        }
        const yawQ = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), j0.yaw)
        const shoulderPos = [shoulder.x, shoulder.y + 0.02, shoulder.z]
        const gAxis0 = new CANNON.Vec3(f0[0] * Math.sin(fk.gamma), -Math.cos(fk.gamma), f0[2] * Math.sin(fk.gamma))
        const handQ = new CANNON.Quaternion().setFromVectors(DOWN, gAxis0)
        const gp = new CANNON.Vec3(...fk.grasp)
        const lat0 = new CANNON.Vec3(Math.cos(j0.yaw), 0, -Math.sin(j0.yaw))
        const half0 = arm.gap / 2 + 0.012
        place(bodies.yoke, [shoulder.x, shoulder.y, shoulder.z], yawQ)
        place(bodies.upper, mid(shoulderPos, fk.elbow), segQuat(j0.phi1))
        place(bodies.fore, mid(fk.elbow, fk.wrist), segQuat(j0.phi1 + j0.phi2))
        place(bodies.hand, [gp.x + gAxis0.x * 0.03, gp.y + gAxis0.y * 0.03, gp.z + gAxis0.z * 0.03], handQ)
        place(bodies.fingerL, [gp.x + lat0.x * half0, gp.y, gp.z + lat0.z * half0], handQ)
        place(bodies.fingerR, [gp.x - lat0.x * half0, gp.y, gp.z - lat0.z * half0], handQ)

        if (rigid) {
            if (mobileBase) {
                // The post rides the plate (locked), so joint reactions reach
                // the plate: fast swings and heavy lifts slide or tip it.
                const plate = bodies.basePlate
                basePlateInit = new CANNON.Vec3(plate.position.x, plate.position.y, plate.position.z)
                const postLock = new CANNON.LockConstraint(bodies.base, plate, { maxForce: 1e6 })
                postLock.collideConnected = false
                postLock.pivotA.set(0, -0.20, 0) // post bottom
                postLock.pivotB.set(0, 0.175, 0) // plate top under the post
                world.addConstraint(postLock)
                constraints.push(postLock)
            }
            const mkHinge = (A, B, pivotA, pivotB, axisA, axisB) => {
                // cannon-es takes an OPTIONS object (pivotA/pivotB/axisA/axisB,
                // all LOCAL to each body). Positional args are silently read as
                // options: both pivots fall back to the COMs and both axes to
                // (1,0,0) — a tangle, not a chain (measured: the arm collapsed
                // under its own feedforward within a second).
                const c = new CANNON.HingeConstraint(A, B, { pivotA, pivotB, axisA, axisB })
                c.collideConnected = false
                world.addConstraint(c)
                constraints.push(c)
                return c
            }
            // Inverse-rotate a world vector into the body's local frame:
            // v_local = q⁻¹·v_world. (conjugate() with no arg returns q⁻¹;
            // passing a Vec3 as its target param would corrupt it.)
            const localVec = (b, worldP) => b.quaternion.conjugate().vmult(
                new CANNON.Vec3(worldP[0] - b.position.x, worldP[1] - b.position.y, worldP[2] - b.position.z))
            const localAxis = (b, worldAxis) => b.quaternion.conjugate().vmult(worldAxis)
            // Both axes derive from the SAME world axis, so the hinge's two
            // rotational equations start exactly satisfied (axes parallel).
            const addHinge = (A, B, wp, axis) => mkHinge(A, B, localVec(A, wp), localVec(B, wp), localAxis(A, axis), localAxis(B, axis))
            // Order matters: constraints[0] is the yaw hinge (the strain tap).
            const yawHinge = addHinge(bodies.base, bodies.yoke, [shoulder.x, shoulder.y, shoulder.z], YAW_AXIS)
            arm.yawHinge = yawHinge
            addHinge(bodies.yoke, bodies.upper, shoulderPos, SEG_AXIS)
            addHinge(bodies.upper, bodies.fore, fk.elbow, SEG_AXIS)
            addHinge(bodies.fore, bodies.hand, fk.wrist, SEG_AXIS)
            const mkFingerLock = (finger) => {
                const c = new CANNON.LockConstraint(bodies.hand, finger, { maxForce: 1e6 })
                c.collideConnected = false
                c.pivotB.set(0, 0, 0) // finger COM is the shared point
                world.addConstraint(c)
                constraints.push(c)
                return c
            }
            fingerLockL = mkFingerLock(bodies.fingerL)
            fingerLockR = mkFingerLock(bodies.fingerR)
            fingerLockL.pivotA.set(half0, 0.03, 0)
            fingerLockR.pivotA.set(-half0, 0.03, 0)
        }
    }

    arm.update()
    return arm
}
