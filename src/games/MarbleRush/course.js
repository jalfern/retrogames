// MARBLE RUSH — course.js: the manifold. A course is DATA: a centerline of
// segments with curvature, grade, half-width and banking, plus props pinned in
// course-space (s along, u across): bumpers, moving bridges, kicker lips and
// gaps. THIS module owns the analytic surface — the sim rides it, the renderer
// extrudes from it, and rollercheck pins both to it, so drawn floor ≡ ridden
// floor at every sample. Pure Node module: no THREE, no DOM, no Math.random.
//
// Sign conventions (the whole game hangs on these):
//   s  arc length along the centerline, 0 → len
//   u  lateral offset, meters; +u is the RIGHT of travel
//   k  curvature, 1/m; k > 0 turns LEFT → centrifugal demand slides +u
//   bank radians; bank > 0 raises the +u edge (velodrome into a left turn),
//        so gravity assists the inside — bank pairs with same-sign k
//   grade rise per meter along s; downhill (grade < 0) accelerates the marble

// mulberry32 (same stream as gameContract.seedRng — inlined so the pure sim
// chain stays Node-importable with zero utils deps, the TidalRush pattern)
export function seedRng(seed) {
    let s = seed | 0
    return () => {
        s = (s + 0x6D2B79F5) | 0
        let t = Math.imul(s ^ (s >>> 15), 1 | s)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export const DS = 0.5            // manifold sample spacing (m)
export const SMOOTH = 7          // blend length at segment joins (m)
export const MARBLE_R = 0.42     // marble radius (m)

// ---- physics constants (one place; the harness pins these shapes) ----------
export const G = 9.81
export const GRIP = 0.62         // friction budget, g units
export const ACC = 8.2           // throttle, m/s²
export const BRAKE = 11.0        // brake, m/s²
export const ROLL_C = 0.16       // rolling resistance (linear)
export const DRAG_C = 0.016      // air drag (quadratic)
export const STEER_ACCEL = 7.2   // lateral steering authority, m/s²
export const LAT_DAMP = 3.4      // lateral damping
export const SLIDE_K = 0.55      // how hard grip-excess throws you outward
export const MAX_V = 26          // terminal, m/s
export const LAUNCH = 3.4        // kicker base vertical launch, m/s
export const FALL_Y = -7         // this far under the floor = gone

// ---- stage data -------------------------------------------------------------
// segs: [len, k, grade, halfW, bank] tuples. flags: bumpers {s,u,r},
// movers {from,to,A,w,omega,phase} (deck center = A·sin(ωt+φ)), kickers
// {s, to: gap length beyond the lip}. Gaps: segs entries with w=0.
// Stage 2 verbs: sweepers {s,A,w,omega,phase} — a neon bar at station s
// sweeping laterally across the road on the moverDeck sine (a deck you must
// NOT be on); cp {s} — one checkpoint gate per late shelf: a fall after it
// respawns at the gate on the same clock, so medals stay honest.
export const STAGES = [
    {
        name: 'FIRST ROLL',
        sky: 'dawn',
        hue: 196,
        par: 20.5, medals: [20.5, 24, 29.5],   // [gold, silver, bronze] upper bounds
        segs: [
            [34, 0, 0, 3.2, 0],
            [46, 0.020, 0, 3.0, 0.10],
            [30, 0, -0.06, 2.8, 0],
            [44, -0.022, 0, 3.0, 0.10],
            [40, 0, 0.04, 2.8, 0],
            [38, 0.024, 0, 3.0, 0.12],
            [34, 0, 0, 3.0, 0],
        ],
        bumpers: [{ s: 118, u: 1.6, r: 0.95 }],
        movers: [],
        kickers: [],
        sweepers: [],
        cp: 0,
    },
    {
        name: 'SWITCHBACK',
        sky: 'day',
        hue: 152,
        par: 27.5, medals: [27.5, 32.5, 39.5],
        segs: [
            [30, 0, 0, 2.9, 0],
            [40, 0.032, 0, 2.6, 0.16],
            [26, 0, -0.09, 2.6, 0],
            [40, -0.034, 0, 2.6, 0.16],
            [30, 0, 0.05, 2.5, 0],
            [36, 0.036, 0, 2.5, 0.18],
            [26, 0, -0.05, 2.6, 0],
            [44, -0.030, 0, 2.8, 0.14],
            [30, 0, 0, 2.8, 0],
        ],
        bumpers: [{ s: 96, u: -1.3, r: 0.9 }, { s: 214, u: 1.4, r: 0.9 }],
        movers: [],
        kickers: [],
        sweepers: [],
        cp: 0,
    },
    {
        name: 'BUMPER ALLEY',
        sky: 'dusk',
        hue: 268,
        par: 25, medals: [25, 29.5, 35.5],
        segs: [
            [34, 0, 0, 2.7, 0],
            [40, -0.028, 0, 2.4, 0.13],
            [34, 0, -0.07, 2.6, 0],
            [46, 0.030, 0.02, 2.4, 0.14],
            [30, 0, 0, 2.6, 0],
            [42, -0.032, 0, 2.3, 0.15],
            [34, 0.026, -0.04, 2.4, 0.12],
            [34, 0, 0, 2.6, 0],
        ],
        bumpers: [
            { s: 60, u: 1.1, r: 0.9 },
            { s: 132, u: -1.2, r: 0.9 },
            { s: 196, u: 1.2, r: 0.9 },
            { s: 262, u: -1.0, r: 0.9 },
        ],
        movers: [],
        kickers: [],
        sweepers: [],
        cp: 0,
    },
    {
        name: 'SWING BRIDGE',
        sky: 'storm',
        hue: 214,
        par: 24, medals: [24, 28, 34],
        segs: [
            [32, 0, 0, 2.7, 0],
            [44, 0.026, 0, 2.5, 0.12],
            [40, 0, 0, 0, 0],           // over the first gap (bridge rides it)
            [36, -0.026, 0, 2.4, 0.12],
            [34, 0, -0.08, 2.5, 0],
            [46, 0, 0, 0, 0],          // over the second gap
            [32, -0.030, 0.04, 2.4, 0.14],
            [36, 0, 0, 2.6, 0],
        ],
        bumpers: [{ s: 26, u: -1.2, r: 0.9 }],
        movers: [
            { from: 76, to: 116, A: 1.6, w: 1.5, omega: 1.25, phase: 0.0 },
            { from: 186, to: 232, A: 2.1, w: 1.4, omega: 1.05, phase: 1.9 },
        ],
        kickers: [],
        sweepers: [],
        cp: 0,
    },
    {
        name: 'SKY SHOT',
        sky: 'dawn',
        hue: 24,
        par: 21.5, medals: [21.5, 25, 30],
        segs: [
            [30, 0, 0, 2.8, 0],
            [36, -0.024, -0.05, 2.6, 0.12],
            [26, 0, -0.14, 2.4, 0],    // the drop-in ramp: builds launch speed
            [10, 0, 0.06, 2.4, 0],    // kicker lip at s=102
            [9, 0, 0, 0, 0],          // the gap — fly it
            [34, 0.028, 0, 2.2, 0.13], // landing pad: narrow, banked
            [30, 0, 0.05, 2.4, 0],
            [26, 0, 0, 0, 0],         // second gap — the swing bridge covers it
            [40, -0.030, 0, 2.3, 0.14],
            [32, 0, 0, 2.6, 0],
        ],
        bumpers: [{ s: 68, u: 1.0, r: 0.85 }],
        movers: [{ from: 175, to: 201, A: 1.5, w: 1.6, omega: 1.4, phase: 0.7 }],
        kickers: [{ s: 102, gapTo: 111 }],
        sweepers: [],
        cp: 0,
    },
    // ---- stage 2 (rung 2): shelves 6–10 — sweepers + checkpoint gates ------
    {
        name: 'UPPER DECK',
        sky: 'day',
        hue: 186,
        par: 19.5, medals: [19.5, 25, 32],
        segs: [
            [32, 0, 0, 3.2, 0],
            [42, 0.022, 0, 3.0, 0.11],
            [24, 0, -0.08, 3.0, 0],
            [44, -0.024, 0, 3.0, 0.11],
            [30, 0, 0.05, 3.0, 0],
            [40, 0.026, 0, 2.9, 0.12],
            [34, 0, 0, 3.0, 0],
        ],
        bumpers: [{ s: 64, u: 1.4, r: 0.9 }],
        movers: [],
        kickers: [],
        sweepers: [
            { s: 118, A: 1.0, w: 0.85, omega: 1.15, phase: 0.0 },
            { s: 182, A: 1.2, w: 0.85, omega: 1.3, phase: 2.1 },
        ],
        cp: 150,
    },
    {
        name: 'GHOST LINE',
        sky: 'dusk',
        hue: 300,
        par: 22, medals: [22, 27.5, 34.5],
        segs: [
            [30, 0, 0, 2.6, 0],
            [36, 0.030, 0, 2.3, 0.14],
            [30, -0.032, 0, 2.3, 0.14],
            [26, 0.034, 0, 2.2, 0.15],
            [26, -0.034, 0, 2.2, 0.15],
            [34, 0, -0.07, 2.4, 0],
            [38, 0.028, 0.02, 2.3, 0.13],
            [32, 0, 0, 2.5, 0],
        ],
        bumpers: [
            { s: 58, u: -1.0, r: 0.8 },
            { s: 110, u: 1.0, r: 0.8 },
            { s: 168, u: -1.0, r: 0.8 },
        ],
        movers: [],
        kickers: [],
        sweepers: [{ s: 190, A: 0.85, w: 0.75, omega: 1.25, phase: 0.9 }],
        cp: 156,
    },
    {
        name: 'THE MILL',
        sky: 'storm',
        hue: 214,
        par: 21.5, medals: [21.5, 27, 34],
        segs: [
            [30, 0, 0, 2.8, 0],
            [40, 0.026, 0, 2.5, 0.12],
            [36, 0, 0, 0, 0],            // gap one — bridge rides it
            [32, -0.028, 0, 2.4, 0.12],
            [30, 0, -0.08, 2.5, 0],
            [40, 0, 0, 0, 0],            // gap two — bridge rides it
            [30, 0.030, 0.04, 2.4, 0.13],
            [36, 0, 0, 2.7, 0],
        ],
        bumpers: [{ s: 48, u: 1.2, r: 0.85 }],
        movers: [
            { from: 70, to: 106, A: 1.5, w: 1.5, omega: 1.2, phase: 0.3 },
            { from: 168, to: 208, A: 1.8, w: 1.4, omega: 1.05, phase: 2.0 },
        ],
        kickers: [],
        sweepers: [
            { s: 214, A: 1.0, w: 0.8, omega: 1.35, phase: 0.8 },
            { s: 248, A: 1.25, w: 0.85, omega: 1.1, phase: 2.6 },
        ],
        cp: 150,
    },
    {
        name: 'LONG DROP',
        sky: 'dusk',
        hue: 340,
        par: 19, medals: [19, 24.5, 31.5],
        segs: [
            [30, 0, 0, 2.8, 0],
            [34, -0.024, -0.06, 2.6, 0.12],
            [28, 0, -0.15, 2.5, 0],    // the long drop: build the launch
            [10, 0, 0.06, 2.5, 0],     // kicker lip at s=102
            [12, 0, 0, 0, 0],          // the long gap — 12 m, earn it
            [30, 0.026, 0, 2.2, 0.13], // narrow banked landing
            [26, 0, 0.05, 2.3, 0],
            [9, 0, 0, 0, 0],           // bridge over the small gap
            [34, -0.028, 0, 2.3, 0.13],
            [30, 0, 0, 2.6, 0],
        ],
        bumpers: [{ s: 52, u: -1.0, r: 0.85 }],
        movers: [{ from: 170, to: 179, A: 1.4, w: 1.5, omega: 1.25, phase: 0.5 }],
        kickers: [{ s: 102, gapTo: 114 }],
        sweepers: [{ s: 214, A: 1.1, w: 0.8, omega: 1.4, phase: 1.7 }],
        cp: 152,
    },
    {
        name: 'THE SPIRE',
        sky: 'storm',
        hue: 268,
        par: 30, medals: [30, 36, 43],
        segs: [
            [34, 0, 0, 2.9, 0],
            [46, 0.034, 0, 2.4, 0.17],
            [26, 0, -0.10, 2.4, 0],
            [46, -0.036, 0, 2.4, 0.17],
            [28, 0.038, 0.05, 2.2, 0.18],
            [24, -0.040, 0, 2.2, 0.18],
            [38, 0, 0, 0, 0],          // the long bridge
            [30, 0.028, -0.08, 2.3, 0.13],
            [10, 0, 0.06, 2.3, 0],    // kicker lip at s=282
            [12, 0, 0, 0, 0],         // fly it
            [28, -0.026, 0, 2.3, 0.13],
            [30, 0, 0, 2.4, 0],
        ],
        bumpers: [{ s: 56, u: 1.2, r: 0.85 }, { s: 190, u: -1.1, r: 0.8 }],
        movers: [{ from: 204, to: 242, A: 1.7, w: 1.5, omega: 1.15, phase: 0.4 }],
        kickers: [{ s: 282, gapTo: 294 }],
        sweepers: [
            { s: 130, A: 1.0, w: 0.8, omega: 1.3, phase: 1.2 },
            { s: 306, A: 0.85, w: 0.7, omega: 1.45, phase: 0.2 },
        ],
        cp: 196,
    },
]

// ---- compiler ---------------------------------------------------------------
// Sample the manifold once per stage: tables for heading/x/z/y (the centerline)
// and per-s property channels (k, grade, width, bank, mover, gap), with
// smoothstep blends at joins so curvature and banking ramp in and out.
// Deterministic pure math — seedRng only decorates cloud drift at runtime.

const smooth = (t) => t * t * (3 - 2 * t)

export function compileStage(stage) {
    const segs = []
    let s0 = 0
    for (const [len, k, grade, w, bank] of stage.segs) {
        segs.push({ s0, s1: s0 + len, k, grade, w, bank, gap: w <= 0 })
        s0 += len
    }
    const len = s0
    const n = Math.ceil(len / DS) + 1
    const idx = (s) => Math.max(0, Math.min(n - 1, s / DS))

    const segAt = (s) => {
        let i = 0
        while (i < segs.length - 1 && s >= segs[i].s1) i++
        return segs[i]
    }

    // precomputed property tables — joins blend over SMOOTH meters, gap
    // widths do NOT blend (holes are holes)
    const kT = new Float64Array(n)
    const grT = new Float64Array(n)
    const wT = new Float64Array(n)
    const bkT = new Float64Array(n)
    const gapT = new Uint8Array(n)
    const movT = new Int8Array(n).fill(-1)
    for (let i = 0; i < n; i++) {
        const s = i * DS
        const cur = segAt(s)
        const ci = segs.indexOf(cur)
        const prev = segs[Math.max(0, ci - 1)]
        const next = segs[Math.min(segs.length - 1, ci + 1)]
        const tIn = Math.max(0, Math.min(1, (s - cur.s0) / SMOOTH))
        const tOut = Math.max(0, Math.min(1, (cur.s1 - s) / SMOOTH))
        const mix = (a, b, c) => {
            // blend a→b over the entry, b→c over the exit
            let v = b
            if (tIn < 1) v = a + (b - a) * smooth(tIn)
            if (tOut < 1) v = v + (c - v) * (1 - smooth(tOut))
            return v
        }
        kT[i] = mix(prev.k, cur.k, next.k)
        grT[i] = mix(prev.grade, cur.grade, next.grade)
        bkT[i] = mix(prev.bank, cur.bank, next.bank)
        const gapped = cur.gap
        wT[i] = gapped ? 0 : cur.w
        gapT[i] = gapped ? 1 : 0
    }
    for (let mi = 0; mi < stage.movers.length; mi++) {
        const m = stage.movers[mi]
        for (let i = 0; i < n; i++) {
            const s = i * DS
            if (s >= m.from && s < m.to) movT[i] = mi
        }
    }

    // centerline: integrate heading and elevation
    const heading = new Float64Array(n)
    const X = new Float64Array(n)
    const Y = new Float64Array(n)
    const Z = new Float64Array(n)
    let h = 0
    let x = 0
    let y = 0
    let z = 0
    for (let i = 0; i < n; i++) {
        heading[i] = h
        X[i] = x
        Y[i] = y
        Z[i] = z
        const hh = h + kT[i] * DS
        x += (Math.sin(h) + Math.sin(hh)) * 0.5 * DS
        z += (Math.cos(h) + Math.cos(hh)) * 0.5 * DS
        y += grT[i] * DS
        h = hh
    }

    const lut = (T, s) => {
        const f = idx(s)
        const i = Math.floor(f)
        const j = Math.min(n - 1, i + 1)
        const a = f - i
        return T[i] * (1 - a) + T[j] * a
    }

    const course = {
        name: stage.name,
        sky: stage.sky,
        hue: stage.hue,
        par: stage.par,
        medals: stage.medals,
        len,
        segs,
        bumpers: stage.bumpers.map((b) => ({ ...b, hit: false })),
        movers: stage.movers,
        kickers: stage.kickers,
        cp: stage.cp || 0,
        sweepers: stage.sweepers,
        headingOf: (s) => lut(heading, s),
        elevOf: (s) => lut(Y, s),
        curvOf: (s) => lut(kT, s),
        gradeOf: (s) => lut(grT, s),
        bankOf: (s) => lut(bkT, s),
        // step fields: floor-sample so a hole starts exactly where it is —
        // rounding would give the gap a 0.25 m lip-side lookahead that eats
        // the kicker before the lip can fire
        halfWidthOf: (s) => (s < 0 || s >= len ? 0 : wT[Math.floor(s / DS + 1e-9)]),
        gapAt: (s) => (s < 0 || s >= len ? 1 : gapT[Math.floor(s / DS + 1e-9)]),
        moverAt: (s) => (s < 0 || s >= len ? -1 : movT[Math.floor(s / DS + 1e-9)]),
        // world point of (s,u) with banking: +u is right of travel; bank > 0
        // raises the +u edge. THIS is the bridge: sim and renderer share it.
        pointOf(s, u, yOff = 0) {
            const h0 = lut(heading, s)
            const cx = lut(X, s)
            const cy = lut(Y, s)
            const cz = lut(Z, s)
            const b = lut(bkT, s)
            const fx = Math.sin(h0)
            const fz = Math.cos(h0)
            const rx = Math.cos(h0)
            const rz = -Math.sin(h0)
            return {
                x: cx + rx * u * Math.cos(b),
                y: cy + u * Math.sin(b) + yOff,
                z: cz + rz * u * Math.cos(b),
                fx, fy: 0, fz,
                rx, rz,
                bank: b,
                heading: h0,
            }
        },
    }
    return course
}

// deck center for a mover at time t — one function, both sides of the bridge
export function moverDeck(course, mi, t) {
    const m = course.movers[mi]
    return { u: m.A * Math.sin(m.omega * t + m.phase), w: m.w }
}

// bar center for a sweeper at time t — the same sine as moverDeck, on the
// side of the bridge that must NOT be there. Renderer and sim share it.
export function sweeperBar(course, si, t) {
    const sw = course.sweepers[si]
    return sw.A * Math.sin(sw.omega * t + sw.phase)
}

// decorative cloud drift — cosmetic, never touches sim state (determinism law)
export function cloudDrift(seed, n) {
    const rnd = seedRng(seed)
    const out = []
    for (let i = 0; i < n; i++) {
        out.push({
            x: (rnd() - 0.5) * 420,
            y: 14 + rnd() * 46,
            z: (rnd() - 0.5) * 420,
            sc: 26 + rnd() * 58,
            v: 0.5 + rnd() * 1.1,
        })
    }
    return out
}
