// COMET DRIFT HD — the SUNSET GULCH as real geometry (MODERN bar, docs/ART.md).
//
// World mapping: the sim lives in a 2048² px plane, y down. The 3D world is
// that plane at 1/60 scale: X = x*S, Z = y*S, up = +Y. A sim heading angle `a`
// becomes three-yaw `-a` (a left turn in the sim turns left on screen). The
// sim (CometDrift/sim.js) and the course data (track.js) are reused UNCHANGED
// — everything here is renderer. Geometry builders are Node-safe (pure math +
// BufferGeometry); anything touching `document` (canvas textures) lives in the
// texture/material factories so scripts/cometdrifthdcheck.mjs can audit the
// circuit in Node without a DOM.

import * as THREE from 'three'
import { TRACK, SCENERY } from '../CometDrift/track.js'

export const S = 1 / 60
const T = TRACK
const N = T.N
const PERP = (a) => [-Math.sin(a), Math.cos(a)]

// rockier than a sine: two detuned waves give the rim a natural profile.
// #471: the shipped walls towered over the road and blocked the view — tops
// dropped to ~1.7–3.3u and the face set back outside the sim's clamp. The
// noise stays small: a big setback wobble self-intersects on tight inner
// curves and grows jagged fins at the apexes.
const wallTopAt = (i) => 2.5 + Math.sin(i * 0.37 + 1.7) * 0.45 + Math.sin(i * 0.131) * 0.35
const wallOffAt = (i) => T.WALL_R + 16 + Math.sin(i * 0.53) * 4 + Math.sin(i * 0.19 + 4) * 3
export const plateauYAt = (i) => wallTopAt(i) - 0.25
export const wallTopYAt = (i) => wallTopAt(i)

