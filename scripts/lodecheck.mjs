// LODE RUNNER-LITE — the Node audit, 1983 rules. No browser, no dev server:
// this file imports the SAME sim.js + levels.js the browser mounts and proves,
// before a single pixel is painted, that the vaults are winnable by the REAL
// no-jump, no-dig autopilot with guards hunting on the real pathfinder — and
// that every classic rule the issue named is load-bearing:
//
//   npm run lodecheck              the audit (~2 s)
//   npm run lodecheck -- --mutate  + fourteen mutants that MUST die
//   npm run lodecheck -- --map 1   dump a vault as ASCII
//
// The rules pinned here: no jump, diagonal-only dig (straight down only from
// inside a pit), refilling holes that kill their rider, walkers that fall into
// open pits, pit climb-out, guards that fall in / climb out / steal gold, the
// three-stratum ground, the deep-shaft multi-cell burial that PAYS the
// original's 500 for a buried guard, and the exit ladder that only appears
// when every gold is in the runner's hands. There is no clock.

import { LEVELS, buildLevel } from '../src/games/LodeRunnerLite/levels.js'
import {
    CFG, W, H, EMPTY, BRICK, SOLID, ROPE, LADDER, GOLD, ACTS,
    makeGame, applyAction, step, planStep, replay, stateHash,
} from '../src/games/LodeRunnerLite/sim.js'

const args = process.argv.slice(2)
const MUT = args.includes('--mutate')
const mapArg = args.includes('--map') ? +args[args.indexOf('--map') + 1] : null

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

const CELL = (t) => ({ [SOLID]: '=', [BRICK]: '#', [ROPE]: '~', [LADDER]: '|', [GOLD]: '*', [EMPTY]: '.' })[t] ?? '?'
if (mapArg !== null) {
    const b = buildLevel(mapArg)
    console.log(`VAULT ${mapArg} — ${b.meta.name}  spawn(${b.meta.spawn.x},${b.meta.spawn.y}) exit(${b.meta.exit.x},${b.meta.exit.y}) need=${b.meta.need}`)
    for (let y = 0; y < H; y++) {
        let line = ''
        for (let x = 0; x < W; x++) {
            const g = b.meta.guards.find((gd) => gd.x === x && gd.y === y)
            line += g ? 'G' : (x === b.meta.spawn.x && y === b.meta.spawn.y ? 'P' : x === b.meta.exit.x && y === b.meta.exit.y ? 'E' : CELL(b.grid[y * W + x]))
        }
        console.log(line)
    }
    process.exit(0)
}

const supportT = (t) => t === BRICK || t === SOLID || t === LADDER
const solidT = (t) => t === BRICK || t === SOLID

// #1952 STRATA LAW: the ground of every vault is exactly three diggable brick
// layers (rows H-3..H-1), and the walk row above them is open floor.
const strataLaw = (grid) => {
    for (let y = H - 3; y < H; y++) {
        for (let x = 1; x < W - 1; x++) if (grid[y * W + x] !== BRICK) return false
    }
    let walkOpen = 0
    for (let x = 1; x < W - 1; x++) if (!solidT(grid[(H - 4) * W + x])) walkOpen++
    return walkOpen >= 4
}

// the shell's own tick shape, mirrored: act on the moveEvery phase, capture
// events on BOTH sides of step() (applyAction pushes its events BEFORE step
// clears the array — the browser swallowed exactly that once).
function drive(g, capTicks) {
    const evs = new Set()
    let shared = 0
    let floatBad = null        // #2004: stand-mode over a live hole without the lip flag
    const max = capTicks ?? 6000
    while (!g.end && g.tick < max) {
        if (g.tick % CFG.moveEvery === 0) {
            const a = planStep(g)
            if (a && applyAction(g, g.player, a, { dig: false })) g.cmds.push({ tick: g.tick, act: a })
        }
        for (const e of g.events.splice(0)) evs.add(e.type)
        step(g)
        for (const e of g.events.splice(0)) evs.add(e.type)
        if (g.player.alive && g.guards.some((gd) => gd.alive && gd.x === g.player.x && gd.y === g.player.y)) shared++
        if (!floatBad && g.ents.some((e) => e.alive && e.mode === 'stand' && !e.onLip && e.y + 1 < H && g.holeAge[e.y * W + e.x + 1] > 0)) {
            floatBad = `an entity stands over a live hole at tick ${g.tick}`
        }
    }
    return { evs, shared, hash: stateHash(g), floatBad }
}

// #1991 — the live-chain script for THE ROPE: real inputs from the real spawn
// carve the two-cell shaft at column 9 by the ladder and climb away; both
// hunters route across the mouth and ride the same closing brick. Returns the
// receipts the scenario grades. Shared with the mutant that flattens the pair.
const CHAIN_SCRIPT = [
    ...Array(10).fill('ArrowRight'), 'ArrowLeft', 'ArrowDown', 'ArrowLeft', 'ArrowDown',
    'ArrowUp', 'ArrowUp', 'ArrowLeft',
    ...Array(13).fill('ArrowUp'),
]
const liveChain = (g, maxTicks = 400) => {
    const p = g.player
    const out = { chain: null, pursued: new Set(), mouths: 0, gold0: 0 }
    let si = 0
    for (let t = 0; t < maxTicks && !g.end && !out.chain; t++) {
        if (g.tick % CFG.moveEvery === 0 && si < CHAIN_SCRIPT.length) {
            applyAction(g, p, CHAIN_SCRIPT[si++], { dig: true })
        }
        step(g)
        for (const e of g.events) {
            if (e.type === 'pursued') out.pursued.add(e.id)
            else if (e.type === 'fallInto' && e.x === 9 && e.y === 15) out.mouths++
            else if (e.type === 'gold') out.gold0++
            else if (e.type === 'guardBuried' && e.n >= 2) out.chain = e
        }
        g.events.length = 0
    }
    return out
}

