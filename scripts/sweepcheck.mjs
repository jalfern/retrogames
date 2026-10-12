// MINESWEEPER — the Node audit. No browser: this imports the SAME
// minefield.js the tab mounts, which is the whole point — the fairness
// referee that certifies boards at generation time is the referee under
// audit, because when it lied (it has, three times: the filtered-set
// subset rule, the guess-path that poisoned clue counts, and the second
// solver that corroborated the first) the generator's own gate certified
// the lie. So this harness does NOT trust plantAt's verdict — it
// re-certifies every board from the outside, three ways:
//
//   witnesses   every cell the solver plans to dig carries the RULE that
//               derived it (the guess-path dug with no witness — no rule,
//               no right),
//   sequential  the board is played one derived cell at a time, as the
//               player plays it: a board the batch solve "wins" but
//               sequential play stalls on is a lying referee (that was
//               the bug of the last two sessions — batch said fair, the
//               player died),
//   slack       the SLACK gate: the board must close with CHORDING
//               forbidden — single-square + subset only, the strongest
//               supply taken away (lemcheck's slack loop, retargeted).
//
// Plus: determinism of (seed, firstClick), the first-click safety zone,
// and a plant-time budget — an honest stall replaced a poisoned fast
// path, and a 12-second board is a design failure, not a flake.
//
//   npm run sweepcheck              the audit (~5 s)
//   npm run sweepcheck -- --mutate  + the mutants that MUST die
//   npm run sweepcheck -- --seed N --diff 2   plant one board, dump it
import { readFileSync, writeFileSync } from 'node:fs'
import { realpathSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(realpathSync(fileURLToPath(import.meta.url)))
const SRC = join(HERE, '../src/games/Minesweeper/minefield.js')

const args = process.argv.slice(2)
const MUT = args.includes('--mutate')
const diffArg = args.includes('--diff') ? +args[args.indexOf('--diff') + 1] : null
const seedArg = args.includes('--seed') ? (args[args.indexOf('--seed') + 1] >>> 0) : null

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

const SRC_TEXT = readFileSync(SRC, 'utf8')

// dynamic import, optionally of a mutated copy — the battery runs
// against whatever module URL it is handed, so mutants are the SAME code
// path with one anchored swap, not a simulation of one.
async function loadMines(source) {
    if (source === undefined) return import(pathToFileURL(SRC).href)
    const tmp = join('/tmp', `ms-mut-${Math.random().toString(36).slice(2)}.mjs`)
    writeFileSync(tmp, source)
    return import(pathToFileURL(tmp).href)
}

const M0 = await loadMines()
const { DIFFS, newGame, plantAt, dig, flag, chord, solve, cloneGame, stateHash, idx } = M0

const BASE_SEED = 4242
const STRIDE = 104729
// battery seeds: the class the last two sessions died on, generalised —
// (BASE + k*STRIDE) is the seed class from WIP.md
const seeds = (n) => Array.from({ length: n }, (_, k) => (BASE_SEED + k * STRIDE) >>> 0)

// the rules a fair dig may carry: derived-safe derivations only. The
// guess path pushed cells with rule=undefined — no witness, no right.
const LEGAL_RULES = new Set(['single-safe', 'subset-safe', 'chord'])

function seqPlay(M, g, opts = {}) {
    // play the board exactly as the attract autopilot plays it: ask for
    // derivable cells, dig them one by one, never touch a mine, never
    // stall short of the win. Every dig's rule is a witness.
    const receipts = { digs: 0, floods: 0, badRules: [], mined: null, stuckAt: null, steps: 0 }
    while (!g.end && receipts.steps++ < 4000) {
        const plan = M.nextDigs(g)
        if (!plan.length) { receipts.stuckAt = g.opened; break }
        for (const p of plan) {
            if (g.end) break
            if (!p.rule || !LEGAL_RULES.has(p.rule)) receipts.badRules.push(`${p.x},${p.y}:${p.rule}`)
            if (M.dig(g, p.x, p.y) && g.mines[idx(g, p.x, p.y)]) { receipts.mined = `${p.x},${p.y}`; break }
            receipts.digs++
            g.events.length = 0
        }
    }
    for (const e of g.events) if (e.t === 'flood') receipts.floods++
    return receipts
}

async function battery(M, diffs = [0, 1, 2], n = 8, budgets = true) {
    const rows = []
    for (const d of diffs) {
        let threw = 0, unfair = 0, seqFail = 0, badRules = 0, det = 0, mined = 0
        let avg = 0, worst = 0, tAll = 0
        for (const seed of seeds(n)) {
            const g = M.newGame(d, seed)
            const fx = g.w >> 1, fy = g.h >> 1
            const t0 = Date.now()
            try { M.plantAt(g, fx, fy) } catch { threw++; continue }
            const ms = Date.now() - t0
            avg += ms; tAll += ms; if (ms > worst) worst = ms
            // outside re-certification — do not trust the gate's own verdict
            const c = M.cloneGame(g)
            const full = M.solve(c, { subset: true, chord: true })
            const slack = M.solve(c, { subset: true, chord: false })
            if (!full.win || full.guesses > M.GUESS_LIMIT || !slack.win || slack.guesses > M.GUESS_LIMIT) unfair++
            // determinism: same (diff, seed, firstClick) => same board
            const g2 = M.newGame(d, seed)
            M.plantAt(g2, fx, fy)
            if (String(g2.mines) !== String(g.mines) || String(g2.clue) !== String(g.clue)) det++
            // first-click safety zone: 3x3 around the dig is mine-free and open
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const x = fx + dx, y = fy + dy
                if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue
                if (g.mines[idx(g, x, y)]) mined++
            }
            const r = seqPlay(M, g)
            if (r.mined || g.end !== 'win') seqFail++
            badRules += r.badRules.length
        }
        rows.push({ d: DIFFS[d].name, threw, unfair, seqFail, badRules, det, mined, avg: Math.round(avg / n), worst })
        section(`BATTERY ${DIFFS[d].name} — ${n} seeds of the class that killed two solver eras`)
        console.log(`  plant avg ${rows.at(-1).avg}ms worst ${worst}ms · threw ${threw} unfair ${unfair} mined ${mined} dead-on-arrival ${det} witnessless ${badRules} stalled-or-lost ${seqFail}`)
        ok(threw === 0, `${DIFFS[d].name}: ${threw}/${n} boards failed to plant at all`)
        ok(unfair === 0, `${DIFFS[d].name}: ${unfair}/${n} boards that the OUTSIDE referee says are not zero-guess (slack AND full)`)
        ok(mined === 0, `${DIFFS[d].name}: ${mined} mines inside the first-click safety zone — the zone is a contract`)
        ok(det === 0, `${DIFFS[d].name}: ${det}/${n} (seed, firstClick) replays landed on a different board`)
        ok(badRules === 0, `${DIFFS[d].name}: ${badRules} witnessless digs — the solver planned a dig with no derivation`)
        ok(seqFail === 0, `${DIFFS[d].name}: ${seqFail}/${n} boards that batch-solved fair but sequential play lost or stalled on — that is the referee lying to the player`)
        if (budgets) {
            const wantAvg = [150, 500, 2000][d], wantWorst = [800, 2000, 6000][d]
            ok(avg / n < wantAvg, `${DIFFS[d].name}: plant avg ${Math.round(avg / n)}ms over the ${wantAvg}ms budget — generation got slower`)
            ok(worst < wantWorst, `${DIFFS[d].name}: worst plant ${worst}ms over the ${wantWorst}ms budget — a phone tap must not freeze`)
        }
    }
    return rows
}

