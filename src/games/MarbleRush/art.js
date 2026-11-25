// MARBLE RUSH — art.js: the sky shelf. MODERN bar: courses of satin plates
// with neon rails hanging in a graded sky, and a chrome marble that reflects
// all of it. Every floor tile is extruded from course.pointOf — the SAME
// function the sim rides — so the drawn surface is the ridden surface.
// Everything procedural: no assets.

import * as THREE from 'three'
import { DS, MARBLE_R, cloudDrift } from './course.js'

const SKIES = {
    dawn: { top: 0x14204a, mid: 0x7a4a7e, low: 0xffa458, sun: 0xffd9a0, fog: 0xc98a6a },
    day: { top: 0x1f5fbf, mid: 0x7db9e8, low: 0xdff2ff, sun: 0xfff6d8, fog: 0xbfdcf2 },
    dusk: { top: 0x171040, mid: 0x5b2e77, low: 0xe06a9a, sun: 0xffc2e0, fog: 0x9a6a9a },
    storm: { top: 0x0c1220, mid: 0x2c3a52, low: 0x54617a, sun: 0x9fb0c8, fog: 0x46546c },
}

const hsl = (h, s, l) => new THREE.Color().setHSL(h / 360, s, l)

// ---------- sky dome ----------
export function makeSky(pal) {
    const geo = new THREE.SphereGeometry(900, 24, 16)
    const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
            uTop: { value: new THREE.Color(pal.top) },
            uMid: { value: new THREE.Color(pal.mid) },
            uLow: { value: new THREE.Color(pal.low) },
            uSunDir: { value: new THREE.Vector3(0.4, 0.22, 1).normalize() },
            uSunCol: { value: new THREE.Color(pal.sun) },
        },
        vertexShader: `
            varying vec3 vP;
            void main() {
                vP = normalize(position);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `
            uniform vec3 uTop, uMid, uLow, uSunCol;
            uniform vec3 uSunDir;
            varying vec3 vP;
            void main() {
                float h = vP.y * 0.5 + 0.5;
                vec3 col = mix(uLow, uMid, smoothstep(0.42, 0.62, h));
                col = mix(col, uTop, smoothstep(0.58, 0.92, h));
                float d = max(dot(vP, normalize(uSunDir)), 0.0);
                col += uSunCol * pow(d, 220.0) * 1.6;               // disc
                col += uSunCol * pow(d, 14.0) * 0.22;                // bloom
                gl_FragColor = vec4(col, 1.0);
            }`,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    return { mesh, mat }
}

// ---------- env cube for the chrome marble (real reflections, cheap once) ----
export function makeEnv(renderer, pal) {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 128
    const g = c.getContext('2d')
    const grd = g.createLinearGradient(0, 0, 0, 128)
    const hex = (n) => `#${n.toString(16).padStart(6, '0')}`
    grd.addColorStop(0, hex(pal.top))
    grd.addColorStop(0.5, hex(pal.mid))
    grd.addColorStop(0.78, hex(pal.low))
    grd.addColorStop(1, hex(pal.fog))
    g.fillStyle = grd
    g.fillRect(0, 0, 256, 128)
    // sun glint + cloud bands
    const sg = g.createRadialGradient(170, 34, 2, 170, 34, 26)
    sg.addColorStop(0, 'rgba(255,255,240,1)')
    sg.addColorStop(1, 'rgba(255,255,240,0)')
    g.fillStyle = sg
    g.fillRect(120, 0, 100, 80)
    g.fillStyle = 'rgba(255,255,255,0.16)'
    for (let i = 0; i < 7; i++) g.fillRect((i * 41) % 256, 52 + (i % 3) * 9, 60 + (i % 4) * 22, 5)
    const tex = new THREE.CanvasTexture(c)
    tex.mapping = THREE.EquirectangularReflectionMapping
    tex.colorSpace = THREE.SRGBColorSpace
    const pmrem = new THREE.PMREMGenerator(renderer)
    const env = pmrem.fromEquirectangular(tex).texture
    pmrem.dispose()
    tex.dispose()
    return env
}

