// TIDAL RUSH — art.js: the bay at the MODERN bar (#3104).
// GPU sea with real sun glitter and crest foam, graded sky with a visible
// headland, procedural jetski + leaning rider, additive spray and a stitched
// foam wake. The vertex shader runs the four unrolled Gerstner slots whose
// values arrive from water.js (seaUniforms) — the SAME numbers the sim
// floats the hull on — so the drawn surface and the ridden surface are
// literally the same function, for SUNNY *and* the re-rolled STORM seas.
//
// Phone budget (SHORE's weak spot, fixed by construction): one 96×96 grid,
// unlit custom shaders, no shadow maps, one pooled Points buffer for spray +
// wake (plus a second small one for rain), pixel-ratio capped by the shell.

import * as THREE from 'three'
import { seaGLSLFront, seaUniforms, frontUniforms, sunnySea } from './water.js'
import { RX, RZ } from './sim.js' // the moorings anchor to the same ellipse the gates ride

export const SEA_COLOR_DEEP = new THREE.Color(0x0a3648)
export const SEA_COLOR_SHALLOW = new THREE.Color(0x1e93a8)
export const FOAM_COLOR = new THREE.Color(0xeef9ff)
export const SKY_TOP = new THREE.Color(0x2e6fd4)
export const SKY_HORIZON = new THREE.Color(0xcfe6ef)
export const SUN_DIR = new THREE.Vector3(-0.55, 0.42, 0.72).normalize()
// STORM BAY palette: bruised sky, leaden horizon, cold flat light
export const SKY_TOP_STORM = new THREE.Color(0x141a24)
export const SKY_HORIZON_STORM = new THREE.Color(0x46525e)

// ---- the sea ---------------------------------------------------------------
export function makeSea() {
    const SIZE = 360, SEG = 96
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG)
    geo.rotateX(-Math.PI / 2)
    const uniforms = {
        uT: { value: 0 },
        uDeep: { value: SEA_COLOR_DEEP },
        uShallow: { value: SEA_COLOR_SHALLOW },
        uFoam: { value: FOAM_COLOR },
        uSun: { value: SUN_DIR },
        uSunCol: { value: new THREE.Color(0xfff2cf) },
        uCam: { value: new THREE.Vector3() },
        uFogCol: { value: SKY_HORIZON.clone() },
        uStorm: { value: 0 },
        uFlash: { value: 0 },
    }
    const su = seaUniforms(sunnySea())
    for (const k in su) {
        uniforms[k] = { value: Array.isArray(su[k]) ? new THREE.Vector2(su[k][0], su[k][1]) : su[k] }
    }
    // rung 3: the incoming table rides in the B slots; the squall front parks
    // off-bay (weight 0 everywhere) until the sim sends one.
    const suB = seaUniforms(sunnySea(), 'B')
    for (const k in suB) {
        uniforms[k] = { value: Array.isArray(suB[k]) ? new THREE.Vector2(suB[k][0], suB[k][1]) : suB[k] }
    }
    uniforms.uFN = { value: new THREE.Vector2(0, 1) }
    uniforms.uFP = { value: -1e4 }
    uniforms.uFH = { value: 0 }
    uniforms.uFW = { value: 1 }
    const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
