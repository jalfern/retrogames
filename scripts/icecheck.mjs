// ICE CLIMBER CO-OP — the level audit. No browser, no dev server, ~1 s.
//
//   npm run icecheck              # solve every mountain + pin the rules
//   npm run icecheck -- --mutate  # put the load-bearing rules back to broken,
//                                 # watch the solver lose (a green mutant here
//                                 # means a check stopped touching the code)
//   npm run icecheck -- --map 2   # ASCII view of a mountain (bored = EMPTY)
//
// Why this exists (the issue's gate): the two muscles #70 asked for are the
// mutable tilemap and the second simultaneous input path. A mountain that
// cannot actually be bored is not a puzzle, and a co-op that a solo climber
// can finish is not co-op. None of that shows in a screenshot; all of it is
// decided in sim.js. The gate is the SAME closed-loop autopilot the attract
// demo runs — it may only speak like a player (per-tick two-player input
// vectors), and:
//
//   dig off      — the solver cannot leave the floor (tilemap not mutable)
//   shoulder off — THE STACK becomes impossible (co-op not geometric)
//   revive       — pinned: touch revives, and the audit's --mutate proves a
//                  revive-off run of the same forced accident does NOT recover
//   slack rule   — one fewer LIFE than the run consumes: still winnable
//   determinism  — replay hashes identical; one flipped input tick is not

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { LEVELS, buildLevel } from '../src/games/IceClimber/levels.js'
import * as sim from '../src/games/IceClimber/sim.js'
import { plan, replay, BAIL_PER_MOUNTAIN } from '../src/games/IceClimber/planner.js'
import { plant, pull } from './lib/mutateguard.mjs'

const args = process.argv.slice(2)
const MUT = args.includes('--mutate')
const mapArg = args.includes('--map') ? +args[args.indexOf('--map') + 1] : null

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

if (mapArg !== null) {
    const meta = buildLevel(mapArg)
    console.log(`MOUNTAIN ${mapArg} — ${meta.name}  spawn(${meta.spawn.x}) carrot(${meta.carrot})`)
    for (let y = 0; y < sim.H; y++) {
        let line = ''
        for (let x = 0; x < sim.W; x++) {
            line += x === Math.floor(meta.spawn.x) && y === meta.spawn.y ? 'S'
                : x === meta.carrot[0] && y === meta.carrot[1] ? '@'
                    : meta.grid[y * sim.W + x] === sim.ICE ? '#'
                        : meta.grid[y * sim.W + x] === sim.ROCK ? '='
                            : meta.grid[y * sim.W + x] === sim.PLAT ? '-' : '.'
        }
        console.log(line)
    }
    process.exit(0)
}

// --------------------------------------------------- the full three-summit run ----
const t0 = Date.now()
const full = plan(sim.makeGame(buildLevel(0)))
const runMs = Date.now() - t0

section('THE ROUTE (the autopilot that IS the attract demo)')
ok(full.ok, `the autopilot did not finish the mountain range: end=${full.end} reason=${full.reason}`)
ok(runMs < 6000, `the solve took ${runMs} ms — the audit must stay a second, not a minute`)
ok(full.receipts.digs >= 60, `only ${full.receipts.digs} tiles punched — the route did not really bore the massif (mutable tilemap unused)`)
ok(full.receipts.stack === 1, `stack receipt ${full.receipts.stack} — THE STACK was not won by a climber on a climber`)
ok(full.receipts.dodges === 1, 'condor-pass phase-wait never ran')
{
    const aAct = full.script.filter(t => t.a.l || t.a.r || t.a.u).length
    const bAct = full.script.filter(t => t.b.l || t.b.r || t.b.u).length
    ok(aAct > 0 && bAct > 0, `input streams: A=${aAct} B=${bAct} ticks active — a dead key set is not a second player`)
    ok(full.script.every(t => 'a' in t && 'b' in t), 'a tick lacked one player\'s input vector')
}

