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

r.exit(browser)
