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
// #2774: String(e) alone lost the frame — a recurring TypeError with no stack
// can't be pinned. Keep the first stack per message so the failing line names itself.
const seenMsg = new Map()
page.on('pageerror', (e) => {
    const msg = String(e)
    errors.push(msg)
    if (!seenMsg.has(msg) && e && e.stack) seenMsg.set(msg, e.stack)
})

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

// #1712: floor-boss is S2-wired — a scripted Space now meets the consent
// gate (store live + fresh profile). Answer it the honest way, a real NO
// THANKS click — declines, never grants (#2091, ddragoncheck's pattern).
const defuseConsent = async (pg) => {
    for (let i = 0; i < 40; i++) {
        const s = await pg.evaluate(() => {
            const gate = document.querySelector('[data-auto-record-gate]')
            if (gate) {
                const btn = [...gate.querySelectorAll('button')].find((el) => /NO THANKS/i.test(el.textContent || ''))
                if (btn) { btn.click(); return 'clicked' }
                return 'gate'
            }
            return window.__floorbossTest && window.__floorbossTest.state().mode === 'play' ? 'started' : 'waiting'
        })
        if (s === 'clicked' || s === 'started') return s
        await pg.waitForTimeout(50)
    }
    return 'timeout'
}
// a queued tap lands within one sim tick (taps apply at consumption, #1712) —
// poll, don't assume the click resolved before the next evaluate.
const waitFor = async (fn, ms = 800) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((res) => setTimeout(res, 40)) }
    return false
}
// #2992: a real tap finds the bank busy (a chip-tap seconds earlier) and rides the
// drain — #2966's apply-at-row tick. On software-rendered boxes a rAF frame can
// outlast any fixed sleep, and then the tap has neither landed nor been refused
// while the leg asserts: the rig reads short, the refusal reads as a landing, and
// the lesson fx read as silence. Wait for the bank to drain (the tap is now
// VERDICTED), then one paint frame. The old fixed 90 ms was click-time-apply-era
// calibration and predated the drain law it now races.
const tapsDrained = async () => {
    await waitFor(async () => (await page.evaluate(() => window.__floorbossTest.pending())) === 0, 2500)
    await new Promise((res) => setTimeout(res, 40))
}

// ---- boot + start ----
r.check('opens on attract', (await st()).mode === 'attract')
await page.keyboard.press('Space')
await defuseConsent(page)
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
    r.check('HUD chip click arms the rack tool', await waitFor(async () => (await st()).tool === 'rack'), `tool=${(await st()).tool}`)
    await page.keyboard.press('KeyB') // cycle tool off
}

// ---- #2966 contract-card tap + a two-thumb burst ----
{
    // A contract-card tap used to be a silent death: clickOrder referenced its
    // own initializer (TDZ ReferenceError) — no prio, no event, just console
    // noise. And two taps inside one frame used to both mutate at click time,
    // ahead of the rows the bank could promise (refusing every fast-tap take);
    // a bank-busy tap now rides its own row. Both proven here with real
    // fingers, not rigs: the card lights its prio bit, a back-to-back pair
    // lands every tap, and the page keeps its silence.
    const client = (px, py) => page.evaluate(([px, py]) => {
        const b = window.__floorbossTest.canvas().getBoundingClientRect()
        return { x: b.left + px / 800 * b.width, y: b.top + py / 520 * b.height }
    }, [px, py])
    await waitFor(async () => (await page.evaluate(() => window.__floorbossTest.sim().orders.length)) > 0, 8000)
    const card = await client(742, 79) // taps.js orderRect(0) center
    await page.mouse.click(card.x, card.y)
    const prioLit = await waitFor(async () => (await page.evaluate(() => window.__floorbossTest.sim().orders.some((o) => o.prio && !o.shipped && !o.expired))), 1500)
    r.check('#2966 card tap lights the priority bit — the dead tap is dead', prioLit, `errors so far ${errors.length}`)
    r.check('#2966 card tap threw no page error — the clickOrder TDZ crash is gone', errors.length === 0, errors.slice(0, 1).join(''))
    await page.evaluate(() => window.__floorbossTest.sim().orders.forEach((o) => { o.prio = false })) // hand the later legs the floor as they expect it

    // AUTO chip + RACK chip, back to back — as fast as two thumbs. Both must
    // land (auto flips, rack arms), neither swallowed by a busy bank.
    const autoBefore = await page.evaluate(() => window.__floorbossTest.sim().auto)
    const cAuto = await client(512 + 27, 6 + 14) // CHIPS.auto center
    const cRack = await client(572 + 37, 6 + 14) // CHIPS.rack center
    await page.mouse.click(cAuto.x, cAuto.y)
    await page.mouse.click(cRack.x, cRack.y)
    const burst = await waitFor(async () => {
        const g = await page.evaluate(() => { const s = window.__floorbossTest.sim(); return { auto: s.auto, tool: s.tool } })
        return g.auto !== autoBefore && g.tool === 'rack'
    }, 1500)
    r.check('#2966 two back-to-back taps both land — a bank-busy tap drains on its own row, nothing lost', burst)
    // put the floor back as the later legs expect it: auto restored, tool off.
    await page.mouse.click(cAuto.x, cAuto.y)
    await waitFor(async () => (await page.evaluate(() => window.__floorbossTest.sim().auto)) === autoBefore, 1500)
    await page.keyboard.press('KeyB')
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
        g.sim().tool = null // #2774: hold the disarm across the wait — if the tool re-arms mid-window (queued input drain), dmode short-circuits to 'rack' and the patience pulse is never observable (the reach-diamond-α flake, issue run 2)
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
    // #2774: guarantee the night ends WON. The long auto-off verb sections leave
    // orders unpicked and the mixer can't always absorb the backlog on a loaded
    // box — three expiries fire the night mid-section and every ladder gate below
    // cascades red (strike luck was never the subject here; #2346 progression is).
    // House rig verbs: zero the strike sheet, ring the quota with headroom, and
    // hold open orders' due dates ahead of the clock while the FF runs — the
    // whistle, the report screen and nextShift stay game law all the same.
    await page.evaluate(() => { const g = window.__floorbossTest.sim(); g.strikes = 0; g.expired = 0; g.score = g.shiftBase + g.params.quota + 500; g.orders.forEach((o) => { if (o.due < g.tick + 1000) o.due = g.tick + 1000 }) }) // clear the backlog the auto-off verb sections left behind BEFORE the FF starts — stale due dates expire in the first steps, before any in-loop hold can reach them
    await page.evaluate(() => { const g = window.__floorbossTest; for (let i = 0; i < 9200 && !g.sim().end; i++) { if (i % 600 === 599) g.sim().orders.forEach((o) => { if (o.due < g.sim().tick + 1000) o.due = g.sim().tick + 1000 }); g.step(1) } }) // +1000 margin at a 600-step hold: worst-case remaining stays >400 ticks — a +400 margin expires in the gap between holds
    const endState = await st()
    r.check('shift ended through the loop', !!endState.done, `${endState.end}: ${endState.endReason}`)
    r.check('reaches the shift report', await waitMode('over', 4000))
    await new Promise((res) => setTimeout(res, 900))
    // #2964 item 3: the cleared sheet beats CLEAR — struck quota, EARNED line
    // and lit rungs on an opaque plate (attract-box plate law ⇒ deterministic
    // whatever floor sits behind). A DECLINED take (this rig, #2091 law) must
    // show no REC chip — disclosure only ever tells the truth (#2058).
    const sheetPix = async (x, y, w, h) => page.evaluate(([x, y, w, h]) => {
        const d = window.__floorbossTest.canvas().getContext('2d').getImageData(x * 2, y * 2, w * 2, h * 2).data
        let green = 0, bright = 0, cyan = 0, hot = 0, amber = 0
        for (let i = 0; i < d.length; i += 4) {
            const r0 = d[i], g0 = d[i + 1], b0 = d[i + 2]
            if (g0 > 200 && g0 > r0 + 60 && g0 > b0 + 60) green++
            if (g0 > 230 && r0 > 140 && r0 < 215 && b0 > 170) bright++
            if (b0 > 200 && b0 > g0 + 40 && b0 > r0 + 100) cyan++
            if (r0 >= 250 && g0 < 120) hot++
            if (r0 > 220 && g0 > 130 && g0 < 225 && b0 < 140) amber++ // #2987: the steered verdict's plate family (#ffb347 border)
        }
        return { green, bright, cyan, hot, amber }
    }, [x, y, w, h])
    const beat = await sheetPix(250, 280, 300, 34)
    r.check('the cleared sheet beats CLEAR — struck quota, EARNED line, lit rung (#2964)',
        beat.green > 120 && beat.bright > 150 && beat.cyan > 4, JSON.stringify(beat))
    const chip = await sheetPix(52, 96, 150, 22)
    r.check('a declined take shows no REC chip on the sheet — disclosure obeys the bank (#2964/#2058)',
        chip.hot === 0, JSON.stringify(chip))
    const winkIdle = await sheetPix(W / 2 - 118, 322, 236, 22)
    r.check('a floor no brain ever steered shows no verdict plate (#2987)', winkIdle.amber === 0, JSON.stringify(winkIdle))
    await page.keyboard.press('Enter')
    // #2346: a cleared night does NOT drop to attract — the ladder clocks in
    const advOk = await waitMode('play', 4000)
    const adv = advOk ? await st() : null
    r.check('a cleared night clocks into shift 2, not attract (#2346)', !!adv && adv.shift === 2 && adv.tick < 120 && adv.score >= 1000 && adv.quota === 1200,
        adv ? `shift ${adv.shift}, tick ${adv.tick}, career ${adv.score}, quota ${adv.quota}` : 'still on the report')
    // and a LOST night still ends the run — drop the floor below the rung at the whistle
    await page.evaluate(() => { const gs = window.__floorbossTest.sim(); gs.tick = 9000; gs.score = gs.shiftBase })
    r.check('a short night ends the run', await waitMode('over', 4000))
    await new Promise((res) => setTimeout(res, 900))
    const lostBeat = await sheetPix(250, 280, 300, 34)
    r.check('the lost sheet keeps the CLEAR beat off — it is win truth, not decor (#2964)',
        lostBeat.bright === 0 && lostBeat.green < 40, JSON.stringify(lostBeat))
    await page.keyboard.press('Enter')
    r.check('a lost run returns to attract', await waitMode('attract'))
    await page.keyboard.press('Space')
    r.check('restart into a fresh shift', await waitMode('play'))
    const fresh = await st()
    r.check('fresh shift starts clean', fresh.tick < 120 && fresh.score < 130 && fresh.shift === 1 && fresh.quota === 1000, `${fresh.tick} ticks, score ${fresh.score}, shift ${fresh.shift}`)
}

