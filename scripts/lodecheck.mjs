// LODE RUNNER-LITE — the Node audit. No browser, no dev server: this file
// imports the SAME sim.js + levels.js the browser mounts and proves, before
// a single pixel is painted, that the three vaults are winnable by the real
// autopilot with guards hunting on the real pathfinder — and that the four
// muscles the issue named (destructible floors, pathfinding, ghost replay,
// determinism) are each load-bearing.
//
//   npm run lodecheck              the audit (~2 s)
//   npm run lodecheck -- --mutate  + six mutants that MUST die
//   npm run lodecheck -- --map 1   dump a vault as ASCII
//
// The determinism section is the issue's "recorded-input harness": every
// witness is re-replayed from its command stream and must land on the same
// state hash; a stream with one interior command dropped must NOT.
import { LEVELS, buildLevel } from '../src/games/LodeRunnerLite/levels.js'
import {
    CFG, W, H, EMPTY, BRICK, SOLID, ROPE, LADDER, GOLD, TRAP,
    makeGame, applyAction, step, planStep, replay, stateHash,
} from '../src/games/LodeRunnerLite/sim.js'

const args = process.argv.slice(2)
const MUT = args.includes('--mutate')
const mapArg = args.includes('--map') ? +args[args.indexOf('--map') + 1] : null

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

const CELL = (t) => ({ [SOLID]: '=', [BRICK]: '#', [ROPE]: '~', [LADDER]: '|', [GOLD]: '*', [TRAP]: 'o' })[t] ?? '.'
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

const supportT = (t) => t === BRICK || t === SOLID || t === TRAP || t === LADDER
const solidT = (t) => t === BRICK || t === SOLID