uniform float uT;
varying vec3 vWorld;
varying float vH;
varying vec3 vNormalW;
${seaGLSLFront()}
void main() {
  vec3 p = position;
  vec2 d;
  float h = waveHeight(p.xz, uT, d);
  p.y += h;
  p.xz += d;
  vH = p.y;
  // analytic normal from the same height function, sampled at the nominal
  // surface point (drift small vs wavelength) — the old screen-space dFdx/dFdy
  // normal was quantized by the 3.75 m triangles and read faceted at speed.
  float eps = 1.05;
  vec2 dTmp = vec2(0.0);
  float hX = waveHeight(p.xz + vec2(eps, 0.0), uT, dTmp);
  float hZ = waveHeight(p.xz + vec2(0.0, eps), uT, dTmp);
  vNormalW = normalize(vec3(-(hX - h) / eps, 1.0, -(hZ - h) / eps));
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
        fragmentShader: `
precision highp float;
uniform vec3 uDeep, uShallow, uFoam, uSun, uSunCol, uCam, uFogCol;
uniform float uT, uStorm, uFlash;
varying vec3 vWorld;
varying float vH;
varying vec3 vNormalW;
void main() {
  // smooth analytic normal (varying), not the screen-space derivative
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(uCam - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 base = mix(uDeep, uShallow, clamp(vH * 0.42 + 0.34, 0.0, 1.0));
  base = mix(base, vec3(0.13, 0.20, 0.24), uStorm * 0.55); // storm flattens the jewel tones
  vec3 sky = mix(uFogCol, vec3(0.62, 0.78, 0.92), clamp(n.y, 0.0, 1.0));
  vec3 col = mix(base, sky, fres * 0.72);
  // sun glitter: tight highlight + a wide sheen so the bay sparkles at speed
  vec3 hv = normalize(v + uSun);
  float spec = pow(max(dot(n, hv), 0.0), 180.0);
  float sheen = pow(max(dot(n, hv), 0.0), 14.0);
  col += uSunCol * (spec * 1.6 + sheen * 0.20) * (1.0 - uStorm * 0.8);
  // crest subsurface glow — teal-green at thin crest tops, under the foam;
  // the bruised storm sea swallows it, glitter and glow both fade with weather
  float crestGlow = smoothstep(0.62 - uStorm * 0.10, 1.30, vH);
  col += vec3(0.16, 0.46, 0.42) * crestGlow * 0.38 * (1.0 - uStorm * 0.65);
  // foam rides crest tops (height) with a softened band + a gentle slope term;
  // storms foam harder — crests must read white so the next kicker is visible
  float crest = smoothstep(0.95 - uStorm * 0.45, 1.42 - uStorm * 0.35, vH);
  float face = smoothstep(0.30, 0.60, 1.0 - n.y);
  float foam = clamp(crest * 0.85 + face * (0.22 + uStorm * 0.28), 0.0, 1.0);
  float tw = 0.85 + 0.15 * sin(vWorld.x * 7.3 + vWorld.z * 5.1 + uT * 9.0);
  col = mix(col, uFoam, foam * tw);
  // beach caustics (#3218): water toward the headlands reads shallow — a slow
  // twinned shimmer over a warm sand push. The literal 180.0 is half the mesh
  // span; tidalcheck pins it against SIZE and the storm gate against uStorm.
  float shoreK = length(vWorld.xz) / 180.0;
  float shallow = smoothstep(0.60, 0.95, shoreK);
  float csA = 0.5 + 0.5 * sin(vWorld.x * 1.9 + vWorld.z * 1.2 + uT * 1.35);
  float csB = 0.5 + 0.5 * sin(vWorld.x * 1.1 - vWorld.z * 2.1 - uT * 1.05 + 2.1);
  col += vec3(0.34, 0.58, 0.46) * pow(csA * csB, 2.5) * shallow * (1.0 - uStorm * 0.85);
  col = mix(col, vec3(0.64, 0.55, 0.36), shallow * 0.22 * (1.0 - uStorm * 0.7));
  // lightning paints the whole bay for a beat
  col += vec3(0.85, 0.9, 1.0) * uFlash * (0.35 + fres * 0.4);
  // distance fog to the horizon band — thicker weather in the storm
  float dist = length(uCam - vWorld);
  float fog = 1.0 - exp2(-pow(dist * mix(0.0052, 0.0095, uStorm), 2.2));
  col = mix(col, uFogCol, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    return { mesh, mat }
}

// THE BRIDGE (rung 3): this frame's outgoing table → A slots, incoming table →
// B slots, live squall front → uF* — the exact numbers the CPU hull is mixing,
// pushed the same frame. Drawn ≡ ridden across the front, not just in one sea.
export function pushSea(mat, gs) {
    const push = (su) => {
        for (const k in su) {
            const u = mat.uniforms[k]
            if (!u) continue
            if (Array.isArray(su[k])) { u.value.x = su[k][0]; u.value.y = su[k][1] }
            else u.value = su[k]
        }
    }
    push(seaUniforms(gs.seaCur))
    push(seaUniforms(gs.seaTarget, 'B'))
    push(frontUniforms(gs.front))
}

// ---- sky dome + headlands ----------------------------------------------------
export function makeSky() {
    const group = new THREE.Group()
    const skyMat = new THREE.ShaderMaterial({
        uniforms: {
            uTop: { value: SKY_TOP }, uHor: { value: SKY_HORIZON }, uSun: { value: SUN_DIR },
            uTopStorm: { value: SKY_TOP_STORM }, uHorStorm: { value: SKY_HORIZON_STORM },
            uStorm: { value: 0 }, uFlash: { value: 0 },
        },
        side: THREE.BackSide, depthWrite: false,
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * viewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
precision highp float; uniform vec3 uTop,uHor,uSun,uTopStorm,uHorStorm; varying vec3 vP;
uniform float uStorm, uFlash;
void main(){
  vec3 d = normalize(vP);
  float t = pow(clamp(d.y,0.0,1.0), 0.55);
  vec3 c = mix(mix(uHor, uTop, t), mix(uHorStorm, uTopStorm, t), uStorm);
  float s = max(dot(d, normalize(uSun)), 0.0);
  c += vec3(1.0,0.92,0.7) * (pow(s, 320.0) * 2.0 + pow(s, 18.0) * 0.35) * (1.0 - uStorm);
  // storm clouds: slow banding near the horizon + lightning underlight
  float band = 0.5 + 0.5 * sin(d.x * 9.0 + d.z * 6.0);
  c = mix(c, c * (0.72 + 0.28 * band), uStorm * smoothstep(0.0, 0.35, d.y));
  c += vec3(0.9, 0.94, 1.0) * uFlash * (0.5 + 0.5 * band);
  gl_FragColor = vec4(c,1.0);
}`,
    })
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), skyMat)
    sky.renderOrder = -10
    group.add(sky)
    group.userData.mat = skyMat

    // headlands: seeded low domes ringing the far shore, plus a beach arc the
    // start line faces. Flat-shaded, no textures — silhouettes do the work.
    const headlandMat = new THREE.MeshLambertMaterial({ color: 0x2c4f42, flatShading: true })
    const beachMat = new THREE.MeshLambertMaterial({ color: 0xe4cf9a, flatShading: true })
    const mkHill = (x, z, r, h, mat) => {
        const g = new THREE.SphereGeometry(r, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2)
        g.scale(1, h / r, 1)
        const m = new THREE.Mesh(g, mat)
        m.position.set(x, -0.4, z)
        return m
    }
    const R = 210
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.35
        const r = 26 + ((i * 37) % 23)
        group.add(mkHill(Math.cos(a) * (R + (i % 3) * 24), Math.sin(a) * (R + (i % 2) * 30), r, r * (0.35 + ((i * 53) % 40) / 90), i % 3 === 0 ? beachMat : headlandMat))
    }
    return group
}

