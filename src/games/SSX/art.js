// SSX — art.js : every pixel synthesized — except the hero rider (#548): a
// real CC0 rigged character (KayKit Adventurers "Rogue_Hooded", see
// public/models/characters/LICENSE.txt) loaded with GLTFLoader and posed per-frame
// from the sim. The mountain is a vertex-coloured ribbon built straight from
// course.js geometry (so the painted slope IS the ridden slope), rails glow,
// the city hums, and riders are articulated rigs that crouch, grab, spin,
// flip and tumble.
//
// #638 mountain feel: smooth analytic snow shading (hollows darken blue, crests
// catch the sun, wind-grain without speckle), a summit horizon of distant
// peaks under a gradient sky, and slope props from the shared model shelf
// (#637) with primitive fallbacks so the game never waits on the network.

import * as THREE from 'three'
import { slopePos, terrainY, featureLift, sceneryPlan } from './course.js'

// wide grid: past the piste edge the slope keeps going — shoulders, ridges —
// so the camera never sees the mesh end. Rows start behind the summit so the
// start gate sits on painted snow too (the sim rides s<0; paint must match).
const COLS = [-26, -22, -19, -16, -13, -11, -9, -7, -5.5, -4.2, -3.2, -2.75, -2.2, -1.75, -1.0, -0.5, 0, 0.5, 1.0, 1.75, 2.2, 2.75, 3.2, 4.2, 5.5, 7, 9, 11, 13, 16, 19, 22, 26]
const ROW_BACK = -12
export const GRIDS = { COLS, ROW_BACK }

const hash = (n) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v) }
const smooth01 = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u) }
const clamp255 = (v) => Math.max(0, Math.min(255, v))

export const THEMES = {
    day: {
        sky: 0x8fc4f2, skyTop: 0x4a86c8, fog: 0xc9d9ec, fogD: 0.0009,
        sun: 0xfff3d0, hemiSky: 0xbfd8f2, hemiGround: 0xdfe8f2,
        snowA: [248, 250, 255], snowB: [186, 206, 236],
        shadow: [150, 168, 212], edge: [70, 190, 240], rock: [42, 35, 31], rock2: [20, 17, 16],
        capSnow: [252, 254, 255],
        peak: [148, 158, 186], peakSun: [225, 232, 245], peakRock: [104, 112, 138],
        shC: 0x0b1524, shO: 0.28,
    },
    night: {
        sky: 0x0a0c22, skyTop: 0x04051a, fog: 0x101436, fogD: 0.0016,
        sun: 0x8090ff, hemiSky: 0x2a3070, hemiGround: 0x141838,
        snowA: [96, 110, 190], snowB: [56, 64, 140],
        shadow: [22, 28, 72], edge: [255, 60, 200], rock: [10, 10, 26], rock2: [4, 4, 12],
        capSnow: [150, 160, 215],
        peak: [30, 34, 78], peakSun: [56, 62, 120], peakRock: [18, 20, 48],
        shC: 0x04050e, shO: 0.45,
    },
    dusk: {
        sky: 0xff9a5c, skyTop: 0x6a4a9c, fog: 0xf2a878, fogD: 0.0012,
        sun: 0xffd0a0, hemiSky: 0xffc8a0, hemiGround: 0xe0b0c0,
        snowA: [255, 224, 214], snowB: [206, 156, 186],
        shadow: [118, 88, 158], edge: [255, 90, 60], rock: [19, 10, 8], rock2: [7, 3, 4],
        capSnow: [255, 238, 228],
        peak: [186, 126, 138], peakSun: [255, 200, 170], peakRock: [122, 74, 92],
        shC: 0x241226, shO: 0.34,
    },
}

// #665: sun/moon sits in the chase-cam's upper third — anchored to the rider's
// heading (the sky group never rotates, and the centreline does). az = angle
// left of the view axis, el = elevation. day lifts the disc into the frame.
export const SUN = {
    day: { az: -0.52, el: 0.3 },
    night: { az: -0.52, el: 0.3 },
    dusk: { az: -0.6, el: 0.2 },
}

// #665: fresh carve grooves run deeper than the groomed track so the two
// lines read apart when both are new (ssxmountaincheck pins the gap).
export const GROOVE = { color: [0.05, 0.07, 0.13], alpha: 0.66 }
export const TRACK_DARKEN = 0.12

// ---- real surfaces (#669) ---------------------------------------------------
// Slope magnitude in world m/m from terrain differences — the analytic terms
// are not worth differentiating by hand. #669: measured on the NATURAL
// surface (terrainY − featureLift), same rule as the #638 laplacian — kicker
// and pipe flanks are built features and must not read as exposed rock.
// Lateral x-units are 9 m.
export function slopeAt(c, s, x) {
    const nat = (ss, xx) => terrainY(c, ss, xx) - featureLift(c, ss, xx)
    // ±3 m along s averages the short mogul wave (rock must not flicker on as
    // riders cross each bump); lateral stays fine — cliff faces are lateral
    const gy = (nat(s + 3, x) - nat(s - 3, x)) / 6
    const gx = (nat(s, x + 0.05) - nat(s, x - 0.05)) / 0.1 / 9
    return Math.hypot(gy, gx)
}

