// RACCOON HEIST — procedural art.
//
// Every texture here is painted into an offscreen <canvas> at load, and every mesh is
// assembled from primitives. There is no image file, no glTF and no Blender export in
// this game: the whole look has to be re-derivable from this diff (IronKeep set that
// precedent — "every texture, sprite and font glyph is generated at runtime").
//
// Two consequences worth knowing before editing:
//   - Textures are memoised in `TEX` and materials in `MAT`, so a 1,300-cell level
//     shares a handful of GPU programs. Never call makeTex() inside a loop.
//   - Everything is flat-shaded and low-poly on purpose. At night, with fog and one
//     shadow-casting light, silhouette + rim light carry the read; smooth shading and
//     high polys only blur the silhouette on a 5-inch phone screen.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// ---------------------------------------------------------------- palette --------
// Lifted from the reference frame: cold teal night, sodium-amber windows, cardboard
// browns, and fur that is never pure grey (it is always slightly blue at night).
export const PAL = {
    night: 0x0b1826,
    nightDeep: 0x060f19,
    sky: 0x12283c,
    moon: 0xdff0ff,
    asphalt: 0x2b3a46,
    asphaltLit: 0x5f7f95,
    concrete: 0x3b4550,
    brick: 0x4a3b39,
    brickDark: 0x332a2b,
    stucco: 0x465059,
    metal: 0x4d5a63,
    metalDark: 0x2c353c,
    rust: 0x8a5a34,
    cardboard: 0xa97d52,
    cardboardDark: 0x7d5a3a,
    wood: 0x6b4a30,
    moss: 0x3c5334,
    leafDark: 0x2b4a2f,
    fur: 0x8b9099,
    furDark: 0x353a43,
    furLite: 0xb9bec4,
    cream: 0xe9e3d3,
    nose: 0x14161a,
    amber: 0xffb45c,
    amberHot: 0xffd9a0,
    sodium: 0xffa53d,
    cyan: 0x7fd8ff,
    lime: 0x9dffb0,
    red: 0xff4d4d,
    gold: 0xffd257,
    bandanaRed: 0xd8433c,
    bandanaBlue: 0x3d7fd6,
    bandanaGreen: 0x4bb46a,
    cat: 0x1d222c,
    uniform: 0x243449,
    hivis: 0xd8e04a,
    water: 0x16324a,
}

// ---------------------------------------------------------------- noise ----------
export function rng(seed = 1) {
    let s = (seed >>> 0) || 1
    return () => {
        s ^= s << 13; s >>>= 0
        s ^= s >>> 17
        s ^= s << 5; s >>>= 0
        return s / 4294967296
    }
}

function hash2(x, y, s) {
    const n = Math.sin(x * 127.1 + y * 311.7 + s * 0.0173) * 43758.5453
    return n - Math.floor(n)
}

/** Smooth value noise in [0,1]. */
export function vnoise(x, y, s = 0) {
    const xi = Math.floor(x), yi = Math.floor(y)
    const xf = x - xi, yf = y - yi
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s)
    const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s)
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

/** Fractal brownian motion, 4 octaves by default. */
export function fbm(x, y, s = 0, oct = 4) {
    let t = 0, amp = 0.5, f = 1
    for (let i = 0; i < oct; i++) { t += amp * vnoise(x * f, y * f, s + i * 31); f *= 2; amp *= 0.5 }
    return t
}

// ---------------------------------------------------------------- textures -------
const texCache = new Map()

function canvasOf(w, h) {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    return c
}

function wrap(canvas, { rx = 1, ry = 1, srgb = true } = {}) {
    const t = new THREE.CanvasTexture(canvas)
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(rx, ry)
    t.anisotropy = 4
    return t
}

/** Fill a canvas through a per-pixel colourer(x, y, u, v) -> [r,g,b,a]. */
function paint(canvas, colourer) {
    const ctx = canvas.getContext('2d')
    const { width: w, height: h } = canvas
    const img = ctx.createImageData(w, h)
    const d = img.data
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4
            const c = colourer(x, y, x / w, y / h)
            d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c.length > 3 ? c[3] : 255
        }
    }
    ctx.putImageData(img, 0, 0)
    return ctx
}

const mix = (a, b, t) => a + (b - a) * t
const mixC = (a, b, t) => [mix((a >> 16) & 255, (b >> 16) & 255, t), mix((a >> 8) & 255, (b >> 8) & 255, t), mix(a & 255, b & 255, t)]

/**
 * Memoised procedural texture library. `key` selects the recipe; args after it are
 * baked into the cache key so tiling can vary per use.
 */
export function makeTex(key, ...args) {
    const ck = key + ':' + args.join(',')
    if (texCache.has(ck)) return texCache.get(ck)
    const t = buildTex(key, args)
    texCache.set(ck, t)
    return t
}

function buildTex(key, a) {
    switch (key) {
        // Wet night asphalt: grit, cracks, oil stains, and a roughness companion map
        // (puddles = smooth+dark) carried on the alpha of a second texture.
        case 'asphalt': {
            const S = 256, c = canvasOf(S, S)
            const rough = canvasOf(S, S)
            paint(c, (x, y) => {
                const g = fbm(x / 7, y / 7, 3, 5)
                const grit = hash2(x * 3.1, y * 7.7, 9) * 0.25
                const crack = Math.pow(1 - Math.abs(fbm(x / 22, y / 5.5, 11) - 0.5) * 2.6, 6)
                const v = 0.42 + g * 0.42 + grit - crack * 0.3
                return mixC(0x38505f, 0x8fb0c4, Math.min(1, Math.max(0, v * 0.8)))
            })
            paint(rough, (x, y) => {
                const pool = fbm(x / 30, y / 26, 21, 4)
                const p = Math.max(0, (pool - 0.5) * 3.4)
                const v = 205 - p * 170
                return [v, v, v, 255]
            })
            return { map: wrap(c, { rx: a[0] || 1, ry: a[1] || 1 }), rough: wrap(rough, { rx: a[0] || 1, ry: a[1] || 1, srgb: false }) }
        }
        case 'brick': {
            const S = 256, c = canvasOf(S, S)
            paint(c, (x, y) => {
                const row = Math.floor(y / 16)
                const off = (row % 2) * 16
                const bx = (x + off) % 32, by = y % 16
                const mortar = bx < 2 || by < 2
                const n = fbm(x / 9, y / 9, row * 3 + 1, 3)
                if (mortar) return mixC(0x8d9395, 0x646b6d, n)
                const base = mixC(0x7d6159, PAL.brickDark, hash2(Math.floor((x + off) / 32), row, 5))
                const c2 = mixC(base[0], base[1], base[2])
                return mixC(c2, [52, 46, 50], Math.max(0, n - 0.55) * 1.2)
            })
            return wrap(c, { rx: a[0] || 1, ry: a[1] || 1 })
        }
        case 'stucco': {
            const S = 128, c = canvasOf(S, S)
            paint(c, (x, y) => {
                const n = fbm(x / 4, y / 4, 41, 4)
                const stain = Math.max(0, fbm(x / 40, y / 12, 7, 3) - 0.6) * 1.5
                const base = mixC(0x6c7780, 0x39424b, Math.min(1, stain))
                return mixC(base, [150, 160, 168], (n - 0.5) * 0.5)
            })
            return wrap(c, { rx: a[0] || 1, ry: a[1] || 1 })
        }
        case 'cardboard': {
            const S = 128, c = canvasOf(S, S)
            paint(c, (x, y) => {
                const fibre = hash2(x * 1.7, y * 11.3, 3) * 0.2
                const corr = Math.abs(Math.sin(y * 0.6)) * 0.08
                const tape = (y > 52 && y < 74) ? 1 : 0
                const base = mixC(0x8f7050, PAL.cardboardDark, fibre + corr)
                return tape ? mixC(base, [196, 186, 158], 0.55) : base
            })
            return wrap(c, { rx: a[0] || 1, ry: a[1] || 1 })
        }
        // The sack's peso stamp — readable at gameplay distance, zero asset cost.
        case 'dollar': {
            const S = 64, c = canvasOf(S, S)
            const ctx = c.getContext('2d')
            ctx.clearRect(0, 0, S, S)
            ctx.globalAlpha = 0.85
            ctx.fillStyle = '#3f5a2c'
            ctx.font = 'bold 44px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            ctx.fillText('$', S / 2, S / 2 + 2)
            ctx.globalAlpha = 0.4
            ctx.strokeStyle = '#2d4020'; ctx.lineWidth = 3
            ctx.strokeRect(10, 10, S - 20, S - 20)
            return wrap(c)
        }
        // The painting inside the frame: a moonscape, because raccoon art is specific.
        case 'painting': {
            const S = 128, c = canvasOf(S, S)
            paint(c, (x, y, u, v) => {
                const sky = mixC(0x1d3550, 0x5c7fa0, Math.pow(1 - v, 1.4))
                const hills = v > 0.62 ? mixC(0x2b3a2c, 0x16231c, fbm(u * 7, v * 4, 3, 3)) : sky
                const moon = Math.hypot(u - 0.7, v - 0.24) < 0.09 ? [235, 245, 250] : null
                return moon || hills
            })
            const ctx = c.getContext('2d')
            ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 6
            ctx.strokeRect(0, 0, S, S)
            return wrap(c)
        }
        // The cage sign. Small, but it is the joke that makes being caught funny
        // instead of punishing.
        case 'poundSign': {
            const S = 128, W = 256, c = canvasOf(W, 80)
            const ctx = c.getContext('2d')
            ctx.fillStyle = '#c8b98a'; ctx.fillRect(0, 0, W, 80)
            ctx.strokeStyle = '#4a3f28'; ctx.lineWidth = 5; ctx.strokeRect(5, 5, W - 10, 70)
            ctx.fillStyle = '#2a2418'
            ctx.font = 'bold 26px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center'
            ctx.fillText('MUNICIPAL POUND', W / 2, 34)
            ctx.font = 'bold 15px Helvetica, Arial, sans-serif'
            ctx.fillText('RACCOONS: HOLD FOR OWNER', W / 2, 60)
            void S
            return wrap(c)
        }
        // Soft wet patch: a radial fade, so a puddle is a stain rather than a polygon.
        case 'puddle': {
            const S = 64, c = canvasOf(S, S)
            const ctx = c.getContext('2d')
            const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2)
            g.addColorStop(0, 'rgba(255,255,255,1)')
            g.addColorStop(0.55, 'rgba(210,225,240,0.75)')
            g.addColorStop(1, 'rgba(120,150,180,0)')
            ctx.fillStyle = g; ctx.fillRect(0, 0, S, S)
            return wrap(c)
        }
        case 'metal': {
            const S = 128, c = canvasOf(S, S)
            paint(c, (x, y) => {
                const brush = hash2(x * 0.7, y * 21.1, 8) * 0.12
                const rust = Math.max(0, fbm(x / 16, y / 18, 51, 4) - 0.52) * 2.2
                const dent = fbm(x / 6, y / 6, 61, 3) * 0.2
                const base = mixC(PAL.metal, PAL.metalDark, brush + dent)
                return mixC(base, [PAL.rust >> 16 & 255, PAL.rust >> 8 & 255, PAL.rust & 255], Math.min(0.85, rust))
            })
            return wrap(c, { rx: a[0] || 1, ry: a[1] || 1 })
        }
        // Chain-link: mostly transparent, so a fence occludes light but not the view.
        case 'chainlink': {
            const S = 64, c = canvasOf(S, S)
            const ctx = c.getContext('2d')
            ctx.clearRect(0, 0, S, S)
            ctx.strokeStyle = 'rgba(190,205,215,0.85)'
            ctx.lineWidth = 3
            for (let i = -S; i < S * 2; i += 11) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + S, S); ctx.stroke()
                ctx.beginPath(); ctx.moveTo(i, S); ctx.lineTo(i + S, 0); ctx.stroke()
            }
            return wrap(c, { rx: a[0] || 1, ry: a[1] || 1 })
        }
        case 'wood': {
            const S = 128, c = canvasOf(S, S)
            paint(c, (x, y) => {
                const ring = fbm(x / 3, y / 26, 71, 3)
                const plank = (y % 32) < 2 ? 1 : 0
                const base = mixC(PAL.wood, 0x3c2a1c, ring * 0.8)
                return plank ? [26, 20, 16, 255] : base
            })
            return wrap(c, { rx: a[0] || 1, ry: a[1] || 1 })
        }
        case 'marble': {
            const S = 256, c = canvasOf(S, S)
            paint(c, (x, y) => {
                const w = Math.sin((x / S * 6 + fbm(x / 30, y / 30, 81, 4) * 4) * Math.PI)
                const vein = Math.pow(Math.abs(w), 8)
                return mixC([214, 210, 198], [70, 78, 92], 1 - vein)
            })
            return wrap(c, { rx: a[0] || 1, ry: a[1] || 1 })
        }
        // Fur: directional speckle so a flat-shaded body still has some grain in it.
        case 'fur': {
            const S = 64, c = canvasOf(S, S)
            paint(c, (x, y) => {
                const streak = fbm(x / 1.6, y / 9, 91, 3)
                return mixC(PAL.fur, PAL.furLite, (streak - 0.5) * 0.7 + 0.2)
            })
            return wrap(c, { rx: a[0] || 1, ry: a[1] || 1 })
        }
        // Little wanted posters papered on the alley walls. Hand-drawn in canvas so the
        // alley has readable text at zero asset cost.
        case 'poster': {
            const S = 128, c = canvasOf(S, S)
            const ctx = c.getContext('2d')
            ctx.fillStyle = '#d9cfb4'; ctx.fillRect(0, 0, S, S)
            const r = rng(7)
            for (let i = 0; i < 900; i++) {
                ctx.fillStyle = `rgba(120,110,90,${r() * 0.12})`
                ctx.fillRect(r() * S, r() * S, 2, 2)
            }
            drawRaccoonFace(ctx, S / 2, 54, 26)
            ctx.fillStyle = '#1b1b1f'
            ctx.font = 'bold 17px Georgia, serif'; ctx.textAlign = 'center'
            ctx.fillText('WANTED', S / 2, 16)
            ctx.font = 'bold 11px Georgia, serif'
            ctx.fillText('TRASH PANDA', S / 2, 92)
            ctx.font = 'bold 9px Georgia, serif'
            ctx.fillText('REWARD: 1 DUMPSTER', S / 2, 106)
            ctx.strokeStyle = 'rgba(40,35,30,0.5)'; ctx.lineWidth = 2
            ctx.strokeRect(4, 4, S - 8, S - 8)
            return wrap(c)
        }
        // cardboard stencil: a warning to whoever else uses this alley
        case 'stencil': {
            const S = 128, c = canvasOf(S, S)
            const ctx = c.getContext('2d')
            ctx.clearRect(0, 0, S, S)
            ctx.globalAlpha = 0.75
            drawRaccoonFace(ctx, S / 2, 52, 24)
            ctx.globalAlpha = 0.6
            ctx.fillStyle = '#e8ecec'
            ctx.font = 'bold 16px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center'
            ctx.fillText('NO RACCOONS', S / 2, 100)
            ctx.font = 'bold 10px Helvetica, Arial, sans-serif'
            ctx.fillText('(ASK AGAIN LOUDER)', S / 2, 116)
            return wrap(c)
        }
        default:
            throw new Error('makeTex: unknown recipe ' + key)
    }
}

