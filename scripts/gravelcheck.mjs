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
    createGame, stepGame, simState, drainFx, makeCpuEmitter, simulate, cellKind, driveable, submitVoice,
    SHIFT_TICKS, QUOTA, MAX_STRIKES, MAX_ORDERS, HOPPER_CAP, BED_CAP, BAY_CAP,
    PILE, DIG_TICKS, DUMP_TICKS, LOAD_TICKS,
    HOPPER_FRONT, CONSOLE_FRONT, HOPPER_STAND, CONSOLE_STAND, BAY, BAY_LOAD, DOCK_SPOTS, BOARD,
    digSwingFrame, tipSeqFrame, TIP_TICKS, demand,
} from '../src/games/GravelYard/engine.js'
import { parseOrder, orderLabel } from '../src/games/GravelYard/voiceorders.js'
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

console.log('— pin law (#1759): cycle at the board, tip honours the pin —')
{
    const g = createGame(3, 1)
    g.orders = [{ id: 11, grade: 'coarse', units: 4, left: 1000, total: 1000 }, { id: 12, grade: 'fines', units: 3, left: 1500, total: 1500 }]
    g.truck.x = BOARD[0] - 1; g.truck.y = BOARD[1]; g.truck.face = 'right'
    tap(g, 1, { a: true })
    ok('board tap pins the first order', g.pin === 11, `pin=${g.pin}`)
    tap(g, 1, { a: true })
    ok('second tap pins the next', g.pin === 12, `pin=${g.pin}`)
    tap(g, 1, { a: true })
    ok('third tap clears the pin (none->o1->o2->none)', g.pin === null, `pin=${g.pin}`)
    g.truck.face = 'left'
    tap(g, 1, { a: true })
    ok('pin cycles only facing the board', g.pin === null, `pin=${g.pin}`)
    const noOrders = createGame(3, 1)
    noOrders.orders = []
    noOrders.truck.x = BOARD[0] - 1; noOrders.truck.y = BOARD[1]; noOrders.truck.face = 'right'
    tap(noOrders, 1, { a: true })
    ok('board tap with no open orders is a plain deny', noOrders.pin === null && drainK(noOrders).includes('deny'))

    // tip priority: a pinned younger order is served first; the older stays open
    const t = createGame(3, 1)
    t.orders = [{ id: 21, grade: 'fines', units: 4, left: 300, total: 1000 }, { id: 22, grade: 'fines', units: 3, left: 900, total: 1000 }]
    t.pin = 22
    t.truck.bed = 3; t.bedGrade = 'fines'
    t.truck.x = DOCK_SPOTS[0][0]; t.truck.y = DOCK_SPOTS[0][1]; t.truck.face = 'left'
    tap(t, 1, { b: true })
    ok('tip fills the PINNED younger order', t.orders.length === 1 && t.orders[0].id === 21 && t.delivered === 3 && t.score >= 3 * 22, `orders=${JSON.stringify(t.orders.map((o) => o.id))} score=${t.score}`)
    ok('pin retires with its filled order', t.pin === null, `pin=${t.pin}`)

    const n = createGame(3, 1)
    n.orders = [{ id: 31, grade: 'fines', units: 2, left: 500, total: 1000 }, { id: 32, grade: 'fines', units: 3, left: 1500, total: 1500 }]
    n.truck.bed = 3; n.bedGrade = 'fines'
    n.truck.x = DOCK_SPOTS[0][0]; n.truck.y = DOCK_SPOTS[0][1]; n.truck.face = 'left'
    tap(n, 1, { b: true })
    ok('no pin: oldest match served verbatim', n.orders.length === 1 && n.orders[0].id === 32 && n.truck.bed === 1, `orders=${JSON.stringify(n.orders.map((o) => o.id))} bed=${n.truck.bed}`)

    const w = createGame(3, 1)
    w.orders = [{ id: 41, grade: 'coarse', units: 4, left: 1000, total: 1000 }]
    w.pin = 41
    w.truck.bed = 2; w.bedGrade = 'fines'
    w.truck.x = DOCK_SPOTS[0][0]; w.truck.y = DOCK_SPOTS[0][1]; w.truck.face = 'left'
    tap(w, 1, { b: true })
    ok('grade law invariant: a pin never overrides grade', w.strikes === 1 && w.truck.bed === 2 && w.orders.length === 1, `strikes=${w.strikes} bed=${w.truck.bed}`)

    const f = createGame(3, 1)
    f.orders = [{ id: 51, grade: 'coarse', units: 4, left: 400, total: 1000 }, { id: 52, grade: 'fines', units: 3, left: 1500, total: 1000 }]
    f.pin = 51
    f.truck.bed = 2; f.bedGrade = 'fines'
    f.truck.x = DOCK_SPOTS[0][0]; f.truck.y = DOCK_SPOTS[0][1]; f.truck.face = 'left'
    tap(f, 1, { b: true })
    ok('pin on another grade falls back to the oldest match', f.delivered === 2 && f.strikes === 0 && f.orders.some((o) => o.id === 51) && f.pin === 51, `delivered=${f.delivered} pin=${f.pin}`)

    const l = createGame(3, 1)
    l.orders = [{ id: 61, grade: 'fines', units: 3, left: 10, total: 1000 }]
    l.pin = 61
    step(l, [{}, {}, {}], 12)
    ok('pin clears when its order lapses', l.orders.length === 0 && l.pin === null, `pin=${l.pin}`)

    // hash: the pin is part of the sim — identical actions replay identical, pin diverges
    const a1 = createGame(9, 1); const a2 = createGame(9, 1); const a3 = createGame(9, 1)
    for (const a of [a1, a2]) {
        a.orders = [{ id: 71, grade: 'coarse', units: 4, left: 1000, total: 1000 }]
        a.truck.x = BOARD[0] - 1; a.truck.y = BOARD[1]; a.truck.face = 'right'
        tap(a, 1, { a: true })
        step(a, [{}, {}, {}], 5)
    }
    a3.orders = [{ id: 71, grade: 'coarse', units: 4, left: 1000, total: 1000 }]
    a3.truck.x = BOARD[0] - 1; a3.truck.y = BOARD[1]; a3.truck.face = 'right'
    step(a3, [{}, {}, {}], 7)
    ok('same pin actions => identical hash', simState(a1).hash === simState(a2).hash, `${simState(a1).hash} vs ${simState(a2).hash}`)
    ok('the pin diverges the hash', simState(a1).hash !== simState(a3).hash, `${simState(a1).hash} vs ${simState(a3).hash}`)

    // the CPU crew never pins: reference runs keep the pre-pin paths bit-for-bit
    let sawPin = false
    for (let s = 1; s <= 8; s++) if (runEm(s, 3, 4000).pin !== null) sawPin = true
    ok('full-CPU crews never pin (reference paths unchanged)', !sawPin)

    // and it RESPECTS yours: an empty-bed CPU truck loads the pinned grade
    const pinLoad = (pin) => {
        const gs = createGame(5, 3)
        gs.orders = [{ id: 81, grade: 'coarse', units: 4, left: 1400, total: 1500 }, { id: 82, grade: 'fines', units: 4, left: 1450, total: 1500 }]
        gs.pin = pin
        gs.bays.coarse = 5; gs.bays.fines = 5
        const em = makeCpuEmitter(1)
        for (let i = 0; i < 1200; i++) {
            const pads = [{}, {}, {}]
            pads[1] = em({ gs, tick: i })
            stepGame(gs, pads)
            if (gs.bedGrade) return gs.bedGrade
        }
        return null
    }
    ok('CPU truck loads the PINNED grade', pinLoad(82) === 'fines', String(pinLoad(82)))
    ok('no pin: CPU loads the oldest grade as before', pinLoad(null) === 'coarse', String(pinLoad(null)))

    // src pins (#1744 lesson: pin the deciding lines, not just a callsite)
    const engSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'GravelYard', 'engine.js'), 'utf8')
    ok('src: tip takes the pinned order first, oldest as fallback', /open\.find\(\(o\) => o\.id === gs\.pin\) \|\| open\[0\]/.test(engSrc))
    ok('src: a board-facing A drives cyclePin', /fx === bdx && fy === bdy && m\.face === 'right'\) \{ cyclePin\(gs\)/.test(engSrc))
    ok('src: the pin rides hashState', /o\.id === gs\.pin \? 1 : 0/.test(engSrc))
    ok('src: CPU load prefers the pinned grade', /pinned && gs\.bays\[pinned\.grade\] > 0/.test(engSrc))
    ok('src: filled AND lapsed orders retire the pin', /gs\.pin === match\.id\) gs\.pin = null/.test(engSrc) && /!gs\.orders\.some\(\(o\) => o\.id === gs\.pin\)\) gs\.pin = null/.test(engSrc))
}