// Crag bands: strata stripes folded along the run. Where a face sits high
// above the piste these bands break the snow into alternating snow/rock layers
// — the crag-and-snow banding of a real alpine wall.
function cragBands(s, x) {
    const fold = 0.9 * Math.sin(s * 0.017 + x * 0.9 + 2.0) + 0.45 * Math.sin(s * 0.031 - x * 0.4)
    const b = fold + 0.55 * Math.sin(s * 0.23 + x * 1.3 + fold * 2)
    return smooth01((b - 0.1) * 2.2)
}

// Fracture: blocky cell hash so a rock face reads as broken plates, and
// bedding: dark planes every ~2 m of height, both only ever seen through
// the rock blend.
const fracture = (s, x) => hash(Math.floor(s / 10.3) * 31.7 + Math.floor(x * 1.7) * 7.9 + 3.1)
const bedding = (y, s, x) => {
    const fold = 0.8 * Math.sin(s * 0.017 + x * 1.3)
    return smooth01(Math.abs(Math.sin(y * 0.9 + fold)) * 2.6) * 0.8
        + 0.2 * Math.abs(Math.sin(y * 3.3 + fold * 2.3))
}

// Everything the surface look needs at one point: base colour plus the
// blend values the sparkle layer reads. snowColor() is the rgb face of it.
export function surfaceInfo(c, s, x) {
    const T = THEMES[c.theme]
    const a = Math.abs(x)
    const y = terrainY(c, s, x)
    // hollow / crest from the laplacian of the NATURAL surface only — kickers
    // and pipe lips are built features and must not read as snow hollows
    const nat = (ss, xx) => terrainY(c, ss, xx) - featureLift(c, ss, xx)
    const above = nat(s, x) - nat(s, 0)
    const lap = (nat(s - 3, x) + nat(s + 3, x) + nat(s, x - 0.4) + nat(s, x + 0.4)) / 4 - nat(s, x)
    const hollow = smooth01(lap * 2.4)
    const crest = smooth01(-lap * 2.4)
    // wind grain: crossed slow sines, never speckle
    const grain = 0.5 + 0.5 * Math.sin(s * 0.09 + x * 1.9) * Math.sin(s * 0.041 - x * 0.7 + 2.0)
    const t = Math.max(0, Math.min(1, 0.55 * grain + 0.45 * (a / 2.2)))
    let rgb = [
        T.snowA[0] + (T.snowB[0] - T.snowA[0]) * t,
        T.snowA[1] + (T.snowB[1] - T.snowA[1]) * t,
        T.snowA[2] + (T.snowB[2] - T.snowA[2]) * t,
    ]
    // hollows: darken and pull blue; crests: burn slightly white. #665: the
    // constant blue shadow was a floor under every pixel — an icy cyan wash on
    // open faces near the camera. The cast now rides the hollow term so flat,
    // open snow stays near-white and the blue lives where it belongs.
    const sh = 0.04 + 0.62 * hollow
    rgb = rgb.map((v, k) => v * (1 - sh) + T.shadow[k] * sh * (k === 2 ? 1 + 0.12 * hollow : 1))
    rgb = rgb.map((v) => v * (1 - 0.20 * hollow) * (1 + 0.10 * crest))
    // wind ripples (sastrugi): low-frequency cords across the face, small
    // amplitude so the #638 continuity gate stays green
    const rip = Math.sin(s * 0.52 + x * 0.8 + c.rollPhase) + 0.5 * Math.sin(s * 1.07 - x * 0.35 + 1.3)
    rgb = rgb.map((v) => v * (1 + 0.022 * rip))
    // small lumps: soft bump field, lit on one flank and shaded on the other
    const bx = Math.sin(x * 2.7 + s * 0.11) * Math.cos(s * 0.61 + x * 0.6 + c.rollPhase * 1.7)
    const bz = Math.cos(x * 2.7 + s * 0.11) * Math.sin(s * 0.61 + x * 0.6 + c.rollPhase * 1.7)
    const lump = bx * 0.55 + bz * 0.45
    rgb = rgb.map((v) => v * (1 + 0.03 * lump) + (lump < 0 ? T.shadow[0] * 0.012 * -lump : 0))

    // ---- snow vs rock ----
    const grad = slopeAt(c, s, x)
    const gx = (nat(s, x + 0.05) - nat(s, x - 0.05)) / 0.9
    // #665 two-tone walls: the disc sits on the +x-slope side of the view, so
    // faces whose height drops toward +x (the left wall) catch the light and
    // the far side of every cleft stays dark — the canyon reads as stone.
    const litFace = smooth01((-gx - 0.04) / 0.28)
    const slopeRock = smooth01((grad - 0.28) / 0.3)
    const cragRaw = smooth01((above - 2.4) / 5.5) * cragBands(s, x)
    const rawRock = Math.max(slopeRock, cragRaw)
    // snow settles on ledges: gentle ground inside the rock zone keeps snow
    let relax = 0.8 * smooth01((0.45 - grad) / 0.3)
    // high up (bench, ridge) the relief is rock even when locally gentle; snow
    // caps stay where the face is both low and flat
    relax *= 1 - 0.55 * smooth01((above - 2) / 6)
    // rock only exists beyond the piste proper
    let rockT = rawRock * (1 - relax) * smooth01((a - 1.5) / 0.45)
    // #665 snow caps band the jagged canyon rim: only the teeth that both
    // stand highest above the piste and bulge (convex laplacian) hold snow,
    // and only where the ground rounds off — a sheer cliff face stays bare
    // rock (#669 rule); the clefts between the crowns stay dark too.
    const capT = smooth01((above - 13) / 7) * (0.35 + 0.65 * crest)
        * (1 - smooth01((grad - 0.42) / 0.25))
    rockT *= 1 - 0.9 * capT
    if (a < 1.05) {
        // groomed trail down the natural line + piste edge stripe — a soft light
        // tint, so fresh carve grooves (#665) read as a darker, crisper line
        const tc = Math.sin(s * 0.011) * 0.35 + Math.sin(s * 0.004 + 1.3) * 0.25
        const track = smooth01(1 - Math.abs(x - tc) / 0.55)
        rgb = rgb.map((v, k) => v * (1 - track * TRACK_DARKEN) + T.snowB[k] * 0.8 * track * TRACK_DARKEN)
        if (a > 0.92 && a < 1.06) rgb = T.edge.map((v, k) => (v + rgb[k]) / 2)
        rockT = Math.min(rockT, smooth01((grad - 0.5) / 0.4))
    }
    if (rockT > 0) {
        const band = (0.66 + 0.42 * bedding(y, s, x) + 0.26 * (fracture(s, x) - 0.5))
            * (0.85 + 0.28 * cragBands(s, x))
        const rk = T.rock.map((v, k) => (v * (1 - slopeRock) + T.rock2[k] * slopeRock) * band * (0.72 + 0.56 * litFace))
        rgb = rgb.map((v, k) => v * (1 - rockT) + rk[k] * rockT)
    }
    if (capT > 0) rgb = rgb.map((v, k) => v * (1 - capT * 0.55) + T.capSnow[k] * capT * 0.55)
    // kicker lips catch the light
    const lift = featureLift(c, s, x)
    if (lift > 0.3) rgb = rgb.map((v) => Math.min(255, v * 1.18))
    return { rgb: rgb.map(clamp255), rockT, rawRock, relax, grad, crest, hollow, above, litFace }
}

