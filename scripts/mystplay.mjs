// mystplay — advisory browser driver (step 6): boots the island, starts with
// real keys/keys events, turns, steps onto the path, and the solver finishes
// the game through the live state machine — with zero page errors.
// Needs `npm run dev` running (MYST_URL overrides).
import { launch, openGame, Report, opt } from './lib/harness.mjs'

const URL = process.env.MYST_URL || 'http://localhost:5173/retrogames/myst'
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

r.exit(browser)
