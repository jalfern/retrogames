// LEMMINGS-LITE — the level audit. No browser, no dev server, ~1 s.
//
//   npm run lemcheck              # solve every level + pin the rules
//   npm run lemcheck -- --mutate  # put four load-bearing bugs back, watch red
//   npm run lemcheck -- --map 2   # ASCII view of a level
//
// Why this exists (the issue's gate): a Lemmings level that cannot actually be
// cleared — a wall the climber cannot finish, a door the blast cannot open, a
// crowd that gridlocks forever — is not a puzzle, it is furniture. None of
// that shows in a screenshot. All of it is decided inside sim.js, so the gate
// is the SAME greedy solver the attract demo runs: it may only speak like a
// player ({tick,id,skill} commands, no peeks), and a level it cannot clear
// with that level's own skill supply fails the build.
//
// Two stronger claims ride on top:
//  - each skill in a level's `proves` list is LOAD-BEARING: solve again with
//    that supply set to zero — the solver must then LOSE. A skill you can take
//    away is not a mechanic.
//  - replay is real: re-running the solver's own recorded script must produce
//    an identical state hash, and a script with ONE tick bumped must not.

import { LEVELS, buildLevel } from '../src/games/Lemmings/levels.js'
import { LAYOUT } from '../src/games/Lemmings/layout.js'
import { PRESS, MESSAGES, demoFloatPick, certifyDemoFloat } from '../src/games/Lemmings/attract.js'
import * as sim from '../src/games/Lemmings/sim.js'
import { MUSIC } from '../src/utils/AudioController.js'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const MUT = args.includes('--mutate')
const mapArg = args.includes('--map') ? +args[args.indexOf('--map') + 1] : null

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`)

if (mapArg !== null) {
    const { meta, grid } = buildLevel(mapArg)
    console.log(`LEVEL ${mapArg} — ${meta.name}  spawn(${meta.spawn.x}) exit(${meta.exit.x},${meta.exit.y}) need ${meta.need}/${meta.spawnCount} skills ${JSON.stringify(meta.skills)}`)
    for (let y = 0; y < sim.H; y++) {
        let line = ''
        for (let x = 0; x < sim.W; x++) {
            const t = grid[y * sim.W + x]
            line += x === meta.spawn.x && y === meta.spawn.y - 1 ? 'S'
                : x === meta.exit.x && y === meta.exit.y ? 'E'
                    : t === sim.DIRT ? '#' : t === sim.STEEL ? '=' : t === sim.WATER ? '~' : t === sim.PLANK ? 'P' : '.'
        }
        console.log(line)
    }
    process.exit(0)
}

const runSolver = (levelIdx) => {
    const { meta, grid } = buildLevel(levelIdx)
    const t0 = Date.now()
    const r = sim.solve(sim.makeGame(meta, grid))
    return { ...r, ms: Date.now() - t0, meta, grid }
}

// ------------------------------------------------------------- solvability ----
for (let i = 0; i < LEVELS.length; i++) {
    const r = runSolver(i)
    section(`LEVEL ${i} — ${r.meta.name}`)
    ok(r.exited >= r.meta.need, `${r.meta.name}: solver delivered ${r.exited}/${r.meta.need} — the level is not winnable with its own skill supply`)
    ok(r.win === true, `${r.meta.name}: solver ended '${r.end}' without winning (exited ${r.exited}, dead ${r.dead})`)
    ok(r.exited > 0 || r.meta.need === 0, `${r.meta.name}: zero lemmings ever exited`)
    ok(r.ms < 8000, `${r.meta.name}: solver took ${r.ms} ms — the audit must stay a second, not a minute`)
    for (const skill of r.meta.proves || []) {
        const { meta, grid } = buildLevel(i)
        const meta2 = { ...meta, skills: { ...meta.skills, [skill]: 0 } }
        const r2 = sim.solve(sim.makeGame(meta2, grid))
        ok(!r2.win, `${r.meta.name}: still won with ZERO '${skill}' supplies — '${skill}' is decoration, not a mechanic`)
    }
    // THE SLACK RULE (learned from live play, level 1): winnable by a perfect
    // solver is NOT humanly winnable. THE SPIRE shipped climb:4 need:4 — a
    // flawless 4/4 route, and Jon watched one climber die and a "winnable"
    // level become mathematically lost. The human question, asked of the
    // real solver: with ONE fewer of every supply the winning script uses,
    // can the level STILL be won? (Not "is the skill load-bearing" — the
    // proves loop covers that. This is the margin between the two.)
    const used = {}
    for (const c of r.cmds) used[c.skill] = (used[c.skill] || 0) + 1
    for (const skill of Object.keys(used)) {
        const have = r.meta.skills[skill] || 0
        const { meta, grid } = buildLevel(i)
        const meta2 = { ...meta, skills: { ...meta.skills, [skill]: have - 1 } }
        const r2 = sim.solve(sim.makeGame(meta2, grid))
        ok(r2.win,
            `${r.meta.name}: ZERO SLACK in '${skill}' (supply ${have}) — with one fewer the solver itself cannot win, so any human who loses one has lost. Give ${skill} +1 supply or the level -1 need.`)
    }
}

// --------------------------------------------------------------- determinism ---
{
    section('DETERMINISTIC REPLAY (attract mode IS this replay)')
    // L4, because a BLOCK command is position-sensitive: its stop point is a
    // continuous coordinate, so a one-tick-late assignment is recorded in the
    // final hash. (A CLIMB tick late converges to an identical replay — the
    // climber re-attaches at the same wall-contact quantization — and that
    // convergence was discovered when a tamper probe on L1/L2 passed green on
    // a perturbation that provably does nothing. The probe must be able to
    // fail, so it perturbs the command whose geometry cannot re-sync.)
    const { meta, grid } = buildLevel(3)
    const r = sim.solve(sim.makeGame(meta, grid))
    const a = sim.replay(meta, grid, r.cmds)
    const b = sim.replay(meta, grid, r.cmds)
    ok(sim.stateHash(a) === sim.stateHash(b), 'two replays of the same script disagree — the sim is not a pure function')
    ok(a.exited === r.exited && a.dead === r.dead, `replay disagrees with the solve it replays (${a.exited}/${r.exited} exited)`)
    const tampered = r.cmds.map((c, i) => (i === 0 ? { ...c, tick: c.tick + 1 } : c))
    const c = sim.replay(meta, grid, tampered)
    ok(sim.stateHash(c) !== sim.stateHash(a) || c.exited !== a.exited,
        'the hash ignores a one-tick script change — the determinism check could not catch a desync')
}

{
    section('REPLAY PHASE (#3892) — stamp T lands between the steps; effect at T+1')
    // The pre-fix replay fetch was `byTick.get(g.tick + 1)`: every command fired one
    // tick early, so the demo ran a line the oracle never verified — bodies a tick of
    // motion off when a boundary arrived, and THE DOOR drowned two walkers it had
    // promised it wouldn't (6/1 solve, 6/3 replay). Two layers of pins:
    //  (1) every board: replay's outcome must equal solve's outcome — the product
    //      promise that the attract autopilot loses EXACTLY what the oracle predicted.
    //  (2) THE DOOR directly: a command stamped T must not be live at tick T and must
    //      be live at T+1 — the very phase solve used and a human keypress has, so
    //      replay may shift neither. Disabling the phase fix reddens layer (2) three
    //      ways and layer (1) on DOOR (hand-mutation proof shipped with the fix).
    for (let i = 0; i < LEVELS.length; i++) {
        const { meta, grid } = buildLevel(i)
        const r = sim.solve(sim.makeGame(meta, grid))
        const rp = sim.replay(meta, grid, r.cmds)
        ok(rp.exited === r.exited && rp.dead === r.dead,
            `${meta.name}: replay ${rp.exited}/${rp.dead} disagrees with solve ${r.exited}/${r.dead} — the demo runs a line the oracle did not verify`)
    }
    const EFFECT = {
        block: (L) => L.state === 'block', bomb: (L) => L.state === 'bomb',
        climb: (L) => L.climber, dig: (L) => L.digger,
        float: (L) => L.floater, build: (L) => L.builder,
    }
    const { meta, grid } = buildLevel(2)          // THE DOOR: bomb + block at the pond rim
    const r = sim.solve(sim.makeGame(meta, grid))
    ok(r.cmds.length >= 2, `THE DOOR: script has ${r.cmds.length} commands — the direct phase probe needs the bomb + block line`)
    for (const cmd of r.cmds) {
        const seen = {}
        sim.replay(meta, grid, r.cmds, {
            onTick: (g) => { const L = g.lemmings[cmd.id]; if (L) seen[g.tick] = EFFECT[cmd.skill](L) },
        })
        ok(seen[cmd.tick] === false, `THE DOOR: ${cmd.skill} for lem ${cmd.id} already live at stamp tick ${cmd.tick} — the one-tick-early fetch is back (#3892)`)
        ok(seen[cmd.tick + 1] === true, `THE DOOR: ${cmd.skill} for lem ${cmd.id} not live at stamp+1 — replay phase shifted late`)
    }
    // The sim pin cannot see the shell. On screen, the attract replay and the
    // WATCH line are what the player actually watches — audit the source so a
    // `+ 1` cannot silently return to the component layer.
    {
        const src = readFileSync(new URL('../src/games/Lemmings/index.jsx', import.meta.url), 'utf8')
        ok(/plan\.find\(cc => cc\.tick === gs\.tick\)/.test(src), '#3892 attract applies its plan off-phase in the shell — the on-screen demo runs ahead of the proof')
        ok(/watchScript\.find\(cc => cc\.tick === gs\.tick\)/.test(src), '#3892 WATCH applies its script off-phase in the shell — the guided line runs ahead of the proof')
    }
}

