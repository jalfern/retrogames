// froggercheck — FROGGER's attract screen layout in plain Node, no browser
// (#365 rule 6). The old attract stacked "GET ACROSS. DON'T GET FLATTENED."
// over "HOP ON LOGS - AVOID THE TURTLES' NAPS" at once — a wall of rules text
// on the demo. attract.js is the layout the shell actually draws, so this audit
// cannot rot away from the pixels. `--mutate` re-plants the broken behaviours;
// the child MUST die.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { attractFrame, INFO_MSGS, HOLD, PRESS, DIM, HUD, estWidth } from '../src/games/Frogger/attract.js'
import { makeLane, DIVE_CYCLE } from '../src/games/Frogger/sim.js'
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
        /rand = seedRng\(seed\)/.test(src), 'human start regenerates the seed and honors ?seed=N')
    ok(/seed: seed/.test(src), 'production report carries the seed')
    ok(!/Math\.random\(\) \* houses\.length/.test(src), 'the bonus fly house is drawn from the seeded stream')
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
            `const flyIdx = Math.floor(rand() * houses.length)`,
            `const flyIdx = Math.floor(Math.random() * houses.length)`,
            'src/games/Frogger/index.jsx'],
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
