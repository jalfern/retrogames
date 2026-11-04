// ws3check — WEIGHT SURGERY ROUND 2 (#1533) harness check, plain Node, no browser.
//   boot  : build_demo renders the ROUND 2 section from the committed lab, and an
//           EMPTY lab still builds with honest pending rows (never crashes).
//   rules : r2_scores consistency + step1_gate recomputation (the gate is a pure
//           function of the rows and the frozen CLAIMS — a mismatch is caught).
//   fail  : mutants — inflated acc, gate flipped against its own rows, feature
//           markers removed — MUST all be caught.
// Run: node scripts/ws3check.mjs | node scripts/ws3check.mjs -- --mutate

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, existsSync, rmSync } from 'node:fs'
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

export const SETS = { p50cw: ['math'] } // #1547: option C rerun is math-only

export function validateR2({ scores, gate }) {
    const errs = []
    for (const [tag, row] of Object.entries(scores)) {
        if (tag === '_hold') continue
        const want = SETS[tag] || ['math', 'gsm']
        for (const set of ['math', 'gsm']) {
            const t = row[set]
            if (!t) {
                if (want.includes(set)) errs.push(`${tag}.${set}: missing`)
                continue
            }
            if (!want.includes(set)) { errs.push(`${tag}.${set}: unexpected set for ${tag}`); continue }
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

// #1533 session-119: math_verify.parse() uses signal.alarm() → ValueError in worker
// threads. The scorer must join the pool BEFORE calling R.grade (main-thread grading);
// threaded grading silently fell back to numeric compare and undercounted p50c/math.
export function threadingProblems(scoreSrc) {
    const errs = []
    const span = scoreSrc.match(/def work\(rec\)[\s\S]*?ex\.map\(work/)
    if (!span) errs.push('scorer shape changed: no ex.map(work) join found')
    else if (/R\.grade\(/.test(span[0])) errs.push('R.grade inside the threaded worker')
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
    // #1540: the committed lab carries the FINAL step-1 rows + the STOP gate, so
    // the committed build must render them scored — the r2 branch shipped the
    // page stale: "pending" spinners beside committed final numbers.
    ok(html.includes('id="r2-base"><td rowspan=2>base @ 32K think35</td><td>math</td><td>100</td><td>3.0%</td>') &&
        html.includes('id="r2-p50c"><td rowspan=2>MIT p50c edit — our reproduction</td><td>math</td><td>100</td><td>30.0%</td>'),
        'build: base + p50c rows render scored (not pending) from committed artifacts')
    ok(html.includes('3.0%') && html.includes('30.0%') && html.includes('41.0%') && html.includes('75.0%'),
        'build: final step-1 numbers on the page (base 3.0 · p50c 30.0/41.0 · 54.0/75.0)')
    const ownRow = html.slice(html.indexOf('id="r2-own"'), html.indexOf('id="r2-own"') + 300)
    const liveGo = existsSync(join(LAB, 'results/r2/jon_go_1562.json'))
    if (liveGo)
        ok(ownRow.includes('pending — rows land') || ownRow.includes('%'),
            'build: own row shows pending/scored under Jon-GO (#1562 reopened step 2)')
    else
        ok(ownRow.includes('forbidden — step-1 gate STOP'),
            'build: own row definitive under the STOP gate (never an open-ended pending)')
    // #1540: the four honesty copy blocks the issue requires, with load-bearing facts.
    ok(['WHAT REPRODUCES.', 'WHAT DOES NOT.', 'WHY IT IS HONEST.', 'THE FIVE-SECOND TELL.']
        .every(m => html.includes(m)), 'copy: all four honesty blocks present')
    ok(html.includes('30/41') && html.includes('0 mtp/nextn tensors') && html.includes('forbidden by design'),
        'copy: precision fraction, MTP forensics, knob-tuning ban stated')
    ok(!html.replace('WHAT DOES NOT.', '·').includes('WHAT DOES NOT.'), 'mutant caught: a copy block removed')
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
    if (existsSync(join(dir, 'results/r2/jon_go_1562.json')))
        rmSync(join(dir, 'results/r2/jon_go_1562.json')) // PASS-gate scenario: no GO needed
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
    ok(threadingProblems(dir('r2_score.py')).length === 0, 'rules: scorer grades on the main thread',
        threadingProblems(dir('r2_score.py')).join('; '))
    ok(threadingProblems('def work(rec):\n ok, m = R.grade(gold, pred)\nwith ThreadPoolExecutor(max_workers=4) as ex:\n raws = list(ex.map(work, todo))').length > 0,
        'mutant caught: R.grade back inside the worker')
}

// 5. #1547 option C: presence-window audit + MIT grader + sidecar plumbing
{
    const dir = s => readFileSync(join(LAB, s), 'utf8')
    const common = dir('r2_common.py')
    ok(/WS_R2_PP_CTX/.test(common) && /presence_context_size/.test(common)
        && /if ctx and pp:/.test(common),
        'rules: ask() sends presence_context_size only when PP_CTX>0 (vLLM-parity window opt-in)')
    const rerun = dir('r2_run_rerun.sh')
    // env ASSIGNMENTS only — prose comments must not satisfy (or absorb mutations of) the pin
    const envOnly = t => t.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')
    const rerunOk = t => /WS_R2_PARALLEL=32/.test(t) && /WS_R2_PP_CTX=32768/.test(t)
        && /WS_R2_SETS=math/.test(t) && /WS_R2_SAVETEXT=1/.test(t) && /p50cw:qwen35-p50c-mlx/.test(t)
    ok(rerunOk(envOnly(rerun)), 'rules: rerun runner pins PAR-32 + full window + math + text sidecars', rerun)
    ok(!rerunOk(envOnly(rerun).replace('WS_R2_PP_CTX=32768', 'WS_R2_PP_CTX=0')),
        'mutant caught: rerun without the window fix')
    const score = dir('r2_score.py')
    ok(/WS_R2_SAVETEXT/.test(score) && /sha256/.test(score) && /r2_text/.test(score),
        'rules: scorer saves full-text sidecars outside the repo with sha pointers')
    ok(!(/WS_R2_SETS/.test(score.replace(/WS_R2_SETS/g, 'X'))), 'mutant caught: set-limit env dropped')
    const win = JSON.parse(readFileSync(join(LAB, 'results/r2/pp_window.json'), 'utf8'))
    ok(win.accepted && win.window_changes_output,
        'rules: oMLX accepts presence_context_size and the window changes generation')
    ok(!(win.accepted && { ...win, window_changes_output: false }).window_changes_output,
        'mutant caught: window probe inverted')
    const mit = JSON.parse(readFileSync(join(LAB, 'results/r2/mit_grader.json'), 'utf8'))
    const mitOk = m => m.all_match_mit && ['math500_10', 'math500_36', 'math500_88']
        .every(id => m.rows[id]?.mit_correct === true && m.rows[id]?.ours_correct === false)
    ok(mitOk(mit), 'rules: MIT grader confirms the three #1539 misgrades (rows 10/36/88)',
        JSON.stringify(mit.rows))
    ok(!mitOk({ ...mit, rows: { ...mit.rows, math500_10: { ...mit.rows.math500_10, mit_correct: false } } }),
        'mutant caught: grader witness row flipped')
}

// 8. #1547 option C verdict: the p50cw rerun rows, the frozen summary, MIT's
//    regrade and the page must all tell the same story.
{
    const scores = JSON.parse(readFileSync(join(LAB, 'results/r2/r2_scores.json'), 'utf8'))
    const w = scores.p50cw && scores.p50cw.math
    ok(w && w.n === 100 && w.finished >= w.acc, 'rules: p50cw math row complete and sane')
    const rows = readFileSync(join(LAB, 'results/r2/scores_p50cw_math.jsonl'), 'utf8')
        .split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
    const mism = (t, rs) => rs.length !== t.n
        || Math.abs(100 * rs.filter(r => r.ok).length / rs.length - t.acc) > 0.05
        || Math.abs(100 * rs.filter(r => r.finished).length / rs.length - t.finished) > 0.05
    ok(!mism(w, rows), 'rules: p50cw summary recomputes from the committed jsonl',
        `rows=${rows.length} acc=${100 * rows.filter(r => r.ok).length / rows.length} fin=${100 * rows.filter(r => r.finished).length / rows.length}`)
    ok(mism({ ...w, acc: w.acc + 5 }, rows), 'mutant caught: summary acc bumped off the rows')
    ok(mism(w, rows.slice(0, 80)), 'mutant caught: truncated row file still claims n=100')
    ok(w && scores.p50cw.pp_ctx === 32768 && scores.p50cw.pp === 1.5 && scores.p50cw.model === scores.p50c.model,
        'rules: p50cw row records the fixed window + same model as p50c')
    const mit = JSON.parse(readFileSync(join(LAB, 'results/r2/mit_grader.json'), 'utf8'))
    const rg = mit.regrade && mit.regrade['p50cw:math']
    ok(rg && rg.n === 100 && rg.mit_acc >= rg.ours_acc,
        'rules: MIT regrade covers all 100 p50cw rows', JSON.stringify(rg && { ours: rg.ours_acc, mit: rg.mit_acc }))
    const knownOk = r => ['math500_10', 'math500_36', 'math500_88'].every(id =>
        r.diffs.some(d => d.id === id && d.mit.ok && !d.ours.ok
            && String(d.mit.pred) === String(d.ours.pred)))
    ok(rg && knownOk(rg),
        'rules: the three #1539 rows survive MIT-correct/ours-wrong on the rerun too')
    ok(rg && !knownOk({ ...rg, diffs: rg.diffs.map(d => d.id === 'math500_36'
        ? { ...d, ours: { ...d.ours, ok: true } } : d) }),
        'mutant caught: a known misgrade silently "fixed"')
    ok(validateR2({ scores: { ...scores, p50cw: { ...scores.p50cw, gsm: { n: 100, acc: 0, finished: 0 } } } }).length > 0,
        'mutant caught: a gsm set smuggled under the math-only p50cw tag')
    const { rc, html } = build(LAB)
    ok(rc === 0 && html.includes('id="r2-p50cw"') &&
        html.includes('id="r2-p50cw"><td rowspan=1>#1547 option C — penalty window ctx 32768</td><td>math</td><td>100</td><td>31.0%</td>') &&
        html.includes('51.0%'),
        'build: p50cw row renders scored (31.0% acc / 51.0% finished)')
    ok(html.includes('45.8%') && /penalizes every generated token|whole-generation/.test(html),
        'copy: page states the MIT same-100 reference and the window finding')
}

// 9. #1562 step 2 (Jon re-opened): runner pins, directions source purity, and the
//    Jon-GO semantics on the page (gate STOP + jon_go + no own row => IN FLIGHT,
//    never "forbidden"; forbidden returns only when the GO marker is absent).
{
    const dir = s => readFileSync(join(LAB, s), 'utf8')
    const envOnly = t => t.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')
    const run = dir('r2_run_1562.sh')
    ok(/WS_R2_JON_GO=1/.test(envOnly(run)), 'rules: #1562 runner exports the explicit Jon-GO override (env, not comment)')
    const pinsOk = t => /WS_R2_PARALLEL=32/.test(t) && /WS_R2_PP_CTX=32768/.test(t)
        && /WS_R2_SAVETEXT=1/.test(t)
    ok(pinsOk(envOnly(run)), 'rules: #1562 runner pins PAR-32 + whole-generation window + text sidecars', run)
    ok(!pinsOk(envOnly(run).replace(/WS_R2_PP_CTX=32768/, 'WS_R2_PP_CTX=0')),
        'mutant caught: #1562 runner without the window pin')
    ok(/WS_R2_SETS=math,gsm \$V r2_score\.py own:qwen35-own/.test(run)
        && /WS_R2_SETS=gsm \$V r2_score\.py p50cw:/.test(run)
        && run.search(/own:qwen35-own/) < run.search(/p50cw:/),
        'rules: #1562 scores own (both sets) first, then p50c GSM8K — headline before baseline')
    ok(wiringProblems(run).length === 0, 'rules: #1562 registers qwen35-own before scoring', wiringProblems(run).join('; '))
    ok(wiringProblems(run.replace(/r2_register\.py qwen35-own --load/, 'sleep 5')).length > 0,
        'mutant caught: #1562 scores own without confirm-load')
    // directions source purity: practice + base only, never MIT's edited tensors
    const dirs = dir('r2_directions_1562.py')
    ok(!/apply_edit|edited_tensors|edited\/|load\(.*edited/.test(dirs),
        'rules: directions never reference MIT edit tensors (source is our measurements)')
    ok(/MIT_PRACTICE/.test(dirs) && /practice/.test(dirs) && /WS_R2_JON_GO/.test(dirs),
        'rules: directions gate on Jon-GO and draw only from MIT practice problems')
    ok(dirs.search(/step1_gate/) < dirs.search(/WS_R2_JON_GO/),
        'rules: step-1 gate still consulted first; GO only overrides its STOP')
    ok(/return recs\b/.test(dirs) && !/return refs\b/.test(dirs),
        'rules: make_refs returns record dicts, not raw tuples (crash caught live first attempt)')
    ok(/fin_pool\[:FIT_FIN\]/.test(dirs) && /fin_pool\[FIT_FIN:/.test(dirs)
        && !/fin_pool\[:FIT_N\]/.test(dirs),
        'rules: fin pool splits by FIT_FIN — validation fin cannot be starved (crash 2 fixed)')
    // Jon-GO page semantics (fixture dirs — live lab already in flight)
    const base = mkdtempSync(join(tmpdir(), 'ws3go-'))
    cpSync(LAB, base, { recursive: true })
    const bd = join(base, 'results/r2'); mkdirSync(bd, { recursive: true })
    if (existsSync(join(bd, 'jon_go_1562.json'))) rmSync(join(bd, 'jon_go_1562.json'))
    const scores = { _hold: 100,
        base: { math: { n: 100, acc: 3.0, finished: 3.0, mean_ntok: 31842 }, gsm: { n: 100, acc: 8.0, finished: 7.0, mean_ntok: 30686 } },
        p50c: { math: { n: 100, acc: 30.0, finished: 41.0, mean_ntok: 26100 }, gsm: { n: 100, acc: 54.0, finished: 75.0, mean_ntok: 17844 } },
        p50cw: { math: { n: 100, acc: 31.0, finished: 51.0, mean_ntok: 24012 } } }
    writeFileSync(join(bd, 'r2_scores.json'), JSON.stringify(scores))
    writeFileSync(join(bd, 'step1_gate.json'),
        JSON.stringify({ pass: false, detail: 'p50c math acc outside [40,56].', rows: {} }))
    const noGo = build(base)
    ok(noGo.rc === 0 && noGo.html.includes('forbidden — step-1 gate STOPped'),
        'rules: gate STOP + no GO => own row forbidden (never ran)')
    writeFileSync(join(bd, 'jon_go_1562.json'), JSON.stringify({ by: 'jon #1562' }))
    const go = build(base)
    ok(go.rc === 0 && !go.html.includes('forbidden — step-1 gate STOPped')
        && go.html.includes('#1562 — STEP 2 IN FLIGHT'),
        'rules: gate STOP + Jon-GO + no own row => pending/IN FLIGHT, forbidden lifted')
    rmSync(join(bd, 'jon_go_1562.json'))
    const rev = build(base)
    ok(rev.html.includes('forbidden — step-1 gate STOPped'),
        'mutant caught: dropping Jon-GO re-forbids the own row')
    const scored = { ...scores, own: { math: { n: 100, acc: 12.0, finished: 30.0, mean_ntok: 20000 }, gsm: { n: 100, acc: 20.0, finished: 45.0, mean_ntok: 12000 } } }
    writeFileSync(join(bd, 'jon_go_1562.json'), JSON.stringify({ by: 'jon #1562' }))
    writeFileSync(join(bd, 'r2_scores.json'), JSON.stringify(scored))
    const done = build(base)
    ok(done.rc === 0 && /THE OWN EDIT, JUDGED HONESTLY/.test(done.html)
        && !/STEP 2 IN FLIGHT/.test(done.html),
        'win: scored own + p50cw renders the honest verdict, not the in-flight note')
    ok(done.html.includes('12.0% math · 20.0% gsm') && done.html.includes('31.0% math'),
        'win: verdict states own per-set acc and the p50cw baseline it is judged against')
}

console.log(`\nws3check: ${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