/** Chunky raccoon head, drawn flat — used on the wanted posters and the HUD. */
export function drawRaccoonFace(ctx, cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy)
    const ear = (dir) => {
        ctx.fillStyle = '#3a3f47'
        ctx.beginPath(); ctx.moveTo(dir * 0.62 * s, -0.55 * s); ctx.lineTo(dir * 0.95 * s, -1.15 * s); ctx.lineTo(dir * 0.18 * s, -0.85 * s); ctx.closePath(); ctx.fill()
    }
    ear(-1); ear(1)
    ctx.fillStyle = '#8b9099'
    ctx.beginPath(); ctx.ellipse(0, 0, 0.85 * s, 0.78 * s, 0, 0, 7); ctx.fill()
    ctx.fillStyle = '#e9e3d3'
    ctx.beginPath(); ctx.ellipse(0, 0.34 * s, 0.5 * s, 0.4 * s, 0, 0, 7); ctx.fill()
    ctx.beginPath(); ctx.ellipse(-0.4 * s, -0.2 * s, 0.3 * s, 0.22 * s, 0, 0, 7); ctx.fill()
    ctx.beginPath(); ctx.ellipse(0.4 * s, -0.2 * s, 0.3 * s, 0.22 * s, 0, 0, 7); ctx.fill()
    ctx.fillStyle = '#22262d'                      // the bandit mask
    ctx.beginPath(); ctx.ellipse(-0.36 * s, -0.02 * s, 0.3 * s, 0.21 * s, 0.2, 0, 7); ctx.fill()
    ctx.beginPath(); ctx.ellipse(0.36 * s, -0.02 * s, 0.3 * s, 0.21 * s, -0.2, 0, 7); ctx.fill()
    ctx.fillStyle = '#0d1013'
    ctx.beginPath(); ctx.arc(-0.34 * s, 0, 0.11 * s, 0, 7); ctx.fill()
    ctx.beginPath(); ctx.arc(0.34 * s, 0, 0.11 * s, 0, 7); ctx.fill()
    ctx.fillStyle = '#dffcff'
    ctx.beginPath(); ctx.arc(-0.3 * s, -0.05 * s, 0.035 * s, 0, 7); ctx.fill()
    ctx.beginPath(); ctx.arc(0.38 * s, -0.05 * s, 0.035 * s, 0, 7); ctx.fill()
    ctx.fillStyle = '#14161a'
    ctx.beginPath(); ctx.ellipse(0, 0.34 * s, 0.11 * s, 0.08 * s, 0, 0, 7); ctx.fill()
    ctx.restore()
}


/**
 * A soft vertical streak, used for loot sparkles and for the rain's additive core.
 * Exported because fx.js and any future particle work need the same sprite.
 */
export const makeStreakTex = (() => {
    let t = null
    return () => {
        if (t) return t
        const c = canvasOf(16, 16)
        const x = c.getContext('2d')
        const grd = x.createLinearGradient(0, 0, 0, 16)
        grd.addColorStop(0, 'rgba(190,225,255,0)')
        grd.addColorStop(0.5, 'rgba(205,235,255,0.9)')
        grd.addColorStop(1, 'rgba(225,245,255,0)')
        x.fillStyle = grd
        x.fillRect(6, 0, 3, 16)
        t = new THREE.CanvasTexture(c)
        t.colorSpace = THREE.SRGBColorSpace
        return t
    }
})()

// ---------------------------------------------------------------- materials ------
const matCache = new Map()

/**
 * Shared material factory. `flat` is on by default: chunky facets are the house look,
 * and they hide the fact that most props are boxes and spheres.
 */
export function mat(key, params = {}) {
    const ck = key + JSON.stringify(params)
    if (matCache.has(ck)) return matCache.get(ck)
    const m = new THREE.MeshStandardMaterial(Object.assign({ flatShading: true, roughness: 0.85, metalness: 0.05, envMapIntensity: 0.4 }, params))
    m.name = key
    matCache.set(ck, m)
    return m
}

/**
 * Rescale a BoxGeometry's UVs so texel density is constant in world units, face by
 * face. This is why one brick material can skin a 3m shed and an 11m facade without
 * the big wall looking like stonework for giants: the tiling lives in the geometry, so
 * the material (and its single GPU texture upload) stays shared across the level.
 *
 * BoxGeometry emits 6 faces x 4 verts in the order +x,-x,+y,-y,+z,-z.
 */
export function tileBox(geo, dims, tile = 2) {
    const [w, h, d] = dims
    const uv = geo.attributes.uv
    const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
    for (let f = 0; f < 6; f++) {
        const su = faces[f][0] / tile[0]
        const sv = faces[f][1] / (tile[1] || tile[0])
        for (let i = 0; i < 4; i++) {
            const k = f * 4 + i
            uv.setXY(k, uv.getX(k) * su, uv.getY(k) * sv)
        }
    }
    uv.needsUpdate = true
    return geo
}

/** PlaneGeometry sibling of tileBox: world-unit texel density baked into the UVs. */
export function tilePlane(geo, w, h, tile = 2) {
    const uv = geo.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (h / tile))
    uv.needsUpdate = true
    return geo
}

/**
 * A one-time PMREM environment: a gradient sky with a moon hotspot, generated as an
 * equirect DataTexture. Without it, metalness 0 and roughness 0.2 read as *flat black*
 * on wet asphalt, because a Standard material with nothing to reflect has no specular.
 * This is the single cheapest quality jump in the whole build: puddles, car paint, the
 * vault dial and the chain-link all pick up the night.
 */
