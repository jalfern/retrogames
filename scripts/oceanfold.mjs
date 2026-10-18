// oceanfold — mesh fold-margin guard for public/demos/ocean.html.
//
// The sea mesh (EXTENT/SEG ≈ 1.8 m vertex spacing) must never be displaced
// horizontally further than its own spacing: the min Jacobian of
// x -> x - Dx(x), sampled at mesh spacing across storm phases, must be > 0.
// Negative = folded triangles = the single-frame spikes (#ocean-polish).
//
// Unlike a pixel detector (fog/foam variance swamps the signal: old and fixed
// both scored ~90px), this replicates the demo's spectral pipeline on CPU.
// Constants AND structure are parsed from the demo file itself — retuning the
// shader cannot silently drift the guard, and re-adding octave-1 displacement
// or the double chop fails the structural assertions too.
//
// Measured with this script: pre-fix build = -1.17 (folds), fixed = +0.12 at
// storm=1, +0.79 at storm=0.5.
//
// Usage: node scripts/oceanfold.mjs [--file <path>] [--json]
// Proven-fail mutants: re-add gd1 to `world.x -=` in vs_main, or multiply
// uEnc[oi][1..2] amp by OCT[oi].chop, or raise oct-0 dsp base back to 4.0,
// or drop the kMax band-limit from cs_fill (oct-0 zigzag spikes alias back in),
// or delete the mid-stage workgroupBarrier() in cs_row/cs_col (FFT race).

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const asJson = args.includes('--json')
const file = resolve(ROOT, opt('--file', 'public/demos/ocean.html'))
const src = readFileSync(file, 'utf8')

const results = []
const ok = (name, pass, detail) => { results.push({ name, pass, detail }); if (!asJson) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

const PI = Math.PI
let NI, SEG, EXTENT, OCT, seaParams
try {
  NI = +src.match(/const NI = (\d+)/)[1]
  SEG = +src.match(/SEG = (\d+)/)[1]
  EXTENT = +src.match(/EXTENT = (\d+)/)[1]
  const amp0 = +src.match(/AMP0 = ([\d.]+)/)[1]
  const amp1 = +src.match(/AMP1 = ([\d.]+)/)[1]
  OCT = new Function(`return ${src.match(/const OCT = (\[[\s\S]*?\]);/)[1]}`)()
  seaParams = new Function('s', `const OCT=${JSON.stringify(OCT)},AMP0=${amp0},AMP1=${amp1};${src.match(/function seaParams\(s\) \{([\s\S]*?)\n\}/)[1]}`)
} catch { ok('parses pipeline params from the demo', false); finish() }
ok('parses pipeline params from the demo', true, `NI=${NI} SEG=${SEG} EXTENT=${EXTENT}`)

const meshUsesOct1 = /world\.x -=[^;]*gd1/.test(src)
const doubleChop = /uEnc\[oi\]\[1\][^)]*OCT\[oi\]\.chop/.test(src)
ok('mesh displaces with octave 0 only', !meshUsesOct1, meshUsesOct1 ? 'gd1 found in world.x displacement' : undefined)
ok('chop applied once (not re-multiplied in enc)', !doubleChop, doubleChop ? 'enc amp carries OCT[oi].chop' : undefined)

// octave 0 (the mesh-carrying spectrum) must be band-limited to the mesh
// Nyquist pi/spacing: wavelengths under ~2*spacing alias into vertical zigzag
// spikes. Octave 1 (per-fragment shading) stays full-band.
let KMAX
try {
  const exprs = src.match(/const KMAX = \[([^\]]+)\]/)[1].split(',').map(s => s.trim())
  KMAX = exprs.map(e => new Function('SEG', 'EXTENT', `return (${e})`)(SEG, EXTENT))
} catch { KMAX = null }
const KNYQ = Math.PI / (EXTENT / SEG)
ok('octave 0 band-limited to mesh Nyquist', KMAX && KMAX[0] <= KNYQ * 1.02 && KMAX[1] > 1e6,
  KMAX ? `KMAX=[${KMAX[0].toFixed(3)},${KMAX[1]}], pi/spacing=${KNYQ.toFixed(3)}` : 'KMAX const not found')
ok('fill shader applies the kMax fade', /ph[^;]*smoothstep\(fu\.kMax/.test(src))

// butterfly race guard: partners occupy each other's write slots, so every
// stage needs workgroupBarrier() BETWEEN the a/b reads and the writes — the
// stage-end barrier alone lets another SIMD group clobber a slot first.
for (const buf of ['rb', 'cb']) {
  ok(`fft butterflies barrier between reads and writes (${buf})`,
    new RegExp(`let b = ${buf}\\[[^\\]]+\\];\\s*workgroupBarrier\\(\\);`).test(src))
}

const LOGN = Math.log2(NI)
const MESH = EXTENT / SEG
const kOf = (i, L) => (i >= NI / 2 ? i - NI : i) * 2 * PI / L
const rev = vIn => { let v = vIn, r = 0; for (let i = 0; i < LOGN; i++) { r = (r << 1) | (v & 1); v >>= 1 } return r }
const gauss = s => {
  const u1 = Math.max((((Math.sin(s * 12.9898 + 78.233) * 43758.5453) % 1) + 1) % 1, 1e-7)
  const u2 = (((Math.sin(s * 39.346 + 11.135) * 24634.6345) % 1) + 1) % 1
  const r = Math.sqrt(-2 * Math.log(u1))
  return [r * Math.cos(6.283185 * u2), r * Math.sin(6.283185 * u2)]
}
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]

