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
    digSwingFrame, tipSeqFrame, TIP_TICKS,
} from '../src/games/GravelYard/engine.js'
import { createLockStep } from '../src/utils/lockstep.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    SEATS, PAD_DELAY, HASH_EVERY, padMask, unmaskPad, wirePad, padsAt, seatOf, seatKinds, hostSeed,
} from '../src/games/GravelYard/net.js'

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

console.log('— #1306: diesel drone cadence, radio voice ID, cents payout —')
{
    // Audio juice rides on fx, so its SCHEDULING must be deterministic even
    // though fx never enters the hash. Mutant proof: delete the `drone` push
    // in stepGame and the cadence assertion goes red; neuter tip()'s cents and
    // the payout assertion goes red.
    const gs = createGame(1, 1)
    step(gs, [{}, {}, {}], 600)
    const drones = drainFx(gs).filter((f) => f.k === 'drone')
    ok('diesel drone cadences every 48 ticks',
        drones.length === Math.floor(600 / 48) && drones.every((f, i) => f.tick === (i + 1) * 48),
        `n=${drones.length} first=${drones[0] && drones[0].tick}`)

    // every radio callout carries a seat who; content matches the seat
    const rgs = runEm(7, 3, 3000)
    const radios = drainFx(rgs).filter((f) => f.k === 'radio') // latest 40, enough coverage
    const WHOS = new Set(['TRUCK', 'SCREEN', 'DIGGER', 'BOARD'])
    ok('radio callouts all carry a seat who', radios.length > 0 && radios.every((f) => WHOS.has(f.who) && f.text),
        `n=${radios.length} who=${radios[0] && radios[0].who}`)
    ok('radio content is said by the right seat', radios.every((f) =>
        !/JAM/.test(f.text) || f.who === 'SCREEN') && radios.every((f) => !/ORDER/.test(f.text) || f.who === 'TRUCK'))

    // order completion reports the full payout for the cents ticker
    const gs3 = createGame(1, 1)
    gs3.orders = [{ id: 77, grade: 'coarse', units: 2, left: 1000, total: 1000 }]
    gs3.truck.bed = 2; gs3.bedGrade = 'coarse'
    gs3.truck.x = DOCK_SPOTS[0][0]; gs3.truck.y = DOCK_SPOTS[0][1]; gs3.truck.face = 'left'
    tap(gs3, 1, { b: true })
    const done = drainFx(gs3).find((f) => f.k === 'orderDone')
    ok('orderDone fx carries cents = units*rate + bonus', !!done && done.cents === 2 * 30 + 40, JSON.stringify(done))
}

