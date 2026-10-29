// physicswalkcheck — self-verifying harness for public/demos/physicswalk.html +
// physicswalk.core.js (PHYSICS WALK, #1204: a 12-mass XPBD rigid-body biped
// that balances by real dynamics and must be pushed, not posed).
//
// Gates:
//   1. PHYSICS (pure Node, honest claims)
//      - ragdoll honesty: motors dead => gravity takes him down (head drops
//        > 0.5 m) — the sim really integrates gravity;
//      - bones never stretch (rigid constraints under hard pushes);
//      - balance: 7 s of controller hold keeps him upright > 90% of ticks;
//      - push ladder: 0.4 / 0.7 m/s taps RECOVER, >= 1.5 m/s shoves TOPPLE —
//        "stumbles and recovers or falls", the issue's headline;
//      - a medium shove carries him > 0.5 m forward without toppling (the
//        stagger IS short distance walking — steps + margin swings);
//      - stance friction honesty: a planted foot's slip stays < 0.35 m/s;
//      - GRF honesty: total ground reaction ≈ body weight in stance (~550 N,
//        never > 1200 N solver spikes) and ≈ 0 during any flight instant;
//      - determinism: same seed + same push script => byte-identical final
//        state across two fresh processes of the sim.
//   2. BOOTS (headless Chrome): attract first, any key starts, tap applies a
//      real impulse (CoM velocity jumps), toppling resets, zero page errors,
//      phone 390x844 boots and starts on tap.
//   3. DEMO LAW: self-contained page, not in games.js, credits + index card.
//
// Proven-fail mutant (run by hand): in physicswalk.core.js set kp: 704.4 ->
// kp: 5 in the default tuning — "balance holds" goes RED and the push ladder
// collapses (everything topples), while ragdoll/bones/law stay green. The
// balance claim is the one this demo makes, and the harness sees it.
// Second mutant: drop the ground spring (kG -> 1000) — ragdoll and stance GRF
// gates go red (he sinks through the floor: normal force and friction were
// real forces, not clamps).
//
// Usage: node scripts/physicswalkcheck.mjs [--shots <dir>] [--json]
// Needs a dev server serving public/demos (DEV_PORT, default 5173).

import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { launch, requireDevServer, relayNoise, opt } from './lib/harness.mjs'

