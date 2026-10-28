// PICK RUSH — the shift audit (issue #1142).
//
//   npm run pickcheck              # Node rules + determinism + win proof + real drive
//   npm run pickcheck -- --node   # Node-only gates (no browser)
//   npm run pickcheck -- --mutate # silence ONE load-bearing rule, watch NAMED gates red
//
// Node proves the rules that make it a sorter (clamping, bin judging, the
// glass threshold, barrel slip, fuses, quota verdicts, the shift ladder) and
// the promise behind them (seeded determinism; the shipped autopilot clears
// every quota on three seeds; the parity rival keeps a head-to-head honest).
// Chrome proves it is PLAYABLE: boots clean, starts on a real Space, the
// cable and cargo pixels land exactly where the sim says after real strokes,
// and three wrong-bin drops fire the line and clock you back in.
//
// Mutants (PICK_MUT=judge|glass|roll|quota):
//   judge — CRATE stops belonging to its bin
//   glass — bottles stop being fragile
//   roll  — barrels stop rolling (nothing can ever slip)
//   quota — shift 1's quota becomes unreachable

import * as s from '../src/games/PickRush/sim.js'
import { scriptFor } from './lib/contractGames.mjs'

const args = process.argv.slice(2)
const NODE_ONLY = args.includes('--node')
const MUT = process.env.PICK_MUT || (args.includes('--mutate') ? 'judge' : null)

