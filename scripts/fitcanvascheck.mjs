// fitcanvascheck — the pure scale decision behind src/utils/fitCanvas.js, in Node.
//
// Proves fitScale picks the largest INTEGER whole-multiple scale that fits the
// container at the current devicePixelRatio, so the display backing is always an
// exact multiple of the source and its CSS size maps 1:1 to device pixels.
// Two mutants that die: one forgets dpr (underscales on Retina), one rounds up
// with ceil (overflows the container and re-introduces a fractional crop).

import { fitScale, fitFill } from '../src/utils/fitCanvas.js'
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++ } else { fail++; console.error(`  FAIL: ${msg}`) } }
const near = (a, b) => Math.abs(a - b) < 1e-6

// --- 1. 1x, exactly one source across: scale 1, no growth ---
{
  const f = fitScale(256, 224, 256, 224, 1)
  ok(f.s === 1 && f.bw === 256 && f.bh === 224, `1x exact -> s=1 (got s=${f.s} ${f.bw}x${f.bh})`)
  ok(near(f.cssW, 256) && near(f.cssH, 224), `1x exact CSS = backing (got ${f.cssW}x${f.cssH})`)
}

// --- 2. 2x Retina, a source-sized CSS box (= 2× the source in device px): scale 2 ---
// 256×224 CSS at dpr 2 is 512×448 device px, so the backing grows to 2× (512×448)
// while the CSS footprint stays a source-sized 256×224.
{
  const f = fitScale(256, 224, 256, 224, 2)
  ok(f.s === 2 && f.bw === 512 && f.bh === 448, `2x source-sized box -> s=2 (got s=${f.s} ${f.bw}x${f.bh})`)
  ok(near(f.cssW, 256) && near(f.cssH, 224), `2x CSS folds back to the source (got ${f.cssW}x${f.cssH})`)
}

// --- 3. Whole-multiple backing: bw/bh are always exact multiples of W/H ---
for (const [W, H, cssW, cssH, dpr] of [
  [256, 224, 390, 844, 3], [100, 100, 100, 100, 2], [320, 180, 1440, 900, 2], [64, 64, 500, 500, 1],
]) {
  const f = fitScale(W, H, cssW, cssH, dpr)
  ok(f.bw % W === 0 && f.bh % H === 0, `backing ${f.bw}x${f.bh} is a whole multiple of ${W}x${H}`)
  ok(f.s >= 1, `scale is at least 1 (got ${f.s})`)
}

// --- 4. "Fill as much as a whole multiple allows": floor, never overflow ---
// A container just under 2× must stay at s=1; exactly 2× steps up to s=2.
{
  const under = fitScale(256, 224, 511, 1000, 1)
  const exact = fitScale(256, 224, 512, 1000, 1)
  ok(under.s === 1 && under.bw === 256, `511px wide (just under 2×) stays s=1 (got s=${under.s})`)
  ok(exact.s === 2 && exact.bw === 512, `512px wide (exactly 2×) steps up to s=2 (got s=${exact.s})`)
}

// --- 5. The limiting dimension is the smaller ratio (contain, not cover) ---
{
  const wide = fitScale(256, 224, 2000, 448, 1)   // height limits to 2×
  const tall = fitScale(256, 224, 512, 9000, 1)   // width limits to 2×
  ok(wide.s === 2 && wide.bh === 448, `wide container: height caps the scale (got s=${wide.s})`)
  ok(tall.s === 2 && tall.bw === 512, `tall container: width caps the scale (got s=${tall.s})`)
}

// --- 6. dpr multiplies the backing but not the CSS footprint ---
// Same 100×100 source, 100×100 CSS box: at dpr 2 the backing is 200×200 but it
// still only occupies 100×100 CSS px (so it maps 1:1 to the 200×200 device px).
{
  const f1 = fitScale(100, 100, 100, 100, 1)
  const f2 = fitScale(100, 100, 100, 100, 2)
  ok(f1.s === 1 && f1.bw === 100, `dpr 1: s=1 backing 100 (got s=${f1.s} ${f1.bw})`)
  ok(f2.s === 2 && f2.bw === 200 && f2.bh === 200, `dpr 2: backing doubles to 200 (got ${f2.bw}x${f2.bh})`)
  ok(near(f2.cssW, 100) && near(f2.cssH, 100), `dpr 2: CSS footprint unchanged (got ${f2.cssW}x${f2.cssH})`)
}

// --- 7. CSS size maps 1:1 to device pixels (cssW * dpr === backing) ---
for (const [W, H, cssW, cssH, dpr] of [[256, 224, 390, 844, 3], [100, 100, 100, 100, 2], [320, 180, 1440, 900, 2]]) {
  const f = fitScale(W, H, cssW, cssH, dpr)
  ok(near(f.cssW * dpr, f.bw), `cssW*dpr === backing width (got ${f.cssW * dpr} vs ${f.bw})`)
  ok(near(f.cssH * dpr, f.bh), `cssH*dpr === backing height (got ${f.cssH * dpr} vs ${f.bh})`)
  // And it must still fit the container after the dpr fold-back.
  ok(f.cssW <= cssW + 1e-6 && f.cssH <= cssH + 1e-6, `display fits the container (got ${f.cssW}x${f.cssH} in ${cssW}x${cssH})`)
}

