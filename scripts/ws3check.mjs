// ws3check — WEIGHT SURGERY ROUND 2 (#1533) harness check, plain Node, no browser.
//   boot  : build_demo renders the ROUND 2 section from the committed lab, and an
//           EMPTY lab still builds with honest pending rows (never crashes).
//   rules : r2_scores consistency + step1_gate recomputation (the gate is a pure
//           function of the rows and the frozen CLAIMS — a mismatch is caught).
//   fail  : mutants — inflated acc, gate flipped against its own rows, feature
//           markers removed — MUST all be caught.
// Run: node scripts/ws3check.mjs | node scripts/ws3check.mjs -- --mutate

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LAB = 'demos/weight-surgery-lab'
let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// must mirror r2_gate.py CLAIMS
export const CLAIMS = {
    base: { math: [2, 14], gsm: [8, 20], fin: [0, 20] },
    p50c: { math: [40, 56], gsm: [59, 75], fin: [40, 80] },
}

export function validateR2({ scores, gate }) {
    const errs = []
    for (const [tag, row] of Object.entries(scores)) {
        if (tag === '_hold') continue
        for (const set of ['math', 'gsm']) {
            const t = row[set]
            if (!t) { errs.push(`${tag}.${set}: missing`); continue }
            if (!(t.n > 0)) errs.push(`${tag}.${set}: n must be > 0`)
            if (!(t.acc >= 0 && t.acc <= 100)) errs.push(`${tag}.${set}: acc out of range`)
            if (!(t.finished >= 0 && t.finished <= 100)) errs.push(`${tag}.${set}: finished out of range`)
        }
    }
    if (gate && gate.rows) {
        for (const [tag, v] of Object.entries(gate.rows)) {
            const row = scores[tag]
            if (!row) { errs.push(`gate rows: ${tag} not in scores`); continue }
            for (const set of ['math', 'gsm']) {
                if (Math.abs((row[set]?.acc ?? -1) - (v[set]?.acc ?? -2)) > 0.05)
                    errs.push(`gate rows disagree with scores for ${tag}.${set}`)
            }
        }
        // recompute pass against CLAIMS
        const problems = []
        for (const [tag, lim] of Object.entries(CLAIMS)) {
            const row = scores[tag]
            if (!row) continue
            for (const set of ['math', 'gsm']) {
                const [lo, hi] = lim[set]
                if (!(row[set].acc >= lo && row[set].acc <= hi)) problems.push(`${tag}.${set} acc`)
                const [flo, fhi] = lim.fin
                if (!(row[set].finished >= flo && row[set].finished <= fhi)) problems.push(`${tag}.${set} finished`)
            }
        }
        const recomputedPass = problems.length === 0
        if (gate.pass !== recomputedPass) errs.push(`gate.pass=${gate.pass} but recomputed=${recomputedPass} (${problems.join(',')})`)
    }
    return errs
}

// row-level invariants for scores_*.jsonl (session 118 grading fix #1533):
// no-answer rows can never be ok, and gold_answer mirrors r2_common.py: a gold
// that is a full solution must collapse to its \boxed{}/#### tail.
export function validateRows(recs) {
    const errs = []
    for (const r of recs) {
        if (r.method === 'no-answer' && r.ok !== false) errs.push(`${r.id}: no-answer but ok`)
        if (!r.ok && r.method === 'math-verify' && (r.pred === '' || r.pred == null))
            errs.push(`${r.id}: math-verify verdict with empty pred`)
    }
    return errs
}

export function goldAnswer(gold) {
    let g = String(gold)
    if (g.includes('####')) g = g.split('####').pop()
    else {
        const i = g.lastIndexOf('\\boxed{')
        if (i >= 0) {
            let depth = 1, j = i + 7, out = ''
            while (j < g.length && depth > 0) {
                if (g[j] === '{') depth++
                else if (g[j] === '}') { depth--; if (!depth) break }
                out += g[j]; j++
            }
            if (!depth) g = out
        }
    }
    return g.trim()
}

// #1533 anti-corruption: step1_gate.json may exist ONLY when every row file is
// complete. A gate written while a killed runner left partial rows is a fake.
export function validateGateVsRows(counts, gate) {
    const errs = []
    const complete = ['base', 'p50c'].every(
        t => (counts[t]?.math ?? 0) >= CLAIM_N.math && (counts[t]?.gsm ?? 0) >= CLAIM_N.gsm)
    if (gate && !complete) errs.push('gate exists while rows incomplete — fake gate')
    return errs
}

export const CLAIM_N = { math: 100, gsm: 100 }