// generic ribbon: sample(i) returns the two edge points in px (with height);
// closed ring, seam duplicated once for continuous UVs.
function buildRibbon(sample, vScale) {
    const pos = []
    const uv = []
    const idx = []
    for (let i = 0; i <= N; i++) {
        const s0 = sample(i % N)
        const v = T.pts[i % N].s * S * vScale
        pos.push(s0.ax * S, s0.ay, s0.az * S)
        pos.push(s0.bx * S, s0.by, s0.bz * S)
        uv.push(0, v, 1, v)
        if (i < N) {
            const a = i * 2
            idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
        }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return geo
}

// The road spans the full width, so build it directly (both edges on one band):
function roadGeo() {
    return buildRibbon((i) => {
        const p = T.pts[i]
        const [pxu, pyu] = PERP(p.a)
        return {
            ax: p.x + pxu * T.ROAD_R, ay: 0.06, az: p.y + pyu * T.ROAD_R,
            bx: p.x - pxu * T.ROAD_R, by: 0.06, bz: p.y - pyu * T.ROAD_R,
        }
    }, 1 / 5)
}

function kerbGeo(side) {
    return buildRibbon((i) => {
        const p = T.pts[i]
        const [pxu, pyu] = PERP(p.a)
        return {
            ax: p.x + pxu * side * T.KERB_R, ay: 0.07, az: p.y + pyu * side * T.KERB_R,
            bx: p.x + pxu * side * T.ROAD_R, by: 0.07, bz: p.y + pyu * side * T.ROAD_R,
        }
    }, 1 / 0.85)
}

function gutterGeo(side) {
    return buildRibbon((i) => {
        const p = T.pts[i]
        const [pxu, pyu] = PERP(p.a)
        const w = wallOffAt(i)
        return {
            ax: p.x + pxu * side * w, ay: 0.045, az: p.y + pyu * side * w,
            bx: p.x + pxu * side * T.KERB_R, by: 0.045, bz: p.y + pyu * side * T.KERB_R,
        }
    }, 1 / 3)
}

function wallGeo(side) {
    return buildRibbon((i) => {
        const p = T.pts[i]
        const [pxu, pyu] = PERP(p.a)
        // offsetting to the INSIDE of a bend collapses the ring once the
        // offset exceeds the local turn radius — the ribbon folded into
        // jagged fins at the hairpins. Clamp inside-wall offsets under the
        // radius so the band stays a band.
        let w = wallOffAt(i)
        const R = 1 / Math.max(Math.abs(p.k), 1e-6)
        if (p.k * side > 0) w = Math.max(170, Math.min(w, R * 0.8))
        return {
            ax: p.x + pxu * side * w, ay: 0.02, az: p.y + pyu * side * w,
            bx: p.x + pxu * side * w, by: wallTopAt(i), bz: p.y + pyu * side * w,
        }
    }, 1 / 7)
}

function plateauGeo(side) {
    return buildRibbon((i) => {
        const p = T.pts[i]
        const [pxu, pyu] = PERP(p.a)
        const w = wallOffAt(i)
        const o = w + 430
        const h = plateauYAt(i)
        return {
            ax: p.x + pxu * side * o, ay: h, az: p.y + pyu * side * o,
            bx: p.x + pxu * side * w, by: h, bz: p.y + pyu * side * w,
        }
    }, 1 / 9)
}

// Node-safe audit surface for cometdrifthdcheck: ring counts, closures, and the
// hard fact the renderer claims — walls rise, the road is flat, nothing NaNs.
export function trackGeometryStats() {
    const probe = (geo) => {
        const p = geo.getAttribute('position')
        let nan = 0; let minY = Infinity; let maxY = -Infinity
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i)
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) nan++
            minY = Math.min(minY, y); maxY = Math.max(maxY, y)
        }
        return { verts: p.count, nan, minY, maxY }
    }
    const geos = {
        road: roadGeo(),
        kerbL: kerbGeo(-1), kerbR: kerbGeo(1),
        gutterL: gutterGeo(-1), gutterR: gutterGeo(1),
        wallL: wallGeo(-1), wallR: wallGeo(1),
        plateauL: plateauGeo(-1), plateauR: plateauGeo(1),
    }
    const out = {}
    for (const k of Object.keys(geos)) out[k] = probe(geos[k])
    let offMin = Infinity; let offMax = -Infinity; let topMin = Infinity; let topMax = -Infinity
    for (let i = 0; i < N; i++) {
        const off = wallOffAt(i); const top = wallTopAt(i)
        offMin = Math.min(offMin, off); offMax = Math.max(offMax, off)
        topMin = Math.min(topMin, top); topMax = Math.max(topMax, top)
    }
    return { stats: out, geos, laps: { vertsExpected: (N + 1) * 2 }, bounds: { offMin, offMax, topMin, topMax, simClampPx: 216 } }
}

