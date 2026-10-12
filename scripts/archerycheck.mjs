// ARENA ARCHERY — the Node audit. No browser: this imports the SAME sim.js
// and levels.js the tab mounts and proves the issue's two muscles before a
// pixel is painted:
//
//   - ballistics: the 45° closed form r = v²/g is pinned to the cell, and
//     the solver's own predictHit is held against the real integrator,
//   - stuck arrows as terrain: stick, knock-out chain, pull-back, and an
//     EXACT arrow ledger asserted every single tick of every match.
//
// Plus the house rules: P1-before-P2 input stamp (two players, one
// keyboard — the lode lesson), replay-hash determinism, a bot that LOSES
// on purpose on both arenas, and the slack rule: the autopilot still wins
// with one fewer arrow of quiver AND the foe gifted the first point.
//
//   npm run archerycheck              the audit (~1 s)
//   npm run archerycheck -- --mutate  + six mutants that MUST die
//   npm run archerycheck -- --arena 1 dump an arena as ASCII
import { ARENAS_COUNT, buildArena } from '../src/games/ArenaArchery/levels.js'
import {
    CFG, makeGame, step, botInput, recordMatch, replay, stateHash,
} from '../src/games/ArenaArchery/sim.js'

const args = process.argv.slice(2)
const MUT = args.includes('--mutate')
const arenaArg = args.includes('--arena') ? +args[args.indexOf('--arena') + 1] : null

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

const CELL = (t) => (t === 1 ? '#' : '.')
if (arenaArg !== null) {
    const b = buildArena(arenaArg)
    console.log(`ARENA ${arenaArg} — ${b.name}`)
    for (let y = 0; y < b.H; y++) {
        let line = ''
        for (let x = 0; x < b.W; x++) {
            line += x === b.p1.x && y === b.p1.y ? '1' : x === b.p2.x && y === b.p2.y ? '2' : CELL(b.grid[y * b.W + x])
        }
        console.log(line)
    }
    process.exit(0)
}

// every arrow that ever existed: the starting quivers PLUS the respawn
// resupplies — the ledger's right side grows exactly when the sim prints
// a resupply event, nowhere else
const ledger = (g) => g.p[0].quiver + g.p[1].quiver
    + g.arrows.filter((a) => a.state !== 'stuck').length
    + g.stuck.length + g.ledger.hit + g.ledger.lost

// drive one match through the REAL bot loop, asserting the ledger every
// tick; returns the game plus receipts
function driveMatch(opts = {}) {
    const g = makeGame(buildArena(opts.arena || 0), opts)
    const skills = opts.skills || [1, 0]
    const cap = opts.maxTicks || CFG.matchTicks + 240
    const receipts = { jumps: 0, sticks: 0, knocks: 0, pulls: 0, dryouts: 0, ledBreaks: 0, stuckPeak: 0 }
    while (!g.end && g.tick < cap) {
        const i1 = botInput(g, 0, skills[0])
        const i2 = botInput(g, 1, skills[1])
        g.cmds.push({ tick: g.tick, p1: i1, p2: i2 })
        step(g, i1, i2)
        if (ledger(g) !== g.total + g.supplied) receipts.ledBreaks++
        receipts.stuckPeak = Math.max(receipts.stuckPeak, g.stuck.length)
        for (const e of g.events) {
            if (e.type === 'jump') receipts.jumps++
            else if (e.type === 'stick') receipts.sticks++
            else if (e.type === 'knockout') receipts.knocks++
            else if (e.type === 'pull') receipts.pulls++
            else if (e.type === 'dryout') receipts.dryouts++
        }
        g.events.length = 0
    }
    return { g, receipts }
}

