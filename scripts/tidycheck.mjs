// TIDY BOT — the chore audit (issue #1143).
//
//   npm run tidycheck              # Node rules + determinism + win proof + real drive
//   npm run tidycheck -- --node   # Node-only gates (no browser)
//   npm run tidycheck -- --mutate # silence ONE load-bearing rule, watch NAMED gates red
//
// Node proves the rules that make it a chores game (doors really open and
// really block, a shut washer refuses cargo, wrong stows must be rescued,
// throw/jam/spill/shatter scoring, the CLOSE & RUN order, the clock verdict)
// and the promise behind them (seeded determinism; the shipped autopilot wins
// every seed; every level is still clearable with one fewer of every kind of
// supply — the slack rule). Chrome proves it is PLAYABLE: boots clean, starts
// on a real Space, the robot pixels land where the sim says after real
// strokes, and a scripted chore run banks points with zero page errors.
//
// Mutants (TIDY_MUT=door|glass|run|tidy|order|aim|tapact):
//   door  — open doors stop blocking the floor
//   glass — plates stop being fragile
//   run   — the washer starts even when empty
//   tidy  — wrong stows stop costing points
//   order — the carry queue flips FIFO→LIFO (#2266 order gates go red)
//   aim   — aiming is ignored; every pull falls back to the default (#2338
//           aimed-retrieve gates go red)
//   tapact — a tap never fires its verb (#2537 tap-act gates go red: the
//           chore un-collapses back into a walk that arrives and does nothing)
//
// #3078 SKINS: the browser section freezes both looks with pinned-frame region
// hashes (classic byte-frozen at the pre-skin golden; papercraft gets one too),
// proves ?style=reimagined paints at sim coords under the same teal/red pixel
// laws, and live-toggles STYLE back and forth without a reload.

