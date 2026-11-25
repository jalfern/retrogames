// GRIND CITY — the MODERN look, generated in code.
// The park mesh is triangulated from parkHeight: the drawn park IS the
// ridden park. Everything else (letters, skater rig, particles) is code too.

import * as THREE from 'three'
import { parkHeight, gradAt, RAILS, LETTERS, GEMS, BOUND, ROOF_Y, railClosest, SECRET, shadeAt } from './park.js'

const RANGE = BOUND + 4          // a little beyond the walls
const STEP = 0.8

// hash noise for tint variation (visual only)
function n2(x, z) {
    let h = Math.imul((x * 374761393 + z * 668265263) | 0, 1274126177)
    h = (h ^ (h >>> 13)) >>> 0
    return (h % 1000) / 1000
}

// deterministic hash for baked-in speckle (no Math.random — art is stable frame to frame)
function rnd01(i) {
    let h = Math.imul(i ^ 0x9e3779b9, 1274126177)
    h = (h ^ (h >>> 13)) >>> 0
    return (h % 1000) / 1000
}

function concreteColor(x, z, y, out) {
    const g = gradAt(x, z)
    const slope = Math.hypot(g.gx, g.gz)
    let r = 0.92, gr = 0.88, b = 0.80                      // sun-baked concrete
    if (y < -0.2) { const d = Math.min(1, -y / 5); r -= d * 0.34; gr -= d * 0.30; b -= d * 0.14 }  // bowls darken cool
    if (y > 1.5) { r += 0.05; gr += 0.04 }                 // decks catch sun
    if (slope > 0.5) { r -= 0.10; gr -= 0.10; b -= 0.04 }   // steep walls shade
    // mod-park accents: kicker faces get a warm tint
    if (x > 10 && x < 15.2 && z > -8 && z < 4.6 && y > 0.15) { r = 0.86; gr = 0.42; b = 0.20 }
    if (x > -3.5 && x < 13.5 && y > 0.15 && y < 1.1 && z > 1 && z < 4.6) { r = 0.86; gr = 0.42; b = 0.20 }
    // low-frequency mottling (~2.5 m cells, ±6%)
    const low = n2(Math.round(x * 0.4), Math.round(z * 0.4))
    const m = 0.94 + low * 0.12
    r *= m; gr *= m; b *= m
    // fine grain (~0.2 m cells, ±6%)
    const v = 0.94 + n2(Math.round(x * 5), Math.round(z * 5)) * 0.12
    // wear near rails: packed darker where skaters grind (visual only)
    let wear = 1
    for (const rail of RAILS) {
        const d = railClosest(rail, x, z).d
        if (d < 0.85) wear = Math.min(wear, 1 - (1 - d / 0.85) * 0.28)
    }
    return out.setRGB(r * v * wear, gr * v * wear, b * v * wear)
}

/** Baked-in concrete texture: speckle, mottled patches, hairline cracks, and
 *  thin expansion joints at the tile border (4 m tile). Neutral-bright on
 *  purpose — it multiplies the vertex colors, so it must not darken the park. */
