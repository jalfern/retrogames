// deepglasscheck — self-verifying harness for public/demos/deepglass.html +
// public/demos/dungeon.core.js (the shared first-person dungeon renderer, #1129).
//
// Proves the renderer:
//   1. BOOTS  — WebGL2, DEV hook ready, rAF advancing, zero page errors,
//               attract first, any key starts.
//   2. RULES  — the sim-contract is real, headless AND in the page:
//               cellBlocks/viewCells occlusion, step/turn move the pose, a
//               closed door blocks until opened (Space tweens doorOpen and the
//               cell becomes passable), stairs walk you to the other level and
//               back, the lantern spell lights and DECAYS, and the torch dying
//               plunges the frame into darkness (falloff is computed, not painted).
//   3. PIXELS — torch-lit warm brick, a rat billboard in the corridor,
//               water reading cool, the up-stairs amber arrow, a wood door
//               close-up, and depth falloff (dark far pixels) in every view.
//   4. SMOOTH — turns animate through intermediate angles with monotone
//               easing; steps bob the eye; the logical pose lands exactly.
//   5. ATTRACT + PHONE — the autopilot wanders unattended; 390x844 touch boots
//               and a tap starts it.
//   6. SPEED  — median frame interval (retries once; a loaded box is not a bug).
//   7. DEMO LAW — self-contained pages, NOT registered in games.js (demos law,
//               Jon 2026-10-19), credits card present, index links it.
//
// All motion gates WAIT ON FRAMES (waitForFunction), not wall-clock sleeps:
// the warden's box is often loaded and rAF-dt is delivery, never truth.
//
// Proven-fail mutant (run by hand): dungeon.core.js `vec3 df = -d;` ->
// `vec3 df = d;` (torch cone inverted) -> the warm-brick pixel gates go RED
// while boots/rules/smooth stay green — the warm pool straight ahead is
// computed lighting, not a painted gradient. Second mutant: `fog * 0.92` ->
// `fog * 0.05` -> every depth-falloff gate goes red (the dark far end is
// what makes this a torch-lit dungeon, not an evenly lit box). Third mutant:
// `if (live.length)` -> `if (false)` in buildSprites -> the rat/skeleton
// pixel gates go red while every wall gate stays green (monsters are drawn
// from the atlas, not painted into the maze pass).
//
// Usage: node scripts/deepglasscheck.mjs [--shots <dir>] [--json] [--no-speed]
// Needs `npm run dev` running (or set DEV_PORT).

import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { launch, requireDevServer, relayNoise, opt } from './lib/harness.mjs'