let pass = 0
const fails = []
const ok = (c, m) => { if (c) { pass++; console.log(`  PASS  ${m}`) } else { fails.push(m); console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`) } }
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

if (MUT) {
    if (!['judge', 'glass', 'roll', 'quota'].includes(MUT)) { console.error(`unknown mutant ${MUT}`); process.exit(2) }
    console.log(`\x1b[33mMUTANT ACTIVE: ${MUT}\x1b[0m`)
}
const applyMut = () => {
    if (MUT === 'judge') s.KINDS.crate.bin = 1
    if (MUT === 'glass') s.KINDS.bottle.fragile = false
    if (MUT === 'roll') s.KINDS.barrel.roll = false
    if (MUT === 'quota') s.SHIFTS[0].quota = 99999
}
applyMut()

const {
    makeGame, step, autopilot, stateHash,
    BELT_Y, BIN_TOP, BELT_END, CARRY_TIP, CLAW_DOWN, FUSES, SHIFT_TICKS,
    KINDS, BINS, SHIFTS,
} = s

const CAN_BIN = BINS[1]
const CRATE_BIN = BINS[0]
const BOTTLE_BIN = BINS[2]

// helper: drive the crane the way a player does — lead the moving target for
// the claw's descent time, dip, and keep tracking while the jaws fall
const grabFrom = (gs, item, cap = 500, pin = null) => {
    let n = 0, pressed = false
    while (n < cap) {
        if (pin) pin()
        const arm = gs.arms[0]
        if (arm.held === item.id) break
        if (item.carriedBy === -1 && !item.onBelt) return false
        const vb = 1.05 * SHIFTS[Math.min(gs.shift, SHIFTS.length - 1)].speed
        const dx = item.x - arm.x
        const lead = vb * Math.ceil((CLAW_DOWN - arm.tip) / 3)
        const pad = { left: false, right: false, a: false }
        if (!pressed && gs.tick > 1) {
            const want = dx - lead
            if (want > 1.5) pad.right = true
            else if (want < -1.5) pad.left = true
            else { pad.a = true; pressed = true }
        } else if (pressed && arm.held === null) {
            if (dx > 8) pad.right = true
            else if (dx < -8) pad.left = true
        }
        step(gs, [pad])
        n++
    }
    return gs.arms[0].held === item.id
}

const dropOver = (gs, x, cap = 400, keep = {}) => {
    let n = 0
    while (n < cap && gs.arms[0].held !== null) {
        const dx = x - gs.arms[0].x
        const pad = { left: dx < -1.5, right: dx > 1.5, a: false, ...keep }
        step(gs, [pad])
        n++
    }
    // settle the carriage (kills drift) before the release edge
    for (let k = 0; k < 3 && gs.arms[0].held !== null; k++) step(gs, [{ a: false, ...keep }])
    step(gs, [{ a: false }])
    step(gs, [{ a: true }])
}

const spawnAt = (gs, kind, x) => {
    const K = KINDS[kind]
    const it = { id: 8000 + gs.tick, n: gs.spawnN++, kind, x, y: BELT_Y - K.h / 2, vx: 0, vy: 0, rot: 0, onBelt: true, carriedBy: -1, fragile: K.fragile }
    gs.items.push(it)
    return it
}

// drive free-fall out of the system: step until the item resolves
const resolve = (gs, cap = 120) => {
    const n0 = gs.tick
    while (gs.tick - n0 < cap && gs.items.length > 0 && !gs.end) step(gs, [{ a: false }])
}

// ---------------------------------------------------------------- Node gates
section('RULES — the crane')
{
    const gs = makeGame(11, 1)
    while (gs.tick < 40) step(gs, [{}])
    const it = spawnAt(gs, 'can', 200)
    gs.arms[0].x = it.x
    const grabbed = grabFrom(gs, it)
    ok(grabbed, 'CLAMP: the claw grabs what it touches on the belt')
    ok(gs.arms[0].held === it.id && it.carriedBy === 0, 'CARRY: the cargo rides the jaws')
    let hoisted = 0
    while (gs.arms[0].tip > CARRY_TIP && hoisted < 60 && gs.arms[0].held !== null) { step(gs, [{ a: false }]); hoisted++ }
    ok(gs.arms[0].tip <= CARRY_TIP + 0.1, 'HOIST: a caught load auto-raises above the belt')
    const w0 = gs.warnings
    dropOver(gs, CAN_BIN.x + CAN_BIN.w / 2)
    resolve(gs)
    ok(gs.correct >= 1 && gs.binFill[1] >= 1 && gs.warnings === w0, 'JUDGE: CAN into the amber CAN bin pays and counts')
}

section('RULES — wrong bin, floor, fuses')
{
    const gs = makeGame(12, 1)
    while (gs.tick < 40) step(gs, [{}])
    const it = spawnAt(gs, 'crate', 200)
    gs.arms[0].x = it.x
    grabFrom(gs, it)
    const c0 = gs.correct, f0 = gs.binFill[0], w0b = gs.warnings
    dropOver(gs, CRATE_BIN.x + CRATE_BIN.w / 2)
    resolve(gs)
    ok(gs.correct === c0 + 1 && gs.binFill[0] === f0 + 1 && gs.warnings === w0b,
        'JUDGE: CRATE into the cyan CRATE bin scores, fills and keeps fuses lit')
    const it2 = spawnAt(gs, 'can', 200)
    gs.arms[0].x = it2.x
    grabFrom(gs, it2)
    const c1 = gs.correct
    dropOver(gs, CRATE_BIN.x + CRATE_BIN.w / 2)
    resolve(gs)
    ok(gs.correct === c1 && gs.binFill[0] === f0 + 1, 'JUDGE: CAN into the CRATE bin scores NOTHING (wrong bin)')
}
{
    const gs = makeGame(13, 1)
    while (gs.tick < 40) step(gs, [{}])
    const it = spawnAt(gs, 'coil', 200)
    gs.arms[0].x = it.x
    grabFrom(gs, it)
    // release between bins, over the bare floor
    dropOver(gs, 108)
    resolve(gs)
    ok(gs.warnings === 1, 'FUSE: a load dropped on the floor blows a fuse')
    gs.warnings = FUSES - 1
    const it2 = spawnAt(gs, 'crate', 200)
    gs.arms[0].x = it2.x
    grabFrom(gs, it2)
    dropOver(gs, 108)
    resolve(gs)
    ok(gs.end === 'fired' && gs.endReason === 'DROPPED ON FLOOR', 'FUSE: the third bad place fires you')
}

section('RULES — fragile glass')
{
    const slam = makeGame(14, 1)
    while (slam.tick < 40) step(slam, [{}])
    const b1 = spawnAt(slam, 'bottle', 200)
    slam.arms[0].x = b1.x
    grabFrom(slam, b1)
    const w1 = slam.warnings
    dropOver(slam, BOTTLE_BIN.x + BOTTLE_BIN.w / 2)
    resolve(slam)
    ok(slam.correct === 0 && slam.warnings === w1 + 1, 'GLASS: a slam-drop from carry height SHATTERS the bottle')
}
{
    const soft = makeGame(15, 1)
    while (soft.tick < 40) step(soft, [{}])
    const b = spawnAt(soft, 'bottle', 200)
    soft.arms[0].x = b.x
    grabFrom(soft, b)
    let n = 0
    while (soft.arms[0].held !== null && soft.arms[0].tip < CLAW_DOWN - 12 && n < 80) { step(soft, [{ down: true }]); n++ }
    const lowEnough = soft.arms[0].tip >= CLAW_DOWN - 12
    const c2 = soft.correct
    dropOver(soft, BOTTLE_BIN.x + BOTTLE_BIN.w / 2, 400, { down: true })
    resolve(soft)
    ok(lowEnough && soft.correct === c2 + 1 && soft.binFill[2] === 1, 'FEATHER: DOWN-low + release lands a bottle intact')
}

section('RULES — barrels and the line')
{
    const gs = makeGame(16, 1)
    while (gs.tick < 40) step(gs, [{}])
    const br = spawnAt(gs, 'barrel', 200)
    br.rot = 1.1
    gs.arms[0].x = br.x
    const g0 = gs.tick
    while (gs.tick - g0 < 500 && !gs.end && gs.arms[0].held === null && br.onBelt && !gs.fx.some((f) => f.t === 'slip')) {
        grabFrom(gs, br, 400, () => { br.rot = 1.1 })
    }
    ok(gs.fx.some((f) => f.t === 'slip') && gs.arms[0].held === null,
        'SLIP: an off-axis barrel squirts out of the jaws')
    const gs2 = makeGame(16.5 >>> 0, 1)
    while (gs2.tick < 40) step(gs2, [{}])
    const br2 = spawnAt(gs2, 'barrel', 200)
    br2.rot = 0.1
    gs2.arms[0].x = br2.x
    let caught = false
    const g1 = gs2.tick
    while (gs2.tick - g1 < 500 && !gs2.end && !caught && br2.onBelt) { caught = grabFrom(gs2, br2, 400, () => { br2.rot = 0.1 }) }
    ok(caught, 'BARREL: an upright barrel clamps clean')
}
{
    const gs = makeGame(17, 1)
    while (gs.tick < 40) step(gs, [{}])
    const it = spawnAt(gs, 'can', BELT_END - 4)
    gs.combo = 5
    const s0 = gs.score
    let lost = false
    let n = 0
    while (n < 40 && !lost) { step(gs, [{ a: false }]); lost = gs.ev.some((e) => e.type === 'miss'); n++ }
    ok(lost && gs.combo === 0 && gs.score === Math.max(0, s0 - 50) && gs.warnings === 0,
        'LINE: a piece riding off the end costs 50 + the combo, but not a fuse')
    void it
}

section('ECONOMY — shifts, quota, win')
{
    const gs = makeGame(18, 1)
    const q0 = SHIFTS[0].quota
    gs.correct = q0
    gs.shiftTick = SHIFT_TICKS - 1
    step(gs, [{ a: false }])
    ok(gs.end !== 'fired' && gs.shift === 1 && gs.warnings === 0 && gs.correct === 0 && gs.score >= 500,
        'SHIFT: quota met promotes you, clears fuses, pays 500')
}
{
    const gs = makeGame(19, 1)
    gs.correct = SHIFTS[0].quota - 1
    gs.shiftTick = SHIFT_TICKS - 1
    step(gs, [{ a: false }])
    ok(gs.end === 'fired' && /QUOTA MISSED/.test(gs.endReason), 'QUOTA: short at the whistle = fired')
}
{
    const gs = makeGame(20, 1)
    gs.shift = SHIFTS.length - 1
    gs.correct = SHIFTS[SHIFTS.length - 1].quota
    gs.shiftTick = SHIFT_TICKS - 1
    step(gs, [{ a: false }])
    ok(gs.end === 'win', 'WIN: clearing the last shift completes the contract')
}

section('DETERMINISM — seed + pads = hashes')
{
    const script = (i) => ({ left: i % 43 < 17, right: i % 43 >= 21 && i % 43 < 38, down: i % 67 < 6, a: i % 13 < 2, b: i % 37 === 0 })
    const run = (seed) => {
        const g = makeGame(seed, 1)
        const hs = []
        for (let i = 0; i < 600; i++) { step(g, [script(i)]); if (i % 100 === 99) hs.push(g.hash) }
        return { final: JSON.stringify(g), hs }
    }
    const a = run(7), b = run(7), c = run(8)
    ok(a.final === b.final && a.hs.join() === b.hs.join(), 'DETERMINISM: same seed + same pads run twice → identical states and hashes')
    ok(a.final !== c.final, 'SEEDS DIFFER: seed 8 diverges from seed 7')
}

section('WIN PROOF — the shipped autopilot clears every shift')
for (const seed of [7, 101, 2027]) {
    const gs = makeGame(seed, 1)
    const per = []
    let sh = 0, prev = 0
    while (!gs.end && gs.tick < SHIFTS.length * SHIFT_TICKS + 900) {
        step(gs, [autopilot(gs, 0)])
        if (gs.shift !== sh) { per.push(prev); sh = gs.shift } else prev = gs.correct
        prev = gs.correct
    }
    per.push(prev)
    const need = SHIFTS.map((x) => x.quota)
    const clearedAll = gs.end === 'win' && per.length >= need.length && per.every((v, i) => v >= need[i] + 2)
    ok(clearedAll, `AUTOPILOT seed ${seed}: ${gs.end || 'unfinished'} per-shift ${per.join('/')} vs quota ${need.join('/')} (≥2 headroom each)`)
}

section('HEAD-TO-HEAD — the parity rival keeps it honest')
for (const seed of [7, 101, 2027]) {
    const gs = makeGame(seed, 2)
    while (!gs.end && gs.tick < SHIFTS.length * SHIFT_TICKS + 900) step(gs, [autopilot(gs, 0), autopilot(gs, 1)])
    const p1 = gs.arms[0].score, p2 = gs.arms[1].score
    const ratio = p2 / (p1 + 1)
    ok(gs.end === 'win' && ratio > 0.5 && ratio < 1.5, `RIVAL seed ${seed}: win=${gs.end === 'win'} banks ${p1} vs ${p2} (ratio ${ratio.toFixed(2)})`)
}

section('STATE — motion carriers (#1184)')
{
    const gs = makeGame(21, 2)
    while (gs.tick < 300) step(gs, [autopilot(gs, 0), autopilot(gs, 1)])
    ok(typeof gs.arms[0].x === 'number' && typeof gs.arms[1].x === 'number' && gs.items.length > 0,
        'CARRIERS: arm positions + cargo are in the sim state (pos/clawY ride the contract)')
}

// ---------------------------------------------------------------- Chrome
if (!NODE_ONLY) {
    const { openGame, launch, requireDevServer, Report } = await import('./lib/harness.mjs')
    const BASE = process.env.CONTRACT_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames`
    await requireDevServer(`${BASE}/pick-rush`)
    const browser = await launch()
    const rep = new Report('pickcheck/browser')
    let pageErrors = 0
    try {
        const page = await openGame(browser, { url: `${BASE}/pick-rush`, hook: '__pickrushTest', viewport: { width: 940, height: 700 } })
        page.on('pageerror', () => { pageErrors++ })

        rep.check('BOOT: window.__game is live with the pad contract',
            await page.evaluate(() => !!window.__game && window.__game.meta.id === 'pick-rush' && window.__game.meta.buttons.includes('a')))

        await page.waitForFunction(() => window.__pickrushTest.state().tick > 60, null, { timeout: 15000 })
        const attract = await page.evaluate(() => window.__pickrushTest.state())
        rep.check('ATTRACT: the demo line runs before anyone touches it', attract.mode === 'attract' && attract.tick > 0)

        // real Space clocks in
        await page.keyboard.press('Space')
        await page.waitForTimeout(200)
        rep.check('START: a real SPACE leaves attract', await page.evaluate(() => window.__pickrushTest.state().mode === 'play'))

        // real strokes move the crane, and the cable is painted where it says
        const before = await page.evaluate(() => window.__pickrushTest.state())
        await page.keyboard.down('ArrowRight')
        await page.waitForTimeout(320)
        await page.keyboard.up('ArrowRight')
        await page.waitForTimeout(120)
        const cable = await page.evaluate((b0) => {
            const st = window.__pickrushTest.state()
            const c = window.__pickrushTest.canvas()
            const x = Math.round(st.pos * 2)
            const midY = Math.round(((34 + (st.clawY - 8)) / 2) * 2)
            const d = c.getContext('2d').getImageData(x - 2, midY, 5, 6).data
            let hit = false
            for (let i = 0; i < d.length; i += 4) {
                if (Math.abs(d[i] - 207) < 40 && Math.abs(d[i + 1] - 216) < 40 && Math.abs(d[i + 2] - 227) < 40) hit = true
            }
            return { moved: st.pos > b0 + 1, hit }
        }, before.pos)
        rep.check('DRIVE: ArrowRight really slides the gantry east', cable.moved)
        rep.check('PIXELS: the cable is painted exactly at the sim-reported arm x', cable.hit)

        // cargo pixel proof: spawn a CAN through the DEV kit, grab it via the
        // contract, carry it low over its bin, and sample the core colour
        const cargo = await page.evaluate(async () => {
            const g = window.__game
            const wait = () => new Promise((r) => setTimeout(r, 34))
            const it = () => window.__pickrushTest.state()
            g.reset(7, 1)
            window.__dbg.act('spawn can')
            // track and dip: chase the item until clamped
            let pressed = false
            for (let i = 0; i < 300; i++) {
                const s0 = it()
                if (s0.carried === 'can') break
                const item = s0.items.find((x) => x[0] === 'can' && x[3] === -1)
                if (!item) break
                const dx = item[1] - s0.pos
                const lead = s0.beltV * Math.ceil((97 - s0.clawY) / 3)
                const pad = { left: false, right: false, a: false }
                if (!pressed) {
                    const want = dx - lead
                    if (want > 1.5) pad.right = true
                    else if (want < -1.5) pad.left = true
                    else { pad.a = true; pressed = true }
                } else if (s0.carried === '') {
                    if (dx > 8) pad.right = true
                    else if (dx < -8) pad.left = true
                }
                g.step([pad], 1)
            }
            const carried = it().carried === 'can'
            if (!carried) return { carried, painted: false }
            for (let i = 0; i < 200; i++) {
                const s0 = it()
                const dx = 141 - s0.pos
                g.step([{ left: dx < -1.5, right: dx > 1.5 }], 1)
                if (Math.abs(dx) <= 2) break
            }
            g.step([{ a: false }], 1)
            g.step([{ a: true }], 1)
            await wait()
            const s1 = it()
            const c = window.__pickrushTest.canvas()
            const ix = Math.round(s1.pos * 2)
            const iy = Math.round((60 + 9) * 2)
            const d = c.getContext('2d').getImageData(ix - 10, iy - 16, 21, 32).data
            let painted = false
            for (let k = 0; k < d.length; k += 4) {
                if (Math.abs(d[k] - 224) < 36 && Math.abs(d[k + 1] - 160) < 36 && Math.abs(d[k + 2] - 48) < 36) painted = true
            }
            return { carried, painted }
        })
        rep.check('GRAB: the claw clamps a can on the live page', cargo.carried)
        rep.check('PIXELS: the carried CAN is painted at the claw, matching sim state', cargo.painted)

        // die and restart: three wrong-bin drops via the DEV kit
        const death = await page.evaluate(async () => {
            const g = window.__game
            const it = () => g.state()
            let drops = 0
            for (let attempt = 0; attempt < 6 && drops < 3; attempt++) {
                window.__dbg.act('spawn can')
                let pressed = false
                for (let i = 0; i < 300; i++) {
                    const s0 = it()
                    if (s0.done || s0.carried === 'can') break
                    const item = s0.items.find((x) => x[0] === 'can' && x[3] === -1)
                    if (!item) break
                    const dx = item[1] - s0.pos
                    const lead = s0.beltV * Math.ceil((97 - s0.clawY) / 3)
                    const pad = { left: false, right: false, a: false }
                    if (!pressed) {
                        const want = dx - lead
                        if (want > 1.5) pad.right = true
                        else if (want < -1.5) pad.left = true
                        else { pad.a = true; pressed = true }
                    } else if (s0.carried === '') {
                        if (dx > 8) pad.right = true
                        else if (dx < -8) pad.left = true
                    }
                    g.step([pad], 1)
                }
                if (it().carried !== 'can') continue
                for (let i = 0; i < 200; i++) {
                    const s0 = it()
                    const dx = 69 - s0.pos
                    g.step([{ left: dx < -1.5, right: dx > 1.5 }], 1)
                    if (Math.abs(dx) <= 2) break
                }
                g.step([{ a: false }], 1)
                g.step([{ a: true }], 1)
                for (let i = 0; i < 60 && it().fusesLeft > 3 - (drops + 1); i++) g.step([{}], 1)
                drops++
            }
            const s1 = it()
            return { done: s1.done, reason: s1.endReason, fuses: s1.fusesLeft }
        })
        rep.check('FIRE: three wrong-bin drops through the contract end the shift',
            death.done && /WRONG BIN/.test(death.reason || '') && death.fuses === 0)

        await page.waitForTimeout(750)
        await page.keyboard.press('Space')
        await page.waitForTimeout(300)
        rep.check('RESTART: a Space after the firing card clocks back in', await page.evaluate(() => window.__pickrushTest.state().mode === 'attract'))

        // determinism through the live contract
        const script = scriptFor('pick-rush')
        const det = await page.evaluate((scr) => {
            const g = window.__game
            const run = () => {
                g.reset(7)
                let s = null
                for (let i = 0; i < scr.length; i++) s = g.step([scr[i]], 1)
                return JSON.stringify(s)
            }
            const A = run(), B = run()
            g.release()
            return { equal: A === B, tick: JSON.parse(B).tick }
        }, script)
        rep.check('CONTRACT: 600 scripted ticks replay identically in the live page', det.equal && det.tick === 600, `ended at ${det.tick}`)

        rep.check('ZERO page errors', pageErrors === 0, String(pageErrors))
    } finally {
        rep.exit(browser)
    }
}

console.log(`\npickcheck/node: ${pass - fails.length}/${pass} checks passed` + (fails.length ? ` — ${fails.length} FAILED` : ' — OK'))
if (MUT) {
    // a mutant run must go RED: if nothing failed, the mutant is not load-bearing
    console.log(fails.length ? `  mutant ${MUT}: caught by ${fails.length} named gate(s)` : `  mutant ${MUT}: SURVIVED — the audit missed it`)
    process.exit(fails.length ? 0 : 1)
}
if (fails.length) { fails.forEach((f) => console.error('  FAIL', f)); process.exit(1) }
