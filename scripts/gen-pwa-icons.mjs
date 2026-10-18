// gen-pwa-icons — draws the arcade's home-screen icon in code (no image deps).
//
// A red joystick ball on a silver shaft over a black base, two neon action
// buttons — the cabinet distilled to 512px. Everything is integer inclusion
// tests (hard edges, retro), then nearest-neighbour sampled to each target size.
// It writes manifest + apple-touch PNGs into public/ using a hand-rolled PNG
// encoder (node:zlib only). Re-run any time the mark changes:
//   node scripts/gen-pwa-icons.mjs

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BASE = 512
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0)

// Palette
const BG_TOP = [11, 11, 15]
const BG_BOT = [20, 20, 32]
const BALL = [226, 59, 46]
const BALL_HI = [255, 150, 120]
const BALL_LO = [150, 30, 22]
const SHAFT = [210, 210, 216]
const SHAFT_LO = [120, 120, 132]
const BASE_TOP = [44, 44, 58]
const BOT = [18, 18, 26]
const BTN_G = [61, 220, 132]
const BTN_C = [74, 205, 255]

const dist2 = (x, y, cx, cy) => (x - cx) * (x - cx) + (y - cy) * (y - cy)

// Paint one BASE-resolution pixel. Returns [r,g,b,a] where a=0 means outside the
// rounded tile (transparent, for the "any"-purpose manifest icons).
function paint(x, y, maskable) {
  const s = BASE
  const radius = maskable ? 0 : Math.round(s * 0.225)
  // Rounded-tile alpha (full bleed when maskable).
  const rx = Math.min(x, s - 1 - x)
  const ry = Math.min(y, s - 1 - y)
  if (rx < radius && ry < radius && dist2(rx, ry, radius, radius) > radius * radius) {
    return [0, 0, 0, 0]
  }

  const t = y / (s - 1)
  let c = [
    Math.round(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t),
    Math.round(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t),
    Math.round(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t),
    255,
  ]

  // Maskable art must sit inside the inner ~80% safe zone; scale the glyph.
  const k = maskable ? 0.8 : 1
  const gx = (x - s / 2) / k + s / 2
  const gy = (y - s / 2) / k + s / 2

  // Base plate (rounded rectangle near the bottom).
  const bw = 210, bh = 70, bx = s / 2 - bw / 2, by = 330
  if (gx >= bx && gx <= bx + bw && gy >= by && gy <= by + bh) {
    c = gy < by + 16 ? [...BASE_TOP, 255] : [...BOT, 255]
  }

  // Two neon action buttons on the plate.
  if (dist2(gx, gy, s / 2 - 60, by + 34) <= 22 * 22) c = [...BTN_G, 255]
  if (dist2(gx, gy, s / 2 + 60, by + 34) <= 22 * 22) c = [...BTN_C, 255]

  // Shaft (tapered metallic column from ball down into the base).
  if (gy >= 210 && gy <= 360) {
    const half = 26 + ((gy - 210) / 150) * 14
    if (Math.abs(gx - s / 2) <= half) c = gx < s / 2 - half + 12 ? [...SHAFT, 255] : [...SHAFT_LO, 255]
  }

  // Ball with a highlight and a shade crescent.
  const bcx = s / 2, bcy = 180, br = 92
  const d2 = dist2(gx, gy, bcx, bcy)
  if (d2 <= br * br) {
    c = [...BALL, 255]
    if (dist2(gx, gy, bcx + 34, bcy + 34) <= br * br) c = [...BALL_LO, 255]
    if (dist2(gx, gy, bcx - 30, bcy - 34) <= 30 * 30) c = [...BALL_HI, 255]
  }

  return c
}

// Sample the base grid at the requested output size (nearest neighbour).
function render(size, maskable) {
  const buf = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    const by = Math.min(BASE - 1, Math.floor((y * BASE) / size))
    for (let x = 0; x < size; x++) {
      const bx = Math.min(BASE - 1, Math.floor((x * BASE) / size))
      const [r, g, b, a] = paint(bx, by, maskable)
      const o = (y * size + x) * 4
      buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = a
    }
  }
  return buf
}

// --- minimal PNG encoder ---
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon-180.png', size: 180, maskable: true },
  { file: 'apple-touch-icon-152.png', size: 152, maskable: true },
]

mkdirSync(OUT, { recursive: true })
for (const t of targets) {
  const png = encodePNG(t.size, render(t.size, t.maskable))
  writeFileSync(join(OUT, t.file), png)
  console.log(`wrote public/${t.file} (${t.size}x${t.size}, ${png.length} bytes)`)
}