const args = process.argv.slice(2)
const shots = resolve(opt(args, '--shots', 'scripts/.shots/deepglass'))
mkdirSync(shots, { recursive: true })
const json = args.includes('--json')
const noSpeed = args.includes('--no-speed')

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/demos/`
const URL_DEMO = BASE + 'deepglass.html'

let pass = 0, fail = 0
const lines = []
function ok(name, cond, extra) {
  if (cond) { pass++; lines.push('  ok  ' + name) }
  else { fail++; lines.push('  FAIL ' + name + (extra ? ' — ' + extra : '')) }
}

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
  await p.waitForFunction(() => !!window.__deepglassTest, null, { timeout: 20000 })
  return p
}

const T = (page, fn, ...a) => page.evaluate(fn, ...a)
const frames = (page) => T(page, () => window.__deepglassTest.frames())
async function advance(page, n = 2) {
  const f = await frames(page)
  await page.waitForFunction((k) => window.__deepglassTest.frames() >= k, f + n, { timeout: 15000 })
}

/* ---------------- 1. BOOTS ---------------- */
console.log('deepglass: boots')
const page = await open()
await advance(page, 40)
ok('boots: rAF advancing', (await frames(page)) > 40)
ok('boots: attract mode first', (await T(page, () => window.__deepglassTest.screen())) === 'attract')
ok('boots: no page errors', pageErrors.length === 0, pageErrors.join(' | '))
await page.keyboard.press('Space')
await page.waitForFunction(() => window.__deepglassTest.screen() === 'play', null, { timeout: 8000 })
ok('boots: any key leaves attract', true)
await advance(page, 3)
await page.screenshot({ path: resolve(shots, 'spawn.png') })

/* ---------------- 2. RULES (pure, headless) ---------------- */
console.log('deepglass: rules')
const pure = await T(page, () => {
  const D = window.DungeonRenderer
  const mk = () => {
    const rows = ['#########', '#.......#', '#.###+#.#', '#.......#', '#########']
    const w = 9, h = 5, cells = new Uint8Array(w * h)
    rows.forEach((r, y) => { for (let x = 0; x < w; x++) cells[y * w + x] = r[x] === '#' ? 1 : r[x] === '+' ? 6 : 0 })
    return { w, h, cells, doorOpen: new Float32Array(w * h) }
  }
  const m = mk()
  const openDoor = (() => { const mm = mk(); mm.doorOpen[2 * 9 + 5] = 1; return D.cellBlocks(mm, 5, 2) })()
  const seen = D.viewCells(m, 1.5, 1.5, 3)
  const has = (x, y) => seen.some(([a, b]) => a === x && b === y)
  return {
    wall: D.cellBlocks(m, 2, 2),
    openDoor,
    closedDoor: D.cellBlocks(m, 5, 2),
    oob: D.cellBlocks(m, -1, 0),
    seesAhead: has(2, 1),
    seesBehindWall: has(2, 2),
  }
})
ok('rules: walls block', pure.wall)
ok('rules: closed door blocks', pure.closedDoor)
ok('rules: open door passes', !pure.openDoor)
ok('rules: out-of-bounds blocks', pure.oob)
ok('rules: LOS sees open cells', pure.seesAhead)
ok('rules: LOS blocked by walls', !pure.seesBehindWall)

/* ---------------- 2b. RULES (in the page) ---------------- */
await T(page, () => window.__deepglassTest.goto(5.5, 4.5, 0, Math.PI))
await advance(page, 2)
const poseA = await T(page, () => window.__deepglassTest.pose())
await page.keyboard.press('ArrowUp')
await page.waitForFunction((s) => Math.abs(window.__deepglassTest.pose().y - s.y) > 0.9, poseA, { timeout: 10000 })
const poseB = await T(page, () => window.__deepglassTest.pose())
ok('rules: step forward moves one cell', Math.abs(poseB.y - poseA.y) > 0.9)
ok('rules: step lands on exact cell center', Math.abs((poseB.y % 1) - 0.5) < 0.01 || Math.abs((poseB.x % 1) - 0.5) < 0.01)

const turnRes = await T(page, async () => {
  const t = window.__deepglassTest
  const y0 = t.view().yaw
  t.act('ArrowLeft')
  const ys = []
  await new Promise((res) => {
    const loop = () => {
      ys.push(t.view().yaw)
      if (Math.abs(t.pose().yaw - t.view().yaw) < 1e-6 && ys.length > 1) res()
      else requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })
  return { y0, ys, end: t.view().yaw, logic: t.pose().yaw }
})
const dy = turnRes.end - turnRes.y0
const mono = turnRes.ys.every((y, i) => i === 0 || (y - turnRes.ys[i - 1]) * Math.sign(dy) >= -1e-9)
const mid = turnRes.ys.filter(y => Math.abs(y - turnRes.y0) > 0.05 && Math.abs(y - turnRes.end) > 0.05)
ok('rules: turn is a quarter', Math.abs(Math.abs(dy) - Math.PI / 2) < 0.02)
ok('smooth: turn animates through intermediates', mid.length >= 2, JSON.stringify(turnRes.ys.map(v => Math.round(v * 100) / 100)))
ok('smooth: turn is monotone', mono)
ok('smooth: turn lands exactly, logic=final', Math.abs(turnRes.logic - turnRes.end) < 0.01)

const bump = await T(page, async () => {
  const t = window.__deepglassTest
  t.goto(5.5, 12.5, 0, Math.PI)
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  const b = t.blocked(5, 13)
  t.act('ArrowUp')
  await new Promise(r => setTimeout(r, 900))
  return { b, pose: t.pose() }
})
ok('rules: bump stops at the wall', bump.b === true && Math.abs(bump.pose.y - 12.5) < 0.01, JSON.stringify(bump))

const door = await T(page, async () => {
  const t = window.__deepglassTest
  t.goto(5.5, 12.5, 0, Math.PI)
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  const before = t.cellAt(5, 11) === 6 && t.blocked(5, 11)
  t.act('Space')
  await new Promise(res => { const end = performance.now() + 6000; const l = () => (t.doorAt(5, 11) > 0.99 || performance.now() > end) ? res() : requestAnimationFrame(l); l() })
  await new Promise(r => setTimeout(r, 120))
  const open = t.doorAt(5, 11)
  t.act('ArrowUp')
  await new Promise(res => { const end = performance.now() + 6000; const l = () => Math.abs(t.pose().y - 11.5) < 0.01 || performance.now() > end ? res() : requestAnimationFrame(l); l() })
  return { before, open, pose: t.pose() }
})
ok('rules: door closed blocks', door.before === true)
ok('rules: Space opens the door', door.open > 0.99, String(door.open))
ok('rules: walked through the doorway', Math.abs(door.pose.y - 11.5) < 0.01, JSON.stringify(door.pose))

const stairs = await T(page, async () => {
  const t = window.__deepglassTest
  t.goto(10.5, 7.5, 0, 0)
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  t.act('Space')
  await new Promise(res => { const end = performance.now() + 6000; const l = () => t.level() === 1 || performance.now() > end ? res() : requestAnimationFrame(l); l() })
  const crypt = t.pose()
  t.goto(3.5, 2.5, 1, 0)
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  t.act('Space')
  await new Promise(res => { const end = performance.now() + 6000; const l = () => t.level() === 0 || performance.now() > end ? res() : requestAnimationFrame(l); l() })
  return { lvl: 1, crypt, back: t.level(), backPose: t.pose() }
})
ok('rules: stairs up -> crypt', stairs.crypt.z === 1, JSON.stringify(stairs))
ok('rules: stairs down -> back to the vault', stairs.back === 0 && Math.abs(stairs.backPose.z) < 0.01)

const spell = await T(page, async () => {
  const t = window.__deepglassTest
  t.goto(5.5, 10.5, 0, 0)
  await new Promise(r => setTimeout(r, 400))
  const before = t.stats().green
  t.act('KeyL')
  let during = 0
  await new Promise(rz => {
    const end = performance.now() + 1200
    const l = () => { during = Math.max(during, t.stats().green); performance.now() < end ? requestAnimationFrame(l) : rz() }
    l()
  })
  await new Promise(r => setTimeout(r, 1400))
  const after = t.stats().green
  return { before, during, after }
})
ok('rules: lantern spell lights green', spell.during > 600 && spell.during > spell.before * 4, JSON.stringify(spell))
ok('rules: spell decays away', spell.after < spell.during * 0.5, JSON.stringify(spell))

const torch = await T(page, async () => {
  const t = window.__deepglassTest
  t.goto(5.5, 10.5, 0, 0)
  await new Promise(r => setTimeout(r, 500))
  const lit = t.stats()
  t.killTorch()
  await new Promise(r => setTimeout(r, 700))
  const out = t.stats()
  t.relight()
  await new Promise(r => setTimeout(r, 700))
  const back = t.stats()
  return { lit: lit.mean, out: out.mean, back: back.mean }
})
ok('rules: torch out -> darkness', torch.out < torch.lit * 0.4, JSON.stringify(torch))
ok('rules: torch relit restores', torch.back > torch.out * 2.2, JSON.stringify(torch))

/* ---------------- 3. PIXELS ---------------- */
console.log('deepglass: pixels')
const viewPix = async (goto, expect, name, shotName) => {
  await T(page, (g) => window.__deepglassTest.goto(g[0], g[1], g[2], g[3]), goto)
  await advance(page, 3)
  const s = await T(page, () => window.__deepglassTest.stats())
  for (const [k, min] of Object.entries(expect)) {
    const v = k === 'darkFrac' ? s[k] : s[k]
    ok(`pixels ${name}: ${k} >= ${min}`, v >= min, `got ${typeof s[k] === 'number' && s[k] < 1 ? s[k].toFixed(3) : Math.round(s[k])}`)
  }
  if (shotName) await page.screenshot({ path: resolve(shots, shotName) })
  return s
}
await viewPix([5.5, 12.5, 0, Math.PI], { warm: 1500 }, 'door close-up', 'door.png')
await viewPix([5.5, 10.5, 0, 0], { warm: 4000, darkFrac: 0.006 }, 'corridor torch + falloff', 'corridor.png')
await viewPix([5.5, 4.5, 0, 0], { grey: 900 }, 'rat billboard', 'rat.png')
await viewPix([8.5, 5.5, 0, -Math.PI / 2], { cool: 1200 }, 'water pool cool', 'water.png')
await viewPix([10.5, 7.5, 0, 0], { amber: 80 }, 'up-stairs arrow', 'stairs.png')
const corridorStats = await viewPix([5.5, 10.5, 0, 0], {}, 'corridor again')
ok('pixels: far end falls off to darkness', corridorStats.darkFrac >= 0.01 && corridorStats.mean > 8)
await T(page, () => window.__deepglassTest.setLevel(1))
await viewPix([2.5, 4.2, 1, 0], { grey: 1500 }, 'crypt skeleton', 'crypt.png')
await T(page, () => window.__deepglassTest.setLevel(0))

/* ---------------- 4. SMOOTH step bob ---------------- */
console.log('deepglass: smooth')
const bobSamples = await T(page, async () => {
  const t = window.__deepglassTest
  t.goto(5.5, 10.5, 0, 0)
  await new Promise(r => setTimeout(r, 300))
  t.act('ArrowUp')
  const zs = []
  await new Promise(res => {
    const l = () => { zs.push(t.view().z); (Math.abs(t.pose().y - t.view().y) < 1e-6 && zs.length > 2) ? res() : requestAnimationFrame(l) }
    l()
  })
  return zs
})
ok('smooth: step bobs the eye', Math.max(...bobSamples) - Math.min(...bobSamples) > 0.015, JSON.stringify(bobSamples.map(v => Math.round(v * 1000) / 1000)))

/* ---------------- 5. ATTRACT + PHONE ---------------- */
console.log('deepglass: attract + phone')
{
  const p = await open()
  const s0 = await T(p, () => window.__deepglassTest.pose())
  await p.waitForFunction((s) => {
    const n = window.__deepglassTest.pose()
    return n.x !== s.x || n.y !== s.y || n.yaw !== s.yaw
  }, s0, { timeout: 15000 })
  ok('attract: autopilot wanders', true)
  await advance(p, 25)
  ok('attract: frames keep drawing', (await frames(p)) > 25)
  await p.close()
}
{
  const p = await open({ width: 390, height: 844 }, true)
  await advance(p, 20)
  ok('phone: boots and draws at 390x844', (await frames(p)) >= 20)
  await p.touchscreen.tap(195, 400)
  await p.waitForFunction(() => window.__deepglassTest.screen() === 'play', null, { timeout: 8000 })
  ok('phone: tap starts the demo', true)
  await p.screenshot({ path: resolve(shots, 'phone.png') })
  await p.close()
}

/* ---------------- 6. SPEED ---------------- */
if (!noSpeed) {
  console.log('deepglass: speed')
  const med = await T(page, () => new Promise(res => {
    const ts = []
    let n = 0
    const loop = (t) => { ts.push(t); if (++n < 45) requestAnimationFrame(loop); else res(ts) }
    requestAnimationFrame(loop)
  }))
  let d = med.slice(1).sort((a, b) => a - b)
  let m = d[Math.floor(d.length / 2)]
  if (m > 120) { await advance(page, 30); const again = await T(page, () => new Promise(res => { const ts = []; let n = 0; const loop = (t) => { ts.push(t); if (++n < 45) requestAnimationFrame(loop); else res(ts) }; requestAnimationFrame(loop) })); d = again.slice(1).sort((a, b) => a - b); m = d[Math.floor(d.length / 2)] }
  ok('speed: median frame <= 120ms', m <= 120, `median ${m.toFixed(1)}ms (retried once)`)
}

/* ---------------- 7. DEMO LAW ---------------- */
console.log('deepglass: law')
const html = readFileSync(resolve('public/demos/deepglass.html'), 'utf8')
const core = readFileSync(resolve('public/demos/dungeon.core.js'), 'utf8')
const idx = readFileSync(resolve('public/demos/index.html'), 'utf8')
const games = readFileSync(resolve('src/config/games.js'), 'utf8')
const ext = html.match(/(src|href)\s*=\s*["']https?:\/\//gi) || []
ok('law: deepglass.html has no absolute external scripts/links', ext.length === 0, ext.join(' '))
ok('law: loads dungeon.core.js (relative)', /<script src="dungeon\.core\.js\?[^"]*"><\/script>/.test(html))
ok('law: loads credits.js (relative)', /<script src="credits\.js">/.test(html))
ok('law: DEMO_CREDITS present with honest fields', /window\.DEMO_CREDITS\s*=/.test(html) && /issues:\s*\[1129\]/.test(html) && /assist:\s*'solo'/.test(html))
ok('law: NOT registered in games.js (demos law)', !games.includes('deepglass') && !games.includes('DeepGlass'))
ok('law: index links the demo', idx.includes('id="deepglass"') && idx.includes('deepglass.html'))
ok('law: DEMO_INDEX carries deepglass', /el:\s*'deepglass'/.test(idx))
ok('law: core has no external imports', !/^\s*import\s/m.test(core))
ok('law: core is a global module', /globalThis\.DungeonRenderer\s*=/.test(core))

/* ---------------- report ---------------- */
await browser.close()
console.log(lines.join('\n'))
console.log(`\ndeepglasscheck: ${pass}/${pass + fail}`)
if (json) console.log(JSON.stringify({ pass, fail }))
process.exit(fail ? 1 : 0)
