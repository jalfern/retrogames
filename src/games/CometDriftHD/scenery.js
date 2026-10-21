// COMET DRIFT HD — trackside scenery (#639).
//
// The circuits read as speed only when they are dressed: grandstands at the
// line, tire walls and striped barriers on the apexes, marshal posts at the
// corner posts, pit buildings and billboards down the front straight, trees and
// distant hills on the plateaus. Everything is deterministic data so Node, the
// browser and the harness agree on the layout, and every prop is pulled from the
// shared shelf (#637) by id — art comes from the GLBs, with primitive fallbacks
// so the game never waits on (or dies from) the network.
//
// Placement law (the rules the harness pins):
//   * the racing line stays clear: no prop may sit within the sim's wall clamp
//     (216 px from the centerline) — karts physically cannot reach the props,
//     so only barriers are marked `solid` and none of them bite either;
//   * nothing hedges a passing leg: the loop folds back on itself, so a prop
//     must clear EVERY track point by its own footprint (the #542 rule);
//   * the phone stays smooth: a capped prop count and shared geometry — clones
//     reuse the template's buffers (userData.keepGeo) and are never disposed.
//
// Node-safe: pure math + BufferGeometry/Mesh primitives, no DOM. GLB loading is
// a browser-only dynamic import in attachShelfProps().

import * as THREE from 'three'
import { TRACK } from '../CometDrift/track.js'

const T = TRACK
const S = 1 / 60
const clampPx = 216               // the sim's lateral clamp, in px from centerline
const PERP = (a) => [-Math.sin(a), Math.cos(a)]

// deterministic fractional hash (same spirit as the SSX scenery plan)
const shash = (n) => { const v = Math.sin(n * 78.233) * 43758.5453; return v - Math.floor(v) }

// shelf ids this circuit uses. Only `barrier` / `tire_wall` are solid; the rest
// are dressing that never collides (and sits outside the wall anyway).
export const SHELF_PROPS = [
    'grandstand', 'pit_building', 'billboard', 'sign',
    'barrier', 'tire_wall', 'marshal_post', 'flag',
    'tree_oak', 'tree_pine', 'hill', 'boulder', 'rock', 'cone',
]
export const SOLID_PROPS = ['barrier', 'tire_wall']

// plateau height (world units, +Y up) at a sample index — props stand on it.
const groundY = (i) => { const p = T.pts[i % T.N]; return p.h * S + (2.07 - 0.25) }

// clearance test in px: a prop footprint r must be clear of every track point
// AND outside the sim clamp. Returns the centre in px or null if it collides.
function place(i, side, off, r) {
    const p = T.pts[i % T.N]
    const [ux, uy] = PERP(p.a)
    const x = p.x + ux * side * off
    const y = p.y + uy * side * off
    const min = Math.max(r, clampPx + 16)
    for (let j = 0; j < T.N; j += 2) {
        const q = T.pts[j]
        const dx = q.x - x; const dy = q.y - y
        if (dx * dx + dy * dy < min * min) return null
    }
    return { x, y }
}

// orient a prop: 'along' squares it with the road (long axis on the racing
// direction), 'across' faces it at the track, 'rand' scatters it.
const yawFor = (orient, a, rot) => (orient === 'along' ? Math.PI / 2 - a : orient === 'across' ? -a : rot)