export function makeNightEnv(renderer) {
    const W = 64, H = 32
    const data = new Uint8Array(W * H * 4)
    for (let y = 0; y < H; y++) {
        const v = y / (H - 1)                       // 0 = zenith, 1 = nadir
        for (let x = 0; x < W; x++) {
            const u = x / (W - 1)
            const sky = mixC(0x2b5478, 0x0a1520, Math.pow(v, 0.8))
            // moon hotspot near the top-left of the equirect
            const dx = Math.min(Math.abs(u - 0.22), 1 - Math.abs(u - 0.22))
            const dy = v - 0.14
            const m = Math.exp(-((dx * dx) / 0.006 + (dy * dy) / 0.004)) * 255
            // a warm band at the horizon: the city's sodium glow bouncing off low cloud
            const city = Math.exp(-Math.pow((v - 0.55) / 0.10, 2)) * 42
            const i = (y * W + x) * 4
            data[i] = Math.min(255, sky[0] + m + city * 0.9)
            data[i + 1] = Math.min(255, sky[1] + m * 0.98 + city * 0.5)
            data[i + 2] = Math.min(255, sky[2] + m + city * 0.25)
            data[i + 3] = 255
        }
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat)
    tex.mapping = THREE.EquirectangularReflectionMapping
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    const pm = new THREE.PMREMGenerator(renderer)
    const env = pm.fromEquirectangular(tex).texture
    pm.dispose()
    tex.dispose()
    return env
}

/**
 * Sky dome + stars. Better than a flat clear colour: the eye reads a vertical gradient
 * as "night sky" and flat black as "the level ran out".
 */
export function makeSky(seed = 3, radius = 90) {
    const g = new THREE.Group()
    const c = canvasOf(64, 128)
    paint(c, (x, y) => {
        const v = y / 127
        const n = fbm(x / 6, y / 14, seed, 3) * 10
        // v=0 is the top of the canvas = the zenith of the dome
        const base = mixC(0x0a1522, 0x2e5573, Math.pow(1 - v, 1.7))
        // City glow: a sodium-vapour band sitting on the horizon. No sky over a town is
        // black at the bottom, and putting that one band back is most of what makes a
        // 3D night stop looking like a void with a lamp in it.
        const glow = Math.pow(Math.max(0, 1 - Math.abs(v - 0.93) * 7), 2)
        const lit = mixC(base, [176, 116, 58], glow * 0.55)
        return mixC(lit, [56, 88, 112], n / 40)
    })
    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12),
        new THREE.MeshBasicMaterial({ map: wrap(c), side: THREE.BackSide, fog: false, depthWrite: false })
    )
    g.add(dome)

    const R = rng(seed)
    const N = 260
    const pos = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
        const a = R() * Math.PI * 2
        const e = 0.12 + R() * 1.25
        const r = radius * 0.92
        pos[i * 3] = Math.cos(a) * Math.cos(e) * r
        pos[i * 3 + 1] = Math.sin(e) * r
        pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe8ff, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.75, fog: false })))
    return g
}

export function propMat(kind) {
    switch (kind) {
        // Walls carry their tiling in UVs (see tileBox), so every wall in a level can
        // share one material — and one texture upload.
        case 'brick': return mat('brick', { map: makeTex('brick'), roughness: 0.95, envMapIntensity: 0.75, color: 0x9aa2ac })
        case 'stucco': return mat('stucco', { map: makeTex('stucco'), roughness: 0.95, envMapIntensity: 0.8, color: 0xa9b3bd })
        case 'asphalt': {
            // makeTex('asphalt') returns a PAIR (colour map + roughness companion). Passing
            // the wrapper itself to `map:` is a crash, not a visual bug: three calls
            // map.updateMatrix()/map.matrix on it and dies in refreshTransformUniform.
            const a = makeTex('asphalt')
            return mat('asphalt', { map: a.map, roughnessMap: a.rough, roughness: 0.45, metalness: 0.35, envMapIntensity: 1.5, color: 0xbfd4e2 })
        }
        case 'cardboard': return mat('cardboard', { map: makeTex('cardboard'), roughness: 1 })
        case 'metal': return mat('metal', { map: makeTex('metal'), roughness: 0.45, metalness: 0.7, envMapIntensity: 1.1 })
        case 'wood': return mat('wood', { map: makeTex('wood'), roughness: 0.9 })
        case 'marble': return mat('marble', { map: makeTex('marble'), roughness: 0.18, metalness: 0.1, envMapIntensity: 1.4 })
        default: throw new Error('propMat: ' + kind)
    }
}

// ---------------------------------------------------------------- raccoon --------
/**
 * The crew. Built as a transform hierarchy rather than a skinned mesh: hips → spine →
 * head → ears, plus a 5-segment tail chain. `anim` on the returned group is what the
 * engine wobbles each frame (walk cycle, tail sway, ear twitch, carrying pose, eye
 * shine). ~30 low-poly primitives, one shared set of materials per crew colour.
 *
 * Faces +Z so `group.lookAt(target)` just works.
 */
export function makeRaccoon(opts = {}) {
    const bandana = opts.bandana ?? PAL.bandanaRed
    const furM = mat('fur' + (opts.seed || 0), { map: makeTex('fur', 2, 2), color: opts.tint ?? 0xffffff, roughness: 1 })
    const darkM = mat('furDark', { color: PAL.furDark, roughness: 1 })
    const liteM = mat('furLite', { color: PAL.furLite, roughness: 1 })
    const creamM = mat('cream', { color: PAL.cream, roughness: 1 })
    const noseM = mat('nose', { color: PAL.nose, roughness: 0.4 })
    const bandM = mat('band' + bandana, { color: bandana, roughness: 0.9 })
    const eyeM = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.12, metalness: 0.2, emissive: 0x59ffc8, emissiveIntensity: 0 })
    const sackM = mat('sack', { color: 0xb59b6a, roughness: 1 })

    const g = new THREE.Group()
    // "Is this a character?" for the scene interrogator in `index.jsx`: a rig is a metre
    // of fur meshes arranged around the position that is its feet, so `near()` reporting
    // the actor's own forearm as "0.08 m from fur1" is what sent a camera bug hunt after
    // a wall that was never touched. Rigs are tagged, and `near()` answers with the
    // collision depth instead (`engine.bodyDepth()`).
    g.userData.rig = 'raccoon'
    const hips = new THREE.Group()
    g.add(hips)

    const sph = (r, seg = 10) => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2))
    const put = (parent, geo, material, x, y, z, s) => {
        const m = new THREE.Mesh(geo, material)
        m.position.set(x, y, z)
        if (s) m.scale.set(s[0], s[1], s[2])
        m.castShadow = true
        parent.add(m)
        return m
    }

    // body: rump + chest, slightly hunched (a raccoon is front-heavy)
    put(hips, sph(0.3), furM, 0, 0.3, -0.1, [1, 0.94, 1.1])
    const chest = new THREE.Group(); chest.position.set(0, 0.33, 0.18); hips.add(chest)
    put(chest, sph(0.23), furM, 0, 0, 0, [1.05, 0.92, 1])
    put(chest, sph(0.2), creamM, 0, -0.09, 0.09, [0.8, 0.6, 0.7])     // pale belly

    // head on a short neck, so it can bob and tilt independently
    const head = new THREE.Group(); head.position.set(0, 0.5, 0.3); hips.add(head)
    put(head, sph(0.2, 11), furM, 0, 0, 0, [1.06, 0.96, 1])
    const snout = put(head, new THREE.ConeGeometry(0.1, 0.2, 8), liteM, 0, -0.045, 0.19, [1, 1, 1])
    snout.rotation.x = Math.PI / 2
    put(head, sph(0.045, 6), noseM, 0, -0.03, 0.3)
    // mask + brows: the whole "raccoon" read lives in these four shapes
    put(head, sph(0.155, 10), darkM, -0.075, 0.015, 0.075, [1, 0.72, 0.9])
    put(head, sph(0.155, 10), darkM, 0.075, 0.015, 0.075, [1, 0.72, 0.9])
    put(head, sph(0.09, 8), creamM, -0.09, 0.11, 0.1, [1.1, 0.5, 0.8])
    put(head, sph(0.09, 8), creamM, 0.09, 0.11, 0.1, [1.1, 0.5, 0.8])
    const eyeL = put(head, sph(0.05, 8), eyeM, -0.077, 0.02, 0.155)
    const eyeR = put(head, sph(0.05, 8), eyeM, 0.077, 0.02, 0.155)
    const ears = []
    for (const sgn of [-1, 1]) {
        const ear = new THREE.Group()
        ear.position.set(sgn * 0.115, 0.16, -0.01)
        ear.rotation.z = -sgn * 0.4
        head.add(ear)
        put(ear, new THREE.ConeGeometry(0.075, 0.14, 6), darkM, 0, 0.03, 0)
        put(ear, new THREE.ConeGeometry(0.045, 0.09, 6), mat('earpink', { color: 0xcf8f92, roughness: 1 }), sgn * 0.005, 0.02, 0.03)
        ears.push(ear)
    }
    // kerchief: a torus at the neck + a knot at the back. This is how you tell the crew apart.
    const neck = put(hips, new THREE.TorusGeometry(0.19, 0.05, 6, 12), bandM, 0, 0.42, 0.24, [1, 1, 0.8])
    neck.rotation.x = Math.PI / 2 + 0.35
    put(hips, new THREE.ConeGeometry(0.06, 0.12, 5), bandM, 0, 0.4, 0.06, [1, 1, 1]).rotation.x = -2.2

    // four legs: shoulder -> elbow -> paw, so the waddle has somewhere to live
    const legs = []
    const limb = (x, z, len, back) => {
        const root = new THREE.Group(); root.position.set(x, back ? 0.3 : 0.36, z); hips.add(root)
        const upper = put(root, new THREE.CylinderGeometry(0.055, 0.05, len, 6), furM, 0, -len / 2, 0)
        upper.castShadow = true
        const foot = put(root, sph(0.065, 7), back ? furM : darkM, 0, -len, 0.02, [1, 0.7, 1.35])
        root.userData = { len, foot, base: root.rotation.x }
        legs.push(root)
        return root
    }
    limb(-0.15, 0.16, 0.22, false); limb(0.15, 0.16, 0.22, false)
    limb(-0.15, -0.16, 0.24, true); limb(0.15, -0.16, 0.24, true)

    // tail: 5 rings, alternating dark/light, tip always dark
    const tail = []
    let node = hips
    for (let i = 0; i < 5; i++) {
        const seg = new THREE.Group()
        seg.position.set(0, i === 0 ? 0.34 : 0, i === 0 ? -0.3 : -0.115)
        node.add(seg)
        const r = 0.115 - i * 0.012
        put(seg, new THREE.CylinderGeometry(r, r * (i === 4 ? 0.5 : 0.94), 0.12, 7), i % 2 || i === 4 ? darkM : liteM, 0, 0, -0.05, [1, 1, 1]).rotation.x = Math.PI / 2
        tail.push(seg)
        node = seg
    }

    // loot sack on the back (empty at the start; scaled up when carrying)
    const sack = put(hips, sph(0.16, 9), sackM, 0, 0.42, -0.2, [1, 0.9, 1])
    sack.visible = false

    g.userData.anim = {
        t: Math.random() * 10,
        legs, tail, ears, head, chest, hips, sack, eyeM, neck, eyes: [eyeL, eyeR],
        speed: 0, crouch: 0, carry: 0, phase: Math.random() * 6,
    }
    return g
}