// ---------------------------------------------------- construction rules ----
section('CONSTRUCTION — arenas carve honestly')
for (let i = 0; i < ARENAS_COUNT; i++) {
    let threw = null
    let b = null
    try { b = buildArena(i) } catch (e) { threw = e }
    ok(!threw, `arena ${i}: buildArena threw — ${threw && threw.message}`)
    if (!b) continue
    ok(b.grid.length === b.W * b.H, `arena ${b.name}: grid size ${b.grid.length} != ${b.W * b.H}`)
    for (let y = 0; y < b.H; y++) {
        ok(b.grid[y * b.W] === 1 && b.grid[y * b.W + b.W - 1] === 1, `${b.name}: row ${y} leaks through the side walls`)
    }
    ok(b.grid.slice(0, b.W).every((t) => t === 1), `${b.name}: the roof is not solid`)
    ok(b.grid.slice(b.H * b.W - b.W).every((t) => t === 1), `${b.name}: the floor is not solid`)
    // the jump contract: apex = jump²/2g must be exactly 2 cells, or every
    // "reachable" ledge note on the title card is a lie
    const h = (CFG.jump * CFG.jump) / (2 * CFG.gravity)
    ok(Math.abs(h - 2 * CFG.cell) < 1, `${b.name}: the jump rises ${(h / CFG.cell).toFixed(2)} cells — the contract says 2`)
}

// --------------------------------------------------- ballistics, pinned ----
// an open scratch range: walls, floor and roof only — no ledges to argue with
function scratch() {
    const g = makeGame(buildArena(0))
    for (let y = 1; y <= g.H - 2; y++) for (let x = 1; x <= g.W - 2; x++) g.grid[y * g.W + x] = 0
    return g
}
const FLOOR_Y = 11 * CFG.cell + 16

section('BALLISTICS — the closed form pinned to the cell, the integrator held to it')
{
    const h = (CFG.jump * CFG.jump) / (2 * CFG.gravity)
    ok(Math.abs(h - 48) < 1, `jump apex ${h.toFixed(1)} px — the arena geometry assumes 48`)

    // flat shots: drop is fixed (8 px to the floor), so range scales with
    // v exactly — charge sets the landing cell, no math hand-waving
    const gA = scratch()
    gA.p[0].x = 60; gA.p[0].y = FLOOR_Y; gA.p[0].grounded = true
    gA.p[0].firing = true; gA.p[0].charge = 1
    step(gA, { mx: 0, my: 0, fire: false, aim: { x: 1, y: 0 } }, null)
    const arA = gA.arrows[gA.arrows.length - 1]
    for (let t = 0; t < 200 && arA.state === 'fly'; t++) step(gA, null, null)
    const dxFull = arA.x - 60
    ok(arA.state === 'stuck', `script: flat full-charge never stuck (${arA.state})`)
    const vF = CFG.arrowMax, tExp = Math.sqrt(2 * 8 / CFG.arrowGravity)
    const wantF = vF * tExp
    ok(Math.abs(dxFull - wantF) < CFG.cell, `script: flat full-charge flew ${dxFull.toFixed(0)} px, v*t says ${wantF.toFixed(0)} ±${CFG.cell}`)

    const gB = scratch()
    gB.p[0].x = 60; gB.p[0].y = FLOOR_Y; gB.p[0].grounded = true
    gB.p[0].firing = true; gB.p[0].charge = 0.5
    step(gB, { mx: 0, my: 0, fire: false, aim: { x: 1, y: 0 } }, null)
    const arB = gB.arrows[gB.arrows.length - 1]
    for (let t = 0; t < 200 && arB.state === 'fly'; t++) step(gB, null, null)
    const dxHalf = arB.x - 60
    const vH = CFG.arrowMin + (CFG.arrowMax - CFG.arrowMin) * 0.5
    ok(Math.abs(dxHalf - vH * tExp) < CFG.cell, `script: half charge flew ${dxHalf.toFixed(0)} px, expected ${(vH * tExp).toFixed(0)}`)
    const vRatio = vF / vH, dRatio = dxFull / dxHalf
    ok(Math.abs(dRatio - vRatio) < 0.25, `script: charge ratio measured ${dRatio.toFixed(2)} vs velocity ratio ${vRatio.toFixed(2)} — charge would not set distance linearly-flat`)

    // the 45° apex: rise = (v sin45)²/2g (+ Euler's half step)
    const gC = scratch()
    gC.p[0].x = 180; gC.p[0].y = FLOOR_Y; gC.p[0].grounded = true
    gC.p[0].firing = true; gC.p[0].charge = 1
    step(gC, { mx: 0, my: 0, fire: false, aim: { x: 1, y: -1 } }, null)
    const arC = gC.arrows[gC.arrows.length - 1]
    let minY = FLOOR_Y
    for (let t = 0; t < 60 && arC.state === 'fly'; t++) { step(gC, null, null); minY = Math.min(minY, arC.y) }
    const vy45 = CFG.arrowMax / Math.SQRT2
    const apexWant = (vy45 * vy45) / (2 * CFG.arrowGravity) + vy45 / 2
    ok(Math.abs((FLOOR_Y - minY) - apexWant) < 16, `script: 45° apex rose ${(FLOOR_Y - minY).toFixed(0)} px, the integrator's own math says ${apexWant.toFixed(0)} ±16`)
}

