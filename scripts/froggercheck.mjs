// froggercheck — FROGGER's attract screen layout in plain Node, no browser
// (#365 rule 6). The old attract stacked "GET ACROSS. DON'T GET FLATTENED."
// over "HOP ON LOGS - AVOID THE TURTLES' NAPS" at once — a wall of rules text
// on the demo. attract.js is the layout the shell actually draws, so this audit
// cannot rot away from the pixels. `--mutate` re-plants the broken behaviours;
// the child MUST die.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { attractFrame, INFO_MSGS, HOLD, PRESS, DIM, HUD, estWidth } from '../src/games/Frogger/attract.js'

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
if (process.argv.includes('--mutate')) {
    console.log('mutants (each MUST die)')
    const F = 'src/games/Frogger/attract.js'
    const MUTANTS = [
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
    for (const [name, from, to] of MUTANTS) {
        const orig = readFileSync(F, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        writeFileSync(F, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/froggercheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
        writeFileSync(F, orig)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} attract mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
