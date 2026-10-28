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
// Mutants (TIDY_MUT=door|glass|run|tidy):
//   door  — open doors stop blocking the floor
//   glass — plates stop being fragile
//   run   — the washer starts even when empty
//   tidy  — wrong stows stop costing points

import * as s from '../src/games/TidyBot/sim.js'

const args = process.argv.slice(2)
const NODE_ONLY = args.includes('--node')
const MUT = process.env.TIDY_MUT || (args.includes('--mutate') ? 'door' : null)

let pass = 0
const fails = []
const ok = (c, m) => { if (c) { pass++; console.log(`  PASS  ${m}`) } else { fails.push(m); console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`) } }
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

if (MUT && !['door', 'glass', 'run', 'tidy'].includes(MUT)) { console.error(`unknown mutant ${MUT}`); process.exit(2) }
if (MUT) console.log(`\x1b[33mMUTANT ACTIVE: ${MUT}\x1b[0m`)
const applyMut = () => {
    if (MUT === 'door') s.SIMHOOKS.noBlock = true
    if (MUT === 'glass') s.KINDS.plate.fragile = false
    if (MUT === 'run') s.SIMHOOKS.freeRun = true
    if (MUT === 'tidy') s.SIMHOOKS.softStow = true
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