// ----------------------------------------- #1653: the bail, scaled + resumable ----
section('BAIL (per remaining mountain, entry-relative)')
{
    const src = readFileSync(new URL('../src/games/IceClimber/planner.js', import.meta.url), 'utf8')
    ok(Number.isFinite(BAIL_PER_MOUNTAIN) && BAIL_PER_MOUNTAIN <= 12000,
        `BAIL_PER_MOUNTAIN=${BAIL_PER_MOUNTAIN} — the bail must stay trimmed (observed worst solve 4743 ticks; the old flat bail was 60000)`)
    ok(!/g\.tick < 60000/.test(src), 'planner still carries the flat 60000-tick bail — the #1653 trim regressed')
    ok(/g\.tick - entryTick < \(3 - g\.level\) \* BAIL_PER_MOUNTAIN/.test(src),
        'the bail loop no longer scales to the remaining mountains (#1653)')
    ok(full.script.length < BAIL_PER_MOUNTAIN,
        `full range burned ${full.script.length} script ticks vs a ${3 * BAIL_PER_MOUNTAIN}-tick fresh budget — headroom is not luck`)
    // Entry-relative accounting: an aged live state (a PROGNOSIS clone deep
    // in a session) gets its full remaining budget and still wins. An
    // absolute `g.tick < budget` bail would refuse this game instantly.
    const aged = sim.makeGame(buildLevel(2))
    aged.tick = 45000
    const ra = plan(aged)
    ok(ra.ok, `aged-state resume refused the route (${ra.end} ${ra.reason}) — the bail is not entry-relative`)
}

// ------------------------------------------- each mountain, alone, with proofs ----
for (let i = 0; i < LEVELS.length; i++) {
    section(`MOUNTAIN ${i} — ${LEVELS[i].name}`)
    const g = sim.makeGame(buildLevel(i))
    const r = plan(g)
    ok(r.ok || g.end === 'win', `${LEVELS[i].name}: not winnable alone (${g.end} ${r.reason})`)
    for (const token of LEVELS[i].proves) {
        if (token === 'dig') ok(g.climbers.reduce((n, c) => n + c.digs, 0) > 15, `${LEVELS[i].name}: 'dig' claimed but nobody bored anything`)
        if (token === 'shoulder') ok((r.receipts || {}).stack === 1 || g.climbers[0].y < 4, `${LEVELS[i].name}: 'shoulder' claimed with no head-stand`)
        if (token === 'dodge') ok((r.receipts || {}).dodges === 1, `${LEVELS[i].name}: 'dodge' claimed but the condor wait never ran`)
    }
    // SLACK RULE: one fewer of every supply the winning script consumes.
    // The consumed supply here is LIVES — deaths cost lives, and with zero
    // deaths a fresh -1 game must STILL be winnable (a single misstep must
    // not mathematically lose the game).
    const meta = buildLevel(i)
    const tight = sim.makeGame({ ...meta, lives: sim.CFG.lives - 1 })
    const rt = plan(tight)
    ok(rt.ok, `${LEVELS[i].name}: ZERO SLACK — with ${sim.CFG.lives - 1} lives the solver itself cannot win; a human who loses one has lost`)
}

