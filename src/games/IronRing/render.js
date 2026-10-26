// IRON RING renderer (#1095) — MODERN bar: low-poly 3D fighters that fight on
// a 2D plane, SSIV-style: side camera that tracks the midpoint and zooms with
// the spacing, procedural stages with live crowds, neon and flags, shadow
// blobs, hit sparks. Pixel-free: renders at screen resolution, smoothing on.
// Everything here is presentation — the sim numbers come from the engine and
// nothing in this file feeds back into it.

import * as THREE from 'three'
import { WALL } from '../../engine/fighting.js'

const BOX = new THREE.BoxGeometry(1, 1, 1)
const SPHERE = new THREE.SphereGeometry(0.5, 10, 8)
const PLANE = new THREE.PlaneGeometry(1, 1)

function mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.75, metalness: opts.metal ?? 0.05, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1, flatShading: true, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 })
}

function box(w, h, d, mtl) {
    const mesh = new THREE.Mesh(BOX, mtl)
    mesh.scale.set(w, h, d)
    return mesh
}

// ---- fighter rig --------------------------------------------------------------------
export function buildFighter(def) {
    const c = def.color, b = def.build
    const skin = mat(c.skin), top = mat(c.top), pants = mat(c.pants), hair = mat(c.hair), accent = mat(c.accent, { rough: 0.4 })
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)
    const H = b.h, B = b.bulk

    const hips = new THREE.Group(); hips.position.y = 0.92 * H; body.add(hips)
    const pelvis = box(0.46 * B, 0.26 * H, 0.3 * B, pants); pelvis.position.y = 0.02; hips.add(pelvis)
    const torso = new THREE.Group(); torso.position.y = 0.14 * H; hips.add(torso)
    const chest = box(0.5 * B, 0.6 * H, 0.32 * B, top); chest.position.y = 0.3 * H; torso.add(chest)
    const belt = box(0.52 * B, 0.09 * H, 0.34 * B, accent); belt.position.y = 0.02; torso.add(belt)
    const neck = box(0.14, 0.1, 0.14, skin); neck.position.y = 0.62 * H; torso.add(neck)
    const head = new THREE.Group(); head.position.y = 0.66 * H; torso.add(head)
    const skull = box(0.3, 0.3, 0.3, skin); skull.position.y = 0.16; head.add(skull)
    const nose = box(0.06, 0.05, 0.06, skin); nose.position.set(0, 0.15, 0.16); head.add(nose)
    const hairGroup = new THREE.Group(); head.add(hairGroup)
    if (b.hair === 'headband') {
        hairGroup.add(at(0, 0.26, 0, 0.34, 0.07, 0.34, accent))
        hairGroup.add(at(-0.12, 0.22, -0.16, 0.05, 0.05, 0.3, accent))
    } else if (b.hair === 'mohawk') {
        hairGroup.add(at(0, 0.36, 0, 0.06, 0.16, 0.34, hair))
    } else if (b.hair === 'ponytail') {
        hairGroup.add(at(0, 0.31, -0.02, 0.32, 0.12, 0.34, hair))
        const tail = at(0, 0.16, -0.26, 0.09, 0.34, 0.09, hair); tail.rotation.x = 0.5; hairGroup.add(tail)
    } else if (b.hair === 'bun') {
        hairGroup.add(at(0, 0.31, -0.02, 0.31, 0.11, 0.33, hair))
        hairGroup.add(at(0, 0.36, -0.18, 0.14, 0.14, 0.14, hair))
    } else if (b.hair === 'braid') {
        hairGroup.add(at(0, 0.31, -0.02, 0.31, 0.11, 0.33, hair))
        hairGroup.add(at(0, 0.02, -0.2, 0.08, 0.42, 0.08, hair))
    } else if (b.hair === 'cap') {
        hairGroup.add(at(0, 0.32, 0, 0.34, 0.12, 0.34, hair))
        hairGroup.add(at(0, 0.28, 0.2, 0.3, 0.05, 0.16, hair))
    } else {
        hairGroup.add(at(0, 0.29, -0.03, 0.31, 0.07, 0.3, hair))
    }

    function at(x, y, z, w, h, d, mtl) { const m = box(w, h, d, mtl); m.position.set(x, y, z); return m }

    const armRig = (side) => {
        const sh = new THREE.Group(); sh.position.set(0.3 * B * side, 0.52 * H, 0); torso.add(sh)
        const upper = box(0.15 * B, 0.34 * H, 0.15 * B, top); upper.position.y = -0.17 * H; sh.add(upper)
        const el = new THREE.Group(); el.position.y = -0.34 * H; sh.add(el)
        const fore = box(0.13 * B, 0.3 * H, 0.13 * B, skin); fore.position.y = -0.15 * H; el.add(fore)
        const fist = box(0.16 * B, 0.16 * B, 0.16 * B, accent); fist.position.y = -0.32 * H; el.add(fist)
        return { sh, el }
    }
    const legRig = (side) => {
        const hip = new THREE.Group(); hip.position.set(0.15 * B * side, -0.04 * H, 0); hips.add(hip)
        const thigh = box(0.19 * B, 0.42 * H, 0.2 * B, pants); thigh.position.y = -0.21 * H; hip.add(thigh)
        const kn = new THREE.Group(); kn.position.y = -0.42 * H; hip.add(kn)
        const shin = box(0.16 * B, 0.4 * H, 0.17 * B, pants); shin.position.y = -0.2 * H; kn.add(shin)
        const foot = box(0.18 * B, 0.1, 0.34, accent); foot.position.set(0, -0.42 * H, 0.08); kn.add(foot)
        return { hip, kn }
    }
    const armR = armRig(1), armL = armRig(-1)
    const legR = legRig(1), legL = legRig(-1)

    const shadow = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }))
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.scale.set(0.9 * B, 1.4, 1)

    const scale = 1.75
    body.scale.setScalar(scale)
    root.scale.setScalar(1)

    return { root, body, shadow, head, torso, hips, armR, armL, legR, legL, hairGroup, def, scale }
}

