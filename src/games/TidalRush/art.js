// TIDAL RUSH — art.js: SUNNY BAY at the MODERN bar (#3104).
// GPU sea with real sun glitter and crest foam, graded sky with a visible
// headland, procedural jetski + leaning rider, additive spray and a stitched
// foam wake. The vertex shader runs waterGLSL() — the SAME Gerstner table the
// sim floats the hull on — so the drawn surface and the ridden surface are
// literally the same function.
//
// Phone budget (SHORE's weak spot, fixed by construction): one 96×96 grid,
// unlit custom shaders, no shadow maps, one pooled Points buffer for spray +
// wake, pixel-ratio capped by the shell.

import * as THREE from 'three'
import { waterGLSL, WAVES } from './water.js'

export const SEA_COLOR_DEEP = new THREE.Color(0x0a3648)
export const SEA_COLOR_SHALLOW = new THREE.Color(0x1e93a8)
export const FOAM_COLOR = new THREE.Color(0xeef9ff)
export const SKY_TOP = new THREE.Color(0x2e6fd4)
export const SKY_HORIZON = new THREE.Color(0xcfe6ef)
export const SUN_DIR = new THREE.Vector3(-0.55, 0.42, 0.72).normalize()

// ---- the sea ---------------------------------------------------------------
export function makeSea() {
    const SIZE = 360, SEG = 96
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uT: { value: 0 },
            uDeep: { value: SEA_COLOR_DEEP },
            uShallow: { value: SEA_COLOR_SHALLOW },
            uFoam: { value: FOAM_COLOR },
            uSun: { value: SUN_DIR },
            uSunCol: { value: new THREE.Color(0xfff2cf) },
            uCam: { value: new THREE.Vector3() },
            uFogCol: { value: SKY_HORIZON.clone() },
        },
        vertexShader: `
uniform float uT;
varying vec3 vWorld;
varying float vH;
${waterGLSL()}
void main() {
  vec3 p = position;
  vec2 d;
  p.y += waveHeight(p.xz, uT, d);
  p.xz += d;
  vH = p.y;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
        fragmentShader: `
precision highp float;
uniform vec3 uDeep, uShallow, uFoam, uSun, uSunCol, uCam, uFogCol;
uniform float uT;
varying vec3 vWorld;
varying float vH;
void main() {
  // normal from screen-space derivatives of the displaced surface
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  vec3 v = normalize(uCam - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 base = mix(uDeep, uShallow, clamp(vH * 0.42 + 0.34, 0.0, 1.0));
  vec3 sky = mix(uFogCol, vec3(0.62, 0.78, 0.92), clamp(n.y, 0.0, 1.0));
  vec3 col = mix(base, sky, fres * 0.72);
  // sun glitter: tight highlight + a wide sheen so the bay sparkles at speed
  vec3 hv = normalize(v + uSun);
  float spec = pow(max(dot(n, hv), 0.0), 180.0);
  float sheen = pow(max(dot(n, hv), 0.0), 14.0);
  col += uSunCol * (spec * 1.6 + sheen * 0.20);
  // foam rides crest tops (height) and steep forward faces (slope)
  float crest = smoothstep(1.05, 1.55, vH);
  float face = smoothstep(0.55, 0.85, n.y * 0.0 + (1.0 - n.y));
  float foam = clamp(crest + face * 0.35, 0.0, 1.0);
  float tw = 0.85 + 0.15 * sin(vWorld.x * 7.3 + vWorld.z * 5.1 + uT * 9.0);
  col = mix(col, uFoam, foam * tw);
  // distance fog to the horizon band
  float dist = length(uCam - vWorld);
  float fog = 1.0 - exp2(-pow(dist * 0.0052, 2.2));
  col = mix(col, uFogCol, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    return { mesh, mat }
}

// ---- sky dome + headlands ----------------------------------------------------
export function makeSky() {
    const group = new THREE.Group()
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(900, 24, 12),
        new THREE.ShaderMaterial({
            uniforms: { uTop: { value: SKY_TOP }, uHor: { value: SKY_HORIZON }, uSun: { value: SUN_DIR } },
            side: THREE.BackSide, depthWrite: false,
            vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * viewMatrix * vec4(position,1.0); }`,
            fragmentShader: `
precision highp float; uniform vec3 uTop,uHor,uSun; varying vec3 vP;
void main(){
  vec3 d = normalize(vP);
  float t = pow(clamp(d.y,0.0,1.0), 0.55);
  vec3 c = mix(uHor, uTop, t);
  float s = max(dot(d, normalize(uSun)), 0.0);
  c += vec3(1.0,0.92,0.7) * (pow(s, 320.0) * 2.0 + pow(s, 18.0) * 0.35);
  gl_FragColor = vec4(c,1.0);
}`,
        }),
    )
    sky.renderOrder = -10
    group.add(sky)

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
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshStandardMaterial({ color: 0xf7d9b8, roughness: 0.6 }))
    head.position.set(0, 1.66, 0.02)
    lean.add(head)
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0x18202a, roughness: 0.15, metalness: 0.4 }))
    visor.position.copy(head.position)
    lean.add(visor)
    const mkLimb = (x1, y1, z1, x2, y2, z2, r, mat) => {
        const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2)
        const dir = b.clone().sub(a)
        const len = dir.length()
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat)
        m.position.copy(a).addScaledVector(dir, 0.5)
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
        return m
    }
    lean.add(mkLimb(-0.26, 1.25, -0.02, -0.42, 1.0, 1.0, 0.08, suitMat))
    lean.add(mkLimb(0.26, 1.25, -0.02, 0.42, 1.0, 1.0, 0.08, suitMat))
    lean.add(mkLimb(-0.2, 0.85, -0.1, -0.3, 0.45, 0.7, 0.1, suitMat))
    lean.add(mkLimb(0.2, 0.85, -0.1, 0.3, 0.45, 0.7, 0.1, suitMat))

    // boost flame: a stretched emissive cone at the stern
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.1, 8), new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.85 }))
    flame.rotation.x = -Math.PI / 2
    flame.position.set(0, 0.1, -2.3)
    flame.visible = false
    tilt.add(flame)

    return { root, tilt, lean, flame }
}

// ---- spray + wake: one pooled additive Points buffer ---------------------------
export function makeSpray(n = 700) {
    const pos = new Float32Array(n * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({
        color: 0xf2fbff, size: 0.34, transparent: true, opacity: 0.85,
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

export function spraySpawn(sp, x, y, z, count, spread, up, isWake) {
    for (let k = 0; k < count; k++) {
        const i = sp.cursor; sp.cursor = (sp.cursor + 1) % sp.n
        sp.pos[i * 3] = x + (Math.random() - 0.5) * spread
        sp.pos[i * 3 + 1] = y + Math.random() * 0.2
        sp.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread
        sp.vel[i * 3] = (Math.random() - 0.5) * 3.4
        sp.vel[i * 3 + 1] = up * (0.6 + Math.random() * 0.9)
        sp.vel[i * 3 + 2] = (Math.random() - 0.5) * 3.4
        sp.life[i] = isWake ? 1.6 : 0.55 + Math.random() * 0.3
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

// ---- lights ---------------------------------------------------------------------
export function makeLights() {
    const sun = new THREE.DirectionalLight(0xfff3d8, 2.0)
    sun.position.copy(SUN_DIR).multiplyScalar(100)
    const hemi = new THREE.HemisphereLight(0xbfd9ec, 0x0e4a5a, 1.0)
    return [sun, hemi]
}
