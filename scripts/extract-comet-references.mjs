// extract-comet-references — build the COMET DRIFT reference centerlines from
// the REAL map files (#513 redo: no more hand-typed shapes).
//
//   data/maps/daytona-road-course.png   Wikimedia "Daytona International
//                                       Speedway - Road Course.png" (public domain)
//   data/maps/Laguna_Seca.svg         Wikimedia "Laguna_Seca.svg" (CC BY-SA)
//
// Pipeline (Chrome rasterises the map, everything else is plain math):
//   1. render the map at fixed size on a black canvas, read pixels;
//   2. mask = every bright pixel (white track lines + light-grey apron);
//   3. dilate so the parallel edge-lines fuse into one road band;
//   4. Zhang-Suen thinning + stub pruning -> a skeleton;
//   5. a straight-ahead walker traces the longest closed loop (the circuit);
//   6. resample -> normalise into the unit box -> src/games/CometDrift/reference.js.
//
// Side products written next to it:
//   data/maps/<map>-mask.png      the binary road mask at render size (the
//                                 honesty anchor cometcheck re-verifies against —
//                                 see scripts/cometcheck.mjs "reference provenance")
//   docs/maps/ref-<course>.png    the extracted centerline ALONE, white ground
//   docs/maps/extract-<course>.png  debug overlay: mask + traced loop
//
// Run: `npm run cometrefs` (needs Google Chrome via playwright-core).
// Deterministic: same inputs + fixed size => same output.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
// self-contained copies of the reference.js helpers: a corrupt reference.js
// must never be able to wedge the generator that repairs it (they stay in
// sync because this script is the only thing that writes reference.js).
function normalize(pts) {
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity
    for (const [x, y] of pts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
    }
    const sc = Math.max(maxX - minX, maxY - minY) || 1
    return pts.map(([x, y]) => [(x - minX) / sc, (y - minY) / sc])
}
function resample(pts, n) {
    const m = pts.length
    const seg = []
    let total = 0
    for (let i = 0; i < m; i++) {
        const a = pts[i]; const b = pts[(i + 1) % m]
        const d = Math.hypot(b[0] - a[0], b[1] - a[1])
        seg.push(d); total += d
    }
    const out = []
    for (let k = 0; k < n; k++) {
        let target = (total * k) / n
        let i = 0
        while (target > seg[i] && i < m - 1) { target -= seg[i]; i++ }
        const a = pts[i]; const b = pts[(i + 1) % m]
        const f = seg[i] ? target / seg[i] : 0
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
    }
    return out
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MAPS_DIR = path.join(ROOT, 'data/maps')
const PORT = 8791

const MAPS = [
    { game: 'sandbank', name: 'DAYTONA ROAD COURSE', file: 'daytona-road-course.png', label: 'daytona', w: 1400, thr: 40, ds: 3, closeR: 2, dilate: 1, prune: 3 },
    { game: 'corkscomb', name: 'LAGUNA SECA', file: 'Laguna_Seca.svg', label: 'laguna', w: 1200, thr: 96, ds: 3, closeR: 1, dilate: 1, prune: 3 },
]

// ---------------------------------------------------------------------------
// local same-origin server (canvas reads pixels only same-origin)
const srv = http.createServer((req, res) => {
    const f = decodeURIComponent(req.url.split('?')[0].slice(1)) || 'index.html'
    if (f === 'index.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body></body></html>'); return }
    try {
        const buf = fs.readFileSync(path.join(MAPS_DIR, f))
        res.writeHead(200, { 'content-type': f.endsWith('.svg') ? 'image/svg+xml' : 'image/png' })
        res.end(buf)
    } catch { res.writeHead(404); res.end('nf') }
})
await new Promise((r) => srv.listen(PORT, r))

const { chromium } = await import('playwright-core')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
await page.goto(`http://localhost:${PORT}/`)