// Smooth snow shading for one grid point (#638, textured by #669). The base
// stays analytic — hollows blue-dark, crests lit — and the #669 layer adds
// slope-based rock reveal, crag banding, wind cords and lumps on top.
export function snowColor(c, s, x) {
    return surfaceInfo(c, s, x).rgb
}

// ---- procedural surface detail (#669) -----------------------------------------
// A tiling albedo texture per theme (wind cords, crust cracks, grit) plus a
// sparkle-dot texture for the additive twinkle overlay. Both seamless: the
// motifs are drawn once and stamped 3×3 around the wrap edges. A tile spans
// SURF_TILE metres of slope.

export const SURF_TILE = 4
const HAS_DOM = typeof document !== 'undefined'
const lcg = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }

function seamless(w, h, draw) {
    const off = document.createElement('canvas')
    off.width = w; off.height = h
    const o = off.getContext('2d')
    draw(o)
    const cvs = document.createElement('canvas')
    cvs.width = w; cvs.height = h
    const ctx = cvs.getContext('2d')
    for (const dy of [-h, 0, h]) for (const dx of [-w, 0, w]) ctx.drawImage(off, dx, dy)
    return cvs
}

const detailCache = new Map()
export function detailTexture(theme) {
    if (!HAS_DOM) return null
    const key = `d|${theme}`
    if (!detailCache.has(key)) {
        const night = theme === 'night'
        const cvs = seamless(256, 256, (g) => {
            g.fillStyle = night ? '#c8cce8' : '#ebeff6'
            g.fillRect(0, 0, 256, 256)
            // wind cords: soft dark troughs with lit crests, integer sine
            // cycles across x so the tile wraps seamlessly east-west
            const rnd = lcg(7717)
            const n = 7
            for (let i = 0; i < n; i++) {
                const y = (i + 0.5) * (256 / n)
                const cy = 1 + Math.floor(rnd() * 3)
                const ph = rnd() * Math.PI * 2
                const amp = 2 + rnd() * 3
                for (const [style, lift] of [['rgba(120,132,168,0.16)', 0], ['rgba(255,255,255,0.35)', -2.5]]) {
                    g.strokeStyle = style
                    g.lineWidth = lift === 0 ? 2.5 : 1.2
                    g.beginPath()
                    for (let px = 0; px <= 256; px += 4) {
                        const yy = y + lift + amp * Math.sin((px / 256) * Math.PI * 2 * cy + ph)
                        if (px === 0) g.moveTo(px, yy); else g.lineTo(px, yy)
                    }
                    g.stroke()
                }
            }
            // crust: a few branching crack lines
            g.strokeStyle = night ? 'rgba(14,18,52,0.42)' : 'rgba(112,120,142,0.26)'
            g.lineWidth = 1
            for (let k = 0; k < 5; k++) {
                let px = rnd() * 256, py = rnd() * 256
                let dir = rnd() * Math.PI * 2
                g.beginPath(); g.moveTo(px, py)
                const steps = 3 + Math.floor(rnd() * 4)
                for (let i = 0; i < steps; i++) {
                    dir += (rnd() < 0.5 ? -1 : 1) * (0.9 + rnd() * 0.9)
                    px += Math.cos(dir) * (4 + rnd() * 6)
                    py += Math.sin(dir) * (4 + rnd() * 6)
                    g.lineTo(px, py)
                }
                g.stroke()
            }
            // grit + firn speckle
            for (let i = 0; i < 900; i++) {
                g.fillStyle = rnd() < 0.5 ? 'rgba(150,158,182,0.20)' : 'rgba(255,255,255,0.28)'
                g.fillRect(rnd() * 256, rnd() * 256, 1, 1)
            }
        })
        const tex = new THREE.CanvasTexture(cvs)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        detailCache.set(key, tex)
    }
    return detailCache.get(key)
}