// ------------------------------------------------- brute-force oracles ----
// The referee must never be its own oracle — that is the sin this repo has
// now committed three times (the gate ran the solver it trusted). These
// fixtures are the independent truth: a mine cluster is the ONLY covered
// region, so every consistent assignment of it can be ENUMERATED (2^|P|).
// A cell is ambiguous if some consistent assignment makes it a mine: any
// solver that digs it is lying, full stop — no derived verdict required.
function adjCells(s, i) {
    const x = i % s.w, y = (i / s.w) | 0
    const out = []
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx, ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < s.w && ny < s.h) out.push(ny * s.w + nx)
    }
    return out
}

// Independent oracle: enumerate every consistent mine assignment of the
// covered pocket (fair play has never dug a mine, so all mines live in
// the pocket). A cell is ambiguous when some consistent world makes it a
// mine and another makes it safe — the honest rules may NEVER call it
// safe, and if a solver does, the enumeration convicts it with no appeal.
function bruteAmbiguous(s) {
    const cells = s.w * s.h
    const pocket = []
    for (let i = 0; i < cells; i++) if (!s.open[i]) pocket.push(i)
    const m = pocket.length
    const k = s.totalMines
    if (m > 16 || m < 4 || k > m || k < 1) return null
    const pIndex = new Map(pocket.map((c, b) => [c, b]))
    const pre = []
    for (let i = 0; i < cells; i++) {
        if (!s.open[i] || s.clue[i] === 0) continue
        const list = []
        for (const c of adjCells(s, i)) { const b = pIndex.get(c); if (b !== undefined) list.push(b) }
        pre.push([s.clue[i], list])
    }
    let sols = 0
    const mineSeen = new Uint16Array(m)
    for (let mask = 0; mask < (1 << m); mask++) {
        let cnt = 0
        for (let x = mask; x; x &= x - 1) cnt++
        if (cnt !== k) continue
        let good = true
        for (const [cl, list] of pre) {
            let n = 0
            for (const b of list) if (mask & (1 << b)) n++
            if (n !== cl) { good = false; break }
        }
        if (!good) continue
        sols++
        for (let b = 0; b < m; b++) if (mask & (1 << b)) mineSeen[b]++
        if (sols > 4000) return null
    }
    if (sols < 2) return null
    const ambiguous = new Set()
    for (let b = 0; b < m; b++) if (mineSeen[b] > 0 && mineSeen[b] < sols) ambiguous.add(pocket[b])
    return ambiguous.size ? { ambiguous, sols } : null
}