// ---------- clouds ----------
export function makeClouds(seed, n) {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 128
    const g = c.getContext('2d')
    const grd = g.createRadialGradient(64, 64, 6, 64, 64, 62)
    grd.addColorStop(0, 'rgba(255,255,255,0.85)')
    grd.addColorStop(0.55, 'rgba(255,255,255,0.35)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 128, 128)
    const tex = new THREE.CanvasTexture(c)
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 })
    const group = new THREE.Group()
    const puffs = cloudDrift(seed, n).map((p) => {
        const s = new THREE.Sprite(mat)
        s.position.set(p.x, p.y, p.z)
        s.scale.set(p.sc * 1.9, p.sc * 0.72, 1)
        group.add(s)
        return { sprite: s, v: p.v, x0: p.x }
    })
    return { group, puffs, mat, tex }
}

// ---------- stage floor ----------
// Build solid ribbon runs between gaps. Vertex colors: plate shading along s
// (segment stripes + seam darkening), edge falloff, start/goal checkers.
export function buildStage(course) {
    const hue = course.hue / 360
    const group = new THREE.Group()
    const step = 1.5
    const runs = []
    let runStart = null
    for (let s = 0; s <= course.len + 1e-6; s += step) {
        const solid = !course.gapAt(Math.min(s, course.len - 0.01))
        if (solid && runStart === null) runStart = s
        if (!solid && runStart !== null) { runs.push([runStart, s]); runStart = null }
    }
    if (runStart !== null) runs.push([runStart, course.len])

    const pos = []
    const col = []
    const idx = []
    let vi = 0
    const put = (p, c) => { pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b) }

    for (const [a, b] of runs) {
        const cols = 5
        const rows = Math.max(2, Math.ceil((b - a) / step) + 1)
        for (let ri = 0; ri < rows; ri++) {
            const s = Math.min(b, a + (ri / (rows - 1)) * (b - a))
            const w = Math.max(0.25, course.halfWidthOf(s))
            const goal = s > course.len - 2.5 && s <= course.len
            const start = a === 0 && s < 3.2
            for (let ci = 0; ci < cols; ci++) {
                const u = -w + (2 * w * ci) / (cols - 1)
                put(course.pointOf(s, u), plateColor(course, hue, s, ci, cols, start, goal))
            }
        }
        for (let ri = 0; ri < rows - 1; ri++) {
            for (let ci = 0; ci < cols - 1; ci++) {
                const p = vi + ri * cols + ci
                idx.push(p, p + 1, p + cols, p + 1, p + cols + 1, p + cols)
            }
        }
        vi += rows * cols
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true, metalness: 0.25, roughness: 0.5,
        envMapIntensity: 0.6,
        side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    group.add(mesh)

    // neon rails along every run edge
    const railCol = hsl(course.hue, 0.95, 0.62)
    const railMat = new THREE.MeshStandardMaterial({ color: railCol, emissive: railCol, emissiveIntensity: 1.6, roughness: 0.35 })
    for (const [a, b] of runs) {
        for (const side of [-1, 1]) {
            const pts = []
            for (let s = a; s <= b + 1e-6; s += 2) {
                const w = Math.max(0.25, course.halfWidthOf(Math.min(s, course.len - 0.01)))
                const p = course.pointOf(Math.min(s, course.len - 0.01), side * w)
                pts.push(new THREE.Vector3(p.x, p.y + 0.09, p.z))
            }
            if (pts.length < 2) continue
            const curve = new THREE.CatmullRomCurve3(pts)
            const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(160, pts.length * 2), 0.075, 6, false), railMat)
            group.add(tube)
        }
    }

    // underside glow rim: cheap slab 0.35 below for depth
    const underMat = new THREE.MeshStandardMaterial({ color: hsl(course.hue, 0.55, 0.16), roughness: 0.9, side: THREE.DoubleSide })
    const upos = []
    const uidx = []
    let uvi = 0
    for (const [a, b] of runs) {
        const rows = Math.max(2, Math.ceil((b - a) / 6) + 1)
        for (let ri = 0; ri < rows; ri++) {
            const s = Math.min(course.len - 0.01, a + (ri / (rows - 1)) * (b - a))
            const w = Math.max(0.25, course.halfWidthOf(s)) + 0.18
            for (const u of [-w, w]) {
                const p = course.pointOf(s, u, -0.35)
                upos.push(p.x, p.y, p.z)
            }
        }
        for (let ri = 0; ri < rows - 1; ri++) {
            const p = uvi + ri * 2
            uidx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3)
        }
        uvi += rows * 2
    }
    const ugeo = new THREE.BufferGeometry()
    ugeo.setAttribute('position', new THREE.Float32BufferAttribute(upos, 3))
    ugeo.setIndex(uidx)
    ugeo.computeVertexNormals()
    group.add(new THREE.Mesh(ugeo, underMat))

    return { group, mat, mesh, railMat, underMat, geo: ugeo, runs }
}

