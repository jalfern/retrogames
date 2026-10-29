// ROBOT SIM KIT — sim factory (issue #1141 stage 1).
//
// createRobotSim(seed) assembles a deterministic manipulation scene: bench,
// drivable arm + gripper, drawer on real rails, spring-hinged cabinet, one
// crate and one can at seeded spots. Two tasks, both required to win:
//   A  open drawer → put the crate in → close the drawer
//   B  open cabinet door → stow the can → let the door swing shut
// Refusals are physical: closing the drawer on a crate left on the rail track
// blocks (STAND CLEAR), closing the gripper on nothing holds nothing, and the
// door cannot swing through the can.
//
// Inputs (all three methods, one pad per tick, Plaicraft #1141):
//   stick/dpad  x lateral, y depth (stick up = reach out); hold b = lift mode.
//   a           grab / release (latches handles too).
//   pointer tap (from the game, after its raycast): tap prop = grab it there;
//               tap open space while holding = carry and drop it there;
//               tap drawer/door = open it; tap drawer cavity = drop inside.
// Pure Node + browser. No DOM, no React, no three.js.

import { createWorld, installMaterials, mulberry32, poseHash, poseTrack, boxOverlapsBody, TICK_DT, CANNON } from './physics.js'
import { createArm } from './arm.js'
import { createBench, createDrawer, createCabinet, createCrate, createCan, BENCH_TOP } from './props.js'

export { BENCH_TOP }
export { createEpisode, validateEpisode, episodeDownload, exportEpisodes, saveEpisode, loadEpisodes, episodeStats } from './episode.js'
export { forwardKinematics, planarIK, forceClosureFor, JOINT_SPECS, LINK_MASSES, SLIP_EMA, SLIP_SLACK, SLIP_GRIND, GRIND_EMA } from './arm.js'
export { Rail } from './physics.js'
export { ASSETS, SLOTS, assetFor, gateFor, manifestSummary, MANIFEST_REV, SIMREADY_LIBRARY } from './assets.js'

export const BASE = [0, BENCH_TOP, -0.30]
export const WIN_TICKS = 4200

const SUBGOALS = {
    drawerOpen: 50,
    crateIn: 100,
    drawerClosed: 50,
    doorOpen: 50,
    canIn: 100,
    doorClosed: 50,
}

