// Regenerates the Yale BSC star data embedded in public/demos/ocean.stars.js (#607).
// Source: aduboisforge/Bright-Star-Catalog-JSON (Yale Bright Star Catalogue v5, J2000),
// master @ 704675ce — raw.githubusercontent.com (GitHub-hosted). Rerun with the JSON in
// hand:  node scripts/build-ocean-stars.mjs /path/to/BSC.json
// Only the [raDeg, decDeg, vMag, colorIdx] projection is kept; colorIdx is the spectral
// class letter (O B A F G K M -> 0..6, unknown -> G) from the HD spectral-type field.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/demos/ocean.stars.js')
const MAG_MAX = 5.5

const src = process.argv[2]
if (!src) {
  console.error('usage: node scripts/build-ocean-stars.mjs <BSC.json>')
  process.exit(1)
}
const raw = JSON.parse(readFileSync(src, 'utf8'))
const CLS = { O: 0, B: 1, A: 2, F: 3, G: 4, K: 5, M: 6 }
const sex = (s, scale) => {
  const neg = s.trim().startsWith('-')
  const [a, b, c] = s.replace(/^[+-]/, '').split(':').map(Number)
  return (neg ? -1 : 1) * (a + b / 60 + c / 3600) * scale
}
const rows = []
let skipped = 0
for (const s of raw) {
  const mag = parseFloat(s.MAG)
  if (!(mag <= MAG_MAX)) { skipped++; continue }
  const ra = sex(s.RA, 15)
  const dec = sex(s.DEC, 1)
  if (!(ra >= 0 && ra < 360) || !(dec >= -90 && dec <= 90)) { skipped++; continue }
  const cls = CLS[((s['Title HD'] || '') + '').trim()[0]] ?? 4
  rows.push([+ra.toFixed(3), +dec.toFixed(3), +mag.toFixed(2), cls])
}
rows.sort((a, b) => a[2] - b[2])

const fmt = (r) => `  [${r[0]},${r[1]},${r[2]},${r[3]}]`
let body = ''
for (let i = 0; i < rows.length; i += 5) body += rows.slice(i, i + 5).map(fmt).join(',  ') + ',\n'

const target = readFileSync(OUT, 'utf8')
const next = target.replace(
  /const BSC = \[\n[\s\S]*?\n\];/,
  `const BSC = [\n${body}];`
)
if (next === target) {
  console.error('BSC block not found in ocean.stars.js')
  process.exit(1)
}
writeFileSync(OUT, next)
console.log(`wrote ${rows.length} BSC stars (mag <= ${MAG_MAX}, skipped ${skipped}) to ${OUT}`)