async function renderPixels(file, w) {
    return page.evaluate(async ({ file, w, port }) => {
        const img = new Image(); img.src = `http://localhost:${port}/${file}`
        await img.decode()
        const sc = w / img.naturalWidth
        const W = Math.round(img.naturalWidth * sc); const H = Math.round(img.naturalHeight * sc)
        const c = document.createElement('canvas'); c.width = W; c.height = H
        const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, W, H)
        x.drawImage(img, 0, 0, W, H)
        return Array.from(x.getImageData(0, 0, W, H).data)
    }, { file, w, port: PORT })
}

// ---------------------------------------------------------------------------
const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]

function dilate(mask, W, H, passes) {
    let m = mask
    for (let p = 0; p < passes; p++) {
        const o = new Uint8Array(W * H)
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                if (m[y * W + x]) { o[y * W + x] = 1; continue }
                for (const [ox, oy] of N8) {
                    const nx = x + ox; const ny = y + oy
                    if (nx >= 0 && ny >= 0 && nx < W && ny < H && m[ny * W + nx]) { o[y * W + x] = 1; break }
                }
            }
        }
        m = o
    }
    return m
}

function erode(mask, W, H, passes) {
    let m = mask
    for (let p = 0; p < passes; p++) {
        const o = new Uint8Array(W * H)
        for (let y = 1; y < H - 1; y++) {
            for (let x = 1; x < W - 1; x++) {
                if (!m[y * W + x]) continue
                let keep = true
                for (const [ox, oy] of N8) { if (!m[(y + oy) * W + x + ox]) { keep = false; break } }
                if (keep) o[y * W + x] = 1
            }
        }
        m = o
    }
    return m
}

// binary closing: bridges small gaps along the drawn lines (badges, flag,
// anti-aliasing) without welding parallel edge-lines together
function closing(mask, W, H, r) {
    return erode(dilate(mask, W, H, r), W, H, r)
}

function neighbours(m, W, H, x, y) {
    let n = 0
    for (const [ox, oy] of N8) {
        const nx = x + ox; const ny = y + oy
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && m[ny * W + nx]) n++
    }
    return n
}

function thin(mask, W, H) {
    let m = Uint8Array.from(mask)
    for (let guard = 0; guard < 200; guard++) {
        let changed = false
        for (let pass = 0; pass < 2; pass++) {
            const kill = []
            for (let y = 1; y < H - 1; y++) {
                for (let x = 1; x < W - 1; x++) {
                    const i = y * W + x
                    if (!m[i]) continue
                    const p2 = m[i - W] ? 1 : 0, p3 = m[i - W + 1] ? 1 : 0, p4 = m[i + 1] ? 1 : 0
                    const p5 = m[i + W + 1] ? 1 : 0, p6 = m[i + W] ? 1 : 0, p7 = m[i + W - 1] ? 1 : 0
                    const p8 = m[i - 1] ? 1 : 0, p9 = m[i - W - 1] ? 1 : 0
                    const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
                    if (B < 2 || B > 6) continue
                    const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
                    let A = 0
                    for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) A++
                    if (A !== 1) continue
                    if (pass === 0) { if (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) kill.push(i) }
                    else { if (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0) kill.push(i) }
                }
            }
            for (const i of kill) { m[i] = 0; changed = true }
        }
        if (!changed) break
    }
    return m
}

function prune(mask, W, H, passes) {
    let m = Uint8Array.from(mask)
    for (let p = 0; p < passes; p++) {
        const kill = []
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const i = y * W + x
                if (m[i] && neighbours(m, W, H, x, y) <= 1) kill.push(i)
            }
        }
        if (!kill.length) break
        for (const i of kill) m[i] = 0
    }
    return m
}

