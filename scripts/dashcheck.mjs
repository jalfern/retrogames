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

const { W, H, EMPTY, DIRT, BOULDER, DIAMOND, STEEL, FIRE, AMO_HEAD, AMO_BODY, PUSHWALL, CFG } = sim

const TOKEN = {
    dig: 'dig', fell: 'fell', roll: 'roll', convert: 'gemlost', fly: 'ignite', burn: 'spread',
    push: 'push', crush: 'crush', amoeba: 'amoeba', dissolve: 'dissolve',
    gait: 'amoTurn', pour: 'amoDrop', vise: 'mirror',        // #2428 variant receipts
    fork: 'amoFork',                                          // #2444 multi-head receipt
}

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
    flyTravel: 'the firefly stops holding its heading — the orbit never reaches the seam, the corridor stays empty',
    fallKill: 'a falling boulder stops crushing — the hazard is theatre',
    amoeba: 'the slime stops growing — the wave never crosses its pocket, never eats the bait',
    amoTurn: 'the two-phase head stops cornering — the wave leaks perpendiculars like classic and never walks its square-corner gait',
    amoDrop: 'the dropper stops preferring down — it never pours into the shaft below it',
    amoFork: 'the fork head stops planting siblings — the wave grows one finger like classic and never wraps the pillar (multi-head is dead)',
    push: 'push walls stop sliding — SLIME VAULT stays bolted shut',
    pushCrush: 'walls stop crushing rocks — the boulder chokes the choke corridor forever',
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
                    : t === DIRT ? '#' : t === BOULDER ? 'O' : t === DIAMOND ? '*' : t === STEEL ? '=' : t === FIRE ? '~'
                        : t === AMO_HEAD || t === AMO_BODY ? 's' : t === PUSHWALL ? '+' : '.'
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

