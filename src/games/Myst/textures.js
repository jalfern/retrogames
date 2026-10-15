// MYST — procedural canvas textures. Every surface is generated: fbm value
// noise shaded per material palette (the IronKeep / RaccoonHeist doctrine).

import * as THREE from 'three'

function rng(seed) {
  let t = seed >>> 0
  return () => { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296 }
}

function noiseGrid(n, seed) {
  const r = rng(seed)
  const g = new Float32Array(n * n)
  for (let i = 0; i < n * n; i++) g[i] = r()
  return g
}

function sample(g, n, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const s = (t) => t * t * (3 - 2 * t)
  const a = g[((yi % n) + n) % n * n + ((xi % n) + n) % n]
  const b = g[((yi % n) + n) % n * n + ((xi + 1) % n + n) % n]
  const c = g[(((yi + 1) % n) + n) % n * n + ((xi % n) + n) % n]
  const d = g[(((yi + 1) % n) + n) % n * n + ((xi + 1) % n + n) % n]
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf)
}

// canvas-based fbm texture
export function texNoise(size, oct, seed, palette, opts = {}) {
  const grids = []
  for (let o = 0; o < oct; o++) grids.push(noiseGrid(2 ** (o + 3), seed + o * 7919))
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 1, tot = 0
      for (let o = 0; o < oct; o++) {
        const scale = 2 ** (o + 3) / size
        v += sample(grids[o], 2 ** (o + 3), x * scale * (opts.freq || 1), y * scale * (opts.freq || 1)) * amp
        tot += amp; amp *= 0.55
      }
      v /= tot
      if (opts.streak !== undefined) v = v * (1 - opts.streak) + (Math.sin(y * 0.35 + v * 8) * 0.5 + 0.5) * opts.streak
      if (opts.mortar) v = Math.min(1, v + (Math.abs(((x / size) * 8) % 1 - 0.5) > 0.44 || Math.abs(((y / size) * 5) % 1 - 0.5) > 0.42 ? opts.mortar : 0))
      const i = (y * size + x) * 4
      const p = palette(v)
      img.data[i] = p[0]; img.data[i + 1] = p[1]; img.data[i + 2] = p[2]; img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

export const PAL = {
  rock: (v) => mix([38, 34, 40], [150, 140, 128], v),
  stoneD: (v) => mix([30, 33, 40], [104, 108, 116], v),
  wood: (v) => mix([44, 26, 14], [138, 92, 50], v),
  plank: (v) => mix([70, 44, 24], [164, 118, 68], v),
  sea: (v) => mix([10, 26, 44], [46, 96, 122], v),
  moss: (v) => mix([18, 38, 16], [86, 128, 54], v),
  sand: (v) => mix([92, 76, 52], [206, 188, 150], v),
  brass: (v) => mix([64, 44, 12], [212, 168, 74], v),
  iron: (v) => mix([24, 24, 28], [96, 98, 104], v),
  selen: (v) => mix([8, 34, 22], [64, 176, 96], v),
  grey: (v) => mix([44, 46, 52], [150, 152, 158], v),
  mech: (v) => mix([40, 26, 10], [190, 138, 52], v),
  chand: (v) => mix([16, 40, 44], [96, 170, 150], v),
  shelf: (v) => mix([30, 18, 10], [96, 60, 32], v),
  pageR: (v) => mix([70, 8, 10], [190, 40, 34], v),
  pageB: (v) => mix([10, 18, 70], [40, 70, 190], v),
}

export const SKIES = {
  dusk: [[26, 16, 46], [214, 96, 52], [70, 40, 70]],
  day: [[52, 96, 168], [176, 214, 236], [120, 150, 190]],
  interior: [[18, 14, 12], [52, 40, 30], [30, 22, 16]],
  selenitic: [[10, 40, 30], [120, 220, 150], [40, 90, 60]],
  stoneship: [[70, 76, 88], [168, 172, 180], [110, 116, 126]],
  mechanical: [[40, 22, 10], [200, 120, 40], [90, 50, 20]],
  channelwood: [[12, 44, 52], [140, 220, 210], [60, 110, 110]],
}

export function texSky(name) {
  const [top, hor, low] = SKIES[name] || SKIES.day
  const c = document.createElement('canvas')
  c.width = 8; c.height = 256
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, `rgb(${top.join(',')})`)
  g.addColorStop(0.55, `rgb(${hor.join(',')})`)
  g.addColorStop(1, `rgb(${low.join(',')})`)
  ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function texPages(color) {
  return texNoise(64, 3, color === 'red' ? 91 : 47, color === 'red' ? PAL.pageR : PAL.pageB)
}
