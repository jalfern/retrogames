// BOMB DRIVE — real key/tap drive for TALK ME DOWN (#1252, step 6). Attract ->
// select -> play; drawn pixels follow the sim; a real keyboard strike; mic-path
// obey + refuse (grammar level, #1247); contract reset/step hashes self-agree;
// death, restart, pause — all with zero page errors. Shots land in /tmp/forge.

import { chromium } from 'playwright-core'

const URL = process.env.TMD_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/talk-me-down`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}
const cvBox = async (pg) => {
    const el = await pg.$('canvas')
    const b = await el.boundingBox()
    return { x: b.x, y: b.y, w: b.width, h: b.height }
}
const canvasNoise = async (pg) => pg.evaluate(() => {
    const c = document.querySelector('canvas')
    const g = c.getContext('2d')
    const d = g.getImageData(0, 0, c.width, c.height).data
    const seen = new Set()
    for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
    return seen.size
})

const browser = await chromium.launch({ channel: process.env.SHOT_CHANNEL || 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|AutoPlayback|favicon.ico/i.test(m.text())) errs.push(m.text()) })

await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction('!!window.__tmdTest', null, { timeout: 15000 })
await sleep(1200)
ok('attract shows', (await page.evaluate(() => window.__tmdTest.screen())) === 'attract')
ok('attract is drawn, not black', (await canvasNoise(page)) > 8)
await page.screenshot({ path: '/tmp/forge/tmd-attract.png' })

// attract animates on its own (demo bomb ticking)
const fA = await page.screenshot({ clip: await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x + b.width * 0.2, y: b.y + b.height * 0.2, width: b.width * 0.4, height: b.height * 0.5 } }) })
await sleep(1100)
const fB = await page.screenshot({ clip: await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x + b.width * 0.2, y: b.y + b.height * 0.2, width: b.width * 0.4, height: b.height * 0.5 } }) })
ok('the attract demo moves (frames differ)', !fA.equals(fB))

// attract -> select -> mode pick -> play, all with real keys
await page.keyboard.press('Space')
await sleep(200)
ok('any key reaches select', (await page.evaluate(() => window.__tmdTest.screen())) === 'select')
await page.keyboard.press('ArrowRight')
await page.keyboard.press('ArrowLeft')
await page.screenshot({ path: '/tmp/forge/tmd-select.png' })
await page.keyboard.press('Space')
await sleep(300)
ok('space starts the run (1P)', (await page.evaluate(() => window.__tmdTest.screen())) === 'play')
const st0 = await page.evaluate(() => window.__tmdTest.state())
ok('play opens a round-1 bomb', st0.round === 1 && st0.modules.length === 1)

// real keys: cycle modules + move cursor; drawn selection follows the logic
const box = await cvBox(page)
const clip = { x: box.x + 20, y: box.y + box.h * 0.28, width: box.w - 40, height: box.h * 0.4 }
const shotBefore = await page.screenshot({ clip })
page.keyboard.down('ArrowRight')
await sleep(140)
page.keyboard.up('ArrowRight')
await sleep(160)
const st1 = await page.evaluate(() => window.__tmdTest.state())
const st1moved = st0.modules[0].type === 'D'
    ? st1.modules[0].dial !== st0.modules[0].dial
    : st1.cursor.sub !== st0.cursor.sub
const shotAfter = await page.screenshot({ clip })
ok('real arrows move the cursor/dial (logical)', st1moved, `sub ${st0.cursor.sub} -> ${st1.cursor.sub}, dial ${st0.modules[0].dial} -> ${st1.modules[0].dial}`)
ok('the picture moved with the input', !shotBefore.equals(shotAfter))
await page.screenshot({ path: '/tmp/forge/tmd-play.png' })

// a real strike: mash SPACE on wires until a breaker trips (never free-solves)
let strikes = 0
for (let i = 0; i < 8 && !strikes; i++) {
    await page.keyboard.press('Space')
    await sleep(180)
    strikes = (await page.evaluate(() => window.__tmdTest.state())).strikes
    page.keyboard.down('ArrowRight'); await sleep(90); page.keyboard.up('ArrowRight'); await sleep(60)
}
ok('a wrong verb at the panel trips a strike for real', strikes === 1)

// mic grammar path (no speech service in headless — phrase injection, #1249 lesson)
const micOn = await page.evaluate(() => { window.__tmdTest.call('cut purple'); return window.__tmdTest.voiceLog().slice(-1)[0] })
ok('nonsense shout is refused with a log entry', micOn && micOn.ok === false && micOn.intent === null)
await page.evaluate(() => window.__tmdTest.call('cut red'))
const obey = await page.evaluate(() => window.__tmdTest.voiceLog().slice(-1)[0])
ok('a colour shout is understood (obey or refuse-with-why, never silent)', obey && obey.intent && obey.intent.kind === 'cut')
const mode = await page.evaluate(() => window.__tmdTest.voiceMode())
ok('voice badge reports support state', typeof mode.supported === 'boolean')

// contract: seeded reset, 300 scripted ticks, hashes agree across resets
const h = await page.evaluate(() => {
    const g = window.__game
    const pads = i => ({ left: i % 47 < 11, right: i % 47 >= 18 && i % 47 < 30, up: i % 31 < 7, down: i % 31 >= 12 && i % 31 < 20, a: i % 23 < 2, b: false })
    g.reset(4242, 1); g.release()
    let last = 0
    for (let i = 0; i < 300; i++) last = g.step(pads(i)).hash
    g.reset(4242, 1)
    let again = 0
    for (let i = 0; i < 300; i++) again = g.step(pads(i)).hash
    return { last, again, id: g.meta.id }
})
ok('contract id + deterministic hashes', h.id === 'talk-me-down' && h.last === h.again, JSON.stringify(h))

// die for real via the contract clock, then restart with a real key
await page.evaluate(() => {
    const g = window.__game
    g.reset(7, 1)
    for (let t = 0; t < 5200; t++) g.step({})
})
await sleep(300)
const dead = await page.evaluate(() => ({ screen: window.__tmdTest.screen(), st: window.__tmdTest.state() }))
ok('an ignored fuse explodes into the over screen', dead.screen === 'over' && dead.st.done && !dead.st.won)
await page.screenshot({ path: '/tmp/forge/tmd-over.png' })
await sleep(900)
await page.keyboard.press('Space')
await sleep(250)
ok('space after game over returns to attract', (await page.evaluate(() => window.__tmdTest.screen())) === 'attract')

// tap-to-start on touch: reload and tap the canvas
await page.reload({ waitUntil: 'load' })
await page.waitForFunction('!!window.__tmdTest', null, { timeout: 15000 })
await sleep(800)
const cv = await page.$('canvas')
await cv.click({ position: { x: 120, y: 120 } })
await sleep(200)
ok('tap advances the attract screen', (await page.evaluate(() => window.__tmdTest.screen())) === 'select')

// pause overlay during play
await page.keyboard.press('Space')
await sleep(250)
await page.keyboard.press('Escape')
await sleep(250)
const pausedShown = await page.evaluate(() => /TALK ME DOWN/i.test(document.body.innerText))
ok('escape raises the squad card (pause overlay)', pausedShown)
await page.keyboard.press('Escape')

ok('zero page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
await browser.close()
console.log(`\nbombdrive: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
