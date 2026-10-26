// renderer.js — MAGIC CARPET HD: the GPU world pass (#1083).
// Fresh WebGL2 renderer (three.js, the COMET DRIFT HD house pattern). The sim
// (sim.js, #1059 rules) owns the numbers; this turns them into the view:
//  - terrain: a camera-centered grid whose heights are sampled in the vertex
//    shader from a live RGBA8 data texture (R=height, G=lava glow, B=scorch)
//    re-uploaded every tick — blasts visibly tear the ground open, low craters
//    flood with the sea.
//  - water: sea level is geometric; the shader adds ripples, sun glitter,
//    depth banding and shore foam so it reads as water, not a blue decal.
//  - sky: gradient dome with sun + drifting fbm clouds, matched to the world's
//    fog so terrain and horizon fuse.
//  - entities: lit billboard sprites baked at runtime into an atlas from
//    art.js (which is never patched), plus instanced GPU particles for fire,
//    smoke and embers, and jagged line-mesh lightning.
//  - post: bright-pass bloom + vignette composited at screen resolution.

import * as THREE from 'three'
import { MAP, GRID, WATER, SANDL, GRASSL, ROCKL } from './sim.js'
import {
    drawPearl, drawBook, drawBalloon, drawCastle, drawTower, drawWizard,
    drawGiant, drawWolf, drawCow, drawHut, drawFireball, drawBolt,
} from './art.js'

const N = GRID
const CELL = MAP / GRID
const SPAN = 72
const HALF = (SPAN * CELL) / 2
const FOG_D = 260

// Per-world atmospheres: same rules, three skies. Colors are authored as final
// sRGB (ColorManagement is disabled for this renderer's lifetime).
const PAL = [
    {
        zenith: 0x1d3a72, horizon: 0x9fc0d8, fog: 0x92b2cc, sun: 0xfff2c8,
        sunAz: 2.1, sunEl: 0.62,
        deep: 0x123f78, shallow: 0x3f88c8, foam: 0xd6eaf4,
        sand: 0xcfae6e, grassA: 0x52913a, grassB: 0x33691e, rock: 0x7c6d57, snow: 0xe9eef4,
        cloud: 0xdfe8f2, cloudMix: 0.55,
    },
    {
        zenith: 0x2a1038, horizon: 0xc05838, fog: 0xa05848, sun: 0xffb060,
        sunAz: 2.45, sunEl: 0.16,
        deep: 0x2c1740, shallow: 0x6a3450, foam: 0xd89878,
        sand: 0xa87050, grassA: 0x5f4a22, grassB: 0x3e3214, rock: 0x6a4a3c, snow: 0xd8b8a8,
        cloud: 0xc07058, cloudMix: 0.42,
    },
    {
        zenith: 0x2a4a80, horizon: 0xc8dcec, fog: 0xc0d4e6, sun: 0xf0f6ff,
        sunAz: 1.6, sunEl: 0.5,
        deep: 0x24486e, shallow: 0x6ea0c8, foam: 0xeaf4fc,
        sand: 0xb2bec6, grassA: 0xa8bcc0, grassB: 0x86a0a8, rock: 0x7c8894, snow: 0xf2f6fa,
        cloud: 0xe6eff8, cloudMix: 0.62,
    },
]

const v3 = (v) => new THREE.Color(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255)

const NOISE_GLSL = `
float hash21(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1,0)), c = hash21(i + vec2(0,1)), d = hash21(i + vec2(1,1));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm2(vec2 p){ return vnoise(p) * 0.6 + vnoise(p * 2.7 + 13.1) * 0.4; }
float fbm3(vec2 p){ return fbm2(p) * 0.62 + vnoise(p * 5.3 + 7.7) * 0.38; }
`

// ------------------------------------------------------------- sprite atlas ----
// Canvas bounds in art-k units (l,r = x, t = up from baseline, b = below),
// plus the world size and anchor (baseline vs center).
const SPRITES = {
    pearl: { l: -3, r: 3, t: 3.4, b: -1, wh: 2.4, ww: 2.4, center: true },
    book: { l: -6, r: 6, t: 5.8, b: -0.5, wh: 3.6, ww: 4.4 },
    balloon: { l: -4.2, r: 4.2, t: 13.2, b: -0.5, wh: 9, ww: 3.2 },
    castle1: { l: -16.5, r: 16.5, t: 18.4, b: -1.6, wh: 10, ww: 11 },
    castle2: { l: -16.5, r: 16.5, t: 25.4, b: -1.6, wh: 14, ww: 11 },
    castle3: { l: -16.5, r: 16.5, t: 35.4, b: -1.6, wh: 20, ww: 11 },
    castle4: { l: -16.5, r: 16.5, t: 46.4, b: -1.6, wh: 26, ww: 11 },
    towerUp: { l: -6.4, r: 6.4, t: 19.6, b: -1.4, wh: 13, ww: 4.4 },
    towerFall: { l: -10.4, r: 10.4, t: 8.4, b: -1.4, wh: 4.6, ww: 8 },
    wizard: { l: -5, r: 5, t: 12.8, b: -1.4, wh: 3.4, ww: 2.2 },
    giant: { l: -5.6, r: 5.6, t: 16.4, b: -0.4, wh: 7, ww: 2.4 },
    wolf: { l: -5.6, r: 5.6, t: 6.6, b: -0.4, wh: 1.9, ww: 1.9 },
    cow: { l: -3.6, r: 3.6, t: 4.6, b: -0.4, wh: 1.35, ww: 1.35 },
    hut: { l: -5.6, r: 5.6, t: 8.6, b: -1.2, wh: 3.4, ww: 3.4 },
    hutBurn: { l: -5.6, r: 5.6, t: 13.6, b: -1.2, wh: 5, ww: 3.4 },
    rubble: { l: -5, r: 5, t: 2.4, b: -1.2, wh: 1, ww: 3 },
    fireball: { l: -2.6, r: 2.6, t: 2.6, b: -2.6, wh: 1.8, ww: 1.8, center: true },
    bolt: { l: -2.8, r: 2.8, t: 1.4, b: -1.4, wh: 1.3, ww: 2.6, center: true },
    rock: { l: -2.2, r: 2.2, t: 2.2, b: -2.2, wh: 1.1, ww: 1.1, center: true },
    arrow: { l: -3.2, r: 3.2, t: 1, b: -1, wh: 0.5, ww: 2.4, center: true },
    throw: { l: -2.6, r: 2.6, t: 2.6, b: -2.6, wh: 1.8, ww: 1.8, center: true },
    dot: { l: -4, r: 4, t: 4, b: -4, wh: 4, ww: 4, center: true },
    smoke: { l: -4, r: 4, t: 4, b: -4, wh: 4, ww: 4, center: true },
}
const ATLAS = 1024

