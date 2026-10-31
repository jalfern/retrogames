// floorbossplay.mjs — drive FLOOR BOSS in real headless Chrome with REAL
// input events: start from attract, move the cursor with held arrows, click a
// robot with a real tap, watch the drawn pixel follow the logical cell, fast-
// forward a full shift through the loop, restart. Zero page errors required.
//
// Run: npm run dev (port 5173) in another terminal, then npm run floorbossplay

import { launch, openGame, Report } from './lib/harness.mjs'

const URL = process.env.DEV_PORT ? `http://localhost:${process.env.DEV_PORT}/retrogames/floor-boss` : 'http://localhost:5173/retrogames/floor-boss'
const W = 800, H = 520, GX = 10, GY = 44, TILE = 26

const r = new Report('floorbossplay')
const browser = await launch()
const page = await openGame(browser, { url: URL, viewport: { width: 900, height: 760 }, hook: '__floorbossTest' })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const st = async () => page.evaluate(() => window.__floorbossTest.state())
const waitMode = async (mode, ms = 8000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) { if ((await st()).mode === mode) return true; await new Promise((res) => setTimeout(res, 100)) }
    return false
}
const clientXY = async (px, py) => page.evaluate(([px, py, W, H, GX, GY, TILE]) => {
    const c = window.__floorbossTest.canvas()
    const b = c.getBoundingClientRect()
    return { x: b.left + (GX + 0.5 * TILE + px * TILE) / W * b.width, y: b.top + (GY + 0.5 * TILE + py * TILE) / H * b.height }
}, [px, py, W, H, GX, GY, TILE])

// ---- boot + start ----
r.check('opens on attract', (await st()).mode === 'attract')
await page.keyboard.press('Space')
r.check('real Space clocks in (attract → play)', await waitMode('play'))

// ---- real keys move the cursor + clicks land ----
{
    const before = (await st()).cursor
    await page.keyboard.down('ArrowLeft')
    await new Promise((res) => setTimeout(res, 600))
    await page.keyboard.up('ArrowLeft')
    const after = (await st()).cursor
    r.check('held ArrowLeft walked the cursor', after[0] < before[0], `${before} -> ${after}`)

    // real tap on robot 1's home pad selects it (logical sel flips)
    const pad = await clientXY(23, 12)
    await page.mouse.click(pad.x, pad.y)
    await new Promise((res) => setTimeout(res, 200))
    const sel = await page.evaluate(() => window.__floorbossTest.sim().sel)
    r.check('tap on the home pad selected bot 1', sel === 1, `sel=${sel}`)

    // tap the RACK chip in the HUD (canvas-space chip → real click)
    const chip = await page.evaluate(() => {
        const c = window.__floorbossTest.canvas()
        const b = c.getBoundingClientRect()
        return { x: b.left + (572 + 37) / 800 * b.width, y: b.top + (6 + 14) / 520 * b.height }
    })
    await page.mouse.click(chip.x, chip.y)
    r.check('HUD chip click arms the rack tool', (await st()).tool === 'rack')
    await page.keyboard.press('KeyB') // cycle tool off
}

// ---- drawn sprite follows the sim ----
{
    const bot = await page.evaluate(() => { const c = window.__floorbossTest.sim().robots[0]; return { gx: c.x, gy: c.y } })
    const [rr, gg, bb] = await page.evaluate(([gx, gy]) => {
        const cv = window.__floorbossTest.canvas()
        const x = Math.round((10 + gx * 26 + 13) * 2), y = Math.round((44 + gy * 26 + 13) * 2)
        const d = cv.getContext('2d').getImageData(x - 3, y - 3, 6, 6).data
        let rSum = 0, gSum = 0, bSum = 0
        for (let i = 0; i < d.length; i += 4) { rSum += d[i]; gSum += d[i + 1]; bSum += d[i + 2] }
        const n = d.length / 4
        return [Math.round(rSum / n), Math.round(gSum / n), Math.round(bSum / n)]
    }, [bot.gx, bot.gy])
    r.check('bot 1 paints teal at its logical cell', gg > 110 && bb > 120 && rr < 120, `rgb(${rr},${gg},${bb}) at (${bot.gx},${bot.gy})`)
}

// ---- the dock sells the fantasy: a ship summons the truck ----
{
    // the first order lands ~4 s in; wait for one to cover before forcing a ship
    const tOrd = Date.now()
    while (Date.now() - tOrd < 15000 && (await page.evaluate(() => window.__floorbossTest.sim().orders.length)) === 0)
        await new Promise((res) => setTimeout(res, 200))
    const oid = await page.evaluate(() => window.__floorbossTest.shipNow())
    r.check('a ship is forced through the dock', oid != null, `order ${oid}`)
    const t0 = Date.now()
    let parked = null
    while (Date.now() - t0 < 10000) {
        parked = await page.evaluate(() => window.__floorbossTest.truck())
        if (parked.mode === 'park') break
        await new Promise((res) => setTimeout(res, 150))
    }
    r.check('truck backs in and parks at the dock', parked && parked.mode === 'park', JSON.stringify(parked))
    const t1 = Date.now()
    let after = parked
    while (Date.now() - t1 < 15000) {
        after = await page.evaluate(() => window.__floorbossTest.truck())
        if (after.mode === 'out') break
        await new Promise((res) => setTimeout(res, 150))
    }
    r.check('truck drives off once the dock is clear', after && after.mode === 'out', JSON.stringify(after))
}

// ---- full shift, end and restart ----
{
    await page.evaluate(() => { const g = window.__floorbossTest; for (let i = 0; i < 9200 && !g.sim().end; i++) g.step(1) })
    const endState = await st()
    r.check('shift ended through the loop', !!endState.done, `${endState.end}: ${endState.endReason}`)
    r.check('reaches the shift report', await waitMode('over', 4000))
    await new Promise((res) => setTimeout(res, 900))
    await page.keyboard.press('Enter')
    r.check('a real key returns to attract', await waitMode('attract'))
    await page.keyboard.press('Space')
    r.check('restart into a fresh shift', await waitMode('play'))
    const fresh = await st()
    r.check('fresh shift starts clean', fresh.tick < 120 && fresh.score < 130, `${fresh.tick} ticks, score ${fresh.score}`)
}

r.check('zero page errors', errors.length === 0, errors.join(' | '))
r.exit(browser)
