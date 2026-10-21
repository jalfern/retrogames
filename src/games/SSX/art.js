// SSX — art.js : every pixel synthesized — except the hero rider (#548): a
// real CC0 rigged character (KayKit Adventurers "Rogue_Hooded", see
// public/models/characters/LICENSE.txt) loaded with GLTFLoader and posed per-frame
// from the sim. The mountain is a vertex-coloured ribbon built straight from
// course.js geometry (so the painted slope IS the ridden slope), rails glow,
// the city hums, and riders are articulated rigs that crouch, grab, spin,
// flip and tumble.

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
            idx.push(a, b, c, b, d, c)
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

function buildPrimitiveBody(roll, color) {
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
    return { board, legs, torso, armR, head }
}

export function makeRider(color) {
    const root = new THREE.Group()
    const yaw = new THREE.Group()
    const roll = new THREE.Group()
    root.add(yaw); yaw.add(roll)
    const parts = buildPrimitiveBody(roll, color)
    root.userData = { yaw, roll, ...parts }
    return root
}

// ---- hero rider (#548) -----------------------------------------------------
// KayKit Adventurers "Rogue_Hooded" (CC0) — public/models/characters/rogue.glb.
// Pose bases are baked frames of the pack's own clips (Idle / Jump_Start /
// Jump_Idle / Sit_Chair_Pose); tuck, grab and tumble are those bases plus
// authored per-bone offsets. Every bone blends toward its target each frame,
// so pose changes read as motion, never as pops.

export const HERO_POSES = ['stand', 'tuck', 'crouch', 'air', 'grab', 'tumble']

// #620: every rider rides a real CC0 KayKit body (one per sim.js id).
// The whole Adventurers pack shares one skeleton, so the pose bases,
// STANCE and OFFS below transfer to all six riders unchanged. rider 5
// reuses the hooded rogue (the pack ships exactly five bodies).
export const RIDER_MODELS = ['rogue', 'knight', 'barbarian', 'mage', 'rogue_plain', 'rogue']

const modelUrl = (file) => `${(import.meta.env && import.meta.env.BASE_URL) || '/'}models/characters/${file}.glb`
const HERO_HEIGHT = 1.74

function sampleClip(clip, time) {
    const pose = {}
    for (const tr of clip.tracks) {
        const dot = tr.name.lastIndexOf('.')
        const bone = tr.name.slice(0, dot)
        const prop = tr.name.slice(dot + 1)
        const v = tr.evaluate
            ? tr.evaluate(time, new Float32Array(tr.getValueSize()))
            : tr.createInterpolant(new Float32Array(tr.getValueSize())).evaluate(time)
        const e = pose[bone] || (pose[bone] = {})
        if (prop === 'position') e.p = [v[0], v[1], v[2]]
        else if (prop === 'quaternion') e.q = [v[0], v[1], v[2], v[3]]
    }
    return pose
}

const eul = new THREE.Euler()
const mulQ = new THREE.Quaternion()

// per-bone euler offsets (radians, bone-local axes), composed onto the base
const STANCE = {
    hips: [0, 0.55, 0],
    spine: [0, 0.5, 0],
    chest: [0, 0.25, 0],
    head: [0.02, -1.3, 0],
    'foot.l': [0, -0.55, 0],
    'foot.r': [0, -0.55, 0],
}
const OFFS = {
    tuck: {
        hips: [0, 0, 0, -0.10], spine: [0.45, 0, 0], chest: [0.8, 0, 0], head: [-0.5, 0, 0],
        'upperleg.l': [0.9, 0, 0.05], 'lowerleg.l': [-1.65, 0, 0], 'foot.l': [0.7, 0, 0],
        'upperleg.r': [0.8, 0, -0.05], 'lowerleg.r': [-1.55, 0, 0], 'foot.r': [0.7, 0, 0],
        'upperarm.l': [1.1, 0, 0.4], 'lowerarm.l': [1.5, 0, 0],
        'upperarm.r': [1.1, 0, -0.4], 'lowerarm.r': [1.5, 0, 0],
    },
    crouch: {
        hips: [0, 0, 0, -0.16], spine: [0.2, 0, 0], chest: [0.28, 0, 0], head: [-0.12, 0, 0],
        'upperleg.l': [0.75, 0, 0.04], 'lowerleg.l': [-1.5, 0, 0], 'foot.l': [0.6, 0, 0],
        'upperleg.r': [0.68, 0, -0.04], 'lowerleg.r': [-1.42, 0, 0], 'foot.r': [0.6, 0, 0],
        'upperarm.l': [0.5, 0, 0.25], 'lowerarm.l': [0.8, 0, 0],
        'upperarm.r': [0.5, 0, -0.25], 'lowerarm.r': [0.8, 0, 0],
    },
    grab: {
        hips: [0, 0.18, 0], spine: [0.35, 0.15, 0], chest: [0.55, 0.1, 0], head: [-0.35, -0.25, 0],
        'upperarm.l': [1.55, 0, 0.5], 'lowerarm.l': [0.85, 0, 0],
        'upperarm.r': [0.2, 0, -0.35],
    },
    tumble: {
        hips: [0, 0.3, 0], spine: [-0.35, -0.2, 0], chest: [-0.2, -0.1, 0], head: [0.5, 0.35, 0],
        'upperarm.l': [-0.5, 0, 1.2], 'lowerarm.l': [0.3, 0, 0],
        'upperarm.r': [-2.9, 0, -0.4], 'lowerarm.r': [0.5, 0, 0],
        'upperleg.l': [0.8, 0, 0.35], 'lowerleg.l': [-0.9, 0, 0], 'foot.l': [0.3, 0, 0],
        'upperleg.r': [-0.4, 0, -0.35], 'lowerleg.r': [0.6, 0, 0],
    },
    air: {
        'upperleg.l': [0.12, 0, 0.06], 'lowerleg.l': [-0.35, 0, 0],
        'upperleg.r': [0.1, 0, -0.06], 'lowerleg.r': [-0.3, 0, 0],
    },
}
const POSE_BASE = { stand: 'stand', tuck: 'stand', crouch: 'crouch', air: 'air', grab: 'air', tumble: 'air' }

