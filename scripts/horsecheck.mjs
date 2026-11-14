// horsecheck — self-verifying harness for public/demos/horse.html (STRIDELINE,
// #2147: a procedural low-poly thoroughbred at a seamless rotary gallop,
// rendered by a hand-written perspective painter on Canvas 2D — no libraries).
//
// Proves three things:
//   1. BOOTS  — DEV hook ready, rAF advancing, zero page errors, the scene
//               actually paints (cool dusk sky over warm steppe).
//   2. RULES  — the gallop laws hold from the gait law itself:
//               footfall order LF·RF·LH·RH (rotary, not a fast walk),
//               a suspension phase with every hoof airborne,
//               stance hooves NEVER slide (ground-frame slip < 1 mm — the
//               headline promise of the brief),
//               stance hooves sit on the ground and swing hooves clear it,
//               the seam is exact: stateAt(0) ≡ stateAt(1) to float noise,
//               and the declared loop (8 strides = 48 m) is the real period.
//   3. PIXELS — chestnut body, dark hooves, pale mane on canvas; the drawn
//               sprite matches the logical state (project the barrel centre,
//               find body colour there); the cast shadow darkens the ground;
//               dust appears just after a hooffall; mesas sit on the horizon.
//   3b. POLISH (#2162) — lateral body roll and poll nod ride φ (integer
//               harmonics, so the seam gate covers them); the loaded stance
//               leg springs (flex peaks mid-stance, zero at both contact
//               edges); hoofbeats are layered — click+thump on every beat,
//               sub-thump on the heavy hind pair.
//   3c. POLISH 2 (#2220) — mane/tail flutter carries cross-stride noise
//               seeded on stride mod 8 (seam-safe: stride 0 ≡ stride 8, yet
//               neighbours differ); speed streaks whip backward every stride
//               (law + φ-seam); foreground shows painted track ruts and the
//               mid ground carries olive sage tufts (band pixel probes).
//   3d. POLISH 3 (#2224) — the torso row reads as one mass: blend cuboids
//               overlap tail→front with no daylight step and the top line
//               bridges to the withers gently; every limb carries a knee knob
//               and the hind pair the rearward hock (double-bend, φ-pure);
//               hoofprints appear behind the landings once the dust settles,
//               fade with age and loop with φ; hind landings throw grit while
//               fore landings pat silently; one breath swell per stride rides
//               the suspension (counted headless like the #2162 layers).
//   + DEMO LAW — self-contained page, not registered in games.js, credits
//               card and index entry present.
//
// Proven-fail mutants (run by hand, 2026-11-12, then restored):
// 1. horse.html hoofBody stance — `leg.xLand - STRIDE * ur` -> `... * ur * 0.7`:
//    the hoof rides with the body instead of locking to the ground. EXACTLY
//    the slip gate goes RED (241–387 mm per stance); everything else green.
// 2. LEGS LF contact `c: 0.00` -> `c: 0.60` (fore pair lands after the hind
//    pair): the footfall-order gate goes RED (saw RFLHRHLF — a pace-like gait)
//    and the dust gate with it (both probe the LF hooffall) — 30/32.
// #2162 polish mutants (run by hand, 2026-11-14, then restored):
// 3. bodyMotion `roll: <both harmonics>` -> `roll: 0`: EXACTLY the roll gate
//    red (0.000 rad), 36/37. (Zeroing only the first harmonic is NOT caught —
//    the second keeps |roll| in band; that is by design, the gate proves the
//    law, not the constant.)
// 4. audioTick `snd.clk++` deleted: EXACTLY the two hoofbeat-layer gates red
//    (click 0 vs thud 77), 35/37.
// 5. hoofFlex `return u >= 0 ? Math.sin(...)` -> `return 0`: the flex gate and
//    the hoof-pixel gate red (fetlock rotation was load-bearing for the dark
//    hoof sample), 35/37.
// #2220 polish-2 mutants (run by hand, 2026-11-14, then restored):
// 6. maneCoeff `return 1 + 0.95 * lerp(a, b, e)` -> `return 1`: EXACTLY the
//    wander gate red (drift 0.00) — the seam gate correctly stays green.
// 7. `const RUTB = [[..],[..]]` -> `const RUTB = []`: the ground-detail law
//    gate (ruts 0) and the rut pixel gate (0 px) red — tufts stay green, 42/44.
// #2224 polish-3 mutants (run by hand, 2026-11-14, then restored):
// 8. hock landmark `hx: hock[0], hy: hock[1]` -> `hx: null, hy: null`:
//    EXACTLY the hind double-bend gate red, 57/58.
// 9. withers bridge R(0.86,..)+profile -> R(1.20,..)/[0.96,..]: the overlap law
//    gate red (+1 collateral: the stranded box paints over the hoof sample —
//    proof the geometry moved, not a gate coupling), 56/58.
// 10. audioTick breath crossing neutered (`if (false && ...)`): EXACTLY the two
//     breath gates red (breath 0 vs click 71), 56/58.
// Lesson banked: DEV setPhase now WRAPS phi like stateAt does — passing p>1 to
// the raw leg math produced unwrapped swing values (a fake seam break).
// Speed streaks are law-proven (anchors + phi-seam) like the #2162 sound
// layers: their pixel signature sits ~15 luminance points under the sand and
// a colour gate would be flaky; deleting the model fails the law gates.
//
// Usage: node scripts/horsecheck.mjs [--shots <dir>] [--json]
// Needs a dev server serving public/demos (DEV_PORT, default 5173).