// ---------------------------------------------------------------- rule pins ----
{
    section('RULE PINS (each is the game, not a mood)')
    const { meta, grid } = buildLevel(0)
    const mk = () => sim.makeGame(meta, grid)

    // a climber takes dirt handholds; steel over the dirt refuses it
    {
        const g = mk()
        for (let t = 0; t < 70; t++) sim.step(g)
        const L = g.lemmings[0]
        L.x = 16.9; L.y = 23; L.dir = 1; L.climber = true
        const start = L.y
        for (let t = 0; t < 200; t++) sim.step(g)
        ok(L.y < start - 2, 'a climber did not climb the dirt spire — the climb rule is dead')
        // THE DOOR: dirt plug under a steel column — a climber attaches to the
        // dirt, then finds steel above: no handhold. Nobody gets over the door.
        const { meta: m3, grid: g3 } = buildLevel(2)
        const d = sim.makeGame(m3, g3)
        for (let t = 0; t < 100; t++) sim.step(d)
        sim.assign(d, d.lemmings[0].id, 'climb')
        for (let t = 0; t < 1200; t++) sim.step(d)
        ok(d.exited === 0, 'climbers went over the steel-plugged door — the steel-refusal rule died (and the door puzzle with it)')
    }
    // bombs erase dirt, never steel — graded off the REAL solver's blast:
    // the first explosion of the winning script must clear the plug and leave
    // the steel column standing, or the door puzzle is theatre
    {
        const { meta: m3, grid: g3 } = buildLevel(2)
        const r3 = sim.solve(sim.makeGame(m3, g3))
        let snap = null
        sim.replay(m3, g3, r3.cmds, {
            onTick(g) {
                if (!snap && g.events.some(e => e.type === 'blast')) {
                    snap = { door: sim.cell(g, 20, 22), s1: sim.cell(g, 20, 10), s2: sim.cell(g, 20, 15) }
                }
            }
        })
        ok(!!snap, 'the winning script never detonated a bomb — how did it open the door?')
        ok(snap && snap.door === sim.AIR, 'the blast did not open the dirt plug')
        ok(snap && snap.s1 === sim.STEEL && snap.s2 === sim.STEEL,
            'a bomb chewed steel — the door puzzles depend on steel surviving')
    }
    // fatal vs safe falls — ABSOLUTE pins (#3849): the original kills past ~3
    // tiles. The old fatal pin read `CFG.maxFall + 1`, so it stayed green even
    // at the old value of 7 — a relative pin cannot catch the value drifting.
    // 4 tiles MUST die, a stepped-down fall MUST land within 3.
    {
        const g = mk()
        for (let t = 0; t < 60; t++) sim.step(g)
        const L = g.lemmings[0]
        L.state = 'fall'; L.fallDist = 4; L.vy = 8
        L.x = 4.5; L.y = 22.5
        for (let t = 0; t < 60; t++) sim.step(g)
        ok(L.state === 'dead', '#3849: a 4-tile fall survived — the original kills past 3, maxFall drifted')
        const g2 = mk()
        for (let t = 0; t < 60; t++) sim.step(g2)
        const S = g2.lemmings[0]
        S.state = 'fall'; S.fallDist = 1; S.vy = 8; S.x = 4.5; S.y = 22.5
        for (let t = 0; t < 30; t++) sim.step(g2)
        ok(S.live && S.state !== 'dead', 'a short fall killed — walkers cannot survive their own terrain')
    }
    // a blocker turns walkers; the dead block too
    {
        const g = mk()
        for (let t = 0; t < 120; t++) sim.step(g)
        const A = g.lemmings[0], B = g.lemmings[1]
        A.state = 'block'
        B.state = 'walk'; B.x = A.x - 1.2; B.dir = 1; B.y = A.y
        for (let t = 0; t < 90; t++) sim.step(g)
        ok(B.dir === -1 || B.x < A.x, 'a blocker failed to turn a walker — the blocker is inert')
        A.state = 'dead'
        B.x = A.x - 1.2; B.dir = 1
        for (let t = 0; t < 90; t++) sim.step(g)
        ok(B.dir === -1 || B.x < A.x, 'a corpse no longer blocks — the classic body-pile rule died')
    }
    // #3864 BLOCKER-WAKE — the original's one-shot law, pinned three ways: the
    // climb-over combo releases the line, a body crossing the head line spends
    // it, and an uncrossed blocker holds for the whole level like the four
    // shipped boards were designed to.
    {
        // (1) THE SPIRE's pond rim: a climber mounts the blocker, crosses his
        // head, and lands west of him — in the pond, which takes him. The
        // block released mid-cross; the blocker resumes west and follows him
        // under (the original judges the player's choice of shoreline).
        const g = mk()
        for (let t = 0; t < 120; t++) sim.step(g)
        const A = g.lemmings[0], B = g.lemmings[1]
        A.state = 'walk'; A.x = 4.5; A.y = 23; A.dir = -1
        ok(sim.assign(g, A.id, 'block'), 'setup: THE SPIRE ships one BLOCKER (#3864) — the supply is missing')
        B.state = 'walk'; B.x = 5.6; B.y = 23; B.dir = -1; B.climber = true
        const wakes = [], crosses = []
        for (let t = 0; t < 240; t++) {
            sim.step(g)
            for (const e of g.events) {
                if (e.type === 'wake') wakes.push(e.id)
                if (e.type === 'climbblock') crosses.push(e.id)
            }
        }
        ok(crosses.includes(B.id), 'a climber walked past or around the blocker instead of climbing him — the first-rung combo is dead')
        ok(wakes.includes(A.id), 'the blocker was never released by the lemming who crossed his head — the one-shot law is missing')
        ok(g.drowned >= 1, 'the climber crossed the line unharmed — the far side of a pond rim is still the pond')
    }
    {
        // (2) wakeCheck, the non-climber half: any body that ends up over the
        // head line spends the block — here a faller landing on his shoulders.
        const g = mk()
        for (let t = 0; t < 120; t++) sim.step(g)
        const A = g.lemmings[0]
        A.state = 'walk'; A.x = 10.5; A.y = 23; A.dir = 1
        sim.assign(g, A.id, 'block')
        const B = g.lemmings[1]
        B.state = 'fall'; B.x = 10.5; B.y = 21.8; B.vy = 0; B.fallDist = 0
        let woke = false
        for (let t = 0; t < 120; t++) { sim.step(g); if (g.events.some(e => e.type === 'wake' && e.id === A.id)) woke = true }
        ok(woke, 'a lemming landing on a blocker\u2019s head did not spend the block — wakeCheck is dead')
        ok(B.live && B.state !== 'dead', 'a body crossing the head line was killed by the line itself — traffic must tolerate the crosser')
    }
    {
        // (3) an unclimbed line holds forever — the four shipped boards lean on
        // this (THE LEDGE drains without it), so wake must not leak on its own.
        const g = mk()
        for (let t = 0; t < 120; t++) sim.step(g)
        const A = g.lemmings[0]
        A.state = 'walk'; A.x = 12.5; A.y = 23; A.dir = 1
        sim.assign(g, A.id, 'block')
        for (let t = 0; t < 600; t++) sim.step(g)
        ok(A.state === 'block', 'a blocker woke though nobody ever crossed him — the lines the levels are designed around would open by themselves')
    }
    // the digger tunnels dirt and stops at steel
    {
        const { meta: m2, grid: g2 } = buildLevel(1)
        const g = sim.makeGame(m2, g2)
        for (let t = 0; t < 60; t++) sim.step(g)
        const L = g.lemmings[0]
        L.state = 'dig'; L.digger = true
        L.x = 13.1; L.y = 23; L.dir = 1
        for (let t = 0; t < 90; t++) sim.step(g)
        ok(g.grid[22 * sim.W + 14] === sim.AIR, 'the digger did not chew the dirt wall — the massif is impassable')
    }
    // supplies bind: no skill left, no magic
    {
        const g = mk()
        for (let t = 0; t < 60; t++) sim.step(g)
        g.skills.climb = 0
        const before = g.lemmings[0].climber
        ok(!sim.assign(g, 0, 'climb') && g.lemmings[0].climber === before, 'a zero supply still granted a skill')
    }
    // a climber / digger keeps its skill for life: re-granting it costs nothing.
    // #422 item 2 (blocker): the guard only checked the current STATE, so a
    // climber that had crested a wall — back in 'walk' but still a climber — ate
    // another CLIMBER charge on every press, and on THE SPIRE a clump drained all
    // six. The original Lemmings refuses to hand a climber the climber twice.
    {
        const g = mk()
        for (let t = 0; t < 80; t++) sim.step(g)
        const L = g.lemmings[0]
        const have = g.skills.climb
        ok(sim.assign(g, L.id, 'climb') && g.skills.climb === have - 1, 'setup: a first CLIMBER grant costs one supply')
        const held = g.skills.climb
        ok(!sim.assign(g, L.id, 'climb') && g.skills.climb === held,
            're-granting CLIMBER to a lemming that already carries it still cost a supply — a clump can drain every climber and lose the level (#422)')
        // the digger guard: a walking lemming that already carries the digger
        // flag refuses a second DIG. (THE SPIRE ships no digs, so set the flag.)
        const g2 = mk()
        for (let t = 0; t < 80; t++) sim.step(g2)
        const D = g2.lemmings[0]
        g2.skills.dig = 3
        D.digger = true; D.state = 'walk'
        const dh = g2.skills.dig
        ok(!sim.assign(g2, D.id, 'dig') && g2.skills.dig === dh,
            'a walking digger still took a second DIG — the persistent-flag guard is missing (#422)')
    }
    // #3827 FLOATER: the parachute is a rule, not a decal. Three ways it can
    // die — immunity, slow descent, supply discipline — pinned separately,
    // because "the canopy draws" and "the canopy works" are different claims.
    {
        const g = mk()
        for (let t = 0; t < 60; t++) sim.step(g)
        const L = g.lemmings[0]
        L.state = 'fall'; L.fallDist = sim.CFG.maxFall + 1; L.vy = 8
        L.x = 4.5; L.y = 22.5; L.floater = true
        for (let t = 0; t < 60; t++) sim.step(g)
        ok(L.live && L.state === 'walk',
            '#3827: a floater died on a landing past maxFall — the parachute does not save (immunity is dead)')
        const drop = (floater) => {
            const gg = mk()
            for (let t = 0; t < 60; t++) sim.step(gg)
            const X = gg.lemmings[0]
            X.state = 'fall'; X.vy = 0; X.fallDist = 0; X.floater = floater
            X.x = 4.5; X.y = 8                       // ~16 tiles above the spire floor
            let n = 0
            while (X.live && X.state === 'fall' && n < 900) { sim.step(gg); n++ }
            return { n, alive: X.live, d: 16 }
        }
        const fl = drop(true), nl = drop(false)
        ok(!nl.alive, '#3827 setup: a bare lemming should splat from ~16 tiles — the height is not fatal at all')
        ok(fl.alive, '#3827: a floater splatted from ~16 tiles — floaters must survive any height')
        ok(fl.n > nl.n * 2,
            `#3827: parachute descent (${fl.n} ticks) is not meaningfully slower than free fall (${nl.n}) — floatSp is decoration`)
    }
    // float supply discipline: the #422 law applies to the fifth skill too
    {
        const g = mk()
        for (let t = 0; t < 80; t++) sim.step(g)
        const F = g.lemmings[0]
        const have = g.skills.float
        ok(sim.assign(g, F.id, 'float') && g.skills.float === have - 1,
            '#3827 setup: a first FLOATER grant did not cost exactly one supply')
        const held = g.skills.float
        ok(!sim.assign(g, F.id, 'float') && g.skills.float === held,
            '#3827: re-granting FLOATER to a lemming already under a canopy still cost a supply — the flag-for-life guard is missing (#422 law)')
    }
    // the fifth skill is reachable everywhere the game is playable
    for (let i = 0; i < LEVELS.length; i++) {
        ok((LEVELS[i].skills.float | 0) >= 1, `level ${i} (${LEVELS[i].name}) ships zero floaters — the fifth skill cannot be used where it is offered`)
    }
    // the count is the whole goal (issue #110): once `need` have escaped the
    // ledge is over, even with lemmings still pacing on screen. Before the fix
    // the criteria was met at ~31s but the level paced to the 120s clock.
    {
        const g = mk()
        for (let t = 0; t < 150; t++) sim.step(g)   // a few are up and walking; none out yet
        const live = g.lemmings.filter(l => l.live)
        ok(live.length > 0 && g.end === null, 'setup: need live lemmings and an open level to hold it back')
        g.exited = g.level.need                     // the criteria is met right now
        sim.step(g)
        ok(g.end === 'clear' && g.win === true,
            'criteria met (exited>=need) but the level kept running — it waits for stragglers or the clock instead of ending on the count')
    }
}

// --------------------------------------------------------------- water rules ---
// #3828: the original drowns anything that touches water, from any height;
// water is not ground, does not yield to dig or blast, and THE SPIRE's pond
// makes the stragglers' westward pacing cost lives. These pins hold all of it.
{
    section('WATER (#3828: the pond drowns, and never yields)')
    const { meta, grid } = buildLevel(0)
    ok(meta.name === 'THE SPIRE' && grid[23 * sim.W + 2] === sim.WATER && grid[24 * sim.W + 2] === sim.WATER,
        'THE SPIRE has no pond at its west foot — the #3828 stage never shipped')
    ok(!sim.solid({ grid }, 2, 23) && !sim.solid({ grid }, 2, 24),
        'the pond reads as solid ground — walkers would walk on top of the water')
    // walk-in: a walker that reaches the rim wades in and drowns at the surface
    // (spawnCount 1 — a lone walker, so spawn-clump traffic can't turn it back)
    {
        const g = sim.makeGame({ ...meta, spawnCount: 1 }, grid)
        for (let t = 0; t < 70; t++) sim.step(g)
        const L = g.lemmings[0]
        L.state = 'walk'; L.x = 5.5; L.y = 23; L.dir = -1
        let drown = 0
        for (let t = 0; t < 240; t++) { sim.step(g); drown += g.events.filter(e => e.type === 'drown').length }
        ok(!L.live && L.state === 'dead' && drown > 0,
            'a walker crossing into the pond survived — the drown rule is dead')
    }
    // any height: dropped far above the pond it drowns — water kills, it does
    // not cushion, and it never resolves as a splat
    {
        const g = sim.makeGame(meta, grid)
        for (let t = 0; t < 70; t++) sim.step(g)
        const L = g.lemmings[0]
        L.state = 'fall'; L.vy = 8; L.fallDist = 1; L.x = 1.5; L.y = 12
        let drown = 0, splat = 0
        for (let t = 0; t < 300; t++) {
            sim.step(g)
            drown += g.events.filter(e => e.type === 'drown').length
            splat += g.events.filter(e => e.type === 'splat').length
        }
        ok(drown > 0 && splat === 0,
            `a tall drop into water resolved as drown ${drown} / splat ${splat} — in water every fall drowns, whatever the height`)
    }
    // the pond bites the GAME, not just the rules: unmanaged, the spire crowd
    // bounces off the face and pays walking west — pacing the map is no longer free
    {
        const g = sim.makeGame(meta, grid)
        let drown = 0
        while (!g.end && g.tick < meta.time * 60) { sim.step(g); drown += g.events.filter(e => e.type === 'drown').length }
        ok(drown >= 1, 'the unmanaged SPIRE crowd pays nothing — the pond drains nobody, the tutorial has no teeth')
    }
    // dig refuses water: the digger stops at the surface and the water stays
    {
        const wg = new Uint8Array(sim.W * sim.H).fill(sim.AIR)
        for (let x = 0; x < sim.W; x++) { wg[23 * sim.W + x] = sim.DIRT; wg[24 * sim.W + x] = sim.STEEL }
        wg[22 * sim.W + 16] = sim.WATER
        const g = sim.makeGame({ ...meta, spawnCount: 1, spawnEvery: 1, skills: { ...meta.skills, dig: 1 } }, wg)
        for (let t = 0; t < 10; t++) sim.step(g)
        const L = g.lemmings[0]
        L.state = 'dig'; L.digger = true; L.x = 15.0; L.y = 23; L.dir = 1
        for (let t = 0; t < 120; t++) sim.step(g)
        ok(wg[22 * sim.W + 16] === sim.WATER, 'the digger chewed through water — only dirt yields (#3828)')
        ok(!L.live, 'a lemming that waded chest-deep into water survived — the chest-row drown check is dead')
    }
    // blast leaves the pond standing: the rim flies, the water stays
    {
        const g = sim.makeGame(meta, grid)
        for (let t = 0; t < 70; t++) sim.step(g)
        const L = g.lemmings[0]
        L.state = 'bomb'; L.fuseT = 0; L.x = 4.6; L.y = 23; L.dir = -1
        for (let t = 0; t < 130; t++) sim.step(g)      // fuse is 1.6 s
        ok(g.grid[23 * sim.W + 3] === sim.WATER && g.grid[24 * sim.W + 3] === sim.WATER,
            'a blast drained the pond — water must survive explosions the way steel does (#3828)')
    }
    // #3859: ponds EVERYWHERE. The original's level packs put open water on
    // nearly every board; one pond on one level left three boards drought-
    // dead. Every built level must carry visible open water, SPIRE carries
    // TWO bodies (west pond + exit-side bay), and the DOOR/LEDGE voids have
    // shores at the walking row (the punishing east walk ends in the drown).
    {
        let boards = 0
        for (let i = 0; i < LEVELS.length; i++) {
            const { grid: lg } = buildLevel(i)
            let w = 0
            for (let k = 0; k < lg.length; k++) if (lg[k] === sim.WATER) w++
            ok(w >= 4, `${LEVELS[i].name}: dry board — ${w} water cells, the #3859 shore never shipped`)
            boards += w > 0 ? 1 : 0
        }
        ok(boards === LEVELS.length, 'not every level carries water — "ponds everywhere" is back to one')
        ok(grid[23 * sim.W + 2] === sim.WATER && grid[23 * sim.W + 46] === sim.WATER,
            'THE SPIRE lost its second body of water — the exit-side bay (#3859) is gone')
        const { grid: dg } = buildLevel(2)
        const { grid: lg } = buildLevel(3)
        ok(dg[23 * sim.W + 35] === sim.WATER, 'THE DOOR void has no shore — bounced lemmings still splat unseen below the map (#3859)')
        ok(lg[23 * sim.W + 30] === sim.WATER, 'THE LEDGE void has no shore — the shuffler still dies in the dark (#3859)')
    }
    // #3859: a void drop into the shore resolves as the drown — splash, sink,
    // tone — never the silent splat below the map
    for (const [i, px] of [[2, 35], [3, 30]]) {
        const { meta: m, grid: gr } = buildLevel(i)
        const g = sim.makeGame({ ...m, spawnCount: 1, spawnEvery: 44 }, gr)
        for (let t = 0; t < 70; t++) sim.step(g)
        const L = g.lemmings[0]
        L.state = 'fall'; L.vy = 8; L.fallDist = 1; L.x = px; L.y = 10
        let drown = 0, splat = 0
        for (let t = 0; t < 300; t++) {
            sim.step(g)
            drown += g.events.filter(e => e.type === 'drown').length
            splat += g.events.filter(e => e.type === 'splat').length
        }
        ok(drown > 0 && splat === 0,
            `${m.name}: a void drop resolved as drown ${drown} / splat ${splat} — the shore must answer with the drown (#3859)`)
    }
    // #3859: and at ground level the shore bites like any pond rim — a
    // walker shuffling east into THE DOOR's shore drowns at the surface
    {
        const { meta: m, grid: gr } = buildLevel(2)
        const g = sim.makeGame({ ...m, spawnCount: 1, spawnEvery: 44 }, gr)
        for (let t = 0; t < 70; t++) sim.step(g)
        const L = g.lemmings[0]
        L.state = 'walk'; L.x = 29.5; L.y = 23; L.dir = 1
        let drown = 0
        for (let t = 0; t < 240; t++) { sim.step(g); drown += g.events.filter(e => e.type === 'drown').length }
        ok(!L.live && L.state === 'dead' && drown > 0,
            '#3859: a walker shuffling into THE DOOR shore survived — the shore is decorative')
    }
    // #3859 RULE: a pond rim is an edge. A lone walker marching at open water
    // with one blocker of supply must be held by the solver at the rim — the
    // stock original play at every pond. (Before this the solver's edge test
    // was AIR-only: it could not SEE a pond rim and would spend nothing while
    // the lemming walked into the deep.)
    {
        const wg = new Uint8Array(sim.W * sim.H).fill(sim.AIR)
        for (let x = 0; x < sim.W; x++) { wg[23 * sim.W + x] = sim.DIRT; wg[24 * sim.W + x] = sim.STEEL }
        for (let x = 8; x <= 10; x++) { wg[23 * sim.W + x] = sim.WATER; wg[24 * sim.W + x] = sim.WATER }
        const g = sim.makeGame({ ...meta, time: 14, spawnCount: 1, spawnEvery: 1,
            spawn: { x: 4.5, y: 23, dir: 1 }, exit: { x: 46, y: 22 }, skills: { block: 1, bomb: 0, climb: 0, dig: 0, float: 0 } }, wg)
        const r = sim.solve(g)
        ok(r.cmds.some(c => c.skill === 'block') && r.dead === 0,
            '#3859: the solver let a lone walker walk into open water it could have blocked — the pond-rim edge rule died')
    }
    // determinism survives the shores too: the attract replay is the game
    {
        const { meta: m, grid: gr } = buildLevel(2)
        const r = sim.solve(sim.makeGame(m, gr))
        const a = sim.stateHash(sim.replay(m, gr, r.cmds))
        const b = sim.stateHash(sim.replay(m, gr, r.cmds))
        ok(a === b, 'two replays over THE DOOR shore disagree — the shore is not deterministic (#3859)')
    }
    // determinism survives the new board: attract mode IS this replay
    {
        const r = sim.solve(sim.makeGame(meta, grid))
        const a = sim.stateHash(sim.replay(meta, grid, r.cmds))
        const b = sim.stateHash(sim.replay(meta, grid, r.cmds))
        ok(a === b, 'two replays over the pond disagree — the drown rule is not deterministic')
    }
    // the renderer consumes the water: tile, sound, sink and splash
    const wsrc = readFileSync(new URL('../src/games/Lemmings/index.jsx', import.meta.url), 'utf8')
    ok(/t === WATER/.test(wsrc), 'paint never draws the WATER tile — the pond is invisible to players (#3828)')
    ok(/e\.type === 'drown'/.test(wsrc), 'the drown event has no sound — the pond is silent (#3828)')
    ok(/=== WATER/.test(wsrc) && /sink/i.test(wsrc), 'drowned lemmings leave a corpse on the pond — the original sinks them (#3828)')
    ok(/splashes/.test(wsrc), 'no splash ring — nothing marks where the pond took a lemming (#3828)')
}

