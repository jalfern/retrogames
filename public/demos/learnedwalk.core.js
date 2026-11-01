// learnedwalk.core.js — LEARNED WALK (#1205): the PHYSICS WALK rig with the
// hand-written balance controller REPLACED by a trained neural-network policy.
//
// Same body, same physics: this file requires physicswalk.core.js (#1204) and
// loads it unchanged — same 18-mass XPBD rig, same penalty-ground contact with
// Coulomb friction, same virtual-work joint torques, same fall detection. The
// only difference: every 1/60 s the policy MLP reads honest proprioception
// (pitch, support margin, contact flags, limb positions/velocities relative to
// the hip, previous action) and writes the six leg torques through the engine's
// `sim.extra` slot. No hand-written balance term runs at play time; the constant
// lean force is 0 — propulsion, balance and step timing all come from the net.
// Arms get zero torque: honest passive pendulums.
//
// Training (scripts/learnedwalk-train.mjs, CEM) shares this file: obs/act/step
// is one source of truth for Node and browser. The trained weights and every
// generation checkpoint ship in learnedwalk.policy.js.
//
// Coordinates/units inherited from physicswalk.core.js: x forward, y up,
// metres, kg, N·m.

(function (global) {
  'use strict'

  const PW = global.PhysicsWalk
  if (!PW) throw new Error('learnedwalk.core.js requires physicswalk.core.js (load it first)')

  // deterministic RNG: mulberry32 — training and eval are reproducible
  function rng(seed) {
    let s = seed >>> 0
    return () => {
      s = (s + 0x6D2B79F5) >>> 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x

  // MLP 23 -> 16 -> 16 -> 3 (tanh), mirrored to both legs. Symmetric action
  // sharing is standard in bipedal RL (and it is what makes the Stanford
  // "dynamical walking" experiments step at all): identical torques, but the
  // legs' states differ, so one foot leaves the ground first and an alternating
  // gait emerges from the dynamics instead of being scripted.
  const OBS = 23, HID = 16, ACT = 3
  const P1 = HID * OBS, B1 = HID
  const P2 = HID * HID, B2 = HID
  const P3 = ACT * HID, B3 = ACT
  const NP = P1 + B1 + P2 + B2 + P3 + B3
  const CAP = 140 // N·m per leg motor (engine caps at 160; leave headroom)

  // observation layout (fixed scales keep every input O(1)):
  //  0 pitch phi            1 phiD*0.5          2 support margin*2
  //  3 (hipY-0.955)*4      4 comVx*2           5 comVy*2
  //  6..9 heel/toe contact flags L,R
  //  10..13 left ankle dx*4, dy(-0.875)*4, dvx*2, dvy*2 (rel. hip)
  //  14..17 right ankle, same pattern
  //  18 lKnee dx*4         19 rKnee dx*4
  //  20..22 previous action (three mirrored torques, net units)
  function obsInto(sim, prev, out) {
    const p = sim.p, v = sim.v
    const hipX = p[0 * 2], hipY = p[0 * 2 + 1]
    out[0] = clamp(sim.phi, -2, 2)
    out[1] = clamp(sim.phiD * 0.5, -2, 2)
    out[2] = clamp(sim.margin * 2, -2, 2)
    out[3] = clamp((hipY - 0.955) * 4, -2, 2)
    out[4] = clamp(sim.comV[0] * 2, -2, 2)
    out[5] = clamp(sim.comV[1] * 2, -2, 2)
    out[6] = p[6 * 2 + 1] < PW.CONTACT_H ? 1 : 0
    out[7] = p[7 * 2 + 1] < PW.CONTACT_H ? 1 : 0
    out[8] = p[10 * 2 + 1] < PW.CONTACT_H ? 1 : 0
    out[9] = p[11 * 2 + 1] < PW.CONTACT_H ? 1 : 0
    out[10] = clamp((p[5 * 2] - hipX) * 4, -2, 2)
    out[11] = clamp((p[5 * 2 + 1] - hipY + 0.875) * 4, -2, 2)
    out[12] = clamp((v[5 * 2] - v[0 * 2]) * 2, -2, 2)
    out[13] = clamp((v[5 * 2 + 1] - v[0 * 2 + 1]) * 2, -2, 2)
    out[14] = clamp((p[9 * 2] - hipX) * 4, -2, 2)
    out[15] = clamp((p[9 * 2 + 1] - hipY + 0.875) * 4, -2, 2)
    out[16] = clamp((v[9 * 2] - v[0 * 2]) * 2, -2, 2)
    out[17] = clamp((v[9 * 2 + 1] - v[0 * 2 + 1]) * 2, -2, 2)
    out[18] = clamp((p[4 * 2] - hipX) * 4, -2, 2)
    out[19] = clamp((p[8 * 2] - hipX) * 4, -2, 2)
    for (let i = 0; i < ACT; i++) out[20 + i] = clamp(prev[i], -2, 2)
  }

  function forward(pp, obs, out) {
    let o = 0
    const h1 = forward.h1 || (forward.h1 = new Float64Array(HID))
    const h2 = forward.h2 || (forward.h2 = new Float64Array(HID))
    for (let i = 0; i < HID; i++) {
      let s = pp[P1 + i]
      const base = i * OBS
      for (let j = 0; j < OBS; j++) s += pp[base + j] * obs[j]
      h1[i] = Math.tanh(s)
    }
    for (let i = 0; i < HID; i++) {
      let s = pp[P1 + B1 + P2 + i]
      const base = P1 + B1 + i * HID
      for (let j = 0; j < HID; j++) s += pp[base + j] * h1[j]
      h2[i] = Math.tanh(s)
    }
    const ob = P1 + B1 + P2 + B2
    for (let i = 0; i < ACT; i++) {
      let s = pp[ob + P3 + i]
      const base = ob + i * HID
      for (let j = 0; j < HID; j++) s += pp[base + j] * h2[j]
      out[i] = Math.tanh(s)
      o++
    }
    return o
  }

  function torquesOf(a) {
    return {
      hipL: a[0] * CAP, kneeL: a[1] * CAP, ankleL: a[2] * CAP,
      hipR: a[0] * CAP, kneeR: a[1] * CAP, ankleR: a[2] * CAP,
      shL: 0, shR: 0, elL: 0, elR: 0,
    }
  }

  // a learned walker = a PHYSICS WALK sim with zero autopilot lean + policy
  function create(params, opts) {
    opts = opts || {}
    const sim = PW.create({ x: opts.x || 0, seed: opts.seed || 1 })
    sim.tuning.force = 0 // NO scripted propulsion — the net drives him
    return {
      sim, pp: Float64Array.from(params),
      obs: new Float64Array(OBS), act: new Float64Array(ACT), prev: new Float64Array(ACT),
      tick: 0,
    }
  }

  function reset(lw) {
    PW.reset(lw.sim)
    lw.sim.tuning.force = 0
    lw.prev.fill(0)
    lw.tick = 0
    return lw
  }

  // one frame at policy rate; physics substeps inside PW.step.
  // A fallen figure's motors CUT — same ragdoll honesty as PHYSICS WALK.
  function step(lw, dt) {
    if (lw.sim.mode !== 'fallen') {
      obsInto(lw.sim, lw.prev, lw.obs)
      forward(lw.pp, lw.obs, lw.act)
      lw.prev.set(lw.act)
      lw.sim.extra = torquesOf(lw.act)
    } else {
      lw.sim.extra = torquesOf(lw.act.fill(0))
      lw.prev.fill(0)
    }
    PW.step(lw.sim, dt)
    lw.tick++
    return lw
  }

  /* ---------------- evaluation (shared: CEM fitness = harness metric) ------- */

  const dt = 1 / 60

  // reward per tick, SURVIVAL-LED (the probe showed this is the learnable
  // hill: the bare rig lasts ~118 ticks, and a net that outlasts it has found
  // real balance feedback). Then height + support, and in stage B upright
  // forward speed. Effort/chatter penalties are light so they never drown the
  // survival gradient (the first reward draft did exactly that). Pushes are
  // scripted DISTURBANCES (the demo's taps), part of the sim, not the control.
  function runEpisode(params, opts) {
    opts = opts || {}
    const secs = opts.seconds === undefined ? 10 : opts.seconds
    const n = Math.round(secs / dt)
    const drive = opts.drive === undefined ? 1 : opts.drive
    const lw = create(params, { seed: opts.seed || 1 })
    const rand = rng(opts.noiseSeed === undefined ? (opts.seed || 1) : opts.noiseSeed)
    const pushes = opts.pushes || null // [{at,v}] or null to sample moderate taps
    let r = 0, uprightTicks = 0, minHipY = 9, maxSpeed = 0
    for (let i = 0; i < n; i++) {
      const t = i * dt
      if (pushes) {
        for (const q of pushes) if (q.done !== 1 && t >= q.at) { q.done = 1; PW.push(lw.sim, q.v, 0) }
      } else if (opts.pushNoise && i > 240 && rand() < 0.0012) {
        PW.push(lw.sim, 0.5 + rand() * 0.7, 0)
      }
      step(lw, dt)
      const s = lw.sim
      const up = s.p[2 * 2 + 1] > 1.0 ? clamp(1 - Math.abs(s.phi) / 0.7, 0, 1) : 0
      r += 1.0                                             // survive (dominant)
      r += 0.10 * clamp((s.p[0 * 2 + 1] - 0.45) / 0.5, 0, 1) // stay tall
      r += 0.05 * clamp((s.margin + 0.02) / 0.12, 0, 1)      // keep CoM over support
      if (drive) r += 0.5 * up * Math.max(0, s.comV[0])      // go forward (stage B)
      let e2 = 0, chat = 0
      for (let k = 0; k < ACT; k++) { e2 += lw.act[k] * lw.act[k]; chat += Math.abs(lw.act[k] - lw.prev[k]) }
      r -= 1e-5 * e2
      r -= 2e-4 * chat
      if (up > 0.5) uprightTicks++
      minHipY = Math.min(minHipY, s.p[0 * 2 + 1])
      maxSpeed = Math.max(maxSpeed, up > 0.5 ? s.comV[0] : 0)
      if (s.mode === 'fallen') { r -= 15; break }
    }
    return {
      reward: r,
      advanced: +(lw.sim.com[0] - lw.sim.x0).toFixed(3),
      uprightFrac: +(uprightTicks / Math.max(1, lw.tick)).toFixed(3),
      fell: lw.sim.mode === 'fallen',
      ticks: lw.tick,
      minHipY: +minHipY.toFixed(3),
      maxSpeed: +maxSpeed.toFixed(3),
    }
  }

  // honest multi-seed score: same policy, 6 seeds (fixed push schedule per
  // seed); mean reward + metres are what the harness gates on.
  function evaluate(params, seeds) {
    seeds = seeds || [11, 22, 33, 44, 55, 66]
    let r = 0, adv = 0, up = 0, fell = 0, tk = 0
    for (const sd of seeds) {
      const e = runEpisode(params, { seed: sd, noiseSeed: sd })
      r += e.reward; adv += e.advanced; up += e.uprightFrac
      tk += e.ticks
      if (e.fell) fell++
    }
    const k = seeds.length
    return {
      reward: +(r / k).toFixed(3),
      advanced: +(adv / k).toFixed(3),
      uprightFrac: +(up / k).toFixed(3),
      ticksSum: tk,
      falls: fell,
    }
  }

  /* ---- inline Plaicraft episode recorder (#1141 format: retrogames-rec/v1
     + optional episode block; src/utils/robot/episode.js's validateEpisode
     accepts these files. Demos are dependency-free, so the codec is mirrored
     here and exercised by learnedwalkcheck). ---- */
  const P_NAMES = PW.P_NAMES
  function fnv(s) {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
    return h
  }
  function stateHash(sim) {
    let s = ''
    for (let i = 0; i < PW.N; i++) s += Math.round(sim.p[i * 2] * 1000) + ',' + Math.round(sim.p[i * 2 + 1] * 1000) + ';'
    return fnv(s)
  }
  function makeEpisode(seed) {
    let ticks = 0
    const hashes = [], poses = [], raws = [], methods = []
    return {
      tick(sim, raw) {
        ticks++
        if (raw) { raws[ticks - 1] = raw; if (!methods.includes('pointer')) methods.push('pointer') }
        if (ticks % 6 === 0) {
          hashes.push({ t: ticks, h: stateHash(sim) })
          const o = {}
          for (let i = 0; i < PW.N; i++) o[P_NAMES[i]] = { p: [+sim.p[i * 2].toFixed(4), +sim.p[i * 2 + 1].toFixed(4), 0], q: [0, 0, 0, 1] }
          poses.push({ t: ticks, o })
        }
      },
      finish(sim, success, score) {
        if (!hashes.length || hashes[hashes.length - 1].t !== ticks) hashes.push({ t: ticks, h: stateHash(sim) })
        const file = {
          format: 'retrogames-rec/v1',
          build: 'unknown',
          game: 'learnedwalk',
          method: 'pointer',
          seed,
          players: 1,
          ticks,
          hashEvery: 6,
          slots: [{ source: { kind: 'model' }, pads: Array.from({ length: ticks }, () => ({})), raw: Array.from({ length: ticks }, (_, i) => raws[i] || {}) }],
          hashes,
        }
        file.episode = {
          task: 'learned-walk',
          success: !!success,
          score: +score.toFixed(3),
          poseEvery: 6,
          poseCount: poses.length,
          poses,
          methodsUsed: methods.length ? methods : ['pointer'],
          assets: 'physicswalk.core.js/v1 (XPBD biped #1204) + trained policy #1205',
        }
        return file
      },
    }
  }

  global.LearnedWalk = {
    PW, OBS, HID, ACT, NP, CAP,
    rng, clamp, obsInto, forward, torquesOf, create, reset, step, runEpisode, evaluate,
    stateHash, makeEpisode,
  }
})(typeof window !== 'undefined' ? window : globalThis)