/**
 * One frame of raccoon procedural animation. `s` is planar speed in world units/s.
 * The important bits for "is that a raccoon or a dog": the side-to-side waddle, the
 * tail counter-swing, and the head bob that leads the body.
 */
export function animRaccoon(g, dt, s, opts = {}) {
    const a = g.userData.anim
    if (!a) return
    a.t += dt
    const eyes = a.eyes
    const sp = s || 0
    a.speed += (sp - a.speed) * Math.min(1, dt * 8)
    const v = a.speed
    const f = 6.5 + v * 2.4                       // stride frequency rises with speed
    const ph = a.t * f + a.phase
    const amp = Math.min(1, v / 3.2)

    for (let i = 0; i < a.legs.length; i++) {
        const leg = a.legs[i]
        const back = i >= 2
        const diag = (i % 2 === 0 ? 1 : -1) * (back ? -1 : 1)
        leg.rotation.x = Math.sin(ph + (back ? Math.PI : 0)) * 0.75 * amp * diag
        leg.position.y = (back ? 0.3 : 0.36) + Math.max(0, Math.sin(ph + (back ? Math.PI : 0))) * 0.045 * amp
    }
    a.hips.position.y = (opts.crouch ? -0.09 : 0) + Math.abs(Math.sin(ph)) * 0.035 * amp
    a.hips.rotation.z = Math.sin(ph) * 0.13 * amp
    a.hips.rotation.x = (opts.crouch ? 0.22 : 0) + v * 0.035
    for (let i = 0; i < a.tail.length; i++) {
        const seg = a.tail[i]
        seg.rotation.y = Math.sin(a.t * (2.2 + v * 1.6) - i * 0.55 + a.phase) * (0.16 + 0.1 * amp)
        seg.rotation.x = (i === 0 ? -0.35 : 0.06) + Math.sin(a.t * 1.4 - i * 0.4) * 0.07 - (opts.alert ? 0.12 : 0) + (opts.crouch ? 0.3 : 0)
    }
    a.head.rotation.z = Math.sin(ph + 0.6) * 0.09 * amp
    a.head.rotation.x = Math.sin(a.t * 1.1) * 0.05 - v * 0.02 - (opts.crouch ? 0.1 : 0)
    a.head.position.y = 0.5 + Math.sin(ph + 1.2) * 0.012 * amp
    if (opts.earTwitch) for (const e of a.ears) e.rotation.x = Math.sin(a.t * 22) * 0.25
    else for (const e of a.ears) e.rotation.x *= 1 - Math.min(1, dt * 6)
    if (a.sack) a.sack.scale.setScalar(opts.carry ? 1.35 : 1)
    a.sack.visible = !!opts.carry
    // eyeshine: tapetum lucidum. Raccoons glow green when the moon hits them.
    a.eyeM.emissiveIntensity = opts.shine ? (opts.alert ? 1.5 : 0.85) : 0.06
    // pupils blow wide in the dark — and the blink is the whole difference between a
    // prop and a creature (engine.js drives `blink` on a timer).
    const open = opts.blink ? 0.12 : 1
    if (eyes) {
        eyes[0].scale.y += (open - eyes[0].scale.y) * Math.min(1, dt * 18)
        eyes[1].scale.y = eyes[0].scale.y
        for (const e of eyes) e.position.z = 0.155 + (opts.alert ? 0.006 : 0)
    }
}

// ---------------------------------------------------------------- props ----------
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s)

export function makeCardboardBox(s = 1, seed = 3) {
    const g = new THREE.Group()
    const m = propMat('cardboard')
    const t = Math.max(0.03, s * 0.035)
    const h = s * 0.82

    // An open-top carton is four walls and a floor. Building it as one solid box and
    // sticking flaps on top is why the first version read as an exploded star.
    const floor = new THREE.Mesh(box(s, t, s), m)
    floor.position.y = t / 2; floor.receiveShadow = true
    g.add(floor)
    for (const sgn of [-1, 1]) {
        const front = new THREE.Mesh(box(s, h, t), m)
        front.position.set(0, h / 2, sgn * s / 2)
        front.castShadow = true; front.receiveShadow = true
        g.add(front)
        const side = new THREE.Mesh(box(t, h, s), m)
        side.position.set(sgn * s / 2, h / 2, 0)
        side.castShadow = true; side.receiveShadow = true
        g.add(side)
    }

    // Four flaps, each hinged on its own top rim edge, drooped over the outside. The
    // sign of the hinge angle is the whole trick: past 90 degrees the tip curls back
    // INWARD, which is what the first version did and why it looked like a paper tulip.
    const flapLen = s * 0.98
    for (let i = 0; i < 4; i++) {
        const hinge = new THREE.Group()
        const along = i < 2                     // 0/1 hinge over the z rims, 2/3 over x
        const sgn = i % 2 ? 1 : -1
        hinge.position.set(along ? 0 : sgn * s / 2, h, along ? sgn * s / 2 : 0)
        const flap = new THREE.Mesh(along ? box(s, t, flapLen) : box(flapLen, t, s), m)
        if (along) flap.position.z = sgn * flapLen / 2
        else flap.position.x = sgn * flapLen / 2
        flap.castShadow = true
        hinge.add(flap)
        const droop = 1.05 + ((seed + i) % 3) * 0.16
        if (along) hinge.rotation.x = sgn * droop
        else hinge.rotation.z = -sgn * droop
        g.add(hinge)
    }
    // a taped seam, so the cardboard texture's tape band lands somewhere believable
    const tape = new THREE.Mesh(box(s * 1.01, t * 0.9, s * 0.28), mat('tape', { color: 0xcbbfa0, roughness: 1 }))
    tape.position.set(0, h * 0.72, 0)
    tape.rotation.x = Math.PI / 2
    g.add(tape)
    g.rotation.y = rng(seed)() * 6.283
    g.userData.hideAt = h * 0.55
    return g
}

/** The alley's signature object, and a hide spot. Lid ajar, trash spilling out. */
export function makeDumpster(seed = 1) {
    const g = new THREE.Group()
    const bodyM = mat('dumpster', { map: makeTex('metal'), color: 0x3f6f5b, roughness: 0.62, metalness: 0.45, envMapIntensity: 0.9 })
    // A 4-sided cylinder with different top/bottom radii is a tapered square prism —
    // which is exactly the shape of a dumpster, for the price of one draw call.
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.15, 1.12, 4, 1), bodyM)
    shell.rotation.y = Math.PI / 4
    shell.scale.set(1, 1, 0.62)
    shell.position.y = 0.62
    shell.castShadow = true; shell.receiveShadow = true
    g.add(shell)
    const rim = new THREE.Mesh(box(2.3, 0.1, 1.5), mat('metalDark', { map: makeTex('metal'), color: PAL.metalDark, roughness: 0.55, metalness: 0.7, envMapIntensity: 1.1 }))
    rim.position.y = 1.2; rim.castShadow = true
    g.add(rim)
    // ribs: the silhouette that says "dumpster" from across a dark yard
    for (let i = -1; i <= 1; i++) {
        const rib = new THREE.Mesh(box(0.09, 0.95, 1.55), mat('rib', { map: makeTex('metal'), color: 0x35604f, roughness: 0.6, metalness: 0.5 }))
        rib.position.set(i * 0.62, 0.62, 0); rib.castShadow = true
        g.add(rib)
    }
    const lid = new THREE.Group()
    lid.position.set(0, 1.24, -0.72)
    const lidPlate = new THREE.Mesh(box(2.32, 0.1, 1.5), mat('dumpLid', { map: makeTex('metal'), color: 0x48785f, roughness: 0.55, metalness: 0.5, envMapIntensity: 1.1 }))
    lidPlate.position.set(0, 0, 0.74); lidPlate.castShadow = true
    lid.add(lidPlate)
    lid.rotation.x = -0.95            // ajar: this is a hide spot, it has to open
    g.add(lid)

    // trash spilling over the rim
    const bagM = mat('bag', { color: 0x272c33, roughness: 0.5, metalness: 0.1 })
    const R = rng(seed)
    for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + R() * 0.1, 0), bagM)
        b.position.set((R() - 0.5) * 1.4, 1.2 + R() * 0.16, (R() - 0.5) * 0.6)
        b.scale.set(1.1, 0.72, 1)
        b.castShadow = true
        g.add(b)
    }
    for (const x of [-0.8, 0.8]) {
        const w = new THREE.Mesh(cyl(0.16, 0.16, 0.12, 8), mat('wheel', { color: 0x191c20, roughness: 0.9 }))
        w.rotation.z = Math.PI / 2; w.position.set(x, 0.16, 0.55); g.add(w)
    }
    // stencilled warning on the front face
    const stencil = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshStandardMaterial({ map: makeTex('stencil'), transparent: true, roughness: 1 }))
    stencil.position.set(0.02, 0.66, 0.79); g.add(stencil)
    g.userData.lid = lid
    g.userData.canHide = true
    return g
}

export function makeTrashCan(seed = 1) {
    const g = new THREE.Group()
    const m = mat('can' + (seed % 3), { map: makeTex('metal', 1, 1), color: [0x3c4a52, 0x4a4038, 0x2f4438][seed % 3], roughness: 0.75, metalness: 0.35 })
    const body = new THREE.Mesh(cyl(0.34, 0.28, 0.85, 9), m)
    body.position.y = 0.42; body.castShadow = true; body.receiveShadow = true
    g.add(body)
    const lid = new THREE.Mesh(cyl(0.36, 0.36, 0.07, 9), m)
    lid.position.y = 0.88; lid.castShadow = true
    g.add(lid)
    // NB: g.add() returns the group, not the mesh — a ring added with `g.add(x).rotation`
    // rotates the whole can onto its side. Add, then transform.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 5, 10), m)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.6
    g.add(ring)
    g.rotation.y = rng(seed)() * 6.283
    return g
}

export function makeTrashBag(seed = 5) {
    const g = new THREE.Group()
    const m = mat('bag', { color: 0x22262c, roughness: 0.5, metalness: 0.1 })
    const r = rng(seed)
    for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + r() * 0.12, 0), m)
        b.position.set((r() - 0.5) * 0.4, 0.16 + r() * 0.14, (r() - 0.5) * 0.3)
        b.scale.set(1, 0.75, 1)
        b.castShadow = true
        g.add(b)
    }
    return g
}

export function makeCrate(s = 0.9) {
    const g = new THREE.Group()
    const m = propMat('wood')
    const b = new THREE.Mesh(box(s, s, s), m)
    b.position.y = s / 2; b.castShadow = true; b.receiveShadow = true
    g.add(b)
    const trim = mat('trim', { color: 0x4a3524, roughness: 1 })
    for (const y of [0.12, s - 0.12]) {
        const t = new THREE.Mesh(box(s * 1.03, 0.07, s * 1.03), trim)
        t.position.y = y; g.add(t)
    }
    return g
}

