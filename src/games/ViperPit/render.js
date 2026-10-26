// VIPER PIT renderer (#1096) — MODERN bar, dark and gritty: articulated limb
// rigs (shoulder/elbow/hip/knee joints, taller heavier proportions than the
// box men next door), procedural asphalt/foundry/subway floors, chain-link and
// neon, silhouetted crowds with phone-glow, hanging lamps with light cones,
// drifting embers, and impact sparks. Everything here is presentation — the
// numbers come from the engine and nothing feeds back into it.

import * as THREE from 'three'
import { WALL } from '../../engine/fighting.js'

const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10)
const CAPS = new THREE.CapsuleGeometry(0.5, 1, 4, 10)
const SPH = new THREE.SphereGeometry(0.5, 12, 10)
const PLANE = new THREE.PlaneGeometry(1, 1)
const BOX = new THREE.BoxGeometry(1, 1, 1)

const mulberry = (a) => () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial({
    color, roughness: o.rough ?? 0.72, metalness: o.metal ?? 0.08,
    emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1,
    transparent: !!o.transparent, opacity: o.opacity ?? 1,
})
const limb = (geo, r, h, mtl, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mtl)
    m.scale.set(r * 2, h, r * 2)
    m.position.set(x, y, z)
    return m
}

// -- procedural textures -------------------------------------------------------------
function asphaltTex(base, line, seed) {
    const c = document.createElement('canvas'); c.width = c.height = 256
    const g = c.getContext('2d')
    const r = mulberry(seed)
    g.fillStyle = base; g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 2600; i++) {
        const v = r()
        g.fillStyle = `rgba(${v > 0.5 ? '255,255,255' : '0,0,0'},${(r() * 0.07).toFixed(3)})`
        g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2)
    }
    for (let i = 0; i < 7; i++) {
        g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1 + r() * 2
        g.beginPath()
        let x = r() * 256, y = r() * 256
        g.moveTo(x, y)
        for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 70; g.lineTo(x, y) }
        g.stroke()
    }
    g.fillStyle = line
    g.fillRect(0, 122, 256, 3)
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(6, 4)
    return t
}

function signTex(text, color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64
    const g = c.getContext('2d')
    g.clearRect(0, 0, 256, 64)
    g.font = 'bold 44px "Courier New", monospace'
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillStyle = color
    g.shadowColor = color; g.shadowBlur = 18
    g.fillText(text, 128, 34)
    return new THREE.CanvasTexture(c)
}

function fenceTex() {
    const c = document.createElement('canvas'); c.width = c.height = 128
    const g = c.getContext('2d')
    g.strokeStyle = 'rgba(150,160,175,0.85)'; g.lineWidth = 3
    for (let i = -128; i < 256; i += 22) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke()
        g.beginPath(); g.moveTo(i, 128); g.lineTo(i + 128, 0); g.stroke()
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(12, 2)
    return t
}

