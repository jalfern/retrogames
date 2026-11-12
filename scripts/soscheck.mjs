// SOS CHECK — the SHORT ORDER SHOUT harness (#1248).
//
// Proves three things about the co-op kitchen:
//   1. it boots      — browser opens the route, __game answers, a shift starts
//   2. its rules hold— Node-first assertions on the pure sim, every core rule
//   3. it can be won — the CPU line cook + runner reach quota on most seeds
//
// Run: npm run soscheck          (dev server on DEV_PORT, default 5173)
//      SOS_SKIP_BROWSER=1 npm run soscheck   (rule/determinism/win only)

import { createGame, stepGame, simState, makeCpuEmitter, cellKind, SHIFT_TICKS, QUOTA, RUNNER_POST, hashState, COOL_SIP, SEAR_OK, SEAR_TELL, TAP_REFILL, actionable, cpuPlan } from '../src/games/ShortOrderShout/engine.js'
import { MIC_RECT, VOX_RECT, CHIP_ZONE, PIP_ZONE, CHIP_MIN_H, rectsOverlap } from '../src/games/ShortOrderShout/art.js'
import { takeIsSpeech, ACK_MIN_MS, PTT_MIN_B64, createPttSender } from '../src/games/ShortOrderShout/ptt.js'

const URL = process.env.SOS_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/short-order-shout`

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}

const hold = (pads, seat, pad) => { pads[seat] = { ...(pads[seat] || {}), ...pad } }
// press with clean edges: the engine edge-triggers A/B, so tests must release
// between presses or the signal never falls.
const tap = (g, seat, pad, idleTicks = 0) => {
    const pads = []
    hold(pads, seat, pad)
    stepGame(g, pads)
    pads[seat] = {}
    stepGame(g, pads) // one released step so the engine's press latch falls
    for (let t = 0; t < idleTicks; t++) stepGame(g, pads)
}

function runEm(seed, seats, until = 9000) {
    const gs = createGame(seed, seats)
    const em = Array.from({ length: seats }, (_, i) => makeCpuEmitter(i))
    for (let t = 0; t < until && !gs.done; t++) stepGame(gs, em.map((f) => f({ gs, tick: t })))
    return gs
}

console.log('— rules (pure sim) —')

// 1. layout: the counter splits the kitchen; only cols 11-12 connect the sides
ok('counter solid cols 0..10', [...Array(11).keys()].every((x) => cellKind(x, 3) === 'counter'))
ok('gap at cols 11-12', cellKind(11, 3) === 'floor' && cellKind(12, 3) === 'floor')
ok('window on pass side', cellKind(0, 5) === 'window')
ok('stations in wall row', cellKind(0, 0) === 'cooler' && cellKind(4, 0) === 'board' && cellKind(6, 0) === 'burner' && cellKind(9, 0) === 'pot' && cellKind(11, 0) === 'tap')

// 1b. bottom-strip ergonomics (#1468 QA): thumb-standard hit boxes, no zones
// touching. The renderer sizes seat chips from CHIP_ZONE/CHIP_MIN_H and draws
// pips inside PIP_ZONE — so zone disjointness = no chip can ever eat a tap.
{
    ok('#1468 MIC/VOX chips meet the thumb standard (>=20px tall)', MIC_RECT.h >= CHIP_MIN_H && VOX_RECT.h >= CHIP_MIN_H && MIC_RECT.w >= 16 && VOX_RECT.w >= 20, JSON.stringify({ mic: MIC_RECT, vox: VOX_RECT }))
    ok('#1468 MIC and VOX boxes are separated', !rectsOverlap(MIC_RECT, VOX_RECT))
    ok('#1468 seat-chip zone clears MIC/VOX', !rectsOverlap(CHIP_ZONE, MIC_RECT) && !rectsOverlap(CHIP_ZONE, VOX_RECT))
    ok('#1468 seat-chip zone clears RTT pips', !rectsOverlap(CHIP_ZONE, PIP_ZONE))
    ok('#1468 voice chips clear RTT pips', !rectsOverlap(PIP_ZONE, MIC_RECT) && !rectsOverlap(PIP_ZONE, VOX_RECT))
    ok('#1468 all zones sit on the canvas', [MIC_RECT, VOX_RECT, CHIP_ZONE, PIP_ZONE].every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= 320 && r.y + r.h <= 224))
}

// 1c. the radio ties the cook (#2079) — the pure half: what counts as a
// landed take, and that a solo release cannot wedge the busy gate.
{
    ok('#2079 a landed take passes the ack floor', takeIsSpeech(PTT_MIN_B64, ACK_MIN_MS) && takeIsSpeech(9000, 4000))
    ok('#2079 silence stays silent — bytes or time under floor gets no ack',
        !takeIsSpeech(PTT_MIN_B64 - 1, 9999) && !takeIsSpeech(9999, ACK_MIN_MS - 1) && !takeIsSpeech(0, 0))
    const snd = createPttSender({ now: () => 0, budget: { take: () => true, reset() { }, stats: () => ({ dropped: 0 }) } })
    snd.press()
    snd.release('A'.repeat(600))
    ok('#2079 a released take queues for drain', snd.pending > 0, `pending=${snd.pending}`)
    snd.discard()
    ok('#2079 discard empties the queue (solo has no wire; the gate must clear)', snd.pending === 0)
}

// 2. determinism: same seed + pads => identical hash
{
    const a = runEm(7, 2), b = runEm(7, 2)
    ok('seed+pads => identical hash', simState(a).hash === simState(b).hash, `${simState(a).hash} vs ${simState(b).hash}`)
    const c = runEm(8, 2)
    ok('different seed diverges', simState(a).hash !== simState(c).hash)
}

// 3. soup pipeline: potato then tomato -> boil -> 2 stirs -> ready -> ladle -> serve
{
    const gs = runEm(2, 2, 600) // seed 2 makes soup early
    ok('soup served on a seed-2 shift', gs.served >= 1 && gs.score > 0, `served=${gs.served}`)
}
{
    // unit-test the pot state machine through direct A presses at stations:
    const potOnly = createGame(1, 1)
    potOnly.cooks[0].x = 9; potOnly.cooks[0].y = 1; potOnly.cooks[0].face = 'up'
    potOnly.cooks[0].holding = 'pot'
    tap(potOnly, 0, { a: true })
    ok('potato into empty pot -> veg', potOnly.pot.state === 'veg', potOnly.pot.state)
    potOnly.cooks[0].holding = 'tom'
    tap(potOnly, 0, { a: true })
    ok('tomato into veg -> boiling', potOnly.pot.state === 'boiling', potOnly.pot.state)
    tap(potOnly, 0, { a: true }, 40) // stir 1, then wait (inside the stir gap)
    tap(potOnly, 0, { a: true }, 160) // stir 2, then simmer out
    ok('two stirs => ready', potOnly.pot.state === 'ready', potOnly.pot.state)
    potOnly.cooks[0].holding = null
    tap(potOnly, 0, { a: true })
    ok('ladle ready soup', potOnly.cooks[0].holding === 'soup', String(potOnly.cooks[0].holding))
    // boil-over: no stir within the gap ruins the batch
    const boilover = createGame(1, 1)
    boilover.pot.state = 'boiling'
    for (let t = 0; t < 85; t++) stepGame(boilover, [])
    ok('unattended boil => ruined', boilover.pot.state === 'ruined', boilover.pot.state)
}

// 4. burner: sear -> ready -> burnt -> fire -> spreads -> doused with cup water
{
    const gs = createGame(1, 1)
    gs.cooks[0].x = 6; gs.cooks[0].y = 1; gs.cooks[0].face = 'up'
    gs.cooks[0].holding = 'patty'
    tap(gs, 0, { a: true })
    ok('patty starts searing', gs.burners[0].state === 'cooking')
    for (let t = 0; t < 210; t++) stepGame(gs, [])
    ok('seared on time', gs.burners[0].state === 'ready')
    for (let t = 0; t < 181; t++) stepGame(gs, [])
    ok('left too long => fire', gs.burners[0].state === 'fire', gs.burners[0].state)
    for (let t = 0; t < 361; t++) stepGame(gs, [])
    ok('fire spreads to the other burner', gs.burners[1].state === 'fire')
    gs.cooks[0].holding = 'water'
    tap(gs, 0, { a: true })
    ok('cup water douses it', gs.burners[0].state === 'empty', gs.burners[0].state)
}

// 4b. #2113 COOL THE PAN: pouring a cup on a hot-but-not-burnt burner backs
// the sear clock off by COOL_SIP — pan and patty stay, the cup is spent
// (refill at the tap). Burnt is too late: water beads off, only dousing
// remains. Heat never runs negative. This is the counterplay BEFORE trouble,
// the gap #2113 closed ("no cool-the-pan beyond dousing").
{
    const gs = createGame(1, 1)
    gs.cooks[0].x = 6; gs.cooks[0].y = 1; gs.cooks[0].face = 'up'
    gs.burners[0].state = 'cooking'; gs.burners[0].t = 100
    gs.cooks[0].holding = 'water'
    tap(gs, 0, { a: true }, 10)
    // tap = press + release + idle ticks; the burner clock runs every one of
    // them, so the honest expected t is 100 - COOL_SIP + (2 + 10).
    ok('a poured cup cools a cooking pan (state holds, sear clock backs off COOL_SIP)',
        gs.burners[0].state === 'cooking' && gs.burners[0].t === 100 - COOL_SIP + 12, `${gs.burners[0].state} t=${gs.burners[0].t}`)
    ok('the pour spends the cup', gs.cooks[0].holding === null, String(gs.cooks[0].holding))
    ok('the pour announces itself as fx cool', gs.fx.some((f) => f.k === 'cool' && f.n === 0 && f.t <= 40), JSON.stringify(gs.fx.filter((f) => f.k === 'cool')))
}
{
    const gs = createGame(1, 1)
    gs.cooks[0].x = 6; gs.cooks[0].y = 1; gs.cooks[0].face = 'up'
    gs.burners[0].state = 'ready'; gs.burners[0].t = 179 // one tick from burnt
    gs.cooks[0].holding = 'water'
    tap(gs, 0, { a: true }, 20)
    ok('a pan one tick from burning survives the sip', gs.burners[0].state === 'ready' && gs.burners[0].t === 179 - COOL_SIP + 22, `${gs.burners[0].state} t=${gs.burners[0].t}`)
    ok('counterfactual: the same pan burns untouched', (() => {
        const g2 = createGame(1, 1)
        g2.burners[0].state = 'ready'; g2.burners[0].t = 179
        for (let t = 0; t < 3; t++) stepGame(g2, [])
        return g2.burners[0].state === 'burnt' || g2.burners[0].state === 'fire'
    })())
}
{
    const gs = createGame(1, 1)
    gs.cooks[0].x = 6; gs.cooks[0].y = 1; gs.cooks[0].face = 'up'
    gs.burners[0].state = 'burnt'; gs.burners[0].t = 0
    gs.cooks[0].holding = 'water'
    tap(gs, 0, { a: true }, 0)
    ok('burnt is too late — the cup is not spent on ruin', gs.cooks[0].holding === 'water', String(gs.cooks[0].holding))
    ok('and nothing cooled (no cool fx)', !gs.fx.some((f) => f.k === 'cool'))
}
{
    const gs = createGame(1, 1)
    gs.cooks[0].x = 6; gs.cooks[0].y = 1; gs.cooks[0].face = 'up'
    gs.burners[0].state = 'cooking'; gs.burners[0].t = 0
    gs.cooks[0].holding = 'water'
    tap(gs, 0, { a: true }, 0)
    ok('heat never cools below zero', gs.burners[0].t === 2 && gs.burners[0].state === 'cooking', `t=${gs.burners[0].t}`) // clamp at 0, then press+release ticks
}
{
    const build = () => {
        const gs = createGame(9, 1)
        gs.cooks[0].x = 6; gs.cooks[0].y = 1; gs.cooks[0].face = 'up'
        gs.burners[0].state = 'ready'; gs.burners[0].t = 120
        gs.cooks[0].holding = 'water'
        tap(gs, 0, { a: true }, 15)
        return hashState(gs)
    }
    ok('the cool replay is deterministic (same script => same hash)', build() === build())
}

// 4c. #2119 THE SCORCH TELL: crossing into the ready window's last minute fires
// fx scorch (per episode — a cooled pan that re-crosses tells again), and the
// shift's FIRST crossing adds fx teach exactly once. The tap is a shared choke
// point: a fill locks it TAP_REFILL ticks and the next cup is refused with deny
// + toast. actionable().water tells the truth (someone needs a cup AND the tap
// is ready). And the CPU sip: fires absent, water in hand, a pan inside the
// last half-minute => walk to that burner and pour; a cook holding anything else
// keeps its job, and fires still outrank a sip.
{
    const gs = createGame(3, 1)
    gs.burners[0].state = 'ready'; gs.burners[0].t = SEAR_OK - SEAR_TELL // the tick before the tell
    gs.fx = []
    stepGame(gs, [])
    ok('crossing into the tell window announces scorch', gs.fx.some((f) => f.k === 'scorch' && f.n === 0), JSON.stringify(gs.fx))
    ok('the first tell teaches the counterplay once', gs.fx.some((f) => f.k === 'teach' && /CUP.*COOLS/.test(f.msg || '')) && gs.taught, JSON.stringify(gs.fx))
    gs.fx = []
    stepGame(gs, [])
    ok('the tell does not spam while the pan stays hot', !gs.fx.some((f) => f.k === 'scorch'))
    gs.burners[1].state = 'ready'; gs.burners[1].t = SEAR_OK - SEAR_TELL
    gs.fx = []
    stepGame(gs, [])
    ok('a second burner tells, but the lesson is never repeated',
        gs.fx.some((f) => f.k === 'scorch' && f.n === 1) && !gs.fx.some((f) => f.k === 'teach'), JSON.stringify(gs.fx))
}
{
    const gs = createGame(3, 1)
    gs.cooks[0].x = 6; gs.cooks[0].y = 1; gs.cooks[0].face = 'up'
    gs.burners[0].state = 'ready'; gs.burners[0].t = 170 // already inside the window — no tell was owed
    gs.cooks[0].holding = 'water'
    tap(gs, 0, { a: true }, 0) // sip: t 170-60=110 (+press/release ticks)
    gs.fx = []
    ok('a cooled pan owes no tell', !gs.fx.some((f) => f.k === 'scorch'), JSON.stringify(gs.fx))
    for (let t = 0; t < 12; t++) stepGame(gs, []) // t climbs back across the line
    ok('a cooled pan that re-crosses tells again (per-episode)', gs.fx.some((f) => f.k === 'scorch' && f.n === 0))
}
{
    const gs = createGame(1, 1)
    gs.cooks[0].x = 11; gs.cooks[0].y = 1; gs.cooks[0].face = 'up'
    tap(gs, 0, { a: true }, 0)
    ok('the tap fills a cup and drains', gs.cooks[0].holding === 'water' && gs.tapCd === TAP_REFILL - 2, `holding=${gs.cooks[0].holding} tapCd=${gs.tapCd}`)
    gs.cooks[0].holding = null
    gs.fx = []
    tap(gs, 0, { a: true }, 0)
    ok('the next cup is refused while the tap refills', gs.cooks[0].holding === null && gs.fx.some((f) => f.k === 'deny'), JSON.stringify(gs.cooks[0].holding))
    ok('the refusal says why', gs.fx.some((f) => f.k === 'toast' && /TAP REFILLS/.test(f.msg || '')))
    for (let t = 0; t < TAP_REFILL; t++) stepGame(gs, [])
    gs.fx = []
    tap(gs, 0, { a: true }, 0)
    ok('the tap answers once refilled', gs.cooks[0].holding === 'water' && gs.fx.some((f) => f.k === 'fill'))
    const drain = () => { for (let t = 0; t < TAP_REFILL + 2; t++) stepGame(gs, []) }
    drain(); gs.cooks[0].holding = null; gs.fx = []
    ok('rinsing stays free on the tap\'s beat', (() => { gs.cooks[0].dirty = true; tap(gs, 0, { a: true }, 0); return gs.cooks[0].dirty === false })())
}
{
    const gs = createGame(1, 1)
    ok('no trouble, no water job', actionable(gs).water === false)
    gs.burners[0].state = 'ready'; gs.burners[0].t = SEAR_OK - SEAR_TELL + 10
    ok('a scorching pan opens the water job', actionable(gs).water === true)
    gs.tapCd = 10
    ok('a drained tap cannot take the job', actionable(gs).water === false)
    gs.tapCd = 0; gs.burners[0].state = 'fire'
    ok('fire is a water job too', actionable(gs).water === true)
}
{
    const gs = createGame(5, 2)
    gs.cooks[0].x = 9; gs.cooks[0].y = 1; gs.cooks[0].face = 'up'
    gs.cooks[0].holding = 'water'
    gs.burners[1].state = 'ready'; gs.burners[1].t = SEAR_OK - 10 // scorching NOW
    const pl = cpuPlan(gs, 0)
    const end = pl.path && pl.path.length ? (() => { let x = 9, y = 1; for (const m of pl.path) { const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[m]; x += d[0]; y += d[1] } return [x, y] })() : null
    ok('the sip plan walks a water-holding cook to the scorching burner and pours', pl.act === 'a' && pl.thenFace === 'up' && end && end[0] === 7 && end[1] === 1, JSON.stringify(pl))
    gs.burners[0].state = 'fire'
    const plF = cpuPlan(gs, 0)
    const endF = plF.path && plF.path.length ? (() => { let x = 9, y = 1; for (const m of plF.path) { const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[m]; x += d[0]; y += d[1] } return [x, y] })() : null
    ok('fire outranks the sip', endF && endF[0] === 6 && endF[1] === 1, JSON.stringify(plF))
    gs.burners[0].state = 'empty'
    gs.cooks[0].holding = 'bun'
    const plB = cpuPlan(gs, 0)
    ok('a cook carrying an ingredient keeps its job (no sip off water)', !(plB.act === 'a' && plB.thenFace === 'up' && plB.path && plB.path.some((m) => m === 'right')))
}
{
    const build = () => {
        const gs = createGame(13, 2)
        gs.burners[1].state = 'ready'; gs.burners[1].t = 155
        for (let t = 0; t < 240; t++) stepGame(gs, [])
        return hashState(gs)
    }
    ok('the tell + choke + sip replay is deterministic', build() === build())
}

// 5. dirty floor items: drop => dirty; stations refuse; rinse at tap fixes
{
    const gs = createGame(1, 1)
    gs.cooks[0].x = 4; gs.cooks[0].y = 2; gs.cooks[0].face = 'up'
    gs.cooks[0].holding = 'patty'
    tap(gs, 0, { b: true }, 31) // tossed patty hits the board (which refuses patties) and lands dirty
    const landed = gs.floors.some((f) => f.item === 'patty' && f.dirty)
    ok('tossed ingredient lands dirty on the floor', landed)
    // direct dirty test: pick up a dirty bun off the floor
    const gs2 = createGame(1, 1)
    gs2.floors.push({ x: 2, y: 2, item: 'bun', dirty: true })
    gs2.cooks[0].x = 2; gs2.cooks[0].y = 2
    tap(gs2, 0, { a: true })
    ok('pick up dirty item => cook dirty', gs2.cooks[0].dirty && gs2.cooks[0].holding === 'bun')
    gs2.cooks[0].x = 11; gs2.cooks[0].y = 1; gs2.cooks[0].face = 'up'
    tap(gs2, 0, { a: true })
    ok('rinse at tap cleans', !gs2.cooks[0].dirty && gs2.cooks[0].holding === 'bun')
    // dirty refuses stations
    const gs3 = createGame(1, 1)
    gs3.cooks[0].x = 6; gs3.cooks[0].y = 1; gs3.cooks[0].face = 'up'; gs3.cooks[0].holding = 'patty'; gs3.cooks[0].dirty = true
    tap(gs3, 0, { a: true })
    ok('dirty patty refuses burner', gs3.burners[0].state === 'empty' && gs3.cooks[0].holding === 'patty')
}

// 6. scoring: serve pays base + time tip; wrong dish denied; strikes expire
{
    const gs = createGame(1, 1)
    gs.tickets = [{ id: 0, dish: 'melt', left: 1200, total: 2400 }]
    gs.cooks[0].x = 0; gs.cooks[0].y = 5; gs.cooks[0].holding = 'melt'
    const p = []
    hold(p, 0, { a: true }); stepGame(gs, p)
    ok('serve pays base+tip', gs.score === 100 + 50 && gs.served === 1, `score=${gs.score}`)
    gs.tickets = [{ id: 1, dish: 'soup', left: 1000, total: 2000 }]
    gs.cooks[0].holding = 'melt'
    hold(p, 0, { a: true }); stepGame(gs, p)
    ok('wrong dish denied', gs.served === 1 && gs.cooks[0].holding === 'melt')
    gs.cooks[0].holding = null
    const before = gs.strikes
    gs.tickets = [{ id: 2, dish: 'melt', left: 1, total: 100 }]
    stepGame(gs, [])
    ok('expired ticket strikes', gs.strikes === before + 1)
    gs.strikes = 2
    gs.tickets = [{ id: 3, dish: 'soup', left: 1, total: 100 }]
    stepGame(gs, [])
    ok('third strike ends the shift', gs.done && !gs.win)
}

// 7. toss handoff: runner catches a dish thrown over the counter and serves it
{
    const gs = createGame(1, 2)
    gs.tickets = [{ id: 0, dish: 'melt', left: 2000, total: 2000 }]
    gs.cooks[0].x = 6; gs.cooks[0].y = 2; gs.cooks[0].face = 'down'; gs.cooks[0].holding = 'melt'
    gs.cooks[1].x = RUNNER_POST[0]; gs.cooks[1].y = RUNNER_POST[1]
    const p = []
    hold(p, 0, { b: true }); stepGame(gs, p); hold(p, 0, {})
    for (let t = 0; t < 12; t++) stepGame(gs, [])
    ok('runner catches the throw', gs.cooks[1].holding === 'melt', `${gs.cooks[1].holding} projs=${gs.projs.length}`)
    gs.cooks[1].x = 0; gs.cooks[1].y = 5
    hold(p, 1, { a: true }); stepGame(gs, p)
    ok('runner serves at the window', gs.served === 1 && gs.score >= 100)
}

console.log('— winnable —')
{
    let wins = 0
    for (const s of [1, 2, 4, 6, 7, 8, 9, 11]) {
        const gs = runEm(s, 2)
        if (gs.done && gs.win) wins++
    }
    ok('CPU line+cook pair wins 8/8 known-good seeds', wins === 8, `${wins}/8`)
    const solo = runEm(4, 1)
    ok('solo seat reaches quota (hard but possible)', solo.win)
}

console.log('— slack (issue spirit: the pair must win with one fewer cook) —')
{
    // The winning scripts consume COOKS: the 2P pair win above must still be
    // winnable solo on most seeds — the counter circuit is the tax, not a wall.
    let wins = 0
    for (const s of [1, 2, 4, 6, 7, 8, 9, 11]) {
        const gs = runEm(s, 1)
        if (gs.done && gs.win) wins++
    }
    ok('solo cook still makes quota on >=6/8 seeds', wins >= 6, `${wins}/8`)
}

// ---- browser boot ----
if (!process.env.SOS_SKIP_BROWSER) {
    console.log('— boots (browser) —')
    const { chromium } = await import('playwright-core')
    const browser = await chromium.launch({ channel: process.env.SHOT_CHANNEL || 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] })
    const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e)))
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Download the React DevTools/i.test(m.text())) errs.push(m.text()) })
    await page.goto(URL, { waitUntil: 'load' })
    await page.waitForFunction('!!window.__game', null, { timeout: 15000 })
    ok('__game exposed', true)
    const st = await page.evaluate(() => {
        const g = window.__game
        const s0 = g.reset(7, 2)
        for (let i = 0; i < 300; i++) g.step([{ right: i % 4 === 0 }, {}])
        return { ...g.state(), ticks: s0.tick }
    })
    ok('contract reset+step advances', st.tick >= 300, `tick=${st.tick}`)
    ok('contract state carries seed+hash', Number.isInteger(st.seed) && Number.isInteger(st.hash))
    // determinism through the browser contract
    const st2 = await page.evaluate(() => {
        const g = window.__game
        g.reset(7, 2)
        for (let i = 0; i < 300; i++) g.step([{ right: i % 4 === 0 }, {}])
        return g.state()
    })
    ok('browser contract is deterministic', st.hash === st2.hash, `${st.hash} vs ${st2.hash}`)
    const frame = await page.evaluate(() => window.__game.frame())
    ok('frame() returns PNG data', typeof frame === 'string' && frame.startsWith('data:image/png'), String(frame).slice(0, 40))
    // desync receipt (#1416 gap 5): the NET warning is no longer a plain toast
    // — it prints off the ticket rail as a paper slip, flips green on resync,
    // then tears off. Drilled through the DEV seam (no live pair needed).
    const dz = await page.evaluate(async () => {
        const T = window.__sosTest
        T.start(7, 2)
        const raf = () => new Promise((r) => requestAnimationFrame(r))
        await raf(); await raf()
        T.desyncDrill()
        const p0 = T.notice()
        for (let i = 0; i < 18; i++) await raf()
        const p1 = T.notice()
        let paper = 0
        const img = document.querySelector('canvas').getContext('2d').getImageData(124, 48, 72, 30).data
        for (let i = 0; i < img.length; i += 4) if (img[i] > 225 && img[i + 1] > 215 && img[i + 2] > 190 && img[i + 2] < 235) paper++
        T.resyncDrill()
        const p2 = T.notice()
        for (let i = 0; i < 70; i++) await raf()
        const p3 = T.notice()
        return { p0, p1, p2, p3, paper }
    })
    ok('desync receipt prints from the rail', dz.p0 && dz.p0.phase === 'print', JSON.stringify(dz.p0))
    ok('receipt reaches hold after printing', dz.p1 && (dz.p1.phase === 'hold' || dz.p1.phase === 'ok'), JSON.stringify(dz.p1))
    ok('receipt is thermal paper on the rail', dz.paper > 400, `paper px=${dz.paper}`)
    ok('resync flips the receipt green', dz.p2 && dz.p2.phase === 'ok', JSON.stringify(dz.p2))
    ok('receipt tears off after resync', dz.p3 === null, JSON.stringify(dz.p3))
    // #2079 the radio ties the cook — drilled through the DEV rig (a headless
    // box has no mic to hold), with REAL keystrokes for the refusal itself:
    // while the radio is busy A is refused at the handler and walking stays
    // legal; clearing the rig hands the cook back; the line answers takes.
    // Fresh boot first: the determinism drill above latches the contract onto
    // the loop, and a contract-held loop never runs liveTick (feet need ticks).
    {
        await page.reload({ waitUntil: 'load' })
        await page.waitForFunction('!!window.__game', null, { timeout: 15000 })
        const band = async (x, y, w, h, fn) => {
            const d = await page.evaluate(([x, y, w, h]) => Array.from(document.querySelector('canvas').getContext('2d').getImageData(x, y, w, h).data), [x, y, w, h])
            let n = 0
            for (let i = 0; i < d.length; i += 4) if (fn(d[i], d[i + 1], d[i + 2])) n++
            return n
        }
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
        const cookState = () => page.evaluate(() => { const c = window.__sosTest.state().cooks[0]; return { x: c.x, y: c.y, face: c.face, holding: c.holding } })
        // hold a direction until the sim CONFIRMS the move: a software-rendered
        // box runs ticks behind the page, and fixed sleeps race stale reads —
        // same law that makes the CPU emitter hold presses until they land.
        const nudge = async (key, pred) => {
            for (let attempt = 0; attempt < 3; attempt++) {
                const before = await cookState()
                await page.keyboard.down(key)
                let moved = false
                for (let i = 0; i < 20 && !moved; i++) { await sleep(30); moved = pred(await cookState(), before) }
                await page.keyboard.up(key)
                await sleep(40)
                if (moved) return
            }
        }
        const waitTicks = async (n) => {
            const t0 = await page.evaluate(() => window.__sosTest.probe().tick)
            for (let i = 0; i < 60; i++) {
                const t = await page.evaluate(() => window.__sosTest.probe().tick)
                if (t - t0 >= n) return true
                await sleep(50)
            }
            return false
        }
        await page.evaluate(() => window.__sosTest.start(7, 2))
        await page.waitForFunction("window.__sosTest.screen() === 'play'")
        ok('#2079 fresh boot ticks before the drill runs', await waitTicks(8))
        await page.evaluate(() => window.__sosTest.radioRig(true))
        // walk the cooler route WHILE busy: feet legal, until (1,1) facing up
        let atCooler = false
        for (let i = 0; i < 16 && !atCooler; i++) {
            const c = await cookState()
            if (c.x === 1 && c.y === 1 && c.face === 'up') atCooler = true
            else if (c.y > 1) await nudge('ArrowUp', (n, b) => n.y !== b.y || n.face !== b.face)
            else if (c.x > 1) await nudge('ArrowLeft', (n, b) => n.x !== b.x || n.face !== b.face)
            else if (c.x < 1) await nudge('ArrowRight', (n, b) => n.x !== b.x || n.face !== b.face) // starved catch-up overshot — step back
            else await nudge('ArrowUp', (n, b) => n.face !== b.face || n.y !== b.y) // bump to face the cooler
        }
        const wp = await cookState()
        ok('#2079 the rig keys the radio busy', await page.evaluate(() => window.__sosTest.radio().busy === true))
        ok('#2079 talking never stops the feet (walked the route mid-take)', wp.x === 1 && wp.y === 1 && wp.face === 'up', JSON.stringify(wp))
        // hammer A — refused: deny lights (retry in case a press starves), and
        // no grab lands while the radio is busy
        let denySeen = 0
        for (let i = 0; i < 3 && !denySeen; i++) {
            await page.keyboard.press('Space')
            for (let j = 0; j < 8 && !denySeen; j++) { await sleep(40); denySeen = await page.evaluate(() => window.__sosTest.radio().deny) }
        }
        ok('#2079 a held radio refuses the grab', denySeen > 0 && (await cookState()).holding === null, `deny=${denySeen}`)
        // ON AIR amber blinks at ~150ms — sample across the busy window
        let amber = 0
        for (let i = 0; i < 8; i++) { await sleep(40); amber = Math.max(amber, await band(150, 200, 64, 14, (r, g, b) => r > 230 && g > 170 && b < 110)) }
        ok('#2079 the strip lights ON AIR while busy', amber > 8, `amber px=${amber}`)
        // the chip blink alternates every 4 ticks — watch the WHOLE deny
        // countdown for a red frame (max over frames, never one fixed instant)
        await page.keyboard.press('Space') // refresh the refuse if it decayed
        let red = 0
        for (let guard = 0; guard < 40; guard++) {
            const deny = await page.evaluate(() => window.__sosTest.radio().deny)
            if (!deny) break
            red = Math.max(red, await band(299, 200, 21, 24, (r, g, b) => r > 220 && g < 95 && b < 75)) // refuse ring
            await sleep(25)
        }
        ok('#2079 the mic chip blinks red on refusal', red > 6, `red px=${red}`)
        // hands back: clear the rig, same press grabs (cook still at the cooler)
        await page.evaluate(() => window.__sosTest.radioRig(false))
        let held = null
        for (let i = 0; i < 3 && !held; i++) {
            await page.keyboard.press('Space')
            for (let j = 0; j < 10 && !held; j++) { await sleep(50); held = (await cookState()).holding }
        }
        ok('#2079 hands return the tick the radio frees', !!held, `holding=${held}`)
        // the line answers: a landed take gets COPY, a click gets nothing
        ok('#2079 a click gets no answer', await page.evaluate(() => { window.__sosTest.radioSay(100); return Object.keys(window.__sosTest.radio().acks).length === 0 }))
        ok('#2079 the CPU line answers a real take', await page.evaluate(() => { window.__sosTest.radioSay(500); const a = window.__sosTest.radio().acks; return (a['1'] | 0) > 0 }))
        await page.evaluate(() => window.__sosTest.start(7, 1))
        await page.waitForFunction("window.__sosTest.screen() === 'play'")
        ok('#2079 solo with nobody to answer stays quiet', await page.evaluate(() => { window.__sosTest.radioSay(500); return Object.keys(window.__sosTest.radio().acks).length === 0 }))
        await page.evaluate(() => window.__sosTest.radioRig(false))
    }
    ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
    await browser.close()
}

console.log(`\nsoscheck: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
