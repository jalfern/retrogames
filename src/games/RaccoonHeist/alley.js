// The title-screen alley — the reference frame rebuilt in 3D and slowly orbiting.
//
// Cardboard box with a raccoon peeking out, a second one mid-sneak, a dumpster, a
// sodium-lit window, chain-link, puddles throwing cyan glare, rain. It is a real
// scene with real lights rather than a background image, for two reasons: it proves
// the palette and the lighting rig that every level will use, and it gives the attract
// screen something to *animate* (rain, shimmer, tail sway) for free.
//
// Two conventions here that the level builder reuses:
//   - Tiling lives in the geometry (`tileBox` / `tilePlane`), never in material.repeat,
//     so a 3 m shed and a 12 m facade share one wall material — and one texture upload.
//   - Only the moon casts shadows. Point lights that cast shadows cost a cube shadow
//     pass each, and on a phone that is the difference between 60fps and a warm pocket.
//
// Later levels build their own geometry from the grid in levels.js; this module is
// attract-only.

import * as THREE from 'three'
import {
    PAL, makeTex, propMat, tileBox, tilePlane, rng, makeRaccoon, animRaccoon, makeSky,
    makeCardboardBox, makeDumpster, makeTrashCan, makeTrashBag, makeCrate, makePallet,
    makeLamppost, makeBush, makePuddle, makeFence, makeWindow, makeFireEscape, makeAC,
    makeHydrant, makeAwning, makeRooftopGear, makeMoon, makeWashingLine,
} from './art'

// Rain is a square point sprite, so the streak has to be drawn inside a square canvas.
// Drawing it 8x32 and letting the sprite stretch it is how you get falling churros.
/**
 * @param {object} o { seed, rain (count), w, d }
 * @returns {{group:THREE.Group, animate:(dt:number,t:number)=>void, sneaker:THREE.Group}}
 */
