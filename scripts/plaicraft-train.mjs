// PLAICRAFT TRAIN (#1625) — behaviour cloning on recorded Gauntlet play.
//
// Pure Node, zero dependencies, deterministic (mulberry32 for every draw):
// re-running this on the same dataset reproduces the shipped weights exactly.
//
// House method check: the repo already trains in-repo (learnedwalk (1+1)-ES
// #1205, SuperMario evoTrain #107). This is BC, so gradient descent fits —
// a tiny 22-24-24-5 MLP, sigmoid heads, weighted BCE, Adam. Hyperparameters
// are FIXED before the run (one training, no sweeps): the choice happens on
// practice-seed teacher-forcing numbers, and the model is scored EXACTLY ONCE
// on held-out seeds 100..107 in real gameplay (rollout) — the discipline
// #1567's weight surgery learned: choose on practice, score once.
//
// Labels: f = seat senses (model.js featurize); y = the four movement bits of
// the CPU's pad + the sustained swing-intent (`a` on the wire is a pulse; the
// seat rebuilds the pulse from intent, so the net learns intent, not phase).
//
// Weights are quantized to 4 decimals BEFORE scoring — the shipped file is
// exactly what was scored (the learnedwalk rule).
//
// Usage: node scripts/plaicraft-train.mjs [--dataset data/plaicraft/dataset.jsonl]
//        [--out src/games/Gauntlet/policy.js] [--epochs 24] [--seed 7]

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PRACTICE_SEEDS, HELDOUT_SEEDS, collectRun } from './plaicraft-export.mjs'

const args = process.argv.slice(2)
const opt = (name, dft) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dft }
const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const ARCH = [32, 24, 24, 5]
const LR = 3e-3
const BATCH = 256
const EPOCHS = +opt('--epochs', 24)
const SEED = +opt('--seed', 7)
const POS_W = +opt('--posw', 6) // swing intent is rare (~5% of ticks); unweighted, it collapses to never

