// ws2check — WEIGHT SURGERY II (#1505) demo-harness check, plain Node, no browser.
// Proves three things for the lab page and its artifacts:
//   boot    : build_demo.mjs renders from the committed lab copy (no results dir
//             — every panel must fall back honestly, never crash) AND from a
//             fixture lab carrying synthetic v2 artifacts (table + SIGNAL verdict).
//   rules   : batch-log invariants (every batch states purpose+ruled_out,
//             terminated+hit_cap==n, looped<=n) and a JS mirror of the Python
//             repeat-onset detector (step8) on synthetic texts.
//   win     : a variant that beats base terminates-and-scores is REPORTED as
//             SIGNAL by the fixture build (the page can show a real win), and
//             `-- --mutate` falsifies artifacts in memory — each mutation MUST
//             be caught. If the real lab exists, its v2 artifacts are validated
//             too (local proof; skipped on CI where the lab doesn't exist).
// Run: node scripts/ws2check.mjs   |   node scripts/ws2check.mjs -- --mutate

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LAB = 'demos/weight-surgery-lab'
// how many first-pass score rows the committed batches prove superseded —
// the gate counts exactly this (the committed lab lags the live lab; hardcoding 4 here would)
const ovrExpected = (() => {
  try {
    const bs = readFileSync(join(LAB, 'batches.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
    const sp = (b) => b.split ?? (b.run ? `${b.run} · ${b.set}` : '—')
    const sup = new Set(bs.filter(b => b.phase === 'score-fair').map(sp))
    return bs.filter(b => b.phase === 'score' && sup.has(sp(b))).length
  } catch { return 0 }
})()
let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ---- validate artifacts (pure, so mutants run in memory) ----
export function validateArtifacts({ batches, variants }) {
    const errs = []
    for (const [i, b] of batches.entries()) {
        // score/fair-score lines are mechanical readouts — the WHY lives on the
        // decision line; the fair rescore (#1506) phase name must be exempt too
        if (!b.purpose && b.phase !== "score" && b.phase !== "score-fair") errs.push(`batch ${i}: missing purpose`)
        if (b.n !== undefined && b.terminated !== undefined && b.looped !== undefined) {
            if (b.looped > b.n) errs.push(`batch ${i}: looped>n`)
            if (b.terminated + (b.hit_cap ?? 0) > b.n && b.hit_cap !== undefined)
                errs.push(`batch ${i}: terminated+hit_cap>n`)
            if (b.correct > b.terminated && b.correct !== undefined && b.hit_cap !== undefined)
                errs.push(`batch ${i}: correct>terminated at fixed cap`)
        }
    }
    for (const [k, s] of Object.entries(variants)) {
        if (s.terminated > (s.batch ?? 12)) errs.push(`variant ${k}: terminated>n`)
        if (s.correct > (s.batch ?? 12)) errs.push(`variant ${k}: correct>n`)
        if (s.batch && s.rows && s.rows.length !== s.batch) errs.push(`variant ${k}: rows!=batch`)
        // a row that "terminated" with zero parsed tokens and no est flag is the
        // dead-regex signature (llama v0.3.0 pipe-form) — never trust it
        if (s.rows) for (const [i, r] of s.rows.entries())
            if (r.ntok === 0 && r.cap === false && r.est === false)
                errs.push(`variant ${k}: row ${i} ntok=0 & est=false but not capped — token parse was broken for this row`)
    }
    return errs
}

// ---- JS mirror of step8.repeat_onset (word-level, same shape) ----
export function repeatOnset(words, SUST = 16, PMAX = 128) {
    for (let i = 12; i < words.length - SUST; i++)
        for (let p = 4; p <= PMAX; p++) {
            const j = i - p
            if (j < 0) break
            if (words[i] !== words[j]) continue
            let k = 0
            while (k < SUST && words[i + k] === words[j + k]) k++
            if (k === SUST) return i
        }
    return null
}

// ---- build helper ----
function build(labDir) {
    const out = join(tmpdir(), `ws2-${Date.now()}-${Math.random()}.html`)
    const r = spawnSync('node', [join(LAB, 'build_demo.mjs'), out], {
        env: { ...process.env, LAB_DIR: labDir }, encoding: 'utf8',
    })
    return { rc: r.status, html: existsSync(out) ? readFileSync(out, 'utf8') : '', err: r.stderr }
}

console.log('ws2check — WEIGHT SURGERY II harness (#1505)')

// 1. boot from the committed lab copy — v2 artifacts are committed, so the page
//    must render real v2 rows; an EMPTY lab must still build with honest fallbacks
{
    const { rc, html, err } = build(LAB)
    ok(rc === 0, 'build: committed lab exits 0', err?.slice(0, 120))
    ok(html.includes('WEIGHT SURGERY'), 'build: page has title')
    ok(html.includes('SURGERY II'), 'build: SURGERY II section present')
    ok(html.includes('VERDICT II'), 'build: committed lab renders a v2 verdict')
    ok(!html.includes('v2 runs pending'), 'build: committed lab renders real rows, not the pending fallback')
    ok(html.includes('Sparks of Weight-Space Programming'), 'build: sources intact')
    ok(html.includes('#1505'), 'build: links issue #1505')
    // #1515 visual-polish presence gates (depth heat, onset plot, edit maps, speed strip, mobile cap)
    ok(html.includes('id="heat2"') && html.includes('class="lin"'), 'build: depth-heat renders with linear-attn interleave slots')
    ok(html.includes('n-gram reuse') && html.includes('class="cells onset"'), 'build: onset-reuse plot renders')
    ok((html.match(/class="emap"/g) || []).length === 3, 'build: A/B/C edit-map thumbnails all render')
    ok(html.includes('id="speedkpi"') && html.includes('1.8×'), 'build: Q4 speed KPI strip present')
    ok(html.includes('.pane pre{max-height:200px;}'), 'build: mobile 700px pane pre-cap present')
    // #1520 polish items ii–v presence gates
    ok(html.includes('<details class="fn"'), 'build: † estimate footnote collapses to one line (item ii)')
    ok(html.includes('<details class="fn"><summary>† the terminated'), 'build: the collapse carries the bounds story in its summary (item ii)')
    ok(html.includes('id="heatreadout"') && html.includes('id="heat2readout"') && html.includes('data-info='), 'build: heat-bar tap readout on both boards (item iv)')
    ok((html.match(/min-width:6px/g) || []).length === 2 && (html.match(/gap:3px/g) || []).length === 2, 'build: heat bars padded to touch targets both boards (item iv)')
    ok((html.match(/class="ovr"/g) || []).length === ovrExpected && ovrExpected >= 2, 'build: every provably superseded score row is dimmed, not deleted (item v)')
    const fxq = JSON.parse(readFileSync(join(LAB, 'fair_excerpts.json'), 'utf8'))
    ok(['base_math', 'sampfix_math', 'base_gsm', 'sampfix_gsm', 'k256_math', 'k256_gsm'].every(k => Array.isArray(fxq[k]) && fxq[k].length === 10),
        'data: fair_excerpts covers all six fair runs, 10 problems each (item iii + #1506 completion)')
    ok(Object.values(fxq).flat().every(r => r.x.length <= 600 && r.q.length <= 140 && Number.isInteger(r.ntok)),
        'data: excerpts capped (text ≤600, problem ≤140) — drill-down ships text, not weights (item iii)')
    ok(!Object.values(fxq).flat().some(r => /Loading model/.test(r.x)),
        'data: no llama-cli banner contamination in committed excerpts (#1506 honesty)')
    // #1506 closeout: all six fair rows + verdict on top + honest bounds kept
    ok(html.includes('id="verdictfair"') && html.indexOf('verdictlead') < html.indexOf('THE BUG'),
        'build: fair verdict leads the page (id verdictfair above the story) (#1506)')
    ok(/did not fix it/.test(html) && html.includes('5.0% → 20.0%'),
        'build: verdict leads with the plain answer + GSM loop-flag regression (#1506)')
    ok(html.includes('id="verdictfairtbl"') && html.includes('presence penalty (pp1.5)') && html.includes('base (pp0)'),
        'build: verdict table — base vs presence penalty vs k256 (#1506)')
    ok(html.includes('#1506 closes by direction with no new experiments') && html.includes('fair_honesty.json'),
        'build: † footnote keeps the ≥ bounds and says why + banner contamination in the open (#1506)')
    ok(html.includes('SUPERSEDED') && html.includes('releases the issue-rule lock'),
        'build: first-pass verdict retired as superseded; MIT-model lock released with numbers on record (#1506)')
    ok(!html.includes('never opened') && !html.includes('The exact-count rerun refreshes'),
        'build: stale promises/claims removed (no "never opened", no rerun-refresh promise) (#1506)')
    ok(html.includes('sampfix · math') && html.includes('k256 · gsm') && !html.includes('scoring in progress — final row lands'),
        'build: batch log carries all six score-fair rows; no mid-run rows remain (#1506)')
    const idx = readFileSync('public/demos/index.html', 'utf8')
    ok(/WEIGHT SURGERY[\s\S]*Round II/.test(idx), 'index: WEIGHT SURGERY card copy mentions Round II')
    const empty = mkdtempSync(join(tmpdir(), 'ws2empty-'))
    cpSync(join(LAB, 'build_demo.mjs'), join(empty, 'build_demo.mjs'))
    writeFileSync(join(empty, 'batches.jsonl'), '')
    const e2 = build(empty)
    ok(e2.rc === 0 && e2.html.includes('v2 runs pending'), 'build: empty lab falls back honestly')
}

// 2. boot from a fixture lab WITH synthetic v2 artifacts — must show SIGNAL
{
    const dir = mkdtempSync(join(tmpdir(), 'ws2fix-'))
    cpSync(LAB, dir, { recursive: true })
    const rowsOk = Array.from({ length: 12 }, (_, i) => ({ ok: i < 3, cap: false, loop: false, ntok: 300 + i }))
    const rowsCap = Array.from({ length: 12 }, () => ({ ok: false, cap: true, loop: true, ntok: 4096 }))
    const fx = {
        base: { terminated: 0, looped: 12, correct: 0, batch: 12, rows: rowsCap },
        A: { terminated: 1, looped: 11, correct: 0, batch: 12, rows: rowsCap.map(r => ({ ...r })) },
        B: { terminated: 2, looped: 10, correct: 1, batch: 12, rows: rowsCap.map((r, i) => i < 2 ? { ok: i === 0, cap: false, loop: false, ntok: 400 } : r) },
        C: { terminated: 5, looped: 7, correct: 3, batch: 12, rows: rowsOk.map((r, i) => ({ ...r, cap: i >= 5 })) },
    }
    const rd = join(dir, 'results')
    mkdirSync(rd, { recursive: true })
    writeFileSync(join(rd, 'v2_variants.json'), JSON.stringify(fx))
    // #1520-iii/v: a finished fair run — rows must carry ids, expand to per-problem
    // excerpts, and the score-fair log row must link here (fixture: real excerpts, synthetic n)
    const frecs = Array.from({ length: 100 }, (_, i) => ({ i, ok: i < 4, cap_hit: i >= 70, loop: i === 5, ntok: 2000 + i, problem: `p${i}`, text: `t${i}` }))
    writeFileSync(join(rd, 'fair_base_math.jsonl'), frecs.map(r => JSON.stringify(r)).join('\n'))
    const { rc, html } = build(dir)
    ok(rc === 0, 'build: fixture lab exits 0')
    ok(html.includes('5/12'), 'win: fixture C row renders 5/12 terminated')
    ok(/VERDICT II: a variant terminates/.test(html), 'win: SIGNAL verdict shown when a variant beats base')
    ok(html.includes('id="h-base_math"'), 'win: finished fair row carries its batch-anchor id (item iii/v)')
    ok((html.match(/<details class="dd">/g) || []).length === 6 && html.includes('drill down — first 10/100 scored'),
        'win: every fair row expands to 10 per-problem excerpts — five from the committed summary rows fallback (#1506)')
    ok(html.includes('href="#h-base_math"'), 'win: score-fair log row links to its table row (item v)')
}

// 3. rules — committed batch log invariants + onset mirror
{
    const batches = readFileSync(join(LAB, 'batches.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
    ok(validateArtifacts({ batches, variants: {} }).length === 0, 'rules: committed batches.jsonl consistent',
        validateArtifacts({ batches, variants: {} }).join('; '))
    const loopWords = ('the model solves the task by thinking about numbers then thinking about numbers again ' +
        'and thinking about numbers again and thinking about numbers again and thinking about numbers again ' +
        'and thinking about numbers again forever and ever and ever').split(' ')
    ok(repeatOnset(loopWords) !== null && repeatOnset(loopWords) < loopWords.length / 2,
        'rules: onset detected early in a synthetic loop')
    const clean = ('first compute the sum of the parts and then divide by two to get the ' +
        'average which equals forty two at the end of this short answer here today').split(' ')
    ok(repeatOnset(clean) === null, 'rules: clean text reports no onset')
}

// 4. local proof — validate the real lab's v2 artifacts when present
{
    const real = join(process.env.HOME || '', 'Dev/weight-lab/qwen-forge')
    if (existsSync(join(real, 'results/v2_variants.json'))) {
        const variants = JSON.parse(readFileSync(join(real, 'results/v2_variants.json'), 'utf8'))
        const rb = readFileSync(join(real, 'batches.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
        ok(validateArtifacts({ batches: rb, variants }).length === 0, 'local: real lab v2 artifacts consistent',
            validateArtifacts({ batches: rb, variants }).join('; '))
        ok(variants.base !== undefined, 'local: base row present in real v2 results')
    } else {
        console.log('  skip local lab proof (not this machine / not built yet)')
    }
}

// 5. proven failure — falsified artifacts MUST be caught
if (process.argv.includes('--mutate')) {
    const mutants = [
        ['terminated>n', { batches: [], variants: { X: { terminated: 13, correct: 0, batch: 12 } } }],
        ['correct>n', { batches: [], variants: { X: { terminated: 2, correct: 13, batch: 12 } } }],
        ['purposeless batch', { batches: [{ n: 12, terminated: 0 }], variants: {} }],
        ['rows!=batch', { batches: [], variants: { X: { terminated: 1, correct: 0, batch: 12, rows: [{ ok: false, cap: true, loop: true, ntok: 1 }] } } }],
        ['ntok0-fake-terminate', { batches: [], variants: { X: { terminated: 12, correct: 0, batch: 12, rows: Array.from({ length: 12 }, () => ({ ok: false, cap: false, loop: false, ntok: 0, est: false })) } } }],
    ]
    for (const [name, data] of mutants)
        ok(validateArtifacts(data).length > 0, `mutant caught: ${name}`)
    // html-level mutants: removing each #1515 feature marker must fail its gate
    const { html } = build(LAB)
    const feats = [
        ['depth-heat', 'id="heat2"', h => h.includes('id="heat2"') && h.includes('class="lin"')],
        ['onset-plot', 'class="cells onset"', h => h.includes('n-gram reuse') && h.includes('class="cells onset"')],
        ['edit-maps', 'class="emap"', h => (h.match(/class="emap"/g) || []).length === 3],
        ['speed-strip', 'id="speedkpi"', h => h.includes('id="speedkpi"') && h.includes('1.8×')],
        ['mobile-pre-cap', '.pane pre{max-height:200px;}', h => h.includes('.pane pre{max-height:200px;}')],
        ['scoring-bar', '@keyframes sweep', h => h.includes('@keyframes sweep')], // mid-run markup now fixture-only (#1506 completed the rows); CSS retained
        ['pair-skeleton', 'skelpair', h => h.includes('class="pair skelpair"') && h.includes('class="skel w80"')],
        ['fn-collapse', '<summary>† the terminated', h => h.includes('<details class="fn"><summary>† the terminated')],
        ['heat-readout', 'id="heatreadout"', h => h.includes('id="heatreadout"') && h.includes('id="heat2readout"')],
        ['touch-targets', 'min-width:6px', h => (h.match(/min-width:6px/g) || []).length === 2 && (h.match(/gap:3px/g) || []).length === 2],
        ['ovr-dim', 'class="ovr"', h => (h.match(/class="ovr"/g) || []).length === ovrExpected],
        ['verdict-fair', 'id="verdictfair"', h => h.includes('id="verdictfair"') && h.indexOf('verdictlead') < h.indexOf('THE BUG')],
        ['verdict-lead', 'did not fix it', h => /did not fix it/.test(h) && h.includes('5.0% → 20.0%')],
        ['verdict-table', 'verdictfairtbl', h => h.includes('id="verdictfairtbl"') && h.includes('presence penalty (pp1.5)')],
        ['bounds-kept', '#1506 closes by direction', h => h.includes('#1506 closes by direction with no new experiments')],
    ]
    for (const [name, marker, pred] of feats) {
        ok(pred(html), `feature present: ${name}`)
        ok(!pred(html.replace(marker, '')), `mutant caught: ${name} removed`)
        if (name === 'fn-collapse') ok(!pred(html.replace('<summary>† the terminated / hit-cap bounds — why they are bounds, not points</summary>', '<p>† bounds</p>')), 'mutant caught: fn summary gutted')    }
    { // item iii/v on a lab that proves them: finished fair row → id + drill-down + anchor;
      //  removing the excerpts artifact must kill the drill-down but keep the row honest
      const dir3 = mkdtempSync(join(tmpdir(), 'ws2anchor-'))
      cpSync(LAB, dir3, { recursive: true })
      const rd3 = join(dir3, 'results'); mkdirSync(rd3, { recursive: true })
      writeFileSync(join(rd3, 'fair_base_math.jsonl'), Array.from({ length: 100 }, (_, i) => JSON.stringify({ i, ok: i < 4, cap_hit: i >= 70, loop: false, ntok: 2000 + i, problem: 'p', text: 't' })).join('\n'))
      const ha = build(dir3).html
      ok(ha.includes('id="h-base_math"') && ha.includes('href="#h-base_math"') && (ha.match(/<details class="dd">/g) || []).length === 6,
          'feature present: anchor + drill-down on all six rows (item iii/v, fixture + rows fallback)')
      ok(!(ha.replace(/href="#h-base_math"/g, 'href="#gone"')).includes('href="#h-base_math"'), 'mutant caught: log-anchor retargeted')
      ok(((ha.replaceAll('<details class="dd">', '')).match(/<details class="dd">/g) || []).length === 0, 'mutant caught: drill-down details removed (item iii)')
    }
}

console.log(`\nws2check: ${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
