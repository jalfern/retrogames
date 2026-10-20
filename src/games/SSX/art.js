// SSX — art.js : every pixel synthesized. The mountain is a vertex-coloured
// ribbon built straight from course.js geometry (so the painted slope IS the
// ridden slope), rails glow, the city hums, and riders are articulated rigs
// that crouch, grab, spin, flip and tumble. No assets.

import * as THREE from 'three'
import { slopePos, featureLift } from './course.js'

const COLS = [-2.75, -2.2, -1.75, -1.0, -0.5, 0, 0.5, 1.0, 1.75, 2.2, 2.75]

const hash = (n) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v) }

export const THEMES = {
    day: {
        sky: 0x8fc4f2, fog: 0xa8ccf0, fogD: 0.0011,
        sun: 0xfff3d0, hemiSky: 0xbfd8f2, hemiGround: 0xdfe8f2,
        snowA: [248, 250, 255], snowB: [205, 222, 244],
        edge: [70, 190, 240], rock: [150, 155, 168],
    },
    night: {
        sky: 0x0a0c22, fog: 0x101436, fogD: 0.0016,
        sun: 0x8090ff, hemiSky: 0x2a3070, hemiGround: 0x141838,
        snowA: [96, 110, 190], snowB: [56, 64, 140],
        edge: [255, 60, 200], rock: [40, 44, 90],
    },
    dusk: {
        sky: 0xff9a5c, fog: 0xf2a878, fogD: 0.0012,
        sun: 0xffd0a0, hemiSky: 0xffc8a0, hemiGround: 0xe0b0c0,
        snowA: [255, 220, 210], snowB: [216, 170, 196],
        edge: [255, 90, 60], rock: [130, 100, 120],
    },
}

export function buildTerrain(course) {
    const T = THEMES[course.theme]
    const rows = []
    for (let i = 0; i < course.N; i += 1) rows.push(i * 4)
    const pos = new Float32Array(rows.length * COLS.length * 3)
    const col = new Float32Array(rows.length * COLS.length * 3)
    const idx = []
    rows.forEach((s, ri) => {
        const si = s / 4
        COLS.forEach((x, ci) => {
            const p = slopePos(course, s, x)
            const o = (ri * COLS.length + ci) * 3
            pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z
            const a = Math.abs(x)
            const wall = a > 1.75
            let rgb
            if (wall) rgb = T.rock
            else {
                const n = hash(si * 7.13 + ci * 3.71)
                const mix = 0.5 + 0.5 * Math.sin(si * 0.05 + x * 2.1) + (n - 0.5) * 0.35
                const t = Math.max(0, Math.min(1, mix))
                rgb = [
                    T.snowA[0] + (T.snowB[0] - T.snowA[0]) * t,
                    T.snowA[1] + (T.snowB[1] - T.snowA[1]) * t,
                    T.snowA[2] + (T.snowB[2] - T.snowA[2]) * t,
                ]
                if (a > 0.92 && a < 1.06) rgb = T.edge
                const lift = featureLift(course, s, x)
                if (lift > 0.3) { rgb = rgb.map((v) => Math.min(255, v * 1.18)) }
            }
            col[o] = rgb[0] / 255; col[o + 1] = rgb[1] / 255; col[o + 2] = rgb[2] / 255
        })
    })
    for (let ri = 0; ri < rows.length - 1; ri++) {
        for (let ci = 0; ci < COLS.length - 1; ci++) {
            const a = ri * COLS.length + ci
            const b = a + 1
            const c = a + COLS.length
            const d = c + 1
            idx.push(a, c, b, b, c, d)
        }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }))
}

export function buildRails(course) {
    const g = new THREE.Group()
    const glow = course.theme === 'night' ? 0xff40c0 : course.theme === 'dusk' ? 0xffa040 : 0x60d0ff
    const mat = new THREE.MeshBasicMaterial({ color: glow })
    const postMat = new THREE.MeshLambertMaterial({ color: 0x394048 })
    for (const rl of course.rails) {
        for (let i = rl.i0; i <= rl.i1; i++) {
            const p0 = slopePos(course, i * 4, rl.x)
            const p1 = slopePos(course, i * 4 + 4, rl.x)
            const mid = new THREE.Vector3((p0.x + p1.x) / 2, (p0.y + p1.y) / 2 + 0.55, (p0.z + p1.z) / 2)
            const len = mid.distanceTo(new THREE.Vector3(p0.x, p0.y + 0.55, p0.z))
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, len + 0.4), mat)
            bar.position.copy(mid)
            bar.lookAt(p1.x, p1.y + 0.55, p1.z)
            g.add(bar)
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), postMat)
            post.position.set(p0.x, p0.y + 0.3, p0.z)
            g.add(post)
        }
    }
    return g
}

