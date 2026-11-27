// mcsmartdrive (#3630) — real Chrome, real mouse and keys: the wave-7 smart
// bomb on the live page. mcsaucerdrive convention: missilecmdcheck owns the
// rule tables; this proves the browser half. Live gate negative (no smart-bomb
// cyan on a wave-1 sky), a cheat-hook lift to wave 7 (DebugKit offers the same
// jump), the battery speed split seen through the probe, probe↔pixels for the
// pulsing core, a real mouse blind-shot kill paying 25, and the watch keeping
// the board alive through the exotic wave.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/missilecommand`
const rep = new Report('mcsmartdrive')
await requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: `${BASE}?seed=3582`, hook: '__mcTest', wait: 600 })
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

// scan a box (game coords) for smart-bomb core paint: the white/cyan pulse pair
const coreAt = (gx, gy, half = 26) => page.evaluate(({ gx, gy, half }) => {
    const canvas = document.querySelector('canvas')
    const dpr = window.devicePixelRatio || 1
    const scaleX = canvas.width / dpr / 800
    const scaleY = canvas.height / dpr / 600
    const scale = Math.min(scaleX, scaleY) * 0.95
    const transX = (canvas.width / dpr - 800 * scale) / 2
    const transY = (canvas.height / dpr - 600 * scale) / 2
    const px = Math.round((transX + gx * scale) * dpr)
    const py = Math.round((transY + gy * scale) * dpr)
    const R = Math.round(half * scale * dpr)
    const ctx = canvas.getContext('2d')
    const img = ctx.getImageData(px - R, py - R, R * 2, R * 2).data
    let cyan = 0
    for (let i = 0; i < img.length; i += 4) {
        const r = img[i], g = img[i + 1], b = img[i + 2]
        if (b > 200 && g > 170 && r < 160) cyan++ // #9ff4ff / #00e5ff family
    }
    return cyan
}, { gx, gy, half })

// ---- attract → live, gate negative ----
await page.keyboard.press('Space')
await sleep(400)
{
    const a = await probe()
    rep.check('raid is live at wave 1', a.wave === 1 && a.cities === 6 && !a.done, `w${a.wave} c${a.cities}`)
    rep.check('no smart bomb lives below the gate (live, wave 1)', a.smarts === 0)
    const seen = await coreAt(400, 300, 300) // whole sky, generous box
    rep.check('no smart-bomb cyan anywhere on a wave-1 sky', seen === 0, `${seen} px`)
}

// ---- lift to wave 7 and wait for the smart bomb ----
await page.evaluate(() => window.__mcTest.toWave7())
let bomb = null
for (let i = 0; i < 80 && !bomb; i++) {
    await sleep(150)
    const p = await probe()
    if (p.smarts > 0) bomb = p.smartAt[0]
}
rep.check('a smart bomb enters at wave 7 (live)', !!bomb, bomb ? `(${bomb.x},${bomb.y})→${bomb.tx}` : 'never entered')
if (!bomb) rep.exit(browser)

// battery speed split through the probe: center fast, outer slow, from the gate
{
    const pt = await clientOf(400, 300)
    await page.mouse.move(pt.x, pt.y)
    await page.keyboard.press('Space')
    const s0 = await probe()
    rep.check('a center click at wave 7 flies the 28 px/tick ABM (arcade "much greater speed")',
        s0.abmSpeeds.includes(28), JSON.stringify(s0.abmSpeeds))
    const pt2 = await clientOf(120, 300)
    await page.mouse.move(pt2.x, pt2.y)
    await page.keyboard.press('Space')
    const s1 = await probe()
    rep.check('an outer click still flies the 15 px/tick ABM', s1.abmSpeeds.includes(15), JSON.stringify(s1.abmSpeeds))
}

// sprite matches logical state: the pulsing core sits where the probe says
await sleep(120)
{
    const p = await probe()
    const at = p.smartAt[0]
    if (!at) rep.check('probe↔pixels: bomb still crossing', false, 'gone too early')
    else {
        const cyan = await coreAt(at.x, at.y)
        rep.check('the drawn core matches the logical position (probe ↔ pixels)', cyan >= 4, `at (${at.x},${at.y}) → ${cyan} cyan px`)
    }
}

// ---- real mouse blind shot: aim inside the lead window, center sector ----
let killDelta = null
for (let i = 0; i < 12; i++) {
    const before = await probe()
    if (before.smarts === 0) break
    const b = before.smartAt[0]
    // solve the gunner's blind meet: earliest j with center arrival k <= j and
    // the aim within the 32 px blind radius of the bomb — manual §7 hint 3.
    const dxn = b.tx - b.x, dyn = 550 - b.y
    const nl = Math.hypot(dxn, dyn) || 1
    const spd = 1.7 // WARHEAD_SPEED_BASE + wave*0.1 at wave 7
    let aim = null
    for (let j = 1; j <= 60; j++) {
        const px = b.x + (dxn / nl) * spd * j
        const py = b.y + (dyn / nl) * spd * j
        if (py > 485) break
        if (Math.hypot(px - b.x, py - b.y) > 32) continue
        const k = Math.floor(Math.hypot(px - 400, py - 530) / 28) + 1
        if (k <= j && Math.abs(px - 400) <= Math.abs(px - 40) && Math.abs(px - 400) <= Math.abs(px - 760)) { aim = { px, py }; break }
    }
    if (!aim) { await sleep(150); continue }
    const pt = await clientOf(aim.px, aim.py)
    await page.mouse.move(pt.x, pt.y)
    await page.keyboard.press('Space')
    const t0 = Date.now()
    while (Date.now() - t0 < 1600) {
        await sleep(100)
        const now = await probe()
        if (now.score - before.score >= 25 && now.smarts < before.smarts) { killDelta = now.score - before.score; break }
        if (now.smarts === 0 && before.smarts > 0) { killDelta = now.score - before.score; break }
    }
    if (killDelta !== null && killDelta >= 25) break
    killDelta = null
    await sleep(120)
}
rep.check('a real mouse aim + Space blind-kills the smart bomb for ≥25 on the live board',
    killDelta !== null && killDelta >= 25, `delta ${killDelta}`)

// ---- the watch takes the wave ----
await page.keyboard.press('y')
let held = false
for (let i = 0; i < 90; i++) {
    await sleep(150)
    const p = await probe()
    if (p.wave >= 8 || (p.smarts === 0 && p.wave >= 7 && !p.done)) { held = true; break }
    if (p.done) break
}
{
    const p = await probe()
    rep.check('the watch holds the board through the smart-bomb wave', held && !p.done && p.cities >= 4, `w${p.wave} c${p.cities} smarts ${p.smarts}`)
}
rep.check('zero page errors across the drive', errors === 0, `${errors}`)

rep.exit(browser)
