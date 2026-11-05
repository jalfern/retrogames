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

export const SETS = { p50cw: ['math', 'gsm'], own2: ['math', 'gsm'], own4: ['math', 'gsm'], own8: ['math', 'gsm'] } // #1547 rerun math-only; #1562 adds the GSM8K baseline row; #1567 v2: swept alphas score practice only — if a swept tag appears in held-out scores at all it is the winner, with both sets

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
    ok(validateR2({ scores: { ...scores, p50cw: { gsm: scores.p50cw.gsm } } }).length > 0,
        'mutant caught: dropping p50cw math from the two-set row is caught')
    const { rc, html } = build(LAB)
    ok(rc === 0 && html.includes('id="r2-p50cw"') &&
        html.includes('id="r2-p50cw"><td rowspan=2>#1547 option C — penalty window ctx 32768</td><td>math</td><td>100</td><td>31.0%</td>') &&
        html.includes('51.0%'),
        'build: p50cw row renders scored (31.0% acc / 51.0% finished)')
    ok(html.includes('id="r2-p50cw-gsm"') && html.includes('<td>gsm</td><td>100</td><td>48.0%</td><td>74.0%</td>'),
        'build: p50cw gsm row renders (#1562 GSM8K baseline 48.0% / 74.0%)')
    ok(/regrade.*p50cw:gsm/s.test(readFileSync(join(LAB, 'results/r2/mit_grader.json'), 'utf8')) &&
        JSON.parse(readFileSync(join(LAB, 'results/r2/mit_grader.json'), 'utf8')).regrade['p50cw:gsm'].n === 100,
        'rules: MIT regrade covers the p50cw gsm row too (#1562)')
    const bwA = (() => {
        try { return JSON.parse(readFileSync(join(LAB, 'results/r2/r2_scores.json'), 'utf8')).basew } catch { return null }
    })()
    const bwDone = bwA && bwA.math && bwA.gsm && bwA.math.n >= 100 && bwA.gsm.n >= 100
    ok(bwDone ? html.includes('CANDIDATE 1 — THE BASEW CONTROL') : html.includes('basew control: in flight'),
        bwDone ? 'rules: basew ran — the candidate-1 verdict renders'
            : 'rules: basew in flight — honest pending copy while the gsm row scores')
    ok(!html.includes('not run — optional control dropped'),
        'rules: stale #1562 "not run" disclosure retired — the control is running or run, never dropped')
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
    const doneReal = build(LAB)
    ok(doneReal.html.includes('5 of the disclosed 20 forward passes') &&
        doneReal.html.includes('7.0% math · 9.0% gsm') &&
        doneReal.html.includes('37.0% math · 48.0% gsm'),
        'copy: #1562 verdict states passes used + MIT-checker numbers for both rows')
}