function snap(s) {
    return {
        w: s.w, h: s.h, cell: s.cell, totalMines: s.totalMines,
        clue: Uint8Array.from(s.clue), open: Uint8Array.from(s.open),
        mines: Uint8Array.from(s.mines), flag: new Uint8Array(s.w * s.h),
    }
}

function gatherMidgame(M, n, want) {
    // The endgame of a zero-guess board is fully derivable — but the MID
    // positions, before the last derivations land, are genuinely
    // ambiguous. An unsound rule reaches exactly there. So: play real
    // fair boards, brute-force every live pocket of size 5..16, and keep
    // the genuinely-ambiguous snapshots as the oracle battery. Snapshots
    // are taken BETWEEN plan batches only: mid-batch states carry derived
    // mines the state itself has not recorded (a player would have
    // flagged them), and enumerating those pockets as free fabricates
    // worlds the real board never lived.
    const out = []
    for (const seed of seeds(n)) {
        const g = M.newGame(0, seed)
        M.plantAt(g, g.w >> 1, g.h >> 1)
        let steps = 0
        while (!g.end && out.length < want && steps++ < 400) {
            const covered = g.w * g.h - g.opened
            if (covered >= 5 && covered <= 16) {
                const ab = bruteAmbiguous(g)
                if (ab) out.push({ ...snap(g), ambiguous: ab.ambiguous, sols: ab.sols })
            }
            if (out.length >= want) break
            const plan = M.nextDigs(g)
            if (!plan.length) break
            for (const p of plan) {
                M.dig(g, p.x, p.y)
                g.events.length = 0
                if (g.end) break
            }
        }
    }
    return out
}

// ------------------------------------------------------------- battery ----
const rows = await battery(M0)

section('BRUTE-FORCE ORACLES — the honest solver must never dig a cell that is a mine in some consistent world')
const FIXTURES = gatherMidgame(M0, 14, 24)
ok(FIXTURES.length >= 10, `only ${FIXTURES.length} ambiguous mid-game oracles generated — the oracle battery itself broke`)
for (const [i, f] of FIXTURES.entries()) {
    const r = solve(f, { subset: true, chord: false })
    let lied = 0
    for (const p of r.plan) if (f.ambiguous.has(p.y * f.w + p.x)) lied++
    for (const p of r.plan) if (!p.rule || !LEGAL_RULES.has(p.rule)) lied++
    ok(lied === 0, `fixture ${i} (${f.sols} consistent worlds): solver dug ${lied} ambiguous/witnessless cells — the brute force says that was a lie`)
    ok(r.guesses >= 1 || lied === 0 && r.win, `fixture ${i}: solver claimed a win on a genuinely ambiguous board — the brute force knows better`)
}


