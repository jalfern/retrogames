// mcsaucerdrive (#3629) — real Chrome, real mouse and keys: the wave-6 ferry
// on the live page. centipede-drive convention: centipedecheck owns the rule
// tables; this proves the browser half. The gate gets a live negative (no hull
// pixels at wave 1), then a cheat-hook lift to wave 6 (DebugKit offers the
// same jump to humans): the ferry enters, its pixels sit where the probe says,
// and a real mouse aim + Space kill pays 125 on the live board.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/missilecommand`
const rep = new Report('mcsaucerdrive')
await requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: `${BASE}?seed=4242`, hook: '__mcTest', wait: 600 })
let errors = 0
page.on('pageerror', () => errors++)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const probe = () => page.evaluate(() => window.__mcTest.probe())

// map a game (x, y) to page client coordinates through the draw transform
const clientOf = (gx, gy) => page.evaluate(({ gx, gy }) => {
    const canvas = document.querySelector('canvas')
    const dpr = window.devicePixelRatio || 1
    const scaleX = canvas.width / dpr / 800
    const scaleY = canvas.height / dpr / 600
    const scale = Math.min(scaleX, scaleY) * 0.95
    const transX = (canvas.width / dpr - 800 * scale) / 2
    const transY = (canvas.height / dpr - 600 * scale) / 2
    const rect = canvas.getBoundingClientRect()
    return { x: rect.left + transX + gx * scale, y: rect.top + transY + gy * scale }
}, { gx, gy })

// scan the canvas for saucer hull/dome paint around a game position
const hullAt = (gx, gy) => page.evaluate(({ gx, gy }) => {
    const canvas = document.querySelector('canvas')
    const dpr = window.devicePixelRatio || 1
    const scaleX = canvas.width / dpr / 800
    const scaleY = canvas.height / dpr / 600
    const scale = Math.min(scaleX, scaleY) * 0.95
    const transX = (canvas.width / dpr - 800 * scale) / 2
    const transY = (canvas.height / dpr - 600 * scale) / 2
    const px = Math.round((transX + gx * scale) * dpr)
    const py = Math.round((transY + gy * scale) * dpr)
    const R = Math.round(26 * scale * dpr)
    const ctx = canvas.getContext('2d')
    const img = ctx.getImageData(px - R, py - R, R * 2, R * 2).data
    const seen = { hull: 0, dome: 0 }
    for (let i = 0; i < img.length; i += 4) {
        const r = img[i], g = img[i + 1], b = img[i + 2]
        if (r > 190 && g > 200 && b > 210 && b < 245) seen.hull++ // #d8dee8 family
        if (b > 200 && g > 170 && r < 120) seen.dome++ // #39d0ff family
    }
    return seen
}, { gx, gy })

// ---- attract → live ----
await page.keyboard.press('Space')
await sleep(400)
{
    const a = await probe()
    rep.check('raid is live at wave 1', a.wave === 1 && a.cities === 6 && !a.done, `w${a.wave} c${a.cities}`)
    rep.check('the sky carries no ferry below the gate (live, wave 1)', a.saucers === 0)
}
// byte-visible gate negative: nothing saucer-painted in wave 1's mid-sky
{
    const seen = await hullAt(400, 160)
    rep.check('no ferry paint on a wave-1 sky', seen.hull < 10 && seen.dome < 5, JSON.stringify(seen))
}

// ---- lift to wave 6 and wait for the ferry ----
await page.evaluate(() => window.__mcTest.toWave6())
let saucer = null
for (let i = 0; i < 80 && !saucer; i++) {
    await sleep(150)
    const p = await probe()
    if (p.saucers > 0) saucer = p.saucerAt[0]
}
rep.check('the ferry enters at wave 6 (live)', !!saucer, saucer ? `(${saucer.x},${saucer.y})` : 'never entered')
if (!saucer) { rep.exit(browser) }

// sprite matches logical state: paint sits where the probe says
await sleep(120)
{
    const p = await probe()
    const at = p.saucerAt[0]
    const seen = await hullAt(at.x, at.y)
    rep.check('the drawn hull matches the logical position (probe ↔ pixels)',
        seen.hull >= 10 || seen.dome >= 5, `at (${at.x},${at.y}) → ${JSON.stringify(seen)}`)
}

// ---- real mouse aim + Space kills it for 125 ----
let killDelta = null
for (let i = 0; i < 12; i++) {
    const before = await probe()
    if (before.saucers === 0) break
    const s0 = before.saucerAt[0]
    // lead the ferry: ABM flight ≈ distance/15 ticks from the near silo edge
    const siloX = s0.x < 400 ? 40 : 760
    const k = Math.max(2, Math.round(Math.hypot(s0.x - siloX, s0.y - 530) / 15))
    const aimX = Math.min(780, Math.max(20, s0.x + s0.dir * s0.speed * k))
    const pt = await clientOf(aimX, s0.y)
    await page.mouse.move(pt.x, pt.y)
    await page.keyboard.press('Space')
    const t0 = Date.now()
    while (Date.now() - t0 < 1600) {
        await sleep(100)
        const now = await probe()
        if (now.saucers === 0) { killDelta = now.score - before.score; break }
        if (now.score - before.score >= 125) { killDelta = now.score - before.score; break }
    }
    if (killDelta !== null && killDelta >= 125) break
}
rep.check('a real mouse aim + Space burns the ferry for ≥125 on the live board',
    killDelta !== null && killDelta >= 125, `delta ${killDelta}`)

// the raid survives the ferry wave (browser half only — not the sweep's promise)
{
    await sleep(1200)
    const p = await probe()
    rep.check('the raid continues alive after the ferry wave', !p.done && p.wave >= 6, `w${p.wave} c${p.cities} done=${p.done}`)
}
rep.check('zero page errors across the drive', errors === 0, `${errors}`)

rep.exit(browser)
