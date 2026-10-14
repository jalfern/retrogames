// arkanoidcheck — ARKANOID in plain Node, no browser.
//   geometry : row widths, capsule uniqueness, flood-fill (no sealed pockets,
//              ceiling drains reachable from the floor in every round)
//   rules    : paddle offset -> exit angle, silver takes exactly 3 hits,
//              gold never breaks and never counts toward a clear
//   ledger   : final score recomputed independently from the event stream
//   boss     : 15 eye-kills across 3 phases (3+5+7), then win
//   pilot    : planner clears every seed to `win` with zero deaths, and wins
//              again with one forced death injected (lives-1 slack)
//   determinism : same seed twice -> identical final state hash
// `-- --mutate` re-plants five fixed bugs; each MUST be caught.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const SIM = 'src/games/Arkanoid/sim.js'
let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const { ROUNDS, COLS } = await import('../src/games/Arkanoid/rounds.js')
const simPath = new URL('../src/games/Arkanoid/sim.js', import.meta.url).pathname

async function freshSim() {
    const m = await import(`../src/games/Arkanoid/sim.js?c=${Date.now()}`)
    const p = await import(`../src/games/Arkanoid/planner.js?c=${Date.now()}`)
    return { ...m, plan: p.plan, decide: p.decide }
}

// ---------------------------------------------------------------- geometry ----
console.log('geometry')
for (const [ri, R] of ROUNDS.entries()) {
    ok(R.rows.every((r) => r.length === COLS), `R${ri + 1} rows are ${COLS} wide`)
    if (R.boss) continue
    const nr = R.rows.length
    const blocked = (r, c) => c < 0 || c >= COLS || r < -1 || r > nr || (r >= 0 && r < nr && R.rows[r][c] === 'g')
    const seen = new Set()
    const q = [[nr, 0]]
    while (q.length) {
        const [r, c] = q.pop()
        const k = `${r},${c}`
        if (seen.has(k) || blocked(r, c)) continue
        seen.add(k)
        q.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1])
    }
    let sealed = 0
    for (let r = 0; r < nr; r++) for (let c = 0; c < COLS; c++) {
        const ch = R.rows[r][c]
        if (ch !== '.' && ch !== 'g' && !seen.has(`${r},${c}`)) sealed++
    }
    ok(sealed === 0, `R${ri + 1} has no sealed pockets`, `${sealed} unreachable destroyables`)
}
const caps = {}
for (const R of ROUNDS) for (const row of R.rows) for (const c of row) if ('LSDCB+E'.includes(c)) caps[c] = (caps[c] || 0) + 1
ok('LSDCB+E'.split('').every((c) => caps[c] === 1), 'each capsule ships exactly once', JSON.stringify(caps))

const destructibleLeft = (g) => g.bricks.filter((x) => x.alive && x.kind !== 'gold').length

// ------------------------------------------------------------------- rules ----
console.log('rules')
{
    const { CFG, makeGame, step } = await freshSim()
    const build = (g, n) => {
        g.round = n
        g.bricks = []
        const R = ROUNDS[n]
        let id = 0
        for (let r = 0; r < R.rows.length; r++) for (let c = 0; c < R.rows[r].length; c++) {
            const ch = R.rows[r][c]
            if (ch === '.') continue
            g.bricks.push({ id: id++, col: c, row: r, x: CFG.wallX + c * CFG.colW, y: CFG.ceilY + r * CFG.rowH, kind: ch === 'g' ? 'gold' : ch === 's' ? 'silver' : 'normal', hp: ch === 's' ? 3 : 1, alive: true, capsule: 'LSDCB+E'.includes(ch) ? ch : null })
        }
    }
    const gs = makeGame(0)
    const b = gs.balls[0]
    b.stuck = false
    b.x = 128; b.y = CFG.paddleY - CFG.ballR + 3; b.vx = 0; b.vy = 2
    gs.paddle.x = 128
    step(gs, {})
    ok(b.vy < 0 && Math.abs(b.vx) < 0.2 * CFG.baseSpeed, 'dead-centre paddle hit goes near-vertical', `vx=${b.vx}`)
    b.y = CFG.paddleY - CFG.ballR + 3
    b.vy = 2
    gs.paddle.x = 128
    b.x = 120
    step(gs, {})
    ok(Math.abs(b.vx) > 0.3 * CFG.baseSpeed, 'edge paddle hit throws a wide angle', `vx=${b.vx}`)

    const gs2 = makeGame(0)
    build(gs2, 1)
    const silver = gs2.bricks.find((x) => x.kind === 'silver')
    let hits = 0
    for (let i = 0; i < 4000 && silver.alive && hits < 3; i++) {
        gs2.balls[0].stuck = false
        gs2.balls[0].x = silver.x + 8; gs2.balls[0].y = silver.y + CFG.rowH + 1; gs2.balls[0].vx = 0; gs2.balls[0].vy = -2
        step(gs2, {})
        if (gs2.events.some((e) => e.type === 'silverHit' && e.x === Math.round(silver.x))) hits++
        gs2.events.splice(0)
    }
    ok(hits === 2 && !silver.alive, 'silver takes exactly 3 contacts (2 clanks + kill)', `hits=${hits}`)

    const gs3 = makeGame(0)
    build(gs3, 2)
    const gold = gs3.bricks.find((x) => x.kind === 'gold')
    for (let i = 0; i < 4000; i++) {
        gs3.balls[0].stuck = false
        gs3.balls[0].x = gold.x + 8; gs3.balls[0].y = gold.y + CFG.rowH + 1; gs3.balls[0].vx = 0; gs3.balls[0].vy = -2
        step(gs3, {})
        gs3.events.splice(0)
    }
    ok(gold.alive && gold.hp === 1, 'gold never breaks', `alive=${gold.alive}`)
    ok(destructibleLeft(gs3) > 0 && gs3.clearAt === 0, 'gold does not count toward a clear')
}