export function makePallet() {
    const g = new THREE.Group()
    const m = mat('pallet', { map: makeTex('wood', 1, 1), color: 0x8a7355, roughness: 1 })
    for (let i = 0; i < 4; i++) {
        const p = new THREE.Mesh(box(1.2, 0.06, 0.22), m)
        p.position.set(0, 0.14, -0.45 + i * 0.3); p.castShadow = true; p.receiveShadow = true
        g.add(p)
    }
    const b = new THREE.Mesh(box(1.2, 0.1, 0.16), m); b.position.y = 0.05; g.add(b)
    return g
}

/** Sodium street lamp: the warm light in an otherwise blue alley. */
export function makeLamppost() {
    const g = new THREE.Group()
    const m = mat('lampPole', { color: 0x1e252b, roughness: 0.6, metalness: 0.6 })
    const pole = new THREE.Mesh(cyl(0.07, 0.11, 4.6, 7), m)
    pole.position.y = 2.3; pole.castShadow = true
    g.add(pole)
    const arm = new THREE.Mesh(cyl(0.055, 0.055, 0.8, 6), m)
    arm.rotation.z = Math.PI / 2.4; arm.position.set(0.3, 4.5, 0)
    g.add(arm)
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.16, 0.2, 8, 1, true), mat('shade', { color: 0x141a20, roughness: 0.7, metalness: 0.5, side: THREE.DoubleSide }))
    shade.position.set(0.58, 4.46, 0)
    g.add(shade)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat('bulb', { color: 0x2a2118, emissive: PAL.sodium, emissiveIntensity: 6, roughness: 1 }))
    bulb.position.set(0.58, 4.34, 0)
    g.add(bulb)
    // one soft additive ball, centred on the bulb. Any bigger and it reads as a
    // crescent where the shade clips it, which is the opposite of a street lamp.
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshBasicMaterial({ color: PAL.sodium, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }))
    halo.position.copy(bulb.position)
    g.add(halo)
    g.userData.bulb = bulb
    g.userData.lightAt = [0.58, 4.3, 0]
    return g
}

export function makeBush(s = 1) {
    const g = new THREE.Group()
    const m = mat('bush', { color: PAL.leafDark, roughness: 1 })
    const m2 = mat('bush2', { color: PAL.moss, roughness: 1 })
    const r = rng(s * 13)
    for (let i = 0; i < 5; i++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34 * s * (0.7 + r() * 0.6), 0), i % 2 ? m : m2)
        b.position.set((r() - 0.5) * 0.7 * s, 0.24 * s + r() * 0.24 * s, (r() - 0.5) * 0.7 * s)
        b.castShadow = true
        g.add(b)
    }
    return g
}

/** Puddle: additive cyan glare that shimmers. Cheap, and it sells "wet night". */
export function makePuddle(r = 1, seed = 1) {
    const rr = rng(seed)
    const geo = new THREE.CircleGeometry(r, 20)
    const p = geo.attributes.position
    for (let i = 0; i < p.count; i++) {
        p.setXY(i, p.getX(i) * (0.7 + rr() * 0.6), p.getY(i) * (0.55 + rr() * 0.6))
    }
    geo.computeVertexNormals()
    // the radial-fade map is why a puddle reads as a wet stain; a flat disc reads as a
    // white polygon that someone forgot to texture
    const m = new THREE.MeshBasicMaterial({
        map: makeTex('puddle'), color: PAL.cyan, transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, m)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = 0.012
    mesh.userData.puddle = true
    return mesh
}

/**
 * Washing line strung between two points with a couple of items flapping on it. Pure
 * set dressing — but a skyline with laundry in it reads as somewhere people live,
 * which is the difference between a level and a diorama.
 */
export function makeWashingLine(a, b, seed = 1) {
    const g = new THREE.Group()
    const R = rng(seed)
    const from = new THREE.Vector3(a[0], a[1], a[2])
    const to = new THREE.Vector3(b[0], b[1], b[2])
    const mid = from.clone().lerp(to, 0.5)
    mid.y -= 0.3 + from.distanceTo(to) * 0.045
    const curve = new THREE.CatmullRomCurve3([from, mid, to])
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(20)),
        new THREE.LineBasicMaterial({ color: 0x121a20 })))
    const cloth = [0xc8483f, 0xe8e0d0, 0x4bb46a]
    const clothes = []
    for (let i = 0; i < 2; i++) {
        const p = curve.getPoint(0.3 + i * 0.36)
        const w = 0.5 + R() * 0.4, h = 0.45 + R() * 0.5
        const c = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 2, 3), new THREE.MeshStandardMaterial({
            color: cloth[(seed + i) % 3], roughness: 1, side: THREE.DoubleSide,
        }))
        c.position.set(p.x, p.y - h / 2, p.z)
        c.castShadow = true
        c.userData.phase = R() * 6.283
        g.add(c)
        clothes.push(c)
    }
    g.userData.clothes = clothes
    return g
}

/** Chain-link fence run: occludes nothing, but pathfinding and sight both respect it. */
export function makeFence(len = 4) {
    const g = new THREE.Group()
    const meshMat = new THREE.MeshStandardMaterial({ map: makeTex('chainlink', len / 1.2, 1), transparent: true, alphaTest: 0.35, roughness: 0.5, metalness: 0.5, color: 0x8fa3b0, envMapIntensity: 0.5, side: THREE.DoubleSide })
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.2), meshMat)
    panel.position.y = 1.1
    g.add(panel)
    const pm = mat('post', { color: 0x2b3238, roughness: 0.6, metalness: 0.6 })
    for (let x = -len / 2; x <= len / 2 + 0.01; x += len / 2) {
        const p = new THREE.Mesh(cyl(0.05, 0.06, 2.35, 6), pm)
        p.position.set(x, 1.17, 0); p.castShadow = true
        g.add(p)
    }
    const rail = new THREE.Mesh(cyl(0.04, 0.04, len, 6), pm)
    rail.rotation.z = Math.PI / 2; rail.position.y = 2.24
    g.add(rail)
    return g
}

/** Warm window on a wall face: emissive quad + a light only if we can afford one. */
export function makeWindow(w = 1, h = 1.2, glow = 1) {
    const g = new THREE.Group()
    const frame = new THREE.Mesh(box(w + 0.14, h + 0.14, 0.08), mat('frame', { color: 0x1b2126, roughness: 0.9 }))
    g.add(frame)
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
        color: 0x241a10, emissive: PAL.amber, emissiveIntensity: 1.1 * glow, roughness: 1,
    }))
    pane.position.z = 0.05
    g.add(pane)
    const bar = new THREE.Mesh(box(w, 0.05, 0.02), mat('bar', { color: 0x12171b, roughness: 1 }))
    bar.position.z = 0.08; g.add(bar)
    const barV = new THREE.Mesh(box(0.05, h, 0.02), mat('bar', { color: 0x12171b, roughness: 1 }))
    barV.position.z = 0.08; g.add(barV)
    g.userData.pane = pane
    return g
}

/** Fire escape: silhouette candy for the skyline and a nice shadow pattern. */
export function makeFireEscape(h = 3) {
    const g = new THREE.Group()
    const m = mat('fe', { color: 0x1f262c, roughness: 0.7, metalness: 0.7 })
    for (let i = 0; i < h; i++) {
        const y = 2.6 + i * 2.6
        const deck = new THREE.Mesh(box(2.4, 0.1, 1.1), m)
        deck.position.set(0, y, 0.55); deck.castShadow = true
        g.add(deck)
        const rail = new THREE.Mesh(box(2.4, 0.06, 0.05), m); rail.position.set(0, y + 0.6, 1.05); g.add(rail)
        for (let k = 0; k <= 8; k++) {
            const bal = new THREE.Mesh(box(0.04, 0.6, 0.04), m)
            bal.position.set(-1.2 + k * 0.3, y + 0.3, 1.05); g.add(bal)
        }
        const ladder = new THREE.Mesh(box(0.5, 2.5, 0.05), m)
        ladder.position.set(0.7, y - 1.25, 1.0); ladder.rotation.x = 0.12; g.add(ladder)
    }
    return g
}

export function makeAC() {
    const g = new THREE.Group()
    const b = new THREE.Mesh(box(0.9, 0.6, 0.7), mat('ac', { map: makeTex('metal', 1, 1), color: 0x6e7a80, roughness: 0.6, metalness: 0.6 }))
    b.castShadow = true; b.position.y = 0.3
    g.add(b)
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.24, 12), mat('fan', { color: 0x20262b, roughness: 0.8 }))
    fan.rotation.y = Math.PI / 2; fan.position.set(0.46, 0.32, 0)
    g.add(fan)
    g.userData.fan = fan
    return g
}

export function makeHydrant() {
    const g = new THREE.Group()
    const m = mat('hyd', { color: 0xb8443a, roughness: 0.6, metalness: 0.3 })
    const b = new THREE.Mesh(cyl(0.14, 0.17, 0.6, 8), m); b.position.y = 0.3; b.castShadow = true; g.add(b)
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), m); cap.position.y = 0.62; g.add(cap)
    for (const s of [-1, 1]) { const a = new THREE.Mesh(cyl(0.06, 0.06, 0.14, 6), m); a.rotation.z = Math.PI / 2; a.position.set(s * 0.17, 0.42, 0); g.add(a) }
    return g
}

/** Awning over a shopfront: the striped red/white adds a warm accent downtown. */
export function makeAwning(w = 3) {
    const g = new THREE.Group()
    const geo = box(w, 0.1, 1.4)
    const m = mat('awn', { color: 0xc8483f, roughness: 1 })
    const a = new THREE.Mesh(geo, m); a.castShadow = true; g.add(a)
    for (let i = 0; i < Math.floor(w / 0.5); i++) {
        if (i % 2) continue
        const s = new THREE.Mesh(box(0.25, 0.11, 1.42), mat('awnW', { color: 0xe8e0d0, roughness: 1 }))
        s.position.x = -w / 2 + 0.25 + i * 0.5
        g.add(s)
    }
    return g
}

/** Roof garden / gravel cap, so looking up at the skyline is not empty. */
export function makeRooftopGear(w = 4, d = 4, seed = 2) {
    const g = new THREE.Group()
    const r = rng(seed)
    const tank = new THREE.Mesh(cyl(0.6, 0.6, 1.1, 9), mat('tank', { map: makeTex('wood', 1, 1), color: 0x6a5138, roughness: 1 }))
    tank.position.set(w * 0.25, 0.65, -d * 0.2); tank.castShadow = true
    g.add(tank)
    const leg = new THREE.Mesh(box(1.1, 0.12, 1.1), mat('leg', { color: 0x30373d, roughness: 1 }))
    leg.position.set(w * 0.25, 0.06, -d * 0.2); g.add(leg)
    for (let i = 0; i < 3; i++) {
        const vent = new THREE.Mesh(box(0.4, 0.3 + r() * 0.3, 0.4), mat('vent', { map: makeTex('metal', 1, 1), color: 0x59646b, roughness: 0.7, metalness: 0.5 }))
        vent.position.set(-w * 0.25 + r() * w * 0.3, 0.2, d * (0.1 + r() * 0.25))
        vent.castShadow = true
        g.add(vent)
    }
    return g
}