// ---- buoys --------------------------------------------------------------------
function buoyMats(color) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.05 })
}
// Rain dims the gates (#3191): every material on a buoy lerps toward the
// storm-fog colour by k (0..1) — the same rain the hull feels is the rain you
// see through. Base colours are captured once on first apply.
const BUOY_DIM_COL = new THREE.Color(0x1c2731)
export function buoyDim(g, k) {
    g.traverse((m) => {
        if (!m.material) return
        if (m.userData.base == null) m.userData.base = m.material.color.getHex()
        m.material.color.setHex(m.userData.base).lerp(BUOY_DIM_COL, k)
    })
}

export function makeBuoy(colorHex) {
    const g = new THREE.Group()
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), buoyMats(colorHex))
    ball.position.y = 0.15
    g.add(ball)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 5), new THREE.MeshStandardMaterial({ color: 0xdadfe2, roughness: 0.6 }))
    mast.position.y = 1.5
    g.add(mast)
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshStandardMaterial({ color: colorHex, side: THREE.DoubleSide, roughness: 0.7 }))
    flag.position.set(0.58, 1.95, 0)
    g.add(flag)
    g.userData.flag = flag
    // stripe keeps the colour legible from the chase-cam at speed
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.11, 6, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }))
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.15
    g.add(ring)
    return g
}

