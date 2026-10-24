// MYST — three.js scene builder. Each node of the graph gets its own world
// island placed far along X, so the camera can teleport node-to-node. Every
// surface texture is generated (textures.js); everything that "lives" in the
// original animates: sea, clouds, fire, gears, illusions, starlight.

import * as THREE from 'three'
import { texNoise, texSky, texPages, PAL } from './textures.js'
import { NODES } from './nodes.js'
import { STAR_SHAPES } from './state.js'

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
  strata: texNoise(256, 4, 137, PAL.grey, { freq: 2, strata: 0.55 }),
  pageR: texPages('red'),
  pageB: texPages('blue'),
}

function mat(tex, opts = {}) { return new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: opts.metalness !== undefined ? 0.08 : 0.32, ...opts }) }

function mesh(g, m, x = 0, y = 0, z = 0, group) {
  const o = new THREE.Mesh(g, m)
  o.position.set(x, y, z)
  if (group) group.add(o)
  return o
}

function starGeometry(arms) {
  const outer = 0.5, inner = 0.21
  const shape = new THREE.Shape()
  const steps = arms * 2
  for (let i = 0; i <= steps; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / arms
    const x = Math.cos(a) * r, y = Math.sin(a) * r
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y)
  }
  return new THREE.ShapeGeometry(shape)
}

// Rescale the four true stars to this save's star code (rank 1-4 by size).
export function updateTrueStars(root, star) {
  if (!root || !star) return
  root.traverse((o) => {
    if (o.userData && o.userData.trueStar != null) {
      const v = Math.max(1, Math.min(4, Number(star[o.userData.trueStar]) || 1))
      o.scale.setScalar(0.5 + (v - 1) * 0.24)
    }
  })
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

// The signature of SELENITIC: one huge cratered moon, low and green-white.
// fog:false so the scene fog never swallows it.
function moon(group, x, y, z, r, tag, spot) {
  const m = new THREE.MeshStandardMaterial({ color: 0xdff0e0, emissive: 0x9fd8b0, emissiveIntensity: 0.85, fog: false, roughness: 1 })
  const o = mesh(new THREE.SphereGeometry(r, 20, 16), m, x, y, z, group)
  o.userData.noPick = !spot
  if (spot) { o.userData.noPick = false; o.userData.spot = spot }
  if (tag) o.userData.landmark = tag
  for (let k = 0; k < 4; k++) {
    const a = k * 1.7 + 0.4
    const d = mesh(new THREE.SphereGeometry(r * (0.12 + 0.05 * (k % 2)), 8, 6), new THREE.MeshStandardMaterial({ color: 0xb9cfba, emissive: 0x6f9c7c, emissiveIntensity: 0.6, fog: false }), x + Math.sin(a) * r * 0.55, y + Math.cos(a * 1.3) * r * 0.45, z - r * 0.75, group)
    d.userData.noPick = true
  }
  return o
}

function tree(group, x, y, z, s = 1, leaf = 0x2c5e2a, tag) {
  const trunk = mesh(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 1.6 * s), mat(TX.wood), x, y + 0.8 * s, z, group)
  const crown = mesh(new THREE.ConeGeometry(0.9 * s, 2.2 * s, 6), new THREE.MeshStandardMaterial({ color: leaf, roughness: 1 }), x, y + 2.4 * s, z, group)
  if (tag) { trunk.userData.landmark = tag; crown.userData.landmark = tag }
}

function tuft(group, x, y, z, s = 1, tint = 0x3f6b34) {
  for (let k = 0; k < 3; k++) {
    const b = mesh(new THREE.ConeGeometry(0.07 * s, 0.5 * s * (0.7 + 0.3 * k), 4),
      new THREE.MeshStandardMaterial({ color: tint, roughness: 1 }), x + (k - 1) * 0.11 * s, y + 0.24 * s, z + (k % 2) * 0.07 * s, group)
    b.rotation.z = (k - 1) * 0.22
    b.userData.noPick = true
  }
}

function boulder(group, tex, x, y, z, s, ry = 0) {
  const o = mesh(new THREE.IcosahedronGeometry(s, 0), mat(tex), x, y, z, group)
  o.rotation.set(ry, ry * 1.7, ry * 0.6)
  o.userData.noPick = true
  return o
}

function barrel(group, x, y, z, ry = 0) {
  const b = mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.8, 10), mat(TX.wood, { bumpScale: 0.5 }), x, y, z, group)
  b.rotation.y = ry
  b.userData.noPick = true
  for (const yy of [-0.18, 0.18]) mesh(new THREE.TorusGeometry(0.33, 0.025, 6, 12), mat(TX.iron, { metalness: 0.6 }), x, y + yy, z, group).rotation.x = Math.PI / 2
}

function crate(group, x, y, z, s = 1, ry = 0) {
  const c = mesh(new THREE.BoxGeometry(0.7 * s, 0.6 * s, 0.7 * s), mat(TX.plank), x, y, z, group)
  c.rotation.y = ry
  c.userData.noPick = true
}

function lantern(group, x, y, z) {
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7), mat(TX.wood), x, y + 0.85, z, group).userData.noPick = true
  const lamp = mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xff9a40, emissiveIntensity: 1.4, transparent: true, opacity: 0.92 }), x, y + 1.8, z, group)
  lamp.userData.flicker = true
  lamp.userData.noPick = true
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
  return o
}

