// popplay — advisory browser driver (step 6): boot, real-key start, real-key
// play, a death, the level restarting under a running clock, and a restart —
// with zero page errors and the drawn state tracking the sim after every
// input. Needs `npm run dev` (or POP_URL).
import { launch, openGame, Report, opt } from './lib/harness.mjs'

const URL = process.env.POP_URL || 'http://localhost:5173/retrogames/prince-of-persia'
const r = new Report('popplay')
const browser = await launch({ headless: opt(process.argv, '--headful', true) === false })
const page = await openGame(browser, { url: URL, hook: '__popTest', start: false, viewport: { width: 820, height: 680 } })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const probe = () => page.evaluate(() => window.__popTest.probe())
const hash = () => page.evaluate(() => window.__popTest.hash())

let p = await probe()
r.check('boots into attract', p.attract === true && p.status === 'play', `${p.attract} ${p.status}`)
r.check('the prince starts unarmed', p.sword === false)
const h1 = await hash()
await page.waitForTimeout(700)
const h2 = await hash()
r.check('attract demo is alive (autopilot in the dungeon)', h1 !== h2)

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
const airborne = pj.y < 8 * 32 - 4 || pj.vy < 0
await page.keyboard.up('Space')
await page.waitForTimeout(120)
await page.keyboard.up('ArrowRight')
r.check('SPACE leaves the ground', airborne, `y ${pj.y.toFixed(0)} vy ${pj.vy.toFixed(1)}`)

// sword pickup: run right through level 1's first room until it is drawn
let swordSeen = false
for (let i = 0; i < 60 && !swordSeen; i++) {
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(120)
    swordSeen = (await probe()).sword
}
await page.keyboard.up('ArrowRight')
r.check('the sword is found in level 1', swordSeen)

// hazard proof: race the gate, then hop onto the chomper's column right when
// its jaws are down — the sim's schedule is the same clock the probe reads.
// The level must restart and the hour must keep running through the death.
let died = false
let clockAtDeath = 0
let restarted = false
const PERIOD = 150, WAIT = 96, DROP = 30, REST = 8, PHASE = (26 % 3) * 22
await page.keyboard.down('ArrowRight')
for (let i = 0; i < 400 && !(died && restarted); i++) {
    p = await probe()
    if (p.status === 'dying' && !died) { died = true; clockAtDeath = p.clock }
    if (died && p.status === 'play' && p.clock < clockAtDeath) restarted = true
    if (!died) {
        if (p.level === 0 && p.gate < 0.7 && p.x > 12.9 * 32 && p.x < 13.7 * 32) {
            await page.keyboard.up('ArrowRight')      // linger on the button, let it lift
            await page.waitForTimeout(1000)
            await page.keyboard.down('ArrowRight')
        }
        if (p.level === 0 && p.x >= 27 * 32) {        // lived past the jaws — retreat and try the timing again
            await page.keyboard.up('ArrowRight')
            await page.keyboard.down('ArrowLeft')
            await page.waitForTimeout(1400)
            await page.keyboard.up('ArrowLeft')
            await page.keyboard.down('ArrowRight')
        }
        const tick = 216000 - p.clock
        const ph = ((tick + PHASE) % PERIOD + PERIOD) % PERIOD
        if (p.level === 0 && p.x > 20 * 32 && p.x < 27 * 32 && ph > 58 && ph < 92) {
            await page.keyboard.press('Space')          // hop the blade as it snaps down
        }
    }
    await page.waitForTimeout(90)
}
await page.keyboard.up('ArrowRight')
r.check('the chomper claims the careless (scheduled jaws)', died, `status=${p.status}`)
r.check('death restarts with the clock still running', restarted, `clock ${clockAtDeath.toFixed(0)} -> ${p.clock.toFixed(0)}`)

// restart path after game over (DEV cheat to the end screen, then real R key)
await page.evaluate(() => window.__dbg && window.__dbg.act('win'))
await page.waitForTimeout(1200)
p = await probe()
r.check('the princess door opens at the end of the hour', p.status === 'win', `${p.status} L${p.level}`)
await page.keyboard.press('KeyR')
await page.waitForTimeout(300)
p = await probe()
r.check('R restarts the hour', p.status === 'play' && p.level === 0 && p.clock > 200000, `${p.status} L${p.level} clock=${p.clock.toFixed(0)}`)

r.check('zero page errors', errors.length === 0, errors.join(' | '))
r.exit(browser)