function makeConcreteTexture() {
    const S = 256
    const cv = document.createElement('canvas')
    cv.width = cv.height = S
    const g = cv.getContext('2d')
    g.fillStyle = '#f4f2ec'
    g.fillRect(0, 0, S, S)
    // large soft mottled patches
    for (let i = 0; i < 30; i++) {
        const bx = rnd01(i * 3 + 1) * S, by = rnd01(i * 3 + 2) * S
        const br = 18 + rnd01(i * 3 + 3) * 52
        const dark = rnd01(i * 7) < 0.5
        const alpha = 0.05 + rnd01(i * 11) * 0.05
        const grad = g.createRadialGradient(bx, by, 0, bx, by, br)
        grad.addColorStop(0, dark ? `rgba(118,110,96,${alpha})` : `rgba(255,255,255,${alpha})`)
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        g.fillStyle = grad
        g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill()
    }
    // speckle grain
    for (let i = 0; i < 3400; i++) {
        const x = rnd01(i * 3 + 1) * S, y = rnd01(i * 3 + 2) * S
        const dark = rnd01(i * 3 + 3) < 0.55
        g.fillStyle = dark ? `rgba(96,89,78,${0.08 + rnd01(i) * 0.16})` : `rgba(255,255,255,${0.10 + rnd01(i) * 0.20})`
        g.fillRect(x, y, rnd01(i * 5) < 0.9 ? 1 : 2, 1)
    }
    // hairline cracks
    g.strokeStyle = 'rgba(82,77,70,0.30)'
    g.lineWidth = 1
    for (let i = 0; i < 3; i++) {
        let cx = rnd01(i * 13 + 1) * S, cy = rnd01(i * 13 + 2) * S * 0.4
        g.beginPath(); g.moveTo(cx, cy)
        for (let j = 0; j < 6; j++) {
            cx += (rnd01(i * 17 + j) - 0.5) * 30
            cy += 14 + rnd01(i * 19 + j) * 18
            g.lineTo(cx, cy)
        }
        g.stroke()
    }
    // expansion joints at the tile border (thin — no wireframe look)
    g.fillStyle = 'rgba(72,68,62,0.5)'
    g.fillRect(0, 0, S, 1.5); g.fillRect(0, S - 1.5, S, 1.5)
    g.fillRect(0, 0, 1.5, S); g.fillRect(S - 1.5, 0, 1.5, S)
    const tex = new THREE.CanvasTexture(cv)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = 4
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
}

export function buildPark(scene) {
    const N = Math.ceil((RANGE * 2) / STEP)
    const pos = new Float32Array((N + 1) * (N + 1) * 3)
    const col = new Float32Array((N + 1) * (N + 1) * 3)
    const idx = []
    const c = new THREE.Color()
    let p = 0
    for (let i = 0; i <= N; i++) {
        for (let j = 0; j <= N; j++) {
            const x = -RANGE + i * STEP, z = -RANGE + j * STEP
            const y = parkHeight(x, z)
            pos[p] = x; pos[p + 1] = y; pos[p + 2] = z
            concreteColor(x, z, y, c)
            // baked curvature AO (#3233): transitions darken cool (the same law
            // as the bowl depth tint), crowns warm slightly into the sun.
            const ao = shadeAt(x, z)
            const dk = Math.min(1, ao), lt = Math.max(1, ao)
            col[p] = c.r * dk * lt
            col[p + 1] = c.g * dk * (1 + (lt - 1) * 0.75)
            col[p + 2] = c.b * (dk + (1 - dk) * 0.45) * (1 + (lt - 1) * 0.35)
            p += 3
        }
    }
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            const a = i * (N + 1) + j, b = a + 1, d = a + (N + 1), e = d + 1
            idx.push(a, d, b, b, d, e)
        }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    // 4 m-tiling UVs for the concrete texture
    const uv = new Float32Array((N + 1) * (N + 1) * 2)
    let u = 0
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        uv[u++] = (-RANGE + i * STEP) / 4
        uv[u++] = (-RANGE + j * STEP) / 4
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setIndex(idx)
    // analytic up-facing normals: n = normalize(-dh/dx, 1, -dh/dz)
    const nrm = new Float32Array(pos.length)
    {
        const e = 0.3
        let q = 0
        for (let i = 0; i <= N; i++) {
            for (let j = 0; j <= N; j++) {
                const x = -RANGE + i * STEP, z = -RANGE + j * STEP
                const gx = (parkHeight(x + e, z) - parkHeight(x - e, z)) / (2 * e)
                const gz = (parkHeight(x, z + e) - parkHeight(x, z - e)) / (2 * e)
                const L = Math.hypot(gx, 1, gz)
                nrm[q] = -gx / L; nrm[q + 1] = 1 / L; nrm[q + 2] = -gz / L
                q += 3
            }
        }
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
    // DoubleSide: the grid winding covers slopes either way; normals are set
    // explicitly up, so both faces shade identically.
    // The same canvas doubles as the bump map: speckle + joints get micro-relief
    // where the sun rakes the surface, so the texture sits IN the concrete.
    const concreteTex = makeConcreteTexture()
    const mat = new THREE.MeshStandardMaterial({ map: concreteTex, bumpMap: concreteTex, bumpScale: 0.5, vertexColors: true, roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.receiveShadow = true
    scene.add(mesh)

    // rails
    const railMat = new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.32, metalness: 0.85 })
    const capMat = new THREE.MeshStandardMaterial({ color: 0xf2b13c, roughness: 0.5, metalness: 0.4 })
    for (const r of RAILS) {
        const a = new THREE.Vector3(r.ax, r.ay, r.az), b = new THREE.Vector3(r.bx, r.by, r.bz)
        const len = a.distanceTo(b)
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, len, 10), railMat)
        bar.position.copy(a).lerp(b, 0.5)
        bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
        bar.castShadow = true
        scene.add(bar)
        for (const t of [0.18, 0.5, 0.82]) {
            const p0 = a.clone().lerp(b, t)
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, p0.y, 0.07), railMat)
            foot.position.set(p0.x, p0.y / 2, p0.z)
            scene.add(foot)
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), capMat)
            cap.position.copy(p0)
            scene.add(cap)
        }
    }
    return mesh
}