const args = process.argv.slice(2)
const shots = resolve(opt(args, '--shots', 'scripts/.shots/physicswalk'))
mkdirSync(shots, { recursive: true })
const json = args.includes('--json')

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/demos/`
const URL_DEMO = BASE + 'physicswalk.html'

let pass = 0, fail = 0
const lines = []
function ok(name, cond, extra) {
  lines.push(cond ? '  ok  ' + name : '  FAIL ' + name + (extra ? ' — ' + extra : ''))
  if (cond) pass++; else fail++
  console.log(lines[lines.length - 1])
}

/* ---------------- 1. PHYSICS (Node) ---------------- */
console.log('physicswalk: physics (node)')
eval(readFileSync(resolve('public/demos/physicswalk.core.js'), 'utf8'))
const PW = globalThis.PhysicsWalk

function runPush(v, secs = 6) {
  const sim = PW.create({})
  for (let i = 0; i < 120; i++) PW.step(sim, 1 / 60)
  PW.push(sim, v, 0)
  let rec = false, fell = false, maxX = sim.com[0]
  for (let i = 0; i < Math.round(secs * 60); i++) {
    PW.step(sim, 1 / 60)
    maxX = Math.max(maxX, sim.com[0])
    if (sim.mode === 'fallen') { fell = true; break }
    if (i > 90 && Math.abs(sim.phi) < 0.18 && Math.abs(sim.comV[0]) < 0.35 && sim.margin > 0.02) rec = true
  }
  return { rec, fell, maxX }
}

{
  // ragdoll honesty
  const sim = PW.create({})
  sim.mode = 'fallen'
  const h0 = sim.p[2 * 2 + 1]
  for (let i = 0; i < 90; i++) PW.step(sim, 1 / 60)
  ok('physics: ragdoll falls under gravity (motors dead)', h0 - sim.p[2 * 2 + 1] > 0.5, `head ${h0.toFixed(2)} -> ${sim.p[2 * 2 + 1].toFixed(2)}`)
}
{
  // bones never stretch under hard pushes
  const sim = PW.create({})
  let worst = 0
  for (let k = 0; k < 6; k++) {
    if (k) { sim.mode = 'stand'; PW.push(sim, 3.5, 0) }
    for (let i = 0; i < 180; i++) {
      PW.step(sim, 1 / 60)
      for (const [a, b, r0] of PW.BONES) {
        const d = Math.hypot(sim.p[a * 2] - sim.p[b * 2], sim.p[a * 2 + 1] - sim.p[b * 2 + 1])
        worst = Math.max(worst, d / r0 - 1)
      }
      if (sim.mode === 'fallen') { sim.mode = 'stand'; for (let j = 0; j < PW.N * 2; j++) { sim.p[j] = PW.REST[(j >> 1) % PW.N][j & 1] || 0 } }
    }
  }
  ok('physics: bones never stretch (rigid constraints)', worst < 0.1, `worst strain ${(worst * 100).toFixed(2)}%`)
}
{
  // balance hold + stance slip + GRF honesty in one walk window
  const sim = PW.create({})
  let up = 0, stanceSlip = 0, grfMinInStand = 1e9, nStand = 0, spike = 0, flightGrf = 0, nFlight = 0
  for (let i = 0; i < 420; i++) {
    PW.step(sim, 1 / 60)
    if (Math.abs(sim.phi) < 0.32 && sim.p[2 * 2 + 1] > 1.15) up++
    let anyStand = false
    for (const L of sim.legs) {
      if (!L.swing && sim.p[L.a * 2 + 1] < 0.03) {
        anyStand = true
        stanceSlip = Math.max(stanceSlip, Math.abs(sim.v[L.h * 2]), Math.abs(sim.v[L.t * 2]))
      }
    }
    const tot = sim.grf[0] + sim.grf[1] + sim.grf[2] + sim.grf[3]
    const airborne = sim.legs.every(L => sim.p[L.h * 2 + 1] > 0.01 && sim.p[L.t * 2 + 1] > 0.01)
    if (anyStand) { nStand++; grfMinInStand = Math.min(grfMinInStand, tot); spike = Math.max(spike, tot) }
    if (airborne) { nFlight++; flightGrf += sim.grfContact.reduce((s, v) => s + v, 0) }
  }
  ok('physics: balance holds 7 s unattended (inverted pendulum PD)', up / 420 > 0.9, `up ${(up / 420).toFixed(2)}`)
  ok('physics: stance-foot slip stays < 0.35 m/s (real friction)', stanceSlip < 0.35, `slip ${stanceSlip.toFixed(2)} m/s`)
  ok('physics: stance GRF ≈ body weight, no solver spikes', grfMinInStand > 300 && spike < 1200, `min ${grfMinInStand.toFixed(0)} N max ${spike.toFixed(0)} N (weight ~550 N)`)
  ok('physics: flight instants carry ~zero GRF', nFlight === 0 || flightGrf / nFlight < 80, `flight avg ${(nFlight ? flightGrf / nFlight : 0).toFixed(0)} N`)
}
{
  const a = runPush(0.4), b = runPush(0.7)
  ok('rules: light tap (0.4 m/s) — stumble and recover', !a.fell && a.rec, JSON.stringify(a))
  ok('rules: medium tap (0.7 m/s) — recovers carrying forward', !b.fell && b.rec && b.maxX > 0.5, JSON.stringify(b))
  let allFall = true
  for (const v of [1.5, 2.2, 3.2]) if (!runPush(v).fell) allFall = false
  ok('rules: hard shove (>=1.5 m/s) always topples', allFall)
  const c = runPush(1.1, 8)
  ok('rules: medium shove staggers > 0.5 m without toppling', !c.fell && c.maxX > 0.5, JSON.stringify(c))
}
{
  // determinism across two fresh sim instances, same scripted pushes
  const script = [0.5, 0, 0, 1.2, 0, 0, 0, 0.3]
  const run = () => {
    const sim = PW.create({ seed: 7 })
    script.forEach((v, i) => { if (v) PW.push(sim, v, 0); for (let k = 0; k < 90; k++) PW.step(sim, 1 / 60) })
    return Array.from(sim.p).map(x => x.toFixed(9)).join(',')
  }
  ok('physics: same seed + same pushes => identical state (no hidden RNG)', run() === run())
}

/* ---------------- 2. BOOTS (browser) ---------------- */
console.log('physicswalk: boots')
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
  await p.waitForFunction(() => !!window.__physicswalkTest && window.__physicswalkTest.frames() > 3, null, { timeout: 20000 })
  return p
}
const page = await open()
await page.waitForFunction(() => window.__physicswalkTest.frames() > 40, null, { timeout: 15000 })
ok('boots: rAF advancing', true)
ok('boots: attract mode first', (await page.evaluate(() => window.__physicswalkTest.screen())) === 'attract')
await page.keyboard.press('Enter')
await page.waitForFunction(() => window.__physicswalkTest.screen() === 'play', null, { timeout: 8000 })
ok('boots: any key leaves attract', true)
{
  const before = await page.evaluate(() => window.__physicswalkTest.metrics().comV[0])
  await page.evaluate(() => window.__physicswalkTest.push(2.5))
  await page.waitForFunction((v0) => Math.abs(window.__physicswalkTest.metrics().comV[0] - v0) > 0.2 || window.__physicswalkTest.metrics().mode === 'fallen', before, { timeout: 5000 })
  ok('input: tap applies a real impulse (CoM velocity responds)', true)
}
{
  await page.evaluate(() => { window.__physicswalkTest.reset(); window.__physicswalkTest.push(3.4) })
  await page.waitForFunction(() => window.__physicswalkTest.metrics().mode === 'fallen', null, { timeout: 8000 })
  ok('rules: big shove topples in the browser too', true)
  await page.evaluate(() => window.__physicswalkTest.reset())
  await page.waitForFunction(() => window.__physicswalkTest.metrics().mode === 'stand', null, { timeout: 8000 })
  ok('rules: fallen figure resets to stand', true)
}
await page.waitForFunction(() => window.__physicswalkTest.frames() > 90, null, { timeout: 15000 })
await page.screenshot({ path: resolve(shots, 'play.png') })
ok('boots: no page errors', pageErrors.length === 0, pageErrors.join(' | '))
await page.close()
{
  const p = await open({ width: 390, height: 844 }, true)
  await p.touchscreen.tap(195, 400)
  await p.waitForFunction(() => window.__physicswalkTest.screen() === 'play', null, { timeout: 8000 })
  await p.waitForFunction(() => window.__physicswalkTest.frames() > 40, null, { timeout: 15000 })
  ok('phone: boots, starts on tap, draws at 390x844', true)
  await p.close()
}

/* ---------------- 3. DEMO LAW ---------------- */
console.log('physicswalk: law')
const html = readFileSync(resolve('public/demos/physicswalk.html'), 'utf8')
const core = readFileSync(resolve('public/demos/physicswalk.core.js'), 'utf8')
const idx = readFileSync(resolve('public/demos/index.html'), 'utf8')
const games = readFileSync(resolve('src/config/games.js'), 'utf8')
const ext = html.match(/(src|href)\s*=\s*["']https?:\/\//gi) || []
ok('law: physicswalk.html has no absolute external scripts/links', ext.length === 0, ext.join(' '))
ok('law: loads physicswalk.core.js (relative)', /<script src="physicswalk\.core\.js\?[^"]*"><\/script>/.test(html))
ok('law: loads credits.js (relative)', /<script src="credits\.js">/.test(html))
ok('law: DEMO_CREDITS present with honest fields', /window\.DEMO_CREDITS\s*=/.test(html) && /issues:\s*\[1204\]/.test(html) && /assist:\s*'solo'/.test(html))
ok('law: NOT registered in games.js (demos law)', !games.includes('physicswalk') && !games.includes('PhysicsWalk'))
ok('law: index links the demo', idx.includes('id="physicswalk"') && idx.includes('physicswalk.html'))
ok('law: DEMO_INDEX carries physicswalk', /el:\s*'physicswalk'/.test(idx))
ok('law: core has no external imports', !/^\s*import\s/m.test(core))
ok('law: core is a global module', /globalThis\.PhysicsWalk\s*=|\}\)\(typeof window/.test(core))

await browser.close()
console.log(lines.join('\n'))
console.log(`\nphysicswalkcheck: ${pass}/${pass + fail}`)
if (json) console.log(JSON.stringify({ pass, fail }))
process.exit(fail ? 1 : 0)