// ------------------------------------------------- construction contracts ----
section('CONSTRUCTION — every vault carves honestly (levels.js contracts 1-4)')
for (let i = 0; i < LEVELS.length; i++) {
    const b = buildLevel(i)
    const { grid } = b
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? SOLID : grid[y * W + x])
    let bad = null
    for (let y = 0; y < H && !bad; y++) {
        for (let x = 0; x < W && !bad; x++) {
            const t = grid[y * W + x]
            if (t === ROPE && !(at(x, y + 1) === EMPTY || at(x, y + 1) === LADDER || at(x, y + 1) === GOLD)) bad = `rope at ${x},${y} has support (${at(x, y + 1)}) under it`
            else if (t !== SOLID && y < H - 3) {   // the three rock strata may sit sealed: you DIG into them from the pit above (#1942, deepened #1952)
                const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !solidT(at(x + dx, y + dy)))
                const hanging = at(x, y - 1) === ROPE
                if (!n.length && !hanging) bad = `cell ${x},${y} is entombed on all four sides`
                else if (!n.length && hanging && !supportT(at(x, y + 1))) bad = `hanging cell ${x},${y} has neither a neighbour nor support`
            }
        }
    }
    ok(!bad, `${b.meta.name}: ${bad}`)
    for (const [what, p] of [['spawn', b.meta.spawn], ...b.meta.guards.map((gd, k) => [`guard ${k}`, gd])]) {
        ok(supportT(at(p.x, p.y + 1)), `${b.meta.name}: ${what} at ${p.x},${p.y} does not stand on support`)
    }
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (grid[y * W + x] !== GOLD) continue
            ok(supportT(at(x, y + 1)) || at(x, y - 1) === ROPE, `${b.meta.name}: gold at ${x},${y} neither stands on nor hangs from anything`)
        }
    }
    // the exit ladder: a run of LADDER in the exit column, with the exit cell
    // at its TOP rung and the bottom rung reaching the floor the runner walks on
    const ex = b.meta.exit
    let ladderRun = 0
    for (let y = ex.y; y < H; y++) if (grid[y * W + ex.x] === LADDER) ladderRun++
    ok(ladderRun >= 3, `${b.meta.name}: the exit ladder is not a ladder run (${ladderRun} cells in col ${ex.x})`)
    ok(supportT(at(ex.x, ex.y + ladderRun + 1)) || at(ex.x, ex.y + ladderRun + 1) === LADDER, `${b.meta.name}: the exit ladder does not reach the floor`)
    ok(strataLaw(grid), `${b.meta.name}: the ground is not three diggable brick strata over an open walk row — the vault lost its third stratum (#1952)`)
    // every rope line is reachable: a ladder TOP feeds its hang row
    for (let y = 0; y < H; y++) {
        let x = 1
        while (x < W - 1) {
            if (grid[y * W + x] !== ROPE) { x++; continue }
            let runEnd = x
            while (runEnd + 1 < W - 1 && grid[y * W + runEnd + 1] === ROPE) runEnd++
            const opens = Array.from({ length: runEnd - x + 1 }, (_, k) => x + k)
                .some((rx) => [-1, 0, 1].some((dx) => {
                    const lx = rx + dx
                    return lx > 0 && lx < W - 1 && at(lx, y + 1) === LADDER && at(lx, y + 2) === LADDER && at(lx, y) !== LADDER
                }))
            ok(opens, `${b.meta.name}: rope run ${x}..${runEnd} at row ${y} has no ladder top feeding its hang row`)
            x = runEnd + 1
        }
    }
}
// #1991 — the shelf carries a MULTI-GUARD vault: the chain rung of the trap
// ladder must be reachable in actual play, and that needs a live pair. THE
// ROPE hunts with two; flatten it back to one and the chain is a pinned law
// with no home, which is exactly what the mutant below proves.
ok(LEVELS.reduce((n, l) => n + l.guards.length, 0) >= 4, 'the shelf no longer carries four hunters — a multi-guard vault was flattened (#1991)')
ok(LEVELS[1].name === 'THE ROPE' && LEVELS[1].guards.length >= 2, 'THE ROPE shipped without its second guard — the trap ladder lost its live pair (#1991)')

