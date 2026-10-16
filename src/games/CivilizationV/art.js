// CIVILIZATION V — the tilted 3D hex map (three.js). Renders at screen
// resolution (the ART rule for 3D titles). Terrain is one instanced hex prism
// relief (elevation reads like Civ V), per-instance colour carries terrain +
// fog-of-war dimming + the owner's border tint. Forest cones, rivers, cities and
// units are instanced/groups kept in sync with the pure sim state every frame;
// units lerp toward their logical tile so movement animates. No assets, no
// Math.random at render time (terrain jitter is a hash of the tile).

import * as THREE from 'three'
import { CFG, T, CIVS } from './sim.js'

const SQ3 = Math.sqrt(3)
export const HEX = 1
export function hexToWorld(c, r) {
    return { x: HEX * SQ3 * (c + 0.5 * (r & 1)), z: HEX * 1.5 * r }
}
export function worldToHex(x, z) {
    const r = Math.round(z / (HEX * 1.5))
    const c = Math.round(x / (HEX * SQ3) - 0.5 * (r & 1))
    return [c, r]
}
const hash2 = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }

const H = { [T.OCEAN]: 0.02, [T.COAST]: 0.05, [T.GRASS]: 0.14, [T.PLAINS]: 0.13, [T.DESERT]: 0.12, [T.HILLS]: 0.36, [T.MOUNTAIN]: 0.72 }
const COL = {
    [T.OCEAN]: [0.06, 0.16, 0.34], [T.COAST]: [0.11, 0.34, 0.52], [T.GRASS]: [0.24, 0.55, 0.24],
    [T.PLAINS]: [0.56, 0.55, 0.26], [T.DESERT]: [0.76, 0.66, 0.36], [T.HILLS]: [0.34, 0.42, 0.24],
    [T.MOUNTAIN]: [0.44, 0.44, 0.5],
}

function hexPrismGeometry(size) {
    const p = []; const top = []; const bot = []
    for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i); const vx = size * Math.cos(a), vz = size * Math.sin(a); top.push([vx, 1, vz]); bot.push([vx, 0, vz]) }
    const tri = (a, b, c) => p.push(...a, ...b, ...c)
    for (let i = 1; i < 5; i++) tri(top[0], top[i], top[i + 1])             // top fan
    for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; tri(top[i], bot[i], bot[j]); tri(top[i], bot[j], top[j]) } // walls
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    g.computeVertexNormals()
    return g
}

function buildCity(city, h) {
    const g = new THREE.Group()
    const { x, z } = hexToWorld(city.c, city.r)
    const col = new THREE.Color(CIVS[city.civ].hex)
    const n = Math.min(6, 1 + city.size)
    for (let i = 0; i < n; i++) {
        const a = (i / 6) * Math.PI * 2, rr = i === 0 ? 0 : 0.42
        const bh = 0.34 + (i === 0 ? 0.5 : hash2(i, city.id, 3) * 0.4)
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, bh, 0.34), new THREE.MeshStandardMaterial({ color: i === 0 ? col.clone().lerp(new THREE.Color(0xffffff), 0.35) : 0xb9b3a4, flatShading: true, roughness: 0.8 }))
        b.position.set(Math.cos(a) * rr, bh / 2 + h, Math.sin(a) * rr)
        g.add(b)
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }))
    pole.position.set(0.32, 0.6 + h, -0.32); g.add(pole)
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, emissive: col, emissiveIntensity: 0.25 }))
    flag.position.set(0.58, 1.02 + h, -0.32); g.add(flag)
    if (city.capital) { const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshStandardMaterial({ color: 0xffe66b, emissive: 0xffcf4a, emissiveIntensity: 0.9 }))
        star.position.set(0, 1.35 + h, 0); g.add(star) }
    g.userData = { x, z, h, id: city.id }
    return g
}

function buildUnit(u) {
    const g = new THREE.Group()
    const col = new THREE.Color(CIVS[u.civ].hex)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 12), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.6 }))
    base.position.y = 0.03; g.add(base)
    if (u.kind === 'SETTLER') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.28), new THREE.MeshStandardMaterial({ color: 0xe8e2d0, flatShading: true, roughness: 0.8 }))
        body.position.y = 0.16; g.add(body)
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 6, 12), new THREE.MeshStandardMaterial({ color: 0x5a4326 }))
        wheel.position.set(0.22, 0.1, 0); g.add(wheel)
        const w2 = wheel.clone(); w2.position.x = -0.22; g.add(w2)
    } else {
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.44, 7), new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(0x000000), 0.15), flatShading: true, roughness: 0.7 }))
        body.position.y = 0.28; g.add(body)
        const helm = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8d2c0 }))
        helm.position.y = 0.5; g.add(helm)
    }
    return g
}

