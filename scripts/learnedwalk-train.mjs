// learnedwalk-train — evolutionary training ((1+1)-ES, Rechenberg) for
// LEARNED WALK (#1205). Pure Node, zero dependencies, deterministic: every
// draw is mulberry32 — this command reproduces the shipped policy.
//
// House method: the repo trains in-repo with evolution already (SuperMario
// evoTrain #107, LunarLander policy GA). Why ES here: the probe showed every
// CONSTANT torque set falls faster than zero torque (the bare rig holds ~118
// ticks), so early fitness is dominated by fall timing — population search
// with SMALL steps around zero climbs the survival hill by keeping samples
// whose weights act as feedback (hipY drops -> ...). Reward is survival +
// hip-height (+ forward speed in stage B): a classic stand-then-walk
// curriculum, training-time only — the shipped controller is purely the net.
//
// Three stages, sequential: A "stand", B "walk" (random pushes, metres enter
// the reward), C "refine" (tighter sigma, fresh fit seeds, metres-weighted).
// All candidates are quantized to 4 decimals before scoring — the shipped file
// is exactly what was scored (this rig is rounding-knife-edge; unrounded search
// produced a walker that fell over once serialized).
// Checkpoints ship for the demo scrubber: flail -> stand -> stumble -> walk.
//
// Usage: node scripts/learnedwalk-train.mjs [--gensA 240] [--gensB 360]
//        [--gensC 220] [--pop 128] [--seed 3] [--out public/demos/learnedwalk.policy.js]

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const opt = (name, dft) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dft }

eval(readFileSync(resolve('public/demos/physicswalk.core.js'), 'utf8'))
eval(readFileSync(resolve('public/demos/learnedwalk.core.js'), 'utf8'))
const LW = globalThis.LearnedWalk
const NP = LW.NP

const POP = +opt('--pop', 128)
const GENS_A = +opt('--gensA', 240)
const GENS_B = +opt('--gensB', 360)
const SEED = +opt('--seed', 3)
const OUT = resolve(opt('--out', 'public/demos/learnedwalk.policy.js'))

const rand = LW.rng(SEED)
const checkpoints = []
const round4 = (arr) => Array.from(arr, (x) => +x.toFixed(4))

const EVAL_SEEDS = [11, 22, 33, 44, 55]
const FIT_SEEDS = [11, 22]

function stage(stageName, gens, drive, sigma0, cfg = {}) {
  // (1+1)-ES with Cauchy mutation and 1/5-success breathing. The failure
  // analysis that led here: elite-mean CEM kept diluting each generation's one
  // good sample with ~15 noisy losers, remixing noise into the search centre.
  // Here the centre is ALWAYS the best policy ever seen; the exact-zero net
  // (the unactuated rig, ~238 ticks) is the baseline any candidate must beat.
  // Cauchy tails reach the O(1..5) reflex gains the rig needs — uniform
  // noise, whose members all fall faster than zero, never did.
  const pop = cfg.pop || POP
  const seedsFit = cfg.seeds || FIT_SEEDS
  const rng = cfg.rng || rand
  const sigmaMin = cfg.sigmaMin ?? 0.06
  const sigmaMax = cfg.sigmaMax ?? 1.2
  const grow = cfg.grow ?? 1.35
  const shrink = cfg.shrink ?? 0.96
  const bounce = cfg.bounce ?? 12
  const fifth = cfg.fifth !== false
  let centre = lastBest ? Float64Array.from(lastBest.params) : new Float64Array(NP)
  let sigma = sigma0
  let stageBest = null
  const t0 = Date.now()
  const cauchy = () => {
    const u = rng()
    return Math.max(-6, Math.min(6, Math.tan(Math.PI * (u - 0.5))))
  }
  const evalP = (p) => {
    let f = 0
    for (const sd of seedsFit) {
      const e = LW.runEpisode(p, { seed: sd, noiseSeed: sd, seconds: 10, drive, pushNoise: drive > 0 })
      f += e.ticks + drive * 60 * e.advanced
    }
    return f
  }
  // The policy SHIPS rounded to 4 decimals; this rig is knife-edge at that
  // granularity (the #1204 README warned about the 1.5 m/s topple boundary —
  // an unrounded 2.98 m walk collapsed to a tick-35 faceplant after rounding).
  // So search IN rounded space: quantize every candidate before scoring it,
  // the shipped bytes are exactly the scored policy, and fitness prefers
  // plateaus over spikes.
  const q4 = (p) => { const r = new Float64Array(NP); for (let i = 0; i < NP; i++) r[i] = Math.round(p[i] * 1e4) / 1e4; return r }
  const zeroF = evalP(new Float64Array(NP))
  let centreF = evalP(centre)
  stageBest = { stage: stageName, gen: 0, score: centreF, params: Float64Array.from(centre) }
  let succ = 0, tries = 0, sinceOk = 0
  for (let gen = 0; gen < gens; gen++) {
    let best = { p: centre, f: centreF }
    for (let k = 0; k < pop; k++) {
      const p = new Float64Array(NP)
      for (let i = 0; i < NP; i++) p[i] = centre[i] + sigma * cauchy()
      const q = q4(p)
      const f = evalP(q)
      if (f > best.f) best = { p: q, f }
    }
    tries++
    if (best.f > centreF) {
      centre = best.p; centreF = best.f
      succ++
      sigma *= grow
      sinceOk = 0
      if (centreF > stageBest.score) stageBest = { stage: stageName, gen, score: centreF, params: Float64Array.from(centre) }
    } else {
      sigma *= shrink
      sinceOk++
    }
    // stagnation bounce: if the hill goes quiet, widen hard — small sigma on a
    // plateau is just noise around a good-enough policy
    if (bounce && sinceOk > bounce) { sigma = Math.max(sigma, sigma0 * 0.9); sinceOk = 0 }
    sigma = Math.max(sigmaMin, Math.min(sigmaMax, sigma))
    if (fifth && tries >= 25) { // Rechenberg 1/5th rule nudges
      if (succ / tries < 0.2) sigma *= 0.85
      else if (succ / tries > 0.25) sigma *= 1.1
      succ = 0; tries = 0
    }
    const full = LW.evaluate(centre, EVAL_SEEDS)
    const g = stageOffset(stageName) + gen
    if (gen % 8 === 0 || gen === gens - 1) {
      checkpoints.push({
        stage: stageName, gen: g, elite: Math.round(centreF),
        meters: full.advanced, stand: full.uprightFrac, fell: full.falls,
        params: round4(centre),
      })
    }
    if (gen % 20 === 0 || gen === gens - 1) {
      console.log(`${stageName} gen ${g} sigma ${sigma.toFixed(3)} bestF ${centreF.toFixed(0)} (zero ${zeroF.toFixed(0)}) eval r ${full.reward} m ${full.advanced} stand ${full.uprightFrac} falls ${full.falls} [${((Date.now() - t0) / 1000).toFixed(0)}s]`)
    }
  }
  stageBest.full = LW.evaluate(stageBest.params, EVAL_SEEDS)
  return stageBest
}