// ------------------------------------------------------------- rule pins --------
section('RULE PINS (each one is the game, not a mood)')
{
    // punching a massif actually changes the map, and the change PERSISTS
    const meta = buildLevel(0)
    const g = sim.makeGame(meta)
    const before = g.grid.filter(t => t === sim.ICE).length
    const one = plan(g)
    const after = g.grid.filter(t => t === sim.ICE).length
    ok(one.ok, `pin run failed: ${one.reason}`)
    ok(before - after >= 20, `only ${before - after} ice cells destroyed across a won mountain — the tilemap is not mutable`)
}
{
    // un-punched ice blocks an upward climb; a bored shaft does not
    const g = sim.makeGame(buildLevel(0))
    let t = 0
    for (; t < 900 && Math.abs(g.climbers[0].x - 8.5) > 0.12; t++) sim.step(g, { a: { r: 1 }, b: {} })
    const y0 = g.climbers[0].y
    for (let i = 0; i < 3; i++) sim.step(g, { a: { u: 1 }, b: {} })
    ok(g.climbers[0].y < y0 || g.climbers[0].climbing, 'UP under un-bored ice did not even grab the column')
}
{
    // condor downs (and spends a life); touch revives; revive-off does NOT.
    // Climbers are placed under the bird's start (setup rig) — the only
    // physics involved is the patrol clock.
    const g2 = sim.makeGame(buildLevel(1))
    g2.climbers[0].x = 12.4; g2.climbers[0].y = 6      // bird starts at 12.6
    let downAt = -1
    for (let t = 0; t < 60 && downAt < 0; t++) {
        sim.step(g2, { a: {}, b: {} })
        if (g2.events.some(e => e.type === 'down')) downAt = t
    }
    ok(downAt >= 0, 'a climber parked under the condor was never downed')
    ok(g2.lives === sim.CFG.lives - 1, `a down must cost exactly one shared life: lives=${g2.lives}`)
    ok(g2.climbers[1].y === 32 && !g2.climbers[1].down, 'the partner must survive on the floor')
    g2.climbers[1].x = g2.climbers[0].x; g2.climbers[1].y = g2.climbers[0].y
    g2.birds[0].x = 8.95            // park the bird at its far fence first:
    g2.birds[0].dir = 1             // a partner teleported into the band is
    sim.step(g2, { a: {}, b: {} })  // a second accident, not a rescue
    ok(!g2.climbers[0].down && g2.events.some(e => e.type === 'revive'),
        'touching the body did not revive — revive is dead')
    const g3 = sim.makeGame(buildLevel(1))
    sim.CFG.revive = false
    g3.climbers[0].x = 12.4; g3.climbers[0].y = 6
    for (let t = 0; t < 10; t++) sim.step(g3, { a: {}, b: {} })
    g3.birds[0].x = 8.95; g3.birds[0].dir = 1
    if (g3.climbers[0].down) { g3.climbers[1].x = g3.climbers[0].x; g3.climbers[1].y = g3.climbers[0].y }
    ok(g3.climbers[0].down && !g3.climbers[1].down, 'revive-off pin lost the wrong climber (setup bug, not a rule)')
    for (let t = 0; t < 20; t++) sim.step(g3, { a: {}, b: {} })
    sim.CFG.revive = true
    ok(g3.climbers[0].down, 'a touch revived with revive DISABLED — the rule switch is not wired')
}
{
    // the shoulder rule is NOT decorative: stand a climber on a climber
    const g = sim.makeGame(buildLevel(2))
    const [a, b] = g.climbers
    a.x = 9.4; a.y = 6; b.x = 9.4; b.y = 6
    let landed = false
    for (let t = 0; t < 90 && !landed; t++) {
        sim.step(g, { a: { j: t === 5 ? 1 : t === 6 ? 0 : 0 }, b: {} })
        landed = a.grounded && a.onPartner
    }
    ok(landed, 'a climber could not land on the partner head — the shoulder rule is dead')
    sim.CFG.shoulder = false
    let solo = null
    {
        const s = sim.makeGame(buildLevel(2))
        const [c1, c2] = s.climbers
        c1.x = 9.4; c1.y = 6; c2.x = 9.4; c2.y = 6
        for (let t = 0; t < 200; t++) sim.step(s, { a: { j: t === 5 ? 1 : 0 }, b: {} })
        solo = c1
    }
    sim.CFG.shoulder = true
    ok(!solo.grounded || solo.y > 3.4, 'a SOLO climber reached the carrot shelf without the shoulder rule')
}
{
    // #3151 THE DOWN VERB ANSWERS, AND THE BORE LAW HOLDS. From the floor:
    // a crouch tell, no falling through rock. Off the summit shelf: the
    // classic drop-through, landing on the floor below. While climbing: a
    // dive that releases the grip and falls faster than gravity alone.
    const g = sim.makeGame(buildLevel(0))
    const a = g.climbers[0]
    sim.step(g, { a: {}, b: {} })          // let the spawn settle first
    g.events.length = 0
    sim.step(g, { a: { d: 1 }, b: {} })
    ok(g.events.some(e => e.type === 'crouch' && e.who === 0),
        'DOWN on solid ground was silent — the verb must answer (#3151)')
    ok(a.y === 32 && a.grounded, `DOWN opened the massif floor (y=${a.y}) — solid rock stays solid`)
    // shelf drop-through: stand on PLAT row 6, press DOWN once — the body
    // passes the shelf and lands on the flank below it, not on the shelf.
    const s = sim.makeGame(buildLevel(0))
    const p = s.climbers[0]
    p.x = 9.5; p.y = 6; p.grounded = true; p.vy = 0
    g.events.length = 0; s.events.length = 0
    sim.step(s, { a: { d: 1 }, b: {} })
    ok(s.events.some(e => e.type === 'drop' && e.way === 'shelf'),
        'DOWN on a snow shelf did not drop through — the classic is dead')
    const evs = []
    for (let t = 0; t < 240 && !(p.grounded && p.y > 6.5); t++) { sim.step(s, { a: {}, b: {} }); evs.push(...s.events) }
    ok(p.grounded && p.y > 6.5, `the shelf drop never left the shelf row (y=${p.y}, grounded=${p.grounded})`)
    ok(!evs.some(e => e.type === 'land' && Math.round(p.y) === 6), 'the drop re-landed ON the shelf it fell through')
    // dive: grip the column, then DOWN releases it with a fast-fall kick
    const d = sim.makeGame(buildLevel(0))
    const c = d.climbers[0]
    let t = 0
    for (; t < 900 && Math.abs(c.x - 8.5) > 0.12; t++) sim.step(d, { a: { r: 1 }, b: {} })
    for (let i = 0; i < 12; i++) sim.step(d, { a: { u: 1 }, b: {} })
    ok(c.climbing, 'dive setup: could not grab the column')
    d.events.length = 0
    const vy0 = c.vy
    sim.step(d, { a: { u: 1, d: 1 }, b: {} })
    ok(!c.climbing && c.vy >= sim.CFG.dive + vy0 - 1e-9,
        `DOWN while climbing did not dive (climbing=${c.climbing}, vy ${vy0}→${c.vy})`)
    ok(d.events.some(e => e.type === 'dive'), 'the dive was silent — no event for the verb')
}
{
    // #3151 THE BORE ANSWERS WHILE IT WORKS: chips arrive before the cell pops.
    const g = sim.makeGame(buildLevel(0))
    const c = g.climbers[0]
    let t = 0
    for (; t < 900 && Math.abs(c.x - 8.5) > 0.12; t++) sim.step(g, { a: { r: 1 }, b: {} })
    const chipsSeen = []
    for (let i = 0; i < 9; i++) { sim.step(g, { a: { u: 1 }, b: {} }); chipsSeen.push(...g.events.map(e => e.type)) }
    const chips = chipsSeen.filter(e => e === 'punchTick').length
    ok(chips >= 2, `nine ticks of drilling emitted ${chips} chips — the bore is silent until it pops (#3151)`)
    ok(chipsSeen.includes('dig'), 'the nine-tick bore never punched a cell (setup drift?)')
    ok(chipsSeen.indexOf('punchTick') < chipsSeen.lastIndexOf('dig'),
        'a chip never arrived before the dig — the bore still only answers at the pop')
    // UP against un-grabbable massif grunts too (every 4th tick of the push)
    const w = sim.makeGame(buildLevel(0))
    const wEvs = []
    for (let i = 0; i < 9; i++) { sim.step(w, { a: { u: 1 }, b: {} }); wEvs.push(...w.events.map(e => e.type)) }
    ok(wEvs.includes('push'), 'UP into a wall that cannot be grabbed is silent (#3151)')
}