const BUILDERS = {
  dock(g) {
    for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(3.4, 0.18, 0.62), mat(TX.plank), 0, 1.3, 30 + i * 0.7, g).userData.landmark = 'dockPlank'
    for (const px of [-1.5, 1.5]) for (let i = 0; i < 3; i++) mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.4), mat(TX.wood), px, 0.2, 30 + i * 1.6, g)
    seaPlane(g, 0)
    rocks(g, TX.rock, [[0, 2.4, 37.6, 6, 5, 2, 0], [-6, 4, 40, 8, 8, 4, 0.4], [7, 3.4, 40, 7, 7, 3, -0.3]])
    rocks(g, TX.moss, [[-2, 3.4, 38.4, 2, 1.4, 1.2, 0], [4, 4.4, 39, 2, 2, 1, 0.5]])
    tree(g, -5, 4.4, 39, 1.2); tree(g, 6, 4, 39.4, 1)
    barrel(g, -1.2, 1.79, 31.6, 0.4); crate(g, 1.15, 1.69, 32.4, 0.9, 0.3)
    lantern(g, 1.55, 1.39, 30.4)
    tuft(g, -2.4, 2.9, 37.6, 1.1); tuft(g, 5.2, 3.2, 38.2, 0.9)
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
    boulder(g, TX.rock, -5.2, 13.6, 8, 0.9, 0.5); boulder(g, TX.moss, 5.6, 12.6, 7, 0.7, 1.2)
    tuft(g, -4.4, 14.6, 10, 1.3); tuft(g, 4.8, 13.6, 9, 1.1); tuft(g, 1.8, 5.4, 17.4, 0.8)
    mesh(new THREE.CylinderGeometry(0.28, 0.32, 2.6, 7), mat(TX.wood), -5.8, 14.8, 12, g).rotation.z = 1.35
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
    barrel(g, -12.2, 0.4, 26.2, 0.7); crate(g, -15.6, 0.3, 27, 0.9, 0.5); barrel(g, -16.4, 0.4, 24.6, 1.1)
    tuft(g, -12.5, 0.06, 28.4, 1.2); tuft(g, -17, 0.06, 28.6, 1)
    boulder(g, TX.rock, -9.5, 0.7, 27.5, 0.8, 0.7)
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
    barrel(g, -1.7, 7.1, 14.6, 0.6); crate(g, 1.7, 7.0, 14.2, 0.8, 0.7)
    tuft(g, -8, 13.1, 5.5, 1.2); tuft(g, 8.2, 13.1, 6.5, 1); tuft(g, 6.2, 9.4, 12.5, 0.9)
    boulder(g, TX.stoneD, 11.5, 12.6, 11, 1.1, 0.4)
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
    lantern(g, -1.9, 7, 11.4); lantern(g, 1.9, 7, 11.4)
    crate(g, -6.2, 7.3, 2.6, 0.9, 0.4); barrel(g, -7.4, 7.4, 3.6, 0.9)
    boulder(g, TX.stoneD, -11.5, 14.1, 5, 1.1, 0.9); boulder(g, TX.stoneD, 11.8, 13.6, 9, 1, 0.2)
    tuft(g, -5.4, 7.05, 3.4, 1.1); tuft(g, 6.4, 7.05, 2.4, 1)
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
    const rug = mesh(new THREE.CircleGeometry(2.6, 16), new THREE.MeshStandardMaterial({ color: 0x5a1f1a, roughness: 1, map: TX.pageR }), 0, 0.03, 1.6, g)
    rug.rotation.x = -Math.PI / 2; rug.userData.noPick = true
    for (const [bx, bz] of [[2.2, 4.4], [2.6, 4.9]]) crate(g, bx, 0.3, bz, 0.9, 0.5)
    barrel(g, -2.6, 0.4, 4.6, 0.8)
    for (const cx of [-1.05, 1.05]) {
      mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.34), mat(TX.brass, { metalness: 0.5 }), cx, 2.57, 6.45, g).userData.noPick = true
      const flame = mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffb040, emissiveIntensity: 1.6 }), cx, 2.78, 6.45, g)
      flame.userData.flicker = true; flame.userData.noPick = true
    }
  },
  cave(g) {
    const shell = mesh(new THREE.SphereGeometry(9, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.72), mat(TX.rock, { side: THREE.BackSide }), 0, 0, 0, g)
    shell.userData.noPick = true
    const pts = []
    for (let i = 0; i < 60; i++) { const a = i * 2.399, r = 7.4 * Math.sqrt(i / 60); pts.push(Math.sin(a) * r, 3.5 + Math.cos(i * 0.7) * 2 + r * 0.4, Math.cos(a) * r) }
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.PointsMaterial({ color: 0xbfd8ff, size: 0.12, fog: false }))
    stars.userData.twinkle = true
    g.add(stars)
    // #1005 — the four true stars over the star panel. Their sizes ARE this
    // save's star code (dial rank 1-4, small to large), so the dome is the
    // clue and a walkthrough from another save is worthless. Sizes ride the
    // seed via updateTrueStars().
    const trueStars = new THREE.Group()
    for (let i = 0; i < 4; i++) {
      const s = mesh(starGeometry(STAR_SHAPES[i]), new THREE.MeshStandardMaterial({ color: 0xe8f0ff, emissive: 0x9db8ff, emissiveIntensity: 1.5, side: THREE.DoubleSide }), [-2.6, -0.9, 0.9, 2.6][i], [5.4, 6.1, 5.7, 4.9][i], -8.0, trueStars)
      s.userData.trueStar = i
      s.userData.twinkleStar = i
      s.userData.noPick = true
    }
    g.add(trueStars)
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
    for (const [sx, sz, sh] of [[-2.6, -3.6, 1.6], [3.4, -3, 1.1], [-1.2, -6, 0.8], [2.2, 2.4, 1.3], [-3.6, 1.2, 1.8], [5.6, -1.6, 0.7]]) {
      const spire = mesh(new THREE.ConeGeometry(0.22 + sh * 0.14, sh, 6), mat(TX.rock), sx, sh / 2, sz, g)
      spire.userData.noPick = true
    }
    boulder(g, TX.rock, -6.4, 0.4, -1.5, 0.7, 0.6)
  },
  towerBase(g) {
    const shell = mesh(new THREE.CylinderGeometry(2.6, 3, 8, 12, 1, true), mat(TX.stoneD, { side: THREE.BackSide }), 0, 4, 0, g)
    shell.userData.noPick = true
    const fl = mesh(new THREE.CircleGeometry(3, 12), mat(TX.stoneD), 0, 0.02, 0, g); fl.rotation.x = -Math.PI / 2
    gear(g, TX.brass, 1.5, 0, 4.4, -2.2, 0.4, 'towerGear')
    gear(g, TX.brass, 0.8, 1.6, 3, -1.8, -0.75, 'towerGear')
    const ladder = mesh(new THREE.BoxGeometry(0.9, 7, 0.1), mat(TX.wood), -1.6, 3.6, 1.4, g)
    ladder.userData.spot = 'towerClimb'
    const pipe = mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.6, 8), mat(TX.iron, { metalness: 0.6 }), 0, 6.6, 0.6, g)
    pipe.rotation.z = Math.PI / 2; pipe.userData.noPick = true
    for (const px of [-1.6, 1.6]) mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 10), mat(TX.brass, { metalness: 0.6 }), px, 6.6, 0.6, g).rotation.y = Math.PI / 2
    boulder(g, TX.stoneD, 1.8, 0.35, -1.2, 0.6, 0.8)
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
    crate(g, 1.9, 0.3, 1.2, 0.9, 0.5); barrel(g, -2.2, 0.4, -1.2, 0.6)
    mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3), mat(TX.wood, { color: 0xe8dcc0 }), 1.2, 1.95, -2.1, g).userData.noPick = true
    const cflame = mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffb040, emissiveIntensity: 1.5 }), 1.2, 2.16, -2.1, g)
    cflame.userData.flicker = true; cflame.userData.noPick = true
  },
  selenitic(g) {
    const ground = mesh(new THREE.CircleGeometry(60, 28), mat(TX.selen), 0, 0, 0, g); ground.rotation.x = -Math.PI / 2
    seaPlane(g, 0.02, 300, 0.25)
    moon(g, 26, 22, 30, 8, null, null)
    const glow0 = new THREE.PointLight(0x9fd8b0, 12, 70); glow0.position.set(0, 10, 0); g.add(glow0)
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
    // the trailhead: an arch of standing stones off the left of the landing,
    // mouth of the path down to the sounding field
    const bear = THREE.MathUtils.degToRad(-118)
    const ax = Math.sin(bear) * 11, az = Math.cos(bear) * 11 - 16
    for (const s of [-1.4, 1.4]) mesh(new THREE.BoxGeometry(0.8, 3.4, 0.8), mat(TX.grey), ax + s, 1.7, az, g)
    mesh(new THREE.BoxGeometry(3.8, 0.7, 0.9), mat(TX.grey), ax, 3.7, az, g).userData.spot = 'toSelSound'
    for (let i = 0; i < 4; i++) mesh(new THREE.BoxGeometry(1.6, 0.18, 1), mat(TX.stoneD), ax - Math.sin(bear) * i * 1.2, 0.09 + i * 0.02, az - Math.cos(bear) * i * 1.2, g).userData.spot = 'toSelSound'
    boulder(g, TX.selen, -18, 1.2, 10, 2.4, 0.6); boulder(g, TX.selen, 17, 0.9, 12, 1.8, 1.4); boulder(g, TX.selen, -13, 0.7, 22, 1.3, 0.3)
    tuft(g, 6, 0.06, 14, 1.4, 0x2f6a44); tuft(g, -7, 0.06, 18, 1.2, 0x2f6a44)
  },
  selSound(g) {
    // camera at [0,1.7,-46], facing +z: the stone field recedes toward a
    // sealed gate in the cliff, the moon low on the right shoulder
    const ground = mesh(new THREE.CircleGeometry(70, 26), mat(TX.selen), 0, 0, -46, g); ground.rotation.x = -Math.PI / 2
    seaPlane(g, 0.02, 300, 0.2)
    moon(g, 5, 24, 8, 5.5, null, 'lookMoon')
    // the corridor walls: two green-black rock shoulders, striated like the
    // original's narrow fissure (vertical strata, not flat grey slabs)
    rocks(g, TX.strata, [[-9, 3.4, -32, 8, 8, 14, 0.12], [9.5, 3.8, -33, 8, 9, 14, -0.12]])
    rocks(g, TX.selen, [[-9.4, 7.2, -33, 4, 1.6, 8, 0.1], [9.2, 8.2, -34, 3.4, 1.8, 8, -0.1]])
    // six stepping stones, biggest to smallest — the biggest sings the lowest
    const yaws = [-14, 10, -8, 14, -4, 8]
    yaws.forEach((yd, i) => {
      const a = THREE.MathUtils.degToRad(yd)
      const d = 7.5 + i * 1.7
      const r = 1.5 - i * 0.18
      const st = mesh(new THREE.CylinderGeometry(r, r * 1.12, 0.5, 12), mat(TX.stoneD, { metalness: 0.15, emissive: 0x16281c, emissiveIntensity: 0.35 }), Math.sin(a) * d, 0.25, -46 + Math.cos(a) * d, g)
      st.userData.spot = `stone${i}`; st.userData.landmark = 'selStones'; st.userData.mech = `selStone${i}`
      const rim = mesh(new THREE.TorusGeometry(r * 0.92, 0.05, 6, 18), new THREE.MeshStandardMaterial({ color: 0x9fe8b8, emissive: 0x3fd07a, emissiveIntensity: 0.9 }), Math.sin(a) * d, 0.51, -46 + Math.cos(a) * d, g)
      rim.rotation.x = Math.PI / 2; rim.userData.noPick = true; rim.userData.mech = `selTell${i}`
    })
    // the sealed gate: slab of rock between cliff piers, grinds down when the path rings true
    rocks(g, TX.grey, [[-4.6, 3.4, -27, 5, 8, 4, 0], [4.6, 3.6, -27, 5, 8.4, 4, 0]])
    rocks(g, TX.grey, [[0, 8.1, -27, 11, 1.6, 3.6, 0]])
    const slab = mesh(new THREE.BoxGeometry(4.2, 6.4, 0.8), mat(TX.stoneD), 0, 3.2, -27.4, g)
    slab.userData.spot = 'toSelThrone'; slab.userData.mech = 'selPathSlab'
    boulder(g, TX.grey, -6.8, 0.5, -31, 1.1, 0.5); boulder(g, TX.selen, 7.2, 0.6, -30, 1.4, 1.1); boulder(g, TX.grey, 5.4, 0.4, -38, 0.9, 0.2)
    tuft(g, -5.6, 0.04, -36, 1.1, 0x2f6a44); tuft(g, 6.2, 0.04, -41, 1.3, 0x2f6a44)
  },
  selThrone(g) {
    // camera at [0,1.5,-2]: a roofed chamber open to the night through a
    // window arch ahead; the moon stands outside it, the sun only at one
    // turn of the throne. Walls are piers and lintels, never a closed shell,
    // so the arch is a real hole the landmark check can see through.
    const fl = mesh(new THREE.CircleGeometry(6.5, 16), mat(TX.stoneD), 0, 0.02, -2, g); fl.rotation.x = -Math.PI / 2; fl.userData.noPick = true
    mesh(new THREE.BoxGeometry(13, 5.4, 0.8), mat(TX.stoneD), 0, 2.7, -6.4, g).userData.noPick = true // back wall
    for (const sx of [-5.4, 5.4]) mesh(new THREE.BoxGeometry(1.6, 5.4, 9), mat(TX.stoneD), sx, 2.7, -2, g).userData.noPick = true // side walls
    mesh(new THREE.BoxGeometry(13, 1, 9.6), mat(TX.stoneD), 0, 5.9, -2, g).userData.noPick = true // roof
    // the window arch ahead: piers + lintel, opening between them
    mesh(new THREE.BoxGeometry(2, 5.2, 0.7), mat(TX.grey), -3.2, 2.6, 2.6, g).userData.noPick = true
    mesh(new THREE.BoxGeometry(2, 5.2, 0.7), mat(TX.grey), 3.2, 2.6, 2.6, g).userData.noPick = true
    mesh(new THREE.BoxGeometry(8.6, 1.1, 0.7), mat(TX.grey), 0, 4.6, 2.6, g).userData.noPick = true
    const plaque = mesh(new THREE.BoxGeometry(2.6, 0.9, 0.24), mat(TX.brass, { metalness: 0.5 }), 0, 3.6, 2.9, g)
    plaque.userData.spot = 'throneCarving'
    moon(g, -14.5, 2.6, 50, 3.4, 'selMoon', null)
    const sun = mesh(new THREE.SphereGeometry(2.6, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffb84a, emissiveIntensity: 1.1, fog: false }), 14.5, 2.1, 50, g)
    sun.userData.noPick = true; sun.userData.mech = 'selSun'; sun.scale.setScalar(0.02)
    // the throne: bronze collar, stone seat, high back — it swivels on the
    // worn circle of eight notches
    const chair = new THREE.Group()
    mesh(new THREE.CylinderGeometry(0.55, 0.75, 0.9, 10), mat(TX.stoneD), 0, 0.45, 0, chair).userData.spot = 'selChair'
    mesh(new THREE.BoxGeometry(1.1, 0.16, 1.1), mat(TX.stoneD), 0, 0.98, 0, chair).userData.spot = 'selChair'
    const back = mesh(new THREE.BoxGeometry(1.1, 1.5, 0.25), mat(TX.stoneD), 0, 1.8, 0.5, chair); back.userData.landmark = 'selChair'; back.userData.spot = 'selChair'
    mesh(new THREE.TorusGeometry(0.8, 0.09, 6, 16), mat(TX.brass, { metalness: 0.6 }), 0, 1.02, 0, chair).rotation.x = Math.PI / 2
    chair.position.set(0, 0, 0.6)
    chair.userData.mech = 'selChair'
    g.add(chair)
    for (let k = 0; k < 8; k++) { const a = k * 0.7854; const n = mesh(new THREE.BoxGeometry(0.34, 0.06, 0.34), mat(TX.grey, { emissive: 0xffcf7a, emissiveIntensity: 0 }), Math.sin(a) * 1.6, 0.05, 0.6 + Math.cos(a) * 1.6, g); n.userData.noPick = true; n.userData.mech = 'selNotch'; n.userData.notch = k }
    // the high doorway in the right wall, sealed until sun and moon agree
    const door = mesh(new THREE.BoxGeometry(0.8, 3.4, 1.8), mat(TX.stoneD), 4.15, 1.7, -2.2, g)
    door.userData.spot = 'toSelGate'; door.userData.mech = 'selAlignDoor'
    mesh(new THREE.BoxGeometry(0.5, 4.4, 2.6), mat(TX.grey), 5.7, 2.2, -2.2, g).userData.noPick = true
    for (const bx of [-4.3, 4.3]) {
      mesh(new THREE.CylinderGeometry(0.09, 0.16, 1.5, 6), mat(TX.iron, { metalness: 0.6 }), bx, 0.75, 1.5, g).userData.noPick = true
      const bowl = mesh(new THREE.CylinderGeometry(0.34, 0.2, 0.26, 8), mat(TX.brass, { metalness: 0.6 }), bx, 1.6, 1.5, g)
      bowl.userData.noPick = true
      const fl = mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xff9030, emissiveIntensity: 1.6 }), bx, 1.85, 1.5, g)
      fl.userData.flicker = true; fl.userData.noPick = true
      const bt = new THREE.PointLight(0xff9040, 2.2, 9); bt.position.set(bx, 1.95, 1.5); g.add(bt)
      bt.userData.flicker = true
    }
  },
  selGate(g) {
    // camera at [0,4.5,-10] on a cut terrace facing +z: the mountain wall
    // ahead, switchback steps climbing to the right, the door behind
    const floor = mesh(new THREE.BoxGeometry(24, 0.6, 20), mat(TX.grey), 0, 4, -5, g); floor.userData.noPick = true
    const lip = mesh(new THREE.BoxGeometry(24, 0.5, 1), mat(TX.stoneD), 0, 4.55, 5.4, g); lip.userData.noPick = true
    const wall = mesh(new THREE.BoxGeometry(50, 10, 6), mat(TX.selen), 0, 7, 9, g)
    wall.userData.landmark = 'selMountain'; wall.userData.noPick = true
    rocks(g, TX.selen, [[-14, 5.5, 4, 10, 11, 8, 0.2], [15, 6, 3, 9, 12, 7, -0.25], [-20, 9, 7, 8, 8, 6, 0.1]])
    rocks(g, TX.grey, [[-6, 4.5, 5, 7, 7, 5, 0.15], [7, 5, 5, 6, 8, 5, -0.15]])
    moon(g, -22, 24, 26, 7, null, 'lookMoon')
    const glow = new THREE.PointLight(0x9fd8b0, 14, 70); glow.position.set(0, 12, 4); g.add(glow)
    const moss = mesh(new THREE.BoxGeometry(23.4, 0.14, 19.4), mat(TX.selen), 0, 4.36, -5, g); moss.userData.noPick = true
    // the switchback steps, cut against the grey rock at the right of the terrace
    const steps = new THREE.Group()
    for (let i = 0; i < 7; i++) mesh(new THREE.BoxGeometry(2.4, 0.55 + i * 0.3, 1.5), mat(TX.stoneD), 5.6 + (i % 2) * 1.5, 4.6 + i * 0.55, -3 + Math.floor(i / 2) * 2.1, steps)
    steps.children[steps.children.length - 1].userData.spot = 'upTop'
    g.add(steps)
    // the doorway you came through, back in the rock behind you
    mesh(new THREE.BoxGeometry(3.4, 4.6, 0.8), mat(TX.grey), 0, 6.6, -14.6, g).userData.noPick = true
    const door = mesh(new THREE.BoxGeometry(2.2, 3.4, 0.5), mat(TX.stoneD), 0, 6.2, -14.2, g)
    door.userData.spot = 'backThrone'
    mesh(new THREE.CylinderGeometry(0.3, 0.34, 3, 7), mat(TX.wood), -8, 4.65, 0, g).rotation.z = 1.5
    boulder(g, TX.selen, -9.5, 4.9, 3, 1.4, 0.4); boulder(g, TX.grey, 9.8, 5.1, -8, 1.2, 1)
    tuft(g, -7.5, 4.44, -4, 1.3, 0x2f6a44); tuft(g, -6.5, 4.44, -8, 1, 0x2f6a44); tuft(g, 8.8, 4.44, 1, 1.2, 0x2f6a44)
  },
  selTop(g) {
    // camera at [0,9.5,-6] on the summit ledge facing +z: the rock wall with
    // the gear dead ahead, the moon huge off the right shoulder, drop behind
    const floor = mesh(new THREE.BoxGeometry(14, 0.6, 12), mat(TX.grey), 0, 9, -6, g); floor.userData.noPick = true
    const wall = mesh(new THREE.BoxGeometry(12, 8, 2), mat(TX.selen), 0, 13, 2.5, g); wall.userData.noPick = true
    rocks(g, TX.selen, [[-7.5, 9, 2, 4, 7, 5, 0.2], [7.6, 8.5, 2.5, 4, 7, 5, -0.2]])
    for (let k = 0; k < 7; k++) mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1), mat(TX.brass, { metalness: 0.7 }), -6 + k * 2, 9.85, -11.4, g).userData.noPick = true
    mesh(new THREE.TorusGeometry(6.4, 0.07, 6, 20, Math.PI), mat(TX.brass, { metalness: 0.7 }), 0, 10.4, -11.4, g).userData.noPick = true
    moon(g, 30, 17, 26, 8, null, 'lookMoon')
    const glow2 = new THREE.PointLight(0xbfe8cc, 12, 60); glow2.position.set(4, 12, -2); g.add(glow2)
    const moss2 = mesh(new THREE.BoxGeometry(13.4, 0.14, 11.4), mat(TX.selen), 0, 9.31, -6, g); moss2.userData.noPick = true
    // the gear, brass against green-black rock, riding its sun-and-moon slot —
    // everything mounted at z descending toward the camera so nothing buries
    // the pickable torus behind its own backing slab
    const slot = mesh(new THREE.BoxGeometry(2.6, 2.6, 0.4), mat(TX.stoneD), 0, 10.6, 1.4, g); slot.userData.noPick = true
    const gearW = gear(g, TX.brass, 0.95, 0, 10.6, 1.05, 0)
    gearW.userData.spot = 'takeGear'; gearW.userData.landmark = 'selGear'; gearW.userData.mech = 'selGear'; gearW.userData.noPick = false
    g.children[g.children.length - 1].userData.mech = 'selGear'
    g.children[g.children.length - 1].userData.landmark = 'selGear'
    for (const p of [[-0.9, 10.2], [0.9, 10.2], [-0.9, 11], [0.9, 11]]) mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), mat(TX.brass, { metalness: 0.6 }), p[0], p[1], 1.3, g).userData.noPick = true
    // the worn steps back down, over the lip behind the camera
    const steps = new THREE.Group()
    for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(2.4, 0.5, 1.3), mat(TX.stoneD), (i % 2) * 1.4, 9 - i * 0.55, -12.5 - i * 1.0, steps)
    steps.children[0].userData.spot = 'downGate'
    g.add(steps)
    boulder(g, TX.selen, -5.6, 9.7, -2, 1.1, 0.5); boulder(g, TX.grey, 5.8, 9.5, -4, 0.8, 1.2); boulder(g, TX.selen, 4.6, 9.6, 0.5, 0.9, 0.3)
    tuft(g, -4.6, 9.38, -8, 1.2, 0x2f6a44); tuft(g, 3.6, 9.38, -9.5, 1, 0x2f6a44)
  },
  stoneship(g) {
    const ground = mesh(new THREE.CircleGeometry(70, 26), mat(TX.grey), 0, -0.05, 0, g); ground.rotation.x = -Math.PI / 2
    seaPlane(g, 0.02, 500, 0.9)
    // a low grey ridge: the observatory sits on top and is the island's clear landmark
    rocks(g, TX.grey, [[0, 2, -14, 14, 4, 8, 0], [-10, 2, -8, 6, 4, 4, 0.4], [11, 2.4, -9, 5, 5, 4, -0.5]])
    const tower = mesh(new THREE.CylinderGeometry(1.8, 2.2, 3.8, 12), mat(TX.grey), 0, 5.9, -14, g)
    tower.userData.landmark = 'observatory'
    const dome = mesh(new THREE.SphereGeometry(2.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(TX.grey), 0, 7.8, -14, g)
    dome.userData.landmark = 'observatory'
    for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(0.6, 0.3, 1.6), mat(TX.plank), -2 + i * 1.2, 0.2, -4 + i * 0.9, g)
    crate(g, -3.4, 0.3, -1.4, 1, 0.4); barrel(g, 3.2, 0.4, -2, 0.8); crate(g, 4.4, 0.28, 0.4, 0.8, 1.1)
    lantern(g, -4.6, 0, -2.8)
    boulder(g, TX.grey, -13.5, 0.9, -4, 1.3, 0.7); boulder(g, TX.grey, 13.8, 1.1, -3, 1.5, 0.2)
    tuft(g, -8, 0.04, -2, 1.2); tuft(g, 8, 0.04, -1, 1)
  },
  stoneDeck(g) {
    // the becalmed ship on its rock shelf, seen from the quarterdeck: the mast is the landmark
    const rock = mesh(new THREE.CircleGeometry(46, 24), mat(TX.grey), 0, -0.05, -10, g); rock.rotation.x = -Math.PI / 2
    seaPlane(g, 0.02, 400, 0.9)
    rocks(g, TX.grey, [[0, 1.4, -16, 18, 3, 5, 0], [-11, 1.2, -4, 6, 3, 4, 0.3], [12, 1.5, -5, 5, 3.5, 4, -0.4]])
    const ship = new THREE.Group()
    const hull = mesh(new THREE.BoxGeometry(3.2, 2.4, 11), mat(TX.plank, { roughness: 0.85 }), 0, 0, 0, ship)
    hull.userData.noPick = true
    const bow = mesh(new THREE.ConeGeometry(1.6, 3.2, 4), mat(TX.plank, { roughness: 0.85 }), 0, 0, 7, ship)
    bow.rotation.x = Math.PI / 2; bow.rotation.z = Math.PI / 4; bow.userData.noPick = true
    const deckF = mesh(new THREE.BoxGeometry(3.0, 0.2, 10.6), mat(TX.plank, { roughness: 0.9 }), 0, 1.3, 0, ship); deckF.userData.noPick = true
    const castle = mesh(new THREE.BoxGeometry(2.6, 1.3, 2.2), mat(TX.plank, { roughness: 0.85 }), 0, 2.0, -3.6, ship); castle.userData.noPick = true
    const mast = mesh(new THREE.CylinderGeometry(0.16, 0.22, 9, 8), mat(TX.wood), 0, 5.6, 0.4, ship)
    mast.userData.landmark = 'shipMast'
    const yard = mesh(new THREE.BoxGeometry(4.6, 0.16, 0.16), mat(TX.wood), 0, 8.2, 0.4, ship); yard.userData.landmark = 'shipMast'; yard.userData.noPick = true
    const yard2 = mesh(new THREE.BoxGeometry(3.2, 0.14, 0.14), mat(TX.wood), 0, 6.4, 0.4, ship); yard2.userData.landmark = 'shipMast'; yard2.userData.noPick = true
    ship.position.set(0, 2.0, 2)
    g.add(ship)
    for (const [px, pz] of [[-1.3, 4.4], [1.3, 4.4]]) mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4), mat(TX.wood), px, 3.6, pz, g).userData.noPick = true
    crate(g, -3.6, 2.7, 0.4, 1, 0.3); barrel(g, 3.1, 2.8, -1, 0.8); crate(g, -2.6, 2.6, -2.6, 0.8, 0.9)
    lantern(g, 2.4, 2.4, 2.4)
    boulder(g, TX.grey, -6.5, 1.4, -8, 1.4, 0.5); boulder(g, TX.grey, 7, 1.6, -7, 1.5, 1.2)
  },
  stoneObservatory(g) {
    // the dome on the ridge, reached by the rock stair off the ship's stern
    const ledge = mesh(new THREE.CircleGeometry(34, 22), mat(TX.grey), 0, 5.1, -4, g); ledge.rotation.x = -Math.PI / 2
    seaPlane(g, -1.5, 360, 0.9)
    rocks(g, TX.grey, [[0, 3, -16, 20, 5, 6, 0], [-12, 4, -6, 7, 4, 5, 0.4], [12, 3.4, -7, 6, 5, 5, -0.5]])
    const drum = mesh(new THREE.CylinderGeometry(2.2, 2.6, 3.8, 14), mat(TX.grey), 0, 7.2, 3, g)
    drum.userData.landmark = 'observatory'
    const cupola = mesh(new THREE.SphereGeometry(2.0, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(TX.grey), 0, 9.2, 3, g)
    cupola.userData.spot = 'observatory'; cupola.userData.landmark = 'observatory'
    const slit = mesh(new THREE.BoxGeometry(0.7, 1.6, 0.4), mat(TX.grey, { color: 0x3a4048 }), 0, 9.7, 1.6, g); slit.userData.noPick = true
    for (let k = 0; k < 9; k++) {
      const a = k * (Math.PI / 8) - Math.PI / 2
      mesh(new THREE.BoxGeometry(0.5, 1, 0.5), mat(TX.grey), Math.sin(a) * 9.5, 5.6, -4 + Math.cos(a) * 9.5, g).userData.noPick = true
    }
    boulder(g, TX.grey, -9, 5.6, -2, 1.4, 0.6); boulder(g, TX.grey, 9.4, 5.6, -3, 1.5, 1.1)
  },
  rocketSilo(g) {
    // #1010 — the rocket, standing in its shaft under the cliff. The floor is
    // a ring, not a disc: the exhaust has to have somewhere to go. The shaft
    // is a tall open-backed drum of dusk rock, roofless, so the ride climbs
    // from stone into sky.
    const fl = mesh(new THREE.RingGeometry(2.3, 12, 22), mat(TX.rock), 0, 0.02, 2, g); fl.rotation.x = -Math.PI / 2; fl.userData.noPick = true
    const shell = mesh(new THREE.CylinderGeometry(12, 13, 46, 16, 1, true), mat(TX.strata, { side: THREE.BackSide }), 0, 23, 2, g); shell.userData.noPick = true
    rocks(g, TX.rock, [[-9.5, 1.6, 6, 5, 3.2, 5, 0.3], [10, 1.9, 5, 5, 3.8, 5, -0.2], [-8, 1.2, -3, 4, 2.4, 4, 0.6], [9, 1.4, -4, 4, 2.8, 4, -0.5]])
    for (const ry of [-4, 1.2, 6.4]) mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), mat(TX.stoneD), -10.6, 0.6 + ry * 0.2, 2 + ry, g).userData.noPick = true
    // the pad ring
    const pad = mesh(new THREE.TorusGeometry(2.2, 0.14, 8, 22), mat(TX.iron, { metalness: 0.6 }), 0, 0.14, 8, g); pad.rotation.x = Math.PI / 2; pad.userData.noPick = true
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.1), mat(TX.iron, { metalness: 0.6 }), Math.sin(a) * 2, 0.55, 8 + Math.cos(a) * 2, g).userData.noPick = true }
    // the rocket: riveted silver, grey fins, brass bands, one wide porthole
    const rocket = new THREE.Group()
    // riveted silver must READ against dusk rock — a dark iron map under dusk
    // light came out black-on-black, so the hull is a lighter alloy: color
    // without the dark map, plus a soft self-glow and an ACES-friendly finish
    const silver = new THREE.MeshStandardMaterial({ color: 0xcfd6df, metalness: 0.15, roughness: 0.5, emissive: 0x4a5262, emissiveIntensity: 0.6 })
    const body = mesh(new THREE.CylinderGeometry(0.95, 1.1, 5.2, 14), silver, 0, 3.6, 0, rocket)
    body.userData.landmark = 'rocket'; body.userData.noPick = true
    const nose = mesh(new THREE.ConeGeometry(0.95, 2.1, 14), silver, 0, 7.25, 0, rocket)
    nose.userData.landmark = 'rocket'; nose.userData.noPick = true
    for (const by of [2.1, 4.6]) mesh(new THREE.TorusGeometry(1.02 - (by - 2.1) * 0.02, 0.06, 6, 16), mat(TX.brass, { metalness: 0.7 }), 0, by, 0, rocket).rotation.x = Math.PI / 2
    for (let k = 0; k < 3; k++) {
      const a = k * 2.094
      const fin = mesh(new THREE.BoxGeometry(0.14, 1.6, 1.15), mat(TX.grey), Math.sin(a) * 1.15, 1.0, Math.cos(a) * 1.15, rocket)
      fin.rotation.y = a; fin.rotation.x = 0.28; fin.userData.noPick = true
    }
    const port = mesh(new THREE.CircleGeometry(0.42, 14), new THREE.MeshStandardMaterial({ color: 0x9fd0e8, emissive: 0x3a7a9a, emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.1 }), 0, 4.4, -1.02, rocket)
    port.rotation.y = Math.PI
    port.userData.noPick = true; port.userData.porthole = true
    mesh(new THREE.TorusGeometry(0.46, 0.05, 6, 14), mat(TX.brass, { metalness: 0.7 }), 0, 4.4, -1.05, rocket).userData.noPick = true
    const saddle = mesh(new THREE.BoxGeometry(0.7, 0.24, 0.9), mat(TX.wood, { color: 0x6a4a30 }), 0, 1.55, -1.15, rocket)
    saddle.userData.spot = 'boardRocket'; saddle.userData.landmark = 'rocket'
    const flame = mesh(new THREE.ConeGeometry(0.8, 3.4, 10), new THREE.MeshStandardMaterial({ color: 0xffd8a0, emissive: 0xff8a30, emissiveIntensity: 1.8, transparent: true, opacity: 0.9, fog: false }), 0, -1.5, 0, rocket)
    flame.userData.noPick = true; flame.userData.mech = 'rocketFlame'; flame.scale.setScalar(0.001)
    rocket.position.set(0, 0.55, 8)
    rocket.userData.mech = 'rocketBody'
    g.add(rocket)
    // the silver carries its own glow; a big warm work-light painted a blazing
    // pool on the shaft floor, which read as lava, not industry
    // the ignition console on the pad edge
    mesh(new THREE.BoxGeometry(0.5, 1.2, 0.4), mat(TX.iron, { metalness: 0.6 }), -2.4, 0.6, 5.6, g)
    const ign = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0xc43a2a, emissive: 0x7a160c, roughness: 0.4 }), -2.4, 1.28, 5.45, g)
    ign.rotation.x = Math.PI / 2.4; ign.userData.spot = 'igniteSwitch'
    mesh(new THREE.BoxGeometry(0.34, 0.06, 0.26), mat(TX.brass, { metalness: 0.7 }), -2.4, 1.42, 5.5, g).rotation.x = -0.7
    // the stars you meet on the way up — invisible in the silo, thickening as
    // the sky runs out of dusk
    const pts = []
    for (let i = 0; i < 160; i++) { const a = i * 2.399, r = 14 + 30 * Math.sqrt(i / 160); pts.push(Math.sin(a) * r, 40 + i * 1.7 + (i % 7) * 4, 2 + Math.cos(a) * r) }
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.PointsMaterial({ color: 0xdfe8ff, size: 0.5, transparent: true, opacity: 0, fog: false }))
    stars.userData.mech = 'rideStars'; stars.userData.noPick = true
    g.add(stars)
    crate(g, 3.6, 0.3, 3.4, 1, 0.4); barrel(g, -3.8, 0.4, 2.2, 0.8); crate(g, 4.4, 0.28, 0.8, 0.8, 1.2)
    lantern(g, 4.8, 0, -1.6)
  },
  mechanical(g) {
    const ground = mesh(new THREE.CircleGeometry(60, 24), mat(TX.mech, { metalness: 0.3, roughness: 0.6 }), 0, 0, 0, g); ground.rotation.x = -Math.PI / 2
    for (const [r, x, z, sp] of [[3, -9, -9, 0.5], [2, 11, -12, -0.8], [1.4, 14, -4, 1.2], [2.2, -12, 2, -0.4]]) gear(g, TX.mech, r, x, 1.5, z, sp)
    // the tower itself: a bronze drum with a waterfall running its west face
    const tower = mesh(new THREE.CylinderGeometry(7.5, 9, 34, 18), mat(TX.mech, { metalness: 0.45, roughness: 0.5 }), 2, 17, 34, g)
    tower.userData.noPick = true
    gear(g, TX.mech, 3.4, 2, 9, 24.6, 0.22)
    gear(g, TX.mech, 2.2, 6.6, 12.5, 25.4, -0.34)
    const fall = mesh(new THREE.PlaneGeometry(4, 16), new THREE.MeshStandardMaterial({ map: TX.sea, transparent: true, opacity: 0.7, side: THREE.DoubleSide }), -5.4, 12, 27.5, g)
    fall.rotation.y = -0.5; fall.userData.fall = true
    // the linking book on its bronze pedestal — the way home
    const ped = mesh(new THREE.CylinderGeometry(0.55, 0.8, 1.15, 10), mat(TX.brass, { metalness: 0.6 }), 0, 0.57, -6.2, g)
    ped.userData.landmark = 'mechBookStand'
    const bk = mesh(new THREE.BoxGeometry(0.95, 0.14, 0.66), mat(TX.pageB), 0, 1.25, -6.2, g)
    bk.rotation.set(-0.45, 0.4, 0); bk.userData.spot = 'retMechanical'; bk.userData.landmark = 'mechBookStand'
    for (const [px, pz] of [[-1.1, -5.2], [1.1, -5.2]]) mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9), mat(TX.brass, { metalness: 0.6 }), px, 0.9, pz, g).userData.spot = 'matchbook'
    const vent = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10), mat(TX.iron), -4.4, 0.2, 2.6, g)
    vent.userData.spot = 'pageMechanicalBlue'
    const steam = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-4.4, 0.6, 2.6, -4.2, 1.2, 2.7, -4.5, 1.8, 2.5, -4.3, 2.4, 2.6], 3)), new THREE.PointsMaterial({ color: 0xcfd2d8, size: 0.5, transparent: true, opacity: 0.5 }))
    steam.userData.steam = true; g.add(steam)
    for (const [px, pz, pl] of [[9, -2, 7], [-8.5, -4, 6], [11, 8, 5]]) {
      const pipe = mesh(new THREE.CylinderGeometry(0.26, 0.26, pl, 8), mat(TX.mech, { metalness: 0.55, roughness: 0.5 }), px, 0.26, pz, g)
      pipe.rotation.x = Math.PI / 2; pipe.userData.noPick = true
      mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 10), mat(TX.iron, { metalness: 0.6 }), px, 0.26, pz - pl / 2 + 0.3, g).rotation.y = Math.PI / 2
    }
    crate(g, -6.5, 0.35, -2, 1.1, 0.5); barrel(g, 7.4, 0.45, 4.4, 0.9)
  },
  mechWalk(g) {
    const ground = mesh(new THREE.CircleGeometry(40, 22), mat(TX.mech, { metalness: 0.3, roughness: 0.6 }), 0, 0, 0, g); ground.rotation.x = -Math.PI / 2
    // the tower face close at hand: angled bronze slabs rather than a full drum,
    // so the view keeps sky over the shoulder of the machine
    const wL = mesh(new THREE.BoxGeometry(9, 15, 2.4), mat(TX.mech, { metalness: 0.45, roughness: 0.5 }), -5.6, 7.5, 11.5, g)
    wL.rotation.y = -0.45; wL.userData.noPick = true
    const wR = mesh(new THREE.BoxGeometry(9, 15, 2.4), mat(TX.mech, { metalness: 0.45, roughness: 0.5 }), 5.6, 7.5, 11.5, g)
    wR.rotation.y = 0.45; wR.userData.noPick = true
    const wC = mesh(new THREE.BoxGeometry(8, 12, 2.4), mat(TX.mech, { metalness: 0.45, roughness: 0.5 }), 0, 6, 10.8, g)
    wC.userData.noPick = true
    gear(g, TX.mech, 3.2, -4.2, 5.5, 8.4, 0.3)
    gear(g, TX.mech, 1.8, -1.2, 8.4, 8.8, -0.53)
    gear(g, TX.mech, 2.4, 4.8, 3.4, 8.6, 0.4)
    // the cage, riding its rails: hangs high until the call lever brings it down
    const cage = new THREE.Group()
    for (const cx of [-0.9, 0.9]) for (const cz of [-0.9, 0.9]) mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2), mat(TX.brass, { metalness: 0.7 }), cx, 1.1, cz, cage)
    for (const cy of [0.05, 2.15]) for (const cx of [-0.9, 0.9]) mesh(new THREE.BoxGeometry(0.08, 0.08, 1.9), mat(TX.brass, { metalness: 0.7 }), cx, cy, 0, cage)
    const cf = mesh(new THREE.BoxGeometry(1.9, 0.12, 1.9), mat(TX.iron, { metalness: 0.5 }), 0, 0, 0, cage); cf.userData.spot = 'boardCar'
    cage.position.set(4.4, 15, 9.2)
    cage.userData.mech = 'cageWalk'
    g.add(cage)
    for (const ry of [-9, -6, -3, 0]) mesh(new THREE.BoxGeometry(0.12, 0.12, 1.2), mat(TX.brass, { metalness: 0.6 }), 5.6, ry + 15.6 - 15, 8, g).userData.noPick = true
    // the call lever, bolted beside the shaft
    const post = mesh(new THREE.BoxGeometry(0.3, 1.9, 0.3), mat(TX.iron, { metalness: 0.6 }), 5.6, 0.95, 5.6, g)
    post.userData.landmark = 'mechCallLever'
    const lv = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5), mat(TX.brass, { metalness: 0.7 }), 5.6, 1.6, 5.2, g)
    lv.rotation.x = 0.55; lv.userData.spot = 'mechCall'; lv.userData.landmark = 'mechCallLever'
    // the switch panel that governs the gear chain
    const panel = mesh(new THREE.BoxGeometry(2, 1.4, 0.2), mat(TX.iron, { metalness: 0.6 }), -4.6, 1.4, 6.2, g)
    panel.rotation.y = -0.5; panel.userData.spot = 'switchPanel'; panel.userData.landmark = 'mechCallLever'
    for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), mat(TX.iron, { metalness: 0.7 }), -4.6 - 0.7 * Math.cos(0.5) + i * 0.35 * Math.cos(0.5), 1.6, 6.2 - 0.7 * Math.sin(0.5) + i * 0.35 * Math.sin(0.5), g).userData.spot = 'switchPanel'
    for (const [px, pz, pl] of [[-8.5, -2, 6], [8.8, 2, 7]]) {
      const pipe = mesh(new THREE.CylinderGeometry(0.24, 0.24, pl, 8), mat(TX.mech, { metalness: 0.55, roughness: 0.5 }), px, 0.24, pz, g)
      pipe.rotation.x = Math.PI / 2; pipe.userData.noPick = true
      mesh(new THREE.TorusGeometry(0.28, 0.05, 6, 10), mat(TX.iron, { metalness: 0.6 }), px, 0.24, pz + pl / 2 - 0.3, g).rotation.y = Math.PI / 2
    }
    barrel(g, 8.4, 0.45, -6, 0.7); crate(g, -8, 0.32, 4.5, 1, 0.8)
    const valve = mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 12), mat(TX.brass, { metalness: 0.7 }), -2.4, 0.7, 7.8, g)
    valve.rotation.x = 1.3; valve.userData.spin = 0.15; valve.userData.noPick = true
  },
  mechCar(g) {
    const grate = mesh(new THREE.CircleGeometry(1.5, 14), mat(TX.iron, { metalness: 0.5, roughness: 0.4 }), 0, 0.02, -6.4, g)
    grate.rotation.x = -Math.PI / 2; grate.userData.spot = 'cageOut'; grate.userData.landmark = 'mechCageGrate'
    // the cage around the player: thin bars, all round, open at the gantry side
    for (let k = 0; k < 14; k++) {
      const a = k * (Math.PI * 2 / 14)
      if (Math.abs(Math.cos(a) + 1) < 0.35) continue
      mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.2), mat(TX.brass, { metalness: 0.7 }), Math.sin(a) * 1.5, 1.1, -6.4 + Math.cos(a) * 1.5, g).userData.noPick = true
    }
    mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.1, 14), mat(TX.brass, { metalness: 0.7 }), 0, 2.25, -6.4, g).userData.noPick = true
    // rails dropping away, and the gear wall sliding past as the cage climbs
    for (const rz of [12, 18, 26]) for (const rx of [-1.6, 1.6]) mesh(new THREE.BoxGeometry(0.14, 30, 0.14), mat(TX.brass, { metalness: 0.6 }), rx, 4, rz - 6.4, g).userData.noPick = true
    gear(g, TX.mech, 2.6, -3.6, 2.6, 5.6, 0.6)
    gear(g, TX.mech, 1.6, 3.2, 5.5, 7.6, -0.9)
    const pull = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4), mat(TX.iron, { metalness: 0.6 }), 0, 1.2, 1.2, g)
    pull.userData.spot = 'cageRaise'; pull.userData.landmark = 'mechCageGrate'
    mesh(new THREE.SphereGeometry(0.12, 8, 8), mat(TX.brass, { metalness: 0.7 }), 0, 1.9, 1.2, g).userData.spot = 'cageDescend'
  },
  mechTop(g) {
    const floor = mesh(new THREE.CircleGeometry(9, 20), mat(TX.iron, { metalness: 0.4, roughness: 0.5 }), 0, 0.02, -6, g); floor.rotation.x = -Math.PI / 2
    floor.userData.noPick = true
    // the gantry railing over the drop
    for (let k = 0; k < 16; k++) {
      const a = k * (Math.PI * 2 / 16)
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1), mat(TX.brass, { metalness: 0.7 }), Math.sin(a) * 8.4, 0.55, -6 + Math.cos(a) * 8.4, g).userData.noPick = true
    }
    const rail = mesh(new THREE.TorusGeometry(8.4, 0.07, 6, 28), mat(TX.brass, { metalness: 0.7 }), 0, 1.08, -6, g)
    rail.rotation.x = Math.PI / 2; rail.userData.noPick = true
    const warm = new THREE.PointLight(0xffb060, 3.2, 26); warm.position.set(0, 3.2, 12); g.add(warm)
    // the steel control-room door in its bronze frame
    const frame = mesh(new THREE.BoxGeometry(2.4, 3.2, 0.5), mat(TX.brass, { metalness: 0.55 }), 0, 1.6, 14.4, g)
    frame.userData.noPick = true
    const door = mesh(new THREE.BoxGeometry(1.8, 2.7, 0.18), mat(TX.iron, { metalness: 0.65, roughness: 0.35 }), 0, 1.4, 14.1, g)
    door.userData.spot = 'mechDoorBtn'; door.userData.landmark = 'mechDoorSteel'; door.userData.mech = 'doorTop'
    const btn = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0xc43a2a, emissive: 0x7a160c, roughness: 0.4 }), 1.35, 1.5, 14.1, g)
    btn.rotation.x = Math.PI / 2; btn.userData.spot = 'mechDoorBtn'; btn.userData.landmark = 'mechDoorSteel'
    // the send-down lever, and the cage when it is at the landing
    mesh(new THREE.BoxGeometry(0.3, 1.8, 0.3), mat(TX.iron, { metalness: 0.6 }), -3.4, 0.9, 13.6, g)
    const lv = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4), mat(TX.brass, { metalness: 0.7 }), -3.4, 1.5, 13.2, g)
    lv.rotation.x = 0.5; lv.userData.spot = 'mechSendDown'; lv.userData.landmark = 'mechDoorSteel'
    const cage = new THREE.Group()
    for (const cx of [-0.9, 0.9]) for (const cz of [-0.9, 0.9]) mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2), mat(TX.brass, { metalness: 0.7 }), cx, 1.1, cz, cage)
    mesh(new THREE.BoxGeometry(1.9, 0.12, 1.9), mat(TX.iron, { metalness: 0.5 }), 0, 0, 0, cage).userData.spot = 'cageBoardTop'
    cage.position.set(-5.6, 0.1, 11.4)
    cage.userData.mech = 'cageTop'
    g.add(cage)
    // the gear-sealed alcove: the great gear only rolls aside when the chain is lit
    const seal = mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.5, 12), mat(TX.mech, { metalness: 0.5, roughness: 0.45 }), 6.2, 1.2, 10.6, g)
    seal.rotation.x = Math.PI / 2; seal.userData.spinSealed = 0.5; seal.userData.noPick = true; seal.userData.mech = 'topGear'
    mesh(new THREE.BoxGeometry(1.6, 1.4, 0.4), mat(TX.iron), 6.4, 0.7, 12.4, g).userData.noPick = true
    const spool = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 10), mat(TX.wood), -7.4, 0.55, 2.4, g)
    spool.rotation.z = Math.PI / 2; spool.userData.noPick = true
    mesh(new THREE.TorusGeometry(0.5, 0.04, 6, 14), mat(TX.brass, { metalness: 0.6 }), -7.15, 0.55, 2.4, g).rotation.y = Math.PI / 2
    crate(g, 7.6, 0.3, 5.2, 0.9, 0.6)
  },
  mechRoom(g) {
    const shell = mesh(new THREE.CylinderGeometry(5.4, 5.4, 4.6, 16, 1, true), mat(TX.mech, { side: THREE.BackSide, metalness: 0.4 }), 0, 2.3, 0, g)
    shell.userData.noPick = true
    const fl = mesh(new THREE.CircleGeometry(5.4, 16), mat(TX.iron, { metalness: 0.4 }), 0, 0.02, 0, g); fl.rotation.x = -Math.PI / 2
    fl.userData.noPick = true
    // the door you came through, hanging open or shut with the latch
    const door = mesh(new THREE.BoxGeometry(1.8, 2.7, 0.18), mat(TX.iron, { metalness: 0.65, roughness: 0.35 }), 0, 1.4, 5.0, g)
    door.userData.spot = 'exitRoom'; door.userData.mech = 'doorTop'
    // the two floor plates and the latch lever between them
    const pd = mesh(new THREE.BoxGeometry(1.1, 0.12, 1.1), mat(TX.brass, { metalness: 0.6 }), -1.7, 0.08, 2.6, g)
    pd.userData.spot = 'stepPlateD'; pd.userData.mech = 'plateD'
    const pe = mesh(new THREE.BoxGeometry(1.1, 0.12, 1.1), mat(TX.brass, { metalness: 0.6 }), 1.7, 0.08, 2.6, g)
    pe.userData.spot = 'stepPlateE'; pe.userData.mech = 'plateE'
    const latch = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2), mat(TX.iron, { metalness: 0.7 }), 0, 0.9, 2.6, g)
    latch.userData.spot = 'mechLatch'; latch.userData.mech = 'latch'; latch.userData.landmark = 'mechSpectator'
    mesh(new THREE.BoxGeometry(0.24, 0.5, 0.24), mat(TX.iron, { metalness: 0.6 }), 0, 0.25, 2.6, g)
    // the SPECTATOR: a glass sphere on a bronze cradle, slow light turning inside
    const cradle = mesh(new THREE.CylinderGeometry(0.5, 0.9, 1.1, 10), mat(TX.brass, { metalness: 0.6 }), 0, 0.55, -4.4, g)
    cradle.userData.noPick = true
    const sph = mesh(new THREE.SphereGeometry(1.3, 22, 18), new THREE.MeshStandardMaterial({ color: 0x9fb6c8, metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.75 }), 0, 2.05, -4.4, g)
    sph.userData.spot = 'spectator'; sph.userData.landmark = 'mechSpectator'
    const core = mesh(new THREE.SphereGeometry(0.5, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xd98a2a, emissiveIntensity: 0.9 }), 0, 2.05, -4.4, g)
    core.userData.spinY = 0.25; core.userData.noPick = true
    const glow = new THREE.PointLight(0xffc878, 4, 12); glow.position.set(0, 2.4, -4.2); g.add(glow)
    glow.userData.flicker = true
    // the cage shaft window: watch the cage answer the shaft plate
    const win = mesh(new THREE.BoxGeometry(1.6, 2.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x1a1420, roughness: 0.9 }), 3.6, 1.6, -3.8, g)
    win.rotation.y = -0.6; win.userData.noPick = true
    const wcage = mesh(new THREE.BoxGeometry(1.3, 1.8, 0.1), mat(TX.brass, { metalness: 0.6 }), 3.6, -1.4, -3.8, g)
    wcage.rotation.y = -0.6; wcage.userData.mech = 'cageShaft'; wcage.userData.noPick = true
    const rpipe = mesh(new THREE.CylinderGeometry(0.14, 0.14, 4.4, 8), mat(TX.mech, { metalness: 0.5 }), -3.6, 0.16, -1.5, g)
    rpipe.rotation.z = Math.PI / 2; rpipe.userData.noPick = true
    crate(g, -3.9, 0.3, -2.6, 0.7, 0.9); barrel(g, 3.2, 0.38, 1.6, 0.5)
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
    star.userData.mech = 'starWheel'
    star.userData.spot = 'starWheel'
    g.add(star)
    mesh(new THREE.BoxGeometry(0.7, 4.0, 0.7), mat(TX.grey), 0, 2, -16, g)
    for (const [lx, lz, lr] of [[-7, -4, 3.4], [7.5, 2, 2.8], [-5, 7, 2.4]]) {
      const log = mesh(new THREE.CylinderGeometry(0.24, 0.28, lr, 7), mat(TX.wood), lx, 0.12, lz, g)
      log.rotation.z = Math.PI / 2; log.rotation.y = lr; log.userData.noPick = true
    }
    tuft(g, -8.5, 0.06, 4, 1.3, 0x2f6a44); tuft(g, 8.6, 0.06, -6, 1.2, 0x2f6a44); tuft(g, 6, 0.06, 6, 1, 0x2f6a44)
    boulder(g, TX.chand, -10, 0.8, -8, 1.4, 0.6); boulder(g, TX.chand, 11, 0.6, 8, 1.2, 1.3)
  },
  chanChannels(g) {
    const ground = mesh(new THREE.CircleGeometry(45, 22), mat(TX.chand), 0, 0, -40, g); ground.rotation.x = -Math.PI / 2
    seaPlane(g, 0.02, 200, 0.7)
    // three cut channels running toward the sluice; water rides them when flooded
    for (const cx of [-5.4, 0, 5.4]) {
      const lipL = mesh(new THREE.BoxGeometry(0.5, 0.9, 12), mat(TX.grey), cx - 1.5, 0.45, -30, g); lipL.userData.noPick = true
      const lipR = mesh(new THREE.BoxGeometry(0.5, 0.9, 12), mat(TX.grey), cx + 1.5, 0.45, -30, g); lipR.userData.noPick = true
      const wtr = mesh(new THREE.PlaneGeometry(2.6, 11.6), new THREE.MeshStandardMaterial({ map: TX.sea, transparent: true, opacity: 0.6, side: THREE.DoubleSide, roughness: 0.15 }), cx, 0.12, -30, g)
      wtr.rotation.x = -Math.PI / 2; wtr.userData.noPick = true; wtr.userData.mech = 'chanWater'
    }
    // the sluice wall across the head of the channels: the gate drops to flood them
    const wall = mesh(new THREE.BoxGeometry(24, 5, 1.4), mat(TX.grey), 0, 2.5, -23.4, g); wall.userData.noPick = true
    const gate = mesh(new THREE.BoxGeometry(7.6, 4.4, 0.5), mat(TX.wood, { roughness: 0.8 }), 0, 4.6, -23.2, g)
    gate.userData.landmark = 'chanSluice'; gate.userData.mech = 'chanSluice'; gate.userData.noPick = true
    const overfall = mesh(new THREE.PlaneGeometry(7, 4.2, 1, 10), new THREE.MeshStandardMaterial({ map: TX.sea, transparent: true, opacity: 0.7, side: THREE.DoubleSide }), 0, 2.2, -22.6, g)
    overfall.userData.fall = true; overfall.userData.noPick = true
    // the float at the head of the centre channel: mud-bound until the water rises
    const raft = new THREE.Group()
    for (const px of [-0.9, -0.3, 0.3, 0.9]) mesh(new THREE.BoxGeometry(0.34, 0.14, 2.4), mat(TX.plank), px, 0, 0, raft)
    const post = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2), mat(TX.wood), 0, 0.6, -1.1, raft); post.userData.noPick = true
    raft.position.set(0, 0.14, -25.6); raft.userData.mech = 'chanFloat'; raft.userData.spot = 'boardRaft'
    g.add(raft)
    // the flood lever, iron against the channel wall
    mesh(new THREE.BoxGeometry(0.32, 2, 0.32), mat(TX.iron, { metalness: 0.6 }), -2.2, 1, -34.6, g).userData.landmark = 'chanSluice'
    const lv = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5), mat(TX.iron, { metalness: 0.7 }), -2.2, 1.7, -35.1, g)
    lv.rotation.x = 0.6; lv.userData.spot = 'chanFlood'; lv.userData.landmark = 'chanSluice'
    // the wood bridge the blue page rests on
    const bridge = mesh(new THREE.BoxGeometry(7, 0.28, 1.3), mat(TX.plank), 3.4, 0.75, -33.5, g)
    bridge.rotation.y = -0.5; bridge.userData.spot = 'pageChannelwoodBlue'; bridge.userData.noPick = true
    for (const [px, pz] of [[1.6, -32.6], [5.2, -34.4]]) mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.4), mat(TX.wood), px, 0.7, pz, g).userData.noPick = true
    for (const [lx, lz, lr] of [[-8, -32, 3.2], [8.4, -36, 2.6]]) {
      const log = mesh(new THREE.CylinderGeometry(0.24, 0.28, lr, 7), mat(TX.wood), lx, 0.12, lz, g)
      log.rotation.z = Math.PI / 2; log.rotation.y = lr; log.userData.noPick = true
    }
    tuft(g, -7.6, 0.06, -37, 1.2, 0x2f6a44); tuft(g, 7.4, 0.06, -30.5, 1.1, 0x2f6a44)
    boulder(g, TX.chand, -9.5, 0.7, -27, 1.3, 0.4); boulder(g, TX.chand, 9.8, 0.9, -26, 1.5, 1.1)
  },
  chanWheel(g) {
    const terrace = mesh(new THREE.CircleGeometry(26, 22), mat(TX.chand), 0, 2.2, -56, g); terrace.rotation.x = -Math.PI / 2
    seaPlane(g, -0.5, 200, 0.7)
    // parapet along the terrace lip over the falls
    for (let k = 0; k < 14; k++) {
      const a = k * (Math.PI / 13) - Math.PI / 2
      mesh(new THREE.BoxGeometry(0.5, 1, 0.5), mat(TX.grey), Math.sin(a) * 10.5, 2.7, -56 + Math.cos(a) * 10.5, g).userData.noPick = true
    }
    // the great stone star, close at hand on this terrace — a five-spoke lock,
    // the notched ray tipped with iron, the housing below wearing its groove
    const star = new THREE.Group()
    for (let k = 0; k < 5; k++) {
      const arm = mesh(new THREE.BoxGeometry(0.8, 3.4, 0.5), mat(TX.grey), 0, 1.7, 0, star)
      arm.rotation.z = k * 1.2566
      arm.userData.landmark = 'starWheel'
      if (k === 0) {
        const notch = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.62), mat(TX.iron, { metalness: 0.65 }), 0, 3.25, 0, star)
        notch.userData.landmark = 'starWheel'; notch.userData.noPick = true
      }
    }
    star.position.set(0, 6.4, -53)
    star.userData.mech = 'starWheel'
    star.userData.spot = 'starWheel'
    g.add(star)
    mesh(new THREE.BoxGeometry(0.9, 4.4, 0.9), mat(TX.grey), 0, 4.4, -53, g).userData.noPick = true
    const groove = mesh(new THREE.BoxGeometry(1.1, 0.7, 1.0), mat(TX.iron, { metalness: 0.6 }), 0, 3.1, -53, g)
    groove.userData.landmark = 'starWheel'; groove.userData.noPick = true
    // the wheel-shelter where the red page waits, the axle lock, and the gear
    const shelter = mesh(new THREE.BoxGeometry(2.6, 2.2, 1.2), mat(TX.wood, { roughness: 0.85 }), -4.8, 3.3, -51.4, g)
    shelter.rotation.y = 0.4; shelter.userData.spot = 'pageChannelwoodRed'; shelter.userData.landmark = 'starWheel'
    const gearChan = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 8), mat(TX.brass, { metalness: 0.6 }), -4.8, 3.7, -50.7, g)
    gearChan.rotation.z = Math.PI / 2; gearChan.userData.mech = 'chanGear'; gearChan.userData.spot = 'gearChan'; gearChan.userData.landmark = 'starWheel'
    gearChan.visible = false
    const rail = mesh(new THREE.BoxGeometry(3.4, 0.18, 0.18), mat(TX.iron, { metalness: 0.55 }), 2.6, 2.55, -54.2, g)
    rail.userData.noPick = true
    const rope = mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2), mat(TX.wood), 4.2, 3.4, -54.4, g); rope.userData.noPick = true
    tuft(g, -7.4, 2.26, -58, 1.1, 0x2f6a44); tuft(g, 6.8, 2.26, -59, 1, 0x2f6a44)
    boulder(g, TX.chand, -8.6, 2.9, -53.5, 1.2, 0.5); boulder(g, TX.chand, 7.6, 3.1, -57, 1.4, 1.2)
  },
}

