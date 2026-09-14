// Self-verifying visual harness (vendored).
//
// Drives the system Chrome via playwright-core to screenshot the dev server and
// drive the game through its DEV hook (window.__marioTest). No browser download:
// it uses the Chrome you already have installed.
//
// Usage:
//   npm run shot -- --out shots/foo.png --eval "window.__marioTest.setPower('fire')"
//   node scripts/shot.mjs [--url <url>] [--out <png>] [--eval "<js>"]
//                         [--steps '<json>'] [--w 440] [--h 420]
//                         [--settle 300] [--prewait <ms>] [--channel chrome]
//                         [--no-start]
//
//   --eval   : JS run ONCE after load, BEFORE --prewait/--settle. (See AGENTS.md:
//              a transient effect must be fired with a setTimeout, not run inline.)
//   --steps  : JSON array of {down|up, wait} applied in order (keyboard + wait ms).
//   --no-start : do NOT press a key first. Needed to photograph the attract
//              screen / OPTIONS menu (the default key press dismisses them).
//
// Prereqs: `npm install` (installs playwright-core), a running `npm run dev`,
// and Google Chrome. Override the browser with --channel / SHOT_CHANNEL.

import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }

const url = opt('--url', 'http://localhost:5173/retrogames/mario')
let out = opt('--out', 'scripts/.shots/shot.png')
if (!/\.(png|jpe?g)$/i.test(out)) out += '.png'
out = resolve(process.cwd(), out)
mkdirSync(dirname(out), { recursive: true })

const width = +opt('--w', 440)
const height = +opt('--h', 420)
const settle = +opt('--settle', 300)
const prewait = +opt('--prewait', settle)
const evalJs = opt('--eval')
const steps = opt('--steps')
const channel = opt('--channel', process.env.SHOT_CHANNEL || 'chrome')
const start = !args.includes('--no-start')

let chromium
try {
    ({ chromium } = await import('playwright-core'))
} catch {
    console.error('playwright-core is not installed. Run `npm install` in the repo root first.')
    process.exit(1)
}

let browser
try {
    browser = await chromium.launch({
        channel,
        headless: true,
        args: process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
    })
} catch (e) {
    console.error(`Could not launch browser (channel="${channel}").`)
    console.error('Install Google Chrome, or run `npx playwright install chromium` and pass --channel chromium.')
    console.error(e.message)
    process.exit(1)
}

const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text()) })
page.on('pageerror', e => console.log('[pageerror]', e.message))

await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(500)

// Start the game out of attract mode (press a harmless key). --no-start skips
// this so attract/menu screenshots are possible.
if (start) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(120)
    await page.keyboard.up('ArrowRight')
}

if (evalJs) { await page.evaluate(evalJs); await page.waitForTimeout(prewait) }

if (steps) {
    const arr = JSON.parse(steps)
    for (const s of arr) {
        if (s.down) await page.keyboard.down(s.down)
        if (s.up) await page.keyboard.up(s.up)
        await page.waitForTimeout(s.wait ?? 200)
    }
}

await page.waitForTimeout(settle)
await page.screenshot({ path: out })
await browser.close()
console.log('wrote', out)