// ---- duel seats (#2555): D enters, seat M lives, the verdict lands ----
{
    await page.goto(URL + '?seed=189') // a clean console for the duel drive — no dependence on the previous night's luck. #2774 pins the shift: the named-till ceremony needs a FULL trailer carrying a seat-1 box and random floors whiffed that 32/240 in a Node sweep; seed 189 rings it at tick 1207 and passes win/verdict/conservation identically from every pad phase.
    for (let i = 0; i < 50 && !(await page.evaluate(() => !!window.__floorbossTest)); i++) await new Promise((res) => setTimeout(res, 200))
    await new Promise((res) => setTimeout(res, 600))
    await page.keyboard.press('KeyD')
    const d0 = await waitMode('play', 4000) ? await page.evaluate(() => { const g = window.__floorbossTest.sim(); return { duel: !!g.duel, m: g.m ? { x: g.m.cursor.x, y: g.m.cursor.y } : null } }) : null
    r.check('D at the attract seats the model manager — duel mode live (#2555)', !!d0 && d0.duel === true && !!d0.m, JSON.stringify(d0))
    // Seat M's liveness, driven through the model's own manager (autopilot-as-
    // seat-M), not a human pad: the game's autopilot must steer the cyan cursor
    // on its own. Software Chrome is slow in real time, so the loop advances
    // through the same pad interface the live rAF chain uses.
    let mMoved = false
    for (let i = 0; i < 500 && !mMoved && d0 && d0.m; i++) {
        await page.evaluate(() => window.__floorbossTest.step(20, {}, true))
        const c = await page.evaluate(() => { const m = window.__floorbossTest.sim().m.cursor; return { x: m.x, y: m.y } })
        if (c.x !== d0.m.x || c.y !== d0.m.y) mMoved = true
    }
    r.check('seat M steers its own cursor through its own manager (no human pad touches it)', mMoved)
    // #2561 items 2+3: money landing on the twin till names itself on the floor,
    // the seat chip arms its growth blink when credit lands, and seat M's buys
    // flash in model cyan. The painter reacts in the rAF chain, which fast-forward
    // starves — so the loop pumps the event chain itself (step's 4th arg) until
    // all three ceremonies have been seen.
    const tillSeen = await page.evaluate(() => {
        const g = window.__floorbossTest
        const fxs = new Set(), flashLabels = new Set()
        const growArmed = [0, 0]
        const targets = [600, 2400, 4200, 6000]; let ti = 0 // #2774: pump on ABSOLUTE world ticks, not loop index — live rAF ticks consumed before the FF starts shift the index without shifting the world (#1877 law)
        for (let i = 0; i < 9200 && !g.sim().end; i++) {
            g.step(1, {}, true, true)
            if (ti < targets.length && g.sim().tick >= targets[ti]) { g.shipNow(1); ti++ } // #2561: a trickle of seat-1 shipping (kept below the model's own pace so #2555's verdict gate stands) so freight lands on a named till
            for (const f of g.sim().fx) if (/^\+\d+ (RACK|FREIGHT) (YOU|MODEL)$/.test(f.msg)) fxs.add(f.msg)
            const tf = g.tillFx()
            if (tf.flash && tf.flash.col === '#57c7ff' && /MODEL/.test(tf.flash.label)) flashLabels.add(tf.flash.label)
            for (let s = 0; s < 2; s++) if (tf.grow[s] > 0 && tf.grow[s] > g.sim().tick - 120) growArmed[s]++
            // #2774: the break must wait for the freight ceremony itself — two RACK
            // messages alone satisfy size≥2 and used to exit the loop before the
            // first haul paid, so the gate below flaked red on luck of the pace.
            if (fxs.size >= 2 && growArmed[1] > 0 && flashLabels.size > 0 && [...fxs].some((m) => /FREIGHT /.test(m))) break
        }
        return { fxs: [...fxs], flashLabels: [...flashLabels], growArmed }
    })
    r.check('credits landing on the twin till name themselves (+N RACK/FREIGHT seat) (#2561)', tillSeen.fxs.some((m) => /\+5 RACK MODEL$/.test(m)) && tillSeen.fxs.some((m) => /\+\d+ FREIGHT /.test(m)), tillSeen.fxs.join(' | ') || 'none')
    r.check('the leading seat chip arms its growth blink when credit lands (#2561 item 2)', tillSeen.growArmed[1] > 0, `growArmed ${tillSeen.growArmed.join(',')}`)
    r.check("seat M's purchases flash in model cyan (#2561 item 3)", tillSeen.flashLabels.length > 0, tillSeen.flashLabels.join(' | ') || 'none')
    await page.evaluate(() => { const g = window.__floorbossTest; for (let i = 0; i < 9200 && !g.sim().end; i++) g.step(1, {}, true) })
    const dEnd = await page.evaluate(() => { const g = window.__floorbossTest.sim(); return { end: g.end, winner: g.duelWinner, tills: g.credits ? g.credits.slice(0, 2) : null, score: g.score, cons: !!g.duel && g.score === 100 + g.credits[0] + g.credits[1] + g.credits[2] - g.spent } })
    r.check('duel shift runs to the whistle through the loop', !!dEnd.end, `${dEnd.end} score ${dEnd.score}`)
    r.check('conservation holds in the browser: score = 100 + Σcredits − spent (#2555)', dEnd.cons === true, JSON.stringify(dEnd))
    r.check('the verdict names the model over an idle human seat (#2555)', dEnd.winner === 1 && dEnd.tills[1] > dEnd.tills[0], `winner ${dEnd.winner}, tills ${dEnd.tills.join(' vs ')}`)
    await waitMode('over', 4000) // the report screen takes its turn — the verdict paints there
}