function bakeAtlas() {
    const cv = document.createElement('canvas')
    cv.width = ATLAS; cv.height = ATLAS
    const ctx = cv.getContext('2d')
    ctx.imageSmoothingEnabled = true
    const uv = {}
    let px = 2, py = 2, rowH = 0
    const cell = 128 - 16
    const place = (name) => {
        const s = SPRITES[name]
        const bw = s.r - s.l, bh = s.t - s.b
        const k = Math.min(cell / bw, cell / bh)
        const w = Math.ceil(bw * k) + 4, h = Math.ceil(bh * k) + 4
        if (px + w > ATLAS) { px = 2; py += rowH + 2; rowH = 0 }
        const ox = px, oy = py
        px += w + 2; rowH = Math.max(rowH, h)
        uv[name] = {
            x: ox / ATLAS, yTop: 1 - oy / ATLAS, w: w / ATLAS, h: h / ATLAS, k,
            cx: ox + (-s.l) * k + 2, cy: oy + s.t * k + 2,
        }
    }
    for (const name of Object.keys(SPRITES)) place(name)

    const blit = (name, fn) => {
        const u = uv[name]
        ctx.save(); ctx.beginPath()
        ctx.rect(u.cx - (u.w * ATLAS) / 2, u.cy - (u.h * ATLAS) / 2, u.w * ATLAS, u.h * ATLAS)
        ctx.clip()
        fn(u)
        ctx.restore()
    }
    blit('pearl', (u) => drawPearl(ctx, u.cx, u.cy, u.k, 6))
    blit('book', (u) => drawBook(ctx, u.cx, u.cy, u.k, 6))
    blit('balloon', (u) => drawBalloon(ctx, u.cx, u.cy, u.k, 6, 0))
    blit('castle1', (u) => drawCastle(ctx, u.cx, u.cy, u.k, 1))
    blit('castle2', (u) => drawCastle(ctx, u.cx, u.cy, u.k, 2))
    blit('castle3', (u) => drawCastle(ctx, u.cx, u.cy, u.k, 3))
    blit('castle4', (u) => drawCastle(ctx, u.cx, u.cy, u.k, 4))
    blit('towerUp', (u) => drawTower(ctx, u.cx, u.cy, u.k, 6, true, false))
    blit('towerFall', (u) => drawTower(ctx, u.cx, u.cy, u.k, 6, true, true))
    blit('wizard', (u) => drawWizard(ctx, u.cx, u.cy, u.k, 6))
    blit('giant', (u) => drawGiant(ctx, u.cx, u.cy, u.k, 6, false))
    blit('wolf', (u) => drawWolf(ctx, u.cx, u.cy, u.k, 6, true))
    blit('cow', (u) => drawCow(ctx, u.cx, u.cy, u.k))
    blit('hut', (u) => drawHut(ctx, u.cx, u.cy, u.k, 0, 6, 0, false))
    blit('hutBurn', (u) => drawHut(ctx, u.cx, u.cy, u.k, 0, 6, 200, false))
    blit('rubble', (u) => drawHut(ctx, u.cx, u.cy, u.k, 0, 6, 0, true))
    blit('fireball', (u) => drawFireball(ctx, u.cx, u.cy, u.k))
    blit('bolt', (u) => drawBolt(ctx, u.cx, u.cy, u.k, '#c060ff'))
    blit('rock', (u) => {
        ctx.fillStyle = '#7a6a54'
        ctx.beginPath(); ctx.arc(u.cx, u.cy, 2 * u.k, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#968468'
        ctx.beginPath(); ctx.arc(u.cx - u.k * 0.6, u.cy - u.k * 0.6, u.k * 0.8, 0, Math.PI * 2); ctx.fill()
    })
    blit('arrow', (u) => {
        const k = u.k
        ctx.fillStyle = '#d8d8e0'
        ctx.fillRect(u.cx - 3 * k, u.cy - 0.35 * k, 6 * k, 0.7 * k)
        ctx.fillStyle = '#8a8898'
        ctx.fillRect(u.cx + 2.2 * k, u.cy - 0.8 * k, k, 1.6 * k)
    })
    blit('throw', (u) => {
        ctx.fillStyle = '#9a6a3a'
        ctx.beginPath(); ctx.arc(u.cx, u.cy, 2.4 * u.k, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#7a5028'
        ctx.beginPath(); ctx.arc(u.cx + u.k * 0.5, u.cy + u.k * 0.4, u.k, 0, Math.PI * 2); ctx.fill()
    })
    blit('dot', (u) => {
        const r = u.k * 4
        const gr = ctx.createRadialGradient(u.cx, u.cy, 0, u.cx, u.cy, r)
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = gr
        ctx.fillRect(u.cx - r, u.cy - r, r * 2, r * 2)
    })
    blit('smoke', (u) => {
        const r = u.k * 4
        for (let i = 0; i < 7; i++) {
            const a = i * 2.4, rr = r * (0.32 + (i % 3) * 0.16)
            const gx = u.cx + Math.cos(a) * r * 0.3, gy = u.cy + Math.sin(a) * r * 0.3
            const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, rr)
            gr.addColorStop(0, 'rgba(200,200,210,0.5)'); gr.addColorStop(1, 'rgba(180,180,190,0)')
            ctx.fillStyle = gr
            ctx.fillRect(gx - rr, gy - rr, rr * 2, rr * 2)
        }
    })
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.NoColorSpace
    tex.generateMipmaps = true
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    return { tex, uv }
}

// ------------------------------------------------------------- instancing GC ---
function makeBillboardGeo(cap) {
    const base = new THREE.PlaneGeometry(1, 1)
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = base.index
    geo.setAttribute('position', base.getAttribute('position'))
    geo.setAttribute('uv', base.getAttribute('uv'))
    const aPos = new Float32Array(cap * 3)
    const aSize = new Float32Array(cap * 2)
    const aUv = new Float32Array(cap * 4)
    const aTint = new Float32Array(cap * 4)
    const aSeed = new Float32Array(cap)
    const attrs = {
        aPos: new THREE.InstancedBufferAttribute(aPos, 3),
        aSize: new THREE.InstancedBufferAttribute(aSize, 2),
        aUv: new THREE.InstancedBufferAttribute(aUv, 4),
        aTint: new THREE.InstancedBufferAttribute(aTint, 4),
        aSeed: new THREE.InstancedBufferAttribute(aSeed, 1),
    }
    for (const k of Object.keys(attrs)) geo.setAttribute(k, attrs[k])
    geo.instanceCount = 0
    return { geo, ...attrs }
}

const BILL_VERT = `
uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uFwd; uniform vec3 uCamPos; uniform float uFogD;
attribute vec3 aPos; attribute vec2 aSize; attribute vec4 aUv; attribute vec4 aTint; attribute float aSeed;
varying vec2 vUv; varying vec3 vTint; varying float vAlpha; varying float vFog; varying float vSeed; varying float vUp;
void main(){
    vec2 q = uv;
    float anchor = aUv.w < 0.0 ? 0.5 : 0.0; // packed: negative stored h means centered anchor
    vec3 relC = aPos - uCamPos;
    float elev = relC.y / max(length(relC), 1.0);
    float lean = smoothstep(0.12, -0.32, elev) * 0.32;
    vec3 upv = normalize(mix(uUp, uFwd, lean));
    vec3 world = aPos + uRight * (q.x - 0.5) * aSize.x + upv * (q.y - anchor) * aSize.y;
    vec3 rel = world - uCamPos;
    vFog = smoothstep(70.0, uFogD, length(rel));
    vUv = vec2(aUv.x + q.x * aUv.z, aUv.y - (1.0 - q.y) * abs(aUv.w));
    vTint = aTint.rgb; vAlpha = aTint.a; vSeed = aSeed; vUp = q.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`
const BILL_FRAG = `
precision highp float;
uniform sampler2D uAtlas; uniform vec3 uFogCol; uniform float uSunUp, uWorldTime;
varying vec2 vUv; varying vec3 vTint; varying float vAlpha; varying float vFog; varying float vSeed; varying float vUp;
float hash11b(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
void main(){
    vec4 t = texture2D(uAtlas, vUv);
    if (t.a < 0.02) discard;
    vec3 c = t.rgb * vTint * (0.74 + 0.3 * uSunUp + 0.1 * vUp);
    if (vSeed < -0.5) {
        float flick = 0.5 + 0.5 * sin(uWorldTime * (0.07 + hash11b(-vSeed) * 0.1) + vSeed * 37.0);
        c += vec3(1.0, 0.62, 0.22) * flick * smoothstep(0.5, 0.16, vUp) * 0.55;
    }
    c = mix(c, uFogCol, vFog);
    gl_FragColor = vec4(c, t.a * vAlpha);
}
`
const PART_FRAG = `
precision highp float;
uniform sampler2D uAtlas; uniform vec3 uFogCol; uniform float uWorldTime;
varying vec2 vUv; varying vec3 vTint; varying float vAlpha; varying float vFog; varying float vSeed; varying float vUp;
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
void main(){
    vec4 t = texture2D(uAtlas, vUv);
    float flick = 0.72 + 0.28 * sin(uWorldTime * (0.15 + hash11(vSeed) * 0.12) + vSeed * 40.0);
    vec3 c = t.rgb * vTint * flick;
    c = mix(c, uFogCol, vFog * 0.7);
    gl_FragColor = vec4(c, t.a * vAlpha);
}
`

export function createCarpetGL(canvas, opts = {}) {
    const lite = !!opts.lite
    const cmPrev = THREE.ColorManagement.enabled
    THREE.ColorManagement.enabled = false

    const renderer = new THREE.WebGLRenderer({
        canvas, antialias: !lite, alpha: false, preserveDrawingBuffer: true,
    })
    const gl = renderer.getContext()
    const hdr = !!gl.getExtension('EXT_color_buffer_float')
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 1600)

    const atlas = bakeAtlas()

    // ---- height/glow/scorch data texture (R = height*255/96, G = lava glow,
    // B = scorch) re-uploaded every tick: terrain shaping is visible terrain.
    const hData = new Uint8Array(N * N * 4)
    const hTex = new THREE.DataTexture(hData, N, N, THREE.RGBAFormat, THREE.UnsignedByteType)
    hTex.wrapS = hTex.wrapT = THREE.RepeatWrapping
    hTex.magFilter = hTex.minFilter = THREE.LinearFilter
    hTex.colorSpace = THREE.NoColorSpace
    hTex.needsUpdate = true
    const scorch = new Uint8Array(N * N)
    const marks = []

    // ---- terrain
    const tVert = `
uniform sampler2D uData; uniform vec2 uOrigin; uniform vec3 uCamPos; uniform float uTime;
varying float vH; varying float vGlow; varying float vScorch; varying vec3 vWorld; varying float vDist;
${NOISE_GLSL}
void main(){
    vec3 p = vec3(uOrigin.x + position.x, 0.0, uOrigin.y + position.z);
    vec2 uvw = p.xz / ${MAP}.0;
    vec4 hg = texture2D(uData, uvw);
    float hRaw = hg.r * 96.0;
    float n = fbm3(p.xz * 0.05) * 1.15 + vnoise(p.xz * 0.13 + 4.2) * 0.5;
    float h = hRaw + n * (hRaw > ${WATER}.0 ? 1.0 : 0.3);
    vH = hRaw; vGlow = hg.g; vScorch = hg.b; vWorld = p;
    vDist = length(p - uCamPos);
    gl_Position = projectionMatrix * viewMatrix * vec4(p.x, max(h, ${WATER}.0), p.z, 1.0);
}
`
    const tFrag = `
precision highp float;
uniform sampler2D uData; uniform vec3 uSunDir; uniform float uTime, uWorldTime;
uniform vec3 uCamPos;
uniform vec3 uZenith, uFogCol, uSunCol, uDeep, uShallow, uFoam, uSand, uGrassA, uGrassB, uRock, uSnow;
uniform float uFogD;
varying float vH; varying float vGlow; varying float vScorch; varying vec3 vWorld; varying float vDist;
${NOISE_GLSL}
float hAt(vec2 xz){ return texture2D(uData, xz / ${MAP}.0).r * 96.0; }
void main(){
    vec3 nrm = normalize(vec3(
        -(hAt(vWorld.xz + vec2(4.0, 0.0)) - hAt(vWorld.xz - vec2(4.0, 0.0))) / 8.0,
        1.0,
        -(hAt(vWorld.xz + vec2(0.0, 4.0)) - hAt(vWorld.xz - vec2(0.0, 4.0))) / 8.0));
    float diff = max(dot(nrm, uSunDir), 0.0) * 0.72 + 0.34;
    float grain = fbm3(vWorld.xz * 0.35);
    float slope = 1.0 - nrm.y;
    float grassT = smoothstep(${SANDL}.0, ${GRASSL - 8}.0, vH);
    float rockT = smoothstep(${GRASSL + 4}.0, ${ROCKL}.0, vH);
    float snowT = smoothstep(${ROCKL + 8}.0, ${ROCKL + 20}.0, vH);
    vec3 land = mix(uSand, mix(uGrassA, uGrassB, grain), grassT);
    land = mix(land, uRock, max(rockT, smoothstep(0.24, 0.5, slope)));
    land = mix(land, uSnow, snowT);
    land = land * (0.80 + 0.32 * grain);
    vec3 col = land * diff * mix(vec3(1.0), uSunCol, 0.25);
    vec3 V = normalize(uCamPos - vWorld);
    if (vH < ${WATER}.0) {
        float depth = ${WATER}.0 - vH;
        float bpos = depth * 0.28 + fbm2(vWorld.xz * 0.7 + 3.3) * 0.45;
        float b0 = clamp(floor(bpos) / 3.0, 0.0, 1.0);
        float b1 = clamp((floor(bpos) + 1.0) / 3.0, 0.0, 1.0);
        vec3 wcol = mix(uShallow, uDeep, mix(b0, b1, smoothstep(0.3, 0.7, fract(bpos))));
        vec2 rp = vWorld.xz * 0.55 + uWorldTime * vec2(0.02, 0.014);
        vec2 rp2 = vWorld.xz * 0.31 - uWorldTime * vec2(0.011, 0.018);
        float rip = sin(rp.x + sin(rp.y * 1.3 + uWorldTime * 0.02)) + sin(rp.y * 1.7 - uWorldTime * 0.026);
        vec3 wn = normalize(vec3(
            -(cos(rp.x + uWorldTime * 0.02) * 0.11 + cos(rp2.x * 1.7) * 0.07),
            1.0,
            -(cos(rp.y * 1.4 - uWorldTime * 0.022) * 0.1 + cos(rp2.y * 2.1) * 0.09)));
        float fres = pow(1.0 - max(dot(wn, V), 0.0), 3.0);
        vec3 hv = normalize(V + uSunDir);
        float spec = pow(max(dot(wn, hv), 0.0), 46.0) * (0.5 + 0.5 * sin(rip));
        float wss = dot(wn.xz, normalize(uSunDir.xz));
        float wsh = 0.74 + 0.26 * smoothstep(-0.16, 0.16, wss);
        vec3 refl = normalize(reflect(-V, wn));
        float spark = pow(max(dot(refl, normalize(uSunDir)), 0.0), 140.0)
            * step(0.42, fbm2(vWorld.xz * 0.8 + uWorldTime * 0.016));
        wcol = mix(wcol, uZenith * 1.2, fres * 0.45);
        wcol *= wsh * (0.9 + 0.1 * sin(rip * 1.4 + vWorld.z * 0.04));
        wcol += uSunCol * spec * 0.9;
        wcol += uSunCol * spark * 2.4;
        float shore = smoothstep(3.2 + fbm2(vWorld.xz * 0.3) * 1.7, 0.35, depth);
        float foam = shore * (0.45 + 0.55 * fbm2(vWorld.xz * 0.9 + uWorldTime * 0.014));
        float lace = smoothstep(0.9, 1.6, depth + fbm2(vWorld.xz * 1.6 - uWorldTime * 0.02)) * shore;
        wcol = mix(wcol, uFoam, clamp(foam + lace * 0.5, 0.0, 1.0) * 0.85);
        col = wcol;
    }
    if (vGlow > 0.004) {
        float flick = 0.72 + 0.28 * fbm3(vWorld.xz * 0.22 + uWorldTime * 0.03);
        vec3 lava = mix(vec3(1.55, 0.42, 0.07), vec3(1.25, 0.95, 0.45), fbm2(vWorld.xz * 0.5 + uWorldTime * 0.03) * vGlow);
        col = mix(col, lava, clamp(vGlow * flick, 0.0, 1.0));
        col += lava * vGlow * 0.35;
    }
    if (vScorch > 0.02 && vGlow <= 0.004) {
        vec3 hv2 = normalize(V + uSunDir);
        float gloss = pow(max(dot(nrm, hv2), 0.0), 26.0);
        col = mix(col, col * 0.5, vScorch * 0.55);
        col += uSunCol * gloss * vScorch * 0.9;
    }
    float cshade = fbm2(vWorld.xz * 0.011 + vec2(uWorldTime * 0.0016, uWorldTime * 0.0009));
    col *= 1.0 - 0.22 * smoothstep(0.48, 0.76, cshade);
    col = mix(col, uFogCol, smoothstep(70.0, uFogD, vDist) * 0.92);
    gl_FragColor = vec4(col, 1.0);
}
`
    const tUniforms = {
        uData: { value: hTex }, uOrigin: { value: new THREE.Vector2() }, uCamPos: { value: new THREE.Vector3() },
        uTime: { value: 0 }, uWorldTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.5) },
        uZenith: { value: new THREE.Color() }, uFogCol: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
        uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() }, uFoam: { value: new THREE.Color() },
        uSand: { value: new THREE.Color() }, uGrassA: { value: new THREE.Color() }, uGrassB: { value: new THREE.Color() },
        uRock: { value: new THREE.Color() }, uSnow: { value: new THREE.Color() }, uFogD: { value: FOG_D },
    }
    const terrGeo = new THREE.BufferGeometry()
    {
        const verts = []
        const idx = []
        for (let j = 0; j <= SPAN; j++) {
            for (let i = 0; i <= SPAN; i++) verts.push(i * CELL - HALF, 0, j * CELL - HALF)
        }
        for (let j = 0; j < SPAN; j++) {
            for (let i = 0; i < SPAN; i++) {
                const a = j * (SPAN + 1) + i
                idx.push(a, a + SPAN + 2, a + 1, a, a + SPAN + 1, a + SPAN + 2)
            }
        }
        terrGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
        terrGeo.setIndex(idx)
    }
    const terrain = new THREE.Mesh(terrGeo, new THREE.ShaderMaterial({
        uniforms: tUniforms, vertexShader: tVert, fragmentShader: tFrag, side: THREE.DoubleSide,
    }))
    terrain.frustumCulled = false
    scene.add(terrain)

    // ---- sky dome
    const sUniforms = {
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSunDir: tUniforms.uSunDir, uSunCol: tUniforms.uSunCol,
        uCloudCol: { value: new THREE.Color() }, uCloudMix: { value: 0.5 }, uTime: tUniforms.uTime,
        uWorldTime: tUniforms.uWorldTime,
    }
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(900, 32, 18),
        new THREE.ShaderMaterial({
            uniforms: sUniforms, side: THREE.BackSide, depthWrite: false,
            vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: `
precision highp float;
uniform vec3 uZenith, uHorizon, uSunDir, uSunCol, uCloudCol; uniform float uCloudMix, uTime, uWorldTime;
varying vec3 vDir;
${NOISE_GLSL}
void main(){
    vec3 d = normalize(vDir);
    float el = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(el, 0.55));
    float sd = dot(d, normalize(uSunDir));
    col += uSunCol * pow(max(sd, 0.0), 900.0) * 1.4;
    col += uSunCol * pow(max(sd, 0.0), 14.0) * 0.22;
    col += uSunCol * pow(max(sd, 0.0), 3.0) * 0.06;
    vec2 cp = d.xz / max(abs(d.y) + 0.18, 0.18);
    float c = fbm3(cp * 1.15 + vec2(uWorldTime * 0.0002, uWorldTime * 0.0001));
    float c2 = fbm3(cp * 2.4 + vec2(-uWorldTime * 0.00035, uWorldTime * 0.00023) + 9.1);
    float fine = fbm2(cp * 5.5 + vec2(uWorldTime * 0.0005, -uWorldTime * 0.0003));
    float cov = smoothstep(0.56 - uCloudMix * 0.12, 0.80, c) * smoothstep(0.0, 0.22, d.y) * (1.0 - smoothstep(0.55, 1.0, d.y) * 0.35);
    float cov2 = smoothstep(0.58 - uCloudMix * 0.1, 0.84, c2) * smoothstep(0.0, 0.3, d.y);
    col = mix(col, uCloudCol * (0.78 + 0.34 * fine), cov2 * uCloudMix * 0.55);
    col = mix(col, uCloudCol * (0.86 + 0.3 * fine), cov * uCloudMix);
    gl_FragColor = vec4(col, 1.0);
}
`,
        }),
    )
    sky.frustumCulled = false
    scene.add(sky)

    // ---- billboard batches (sprites / additive particles / smoke)
    const mkMat = (frag, additive) => new THREE.ShaderMaterial({
        uniforms: {
            uAtlas: { value: atlas.tex }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) },
            uFwd: { value: new THREE.Vector3(0, 0, 1) },
            uCamPos: tUniforms.uCamPos, uFogCol: tUniforms.uFogCol, uFogD: tUniforms.uFogD,
            uSunUp: { value: 0.7 }, uTime: tUniforms.uTime, uWorldTime: tUniforms.uWorldTime,
        },
        vertexShader: BILL_VERT, fragmentShader: frag,
        transparent: true, depthWrite: false, depthTest: true,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    const CAP = 224
    const CAP_P = lite ? 140 : 360
    const spr = makeBillboardGeo(CAP)
    const par = makeBillboardGeo(CAP_P)
    const smoke = makeBillboardGeo(CAP_P)
    const sprMesh = new THREE.Mesh(spr.geo, mkMat(BILL_FRAG, false))
    const parMesh = new THREE.Mesh(par.geo, mkMat(PART_FRAG, true))
    const smokeMesh = new THREE.Mesh(smoke.geo, mkMat(PART_FRAG, false))
    for (const m of [sprMesh, parMesh, smokeMesh]) { m.frustumCulled = false; scene.add(m) }

    // ---- lightning (jagged additive line mesh)
    const LSEG = 16
    const boltGeo = new THREE.BufferGeometry()
    const boltPos = new Float32Array(64 * 3 * 2)
    boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3))
    boltGeo.setDrawRange(0, 0)
    const boltMat = new THREE.ShaderMaterial({
        uniforms: { uFade: { value: 0 }, uCamPos: tUniforms.uCamPos, uFogCol: tUniforms.uFogCol },
        vertexShader: 'uniform vec3 uCamPos; varying float vD; void main(){ vD = length(position - uCamPos); gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'precision highp float; uniform float uFade; uniform vec3 uFogCol; varying float vD; void main(){ gl_FragColor = vec4(mix(vec3(0.85, 0.9, 1.6), uFogCol, smoothstep(70.0, 260.0, vD)), uFade); }',
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const boltMesh = new THREE.LineSegments(boltGeo, boltMat)
    boltMesh.frustumCulled = false
    scene.add(boltMesh)
    let boltAge = 99

    // ---- post: bright-pass bloom + vignette (three quad scenes)
    const rtOpts = {
        type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true,
    }
    const rtScene = new THREE.WebGLRenderTarget(4, 4, rtOpts)
    const rtA = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: false })
    const rtB = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: false })
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new THREE.PlaneGeometry(2, 2)
    const qmat = (frag, uniforms) => new THREE.ShaderMaterial({
        uniforms, vertexShader: 'varying vec2 vQ; void main(){ vQ = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: frag, depthTest: false, depthWrite: false,
    })
    const mkScene = (mesh) => { const s = new THREE.Scene(); s.add(mesh); return s }
    const brightMesh = new THREE.Mesh(quad, qmat(`
precision highp float; uniform sampler2D uT; uniform float uThr; varying vec2 vQ;
void main(){ vec3 c = texture2D(uT, vQ).rgb; float l = max(max(c.r,c.g),c.b); gl_FragColor = vec4(c * max(0.0, l - uThr) / max(l, 0.001), 1.0); }
`, { uT: { value: null }, uThr: { value: hdr ? 0.9 : 0.68 } }))
    const blurMesh = new THREE.Mesh(quad, qmat(`
precision highp float; uniform sampler2D uT; uniform vec2 uDir; varying vec2 vQ;
void main(){
    vec3 s = texture2D(uT, vQ).rgb * 0.227;
    s += (texture2D(uT, vQ + uDir * 1.384).rgb + texture2D(uT, vQ - uDir * 1.384).rgb) * 0.316;
    s += (texture2D(uT, vQ + uDir * 3.230).rgb + texture2D(uT, vQ - uDir * 3.230).rgb) * 0.070;
    gl_FragColor = vec4(s, 1.0);
}
`, { uT: { value: null }, uDir: { value: new THREE.Vector2() } }))
    const compMesh = new THREE.Mesh(quad, qmat(`
precision highp float; uniform sampler2D uScene, uBloom; uniform float uBloomAmt; varying vec2 vQ;
void main(){
    vec3 c = texture2D(uScene, vQ).rgb + texture2D(uBloom, vQ).rgb * uBloomAmt;
    vec2 v = vQ - 0.5;
    c *= 1.0 - dot(v, v) * 0.42;
    c = c * 1.04 - 0.015;
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`, { uScene: { value: null }, uBloom: { value: null }, uBloomAmt: { value: 0.75 } }))
    const scBright = mkScene(brightMesh)
    const scBlur = mkScene(blurMesh)
    const scComp = mkScene(compMesh)

    // ---- CPU particle pool → instanced quads
    const parts = []
    const spawn = (x, y, z, kind, vx = 0, vy = 0, vz = 0, size = 1, life = 40, tint = null) => {
        if (parts.length >= CAP_P - 8) parts.shift()
        parts.push({ x, y, z, vx, vy, vz, kind, size, life, maxLife: life, seed: Math.random() * 100, tint })
    }
    const TINT_FIRE = [1.5, 0.62, 0.16], TINT_EMBER = [1.3, 0.5, 0.15], TINT_SMOKE = [0.42, 0.42, 0.46]

    const wrapD = (v) => ((v + MAP / 2) % MAP + MAP) % MAP - MAP / 2
    const heightAt = (gs, x, y) => {
        const gx = (((x % MAP) + MAP) % MAP) / CELL, gy = (((y % MAP) + MAP) % MAP) / CELL
        const x0 = Math.floor(gx), y0 = Math.floor(gy)
        const tx = gx - x0, ty = gy - y0
        const ix0 = ((x0 % N) + N) % N, ix1 = (ix0 + 1) % N, iy0 = ((y0 % N) + N) % N, iy1 = (iy0 + 1) % N
        const a = gs.heights[iy0 * N + ix0], b = gs.heights[iy0 * N + ix1], c = gs.heights[iy1 * N + ix0], d = gs.heights[iy1 * N + ix1]
        const top = a + (b - a) * tx
        return top + ((c + (d - c) * tx) - top) * ty
    }
    const addScorch = (x, y, r, s) => { marks.push({ x, y, r, s }); if (marks.length > 48) marks.shift() }

    const spawnBurst = (gs, x, y, n, col) => {
        const h = heightAt(gs, x, y)
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.8
            spawn(x, h + 1, y, 'ember', Math.cos(a) * sp, 1 + Math.random() * 2.4, Math.sin(a) * sp, 0.7 + Math.random() * 0.6, 34 + Math.random() * 24, col)
        }
        for (let i = 0; i < Math.max(2, n / 3); i++) {
            spawn(x, h + 2 + Math.random() * 2, y, 'smoke', (Math.random() - 0.5) * 0.8, 0.7 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, 2.6 + Math.random() * 2, 90 + Math.random() * 60)
        }
        spawn(x, h + 1.5, y, 'flare', 0, 0, 0, 7, 12, col)
    }

    const makeBolt = (gs, x, y) => {
        const base = heightAt(gs, x, y)
        let ax = x, ay = y, az = base + 90
        const pts = [[ax, ay, az]]
        for (let i = 0; i < LSEG; i++) {
            ax += (Math.random() - 0.5) * 7; ay += (Math.random() - 0.5) * 7; az -= 90 / LSEG
            pts.push([ax, ay, az])
        }
        let n = 0
        const put = (a, b) => {
            boltPos[n * 6] = a[0]; boltPos[n * 6 + 1] = a[1]; boltPos[n * 6 + 2] = a[2]
            boltPos[n * 6 + 3] = b[0]; boltPos[n * 6 + 4] = b[1]; boltPos[n * 6 + 5] = b[2]
            n++
        }
        for (let i = 0; i < pts.length - 1; i++) put(pts[i], pts[i + 1])
        let bx = pts[4 + Math.floor(Math.random() * 6)]
        for (let i = 0; i < 6; i++) {
            const nx = bx[0] + (Math.random() - 0.5) * 12, ny = bx[1] + (Math.random() - 0.5) * 12, nz = bx[2] - (90 / LSEG) * (0.5 + Math.random())
            put(bx, [nx, ny, nz]); bx = [nx, ny, nz]
        }
        boltGeo.setDrawRange(0, n * 2)
        boltGeo.getAttribute('position').needsUpdate = true
        boltAge = 0
    }

    const handleEvents = (evts, gs) => {
        for (const e of evts) {
            if (e.type === 'boom') { spawnBurst(gs, e.x, e.y, 10, [1.6, 0.6, 0.2]); addScorch(e.x, e.y, 12, 0.4) }
            else if (e.type === 'zap') { makeBolt(gs, e.x, e.y); addScorch(e.x, e.y, 8, 0.3) }
            else if (e.type === 'ignite') { addScorch(e.x, e.y, 5, 0.3) }
            else if (e.type === 'hutDown') { spawnBurst(gs, e.x, e.y, 5, [1.2, 0.5, 0.2]); addScorch(e.x, e.y, 6, 0.4) }
            else if (e.type === 'towerDown') { spawnBurst(gs, e.x, e.y, 14, [1.0, 0.45, 0.2]); addScorch(e.x, e.y, 12, 0.5) }
            else if (e.type === 'wizardDown') { spawnBurst(gs, e.x, e.y, 22, [1.4, 0.5, 0.3]); addScorch(e.x, e.y, 18, 0.6) }
            else if (e.type === 'level') resetWorld()
        }
    }

    const resetWorld = () => { parts.length = 0; marks.length = 0; scorch.fill(0) }

    const uploadData = (gs) => {
        for (let i = 0; i < N * N; i++) {
            hData[i * 4] = Math.max(0, Math.min(255, Math.round(gs.heights[i] * 255 / 96)))
            hData[i * 4 + 1] = 0
            hData[i * 4 + 3] = 255
        }
        for (const c of gs.craters) {
            const glow = c.hot > 0 ? Math.max(0, 1 - (gs.tick - c.t) / 300) : 0
            if (glow <= 0) continue
            const rc = Math.ceil(c.r / CELL)
            const ci = c.x / CELL, cj = c.y / CELL
            for (let j = Math.floor(cj) - rc; j <= Math.floor(cj) + rc; j++) {
                for (let i = Math.floor(ci) - rc; i <= Math.floor(ci) + rc; i++) {
                    const ddx = wrapD(i * CELL + CELL / 2 - c.x), ddy = wrapD(j * CELL + CELL / 2 - c.y)
                    const cd = Math.hypot(ddx, ddy)
                    if (cd > c.r) continue
                    const g = Math.min(1, glow * (1 - cd / c.r))
                    const gi = ((((j % N) + N) % N) * N + (((i % N) + N) % N))
                    hData[gi * 4 + 1] = Math.max(hData[gi * 4 + 1], Math.round(g * 255))
                }
            }
        }
        scorch.fill(0)
        for (const m of marks) {
            const rc = Math.ceil(m.r / CELL)
            const ci = m.x / CELL, cj = m.y / CELL
            for (let j = Math.floor(cj) - rc; j <= Math.floor(cj) + rc; j++) {
                for (let i = Math.floor(ci) - rc; i <= Math.floor(ci) + rc; i++) {
                    const ddx = wrapD(i * CELL + CELL / 2 - m.x), ddy = wrapD(j * CELL + CELL / 2 - m.y)
                    const cd = Math.hypot(ddx, ddy)
                    if (cd > m.r * 1.25) continue
                    const ring = Math.max(0, 1 - Math.abs(cd - m.r * 0.9) / (m.r * 0.4))
                    const v = Math.round(255 * Math.min(1, m.s * (0.7 + ring)))
                    const gi = ((((j % N) + N) % N) * N + (((i % N) + N) % N))
                    if (v > scorch[gi]) scorch[gi] = v
                }
            }
        }
        for (let i = 0; i < N * N; i++) hData[i * 4 + 2] = scorch[i]
        hTex.needsUpdate = true
    }

    // ---- sprites (billboards)
    const sprItems = []
    const pushSpr = (name, x, y, z, tint, alpha, flip, sd) => {
        const s = SPRITES[name]
        sprItems.push({ d: 0, name, x, y, z, w: s.ww, h: s.wh, center: !!s.center, tint: tint || [1, 1, 1], alpha: alpha ?? 1, flip: !!flip, sd: sd ?? null })
    }

    const fillSprites = (gs) => {
        sprItems.length = 0
        const gz = (x, y) => heightAt(gs, x, y)
        for (const p of gs.pearls) {
            if (!p.alive) continue
            pushSpr('pearl', p.x, p.y, p.z, [1.15, 1.0, 0.6], 1)
        }
        for (const b of gs.books) {
            if (b.taken) continue
            pushSpr('book', b.x, b.y, gz(b.x, b.y) + 4 + Math.sin(gs.tick * 0.08 + b.x) * 0.7, [1.1, 1.1, 1.2], 1)
        }
        for (const hs of gs.huts || []) {
            if (hs.dead) pushSpr('rubble', hs.x, hs.y, gz(hs.x, hs.y) + 0.4, [1, 1, 1], 1)
            else if (hs.burn > 0) pushSpr('hutBurn', hs.x, hs.y, gz(hs.x, hs.y), [1, 1, 1], 1)
            else pushSpr('hut', hs.x, hs.y, gz(hs.x, hs.y), [1, 1, 1], 1, false, -5 - hs.v)
        }
        const cst = gs.castleStage
        if (cst > 0) {
            pushSpr(`castle${Math.min(4, cst)}`, gs.castle.x, gs.castle.y, gz(gs.castle.x, gs.castle.y), [1.05, 1.05, 1.15], 1)
            for (let bi = 0; bi < cst; bi++) {
                const bx = gs.castle.x + Math.cos(bi * 2.1) * 26, by = gs.castle.y + Math.sin(bi * 2.1) * 26
                pushSpr('balloon', bx, by, gz(bx, by) + 14 + Math.sin(gs.tick * 0.02 + bi) * 2, [1, 1, 1], 1)
            }
        }
        const wz = gs.wizard
        pushSpr(gs.towerDown ? 'towerFall' : 'towerUp', wz.tx, wz.ty, gz(wz.tx, wz.ty), [1, 1, 1], 1)
        if (wz.alive) pushSpr('wizard', wz.x, wz.y, gz(wz.x, wz.y) + 9 + Math.sin(gs.tick * 0.05) * 1.6, [1.15, 0.85, 1.25], 1)
        for (const m of gs.monsters) {
            if (m.grabbed) continue
            const flip = Math.cos(m.dir) < 0
            if (m.kind === 'giant') pushSpr('giant', m.x, m.y, gz(m.x, m.y) + 0.4, m.hp < 12 ? [1.25, 0.75, 0.6] : [1, 1, 1], 1, flip)
            else if (m.kind === 'wolf') pushSpr('wolf', m.x, m.y, gz(m.x, m.y) + 0.3, [1, 1, 1], 1, flip)
            else pushSpr('cow', m.x, m.y, gz(m.x, m.y) + 0.2, [1, 1, 1], 1, flip)
        }
        for (const fm of gs.fireMarks) {
            if (gs.tick - fm.t > 900) continue
            pushSpr('dot', fm.x, fm.y, gz(fm.x, fm.y) + 0.8, [1.0, 0.35, 0.08], gs.tick - fm.t < 240 ? 0.5 : 0.15)
        }
        for (const p of gs.projs) {
            if (p.kind === 'fireball') pushSpr('fireball', p.x, p.y, p.z, [1.3, 0.7, 0.3], 1)
            else if (p.kind === 'bolt') pushSpr('bolt', p.x, p.y, p.z, [1, 1, 1], 1)
            else if (p.kind === 'rock') pushSpr('rock', p.x, p.y, p.z, [1, 1, 1], 1)
            else if (p.kind === 'arrow') pushSpr('arrow', p.x, p.y, p.z, [1, 1, 1], 1)
            else if (p.kind === 'throw') pushSpr('throw', p.x, p.y, p.z, [1, 1, 1], 1)
        }
        if (gs.heldEnt) {
            pushSpr('throw', gs.x + Math.cos(gs.yaw) * 4, gs.y + Math.sin(gs.yaw) * 4, gs.alt + 1.5, [0.7, 1.2, 1.1], 1)
            pushSpr('dot', gs.x + Math.cos(gs.yaw) * 4, gs.y + Math.sin(gs.yaw) * 4, gs.alt + 1.5, [0.5, 1.5, 1.4], 0.6)
        }
        for (const it of sprItems) it.d = (it.x - tUniforms.uCamPos.value.x) ** 2 + (it.y - tUniforms.uCamPos.value.y) ** 2 + (it.z - tUniforms.uCamPos.value.z) ** 2
        sprItems.sort((a, b) => b.d - a.d)
        const n = Math.min(sprItems.length, CAP)
        for (let i = 0; i < n; i++) {
            const it = sprItems[i], u = atlas.uv[it.name]
            spr.aPos[i * 3] = it.x; spr.aPos[i * 3 + 1] = it.y; spr.aPos[i * 3 + 2] = it.z
            spr.aSize[i * 2] = it.w; spr.aSize[i * 2 + 1] = it.h
            spr.aUv[i * 4] = it.flip ? u.x + u.w : u.x
            spr.aUv[i * 4 + 1] = u.yTop
            spr.aUv[i * 4 + 2] = (it.flip ? -u.w : u.w)
            spr.aUv[i * 4 + 3] = it.center ? -u.h : u.h
            spr.aTint[i * 4] = it.tint[0]; spr.aTint[i * 4 + 1] = it.tint[1]; spr.aTint[i * 4 + 2] = it.tint[2]; spr.aTint[i * 4 + 3] = it.alpha
            spr.aSeed[i] = it.sd ?? i
        }
        spr.geo.instanceCount = n
        markGeo(spr)
    }

    // ---- ambient emitters + particle integrate/upload
    const emitAmbient = (gs) => {
        for (const hs of gs.huts || []) {
            if (hs.dead && Math.random() < 0.3) {
                spawn(hs.x + (Math.random() - 0.5) * 2, heightAt(gs, hs.x, hs.y) + 1.2, hs.y + (Math.random() - 0.5) * 2, 'smoke', (Math.random() - 0.5) * 0.25, 0.55 + Math.random() * 0.4, (Math.random() - 0.5) * 0.25, 1.6 + Math.random() * 1.4, 80 + Math.random() * 50)
            }
            if (hs.burn > 0 && Math.random() < 0.25) {
                spawn(hs.x + (Math.random() - 0.5) * 3, heightAt(gs, hs.x, hs.y) + 2, hs.y + (Math.random() - 0.5) * 3, 'fire', 0, 1.1 + Math.random(), 0, 1.1 + Math.random() * 0.8, 22)
                if (Math.random() < 0.4) spawn(hs.x, heightAt(gs, hs.x, hs.y) + 4.5, hs.y, 'smoke', (Math.random() - 0.5) * 0.4, 0.85 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4, 2.8 + Math.random() * 2.4, 110 + Math.random() * 70)
            }
        }
        for (const c of gs.craters) {
            const glow = c.hot > 0 ? Math.max(0, 1 - (gs.tick - c.t) / 300) : 0
            if (glow > 0.05 && Math.random() < 0.3 * glow) {
                const a = Math.random() * Math.PI * 2, rr = Math.random() * c.r * 0.7
                const px = c.x + Math.cos(a) * rr, py = c.y + Math.sin(a) * rr
                spawn(px, heightAt(gs, px, py) + 0.8, py, 'fire', 0, 0.8 + Math.random() * 0.8, 0, 1.6 + Math.random() * 1.4, 20)
                if (Math.random() < 0.3) spawn(px, heightAt(gs, px, py) + 3, py, 'smoke', 0, 0.9, 0, 2.6, 90)
            }
        }
        for (const p of gs.projs) {
            if (p.kind === 'fireball' && Math.random() < 0.9) spawn(p.x, p.y, p.z, 'fire', -p.vx * 0.1, 0.15, -p.vy * 0.1, 1.1, 14, [1.5, 0.7, 0.25])
            if (p.kind === 'bolt' && Math.random() < 0.5) spawn(p.x, p.y, p.z, 'fire', 0, 0.2, 0, 0.8, 10, [1.1, 0.6, 1.8])
        }
        for (const fm of gs.fireMarks) {
            if (gs.tick - fm.t < 240 && Math.random() < 0.08) {
                const px = fm.x + (Math.random() - 0.5) * 2, py = fm.y + (Math.random() - 0.5) * 2
                spawn(px, heightAt(gs, px, py) + 1, py, 'fire', 0, 0.9, 0, 1.0, 18)
            }
        }
    }

    const markGeo = (b) => {
        for (const k of ['aPos', 'aSize', 'aUv', 'aTint', 'aSeed']) b.geo.getAttribute(k).needsUpdate = true
    }

    const fillParticles = (basis) => {
        let na = 0, ns = 0
        for (const p of parts) {
            p.life -= 1
            if (p.life <= 0) continue
            const age = 1 - p.life / p.maxLife
            p.x += p.vx / 5; p.y += p.vy / 5; p.z += p.vz / 5
            if (p.kind === 'smoke') { p.vy *= 0.985; p.vx += Math.sin(p.seed + p.life * 0.05) * 0.01 }
            if (p.kind === 'ember') p.vy -= 0.06
            const isSmoke = p.kind === 'smoke'
            const b = isSmoke ? smoke : par
            const si = isSmoke ? ns : na
            if (si >= CAP_P) continue
            b.aPos[si * 3] = p.x; b.aPos[si * 3 + 1] = p.y; b.aPos[si * 3 + 2] = p.z
            const sc = p.size * (p.kind === 'flare' ? 1 + age * 1.5 : isSmoke ? 0.6 + age * 1.6 : 1 - age * 0.55)
            b.aSize[si * 2] = sc; b.aSize[si * 2 + 1] = sc
            const u = atlas.uv[isSmoke ? 'smoke' : 'dot']
            b.aUv[si * 4] = u.x; b.aUv[si * 4 + 1] = u.yTop; b.aUv[si * 4 + 2] = u.w; b.aUv[si * 4 + 3] = -u.h
            const tint = p.tint || (isSmoke ? TINT_SMOKE : p.kind === 'ember' ? TINT_EMBER : TINT_FIRE)
            const alpha = isSmoke ? Math.min(1, age * 4) * (1 - age) * 0.5 : p.kind === 'flare' ? (1 - age) : 1 - age * age
            b.aTint[si * 4] = tint[0]; b.aTint[si * 4 + 1] = tint[1]; b.aTint[si * 4 + 2] = tint[2]; b.aTint[si * 4 + 3] = alpha
            b.aSeed[si] = p.seed
            if (isSmoke) ns++; else na++
        }
        for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1)
        // carried-mana halo: orbiting additive motes in front of the camera
        const carry = Math.min(8, Math.floor(gs0.mana / 3))
        for (let i = 0; i < carry && na < CAP_P; i++) {
            const a = gs0.tick * 0.045 + (i / 8) * Math.PI * 2
            const ox = Math.cos(a) * (1.9 + i * 0.18)
            const oy = Math.sin(a) * 0.7 - 0.7
            const p = camera.position.clone().addScaledVector(basis.fwd, 7.5).addScaledVector(basis.right, ox).addScaledVector(basis.up, oy)
            par.aPos[na * 3] = p.x; par.aPos[na * 3 + 1] = p.y; par.aPos[na * 3 + 2] = p.z
            par.aSize[na * 2] = 0.5; par.aSize[na * 2 + 1] = 0.5
            const u = atlas.uv.dot
            par.aUv[na * 4] = u.x; par.aUv[na * 4 + 1] = u.yTop; par.aUv[na * 4 + 2] = u.w; par.aUv[na * 4 + 3] = -u.h
            par.aTint[na * 4] = 1.4; par.aTint[na * 4 + 1] = 1.05; par.aTint[na * 4 + 2] = 0.35; par.aTint[na * 4 + 3] = 0.85
            par.aSeed[na] = 40 + i
            na++
        }
        par.geo.instanceCount = na
        smoke.geo.instanceCount = ns
        markGeo(par); markGeo(smoke)
    }
    let gs0 = null

    const applyPalette = (level) => {
        const p = PAL[Math.min(level, PAL.length - 1)]
        tUniforms.uZenith.value.copy(v3(p.zenith))
        tUniforms.uFogCol.value.copy(v3(p.fog))
        tUniforms.uSunCol.value.copy(v3(p.sun))
        tUniforms.uDeep.value.copy(v3(p.deep))
        tUniforms.uShallow.value.copy(v3(p.shallow))
        tUniforms.uFoam.value.copy(v3(p.foam))
        tUniforms.uSand.value.copy(v3(p.sand))
        tUniforms.uGrassA.value.copy(v3(p.grassA))
        tUniforms.uGrassB.value.copy(v3(p.grassB))
        tUniforms.uRock.value.copy(v3(p.rock))
        tUniforms.uSnow.value.copy(v3(p.snow))
        sUniforms.uZenith.value.copy(v3(p.zenith))
        sUniforms.uHorizon.value.copy(v3(p.fog))
        sUniforms.uCloudCol.value.copy(v3(p.cloud))
        sUniforms.uCloudMix.value = p.cloudMix
        sunAz = p.sunAz; sunEl = p.sunEl
        tUniforms.uSunDir.value.set(Math.cos(sunAz) * Math.cos(sunEl), Math.sin(sunEl), Math.sin(sunAz) * Math.cos(sunEl)).normalize()
    }
    let sunAz = 2.1, sunEl = 0.62
    let lastLevel = -1

    const resize = (w, h) => {
        const Wpx = Math.max(2, Math.floor(w)), Hpx = Math.max(2, Math.floor(h))
        renderer.setPixelRatio(1)
        renderer.setSize(Wpx, Hpx, false)
        rtScene.setSize(Wpx, Hpx)
        const bw = Math.max(2, Math.floor(Wpx / 4)), bh = Math.max(2, Math.floor(Hpx / 4))
        rtA.setSize(bw, bh); rtB.setSize(bw, bh)
        camera.aspect = Wpx / Hpx
    }

    const frame = (gs, view = {}) => {
        gs0 = gs
        if (gs.level !== lastLevel) { applyPalette(gs.level); lastLevel = gs.level }
        uploadData(gs)
        emitAmbient(gs)
        tUniforms.uTime.value = performance.now() / 1000
        tUniforms.uWorldTime.value = gs.tick

        const bank = view.bank || 0
        const cpP = (view.pitch ?? 0.06) + (view.sink || 0)
        const boost = view.boost ? 1 : 0
        const cp = tUniforms.uCamPos.value.set(gs.x, gs.alt + Math.sin(gs.tick * 0.09) * 0.18, gs.y)
        const fwd = new THREE.Vector3(Math.cos(gs.yaw) * Math.cos(cpP), -Math.sin(cpP), Math.sin(gs.yaw) * Math.cos(cpP)).normalize()
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
        let up = new THREE.Vector3().crossVectors(right, fwd).normalize()
        const roll = bank * 0.34
        up = up.clone().multiplyScalar(Math.cos(roll)).addScaledVector(right, Math.sin(roll))
        camera.position.copy(cp)
        if (view.shakeX || view.shakeY) {
            camera.position.addScaledVector(right, (view.shakeX || 0) * 0.02)
            camera.position.addScaledVector(up, -(view.shakeY || 0) * 0.02)
        }
        camera.up.copy(up)
        camera.lookAt(cp.clone().add(fwd))
        const hfov = THREE.MathUtils.degToRad(80) + boost * 0.12
        camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / Math.max(camera.aspect, 0.5)))
        camera.updateProjectionMatrix()
        sky.position.copy(cp)
        tUniforms.uOrigin.value.set(Math.floor(gs.x / CELL) * CELL, Math.floor(gs.y / CELL) * CELL)
        const sunUp = Math.max(0.25, sunEl)
        for (const m of [sprMesh, parMesh, smokeMesh]) m.material.uniforms.uSunUp.value = sunUp
        for (const m of [sprMesh, parMesh, smokeMesh]) {
            m.material.uniforms.uRight.value.copy(right)
            m.material.uniforms.uUp.value.copy(up)
            m.material.uniforms.uFwd.value.copy(fwd)
        }
        fillSprites(gs)
        fillParticles({ fwd, right, up })
        boltAge += 1
        boltMat.uniforms.uFade.value = Math.max(0, 1 - boltAge / 16)

        const bsz = Math.max(rtA.width, 1)
        renderer.setRenderTarget(rtScene)
        renderer.clear()
        renderer.render(scene, camera)
        brightMesh.material.uniforms.uT.value = rtScene.texture
        renderer.setRenderTarget(rtA); renderer.render(scBright, quadCam)
        blurMesh.material.uniforms.uT.value = rtA.texture; blurMesh.material.uniforms.uDir.value.set(1.4 / bsz, 0)
        renderer.setRenderTarget(rtB); renderer.render(scBlur, quadCam)
        blurMesh.material.uniforms.uT.value = rtB.texture; blurMesh.material.uniforms.uDir.value.set(0, 1.4 / bsz)
        renderer.setRenderTarget(rtA); renderer.render(scBlur, quadCam)
        compMesh.material.uniforms.uScene.value = rtScene.texture
        compMesh.material.uniforms.uBloom.value = rtA.texture
        compMesh.material.uniforms.uBloomAmt.value = hdr ? 0.85 : 0.7
        renderer.setRenderTarget(null)
        renderer.render(scComp, quadCam)
    }

    applyPalette(0)
    resize(640, 400)

    return {
        gl,
        renderer,
        resize,
        frame,
        handleEvents,
        resetWorld,
        applyPalette,
        particleCount: () => parts.length,
        smokeCount: () => smoke.geo.instanceCount,
        spriteCount: () => spr.geo.instanceCount,
        glowCells: () => { let n = 0; for (let i = 0; i < N * N; i++) if (hData[i * 4 + 1] > 0) n++; return n },
        scorchCells: () => { let n = 0; for (let i = 0; i < N * N; i++) if (hData[i * 4 + 2] > 0) n++; return n },
        dispose() {
            rtScene.dispose(); rtA.dispose(); rtB.dispose()
            terrGeo.dispose(); spr.geo.dispose(); par.geo.dispose(); smoke.geo.dispose(); boltGeo.dispose()
            atlas.tex.dispose(); hTex.dispose()
            renderer.dispose()
            THREE.ColorManagement.enabled = cmPrev
        },
    }
}
