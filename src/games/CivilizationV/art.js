// CIVILIZATION V — the tilted 3D hex map (three.js). Renders at screen
// resolution (the ART rule for 3D titles). Terrain is one instanced hex prism
// relief (elevation reads like Civ V), per-instance colour carries terrain +
// fog-of-war dimming + the owner's border tint. Forest cones, rivers, cities and
// units are instanced/groups kept in sync with the pure sim state every frame;
// units lerp toward their logical tile so movement animates. No assets, no
// Math.random at render time (terrain jitter is a hash of the tile).

import * as THREE from 'three'
import { CFG, T, CIVS, RES, RES_IDS, resRevealed, WONDER_IDS } from './sim.js'

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
    if (city.cs) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.66, 8), new THREE.MeshStandardMaterial({ color: 0xe8e4d8, flatShading: true, roughness: 0.85 }))
        tower.position.set(-0.42, 0.33 + h, 0.3); g.add(tower)
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffd870, emissiveIntensity: 1.4 }))
        beacon.position.set(-0.42, 0.72 + h, 0.3); g.add(beacon)
        g.userData.beacon = beacon
    }
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
    } else if (u.kind === 'ARCHER') {
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 7), new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(0x1c2b14), 0.25), flatShading: true, roughness: 0.7 }))
        body.position.y = 0.27; g.add(body)
        const helm = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xcfc8ae }))
        helm.position.y = 0.48; g.add(helm)
        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 5, 10, Math.PI * 1.2), new THREE.MeshStandardMaterial({ color: 0x6b4a24 }))
        bow.position.set(0.18, 0.3, 0.05); bow.rotation.z = -Math.PI / 2; g.add(bow)
        const quiv = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 6), new THREE.MeshStandardMaterial({ color: 0x4a3820 }))
        quiv.position.set(-0.12, 0.3, -0.1); quiv.rotation.x = 0.4; g.add(quiv)
    } else if (u.kind === 'CATAPULT') {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x6b4a24, flatShading: true, roughness: 0.9 }))
        frame.position.y = 0.16; g.add(frame)
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x4a3418, roughness: 0.9 })
        const w1 = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 6, 12), wheelMat)
        w1.rotation.y = Math.PI / 2; w1.position.set(0.2, 0.13, 0.17); g.add(w1)
        const w2 = w1.clone(); w2.position.x = -0.2; w2.position.z = -0.17; g.add(w2)
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.52, 0.05), new THREE.MeshStandardMaterial({ color: 0x8a6a3e, flatShading: true, roughness: 0.8 }))
        arm.position.set(-0.04, 0.42, 0); arm.rotation.z = 0.7; g.add(arm)
        const bucket = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.6 }))
        bucket.position.set(0.16, 0.58, 0); g.add(bucket)
    } else if (u.kind === 'WORKER') {
        const cart = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x8a6a3e, flatShading: true, roughness: 0.9 }))
        cart.position.y = 0.16; g.add(cart)
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x4a3418, roughness: 0.9 })
        const w1 = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 6, 10), wheelMat)
        w1.rotation.y = Math.PI / 2; w1.position.set(0.18, 0.11, 0.14); g.add(w1)
        const w2 = w1.clone(); w2.position.x = -0.18; w2.position.z = -0.14; g.add(w2)
        const spade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.04), new THREE.MeshStandardMaterial({ color: 0x9aa2ab, metalness: 0.5, roughness: 0.4 }))
        spade.position.set(-0.16, 0.34, 0); spade.rotation.z = 0.55; g.add(spade)
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0xb8c0ca, metalness: 0.6, roughness: 0.3 }))
        blade.position.set(-0.34, 0.5, 0); blade.rotation.z = 0.55; g.add(blade)
    } else if (u.kind === 'CHARIOT') {
        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.26), new THREE.MeshStandardMaterial({ color: 0x7a5a30, flatShading: true, roughness: 0.85 }))
        hull.position.y = 0.18; g.add(hull)
        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.3), new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.2), flatShading: true }))
        curb.position.set(-0.14, 0.3, 0); g.add(curb)
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x4a3418, roughness: 0.9 })
        const w1 = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.028, 6, 12), wheelMat)
        w1.rotation.y = Math.PI / 2; w1.position.set(0.12, 0.15, 0.18); g.add(w1)
        const w2 = w1.clone(); w2.position.z = -0.18; g.add(w2)
        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 5, 10, Math.PI * 1.1), new THREE.MeshStandardMaterial({ color: 0x6b4a24 }))
        bow.position.set(0.2, 0.4, 0.02); bow.rotation.z = -Math.PI / 2; g.add(bow)
    } else if (u.kind === 'LEGION') {
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.46, 7), new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(0x000000), 0.05), flatShading: true, roughness: 0.65 }))
        body.position.y = 0.29; g.add(body)
        const helm = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8b23a, metalness: 0.6, roughness: 0.35 }))
        helm.position.y = 0.52; g.add(helm)
        const crest = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.26), new THREE.MeshStandardMaterial({ color: 0xa02020, roughness: 0.8 }))
        crest.position.y = 0.62; g.add(crest)
        const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 10), new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(0xffd76a), 0.4), metalness: 0.4, roughness: 0.4 }))
        shield.position.set(0.2, 0.34, 0.08); shield.rotation.z = Math.PI / 2; shield.rotation.x = -0.3; g.add(shield)
        const gladius = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.03), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.8, roughness: 0.25 }))
        gladius.position.set(-0.2, 0.32, 0); gladius.rotation.z = 0.45; g.add(gladius)
    } else if (u.kind === 'MUSKET') {
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.46, 7), new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(0x101828), 0.35), flatShading: true, roughness: 0.65 }))
        body.position.y = 0.29; g.add(body)
        const shako = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x1c2230, roughness: 0.7 }))
        shako.position.y = 0.58; g.add(shako)
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.16), new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.35), metalness: 0.5, roughness: 0.4 }))
        plate.position.y = 0.7; g.add(plate)
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x5a3d1e, roughness: 0.85 }))
        stock.position.set(0.16, 0.38, 0.14); stock.rotation.z = 0.28; g.add(stock)
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.46, 6), new THREE.MeshStandardMaterial({ color: 0x9aa2ab, metalness: 0.8, roughness: 0.3 }))
        barrel.rotation.z = Math.PI / 2 - 0.28; barrel.position.set(0.52, 0.5, 0.14); g.add(barrel)
        const flash = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshStandardMaterial({ color: 0xffd870, emissive: 0xff9020, emissiveIntensity: 0.0 }))
        flash.position.set(0.76, 0.57, 0.14); g.add(flash)
        g.userData.flash = flash
    } else if (u.kind === 'GALLEON') {
        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.18, 0.26), new THREE.MeshStandardMaterial({ color: 0x5a3d1e, flatShading: true, roughness: 0.9 }))
        hull.position.y = 0.13; g.add(hull)
        const stern = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.24), new THREE.MeshStandardMaterial({ color: 0x6b4a24, flatShading: true }))
        stern.position.set(-0.34, 0.3, 0); g.add(stern)
        const prow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 4), new THREE.MeshStandardMaterial({ color: 0x7a5a30, flatShading: true }))
        prow.rotation.z = -Math.PI / 2; prow.position.set(0.52, 0.16, 0); g.add(prow)
        for (const mx of [-0.14, 0.08, 0.3]) for (const s of [-1, 1]) {
            const port = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), new THREE.MeshStandardMaterial({ color: 0x2a2018 }))
            port.position.set(mx, 0.16, s * 0.135); g.add(port)
        }
        for (const [mx, hgt] of [[-0.12, 0.62], [0.26, 0.48]]) {
            const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, hgt, 6), new THREE.MeshStandardMaterial({ color: 0x4a3418 }))
            mast.position.set(mx, 0.2 + hgt / 2, 0); g.add(mast)
            const sail = new THREE.Mesh(new THREE.PlaneGeometry(hgt * 0.55, hgt * 0.5), new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.5), side: THREE.DoubleSide, emissive: col, emissiveIntensity: 0.12 }))
            sail.position.set(mx - 0.02, 0.24 + hgt * 0.55, 0); sail.rotation.y = Math.PI / 2; g.add(sail)
        }
    } else if (u.kind === 'GALLEY') {
        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.22), new THREE.MeshStandardMaterial({ color: 0x6b4a24, flatShading: true, roughness: 0.9 }))
        hull.position.y = 0.12; g.add(hull)
        const prow = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 4), new THREE.MeshStandardMaterial({ color: 0x8a6a3e, flatShading: true }))
        prow.rotation.z = -Math.PI / 2; prow.position.set(0.42, 0.14, 0); g.add(prow)
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x4a3418 }))
        mast.position.y = 0.4; g.add(mast)
        const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.3), new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.45), side: THREE.DoubleSide, emissive: col, emissiveIntensity: 0.12 }))
        sail.position.set(-0.06, 0.46, 0); sail.rotation.y = Math.PI / 2; g.add(sail)
        const oarMat = new THREE.MeshStandardMaterial({ color: 0x9a7a4a })
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
            const oar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.02), oarMat)
            oar.position.set(-0.18 + k * 0.16, 0.08, s * 0.2); oar.rotation.y = s * 0.5; g.add(oar)
        }
    } else {
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.44, 7), new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(0x000000), 0.15), flatShading: true, roughness: 0.7 }))
        body.position.y = 0.28; g.add(body)
        const helm = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8d2c0 }))
        helm.position.y = 0.5; g.add(helm)
        const sword = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.03), new THREE.MeshStandardMaterial({ color: 0xcfd6dd, metalness: 0.7, roughness: 0.3 }))
        sword.position.set(0.2, 0.32, 0); sword.rotation.z = -0.5; g.add(sword)
    }
    // health bar: dark tray + fill that shrinks and reddens with hp
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x1a0a0a, emissive: 0x000000 }))
    tray.position.y = 0.72; g.add(tray)
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.055), new THREE.MeshStandardMaterial({ color: 0x49d24a, emissive: 0x1c6b1e, emissiveIntensity: 0.6 }))
    bar.position.set(0, 0.72, 0); g.add(bar)
    g.userData.bar = bar
    return g
}