// ------------------------------------------ SLIME & BOLTS (#2411) rule pins ----
{
    section('SLIME & BOLTS (#2411) — the amoeba wave and the push wall, pinned as rules')

    const mk = (ops, player) => {
        const g = new Uint8Array(W * H).fill(DIRT)
        for (let x = 0; x < W; x++) { g[x] = STEEL; g[(H - 1) * W + x] = STEEL }
        for (let y = 0; y < H; y++) { g[y * W] = STEEL; g[y * W + W - 1] = STEEL }
        for (const [x, y, t] of ops) g[y * W + x] = t
        const meta = { spawn: { x: player[0], y: player[1] }, exit: { x: player[0], y: player[1] }, need: 1, timeTicks: 600, flies: [] }
        return sim.makeGame(meta, g)
    }
    const isAmo = (t) => t === AMO_HEAD || t === AMO_BODY

    // the wave crosses open space eastward and its tail dissolves behind it
    {
        const g = mk([[10, 5, AMO_HEAD], [11, 5, EMPTY], [12, 5, EMPTY], [13, 5, EMPTY], [14, 5, EMPTY]], [2, 2])
        let grewAt = -1
        for (let t = 0; t < CFG.amoEvery * 4 && grewAt < 0; t++) {
            sim.step(g)
            if (isAmo(g.grid[5 * W + 11])) grewAt = t
        }
        ok(grewAt >= 0, 'the slime never grew into the open cell ahead — the amoeba automaton is inert')
        for (let t = 0; t < CFG.amoEvery * (CFG.amoGens + 8); t++) sim.step(g)
        ok(!isAmo(g.grid[5 * W + 11]), 'the wave left a permanent stain — bodies must expire or the cave just fills')
        ok(!isAmo(g.grid[5 * W + 14]), 'the wave is still occupying the far cell after its generations ran out — the tail never catches up')
    }
    // a diamond in the wave path dissolves — and is NOT collected
    {
        const g = mk([[10, 5, AMO_HEAD], [11, 5, EMPTY], [12, 5, DIAMOND]], [2, 2])
        let dissolved = false
        for (let t = 0; t < CFG.amoEvery * 4 + 4 && !dissolved; t++) {
            sim.step(g)
            if (g.events.some(e => e.type === 'dissolve')) dissolved = true
        }
        ok(dissolved, 'the slime touched a diamond and nothing happened — the eating rule is gone')
        ok(isAmo(g.grid[5 * W + 12]), 'the diamond cell did not become slime — the wave stopped short')
        ok(g.have === 0, 'a slime-dissolved gem paid out — greed should get nothing from the goo')
    }
    // the slime cannot eat through dirt; and it branches perpendicular when shut in
    {
        const g = mk([[10, 5, AMO_HEAD], [10, 4, EMPTY]], [2, 2])   // east stays DIRT
        let sideward = false
        for (let t = 0; t < CFG.amoEvery * 3 + 2; t++) {
            sim.step(g)
            if (isAmo(g.grid[4 * W + 10])) sideward = true
        }
        ok(!isAmo(g.grid[5 * W + 11]), 'amoeba grew into DIRT — uncarved rock must be a wall to the wave')
        ok(sideward, 'a wall-shut head never branched sideways — the blob cannot flow around corners')
    }
    // engulf both ways: walking into slime dies, slime growing onto the player dies
    {
        const g = mk([[10, 5, AMO_HEAD], [11, 5, EMPTY], [12, 5, EMPTY]], [12, 5])
        g.player.x = 11; g.player.y = 5; g.grid[5 * W + 11] = EMPTY
        sim.playerMove(g, 'ArrowLeft')                                  // step onto the seeded cell
        ok(!g.player.alive && g.deathCause === 'amoeba', 'walking into slime was survivable — the pocket is theatre, not hazard')
        const h = mk([[10, 5, AMO_HEAD], [11, 5, EMPTY]], [11, 5])
        let engulfed = -1
        for (let t = 0; t < CFG.amoEvery * 2 + 2 && engulfed < 0; t++) { sim.step(h); if (!h.player.alive) engulfed = t }
        ok(engulfed >= 0 && h.deathCause === 'amoeba', 'the wave grew over a standing player without engulfing them')
    }
    // a bolt slides east one cell per shove; the player follows into the vacated cell
    {
        const g = mk([[6, 5, PUSHWALL], [7, 5, EMPTY]], [5, 5])
        const moved = sim.playerMove(g, 'ArrowRight')
        ok(moved && g.grid[5 * W + 6] === EMPTY && g.grid[5 * W + 7] === PUSHWALL, 'the shove did not slide the wall — push is dead')
        ok(g.player.x === 6 && g.player.y === 5, 'the player did not step into the vacated cell — the shove is one-way theatre')
        ok(g.events.some(e => e.type === 'push'), 'the wall moved but no push event fired — the proves-token cannot see the mechanic')
    }
    // BD lifts nothing: a wall below you does not slide up when you shove it
    {
        const g = mk([[6, 4, PUSHWALL]], [6, 5])
        const moved = sim.playerMove(g, 'ArrowUp')
        ok(!moved && g.grid[4 * W + 6] === PUSHWALL && g.player.y === 5, 'a push wall slid upward — gravity law broken, nothing gets lifted')
    }
    // the shove crushes the rock in its path — and a crushed gem pays nothing
    {
        const g = mk([[6, 5, PUSHWALL], [7, 5, BOULDER], [8, 5, EMPTY]], [5, 5])
        sim.playerMove(g, 'ArrowRight')
        ok(g.grid[5 * W + 7] === PUSHWALL, 'the wall stopped at a boulder instead of crushing it — the choke stays choked')
        ok(g.events.some(e => e.type === 'crush' && e.kind === BOULDER), 'a crushed boulder fired no event — the gate cannot see the crush')
        const h = mk([[6, 5, PUSHWALL], [7, 5, DIAMOND], [8, 5, EMPTY]], [5, 5])
        sim.playerMove(h, 'ArrowRight')
        ok(h.grid[5 * W + 7] === PUSHWALL && h.have === 0, 'a gem crushed under the wall paid out — destroyed loot must stay destroyed')
    }
    // a resting bolt is scenery, a falling bolt is death (the boulder law, doubled)
    {
        const g = mk([[6, 6, PUSHWALL], [6, 7, DIRT]], [6, 8])
        g.grid[9 * W + 6] = DIRT
        for (let t = 0; t < 40; t++) sim.step(g)
        ok(g.player.alive && g.grid[6 * W + 6] === PUSHWALL, 'a resting pushwall killed the player or drifted — the moving/not-moving law is gone')
        const h = mk([[6, 4, PUSHWALL], [6, 5, EMPTY], [6, 6, EMPTY], [6, 7, EMPTY]], [6, 7])
        let died = -1
        for (let t = 0; t < 40 && died < 0; t++) { sim.step(h); if (!h.player.alive) died = t }
        ok(died >= 0 && h.deathCause === 'pushwall', 'a pushwall fell through the player without crushing them — falling bolts are free')
    }
    // SLIME VAULT end-to-end: the bolts really work the vault and the slime
    // stays in its pocket across the whole planner win-run.
    {
        const { meta, grid } = buildLevel(4)
        const g = sim.makeGame(meta, grid)
        let pushes = 0, crushes = 0, fellWalls = 0, viol = null
        const tally = (e) => {
            if (e.type === 'push') pushes++
            else if (e.type === 'crush') crushes++
            else if (e.type === 'fell' && e.kind === PUSHWALL) fellWalls++
        }
        while (!g.end && g.tick < meta.timeTicks) {
            const before = g.events.length                       // capture move events before step() clears them
            if (g.tick % CFG.moveEvery === 0) { const d = sim.planStep(g); if (d) sim.playerMove(g, d) }
            for (let k = before; k < g.events.length; k++) tally(g.events[k])
            sim.step(g)
            for (const e of g.events) tally(e)
            for (let i = 0; i < g.grid.length; i++) {
                if (!isAmo(g.grid[i])) continue
                const x = i % W, y = (i - x) / W
                if (!(x >= 24 && x <= 28 && y >= 13 && y <= 16)) viol = viol || `tick ${g.tick} slime at ${x},${y}`
            }
        }
        ok(g.win === true, `SLIME VAULT was not winnable end-to-end (have ${g.have}/${meta.need}, end ${g.end})`)
        ok(pushes >= 4, `only ${pushes} pushes across the win-run — the vault and choke bolts were not worked`)
        ok(crushes === 1, `expected exactly 1 crush on the route, saw ${crushes} — the boulder choke changed shape`)
        ok(fellWalls >= 2, `only ${fellWalls} pushwalls dropped into pits — a bolt that never falls never opens the tube`)
        ok(!viol, `the slime left its pocket (${viol}) — the harvest and the tube are no longer provably safe`)
    }
}

