// RACCOON HEIST — turning a grid into a place.
//
// The level is a Uint8Array. This file is the only thing that knows what that looks
// like in 3D, and the rule it builds by is: **one draw call per material, per level.**
// A 500-cell map as 500 meshes is 500 draw calls and a phone will not hold 60fps; the
// merged wall batch and the world-mapped floor batch are why this whole game is a
// dozen-ish draw calls before props.
//
// Props that repeat (crates, hedges, planters) are InstancedMesh. Props that animate
// (lamps flickering, gate sliding, lasers pulsing) stay individual, because there are
// only a handful of them and their transforms are the point.

import * as THREE from 'three'
import { at, T, CELL, worldOf } from './levels.js'
import { PAL, mat, propMat, makeTex, tileBox, batch, rng, makeWalker, makeCart, makeGate, makeVaultDoor, makeCage, makePlanter, makeColumn, makeDumpster, makeCrate, makePallet, makeBush, makeHydrant, makeTrashCan, makeCardboardBox, makeLamppost, makeWashingLine, makeMoon, makeSky, makeRain, lootValue } from './art'

const M_PER_TILE_TEX = 2.2   // asphalt/marble texel size, in metres

/** World-mapped UVs: one continuous texture space over the whole floor, so tiling is
 *  seamless across cells instead of repeating once per tile like a bad tiled floor. */
