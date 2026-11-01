// learnedwalkcheck — self-verifying harness for public/demos/learnedwalk.html +
// learnedwalk.core.js + learnedwalk.policy.js (LEARNED WALK, #1205: the
// PHYSICS WALK rig steered by a trained neural policy — no hand-written
// balance controller at play time).
//
// Gates:
//   1. POLICY  — ships with net shape matching the core, a checkpoint series,
//      and honest facts; training is REAL: the final policy out-survives the
//      exact-zero net (the bare unactuated rig) across seeds AND beats its own
//      gen-0 checkpoint (the evocheck ratio rule).
//   2. HONESTY — determinism (same seed => identical bytes); the net actually
//      reacts (outputs vary inside an episode); mirrored legs; motors CUT when
//      fallen (a toppled walker goes limp, gravity takes him); hard shoves
//      still topple — physics stayed physics.
//   3. EPISODE — the inline robot-kit recorder (#1141) emits retrogames-rec/v1
//      + episode blocks that satisfy the kit's rules: one pad per tick, hashes
//      increasing with the final hash at the last tick, pose track finite and
//      matching poseCount, task/success/methods/assets present.
//   4. BOOTS   — attract first, key/tap starts, pushes respond, the scrubber
//      changes what the walker can do (gen 0 must fall faster than the final
//      policy — the learning is visible live), a run exports an episode from
//      the browser, phone 390x844 taps alive, zero page errors.
//   5. DEMO LAW — self-contained (relative siblings only), not in games.js,
//      credits + index card.
//
// Proven-fail mutant (run by hand once): break the mirror in learnedwalk.core
// js torquesOf (hipR: a[0] -> hipR: 0) — "legs are mirrored" goes RED and the
// survival gate collapses; restore. (Documented + demonstrated, see README.)
//
// Usage: node scripts/learnedwalkcheck.mjs [--shots <dir>] [--json]
// Needs a dev server serving public/demos (DEV_PORT, default 5173).

import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { launch, requireDevServer, relayNoise, opt } from './lib/harness.mjs'

