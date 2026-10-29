// physicswalk.core.js — real planar rigid-body dynamics for PHYSICS WALK (#1204),
// headless-safe (Node + browser). The physics is honest:
//   - an XPBD particle rig: 18 point masses joined by stiff distance constraints
//     (bones + torso/foot braces + pinned shoulders) integrated with gravity at a
//     fixed substep;
//   - hip/knee/ankle motors are bend torques applied by virtual work — forces,
//     not pose writes. Arms are gait-coupled pendulums: the shoulder torque
//     reaches the hand opposite the same-side foot's travel, still pure torque.
//     The only kinematic operation in the sim is the ground
//     itself (impenetrable floor); feet never teleport.
//   - balance is a real inverted-pendulum problem: torso-pitch PD + ankle push
//     + step placement under the centre of mass. Stance foot slip is bounded by
//     Coulomb friction (mu * normal impulse), not zeroed by construction.
//   - taps push the torso with an impulse; a big enough push topples it and the
//     motors go dead: a true ragdoll.
//
// Coordinates: x forward (walking direction), y up, metres, mass kg.

(function (global) {
  'use strict'

  const G = 9.81
  const H = 1 / 480            // physics substep
  const ITER = 10              // constraint iterations per substep
  const CONTACT_H = 0.028      // particle height counted as ground contact

  // rig: particle order — 0 H hip, 1 CH chest, 2 HD head, 3 BK back brace,
  // legs L(4..7) R(8..11): knee, ankle, heel, toe; arms L(12..14) R(15..17):
  // shoulder, elbow, hand
  const P_NAMES = ['hip', 'chest', 'head', 'back',
    'lKnee', 'lAnkle', 'lHeel', 'lToe',
    'rKnee', 'rAnkle', 'rHeel', 'rToe',
    'lSho', 'lElb', 'lHand', 'rSho', 'rElb', 'rHand']
  const M = [12, 10, 4.5, 6, 3, 1.6, 0.8, 0.9, 3, 1.6, 0.8, 0.9,
    0.9, 0.6, 0.8, 0.9, 0.6, 0.8]
  const N = M.length

  // legs: particle index bases (knee, ankle, heel, toe)
  const LEGS = [{ k: 4, a: 5, h: 6, t: 7, side: 1 }, { k: 8, a: 9, h: 10, t: 11, side: -1 }]
  const HIP_L = [4, 5], HIP_R = [8, 9]
  // arms: shoulder pinned to chest+back brace, elbow, hand (pendulum segments)
  const ARMS = [{ s: 12, e: 13, h: 14, side: 1 }, { s: 15, e: 16, h: 17, side: -1 }]

  // rest pose (metres) — upright, both feet flat, slight knee softness
  const REST = [
    [0.000, 0.950], [0.015, 1.250], [0.030, 1.470], [-0.100, 1.130],
    [0.020, 0.500], [0.000, 0.075], [-0.085, 0.010], [0.170, 0.015],
    [0.020, 0.500], [0.000, 0.075], [-0.085, 0.010], [0.170, 0.015],
    [0.012, 1.210], [0.004, 0.980], [-0.004, 0.760], [0.012, 1.210],
    [0.004, 0.980], [-0.004, 0.760],
  ]

  // distance constraints [i, j, rest, compliance]
  const BONES = []
  function bone(i, j, comp) {
    const dx = REST[i][0] - REST[j][0], dy = REST[i][1] - REST[j][1]
    BONES.push([i, j, Math.hypot(dx, dy), comp === undefined ? 0 : comp])
  }
  bone(0, 1); bone(1, 2); bone(0, 3); bone(3, 1); bone(3, 2)   // torso + brace
  for (const L of LEGS) {
    bone(0, L.k, 2e-6); bone(L.k, L.a, 2e-6)                    // thigh, shin
    bone(L.a, L.h); bone(L.a, L.t); bone(L.h, L.t)               // rigid foot
  }
  for (const A of ARMS) {
    bone(1, A.s); bone(3, A.s, 2e-6)                             // shoulder pinned
    bone(A.s, A.e, 2e-6); bone(A.e, A.h, 2e-6)                  // upper arm, forearm
  }

  const clamp = (x, a, b) => x < a ? a : x > b ? b : x
  const perp = (ux, uy) => [-uy, ux]

  function create(opts) {
    opts = opts || {}
    const p = new Float64Array(N * 2)
    const v = new Float64Array(N * 2)
    for (let i = 0; i < N; i++) {
      p[i * 2] = REST[i][0] + (opts.x || 0)
      p[i * 2 + 1] = REST[i][1]
    }
    return {
      t: 0, x0: opts.x || 0, forceT: 0,
      p, v,
      grfContact: new Float64Array(N),
      mode: 'stand',                 // stand | push | fallen
      fallenFor: 0,
      steps: 0, lastStepLeg: -1, lastStepT: -1,
      legs: LEGS.map(L => ({ k: L.k, a: L.a, h: L.h, t: L.t, side: L.side, swing: false, swingT: 0, planted: true })),
      arms: ARMS.map(A => ({ s: A.s, e: A.e, h: A.h, side: A.side })),
      events: { stepL: 0, stepR: 0, fall: 0, landL: 0, landR: 0 },
      grf: [0, 0, 0, 0],           // |normal impulse| per foot point per frame
      slipSlide: 0,                // max stance-point sliding speed this frame
      com: [0, 0], comV: [0, 0],
      phi: 0, phiD: 0, margin: 0, support: null,
      tuning: Object.assign({
        sBal: -1, sHip: 1, sKnee: 1, sAnk: 1,
        kp: 704.4, kd: 211.2,        // torso-pitch balance (N·m per rad / rad·s⁻¹)
        kThigh: 368.5, dThigh: 147.9, // thigh vertical hold in stance
        kK: 475.5, dK: 92.1,         // knee: stacked over ankle in stance, flex in swing
        kA: 211.1, dA: 4.01,         // ankle: flat foot hold
        kLift: 577.3, dLift: 27.9,   // hip-height reflex (stand taller = push floor)
        kSw: 571.9, dSw: 86.2,      // swing: reach foot ahead of CoM
        push: 22.7,                  // push-off N·m when CoM nears toe edge
        mu: 0.678,                   // shoe-on-floor friction coefficient
        force: 24,                   // constant torso push (N) — lean / autopilot
        stepTh: 0.052,               // support margin (m) that triggers a step
        catchLead: 0.108,            // swing reaches this far ahead of CoM
        trailTh: 0.136,              // foot this far behind CoM gets lifted and swung
        kArm: 36.42969482294447, dArm: 4.866482090467382, // shoulder: hand target from opposite-leg phase
        sArm: 1,                     // shoulder sign multiplier (searched)
        kElb: 7.137600602869544, dElb: 1.8739646355098905, // elbow: soft hang, slight trailing flex
        armG: 0.9149777887072866, armAmp: 0.154988867306875, // contralateral gain + reach clamp (m)
      }, opts.tuning || {}),
      seed: opts.seed || 1,
      deterministicJitter: 0,
    }
  }

  // torque tau about joint J acting on the angle between rays J->P0, J->P1,
  // by virtual work with translation invariance (force on J closes the couple,
  // so the pair conserves linear momentum — pure torque, no momentum pumping):
  //   F(P0) = -tau * perp(u0)/r0 ; F(P1) = +tau * perp(u1)/r1 ; F(J) = -F0-F1
  function jointTorque(sim, f, p0, j, p1, tau) {
    const jx = sim.p[j * 2], jy = sim.p[j * 2 + 1]
    let ax = sim.p[p0 * 2] - jx, ay = sim.p[p0 * 2 + 1] - jy
    let bx = sim.p[p1 * 2] - jx, by = sim.p[p1 * 2 + 1] - jy
    const ra = Math.hypot(ax, ay) || 1e-6, rb = Math.hypot(bx, by) || 1e-6
    ax /= ra; ay /= ra; bx /= rb; by /= rb
    const pa = perp(ax, ay), pb = perp(bx, by)
    const f0x = -tau * pa[0] / ra, f0y = -tau * pa[1] / ra
    const f1x = tau * pb[0] / rb, f1y = tau * pb[1] / rb
    f[p0 * 2] += f0x; f[p0 * 2 + 1] += f0y
    f[p1 * 2] += f1x; f[p1 * 2 + 1] += f1y
    f[j * 2] -= f0x + f1x; f[j * 2 + 1] -= f0y + f1y
  }

  function comOf(sim) {
    let sx = 0, sy = 0, st = 0, vx = 0, vy = 0
    for (let i = 0; i < N; i++) {
      st += M[i]
      sx += M[i] * sim.p[i * 2]; sy += M[i] * sim.p[i * 2 + 1]
      vx += M[i] * sim.v[i * 2]; vy += M[i] * sim.v[i * 2 + 1]
    }
    sim.com = [sx / st, sy / st]
    sim.comV = [vx / st, vy / st]
  }

  function feetContact(sim) {
    const out = []
    for (let fi = 0; fi < 2; fi++) {
      const L = sim.legs[fi]
      const hC = sim.p[L.h * 2 + 1] < CONTACT_H
      const tC = sim.p[L.t * 2 + 1] < CONTACT_H
      out.push({ leg: fi, heel: hC, toe: tC, contact: hC || tC })
    }
    return out
  }

  // one physics substep with given motor torques {hipL,hipR,kneeL,...,ankleL,...}
  function substep(sim, dt, torques) {
    const f = new Float64Array(N * 2)
    // gravity + external lean force on the torso (ramped in from the calm stand
    // so the balance controller isn't blindsided at t=0)
    const lean = sim.tuning.force * Math.min(1, sim.forceT / 1.4)
    for (let i = 0; i < N; i++) f[i * 2 + 1] -= M[i] * G
    f[1 * 2] += lean
    f[2 * 2] += lean * 0.4
    sim.forceT += dt

    // penalty ground contact: normal spring-damper gives a true per-point
    // normal force (so the heel can unload while the toe loads — the foot
    // rolls); Coulomb friction is then bounded by mu * that normal force.
    const kG = 120000, cG = 1400, mu = sim.tuning.mu
    for (let i = 0; i < N; i++) {
      const pen = -sim.p[i * 2 + 1]
      if (pen > 0) {
        const fn = kG * pen - cG * sim.v[i * 2 + 1]
        if (fn > 0) {
          f[i * 2 + 1] += fn
          const vt = sim.v[i * 2]
          const maxF = mu * fn
          f[i * 2] += -clamp(vt * M[i] * 140, -maxF, maxF)
          sim.grfContact[i] = fn
        } else {
          sim.grfContact[i] = 0
        }
      } else {
        sim.grfContact[i] = 0
      }
    }

    // motors (N·m) via virtual work, saturated like real actuators
    if (sim.extra) torques = sim.extra
    if (torques) {
      const cap = (x) => clamp(x, -160, 160)
      const hipL = cap(torques.hipL), hipR = cap(torques.hipR)
      const kneeL = cap(torques.kneeL), kneeR = cap(torques.kneeR)
      const ankleL = cap(torques.ankleL), ankleR = cap(torques.ankleR)
      const capA = (x) => clamp(x, -45, 45)
      const shL = capA(torques.shL || 0), shR = capA(torques.shR || 0)
      const elL = capA(torques.elL || 0), elR = capA(torques.elR || 0)
      // hip: angle chest–hip–knee
      jointTorque(sim, f, 1, 0, HIP_L[0], hipL)
      jointTorque(sim, f, 1, 0, HIP_R[0], hipR)
      // knee: angle hip–knee–ankle
      jointTorque(sim, f, 0, HIP_L[0], HIP_L[1], kneeL)
      jointTorque(sim, f, 0, HIP_R[0], HIP_R[1], kneeR)
      // ankle: angle knee–ankle–toe
      jointTorque(sim, f, HIP_L[0], HIP_L[1], HIP_L[1] + 2, ankleL)
      jointTorque(sim, f, HIP_R[0], HIP_R[1], HIP_R[1] + 2, ankleR)
      // shoulder: angle head–chest–elbow ; elbow: angle shoulder–elbow–hand
      jointTorque(sim, f, 2, 1, 13, shL)
      jointTorque(sim, f, 2, 1, 16, shR)
      jointTorque(sim, f, 12, 13, 14, elL)
      jointTorque(sim, f, 15, 16, 17, elR)
    }

    // integrate (semi-implicit Euler), remember pre-projection positions
    const pPrev = Float64Array.from(sim.p)
    for (let i = 0; i < N; i++) {
      const im = 1 / M[i]
      sim.v[i * 2] += f[i * 2] * im * dt
      sim.v[i * 2 + 1] += f[i * 2 + 1] * im * dt
      sim.p[i * 2] += sim.v[i * 2] * dt
      sim.p[i * 2 + 1] += sim.v[i * 2 + 1] * dt
    }

    // solve distance constraints (stiff PBD projections)
    for (let it = 0; it < ITER; it++) {
      for (const [i, j, r0, comp] of BONES) {
        const ix = i * 2, jx = j * 2
        let dx = sim.p[jx] - sim.p[ix], dy = sim.p[jx + 1] - sim.p[ix + 1]
        const d = Math.hypot(dx, dy) || 1e-9
        const k = (d - r0) / d
        const wi = 1 / M[i], wj = 1 / M[j]
        const s = k / (wi + wj + (comp || 0))
        sim.p[ix] += dx * s * wi
        sim.p[ix + 1] += dy * s * wi
        sim.p[jx] -= dx * s * wj
        sim.p[jx + 1] -= dy * s * wj
      }
      // tunneling guard
      for (let i = 0; i < N; i++) {
        if (sim.p[i * 2 + 1] < -0.05) sim.p[i * 2 + 1] = -0.05
      }
    }

    // XPBD velocity update from the projected delta; slip + GRF readouts.
    sim.slipSlide = 0
    for (let fi = 0; fi < 2; fi++) {
      sim.grf[fi * 2] *= 0.5
      sim.grf[fi * 2 + 1] *= 0.5
    }
    for (let i = 0; i < N; i++) {
      const ix = i * 2, iy = i * 2 + 1
      let vx = (sim.p[ix] - pPrev[ix]) / dt
      let vy = (sim.p[iy] - pPrev[iy]) / dt
      if (sim.p[iy] < 0.005) {
        if (Math.abs(vx) > sim.slipSlide) sim.slipSlide = Math.abs(vx)
        const jn = sim.grfContact[i]
        for (let fi = 0; fi < 2; fi++) {
          const L = sim.legs[fi]
          if (i === L.h) sim.grf[fi * 2] = Math.max(sim.grf[fi * 2], jn)
          if (i === L.t) sim.grf[fi * 2 + 1] = Math.max(sim.grf[fi * 2 + 1], jn)
        }
      } else {
        vx *= 1 - 0.0004
      }
      sim.v[ix] = vx
      sim.v[iy] = vy
    }
  }

  function step(sim, dt) {
    const n = Math.max(1, Math.round(dt / H))
    const h = dt / n
    sim.events = { stepL: 0, stepR: 0, fall: 0, landL: 0, landR: 0 }
    const dead = sim.mode === 'fallen'
    let slipMax = 0
    for (let s = 0; s < n; s++) {
      comOf(sim)
      const fc = feetContact(sim)

      // torso pitch: angle of hip->head from vertical, positive = forward lean;
      // phiD is the true angular rate of that vector (d/dt atan2(ux, uy))
      const ux = sim.p[2 * 2] - sim.p[0 * 2], uy = sim.p[2 * 2 + 1] - sim.p[0 * 2 + 1]
      const wx = sim.v[2 * 2] - sim.v[0 * 2], wy = sim.v[2 * 2 + 1] - sim.v[0 * 2 + 1]
      const r2 = ux * ux + uy * uy || 1e-6
      const phi = Math.atan2(ux, uy)
      const phiD = (uy * wx - ux * wy) / r2

      // support span from contact points
      let supMin = Infinity, supMax = -Infinity
      for (let fi = 0; fi < 2; fi++) {
        const L = sim.legs[fi]
        if (fc[fi].heel) { supMin = Math.min(supMin, sim.p[L.h * 2]); supMax = Math.max(supMax, sim.p[L.h * 2]) }
        if (fc[fi].toe) { supMin = Math.min(supMin, sim.p[L.t * 2]); supMax = Math.max(supMax, sim.p[L.t * 2]) }
      }
      const hasSupport = supMin <= supMax
      const margin = hasSupport ? (supMax - sim.com[0]) : -1
      sim.phi = phi; sim.phiD = phiD; sim.margin = margin
      sim.support = hasSupport ? [supMin, supMax] : null

      const T = sim.tuning
      const dead = sim.mode === 'fallen'
      const tq = { hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, ankleL: 0, ankleR: 0, shL: 0, shR: 0, elL: 0, elR: 0 }
      if (!dead) {
        const hipX = sim.p[0 * 2], hipY = sim.p[0 * 2 + 1]
        const hipVx = sim.v[0 * 2], hipVy = sim.v[0 * 2 + 1]
        for (let fi = 0; fi < 2; fi++) {
          const L = sim.legs[fi]
          const kx = sim.p[L.k * 2]
          const ax = sim.p[L.a * 2], ay = sim.p[L.a * 2 + 1]
          const hy = sim.p[L.h * 2 + 1]
          const ty = sim.p[L.t * 2 + 1]
          const vkx = sim.v[L.k * 2]
          const vax = sim.v[L.a * 2]
          const vtx = sim.v[L.t * 2], vhy = sim.v[L.h * 2 + 1]
          const key = fi === 0 ? 'L' : 'R'
          if (L.swing) {
            // swing: reach the foot ahead of the CoM, flex the knee, toe up
            tq['hip' + key] = T.sHip * T.kSw * (sim.com[0] + T.catchLead + 0.06 - ax) - T.dSw * (vax - hipVx)
            tq['knee' + key] = T.sKnee * T.kK * (-0.16 - (ax - kx)) - T.dK * (vax - vkx)
            tq['ankle' + key] = T.sAnk * T.kA * (0.05 - (ty - hy)) - T.dA * (vtx - vhy) * 4
          } else {
            // stance: torso lean PD through hip + ankle (signs are part of the
            // tuning; gains were searched, see README), lift reflex drives the
            // hip back to standing height, thigh/shank stay stacked over feet
            const bal = T.sBal * (T.kp * phi + T.kd * clamp(phiD, -4, 4))
            const lift = T.kLift * (0.955 - hipY) + T.dLift * (-hipVy)
            tq['hip' + key] = bal * 0.5 + T.sHip * (T.kThigh * (0.0 - (kx - hipX)) - T.dThigh * (vkx - hipVx) + lift * 0.35)
            tq['knee' + key] = T.sKnee * (bal * 0.25 + T.kK * (-0.02 - (ax - kx)) - T.dK * (vax - vkx) + lift)
            const pushT = ay < 0.03 ? clamp((0.05 - margin) * 30, 0, 1) : 0
            tq['ankle' + key] = bal * 0.6 + T.sAnk * (T.kA * (0.0 - (ty - hy)) - T.dA * (vtx - vhy) * 4 - T.push * pushT)
          }
        }
        // arms: contralateral pendulum. The same-side foot trailing behind the
        // CoM sends that hand forward (and vice versa) — gait-coupled, driven by
        // torques (virtual work, couple closed at the joint), never pose writes.
        for (let ai = 0; ai < sim.arms.length; ai++) {
          const A = sim.arms[ai]
          const same = sim.legs[ai]
          const shx = sim.p[A.s * 2], shy = sim.p[A.s * 2 + 1]
          const elx = sim.p[A.e * 2], ely = sim.p[A.e * 2 + 1]
          const hnx = sim.p[A.h * 2], hny = sim.p[A.h * 2 + 1]
          const rel = sim.p[same.a * 2] - sim.com[0]
          const lead = clamp(-T.armG * rel, -T.armAmp, T.armAmp)
          const target = sim.com[0] + lead
          const tauSh = T.sArm * (T.kArm * (target - hnx) - T.dArm * (sim.v[A.h * 2] - sim.v[A.s * 2]))
          tq['sh' + (ai === 0 ? 'L' : 'R')] = tauSh
          tq['el' + (ai === 0 ? 'L' : 'R')] = T.kElb * ((hnx - elx) - (REST[A.h][0] - REST[A.e][0])) - T.dElb * (sim.v[A.h * 2] - sim.v[A.e * 2])
        }
      }
      substep(sim, h, tq)
      slipMax = Math.max(slipMax, sim.slipSlide)

      if (!dead) {
        // step trigger: when the CoM runs out of grip at the front edge of a
        // planted foot, that foot (the trailing one) lifts and reaches ahead.
        for (let fi = 0; fi < 2; fi++) {
          const L = sim.legs[fi]
          const other = sim.legs[1 - fi]
          const footX = sim.p[L.a * 2]
          if (!L.swing && fc[fi].contact && hasSupport &&
            ((margin < T.stepTh && sim.com[0] > footX - 0.07) ||
             sim.com[0] - footX > T.trailTh) &&
            (!other.swing || other.swingT > 0.12) &&
            sim.t - sim.lastStepT > 0.14) {
            L.swing = true; L.swingT = 0
            sim.lastStepLeg = fi; sim.lastStepT = sim.t; sim.steps++
            sim.events[fi === 0 ? 'stepL' : 'stepR'] = 1
          }
          if (L.swing) {
            L.swingT += h
            const ankleY = sim.p[L.a * 2 + 1]
            const ahead = sim.p[L.a * 2] > sim.com[0] + 0.02
            if ((ankleY < 0.10 && ahead && L.swingT > 0.08) || L.swingT > 0.45) {
              L.swing = false
              sim.events[fi === 0 ? 'landL' : 'landR'] = 1
            }
          }
        }
      }
      sim.t += h
    }
    sim.slipSlide = slipMax

    // fall detection: head near ground or torso past the tipping point
    const headY = sim.p[2 * 2 + 1]
    if (!dead && (headY < 0.45 || Math.abs(sim.phi) > 1.1)) {
      sim.mode = 'fallen'; sim.fallenFor = 0; sim.events.fall = 1
    }
    if (sim.mode === 'fallen') {
      sim.fallenFor += dt
      if (sim.fallenFor > 2.2) reset(sim)
    }
    return sim
  }

  function push(sim, vx, vy) {
    if (sim.mode === 'fallen') return
    sim.mode = 'push'
    const imp = (v) => { sim.v[1 * 2] += v }
    imp(vx || 0)
    sim.v[2 * 2] += (vx || 0) * 0.8
    if (vy) { sim.v[1 * 2 + 1] += vy; sim.v[2 * 2 + 1] += vy }
  }

  function reset(sim) {
    for (let i = 0; i < N; i++) {
      sim.p[i * 2] = REST[i][0] + sim.x0
      sim.p[i * 2 + 1] = REST[i][1]
      sim.v[i * 2] = 0; sim.v[i * 2 + 1] = 0
    }
    sim.mode = 'stand'
    sim.fallenFor = 0
    sim.steps = 0; sim.lastStepLeg = -1; sim.lastStepT = -1; sim.forceT = 0
    for (const L of sim.legs) { L.swing = false; L.swingT = 0 }
    sim.events = { stepL: 0, stepR: 0, fall: 0, landL: 0, landR: 0 }
    return sim
  }

  /* ---------------- metrics (harness gates) ---------------- */

  function run(seconds, opts) {
    const sim = create(opts)
    const dt = 1 / 60
    const n = Math.round(seconds / dt)
    const rec = { ticks: 0, uprightTicks: 0, fell: false, advanced: 0,
      maxSlip: 0, flightFrac: 0, steps: 0, minMargin: 1e9, leanMax: 0,
      headYMin: 1e9, grfMax: 0, comTrace: [] }
    let airborne = 0
    for (let i = 0; i < n; i++) {
      if (opts && opts.driver) opts.driver(sim, i * dt)
      step(sim, dt)
      rec.ticks++
      const upright = sim.p[2 * 2 + 1] > 1.2 && Math.abs(sim.phi) < 0.35
      if (upright) rec.uprightTicks++
      rec.leanMax = Math.max(rec.leanMax, Math.abs(sim.phi))
      rec.headYMin = Math.min(rec.headYMin, sim.p[2 * 2 + 1])
      rec.maxSlip = Math.max(rec.maxSlip, sim.slipSlide)
      rec.minMargin = Math.min(rec.minMargin, sim.margin)
      rec.grfMax = Math.max(rec.grfMax, Math.max(...sim.grf))
      if (!sim.support) airborne++
      if (sim.events.fall) rec.fell = true
      if (i % 30 === 0) rec.comTrace.push([+sim.com[0].toFixed(3), +sim.com[1].toFixed(3)])
    }
    rec.flightFrac = +(airborne / rec.ticks).toFixed(3)
    rec.steps = sim.steps
    rec.advanced = +(sim.com[0] - (sim.x0)).toFixed(3)
    rec.uprightFrac = +(rec.uprightTicks / rec.ticks).toFixed(3)
    rec.fell = rec.fell || sim.mode === 'fallen'
    return rec
  }

  global.PhysicsWalk = {
    G, H, N, P_NAMES, M, BONES, REST, CONTACT_H, LEGS, ARMS,
    create, step, push, reset, run,
    metrics: { run },
  }
})(typeof window !== 'undefined' ? window : globalThis)