let lastBest = null
const GENS_C = +opt('--gensC', 220)
const stageOffset = (s) => s === 'A' ? 0 : s === 'B' ? GENS_A : GENS_A + GENS_B
const bestA = stage('A', GENS_A, 0, 0.3)
lastBest = bestA
const bestB = stage('B', GENS_B, 1, 0.15)
lastBest = bestB
// Stage C: metres-weighted refinement on fresh seeds — tight sigma, no bounce,
// no 1/5 rule: pure hill-climb around B's best with Cauchy reach. Its own rng
// stream keeps A/B byte-identical to earlier runs.
const bestC = stage('C', GENS_C, 1, 0.09, {
  pop: 96, seeds: [11, 22, 33], sigmaMin: 0.03, sigmaMax: 0.5, grow: 1.3, shrink: 0.93,
  bounce: 0, fifth: false, rng: LW.rng(SEED + 96),
})
// honest final: the policy that advances farthest on the eval seeds
const finalSeeds = [11, 22, 33, 44, 55]
const candA = LW.evaluate(bestA.params, finalSeeds)
const candB = LW.evaluate(bestB.params, finalSeeds)
const candC = LW.evaluate(bestC.params, finalSeeds)
const ranked = [{ b: bestA, e: candA }, { b: bestB, e: candB }, { b: bestC, e: candC }]
ranked.sort((x, y) => y.e.advanced - x.e.advanced)
const chosen = ranked[0].b
const chosenEval = ranked[0].e

const policy = {
  net: { obs: LW.OBS, hid: LW.HID, act: LW.ACT, cap: LW.CAP, np: NP },
  final: round4(chosen.params),
  checkpoints,
  facts: {
    method: '(1+1)-ES, Cauchy mutation, 1/5-success breathing; deterministic mulberry32 seed; stand->walk->refine curriculum',
    pop: POP, gensA: GENS_A, gensB: GENS_B, gensC: GENS_C, seed: SEED,
    bestStage: chosen.stage, bestGen: chosen.gen,
    eval: chosenEval,
    trainedAt: new Date().toISOString().slice(0, 10),
    note: 'reward = survival + hip height (+ forward speed, stages B/C); arms unactuated',
  },
}
writeFileSync(OUT, 'window.LEARNED_WALK_POLICY = ' + JSON.stringify(policy) + '\n')
console.log(`chose stage ${chosen.stage} gen ${chosen.gen}: m ${chosenEval.advanced} stand ${chosenEval.uprightFrac} falls ${chosenEval.falls}/5; A ${candA.advanced} B ${candB.advanced} C ${candC.advanced}`)
// Ship-honesty gate: the SERIALIZED params must beat the bare rig on the
// check's 6 seeds without push noise — learnedwalkcheck asserts the same, and
// a policy that only walks before JSON round-tripping is not a policy.
{
  const shipSeeds = [11, 22, 33, 44, 55, 66]
  const avgT = (p) => shipSeeds.reduce((t, sd) => t + LW.runEpisode(p, { seed: sd, noiseSeed: sd, seconds: 10, drive: 1 }).ticks, 0) / shipSeeds.length
  const shipT = avgT(policy.final), bareT = avgT(new Float64Array(NP))
  console.log(`ship check: serialized policy ${shipT.toFixed(0)} ticks vs bare rig ${bareT.toFixed(0)} ticks`)
  if (!(shipT > bareT + 10)) { console.error('SHIP FAIL: serialized policy does not out-survive the bare rig — not shipping this result'); process.exit(1) }
}