export function buildWorld(ids) {
  const root = new THREE.Group()
  const hot = []
  const anim = []
  const mech = []
  ids.forEach((id, idx) => {
    const g = new THREE.Group()
    g.position.x = idx * GAP
    skyDome(g, idSky(id))
    if (BUILDERS[id]) BUILDERS[id](g)
    const cam = NODES[id].pos
    for (const sp of NODES[id].spots) {
      if (sp.act === 'takePage') {
        const a = THREE.MathUtils.degToRad(sp.yaw)
        const q = mesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshStandardMaterial({ map: sp.page.startsWith('red') ? TX.pageR : TX.pageB, side: THREE.DoubleSide, emissive: 0x120505 }), cam[0] + Math.sin(a) * 7, cam[1] - 0.6, cam[2] + Math.cos(a) * 7, g)
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
      if (o.isMesh) {
        const env = o.userData.sky || (o.material && o.material.side === THREE.BackSide) || o.geometry.type === 'PlaneGeometry' || o.geometry.type === 'CircleGeometry'
        o.castShadow = !env
        o.receiveShadow = !o.userData.sky
      }
      if (o.userData.spot) hot.push({ mesh: o, id: o.userData.spot, node: id })
      if (o.userData.mech) mech.push({ kind: o.userData.mech, o, x0: o.position.x, y0: o.position.y, z0: o.position.z })
      if (o.userData.spin) anim.push({ o, f: (t) => { o.rotation.z = t * o.userData.spin } })
      if (o.userData.spinY) anim.push({ o, f: (t) => { o.rotation.y = t * o.userData.spinY } })
      if (o.userData.flicker) anim.push({ o, f: (t) => { o.material && (o.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(t * 3.7))) ; if (!o.material) o.intensity = 6 + 4 * Math.sin(t * 9.1) + 2 * Math.sin(t * 23.3) } })
      if (o.isLight && o.userData.flicker) anim.push({ o, f: (t) => { o.intensity = 6 + 4 * Math.sin(t * 9.1) + 2 * Math.sin(t * 23.3) } })
      if (o.userData.fall) anim.push({ o, f: (t) => { if (o.material.map) { o.material.map.offset.y = (t * 0.8) % 1 } } })
      if (o.userData.twinkle) anim.push({ o, f: (t) => { o.material.size = 0.1 + 0.06 * Math.sin(t * 2.1) } })
    if (o.userData.twinkleStar != null) anim.push({ o, f: (t) => { o.material.emissiveIntensity = 1.5 + 0.55 * Math.sin(t * 1.35 + o.userData.twinkleStar * 1.7) } })
      if (o.userData.steam) anim.push({ o, f: (t) => { o.position.y = 0.4 + ((t * 0.7) % 1) * 2 } })
    })
    hot.push(...[])
  })
  hot.forEach((h) => { const o = h.mesh; if (!o.userData.noPick) o.userData.spot = h.id })
  return { root, hot, anim, mech }
}

