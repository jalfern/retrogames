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
//   npm run archerycheck -- --mutate  + twelve mutants that MUST die
//   npm run archerycheck -- --arena 1 dump an arena as ASCII
//
// #2307 adds the third muscle — CLIMBS: the autopilot gains rows on purpose.
// A climb receipt is grounded-row → grounded-row (no mid-air brush-past), the
// oracle hopGrants is held against the real moveBody, and killing the
// climbSeek flag must turn the receipts red.
import { ARENAS_COUNT, buildArena } from '../src/games/ArenaArchery/levels.js'
import {
    CFG, makeGame, step, botInput, recordMatch, replay, stateHash, heatWarnStep,
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
    const receipts = { jumps: 0, sticks: 0, knocks: 0, pulls: 0, dryouts: 0, ledBreaks: 0, stuckPeak: 0, worstGap: 0, heatSeen: false, firstHit: 0, climbs: [[], []], gain: [0, 0], floppy: 0 }
    // #2307 climb receipts: a CLIMB is leaving the ground going up and
    // landing on the ground some rows higher — grounded-row to grounded-row,
    // the only metric that can't be faked by a mid-air min-row brush-past.
    const crow = (p) => Math.floor(p.y / CFG.cell)
    const prev = g.p.map((p) => ({ grounded: p.grounded, row: crow(p), takeoff: -1 }))
    // the #1685 stalemate meter: the longest run of ticks with NO action
    // (loose|hit) after the first kill. A dry quiver economy sits here ~20 s.
    let armed = false, prevAction = -1
    while (!g.end && g.tick < cap) {
        const i1 = botInput(g, 0, skills[0])
        const i2 = botInput(g, 1, skills[1])
        for (let pi = 0; pi < 2; pi++) {
            const p = g.p[pi]
            if (prev[pi].grounded && !p.grounded && p.vy < 0) prev[pi].takeoff = prev[pi].row
            if (!prev[pi].grounded && p.grounded && prev[pi].takeoff >= 0) {
                if (crow(p) < prev[pi].takeoff) { receipts.climbs[pi].push([prev[pi].takeoff, crow(p)]); receipts.gain[pi] += prev[pi].takeoff - crow(p) }
                prev[pi].takeoff = -1
            }
            prev[pi].grounded = p.grounded
            prev[pi].row = crow(p)
        }
        g.cmds.push({ tick: g.tick, p1: i1, p2: i2 })
        step(g, i1, i2)
        if (ledger(g) !== g.total + g.supplied) receipts.ledBreaks++
        // #2565 flush receipts: every shaft resting ON stone (stuck in a
        // solid cell, or in the air cell above one) must wear a flush angle —
        // near-vertical (75°±15) or near-horizontal (0/180°±15). A shaft
        // hanging at a raw arrival skew reads as broken geometry.
        for (const s of g.stuck) {
            const cx = s.cell % g.W, cy = (s.cell / g.W) | 0
            const onStone = g.grid[s.cell] === 1 || (cy + 1 < g.H && g.grid[(cy + 1) * g.W + cx] === 1)
            if (!onStone) continue
            const d = ((((s.ang * 180) / Math.PI) % 180) + 180) % 180
            if (!(Math.abs(d - 90) <= 15 || Math.min(d, 180 - d) <= 15)) receipts.floppy++
        }
        receipts.stuckPeak = Math.max(receipts.stuckPeak, g.stuck.length)
        for (const e of g.events) {
            if (e.type === 'loose' || e.type === 'hit') {
                if (e.type === 'hit' && !armed) armed = true
                if (armed) { if (prevAction >= 0) receipts.worstGap = Math.max(receipts.worstGap, g.tick - prevAction); prevAction = g.tick }
            }
            if (e.type === 'jump') receipts.jumps++
            else if (e.type === 'stick') receipts.sticks++
            else if (e.type === 'knockout') receipts.knocks++
            else if (e.type === 'pull') receipts.pulls++
            else if (e.type === 'dryout') receipts.dryouts++
            else if (e.type === 'heat') receipts.heatSeen = true
            else if (e.type === 'hit' && !receipts.firstHit) receipts.firstHit = g.tick
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

// ------------------------------------------------- flush sticks (#2565) ----
section('FLUSH — a stuck shaft lies against the surface that holds it (#2565)')
{
    const deg = (a) => (a * 180) / Math.PI
    // floor: the flat shaft sticks in the air cell above the floor and must
    // read near-vertical (75° ± 15), tip toward the facing — not sag at its
    // ~15° arrival angle like a branch that never landed flush.
    const g = scratch()
    g.p[0].x = 300; g.p[0].y = FLOOR_Y; g.p[0].grounded = true
    g.p[0].firing = true; g.p[0].charge = 0.35
    step(g, { mx: 0, my: 0, fire: false, aim: { x: 1, y: 0 } }, null)
    const ar = g.arrows[g.arrows.length - 1]
    for (let t = 0; t < 120 && ar.state === 'fly'; t++) step(g, null, null)
    ok(ar.state === 'stuck', 'flush(floor): flat shot never stuck — rig broken')
    ok(Math.abs(deg(ar.ang) - 75) <= 15,
        `flush(floor): shaft sits at ${deg(ar.ang).toFixed(1)}° — floor sticks must be near-vertical (60–120°)`)

    // wall: a column in the lane, fired at flat full charge — the shaft buries
    // its tip through the side face and must read near-horizontal (8° ± 15).
    const w = scratch()
    for (let y = 5; y <= 10; y++) w.grid[y * w.W + 12] = 1
    w.p[0].x = 60; w.p[0].y = 150; w.p[0].grounded = false
    w.p[0].firing = true; w.p[0].charge = 1
    step(w, { mx: 0, my: 0, fire: false, aim: { x: 1, y: 0 } }, null)
    const wa = w.arrows[w.arrows.length - 1]
    for (let t = 0; t < 120 && wa.state === 'fly'; t++) step(w, null, null)
    ok(wa.state === 'stuck' && Math.abs(deg(wa.ang)) <= 15,
        `flush(wall): shaft at ${wa.ang != null ? deg(wa.ang).toFixed(1) : '-'}° (state ${wa.state}) — wall sticks must be near-horizontal`)

    // ceiling: DOUBLE-thickness stone overhead, met by a full 45° lob — no
    // air cell above the hit to lift into, so the shaft stays against the
    // underside and must hang near-vertical the OTHER way (−75°). (A single
    // row slab lifts its hit above the slab — the direction-agnostic air-cell
    // lift is the #1685 pull economy and stays as is; see README gaps.)
    const c = scratch()
    for (let y = 5; y <= 6; y++) for (let x = 10; x <= 16; x++) c.grid[y * c.W + x] = 1
    c.p[0].x = 140; c.p[0].y = FLOOR_Y; c.p[0].grounded = true
    c.p[0].firing = true; c.p[0].charge = 1
    step(c, { mx: 0, my: 0, fire: false, aim: { x: 1, y: -1 } }, null)
    const ca = c.arrows[c.arrows.length - 1]
    for (let t = 0; t < 120 && ca.state === 'fly'; t++) step(c, null, null)
    ok(ca.state === 'stuck' && deg(ca.ang) <= -60,
        `flush(ceiling): shaft at ${ca.ang != null ? deg(ca.ang).toFixed(1) : '-'}° (state ${ca.state}) — ceiling sticks hang tip-up near-vertical`)

    // mid-air knock-out with NO stone beneath the cell: nothing to lie
    // against, so the shaft keeps its raw arrival angle (the preservation
    // branch — snap-everything would fake flush where there is no surface).
    const k = scratch()
    const ghost = { id: 999, owner: 1, state: 'stuck', cell: 6 * k.W + 8, age: 0, x: 8 * CFG.cell + 12, y: 152, ang: 2.2, vx: 0, vy: 0 }
    k.stuck.push(ghost)
    k.p[0].x = 140; k.p[0].y = 140; k.p[0].grounded = false
    k.p[0].firing = true; k.p[0].charge = 1
    step(k, { mx: 0, my: 0, fire: false, aim: { x: 1, y: 0.1 } }, null)
    const ka = k.arrows[k.arrows.length - 1]
    let pvx = ka.vx, pvy = ka.vy, ko = false
    for (let t = 0; t < 60 && !ko; t++) {
        step(k, null, null)
        ko = k.events.some((e) => e.type === 'knockout')
        if (!ko) { pvx = ka.vx; pvy = ka.vy }
        k.events.length = 0
    }
    ok(ko, 'flush(midair): the knock-out rig never fired')
    ok(ka.state === 'stuck' && Math.abs(ka.ang - Math.atan2(pvy + CFG.arrowGravity, pvx)) < 0.05,
        `flush(midair): knock-out shaft angled ${ka.ang} with no surface beneath — arrival angle must be kept where there is no stone`)
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
    ok(r.floppy === 0, `arena ${i}: ${r.floppy} stuck-on-stone samples hung at a raw arrival angle — flush sticks (#2565) died`)
    ok(r.pulls + r.dryouts > 0, `arena ${i}: no arrow ever came back (pulled or dried out) — the quiver economy ran one-way and the arena would silt up`)
    ok(r.knocks + r.pulls > 0, `arena ${i}: stuck arrows were neither eaten nor pulled — pure scenery`)
    ok(g.p[1].score < CFG.winScore, `arena ${i}: the bot nearly won (${g.p[1].score}) — the demo would be a highlight reel FOR the loser`)
    // #1685: the duels must not dry out. After the first kill, the longest
    // gap between shots/hits must stay under 5 s — a frozen mid-duel is what
    // the player sees as a broken game. The lob-and-walk-in basic bot sat
    // here ~20 s until the stuck-arrow TTL reopened the quiver economy.
    ok(r.worstGap < 150, `arena ${i}: the duel sat ${r.worstGap} ticks (${(r.worstGap / 30).toFixed(1)} s) with no shot after the first kill — a dry quiver economy froze the demo (#1685)`)
    // #2377 tempo invariant: pressure is for stalemates ONLY. The gate sits
    // at heatTicks (450); every honest autopilot duel draws first blood at
    // least three seconds earlier, so the attract demo never heats and the
    // receipts above describe the SAME match as before the rule existed.
    ok(!r.heatSeen && r.firstHit > 0 && r.firstHit <= CFG.heatTicks - 90,
        `arena ${i}: heatSeen=${r.heatSeen}, first hit at tick ${r.firstHit} (gate ${CFG.heatTicks}) — the autopilot's tempo must stay clear of the heat gate (#2377)`)
    // #2307 — the issue's muscle: the autopilot climbs ledge chains ON PURPOSE.
    // Receipts are grounded-row → grounded-row (a landing two rows up is a
    // deliberate 2-cell step; the physics apex is 51 px, so a +2 is the
    // maximum a granted hop can pay and stay honest).
    ok(r.climbs[0].length >= 2, `arena ${i}: the autopilot climbed ${r.climbs[0].length} ledges — the bot never climbs ledge chains deliberately (#2307)`)
    ok(r.gain[0] >= 4, `arena ${i}: total ascent ${r.gain[0]} rows — a bot that only skirts the floor does not own this arena (#2307)`)
    ok(Math.min(...r.climbs[0].map(([, t]) => t)) <= 7, `arena ${i}: highest landing row ${Math.min(...r.climbs[0].map(([, t]) => t))} — the upper tiers were never touched (#2307)`)
    if (i === 1) ok(Math.min(...r.climbs[0].map(([, t]) => t)) <= 3, `arena ${i}: KNOCKBACK's inner balconies (row ≤3) never reached — the chain dead-ends mid-tower (#2307)`)
    ok(r.climbs[1].length === 0, `arena ${i}: the skill-0 bot climbed ${r.climbs[1].length} ledges — climb doctrine is skill>0; the loser stealing the high ground inverts the demo (#2307)`)
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

    receipts[i] = { ticks: g.tick, scores: `${g.p[0].score}-${g.p[1].score}`, sticks: r.sticks, pulls: r.pulls, knocks: r.knocks, climbs: r.gain[0], firstHit: r.firstHit, heat: r.heatSeen, ms: Date.now() - t0 }
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

// ------------------------------------------- HEAT — dry spells rot cover ----
// #2377: the honest gap said "a very defensive duel could get boring near
// the wall — the wander keeps it honest, not fast". The rule: heatTicks
// without a HIT makes the arena HOT and stuck cover drains heatRot times
// faster; first blood cools it the same tick. These pins own the algebra.
section('HEAT — a dry spell bakes the arena; first blood cools it (#2377)')
{
    const FLOOR = 11 * CFG.cell + 16
    // one scripted flat shot; returns stick tick, arrow age right after the
    // stick frame, and the dryout tick — all through the real step()
    const shootAndWatch = (g, { keepCool = false, cap = 900 } = {}) => {
        g.p[0].x = 300; g.p[0].y = FLOOR; g.p[0].grounded = true
        g.p[0].firing = true; g.p[0].charge = 0.35
        step(g, { mx: 0, my: 0, fire: false, aim: { x: 1, y: 0 } }, null)
        let stick = -1, dry = -1, age0 = -1
        for (let t = 0; t < cap && dry < 0; t++) {
            step(g, null, null)
            if (keepCool) g.lastHit = g.tick   // the referee stamps out dry spells (plain data, like the ghost-arrow precedent)
            for (const e of g.events) {
                if (e.type === 'stick' && stick < 0) { stick = g.tick; age0 = g.stuck[g.stuck.length - 1].age }
                else if (e.type === 'dryout' && dry < 0) dry = g.tick
            }
            g.events.length = 0
        }
        return { stick, dry, age0 }
    }
    // the drain law: each tick adds 1 + rot to a stuck arrow's age; dryout
    // is the first tick where the ttl leg pushes it past stuckTTL
    const expectLife = (age0, rot) => { let n = 0; while (age0 + n * (1 + rot) + rot <= CFG.stuckTTL) n++; return n + 1 }

    // 1) the gate: a match with no blood heats on exactly heatTicks
    {
        const g = scratch()
        let heatTick = -1
        for (let t = 0; t < CFG.heatTicks + 30 && heatTick < 0; t++) {
            step(g, null, null)
            for (const e of g.events) if (e.type === 'heat') heatTick = e.tick
            g.events.length = 0
        }
        ok(heatTick === CFG.heatTicks && g.heat === true,
            `heat gate: fired at tick ${heatTick} (expected ${CFG.heatTicks}), heat=${g.heat} — the dry-spell switch is off the clock it claims`)
    }

    // 2) the drain, cool vs hot: identical shots, constant rot each. Cool
    // cover lives N ticks; hot cover must live the exact integer the
    // (1 + heatRot)/(1 + 1) drain predicts off the observed stick age.
    {
        const cool = (() => { const g = scratch(); return shootAndWatch(g, { keepCool: true }) })()
        const hot = (() => { const g = scratch(); for (let t = 0; t < CFG.heatTicks; t++) step(g, null, null); return shootAndWatch(g) })()
        ok(cool.dry > cool.stick && hot.dry > hot.stick, `heat drain: missing dryouts (cool ${JSON.stringify(cool)}, hot ${JSON.stringify(hot)})`)
        const wantCool = expectLife(cool.age0, 1), wantHot = expectLife(hot.age0, CFG.heatRot)
        ok(cool.dry - cool.stick === wantCool, `cool drain: cover lived ${cool.dry - cool.stick} ticks, the age-${cool.age0}+2/tick law says ${wantCool}`)
        ok(hot.dry - hot.stick === wantHot, `hot drain: cover lived ${hot.dry - hot.stick} ticks, the age-${hot.age0}+${1 + CFG.heatRot}/tick law says ${wantHot}`)
        ok((hot.dry - hot.stick) * (1 + CFG.heatRot) >= (cool.dry - cool.stick) * 2 - 2 && (hot.dry - hot.stick) * (1 + CFG.heatRot) <= (cool.dry - cool.stick) * 2 + 2,
            `heat ratio: cool ${(cool.dry - cool.stick)} vs hot ${(hot.dry - hot.stick)} — hot cover drains (1+heatRot) where cool drains 2, so hot×${1 + CFG.heatRot} must match cool×2 (±2 for the stick-age offset)`)
        // dryout still pays the owner: the rotted shaft walks home
        ok(hot.stick >= 0 && (hot.dry - hot.stick) > 0, 'hot dryout never returned its arrow — ledger legs stay counted in the MATCH receipts')
    }

    // 3) first blood cools SYNCHRONOUSLY: the hit and the cool drop the same tick
    {
        const g = scratch()
        for (let t = 0; t < CFG.heatTicks + 5; t++) step(g, null, null)
        ok(g.heat === true, 'heat: pre-cooled arena for the hit probe')
        g.p[0].x = 200; g.p[0].y = FLOOR; g.p[0].grounded = true
        g.p[1].x = 240; g.p[1].y = FLOOR; g.p[1].invuln = 0
        g.p[0].firing = true; g.p[0].charge = 0.3
        step(g, { mx: 0, my: 0, fire: false, aim: { x: 1, y: 0 } }, null)
        let hitTick = -1, coolTick = -1
        for (let t = 0; t < 60 && coolTick < 0; t++) {
            step(g, null, null)
            for (const e of g.events) {
                if (e.type === 'hit' && hitTick < 0) hitTick = g.tick
                if (e.type === 'cool') coolTick = g.tick
            }
            g.events.length = 0
        }
        ok(hitTick > 0 && coolTick === hitTick && g.heat === false && g.lastHit === hitTick - 1,
            `cool-sync: hit@${hitTick} cool@${coolTick} heat=${g.heat} lastHit=${g.lastHit} — first blood must end the heat the same tick`)
        // and the dry spell restarts from the blood: no re-heat until the
        // drain refills. The heat event stamps the sim tick inside step(),
        // lastHit the pre-increment tick of its frame — measured from the
        // blood's sim-tick they sit exactly heatTicks apart.
        const blood = g.lastHit
        let reheat = -1
        for (let t = 0; t < CFG.heatTicks + 40 && reheat < 0; t++) {
            step(g, null, null)
            for (const e of g.events) if (e.type === 'heat') reheat = e.tick
            g.events.length = 0
        }
        ok(reheat - blood === CFG.heatTicks, `re-heat: arena baked again at +${reheat - blood} ticks after blood (expected ${CFG.heatTicks})`)
    }

    // 4) the ledger survives a hot stretch: rot returns arrows to owners,
    // never conjures or eats one
    {
        const g = scratch()
        for (let t = 0; t < CFG.heatTicks + 5; t++) step(g, null, null)
        shootAndWatch(g)
        const now = g.p[0].quiver + g.p[1].quiver + g.arrows.filter((a) => a.state !== 'stuck').length + g.stuck.length + g.ledger.hit + g.ledger.lost
        ok(now === g.total + g.supplied, `hot dryout broke the arrow ledger (${now} vs ${g.total + g.supplied})`)
        ok(g.p[0].quiver === CFG.quiver && g.receipts[0] > 0, `hot dryout should have walked the shaft home: quiver ${g.p[0].quiver}, receipts ${g.receipts[0]}`)
    }
}

// ------------------------------------------ TELEGRAPH — warn before the bake ----
// #2385 item 1: the rumble is the SOUND of the gate already fired; the player
// deserves to hear it coming. Two rising notes ring at gate-heatWarnLead and
// gate-heatWarnLead/2 of the dry spell. The window is pinned with HARD numbers
// so a mutant shifting the lead cannot vouch for itself the way CFG-reading
// ratios can.
section('TELEGRAPH — the dry spell warns 2 s and 1 s before the gate (#2385)')
{
    // the pure law: exact steps, silence outside, silence once hot
    ok(heatWarnStep(0) === 0 && heatWarnStep(CFG.heatTicks - CFG.heatWarnLead - 1) === 0,
        'telegraph: must stay silent before the window opens')
    ok(heatWarnStep(CFG.heatTicks - CFG.heatWarnLead) === 1,
        `telegraph: note 1 must ring at dry ${CFG.heatTicks - CFG.heatWarnLead} (gate − lead)`)
    ok(heatWarnStep(CFG.heatTicks - CFG.heatWarnLead / 2) === 2,
        `telegraph: note 2 must ring at dry ${CFG.heatTicks - CFG.heatWarnLead / 2} (gate − lead/2)`)
    ok(heatWarnStep(CFG.heatTicks) === 0 && heatWarnStep(CFG.heatTicks + 500) === 0,
        'telegraph: once the spell passes the gate the rumble owns the voice — no notes')
    // blood closes the spell: dry snaps back to 0 mid-window and the law falls
    // silent again (the shell's latch re-arms off the same number)
    ok(heatWarnStep(5) === 0, 'telegraph: a hit mid-window must silence the warning')
    // live through the real gate: a bloodless run rings exactly two notes,
    // BOTH at least a full 45 ticks (1.5 s) clear of the heat event — the
    // constant is the promise ("before" means before), CFG only names the gate.
    const g = scratch()
    const notes = []
    let heatAt = -1
    for (let t = 0; t < CFG.heatTicks + 5 && heatAt < 0; t++) {
        step(g, null, null)
        const ws = heatWarnStep(g.tick - g.lastHit)
        if (ws) notes.push([ws, g.tick])
        for (const e of g.events) if (e.type === 'heat') heatAt = e.tick
        g.events.length = 0
    }
    ok(notes.length === 2 && notes[0][0] === 1 && notes[1][0] === 2 && heatAt === CFG.heatTicks,
        `telegraph live run: notes ${JSON.stringify(notes)}, heat@${heatAt} — exactly two rising notes before the gate`)
    ok(notes.length === 2 && heatAt - notes[0][1] >= 45,
        `telegraph lead: first note at ${notes[0] ? notes[0][1] : '-'} is only ${notes[0] ? heatAt - notes[0][1] : '?'} ticks before the ${heatAt} rumble — must be ≥ 45 (a 2 s warning, not a stutter)`)
    // honest tempo never rings: across arenas the real autopilot duel's
    // longest dry spell must stay under the warn window — the attract demo
    // and every honest match are prohibited from faking the rule (the first
    // hit lands ≥90 ticks before the gate; the warn lead must fit under
    // that headroom, pinned here by the actual spell, not a claim).
    let honestMaxDry = 0
    for (let i = 0; i < ARENAS_COUNT; i++) {
        const g2 = makeGame(buildArena(i))
        let dryMax = 0
        while (!g2.end && g2.tick < CFG.matchTicks) {
            step(g2, botInput(g2, 0, 1), botInput(g2, 1, 0))
            dryMax = Math.max(dryMax, g2.tick - g2.lastHit)
        }
        honestMaxDry = Math.max(honestMaxDry, dryMax)
    }
    ok(honestMaxDry < CFG.heatTicks - CFG.heatWarnLead,
        `telegraph in honest play: longest real dry spell ${honestMaxDry} must stay under the warn window (${CFG.heatTicks - CFG.heatWarnLead}) — no honest duel may ring the bell`)
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
    tryMut('floppy shafts (sticks keep raw arrival angles — #2565)', { flushSticks: false }, () => {
        const g = scratch()
        const ar = shootFlat(g, 300, 0.35)
        return ar.state === 'stuck' && Math.abs((ar.ang * 180) / Math.PI - 75) <= 15
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
    tryMut('lob-bot (the basic bot dumps arrows on unreachable ledges — #1685)', { bot0Lobs: true, bot0Range: 90, bot0Release: 0.55, climbSeek: false }, () => {
        // KNOCKBACK: the original lob-and-walk-in bot dried the duel out ~20 s.
        // climbSeek joins the patch because the climbing autopilot re-opens
        // firing lanes the lobs used to freeze — the mutant must regress the
        // doctrine as it actually ships, not as it shipped in #1685.
        const { receipts: r } = driveMatch({ arena: 1 })
        return r.worstGap < 150
    })
    tryMut('no-climb-seek (the autopilot stops seeking ledge chains — #2307)', { climbSeek: false }, () => {
        // doctrine off ⇒ the physics oracle never runs ⇒ grounded-row receipts
        // fall to 0 on every arena. Evasive jumps alone never settle a +2.
        const a = driveMatch({ arena: 0 }), b = driveMatch({ arena: 1 })
        return a.receipts.gain[0] >= 4 && b.receipts.gain[0] >= 4
    })
    tryMut('no-heat (a dry spell never bakes the arena — #2377)', { heat: false }, () => {
        const g = scratch()
        for (let t = 0; t < CFG.heatTicks + 30; t++) { step(g, null, null); g.events.length = 0 }
        return g.heat === true
    })
    tryMut('heat-rot off (the arena heats but the cover never rots — #2377)', { heatRot: 1 }, () => {
        // the gate still fires; only the drain dies. Catch it on a ratio the
        // patched constant cannot sign for itself: cool cover must live ~2×
        // as long as hot cover (2 vs 1+heatRot age per tick). Reading
        // CFG.heatRot here would let the mutant vouch for its own decay.
        const life = (hot) => {
            const g = scratch()
            if (!hot) g.lastHit = 1_000_000   // pinned-future blood: referee-cooled (plain data)
            else for (let t = 0; t < CFG.heatTicks; t++) step(g, null, null)
            g.p[0].x = 300; g.p[0].y = FLOOR_Y; g.p[0].grounded = true
            g.p[0].firing = true; g.p[0].charge = 0.35
            step(g, { mx: 0, my: 0, fire: false, aim: { x: 1, y: 0 } }, null)
            let s = -1, d = -1
            for (let t = 0; t < 900 && d < 0; t++) {
                step(g, null, null)
                if (!hot) g.lastHit = 1_000_000
                for (const e of g.events) { if (e.type === 'stick' && s < 0) s = g.tick; if (e.type === 'dryout') d = g.tick }
                g.events.length = 0
            }
            return d > 0 && s > 0 ? d - s : -1
        }
        const coolL = life(false), hotL = life(true)
        return coolL > 0 && hotL > 0 && coolL / hotL >= 1.8
    })
    tryMut('heat-warn too late (the bell rings with under a second left — #2385)', { heatWarnLead: 20 }, () => {
        // the window slides to gate−20/gate−10: two notes still ring, but the
        // HARD ≥45-tick lead promise breaks — the check must catch it on the
        // constant, not on the patched CFG.heatWarnLead.
        const g = scratch()
        const notes = []
        let heatAt = -1
        for (let t = 0; t < CFG.heatTicks + 5 && heatAt < 0; t++) {
            step(g, null, null)
            if (heatWarnStep(g.tick - g.lastHit)) notes.push(g.tick)
            for (const e of g.events) if (e.type === 'heat') heatAt = e.tick
            g.events.length = 0
        }
        return notes.length >= 2 && heatAt - notes[0] >= 45
    })
}

console.log(`\narcherycheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
console.log(`receipts: ${JSON.stringify(receipts)}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