function fft(a) {
  const n = a.length
  if (n === 1) return [a[0]]
  const even = fft(a.filter((_, i) => i % 2 === 0))
  const odd = fft(a.filter((_, i) => i % 2 === 1))
  const out = new Array(n)
  for (let k = 0; k < n / 2; k++) {
    const th = -2 * PI * k / n
    const t = cmul(odd[k], [Math.cos(th), Math.sin(th)])
    out[k] = [even[k][0] + t[0], even[k][1] + t[1]]
    out[k + n / 2] = [even[k][0] - t[0], even[k][1] - t[1]]
  }
  return out
}
function ifft2(spec) {
  const nrm = 1 / (NI * NI)
  const byRow = spec.map(row => fft(row.map(v => v)))
  const out = Array.from({ length: NI }, () => Array.from({ length: NI }, () => [0, 0]))
  for (let c = 0; c < NI; c++) {
    const res = fft(byRow.map(r => r[c]))
    for (let r = 0; r < NI; r++) out[r][c] = res[r].map(z => z * nrm)
  }
  return out
}
function dispField(oi, s, t) {
  const o = OCT[oi], p = seaParams(s)[oi]
  const sp = []
  for (let x = 0; x < NI; x++) {
    sp.push([])
    for (let y = 0; y < NI; y++) {
      const kx = kOf(x, o.L), ky = kOf(y, o.L)
      const k = Math.max(Math.hypot(kx, ky), 1e-4)
      const cd = kx / k
      const ph0 = p.A / k ** 4 * Math.exp(-Math.pow(o.kc / k, 2)) * Math.exp(-(1 - cd * cd) * p.spread)
      const km = KMAX ? KMAX[oi] : Infinity
      const t01 = k <= km * 0.6 ? 0 : k >= km ? 1 : (k - km * 0.6) / (km * 0.4)
      const ph = ph0 * (1 - t01 * t01 * (3 - 2 * t01))
      sp[x].push((kx !== 0 || ky !== 0) ? gauss(x * 91 + y * 7717 + 1337 + oi * 101).map(v => v * Math.sqrt(ph * 0.5)) : [0, 0])
    }
  }
  const w0 = k => Math.sqrt(9.81 * k)
  const prepped = sp.map((row, x) => row.map((h, y) => {
    const kx = kOf(x, o.L)
    const w = w0(Math.max(Math.hypot(kx, kOf(y, o.L)), 1e-4))
    return cmul(cmul(h, [Math.cos(w * t), Math.sin(w * t)]), [0, o.chop * kx])
  }))
  const amp = p.amp * (doubleChop ? o.chop : 1)
  return { f: ifft2(prepped), L: o.L, scale: p.dsp * amp }
}
const sampleNearest = ({ f, L }, px, pz) => {
  let u = px / L; u -= Math.floor(u)
  let v = pz / L; v -= Math.floor(v)
  return f[Math.round(u * NI) % NI][Math.round(v * NI) % NI][0]
}
function foldMin(s) {
  let worst = Infinity
  // scan ~3 texture periods so every alignment of mesh step vs texel grid is seen
  const NX = Math.ceil(OCT[0].L * 3 / MESH), NY = 24
  for (const t of [3, 11, 19, 27, 41, 57]) {
    const F0 = dispField(0, s, t)
    const F1 = meshUsesOct1 ? dispField(1, s, t) : null
    const Dx = (px, pz) => sampleNearest(F0, px, pz) * F0.scale + (F1 ? sampleNearest(F1, px, pz) * F1.scale : 0)
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const px = i * MESH, pz = j * MESH
      worst = Math.min(worst, 1 - (Dx(px + MESH, pz) - Dx(px, pz)) / MESH)
    }
  }
  return worst
}
const jStorm = foldMin(1)
ok('no mesh folds at full storm (min Jacobian > 0.02)', jStorm > 0.02, `min Jacobian = ${jStorm.toFixed(3)} (pre-fix was -1.17)`)
const jMid = foldMin(0.5)
ok('fold margin at moderate storm', jMid > 0.4, `min Jacobian = ${jMid.toFixed(3)}`)

function finish() {
  const failures = results.filter(r => !r.pass)
  if (asJson) console.log(JSON.stringify({ pass: failures.length === 0, results }, null, 2))
  else console.log(failures.length ? `\noceanfold: ${failures.length} FAILURE(S)` : '\noceanfold: all green')
  process.exit(failures.length ? 1 : 0)
}
finish()