export function buildSky(scene) {
    // graded dusk-free SoCal sky: canvas gradient on a big dome
    const cv = document.createElement('canvas')
    cv.width = 16; cv.height = 256
    const g = cv.getContext('2d')
    const grad = g.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#2e6fd4')
    grad.addColorStop(0.45, '#7db4e8')
    grad.addColorStop(0.75, '#cfe3f2')
    grad.addColorStop(1, '#f4e9d0')
    g.fillStyle = grad
    g.fillRect(0, 0, 16, 256)
    const tex = new THREE.CanvasTexture(cv)
    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(260, 24, 12),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
    )
    scene.add(dome)
    // low sun + glow
    const sun = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }))
    sun.position.set(-120, 60, 180)
    scene.add(sun)
    return dome
}

// ── the roof line: painted chevron stripe up the quarterpipe face ────────
// The second line (#3246) rides the crest of the south wall, but before this
// pass the wall read like poured plaza concrete — a player could miss that
// it is rideable. This is visual-only: the ribbon samples the same
// parkHeight the physics rides (zero gameplay change), hugs the surface
// with a thin paint lift and faces the plaza, so the read survives the
// chase cam. Chevrons point up the face toward the crest.
function makeRoofChevronTexture() {
    const S = 256
    const cv = document.createElement('canvas')
    cv.width = cv.height = S
    const g = cv.getContext('2d')
    g.lineJoin = 'round'; g.lineCap = 'round'
    // one crisp chevron per tile, pointing toward v=1 (the crest)
    const pts = () => { g.beginPath(); g.moveTo(30, 176); g.lineTo(128, 48); g.lineTo(226, 176) }
    g.strokeStyle = 'rgba(24,22,19,0.92)'; g.lineWidth = 38; pts(); g.stroke()   // outline
    g.strokeStyle = '#f2a93c'; g.lineWidth = 20; pts(); g.stroke()   // paint
    const tex = new THREE.CanvasTexture(cv)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = 4
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
}

