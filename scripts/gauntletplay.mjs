// gauntletplay — advisory browser driver (step 6: it must start, play, die and
// restart with real keys and zero page errors; the drawn frame must track the
// logical state). Needs `npm run dev` running.
import { launch, openGame, Report, opt } from './lib/harness.mjs'

const URL = process.env.GAUNTLET_URL || 'http://localhost:5173/retrogames/gauntlet'
const r = new Report('gauntletplay')
const browser = await launch({ headless: opt(process.argv, '--headful', true) === false })
const page = await openGame(browser, { url: URL, hook: '__gauntletTest', start: false, viewport: { width: 820, height: 640 } })

const probe = () => page.evaluate(() => window.__gauntletTest.probe())

let p0 = await probe()
r.check('boots into attract', p0.screen === 'attract', p0.screen)
const frameHash1 = await page.evaluate(() => window.__gauntletTest.hash())
await page.waitForTimeout(700)
const frameHash2 = await page.evaluate(() => window.__gauntletTest.hash())
r.check('attract demo is alive', frameHash1 !== frameHash2)

await page.keyboard.press('Enter')
await page.waitForTimeout(300)
p0 = await probe()
r.check('hero select opens', p0.screen === 'select', p0.screen)
await page.keyboard.press('Digit1')
await page.waitForTimeout(400)
p0 = await probe()
r.check('Warrior starts the first maze', p0.screen === 'play' && p0.level === 0, `${p0.screen} lvl${p0.level}`)

// drive with real keys: walk, turn, swing, shoot
const before = await probe()
for (let i = 0; i < 6; i++) { await page.keyboard.down('ArrowUp'); await page.waitForTimeout(120) }
await page.keyboard.up('ArrowUp')
await page.keyboard.down('ArrowLeft')
await page.waitForTimeout(200)
await page.keyboard.up('ArrowLeft')
await page.keyboard.press('Space')
await page.keyboard.press('KeyX')
await page.waitForTimeout(250)
const after = await probe()
r.check('arrow keys move the hero', Math.hypot(after.hero.x - before.hero.x, after.hero.y - before.hero.y) > 0.2,
    `${before.hero.x.toFixed(2)},${before.hero.y.toFixed(2)} -> ${after.hero.x.toFixed(2)},${after.hero.y.toFixed(2)}`)
r.check('turn changed heading', after.hero.a !== before.hero.a)
const evs = await page.evaluate(() => window.__gauntletTest.events().map((e) => e.type))
r.check('sword + bow fired', evs.includes('sword') && evs.includes('shoot'), [...new Set(evs)].join(','))

// death via the dev hook (no cheating inside sim: starve it honestly)
await page.evaluate(() => { window.__gauntletTest.state().hero.hp = 1 })
await page.waitForTimeout(600)
let p = await probe()
r.check('low health dies (lives spent)', p.lives < 3 || p.end === 'over', `lives ${p.lives}`)
// drain it to the end
for (let i = 0; i < 40 && p.screen === 'play'; i++) {
    await page.evaluate(() => { const gs = window.__gauntletTest.state(); if (gs.hero.hp > 0) gs.hero.hp = 1 })
    await page.waitForTimeout(400)
    p = await probe()
}
r.check('all lives spent -> game over screen', p.screen === 'over' || p.end === 'over', `${p.screen} end=${p.end}`)
await page.waitForTimeout(1200)
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
p = await probe()
r.check('restart returns to hero select', p.screen === 'select', p.screen)

// pixel sanity: the view is not blank while playing
await page.keyboard.press('Digit3')
await page.waitForTimeout(700)
const px = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-gauntlet-stage]')
    const g = c.getContext('2d')
    const d = g.getImageData(40, 40, 120, 100).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++
    return lit
})
r.check('the corridor actually renders', px > 500, `${px} lit px`)

r.exit(browser)