const sparkleCache = new Map()
export function sparkleTexture(theme) {
    if (!HAS_DOM) return null
    const key = `s|${theme}`
    if (!sparkleCache.has(key)) {
        const night = theme === 'night'
        const cvs = seamless(128, 128, (g) => {
            g.clearRect(0, 0, 128, 128)
            const rnd = lcg(9901)
            const n = night ? 18 : 32
            for (let i = 0; i < n; i++) {
                const px = rnd() * 128, py = rnd() * 128
                const r = 0.5 + rnd() * 0.9
                const grad = g.createRadialGradient(px, py, 0.05, px, py, r * 1.7)
                grad.addColorStop(0, `rgba(255,255,255,${night ? 0.55 : 0.9})`)
                grad.addColorStop(0.45, 'rgba(255,255,255,0.35)')
                grad.addColorStop(1, 'rgba(255,255,255,0)')
                g.fillStyle = grad
                g.beginPath(); g.arc(px, py, r * 1.7, 0, Math.PI * 2); g.fill()
            }
        })
        const tex = new THREE.CanvasTexture(cvs)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        sparkleCache.set(key, tex)
    }
    return sparkleCache.get(key)
}

export function buildTerrain(course) {
    const rows = []
    for (let i = ROW_BACK; i < course.N; i += 1) rows.push(i * 4)
    const pos = new Float32Array(rows.length * COLS.length * 3)
    const col = new Float32Array(rows.length * COLS.length * 3)
    const uv = new Float32Array(rows.length * COLS.length * 2)
    const idx = []
    rows.forEach((s, ri) => {
        COLS.forEach((x, ci) => {
            const p = slopePos(course, s, x)
            const o = (ri * COLS.length + ci) * 3
            pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z
            const rgb = snowColor(course, s, x)
            col[o] = rgb[0] / 255; col[o + 1] = rgb[1] / 255; col[o + 2] = rgb[2] / 255
            const u = (ri * COLS.length + ci) * 2
            uv[u] = (x * 9) / SURF_TILE
            uv[u + 1] = s / SURF_TILE
        })
    })
    for (let ri = 0; ri < rows.length - 1; ri++) {
        for (let ci = 0; ci < COLS.length - 1; ci++) {
            const a = ri * COLS.length + ci
            const b = a + 1
            const c2 = a + COLS.length
            const d = c2 + 1
            idx.push(a, b, c2, b, d, c2)
        }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
        vertexColors: true, emissive: 0x1c222c, map: detailTexture(course.theme),
    }))
}

// Twinkle overlay: same grid, additive blend, per-vertex mask that only lets
// the sparkle dots through on flat, sunlit, snowy ground — never on rock or
// steep faces. Shares the terrain geometry (userData.keepGeo guards disposal).
export function sparkleMask(c, s, x) {
    const { rockT, grad, crest } = surfaceInfo(c, s, x)
    const flat = 1 - smooth01(grad / 0.3)
    const rockKill = 1 - smooth01((rockT - 0.08) / 0.3)
    const cell = hash(Math.floor(s / 1.7) * 17.3 + Math.floor(x * 2.3) * 5.7 + 9.2)
    const patch = smooth01((cell - 0.55) / 0.3)
    const theme = c.theme === 'night' ? 0.5 : c.theme === 'dusk' ? 0.8 : 1
    return (1 - rockT) * rockKill * flat * (0.35 + 0.65 * crest) * patch * theme
}