const lerp = (a, b, t) => a + (b - a) * t

function attackProgress(f) {
    const mv = f.def && f.def.moves ? f.def.moves[f.move] : null
    if (!mv) return { p: 0, ph: 'idle' }
    if (f.phase === 'startup') return { p: (f.sf / Math.max(1, mv.startup)) * 0.4, ph: 'wind' }
    if (f.phase === 'active') return { p: 1, ph: 'hit' }
    return { p: 1 - Math.min(1, f.sf / Math.max(1, mv.recovery)), ph: 'back' }
}

export function poseFighter(rig, f, tSec) {
    const t = rig
    const q = {
        hipY: 0, lean: 0, headX: 0, rz: 0,
        arms: [{ sh: 0.15, el: -0.7, sz: 0.12 }, { sh: 0.15, el: -0.7, sz: -0.12 }],
        legs: [{ hip: 0, kn: 0 }, { hip: 0, kn: 0 }],
    }
    const breathe = Math.sin(tSec * 2.6) * 0.02
    const st = f.st
    const mv = f.def.moves[f.move]
    if (st === 'idle') {
        q.hipY = breathe
        q.arms = [{ sh: -1.15, el: -1.5, sz: 0.25 }, { sh: -1.0, el: -1.7, sz: -0.2 }]
        q.legs = [{ hip: 0.05, kn: -0.1 }, { hip: -0.05, kn: -0.08 }]
    } else if (st === 'crouch') {
        q.hipY = -0.32
        q.lean = 0.25
        q.arms = [{ sh: -1.2, el: -1.6, sz: 0.2 }, { sh: -1.05, el: -1.8, sz: -0.2 }]
        q.legs = [{ hip: 0.9, kn: -1.7 }, { hip: -0.7, kn: -1.5 }]
    } else if (st === 'jump' || (st === 'attack' && f.y > 0 && mv && mv.overhead)) {
        q.hipY = 0
        q.arms = [{ sh: -1.6, el: -1.1, sz: 0.3 }, { sh: -1.5, el: -1.2, sz: -0.3 }]
        q.legs = [{ hip: 0.8, kn: -1.5 }, { hip: 0.4, kn: -0.9 }]
    } else if (st === 'attack' && mv) {
        const { p, ph } = attackProgress(f)
        const key = f.move
        if (key === 'qcf' || key === 'qcfx' || key === 'qcf_S') {
            q.lean = 0.2
            q.arms = [{ sh: -1.55 * p - 0.4, el: -0.15, sz: 0.1 }, { sh: -1.5 * p - 0.4, el: -0.2, sz: -0.1 }]
        } else if (key === 'dp' || key === 'dpx' || key === 'dp_S') {
            q.lean = -0.15
            q.arms = [{ sh: -2.6 * p, el: -0.2, sz: 0.1 }, { sh: -0.6, el: -1.4, sz: -0.2 }]
            q.legs = [{ hip: 0.2, kn: -0.3 }, { hip: -0.3, kn: -0.5 }]
        } else if (key === 'rdp' || key === 'rdpx' || key === 'rdp_S') {
            q.lean = 0.1
            q.arms = [{ sh: -2.5 * p, el: -0.2, sz: 0.15 }, { sh: -0.7, el: -1.5, sz: -0.15 }]
        } else if (key === 'charge' || key === 'chargex' || key === 'charge_S') {
            q.lean = 0.3
            q.rz = 0.18
            q.arms = [{ sh: -1.4, el: -0.3, sz: 0.5 }, { sh: -0.8, el: -1.4, sz: -0.3 }]
        } else if (mv.type === 'throw') {
            q.arms = ph === 'wind'
                ? [{ sh: -2.4, el: -0.4, sz: 0.3 }, { sh: -2.3, el: -0.4, sz: -0.3 }]
                : [{ sh: -1.35, el: -0.1, sz: 0.18 }, { sh: -1.3, el: -0.1, sz: -0.18 }]
        } else if (mv.overhead) {
            q.hipY = -0.1
            q.legs = [{ hip: 1.4, kn: -0.4 }, { hip: 0.6, kn: -1.2 }]
            q.arms = [{ sh: -1.2, el: -0.8, sz: 0.2 }, { sh: -1.4, el: -0.9, sz: -0.2 }]
        } else if (mv.type === 'punch') {
            const strong = mv.dmg >= 9
            const back = ph === 'wind'
            q.lean = back ? -0.12 : 0.18
            q.arms = back
                ? [{ sh: 0.6, el: -1.9, sz: 0.3 }, { sh: -1.1, el: -1.6, sz: -0.2 }]
                : [{ sh: -1.5 * p - (strong ? 0 : 0.1), el: strong ? -0.05 : -0.5, sz: 0.06 }, { sh: -0.8, el: -1.9, sz: -0.25 }]
        } else {
            const high = mv.box[1] > 0.9
            const low = !!mv.low
            q.hipY = low ? -0.28 : 0
            q.lean = low ? 0.3 : -0.08
            q.legs = low
                ? [{ hip: 1.3 * p, kn: -0.15 }, { hip: 0.85, kn: -1.7 }]
                : high
                    ? [{ hip: -1.5 * p, kn: -0.1 }, { hip: 0.25, kn: -0.6 }]
                    : [{ hip: 1.25 * p, kn: -0.25 }, { hip: 0.2, kn: -0.5 }]
            q.arms = [{ sh: -0.9, el: -1.4, sz: 0.3 }, { sh: -1.2, el: -1.2, sz: -0.3 }]
        }
    } else if (st === 'blockstun') {
        q.lean = 0.12
        if (f.crouchBlock) { q.hipY = -0.3; q.legs = [{ hip: 0.9, kn: -1.7 }, { hip: -0.7, kn: -1.5 }] }
        q.arms = [{ sh: -1.9, el: -1.9, sz: 0.15 }, { sh: -1.75, el: -2.0, sz: -0.15 }]
    } else if (st === 'hitstun' || st === 'hitair') {
        q.lean = -0.35
        q.headX = -0.4
        q.arms = [{ sh: 0.5, el: -0.4, sz: 0.7 }, { sh: 0.3, el: -0.5, sz: -0.7 }]
        q.legs = [{ hip: -0.3, kn: -0.4 }, { hip: 0.3, kn: -0.6 }]
    } else if (st === 'down') {
        q.rz = Math.PI / 2 * (f.side === 0 ? 1 : -1)
        q.hipY = -0.5
        q.arms = [{ sh: 0.4, el: -0.2, sz: 0.9 }, { sh: 0.2, el: -0.3, sz: -0.9 }]
    } else if (st === 'getup') {
        q.rz = Math.PI / 2 * (f.side === 0 ? 1 : -1) * Math.max(0, 1 - f.sf / 22)
        q.hipY = -0.3 * Math.max(0, 1 - f.sf / 22)
        q.lean = 0.4
        q.arms = [{ sh: -0.6, el: -1.2, sz: 0.3 }, { sh: -0.4, el: -1.3, sz: -0.3 }]
    } else if (st === 'win') {
        q.hipY = Math.abs(Math.sin(tSec * 5)) * 0.08
        q.arms = [{ sh: -2.9, el: -0.1, sz: 0.2 }, { sh: -0.8, el: -1.6, sz: -0.25 }]
    } else if (st === 'walk') {
        q.arms = [{ sh: -0.7, el: -1.2, sz: 0.2 }, { sh: -0.9, el: -1.2, sz: -0.2 }]
        q.legs = [{ hip: Math.sin(tSec * 9) * 0.5, kn: -Math.max(0, -Math.sin(tSec * 9)) * 0.7 }, { hip: -Math.sin(tSec * 9) * 0.5, kn: -Math.max(0, Math.sin(tSec * 9)) * 0.7 }]
    }
    if ((st === 'idle' || st === 'crouch') && Math.abs(f.vx) > 0.02) {
        q.arms = [{ sh: -0.7 + Math.sin(tSec * 9) * 0.3, el: -1.2, sz: 0.2 }, { sh: -0.9 - Math.sin(tSec * 9) * 0.3, el: -1.2, sz: -0.2 }]
        q.legs = [{ hip: Math.sin(tSec * 9) * 0.55, kn: -Math.max(0, -Math.sin(tSec * 9)) * 0.8 }, { hip: -Math.sin(tSec * 9) * 0.55, kn: -Math.max(0, Math.sin(tSec * 9)) * 0.8 }]
    }

    const k = st === 'attack' && f.phase !== 'back' ? 0.55 : 0.3
    const cur = rig.cur || (rig.cur = { hipY: 0, lean: 0, headX: 0, rz: 0, a: [{ sh: 0.15, el: -0.7, sz: 0 }, { sh: 0.15, el: -0.7, sz: 0 }], l: [{ hip: 0, kn: 0 }, { hip: 0, kn: 0 }] })
    cur.hipY = lerp(cur.hipY, q.hipY, k); cur.lean = lerp(cur.lean, q.lean, k)
    cur.headX = lerp(cur.headX, q.headX, k); cur.rz = lerp(cur.rz, q.rz, st === 'down' ? 0.5 : k)
    for (let i = 0; i < 2; i++) {
        cur.a[i].sh = lerp(cur.a[i].sh, q.arms[i].sh, k); cur.a[i].el = lerp(cur.a[i].el, q.arms[i].el, k); cur.a[i].sz = lerp(cur.a[i].sz, q.arms[i].sz, k)
        cur.l[i].hip = lerp(cur.l[i].hip, q.legs[i].hip, k); cur.l[i].kn = lerp(cur.l[i].kn, q.legs[i].kn, k)
    }
    t.hips.position.y = (0.92 * defH(rig)) + cur.hipY
    t.torso.rotation.x = cur.lean
    t.head.rotation.x = cur.headX
    t.body.rotation.z = cur.rz
    t.armR.sh.rotation.set(cur.a[0].sh, 0, cur.a[0].sz)
    t.armL.sh.rotation.set(cur.a[1].sh, 0, cur.a[1].sz)
    t.armR.el.rotation.x = cur.a[0].el
    t.armL.el.rotation.x = cur.a[1].el
    t.legR.hip.rotation.x = cur.l[0].hip
    t.legL.hip.rotation.x = cur.l[1].hip
    t.legR.kn.rotation.x = cur.l[0].kn
    t.legL.kn.rotation.x = cur.l[1].kn
}