// -- fighter rig ---------------------------------------------------------------------
export function buildFighter(def) {
    const c = def.color, b = def.build
    const H = b.h, B = b.bulk
    const skin = std(c.skin, { rough: 0.55 }), top = std(c.top, { rough: 0.8 })
    const pants = std(c.pants, { rough: 0.85 }), hair = std(c.hair)
    const accent = std(c.accent, { rough: 0.35, metal: b.gear === 'chain' ? 0.7 : 0.15 })
    const dark = std(0x14161c, { rough: 0.9 })

    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)

    const hips = new THREE.Group(); hips.position.y = 0.95 * H; body.add(hips)
    hips.add(limb(CAPS, 0.2 * B, 0.12 * H, pants))

    const torso = new THREE.Group(); torso.position.y = 0.12 * H; hips.add(torso)
    const chest = limb(CAPS, 0.24 * B, 0.34 * H, top); chest.position.y = 0.28 * H; torso.add(chest)
    const shoulders = limb(CAPS, 0.1 * B, 0.42 * B, top); shoulders.rotation.z = Math.PI / 2; shoulders.position.y = 0.5 * H; torso.add(shoulders)
    if (b.gear === 'jacket') {
        const lapel = new THREE.Mesh(BOX, dark); lapel.scale.set(0.36 * B, 0.42 * H, 0.05); lapel.position.set(0, 0.3 * H, 0.24 * B); torso.add(lapel)
    }
    if (b.gear === 'chain') {
        const chain = new THREE.Mesh(BOX, accent); chain.scale.set(0.5 * B, 0.04, 0.05); chain.position.set(0, 0.1 * H, 0.22 * B); torso.add(chain)
    }
    const head = new THREE.Group(); head.position.y = 0.58 * H; torso.add(head)
    const skull = new THREE.Mesh(SPH, skin); skull.scale.set(0.26 * B, 0.3, 0.26 * B); skull.position.y = 0.12; head.add(skull)
    const jaw = new THREE.Mesh(BOX, skin); jaw.scale.set(0.16 * B, 0.09, 0.16 * B); jaw.position.set(0, 0.0, 0.08); head.add(jaw)
    if (b.hair === 'hood') {
        const hood = new THREE.Mesh(SPH, top); hood.scale.set(0.34 * B, 0.34 * B, 0.34 * B); hood.position.set(0, 0.13, -0.05); head.add(hood)
    } else if (b.hair === 'mohawk') {
        const mo = new THREE.Mesh(BOX, hair); mo.scale.set(0.05, 0.16, 0.3); mo.position.set(0, 0.3, 0); head.add(mo)
    } else if (b.hair === 'shaven') {
        const st = new THREE.Mesh(SPH, hair); st.scale.set(0.27 * B, 0.24, 0.27 * B); st.position.y = 0.16; head.add(st)
    } else if (b.hair !== 'bald') {
        const hs = new THREE.Mesh(SPH, hair); hs.scale.set(0.28 * B, 0.24, 0.28 * B); hs.position.set(0, 0.17, -0.02); head.add(hs)
    }

    const armRig = (side) => {
        const sh = new THREE.Group(); sh.position.set(0.26 * B * side, 0.48 * H, 0); torso.add(sh)
        const upper = limb(CAPS, 0.075 * B, 0.2 * H, top); upper.position.y = -0.14 * H; sh.add(upper)
        const el = new THREE.Group(); el.position.y = -0.28 * H; sh.add(el)
        const fore = limb(CAPS, 0.065 * B, 0.18 * H, skin); fore.position.y = -0.13 * H; el.add(fore)
        const fist = new THREE.Mesh(SPH, b.gear === 'wrap' ? accent : skin); fist.scale.setScalar(0.09 * B); fist.position.y = -0.27 * H; el.add(fist)
        return { sh, el }
    }
    const legRig = (side) => {
        const hip = new THREE.Group(); hip.position.set(0.11 * B * side, -0.02, 0); hips.add(hip)
        const thigh = limb(CAPS, 0.095 * B, 0.24 * H, pants); thigh.position.y = -0.18 * H; hip.add(thigh)
        const kn = new THREE.Group(); kn.position.y = -0.38 * H; hip.add(kn)
        const shin = limb(CAPS, 0.075 * B, 0.22 * H, pants); shin.position.y = -0.16 * H; kn.add(shin)
        const boot = new THREE.Mesh(BOX, dark); boot.scale.set(0.12 * B, 0.08, 0.26); boot.position.set(0, -0.34 * H, 0.05); kn.add(boot)
        return { hip, kn }
    }
    const armR = armRig(1), armL = armRig(-1)
    const legR = legRig(1), legL = legRig(-1)

    const shadow = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false }))
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.scale.set(0.8 * B, 1.3, 1)

    body.scale.setScalar(1.62)

    return { root, body, shadow, head, torso, hips, armR, armL, legR, legL, def }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const ease = (t) => t * t * (3 - 2 * t)

function attackProgress(f) {
    const mv = f.def && f.def.moves ? f.def.moves[f.move] : null
    if (!mv) return { p: 0, ph: 'idle' }
    if (f.phase === 'startup') return { p: (f.sf / Math.max(1, mv.startup)) * 0.35, ph: 'wind' }
    if (f.phase === 'active') return { p: 1, ph: 'hit' }
    return { p: 1 - clamp(f.sf / Math.max(1, mv.recovery), 0, 1), ph: 'back' }
}