// ---- teach the elbow (#2627 s2, honest since #2711): drive a corner refusal with
// REAL taps and watch the lesson answer only what it can prove ----
{
    await page.goto(URL) // a clean floor — the rig wants no seeded racks near the elbow
    await page.waitForFunction(() => !!window.__floorbossTest, null, { timeout: 15000 }) // the DEV hook mounts at the shell's first effect — a raw goto must wait for it
    if (!await waitMode('attract', 5000)) r.check('teach leg: fresh page reaches attract', false, 'no attract')
    await page.keyboard.press('Space')
    if (!await waitMode('play')) r.check('teach leg: Space clocks in', false, 'no play')
    await page.evaluate(() => {
        const g = window.__floorbossTest.sim()
        g.racks.length = 0; g.score = 9000 // the rig wants the whole elbow to itself, built by hand
        g.auto = false // the crew stays at the pads through the rig build
        const pads = [[23, 12], [24, 12], [22, 12], [21, 12]]
        g.robots.forEach((b, i) => { b.x = pads[i % 4][0]; b.y = pads[i % 4][1]; b.task = { kind: 'idle' }; b.carry = null; b.moveT = 0 })
    })
    // arm the rack tool with a real chip tap
    const chip2 = await page.evaluate(() => {
        const c = window.__floorbossTest.canvas()
        const b = c.getBoundingClientRect()
        return { x: b.left + (572 + 37) / 800 * b.width, y: b.top + (6 + 14) / 520 * b.height }
    })
    await page.mouse.click(chip2.x, chip2.y)
    r.check('teach leg arms the rack tool (chip tap)', (await st()).tool === 'rack')
    const armRack = async () => { if ((await st()).tool !== 'rack') await page.mouse.click(chip2.x, chip2.y) }
    const tapCell = async (x, y) => {
        await armRack() // the tool disarms after every build (parity law) — re-arm per purchase
        await page.evaluate(([x, y]) => { const b = window.__floorbossTest.sim().robots.find((bb) => bb.x === x && bb.y === y); if (b) { b.x = 23; b.y = 12; b.task = { kind: 'idle' }; b.moveT = 0 } }, [x, y])
        const p = await clientXY(x, y)
        await page.mouse.click(p.x, p.y)
        await tapsDrained()
    }
    const NEED = [[18, 3], [19, 3], [19, 5], [20, 3], [20, 5], [17, 5], [19, 6], [17, 6]]
    let built = 0
    for (const [x, y] of NEED) {
        await tapCell(x, y)
        if (await page.evaluate(([x, y]) => window.__floorbossTest.sim().racks.some((r) => r.x === x && r.y === y), [x, y])) built++
    }
    r.check('the elbow under construction builds by real taps', built === 8, `${built}/8`)
    const preCorner = await page.evaluate(() => { const g = window.__floorbossTest.sim(); return { score: g.score, fx: g.fx.length } })
    await tapCell(17, 4)
    // ev drains each step — assert on the persistent fx ledger + the board, not the event tail
    const after = await page.evaluate(() => { const g = window.__floorbossTest.sim(); return { racks: g.racks.some((r) => r.x === 17 && r.y === 4), score: g.score, fxs: g.fx.slice(-4).map((f) => f.msg) } })
    r.check('real tap facing the tight elbow is refused — rack never lands', !after.racks, JSON.stringify(after))
    r.check('the refused tap charges nothing (#1917)', after.score === preCorner.score, `${preCorner.score} -> ${after.score}`)
    r.check('the refusal names NO CORNER STACK on the fx ledger', after.fxs.some((m) => m === 'NO CORNER STACK'), after.fxs.join(' | ') || 'none')
    // #2711 KNEE law retired BOTH mouth plugs on this rig (floorbosscheck §teach-elbow
    // proves it: (18,7) severs the shaft throat below, (21,4) is legal but no longer
    // clears the click — the corridor behind it hangs on swings the corner would clip).
    // The honest lesson falls back to LEAVE THE ELBOW FREE; the green PLUG lesson is
    // proven where the mouths still ARE honest — the lane leg (#2622) below drives the
    // same painter path (banner + green mouths + plug-then-build). This leg drifted for
    // five merges demanding the lies (#2774: run-to-run gate sets, pageerror spam).
    r.check('the refusal falls back to LEAVE THE ELBOW FREE — the knee law left no honest plug (#2711 updates #2627 s2)', after.fxs.some((m) => m === 'LEAVE THE ELBOW FREE'), after.fxs.join(' | ') || 'none')
    // silence on canvas: the lesson must NOT light green frames the law cannot honour
    const lit = { e: 0, s: 0 }
    const probe = async (cx, cy) => page.evaluate(([cx, cy]) => {
        const c = window.__floorbossTest.canvas()
        const x0 = (10 + cx * 26 + 3) * 2, y0 = (44 + cy * 26 + 3) * 2
        const d = c.getContext('2d').getImageData(x0, y0, (26 - 6) * 2, (26 - 6) * 2).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 150 && d[i + 1] > d[i] + 50 && d[i + 1] > d[i + 2] + 30) n++
        return n
    }, [cx, cy])
    for (let i = 0; i < 14; i++) {
        if (await probe(21, 4) > 6) lit.e++
        if (await probe(18, 7) > 6) lit.s++
        await new Promise((res) => setTimeout(res, 90))
    }
    r.check('the east mouth stays dark — no green PLUG lies where the plug misfires (#2711, #2774)', lit.e === 0, `hits ${lit.e}/14`)
    r.check('the south mouth stays dark — the fallback promises no mouth at all (#2711, #2774)', lit.s === 0, `hits ${lit.s}/14`)
    // and the law keeps both halves of its word: the once-taught plug is still legal
    // to build — and the refused click is STILL refused behind it (the knee's turn
    // now, corner before). If a future change lets (17,4) build after this plug,
    // the corner lesson has an honest mouth again — then teach again; never weaken
    // the knee to light the pixels.
    await tapCell(21, 4)
    await tapCell(17, 4)
    const advK = await page.evaluate(() => { const g = window.__floorbossTest.sim(); return { plug: g.racks.some((r) => r.x === 21 && r.y === 4), corner: g.racks.some((r) => r.x === 17 && r.y === 4), fxs: g.fx.slice(-2).map((f) => f.msg) } })
    r.check('the east plug still builds, and the elbow is STILL refused — the fallback promised nothing and delivers that (#2711, #2774)', advK.plug && !advK.corner, JSON.stringify(advK))
}

