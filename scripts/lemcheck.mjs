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
import { PRESS, MESSAGES } from '../src/games/Lemmings/attract.js'
import * as sim from '../src/games/Lemmings/sim.js'
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
            const b = { st: L.state, c: L.climber, d: L.digger, f: L.floater }
            const before = g.skills[s]
            const granted = sim.assign(g, L.id, s)
            const spent = before - g.skills[s]
            const changed = L.state !== b.st || L.climber !== b.c || L.digger !== b.d || L.floater !== b.f
            ok(!granted || (spent === 1 && changed),
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

console.log(`\nlemcheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach(f => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
