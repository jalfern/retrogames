// learnedwalk-train — evolutionary training (CEM, cross-entropy method) for
// LEARNED WALK (#1205). Pure Node, zero dependencies, deterministic: every
// draw is mulberry32 — this command reproduces the shipped policy.
//
// House method: the repo trains in-repo with evolution already (SuperMario
// evoTrain #107, LunarLander policy GA). Why CEM here: the probe showed every
// CONSTANT torque set falls faster than zero torque (the bare rig holds ~118
// ticks), so early fitness is dominated by fall timing — population search
// with SMALL steps around zero climbs the survival hill by keeping samples
// whose weights act as feedback (hipY drops -> ...). Reward is survival +
// hip-height (+ forward speed in stage B): a classic stand-then-walk
// curriculum, training-time only — the shipped controller is purely the net.
//
// Two stages, sequential: A "stand" then B "walk" (re-seeded around A's mean,
// smaller sigma). Checkpoints ship for the demo scrubber: flail -> stand ->
// stumble -> walk.
//
// Usage: node scripts/learnedwalk-train.mjs [--gensA 260] [--gensB 380]
//        [--pop 192] [--elite 24] [--seed 7] [--out public/demos/learnedwalk.policy.js]

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

function stage(stageName, gens, drive, sigma0) {
  // (1+1)-ES with Cauchy mutation and 1/5-success breathing. The failure
  // analysis that led here: elite-mean CEM kept diluting each generation's one
  // good sample with ~15 noisy losers, remixing noise into the search centre.
  // Here the centre is ALWAYS the best policy ever seen; the exact-zero net
  // (the unactuated rig, ~238 ticks) is the baseline any candidate must beat.
  // Cauchy tails reach the O(1..5) reflex gains the rig needs — uniform
  // noise, whose members all fall faster than zero, never did.
  let centre = lastBest ? Float64Array.from(lastBest.params) : new Float64Array(NP)
  let sigma = sigma0
  let stageBest = null
  const t0 = Date.now()
  const cauchy = () => {
    const u = rand()
    return Math.max(-6, Math.min(6, Math.tan(Math.PI * (u - 0.5))))
  }
  const evalP = (p) => {
    let f = 0
    for (const sd of FIT_SEEDS) {
      const e = LW.runEpisode(p, { seed: sd, noiseSeed: sd, seconds: 10, drive, pushNoise: stageName === 'B' })
      f += e.ticks + drive * 60 * e.advanced
    }
    return f
  }
  const zeroF = evalP(new Float64Array(NP))
  let centreF = evalP(centre)
  stageBest = { stage: stageName, gen: 0, score: centreF, params: Float64Array.from(centre) }
  let succ = 0, tries = 0, sinceOk = 0
  for (let gen = 0; gen < gens; gen++) {
    let best = { p: centre, f: centreF }
    for (let k = 0; k < POP; k++) {
      const p = new Float64Array(NP)
      for (let i = 0; i < NP; i++) p[i] = centre[i] + sigma * cauchy()
      const f = evalP(p)
      if (f > best.f) best = { p, f }
    }
    tries++
    if (best.f > centreF) {
      centre = best.p; centreF = best.f
      succ++
      sigma *= 1.35
      sinceOk = 0
      if (centreF > stageBest.score) stageBest = { stage: stageName, gen, score: centreF, params: Float64Array.from(centre) }
    } else {
      sigma *= 0.96
      sinceOk++
    }
    // stagnation bounce: if the hill goes quiet, widen hard — small sigma on a
    // plateau is just noise around a good-enough policy
    if (sinceOk > 12) { sigma = Math.max(sigma, sigma0 * 0.9); sinceOk = 0 }
    sigma = Math.max(0.06, Math.min(1.2, sigma))
    if (tries >= 25) { // Rechenberg 1/5th rule nudges
      if (succ / tries < 0.2) sigma *= 0.85
      else if (succ / tries > 0.25) sigma *= 1.1
      succ = 0; tries = 0
    }
    const full = LW.evaluate(centre, EVAL_SEEDS)
    const g = stageName === 'A' ? gen : GENS_A + gen
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
const bestA = stage('A', GENS_A, 0, 0.3)
lastBest = bestA
const bestB = stage('B', GENS_B, 1, 0.15)
// honest final: the policy that scores best on the walking eval
const finalSeeds = [11, 22, 33, 44, 55]
const candB = LW.evaluate(bestB.params, finalSeeds)
const candA = LW.evaluate(bestA.params, finalSeeds)
const chosen = candB.advanced >= candA.advanced ? bestB : bestA
const chosenEval = chosen === bestB ? candB : candA

const policy = {
  net: { obs: LW.OBS, hid: LW.HID, act: LW.ACT, cap: LW.CAP, np: NP },
  final: round4(chosen.params),
  checkpoints,
  facts: {
    method: '(1+1)-ES, Cauchy mutation, 1/5-success breathing; deterministic mulberry32 seed; stand->walk curriculum',
    pop: POP, gensA: GENS_A, gensB: GENS_B, seed: SEED,
    bestStage: chosen.stage, bestGen: chosen.gen,
    eval: chosenEval,
    trainedAt: new Date().toISOString().slice(0, 10),
    note: 'reward = survival + hip height (+ forward speed, stage B); arms unactuated',
  },
}
writeFileSync(OUT, 'window.LEARNED_WALK_POLICY = ' + JSON.stringify(policy) + '\n')
console.log(`chose stage ${chosen.stage} gen ${chosen.gen}: r ${candB.reward} m ${candB.advanced} stand ${candB.uprightFrac} falls ${candB.falls}/5; alsoB ${candB.advanced} alsoA ${candA.advanced}`)
