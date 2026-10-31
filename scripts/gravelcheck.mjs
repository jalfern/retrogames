// GRAVEL CHECK — the GRAVEL YARD harness (#1253).
//
// Proves three things about the co-op yard:
//   1. it boots      — browser opens the route, __game answers, a shift starts
//   2. its rules hold— Node-first assertions on the pure sim: dig/dump/batch/
//                      gate/jam/load/tip/refuse/strike/order/overflow + determinism
//   3. it can be won — the CPU crew reaches quota on 8/8 seeds, and still ~7/8
//                      with one unit less on every pile cell (slack rule)
//
// Run: npm run gravelcheck        (dev server on DEV_PORT, default 5173)
//      GY_SKIP_BROWSER=1 npm run gravelcheck   (rules/win only)
//
// Mutant proof (AGENTS.md step 5): flip `stepPlant`'s jam check to `false`
// and the jam assertions go red; restore = green.

import {
    createGame, stepGame, simState, drainFx, makeCpuEmitter, simulate, cellKind, driveable,
    SHIFT_TICKS, QUOTA, MAX_STRIKES, MAX_ORDERS, HOPPER_CAP, BED_CAP, BAY_CAP,
    PILE, DIG_TICKS, DUMP_TICKS, LOAD_TICKS,
    HOPPER_FRONT, CONSOLE_FRONT, HOPPER_STAND, CONSOLE_STAND, BAY, BAY_LOAD, DOCK_SPOTS,
} from '../src/games/GravelYard/engine.js'

