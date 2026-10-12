// LODE RUNNER-LITE — the Node audit, 1983 rules. No browser, no dev server:
// this file imports the SAME sim.js + levels.js the browser mounts and proves,
// before a single pixel is painted, that the vaults are winnable by the REAL
// no-jump, no-dig autopilot with guards hunting on the real pathfinder — and
// that every classic rule the issue named is load-bearing:
//
//   npm run lodecheck              the audit (~2 s)
//   npm run lodecheck -- --mutate  + five mutants that MUST die
//   npm run lodecheck -- --map 1   dump a vault as ASCII
//
// The rules pinned here: no jump, diagonal-only dig, refilling holes that kill
// their rider, guards that fall in / climb out / steal gold, and the exit
// ladder that only appears when every gold is in the runner's hands. There is
// no clock.

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
            const g = b.guards.find((gd) => gd.x === x && gd.y === y)
            line += g ? 'G' : (x === b.meta.spawn.x && y === b.meta.spawn.y ? 'P' : x === b.meta.exit.x && y === b.meta.exit.y ? 'E' : CELL(b.grid[y * W + x]))
        }
        console.log(line)
    }
    process.exit(0)
}

const supportT = (t) => t === BRICK || t === SOLID || t === LADDER
const solidT = (t) => t === BRICK || t === SOLID

// the shell's own tick shape, mirrored: act on the moveEvery phase, capture
// events on BOTH sides of step() (applyAction pushes its events BEFORE step
// clears the array — the browser swallowed exactly that once).
function drive(g, capTicks) {
    const evs = new Set()
    let shared = 0
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
    }
    return { evs, shared, hash: stateHash(g) }
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
            else if (t !== SOLID) {
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

// ------------------------------------------------ each vault, solved live ----
const receipts = {}
for (let i = 0; i < LEVELS.length; i++) {
    section(`VAULT ${i} — ${LEVELS[i].name}: the no-jump, no-dig autopilot that IS the attract demo`)
    const b = buildLevel(i)
    const t0 = Date.now()
    const g = makeGame(b.meta, b.grid)
    const r = drive(g)
    ok(g.win && g.end === 'clear', `not winnable: end=${g.end} tick=${g.tick} have=${g.have}/${g.need}`)
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
    // GUARD GOLD: a guard pockets the gold it walks over, then drops it.
    const b = buildLevel(1); const g = makeGame(b.meta, b.grid)
    const gd = g.guards[0]
    const gx = 4, gy = 16                          // the floor gold in THE ROPE
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
        gd.x = 5; gd.y = 16; gd.mode = 'stand'
        applyAction(g, gd, 'ArrowLeft', { dig: false })
        return gd.carry === true
    })
}

console.log(`\nlodecheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
console.log(`receipts: ${JSON.stringify(receipts)}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