// the shell's own tick shape, mirrored: act on the moveEvery phase, capture
// events on BOTH sides of step() (applyAction pushes dig/jump before step
// clears the array — the browser swallowed exactly that bug in its first run)
function drive(g, capTicks) {
    const evs = new Set()
    let shared = 0
    const max = capTicks ?? g.meta.timeTicks
    while (!g.end && g.tick < max) {
        if (g.tick % CFG.moveEvery === 0) {
            const a = planStep(g)
            if (a && applyAction(g, g.player, a)) g.cmds.push({ tick: g.tick, act: a })
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
            // nothing a guard can stand on may sit under a rope; gold is the
            // exception carved ON PURPOSE — nuggets hang from the line, and
            // a nugget cell is not support
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
    for (const [what, p] of [['spawn', b.meta.spawn], ['exit', b.meta.exit], ...b.meta.guards.map((gd, k) => [`guard ${k}`, gd])]) {
        ok(supportT(at(p.x, p.y + 1)), `${b.meta.name}: ${what} at ${p.x},${p.y} does not stand on support`)
    }
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (grid[y * W + x] !== GOLD) continue
            ok(supportT(at(x, y + 1)) || at(x, y - 1) === ROPE, `${b.meta.name}: gold at ${x},${y} neither stands on nor hangs from anything`)
        }
    }
    // contract 2: every rope line is reachable — its run touches a hang row
    // that at least one ladder TOP cell opens into (climb to the top rung,
    // step sideways under the rope: the ONLY way onto a line)
    for (let y = 0; y < H; y++) {
        let x = 1
        while (x < W - 1) {
            if (grid[y * W + x] !== ROPE) { x++; continue }
            let runEnd = x
            while (runEnd + 1 < W - 1 && grid[y * W + runEnd + 1] === ROPE) runEnd++
            // the hang row must be fed by a ladder TOP rung: ladder cells at
            // (lx, y+1) and (lx, y+2) with a non-ladder above — you climb to
            // that top rung and step sideways under the rope
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
    section(`VAULT ${i} — ${LEVELS[i].name}: the autopilot that IS the attract demo`)
    const b = buildLevel(i)
    const t0 = Date.now()
    const g = makeGame(b.meta, b.grid)
    const r = drive(g)
    ok(g.win && g.end === 'clear', `not winnable by the real solver: end=${g.end} tick=${g.tick}`)
    ok(g.have === g.need, `cleared with ${g.have}/${g.need} gold — the quota is a lie`)
    ok(g.lives === (b.meta.lives ?? CFG.lives), `the witness spent lives (${g.lives}) — a perfect route must not need a respawn`)
    ok(r.shared === 0, `the witness shared a cell with a live guard ${r.shared} times — the demo would show a caught run`)
    ok(Date.now() - t0 < 6000, `solved in ${Date.now() - t0} ms — the audit must stay a second, not a minute`)
    for (const token of b.meta.proves) {
        ok(r.evs.has(token), `${b.meta.name}: claims '${token}' but the witness never fired one`)
    }
    const jumps = g.cmds.filter((c) => c.act.startsWith('JUMP')).length
    ok(jumps > 0, `${b.meta.name}: the proven witness never jumps — the title's namesake muscle is decoration`)

    // determinism, two ways: the recorded stream re-replayed through replay(),
    // and re-driven through planStep again from scratch. Same hash, or red.
    // When the drive ENDED on a command (the winning step), the replay must be
    // allowed to APPLY that last command — stop one tick later than the live
    // loop did, or the twin compares a cleared vault against an un-cleared
    // one and the "divergence" is just the referee stopping early.
    const tail = g.cmds.length && g.cmds[g.cmds.length - 1].tick >= g.tick ? 1 : 0
    const g2 = replay(b.meta, b.grid, g.cmds.map((c) => ({ ...c })), { maxTicks: g.tick + tail })
    ok(stateHash(g2) === r.hash, `${b.meta.name}: replay(state) diverged — ${stateHash(g2)} != ${r.hash}`)
    const b2 = buildLevel(i)
    const g3 = makeGame(b2.meta, b2.grid)
    const r3 = drive(g3)
    ok(r3.hash === r.hash, `${b.meta.name}: re-solving the same vault found a different route — the solver is not pure`)
    // stream sensitivity: drop one interior command and the hash MUST change
    const mid = g.cmds.filter((c) => c.tick > 10 && c.tick < g.tick - 10)
    if (mid.length) {
        const dropped = g.cmds.filter((c) => c !== mid[Math.floor(mid.length / 2)])
        const g4 = replay(b.meta, b.grid, dropped, { maxTicks: g.tick + tail })
        ok(stateHash(g4) !== r.hash, `${b.meta.name}: dropping a command changed NOTHING — hash-blind check`)
    }
    receipts[i] = { tick: g.tick, jumps, evs: [...r.evs] }

    // the slack rule: one fewer of every supply the witness consumes. It
    // consumes TIME (lives: zero — proven above, so lives-1 rides along as
    // a sanity gate). Half the clock is the promise.
    const slack = makeGame({ ...b.meta, timeTicks: Math.floor(b.meta.timeTicks / 2) }, b.grid)
    const rs = drive(slack)
    ok(slack.win, `${b.meta.name}: NOT winnable with half the clock (${slack.tick} needed of ${Math.floor(b.meta.timeTicks / 2)}) — zero-slack design`)
    const tight = makeGame({ ...b.meta, lives: (b.meta.lives ?? CFG.lives) - 1 }, b.grid)
    const rt = drive(tight)
    ok(tight.win && tight.lives === (b.meta.lives ?? CFG.lives) - 1, `${b.meta.name}: one fewer life broke the run — a single misstep must not mathematically lose the vault`)
}

// ------------------------------------------------------ trap economy script ----
section('TRAP ECONOMY — pinned scenarios (the parts the witness cannot force)')
{
    // a hole is forever: dig, collapse, wait — never a brick again
    const b = buildLevel(1)
    const g = makeGame(b.meta, b.grid)
    const p = g.player
    ok(applyAction(g, p, 'ArrowDown'), 'script: down-dig at spawn refused')
    ok(g.grid[(p.y + 1) * W + p.x] === TRAP, 'script: the dug brick did not become a TRAP')
    for (let k = 0; k < CFG.trapHold + 40; k++) step(g)
    ok(g.grid[(p.y + 1) * W + p.x] === EMPTY, 'script: the hole closed again — holes are not supposed to heal')
}
{
    // a trap over a shaft buries a guard for good (vault 2, x=4 shaft).
    // The guard's CELL is pinned until the collapse — the scenario asks only
    // "what does the trap do to a rider"; his walking legs are the chase's
    // business, proven separately by the 'pursued' receipts.
    const b = buildLevel(1)
    const g = makeGame(b.meta, b.grid)
    const gd = g.guards[0]
    gd.x = 4; gd.y = 5; gd.mode = 'stand'
    g.grid[6 * W + 4] = TRAP; g.trap[6 * W + 4] = 0
    let gone = false
    for (let k = 0; k < CFG.trapHold + 60 && !gone; k++) {
        if (gd.alive && gd.mode === 'stand') { gd.x = 4; gd.y = 5 }
        step(g)
        if (g.events.some((e) => e.type === 'guardGone')) gone = true
        g.events.length = 0
    }
    ok(gone, 'script: a guard riding a collapsing trap over a shaft was NEVER buried — the trap economy is decoration')
    ok(!gd.alive && g.grid[6 * W + 4] === EMPTY, 'script: guard burial left the level inconsistent')
}
{
    // the rope-catch: a rising body catches the line one above its path;
    // and the jump rises EXACTLY one cell before gravity takes over
    const b = buildLevel(0)
    const g = makeGame(b.meta, b.grid)
    const p = g.player
    p.x = 10; p.y = 4; p.mode = 'stand'
    ok(applyAction(g, p, 'JUMP:0'), 'script: JUMP refused on flat ground')
    let caught = -1
    for (let k = 0; k < 10 && caught < 0; k++) {
        step(g)
        if (p.mode === 'hang') caught = g.tick
    }
    ok(caught > 0, 'script: a rising body did not catch the rope overhead — ropes would be decorations')
    const b2 = buildLevel(1)
    const g2 = makeGame(b2.meta, b2.grid)
    const p2 = g2.player
    const y0 = p2.y
    applyAction(g2, p2, 'JUMP:0')
    let top = y0
    for (let k = 0; k < 6; k++) { step(g2); top = Math.min(top, p2.y) }
    ok(y0 - top === 1, `script: the jump rose ${y0 - top} cells — the contract says EXACTLY one`)
}
{
    // the quota is a gate, not a suggestion: walking into the open exit
    // cell with 0 gold must not clear the vault
    const b = buildLevel(0)
    const g = makeGame(b.meta, b.grid)
    const p = g.player
    p.x = b.meta.exit.x - 1; p.y = b.meta.exit.y; p.mode = 'stand'
    applyAction(g, p, 'ArrowRight')
    step(g)
    ok(!g.end, 'script: reached the gate with 0 gold and the vault cleared — the quota never gated')
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
    const winVault = (i, cap) => {
        const b = buildLevel(i)
        const g = makeGame(b.meta, b.grid)
        drive(g, cap)
        return g.win
    }
    tryMut('dig=false (the floor never breaks)', { dig: false }, () => winVault(1))
    tryMut('jump=false (no runner leap)', { jump: false }, () => winVault(0))
    tryMut('guardChase=false (guards stand post)', { guardChase: false }, () => {
        const b = buildLevel(0)
        const g = makeGame(b.meta, b.grid)
        return drive(g).evs.has('pursued')
    })
    tryMut('trapCollapse=false (traps hold forever)', { trapCollapse: false }, () => {
        const b = buildLevel(1)
        const g = makeGame(b.meta, b.grid)
        const gd = g.guards[0]
        gd.x = 4; gd.y = 5; gd.mode = 'stand'
        g.grid[6 * W + 4] = TRAP; g.trap[6 * W + 4] = 0
        let gone = false
        for (let k = 0; k < CFG.trapHold + 60 && !gone; k++) {
            if (gd.alive && gd.mode === 'stand') { gd.x = 4; gd.y = 5 }
            step(g)
            if (g.events.some((e) => e.type === 'guardGone')) gone = true
            g.events.length = 0
        }
        return gone
    })
    tryMut('ropeCatch=false (a rising body misses the line)', { ropeCatch: false }, () => {
        const b = buildLevel(0)
        const g = makeGame(b.meta, b.grid)
        const p = g.player
        p.x = 10; p.y = 4; p.mode = 'stand'
        applyAction(g, p, 'JUMP:0')
        for (let k = 0; k < 10; k++) { step(g); if (p.mode === 'hang') return true }
        return false
    })
    tryMut('quota=false (the gate opens for nobody)', { quota: false }, () => {
        // the probe returns the INVARIANT ("the locked gate held"), baseline
        // true; the mutant opens it and the probe goes false — caught.
        const b = buildLevel(0)
        const g = makeGame(b.meta, b.grid)
        const p = g.player
        p.x = b.meta.exit.x - 1; p.y = b.meta.exit.y; p.mode = 'stand'
        applyAction(g, p, 'ArrowRight')
        step(g)
        return !g.end
    })
}

console.log(`\nlodecheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
console.log(`receipts: ${JSON.stringify(receipts)}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