// ---- swing paint (#2627 s3): live elbows carry faint amber floor-paint — drive it with real taps ----
{
    await page.goto(URL)
    await page.waitForFunction(() => !!window.__floorbossTest, null, { timeout: 15000 })
    if (!await waitMode('attract', 5000)) r.check('swing leg: fresh page reaches attract', false, 'no attract')
    await page.keyboard.press('Space')
    if (!await waitMode('play')) r.check('swing leg: Space clocks in', false, 'no play')
    await page.evaluate(() => {
        const g = window.__floorbossTest.sim()
        g.racks.length = 0; g.score = 9000
        g.auto = false
        const pads = [[23, 12], [24, 12], [22, 12], [21, 12]]
        g.robots.forEach((b, i) => { b.x = pads[i % 4][0]; b.y = pads[i % 4][1]; b.task = { kind: 'idle' }; b.carry = null; b.moveT = 0 })
    })
    const chipS = await page.evaluate(() => {
        const c = window.__floorbossTest.canvas()
        const b = c.getBoundingClientRect()
        return { x: b.left + (572 + 37) / 800 * b.width, y: b.top + (6 + 14) / 520 * b.height }
    })
    const tapCellS = async (x, y) => {
        if ((await st()).tool !== 'rack') await page.mouse.click(chipS.x, chipS.y) // re-arm after every build
        await page.evaluate(([x, y]) => { const b = window.__floorbossTest.sim().robots.find((bb) => bb.x === x && bb.y === y); if (b) { b.x = 23; b.y = 12; b.task = { kind: 'idle' }; b.moveT = 0 } }, [x, y])
        const p = await clientXY(x, y)
        await page.mouse.click(p.x, p.y)
        await tapsDrained()
    }
    const LIVE = [[18, 3], [19, 3], [19, 5], [20, 3], [20, 5], [17, 5], [17, 6]] // the bay-notched rig — (19,6) stays open
    let builtS = 0
    for (const [x, y] of LIVE) {
        await tapCellS(x, y)
        if (await page.evaluate(([x, y]) => window.__floorbossTest.sim().racks.some((r) => r.x === x && r.y === y), [x, y])) builtS++
    }
    await tapCellS(17, 4) // faces the elbow — legal, lands (the bay keeps the escape)
    builtS += await page.evaluate(() => window.__floorbossTest.sim().racks.some((r) => r.x === 17 && r.y === 4)) ? 1 : 0
    r.check('swing leg builds a LIVE elbow by real taps (8/8 land)', builtS === 8, `${builtS}/8`)
    const sw = await page.evaluate(() => window.__floorbossTest.swing())
    const swk = sw.map((m) => `${m.x},${m.y}`).sort().join(' ')
    r.check('the DEV eye lists the live elbows the taps created (#2627 s3)', swk === '17,3 18,4', swk || 'none')
    // warm-pixel probe: amber floor-paint shifts R over B; measure the DELTA
    // between the elbow cell and a bare reference cell, over frames, cursor parked
    // far away so the reach-diamond cannot bleed into either probe.
    const farP = await clientXY(4, 10) // park the cursor far from both probe cells — the reach-diamond must not bleed into either
    await page.mouse.move(farP.x, farP.y)
    await new Promise((res) => setTimeout(res, 120))
    const warm = async (cx, cy) => page.evaluate(([cx, cy]) => {
        const c = window.__floorbossTest.canvas()
        const x0 = (10 + cx * 26 + 4) * 2, y0 = (44 + cy * 26 + 4) * 2
        const d = c.getContext('2d').getImageData(x0, y0, (26 - 8) * 2, (26 - 8) * 2).data
        let s = 0
        for (let i = 0; i < d.length; i += 4) s += d[i] - d[i + 2]
        return s / (d.length / 4)
    }, [cx, cy])
    let hits = 0
    for (let i = 0; i < 8; i++) {
        const a = await warm(18, 4)
        const b = await warm(10, 10)
        if (a - b >= 4) hits++
        await new Promise((res) => setTimeout(res, 120))
    }
    r.check('the elbow cell paints warmer than bare floor — keep-clear box visible on canvas (#2627 s3)', hits >= 5, `warm-delta hits ${hits}/8`)
    // paint follows grammar: close the south arm and the corner dies — the paint
    // must follow the geometry, not linger as decoration.
    await tapCellS(18, 5) // the south arm's first cell becomes a rack — B keeps one arm: not a corner
    await new Promise((res) => setTimeout(res, 150))
    const sw2 = await page.evaluate(() => window.__floorbossTest.swing())
    r.check('racking the arm kills the elbow — the sweep follows the grammar (#2627 s3)', !sw2.some((m) => m.x === 18 && m.y === 4), sw2.map((m) => `${m.x},${m.y}`).join(' ') || 'none')
    let gone = 0
    for (let i = 0; i < 6; i++) {
        const a = await warm(18, 4)
        const b = await warm(10, 10)
        if (Math.abs(a - b) < 4) gone++
        await new Promise((res) => setTimeout(res, 120))
    }
    r.check('dead elbow cools — no stale paint left behind (#2627 s3)', gone >= 4, `cool hits ${gone}/6`)
}

// ---- teach the lane (#2622): drive a NO PASSING LANE refusal with REAL taps and watch the lesson light ----
{
    await page.goto(URL) // a clean floor — the lane wants no seeded racks near the aisle
    await page.waitForFunction(() => !!window.__floorbossTest, null, { timeout: 15000 })
    if (!await waitMode('attract', 5000)) r.check('lane leg: fresh page reaches attract', false, 'no attract')
    await page.keyboard.press('Space')
    if (!await waitMode('play')) r.check('lane leg: Space clocks in', false, 'no play')
    await page.evaluate(() => {
        const g = window.__floorbossTest.sim()
        g.racks.length = 0; g.score = 9000 // the rig wants the whole aisle to itself, built by hand
        g.auto = false // the crew stays at the pads through the rig build
        const pads = [[23, 12], [24, 12], [22, 12], [21, 12]]
        g.robots.forEach((b, i) => { b.x = pads[i % 4][0]; b.y = pads[i % 4][1]; b.task = { kind: 'idle' }; b.carry = null; b.moveT = 0 })
    })
    const chipL = await page.evaluate(() => {
        const c = window.__floorbossTest.canvas()
        const b = c.getBoundingClientRect()
        return { x: b.left + (572 + 37) / 800 * b.width, y: b.top + (6 + 14) / 520 * b.height }
    })
    await page.mouse.click(chipL.x, chipL.y)
    r.check('lane leg arms the rack tool (chip tap)', (await st()).tool === 'rack')
    const tapCellL = async (x, y) => {
        if ((await st()).tool !== 'rack') await page.mouse.click(chipL.x, chipL.y) // re-arm after every build
        await page.evaluate(([x, y]) => { const b = window.__floorbossTest.sim().robots.find((bb) => bb.x === x && bb.y === y); if (b) { b.x = 23; b.y = 12; b.task = { kind: 'idle' }; b.moveT = 0 } }, [x, y])
        const p = await clientXY(x, y)
        await page.mouse.click(p.x, p.y)
        await tapsDrained()
    }
    const LANE_RIG = [[14, 5], [15, 5], [16, 5], [17, 5], [18, 5], [14, 3], [15, 3], [16, 3], [17, 3]]
    let builtL = 0
    for (const [x, y] of LANE_RIG) {
        await tapCellL(x, y)
        if (await page.evaluate(([x, y]) => window.__floorbossTest.sim().racks.some((r) => r.x === x && r.y === y), [x, y])) builtL++
    }
    r.check('the lane under construction builds by real taps', builtL === 9, `${builtL}/9`)
    const preLane = await page.evaluate(() => { const g = window.__floorbossTest.sim(); return { score: g.score } })
    await tapCellL(18, 3)
    const aftL = await page.evaluate(() => { const g = window.__floorbossTest.sim(); return { racks: g.racks.some((r) => r.x === 18 && r.y === 3), score: g.score, fxs: g.fx.slice(-4).map((f) => f.msg) } })
    r.check('real tap completing the five-cell tight lane is refused — rack never lands', !aftL.racks, JSON.stringify(aftL))
    r.check('the refused lane tap charges nothing (#1917)', aftL.score === preLane.score, `${preLane.score} -> ${aftL.score}`)
    r.check('the refusal names NO PASSING LANE on the fx ledger', aftL.fxs.some((m) => m === 'NO PASSING LANE'), aftL.fxs.join(' | ') || 'none')
    r.check('the refusal teaches with a SPUR IT tail (#2622)', aftL.fxs.some((m) => m === 'SPUR IT — PLUG A MOUTH'), aftL.fxs.join(' | ') || 'none')
    // one interleaved sample window: the yellow banner (fx lifetime ~50 ticks)
    // and the green mouth pulses (teach lifetime 150 ticks) both start at the
    // refusal, so probe them together. Disarm the tool first — the amber
    // reach-diamond on the cursor cell would otherwise bleed into the probe.
    await page.keyboard.press('KeyB')
    let ban = 0
    const litL = { w: 0, e: 0 }
    const probeL = async (x0, y0, w0, h0, kind) => page.evaluate(([x0, y0, w0, h0, kind]) => {
        const c = window.__floorbossTest.canvas()
        const d = c.getContext('2d').getImageData(x0, y0, w0, h0).data
        let n = 0
        for (let j = 0; j < d.length; j += 4) {
            if (kind === 'yellow' ? (d[j] > 190 && d[j + 1] > 140 && d[j + 2] < 120) : (d[j + 1] > 150 && d[j + 1] > d[j] + 50 && d[j + 1] > d[j + 2] + 30)) n++
        }
        return n
    }, [x0, y0, w0, h0, kind])
    for (let i = 0; i < 14; i++) {
        if (await probeL((10 + 18 * 26 + 13 - 70) * 2, (44 + 3 * 26 + 8 - 16) * 2, 140 * 2, 24 * 2, 'yellow') > 20) ban++
        if (await probeL((10 + 13 * 26 + 3) * 2, (44 + 4 * 26 + 3) * 2, (26 - 6) * 2, (26 - 6) * 2, 'green') > 6) litL.w++
        if (await probeL((10 + 19 * 26 + 3) * 2, (44 + 4 * 26 + 3) * 2, (26 - 6) * 2, (26 - 6) * 2, 'green') > 6) litL.e++
        await new Promise((res) => setTimeout(res, 90))
    }
    r.check('the yellow NO PASSING LANE banner paints on canvas (#2622 item 1)', ban >= 3, `banner hits ${ban}/14`)
    r.check('the west mouth pulses green PLUG at the lesson (#2622)', litL.w >= 3, `hits ${litL.w}/14`)
    r.check('the east mouth pulses green PLUG at the lesson (#2622)', litL.e >= 3, `hits ${litL.e}/14`)
    // and taking the teacher's advice by a real tap clears the lane
    await tapCellL(13, 4)
    await tapCellL(18, 3)
    const clearedL = await page.evaluate(() => { const g = window.__floorbossTest.sim(); return { plug: g.racks.some((r) => r.x === 13 && r.y === 4), completer: g.racks.some((r) => r.x === 18 && r.y === 3) } })
    r.check('plugging the taught mouth then completing the wall builds — the advice is good (#2622)', clearedL.plug && clearedL.completer, JSON.stringify(clearedL))
}