// ---- Stage 6: completed wonders rise as landmarks over their city ----
function buildWonder(id, city, h) {
    const g = new THREE.Group()
    const { x, z } = hexToWorld(city.c, city.r)
    const ox = 0.52, oz = -0.5
    if (id === 'PYRAMIDS') {
        const mat = new THREE.MeshStandardMaterial({ color: 0xd8bd85, flatShading: true, roughness: 0.9 })
        const p = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.95, 4), mat)
        p.rotation.y = Math.PI / 4; p.position.set(ox, h + 0.47, oz); g.add(p)
        const p2 = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.55, 4), mat)
        p2.rotation.y = Math.PI / 4; p2.position.set(ox + 0.55, h + 0.27, oz + 0.28); g.add(p2)
    } else if (id === 'STONEHENGE') {
        const mat = new THREE.MeshStandardMaterial({ color: 0x9aa08c, flatShading: true, roughness: 0.95 })
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2
            const st = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42 + (i % 2) * 0.08, 0.1), mat)
            st.position.set(ox + Math.cos(a) * 0.34, h + 0.21, oz + Math.sin(a) * 0.34)
            st.rotation.y = a; g.add(st)
            if (i % 2 === 0) { const lin = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.12), mat); lin.position.set(ox + Math.cos(a) * 0.34, h + 0.47, oz + Math.sin(a) * 0.34); lin.rotation.y = a; g.add(lin) }
        }
    } else if (id === 'HANGING_GARDENS') {
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb9ae92, flatShading: true, roughness: 0.9 })
        const leaf = new THREE.MeshStandardMaterial({ color: 0x3e8a3e, flatShading: true, roughness: 0.9 })
        const tiers = [[0.78, 0.22], [0.56, 0.34], [0.36, 0.46]]
        for (const [w, y] of tiers) {
            const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, w), stoneMat); t.position.set(ox, h + y, oz); g.add(t)
            const gr = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.08, w * 0.82), leaf); gr.position.set(ox, h + y + 0.09, oz); g.add(gr)
        }
    } else if (id === 'GREAT_LIBRARY') {
        const marble = new THREE.MeshStandardMaterial({ color: 0xe2dcc8, flatShading: true, roughness: 0.7 })
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.42, 0.5), marble); body.position.set(ox, h + 0.21, oz); g.add(body)
        for (const s of [-1, 1]) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), marble); col.position.set(ox + s * 0.22, h + 0.25, oz + 0.28); g.add(col) }
        const ped = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.22, 4), marble); ped.rotation.y = Math.PI / 4; ped.scale.set(1, 1, 0.72); ped.position.set(ox, h + 0.52, oz); g.add(ped)
    } else if (id === 'COLOSSUS') {
        const bronze = new THREE.MeshStandardMaterial({ color: 0xb0782e, metalness: 0.65, roughness: 0.4, flatShading: true })
        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.5, 0.18), bronze); legs.position.set(ox, h + 0.25, oz); g.add(legs)
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.2), bronze); torso.position.set(ox, h + 0.7, oz); g.add(torso)
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), bronze); head.position.set(ox, h + 0.98, oz); g.add(head)
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 0.08), bronze); arm.position.set(ox + 0.24, h + 0.86, oz); arm.rotation.z = -0.9; g.add(arm)
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshStandardMaterial({ color: 0xffcf5a, emissive: 0xffaa20, emissiveIntensity: 1.6 })); flame.position.set(ox + 0.4, h + 1.06, oz); g.add(flame)
        g.userData.flame = flame
    } else if (id === 'GREAT_WALL') {
        const grey = new THREE.MeshStandardMaterial({ color: 0xa8a294, flatShading: true, roughness: 0.95 })
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.4
            const seg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.1), grey)
            seg.position.set(ox + Math.cos(a) * 0.4, h + 0.12, oz + Math.sin(a) * 0.4); seg.rotation.y = a + Math.PI / 2; g.add(seg)
            if (i === 0) { const tower = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.44, 0.18), grey); tower.position.set(ox + Math.cos(a) * 0.4, h + 0.22, oz + Math.sin(a) * 0.4); g.add(tower) }
        }
    }
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.68, 22), new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }))
    halo.rotation.x = -Math.PI / 2; halo.position.set(ox, h + 0.02, oz); g.add(halo)
    g.userData.x = x; g.userData.z = z; g.userData.h = h
    return g
}