// ------------------------------------------------ AMOEBA FAMILY (#2428) pins ----
{
    section('AMOEBA FAMILY (#2428) — the gait, the dropper, the vise, and the frozen old caves')

    const mk = (ops, player, lv = {}) => {
        const g = new Uint8Array(W * H).fill(DIRT)
        for (let x = 0; x < W; x++) { g[x] = STEEL; g[(H - 1) * W + x] = STEEL }
        for (let y = 0; y < H; y++) { g[y * W] = STEEL; g[y * W + W - 1] = STEEL }
        for (const [x, y, t] of ops) g[y * W + x] = t
        const meta = { spawn: { x: player[0], y: player[1] }, exit: { x: player[0], y: player[1] }, need: 1, timeTicks: 600, flies: [], ...lv }
        return sim.makeGame(meta, g)
    }
    const isAmo = (t) => t === AMO_HEAD || t === AMO_BODY
    const run = (g, passes) => {
        const target = sim.CFG.amoEvery * passes + 2
        for (let t = 0; t < target && g.player.alive && !g.end; t++) sim.step(g)
    }

    // TWO-PHASE GAIT: shut in, the head CORNERS (right first) and the new
    // heading persists — the children march the new way. Silence the law and
    // the head leaks both perpendiculars pointing the old way instead.
    {
        const open = [[11, 5], [12, 5], [13, 5], [14, 5], [14, 6], [14, 7], [14, 8], [15, 7]]
        const g = mk([[10, 5, AMO_HEAD], ...open.map(([x, y]) => [x, y, EMPTY])], [2, 2], { amoebaDir: [1, 0], amoebaVariant: 'twophase' })
        const turned = []
        const tickTo = sim.CFG.amoEvery * 9
        for (let t = 0; t < tickTo && g.player.alive; t++) { sim.step(g); for (const e of g.events) if (e.type === 'amoTurn') turned.push(e) }
        ok(turned.length >= 1, 'a two-phase head shut at a wall never CORNERED — the BD II gait is dead')
        ok(isAmo(g.grid[8 * W + 14]), 'the two-phase head turned but its children did not march on (persist is gone) — the wave would stop at every corner')
        ok(!isAmo(g.grid[7 * W + 15]), 'the two-phase wave leaked east past its corner — it turns as a creature or not at all')
        ok(!isAmo(g.grid[4 * W + 14]), 'the two-phase wave leaked both perpendiculars like classic — the single persistent corner is the whole point')
    }
    // THE DROPPER: down is the first offer; when the floor arrives it resumes
    // its lateral heading — slime poured down a shaft.
    {
        const g = mk([[10, 5, AMO_HEAD], [11, 5, EMPTY], [10, 6, EMPTY], [10, 7, EMPTY], [11, 7, EMPTY], [12, 7, EMPTY]], [2, 2], { amoebaDir: [1, 0], amoebaVariant: 'drop' })
        const drops = []
        for (let t = 0; t < sim.CFG.amoEvery * 4 + 2 && g.player.alive; t++) { sim.step(g); for (const e of g.events) if (e.type === 'amoDrop') drops.push(e) }
        ok(drops.length >= 2, 'the dropper claimed sideways while open ground yawned BELOW it — down-first is the dropper law')
        ok(isAmo(g.grid[7 * W + 10]), 'the dropper never reached the shaft floor — it is not pouring')
        ok(isAmo(g.grid[7 * W + 11]), 'the dropper stalled at the floor instead of resuming its heading — poured slime keeps flowing')
    }
    // THE VISE: two classic waves, dirs 180° apart, front each other down a
    // corridor. While open ground remains they claim in the same passes (the
    // vise receipt), each front drives at least three cells, and neither wave
    // ever claims through the other — slime is solid to slime.
    {
        const corridor = []
        for (let x = 11; x <= 16; x++) corridor.push([x, 5, EMPTY])
        const g = mk(corridor, [2, 2], {
            amoebas: [
                { cells: [[10, 5]], dir: [1, 0], variant: 'classic' },
                { cells: [[17, 5]], dir: [-1, 0], variant: 'classic' },
            ],
        })
        const fronts = []
        for (let t = 0; t < sim.CFG.amoEvery * 5 + 2 && g.player.alive; t++) {
            sim.step(g)
            for (const e of g.events) if (e.type === 'mirror') fronts.push(g.amoPass)
        }
        ok(fronts.length >= 2, `the mirrored pair shared only ${fronts.length} closing passes — the vise does not close`)
        const g2 = mk(corridor, [2, 2], {
            amoebas: [
                { cells: [[10, 5]], dir: [1, 0], variant: 'classic' },
                { cells: [[17, 5]], dir: [-1, 0], variant: 'classic' },
            ],
        })
        let maxA = 10, minB = 17, crossed = false
        for (let t = 0; t < sim.CFG.amoEvery * 5 + 2 && g2.player.alive; t++) {
            sim.step(g2)
            for (const e of g2.events) {
                if (e.type !== 'amoeba') continue
                if (e.w === 1 && e.x >= minB) crossed = true
                if (e.w === 2 && e.x <= maxA) crossed = true
                if (e.w === 1) maxA = Math.max(maxA, e.x)
                if (e.w === 2) minB = Math.min(minB, e.x)
            }
        }
        ok(maxA - 10 >= 3 && 17 - minB >= 3, `fronts advanced ${maxA - 10}/${17 - minB} — a vise front that stalls at 2 barely closes`)
        ok(!crossed, 'one wave claimed THROUGH the other — solid slime stops slime; the vise halts, it never mixes')
    }
    // NO DERBY: variant waves still obey every #2411 containment law. Across
    // the REAL planner win-run of GOO GALLERY the slime never leaves its four
    // pockets, and the harvest at row 18 stays clean.
    {
        const { meta, grid } = buildLevel(5)
        const g = sim.makeGame(meta, grid)
        let viol = null
        while (!g.end && g.tick < meta.timeTicks) {
            if (g.tick % CFG.moveEvery === 0) { const d = sim.planStep(g); if (d) sim.playerMove(g, d) }
            sim.step(g)
            for (let i = 0; i < g.grid.length; i++) {
                if (!isAmo(g.grid[i])) continue
                const x = i % W, y = (i - x) / W
                const inside = (x >= 6 && x <= 16 && y >= 4 && y <= 5) || (x >= 15 && x <= 16 && y >= 6 && y <= 8) ||
                    (x === 30 && y >= 2 && y <= 8) || (x >= 20 && x <= 34 && y >= 12 && y <= 13)
                if (!inside) viol = viol || `tick ${g.tick} slime at ${x},${y}`
            }
        }
        ok(!viol, `variant slime left its pockets (${viol}) — the harvest is no longer provably safe`)
        ok(g.win === true, `GOO GALLERY was not winnable with all three variants live (have ${g.have}/${meta.need}, end ${g.end})`)
    }
    // THE FROZEN FLOOR: the five pre-#2428 caves replay to their recorded
    // hashes — the variant state never perturbs a classic wave, byte for byte.
    {
        const recorded = { 0: 'e2536bb0', 1: 'afc3579', 2: 'fb495932', 3: '580a2db5', 4: 'fd18f2fb' }
        for (let i = 0; i <= 4; i++) {
            const { meta, grid } = buildLevel(i)
            const g = sim.makeGame(meta, grid)
            sim.planRun(g)
            const r = sim.replay(meta, grid, g.cmds)
            ok(sim.stateHash(r) === recorded[i], `LEVEL ${i} (${meta.name}) drifted off its recorded hash (${sim.stateHash(r)} ≠ ${recorded[i]}) — the variant refactor perturbed a classic cave`)
            ok(g.amoExt === false, `LEVEL ${i} claims variant state — old caves must not fold direction into their hash`)
        }
        const b5 = buildLevel(5)
        ok(sim.makeGame(b5.meta, b5.grid).amoExt === true, 'GOO GALLERY does not flag variant state — its hash would under-observe divergence')
    }
    // lids lie check for GOO GALLERY (same #2417 law): every marked dirt cap
    // must really be dirt capping pocket air (or seeded slime).
    {
        const { meta, grid } = buildLevel(5)
        const lids = meta.lids || []
        ok(lids.length > 0, 'GOO GALLERY ships no lid telegraph — three open pockets hide under plain rock')
        ok(lids.every(([x, y]) => grid[y * W + x] === DIRT && grid[(y + 1) * W + x] !== DIRT),
            'a GOO GALLERY lid-marked cell is not dirt capping pocket air — the green telegraph would sit over the wrong rock')
    }
}