// ---------- #1771: shouted orders (#1249 pattern, the yard's own radio words) ----------
console.log('— #1771 voice orders: grammar —')
{
    const say = (t) => JSON.stringify(parseOrder(t))
    ok('grammar: gate words', parseOrder('wide gate')?.kind === 'gate' && parseOrder('wide gate')?.gate === 'wide' && parseOrder('open it up')?.gate === 'wide' && parseOrder('choke it down')?.gate === 'narrow' && parseOrder('middle')?.gate === 'medium', say('wide gate'))
    ok('grammar: run words', ['run it', 'start the plant', 'batch it', 'shake it'].every((t) => parseOrder(t)?.kind === 'run'), say('start the plant'))
    ok('grammar: jog mirrors the radio ("JAMMED! JOG IT")', parseOrder('jog it')?.kind === 'jog' && parseOrder('knock it loose')?.kind === 'jog', say('jog it'))
    ok('grammar: pin verb + grade, and grade-first phrasing', parseOrder('pin coarse')?.kind === 'pin' && parseOrder('pin coarse')?.grade === 'coarse' && parseOrder('fines first')?.kind === 'pin' && parseOrder('pin the fines order')?.grade === 'fines', say('fines first'))
    ok('grammar: pin clear (verbatim radio) + siblings', ['pin clear', 'clear the pin', 'unpin', 'any order'].every((t) => parseOrder(t)?.kind === 'unpin'), say('pin clear'))
    ok('grammar: yard noise returns null (misheard != misobeyed)', parseOrder('hello there') === null && parseOrder('') === null && parseOrder('gate please') === null)
    ok('grammar: labels are short radio words', orderLabel({ kind: 'gate', gate: 'narrow' }) === 'GATE NARROW' && orderLabel({ kind: 'pin', grade: 'coarse' }) === 'PIN COARSE' && orderLabel(null) === '?')
}