// ------------------------------------------------ each vault, solved live ----
const receipts = {}
for (let i = 0; i < LEVELS.length; i++) {
    section(`VAULT ${i} — ${LEVELS[i].name}: the no-jump, no-dig autopilot that IS the attract demo`)
    const b = buildLevel(i)
    const t0 = Date.now()
    const g = makeGame(b.meta, b.grid)
    const r = drive(g)
    ok(g.win && g.end === 'clear', `not winnable: end=${g.end} tick=${g.tick} have=${g.have}/${g.need}`)
    ok(!r.floatBad, `${b.meta.name}: LIP LAW broken on the solver's route — ${r.floatBad}`)
    ok(g.have === g.need, `cleared with ${g.have}/${g.need} gold — the exit opened early`)
    ok(g.lives >= 1, `the witness spent every life (${g.lives}) — a winning run must not run dry`)
    const jumps = g.cmds.filter((c) => c.act.startsWith('JUMP')).length
    ok(jumps === 0, `${b.meta.name}: the witness jumped ${jumps} times — the classic has no jump`)
    ok(!r.evs.has('dig'), `${b.meta.name}: the witness dug — digging is the player's tool, not the solver's route`)
    ok(Date.now() - t0 < 6000, `solved in ${Date.now() - t0} ms — the audit must stay a second, not a minute`)
    for (const token of (b.meta.proves || [])) {
        ok(r.evs.has(token), `${b.meta.name}: claims '${token}' but the witness never fired one`)
    }

    // determinism, three ways: replay the stream, re-solve from scratch, and
    // drop one interior command (which MUST change the hash).
    const tail = g.cmds.length && g.cmds[g.cmds.length - 1].tick >= g.tick ? 1 : 0
    const g2 = replay(b.meta, b.grid, g.cmds.map((c) => ({ ...c })), { maxTicks: g.tick + tail })
    ok(stateHash(g2) === r.hash, `${b.meta.name}: replay(state) diverged — ${stateHash(g2)} != ${r.hash}`)
    const b2 = buildLevel(i)
    const g3 = makeGame(b2.meta, b2.grid)
    const r3 = drive(g3)
    ok(r3.hash === r.hash, `${b.meta.name}: re-solving the same vault found a different route — the solver is not pure`)
    const mid = g.cmds.filter((c) => c.tick > 10 && c.tick < g.tick - 10)
    if (mid.length) {
        const dropped = g.cmds.filter((c) => c !== mid[Math.floor(mid.length / 2)])
        const g4 = replay(b.meta, b.grid, dropped, { maxTicks: g.tick + tail })
        ok(stateHash(g4) !== r.hash, `${b.meta.name}: dropping a command changed NOTHING — hash-blind check`)
    }
    // robustness: one fewer life still wins (a single misstep must not lose it)
    const tight = makeGame({ ...b.meta, lives: (b.meta.lives ?? CFG.lives) - 1 }, b.grid)
    const rt = drive(tight)
    ok(tight.win, `${b.meta.name}: one fewer life lost the vault — the route needs the full life supply`)
    receipts[i] = { tick: g.tick, lives: g.lives, cmds: g.cmds.length, evs: [...r.evs] }
}

