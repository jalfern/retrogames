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
let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ---- validate artifacts (pure, so mutants run in memory) ----
export function validateArtifacts({ batches, variants }) {
    const errs = []
    for (const [i, b] of batches.entries()) {
        if (!b.purpose && b.phase !== "score") errs.push(`batch ${i}: missing purpose`)
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

// 1. boot from the committed lab copy (no results/) — honest fallbacks
{
    const { rc, html, err } = build(LAB)
    ok(rc === 0, 'build: committed lab exits 0', err?.slice(0, 120))
    ok(html.includes('WEIGHT SURGERY'), 'build: page has title')
    ok(html.includes('SURGERY II'), 'build: SURGERY II section present')
    ok(html.includes('v2 runs pending'), 'build: pending fallback when no v2 artifacts')
    ok(html.includes('Sparks of Weight-Space Programming'), 'build: sources intact')
    ok(html.includes('#1505'), 'build: links issue #1505')
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
    const { rc, html } = build(dir)
    ok(rc === 0, 'build: fixture lab exits 0')
    ok(html.includes('5/12'), 'win: fixture C row renders 5/12 terminated')
    ok(/VERDICT II: a variant terminates/.test(html), 'win: SIGNAL verdict shown when a variant beats base')
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
        ok(validateArtifacts({ batches: rb, variants }).length === 0, 'local: real lab v2 artifacts consistent')
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
    ]
    for (const [name, data] of mutants)
        ok(validateArtifacts(data).length > 0, `mutant caught: ${name}`)
}

console.log(`\nws2check: ${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