// ------------------------------------------- stuck arrows as real terrain ----
section('TERRAIN — stick to air, knock-out by replacement, pull-back: the issue\'s second muscle')
{
    // a floor hit must stick in the AIR cell above the floor — that is the
    // cell a walking archer occupies, or the pull-back economy is a painting
    const g = scratch()
    g.p[0].x = 300; g.p[0].y = FLOOR_Y; g.p[0].grounded = true
    g.p[0].firing = true; g.p[0].charge = 0.35
    step(g, { mx: 0, my: 0, fire: false, aim: { x: 1, y: 0 } }, null)
    const ar = g.arrows[g.arrows.length - 1]
    for (let t = 0; t < 120 && ar.state === 'fly'; t++) step(g, null, null)
    ok(ar.state === 'stuck', `script: flat shot never stuck (${ar.state})`)
    ok(g.stuck.length === 1, 'script: stuck arrow not registered in the terrain array')
    const sc = g.stuck[0].cell
    ok(g.grid[sc] === 0, `script: arrow stuck INSIDE solid cell ${sc} — unreachable terrain, un-pullable economy`)

    // knock-out: a second arrow down the identical trajectory must replace
    // the first, and the spent rival must show up on the ledger
    g.p[0].x = 300; g.p[0].firing = true; g.p[0].charge = 0.35
    step(g, { mx: 0, my: 0, fire: false, aim: { x: 1, y: 0 } }, null)
    const ar2 = g.arrows[g.arrows.length - 1]
    let sawKnock = false
    for (let t = 0; t < 140 && !sawKnock; t++) {
        step(g, null, null)
        sawKnock = g.events.some((e) => e.type === 'knockout')
        g.events.length = 0
    }
    ok(sawKnock, 'script: an identical arrow flew through the stuck one — terrain that does not block is scenery')
    ok(g.stuck.length === 1 && g.stuck[0].id === ar2.id && g.ledger.lost === 1,
        `script: the knock-out left ${g.stuck.length} stuck, lost ${g.ledger.lost} — replacement or the ledger is lying`)
    ok(ledger(g) === g.total, 'script: the knock-out broke the arrow ledger')

    // pull-back: walk over the air-cell arrow and it is ammo again
    const q0 = g.p[0].quiver
    g.p[0].quiver = q0 - 1
    g.p[0].x = (sc % g.W) * CFG.cell + CFG.cell / 2
    g.p[0].y = Math.floor(sc / g.W) * CFG.cell + CFG.cell / 2 + (CFG.cell / 2 - 8)
    g.p[0].vy = 0; g.p[0].grounded = true
    step(g, { mx: 0, my: 0, fire: false }, null)
    ok(g.p[0].quiver === q0 && g.stuck.length === 0,
        `script(pull): standing in a stuck arrow's cell left quiver ${g.p[0].quiver}/${q0} and ${g.stuck.length} stuck — the pull is the game's economy`)
}

