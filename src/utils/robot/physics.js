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

// Real materials with per-pair contact data (SimReady keeps mass/friction per
// asset; stage 1 ships the kit's own measured constants, stage 2 keeps the
// per-asset ones coming from SimReady).
export function installMaterials(world) {
    const steel = new CANNON.Material('steel')
    const plastic = new CANNON.Material('plastic')
    const wood = new CANNON.Material('wood')
    world.addContactMaterial(new CANNON.ContactMaterial(steel, wood, { friction: 0.32, restitution: 0.05 }))
    world.addContactMaterial(new CANNON.ContactMaterial(plastic, wood, { friction: 0.45, restitution: 0.08 }))
    world.addContactMaterial(new CANNON.ContactMaterial(steel, steel, { friction: 0.18, restitution: 0.02 }))
    world.addContactMaterial(new CANNON.ContactMaterial(plastic, steel, { friction: 0.28, restitution: 0.06 }))
    return { steel, plastic, wood }
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
        s += `${b.id}:${q3(p.x)},${q3(p.y)},${q3(p.z)}|${q3(q.x)},${q3(q.y)},${q3(q.z)},${q3(q.w)};`
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
        const t = this.param(b.position)
        let target = Math.min(this.max, Math.max(this.min, t))
        if (target < t) {
            for (const fn of blockFns) {
                if (fn(this.at(target))) target = t
            }
        }
        // Orientation/axis control. When the solver carried the body past the
        // rail limits we clamp position AND zero the axis velocity — writing
        // (clamped - overshoot)/dt as velocity fires the body back next tick
        // (the fling we proved on the bench).
        const a = this.axis
        if (target !== t) {
            const p = this.at(target)
            b.position.set(p.x, p.y, p.z)
            const vn = b.velocity.dot(a)
            b.velocity.set(b.velocity.x - vn * a.x, b.velocity.y - vn * a.y, b.velocity.z - vn * a.z)
        } else {
            const vt = b.velocity.dot(a)
            b.velocity.set(a.x * vt, a.y * vt, a.z * vt)
        }
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