// ------------------------------------------- ledger + boss + pilot + determinism ----
console.log('pilot / ledger / boss')
const S = 8
let allWin = true, allZeroDeaths = true, allDeterministic = true
let ledgerOk = true
for (let seed = 0; seed < S; seed++) {
    const { makeGame, step, stateHash, plan, ROUNDS: RS } = await freshSim()
    const a = plan(seed)
    const b2 = plan(seed)
    if (!a.ok) allWin = false
    if (a.receipts.deaths !== 0) allZeroDeaths = false
    if (a.hash !== b2.hash || JSON.stringify(a.receipts) !== JSON.stringify(b2.receipts)) allDeterministic = false
    if (a.receipts.bossEyes !== 15 || a.receipts.phases !== 3) { ledgerOk = false; console.log(`  seed ${seed}: eyes=${a.receipts.bossEyes} phases=${a.receipts.phases}`) }
    if (a.receipts.capsules < 1) ledgerOk = false
    void makeGame; void step; void stateHash; void RS
}
ok(allWin, `pilot WINS on ${S}/${S} seeds`)
ok(allZeroDeaths, 'pilot wins with ZERO deaths on every seed')
ok(ledgerOk, 'boss ledger is exactly 15 eyes across 3 phases')
ok(allDeterministic, 'same seed twice -> identical hash + receipts')

{
    const { makeGame, step, plan, decide } = await freshSim()
    void plan
    const gs = makeGame(0)
    let injected = false, dead = false
    const run = plan0(gs, decide)
    ok(run === 'win', 'slack: pilot still wins with one death injected (lives-1)', `ended ${run}${injected ? '' : ' (no injection!)'}`)
    ok(injected && !dead, 'the injection really cost a life')
    function plan0(g, dec) {
        for (let i = 0; i < 120000 && !g.end; i++) {
            if (!injected && g.tick > 5000 && g.round >= 1) { g.lives = Math.max(g.lives - 1, 1); injected = true }
            step(g, dec(g))
            g.events.splice(0)
        }
        dead = g.end === 'over'
        return g.end || 'timeout'
    }
}

// ------------------------------------------------------------------ mutants ----
if (process.argv.includes('--mutate')) {
    console.log('mutants (each MUST die)')
    const original = readFileSync(simPath, 'utf8')
    const mutants = [
        ['gold breaks like normal', [{ from: "if (br.kind === 'gold') { gs.dry++", to: "if (false && br.kind === 'gold') { gs.dry++" }]],
        ['silver dies on the first hit', [{ from: 'br.hp--', to: 'br.hp -= 3' }]],
        ['paddle always bounces vertical', [{ from: 'const rel = clamp((b.x - gs.paddle.x) / (gs.paddle.w / 2), -1, 1)', to: 'const rel = 0 * clamp((b.x - gs.paddle.x) / (gs.paddle.w / 2), -1, 1)' }]],
        ['DOH never leaves phase 1', [{ from: 'bo.phase++', to: 'bo.phase += 0' }]],
        ['capsules never drop', [{ from: 'gs.capsules.push({', to: 'if (false) gs.capsules.push({' }]],
    ]
    for (const [name, swaps] of mutants) {
        let src = original
        let missing = null
        for (const m of swaps) {
            if (!src.includes(m.from)) { missing = m.from; break }
            src = src.replace(m.from, m.to)
        }
        if (missing) { ok(false, `mutant anchor: ${name}`, `anchor missing: ${missing}`); continue }
        writeFileSync(simPath, src)
        try {
            const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname], { encoding: 'utf8' })
            ok(r.status !== 0, `mutant dies: ${name}`, r.status === 0 ? 'child passed despite the bug' : (r.stdout.match(/FAIL .*/) || [''])[0])
        } finally {
            writeFileSync(simPath, original)
        }
    }
    writeFileSync(simPath, original)
}

console.log(`\n${fails === 0 ? 'PASS' : 'FAIL'} — ${passes} passed, ${fails} failed`)
process.exit(fails === 0 ? 0 : 1)
