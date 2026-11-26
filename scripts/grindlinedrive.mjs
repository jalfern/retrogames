// grindlinedrive — #3470 waiting line in real Chrome: the claims only a
// browser can make. grindcheck owns the math (restore == continuous); this
// leg proves the wiring a player feels:
//   - a clean plaza shows no LINE WAITS chip,
//   - skating ~3 s auto-saves the run (store + pending),
//   - RELOAD: the attract offers the exact saved tick with a visible chip,
//   - a real R keystroke resumes: play screen, line consumed, the run's
//     score/letters/timeLeft carry over at the packed baseline, and the sim
//     keeps advancing —
//   - zero page errors across the whole ride.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const URL = process.env.GRIND_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/grind-city`
await requireDevServer(URL)
const browser = await launch()
const page = await openGame(browser, { url: URL, hook: '__grindTest', wait: 400 })
const r = new Report('grindlinedrive')
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const probe = () => page.evaluate(() => window.__grindTest.state())
const pending = () => page.evaluate(() => window.__grindTest.pending())
const chip = () => page.evaluate(() => {
    const c = document.querySelector('[data-q="resume-line"]')
    return c ? c.textContent : null
})
const storageTick = () => page.evaluate(() => {
    try { const r = JSON.parse(window.localStorage.getItem('grindcity.run.v1')); return r && r.tick } catch { return null }
})
const waitForHook = () => page.waitForFunction(() => !!window.__grindTest, { timeout: 15000 })

// clean slate — no waiting line from a previous visit
await page.evaluate(() => window.localStorage.clear())
await page.reload()
await waitForHook()

r.check('clean plaza offers no resume', (await chip()) === null && (await pending()) === null)

// start and skate with real keystrokes
await page.keyboard.press('Space')
await page.waitForTimeout(200)
for (let i = 0; i < 4; i++) {
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(420); await page.keyboard.up('ArrowUp')
    await page.keyboard.press('Space'); await page.waitForTimeout(420)
}
const p1 = await pending()
r.check('live skating auto-saves a waiting line', !!p1 && p1.tick >= 120, `tick ${p1 && p1.tick}`)
r.check('the line survives in storage', (await storageTick()) !== null, `stored tick ${await storageTick()}`)

// walk away: reload the page mid-run
await page.reload()
await waitForHook()
const p2 = await pending()
const st0 = await probe()
r.check('after reload the plaza kept the line', !!p2 && p2.tick >= 120, `tick ${p2 && p2.tick}`)
r.check('the attract shows the LINE WAITS chip', (await chip() || '').includes('LINE WAITS'), await chip())
r.check('attract still rides on its own (not stuck on the dead run)', st0.screen === 'attract', st0.screen)

// a real R resumes at the packed instant, with the line consumed
const savedScore = p2 && p2.score
const savedLetters = p2 && p2.letters
await page.keyboard.press('KeyR')
await page.waitForTimeout(500)
const st1 = await probe()
r.check('R resumes into the play screen', st1.screen === 'play', st1.screen)
r.check('the waiting line is consumed on resume', (await pending()) === null || (await pending()).tick > p2.tick)
r.check('the ride carries over its baseline', st1.score >= savedScore && Object.keys(st1.letters).length >= savedLetters && st1.timeLeft <= 120,
    `score ${savedScore}->${st1.score}, letters ${savedLetters}->${Object.keys(st1.letters).length}`)

// the resumed sim keeps living
const t0 = st1.tick
await page.waitForTimeout(500)
const t1 = (await probe()).tick
r.check('resumed sim advances', t1 > t0, `tick ${t0} -> ${t1}`)

// #3476: resume tells the player what it carried (the flash rides sim.msg)
let flash = null
try {
    await page.waitForFunction(() => ((document.querySelector('[data-q="msg"]') || {}).textContent || '').includes('RETURNED AT'), { timeout: 1500 })
} catch { /* fall through to the check below */ }
flash = await page.evaluate(() => ((document.querySelector('[data-q="msg"]') || {}).textContent) || null)
r.check('resume flashes what was carried', (flash || '').includes('RETURNED AT'), flash)

// #3476: a line older than a day retires on read — stamp today's stored pack
// 26 h into the past, reload, and the plaza must be clean (offer gone AND
// the stale store cleared, not squatting until the next save replaces it).
await page.evaluate(() => window.__grindTest.forceSave())
const pNow = await storageTick()
r.check('forceSave stamps a fresh pack', pNow !== null, `tick ${pNow}`)
await page.evaluate(() => {
    const raw = window.localStorage.getItem('grindcity.run.v1')
    if (raw) { const r = JSON.parse(raw); r.ms = Date.now() - 26 * 3600 * 1000; window.localStorage.setItem('grindcity.run.v1', JSON.stringify(r)) }
})
await page.reload()
await waitForHook()
r.check('a day-old line retires instead of waiting',
    (await chip()) === null && (await pending()) === null && (await storageTick()) === null,
    `chip ${await chip()}, stored ${await storageTick()}`)

r.check('zero page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
r.exit(browser)
