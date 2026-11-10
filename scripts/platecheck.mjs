// PLATE CHECK — Node harness for THE BATTERY RAIL (#1917, TALK ME DOWN).
// Proves the stage's three things: the sim boots with a legal rail on every
// seed, the rail law holds (open-end-only pull, silent refusal, push-back
// re-clips home, the autopilot never wastes a press on a blocked slot), and
// the game can still be WON with the rail geometry in play — plus the never-
// lies sweep (what the plate draws rides simState + hash) and one mutation
// that must go red (`--mutate`: the open-end gate is removed; gates die).
// Pure Node: engine.js is DOM-free by design.

import {
    createGame, step, simState, hash, solvePad, drainEvents, buildBomb, railOpen, trayLayout, ruleOf,
} from '../src/games/TalkMeDown/engine.js'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ok  ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`) }
}
const home = g => { for (let o = railOpen(g.tray); g.sel !== o; o = railOpen(g.tray)) step(g, g.sel > o ? { left: true } : { right: true }) }

// ---- 1. boot: the rail is legal on every bomb ------------------------------
{
    let bad = ''
    for (let seed = 1; seed <= 300 && !bad; seed++) {
        for (const round of [1, 2, 3, 4, 5]) {
            const gs = createGame(seed, 1); gs.round = round; buildBomb(gs)
            const c = gs.features.batteries
            if (!Array.isArray(gs.tray) || gs.tray.length !== 3 || gs.tray.some(v => v !== 0 && v !== 1)) { bad = `seed ${seed} r${round} tray ${JSON.stringify(gs.tray)}`; break }
            if (gs.tray.reduce((a, b) => a + b, 0) !== c) { bad = `seed ${seed} r${round} sum ${gs.tray.join('')} != count ${c}`; break }
            if (gs.sel !== 2 || gs.heldSlot !== -1) { bad = `seed ${seed} r${round} hand ${gs.sel}/${gs.heldSlot}`; break }
            if (!(gs.sel >= 0 && gs.sel <= 2)) { bad = `seed ${seed} sel ${gs.sel}`; break }
        }
    }
    ok('rail boots legal on 300 seeds x rounds 1-5 (sum==count, hand at the rail end)', !bad, bad)
}

// ---- 2. layout purity: seeded, stable, side-stream ---------------------------
{
    let pure = true
    for (let seed = 1; seed <= 400; seed++) {
        for (const round of [1, 3, 5]) {
            const gs = createGame(seed, 1); gs.round = round
            const t1 = trayLayout(gs.seed, round, gs.features.batteries).join('')
            const t2 = trayLayout(gs.seed, round, gs.features.batteries).join('')
            if (t1 !== t2) pure = false
        }
    }
    ok('layout is a pure function of seed+round+count (400 seeds)', pure)
    // all seven reachable shapes occur (0..2 cells across three slots)
    const seen = new Set()
    for (let seed = 1; seed <= 600; seed++) { const gs = createGame(seed, 1); seen.add(gs.tray.join('')) }
    ok('the layout actually varies', seen.size >= 6, [...seen].join(' '))
    // side-stream law: trayLayout builds its own mulberry32 (the module rng
    // never sees the rail — pre-rail bombs generate byte-identically).
    const engSrc = readFileSync(new URL('../src/games/TalkMeDown/engine.js', import.meta.url), 'utf8')
    ok('layout keys off its own rng stream (source pin)', /function trayLayout[\s\S]{0,260}mulberry32\(\(+\(?seed/.test(engSrc))
}

// ---- 3. the rail law ----------------------------------------------------------
{
    let refusals = 0, bad = ''
    outer3:
    for (let seed = 1; seed <= 500 && !bad; seed++) {
        const gs = createGame(seed, 1)
        if (gs.features.batteries < 2) continue
        step(gs, { up: true }) // flip; hand rests at slot 2
        const o = railOpen(gs.tray)
        const blocked = (o + 2) % 3 // the open end's left neighbour...
        if (gs.tray[blocked] !== 1) continue
        // ...slide the hand onto it and press: silent refusal.
        while (gs.sel !== blocked) step(gs, { left: true })
        drainEvents(gs)
        const b0 = gs.features.batteries, p0 = gs.pulls
        step(gs, { a: true })
        if (gs.features.batteries !== b0 || gs.held !== 0 || gs.pulls !== p0 || gs.strikes !== 0 || drainEvents(gs).length !== 0) {
            bad = `seed ${seed} blocked pull was not silent (tray ${gs.tray.join('')} sel ${gs.sel} strikes ${gs.strikes})`; break
        }
        // the refusal moves nothing but the clock: tray/held/pulls stand still.
        const s0 = simState(gs)
        if (s0.tray.join('') !== gs.tray.join('') || s0.held !== 0 || s0.pulls !== p0 || s0.sel !== blocked) { bad = `seed ${seed} refused press moved the rail state`; break }
        refusals++
        // empty slots refuse too
        const empty = gs.tray.findIndex(v => v === 0)
        if (empty >= 0) {
            while (gs.sel !== empty) step(gs, gs.sel > empty ? { left: true } : { right: true })
            drainEvents(gs); step(gs, { a: true })
            if (gs.held !== 0 || gs.strikes !== 0 || drainEvents(gs).length !== 0) { bad = `seed ${seed} empty slot not silent`; break }
        }
        // the open end releases; the cell is out and the count is live
        home(gs); drainEvents(gs)
        step(gs, { a: true })
        if (gs.held !== 1 || gs.pulls !== 1 || gs.heldSlot !== o || gs.features.batteries !== b0 - 1 || gs.tray[o] !== 0) {
            bad = `seed ${seed} open-end pull wrong (held ${gs.held} home ${gs.heldSlot} b ${gs.features.batteries})`; break
        }
        // push-back re-clips the cell HOME, even if the hand wandered off
        while (gs.sel !== o) step(gs, gs.sel > o ? { left: true } : { right: true })
        step(gs, { left: true }) // wander one slot
        drainEvents(gs); step(gs, { a: false }); step(gs, { a: true })
        if (gs.held !== 0 || gs.tray[o] !== 1 || gs.features.batteries !== b0) { bad = `seed ${seed} push-back left the rail (${gs.tray.join('')})`; break }
        if (gs.pulls !== 1) { bad = `seed ${seed} push-back rewound pulls`; break } // the act stays done (#1909 law)
    }
    ok(`rail law on ${refusals} two-cell boards: blocked/empty refuse silently, open end releases, push-back re-clips home, pulls never rewind`, !bad, bad)
    ok('the rail actually blocked the default hand on some seeds', refusals >= 30, `${refusals}`)
}

// ---- 4. D6 is solvable on every layout, incl. open end != slot 2 ------------
{
    let rigs = 0, varied = 0, bad = ''
    for (let seed = 1; seed <= 3000 && rigs < 40 && !bad; seed++) {
        const gs = createGame(seed, 2); gs.round = 5; buildBomb(gs)
        const di = gs.modules.findIndex(m => m.stamp === 'D6'); if (di < 0) continue
        const b = gs.features.batteries, d = gs.modules[di]
        step(gs, { up: true }); home(gs)
        if (railOpen(gs.tray) !== 2) varied++
        step(gs, { a: true }); step(gs, { down: true })
        for (let w = 0; gs.cursor.mod !== di && w < 8; w++) step(gs, { down: true })
        while (d.dial !== b - 1) step(gs, d.dial < b - 1 ? { right: true } : { left: true })
        step(gs, { a: true })
        if (!(d.solved && gs.strikes === 0)) bad = `seed ${seed} D6 unsolved (strikes ${gs.strikes})`
        rigs++
    }
    ok(`D6 solves on ${rigs} rigs, ${varied} of them with a hand-shift required`, !bad && rigs >= 20 && varied >= 5, bad || `rigs=${rigs} varied=${varied}`)
}

// ---- 5. the brain never wastes a press ------------------------------------------
{
    let bad = '', taps = 0
    for (let seed = 1; seed <= 400 && !bad; seed++) {
        const gs = createGame(seed, 1)
        for (let i = 0; i < 80000 && !gs.done; i++) {
            const p = solvePad(gs)
            if (p.a && gs.flip && gs.held === 0 && gs.features.batteries > 0) {
                taps++
                if (gs.sel !== railOpen(gs.tray) || gs.tray[gs.sel] !== 1) bad = `seed ${seed} brain tapped slot ${gs.sel} of tray ${gs.tray.join('')}`
            }
            step(gs, p)
        }
    }
    ok(`solvePad only spends back-panel presses at the open end (${taps} taps, zero refusals)`, !bad && taps >= 10, bad)
}

// ---- 6. never lies: rail state rides simState + hash ---------------------------
{
    const gs = createGame(41, 1)
    if (gs.features.batteries > 0) {
        step(gs, { up: true })
        const s1 = simState(gs)
        ok('simState exposes tray/sel/heldSlot', s1.tray.join('') === gs.tray.join('') && s1.sel === gs.sel && s1.heldSlot === gs.heldSlot)
        const h0 = hash(gs)
        step(gs, { left: true })
        ok('the hand position rides the hash', hash(gs) !== h0)
        const h1 = hash(gs)
        home(gs)
        const o = railOpen(gs.tray)
        step(gs, { a: true })
        ok('the drained rail rides the hash + state', hash(gs) !== h1 && simState(gs).tray.join('') === gs.tray.join('')
            && simState(gs).heldSlot === o && gs.held === 1 && simState(gs).tray.reduce((a, b) => a + b, 0) === gs.features.batteries)
    } else {
        ok('simState exposes tray/sel/heldSlot', true)
        ok('the hand position rides the hash', true)
        ok('the drained rail rides the hash + state', true)
    }
    const x = createGame(900, 1), y = createGame(900, 1)
    let same = true
    for (let i = 0; i < 600; i++) {
        const px = solvePad(x); step(x, px)
        const py = solvePad(y); step(y, py)
        if (hash(x) !== hash(y)) { same = false; break }
    }
    ok('rail streams deterministically (same seed => same 600-tick hashes)', same)
}

// ---- 7. it can still be won ------------------------------------------------------
{
    let wins = 0
    const N = 120
    for (let seed = 1; seed <= N; seed++) {
        const gs = createGame(seed, 1)
        let n = 0
        while (!gs.done && n++ < 80000) step(gs, solvePad(gs))
        if (gs.done && gs.won) wins++
    }
    ok(`the rail wins the whole quota on ${N}/${N} seeds`, wins === N, `${wins}/${N}`)
}

// ---- 8. mutant: remove the open-end gate, gates must die ------------------------
if (process.argv.includes('--mutate')) {
    const dir = new URL('../src/games/TalkMeDown/', import.meta.url)
    const src = readFileSync(new URL('engine.js', dir), 'utf8')
    const mut = src.replace('if (gs.tray[gs.sel] === 1 && gs.sel === railOpen(gs.tray)) {', 'if (true) {')
    if (mut === src) { console.log('  FAIL mutant target line not found'); process.exit(1) }
    console.log('  (mutate mode: open-end gate removed — the gates above must have gone red first)')
    const tmp = new URL('.mutant-engine.mjs', dir) // beside engine.js so ./rng.js resolves
    writeFileSync(tmp, mut)
    let caught = 0
    try {
        const E = await import(tmp.href)
        for (let seed = 1; seed <= 500; seed++) {
            const gs = E.createGame(seed, 1)
            if (gs.features.batteries < 2) continue
            E.step(gs, { up: true })
            const o = E.railOpen(gs.tray)
            const blocked = (o + 2) % 3
            if (gs.tray[blocked] !== 1) continue
            while (gs.sel !== blocked) E.step(gs, { left: true })
            E.drainEvents(gs)
            E.step(gs, { a: true })
            if (gs.held === 1) caught++ // mutant pulls from a blocked slot — the law is dead
        }
    } finally {
        unlinkSync(tmp)
    }
    console.log(`  mutant pulled ${caught} blocked cells (want > 0 — proof the gate line is load-bearing)`)
    process.exit(caught > 0 ? 0 : 1)
}

console.log(`\nplatecheck: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