// ---- the plan ---------------------------------------------------------------
// One deterministic pass over the live course. Entries keep everything the
// renderer and the harness need: shelf id, sample index, side, offset, scale,
// orientation, solid flag and a px footprint `r` for the audit. Steps are
// distance-based (stepFor) so the density of dressing is constant per arc
// length, not per index, across every course in the pack.
export function tracksidePlan() {
    const out = []
    let n = 0
    const add = (e) => { out.push({ rot: shash(n++) * Math.PI * 2, solid: SOLID_PROPS.includes(e.id), ...e }) }

    const N = T.N
    const sp = T.len / N                                  // px per sample
    const stepFor = (px) => Math.max(1, Math.round(px / sp))
    const startStraight = Math.round(N * 0.04)
    const backStraight = Math.round(N * 0.5)

    // grandstands: the finish straight landmark + two more on opposite straights.
    for (let k = 0; k < 3; k++) {
        const base = k === 0 ? startStraight : k === 1 ? backStraight : Math.round(N * 0.78)
        const side = k === 0 ? 1 : k === 1 ? -1 : (shash(k * 3.3) < 0.5 ? 1 : -1)
        for (let g = 0; g < 3; g++) {
            const i = (base + g * 5) % N
            const off = 360 + g * 40
            if (place(i, side, off, 92)) add({ id: 'grandstand', i, side, off, scale: 1.5, orient: 'across', r: 92 })
        }
    }

    // pit buildings + billboards down the front straight, and a start sign.
    for (let k = 0; k < 2; k++) {
        const i = (startStraight + 20 + k * 9) % N
        const side = k === 0 ? 1 : -1
        if (place(i, side, 470, 110)) add({ id: 'pit_building', i, side, off: 470, scale: 1.3, orient: 'across', r: 110 })
        const bi = (i + 4) % N
        if (place(bi, side, 300, 40)) add({ id: 'billboard', i: bi, side, off: 300, scale: 1.4, orient: 'across', r: 40 })
    }
    const signI = (startStraight - 2 + N) % N
    if (place(signI, -1, 260, 30)) add({ id: 'sign', i: signI, side: -1, off: 260, scale: 1.2, orient: 'across', r: 30 })

    // tire walls: line the OUTER side of the tight corners (apexes), where the
    // road curves away from the prop so the ribbon never folds onto itself.
    // tire walls: line the OUTER side of the tightest corners (apexes), where
    // the road curves away from the prop so the ribbon never folds onto itself.
    // The gate is relative to the course's own tightest bend so every circuit —
    // fast flow (GULCH) or technical (CORKSCOMB) — dresses its apexes.
    let maxK = 0
    for (let i = 0; i < N; i++) maxK = Math.max(maxK, Math.abs(T.pts[i].k))
    const kGate = Math.max(0.0008, maxK * 0.55)
    const tireStep = stepFor(300)
    for (let i = 0; i < N; i += tireStep) {
        const p = T.pts[i % T.N]
        if (Math.abs(p.k) < kGate) continue
        const side = p.k > 0 ? -1 : 1
        if (place(i, side, 250, 60)) add({ id: 'tire_wall', i, side, off: 250, scale: 1, orient: 'along', r: 60 })
        else if (place(i, -side, 250, 60)) add({ id: 'tire_wall', i, side: -side, off: 250, scale: 1, orient: 'along', r: 60 })
    }

    // striped barriers hug the wall along the fast sections (the visual edge).
    const barStep = stepFor(360)
    for (let i = 0; i < N; i += barStep) {
        const p = T.pts[i % T.N]
        if (Math.abs(p.k) > 0.004) continue
        const side = (Math.floor(i / barStep) % 2 === 0) ? 1 : -1
        if (place(i, side, 252, 48)) add({ id: 'barrier', i, side, off: 252, scale: 1, orient: 'along', r: 48 })
    }

    // marshal posts at the corner posts, flags opposite them.
    const marStep = stepFor(1100)
    for (let i = 0; i < N; i += marStep) {
        const side = (Math.floor(i / marStep) % 2 === 0) ? 1 : -1
        if (place(i, side, 250, 26)) add({ id: 'marshal_post', i, side, off: 250, scale: 1.1, orient: 'rand', r: 26 })
        if (shash(i * 5.3) < 0.6 && place(i, -side, 250, 24)) add({ id: 'flag', i, side: -side, off: 250, scale: 1.2, orient: 'rand', r: 24 })
    }

    // trees + occasional rocks scattered on the plateaus, well clear of the line.
    const treeStep = stepFor(360)
    for (let i = 0; i < N; i += treeStep) {
        const r = shash(i * 1.37 + 7.1)
        if (r < 0.5) {
            const side = r < 0.3 ? 1 : -1
            const off = 320 + shash(i * 2.9) * 160
            const id = shash(i * 4.3) < 0.72 ? 'tree_pine' : 'tree_oak'
            if (place(i, side, off, 46)) add({ id, i, side, off, scale: 1.4 + shash(i * 6.1) * 1.1, orient: 'rand', r: 46 })
        }
        if (shash(i * 3.71 + 2.5) < 0.14) {
            const side = i % 2 ? 1 : -1
            const off = 300 + shash(i * 7.7) * 120
            if (place(i, side, off, 40)) add({ id: shash(i * 9.1) < 0.5 ? 'boulder' : 'rock', i, side, off, scale: 1.3, orient: 'rand', r: 40 })
        }
    }

    // cones at the chicane mouths keep the eye on the racing line.
    for (let i = 0; i < N; i += stepFor(1200)) {
        if (place(i, 1, 240, 20)) add({ id: 'cone', i, side: 1, off: 240, scale: 1, orient: 'rand', r: 20 })
    }

    return resolvePlan(out)
}

// resolve the plan's px centres once (so primitives and GLB attach agree), and
// stamp wx/wz onto each entry. Idempotent.
export function resolvePlan(plan) {
    for (const e of plan) {
        const p = T.pts[e.i % T.N]
        const [ux, uy] = PERP(p.a)
        e.wx = p.x + ux * e.side * e.off
        e.wz = p.y + uy * e.side * e.off
    }
    return plan
}

