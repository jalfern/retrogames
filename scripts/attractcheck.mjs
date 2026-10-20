// attractcheck — the shared ART.md rule-6 attract gate (#365).
//
// One audit for every canvas attract screen that follows the attract.js
// contract {attractFrame(tick, w, h), INFO_MSGS, HOLD, PRESS, DIM, estWidth}:
// the shell draws exactly what this reads, so it cannot rot away from the
// pixels. Invariants, checked over several viewports and a full message
// cycle:
//   - exactly ONE informational message on screen at a time (never a wall);
//   - every message in INFO_MSGS is shown (the slot truly cycles);
//   - no line clips the frame edge;
//   - the press prompt blinks;
//   - the demo dims behind the text.
//
// `--mutate` re-plants the broken behaviours in the swept titles' attract.js
// files; each child run MUST go red — that is the proof this gate has teeth.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const MODULES = [
    { label: 'PONG', file: 'src/games/Pong/attract.js', import: '../src/games/Pong/attract.js' },
    { label: 'FROGGER', file: 'src/games/Frogger/attract.js', import: '../src/games/Frogger/attract.js' },
    { label: 'DEFENDER', file: 'src/games/Defender/attract.js', import: '../src/games/Defender/attract.js' },
    { label: 'SPACE INVADERS', file: 'src/games/SpaceInvaders/attract.js', import: '../src/games/SpaceInvaders/attract.js' },
    { label: 'CENTIPEDE', file: 'src/games/Centipede/attract.js', import: '../src/games/Centipede/attract.js' },
]

const WIDTHS = [320, 600]
const HEIGHTS = [426, 800]

let fails = 0
let passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function audit({ label, import: spec }) {
    const m = await import(spec)
    const { attractFrame, INFO_MSGS, HOLD, PRESS, DIM, estWidth } = m
    console.log(`attract (rule 6) — ${label}`)
    if (!attractFrame || !Array.isArray(INFO_MSGS) || !HOLD || typeof PRESS !== 'string' || !DIM || !estWidth) {
        ok(false, `${label}: exports the attract.js contract`)
        return
    }
    ok(true, `${label}: exports the attract.js contract`)
    ok(INFO_MSGS.length >= 2, `${label}: has more than one message to cycle`, `${INFO_MSGS.length}`)
    ok(INFO_MSGS.every((s) => s.length <= 28), `${label}: every message fits one short line`,
        INFO_MSGS.filter((s) => s.length > 28).join(' | '))
    ok(!INFO_MSGS.some((s) => /attract mode|scripts?\/|\.mjs|audit/i.test(s)),
        `${label}: no harness leak in a visible message`)

    const span = HOLD * INFO_MSGS.length + 5
    for (const w of WIDTHS) for (const h of HEIGHTS) {
        let stacked = 0
        let clipped = 0
        let offMsg = 0
        const seen = new Set()
        for (let t = 0; t < span; t++) {
            const lines = attractFrame(t, w, h)
            const info = lines.filter((l) => INFO_MSGS.includes(l.text))
            if (info.length !== 1) { if (info.length > 1) stacked++; else offMsg++ }
            info.forEach((l) => seen.add(l.text))
            for (const l of lines) if (estWidth(l) > w || l.y + l.size > h || l.y - l.size < 0) clipped++
        }
        ok(stacked === 0, `${label}: one informational message at a time (${w}x${h})`, `${stacked} stacked frames`)
        ok(offMsg === 0, `${label}: an informational message is always on screen (${w}x${h})`, `${offMsg} empty frames`)
        ok(clipped === 0, `${label}: no attract line clips the frame edge (${w}x${h})`, `${clipped} clipped lines`)
        ok(seen.size === INFO_MSGS.length, `${label}: the slot cycles every message (${w}x${h})`, `${seen.size}/${INFO_MSGS.length}`)
    }

    let on = 0
    let off = 0
    for (let t = 0; t < 48; t++) (attractFrame(t, 600, 480).some((l) => l.text === PRESS) ? on++ : off++)
    ok(on > 0 && off > 0, `${label}: the press prompt blinks`, `on ${on} off ${off}`)
    ok(parseFloat(DIM.match(/([\d.]+)\)/)?.[1]) >= 0.3, `${label}: the demo dims behind the text`, DIM)
}

// ------------------------------------------------------------------ mutants ----
// The shared anchors below appear verbatim in every title this slice swept; each
// mutant re-plants one rule-6 regression into a real attract.js and the child
// audit (no --mutate) must go red.
const MUTANTS = [
    ['stacks a second message',
        `        { text: msg, x: w / 2, y: h * 0.42,`,
        `        { text: msg, x: w / 2, y: h * 0.42,
        { text: 'EXTRA RULE LINE', x: w / 2, y: h * 0.46, size: 12, col: '#ffffff', glow: 0 },`],
    ['the message never cycles',
        `cycleAttract(tick, INFO_MSGS, HOLD)`,
        `INFO_MSGS[0]`],
    ['the press prompt never blinks',
        `!l.blink || Math.floor(tick / 24) % 2 === 0`,
        `true`],
    ['a line clips the frame edge',
        `size: fitSize(PRESS, w, 18),`,
        `size: 30,`],
    ['no dim behind the attract text',
        `0.55)'`,
        `0)'`],
]

const MUTATE_FILES = MODULES.filter((m) => /Defender|SpaceInvaders|Centipede/.test(m.file)).map((m) => m.file)

async function run() {
    for (const mod of MODULES) await audit(mod)

    if (process.argv.includes('--mutate')) {
        console.log('mutants (each MUST die)')
        for (const file of MUTATE_FILES) {
            const label = file.split('/').slice(-2, -1)[0]
            let died = 0
            for (const [name, from, to] of MUTANTS) {
                const orig = readFileSync(file, 'utf8')
                if (!orig.includes(from)) { ok(false, `${label} anchor: ${name}`, `missing: ${from}`); continue }
                writeFileSync(file, orig.replace(from, to))
                const res = spawnSync(process.execPath, ['scripts/attractcheck.mjs'], { encoding: 'utf8' })
                if (res.status !== 0) { died++; ok(true, `${label} mutant dies: ${name}`) }
                else { ok(false, `${label} mutant dies: ${name}`, 'child passed despite the bug') }
                writeFileSync(file, orig)
            }
            ok(died === MUTANTS.length, `${label}: all ${MUTANTS.length} attract mutants die`, `${died}/${MUTANTS.length}`)
        }
    }

    console.log(`\n${passes} passed, ${fails} failed`)
    process.exit(fails ? 1 : 0)
}

run()