// -- posing ------------------------------------------------------------------------
export function poseFighter(rig, f, tSec) {
    const q = {
        hipY: 0, lean: 0, headX: 0, drop: 0,
        arms: [{ sh: 0, el: -0.6, z: 0.18 }, { sh: 0, el: -0.6, z: -0.18 }],
        legs: [{ hip: 0, kn: 0 }, { hip: 0, kn: 0 }],
    }
    const breathe = Math.sin(tSec * 2.2) * 0.015
    const st = f.st
    const mv = f.def.moves[f.move]
    const walkSpeed = Math.abs(f.vx || 0)
    const swing = walkSpeed > 0.01 ? Math.sin(tSec * 11) : 0

    if (st === 'idle' || st === 'crouch') {
        const low = st === 'crouch'
        q.hipY = breathe - (low ? 0.34 : 0)
        q.lean = low ? 0.18 : 0.05
        q.arms = [{ sh: -0.5, el: -1.7, z: 0.5 }, { sh: -0.35, el: -1.9, z: -0.45 }]
        q.legs = [{ hip: low ? 0.7 : swing * 0.5 + 0.05, kn: low ? -1.3 : -0.12 }, { hip: low ? 0.7 : -swing * 0.5 - 0.05, kn: low ? -1.3 : -0.1 }]
    } else if (st === 'blockstun') {
        const low = f.crouchBlock
        q.hipY = -(low ? 0.32 : 0.04)
        q.lean = -0.12
        q.arms = [{ sh: -1.2, el: -2.4, z: 0.7 }, { sh: -1.1, el: -2.5, z: -0.7 }]
        q.legs = [{ hip: low ? 0.65 : 0.12, kn: low ? -1.25 : -0.2 }, { hip: low ? 0.6 : 0.05, kn: low ? -1.2 : -0.15 }]
    } else if (st === 'jump' || st === 'hitair') {
        q.hipY = 0
        q.arms = [{ sh: -0.8, el: -1.2, z: 0.5 }, { sh: -0.8, el: -1.2, z: -0.5 }]
        q.legs = [{ hip: 0.55, kn: -1.1 }, { hip: 0.3, kn: -0.7 }]
    } else if (st === 'attack' && mv) {
        const { p, ph } = attackProgress(f)
        const wind = ph === 'wind' ? p : ph === 'hit' ? 1 : p
        const key = f.move || ''
        const kick = /k($|_)/.test(key.replace('qcbf', 'hk')) || key === 'lk' || key === 'hk' || key === 'clk' || key === 'chk' || key === 'al'
        const throwish = mv.type === 'throw'
        const upper = key === 'dp' || key.startsWith('dp') || key === 'qcbf'
        const proj = !!mv.projectile
        q.lean = ph === 'hit' ? 0.22 : 0.08 * wind
        if (throwish) {
            q.arms = [{ sh: -1.4 * wind, el: -0.2, z: 0.35 }, { sh: -1.4 * wind, el: -0.2, z: -0.35 }]
            q.hipY = -0.08
        } else if (upper) {
            q.arms = [{ sh: -2.6 * wind, el: -0.15, z: 0.2 }, { sh: 0.4, el: -1.6, z: -0.4 }]
            q.hipY = -0.12 + 0.1 * wind
            q.legs = [{ hip: 0.25, kn: -0.4 }, { hip: -0.15, kn: -0.15 }]
        } else if (kick) {
            const lowK = key === 'clk' || key === 'chk'
            q.legs = [{ hip: -1.35 * wind + (lowK ? 0.5 : 0), kn: lowK ? -0.1 : -0.25 }, { hip: 0.12, kn: -0.25 }]
            q.arms = [{ sh: 0.5, el: -1.4, z: 0.4 }, { sh: -0.6, el: -1.6, z: -0.4 }]
            q.lean = -0.16 * wind
            q.hipY = lowK ? -0.3 : -0.05
        } else if (proj) {
            q.arms = [{ sh: -1.5 * wind, el: -0.1, z: 0.25 }, { sh: -0.9, el: -1.8, z: -0.4 }]
            q.hipY = -0.06
        } else {
            q.arms = [{ sh: -1.5 * wind, el: ph === 'hit' ? -0.05 : -1.6, z: 0.15 }, { sh: 0.35, el: -1.9, z: -0.4 }]
            q.hipY = -0.05
        }
    } else if (st === 'hitstun') {
        q.lean = -0.3; q.headX = -0.4
        q.arms = [{ sh: 0.7, el: -1.1, z: 0.6 }, { sh: 0.6, el: -1.2, z: -0.6 }]
        q.hipY = -0.05
        q.legs = [{ hip: -0.25, kn: -0.2 }, { hip: 0.2, kn: -0.3 }]
    } else if (st === 'down') {
        q.drop = 1
        q.arms = [{ sh: 0.9, el: -0.3, z: 0.9 }, { sh: 0.8, el: -0.3, z: -0.9 }]
        q.legs = [{ hip: 0.3, kn: -0.4 }, { hip: -0.2, kn: -0.2 }]
    } else if (st === 'getup') {
        q.hipY = -0.4
        q.lean = 0.3
        q.legs = [{ hip: 0.8, kn: -1.4 }, { hip: 0.4, kn: -0.8 }]
    } else if (st === 'win') {
        q.hipY = Math.abs(Math.sin(tSec * 4)) * 0.06
        q.arms = [{ sh: -2.9, el: -0.1, z: 0.3 }, { sh: -0.2, el: -1.4, z: -0.4 }]
    } else if (st === 'lose') {
        q.drop = 1
    }

    if (walkSpeed > 0.01 && (st === 'idle')) {
        q.legs = [{ hip: swing * 0.6, kn: -0.2 - Math.max(0, -swing) * 0.3 }, { hip: -swing * 0.6, kn: -0.2 - Math.max(0, swing) * 0.3 }]
        q.arms = [{ sh: -0.4 - swing * 0.3, el: -1.5, z: 0.3 }, { sh: -0.4 + swing * 0.3, el: -1.5, z: -0.3 }]
    }

    const r = rig
    r.body.rotation.x = ease(q.drop) * Math.PI / 2
    r.body.position.y = q.hipY - ease(q.drop) * 0.42
    r.torso.rotation.x = q.lean
    r.head.rotation.x = q.headX
    r.armR.sh.rotation.x = q.arms[0].sh; r.armR.sh.rotation.z = q.arms[0].z; r.armR.el.rotation.x = q.arms[0].el
    r.armL.sh.rotation.x = q.arms[1].sh; r.armL.sh.rotation.z = q.arms[1].z; r.armL.el.rotation.x = q.arms[1].el
    r.legR.hip.rotation.x = q.legs[0].hip; r.legR.kn.rotation.x = q.legs[0].kn
    r.legL.hip.rotation.x = q.legs[1].hip; r.legL.kn.rotation.x = q.legs[1].kn
}