console.log('— #1771 voice orders: honest refusals + queue —')
{
    const g = createGame(5, 1)
    ok('jog with no jam is refused NO JAM', submitVoice(g, { kind: 'jog' }).why === 'NO JAM')
    ok('run with an empty hopper is refused HOPPER TOO LOW', submitVoice(g, { kind: 'run' }).why === 'HOPPER TOO LOW')
    ok('pin with no matching order is refused (seed 5 opens fines)', submitVoice(g, { kind: 'pin', grade: 'coarse' }).why === 'NO COARSE ORDER' || g.orders.some((o) => o.grade === 'coarse'))
    ok('gate already set is ok with a why (no pointless walk)', submitVoice(g, { kind: 'gate', gate: g.plant.gate }).ok && /ALREADY/.test(submitVoice(g, { kind: 'gate', gate: g.plant.gate }).why || ''))
    ok('unpin with nothing pinned is ok with a why', submitVoice(g, { kind: 'unpin' }).ok && /NOTHING/.test(submitVoice(g, { kind: 'unpin' }).why || ''))
    g.plant.hopper = 4
    const before = g.vseq
    const res = submitVoice(g, { kind: 'run' })
    ok('accepted orders file with a COPY radio + voiceGo fx', res.ok && g.vseq === before + 1 && drainFx(g).some((f) => f.k === 'radio' && f.text === 'COPY' && f.who === 'SCREEN'))
    submitVoice(g, { kind: 'gate', gate: 'wide' })
    submitVoice(g, { kind: 'gate', gate: 'narrow' })
    const gates = g.vord.filter((c) => c.kind === 'gate')
    ok('a newer shout replaces the same kind (latest wins)', gates.length === 1 && gates[0].arg === 'narrow', JSON.stringify(g.vord))
    g.vord.length = 0
    ;['gate', 'run', 'jog', 'unpin'].forEach((k) => g.vord.push({ seat: 2, kind: k, arg: null, id: 90 + k.length, t: g.tick }))
    submitVoice(g, { kind: 'gate', gate: 'wide' })
    ok('the queue caps at 3 (stale shouts drop off the front)', g.vord.length === 3 && g.vord[g.vord.length - 1].kind === 'gate')
}