export function createRobotSim(seed = 0) {
    const world = createWorld()
    const mats = installMaterials(world)
    createBench(world, mats)
    const arm = createArm(world, mats, { base: BASE })
    const drawer = createDrawer(world, mats)
    const cabinet = createCabinet(world, mats)
    const rng = mulberry32((seed * 2654435761 >>> 0) ^ 0x9e3779b9)
    // Pockets chosen clear of every prop path: the drawer spans x −0.04..0.36
    // (can pocket right of it with ≥60 mm margin — an earlier band clipped the
    // drawer's front corner and the closing drawer flung the can off the
    // bench), the open door stands at x≈-0.13, and both stay inside the arm's
    // reach sphere (R=0.63).
    const crate = createCrate(world, mats, { x: 0.0 + rng() * 0.08, y: BENCH_TOP + 0.0325 + 0.05, z: 0.235 + rng() * 0.02 })
    const can = createCan(world, mats, { x: 0.42 + rng() * 0.04, y: BENCH_TOP + 0.045 + 0.02, z: -0.05 + rng() * 0.04 })

    const tracked = [crate, can, drawer.body, cabinet.body, arm.bodies.hand]
    const goals = { drawerOpen: false, crateIn: false, drawerClosed: false, doorOpen: false, canIn: false, doorClosed: false }
    const methods = []
    const queue = []
    let tick = 0
    let score = 0
    let done = false
    let prevA = false
    let latchNote = null
    let latchOff = 0.088
    let doorRamp = 0
    let doorTarget = -1.45
    let slips = 0

    const noteMethod = (m) => { if (m && !methods.includes(m)) methods.push(m) }

    const EV = []
    const ev = (e) => { EV.push(`${tick}:${e} a=${cabinet.angle().toFixed(2)} dz=${drawer.amount().toFixed(3)} held=${arm.held}`) }

    const latchHandle = () => {
        const gp = arm.graspPoint()
        const dh = drawer.handlePos()
        if (Math.hypot(gp[0] - dh.x, gp[1] - dh.y, gp[2] - dh.z) < 0.06) {
            arm.latchTo(drawer.body)
            latchNote = 'drawer'
            // Delta coupling: the drawer follows the hand's DISPLACEMENT from
            // the latch point, never an absolute offset — latching from a few
            // cm away must not yank the drawer to the rail stop.
            latchOff = gp[2] - drawer.amount()
            return true
        }
        const ch = cabinet.handlePos()
        if (Math.hypot(gp[0] - ch.x, gp[1] - ch.y, gp[2] - ch.z) < 0.08) {
            arm.latchTo(cabinet.body)
            cabinet.setHeld(true)
            latchNote = 'door'
            doorRamp = cabinet.angle()
            doorTarget = doorRamp < -0.5 ? 0 : -1.45
            return true
        }
        return false
    }

    const pressA = () => {
        if (arm.lock || arm.weld || arm.held) {
            if (latchNote === 'door') cabinet.setHeld(false)
            arm.drop()
            ev(`drop:${latchNote}`)
            latchNote = null
            return null
        }
        if (latchHandle()) { ev(`latch:${latchNote}`); return arm.held }
        const gp = new CANNON.Vec3(...arm.graspPoint())
        let best = null
        let bd = 0.11
        for (const b of [crate, can]) {
            const d = gp.distanceTo(b.position)
            if (d < bd) { bd = d; best = b }
        }
        if (best) arm.tryGrab([best])
        if (!arm.held && arm.gripRefused) ev(`refused:${arm.gripRefused.slot}`)
        return arm.held
    }

    const tap = (id, point) => {
        noteMethod('pointer')
        if (id === 'crate' || id === 'can') {
            const b = id === 'crate' ? crate : can
            queue.push({ kind: 'go', x: b.position.x, y: b.position.y + 0.10, z: b.position.z, tol: 0.02 }, { kind: 'lower', to: b.position.y + 0.05 }, { kind: 'grab' })
            return 'grab'
        }
        if (id === 'drawer') {
            queue.push({ kind: 'go', x: drawer.handle.x, y: drawer.handle.y + 0.09, z: drawer.handle.z - 0.01, tol: 0.02 }, { kind: 'lower', to: drawer.handle.y + 0.03 }, { kind: 'latch' }, { kind: 'go', x: drawer.handle.x, y: drawer.handle.y + 0.03, z: drawer.handle.z + 0.34, tol: 0.03 }, { kind: 'unlatch' })
            return 'open-drawer'
        }
        if (id === 'door') {
            queue.push({ kind: 'go', x: cabinet.handle.x, y: cabinet.handle.y + 0.09, z: cabinet.handle.z + 0.04, tol: 0.02 }, { kind: 'lower', to: cabinet.handle.y + 0.02 }, { kind: 'latch' }, { kind: 'go', x: cabinet.handle.x + 0.06, y: cabinet.handle.y + 0.02, z: cabinet.handle.z + 0.30, tol: 0.03 }, { kind: 'unlatch' })
            return 'open-door'
        }
        if (point && arm.held) {
            queue.push({ kind: 'go', x: point[0], y: Math.max(point[1] + 0.06, BENCH_TOP + 0.10), z: point[2], tol: 0.02 }, { kind: 'lower', to: point[1] + 0.055 }, { kind: 'drop' })
            return 'place'
        }
        if (point) queue.push({ kind: 'go', x: point[0], y: Math.max(point[1] + 0.08, BENCH_TOP + 0.10), z: point[2], tol: 0.02 })
        return 'move'
    }

    const runQueue = () => {
        const step = queue[queue.length - 1]
        if (!step) return
        if (step.kind === 'go') {
            arm.setTarget(step.x, step.y, step.z)
            const gp = arm.graspPoint()
            if (Math.hypot(gp.x - step.x, gp.y - step.y, gp.z - step.z) < step.tol) queue.pop()
        } else if (step.kind === 'lower') {
            arm.setTarget(arm.target.x, step.to, arm.target.z)
            if (arm.target.y <= step.to + 0.001) queue.pop()
        } else if (step.kind === 'grab') {
            if (arm.gap > 0.069) arm.setGapTarget(false)
            else { pressA(); queue.pop() }
        } else if (step.kind === 'drop') {
            arm.setGapTarget(true)
            if (arm.lock) pressA()
            queue.pop()
        } else if (step.kind === 'latch') {
            if (!latchHandle()) queue.pop()
            else queue.pop()
        } else if (step.kind === 'unlatch') {
            if (latchNote === 'door') cabinet.setHeld(false)
            arm.drop()
            latchNote = null
            queue.pop()
        }
    }

    const blockClose = (atZ) => (at) => {
        const span = (drawer.body.position.z - at.z) / 2
        if (span <= 0) return false
        const center = new CANNON.Vec3(drawer.body.position.x, BENCH_TOP + 0.05, at.z + span)
        const half = new CANNON.Vec3(drawer.half[0], 0.06, span + 0.005)
        for (const b of [crate, can]) {
            if (drawer.cavityContains(b.position)) continue
            const bh = b === crate ? new CANNON.Vec3(0.035, 0.035, 0.035) : new CANNON.Vec3(0.032, 0.05, 0.032)
            if (boxOverlapsBody(center, half, b, bh)) return true
        }
        void atZ
        return false
    }

    const updateGoals = () => {
        const g = (k, v, pts) => { if (!goals[k] && v) { goals[k] = true; score += pts; ev(`goal:${k}`) } }
        g('drawerOpen', drawer.open(), 50)
        g('crateIn', goals.drawerOpen && (drawer.cavityContains(crate.position) || (drawer.open() && Math.abs(crate.position.x - drawer.body.position.x) < drawer.half[0] - 0.02 && Math.abs(crate.position.z - drawer.body.position.z) < drawer.half[2] - 0.02 && crate.position.y < BENCH_TOP + 0.10)), 100)
        g('drawerClosed', goals.drawerOpen && goals.crateIn && drawer.closed(), 50)
        g('doorOpen', cabinet.open(), 50)
        g('canIn', goals.doorOpen && cabinet.interiorContains(can.position), 100)
        g('doorClosed', goals.doorOpen && goals.canIn && cabinet.closed(), 50)
        if (!done && Object.values(goals).every(Boolean)) done = true
    }

    const state = () => ({
        tick,
        score,
        done,
        seed,
        players: 1,
        hash: poseHash(tracked),
        held: arm.held,
        queue: queue.length,
        goals: { ...goals },
        methods: [...methods],
        drawerZ: drawer.amount(),
        doorA: Math.round(cabinet.angle() * 1000) / 1000,
        hand: arm.graspPoint().map((v) => Math.round(v * 1000) / 1000),
        gap: Math.round(arm.gap * 1000) / 1000,
        torque: arm.torquePct(),
        sat: arm.satCount(),
        slips,
        gripN: arm.weld ? Math.round(arm.weld.slipS * 10) / 10 : 0,
        budgetN: arm.weld ? Math.round(arm.weld.holdBudgetN * 10) / 10 : null,
        cratePos: crate.position.clone(),
        canPos: can.position.clone(),
        timeout: tick >= WIN_TICKS,
        poses: poseTrack(tracked),
    })

    const sim = {
        seed,
        world,
        mats,
        arm,
        drawer,
        cabinet,
        crate,
        can,
        get tick() { return tick },
        get done() { return done },
        tap,
        cancelQueue: () => { queue.length = 0 },
        events: EV,
        state,
        hash: () => poseHash(tracked),
        track: () => poseTrack(tracked),
        step(input = {}) {
            tick++
            const pad = input.pad || {}
            const mx = Math.abs(pad.x || 0)
            const my = Math.abs(pad.y || 0)
            if (mx > 0.2 || my > 0.2) noteMethod('stick')
            else if (pad.left || pad.right || pad.up || pad.down) noteMethod('dpad')
            if (input.tapId || input.tapPoint) tap(input.tapId || null, input.tapPoint || null)
            const a = !!pad.a
            const driving = mx > 0.02 || my > 0.02 || pad.left || pad.right || pad.up || pad.down
            if (driving && queue.length) queue.length = 0
            if (queue.length) {
                runQueue()
            } else {
                arm.drive(pad)
            }
            if (a && !prevA) pressA()
            prevA = a
            arm.update()
            if (latchNote === 'drawer') {
                const cur = drawer.amount()
                let t = arm.graspPoint()[2] - latchOff
                // Never drag harder than the hand can follow: cap the delta,
                // and refuse a blocked close (stand-clear stays honest).
                t = Math.min(cur + 0.006, t)
                if (t < cur && blockClose(cur)(drawer.rail.at(Math.max(t, drawer.rail.min)))) t = cur
                drawer.driveTo(t)
            } else if (latchNote === 'door') {
                doorRamp += (doorTarget - doorRamp) * 0.05
                cabinet.driveAngle(doorRamp)
            }
            world.step(TICK_DT)
            drawer.rail.apply([blockClose(drawer.amount())])
            cabinet.spring()
            const slipped = arm.postStep()
            if (slipped) { slips++; ev(`slip:${slipped}`) }
            updateGoals()
            return state()
        },
        snapshot() {
            return {
                tick, score, done, prevA, latchNote, latchOff, doorRamp, doorTarget, slips,
                methods: [...methods],
                goals: { ...goals },
                joints: { ...arm.joints },
                spin: { ...arm.spin },
                target: { ...arm.target },
                gap: arm.gap,
                gapTarget: arm.gapTarget,
                held: arm.held,
                tn: { ...arm.torqueNow },
                sat: { ...arm.saturated },
                weld: arm.weld
                    ? {
                        id: arm.weld.body.id,
                        offset: [arm.weld.offset.x, arm.weld.offset.y, arm.weld.offset.z],
                        relQ: [arm.weld.relQ.x, arm.weld.relQ.y, arm.weld.relQ.z, arm.weld.relQ.w],
                        payloadKg: arm.weld.payloadKg,
                        holdBudgetN: arm.weld.holdBudgetN,
                        slipS: arm.weld.slipS,
                        devS: arm.weld.devS,
                    }
                    : null,
                queue: queue.map((q) => ({ ...q })),
                bodies: tracked.map((b) => ({
                    id: b.id,
                    p: [b.position.x, b.position.y, b.position.z],
                    q: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w],
                    v: [b.velocity.x, b.velocity.y, b.velocity.z],
                    av: [b.angularVelocity.x, b.angularVelocity.y, b.angularVelocity.z],
                    sleep: b.sleepState,
                })),
            }
        },
        restore(s) {
            tick = s.tick; score = s.score; done = s.done; prevA = s.prevA; latchNote = s.latchNote
            latchOff = s.latchOff; doorRamp = s.doorRamp; doorTarget = s.doorTarget; slips = s.slips || 0
            methods.length = 0; methods.push(...s.methods)
            Object.assign(goals, s.goals)
            Object.assign(arm.joints, s.joints)
            Object.assign(arm.spin, s.spin || { yaw: 0, phi1: 0, phi2: 0, gamw: 0 })
            Object.assign(arm.target, s.target)
            arm.gap = s.gap; arm.gapTarget = s.gapTarget; arm.held = s.held
            if (s.tn) { Object.assign(arm.torqueNow, s.tn); Object.assign(arm.saturated, s.sat || {}) }
            arm.weld = null
            queue.length = 0; queue.push(...s.queue.map((q) => ({ ...q })))
            for (const bs of s.bodies) {
                const b = world.getBodyById(bs.id)
                if (!b) continue
                b.position.set(...bs.p)
                b.quaternion.set(...bs.q)
                b.velocity.set(...bs.v)
                b.angularVelocity.set(...bs.av)
                b.updateMassProperties()
                b.updateBoundingRadius()
                b.aabbNeedsUpdate = true
                if (bs.sleep === 2) { b.sleepState = 2; b.sleepTicker = 0 } else b.wakeUp()
            }
            if (s.weld) {
                const b = world.getBodyById(s.weld.id)
                if (b) {
                    const q = new CANNON.Quaternion(...s.weld.relQ)
                    arm.weld = {
                        body: b,
                        offset: new CANNON.Vec3(...s.weld.offset),
                        relQ: q,
                        payloadKg: s.weld.payloadKg,
                        holdBudgetN: s.weld.holdBudgetN,
                        slipS: s.weld.slipS,
                        devS: s.weld.devS || 0,
                        cmdP: new CANNON.Vec3(b.position.x, b.position.y, b.position.z),
                        prevP: new CANNON.Vec3(b.position.x, b.position.y, b.position.z),
                        prevWp: new CANNON.Vec3(b.position.x, b.position.y, b.position.z),
                        prevWpOld: new CANNON.Vec3(b.position.x, b.position.y, b.position.z),

                        prevD: { x: 0, y: 0, z: 0 },
                    }
                }
            }
            return state()
        },
    }
    return sim
}