function poseOffset(name, bone) {
    const a = STANCE[bone]
    const b = OFFS[name] && OFFS[name][bone]
    if (!a) return b || null
    if (!b) return a
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2], (a[3] || 0) + (b[3] || 0)]
}

function composeTargets(clips) {
    const bases = {
        stand: sampleClip(clips.Idle, 0),
        crouch: sampleClip(clips.Jump_Start, 0.34),
        air: sampleClip(clips.Jump_Idle, 0.3),
    }
    const targets = {}
    for (const name of HERO_POSES) {
        const base = bases[POSE_BASE[name]]
        const t = {}
        for (const bone of Object.keys(base)) {
            const e = { p: base[bone].p ? [...base[bone].p] : null, q: base[bone].q ? [...base[bone].q] : null }
            const o = poseOffset(name, bone)
            if (o && e.p && o.length > 3) e.p = [e.p[0], e.p[1] + (o[3] || 0), e.p[2]]
            const r3 = o ? [o[0], o[1], o[2]] : [0, 0, 0]
            if (e.q) {
                eul.set(r3[0], r3[1], r3[2])
                mulQ.setFromEuler(eul)
                const q = new THREE.Quaternion(e.q[0], e.q[1], e.q[2], e.q[3]).multiply(mulQ)
                e.q = [q.x, q.y, q.z, q.w]
            }
            t[bone] = e
        }
        targets[name] = t
    }
    return targets
}

export function makeHeroRider(color, modelFile = 'rogue', style = 0) {
    const root = new THREE.Group()
    const yaw = new THREE.Group()
    const roll = new THREE.Group()
    root.add(yaw); yaw.add(roll)
    const parts = buildPrimitiveBody(roll, color)
    root.userData = { yaw, roll, ...parts, hero: null }
    Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        fetch(modelUrl(modelFile)).then((res) => { if (!res.ok) throw new Error(`hero glb ${res.status}`); return res.arrayBuffer() }),
    ]).then(async ([mod, buf]) => {
        const gltf = await new mod.GLTFLoader().parseAsync(buf, '')
        const clips = {}
        for (const a of gltf.animations) clips[a.name] = a
        const rigRoot = gltf.scene.children.find((c) => c.name === 'Rig') || gltf.scene
        const bones = {}
        rigRoot.traverse((o) => { bones[o.name] = o })
        const box = new THREE.Box3().setFromObject(rigRoot)
        const h = box.max.y - box.min.y
        const model = new THREE.Group()
        model.add(rigRoot)
        model.scale.setScalar(HERO_HEIGHT / h)
        model.position.y = -((box.min.y) * (HERO_HEIGHT / h))
        const board = makeBoard(color, style)
        roll.clear()
        roll.add(model, board)
        const bootGeo = new THREE.BoxGeometry(0.3, 0.22, 0.46)
        const bootMat = new THREE.MeshLambertMaterial({ color: 0x232830 })
        for (const side of ['l', 'r']) {
            const boot = new THREE.Mesh(bootGeo, bootMat)
            boot.position.set(0.02, -0.16, 0.06)
            if (bones[`foot.${side}`]) bones[`foot.${side}`].add(boot)
        }
        root.userData.hero = {
            model, bones, board,
            targets: composeTargets(clips),
            pose: 'stand',
            cur: {},
        }
        root.userData.armR = null
        root.userData.legs = null
    }).catch((e) => {
        console.error('[ssx] hero rider load failed:', e)
        root.userData.hero = false
    })
    return root
}