function buildCamp(camp, h) {
    const g = new THREE.Group()
    const { x, z } = hexToWorld(camp.c, camp.r)
    const damaged = camp.hp < CFG.campHp * 0.55
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.32, 0.52), new THREE.MeshStandardMaterial({ color: damaged ? 0x463322 : 0x6b4f30, flatShading: true, roughness: 1 }))
    wall.position.y = h + 0.16; g.add(wall)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.36, 4), new THREE.MeshStandardMaterial({ color: damaged ? 0x2c2016 : 0x8a6a3e, flatShading: true, roughness: 1 }))
    roof.position.y = h + 0.48; roof.rotation.y = Math.PI / 4; g.add(roof)
    const spearMat = new THREE.MeshStandardMaterial({ color: 0x3b2c1a, roughness: 0.9 })
    const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 4), spearMat)
    s1.position.set(0.34, h + 0.26, 0.3); s1.rotation.z = 0.5; g.add(s1)
    const s2 = s1.clone(); s2.position.x = -0.34; s2.rotation.z = -0.5; g.add(s2)
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff5a10, emissiveIntensity: 1.4 }))
    ember.position.set(0, h + 0.05, 0.36); g.add(ember)
    g.userData = { x, z, h, id: camp.id, ember }
    return g
}

// ---- Stage 4 ground works: roads, farms, mines, resource tokens ----
const NN6 = [[+1, 0], [0, -1], [-1, -1], [-1, 0], [-1, +1], [0, +1]]
const NN6E = [[+1, 0], [+1, -1], [0, -1], [-1, 0], [0, +1], [+1, +1]]