export function buildRoofLine(scene) {
    const X0 = -29.5, X1 = -4.7, Z0 = 8.15, Z1 = 14.15
    const NX = 16, NZ = 18
    const pos = new Float32Array((NX + 1) * (NZ + 1) * 3)
    const uv = new Float32Array((NX + 1) * (NZ + 1) * 2)
    const idx = []
    let p = 0, q = 0
    for (let i = 0; i <= NX; i++) {
        for (let j = 0; j <= NZ; j++) {
            const x = X0 + (X1 - X0) * (i / NX)
            const z = Z0 + (Z1 - Z0) * (j / NZ)
            const y = parkHeight(x, z) + 0.05
            pos[p++] = x; pos[p++] = y; pos[p++] = z
            // u tiles every 2.4 m across the face, v marches up the face in
            // ~4 steps (v=1 toward the crest)
            uv[q++] = (x - X0) / 2.4
            uv[q++] = (j / NZ) * 4
        }
    }
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
        const a = i * (NZ + 1) + j, b = (i + 1) * (NZ + 1) + j, d = a + 1, e = b + 1
        idx.push(a, d, b, b, d, e)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setIndex(idx)
    const mat = new THREE.MeshBasicMaterial({
        map: makeRoofChevronTexture(),
        transparent: true,
        side: THREE.DoubleSide,
        fog: false,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = 3
    scene.add(mesh)

    // UP marker floating over the crest — the readable "the roof deck is a
    // line too" cue. Original canvas art, like everything else here.
    const cv = document.createElement('canvas')
    cv.width = cv.height = 256
    const g = cv.getContext('2d')
    g.fillStyle = 'rgba(24,22,19,0.55)'
    g.fillRect(26, 60, 204, 120)
    g.strokeStyle = '#f2a93c'; g.lineWidth = 8; g.strokeRect(26, 60, 204, 120)
    g.font = 'bold 88px sans-serif'
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillStyle = '#ffd35e'
    g.fillText('▲ UP', 128, 122)
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    const marker = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 2.2),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, side: THREE.DoubleSide, depthWrite: false })
    )
    marker.position.set(-17, ROOF_Y + 0.8, 14.6)
    marker.rotation.y = Math.PI
    marker.userData.baseY = ROOF_Y + 0.8
    scene.add(marker)
    return { mesh, marker }
}

// ── letters S-K-A-T-E as gold sprite cards, spinning ─────────────────────
export function buildLetters(scene) {
    return LETTERS.map(l => {
        const cv = document.createElement('canvas')
        cv.width = cv.height = 128
        const g = cv.getContext('2d')
        g.font = 'bold 92px sans-serif'
        g.textAlign = 'center'; g.textBaseline = 'middle'
        g.lineWidth = 10; g.strokeStyle = '#6b3c00'
        g.strokeText(l.k, 64, 70)
        const grad = g.createLinearGradient(0, 20, 0, 110)
        grad.addColorStop(0, '#ffe98a'); grad.addColorStop(1, '#f2a93c')
        g.fillStyle = grad
        g.fillText(l.k, 64, 70)
        const tex = new THREE.CanvasTexture(cv)
        const sp = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }))
        sp.position.set(l.x, l.y + 0.6, l.z)
        scene.add(sp)
        const glow = new THREE.PointLight(0xffc860, 0.6, 4)
        glow.position.copy(sp.position)
        scene.add(glow)
        return { sp, glow, got: false }
    })
}

// ── gems (#3246): score-mode objects, spinning octahedra ──────────────────
// Emissive-only, no per-gem lights — fourteen point lights would flatten the
// frame budget on software-rendered CI Chrome. #3233 adds a 4-point-star
// idle glint per gem: one shared canvas texture, one SpriteMaterial per gem
// so each can fade independently. Additive so it reads as light, not paint.
export function makeStarTexture() {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')
    ctx.translate(32, 32)
    // 4-point star — a tapered, gently bulging diamond pair
    ctx.beginPath()
    ctx.moveTo(0, -30)
    ctx.quadraticCurveTo(5, -5, 30, 0)
    ctx.quadraticCurveTo(5, 5, 0, 30)
    ctx.quadraticCurveTo(-5, 5, -30, 0)
    ctx.quadraticCurveTo(-5, -5, 0, -30)
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 31)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.35, 'rgba(215,255,235,0.85)')
    grad.addColorStop(1, 'rgba(120,255,190,0)')
    ctx.fillStyle = grad
    ctx.fill()
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
}

export function buildGems(scene) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8dffc0, emissive: 0x1fa866, roughness: 0.2, metalness: 0.5 })
    const starTex = makeStarTexture()
    return GEMS.map((g, i) => {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), mat)
        m.position.set(g.x, g.y, g.z)
        m.castShadow = true
        scene.add(m)
        const glint = new THREE.Sprite(new THREE.SpriteMaterial({
            map: starTex, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }))
        glint.position.set(g.x, g.y, g.z)
        glint.scale.setScalar(0.5)
        glint.renderOrder = 10
        scene.add(glint)
        return { mesh: m, glint, y: g.y, phase: i * 0.9 }
    })
}