// ---- knee teach (#2711 s2): drive a NO KNEE refusal with REAL taps and watch the bend light ----
{
    await page.goto(URL) // a clean floor — the throat garden wants no seeded racks near it
    await page.waitForFunction(() => !!window.__floorbossTest, null, { timeout: 15000 })
    if (!await waitMode('attract', 5000)) r.check('knee teach leg: fresh page reaches attract', false, 'no attract')
    await page.keyboard.press('Space')
    if (!await waitMode('play')) r.check('knee teach leg: Space clocks in', false, 'no play')
    await page.evaluate(() => {
        const g = window.__floorbossTest.sim()
        g.racks.length = 0; g.score = 9000
        g.auto = false
        const pads = [[23, 12], [24, 12], [22, 12], [21, 12]]
        g.robots.forEach((b, i) => { b.x = pads[i % 4][0]; b.y = pads[i % 4][1]; b.task = { kind: 'idle' }; b.carry = null; b.moveT = 0 })
    })
    const chip3 = await page.evaluate(() => {
        const c = window.__floorbossTest.canvas()
        const b = c.getBoundingClientRect()
        return { x: b.left + (572 + 37) / 800 * b.width, y: b.top + (6 + 14) / 520 * b.height }
    })
    await page.mouse.click(chip3.x, chip3.y)
    r.check('knee teach leg arms the rack tool (chip tap)', (await st()).tool === 'rack')
    const armRackK = async () => { if ((await st()).tool !== 'rack') await page.mouse.click(chip3.x, chip3.y) }
    const tapCellK = async (x, y) => {
        await armRackK()
        await page.evaluate(([x, y]) => { const b = window.__floorbossTest.sim().robots.find((bb) => bb.x === x && bb.y === y); if (b) { b.x = 23; b.y = 12; b.task = { kind: 'idle' }; b.moveT = 0 } }, [x, y])
        const p = await clientXY(x, y)
        await page.mouse.click(p.x, p.y)
        await tapsDrained()
    }
    const NEED = [[18, 3], [19, 3], [19, 5], [20, 3], [20, 5], [17, 5], [19, 6], [17, 6]]
    let builtK = 0
    for (const [x, y] of NEED) {
        await tapCellK(x, y)
        if (await page.evaluate(([x, y]) => window.__floorbossTest.sim().racks.some((r) => r.x === x && r.y === y), [x, y])) builtK++
    }
    r.check('knee teach rig builds by real taps', builtK === 8, `${builtK}/8`)
    const preKnee = await page.evaluate(() => window.__floorbossTest.sim().score)
    await tapCellK(18, 7) // plug the throat — the sixth law's own bite
    const afterK = await page.evaluate(() => { const g = window.__floorbossTest.sim(); return { racks: g.racks.some((r) => r.x === 18 && r.y === 7), score: g.score, fxs: g.fx.slice(-4).map((f) => f.msg) } })
    r.check('real tap into the swing is refused — rack never lands', !afterK.racks, JSON.stringify(afterK))
    r.check('the refused knee tap charges nothing (#1917)', afterK.score === preKnee, `${preKnee} -> ${afterK.score}`)
    r.check('the refusal names NO KNEE on the fx ledger (#2711)', afterK.fxs.some((m) => m === 'NO KNEE — RACKED THE SWING'), afterK.fxs.join(' | ') || 'none')
    r.check('the refusal teaches RACK BESIDE — KEEP THE SWING CLEAR (#2711 s2)', afterK.fxs.some((m) => m === 'RACK BESIDE — KEEP THE SWING CLEAR'), afterK.fxs.join(' | ') || 'none')
    // pixels: green HERE pulses on the flank beside-places; amber elbows light at the bends
    const litK = { w: 0, e: 0, a: 0 }
    const probeG = async (cx, cy) => page.evaluate(([cx, cy]) => {
        const c = window.__floorbossTest.canvas()
        const x0 = (10 + cx * 26 + 3) * 2, y0 = (44 + cy * 26 + 3) * 2
        const d = c.getContext('2d').getImageData(x0, y0, (26 - 6) * 2, (26 - 6) * 2).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 150 && d[i + 1] > d[i] + 50 && d[i + 1] > d[i + 2] + 30) n++
        return n
    }, [cx, cy])
    const probeA = async (cx, cy) => page.evaluate(([cx, cy]) => {
        const c = window.__floorbossTest.canvas()
        const x0 = (10 + cx * 26 + 2) * 2, y0 = (44 + cy * 26 + 2) * 2
        const d = c.getContext('2d').getImageData(x0, y0, (26 - 4) * 2, (26 - 4) * 2).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] > 120 && d[i] > d[i + 1] + 15 && d[i] > d[i + 2] + 40) n++
        return n
    }, [cx, cy])
    for (let i = 0; i < 14; i++) {
        if (await probeG(19, 7) > 6) litK.e++
        if (await probeG(17, 7) > 6) litK.w++
        if (await probeA(17, 8) + await probeA(19, 8) > 6) litK.a++
        await new Promise((res) => setTimeout(res, 90))
    }
    r.check('the east beside-place pulses green HERE at the lesson (#2711 s2)', litK.e >= 3, `hits ${litK.e}/14`)
    r.check('the west beside-place pulses green HERE at the lesson (#2711 s2)', litK.w >= 3, `hits ${litK.w}/14`)
    r.check('an amber elbow lights at the bend the click blocked (#2711 s2)', litK.a >= 3, `hits ${litK.a}/14`)
    // the advice is good AND honest: the taught beside-place builds, and the swing
    // cell stays refused above it — the knee law is monotonic, the lesson promises
    // placement, never redemption. A future "fix" that lets the swing cell build
    // after racking beside it breaks the law, not the leg.
    await tapCellK(19, 7)
    await tapCellK(18, 7)
    const advK = await page.evaluate(() => { const g = window.__floorbossTest.sim(); return { beside: g.racks.some((r) => r.x === 19 && r.y === 7), throat: g.racks.some((r) => r.x === 18 && r.y === 7) } })
    r.check('taking the advice builds the beside rack — and the swing cell is STILL refused: placement, not redemption (#2711 s2)', advK.beside && !advK.throat, JSON.stringify(advK))
}

