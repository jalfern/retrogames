// landerplay — advisory browser driver (step 6: start, play, crash, restart
// with real keys and zero page errors; the drawn frame tracks the sim).
// Needs `npm run dev` running (or LANDER_URL pointed at one).
import { launch, openGame, Report, opt } from './lib/harness.mjs'

const URL = process.env.LANDER_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/lunar-lander`
const r = new Report('landerplay')
const browser = await launch({ headless: opt(process.argv, '--headful', true) === false })
const page = await openGame(browser, { url: URL, hook: '__landerTest', start: false, viewport: { width: 820, height: 700 } })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const probe = () => page.evaluate(() => window.__landerTest.probe())

let p0 = await probe()
r.check('boots into attract', p0.screen === 'attract', p0.screen)
const h1 = await page.evaluate(() => window.__landerTest.hash())
await page.waitForTimeout(700)
const h2 = await page.evaluate(() => window.__landerTest.hash())
r.check('attract demo is alive', h1 !== h2)

// the canvas actually paints the moon (not a black frame)
const painted = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-lunar-lander-stage]')
    const g = c.getContext('2d')
    const d = g.getImageData(0, 0, c.width, c.height).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 150) lit++
    return lit
})
r.check('the vector scene is painted', painted > 400, `${painted} lit pixels`)

// real key starts the run
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
p0 = await probe()
r.check('press any key starts the descent', p0.screen === 'play' && p0.phase === 'descent', `${p0.screen}/${p0.phase}`)

// thrust: the stick lights the engine and the sim responds
await page.keyboard.down('Space')
await page.waitForTimeout(600)
const afterThrust = await probe()
await page.keyboard.up('Space')
r.check('SPACE burns fuel and arrests the fall', afterThrust.fuel < 240 && afterThrust.vy > -8, `fuel ${afterThrust.fuel} vy ${afterThrust.vy}`)

// rotation tracks the stick both ways
const r0 = await probe()
await page.keyboard.down('ArrowLeft')
await page.waitForTimeout(300)
await page.keyboard.up('ArrowLeft')
const r1 = await probe()
r.check('the stick rotates the lander', r1.rot < r0.rot - 0.05, `${r0.rot} -> ${r1.rot}`)
await page.keyboard.down('ArrowRight')
await page.waitForTimeout(300)
await page.keyboard.up('ArrowRight')
const r2 = await probe()
r.check('and back the other way', r2.rot > r1.rot + 0.05, `${r1.rot} -> ${r2.rot}`)

// zoom toggles on X
await page.keyboard.press('KeyX')
await page.waitForTimeout(120)
const z1 = await probe()
r.check('X zooms the view', z1.zoom === true)
await page.keyboard.press('KeyX')

// free fall: do nothing and gravity delivers a crash; landers must drop
const l0 = await probe()
for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(5200)
    const p = await probe()
    if (i === 0) r.check('gravity eventually crashes the idle lander', p.crashes > l0.crashes || p.end === 'over', `crashes ${p.crashes} end ${p.end}`)
    if (p.end === 'over') break
}
const over = await probe()
r.check('four crashes ends the run', over.end === 'over' || over.landers < 4, `end ${over.end} landers ${over.landers}`)

// restart loop keeps breathing
if (over.end === 'over') {
    await page.waitForTimeout(1100)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    const back = await probe()
    r.check('the over screen restarts', back.screen === 'play' || back.screen === 'attract', back.screen)
}

// HUD mirrors the sim
const hudAlt = await page.evaluate(() => document.body.innerText.match(/ALT\s+(\d+)/)?.[1])
const simAlt = (await probe()).alt
r.check('the ALT readout mirrors the sim', hudAlt === String(simAlt), `hud ${hudAlt} sim ${simAlt}`)

r.check('zero page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await r.exit(browser)