// ------------------------------------------------- the classic rules, pinned ----
section('RULES — the 1983 contract, each pinned by a scenario')
{
    // NO JUMP: no jump act, and a flat-ground Up does not rise.
    ok(!ACTS.some((a) => a.startsWith('JUMP')), 'a JUMP act still exists in the vocabulary')
    const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
    const y0 = p.y
    applyAction(g, p, 'ArrowUp'); step(g)
    ok(p.y === y0, `the runner rose from flat ground (${y0} -> ${p.y}) — jump is back`)
}
{
    // DIAGONAL DIG: face and push down dig the brick below-LEFT/RIGHT, never straight down.
    const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
    ok(applyAction(g, p, 'ArrowRight'), 'run refused at spawn')
    const diag = (p.y + 1) * W + (p.x + 1)        // below-right, the way it faces
    const straight = (p.y + 1) * W + p.x
    ok(applyAction(g, p, 'ArrowDown'), 'down-dig at a brick refused')
    ok(g.grid[diag] === EMPTY && g.holeAge[diag] > 0, 'the diagonal brick was not dug to a hole')
    ok(g.grid[straight] === BRICK, 'the straight-down brick was dug — diagonal-only is broken')
}
{
    // REFILL: a dug hole grows its brick back after the fuse.
    const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
    applyAction(g, p, 'ArrowRight'); applyAction(g, p, 'ArrowDown')
    const cell = (p.y + 1) * W + (p.x + 1)
    for (let k = 0; k < CFG.refill + 4; k++) step(g)
    ok(g.grid[cell] === BRICK && g.holeAge[cell] === 0, 'the hole did not refill to brick')
}
{
    // BURIAL: a guard in a refilling hole dies and re-enters at the top.
    const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
    applyAction(g, p, 'ArrowRight'); applyAction(g, p, 'ArrowDown')   // a hole below-right
    const cell = (p.y + 1) * W + (p.x + 1)
    const gd = g.guards[0]
    gd.x = cell % W; gd.y = (cell - gd.x) / W; gd.mode = 'stand'
    const saveTrap = CFG.guardTrap; CFG.guardTrap = 1e6   // pin it so the refill finds it
    let buried = false
    for (let k = 0; k < CFG.refill + 20 && !buried; k++) { step(g); if (g.events.some((e) => e.type === 'guardBuried')) buried = true; g.events.length = 0 }
    CFG.guardTrap = saveTrap
    ok(buried, 'a guard in a refilling hole was never buried')
    ok(gd.x === gd.home.x && gd.y === gd.home.y, 'the buried guard did not respawn at the top')
}
{
    // CLIMB OUT: a guard in a shallow pit sits it out, then climbs back to the floor.
    const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
    applyAction(g, p, 'ArrowRight'); applyAction(g, p, 'ArrowDown')   // a 1-cell pit below-right
    const cell = (p.y + 1) * W + (p.x + 1)
    const gd = g.guards[0]
    gd.x = cell % W; gd.y = (cell - gd.x) / W; gd.mode = 'stand'
    let climbed = false
    for (let k = 0; k < CFG.guardTrap + 20 && !climbed; k++) { step(g); if (g.events.some((e) => e.type === 'climbOut')) climbed = true; g.events.length = 0 }
    ok(climbed, 'a guard in a shallow pit never climbed out')
    ok(gd.alive && gd.y <= gd.home.y, `the guard did not climb back to the floor (y=${gd.y})`)
}
{
    // LIP LAW (#2004): nobody paints standing in mid-air. A body climbing out
    // of a pit whose hole is STILL OPEN ends the climb clinging to the lip
    // (hands on the edge, legs in the hole) until it steps onto supported
    // floor. Walkers and fallers over the same mouth still drop into the pit —
    // route legality and the trap economy are untouched; the flag is derived
    // deterministically at every arrival, so replay hashes are unchanged.
    const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
    // (a) the guard's clocked escape clings while the fuse is open
    applyAction(g, p, 'ArrowRight'); applyAction(g, p, 'ArrowDown')   // a 1-cell pit below-right
    const cell = (p.y + 1) * W + (p.x + 1)
    const gd = g.guards[0]
    gd.x = cell % W; gd.y = (cell - gd.x) / W; gd.mode = 'stand'
    const saveChase = CFG.guardChase; CFG.guardChase = false   // the pace-move must not step it off the lip inside the same tick
    let climbed = false
    for (let k = 0; k < CFG.guardTrap + 20 && !climbed; k++) { step(g); if (g.events.some((e) => e.type === 'climbOut')) climbed = true; g.events.length = 0 }
    ok(climbed && gd.mode === 'stand' && g.holeAge[cell] > 0 && gd.onLip === true,
        `guard escape over an open pit never ended as a lip cling (climbed=${climbed} mode=${gd.mode} open=${g.holeAge[cell] > 0} lip=${gd.onLip})`)
    ok(applyAction(g, gd, 'ArrowLeft', { dig: false }) && gd.onLip === false, 'a clinging guard could not step off the lip onto supported floor')
    CFG.guardChase = saveChase
    // (b) the runner's pitClimb clings too, and clinging does not brick the
    // escape: one supported side-step and the flag is gone.
    const b2 = buildLevel(0); const g2 = makeGame(b2.meta, b2.grid); const p2 = g2.player
    const sx = p2.x, sy = p2.y
    applyAction(g2, p2, 'ArrowRight'); applyAction(g2, p2, 'ArrowDown')       // dig below-right
    applyAction(g2, p2, 'ArrowRight')                                           // step over the mouth -> fall in
    for (let k = 0; k < 8 && !(p2.mode === 'stand' && p2.y === sy + 1); k++) step(g2)
    ok(p2.mode === 'stand' && p2.y === sy + 1, `runner never dropped into the pit (mode=${p2.mode} y=${p2.y})`)
    ok(applyAction(g2, p2, 'ArrowUp') && p2.y === sy && p2.onLip === true, 'climbing out of the open pit did not cling to the lip')
    ok(applyAction(g2, p2, 'ArrowLeft') && p2.onLip === false, 'stepping from the lip onto supported floor did not clear the cling')
    // (c) the lip is not a floor: stepping back down drops into the pit.
    const b3 = buildLevel(0); const g3 = makeGame(b3.meta, b3.grid); const p3 = g3.player
    applyAction(g3, p3, 'ArrowRight'); applyAction(g3, p3, 'ArrowDown')
    applyAction(g3, p3, 'ArrowRight')
    for (let k = 0; k < 8 && !(p3.mode === 'stand' && p3.y === sy + 1); k++) step(g3)
    applyAction(g3, p3, 'ArrowUp')                                            // cling the lip
    applyAction(g3, p3, 'ArrowDown')                                          // let go
    for (let k = 0; k < 8 && !(p3.mode === 'stand' && p3.y === sy + 1); k++) step(g3)
    ok(p3.mode === 'stand' && p3.y === sy + 1 && p3.onLip === false, 'leaving the lip downward did not drop the runner into its pit')
}
{
    // GUARD GOLD: a guard pockets the gold it walks over, then drops it.
    const b = buildLevel(1); const g = makeGame(b.meta, b.grid)
    const gd = g.guards[0]
    const gx = 4, gy = 15                          // the floor gold in THE ROPE
    ok(g.grid[gy * W + gx] === GOLD, 'fixture: THE ROPE lost its floor gold')
    gd.x = gx + 1; gd.y = gy; gd.mode = 'stand'
    applyAction(g, gd, 'ArrowLeft', { dig: false })
    ok(gd.carry === true && g.grid[gy * W + gx] === EMPTY, 'the guard did not pick up the gold it stepped onto')
    let dropped = false
    for (let k = 0; k < CFG.guardCarry + 10 && !dropped; k++) { step(g); if (g.events.some((e) => e.type === 'goldDrop')) dropped = true; g.events.length = 0 }
    ok(dropped, 'the guard never dropped the gold it stole')
}
{
    // THE LADDER APPEARS: the exit ladder is hidden until every gold is in hand.
    const b = buildLevel(0); const g = makeGame(b.meta, b.grid)
    const top = g.exit.y * W + g.exit.x
    ok(g.grid[top] === EMPTY, 'the exit ladder is not hidden before the gold is all in')
    const g2 = makeGame(buildLevel(0).meta, buildLevel(0).grid)
    drive(g2)
    ok(g2.win && g2.grid[g2.exit.y * W + g2.exit.x] === LADDER, 'the exit ladder was not revealed at the win')
}
{
    // NO CLOCK: an idle vault never ends on a timer.
    const b = buildLevel(0); const g = makeGame(b.meta, b.grid)
    for (let k = 0; k < 2000 && !g.end; k++) step(g)
    ok(g.end !== 'time', `the vault ended on a clock (${g.end}) — there is no clock`)
}

