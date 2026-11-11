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
// #1927: pad-tap gates need the dock cell itself — a bot parked on the OUT
// cell swallows the tap (legitimate select law), so stand the crew off the pad
const clearDock = () => page.evaluate(() => {
    const g = window.__floorbossTest.sim()
    const pads = [[23, 12], [24, 12], [22, 12], [21, 12]]
    g.robots.forEach((b, i) => {
        if ((b.x === 23 && b.y === 13) || (b.x === 24 && b.y === 13)) { b.x = pads[i % 4][0]; b.y = pads[i % 4][1]; b.task = { kind: 'idle' }; b.carry = null }
    })
})
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
        return { held: g.sim().arm.held, swing: g.sim().arm.swing, heldT: g.sim().arm.heldT, stows: g.sim().stows, tick: g.sim().tick, arcs: fx.arcs, diamond: fx.diamond, dmode: fx.dmode, tool: fx.tool, sway: fx.sway, shud: fx.shud }
    })
    let pulseMin = 1, pulseMax = 0, sawSwing = false, arcsInFlight = 0, stowed = null
    let shudMin = 0, shudMax = 0, swayMin = 0, swayMax = 0
    while (true) {
        const s = await servo()
        if (s.tick > servo0.tick + 2100) break // 35 world seconds — enough for two patience cycles
        if (s.dmode === 'pulse') { pulseMin = Math.min(pulseMin, s.diamond); pulseMax = Math.max(pulseMax, s.diamond) }
        if (s.swing > 0) { sawSwing = true; arcsInFlight = Math.max(arcsInFlight, s.arcs) }
        // #1877 item 3: loaded-hold shudder rides the patience wait; idle sway
        // shows on the docked, unloaded arm between cycles
        if (s.swing === 0 && s.held) { shudMin = Math.min(shudMin, s.shud); shudMax = Math.max(shudMax, s.shud) }
        if (s.swing === 0 && !s.held) { swayMin = Math.min(swayMin, s.sway); swayMax = Math.max(swayMax, s.sway) }
        if (stowed === null && s.stows > servo0.stows) stowed = s
        // keep sampling through a SECOND loaded-wait: a single patience cycle at
        // 11 fps can land every poll inside the swing and miss the pulse (#1877)
        if (stowed !== null && s.stows >= servo0.stows + 2) break
        await new Promise((res) => setTimeout(res, 60))
    }
    r.check('servo swung with every bot down and auto off', sawSwing && !!stowed, `stows ${servo0.stows} -> ${stowed && stowed.stows}`)
    r.check('servo carry rides the ghost arc', sawSwing && arcsInFlight >= 1, `${arcsInFlight} servo ghosts seen mid-swing`)
    r.check('loaded arm pulses the reach diamond while waiting', pulseMax - pulseMin > 0.04 && pulseMax > 0.24, `diamond α ${pulseMin.toFixed(2)}..${pulseMax.toFixed(2)} (last dmode=${(await servo()).dmode}/tool=${(await servo()).tool})`)
    r.check('loaded gripper shudders under the hold', shudMax > 0.3 && shudMin < -0.3, `shudder ${shudMin.toFixed(2)}..${shudMax.toFixed(2)} px while loaded`)
    r.check('docked gripper sways at idle', swayMax - swayMin > 0.02, `idle sway ${swayMin.toFixed(3)}..${swayMax.toFixed(3)} rad`)
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
    const led0 = await page.evaluate(() => window.__floorbossTest.ledger()) // #1921 eyes on the till (before the pack)
    // settle the road first (#1927): this gate times the trailer's legs, so it
    // wants a truck at home with no far-haul commitment burning
    {
        const tR = await tickNow()
        while ((await tickNow()) - tR < 2000) {
            const q = await page.evaluate(() => ({ m: window.__floorbossTest.truck().mode, a: window.__floorbossTest.truck().away }))
            if (q.m === 'out' && !q.a) break
            await new Promise((res) => setTimeout(res, 90))
        }
    }
    const oid = await page.evaluate(() => window.__floorbossTest.shipNow())
    r.check('a ship is forced through the dock', oid != null, `order ${oid}`)
    // freight line (#1921): pack BOOKS the payout — within a few ticks of the
    // pack the parcel's money is escrow, and NO payout can have landed yet
    // (the trailer needs ~280+ ticks to back in and load)
    let ledB = led0
    const tB = await tickNow()
    while ((await tickNow()) - tB < 40) {
        ledB = await page.evaluate(() => window.__floorbossTest.ledger())
        if (ledB.escrow > led0.escrow) break
        await new Promise((res) => setTimeout(res, 60))
    }
    r.check('pack books escrow, pays nothing (money waits for the trailer)',
        ledB.escrow - led0.escrow >= 14 && ledB.paid === led0.paid, `escrow ${led0.escrow} -> ${ledB.escrow}, paid ${ledB.paid}`)
    await page.evaluate(() => { const g = window.__floorbossTest.sim(); if (g.pad.length) g.pad[g.pad.length - 1].d = 0 }) // #1927: this gate times LOCAL legs — pin the route it measures
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
    // …and the escrow landed (or is landing) — money followed the freight out
    const ledO = await page.evaluate(() => window.__floorbossTest.ledger())
    r.check('freight paid when the haul drove off (#1921)',
        ledO.paid - led0.paid >= 14, `paid ${led0.paid} -> ${ledO.paid}, held ${ledO.escrow}`)
}