console.log('— #1771 voice orders: the crew obeys with pads —')
{
    // gate override: demand is coarse-heavy (chart wants wide) — shouting
    // narrow must land narrow anyway, then the chart walks back.
    const g0 = createGame(21, 1)
    g0.orders = [{ id: 800, grade: 'coarse', units: 7, left: 2000, total: 2000 }]
    const emg = makeCpuEmitter(2)
    const saw = [], rsaw = []
    submitVoice(g0, { kind: 'gate', gate: 'narrow' })
    for (let t = 0; t < 60 && !g0.done; t++) {
        stepGame(g0, [{}, {}, emg({ gs: g0, tick: g0.tick })])
        saw.push(g0.plant.gate)
        for (const f of g0.fx) if (f.k === 'radio') rsaw.push(`${f.who}:${f.text}`)
    }
    ok('shouted GATE NARROW lands even when the chart wants wide', saw.includes('narrow') && demand(g0).coarse > demand(g0).fines, `saw ${saw.join(',')}`)
    ok('the obey receipt rides the radio (GATE NARROW)', rsaw.includes('SCREEN:GATE NARROW'), rsaw.filter((r) => /GATE/.test(r)).join(','))
    ok('the queue drains when the order lands', g0.vord.length === 0)
    // run override: hopper stocked, gate != demand-want — the batch starts NOW.
    const gr = createGame(31, 1)
    gr.plant.hopper = 4
    gr.orders = [{ id: 700, grade: 'fines', units: 7, left: 2000, total: 2000 }]
    gr.plant.gate = 'wide' // chart wants narrow
    const emr = makeCpuEmitter(2)
    submitVoice(gr, { kind: 'run' })
    for (let t = 0; t < 40 && !gr.plant.running; t++) stepGame(gr, [{}, {}, emr({ gs: gr, tick: gr.tick })])
    stepGame(gr, [{}, {}, emr({ gs: gr, tick: gr.tick })]) // one more tick: voiceTick reads the receipt
    ok('RUN IT starts the batch on the CURRENT gate (chart walk skipped)', gr.plant.running && gr.plant.gate === 'wide', `running=${gr.plant.running} gate=${gr.plant.gate}`)
    ok('the run order retires when the batch starts', gr.vord.length === 0)
    // pin order: the truck walks to the board and pins the YOUNGER matching
    // order — the board action the CPU never takes on its own (#1759).
    // pin order: the truck walks to the board and pins the matching order —
    // the board action the CPU never takes on its own (#1759). The check fires
    // AT the landing tick: later deliveries retire the pin (law, not drift).
    const gpc = createGame(7, 1)
    const epc = [makeCpuEmitter(0), makeCpuEmitter(1), makeCpuEmitter(2)]
    let landed = null, prsaw = [], pinSubmitted = false
    for (let t = 0; t < 1400 && !gpc.done && !landed; t++) {
        const pads = [{}, {}, {}]
        for (let s = 0; s < 3; s++) pads[s] = epc[s]({ gs: gpc, tick: t })
        stepGame(gpc, pads)
        if (!pinSubmitted && gpc.orders.length >= 2 && gpc.orders.some((o) => o.grade === 'coarse') && gpc.pin === null) { submitVoice(gpc, { kind: 'pin', grade: 'coarse' }); pinSubmitted = true }
        for (const f of gpc.fx) if (f.k === 'radio') prsaw.push(`${f.who}:${f.text}`)
        const po = gpc.orders.find((o) => o.id === gpc.pin)
        if (po && po.grade === 'coarse') landed = { tick: gpc.tick, id: po.id }
    }
    ok('a shouted PIN drives the truck to the board and pins that grade', !!landed && pinSubmitted, JSON.stringify(landed))
    stepGame(gpc, [{}, {}, {}]) // one more tick: voiceTick reads the PINNED receipt
    ok('pin order retires on the landing', gpc.vord.length === 0)
    ok('the board radio says PINNED (the human sees what happened)', prsaw.some((r) => r.startsWith('BOARD:PINNED COARSE')), prsaw.filter((r) => /PIN/.test(r)).join(','))
    // unpin order unwinds the pin
    const gu = createGame(12, 1)
    gu.pin = gu.orders.length ? gu.orders[0].id : null
    const emu = [makeCpuEmitter(1)]
    submitVoice(gu, { kind: 'unpin' })
    for (let t = 0; t < 1200 && !gu.done && gu.pin !== null; t++) stepGame(gu, [{}, emu[0]({ gs: gu, tick: t }), {}])
    ok('PIN CLEAR drives the truck to un-cycle the board', gu.pin === null)
    // stale orders drop — a 40 s old shout is a misheard shout
    const gst = createGame(4, 1)
    gst.vord.push({ seat: 2, kind: 'gate', arg: gst.plant.gate === 'wide' ? 'narrow' : 'wide', id: 99, t: gst.tick - 2401, orderId: null })
    stepGame(gst, [{}, {}, {}])
    ok('stale orders expire with FORGET IT', gst.vord.length === 0 && gst.fx.some((f) => f.k === 'radio' && f.text === 'FORGET IT'))
}