export function createView(gs) {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x05070f)
    const W = CFG.W, RH = CFG.H
    scene.fog = new THREE.Fog(0x05070f, 55, 120)

    const sun = new THREE.DirectionalLight(0xfff2d8, 1.15); sun.position.set(-40, 70, 30); scene.add(sun)
    scene.add(new THREE.HemisphereLight(0x9ec3ff, 0x20160a, 0.55))

    // ---- terrain: instanced hex prism, per-instance colour ----
    const count = W * RH
    const hexMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.92, metalness: 0.02 })
    const hexes = new THREE.InstancedMesh(hexPrismGeometry(0.985), hexMat, count)
    hexes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    hexes.frustumCulled = false
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion()
    for (let i = 0; i < count; i++) {
        const c = i % W, r = (i - c) / W, { x, z } = hexToWorld(c, r)
        const tl = gs.tiles[i]
        const jit = (hash2(c, r, gs.seed) - 0.5) * 0.04
        const h = Math.max(0.02, H[tl.terr] + jit * (tl.terr >= T.GRASS ? 1 : 0))
        tl._h = h
        mtx.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, h, 1))
        hexes.setMatrixAt(i, mtx)
    }
    hexes.instanceMatrix.needsUpdate = true
    scene.add(hexes)

    // ---- forest: instanced cones (2 per forested tile) ----
    const fCells = gs.tiles.filter((tl) => tl.forest && tl.terr >= T.GRASS && tl.terr <= T.PLAINS)
    const fcount = fCells.length * 2
    const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x1f4d22, flatShading: true, roughness: 1 }), fcount)
    cones.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(fcount * 3), 3)
    cones.frustumCulled = false
    {
        let k = 0
        for (const tl of fCells) {
            const { x, z } = hexToWorld(tl.c, tl.r)
            for (let n = 0; n < 2; n++) {
                const ox = n ? 0.28 : -0.22, oz = n ? -0.2 : 0.24
                const m4 = new THREE.Matrix4().compose(new THREE.Vector3(x + ox, tl._h + 0.35, z + oz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hash2(tl.c, tl.r, k) * 6.28, 0)), new THREE.Vector3(1, 1, 1))
                cones.setMatrixAt(k++, m4)
            }
        }
    }
    if (fcount) cones.instanceMatrix.needsUpdate = true
    scene.add(cones)

    // ---- rivers: instanced thin ribbon across each river tile ----
    const rCells = gs.tiles.filter((tl) => tl.river)
    const ribbons = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.04, 1.15), new THREE.MeshStandardMaterial({ color: 0x3a8fd0, roughness: 0.25, metalness: 0.1, emissive: 0x0a2233, emissiveIntensity: 0.4 }), Math.max(1, rCells.length))
    ribbons.frustumCulled = false
    {
        let k = 0
        for (const tl of rCells) {
            const { x, z } = hexToWorld(tl.c, tl.r)
            const m4 = new THREE.Matrix4().compose(new THREE.Vector3(x, tl._h + 0.02, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hash2(tl.c, tl.r, 7) * Math.PI, 0)), new THREE.Vector3(1, 1, 1))
            ribbons.setMatrixAt(k++, m4)
        }
    }
    if (rCells.length) ribbons.instanceMatrix.needsUpdate = true
    scene.add(ribbons)

    // ---- groups rebuilt as the world changes ----
    const cityGroup = new THREE.Group(); scene.add(cityGroup)
    const unitGroup = new THREE.Group(); scene.add(unitGroup)
    const fxGroup = new THREE.Group(); scene.add(fxGroup)   // selection / range rings

    const unitMeshes = new Map()
    const unitAnim = new Map()
    const cityMeshes = new Map()

    const ringGeo = new THREE.RingGeometry(0.5, 0.72, 24)
    const selRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }))
    selRing.rotation.x = -Math.PI / 2; selRing.visible = false; fxGroup.add(selRing)
    const reachGeo = new THREE.RingGeometry(0.6, 0.82, 20)
    const reachPool = []
    for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(reachGeo, new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; fxGroup.add(m); reachPool.push(m) }

    return {
        scene, hexes, cones, ribbons, cityGroup, unitGroup, fxGroup, selRing, reachPool,
        unitMeshes, unitAnim, cityMeshes,
        hexToWorld, worldToHex,
    }
}