// --------------------------------------------------------- OH NO! (#3844) ----
// The original answers EVERY death with its signature two-syllable wail, and
// the cry lands on screen where the corpse fell. The load-bearing sim half:
// every death event carries the spot (splat, drown AND boom). The renderer
// half is pinned from source the way #3828 pins the pond: shared cry wired to
// the death events, one cry per batch, and the OH NO! bitmap sprite lives.
section('OH NO! (#3844: every death screams)')
{
    const { meta, grid } = buildLevel(0)
    // splat: the #3827 drop geometry — bare lemming, ~16 tiles, guaranteed corpse
    {
        const g = sim.makeGame({ ...meta, spawnCount: 1 }, grid)
        for (let t = 0; t < 60; t++) sim.step(g)
        const X = g.lemmings[0]
        X.state = 'fall'; X.vy = 0; X.fallDist = 0; X.x = 4.5; X.y = 8
        let ev = null, n = 0
        while (X.live && n++ < 900) { sim.step(g); ev = g.events.find(e => e.type === 'splat') || ev }
        ok(ev && Number.isFinite(ev.x) && Number.isFinite(ev.y),
            'the splat event carries no coordinates — the OH NO! sprite has nowhere to pop (#3844)')
    }
    // drown: walk into THE SPIRE's pond, collect the drown event
    {
        const g = sim.makeGame({ ...meta, spawnCount: 1 }, grid)
        for (let t = 0; t < 70; t++) sim.step(g)
        const L = g.lemmings[0]
        L.state = 'walk'; L.x = 5.5; L.y = 23; L.dir = -1
        let ev = null
        for (let t = 0; t < 240; t++) { sim.step(g); ev = g.events.find(e => e.type === 'drown') || ev }
        ok(ev && Number.isFinite(ev.x) && Number.isFinite(ev.y),
            'the drown event carries no coordinates (#3844)')
    }
    // boom: a lone bomber past its fuse — the cause the shell never even stung
    {
        const g = sim.makeGame({ ...meta, spawnCount: 1, skills: { ...meta.skills, bomb: 1 } }, grid)
        for (let t = 0; t < 60; t++) sim.step(g)
        sim.assign(g, 0, 'bomb')
        let ev = null
        for (let t = 0; t < 140; t++) { sim.step(g); ev = g.events.find(e => e.type === 'boom') || ev }
        ok(ev && Number.isFinite(ev.x) && Number.isFinite(ev.y),
            'the boom event carries no coordinates — bomb deaths still die silently at a spot (#3844)')
    }
    // the shell wires cry + sprite to all three causes, one cry per batch
    const osrc = readFileSync(new URL('../src/games/Lemmings/index.jsx', import.meta.url), 'utf8')
    ok(/e\.type === 'splat'/.test(osrc) && /e\.type === 'boom'/.test(osrc) && /deaths\+\+/.test(osrc),
        'death events reach no shared cry counter — causes are alone again (#3844)')
    ok(/if \(deaths\) ohCry\(\)/.test(osrc),
        'the cry fires per corpse, not per batch — a chain massacre should wail once (#3844)')
    ok(/OHNO_GLYPHS/.test(osrc) && /cries/.test(osrc),
        'the OH NO! sprite is gone — the wail is invisible (#3844)')
}

// ------------------------------------------------ first-run readability (#422) ---
// Items 3-5 of the first-play pass: the skill bar must be docked off the
// playfield, the HUD count must read as plain English, and the attract copy
// must fit without a wall of text (#365 rule 6: the copy lives in
// attract.js and cycles ONE message at a time through <AttractMessage>).
// The numbers live in layout.js (audited here); these pins additionally prove
// index.jsx actually consumes them.
const docked = () => LAYOUT.panelReserve >= 40
const linesFit = () => MESSAGES.length >= 2 && new Set(MESSAGES).size === MESSAGES.length && MESSAGES.every(l => l.length > 0 && l.length <= 44)
const hudPlain = () => `${LAYOUT.hud.pre}9${LAYOUT.hud.mid}0` === 'IN PLAY 9 · LOST 0'
const pressFits = () => PRESS.length <= 24 && /ANY KEY/i.test(PRESS)
{
    section('FIRST-RUN READABILITY (#422 items 3-5: docked bar, badges, attract copy)')
    ok(docked(), `the playfield reserves only ${LAYOUT.panelReserve}px at the bottom — the skill bar floats over the walking ground (#422 item 3)`)
    ok(linesFit(), `an attract message exceeds 44 chars or the slot has no cycle: ${JSON.stringify(MESSAGES)}`)
    ok(pressFits(), `press prompt "${PRESS}" too long or unclear (#365 rule 6)`)
    for (const l of MESSAGES) {
        ok(!/scripts\/|\.mjs|audit|autopilot|proven/i.test(l), `harness leak in attract copy: "${l}"`)
    }
    ok(hudPlain(), `cryptic HUD count "${LAYOUT.hud.pre}9${LAYOUT.hud.mid}0" — say IN PLAY n · LOST m (#422 item 5)`)
    const src = readFileSync(new URL('../src/games/Lemmings/index.jsx', import.meta.url), 'utf8')
    ok(/from '\.\/layout\.js'/.test(src), 'index.jsx does not import layout.js — the audited numbers are decoration')
    ok(/from '\.\/attract\.js'/.test(src), 'index.jsx does not import attract.js — the audited attract copy is decoration (#365)')
    ok(/<AttractMessage[^>]*messages=\{MESSAGES\}/.test(src), 'index.jsx stacks its own rules wall instead of the one cycling <AttractMessage> slot (#365 rule 6)')
    ok(/LAYOUT\.panelReserve/.test(src), 'the stage never docks: LAYOUT.panelReserve unused in index.jsx (#422 item 3)')
    ok(/LAYOUT\.hud\.pre/.test(src), 'the HUD prints its own count wording instead of LAYOUT.hud (#422 item 5)')
    ok(/nearestLemming\(gs, cursor\.x, cursor\.y\)/.test(src), 'no hover ring: paint must preview nearestLemming(gs, cursor.x, cursor.y) so the Space target is visible before the press (#422 item 4)')
    ok(/LAYOUT\.badge\.climber/.test(src) && /L\.climber &&/.test(src), 'climber badge missing — a lemming that crested a wall is indistinguishable from the crowd (#422 item 4)')
    ok(/LAYOUT\.badge\.digger/.test(src), 'digger badge missing — the tunnel tool must use the shared badge color (#422 item 4)')
}