// straight-ahead walker with backtracking: follow the skeleton, always try the
// neighbour that bends least; close when within 2 px of the start after
// minSteps. At a dead end, pop back to the last junction with an untried
// branch (a real circuit loop survives; wrong turns run out of road).
function walk(mask, W, H, sx, sy, minSteps) {
    const visited = new Set([sy * W + sx])
    const path = [[sx, sy]]
    const stack = []
    let x = sx; let y = sy; let dx = 0; let dy = 0
    let deepest = 1
    const ok = (nx, ny) => nx >= 0 && ny >= 0 && nx < W && ny < H && mask[ny * W + nx]
    const nearStart = (nx, ny) => Math.abs(nx - sx) <= 2 && Math.abs(ny - sy) <= 2
    for (let guard = 0; guard < 4000000; guard++) {
        const steps = path.length - 1
        if (steps >= minSteps && nearStart(x, y)) return path
        const cands = []
        for (const [ox, oy] of N8) {
            const nx = x + ox; const ny = y + oy
            if (!ok(nx, ny)) continue
            if (steps + 1 >= minSteps && nearStart(nx, ny)) { path.push([nx, ny]); return path }
            if (visited.has(ny * W + nx)) continue
            const n = Math.hypot(ox, oy)
            const s = (dx || dy) ? (ox / n) * dx + (oy / n) * dy : 0
            cands.push([nx, ny, ox / n, oy / n, s])
        }
        cands.sort((a, b) => b[4] - a[4])
        let nxt = null
        if (cands.length) {
            nxt = cands[0]
            if (cands.length > 1) stack.push({ x, y, dx, dy, len: path.length, alt: cands.slice(1) })
        } else {
            let e = null
            while (stack.length) {
                const top = stack[stack.length - 1]
                top.alt = top.alt.filter(([ax, ay]) => ok(ax, ay) && !visited.has(ay * W + ax))
                if (top.alt.length) { e = top; break }
                stack.pop()
            }
            if (!e) {
                if (process.env.COMETREFS_DEBUG) console.log('  dead from', sx, sy, 'visited', visited.size, 'deepest', deepest)
                return null
            }
            nxt = e.alt.shift()
            if (!e.alt.length) stack.pop()
            while (path.length > e.len) { const p = path.pop(); visited.delete(p[1] * W + p[0]) }
            x = e.x; y = e.y; dx = e.dx; dy = e.dy
        }
        const [nx, ny, ndx, ndy] = nxt
        visited.add(ny * W + nx)
        path.push([nx, ny])
        x = nx; y = ny; dx = ndx; dy = ndy
        if (path.length > deepest) deepest = path.length
        if (path.length > 30000) return null
    }
    if (process.env.COMETREFS_DEBUG) console.log('  walk exhausted guard from', sx, sy, 'deepest', path.length)
    return null
}

function loopStats(pts) {
    let per = 0; let a2 = 0
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i]; const q = pts[(i + 1) % pts.length]
        per += Math.hypot(q[0] - p[0], q[1] - p[1])
        a2 += p[0] * q[1] - q[0] * p[1]
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]
        if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]
    }
    return { per, area: Math.abs(a2) / 2, bbox: [maxX - minX, maxY - minY] }
}

function seeds(mask, W, H) {
    // largest 8-connected component, plus its raster extremes; sample points
    // spread along it so a seed lands on the circuit loop, not on badge junk
    const lab = new Int32Array(W * H).fill(-1)
    let bestComp = -1; let bestSize = 0; let compId = 0
    const st = []
    const comps = []
    for (let s = 0; s < W * H; s++) {
        if (!mask[s] || lab[s] >= 0) continue
        compId++; lab[s] = compId; st.push(s)
        const px = []
        while (st.length) {
            const k = st.pop(); px.push(k)
            const x0 = k % W; const y0 = (k - x0) / W
            for (const [ox, oy] of N8) {
                const nx = x0 + ox; const ny = y0 + oy
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
                const nk = ny * W + nx
                if (mask[nk] && lab[nk] < 0) { lab[nk] = compId; st.push(nk) }
            }
        }
        if (px.length > bestSize) { bestSize = px.length; bestComp = compId; comps[0] = px }
    }
    const px = comps[0] || []
    let l = -1; let r = -1; let t = -1; let b = -1
    let lx = W; let rx = -1; let ty = H; let by = -1
    for (const k of px) {
        const x = k % W; const y = (k - x) / W
        if (x < lx) { lx = x; l = k }
        if (x > rx) { rx = x; r = k }
        if (y < ty) { ty = y; t = k }
        if (y > by) { by = y; b = k }
    }
    const out = []
    for (const k of [l, r, t, b]) if (k >= 0) out.push([k % W, Math.floor(k / W)])
    for (let i = 0; i < 16; i++) {
        const k = px[Math.floor((i + 0.5) * px.length / 16)]
        out.push([k % W, Math.floor(k / W)])
    }
    return out
}

