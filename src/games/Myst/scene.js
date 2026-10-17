// MYST — three.js scene builder. Each node of the graph gets its own world
// island placed far along X, so the camera can teleport node-to-node. Every
// surface texture is generated (textures.js); everything that "lives" in the
// original animates: sea, clouds, fire, gears, illusions, starlight.

import * as THREE from 'three'
import { texNoise, texSky, texPages, PAL } from './textures.js'
import { NODES } from './nodes.js'

const GAP = 4000

const TX = {
  rock: texNoise(256, 4, 11, PAL.rock, { freq: 3, mortar: 0.06 }),
  stoneD: texNoise(256, 4, 17, PAL.stoneD, { freq: 2 }),
  wood: texNoise(128, 4, 23, PAL.wood, { freq: 2, streak: 0.35 }),
  plank: texNoise(128, 4, 31, PAL.plank, { freq: 1, streak: 0.5 }),
  sea: texNoise(256, 3, 41, PAL.sea, { freq: 2, streak: 0.4 }),
  moss: texNoise(256, 4, 53, PAL.moss, { freq: 3 }),
  sand: texNoise(128, 3, 61, PAL.sand, { freq: 3 }),
  brass: texNoise(128, 3, 71, PAL.brass, { freq: 4 }),
  iron: texNoise(128, 3, 83, PAL.iron, { freq: 5 }),
  selen: texNoise(256, 4, 97, PAL.selen, { freq: 2 }),
  grey: texNoise(256, 4, 101, PAL.grey, { freq: 2, mortar: 0.05 }),
  mech: texNoise(128, 4, 113, PAL.mech, { freq: 3, streak: 0.3 }),
  chand: texNoise(256, 4, 127, PAL.chand, { freq: 2 }),
  shelf: texNoise(128, 3, 131, PAL.shelf, { freq: 2, streak: 0.4 }),
  pageR: texPages('red'),
  pageB: texPages('blue'),
}

function mat(tex, opts = {}) { return new THREE.MeshStandardMaterial({ map: tex, ...opts }) }

function mesh(g, m, x = 0, y = 0, z = 0, group) {
  const o = new THREE.Mesh(g, m)
  o.position.set(x, y, z)
  if (group) group.add(o)
  return o
}

function skyDome(group, name) {
  const d = mesh(new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: texSky(name), side: THREE.BackSide, fog: false }), 0, 0, 0, group)
  d.userData.noPick = true
  d.userData.sky = true
}

function seaPlane(group, y = 0, size = 1600, tint) {
  const m = new THREE.MeshStandardMaterial({ map: TX.sea.clone(), transparent: true, opacity: tint || 0.95 })
  m.map.repeat.set(8, 8)
  const p = mesh(new THREE.PlaneGeometry(size, size, 24, 24), m, 0, y, 0, group)
  p.rotation.x = -Math.PI / 2
  return p
}

function rocks(group, tex, list) {
  for (const [x, y, z, sx, sy, sz, ry] of list) {
    const o = mesh(new THREE.BoxGeometry(sx, sy, sz), mat(tex), x, y, z, group)
    o.rotation.y = ry || 0
  }
}

function tree(group, x, y, z, s = 1, leaf = 0x2c5e2a, tag) {
  const trunk = mesh(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 1.6 * s), mat(TX.wood), x, y + 0.8 * s, z, group)
  const crown = mesh(new THREE.ConeGeometry(0.9 * s, 2.2 * s, 6), new THREE.MeshStandardMaterial({ color: leaf, roughness: 1 }), x, y + 2.4 * s, z, group)
  if (tag) { trunk.userData.landmark = tag; crown.userData.landmark = tag }
}

function gear(group, tex, r, x, y, z, speed, tag) {
  const g = new THREE.TorusGeometry(r, r * 0.18, 8, 14)
  const o = mesh(g, mat(tex, { metalness: 0.5, roughness: 0.4 }), x, y, z, group)
  o.userData.spin = speed
  o.userData.noPick = true
  const c = mesh(new THREE.CylinderGeometry(r * 0.25, r * 0.25, r * 0.3, 8), mat(tex, { metalness: 0.5 }), x, y, z, group)
  c.rotation.x = Math.PI / 2
  c.userData.spin = speed
  c.userData.noPick = true
  if (tag) { o.userData.landmark = tag; c.userData.landmark = tag }
}

