// mystplay — advisory browser driver (step 6): boots the island, starts with
// real keys/keys events, turns, steps onto the path, and the solver finishes
// the game through the live state machine — with zero page errors.
// Needs `npm run dev` running (MYST_URL overrides).
import { launch, openGame, Report, opt } from './lib/harness.mjs'

const URL = process.env.MYST_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/myst`
const r = new Report('mystplay')
const browser = await launch({ headless: opt(process.argv, '--headful', true) === false })
const page = await openGame(browser, { url: URL, hook: '__mystTest', start: false, viewport: { width: 960, height: 540 } })

const probe = () => page.evaluate(() => window.__mystTest.probe())

let p0 = await probe()
r.check('boots into attract', p0.ending === null && p0.node === 'dock', `node ${p0.node}`)
const seenNodes = new Set()
for (let i = 0; i < 14; i++) { seenNodes.add((await probe()).node); await page.waitForTimeout(700) }
r.check('attract demo tours the island', seenNodes.size >= 3, [...seenNodes].join(','))

await page.keyboard.press('Enter')
await page.waitForTimeout(500)
let p = await probe()
r.check('Enter starts the game', p.node === 'dock', p.node)

const before = await probe()
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(250)
await page.keyboard.press('ArrowLeft')
await page.waitForTimeout(250)
p = await probe()
r.check('turn arrows land and return', p.node === before.node, p.node)

await page.keyboard.press('ArrowUp')
await page.waitForTimeout(400)
p = await probe()
r.check('ArrowUp climbs the dock path', p.node === 'cliffPath', p.node)

await page.keyboard.press('ArrowUp')
await page.waitForTimeout(350)
p = await probe()
r.check('keeps climbing to the landing', p.node === 'landing', p.node)

const solve = await page.evaluate(() => window.__mystTest.solve())
await page.waitForTimeout(400)
p = await probe()
r.check('solver wins the real game in the browser', solve === 'atrus' && p.ending === 'atrus', `${solve}/${p.ending}`)
r.check('eight pages placed on the way', p.placed.red === 4 && p.placed.blue === 4, JSON.stringify(p.placed))

await page.keyboard.press('Space')
await page.waitForTimeout(400)
p = await probe()
r.check('Space restarts at the dock', p.node === 'dock' && p.ending === null, p.node)

const shot = process.env.MYST_SHOT || '/tmp/myst.png'
const buf = await page.evaluate(() => {
  const c = document.querySelector('canvas[data-myst-stage]')
  if (!c) return 0
  const t = document.createElement('canvas')
  t.width = 160; t.height = 90
  const x = t.getContext('2d')
  x.drawImage(c, 0, 0, 160, 90)
  return x.canvas.toDataURL('image/png').length
})
r.check('stage renders pixels', buf > 5000, `dataURL ${buf} bytes`)

// #1005 — the seed wire-up, live: ?seed=42 pins the locks, the cave dome
// grows its four true stars to the seeded size ranks, and an unpinned fresh
// redraws both locks and stars. Logic is proven in mystcheck; this proves the
// browser actually rides the seed.
const p2 = await openGame(browser, { url: `${URL}?seed=42`, hook: '__mystTest', start: true, viewport: { width: 960, height: 540 } })
const c42 = await p2.evaluate(() => window.__mystTest.codes())
r.check('?seed=42 pins the locks of this island', c42.seed === 42 && c42.safe === '658' && c42.star.join('') === '4213' && c42.sphere.join('') === '0231', JSON.stringify(c42))
const s42 = await p2.evaluate(() => window.__mystTest.stars())
r.check('the dome stars carry the seeded star ranks', s42[0] === 1.22 && s42[1] === 0.74 && s42[2] === 0.5 && s42[3] === 0.98, s42.join(','))
await p2.evaluate(() => window.__mystTest.fresh())
const cNew = await p2.evaluate(() => window.__mystTest.codes())
const sNew = await p2.evaluate(() => window.__mystTest.stars())
r.check('a fresh unpinned save redraws the island', cNew.seed !== 42 && JSON.stringify(sNew) !== JSON.stringify(s42), `${cNew.seed}/${sNew.join(',')}`)

// #1014 — drive the star-wheel live: park on the star terrace, open the rings,
// stand this save's alignment notch by notch on the real state machine, and take
// the hub book home. The hub must refuse an unaligned wheel with the page live.
{
  const p4 = await openGame(browser, { url: `${URL}?seed=42`, hook: '__mystTest', start: true, viewport: { width: 960, height: 540 } })
  const errs4 = []
  p4.on('pageerror', (e) => errs4.push(String(e)))
  const w0 = await p4.evaluate(() => window.__mystTest.nearWheel())
  r.check('the solver parks you on the star terrace', w0.node === 'chanWheel' && !w0.open, JSON.stringify(w0))
  await p4.evaluate(() => window.__mystTest.click('hubBook'))
  await p4.waitForTimeout(150)
  let wv = await p4.evaluate(() => window.__mystTest.wheel())
  r.check('the shut hub refuses an unaligned wheel', !wv.open, JSON.stringify(wv))
  await p4.evaluate(() => window.__mystTest.click('starWheel'))
  await p4.waitForTimeout(150)
  wv = await p4.evaluate(() => window.__mystTest.wheel())
  r.check('the wheel opens its rings to the hand', wv.panel === 'wheel', wv.panel)
  for (const i of [0, 1, 2]) {
    for (let k = 0; k < wv.target[i]; k++) await p4.evaluate((j) => window.__mystTest.action({ t: 'dial', pad: 'wheel', i: j }), i)
  }
  await p4.waitForTimeout(150)
  wv = await p4.evaluate(() => window.__mystTest.wheel())
  r.check('standing the seeded stars grinds the hub open', wv.open && JSON.stringify(wv.dial) === JSON.stringify(wv.target), JSON.stringify(wv))
  await p4.evaluate(() => window.__mystTest.click('hubBook'))
  await p4.waitForTimeout(300)
  const pp4 = await p4.evaluate(() => window.__mystTest.probe())
  r.check('the hub book carries the explorer home to the cave', pp4.node === 'cave', pp4.node)
  const drum = await p4.evaluate(() => window.__mystTest.clueStars())
  r.check('the observatory drum wears three seeded silhouettes', drum.length === 3 && new Set(drum).size === 3, drum.join(','))
  r.check('the star-wheel ran with zero page errors', errs4.length === 0, errs4.join(' | '))
}

// #1010 — the rocket, driven live: note at the seam, saddle, ignition, and the
// ride flying off the RAF clock in real time until the surface ending.
{
  const p3 = await openGame(browser, { url: `${URL}?seed=42`, hook: '__mystTest', start: true, viewport: { width: 960, height: 540 } })
  const errs = []
  p3.on('pageerror', (e) => errs.push(String(e)))
  const rr0 = await p3.evaluate(() => window.__mystTest.nearRocket())
  r.check('the solver parks you in the cave with the AMATEM note', rr0.node === 'cave' && rr0.obsNote, JSON.stringify(rr0))
  await p3.evaluate(() => window.__mystTest.click('rocketDoor'))
  await p3.waitForTimeout(150)
  await p3.evaluate(() => window.__mystTest.click('rocketDoor'))
  await p3.waitForTimeout(150)
  let pp = await p3.evaluate(() => window.__mystTest.probe())
  r.check('the note opens the metal seam', pp.flags.includes('rocketOpen'), pp.flags.filter((f) => f.startsWith('rocket')).join(','))
  await p3.evaluate(() => window.__mystTest.click('rocketDoor'))
  await p3.waitForTimeout(300)
  pp = await p3.evaluate(() => window.__mystTest.probe())
  r.check('through the seam into the silo', pp.node === 'rocketSilo', pp.node)
  await p3.keyboard.press('Space')
  await p3.waitForTimeout(250)
  let rk = await p3.evaluate(() => window.__mystTest.rocket())
  r.check('Space on the saddle mounts the rocket', rk.ride === 'seated', rk.ride)
  await p3.evaluate(() => window.__mystTest.click('igniteSwitch'))
  await p3.waitForTimeout(1400)
  rk = await p3.evaluate(() => window.__mystTest.rocket())
  r.check('the switch wakes the ride (ignite, then the clock takes over)', ['ignite', 'liftoff'].includes(rk.ride) && rk.h >= 0, JSON.stringify(rk))
  await p3.waitForTimeout(3500)
  rk = await p3.evaluate(() => window.__mystTest.rocket())
  r.check('the rocket is climbing for real (camera rides the saddle)', rk.h > 40 && rk.dark > 0.2, `h=${rk.h.toFixed(1)} dark=${rk.dark.toFixed(2)}`)
  const pix = await p3.evaluate(() => {
    const c = document.querySelector('canvas[data-myst-stage]')
    if (!c) return 0
    const t = document.createElement('canvas'); t.width = 160; t.height = 90
    t.getContext('2d').drawImage(c, 0, 0, 160, 90)
    return t.toDataURL('image/png').length
  })
  r.check('the ascent renders pixels', pix > 5000, `dataURL ${pix} bytes`)
  await p3.waitForTimeout(7000)
  rk = await p3.evaluate(() => window.__mystTest.rocket())
  pp = await p3.evaluate(() => window.__mystTest.probe())
  r.check('the ride splashes down into the surface ending', pp.ending === 'surface' && rk.ride === 'landed', `${pp.ending}/${rk.ride}`)
  r.check('the rocket ride ran with zero page errors', errs.length === 0, errs.join(' | '))
}

// #1024 — the SPECTATOR live: park in the control room, open the sphere, and
// watch the lenses. Sealed ages stay dark glass; a linked age must animate —
// sampled pixels differ between two instants of the same clock.
{
  const p5 = await openGame(browser, { url: `${URL}?seed=42`, hook: '__mystTest', start: true, viewport: { width: 960, height: 540 } })
  const errs5 = []
  p5.on('pageerror', (e) => errs5.push(String(e)))
  const sp0 = await p5.evaluate(() => window.__mystTest.nearSpectator())
  r.check('the solver parks you at the SPECTATOR', sp0.node === 'mechRoom' && sp0.views.every((v) => v.age), JSON.stringify(sp0.views.map((v) => `${v.age}:${v.unlocked ? 'L' : '-'}`)))
  await p5.evaluate(() => window.__mystTest.click('spectator'))
  await p5.waitForTimeout(500)
  const v1 = await p5.evaluate(() => window.__mystTest.visions())
  r.check('the sphere shows four live lenses', v1.panel === 'spectator' && v1.views.length === 4 && v1.views.every((v) => v.live), JSON.stringify(v1))
  r.check('only Mechanical is clear on the way to the sphere', v1.views.filter((v) => v.unlocked).length === 1, JSON.stringify(v1.views.map((v) => `${v.age}:${v.unlocked}`)))
  const mA = await p5.evaluate(() => window.__mystTest.visionSig('mechanical'))
  const seA = await p5.evaluate(() => window.__mystTest.visionSig('selenitic'))
  await p5.waitForTimeout(900)
  const mB = await p5.evaluate(() => window.__mystTest.visionSig('mechanical'))
  r.check('the linked lens is alive — its picture moves on the clock', mA.lit > 4 && mB.lit > 4 && mA.sum !== mB.sum, JSON.stringify([mA, mB]))
  r.check('an unlinked lens keeps its seal — dark churn, no vision', seA.lit <= 4, JSON.stringify(seA))
  const dom = await p5.evaluate(() => [...document.querySelectorAll('canvas[data-vision]')].map((c) => `${c.dataset.vision}:${c.dataset.unlocked}`))
  r.check('the panel carries one labelled lens per Age', dom.length === 4 && dom.some((d) => d.endsWith(':1')) && dom.filter((d) => d.endsWith(':0')).length === 3, dom.join(','))
  await p5.keyboard.press('Space')
  await p5.waitForTimeout(200)
  const spAll = await p5.evaluate(() => {
    const out = window.__mystTest.nearSpectator('all')
    window.__mystTest.click('spectator')
    return out
  })
  await p5.waitForTimeout(500)
  const sigs = {}
  for (const age of ['selenitic', 'stoneship', 'mechanical', 'channelwood']) sigs[age] = await p5.evaluate((a) => window.__mystTest.visionSig(a), age)
  await p5.waitForTimeout(900)
  let moved = 0
  for (const age of Object.keys(sigs)) {
    const later = await p5.evaluate((a) => window.__mystTest.visionSig(a), age)
    if (later.sum !== sigs[age].sum && later.lit > 4) moved++
  }
  r.check('a walker who knows every Age sees four moving visions', spAll.views.every((v) => v.unlocked) && moved === 4, `${moved}/4 moved`)
  r.check('the Spectator ran with zero page errors', errs5.length === 0, errs5.join(' | '))
}

r.exit(browser)
