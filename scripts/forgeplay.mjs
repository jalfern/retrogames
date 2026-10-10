// FORGE CONVEYOR — the browser pass: real Chrome, real click, live GitHub data.
//
//   npm run dev        # in another terminal
//   npm run forgeplay
//
// forgecheck proves the derivation and the HTML in Node; this proves the page
// that Jon actually opens: it mounts, the floor band appears once the board's
// OWN fetches land (no fixtures, no DEV hook — the board has none), every
// visible cartridge links somewhere real, and ONE real mouse click on a shelf
// cartridge lands in the arcade with zero page errors. Advisory tier: needs
// network + dev server, like the other *-play suites.

import { requireDevServer, launch } from './lib/harness.mjs'

await requireDevServer('http://localhost:5173/retrogames/forge')
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

let pass = 0
const fails = []
const ok = (c, m) => { if (c) { pass++; console.log(`  ok  ${m}`) } else fails.push(m) }

await page.goto('http://localhost:5173/retrogames/forge', { waitUntil: 'load' })

// The floor only appears after the board's real fetches resolve. Poll DOM, not wall.
let floored = false
for (let i = 0; i < 40; i++) {
    floored = await page.locator('[data-floor]').count() > 0
    if (floored) break
    await page.waitForTimeout(1000)
}
ok(floored, 'factory floor mounted after the live fetches')
if (!floored) {
    const err = await page.locator('text=BOARD OFFLINE').textContent().catch(() => null)
    fails.push(`floor never appeared${err ? ` — board says: ${err}` : ''}`)
} else {
    const counts = await page.evaluate(() => ({
        queue: document.querySelectorAll('[data-queue-card]').length,
        queueEmpty: !!document.querySelector('[data-queue-empty]'),
        shelf: document.querySelectorAll('[data-shelf-car]').length,
        gate: document.querySelector('[data-gate]')?.getAttribute('data-gate'),
        anvil: document.querySelector('[data-anvil]')?.getAttribute('data-anvil'),
        hrefs: [...document.querySelectorAll('[data-shelf-car]')].map(a => a.getAttribute('href')),
    }))
    ok(counts.queue > 0 || counts.queueEmpty, 'queue bin shows neither cards nor an empty marker')
    ok(counts.shelf > 0 || await page.locator('[data-shelf-empty]').count() > 0, 'shelf shows neither carts nor an empty marker')
    ok(counts.hrefs.every(h => h && h.includes('/games')), 'a shelf cartridge does not link to /games')
    ok(['busy', 'clear'].includes(counts.gate), `gate state is "${counts.gate}" — must be busy or clear`)
    ok(!!counts.anvil, 'anvil rendered without a state attribute')
    console.log(`  (live: ${counts.queue} queue cards, ${counts.shelf} shelf carts, gate=${counts.gate}, anvil=${counts.anvil})`)

    // ONE real click: shelf cartridge -> arcade route.
    const car = page.locator('[data-shelf-car]').first()
    if (await car.count()) {
        await car.click()
        await page.waitForURL(/\/games/, { timeout: 5000 }).catch(() => {})
        ok(/\/games/.test(page.url()), `real click on a cartridge did not navigate (url=${page.url()})`)
    } else {
        console.log('  (no shelf carts live yet — click test skipped, empty-state asserts above cover it)')
        pass++
    }
}

const real = errors.filter(e => !/favicon|Download the React DevTools/i.test(e))
ok(real.length === 0, `page errors: ${real.join(' | ')}`)

await browser.close()
console.log(`\n${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log(`  \x1b[31mFAIL\x1b[0m ${f}`)
process.exit(fails.length ? 1 : 0)