function plateColor(course, hue, s, ci, cols, isStart, isGoal) {
    if (isGoal) {
        return Math.floor(s / 1.25 + ci) % 2 === 0 ? new THREE.Color(0xf4f4f4) : new THREE.Color(0x141414)
    }
    if (isStart) {
        return Math.floor(s / 1.25 + ci) % 2 === 0 ? new THREE.Color(0xf0e6c8) : new THREE.Color(0x1c1c22)
    }
    const seg = course.segs.find((g0) => s >= g0.s0 && s < g0.s1) || course.segs[course.segs.length - 1]
    const stripe = (course.segs.indexOf(seg) % 2) * 0.05
    const edge = Math.abs(ci - (cols - 1) / 2) / ((cols - 1) / 2)
    const seam = 1 - 0.18 * (1 - Math.min(1, (s % 9) / 0.5))
    const l = (0.42 + stripe - edge * 0.10) * seam
    return hsl(hue + (seg.k > 0.001 ? 8 : seg.k < -0.001 ? -8 : 0), 0.5, Math.max(0.14, l))
}

// ---------- props ----------
export function makeBumper(color) {
    const group = new THREE.Group()
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.62, 1.0, 16),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.3 }),
    )
    body.position.y = 0.5
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.08, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 1.4, roughness: 0.3 }),
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.22
    group.add(body, ring)
    group.userData.ring = ring
    group.userData.body = body
    return group
}

export function makeDeck(course, mi) {
    const m = course.movers[mi]
    const len = m.to - m.from
    const mid = course.pointOf((m.from + m.to) / 2, 0)
    const cols = 3
    const rows = Math.max(2, Math.ceil(len / 2) + 1)
    const pos = []
    const idx = []
    for (let ri = 0; ri < rows; ri++) {
        const s = m.from + (ri / (rows - 1)) * len
        for (let ci = 0; ci < cols; ci++) {
            const u = -m.w + (2 * m.w * ci) / (cols - 1)
            // local to the anchor so the deck can slide across its gap
            const p = course.pointOf(s, u)
            pos.push(p.x - mid.x, p.y - mid.y, p.z - mid.z)
        }
    }
    for (let ri = 0; ri < rows - 1; ri++) {
        for (let ci = 0; ci < cols - 1; ci++) {
            const p = ri * cols + ci
            idx.push(p, p + 1, p + cols, p + 1, p + cols + 1, p + cols)
        }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    const glow = hsl(course.hue, 0.95, 0.6)
    const mat = new THREE.MeshStandardMaterial({ color: hsl(course.hue, 0.6, 0.5), metalness: 0.3, roughness: 0.45, envMapIntensity: 0.7, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(geo, mat)
    const group = new THREE.Group()
    group.add(mesh)
    for (const side of [-1, 1]) {
        const pts = []
        for (let s = m.from; s <= m.to + 1e-6; s += 2) {
            const p = course.pointOf(s, side * m.w)
            pts.push(new THREE.Vector3(p.x - mid.x, p.y - mid.y, p.z - mid.z))
        }
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.min(80, pts.length * 2), 0.07, 6, false),
            new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 1.8, roughness: 0.3 }))
        group.add(tube)
    }
    group.position.set(mid.x, mid.y, mid.z)
    group.userData.anchor = mid
    group.userData.course = course
    group.userData.sMid = (m.from + m.to) / 2
    return { group, mat }
}