export function buildSparkles(course, geo) {
    const rows = []
    for (let i = ROW_BACK; i < course.N; i += 1) rows.push(i * 4)
    const col = new Float32Array(rows.length * COLS.length * 3)
    rows.forEach((s, ri) => {
        COLS.forEach((x, ci) => {
            const m = sparkleMask(course, s, x)
            const o = (ri * COLS.length + ci) * 3
            col[o] = m; col[o + 1] = m; col[o + 2] = Math.min(1, m * 1.15)
        })
    })
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', geo.getAttribute('position'))
    sg.setAttribute('uv', geo.getAttribute('uv'))
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3))
    sg.setIndex(geo.getIndex())
    const mesh = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({
        vertexColors: true, map: sparkleTexture(course.theme), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }))
    mesh.userData.keepGeo = 1
    mesh.frustumCulled = false
    return mesh
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
    // Primitive placeholders for the crash obstacles + day glade. Tagged `ph`
    // so attachShelf() swaps them for the real shelf models when the GLBs
    // arrive; if the network or shelf is missing, these carry the look.
    const ph = (m) => { m.userData.ph = 1; return m }
    for (const ob of course.obstacles) {
        const p = slopePos(course, ob.i * 4, ob.x)
        if (ob.kind === 'tree') {
            const trunk = ph(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6), trunkMat))
            trunk.position.set(p.x, p.y + 0.6, p.z)
            const canopy = ph(new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.4, 7), treeMat))
            canopy.position.set(p.x, p.y + 2.6, p.z)
            g.add(trunk, canopy)
        } else {
            const rock = ph(new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), rockMat))
            rock.position.set(p.x, p.y + 0.45, p.z)
            rock.rotation.y = hash(ob.i) * 3
            g.add(rock)
        }
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
            const canopy = ph(new THREE.Mesh(new THREE.ConeGeometry(1.4, 4.4, 7), treeMat))
            canopy.position.set(p.x, p.y + 3, p.z)
            g.add(canopy)
        }
    }
    return g
}

// Peaks-ring parameters, pure data so the harness can grade the silhouette
// without a DOM (#665): varied cone counts, squashed footprints, some peaks
// bare rock and some snow-capped, tips always below the cone height.
export function peaksRing() {
    const ring = []
    for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2 + hash(i * 1.7) * 0.35
        const dist = 420 + hash(i * 3.1) * 300
        const h = 150 + hash(i * 7.3) * 170
        const rad = 70 + hash(i * 11.7) * 90
        // tips 30..170 m above the sky origin (which tracks the camera), so
        // peaks always break the horizon around the rider
        const tip = 30 + hash(i * 13.3) * 140
        ring.push({
            ang, dist, h, rad, tip,
            segs: 3 + (i % 3) + (hash(i * 23.7) < 0.25 ? 3 : 0),
            sx: 0.78 + hash(i * 29.3) * 0.55,
            sz: 0.72 + hash(i * 31.1) * 0.5,
            cap: hash(i * 17.9) < 0.72,
            lit: hash(i * 37.7) < 0.4,
        })
    }
    return ring
}