const mulberry32 = (a) => () => {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// --- model ---------------------------------------------------------------------

function initParams(rng) {
    const w = [], b = []
    for (let l = 0; l < ARCH.length - 1; l++) {
        const ni = ARCH[l], no = ARCH[l + 1], lim = Math.sqrt(6 / (ni + no))
        for (let i = 0; i < ni * no; i++) w.push((rng() * 2 - 1) * lim)
        for (let j = 0; j < no; j++) b.push(0)
    }
    return { w, b }
}

const nParams = (p) => p.w.length
const sigmoid = (x) => 1 / (1 + Math.exp(Math.max(-35, Math.min(35, -x))))

// forward saving per-layer {a, z, off, ni, no} for the backward pass.
// Biases live in their own compact block (cumulative no), NOT at the weight
// block offset — indexing b by the w-offset reads undefined (the NaN this
// exact shape produced once).
function fwdPass(p, x, acts) {
    let off = 0, bOff = 0, a = x
    for (let l = 0; l < ARCH.length - 1; l++) {
        const ni = ARCH[l], no = ARCH[l + 1]
        const z = new Array(no)
        for (let j = 0; j < no; j++) {
            let s = p.b[bOff + j]
            for (let i = 0; i < ni; i++) s += p.w[off + j * ni + i] * a[i]
            z[j] = s
        }
        acts.push({ a, z, off, ni, no })
        const last = l === ARCH.length - 2
        a = z.map((s) => (last ? sigmoid(s) : Math.tanh(s)))
        off += ni * no
        bOff += no
    }
    return a
}

function trainBatch(p, xs, ys, m, v, t) {
    const dW = new Array(nParams(p)).fill(0)
    const dB = new Array(p.b.length).fill(0)
    for (let n = 0; n < xs.length; n++) {
        const acts = []
        const out = fwdPass(p, xs[n], acts)
        const y = ys[n]
        let delta = out.map((o, j) => (o - y[j]) * (y[j] ? POS_W : 1) / xs.length)
        for (let l = acts.length - 1; l >= 0; l--) {
            const { a, z, off, ni, no } = acts[l]
            for (let j = 0; j < no; j++) {
                dB[off + j] += delta[j]
                for (let i = 0; i < ni; i++) dW[off + j * ni + i] += delta[j] * a[i]
            }
            if (l === 0) break
            // dL/da through this layer's inputs (own block, stride ni), then
            // through the PREVIOUS layer's tanh' — its z produced the a feeding us.
            const cur = new Array(ni)
            const zp = acts[l - 1].z
            for (let i = 0; i < ni; i++) {
                let s = 0
                for (let j = 0; j < no; j++) s += p.w[off + j * ni + i] * delta[j]
                const th = Math.tanh(zp[i])
                cur[i] = s * (1 - th * th)
            }
            delta = cur
        }
    }
    adam(p, dW, dB, m, v, t)
}

function adam(p, dW, dB, m, v, t) {
    const b1 = 0.9, b2 = 0.999, eps = 1e-8
    const nw = p.w.length
    for (let i = 0; i < nw; i++) {
        m[i] = b1 * m[i] + (1 - b1) * dW[i]
        v[i] = b2 * v[i] + (1 - b2) * dW[i] * dW[i]
        p.w[i] -= LR * (m[i] / (1 - Math.pow(b1, t))) / (Math.sqrt(v[i] / (1 - Math.pow(b2, t))) + eps)
        if (!Number.isFinite(p.w[i])) { process.stderr.write(`NaN w[${i}] t=${t} dW=${dW[i]} m=${m[i]} v=${v[i]}\n`); i = nw }
    }
    for (let i = 0; i < p.b.length; i++) {
        const k = nw + i
        m[k] = b1 * m[k] + (1 - b1) * dB[i]
        v[k] = b2 * v[k] + (1 - b2) * dB[i] * dB[i]
        p.b[i] -= LR * (m[k] / (1 - Math.pow(b1, t))) / (Math.sqrt(v[k] / (1 - Math.pow(b2, t))) + eps)
    }
}

const q4 = (v) => +v.toFixed(4)

function evalSet(p, rows) {
    let mvMatch = 0, aMatch = 0, full = 0, n = 0, loss = 0
    const acts = []
    const DIRS = ['left', 'right', 'up', 'down']
    for (const r of rows) {
        acts.length = 0
        const o = fwdPass(p, r.f, acts)
        for (let j = 0; j < 4; j++) {
            const label = !!r.p[DIRS[j]]
            if ((o[j] > 0.5) === label) mvMatch++
            loss += -(label ? POS_W : 1) * (label * Math.log(Math.max(o[j], 1e-9)) + (1 - label) * Math.log(Math.max(1 - o[j], 1e-9)))
            if ((o[j] > 0.5) !== label) { /* pad miss */ }
        }
        if ((o[4] > 0.5) === !!r.a) aMatch++
        let allOK = true
        for (let j = 0; j < 4; j++) if ((o[j] > 0.5) !== !!r.p[DIRS[j]]) allOK = false
        if ((o[4] > 0.5) !== !!r.a) allOK = false
        if (allOK) full++
        loss += -(r.a ? POS_W : 1) * (r.a * Math.log(Math.max(o[4], 1e-9)) + (1 - r.a) * Math.log(Math.max(1 - o[4], 1e-9)))
        n++
    }
    return { rows: n, moveAcc: +(mvMatch / (n * 4)).toFixed(4), intentAcc: +(aMatch / n).toFixed(4), padAcc: +(full / n).toFixed(4), loss: +(loss / (n * 5)).toFixed(4) }
}

// --- main ----------------------------------------------------------------------

const DATASET = resolve(opt('--dataset', 'data/plaicraft/dataset.jsonl'))
const OUT = resolve(opt('--out', 'src/games/Gauntlet/policy.js'))

const rng = mulberry32(SEED)
const raw = readFileSync(DATASET, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const practice = raw.filter((r) => PRACTICE_SEEDS.includes(r.s))
const heldout = raw.filter((r) => HELDOUT_SEEDS.includes(r.s))
const ysOf = (r) => [r.p.left ? 1 : 0, r.p.right ? 1 : 0, r.p.up ? 1 : 0, r.p.down ? 1 : 0, r.a]

const p = initParams(rng)
const m = new Array(nParams(p) + p.b.length).fill(0)
const v = new Array(nParams(p) + p.b.length).fill(0)
let t = 0
const order = [...practice.keys()]
const curve = []
for (let e = 0; e < EPOCHS; e++) {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1));[order[i], order[j]] = [order[j], order[i]] }
    for (let b = 0; b < order.length; b += BATCH) {
        const idx = order.slice(b, b + BATCH)
        t++
        trainBatch(p, idx.map((i) => practice[i].f), idx.map((i) => ysOf(practice[i])), m, v, t)
    }
    if (e % 4 === 3 || e === EPOCHS - 1) curve.push({ epoch: e + 1, ...evalSet(p, practice.slice(0, 20000)) })
    process.stderr.write(`epoch ${e + 1}/${EPOCHS} ${JSON.stringify(curve[curve.length - 1] || {})}\n`)
}