// ---- karts: exposed-wheel buggies assembled from primitives, livery per
// driver. Node-safe: plain materials, no textures.
export function buildKart(hex, accentHex) {
    const g = new THREE.Group()
    const body = new THREE.MeshStandardMaterial({ color: hex, metalness: 0.3, roughness: 0.32 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c161e, metalness: 0.2, roughness: 0.7 })
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 1.0), body)
    chassis.position.y = 0.3
    g.add(chassis)
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.42), body)
    nose.position.set(0, 0.28, 0.62)
    g.add(nose)
    const pod = new THREE.BoxGeometry(0.14, 0.12, 0.55)
    const podL = new THREE.Mesh(pod, dark); podL.position.set(-0.3, 0.26, -0.05); g.add(podL)
    const podR = new THREE.Mesh(pod, dark); podR.position.set(0.3, 0.26, -0.05); g.add(podR)
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.05, 0.22), body)
    wing.position.set(0, 0.5, -0.52)
    g.add(wing)
    const strutGeo = new THREE.BoxGeometry(0.05, 0.18, 0.05)
    for (const sx of [-0.18, 0.18]) {
        const strut = new THREE.Mesh(strutGeo, dark)
        strut.position.set(sx, 0.4, -0.5)
        g.add(strut)
    }
    // #471: the boxes read toy-like — cockpit hollow, nose stripe, brake lights
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.5), dark)
    cockpit.position.set(0, 0.36, 0.02)
    g.add(cockpit)
    const stripeMat = new THREE.MeshStandardMaterial({ color: accentHex, metalness: 0.25, roughness: 0.35 })
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.5), stripeMat)
    stripe.position.set(0, 0.41, 0.55)
    g.add(stripe)
    const brakeMat = new THREE.MeshStandardMaterial({ color: 0x601010, emissive: 0xff2010, emissiveIntensity: 0, roughness: 0.6 })
    const brakes = []
    for (const sx of [-0.2, 0.2]) {
        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.02), brakeMat)
        bl.position.set(sx, 0.5, -0.631)
        g.add(bl)
        brakes.push(bl)
    }
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10),
        new THREE.MeshStandardMaterial({ color: accentHex, metalness: 0.3, roughness: 0.4 }))
    helmet.position.set(0, 0.5, 0.05)
    g.add(helmet)
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.06), dark)
    visor.position.set(0, 0.52, 0.14)
    g.add(visor)
    const wheelGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.13, 14)
    wheelGeo.rotateZ(Math.PI / 2)
    const wheels = []
    const mk = (sx, sz, front) => {
        const pivot = new THREE.Group()
        pivot.position.set(sx * 0.42, 0.24, sz)
        const w = new THREE.Mesh(wheelGeo, dark)
        pivot.add(w)
        g.add(pivot)
        if (front) wheels.push(pivot)
    }
    mk(-1, 0.52, true); mk(1, 0.52, true); mk(-1, -0.45, false); mk(1, -0.45, false)
    g.userData.wheels = wheels
    g.userData.body = body
    g.userData.brakes = brakes
    return g
}

// ---- GPU particles: pooled additive point systems (sparks, dust, flames).
// Positions/velocities are integrated here at tick rate; the pool is fixed so
// allocation never happens mid-race. Node-safe (no map until the browser adds
// one) so the check can count pools.
export function makePool(count, size) {
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const vel = new Float32Array(count * 3)
    const life = new Float32Array(count)
    const maxLife = new Float32Array(count)
    const geo = new THREE.BufferGeometry()
    const posAttr = new THREE.BufferAttribute(pos, 3)
    posAttr.setUsage(THREE.DynamicDrawUsage)
    const colAttr = new THREE.BufferAttribute(col, 3)
    colAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', posAttr)
    geo.setAttribute('color', colAttr)
    const mat = new THREE.PointsMaterial({
        size, vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 1,
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    let head = 0
    let alive = 0
    const tmp = new THREE.Color()
    return {
        points,
        get aliveCount() { return alive },
        spawn(x, y, z, vx, vy, vz, ttl, colorHex) {
            const i = head; head = (head + 1) % count
            pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z
            vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz
            life[i] = ttl; maxLife[i] = ttl
            tmp.set(colorHex)
            col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b
        },
        step(gravity) {
            let n = 0
            for (let i = 0; i < count; i++) {
                if (life[i] <= 0) { col[i * 3] = 0; col[i * 3 + 1] = 0; col[i * 3 + 2] = 0; continue }
                life[i]--
                pos[i * 3] += vel[i * 3]; pos[i * 3 + 1] += vel[i * 3 + 1]; pos[i * 3 + 2] += vel[i * 3 + 2]
                vel[i * 3 + 1] += gravity
                const f = life[i] / maxLife[i]
                col[i * 3] *= 0.86 + 0.12 * f
                col[i * 3 + 1] *= 0.86 + 0.12 * f
                col[i * 3 + 2] *= 0.86 + 0.12 * f
                if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 0
                n++
            }
            alive = n
            posAttr.needsUpdate = true
            colAttr.needsUpdate = true
        },
        clear() {
            life.fill(0); col.fill(0); alive = 0
            posAttr.needsUpdate = true; colAttr.needsUpdate = true
        },
    }
}

// ---- the sandstone arch over the line: the Gulch's landmark, now standing
// 5 metres off the asphalt. Legs land in the sand gutter, safely outside the
// sim's wall limit — the karts never touch it. Browser can pass a strata
// texture for the rock; Node-safe without one.
export function buildArch(strataMap) {
    const g = new THREE.Group()
    const strata = new THREE.MeshStandardMaterial({ color: 0xb07050, map: strataMap || null, metalness: 0.05, roughness: 0.9 })
    const darker = new THREE.MeshStandardMaterial({ color: 0x6e3c28, map: strataMap || null, metalness: 0.05, roughness: 0.95 })
    const p = T.pts[0]
    const leg = new THREE.BoxGeometry(0.36, 2.3, 0.36)
    for (const s of [-1, 1]) {
        const m = new THREE.Mesh(leg, strata)
        g.add(m)
        m.position.set(s * 3.15, 1.15, 0)
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.6), darker)
        foot.position.set(s * 3.15, 0.11, 0)
        g.add(foot)
    }
    const span = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.24, 8, 20, Math.PI), strata)
    g.add(span)
    span.position.y = 2.3
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.56), darker)
    key.position.set(0, 2.3 + 3.15, 0)
    g.add(key)
    // sit it on the line, squared to the road
    g.position.set(p.x * S, 0, p.y * S)
    g.rotation.y = -p.a + Math.PI / 2
    return g
}