// ---------------------------------------------------------------------------
// tiny PNG writers: grey (type 0) for the mask, RGB (type 2) for previews
const CRC_T = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
    return t
})()
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
}
function writeGray(path, w, h, g) {
    const raw = Buffer.alloc((w + 1) * h)
    let o = 0
    for (let y = 0; y < h; y++) { raw[o++] = 0; for (let x = 0; x < w; x++) raw[o++] = g[y * w + x] ? 255 : 0 }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
    ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
    fs.writeFileSync(path, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]))
}
function writeRgb(path, w, h, rgb) {
    const raw = Buffer.alloc((w * 3 + 1) * h)
    let o = 0
    for (let y = 0; y < h; y++) { raw[o++] = 0; for (let x = 0; x < w * 3; x++) raw[o++] = rgb[y * w * 3 + x] }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
    fs.writeFileSync(path, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]))
}
function stroke(img, w, h, pts, col, thick = 1) {
    const set = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return; for (let ty = 0; ty < thick; ty++) { for (let tx = 0; tx < thick; tx++) { const i = ((y + ty) * w + (x + tx)) * 3; img[i] = col[0]; img[i + 1] = col[1]; img[i + 2] = col[2] } } }
    const closed = [...pts, pts[0]]
    for (let k = 0; k < closed.length - 1; k++) {
        let x0 = Math.round(closed[k][0]); const x1 = Math.round(closed[k + 1][0])
        let y0 = Math.round(closed[k][1]); const y1 = Math.round(closed[k + 1][1])
        const dx = Math.abs(x1 - x0); const dy = Math.abs(y1 - y0); const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1
        let err = dx - dy
        for (let g = 0; g < 20000; g++) {
            set(x0, y0)
            if (x0 === x1 && y0 === y1) break
            const e2 = 2 * err
            if (e2 > -dy) { err -= dy; x0 += sx }
            if (e2 < dx) { err += dx; y0 += sy }
        }
    }
}

// ---------------------------------------------------------------------------
const results = {}
for (const m0 of MAPS) {
    const rgba = await renderPixels(m0.file, m0.w)
    const Wn = Math.round(m0.w)
    const Hn = (rgba.length / 4) / Wn
    const full = new Uint8Array(Wn * Hn)
    for (let j = 0; j < Wn * Hn; j++) {
        const i = j * 4
        full[j] = Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) >= m0.thr ? 1 : 0
    }
    // max-pool downsample: fuses the parallel edge-lines into one road band at
    // coarse scale and keeps the committed mask small
    const ds = m0.ds
    const W = Math.floor(Wn / ds); const H = Math.floor(Hn / ds)
    const base = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let hit = 0
            for (let oy = 0; oy < ds && !hit; oy++) {
                for (let ox = 0; ox < ds; ox++) { if (full[(y * ds + oy) * Wn + x * ds + ox]) { hit = 1; break } }
            }
            base[y * W + x] = hit
        }
    }
    writeGray(path.join(MAPS_DIR, `${m0.label}-mask.png`), W, H, base)

    const dil = dilate(closing(base, W, H, m0.closeR), W, H, m0.dilate)
    const skel = prune(thin(dil, W, H), W, H, m0.prune)

    let best = null; let bestStats = null
    if (process.env.COMETREFS_DEBUG) {
        console.log(m0.label, `mask px ${base.reduce((a, v) => a + v, 0)}, skel px ${skel.reduce((a, v) => a + v, 0)}`)
    }
    for (const [sx, sy] of seeds(skel, W, H)) {
        const loop = walk(skel, W, H, sx, sy, Math.round(1.2 * (W + H)))
        if (process.env.COMETREFS_DEBUG) console.log(m0.label, 'seed', sx, sy, '->', loop ? `${loop.length} pts` : 'dead')
        if (!loop || loop.length < 200) continue
        const st = loopStats(loop)
        if (st.area < 0.2 * W * H) continue
        if (st.per < 1.2 * (W + H)) continue
        if (!bestStats || st.per > bestStats.per) { best = loop; bestStats = st }
    }
    if (!best) { console.error(`${m0.label}: NO loop found`); process.exit(1) }

    const norm = resample(normalize(best.map(([x, y]) => [x, y])), 32)
    const pts = norm.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))])
    results[m0.game] = { name: m0.name, pts }

    // previews: loop alone (white ground) + debug overlay (mask grey, loop red)
    const alone = new Uint8Array(W * H * 3).fill(0xff)
    stroke(alone, W, H, resample(best, 600), [0x20, 0x20, 0x20], 3)
    writeRgb(path.join(ROOT, 'docs/maps', `ref-${m0.game}.png`), W, H, alone)
    const over = new Uint8Array(W * H * 3)
    for (let j = 0; j < W * H; j++) if (dil[j]) { over[j * 3] = 0x70; over[j * 3 + 1] = 0x70; over[j * 3 + 2] = 0x70 }
    stroke(over, W, H, resample(best, 600), [0xff, 0x30, 0x30], 2)
    writeRgb(path.join(ROOT, 'docs/maps', `extract-${m0.game}.png`), W, H, over)
    console.log(`${m0.label}: loop ${best.length} px, per ${bestStats.per.toFixed(0)}, area ${(100 * bestStats.area / (W * H)).toFixed(1)}% of frame`)
}
await browser.close(); srv.close()