// ---- primitive fallbacks ----------------------------------------------------
// A recognisable stand-in per shelf id, in desert-gulch colours, so the circuit
// reads dressed before (and without) the GLBs. Tagged `ph` so attachShelfProps
// removes them the moment the real models land. Geometry is per-mesh (the group
// owns it) and disposed on rebuild.
const C = {
    concrete: 0xc7b29a, steel: 0x8a8f9c, dark: 0x2a2320, red: 0xc0392b, white: 0xf2ece2,
    blue: 0x2e6db0, yellow: 0xf1c40f, pine: 0x2f6b3a, oak: 0x4a7c3a,
    trunk: 0x5a3d24, sandRock: 0x8a6a4c,
}
const lam = (color) => new THREE.MeshLambertMaterial({ color })

export function primitiveProp(id) {
    const g = new THREE.Group()
    const ph = (m) => { m.userData.ph = 1; g.add(m); return m }
    if (id === 'grandstand') {
        for (let r = 0; r < 4; r++) { const step = ph(new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 1), lam(r % 2 ? C.blue : C.white))); step.position.set(0, 0.6 + r * 0.55, -r * 0.9) }
        const back = ph(new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 0.3), lam(C.concrete))); back.position.set(0, 2.2, -3.6)
        const roof = ph(new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.25, 4.6), lam(C.steel))); roof.position.set(0, 4, -1.6); roof.rotation.x = -0.12
    } else if (id === 'pit_building') {
        const base = ph(new THREE.Mesh(new THREE.BoxGeometry(8, 2.6, 3), lam(C.concrete))); base.position.y = 1.3
        const roof = ph(new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.3, 3.4), lam(C.dark))); roof.position.y = 2.75
        const glass = ph(new THREE.Mesh(new THREE.BoxGeometry(7, 0.7, 0.1), lam(0x1b2b3a))); glass.position.set(0, 1.9, 1.51)
        const sign = ph(new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 0.12), lam(C.red))); sign.position.set(0, 3.2, 1.4)
    } else if (id === 'billboard') {
        const panel = ph(new THREE.Mesh(new THREE.BoxGeometry(4, 2, 0.15), lam(C.yellow))); panel.position.y = 2.6
        const text = ph(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 0.05), lam(C.dark))); text.position.set(0, 2.6, 0.1)
        for (const sx of [-1.4, 1.4]) { const leg = ph(new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 0.2), lam(C.steel))); leg.position.set(sx, 0.8, 0) }
    } else if (id === 'sign') {
        const panel = ph(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.1), lam(C.white))); panel.position.y = 1.6
        const arrow = ph(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.05), lam(C.dark))); arrow.position.set(0, 1.6, 0.08)
        const post = ph(new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.6, 0.14), lam(C.steel))); post.position.y = 0.8
    } else if (id === 'barrier') {
        const wall = ph(new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 0.25), lam(C.white))); wall.position.y = 0.45
        for (let s = 0; s < 3; s++) { const stripe = ph(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.28), lam(C.red))); stripe.position.set(-1 + s, 0.45, 0) }
    } else if (id === 'tire_wall') {
        const tireMat = lam(0x1a1a1a)
        for (let t = 0; t < 5; t++) {
            const tire = ph(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10), tireMat)); tire.rotation.x = Math.PI / 2; tire.position.set(-2 + t, 0.5, 0)
            const hub = ph(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8), lam(C.dark))); hub.rotation.x = Math.PI / 2; hub.position.set(-2 + t, 0.5, 0)
        }
    } else if (id === 'marshal_post') {
        const post = ph(new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), lam(C.steel))); post.position.y = 1.2
        const flag = ph(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.05), lam(C.yellow))); flag.position.set(0.5, 2, 0)
        const hut = ph(new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 1), lam(C.white))); hut.position.set(0, 0.6, 0.7)
    } else if (id === 'flag') {
        const post = ph(new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), lam(C.white))); post.position.y = 0.8
        const flag = ph(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.04), lam(C.red))); flag.position.set(0.4, 1.3, 0)
    } else if (id === 'tree_pine') {
        const trunk = ph(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6), lam(C.trunk))); trunk.position.y = 0.6
        const canopy = ph(new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.4, 7), lam(C.pine))); canopy.position.y = 2.6
    } else if (id === 'tree_oak') {
        const trunk = ph(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.1, 6), lam(C.trunk))); trunk.position.y = 0.55
        const canopy = ph(new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), lam(C.oak))); canopy.position.y = 2
    } else if (id === 'hill') {
        const m = ph(new THREE.Mesh(new THREE.ConeGeometry(14, 7, 6), lam(C.sandRock))); m.position.y = 3
    } else if (id === 'boulder') {
        const m = ph(new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), lam(C.sandRock))); m.position.y = 0.5
    } else if (id === 'rock') {
        const m = ph(new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), lam(C.steel))); m.position.y = 0.35
    } else if (id === 'cone') {
        const c = ph(new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 8), lam(C.red))); c.position.y = 0.35
        const band = ph(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.14, 8), lam(C.white))); band.position.y = 0.34
    }
    return g
}