export function buildScenery(course) {
    const g = new THREE.Group()
    const treeMat = course.theme === 'night'
        ? new THREE.MeshLambertMaterial({ color: 0x1c2a44 })
        : new THREE.MeshLambertMaterial({ color: 0x2c6a3a })
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3d24 })
    const rockMat = new THREE.MeshLambertMaterial({ color: course.theme === 'night' ? 0x2c3054 : 0x8a8f9c })
    for (const ob of course.obstacles) {
        const p = slopePos(course, ob.i * 4, ob.x)
        const th = p.th
        if (ob.kind === 'tree') {
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6), trunkMat)
            trunk.position.set(p.x, p.y + 0.6, p.z)
            const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.4, 7), treeMat)
            canopy.position.set(p.x, p.y + 2.6, p.z)
            g.add(trunk, canopy)
        } else {
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), rockMat)
            rock.position.set(p.x, p.y + 0.45, p.z)
            rock.rotation.y = hash(ob.i) * 3
            g.add(rock)
        }
        void th
    }
    if (course.theme === 'night') {
        const neon = [0xff3ca0, 0x3ce0ff, 0xffe03c, 0x8aff5e]
        const bMat = neon.map((c) => new THREE.MeshBasicMaterial({ color: c }))
        for (let i = 4; i < course.N - 2; i += 7) {
            const side = (i % 14 === 4) ? 1 : -1
            const p = slopePos(course, i * 4, side * 2.5)
            const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 0.18), new THREE.MeshLambertMaterial({ color: 0x20243c }))
            pole.position.set(p.x, p.y + 1.6, p.z)
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), bMat[(i / 7 | 0) % 4])
            bulb.position.set(p.x, p.y + 3.3, p.z)
            g.add(pole, bulb)
            if (i % 21 === 4) {
                const bp = slopePos(course, i * 4, side * (3.6 + hash(i) * 1.4))
                const bld = new THREE.Mesh(new THREE.BoxGeometry(3 + hash(i * 3) * 3, 8 + hash(i * 5) * 14, 3), new THREE.MeshLambertMaterial({ color: 0x161a38 }))
                bld.position.set(bp.x, bp.y + 7, bp.z)
                bld.rotation.y = -bp.th
                g.add(bld)
                const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.2), bMat[(i / 21 | 0) % 4])
                sign.position.set(bp.x, bp.y + 12 + hash(i * 7) * 6, bp.z)
                sign.rotation.y = -bp.th
                g.add(sign)
            }
        }
    }
    if (course.theme === 'day') {
        for (let i = 0; i < 26; i++) {
            const s = 20 + (i * 71) % (course.N * 4)
            const side = i % 2 ? 1 : -1
            const p = slopePos(course, s, side * (2.6 + hash(i) * 1.6))
            const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4.4, 7), treeMat)
            canopy.position.set(p.x, p.y + 3, p.z)
            g.add(canopy)
        }
    }
    return g
}

export function makeSprite(color) {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const x = c.getContext('2d')
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 30)
    g.addColorStop(0, `rgba(${color},1)`); g.addColorStop(1, `rgba(${color},0)`)
    x.fillStyle = g; x.fillRect(0, 0, 64, 64)
    const t = new THREE.CanvasTexture(c)
    return t
}

// ---- rider rig -------------------------------------------------------------
// root -> yaw (heading + spin) -> roll (tilt + flip) -> body parts.
export function makeRider(color) {
    const root = new THREE.Group()
    const yaw = new THREE.Group()
    const roll = new THREE.Group()
    root.add(yaw); yaw.add(roll)
    const mat = new THREE.MeshLambertMaterial({ color })
    const dark = new THREE.MeshLambertMaterial({ color: 0x20242c })
    const suit = new THREE.MeshLambertMaterial({ color: 0xf2f2f5 })
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.44), mat)
    board.position.y = 0.05
    const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.3), dark)
    bootL.position.set(0.42, 0.22, 0)
    const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.3), dark)
    bootR.position.set(-0.42, 0.22, 0)
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.3), suit)
    legs.position.set(0, 0.55, 0)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.66, 0.34), mat)
    torso.position.set(0, 1.05, 0)
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.52, 0.18), suit)
    armL.position.set(0.42, 1.12, 0)
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.52, 0.18), suit)
    armR.position.set(-0.42, 1.12, 0)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshLambertMaterial({ color: 0xa8d8ef }))
    head.position.set(0, 1.52, 0)
    const gog = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.24), new THREE.MeshBasicMaterial({ color: 0xffc23e }))
    gog.position.set(0, 1.55, 0.12)
    roll.add(board, bootL, bootR, legs, torso, armL, armR, head, gog)
    root.userData = { yaw, roll, armR, legs, torso }
    return root
}

// pose a rig from sim state — crouch, grab, tumble, tilt
export function poseRider(root, r, tick) {
    const { roll, armR, legs } = root.userData
    if (r.tumble > 0) {
        roll.rotation.x = tick * 0.6
        roll.rotation.z = Math.sin(tick * 0.9) * 1.2
        legs.scale.y = 1
        armR.rotation.z = 2
        return
    }
    if (r.air) {
        roll.rotation.x = (r.flip * Math.PI) / 180 * (r.flip < 0 ? -1 : 1) * -1
        roll.rotation.z = 0
        armR.rotation.z = r.grab ? 1.1 : 0.35
        legs.scale.y = 0.9
        return
    }
    const c = r.crouch ? 0.78 : r.tuck ? 0.66 : 1
    roll.rotation.x = 0
    roll.rotation.z = r.steerSm * 0.28
    legs.scale.y = c
    legs.position.y = 0.55 * c
    armR.rotation.z = r.tuck ? 0.9 : 0.2
}

export function sprayField(lite) {
    const n = lite ? 90 : 220
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) pos[i * 3 + 1] = -9999
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 0.5, map: makeSprite('255,255,255'), transparent: true, depthWrite: false, color: 0xffffff,
    }))
    pts.frustumCulled = false
    return { pts, pos, geo, n, head: 0 }
}