// ------------------------------------------------ each arena, won for real ----
const receipts = {}
for (let i = 0; i < ARENAS_COUNT; i++) {
    section(`MATCH ${i} — ${buildArena(i).name}: the autopilot IS the attract demo, and it wins`)
    const t0 = Date.now()
    const { g, receipts: r } = driveMatch({ arena: i })
    ok(g.end === 'win' && g.winner === 0, `arena ${i}: the autopilot did not WIN: end=${g.end} winner=${g.winner} scores ${g.p[0].score}-${g.p[1].score}`)
    ok(g.p[0].score === CFG.winScore, `arena ${i}: won with ${g.p[0].score} not ${CFG.winScore} — the win condition is not what the title card says`)
    ok(g.tick < CFG.matchTicks, `arena ${i}: match ran out the clock (${g.tick}) — a demo that times out is a tie nobody asked for`)
    ok(r.ledBreaks === 0, `arena ${i}: the arrow ledger broke on ${r.ledBreaks} ticks — arrows walked off uncounted`)
    ok(r.sticks > 0, `arena ${i}: zero arrows stuck in stone — the terrain muscle never moved`)
    ok(r.pulls + r.dryouts > 0, `arena ${i}: no arrow ever came back (pulled or dried out) — the quiver economy ran one-way and the arena would silt up`)
    ok(r.knocks + r.pulls > 0, `arena ${i}: stuck arrows were neither eaten nor pulled — pure scenery`)
    ok(g.p[1].score < CFG.winScore, `arena ${i}: the bot nearly won (${g.p[1].score}) — the demo would be a highlight reel FOR the loser`)
    ok(Date.now() - t0 < 4000, `arena ${i}: ${Date.now() - t0} ms — this audit must stay a second, not a minute`)

    // determinism, three ways: recorded stream re-replayed; re-driven from
    // scratch through the same pure solver; and a stream with one interior
    // command dropped MUST land elsewhere.
    const g2 = replay(buildArena(i), g.cmds.map((c) => ({ ...c })), { maxTicks: g.tick + 2 })
    ok(stateHash(g2) === stateHash(g), `arena ${i}: replay of the recorded stream diverged`)
    const again = driveMatch({ arena: i })
    ok(stateHash(again.g) === stateHash(g), `arena ${i}: re-solving produced a different match — the solver is not pure`)
    const mid = g.cmds.filter((c) => c.tick > 40 && c.tick < g.tick - 20 && c.p1 && (c.p1.mx !== 0 || c.p1.fire))
    if (mid.length) {
        const drop = mid[Math.floor(mid.length / 2)].tick
        const cut = g.cmds.filter((c) => c.tick !== drop)
        const g3 = replay(buildArena(i), cut.map((c) => ({ ...c })), { maxTicks: g.tick + 60 })
        ok(stateHash(g3) !== stateHash(g), `arena ${i}: dropping shot@${drop} changed NOTHING — a hash-blind referee`)
    }

    // the input stamp: at least one tick where both players acted and the
    // hash differs from P2-last order — two keyboards must resolve one way
    const bothAt = g.cmds.find((c) => c.p1 && (c.p1.mx || c.p1.fire) && c.p2 && (c.p2.mx || c.p2.fire))
    ok(!!bothAt, `arena ${i}: no tick ever had both players busy — the stamp order was never exercised`)

    // the slack rule: one fewer of every supply the winning script spent.
    const sl = driveMatch({ arena: i, quiver: CFG.quiver - 1, quiverMax: CFG.quiver - 1, p2Gift: 1 })
    ok(sl.g.winner === 0 && sl.g.p[0].score === CFG.winScore,
        `arena ${i}: SLACK FAILED — with quiver ${CFG.quiver - 1} and the foe gifted a point the autopilot ended ${sl.g.p[0].score}-${sl.g.p[1].score}; a perfect-solver win is not a human-winning design`)
    ok(sl.receipts.ledBreaks === 0, `arena ${i}: the slack match broke the ledger`)

    receipts[i] = { ticks: g.tick, scores: `${g.p[0].score}-${g.p[1].score}`, sticks: r.sticks, pulls: r.pulls, knocks: r.knocks, ms: Date.now() - t0 }
}

// ---------------------------------------------- dry-quiver honesty check ----
section('DRY — an empty quiver clicks, never fires')
{
    const g = makeGame(buildArena(0))
    g.p[0].quiver = 0
    step(g, { mx: 0, my: 0, fire: true }, null)
    step(g, { mx: 0, my: 0, fire: true }, null)
    const ar = g.arrows.length
    step(g, { mx: 0, my: 0, fire: false }, null)
    ok(g.arrows.length === ar, 'script: a dry archer fired an arrow from nothing')
    ok(g.p[0].quiver === 0, 'script: the dry shot went negative-ammo')
}