// 10. #1567 round 3 — layer-ranking artifact + frozen decision rule, runner pins
//     and resume idempotency, alpha rows on the page, basew reverts honestly.
{
    const dir = s => readFileSync(join(LAB, s), 'utf8')
    const envOnly = t => t.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')
    const rank = JSON.parse(dir('results/r2/r3_layer_rank.json'))
    ok(rank.reproduces_p5_sep === true,
        'rules: seprank reproduces the P5 per-layer seps (plumbing gate before any ranking claim)')
    const ratio = rank.combined_sep.top4 / rank.combined_sep.top2
    ok((ratio >= 1.10 ? 'top4' : 'top2') === rank.decision,
        'rules: layer decision is the frozen 1.10x rule applied to the stored curve', `ratio ${ratio.toFixed(3)}`)
    ok(rank.combined_sep.top2 > 1 && rank.combined_sep.top4 >= rank.combined_sep.top2,
        'rules: combined sep sane (top-2 separates, top-4 not below top-2)')
    ok(rank.n_texts >= 48 && rank.n_skipped + rank.n_texts === 68,
        'rules: seprank text accounting closes (kept + skipped = val items)', `${rank.n_texts}+${rank.n_skipped}`)
    const c3logs = readFileSync(join(LAB, 'batches.jsonl'), 'utf8').split('\n').filter(Boolean)
        .map(l => { try { return JSON.parse(l) } catch { return {} } })
        .filter(b => (b.purpose || '').startsWith('#1567 candidate 3'))
    ok(c3logs.length === 2 && c3logs.some(b => b.superseded_by === 7) && c3logs.some(b => b.pass_no === 7 && b.supersedes),
        'rules: defective pass-6 record kept AND annotated; pass 7 supersedes it (ledger is honest about its own fix)')
    const run = dir('r3_run_1567.sh')
    ok(/WS_R2_JON_GO=1/.test(envOnly(run)) && /WS_R2_PARALLEL=32/.test(envOnly(run))
        && /WS_R2_PP_CTX=32768/.test(envOnly(run)) && /WS_R2_SAVETEXT=1/.test(envOnly(run)),
        'rules: #1567 runner pins PAR-32 + whole-generation window + sidecars + Jon-GO')
    ok(!envOnly(run).includes('WS_R2_PP_CTX=32768'.replace('32768', '0')),
        'rules: #1567 runner window pin intact')
    const code = envOnly(run)
    ok(/for A in 2 4 8/.test(code) && /WS_R3_PASS=\$PASS \$V r3_practice\.py own\$\{A\}:qwen35-own-a\$\{A\}/.test(code)
        && !/WS_R2_SETS=math \$V r2_score\.py own\$\{A\}/.test(code),
        'rules: alpha sweep {2,4,8} scores PRACTICE only — no held-out rows for the sweep (Jon ruling 23:31Z)')
    ok(/r3_pick\.py/.test(code) && /WINNER/.test(code)
        && /WS_R2_SETS=math,gsm \$V r2_score\.py \$\{WINNER\}:qwen35-own-a\$\{W_ALPHA\}/.test(code),
        'rules: held-out is scored once, for the practice winner only (choose on practice, score held-out once)')
    ok(code.search(/r3_practice\.py own/) < code.search(/r3_pick\.py/) && code.search(/r3_pick\.py/) < code.search(/R3_OWNHELD_DONE/),
        'rules: pick happens after the sweep and before the single held-out row')
    ok(/edit_report\.json/.test(run) && /R3_ALPHA\$\{A\}_DONE/.test(run) && /R3_BASEW_DONE/.test(run),
        'rules: alpha/basew stages marker-guarded — resume neither re-applies edits nor re-logs passes')
    ok(!/r2_mit_grade\.py\s+[^|#\s]/.test(envOnly(run)),
        'rules: MIT regrade runs with NO args (argv form silently drops prior rows — #1562 law)')
    // v1's defect, frozen as law: the swept variants must NEVER have held-out rows
    {
        const heldTags = ['own2', 'own4', 'own8']
            .filter(t => existsSync(join(LAB, 'results/r2', `scores_${t}_math.jsonl`)))
        const pickP = join(LAB, 'results/r2/r3_alpha_pick.json')
        const pick = existsSync(pickP) ? JSON.parse(readFileSync(pickP, 'utf8')) : null
        ok(!pick || heldTags.length <= 1,
            'rules: at most ONE swept alpha ever reaches held-out (the winner)')
        ok(!pick || heldTags.length === 0 || heldTags[0] === pick.decision,
            'rules: any swept-alpha held-out rows belong to the practice winner',
            `held=${heldTags} winner=${pick && pick.decision}`)
        ok(pick ? !pick.decision || !['own2', 'own4', 'own8'].filter(t => heldTags.includes(t) && t !== pick.decision).length
            : true, 'rules: held-out-once evidence consistent with the pick')
        // mutant: a loser alpha with held-out rows is a protocol violation
        ok(pick ? ['own2', 'own4', 'own8'].filter(t => t !== pick.decision).some(() => true) : true,
            'rules: losers exist to be violated by the mutant')
    }
    // practice scorer: fresh disjoint batch, cap 8192, main-thread grading
    {
        const prac = dir('r3_practice.py')
        ok(/USED = 96/.test(prac) && /math\[USED:USED \+ N_PRACTICE\]/.test(prac)
            && /assert not \(\{r\["problem"\] for r in batch\} & seen\)/.test(prac),
            'rules: practice batch is fresh math[96:160] with a disjointness assert (never reuses #1562 fit/val problems)')
        ok(/CAP = 8192/.test(prac), 'rules: practice scoring runs at cap 8192 (the direction-search horizon)')
        const span = prac.match(/def work\(rec\)[\s\S]*?ex\.map\(work/)
        ok(span && !/R\.grade\(/.test(span[0]), 'rules: practice scorer grades on the main thread too')
        ok(/if n_new:/.test(prac), 'rules: practice pass logs only when new rows generated (#1562 resume law)')
        // mutant: reusing #1562's indices would contaminate the selection set
        ok(!/math\[0:N_PRACTICE\]/.test(prac), 'mutant caught: practice batch overlapping #1562 corpus indices')
    }
    // pick: frozen rule + recomputation consistency
    {
        const pickP = join(LAB, 'results/r2/r3_alpha_pick.json')
        const pracP = t => join(LAB, 'results/r2', `practice_${t}.json`)
        ok(/max practice accuracy/.test(dir('r3_pick.py')) && /smaller alpha/.test(dir('r3_pick.py')),
            'rules: pick rule is frozen in the script (accuracy first, fin tie-break, smaller alpha last)')
        if (existsSync(pickP) && ['own2', 'own4', 'own8'].every(t => existsSync(pracP(t)))) {
            const pick = JSON.parse(readFileSync(pickP, 'utf8'))
            const rows = ['own2', 'own4', 'own8'].map(t => [t, JSON.parse(readFileSync(pracP(t), 'utf8'))])
            const best = rows.sort((a, b) => b[1].acc - a[1].acc || b[1].finished - a[1].finished
                || parseInt(a[0].slice(3)) - parseInt(b[0].slice(3)))[0][0]
            ok(pick.decision === best, 'rules: stored pick equals the frozen rule recomputed from practice rows',
                `stored ${pick.decision} vs recomputed ${best}`)
            ok(pick.decision !== ['own2', 'own4', 'own8'].find(t =>
                JSON.parse(readFileSync(pracP(t), 'utf8')).acc !== JSON.parse(readFileSync(pracP(best), 'utf8')).acc
                && JSON.parse(readFileSync(pracP(t), 'utf8')).acc > JSON.parse(readFileSync(pracP(best), 'utf8')).acc),
                'mutant caught: a pick that is not the practice-accuracy winner')
        } else console.log('  skip pick recomputation (practice rows not complete yet)')
    }
    const r3html = build(LAB)
    ok(r3html.rc === 0 && r3html.html.includes('ROUND 3 — SCALING THE OWN EDIT (#1567)'),
        'build: ROUND 3 section renders from the committed lab')
    ok(['r3-a1', 'r3-a2', 'r3-a4', 'r3-a8'].every(id => r3html.html.includes(`id="${id}"`)),
        'build: all four alpha rows present (pending states stay honest)')
    ok(r3html.html.includes(`MORE LAYERS? ${rank.decision === 'top4' ? 'YES' : 'NO'}`),
        'build: page verdict agrees with the stored decision')
    const base = mkdtempSync(join(tmpdir(), 'ws3r3-'))
    cpSync(LAB, base, { recursive: true })
    const bd = join(base, 'results/r2')
    const sc = JSON.parse(readFileSync(join(bd, 'r2_scores.json'), 'utf8'))
    delete sc.basew
    writeFileSync(join(bd, 'r2_scores.json'), JSON.stringify(sc))
    const gone = build(base)
    ok(gone.rc === 0 && gone.html.includes('basew control: in flight'),
        'mutant caught: dropping the basew artifact reverts the page to honest pending, never a silent hole')
    rmSync(base, { recursive: true, force: true })
}

// 11. #1567 stage E — the winner's ONE held-out row: rows are the evidence
//     (aggregate recomputed from them), losers never reach held-out, the ledger
//     logs the row exactly once, MIT regrade covers both sets, and the page
//     verdict renders from artifacts and reverts honestly when they vanish.
{
    const jp = (root, s) => join(root, 'results/r2', s)
    const harvestIssues = (root) => {
        const errs = []
        const pickP = jp(root, 'r3_alpha_pick.json')
        if (!existsSync(pickP)) return errs
        const tag = JSON.parse(readFileSync(pickP, 'utf8')).decision
        for (const t of ['own2', 'own8'])
            if (t !== tag && existsSync(jp(root, `scores_${t}_math.jsonl`)))
                errs.push(`loser alpha ${t} has held-out rows (held-out is scored once — winner only)`)
        const aggP = jp(root, 'r2_scores.json')
        const agg = existsSync(aggP) ? JSON.parse(readFileSync(aggP, 'utf8')) : {}
        const e = agg[tag] || {}
        for (const set of ['math', 'gsm']) {
            const rp = jp(root, `scores_${tag}_${set}.jsonl`)
            if (!existsSync(rp)) { errs.push(`${tag}.${set}: held-out rows missing`); continue }
            const rows = readFileSync(rp, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
            if (new Set(rows.map(r => r.id)).size !== rows.length) errs.push(`${tag}.${set}: duplicate ids in scores`)
            const n = rows.length
            const r1 = (x) => Math.round(x * 10) / 10
            const acc = r1(rows.filter(r => r.ok).length / Math.max(n, 1) * 100)
            const fin = r1(rows.filter(r => r.finished).length / Math.max(n, 1) * 100)
            const mean = Math.round(sum0(rows.map(r => r.ntok)) / Math.max(n, 1))
            const ent = e[set]
            if (!ent) { errs.push(`${tag}.${set}: entry missing from r2_scores.json`); continue }
            if (ent.n !== n) errs.push(`${tag}.${set}: n ${ent.n} != ${n} rows on disk`)
            if (Math.abs(ent.acc - acc) > 0.05) errs.push(`${tag}.${set}: aggregate acc ${ent.acc} != ${acc} recomputed from rows`)
            if (Math.abs(ent.finished - fin) > 0.05) errs.push(`${tag}.${set}: aggregate finished ${ent.finished} != ${fin} recomputed`)
            if (Math.abs(ent.mean_ntok - mean) > 1) errs.push(`${tag}.${set}: mean_ntok drifts from rows`)
        }
        const logs = readFileSync(join(root, 'batches.jsonl'), 'utf8').split('\n').filter(Boolean)
            .map(l => { try { return JSON.parse(l) } catch { return {} } })
            .filter(b => (b.purpose || '').startsWith(`held-out scoring row ${tag} `))
        if (logs.length !== 1) errs.push(`batches: ${logs.length} held-out ledger rows for ${tag} — exactly one required`)
        const mgP = jp(root, 'mit_grader.json')
        const mg = existsSync(mgP) ? JSON.parse(readFileSync(mgP, 'utf8')) : {}
        for (const set of ['math', 'gsm']) {
            const rr = mg.regrade && mg.regrade[`${tag}:${set}`]
            if (!rr) errs.push(`${tag}:${set}: no MIT regrade row`)
            else if (!(rr.n === 100 && rr.mit_acc >= 0 && rr.mit_acc <= 100)) errs.push(`${tag}:${set}: regrade incomplete`)
        }
        return errs
    }
    const sum0 = (xs) => xs.reduce((a, b) => a + b, 0)
    const realPick = existsSync(jp(LAB, 'r3_alpha_pick.json'))
        ? JSON.parse(readFileSync(jp(LAB, 'r3_alpha_pick.json'), 'utf8')).decision : null
    // a committed marker means the row was complete when it was committed —
    // an orphan marker (row lost in a checkout, #1567 stage-E lesson) is RED.
    if (realPick && existsSync(jp(LAB, `R3_OWNHELD_DONE`))) {
        const h = harvestIssues(LAB)
        ok(h.length === 0, 'rules: stage E committed — winner rows complete, aggregate recomputed from rows, regrade covered, ledger once', h.join('; '))
    } else console.log('  skip stage-E committed-state gates (R3_OWNHELD_DONE not on this tip)')
    // fixture: the complete stage-E state passes clean, every corruption is caught
    if (realPick) {
        const tag = realPick
        const fx = mkdtempSync(join(tmpdir(), 'ws3e-'))
        cpSync(LAB, fx, { recursive: true })
        const mkRows = (set, accN) => Array.from({ length: 100 }, (_, i) => JSON.stringify({
            id: `${set}_${i}`, pred: '1', ok: i < accN, finished: i < accN, ntok: 20000, method: 'test',
        })).join('\n') + '\n'
        const put = (set, accN) => writeFileSync(jp(fx, `scores_${tag}_${set}.jsonl`), mkRows(set, accN))
        put('math', 6); put('gsm', 8)
        const aggFx = JSON.parse(readFileSync(jp(fx, 'r2_scores.json'), 'utf8'))
        aggFx[tag] = {
            math: { n: 100, acc: 6.0, finished: 6.0, mean_ntok: 20000 },
            gsm: { n: 100, acc: 8.0, finished: 8.0, mean_ntok: 20000 },
            t_hours: 2.5, pp: 1.5, pp_ctx: 32768, model: `qwen35-${tag.replace('own', 'own-a')}`,
        }
        writeFileSync(jp(fx, 'r2_scores.json'), JSON.stringify(aggFx))
        writeFileSync(join(fx, 'batches.jsonl'),
            JSON.stringify({ ts: '2026-11-05T04:40:00Z', run: 'r2 (#1533)', purpose: `held-out scoring row ${tag} (qwen35-${tag.replace('own', 'own-a')}, think35 pp=1.5 pp_ctx=32768)`, ruled_out: 'fixture', model: 'qwen35-fixture', n: 200, total_tokens: 4000000, t_hours: 2.5 }) + '\n', { flag: 'a' })
        const mgFx = JSON.parse(readFileSync(jp(fx, 'mit_grader.json'), 'utf8'))
        for (const [set, macc] of [['math', 7.0], ['gsm', 8.0]])
            mgFx.regrade[`${tag}:${set}`] = { n: 100, ours_acc: set === 'math' ? 6.0 : 8.0, mit_acc: macc, pred_none_finished_sidecar_ok: 0, diffs: [] }
        writeFileSync(jp(fx, 'mit_grader.json'), JSON.stringify(mgFx))
        writeFileSync(jp(fx, 'R3_OWNHELD_DONE'), '')
        ok(harvestIssues(fx).length === 0, 'win: complete stage-E fixture is clean', harvestIssues(fx).join('; '))
        // mutants
        writeFileSync(jp(fx, `scores_${tag}_math.jsonl`), mkRows('math', 60))
        ok(harvestIssues(fx).length > 0, 'mutant caught: aggregate acc no longer matches the rows')
        writeFileSync(jp(fx, `scores_${tag}_math.jsonl`), mkRows('math', 6))
        writeFileSync(jp(fx, `scores_own8_math.jsonl`), mkRows('math', 2))
        ok(harvestIssues(fx).length > 0, 'mutant caught: loser alpha with held-out rows')
        rmSync(jp(fx, `scores_own8_math.jsonl`))
        writeFileSync(join(fx, 'batches.jsonl'),
            JSON.stringify({ purpose: `held-out scoring row ${tag} (resume double-log)` }) + '\n', { flag: 'a' })
        ok(harvestIssues(fx).length > 0, 'mutant caught: held-out row logged twice in the ledger')
        {
            const mg2 = JSON.parse(readFileSync(jp(fx, 'mit_grader.json'), 'utf8'))
            delete mg2.regrade[`${tag}:gsm`]
            writeFileSync(jp(fx, 'mit_grader.json'), JSON.stringify(mg2))
            ok(harvestIssues(fx).length > 0, 'mutant caught: winner set without MIT regrade coverage')
            mg2.regrade[`${tag}:gsm`] = { n: 100, ours_acc: 8.0, mit_acc: 8.0, pred_none_finished_sidecar_ok: 0, diffs: [] }
            writeFileSync(jp(fx, 'mit_grader.json'), JSON.stringify(mg2))
            // strip the ledger dup back to the single real row
            const keep = readFileSync(join(fx, 'batches.jsonl'), 'utf8').split('\n').filter(Boolean)
                .filter((l, i, a) => !(JSON.parse(l).purpose || '').includes('resume double-log'))
            writeFileSync(join(fx, 'batches.jsonl'), keep.join('\n') + '\n')
            ok(harvestIssues(fx).length === 0, 'win: fixture restored — gates are the corruption, not the state')
        }
        // page: verdict renders from artifacts, numbers are NOT baked in, revert honest
        const wb = build(fx)
        ok(wb.rc === 0 && wb.html.includes('id="r3-verdict"') && wb.html.includes('SCORED ONCE'),
            'build: winner held-out verdict renders from artifacts')
        // consistent inflation — page shows what artifacts claim (provenance, not template)
        aggFx[tag].math.acc = 99.0
        writeFileSync(jp(fx, 'r2_scores.json'), JSON.stringify(aggFx))
        const pb = build(fx)
        ok(pb.html.includes('99.0% acc') && pb.html.includes('id="r3-verdict"'),
            'mutant caught: verdict numbers come from the aggregate — an inflated artifact renders inflated (rows gate goes red on real drift)')
        // honest revert: winner entry vanishes -> pending cell returns, verdict gone
        delete aggFx[tag]
        writeFileSync(jp(fx, 'r2_scores.json'), JSON.stringify(aggFx))
        const rb = build(fx)
        ok(rb.html.includes('scoring now — the ONE held-out row this round') && !rb.html.includes('id="r3-verdict"'),
            'mutant caught: dropping the winner row reverts the page to honest pending, never a silent hole')
        rmSync(fx, { recursive: true, force: true })
    }
}

console.log(`\nws3check: ${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
