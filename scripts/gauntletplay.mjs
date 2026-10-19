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

// 2P real frame path (issue #491): with a human partner, P2 (WASD) steers itself
// by its OWN input through the actual rAF body (doFrameSim -> doSim -> step); it
// does NOT trail the hero. The drop was in doSim's one-arg signature; #492 fixed
// that (and folded the second pad in via p2From). This drives the real frame
// path so the fix can't regress: P2 holding W must leave a stationary P1 behind.
{
    await page.evaluate(() => {
        const t = window.__gauntletTest
        t.start2P('warrior', 'elf')
        const gs = t.state()
        gs.monsters = []; gs.gens.forEach((g) => { g.alive = false })
        gs.hero.hp = 1e9; gs.partner.hp = 1e9
        t.setP2({ u: true })                    // P2 holds W (up); P1 hands off
        const a = t.probe()
        for (let i = 0; i < 50; i++) t.frame()  // drive the real frame path
        const b = t.probe()
        t.setP2({ u: false })
        t.__491 = { p0: a.p2, p1: b.p2, h: b.hero }
    })
    const g = await page.evaluate(() => window.__gauntletTest.__491)
    r.check('2P: P2 walks up by its own input (real frame path)', g.p1.y < g.p0.y - 1,
        `${g.p0.y.toFixed(2)} -> ${g.p1.y.toFixed(2)}`)
    r.check('2P: P2 does not trail the idle hero', Math.hypot(g.p1.x - g.h.x, g.p1.y - g.h.y) > 1,
        `dist ${Math.hypot(g.p1.x - g.h.x, g.p1.y - g.h.y).toFixed(2)}`)
    r.check('2P: P2 faces where it walks', Math.abs(g.p1.a + Math.PI / 2) < 0.01, `a ${g.p1.a.toFixed(2)}`)
}

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

// #494 player slots on the REAL path: a cpu seat opened at hero select must
// carry a partner that moves under its own emitted pads, and the contract must
// step one pad per player.
{
    for (let i = 0; i < 20 && (await probe()).screen === 'play'; i++) {
        await page.evaluate(() => { const gs = window.__gauntletTest.state(); if (gs.hero.hp > 0) gs.hero.hp = 1 })
        await page.waitForTimeout(350)
    }
    await page.waitForTimeout(1200)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    let q = await probe()
    r.check('#494: back at hero select for the seat test', q.screen === 'select', q.screen)
    await page.keyboard.press('KeyC')
    await page.waitForTimeout(150)
    q = await probe()
    r.check('#494: C opens the cpu seat at select', q.seat === 'cpu', q.seat)
    await page.keyboard.press('Digit1')
    await page.waitForTimeout(500)
    const c0 = await probe()
    r.check('#494: the cpu seat carries a partner into the maze', c0.p2 !== null && c0.seat === 'cpu', `p2=${!!c0.p2} seat=${c0.seat}`)
    // the hero runs; the pad-emitting partner must follow under its own pads
    await page.keyboard.down('ArrowUp')
    for (let i = 0; i < 10; i++) { await page.waitForTimeout(60); await page.evaluate(() => window.__gauntletTest.frame()) }
    await page.keyboard.up('ArrowUp')
    for (let i = 0; i < 60; i++) await page.evaluate(() => window.__gauntletTest.frame())
    const c1 = await probe()
    r.check('#494: the cpu partner travels under its own pads',
        Math.hypot(c1.p2.x - c0.p2.x, c1.p2.y - c0.p2.y) > 0.3,
        `${c0.p2.x.toFixed(2)},${c0.p2.y.toFixed(2)} -> ${c1.p2.x.toFixed(2)},${c1.p2.y.toFixed(2)}`)

    const cs = await page.evaluate(() => {
        const g = window.__game
        g.reset(7)
        const s1 = g.step([{ up: true }, { right: true, a: true }], 1)
        const s2 = g.step({ up: true }, 1)
        g.release()
        return { t1: s1.tick, t2: s2.tick }
    })
    r.check('#494: step([p1,p2]) steps exactly one tick and legacy pad still steps',
        cs.t1 === cs.t2 - 1, JSON.stringify(cs))
}

r.exit(browser)
