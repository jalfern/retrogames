// ROBOT SIM KIT — props (issue #1141 stages 1–2): bench, drawer (real rails),
// cabinet + spring-hinged door, crate, can. Masses and surface frictions come
// from the SimReady manifest (src/utils/robot/assets.js): SimReady's promise
// is that the physics travels with the asset, and GLB carries no physics, so
// the USD-side record is transcribed here instead of dropped.
//
// The drawer is a COMPOUND body (bottom + four walls, open top), so a crate
// rides inside the cavity for real, and closing onto a crate left on the rail
// track is refused by the Rail stand-clear test.

import { CANNON, Rail } from './physics.js'
import { assetFor } from './assets.js'

export const BENCH_TOP = 0.90

export function createBench(world, mats) {
    const bench = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(0.9, BENCH_TOP / 2, 0.55)),
        position: new CANNON.Vec3(0, BENCH_TOP / 2, -0.15),
        material: mats.wood,
    })
    bench.kitName = 'bench'
    bench.simready = assetFor('bench').id
    world.addBody(bench)
    const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: mats.wood })
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
    floor.kitName = 'floor'
    world.addBody(floor)
    return { bench, floor }
}

const T = 0.012

export function createDrawer(world, mats, { x = 0.16, z = -0.08 } = {}) {
    const half = [0.20, 0.045, 0.16]
    const shapeBottom = new CANNON.Box(new CANNON.Vec3(half[0] - T, T / 2, half[2] - T))
    const drawer = new CANNON.Body({ mass: assetFor('drawer').physics.massKg, material: mats.steel })
    drawer.addShape(shapeBottom, new CANNON.Vec3(0, -half[1] + T / 2, 0))
    drawer.addShape(new CANNON.Box(new CANNON.Vec3(T / 2, half[1], half[2])), new CANNON.Vec3(-half[0] + T / 2, 0, 0))
    drawer.addShape(new CANNON.Box(new CANNON.Vec3(T / 2, half[1], half[2])), new CANNON.Vec3(half[0] - T / 2, 0, 0))
    drawer.addShape(new CANNON.Box(new CANNON.Vec3(half[0], half[1], T / 2)), new CANNON.Vec3(0, 0, -half[2] + T / 2))
    drawer.addShape(new CANNON.Box(new CANNON.Vec3(half[0], half[1], T / 2)), new CANNON.Vec3(0, 0, half[2] - T / 2))
    drawer.position.set(x, BENCH_TOP + half[1], z)
    drawer.kitName = 'drawer'
    drawer.simready = assetFor('drawer').id
    world.addBody(drawer)
    const rail = new Rail(drawer, { anchor: [x, BENCH_TOP + half[1], z], axis: [0, 0, 1], min: -0.015, max: 0.10 })
    rail.halfExtents = half
    rail.closedZ = z
    rail.closedX = x
    return {
        body: drawer,
        rail,
        half,
        handle: { x, y: BENCH_TOP + half[1] * 2 + 0.012, z: z + half[2] + 0.008 },
        // Live handle: the handle rides the drawer. The static `handle` is
        // only correct while closed — latching against it while open is the
        // re-latch starvation bug (measured 0.100 m off at full travel).
        handlePos() {
            const dz = rail.param(drawer.position)
            return { x, y: BENCH_TOP + half[1] * 2 + 0.012, z: z + half[2] + 0.008 + dz }
        },
        open: () => rail.param(drawer.position) > 0.05,
        closed: () => rail.param(drawer.position) < 0.005,
        amount: () => rail.param(drawer.position),
        // Kinematic rail drive (position, not force): pulling a dynamic body
        // through a solver constraint from a kinematic anchor oscillates the
        // rail (proved on the bench). The drawer still has real mass/friction
        // for unassisted pushes and blocks on cargo (stand-clear).
        driveTo(t) {
            const tt = Math.min(rail.max, Math.max(rail.min, t))
            drawer.position.set(x, BENCH_TOP + half[1], z + tt)
            drawer.velocity.set(0, 0, 0)
            drawer.quaternion.copy(rail.locked)
            drawer.angularVelocity.set(0, 0, 0)
            return rail.param(drawer.position)
        },
        cavityContains(pos) {
            const p = drawer.position
            return Math.abs(pos.x - p.x) < half[0] - T - 0.005
                && Math.abs(pos.y - p.y) < 0.07
                && Math.abs(pos.z - p.z) < half[2] - T - 0.005
        },
    }
}

