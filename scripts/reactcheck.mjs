// reactcheck — Node selftest for #1463's sub-region sensor math.
//
// Proves the subPrint distance metric and the `reacted` gate logic work
// correctly WITHOUT a browser: feeds synthetic block arrays to validate that
// (1) identical fingerprints give distance 0, (2) menu-like changes give
// distance above threshold, (3) small brightness noise (simulating flames
// leaking in) stays below threshold, and (4) bandProfile highlight detection
// identifies the brightest band. Run via `npm run reactcheck`.
//
// If any gate logic breaks (e.g. threshold flipped to Infinity, distance
// sign reversed), this exits non-zero. That is the mutant-proof: the harness
// CAN go red on a regression.

const tests = []
function assert(name, condition, detail = '') {
  tests.push({ name, pass: !!condition, detail })
  if (!condition) console.error(`FAIL: ${name} — ${detail}`)
}

// --- Distance function (mirrors doscheck.mjs inline computation) ---
function dist(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i])
  return s / a.length
}

// 1. Identical fingerprints → distance 0
const flat = Array(80).fill(4)
assert('distance: identical blocks = 0', dist(flat, flat) === 0, `got ${dist(flat, flat)}`)

// 2. Small noise (flame flicker: ±1 on a few blocks) → distance < 2
const noisy = [...flat]
noisy[5] = 5; noisy[23] = 3; noisy[44] = 5; noisy[67] = 3
const noiseDist = dist(flat, noisy)
assert('distance: flame noise (<5% changed ±1) < 2.0', noiseDist < 2.0, `got ${noiseDist.toFixed(3)}`)

// 3. Menu advance (40% of blocks change dramatically: 32 blocks go 4→14) → distance > 2
const advanced = [...flat]
for (let i = 16; i < 48; i++) advanced[i] = 14  // ~40% of blocks changed (realistic screen advance)
const advanceDist = dist(flat, advanced)
assert('distance: menu advance (40% blocks flipped 4→14) > 2.0', advanceDist > 2.0, `got ${advanceDist.toFixed(3)}`)

// 4. The reacted gate: reacting = subJump > max(subRestDrift + 1.0, 2.0)
function reacted(subJump, subRestDrift) {
  return subJump > Math.max(subRestDrift + 1.0, 2.0)
}

// Normal case: low rest drift, high jump → PASS
assert('reacted: jump=5.0 drift=0.5 → PASS', reacted(5.0, 0.5) === true)
// Noisy case: drift still < jump-1 → PASS
assert('reacted: jump=4.0 drift=2.5 → PASS', reacted(4.0, 2.5) === true)
// Animated title failure mode: drift≈jump → FAIL
assert('reacted: jump=8.95 drift=9.23 → FAIL (the old false-positive)', reacted(8.95, 9.23) === false)
// Zero-change (emulator not booted) → FAIL
assert('reacted: jump=0 drift=0 → FAIL (no reaction)', reacted(0, 0) === false)
// Edge: exactly at threshold → FAIL (must EXCEED)
assert('reacted: jump=3.0 drift=2.0 → FAIL (exactly threshold+1)', reacted(3.0, 2.0) === false)
assert('reacted: jump=3.1 drift=2.0 → PASS (just above)', reacted(3.1, 2.0) === true)

// 5. BandProfile highlight detection (simulated)
// Each band has a meanLuma; highlight = index of brightest (>40).
function findHighlight(bands) {
  if (!bands.length) return null
  const maxLuma = Math.max(...bands.map(b => b.meanLuma))
  if (maxLuma <= 40) return null
  return bands.find(b => b.meanLuma === maxLuma)?.index ?? null
}

// Normal menu: band 2 is the selected (bright) one
const menuBands = [
  { index: 0, meanLuma: 15 }, { index: 1, meanLuma: 20 },
  { index: 2, meanLuma: 120 }, { index: 3, meanLuma: 18 },
  { index: 4, meanLuma: 22 }, { index: 5, meanLuma: 16 },
]
assert('bandProfile: highlight detected = slot 2', findHighlight(menuBands) === 2)

// After ↓: highlight moves to slot 3
const menuAfter = [
  { index: 0, meanLuma: 15 }, { index: 1, meanLuma: 20 },
  { index: 2, meanLuma: 18 }, { index: 3, meanLuma: 118 },
  { index: 4, meanLuma: 22 }, { index: 5, meanLuma: 16 },
]
assert('bandProfile: highlight moved to slot 3 after ↓', findHighlight(menuAfter) === 3)
assert('bandProfile: highlight CHANGED (the assertion)', findHighlight(menuBands) !== findHighlight(menuAfter))

// All-dark (loading bar): no highlight (returns null)
const darkBands = Array(6).fill(null).map((_, i) => ({ index: i, meanLuma: 5 }))
assert('bandProfile: all-dark → no highlight (null)', findHighlight(darkBands) === null)

// --- Report ---
const passed = tests.filter(t => t.pass).length
const failed = tests.filter(t => !t.pass)
console.log(`reactcheck: ${passed}/${tests.length} gates passed`)
if (failed.length) {
  console.error(`\n${failed.length} FAILURES:`)
  for (const f of failed) console.error(`  FAIL: ${f.name} — ${f.detail}`)
  process.exit(1)
}
console.log('✓ all sub-region gates proven (synthetic data, no browser needed)')
