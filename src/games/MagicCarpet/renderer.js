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
import { MAP, GRID, WATER, SANDL, GRASSL, ROCKL, FOG_NEAR, FOG_D, HAZE } from './sim.js'
import {
    drawPearl, drawBook, drawBalloon, drawCastle, drawTower, drawWizard,
    drawGiant, drawWolf, drawCow, drawVillager, drawHut, drawFireball, drawBolt,
} from './art.js'

const N = GRID
const CELL = MAP / GRID
const SPAN = 72
const HALF = (SPAN * CELL) / 2
// FOG_D/FOG_NEAR/HAZE (#1764 item 5 stage 5) come from sim.js — the single
// source of the aerial-perspective law; the GLSL below bakes those literals.

// The aerial law in GLSL, mirroring aerialFog() in sim.js constant-for-constant:
// haze is a ground-hugging layer (dense at/below floorY, crisp above topY) and
// the camera's altitude thins the path (airOf). Injected at every fog site so
// no site can drift back to a distance-only mix.
const AIR_GLSL = `
float hazeOfG(float y){ return ${HAZE.keep} + ${1 - HAZE.keep} * clamp((${HAZE.topY}.0 - y) / ${(HAZE.topY - HAZE.floorY)}.0, 0.0, 1.0); }
float airOfG(float camY){ return max(${HAZE.floor}, 1.0 - ${1 - HAZE.floor} * max(0.0, camY - ${HAZE.nearY}.0) / ${(HAZE.farY - HAZE.nearY)}.0); }
float aerialG(float dist, float y, float camY){ return smoothstep(${FOG_NEAR}.0, uFogD, dist) * hazeOfG(y) * airOfG(camY); }
`

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
    // #1764 item 2 — the rival's castle as it grows: wall, turrets, keep.
    wizCastle1: { l: -13, r: 13, t: 19.6, b: -1.6, wh: 12, ww: 9 },
    wizCastle2: { l: -16.5, r: 16.5, t: 19.6, b: -1.6, wh: 12, ww: 11 },
    wizCastle3: { l: -16.5, r: 16.5, t: 27, b: -1.6, wh: 15, ww: 11 },
    towerFall: { l: -10.4, r: 10.4, t: 8.4, b: -1.4, wh: 4.6, ww: 8 },
    wizard: { l: -5, r: 5, t: 12.8, b: -1.4, wh: 3.4, ww: 2.2 },
    giant: { l: -5.6, r: 5.6, t: 16.4, b: -0.4, wh: 7, ww: 2.4 },
    wolf: { l: -5.6, r: 5.6, t: 6.6, b: -0.4, wh: 1.9, ww: 1.9 },
    cow: { l: -3.6, r: 3.6, t: 4.6, b: -0.4, wh: 1.35, ww: 1.35 },
    // #1764 item 3 — the villagers, one tile per tunic variant.
    villager0: { l: -3.4, r: 3.4, t: 7.6, b: -1.2, wh: 3.0, ww: 2.0 },
    villager1: { l: -3.4, r: 3.4, t: 7.6, b: -1.2, wh: 3.0, ww: 2.0 },
    villager2: { l: -3.4, r: 3.4, t: 7.6, b: -1.2, wh: 3.0, ww: 2.0 },
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
    quest: { l: -4, r: 4, t: 4, b: -4, wh: 2.8, ww: 2.8, center: true },
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
    blit('wizCastle1', (u) => drawTower(ctx, u.cx, u.cy, u.k, 6, true, false, 1))
    blit('wizCastle2', (u) => drawTower(ctx, u.cx, u.cy, u.k, 6, true, false, 2))
    blit('wizCastle3', (u) => drawTower(ctx, u.cx, u.cy, u.k, 6, true, false, 3))
    blit('towerFall', (u) => drawTower(ctx, u.cx, u.cy, u.k, 6, true, true))
    blit('wizard', (u) => drawWizard(ctx, u.cx, u.cy, u.k, 6))
    blit('giant', (u) => drawGiant(ctx, u.cx, u.cy, u.k, 6, false))
    blit('wolf', (u) => drawWolf(ctx, u.cx, u.cy, u.k, 6, true))
    blit('cow', (u) => drawCow(ctx, u.cx, u.cy, u.k))
    blit('villager0', (u) => drawVillager(ctx, u.cx, u.cy, u.k, 6, 0))
    blit('villager1', (u) => drawVillager(ctx, u.cx, u.cy, u.k, 6, 1))
    blit('villager2', (u) => drawVillager(ctx, u.cx, u.cy, u.k, 6, 2))
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
    blit('quest', (u) => {
        const k = u.k
        ctx.font = `bold ${Math.round(k * 5.6)}px Georgia, 'Times New Roman', serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.lineWidth = Math.max(2, k * 0.9)
        ctx.strokeStyle = 'rgba(24,16,48,0.9)'
        ctx.strokeText('?', u.cx, u.cy + k * 0.2)
        ctx.fillStyle = '#ffd75e'
        ctx.fillText('?', u.cx, u.cy + k * 0.2)
        ctx.fillStyle = 'rgba(255,240,180,0.55)'
        ctx.fillText('?', u.cx, u.cy + k * 0.05)
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
${AIR_GLSL}
void main(){
    vec2 q = uv;
    float anchor = aUv.w < 0.0 ? 0.5 : 0.0; // packed: negative stored h means centered anchor
    vec3 relC = aPos - uCamPos;
    float elev = relC.y / max(length(relC), 1.0);
    float lean = smoothstep(0.12, -0.32, elev) * 0.32;
    vec3 upv = normalize(mix(uUp, uFwd, lean));
    vec3 world = aPos + uRight * (q.x - 0.5) * aSize.x + upv * (q.y - anchor) * aSize.y;
    vec3 rel = world - uCamPos;
    vFog = aerialG(length(rel), aPos.y, uCamPos.y);
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

// #1764 item 4 stage 1 — the original's 4-bit palette-cycled ocean:
// the depth bands are HARD levels (no smoothstep between them) and the
// palette index marches every stepTicks of world time, so colours flow
// through fixed wave shapes like the 1994 original's palette animation.
export const WAVE_CYCLE = { levels: 4, stepTicks: 6 }

// #1764 item 4 stage 4 — travelling crests. Stage 1 left the wave SHAPES
// sitting still while only the colours walked; the original's sea moved —
// crests travelled. The bpos noise field now advects diagonally through
// noise space at WAVE_TRAVEL noise-units per sim tick (the same uWorldTime
// clock the palette cycle rides, so determinism is untouched), and band
// edges crawl the sea. World-space crest speed = value / 0.7 · 60 u/s —
// at {0.026, 0.020} that is ≈2.2 u/s east and ≈1.7 u/s north, the same
// drift family as the sparkle field below (rp advects at 0.02/0.014 on
// scale 0.55) so the crests and the sparkle walk WITH the water, not
// against it.
export const WAVE_TRAVEL = { x: 0.026, y: 0.020 }

// #1764 item 5 stage 6 — VOLUMETRIC CLOUD BODIES. The honest gap said the
// clouds were two dome-painted layers: no body, no parallax, and the drifting
// ground shadow came from nowhere. The deck is now a lattice of cloud BODIES
// sitting at finite altitude (baseY..baseY+lift, above every terrain top —
// heights clamp at 96u in the sim — while the carpet ceiling of 120u lets the
// climb graze the underside). Each body is a cluster of soft sun-lit billboard
// puffs. The deck is born FROM the ground-shadow field: buildCloudCells()
// places a body wherever the JS twin of the terrain's cshade fbm2 exceeds
// CLOUD_FIELD.floor, and the bodies drift at CLOUD_WIND = -drift/scale — the
// exact world velocity the shadow field's own advance implies (the terrain
// sample below still adds +uWorldTime*drift, now written with those shared
// literals). So a body rides over the shadow it "casts" at every tick: shade
// under a body is the same noise value as the body's density, by algebra
// (anchor·scale + t·drift is time-invariant), until the recirculation wrap.
// Presentation-only: sim.js never learns any of this.
export const CLOUD_SCALE = 0.011
export const CLOUD_DRIFT = { x: 0.0016, y: 0.0009 } // noise-units per sim tick — the terrain cshade law's own constants
export const CLOUD_WIND = { x: -CLOUD_DRIFT.x / CLOUD_SCALE, y: -CLOUD_DRIFT.y / CLOUD_SCALE } // world u/tick the bodies (and their shadows) travel
export const CLOUD_FIELD = {
    baseY: 112, lift: 30,          // deck altitude: centres 112..142u
    cell: 96, jitter: 0.35,       // lattice step ≈ one noise cell of the shadow field (1/scale ≈ 91u)
    floor: 0.55,                  // cell density required to raise a body
    puffs: 4,                     // billboard puffs per body
    r: 480,                       // recirculation radius; bodies fold through a fade shell
    fade0: 380, fade1: 470,       // alpha shell: a body is invisible before it folds
    domeKeep: 0.45,               // the dome's primary painted layer steps back to this share of its mix
    baseA: 0.9,                   // core alpha of a body's puffs before density/fog/shell
}

const fract1 = (v) => v - Math.floor(v)
const hash21js = (x, y) => {
    const px = fract1(x * 234.34), py = fract1(y * 435.345)
    const d = px * (px + 34.23) + py * (py + 34.23)
    return fract1((px + d) * (py + d))
}
const vnoiseJs = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y)
    let fx = fract1(x), fy = fract1(y)
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    const a = hash21js(ix, iy), b = hash21js(ix + 1, iy), c = hash21js(ix, iy + 1), d = hash21js(ix + 1, iy + 1)
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy
}
const fbm2Js = (x, y) => vnoiseJs(x, y) * 0.6 + vnoiseJs(x * 2.7 + 13.1, y * 2.7 + 13.1) * 0.4

// The deck, as data: one entry per cloud body that the shadow field raises.
// Density d is the SHADOW value under the body at t=0 (same field, same
// origin) — the tie that makes each shade sit under its cloud. Pure: no RNG,
// no gs, no clock; every call returns the identical deck.
export function buildCloudCells() {
    const F = CLOUD_FIELD
    const K = Math.floor(F.r / F.cell)
    const out = []
    for (let ix = -K; ix <= K; ix++) {
        for (let iz = -K; iz <= K; iz++) {
            const jx = (hash21js(ix * 7.13, iz * 3.71) - 0.5) * 2 * F.jitter
            const jz = (hash21js(ix * 2.97 + 11.3, iz * 5.41 + 7.7) - 0.5) * 2 * F.jitter
            const x = (ix + jx) * F.cell
            const z = (iz + jz) * F.cell
            const d = fbm2Js(x * CLOUD_SCALE, z * CLOUD_SCALE)
            if (d < F.floor) continue
            out.push({
                ix, iz, x, y: F.baseY + hash21js(x * 0.31 + 5.7, z * 0.17 + 9.3) * F.lift, z,
                d, size: F.cell * (0.5 + 0.75 * d), seed: hash21js(ix + 0.5, iz - 0.5),
            })
        }
    }
    return out
}

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
${AIR_GLSL}
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
    // #1764 item 4 stage 5: SEA FROM BELOW — how far under the surface the
    // eye sits (0 dry, 1 a metre or more under). View-dependent presentation
    // read, like the stage-2 dive composite; the sim never sees it.
    float under = smoothstep(0.0, 1.0, ${WATER}.0 - uCamPos.y);
    if (vH < ${WATER}.0) {
        float depth = ${WATER}.0 - vH;
        float bpos = depth * 0.28 + fbm2(vWorld.xz * 0.7 + uWorldTime * vec2(${WAVE_TRAVEL.x}, ${WAVE_TRAVEL.y}) + 3.3) * 0.45;
        // #1764 item 4 stage 1: hard 4-level band, palette index marching with
        // world time (the original's 4-bit wave cycle). The colours walk
        // shallow→deep one level per stepTicks — 16-colour flow. Stage 4 put
        // the SHAPES in motion too: bpos samples an advected noise field
        // (WAVE_TRAVEL per sim tick), so the crests travel and band edges
        // crawl the sea instead of sitting still.
        float lvl = clamp(floor(bpos), 0.0, ${WAVE_CYCLE.levels - 1}.0);
        float cyc = mod(lvl + floor(uWorldTime / ${WAVE_CYCLE.stepTicks}.0), ${WAVE_CYCLE.levels}.0);
        vec3 wcol = mix(uShallow, uDeep, cyc / ${WAVE_CYCLE.levels - 1}.0);
        wcol *= mix(1.0, 0.72, clamp(depth * 0.1, 0.0, 1.0));
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
        if (under < 0.5) {
            wcol = mix(wcol, uZenith * 1.2, fres * 0.45);
            wcol *= wsh * (0.9 + 0.1 * sin(rip * 1.4 + vWorld.z * 0.04));
            wcol += uSunCol * spec * 0.9;
            wcol += uSunCol * spark * 2.4;
            float shore = smoothstep(3.2 + fbm2(vWorld.xz * 0.3) * 1.7, 0.35, depth);
            float foam = shore * (0.45 + 0.55 * fbm2(vWorld.xz * 0.9 + uWorldTime * 0.014));
            float lace = smoothstep(0.9, 1.6, depth + fbm2(vWorld.xz * 1.6 - uWorldTime * 0.02)) * shore;
            wcol = mix(wcol, uFoam, clamp(foam + lace * 0.5, 0.0, 1.0) * 0.85);
            col = wcol;
        } else {
            // #1764 item 4 stage 5: the surface seen from below — the SAME
            // advected crest bands (wcol, stages 1+4) silvered into a ceiling:
            // transmitted light that tracks the sun's bearing through the waves,
            // shimmer on the shared ripple clock, and a span that sinks into
            // the deep instead of lifting to sky. Foam stays on top — it is a
            // surface-top phenomenon, and the ceiling never wears it.
            vec3 fdir = normalize(vWorld - uCamPos);
            float sdn = max(dot(fdir, uSunDir), 0.0);
            float shim = 0.5 + 0.5 * sin(rip * 1.6 + uWorldTime * 0.045);
            vec3 cc = mix(wcol * 0.5, vec3(0.30, 0.62, 0.74), 0.55 + 0.25 * shim);
            cc += uSunCol * pow(sdn, 24.0) * (0.5 + 0.8 * shim);
            cc += uSunCol * pow(sdn, 3.5) * 0.10;
            col = mix(cc, vec3(0.02, 0.07, 0.11), smoothstep(18.0, 95.0, vDist));
        }
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
    // #1764 item 5 stage 6: literals baked from CLOUD_SCALE/CLOUD_DRIFT — the
    // same constants buildCloudCells() places bodies by and CLOUD_WIND derives
    // its velocity from, so bodies and shade travel together by construction.
    float cshade = fbm2(vWorld.xz * ${CLOUD_SCALE} + vec2(uWorldTime * ${CLOUD_DRIFT.x}, uWorldTime * ${CLOUD_DRIFT.y}));
    col *= 1.0 - 0.22 * smoothstep(0.48, 0.76, cshade);
    // #1764 item 5 stage 5: aerial perspective — the haze layer (hazeOfG) and
    // the carpet's altitude (airOfG) shape the mix; the max() keeps the original
    // horizon fuse: the grid edge must still dissolve into the fog color.
    // #1764 item 4 stage 5: under the sea the far span fades to the deep, never
    // to sky — the ceiling keeps its distance-darkened teal to the grid edge.
    col = mix(col, mix(uFogCol, vec3(0.02, 0.07, 0.11), under), max(aerialG(vDist, vH, uCamPos.y) * 0.92, smoothstep(${HALF - 28}.0, ${HALF - 4}.0, vDist) * 0.92));
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
        uSub: { value: 0 }, // #1764 item 4 stage 2: submersion 0..1 — from below the sea the dome is deep water, not sky
    }
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(900, 32, 18),
        new THREE.ShaderMaterial({
            uniforms: sUniforms, side: THREE.BackSide, depthWrite: false,
            vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: `
precision highp float;
 uniform vec3 uZenith, uHorizon, uSunDir, uSunCol, uCloudCol; uniform float uCloudMix, uTime, uWorldTime, uSub;
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
    // #1764 item 5 stage 6: the primary painted layer steps back (domeKeep) —
    // the bodies are the cumulus now; the dome keeps a thinner veil behind them.
    col = mix(col, uCloudCol * (0.86 + 0.3 * fine), cov * uCloudMix * ${CLOUD_FIELD.domeKeep});
    // #1764 item 4 stage 2: submerged, the dome is the underside of the sea —
    // deep teal, sun reduced to a wavering shaft overhead (light through waves).
    float shaft = pow(max(0.0, d.y), 1.5) * (0.5 + 0.5 * sin(d.x * 9.0 + uWorldTime * 0.11) * sin(d.z * 7.0 - uWorldTime * 0.08));
    col = mix(col, mix(vec3(0.015, 0.07, 0.12), vec3(0.10, 0.26, 0.30), shaft), uSub);
    gl_FragColor = vec4(col, 1.0);
}
`,
        }),
    )
    sky.frustumCulled = false
    scene.add(sky)

    // ---- volumetric cloud bodies (#1764 item 5 stage 6)
    // Instanced sun-lit puff clusters at finite altitude. The vertex shader
    // folds each anchor through the recirculation wrap on the same uWorldTime
    // clock the shadows ride (wind = CLOUD_WIND, the shadow field's own world
    // velocity), then billboards the puff against the live camera basis. The
    // fog is the aerial law (AIR_GLSL) — a distant deck sits in the same
    // haze layer as distant ground — and the alpha carries the wrap shell plus
    // the dive gate: under the sea the deck is gone (the ceiling is the sea).
    const cloudCells = buildCloudCells()
    const cUniforms = {
        uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) },
        uCamPos: tUniforms.uCamPos, uFogCol: tUniforms.uFogCol, uFogD: tUniforms.uFogD,
        uWorldTime: tUniforms.uWorldTime, uSub: sUniforms.uSub,
        uCloudCol: sUniforms.uCloudCol, uCloudMix: sUniforms.uCloudMix,
        uSunScr: { value: new THREE.Vector2(0.7, 0.5) },
    }
    const cloudGeo = new THREE.InstancedBufferGeometry()
    {
        const base = new THREE.PlaneGeometry(1, 1)
        cloudGeo.index = base.index
        cloudGeo.setAttribute('position', base.getAttribute('position'))
        cloudGeo.setAttribute('uv', base.getAttribute('uv'))
        const n = cloudCells.length * CLOUD_FIELD.puffs
        const aAnchor = new Float32Array(n * 3)
        const aOff = new Float32Array(n * 3)
        const aSize = new Float32Array(n)
        const aSeed = new Float32Array(n)
        const aDens = new Float32Array(n)
        let k = 0
        for (const c of cloudCells) {
            for (let p = 0; p < CLOUD_FIELD.puffs; p++) {
                const hs = hash21js(c.seed * 13.1 + p * 7.7, c.ix * 3.3 - c.iz * 1.7 + p)
                const hb = hash21js(c.seed * 5.9 - p * 2.3, c.ix + c.iz * 0.7 + p * 11.1)
                const ha = hash21js(c.seed * 1.7 + p * 3.1, c.ix * 0.9 + p * 1.3)
                const ang = (p / CLOUD_FIELD.puffs) * Math.PI * 2 + c.seed * 6.2831
                const rad = p === 0 ? c.size * 0.06 : c.size * (0.16 + 0.26 * hs)
                aAnchor[k * 3] = c.x; aAnchor[k * 3 + 1] = c.y; aAnchor[k * 3 + 2] = c.z
                aOff[k * 3] = Math.cos(ang) * rad
                aOff[k * 3 + 1] = (hb - 0.5) * c.size * 0.3
                aOff[k * 3 + 2] = Math.sin(ang) * rad
                aSize[k] = c.size * (0.55 + 0.4 * ha)
                aSeed[k] = c.seed + p * 0.37
                aDens[k] = Math.min(1, CLOUD_FIELD.baseA * (0.55 + (c.d - CLOUD_FIELD.floor) * 1.1))
                k++
            }
        }
        cloudGeo.setAttribute('aAnchor', new THREE.InstancedBufferAttribute(aAnchor, 3))
        cloudGeo.setAttribute('aOff', new THREE.InstancedBufferAttribute(aOff, 3))
        cloudGeo.setAttribute('aSize', new THREE.InstancedBufferAttribute(aSize, 1))
        cloudGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1))
        cloudGeo.setAttribute('aDens', new THREE.InstancedBufferAttribute(aDens, 1))
        cloudGeo.instanceCount = n
    }
    const cloudMesh = new THREE.Mesh(cloudGeo, new THREE.ShaderMaterial({
        uniforms: cUniforms, transparent: true, depthWrite: false, depthTest: true,
        vertexShader: `
uniform vec3 uRight, uUp, uCamPos; uniform float uWorldTime, uFogD;
attribute vec3 aAnchor; attribute vec3 aOff; attribute float aSize; attribute float aSeed; attribute float aDens;
varying vec2 vP; varying float vFog, vAlpha, vSeed, vLitH;
${AIR_GLSL}
void main(){
    vec2 q = uv;
    float wx = mod(aAnchor.x + uWorldTime * (${CLOUD_WIND.x}) + ${CLOUD_FIELD.r}.0, ${(2 * CLOUD_FIELD.r)}.0) - ${CLOUD_FIELD.r}.0;
    float wz = mod(aAnchor.z + uWorldTime * (${CLOUD_WIND.y}) + ${CLOUD_FIELD.r}.0, ${(2 * CLOUD_FIELD.r)}.0) - ${CLOUD_FIELD.r}.0;
    vec3 anchor = vec3(wx, aAnchor.y, wz) + aOff;
    vec3 world = anchor + uRight * (q.x - 0.5) * aSize + uUp * (q.y - 0.5) * aSize;
    float d = length(anchor - uCamPos);
    vFog = aerialG(d, aAnchor.y, uCamPos.y);
    float shell = 1.0 - smoothstep(${CLOUD_FIELD.fade0}.0, ${CLOUD_FIELD.fade1}.0, length(vec2(wx, wz)));
    float nearf = smoothstep(26.0, 74.0, d);
    vAlpha = aDens * shell * nearf;
    vP = (q - 0.5) * 2.0;
    vSeed = aSeed;
    vLitH = clamp((aAnchor.y + aOff.y - ${CLOUD_FIELD.baseY}.0) / ${CLOUD_FIELD.lift}.0, 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`,
        fragmentShader: `
precision highp float;
uniform vec3 uCloudCol, uFogCol; uniform vec2 uSunScr; uniform float uCloudMix, uSub;
varying vec2 vP; varying float vFog, vAlpha, vSeed, vLitH;
void main(){
    float ang = atan(vP.y, vP.x);
    float lobes = 0.80 + 0.20 * sin(ang * 3.0 + vSeed * 6.2831) + 0.10 * sin(ang * 5.0 - vSeed * 4.13);
    float rr = length(vP) / max(lobes, 0.4);
    float disc = smoothstep(1.0, 0.42, rr);
    if (disc <= 0.002) discard;
    float lit = clamp(0.28 + 0.5 * vLitH + 0.42 * dot(normalize(vP + vec2(1e-4)), normalize(uSunScr)), 0.0, 1.0);
    vec3 col = mix(uCloudCol * 0.52, uCloudCol * 1.14, lit);
    col += vec3(0.10, 0.10, 0.13) * smoothstep(0.9, 0.5, rr) * vLitH * lit;
    float alpha = disc * vAlpha * (0.55 + 0.45 * uCloudMix) * (1.0 - vFog * 0.88) * (1.0 - uSub);
    col = mix(col, uFogCol, vFog);
    gl_FragColor = vec4(col, alpha);
}
`,
    }))
    cloudMesh.frustumCulled = false
    cloudMesh.renderOrder = -1
    scene.add(cloudMesh)

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
        uniforms: { uFade: { value: 0 }, uCamPos: tUniforms.uCamPos, uFogCol: tUniforms.uFogCol, uFogD: tUniforms.uFogD },
        // #1764 item 5 stage 5: a distant bolt dims through the same aerial law
        // (its strike height rides position.y), so far lightning reads as glow in
        // the haze instead of a full-bright crack at the horizon.
        vertexShader: `uniform vec3 uCamPos; uniform float uFogD; varying float vFog; ${AIR_GLSL} void main(){ vFog = aerialG(length(position - uCamPos), position.y, uCamPos.y); gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
        fragmentShader: 'precision highp float; uniform float uFade; uniform vec3 uFogCol; varying float vFog; void main(){ gl_FragColor = vec4(mix(vec3(0.85, 0.9, 1.6), uFogCol, vFog), uFade); }',
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
    // #1790 ANAGLYPH STEREO: eye buffers hold the composed world (byte — these
    // carry display values, not HDR). The HUD overlay never sees stereo: it is
    // a chart, not world, and the original's glasses were on the world window.
    const rtEyeL = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: false, type: THREE.UnsignedByteType })
    const rtEyeR = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: false, type: THREE.UnsignedByteType })
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
precision highp float; uniform sampler2D uScene, uBloom; uniform float uBloomAmt, uSub, uWorldTime; varying vec2 vQ;
float hsub(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
    vec3 c = texture2D(uScene, vQ).rgb + texture2D(uBloom, vQ).rgb * uBloomAmt;
    vec2 v = vQ - 0.5;
    c *= 1.0 - dot(v, v) * 0.42;
    c = c * 1.04 - 0.015;
    // #1764 item 4 stage 2: UNDERWATER. Depth eats the reds first (the sea is a
    // red filter), light bends into walking caustic bands, and cold bubbles rise
    // past the glass. All driven by sim ticks (uWorldTime), never wall time.
    if (uSub > 0.0) {
        float ca = 0.5 + 0.5 * sin(vQ.x * 21.0 + uWorldTime * 0.09 + sin(vQ.y * 13.0 - uWorldTime * 0.055) * 1.4);
        ca = ca * ca * ca;
        vec3 u = c * vec3(0.30, 0.62, 0.78) + vec3(0.04, 0.14, 0.18) * ca;
        vec2 cell = floor(vQ * vec2(52.0, 30.0));
        float bh = hsub(cell);
        float rise = fract(bh * 7.0 - uWorldTime * 0.045 * (0.6 + bh));
        vec2 bp = (fract(vQ * vec2(52.0, 30.0)) - vec2(0.35 + 0.3 * bh, rise));
        float bub = smoothstep(0.16, 0.05, length(bp)) * step(0.80, bh) * step(rise, 0.7);
        u += vec3(0.16, 0.30, 0.34) * bub;
        u = mix(u, vec3(0.02, 0.09, 0.16), 0.22);
        c = mix(c, u, uSub);
    }
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`, { uScene: { value: null }, uBloom: { value: null }, uBloomAmt: { value: 0.75 }, uSub: { value: 0 }, uWorldTime: tUniforms.uWorldTime }))
    const scBright = mkScene(brightMesh)
    const scBlur = mkScene(blurMesh)
    const scComp = mkScene(compMesh)
    // #1790: the anaglyph combine — left eye into red, right into cyan. The
    // classic optical pick: 1994 red/cyan glasses filtered light, they did not
    // run algorithms, so neither does this (no ghost-crush — warm fire stays
    // warm, exactly the period trade the original's players wore on their faces).
    const anaglyphMesh = new THREE.Mesh(quad, qmat(`
precision highp float; uniform sampler2D uL, uR; varying vec2 vQ;
void main(){
    gl_FragColor = vec4(texture2D(uL, vQ).r, texture2D(uR, vQ).g, texture2D(uR, vQ).b, 1.0);
}
`, { uL: { value: null }, uR: { value: null } }))
    const scAnaglyph = mkScene(anaglyphMesh)
    // #1764 item 8: ROW-INTERLACED stereo — the shutter-era "line mode": every
    // other scan line carries the other eye (even physical rows left, odd right;
    // gl_FragCoord.y = row + 0.5, so floor(y) is the row index). Row-alternate
    // was how soft stereo reached row-interlaced LCD panels and shutter glasses
    // without a channel hack — each eye gets the full colour at half the vertical
    // lines, the inverse trade of anaglyph. No ghost-crush: same period law.
    const interlaceMesh = new THREE.Mesh(quad, qmat(`
precision highp float; uniform sampler2D uL, uR; varying vec2 vQ;
void main(){
    gl_FragColor = mod(floor(gl_FragCoord.y), 2.0) < 1.0 ? texture2D(uL, vQ) : texture2D(uR, vQ);
}
`, { uL: { value: null }, uR: { value: null } }))
    const scInterlace = mkScene(interlaceMesh)
    // #1790 eye separation, world units. At the carpet's own scale (pearls hover
    // ~10u away, the castle tens of units) this is a strong-but-comfortable pop:
    // ~9 px of parallax at arm's length, ~1 px at the horizon — parallel view,
    // converged at infinity, the same cheat every stereo card of the era used.
    const IPD = 0.60
    let stereo = false
    // #1764 item 8: which combine the glasses-free mode uses — 'anaglyph' (the
    // #1790 default) or 'interlace' (row-alternate lines). Power (stereo) and
    // glass type (stereoMode) are separate switches: V flips power, T cycles glass.
    let stereoMode = 'anaglyph'

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

    // #1646: the original crumbled creatures into ash where they fell. Cold
    // grit that hops and settles — no fire, no scorch: the renderer keeps the
    // sim's kill-without-cinders promise even for shatter's victims. Per-kind
    // sizes and tints so a giant comes down differently from a wolf.
    const CRUMBLE = {
        wolf: { n: 8, col: [0.5, 0.46, 0.5], size: 0.6 },
        giant: { n: 14, col: [0.62, 0.58, 0.6], size: 1.0 },
        cow: { n: 8, col: [0.85, 0.8, 0.74], size: 0.7 },
    }
    const spawnCrumble = (gs, x, y, kind) => {
        const c = CRUMBLE[kind] || CRUMBLE.wolf
        const h = heightAt(gs, x, y)
        for (let i = 0; i < c.n; i++) {
            const a = Math.random() * Math.PI * 2, sp = 0.3 + Math.random() * 1.0
            spawn(x, h + 1.5 + Math.random() * 2, y, 'ash',
                Math.cos(a) * sp, 0.3 + Math.random() * 1.1, Math.sin(a) * sp,
                c.size * (0.7 + Math.random() * 0.6), 30 + Math.random() * 20, c.col)
        }
        for (let i = 0; i < Math.max(2, c.n / 4); i++) {
            spawn(x, h + 1 + Math.random() * 1.5, y, 'smoke',
                (Math.random() - 0.5) * 0.5, 0.35 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5,
                1.8 + Math.random() * 1.6, 60 + Math.random() * 40)
        }
    }

    // #1697: fresh craters throw grit as the crumble window closes — cold dust
    // riding the #1646 ash pool (hops and settles, dies fast). Deliberately no
    // scorch and no fire tint: the original's cold craters stayed cold, and a
    // hot crater's heat glows in the pit — the grit it throws is just rock.
    const spawnGrit = (gs, e) => {
        if (e.kind !== 'crater' || e.mag < 3) return
        const wrapv = (v) => ((v % MAP) + MAP) % MAP
        const n = Math.min(14, 4 + Math.round(e.mag))
        const col = [0.58, 0.53, 0.44]
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, rr = e.r * (1 + Math.random() * 0.25)
            const gx = wrapv(e.x + Math.cos(a) * rr), gy = wrapv(e.y + Math.sin(a) * rr)
            spawn(gx, heightAt(gs, gx, gy) + 0.8 + Math.random(), gy, 'ash',
                Math.cos(a) * 0.4, 0.5 + Math.random() * 1.2, Math.sin(a) * 0.4,
                0.5 + e.mag * 0.06 + Math.random() * 0.5, 26 + Math.random() * 18, col)
        }
        for (let i = 0; i < Math.max(2, n / 5); i++) {
            const a = Math.random() * Math.PI * 2, rr = e.r * (0.9 + Math.random() * 0.3)
            const gx = wrapv(e.x + Math.cos(a) * rr), gy = wrapv(e.y + Math.sin(a) * rr)
            spawn(gx, heightAt(gs, gx, gy) + 1, gy, 'smoke', (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3, 1.6 + Math.random() * 1.2, 36 + Math.random() * 24, [0.5, 0.46, 0.4])
        }
    }

    // Volcano vents (#1612 item 5): live lava fountains for a while after an
    // eruption. Presentation-only; the sim's hot craters carry the truth.
    const vents = []

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
            else if (e.type === 'volcano') {
                spawnBurst(gs, e.x, e.y, 30, [1.9, 0.55, 0.15]); addScorch(e.x, e.y, 24, 0.6)
                for (const v of e.vents) vents.push({ x: v.x, y: v.y, t: gs.tick })
            }
            else if (e.type === 'zap') { makeBolt(gs, e.x, e.y); addScorch(e.x, e.y, 8, 0.3) }
            else if (e.type === 'ignite') { addScorch(e.x, e.y, 5, 0.3) }
            else if (e.type === 'hutDown') { spawnBurst(gs, e.x, e.y, 5, [1.2, 0.5, 0.2]); addScorch(e.x, e.y, 6, 0.4) }
            // #1764 item 3 — a villager in the flames: a small burst and a
            // wisp of smoke where they stood.
            else if (e.type === 'villager' && e.what === 'burn') {
                spawnBurst(gs, e.x, e.y, 6, [1.5, 0.55, 0.25])
                spawn(e.x, heightAt(gs, e.x, e.y) + 2, e.y, 'smoke', (Math.random() - 0.5) * 0.4, 0.6, (Math.random() - 0.5) * 0.4, 2.2, 70, [0.6, 0.42, 0.34])
            }
            // #1764 item 3 stage 2 — the village economy on screen: a convert
            // throws gold pennant-dust up from the hut, a tribute a small
            // bright coin-glint at its door.
            else if (e.type === 'villager' && e.what === 'convert') spawnBurst(gs, e.x, e.y, 10, [1.5, 1.2, 0.5])
            else if (e.type === 'tribute') spawnBurst(gs, e.x, e.y, 4, [1.6, 1.3, 0.6])
            else if (e.type === 'towerDown') { spawnBurst(gs, e.x, e.y, 14, [1.0, 0.45, 0.2]); addScorch(e.x, e.y, 12, 0.5) }
            // #1764: the growth reads as violet rune-dust off the rising works
            else if (e.type === 'wizGrow') spawnBurst(gs, e.x, e.y, 14, [0.85, 0.5, 1.5])
            else if (e.type === 'wizardDown') { spawnBurst(gs, e.x, e.y, 22, [1.4, 0.5, 0.3]); addScorch(e.x, e.y, 18, 0.6) }
            else if (e.type === 'kill') spawnCrumble(gs, e.x, e.y, e.kind)
            else if (e.type === 'crumble') spawnGrit(gs, e)
            // #1639 SHATTER: icy splinters and a cold flare — deliberately NO
            // scorch mark: the kill spell leaves the land untouched, and the
            // renderer keeps that promise on screen as the sim does in the sim.
            // #1646: denser splinters + a wide cold ring so the kill reads as
            // lethal even in the Verdant daylight palette.
            else if (e.type === 'shatter') {
                spawnBurst(gs, e.x, e.y, 20, [1.3, 1.6, 2.0])
                spawn(e.x, heightAt(gs, e.x, e.y) + 1.5, e.y, 'flare', 0, 0, 0, 12, 14, [1.1, 1.45, 1.9])
            }
            // #1639 RAISE: the mound itself rides the live heightmap upload;
            // this is the dust it kicks up on the way.
            else if (e.type === 'raise') spawnBurst(gs, e.x, e.y, 12, [0.9, 0.68, 0.42])
            // #1668 DISSOLVE: the sea pours into the fresh wound — cold cyan
            // spray and mist rings over the sunk ground. Deliberately NO scorch
            // and no fire: the flood is cold, and the renderer keeps the sim's
            // promise on screen. The drowned terrain itself rides the live
            // heightmap upload; the sea plane does the flooding.
            else if (e.type === 'dissolve') {
                spawnBurst(gs, e.x, e.y, 16, [0.45, 1.3, 1.9])
                spawn(e.x, WATER + 1, e.y, 'flare', 0, 0.2, 0, 10, 16, [0.6, 1.4, 2.0])
                for (let k = 1; k <= 3; k++) {
                    const a = k * 2.1
                    spawn(e.x + Math.cos(a) * k * 6, WATER + 0.4, e.y + Math.sin(a) * k * 6,
                        'flare', 0, 0.15, 0, 5 + k * 2, 18 + k * 4, [0.55, 1.35, 1.9])
                }
            }
            else if (e.type === 'dissolveHut') {
                spawn(e.x, WATER + 1.2, e.y, 'smoke', 0, 0.5, 0, 3.2, 46, [0.6, 1.2, 1.5])
                spawn(e.x, WATER + 0.8, e.y, 'flare', 0, 0.1, 0, 4, 10, [0.6, 1.3, 1.8])
            }
            // #1680 CLONE: the mirror ring flashes jade at the look point and
            // every twin sparkles into being opposite its original. Deliberately
            // no scorch, no fire, no terrain write: the bestiary doubles, the
            // land does not — the renderer keeps the sim's promise on screen.
            else if (e.type === 'clone') {
                spawn(e.x, heightAt(gs, e.x, e.y) + 1.5, e.y, 'flare', 0, 0, 0, 10, 13, [0.55, 1.7, 1.05])
                for (const c of e.copies) {
                    spawnBurst(gs, c.x, c.y, 5, [0.7, 1.9, 1.15])
                    spawn(c.x, heightAt(gs, c.x, c.y) + 2, c.y, 'flare', 0, 0.1, 0, 4, 11, [0.65, 1.8, 1.1])
                }
            }
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
            else pushSpr('hut', hs.x, hs.y, gz(hs.x, hs.y), hs.ally ? [1.22, 1.08, 0.78] : [1, 1, 1], 1, false, -5 - hs.v)
            // #1764 item 3 stage 2 — the pennant: a converted hut is yours;
            // a gold mark bobs above the roof (the radar dot matches).
            if (hs.ally && !hs.dead) {
                pushSpr('dot', hs.x, hs.y, gz(hs.x, hs.y) + 11 + Math.sin(gs.tick * 0.1 + hs.x) * 0.5, [1.05, 0.88, 0.42], 0.9)
            }
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
        pushSpr(gs.towerDown ? 'towerFall' : gs.wizStage >= 1 ? `wizCastle${gs.wizStage}` : 'towerUp', wz.tx, wz.ty, gz(wz.tx, wz.ty), [1, 1, 1], 1)
        if (wz.alive) {
            pushSpr('wizard', wz.x, wz.y, gz(wz.x, wz.y) + 9 + Math.sin(gs.tick * 0.05) * 1.6, [1.15, 0.85, 1.25], 1)
            if (wz.lostT > 0) pushSpr('quest', wz.x, wz.y, gz(wz.x, wz.y) + 24 + Math.sin(gs.tick * 0.22) * 1.2, [1.5, 1.25, 0.5], wz.lostT > 8 ? 0.95 : wz.lostT / 8)
        }
        for (const m of gs.monsters) {
            if (m.grabbed) continue
            const flip = Math.cos(m.dir) < 0
            if (m.kind === 'giant') pushSpr('giant', m.x, m.y, gz(m.x, m.y) + 0.4, m.hp < 12 ? [1.25, 0.75, 0.6] : [1, 1, 1], 1, flip)
            else if (m.kind === 'wolf') pushSpr('wolf', m.x, m.y, gz(m.x, m.y) + 0.3, [1, 1, 1], 1, flip)
            else pushSpr('cow', m.x, m.y, gz(m.x, m.y) + 0.2, [1, 1, 1], 1, flip)
            if (m.lostT > 0 && m.kind !== 'cow') {
                const hz = (m.kind === 'giant' ? 21 : 8) + Math.sin(gs.tick * 0.22 + m.x) * 1.1
                pushSpr('quest', m.x, m.y, gz(m.x, m.y) + hz, [1.5, 1.25, 0.5], m.lostT > 8 ? 0.95 : m.lostT / 8)
            }
        }
        for (const vl of gs.villagers || []) {
            // #1764 item 3 — the village lives in the lanes; a panicked
            // villager runs warm (the tint carries the fear, the legs run).
            const flip = Math.cos(vl.dir) < 0
            pushSpr(`villager${vl.v}`, vl.x, vl.y, gz(vl.x, vl.y) + 0.2,
                vl.panicT > 0 ? [1.3, 1.05, 0.8] : [1, 1, 1], 1, flip)
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
            else if (p.kind === 'tarrow') pushSpr('arrow', p.x, p.y, p.z, [0.75, 0.55, 1.15], 1) // #1764: the wizard's own arrows ride a violet tint
            else if (p.kind === 'throw') pushSpr('throw', p.x, p.y, p.z, [1, 1, 1], 1)
        }
        if (gs.heldEnt) {
            pushSpr('throw', gs.x + Math.cos(gs.yaw) * 4, gs.y + Math.sin(gs.yaw) * 4, gs.alt + 1.5, [0.7, 1.2, 1.1], 1)
            pushSpr('dot', gs.x + Math.cos(gs.yaw) * 4, gs.y + Math.sin(gs.yaw) * 4, gs.alt + 1.5, [0.5, 1.5, 1.4], 0.6)
        }
        // #1764 item 3 stage 2 — the prisoner rides the carpet: clinging to
        // the fore corner (the throw's seat, one corner over), swaying on the
        // world clock so the carry reads as a body, not a decal.
        if (gs.prisoner) {
            const a = gs.yaw + 0.85
            pushSpr(`villager${gs.prisoner.v}`,
                gs.x + Math.cos(a) * 4.5, gs.y + Math.sin(a) * 4.5,
                gs.alt - 1.2 + Math.sin(gs.tick * 0.15) * 0.25, [1, 1, 1], 1, Math.cos(a) < 0)
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
        for (let i = vents.length - 1; i >= 0; i--) {
            const v = vents[i]
            const age = gs.tick - v.t
            if (age > 160) { vents.splice(i, 1); continue }
            const puff = 1 - age / 160
            const vx = v.x + (Math.random() - 0.5) * 4, vy = v.y + (Math.random() - 0.5) * 4
            spawn(vx, heightAt(gs, vx, vy) + 1, vy, 'fire', 0, 1.8 + Math.random() * 2, 0, 1.8 + Math.random() * 1.6 * puff + 0.6, 26, [1.9, 0.5, 0.18])
            if (Math.random() < 0.55) spawn(vx, heightAt(gs, vx, vy) + 5, vy, 'smoke', (Math.random() - 0.5) * 0.3, 1.1 + Math.random() * 0.6, 0, 3 + Math.random() * 2.5, 120)
            if (Math.random() < 0.3 * puff) spawn(vx, heightAt(gs, vx, vy) + 3, vy, 'ember', (Math.random() - 0.5) * 1.6, 2 + Math.random() * 2.4, (Math.random() - 0.5) * 1.6, 0.8, 40, [1.7, 0.5, 0.2])
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
        // Veiled, the carpet leaves a shimmering ghost trail behind it (#1612
        // item 1): additive cyan motes drifting off the stern + a pulse ring
        // every 7 ticks, so the world admits what the radar already says.
        if (gs0.invis > 0) {
            for (let i = 0; i < 2; i++) {
                const j = (Math.random() - 0.5) * 5
                const p = camera.position.clone()
                    .addScaledVector(basis.fwd, -6 - Math.random() * 3)
                    .addScaledVector(basis.right, j)
                    .addScaledVector(basis.up, -0.6 - Math.random())
                spawn(p.x, p.y, p.z, 'flare',
                    -basis.fwd.x * 1.1 + (Math.random() - 0.5) * 0.25,
                    0.45 + Math.random() * 0.45,
                    -basis.fwd.z * 1.1 + (Math.random() - 0.5) * 0.25,
                    0.8 + Math.random() * 0.8, 24, [0.4, 1.05, 1.55])
            }
            if (gs0.tick % 7 === 0) {
                const p = camera.position.clone().addScaledVector(basis.fwd, -9).addScaledVector(basis.up, -0.8)
                spawn(p.x, p.y, p.z, 'flare', -basis.fwd.x * 0.8, 0.3, -basis.fwd.z * 0.8, 2.4, 16, [0.3, 0.85, 1.35])
            }
        }
        let na = 0, ns = 0
        for (const p of parts) {
            p.life -= 1
            if (p.life <= 0) continue
            const age = 1 - p.life / p.maxLife
            p.x += p.vx / 5; p.y += p.vy / 5; p.z += p.vz / 5
            if (p.kind === 'smoke') { p.vy *= 0.985; p.vx += Math.sin(p.seed + p.life * 0.05) * 0.01 }
            if (p.kind === 'ember') p.vy -= 0.06
            if (p.kind === 'ash') p.vy -= 0.09
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

    // #1740: nine worlds over three atmospheres — cycle like the original's
    // repeating campaign instead of clamping the ninth world to Frostbound.
    const applyPalette = (level) => {
        const p = PAL[level % PAL.length]
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
        rtEyeL.setSize(Wpx, Hpx); rtEyeR.setSize(Wpx, Hpx)
        camera.aspect = Wpx / Hpx
    }

    const frame = (gs, view = {}) => {
        gs0 = gs
        if (gs.level !== lastLevel) { applyPalette(gs.level); lastLevel = gs.level }
        uploadData(gs)
        emitAmbient(gs)
        tUniforms.uTime.value = performance.now() / 1000
        tUniforms.uWorldTime.value = gs.tick
        // #1764 item 4 stage 2: submersion depth (0..1 over 6u) drives the
        // underwater composite and the submerged sky. Derived from gs only —
        // replay-stable, and the shell can poll it against diveOf(gs).
        const sub = Math.max(0, Math.min(1, (WATER - gs.alt) / 6))
        compMesh.material.uniforms.uSub.value = sub
        sUniforms.uSub.value = sub

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
        // #1764 item 5 stage 6: the deck rides the live camera basis, and its
        // sun shading follows the sun's bearing in screen space.
        cUniforms.uRight.value.copy(right)
        cUniforms.uUp.value.copy(up)
        cUniforms.uSunScr.value.set(right.dot(tUniforms.uSunDir.value), up.dot(tUniforms.uSunDir.value))
            .normalize()
        fillSprites(gs)
        fillParticles({ fwd, right, up })
        boltAge += 1
        boltMat.uniforms.uFade.value = Math.max(0, 1 - boltAge / 16)

        const bsz = Math.max(rtA.width, 1)
        const bloomAmt = hdr ? 0.85 : 0.7
        const renderEye = (withBloom) => {
            renderer.setRenderTarget(rtScene)
            renderer.clear()
            renderer.render(scene, camera)
            if (withBloom) {
                // #1790: bloom is a quarter-res blur — the eyes' parallax (a few
                // px near, sub-px far) is invisible inside the glow, so the
                // bright/blur chain runs once (left eye) and serves both.
                brightMesh.material.uniforms.uT.value = rtScene.texture
                renderer.setRenderTarget(rtA); renderer.render(scBright, quadCam)
                blurMesh.material.uniforms.uT.value = rtA.texture; blurMesh.material.uniforms.uDir.value.set(1.4 / bsz, 0)
                renderer.setRenderTarget(rtB); renderer.render(scBlur, quadCam)
                blurMesh.material.uniforms.uT.value = rtB.texture; blurMesh.material.uniforms.uDir.value.set(0, 1.4 / bsz)
                renderer.setRenderTarget(rtA); renderer.render(scBlur, quadCam)
            }
            compMesh.material.uniforms.uScene.value = rtScene.texture
            compMesh.material.uniforms.uBloom.value = rtA.texture
            compMesh.material.uniforms.uBloomAmt.value = bloomAmt
        }
        if (stereo) {
            // #1790 parallel stereo: eyes shift along the view's own right axis;
            // three.js refreshes the camera world matrix at every render, so the
            // position move between the two passes is all the eye needs.
            camera.position.addScaledVector(right, -IPD * 0.5)
            renderEye(true)
            renderer.setRenderTarget(rtEyeL); renderer.render(scComp, quadCam)
            camera.position.addScaledVector(right, IPD)
            renderEye(false)
            renderer.setRenderTarget(rtEyeR); renderer.render(scComp, quadCam)
            camera.position.addScaledVector(right, -IPD * 0.5) // restore the head
            if (stereoMode === 'interlace') {
                // #1764 item 8: row-alternate line mode — both eyes at full colour,
                // every other scan line to the other eye (the shader owns parity).
                interlaceMesh.material.uniforms.uL.value = rtEyeL.texture
                interlaceMesh.material.uniforms.uR.value = rtEyeR.texture
                renderer.setRenderTarget(null)
                renderer.render(scInterlace, quadCam)
            } else {
                anaglyphMesh.material.uniforms.uL.value = rtEyeL.texture
                anaglyphMesh.material.uniforms.uR.value = rtEyeR.texture
                renderer.setRenderTarget(null)
                renderer.render(scAnaglyph, quadCam)
            }
        } else {
            renderEye(true)
            renderer.setRenderTarget(null)
            renderer.render(scComp, quadCam)
        }
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
        // #1790 red/cyan anaglyph — the original's stereo-glasses mode, on by V.
        setStereo: (on) => { stereo = !!on },
        stereoOn: () => stereo,
        stereoIPD: () => IPD,
        // #1764 item 8: the glass type is its own switch — 'anaglyph' | 'interlace'.
        // Anything unknown lands on the #1790 default, never on a dark screen.
        setStereoMode: (m) => { stereoMode = m === 'interlace' ? 'interlace' : 'anaglyph' },
        stereoModeName: () => stereoMode,
        particleCount: () => parts.length,
        ashCount: () => parts.reduce((n, p) => n + (p.kind === 'ash' ? 1 : 0), 0),
        smokeCount: () => smoke.geo.instanceCount,
        spriteCount: () => spr.geo.instanceCount,
        glowCells: () => { let n = 0; for (let i = 0; i < N * N; i++) if (hData[i * 4 + 1] > 0) n++; return n },
        waveUniform: () => tUniforms.uWorldTime.value, // #1764 item 4: the shader's clock is sim ticks, not wall time
        cloudBodyCount: () => cloudGeo.instanceCount, // #1764 item 5 stage 6: puffs the GL pass actually carries
        cloudCellCount: () => cloudCells.length,
        subUniform: () => compMesh.material.uniforms.uSub.value, // #1764 item 4 stage 2: the painted submersion mix
        scorchCells: () => { let n = 0; for (let i = 0; i < N * N; i++) if (hData[i * 4 + 2] > 0) n++; return n },
        dispose() {
            rtScene.dispose(); rtA.dispose(); rtB.dispose(); rtEyeL.dispose(); rtEyeR.dispose()
            terrGeo.dispose(); spr.geo.dispose(); par.geo.dispose(); smoke.geo.dispose(); boltGeo.dispose()
            atlas.tex.dispose(); hTex.dispose()
            renderer.dispose()
            THREE.ColorManagement.enabled = cmPrev
        },
    }
}