// --------------------------------------------------------------- mutants ----
if (MUT) {
    section('MUTATIONS — each one MUST turn an honest check red')
    const tryMut = (name, patch, probe) => {
        const base = probe()
        ok(base, `mutation harness broken: baseline for '${name}' is already false`)
        const save = { ...CFG }
        Object.assign(CFG, patch)
        let verdict = true
        try { verdict = probe() } finally { Object.assign(CFG, save) }
        console.log(`  mut ${name}: ${verdict ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(!verdict, `${name} SURVIVED — a check stopped touching this rule`)
    }
    const shootFlat = (g, x, c) => {
        g.p[0].x = x; g.p[0].y = FLOOR_Y; g.p[0].grounded = true
        g.p[0].firing = true; g.p[0].charge = c
        step(g, { mx: 0, my: 0, fire: false, aim: { x: 1, y: 0 } }, null)
        const ar = g.arrows[g.arrows.length - 1]
        for (let t = 0; t < 140 && ar.state === 'fly'; t++) step(g, null, null)
        return ar
    }
    tryMut('no-stick (arrows phase through stone)', { stick: false }, () => {
        const g = scratch()
        const ar = shootFlat(g, 300, 0.35)
        return g.stuck.length === 1 && ar.state === 'stuck'
    })
    tryMut('no-knockout (arrows fly through stuck arrows)', { knockout: false }, () => {
        // an honest mid-air crossing: a stuck arrow exists in an air cell
        // (exactly what a ledge-stuck arrow is), and a solved 45° arc
        // crosses that cell on its DESCENT. knockout=on eats the arc there;
        // knockout=off lets it sail on to the floor. A rest-in-cell probe
        // cannot tell the two apart (stickArrow replaces on landing either
        // way) — which is why the first version of this mutant survived.
        const g = scratch()
        const ghost = { id: -9, owner: 1, x: 252, y: 208, vx: 0, vy: 0, state: 'stuck', cell: 8 * g.W + 10, ang: 0.6, age: 0 }
        g.stuck.push(ghost); g.arrows.push(ghost)
        g.p[0].x = 100; g.p[0].y = FLOOR_Y; g.p[0].grounded = true
        g.p[0].firing = true; g.p[0].charge = 0.56
        step(g, { mx: 0, my: 0, fire: false, aim: { x: 1, y: -1 } }, null)
        const ar = g.arrows[g.arrows.length - 1]
        let crossed = false
        for (let t = 0; t < 120 && !crossed; t++) {
            step(g, null, null)
            crossed = g.events.some((e) => e.type === 'knockout') ||
                (ar.state === 'stuck' && ar.cell === ghost.cell)
            g.events.length = 0
        }
        return crossed
    })
    tryMut('no-pull (stuck arrows are never ammo)', { retrieve: false }, () => {
        const g = scratch()
        shootFlat(g, 300, 0.35)
        if (g.stuck.length !== 1) return false
        g.p[0].quiver = CFG.quiver - 1
        const sc = g.stuck[0].cell
        g.p[0].x = (sc % g.W) * CFG.cell + CFG.cell / 2
        g.p[0].y = Math.floor(sc / g.W) * CFG.cell + CFG.cell / 2 + (CFG.cell / 2 - 8)
        g.p[0].vy = 0; g.p[0].grounded = true
        step(g, { mx: 0, my: 0, fire: false }, null)
        return g.p[0].quiver === CFG.quiver && g.stuck.length === 0
    })
    tryMut('flat-arrows (no arrow gravity)', { arrowGravity: 0 }, () => {
        const g = scratch()
        g.p[0].x = 180; g.p[0].y = FLOOR_Y; g.p[0].grounded = true
        g.p[0].firing = true; g.p[0].charge = 1
        step(g, { mx: 0, my: 0, fire: false, aim: { x: 1, y: -1 } }, null)
        const ar = g.arrows[g.arrows.length - 1]
        let minY = FLOOR_Y
        for (let t = 0; t < 80 && ar.state === 'fly'; t++) { step(g, null, null); minY = Math.min(minY, ar.y) }
        const vy45 = CFG.arrowMax / Math.SQRT2
        return Math.abs((FLOOR_Y - minY) - ((vy45 * vy45) / (2 * CFG.arrowGravity) + vy45 / 2)) < 24
    })
    tryMut('float (no player gravity — the 2-cell jump contract dies)', { gravity: 0.0002 }, () => {
        const h = (CFG.jump * CFG.jump) / (2 * CFG.gravity)
        return Math.abs(h - 2 * CFG.cell) < 1
    })
    tryMut('clock 400 ticks (the autopilot cannot finish the duel)', { matchTicks: 400 }, () => {
        const { g } = driveMatch({ arena: 0, maxTicks: CFG.matchTicks + 240 })
        return g.end === 'win' && g.winner === 0
    })
}

console.log(`\narcherycheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
console.log(`receipts: ${JSON.stringify(receipts)}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