// ── secret-bowl foreshadowing (#3233 tail) ─────────────────────────────────
// The secret bowl is hidden by design — its find is the reward. This is only
// a faint, slow shimmer at the western lip of the bowl: something is out
// there east, but not exactly where. No sign, no arrow — a hint the player
// notices when she skates that way, then tries to find out.
export function buildSecretHint(scene) {
    const tex = makeStarTexture()
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }))
    sprite.position.set(SECRET.x - SECRET.r - 0.3, 1.1, SECRET.z)
    sprite.userData.baseY = 1.1
    sprite.scale.setScalar(0.85)
    sprite.renderOrder = 9
    scene.add(sprite)
    return { sprite }
}

// ── the skater rig ────────────────────────────────────────────────────────
export function buildSkater(scene) {
    const g = new THREE.Group()
    const deck = new THREE.Group()
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x18b9a5, roughness: 0.55 })
    const grip = new THREE.MeshStandardMaterial({ color: 0x22242c, roughness: 0.95 })
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.055, 0.24), deckMat)
    deck.add(board)
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.012, 0.2), grip)
    tape.position.y = 0.035
    deck.add(tape)
    for (const s of [-1, 1]) {
        const kick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.22), deckMat)
        kick.position.set(s * 0.46, 0.05, 0)
        kick.rotation.z = -s * 0.5
        deck.add(kick)
    }
    const truckMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.7, roughness: 0.35 })
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0xf7d948, roughness: 0.6 })
    const wheels = []
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const tr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.16), truckMat)
        tr.position.set(sx * 0.26, -0.07, 0)
        deck.add(tr)
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.05, 12), wheelMat)
        w.rotation.x = Math.PI / 2
        w.position.set(sx * 0.26, -0.09, sz * 0.12)
        deck.add(w); wheels.push(w)
    }
    g.add(deck)

    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 })
    const hoodie = new THREE.MeshStandardMaterial({ color: 0xd7332e, roughness: 0.85 })
    const denim = new THREE.MeshStandardMaterial({ color: 0x2c4a7c, roughness: 0.9 })
    const cap = new THREE.MeshStandardMaterial({ color: 0xf7a51b, roughness: 0.7 })

    const legs = []
    for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.14), denim)
        leg.position.set(sx * 0.12, 0.28, sx * 0.16)
        g.add(leg); legs.push(leg)
    }
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.2), hoodie)
    torso.position.set(0, 0.68, 0.05)
    g.add(torso)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin)
    head.position.set(0, 1.0, 0.05)
    g.add(head)
    const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap)
    capTop.position.copy(head.position)
    capTop.position.y += 0.02
    g.add(capTop)
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.16), cap)
    brim.position.set(0.14, head.position.y + 0.04, 0)
    g.add(brim)
    const arms = []
    for (const sx of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.4, 0.09), hoodie)
        arm.position.set(sx * 0.26, 0.66, 0.05)
        g.add(arm); arms.push(arm)
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true })
    scene.add(g)
    return { g, deck, legs, arms, head, capTop, brim, wheels }
}