// -------------------------------------------------------- visible result (#470) ---
// Jon mashed CLIMBER on the spawn clump: the count dropped but he could not see
// who gained the skill. First the sim question the issue demanded: a charge must
// NEVER drop without the target visibly gaining the skill (flag or state change),
// and a refused assign must never cost anything. Then the on-screen promise:
// every grant sets the flash the renderer rings with, and it decays by itself.
{
    section('VISIBLE RESULT (#470: charges never vanish silently)')
    const { meta, grid } = buildLevel(0)
    const g = sim.makeGame(meta, grid)
    for (let t = 0; t < 200; t++) sim.step(g)
    for (const L of g.lemmings.filter(l => l.live)) {
        for (const s of sim.SKILLS) {
            g.skills[s] = 9
            const b = { st: L.state, c: L.climber, d: L.digger, f: L.floater, u: L.builder }
            const before = g.skills[s]
            const granted = sim.assign(g, L.id, s)
            const spent = before - g.skills[s]
            const changed = L.state !== b.st || L.climber !== b.c || L.digger !== b.d || L.floater !== b.f || L.builder !== b.u
            // #3863: BUILDER's counter is the original's PLANK CARGO, not a
            // per-lemming charge — granting flags the carrier and spends
            // nothing; the cargo drops when wood is LAID (pinned in the
            // BUILDER section). The invariant survives in spirit: every grant
            // changes its target visibly, and nothing spends without a grant.
            const want = s === 'build' ? 0 : 1
            ok(!granted || (spent === want && changed),
                `#${470}: '${s}' on lemming #${L.id} spent ${spent} charge(s) and changed ${changed ? 'the' : 'nothing'} — a charge dropped without a visible skill`)
            ok(granted || spent === 0,
                `#${470}: a refused '${s}' on lemming #${L.id} still cost a supply`)
            ok(!granted || L.flashT > 0,
                `#${470}: '${s}' granted to lemming #${L.id} set no grant flash — the renderer has nothing to ring with`)
        }
    }
    const F = g.lemmings.find(l => l.live && l.flashT > 0)
    ok(!!F, 'no lemming carries a flash after grants — the flash never starts')
    if (F) {
        for (let t = 0; t < sim.CFG.flash + 5; t++) sim.step(g)
        ok(F.flashT === 0, '#470: the grant flash never decays — every lemming would ring forever')
    }
    const src = readFileSync(new URL('../src/games/Lemmings/index.jsx', import.meta.url), 'utf8')
    ok(/L\.flashT/.test(src) && /CFG\.flash/.test(src),
        '#470: the renderer never draws the grant flash — assign() has a flashT and paint ignores it')
    ok(/else\s+audioController\.playTone\(140/.test(src),
        '#470: a refused assign is silent on the click paths — the player cannot hear that nothing happened')
}

// ---------------------------------------------------------------- builder (#3863) ---
// BUILDER — the original's sixth skill. The sim questions the issue asked for:
// wood is laid at a one-tile descent (never over a pond, never into a hole the
// plank cannot reach), the cargo drains one plank per LAYING (not per assign),
// wood is ground for walkers but refuses the digger and the climber, blasts
// splinter it. Stage 1 (#3863) kept the solver out of the search space; stage 2
// (#3866) opened it at exactly the laying cells — the solver-side pins live at
// the end of this section. Synthetic boards keep each rule pinned in isolation.
section('BUILDER (#3863: placed planks — wood is ground, dirt-only rules hold)')
{
    const mk = (f) => {
        const g = new Uint8Array(sim.W * sim.H).fill(sim.AIR)
        for (let y = 0; y < sim.H; y++) for (let x = 0; x < sim.W; x++) { const t = f(x, y); if (t) g[y * sim.W + x] = t }
        return g
    }
    const bmeta = (over) => ({
        name: 'B', time: 60, spawnCount: 1, spawnEvery: 1, need: 99, exit: { x: 46, y: 0 },
        ...over, skills: { block: 0, bomb: 0, climb: 0, dig: 0, float: 0, build: 0, ...(over.skills || {}) },
    })
    const runFor = (g, n, stop) => { for (let t = 0; t < n && !(stop && g.lemmings.length && stop(g)); t++) sim.step(g) }
    const EV = (g, type) => g.events.some(e => e.type === type)

    // A: shelf one lower — the builder lays a plank at the edge and walks on it.
    {
        const grid = mk((x, y) => (x < 10 ? (y >= 10 && y <= 12 ? sim.DIRT : 0) : (y >= 11 && y <= 12 ? sim.DIRT : 0)))
        const g = sim.makeGame(bmeta({ spawn: { x: 3, y: 10, dir: 1 }, skills: { build: 3 } }), grid)
        runFor(g, 10)
        ok(sim.assign(g, 0, 'build'), '#3863: harness setup — the BUILDER grant failed on a walking lemming')
        let crossed = false
        runFor(g, 400, () => (crossed = g.grid[10 * sim.W + 10] === sim.PLANK && g.lemmings[0].live && g.lemmings[0].y === 10 && g.lemmings[0].x > 10.4))
        ok(g.grid[10 * sim.W + 10] === sim.PLANK, '#3863: no plank laid at a one-tile descent — the builder walked off the shelf')
        ok(g.skills.build === 2, `#3863: laying one plank spent ${3 - g.skills.build} from the cargo — one wood per laying`)
        ok(crossed, `#3863: the builder did not walk across its own plank (y=${g.lemmings[0].y} x=${g.lemmings[0].x.toFixed(2)})`)
        // a plain walker crosses pre-laid wood at foot level — planks are ground.
        const g2 = sim.makeGame(bmeta({ spawn: { x: 3, y: 10, dir: 1 } }), grid)   // no builder, plank pre-laid
        g2.grid[10 * sim.W + 10] = sim.PLANK
        let crossed2 = false
        runFor(g2, 400, () => (crossed2 = g2.lemmings[0].live && g2.lemmings[0].y === 10 && g2.lemmings[0].x > 10.4))
        ok(crossed2, '#3863: a plank is not ground — a walker fell through laid wood')
        // and one mounting from the shelf below steps UP onto the wood, then
        // rides the road over the drop — the crowd-climb half. Flat shelf at
        // foot 11; planks hover one above at row 10, cols 10 and 11.
        const mountGrid = mk((x, y) => (y >= 11 && y <= 12 ? sim.DIRT : 0))
        mountGrid[10 * sim.W + 10] = sim.PLANK
        mountGrid[10 * sim.W + 11] = sim.PLANK
        const g3 = sim.makeGame(bmeta({ spawn: { x: 7, y: 11, dir: 1 } }), mountGrid)
        let mounted = false
        runFor(g3, 400, () => (mounted = g3.lemmings[0].live && g3.lemmings[0].y === 10 && g3.lemmings[0].x > 11))
        ok(mounted, '#3863: a walker on the shelf could not step up onto plank level and ride the road — planks are not steps')
    }

    // B: the descent is a pond — wood needs a shelf below; drown instead, no plank.
    {
        const grid = mk((x, y) => (x < 10 ? (y >= 10 && y <= 12 ? sim.DIRT : 0) : (y === 11 ? sim.WATER : (y === 12 ? sim.DIRT : 0))))
        const g = sim.makeGame(bmeta({ spawn: { x: 3, y: 10, dir: 1 }, skills: { build: 3 } }), grid)
        runFor(g, 10)
        sim.assign(g, 0, 'build')
        runFor(g, 400, () => g.dead >= 1)
        ok(g.grid[10 * sim.W + 10] === sim.AIR && g.drowned === 1 && g.skills.build === 3,
            '#3863: a plank was laid (or held) over open water — ponds drown builders too')
    }

    // B2: hole two tiles deep — #3908 rewrote this pin (was: "out of the
    // plank's reach; the drop is taken"). The SLOPED SPAN now bridges it at
    // the LOWER level: wood lands one row down on the deeper shelf, the
    // builder steps onto its own board and the drop becomes a walked stair.
    // A carpet still costs one wood per laying, so the descent drains cargo —
    // that economy is #3863's and still holds; what changed is that the crowd
    // now crosses above the hole floor instead of dropping into it.
    {
        const grid = mk((x, y) => (x < 10 ? (y >= 10 && y <= 13 ? sim.DIRT : 0) : (y >= 12 && y <= 13 ? sim.DIRT : 0)))
        const g = sim.makeGame(bmeta({ spawn: { x: 3, y: 10, dir: 1 }, skills: { build: 3 } }), grid)
        runFor(g, 10)
        sim.assign(g, 0, 'build')
        runFor(g, 400)
        const L = g.lemmings[0]
        ok(g.grid[11 * sim.W + 10] === sim.PLANK && g.skills.build === 0 && L.live && L.y === 12,
            `#3908: the two-tile descent was not spanned (${L.state} y=${L.y} cargo=${g.skills.build}) — wood must reach the lower shelf and carry the walker`)
    }

    // C: staircase — the road follows the steps down, and 12 wood is 12 planks.
    {
        const grid = mk((x, y) => {
            const surf = x < 5 ? 10 : x < 10 ? 11 : x < 15 ? 12 : 13
            return y >= surf && y <= 14 ? sim.DIRT : 0
        })
        const g = sim.makeGame(bmeta({ spawn: { x: 2, y: 10, dir: 1 }, skills: { build: 12 } }), grid)
        runFor(g, 10)
        sim.assign(g, 0, 'build')
        runFor(g, 2000)
        let planks = 0
        const rows = new Set()
        for (let y = 0; y < sim.H; y++) for (let x = 0; x < sim.W; x++) if (g.grid[y * sim.W + x] === sim.PLANK) { planks++; rows.add(y) }
        ok(planks === 12 && g.skills.build === 0, `#3863: cargo miscount on the staircase — ${planks} planks laid, cargo ${g.skills.build}`)
        ok(rows.size >= 2, `#3863: the plank road ignored the staircase (single row ${[...rows]}) — wood must track each step down`)
    }

    // D: an exhausted cargo lays nothing more.
    {
        const grid = mk((x, y) => (x < 6 ? (y >= 10 && y <= 12 ? sim.DIRT : 0) : (y >= 11 && y <= 12 ? sim.DIRT : 0)))
        const g = sim.makeGame(bmeta({ spawn: { x: 2, y: 10, dir: 1 }, skills: { build: 2 } }), grid)
        runFor(g, 10)
        sim.assign(g, 0, 'build')
        runFor(g, 600)
        ok(g.grid[10 * sim.W + 6] === sim.PLANK && g.grid[10 * sim.W + 7] === sim.PLANK && g.grid[10 * sim.W + 8] === sim.AIR && g.skills.build === 0,
            '#3863: an empty cargo still laid wood, or the first two edges were missed')
    }

    // E: supply law (#422 shape): empty refuses free, re-grant refuses, line/bomb jobs refuse.
    {
        const grid = mk((x, y) => (y >= 10 && y <= 12 ? sim.DIRT : 0))
        const g0 = sim.makeGame(bmeta({ spawn: { x: 3, y: 10, dir: 1 }, skills: { build: 0 } }), grid)
        runFor(g0, 30)
        ok(!sim.assign(g0, 0, 'build') && g0.skills.build === 0, '#3863: an empty plank cargo handed out the BUILDER flag')
        const g = sim.makeGame(bmeta({ spawn: { x: 3, y: 10, dir: 1 }, skills: { build: 3 } }), grid)
        runFor(g, 30)
        ok(sim.assign(g, 0, 'build') && g.skills.build === 3 && g.lemmings[0].builder,
            '#3863: the BUILDER grant did not flag the carrier without touching the cargo (or vice versa)')
        const held = g.skills.build
        ok(!sim.assign(g, 0, 'build') && g.skills.build === held, '#3863 (#422): a second BUILDER grant on the carrier burned cargo')
        g.lemmings[0].state = 'block'
        ok(!sim.assign(g, 0, 'build'), '#3863: the blocker job accepted a plank flag')
        g.lemmings[0].state = 'bomb'
        ok(!sim.assign(g, 0, 'build'), '#3863: a lit bomber was handed the BUILDER flag')
    }

    // F: wood is not dirt — the digger stops at plank chest-height, the climber
    // refuses a plank handhold, and a blast splinters the wood.
    {
        // Wood in the tunnel line blocks: the plank face is read at mount
        // height (the row the chest chews), so the digger climbs the wood or
        // bounces off it — and the plank is never chewed away.
        const grid = mk((x, y) => (y >= 10 && y <= 12 ? sim.DIRT : 0))
        const g = sim.makeGame(bmeta({ spawn: { x: 3, y: 10, dir: 1 }, skills: { dig: 1 } }), grid)
        g.grid[9 * sim.W + 16] = sim.PLANK          // wood across the tunnel line
        runFor(g, 10)
        sim.assign(g, 0, 'dig')
        let blocked = false
        runFor(g, 500, () => {
            const L = g.lemmings[0]
            blocked = L.live && (L.dir === -1 || L.y === 9) && L.x > 14
            return blocked
        })
        ok(blocked && g.grid[9 * sim.W + 16] === sim.PLANK, '#3863: wood in the tunnel line did not block the digger, or the plank was chewed through — wood is not dirt')
        const gw = mk((x, y) => (y >= 10 && y <= 12 ? sim.DIRT : (x === 10 && y >= 8 && y <= 9 ? sim.DIRT : 0)))
        const g2 = sim.makeGame(bmeta({ spawn: { x: 3, y: 10, dir: 1 } }), gw)
        g2.grid[9 * sim.W + 10] = sim.PLANK; g2.grid[8 * sim.W + 10] = sim.PLANK
        runFor(g2, 10)
        sim.assign(g2, 0, 'climb')
        let turned = false
        runFor(g2, 400, () => (turned = g2.lemmings[0].dir === -1 && g2.lemmings[0].state === 'walk'))
        ok(turned && g2.grid[9 * sim.W + 10] === sim.PLANK, '#3863: a climber scaled a plank wall — wood refuses handholds')
        const gb = mk((x, y) => (y >= 10 && y <= 12 ? sim.DIRT : 0))
        const g3 = sim.makeGame(bmeta({ spawn: { x: 3, y: 10, dir: 1 }, skills: { bomb: 1 } }), gb)
        // the bomber keeps walking while the fuse burns — the far plank is
        // parked outside the blast circle at fuse-out (~x 8.5), the near one under it.
        g3.grid[10 * sim.W + 8] = sim.PLANK; g3.grid[10 * sim.W + 11] = sim.PLANK
        for (let t = 0; t < 55; t++) sim.step(g3)
        sim.assign(g3, 0, 'bomb')
        for (let t = 0; t < 140; t++) sim.step(g3)
        ok(g3.grid[10 * sim.W + 8] === sim.AIR && g3.grid[10 * sim.W + 11] === sim.PLANK,
            '#3863: the blast spared wood inside its radius or destroyed wood outside it')
    }

    // G: determinism rides planks — the same script twice lays the same road.
    {
        const grid = mk((x, y) => (x < 10 ? (y >= 10 && y <= 12 ? sim.DIRT : 0) : (y >= 11 && y <= 12 ? sim.DIRT : 0)))
        const meta = bmeta({ spawn: { x: 3, y: 10, dir: 1 }, skills: { build: 3 } })
        const cmds = [{ tick: 40, id: 0, skill: 'build' }]
        const a = sim.replay(meta, grid, cmds, { maxTicks: 400 })
        const b = sim.replay(meta, grid, cmds, { maxTicks: 400 })
        ok(sim.stateHash(a) === sim.stateHash(b) && a.grid[10 * sim.W + 10] === sim.PLANK,
            '#3863: a build script replays to different worlds — planks broke determinism')
        const c = sim.replay(meta, grid, [], { maxTicks: 400 })
        ok(sim.stateHash(c) !== sim.stateHash(a), '#3863: stateHash ignores laid planks — the audit could not see a plank desync')
    }

    // H: #3866 stage 2 — the solver DOES build. Stage 1 kept planks out of
    // the search space so every proof rode unchanged; stage 2 opened it at the
    // exact cells walker() lays wood. Pins, sharper than the proves loop: the
    // autopilot spends cargo on THE MASSIF's trench AND the road exists in the
    // replayed world (the attract demo shows the swarm's own bridge, plank by
    // plank); determinism rides the build scripts (two replays identical, one
    // late build command visible); and the pond law holds INSIDE the search
    // space — water at foot level is not a laying site (no shelf), so the
    // solver can never spend wood over open water; the whole shelf still
    // ships the original's 12-plank cargo.
    {
        const r = runSolver(1)
        ok(r.cmds.some(c => c.skill === 'build'),
            '#3866: THE MASSIF script spends no planks — the solver-side gap is open again (the trench is the proves board, the road is the proof)')
        const a = sim.replay(r.meta, r.grid, r.cmds)
        const b = sim.replay(r.meta, r.grid, r.cmds)
        ok(sim.stateHash(a) === sim.stateHash(b), '#3866: the build script replays to two different worlds — planks in the solver broke determinism')
        ok(a.win && a.exited >= r.meta.need, `#3866: replaying the build script delivers ${a.exited}/${r.meta.need} — the recorded road does not carry the quota`)
        let road = 0
        for (let x = 37; x <= 40; x++) if (a.grid[23 * sim.W + x] === sim.PLANK) road++
        ok(road === 4, `#3866: the solver's trench road is ${road}/4 planks — attract would show a half bridge or none`)
        // A late BUILD is self-correcting (laying is position-triggered, the
        // wood lands in the same cells), so the tamper probe must ride the
        // position-sensitive command — same reasoning as the L3 pin above:
        // a BLOCK's stop point is a continuous coordinate.
        const tampered = r.cmds.map((c, i) => (c.skill === 'block' && i === r.cmds.findIndex(cc => cc.skill === 'block') ? { ...c, tick: c.tick + 1 } : c))
        const c2 = sim.replay(r.meta, r.grid, tampered)
        ok(sim.stateHash(c2) !== sim.stateHash(a), '#3866: stateHash ignored a one-tick-late block over the trench board — a desync would pass the audit')
        // the pond law survives inside the search space — pinned at the offer,
        // not just the commit (a proposal the sim would refuse can still be
        // caught here even when rollout timing would never commit it): a
        // walker standing at an open shore gets the blocker idea, never the
        // wood idea; at a 2-tile hole (no shelf within the plank's reach) it
        // gets neither. Positive controls keep both probes able to fail.
        const offerAt = (gm, x0, x1) => {
            for (let t = 0; t < 600; t++) {
                const L = gm.lemmings[0]
                if (L && L.live && L.state === 'walk' && L.x >= x0 && L.x <= x1) return sim.candidates(gm)
                if (L && !L.live) return 'drowned'
                sim.step(gm)
            }
            return 'timeout'
        }
        const wg = new Uint8Array(sim.W * sim.H).fill(sim.AIR)
        for (let x = 0; x < sim.W; x++) { wg[23 * sim.W + x] = sim.DIRT; wg[24 * sim.W + x] = sim.STEEL }
        for (let x = 8; x <= 10; x++) { wg[23 * sim.W + x] = sim.WATER; wg[24 * sim.W + x] = sim.WATER }
        const gp = sim.makeGame(bmeta({ time: 14, spawnCount: 1, spawnEvery: 1,
            spawn: { x: 4.5, y: 23, dir: 1 }, exit: { x: 46, y: 22 }, skills: { block: 1, build: 12 } }), wg)
        const rp = sim.solve(gp)
        ok(rp.cmds.every(c => c.skill !== 'build'), '#3866: the solver laid wood over open water — plank reach must demand a shelf, ponds drown builders too')
        const gp2 = sim.makeGame(bmeta({ time: 14, spawnCount: 1, spawnEvery: 1,
            spawn: { x: 4.5, y: 23, dir: 1 }, exit: { x: 46, y: 22 }, skills: { block: 1, build: 12 } }), wg)
        sim.step(gp2); const pondC = offerAt(gp2, 7.36, 7.52)
        ok(Array.isArray(pondC) && pondC.some(c => c.skill === 'block') && pondC.every(c => c.skill !== 'build'),
            `#3866: the pond-rim offer is broken — got ${JSON.stringify(pondC)} (want block offered, never build over water)`)
        const hg = new Uint8Array(sim.W * sim.H).fill(sim.AIR)
        for (let x = 0; x < sim.W; x++) { hg[23 * sim.W + x] = sim.DIRT; hg[25 * sim.W + x] = sim.STEEL }
        for (let x = 8; x <= 10; x++) hg[23 * sim.W + x] = sim.AIR
        const gh = sim.makeGame(bmeta({ time: 14, spawnCount: 1, spawnEvery: 1,
            spawn: { x: 4.5, y: 23, dir: 1 }, exit: { x: 46, y: 22 }, skills: { block: 1, build: 12 } }), hg)
        sim.step(gh); const holeC = offerAt(gh, 7.36, 7.52)
        // #3908 rewrote this pin (was: "a 2-tile hole has no shelf; wood must
        // not be even considered there"). The span reaches the LOWER shelf: at
        // a two-row hole with solid under the lower row, the bridge becomes a
        // real proposal — the block idea rides with it, and the offer still
        // must not invent wood over a three-row void (hg3 below: reach stops
        // where the original's planks stop — at ground).
        ok(Array.isArray(holeC) && holeC.some(c => c.skill === 'block') && holeC.some(c => c.skill === 'build'),
            `#3908: the two-row hole offer is broken — got ${JSON.stringify(holeC)} (want block AND build: the span reaches the lower shelf)`)
        const hg3 = new Uint8Array(sim.W * sim.H).fill(sim.AIR)
        for (let x = 0; x < sim.W; x++) { hg3[23 * sim.W + x] = sim.DIRT; hg3[26 * sim.W + x] = sim.STEEL }
        for (let x = 8; x <= 10; x++) hg3[23 * sim.W + x] = sim.AIR
        const gh3 = sim.makeGame(bmeta({ time: 14, spawnCount: 1, spawnEvery: 1,
            spawn: { x: 4.5, y: 23, dir: 1 }, exit: { x: 46, y: 22 }, skills: { block: 1, build: 12 } }), hg3)
        sim.step(gh3); const voidC = offerAt(gh3, 7.36, 7.52)
        ok(Array.isArray(voidC) && voidC.some(c => c.skill === 'block') && voidC.every(c => c.skill !== 'build'),
            `#3908: wood was offered into a three-row void — got ${JSON.stringify(voidC)} (the span stops at two; planks need ground)`)
    }
    {
        for (let i = 0; i < LEVELS.length; i++) {
            ok((LEVELS[i].skills.build | 0) >= 12, `#3863: level ${i} (${LEVELS[i].name}) ships less than the original's 12-plank cargo`)
        }
    }
}

// ---------------------------------------------------------------- slope road ---
// #3908 — the stair is walked, not fallen. Step-down mirrors the one-tile
// mount: a floor-end whose shelf sits one row below is descended at walking
// pace, no fall state, no fallDist. The span lays wood on the LOWER shelf of
// a two-row drop, so the road follows the stair at the angle the LOOK
// (#3879/#3904) already draws. Reach stops where the original's planks stop:
// three rows is void — and void still falls, and still kills past maxFall.
section('SLOPE ROAD (#3908: step-down mirrors mount, planks span the stair)')
{
    const mk = (f) => {
        const g = new Uint8Array(sim.W * sim.H).fill(sim.AIR)
        for (let y = 0; y < sim.H; y++) for (let x = 0; x < sim.W; x++) { const t = f(x, y); if (t) g[y * sim.W + x] = t }
        return g
    }
    const sm = (over) => ({
        name: 'S', time: 60, spawnCount: 1, spawnEvery: 1, need: 99, exit: { x: 46, y: 0 },
        ...over, skills: { block: 0, bomb: 0, climb: 0, dig: 0, float: 0, build: 0, ...(over.skills || {}) },
    })
    const runFor = (g, n, stop) => { for (let t = 0; t < n && !(stop && g.lemmings.length && stop(g)); t++) sim.step(g) }

    // 1: three steps down, one plain walker — it never leaves the ground.
    // Three stepdown events, zero fall, zero fallDist: the original's descent,
    // where only DROPS are falls and stairs are ground at an angle.
    {
        const grid = mk((x, y) => { const s = x < 5 ? 10 : x < 10 ? 11 : x < 15 ? 12 : 13; return y >= s && y <= 16 ? sim.DIRT : 0 })
        const g = sim.makeGame(sm({ spawn: { x: 3, y: 10, dir: 1 } }), grid)
        let steps = 0, fell = false, maxFd = 0
        for (let t = 0; t < 700; t++) {
            sim.step(g)
            const L = g.lemmings[0]
            if (!L) continue
            if (L.state === 'fall') fell = true
            maxFd = Math.max(maxFd, L.fallDist)
            if (g.events.some(e => e.type === 'stepdown' && e.id === 0)) steps++
            if (L.x > 15.4) break
        }
        const L = g.lemmings[0]
        ok(!fell && maxFd < 0.01 && steps === 3 && L.live && L.y === 13 && L.x > 15.4,
            `#3908: the staircase was not walked (fell=${fell} fallDist=${maxFd} stepdowns=${steps} y=${L.y} x=${L.x.toFixed(1)}) — descents must step, not fall (the <0.01 allowance is the spawn tick's gravity blip)`)
    }

    // 2: a leaned road carries the crowd — boards pre-laid one row lower at
    // each reach (the span's own output) read as a continuous slope: the
    // walker rides them without ever falling, foot by foot, to the floor.
    {
        const grid = mk((x, y) => (x < 10 ? (y >= 10 && y <= 16 ? sim.DIRT : 0) : x >= 12 ? (y >= 13 && y <= 16 ? sim.DIRT : 0) : 0))
        grid[11 * sim.W + 10] = sim.PLANK
        grid[12 * sim.W + 11] = sim.PLANK
        const g = sim.makeGame(sm({ spawn: { x: 3, y: 10, dir: 1 } }), grid)
        let steps = 0, fell = false
        for (let t = 0; t < 700; t++) {
            sim.step(g)
            const L = g.lemmings[0]
            if (!L) continue
            if (L.state === 'fall') fell = true
            if (g.events.some(e => e.type === 'stepdown' && e.id === 0)) steps++
            if (L.x > 12.4) break
        }
        const L = g.lemmings[0]
        ok(!fell && steps === 3 && L.live && L.y === 13 && L.x > 12.4,
            `#3908: the leaned boards did not carry the walker over the drop (fell=${fell} stepdowns=${steps} y=${L.y} x=${L.x.toFixed(1)}) — a spanned road must be walkable`)
    }

    // 3: fall honesty — the step is a LEG rule for one-row descents only.
    // Two rows with no shelf within a step still FALL (survivable), and the
    // four-row drop still kills past maxFall: #3849 rides past the new rule.
    {
        const grid2 = mk((x, y) => (x < 10 ? (y >= 10 && y <= 13 ? sim.DIRT : 0) : (y >= 12 && y <= 13 ? sim.DIRT : 0)))
        const g = sim.makeGame(sm({ spawn: { x: 3, y: 10, dir: 1 } }), grid2)   // no builder, no wood
        let fell = false
        for (let t = 0; t < 500; t++) {
            sim.step(g)
            const L = g.lemmings[0]
            if (L.state === 'fall') fell = true
        }
        ok(fell && g.lemmings[0].live && g.lemmings[0].state === 'walk' && g.lemmings[0].y === 12,
            `#3908: a two-row drop without wood stopped being a fall (fell=${fell} ${g.lemmings[0].state} y=${g.lemmings[0].y}) — legs may not span what only planks could`)
        const grid4 = mk((x, y) => (x < 10 ? (y >= 10 && y <= 13 ? sim.DIRT : 0) : y === 14 ? sim.DIRT : 0))
        const g4 = sim.makeGame(sm({ spawn: { x: 3, y: 10, dir: 1 } }), grid4)
        runFor(g4, 500, () => !g4.lemmings[0].live)
        ok(g4.dead === 1, `#3908: the four-row drop stopped killing (dead=${g4.dead}) — maxFall must ride past the step rule`)
    }

    // 4: the span still refuses water — deeper pond, two rows of it. Wood
    // needs ground at its landing row, and a lake bed is not ground.
    {
        const grid = mk((x, y) => (x < 10 ? (y >= 10 && y <= 13 ? sim.DIRT : 0) : y >= 13 ? sim.DIRT : y >= 11 ? sim.WATER : 0))
        const g = sim.makeGame(sm({ spawn: { x: 3, y: 10, dir: 1 }, skills: { build: 3 } }), grid)
        runFor(g, 10)
        sim.assign(g, 0, 'build')
        runFor(g, 400, () => g.dead >= 1)
        ok(g.skills.build === 3 && g.drowned === 1 && g.grid[11 * sim.W + 10] === sim.WATER,
            `#3908: wood reached into a deep pond (cargo=${g.skills.build}) — water is not ground at either reach`)
    }

    // 5: determinism rides the sloped road — the span script replays to one
    // world, and a world without it hashes differently (the audit can SEE
    // the road; a desync in step-down or span cannot hide).
    {
        const grid = mk((x, y) => (x < 10 ? (y >= 10 && y <= 13 ? sim.DIRT : 0) : (y >= 12 && y <= 13 ? sim.DIRT : 0)))
        const meta = sm({ spawn: { x: 3, y: 10, dir: 1 }, skills: { build: 12 } })
        const cmds = [{ tick: 40, id: 0, skill: 'build' }]
        const a = sim.replay(meta, grid, cmds, { maxTicks: 400 })
        const b = sim.replay(meta, grid, cmds, { maxTicks: 400 })
        const c = sim.replay(meta, grid, [], { maxTicks: 400 })
        ok(sim.stateHash(a) === sim.stateHash(b) && sim.stateHash(a) !== sim.stateHash(c) && a.grid[11 * sim.W + 10] === sim.PLANK,
            '#3908: the sloped road replayed unstable or hash-blind — step-down/span desyncs must be visible to the audit')
    }
}

// ------------------------------------------------------------------ mutations ---
if (MUT) {
    section('MUTATIONS — each one MUST turn an honest check red')
    const tryMut = (name, apply, probe) => {
        const base = probe()
        ok(base, `mutation harness broken: baseline for '${name}' is already false`)
        const save = { ...sim.CFG }
        apply(sim.CFG)
        const verdict = probe()
        Object.assign(sim.CFG, save)
        console.log(`  mut ${name}: ${verdict ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(!verdict, `${name} SURVIVED — a check stopped touching this rule`)
    }
    tryMut('climbSp = 0 (no handhold)', c => { c.climbSp = 0 }, () => runSolver(0).win)
    tryMut('maxFall = 0 (every hop splats)', c => { c.maxFall = 0 }, () => runSolver(0).win)
    tryMut('maxFall = 7 (drift back to the pre-#3849 laxity)', c => { c.maxFall = 7 }, () => {
        const { meta, grid } = buildLevel(0)
        const g = sim.makeGame(meta, grid)
        for (let t = 0; t < 60; t++) sim.step(g)
        const X = g.lemmings[0]
        X.state = 'fall'; X.fallDist = 4; X.vy = 8; X.x = 4.5; X.y = 22.5
        for (let t = 0; t < 60; t++) sim.step(g)
        return X.state === 'dead'   // 4 tiles must kill; at 7 it splats-free → probe false → caught
    })
    tryMut('blast = 0.6 (door never opens)', c => { c.blast = 0.6 }, () => runSolver(2).win)
    tryMut('digSp = 0 (massif stays shut)', c => { c.digSp = 0 }, () => runSolver(1).win)
    tryMut('floatSp = fallSp (parachute is paper)', c => { c.floatSp = c.fallSp }, () => {
        const { meta, grid } = buildLevel(0)
        const g = sim.makeGame(meta, grid)
        for (let t = 0; t < 60; t++) sim.step(g)
        const X = g.lemmings[0]
        X.state = 'fall'; X.vy = 0; X.fallDist = 0; X.floater = true; X.x = 4.5; X.y = 8
        let n = 0
        while (X.live && X.state === 'fall' && n < 900) { sim.step(g); n++ }
        return X.live && n > 120      // alive AND slow — either half failing is the mutation caught
    })
    tryMut('flash = 0 (grants go back to invisible)', c => { c.flash = 0 }, () => {
        const { meta, grid } = buildLevel(0)
        const g = sim.makeGame(meta, grid)
        for (let t = 0; t < 120; t++) sim.step(g)
        return sim.assign(g, 0, 'climb') && g.lemmings[0].flashT > 0
    })
    const tryMutL = (name, apply, probe) => {
        const pr = LAYOUT.panelReserve
        const lines = [...MESSAGES]
        const hud = { ...LAYOUT.hud }
        ok(probe(), `mutation harness broken: baseline for '${name}' is already false`)
        apply()
        const verdict = probe()
        LAYOUT.panelReserve = pr
        MESSAGES.length = 0; MESSAGES.push(...lines)
        Object.assign(LAYOUT.hud, hud)
        console.log(`  mut ${name}: ${verdict ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(!verdict, `${name} SURVIVED — a check stopped touching this rule`)
    }
    tryMutL('panelReserve = 0 (bar back over the ground)', () => { LAYOUT.panelReserve = 0 }, docked)
    tryMutL('a 60-char attract message (wraps the pane again)', () => { MESSAGES.push('hold, release, tap, arrows, space and everything else a wall of text says') }, linesFit)
    tryMutL('a harness leak back into visible attract copy', () => { MESSAGES.push('this demo replays a proven solution on screen') }, () => MESSAGES.every(l => !/scripts\/|\.mjs|audit|autopilot|proven/i.test(l)))
    tryMutL('HUD back to the cryptic 9+0', () => { LAYOUT.hud.pre = ''; LAYOUT.hud.mid = '+' }, hudPlain)
}

section('ATTRACT PARACHUTE (#3853: the demo shows all five skills)')
{
    // The picker is pure — pin it against fabricated boards, then drive every
    // level's demo the way the shell does (#3892: through certifyDemoFloat —
    // grants scheduled at plan time and certified against the replay world) and
    // demand: win, a canopy every cycle, never more than the level's own
    // supply, the demo world's outcome equal the proven script's, and at least
    // one canopy that actually OPENS — an airborne grant whose carrier lands
    // soft is the parachute deploying on screen.
    const fakeL = (id, over = {}) => ({ id, live: true, floater: false, state: 'walk', fallDist: 0, x: 5, y: 10, dir: 1, ...over })
    const dryBoard = (lemmings, tick = 0) => ({ tick, lemmings, grid: new Uint8Array(sim.W * sim.H).fill(sim.DIRT) })

    ok(demoFloatPick(dryBoard([fakeL(0)], 299), []) === null, '#3853 grace broken: walker got a canopy before the crowd has been walking')
    ok(demoFloatPick(dryBoard([fakeL(0)], 300), []) === 0, '#3853 grace fallback dead: an idle crowd never shows the parachute')
    ok(demoFloatPick(dryBoard([fakeL(0), fakeL(1, { state: 'fall' })]), []) === 1, '#3853 faller priority lost: canopy waits for grace while a lemming is airborne')
    ok(demoFloatPick(dryBoard([fakeL(0), fakeL(1, { state: 'fall' })]), [{ tick: 5, id: 1, skill: 'bomb' }]) === null, '#3853 target exclusion gone: the demo would re-time a scripted faller')
    ok(demoFloatPick(dryBoard([fakeL(0)], 300), [{ tick: 5, id: 0, skill: 'dig' }]) === null, '#3853 target exclusion gone (walker too): demo spends its canopy on a scripted line')
    ok(demoFloatPick(dryBoard([fakeL(0, { floater: true })], 300), []) === null, '#3853 double-grant guard gone: demo burns supply on a lemming that already carries')
    {
        const gb = dryBoard([fakeL(0, { state: 'fall' }), fakeL(1)], 300)
        gb.grid[11 * sim.W + 5] = sim.WATER          // pond directly under the faller
        ok(demoFloatPick(gb, []) === 1, '#3853 water skip gone: the demo parachutes a lemming straight into the pond')
    }

    let demoCanopies = 0, demoAir = 0, demoOpened = 0
    for (let i = 0; i < LEVELS.length; i++) {
        const { meta, grid } = buildLevel(i)
        const plan = sim.solve(sim.makeGame(meta, grid)).cmds
        const fl = certifyDemoFloat(meta, grid, plan, { maxGrants: 2 })
        ok(fl.length >= 1, `#3853 ${meta.name}: no certified float grant — attract cycle shows no parachute — the five-skills gap is back`)
        ok(fl.length <= meta.skills.float, `#3853 ${meta.name}: demo spent more float than the level carries`)
        ok(fl.every(f => f.tick > 0 && f.tick < meta.time * 60), `#3853 ${meta.name}: grant scheduled outside the level clock`)
        ok(fl.every(f => f.air || !plan.some(c => c.id === f.id)), '#3892 a walker grant got scripted — the picker exclusion is gone (air grants may be scripted bodies, but only under the certifier)')
        let g = sim.makeGame(meta, grid)
        let grants = 0, air = 0, opened = 0, tick = 0
        while (!g.end && tick < meta.time * 60 + 60) {
            const c = plan.find(cc => cc.tick === g.tick)   // #3892 solve-phase
            if (c) sim.assign(g, c.id, c.skill)
            while (grants < fl.length && g.tick === fl[grants].tick) {
                if (sim.assign(g, fl[grants].id, 'float')) air |= fl[grants].air ? 1 : 0
                grants++
            }
            sim.step(g)
            tick++
            for (const e of g.events) if (e.type === 'landsoft') opened++
        }
        demoCanopies += grants
        demoAir |= air
        demoOpened += opened
        ok(g.win === true, `#3853 ${meta.name}: the demo float broke the solver's win`)
        ok(grants === fl.length, `#3853 ${meta.name}: certified grant fell on deaf ears — applied ${grants} of ${fl.length}`)
        const base = sim.replay(meta, grid, plan)
        ok(g.exited === base.exited && g.dead === base.dead,
            `#3892 ${meta.name}: demo with its certified floats ended ${g.exited}/${g.dead}, the proof said ${base.exited}/${base.dead} — a grant shifted the world off its certificate`)
    }
    ok(demoCanopies >= LEVELS.length, '#3853 fewer canopies than cycles — some level attracts without a parachute')
    ok(demoAir === 1 && demoOpened > 0, '#3853 no level demo opens a canopy in the air — the parachute never deploys on screen')
}

section('PHANTOM HYGIENE (#3876: the autopilot never flashes a skill it never uses)')
{
    // A BUILDER commit in a solver script is real only if that lemming lays
    // wood IN THE REPLAY WORLD — the truth attract mode shows the player.
    // THE DOOR's id2 (drowned before its descent) and THE LEDGE's id6 (exited
    // the door past intact floor) were the two shipped phantoms; the fix is
    // sim.stripPhantomBuilds, and this pin is that the board never regrows one.
    for (let i = 0; i < LEVELS.length; i++) {
        const { meta, grid } = buildLevel(i)
        const plan = sim.solve(sim.makeGame(meta, grid)).cmds
        const laid = new Set()
        sim.replay(meta, grid, plan, { onTick: (g) => { for (const e of g.events) if (e.type === 'plank') laid.add(e.id) } })
        const phantom = plan.filter(c => c.skill === 'build' && !laid.has(c.id))
        ok(phantom.length === 0,
            `${meta.name}: solver script carries ${phantom.length} BUILDER commit(s) that never lay wood — the autopilot is flashing a skill it does not use (#3876 regression)`)
    }
    // The roads stay: SPIRE's east-face bridge and MASSIF's trench crossing are
    // real work — hygiene must pass productive scripts through untouched.
    for (const i of [0, 1]) {
        const { meta, grid } = buildLevel(i)
        const plan = sim.solve(sim.makeGame(meta, grid)).cmds
        ok(plan.some(c => c.skill === 'build'),
            `${meta.name}: the solver stopped spending BUILDER — the plank road is gone (hygiene over-stripped?)`)
        ok(sim.stripPhantomBuilds(meta, grid, plan).length === plan.length,
            `${meta.name}: stripPhantomBuilds stripped a productive script — the validator over-reaches`)
    }
    // The validator can fail. Plant a LIVE phantom on THE LEDGE's script: ten
    // ticks before its blocker-line command, stamp a second builder grant onto
    // the same walker — the east rim is pond (the plank law refuses water) and
    // the floor behind is intact, so no descent ever arrives and no wood is
    // ever laid. The grant must come out, the board must still win its quota,
    // and because the grant is dead weight the stripped world must be
    // bit-identical — removal is proven neutral, never assumed.
    {
        const { meta, grid } = buildLevel(3)
        const plan = sim.solve(sim.makeGame(meta, grid)).cmds
        const blockT = plan.find(c => c.skill === 'block')?.tick ?? 400
        const plantT = Math.max(70, blockT - 10)
        const planted = [...plan, { tick: plantT, id: 0, skill: 'build' }]
        let applied = false
        const full = sim.replay(meta, grid, planted, {
            // #3892 phase: a stamp-T command is assigned between the steps and
            // first moves the world in the step that advances to T+1 — so the
            // grant is first visible at plantT+1, exactly as solve would apply
            // it. (Pre-#3892 this read plantT, the early-fetch's signature.)
            onTick: (g) => { if (g.tick === plantT + 1 && g.lemmings[0].builder) applied = true },
        })
        ok(full.win === true, '#3876 mutation harness broken: the planted script does not even win')
        ok(applied, `#3876 plant was never a live grant (id0 not carrying builder at tick ${plantT}) — the probe would pass vacuously`)
        const out = sim.stripPhantomBuilds(meta, grid, planted)
        ok(out.length === plan.length,
            '#3876 plant survived — a BUILDER commit that never lays wood stayed in the script: the validator cannot fail')
        const s = sim.replay(meta, grid, out)
        ok(s.win && s.exited === full.exited && s.dead === full.dead && sim.stateHash(s) === sim.stateHash(full),
            '#3876 stripping a dead grant moved the world — removal was not provably neutral')
    }
}

section('SOUND (#3879: graveyard bed, per-skill voices, mute)')
{
    const T = MUSIC.lemmings
    ok(!!T, '#3879: MUSIC.lemmings missing — the game would ship silent')
    if (T) {
        ok(Number.isFinite(T.step) && T.step > 0.08 && T.step < 0.3, `#3879: bed step ${T.step} outside a musical march range`)
        ok(T.lead.length >= 24 && T.lead.length % 8 === 0, `#3879: lead ${T.lead.length} is not a phrase multiple`)
        ok(T.bass && T.bass.length === T.lead.length, '#3879: bass and lead lengths disagree — the loop would shear')
        ok(T.perc && T.perc.length === T.lead.length, '#3879: perc and lead lengths disagree')
        const bad = [...T.lead, ...T.bass, ...T.perc].filter(n => !Number.isInteger(n) || n < 0 || n > 108)
        ok(bad.length === 0, `#3879: non-integer/out-of-range note entries: ${bad.join(',')}`)
        ok(T.lead.filter(n => n > 0).length >= 8, '#3879: the lead is nearly silent — a bed with no melody')
        ok(T.bass.filter(n => n > 0).length >= 4, '#3879: the lament bass has no pulse')
        ok(T.lead.every(n => n === 0 || (n >= 60 && n <= 96)), '#3879: a lead note left the organ register (60–96)')
        ok(T.perc.filter(n => n > 0).length <= T.lead.length / 8 + 4, '#3879: perc too busy — the bed would fight the footsteps')
    }
    const wsrc = readFileSync(new URL('../src/games/Lemmings/index.jsx', import.meta.url), 'utf8')
    ok(/startMusic\('lemmings'\)/.test(wsrc), '#3879: index.jsx never starts the bed')
    ok(/syncMusic/.test(wsrc), '#3879: the bed is not driven by the state machine')
    ok(/setMuted\(/.test(wsrc) && /KeyM/.test(wsrc), '#3879: M/mute wiring missing')
    ok(/stopMusic\(\)/.test(wsrc), '#3879: unmount would leave the bed running into the next title')
    ok(/mute=\{\{/.test(wsrc), '#3879: the pause screen lost its SOUND row')
    const psrc = readFileSync(new URL('../src/components/PauseOverlay.jsx', import.meta.url), 'utf8')
    ok(/data-mute=/.test(psrc) && /\bmute\b/.test(psrc), '#3879: PauseOverlay mute prop missing')
    // per-skill voices (#3879): every skill the panel offers must own a branch
    for (const s of ['float', 'block', 'bomb', 'climb', 'dig', 'build']) {
        ok(new RegExp(`s === '${s}'`).test(wsrc), `#3879: skillSfx has no voice for ${s}`)
    }
    const rsrc = readFileSync(new URL('../src/config/games.js', import.meta.url), 'utf8')
    ok(/M mutes the sound/.test(rsrc), '#3879: the registry controls never mention the mute')
}

section('LOOK (#3879: sloped planks, animated sprites, splintering wood)')
{
    const wsrc = readFileSync(new URL('../src/games/Lemmings/index.jsx', import.meta.url), 'utf8')
    // sloped planks: the road leans toward the nearest downhill board, read
    // from the wood grid in both directions and at the two-cell reach SPIRE's
    // stair uses; the flat run keeps the plain board untouched.
    ok(/plankAt\(x \+ 1, y \+ 1\)/.test(wsrc) && /plankAt\(x \+ 2, y \+ 2\)/.test(wsrc),
        '#3879: the painter no longer reads diagonal boards — planks sit flat again')
    ok(/plankAt\(x - 1, y \+ 1\)/.test(wsrc) && /plankAt\(x - 2, y \+ 2\)/.test(wsrc),
        '#3879: westward leans lost — left-descent roads would sit flat')
    ok(/const NOSE = \[0, 0, 0, 0, 0, 1, 2, 4\]/.test(wsrc),
        '#3879: the nose profile is gone — boards cannot lean into the descent')
    ok(/if \(lean === 0\) \{/.test(wsrc),
        '#3879: the flat-plank branch is gone — bridges and flat roads would tilt off the shelf')
    // sprites: hair cap with a flick, a real 4-frame stride, landing squash.
    ok(/\/\/ fringe[\s\S]{0,400}flick/.test(wsrc),
        '#3879: the hair cap lost its strand/flick — lemmings are bald walkers again')
    ok(/Math\.floor\(gs\.tick \/ 6 \+ L\.id\) % 4/.test(wsrc),
        '#3879: the walk phase clock is gone — the walk cycle collapsed to a slide')
    ok(/lead \+ d/.test(wsrc) && /trail \+ d/.test(wsrc),
        '#3879: stride/recovery foot offsets gone — legs no longer reach past the body')
    ok(/legs dangle loose/.test(wsrc), '#3879: fallers lost their dangling legs')
    ok(/a bite every four ticks/.test(wsrc) && /Math\.floor\(gs\.tick \/ 4 \+ L\.id\) % 2/.test(wsrc),
        '#3879: the digger shovel stopped pumping')
    ok(/other arm pumps/.test(wsrc), '#3879: climbers stopped alternating arms')
    ok(/fuse spark spits/.test(wsrc), '#3879: the bomber lost its fuse spark')
    const squashes = (wsrc.match(/squash\[e\.id\] = SQUASH_LIFE/g) || []).length
    ok(squashes === 2, `#3879: land/landsoft squash wiring incomplete (${squashes}/2) — parachute or fall landings would not squash`)
    ok(/\(squash\[L\.id\] \|\| 0\) > 0/.test(wsrc), '#3879: the painter never reads the squash map')
    // canopy: three-step rock + landing dip
    ok(/\[0, 1, 0, -1\]/.test(wsrc), '#3879: the canopy sway collapsed back to a two-frame jitter')
    // splintering wood: mask before the step, splinters where the blast cleared
    // planks, dust where a plank lands — all on the WORLD clock.
    ok(/const wm = woodMask\(\)/.test(wsrc), '#3879: no wood mask taken before the step — blast splinters cannot know what was wood')
    ok(/e\.type === 'blast'[\s\S]{0,240}splinterBlast\(e\.x, e\.y, wm\)/.test(wsrc),
        '#3879: the blast event no longer throws splinters')
    ok(/splinterBlast[\s\S]{0,600}wm\[y \* W \+ x\] !== 1 \|\| gs\.grid\[y \* W \+ x\] === PLANK/.test(wsrc),
        '#3879: splinters stopped checking cleared wood — chips would fly from dirt')
    ok(/e\.type === 'plank'[\s\S]{0,240}splinterLay\(e\.x, e\.y\)/.test(wsrc),
        '#3879: plank laying lost its nail-dust')
    ok(/c\.vy \+= 0\.035/.test(wsrc), '#3879: chips fell out of the world clock — splinters would freeze in the air on FF')
}

// ------------------------------------------------------ wind vents (#3879) ----
{
    section('WIND VENTS (#3879/#3930: canopies drift, walkers drag, proofs ride)')
    // The gadget's law after #3930: wind moves CANOPIES AND WALKERS at
    // CFG.windSp — diggers, climbers, blockers, bombers and bare fallers hold
    // their line. Solver proofs still ride unchanged because candidates() never
    // offers FLOATER (#3827 law) AND both streams sit off the proof lines:
    // SPIRE's gust is a tailwind (pushes toward the door), MASSIF's stream
    // blows two rows above the plank road. All of it pinned below.
    const v0 = buildLevel(0).meta.vents
    const v1 = buildLevel(1).meta.vents
    ok(Array.isArray(v0) && v0.length === 1 && v0[0].dir === 1 && v0[0].reach > 0,
        '#3879: THE SPIRE lost its tailwind vent — the exit-approach gust is gone')
    ok(Array.isArray(v1) && v1.length === 1 && v1[0].dir === -1,
        '#3879: THE MASSIF lost its headwind vent — the trench-mouth shove is gone')
    ok(v1 && v1[0].y === 21,
        '#3930: THE MASSIF stream dropped back to road height — a 3.4-c/s headwind on row 22 erases the plank-road proof')
    ok(!buildLevel(2).meta.vents && !buildLevel(3).meta.vents,
        '#3879: vents multiplied onto the solver-tight levels — keep the gadget off THE DOOR/THE LEDGE')

    // the gust itself: SPIRE sandbox, a canopy dropped over the plinth approach
    {
        const { meta, grid } = buildLevel(0)
        const drop = (floater) => {
            const g = sim.makeGame(meta, grid)
            sim.spawnLemming(g)
            const L = g.lemmings[0]
            L.state = 'fall'; L.vy = 0; L.fallDist = 0; L.floater = floater
            L.x = 40.0; L.y = 21.0                 // just above the stream (rows 22–23)
            const x0 = L.x
            for (let t = 0; t < 60 && L.live && L.state === 'fall'; t++) sim.step(g)
            return { dx: L.x - x0, landed: L.state === 'walk', y: L.y }
        }
        const gust = drop(true), calm = drop(false)
        ok(gust.dx > 0.5, `#3879: a floater through THE SPIRE's stream drifted ${gust.dx.toFixed(2)} — the gust is dead`)
        ok(Math.abs(calm.dx) < 1e-9, `#3879: a bare faller in the stream moved ${calm.dx.toFixed(3)} — wind now pushes fallers, the law is canopy+walker only`)
        // stripped vents: the drift must come from the level, not a stray push
        const m0x = { ...meta, vents: undefined }
        const g0x = sim.makeGame(m0x, grid)
        sim.spawnLemming(g0x)
        const M = g0x.lemmings[0]
        M.state = 'fall'; M.vy = 0; M.fallDist = 0; M.floater = true; M.x = 40.0; M.y = 21.0
        const mx0 = M.x
        for (let t = 0; t < 60 && M.live && M.state === 'fall'; t++) sim.step(g0x)
        ok(Math.abs(M.x - mx0) < 1e-9, `#3879: drift survived stripped vents (${(M.x - mx0).toFixed(3)}) — windAt ignores level.vents`)
        ok(gust.landed, '#3879: the tailed floater never reached the plinth — the tailwind misses its stage')
    }

    // #3930 GROUND DRAG — a walker in the stream slides at windSpeed. SPIRE's
    // tailwind carries a road body to the door in half the walking time; the
    // windless twin never gets there.
    {
        const { meta, grid } = buildLevel(0)
        const walk = (strip) => {
            const m = strip ? { ...meta, vents: undefined } : meta
            const g = sim.makeGame(m, grid)
            sim.spawnLemming(g)
            const L = g.lemmings[0]
            L.state = 'walk'; L.dir = 1; L.x = 40.0; L.y = 23.0   // plinth surface, facing the door
            const x0 = L.x
            for (let t = 0; t < 30 && L.live && L.state === 'walk'; t++) sim.step(g)
            return { dx: +(L.x - x0).toFixed(2), exited: g.exited }
        }
        const tail = walk(false), calm = walk(true)
        ok(tail.exited === 1 && calm.exited === 0,
            `#3930: tailwind exit ${tail.exited}/1, windless ${calm.exited}/0 — the gust no longer drags walkers toward the door`)
        ok(tail.dx > calm.dx + 0.5, `#3930: tailwind walked ${tail.dx} vs windless ${calm.dx} — ground drag lost its push`)
        // stripped vents must be calm for walkers too
        ok(Math.abs(calm.dx - 30 * 2.3 / 60) < 0.05, `#3930: windless SPIRE walked ${calm.dx} off the pure walkSp line — stray push on the vents-stripped twin`)
    }

    // both directions, and the wall: a headwind outruns a walk; the stream
    // carries a body TO a wall, never through one (synthetic lab)
    {
        const lab = (dir, x0, dir0) => {
            const grid = new Uint8Array(sim.W * sim.H).fill(sim.AIR)
            for (let x = 0; x < sim.W; x++) grid[10 * sim.W + x] = sim.STEEL
            const meta = {
                name: 'DRAG LAB', time: 60, spawn: { x: 2.5, y: 9 }, exit: { x: 99, y: 9 },
                spawnCount: 0, spawnEvery: 999, need: 1,
                skills: { block: 0, bomb: 0, climb: 0, dig: 0, float: 0, build: 0 },
                vents: dir ? [{ x: dir > 0 ? 5 : 25, y: 9, dir, reach: 20 }] : undefined,
            }
            const g = sim.makeGame(meta, grid)
            sim.spawnLemming(g)
            const L = g.lemmings[0]
            L.state = 'walk'; L.dir = dir0; L.x = x0; L.y = 10
            const x0m = L.x
            for (let t = 0; t < 60 && L.live && L.state === 'walk'; t++) sim.step(g)
            return +(L.x - x0m).toFixed(2)
        }
        ok(lab(1, 20, 1) > 5, '#3930: a walker with the wind outran walk+wind (the drag is gone)')
        ok(lab(-1, 20, 1) < 0, '#3930: a headwind did not push an eastbound walker backwards (drag speed <= walkSp?)')
        ok(Math.abs(lab(0, 20, 1) - 2.3) < 0.05, '#3930: the windless lab drifted off walkSp — the lab lies')
        // wind carries you to a wall, never through one: face away, get pinned
        const grid = new Uint8Array(sim.W * sim.H).fill(sim.AIR)
        for (let x = 0; x < sim.W; x++) grid[10 * sim.W + x] = sim.STEEL
        for (let y = 3; y <= 9; y++) grid[y * sim.W + 5] = sim.STEEL      // a wall in the wind's face
        const meta = {
            name: 'WALL LAB', time: 60, spawn: { x: 2.5, y: 9 }, exit: { x: 40, y: 9 },
            spawnCount: 1, spawnEvery: 1, need: 1, skills: { block: 0, bomb: 0, climb: 0, dig: 0, float: 1, build: 0 },
            vents: [{ x: 2, y: 5, dir: 1, reach: 9 }],
        }
        const g = sim.makeGame(meta, grid)
        sim.spawnLemming(g)
        const L = g.lemmings[0]
        L.state = 'fall'; L.vy = 0; L.fallDist = 0; L.floater = true; L.x = 3.0; L.y = 5.5
        for (let t = 0; t < 120 && L.live && L.state === 'fall'; t++) sim.step(g)
        ok(L.x < 4.51, `#3879: the gust pushed a canopy to x=${L.x.toFixed(2)} — it squeezed toward/through the steel wall`)
        ok(L.x > 3.9, `#3879: the wall lab drifted only ${(L.x - 3).toFixed(2)} before the wall — clamp kills the gust entirely`)
        const g2 = sim.makeGame(meta, grid)
        sim.spawnLemming(g2)
        const W2 = g2.lemmings[0]
        W2.state = 'walk'; W2.dir = -1; W2.x = 3.0; W2.y = 10              // face west, east gust pins at the wall
        let crossed = false
        for (let t = 0; t < 120 && W2.live; t++) { sim.step(g2); if (W2.x > 4.51) crossed = true }
        ok(!crossed, '#3930: ground drag pushed a walker through the steel wall')
        // blown off a lip: the gust drops the body over the edge and water takes it
        const grid2 = new Uint8Array(sim.W * sim.H).fill(sim.AIR)
        for (let x = 0; x <= 20; x++) grid2[10 * sim.W + x] = sim.STEEL
        for (let x = 21; x <= 30; x++) { grid2[10 * sim.W + x] = sim.WATER; grid2[11 * sim.W + x] = sim.WATER }
        const meta2 = {
            name: 'LIP LAB', time: 60, spawn: { x: 2.5, y: 9 }, exit: { x: 99, y: 9 },
            spawnCount: 0, spawnEvery: 999, need: 1,
            skills: { block: 0, bomb: 0, climb: 0, dig: 0, float: 0, build: 0 },
            vents: [{ x: 12, y: 9, dir: 1, reach: 15 }],
        }
        const g3 = sim.makeGame(meta2, grid2)
        sim.spawnLemming(g3)
        const L3 = g3.lemmings[0]
        L3.state = 'walk'; L3.dir = -1; L3.x = 18; L3.y = 10               // facing away; the east gust still shoves it into the pond
        let drown = 0
        for (let t = 0; t < 180 && L3.live; t++) { sim.step(g3); drown += g3.events.filter((e) => e.type === 'drown').length }
        ok(drown === 1, '#3930: a walker blown off a lip over water did not drown — the pond law stops at the gust')
    }

    // no level without vents may sense wind; the solver never offers FLOATER,
    // so every proof line is wind-blind by construction
    ok(sim.windAt(sim.makeGame(buildLevel(2).meta, buildLevel(2).grid), { x: 24.5, y: 23 }) === 0,
        '#3879: windAt answers on a ventless level — the gadget leaks into THE DOOR')
    for (let i = 0; i < 4; i++) {
        const s = buildLevel(i)
        const r = sim.solve(sim.makeGame(s.meta, s.grid))
        ok(r.cmds.every(c => c.skill !== 'float'),
            `#3879: the solver offered FLOATER on ${s.meta.name} — wind-proof independence of the proof lines is gone`)
    }
    // #3930's harder half: THE MASSIF's proof line never touches the stream —
    // not a canopy, not a walker (rows 20–21 vs road row 23/doorstep mount).
    {
        const s = buildLevel(1)
        const r = sim.solve(sim.makeGame(s.meta, s.grid))
        let touches = 0
        sim.replay(s.meta, s.grid, r.cmds, { onTick: (g) => { for (const L of g.lemmings) if (L.live && sim.windAt(g, L)) touches++ } })
        ok(touches === 0, `#3930: THE MASSIF's solver line crossed the gust ${touches}× — the plank-road proof now feels the wind`)
        // and the threat survives the move: a parachutist at the doorstep gets
        // shoved west, off the plinth, toward the trench mouth.
        const g = sim.makeGame(s.meta, s.grid)
        sim.spawnLemming(g)
        const L = g.lemmings[0]
        L.state = 'fall'; L.vy = 0; L.fallDist = 0; L.floater = true
        L.x = 40.5; L.y = 20.0                     // over the trench mouth, in the stream's columns 37–41
        const x0 = L.x
        for (let t = 0; t < 90 && L.live && L.state === 'fall'; t++) sim.step(g)
        ok(L.x < x0 - 0.5, `#3930: the relocated MASSIF vent stopped shoving parachutes west (dx ${(L.x - x0).toFixed(2)}) — the trap is defanged`)
    }

    // the stream is on screen: grate + dashes on the WORLD clock
    const wsrc = readFileSync(new URL('../src/games/Lemmings/index.jsx', import.meta.url), 'utf8')
    ok(/meta\.vents \|\| \[\]/.test(wsrc), '#3879: the painter stopped drawing vents — gusts would be invisible')
    ok(/rgba\(154,220,232,/.test(wsrc), '#3879: the airstream dashes lost their hue — the vent reads as a plain box')
    ok(/gs\.tick \* 2 \+ j \* \(L0 \/ 6\)/.test(wsrc), '#3879: the airstream froze — dashes no longer travel on the WORLD clock')
}


// ---------------------------------------------------- trampolines (#3879) ----
{
    section('TRAMPOLINES (#3879: fixed bounce, absorbed fall, proofs stay mat-free)')
    const t1 = buildLevel(1).meta.trampolines
    ok(Array.isArray(t1) && t1.length === 2 && t1.every(p => p.y === 24),
        '#3879: THE MASSIF lost its trench mats — the trap is silent steel again')
    ok(!buildLevel(0).meta.trampolines && !buildLevel(2).meta.trampolines && !buildLevel(3).meta.trampolines,
        '#3879: trampolines multiplied off the trench — keep the gadget off SPIRE/DOOR/LEDGE')
    ok(sim.padAt(sim.makeGame(buildLevel(2).meta, buildLevel(2).grid), { x: 24.5, y: 23 }) === null,
        '#3879: padAt answers on a padless level — the gadget leaks into THE DOOR')

    // sandbox: one flat floor, one mat, one ceiling of sky
    const lab = (extra) => {
        const grid = new Uint8Array(sim.W * sim.H).fill(sim.AIR)
        for (let x = 0; x < sim.W; x++) grid[10 * sim.W + x] = sim.STEEL
        const meta = {
            name: 'PAD LAB', time: 60, spawn: { x: 2.5, y: 9 }, exit: { x: 40, y: 9 },
            spawnCount: 0, spawnEvery: 999, need: 1,
            skills: { block: 0, bomb: 0, climb: 0, dig: 0, float: 0, build: 0 },
            trampolines: [{ x: 8, y: 10 }], ...extra,
        }
        const g = sim.makeGame(meta, grid)
        sim.spawnLemming(g)
        const L = g.lemmings[0]
        return { g, L }
    }

    // fixed height: dropped softly or slammed in fast, the apex is the same.
    // The fast arrival starts just above the mat (not higher than the apex —
    // a 12 vy drop from up top would measure its own fall, not the bounce).
    const apexOf = (vy0) => {
        const { g, L } = lab()
        L.state = 'fall'; L.vy = vy0; L.fallDist = 0; L.x = 8.5; L.y = vy0 > 5 ? 8.9 : 8.5
        let apex = L.y, bounced = 0
        for (let t = 0; t < 240 && L.live; t++) {
            sim.step(g)
            bounced += g.events.filter(e => e.type === 'pad').length
            if (L.live) apex = Math.min(apex, L.y)
        }
        return { apex, bounced }
    }
    const soft = apexOf(0), hard = apexOf(12)
    ok(soft.bounced === 1 && hard.bounced === 1, `#3879: mats miscounted launches (soft=${soft.bounced}, hard=${hard.bounced})`)
    ok(Math.abs((10 - soft.apex) - 2.5) < 0.2 && Math.abs(soft.apex - hard.apex) < 0.2,
        `#3879: apex soft=${soft.apex.toFixed(2)} hard=${hard.apex.toFixed(2)} — the bounce must be FIXED at ~2.5 cells`)
    ok(hard.bounced === 1 && hard.apex < 8.4,
        '#3879: a fast arrival was NOT absorbed — the mat must wipe the fall, not amplify it')

    // a lethal drop is caught: 8 cells onto the mat (maxFall is 3) survives
    {
        const { g, L } = lab()
        L.state = 'fall'; L.vy = 12; L.fallDist = 8; L.x = 8.5; L.y = 2
        for (let t = 0; t < 240 && L.live; t++) sim.step(g)
        ok(L.live, '#3879: the mat let an 8-cell fall splat — padLaunch must run BEFORE the kill test')
    }

    // walkers bounce too: footsteps on a mat take the launch
    {
        const { g, L } = lab()
        L.state = 'walk'; L.x = 6.5; L.y = 10; L.dir = 1
        let bounced = 0
        for (let t = 0; t < 120 && L.live; t++) { sim.step(g); bounced += g.events.filter(e => e.type === 'pad').length }
        ok(bounced === 1, `#3879: a walker crossed the mat with ${bounced} launches — the step-on hook is dead`)
    }

    // cooldown: the flight home lands ON the mat and stands, no ping-pong;
    // and the ceiling guard: a walled mat must not shove a head through rock
    {
        const { g, L } = lab()
        L.state = 'fall'; L.vy = 0; L.fallDist = 0; L.x = 8.5; L.y = 8.5
        // count only what the loop sees: drop (~8 ticks) + launch + flight
        // home (~57) + standing cooldown + walking away, under padHold+40.
        let bounces = 0
        for (let t = 0; t < sim.CFG.padHold + 40; t++) { sim.step(g); bounces += g.events.filter(e => e.type === 'pad').length; if (!L.live) break }
        ok(bounces === 1, `#3879: ${bounces} bounces inside one cooldown — the mat ping-pongs`)
        const walled = lab({ trampolines: [{ x: 8, y: 10 }], })
        // seal both sky rows over the mat
        for (const y of [8, 9]) walled.g.grid[y * sim.W + 8] = sim.STEEL
        walled.L.state = 'fall'; walled.L.vy = 0; walled.L.fallDist = 0; walled.L.x = 8.5; walled.L.y = 8.5
        let wb = 0
        for (let t = 0; t < 60 && walled.L.live; t++) { sim.step(walled.g); wb += walled.g.events.filter(e => e.type === 'pad').length }
        ok(wb === 0 && walled.L.state === 'walk', `#3879: a walled mat launched ${wb} times — the two-row sky guard is gone`)
    }

    // THE MASSIF verdict: what falls into the trench still cannot get out —
    // the mats change the trap's temper, not its law (exit is beyond a 2-tile
    // wall; the apex cannot reach it). And the PROVEN script never touches a
    // mat at all: every existing proof rides the plank road byte-identical.
    {
        const { meta, grid } = buildLevel(1)
        const r = sim.solve(sim.makeGame(meta, grid))
        let padHits = 0
        sim.replay(meta, grid, r.cmds, { onTick: (g) => { padHits += g.events.filter(e => e.type === 'pad').length } })
        ok(padHits === 0, `#3879: the proven line bounced ${padHits} times — the solver crossed a mat, proofs no longer ride the road`)
        const trap = sim.makeGame({ ...meta, spawnCount: 0 }, grid)
        sim.spawnLemming(trap)
        const L = trap.lemmings[0]
        L.state = 'fall'; L.vy = 0; L.fallDist = 0; L.x = 38.5; L.y = 22
        for (let t = 0; t < meta.time * 60 && L.live && !trap.end; t++) sim.step(trap)
        ok(trap.exited === 0, '#3879: a trench drop exited the level — the mats handed out an escape route')
    }

    // the gadget is on screen: mats drawn, and their ring rides the WORLD clock
    const wsrc2 = readFileSync(new URL('../src/games/Lemmings/index.jsx', import.meta.url), 'utf8')
    ok(/meta\.trampolines \|\| \[\]/.test(wsrc2), '#3879: the painter stopped drawing mats — the trench floors blind again')
    ok(/#c8323c/.test(wsrc2), '#3879: the deck lost its red — the mat reads as plain steel')
    ok(/padPing\[Math\.floor\(e\.x\)/.test(wsrc2) && /--padPing\[k\]/.test(wsrc2),
        '#3879: the mat ring froze or never rings — pad launches would be silent scenery')
}

section('TELEPORTS (#3879: paired mouths, absorbed arrival, trap keeps its law)')
{
    const tp1 = buildLevel(1).meta.teleports
    ok(Array.isArray(tp1) && tp1.length === 2 && tp1.every(p => p.y === 24)
        && tp1[0].pair === 1 && tp1[1].pair === 0 && tp1[0].x !== tp1[1].x,
        '#3879: THE MASSIF lost its trench maw pair — the trap is silent steel again')
    ok(!buildLevel(0).meta.teleports && !buildLevel(2).meta.teleports && !buildLevel(3).meta.teleports,
        '#3879: maws multiplied off the trench — keep the gadget off SPIRE/DOOR/LEDGE')
    ok(sim.tpAt(sim.makeGame(buildLevel(2).meta, buildLevel(2).grid), { x: 24.5, y: 23 }) === null,
        '#3879: tpAt answers on a mouthless level — the gadget leaks into THE DOOR')

    // sandbox: flat floor, a linked pair, walls that keep a body pacing them
    const lab = (extra) => {
        const grid = new Uint8Array(sim.W * sim.H).fill(sim.AIR)
        for (let x = 0; x < sim.W; x++) grid[10 * sim.W + x] = sim.STEEL
        for (const y of [8, 9]) { grid[y * sim.W + 4] = sim.STEEL; grid[y * sim.W + 13] = sim.STEEL }
        const meta = {
            name: 'TP LAB', time: 60, spawn: { x: 2.5, y: 9 }, exit: { x: 40, y: 9 },
            spawnCount: 0, spawnEvery: 999, need: 1,
            skills: { block: 0, bomb: 0, climb: 0, dig: 0, float: 0, build: 0 },
            teleports: [{ x: 8, y: 10, pair: 1 }, { x: 10, y: 10, pair: 0 }], ...extra,
        }
        const g = sim.makeGame(meta, grid)
        sim.spawnLemming(g)
        const L = g.lemmings[0]
        return { g, L }
    }
    const runs = (g, L, ticks) => {
        const warps = []
        for (let t = 0; t < ticks && L.live && !g.end; t++) {
            sim.step(g)
            for (const e of g.events) if (e.type === 'tp') warps.push({ t, x: e.x, tx: e.tx })
        }
        return warps
    }

    // a footstep onto a mouth rides it: ONE warp, out the mate, direction and
    // stride kept (the maw moves the body, the player keeps the tiller).
    {
        const { g, L } = lab()
        L.state = 'walk'; L.x = 6.5; L.y = 10; L.dir = 1
        const w = runs(g, L, 60)
        ok(w.length === 1 && w[0].x >= 8 && w[0].x < 9 && Math.abs(w[0].tx - 10.5) < 1e-9,
            `#3879: crossed the west maw with ${w.length} warps (first ${JSON.stringify(w[0])}) — footstep hook dead or mis-paired`)
        ok(L.state === 'walk' && L.dir === 1, '#3879: a warped body lost its walk or its direction — strides must survive the ride')
    }

    // a landing rides it too, and the arrival absorbs a lethal drop — maws
    // catch what falls in, like the mats do (fallDist wiped, no splat).
    {
        const { g, L } = lab()
        L.state = 'fall'; L.vy = 12; L.fallDist = 8; L.x = 8.5; L.y = 2
        const w = runs(g, L, 60)
        ok(L.live && w.length === 1 && Math.abs(L.x - 10.5) < 0.2,
            `#3879: an 8-cell drop onto a maw gave ${w.length} warps, alive=${L.live} — the arrival must absorb the fall`)
    }

    // the cooldown: the pace between the two walls re-crosses the near mouth
    // inside tpHold — that crossing must NOT warp; only after the gate opens
    // does the pair ride again, so facing maws can never strobe a body.
    {
        const { g, L } = lab()
        L.state = 'walk'; L.x = 6.5; L.y = 10; L.dir = 1
        const w = runs(g, L, 400)
        ok(w.length >= 2, `#3879: a pacing body warped ${w.length} times in 400 ticks — the pair went dead or the walls moved`)
        const gaps = w.slice(1).map((e, i) => e.t - w[i].t)
        ok(gaps.every(x => x >= sim.CFG.tpHold),
            `#3879: warp gaps ${JSON.stringify(gaps)} — a re-crossing inside tpHold warped (ping-pong law gone)`)
    }

    // sky guards: a roofed mouth is dead steel (its own sky AND its mate's —
    // never spit a body into rock), and so is a mouth under a laid plank —
    // the structural law that keeps the solver's plank road proof sealed.
    for (const [name, seal] of [
        ['own sky', (grid) => { grid[9 * sim.W + 8] = sim.STEEL; grid[8 * sim.W + 8] = sim.STEEL }],
        ['mate sky', (grid) => { grid[9 * sim.W + 10] = sim.STEEL; grid[8 * sim.W + 10] = sim.STEEL }],
        ['plank cover', (grid) => { grid[9 * sim.W + 8] = sim.PLANK }],
    ]) {
        const { g, L } = lab()
        seal(g.grid)
        L.state = 'walk'; L.x = 6.5; L.y = 10; L.dir = 1
        const w = runs(g, L, 120)
        ok(w.length === 0 && L.live, `#3879: a maw with ${name} sealed warped ${w.length} times — the guard is gone`)
    }

    // a broken declaration (self-pair, dangling index) is inert, never a launcher
    {
        const { g, L } = lab({ teleports: [{ x: 8, y: 10, pair: 0 }] })
        L.state = 'walk'; L.x = 6.5; L.y = 10; L.dir = 1
        ok(runs(g, L, 120).length === 0, '#3879: a self-paired maw warped — pair validation is gone')
    }

    // THE MASSIF: the proven line never opens a gate (road-wood seals the
    // mouths AND no script body falls in), and a trap tenant rides the pair —
    // temper grows, verdict holds: exited stays zero.
    {
        const { meta, grid } = buildLevel(1)
        const r = sim.solve(sim.makeGame(meta, grid))
        let tpHits = 0
        sim.replay(meta, grid, r.cmds, { onTick: (g) => { tpHits += g.events.filter(e => e.type === 'tp').length } })
        ok(tpHits === 0, `#3879: the proven line warped ${tpHits} times — the solver crossed a maw, proofs no longer ride the road`)
        const runs0 = () => {
            const trap = sim.makeGame({ ...meta, spawnCount: 0 }, grid)
            sim.spawnLemming(trap)
            const L = trap.lemmings[0]
            L.state = 'fall'; L.vy = 0; L.fallDist = 0; L.x = 38.5; L.y = 22
            let warps = 0
            for (let t = 0; t < meta.time * 60 && L.live && !trap.end; t++) { sim.step(trap); warps += trap.events.filter(e => e.type === 'tp').length }
            return { warps, exited: trap.exited, hash: sim.stateHash(trap) }
        }
        const run1 = runs0(), run2 = runs0()
        ok(run1.warps >= 2, `#3879: a trench tenant warped ${run1.warps} times — the pair is dead inside the trap`)
        ok(run1.exited === 0 && run2.exited === 0, '#3879: a trench drop exited the level — the maws handed out an escape route')
        ok(run1.hash === run2.hash && run1.warps === run2.warps, '#3879: the maw pair is nondeterministic — warps must ride the fixed clock')
    }

    // the gadget is on screen: plates drawn, pulse + flare on the WORLD clock,
    // dust at both mouths, a voice for the ride.
    const wsrcT = readFileSync(new URL('../src/games/Lemmings/index.jsx', import.meta.url), 'utf8')
    ok(/meta\.teleports \|\| \[\]/.test(wsrcT), '#3879: the painter stopped drawing maws — the trench floors blind again')
    ok(/#7a3fd0/.test(wsrcT) && /#5ad8e6/.test(wsrcT), '#3879: the pair lost its violet/cyan — mouths read as plain steel')
    ok(/tpPing\[t\.x \+ ',' \+ t\.y\]/.test(wsrcT) && /--tpPing\[k\]/.test(wsrcT),
        '#3879: the maw flare froze or never fires — warps would be silent scenery')
    ok(/e\.type === 'tp'/.test(wsrcT) && /warpDust\(e\.tx/.test(wsrcT), '#3879: the tp event lost its sound or its arrival dust')
}

section('FLOAT-WHILE-DIGGING (#3925: an airborne digger chews straight down)')
{
    // A dirt column with steel under it; an airborne digger dropped into it must
    // CARVE the column and descend onto the steel — the shaft the honest gap said
    // the port never had. A non-digger dropped the same way takes the original
    // free-fall and lands on the COLUMN TOP (the control: the branch is gated by
    // the digger flag, it never "always digs").
    const mkColumn = () => {
        const gr = new Uint8Array(sim.W * sim.H).fill(sim.AIR)
        for (let y = 10; y <= 22; y++) gr[y * sim.W + 10] = sim.DIRT
        gr[23 * sim.W + 10] = sim.STEEL
        return gr
    }
    const { meta } = buildLevel(0)
    const dropDigger = (skill) => {
        const gr = mkColumn()
        const g = sim.makeGame({ ...meta, spawnCount: 1, spawnEvery: 1, skills: { ...meta.skills, dig: 1 } }, gr)
        for (let t = 0; t < 10; t++) sim.step(g)
        const L = g.lemmings[0]
        L.state = 'fall'; L.vy = 0; L.fallDist = 0; L.digger = !!skill
        L.x = 10.5; L.y = 8
        let digs = 0, splats = 0
        for (let t = 0; t < 600 && L.live && L.state !== 'walk'; t++) {
            sim.step(g)
            digs += g.events.filter(e => e.type === 'dig').length
            splats += g.events.filter(e => e.type === 'splat').length
        }
        return { g, L, digs, splats }
    }
    const d = dropDigger(true)
    ok(d.digs > 5, `float-dig chewed nothing (${d.digs} dig events) — the descent is inert`)
    ok(d.L.live && d.L.y >= 22.5, `the digger did not descend the column (y=${d.L.y.toFixed(1)}, alive=${d.L.live}) — it should reach the steel floor`)
    ok(d.splats === 0, `the digger splatted while descending (${d.splats}) — chewing must cushion the drop, not count it as a fall`)
    ok(d.g.grid[15 * sim.W + 10] === sim.AIR && d.g.grid[20 * sim.W + 10] === sim.AIR,
        'the column still stands where the digger passed — the shaft was never carved')
    ok(d.L.state === 'walk', `the digger never resumed walking on the steel floor (state=${d.L.state})`)
    // control: a plain faller on the same column LANDS on top, proving the branch
    // is digger-gated and does not turn every airborne lemming into a miner.
    const c = dropDigger(false)
    ok(c.digs === 0 && c.L.live && c.L.y < 12,
        `control faller mined too (digs=${c.digs}, y=${c.L.y.toFixed(1)}) — float-dig is leaking to non-diggers`)
    // steel is floor: dig straight down onto it and stop.
    const sr = new Uint8Array(sim.W * sim.H).fill(sim.AIR)
    sr[12 * sim.W + 10] = sim.DIRT
    sr[13 * sim.W + 10] = sim.STEEL
    {
        const g = sim.makeGame({ ...meta, spawnCount: 1, spawnEvery: 1, skills: { ...meta.skills, dig: 1 } }, sr)
        for (let t = 0; t < 10; t++) sim.step(g)
        const L = g.lemmings[0]
        L.state = 'fall'; L.vy = 0; L.fallDist = 0; L.digger = true; L.x = 10.5; L.y = 10
        let digs = 0
        for (let t = 0; t < 200 && L.live && L.state !== 'walk'; t++) { sim.step(g); digs += g.events.filter(e => e.type === 'dig').length }
        ok(digs === 1 && L.live && L.y >= 13 && g.grid[12 * sim.W + 10] === sim.AIR,
            `dirt-over-steel dig misbehaved (digs=${digs}, y=${L.y.toFixed(1)}) — must chew the one dirt cell then stand on the steel`)
    }
}

// ------------------------------------------------------------- #3932 ----------
{
    section('THE SHELF (#3932: the plank-shelf climb-over — board ladder 1/4)')
    const { meta, grid } = buildLevel(4)
    ok(meta.name === 'THE SHELF', `level 4 is ${meta.name}, not THE SHELF — the ladder slot was taken`)
    // the trap: two-row moat, steel floor, both rims two-tile walls from it.
    ok(grid[23 * sim.W + 21] === sim.AIR && grid[24 * sim.W + 21] === sim.AIR && grid[25 * sim.W + 21] === sim.STEEL,
        '#3932: THE SHELF moat lost its depth — floor row 25 or an open rim row is gone')
    ok(grid[23 * sim.W + 19] === sim.DIRT && grid[24 * sim.W + 19] === sim.DIRT
        && grid[23 * sim.W + 24] === sim.DIRT && grid[24 * sim.W + 24] === sim.DIRT,
        '#3932: a moat rim dropped to one tile — the one-way trap is climbable again')
    // the prize: shelf top row 22 (a mount from the strip, a wall from the
    // pit), and the far side carved to row 24 so the descent is a span site.
    ok(grid[22 * sim.W + 28] === sim.DIRT && grid[21 * sim.W + 28] === sim.AIR,
        '#3932: THE SHELF lost its shelf top (row 22 at col 28) — the climb-over is gone')
    ok(grid[23 * sim.W + 40] === sim.AIR && grid[24 * sim.W + 40] === sim.DIRT,
        '#3932: the far-side drop was filled in — the descent road has no gap to bridge')
    ok(grid[23 * sim.W + 0] === sim.WATER && grid[24 * sim.W + 46] === sim.WATER,
        '#3932: THE SHELF lost its taxes — the west pond or the exit-side bay is dry')
    // the proof line: cargo paves the moat AND the descent, replay carries
    // the quota, and the road exists in the replayed world (attract shows it).
    const r = runSolver(4)
    ok(r.cmds.some(c => c.skill === 'build'),
        '#3932: THE SHELF script spends no cargo — the crossing is luck, not carpentry')
    const rp = sim.replay(meta, grid, r.cmds)
    ok(rp.win && rp.exited >= meta.need,
        `#3932: replaying the climb-over script delivers ${rp.exited}/${meta.need} — the recorded road does not carry the quota`)
    let road = 0
    for (let x = 20; x <= 23; x++) if (rp.grid[24 * sim.W + x] === sim.PLANK) road++
    ok(road === 4, `#3932: the moat road is ${road}/4 planks at row 24 — the crossing bridge is incomplete`)
    let span = 0
    for (let x = 38; x <= 41; x++) if (rp.grid[23 * sim.W + x] === sim.PLANK) span++
    ok(span >= 3, `#3932: the far-side descent spans ${span}/4 planks at row 23 — bodies fall past the door instead of walking to it`)
    // sharper than the proves loop: without wood the trap is not merely
    // un-winnable, it is EMPTY — the quota never even reaches the water line.
    const r0 = sim.solve(sim.makeGame({ ...meta, skills: { ...meta.skills, build: 0 } }, grid))
    ok(r0.exited === 0, `#3932: zero build still delivered ${r0.exited} — the moat leaks, the climb-over is not cargo-gated`)
}

console.log(`\nlemcheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach(f => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
