// ROBOT SIM KIT — physics core (issue #1141 stage 1).
//
// Engine: cannon-es (MIT, pure JS). Chosen because Plaicraft episodes must
// replay HASH-EXACT: cannon-es steps fixed dt single-threaded with no RNG,
// so reset(seed) + identical pads produce identical poses in Node and in
// Chrome (robokitcheck proves both). Rapier was rejected: wasm MIME + float
// determinism across SIMD builds is a replay hazard.
//
// Pure: no DOM, no React, no three.js. The renderer reads body poses.

import * as CANNON from 'cannon-es'
import { assetFor } from './assets.js'

export { CANNON }

export const TICK_DT = 1 / 60

export function mulberry32(seed) {
    let a = seed >>> 0
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export function createWorld() {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) })
    world.broadphase = new CANNON.SAPBroadphase(world)
    world.solver.iterations = 12
    world.allowSleep = true
    return world
}

// Real materials with per-pair contact data. Stage 2 (#1140 hookup): the
// surfaces named in the SimReady manifest carry the manifest's transcribed
// friction — cardboard, tin and the bench wood come from the asset records
// (`assets.js`); steel-on-steel and steel-on-cargo keep the kit's measured
// stage-1 pair values until each asset's USD surface data is transcribed
// (robokitcheck proves the transcribed ones are the live ones).
export function installMaterials(world) {
    const steel = new CANNON.Material('steel')
    const plastic = new CANNON.Material('plastic')
    const wood = new CANNON.Material('wood')
    const carton = new CANNON.Material('cardboard')
    const tin = new CANNON.Material('tin')
    const fCarton = assetFor('crate').physics
    const fTin = assetFor('can').physics
    const fBench = assetFor('bench').physics
    wood.friction = fBench.friction
    carton.friction = fCarton.friction
    tin.friction = fTin.friction
    world.addContactMaterial(new CANNON.ContactMaterial(steel, wood, { friction: fBench.friction, restitution: 0.05 }))
    world.addContactMaterial(new CANNON.ContactMaterial(carton, wood, { friction: fCarton.friction, restitution: fCarton.restitution }))
    world.addContactMaterial(new CANNON.ContactMaterial(tin, wood, { friction: fTin.friction, restitution: fTin.restitution }))
    world.addContactMaterial(new CANNON.ContactMaterial(steel, steel, { friction: 0.18, restitution: 0.02 }))
    world.addContactMaterial(new CANNON.ContactMaterial(carton, steel, { friction: 0.28, restitution: 0.06 }))
    world.addContactMaterial(new CANNON.ContactMaterial(tin, steel, { friction: 0.28, restitution: 0.06 }))
    world.addContactMaterial(new CANNON.ContactMaterial(carton, carton, { friction: fCarton.friction, restitution: fCarton.restitution }))
    world.addContactMaterial(new CANNON.ContactMaterial(tin, tin, { friction: fTin.friction, restitution: fTin.restitution }))
    return { steel, plastic, wood, carton, tin }
}

const q3 = (v) => Math.round(v * 1000) / 1000

// FNV-1a over quantized poses — the sim's `hash` fed to the recorder.
export function hashString(str) {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
    }
    return h >>> 0
}

// Deterministic pose hash over a list of bodies (order matters — pass a
// stable list). Includes velocity rounded hard so settle noise still lands.
export function poseHash(bodies) {
    let s = ''
    for (const b of bodies) {
        const p = b.position
        const q = b.quaternion
        // kitName, not body.id: cannon ids are a global counter, so two sims
        // in one process would hash different poses for identical physics.
        s += `${b.kitName ?? b.id}:${q3(p.x)},${q3(p.y)},${q3(p.z)}|${q3(q.x)},${q3(q.y)},${q3(q.z)},${q3(q.w)};`
    }
    return hashString(s)
}

// Quantized pose track for episodes: { name: { p:[x,y,z], q:[x,y,z,w] } }.
export function poseTrack(bodies) {
    const out = {}
    for (const b of bodies) {
        if (!b.kitName) continue
        const p = b.position
        const q = b.quaternion
        out[b.kitName] = { p: [q3(p.x), q3(p.y), q3(p.z)], q: [q3(q.x), q3(q.y), q3(q.z), q3(q.w)] }
    }
    return out
}