function floorGeometry(level, want, tile = M_PER_TILE_TEX) {
    const pos = [], uv = [], idx = []
    let n = 0
    for (let y = 0; y < level.h; y++) {
        for (let x = 0; x < level.w; x++) {
            const t = at(level, x, y)
            if (!want.includes(t)) continue
            const wx = (x + level.ox) * CELL, wz = (y + level.oz) * CELL
            const h = CELL / 2
            const x0 = wx - h, x1 = wx + h, z0 = wz - h, z1 = wz + h
            pos.push(x0, 0, z1, x1, 0, z1, x1, 0, z0, x0, 0, z0)
            const u0 = x0 / tile, u1 = x1 / tile, v0 = z0 / tile, v1 = z1 / tile
            uv.push(u0, v1, u1, v1, u1, v0, u0, v0)
            idx.push(n, n + 1, n + 2, n, n + 2, n + 3)
            n += 4
        }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
}

/**
 * Every wall cell becomes one box, every box into one geometry. Heights come from the
 * level's per-cell height map, which is what gives the skyline its ragged roofline
 * without a single hand-placed mesh.
 */
function wallGeometry(level, wantHeight = (t) => t === T.WALL, fixedH = 0) {
    const geos = []
    const m = new THREE.Matrix4()
    for (let y = 0; y < level.h; y++) {
        for (let x = 0; x < level.w; x++) {
            if (!wantHeight(at(level, x, y))) continue
            const h = fixedH || Math.max(2.4, level.height[y * level.w + x])
            const g = tileBox(new THREE.BoxGeometry(CELL, h, CELL), [CELL, h, CELL], [2.1, 1.5])
            m.makeTranslation((x + level.ox) * CELL, h / 2, (y + level.oz) * CELL)
            g.applyMatrix4(m)
            geos.push(g)
        }
    }
    const merged = batch(geos.map((geo) => ({ geo, matrix: new THREE.Matrix4() })))
    for (const g of geos) g.dispose()
    return merged
}

function instance(proto, transforms, parent) {
    if (!transforms.length) return null
    const im = new THREE.InstancedMesh(proto.geometry, proto.material, transforms.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    transforms.forEach((t, i) => {
        e.set(t.rx || 0, t.ry || 0, t.rz || 0)
        q.setFromEuler(e)
        m.compose(new THREE.Vector3(t.x, t.y || 0, t.z), q, new THREE.Vector3(...(t.s || [1, 1, 1])))
        im.setMatrixAt(i, m)
    })
    im.instanceMatrix.needsUpdate = true
    im.castShadow = true
    im.receiveShadow = true
    parent.add(im)
    return im
}

/**
 * Windows on every wall face that looks onto walkable space. Placed by hash so the
 * same map always gets the same windows (a level that changes between runs cannot be
 * tested). Emissive only — no point lights: three shadow-casting lights is a mobile
 * budget and a lit window does not need to cast shadows to read as lit.
 */
function scatterWindows(level, theme, out) {
    const R = rng(101 + level.w)
    const warm = theme === 'museum' ? PAL.amberHot : PAL.amber
    for (let y = 1; y < level.h - 1; y++) {
        for (let x = 1; x < level.w - 1; x++) {
            if (at(level, x, y) !== T.WALL) continue
            const h = Math.max(2.4, level.height[y * level.w + x])
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const n = at(level, x + dx, y + dz)
                if (n === T.WALL || n === T.VOID) continue
                if (R() > 0.34) continue
                const rows = Math.max(1, Math.floor((h - 1.6) / 2.2))
                for (let r = 0; r < rows; r++) {
                    if (R() > 0.72) continue
                    const wy = 2.1 + r * 2.2
                    if (wy > h - 0.6) continue
                    const wx = (x + level.ox) * CELL + dx * (CELL / 2 + 0.02)
                    const wz = (y + level.oz) * CELL + dz * (CELL / 2 + 0.02)
                    // atan2(dx, dz) is the yaw whose local +Z is the outward normal.
                    // The version before this one special-cased the four directions and
                    // got the two along +Z backwards: every window on those faces was
                    // mounted facing into its own wall, glass first, and the frame plate
                    // in front of it made a black rectangle the size of a doorway.
                    out.push({ x: wx, y: wy, z: wz, ry: Math.atan2(dx, dz), warm, lit: R() > 0.35, w: 0.62 + R() * 0.3, h: 0.8 + R() * 0.35 })
                }
            }
        }
    }
    return out
}

/**
 * Build the whole level.
 * @returns {object} { group, lamps, hide, lasers, gate, vault, cart, cage, animate }
 */
export function buildWorld(level) {
    const theme = level.theme
    const group = new THREE.Group()
    const R = rng(level.w * 7919 + level.h)
    const lamps = []
    const hide = []            // cells you can dive into: DUMP (a bin) or BUSH (a hedge)
    const flicker = []
    const spin = []
    // Marker lookups, hoisted: the clutter baker below reads 'T' and 'W' before the
    // animated props read their own, and `const` does not hoist (that was a
    // "Cannot access 'mark' before initialization" at level mount).
    const mark = (ch) => level.marks.filter(m => m.ch === ch)

    // ---- floors -----------------------------------------------------------------
    const asphaltTex = makeTex('asphalt', 1, 1)
    const floorMat = new THREE.MeshStandardMaterial({
        name: 'floor',
        map: asphaltTex.map, roughnessMap: asphaltTex.rough, roughness: 0.58, metalness: 0.06,
        color: theme === 'museum' ? 0x8ea4b4 : 0xd2e5f2, envMapIntensity: 0.9, flatShading: false,
    })
    const floor = new THREE.Mesh(floorGeometry(level, [T.FLOOR, T.WATER]), floorMat)
    floor.rotation.x = 0
    floor.receiveShadow = true
    group.add(floor)

    const marbleTex = makeTex('marble', 1, 1)
    const marble = new THREE.Mesh(floorGeometry(level, [T.MARBLE], 1.6), new THREE.MeshStandardMaterial({
        name: 'marble',
        map: marbleTex, roughness: 0.2, metalness: 0.08, color: 0xe4e6dd, envMapIntensity: 1.4,
    }))
    marble.receiveShadow = true
    group.add(marble)

    // ---- walls ------------------------------------------------------------------
    const wallMat = theme === 'museum'
        ? new THREE.MeshStandardMaterial({ map: makeTex('stucco'), roughness: 0.72, metalness: 0.05, color: 0x9aa3a8, envMapIntensity: 0.7, flatShading: true })
        : propMat('brick')
    const walls = new THREE.Mesh(wallGeometry(level), wallMat)
    walls.name = 'walls'
    walls.castShadow = true
    walls.receiveShadow = true
    group.add(walls)

    // Chain-link: one merged transparent mesh. Blocks movement, never sight.
    // The fence gets its own dimensions rather than a scaled mesh: scaling the merged
    // batch scales the *positions* in it too, which slides every fence panel a few
    // centimetres off its wall — invisible at 1 m cells, a floating rail at 2.2 m.
    const fenceGeo = wallGeometry(level, (t) => t === T.FENCE, 2.1)
    if (fenceGeo.attributes.position.count) {
        const fence = new THREE.Mesh(fenceGeo, new THREE.MeshStandardMaterial({
            name: 'fence',
            map: makeTex('chainlink', 1, 1), transparent: true, alphaTest: 0.32, color: 0xa8bcc9,
            roughness: 0.45, metalness: 0.55, side: THREE.DoubleSide, envMapIntensity: 0.9,
        }))
        fence.castShadow = false
        group.add(fence)
    }

    // ---- windows ----------------------------------------------------------------
    const wins = scatterWindows(level, theme, [])
    const paneGeos = [], frameGeos = []
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler()
    for (const w of wins) {
        e.set(0, w.ry, 0); q.setFromEuler(e)
        const out = new THREE.Vector3(Math.sin(w.ry), 0, Math.cos(w.ry))
        m4.compose(out.clone().multiplyScalar(0.055).add(new THREE.Vector3(w.x, w.y, w.z)), q, new THREE.Vector3(1, 1, 1))
        const pg = new THREE.PlaneGeometry(w.w, w.h)
        pg.applyMatrix4(m4)
        paneGeos.push(pg)
        const fm = new THREE.Matrix4().compose(out.clone().multiplyScalar(-0.03).add(new THREE.Vector3(w.x, w.y, w.z)), q, new THREE.Vector3(1, 1, 1))
        const fg = tileBox(new THREE.BoxGeometry(w.w + 0.16, w.h + 0.16, 0.06), [w.w, w.h, 0.06], [1, 1])
        fg.applyMatrix4(fm)
        frameGeos.push(fg)
    }
    if (paneGeos.length) {
        const panes = new THREE.Mesh(batch(paneGeos.map((geo) => ({ geo, matrix: new THREE.Matrix4() }))), new THREE.MeshStandardMaterial({
            name: 'windowPanes',
            color: 0x2a2416, emissive: PAL.amber, emissiveIntensity: 1.9, roughness: 0.5, metalness: 0.1,
            envMapIntensity: 1.2, flatShading: true,
        }))
        group.add(panes)
        flicker.push(panes)
        const frames = new THREE.Mesh(batch(frameGeos.map((geo) => ({ geo, matrix: new THREE.Matrix4() }))), mat('winFrame', { color: 0x161d24, roughness: 0.9 }))
        frames.castShadow = false
        group.add(frames)
    }

    // ---- instanced clutter ------------------------------------------------------
    const crates = [], hedges = [], planters = [], columns = []
    for (let y = 0; y < level.h; y++) {
        for (let x = 0; x < level.w; x++) {
            const t = at(level, x, y)
            const [wx, wz] = worldOf(level, x, y)
            if (t === T.CRATE) (theme === 'museum' ? planters : crates).push({ x: wx, z: wz, ry: R() * 6.283 })
            if (t === T.BUSH) (theme === 'museum' ? planters : hedges).push({ x: wx, z: wz, ry: R() * 6.283 })
            if (t === T.DUMP) hide.push({ x: wx, z: wz })
            if (t === T.BUSH) hide.push({ x: wx, z: wz })
        }
    }
    if (crates.length) {
        const proto = makeCrate(0.92)
        const merged = batch(proto.children.map((c) => ({ geo: c.geometry, matrix: c.matrix.clone() })))
        instance({ geometry: merged, material: propMat('wood') }, crates.map((c) => ({ ...c, s: [1.35, 1 + R() * 0.6, 1.35] })), group)
    }
    if (hedges.length) {
        const proto = makeBush(1.15)
        const merged = batch(proto.children.map((c) => ({ geo: c.geometry, matrix: c.matrix.clone() })))
        instance({ geometry: merged, material: mat('hedgeInst', { color: PAL.leafDark, roughness: 1 }) }, hedges.map((c) => ({ ...c, s: [1.5, 1.2 + R() * 0.5, 1.5] })), group)
    }
    if (planters.length) {
        const proto = makePlanter()
        const merged = batch(proto.children.map((c) => ({ geo: c.geometry, matrix: c.matrix.clone() })))
        instance({ geometry: merged, material: mat('palmInst', { color: 0x3f6a45, roughness: 1 }) }, planters.map(c => ({ ...c, s: [1.3, 1.3, 1.3] })), group)
    }
    if (theme === 'museum') {
        for (let y = 0; y < level.h; y += 6) {
            for (let x = 0; x < level.w; x += 6) {
                if (at(level, x, y) === T.MARBLE) { const [cx2, cz2] = worldOf(level, x, y); columns.push({ x: cx2, z: cz2 }) }
            }
        }
        if (columns.length) {
            const col = makeColumn(4.6)
            const merged = batch(col.children.map((c) => ({ geo: c.geometry, matrix: c.matrix.clone() })))
            instance({ geometry: merged, material: mat('colInst', { map: makeTex('marble'), roughness: 0.22, metalness: 0.08, envMapIntensity: 1.6 }) }, columns, group)
        }
    }

    // ---- static clutter, baked ---------------------------------------------------
    // Twenty dumpsters at twenty-eight meshes each is five hundred and sixty draw
    // calls, and a phone spends its whole frame budget on state changes before you ever
    // see a raccoon. So every static prop is baked into one mesh per material: the
    // yard's entire junk — bins, cans, cartons, hydrants, pallets, washing lines —
    // costs three or four calls. Props that *move* (loot, the gate, the vault, the
    // flickering lamps) stay individual, because their transform is the point of them.
    const props = []
    const buckets = new Map()
    const stamp = (prop, x = 0, z = 0, ry = 0, kind = 'prop') => {
        props.push({ kind, x, z })
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0))
        const root = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1))
        prop.updateMatrixWorld(true)
        prop.traverse((o) => {
            if (!o.isMesh || !o.geometry) return
            // Transparent things keep their own mesh: merged alpha geometry has to be
            // depth-sorted as one object and starts eating the geometry behind it.
            if (o.material && o.material.transparent) return
            const g = o.geometry.clone()
            g.applyMatrix4(root.clone().multiply(o.matrixWorld))
            const key = o.material.uuid
            if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [] })
            buckets.get(key).geos.push(g)
        })
    }
    const flushBuckets = () => {
        for (const { mat: m, geos } of buckets.values()) {
            const merged = batch(geos.map(g => ({ geo: g, matrix: new THREE.Matrix4() })))
            for (const g of geos) g.dispose()
            const mesh = new THREE.Mesh(merged, m)
            mesh.castShadow = true
            mesh.receiveShadow = true
            group.add(mesh)
        }
        buckets.clear()
    }

    for (const cell of hide.filter(h => at(level, Math.round(h.x / CELL - level.ox), Math.round(h.z / CELL - level.oz)) === T.DUMP)) {
        stamp(makeDumpster(Math.round(cell.x * 31 + cell.z)), cell.x, cell.z, (R() > 0.5 ? 1 : -1) * Math.PI / 2, 'dumpster')
    }
    for (const m of mark('T')) stamp(makeTrashCan(Math.round(m.wx * 7 + 3)), m.wx, m.wz, R() * 6.283, 'can')
    for (const m of mark('W')) {
        // Laundry in the open is the best thing in a night alley and the worst thing to
        // park on top of the player's spawn, so keep it off the cart's frontage.
        const cart = level.marks.find(k => k.ch === 'S')
        if (cart && Math.hypot(m.x - cart.x, m.y - cart.y) < 4) continue
        stamp(makeWashingLine([m.wx - 1.6, 5.4, m.wz], [m.wx + 1.6, 4.2, m.wz + 1.2], Math.round(m.wx + m.wz)), 0, 0, 0, 'laundry')
    }
    // ---- mark-driven props ------------------------------------------------------
    const put = (obj, m, dy = 0) => { obj.position.set(m.wx, dy, m.wz); group.add(obj); return obj }

    // Every lamp post in the job collapses into three meshes: all the ironwork (one
    // material), all the bulbs (one emissive material — the flicker drives the shared
    // material, so eight lamps cost one draw call, not eight), and all the halos.
    const bulbGeos = []
    const haloGeos = []
    const haloMat = new THREE.MeshBasicMaterial({ color: PAL.sodium, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false })
    for (const m of mark('L')) {
        const lamp = makeLamppost()
        const [wx, wz] = worldOf(level, m.x, m.y)
        const ry = R() * 6.283
        lamp.rotation.y = ry
        lamp.updateMatrixWorld(true)
        lamp.traverse((o) => {
            if (!o.isMesh) return
            const g = o.geometry.clone()
            g.applyMatrix4(o.matrixWorld)
            g.translate(wx, 0, wz)
            if (o === lamp.userData.bulb) bulbGeos.push(g)
            else if (o.material.transparent) haloGeos.push(g)
            else {
                const key = o.material.uuid
                if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [] })
                buckets.get(key).geos.push(g)
            }
        })
        lamps.push({ x: wx, z: wz, bulb: lamp.userData.bulb })
    }
    if (bulbGeos.length) {
        const bulbMesh = new THREE.Mesh(batch(bulbGeos.map(geo => ({ geo, matrix: new THREE.Matrix4() }))), mat('bulb', { color: 0x2a2118, emissive: PAL.sodium, emissiveIntensity: 6, roughness: 1 }))
        group.add(bulbMesh)
        flicker.push({ material: bulbMesh.material })
    }
    if (haloGeos.length) {
        group.add(new THREE.Mesh(batch(haloGeos.map(geo => ({ geo, matrix: new THREE.Matrix4() }))), haloMat))
    }

    // A few props that exist purely so the yard is not empty: a hydrant, a carton,
    // a pallet. Placement is not random though, and both rules are lessons:
    //
    //  * only against a wall — furniture in the middle of a walkway reads as something
    //    the player is supposed to use, and this furniture does nothing;
    //  * never near a mark — the first version dropped a carton on the spawn, which
    //    swallowed the raccoon whole and made the chase camera render one enormous
    //    piece of cardboard for the entire first minute of the game.
    const nearMark = (x, y, r) => level.marks.some(m => Math.abs(m.x - x) <= r && Math.abs(m.y - y) <= r)
        || (level.routes || []).some(rt => rt.pts.some(p => Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1))
    let placed = 0
    for (let i = 0; i < 120 && placed < 5; i++) {
        const x = Math.floor(R() * level.w), y = Math.floor(R() * level.h)
        if (at(level, x, y) !== T.FLOOR) continue
        if (nearMark(x, y, 3)) continue
        const touching = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => at(level, x + dx, y + dy) === T.WALL).length
        if (touching < 1) continue
        placed++
        const pick = [() => makeHydrant(), () => makeCardboardBox(0.9, i + 2), () => makeCardboardBox(1.25, i + 9), () => makePallet()][placed % 4]()
        const [px, pz] = worldOf(level, x, y)
        stamp(pick, px, pz, Math.floor(R() * 4) * Math.PI / 2, 'clutter')
    }

    flushBuckets()

    // ---- the mission furniture --------------------------------------------------
    const cartObj = makeCart()
    const cartMark = mark('S')[0]
    put(cartObj, cartMark)
    const gateObj = makeGate(2.2, 3.4)
    const gateMark = mark('X')[0]
    put(gateObj, gateMark)
    const cage = makeCage()
    put(cage, mark('P')[0])
    const vaults = mark('V').map(m => {
        const r = 0.86
        const v = makeVaultDoor(r)
        // face the door toward the open cell it is set in
        const facing = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => {
            const t = at(level, m.x + dx, m.y + dy)
            return !!(t && t !== T.WALL && t !== T.VOID)
        }) || [0, 1]
        const baseYaw = Math.atan2(facing[0], facing[1])
        // The hinge is a radius off-centre, so the assembly is pushed back by that
        // radius along its own "right" — which leaves the plate centred in the cell.
        v.position.set(m.wx - Math.cos(baseYaw) * r, 1.05, m.wz + Math.sin(baseYaw) * r)
        v.rotation.y = baseYaw
        group.add(v)
        return { x: m.wx, z: m.wz, obj: v, pivot: v.userData.door, open: 0 }
    })

    // ---- lasers -----------------------------------------------------------------
    const lasers = []
    const emitters = mark('Z')
    const byRow = new Map()
    for (const e of emitters) {
        const key = 'y' + e.y
        if (!byRow.has(key)) byRow.set(key, [])
        byRow.get(key).push(e)
    }
    for (const [, pair] of byRow) {
        if (pair.length < 2) continue
        const [a, b] = [pair[0], pair[pair.length - 1]]
        const len = Math.abs(b.wx - a.wx)
        const beam = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 0.05, 0.05), new THREE.MeshStandardMaterial({
            color: 0x5a0a08, emissive: 0xff2a1e, emissiveIntensity: 3.4, roughness: 1,
        }))
        beam.position.set((a.wx + b.wx) / 2, 0.75, a.wz)
        group.add(beam)
        const glow = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 0.3, 0.3), new THREE.MeshBasicMaterial({
            color: 0xff3b2a, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false,
        }))
        glow.position.copy(beam.position)
        group.add(glow)
        for (const e of pair) {
            const head = new THREE.Mesh(boxSmall(0.22), mat('laserHead', { color: 0x1b1f26, roughness: 0.5, metalness: 0.6 }))
            head.position.set(e.wx + (e.wx < (a.wx + b.wx) / 2 ? 0.4 : -0.4), 0.75, e.wz)
            group.add(head)
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mat('laserEye', { color: 0x300000, emissive: 0xff2a1e, emissiveIntensity: 3, roughness: 1 }))
            eye.position.copy(head.position)
            eye.position.x += e.wx < (a.wx + b.wx) / 2 ? 0.14 : -0.14
            group.add(eye)
        }
        lasers.push({ beam, glow, period: 3.4, duty: 0.55, phase: lasers.length * 1.7, dead: false, z: a.wz, x0: Math.min(a.wx, b.wx) - 0.5, x1: Math.max(a.wx, b.wx) + 0.5 })
    }

    // ---- atmosphere -------------------------------------------------------------
    const sky = makeSky(level.w, Math.max(level.w, level.h) * CELL * 1.15)
    group.add(sky)
    const moon = makeMoon()
    // Inside the dome (radius 80), not outside it: the first moon was at 89 m, which is
    // how a night scene ends up with moonlight and no moon.
    moon.position.set(-58, 44, -78)
    group.add(moon)
    const span = Math.max(level.w, level.h) * CELL
    const rain = makeRain(level.rain, span * 1.1, span * 1.1, level.w)
    group.add(rain.mesh)

    // Puddles: fourteen transparent quads sharing one material become one mesh and one
    // draw call. They shimmer together now instead of each on its own phase, which is
    // the price, and the rain is heavy enough that nobody collects it.
    const puddleGeos = []
    for (let i = 0; i < 16; i++) {
        const x = Math.floor(R() * level.w), y = Math.floor(R() * level.h)
        const t = at(level, x, y)
        if (t !== T.FLOOR && t !== T.MARBLE) continue
        const [ux, uz] = worldOf(level, x, y)
        const g = new THREE.CircleGeometry(0.5 + R() * 1.7, 12)
        g.rotateX(-Math.PI / 2)
        g.translate(ux, 0.014, uz)
        puddleGeos.push(g)
    }
    let puddles = null
    if (puddleGeos.length) {
        const wet = new THREE.MeshStandardMaterial({
            name: 'puddle',
            map: makeTex('puddle', 1, 1), transparent: true, opacity: 0.16, roughness: 0.06,
            metalness: 0.55, envMapIntensity: 2.4, depthWrite: false, color: 0xbcd8f0,
        })
        puddles = new THREE.Mesh(batch(puddleGeos.map(geo => ({ geo, matrix: new THREE.Matrix4() }))), wet)
        for (const g of puddleGeos) g.dispose()
        group.add(puddles)
    }

    const state = { t: 0 }
    const animate = (dt, storm = 0) => {
        state.t += dt
        rain.animate(dt)
        rain.mesh.material.opacity = 0.16 + storm * 0.3
        if (puddles) puddles.material.opacity = (0.13 + Math.sin(state.t * 2.1) * 0.04) * (0.8 + storm * 0.6)
        const fl = 0.93 + Math.sin(state.t * 11.7) * 0.05 + Math.sin(state.t * 2.7) * 0.05
        for (const f of flicker) f.material.emissiveIntensity = 1.35 * fl
        for (const l of lamps) l.bulb.material.emissiveIntensity = 6 * fl
        for (const s of spin) s.rotation.z = state.t * 7
        for (const lz of lasers) {
            if (lz.dead) { lz.beam.visible = false; lz.glow.visible = false; continue }
            const on = ((state.t + lz.phase) % lz.period) < lz.period * lz.duty
            lz.beam.visible = on
            lz.glow.visible = on
            lz.on = on
        }
    }

    return { group, lamps, hide, lasers, vaults, cart: cartObj, gate: gateObj, cage, rain, animate, floor, walls, props, state }
}

