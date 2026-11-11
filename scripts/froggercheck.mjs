// froggercheck — FROGGER's attract screen layout in plain Node, no browser
// (#365 rule 6). The old attract stacked "GET ACROSS. DON'T GET FLATTENED."
// over "HOP ON LOGS - AVOID THE TURTLES' NAPS" at once — a wall of rules text
// on the demo. attract.js is the layout the shell actually draws, so this audit
// cannot rot away from the pixels. `--mutate` re-plants the broken behaviours;
// the child MUST die.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { attractFrame, INFO_MSGS, HOLD, PRESS, DIM, HUD, estWidth } from '../src/games/Frogger/attract.js'
import { makeLane, DIVE_CYCLE, deathStyle, makeRun, tickFrogger, watchStep } from '../src/games/Frogger/sim.js'
import { seedRng, seedFromQuery } from '../src/utils/gameContract.js'
import { plant, pull } from './lib/mutateguard.mjs'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ------------------------------------------------------------- attract rule 6 ----
console.log('attract (rule 6)')
{
    // The canvas is fixed 260x266, but audit a couple of wider viewports too so
    // the size-to-fit and the kept-clear-of-HUD rules stay honest if the shell scales.
    const SIZES = [[260, 266], [400, 410]]
    const span = HOLD * INFO_MSGS.length + 5
    for (const [w, h] of SIZES) {
        let stacked = 0
        let clipped = 0
        let overHud = 0
        const seen = new Set()
        for (let t = 0; t < span; t++) {
            const lines = attractFrame(t, w, h, HUD)
            const info = lines.filter((l) => l.text !== 'FROGGER' && l.text !== PRESS)
            if (info.length > 1) stacked++
            info.forEach((l) => seen.add(l.text))
            for (const l of lines) {
                if (estWidth(l) > w || l.y + l.size > h) clipped++
                if (l.y - l.size < HUD) overHud++
            }
        }
        ok(stacked === 0, `one informational message at a time (${w}x${h})`, `${stacked} stacked frames`)
        ok(clipped === 0, `no attract line clips the frame edge (${w}x${h})`, `${clipped} clipped lines`)
        ok(overHud === 0, `attract text stays below the HUD (${w}x${h})`, `${overHud} lines over the HUD`)
        ok(seen.size === INFO_MSGS.length, `attract cycles every message (${w}x${h})`, `${seen.size}/${INFO_MSGS.length}`)
    }
    let on = 0
    let off = 0
    for (let t = 0; t < 48; t++) (attractFrame(t, 260, 266, HUD).some((l) => l.text === PRESS) ? on++ : off++)
    ok(on > 0 && off > 0, 'the press prompt blinks', `on ${on} off ${off}`)
    ok(parseFloat(DIM.match(/([\d.]+)\)$/)?.[1]) >= 0.3, 'the demo dims behind the attract text', DIM)
}