// ---- the ski + rider -----------------------------------------------------------
export function makeSki(colorHex) {
    const root = new THREE.Group()          // world placement (y, heading)
    const tilt = new THREE.Group()         // pitch/roll from the swell
    const lean = new THREE.Group()        // rider body-lean
    root.add(tilt); tilt.add(lean)

    const hullMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.32, metalness: 0.15 })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1b232b, roughness: 0.6 })
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xf3f6f8, roughness: 0.45 })

    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), hullMat)
    hull.scale.set(0.62, 0.34, 1.9)
    hull.position.y = 0.05
    tilt.add(hull)
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.58, 1.3, 12), hullMat)
    bow.rotation.x = Math.PI / 2
    bow.scale.set(1, 1, 0.62)
    bow.position.set(0, 0.12, 2.35)
    tilt.add(bow)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.16, 1.7), deckMat)
    deck.position.set(0, 0.38, 0.15)
    tilt.add(deck)

    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), darkMat)
    bar.rotation.z = Math.PI / 2
    bar.position.set(0, 0.98, 1.05)
    tilt.add(bar)
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.66, 10), darkMat)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(0, 0.98, 1.05)
    tilt.add(wheel)

    // rider: torso/head/arms/legs — a crouched figure that leans with `lean`
    const suitMat = new THREE.MeshStandardMaterial({ color: 0x20272e, roughness: 0.55 })
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.34), new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5 }))
    vest.position.set(0, 1.12, -0.05)
    lean.add(vest)
    // head rig: a pivot at the neck so a landing can jolt it (head lag)
    const headPivot = new THREE.Group()
    headPivot.position.set(0, 1.62, 0.02)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshStandardMaterial({ color: 0xf7d9b8, roughness: 0.6 }))
    head.position.set(0, 0.04, 0)
    headPivot.add(head)
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0x18202a, roughness: 0.15, metalness: 0.4 }))
    visor.position.set(0, 0.04, 0)
    headPivot.add(visor)
    lean.add(headPivot)
    const mkLimb = (x1, y1, z1, x2, y2, z2, r, mat) => {
        const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2)
        const dir = b.clone().sub(a)
        const len = dir.length()
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat)
        m.position.copy(a).addScaledVector(dir, 0.5)
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
        return m
    }
    // legs on a hip hinge: a landing flexes them back, an airborne tuck lifts
    // them — the torso never rides the deck. Original pedestrian pose, flat
    // primitive language only.
    const lowerBody = new THREE.Group()
    lowerBody.position.set(0, 0.85, -0.1)
    const mkLeg = (sx, ex) => {
        lowerBody.add(mkLimb(sx, 0, 0, ex, -0.4, 0.8, 0.1, suitMat))
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.34), darkMat)
        foot.position.set(ex, -0.42, 0.78)
        lowerBody.add(foot)
    }
    mkLeg(-0.2, -0.3)
    mkLeg(0.2, 0.3)
    lean.add(lowerBody)
    // arms: shoulder-pivot groups that reach the bar grip — the shell turns them
    // per frame so the rider's hands keep tracking the bar through lean.
    const mkArm = (sx) => {
        const pivot = new THREE.Group()
        pivot.position.set(sx, 1.25, -0.02)
        const len = 0.64
        const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, len, 6), suitMat)
        sleeve.position.set(0, -len / 2, 0)
        pivot.add(sleeve)
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), suitMat)
        hand.position.set(0, -len, 0)
        pivot.add(hand)
        lean.add(pivot)
        return { pivot, shoulder: new THREE.Vector3(sx, 1.25, -0.02) }
    }
    const arms = [mkArm(-0.26), mkArm(0.26)]

    // boost flame: a stretched emissive cone at the stern
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.1, 8), new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.85 }))
    flame.rotation.x = -Math.PI / 2
    flame.position.set(0, 0.1, -2.3)
    flame.visible = false
    tilt.add(flame)

    return { root, tilt, lean, flame, headPivot, arms, lowerBody }
}

// ---- spray + wake: one pooled additive Points buffer ---------------------------
const spraySprite = () => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32)
    grad.addColorStop(0.0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.45, 'rgba(255,255,255,0.42)')
    grad.addColorStop(1.0, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
}

