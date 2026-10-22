// comet-bands — measure the road BAND around each traced circuit (#530 item 2).
//
// The committed masks in data/maps/ (daytona-mask.png, laguna-mask.png — the
// honesty anchor cometcheck re-verifies) are wider than the asphalt where the
// real tracks have run-off and narrower where the track threads the trees. The
// HD kerb and run-off ribbons used to be constant rings; this script reads the
// per-lap-fraction half-band width off the mask, BOTH sides independently, and
// writes src/games/CometDrift/bands.js so the renderers can plan kerb depth
// and run-off width corner to corner instead of one uniform stripe.
//
// Alignment is cometcheck's proven rule verbatim: the traced centreline lives in
// REFERENCES (<unit box>), so it is mapped onto the mask bbox with a single small
// scale+shift search that maximises centreline-on-road hits over a chamfer
// distance transform — the exact pose cometcheck's provenance gate accepts. No
// re-derivation of the fit here, so the bands can never drift off the map the
// way a fresh isotropic fit could (#751 lesson: align with the proven pose,
// not a new one).
//
// Pure Node: our own masks are 8-bit greyscale PNGs (written by
// extract-comet-references.mjs, filter 0), decoded with zlib.
// Deterministic: same masks + same reference.js => byte-identical bands.js.
//
//   node scripts/comet-bands.mjs            # write bands.js
//   node scripts/comet-bands.mjs --dry    # print stats only

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { COURSES } from '../src/games/CometDrift/track.js'
import { REFERENCES, resample } from '../src/games/CometDrift/reference.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry')

const MAP_OF = { sandbank: 'daytona', corkscomb: 'laguna' }
const SAMPLES = 96
const TOL_ON = 5 // px, same as cometcheck's provenance on-road tolerance

function decodeGrayPng(file) {
    const buf = fs.readFileSync(file)
    let p = 8; let w = 0; let h = 0
    const idat = []
    while (p + 8 <= buf.length) {
        const len = buf.readUInt32BE(p)
        const type = buf.toString('ascii', p + 4, p + 8)
        if (type === 'IHDR') { w = buf.readUInt32BE(p + 8); h = buf.readUInt32BE(p + 12); if (buf[p + 16] !== 8 || buf[p + 17] !== 0) throw new Error(`${file}: expected 8-bit greyscale`) }
        else if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len))
        else if (type === 'IEND') break
        p += 12 + len
    }
    const raw = zlib.inflateSync(Buffer.concat(idat))
    const out = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
        if (raw[y * (w + 1)] !== 0) throw new Error(`${file}: mask PNG must use filter 0`)
        out.set(raw.subarray(y * (w + 1) + 1, y * (w + 1) + 1 + w), y * w)
    }
    return { w, h, m: out }
}

// chamfer distance transform in centipixels (distance to nearest drawn road px)
function distanceField(mask, roadKeys) {
    const { w, h, m } = mask
    const dist = new Float64Array(w * h).fill(1e9)
    for (const k of roadKeys) dist[k] = 0
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const k = y * w + x
            let d = dist[k]
            if (y > 0) { d = Math.min(d, dist[k - w] + 100); d = Math.min(d, dist[k - w] + 41) }
            if (x > 0) { d = Math.min(d, dist[k - 1] + 100); d = Math.min(d, dist[k - 1] + 41) }
            if (y > 0 && x < w - 1) d = Math.min(d, dist[k - w + 1] + 41)
            dist[k] = d
        }
    }
    for (let y = h - 1; y >= 0; y--) {
        for (let x = w - 1; x >= 0; x--) {
            const k = y * w + x
            let d = dist[k]
            if (y < h - 1) { d = Math.min(d, dist[k + w] + 100); d = Math.min(d, dist[k + w] + 41) }
            if (x < w - 1) { d = Math.min(d, dist[k + 1] + 100); d = Math.min(d, dist[k + 1] + 41) }
            if (y < h - 1 && x > 0) d = Math.min(d, dist[k + w - 1] + 41)
            dist[k] = d
        }
    }
    return dist
}

