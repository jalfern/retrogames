// popplay — advisory browser driver (step 6): boot, real-key start, real-key
// play, a death, a restart — with zero page errors and the drawn state
// tracking the sim after every input. Needs `npm run dev` (or POP_URL).
import { launch, openGame, Report, opt } from './lib/harness.mjs'

const URL = process.env.POP_URL || 'http://localhost:5173/retrogames/prince-of-persia'
const r = new Report('popplay')
const browser = await launch({ headless: opt(process.argv, '--headful', true) === false })
const page = await openGame(browser, { url: URL, hook: '__popTest', start: false, viewport: { width: 820, height: 640 } })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const probe = () => page.evaluate(() => window.__popTest.probe())
const hash = () => page.evaluate(() => window.__popTest.hash())

let p = await probe()
r.check('boots into attract', p.attract === true && p.status === 'play', `${p.attract} ${p.status}`)
const h1 = await hash()
await page.waitForTimeout(700)
const h2 = await hash()
r.check('attract demo is alive (autopilot fencing the dungeon)', h1 !== h2)

await page.keyboard.press('Space')
await page.waitForTimeout(200)
p = await probe()
r.check('press any key starts the hour', p.attract === false && p.level === 0, `${p.attract} L${p.level}`)
const c0 = p.clock
await page.waitForTimeout(300)
r.check('clock is running', (await probe()).clock < c0, 'ticks spent')

// run right (real key): the drawn prince tracks the sim
const x0 = (await probe()).x
await page.keyboard.down('ArrowRight')
await page.waitForTimeout(500)
const x1 = (await probe()).x
await page.keyboard.up('ArrowRight')
r.check('ArrowRight runs the prince', x1 - x0 > 25, `${x0.toFixed(0)} -> ${x1.toFixed(0)}`)

// jump (real key)
await page.keyboard.down('ArrowRight')
await page.keyboard.down('Space')
await page.waitForTimeout(120)
const pj = await probe()
const airborne = pj.y < 280 || pj.vy < 0
await page.keyboard.up('Space')
await page.waitForTimeout(120)
await page.keyboard.up('ArrowRight')
r.check('SPACE leaves the ground', airborne, `y ${pj.y.toFixed(0)} vy ${pj.vy.toFixed(1)}`)

// hazard proof: hold right without care; the pits and spikes must claim him
let died = false
let cleared = false
for (let i = 0; i < 220 && !died && !cleared; i++) {
    await page.keyboard.down('ArrowRight')
    await page.keyboard.press('Space')
    await page.waitForTimeout(160)
    p = await probe()
    if (p.status === 'dying') died = true
    if (p.level > 0 || p.status === 'clear') cleared = true
}
await page.keyboard.up('ArrowRight')
r.check('the dungeon fights back (death or escape on a blind sprint)', died || cleared, `died=${died} escaped=${cleared} status=${p.status}`)
r.check('a life was paid for it', died ? p.lives < 3 : true, `lives ${p.lives}`)

// restart path after game over (DEV cheat to the end screen, then real R key)
await page.evaluate(() => window.__dbg && window.__dbg.act('win'))
await page.waitForTimeout(1200)
p = await probe()
r.check('the princess door opens after the boss falls', p.status === 'win' || p.level === 4, `${p.status} L${p.level}`)
await page.keyboard.press('KeyR')
await page.waitForTimeout(300)
p = await probe()
r.check('R restarts the hour', p.status === 'play' && p.level === 0 && p.lives >= 3, `${p.status} L${p.level} lives ${p.lives}`)

r.check('zero page errors', errors.length === 0, errors.join(' | '))
r.exit(browser)