const BUILDERS = {
  dock(g) {
    for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(3.4, 0.18, 0.62), mat(TX.plank), 0, 1.3, 30 + i * 0.7, g).userData.landmark = 'dockPlank'
    for (const px of [-1.5, 1.5]) for (let i = 0; i < 3; i++) mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.4), mat(TX.wood), px, 0.2, 30 + i * 1.6, g)
    seaPlane(g, 0)
    rocks(g, TX.rock, [[0, 2.4, 37.6, 6, 5, 2, 0], [-6, 4, 40, 8, 8, 4, 0.4], [7, 3.4, 40, 7, 7, 3, -0.3]])
    rocks(g, TX.moss, [[-2, 3.4, 38.4, 2, 1.4, 1.2, 0], [4, 4.4, 39, 2, 2, 1, 0.5]])
    tree(g, -5, 4.4, 39, 1.2); tree(g, 6, 4, 39.4, 1)
  },
  cliffPath(g) {
    const sea = seaPlane(g, -1)
    sea.userData.landmark = 'sea'
    // the far cliff the path is cut into; side cliffs frame the corridor
    const face = mesh(new THREE.BoxGeometry(12, 8, 5), mat(TX.rock), 0, 9.5, 6, g)
    face.userData.landmark = 'cliffFace'
    rocks(g, TX.rock, [[-6.5, 7, 14, 7, 14, 10, 0], [6.5, 6.5, 12, 7, 13, 10, 0]])
    rocks(g, TX.moss, [[-6.5, 14, 13, 3, 1, 2, 0], [6.5, 13, 11, 2.6, 1.2, 1.8, 0], [2, 13.5, 4.5, 3, 1, 2, 0]])
    for (let i = 0; i < 4; i++) mesh(new THREE.BoxGeometry(2.4, 0.16, 1), mat(TX.stoneD), i % 2 * 0.6, 4.75 + i * 0.55, 16.8 - i * 1.2, g)
    tree(g, -7.5, 14, 12, 1.3); tree(g, 7.5, 13, 10.5, 1.2); tree(g, -2, 13.5, 4, 1.4)
  },
  beach(g) {
    seaPlane(g, 0, 1200)
    const s = mesh(new THREE.CircleGeometry(9, 20), mat(TX.sand), -14, 0.05, 26, g)
    s.rotation.x = -Math.PI / 2
    rocks(g, TX.rock, [[-22, 4, 30, 10, 9, 5, 0.5], [-16, 5.4, 32, 6, 8, 3, 0.2]])
    const hull = mesh(new THREE.CylinderGeometry(0.9, 1.4, 5.4, 7), mat(TX.wood), -14, 0.7, 24, g)
    hull.rotation.set(0.15, 0, Math.PI / 2)
    hull.userData.noPick = false
    hull.userData.landmark = 'boat'
    mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6), mat(TX.wood), -14, 1.6, 24, g).rotation.z = 0.12
  },
  landing(g) {
    // the wooden landing the camera stands on (near end, z 11..15.3)
    for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(5.2, 0.2, 0.85), mat(TX.plank), 0, 6.6, 11 + i * 0.85, g)
    for (const px of [-2.3, 2.3]) mesh(new THREE.CylinderGeometry(0.16, 0.18, 6), mat(TX.wood), px, 3.6, 15.2, g)
    // the great stone stairway, rising away into the trees
    for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(4.4, 0.3, 1.1), mat(TX.stoneD), 0, 7.05 + i * 0.55, 10 - i * 1.05, g).userData.landmark = 'landingStair'
    mesh(new THREE.BoxGeometry(6, 0.3, 2.4), mat(TX.stoneD), 0, 10.4, 3.6, g).userData.landmark = 'landingStair'
    // side cliffs frame the stair; the trees close in over its top
    rocks(g, TX.stoneD, [[-8.5, 7, 8, 6, 12, 7, 0.15], [8.5, 7.5, 9, 7, 11, 6, -0.15], [-12, 10, 5, 5, 8, 5, 0.3]])
    tree(g, -3.2, 10.5, 4.2, 1.4, 0x2c5e2a, 'landingTree'); tree(g, 3.4, 10.3, 3.8, 1.2, 0x2c5e2a, 'landingTree'); tree(g, 0.6, 10.7, 2.4, 1.6, 0x33652f)
    // the palm that does not belong here — an illusion
    const palm = new THREE.Group()
    mesh(new THREE.CylinderGeometry(0.14, 0.22, 3.4), mat(TX.wood), 0, 1.7, 0, palm)
    for (let k = 0; k < 5; k++) {
      const f = mesh(new THREE.ConeGeometry(0.5, 2, 4), new THREE.MeshStandardMaterial({ color: 0x3a7a3c, roughness: 1 }), 0, 3.5, 0, palm)
      f.rotation.set(1.1, k * 1.256, 0)
    }
    palm.position.set(-7.5, 8.6, 4.5)
    palm.userData.flicker = true
    g.add(palm)
  },
  stairTop(g) {
    rocks(g, TX.stoneD, [[0, 6.2, 2.5, 18, 1.6, 4, 0], [-12, 8, 2, 8, 10, 6, 0.4], [12, 9, 1, 7, 9, 5, -0.4], [-7, 8.4, -1, 5, 5, 3, 0.3], [7, 8.4, -1, 5, 5, 3, -0.3]])
    const lib = mesh(new THREE.CylinderGeometry(5.4, 6, 8, 12), mat(TX.stoneD), 0, 14, 6, g)
    lib.userData.noPick = true
    lib.userData.landmark = 'library'
    mesh(new THREE.ConeGeometry(6.4, 3.4, 12), mat(TX.stoneD), 0, 19.6, 6, g).userData.landmark = 'library'
    const door = mesh(new THREE.BoxGeometry(1.8, 2.8, 0.3), mat(TX.wood), 0, 11.4, 12.1, g)
    door.userData.spot = 'libraryDoor'
    const tower = mesh(new THREE.CylinderGeometry(1.8, 2.1, 10, 10), mat(TX.stoneD), 8.5, 14.5, 8, g)
    tower.userData.noPick = true
    mesh(new THREE.ConeGeometry(2.4, 2, 10), mat(TX.stoneD), 8.5, 20.4, 8, g)
    const tdoor = mesh(new THREE.BoxGeometry(1.2, 2.2, 0.3), mat(TX.iron), 8.5, 11.1, 9.9, g)
    tdoor.userData.spot = 'towerDoor'
    const cab = new THREE.Group()
    mesh(new THREE.BoxGeometry(4, 3, 3.4), mat(TX.plank), 0, 1.5, 0, cab)
    mesh(new THREE.ConeGeometry(3, 1.6, 4), mat(TX.wood), 0, 3.8, 0, cab).rotation.y = Math.PI / 4
    cab.position.set(-9, 11, 6)
    g.add(cab)
    const cdoor = mesh(new THREE.BoxGeometry(1, 2, 0.25), mat(TX.wood), -9, 12, 7.75, g)
    cdoor.userData.spot = 'cabinDoor'
    seaPlane(g, -4, 1600, 0.9)
    tree(g, -4, 12, 4, 1.3); tree(g, 5, 12, 6, 1.1); tree(g, -13, 11, 4, 1.4)
  },
  library(g) {
    const room = mesh(new THREE.CylinderGeometry(7, 7, 5.6, 14, 1, true), mat(TX.shelf, { side: THREE.BackSide }), 0, 2.8, 0, g)
    room.userData.noPick = true
    const fl = mesh(new THREE.CircleGeometry(7, 14), mat(TX.wood), 0, 0.02, 0, g); fl.rotation.x = -Math.PI / 2
    for (let k = 0; k < 10; k++) {
      const a = k * 0.628
      const shelf = mesh(new THREE.BoxGeometry(2.4, 3.4, 0.5), mat(TX.shelf), Math.sin(a) * 6.4, 1.9, Math.cos(a) * 6.4, g)
      shelf.rotation.y = a
      shelf.userData.noPick = true
      shelf.userData.landmark = 'libraryShelf'
      for (let b = 0; b < 5; b++) {
        const bk = mesh(new THREE.BoxGeometry(0.34, 0.5 + (b % 3) * 0.14, 0.14), new THREE.MeshStandardMaterial({ color: [0x7a2020, 0x203a6a, 0x2a5a2a, 0x6a5a1a][b % 4], roughness: 0.8 }), Math.sin(a) * 6.15 + (b - 2) * 0.4 * Math.cos(a), 1.1 + (b % 3) * 0.1, Math.cos(a) * 6.15 - (b - 2) * 0.4 * Math.sin(a), g)
        bk.rotation.y = a
        bk.userData.noPick = true
      }
    }
    const rb = mesh(new THREE.BoxGeometry(0.9, 0.12, 0.62), mat(TX.pageR), -3.4, 1.3, -5.6, g)
    rb.rotation.set(-0.5, 0.6, 0); rb.userData.spot = 'redBook'
    mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2), mat(TX.wood), -3.4, 0.6, -5.6, g)
    const bb = mesh(new THREE.BoxGeometry(0.9, 0.12, 0.62), mat(TX.pageB), 3.4, 1.3, -5.6, g)
    bb.rotation.set(-0.5, -0.6, 0); bb.userData.spot = 'blueBook'
    mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2), mat(TX.wood), 3.4, 0.6, -5.6, g)
    const hearth = mesh(new THREE.BoxGeometry(2.6, 2.4, 1), mat(TX.stoneD), 0, 1.2, 6.6, g)
    hearth.userData.spot = 'fireplace'
    const fireLight = new THREE.PointLight(0xff7a30, 8, 14)
    fireLight.position.set(0, 1, 6); g.add(fireLight)
    fireLight.userData.flicker = true
    const ped = mesh(new THREE.CylinderGeometry(0.5, 0.7, 1, 8), mat(TX.stoneD), 0, 0.5, -1, g)
    ped.userData.spot = 'pedestal'
    const ladder = mesh(new THREE.BoxGeometry(1, 4.4, 0.12), mat(TX.wood), -6, 2.2, 0.5, g)
    ladder.rotation.y = 1.57; ladder.userData.spot = 'ladderDown'
  },
  cave(g) {
    const shell = mesh(new THREE.SphereGeometry(9, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.72), mat(TX.rock, { side: THREE.BackSide }), 0, 0, 0, g)
    shell.userData.noPick = true
    const pts = []
    for (let i = 0; i < 60; i++) { const a = i * 2.399, r = 7.4 * Math.sqrt(i / 60); pts.push(Math.sin(a) * r, 3.5 + Math.cos(i * 0.7) * 2 + r * 0.4, Math.cos(a) * r) }
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.PointsMaterial({ color: 0xbfd8ff, size: 0.12, fog: false }))
    stars.userData.twinkle = true
    g.add(stars)
    const panel = mesh(new THREE.BoxGeometry(2.2, 1.6, 0.2), mat(TX.stoneD), 0, 1.6, -8.4, g)
    panel.userData.spot = 'starPanel'
    panel.userData.landmark = 'starPanel'
    const wd = mesh(new THREE.BoxGeometry(1.8, 2.6, 0.3), mat(TX.plank), 4.8, 1.3, -6.8, g)
    wd.rotation.y = -0.6; wd.userData.spot = 'channelwoodDoor'
    const fall = seaPlane(g, 0.1, 16, 0.55)
    fall.position.set(-4.8, 0.1, -6.4); fall.userData.spot = 'rocketDoor'
    const fallTop = mesh(new THREE.PlaneGeometry(2, 3.4), new THREE.MeshStandardMaterial({ map: TX.sea, transparent: true, opacity: 0.7, side: THREE.DoubleSide }), -4.8, 2.4, -7.4, g)
    fallTop.userData.spot = 'rocketDoor'; fallTop.userData.fall = true
    const glow = new THREE.PointLight(0x6a86ff, 3, 18); glow.position.set(0, 4, -2); g.add(glow)
  },
  towerBase(g) {
    const shell = mesh(new THREE.CylinderGeometry(2.6, 3, 8, 12, 1, true), mat(TX.stoneD, { side: THREE.BackSide }), 0, 4, 0, g)
    shell.userData.noPick = true
    const fl = mesh(new THREE.CircleGeometry(3, 12), mat(TX.stoneD), 0, 0.02, 0, g); fl.rotation.x = -Math.PI / 2
    gear(g, TX.brass, 1.5, 0, 4.4, -2.2, 0.4, 'towerGear')
    gear(g, TX.brass, 0.8, 1.6, 3, -1.8, -0.75, 'towerGear')
    const ladder = mesh(new THREE.BoxGeometry(0.9, 7, 0.1), mat(TX.wood), -1.6, 3.6, 1.4, g)
    ladder.userData.spot = 'towerClimb'
  },
  towerTop(g) {
    const shell = mesh(new THREE.CylinderGeometry(2.6, 2.6, 4, 12, 1, true), mat(TX.stoneD, { side: THREE.BackSide }), 0, 2, 0, g)
    shell.userData.noPick = true
    const fl = mesh(new THREE.CircleGeometry(2.6, 12), mat(TX.stoneD), 0, 0.02, 0, g); fl.rotation.x = -Math.PI / 2
    gear(g, TX.brass, 1.1, -1.2, 2.4, -1.6, 0.9)
    const stand = mesh(new THREE.BoxGeometry(1, 0.12, 0.7), mat(TX.brass, { metalness: 0.6 }), 0, 1.2, -1.4, g)
    stand.rotation.x = -0.4; stand.userData.spot = 'mechanicalBook'
    const lever = mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6), mat(TX.iron, { metalness: 0.7 }), 2.1, 1.4, 0.2, g)
    lever.rotation.z = 0.6; lever.userData.spot = 'towerLever'; lever.userData.landmark = 'towerLever'
  },
  cabin(g) {
    const shell = mesh(new THREE.BoxGeometry(6, 3.2, 5), mat(TX.plank, { side: THREE.BackSide }), 0, 1.6, 0, g)
    shell.userData.noPick = true
    const safe = mesh(new THREE.BoxGeometry(1.6, 1.4, 1), mat(TX.iron, { metalness: 0.6, roughness: 0.35 }), 0, 1.1, -2.1, g)
    safe.userData.spot = 'safe'
    const dial = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12), mat(TX.brass, { metalness: 0.7 }), 0.4, 1.3, -1.55, g)
    dial.rotation.x = Math.PI / 2; dial.userData.spot = 'safe'
    const shelf = mesh(new THREE.BoxGeometry(2.4, 0.12, 0.7), mat(TX.wood), -1.6, 1.5, 1.6, g)
    shelf.userData.spot = 'cabinShelf'
    shelf.userData.landmark = 'cabinShelf'
    for (const s of ['red', 'blue', 'green', 'amber']) {
      const st = mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshStandardMaterial({ color: s === 'red' ? 0x9a2a20 : s === 'blue' ? 0x2a4a9a : s === 'green' ? 0x2a7a3a : 0x9a7a20 }), -2.4 + ['red', 'blue', 'green', 'amber'].indexOf(s) * 0.5, 1.65, 1.6, g)
      st.userData.spot = 'cabinShelf'
      st.userData.landmark = 'cabinShelf'
    }
  },
  selenitic(g) {
    const ground = mesh(new THREE.CircleGeometry(60, 28), mat(TX.selen), 0, 0, 0, g); ground.rotation.x = -Math.PI / 2
    seaPlane(g, 0.02, 300, 0.25)
    for (let r = 0; r < 4; r++) { const ring = mesh(new THREE.TorusGeometry(8 + r * 5, 0.7, 8, 40), mat(TX.selen), 0, 0.4 + r * 0.25, 0, g); ring.rotation.x = Math.PI / 2; ring.userData.noPick = true }
    const sph = mesh(new THREE.SphereGeometry(1.4, 20, 16), mat(TX.stoneD, { metalness: 0.2 }), 0, 1.6, -3, g)
    sph.userData.spot = 'sphere'
    sph.userData.landmark = 'sphere'
    const tones = [0, 1, 2, 3]
    tones.forEach((t) => {
      const a = t * 1.57 + 0.785 // staggered on the diagonals — the sightline to the sphere stays clear
      const post = mesh(new THREE.CylinderGeometry(0.12, 0.14, 2), mat(TX.stoneD), Math.sin(a) * 6, 1, Math.cos(a) * 6 - 3, g)
      post.userData.noPick = true
      const bulb = mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshStandardMaterial({ color: 0x30ff90, emissive: 0x10cc60, emissiveIntensity: 0.6 }), Math.sin(a) * 6, 2.2, Math.cos(a) * 6 - 3, g)
      bulb.userData.tone = t; bulb.userData.noPick = true
    })
  },
  stoneship(g) {
    const ground = mesh(new THREE.CircleGeometry(70, 26), mat(TX.grey), 0, -0.05, 0, g); ground.rotation.x = -Math.PI / 2
    seaPlane(g, 0.02, 500, 0.9)
    // a low grey ridge: the observatory sits on top and is the island's clear landmark
    rocks(g, TX.grey, [[0, 2, -14, 14, 4, 8, 0], [-10, 2, -8, 6, 4, 4, 0.4], [11, 2.4, -9, 5, 5, 4, -0.5]])
    const tower = mesh(new THREE.CylinderGeometry(1.8, 2.2, 3.8, 12), mat(TX.grey), 0, 5.9, -14, g)
    tower.userData.landmark = 'observatory'
    const dome = mesh(new THREE.SphereGeometry(2.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(TX.grey), 0, 7.8, -14, g)
    dome.userData.spot = 'observatory'
    dome.userData.landmark = 'observatory'
    for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(0.6, 0.3, 1.6), mat(TX.plank), -2 + i * 1.2, 0.2, -4 + i * 0.9, g)
  },
  mechanical(g) {
    const ground = mesh(new THREE.CircleGeometry(60, 24), mat(TX.mech, { metalness: 0.3, roughness: 0.6 }), 0, 0, 0, g); ground.rotation.x = -Math.PI / 2
    for (const [r, x, z, sp] of [[3, -6, -6, 0.5], [2, 5, -8, -0.8], [1.4, 8, -2, 1.2], [2.2, -9, 3, -0.4]]) gear(g, TX.mech, r, x, 1.5, z, sp)
    const panel = mesh(new THREE.BoxGeometry(2, 1.4, 0.2), mat(TX.iron, { metalness: 0.6 }), 0, 1.4, -5, g)
    panel.userData.spot = 'switchPanel'
    panel.userData.landmark = 'switchPanel'
    for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), mat(TX.iron, { metalness: 0.7 }), -0.7 + i * 0.35, 1.6, -4.85, g).userData.spot = 'switchPanel'
    const alcove = mesh(new THREE.BoxGeometry(1.6, 1.4, 0.4), mat(TX.iron), 4.6, 0.7, -3.4, g)
    alcove.userData.spot = 'pageMechanicalRed'
    const vent = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10), mat(TX.iron), -4.4, 0.2, 2.6, g)
    vent.userData.spot = 'pageMechanicalBlue'
    const steam = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-4.4, 0.6, 2.6, -4.2, 1.2, 2.7, -4.5, 1.8, 2.5, -4.3, 2.4, 2.6], 3)), new THREE.PointsMaterial({ color: 0xcfd2d8, size: 0.5, transparent: true, opacity: 0.5 }))
    steam.userData.steam = true; g.add(steam)
  },
  channelwood(g) {
    const ground = mesh(new THREE.CircleGeometry(60, 24), mat(TX.chand), 0, 0, 0, g); ground.rotation.x = -Math.PI / 2
    seaPlane(g, 0.02, 240, 0.7)
    const fall = mesh(new THREE.PlaneGeometry(14, 5, 1, 12), new THREE.MeshStandardMaterial({ map: TX.sea, transparent: true, opacity: 0.75, side: THREE.DoubleSide }), 0, 2.5, -13, g)
    fall.userData.fall = true
    rocks(g, TX.chand, [[0, 1.5, -14, 16, 3, 3, 0]])
    // the great stone star wheel: the foremost landmark, turning over the falls behind it
    const star = new THREE.Group()
    for (let k = 0; k < 5; k++) {
      const arm = mesh(new THREE.BoxGeometry(0.8, 3.4, 0.5), mat(TX.grey), 0, 1.7, 0, star)
      arm.rotation.z = k * 1.2566
      arm.userData.landmark = 'starWheel'
    }
    star.position.set(0, 4, -16)
    star.userData.spinY = 0.12
    star.userData.spot = 'starWheel'
    g.add(star)
    mesh(new THREE.BoxGeometry(0.7, 4.0, 0.7), mat(TX.grey), 0, 2, -16, g)
    const bridge = mesh(new THREE.BoxGeometry(10, 0.3, 1.4), mat(TX.plank), 3, 0.8, 2, g)
    bridge.rotation.y = 0.5; bridge.userData.spot = 'pageChannelwoodBlue'
    const pool = mesh(new THREE.CircleGeometry(2.4, 12), new THREE.MeshStandardMaterial({ color: 0x2a6a70, roughness: 0.2, metalness: 0.2 }), -3.4, 0.08, 2.6, g)
    pool.rotation.x = -Math.PI / 2; pool.userData.spot = 'pageChannelwoodRed'
  },
}

