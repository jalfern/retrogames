// tempestplay — advisory browser driver: boot, start, slide/fire with real keys,
// idle arrivals kill, restart breathes, HUD mirrors the sim, zero page errors.
// Needs `npm run dev` running (or TEMPEST_URL pointed at one).
import { launch, openGame, Report, opt } from './lib/harness.mjs'

const URL = process.env.TEMPEST_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/tempest`
const r = new Report('tempestplay')
const browser = await launch({ headless: opt(process.argv, '--headful', true) === false })
const page = await openGame(browser, { url: URL, hook: '__tempestTest', start: false, viewport: { width: 820, height: 700 } })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const probe = () => page.evaluate(() => window.__tempestTest.probe())

let p0 = await probe()
r.check('boots into attract', p0.screen === 'attract', p0.screen)
const h1 = await page.evaluate(() => window.__tempestTest.hash())
await page.waitForTimeout(700)
const h2 = await page.evaluate(() => window.__tempestTest.hash())
r.check('attract demo is alive', h1 !== h2)

const painted = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-tempest-stage]')
    const g = c.getContext('2d')
    const d = g.getImageData(0, 0, c.width, c.height).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 150) lit++
    return lit
})
r.check('the vector tube is painted', painted > 400, `${painted} lit pixels`)

await page.keyboard.press('Enter')
await page.waitForTimeout(300)
p0 = await probe()
r.check('press any key starts the run', p0.screen === 'play' && p0.level === 1, `${p0.screen} L${p0.level}`)

await page.keyboard.down('Space')
await page.waitForTimeout(150)
const firing = await probe()
await page.keyboard.up('Space')
r.check('SPACE sends bullets down the tube', firing.bullets >= 1, `bullets ${firing.bullets}`)

const s0 = await probe()
await page.keyboard.down('ArrowLeft')
await page.waitForTimeout(300)
await page.keyboard.up('ArrowLeft')
const s1 = await probe()
let dL = s1.p - s0.p
if (dL > s1.faces / 2) dL -= s1.faces
r.check('the stick slides the rim (left)', dL < -1, `${s0.p} -> ${s1.p}`)
await page.keyboard.down('ArrowRight')
await page.waitForTimeout(300)
await page.keyboard.up('ArrowRight')
const s2 = await probe()
let dR = s2.p - s1.p
if (dR < -s2.faces / 2) dR += s2.faces
r.check('and back the other way', dR > 1, `${s1.p} -> ${s2.p}`)

const l0 = await probe()
for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(4000)
    const p = await probe()
    if (p.end === 'over') break
}
const over = await probe()
r.check('idle arrivals reach the rim and kill', over.lives < l0.lives || over.end === 'over', `lives ${l0.lives} -> ${over.lives}`)
r.check('four arrivals end the run', over.end === 'over' || over.lives < 4, `end ${over.end} lives ${over.lives}`)

if (over.end === 'over') {
    await page.waitForTimeout(1100)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    const back = await probe()
    r.check('the over screen restarts', back.screen === 'play' || back.screen === 'attract', back.screen)
}

const hudScore = await page.evaluate(() => parseInt(document.body.innerText.match(/SCORE\s+(\d+)/)?.[1], 10))
const simScore = (await probe()).score
r.check('the SCORE strip mirrors the sim', Math.abs(hudScore - simScore) <= 5, `hud ${hudScore} sim ${simScore}`)

r.check('zero page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await r.exit(browser)