// ------------------------------------------------------------------ mutants ----
// ------------------------------------------------------- seed pin (#1473 b15) ----
console.log('seed pin: the seeded traffic replays')
{
    // The engine's lane configs (index.jsx RIVER_CFG) — makeLane is generic,
    // the shapes are what a seeded replay has to reproduce.
    const CFG = [
        { dir: 1, speed: 0.6, kind: 'log', widths: [3], gap: 2.4 },
        { dir: -1, speed: 0.75, kind: 'turtle', widths: [2, 2], gap: 2.6, dive: true },
        { dir: 1, speed: 1.0, kind: 'log', widths: [2, 2], gap: 2.4 },
        { dir: -1, speed: 1.1, kind: 'log', widths: [1], gap: 2.7 },
    ]
    const world = seed => {
        const r = seedRng(seed)
        const lanes = CFG.map(c => makeLane(c, r))
        const flyIdx = Math.floor(r() * 5)
        return { lanes, flyIdx }
    }
    const a = JSON.stringify(world(4242))
    ok(a === JSON.stringify(world(4242)), 'same seed → identical traffic (river lanes + bonus fly)')
    ok(a !== JSON.stringify(world(4243)), 'different seed → different dive offsets')
    let bad = 0
    for (let s = 1; s <= 12; s++) {
        const w = world(s * 7919)
        for (const l of w.lanes) {
            if (!(l.t >= 0 && l.t < DIVE_CYCLE)) bad++
            if (l.items.length === 0 || l.cycle <= 0) bad++
        }
        if (!(w.flyIdx >= 0 && w.flyIdx < 5)) bad++
    }
    ok(bad === 0, 'dive offsets and fly house stay in range over 12 seeds', `${bad}`)
    ok(seedFromQuery('?seed=777') === 777, '?seed=N parses for the pin')
    const src = readFileSync('src/games/Frogger/index.jsx', 'utf8')
    ok(/seed = seedFromQuery\(window\.location\.search\) \?\? Math\.floor\(Math\.random\(\) \* 1000000\)/.test(src) &&
        /makeRun\(seed\)/.test(src), 'human start regenerates the seed and honors ?seed=N')
    ok(/seed: seed/.test(src), 'production report carries the seed')
    ok(!/Math\.random\(\) \* houses\.length/.test(src), 'the bonus fly house is drawn from the seeded stream')
    const simSrc = readFileSync('src/games/Frogger/sim.js', 'utf8')
    ok(/rand: seedRng\(seed\)/.test(simSrc) &&
        !/Math\.random\(\) \* gs\.houses\.length/.test(simSrc), 'b25: the lifted world still draws every die from the seeded stream')
}