// ---------------------------------------------------- the shaft, carved live ----
// #1942 carved the deep shaft; #1952 deepened it to three strata: dig from the
// surface, walk over the mouth, dig twice from inside the pit, clamber three
// climbs back. And a guard that takes the shortcut across the mouth rides the
// lids down into a paid grave.
{
    // CARVED SHAFT & ESCAPE: drop in, deepen twice, climb out — no life lost.
    const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
    ok(applyAction(g, p, 'ArrowRight'), 'run refused at spawn')
    ok(applyAction(g, p, 'ArrowDown'), 'surface dig refused')          // hole at (p.x+1, 16)
    const hx = p.x + 1
    ok(applyAction(g, p, 'ArrowRight'), 'the step over the pit mouth was refused')   // hole below the mouth
    let landed = false
    for (let k = 0; k < 8 && !landed; k++) { step(g); landed = p.mode === 'stand' && p.y === 16; g.events.length = 0 }
    ok(landed && p.alive, `the walker did not fall into the open pit (y=${p.y}, mode=${p.mode})`)
    ok(g.holeAge[16 * W + hx] > 0, 'the pit fused shut too early for the scenario')
    ok(g.grid[17 * W + hx] === BRICK && g.grid[18 * W + hx] === BRICK, 'the floor-rock under the pit is not diggable brick — the vault lost a stratum')
    ok(applyAction(g, p, 'ArrowDown'), 'the deep dig at the pit bottom was refused')
    ok(g.grid[17 * W + hx] === EMPTY && g.holeAge[17 * W + hx] > 0, 'the second stratum was not carved')
    ok(p.y === 17 && p.alive, `the digger did not drop to the second floor (y=${p.y})`)
    ok(applyAction(g, p, 'ArrowDown'), 'the third-stratum dig at the pit bottom was refused')
    ok(g.grid[18 * W + hx] === EMPTY && g.holeAge[18 * W + hx] > 0, 'the shaft bottom (row 18) was not carved — the three-cell shaft is not live')
    ok(p.y === 18 && p.alive, `the digger did not drop to the shaft floor (y=${p.y})`)
    ok(applyAction(g, p, 'ArrowUp'), 'the first pit climb was refused')
    ok(p.y === 17, `the first climb did not raise the runner (y=${p.y})`)
    ok(applyAction(g, p, 'ArrowUp'), 'the second pit climb was refused')
    ok(p.y === 16, `the second climb did not raise the runner (y=${p.y})`)
    ok(applyAction(g, p, 'ArrowUp'), 'the third pit climb was refused')
    ok(p.y === 15, `the third climb did not clear the lip (y=${p.y})`)
    ok(applyAction(g, p, 'ArrowLeft'), 'the runner could not walk off the lip')
    for (let k = 0; k < 10; k++) step(g)
    ok(p.alive && g.lives === (b.meta.lives ?? CFG.lives), `a carved-shaft escape cost a life (${p.lives}) — the climb must outrun a fresh fuse`)
}
{
    // DEEP BURIAL, CARVED & PAID: the three-cell shaft the runner just dug
    // swallows a guard that walks over the mouth — it rides the first lid on
    // the way up when the deep fuse closes, and the dig pays the original's
    // 500 for the kill.
    const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
    applyAction(g, p, 'ArrowRight'); applyAction(g, p, 'ArrowDown')    // hole at (hx, 16)
    const hx = p.x + 1
    applyAction(g, p, 'ArrowRight')                                     // drop into it
    for (let k = 0; k < 4; k++) { step(g); g.events.length = 0 }
    applyAction(g, p, 'ArrowDown')                                      // carve the second stratum
    applyAction(g, p, 'ArrowDown')                                      // carve the third; runner at row 18
    applyAction(g, p, 'ArrowUp'); applyAction(g, p, 'ArrowUp'); applyAction(g, p, 'ArrowUp')
    applyAction(g, p, 'ArrowLeft')                                      // get out of the way
    const gd = g.guards[0]
    gd.x = hx + 1; gd.y = 15; gd.mode = 'stand'; gd.trapCount = 0
    const scoreBefore = g.score
    ok(applyAction(g, gd, 'ArrowLeft', { dig: false }), 'the guard was blocked at its own pit mouth — holeFall is not reaching guards')
    let rode = false, buried = false, paid = -1
    for (let k = 0; k < CFG.refill + 60 && !buried; k++) {
        step(g)
        if (gd.alive && gd.mode === 'stand' && gd.x === hx && gd.y === 17) rode = true   // climbed off the shaft floor onto the first lid
        const be = g.events.find((e) => e.type === 'guardBuried')
        if (be) { buried = true; paid = be.pay ?? 0 }
        g.events.length = 0
    }
    ok(rode, 'the guard never climbed up the shaft — the climb law stopped working in deep pits')
    ok(buried, 'the carved three-cell shaft never buried the guard — the multi-cell law is not live')
    // the grave sits at row 17 — one stratum below the surface floor — so the
    // depth law adds one guardPay to the original's 500 (#1959).
    const deepWants = CFG.guardPay * (1 + CFG.deepPay)
    ok(paid === deepWants && g.score === scoreBefore + deepWants,
        `the buried guard paid ${paid} and moved the score ${g.score - scoreBefore} — a depth-${17 - 16 + 1} grave pays ${deepWants} (guardPay + one stratum)`)
    ok(gd.x === gd.home.x && gd.y === gd.home.y, 'the buried guard did not respawn at the top')
    ok(p.alive && g.lives === (b.meta.lives ?? CFG.lives), 'the runner died in a scenario meant for the guard')
}
{
    // CHAIN PAY, THE ORIGINAL'S SIGNATURE: ONE closing brick that catches TWO
    // pinned guards pays the trap ladder (double), not twice the single grave —
    // and three is worth more than double (500, 1000, 3000...). The vault ships
    // one guard, so the second is placed by hand — the LAW is what is graded.
    const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
    applyAction(g, p, 'ArrowRight'); applyAction(g, p, 'ArrowDown')     // hole at (hx, 16)
    const cx = p.x + 1, cy = 16
    const mkGd = (id) => ({ x: cx, y: cy, mode: 'stand', vx: 0, vy: 0, face: 1, alive: true, isGuard: true, id, home: { x: cx + 8, y: 15 }, trapCount: 0, carry: false, carryCount: 0 })
    const gdA = g.guards[0]
    gdA.x = cx; gdA.y = cy; gdA.mode = 'stand'; gdA.trapCount = 0
    const gdB = mkGd(1)
    g.guards.push(gdB); g.ents.push(gdB); g.guardDist.push(Infinity)
    const scoreBefore = g.score
    const saveTrap = CFG.guardTrap; CFG.guardTrap = 1e6                  // pin both so the refill finds them
    let be = null
    for (let k = 0; k < CFG.refill + 20 && !be; k++) { step(g); be = g.events.find((e) => e.type === 'guardBuried') || null; g.events.length = 0 }
    CFG.guardTrap = saveTrap
    ok(be && be.n === 2, `the closing brick caught ${be ? be.n : 0} guards — the chain law is not counting one refill's catch`)
    ok(be && be.pay === CFG.guardPay * CFG.chainLadder[1], `two guards in one hole paid ${be ? be.pay : '-'} — the original's ladder pays ${CFG.guardPay * CFG.chainLadder[1]} (double), never twice the single grave`)
    ok(be && g.score === scoreBefore + CFG.guardPay * CFG.chainLadder[1], 'the chain pay did not land on the score')
    ok(gdA.x === gdA.home.x && gdB.x === gdB.home.x, 'a chain-buried guard did not respawn at the top')
}
{
    // LIVE CHAIN, REAL SPAWNS (#1991): THE ROPE's second hunter makes the
    // original's signature reachable in actual play. A scripted stream (real
    // inputs from the real spawn — no hand-placed bodies) carves the two-cell
    // shaft at column 9 by the ladder, and both guards, routing across the
    // mouth to reach the runner, drop in one behind the other. The closing
    // brick catches the PAIR: the trap ladder pays double for one refill's
    // catch, and the grave's stratum adds its depth premium on top.
    //  (script: run to x11, face left, dig (9,16), drop in, deepen to (9,17),
    //   clamber out onto the ladder foot, climb away while the fuse closes.)
    const b = buildLevel(1); const g = makeGame(b.meta, b.grid)
    const scoreBefore = g.score
    const r = liveChain(g)
    ok(r.pursued.has(0) && r.pursued.has(1), `THE ROPE's hunters: only guard(s) ${[...r.pursued]} filed a pursuit — two wings must both hunt (#1991)`)
    ok(r.mouths >= 2, `${r.mouths} guard(s) took the shortcut across the mouth — holeFall is not reaching the pair`)
    ok(r.chain && r.chain.n === 2, `the closing brick caught ${r.chain ? r.chain.n : 0} guards in live play — the chain rung never fired from real spawns (#1991)`)
    ok(r.chain && r.chain.pay === 1500 && r.chain.depth === 2,
        `the live chain paid ${r.chain ? r.chain.pay : '-'} at depth ${r.chain ? r.chain.depth : '-'} — the original's double at stratum two pays 1500 (ladder 2x + one stratum)`)
    ok(r.chain && g.score === scoreBefore + 500 + 1500, 'the live chain pay did not land on the score (gold 500 + chain 1500)')
    ok(g.lives === (b.meta.lives ?? CFG.lives), 'the runner lost a life in a scenario meant for the guards')
    ok(g.guards.every((gd) => gd.alive && gd.y === 15 && gd.x >= 22), 'a chain-buried hunter did not respawn on the top wing')
}
{
    // SHAFT LAW, MEASURED: two climbs and three climbs both cost more than one
    // fuse. Assert the clocks themselves — the law is the arithmetic.
    ok(2 * CFG.guardTrap > CFG.refill, `a two-cell shaft is escapable by clock (${2 * CFG.guardTrap} <= ${CFG.refill}) — deep burial is a myth with these numbers`)
    ok(3 * CFG.guardTrap > CFG.refill, `a three-cell shaft is escapable by clock (${3 * CFG.guardTrap} <= ${CFG.refill}) — the deepest grave is a myth with these numbers`)
}