// step-2 wiring (#1533 session-119 audit): scoring the own model may only happen
// after a CONFIRMED register+load — a blind curl+sleep once let a half-registered
// model reach the scorer path. Static check, CI-safe (no server needed).
export function wiringProblems(step2Src) {
    const errs = []
    const reg = step2Src.search(/r2_register\.py\s+\S+\s+--load/)
    const score = step2Src.search(/r2_score\.py\s+own:/)
    if (reg < 0) errs.push('step2 never registers the own model with --load')
    else if (score >= 0 && reg > score) errs.push('step2 scores own before registering')
    return errs
}

function build(labDir) {
    const out = join(tmpdir(), `ws3-${Date.now()}-${Math.random()}.html`)
    const r = spawnSync('node', [join(LAB, 'build_demo.mjs'), out], {
        env: { ...process.env, LAB_DIR: labDir }, encoding: 'utf8',
    })
    return { rc: r.status, html: existsSync(out) ? readFileSync(out, 'utf8') : '', err: r.stderr }
}

console.log('ws3check — WEIGHT SURGERY ROUND 2 harness (#1533)')

// 1. boot: committed lab renders the ROUND 2 section (pending rows are fine —
//    no scored numbers are committed until the runs land).
{
    const { rc, html, err } = build(LAB)
    ok(rc === 0, 'build: committed lab exits 0', err?.slice(0, 120))
    ok(html.includes("ROUND 2 — MIT'S HORIZON ON OUR SILICON"), 'build: ROUND 2 section present')
    ok(html.includes('id="r2-base"') && html.includes('id="r2-p50c"') && html.includes('id="r2-own"'),
        'build: all three round-2 rows render (base / p50c / own)')
    ok(html.includes('presence_penalty 1.5 confirmed applied'), 'copy: pp-proof stated on the page')
    ok(html.includes('issues/1533'), 'build: links issue #1533')
    const empty = mkdtempSync(join(tmpdir(), 'ws3empty-'))
    cpSync(join(LAB, 'build_demo.mjs'), join(empty, 'build_demo.mjs'))
    writeFileSync(join(empty, 'batches.jsonl'), '')
    const e2 = build(empty)
    ok(e2.rc === 0 && e2.html.includes('pending — rows land as each gate clears'),
        'build: empty lab keeps round-2 rows honestly pending')
}

// 2. rules: committed artifacts + gate consistency (when present)
{
    const scoresP = join(LAB, 'results/r2/r2_scores.json')
    const gateP = join(LAB, 'results/r2/step1_gate.json')
    if (existsSync(scoresP)) {
        const scores = JSON.parse(readFileSync(scoresP, 'utf8'))
        const gate = existsSync(gateP) ? JSON.parse(readFileSync(gateP, 'utf8')) : null
        ok(validateR2({ scores, gate }).length === 0, 'rules: committed r2 artifacts consistent',
            validateR2({ scores, gate }).join('; '))
    } else console.log('  skip committed r2 artifacts (runs not landed yet)')
    // 2b. live anti-corruption: gate file vs actual jsonl row counts
    const counts = {}
    for (const tag of ['base', 'p50c']) {
        counts[tag] = {}
        for (const set of ['math', 'gsm']) {
            const p = join(LAB, 'results/r2', `scores_${tag}_${set}.jsonl`)
            counts[tag][set] = existsSync(p)
                ? readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).length : 0
        }
    }
    const liveGate = existsSync(gateP) ? JSON.parse(readFileSync(gateP, 'utf8')) : null
    ok(validateGateVsRows(counts, liveGate).length === 0,
        'rules: no gate file while rows incomplete',
        validateGateVsRows(counts, liveGate).join('; ') + ` (counts ${JSON.stringify(counts)})`)
    ok(validateGateVsRows({ base: { math: 100, gsm: 100 }, p50c: { math: 100, gsm: 100 } },
        { pass: true }).length === 0, 'win: complete rows + gate accepted')
    ok(validateGateVsRows({ base: { math: 86, gsm: 0 }, p50c: { math: 0, gsm: 0 } },
        { pass: true }).length > 0,
        'mutant caught: gate against incomplete rows')
    // 2c. grading invariants (#1533: raw-solution gold silently zeroed accuracy)
    ok(goldAnswer('blah \\boxed{(1, 2)} blah') === '(1, 2)', 'rules: gold_answer extracts boxed')
    ok(goldAnswer('q. blah #### 42') === '42', 'rules: gold_answer extracts #### tail')
    ok(goldAnswer('42') === '42', 'rules: gold_answer passes plain answers')
    {
        const p = join(LAB, 'results/r2/scores_base_math.jsonl')
        if (existsSync(p)) {
            const recs = readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
            ok(validateRows(recs).length === 0, 'rules: base/math rows grading-consistent',
                validateRows(recs).slice(0, 3).join('; '))
        }
    }
    ok(validateRows([{ id: 'x', ok: true, method: 'no-answer', pred: null }]).length > 0,
        'mutant caught: no-answer row marked ok')
}