// ------------------------------------------------------------------- sky ---------
/** Big moon disc + halo, parked at infinity. Fog must be off on this group. */
export function makeMoon() {
    const g = new THREE.Group()
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.2, 24), new THREE.MeshBasicMaterial({ color: 0xf2fbff, fog: false }))
    const halo = new THREE.Mesh(new THREE.CircleGeometry(11, 24), new THREE.MeshBasicMaterial({ color: 0x8ec6ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
    g.add(halo); g.add(disc)
    g.renderOrder = -1
    return g
}

// ----------------------------------------------------------------- helpers -------
/** Merge an array of {geo, matrix} into one geometry (static level batch). */
export function batch(items) {
    // An empty batch is not an error — it is "this level has no fences". The museum
    // has no FENCE cells, `mergeGeometries([])` read `geometries[0].index` off
    // undefined, and job 2 CRASHED on mount: it had never been playable, by anyone,
    // from the day it was committed. Callers who then check
    // `geo.attributes.position.count` were clearly expecting this to answer quietly,
    // so the quiet answer ships pre-warmed with an empty position attribute.
    if (!items.length) {
        const empty = new THREE.BufferGeometry()
        empty.setAttribute('position', new THREE.Float32BufferAttribute([], 3))
        return empty
    }
    const geos = []
    for (const it of items) {
        const g = it.geo.clone()
        g.applyMatrix4(it.matrix)
        geos.push(g)
    }
    const merged = mergeGeometries(geos, false)
    for (const g of geos) g.dispose()
    return merged
}

/**
 * Merge every static mesh under `node` into one mesh per material, in place.
 *
 * For props that are *built* as a little scene — a pound is twenty bars and a roof, a
 * gate is a plate and six slats — the hierarchy buys nothing: nothing inside them ever
 * moves independently. Without this, the level's set dressing is a hundred draw calls
 * of four triangles each; with it, a whole job is a few dozen.
 *
 * Transparent parts are deliberately left alone (they need their own sorting), and this
 * must never be called on a rigged actor: the raccoon and the walkers keep their
 * hierarchy because their children are their joints.
 */
export function bakeMeshes(node) {
    node.updateMatrixWorld(true)
    const buckets = new Map()
    const kills = []
    node.traverse((o) => {
        if (!o.isMesh || !o.geometry || o === node) return
        if (o.material && o.material.transparent) return
        if (o.parent && o.parent.userData && o.parent.userData.keep) return
        const g = o.geometry.clone()
        g.applyMatrix4(o.matrixWorld)
        const key = o.material.uuid
        if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [] })
        buckets.get(key).geos.push(g)
        kills.push(o)
    })
    for (const o of kills) if (o.parent) o.parent.remove(o)
    for (const { mat: m, geos } of buckets.values()) {
        if (!geos.length) continue
        const merged = geos.length === 1 ? geos[0] : batch(geos.map((geo) => ({ geo, matrix: new THREE.Matrix4() })))
        const mesh = new THREE.Mesh(merged, m)
        mesh.castShadow = true
        mesh.receiveShadow = true
        node.add(mesh)
    }
    return node
}

export function disposables(root) {
    const out = []
    root.traverse(o => { if (o.geometry) out.push(o.geometry) })
    return out
}

// ------------------------------------------------------------------ the cast ------
/**
 * Everyone who is not a raccoon. Same philosophy as the raccoon: a transform
 * hierarchy plus a sine, not a skeleton. The important silhouette pieces are the
 * shoulders (so the torch arm reads) and the hat brim (so a guard at 30 m is still
 * a guard and not a blob).
 */
export function makeWalker(kind = 'guard') {
    const g = new THREE.Group()
    g.userData.rig = kind
    const uniform = kind === 'cop' ? 0x1b2a3d : kind === 'cop2' ? 0x2a1b2d : 0x27384d
    const skin = kind === 'dog' || kind === 'cat' ? PAL.fur : 0xc9977a
    const clothM = mat('cloth' + kind, { color: uniform, roughness: 0.95 })
    const skinM = mat('skin' + kind, { color: skin, roughness: 1 })
    const hip = new THREE.Group()
    hip.position.y = 0.02
    g.add(hip)

    if (kind === 'dog' || kind === 'cat') {
        const col = kind === 'cat' ? PAL.cat : 0x4a3a2c
        const m = mat('animal' + kind, { color: col, roughness: 1 })
        const body = new THREE.Mesh(box(0.34, 0.3, kind === 'cat' ? 0.52 : 0.62), m)
        body.position.y = 0.42; body.castShadow = true
        hip.add(body)
        const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), m)
        head.position.set(0, 0.56, kind === 'cat' ? 0.3 : 0.34); head.castShadow = true
        hip.add(head)
        const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 6), m)
        snout.position.set(0, 0.5, 0.5); snout.rotation.x = Math.PI / 2
        hip.add(snout)
        for (const s of [-1, 1]) {
            const ear = new THREE.Mesh(new THREE.ConeGeometry(kind === 'cat' ? 0.07 : 0.09, kind === 'cat' ? 0.16 : 0.13, 4), m)
            ear.position.set(s * 0.1, 0.71, 0.26); ear.rotation.z = s * (kind === 'cat' ? 0.25 : 0.5)
            hip.add(ear)
        }
        const legs = []
        for (const [x, z] of [[-0.12, 0.18], [0.12, 0.18], [-0.12, -0.2], [0.12, -0.2]]) {
            const l = new THREE.Mesh(cyl(0.05, 0.04, 0.3, 5), m)
            l.position.set(x, 0.15, z); l.castShadow = true
            hip.add(l); legs.push(l)
        }
        const tail = new THREE.Mesh(cyl(0.035, 0.02, 0.34, 5), m)
        tail.position.set(0, 0.55, kind === 'cat' ? -0.32 : -0.36)
        tail.rotation.x = kind === 'cat' ? -0.9 : -1.3
        hip.add(tail)
        const eyeM = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.1, emissive: kind === 'cat' ? 0x8ef0a0 : 0xffb060, emissiveIntensity: 0.9 })
        for (const s of [-1, 1]) {
            const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), eyeM)
            e.position.set(s * 0.07, 0.6, 0.44)
            hip.add(e)
        }
        g.userData.anim = { hip, legs, tail, head, eyeM, kind }
        return g
    }

    // torso: a tapered torso with a hi-vis vest, so a guard catches the lamp light
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.28, 0.72, 7), clothM)
    torso.position.y = 0.98; torso.castShadow = true
    hip.add(torso)
    if (kind !== 'sec') {
        const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.29, 0.36, 7), mat('hivis' + kind, {
            color: kind === 'cop' ? 0x2b3f5c : PAL.hivis, roughness: 0.7,
            emissive: kind === 'cop' ? 0x11304d : 0x3a4200, emissiveIntensity: 0.55,
        }))
        vest.position.y = 1.02
        hip.add(vest)
    }
    const neck = new THREE.Mesh(cyl(0.07, 0.07, 0.1, 6), skinM); neck.position.y = 1.36; hip.add(neck)
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), skinM)
    head.position.y = 1.5; head.castShadow = true
    hip.add(head)
    // hat brim: the far-distance read of "authority" is a wide flat disc
    const brim = new THREE.Mesh(cyl(0.23, 0.23, 0.03, 10), mat('hat' + kind, { color: 0x141d28, roughness: 0.8 }))
    brim.position.y = 1.6; hip.add(brim)
    const crown = new THREE.Mesh(cyl(0.15, 0.16, 0.14, 8), mat('hat2' + kind, { color: 0x1a2430, roughness: 0.8 }))
    crown.position.y = 1.68; hip.add(crown)
    if (kind === 'cop' || kind === 'cop2') {
        const bar = new THREE.Mesh(box(0.22, 0.07, 0.1), mat('siren', { color: 0x33060a, emissive: PAL.red, emissiveIntensity: 2, roughness: 1 }))
        bar.position.set(0, 1.74, 0)
        hip.add(bar)
        g.userData.siren = bar
    }
    const legs = []
    for (const s of [-1, 1]) {
        const l = new THREE.Mesh(cyl(0.075, 0.06, 0.64, 6), mat('trousers' + kind, { color: 0x1a222c, roughness: 1 }))
        l.position.set(s * 0.11, 0.32, 0); l.castShadow = true
        hip.add(l); legs.push(l)
        const shoe = new THREE.Mesh(box(0.13, 0.08, 0.24), mat('shoe', { color: 0x0e1114, roughness: 0.6 }))
        shoe.position.set(s * 0.11, 0.04, 0.04)
        hip.add(shoe)
        legs.push(shoe)
    }
    // the torch arm is the one that matters: it is where the light comes from
    const armR = new THREE.Group(); armR.position.set(0.26, 1.24, 0); hip.add(armR)
    const armL = new THREE.Group(); armL.position.set(-0.26, 1.24, 0); hip.add(armL)
    for (const a of [armR, armL]) {
        const upper = new THREE.Mesh(cyl(0.06, 0.05, 0.42, 6), clothM)
        upper.position.y = -0.21; upper.castShadow = true
        a.add(upper)
        const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), skinM)
        hand.position.y = -0.44
        a.add(hand)
    }
    const torch = new THREE.Mesh(cyl(0.05, 0.045, 0.18, 6), mat('torch', { color: 0x14181c, roughness: 0.5, metalness: 0.4 }))
    torch.position.set(0, -0.5, 0.06); torch.rotation.x = 1.4
    armR.add(torch)
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mat('lens', { color: 0x201c10, emissive: 0xffe6b0, emissiveIntensity: 4, roughness: 1 }))
    lens.position.set(0, -0.56, 0.15)
    armR.add(lens)
    g.userData.anim = { hip, legs: legs.filter((_, i) => i % 2 === 0), armR, armL, head, torch, lens, kind }
    return g
}