// ---------------------------------------------------------------------------
const REF = path.join(ROOT, 'src/games/CometDrift/reference.js')
const sb = results.sandbank; const ck = results.corkscomb
function fmtWrap(pts, ind = '            ') {
    const strs = pts.map((p) => `[${p[0]}, ${p[1]}]`)
    const lines = []
    let cur = ''
    for (const st of strs) {
        if (cur && (cur + ', ' + st).length > 88) { lines.push(cur); cur = st } else cur = cur ? cur + ', ' + st : st
    }
    if (cur) lines.push(cur)
    return '\n' + ind + lines.join(',\n' + ind) + ',\n            '
}
const header = [
    '// COMET DRIFT GP — reference centerlines (#513 redo).',
    '//',
    '// GENERATED by scripts/extract-comet-references.mjs — do not hand-edit.',
    '// The two points lists below are traced from the REAL published maps:',
    '//',
    '//   DAYTONA — data/maps/daytona-road-course.png, Wikimedia "Daytona',
    '//     International Speedway - Road Course.png" (public domain): the road',
    '//     course = banked Turns 1-2, back straight, the International',
    '//     Horseshoe (T3-4), the T5-7 kinks and the Bus Stop braking complex.',
    '//   LAGUNA  — data/maps/Laguna_Seca.svg, Wikimedia "Laguna_Seca.svg"',
    '//     (CC BY-SA): Rahal straight, Andretti hairpin, the Corkscrew',
    '//     double-apex, the Snake descent and the keyhole.',
    '//',
    '// Extraction (Chrome render -> bright-pixel mask -> dilate -> Zhang-Suen',
    '// skeleton -> straight-ahead longest-loop walk) lives in the script named',
    '// above; data/maps/<map>-mask.png is the committed road mask cometcheck',
    '// uses to prove these centerlines really sit on the map.',
    '//',
    '// Coords: normalised [0,1] box (x right, y down), 32 points per lap,',
    '// arc-length resampled. Grade: see bestShapeDistance below (the harness',
    '// takes the better of direct and mirror-x alignment).',
    '',
    'export const REFERENCES = {',
    '    sandbank: {',
    `        name: '${sb.name}',`,
    '        pts: [' + fmtWrap(sb.pts) + '],',
    '    },',
    '    corkscomb: {',
    `        name: '${ck.name}',`,
    '        pts: [' + fmtWrap(ck.pts) + '],',
    '    },',
    '}',
    '',
]
const cur = fs.readFileSync(REF, 'utf8').split('\n')
const tailStart = cur.findIndex((l) => l.startsWith('// normalise a polygon'))
if (tailStart < 0) { console.error('reference.js layout changed; fix the generator'); process.exit(1) }
fs.writeFileSync(REF, header.join('\n') + cur.slice(tailStart).join('\n'))
console.log('wrote', REF)