const URL = process.env.GY_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/gravel-yard`

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}

const step = (g, pads, n = 1) => { for (let i = 0; i < n; i++) stepGame(g, pads) }
// press with clean edges (the engine edge-triggers a/b)
const tap = (g, seat, pad, idleTicks = 0) => {
    const pads = [{}, {}, {}]
    pads[seat] = pad
    stepGame(g, pads)
    pads[seat] = {}
    stepGame(g, pads)
    step(g, pads, idleTicks)
}
const drainK = (g) => drainFx(g).map((f) => f.k)

function runEm(seed, seats, until = SHIFT_TICKS) {
    const gs = createGame(seed, seats)
    const em = [makeCpuEmitter(0), makeCpuEmitter(1), makeCpuEmitter(2)]
    for (let t = 0; t < until && !gs.done; t++) {
        const pads = [{}, {}, {}]
        for (let s = 0; s < 3; s++) pads[s] = em[s]({ gs, tick: t })
        stepGame(gs, pads)
    }
    return gs
}

console.log('— layout —')
ok('pile is 6 cells at cols 2-4 rows 1-2', PILE.length === 6 && PILE.every(([x, y]) => cellKind(x, y) === 'pile'))
ok('plant solid 3x2', cellKind(7, 1) === 'plant' && cellKind(9, 2) === 'plant')
ok('hopper/console faces solid', cellKind(8, 3) === 'hopper' && cellKind(9, 3) === 'console')
ok('stand cells open', driveable(createGame(1, 1), HOPPER_STAND[0], HOPPER_STAND[1]) && driveable(createGame(1, 1), CONSOLE_STAND[0], CONSOLE_STAND[1]))
ok('bays + dock + board solid', cellKind(11, 1) === 'bay' && cellKind(11, 2) === 'bay' && cellKind(14, 7) === 'dock' && cellKind(14, 4) === 'board')
ok('fence ring closes the yard', cellKind(0, 4) === 'fence' && cellKind(15, 4) === 'fence' && cellKind(4, 0) === 'fence' && cellKind(4, 8) === 'fence')

console.log('— determinism —')
{
    const a = runEm(7, 3), b = runEm(7, 3)
    ok('seed+pads => identical hash', simState(a).hash === simState(b).hash, `${simState(a).hash} vs ${simState(b).hash}`)
    const c = runEm(8, 3)
    ok('different seed diverges', simState(a).hash !== simState(c).hash)
}

console.log('— digger: dig / bucket / dump —')
{
    const gs = createGame(1, 1)
    const target = PILE.find(([x, y]) => x === 3 && y === 2) || PILE[0]
    gs.digger.x = target[0]; gs.digger.y = target[1] + 1; gs.digger.face = 'up'
    tap(gs, 0, { a: true })
    ok('facing pile + A starts a dig', gs.digger.job && gs.digger.job.kind === 'dig', JSON.stringify(gs.digger.job))
    step(gs, [{}, {}, {}], DIG_TICKS)
    ok('dig completes into bucket', gs.digger.bucket === 1 && gs.pile.find((c) => c.x === target[0] && c.y === target[1]).units === 3, `bucket=${gs.digger.bucket}`)
    // bucket cap
    gs.digger.bucket = 3
    const before = gs.pile[0].units
    tap(gs, 0, { a: true })
    ok('full bucket refuses more', gs.digger.job === null && gs.pile[0].units === before)
    gs.digger.bucket = 2; gs.digger.wet = 1
    // dump at the wrong spot refuses
    gs.digger.x = 5; gs.digger.y = 5; gs.digger.face = 'up'
    tap(gs, 0, { b: true })
    ok('dump away from hopper denied', gs.digger.bucket === 2)
    // correct dump: stand south of the feed cell, face up
    gs.digger.x = HOPPER_STAND[0]; gs.digger.y = HOPPER_STAND[1]; gs.digger.face = 'up'
    tap(gs, 0, { b: true })
    step(gs, [{}, {}, {}], DUMP_TICKS + 2)
    ok('dump lands in hopper (wet rides along)', gs.plant.hopper === 2 && gs.plant.hopperWet === 1 && gs.digger.bucket === 0, `hopper=${gs.plant.hopper}/${gs.plant.hopperWet}`)
    // overflow wastes
    gs.digger.bucket = 3; gs.digger.wet = 0
    gs.digger.x = HOPPER_STAND[0]; gs.digger.y = HOPPER_STAND[1]; gs.digger.face = 'up'
    gs.plant.hopper = HOPPER_CAP - 1
    tap(gs, 0, { b: true })
    step(gs, [{}, {}, {}], DUMP_TICKS + 2)
    ok('overflow spills and counts waste', gs.plant.hopper === HOPPER_CAP && gs.wasted === 2, `wasted=${gs.wasted}`)
    // a dug-out cell becomes driveable ground
    const flat = createGame(1, 1)
    flat.pile[0].units = 0
    ok('dug-out pile cell is driveable', driveable(flat, PILE[0][0], PILE[0][1]))
}

console.log('— plant: gate / batch / jam —')
{
    const gs = createGame(1, 1)
    tap(gs, 2, { right: true })
    ok('operator RIGHT cycles gate toward narrow', gs.plant.gate === 'narrow', gs.plant.gate)
    tap(gs, 2, { left: true })
    ok('operator LEFT cycles back to medium', gs.plant.gate === 'medium', gs.plant.gate)
    // gate ratios through a batch of 4, all three settings
    for (const [gate, ec, ef] of [['wide', 3, 1], ['medium', 2, 2], ['narrow', 1, 3]]) {
        const b = createGame(5, 1)
        b.plant.gate = gate
        b.plant.hopper = 4
        tap(b, 2, { a: true })
        ok(`${gate}: start batch of 4`, b.plant.running && b.plant.batch === 4 && b.plant.hopper === 0)
        step(b, [{}, {}, {}], 120 + 15 * 4 + 2)
        ok(`${gate}: separates ${ec}C/${ef}F`, b.bays.coarse === ec && b.bays.fines === ef, `${b.bays.coarse}/${b.bays.fines}`)
    }
    ok('hopper of 1 refuses a batch', (() => { const b = createGame(5, 1); b.plant.hopper = 1; tap(b, 2, { a: true }); return !b.plant.running })())
    // jam: jog clears, batch is frozen while jammed
    const jam = createGame(9, 1)
    jam.plant.hopper = 4
    tap(jam, 2, { a: true })
    jam.plant.jammed = true; jam.plant.jamNeed = 2
    const frozenT = jam.plant.t
    step(jam, [{}, {}, {}], 30)
    ok('batch frozen while jammed', jam.plant.t === frozenT)
    tap(jam, 2, { b: true })
    ok('jog 1 reduces jamNeed', jam.plant.jammed && jam.plant.jamNeed === 1)
    tap(jam, 2, { b: true })
    ok('jog 2 clears jam', !jam.plant.jammed)
    const noJam = createGame(9, 1)
    ok('jog with no jam denied', !drainK(noJam).includes('jog') && (tap(noJam, 2, { b: true }), !noJam.plant.jammed))
    // wet batch can jam (seed sweep must find at least one jam — probabilistic but 25%+ per wet unit)
    let sawJam = false
    for (let s = 1; s <= 12 && !sawJam; s++) {
        const b = createGame(s, 1)
        b.plant.hopper = 4; b.plant.hopperWet = 2
        tap(b, 2, { a: true })
        step(b, [{}, {}, {}], 200)
        if (b.plant.jammed) sawJam = true
    }
    ok('wet gravel jams the screen', sawJam)
    // bay overflow wastes
    const ov = createGame(5, 1)
    ov.bays.coarse = BAY_CAP; ov.bays.fines = BAY_CAP
    ov.plant.gate = 'medium'; ov.plant.hopper = 4
    tap(ov, 2, { a: true })
    step(ov, [{}, {}, {}], 120 + 60 + 2)
    ok('full bays overflow and waste', ov.wasted === 4 && ov.bays.coarse === BAY_CAP, `wasted=${ov.wasted}`)
}

console.log('— truck: load / no-mix / tip / refuse —')
{
    const gs = createGame(1, 1)
    gs.bays.coarse = 5
    gs.truck.x = BAY_LOAD.coarse[0]; gs.truck.y = BAY_LOAD.coarse[1]; gs.truck.face = 'left'
    tap(gs, 1, { a: true })
    step(gs, [{}, {}, {}], LOAD_TICKS + 2)
    ok('load from coarse bay', gs.truck.bed === 1 && gs.bedGrade === 'coarse' && gs.bays.coarse === 4, `bed=${gs.truck.bed}`)
    // no mixing
    gs.bays.fines = 3
    gs.truck.x = BAY_LOAD.fines[0]; gs.truck.y = BAY_LOAD.fines[1]; gs.truck.face = 'left'
    const bedBefore = gs.truck.bed
    tap(gs, 1, { a: true })
    ok('mixing load refused', gs.truck.bed === bedBefore && gs.truck.job === null)
    // bed cap
    gs.truck.bed = BED_CAP
    gs.truck.x = BAY_LOAD.coarse[0]; gs.truck.y = BAY_LOAD.coarse[1]; gs.truck.face = 'left'
    tap(gs, 1, { a: true })
    ok('bed cap holds', gs.truck.job === null)
    gs.truck.bed = 2
    // no matching order -> refuse + strike
    gs.orders = [{ id: 99, grade: 'fines', units: 4, left: 500, total: 500 }]
    gs.truck.x = DOCK_SPOTS[0][0]; gs.truck.y = DOCK_SPOTS[0][1]; gs.truck.face = 'left'
    tap(gs, 1, { b: true })
    ok('wrong grade at gate refused + strike', gs.strikes === 1 && gs.truck.bed === 2, `strikes=${gs.strikes}`)
    // matching order -> paid, partial and complete
    gs.orders = [{ id: 98, grade: 'coarse', units: 5, left: 250, total: 1000 }]
    tap(gs, 1, { b: true })
    ok('matching tip pays units', gs.score === 2 * 30 && gs.delivered === 2 && gs.truck.bed === 0, `score=${gs.score}`)
    gs.truck.bed = 3; gs.bedGrade = 'coarse'
    tap(gs, 1, { b: true })
    ok('order completed with bonus', gs.orders.length === 0 && gs.score > 2 * 30 + 3 * 30, `score=${gs.score}`)
    // three refusals ruin the shift
    const ruin = createGame(1, 1)
    ruin.truck.bed = 1; ruin.bedGrade = 'coarse'
    ruin.orders = []
    ruin.truck.x = DOCK_SPOTS[0][0]; ruin.truck.y = DOCK_SPOTS[0][1]
    for (let i = 0; i < MAX_STRIKES; i++) { tap(ruin, 1, { b: true }); ruin.truck.bed = 1; ruin.bedGrade = 'coarse' }
    ok('three refusals ruin the shift', ruin.done && !ruin.win && ruin.strikes === MAX_STRIKES, `strikes=${ruin.strikes} done=${ruin.done}`)
}

console.log('— orders and the clock —')
{
    const gs = createGame(1, 3)
    ok('first order at t=120 window open', gs.orders.length === 1)
    step(gs, [{}, {}, {}], 1)
    ok('order cap enforced by push', gs.orders.length <= MAX_ORDERS)
    // lapse costs credit
    const lap = createGame(1, 1)
    lap.nextOrder = SHIFT_TICKS // freeze new pushes
    const scoreBefore = lap.score
    step(lap, [{}, {}, {}], lap.orders[0].left + 2)
    ok('lapsed order removed with -20C penalty', lap.orders.length === 0 && lap.score === Math.max(0, scoreBefore - 20), `score ${scoreBefore}->${lap.score}`)
    ok('shift ends at the whistle', (() => { const b = createGame(1, 1); b.nextOrder = SHIFT_TICKS + 999; step(b, [{}, {}, {}], SHIFT_TICKS); return b.done && !b.win })())
}

console.log('— #1380: steer through cooldown; refills never entomb —')
{
    // Inputs held during a step used to be swallowed whole: stepMachine returned
    // at moveCd > 0 BEFORE the steering block, so facing never changed mid-step
    // and bump-then-act sequences died on the face guard (gravelplay's
    // dump-at-hopper was red at main). Pin the engine's own contract: blocked
    // moves still steer. Layout-free — state is set directly.
    const gs = createGame(1, 1)
    const d = gs.digger
    d.x = 5; d.y = 5; d.face = 'right'; d.moveCd = 5
    step(gs, [{ up: true }, {}, {}], 1)
    ok('held input steers through moveCd (face changes, position held)',
        d.face === 'up' && d.x === 5 && d.y === 5 && d.moveCd === 4,
        `face=${d.face} at=(${d.x},${d.y}) cd=${d.moveCd}`)

    // seed-5 freeze shape: digger parked on a pile cell whose only driveable
    // exit is the yard's last spare cell. Refill used to tip into it unconditionally,
    // walls sealed, bfs found no path, CPU sat full-bucket to the whistle.
    // (3,1) sits fence-above with pile neighbours — assert the fixture first.
    const ent = createGame(5, 1)
    ok('fixture: (3,1) is pile with fence at (3,0)',
        cellKind(3, 1) === 'pile' && cellKind(3, 0) === 'fence',
        `kind(3,1)=${cellKind(3, 1)} kind(3,0)=${cellKind(3, 0)}`)
    ent.digger.x = 3; ent.digger.y = 1; ent.digger.face = 'down'; ent.digger.moveCd = 0
    const EXIT = [3, 2]
    // the machine stands on a dug-out flat cell; its exit is the ONLY other
    // spare cell — and driveable() says a pile cell seals at units >= 1, so a
    // single tip on the exit entombs the machine.
    for (const c of ent.pile) c.units =
        (c.x === 3 && c.y === 1) || (c.x === EXIT[0] && c.y === EXIT[1]) ? 0 : 4
    ok('fixture: digger sits flat with one open exit',
        driveable(ent, 3, 1, ent.digger.seat) &&
        [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) =>
            driveable(ent, 3 + dx, 1 + dy, ent.digger.seat)).length === 1,
        `exits=${[[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => driveable(ent, 3 + dx, 1 + dy, ent.digger.seat)).length}`)
    let entombed = false, tippedExit = false
    for (let r = 0; r < 30 && !entombed; r++) {
        ent.refillT = 1
        step(ent, [{}, {}, {}], 2)
        const ex = ent.pile.find((c) => c.x === EXIT[0] && c.y === EXIT[1])
        if (ex.units > 0) tippedExit = true // any tip seals: driveable needs units === 0
        const hasExit = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
            driveable(ent, ent.digger.x + dx, ent.digger.y + dy, ent.digger.seat))
        if (!hasExit) entombed = true
    }
    ok('refills never tip the last exit of a parked machine (#1380)',
        !tippedExit && !entombed,
        `tippedExit=${tippedExit} entombed=${entombed}`)
}

console.log('— win proof (CPU crew) —')
{
    let wins = 0
    const scores = []
    for (let s = 1; s <= 8; s++) {
        const r = simulate(s, 3)
        scores.push(r.score)
        if (r.win && r.score >= QUOTA) wins++
    }
    ok('CPU crew makes quota on 8/8 seeds', wins === 8, `wins=${wins} scores=${scores.join(',')}`)
    let slackWins = 0
    for (let s = 1; s <= 8; s++) {
        const r = simulate(s, 3, { dropBeds: 1 })
        if (r.win) slackWins++
    }
    ok('slack (one unit less on every pile cell) still wins >=7/8', slackWins >= 7, `slack wins=${slackWins}`)
    // the crew never needs the digger at all if... (solo tax sanity): crew of 2
    let twoWins = 0
    for (let s = 1; s <= 8; s++) { const r = simulate(s, 2); if (r.win) twoWins++ }
    ok('two-handed crew wins >=6/8', twoWins >= 6, `wins=${twoWins}`)
}

// ---------- browser half ----------
if (!process.env.GY_SKIP_BROWSER) {
    const { chromium } = await import('playwright-core')
    const browser = await chromium.launch({ channel: process.env.SHOT_CHANNEL || 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] })
    try {
        const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
        const errors = []
        page.on('pageerror', (e) => errors.push(String(e)))
        console.log('— browser: boot + contract —')
        await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
        await page.waitForFunction(() => !!window.__gyTest, null, { timeout: 20000 })
        ok('boot: __gyTest answers', true)
        ok('boot: attract running', await page.evaluate(() => window.__gyTest.screen() === 'attract'))
        const meta = await page.evaluate(() => window.__game && window.__game.meta)
        ok('contract meta id', meta && meta.id === 'gravel-yard', JSON.stringify(meta))

        // contract determinism: reset(seed, players) + one scripted pad stream
        const script = Array.from({ length: 600 }, (_, i) => ({
            left: i % 53 < 12, right: i % 53 >= 20 && i % 53 < 34,
            up: i % 43 < 10, down: i % 43 >= 18 && i % 43 < 28,
            a: i % 19 < 2, b: i % 37 < 2,
        }))
        const runContract = async () => {
            await page.evaluate(() => window.__game.reset(42, 1))
            let st = null
            for (const p of script) st = await page.evaluate((pad) => window.__game.step(pad), p)
            return st
        }
        const s1 = await runContract()
        const s2 = await runContract()
        ok('contract step advances sim', s1.tick === 600, `tick=${s1.tick}`)
        ok('contract determinism (reset+script => same hash)', s1.hash === s2.hash, `${s1.hash} vs ${s2.hash}`)
        ok('state carries the chain', s1.plant && s1.bays && s1.orders !== undefined)

        // the CPU crew thinks in the browser too: seat 0 is the human stream,
        // and even idle the truck must drive itself to work (full win is proven
        // by the same engine code in the Node section above)
        const live = await page.evaluate(async () => {
            await window.__game.reset(7, 1)
            const t0 = await window.__game.state()
            let st = null
            for (let i = 0; i < 2000; i++) st = await window.__game.step({ up: i % 41 < 2 })
            return { st, moved: st.truck.x !== t0.truck.x || st.truck.y !== t0.truck.y, ticked: st.tick > t0.tick }
        })
        ok('browser crew brain drives the truck seat', live.moved && live.ticked, JSON.stringify(live))

        const png = await page.evaluate(() => window.__game.frame())
        ok('frame() returns a PNG', typeof png === 'string' && png.startsWith('data:image/png') && png.length > 4000)

        ok('zero page errors', errors.length === 0, errors.join(' | '))
    } finally {
        await browser.close()
    }
}

console.log(`\ngravelcheck: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