// quantize, then score the SHIPPED numbers (learnedwalk rule)
const policy = {
    arch: ARCH,
    meta: {
        name: 'plaicraft-bc/v1', game: 'gauntlet', trained: new Date().toISOString().slice(0, 10),
        epochs: EPOCHS, seed: SEED, rows: practice.length, method: 'BC Adam BCE, fixed hparams',
        sources: { practice: 'seeds 0..11', heldout: 'seeds 100..107 (scored once, below)' },
    },
    w: p.w.map(q4), b: p.b.map(q4),
}
const quant = { arch: ARCH, w: policy.w, b: policy.b }
process.stderr.write(`weights non-finite: ${policy.w.filter((v) => !Number.isFinite(v)).length + policy.b.filter((v) => !Number.isFinite(v)).length}/${policy.w.length + policy.b.length}\n`)

const tfPractice = evalSet(quant, practice)
const tfHeldout = evalSet(quant, heldout)

// score once: the model seats in slot 2 of real games; the expert is the same
// game with the CPU seated. Same hero route, same seed — the ONLY difference
// on the board is who holds seat 2.
async function rollouts(seeds, quantPolicy) {
    const { createModelPolicy } = await import(pathToFileURL(resolve(root, 'src/games/Gauntlet/model.js')).href)
    const run = (seed, model) => collectRun(seed, {
        seat2: model ? createModelPolicy(quantPolicy) : null,
        seatKind: model ? 'model' : 'cpu',
        noRows: true,
        maxTicks: opt('--rollcap', 30000),
    }).stats
    const out = { cpu: [], model: [] }
    for (const s of seeds) { out.cpu.push(run(s, false)); out.model.push(run(s, true)) }
    return out
}

const agg = (list, k) => +(list.reduce((s, x) => s + x[k], 0) / list.length).toFixed(1)
const summarize = (g, seeds) => ({
    wins: { cpu: g.cpu.filter((x) => x.won).length, model: g.model.filter((x) => x.won).length, of: g.cpu.length },
    avgLevels: { cpu: agg(g.cpu, 'levels'), model: agg(g.model, 'levels') },
    avgScore: { cpu: agg(g.cpu, 'score'), model: agg(g.model, 'score') },
    avgKills: { cpu: agg(g.cpu, 'kills'), model: agg(g.model, 'kills') },
    partnerDeaths: { cpu: g.cpu.reduce((s, x) => s + x.partnerDeaths, 0), model: g.model.reduce((s, x) => s + x.partnerDeaths, 0) },
    goldByPartner: { cpu: agg(g.cpu, 'goldTaken'), model: agg(g.model, 'goldTaken') },
    perSeed: g.model.map((x, i) => ({ seed: seeds[i], cpuLevels: g.cpu[i].levels, cpuWon: !!g.cpu[i].won, modelLevels: x.levels, modelWon: !!x.won, modelVerified: x.verified })),
})

if (process.argv[1] && process.argv[1].endsWith('plaicraft-train.mjs')) {
    if (args.includes('--tune')) {
        // tuning NEVER touches held-out seeds and never ships artifacts:
        // practice rollouts only, short cap (issue discipline).
        const g = await rollouts(PRACTICE_SEEDS, quant)
        console.log(JSON.stringify({ posw: POS_W, epochs: EPOCHS, tf: evalSet(quant, practice), practice: summarize(g, PRACTICE_SEEDS) }, null, 1))
        process.exit(0)
    }
    const roll = {
        practice: summarize(await rollouts(PRACTICE_SEEDS, quant), PRACTICE_SEEDS),
        heldout: summarize(await rollouts(HELDOUT_SEEDS, quant), HELDOUT_SEEDS),
    }
    writeFileSync(OUT, '// PLAICRAFT policy weights (#1625) — GENERATED by scripts/plaicraft-train.mjs.\n'
        + '// Behaviour-cloning net trained on recorded Gauntlet play: see data/plaicraft/README.md\n'
        + '// and the write-up at /research. Do not edit by hand; regenerate: npm run plaicraft:train\n'
        + 'export const POLICY = ' + JSON.stringify(policy, null, 1) + '\n')
    const results = { meta: policy.meta, teacherForcing: { practice: tfPractice, heldout: tfHeldout }, curve, rollout: roll }
    writeFileSync(resolve(root, 'data/plaicraft/results.json'), JSON.stringify(results, null, 1) + '\n')
    console.log(JSON.stringify({ teacherForcing: { practice: tfPractice, heldout: tfHeldout }, rollout: roll.heldout }, null, 1))
}