export function buildWorld(ids) {
  const root = new THREE.Group()
  const hot = []
  const anim = []
  ids.forEach((id, idx) => {
    const g = new THREE.Group()
    g.position.x = idx * GAP
    skyDome(g, idSky(id))
    if (BUILDERS[id]) BUILDERS[id](g)
    const cam = NODES[id].pos
    for (const sp of NODES[id].spots) {
      if (sp.act === 'takePage') {
        const a = THREE.MathUtils.degToRad(sp.yaw)
        const q = mesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshStandardMaterial({ map: sp.page.startsWith('red') ? TX.pageR : TX.pageB, side: THREE.DoubleSide, emissive: 0x120505 }), cam[0] + Math.sin(a) * 7, 1.1, cam[2] + Math.cos(a) * 7, g)
        q.userData.spot = sp.id
        q.rotation.y = a
      }
      if (sp.act === 'takeMatch') {
        const a = THREE.MathUtils.degToRad(sp.yaw)
        const q = mesh(new THREE.BoxGeometry(0.5, 0.14, 0.36), new THREE.MeshStandardMaterial({ color: 0xb85a30, roughness: 0.8 }), cam[0] + Math.sin(a) * 6, 1.2, cam[2] + Math.cos(a) * 6, g)
        q.userData.spot = sp.id
      }
    }
    root.add(g)
    g.traverse((o) => {
      if (o.userData.spot) hot.push({ mesh: o, id: o.userData.spot, node: id })
      if (o.userData.spin) anim.push({ o, f: (t) => { o.rotation.z = t * o.userData.spin } })
      if (o.userData.spinY) anim.push({ o, f: (t) => { o.rotation.y = t * o.userData.spinY } })
      if (o.userData.flicker) anim.push({ o, f: (t) => { o.material && (o.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(t * 3.7))) ; if (!o.material) o.intensity = 6 + 4 * Math.sin(t * 9.1) + 2 * Math.sin(t * 23.3) } })
      if (o.isLight && o.userData.flicker) anim.push({ o, f: (t) => { o.intensity = 6 + 4 * Math.sin(t * 9.1) + 2 * Math.sin(t * 23.3) } })
      if (o.userData.fall) anim.push({ o, f: (t) => { if (o.material.map) { o.material.map.offset.y = (t * 0.8) % 1 } } })
      if (o.userData.twinkle) anim.push({ o, f: (t) => { o.material.size = 0.1 + 0.06 * Math.sin(t * 2.1) } })
      if (o.userData.steam) anim.push({ o, f: (t) => { o.position.y = 0.4 + ((t * 0.7) % 1) * 2 } })
    })
    hot.push(...[])
  })
  hot.forEach((h) => { const o = h.mesh; if (!o.userData.noPick) o.userData.spot = h.id })
  return { root, hot, anim }
}

function idSky(id) {
  const ext = ['dock', 'cliffPath', 'beach', 'landing', 'stairTop']
  if (ext.includes(id)) return id === 'dock' || id === 'cliffPath' || id === 'beach' ? 'dusk' : 'day'
  if (id === 'towerTop') return 'day'
  if (id === 'selenitic') return 'selenitic'
  if (id === 'stoneship') return 'stoneship'
  if (id === 'mechanical') return 'mechanical'
  if (id === 'channelwood') return 'channelwood'
  return 'interior'
}