export function makeMarble(env) {
    // glass-marble swirl so the rolling reads on a near-mirror sphere
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 64
    const g = c.getContext('2d')
    g.fillStyle = '#c8dcec'
    g.fillRect(0, 0, 128, 64)
    g.lineWidth = 7
    g.strokeStyle = 'rgba(60,110,160,0.55)'
    for (let i = 0; i < 5; i++) {
        g.beginPath()
        g.moveTo(i * 30 - 10, 64)
        g.bezierCurveTo(i * 30 + 8, 40, i * 30 - 12, 24, i * 30 + 10, 0)
        g.stroke()
    }
    g.strokeStyle = 'rgba(255,150,90,0.4)'
    g.beginPath()
    g.moveTo(10, 64)
    g.bezierCurveTo(50, 30, 40, 34, 84, 2)
    g.stroke()
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(MARBLE_R, 28, 20),
        new THREE.MeshStandardMaterial({ map: tex, color: 0xdfeef8, metalness: 0.9, roughness: 0.1, envMap: env, envMapIntensity: 1.3 }),
    )
    // contact shadow blob
    const sc2 = document.createElement('canvas')
    sc2.width = 64
    sc2.height = 64
    const g2 = sc2.getContext('2d')
    const grd2 = g2.createRadialGradient(32, 32, 4, 32, 32, 30)
    grd2.addColorStop(0, 'rgba(0,0,0,0.5)')
    grd2.addColorStop(1, 'rgba(0,0,0,0)')
    g2.fillStyle = grd2
    g2.fillRect(0, 0, 64, 64)
    const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 1.3),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc2), transparent: true, depthWrite: false }),
    )
    shadow.rotation.x = -Math.PI / 2
    return { mesh, shadow }
}

// Sweeper bar — the stage 2 hazard verb. A spinning saw-drum sweeping across its
// station on the moverDeck sine; index.jsx slides it by the SAME sweeperBar()
// the sim knocks you with (drawn ≡ ridden). Glowing ridge bands spin with the
// drum so speed reads as machinery, not a floating brick; cap-glows mark the
// reach; a deck-shadow quad telegraphs where the drum sits ahead so the
// approach reads before the marble arrives.
export function makeBar(course, si) {
    const sw = course.sweepers[si]
    const glow = hsl((course.hue + 320) % 360, 0.95, 0.62)
    const steel = hsl((course.hue + 320) % 360, 0.45, 0.20)
    const group = new THREE.Group()

    // deck-shadow quad under the drum — the telegraph that reads at distance
    const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(2 * sw.w + 1.15, 1.75),
        new THREE.MeshBasicMaterial({ color: 0x06080d, transparent: true, opacity: 0.42, depthWrite: false }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.045
    group.add(shadow)

    // the spinning drum: long cylinder whose axis lies across the deck
    const spin = new THREE.Group()
    const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 2 * sw.w + 0.4, 24),
        new THREE.MeshStandardMaterial({ color: steel, metalness: 0.72, roughness: 0.28, emissive: glow, emissiveIntensity: 0.22 }),
    )
    drum.rotation.z = Math.PI / 2   // axis along local X (across the deck)
    drum.position.y = 0.58
    spin.add(drum)
    // three glowing ridge bands, equatorial — the static machinery read
    for (let i = -1; i <= 1; i++) {
        const band = new THREE.Mesh(
            new THREE.TorusGeometry(0.52, 0.075, 8, 24),
            new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 1.7, roughness: 0.35 }),
        )
        band.rotation.y = Math.PI / 2   // torus axis along local X
        band.position.set(i * (sw.w * 0.55), 0.58, 0)
        spin.add(band)
    }
    // off-axis stripes on the drum skin — they carry the spin (a plain
    // cylinder would read as a frozen brick)
    const stripeGeo = new THREE.BoxGeometry(2 * sw.w + 0.2, 0.07, 0.2)
    const stripeMat = new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 1.5, roughness: 0.3 })
    const stripeTop = new THREE.Mesh(stripeGeo, stripeMat)
    stripeTop.position.set(0, 1.06, 0)
    const stripeBottom = new THREE.Mesh(stripeGeo, stripeMat)
    stripeBottom.position.set(0, 0.10, 0)
    spin.add(stripeTop, stripeBottom)
    // reach caps
    const capGeo = new THREE.SphereGeometry(0.24, 10, 8)
    const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: glow, emissiveIntensity: 1.8, roughness: 0.3 })
    const cl = new THREE.Mesh(capGeo, capMat)
    cl.position.set(-(sw.w + 0.15), 0.58, 0)
    const cr = new THREE.Mesh(capGeo, capMat)
    cr.position.set(sw.w + 0.15, 0.58, 0)
    spin.add(cl, cr)
    group.add(spin)

    // a thin static pylon holding the drum up — the machinery read
    const pylon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.105, 0.55, 8),
        new THREE.MeshStandardMaterial({ color: 0x30414f, metalness: 0.6, roughness: 0.5 }),
    )
    pylon.position.y = 0.27
    group.add(pylon)

    group.userData.sw = sw
    group.userData.spin = spin
    group.userData.shadow = shadow
    return group
}