export function makeSpray(n = 700) {
    const pos = new Float32Array(n * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({
        map: spraySprite(), color: 0xf2fbff, size: 0.42, transparent: true, opacity: 0.9,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })
    const pts = new THREE.Points(geo, mat)
    pts.frustumCulled = false
    for (let i = 0; i < n; i++) pos[i * 3 + 1] = -40 // park dead particles under the sea
    const life = new Float32Array(n)
    const vel = new Float32Array(n * 3)
    const wake = new Float32Array(n) // >0 = long-life wake foam (slower fade)
    return { pts, geo, mat, pos, life, vel, wake, n, cursor: 0 }
}

export function spraySpawn(sp, x, y, z, count, spread, up, isWake, life = 0) {
    for (let k = 0; k < count; k++) {
        const i = sp.cursor; sp.cursor = (sp.cursor + 1) % sp.n
        sp.pos[i * 3] = x + (Math.random() - 0.5) * spread
        sp.pos[i * 3 + 1] = y + Math.random() * 0.2
        sp.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread
        sp.vel[i * 3] = (Math.random() - 0.5) * 3.4
        sp.vel[i * 3 + 1] = up * (0.6 + Math.random() * 0.9)
        sp.vel[i * 3 + 2] = (Math.random() - 0.5) * 3.4
        sp.life[i] = life > 0 ? life * (0.7 + Math.random() * 0.6) : (isWake ? 1.6 : 0.55 + Math.random() * 0.3)
        sp.wake[i] = isWake ? 1 : 0
    }
}

export function sprayStep(sp, dt) {
    for (let i = 0; i < sp.n; i++) {
        if (sp.life[i] <= 0) continue
        sp.life[i] -= dt
        if (sp.life[i] <= 0) { sp.pos[i * 3 + 1] = -40; continue }
        sp.vel[i * 3 + 1] -= (sp.wake[i] ? 1.2 : 7.5) * dt
        sp.pos[i * 3] += sp.vel[i * 3] * dt
        sp.pos[i * 3 + 1] += sp.vel[i * 3 + 1] * dt
        sp.pos[i * 3 + 2] += sp.vel[i * 3 + 2] * dt
    }
    sp.geo.attributes.position.needsUpdate = true
}

// ---- ribbon wake: the WR64 signature streak -------------------------------------
// Not dots — a stitched white ribbon that trails each hull: a ring buffer of
// stern points turned into a triangle strip that widens and fades as it ages.
// One small mesh per craft, additive, no depth write — phone-cheap.
// ---- handstand landing ring (#3280) -------------------------------------------
// A flat additive ring that expands + fades where a handstand slaps the bay —
// the inverted splash signature. Pooled: makeSplashRings(n), ringFlash picks a
// free one; ringStep ages them. One shared geometry, cheap per-ring material.
export function makeSplashRings(n = 3) {
    const geo = new THREE.RingGeometry(0.62, 0.84, 28)
    const rings = []
    for (let i = 0; i < n; i++) {
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: 0xbdf0ff, transparent: true, opacity: 0, side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }))
        mesh.rotation.x = -Math.PI / 2
        mesh.visible = false
        rings.push({ mesh, life: 0 })
    }
    return { rings, geo, flash: (x, y, z) => {
        const r = rings.find((q) => q.life <= 0) || rings[0]
        r.mesh.position.set(x, y, z); r.life = 1; r.mesh.visible = true
    } }
}
export function ringStep(pool, dt) {
    for (const r of pool.rings) {
        if (r.life <= 0) continue
        r.life = Math.max(0, r.life - dt * 2.1)
        const k = 1 - r.life
        r.mesh.scale.setScalar(1 + k * 5.5)
        r.mesh.material.opacity = 0.55 * r.life * r.life
        if (r.life <= 0) r.mesh.visible = false
    }
}

export function makeWake(n = 44) {
    // #3337 — the FOAM V. Three lanes per section: two bright crests and a
    // thin inner fill. The V-arms carry the broken foam (what a wake actually
    // looks like on the bay); the old ribbon painted one flat value edge to
    // edge. `seq` hands every point its own twinkle phase at emit time —
    // deterministic (no Math.random downstream), and never renumbered, so the
    // shimmer rides with the water instead of popping when the tail shifts.
    const pos = new Float32Array(n * 3 * 3)
    const col = new Float32Array(n * 3 * 4)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4))
    const idx = []
    for (let i = 0; i < n - 1; i++) {
        const a = i * 3, b = a + 3
        idx.push(a, b, b + 1, a, b + 1, a + 1) // crest-L ⇄ fill lane
        idx.push(a + 1, b + 1, b + 2, a + 1, b + 2, a + 2) // fill ⇄ crest-R lane
    }
    geo.setIndex(idx)
    geo.setDrawRange(0, 0)
    const mat = new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, depthWrite: false,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    // the disturbed-water GLOW: a wider, faint ribbon under the crests. It
    // used to be a normal-blended DARK strip that stained the bay beside the
    // trail (#3218 tail) — it is additive now, so the wake can only ever ADD
    // light to the water, never take it away.
    const dPos = new Float32Array(n * 2 * 3)
    const dCol = new Float32Array(n * 2 * 4)
    const dGeo = new THREE.BufferGeometry()
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3))
    dGeo.setAttribute('color', new THREE.BufferAttribute(dCol, 4))
    const dIdx = []
    for (let k = 0; k < n - 1; k++) {
        const a = k * 2, b = a + 1, c = a + 2, d = a + 3
        dIdx.push(a, c, b, b, c, d)
    }
    dGeo.setIndex(dIdx)
    dGeo.setDrawRange(0, 0)
    const dMat = new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, // #3337 — additive: the wake only adds light
    })
    const dMesh = new THREE.Mesh(dGeo, dMat)
    dMesh.frustumCulled = false
    dMesh.renderOrder = 1
    return { mesh, geo, mat, glowMesh: dMesh, glowGeo: dGeo, glowMat: dMat, pts: [], n, life: 2.4, seq: 0 }
}