// --- Rail: idealized prismatic slide (cannon-es ships no slider) ------------
// Keeps a body on a line through `anchor` along unit `axis`, between min/max,
// orientation locked. Applied AFTER world.step so contacts still push the
// drawer (mass/friction are real); the rail only cancels what leaves the
// track. Closing THROUGH an obstacle is refused: if the swept box would carry
// another dynamic body, the rail stops at the block ("STAND CLEAR").
export class Rail {
    constructor(body, { anchor, axis, min, max }) {
        this.body = body
        this.anchor = new CANNON.Vec3(anchor[0], anchor[1], anchor[2])
        const a = new CANNON.Vec3(axis[0], axis[1], axis[2])
        a.normalize()
        this.axis = a
        this.min = min
        this.max = max
        this.locked = new CANNON.Quaternion()
        this.locked.copy(body.quaternion)
        this.blockers = []
    }

    param(pos) {
        return (pos.x - this.anchor.x) * this.axis.x + (pos.y - this.anchor.y) * this.axis.y + (pos.z - this.anchor.z) * this.axis.z
    }

    // Half extents used for the stand-clear sweep test (set by props.js).
    halfExtents = [0.2, 0.05, 0.2]

    apply(blockFns = []) {
        const b = this.body
        // Rail-driven bodies must never be asleep: cannon ignores force/velocity
        // writes on sleeping bodies, so a parked drawer would deadlock (same
        // sleep trap as the door).
        b.sleepState = 0
        const t = this.param(b.position)
        let target = Math.min(this.max, Math.max(this.min, t))
        // Standing-cargo refusal must be evaluated whenever the slide would
        // move, not only on overshoot: gating on (target < t) meant a closing
        // drawer (target === t in range) NEVER asked, and the stand-clear
        // check silently never ran (cargo got crushed, gate went green).
        let blocked = false
        for (const fn of blockFns) {
            // Refusal means HOLD at the current parameter (and zero the axial
            // velocity, else stored speed creeps the body ~6 mm/tick straight
            // through the block — measured).
            if (fn(this.at(target))) { blocked = true; break }
        }
        if (blocked) {
            // Hold at the current parameter. The tick that first crosses the
            // refusal carries one step of speed (~15 mm) — contact
            // compliance; the hold is rigid from the next tick (velocity and
            // axial force are shed below).
            target = Math.min(this.max, Math.max(this.min, t))
        }
        // Prismatic joint, fully projected: position snaps to the rail line
        // at the (clamped) parameter, velocity is purely axial. Pinning only
        // y left x free — the drawer slid sideways off its bearings into the
        // can pocket and shoved the target prop out of reach. Writing the
        // exact rail point also unwinds gravity/lateral integration drift.
        const p = this.at(target)
        const a = this.axis
        b.position.set(p.x, p.y, p.z)
        const vt = blocked ? 0 : Math.max(-0.35, Math.min(0.35, b.velocity.dot(a)))
        b.velocity.set(a.x * vt, a.y * vt, a.z * vt)
        // A held slide also sheds axial force: velocity-zero alone is not
        // enough when the pusher re-applies force every tick (it rebuilds
        // 0.66 m/s of speed each step and creeps through).
        if (blocked) { const vf = b.force.dot(a); b.force.set(b.force.x - vf * a.x, b.force.y - vf * a.y, b.force.z - vf * a.z) }
        b.quaternion.copy(this.locked)
        b.angularVelocity.set(0, 0, 0)
    }

    at(t) {
        return new CANNON.Vec3(
            this.anchor.x + this.axis.x * t,
            this.anchor.y + this.axis.y * t,
            this.anchor.z + this.axis.z * t,
        )
    }
}

// AABB overlap of an axis-aligned box (center + half) with a body's approx
// AABB (position + half). Good enough at kit scales (props are near-axis).
export function boxOverlapsBody(center, half, body, bodyHalf) {
    const p = body.position
    return Math.abs(p.x - center.x) <= half.x + bodyHalf.x
        && Math.abs(p.y - center.y) <= half.y + bodyHalf.y
        && Math.abs(p.z - center.z) <= half.z + bodyHalf.z
}