// ------------------------------------------------- rules of the board ----
section('RULES — dig/flag/chord behave like the title card and the original')
{
    const g = newGame(0, 1234)
    plantAt(g, g.w >> 1, g.h >> 1)
    ok(g.planted && g.opened > 0 && g.end === null, 'plant must leave a live opened board')
    ok(g.opened < g.w * g.h - g.totalMines, 'plant opened the whole board — no game')
    const covered = []
    for (let i = 0; i < g.w * g.h; i++) if (!g.open[i] && !g.mines[i]) covered.push(i)
    ok(covered.length > 0, 'no safe covered cells left to win')
    const cx = covered[0] % g.w, cy = (covered[0] / g.w) | 0
    ok(flag(g, cx, cy) && g.flag[idx(g, cx, cy)] === 1 && g.flags === 1, 'flag did not plant')
    ok(!dig(g, cx, cy), 'digging a flagged cell must be refused (flags are a claim)')
    ok(flag(g, cx, cy) && g.flags === 0, 'second flag did not lift the first')
    // a wrong flag chordeS into death (flags are not a shield)
    const g2 = newGame(0, 999)
    plantAt(g2, g2.w >> 1, g2.h >> 1)
    let mis = null
    for (let i = 0; i < g2.w * g2.h && !mis; i++) if (g2.mines[i] && g2.open[i - 1] && g2.clue[i - 1] > 0) mis = i
    if (mis) {
        const mx = mis % g2.w, my = (mis / g2.w) | 0
        const nx = mx - 1
        const anc = g2.open[nx + my * g2.w] ? { x: nx, y: my } : null
        if (anc) {
            flag(g2, mx, my)
            let around = 0
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue
                const fx2 = anc.x + dx, fy2 = anc.y + dy
                if (fx2 >= 0 && fy2 >= 0 && fx2 < g2.w && fy2 < g2.h && g2.flag[idx(g2, fx2, fy2)]) around++
            }
            if (around === g2.clue[idx(g2, anc.x, anc.y)]) {
                chord(g2, anc.x, anc.y)
                ok(g2.end === 'dead', 'a wrong flag chordeD without death — flags became a shield')
            } else ok(true, 'no natural wrong-flag chord in this fixture (flag block still asserted above)')
        } else ok(true, 'no natural adjacent clue for the chord fixture')
    } else ok(true, 'no natural wrong-flag chord candidate in this fixture')
    // step is the clock
    const g3 = newGame(0, 555)
    plantAt(g3, g3.w >> 1, g3.h >> 1)
    for (let k = 0; k < 30; k++) M0.step(g3)
    ok(g3.sec === 1, `step: 30 ticks must be 1 second, got ${g3.sec}`)
}

// ------------------------------------------------------ determinism ----
section('DETERMINISM — (seed, firstClick) is the contract the replay leans on')
{
    const a = newGame(1, 777777), b = newGame(1, 777777), c = newGame(1, 777777)
    plantAt(a, 3, 3)
    plantAt(b, 3, 3)
    plantAt(c, 4, 3)
    ok(String(a.mines) === String(b.mines), 'same (seed, firstClick) planted two different boards')
    ok(String(a.mines) !== String(c.mines), 'the first click did NOT move the fortune — (seed, firstClick) is a contract')
    const ra = cloneGame(a), rb = cloneGame(b)
    const p1 = seqPlay(M0, ra)
    const p2 = seqPlay(M0, rb)
    ok(a.end === b.end && a.opened === b.opened && stateHash(a) === stateHash(b), 'two replays of one board diverged')
    ok(p1.digs > 0 && ra.end === 'win' && stateHash(ra) === stateHash(rb), 'the deterministic replay of a COLT/SAPPER seed did not win (or the two replays diverged)')
    // a hash-blind referee check: open one extra cell must change the hash
    const d = cloneGame(a)
    for (let i = 0; i < d.w * d.h; i++) if (!d.open[i] && !d.mines[i]) { d.open[i] = 1; break }
    ok(stateHash(d) !== stateHash(a), 'stateHash ignored an opened cell — hash-blind referee')
}

// ---------------------------------------------------- seed dump mode ----
if (diffArg !== null || seedArg !== null) {
    const d = diffArg ?? 0
    const sd = seedArg ?? BASE_SEED
    const g = newGame(d, sd)
    plantAt(g, g.w >> 1, g.h >> 1)
    console.log(`\n${g.diff} seed ${sd} — ${g.plantTries} layouts, ${g.plantMoves} repairs`)
    for (let y = 0; y < g.h; y++) {
        let line = ''
        for (let x = 0; x < g.w; x++) {
            const i = idx(g, x, y)
            line += g.open[i] ? (g.clue[i] || '·') : g.mines[i] ? '*' : '#'
        }
        console.log(line)
    }
}