function buildRoads(gs) {
    const g = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a6f47, roughness: 1, flatShading: true })
    for (const tl of gs.tiles) {
        if (!tl.road) continue
        if (!gs.explored[0][tl.r * CFG.W + tl.c]) continue
        const { x, z } = hexToWorld(tl.c, tl.r)
        const h = (tl._h || 0.14) + 0.02
        const nb = (tl.r & 1 ? NN6 : NN6E).filter(([dc, dr]) => {
            const c = tl.c + dc, r = tl.r + dr
            if (c < 0 || r < 0 || c >= CFG.W || r >= CFG.H) return false
            const q = gs.tiles[r * CFG.W + c]
            return q.road || q.city >= 0 || q.res >= 0
        })
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.3), mat)
        box.position.set(x, h, z); g.add(box)
        for (const [dc, dr] of nb) {
            const b = hexToWorld(tl.c + dc, tl.r + dr)
            const dx = b.x - x, dz = b.z - z
            const len = Math.sqrt(dx * dx + dz * dz)
            const seg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.022, len / 2 + 0.18), mat)
            seg.position.set(x + dx * 0.36, h, z + dz * 0.36)
            seg.rotation.y = Math.atan2(dx, dz)
            g.add(seg)
        }
    }
    return g
}

function buildWorks(gs) {
    const g = new THREE.Group()
    const soil = new THREE.MeshStandardMaterial({ color: 0x9c7b33, roughness: 1, flatShading: true })
    const furrow = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 1 })
    const rock = new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 1, flatShading: true })
    const timber = new THREE.MeshStandardMaterial({ color: 0x6b4a24, roughness: 0.95 })
    for (const tl of gs.tiles) {
        if (!tl.imp) continue
        if (!gs.explored[0][tl.r * CFG.W + tl.c]) continue
        const { x, z } = hexToWorld(tl.c, tl.r)
        const h = (tl._h || 0.14)
        if (tl.imp === 'FARM') {
            const patch = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.03, 0.62), soil)
            patch.position.set(x, h + 0.015, z); g.add(patch)
            for (let n = 0; n < 3; n++) {
                const f = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.022, 0.06), furrow)
                f.position.set(x, h + 0.03, z - 0.17 + n * 0.17); g.add(f)
            }
        } else if (tl.imp === 'MINE') {
            const pit = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.36), rock)
            pit.position.set(x, h + 0.06, z); g.add(pit)
            for (const sgn of [-1, 1]) {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 5), timber)
                leg.position.set(x + sgn * 0.14, h + 0.24, z)
                leg.rotation.z = -sgn * 0.38; g.add(leg)
            }
            const beam = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.05), timber)
            beam.position.set(x, h + 0.42, z); g.add(beam)
            const tail = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09), rock)
            tail.position.set(x + 0.26, h + 0.05, z + 0.14); g.add(tail)
        }
    }
    return g
}