// ---- load-out (#1911): a real tap on the pad calls the trailer, and what
// the trailer draws is what the sim carries ----
{
    const tickNow = () => page.evaluate(() => window.__floorbossTest.sim().tick)
    // settle the dock first: no parcels waiting and the trailer home, so the
    // call below can only be the tap's doing. #1927: auto-dispatch floods the
    // pad while the truck is on the road and the quiet instant never lands —
    // run these verb gates with the mixer off, and drain the ROAD before the
    // pad, or a far haul's away-timer masks the whole section.
    await page.evaluate(() => { window.__floorbossTest.sim().auto = false })
    {
        const tQ = await tickNow()
        while ((await tickNow()) - tQ < 4000) {
            const q = await page.evaluate(() => ({ p: window.__floorbossTest.pad().length, m: window.__floorbossTest.truck().mode, a: window.__floorbossTest.truck().away }))
            if (!q.p && q.m === 'out' && !q.a) break
            await new Promise((res) => setTimeout(res, 90))
        }
    }
    // force one covered ship, then confirm a parcel squats on the pad
    await page.evaluate(() => { const g = window.__floorbossTest; g.sim().orders.push({ id: 4242, items: ['crate', 'can'], due: g.sim().tick + 4000, prio: false, shipped: false, expired: false }); g.sim().staging.push('crate', 'can'); g.sim().packT = 1 })
    let staged = null
    const tS = await tickNow()
    while ((await tickNow()) - tS < 200) {
        staged = await page.evaluate(() => window.__floorbossTest.pad())
        if (staged.length) break
        await new Promise((res) => setTimeout(res, 80))
    }
    r.check('a packed order stages a parcel on the pad', staged.length >= 1, JSON.stringify(staged))
    await page.evaluate(() => { const g = window.__floorbossTest.sim(); if (g.pad.length) g.pad[g.pad.length - 1].d = 0 }) // #1927: this gate times LOCAL legs — pin the route it measures
    await clearDock() // no bot may stand on the pad when the tap lands
    const preCall = await page.evaluate(() => window.__floorbossTest.truck().mode)
    const tapPos = await clientXY(23, 13)
    await page.mouse.click(tapPos.x, tapPos.y)
    const called = await page.evaluate(() => window.__floorbossTest.truck().mode)
    r.check('real tap on the shipping pad calls the truck (was ' + preCall + ')', preCall === 'out' && called === 'back', called)
    // while it is in view, the trailer drawn on canvas sits under the dock and
    // matches the logical truck: sample the trailer skin at the sim's own x
    let sawTrailer = false
    const tB = await tickNow()
    while ((await tickNow()) - tB < 400) {
        const px = await page.evaluate(() => {
            const t = window.__floorbossTest
            const g = t.sim()
            if (g.truck.mode === 'out') return null
            const c = t.canvas()
            const d = c.getContext('2d').getImageData(Math.round((g.truck.x + 20) * 2), 421 * 2, 1, 1).data
            return { rgb: [d[0], d[1], d[2]], mode: g.truck.mode, x: Math.round(g.truck.x) }
        })
        if (px && px.rgb[0] > 150 && px.rgb[1] > 140 && px.rgb[2] > 120) { sawTrailer = true; break }
        await new Promise((res) => setTimeout(res, 70))
    }
    r.check('the trailer painted under the dock IS the sim truck (pixel at gs.truck.x)', sawTrailer)
    // wait for park, then a second tap sends it early
    let parked = null
    const tP = await tickNow()
    while ((await tickNow()) - tP < 400) {
        parked = await page.evaluate(() => window.__floorbossTest.truck())
        if (parked.mode === 'park') break
        await new Promise((res) => setTimeout(res, 70))
    }
    await clearDock()
    await page.mouse.click(tapPos.x, tapPos.y)
    const sent = await page.evaluate(() => window.__floorbossTest.truck().mode)
    r.check('second tap sends the parked truck early', parked && parked.mode === 'park' && sent === 'leave', JSON.stringify({ parked, sent }))
    const tL = await tickNow()
    let homed = sent && { mode: sent }
    while ((await tickNow()) - tL < 300) {
        homed = await page.evaluate(() => window.__floorbossTest.truck())
        // correct law: if the early send left a parcel staged, the truck recalls
        // the moment it gets home — "back with x at home" counts as home
        if (homed.mode === 'out' || (homed.mode === 'back' && homed.x < -50)) break
        await new Promise((res) => setTimeout(res, 70))
    }
    r.check('the sent truck is home again (and straight back out for anything left)', homed && (homed.mode === 'out' || homed.mode === 'back'), JSON.stringify(homed))
}