// ---- two-way flow paint (#2622 item 3): legal two-way aisles carry cyan arrows — drive it with real taps ----
{
    await page.goto(URL) // a clean floor — the aisle wants no seeded racks near it
    await page.waitForFunction(() => !!window.__floorbossTest, null, { timeout: 15000 })
    if (!await waitMode('attract', 5000)) r.check('flow leg: fresh page reaches attract', false, 'no attract')
    const bareFlow = await page.evaluate(() => window.__floorbossTest.flow())
    r.check('the opening floor\'s own grammar is honest — every mark a legal 1..4-cell run (#2622 item 3)', bareFlow.every((m) => m.n >= 1 && m.n <= 4), `${bareFlow.length} mark(s): ${bareFlow.map((m) => `${m.axis}${m.n}`).join(' ') || 'none'}`)
    await page.keyboard.press('Space')
    if (!await waitMode('play')) r.check('flow leg: Space clocks in', false, 'no play')
    await page.evaluate(() => {
        const g = window.__floorbossTest.sim()
        g.racks.length = 0; g.score = 9000 // the aisle wants the whole row to itself, built by hand
        g.auto = false // the crew stays at the pads through the rig build
        const pads = [[23, 12], [24, 12], [22, 12], [21, 12]]
        g.robots.forEach((b, i) => { b.x = pads[i % 4][0]; b.y = pads[i % 4][1]; b.task = { kind: 'idle' }; b.carry = null; b.moveT = 0 })
    })
    const chipF = await page.evaluate(() => {
        const c = window.__floorbossTest.canvas()
        const b = c.getBoundingClientRect()
        return { x: b.left + (572 + 37) / 800 * b.width, y: b.top + (6 + 14) / 520 * b.height }
    })
    await page.mouse.click(chipF.x, chipF.y)
    r.check('flow leg arms the rack tool (chip tap)', (await st()).tool === 'rack')
    const tapCellF = async (x, y) => {
        if ((await st()).tool !== 'rack') await page.mouse.click(chipF.x, chipF.y) // re-arm after every build
        await page.evaluate(([x, y]) => { const b = window.__floorbossTest.sim().robots.find((bb) => bb.x === x && bb.y === y); if (b) { b.x = 23; b.y = 12; b.task = { kind: 'idle' }; b.moveT = 0 } }, [x, y])
        const p = await clientXY(x, y)
        await page.mouse.click(p.x, p.y)
        await tapsDrained()
    }
    const FLOW_RIG = [[9, 6], [10, 6], [11, 6], [9, 8], [10, 8], [11, 8]]
    let builtF = 0
    for (const [x, y] of FLOW_RIG) {
        await tapCellF(x, y)
        if (await page.evaluate(([x, y]) => window.__floorbossTest.sim().racks.some((r) => r.x === x && r.y === y), [x, y])) builtF++
    }
    r.check('the two-way aisle rig builds by real taps (6/6 land)', builtF === 6, `${builtF}/6`)
    const fl = await page.evaluate(() => window.__floorbossTest.flow())
    const fk = fl.map((m) => `${m.axis}${m.n}[${m.cells}]`).join(' ')
    r.check('the DEV eye marks the 3-cell aisle two-way (h3, one mark)', fl.length === 1 && fl[0].axis === 'h' && fl[0].n === 3 && fl[0].cells === '9,7|10,7|11,7', fk || 'none')
    await page.keyboard.press('KeyB') // disarm — the amber reach-diamond must not bleed into the probes
    const farPF = await clientXY(4, 10)
    await page.mouse.move(farPF.x, farPF.y)
    await new Promise((res) => setTimeout(res, 120))
    // cool-pixel probe: cyan traffic paint shifts B over R; measure the DELTA
    // against a bare reference cell (same method as the swing warm probe, inverted).
    const cool = async (cx, cy) => page.evaluate(([cx, cy]) => {
        const c = window.__floorbossTest.canvas()
        const x0 = (10 + cx * 26 + 4) * 2, y0 = (44 + cy * 26 + 4) * 2
        const d = c.getContext('2d').getImageData(x0, y0, (26 - 8) * 2, (26 - 8) * 2).data
        let s = 0
        for (let i = 0; i < d.length; i += 4) s += d[i + 2] - d[i]
        return s / (d.length / 4)
    }, [cx, cy])
    let chits = 0
    for (let i = 0; i < 8; i++) {
        const a = await cool(10, 7)
        const b = await cool(10, 10)
        if (a - b >= 2) chits++
        await new Promise((res) => setTimeout(res, 120))
    }
    r.check('the two-way aisle paints cooler (cyan) than bare floor — flow arrows visible on canvas (#2622 item 3)', chits >= 4, `cool-delta hits ${chits}/8`)
    await tapCellF(8, 7) // plug the west mouth — one-way by choice (#2546)
    await new Promise((res) => setTimeout(res, 150))
    const fl2 = await page.evaluate(() => window.__floorbossTest.flow())
    r.check('a spurred dead-end drops every arrow — the paint follows the grammar (#2622 item 3)', !fl2.some((m) => m.cells.includes('10,7')), fl2.map((m) => `${m.axis}${m.n}[${m.cells}]`).join(' ') || 'none')
    let cold = 0
    for (let i = 0; i < 6; i++) {
        const a = await cool(10, 7)
        const b = await cool(10, 10)
        if (Math.abs(a - b) < 2) cold++
        await new Promise((res) => setTimeout(res, 120))
    }
    r.check('the spurred aisle cools — no stale arrows left behind (#2622 item 3)', cold >= 3, `cool hits ${cold}/6`)
}

// ---- duel refusal seat stamp (#2622 item 4): mid-duel a banner names WHOSE click died ----
{
    await page.goto(URL) // a clean console — the lane wants no seeded racks near the aisle
    await page.waitForFunction(() => !!window.__floorbossTest, null, { timeout: 15000 })
    if (!await waitMode('attract', 5000)) r.check('seat-stamp leg: fresh page reaches attract', false, 'no attract')
    await page.keyboard.press('KeyD') // #2555: D seats the model manager beside you
    if (!await waitMode('play')) r.check('seat-stamp leg: D enters the duel', false, 'no play')
    const dueling = await page.evaluate(() => !!window.__floorbossTest.sim().duel)
    r.check('seat-stamp leg runs in duel mode (#2555 chrome live)', dueling, dueling ? 'duel' : 'solo')
    await page.evaluate(() => {
        const g = window.__floorbossTest.sim()
        g.racks.length = 0; g.score = 9000
        g.auto = false // park the crew away from the rig so the law meets only my taps
        const pads = [[23, 12], [24, 12], [22, 12], [21, 12]]
        g.robots.forEach((b, i) => { b.x = pads[i % 4][0]; b.y = pads[i % 4][1]; b.task = { kind: 'idle' }; b.carry = null; b.moveT = 0 })
    })
    const chipD = await page.evaluate(() => {
        const c = window.__floorbossTest.canvas()
        const b = c.getBoundingClientRect()
        return { x: b.left + (572 + 37) / 800 * b.width, y: b.top + (6 + 14) / 520 * b.height }
    })
    await page.mouse.click(chipD.x, chipD.y)
    const tapCellD = async (x, y) => {
        if ((await st()).tool !== 'rack') await page.mouse.click(chipD.x, chipD.y) // re-arm after every build
        await page.evaluate(([x, y]) => { const b = window.__floorbossTest.sim().robots.find((bb) => bb.x === x && bb.y === y); if (b) { b.x = 23; b.y = 12; b.task = { kind: 'idle' }; b.moveT = 0 } }, [x, y])
        const p = await clientXY(x, y)
        await page.mouse.click(p.x, p.y)
        await tapsDrained()
    }
    const D_RIG = [[14, 5], [15, 5], [16, 5], [17, 5], [18, 5], [14, 3], [15, 3], [16, 3], [17, 3]]
    let builtD = 0
    for (const [x, y] of D_RIG) {
        await tapCellD(x, y)
        if (await page.evaluate(([x, y]) => window.__floorbossTest.sim().racks.some((r) => r.x === x && r.y === y), [x, y])) builtD++
    }
    r.check('seat-stamp leg builds the lane rig by real taps', builtD === 9, `${builtD}/9`)
    await tapCellD(18, 3) // complete the lane — the refusal fires with the clock running
    // probe FIRST (fx live ~50 world ticks ≈ 0.83 s — the ledger read must not
    // eat the window): the #2254 stack grows UP (y − lane*11), so at the third
    // message the stamp rides y ≈ 116 — band y 104..121, clear of the law row (130).
    const stampYellow = async () => page.evaluate(() => {
        const c = window.__floorbossTest.canvas()
        const d = c.getContext('2d').getImageData(412 * 2, 104 * 2, 150 * 2, 18 * 2).data
        let n = 0
        for (let j = 0; j < d.length; j += 4) if (d[j] > 190 && d[j + 1] > 140 && d[j + 2] < 120) n++
        return n
    })
    let yHits = 0
    for (let i = 0; i < 8; i++) {
        if (await stampYellow() > 2) yHits++
        await new Promise((res) => setTimeout(res, 80))
    }
    r.check('the seat stamp paints on canvas beneath the banner (#2622 item 4)', yHits >= 3, `yellow hits ${yHits}/8`)
    const dFx = await page.evaluate(() => window.__floorbossTest.sim().fx.slice(-5).map((f) => f.msg))
    r.check('the duel refusal still names the law', dFx.includes('NO PASSING LANE'), dFx.join(' | ') || 'none')
    r.check('the duel refusal names its seat — LANE: YOU under the law (#2622 item 4)', dFx.includes('LANE: YOU'), dFx.join(' | ') || 'none')
    const notLanded = await page.evaluate(() => !window.__floorbossTest.sim().racks.some((r) => r.x === 18 && r.y === 3))
    r.check('the refused duel click lands no rack — law unchanged, seat added (#1917)', notLanded, notLanded ? 'clean' : 'rack landed')
}