// 3. synthetic win path + mutants
{
    const dir = mkdtempSync(join(tmpdir(), 'ws3fix-'))
    cpSync(LAB, dir, { recursive: true })
    const rd = join(dir, 'results/r2'); mkdirSync(rd, { recursive: true })
    const scores = {
        _hold: 100,
        base: { math: { n: 100, acc: 8.0, finished: 7.0, mean_ntok: 30000 }, gsm: { n: 100, acc: 14.0, finished: 7.0, mean_ntok: 30000 } },
        p50c: { math: { n: 100, acc: 48.0, finished: 67.0, mean_ntok: 9000 }, gsm: { n: 100, acc: 67.0, finished: 67.0, mean_ntok: 9000 } },
        own: { math: { n: 100, acc: 21.0, finished: 40.0, mean_ntok: 15000 }, gsm: { n: 100, acc: 33.0, finished: 40.0, mean_ntok: 15000 } },
    }
    const gate = { pass: true, detail: 'both rows inside MIT\'s neighborhood.', rows: { base: { math: { acc: 8.0, finished: 7.0 }, gsm: { acc: 14.0, finished: 7.0 } }, p50c: { math: { acc: 48.0, finished: 67.0 }, gsm: { acc: 67.0, finished: 67.0 } } } }
    writeFileSync(join(rd, 'r2_scores.json'), JSON.stringify(scores))
    writeFileSync(join(rd, 'step1_gate.json'), JSON.stringify(gate))
    ok(validateR2({ scores, gate }).length === 0, 'win: synthetic green fixture validates')
    const { html } = build(dir)
    ok(html.includes('48.0%') && html.includes('Our own edit scores 27.0%'), 'win: fixture renders scored rows + own verdict')
    // mutants must be caught
    const mutants = [
        ['acc>100', () => validateR2({ scores: { base: { math: { n: 1, acc: 101, finished: 5 }, gsm: { n: 1, acc: 5, finished: 5 } } } }).length > 0],
        ['zero-n row', () => validateR2({ scores: { base: { math: { n: 0, acc: 0, finished: 0 }, gsm: { n: 1, acc: 5, finished: 5 } } } }).length > 0],
        ['gate flipped', () => validateR2({ scores, gate: { ...gate, pass: false } }).length > 0],
        ['gate rows tampered', () => validateR2({ scores, gate: { ...gate, rows: { ...gate.rows, base: { math: { acc: 99, finished: 99 }, gsm: { ...gate.rows.base.gsm } } } } }).length > 0],
    ]
    for (const [name, pred] of mutants) ok(pred(), `mutant caught: ${name}`)
    ok(!(html.replace("ROUND 2 — MIT'S HORIZON", '—')).includes("ROUND 2 — MIT'S HORIZON"), 'mutant caught: section marker removed')
}

// 4. pipeline wiring (session-119 audit): Jon's concurrency knob reaches G1
//    (regression: session 118 claimed WS_R2_PARALLEL@G1 but the file still had
//    max_workers=4), registration is confirm-before-score, and the chain runner
//    only launches step 2 after a PASS gate.
{
    const dir = s => readFileSync(join(LAB, s), 'utf8')
    ok(/WS_R2_PARALLEL/.test(dir('r2_directions.py')) && /max_workers=PAR\b/.test(dir('r2_directions.py')),
        'rules: G1 honors WS_R2_PARALLEL')
    ok(wiringProblems(dir('r2_run_step2.sh')).length === 0, 'rules: step2 registers model before scoring',
        wiringProblems(dir('r2_run_step2.sh')).join('; '))
    ok(wiringProblems(dir('r2_run_step2.sh').replace(/r2_register\.py qwen35-own --load/, 'sleep 5')).length > 0,
        'mutant caught: score without confirm-load')
    ok(wiringProblems('r2_score.py own:x').length > 0, 'mutant caught: score with no registration at all')
    const chain = dir('r2_chain.sh')
    ok(/step1_stop\.marker/.test(chain) && chain.search(/gate PASS/) < chain.search(/r2_run_step2\.sh/)
        && chain.search(/gate STOP/) < chain.search(/step 2 forbidden/),
        'rules: chain gates step2 on PASS, marker-only on STOP')
}

console.log(`\nws3check: ${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
