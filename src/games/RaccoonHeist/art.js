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
export function makeSky(seed = 3) {
    const g = new THREE.Group()
    const c = canvasOf(64, 128)
    paint(c, (x, y) => {
        const v = y / 127
        const n = fbm(x / 6, y / 14, seed, 3) * 10
        // v=0 is the top of the canvas = the zenith of the dome
        const base = mixC(0x070f1a, 0x24455f, Math.pow(1 - v, 1.6))
        return mixC(base, [46, 74, 96], n / 40)
    })
    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(80, 16, 12),
        new THREE.MeshBasicMaterial({ map: wrap(c), side: THREE.BackSide, fog: false, depthWrite: false })
    )
    g.add(dome)

    const R = rng(seed)
    const N = 260
    const pos = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
        const a = R() * Math.PI * 2
        const e = 0.12 + R() * 1.25
        const r = 74
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
        case 'brick': return mat('brick', { map: makeTex('brick'), roughness: 0.95, envMapIntensity: 0.5 })
        case 'stucco': return mat('stucco', { map: makeTex('stucco'), roughness: 0.95, envMapIntensity: 0.5 })
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

export function disposables(root) {
    const out = []
    root.traverse(o => { if (o.geometry) out.push(o.geometry) })
    return out
}
