// IRONKEEP feel probe — plays with REAL keyboard events only.
//
// fpscheck freezes the loop and advances frames by hand, which is what makes its
// assertions exact. The price is that it bypasses the input path: a key that lands
// between two 60Hz samples never reaches update() there, but does in a browser.
// That class of bug (a quick Space tap was silently swallowed) is only visible
// here, so this driver walks, taps, runs and strafes like a person would and
// reports what the simulation says happened.
//
// It asserts only "no page errors"; everything else is a number to read.
//
// Usage: npm run keepplay [-- --url <url>]

import { launch, openGame, opt, requireDevServer, KEEP_URL_DEFAULT } from './lib/harness.mjs'

const args = process.argv.slice(2)
const url = opt(args, '--url', KEEP_URL_DEFAULT)
await requireDevServer(url)

const browser = await launch()
const page = await openGame(browser, { url, hook: '__keepTest' })
const errors = []
page.on('pageerror', e => errors.push(e.message))

const st = () => page.evaluate(() => window.__keepTest.state())
const down = (k) => page.keyboard.down(k)
const up = (k) => page.keyboard.up(k)
const line = (label, s) => console.log(
    `  ${label.padEnd(16)} x=${s.x.toFixed(1)} y=${s.y.toFixed(1)} hp=${String(s.health).padStart(4)} ` +
    `bolts=${String(s.ammo).padStart(3)} kills=${s.kills}/${s.killTotal} score=${s.score} mode=${s.mode}`)

await page.keyboard.press('Enter')
await page.waitForTimeout(400)
line('start', await st())

// Walk north out of the courtyard and through the first door.
await down('ArrowUp'); await page.waitForTimeout(2600); await up('ArrowUp')
line('walk north', await st())

// Tap-fire six times at 120ms. Two invariants: every tap must be *registered*
// (the swallowed-input bug made this zero) and the 0.42s cooldown must throttle
// (so it cannot be six). Over the ~1s window that is 2-3 shots.
const before = await st()
for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(120) }
await page.waitForTimeout(300)
const tapped = await st()
line('tap x6', tapped)
const fired = before.ammo - tapped.ammo
console.log(`  ${fired >= 2 && fired <= 3 ? 'PASS' : 'FAIL'} tap-fire      ` +
    `${fired} shots from 6 taps at 0.42s cooldown (want 2-3: latched, throttled)`)

// Run + strafe (Shift + D + forward), the diagonal that must slide along walls.
await down('ShiftLeft'); await down('KeyD'); await down('ArrowUp')
await page.waitForTimeout(1400)
await up('ArrowUp'); await up('KeyD'); await up('ShiftLeft')
line('run+strafe', await st())

await page.screenshot({ path: 'scripts/.shots/keep-live.png' })
console.log('\n' + (errors.length ? `FAILED — ${errors.length} page error(s):\n  ` + errors.slice(0, 3).join('\n  ') : 'no page errors'))
await browser.close()
process.exit(errors.length ? 1 : 0)