export function wakePush(w, x, y, z, heading, width) {
    w.pts.push({ x, y: y + 0.05, z, heading, width, age: 0, ph: (w.seq++ * 1.31) % 6.283185 })
    if (w.pts.length > w.n) w.pts.shift()
}

// ---- the moorings: bay scenery inside the bounds (#3159) ----------------------
// A sunny bay is never empty water. Moored sloops and one bell buoy sit inside
// the infield, seeded from the course seed so each bay owns its anchorage and it
// holds still for the whole race. Pure geometry, original shapes — flat-shaded
// silhouettes in the headlands' language, dimmed by rain like the gates.
// The spots live here (not in sim.js) because the sim never sees them: props
// ride the drawn sea, never the ridden rules — no collisions, no gameplay.
export function boatSpots(seed) {
    let s = (seed >>> 0) || 1
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    const hulls = [0xb2472f, 0x2e6f8e, 0xd9a441]
    const out = []
    for (let i = 0; i < hulls.length; i++) {
        const a = (i / hulls.length) * Math.PI * 2 + rnd() * 1.1
        const k = 0.26 + rnd() * 0.22 // fraction inside the gate ellipse — deep infield
        out.push({
            x: RX * k * Math.cos(a), z: RZ * k * Math.sin(a),
            yaw: rnd() * Math.PI * 2, swing: rnd() * Math.PI * 2,
            hue: hulls[i], bell: false,
        })
    }
    // the bell buoy just inside the ring off the beach — close enough that
    // rounding the first gates carries Kai past within earshot
    out.push({ x: RX * 0.8 * Math.cos(-Math.PI / 2 + 0.55), z: RZ * 0.8 * Math.sin(-Math.PI / 2 + 0.55), yaw: 0, swing: 0, hue: 0x2f6b57, bell: true })
    return out
}

export function makeBoat(hullColor) {
    const g = new THREE.Group()
    const hullMat = new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.55, flatShading: true })
    const cream = new THREE.MeshStandardMaterial({ color: 0xf1e8d4, roughness: 0.6, flatShading: true })
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.7 })
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), hullMat)
    hull.scale.set(0.62, 0.3, 1)
    hull.position.y = 0.12
    g.add(hull)
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.02, 1.5, 8), hullMat)
    bow.rotation.x = -Math.PI / 2
    bow.scale.set(0.62, 0.42, 1)
    bow.position.set(0, 0.14, 2.1)
    g.add(bow)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.5, 1.15), cream)
    cabin.position.set(0, 0.48, -0.55)
    g.add(cabin)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 4.2, 5), wood)
    mast.position.set(0, 2.2, 0.35)
    g.add(mast)
    // slack jib: a tall thin cone squashed to a sail plane — canvas, not taut racing kit
    const sail = new THREE.Mesh(new THREE.ConeGeometry(1.15, 3.4, 3), cream)
    sail.scale.set(0.07, 1, 0.92)
    sail.position.set(0, 2.1, 1.05)
    g.add(sail)
    g.userData.swayer = sail // a loose sail twirls a little at its mooring
    return g
}

export function makeBellBuoy() {
    const g = new THREE.Group()
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshStandardMaterial({ color: 0x2f6b57, roughness: 0.45, flatShading: true }))
    ball.position.y = 0.1
    g.add(ball)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 5), new THREE.MeshStandardMaterial({ color: 0xdadfe2, roughness: 0.6 }))
    mast.position.y = 1.35
    g.add(mast)
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8b34a, roughness: 0.25, metalness: 0.75 }))
    bell.position.set(0, 2.0, 0)
    g.add(bell)
    g.userData.bell = bell
    return g
}