function idSky(id) {
  const ext = ['dock', 'cliffPath', 'beach', 'landing', 'stairTop']
  if (ext.includes(id)) return id === 'dock' || id === 'cliffPath' || id === 'beach' ? 'dusk' : 'day'
  if (id === 'towerTop' || id === 'rocketSilo') return id === 'rocketSilo' ? 'silo' : 'day'
  if (id === 'selenitic' || id === 'selSound' || id === 'selThrone' || id === 'selGate' || id === 'selTop') return 'selenitic'
  if (id === 'stoneship' || id === 'stoneDeck' || id === 'stoneObservatory') return 'stoneship'
  if (id === 'mechanical' || id === 'mechWalk' || id === 'mechCar' || id === 'mechTop' || id === 'mechRoom') return 'mechanical'
  if (id === 'channelwood' || id === 'chanChannels' || id === 'chanWheel') return 'channelwood'
  return 'interior'
}

const FOG = {
  dusk: { color: 0x38263e, near: 55, far: 640 },
  day: { color: 0xa8bed8, near: 80, far: 820 },
  interior: { color: 0x14100b, near: 5, far: 44 },
  selenitic: { color: 0x123a2a, near: 42, far: 520 },
  stoneship: { color: 0x6c7482, near: 36, far: 400 },
  mechanical: { color: 0x59301a, near: 42, far: 460 },
  channelwood: { color: 0x265256, near: 36, far: 400 },
  // the shaft keeps dusk's hue but swallows light: no horizon wash on the pad
  silo: { color: 0x241a28, near: 12, far: 150 },
}

const SUNSET = {
  dusk: { color: 0xffb07a, i: 1.15 },
  day: { color: 0xffe8c8, i: 1.2 },
  interior: { color: 0x8a7a68, i: 0.5 },
  selenitic: { color: 0xbfe8cc, i: 0.75 },
  stoneship: { color: 0xdfe4ea, i: 1.05 },
  mechanical: { color: 0xffb060, i: 1.35 },
  channelwood: { color: 0xcfeee6, i: 1.05 },
  silo: { color: 0x9a86a0, i: 0.55 },
}

export function atmosphere(id) {
  const s = idSky(id)
  return { fog: FOG[s], sun: SUNSET[s] }
}