function boxSmall(s) { return new THREE.BoxGeometry(s, s, s) }

/** Guards, cops, dogs and the cat share one spawn helper. The cone mesh is built
 *  from the *same* half-angle and range the sim will use to see you — one source of
 *  truth, because a drawn cone that lies is the worst bug a stealth game can have. */
export function makeAgent(kind, coneHalf = 0.7, range = 6.5) {
    const g = makeWalker(kind)
    const cone = makeCone(coneHalf, range, kind === 'dog' ? 0xff8a5a : kind === 'cop' ? 0xff6a4a : 0xffe0a0)
    if (kind === 'dog') cone.position.y = 0
    return { group: g, cone }
}

/**
 * The vision cone drawn on the floor. This is the single most important piece of UI
 * in a stealth game and it is not UI: it is geometry in the world, so it occludes,
 * it foreshortens, and the player learns it without a tutorial.
 */
function makeCone(half, len, color) {
    const seg = 14
    const pos = [0, 0.06, 0]
    const idx = []
    for (let i = 0; i <= seg; i++) {
        const a = -half + (2 * half * i) / seg
        pos.push(Math.sin(a) * len, 0.06, Math.cos(a) * len)
        if (i < seg) idx.push(0, i + 1, i + 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    mesh.visible = false
    return mesh
}

export { lootValue }