// ---- gulls: the anchorage has birds (#3218) -----------------------------------
// A small flock wheels over the moored fleet — flat-shaded near-white shapes
// in the headlands' silhouette language, original geometry. Like the sloops
// they are pure decoration: seeded from the course seed (same bay, same gulls
// for the whole race), never seen by the sim.
export function gullSpots(seed) {
    let s = ((seed >>> 0) || 1) ^ 0x9e3779b9
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    const birds = []
    for (let i = 0; i < 3; i++) {
        birds.push({
            r: 8 + rnd() * 7, y: 5.5 + rnd() * 3.5,
            w: 0.28 + rnd() * 0.14, ph: rnd() * Math.PI * 2,
            flap: 6.0 + rnd() * 2.5, dir: rnd() < 0.5 ? -1 : 1,
        })
    }
    return { cx: RX * 0.12 * (rnd() * 2 - 1), cz: RZ * 0.18 * (rnd() * 2 - 1), birds }
}

export function makeGull() {
    const g = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.6, flatShading: true, side: THREE.DoubleSide })
    const tip = new THREE.MeshStandardMaterial({ color: 0x43484f, roughness: 0.6, flatShading: true, side: THREE.DoubleSide })
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.17, 1.0, 5), mat)
    body.rotation.x = Math.PI / 2 // axis along +Z = the way it flies
    g.add(body)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), mat)
    head.position.z = 0.55
    g.add(head)
    const wingPivot = (side) => {
        const p = new THREE.Group()
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.32), mat)
        w.rotation.x = -Math.PI / 2 // lay the span flat (XZ)
        w.position.x = side * 0.55
        const t = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), tip)
        t.rotation.x = -Math.PI / 2
        t.position.x = side * 1.1
        p.add(w); p.add(t)
        g.add(p)
        return p
    }
    g.userData.wings = [wingPivot(-1), wingPivot(1)]
    return g
}

// one bird frame: wheel an ellipse, bank into the turn, flap with a glide beat
export function gullFrame(g, flock, b, t) {
    const a = b.dir * t * b.w + b.ph
    g.position.set(flock.cx + Math.cos(a) * b.r, b.y + Math.sin(t * 0.8 + b.ph) * 0.7, flock.cz + Math.sin(a) * b.r * 0.72)
    g.rotation.y = Math.atan2(-Math.sin(a) * b.dir, Math.cos(a) * 0.72)
    g.rotation.z = -b.dir * 0.16
    const beat = Math.sin(t * b.flap + b.ph)
    const dihedral = 0.18 + Math.max(0, beat) * 0.22
    const [wl, wr] = g.userData.wings
    wl.rotation.z = -(dihedral - beat * 0.55)
    wr.rotation.z = dihedral - beat * 0.55
}

