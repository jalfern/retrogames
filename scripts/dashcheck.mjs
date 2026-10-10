// BOULDER DASH — the cave audit. No browser, no dev server, ~1 s.
//
//   npm run dashcheck              # prove every cave winnable + pin every rule
//   npm run dashcheck -- --mutate  # silence one engine rule, watch a check red
//   npm run dashcheck -- --map 3   # ASCII view of a cave
//
// Why this exists (the issue's two named muscles — "cellular automata +
// headless reachability/explosion audit"): a Boulder Dash cave that cannot
// actually be won — a quota buried behind steel, a boulder that will crush the
// only route, a fire that outruns the harvest — never shows up in a screenshot.
// Every one of those is decided inside sim.js, so the gate is the SAME planner
// the attract demo replays: it digs the route with nothing but arrow moves and
// no peeks, and a cave it cannot clear with its own hazards live fails build.
//
// Four claims ride on top, each of which is exactly the sort of bug that hides:
//   - REACHABILITY: a flood-fill from the spawn (through dirt you can dig)
//     reaches the quota of gems AND the exit, independent of the planner — so
//     a green win is not one lucky route but a structurally solvable cave.
//   - PROVES: each cave's advertised rule (fell/roll/convert/fly/burn) was
//     genuinely observed firing during the run. Scenery that never happens is
//     caught here.
//   - DETERMINISM: the engine has no RNG, so the planner's recorded script
//     replays to an identical hash — and a script with one move dropped does not
//     (the tamper probe proves the check could actually see a desync).
//   - MUTATIONS: each CFG switch, silenced in a child process, must turn a real
//     check red. A mutant that survives is a report about a check, not the game.

import { spawnSync } from 'node:child_process'
import { LEVELS, buildLevel } from '../src/games/BoulderDash/levels.js'
import * as sim from '../src/games/BoulderDash/sim.js'

const args = process.argv.slice(2)
const MUT = args.includes('--mutate')
const mapArg = args.includes('--map') ? +args[args.indexOf('--map') + 1] : null
const MUT_NAME = process.env.DASH_MUT || null

const { W, H, EMPTY, DIRT, BOULDER, DIAMOND, STEEL, FIRE, CFG } = sim