/** Pose the rig for the sim state (call every rendered frame). */
export function poseSkater(rig, s, t) {
    const { g, deck, legs, arms } = rig
    g.position.set(s.x, s.y + 0.12, s.z)
    g.rotation.y = -s.heading
    g.rotation.z = 0                                     // reset per frame (spin sway)
    const crouch = s.manual ? 0.08 : 0.12
    let deckTilt = 0, deckRoll = 0, deckFlip = 0, armOut = 0.35, grabArm = 0
    // manuals: normal and 180 read differently — normal stays low and steady,
    // the 180 leans into the steer with wide arms and a wobbly deck.
    if (s.manual) {
        if (s.manual.spin) {
            deckTilt = -0.5
            armOut = 1.45
            deckRoll = Math.sin(t * 16) * 0.22
            g.rotation.z = Math.sin(t * 9) * 0.07
            g.rotation.y = -s.heading + (s.manual.steer || 1) * 0.14
        } else {
            deckTilt = -0.42
            armOut = 1.05
            deckRoll = Math.sin(t * 7) * 0.05
        }
    }
    if (s.air) {
        deckTilt = s.vy > 0 ? -0.22 : 0.15
        const at = s.airTrick
        if (at) {
            if (at.grab) { grabArm = 1; deckTilt = -0.35 }
            if (at.flip) deckFlip = (at.flipRot || 0) * Math.PI / 180
        }
        armOut = 0.9
    }
    if (s.grind) { deckRoll = Math.sin(t * 40) * 0.05 + 0.1; armOut = 1.15 }
    if (s.phase === 'tumble') {
        g.rotation.x = t * 9
        g.position.y = s.y + 0.3 + Math.abs(Math.sin(t * 6)) * 0.4
        armOut = 1.5
    } else g.rotation.x = 0
    deck.rotation.x = deckTilt
    deck.rotation.z = deckRoll
    deck.rotation.y = deckFlip
    const c = s.phase === 'tumble' ? 0.2 : crouch
    legs[0].scale.y = 1 - c * 0.8; legs[1].scale.y = 1 - c * 0.8
    legs[0].position.y = 0.28 - c * 0.16; legs[1].position.y = 0.28 - c * 0.16
    arms[0].rotation.z = armOut
    arms[1].rotation.z = -armOut
    if (grabArm) { arms[0].rotation.z = 2.1; arms[0].position.y = 0.42 } else arms[0].position.y = 0.66
    // wheels spin with speed
    const spin = (s.speed || 0) * 0.06
    for (const w of rig.wheels) w.rotation.y += spin
}

// ── particles: grind sparks + carving spray ───────────────────────────────
export function buildParticles(scene) {
    const mk = (n, color, size) => {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
        const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.9, fog: false })
        const pts = new THREE.Points(geo, mat)
        pts.frustumCulled = false
        scene.add(pts)
        return { pts, pool: Array.from({ length: n }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 })), head: 0, geo }
    }
    return { sparks: mk(220, 0xffc850, 0.14), spray: mk(160, 0xe8ecf0, 0.16), burst: mk(120, 0x8dffc0, 0.16) }
}

// Radial pickup burst (#3233) — gems vanish, sparks fly outward in every
// direction instead of one direction. n particles, each with its own random
// horizontal heading; the pool wraps, so bursts never run dry.
export function burst(p, x, y, z, n = 16) {
    for (let k = 0; k < n; k++) {
        const it = p.pool[p.head]
        p.head = (p.head + 1) % p.pool.length
        const a = Math.random() * Math.PI * 2
        const sp = 1.7 + Math.random() * 2.4
        it.life = 0.4 + Math.random() * 0.35
        it.x = x; it.y = y; it.z = z
        it.vx = Math.cos(a) * sp
        it.vy = 2.2 + Math.random() * 2.4
        it.vz = Math.sin(a) * sp
    }
}

export function emit(p, x, y, z, dirX, dirZ, power) {
    for (let k = 0; k < 3; k++) {
        const it = p.pool[p.head]
        p.head = (p.head + 1) % p.pool.length
        it.life = 0.35 + Math.random() * 0.25
        it.x = x; it.y = y; it.z = z
        it.vx = dirX * power + (Math.random() - 0.5) * 2
        it.vy = 1.5 + Math.random() * 2.5
        it.vz = dirZ * power + (Math.random() - 0.5) * 2
    }
}

export function stepParticles(p, dt) {
    const arr = p.geo.attributes.position.array
    for (let i = 0; i < p.pool.length; i++) {
        const it = p.pool[i]
        if (it.life > 0) {
            it.life -= dt
            it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt
            it.vy -= 9 * dt
            arr[i * 3] = it.x; arr[i * 3 + 1] = it.life > 0 ? it.y : -50; arr[i * 3 + 2] = it.z
        } else arr[i * 3 + 1] = -50
    }
    p.geo.attributes.position.needsUpdate = true
}