function buildResources(gs, civ) {
    const g = new THREE.Group()
    for (const tl of gs.tiles) {
        if (tl.res < 0) continue
        const i = tl.r * CFG.W + tl.c
        if (!resRevealed(gs, civ, i)) continue
        const spec = RES[RES_IDS[tl.res]]
        const { x, z } = hexToWorld(tl.c, tl.r)
        const h = (tl._h || 0.14)
        const lit = gs.visible[0][i] ? 1 : 0.55
        const mat = new THREE.MeshStandardMaterial({ color: spec.color, emissive: spec.color, emissiveIntensity: 0.55 * lit, roughness: 0.4, metalness: spec.strategic ? 0.7 : 0.15 })
        let tok
        if (spec.strategic) {
            tok = new THREE.Mesh(tl.res === RES_IDS.indexOf('HORSES') ? new THREE.ConeGeometry(0.12, 0.26, 6) : new THREE.BoxGeometry(0.24, 0.14, 0.2), mat)
            tok.rotation.y = 0.5
            tok.position.set(x, h + (tl.res === RES_IDS.indexOf('HORSES') ? 0.13 : 0.08), z)
        } else {
            tok = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), mat)
            tok.position.set(x, h + 0.16, z)
        }
        g.add(tok)
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
    const campGroup = new THREE.Group(); scene.add(campGroup)
    const unitGroup = new THREE.Group(); scene.add(unitGroup)
    const fxGroup = new THREE.Group(); scene.add(fxGroup)   // selection / range rings
    const roadGroup = new THREE.Group(); scene.add(roadGroup)
    const workGroup = new THREE.Group(); scene.add(workGroup)
    const resGroup = new THREE.Group(); scene.add(resGroup)
    const wonderGroup = new THREE.Group(); scene.add(wonderGroup)

    const unitMeshes = new Map()
    const unitAnim = new Map()
    const cityMeshes = new Map()
    const campMeshes = new Map()

    const ringGeo = new THREE.RingGeometry(0.5, 0.72, 24)
    const selRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }))
    selRing.rotation.x = -Math.PI / 2; selRing.visible = false; fxGroup.add(selRing)
    const reachGeo = new THREE.RingGeometry(0.6, 0.82, 20)
    const reachPool = []
    for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(reachGeo, new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; fxGroup.add(m); reachPool.push(m) }

    // combat FX pools: expanding impact rings + spark bursts + arrows
    const fxPool = []
    for (let i = 0; i < 14; i++) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.5, 20), new THREE.MeshBasicMaterial({ color: 0xffcf5a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
        ring.rotation.x = -Math.PI / 2; ring.visible = false; fxGroup.add(ring)
        const sparks = []
        for (let n = 0; n < 6; n++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0, depthWrite: false })); s.visible = false; fxGroup.add(s); sparks.push(s) }
        fxPool.push({ ring, sparks, ttl: 0 })
    }
    const arrowPool = []
    for (let i = 0; i < 12; i++) {
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.5), new THREE.MeshStandardMaterial({ color: 0xe8dfc0, emissive: 0x443311, emissiveIntensity: 0.5 }))
        shaft.visible = false; fxGroup.add(shaft)
        arrowPool.push({ mesh: shaft, t: 1, from: [0, 0, 0], to: [0, 0, 0] })
    }

    return {
        scene, hexes, cones, ribbons, cityGroup, campGroup, unitGroup, fxGroup, roadGroup, workGroup, resGroup, wonderGroup, selRing, reachPool,
        unitMeshes, unitAnim, cityMeshes, campMeshes, fxPool, arrowPool,
        hexToWorld, worldToHex,
    }
}