// ---- freight tiers (#1927): far posts wear their rate at the dock, and a
// departed haul answers nothing — real taps hit an empty road ----
{
    const tickNow = () => page.evaluate(() => window.__floorbossTest.sim().tick)
    // auto stays off from the load-out section — one loop drains dock, trailer
    // and road together (#1927: a far haul can commit again mid-settle)
    const tQ = await tickNow()
    while ((await tickNow()) - tQ < 4000) {
        const q = await page.evaluate(() => { const t = window.__floorbossTest; return { p: t.pad().length, m: t.truck().mode, a: t.truck().away } })
        if (!q.p && q.m === 'out' && !q.a) break
        await new Promise((res) => setTimeout(res, 90))
    }
    // stage one parcel and re-route it LONG HAUL at the dock — the painter
    // must wear the violet tag and simState must carry the class
    await page.evaluate(() => { const g = window.__floorbossTest.sim(); g.orders.push({ id: 4343, items: ['crate', 'can'], due: g.tick + 4000, prio: false, shipped: false, expired: false }); g.staging.push('crate', 'can'); g.packT = 1 })
    let tag = null
    const tS = await tickNow()
    while ((await tickNow()) - tS < 200) {
        tag = await page.evaluate(() => {
            const t = window.__floorbossTest
            const g = t.sim()
            if (!g.pad.length) return null
            g.pad[0].d = 2
            const s = t.state()
            if (!s.padDest || s.padDest[0] !== 2) return null
            const c = t.canvas(), k = c.width / 800
            const d = c.getContext('2d').getImageData(Math.round((10 + 23 * 26 + 13) * k), Math.round((44 + 13 * 26 + 19) * k), 1, 1).data
            return { rgb: [d[0], d[1], d[2]] }
        })
        if (tag && tag.rgb[2] > 200 && tag.rgb[2] > tag.rgb[0] + 40 && tag.rgb[2] > tag.rgb[1] + 80) break
        await new Promise((res) => setTimeout(res, 90))
    }
    r.check('the far-post tag paints violet under the parcel (#1927)',
        !!(tag && tag.rgb[2] > 200 && tag.rgb[2] > tag.rgb[0] + 40 && tag.rgb[2] > tag.rgb[1] + 80), JSON.stringify(tag))
    const sDest = (await st()).padDest
    r.check('pad destinations ride simState (#1927)', Array.isArray(sDest) && sDest[0] === 2, JSON.stringify(sDest))
    // a real call, a far load-out — and the send-off commits the road
    await clearDock()
    const tap1 = await clientXY(23, 13)
    await page.mouse.click(tap1.x, tap1.y)
    const tP = await tickNow()
    let parked = null
    while ((await tickNow()) - tP < 500) { parked = await page.evaluate(() => window.__floorbossTest.truck()); if (parked.mode === 'park') break; await new Promise((res) => setTimeout(res, 70)) }
    const tL = await tickNow()
    let gone = null
    while ((await tickNow()) - tL < 300) { gone = await page.evaluate(() => window.__floorbossTest.truck()); if (gone.mode === 'leave') break; await new Promise((res) => setTimeout(res, 70)) }
    r.check('the far send-off commits the road in the browser too (away > 1600 of 1650) (#1927)',
        !!gone && gone.mode === 'leave' && gone.away >= 1600 && gone.far === 2, JSON.stringify(gone))
    // stage a parcel while the haul is gone: neither the cap/age law nor a
    // REAL tap reaches a truck on the road, and no fee is charged for it
    await page.evaluate(() => { const g = window.__floorbossTest.sim(); g.orders.push({ id: 4344, items: ['crate'], due: g.tick + 4000, prio: false, shipped: false, expired: false }); g.staging.push('crate'); g.packT = 1 })
    let waited = null
    const tW = await tickNow()
    while ((await tickNow()) - tW < 300) { waited = await page.evaluate(() => ({ p: window.__floorbossTest.pad().length, m: window.__floorbossTest.truck().mode })); if (waited.p && waited.m === 'out') break; await new Promise((res) => setTimeout(res, 70)) }
    const feesB = await page.evaluate(() => window.__floorbossTest.ledger().fees)
    const tap2 = await clientXY(23, 13)
    await page.mouse.click(tap2.x, tap2.y)
    const onRoad = await page.evaluate(() => ({ m: window.__floorbossTest.truck().mode, a: window.__floorbossTest.truck().away, f: window.__floorbossTest.ledger().fees }))
    r.check('a real tap while the haul is on the road calls nothing and charges nothing (#1927)',
        !!waited && waited.p >= 1 && onRoad.m === 'out' && onRoad.a > 0 && onRoad.f === feesB, JSON.stringify({ waited, onRoad }))
    // ---- load weight (#1931): stage a heavy parcel — its crates must wear the
    // steel bar across the top (and simState must carry the class). Fresh pad,
    // future-dated so no call law can snatch it while the eye samples.
    await page.evaluate(() => { const g = window.__floorbossTest.sim(); g.pad.length = 0; g.pad.push({ n: 3, since: g.tick + 10000, esc: 0, d: 0, w: 2 }) })
    let wtag = null
    const tWt = await tickNow()
    while ((await tickNow()) - tWt < 220) {
        wtag = await page.evaluate(() => {
            const t = window.__floorbossTest
            const s = t.state()
            if (!s.padWeight || s.padWeight[0] !== 2) return null
            const c = t.canvas(), k = c.width / 800
            const d = c.getContext('2d').getImageData(Math.round((10 + 23 * 26 + 13) * k), Math.round((44 + 13 * 26 + 9) * k), 1, 1).data
            return { rgb: [d[0], d[1], d[2]] }
        })
        if (wtag && wtag.rgb[2] > 235 && wtag.rgb[1] > 180 && wtag.rgb[0] > 110 && wtag.rgb[0] < 205) break
        await new Promise((res) => setTimeout(res, 90))
    }
    r.check('the heavy tag paints steel across the crates (#1931)',
        !!(wtag && wtag.rgb[2] > 235 && wtag.rgb[1] > 180 && wtag.rgb[0] > 110 && wtag.rgb[0] < 205), JSON.stringify(wtag))
    const sWt = await page.evaluate(() => ({ pw: window.__floorbossTest.state().padWeight, eye: window.__floorbossTest.padWeight() }))
    r.check('pad weights ride simState and the test eye (#1931)',
        Array.isArray(sWt.pw) && sWt.pw[0] === 2 && Array.isArray(sWt.eye) && sWt.eye[0] === 2, JSON.stringify(sWt))
    await page.evaluate(() => { window.__floorbossTest.sim().pad.length = 0 }) // clean the staged dummy before the shift resumes
}

await page.evaluate(() => { window.__floorbossTest.sim().auto = true }) // #1927: back on the mixer — the full shift runs the game's own rhythm
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