// ---- live traffic heat (#2680): routes glow on the floor — driven by REAL traffic, no rig ----
{
    await page.goto(URL)
    await page.waitForFunction(() => !!window.__floorbossTest, null, { timeout: 15000 })
    if (!await waitMode('attract', 5000)) r.check('heat leg: fresh page reaches attract', false, 'no attract')
    await page.keyboard.press('Space')
    if (!await waitMode('play')) r.check('heat leg: Space clocks in', false, 'no play')
    const farP = await clientXY(4, 10) // park the cursor far from both probes — the reach-diamond cannot bleed in
    await page.mouse.move(farP.x, farP.y)
    // one atomic in-page sample: eye truth AND pixels together, so a teal bot
    // body can never pollute a probe claimed by heat (bots paint after heat).
    const meetAndProbe = () => page.evaluate(() => {
        const t = window.__floorbossTest
        const g = t.sim()
        const free = (x, y) => !g.robots.some((b) => b.x === x && b.y === y)
        const warm = (cx, cy) => {
            const c = t.canvas()
            const x0 = (10 + cx * 26 + 4) * 2, y0 = (44 + cy * 26 + 4) * 2
            const d = c.getContext('2d').getImageData(x0, y0, (26 - 8) * 2, (26 - 8) * 2).data
            let s = 0
            for (let i = 0; i < d.length; i += 4) s += d[i] - d[i + 2]
            return s / (d.length / 4)
        }
        const meet = t.heat().filter((c) => c.n >= 2 && free(c.x, c.y) && !g.racks.some((rk) => rk.x === c.x && rk.y === c.y))
        if (!meet.length) return null
        const ref = { x: 10, y: 10 }
        const refHot = t.heat().some((c) => c.x === ref.x && c.y === ref.y)
        if (refHot || !free(ref.x, ref.y)) return null
        const cell = meet[0]
        return { x: cell.x, y: cell.y, n: cell.n, delta: warm(cell.x, cell.y) - warm(ref.x, ref.y) }
    })
    let hits = 0, tries = 0, seen = null, rigged = false
    const probeRound = async (n) => {
        for (let i = 0; i < n; i++) {
            const m = await meetAndProbe()
            if (m) { tries++; if (m.delta >= 4) hits++; seen = seen || m }
            await new Promise((res) => setTimeout(res, 150))
        }
    }
    await probeRound(48) // real traffic first: ~8 world-seconds of auto-dispatch — meetings emerge on their own
    if (tries < 4) {
        rigged = true
        // fallback rig, in the established house style (legs park and direct the
        // crew by hand all over this file): stand the auto off so the hand-set
        // routes hold, and give the two near pads a shared tail — the same
        // corridor two bots would walk if both were called west. The heat and
        // the paint read SIM STATE; these paths ARE sim state once written.
        await page.evaluate(() => {
            const g = window.__floorbossTest.sim()
            g.auto = false
            const west = (b) => {
                const p = []
                for (let x = b.x - 1; x >= Math.max(4, b.x - 8); x--) p.push({ x, y: b.y })
                b.task = { kind: 'idle' }; b.carry = null // the leg's own park pattern — idle holds still, the route claim is the point
                b.path = p
            }
            g.robots.filter((b) => b.y === 12 && !b.broken).forEach(west)
        })
        await probeRound(12)
    }
    r.check('real traffic converges under the eye — cells two routes share appear unoccupied (#2680)', tries >= 4, `${tries} clean convergence samples`)
    r.check('a convergence paints warmer than bare floor — the meet glows on canvas (#2680)', hits >= 4, `warm-delta hits ${hits}/${tries} (deepest seen ${seen ? `${seen.x},${seen.y} n=${seen.n}` : 'none'})`)
    // paint follows truth: the SAME cell, once every route has cleared it, must
    // cool back to bare — the read rides traffic, it is not decoration.
    if (!seen) {
        r.check('the met cell cools once its routes clear — no stale glow outlives the traffic (#2680)', false, 'no convergence observed to re-probe')
    } else {
        // #2774: quiet the mixer before the cool watch. Live dispatch keeps
        // re-claiming the met cell while we count, so the cleared window the
        // gate needs never gathers enough samples on a busy floor (the same
        // mixer-off law #1927 uses for the dock verbs). Vacate routes that
        // still cross the cell the way arrival vacates them (arrival ⇒ path
        // emptied), and step any bot that would otherwise park on it aside —
        // the glow must fade because the claims are gone, not because the
        // page moved on: heat and paint still read live sim truth.
        await page.evaluate(([hx, hy]) => {
            const g = window.__floorbossTest.sim()
            g.auto = false
            g.robots.forEach((b) => {
                b.task = { kind: 'idle' }; b.path = []
                if (b.x === hx && b.y === hy) {
                    const free = [[hx - 1, hy], [hx + 1, hy], [hx, hy - 1], [hx, hy + 1]].find(([x, y]) => x > 0 && y > 0 && x < 25 && y < 14 && !g.robots.some((o) => o !== b && o.x === x && o.y === y))
                    if (free) { b.x = free[0]; b.y = free[1] }
                }
            })
        }, [seen.x, seen.y])
        await new Promise((res) => setTimeout(res, 150))
        let gone = 0, clears = 0
    for (let i = 0; i < 14; i++) {
        const cooled = await page.evaluate(([hx, hy]) => {
            const t = window.__floorbossTest
            const g = t.sim()
            if (t.heat().some((c) => c.x === hx && c.y === hy)) return null
            if (g.robots.some((b) => b.x === hx && b.y === hy)) return null
            const c = t.canvas()
            const warm = (cx, cy) => {
                const x0 = (10 + cx * 26 + 4) * 2, y0 = (44 + cy * 26 + 4) * 2
                const d = c.getContext('2d').getImageData(x0, y0, (26 - 8) * 2, (26 - 8) * 2).data
                let s = 0
                for (let i = 0; i < d.length; i += 4) s += d[i] - d[i + 2]
                return s / (d.length / 4)
            }
            return Math.abs(warm(hx, hy) - warm(10, 10)) < 4
        }, [seen.x, seen.y])
        if (cooled !== null) { clears++; if (cooled) gone++ }
        await new Promise((res) => setTimeout(res, 150))
    }
    r.check('the met cell cools once its routes clear — no stale glow outlives the traffic (#2680)', gone >= 3 && clears >= 4, `cool hits ${gone}/${clears} on ${seen.x},${seen.y}`)
    }
}

// ---- ring ledger (#2997): a between-frame real tap must never re-ring the backlog ----
{
    await page.goto(URL + '?seed=606') // self-contained tail: fresh seed, own eyes (#2987 law)
    await page.waitForFunction(() => !!window.__floorbossTest, null, { timeout: 15000 })
    if (!await waitMode('attract', 5000)) r.check('echo leg: fresh page reaches attract', false, 'no attract')
    await page.keyboard.press('Space')
    if (!await waitMode('play')) r.check('echo leg: Space clocks in', false, 'no play')
    // warm the floor hot through the loop (pump rings each tick's ceremony, so
    // every rung object has rung exactly once and the ledger starts clean); the
    // busy auto crew guarantees completed ticks stamp events whose already-rung
    // backlog sits in gs.ev between frames — the exact echo condition the
    // pre-#2997 solo path re-rang on every between-frame click.
    await page.evaluate(() => { window.__floorbossTest.step(1500, {}, false, true) })
    const cellP = await clientXY(15, 7) // plain floor — a tool-less tap that peeks/selects, never builds
    let observed = 0
    for (let attempt = 0; attempt < 24 && observed < 3; attempt++) {
        // real-tap law (#2992): wait the drain — never guess a sleep
        await waitFor(async () => (await page.evaluate(() => window.__floorbossTest.pending())) === 0, 2500)
        await page.mouse.click(cellP.x, cellP.y) // a REAL click; if it lands between ticks, pre-#2997 it echoed the backlog
        observed = await page.evaluate(() => window.__floorbossTest.ring().backlogClicks)
    }
    const ring = await page.evaluate(() => window.__floorbossTest.ring())
    r.check('between-frame solo taps actually landed on a non-empty backlog (the echo condition, observed for real)', observed >= 3, `backlogClicks ${observed}`)
    r.check('the ring ledger stays silent: no event object ever rang twice — a solo tap names only its own decision (#2997)', ring.echoes === 0, `echoes ${ring.echoes}`)
}