// Checkpoint gate — arms green as you cross it, and stays lit for the rest
// of the run: the shelf remembers where you got to.
export function makeGate(course) {
    const W = course.halfWidthOf(course.cp)
    const col = new THREE.Color(0x9fb8cc)
    const group = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.35 })
    const postGeo = new THREE.CylinderGeometry(0.14, 0.14, 3.4, 10)
    const l = new THREE.Mesh(postGeo, mat)
    l.position.set(-(W + 0.5), 1.7, 0)
    const r = new THREE.Mesh(postGeo, mat)
    r.position.set(W + 0.5, 1.7, 0)
    const bannerMat = new THREE.MeshStandardMaterial({ color: 0x6f8aa0, emissive: 0x6f8aa0, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.4 })
    const banner = new THREE.Mesh(new THREE.BoxGeometry(2 * (W + 0.5), 0.7, 0.12), bannerMat)
    banner.position.y = 3.4
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2 * W, 0.04, 0.3), bannerMat)
    strip.position.y = 0.02
    group.add(l, r, banner, strip)
    group.userData.bannerMat = bannerMat
    return group
}

export function makeGoal() {
    const group = new THREE.Group()
    const col = new THREE.Color(0xffe066)
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.5 })
    const post = new THREE.CylinderGeometry(0.16, 0.16, 4.4, 10)
    const l = new THREE.Mesh(post, mat)
    const r = new THREE.Mesh(post, mat)
    const banner = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.9, 0.14), mat)
    group.add(l, r, banner)
    group.userData = { l, r, banner }
    return group
}

// ---------- sparks (juice pool, Math.random allowed: never enters sim) ------
export function makeSparks(n) {
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(n * 3)
    const life = new Float32Array(n)
    const vel = new Float32Array(n * 3)
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({ color: 0xffe9a8, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false })
    const pts = new THREE.Points(geo, mat)
    return { pts, pos, life, vel, n, head: 0, geo, mat }
}

export function sparkSpawn(pool, x, y, z, count, spread, up) {
    for (let i = 0; i < count; i++) {
        const k = pool.head
        pool.head = (pool.head + 1) % pool.n
        pool.pos[k * 3] = x
        pool.pos[k * 3 + 1] = y
        pool.pos[k * 3 + 2] = z
        pool.vel[k * 3] = (Math.random() - 0.5) * spread
        pool.vel[k * 3 + 1] = Math.random() * up
        pool.vel[k * 3 + 2] = (Math.random() - 0.5) * spread
        pool.life[k] = 0.5 + Math.random() * 0.4
    }
}

export function sparkStep(pool, dt) {
    for (let i = 0; i < pool.n; i++) {
        if (pool.life[i] <= 0) continue
        pool.life[i] -= dt
        pool.pos[i * 3] += pool.vel[i * 3] * dt
        pool.pos[i * 3 + 1] += pool.vel[i * 3 + 1] * dt
        pool.pos[i * 3 + 2] += pool.vel[i * 3 + 2] * dt
        pool.vel[i * 3 + 1] -= 7 * dt
    }
    pool.geo.attributes.position.needsUpdate = true
}

export const SKY_PALETTES = SKIES
export { DS }