// --- autopilot ---------------------------------------------------------------
// Drives ONLY pads (never sim internals) — the attract demo and the harness
// win-proof share it. Waypoint phases loop-until-arrived with timeouts, so a
// shifted-seed scene still completes.

const clampv = (v) => Math.max(-1, Math.min(1, v))

export function createAutopilot(sim) {
    const st = () => sim.state()

    const D = (name, x, z, cond, timeout, opts = {}) => ({ name, kind: 'drive', x, z, cond, timeout, t: 0, ...opts })
    const L = (name, y, cond, timeout) => ({ name, kind: 'lift', y, cond, timeout, t: 0 })
    const S = (name, dir, cond, timeout, retry) => ({ name, kind: 'stick', dir, cond, timeout, t: 0, retry })
    const P = (name, cond, timeout, retry) => ({ name, kind: 'press', cond, timeout, t: 0, retry })
    const W = (name, ticks, cond = () => false, retry) => ({ name, kind: 'wait', ticks, t: 0, cond, retry })

    // Transit lift 1.34 clears every prop AND the carried payload: a held can
    // hangs ~120 mm below the grasp point, so its bottom sweeps ~1.22 — the
    // old 1.30 transit clipped the open door top (1.16) and ground the weld
    // out (the canIn slip on seeds 5/9/12). Door top 1.16, drawer wall 0.99.; local lowers happen only at the work point, straight
    // down, never across a prop path (the old route clipped the open door and
    // reached handles by a static offset measured while closed — the
    // re-latch/door starvation bug).
    const TRANSIT = 1.34
    const dh = () => sim.drawer.handlePos()
    const ch = () => sim.cabinet.handlePos()

    const phases = [
        W('settle', 88),
        L('lift0', 1.07, () => st().hand[1] > 1.06, 88),
        D('toHandle', () => dh().x, () => dh().z - 0.02, () => Math.hypot(st().hand[0] - dh().x, st().hand[2] - (dh().z - 0.02)) < 0.03, 484),
        L('lowerHandle', () => dh().y + 0.045, () => st().hand[1] < dh().y + 0.055, 88),
        P('latchDrawer', () => st().held === 'drawer', 26),
        S('pull', -1, () => st().goals.drawerOpen, 528),
        P('releaseHandle', () => st().held === null, 26),
        L('lift1', TRANSIT, () => st().hand[1] > 1.25, 88),
        D('toCrate', () => sim.crate.position.x, () => sim.crate.position.z, () => Math.abs(st().hand[0] - sim.crate.position.x) < 0.025 && Math.abs(st().hand[2] - sim.crate.position.z) < 0.025, 528),
        L('lowerCrate', () => sim.crate.position.y + 0.085, () => st().hand[1] < sim.crate.position.y + 0.10, 88),
        P('grabCrate', () => st().held === 'crate', 26),
        L('lift2', TRANSIT, () => st().hand[1] > 1.25, 88),
        D('toDrawer', () => sim.drawer.body.position.x, () => sim.drawer.body.position.z, () => Math.abs(st().hand[0] - sim.drawer.body.position.x) < 0.05 && Math.abs(st().hand[2] - sim.drawer.body.position.z) < 0.05, 528),
        L('lowerIn', 1.005, () => st().hand[1] < 1.015, 88),
        P('dropCrate', () => st().held === null, 26),
        L('lift3', TRANSIT, () => st().hand[1] > 1.25 || st().goals.crateIn, 88),
        D('overCavity', () => sim.drawer.body.position.x, () => sim.drawer.body.position.z - 0.02, () => st().goals.crateIn || (Math.abs(st().hand[0] - sim.drawer.body.position.x) < 0.05 && Math.abs(st().hand[2] - (sim.drawer.body.position.z - 0.02)) < 0.05), 400),
        L('settleDrop', 1.02, () => st().goals.crateIn || st().hand[1] < 1.03, 60),
        D('toHandle2', () => dh().x, () => dh().z + 0.02, () => Math.abs(st().hand[0] - dh().x) < 0.03 && Math.abs(st().hand[2] - (dh().z + 0.02)) < 0.03, 352),
        L('lowerHandle2', () => dh().y + 0.045, () => st().hand[1] < dh().y + 0.055, 88),
        P('reLatch', () => st().held === 'drawer', 26),
        S('pushIn', 1, () => st().goals.drawerClosed, 704),
        P('releaseHandle2', () => st().held === null, 26),
        L('lift4', TRANSIT, () => st().hand[1] > 1.25, 88),
        D('toDoor', () => ch().x, () => ch().z + 0.04, () => Math.hypot(st().hand[0] - ch().x, st().hand[2] - (ch().z + 0.04)) < 0.04, 528),
        L('lowerDoor', () => ch().y + 0.03, () => st().hand[1] < ch().y + 0.045, 88),
        P('latchDoor', () => st().held === 'door', 26, 'toDoor'),
        S('pullDoor', -1, () => st().goals.doorOpen, 572, 'toDoor'),
        P('releaseDoor', () => st().held === null, 26),
        L('lift5', TRANSIT, () => st().hand[1] > 1.25, 88),
        L('retreatCan', TRANSIT + 0.04, () => st().hand[1] > 1.29, 66),
        D('toCan', () => sim.can.position.x, () => sim.can.position.z, () => Math.abs(st().hand[0] - sim.can.position.x) < 0.025 && Math.abs(st().hand[2] - sim.can.position.z) < 0.025, 528),
        // +0.10 clearance: palm bottom sits 65 mm above the can rim, so any
        // servo error at touch-down still misses the rim. At +0.085 a 20 mm
        // x-error clipped the rim, toppled the can — and a lying can is
        // ungraspable from above (palm bottoms out on the bench first).
        L('lowerCan', () => sim.can.position.y + 0.09, () => st().hand[1] < sim.can.position.y + 0.105, 150),
        P('grabCan', () => st().held === 'can', 48, 'retreatCan'),
        L('lift6', TRANSIT, () => st().hand[1] > 1.25, 88),
        // Weld offset (measured ~+0.04x +0.08z from grasp to can) is near-
        // constant after grab, so the cabinet route aims the HAND offset back
        // to land the CAN at the cavity target. (A live gp-can compensation
        // here became a servo feedback loop and destabilized the whole run.)
        D('toCabinet', () => -0.30, () => -0.245, () => Math.abs(sim.can.position.x + 0.26) < 0.06 && Math.abs(sim.can.position.z + 0.165) < 0.06, 528),
        L('lowerCanIn', 1.045, () => st().hand[1] < 1.055, 88),
        P('dropCan', () => st().held === null, 26),
        L('lift7', TRANSIT + 0.02, () => st().hand[1] > 1.27, 88),
        L('retreat', TRANSIT + 0.04, () => st().hand[1] > 1.29, 66),
        D('toHandleDoor', () => ch().x, () => ch().z + 0.04, () => Math.hypot(st().hand[0] - ch().x, st().hand[2] - (ch().z + 0.04)) < 0.045, 484),
        L('lowerHandleDoor', () => ch().y + 0.03, () => st().hand[1] < ch().y + 0.045, 88),
        P('latchDoorClose', () => st().held === 'door', 26, 'retreat'),
        W('doorShut', 90, () => st().goals.doorClosed, 'retreat'),
        P('releaseDoorClose', () => st().held === null, 26),
        W('tidy', 66),
    ]

    const phaseIdx = {}
    phases.forEach((p, i) => { phaseIdx[p.name] = i })
    const MAX_RETRY = 3

    let idx = 0
    let pressT = 0
    let lastA = false

    const driver = function autopilot() {
        const pad = { x: 0, y: 0, b: false, a: false }
        if (pressT > 0) { pressT--; pad.a = true; return pad }
        if (st().done || st().timeout) return pad
        while (idx < phases.length) {
            const ph = phases[idx]
            ph.t++
            const condOk = !!(ph.cond && ph.cond())
            const timed = ph.t > ph.timeout
            // Bounded retry: a timed-out latch/grab re-runs its approach
            // (a missed grab used to cascade — the linear script then closed
            // the door on an empty cabinet and burned the clock).
            const exhausted = ph.retry && (ph.retries || 0) >= MAX_RETRY
            if ((timed || (ph.kind === 'wait' && ph.t >= ph.ticks && ph.retry)) && !condOk && ph.retry && !exhausted) {
                ph.retries = (ph.retries || 0) + 1
                const target = phases[phaseIdx[ph.retry]]
                target.t = 0
                target.dw = 0
                idx = phaseIdx[ph.retry]
                continue
            }
            const arrived = condOk || timed
            if (ph.kind === 'wait') {
                if (arrived || ph.t >= ph.ticks) { idx++; continue }
                return pad
            }
            if (arrived) {
                // Dwell: keep nudging toward the target for a few ticks after
                // arrival so the servo actually lands ON it before the next
                // phase (plane-tolerance + press-offset stacked up and starved
                // the 3D latch gates — the door latch never fired).
                if (ph.kind === 'drive' || ph.kind === 'lift') {
                    if ((ph.dw || 0) < 8) { ph.dw = (ph.dw || 0) + 1 }
                    else { idx++; continue }
                } else { idx++; continue }
            }
            if (ph.kind === 'lift') {
                const ty = typeof ph.y === 'function' ? ph.y() : ph.y
                pad.b = true
                pad.y = clampv((st().hand[1] - ty) * 8)
                return pad
            }
            if (ph.kind === 'drive') {
                const tx = typeof ph.x === 'function' ? ph.x() : ph.x
                const tz = typeof ph.z === 'function' ? ph.z() : ph.z
                pad.x = clampv((tx - st().hand[0]) * 5)
                pad.y = clampv(-(tz - st().hand[2]) * 5)
                return pad
            }
            if (ph.kind === 'stick') {
                pad.y = ph.dir
                return pad
            }
            if (ph.kind === 'press') {
                if (pressT === 0 && lastA) { lastA = false; return pad } // release tick → rising edge re-arms
                pressT = 6
                if (condOk || (timed && (!ph.retry || exhausted))) idx++
                pad.a = true
                lastA = true
                return pad
            }
            idx++
        }
        return pad
    }
    driver.phaseInfo = () => (idx < phases.length ? `${phases[idx].name}:${phases[idx].t}` : 'done')
    return driver
}

export const KIT_VERSION = 'stage3'
