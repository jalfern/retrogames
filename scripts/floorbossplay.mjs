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
    // atomic per-attempt read (cell + pixels in one round trip) and pass on
    // any hit — a bot in transit shows a lag between logical and painted cell,
    // the exact race that flaked this gate on main (#1877); it must still paint
    // teal somewhere on the floor for the gate to go green at all.
    let rr = 0, gg = 0, bb = 0, gx = 0, gy = 0
    for (let i = 0; i < 10; i++) {
        const s = await page.evaluate(() => {
            const g = window.__floorbossTest
            const b = g.sim().robots[0]
            const x = Math.round((10 + b.x * 26 + 13) * 2), y = Math.round((44 + b.y * 26 + 13) * 2)
            const d = g.canvas().getContext('2d').getImageData(x - 3, y - 3, 6, 6).data
            let rS = 0, gS = 0, bS = 0
            for (let j = 0; j < d.length; j += 4) { rS += d[j]; gS += d[j + 1]; bS += d[j + 2] }
            const n = d.length / 4
            return { rr: Math.round(rS / n), gg: Math.round(gS / n), bb: Math.round(bS / n), gx: b.x, gy: b.y }
        })
        rr = s.rr; gg = s.gg; bb = s.bb; gx = s.gx; gy = s.gy
        if (gg > 110 && bb > 120 && rr < 120) break
        await new Promise((res) => setTimeout(res, 120))
    }
    r.check('bot 1 paints teal at its logical cell', gg > 110 && bb > 120 && rr < 120, `rgb(${rr},${gg},${bb}) at (${gx},${gy})`)
}

// ---- the servo carry sells its transfer (#1877) ----
{
    // no bots to hand to: auto off, bots down — and one rack within ARM_REACH
    // (shifts open with zero racks), so patience MUST end in a swing. The ride
    // must read: the diamond pulses while cargo waits, a ghost item arcs the
    // swing, and the swing still banks a stow. Budgets are WORLD ticks (#1877).
    const servo0 = await page.evaluate(() => {
        const g = window.__floorbossTest
        g.press('KeyF') // auto off
        g.sim().robots.forEach((b) => { b.broken = true; b.repair = 4000; b.task = { kind: 'idle' }; b.path = [] })
        g.sim().score += 200
        g.sim().tool = 'rack'
        for (const [rx, ry] of [[16, 3], [15, 2], [17, 2], [14, 1]]) {
            g.click(rx, ry)
            if (g.sim().racks.length > 0) break
        }
        g.sim().tool = null // disarm so the loaded-wait pulse (not rack mode) is what paints
        return { racks: g.sim().racks.length, stows: g.sim().stows, tick: g.sim().tick }
    })
    r.check('servo section armed (rack in reach, bots down)', servo0.racks > 0, JSON.stringify(servo0))
    const servo = async () => page.evaluate(() => {
        const g = window.__floorbossTest
        const fx = g.servoFx()
        return { held: g.sim().arm.held, swing: g.sim().arm.swing, heldT: g.sim().arm.heldT, stows: g.sim().stows, tick: g.sim().tick, arcs: fx.arcs, diamond: fx.diamond, dmode: fx.dmode, tool: fx.tool }
    })
    let pulseMin = 1, pulseMax = 0, sawSwing = false, arcsInFlight = 0, stowed = null
    while (true) {
        const s = await servo()
        if (s.tick > servo0.tick + 2100) break // 35 world seconds — enough for two patience cycles
        if (s.dmode === 'pulse') { pulseMin = Math.min(pulseMin, s.diamond); pulseMax = Math.max(pulseMax, s.diamond) }
        if (s.swing > 0) { sawSwing = true; arcsInFlight = Math.max(arcsInFlight, s.arcs) }
        if (stowed === null && s.stows > servo0.stows) stowed = s
        // keep sampling through a SECOND loaded-wait: a single patience cycle at
        // 11 fps can land every poll inside the swing and miss the pulse (#1877)
        if (stowed !== null && s.stows >= servo0.stows + 2) break
        await new Promise((res) => setTimeout(res, 60))
    }
    r.check('servo swung with every bot down and auto off', sawSwing && !!stowed, `stows ${servo0.stows} -> ${stowed && stowed.stows}`)
    r.check('servo carry rides the ghost arc', sawSwing && arcsInFlight >= 1, `${arcsInFlight} servo ghosts seen mid-swing`)
    r.check('loaded arm pulses the reach diamond while waiting', pulseMax - pulseMin > 0.04 && pulseMax > 0.24, `diamond α ${pulseMin.toFixed(2)}..${pulseMax.toFixed(2)} (last dmode=${(await servo()).dmode}/tool=${(await servo()).tool})`)
    // hand the floor back to auto for the sections below
    await page.evaluate(() => { const g = window.__floorbossTest; g.sim().robots.forEach((b) => { b.broken = false; b.repair = 0 }); g.sim().tool = null; g.press('KeyF') })
}

// ---- the dock sells the fantasy: a ship summons the truck ----
{
    // budgets are WORLD ticks (#1877): software-rendered Chrome can drop below
    // real-time frame rate, and wall-clock budgets flaked these gates identically
    // on clean main — the sim's own clock cannot.
    const tickNow = () => page.evaluate(() => window.__floorbossTest.sim().tick)
    const ordersNow = () => page.evaluate(() => window.__floorbossTest.sim().orders.length)
    // the first order lands ~4 s in; wait for one to cover before forcing a ship
    const tOrd = await tickNow()
    while ((await tickNow()) < tOrd + 900 && (await ordersNow()) === 0)
        await new Promise((res) => setTimeout(res, 200))
    const oid = await page.evaluate(() => window.__floorbossTest.shipNow())
    r.check('a ship is forced through the dock', oid != null, `order ${oid}`)
    const t0 = await tickNow()
    let parked = null
    while ((await tickNow()) - t0 < 600) {
        parked = await page.evaluate(() => window.__floorbossTest.truck())
        if (parked.mode === 'park') break
        await new Promise((res) => setTimeout(res, 150))
    }
    r.check('truck backs in and parks at the dock', parked && parked.mode === 'park', JSON.stringify(parked))
    const t1 = await tickNow()
    let after = parked
    while ((await tickNow()) - t1 < 900) {
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
