// pongcheck — PONG (#365 rule 6 attract + #1473 batch-16 seeded terminal).
// The old attract stacked "ATTRACT MODE" over a 40px "PRESS ARROW KEYS TO
// START" that overflowed the 600px canvas. attract.js is the layout the shell
// actually draws, so this audit cannot rot away from the pixels.
// Batch 16 (#1473): the pre-port dice ran naked off Math.random and the game
// had no terminal and no restart. This now also proves the serve-script replays
// from one seed, the seeded draws stay in range, the quit terminal is honest,
// and every human start re-pins ?seed=N.
// `--mutate` re-plants the broken behaviours in attract.js; the child MUST die.
// `--mutant` re-plants pre-port seedpin regressions in sim/index; same rule.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { attractFrame, INFO_MSGS, HOLD, PRESS, DIM, estWidth } from '../src/games/Pong/attract.js'
import { serveBall, paddleStart, paddleSpin, BASE_SPEED, PADDLE_HEIGHT } from '../src/games/Pong/sim.js'
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

// ------------------------------------------------------- #1473 batch 16 law ----
console.log('seedpin: one stream, honest terminal')
{
    const script = (sd, n) => {
        const rand = seedRng(sd)
        const out = []
        for (let i = 0; i < n; i++) {
            const b = serveBall(rand, 600, 800)
            out.push(`${b.dx}|${b.dy.toFixed(6)}|${paddleStart(rand, 800).toFixed(6)}|${paddleStart(rand, 800).toFixed(6)}|${paddleSpin(rand).toFixed(6)}`)
        }
        return out.join(';')
    }
    ok(script(4242, 200) === script(4242, 200), 'same seed → identical 200-serve match script')
    ok(script(4242, 200) !== script(4243, 200), 'different seed → different serve script')
    let bad = 0
    for (let s = 1; s <= 12; s++) {
        const rand = seedRng(s * 7919)
        for (let i = 0; i < 200; i++) {
            const b = serveBall(rand, 600, 800)
            if (Math.abs(b.dx) !== BASE_SPEED) bad++
            if (Math.abs(b.dy) >= BASE_SPEED) bad++
            const p = paddleStart(rand, 800)
            if (!(p >= 0 && p <= 800 - PADDLE_HEIGHT)) bad++
            paddleStart(rand, 800)
            const sp = paddleSpin(rand)
            if (!(sp >= -2 && sp <= 2)) bad++
        }
    }
    ok(bad === 0, 'seeded draws in range: serve speed/angle, paddle starts, spin (12 seeds × 200)', `${bad}`)
    ok(paddleStart(seedRng(7), 40) >= 0, 'paddleStart survives a table shorter than the paddle')
    ok(seedFromQuery('?seed=777') === 777, '?seed=N parses for the pin')

    const src = readFileSync('src/games/Pong/index.jsx', 'utf8')
    const dice = src.match(/Math\.random\(\)/g) || []
    const seedDraws = src.match(/Math\.random\(\) \* 1000000/g) || []
    ok(dice.length === 2 && seedDraws.length === 2,
        'no die leaves the stream (only the two seed generations)', `${dice.length}/${seedDraws.length}`)
    ok(/seed = seedFromQuery\(window\.location\.search\) \?\? Math\.floor\(Math\.random\(\) \* 1000000\)/.test(src) &&
        /rand = seedRng\(seed\)/.test(src), 'startRun regenerates the seed and honors ?seed=N')
    ok(/done: over, seed: seed/.test(src), 'production report carries the seed + honest terminal')
    ok(/tick: tickN, score: state\.leftPaddle\.score/.test(src), 'report carries tick and the player score')
    const speedups = (src.match(/state\.ball\.dx \*= -1\.05/g) || []).length
    ok(speedups === 2, 'the rally accelerates the ball on BOTH paddle returns (1.05×/hit)', `${speedups}/2`)
    const sr = src.match(/const startRun = \(\) => \{[\s\S]*?\n        \}/)
    ok(!!sr && /state\.leftPaddle\.score = 0/.test(sr[0]) && /state\.rightPaddle\.score = 0/.test(sr[0]),
        'startRun resets BOTH scores (pre-port the comment literally asked "Reset score? Maybe")')
    ok(/e\.code === 'KeyQ' \|\| e\.code === 'Escape'/.test(src) && /over = true/.test(src),
        'play-to-quit terminal: q/Escape ends the match (no fake win on a capped machine)')
    ok(/if \(over\) \{ startRun\(\); return \}/.test(src), 'any key after quit starts a fresh match')
    ok(/handleCanvasTap/.test(src), 'phones can tap the table to start/restart')
    ok(/exposeGame\(\{[\s\S]*?id: 'pong'/.test(src), 'QA contract exposeGame wired')
}

// ------------------------------------------------------------------ mutants ----
if (process.argv.includes('--mutant')) {
    console.log('mutants (each MUST die)')
    const I = 'src/games/Pong/index.jsx'
    const S = 'src/games/Pong/sim.js'
    const MUTANTS = [
        ['human start ignores ?seed (pin removed)', I,
            `seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)`,
            `seed = Math.floor(Math.random() * 1000000)`],
        ['production report drops the seed', I,
            `tick: tickN, score: state.leftPaddle.score, done: over, seed: seed, opp: state.rightPaddle.score,`,
            `tick: tickN, score: state.leftPaddle.score, done: over, opp: state.rightPaddle.score,`],
        ['serve direction leaves the stream', S,
            `dx: (rand() > 0.5 ? 1 : -1) * BASE_SPEED`,
            `dx: (Math.random() > 0.5 ? 1 : -1) * BASE_SPEED`],
        ['restart forgets the scores', I,
            `            state.leftPaddle.score = 0
            state.rightPaddle.score = 0
            over = false`,
            `            over = false`],
        ['the rally stops accelerating (flat 1.00× return)', I,
            `                state.ball.dx *= -1.05 // Slight speed up`,
            `                state.ball.dx *= -1`],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/pongcheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
        pull(file)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} seedpin mutants die`, `${died}/${MUTANTS.length}`)
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