// ------------------------------------------------ MULTI-HEAD AMOEBA (#2444) pins ----
{
    section('MULTI-HEAD AMOEBA (#2444) — one origin, several fingers: the fork, the wrap, the cap, the dissolve')

    const mk2 = (ops, player, lv = {}) => {
        const g = new Uint8Array(W * H).fill(DIRT)
        for (let x = 0; x < W; x++) { g[x] = STEEL; g[(H - 1) * W + x] = STEEL }
        for (let y = 0; y < H; y++) { g[y * W] = STEEL; g[y * W + W - 1] = STEEL }
        for (const [x, y, t] of ops) g[y * W + x] = t
        const meta = { spawn: { x: player[0], y: player[1] }, exit: { x: player[0], y: player[1] }, need: 1, timeTicks: 600, flies: [], ...lv }
        return sim.makeGame(meta, g)
    }
    const isAmo2 = (t) => t === AMO_HEAD || t === AMO_BODY

    // THE WRAP: a vertical wall (col 13, rows 3..8) cuts an open room, with a gap
    // at the top and bottom. A single-finger wave stalls at the wall; a fork wave
    // sprouts heads that corner and reach the far side through a gap. The wall
    // cells themselves must stay DIRT — slime eats only EMPTY/DIAMOND. The player
    // parks in a sealed nook so its death never truncates the growth we measure.
    {
        const room = [[13, 2, EMPTY], [13, 9, EMPTY]]   // the two gaps over/under the wall
        for (let x = 10; x <= 18; x++) for (let y = 2; y <= 9; y++) if (x !== 13) room.push([x, y, EMPTY])
        const wall = [[13, 3], [13, 4], [13, 5], [13, 6], [13, 7], [13, 8]]   // stay DIRT; coords for the assertion
        const g = mk2(room, [2, 2], { amoebaDir: [1, 0], amoebaVariant: 'fork', amoebas: [{ cells: [[11, 6]], dir: [1, 0], variant: 'fork' }] })
        const forks = []
        let maxFronts = 1, distinctDirsEver = new Set(), pastAny = false, peak = 0, cleared = false
        for (let t = 0; t < sim.CFG.amoEvery * 60; t++) {
            sim.step(g)
            for (const e of g.events) if (e.type === 'amoFork') forks.push(e)
            let n = 0, frontsNow = 0, dirs = new Set()
            for (let i = 0; i < g.grid.length; i++) {
                if (g.grid[i] === AMO_HEAD) { dirs.add(g.amoHead[i]); if (g.amoGen[i] === g.amoPass) frontsNow++ }
                if (isAmo2(g.grid[i])) {
                    n++
                    const x = i % W, y = (i - x) / W
                    if (x >= 14) pastAny = true
                }
            }
            maxFronts = Math.max(maxFronts, frontsNow)
            peak = Math.max(peak, n)
            if (peak > 6 && n === 0) cleared = true
            distinctDirsEver = new Set([...distinctDirsEver, ...dirs])
        }
        ok(forks.length >= 1, 'the fork head never planted a sibling — the wave grew one finger; multi-head is dead')
        ok(maxFronts >= 2, `the wave never held more than ${maxFronts} front head(s) at once — it is single-fingered, not multi-head`)
        ok(distinctDirsEver.size >= 2, `the fingers never diverged in heading (${[...distinctDirsEver]}) — a blob that only grows one way is a line, not a creature`)
        ok(pastAny, 'the wave never reached the far side of the wall — a fork wave corners and grows AROUND an obstacle')
        ok(wall.every(([x, y]) => g.grid[y * W + x] === DIRT), 'slime grew THROUGH the rock wall — growth claims only EMPTY/DIAMOND, never DIRT')
        ok(maxFronts <= sim.CFG.amoForkMax, `the wave grew ${maxFronts} front heads over the cap ${sim.CFG.amoForkMax} — the containment budget is not a hard ceiling`)
        ok(cleared, `the fork wave never dissolved (peak ${peak}) — generations must empty it (the #2411 never-fills law holds even for multi-head)`)
    }

    // CONTAINMENT on the real cave: across the planner win-run of FORK BASIN the
    // blob never crosses its dirt ring, never touches the harvest seam at row 18
    // or the exit, and the cave is winnable with the fork live.
    {
        const { meta, grid } = buildLevel(6)
        const g = sim.makeGame(meta, grid)
        let viol = null, peak = 0
        while (!g.end && g.tick < meta.timeTicks) {
            if (g.tick % CFG.moveEvery === 0) { const d = sim.planStep(g); if (d) sim.playerMove(g, d) }
            sim.step(g)
            let n = 0
            for (let i = 0; i < g.grid.length; i++) {
                if (!isAmo2(g.grid[i])) continue
                n++
                const x = i % W, y = (i - x) / W
                if (!(x >= 22 && x <= 28 && y >= 4 && y <= 8)) viol = viol || `tick ${g.tick} slime at ${x},${y}`
            }
            peak = Math.max(peak, n)
        }
        ok(!viol, `fork slime escaped FORK BASIN's pocket (${viol}) — the harvest and exit are no longer provably safe`)
        ok(peak > 6, `the fork blob only reached ${peak} cells — too timid to read as a multi-headed creature`)
        ok(g.win === true, `FORK BASIN was not winnable with the fork live (have ${g.have}/${meta.need}, end ${g.end})`)
        ok(g.amoExt === true, 'FORK BASIN does not flag variant state — its hash would under-observe divergence')
    }
}