// ------------------------------------------ off-board death is distinct (#1508) ----
// ART.md feel: going OFF the board must not read as a water splash. deathStyle()
// is the pure decision the renderer + audio branch on, so this is provable in
// plain Node without a browser.
console.log('off-board death is distinct from a water splash')
{
    const off = deathStyle('off')
    const water = deathStyle('water')
    ok(off.kind !== water.kind, 'off-board death does not reuse the water ripple', `${off.kind} vs ${water.kind}`)
    ok(off.color !== water.color, 'off-board death carries its own colour', `${off.color} vs ${water.color}`)
    ok(deathStyle('car').kind === 'squash' && deathStyle('water').kind === 'ripple',
        'car squashes and water rings (regression anchors)')
    const src = readFileSync('src/games/Frogger/index.jsx', 'utf8')
    ok(/deathStyle\(\s*frog\.cause\s*\)/.test(src), 'the death animation consults deathStyle(cause)')
    ok(!/cause === 'time' \? '#ffe14d' : 'rgba\(160,210,255/.test(src), 'no hard-coded blue ring for every death')
}

// --------------------------------- watch driver: crossings on the shipped tick ----
// #1637 batch 25: the seat's brain (sim.js watchStep) proven against the SAME
// tick the browser runs. Reactive, rand-free, and honest at the edges.
console.log('watch driver: crossings proven on the shipped tick (#1637 b25)')
{
    const SEEDS = [...Array(40)].map((_, k) => 1000 + k * 97)
    const runSeed = seed => {
        const gs = makeRun(seed)
        gs.watching = true
        let h = 0, d = 0, c = 0
        for (let t = 0; t < 7200; t++) {
            const ev = tickFrogger(gs)
            h += ev.home
            if (ev.died) d++
            if (ev.level) c++
        }
        return { h, d, c, score: gs.score, lives: gs.lives, level: gs.level }
    }
    let homes = 0, clean = 0, clears = 0, det = 0, minH = Infinity
    for (const s of SEEDS) {
        const a = runSeed(s), b = runSeed(s)
        if (JSON.stringify(a) === JSON.stringify(b)) det++
        homes += a.h
        clean += a.d === 0 ? 1 : 0
        if (a.c > 0) clears++
        minH = Math.min(minH, a.h)
    }
    ok(det === 40, 'driver: 40/40 seeds replay byte-equal (watchStep draws no rand)')
    ok(clears === 40, 'driver: every seed banks at least one full level in 120 s', `${clears}/40`)
    ok(clean >= 34, 'driver: zero-death runs on ≥34 seeds (measured 36; the odd seed loses one life to a dive-phase shuffle)', `${clean}/40`)
    ok(minH >= 20, 'driver: ≥20 homes landed on every seed', `min ${minH}`)
    ok(homes >= 1800, 'driver: ≥1800 homes across the 40-seed sweep', `${homes}`)
    const gsA = makeRun(4242, { attract: true })
    ok(watchStep(gsA) === null, 'driver: silent while attract holds the pad')
    const gsO = makeRun(4242)
    gsO.over = true
    ok(watchStep(gsO) === null, 'driver: silent at game over (watch never lingers)')
}

if (process.argv.includes('--mutate')) {
    console.log('mutants (each MUST die)')
    const F = 'src/games/Frogger/attract.js'
    const MUTANTS = [
        ['human start ignores ?seed (pin removed)',
            `seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)`,
            `seed = Math.floor(Math.random() * 1000000)`,
            'src/games/Frogger/index.jsx'],
        ['the bonus fly house leaves the seeded stream',
            `const flyIdx = Math.floor(gs.rand() * gs.houses.length)`,
            `const flyIdx = Math.floor(Math.random() * gs.houses.length)`,
            'src/games/Frogger/sim.js'],
        ['attract stacks a second message',
            `        { text: msg, x: w / 2, y: hud + region * 0.52, size: fitSize(msg, w, 11), col: '#ffffff', glow: 0 },`,
            `        { text: msg, x: w / 2, y: hud + region * 0.52, size: fitSize(msg, w, 11), col: '#ffffff', glow: 0 },
        { text: 'HOP ON LOGS', x: w / 2, y: hud + region * 0.86, size: 8, col: '#8f8f8f', glow: 0 },`],
        ['attract message never cycles',
            `cycleAttract(tick, INFO_MSGS, HOLD)`,
            `INFO_MSGS[0]`],
        ['a line clips the frame edge',
            `size: fitSize(msg, w, 11),`,
            `size: 60,`],
        ['text creeps up over the HUD',
            `y: hud + region * 0.36,`,
            `y: hud * 0.4,`],
        ['the press prompt never blinks',
            `!l.blink || Math.floor(tick / 24) % 2 === 0`,
            `true`],
        ['no dim behind the attract text',
            `export const DIM = 'rgba(0,0,0,0.55)'`,
            `export const DIM = 'rgba(0,0,0,0)'`],
        ['off-board death collapses to the water ripple (#1508 regression)',
            `    if (cause === 'off') return { kind: 'splat', color: '#ff7a5c' }`,
            `    if (cause === 'off') return { kind: 'ripple', color: 'rgba(160,210,255,0.9)' }`,
            'src/games/Frogger/sim.js'],
        ['the death animation ignores deathStyle',
            `const st = deathStyle(frog.cause)`,
            `const st = { kind: 'ripple', color: 'rgba(160,210,255,0.9)' }`,
            'src/games/Frogger/index.jsx'],
        // b25 driver mutants — each breaks a swept floor, none can hide.
        ['the watch driver is muted (hold forever)',
            `    let best = null
    let bestV = -Infinity
    for (const [dx, dy] of CANDIDATES) {`,
            `    let best = null
    let bestV = -Infinity
    for (const [dx, dy] of []) {`,
            'src/games/Frogger/sim.js'],
        ['home lands without the earliness bonus (procrastination bug #b25)',
            `        if (hi >= 0 && !gs.houses[hi].filled) return { ok: true, value: 1e6 + WATCH_HORIZON }`,
            `        if (hi >= 0 && !gs.houses[hi].filled) return { ok: true, value: 1e6 }`,
            'src/games/Frogger/sim.js'],
        ['row 1 never shuffles back for houses behind',
            `            const houseBehind = row === RIVER_TOP
                && !gs.houses.some((h, i) => !h.filled && HOUSE_COLS[i] * CELL + CELL / 2 >= x)
            if (rem <= 60 || houseBehind) {`,
            `            const houseBehind = false
            if (rem <= 60 || houseBehind) {`,
            'src/games/Frogger/sim.js'],
    ]
    let died = 0
    for (const [name, from, to, file = F] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/froggercheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
        pull(file)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