const results = {}
for (const c of COURSES) {
    const label = MAP_OF[c.id]
    if (!label) continue
    const ref = REFERENCES[c.id]
    if (!ref) continue
    const mask = decodeGrayPng(path.join(ROOT, 'data/maps', `${label}-mask.png`))
    const { w, h, m } = mask
    const roadKeys = []
    let x0 = 1e9; let x1 = -1e9; let y0 = 1e9; let y1 = -1e9
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue
        roadKeys.push(y * w + x)
        if (x < x0) x0 = x; if (x > x1) x1 = x
        if (y < y0) y0 = y; if (y > y1) y1 = y
    }
    const dist = distanceField(mask, roadKeys)
    const on = (px, py) => (px < 0 || py < 0 || px >= w || py >= h) ? Infinity : dist[py * w + px]

    // cometcheck's provenance alignment: reference lives in the unit box, so map
    // it onto the mask bbox with per-axis scale + shift, maximising centreline-
    // on-road hits. Reference pts are already normalised (REFERENCES is unit box).
    const rp = resample(ref.pts, 400)
    const rx0 = Math.min(...rp.map((p) => p[0])); const rx1 = Math.max(...rp.map((p) => p[0]))
    const ry0 = Math.min(...rp.map((p) => p[1])); const ry1 = Math.max(...rp.map((p) => p[1]))
    const toMap = (nx, ny, sc, dx, dy) => [
        Math.round(x0 + ((nx - rx0) / (rx1 - rx0)) * (x1 - x0) * sc + dx),
        Math.round(y0 + ((ny - ry0) / (ry1 - ry0)) * (y1 - y0) * sc + dy),
    ]
    let best = null
    for (let sc = 0.94; sc <= 1.061; sc += 0.01) for (let dx = -14; dx <= 14; dx += 2) for (let dy = -14; dy <= 14; dy += 2) {
        let hits = 0
        for (const [nx, ny] of rp) if (on(...toMap(nx, ny, sc, dx, dy)) <= TOL_ON * 100) hits++
        if (!best || hits > best.hits) best = { hits, sc, dx, dy }
    }
    const fOn = best.hits / rp.length
    console.log(`${c.id}: mask ${w}x${h} road ${roadKeys.length}px fit sc=${best.sc.toFixed(2)} d=(${best.dx},${best.dy}) on-road ${(100 * fOn).toFixed(1)}%`)
    if (fOn < 0.98) { console.error(`${c.id}: centreline left the mask — alignment failed`); process.exit(1) }

    // Perpendicular half-band: walk out from the centreline along the map normal
    // until the distance transform leaves the road, both sides independently.
    // Widths stay in px; the write step normalises by the mask span.
    const q = rp.map(([nx, ny]) => toMap(nx, ny, best.sc, best.dx, best.dy))
    const span = Math.max(x1 - x0, y1 - y0) || 1
    // A perpendicular run-off ray must not escape across the infield into another
    // section of the track (the published mask paints infield roads too). Cap each
    // ray at the distance to the nearest far-along-the-lap centreline sample.
    const farCap = (k) => {
        const [ox, oy] = q[k]
        let c = Infinity
        for (let j = 0; j < q.length; j++) {
            const d = Math.min(Math.abs(j - k), rp.length - Math.abs(j - k))
            if (d < rp.length * 0.1) continue
            const dd = Math.hypot(q[j][0] - ox, q[j][1] - oy)
            if (dd < c) c = dd
        }
        return c
    }
    const L = []; const R = []
    for (let k = 0; k < rp.length; k++) {
        const [px, py] = q[k]
        const cap = Math.min(0.34 * span, farCap(k) * 0.9)
        const a = q[(k + 1) % rp.length]; const b = q[(k - 1 + rp.length) % rp.length]
        const tx = a[0] - b[0]; const ty = a[1] - b[1]
        const tl = Math.hypot(tx, ty) || 1
        const nxu = -ty / tl; const nyu = tx / tl
        const side = [0, 0]
        for (const s of [-1, 1]) {
            let d = 0
            while (d < cap) {
                const nd = Math.min(d + 1, cap)
                if (on(Math.round(px + nxu * s * nd), Math.round(py + nyu * s * nd)) > TOL_ON * 100) break
                d = nd
                if (d >= cap) break
            }
            side[s > 0 ? 1 : 0] = d / span
        }
        L.push(side[0]); R.push(side[1])
    }
    const stat = (v) => `min ${Math.min(...v).toFixed(3)} max ${Math.max(...v).toFixed(3)} mean ${(v.reduce((x, y) => x + y, 0) / v.length).toFixed(3)}`
    console.log(`${c.id}: L ${stat(L)} R ${stat(R)}`)
    // resample the dense per-point widths down to BAND_SAMPLES lap fractions
    const thin = (arr) => { const o = []; for (let k = 0; k < SAMPLES; k++) o.push(arr[Math.round((k / SAMPLES) * arr.length) % arr.length]); return o }
    results[c.id] = { label, L: thin(L), R: thin(R) }
}