// ------------------------------------------------------- determinism + tamper ----
section('DETERMINISM (the attract demo IS a replay of this solve)')
{
    const g = sim.makeGame(buildLevel(0))
    const p = plan(g)
    const h1 = sim.stateHash(g)
    const r = replay(buildLevel(0), p.script, p.advanceAt)
    ok(sim.stateHash(r) === h1, `replaying the solve through step() diverged — the sim is not a pure function (replay ${sim.stateHash(r)} vs ${h1})`)
    // tamper: flip the FIRST player-A jump tick (the stack's first hop)
    const jTick = p.script.findIndex(t => t.a.j)
    ok(jTick > 0, 'the winning script contains no player-A jump — tamper probe could not run')
    const bad = p.script.map((t, i) => (i === jTick ? { ...t, a: { ...t.a, j: 0 } } : t))
    const w = replay(buildLevel(0), bad, p.advanceAt)
    ok(sim.stateHash(w) !== h1, 'the hash ignores a dropped jump — determinism could not catch a desync')
    ok(w.end !== 'win', 'THE STACK was cleared with the first hop not taken — the stack was theatre')
}

// --------------------------------------------------------------- mutations ------
if (MUT) {
    section('MUTATIONS — each one MUST turn an honest check red')
    const tryMut = (name, apply, probe) => {
        const base = probe()
        ok(base, `mutation harness broken: baseline for '${name}' is already false`)
        const save = { ...sim.CFG }
        Object.assign(sim.CFG, apply)
        const verdict = probe()
        Object.assign(sim.CFG, save)
        console.log(`  mut ${name}: ${verdict ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(!verdict, `${name} SURVIVED — a check stopped touching this rule`)
    }
    tryMut('dig=false (ice never breaks)', { dig: false }, () => plan(sim.makeGame(buildLevel(0))).ok)
    tryMut('shoulder=false (no head-stand)', { shoulder: false }, () => plan(sim.makeGame(buildLevel(2))).ok)
    tryMut('climb=0 (no upward hold)', { climb: 0 }, () => plan(sim.makeGame(buildLevel(0))).ok)
    tryMut('jumpV=0 (no jumps at all)', { jumpV: 0 }, () => plan(sim.makeGame(buildLevel(2))).ok)
    tryMut('moveRight=false (P1 key path dead)', { moveRight: false }, () => plan(sim.makeGame(buildLevel(0))).ok)
    // #3151: the DOWN verb must be load-bearing for its own checks, not the win
    tryMut('down=false (the DOWN verb goes silent)', { down: false }, () => {
        const g = sim.makeGame(buildLevel(0))
        sim.step(g, { a: {}, b: {} })
        sim.step(g, { a: { d: 1 }, b: {} })
        return g.events.some(e => e.type === 'crouch')
    })
}


// ------------------------------------------------------------- attract rule 6 ----
// ART.md rule 6 (#365): the attract shows ONE informational message at a
// time, cycling, over a dimmed demo — never a stacked tagline + rules wall.
// attract.js is the copy the shell actually renders, so this audit cannot rot
// away from the pixels.
section('attract (rule 6)')
{
    const { MESSAGES, PRESS } = await import('../src/games/IceClimber/attract.js')
    ok(MESSAGES.length >= 2, 'attract cycles through more than one message')
    ok(new Set(MESSAGES).size === MESSAGES.length, 'attract messages are unique')
    ok(MESSAGES.every((m) => m.length <= 44), 'no attract message wraps a narrow pane')
    ok(!!PRESS, 'attract keeps its press prompt')
    const jsx = readFileSync(new URL('../src/games/IceClimber/index.jsx', import.meta.url), 'utf8')
    const block = jsx.slice(jsx.indexOf("{screen === 'attract'"), jsx.indexOf("{screen === 'over'"))
    ok(block.length > 0, 'the attract block exists')
    ok(!/<br/.test(block), 'the attract stacks no hard line breaks')
    ok((block.match(/<p\b/g) || []).length === 1, 'the attract draws exactly one <p> (the press prompt)')
    ok(/<AttractMessage\b[^>]*messages=\{MESSAGES\}/.test(block), 'rules ride the cycling <AttractMessage>')
    ok(/bg-black\/[45]\d/.test(block), 'the attract dims the demo')
}
if (MUT) {
    const jsxPath = new URL('../src/games/IceClimber/index.jsx', import.meta.url).pathname
    const copyPath = new URL('../src/games/IceClimber/attract.js', import.meta.url).pathname
    const jsxOrig = readFileSync(jsxPath, 'utf8')
    const copyOrig = readFileSync(copyPath, 'utf8')
    const attractMutants = [
        ['attract stacks a second message', jsxPath, jsxOrig,
            'animate-pulse">{PRESS}</p>',
            'animate-pulse">{PRESS}</p>\n                    <p>ANOTHER RULE LINE STACKED</p>'],
        ['an attract message wraps the pane', copyPath, copyOrig,
            "'STAND ON YOUR PARTNER FOR THE LAST CARROT',",
            "'THE LAST CARROT HANGS ONE HEAD TALLER THAN ANY JUMP — STAND ON YOUR PARTNER',"],
        ['the attract stops dimming the demo', jsxPath, jsxOrig,
            'bg-black/55 flex flex-col',
            'bg-transparent flex flex-col'],
    ]
    for (const [name, path, orig, from, to] of attractMutants) {
        if (!orig.includes(from)) { ok(false, `attract mutant anchor: ${name}`); continue }
        plant(path, orig.replace(from, to))
        try {
            const child = spawnSync(process.execPath, [process.argv[1]], { encoding: 'utf8' })
            ok(child.status !== 0, `attract mutant SURVIVED: ${name}`)
        } finally {
            pull(path)
        }
    }
}

console.log(`\nicecheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach(f => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