// ---- battle FX: called by the shell on sim events ----
export function spawnImpact(view, gs, c, r, hot) {
    const slot = view.fxPool.find((f) => f.ttl <= 0) || view.fxPool[0]
    const { x, z } = hexToWorld(c, r)
    const h = (gs.tiles[r * CFG.W + c]._h || 0) + 0.05
    slot.ttl = 14
    slot.ring.visible = true
    slot.ring.position.set(x, h, z)
    slot.ring.material.color.setHex(hot ? 0xff6a3a : 0xffcf5a)
    slot.sparks.forEach((s, n) => {
        s.visible = true
        const a = (n / 6) * Math.PI * 2
        s.position.set(x + Math.cos(a) * 0.18, h + 0.12, z + Math.sin(a) * 0.18)
        s.userData.vx = Math.cos(a) * 0.05; s.userData.vz = Math.sin(a) * 0.05
    })
}

export function spawnArrow(view, gs, from, to) {
    const slot = view.arrowPool.find((a) => a.t >= 1) || view.arrowPool[0]
    const a = hexToWorld(from[0], from[1]); const b = hexToWorld(to[0], to[1])
    const ha = (gs.tiles[from[1] * CFG.W + from[0]]._h || 0) + 0.34
    const hb = (gs.tiles[to[1] * CFG.W + to[0]]._h || 0) + 0.28
    slot.from = [a.x, ha, a.z]; slot.to = [b.x, hb, b.z]; slot.t = 0
    slot.mesh.visible = true
}

// Per-frame sync of every visual against authoritative sim state.
// The tile loop runs W*H times every frame, so nothing in it may allocate:
// the lerp targets and the "never seen" colour are module constants, and the
// rebuild signatures below are rolling integers instead of strings.
const CIVCOL = CIVS.map((c) => new THREE.Color(c.hex))
const REACHCOL = new THREE.Color(0x6fe3ff)
const WHITE = new THREE.Color(0xffffff)
const UNSEEN = new THREE.Color(0.015, 0.02, 0.035)