// -- finisher cinematic: per-beat victim pose --------------------------------------
// During the FINISH freeze the loser is scripted through the signature beats
// (grab/stitch/strike/flip/slam/blast/charge/surge/flare). k is 0..1 progress in
// the beat; the pose eases in from the body and is what sells each beat.
export function poseFinisherBeat(rig, kind, k) {
    const e = ease(k)
    const S = {
        grab:   { hipY: -0.16 * e, lean: 0.3 * e, headX: 0.3 * e, drop: 0, arms: [{ sh: -0.9, el: -1.6, z: 0.5 }, { sh: -0.7, el: -1.7, z: -0.45 }], legs: [{ hip: 0.4, kn: -0.6 }, { hip: 0.2, kn: -0.4 }] },
        stitch: { hipY: -0.05, lean: -0.3 * e, headX: -0.55 * e, drop: 0, arms: [{ sh: 0.85, el: -1.0, z: 0.7 }, { sh: 0.75, el: -1.0, z: -0.7 }], legs: [{ hip: -0.25, kn: -0.3 }, { hip: 0.22, kn: -0.35 }] },
        strike: { hipY: -0.05, lean: -0.42 * e, headX: -0.7 * e, drop: 0, arms: [{ sh: 0.95, el: -0.9, z: 0.75 }, { sh: 0.85, el: -0.9, z: -0.75 }], legs: [{ hip: -0.32, kn: -0.32 }, { hip: 0.25, kn: -0.35 }] },
        flip:   { hipY: 0.95 * Math.sin(Math.PI * e), lean: -0.4, headX: -0.3, drop: 0, arms: [{ sh: -1.4, el: -0.4, z: 0.8 }, { sh: -1.2, el: -0.5, z: -0.8 }], legs: [{ hip: 0.9, kn: -1.2 }, { hip: 0.6, kn: -0.9 }] },
        slam:   { hipY: -0.08 * e, lean: 0.2 * e, headX: 0.2 * e, drop: e, arms: [{ sh: 0.9, el: -0.3, z: 0.9 }, { sh: 0.8, el: -0.3, z: -0.9 }], legs: [{ hip: 0.3, kn: -0.4 }, { hip: -0.2, kn: -0.2 }] },
        blast:  { hipY: -0.14 * e, lean: -0.5 * e, headX: -0.5 * e, drop: 0.55 * e, arms: [{ sh: 1.0, el: -0.2, z: 1.0 }, { sh: 0.9, el: -0.2, z: -1.0 }], legs: [{ hip: -0.3, kn: -0.5 }, { hip: 0.3, kn: -0.3 }] },
        charge: { hipY: -0.28 * e, lean: -0.2 * e, headX: -0.15 * e, drop: 0, arms: [{ sh: -0.6, el: -1.8, z: 0.6 }, { sh: -0.5, el: -1.9, z: -0.5 }], legs: [{ hip: 0.6, kn: -1.1 }, { hip: 0.5, kn: -0.9 }] },
        surge:  { hipY: -0.05, lean: -0.4 * e, headX: -0.4 * e, drop: 0.25 * e, arms: [{ sh: 1.1, el: -0.3, z: 0.9 }, { sh: 1.0, el: -0.3, z: -0.9 }], legs: [{ hip: -0.35, kn: -0.35 }, { hip: 0.3, kn: -0.3 }] },
        flare:  { hipY: -0.1 * e, lean: -0.3 * e, headX: -0.3 * e, drop: 0.3 * e, arms: [{ sh: 0.8, el: -0.5, z: 0.8 }, { sh: 0.7, el: -0.5, z: -0.8 }], legs: [{ hip: -0.25, kn: -0.4 }, { hip: 0.25, kn: -0.3 }] },
    }
    const q = S[kind] || S.stitch
    const r = rig
    r.body.rotation.x = ease(q.drop) * Math.PI / 2
    r.body.position.y = q.hipY - ease(q.drop) * 0.42
    r.torso.rotation.x = q.lean
    r.head.rotation.x = q.headX
    r.armR.sh.rotation.x = q.arms[0].sh; r.armR.sh.rotation.z = q.arms[0].z; r.armR.el.rotation.x = q.arms[0].el
    r.armL.sh.rotation.x = q.arms[1].sh; r.armL.sh.rotation.z = q.arms[1].z; r.armL.el.rotation.x = q.arms[1].el
    r.legR.hip.rotation.x = q.legs[0].hip; r.legR.kn.rotation.x = q.legs[0].kn
    r.legL.hip.rotation.x = q.legs[1].hip; r.legL.kn.rotation.x = q.legs[1].kn
}