console.log('— #1390: boom swing + bed tip frame mappers —')
{
    // the renderer indexes S.diggerDig/S.truckTip through these pure mappers,
    // so their coverage is provable in Node. Mutant: pin digSwingFrame to 0
    // and the swing assertion goes red; pin tipSeqFrame below 2 and the tip
    // assertion goes red.
    const swing = []
    for (let t = DIG_TICKS - 1; t > 0; t--) swing.push(digSwingFrame(t))
    ok('boom swing covers 4 frames across a dig', new Set(swing).size === 4 && swing[0] === 0 && swing[swing.length - 1] === 3,
        `n=${new Set(swing).size}`)
    const seq = []
    for (let age = 0; age < TIP_TICKS; age++) seq.push(tipSeqFrame(age))
    ok('bed tip raises to frame 2 and comes back down',
        Math.max(...seq) === 2 && seq[0] === 0 && seq[seq.length - 1] === 0 && seq.join(',') === '0,0,0,0,1,1,1,1,2,2,2,2,2,2,2,2,1,1,1,1,0,0,0,0',
        seq.join(','))
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

// ---------- #1672 lobby seats: twin-box lockstep proof (pure Node) ----------
{
    ok('#1705 roster: three lobby seats (digger, truck, operator)', SEATS === 3)
    ok('#1672 seat law: host drives the digger (0), first joiner the truck (1)',
        seatOf('host') === 0 && seatOf('guest') === 1)
    ok('#1705 seat law completes: slot IS seat — second joiner runs the console (2)',
        seatOf('guest', 2) === 2)
    const kindsH = seatKinds('host'), kindsG = seatKinds('guest')
    ok('#1672 contract rows: own seat human, peer seat remote, operator cpu — offline none',
        kindsH[0].kind === 'human' && kindsH[1].kind === 'remote' && kindsH[2].kind === 'cpu' &&
        kindsG[0].kind === 'remote' && kindsG[1].kind === 'human' && kindsG[2].kind === 'cpu' &&
        seatKinds('solo') === null)
    const kinds3 = seatKinds('guest', [0, 1, 2], 2)
    ok('#1705 roster-driven rows: a live third seat reads remote to everyone else',
        kinds3[0].kind === 'remote' && kinds3[1].kind === 'remote' && kinds3[2].kind === 'human' &&
        seatKinds('host', [0, 1], 0)[2].kind === 'cpu')
    let rt = true
    for (let m = 0; m < 64; m++) if (padMask(unmaskPad(m)) !== m) rt = false
    ok('#1672 the six pad fields round-trip through the wire mask (all 64 states)', rt)
    ok('#1672 hostSeed never returns zero', hostSeed(() => 0) !== 0 && hostSeed(() => 999999) !== 0)

    const twin = (role, seed) => {
        const gs = createGame(seed, 2)
        const mirrors = [new Map(), new Map()]
        const out = []
        const ls = createLockStep({
            delay: PAD_DELAY,
            hashEvery: HASH_EVERY,
            send: (m) => { if (m.t === 'pad') mirrors[role === 'host' ? 0 : 1].set(m.k, m.p); out.push(m) },
        })
        return { gs, ls, mirrors, out, em: makeCpuEmitter(2), desync: false }
    }
    const deliver = (dst, seat, m) => {
        if (m.t === 'pad') { dst.mirrors[seat].set(m.k, m.p); dst.ls.gotPad(m.k, m.p) }
        else if (m.t === 'hs') { const r = dst.ls.gotHash(m.k, m.h); if (r && r.desync !== undefined) dst.desync = true }
    }
    // twinRun drives both boxes tick by tick over an in-memory relay: either
    // box may only run tick k when BOTH hold every pad for k (lockstep in
    // action — nobody ever runs half a shared moment).
    const twinRun = ({ seed = 777, ticks = 200, hostPad, guestPad, dropWin = null, corrupt = null }) => {
        const H = twin('host', seed), G = twin('guest', seed)
        const ref = createGame(seed, 2); const refEm = makeCpuEmitter(2)
        let desync = false, refMismatch = false, skipped = 0
        for (let k = 0; k < ticks; k++) {
            H.ls.pumpTo(k + PAD_DELAY, () => wirePad(hostPad(k)))
            G.ls.pumpTo(k + PAD_DELAY, () => wirePad(guestPad(k)))
            const hOut = H.out.splice(0), gOut = G.out.splice(0)
            const dropped = (seat, kk) => !!(dropWin && kk >= dropWin[0] && kk < dropWin[1])
            for (const m of hOut) if (!dropped(0, m.k)) deliver(G, 0, m)
            for (const m of gOut) if (!dropped(1, m.k)) deliver(H, 1, m)
            if (!H.ls.ready(k) || !G.ls.ready(k)) { skipped++; continue }
            if (corrupt && k >= corrupt[0] && k < corrupt[1]) H.mirrors[0].set(k, { m: (((H.mirrors[0].get(k) || {}).m | 0) | 8 | 16) })
            const pH = padsAt(H.mirrors, k); pH[2] = H.em({ gs: H.gs, tick: H.gs.tick })
            const pG = padsAt(G.mirrors, k); pG[2] = G.em({ gs: G.gs, tick: G.gs.tick })
            stepGame(H.gs, pH); stepGame(G.gs, pG)
            const pR = padsAt(H.mirrors, k); pR[2] = refEm({ gs: ref, tick: ref.tick })
            stepGame(ref, pR)
            if (H.gs.tick % HASH_EVERY === 0) {
                const rk = H.gs.tick
                const rh = H.ls.hash(rk, simState(H.gs).hash)
                const rg = G.ls.hash(rk, simState(G.gs).hash)
                if ((rh && rh.desync !== undefined) || (rg && rg.desync !== undefined) || H.desync || G.desync) desync = true
                if (simState(H.gs).hash !== simState(ref).hash || simState(G.gs).hash !== simState(ref).hash) refMismatch = true
            }
        }
        return { H, G, desync: desync || H.desync || G.desync, refMismatch, skipped }
    }
    const hostPad = (k) => ({ right: k < 40, left: k >= 40 && k < 80, a: k % 30 < 4 })
    const guestPad = (k) => ({ left: k % 20 < 10, up: k % 50 < 6, b: k % 37 < 3 })

    const clean = twinRun({ hostPad, guestPad })
    ok('#1672 twin boxes executing one seed + pad streams stay hash-equal (200 ticks)',
        !clean.desync && !clean.refMismatch && clean.H.gs.tick === 200 && clean.G.gs.tick === 200,
        `tick ${clean.H.gs.tick}/${clean.G.gs.tick}`)
    ok('#1672 the shift actually ran (deterministic sim, not a frozen pair)',
        clean.H.gs.tick === 200 && simState(clean.H.gs) !== null)
    // #1705 honesty retrofit: these twin gates were pad-blind while the wire
    // normalizer erased the yard's mask field (padsAt saw empty pads and the
    // hashes agreed VACUOUSLY). normalizeWirePad now passes {m}; pin movement
    // so that class of green can never come back.
    ok('#1705 twin pads are not empty: the digger actually drove on the wire pad',
        clean.H.gs.digger.x > 3 && clean.G.gs.digger.x > 3,
        `H x ${clean.H.gs.digger.x.toFixed(1)} G x ${clean.G.gs.digger.x.toFixed(1)}`)

    const stalled = twinRun({ hostPad, guestPad, dropWin: [50, 70] })
    ok('#1672 a lost pad window makes BOTH boxes wait the same ticks — nobody runs half a moment',
        stalled.H.gs.tick === stalled.G.gs.tick && stalled.H.gs.tick === 200 - 20 && !stalled.desync && !stalled.refMismatch,
        `ticks ${stalled.H.gs.tick}/${stalled.G.gs.tick} skipped ${stalled.skipped}`)

    const broken = twinRun({ hostPad, guestPad, corrupt: [100, 112] })
    ok('#1672 divergent streams are CAUGHT at the hash boundary (the referee works)',
        broken.desync === true)

    // determinism of the whole replay: same seed + same scripts => same hash,
    // twice over — the join-later story needs the stream to be re-executable.
    const again = twinRun({ hostPad, guestPad })
    ok('#1672 the exchange is replayable: same seed + scripts => identical final hash',
        simState(again.H.gs).hash === simState(clean.H.gs).hash,
        `${simState(again.H.gs).hash} vs ${simState(clean.H.gs).hash}`)
}

// ---------- #1705 three-seat proof: the operator joins the room (pure Node) ----------
{
    const box = (seed, seat) => {
        const gs = createGame(seed, 3)
        const mirrors = [new Map(), new Map(), new Map()]
        const out = []
        const ls = createLockStep({
            delay: PAD_DELAY,
            hashEvery: HASH_EVERY,
            send: (m) => { if (m.t === 'pad') mirrors[seat].set(m.k, m.p); out.push(m) },
        })
        ls.setPeers([0, 1, 2].filter((s) => s !== seat))
        return { seat, gs, ls, mirrors, out, desync: false }
    }
    const relayTo = (dst, seat, m) => {
        if (m.t === 'pad') { dst.mirrors[seat].set(m.k, m.p); dst.ls.gotPad(m.k, m.p, seat) }
        else if (m.t === 'hs') { const r = dst.ls.gotHash(m.k, m.h, seat); if (r && r.desync !== undefined) dst.desync = true }
    }
    const tripleRun = ({ seed = 90210, ticks = 240, pads = [() => ({}), () => ({}), () => ({})], drop = null, corrupt = null }) => {
        const B = [0, 1, 2].map((s) => box(seed, s))
        const ref = createGame(seed, 3)
        let desync = false, refMismatch = false, skipped = 0, gateChanges = 0
        let lastGate = ref.plant.gate
        for (let k = 0; k < ticks; k++) {
            for (const s of [0, 1, 2]) B[s].ls.pumpTo(k + PAD_DELAY, () => wirePad(pads[s](k)))
            const dropped = (seat, kk) => !!(drop && seat === drop[0] && kk >= drop[1] && kk < drop[2])
            for (const s of [0, 1, 2]) {
                const q = B[s].out.splice(0)
                for (const m of q) if (!dropped(s, m.k)) for (const d of B) if (d.seat !== s) relayTo(d, s, m)
            }
            if (!B.every((b) => b.ls.ready(k))) { skipped++; continue }
            if (corrupt && k >= corrupt[0] && k < corrupt[1]) B[0].mirrors[corrupt[2]].set(k, { m: (((B[0].mirrors[corrupt[2]].get(k) || {}).m | 0) | 8 | 16) })
            const pR = padsAt(B[0].mirrors, k)
            stepGame(ref, pR)
            if (ref.plant.gate !== lastGate) { gateChanges++; lastGate = ref.plant.gate }
            for (const b of B) stepGame(b.gs, padsAt(b.mirrors, k))
            if (k % HASH_EVERY === 0) {
                for (const b of B) { const r = b.ls.hash(k, simState(b.gs).hash); if (r && r.desync !== undefined) desync = true }
                const rh = simState(ref).hash
                for (const b of B) if (simState(b.gs).hash !== rh) refMismatch = true
            }
        }
        return { B, desync: desync || B.some((b) => b.desync), refMismatch, skipped, gateChanges }
    }
    const pDigger = (k) => ({ right: k < 40, left: k >= 40 && k < 80, a: k % 30 < 4 })
    const pTruck = (k) => ({ left: k % 20 < 10, up: k % 50 < 6, b: k % 37 < 3 })
    const pOperator = (k) => ({ right: k % 50 < 2 })

    const crew = tripleRun({ pads: [pDigger, pTruck, pOperator] })
    ok('#1705 three boxes, one seed + three pad streams: every hash boundary agrees (240 ticks)',
        !crew.desync && !crew.refMismatch && crew.B.every((b) => b.gs.tick === 240),
        `ticks ${crew.B.map((b) => b.gs.tick).join('/')} desync=${crew.desync} refMismatch=${crew.refMismatch}`)
    ok('#1705 the OPERATOR pad really moves the sim (gate cycled 5x from the wire)',
        crew.gateChanges === 5 && crew.B[0].gs.plant.gate === 'wide',
        `gate ${crew.B[0].gs.plant.gate} changes ${crew.gateChanges}`)
    ok('#1705 every seat is live: the digger drove on its remote pad too',
        crew.B[0].gs.digger.x > 3, `digger x ${crew.B[0].gs.digger.x.toFixed(1)}`)

    const lag = tripleRun({ pads: [pDigger, pTruck, pOperator], drop: [2, 60, 80] })
    ok('#1705 a lost OPERATOR pad window makes all three wait the same ticks — nobody runs half a moment',
        lag.B.every((b) => b.gs.tick === 220) && !lag.desync && !lag.refMismatch,
        `ticks ${lag.B.map((b) => b.gs.tick).join('/')} skipped ${lag.skipped}`)

    const bad = tripleRun({ pads: [pDigger, pTruck, pOperator], corrupt: [100, 112, 0] })
    ok('#1705 a divergent third box is CAUGHT at the hash boundary (the referee covers all peers)',
        bad.desync === true)

    const twice = tripleRun({ pads: [pDigger, pTruck, pOperator] })
    ok('#1705 the three-seat exchange is replayable: same seed + scripts => identical final hash',
        simState(twice.B[2].gs).hash === simState(crew.B[2].gs).hash,
        `${simState(twice.B[2].gs).hash} vs ${simState(crew.B[2].gs).hash}`)

    // The freeze fix, pinned at the source: the shipped wire handler must feed
    // lockstep itself. (gauntletcheck's source-pin pattern — the twin/triple
    // sims prove the design; this pins that index.jsx actually runs it.)
    const jsxSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'GravelYard', 'index.jsx'), 'utf8')
    ok('#1705 the pad wire feeds the lockstep gate in the shipped handler (the ready() freeze fix)',
        /pad: \(m\) => \{ const s = m\.s \| 0;[\s\S]*?ls\.gotPad\(m\.k \| 0, m\.p, s\)/.test(jsxSrc))
    ok('#1705 hash replies are refereed per peer slot',
        /hs: \(m\) => \{ const r = ls\.gotHash\(m\.k \| 0, m\.h >>> 0, m\.s \| 0\)/.test(jsxSrc))
}

// ---------- browser half ----------
if (!process.env.GY_SKIP_BROWSER) {
    const { launchChrome } = await import('./lib/chromeboot.mjs')
    const browser = await launchChrome({ channel: process.env.SHOT_CHANNEL || 'chrome', extraArgs: ['--autoplay-policy=no-user-gesture-required'] })
    try {
        const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
        const errors = []
        page.on('pageerror', (e) => errors.push(String(e)))
        console.log('— browser: boot + contract —')
        await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
        await page.waitForFunction(() => !!window.__gyTest, null, { timeout: 20000 })
        ok('boot: __gyTest answers', true)
        ok('boot: attract running', await page.evaluate(() => window.__gyTest.screen() === 'attract'))
        // #1390: attract sim is seeded near a pay-off (not standing empty at boot)
        const aTick = await page.evaluate(() => window.__gyTest.state().tick)
        ok('attract sim seeded past the first pay-off (tick >= 1100)', aTick >= 1100, `tick=${aTick}`)
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

        // ---------- #1390 render life: boom swing, bed tip, shaker ----------
        // dig job swings the boom through all four sprite frames
        const boomRun = await page.evaluate(() => {
            window.__gyTest.start(9, 1, false)
            window.__gyTest.prime('dig')
            const frames = []
            window.__game.step({ a: true })
            for (let i = 0; i < 44; i++) { window.__game.step({}); frames.push(window.__gyTest.anim().boom) }
            return frames
        })
        const mid = boomRun.filter((f) => f >= 0)
        ok('dig job swings the boom through 4 frames', new Set(mid).size === 4 && mid[0] === 0 && boomRun[boomRun.length - 1] === -1, JSON.stringify(boomRun))

        // bed tip: the CPU truck tips at the dock and the bed animates through
        // the raise cycle; bed pixels at rest vs at full raise must differ
        const tipRun = await page.evaluate(async () => {
            window.__gyTest.start(9, 1, false)
            const px = () => {
                const g = document.querySelector('canvas').getContext('2d')
                const d = g.getImageData(410, 268, 44, 30).data
                let h = 0
                for (let i = 0; i < d.length; i += 4) h = (Math.imul(h, 31) + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0
                return h
            }
            window.__gyTest.prime('tip')
            const hRest = px()
            let wired = false
            for (let i = 0; i < 120; i++) { window.__game.step({}); if (window.__gyTest.anim().tip >= 0) { wired = true; break } }
            if (!wired) return { wired: false }
            const up = await new Promise((res, rej) => {
                const t0 = performance.now()
                const iv = setInterval(() => {
                    const a = window.__gyTest.anim() // rAF draws decrement the cycle
                    if (a.tip === 2) { clearInterval(iv); res(a) }
                    else if (performance.now() - t0 > 3000) { clearInterval(iv); rej(new Error('bed never reached full raise')) }
                }, 16)
            })
            return { wired: true, peakTip: up.tip, hUp: px(), score: window.__gyTest.state().score }
        })
        ok('tip drives the bed through the raise cycle', tipRun.wired && tipRun.peakTip === 2 && tipRun.score > 0, JSON.stringify(tipRun))
        ok('tipping bed changes drawn pixels', typeof tipRun.hUp === 'number' && tipRun.hUp !== tipRun.hRest, `${tipRun.hUp} vs ${tipRun.hRest}`)

        // shaker life: stones while a batch runs, plume when it ends, smoke when jammed
        const shaker = await page.evaluate(() => {
            window.__gyTest.start(9, 1, false)
            window.__gyTest.prime('batch')
            let stones = 0, plumes = 0
            for (let i = 0; i < 400; i++) {
                window.__game.step({})
                const a = window.__gyTest.anim()
                if (a.stones) stones++
                if (a.plumes > plumes) plumes = a.plumes
            }
            window.__gyTest.prime('jam')
            return { running: stones > 0, plumes, smoke: window.__gyTest.anim().smoke }
        })
        ok('deck stones bounce while the screen runs', shaker.running, JSON.stringify(shaker))
        ok('batch end spits an output plume sized to the batch', shaker.plumes >= 1, `plumes=${shaker.plumes}`)
        ok('jam puts smoke on the stack', shaker.smoke === 1)

        ok('zero page errors', errors.length === 0, errors.join(' | '))
    } finally {
        await browser.close()
    }
}

console.log(`\ngravelcheck: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