// ------------------------------------------------------------ FLY RELEASE (#2364) ----
{
    section('FLY RELEASE (#2364) — momentum patrol out of the pit, cave still cannot burn')

    // (a) the escape: the fly's first eastbound pass bores the dust seam and
    // enters the roof corridor; the seam cells burn; the shuttle keeps coming
    // back — a one-off lurch is not a patrol.
    {
        const { meta, grid } = buildLevel(3)
        const g = sim.makeGame(meta, grid)
        let escapeTick = -1, bored = false, prevIn = false, visits = 0
        for (let t = 0; t < 140; t++) {
            sim.step(g)
            const f = g.flies[0]
            if (escapeTick < 0 && f.x >= 17) escapeTick = g.tick
            for (const e of g.events) if (e.type === 'ignite' && e.y === 8 && (e.x === 15 || e.x === 16)) bored = true
            const inC = f.x >= 17
            if (inC && !prevIn) visits++
            prevIn = inC
        }
        ok(escapeTick >= 1 && escapeTick <= 10, `the fly did not reach the corridor within 10 ticks (got ${escapeTick}) — flyTravel or the seam is broken`)
        ok(bored, 'the seam cells never ignited — the escape door was never bored open')
        ok(visits >= 3, `the patrol entered the corridor only ${visits}× in 140 ticks — the shuttle dead-ended`)
    }

    // (b) containment invariant across the REAL planner win-run: the fly stays
    // inside pit ∪ seam ∪ corridor every tick — neither fire nor fly can ever
    // reach the harvest at row 18.
    {
        const { meta, grid } = buildLevel(3)
        const g = sim.makeGame(meta, grid)
        let viol = null
        while (!g.end && g.tick < meta.timeTicks) {
            if (g.tick % CFG.moveEvery === 0) { const d = sim.planStep(g); if (d) sim.playerMove(g, d) }
            sim.step(g)
            const f = g.flies[0]
            const zone = (f.x >= 11 && f.x <= 28 && f.y === 8) || (f.x >= 11 && f.x <= 14 && f.y >= 4 && f.y <= 8)
            if (!zone) viol = `tick ${g.tick} fly at ${f.x},${f.y}`
        }
        ok(g.win === true && g.have >= meta.need, `FLY PIT is not winnable with the corridor open (have ${g.have}/${meta.need}, end ${g.end})`)
        ok(!viol, `the fly left pit∪seam∪corridor during a win-run (${viol}) — the harvest could burn`)
    }

    // (c) the gap game: the harness places the player at the shaft top under
    // the floor gap (a real player digs there — the audit tests the collision
    // law, not the dig). A climb that times the passes survives; a climb that
    // stands in the corridor in the fly's path dies.
    const climb = (upTick, downTick) => {
        const { meta, grid } = buildLevel(3)
        const g = sim.makeGame(meta, grid)
        g.player.x = 22; g.player.y = 10
        for (let t = 0; t < 120 && g.player.alive && !g.end; t++) {
            if (g.tick === upTick) { sim.playerMove(g, 'ArrowUp'); sim.playerMove(g, 'ArrowUp') }   // shaft -> gap -> corridor
            if (downTick >= 0 && g.tick === downTick) sim.playerMove(g, 'ArrowDown')                 // back down the shaft
            sim.step(g)
        }
        return g.player.alive
    }
    // The corridor column stays lit for a few ticks after the fly passes (it
    // ignites what it touches — even air), so the winning line threads
    // between the trail cooling and the next pass arriving.
    ok(climb(51, 56), 'a climb through the gap between two fly passes was fatal — the game of chicken has no winning line')
    ok(!climb(44, -1), 'a player standing in the corridor survived the fly running over them — the gap is theatre, not hazard')

    // (d) #2374 readability data pin: the dust-seam cells the painter tints
    // must stay exactly the two DIRT cells the fly can bore open, in the pit's
    // east wall. If someone later re-carves the seam, the old sparkle would
    // mislead the player — and this check goes red instead.
    {
        const { meta, grid } = buildLevel(3)
        const dust = (meta.dust || []).map(([x, y]) => `${x},${y}`).sort().join('|')
        ok(dust === '15,8|16,8', `FLY PIT dust marks drifted off the bored seam (got "${dust}") — the readability tint lies`)
        const allDirt = (meta.dust || []).every(([x, y]) => grid[y * sim.W + x] === DIRT)
        ok(allDirt, 'a dust-marked cell is not DIRT — the seam must stay ignitable, not steel')
    }

    // (e) #2417 readability data pins: the bolt arrows and the pocket-lid
    // green are painted from meta, NOT read off the grid — so meta must stay
    // truthful about the vault. Bolts = exactly the pushwalls, each giving
    // east into a pit or boulder; lids = the whole dirt row capping the slime
    // pocket, two cells under the tube. Re-carve the vault and these go red
    // instead of the cues quietly starting to lie.
    {
        const { meta, grid } = buildLevel(4)
        const bolts = meta.bolts || []
        const walls = []
        for (let y = 0; y < sim.H; y++) for (let x = 0; x < sim.W; x++) if (grid[y * sim.W + x] === PUSHWALL) walls.push(`${x},${y}`)
        const bs = bolts.map(([x, y]) => `${x},${y}`).sort().join('|')
        ok(bs === walls.sort().join('|'), `SLIME VAULT bolt marks (${bs}) drifted off its pushwalls (${walls.join('|')}) — an arrow on a cell that cannot move is a lie`)
        ok(bolts.every(([, , d]) => d === 'E'), 'a vault bolt is marked to give a direction other than east — gravity holds every other face')
        ok(bolts.every(([x, y, d]) => d === 'E' && (grid[y * sim.W + x + 1] === EMPTY || grid[y * sim.W + x + 1] === BOULDER)), 'a bolt marked EAST has a wall on its give side — the arrow promises a slide that cannot happen')
        const lids = meta.lids || []
        const ls = lids.map(([x, y]) => `${x},${y}`).sort().join('|')
        ok(ls === '24,12|25,12|26,12|27,12|28,12', `pocket-lid marks drifted (got "${ls}") — the green telegraph would sit over the wrong rock`)
        ok(lids.every(([x, y]) => grid[y * sim.W + x] === DIRT && grid[(y + 1) * sim.W + x] === EMPTY), 'a lid-marked cell is not DIRT over pocket air — the telegraph must cap the pocket, not hover beside it')
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
