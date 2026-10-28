// stickwalk.core.js — pure procedural gait for STICK WALK (#1150), headless-safe.
//
// A 31-joint CMU-style mocap rig simulated on flat ground. The gait is
// procedural (no CMU .bvh bytes ship); the layout credits the CMU body model.
// The physics is honest:
//   - stride frequency follows v and a human stride curve;
//   - duty factor falls below 0.5 across the walk-run transition at dynamic
//     Froude number v^2/(g*legLen) ~ 0.5, so walking always has double
//     support and running always has a flight phase (both provable);
//   - stance contacts are FROZEN in world space from touchdown to toe-off,
//     and the leg is solved with 2-bone IK from the planted contact — so
//     stance-foot slip is exactly zero by construction, never painted;
//   - the pelvis VAULTS over the planted foot: hip height is capped by
//     sqrt(reach^2 - lead^2) per stance leg, which produces the true
//     sinusoidal step-to-step dip instead of a painted bob.
//
// Coordinates: right-handed, y up, heading theta with dir = (sin th, 0, cos th).

(function (global) {
  'use strict'

  const G = 9.81

  // rig lengths (metres)
  const THIGH = 0.48, SHIN = 0.48, ANKLE_H = 0.085
  const REACH = (THIGH + SHIN) * 0.985          // hip->ankle max (slight knee bend)
  const HIP_H = THIGH + SHIN + ANKLE_H         // floor -> hip when standing  (1.045)
  const FOOT_HEEL = 0.025, FOOT_TOE = 0.135    // horizontal ankle offsets
  const TOE_DROP = 0.02                        // toe pad below ankle joint line
  const HIP_LAT = 0.09
  const SPINE = 0.12, CHEST = 0.16, NECK = 0.09, HEAD = 0.11, HEAD_TOP = 0.12
  const CLAV_Y = 0.10, CLAV_X = 0.05, SH_X = 0.16
  const UARM = 0.30, FARM = 0.26, HAND = 0.09

  const Joints = {
    HIPS: 0,
    SPINE: 1, CHEST: 2, NECK: 3, HEAD: 4, HEAD_TOP: 5,
    L_CLAV: 6, L_SHOULDER: 7, L_ELBOW: 8, L_WRIST: 9, L_HAND: 10,
    R_CLAV: 11, R_SHOULDER: 12, R_ELBOW: 13, R_WRIST: 14, R_HAND: 15,
    L_HIP: 16, L_KNEE: 17, L_ANKLE: 18, L_HEEL: 19, L_MID: 20, L_TOE: 21,
    R_HIP: 22, R_KNEE: 23, R_ANKLE: 24, R_HEEL: 25, R_MID: 26, R_TOE: 27,
    JAW: 28, L_EYE: 29, R_EYE: 30,
  }
  const JOINT_NAMES = [
    'hips', 'spine', 'chest', 'neck', 'head', 'headTop',
    'lClavicle', 'lShoulder', 'lElbow', 'lWrist', 'lHand',
    'rClavicle', 'rShoulder', 'rElbow', 'rWrist', 'rHand',
    'lHip', 'lKnee', 'lAnkle', 'lHeel', 'lMidfoot', 'lToe',
    'rHip', 'rKnee', 'rAnkle', 'rHeel', 'rMidfoot', 'rToe',
    'jaw', 'lEye', 'rEye',
  ]
  const BONES = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5],
    [2, 6], [6, 7], [7, 8], [8, 9], [9, 10],
    [2, 11], [11, 12], [12, 13], [13, 14], [14, 15],
    [0, 16], [16, 17], [17, 18], [18, 19], [18, 20], [20, 21],
    [0, 22], [22, 23], [23, 24], [24, 25], [24, 26], [26, 27],
    [4, 28], [4, 29], [4, 30],
  ]

  const clamp = (x, a, b) => x < a ? a : x > b ? b : x
  const ss = (e0, e1, x) => { const u = clamp((x - e0) / (e1 - e0), 0, 1); return u * u * (3 - 2 * u) }

  function gaitParams(v) {
    const av = Math.abs(v)
    const fr = (av * av) / (G * HIP_H)
    const stride = clamp(0.28 + 0.72 * Math.pow(av, 0.72), 0.66, 2.50)
    const f = av > 0.05 ? clamp(av / stride, 0.4, 2.1) : 0.45
    const duty = fr < 0.5
      ? clamp(0.62 - 0.12 * ss(0.35, 0.5, fr), 0.50, 0.62)
      : clamp(0.50 - 0.20 * ss(0.5, 1.2, fr), 0.30, 0.50)
    return { v: av, fr, stride, f, duty, gait: fr >= 0.5 ? 'run' : 'walk' }
  }

  // pitch gamma: positive = toe-down / heel-up (push-off), negative = toe-up (heel strike)
  function stanceGamma(tau, duty) {
    return -0.12 * (1 - ss(0, duty * 0.45, tau)) + 0.45 * ss(duty * 0.55, duty, tau)
  }
  function swingGamma(t) {
    return 0.33 * (1 - ss(0, 0.35, t)) - 0.12 * ss(0.55, 1, t)
  }

  let SIM_DT = 1 / 60

  function create(opts) {
    opts = opts || {}
    const v0 = opts.v === undefined ? 1.2 : opts.v
    return {
      t: 0,
      pos: [opts.x || 0, opts.z || 0],
      theta: opts.theta || 0,
      v: v0, vT: v0,
      w: opts.w || 0, wT: opts.w || 0,
      phi: 0,
      legs: [
        { side: 1, stance: false, contact: [0, 0], wasStance: false },
        { side: -1, stance: false, contact: [0, 0], wasStance: false },
      ],
      joints: new Float64Array(31 * 3),
      events: { heelL: 0, toeL: 0, heelR: 0, toeR: 0 },
      gp: gaitParams(v0),
      hipY: HIP_H,
    }
  }

  function rotY(vx, vz, a) {
    const c = Math.cos(a), s = Math.sin(a)
    return [vx * c + vz * s, -vx * s + vz * c]
  }

  // rotate a foot-local vector (x forward, y up) by pitch gamma into world offsets.
  function footOff(fx, fy, gam, d) {
    const c = Math.cos(gam), s = Math.sin(gam)
    const wx = fx * c - fy * s
    const wy = -fx * s + fy * c
    return [d[0] * wx, wy, d[2] * wx]
  }

  function ikKnee(H, A, d) {
    const ux = A[0] - H[0], uy = A[1] - H[1], uz = A[2] - H[2]
    const len = Math.hypot(ux, uy, uz) || 1e-6
    const uxh = ux / len, uyh = uy / len, uzh = uz / len
    const a = (THIGH * THIGH - SHIN * SHIN + len * len) / (2 * len)
    const h = Math.sqrt(Math.max(THIGH * THIGH - a * a, 0))
    // pole: the forward direction perpendicular to the hip->ankle line, in 3D,
    // so the knee bulges forward along the whole stride
    const dot = d[0] * uxh + d[2] * uzh
    const wx = d[0] - dot * uxh
    const wy = -dot * uyh
    const wz = d[2] - dot * uzh
    const wl = Math.hypot(wx, wy, wz) || 1
    return [
      H[0] + uxh * a + (wx / wl) * h,
      H[1] + uyh * a + (wy / wl) * h,
      H[2] + uzh * a + (wz / wl) * h,
    ]
  }

  // foot chain pose (independent of hip): contact-frozen in stance, cycloid in swing
  function poseFoot(sim, leg, phi, gp, d, lat) {
    const duty = gp.duty
    const stride = gp.stride
    const sA = clamp(0.24 * stride + 0.02, 0.20, 0.40)
    const out = { stance: false, ankle: [0, 0, 0], heel: [0, 0, 0], toe: [0, 0, 0], mid: [0, 0, 0], toeY: 0, gam: 0, touchdown: false, toeoff: false }

    out.stance = phi < duty
    let gam
    if (out.stance) {
      const tau = phi
      gam = stanceGamma(tau, duty)
      const heelPhase = tau < duty * 0.5
      if (!leg.wasStance) {
        leg.contact = [sim.pos[0] + d[0] * sA, sim.pos[1] + d[2] * sA]
        out.touchdown = true
      } else if (sim.w) {
        const [rx, rz] = rotY(leg.contact[0] - sim.pos[0], leg.contact[1] - sim.pos[1], sim.w * SIM_DT)
        leg.contact[0] = sim.pos[0] + rx
        leg.contact[1] = sim.pos[1] + rz
      }
      const C = leg.contact
      const gc = Math.cos(gam), gsn = Math.sin(gam)
      if (heelPhase) {
        out.ankle = [C[0] + d[0] * FOOT_HEEL * gc, ANKLE_H * gc - FOOT_HEEL * gsn, C[1] + d[2] * FOOT_HEEL * gc]
      } else {
        out.ankle = [C[0] - d[0] * FOOT_TOE * gc, FOOT_TOE * gsn + TOE_DROP * gc, C[1] - d[2] * FOOT_TOE * gc]
      }
      if (heelPhase) out.heel[1] = 0
      else out.toe[1] = 0
      out.contact = [C[0], C[1]]
      out.toeContact = !heelPhase
    } else {
      const t = (phi - duty) / (1 - duty)
      const trail = Math.max(stride * duty - sA, 0.02)
      const localX = -trail + (sA + trail) * (t * 0.82 + 0.18 * (t * t * (3 - 2 * t)))
      const swingH = clamp(0.03 + 0.055 * stride, 0.04, 0.30)
      const lift = swingH * Math.pow(Math.sin(Math.PI * t), 0.8)
      gam = swingGamma(t)
      out.ankle = [sim.pos[0] + d[0] * (localX + FOOT_HEEL * Math.cos(gam)) + lat[0] * HIP_LAT * leg.side,
        ANKLE_H + lift,
        sim.pos[1] + d[2] * (localX + FOOT_HEEL * Math.cos(gam)) + lat[2] * HIP_LAT * leg.side]
      out.toeoff = leg.wasStance
      out.toeY = lift
      out.toeContact = false
    }

    const hf = footOff(-FOOT_HEEL, 0, gam, d)
    const tf = footOff(FOOT_TOE, -TOE_DROP, gam, d)
    out.heel = [out.ankle[0] + hf[0], Math.max(out.ankle[1] + hf[1], out.heel[1]), out.ankle[2] + hf[2]]
    out.toe = [out.ankle[0] + tf[0], Math.max(out.ankle[1] + tf[1], out.toe[1]), out.ankle[2] + tf[2]]
    out.mid = [(out.heel[0] + out.toe[0]) / 2, (out.heel[1] + out.toe[1]) / 2, (out.heel[2] + out.toe[2]) / 2]
    out.gam = gam
    out.toeY = out.toe[1]
    leg.stance = out.stance
    leg.wasStance = out.stance
    return out
  }

  function step(sim, dt) {
    SIM_DT = dt
    sim.t += dt
    sim.events = { heelL: 0, toeL: 0, heelR: 0, toeR: 0 }

    const aMax = 2.6
    sim.v += clamp(sim.vT - sim.v, -aMax * dt, aMax * dt)
    sim.w += clamp(sim.wT - sim.w, -5 * dt, 5 * dt)
    sim.theta += sim.w * dt
    const d = [Math.sin(sim.theta), 0, Math.cos(sim.theta)]
    const lat = [Math.cos(sim.theta), 0, -Math.sin(sim.theta)]
    sim.pos[0] += d[0] * sim.v * dt
    sim.pos[1] += d[2] * sim.v * dt

    const gp = gaitParams(sim.v)
    sim.gp = gp
    sim.phi = (sim.phi + gp.f * dt) % 1

    const r0 = poseFoot(sim, sim.legs[0], sim.phi, gp, d, lat)
    const r1 = poseFoot(sim, sim.legs[1], (sim.phi + 0.5) % 1, gp, d, lat)
    if (r0.touchdown) sim.events.heelL = 1
    if (r0.toeoff) sim.events.toeL = 1
    if (r1.touchdown) sim.events.heelR = 1
    if (r1.toeoff) sim.events.toeR = 1

    // pelvis: base height with the twice-per-cycle bob, weighted toward the
    // stance leg (weight shift), then vaulted by reach over every stance foot
    const swayA = 0.018 + 0.03 * Math.min(1, gp.fr)
    const bobA = 0.008 + 0.016 * Math.min(1, gp.fr * 1.6)
    const crouch = 0.05 * ss(0.5, 1.4, gp.fr) + 0.035 * Math.min(1, gp.fr) + 0.015
    const hipsPos = [sim.pos[0], HIP_H * (1 - crouch) - bobA * Math.cos(4 * Math.PI * sim.phi), sim.pos[1]]
    const stanceSide = sim.phi < gp.duty ? 1 : -1
    hipsPos[0] += lat[0] * swayA * stanceSide
    hipsPos[2] += lat[2] * swayA * stanceSide
    let hipY = hipsPos[1]
    // geometric reach clamp: the hip joint can never sit further than REACH
    // from either ankle (stance vault, swing landing reach, push-off trail all
    // fall out of this single constraint); when binding, the hip slides down
    // and slightly back toward the foot — a vault, not a painted bob.
    const hipsFor = side => [hipsPos[0] + lat[0] * HIP_LAT * side, hipY - 0.03, hipsPos[2] + lat[2] * HIP_LAT * side]
    for (let iter = 0; iter < 2; iter++) {
      for (const [r, side] of [[r0, 1], [r1, -1]]) {
        const Hc = hipsFor(side)
        const dx = Hc[0] - r.ankle[0], dy = Hc[1] - r.ankle[1], dz = Hc[2] - r.ankle[2]
        const len = Math.hypot(dx, dy, dz)
        if (len > REACH) {
          const k = (len - REACH) / len
          hipsPos[0] -= dx * k
          hipsPos[2] -= dz * k
          hipY = Math.max(HIP_H * 0.55, hipY - dy * k)
        }
      }
    }
    hipsPos[1] = hipY
    sim.hipY = hipY

    const out = sim.joints
    const set = (i, p) => { out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2] }

    // torso
    set(Joints.HIPS, hipsPos)
    const twist = (0.05 + 0.07 * Math.min(1, gp.fr)) * Math.sin(2 * Math.PI * sim.phi + Math.PI / 2)
    const upLean = 0.03 * ss(0.4, 1.2, gp.fr)
    const spinePos = [hipsPos[0] + d[0] * upLean, hipsPos[1] + SPINE, hipsPos[2] + d[2] * upLean]
    const chestPos = [hipsPos[0] + d[0] * upLean * 2, hipsPos[1] + SPINE + CHEST, hipsPos[2] + d[2] * upLean * 2]
    set(Joints.SPINE, spinePos)
    set(Joints.CHEST, chestPos)
    const neckPos = [chestPos[0] - d[0] * upLean * 0.5, chestPos[1] + NECK, chestPos[2] - d[2] * upLean * 0.5]
    set(Joints.NECK, neckPos)
    const headPos = [neckPos[0] + d[0] * 0.015 + lat[0] * swayA * 0.35, neckPos[1] + HEAD * 0.75, neckPos[2] + d[2] * 0.015 + lat[2] * swayA * 0.35]
    set(Joints.HEAD, headPos)
    set(Joints.HEAD_TOP, [headPos[0], headPos[1] + HEAD_TOP, headPos[2]])
    set(Joints.JAW, [headPos[0] + d[0] * 0.05, headPos[1] - 0.045, headPos[2] + d[2] * 0.05])
    set(Joints.L_EYE, [headPos[0] + d[0] * 0.05 + lat[0] * 0.032, headPos[1] + 0.02, headPos[2] + d[2] * 0.05 + lat[2] * 0.032])
    set(Joints.R_EYE, [headPos[0] + d[0] * 0.05 - lat[0] * 0.032, headPos[1] + 0.02, headPos[2] + d[2] * 0.05 - lat[2] * 0.032])

    // arms: contralateral to the legs, bend more on the forward swing
    const armAmp = clamp(0.15 + 0.55 * gp.v / 3.5, 0.15, 0.95)
    const arm = (Jcl, Jsh, Je, Jw, Jh, phaseOff, side) => {
      const gs = armAmp * Math.sin(2 * Math.PI * sim.phi + phaseOff) + 0.05
      const flex = 0.28 + 0.45 * (0.5 + 0.5 * Math.sin(2 * Math.PI * sim.phi + phaseOff + 0.9))
      const tw = twist * side
      const dd = [d[0] * Math.cos(tw) + lat[0] * Math.sin(tw), 0, d[2] * Math.cos(tw) + lat[2] * Math.sin(tw)]
      const lt = [lat[0] * Math.cos(tw) - d[0] * Math.sin(tw), 0, lat[2] * Math.cos(tw) - d[2] * Math.sin(tw)]
      const clav = [chestPos[0] + lt[0] * CLAV_X * side, chestPos[1] + CLAV_Y, chestPos[2] + lt[2] * CLAV_X * side]
      const sh = [clav[0] + lt[0] * SH_X * side, clav[1] + 0.01, clav[2] + lt[2] * SH_X * side]
      const seg = (pitch, len) => [dd[0] * Math.sin(pitch) * len, -Math.cos(pitch) * len, dd[2] * Math.sin(pitch) * len]
      const el = [sh[0] + seg(gs, UARM)[0], sh[1] + seg(gs, UARM)[1], sh[2] + seg(gs, UARM)[2]]
      const wr = [el[0] + seg(gs + flex, FARM)[0], el[1] + seg(gs + flex, FARM)[1], el[2] + seg(gs + flex, FARM)[2]]
      const hd = [wr[0] + seg(gs + flex * 0.8, HAND)[0], wr[1] + seg(gs + flex * 0.8, HAND)[1], wr[2] + seg(gs + flex * 0.8, HAND)[2]]
      set(Jcl, clav); set(Jsh, sh); set(Je, el); set(Jw, wr); set(Jh, hd)
    }
    arm(Joints.L_CLAV, Joints.L_SHOULDER, Joints.L_ELBOW, Joints.L_WRIST, Joints.L_HAND, Math.PI, 1)   // left arm with right leg
    arm(Joints.R_CLAV, Joints.R_SHOULDER, Joints.R_ELBOW, Joints.R_WRIST, Joints.R_HAND, 0, -1)

    // legs from the vaulted pelvis
    const H0 = hipsFor(1), H1 = hipsFor(-1)
    const k0 = ikKnee(H0, r0.ankle, d)
    const k1 = ikKnee(H1, r1.ankle, d)
    set(Joints.L_HIP, H0); set(Joints.L_KNEE, k0); set(Joints.L_ANKLE, r0.ankle)
    set(Joints.L_HEEL, r0.heel); set(Joints.L_MID, r0.mid); set(Joints.L_TOE, r0.toe)
    set(Joints.R_HIP, H1); set(Joints.R_KNEE, k1); set(Joints.R_ANKLE, r1.ankle)
    set(Joints.R_HEEL, r1.heel); set(Joints.R_MID, r1.mid); set(Joints.R_TOE, r1.toe)

    return { joints: out, events: sim.events, gp }
  }

  /* ---------------- metrics (harness gates) ---------------- */

  function plantAudit(v, omega, seconds) {
    const sim = create({ v, w: omega || 0 })
    const dt = 1 / 60
    for (let i = 0; i < Math.round(2.0 / dt); i++) step(sim, dt)   // ramp to speed first
    const n = Math.round(seconds / dt)
    const x0 = sim.pos[0], z0 = sim.pos[1]
    let slip = 0, minClear = 1e9, flight = 0, dbl = 0
    const contacts = [[], []]
    let maxThigh = 0, maxShin = 0
    for (let i = 0; i < n; i++) {
      const prevC = [sim.legs[0].contact.slice(), sim.legs[1].contact.slice()]
      const wasStance = [sim.legs[0].stance, sim.legs[1].stance]
      const phiWas = sim.phi
      step(sim, dt)
      const j = sim.joints
      const dist = (a, b) => Math.hypot(j[a * 3] - j[b * 3], j[a * 3 + 1] - j[b * 3 + 1], j[a * 3 + 2] - j[b * 3 + 2])
      maxThigh = Math.max(maxThigh, dist(16, 17), dist(22, 23))
      maxShin = Math.max(maxShin, dist(17, 18), dist(23, 24))
      for (let k = 0; k < 2; k++) {
        const L = sim.legs[k]
        if (L.stance && wasStance[k] && !omega) {
          const ds = Math.hypot(L.contact[0] - prevC[k][0], L.contact[1] - prevC[k][1])
          if (ds > slip) slip = ds
        }
        if (L.stance && !wasStance[k]) contacts[k].push([L.contact[0], L.contact[1]])
      }
      if (sim.legs[0].stance && sim.legs[1].stance) dbl++; else flight++
      if (phiWas > 0.12 && phiWas < 0.9 && !sim.legs[0].stance) {
        const ty = j[Joints.L_TOE * 3 + 1]
        if (ty < minClear) minClear = ty
      }
    }
    const strides = contacts.map(cs => {
      if (cs.length < 2) return -1
      let s = 0
      for (let i = 1; i < cs.length; i++) s += Math.hypot(cs[i][0] - cs[i - 1][0], cs[i][1] - cs[i - 1][1])
      return s / (cs.length - 1)
    })
    const traveled = Math.hypot(sim.pos[0] - x0, sim.pos[1] - z0)
    const gp = gaitParams(v)
    return {
      v, fr: +gp.fr.toFixed(3), gait: gp.gait, duty: +gp.duty.toFixed(3),
      slip: +slip.toFixed(6), slipMm: +(slip * 1000).toFixed(4),
      minToeClear: +(minClear === 1e9 ? 0 : minClear).toFixed(4),
      flightFrac: +(flight / n).toFixed(3), dblFrac: +(dbl / n).toFixed(3),
      strideL: +strides[0].toFixed(3), strideR: +strides[1].toFixed(3),
      avgSpeed: +(traveled / seconds).toFixed(3),
      maxThigh: +maxThigh.toFixed(3), maxShin: +maxShin.toFixed(3),
      hipY: +sim.hipY.toFixed(3),
      steps: contacts[0].length + contacts[1].length,
    }
  }

  function scan() {
    return [0.5, 1.0, 1.4, 2.0, 3.0, 4.0, 5.0].map(v => plantAudit(v, 0, 6))
  }

  global.StickWalkGait = {
    G, HIP_H, Joints, JOINT_NAMES, BONES, JOINT_COUNT: 31,
    gaitParams, create, step,
    metrics: { plantAudit, scan },
  }
})(typeof window !== 'undefined' ? window : globalThis)