// Per-frame sync of every visual against authoritative sim state.
export function updateView(view, gs, extra = {}) {
    const { hexes, cones, cityGroup, unitGroup } = view
    const col = new THREE.Color()
    const sunK = (i) => { const c = i % CFG.W, r = (i - c) / CFG.W; return 0.82 + 0.18 * (1 - r / CFG.H) }   // gentle north light
    for (let i = 0; i < gs.tiles.length; i++) {
        const tl = gs.tiles[i]
        let base = COL[tl.terr]
        let k = sunK(i)
        const fogv = gs.explored[0][i] ? (gs.visible[0][i] ? 1 : 0.52) : 0.0   // seen? current? unseen black
        if (tl.terr === T.OCEAN || tl.terr === T.COAST) {
            const sh = 0.9 + 0.1 * Math.sin(gs.tick * 0.05 + (i % 7))
            base = base.map((v) => v * sh)
        }
        // owner border tint
        let owner = gs.tiles[i].owner
        col.setRGB(base[0] * k, base[1] * k, base[2] * k)
        if (fogv > 0 && owner >= 0) col.lerp(new THREE.Color(CIVS[owner].hex), gs.visible[0][i] ? 0.22 : 0.12)
        if (fogv === 0) col.setRGB(0.015, 0.02, 0.035)
        else col.multiplyScalar(fogv >= 1 ? 1 : 0.72)
        // selection reach highlight
        if (extra.reach && extra.reach.has(i) && gs.visible[0][i]) col.lerp(new THREE.Color(0x6fe3ff), 0.42)
        if (extra.hover === i) col.lerp(new THREE.Color(0xffffff), 0.35)
        hexes.setColorAt(i, col)
    }
    hexes.instanceColor.needsUpdate = true

    const fr = view.forestRefs || (view.forestRefs = collectForest(view, gs))
    for (let n = 0; n < fr.length; n++) {
        const i = fr[n].i
        const lit = gs.explored[0][i] ? (gs.visible[0][i] ? 1 : 0.72) : 0
        col.setRGB(0.13, 0.34, 0.16).multiplyScalar(lit)
        cones.setColorAt(n, col)
    }
    if (cones.instanceColor) cones.instanceColor.needsUpdate = true

    // cities: rebuild when count/size changed
    const sig = gs.cities.map((c) => `${c.id}:${c.size}:${c.alive ? 1 : 0}:${c.c},${c.r}`).join('|') + '#' + gs.turn
    if (sig !== view._citySig) {
        view._citySig = sig
        for (const child of [...cityGroup.children]) { disposeObj(child); cityGroup.remove(child) }
        view.cityMeshes.clear()
        for (const city of gs.cities) {
            if (!city.alive) continue
            if (!gs.explored[0][city.r * CFG.W + city.c]) continue
            const g = buildCity(city, gs.tiles[city.r * CFG.W + city.c]._h)
            cityGroup.add(g); view.cityMeshes.set(city.id, g)
        }
    }

    // units: create/remove, animate position toward logical tile
    const liveIds = new Set()
    for (const u of gs.units) {
        if (!u.alive) continue
        const ti = u.r * CFG.W + u.c
        const visible = u.civ === 0 ? (gs.visible[0][ti] || gs.explored[0][ti]) : gs.visible[0][ti]
        liveIds.add(u.id)
        let m = view.unitMeshes.get(u.id)
        if (!m) { m = buildUnit(u); view.unitMeshes.set(u.id, m); unitGroup.add(m); const s0 = hexToWorld(u.c, u.r); view.unitAnim.set(u.id, { x: s0.x, z: s0.z }) }
        const tgt = hexToWorld(u.c, u.r)
        const a = view.unitAnim.get(u.id)
        const sp = 0.34
        a.x += (tgt.x - a.x) * sp; a.z += (tgt.z - a.z) * sp
        m.visible = !!visible
        if (visible) {
            m.position.set(a.x, gs.tiles[ti]._h, a.z)
            m.rotation.y = gs.tick * 0.02 + u.id
            if (u.path && u.path.length) m.position.y += 0.02 + Math.abs(Math.sin(gs.tick * 0.3)) * 0.05
        }
    }
    for (const [id, m] of view.unitMeshes) if (!liveIds.has(id)) { disposeObj(m); unitGroup.remove(m); view.unitMeshes.delete(id); view.unitAnim.delete(id) }

    // selection ring + reach pool
    const sel = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0)
    if (sel) { view.selRing.visible = true; view.selRing.position.set(a0(view, sel).x, gs.tiles[sel.r * CFG.W + sel.c]._h + 0.02, a0(view, sel).z); view.selRing.scale.setScalar(1 + Math.sin(gs.tick * 0.12) * 0.06) }
    else view.selRing.visible = false
    const reach = extra.reach && sel ? [...extra.reach] : []
    for (let i = 0; i < view.reachPool.length; i++) {
        const ring = view.reachPool[i]
        if (i < reach.length) { const c = reach[i] % CFG.W, r = (reach[i] - c) / CFG.W; const { x, z } = hexToWorld(c, r); ring.visible = true; ring.position.set(x, gs.tiles[reach[i]]._h + 0.015, z); ring.scale.setScalar(0.9) }
        else ring.visible = false
    }
}
function collectForest(view, gs) {
    const refs = []
    gs.tiles.forEach((tl, i) => { if (tl.forest && tl.terr >= T.GRASS && tl.terr <= T.PLAINS) { for (let n = 0; n < 2; n++) refs.push({ tl, i }) } })
    return refs
}
function a0(view, u) { return view.unitAnim.get(u.id) || hexToWorld(u.c, u.r) }
function disposeObj(o) { o.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) { (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => { for (const k of ['map', 'alphaMap']) if (x[k]) x[k].dispose(); x.dispose() }) } }) }

export { disposeObj }