// ---- summit horizon (#638) ---------------------------------------------------
// A gradient sky dome, a sun and a ring of distant peaks, all centred on the
// sky group's origin — index.jsx parks that origin on the camera every frame,
// so the range never runs out: the run always falls away into peaks.
export function buildSky(course) {
    const T = THEMES[course.theme]
    const g = new THREE.Group()

    const cvs = document.createElement('canvas')
    cvs.width = 2; cvs.height = 256
    const ctx = cvs.getContext('2d')
    const grad = ctx.createLinearGradient(0, 0, 0, 256)
    const hex = (v) => `#${v.toString(16).padStart(6, '0')}`
    grad.addColorStop(0, hex(T.skyTop)); grad.addColorStop(0.62, hex(T.sky)); grad.addColorStop(1, hex(T.fog))
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 2, 256)
    const skyTex = new THREE.CanvasTexture(cvs)
    skyTex.colorSpace = THREE.SRGBColorSpace
    const dome = new THREE.Mesh(new THREE.SphereGeometry(800, 20, 14), new THREE.MeshBasicMaterial({
        map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false,
    }))
    dome.position.y = -60
    g.add(dome)

    // low enough to sit inside the chase-cam frame, just above the ridge line;
    // index.jsx re-anchors it each frame relative to the rider's heading (#665)
    const sd = SUN[course.theme] || SUN.day
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(course.theme === 'dusk' ? 46 : 30, 20), new THREE.MeshBasicMaterial({ color: T.sun, fog: false }))
    sunDisc.position.set(Math.sin(sd.az) * Math.cos(sd.el) * 680, Math.sin(sd.el) * 680, Math.cos(sd.az) * Math.cos(sd.el) * 680)
    sunDisc.lookAt(0, sunDisc.position.y * 0.4, 0)
    g.add(sunDisc)
    g.userData.sun = sunDisc
    g.userData.theme = course.theme

    // peaks ring (#665): rocky bodies with snow caps on the taller, luckier
    // peaks — varied silhouettes so the horizon range reads as mountains, not
    // sugar loaves. Bodies pick hazed rock; a lit minority catches the sun.
    const capCol = course.theme === 'night' ? 0x9aa4d8 : course.theme === 'dusk' ? 0xffe8dc : 0xf4f8ff
    for (const pk of peaksRing()) {
        const peak = new THREE.Mesh(
            new THREE.ConeGeometry(pk.rad, pk.h, pk.segs),
            new THREE.MeshLambertMaterial({ color: pk.lit ? T.peakSun : pk.cap ? T.peak : T.peakRock }),
        )
        peak.position.set(Math.sin(pk.ang) * pk.dist, -pk.h + pk.tip + pk.h / 2, Math.cos(pk.ang) * pk.dist)
        peak.scale.set(pk.sx, 1, pk.sz)
        peak.rotation.y = hash(pk.ang * 5.3) * Math.PI
        if (pk.cap) {
            const cap = new THREE.Mesh(new THREE.ConeGeometry(pk.rad * 0.42, pk.h * 0.32, pk.segs), new THREE.MeshLambertMaterial({ color: capCol }))
            cap.position.y = pk.h * 0.34
            cap.rotation.y = peak.rotation.y
            peak.add(cap)
        }
        g.add(peak)
    }
    return g
}

// ---- shelf props (#638) ------------------------------------------------------
// Real CC0 models from the shared shelf (public/models/shelf.json), scattered
// by the sceneryPlan in course.js. Templates are cached per id+theme; clones
// share geometry (keepGeo marks them so teardown does not dispose shared
// buffers). The game never blocks on this — buildScenery paints primitives
// first, attachShelf upgrades when the GLBs land.
const shelfTemplates = new Map()

async function shelfTemplate(id, theme) {
    const key = `${id}|${theme}`
    if (!shelfTemplates.has(key)) {
        const { loadModel } = await import('../../utils/modelShelf.js')
        const src = await loadModel(id)
        const tint = theme === 'night' ? 0x5a66b0 : theme === 'dusk' ? 0xffcfa0 : null
        if (tint) {
            src.traverse((o) => {
                if (o.isMesh && o.material) {
                    o.material = o.material.clone()
                    o.material.color = o.material.color.clone().multiply(new THREE.Color(tint))
                }
            })
        }
        shelfTemplates.set(key, src)
    }
    return shelfTemplates.get(key)
}