function defH(rig) { return rig.def.build.h }

// ---- stage ------------------------------------------------------------------------
function groundTexture(stage) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256
    const g = cv.getContext('2d')
    g.fillStyle = stage.ground; g.fillRect(0, 0, 256, 256)
    g.strokeStyle = stage.groundLine; g.lineWidth = 2
    for (let i = 0; i <= 8; i++) {
        g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.stroke()
        g.beginPath(); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke()
    }
    for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(0,0,0,${(i * 7919 % 13) / 160})`
        g.fillRect(i * 37 % 256, i * 53 % 256, 2, 2)
    }
    const tex = new THREE.CanvasTexture(cv)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(4, 2.4)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
}

export function buildStage(scene, stage) {
    const grp = new THREE.Group()
    scene.add(grp)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(46, 26), new THREE.MeshStandardMaterial({ map: groundTexture(stage), roughness: 0.9 }))
    floor.rotation.x = -Math.PI / 2; floor.position.z = -4
    grp.add(floor)
    const ring = new THREE.Mesh(new THREE.RingGeometry(8.6, 9.1, 48), mat(stage.accent, { emissive: stage.accent, ei: 0.4 }))
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015
    grp.add(ring)

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(46, 14), mat(stage.wall, { rough: 0.95 }))
    wall.position.set(0, 7, -13)
    grp.add(wall)

    const crowd = []
    const cols = stage.crowdColors
    for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 26; i++) {
            const m = box(0.55, 0.9, 0.4, mat(cols[(i * 7 + row * 3) % cols.length], { rough: 0.9 }))
            m.position.set(-12 + i * 0.95 + (row % 2) * 0.4, 1.6 + row * 0.75, -11.5 + row * 0.5)
            m.userData.ph = i * 1.7 + row
            grp.add(m); crowd.push(m)
        }
    }
    const banners = []
    for (let i = 0; i < 5; i++) {
        const bnr = box(2.6, 1.6, 0.06, mat(stage.banner, { rough: 0.8 }))
        bnr.position.set(-10 + i * 5, 6.4, -12.6)
        grp.add(bnr); banners.push(bnr)
        const pole = box(0.12, 3.4, 0.12, mat(0x2a2a30))
        pole.position.set(-10 + i * 5, 5.2, -12.6)
        grp.add(pole)
    }
    const neon = []
    stage.neon.forEach((n, i) => {
        const m = box(n.w || 2.2, n.h || 0.7, 0.16, mat(n.c, { emissive: n.c, ei: 1.6, rough: 0.3 }))
        m.position.set(n.x, n.y, -12.2)
        grp.add(m); neon.push({ mesh: m, ph: i * 2.1 })
    })
    const lamps = [-7, 7].map((x) => {
        const pole = box(0.18, 5.4, 0.18, mat(0x1d1d22)); pole.position.set(x, 2.7, -8)
        const bulb = new THREE.Mesh(SPHERE, mat(0xfff2c0, { emissive: 0xffdf80, ei: 2 }))
        bulb.scale.setScalar(0.5); bulb.position.set(x, 5.5, -8)
        grp.add(pole); grp.add(bulb)
        const light = new THREE.PointLight(0xffdf90, 14, 22, 1.8); light.position.set(x, 5.4, -6.5)
        grp.add(light)
        return bulb
    })
    return { grp, crowd, banners, neon, lamps }
}

// upgrade stage silhouettes with model-shelf props when the GLBs load (#637).
export async function attachShelfProps(stageCtx) {
    try {
        const { loadModel } = await import('../../utils/modelShelf.js')
        const jobs = [
            ['grandstand', 0, -11.8, 1.4],
            ['fence', -8.5, -9.5, 1],
            ['crate', 7.5, -9, 1.2],
            ['lamp_post', -11, -8, 1.4],
        ]
        await Promise.all(jobs.map(async ([id, x, z, s]) => {
            try {
                const g = await loadModel(id)
                g.scale.setScalar(s); g.position.set(x, 0, z)
                stageCtx.grp.add(g)
            } catch { /* primitive silhouettes carry the stage */ }
        }))
        return true
    } catch { return false }
}

// ---- scene ------------------------------------------------------------------------
export function createScene(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    renderer.setClearColor(0x0a0a12)
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x0a0a12, 16, 44)
    const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 120)
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2018, 0.85))
    const key = new THREE.DirectionalLight(0xffffff, 2.4)
    key.position.set(6, 12, 8)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x7fa8ff, 1.2)
    rim.position.set(-8, 6, -6)
    scene.add(rim)

    const projMeshes = []
    const sparks = []
    return {
        renderer, scene, cam, key, projMeshes, sparks,
        resize(w, h) {
            renderer.setSize(w, h, false)
            cam.aspect = w / h
            cam.updateProjectionMatrix()
        },
        sync(m, rigs, stageFx, tSec, shake) {
            const [a, b] = m.fighters
            const [ra, rb] = rigs
            const place = (rig, f) => {
                rig.root.position.x = f.x
                rig.root.position.y = f.y
                rig.root.rotation.y = f.facing === 1 ? Math.PI / 2 : -Math.PI / 2
                poseFighter(rig, f, tSec)
                rig.shadow.position.set(f.x, 0.02, 0)
                const s = Math.max(0.4, 1 - f.y * 0.45)
                rig.shadow.scale.set(0.9 * rig.def.build.bulk * s, 1.4 * s, 1)
                rig.shadow.material.opacity = 0.32 * s
            }
            place(ra, a); place(rb, b)
            // keep fighters z-separated visually? No: same plane (2D plane law).
            const mx = (a.x + b.x) / 2
            const dist = Math.abs(a.x - b.x)
            const cz = Math.min(12.5, 6.4 + dist * 1.15) * (16 / 9) / Math.max(1.2, cam.aspect)
            cam.position.set(mx + (shake ? (Math.random() - 0.5) * shake : 0), 1.5 + dist * 0.05 + (shake ? (Math.random() - 0.5) * shake : 0), Math.max(6, cz))
            cam.lookAt(mx, 1.0, 0)
            // crowd life
            for (const c of stageFx.crowd) c.position.y += Math.sin(tSec * 3 + c.userData.ph) * 0.0018
            for (let i = 0; i < stageFx.banners.length; i++) stageFx.banners[i].rotation.z = Math.sin(tSec * 1.8 + i) * 0.06
            for (const n of stageFx.neon) n.mesh.material.emissiveIntensity = 1.2 + Math.sin(tSec * 6 + n.ph) * 0.5
            // projectiles
            while (projMeshes.length < m.projectiles.length) {
                const mesh = new THREE.Mesh(SPHERE, mat(0xffffff, { emissive: 0xffffff, ei: 2 }))
                scene.add(mesh); projMeshes.push(mesh)
            }
            const PROJ_COLOR = { ember: 0xff8030, sting: 0x40e0ff, hex: 0x9f6aff, seed: 0x7ee08a }
            for (let i = 0; i < projMeshes.length; i++) {
                const mesh = projMeshes[i]
                const p = m.projectiles[i]
                if (!p) { mesh.visible = false; continue }
                mesh.visible = true
                mesh.position.set(p.x, p.y, 0)
                mesh.scale.set(p.super ? 1.1 : 0.72, 0.66, 0.66)
                mesh.rotation.x += 0.3
                const col = PROJ_COLOR[p.kind] || 0xffffff
                mesh.material.color.setHex(col); mesh.material.emissive.setHex(col)
            }
            // sparks
            for (let i = sparks.length - 1; i >= 0; i--) {
                const s = sparks[i]
                s.t--
                const k = 1 - s.t / s.max
                s.mesh.scale.setScalar(0.4 + k * 1.4)
                s.mesh.material.opacity = 1 - k
                if (s.t <= 0) { scene.remove(s.mesh); sparks.splice(i, 1) }
            }
            renderer.render(scene, cam)
        },
        spark(x, y, color) {
            const mesh = new THREE.Mesh(SPHERE, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }))
            mesh.position.set(x, y, 0.1)
            scene.add(mesh)
            sparks.push({ mesh, t: 12, max: 12 })
        },
    }
}

export { WALL }
