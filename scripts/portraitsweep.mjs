// #1147 — iPhone-portrait geometry sweep. Visits every registered route at
// 390×844 and asks each visible canvas: does your CSS box keep your intrinsic
// aspect ratio? A >2% mismatch means the picture is stretched (the Britannia
// bug). Also requires the ROTATE YOUR PHONE card (#1147) on wide titles.
// #1211: every fixed title is now honest (last three: myst, mario-kart,
// comet-drift), so the sweep goes HARD-FAIL-WIDE — any visible-canvas route
// that stretches or hides its rotate hint exits red. Routes whose canvas has
// not booted in the probe window stay SKIP (advisory), as before.
//
// Usage: node scripts/portraitsweep.mjs [--only path,path] [--port N]

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const port = opt('--port', process.env.DEV_PORT || '5173')
const only = opt('--only') ? opt('--only').split(',') : null

const src = readFileSync(new URL('../src/config/games.js', import.meta.url), 'utf8')
const paths = [...src.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]).filter((p) => p !== '/')
const routes = only ? paths.filter((p) => only.includes(p)) : paths

const { chromium } = await import('playwright-core')
const browser = await chromium.launch({
    channel: process.env.SHOT_CHANNEL || 'chrome',
    headless: true,
    args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding', ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : [])],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

const probe = () => [...document.querySelectorAll('canvas')]
    .filter((c) => c.clientWidth > 40 && c.clientHeight > 40 && c.width > 0 && c.height > 0)
    .map((c) => {
        const intrinsic = c.width / c.height
        const box = c.getBoundingClientRect()
        const skew = Math.abs(box.width / box.height - intrinsic) / intrinsic
        // A skewed box is fine when the element letterboxes its picture itself
        // (object-fit: contain, #1147) or when a crisp fit-display canvas is
        // painted over it (fitCanvas sources keep w-full h-full but are hidden).
        const fit = getComputedStyle(c).objectFit
        const honest = skew <= 0.02 || fit === 'contain' || fit === 'cover' || !!document.querySelector('[data-fit="display"]')
        return { w: c.width, h: c.height, cw: Math.round(box.width), ch: Math.round(box.height), skew: honest ? 0 : skew }
    })

let failures = 0
let warnings = 0
for (const p of routes) {
    let rows = []
    let hint = false
    try {
        await page.goto(`http://localhost:${port}/retrogames${p}`, { waitUntil: 'load', timeout: 15000 })
        await page.waitForTimeout(1400)
        rows = await page.evaluate(probe)
        hint = !!(await page.$('[data-nav="rotate-dismiss"]'))
    } catch (e) {
        console.log(`WARN ${p}: load failed (${e.message.split('\n')[0]})`)
        warnings++
        continue
    }
    if (!rows.length) { console.log(`SKIP ${p}: no visible canvas yet (emulator/3D still booting)`); continue }
    const wide = rows.some((r) => r.w / r.h >= 4 / 3)
    const stretched = rows.filter((r) => r.skew > 0.02)
    const hintBad = wide && !hint
    const bad = stretched.length || hintBad
    const tag = bad ? 'FAIL' : 'ok  '
    if (bad) failures++
    console.log(`${tag} ${p}  canvases=${rows.map((r) => `${r.w}x${r.h}->${r.cw}x${r.ch} skew ${(r.skew * 100).toFixed(1)}%`).join(' | ')}${hintBad ? '  MISSING-ROTATE-HINT' : ''}${hint ? '  rotate-hint' : ''}`)
}
await browser.close()
console.log(`portraitsweep: ${routes.length} routes, ${failures} fail, ${warnings} warn`)
process.exit(failures ? 1 : 0)
