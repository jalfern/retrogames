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
import * as sim from '../src/games/Lemmings/sim.js'

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
                    : t === sim.DIRT ? '#' : t === sim.STEEL ? '=' : '.'
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
    // fatal vs safe falls
    {
        const g = mk()
        for (let t = 0; t < 60; t++) sim.step(g)
        const L = g.lemmings[0]
        L.state = 'fall'; L.fallDist = sim.CFG.maxFall + 1; L.vy = 8
        L.x = 4.5; L.y = 22.5
        for (let t = 0; t < 60; t++) sim.step(g)
        ok(L.state === 'dead', 'a fall past the safe distance did not kill — maxFall is decoration')
        const g2 = mk()
        for (let t = 0; t < 60; t++) sim.step(g2)
        const S = g2.lemmings[0]
        S.state = 'fall'; S.fallDist = 3; S.vy = 8; S.x = 4.5; S.y = 22.5
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
    tryMut('blast = 0.6 (door never opens)', c => { c.blast = 0.6 }, () => runSolver(2).win)
    tryMut('digSp = 0 (massif stays shut)', c => { c.digSp = 0 }, () => runSolver(1).win)
}

console.log(`\nlemcheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach(f => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