import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { launch, requireDevServer, opt } from './lib/harness.mjs'

const args = process.argv.slice(2)
const shots = resolve(opt(args, '--shots', 'scripts/.shots/horse'))
mkdirSync(shots, { recursive: true })

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/demos/`
const URL_DEMO = BASE + 'horse.html'
await requireDevServer(BASE)

let pass = 0, fail = 0
function ok(name, cond, extra) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  (' + extra + ')' : ''))
  if (cond) pass++; else fail++
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1180, height: 780 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(45000)
let pageErrors = 0
page.on('pageerror', e => { pageErrors++; console.log('[pageerror]', e.message) })

await page.goto(URL_DEMO + '?lite=1', { waitUntil: 'load' })
await page.waitForFunction(() => window.__horseTest && window.__horseTest.ready, null, { timeout: 15000 })

/* ---------------- 1. BOOTS ---------------- */
ok('DEV hook exists', true)
const f1 = await page.evaluate(() => window.__horseTest.frames())
const grown = await page.waitForFunction('window.__horseTest.frames() > ' + (f1 + 20), null, { timeout: 8000 }).then(() => true).catch(() => false)
ok('the sim is live on load (rAF advancing)', grown, 'frames ' + f1 + ' -> ' + await page.evaluate(() => window.__horseTest.frames()))
ok('zero page errors while booting', pageErrors === 0, pageErrors + ' errors')

const lit = await page.evaluate(() => window.__horseTest.countPixels((r, g, b) => r + g + b > 240, 3))
ok('the scene paints (lit samples across the canvas)', lit > 5000, lit + ' lit px')
const skyTop = await page.evaluate(() => window.__horseTest.pixel(590, 40))
const skyHz = await page.evaluate(() => window.__horseTest.pixel(300, Math.round(0.30 * 780)))
ok('dusk sky: cool crown over a warm horizon band', skyTop[2] > skyTop[0] && skyHz[0] > skyHz[2] + 40, 'top ' + skyTop + ' horizon ' + skyHz)
const gnd = await page.evaluate(() => {
  const cv = document.querySelector('canvas#c')
  const img = cv.getContext('2d').getImageData(0, Math.round(cv.height * 0.82), cv.width, Math.round(cv.height * 0.16)).data
  let warm = 0, tot = 0
  for (let i = 0; i < img.length; i += 8) { tot++; if (img[i] > 110 && img[i] > img[i + 2]) warm++ }
  return { warm, tot, ratio: warm / tot }
})
ok('steppe ground fills the foreground (majority warm)', gnd.ratio > 0.55, JSON.stringify(gnd))

/* ---------------- 2. RULES (gait law) ---------------- */
await page.evaluate(() => { const t = window.__horseTest; t.resume(); t.reset(); })
await page.waitForFunction(() => window.__horseTest.gait().order.length === 8, null, { timeout: 6000 })
const gait = await page.evaluate(() => window.__horseTest.gait())
ok('rotary footfall order LF·RF·LH·RH (a true gallop)', gait.order === 'LFRFLHRH', 'saw ' + (gait.order || 'nothing'))
ok('a suspension phase exists (all four hooves airborne)', gait.suspFrac > 0.2, (gait.suspFrac * 100).toFixed(0) + '% of the stride')

const ff = await page.evaluate(() => {
  const out = []
  for (let i = 0; i <= 200; i++) out.push(window.__horseTest.footfall(i / 200))
  return out
})
let air = 0, anyContact = false
for (const s of ff) {
  const n = Object.values(s).filter(v => v.contact).length
  if (n === 0) air++
  if (n > 0) anyContact = true
}
ok('scanned sweep agrees: moments of full suspension mid-stride', air > 10 && anyContact, air + '/201 samples airborne')
const duties = ff[0]
const dutyOk = Object.values(duties).every(v => v.d > 0.05 && v.d < 0.5)
ok('every stance is short and finite (gallop duty 0.05–0.5)', dutyOk, JSON.stringify(Object.fromEntries(Object.entries(duties).map(([k, v]) => [k, v.d]))))

// slip: run ~2 s of real time, then the audit must report plant-grade stillness
await page.waitForFunction(() => window.__horseTest.gait().order.length === 8 && window.__horseTest.frames() > 90, null, { timeout: 12000 })
const slip = await page.evaluate(() => window.__horseTest.slipMax())
const slipOk = Object.values(slip).every(v => v < 1)
ok('stance hooves never slide — ground-frame slip < 1 mm', slipOk, JSON.stringify(slip) + ' mm')

// stance hooves sit grounded; swings clear the ground
const hoovesSeam = await page.evaluate(() => {
  const st = []
  for (let i = 0; i <= 100; i++) st.push(window.__horseTest.stateAt(i / 100))
  return st
})
let stanceLow = true, swingHigh = { LF: 0, RF: 0, LH: 0, RH: 0 }
for (const s of hoovesSeam) {
  for (const n of ['LF', 'RF', 'LH', 'RH']) {
    if (s[n].contact) { if (s[n].y > 0.35 || s[n].y < -0.05) stanceLow = false }
    else swingHigh[n] = Math.max(swingHigh[n], s[n].y)
  }
}
ok('hooves in stance touch down at ground height', stanceLow, JSON.stringify(hoovesSeam[20].LF.y.toFixed(2)))
const swingClear = Object.values(swingHigh).every(v => v > 0.25)
ok('swing hooves clear the ground (≥25 cm arc)', swingClear, JSON.stringify(Object.fromEntries(Object.entries(swingHigh).map(([k, v]) => [k, v.toFixed(2)]))))

const s0 = hoovesSeam[0], s1 = hoovesSeam[100]
function deepClose(a, b) {
  if (typeof a === 'number') return Math.abs(a - b) < 1e-9
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => deepClose(v, b[i]))
  if (a && typeof a === 'object') return Object.keys(a).every(k => deepClose(a[k], b[k]))
  return a === b
}
ok('seam: state at phase 0 equals phase 1 to float noise', deepClose(s0, s1))
// the stride must also be CONTINUOUS at every touchdown — the swing reaches
// the exact spot the next stance starts (to the micron)
const ffC = await page.evaluate(() => {
  const t = window.__horseTest
  const ff = t.footfall(0)
  const out = {}
  for (const n of Object.keys(ff)) {
    const c = ff[n].c
    out[n] = [t.stateAt(c - 1e-5)[n].x, t.stateAt(c + 1e-5)[n].x]
  }
  return out
})
const contOk = Object.values(ffC).every(v => Math.abs(v[0] - v[1]) < 1e-3)
ok('stride continuity at every touchdown (swing reaches the landing spot)', contOk, JSON.stringify(ffC))
ok('loop law: 8 strides × 6 m = 48 m pattern, speed = stride ÷ period', gait.seam === 48 && gait.loopStrides === 8 && Math.abs(gait.speed - gait.stride / gait.period) < 1e-9)

/* ---------------- 2b. POLISH LAWS (#2162: roll, nod, stance flex) ---------------- */
const rollAmp = Math.max(...hoovesSeam.map(s => Math.abs(s.roll)))
ok('lateral body roll rides the stride — present but subtle (10–120 mrad)', rollAmp > 0.010 && rollAmp < 0.12, rollAmp.toFixed(3) + ' rad')
const nodAmp = Math.max(...hoovesSeam.map(s => Math.abs(s.nod)))
ok('head/neck nods on the suspension (20–150 mrad)', nodAmp > 0.020 && nodAmp < 0.15, nodAmp.toFixed(3) + ' rad')
// the loaded limb springs (knee-snap + fetlock flex): flex peaks mid-stance
// and is ZERO at both contact edges — a non-zero edge would pop the knee at
// touchdown — and swings carry no stance flex at all
const flex = await page.evaluate(() => {
  const t = window.__horseTest, ff = t.footfall(0), out = {}
  for (const n of Object.keys(ff)) {
    const { c, d } = ff[n]
    out[n] = {
      mid: +t.stateAt(c + d / 2)[n].fx.toFixed(4),
      atLand: +t.stateAt(c + 1e-9)[n].fx.toFixed(6),
      atLift: +t.stateAt(c + d - 1e-9)[n].fx.toFixed(6),
      swing: t.stateAt(c + d + (1 - d) / 2)[n].fx,
    }
  }
  return out
})
const flexOk = Object.values(flex).every(v => v.mid > 0.9 && Math.abs(v.atLand) < 1e-5 && Math.abs(v.atLift) < 1e-3 && v.swing === 0)
ok('stance legs spring mid-stance, rigid at touchdown/liftoff, swing unflexed', flexOk, JSON.stringify(flex))

const dA = await page.evaluate(() => document.getElementById('st-d').textContent)
await page.waitForFunction(v => +document.getElementById('st-d').textContent > +v + 1, dA, { timeout: 8000 })
const dB = await page.evaluate(() => document.getElementById('st-d').textContent)
ok('distance accumulates on the HUD (the world really moves)', +dB > +dA, dA + ' -> ' + dB + ' m')

/* ---------------- 3. PIXELS ---------------- */
const chest = await page.evaluate(() => window.__horseTest.countPixels((r, g, b) => r > 120 && r < 230 && g > 60 && g < 160 && b < 120 && r - b > 45, 2))
ok('chestnut body pixels on canvas', chest > 400, chest + ' px')
const dark = await page.evaluate(() => window.__horseTest.countPixels((r, g, b) => r < 70 && g < 60 && b < 55, 2))
ok('dark hooves/muzzle pixels present', dark > 12, dark + ' px')
const pale = await page.evaluate(() => window.__horseTest.countPixels((r, g, b) => r > 185 && g > 155 && b > 105 && b < 185 && r - b < 85, 2))
ok('flaxen mane/tail pixels present', pale > 25, pale + ' px')
const bodyPt = await page.evaluate(() => {
  const t = window.__horseTest
  t.setPhase(0.45)
  const y = t.stateAt(0.45).bodyY
  const p = t.project([0, y, 0])
  if (!p) return null
  // warm chestnut mass around where the logical barrel projects
  const S = 14
  let warm = 0, tot = 0
  for (let dy = -S; dy <= S; dy += 3) for (let dx = -S; dx <= S; dx += 3) {
    const c = t.pixel(p[0] + dx, p[1] + dy); tot++
    if (c[0] > 110 && c[0] - c[2] > 30 && c[0] - c[1] > 20) warm++
  }
  return { p, ratio: warm / tot }
})
const bodyMatch = bodyPt && bodyPt.ratio > 0.5
ok('the drawn barrel sits where the logical body projects (sprite ↔ state)', bodyMatch, JSON.stringify(bodyPt))
// and a stance hoof: its logical position must land on a dark hoof pixel
const hoofPt = await page.evaluate(() => {
  const t = window.__horseTest
  t.setPhase(0.10)
  const st = t.stateAt(0.10)
  const p = t.project([st.RF.x, st.RF.y, -0.20])
  if (!p) return null
  let dark = 0, tot = 0
  for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) {
    const c = t.pixel(p[0] + dx, p[1] + dy); tot++
    if (c[0] < 110 && c[1] < 95 && c[2] < 85) dark++
  }
  return { p, dark, tot }
})
const hoofMatch = hoofPt && hoofPt.dark >= 6
ok('a stance hoof projects onto drawn hoof pixels (sprite ↔ state)', hoofMatch, JSON.stringify(hoofPt))
await page.evaluate(() => window.__horseTest.resume())

// shadow: sample the cast-shadow ellipse centre at a paused phase and compare
// against the same ground point mirrored away from the horse
const shad = await page.evaluate(() => {
  const t = window.__horseTest
  t.setPhase(0.30)
  const sh = t.project([-0.9, 0.02, 0.55])
  const free = t.project([3.6, 0.02, -2.6])
  if (!sh || !free) return null
  return { a: t.pixel(sh[0], sh[1]), b: t.pixel(free[0], free[1]) }
})
const shOk = shad && (shad.b[0] + shad.b[1] + shad.b[2]) - (shad.a[0] + shad.a[1] + shad.a[2]) > 28
ok('the cast shadow darkens the ground under the horse', shOk, JSON.stringify(shad))
await page.evaluate(() => window.__horseTest.resume())

// dust rides the first hooffall: freeze just after LF lands and count
// brighter-than-ground motes near the contact point, vs the same window
// mirrored to empty ground (the discriminating control)
const dust = await page.evaluate(() => {
  const t = window.__horseTest
  t.setPhase(0.05)
  const cv = document.querySelector('canvas#c')
  const g = cv.getContext('2d')
  const pred = (r, gg, b) => r > 205 && gg > 185 && b > 145 && b < 195 && r - b > 38 && r - gg > 12
  const count = (cx, cy, S) => {
    const x0 = Math.max(0, Math.round(cx - S)), y0 = Math.max(0, Math.round(cy - S))
    const w = Math.min(cv.width, x0 + 2 * S) - x0, h = Math.min(cv.height, y0 + 2 * S) - y0
    if (w <= 0 || h <= 0) return 0
    const img = g.getImageData(x0, y0, w, h).data
    let n = 0
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4
      if (pred(img[i], img[i + 1], img[i + 2])) n++
    }
    return n
  }
  const S = Math.round(56 * devicePixelRatio)
  const p = t.project([0.6, 0.14, 0.22])
  const q = t.project([-3.2, 0.14, -2.5])
  return p && q ? { motes: count(p[0], p[1], S), control: count(q[0], q[1], S) } : null
})
ok('dust puffs fly just after the first hooffall (vs an empty-ground control)', dust && dust.motes >= dust.control + 8, JSON.stringify(dust))
await page.evaluate(() => window.__horseTest.resume())

const mesa = await page.evaluate(() => window.__horseTest.countPixels((r, g, b) => r > 150 && r < 230 && r - b > 28 && Math.abs(r - g) < 40 && b > 110, 2))
ok('mesas stand on the far rim', mesa > 150, mesa + ' px')

/* ---------------- 3b. LAYERED HOOFBEATS (#2162) ---------------- */
// run the sim from a clean reset and count the φ-crossing beat layers:
// every hoofbeat = click + thump, heavy hind landings also get the sub-thump
await page.evaluate(() => { const t = window.__horseTest; t.reset(); t.unlock(); t.resume(); })
const f0 = await page.evaluate(() => window.__horseTest.frames())
await page.waitForFunction(f => window.__horseTest.frames() > f + 170, f0, { timeout: 15000 }).catch(() => {})
const snd = await page.evaluate(() => window.__horseTest.soundStats())
ok('every hoofbeat is layered — click and thump fire together (≥12 beats)', snd.click === snd.thud && snd.click >= 12, JSON.stringify(snd))
ok('heavy hind landings add a sub-thump (half the beats)', Math.abs(snd.sub * 2 - snd.click) <= 2 && snd.sub >= 6, JSON.stringify(snd))

/* ---------------- 3c. POLISH PASS 2 (#2220: cross-stride mane, ground detail, speed cue) ---------------- */
// cross-stride mane/tail noise: seeded on stride index mod LOOPS with a
// crossfade — stride n and n+8 must be BITWISE identical (the seam), while
// consecutive strides must visibly differ (the metronome feel breaks).
const mm = await page.evaluate(() => {
  const t = window.__horseTest
  return { c0: t.maneCoeff(0), c8: t.maneCoeff(8), c1: t.maneCoeff(1), c3: t.maneCoeff(3) }
})
ok('mane/tail noise is seam-commensurate: stride 0 ≡ stride 8 coefficients', JSON.stringify(mm.c0) === JSON.stringify(mm.c8), 'n=' + mm.c0.length)
const drift = mm.c0.reduce((s, v, i) => s + Math.abs(mm.c1[i] - v) + Math.abs(mm.c3[i] - v), 0)
const bounded = mm.c0.concat(mm.c1, mm.c3).every(v => v > 0.25 && v < 1.75)
ok('mane/tail amplitude wanders stride-to-stride, coefficients bounded', drift > 2.4 && bounded, 'drift ' + drift.toFixed(2))

// speed streaks: ground-hugging dashes whip backward every stride — law gate
// (anchor band + alpha bounds) and the φ = 0 ≡ φ = 1 seam.
const sk = await page.evaluate(() => {
  const t = window.__horseTest
  return { s: t.streaks(0.5), seam: JSON.stringify(t.streaks(0)) === JSON.stringify(t.streaks(1)) }
})
const skOk = sk.s.length === 6 && sk.s.every(a => a[0] > -2.6 && a[0] < 2.6 && a[1] > 0.04 && a[1] < 0.20 && Math.abs(a[2]) <= 1.35 && a[3] > 0.09 && a[3] < 0.19)
ok('speed streaks hug the ground behind the horse, alpha subtle', skOk, JSON.stringify(sk.s[0]))
ok('speed streaks loop with the stride (φ 0 ≡ φ 1)', sk.seam)

// ground detail: ruts + tufts are law-provable (per-frame anchors) and
// visible in a foreground pixel band. Probed at a pinned travel (the ground
// window slides with the loop, so a fixed offset makes the pixel counts
// deterministic): measured rut ≈600, tuft ≈790 px at 1180×780 lite.
await page.evaluate(() => window.__horseTest.setTravel(12))
const glaw = await page.evaluate(() => {
  const t = window.__horseTest
  return { tufts: t.tufts(), ruts: t.ruts() }
})
ok('ground detail law: ~100 tufts track-side, 12 rut segments, outside the camera corridor',
  glaw.tufts.length >= 90 && glaw.tufts.length <= 112 && glaw.ruts.length === 12 &&
  glaw.tufts.every(v => Math.abs(v[1]) > 2.2 && Math.abs(v[1]) < 8 && Math.hypot(v[0] + 4.2, v[1] + 4.2) >= 5) &&
  glaw.ruts.every(v => Math.abs(v[1] + 0.75) < 2),
  'tufts ' + glaw.tufts.length + ', ruts ' + glaw.ruts.length)
const gd = await page.evaluate(() => {
  const cv = document.querySelector('canvas#c')
  const g = cv.getContext('2d')
  const yR0 = Math.round(cv.height * 0.72), yT0 = Math.round(cv.height * 0.40), yT1 = Math.round(cv.height * 0.72)
  const scan = (y0, h, pred) => {
    const img = g.getImageData(0, y0, cv.width, h).data
    let n = 0
    for (let i = 0; i < img.length; i += 8) if (pred(img[i], img[i + 1], img[i + 2])) n++
    return n
  }
  const rut = scan(yR0, cv.height - yR0, (r, gg, b) => r >= 140 && r <= 178 && gg >= 110 && gg <= 152 && b >= 85 && b <= 135 && r - gg >= 18 && r - gg <= 40 && r - b >= 45)
  const tuft = scan(yT0, yT1 - yT0, (r, gg, b) => gg - r >= 2 && gg - b >= 40 && gg > 100 && r <= 175)
  return { rut, tuft }
})
ok('track ruts paint dark ribbons through the foreground corridor', gd.rut > 300, gd.rut + ' px')
ok('sage brush tufts stand beside the track (olive tones)', gd.tuft > 400, gd.tuft + ' px')
await page.evaluate(() => window.__horseTest.resume())

/* ---------------- 3d. POLISH PASS 3 (#2224: blend, landmarks, prints, grit, breath) ---------------- */
// Torso silhouette row: the blend cuboids must overlap their neighbours (no
// daylight between haunch/barrel/chest) and span the whole body; the top line
// climbs to the withers without a visible step (>0.15 m was the reported fault).
const torso = await page.evaluate(() => window.__horseTest.torsoProfile())
const torShape = torso.length >= 5 && torso.every(b => b[1] - b[0] > 0.3 && b[2] > 0.3 && b[2] < 0.6)
const torOverlap = torso.slice(1).every((b, i) => b[0] < torso[i][1] - 0.10)
const torCovers = torso.length >= 5 && torso[0][0] <= -1.2 && torso[torso.length - 1][1] >= 0.95
ok('torso row: haunch/blend/barrel/chest/withers overlap — no daylight step', torShape && torOverlap && torCovers, JSON.stringify(torso))
const torSteps = torso.slice(1).map((b, i) => Math.abs(b[2] - torso[i][2]))
ok('top line bridges chest → withers gently (max step ≤ 0.15 m)', torSteps.length === 4 && Math.max(...torSteps) <= 0.155,
  'steps ' + torSteps.map(v => v.toFixed(3)).join(','))

// Skeletal landmarks: a knee knob on every limb; the hind pair additionally
// carries the hock — lower AND behind the stifle, the true double-bend read.
// The record must be φ-deterministic (0.10 ≡ 1.10) so the seam covers it.
const lm = await page.evaluate(() => {
  const t = window.__horseTest
  t.setPhase(0.10); const a = t.landmarks()
  t.setPhase(1.10); const b = t.landmarks()
  t.resume()
  return { a, b }
})
const fore = lm.a.filter(l => l.n[1] === 'F'), hind = lm.a.filter(l => l.n[1] === 'H')
ok('fore limbs carry a knee knob at the joint (no hock — single bend)',
  lm.a.length === 4 && fore.length === 2 && hind.length === 2 && fore.every(l => l.hx === null && l.ky > 0.3 && l.ky < 1.2),
  JSON.stringify(fore))
ok('hind limbs show the double-bend: hock behind and below the stifle',
  hind.every(l => l.hx !== null && l.hx < l.kx - 0.05 && l.hy < l.ky - 0.1 && l.hy > 0.4),
  JSON.stringify(hind))
// seam compare with a small tolerance: setPhase carries tRun float noise through
// acos-based IK, so JSON equality would be flaky where 5 mm is structural.
const lmDiff = lm.a.length === lm.b.length ? lm.a.reduce((s, l, i) => {
  const o = lm.b[i]
  if (l.n !== o.n) return s + 1
  return s + Math.abs(l.kx - o.kx) + Math.abs(l.ky - o.ky) + (l.hx === null ? 0 : Math.abs(l.hx - o.hx)) + (l.hy === null ? 0 : Math.abs(l.hy - o.hy))
}, 0) : 99
ok('landmarks are seam-commensurate (φ 0.10 ≡ φ 1.10)', lmDiff < 5e-3, 'drift ' + lmDiff.toFixed(6))

// Hoofprints: law-provable anchors — appear behind the touchdown point once the
// dust settles, fade with age, never coexist with the burst, loop with φ.
const pr = await page.evaluate(() => {
  const t = window.__horseTest
  return {
    mid: t.prints(0.35), late: t.prints(0.45), early: t.prints(0.05), zero: t.prints(0),
    seam: JSON.stringify(t.prints(0.35)) === JSON.stringify(t.prints(1.35)),
  }
})
ok('hoofprints trail the landings, riding back at STRIDE per stride',
  pr.mid.length === 2 && pr.mid.every(v => v[1] < -0.5 && Math.abs(v[2]) > 0.19 && Math.abs(v[2]) < 0.25 && v[3] > 0.02 && v[3] <= 0.34),
  JSON.stringify(pr.mid))
const fadeOk = pr.mid.length === 2 && pr.late.length === 2 &&
  pr.late.every(l => { const m = pr.mid.find(v => v[0] === l[0]); return m && l[3] < m[3] })
ok('prints fade as they age toward the end of their life', fadeOk, JSON.stringify(pr.late))
ok('no print while the dust burst is still up (same φ window)', pr.early.length === 0 && pr.zero.length === 0)
ok('hoofprints loop with the stride (φ 0.35 ≡ φ 1.35)', pr.seam)
// pixel proof: the RF print darkens the ground vs the same spot free of prints
const prpx = await page.evaluate(() => {
  const t = window.__horseTest
  t.setPhase(0.35); t.setTravel(12)
  const a = t.prints(0.35).find(v => v[0] === 'RF')
  if (!a) return null
  const p = t.project([a[1], 0.012, a[2]])
  const q = t.project([a[1], 0.012, a[2] - 1.5])   // same x, open ground well off the racing line
  if (!p || !q) return null
  const sample = (c) => { let s = 0, n = 0; for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) { const px = t.pixel(c[0] + dx, c[1] + dy); s += px[0] + px[1] + px[2]; n++ } return s / n }
  const out = { print: sample(p), free: sample(q) }
  t.resume()
  return out
})
ok('a fresh print visibly darkens the ground (vs an unprinted control)',
  prpx && prpx.free - prpx.print > 20, JSON.stringify(prpx))

// Hind landings skitter grit + spread a ground sheet; fore pat silently.
const gr = await page.evaluate(() => {
  const t = window.__horseTest
  t.setPhase(0.50); const a = t.grit()
  t.setPhase(0.60); const b = t.grit()
  t.resume()
  return { a, b }
})
ok('hind hooffall throws low grit (≤8 specks, hinds only; fore add none)',
  gr.a.length >= 1 && gr.a.length <= 8 && gr.a.every(v => v[0][1] === 'H'), JSON.stringify(gr.a.map(v => v[0])))
ok('grit settles fast — nothing skitters mid-suspension', gr.b.length === 0, JSON.stringify(gr.b))

// breath: one soft swell per stride riding the suspension (φ 0.70 crossing),
// counted headless like the other layers (#2162 pattern)
await page.evaluate(() => { const t = window.__horseTest; t.reset(); t.unlock(); t.resume(); })
const fb = await page.evaluate(() => window.__horseTest.frames())
await page.waitForFunction(f => window.__horseTest.frames() > f + 170, fb, { timeout: 15000 }).catch(() => {})
const snd2 = await page.evaluate(() => window.__horseTest.soundStats())
ok('one breath per stride, riding the suspension (never more than the beats)',
  snd2.breath >= Math.max(3, Math.floor(snd2.click / 4) - 2) && snd2.breath <= Math.ceil(snd2.click / 4) + 2 && snd2.breath * 4 <= snd2.click + 4, JSON.stringify(snd2))
ok('breath keeps stride-locked cadence: clicks ≈ 4× breath', Math.abs(snd2.breath * 4 - snd2.click) <= 8, JSON.stringify(snd2))
await page.evaluate(() => window.__horseTest.resume())

await page.screenshot({ path: resolve(shots, 'gallop.png') })

/* ---------------- 4. DEMO LAW ---------------- */
const html = readFileSync(resolve('public/demos/horse.html'), 'utf8')
const external = html.match(/(src|href)\s*=\s*["']https?:\/\//g) || []
ok('self-contained: zero external src/href in the page', external.length === 0, external.join(', '))
ok('no libraries: zero import/require in the page', !/\bimport\s|\brequire\(/.test(html))
const reg = readFileSync(resolve('src/config/games.js'), 'utf8')
ok('demos law: NOT registered in the arcade registry', !/STRIDELINE|'\/horse'|demos\/horse/i.test(reg))
ok('credits card present, solo, naming #2147 (+ #2220, #2224 polish)', /name:\s*'STRIDELINE'/.test(html) && /assist:\s*'solo'/.test(html) && /issues:\s*\[2147,\s*2220,\s*2224\]/.test(html))
const idx = readFileSync(resolve('public/demos/index.html'), 'utf8')
ok('index links the card and DEMO_INDEX carries the facts', /id="horse"/.test(idx) && /el:\s*'horse'/.test(idx))

/* ---------------- phone size ---------------- */
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(700)
const phoneLit = await page.evaluate(() => window.__horseTest.countPixels((r, g, b) => r + g + b > 240, 3))
ok('phone 390×844: the scene still renders', phoneLit > 2000, phoneLit + ' lit px')
await page.screenshot({ path: resolve(shots, 'phone.png') })
ok('zero page errors across the whole drive', pageErrors === 0, pageErrors + ' errors')

await browser.close()
console.log('\nhorsecheck: ' + pass + '/' + (pass + fail) + ' checks passed' + (fail ? ' — ' + fail + ' FAILED' : '  — OK'))
process.exit(fail ? 1 : 0)
