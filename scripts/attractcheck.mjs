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
//
// React shells (AttractMessage overlays) hold their copy in an attract.js
// {PRESS, MESSAGES} module; those are audited statically: one cycling slot,
// short single lines, dimmed scrim, blinking prompt, no harness leaks.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const MODULES = [
    { label: 'PONG', file: 'src/games/Pong/attract.js', import: '../src/games/Pong/attract.js' },
    { label: 'FROGGER', file: 'src/games/Frogger/attract.js', import: '../src/games/Frogger/attract.js' },
    { label: 'DEFENDER', file: 'src/games/Defender/attract.js', import: '../src/games/Defender/attract.js' },
    { label: 'SPACE INVADERS', file: 'src/games/SpaceInvaders/attract.js', import: '../src/games/SpaceInvaders/attract.js' },
    { label: 'CENTIPEDE', file: 'src/games/Centipede/attract.js', import: '../src/games/Centipede/attract.js' },
    { label: 'GAUNTLET', file: 'src/games/Gauntlet/attract.js', import: '../src/games/Gauntlet/attract.js' },
    { label: 'DONKEY KONG', file: 'src/games/DonkeyKong/attract.js', import: '../src/games/DonkeyKong/attract.js' },
    { label: 'PITFALL', file: 'src/games/Pitfall/attract.js', import: '../src/games/Pitfall/attract.js' },
    { label: 'MISSILE COMMAND', file: 'src/games/MissileCommand/attract.js', import: '../src/games/MissileCommand/attract.js' },
    { label: 'LUNAR LANDER', file: 'src/games/LunarLander/attract.js', import: '../src/games/LunarLander/attract.js' },
    { label: 'TEMPEST', file: 'src/games/Tempest/attract.js', import: '../src/games/Tempest/attract.js' },
    { label: 'OUT RUN', file: 'src/games/OutRun/attract.js', import: '../src/games/OutRun/attract.js' },
]

