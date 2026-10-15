// smashplay — advisory browser driver (step 6: start, play, die and restart
// with real keys and zero page errors; the drawn frame tracks the sim).
// Needs `npm run dev` running (or SMASH_URL pointed at one).
import { launch, openGame, Report, opt } from './lib/harness.mjs'

const URL = process.env.SMASH_URL || 'http://localhost:5173/retrogames/smash-tv'
const r = new Report('smashplay')
const browser = await launch({ headless: opt(process.argv, '--headful', true) === false })
const page = await openGame(browser, { url: URL, hook: '__smashTest', start: false, viewport: { width: 820, height: 640 } })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const probe = () => page.evaluate(() => window.__smashTest.probe())

let p0 = await probe()
r.check('boots into attract', p0.screen === 'attract', p0.screen)
const h1 = await page.evaluate(() => window.__smashTest.hash())
await page.waitForTimeout(700)
const h2 = await page.evaluate(() => window.__smashTest.hash())
r.check('attract demo is alive', h1 !== h2)

await page.keyboard.press('Enter')
await page.waitForTimeout(400)
p0 = await probe()
r.check('press any key starts the show', p0.screen === 'play' && p0.room === 0, `${p0.screen} room ${p0.room}`)
r.check('spawn shield up', p0.player.invuln > 0)

// twin-stick: run right while firing left — drawn state must track
const before = await probe()
await page.keyboard.down('ArrowRight')
await page.keyboard.down('KeyJ')
await page.waitForTimeout(350)
await page.keyboard.up('ArrowRight')
await page.keyboard.up('KeyJ')
await page.waitForTimeout(150)
const after = await probe()
r.check('arrows move the contestant', Math.hypot(after.player.x - before.player.x, after.player.y - before.player.y) > 3,
    `${before.player.x.toFixed(0)},${before.player.y.toFixed(0)} -> ${after.player.x.toFixed(0)},${after.player.y.toFixed(0)}`)
r.check('firing stick aims independently', after.player.aim[0] === -1 || after.player.aim.join(',') === '-1,0', `aim ${after.player.aim}`)
let evs = await page.evaluate(() => window.__smashTest.events().map((e) => e.type))
r.check('the guns fired', evs.includes('shoot'), [...new Set(evs)].join(','))

// firebomb spends power
const e0 = await probe()
await page.evaluate(() => window.__smashTest.bomb())
await page.waitForTimeout(200)
const e1 = await probe()
r.check('firebomb costs POWER', e1.energy === e0.energy - 34, `${e0.energy} -> ${e1.energy}`)

// one honest death: drop a bullet on the player after the shield lapses
await page.evaluate(() => { const gs = window.__smashTest.state(); gs.player.invuln = 0; gs.ebullets.push({ id: 7001, x: gs.player.x + 2, y: gs.player.y, dx: 1, dy: 0, dmg: 1, kind: 'shot' }) })
await page.waitForTimeout(300)
let p = await probe()
r.check('one hit takes a life', p.lives < 3 || p.end === 'over', `lives ${p.lives}`)

// burn the rest of the lives
for (let i = 0; i < 12 && p.screen === 'play'; i++) {
    await page.evaluate(() => { const gs = window.__smashTest.state(); gs.player.invuln = 0; gs.ebullets.push({ id: 7100 + gs.tick, x: gs.player.x + 2, y: gs.player.y, dx: 1, dy: 0, dmg: 1, kind: 'shot' }) })
    await page.waitForTimeout(700)
    p = await probe()
}
r.check('all lives spent -> game over', p.screen === 'over' || p.end === 'over', `${p.screen} end=${p.end}`)

await page.waitForTimeout(1200)
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
p = await probe()
r.check('restart returns to the arena', p.screen === 'play' && p.room === 0 && p.lives === 3, p.screen)

// pixel sanity: the arena is not blank while playing
const px = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-smash-stage]')
    const g = c.getContext('2d')
    const d = g.getImageData(40, 60, 160, 140).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++
    return lit
})
r.check('the arena actually renders', px > 500, `${px} lit px`)

r.check('zero page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
r.exit(browser)