export function updateView(view, gs, extra = {}) {
    const { hexes, cones, cityGroup, campGroup, unitGroup, roadGroup, workGroup, resGroup, wonderGroup } = view
    const col = new THREE.Color()
    const animate = !extra.lite
    const sunK = (i) => { const r = Math.floor(i / CFG.W); return 0.82 + 0.18 * (1 - r / CFG.H) }   // gentle north light
    for (let i = 0; i < gs.tiles.length; i++) {
        const tl = gs.tiles[i]
        const base = COL[tl.terr]
        let k = sunK(i)
        const fogv = gs.explored[0][i] ? (gs.visible[0][i] ? 1 : 0.52) : 0.0   // seen? current? unseen black
        if (animate && (tl.terr === T.OCEAN || tl.terr === T.COAST)) k *= 0.9 + 0.1 * Math.sin(gs.tick * 0.05 + (i % 7))
        col.setRGB(base[0] * k, base[1] * k, base[2] * k)
        const owner = tl.owner
        if (fogv > 0 && owner >= 0) col.lerp(CIVCOL[owner], gs.visible[0][i] ? 0.22 : 0.12)
        if (fogv === 0) col.copy(UNSEEN)
        else col.multiplyScalar(fogv >= 1 ? 1 : 0.72)
        // selection reach highlight
        if (extra.reach && extra.reach.has(i) && gs.visible[0][i]) col.lerp(REACHCOL, 0.42)
        if (extra.hover === i) col.lerp(WHITE, 0.35)
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

    // cities: rebuild when count/size/ownership changed (rolling integer sig — a
    // string per frame churned garbage; and the turn no longer rides in the sig,
    // so an untouched board stops rebuilding every city every turn)
    let cisig = 0
    for (const c of gs.cities) cisig = (cisig * 33 + c.id + c.size * 13 + (c.alive ? 7 : 0) + c.c * 3 + c.r * 29 + c.civ * 71) | 0
    if (cisig !== view._citySig) {
        view._citySig = cisig
        for (const child of [...cityGroup.children]) { disposeObj(child); cityGroup.remove(child) }
        view.cityMeshes.clear()
        for (const city of gs.cities) {
            if (!city.alive) continue
            if (!gs.explored[0][city.r * CFG.W + city.c]) continue
            const g = buildCity(city, gs.tiles[city.r * CFG.W + city.c]._h)
            cityGroup.add(g); view.cityMeshes.set(city.id, g)
        }
    }
    // camps: rebuild when any changes
    let capS = 0
    for (const cp of gs.camps) capS = (capS * 33 + cp.id + (cp.alive ? 7 : 0) + Math.ceil(cp.hp / 20) * 101) | 0
    if (capS !== view._campSig) {
        view._campSig = capS
        for (const child of [...campGroup.children]) { disposeObj(child); campGroup.remove(child) }
        view.campMeshes.clear()
        for (const cp of gs.camps) {
            if (!cp.alive) continue
            if (!gs.explored[0][cp.r * CFG.W + cp.c]) continue
            const g = buildCamp(cp, gs.tiles[cp.r * CFG.W + cp.c]._h)
            campGroup.add(g); view.campMeshes.set(cp.id, g)
        }
    }
    for (const [id, m] of view.campMeshes) {
        const cp = gs.camps[id]
        if (animate && m.userData.ember) m.userData.ember.material.emissiveIntensity = 1.0 + 0.6 * Math.sin(gs.tick * 0.22 + id)
        if (!cp || !cp.alive) { disposeObj(m); campGroup.remove(m); view.campMeshes.delete(id) }
    }
    for (const [, m] of view.cityMeshes) {
        if (animate && m.userData.beacon) m.userData.beacon.material.emissiveIntensity = 1.1 + 0.55 * Math.sin(gs.tick * 0.09 + m.position.x)
    }

    // Stage 4 ground layers: rebuild only when the land itself changes
    let rsig = 0, wsig = 0, xsig = 0
    for (const tl of gs.tiles) {
        const i = tl.r * CFG.W + tl.c
        const ex = gs.explored[0][i] ? 1 : 0
        rsig = (rsig * 31 + (tl.road ? ex + 1 : 0)) | 0
        wsig = (wsig * 31 + (tl.imp ? (tl.imp === 'FARM' ? 8 : 16) + ex + 1 : (tl.build ? 24 + (tl.build.left & 7) * 2 : 0))) | 0
        xsig = (xsig * 31 + (tl.res >= 0 ? (resRevealed(gs, 0, i) ? tl.res + 2 : 1) : 0)) | 0
    }
    if (rsig !== view._roadSig) { view._roadSig = rsig; for (const c of [...roadGroup.children]) { disposeObj(c); roadGroup.remove(c) }; roadGroup.add(buildRoads(gs)) }
    if (wsig !== view._workSig) { view._workSig = wsig; for (const c of [...workGroup.children]) { disposeObj(c); workGroup.remove(c) }; workGroup.add(buildWorks(gs)) }
    if (xsig !== view._resSig) { view._resSig = xsig; for (const c of [...resGroup.children]) { disposeObj(c); resGroup.remove(c) }; resGroup.add(buildResources(gs, 0)) }

    // Stage 6 landmarks: rebuild when the wonder board (or what you can see) changes
    let mwsig = 0
    for (const id of WONDER_IDS) {
        const b = gs.wonders[id]
        if (b == null) { mwsig = (mwsig * 31 + 0) | 0; continue }
        const home = gs.cities.find((c) => c.alive && c.civ === b && c.capital) || gs.cities.find((c) => c.alive && c.civ === b)
        mwsig = (mwsig * 31 + (home ? 1 + b * 3 + (gs.explored[0][home.r * CFG.W + home.c] ? 8 : 0) : 100)) | 0
    }
    if (mwsig !== view._wonderSig) {
        view._wonderSig = mwsig
        for (const c of [...wonderGroup.children]) { disposeObj(c); wonderGroup.remove(c) }
        for (const id of WONDER_IDS) {
            const b = gs.wonders[id]
            if (b == null) continue
            const home = gs.cities.find((c) => c.alive && c.civ === b && c.capital) || gs.cities.find((c) => c.alive && c.civ === b)
            if (!home || !gs.explored[0][home.r * CFG.W + home.c]) continue
            wonderGroup.add(buildWonder(id, home, gs.tiles[home.r * CFG.W + home.c]._h))
        }
    }
    for (const m of wonderGroup.children) {
        const flame = m.userData.flame
        if (animate && flame) flame.material.emissiveIntensity = 1.4 + 0.5 * Math.sin(gs.tick * 0.18)
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
            if (u.naval) m.position.y += 0.02 + Math.sin(gs.tick * 0.12 + u.id) * 0.03
            m.rotation.y = gs.tick * 0.02 + u.id
            if (u.path && u.path.length) m.position.y += 0.02 + Math.abs(Math.sin(gs.tick * 0.3)) * 0.05
            const bar = m.userData.bar
            if (bar) {
                const f = Math.max(0.04, u.hp / u.maxHp)
                bar.scale.x = f
                bar.position.x = -0.25 * (1 - f)
                bar.material.color.setHex(u.hp > 60 ? 0x49d24a : u.hp > 30 ? 0xd8c23a : 0xd84a3a)
                bar.material.emissive.setHex(u.hp > 60 ? 0x1c6b1e : u.hp > 30 ? 0x6b5a10 : 0x6b1410)
            }
        }
    }
    for (const [id, m] of view.unitMeshes) if (!liveIds.has(id)) { disposeObj(m); unitGroup.remove(m); view.unitMeshes.delete(id); view.unitAnim.delete(id) }

    // selection ring + reach pool
    const sel = gs.units.find((u) => u.id === gs.selected && u.alive && u.civ === 0)
    if (sel) { view.selRing.visible = true; view.selRing.position.set(a0(view, sel).x, gs.tiles[sel.r * CFG.W + sel.c]._h + 0.02, a0(view, sel).z); view.selRing.scale.setScalar(animate ? 1 + Math.sin(gs.tick * 0.12) * 0.06 : 1) }
    else view.selRing.visible = false
    const reach = extra.reach
    let ri = 0
    if (reach && sel) {
        for (const tIdx of reach) {
            if (ri >= view.reachPool.length) break
            const c = tIdx % CFG.W, r = (tIdx - (tIdx % CFG.W)) / CFG.W
            const ring = view.reachPool[ri++]
            ring.visible = true
            ring.position.set(HEX * SQ3 * (c + 0.5 * (r & 1)), gs.tiles[tIdx]._h + 0.015, HEX * 1.5 * r)
            ring.scale.setScalar(0.9)
        }
    }
    for (let i = ri; i < view.reachPool.length; i++) view.reachPool[i].visible = false

    // combat FX: impact rings + sparks + arrows, driven by the shell
    for (const f of view.fxPool) {
        if (f.ttl <= 0) continue
        f.ttl--
        const p = f.ttl / 14
        f.ring.material.opacity = p * 0.8
        f.ring.scale.setScalar(1 + (1 - p) * 1.4)
        if (f.ttl <= 0) { f.ring.visible = false; f.sparks.forEach((s) => { s.visible = false }) }
        for (const s of f.sparks) {
            s.position.x += s.userData.vx; s.position.z += s.userData.vz
            s.position.y += 0.02 - (1 - p) * 0.05
            s.material.opacity = p
            s.rotation.y += 0.4
        }
    }
    for (const a of view.arrowPool) {
        if (a.t >= 1) { a.mesh.visible = false; continue }
        a.t = Math.min(1, a.t + 0.16)
        const t = a.t
        a.mesh.position.set(
            a.from[0] + (a.to[0] - a.from[0]) * t,
            a.from[1] + (a.to[1] - a.from[1]) * t + Math.sin(t * Math.PI) * 0.5,
            a.from[2] + (a.to[2] - a.from[2]) * t
        )
        a.mesh.lookAt(a.to[0], a.to[1], a.to[2])
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