/** Walk cycle for the cast. Two sines and a lean; the torch arm leads. */
export function animWalker(g, dt, speed, opts = {}) {
    const a = g.userData.anim
    if (!a) return
    a.t = (a.t || 0) + dt
    const v = speed || 0
    const f = 4 + v * 2
    const ph = a.t * f
    const amp = Math.min(1, v / 2.2)
    if (a.kind === 'dog' || a.kind === 'cat') {
        for (let i = 0; i < a.legs.length; i++) a.legs[i].rotation.x = Math.sin(ph + (i % 2) * Math.PI + ((i / 2) | 0) * Math.PI) * 0.6 * amp
        a.hip.position.y = 0.02 + Math.abs(Math.sin(ph)) * 0.03 * amp
        a.tail.rotation.y = Math.sin(a.t * (a.kind === 'cat' ? 2.6 : 6)) * (a.kind === 'cat' ? 0.5 : 0.35)
        a.eyeM.emissiveIntensity = opts.alert ? 2.2 : 0.9
        return
    }
    for (let i = 0; i < a.legs.length; i++) {
        const p = Math.sin(ph + (i % 2) * Math.PI)
        a.legs[i].rotation.x = p * 0.55 * amp
    }
    a.hip.position.y = 0.02 + Math.abs(Math.sin(ph)) * 0.025 * amp
    a.hip.rotation.z = Math.sin(ph) * 0.04 * amp
    a.armL.rotation.x = Math.sin(ph + Math.PI) * 0.5 * amp - 0.05
    a.armR.rotation.x = opts.alert ? -0.35 : Math.sin(ph) * 0.45 * amp - 0.15
    a.head.rotation.y = Math.sin(a.t * (opts.alert ? 3.4 : 0.7)) * (opts.alert ? 0.5 : 0.18)
    if (g.userData.siren) {
        const blink = Math.sin(a.t * 12) > 0
        g.userData.siren.material.emissive.setHex(blink ? 0xff3b30 : 0x2f6bff)
    }
}

// --------------------------------------------------------------- loot & set -----
const LOOT_VALUE = { $: 120, '%': 260, '&': 400, '*': 520 }
export const lootValue = (kind) => LOOT_VALUE[kind] ?? 100
export const lootLabel = (kind) => ({ $: 'a sack of coin', '%': 'an oil painting', '&': 'the moonstone', '*': 'the donation urn' }[kind] || 'loot')

/** One prop per kind of shiny, because "TAKE THE LOOT" is not a reason to be greedy. */
export function makeLoot(kind) {
    const g = new THREE.Group()
    if (kind === '$') {
        const sack = new THREE.Mesh(new THREE.SphereGeometry(0.26, 9, 7), mat('sack2', { color: 0xbfa471, roughness: 1 }))
        sack.scale.set(1, 0.85, 1); sack.position.y = 0.22; sack.castShadow = true
        g.add(sack)
        const tie = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 5, 8), mat('tie', { color: 0x6b4a30, roughness: 1 }))
        tie.position.y = 0.44; tie.rotation.x = Math.PI / 2
        g.add(tie)
        const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshStandardMaterial({ map: makeTex('dollar'), transparent: true, roughness: 1 }))
        mark.position.set(0, 0.24, 0.235)
        g.add(mark)
    } else if (kind === '%') {
        const frame = new THREE.Mesh(box(0.66, 0.5, 0.07), mat('gilt', { color: 0xa8802f, roughness: 0.35, metalness: 0.8, envMapIntensity: 1.4 }))
        frame.position.y = 0.55; frame.castShadow = true
        g.add(frame)
        const canvasArt = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.38), new THREE.MeshStandardMaterial({ map: makeTex('painting'), roughness: 1 }))
        canvasArt.position.set(0, 0.55, 0.045)
        g.add(canvasArt)
    } else if (kind === '&') {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), new THREE.MeshStandardMaterial({
            color: 0x9fe8ff, emissive: 0x2fa8d8, emissiveIntensity: 1.1, roughness: 0.05, metalness: 0.3, flatShading: true, envMapIntensity: 2,
        }))
        gem.position.y = 0.34; gem.castShadow = true
        g.add(gem)
        const base = new THREE.Mesh(cyl(0.14, 0.18, 0.1, 8), mat('base2', { color: 0x2c3540, roughness: 0.5, metalness: 0.6 }))
        base.position.y = 0.05
        g.add(base)
        g.userData.gem = gem
    } else {
        // urn: LatheGeometry is a free pottery wheel
        const pts = []
        for (let i = 0; i <= 8; i++) {
            const t = i / 8
            pts.push(new THREE.Vector2(0.1 + Math.sin(t * Math.PI) * 0.24, t * 0.62))
        }
        const urn = new THREE.Mesh(new THREE.LatheGeometry(pts, 12), mat('urn', { color: 0x8c6a4a, roughness: 0.45, metalness: 0.25, envMapIntensity: 1.1 }))
        urn.castShadow = true
        g.add(urn)
        const lip = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 5, 10), mat('lipl', { color: 0xb08a5c, roughness: 0.4, metalness: 0.4 }))
        lip.position.y = 0.62; lip.rotation.x = Math.PI / 2
        g.add(lip)
    }
    g.userData.kind = kind
    return g
}

/** The getaway: a hardware cart with a blanket in it. Delivered loot piles up inside. */
export function makeCart() {
    const g = new THREE.Group()
    const wire = mat('cartWire', { color: 0x8f9aa4, roughness: 0.4, metalness: 0.8, envMapIntensity: 1.1 })
    const basket = new THREE.Mesh(box(1.15, 0.6, 0.8), new THREE.MeshStandardMaterial({ map: makeTex('chainlink', 4, 2), transparent: true, alphaTest: 0.3, color: 0xa7b4bf, roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide }))
    basket.position.y = 0.62; basket.castShadow = true
    g.add(basket)
    const blanket = new THREE.Mesh(box(1.05, 0.1, 0.7), mat('blanket', { color: 0x8c3f38, roughness: 1 }))
    blanket.position.y = 0.42
    g.add(blanket)
    for (const [x, z] of [[-0.44, 0.3], [0.44, 0.3], [-0.44, -0.3], [0.44, -0.3]]) {
        const w = new THREE.Mesh(cyl(0.13, 0.13, 0.08, 8), mat('caster', { color: 0x171a1e, roughness: 0.9 }))
        w.rotation.z = Math.PI / 2; w.position.set(x, 0.14, z)
        g.add(w)
    }
    const bar = new THREE.Mesh(cyl(0.03, 0.03, 1.1, 6), wire)
    bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.0, -0.44)
    g.add(bar)
    for (const s of [-1, 1]) {
        const post = new THREE.Mesh(cyl(0.03, 0.03, 0.4, 6), wire)
        post.position.set(s * 0.5, 0.86, -0.42); post.rotation.x = 0.3
        g.add(post)
    }
    // Basket, blanket, casters and handle become one mesh. The pile that grows inside
    // them is kept out of the bake, because delivered loot keeps landing in it.
    bakeMeshes(g)
    g.userData.pile = new THREE.Group()
    g.userData.pile.userData.keep = true
    g.add(g.userData.pile)
    return g
}

/** Rolling gate over the escape. Slides up when the job is done. */
export function makeGate(w = 2, h = 3) {
    const g = new THREE.Group()
    const door = new THREE.Group()
    const skin = mat('gate', { map: makeTex('metal'), color: 0x5b6b76, roughness: 0.5, metalness: 0.75, envMapIntensity: 1.1 })
    const plate = new THREE.Mesh(box(w, h, 0.16), skin)
    plate.position.y = h / 2; plate.castShadow = true
    door.add(plate)
    for (let i = 1; i < 6; i++) {
        const slat = new THREE.Mesh(box(w * 1.01, 0.06, 0.2), mat('slat', { color: 0x37444d, roughness: 0.5, metalness: 0.7 }))
        slat.position.y = (h / 6) * i
        door.add(slat)
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, 0.5), new THREE.MeshStandardMaterial({ map: makeTex('stencil'), transparent: true, roughness: 1 }))
    sign.position.set(0, h * 0.62, 0.1)
    door.add(sign)
    // Bake the plate and its slats *inside* the door group: the door still slides as
    // one object, the frame stays behind it, and nine meshes become three.
    bakeMeshes(door)
    g.add(door)
    const jamb = mat('jamb', { color: 0x222b33, roughness: 0.8, metalness: 0.4 })
    for (const s of [-1, 1]) {
        const j = new THREE.Mesh(box(0.22, h + 0.3, 0.3), jamb)
        j.position.set(s * (w / 2 + 0.1), h / 2, 0); j.castShadow = true
        g.add(j)
    }
    bakeMeshes(g)
    // bakeMeshes re-parents the jambs into the root; put the sliding door back on top.
    g.add(door)
    g.userData.door = door
    // Chain and padlock across the gateway: the verb "the cart is full" used to be
    // answered by the door quietly rising. Now the chain snaps and drops (see
    // `openGate` in engine.js) so the way out announces itself.
    const chain = makeChain(7, 0.155)
    chain.position.set(-w / 2 - 0.06, h * 0.62, 0.16)
    g.add(chain)
    const lock = makePadlock(1.15)
    lock.position.set(-w / 2 - 0.06, h * 0.62 - 7 * 0.155 - 0.1, 0.16)
    g.add(lock)
    g.userData.chain = chain
    g.userData.lock = lock
    return g
}

export function makeVaultDoor(r = 1.1) {
    const g = new THREE.Group()
    // A hinged assembly, not a spinning disc: the pivot sits at the hinge and the
    // plate hangs off it at +x, so rotating the pivot swings the open door the way a
    // 400 kg bank door does — from one edge, taking the frame with it.
    //
    // Two things about this assembly were wrong until the affordance check caught them,
    // and both are `bakeMeshes` traps that a night screenshot cannot see:
    //   * the plate used to be offset by `r` *before* baking. bakeMeshes bakes a child's
    //     world matrix into its geometry and the parent then re-applies it on draw, so
    //     the offset landed twice and the plate drew 0.86 m outside its cell;
    //   * the door was not marked `keep`, so the frame's bake absorbed the plate into the
    //     static batch and the group the engine rotates was empty. The door never swung.
    //     (`keep` also disables baking *of* the node it is on, which is why it goes on
    //     after `bakeMeshes(door)`, not before: without that order the plate is seven
    //     draw calls instead of three.)
    const door = new THREE.Group()
    g.add(door)
    g.userData.door = door
    const steel = mat('vault', { map: makeTex('metal'), color: 0x6d7a86, roughness: 0.35, metalness: 0.9, envMapIntensity: 1.5 })
    const disc = new THREE.Mesh(cyl(r, r, 0.26, 18), steel)
    disc.rotation.x = Math.PI / 2
    disc.castShadow = true
    door.add(disc)
    for (let i = 0; i < 4; i++) {
        const spoke = new THREE.Mesh(box(0.11, r * 1.7, 0.1), steel)
        spoke.rotation.z = (i * Math.PI) / 4
        spoke.position.z = 0.16
        door.add(spoke)
    }
    const dial = new THREE.Mesh(cyl(0.2, 0.2, 0.14, 12), mat('dial', { color: 0xd8b24a, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.6 }))
    dial.rotation.x = Math.PI / 2; dial.position.z = 0.22
    door.add(dial)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.86, 0.06, 6, 20), mat('vaultRing', { color: 0x39454f, roughness: 0.4, metalness: 0.9 }))
    ring.position.z = 0.1
    door.add(ring)
    const jamb = mat('vaultJamb', { color: 0x1b222a, roughness: 0.8, metalness: 0.4 })
    const lintel = new THREE.Mesh(box(r * 2.5, 0.28, 0.42), jamb)
    lintel.position.set(0, r * 1.15, 0)
    g.add(lintel)
    bakeMeshes(door)
    // Hang the plate on the hinge *after* baking, or the offset is applied twice. Then
    // mark it `keep` so the frame bake below leaves the hinged bits alone.
    door.position.x = r
    door.userData.keep = true
    bakeMeshes(g)
    g.add(door)
    g.userData.door = door
    return g
}