console.log('— #1771 voice orders: solo-local law (hash untouched) —')
{
    const engSrc2 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'GravelYard', 'engine.js'), 'utf8')
    const idxSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'games', 'GravelYard', 'index.jsx'), 'utf8')
    ok('src: the queue is NOT hashed (voice is solo-local like Gauntlet _vCmd)', !/vord/.test(engSrc2.split('export function hashState')[1].split('}')[0]))
    const g1 = createGame(9, 1)
    const h0 = simState(g1).hash
    g1.vord.push({ seat: 2, kind: 'gate', arg: 'wide', id: 1, t: g1.tick })
    ok('a live order in the queue leaves the hash alone', simState(g1).hash === h0)
    const drive2 = (seed, submits, until) => {
        const g = createGame(seed, 1)
        const em = [makeCpuEmitter(0), makeCpuEmitter(1), makeCpuEmitter(2)]
        for (let t = 0; t < until && !g.done; t++) {
            const pads = [{}, {}, {}]
            for (let s = 0; s < 3; s++) pads[s] = em[s]({ gs: g, tick: t })
            stepGame(g, pads)
            for (const [st, intent] of submits) if (g.tick === st) submitVoice(g, intent)
        }
        return simState(g).hash
    }
    ok('same seed + same shouts at the same ticks => identical hash', drive2(15, [[140, { kind: 'gate', gate: 'wide' }]], 600) === drive2(15, [[140, { kind: 'gate', gate: 'wide' }]], 600))
    ok('shouted vs silent runs diverge (orders really do steer)', drive2(15, [[140, { kind: 'gate', gate: 'wide' }]], 600) !== drive2(15, [], 600))
    ok('src: V opens the mic (KeyV)', /ev\.code === 'KeyV'/.test(idxSrc))
    ok('src: consent is asked before the mic opens', /askVoiceConsent\(\)/.test(idxSrc))
    ok('src: net play is refused orders (SOLO SHIFTS)', /SOLO SHIFTS ONLY|ORDERS WAIT FOR SOLO SHIFTS/.test(idxSrc))
    ok('src: words land through the shared voiceCmd recorder channel', /recordVoiceCmd\(/.test(idxSrc))
    ok('src: voiceTick runs inside the sim step', /voiceTick\(gs\)/.test(engSrc2))
    ok('src: the truck board-walk is shared with the pin law (face right, A cycle)', /thenFace: 'right', act: 'a'/.test(engSrc2))
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
    const errors = []
    try {
        const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
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

        // ---------- #1759: the delivery pin, live in the browser ----------
        console.log('— #1759: the delivery pin (browser) —')
        const pinCycle = await page.evaluate(() => {
            window.__gyTest.start(9, 2, true)
            window.__gyTest.prime('cycle')
            const press = () => { window.__game.step([{}, { a: true }, {}]); window.__game.step([{}, {}, {}]) }
            const seq = []
            press(); seq.push(window.__gyTest.state().pin)
            press(); seq.push(window.__gyTest.state().pin)
            press(); seq.push(window.__gyTest.state().pin)
            return seq
        })
        ok('browser: board taps cycle the pin none->903->904->none', JSON.stringify(pinCycle) === '[903,904,null]', JSON.stringify(pinCycle))

        const tipPinned = await page.evaluate(() => {
            window.__gyTest.start(9, 2, true)
            window.__gyTest.prime('pin')
            const press = () => { window.__game.step([{}, { b: true }, {}]); window.__game.step([{}, {}, {}]) }
            press()
            const s = window.__gyTest.state()
            return { after: s.orders.map((o) => [o.units, o.pinned]), pin: s.pin, delivered: s.delivered }
        })
        ok('browser: tip closes the PINNED order and the older stays open',
            tipPinned.after.length === 1 && tipPinned.after[0][0] === 4 && !tipPinned.after[0][1] && tipPinned.delivered === 3 && tipPinned.pin === null,
            JSON.stringify(tipPinned))

        // the pinned ticket actually wears its gold frame on the HUD
        const pinDraw = await page.evaluate(async () => {
            window.__gyTest.start(9, 2, true)
            window.__gyTest.prime('cycle')
            const px = () => {
                const g = document.querySelector('canvas').getContext('2d')
                const d = g.getImageData(210, 4, 72, 30).data
                let gold = 0
                for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 150 && d[i + 2] < 120) gold++
                return gold
            }
            await new Promise((r) => requestAnimationFrame(r))
            const before = px()
            window.__game.step([{}, { a: true }, {}])
            await new Promise((r) => requestAnimationFrame(r))
            return { before, after: px() }
        })
        ok('browser: the pinned ticket gains its gold frame on canvas', pinDraw.after > pinDraw.before + 100, JSON.stringify(pinDraw))

        // ---------- #1771: shouted orders in the browser (headless, no mic) ----------
        console.log('— #1771: voice orders drive the yard for real —')
        await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
        await page.waitForFunction(() => window.__gyTest && window.__gyTest.screen() === 'attract', null, { timeout: 20000 })
        await page.evaluate(() => { window.__gyTest.start(7, 1, false); window.__gyTest.voiceOn() })
        const vres = await page.evaluate(async () => {
            const t0 = Date.now()
            while (Date.now() - t0 < 12000) {
                const st = window.__gyTest.state()
                if (st.orders.length >= 2 && st.orders.some((o) => o.grade === 'coarse') && st.pin == null) break
                await new Promise((r) => setTimeout(r, 100))
            }
            const res = window.__gyTest.voice('pin coarse')
            const t1 = Date.now()
            while (Date.now() - t1 < 15000) {
                const st = window.__gyTest.state()
                if (st.orders.some((o) => o.pinned && o.grade === 'coarse')) return { ok: true, res, heard: window.__gyTest.voiceMode() }
                if (st.done) break
                await new Promise((r) => setTimeout(r, 100))
            }
            return { ok: false, res, heard: window.__gyTest.voiceMode() }
        })
        ok('#1771 shouted PIN COARSE: the truck drove to the board and pinned it (headless, no mic)', vres.ok && vres.res.ok, JSON.stringify(vres.res))
        const hv = vres.heard && vres.heard.heard
        ok('#1771 the heard-banner remembers the order (voiceMode.heard)', !!(hv && hv.ok && /PIN/.test(hv.label || '')), JSON.stringify(vres.heard))
        ok('#1771 the MIC pill is on screen and lit', await page.evaluate(() => { const p = document.querySelector('[data-voice-coop]'); return !!p && p.getAttribute('data-voice-coop') === 'on' }))
        const vrej = await page.evaluate(() => window.__gyTest.voice('jog it'))
        ok('#1771 refusal rides the banner: JOG with no jam says NO JAM', vrej.ok === false && vrej.why === 'NO JAM', JSON.stringify(vrej))
        const vq = await page.evaluate(() => window.__gyTest.voiceMode().q)
        ok('#1771 the order queue is empty again after landing', vq === 0, String(vq))

        // ---------- #1726: the phone has no keyboard — a tap is the SPACE ----------
        // The window owns the tap (the Lobby scrim passes through; the copy
        // chip and form chrome keep their own semantics). Solo and net share
        // the branch: attract -> tap -> select -> tap -> play.
        console.log('— #1726: tap-to-start (the phone has no SPACE) —')
        await page.goto(URL, { waitUntil: 'load', timeout: 30000 })
        await page.waitForFunction(() => !!window.__gyTest, null, { timeout: 20000 })
        await page.waitForFunction(() => window.__gyTest.screen() === 'attract', null, { timeout: 10000 })
        await page.mouse.click(450, 380)
        await page.waitForFunction(() => window.__gyTest.screen() === 'select', null, { timeout: 5000 })
        ok('#1726 tap advances attract -> select (the window owns the tap)', true)
        await page.mouse.click(450, 380)
        await page.waitForFunction(() => window.__gyTest.screen() === 'play', null, { timeout: 5000 })
        ok('#1726 a second tap starts the shift from select (no keyboard needed)',
            await page.evaluate(() => window.__gyTest.screen() === 'play'))
    } finally {
        await browser.close()
    }

    // ---------- #1705 three browsers, one relay: netplay for real ----------
    // Every pad above ran through in-memory sims; this is the wire: three
    // headless pages join a relay room (relay/server.mjs, the worker twin),
    // the host starts, and real keystrokes on each browser must move the
    // SAME sim identically on all three boxes. Its own browser instance:
    // the #1622 single-process fallback is one-renderer-per-tab-shy, and
    // closing the battery's last page would end that browser outright.
    const { startRelay } = await import('../relay/server.mjs')
    const relaySrv = startRelay(0)
    await new Promise((done) => { const iv = setInterval(() => { if (relaySrv.boundPort()) { clearInterval(iv); done() } }, 20) })
    const RURL = `ws://127.0.0.1:${relaySrv.boundPort()}`
    // One page per browser: the #1622 single-process fallback caps a browser
    // at one tab (a second newPage dies), so three browsers = three seats.
    const boxes = []
    const mk = async (q) => {
        const b = await launchChrome({ channel: process.env.SHOT_CHANNEL || 'chrome', extraArgs: ['--autoplay-policy=no-user-gesture-required'] })
        const p = await b.newPage({ viewport: { width: 900, height: 760 } })
        p.on('pageerror', (e) => errors.push(String(e)))
        await p.goto(`${URL}${q}&relay=${encodeURIComponent(RURL)}`, { waitUntil: 'load', timeout: 30000 })
        await p.waitForFunction(() => !!window.__gyTest, null, { timeout: 20000 })
        boxes.push({ b, p })
        return p
    }
    try {
        const host = await mk('?net=host')
        let code = null
            for (let i = 0; i < 100 && !code; i++) { code = await host.evaluate(() => window.__gyTest.net().code || null); if (!code) await host.waitForTimeout(100) }
            ok('#1705 relay lobby: host rolls a room code', /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(String(code)), `code=${code}`)
            // #1726: the room lives in the shared <Lobby> — code + copy chip on
            // the host's own box (the same waiting room as every net title).
            ok('#1726 host room UI: the shared <Lobby> shows the code + the copy chip',
                await host.evaluate(() => {
                    const room = document.querySelector('[data-lobby="room"]')
                    const copy = document.querySelector('[data-lobby="copy"]')
                    const c = window.__gyTest.net().code
                    return !!(room && copy && c && room.textContent.includes(c))
                }))
            const g1 = await mk(`?net=join&room=${code}`)
            const g2 = await mk(`?net=join&room=${code}`)
            let slots = []
            // every box must SEE the full room before kickoff: the host's view
            // alone can transiently count a StrictMode ghost socket (#1705 run:
            // start fired while the third joiner was still mid-handshake, the
            // roster then held a dead slot and the pads for it never came)
            for (let i = 0; i < 80; i++) {
                slots = await host.evaluate(() => window.__gyTest.net().slots)
                const seen = await Promise.all([host, g1, g2].map((p) => p.evaluate(() => window.__gyTest.net().slots.length)))
                if (slots.length >= 3 && seen.every((n) => n >= 3)) break
                await host.waitForTimeout(100)
            }
            ok('#1705 three browsers seated in one relay room, join order = slots',
                JSON.stringify(slots) === '[0,1,2]', JSON.stringify(slots))
            // #1726: the guest has no SPACE — a tap on select must NOT start;
            // it toasts that the host owns the go.
            await g1.mouse.click(450, 380)
            await g1.waitForFunction(() => window.__gyTest.screen() === 'select', null, { timeout: 5000 })
            await g1.mouse.click(450, 380)
            await g1.waitForFunction(() => window.__gyTest.toast().msg === 'THE HOST STARTS THE SHIFT', null, { timeout: 5000 })
            ok('#1726 guest tap on select toasts THE HOST STARTS (the guest cannot start)', true)
            let started = false
            for (let i = 0; i < 40 && !started; i++) { started = await host.evaluate(() => window.__gyTest.netStart()); if (!started) await host.waitForTimeout(100) }
            // the go signal rides the wire: give every box a beat to take its
            // seat before the law is read (the seats gate is the receipt)
            let seats = []
            for (let i = 0; i < 40; i++) {
                seats = []
                for (const p of [host, g1, g2]) seats.push(await p.evaluate(() => ({ seat: window.__gyTest.net().seat, mode: window.__gyTest.net().mode })))
                if (seats.every((s) => s.mode)) break
                await host.waitForTimeout(100)
            }
            ok('#1705 host starts the shift and the seat law rides the wire (digger/truck/console)',
                started && seats.every((s) => s.mode) && JSON.stringify(seats.map((s) => s.seat)) === '[0,1,2]',
                JSON.stringify(seats))
            // #1726: the crew channel speaks — every box toasts its own seat at
            // kickoff, and the toast is DRAWN (amber callout over the fence
            // band), not just set. Mutant: delete the toast render block in
            // index.jsx — the state gate still passes, the pixel gate goes red
            // (the #1726 bug: the whole channel was set-but-never-drawn).
            const intros = await Promise.all([host, g1, g2].map((p) => p.evaluate(() => window.__gyTest.toast().msg)))
            ok('#1726 the crew channel speaks: every box toasts its own seat at kickoff',
                intros[0] === '3P CREW — YOU HAVE THE DIGGER' &&
                intros[1] === '3P CREW — YOU HAVE THE TRUCK' &&
                intros[2] === '3P CREW — YOU HAVE THE CONSOLE',
                intros.join(' | '))
            const amber = await Promise.all([host, g1, g2].map((p) => p.evaluate(() => {
                const g = document.querySelector('canvas').getContext('2d')
                const d = g.getImageData(156, 48, 200, 16).data
                let n = 0
                for (let i = 0; i < d.length; i += 4) if (d[i] > 230 && d[i + 1] > 170 && d[i + 2] < 110) n++
                return n
            })))
            ok('#1726 the toast is DRAWN on every box (amber callout pixels in the fence band)',
                amber.every((n) => n > 40), amber.join('/'))
            // real keys, timed inside the sampling window: hold Right on the
            // digger page, then cycle the console four times on the third box.
            const keying = (async () => {
                await boxes[0].p.keyboard.down('ArrowRight')
                await boxes[0].p.waitForTimeout(700)
                await boxes[0].p.keyboard.up('ArrowRight')
                for (let i = 0; i < 4; i++) {
                    // sustained presses: the pad is sampled once per tick, a
                    // zero-delay down+up falls between two samples entirely
                    await boxes[2].p.keyboard.down('ArrowRight')
                    await boxes[2].p.waitForTimeout(90)
                    await boxes[2].p.keyboard.up('ArrowRight')
                    await boxes[2].p.waitForTimeout(140)
                }
            })()
            // Sample the wire continuously: flood-pads + delivery jitter mean
            // the boxes never share an identical instant (the hash moves every
            // tick and a 3-way evaluate round-trip is slower than a frame), but
            // deterministic lockstep still pins hard invariants: no box freezes,
            // no box runs more than two ticks ahead of another while waiting
            // for pads, and positions at the shared frontier agree within one
            // tick of travel. A frozen box (the #1705 wire-pad bug) or a
            // diverged sim (the pad-erase bug) breaks these — and did, before
            // the fixes.
            const samples = []
            for (let i = 0; i < 50; i++) {
                const s = await Promise.all(boxes.map(({ p }) => p.evaluate(() => {
                    const st = window.__gyTest.state()
                    return { t: st.tick, x: st.digger ? st.digger.x : -1, gate: st.plant.gate, frz: window.__gyTest.net().frozen, stall: window.__gyTest.net().stall }
                })))
                samples.push(s)
                await host.waitForTimeout(60)
            }
            await keying
            const dT = boxes.map((_, j) => samples[samples.length - 1][j].t - samples[0][j].t)
            ok('#1705 all three boxes dig on the relay (no freeze, 60+ ticks in the window)',
                dT.every((d) => d >= 60), `ticks advanced ${dT.join('/')}`)
            const maxSpread = Math.max(...samples.map((s) => Math.max(...s.map((v) => v.t)) - Math.min(...s.map((v) => v.t))))
            ok('#1705 lockstep holds: no box ran away from the others mid-shift',
                maxSpread <= 2, `worst tick spread ${maxSpread}`)
            const dX = boxes.map((_, j) => samples[samples.length - 1][j].x - samples[0][j].x)
            const lastX = samples[samples.length - 1].map((v) => v.x)
            ok('#1705 the digger keystroke drove the digger identically on all three boxes',
                dX.every((d) => d > 3) && Math.max(...lastX) - Math.min(...lastX) <= 4,
                `moved ${dX.map((d) => d.toFixed(1)).join('/')}px, frontier ${lastX.map((v) => v.toFixed(1)).join('/')}`)
            const gates = [...new Set(samples[samples.length - 1].map((v) => v.gate))]
            ok('#1705 console presses on the third browser cycled the gate identically everywhere',
                gates.length === 1 && gates[0] !== 'medium', `gate ${gates.join('/')}`)
            ok('#1705 no box froze or blamed a partner for lag across the shift',
                samples.every((s) => s.every((v) => !v.frz && v.stall < 90)),
                `worst stall ${Math.max(...samples.flatMap((s) => s.map((v) => v.stall)))}`)
    } finally {
        for (const { b, p } of boxes) { try { await p.close() } catch { /* gone */ } try { await b.close() } catch { /* gone */ } }
        await relaySrv.close()
    }

    ok('zero page errors', errors.length === 0, errors.join(' | '))
}

console.log(`\ngravelcheck: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