export async function attachShelf(course, group, alive = () => true) {
    const plan = sceneryPlan(course)
    const ids = [...new Set(plan.map((p) => p.id))]
    const models = {}
    await Promise.all(ids.map(async (id) => {
        try { models[id] = await shelfTemplate(id, course.theme) } catch { models[id] = null }
    }))
    if (!alive()) return 0
    for (const ch of [...group.children]) {
        if (ch.userData.ph) { group.remove(ch); ch.traverse((o) => { if (o.geometry) o.geometry.dispose() }) }
    }
    let n = 0
    for (const e of plan) {
        const src = models[e.id]
        if (!src) continue
        const m = src.clone(true)
        m.userData.keepGeo = 1
        if (e.tint != null) {
            m.traverse((o) => {
                if (o.isMesh && o.material) {
                    o.material = o.material.clone()
                    o.material.color.multiplyScalar(e.tint)
                }
            })
        }
        const p = slopePos(course, e.s, e.x)
        m.position.set(p.x, p.y - 0.05, p.z)
        m.scale.setScalar(e.scale)
        m.rotation.y = e.orient === 'along' ? -p.th - Math.PI / 2 : e.orient === 'across' ? -p.th : e.rot
        group.add(m)
        n++
    }
    return n
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

// per-bone euler offsets (radians, bone-local axes), composed onto the base.
// Bone keys must match the RUNTIME names: GLTFLoader runs every node name
// through PropertyBinding.sanitizeNodeName, which strips the dots the KayKit
// pack ships ("foot.l" -> "footl"). Dotted keys here were silent no-ops (#615).
const STANCE = {
    hips: [0, 0.55, 0],
    spine: [0, 0.5, 0],
    chest: [0, 0.25, 0],
    head: [0.02, -1.3, 0],
    footl: [0, -0.55, 0],
    footr: [0, -0.55, 0],
}
const OFFS = {
    tuck: {
        hips: [0, 0, 0, -0.10], spine: [0.45, 0, 0], chest: [0.8, 0, 0], head: [-0.5, 0, 0],
        'upperlegl': [0.9, 0, 0.05], 'lowerlegl': [-1.65, 0, 0], footl: [0.7, 0, 0],
        'upperlegr': [0.8, 0, -0.05], 'lowerlegr': [-1.55, 0, 0], footr: [0.7, 0, 0],
        'upperarml': [1.1, 0, 0.4], 'lowerarml': [1.5, 0, 0],
        'upperarmr': [1.1, 0, -0.4], 'lowerarmr': [1.5, 0, 0],
    },
    crouch: {
        hips: [0, 0, 0, -0.16], spine: [0.2, 0, 0], chest: [0.28, 0, 0], head: [-0.12, 0, 0],
        'upperlegl': [0.75, 0, 0.04], 'lowerlegl': [-1.5, 0, 0], footl: [0.6, 0, 0],
        'upperlegr': [0.68, 0, -0.04], 'lowerlegr': [-1.42, 0, 0], footr: [0.6, 0, 0],
        'upperarml': [0.5, 0, 0.25], 'lowerarml': [0.8, 0, 0],
        'upperarmr': [0.5, 0, -0.25], 'lowerarmr': [0.8, 0, 0],
    },
    // #615: boardslide grab — the torso leans to the nose so the reaching
    // hand lands on the nose-edge band (probe: grabReach l.d ~0.18), the
    // balance arm lifts outboard, and the legs stay planted (the air base's
    // tuck is un-tucked, foot toes pitched, so the boots weld to the deck).
    grab: {
        hips: [0.75, 0.18, 0], spine: [1.0, 0.15, 0], chest: [1.15, 0.1, 0], head: [1.25, -0.25, 0],
        'upperarml': [2.45, 0, 0.45], 'lowerarml': [-0.15, 0, 0],
        'upperarmr': [2.0, 0, -0.7], 'lowerarmr': [0.8, 0, 0],
        'upperlegl': [0.5, 0, 0.05], 'lowerlegl': [-1.3, 0, 0], footl: [1.0, 0, 0],
        'upperlegr': [0.6, 0, -0.05], 'lowerlegr': [-1.2, 0, 0], footr: [0.7, 0, 0],
    },
    tumble: {
        hips: [0, 0.3, 0], spine: [-0.35, -0.2, 0], chest: [-0.2, -0.1, 0], head: [0.5, 0.35, 0],
        'upperarml': [-0.5, 0, 1.2], 'lowerarml': [0.3, 0, 0],
        'upperarmr': [-2.9, 0, -0.4], 'lowerarmr': [0.5, 0, 0],
        'upperlegl': [0.8, 0, 0.35], 'lowerlegl': [-0.9, 0, 0], footl: [0.3, 0, 0],
        'upperlegr': [-0.4, 0, -0.35], 'lowerlegr': [0.6, 0, 0],
    },
    air: {
        'upperlegl': [0.12, 0, 0.06], 'lowerlegl': [-0.35, 0, 0],
        'upperlegr': [0.1, 0, -0.06], 'lowerlegr': [-0.3, 0, 0],
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

function applyOffsets(base, name) {
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
    return t
}

function composeTargets(clips) {
    const bases = {
        stand: sampleClip(clips.Idle, 0),
        crouch: sampleClip(clips.Jump_Start, 0.34),
        air: sampleClip(clips.Jump_Idle, 0.3),
    }
    const targets = {}
    for (const name of HERO_POSES) targets[name] = applyOffsets(bases[POSE_BASE[name]], name)
    return targets
}

// The stand pose is the model's own Idle clip sampled around its loop (#615):
// pre-baked frames (stance offsets applied, same recipe as composeTargets) so
// the render loop only does a lookup — the rider breathes and shifts weight
// instead of sitting mannequin-still at the gate.
export function buildIdleRing(clips, n = 48) {
    const clip = clips.Idle
    if (!clip) return null
    const frames = []
    for (let i = 0; i < n; i++) frames.push(applyOffsets(sampleClip(clip, (i / n) * clip.duration), 'stand'))
    return { frames, n, duration: clip.duration }
}

// DEV: live-recompose one pose with a replacement offset table (probe loop)
export function retunePose(name, offs, hero) {
    OFFS[name] = offs
    hero.targets = composeTargets(hero.clips)
    if (hero.pose === name) hero.cur = {}
}

export function makeHeroRider(color, modelFile = 'rogue', id = 0) {
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
        const board = makeBoard(color, id, id)
        roll.clear()
        roll.add(model, board)
        const bootGeo = new THREE.BoxGeometry(0.3, 0.22, 0.46)
        const bootMat = new THREE.MeshLambertMaterial({ color: 0x232830 })
        for (const side of ['l', 'r']) {
            const boot = new THREE.Mesh(bootGeo, bootMat)
            boot.position.set(0.02, -0.16, 0.06)
            boot.rotation.z = -0.12
            if (bones[`foot${side}`]) bones[`foot${side}`].add(boot)
        }
        root.userData.hero = {
            model, bones, board, clips,
            targets: composeTargets(clips),
            idleRing: buildIdleRing(clips),
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

export function makeBoard(color, style = 0, id = 0) {
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
    // darker top base: the bright rider hues blow out on night/dusk snow (#615)
    const cA = new THREE.Color(color).multiplyScalar(0.72)
    const cB = new THREE.Color(0x10141c)
    const cTip = new THREE.Color(0xdfe6f0)
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
    mesh.userData.num = id + 1
    mesh.userData.logo = id % 6
    // livery decal: bib number + logo shape, unlit so it reads at night/dusk (#615)
    const tex = liveryTexture(id + 1, id % 6)
    const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(0.46, 0.15),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    )
    decal.rotation.x = -Math.PI / 2
    decal.position.set(0.18, 0.072, 0)
    mesh.add(decal)
    return mesh
}

const liveryCanvases = new Map()

function liveryTexture(num, logo) {
    const key = `${num}|${logo}`
    if (!liveryCanvases.has(key)) {
        const c = document.createElement('canvas')
        c.width = 192; c.height = 64
        const x = c.getContext('2d')
        x.clearRect(0, 0, 192, 64)
        x.fillStyle = 'rgba(255,255,255,0.92)'
        x.font = '900 44px monospace'
        x.textAlign = 'center'
        x.textBaseline = 'middle'
        x.fillText(String(num), 72, 34)
        // per-rider logo mark (right of the bib)
        x.strokeStyle = 'rgba(255,255,255,0.92)'
        x.fillStyle = 'rgba(255,255,255,0.92)'
        x.lineWidth = 5
        x.lineJoin = 'round'
        const lx = 148, ly = 32
        x.beginPath()
        if (logo === 0) { // chevron
            x.moveTo(lx - 16, ly + 10); x.lineTo(lx, ly - 12); x.lineTo(lx + 16, ly + 10)
            x.stroke()
        } else if (logo === 1) { // star
            for (let i = 0; i < 5; i++) {
                const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
                const b = a + Math.PI / 5
                const px = lx + Math.cos(a) * 16, py = ly + Math.sin(a) * 16
                i === 0 ? x.moveTo(px, py) : x.lineTo(px, py)
                x.lineTo(lx + Math.cos(b) * 7, ly + Math.sin(b) * 7)
            }
            x.closePath(); x.fill()
        } else if (logo === 2) { // bolt
            x.moveTo(lx + 4, ly - 16); x.lineTo(lx - 10, ly + 4); x.lineTo(lx - 1, ly + 4)
            x.lineTo(lx - 4, ly + 16); x.lineTo(lx + 10, ly - 4); x.lineTo(lx + 1, ly - 4)
            x.closePath(); x.fill()
        } else if (logo === 3) { // target
            x.arc(lx, ly, 14, 0, Math.PI * 2); x.stroke()
            x.arc(lx, ly, 5, 0, Math.PI * 2); x.fill()
        } else if (logo === 4) { // triangle
            x.moveTo(lx, ly - 15); x.lineTo(lx + 14, ly + 11); x.lineTo(lx - 14, ly + 11)
            x.closePath(); x.stroke()
        } else { // split bars
            x.fillRect(lx - 14, ly - 12, 9, 24)
            x.fillRect(lx + 5, ly - 12, 9, 24)
        }
        const t = new THREE.CanvasTexture(c)
        t.colorSpace = THREE.SRGBColorSpace
        liveryCanvases.set(key, t)
    }
    return liveryCanvases.get(key)
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

function blendHero(hero, pose, tick) {
    if (hero.pose !== pose) { hero.pose = pose; hero.cur = {} }
    let t = hero.targets[pose]
    if (pose === 'stand' && hero.idleRing) {
        const ring = hero.idleRing
        t = ring.frames[Math.floor(((tick / 60) % ring.duration) / ring.duration * ring.n) % ring.n]
    }
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
        if (hero) blendHero(hero, pose, tick)
        else { legs.scale.y = 1; armR.rotation.z = 2 }
        return
    }
    if (r.air) {
        roll.rotation.x = (r.flip * Math.PI) / 180 * (r.flip < 0 ? -1 : 1) * -1
        roll.rotation.z = 0
        if (hero) blendHero(hero, pose, tick)
        else { armR.rotation.z = r.grab ? 1.1 : 0.35; legs.scale.y = 0.9 }
        return
    }
    const c = r.crouch ? 0.78 : r.tuck ? 0.66 : 1
    roll.rotation.x = 0
    roll.rotation.z = r.steerSm * 0.28
    if (hero) blendHero(hero, pose, tick)
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