const TOKEN = { dig: 'dig', fell: 'fell', roll: 'roll', convert: 'gemlost', fly: 'ignite', burn: 'spread' }

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`)

// ------------------------------------------------------------------- mutate ----
// Silencing a rule is how we prove it is load-bearing. The parent spawns a
// child per mutant (fresh module state, no cross-contamination) with the switch
// flipped off; the child runs the SAME checks and MUST go red.
const MUTANTS = {
    gravity: 'rocks/gems stop falling — the chute cave never drains',
    roll: 'blocked rocks stop levelling out — no pile settles',
    convert: 'fallen gems stay gems — the greed tax vanishes',
    fireSpread: 'fire stops spreading — there is no chain, only a match',
    flyIgnite: 'the firefly stops lighting things — no explosion at all',
    fallKill: 'a falling boulder stops crushing — the hazard is theatre',
}

if (MUT_NAME) {
    if (!(MUT_NAME in MUTANTS)) { console.error(`unknown mutant ${MUT_NAME}`); process.exit(2) }
    CFG[MUT_NAME] = false
    console.log(`\x1b[33mMUTANT ACTIVE: ${MUT_NAME} = false\x1b[0m  (${MUTANTS[MUT_NAME]})`)
}

// --------------------------------------------------------------- ascii map ----
if (mapArg !== null) {
    const { meta, grid } = buildLevel(mapArg)
    console.log(`LEVEL ${mapArg} — ${meta.name}  spawn(${meta.spawn.x},${meta.spawn.y}) exit(${meta.exit.x},${meta.exit.y}) need ${meta.need} time ${meta.timeTicks} proves ${JSON.stringify(meta.proves)}`)
    for (let y = 0; y < H; y++) {
        let line = ''
        for (let x = 0; x < W; x++) {
            const t = grid[y * W + x]
            line += x === meta.spawn.x && y === meta.spawn.y ? '@'
                : x === meta.exit.x && y === meta.exit.y ? 'E'
                    : t === DIRT ? '#' : t === BOULDER ? 'O' : t === DIAMOND ? '*' : t === STEEL ? '=' : t === FIRE ? '~' : '.'
        }
        console.log(line)
    }
    process.exit(0)
}

// run the planner on a fresh game, capturing every event token exactly once.
// playerMove pushes events onto g.events without clearing them, and step() clears
// at its start — so the move's events are read from the slice playerMove appended,
// and the step's events are read whole after step (which reset the buffer).
function runPlanner(levelIdx) {
    const { meta, grid } = buildLevel(levelIdx)
    const g = sim.makeGame(meta, grid)
    const seen = new Set()
    const t0 = Date.now()
    while (!g.end && g.tick < meta.timeTicks) {
        if (g.tick % CFG.moveEvery === 0) {
            const before = g.events.length
            const dir = sim.planStep(g)
            if (dir) sim.playerMove(g, dir)
            for (let k = before; k < g.events.length; k++) seen.add(g.events[k].type)
        }
        sim.step(g)
        for (const e of g.events) seen.add(e.type)
    }
    return { g, meta, grid, seen, cmds: g.cmds, ms: Date.now() - t0 }
}

// a dig-flood-fill: what can the player reach by tunnelling through dirt/air
// from the spawn? Gems are enterable doors; boulder/fire/steel are walls.
function digReachable(meta, grid) {
    const seen = new Uint8Array(W * H)
    const q = [meta.spawn.y * W + meta.spawn.x]
    seen[q[0]] = 1
    for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, y = (i - x) / W
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nx = x + dx, ny = y + dy
            if (nx < 1 || nx >= W - 1 || ny < 1 || ny >= H - 1) continue
            const j = ny * W + nx, t = grid[j]
            if (t === STEEL || t === BOULDER) continue
            if (!seen[j]) { seen[j] = 1; q.push(j) }
        }
    }
    return seen
}

// ------------------------------------------------------- winnability + prove ---
for (let i = 0; i < LEVELS.length; i++) {
    const r = runPlanner(i)
    section(`LEVEL ${i} — ${r.meta.name}`)
    ok(r.g.win === true, `${r.meta.name}: the planner did NOT win (have ${r.g.have}/${r.meta.need}, end=${r.g.end}) — the cave is not winnable`)
    ok(r.g.have >= r.meta.need, `${r.meta.name}: gathered ${r.g.have}, needed ${r.meta.need}`)
    ok(r.g.player.alive, `${r.meta.name}: the planned route died to its own hazards`)
    ok(r.ms < 4000, `${r.meta.name}: planner took ${r.ms} ms — the audit must stay a second`)
    for (const tok of r.meta.proves) {
        ok(r.seen.has(TOKEN[tok]), `${r.meta.name}: advertised '${tok}' (${TOKEN[tok]}) never fired — that mechanic is scenery, not game`)
    }
}

// ---------------------------------------------------------------- reachability ---
{
    section('REACHABILITY AUDIT (heistcheck-style: solvable by construction)')
    for (let i = 0; i < LEVELS.length; i++) {
        const { meta, grid } = buildLevel(i)
        const reach = digReachable(meta, grid)
        let gems = 0
        for (let j = 0; j < W * H; j++) if (grid[j] === DIAMOND && reach[j]) gems++
        ok(gems >= meta.need, `${meta.name}: only ${gems} dig-reachable gems but the quota is ${meta.need}`)
        ok(reach[meta.exit.y * W + meta.exit.x] === 1, `${meta.name}: the exit is NOT dig-reachable from the spawn`)
    }
}

// -------------------------------------------------------------- determinism ----
{
    section('DETERMINISTIC REPLAY (attract mode IS this replay)')
    const { meta, grid } = buildLevel(0)
    const cmds = runPlanner(0).cmds
    const a = sim.replay(meta, grid, cmds)
    const b = sim.replay(meta, grid, cmds)
    ok(sim.stateHash(a) === sim.stateHash(b), 'two replays of one script disagree — the sim is not a pure function')
    ok(a.win === true && a.have >= meta.need, `the replayed script did not reproduce the win (${a.have}/${meta.need})`)
    const tampered = cmds.slice(0, 3).concat(cmds.slice(4))       // drop one mid-run move
    const c = sim.replay(meta, grid, tampered)
    ok(sim.stateHash(c) !== sim.stateHash(a), 'the hash ignores a dropped move — the determinism check could not catch a desync')
}

// ------------------------------------------------------------------ rule pins ----
{
    section('RULE PINS (each is the game, not a mood)')

    const mk = (ops, player) => {
        const g = new Uint8Array(W * H).fill(DIRT)
        for (let x = 0; x < W; x++) { g[x] = STEEL; g[(H - 1) * W + x] = STEEL }
        for (let y = 0; y < H; y++) { g[y * W] = STEEL; g[y * W + W - 1] = STEEL }
        for (const [x, y, t] of ops) g[y * W + x] = t
        const meta = { spawn: { x: player[0], y: player[1] }, exit: { x: player[0], y: player[1] }, need: 1, timeTicks: 600, flies: [] }
        const gm = sim.makeGame(meta, g)
        return gm
    }

    // a resting boulder beside the player does NOT crush them
    {
        const g = mk([[4, 10, BOULDER], [3, 10, EMPTY]], [5, 10])   // rests on the dirt floor at y11
        for (let t = 0; t < 40; t++) sim.step(g)
        ok(g.player.alive, 'a RESTING boulder killed the player — "falling boulders" became "any boulder"')
        ok(g.grid[10 * W + 4] === BOULDER, 'the resting boulder drifted on its own — gravity has a false positive')
    }
    // a falling boulder DOES crush the player
    {
        const g = mk([[6, 6, BOULDER], [6, 7, EMPTY], [6, 8, EMPTY], [6, 9, EMPTY], [6, 10, EMPTY]], [6, 10])
        let died = -1
        for (let t = 0; t < 40; t++) { sim.step(g); if (!g.player.alive && died < 0) died = t }
        ok(died >= 0, 'a boulder fell THROUGH the standing player without crushing them — fallKill is dead')
    }
    // a gem that falls and lands turns to dirt
    {
        const g = mk([[8, 6, DIAMOND], [8, 7, EMPTY], [8, 8, EMPTY], [8, 9, EMPTY]], [2, 2])
        for (let t = 0; t < 40; t++) sim.step(g)
        ok(g.grid[9 * W + 8] === DIRT, 'a fallen gem did not become dirt — the greed tax (the reason not to over-dig) is gone')
    }
    // a rock blocked below rolls off an open shoulder
    {
        const g = mk([[12, 6, BOULDER], [12, 7, BOULDER], [13, 6, EMPTY], [13, 7, EMPTY]], [2, 2])
        g.grid[8 * W + 12] = DIRT; g.grid[8 * W + 13] = EMPTY   // floor under the column, a hole to the right
        let rolled = false
        for (let t = 0; t < 30 && !rolled; t++) { sim.step(g); if (g.events.some(e => e.type === 'roll')) rolled = true }
        ok(rolled, 'a blocked boulder did not level out sideways — rock heaps would grow a tower instead of a slope')
    }
    // a fire chain spreads, then burns out to empty
    {
        const g = mk([[20, 20, EMPTY]], [2, 2])
        for (let x = 18; x <= 24; x++) for (let y = 18; y <= 22; y++) g.grid[y * W + x] = DIRT
        g.grid[20 * W + 21] = FIRE; g.burn[20 * W + 21] = CFG.burn
        let spread = false
        for (let t = 0; t < CFG.burn * 6 + 20; t++) {
            sim.step(g)
            if (g.events.some(e => e.type === 'spread')) spread = true
        }
        ok(spread, 'fire did not spread to neighbours — there is no chain reaction')
        let dirtLeft = 0
        for (let x = 18; x <= 24; x++) for (let y = 18; y <= 22; y++) if (g.grid[y * W + x] === DIRT) dirtLeft++
        ok(dirtLeft === 0, `the fire left ${dirtLeft} unburnt dirt — the chain dies before consuming the pocket`)
    }
    // fire never crosses steel (a wall that only stops the low road is no wall)
    {
        const g = mk([], [2, 2])
        for (let x = 15; x <= 25; x++) for (let y = 5; y <= 16; y++) g.grid[y * W + x] = DIRT
        for (let y = 1; y <= H - 2; y++) g.grid[y * W + 20] = STEEL         // a steel wall, full height, no way around
        g.grid[10 * W + 17] = FIRE; g.burn[10 * W + 17] = CFG.burn
        for (let t = 0; t < CFG.burn * 12 + 40; t++) sim.step(g)
        ok(g.grid[10 * W + 20] === STEEL, 'fire burned through steel — the one surface a chain respects is gone')
        ok(g.grid[10 * W + 22] === DIRT, 'fire crossed the steel wall — a wall is no longer a strategy')
        ok(g.grid[10 * W + 16] !== DIRT, 'fire never spread on the lit side of the wall — the chain itself is dead')
    }
    // the firefly moves and ignites what it touches
    {
        const g = mk([], [2, 2])
        for (let x = 10; x <= 16; x++) for (let y = 3; y <= 9; y++) g.grid[y * W + x] = DIRT
        g.level.flies = [{ x: 13, y: 6, dir: 0 }]
        g.flies = [{ id: 0, x: 13, y: 6, dir: 0 }]
        const start = { x: 13, y: 6 }
        let ignited = false, moved = false
        for (let t = 0; t < 12; t++) { sim.step(g); if (g.events.some(e => e.type === 'ignite')) ignited = true; if (g.flies[0].x !== start.x || g.flies[0].y !== start.y) moved = true }
        ok(ignited, 'the firefly set nothing alight — the explosion automaton is inert')
        ok(moved, 'the firefly never moved — its cycle is frozen')
    }
    // the quota binds: reaching the exit short is not a win
    {
        const { meta, grid } = buildLevel(0)
        const g = sim.makeGame(meta, grid)
        g.player.x = 35; g.player.y = 3
        g.have = meta.need - 1
        sim.playerMove(g, 'ArrowRight')                                   // step onto the exit, one short
        ok(!g.win && g.end === null && g.player.alive, 'stepping onto the exit one gem SHORT was allowed to win — the quota is decorative')
        g.player.x = 35; g.player.y = 3; g.have = meta.need
        sim.playerMove(g, 'ArrowRight')
        ok(g.win === true && g.end === 'clear', 'the exit did not open when the quota WAS met — the win path is broken')
    }
}

// -------------------------------------------------------------- mutation gate ----
if (MUT) {
    section('MUTATIONS — each silenced rule MUST turn a real check red')
    for (const name of Object.keys(MUTANTS)) {
        const child = spawnSync(process.execPath, [process.argv[1]], {
            env: { ...process.env, DASH_MUT: name },
            encoding: 'utf8',
        })
        const caught = child.status !== 0
        console.log(`  mut ${name}: ${caught ? 'caught by the audit' : 'SURVIVED (BAD)'}`)
        ok(caught, `mutant '${name}' SURVIVED — a check has quietly stopped touching this rule`)
    }
}

console.log(`\ndashcheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach(f => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