// Build the primitive dressing for a plan into a fresh group (browser).
export function buildTracksidePrimitives(plan) {
    const g = new THREE.Group()
    g.userData.isProps = 1
    for (const e of plan) {
        const m = primitiveProp(e.id)
        const p = T.pts[e.i % T.N]
        m.position.set(e.wx * S, groundY(e.i) - 0.05, e.wz * S)
        m.scale.setScalar(e.scale)
        m.rotation.y = yawFor(e.orient, p.a, e.rot)
        g.add(m)
    }
    return g
}

// ---- shelf upgrade (browser only) ------------------------------------------
// Swap the primitives for the real CC0 models when the GLBs land. Templates are
// cached per id; clones share geometry (keepGeo) and are never disposed. Returns
// the number of models attached so the caller can log/hint.
const shelfTemplates = new Map()
async function shelfTemplate(id) {
    if (!shelfTemplates.has(id)) {
        const { loadModel } = await import('../../utils/modelShelf.js')
        shelfTemplates.set(id, await loadModel(id))
    }
    return shelfTemplates.get(id)
}

export async function attachShelfProps(plan, group, alive = () => true) {
    const ids = [...new Set(plan.map((p) => p.id))]
    const models = {}
    await Promise.all(ids.map(async (id) => { try { models[id] = await shelfTemplate(id) } catch { models[id] = null } }))
    if (!alive()) return 0
    for (const ch of [...group.children]) {
        if (ch.userData.ph) { group.remove(ch); ch.traverse((o) => { if (o.geometry && !o.userData.keepGeo) o.geometry.dispose() }) }
    }
    let n = 0
    for (const e of plan) {
        const src = models[e.id]
        if (!src) continue
        const m = src.clone(true)
        m.userData.keepGeo = 1
        const p = T.pts[e.i % T.N]
        m.position.set(e.wx * S, groundY(e.i) - 0.05, e.wz * S)
        m.scale.setScalar(e.scale)
        m.rotation.y = yawFor(e.orient, p.a, e.rot)
        group.add(m)
        n++
    }
    return n
}

// ---- Node-safe audit -------------------------------------------------------
// Proves the dress keeps the promises: nothing inside the sim clamp, every prop
// clear of every passing leg by its footprint, a sane cap for phones, the
// signature categories present, and only barriers/tire-walls flagged solid.
export function tracksideAudit(plan) {
    const props = plan || tracksidePlan()
    const ids = new Set()
    const violations = []
    let solidCount = 0
    let maxSolid = 0
    let maxR = 0
    let minClear = Infinity
    for (const e of props) {
        ids.add(e.id)
        if (e.solid) { solidCount++; maxSolid = Math.max(maxSolid, e.r) }
        maxR = Math.max(maxR, e.r)
        let best = Infinity
        for (let j = 0; j < T.N; j += 2) {
            const q = T.pts[j]
            const dx = q.x - e.wx; const dy = q.y - e.wz
            best = Math.min(best, Math.hypot(dx, dy))
        }
        minClear = Math.min(minClear, best)
        const req = Math.max(e.r, clampPx + 16)
        if (best < req) violations.push({ id: e.id, i: e.i, clearance: +best.toFixed(1), required: req })
    }
    const categories = {
        grandstand: ids.has('grandstand'), pit_building: ids.has('pit_building'),
        billboard: ids.has('billboard'), sign: ids.has('sign'),
        barrier: ids.has('barrier'), tire_wall: ids.has('tire_wall'),
        marshal_post: ids.has('marshal_post'), flag: ids.has('flag'),
        tree: ids.has('tree_oak') || ids.has('tree_pine'),
    }
    const solidsAreBarriersOnly = props.every((e) => !e.solid || SOLID_PROPS.includes(e.id))
    return {
        count: props.length, cap: 260, ids: [...ids],
        categories, solidCount, maxSolid, maxR,
        minClearancePx: +minClear.toFixed(1), clampPx,
        violations, solidsAreBarriersOnly,
    }
}