const args = process.argv.slice(2)
const shots = resolve(opt(args, '--shots', 'scripts/.shots/learnedwalk'))
mkdirSync(shots, { recursive: true })
const json = args.includes('--json')

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/demos/`
const URL_DEMO = BASE + 'learnedwalk.html'

let pass = 0, fail = 0
const lines = []
function ok(name, cond, extra) {
  lines.push(cond ? '  ok  ' + name : '  FAIL ' + name + (extra ? ' — ' + extra : ''))
  if (cond) pass++; else fail++
  console.log(lines[lines.length - 1])
}

/* ---------------- 1+2. POLICY + HONESTY (Node) ---------------- */
console.log('learnedwalk: policy (node)')
globalThis.window = globalThis
eval(readFileSync(resolve('public/demos/physicswalk.core.js'), 'utf8'))
eval(readFileSync(resolve('public/demos/learnedwalk.core.js'), 'utf8'))
eval(readFileSync(resolve('public/demos/learnedwalk.policy.js'), 'utf8'))
const LW = globalThis.LearnedWalk
const POL = globalThis.LEARNED_WALK_POLICY
const NP = LW.NP
const zero = new Float64Array(NP)

ok('policy: ships + final vector matches net shape', POL && POL.final && POL.final.length === NP &&
  POL.net.obs === LW.OBS && POL.net.hid === LW.HID && POL.net.act === LW.ACT && POL.net.np === NP,
POL ? `np ${POL.net && POL.net.np}` : 'missing')
ok('policy: checkpoint series (>= 12) with facts', POL && POL.checkpoints.length >= 12 && POL.facts && !!POL.facts.method,
  POL ? `${POL.checkpoints.length} ckpts` : '')

const SEEDS = [11, 22, 33, 44, 55, 66]
const avgTicks = (p) => {
  let t = 0, adv = 0, up = 0
  for (const sd of SEEDS) {
    const e = LW.runEpisode(p, { seed: sd, noiseSeed: sd, seconds: 10, drive: 1 })
    t += e.ticks; adv += e.advanced; up += e.uprightFrac
  }
  return { t: t / SEEDS.length, adv: adv / SEEDS.length, up: up / SEEDS.length }
}
const z = avgTicks(zero)
const fin = avgTicks(Float64Array.from(POL.final))
ok('training is real: final policy out-survives the unactuated rig', fin.t > z.t + 10, `policy ${fin.t.toFixed(0)} vs bare ${z.t.toFixed(0)} ticks`)
ok('training is real: final policy out-advances standing still', fin.adv > z.adv + 0.05, `policy ${fin.adv.toFixed(2)} vs bare ${z.adv.toFixed(2)} m`)
const gen0 = avgTicks(Float64Array.from(POL.checkpoints[0].params))
const lastCk = avgTicks(Float64Array.from(POL.checkpoints[POL.checkpoints.length - 1].params))
ok('learning curve: final >= gen-0 checkpoint (evocheck ratio rule)', fin.t >= gen0.t && lastCk.t >= gen0.t,
  `gen0 ${gen0.t.toFixed(0)} -> final ${fin.t.toFixed(0)} ticks`)
ok('policy reacts: outputs vary inside an episode (not a constant brace)', (() => {
  const lw = LW.create(POL.final, { seed: 5 })
  const seen = new Set()
  for (let i = 0; i < 240 && lw.sim.mode !== 'fallen'; i++) { LW.step(lw, 1 / 60); seen.add(lw.act.map((x) => x.toFixed(2)).join(',')) }
  return seen.size > 40
})())
{
  const t = LW.torquesOf([0.5, -0.25, 0.1])
  ok('legs are mirrored (same torque to L and R joints)', t.hipL === t.hipR && t.kneeL === t.kneeR && t.ankleL === t.ankleR)
  ok('arms are unactuated (honest pendulums)', t.shL === 0 && t.shR === 0 && t.elL === 0 && t.elR === 0)
}
{
  // determinism: same seed + same policy => identical state bytes
  const run = () => {
    const lw = LW.create(POL.final, { seed: 42 })
    for (let i = 0; i < 300; i++) LW.step(lw, 1 / 60)
    return Array.from(lw.sim.p).map((x) => x.toFixed(9)).join(',')
  }
  ok('determinism: same seed => identical trajectory', run() === run())
}
{
  // fallen honesty: motors cut, gravity takes the head down
  const lw = LW.create(POL.final, { seed: 3 })
  LW.PW.push(lw.sim, 3.2, 0)
  let fell = false, h0 = 0, h1 = 0
  for (let i = 0; i < 400; i++) {
    LW.step(lw, 1 / 60)
    if (lw.sim.mode === 'fallen' && !fell) { fell = true; h0 = lw.sim.p[2 * 2 + 1] }
    if (fell) h1 = Math.max(h1, h0 - lw.sim.p[2 * 2 + 1])
  }
  ok('rules: a hard shove topples him (physics is still physics)', fell)
  ok('rules: after the fall the limp body drops (motors cut)', !fell || h1 > 0.4, `drop ${h1.toFixed(2)} m`)
}

/* ---------------- 3. EPISODE (robot-kit format, #1141) ---------------- */
console.log('learnedwalk: episode format')
{
  const ep = LW.makeEpisode(9)
  const lw = LW.create(POL.final, { seed: 9 })
  for (let i = 0; i < 130; i++) {
    LW.step(lw, 1 / 60)
    ep.tick(lw.sim, i === 40 ? { px: 100, py: 200 } : null)
  }
  const f = ep.finish(lw.sim, false, 0.2)
  const bad = []
  if (f.format !== 'retrogames-rec/v1') bad.push('format')
  if (f.game !== 'learnedwalk' || f.method !== 'pointer' || !Number.isInteger(f.seed)) bad.push('ids')
  if (!Number.isInteger(f.hashEvery) || f.hashEvery !== 6) bad.push('hashEvery')
  if (f.slots.length !== 1 || f.slots[0].source.kind !== 'model') bad.push('slot')
  if (f.slots[0].pads.length !== f.ticks || f.slots[0].raw.length !== f.ticks) bad.push('pads-per-tick')
  let lastH = 0
  for (const x of f.hashes) { if (!(x.t > lastH && x.t <= f.ticks) || !Number.isFinite(x.h)) bad.push('hash-track') ; lastH = x.t }
  if (f.ticks > 0 && f.hashes[f.hashes.length - 1].t !== f.ticks) bad.push('final-hash')
  const e = f.episode
  if (e.task !== 'learned-walk' || typeof e.success !== 'boolean' || !Number.isFinite(e.score)) bad.push('ep-head')
  if (e.poseCount !== e.poses.length || e.poseEvery !== 6) bad.push('pose-count')
  let lastP = 0
  for (const x of e.poses) {
    if (!(x.t > lastP && x.t <= f.ticks)) bad.push('pose-ticks')
    lastP = x.t
    const keys = Object.keys(x.o)
    if (keys.length !== LW.PW.N) bad.push('pose-bodies')
    for (const k of keys) {
      const b = x.o[k]
      if (!Array.isArray(b.p) || b.p.length !== 3 || !b.p.every(Number.isFinite)) bad.push('pose-p')
      if (!Array.isArray(b.q) || b.q.length !== 4 || !b.q.every(Number.isFinite)) bad.push('pose-q')
    }
    if (bad.length) break
  }
  if (!Array.isArray(e.methodsUsed) || !e.methodsUsed.includes('pointer')) bad.push('methods')
  if (typeof e.assets !== 'string' || !e.assets) bad.push('assets')
  ok('episode: retrogames-rec/v1 + kit episode block validates', bad.length === 0, bad.join(','))
  ok('episode: pose track covers all 18 bodies', f.episode.poses.length === Math.floor(130 / 6), `${f.episode.poses.length} poses`)
}

/* ---------------- 4. BOOTS (browser) ---------------- */
console.log('learnedwalk: boots')
await requireDevServer(BASE)
const browser = await launch()
const pageErrors = []
async function open(viewport = { width: 900, height: 700 }, touch = false) {
  const p = await browser.newPage({ viewport, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch })
  p.setDefaultTimeout(30000)
  p.on('pageerror', e => pageErrors.push(e.message))
  p.on('console', m => { if (m.type() === 'error' && !relayNoise(m.text())) pageErrors.push(m.text()) })
  p.on('requestfailed', r => { if (!relayNoise(null, { url: r.url() }) && !/favicon/i.test(r.url())) pageErrors.push('404 ' + r.url()) })
  await p.goto(URL_DEMO, { waitUntil: 'load' })
  await p.waitForFunction(() => !!window.__learnedwalkTest && window.__learnedwalkTest.frames() > 3, null, { timeout: 20000 })
  return p
}
const page = await open()
ok('boots: rAF advancing', true)
ok('boots: attract mode first', (await page.evaluate(() => window.__learnedwalkTest.screen())) === 'attract')
await page.keyboard.press('Enter')
await page.waitForFunction(() => window.__learnedwalkTest.screen() === 'play', null, { timeout: 8000 })
ok('boots: any key leaves attract', true)
{
  const before = await page.evaluate(() => window.__learnedwalkTest.metrics().comV[0])
  await page.evaluate(() => window.__learnedwalkTest.push(2.5))
  await page.waitForFunction((v0) => Math.abs(window.__learnedwalkTest.metrics().comV[0] - v0) > 0.2 || window.__learnedwalkTest.metrics().mode === 'fallen', before, { timeout: 5000 })
  ok('input: tap applies a real impulse', true)
}
{
  // the scrubber: gen 0 must be visibly worse than the final policy
  const survive = async (idx) => page.evaluate(async (i) => {
    const T = window.__learnedwalkTest
    T.setCheckpoint(i); T.start()
    const t0 = performance.now()
    while (performance.now() - t0 < 5000) {
      if (T.metrics().mode === 'fallen') return Math.round(performance.now() - t0)
      await new Promise(r => requestAnimationFrame(r))
    }
    return 5000
  }, idx)
  const g0 = await survive(0)
  const last = await survive(await page.evaluate(() => window.__learnedwalkTest.generations() - 1))
  ok('scrubber: gen 0 flails — falls faster than the final policy', g0 < last, `gen0 ${g0} ms vs final ${last} ms`)
}
{
  const epi = await page.evaluate(async () => {
    const T = window.__learnedwalkTest
    T.start()
    const t0 = performance.now()
    while (performance.now() - t0 < 15000) {
      if (T.lastEpisode()) break
      await new Promise(r => requestAnimationFrame(r))
    }
    const f = T.lastEpisode()
    return f ? { ticks: f.ticks, task: f.episode.task, poses: f.episode.poseCount } : null
  })
  ok('episode: a browser run exports a kit-format episode', !!epi && epi.ticks > 30 && epi.task === 'learned-walk', JSON.stringify(epi))
}
await page.screenshot({ path: resolve(shots, 'play.png') })
ok('boots: no page errors', pageErrors.length === 0, pageErrors.join(' | '))
await page.close()
{
  const p = await open({ width: 390, height: 844 }, true)
  await p.touchscreen.tap(195, 300)
  await p.waitForFunction(() => window.__learnedwalkTest.screen() === 'play', null, { timeout: 8000 })
  await p.waitForFunction(() => window.__learnedwalkTest.frames() > 40, null, { timeout: 15000 })
  ok('phone: boots, starts on tap, draws at 390x844', true)
  await p.close()
}

/* ---------------- 5. DEMO LAW ---------------- */
console.log('learnedwalk: law')
const html = readFileSync(resolve('public/demos/learnedwalk.html'), 'utf8')
const core = readFileSync(resolve('public/demos/learnedwalk.core.js'), 'utf8')
const idx = readFileSync(resolve('public/demos/index.html'), 'utf8')
const games = readFileSync(resolve('src/config/games.js'), 'utf8')
const ext = html.match(/(src|href)\s*=\s*["']https?:\/\//gi) || []
ok('law: learnedwalk.html has no absolute external scripts/links', ext.length === 0, ext.join(' '))
ok('law: loads the shared cores (relative)', /<script src="physicswalk\.core\.js\?[^"]*"><\/script>/.test(html) && /<script src="learnedwalk\.core\.js\?[^"]*"><\/script>/.test(html) && /<script src="learnedwalk\.policy\.js\?[^"]*"><\/script>/.test(html))
ok('law: loads credits.js (relative)', /<script src="credits\.js">/.test(html))
ok('law: DEMO_CREDITS present with honest fields', /window\.DEMO_CREDITS\s*=/.test(html) && /issues:\s*\[1205\]/.test(html) && /assist:\s*'solo'/.test(html))
ok('law: NOT registered in games.js (demos law)', !games.includes('learnedwalk') && !games.includes('LearnedWalk'))
ok('law: index links the demo', idx.includes('id="learnedwalk"') && idx.includes('learnedwalk.html'))
ok('law: DEMO_INDEX carries learnedwalk', /el:\s*'learnedwalk'/.test(idx))
ok('law: cores have no external imports', !/^\s*import\s/m.test(core))
ok('law: policy is a static global (no fetch)', /window\.LEARNED_WALK_POLICY\s*=/.test(readFileSync(resolve('public/demos/learnedwalk.policy.js'), 'utf8')))

await browser.close()
console.log(lines.join('\n'))
console.log(`\nlearnedwalkcheck: ${pass}/${pass + fail}`)
if (json) console.log(JSON.stringify({ pass, fail }))
process.exit(fail ? 1 : 0)