// cactus / hoodoo from SCENERY, standing on the plateau rim. Node-safe.
export function buildSceneryItem(sc) {
    const g = new THREE.Group()
    const h = sc.h * S
    if (sc.kind === 'cactus') {
        const green = new THREE.MeshStandardMaterial({ color: 0x3f6b34, roughness: 0.8 })
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, h * 1.15, 7), green)
        trunk.position.y = h * 0.575
        g.add(trunk)
        const armGeo = new THREE.CylinderGeometry(0.09, 0.1, h * 0.42, 6)
        const a1 = new THREE.Mesh(armGeo, green); a1.position.set(-0.28, h * 0.62, 0); g.add(a1)
        const a2 = new THREE.Mesh(armGeo, green); a2.position.set(0.26, h * 0.5, 0); g.add(a2)
        const k1 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 6), green); k1.rotation.z = Math.PI / 2; k1.position.set(-0.15, h * 0.44, 0); g.add(k1)
        const k2 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 6), green); k2.rotation.z = Math.PI / 2; k2.position.set(0.14, h * 0.32, 0); g.add(k2)
    } else {
        const rock = new THREE.MeshStandardMaterial({ color: 0x6e3c2a, roughness: 0.92 })
        const cap = new THREE.MeshStandardMaterial({ color: 0x3c2018, roughness: 0.95 })
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.62, h * 1.6, 7), rock)
        shaft.position.y = h * 0.8
        g.add(shaft)
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.5, 0.34, 7), cap)
        top.position.y = h * 1.6 + 0.1
        g.add(top)
    }
    const near = T.nearest(sc.x, sc.y, -1)
    g.position.set(sc.x * S, plateauYAt(near.i), sc.y * S)
    return g
}

// far mesas: a dark silhouette ring on the ember horizon. #471: pushed out
// and trimmed down so they frame the sky instead of walling it off.
export function buildMesas() {
    const g = new THREE.Group()
    const rock = new THREE.MeshStandardMaterial({ color: 0x4e222c, roughness: 1, metalness: 0 })
    for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2 + Math.sin(i * 3.1) * 0.2
        const r = 64 + (i % 4) * 10 + Math.sin(i * 7.7) * 4
        const h = 3.5 + ((i * 37) % 4) * 1.9
        const w = 5 + ((i * 53) % 5) * 2.2
        const m = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.9, w, h, 6), rock)
        m.position.set(17 + Math.cos(ang) * r, h / 2 - 1.4, 17 + Math.sin(ang) * r)
        m.rotation.y = ang
        g.add(m)
    }
    return g
}