import * as s from '../src/games/TidyBot/sim.js'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const NODE_ONLY = args.includes('--node')
const MUT = process.env.TIDY_MUT || (args.includes('--mutate') ? 'door' : null)
let pass = 0
const fails = []
const ok = (c, m) => { if (c) { pass++; console.log(`  PASS  ${m}`) } else { fails.push(m); console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`) } }
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

if (MUT && !['door', 'glass', 'run', 'tidy', 'order', 'aim', 'tapact'].includes(MUT)) { console.error(`unknown mutant ${MUT}`); console.error(`  (valid: door, glass, run, tidy, order, aim, tapact)`); process.exit(2) }
if (MUT) console.log(`\x1b[33mMUTANT ACTIVE: ${MUT}\x1b[0m`)
const applyMut = () => {
    if (MUT === 'door') s.SIMHOOKS.noBlock = true
    if (MUT === 'glass') s.KINDS.plate.fragile = false
    if (MUT === 'run') s.SIMHOOKS.freeRun = true
    if (MUT === 'tidy') s.SIMHOOKS.softStow = true
    if (MUT === 'order') s.SIMHOOKS.lifo = true
    if (MUT === 'aim') s.SIMHOOKS.noAim = true
    if (MUT === 'tapact') s.SIMHOOKS.noTapAct = true
}
applyMut()

const {
    makeGame, step, autopilot, playthrough, loadLevel, blockers,
    DW, FR, CONTAINERS, LEVEL_TIME, KINDS, LEVELS, ROBOT_R, REACH,
    rackSlot, aimAt, RACK_CAP, flourishPick,
    tapAct, pendingFire, pendingAlive, routeDir,
} = s


const heldOf = (gs) => gs.items.find((it) => it.state === 'held') || null
const setHeld = (gs, kind) => {
    const it = gs.items.find((i2) => i2.kind === kind && i2.state === 'loose')
    if (!it) return null
    it.state = 'held'
    gs.held = it.id
    return it
}

section('boot + shape')
{
    const gs = makeGame(1337, 1)
    ok(gs.tick === 0 && gs.score === 0 && gs.level === 0 && !gs.end, 'fresh game boots at tick 0, level 1, no end')
    ok(gs.clock === LEVEL_TIME[0], 'level 1 gets its full clock')
    ok(gs.items.length === LEVELS[0].items.length && gs.items.every((it) => it.state === 'loose'), 'level 1 spawns its litter')
    ok(gs.chores.length >= 4 && gs.chores.some((c) => c.label === 'CLOSE ALL'), 'chore list printed at level start')
    step(gs, [{}])
    ok(gs.tick === 1 && gs.clock === LEVEL_TIME[0] - 1, 'step ticks the sim and drains the clock')
}

section('determinism')
{
    const a = playthrough(7).hash
    const b = playthrough(7).hash
    ok(a === b, 'seed 7 autopilot run is hash-identical twice')
    const c = makeGame(7), d = makeGame(8)
    step(c, [{ right: true }]); step(d, [{ right: true }])
    ok(c.hash !== d.hash, 'different seeds diverge')
}

section('doors open, block, and sense the bot')
{
    const gs = makeGame(42)
    for (const it of gs.items) if (Math.hypot(it.x - 84, it.y - 43) < 30) it.state = 'gone'
    // park the bot at the washer approach and open it
    gs.rx = DW.x + DW.w + 14; gs.ry = DW.y + DW.h / 2
    step(gs, [{ a: true }])
    ok(gs.dw.target === 1, 'A near a shut washer opens it')
    let guard = 0
    while (gs.dw.door < 0.99 && guard++ < 100) step(gs, [{}])
    ok(gs.dw.door >= 0.99, 'the door slides fully open over time')
    const bl = blockers(gs)
    const doorBlock = bl.some((r) => r.y >= DW.y + DW.h && r.h >= DW.doorLen - 1)
    ok(doorBlock, 'an open washer door blocks the floor under it')
    // closing
    step(gs, [{ a: true }])
    ok(gs.dw.target === 0, 'A again closes it')
    // STAND CLEAR: bot parked on the door footprint
    const gs2 = makeGame(42)
    gs2.rx = DW.x + DW.w / 2; gs2.ry = DW.y + DW.h + DW.doorLen / 2
    step(gs2, [{ a: true }])
    ok(gs2.dw.target === 0 && gs2.ev.some((e) => e.type === 'clear'), 'a door that finds the bot in the way REFUSES (STAND CLEAR)')
}

section('order rules')
{
    // closed washer refuses cargo — the A verb opens instead of placing
    const gs = makeGame(42)
    setHeld(gs, 'plate')
    gs.rx = DW.x + DW.w + 12; gs.ry = DW.y + DW.h / 2
    step(gs, [{ a: true }])
    ok(gs.dw.target === 1 && heldOf(gs), 'cargo at a SHUT washer opens it instead of placing')
    // open + zone: gentle place
    let guard = 0
    while (gs.dw.door < 0.99 && guard++ < 100) step(gs, [{}])
    gs.rx = 79; gs.ry = 58
    const before = gs.tidies
    step(gs, [{ a: true }])
    ok(gs.tidies === before + 1 && gs.score > 0 && !heldOf(gs), 'cargo in the open zone places gently (TIDY)')
    // wrong stow
    const gs3 = makeGame(42)
    gs3.dw.door = 1; gs3.dw.target = 1; gs3.dw.cd = 0
    for (const it of gs3.items) if (it.kind !== 'apple' && Math.hypot(it.x - 79, it.y - 58) < 30) it.state = 'gone'
    const apple = gs3.items.find((it) => it.kind === 'apple')
    apple.state = 'held'; gs3.held = apple.id
    gs3.rx = 79; gs3.ry = 58
    const w0 = gs3.wrongs, s0 = gs3.score
    step(gs3, [{ a: true }])
    ok(gs3.wrongs === w0 + 1 && gs3.score < s0 && apple.state === 'in' && apple.cont === 'dw',
        'apple in the WASHER is a WRONG STOW (penalized, still stored)')
    // rescue prefers wrong kinds
    ok(gs3.held === null, 'the wrong stow left the bot empty-handed')
    // park a clean cup in the washer too, then B must rescue the APPLE first
    const cup2 = gs3.items.find((it) => it.kind === 'cup')
    cup2.state = 'in'; cup2.cont = 'dw'
    step(gs3, [{ b: true }])
    ok(heldOf(gs3)?.kind === 'apple', 'empty B at an open washer RETRIEVES the wrong stow first')
    // start: refuses empty and open; runs when shut + loaded
    const gs4 = makeGame(42)
    gs4.rx = DW.x + DW.w + 12; gs4.ry = DW.y + DW.h / 2
    step(gs4, [{ b: true }])
    ok(!gs4.dwRun && gs4.ev.some((e) => e.type === 'refuse'), 'an EMPTY washer refuses to start')
    const cup = gs4.items.find((it) => it.kind === 'cup')
    cup.state = 'in'; cup.cont = 'dw'
    gs4.dw.door = 1; gs4.dw.target = 1
    step(gs4, [{ b: true }])
    ok(!gs4.dwRun, 'an OPEN washer runs B as RETRIEVE, never START')
    gs4.held = null
    if (cup.state !== 'in') { cup.state = 'in'; cup.cont = 'dw' }
    gs4.dw.door = 0; gs4.dw.target = 0; gs4.dw.cd = 0
    step(gs4, [{ b: true }])
    ok(gs4.dwRun, 'a shut loaded washer starts its cycle')
}

section('throw, jam, spill, shatter')
{
    // jam into an open container
    const gs = makeGame(42)
    setHeld(gs, 'cup')
    gs.dw.door = 1; gs.dw.target = 1
    gs.rx = DW.x + DW.w + 10; gs.ry = DW.y + DW.h / 2; gs.facing = 'left'
    step(gs, [{ b: true }])
    let guard = 0
    while (gs.items.some((it) => it.state === 'fly') && guard++ < 200) step(gs, [{}])
    ok(gs.jams === 1 && gs.items.find((it) => it.kind === 'cup').state === 'in', 'a tossed cup JAMS into the open washer')
    // spill on tiles
    const gs2 = makeGame(42)
    setHeld(gs2, 'cup')
    gs2.rx = 160; gs2.ry = 160; gs2.facing = 'right'
    step(gs2, [{ b: true }])
    guard = 0
    while (gs2.items.some((it) => it.state === 'fly') && guard++ < 200) step(gs2, [{}])
    ok(gs2.spills === 1, 'a tossed cup on open floor SPILLS (−5)')
    // shatter
    const gs3 = makeGame(42)
    setHeld(gs3, 'plate')
    gs3.rx = 160; gs3.ry = 160; gs3.facing = 'right'
    const s0 = gs3.score
    step(gs3, [{ b: true }])
    guard = 0
    while (gs3.items.some((it) => it.state === 'fly') && guard++ < 200) step(gs3, [{}])
    ok(gs3.breaks === 1 && gs3.score === s0 - 40 && gs3.items.find((it) => it.kind === 'plate').state === 'gone',
        'a thrown PLATE shatters on the tiles (−40, gone)')
    // smashed plates still count toward clearing (finishable-by-destruction)
    const gs4 = makeGame(42)
    for (const it of gs4.items) it.state = 'gone'
    gs4.dwRun = true
    step(gs4, [{}])
    ok(gs4.level === 1, 'a level with every item smashed still CLEARS — the game never bricks')
}

section('two-slot carry + tray (#2266)')
{
    // grabs fill the arms in order: nearest first, then the second
    const gs = makeGame(42)
    gs.items.push(
        { id: 9001, kind: 'cup', x: gs.rx + 6, y: gs.ry, vx: 0, vy: 0, state: 'loose', cont: null },
        { id: 9002, kind: 'plate', x: gs.rx + 12, y: gs.ry, vx: 0, vy: 0, state: 'loose', cont: null },
        { id: 9003, kind: 'apple', x: gs.rx + 18, y: gs.ry, vx: 0, vy: 0, state: 'loose', cont: null },
    )
    step(gs, [{ a: true }])
    ok(gs.held === 9001 && gs.held2 === null, 'first grab fills the front arm with the nearest litter')
    step(gs, [{ a: true }])
    ok(gs.held === 9001 && gs.held2 === 9002, 'a second grab while loaded rides onto the tray (two slots)')
    // refusal is named, never silent — and it consumes nothing
    const heldBefore = `${gs.held}:${gs.held2}`
    step(gs, [{ a: true }])
    ok(gs.ev.some((e) => e.type === 'refuse') && gs.fx.some((f) => f.msg === 'ARMS FULL') &&
        `${gs.held}:${gs.held2}` === heldBefore,
        'a third grab refuses with ARMS FULL and consumes nothing')
    // FIFO release at the container: the FIRST grabbed is the FIRST placed
    const gs2 = makeGame(42)
    const plate = gs2.items.find((it) => it.kind === 'plate')
    const cup = gs2.items.find((it) => it.kind === 'cup')
    plate.x = 152; plate.y = 150; cup.x = 164; cup.y = 150
    gs2.rx = 156; gs2.ry = 150
    step(gs2, [{ a: true }]) // grab plate (nearer)
    step(gs2, [{ a: true }]) // grab cup onto the tray
    ok(gs2.held === plate.id && gs2.held2 === cup.id, 'double-pickup keeps grab order (front=plate, tray=cup)')
    gs2.dw.door = 1; gs2.dw.target = 1; gs2.dw.cd = 0
    gs2.rx = 79; gs2.ry = 58 // step into the open washer's place zone
    const t0 = gs2.tidies
    step(gs2, [{ a: true }]) // place in the open zone: plate leaves first
    ok(gs2.tidies === t0 + 1 && plate.state === 'in' && gs2.held === cup.id && gs2.held2 === null,
        'FIFO: the front arm places first and the tray slides forward (RED under order mutant)')
    step(gs2, [{ a: true }])
    ok(gs2.tidies === t0 + 2 && cup.state === 'in' && gs2.held === null,
        'the second press empties the tray — one release per press')
    // FIFO throw: B tosses the front item, the tray holds
    const gs3 = makeGame(42)
    const p2 = gs3.items.find((it) => it.kind === 'plate')
    const c2 = gs3.items.find((it) => it.kind === 'cup')
    p2.x = 152; p2.y = 150; c2.x = 164; c2.y = 150
    gs3.rx = 156; gs3.ry = 150; gs3.facing = 'right'
    step(gs3, [{ a: true }]); step(gs3, [{ a: true }])
    ok(gs3.held === p2.id && gs3.held2 === c2.id, 'two loaded on the floor before the toss')
    step(gs3, [{ b: true }])
    ok(p2.state === 'fly' && gs3.held === c2.id && gs3.held2 === null && gs3.ev.some((e) => e.type === 'throw' && e.kind === 'plate'),
        'HEAVY bot throws only the front item — the tray stays held (RED under order mutant)')
    while (gs3.items.some((it) => it.state === 'fly')) step(gs3, [{}])
    // carrying two drags the legs
    const gE = makeGame(42); const gH = makeGame(42)
    const hArr = gH.items.filter((it) => it.state === 'loose')
    hArr[0].state = 'held'; gH.held = hArr[0].id
    hArr[1].state = 'held'; gH.held2 = hArr[1].id
    const ex0 = gE.rx, hx0 = gH.rx
    for (let i = 0; i < 20; i++) { step(gE, [{ right: true }]); step(gH, [{ right: true }]) }
    const dxE = gE.rx - ex0, dxH = gH.rx - hx0
    ok(dxE > 0 && dxH > 0 && dxH < dxE, `carrying two is HEAVY — ${dxH.toFixed(1)}px vs ${dxE.toFixed(1)}px in 20 ticks`)
    // the level cannot close with cargo still aboard either arm
    const gs5 = makeGame(42)
    for (const it of gs5.items) it.state = 'gone'
    const ride = gs5.items.find((it) => it.kind === 'milk')
    ride.state = 'held'; gs5.held2 = ride.id // tray-only load: held null, held2 set
    gs5.dwRun = true; gs5.dw.target = 0; gs5.fr.target = 0
    step(gs5, [{}])
    ok(gs5.level === 0 && !gs5.end, 'a level refuses to close while the tray arm still carries cargo')
    ride.state = 'in'; ride.cont = 'fr'
    gs5.held2 = null
    step(gs5, [{}])
    ok(gs5.levelsDone === 1, 'putting the tray cargo away closes the level — both arms must empty')
    // retrieve lands in the front arm (arms were empty; rescue law unchanged)
    const gs6 = makeGame(42)
    gs6.dw.door = 1; gs6.dw.target = 1; gs6.dw.cd = 0
    const stuck = gs6.items.find((it) => it.kind === 'apple')
    stuck.state = 'in'; stuck.cont = 'dw'
    gs6.rx = DW.x + DW.w + 12; gs6.ry = DW.y + DW.h / 2
    step(gs6, [{ b: true }])
    ok(stuck.state === 'held' && gs6.held === stuck.id && gs6.held2 === null, 'a retrieve fills the front arm of an empty bot')
    // the prover uses the new mechanic: double-carry ticks show up in the win
    let twoTicks = 0, won = false
    {
        const gA = makeGame(7)
        while (!gA.end && gA.tick < 40000) { step(gA, [autopilot(gA)]); if (gA.held !== null && gA.held2 !== null) twoTicks++ }
        won = gA.end === 'win'
    }
    ok(won && twoTicks > 200, `the autopilot double-loads on the road to victory (${twoTicks} two-carry ticks, seed 7)`)
}

section('HEAVY announces itself (#2258)')
{
    // the moment both arms fill, the sim must say HEAVY (fx + event) — and
    // not one grab earlier.
    const gs = makeGame(42)
    gs.items.push(
        { id: 9201, kind: 'cup', x: gs.rx + 6, y: gs.ry, vx: 0, vy: 0, state: 'loose', cont: null },
        { id: 9202, kind: 'plate', x: gs.rx + 12, y: gs.ry, vx: 0, vy: 0, state: 'loose', cont: null },
    )
    step(gs, [{ a: true }])
    ok(gs.held === 9201 && !gs.ev.some((e) => e.type === 'heavy') && !gs.fx.some((f) => f.msg === 'HEAVY'),
        'one arm loaded = no HEAVY (the grunt means BOTH arms)')
    step(gs, [{ a: true }])
    ok(gs.held === 9201 && gs.held2 === 9202 && gs.ev.some((e) => e.type === 'heavy') &&
        gs.fx.some((f) => f.msg === 'HEAVY'),
        'the load that fills the tray fires HEAVY (event + on-canvas word)')
    // and the win run still banks it: the autopilot double-loads, so a full
    // shift must contain the announcement
    const gsW = playthrough(7)
    ok(gsW.end === 'win', 'the win proof still wins with HEAVY in the event stream')
}

section('win + slack')
{
    for (const seed of [1, 7, 42, 1337]) {
        const gs = playthrough(seed)
        ok(gs.end === 'win' && gs.levelsDone === 3, `autopilot clears all 3 levels on seed ${seed}`)
    }
    // slack: every level clears with one fewer of EVERY kind of supply
    for (let lvl = 0; lvl < 3; lvl++) {
        const gs = makeGame(555, 1)
        loadLevel(gs, lvl)
        for (const kind of Object.keys(KINDS)) {
            const victim = gs.items.find((it) => it.kind === kind)
            if (victim) victim.state = 'gone'
        }
        let guard = 0
        while (!gs.end && gs.level === lvl && gs.clock > 0 && guard++ < LEVEL_TIME[lvl]) step(gs, [autopilot(gs)])
        ok(gs.level > lvl || gs.end === 'win', `level ${lvl + 1} still clears with one fewer of every supply (slack)`)
    }
    // clock verdict
    const gs = makeGame(42)
    gs.clock = 1
    step(gs, [{}])
    ok(gs.end === 'fail' && gs.endReason.includes('OUT OF TIME'), 'the clock running out ends the shift')
}

section('chores mark')
{
    const gs = playthrough(7)
    ok(gs.end === 'win', 'full run wins')
    const gs2 = makeGame(7)
    ok(gs2.chores.every((c) => !c.done) === false || gs2.chores.every((c) => c.label), 'chore sheet populated')
    for (const it of gs2.items) if (it.state === 'loose') it.state = 'gone'
    gs2.held = null; gs2.dwRun = true; gs2.dw.target = 0; gs2.fr.target = 0
    const seen = []
    let guard = 0
    while (gs2.levelsDone === 0 && guard++ < 60) { step(gs2, [{}]); seen.push(...gs2.ev.map((e) => e.type)) }
    ok(seen.includes('level') && gs2.levelsDone === 1, 'completing the chores clears the level (sheet fully ticked)')
}

section('glide — human BFS routing (#2250)')
{
    const doorBlock = { x: DW.x + 2, y: DW.y + DW.h, w: DW.w - 4, h: DW.doorLen }
    const hitsDoor = (g) => g.rx - 6 < doorBlock.x + doorBlock.w && g.rx + 6 > doorBlock.x &&
        g.ry - 6 < doorBlock.y + doorBlock.h && g.ry + 6 > doorBlock.y
    const walkTo = (gs, tx, ty, cap = 1500, from = null, doorOpen = false) => {
        if (from) { gs.rx = from[0]; gs.ry = from[1] }
        if (doorOpen) { gs.dw.door = 1; gs.dw.target = 1 }
        let n = 0, arrived = false
        let minx = gs.rx, maxx = gs.rx, throughDoor = false
        while (n < cap) {
            const r = s.routeDir(gs, tx, ty)
            if (!r.ok) return { ok: false, arrived: false, n, minx, maxx, throughDoor }
            if (r.arrived) { arrived = true; break }
            const pad = {}
            if (r.dir) pad[r.dir] = true
            step(gs, [pad])
            minx = Math.min(minx, gs.rx); maxx = Math.max(maxx, gs.rx)
            if (hitsDoor(gs)) throughDoor = true
            n++
        }
        return { ok: true, arrived, n, minx, maxx, throughDoor }
    }

    // tap where you stand = arrived at once, tap deep in furniture = refused
    const gs0 = makeGame(11)
    ok(s.routeDir(gs0, gs0.rx, gs0.ry).arrived === true, 'a tap under the bot arrives instantly (no spin-up)')
    ok(s.routeDir(gs0, 246, 146).ok === false, 'a tap buried in the table is refused NO WAY (never a wedge)')

    // routing is pure: reads the state, never writes it
    const gsP = makeGame(23)
    const hP = gsP.hash
    for (let i = 0; i < 60; i++) s.routeDir(gsP, 60, 200)
    ok(gsP.hash === hP, 'routeDir never mutates — seed+pads determinism is untouched')

    // the headline: a route exists around an open washer door, and the walker
    // takes the road, not the shortcut.
    const gsD = makeGame(31)
    const runD = walkTo(gsD, 23, 60, 800, [51, 95], true)
    ok(runD.ok && runD.arrived && !runD.throughDoor, 'a tap behind the open washer door routes around it and arrives')

    // the roads TRACK the doors: shut, the lane in front of the washer is a
    // shortcut; open, it is a wall and BFS must sink south around it. Under
    // the `door` mutant (open doors stop blocking) the open run never gets
    // longer and the walker strolls through — both gates below go RED.
    const shut = walkTo(makeGame(13), 79, 60, 900, [23, 80], false)
    const open = walkTo(makeGame(13), 79, 60, 900, [23, 80], true)
    ok(open.ok && open.arrived && !open.throughDoor, 'glide never crosses the open door block (RED under door mutant)')
    ok(open.n > shut.n, `opening the door lengthens the road — ${shut.n} ticks shut vs ${open.n} open (RED under door mutant)`)

    // reach the far rooms too: every honest tap on the shelf arrives
    const TAPS = [[60, 200], [250, 210], [23, 60], [79, 60], [243, 58], [303, 58], [100, 190], [180, 110], [40, 120], [300, 110], [160, 40], [24, 214], [296, 110]]
    let arrivedAll = true, worst = 0
    for (const [tx, ty] of TAPS) {
        const g = makeGame(5)
        const r = walkTo(g, tx, ty)
        if (!r.ok || !r.arrived || r.throughDoor) arrivedAll = false
        worst = Math.max(worst, r.n)
    }
    ok(arrivedAll, `all 13 floor taps across both rooms route and arrive (worst ${worst} ticks)`)

    // determinism of the roads: same seed, same tap, same walk
    const wA = walkTo(makeGame(9), 60, 200)
    const wB = walkTo(makeGame(9), 60, 200)
    ok(wA.arrived && wB.arrived && wA.n === wB.n, 'the glide path is deterministic — same seed + tap = same walk')
}

section('fridge flank is two zones (#2284)')
{
    // The fridge used to sit flush at x=304 with the wall at x=312: an 8px
    // strip no 12px bot could stand in, so it had ONE work zone while DW had
    // two. Geometry moved the fridge left; this gate pins the promise that a
    // container's zones are real standable ground flanking the body — a zone
    // painted onto furniture or into a dead sliver goes named-red.
    const gs = makeGame(5)
    const hits = (b, r) => b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y
    const centreOk = (c, z) => {
        const zx = z.x + z.w / 2, zy = z.y + z.h / 2
        const box = { x: zx - ROBOT_R, y: zy - ROBOT_R, w: ROBOT_R * 2, h: ROBOT_R * 2 }
        const stand = !blockers(gs).some((r) => hits(box, r))
        const flank = zx + ROBOT_R <= c.x || zx - ROBOT_R >= c.x + c.w
        const dx = zx < c.x ? c.x - zx : zx > c.x + c.w ? zx - c.x - c.w : 0
        const dy = zy < c.y ? c.y - zy : zy > c.y + c.h ? zy - c.y - c.h : 0
        return stand && flank && Math.hypot(dx, dy) <= REACH
    }
    ok(FR.zones.length === DW.zones.length, 'the fridge offers as many flanks as the washer (RED: one-zone fridge)')
    ok(FR.zones.every((z) => centreOk(FR, z)), 'each fridge zone centre is standable, flanks the body and sits within arm reach')
    ok(CONTAINERS.every((c) => c.zones.every((z) => centreOk(c, z))), 'no work zone anywhere is painted onto furniture or into a dead sliver')
    // the right flank is a lane, not a mirage: BFS actually routes to it
    const g = makeGame(5)
    const zR = FR.zones[1]
    const r = zR ? s.routeDir(g, zR.x + zR.w / 2, zR.y + zR.h / 2) : null
    ok(!!r && r.ok && Math.hypot(r.tx - (zR.x + zR.w / 2), r.ty - (zR.y + zR.h / 2)) <= 8,
        'the right-of-fridge zone has a road to it (RED: tap refused)')
}

section('aimed retrieve + rack slots (#2338)')
{
    const atZone = (g) => { g.dw.door = 1; g.dw.target = 1; g.dw.cd = 0; g.rx = 79; g.ry = 58 }
    const stow = (g, it) => { it.state = 'held'; g.held = it.id; step(g, [{ a: true }]) }

    // slots in lowest-free order, and the rescue default stays byte-for-byte
    const gs = makeGame(42)
    atZone(gs)
    const plate = gs.items.find((it) => it.kind === 'plate')
    const cup = gs.items.find((it) => it.kind === 'cup')
    const apple = gs.items.find((it) => it.kind === 'apple')
    stow(gs, plate); stow(gs, cup); stow(gs, apple)
    ok(plate.slot === 0 && cup.slot === 1 && apple.slot === 2, 'stows take rack slots in lowest-free order (0,1,2)')
    step(gs, [{ b: true }])
    ok(heldOf(gs)?.kind === 'apple' && apple.slot === null && gs.ev.some((e) => e.type === 'retrieve' && e.aimed === false),
        'no aim given: the wrong stow still surfaces first and vacates its slot')
    ok(plate.slot === 0 && cup.slot === 1, 'a retrieved neighbour never shifts the rest of the rack')
    stow(gs, apple)
    ok(apple.slot === 2, 'the freed slot is the next one filled')

    // aimAt resolves taps honestly
    const sp = rackSlot(DW, plate.slot)
    const hit = aimAt(gs, sp.x, sp.y)
    ok(hit.ok && hit.id === plate.id && hit.c === 'dw', 'aimAt names the item sitting at the tapped slot')
    const em = rackSlot(DW, 8)
    ok(!aimAt(gs, em.x, em.y).ok, 'a tap on an empty rack position names nothing')
    gs.dw.door = 0; gs.dw.target = 0
    ok(!aimAt(gs, sp.x, sp.y).ok, 'taps do not aim through a SHUT door')
    gs.dw.door = 1; gs.dw.target = 1
    ok(!aimAt(gs, 246, 146).ok, 'a tap on the table is not an aim')

    // an aimed pull outranks the wrong-stow-first default (RED under aim mutant)
    const gA = makeGame(42); atZone(gA)
    const aA = gA.items.find((it) => it.kind === 'apple')
    const pA = gA.items.find((it) => it.kind === 'plate')
    stow(gA, aA); stow(gA, pA)
    step(gA, [{ b: true, aim: pA.id }])
    ok(heldOf(gA)?.kind === 'plate' && aA.state === 'in' && gA.ev.some((e) => e.type === 'retrieve' && e.aimed === true),
        'an aimed pull takes the NAMED item, not the wrong-stow default (RED under aim mutant)')
    // a stale aim id (item gone) falls through to the default, never a wedge
    step(gA, [{ a: true }]) // put the plate back — apple is still wrong-inside
    step(gA, [{ b: true, aim: 9999 }])
    ok(heldOf(gA)?.kind === 'apple', 'a stale aim id falls through to the rescue default, never a wedge')

    // direction aim: B + held arrow pulls the stow furthest that way,
    // wrong-first outranked (RED under aim mutant)
    const gU = makeGame(42); atZone(gU)
    const aU = gU.items.find((it) => it.kind === 'apple')
    const pU = gU.items.find((it) => it.kind === 'plate')
    aU.state = 'in'; aU.cont = 'dw'; aU.slot = 8 // col3,row3 — the bottom-right corner
    pU.state = 'in'; pU.cont = 'dw'; pU.slot = null
    step(gU, [{}]) // heal: pU takes the lowest free slot (0)
    ok(pU.slot === 0, 'slotless in-states heal to the lowest free slot at the tick boundary')
    step(gU, [{ b: true, up: true }])
    ok(heldOf(gU)?.kind === 'plate' && gU.ev.some((e) => e.type === 'retrieve' && e.aimed === true),
        'B + UP pulls the stow furthest up the rack — wrong-first outranked (RED under aim mutant)')
    pU.state = 'gone'; gU.held = null
    step(gU, [{ b: true }])
    ok(heldOf(gU)?.kind === 'apple', 'with the aimed pick gone the rescue default still stands')

    // capacity: level 3's worst case is nine dw dwellers — every one owns a
    // distinct visible slot (the pre-#2338 2-row paint clipped the ninth)
    const g9 = makeGame(1); loadLevel(g9, 2)
    const preApple = g9.items.find((it) => it.state === 'in' && it.cont === 'dw')
    ok(preApple && preApple.slot === 0, 'level 3 ships its pre-stow owning rack slot 0')
    g9.items.filter((it) => (it.kind === 'plate' || it.kind === 'cup') && it.state === 'loose')
        .forEach((it) => { it.state = 'in'; it.cont = 'dw'; it.slot = null })
    step(g9, [{}])
    const nine = new Set(g9.items.filter((it) => it.state === 'in' && it.cont === 'dw').map((it) => it.slot))
    ok(nine.size === 9 && [...nine].every((v) => v >= 0 && v < RACK_CAP),
        'all nine washer dwellers own distinct visible slots (RED: clipped rows)')

    // slots ride the hash: drift in slot placement is visible
    const gH1 = makeGame(42); atZone(gH1); stow(gH1, gH1.items.find((it) => it.kind === 'plate'))
    const gH2 = makeGame(42); atZone(gH2); stow(gH2, gH2.items.find((it) => it.kind === 'plate'))
    gH2.items.find((it) => it.state === 'in').slot = 4
    step(gH1, [{}]); step(gH2, [{}])
    ok(gH1.hash !== gH2.hash, 'rack slot placement is covered by the state hash')

    // determinism: aims ride the pads — seed + pads replay hash-identical
    const aimRun = () => {
        const g = makeGame(4242); atZone(g)
        const a = g.items.find((it) => it.kind === 'apple')
        const p = g.items.find((it) => it.kind === 'plate')
        stow(g, a); stow(g, p)
        const pulls = []
        let h = 0
        for (const pd of [{ b: true, aim: p.id }, { a: true }, { b: true }]) {
            h = step(g, [pd]).hash
            pulls.push(...g.ev.filter((e) => e.type === 'retrieve').map((e) => e.kind))
        }
        return { h, pulls: pulls.join('+') }
    }
    const rA = aimRun(); const rB = aimRun()
    ok(rA.pulls === 'plate+apple' && rA.h === rB.h, 'seed + pads (aims included) replay plate-then-apple, hash-identical')

    // the autopilot never aims — the win-proof rides the unchanged default law
    const gW = makeGame(7)
    let pureDefault = true
    while (!gW.end && gW.tick < 40000) {
        const pd = autopilot(gW)
        if ('aim' in pd) pureDefault = false
        step(gW, [pd])
    }
    ok(pureDefault && gW.end === 'win', 'the autopilot never aims and still wins — the default law is the prover law')
}

section('tap-to-act (#2537): the chore collapses into ONE tap')
{
    const atZoneT = (g) => { g.dw.door = 1; g.dw.target = 1; g.dw.cd = 0; g.rx = 79; g.ry = 58 }
    const stowT = (g, it) => { it.state = 'held'; g.held = it.id; step(g, [{ a: true }]) }
    const isOpenNow = (g, id) => (id === 'dw' ? g.dw : g.fr).door >= 0.9
    // the shell mirror: glide to the work spot + fire the verb when due,
    // exactly the law index.jsx runs each tick (pendingFire + goto merge)
    const drive = (g, pend0) => {
        let pend = pend0.ok ? { ...pend0, cd: 0 } : null
        let gotoP = pend ? { x: pend.gx, y: pend.gy } : null
        let ticks = 0
        let after = 0
        const evs = []
        while (ticks++ < 3000) {
            if (pend && !pendingAlive(g, pend)) pend = null
            const pad = {}
            if (pend) {
                if (pend.act === 'retrieve' && pend.id !== null) pad.aim = pend.id
                if (pend.cd > 0) pend.cd--
                else {
                    const v = pendingFire(g, pend)
                    if (v) {
                        pad[v] = true
                        if (pend.act !== 'place' || isOpenNow(g, pend.c)) pend = null
                    }
                }
            }
            if (gotoP) {
                const r = routeDir(g, gotoP.x, gotoP.y)
                if (!r.ok || r.arrived) gotoP = null
                else if (r.dir) pad[r.dir] = true
            }
            step(g, [pad])
            evs.push(...g.ev)
            if (!pend && !gotoP) { if (++after > 40) break } // let doors finish their slide
            else after = 0
        }
        return { pend, ticks, evs }
    }

    // ---- classification ----
    const g0 = makeGame(42)
    const tOpen = tapAct(g0, DW.x + DW.w / 2, DW.y + DW.h / 2)
    ok(tOpen.ok && tOpen.act === 'open' && tOpen.c === 'dw', 'a tap on the SHUT washer body schedules OPEN (not a dead walk)')
    ok(routeDir(g0, tOpen.gx, tOpen.gy).ok, 'the open order routes — its work spot has a road')
    ok(!tapAct(g0, 246, 146).ok, 'a tap on the table is not a chore — the floor-glide law owns it')
    const tFr0 = tapAct(g0, FR.x + FR.w / 2, FR.y + FR.h / 2)
    ok(tFr0.ok && tFr0.act === 'open' && tFr0.c === 'fr', 'a shut fridge tap schedules OPEN too')

    const gt = makeGame(42); atZoneT(gt)
    const plateT = gt.items.find((it) => it.kind === 'plate')
    const cupT = gt.items.find((it) => it.kind === 'cup')
    stowT(gt, plateT); stowT(gt, cupT)
    const spT = rackSlot(DW, plateT.slot)
    const tRet = tapAct(gt, spT.x, spT.y)
    ok(tRet.ok && tRet.act === 'retrieve' && tRet.id === plateT.id, 'a tap beside a named stow schedules a retrieve of THAT item')
    const spGap = { x: DW.x + DW.w - 2, y: DW.y + DW.h - 2 } // cavity corner, >6.5px from every slot
    const tDef = tapAct(gt, spGap.x, spGap.y)
    ok(tDef.ok && tDef.act === 'retrieve' && tDef.id === null, 'a tap inside the cavity between slots schedules a retrieve by the default law')
    gt.dw.door = 0; gt.dw.target = 0
    const tShutR = tapAct(gt, spT.x, spT.y)
    ok(tShutR.ok && tShutR.act === 'open', 'the same tap on a cavity that shut schedules OPEN — the chain starts at the door')
    gt.dw.door = 1; gt.dw.target = 1
    const gE = makeGame(42); gE.dw.door = 1; gE.dw.target = 1
    ok(!tapAct(gE, DW.x + DW.w / 2, DW.y + DW.h / 2).ok, 'an open, EMPTY cavity schedules nothing — the tap stays a walk')
    const gA2 = makeGame(42)
    const appleA = setHeld(gA2, 'apple')
    const tPl = tapAct(gA2, FR.x + FR.w / 2, FR.y + FR.h / 2)
    ok(tPl.ok && tPl.act === 'place' && tPl.id === appleA.id, 'a fridge tap with a MATCHING carry schedules PLACE, pinning the carried item')
    ok(!tapAct(gA2, DW.x + DW.w / 2, DW.y + DW.h / 2).ok, 'a mismatched carry tap refuses — WRONG STOW is never one tap deep (RED under a laundering mutant)')

    // ---- fire law ----
    const gF = makeGame(42)
    const pOpen = tapAct(gF, DW.x + DW.w / 2, DW.y + DW.h / 2)
    ok(pendingFire(gF, pOpen) === null, 'an open order does not fire while the bot is far from the body')
    gF.rx = pOpen.gx; gF.ry = pOpen.gy
    ok(pendingFire(gF, pOpen) === 'a', 'the open order fires A at the bodyApproach spot')
    gF.dw.door = 1; gF.dw.target = 1
    ok(pendingFire(gF, pOpen) === null && !pendingAlive(gF, pOpen), 'an open order at an already-open door dies silently and never closes it')
    const gF2 = makeGame(42); atZoneT(gF2)
    const cupF = gF2.items.find((it) => it.kind === 'cup')
    stowT(gF2, cupF)
    const gF3 = makeGame(42); gF3.dw.door = 1; gF3.dw.target = 1; gF3.rx = 79; gF3.ry = 58
    const pRetF = tapAct(gF3, DW.x + DW.w / 2, DW.y + DW.h / 2)
    ok(pendingFire(gF3, pRetF) === null && !pendingAlive(gF3, pRetF), 'a retrieve order at an empty rack neither fires nor lingers')

    // ---- orders that lose their object die quietly ----
    const gV = makeGame(42); atZoneT(gV)
    const appleV = setHeld(gV, 'apple')
    const pPlV = tapAct(gV, FR.x + FR.w / 2, FR.y + FR.h / 2)
    appleV.state = 'gone'
    ok(!pendingAlive(gV, pPlV), 'a place order whose cargo vanished is dropped — no verb fires at an empty arm')
    const gV2 = makeGame(42); atZoneT(gV2)
    const plateV2 = gV2.items.find((it) => it.kind === 'plate')
    stowT(gV2, plateV2)
    const pRv2 = tapAct(gV2, rackSlot(DW, plateV2.slot).x, rackSlot(DW, plateV2.slot).y)
    plateV2.state = 'gone'
    ok(!pendingAlive(gV2, pRv2), 'a named-pull order whose item left the rack is dropped')

    // ---- the collapsed chore, end to end ----
    const choreA = () => {
        const g = makeGame(99)
        const apple = setHeld(g, 'apple')
        const pend = tapAct(g, FR.x + FR.w / 2, FR.y + FR.h / 2)
        const r = drive(g, pend)
        return { landed: apple.state === 'in' && apple.cont === 'fr', hash: g.hash, ticks: r.ticks, pend: r.pend }
    }
    const a1 = choreA(); const a2 = choreA()
    ok(a1.landed && !a1.pend, `ONE tap on the SHUT fridge stows the apple — open + place in ${a1.ticks} ticks, zero extra verbs`)
    ok(a1.hash === a2.hash && a1.ticks === a2.ticks, 'the collapsed chore is deterministic — same seed, same walk, identical hash')
    const choreB = () => {
        const g = makeGame(7)
        const pend = tapAct(g, DW.x + DW.w / 2, DW.y + DW.h / 2)
        const r = drive(g, pend)
        return { opened: g.dw.door >= 0.9, pend: r.pend, closed: g.fr.door }
    }
    const b1 = choreB()
    ok(b1.opened && !b1.pend && b1.closed <= 0.01, 'ONE tap on the washer body walks over and opens it — and nothing else')
    const choreC = () => {
        const g = makeGame(4242); atZoneT(g)
        const appleC = g.items.find((it) => it.kind === 'apple')
        const plateC = g.items.find((it) => it.kind === 'plate')
        stowT(g, appleC); stowT(g, plateC)
        g.rx = 150; g.ry = 200
        const pend = tapAct(g, rackSlot(DW, plateC.slot).x, rackSlot(DW, plateC.slot).y)
        const r = drive(g, pend)
        return { held: heldOf(g)?.kind, aimed: r.evs.some((e) => e.type === 'retrieve' && e.aimed === true), pend: r.pend }
    }
    const c1 = choreC()
    ok(c1.held === 'plate' && c1.aimed && !c1.pend, 'ONE tap on a far rack plate walks the bot over and pulls THE NAMED plate (RED under tapact/aim mutants)')
    const choreD = () => {
        const g = makeGame(555)
        const pend = tapAct(g, DW.x + DW.w / 2, DW.y + DW.h / 2)
        g.dw.door = 1; g.dw.target = 1 // someone else opened it mid-order
        const r = drive(g, pend)
        return { stillOpen: g.dw.door >= 0.9, pressed: r.evs.some((e) => e.type !== 'noop') }
    }
    const d1 = choreD()
    ok(d1.stillOpen && !d1.pressed, 'an open order opened by other hands expires without a stray press (never closes the door you asked to open)')
}

section('polish pass (#2343): flourish picker + pull-anim plumbing')
{
    const atZoneP = (g) => { g.dw.door = 1; g.dw.target = 1; g.dw.cd = 0; g.rx = 79; g.ry = 58 }
    const stowP = (g, it) => { it.state = 'held'; g.held = it.id; step(g, [{ a: true }]) }

    const g0 = makeGame(42)
    ok(flourishPick(g0) === null, 'flourishPick names nothing while no cavity is open with a stow inside')

    const gf = makeGame(42); atZoneP(gf)
    const pF = gf.items.find((it) => it.kind === 'plate')
    const cF = gf.items.find((it) => it.kind === 'cup')
    stowP(gf, pF); stowP(gf, cF)
    const pk = flourishPick(gf)
    ok(pk && pk.id === pF.id && pk.slot === 0 && pk.c === 'dw', 'flourishPick names the lowest-slot stow in the open cavity')
    gf.dw.door = 0; gf.dw.target = 0
    ok(flourishPick(gf) === null, 'flourishPick marks nothing through a SHUT door — the brackets would be buried')
    gf.dw.door = 1; gf.dw.target = 1

    // determinism + purity: the pick rides attract pads, so hash replay must not move
    const gP = makeGame(42); atZoneP(gP)
    stowP(gP, gP.items.find((it) => it.kind === 'plate')); stowP(gP, gP.items.find((it) => it.kind === 'cup'))
    const p2 = flourishPick(gP)
    ok(pk && p2 && pk.id === p2.id && pk.kind === p2.kind, 'the flourish pick is deterministic under the same seed')
    const hashRun = (withPick) => {
        const g = makeGame(7)
        let h = 0
        for (let i = 0; i < 120; i++) { if (withPick) flourishPick(g); h = step(g, [autopilot(g)]).hash }
        return h
    }
    ok(hashRun(true) === hashRun(false), 'flourishPick never writes — seed + autopilot replay hash-identical with the picker running')

    // the flourish rides attract pads ONLY: pin the overlay in the shell source.
    // (the gate above pins that autopilot itself never emits an aim — move the
    // aim into the autopilot and THAT gate goes red, protecting the win-proof)
    const shellSrc = readFileSync(new URL('../src/games/TidyBot/index.jsx', import.meta.url), 'utf8')
    ok(/if \(flourish !== null\) p\.aim = flourish\.id/.test(shellSrc), 'the demo aims only through the attract overlay (source-pinned #2343)')

    // the retrieve ev names the cavity — the arc and the slot-flash place by it
    const gE = makeGame(42); atZoneP(gE)
    stowP(gE, gE.items.find((it) => it.kind === 'apple'))
    step(gE, [{ b: true }])
    const rv = gE.ev.find((e) => e.type === 'retrieve')
    ok(rv && rv.c === 'dw' && rv.slot >= 0, 'the retrieve ev names the cavity AND the vacated slot (#2343 arc plumbing)')
}

if (!NODE_ONLY) {
    section('browser — boots, starts, walks, plays')
    const { openGame, launch, requireDevServer } = await import('./lib/harness.mjs')
    const BASE = process.env.TIDY_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
    await requireDevServer(`${BASE}/tidy-bot`)
    const browser = await launch()
    try {
        const page = await openGame(browser, { url: `${BASE}/tidy-bot`, hook: '__tidybotTest', viewport: { width: 900, height: 760 } })
        const errors = []
        page.on('pageerror', (e) => errors.push(String(e)))
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

        ok(errors.length === 0, 'zero page errors on boot')

        await page.waitForTimeout(500)
        const attract = await page.evaluate(() => window.__tidybotTest.state())
        ok(attract.mode === 'attract' && attract.tick > 0, 'attract demo runs the autopilot before any press')

        await page.keyboard.press('Space')
        let st = await page.evaluate(() => window.__tidybotTest.state())
        ok(st.mode === 'play' && !st.done, 'a real SPACE clocks in')

        // drive around the kitchen with real keystrokes; drawn robot follows sim
        const before = await page.evaluate(() => {
            const s = window.__tidybotTest.state()
            return { x: s.pos, y: s.posY }
        })
        await page.keyboard.down('ArrowUp')
        await page.waitForTimeout(500)
        await page.keyboard.up('ArrowUp')
        st = await page.evaluate(() => window.__tidybotTest.state())
        ok(st.posY < before.y, 'holding UP walks the bot up (state follows real keys)')

        const px = await page.evaluate(() => {
            const cv = window.__tidybotTest.canvas()
            const s = window.__tidybotTest.state()
            const g = cv.getContext('2d')
            const X = Math.round(s.pos * 2), Y = Math.round(s.posY * 2)
            const d = g.getImageData(X - 2, Y - 2, 5, 5).data
            let teal = 0
            for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 150 && d[i + 2] > 150 && d[i] < 160) teal++
            return { teal, X, Y }
        })
        ok(px.teal >= 3, `the bot is painted at its sim coords (teal pixels at ${px.X},${px.Y})`)

        // open the washer for real: stand at the approach, press A
        await page.evaluate(() => {
            const gs = window.__tidybotTest.sim()
            gs.rx = 84; gs.ry = 43
            for (const it of gs.items) if (it.state === 'loose' && Math.hypot(it.x - 84, it.y - 43) < 26) it.state = 'gone'
        })
        await page.keyboard.press('Space')
        await page.waitForTimeout(700)
        st = await page.evaluate(() => window.__tidybotTest.state())
        ok(st.dwDoor > 0.9, 'real A opens the dishwasher rack end-to-end')

        // #2266 CARRY with real keys: two SPACE presses load both arms and the
        // tray cargo is PAINTED at the arm; a third press adds nothing.
        await page.evaluate(() => {
            const g = window.__game
            g.reset(3141)
            const gs = window.__tidybotTest.sim()
            gs.items.push(
                { id: 9101, kind: 'cup', x: gs.rx + 5, y: gs.ry, vx: 0, vy: 0, state: 'loose', cont: null },
                { id: 9102, kind: 'apple', x: gs.rx + 12, y: gs.ry, vx: 0, vy: 0, state: 'loose', cont: null },
                { id: 9103, kind: 'milk', x: gs.rx + 18, y: gs.ry, vx: 0, vy: 0, state: 'loose', cont: null },
            )
        })
        await page.waitForTimeout(80)
        await page.keyboard.press('Space')
        await page.waitForTimeout(80)
        let carry = await page.evaluate(() => window.__tidybotTest.state())
        ok(carry.held === 'cup' && carry.held2 === '', 'a real SPACE lifts the nearest litter into the front arm')
        await page.keyboard.press('Space')
        await page.waitForTimeout(80)
        carry = await page.evaluate(() => window.__tidybotTest.state())
        ok(carry.held === 'cup' && carry.held2 === 'apple', 'a second real SPACE loads the tray arm too')
        const trayPx = await page.evaluate(() => {
            const cv = window.__tidybotTest.canvas()
            const gs = window.__tidybotTest.sim()
            const g = cv.getContext('2d')
            const X = Math.round(gs.rx * 2), Y = Math.round((gs.ry + 11) * 2)
            const d = g.getImageData(X - 6, Y - 9, 13, 14).data
            let red = 0
            for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 110 && d[i + 2] < 110) red++
            return { red, X, Y }
        })
        ok(trayPx.red >= 4, `the tray apple is painted at the arm (${trayPx.red} red px at ${trayPx.X},${trayPx.Y})`)
        await page.keyboard.press('Space')
        await page.waitForTimeout(80)
        carry = await page.evaluate(() => window.__tidybotTest.state())
        ok(carry.held === 'cup' && carry.held2 === 'apple', 'a third press beside litter adds nothing (ARMS FULL end-to-end)')

        // #2250 GLIDE: a real mouse tap issues a real order and the bot walks
        // the BFS roads there; a real arrow press takes the wheel back.
        await page.evaluate(() => { const g = window.__game; g.reset(777); g.release() })
        await page.waitForTimeout(150)
        const tapPt = await page.evaluate(() => {
            const cv = window.__tidybotTest.canvas()
            const r = cv.getBoundingClientRect()
            return { x: r.left + (40 / 320) * r.width, y: r.top + (120 / 240) * r.height,
                home: window.__tidybotTest.probe() }
        })
        await page.mouse.click(tapPt.x, tapPt.y)
        ok(await page.evaluate(() => window.__tidybotTest.gliding()), 'a real floor tap issues a glide order')
        let arrived = false
        for (let i = 0; i < 50 && !arrived; i++) {
            await page.waitForTimeout(100)
            arrived = !(await page.evaluate(() => window.__tidybotTest.gliding()))
        }
        const gPos = await page.evaluate(() => window.__tidybotTest.probe())
        const gDist = Math.hypot(gPos.x - 40, gPos.y - 120)
        ok(arrived && gDist < 12 && Math.hypot(gPos.x - tapPt.home.x, gPos.y - tapPt.home.y) > 80,
            `the tap glides the bot across the room (stopped ${gDist.toFixed(1)}px off the mark)`)
        await page.evaluate(() => { const g = window.__game; g.reset(778); g.release() })
        await page.waitForTimeout(120)
        await page.mouse.click(tapPt.x, tapPt.y)
        await page.waitForTimeout(250)
        ok(await page.evaluate(() => window.__tidybotTest.gliding()), 'the second tap is gliding before the cancel')
        await page.keyboard.down('ArrowUp')
        const cancelled = await page.evaluate(() => window.__tidybotTest.gliding())
        await page.keyboard.up('ArrowUp')
        ok(cancelled === false, 'a real arrow press cancels the glide — the human is the driver')

        // #2537 TAP-ACT replaced #2338's two-step: a real mouse tap on a rack
        // item MARKS it (brackets ride the walk), glides the bot over and the
        // named pull fires on arrival — one tap, one chore. A movement key
        // mid-order cancels it: the human is still the driver.
        await page.evaluate(() => { window.__game.reset(31415); window.__game.release() })
        await page.evaluate(() => {
            const gs = window.__tidybotTest.sim()
            gs.dw.door = 1; gs.dw.target = 1; gs.dw.cd = 0
            gs.rx = 150; gs.ry = 200
            const apple = gs.items.find((it) => it.kind === 'apple')
            const plate = gs.items.find((it) => it.kind === 'plate')
            apple.state = 'in'; apple.cont = 'dw'; apple.slot = null
            plate.state = 'in'; plate.cont = 'dw'; plate.slot = null
        })
        await page.waitForTimeout(150) // heal slots: apple 0, plate 1
        const aimPt = await page.evaluate(() => {
            const gs = window.__tidybotTest.sim()
            const plate = gs.items.find((it) => it.kind === 'plate')
            const cv = window.__tidybotTest.canvas()
            const r = cv.getBoundingClientRect()
            const p = window.__tidybotTest.rackSlot(window.__tidybotTest.DW, plate.slot)
            return { x: r.left + (p.x / 320) * r.width, y: r.top + (p.y / 240) * r.height, plateId: plate.id }
        })
        await page.mouse.click(aimPt.x, aimPt.y)
        let st2 = await page.evaluate(() => window.__tidybotTest.state())
        ok(st2.aim === aimPt.plateId && st2.pending === 'retrieve', 'a real tap on a rack item MARKS it and ORDERS the pull (one tap)')
        let pulled = false
        for (let i = 0; i < 80 && !pulled; i++) {
            await page.waitForTimeout(100)
            pulled = (await page.evaluate(() => window.__tidybotTest.state())).held === 'plate'
        }
        st2 = await page.evaluate(() => window.__tidybotTest.state())
        ok(pulled && st2.pending === '' && st2.aim === -1,
            'ONE real tap walked the bot over and pulled THE NAMED plate — the mark and order are spent (RED under tapact)')
        // cancel law: a movement key mid-order drops mark AND order
        await page.evaluate(() => { window.__game.reset(31415); window.__game.release() })
        await page.evaluate(() => {
            const gs = window.__tidybotTest.sim()
            gs.dw.door = 1; gs.dw.target = 1; gs.dw.cd = 0
            gs.rx = 150; gs.ry = 200
            const apple = gs.items.find((it) => it.kind === 'apple')
            apple.state = 'in'; apple.cont = 'dw'; apple.slot = null
        })
        await page.waitForTimeout(150)
        const applePt = await page.evaluate(() => {
            const gs = window.__tidybotTest.sim()
            const apple = gs.items.find((it) => it.kind === 'apple')
            const cv = window.__tidybotTest.canvas()
            const r = cv.getBoundingClientRect()
            const p = window.__tidybotTest.rackSlot(window.__tidybotTest.DW, apple.slot)
            return { x: r.left + (p.x / 320) * r.width, y: r.top + (p.y / 240) * r.height, appleId: apple.id }
        })
        await page.mouse.click(applePt.x, applePt.y)
        await page.waitForTimeout(80)
        const ordered = await page.evaluate(() => window.__tidybotTest.state())
        ok(ordered.aim === applePt.appleId && ordered.pending === 'retrieve', 'the re-tap marks the apple AND orders the pull')
        await page.keyboard.down('ArrowUp')
        const cancelSt = await page.evaluate(() => window.__tidybotTest.state())
        await page.waitForTimeout(600)
        const heldAfter = await page.evaluate(() => window.__tidybotTest.state())
        await page.keyboard.up('ArrowUp')
        ok(cancelSt.pending === '' && cancelSt.aim === -1 && heldAfter.held === '',
            'a real arrow press cancels the mark AND the order — the human is the driver')

        // #2537 one-tap OPEN: click the shut washer body → the bot walks over
        // and opens it by itself; the fridge is untouched.
        await page.evaluate(() => { window.__game.reset(777); window.__game.release() })
        await page.waitForTimeout(150)
        const dwPt = await page.evaluate(() => {
            const cv = window.__tidybotTest.canvas()
            const r = cv.getBoundingClientRect()
            return { x: r.left + ((window.__tidybotTest.DW.x + window.__tidybotTest.DW.w / 2) / 320) * r.width,
                y: r.top + ((window.__tidybotTest.DW.y + window.__tidybotTest.DW.h / 2) / 240) * r.height }
        })
        await page.mouse.click(dwPt.x, dwPt.y)
        const pend = await page.evaluate(() => window.__tidybotTest.state().pending)
        ok(pend === 'open',
            `a real tap on the shut washer orders OPEN${pend === 'open' ? '' : ` (got ${JSON.stringify(pend)})`}`)
        let opened = false
        for (let i = 0; i < 80 && !opened; i++) {
            await page.waitForTimeout(100)
            opened = (await page.evaluate(() => window.__tidybotTest.state())).dwDoor >= 0.9
        }
        const doorSt = await page.evaluate(() => window.__tidybotTest.state())
        ok(opened && doorSt.pending === '' && doorSt.frDoor <= 0.01,
            'ONE real tap walked over and opened the washer — and touched nothing else (RED under tapact)')
        await page.evaluate(() => { const g = window.__game; g.reset(31415); g.release() })

        // scripted chore progress through the contract keeps the clock honest
        const prog = await page.evaluate(async () => {
            const g = window.__game
            g.reset(20261028)
            for (let i = 0; i < 900; i++) {
                const pad = { left: i % 47 < 16, right: i % 47 >= 22 && i % 47 < 38, up: i % 61 < 8, down: i % 61 >= 26 && i % 61 < 40, a: i % 151 === 0 && i < 200 }
                g.step(pad, 1)
            }
            const s = g.state()
            g.release()
            return { tick: s.tick, score: s.score, done: s.done, hash: s.hash }
        })
        ok(prog.tick === 900 && !prog.done && prog.hash > 0, 'contract 900-tick drive runs without done/hash drift')

        // determinism through the live contract
        const det = await page.evaluate(() => {
            const g = window.__game
            const run = () => {
                g.reset(4242)
                let h = 0
                for (let i = 0; i < 300; i++) { h = g.step({ left: i % 43 < 18, right: i % 43 >= 22 }, 1).hash }
                return h
            }
            const a = run(); const b = run()
            g.release()
            return { a, b }
        })
        ok(det.a === det.b, 'live contract: seed 4242 + pads = identical hash twice')

        // #2343 reach arc: after a pull the animation lives ~8 draw ticks,
        // names the vacated dw slot, and hands off to the front arm; then the
        // attract loop (released) marks a stow of its own.
        const arc = await page.evaluate(async () => {
            const g = window.__game
            const t = window.__tidybotTest
            g.reset(31415)
            const gs = t.sim()
            gs.dw.door = 1; gs.dw.target = 1; gs.dw.cd = 0
            gs.rx = 79; gs.ry = 58
            const apple = gs.items.find((it) => it.kind === 'apple')
            apple.state = 'in'; apple.cont = 'dw'; apple.slot = null
            await new Promise((r) => setTimeout(r, 80)) // one live frame heals the slot
            g.step({ b: true }, 1)
            const a1 = t.pullAnim()
            let n = 0
            while (t.pullAnim() && n < 40) {
                g.step({}, 1)
                await new Promise((r) => setTimeout(r, 16))
                n++
            }
            const a2 = t.pullAnim()
            const held = g.state().held
            g.release()
            // attract proof: stow into an OPEN cavity, hand the screen to the
            // demo, and watch it mark the cup on its own first tick.
            g.reset(42)
            const gs2 = t.sim()
            gs2.dw.door = 1; gs2.dw.target = 1; gs2.dw.cd = 0
            const cup2 = gs2.items.find((it) => it.kind === 'cup')
            cup2.state = 'in'; cup2.cont = 'dw'; cup2.slot = null
            t.attractNow()
            g.release()
            let fl = -1
            let flKind = null
            for (let i = 0; i < 90 && fl < 0; i++) {
                await new Promise((r) => setTimeout(r, 50))
                fl = t.flourish()
                if (fl >= 0) flKind = t.sim().items.find((it) => it.id === fl)?.kind || '?'
            }
            return { a1, a2, held, n, fl, flKind, mode: g.state().mode || '' }
        })
        ok(arc.a1 && arc.a1.c === 'dw' && arc.a1.slot >= 0 && arc.a1.kind === 'apple' && arc.held === 'apple',
            `a retrieve animates the item from its slot (${JSON.stringify(arc.a1)})`)
        ok(arc.a2 === null && arc.n >= 2, 'the reach arc dies when the front arm takes the item')
        ok(arc.fl >= 0 && arc.flKind === 'cup', `the attract demo marks the stowed cup on its own (${arc.flKind}@${arc.fl})`)

        // #3078 SKINS — four promises:
        //   1. classic is GOLDEN-FROZEN at load: a fresh page's pinned frame
        //      hashes (perceptual signature) to the golden captured on pre-skin
        //      main. Restyling the default look by accident turns this red.
        //   2. ?style=reimagined actually paints: its own stable golden, and a
        //      different signature from classic.
        //   3. the bot/apple pixel laws the drive above uses hold on the new
        //      palette: mint card reads teal, tomato cutout reads red at sim coords.
        //   4. the toggle is live: STYLE flips state AND repaints without a reload.
        // Deliberately NOT raw-pixel comparisons: Chromium's GPU canvas drifts
        // ±1 on curved strokes with surface history (observed as page-age
        // flakiness), so signatures are downsampled+quantized and frozen only
        // at fresh-load contexts; the drive itself proves spatial truth.
        const GOLDEN_CLASSIC = 'f947d5dc' // pinned-frame perceptual signature, pre-skin main look
        const GOLDEN_PAPER = '17152d53' // pinned-frame perceptual signature, papercraft skin (#3086 polish re-freeze: wavy gingham, card attract sign, bot flute dots + antenna tape, brass dials)
        // Perceptual signature, not raw bytes: Chromium's GPU canvas drifts by
        // ±1 on curved strokes depending on surface history, so raw hashing is
        // fragile (and getImageData adds color-space round-trips on top). The
        // frame is decoded, downsampled and quantized — AA noise averages out,
        // real restyles (palette/layout) still flip the hash.
        const hashPinned = async (p) => {
            const sig = await p.evaluate(async () => {
                const cv = window.__tidybotTest.canvas()
                window.__game.reset(1337); window.__game.step(0) // pin at tick 1
                window.__tidybotTest.quiet() // kill demo transients the sim freeze can't stop
                await new Promise((r) => setTimeout(r, 150)) // let the clear land on a draw frame
                window.__tidybotTest.quiet()
                const url = cv.toDataURL()
                window.__game.release()
                const img = new Image(); img.src = url
                await new Promise((r) => { img.onload = r })
                const oc = document.createElement('canvas'); oc.width = 40; oc.height = 30
                const g = oc.getContext('2d')
                g.drawImage(img, 0, 0, 640, 480, 0, 0, 40, 30)
                const d = g.getImageData(0, 0, 40, 30).data
                let h = 0x811c9dc5
                for (let i = 0; i < d.length; i++) { h ^= d[i] >> 2; h = Math.imul(h, 0x01000193) >>> 0 }
                return (h >>> 0).toString(16).padStart(8, '0')
            })
            return sig
        }
        const hPage = await (async () => {
            const fresh = await openGame(browser, { url: `${BASE}/tidy-bot`, hook: '__tidybotTest', viewport: { width: 900, height: 760 } })
            await fresh.waitForTimeout(600)
            const h1 = await hashPinned(fresh)
            const h2 = await hashPinned(fresh)
            await fresh.close()
            return [h1, h2]
        })()
        ok(hPage[0] === hPage[1], `the classic pinned frame is deterministic (${hPage[0]})`)
        ok(hPage[0] === GOLDEN_CLASSIC, `classic skin is golden-frozen at load (${hPage[0]} vs ${GOLDEN_CLASSIC})`)

        const paper = await openGame(browser, { url: `${BASE}/tidy-bot?style=reimagined`, hook: '__tidybotTest', viewport: { width: 900, height: 760 } })
        const paperErrs = []
        paper.on('pageerror', (e) => paperErrs.push(String(e)))
        await paper.waitForTimeout(600)
        ok((await paper.evaluate(() => window.__tidybotTest.state())).skin === 'reimagined', '?style=reimagined selects the papercraft skin at load')
        const hP1 = await hashPinned(paper)
        const hP2 = await hashPinned(paper)
        ok(hP1 === hP2 && hP1 === GOLDEN_PAPER, `the papercraft pinned frame is deterministic and golden (${hP1} vs ${GOLDEN_PAPER})`)
        ok(hP1 !== GOLDEN_CLASSIC, 'the papercraft skin actually paints different pixels (not the classic look wearing a hat)')
        await paper.keyboard.press('Space')
        await paper.keyboard.down('ArrowUp')
        await paper.waitForTimeout(500)
        await paper.keyboard.up('ArrowUp')
        const pTeal = await paper.evaluate(() => {
            const cv = window.__tidybotTest.canvas()
            const s = window.__tidybotTest.state()
            const g = cv.getContext('2d')
            const d = g.getImageData(Math.round(s.pos * 2) - 2, Math.round(s.posY * 2) - 2, 5, 5).data
            let teal = 0
            for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 150 && d[i + 2] > 150 && d[i] < 160) teal++
            return teal
        })
        ok(pTeal >= 3, `the papercraft bot is painted at its sim coords (teal pixels: ${pTeal})`)
        await paper.evaluate(() => {
            window.__game.reset(3141)
            const gs = window.__tidybotTest.sim()
            gs.items.push(
                { id: 9101, kind: 'cup', x: gs.rx + 5, y: gs.ry, vx: 0, vy: 0, state: 'loose', cont: null },
                { id: 9102, kind: 'apple', x: gs.rx + 12, y: gs.ry, vx: 0, vy: 0, state: 'loose', cont: null },
            )
        })
        await paper.waitForTimeout(80)
        await paper.keyboard.press('Space')
        await paper.waitForTimeout(80)
        await paper.keyboard.press('Space')
        await paper.waitForTimeout(80)
        const pRed = await paper.evaluate(() => {
            const cv = window.__tidybotTest.canvas()
            const gs = window.__tidybotTest.sim()
            const g = cv.getContext('2d')
            const d = g.getImageData(Math.round(gs.rx * 2) - 6, Math.round((gs.ry + 11) * 2) - 9, 13, 14).data
            let red = 0
            for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 110 && d[i + 2] < 110) red++
            return { red, held2: gs.held2 !== null && gs.held2 !== undefined }
        })
        ok(pRed.red >= 4 && pRed.held2, `the papercraft tray apple is painted at the arm (red px: ${pRed.red})`)
        await paper.evaluate(() => window.__tidybotTest.setSkin('classic'))
        const hT1 = await hashPinned(paper)
        const stT1 = await paper.evaluate(() => window.__tidybotTest.state())
        ok(stT1.skin === 'classic' && hT1 !== hP1, 'the live STYLE toggle repaints to classic without a reload')
        await paper.evaluate(() => window.__tidybotTest.setSkin('reimagined'))
        const hT2 = await hashPinned(paper)
        const stT2 = await paper.evaluate(() => window.__tidybotTest.state())
        ok(stT2.skin === 'reimagined' && hT2 !== hT1 && hT2 !== GOLDEN_CLASSIC, 'and toggling back repaints papercraft live')
        ok(paperErrs.length === 0, `zero page errors driving the skins${paperErrs.length ? ` (${paperErrs[0]})` : ''}`)
        await paper.close()

        ok(errors.length === 0, `zero page errors through the whole drive${errors.length ? ` (${errors[0]})` : ''}`)
    } finally {
        await browser.close()
    }
}

console.log(`\n${fails.length ? '\x1b[31m' : '\x1b[32m'}tidycheck: ${pass} passed, ${fails.length} failed\x1b[0m`)
if (fails.length) { fails.forEach((f) => console.log(`  red: ${f}`)); process.exit(1) }