// -- stage -------------------------------------------------------------------------
export function buildStage(scene, stage) {
    const grp = new THREE.Group()
    const r = mulberry(stage.id.length * 7919 + stage.name.length)
    let moltenFx = null, rainFx = null, sweepFx = null

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 26), new THREE.MeshStandardMaterial({ map: asphaltTex(stage.ground, stage.groundLine, 1234), roughness: 0.92 }))
    floor.rotation.x = -Math.PI / 2; grp.add(floor)

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 18), std(0x14141c, { rough: 0.95 }))
    wall.position.set(0, 8, -9); grp.add(wall)

    const fence = new THREE.Mesh(new THREE.PlaneGeometry(46, 5), new THREE.MeshStandardMaterial({ map: fenceTex(), transparent: true, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide }))
    fence.position.set(0, 4.5, -6.2); grp.add(fence)
    for (const px of [-14, -7, 0, 7, 14]) {
        const post = limb(CYL, 0.07, 7, std(0x2a2d34, { metal: 0.7 }), px, 3.5, -6.2)
        grp.add(post)
    }

    for (const s of stage.neonSigns) {
        if (!s.label) continue
        const tex = signTex(s.label, `#${s.c.toString(16).padStart(6, '0')}`)
        const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }))
        m.position.set(s.x, s.y, -8.7); grp.add(m)
        const glow = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: s.c, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }))
        glow.scale.set(s.w * 1.5, s.h * 2.2, 0.01); glow.position.set(s.x, s.y, -8.8); grp.add(glow)
    }

    if (stage.props === 'dumpster') {
        const ds = new THREE.Group()
        const body = new THREE.Mesh(BOX, std(0x2f4a38, { rough: 0.8, metal: 0.2 })); body.scale.set(3, 1.6, 1.4); ds.add(body)
        const lid = new THREE.Mesh(BOX, std(0x27402f, { rough: 0.8, metal: 0.2 })); lid.scale.set(3.1, 0.15, 1.5); lid.position.y = 0.88; ds.add(lid)
        ds.position.set(-9.5, 0.8, -4.5); grp.add(ds)
        const bag = new THREE.Mesh(CAPS, std(0x1c1e22)); bag.scale.set(0.35, 0.4, 0.35); bag.position.set(-7.6, 0.35, -4.2); grp.add(bag)
        const RN = 90
        const rGeo = new THREE.BufferGeometry()
        const rpos = new Float32Array(RN * 6)
        const rvel = []
        for (let i = 0; i < RN; i++) {
            const x = (r() - 0.5) * 30, y = r() * 10, z = -6 + r() * 7
            rpos[i * 6] = x; rpos[i * 6 + 1] = y; rpos[i * 6 + 2] = z
            rpos[i * 6 + 3] = x - 0.08; rpos[i * 6 + 4] = y - 0.35; rpos[i * 6 + 5] = z
            rvel.push(6 + r() * 5)
        }
        rGeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3))
        const rain = new THREE.LineSegments(rGeo, new THREE.LineBasicMaterial({ color: 0x8fa8c8, transparent: true, opacity: 0.3 }))
        grp.add(rain)
        rainFx = { geo: rGeo, vel: rvel, n: RN, fallen: 0, last: -1 }
    } else if (stage.props === 'girders') {
        const gm = std(0x4a3226, { metal: 0.6, rough: 0.5 })
        for (const px of [-11, 11]) grp.add(limb(CYL, 0.28, 12, gm, px, 6, -7))
        const beam = limb(CYL, 0.22, 24, gm, 0, 11, -7); beam.rotation.z = Math.PI / 2; grp.add(beam)
        const moltenMat = new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
        const molten = new THREE.Mesh(PLANE, moltenMat)
        molten.rotation.x = -Math.PI / 2; molten.position.set(0, 0.03, -5); molten.scale.set(6, 2, 1); grp.add(molten)
        const moltenLight = new THREE.PointLight(0xff6a20, 0, 9, 1.6)
        moltenLight.position.set(0, 1.1, -4)
        grp.add(moltenLight)
        moltenFx = { mat: moltenMat, light: moltenLight }
    } else {
        const wm = std(0x2c3038, { rough: 0.5 })
        for (let i = 0; i < 5; i++) {
            const t = new THREE.Mesh(BOX, wm); t.scale.set(8, 2.2, 0.2); t.position.set(-16 + i * 8, 2.6, -8.5); grp.add(t)
        }
        const train = new THREE.Mesh(BOX, std(0x3a3f4a, { metal: 0.6, rough: 0.35 })); train.scale.set(40, 3, 2); train.position.set(0, 1.9, -7.6); grp.add(train)
        const wins = []
        for (let i = 0; i < 6; i++) {
            const win = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.8 }))
            win.position.set(-15 + i * 6, 2.3, -6.55); win.scale.set(2.4, 1.1, 1); grp.add(win)
            wins.push(win)
        }
        const sweepLight = new THREE.PointLight(0xdce8ff, 0, 18, 1.2)
        sweepLight.position.set(-15, 2.2, -4.5)
        sweepLight.visible = false
        grp.add(sweepLight)
        sweepFx = { light: sweepLight, wins, phase: r() * 30, period: 24 + r() * 12, dur: 4.5, force: -1, prog: -1 }
    }

    const crowd = []
    for (let i = 0; i < 26; i++) {
        const m = new THREE.Mesh(CAPS, std(stage.crowd, { rough: 1 }))
        const px = -13 + i + r() * 0.8
        m.scale.set(0.5, 0.7 + r() * 0.25, 0.4)
        m.position.set(px, 1.1 + (r() > 0.5 ? 0.2 : 0), -7.4 - r() * 0.6)
        crowd.push({ mesh: m, phase: r() * 6.28, speed: 1.4 + r() * 1.6, lit: r() < 0.25 })
        grp.add(m)
        if (r() < 0.3) {
            const ph = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: stage.crowdLit, transparent: true, opacity: 0.9 }))
            ph.scale.set(0.08, 0.12, 0.02)
            ph.position.set(px + 0.28, 1.5, m.position.z + 0.25)
            crowd[crowd.length - 1].phone = ph
        }
    }

    const lamps = []
    for (const lx of stage.lamps) {
        const pts = new THREE.PointLight(stage.lampColor, 26, 16, 1.8)
        pts.position.set(lx, 5.4, 1.5)
        grp.add(pts)
        const cord = limb(CYL, 0.03, 2.4, std(0x101014), lx, 6.8, 1.5); grp.add(cord)
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.5, 12, 1, true), std(0x1a1c22, { metal: 0.5 }))
        shade.position.set(lx, 5.7, 1.5); grp.add(shade)
        const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5.4, 16, 1, true), new THREE.MeshBasicMaterial({ color: stage.lampColor, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
        cone.position.set(lx, 2.7, 1.5); lamps.push({ pts, cone, phase: r() * 6.28 }); grp.add(cone)
    }

    const N = stage.props === 'girders' ? 90 : 50
    const pGeo = new THREE.BufferGeometry()
    const pos = new Float32Array(N * 3)
    const vel = []
    for (let i = 0; i < N; i++) {
        pos[i * 3] = (r() - 0.5) * 26
        pos[i * 3 + 1] = r() * 8
        pos[i * 3 + 2] = -6 + r() * 5
        vel.push(0.004 + r() * 0.012)
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const pMat = new THREE.PointsMaterial({ color: stage.props === 'girders' ? 0xff8a30 : 0x9aa0b0, size: 0.06, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    const particles = new THREE.Points(pGeo, pMat)
    grp.add(particles)

    scene.add(grp)
    return { grp, crowd, lamps, particles, vel, stage, molten: moltenFx, rain: rainFx, sweep: sweepFx }
}

// -- scene -------------------------------------------------------------------------
export function createScene(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x0a0c12, 0.05)
    const cam = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 120)
    cam.position.set(0, 2.4, 13)

    scene.add(new THREE.HemisphereLight(0x30364a, 0x0c0a08, 0.55))

    const sparks = []
    const sparkGeo = new THREE.SphereGeometry(0.12, 6, 5)

    return {
        renderer, scene, cam,
        resize(w, h) { renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix() },
        spark(x, y, color) {
            for (let i = 0; i < 6; i++) {
                const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
                const a = Math.random() * Math.PI * 2
                m.position.set(x, y, 0.3)
                scene.add(m)
                sparks.push({ mesh: m, t: 14, vx: Math.cos(a) * 0.06, vy: Math.sin(a) * 0.05 + 0.03 })
            }
        },
        sync(m, rigs, stageFx, tSec, shake, cine) {
            const [fa, fb] = m.fighters
            const mid = (fa.x + fb.x) / 2
            const dist = Math.abs(fa.x - fb.x)
            const baseZ = clamp(10.5 + dist * 0.85, 10.5, 15.5)
            cam.position.x = mid
            cam.position.z = Math.max(5.5, baseZ - (cine ? cine.zoom : 0))
            cam.position.y = 2.4 + (shake || 0) * 0.04 - (cine ? 0.5 * Math.sin(Math.PI * (cine.k || 0)) : 0)
            cam.lookAt(mid, 1.5, 0)
            if (shake) {
                cam.position.x += (Math.random() - 0.5) * shake * 0.06
                cam.position.y += (Math.random() - 0.5) * shake * 0.04
            }
            for (let i = 0; i < 2; i++) {
                const f = m.fighters[i], rig = rigs[i]
                rig.root.position.x = f.x
                rig.root.rotation.y = f.facing === 1 ? -Math.PI / 2 : Math.PI / 2
                if (cine && cine.side === i) poseFinisherBeat(rig, cine.kind, cine.k)
                else poseFighter(rig, f, tSec)
                rig.shadow.position.x = f.x
                const air = clamp(1 - f.y * 0.25, 0.4, 1)
                rig.shadow.scale.set(0.8 * f.def.build.bulk * air, 1.3 * air, 1)
                rig.shadow.material.opacity = 0.42 * air
            }
            if (stageFx) {
                for (const c of stageFx.crowd) {
                    c.mesh.position.y += Math.sin(tSec * c.speed + c.phase) * 0.0025
                    if (c.phone) c.phone.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(tSec * (c.speed * 0.5) + c.phase))
                }
                for (const l of stageFx.lamps) {
                    const fl = 0.85 + 0.15 * Math.sin(tSec * 9 + l.phase) * (Math.sin(tSec * 0.7) > 0.9 ? 1 : 0.25)
                    l.pts.intensity = 26 * fl
                    l.cone.material.opacity = 0.05 * fl
                }
                const pos = stageFx.particles.geometry.attributes.position
                for (let i = 0; i < stageFx.vel.length; i++) {
                    pos.array[i * 3 + 1] += stageFx.vel[i]
                    if (pos.array[i * 3 + 1] > 9) { pos.array[i * 3 + 1] = 0.2; pos.array[i * 3] = (Math.random() - 0.5) * 26 }
                }
                pos.needsUpdate = true
                if (stageFx.molten) {
                    // the melt breathes: a slow pulse under a fast shimmer, and
                    // the pool's light falls on the floor and the fighters
                    const pulse = 0.5 + 0.5 * Math.sin(tSec * 1.4)
                    const flick = Math.sin(tSec * 13.7) * Math.sin(tSec * 5.1)
                    const e = 0.3 + 0.45 * pulse + 0.25 * flick
                    stageFx.molten.mat.opacity = 0.3 + 0.4 * e
                    stageFx.molten.light.intensity = 6 + 22 * e
                }
                if (stageFx.rain) {
                    const rn = stageFx.rain
                    const d = Math.max(0, Math.min(0.1, tSec - (rn.last >= 0 ? rn.last : tSec)))
                    rn.last = tSec
                    const rp = rn.geo.attributes.position
                    for (let i = 0; i < rn.n; i++) {
                        const dy = rn.vel[i] * d
                        rp.array[i * 6] -= dy * 0.22
                        rp.array[i * 6 + 1] -= dy
                        rp.array[i * 6 + 3] -= dy * 0.22
                        rp.array[i * 6 + 4] -= dy
                        if (rp.array[i * 6 + 4] < 0.1) {
                            const nx = (Math.random() - 0.5) * 30
                            const ny = 9 + Math.random() * 1.5
                            rp.array[i * 6] = nx; rp.array[i * 6 + 1] = ny
                            rp.array[i * 6 + 3] = nx - 0.08; rp.array[i * 6 + 4] = ny - 0.35
                        }
                        rn.fallen += dy
                    }
                    rp.needsUpdate = true
                }
                if (stageFx.sweep) {
                    // a train passes the platform every so often: its headlight
                    // sweeps across the pit and the car windows flash bright
                    const s = stageFx.sweep
                    let t = -1
                    if (s.force >= 0) { t = tSec - s.force; if (t >= s.dur) s.force = -1 }
                    if (t < 0) { const cy = (tSec + s.phase) % s.period; if (cy < s.dur) t = cy }
                    if (t >= 0) {
                        const k = t / s.dur
                        s.light.visible = true
                        s.light.position.x = -15 + k * 30
                        s.light.intensity = 34 * Math.sin(Math.PI * k)
                        for (const w of s.wins) w.material.opacity = 0.75 + 0.25 * Math.sin(Math.PI * k)
                        s.prog = k
                    } else {
                        s.light.visible = false
                        s.prog = -1
                    }
                }
            }
            for (let i = sparks.length - 1; i >= 0; i--) {
                const s = sparks[i]
                s.t--
                s.mesh.position.x += s.vx; s.mesh.position.y += s.vy; s.vy -= 0.004
                s.mesh.material.opacity = s.t / 14
                if (s.t <= 0) { scene.remove(s.mesh); sparks.splice(i, 1) }
            }
        },
        render() { renderer.render(scene, cam) },
    }
}
