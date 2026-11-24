// stompdrive — STOMPTOWN driven in a real tab (#3094): attract breathes, a real
// key takes the boulevard, punched towers fall, the blimp rescues, a razed city
// rolls to dawn, the last life prints the over card and any key restarts — all
// with zero page errors. Node-side rules already live in stompcheck; this drives
// the wire: keys -> shell -> canvas. Shots land in /tmp/forge.

import { launchChrome } from './lib/chromeboot.mjs'

const URL = process.env.STOMP_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/stomptown`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}
const canvasNoise = (pg) => pg.evaluate(() => {
    const c = document.querySelector('canvas')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    const seen = new Set()
    for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
    return seen.size
})
const clipShot = async (pg) => pg.screenshot({ clip: await pg.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x + b.width * 0.2, y: b.y + b.height * 0.2, width: b.width * 0.4, height: b.height * 0.5 } }) })

const browser = await launchChrome({ channel: process.env.SHOT_CHANNEL || 'chrome', extraArgs: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|AutoPlayback/i.test(m.text())) errs.push(m.text()) })

await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction('!!window.__stomptownTest', null, { timeout: 15000 })
await sleep(1200)

ok('attract shows', (await page.evaluate(() => window.__stomptownTest.state().st)) === 'attract')
ok('attract is drawn, not black', (await canvasNoise(page)) > 8)
await page.screenshot({ path: '/tmp/forge/stomp-attract.png' })
const fA = await clipShot(page)
await sleep(1100)
const fB = await clipShot(page)
ok('the attract demo moves (autopilot frames differ)', !fA.equals(fB))

// a real key takes the boulevard
await page.keyboard.press('Space')
await sleep(700)
ok('any key starts the game', (await page.evaluate(() => window.__stomptownTest.state().st)) === 'play')

// real keys drive the giant: walk right and swing at the towers. CDP press()
// can complete down+up inside one frame — the sim edge-detects on ticks, so the
// swings get spaced across real frames instead.
for (let i = 0; i < 90; i++) { await page.keyboard.down('ArrowRight'); await sleep(16) }
await page.keyboard.up('ArrowRight')
for (let i = 0; i < 40; i++) { await page.keyboard.down('Space'); await sleep(50); await page.keyboard.up('Space'); await sleep(50) }
const play1 = await page.evaluate(() => window.__stomptownTest.state())
ok('real swings score real points', play1.score > 0, `score=${play1.score} x=${play1.x}`)
ok('the boulevard moves the giant', play1.x > 140, `x=${play1.x}`)
await page.screenshot({ path: '/tmp/forge/stomp-play.png' })
ok('the city is drawn while playing', (await canvasNoise(page)) > 40)

// the blimp rescue: take a mortal hit and watch the four-phase ride
await page.evaluate(() => { window.__stomptownTest.calm(); window.__stomptownTest.damage(999) })
const rev = await page.evaluate(() => { const s = window.__stomptownTest.state(); return { lives: s.lives, reverting: s.reverting, hp: s.hp } })
ok('a fatal hit costs a life and starts the revert', rev.lives === 2 && rev.reverting, `lives=${rev.lives} reverting=${rev.reverting}`)
await page.waitForFunction("window.__stomptownTest.state().reverting === false || window.__stomptownTest.state().done", null, { timeout: 15000 })
const back = await page.evaluate(() => window.__stomptownTest.state())
ok('the giant is back at full power', back.hp === 100 && !back.reverting, `hp=${back.hp}`)

// raze the city: dawn rolls to Chicago (day 2)
await page.evaluate(() => { window.__stomptownTest.calm(); window.__stomptownTest.winNow() })
await page.waitForFunction("window.__stomptownTest.probe().day >= 2", null, { timeout: 20000 })
ok('a razed city rolls to day 2 (Chicago)', (await page.evaluate(() => window.__stomptownTest.probe().day)) === 2)

// spend the remaining lives through real revert cycles until the last one sticks
for (let i = 0; i < 5 && !(await page.evaluate(() => window.__stomptownTest.state().done)); i++) {
    await page.evaluate(() => { window.__stomptownTest.calm(); window.__stomptownTest.damage(999) })
    await page.waitForFunction("window.__stomptownTest.state().done || (window.__stomptownTest.state().reverting === false && window.__stomptownTest.state().hp === 100)", null, { timeout: 15000 })
}
ok('empty lives end the tour', (await page.evaluate(() => window.__stomptownTest.state().done)) === true)
await page.screenshot({ path: '/tmp/forge/stomp-over.png' })
await sleep(1500)   // the over card swallows mashing for 800 ms after it appears
await page.keyboard.press('Space')
await sleep(700)
const restart = await page.evaluate(() => window.__stomptownTest.state())
ok('any key restarts at day 1 with 3 lives', restart.st === 'play' && restart.day === 1 && restart.lives === 3 && restart.score === 0, `day=${restart.day} lives=${restart.lives}`)

// '?' pauses and resumes (the disaster card offers RESUME; the pad never does)
await page.keyboard.press('Shift+Slash')
await sleep(400)
ok('the ? card opens', /RESUME GAME/.test(await page.evaluate(() => document.body.innerText)))
await page.keyboard.press('Shift+Slash')
await sleep(300)
ok('the card closes', !/RESUME GAME/.test(await page.evaluate(() => document.body.innerText)))

ok('zero page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
console.log(`\nstompdrive: ${pass}/${pass + fail} checks passed${fail ? ` — ${fail} FAILED` : ' — OK'}`)
await browser.close()
process.exit(fail ? 1 : 0)