export function makeAlley(o = {}) {
    const seed = o.seed ?? 11
    const R = rng(seed)
    const W = o.w ?? 22
    const D = o.d ?? 18
    const group = new THREE.Group()
    const flicker = []
    const spin = []

    // ---- ground -------------------------------------------------------------
    const groundGeo = tilePlane(new THREE.PlaneGeometry(W, D), W, D, 2.2)
    const ground = new THREE.Mesh(groundGeo, propMat('asphalt'))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    group.add(ground)

    // puddles: additive glare, wobbled in animate()
    const puddles = []
    for (let i = 0; i < 8; i++) {
        const p = makePuddle(0.5 + R() * 1.6, (seed + i * 7) | 0)
        p.position.set((R() - 0.5) * (W - 4), 0.012, (R() - 0.5) * (D - 4))
        p.userData.base = 0.10 + R() * 0.12
        puddles.push(p)
        group.add(p)
    }

    // ---- buildings ----------------------------------------------------------
    const wall = (w, h, d, kind, x, y, z, tile = [2, 1.4]) => {
        const geo = tileBox(new THREE.BoxGeometry(w, h, d), [w, h, d], tile)
        const b = new THREE.Mesh(geo, propMat(kind))
        b.position.set(x, y, z)
        b.castShadow = true; b.receiveShadow = true
        group.add(b)
        return b
    }

    // Right-hand brick face (x = 2.1 is the surface). The warm anchor of the frame.
    wall(9, 12, 9, 'brick', 6.6, 6, -1)
    const winA = makeWindow(1.5, 1.8, 1.3)
    winA.position.set(2.18, 4.6, -2.2)
    winA.rotation.y = -Math.PI / 2
    group.add(winA); flicker.push(winA.userData.pane)

    const winB = makeWindow(1.2, 1.4, 0.35)
    winB.position.set(2.18, 8.0, 1.6)
    winB.rotation.y = -Math.PI / 2
    group.add(winB)

    const winC = makeWindow(1.4, 1.6, 0.7)
    winA.castShadow = true
    winC.position.set(2.18, 8.4, -4.6)
    winC.rotation.y = -Math.PI / 2
    group.add(winC)

    // Back shopfront, so the alley reads as a street rather than a void (z = -6.1 face)
    wall(13, 8, 3, 'stucco', -3.5, 4, -7.6)
    const awn = makeAwning(3.4); awn.position.set(-5.0, 3.1, -5.9); group.add(awn)
    const door = new THREE.Mesh(tileBox(new THREE.BoxGeometry(1.3, 2.4, 0.14), [1.3, 2.4, 0.14], [1, 1]), propMat('wood'))
    door.position.set(-5.0, 1.2, -6.03); door.castShadow = true
    group.add(door)
    const doorGlow = new THREE.PointLight(0xffb45c, 22, 9, 2)
    doorGlow.position.set(-5.0, 2.9, -5.2)
    group.add(doorGlow); flicker.push(doorGlow)
    const winD = makeWindow(1.2, 1.2, 0.5); winD.position.set(-1.4, 3.4, -6.02); group.add(winD)

    // Fire escape silhouette on the brick face (its deck runs out along -X)
    const fe = makeFireEscape(3)
    fe.position.set(2.12, 0, 2.6); fe.rotation.y = -Math.PI / 2
    group.add(fe)

    // Low building far left, so the skyline has a second step
    wall(6, 5, 5, 'stucco', -8.4, 2.5, -4)
    const gear = makeRooftopGear(4, 4, seed + 3); gear.position.set(-8.4, 5, -4); group.add(gear)

    const ac = makeAC(); ac.position.set(2.05, 6.4, -5.6); ac.rotation.y = -Math.PI / 2; group.add(ac); spin.push(ac.userData.fan)

    // Posters papered on the brick: readable text for free, and a hint of the fiction
    for (let i = 0; i < 3; i++) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshStandardMaterial({ map: makeTex('poster'), roughness: 1, transparent: true }))
        p.position.set(2.17, 1.5, -4.6 + i * 1.35)
        p.rotation.y = -Math.PI / 2
        p.rotation.z = (R() - 0.5) * 0.22
        group.add(p)
    }

    // ---- the mess -----------------------------------------------------------
    const put = (g, x, z, ry = 0) => { g.position.x += x; g.position.z += z; g.rotation.y += ry; group.add(g); return g }
    const boxHero = put(makeCardboardBox(1.25, seed), -1.9, 1.0, 0.4)
    put(makeDumpster(seed), 0.2, 4.4, -0.25)
    put(makeTrashCan(1), -3.4, 2.6, 0.3)
    put(makeTrashCan(2), 2.4, 5.8, 1.1).rotation.z = 0.55
    put(makeTrashBag(seed), -3.8, 4.2)
    put(makeTrashBag(seed + 5), 4.2, 3.2)
    put(makeCrate(0.95), -5.0, -0.4, 0.2)
    put(makeCrate(0.7), -4.9, 0.9, -0.4)
    put(makePallet(), -6.2, -2.2, 0.1)
    put(makeHydrant(), -6.8, 4.6)
    put(makeBush(1.1), -7.4, 0.4)
    put(makeBush(0.8), -5.6, 6.2)
    const fence = makeFence(6); fence.position.set(5.2, 0, 6.4); fence.rotation.y = Math.PI / 2; group.add(fence)

    // laundry strung from the fire escape to the lamp: someone lives here
    const line = makeWashingLine([2.0, 7.4, 3.6], [3.6, 4.6, 6.2], seed + 9)
    group.add(line)

    const lamp = makeLamppost(); lamp.position.set(3.4, 0, 6.2); group.add(lamp)
    const lampLight = new THREE.PointLight(PAL.sodium, 90, 18, 2)
    lampLight.position.set(3.4 + 0.58, 4.3, 6.2)
    lampLight.castShadow = false            // one shadow caster only; see index.jsx
    group.add(lampLight); flicker.push(lampLight)

    // The warm spill from the lit window, onto the wet ground. This light is the reason
    // the reference frame feels warm on one side and cold on the other.
    const winLight = new THREE.PointLight(PAL.amber, 55, 13, 2)
    winLight.position.set(1.2, 4.5, -2.2)
    group.add(winLight); flicker.push(winLight)

    // ---- sky / rain / motes -------------------------------------------------
    const sky = makeSky(seed)
    group.add(sky)

    // Rain as LineSegments, not Points: a point sprite is always square, and a square
    // raindrop reads as snow. Two verts per drop, dropped and recycled on CPU — at
    // ~700 drops that is 1400 float writes a frame, which is nothing.
    const rainN = o.rain ?? 700
    const rainGeo = new THREE.BufferGeometry()
    const rp = new Float32Array(rainN * 6)
    const rv = new Float32Array(rainN)
    const WIND = 1.4
    for (let i = 0; i < rainN; i++) {
        const x = (R() - 0.5) * W, y = R() * 12, z = (R() - 0.5) * D
        const len = 0.28 + R() * 0.42
        rp[i * 6] = x; rp[i * 6 + 1] = y; rp[i * 6 + 2] = z
        rp[i * 6 + 3] = x + len * 0.18; rp[i * 6 + 4] = y - len; rp[i * 6 + 5] = z
        rv[i] = 9 + R() * 9
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3))
    const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({
        color: 0xbfe2ff, transparent: true, opacity: 0.34, depthWrite: false, fog: false,
    }))
    group.add(rain)

    const moteN = 70
    const moteGeo = new THREE.BufferGeometry()
    const mp = new Float32Array(moteN * 3)
    for (let i = 0; i < moteN; i++) {
        mp[i * 3] = (R() - 0.5) * W
        mp[i * 3 + 1] = 0.3 + R() * 3.4
        mp[i * 3 + 2] = (R() - 0.5) * D
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3))
    const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
        color: 0xffe3a8, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false,
        blending: THREE.AdditiveBlending,
    }))
    group.add(motes)

    // ---- the crew -----------------------------------------------------------
    // Scaled up ~15% from real raccoon size. Realism loses the read on a 5" screen;
    // cartoon chunk does not, and the tail silhouette is the whole character.
    const sneaker = makeRaccoon({ bandana: PAL.bandanaRed, seed: 1 })
    sneaker.position.set(1.9, 0, 0.2)
    sneaker.rotation.y = -1.25
    sneaker.scale.setScalar(1.45)
    group.add(sneaker)

    // Standing INSIDE the carton, so only head and paws clear the rim — the frame the
    // concept art is built around. The box is modelled open-topped for exactly this.
    const peeker = makeRaccoon({ bandana: PAL.bandanaBlue, seed: 2 })
    peeker.position.set(-1.9, 0.06, 1.0)
    peeker.rotation.y = 0.2
    peeker.scale.setScalar(1.1)
    group.add(peeker)

    const moon = makeMoon()
    moon.position.set(-38, 30, -52)
    group.add(moon)

    const animate = (dt, t) => {
        // rain: fall, shear with the wind, recycle at the top. On recycle BOTH verts of
        // the segment must be re-seeded — leaving the old tail vertex behind is how the
        // first version drew one enormous diagonal line across the screen per drop.
        const p = rainGeo.attributes.position
        const arr = p.array
        for (let i = 0; i < rainN; i++) {
            const k = i * 6
            let y = arr[k + 1] - rv[i] * dt
            let x = arr[k] + WIND * dt
            let z = arr[k + 2]
            const len = arr[k + 1] - arr[k + 4]
            if (y < 0) {
                y = 11 + R() * 2
                x = (R() - 0.5) * W
                z = (R() - 0.5) * D
            }
            arr[k] = x; arr[k + 1] = y; arr[k + 2] = z
            arr[k + 3] = x + len * 0.16; arr[k + 4] = y - len; arr[k + 5] = z
        }
        p.needsUpdate = true
        motes.rotation.y = t * 0.02
        for (const pu of puddles) pu.material.opacity = pu.userData.base * (0.75 + Math.sin(t * 2.2 + pu.position.x) * 0.3)
        // sodium flicker: a dying lamp is most of why an alley feels like an alley
        const fl = 0.92 + Math.sin(t * 13.3) * 0.05 + Math.sin(t * 3.1) * 0.06
        for (const f of flicker) {
            if (f.isPointLight) f.intensity = (f === lampLight ? 90 : f === winLight ? 55 : 22) * fl
            else f.material.emissiveIntensity = 1.35 * fl
        }
        for (const s of spin) s.rotation.z = t * 7
        for (const c of line.userData.clothes) {
            c.rotation.z = Math.sin(t * 1.7 + c.userData.phase) * 0.16
            c.rotation.x = Math.sin(t * 2.3 + c.userData.phase) * 0.1 - 0.04
        }
        animRaccoon(sneaker, dt, 1.5, { shine: true })
        // the peeker bobs in its box, paws on the rim
        animRaccoon(peeker, dt, 0, { shine: true, earTwitch: Math.sin(t * 0.9) > 0.96 })
        peeker.position.y = 0.06 + Math.sin(t * 1.1) * 0.05
        boxHero.position.y = 0
    }

    return { group, animate, sneaker, peeker, rain, moon, lights: [lampLight, winLight, doorGlow] }
}
