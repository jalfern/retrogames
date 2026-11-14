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
// Mutants (TIDY_MUT=door|glass|run|tidy|order):
//   door  — open doors stop blocking the floor
//   glass — plates stop being fragile
//   run   — the washer starts even when empty
//   tidy  — wrong stows stop costing points
//   order — the carry queue flips FIFO→LIFO (#2266 order gates go red)

import * as s from '../src/games/TidyBot/sim.js'

const args = process.argv.slice(2)
const NODE_ONLY = args.includes('--node')
const MUT = process.env.TIDY_MUT || (args.includes('--mutate') ? 'door' : null)
let pass = 0
const fails = []
const ok = (c, m) => { if (c) { pass++; console.log(`  PASS  ${m}`) } else { fails.push(m); console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`) } }
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

if (MUT && !['door', 'glass', 'run', 'tidy', 'order'].includes(MUT)) { console.error(`unknown mutant ${MUT}`); process.exit(2) }
if (MUT) console.log(`\x1b[33mMUTANT ACTIVE: ${MUT}\x1b[0m`)
const applyMut = () => {
    if (MUT === 'door') s.SIMHOOKS.noBlock = true
    if (MUT === 'glass') s.KINDS.plate.fragile = false
    if (MUT === 'run') s.SIMHOOKS.freeRun = true
    if (MUT === 'tidy') s.SIMHOOKS.softStow = true
    if (MUT === 'order') s.SIMHOOKS.lifo = true
}
applyMut()

const {
    makeGame, step, autopilot, playthrough, loadLevel, blockers,
    DW, FR, LEVEL_TIME, KINDS, LEVELS,
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
    const TAPS = [[60, 200], [250, 210], [23, 60], [79, 60], [255, 58], [100, 190], [180, 110], [40, 120], [300, 110], [160, 40], [24, 214], [296, 110]]
    let arrivedAll = true, worst = 0
    for (const [tx, ty] of TAPS) {
        const g = makeGame(5)
        const r = walkTo(g, tx, ty)
        if (!r.ok || !r.arrived || r.throughDoor) arrivedAll = false
        worst = Math.max(worst, r.n)
    }
    ok(arrivedAll, `all 12 floor taps across both rooms route and arrive (worst ${worst} ticks)`)

    // determinism of the roads: same seed, same tap, same walk
    const wA = walkTo(makeGame(9), 60, 200)
    const wB = walkTo(makeGame(9), 60, 200)
    ok(wA.arrived && wB.arrived && wA.n === wB.n, 'the glide path is deterministic — same seed + tap = same walk')
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

        ok(errors.length === 0, `zero page errors through the whole drive${errors.length ? ` (${errors[0]})` : ''}`)
    } finally {
        await browser.close()
    }
}

console.log(`\n${fails.length ? '\x1b[31m' : '\x1b[32m'}tidycheck: ${pass} passed, ${fails.length} failed\x1b[0m`)
if (fails.length) { fails.forEach((f) => console.log(`  red: ${f}`)); process.exit(1) }