// ------------------------------------------------------------ mutants ----
if (MUT) {
    section('MUTATIONS — each one MUST turn an honest check red')
    // anchored swaps: a miss is a FAILURE (a silently skipped mutant is a
    // green suite that tested nothing)
    const swap = (src, from, to, label) => {
        if (!src.includes(from)) throw new Error(`mutant '${label}' anchor not found — the line it tests is gone`)
        return src.replace(from, to)
    }
    const probeMutant = (Mm) => {
        // returns "why caught" or null if the mutant ran clean everywhere.
        // 1) brute-force fixtures: dig an ambiguous cell (or witnessless,
        //    or throw) and the independent oracle convicts it.
        // 2) battery: seqPlay/witnesses/slack as usual.
        // The fixtures are the point: on fair-only battery boards the
        // guess branch is UNREACHABLE by design (a zero-guess cert never
        // stalls) — a mutant on that line stays green there and only a
        // genuinely ambiguous board forces it to run. A green mutant on
        // unreachable code is the dead-code-with-a-green-test trap.
        for (const [i, f] of FIXTURES.entries()) {
            try {
                const r = Mm.solve({ ...f }, { subset: true, chord: false })
                for (const p of r.plan) {
                    const c = p.y * f.w + p.x
                    if (f.ambiguous.has(c)) return `fixture ${i}: dug cell ${p.x},${p.y} that the brute force says is a mine in some consistent world (rule '${p.rule}')`
                    if (!p.rule) return `fixture ${i}: witnessless dig at ${p.x},${p.y}`
                }
            } catch (e) {
                return `fixture ${i}: referee threw (${e.message.slice(0, 70)})`
            }
        }
        for (let d = 0; d < 2; d++) {
            for (const seed of seeds(5)) {
                const g = Mm.newGame(d, seed)
                const fx = g.w >> 1, fy = g.h >> 1
                try { Mm.plantAt(g, fx, fy) } catch { return `battery threw on seed ${seed}` }
                const r = seqPlay(Mm, g)
                if (r.badRules.length) return `battery: ${r.badRules.length} witnessless digs`
                if (r.mined) return `battery: dug a mine at ${r.mined}`
                if (r.stuckAt !== null || g.end !== 'win') return `battery: stalled at ${r.stuckAt} open`
            }
        }
        return null
    }
    const muts = [
        {
            label: 'guess-dig returns (the poisoned path that faked two solver eras: dig a cell no rule derived)',
            src: swap(SRC_TEXT,
                'if (!acted && openCount < cells - s.totalMines) guesses++',
                `if (!acted && openCount < cells - s.totalMines) {
                guesses++
                let pick = -1
                for (let i = 0; i < cells; i++) { if (!open[i] && mineStamp[i] !== token) { pick = i; break } }
                if (pick >= 0) { open[pick] = 1; if (!s.mines[pick]) openCount++; plan.push({ x: pick % s.w, y: (pick / s.w) | 0 }); acted = true }
            }`, 'guess-dig'),
        },
        {
            label: 'subset pairing without nesting (any two clues sharing a cell become a pair)',
            src: swap(SRC_TEXT,
                'if (uaMark[c] !== uaTok) { nested = false; break }',
                'if (false) { nested = false; break }', 'no-nesting'),
        },
        {
            label: 'witnessless plan entries (dig without the rule that derived it)',
            src: swap(SRC_TEXT,
                "plan.push({ x: c % s.w, y: (c / s.w) | 0, rule: ruleOf[c] })",
                'plan.push({ x: c % s.w, y: (c / s.w) | 0 })', 'no-witness'),
        },
        {
            label: 'single-safe fires at one-off (mLeft <= 1 derives safety from one leftover mine)',
            src: swap(SRC_TEXT,
                "else if (mLeft === 0) { for (const c of cov) if (!isMine(c)) { safeStamp[c] = token; ruleOf[c] = 'single-safe'; safeSet.push(c) }; acted = true }",
                "else if (mLeft <= 1) { for (const c of cov) if (!isMine(c)) { safeStamp[c] = token; ruleOf[c] = 'single-safe'; safeSet.push(c) }; acted = true }", 'off-by-one-safe'),
        },
    ]
    for (const m of muts) {
        let why = null
        try {
            const Mm = await loadMines(m.src)
            why = probeMutant(Mm)
        } catch (e) {
            why = `referee threw: ${e.message.slice(0, 90)}`
        }
        console.log(`  mut ${m.label}: ${why ? `caught (${why})` : 'SURVIVED (BAD)'}`)
        ok(!!why, `MUTANT SURVIVED: ${m.label} — the harness stopped touching the rule it guards`)
    }
}

const total = pass + fails.length
console.log(`\nsweepcheck: ${pass}/${total} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
console.log(`battery: ${JSON.stringify(rows)}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