export function wakeStep(w, dt) {
    const pts = w.pts
    for (let i = 0; i < pts.length; i++) pts[i].age += dt
    while (pts.length && pts[0].age > w.life) pts.shift()
    const pos = w.geo.attributes.position.array
    const col = w.geo.attributes.color.array
    const dPos = w.glowGeo.attributes.position.array
    const dCol = w.glowGeo.attributes.color.array
    const m = pts.length
    for (let i = 0; i < m; i++) {
        const p = pts[i]
        const t = p.age / w.life
        // foam energy: fresh AND fast. `width` at emit time already carries
        // speed + boost (the cabinet passes 0.55 + speed·0.085 + boost·0.5),
        // so the trail reads how hard the hull was driven.
        const hot = Math.min(1, 0.45 + p.width * 0.30)
        const foam = (1 - t) * (1 - t) * hot
        const tw = 0.82 + 0.18 * Math.sin(p.ph * 3.1 + p.age * 7.0) // deterministic glint
        // hue cools as the bubbles die: crests leave the stern white foam and
        // end cyan against the bay (flat white read as paint; fading reads as
        // water). b stays hot — cyan is the sink, never a muddy grey.
        const r = 0.95 - 0.40 * t, g = 0.98 - 0.16 * t, bb = 1.0
        // the V arms spread with age; the fresh end stays narrow and hot
        const hw = p.width * (0.22 + 0.78 * t)
        const px = Math.cos(p.heading), pz = -Math.sin(p.heading)
        const ea = foam * tw * 0.66 // crest alpha (the bright V lines)
        const j = i * 3
        pos[j * 3] = p.x + px * hw; pos[j * 3 + 1] = p.y; pos[j * 3 + 2] = p.z + pz * hw
        pos[(j + 1) * 3] = p.x; pos[(j + 1) * 3 + 1] = p.y; pos[(j + 1) * 3 + 2] = p.z
        pos[(j + 2) * 3] = p.x - px * hw; pos[(j + 2) * 3 + 1] = p.y; pos[(j + 2) * 3 + 2] = p.z - pz * hw
        col[j * 4] = r; col[j * 4 + 1] = g; col[j * 4 + 2] = bb; col[j * 4 + 3] = ea
        // thin fill between the crests: calm water inside the V, a third of
        // the crest — the eye reconstructs two spreading foam lines.
        col[(j + 1) * 4] = r * 0.94; col[(j + 1) * 4 + 1] = g * 0.98; col[(j + 1) * 4 + 2] = bb
        col[(j + 1) * 4 + 3] = ea * 0.32
        col[(j + 2) * 4] = r; col[(j + 2) * 4 + 1] = g; col[(j + 2) * 4 + 2] = bb; col[(j + 2) * 4 + 3] = ea
        // additive disturbed-water glow: wider, faint cyan haze under the V.
        // Strictly light-adding — the darkening-strip artifact is gone (#3337).
        const dw = p.width * (0.42 + 0.95 * t)
        const ga = foam * tw * 0.12
        const dy = p.y - 0.02
        const q = i * 2
        dPos[q * 3] = p.x + px * dw; dPos[q * 3 + 1] = dy; dPos[q * 3 + 2] = p.z + pz * dw
        dPos[(q + 1) * 3] = p.x - px * dw; dPos[(q + 1) * 3 + 1] = dy; dPos[(q + 1) * 3 + 2] = p.z - pz * dw
        dCol[q * 4] = 0.40; dCol[q * 4 + 1] = 0.66; dCol[q * 4 + 2] = 0.85; dCol[q * 4 + 3] = ga
        dCol[(q + 1) * 4] = 0.40; dCol[(q + 1) * 4 + 1] = 0.66; dCol[(q + 1) * 4 + 2] = 0.85; dCol[(q + 1) * 4 + 3] = ga
    }
    w.geo.setDrawRange(0, m >= 2 ? (m - 1) * 12 : 0)
    w.geo.attributes.position.needsUpdate = true
    w.geo.attributes.color.needsUpdate = true
    w.glowGeo.setDrawRange(0, m >= 2 ? (m - 1) * 6 : 0)
    w.glowGeo.attributes.position.needsUpdate = true
    w.glowGeo.attributes.color.needsUpdate = true
}
export function makeRain(n = 420) {
    const pos = new Float32Array(n * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({
        color: 0xbfd4e4, size: 0.12, transparent: true, opacity: 0.55, depthWrite: false,
    })
    const pts = new THREE.Points(geo, mat)
    pts.frustumCulled = false
    for (let i = 0; i < n; i++) pos[i * 3 + 1] = -60 // park dead drops well below
    const vel = new Float32Array(n * 3)
    const life = new Float32Array(n)
    return { pts, geo, mat, pos, vel, life, n, cursor: 0 }
}

export function rainSpawn(r, cx, cy, cz, count) {
    for (let k = 0; k < count; k++) {
        const i = r.cursor; r.cursor = (r.cursor + 1) % r.n
        r.pos[i * 3] = cx + (Math.random() - 0.5) * 34
        r.pos[i * 3 + 1] = cy + 6 + Math.random() * 8
        r.pos[i * 3 + 2] = cz + (Math.random() - 0.5) * 34
        r.vel[i * 3] = -1.6 + (Math.random() - 0.5) // wind-slanted
        r.vel[i * 3 + 1] = -13 - Math.random() * 4
        r.vel[i * 3 + 2] = (Math.random() - 0.5) * 2
        r.life[i] = 1.1
    }
}

export function rainStep(r, dt) {
    for (let i = 0; i < r.n; i++) {
        if (r.life[i] <= 0) continue
        r.life[i] -= dt
        if (r.life[i] <= 0) { r.pos[i * 3 + 1] = -60; continue }
        r.pos[i * 3] += r.vel[i * 3] * dt
        r.pos[i * 3 + 1] += r.vel[i * 3 + 1] * dt
        r.pos[i * 3 + 2] += r.vel[i * 3 + 2] * dt
    }
    r.geo.attributes.position.needsUpdate = true
}

// ---- lights ---------------------------------------------------------------------
export function makeLights() {
    const sun = new THREE.DirectionalLight(0xfff3d8, 2.0)
    sun.position.copy(SUN_DIR).multiplyScalar(100)
    const hemi = new THREE.HemisphereLight(0xbfd9ec, 0x0e4a5a, 1.0)
    return [sun, hemi]
}
