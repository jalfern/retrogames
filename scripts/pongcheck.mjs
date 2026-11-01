// pongcheck — PONG's attract screen layout in plain Node, no browser (#365 rule 6).
// The old attract stacked "ATTRACT MODE" over a 40px "PRESS ARROW KEYS TO
// START" that overflowed the 600px canvas. attract.js is the layout the shell
// actually draws, so this audit cannot rot away from the pixels.
// `--mutate` re-plants the broken behaviours in attract.js; the child MUST die.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { attractFrame, INFO_MSGS, HOLD, PRESS, DIM, estWidth } from '../src/games/Pong/attract.js'
import { plant, pull } from './lib/mutateguard.mjs'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ------------------------------------------------------------- attract rule 6 ----
console.log('attract (rule 6)')
{
    const WIDTHS = [320, 600]
    const HEIGHTS = [426, 800]
    const span = HOLD * INFO_MSGS.length + 5
    for (const w of WIDTHS) for (const h of HEIGHTS) {
        let stacked = 0
        let clipped = 0
        const seen = new Set()
        for (let t = 0; t < span; t++) {
            const lines = attractFrame(t, w, h)
            const info = lines.filter((l) => l.text !== 'PONG' && l.text !== PRESS)
            if (info.length > 1) stacked++
            info.forEach((l) => seen.add(l.text))
            for (const l of lines) if (estWidth(l) > w || l.y + l.size > h || l.y - l.size < 0) clipped++
        }
        ok(stacked === 0, `one informational message at a time (${w}x${h})`, `${stacked} stacked frames`)
        ok(clipped === 0, `no attract line clips the frame edge (${w}x${h})`, `${clipped} clipped lines`)
        ok(seen.size === INFO_MSGS.length, `attract cycles every message (${w}x${h})`, `${seen.size}/${INFO_MSGS.length}`)
    }
    let on = 0
    let off = 0
    for (let t = 0; t < 48; t++) (attractFrame(t, 600, 480).some((l) => l.text === PRESS) ? on++ : off++)
    ok(on > 0 && off > 0, 'the press prompt blinks', `on ${on} off ${off}`)
    ok(parseFloat(DIM.match(/([\d.]+)\)$/)?.[1]) >= 0.3, 'the demo dims behind the attract text', DIM)
}

// ------------------------------------------------------------------ mutants ----
if (process.argv.includes('--mutate')) {
    console.log('mutants (each MUST die)')
    const F = 'src/games/Pong/attract.js'
    const MUTANTS = [
        ['attract stacks a second message',
            `        { text: msg, x: w / 2, y: h * 0.42, size: fitSize(msg, w, 15), col: '#9aa4b2', glow: 0 },`,
            `        { text: msg, x: w / 2, y: h * 0.42, size: fitSize(msg, w, 15), col: '#9aa4b2', glow: 0 },
        { text: 'ARROWS MOVE', x: w / 2, y: h * 0.46, size: 12, col: '#9aa4b2', glow: 0 },`],
        ['attract message never cycles',
            `cycleAttract(tick, INFO_MSGS, HOLD)`,
            `INFO_MSGS[0]`],
        ['a line clips the frame edge',
            `size: fitSize(PRESS, w, 18),`,
            `size: 24,`],
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
        plant(F, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/pongcheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
        pull(F)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} attract mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