/**
 * A padlock — an affordance with a body.
 *
 * The pound used to ask for `CHEW ULTRA LOOSE` while drawing bars, a roof, a floor and a
 * sign, and no lock anywhere: the playtest report was literally "I don't see a lock", and
 * it was right. The rule that came out of it is in the README — **every verb the sim
 * offers has a mesh at the place the verb points at** — and `heistplay` now fails the
 * build when it does not. Brass, faintly emissive, because a night map eats dark metals.
 */
export function makePadlock(s = 1) {
    const g = new THREE.Group()
    const brass = mat('padlock', {
        color: 0xd8a53a, roughness: 0.3, metalness: 0.95, envMapIntensity: 1.7,
        emissive: 0x6d4a12, emissiveIntensity: 0.5,
    })
    const body = new THREE.Mesh(box(0.2 * s, 0.17 * s, 0.085 * s), brass)
    body.castShadow = true
    g.add(body)
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.07 * s, 0.022 * s, 5, 10, Math.PI), brass)
    shackle.position.y = 0.085 * s
    shackle.rotation.y = Math.PI / 2
    shackle.castShadow = true
    g.add(shackle)
    const key = new THREE.Mesh(cyl(0.03 * s, 0.03 * s, 0.1 * s, 6), mat('padlockKey', { color: 0x241c12, roughness: 0.9 }))
    key.rotation.x = Math.PI / 2
    g.add(key)
    // Brass becomes one draw call; the keyhole stays, because it is the bit that says
    // "lock" at ten paces. Baked *before* `keep` is set: `keep` is what tells a later
    // bakeMeshes() on the parent cage that this little assembly moves on its own.
    bakeMeshes(g)
    g.userData.keep = true
    return g
}

/** A chain to hold the getaway gate shut, so "the cart is full" has a visible answer. */
export function makeChain(links = 6, drop = 0.15) {
    const g = new THREE.Group()
    const iron = mat('chain', { color: 0x5c6772, roughness: 0.42, metalness: 0.92, envMapIntensity: 1.4 })
    for (let i = 0; i < links; i++) {
        const l = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 5, 8), iron)
        l.position.y = -i * drop
        l.rotation.y = i % 2 ? Math.PI / 2 : 0
        l.castShadow = true
        g.add(l)
    }
    bakeMeshes(g)
    g.userData.keep = true
    return g
}

/** The pound. Where a caught raccoon waits until someone with paws comes for them. */
export function makeCage() {
    const g = new THREE.Group()
    const bar = mat('bar', { color: 0x8a96a2, roughness: 0.4, metalness: 0.85, envMapIntensity: 1.2 })
    const floor = new THREE.Mesh(box(1.5, 0.1, 1.2), mat('cageFloor', { map: makeTex('metal'), color: 0x4b565f, roughness: 0.6, metalness: 0.6 }))
    floor.position.y = 0.05; floor.receiveShadow = true
    g.add(floor)
    for (let i = 0; i <= 6; i++) {
        const b = new THREE.Mesh(cyl(0.035, 0.035, 1.3, 5), bar)
        b.position.set(-0.7 + i * 0.233, 0.7, -0.6)
        b.castShadow = true
        g.add(b)
        const b2 = new THREE.Mesh(cyl(0.035, 0.035, 1.3, 5), bar)
        b2.position.set(-0.7 + i * 0.233, 0.7, 0.6)
        g.add(b2)
    }
    for (const s of [-1, 1]) {
        const v = new THREE.Mesh(cyl(0.035, 0.035, 1.3, 5), bar)
        v.position.set(s * 0.72, 0.7, 0)
        g.add(v)
    }
    for (const y of [1.35]) {
        const t = new THREE.Mesh(box(1.55, 0.09, 1.3), bar)
        t.position.y = y; t.castShadow = true
        g.add(t)
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.34), new THREE.MeshStandardMaterial({ map: makeTex('poundSign'), transparent: true, roughness: 1 }))
    sign.position.set(0, 1.05, -0.63)
    g.add(sign)
    // The lock hangs on the door face, low enough to read as "what you chew" and high
    // enough not to be mud. `world.js` turns the whole cage to face the approach, so
    // this is the side you walk up to.
    const lock = makePadlock(1)
    lock.position.set(0, 0.62, -0.68)
    g.add(lock)
    g.userData.padlock = lock
    g.userData.lockAt = lock.position.clone()
    // Twenty bars, one draw call. The sign stays separate: it is transparent, it needs
    // its own sorting, and it is the joke — jokes do not get merged into scenery. So
    // does the padlock, which has to be able to shake and then fall off.
    bakeMeshes(g)
    return g
}

/** Potted palm: the museum's version of a hedge. */
export function makePlanter() {
    const g = new THREE.Group()
    const pot = new THREE.Mesh(cyl(0.3, 0.22, 0.4, 8), mat('pot', { color: 0x7a5f45, roughness: 0.9 }))
    pot.position.y = 0.2; pot.castShadow = true
    g.add(pot)
    const leaf = mat('palm', { color: PAL.leafDark, roughness: 1, side: THREE.DoubleSide })
    for (let i = 0; i < 7; i++) {
        const l = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9, 4), leaf)
        const a = (i / 7) * Math.PI * 2
        l.position.set(Math.cos(a) * 0.16, 0.75, Math.sin(a) * 0.16)
        l.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7)
        l.castShadow = true
        g.add(l)
    }
    return g
}

/** A column: the museum's real cover, and it tiles the hall into rooms. */
export function makeColumn(h = 4.4) {
    const g = new THREE.Group()
    const shaft = new THREE.Mesh(cyl(0.3, 0.34, h, 10), mat('colShaft', { map: makeTex('marble'), roughness: 0.3, metalness: 0.05, envMapIntensity: 1.3 }))
    shaft.position.y = h / 2; shaft.castShadow = true; shaft.receiveShadow = true
    g.add(shaft)
    const cap = new THREE.Mesh(box(0.9, 0.22, 0.9), mat('colCap', { map: makeTex('marble'), roughness: 0.3, envMapIntensity: 1.2 }))
    cap.position.y = h + 0.1; cap.castShadow = true
    g.add(cap)
    const base = new THREE.Mesh(box(0.86, 0.18, 0.86), mat('colBase', { map: makeTex('marble'), roughness: 0.35 }))
    base.position.y = 0.09
    g.add(base)
    return g
}

// ------------------------------------------------------------- icons & rain -----
const iconCache = new Map()
/** Floating combat icons: '?', '!', a paw, a zzz. Sprite textures drawn in canvas. */
export function makeIconTex(kind) {
    if (iconCache.has(kind)) return iconCache.get(kind)
    const c = canvasOf(64, 64)
    const x = c.getContext('2d')
    x.textAlign = 'center'; x.textBaseline = 'middle'
    if (kind === '?') {
        x.font = 'bold 46px Georgia, serif'; x.lineWidth = 7; x.strokeStyle = '#3a2a10'
        x.fillStyle = '#ffcc4a'; x.fillText('?', 32, 36); x.strokeText('?', 32, 36)
        x.fillStyle = '#fff3c4'; x.fillText('?', 31, 34)
    } else if (kind === '!') {
        x.font = 'bold 48px Impact, Arial, sans-serif'; x.lineWidth = 7; x.strokeStyle = '#40100c'
        x.fillStyle = '#ff5a4a'; x.fillText('!', 32, 34); x.strokeText('!', 32, 34)
        x.fillStyle = '#ffd0c8'; x.fillText('!', 31, 32)
    } else if (kind === 'paw') {
        x.fillStyle = '#e9e3d3'
        x.beginPath(); x.ellipse(32, 40, 13, 11, 0, 0, 7); x.fill()
        for (const [dx, dy] of [[-13, -8], [-4, -14], [6, -13], [15, -5]]) { x.beginPath(); x.ellipse(32 + dx, 40 + dy, 5, 6, 0, 0, 7); x.fill() }
    } else if (kind === 'zzz') {
        x.font = 'bold 26px Georgia, serif'; x.fillStyle = '#bfe3ff'
        x.fillText('z', 22, 44); x.fillText('Z', 36, 28); x.fillText('Z', 48, 16)
    } else if (kind === 'ear') {
        x.font = 'bold 30px Helvetica, Arial, sans-serif'; x.fillStyle = '#9dffb0'
        x.fillText('))', 30, 34); x.fillStyle = '#3f7a4c'; x.fillText('(( ', 36, 34)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    iconCache.set(kind, t)
    return t
}

/**
 * Rain as LineSegments (see alley.js for why not Points), sized to a level footprint.
 * Returns the object plus its animate() so the caller owns the update order.
 */
export function makeRain(n, w, d, seed = 5) {
    const R = rng(seed)
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(n * 6)
    const vel = new Float32Array(n)
    for (let i = 0; i < n; i++) {
        const x = (R() - 0.5) * w, y = R() * 14, z = (R() - 0.5) * d
        const len = 0.3 + R() * 0.5
        pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z
        pos[i * 6 + 3] = x + len * 0.16; pos[i * 6 + 4] = y - len; pos[i * 6 + 5] = z
        vel[i] = 10 + R() * 9
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc6e6ff, transparent: true, opacity: 0.32, depthWrite: false, fog: false }))
    mesh.frustumCulled = false
    mesh.userData.setDensity = (count) => { geo.setDrawRange(0, Math.max(0, Math.min(n, count)) * 2) }
    return {
        mesh,
        animate(dt) {
            const arr = geo.attributes.position.array
            for (let i = 0; i < n; i++) {
                const k = i * 6
                let y = arr[k + 1] - vel[i] * dt
                let x = arr[k] + dt * 1.5
                let z = arr[k + 2]
                const len = arr[k + 1] - arr[k + 4]
                if (y < 0) { y = 13 + R() * 2; x = (R() - 0.5) * w; z = (R() - 0.5) * d }
                arr[k] = x; arr[k + 1] = y; arr[k + 2] = z
                arr[k + 3] = x + len * 0.16; arr[k + 4] = y - len; arr[k + 5] = z
            }
            geo.attributes.position.needsUpdate = true
        },
    }
}
