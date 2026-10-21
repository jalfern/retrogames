// oceanfoam — deterministic guard for #462 item 1 (foam edges close-up).
//
// Foam on crests must DISSOLVE down the lee face (the side dropping along the
// wind) and break into sub-meter ripples before vanishing — the old build
// painted smooth blobs on both faces. Pixels cannot prove it: whitecap phase
// swings frame-to-frame (foam px ranged 800-9300 on identical builds, see
// oceancheck), so this replicates the fs_main foam-edge math on CPU with the
// constants and structure PARSED from the demo itself — retuning the shader
// cannot silently drift the guard, deleting the feature fails the structure.
//
// Usage: node scripts/oceanfoam.mjs [--file <path>] [--json]
// Proven-fail mutants: FOAM_LEE amp → 0 (no dissolve), FOAM_FINE → 0.55
// (metre-scale ripples), dropping `-kw` → `kw` (foam dissolves windward),
// dropping `* det` (distant foam aliases), deleting the f *= lines.

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
const ok = (name, pass, detail) => { results.push({ name, pass, detail }); if (!asJson) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); }

let LEE, FINE
try {
  LEE = new Function(`return ${src.match(/const FOAM_LEE = (\[[^\]]+\]);/)[1]}`)()
  FINE = +src.match(/const FOAM_FINE = ([\d.]+)/)[1]
} catch { ok('parses FOAM_LEE / FOAM_FINE from the demo', false); finish() }
ok('parses FOAM_LEE / FOAM_FINE from the demo', true, `FOAM_LEE=[${LEE}] FOAM_FINE=${FINE}`)
const [LEE0, LEE1, LEEA] = LEE

// the lee face must be measured as the along-wind slope of the octave-graded
// surface gradient — wind and both spectral octaves, not one fixed axis.
ok('lee face = along-wind slope of graded gradient (both octaves)',
  /let kw = \(gx0c \+ [\d.]+ \* gx1c\) \* wdir\.x \+ \(gz0c \+ [\d.]+ \* gz1c\) \* wdir\.y;/.test(src))

// dissolve direction: height dropping ALONG the wind (kw < 0) is the lee side.
ok('foam dissolves downwind (-kw), not windward',
  new RegExp(`smoothstep\\(\\$\\{FOAM_LEE\\[0\\]\\}, \\$\\{FOAM_LEE\\[1\\]\\}, -kw\\)`).test(src))

// distant foam must neither alias the sub-meter ripple nor pay for it
ok('lee gate fades with view distance (det)', /, -kw\) \* det;/.test(src))

// the foam coefficient itself carries both effects
ok('f scales by lee dissolve (f *= mix(1.0, 1.0 - amp, leeK))',
  /f \*= mix\(1\.0, 1\.0 - \$\{FOAM_LEE\[2\]\}, leeK\)/.test(src))
const RB = src.match(/mix\(1\.0, ([\d.]+) \+ ([\d.]+) \* rip, leeK\)/)
ok('f breaks up at the lee via ripple noise (mix toward rip)', !!RB, RB ? `span [${RB[1]}, ${(1 - +RB[1] + +RB[2]).toFixed(2)}] at full lee` : undefined)

// sub-meter ripple scale, yet resolvable on screen (≈40 px/m close-up)
const WL = 2 * Math.PI / FINE
ok('ripple scale is sub-metre (<1.2 m) and resolvable (≥0.4 m)', WL < 1.2 && WL >= 0.4, `wavelength ${WL.toFixed(2)} m`)

// numeric sweep of the parsed dissolve profile: crest and windward unaffected,
// full fade at the steep lee foot, monotonic down the lee.
const ss = (e0, e1, x) => { const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t) }
const eff = kw => 1 - LEEA * ss(LEE0, LEE1, -kw)
const sweep = [-0.5, -0.3, -0.2, -0.1, 0, 0.1, 0.3, 0.5].map(eff)
ok('dissolve profile: full at crest, zero on windward, monotonic on lee',
  eff(0) === 1 && eff(0.5) === 1 && eff(-0.5) <= 1 - LEEA * 0.9 &&
  sweep.every((v, i) => i === 0 || v >= sweep[i - 1] - 1e-9) && LEEA >= 0.3,
  `kw −0.5→0.5: ${sweep.map(v => v.toFixed(2)).join(' ')}`)

// foam breakup span must straddle mid-strength: rippling, not uniform dimming
if (RB) {
  const lo = +RB[1], hi = lo + +RB[2]
  ok('breakup span straddles mid foam (edges shred, not darken)', lo <= 0.55 && hi >= 1.15, `edge factor spans ${lo.toFixed(2)}..${hi.toFixed(2)} at full lee`)
}

function finish() {
  const failures = results.filter(r => !r.pass)
  if (asJson) console.log(JSON.stringify({ pass: failures.length === 0, results }, null, 2))
  else console.log(failures.length ? `\noceanfoam: ${failures.length} FAILURE(S)` : '\noceanfoam: all green')
  process.exit(failures.length ? 1 : 0)
}
finish()