if (DRY) process.exit(0)

const wrap = (v) => {
    const lines = []; let cur = ''
    for (const s of v.map((x) => x.toFixed(4))) {
        if (cur && (cur + ', ' + s).length > 84) { lines.push('    ' + cur); cur = s } else cur = cur ? cur + ', ' + s : s
    }
    if (cur) lines.push('    ' + cur)
    return '\n' + lines.join(',\n') + ',\n  '
}
const courseBlock = (id) => {
    const r = results[id]
    return `    ${id}: {\n        map: '${r.label}',\n        left: [${wrap(r.L)}],\n        right: [${wrap(r.R)}],\n    },`
}
const body = `// COMET DRIFT GP — measured road band profiles (#530 item 2).
//
// GENERATED by scripts/comet-bands.mjs — do not hand-edit.
// Both lists are half-widths of the traced road BAND (asphalt + kerbs +
// run-off, as the published map paints it), taken perpendicular to the
// centerline at ${SAMPLES} evenly spaced lap fractions, normalised by the map's
// max span (the same unit box the ref overlay fits into). index 0 faces the
// track's LEFT in map space, index 1 the RIGHT; alignment is cometcheck's
// provenance pose (unit-box reference scaled+shifted onto the mask bbox,
// best-of on-road hits). The width varies corner to corner — banked turns and
// escape areas read wide, legs threaded through trees read narrow — and the two
// sides disagree where the real track has a wider escape on one side (Daytona's
// banking). Gulch was never traced from a map: it has no band, and kerb/run-off
// fall back to the curvature law alone.

export const BAND_SAMPLES = ${SAMPLES}

export const BANDS = {
${courseBlock('sandbank')}
${courseBlock('corkscomb')}
}

// band half-width at lap fraction f for a course (null when the course has no
// traced map). Wraps through the start/finish seam.
export function bandAt(id, f) {
    const b = BANDS[id]
    if (!b) return null
    const u = ((f % 1) + 1) % 1
    const x = u * BAND_SAMPLES
    const i = Math.floor(x) % BAND_SAMPLES
    const j = (i + 1) % BAND_SAMPLES
    const t = x - Math.floor(x)
    return {
        left: b.left[i] + (b.left[j] - b.left[i]) * t,
        right: b.right[i] + (b.right[j] - b.right[i]) * t,
    }
}

// convert a measured map-space half-width (0..1 of map span) into world px.
export const BAND_SPAN_PX = 8192
export const bandPx = (id, w) => (BANDS[id] ? w * BAND_SPAN_PX : null)
`
fs.writeFileSync(path.join(ROOT, 'src/games/CometDrift/bands.js'), body)
console.log('wrote src/games/CometDrift/bands.js')