export function createCabinet(world, mats, { x = -0.26, z = -0.24 } = {}) {
    let armHoldingDoor = false
    let openDetent = false
    const H = 0.26
    const y0 = BENCH_TOP
    const w = 0.14
    const d = 0.15
    const anchor = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(x, y0 + H / 2, z - d), material: mats.steel })
    anchor.addShape(new CANNON.Box(new CANNON.Vec3(w, H / 2, T / 2)))
    anchor.addShape(new CANNON.Box(new CANNON.Vec3(T / 2, H / 2, d)), new CANNON.Vec3(-w + T / 2, 0, d))
    anchor.addShape(new CANNON.Box(new CANNON.Vec3(T / 2, H / 2, d)), new CANNON.Vec3(w - T / 2, 0, d))
    anchor.addShape(new CANNON.Box(new CANNON.Vec3(w, T / 2, d)), new CANNON.Vec3(0, H / 2 - T / 2, d))
    anchor.kitName = 'cabinet'
    world.addBody(anchor)
    // Overlay door (classic appliance mount): the panel rides 10 mm IN FRONT
    // of the side walls, so its swing path never touches the carcass. An
    // inset door overlapped the walls ~2 mm even closed, and every driven
    // sweep banked solver energy until the door spun off at release (±3 rad).
    const restH = w - 2 * T - 0.004
    const doorZ = z + d + 0.016
    const hinge = { x: x + w - T, y: y0 + H / 2, z: doorZ }
    const door = new CANNON.Body({ mass: assetFor('door').physics.massKg, material: mats.steel })
    door.addShape(new CANNON.Box(new CANNON.Vec3(restH, H / 2 - T, T / 2)))
    door.position.set(hinge.x - restH, hinge.y, hinge.z)
    door.kitName = 'door'
    door.simready = assetFor('door').id
    world.addBody(door)
    const axis = new CANNON.Vec3(0, 1, 0)
    const pivotDoor = new CANNON.Vec3()
    const pivotAnchor = new CANNON.Vec3()
    door.pointToLocalFrame(new CANNON.Vec3(hinge.x, hinge.y, hinge.z), pivotDoor)
    anchor.pointToLocalFrame(new CANNON.Vec3(hinge.x, hinge.y, hinge.z), pivotAnchor)
    const hingeC = new CANNON.HingeConstraint(anchor, door, { pivotA: pivotAnchor, pivotB: pivotDoor, axisA: axis, axisB: axis })
    world.addConstraint(hingeC)
    let hingeOn = true
    const rest = { x: door.position.x - hinge.x, z: door.position.z - hinge.z }
    const self = {
        body: door,
        hinge,
        anchor,
        restVec: rest,
        angle() {
            const vx = door.position.x - hinge.x
            const vz = door.position.z - hinge.z
            const dot = vx * rest.x + vz * rest.z
            const cr = rest.x * vz - rest.z * vx
            return Math.atan2(cr, dot)
        },
        // Weak spring assists the last few centimetres of the swing shut; an
        // open door stays open (detent) until the hand pushes it back.
        spring() {
            const a = self.angle()
            if (armHoldingDoor) return
            // A pinned/stalled door falls asleep in the solver and then ignores
            // every spring write (dead at -0.25 forever). Wake before forcing.
            door.sleepState = 0
            // Hard hinge stop: a free door can never pass ~90°. The kinematic
            // hand used to whip it to -2.0 rad and strand it past reach (the
            // latchDoorClose miss); clamp position to the arc + kill velocity.
            if (a < -1.55 || a > 0.15) { self.driveAngle(Math.max(-1.55, Math.min(0.15, a))); return }
            // Hinge bushing cap: a kinematic hand glancing off an open door
            // used to inject flail-energy (angle ran to -2.17 past any stop).
            if (door.angularVelocity.y > 3) door.angularVelocity.y = 3
            if (door.angularVelocity.y < -3) door.angularVelocity.y = -3
            if (a <= -1.1) openDetent = true
            if (openDetent) {
                // Open detent: an opened door HOLDS open (friction hinge, like
                // a real appliance) across the WHOLE range. Velocity-level
                // control (not += accel): the hinge constraint eats
                // acceleration-level pushes and the door crawled open at
                // 0.005 rad/tick when dragged half-shut (seed 9 stall).
                // Only a latched driveAngle release may close it.
                const err = -1.42 - a
                door.angularVelocity.y = Math.max(-2, Math.min(2, err * 0.8))
                return
            }
            if (Math.abs(a) >= 0.6) {
                door.angularVelocity.y *= 0.985
                return
            }
            if (Math.abs(a) > 0.06) {
                const sign = a > 0 ? -1 : 1
                door.angularVelocity.y += sign * 0.9 * TICK
                door.torque.y += sign * 0.012
            }
        },
        open: () => Math.abs(self.angle()) > 1.2,
        closed: () => Math.abs(self.angle()) < 0.12,
        // Kinematic hinge drive while latched (see drawer rationale).
        // Convention: angle() is NEGATIVE when swung out (toward the player);
        // driveAngle takes the same convention as angle().
        driveAngle(a) {
            const aa = Math.min(0.15, Math.max(-1.55, a))
            if (aa > -0.7) openDetent = false
            const th = -aa
            const ca = Math.cos(th)
            const sa = Math.sin(th)
            door.position.set(
                hinge.x + rest.x * ca + rest.z * sa,
                y0 + H / 2,
                hinge.z - rest.x * sa + rest.z * ca,
            )
            door.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), th)
            door.velocity.set(0, 0, 0)
            door.angularVelocity.set(0, 0, 0)
            door.sleepState = 0
            return self.angle()
        },
        interiorContains(pos) {
            return Math.abs(pos.x - x) < w - T - 0.005 && pos.y > y0 + 0.02 && pos.y < y0 + H && Math.abs(pos.z - z) < d
        },
        handle: { x: x - 0.04, y: y0 + H / 2, z: doorZ + 0.02 },
        // Live handle rides the swinging door (same starvation fix as drawer).
        handlePos() {
            const local = new CANNON.Vec3(x - 0.04 - hinge.x, y0 + H / 2 - hinge.y, doorZ + 0.02 - hinge.z)
            const rot = new CANNON.Vec3()
            door.quaternion.vmult(local, rot)
            return { x: hinge.x + rot.x, y: hinge.y + rot.y, z: hinge.z + rot.z }
        },
    }
    self.setHeld = (v) => {
        armHoldingDoor = v
        // While the hand drives the door kinematically the solver hinge must
        // be OFF: constraint + direct pose writes fight each other and spin
        // the door past both stops (measured ±3 rad). driveAngle keeps the
        // door exactly on the arc, so the hinge re-adds cleanly on release.
        if (v && hingeOn) { world.removeConstraint(hingeC); hingeOn = false }
        if (!v && !hingeOn) { world.addConstraint(hingeC); hingeOn = true }
    }
    return self
}

const TICK = 1 / 60

export function createCrate(world, mats, { x, y, z }, mass = assetFor('crate').physics.massKg) {
    const crate = new CANNON.Body({
        mass,
        shape: new CANNON.Box(new CANNON.Vec3(0.0325, 0.0325, 0.0325)),
        position: new CANNON.Vec3(x, y, z),
        material: mats.carton,
    })
    crate.kitName = 'crate'
    crate.simready = assetFor('crate').id
    world.addBody(crate)
    return crate
}

export function createCan(world, mats, { x, y, z }) {
    const can = new CANNON.Body({
        mass: assetFor('can').physics.massKg,
        shape: new CANNON.Cylinder(0.028, 0.028, 0.09, 14),
        position: new CANNON.Vec3(x, y, z),
        material: mats.tin,
    })
    can.kitName = 'can'
    can.simready = assetFor('can').id
    world.addBody(can)
    return can
}