// ---- duck & pass (#2692): the courtesy ring rides real holds ----
{
    await page.goto(URL)
    await page.waitForFunction(() => !!window.__floorbossTest, null, { timeout: 15000 })
    if (!await waitMode('attract', 5000)) r.check('yield leg: fresh page reaches attract', false, 'no attract')
    await page.keyboard.press('Space')
    if (!await waitMode('play')) r.check('yield leg: Space clocks in', false, 'no play')
    const farP = await clientXY(4, 10)
    await page.mouse.move(farP.x, farP.y)
    // one atomic in-page sample: which cart holds (eye truth) AND a cyan read
    // of the ring band around it, in the same paint — pixels can never lie
    // about a hold the sim no longer has. Ring points sit on the axes at the
    // dashed radius, outside the body edge, and reference cells are sampled
    // clean (no bot, no hold) so the delta is the courtesy, not ambience.
    const holdAndProbe = () => page.evaluate(() => {
        const t = window.__floorbossTest
        const g = t.sim()
        const ys = t.yields()
        if (!ys.length) return { holds: 0 }
        const y = ys[0]
        if (g.robots.some((b) => b.yield && (b.x !== y.x || b.y !== y.y))) return { holds: -1 } // eye disagreement — do not sample
        const c = t.canvas()
        const band = (cx, cy) => {
            let hits = 0
            const ANG = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.72, 0.72], [-0.72, 0.72], [0.72, -0.72], [-0.72, -0.72]]
            for (const [ux, uy] of ANG) {
                const x = (10 + cx * 26 + 13 + ux * 12) * 2, yy = (44 + cy * 26 + 13 + uy * 12) * 2
                const d = c.getContext('2d').getImageData(x - 2, yy - 2, 5, 5).data
                for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 140 && d[i + 1] > 110 && d[i + 2] - d[i] > 45) { hits++; break }
            }
            return hits
        }
        const ring = band(y.x, y.y)
        const ref = band(4, 10) // bare floor, far west column — no lanes, no crews there
        return { holds: 1, x: y.x, y: y.y, ring, ref }
    })
    let holds = 0, cyanHits = 0, sample
    for (let i = 0; i < 64 && holds < 8; i++) {
        sample = await holdAndProbe()
        if (sample.holds === 1) { holds++; if (sample.ring >= 2 && sample.ring > sample.ref) cyanHits++ }
        await new Promise((res) => setTimeout(res, 150))
    }
    if (holds < 4) {
        // fallback rig in house style: the bay crush written straight onto sim
        // state (the legs park and direct the crew by hand all over this file) —
        // the eye and the paint still read truth, the leg only stages traffic.
        // #2774: one staged meeting resolves in ~34 world ticks (the duck law
        // lets the cart through on its own), a 3-4 sample window at 150 ms —
        // thin under software GL. Re-arm the same written traffic whenever the
        // eyes have gone empty: repeated staging, never a faked reading.
        const rig = () => page.evaluate(() => {
            const t = window.__floorbossTest
            const g = t.sim()
            g.auto = false
            g.score = 9000
            g.arm.held = 'crate'
            if (!g.racks.some((r) => r.x === 18 && r.y === 3)) g.racks.push({ x: 18, y: 3, items: [], owner: -1 })
            const [A, B] = g.robots
            g.robots.forEach((b) => { b.pickT = 0; b.jam = false; b.broken = false; b.repair = 0; b.yield = null; b.yieldCd = 0; b.wait = 0 }) // park the crew FIRST — pickT residue would grab the cargo instead of stalling
            A.x = 16; A.y = 3; A.carry = null; A.task = { kind: 'toArm' }; A.path = []; A.moveT = 0; A.wait = 0
            B.x = 16; B.y = 2; B.carry = null; B.task = { kind: 'toArm' }; B.path = []; B.moveT = 0; B.wait = 0; B.pickT = 240 // long bay job — the hold stays visible while A queues one cell back; B.jam = false
            const n = g.robots.find((b) => b.id === 9001) || (g.robots.push({ id: 9001 }), g.robots.at(-1)) // #2774: reuse the staged cart across re-arms
            Object.assign(n, { x: 17, y: 1, carry: 'crate', owner: -1, task: { kind: 'toStock', rx: 18, ry: 3 }, path: [], moveT: 36, wait: 0, jam: false, pickT: 0, broken: false, repair: 0, wear: 0, wearMax: 9999, dir: 2, face: 2, hist: [], stall: 0, yield: null, yieldCd: 0, ducked: 0 }) // #2774: face rides the rig too — a loaded leg repaths via bfsKnee(gs,…,bot.face) since #2738, and NB[undefined] threw a TypeError every frame (killing the paint loop, hence the cyan-ring flake)
        })
        await rig()
        let empties = 0
        for (let i = 0; i < 80 && holds < 8; i++) {
            sample = await holdAndProbe()
            if (sample.holds === 1) { holds++; empties = 0; if (sample.ring >= 2 && sample.ring > sample.ref) cyanHits++ }
            else if (++empties >= 15) { await rig(); empties = 0 }
            await new Promise((res) => setTimeout(res, 150))
        }
    }
    r.check('a cart holds a shoulder on the live floor — the yields eye reports holds (#2692)', holds >= 4, `holds ${holds} samples, ducks ${await page.evaluate(() => window.__floorbossTest.ducks())}`)
    r.check('the yielding cart wears the dashed cyan ring on canvas — courtesy visible on a phone (#2692)', cyanHits >= 3, `cyan ring hits ${cyanHits}/${holds}`)
    // ---- #2987 watch-stamp truth — a self-contained leg on a fresh floor, so
    // it neither leans on nor contaminates the rigs above. Real Y events; the
    // brand is read on the game's own eyes; pixels on the settled sheet.
    await page.goto(URL + '?seed=7')
    await new Promise((res) => setTimeout(res, 1000)) // stored decline is seeded (openGame init script) — Space starts clean
    await page.keyboard.press('Space')
    r.check('watch-stamp rig: a fresh floor starts unbranded (#2987)',
        (await waitMode('play', 4000)) && await page.evaluate(() => window.__floorbossTest.watchSteered() === false))
    await page.keyboard.press('KeyY') // seat the prover
    let steered = false
    for (let i = 0; i < 80; i++) {
        if (await page.evaluate(() => window.__floorbossTest.watchSteered())) { steered = true; break }
        await new Promise((res) => setTimeout(res, 50))
    }
    r.check('seating WATCH brands the take once the prover actually drives a tick (#2987)', steered)
    await page.keyboard.press('KeyY') // hand back — the tick was driven; the brand stays
    r.check('hand-back releases the floor, not the brand — the prover drove this take (#2987)',
        await page.evaluate(() => window.__floorbossTest.watchSteered()))
    // Force the night clear through game law (house rig verbs, as in the
    // full-shift block). The bank is declined in this rig (#2091) — so the
    // steered night must show NO verdict plate: no take, no confession
    // (#2964 chip law, #2058 truth).
    await page.evaluate(() => { const g = window.__floorbossTest.sim(); g.strikes = 0; g.expired = 0; g.score = g.shiftBase + g.params.quota + 500; g.orders.forEach((o) => { if (o.due < g.tick + 1000) o.due = g.tick + 1000 }) })
    await page.evaluate(() => { for (let i = 0; i < 9200 && !window.__floorbossTest.sim().end; i++) window.__floorbossTest.step(1) })
    r.check('the steered night reaches the sheet (#2987)', await waitMode('over', 6000))
    await new Promise((res) => setTimeout(res, 1200)) // past the over-screen key guard; pixels settle
    const wink = await page.evaluate(() => {
        const d = window.__floorbossTest.canvas().getContext('2d').getImageData((800 / 2 - 118) * 2, 322 * 2, 236 * 2, 22 * 2).data
        let amber = 0, hot = 0
        for (let i = 0; i < d.length; i += 4) {
            const r0 = d[i], g0 = d[i + 1], b0 = d[i + 2]
            if (r0 > 220 && g0 > 130 && g0 < 225 && b0 < 140) amber++
            if (r0 >= 250 && g0 < 120) hot++
        }
        return { amber, hot }
    })
    r.check('a declined steered floor shows no out-of-train wink — no take, no confession (#2987/#2058)',
        wink.amber === 0 && wink.hot === 0, JSON.stringify(wink))
    r.check('bank truth at the whistle: branded in the eyes, verdict withheld from a declined bank (#2987)',
        await page.evaluate(() => window.__floorbossTest.watchSteered() === true && window.__floorbossTest.sheetSteered() === false))
    await page.keyboard.press('Enter') // clock into the next shift — the take rides on
    r.check('the brand crosses the clock-in seam unbroken (#2987/#2958)',
        await page.evaluate(() => window.__floorbossTest.watchSteered()))
    r.check('zero page errors', errors.length === 0, [...seenMsg.entries()].map(([m, s]) => `${m} ×${errors.filter((x) => x === m).length} @ ${s}`).join(' | ') || errors.join(' | '))
    r.exit(browser)
}
