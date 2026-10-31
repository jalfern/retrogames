// RALLY DRIVE — real key/tap drive for RALLY CO-DRIVER (#1251, step 6).
// Attract -> play by a real tap; throttle advances the drawn car; '?' pauses
// AND freezes the sim, RESUME click resumes with zero pageerror (the two
// pause bugs #1307 shipped with — this script is their regression proof);
// C flips seat 2 to keys, a W edge files a note; voice path parses headless;
// an accelerated finish reaches STAGE COMPLETE and Space restarts. Zero page
// errors throughout. Shots land in /tmp/forge.

import { chromium } from 'playwright-core'

const URL = process.env.RALLY_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/rally-co-driver`
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
const st = (pg) => pg.evaluate(() => window.__rallyTest.state())
const scr = (pg) => pg.evaluate(() => window.__rallyTest.screen())
const hash = (pg) => pg.evaluate(() => window.__rallyTest.hash())

const browser = await chromium.launch({ channel: process.env.SHOT_CHANNEL || 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|AutoPlayback|favicon.ico/i.test(m.text())) errs.push(m.text()) })

await page.goto(URL, { waitUntil: 'load' })
await page.waitForFunction('!!window.__rallyTest', null, { timeout: 15000 })
await sleep(1200)

ok('attract shows', (await scr(page)) === 'attract')
ok('attract is drawn, not black', (await canvasNoise(page)) > 8)
await page.screenshot({ path: '/tmp/forge/rally-attract.png' })

// attract demo moves on its own (CPU pair driving)
const clip = await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x + b.width * 0.2, y: b.y + b.height * 0.3, width: b.width * 0.6, height: b.height * 0.5 } })
const fA = await page.screenshot({ clip })
await sleep(1100)
const fB = await page.screenshot({ clip })
ok('the attract demo moves (frames differ)', !fA.equals(fB))

// tap-to-start with a real pointer event
const box = await cvBox(page)
await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2)
await sleep(400)
ok('tap starts the race', (await scr(page)) === 'play')

// throttle: drawn state + logical state advance together
const raw = (pg) => pg.evaluate(() => { const c = window.__rallyTest.gs().car; return { s: c.s, v: c.v } })
const s0 = (await raw(page)).s
await page.keyboard.down('ArrowUp')
await sleep(1200)
const mid = await raw(page)
ok('holding up drives forward', mid.s > s0 + 40, `s ${s0} -> ${mid.s}`)
ok('speed built up', mid.v > 0.2, `v=${mid.v}`)
await page.screenshot({ path: '/tmp/forge/rally-play.png' })

// pause: overlay appears AND the sim freezes
await page.keyboard.press('Shift+Slash') // '?' as physically typed
await sleep(300)
const overlayVisible = await page.getByText('RESUME GAME').isVisible().catch(() => false)
ok('? opens the pause overlay', overlayVisible)
const hP1 = await hash(page)
await page.keyboard.down('ArrowUp')
await sleep(900)
await page.keyboard.up('ArrowUp')
const hP2 = await hash(page)
ok('sim is FROZEN while paused (throttle does nothing)', hP1 === hP2)

// resume: the shipped build threw ReferenceError here — must be clean now
await page.getByText('RESUME GAME').click()
await sleep(300)
const resumedGone = !(await page.getByText('RESUME GAME').isVisible().catch(() => false))
ok('RESUME click closes the overlay without error', resumedGone && errs.length === 0, errs[0] || '')
await page.keyboard.down('ArrowUp')
await sleep(700)
await page.keyboard.up('ArrowUp')
const hR = await hash(page)
ok('sim advances again after resume', hR !== hP2)

// seat 2: C flips CPU -> keys, a W tap files a pace note
const coBefore = await page.evaluate(() => window.__rallyTest.gs().co.kind)
const calledBefore = (await st(page)).stats.called
await page.keyboard.press('KeyC')
await sleep(150)
const coAfter = await page.evaluate(() => window.__rallyTest.gs().co.kind)
ok('C switches seat 2', coBefore === 'cpu' && coAfter === 'human')
await page.keyboard.press('KeyW')
await sleep(150)
const calledAfter = (await st(page)).stats.called
ok('a key note (W = left 2) reaches the ledger', calledAfter === calledBefore + 1, `${calledBefore} -> ${calledAfter}`)
await page.keyboard.press('KeyC')

// voice path parses headless (grammar level, #1247/#1287 law)
const vc = await page.evaluate(() => window.__rallyTest.voiceCall('left two'))
ok('voice "left two" parses to a corner call', !!vc && vc.dir < 0 && vc.sev === 2)

// accelerated finish: jump the odometer near lap 2's line, drive over it
await page.evaluate(() => {
    const g = window.__rallyTest.gs()
    g.car.s = g.stage.L - 40
    g.lapsDone = g.LAPS - 1
    g.car.prevS = g.car.s
})
await page.keyboard.down('ArrowUp')
for (let i = 0; i < 40; i++) {
    await sleep(250)
    if ((await scr(page)) === 'over') break
}
ok('stage completes', (await scr(page)) === 'over')
await page.screenshot({ path: '/tmp/forge/rally-over.png' })

// restart from over with Space
await page.keyboard.press('Space')
await sleep(300)
ok('Space restarts', (await scr(page)) === 'play')

ok('zero page errors', errs.length === 0, errs.join(' | '))

await browser.close()
console.log(`\nrallydrive: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