const REACT_TITLES = [
    {
        label: 'GALAGA',
        jsx: 'src/games/Galaga/index.jsx',
        mf: 'src/games/Galaga/attract.js',
        import: '../src/games/Galaga/attract.js',
        slot: '<AttractMessage className="mb-6 text-cyan-100/80" messages={MESSAGES} />',
        wrap: `    'DIVE PATHS ARE SCRIPTED AND READABLE',\n`,
        leak: `    "DON'T GET CORNERED AT THE WALLS",\n`,
    },
    {
        label: 'MINESWEEPER',
        jsx: 'src/games/Minesweeper/index.jsx',
        mf: 'src/games/Minesweeper/attract.js',
        import: '../src/games/Minesweeper/attract.js',
        slot: '<AttractMessage className="mb-6 text-amber-100/80" messages={MESSAGES} />',
        wrap: `    'DIG A MATCHED NUMBER TO CHORD THE REST',\n`,
        leak: `    'EVERY BOARD IS PROVEN GUESS-FREE',\n`,
    },
    {
        label: 'SSX',
        jsx: 'src/games/SSX/index.jsx',
        mf: 'src/games/SSX/attract.js',
        import: '../src/games/SSX/attract.js',
        slot: '<AttractMessage className="mb-6 text-cyan-100/80" messages={MESSAGES} />',
        wrap: `    'X GRAB · Z/C FLIP · SHIFT BOOST',\n`,
        leak: `    'CHAINS PAY UP TO x4',\n`,
    },
    {
        label: 'ARENA ARCHERY',
        jsx: 'src/games/ArenaArchery/index.jsx',
        mf: 'src/games/ArenaArchery/attract.js',
        import: '../src/games/ArenaArchery/attract.js',
        slot: '<AttractMessage className="mb-6 text-amber-100/80" messages={MESSAGES} />',
        wrap: `    'ARROWS STUCK IN STONE ARE TERRAIN',\n`,
        leak: `    'ONE STICK TO MOVE AND AIM · LOB ARCS',\n`,
    },
    {
        label: 'WWI DOGFIGHT',
        jsx: 'src/games/Dogfight/index.jsx',
        mf: 'src/games/Dogfight/attract.js',
        import: '../src/games/Dogfight/attract.js',
        slot: '<AttractMessage className="mb-6 text-amber-100/80" messages={MESSAGES} />',
        wrap: `    'SPACE FIRES THE SYNCHRONIZED VICKERS',\n`,
        leak: `    'A ZOOM CLIMB BUYS METRES WITH M/S',\n`,
    },
    {
        label: 'BOULDER DASH',
        jsx: 'src/games/BoulderDash/index.jsx',
        mf: 'src/games/BoulderDash/attract.js',
        import: '../src/games/BoulderDash/attract.js',
        slot: '<AttractMessage className="mb-6 text-amber-100/80" messages={MESSAGES} />',
        wrap: `    'REACH THE GEM QUOTA, THEN THE EXIT',\n`,
        leak: `    'THE FIREFLY BURNS ALL BUT STEEL',\n`,
    },
    {
        label: 'METROID-LITE',
        jsx: 'src/games/MetroidLite/index.jsx',
        mf: 'src/games/MetroidLite/attract.js',
        import: '../src/games/MetroidLite/attract.js',
        slot: '<AttractMessage className="mb-6 text-cyan-100/80" messages={MESSAGES} />',
        wrap: `    'THE WAY BACK IS THE WAY FORWARD',\n`,
        leak: `    'BOMBS DROP THROUGH BULKHEADS',\n`,
    },
    {
        label: 'MOMENTUM RUNNER',
        jsx: 'src/games/MomentumRunner/index.jsx',
        mf: 'src/games/MomentumRunner/attract.js',
        import: '../src/games/MomentumRunner/attract.js',
        slot: '<AttractMessage className="text-cyan-200/85 mt-2" messages={MESSAGES} />',
        wrap: `    'SPEED IS THE ONLY CURRENCY — NEVER STOP',\n`,
        leak: `    'FAST SECTORS + CARRIED RINGS = GATE BONUS',\n`,
    },
    {
        label: 'EXCITEBIKE',
        jsx: 'src/games/Excitebike/index.jsx',
        mf: 'src/games/Excitebike/attract.js',
        import: '../src/games/Excitebike/attract.js',
        slot: '<AttractMessage className="text-cyan-100/80 mt-2 px-8" messages={MESSAGES} />',
        blinkFrom: `animate-pulse">{PRESS}</p>`,
        wrap: `    'LEAN THE BIKE OR EAT DIRT',\n`,
        leak: `    'REDLINE TOO LONG AND THE ENGINE BOILS',\n`,
    },
    {
        label: 'PAPERBOY',
        jsx: 'src/games/Paperboy/index.jsx',
        mf: 'src/games/Paperboy/attract.js',
        import: '../src/games/Paperboy/attract.js',
        slot: '<AttractMessage className="text-amber-100/80 mt-2 px-8" messages={MESSAGES} />',
        wrap: `    'RIDE THE ROUTE · THROW THE PAPERS',\n`,
        leak: `    'THREE ROUTES · 77 DOORS · DELIVER THEM ALL',\n`,
    },
    {
        label: 'SPY HUNTER',
        jsx: 'src/games/SpyHunter/index.jsx',
        mf: 'src/games/SpyHunter/attract.js',
        import: '../src/games/SpyHunter/attract.js',
        slot: '<AttractMessage className="text-cyan-100/80 mt-3 px-8" messages={MESSAGES} />',
        wrap: `    'THE G-6155 IS HOT-WIRED',\n`,
        leak: `    'END EACH STAGE WITH THE BONUS CAR',\n`,
    },
    {
        label: 'LEMMINGS-LITE',
        jsx: 'src/games/Lemmings/index.jsx',
        mf: 'src/games/Lemmings/attract.js',
        import: '../src/games/Lemmings/attract.js',
        slot: '<AttractMessage className="text-amber-100/90 mt-2 px-8" messages={MESSAGES} />',
        blinkFrom: `animate-pulse">{PRESS}</p>`,
        wrap: `    'TAP A SKILL BUTTON TO PICK IT',\n`,
        leak: `    'ARROWS AIM · SPACE ASSIGNS · 1-4 PICK SKILL',\n`,
    },
    {
        label: 'MISSILE BATTLE',
        jsx: 'src/games/MissileBattle/index.jsx',
        mf: 'src/games/MissileBattle/attract.js',
        import: '../src/games/MissileBattle/attract.js',
        slot: '<AttractMessage className="text-amber-100/80 mt-2 px-8" messages={MESSAGES} />',
        blinkFrom: `animate-pulse">{PRESS}</p>`,
        wrap: `    'EVERY KILL CHAINS A SMALLER BLAST',\n`,
        leak: `    'LOSE ALL SIX CITIES AND THE MAP GOES DARK',\n`,
    },
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

const MUTATE_FILES = MODULES.filter((m) => /Defender|SpaceInvaders|Centipede|Gauntlet|DonkeyKong|Pitfall|MissileCommand|LunarLander|Tempest|OutRun/.test(m.file)).map((m) => m.file)

async function auditReact({ label, jsx: jsxPath, mf, import: spec, slot, wrap, leak, blinkFrom }) {
    const { MESSAGES, PRESS } = await import(spec)
    console.log(`attract (rule 6) — ${label}`)
    if (!Array.isArray(MESSAGES) || typeof PRESS !== 'string') {
        ok(false, `${label}: exports the React attract contract {PRESS, MESSAGES}`)
        return
    }
    ok(true, `${label}: exports the React attract contract {PRESS, MESSAGES}`)
    ok(MESSAGES.length >= 2, `${label}: has more than one message to cycle`, `${MESSAGES.length}`)
    ok(new Set(MESSAGES).size === MESSAGES.length, `${label}: no attract message repeats`)
    ok(MESSAGES.every((s) => s.length > 0 && s.length <= 44), `${label}: every message fits one line`,
        MESSAGES.filter((s) => s.length > 44).join(' | '))
    ok(!MESSAGES.some((s) => /attract mode|scripts?\/|\.mjs|audit|autopilot/i.test(s)),
        `${label}: no harness leak in a visible message`)
    ok(PRESS.length <= 24 && /ANY KEY/i.test(PRESS), `${label}: the press prompt is short and clear`, PRESS)

    const jsx = readFileSync(jsxPath, 'utf8')
    const block = jsx.slice(jsx.indexOf("{screen === 'attract'"), jsx.indexOf("{screen === 'over'"))
    ok(block.length > 0, `${label}: attract block found`)
    ok((block.match(/<AttractMessage/g) || []).length === 1, `${label}: exactly one cycling message slot`,
        `${(block.match(/<AttractMessage/g) || []).length}`)
    ok((block.match(/<p\b/g) || []).length === 1, `${label}: only the press prompt is a raw paragraph (no stacked rules)`,
        `${(block.match(/<p\b/g) || []).length}`)
    ok(block.includes('{MESSAGES}'), `${label}: the attract reads copy from the shared module`)
    ok(block.includes('{PRESS}'), `${label}: the press prompt comes from the shared module`)
    ok(block.includes('animate-pulse'), `${label}: the press prompt blinks`)
    const dim = block.match(/bg-black\/(\d+)/)
    ok(!!dim && Number(dim[1]) >= 40, `${label}: the demo dims behind the attract text`, dim ? dim[0] : 'no scrim')

    if (process.argv.includes('--mutate')) {
        const mutants = [
            ['the slot pins one message (never cycles)', jsxPath, 'messages={MESSAGES}', 'messages={[MESSAGES[0]]}'],
            ['a second rules slot stacks over the demo', jsxPath, slot, `${slot}\n                    <AttractMessage className="text-white/70" messages={MESSAGES} />`],
            ['the demo stops dimming', jsxPath, 'bg-black/55', 'bg-black/0'],
            ['the press prompt stops blinking', jsxPath, blinkFrom || 'animate-pulse',
                (blinkFrom || 'animate-pulse').replace('animate-pulse', 'opacity-100')],
            ['a message wraps the pane again', mf, wrap, `    'EVERY RULE AT ONCE: ARROWS FLY, SPACE FIRES, THE FLAGSHIP DROPS A TRACTOR BEAM THAT CAPTURES YOUR FIGHTER',\n`],
            ['a harness leak lands in a visible line', mf, leak, `    'attractcheck.mjs audits this attract screen',\n`],
        ]
        let died = 0
        for (const [name, file, from, to] of mutants) {
            const orig = readFileSync(file, 'utf8')
            if (!orig.includes(from)) { ok(false, `${label} anchor: ${name}`, `missing: ${from}`); continue }
            writeFileSync(file, orig.replace(from, to))
            const res = spawnSync(process.execPath, ['scripts/attractcheck.mjs'], { encoding: 'utf8' })
            if (res.status !== 0) { died++; ok(true, `${label} mutant dies: ${name}`) }
            else { ok(false, `${label} mutant dies: ${name}`, 'child passed despite the bug') }
            writeFileSync(file, orig)
        }
        ok(died === mutants.length, `${label}: all ${mutants.length} attract mutants die`, `${died}/${mutants.length}`)
    }
}

async function run() {
    for (const mod of MODULES) await audit(mod)
    for (const t of REACT_TITLES) await auditReact(t)

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