// --- 8. Degenerate / invalid input never crashes, falls back to s=1 ---
{
  const zero = fitScale(256, 224, 0, 0, 1)
  ok(zero.s === 1 && zero.bw === 256 && zero.bh === 224, `zero container -> s=1 fallback (got s=${zero.s})`)
  const badDpr0 = fitScale(256, 224, 512, 448, 0)
  ok(badDpr0.s === 2 && badDpr0.bw === 512, `dpr 0 treated as 1 (got s=${badDpr0.s})`)
  const badDprNaN = fitScale(256, 224, 512, 448, NaN)
  ok(badDprNaN.s === 2 && badDprNaN.bw === 512, `dpr NaN treated as 1 (got s=${badDprNaN.s})`)
}

// --- 9. Mutant that dies: dpr is ignored (always 1) ---
// On a 2x panel the real logic scales the backing up; the mutant leaves it at
// the source size, so the display is a soft 1:1-upscale instead of crisp 2x.
{
  const in_ = [100, 100, 100, 100, 2]
  const real = fitScale(...in_)
  const mutant = fitScale(in_[0], in_[1], in_[2], in_[3], 1)
  ok(real.s !== mutant.s, `ignore-dpr mutant diverges on a 2x box (real s=${real.s}, mutant s=${mutant.s})`)
  ok(mutant.bw < real.bw, `ignore-dpr mutant under-scales the backing (mutant ${mutant.bw} < real ${real.bw})`)
}

// --- 10. Mutant that dies: ceil instead of floor (overflows the container) ---
// Rounding up makes the display bigger than the container on a just-under case,
// which is exactly the soft/fractional edge this whole change removes.
{
  const [W, H, cssW, cssH] = [256, 224, 511, 1000]
  const real = fitScale(W, H, cssW, cssH, 1)
  const mutantS = Math.max(1, Math.ceil(Math.min((cssW * 1) / W, (cssH * 1) / H)))
  const mutant = { s: mutantS, bw: W * mutantS, cssW: (W * mutantS) / 1 }
  ok(mutant.s > real.s, `ceil mutant rounds up past the real scale (mutant s=${mutant.s} > real s=${real.s})`)
  ok(mutant.cssW > cssW, `ceil mutant overflows the container (cssW ${mutant.cssW} > ${cssW}) — the bug`)
  ok(real.cssW <= cssW, `real floor result fits (cssW ${real.cssW} <= ${cssW})`)
}

// --- 11. #739 fitFill: phone boxes FILL, they don't quarter (#739 bug) ---
// iPhone-class width 390 → 382 usable for a 256-wide source: the old floor
// answered 1 (256 px of a 390 px screen = the quarter-screen bug). fitFill
// answers ~1.49 and the canvas spans the phone.
{
  const s = fitFill(256, 224, 382, 540)
  ok(s > 1.4 && s < 1.5, `iPhone portrait 382x540 fills width (got s=${s.toFixed(3)}, old floor: 1)`)
  ok(s * 256 <= 382 + 1e-6 && s * 224 <= 540 + 1e-6, `fitFill never overflows (got ${s * 256}x${s * 224} in 382x540)`)
  const floorMutant = Math.max(1, Math.floor(Math.min(382 / 256, 540 / 224)))
  ok(s > floorMutant, `integer-floor mutant leaves the phone quartered (mutant s=${floorMutant}, real s=${s.toFixed(3)})`)
}

// --- 12. fitFill keeps whole numbers where they already fill ---
// Desktop boxes where contain lands on an integer must stay integer (crisp),
// and fitFill is never SMALLER than the whole-multiple fitScale (never shrinks).
{
  ok(fitFill(256, 224, 512, 1000) === 2, `exact 2x box stays integer s=2 (got ${fitFill(256, 224, 512, 1000)})`)
  ok(fitFill(256, 224, 768, 1000) === 3, `exact 3x box stays integer s=3 (got ${fitFill(256, 224, 768, 1000)})`)
  let shrink = false
  for (const [W, H, cssW, cssH] of [
    [256, 224, 382, 540], [256, 240, 382, 700], [256, 224, 1016, 640], [256, 224, 511, 1000], [200, 100, 405, 1000],
  ]) {
    if (fitFill(W, H, cssW, cssH) < fitScale(W, H, cssW, cssH, 1).s - 1e-9) shrink = true
  }
  ok(!shrink, `fitFill >= whole-multiple fit everywhere (integer kept where it fills)`)
}

// --- 13. fitFill floors at 1 and survives degenerate input ---
{
  ok(fitFill(256, 224, 100, 100) === 1, `tiny container never shrinks below 1 (got ${fitFill(256, 224, 100, 100)})`)
  ok(fitFill(256, 224, 0, 0) === 1, `zero container -> s=1 (got ${fitFill(256, 224, 0, 0)})`)
}

// --- 14. #739 source gate: the three games use fitFill, no floor-leftover ---
// The bug lived in per-game resize() copies of Math.floor(...). A game drifting
// back to floor (or to a hand-rolled min) reds this gate without a browser.
for (const game of ['QBert', 'Tetris', 'Joust']) {
  const src = readFileSync(new URL(`../src/games/${game}/index.jsx`, import.meta.url), 'utf8')
  ok(/from '\.\.\/\.\.\/utils\/fitCanvas'/.test(src), `${game} imports fitCanvas`)
  ok(/const s = fitFill\(W, H, r\.width - 8, r\.height - 60\)/.test(src), `${game} resize uses fitFill`)
  ok(!/Math\.floor\(Math\.min\(\(r\.width/.test(src), `${game} has no leftover integer-floor resize (the #739 bug)`)
}

// --- Summary ---
const total = pass + fail
console.log(`fitcanvascheck: ${pass}/${total} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