export function makeBoard(color, style = 0) {
    const L = 1.78, NOSE = 0.16, WAIST = 0.17, TIPW = 0.19
    const shape = new THREE.Shape()
    shape.moveTo(L / 2, 0)
    shape.bezierCurveTo(L / 2 - NOSE, TIPW * 0.9, 0.15, WAIST, -0.45, WAIST * 1.02)
    shape.bezierCurveTo(-L / 2 + NOSE, TIPW * 0.95, -L / 2, TIPW * 0.4, -L / 2, 0)
    shape.bezierCurveTo(-L / 2, -TIPW * 0.4, -L / 2 + NOSE, -TIPW * 0.95, -0.45, -WAIST * 1.02)
    shape.bezierCurveTo(0.15, -WAIST, L / 2 - NOSE, -TIPW * 0.9, L / 2, 0)
    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 14,
    })
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    const col = new Float32Array(pos.count * 3)
    const cA = new THREE.Color(color)
    const cB = new THREE.Color(0x181d26)
    const cTip = new THREE.Color(0xe8edf5)
    const mixc = new THREE.Color()
    const paint = (x, a) => {
        switch (style % 6) {
            case 1: return cA
            case 2: return Math.floor(Math.abs(x) * 3.5) % 2 === 0 ? cTip : cA
            case 3: return cA.clone().lerp(cTip, a * 0.9)
            case 4: return a > 0.5 ? cA : cB
            case 5: return x > 0 ? cA : cTip
            default: return Math.sin(x * 6.2) > 0.15 ? cB : cA
        }
    }
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i)
        const a = Math.abs(x) / (L / 2)
        pos.setY(i, y + 0.16 * Math.pow(Math.max(0, a - 0.62) / 0.38, 2))
        if (y < 0.012) mixc.copy(cB)
        else if (a > 0.8) mixc.copy(cTip)
        else mixc.copy(paint(x, a))
        col[i * 3] = mixc.r; col[i * 3 + 1] = mixc.g; col[i * 3 + 2] = mixc.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }))
    mesh.position.y = 0.045
    return mesh
}

// map sim state to a hero pose name
export function heroPose(r, override) {
    if (override) return override
    if (r.tumble > 0) return 'tumble'
    if (r.air) return r.grab ? 'grab' : 'air'
    if (r.crouch) return 'crouch'
    if (r.tuck) return 'tuck'
    if (r.scrub) return 'crouch'
    return 'stand'
}

const tmpQ = new THREE.Quaternion()
const tmpV = new THREE.Vector3()

function blendHero(hero, pose) {
    if (hero.pose !== pose) { hero.pose = pose; hero.cur = {} }
    const t = hero.targets[pose]
    if (!t) return
    for (const name of Object.keys(t)) {
        const bone = hero.bones[name]
        if (!bone) continue
        const tgt = t[name]
        let c = hero.cur[name]
        if (!c) {
            c = hero.cur[name] = {
                p: bone.position.clone(),
                q: bone.quaternion.clone(),
            }
        }
        if (tgt.p) { tmpV.set(tgt.p[0], tgt.p[1], tgt.p[2]); bone.position.lerpVectors(c.p, tmpV, 0.32); c.p.copy(bone.position) }
        if (tgt.q) { tmpQ.set(tgt.q[0], tgt.q[1], tgt.q[2], tgt.q[3]); bone.quaternion.slerpQuaternions(c.q, tmpQ, 0.32); c.q.copy(bone.quaternion) }
    }
}

// pose a rig from sim state — crouch, grab, tumble, tilt
export function poseRider(root, r, tick, override) {
    const { roll, armR, legs, hero } = root.userData
    const pose = heroPose(r, override)
    if (r.tumble > 0) {
        roll.rotation.x = tick * 0.6
        roll.rotation.z = Math.sin(tick * 0.9) * 1.2
        if (hero) blendHero(hero, pose)
        else { legs.scale.y = 1; armR.rotation.z = 2 }
        return
    }
    if (r.air) {
        roll.rotation.x = (r.flip * Math.PI) / 180 * (r.flip < 0 ? -1 : 1) * -1
        roll.rotation.z = 0
        if (hero) blendHero(hero, pose)
        else { armR.rotation.z = r.grab ? 1.1 : 0.35; legs.scale.y = 0.9 }
        return
    }
    const c = r.crouch ? 0.78 : r.tuck ? 0.66 : 1
    roll.rotation.x = 0
    roll.rotation.z = r.steerSm * 0.28
    if (hero) blendHero(hero, pose)
    else {
        legs.scale.y = c
        legs.position.y = 0.55 * c
        armR.rotation.z = r.tuck ? 0.9 : 0.2
    }
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