// --------------------------------------------------------------- mutants ----
if (MUT) {
    section('MUTATIONS — each one MUST turn an honest check red')
    const tryMut = (name, apply, probe) => {
        const base = probe()
        ok(base, `mutation harness broken: baseline for '${name}' is already false`)
        const save = { ...CFG }
        Object.assign(CFG, apply)
        const verdict = probe()
        Object.assign(CFG, save)
        console.log(`  mut ${name}: ${verdict ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(!verdict, `${name} SURVIVED — a check stopped touching this rule`)
    }
    tryMut('dig=false (the floor never breaks)', { dig: false }, () => {
        const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
        applyAction(g, p, 'ArrowRight'); applyAction(g, p, 'ArrowDown')
        const diag = (p.y + 1) * W + (p.x + 1)
        return g.grid[diag] === EMPTY && g.holeAge[diag] > 0
    })
    tryMut('guardChase=false (guards stand post)', { guardChase: false }, () => {
        const b = buildLevel(0); const g = makeGame(b.meta, b.grid)
        return drive(g).evs.has('pursued')
    })
    tryMut('ropeCatch=false (a falling body misses the line)', { ropeCatch: false }, () => {
        const b = buildLevel(1); const g = makeGame(b.meta, b.grid); const p = g.player
        p.x = 10; p.y = 5; p.mode = 'air'; p.vy = 0
        step(g)
        return p.mode === 'hang'
    })
    tryMut('guardHole=false (guards never fall in)', { guardHole: false }, () => {
        const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
        applyAction(g, p, 'ArrowRight'); applyAction(g, p, 'ArrowDown')
        const cell = (p.y + 1) * W + (p.x + 1)
        const gd = g.guards[0]
        gd.x = cell % W; gd.y = (cell - gd.x) / W; gd.mode = 'stand'
        let climbed = false
        for (let k = 0; k < CFG.guardTrap + 20 && !climbed; k++) { step(g); if (g.events.some((e) => e.type === 'climbOut')) climbed = true; g.events.length = 0 }
        return climbed
    })
    tryMut('goldSteal=false (guards cannot lift gold)', { goldSteal: false }, () => {
        const b = buildLevel(1); const g = makeGame(b.meta, b.grid)
        const gd = g.guards[0]
        gd.x = 5; gd.y = 15; gd.mode = 'stand'
        applyAction(g, gd, 'ArrowLeft', { dig: false })
        return gd.carry === true
    })
    tryMut('holeFall=false (walkers skid across open pits)', { holeFall: false }, () => {
        const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
        applyAction(g, p, 'ArrowRight'); applyAction(g, p, 'ArrowDown')
        applyAction(g, p, 'ArrowRight')                       // over the mouth
        let fell = false
        for (let k = 0; k < 8 && !fell; k++) { step(g); fell = p.y === 16; g.events.length = 0 }
        return fell
    })
    tryMut('digDeep=false (the pit bottom is iron)', { digDeep: false }, () => {
        const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
        applyAction(g, p, 'ArrowRight'); applyAction(g, p, 'ArrowDown')
        const hx = p.x + 1
        applyAction(g, p, 'ArrowRight')
        for (let k = 0; k < 8 && !(p.mode === 'stand' && p.y === 16); k++) step(g)
        applyAction(g, p, 'ArrowDown')
        return g.grid[17 * W + hx] === EMPTY && g.holeAge[17 * W + hx] > 0
    })
    tryMut('digDeep=false (the third stratum is iron)', { digDeep: false }, () => {
        const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
        applyAction(g, p, 'ArrowRight'); applyAction(g, p, 'ArrowDown')
        const hx = p.x + 1
        applyAction(g, p, 'ArrowRight')
        for (let k = 0; k < 8 && !(p.mode === 'stand' && p.y === 16); k++) step(g)
        applyAction(g, p, 'ArrowDown')
        for (let k = 0; k < 8 && !(p.mode === 'stand' && p.y === 17); k++) step(g)
        applyAction(g, p, 'ArrowDown')
        return g.grid[18 * W + hx] === EMPTY && g.holeAge[18 * W + hx] > 0
    })
    tryMut('guardPay=0 (a buried guard is worth nothing)', { guardPay: 0 }, () => {
        const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
        applyAction(g, p, 'ArrowRight'); applyAction(g, p, 'ArrowDown')
        const cell = (p.y + 1) * W + (p.x + 1)
        const gd = g.guards[0]
        gd.x = cell % W; gd.y = (cell - gd.x) / W; gd.mode = 'stand'
        const saveTrap = CFG.guardTrap; CFG.guardTrap = 1e6   // pin it so the refill finds it
        let paid = 0
        for (let k = 0; k < CFG.refill + 20; k++) {
            step(g)
            if (g.events.some((e) => e.type === 'guardBuried')) paid = g.score
            g.events.length = 0
        }
        CFG.guardTrap = saveTrap
        return paid === 500                                   // the original's number, independent of CFG
    })
    tryMut('chainLadder=flat (chain burials pay nothing extra)', { chainLadder: [1, 1, 1, 1, 1, 1] }, () => {
        const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
        applyAction(g, p, 'ArrowRight'); applyAction(g, p, 'ArrowDown')
        const cx = p.x + 1, cy = 16
        const gdA = g.guards[0]
        gdA.x = cx; gdA.y = cy; gdA.mode = 'stand'; gdA.trapCount = 0
        const gdB = { x: cx, y: cy, mode: 'stand', vx: 0, vy: 0, face: 1, alive: true, isGuard: true, id: 1, home: { x: cx + 8, y: 15 }, trapCount: 0, carry: false, carryCount: 0 }
        g.guards.push(gdB); g.ents.push(gdB); g.guardDist.push(Infinity)
        const saveTrap = CFG.guardTrap; CFG.guardTrap = 1e6
        let pay = 0
        for (let k = 0; k < CFG.refill + 20 && !pay; k++) {
            step(g)
            const be = g.events.find((e) => e.type === 'guardBuried')
            if (be) pay = be.pay ?? 0
            g.events.length = 0
        }
        CFG.guardTrap = saveTrap
        return pay === 1000                                   // the original's double, independent of CFG
    })
    tryMut('deepPay=0 (the stratum bonus is dead)', { deepPay: 0 }, () => {
        const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
        applyAction(g, p, 'ArrowRight'); applyAction(g, p, 'ArrowDown')
        const hx = p.x + 1
        applyAction(g, p, 'ArrowRight')
        for (let k = 0; k < 4; k++) { step(g); g.events.length = 0 }
        applyAction(g, p, 'ArrowDown'); applyAction(g, p, 'ArrowDown')   // carve to row 18
        applyAction(g, p, 'ArrowUp'); applyAction(g, p, 'ArrowUp'); applyAction(g, p, 'ArrowUp')
        applyAction(g, p, 'ArrowLeft')
        const gd = g.guards[0]
        gd.x = hx + 1; gd.y = 15; gd.mode = 'stand'; gd.trapCount = 0
        applyAction(g, gd, 'ArrowLeft', { dig: false })                    // over the mouth, into the shaft
        let pay = 0
        for (let k = 0; k < CFG.refill + 60 && !pay; k++) {
            step(g)
            const be = g.events.find((e) => e.type === 'guardBuried')
            if (be) pay = be.pay ?? 0
            g.events.length = 0
        }
        return pay === 1000                                   // depth-2 grave: guardPay + one stratum, independent of CFG
    })
    tryMut('pitClimb=false (the pit is a grave for everyone)', { pitClimb: false }, () => {
        const b = buildLevel(0); const g = makeGame(b.meta, b.grid); const p = g.player
        applyAction(g, p, 'ArrowRight'); applyAction(g, p, 'ArrowDown')
        applyAction(g, p, 'ArrowRight')
        for (let k = 0; k < 8 && !(p.mode === 'stand' && p.y === 16); k++) step(g)
        return applyAction(g, p, 'ArrowUp') && p.y === 15
    })
    // the strata law must actually read the vault ground: hand it a two-stratum
    // vault (bottom rock row turned to concrete) and it MUST call it illegal.
    {
        const base = strataLaw(buildLevel(0).grid)
        ok(base, `mutation harness broken: baseline for 'strata=2' is already false`)
        const mut = Uint8Array.from(buildLevel(0).grid)      // copy — the live vault stays pristine
        for (let x = 1; x < W - 1; x++) mut[(H - 1) * W + x] = SOLID
        console.log(`  mut strata=2 (the bottom rock row is iron): ${strataLaw(mut) ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(!strataLaw(mut), 'strata=2 SURVIVED — the strata law does not touch the vault ground')
    }
    // #1991: flatten THE ROPE back to one guard. A lone hunter can only ever
    // pay single — the two-hunter receipts and the live chain must go red.
    {
        const base = liveChain(makeGame(buildLevel(1).meta, buildLevel(1).grid)).chain
        ok(base && base.n === 2, `mutation harness broken: baseline for 'rope=one guard' is already false`)
        const mutMeta = { ...buildLevel(1).meta, guards: [buildLevel(1).meta.guards[0]] }
        const verdict = liveChain(makeGame(mutMeta, buildLevel(1).grid)).chain?.n ?? 0
        console.log(`  mut rope=one guard (THE ROPE back to a single hunter): ${verdict >= 2 ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(verdict < 2, 'rope=one guard SURVIVED — the chain pay fired with a lone hunter; the pair contract is not graded')
    }
}

console.log(`\nlodecheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
console.log(`receipts: ${JSON.stringify(receipts)}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
