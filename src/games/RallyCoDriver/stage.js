// RALLY CO-DRIVER STAGE (#1251) — a seeded ribbon of night road with REAL
// elevation, so crests genuinely hide the next corner. Pure: Node (rallycheck)
// and the browser import the same math; no DOM, no clock, no Math.random.
//
// The stage is a CLOSED loop parameterized by arc length s in [0, L):
//   x(s) = R0 + Σ a_k·sin(f_k·s/L + p_k)     y(s) = R0 + Σ b_k·cos(f_k·s/L + q_k)
// with distinct integer harmonics (the curve closes exactly) and amplitudes
// well under R0/3, so the ribbon waves like a real stage but never crosses
// itself. Elevation is an independent seeded harmonic sum along s — the hills
// are NOT the corners, which is what makes the crests honest: you can crest a
// hill into a flat straight, or attack a corner down a slope.
//
// Corners: local maxima of |curvature| above a median gate, separated by a
// minimum gap; each carries dir (±1, left/right of travel) and sev (1-3 by
// peak magnitude thirds). The co-driver's notes are exactly this list — the
// CPU co-driver is honest by construction, and a human co-driver is judged
// against it (rallycheck pins both).

const TAU = Math.PI * 2

export function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export const STAGE_L = 9000      // stage length in road units
export const N = 1800            // samples (one per 5 units)
export const ROAD_HALF = 26      // asphalt half-width
export const SHOULDER = 14       // gravel beyond the asphalt, each side
export const EYE = 14            // driver's eye height above the road
export const FOG_RANGE = 430     // hard fog wall, even over flat ground

// makeStage(seed) → { L, N, x[], y[], h[], e[], len, corners }
// x/y/h sampled per N, e the elevation per N, corners [{ s, dir, sev }].
// Deterministic seeded shuffle (#1251): Fisher–Yates driven by rng. This MUST
// NOT be `[...].sort(() => rng() - 0.5)` — a random comparator is not a valid
// (transitive) ordering, so the number of comparisons — and therefore how many
// rng() draws the seed consumes — depends on V8's sort algorithm, which changes
// when the function JIT-tiers-up after warm-up. That made makeStage(seed) yield
// different geometry by call-ordinal, breaking the whole contract's determinism.
// Fisher–Yates fixes the rng-call count to exactly pool.length-1 per shuffle.
function shuffleInPlace(rng, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t
    }
    return arr
}

export function makeStage(seed) {
    const rng = mulberry32(seed)
    const R0 = 2600
    // shape harmonics: distinct integer frequencies 2..5 (closes exactly),
    // amplitudes bounded so the loop cannot self-intersect.
    const freqs = shuffleInPlace(rng, [2, 3, 4, 5]).slice(0, 3)
    // a gentle high-frequency detail harmonic: the three base harmonics give
    // only ~7-9 corner zones per loop (seed-proven), and the co-driver's job
    // needs >= 10 per lap. Small amplitude keeps the macro shape honest.
    const hf = 6 + Math.floor(rng() * 4) // 6..9, distinct from freqs (2..5)
    const hfx = R0 * (0.05 + 0.05 * rng()), hfy = R0 * (0.05 + 0.05 * rng())
    const hpx = rng() * TAU, hpy = rng() * TAU
    // a second, finer detail harmonic (10..13): it adds small but real bumps
    // so no seed can coast under the corner floor even when the phases cancel
    const hf2 = 10 + Math.floor(rng() * 4)
    const hf2x = R0 * (0.03 + 0.02 * rng()), hf2y = R0 * (0.03 + 0.02 * rng())
    const hf2px = rng() * TAU, hf2py = rng() * TAU
    const ax = [], ay = [], bx = [], by = []
    const px = [], py = [], qx = [], qy = []
    for (let k = 0; k < 3; k++) {
        ax.push(R0 * (0.10 + 0.10 * rng()))
        ay.push(R0 * (0.10 + 0.10 * rng()))
        bx.push(R0 * (0.10 + 0.10 * rng()))
        by.push(R0 * (0.10 + 0.10 * rng()))
        px.push(rng() * TAU); py.push(rng() * TAU)
        qx.push(rng() * TAU); qy.push(rng() * TAU)
    }
    // elevation harmonics: independent frequencies 2..7, amplitudes 30..70 —
    // big enough that crests genuinely eat the line of sight (rallycheck
    // proves at least one corner is hidden at its crest)
    const ef = shuffleInPlace(rng, [2, 3, 5, 6, 7]).slice(0, 3)
    const ea = [], ep = []
    for (let k = 0; k < 3; k++) { ea.push(30 + 40 * rng()); ep.push(rng() * TAU) }

    const x = new Float64Array(N), y = new Float64Array(N), h = new Float64Array(N), e = new Float64Array(N)
    const ds = STAGE_L / N
    for (let i = 0; i < N; i++) {
        const s = i * ds
        let xx = R0, yy = R0, ee = 0
        for (let k = 0; k < 3; k++) {
            const w = freqs[k] * (s / STAGE_L) * TAU
            xx += ax[k] * Math.sin(w + px[k])
            yy += ay[k] * Math.cos(w + py[k])
            xx += bx[k] * Math.sin(freqs[(k + 1) % 3] * (s / STAGE_L) * TAU + qx[k])
            yy += by[k] * Math.cos(freqs[(k + 2) % 3] * (s / STAGE_L) * TAU + qy[k])
        }
        const wh = hf * (s / STAGE_L) * TAU
        xx += hfx * Math.sin(wh + hpx)
        yy += hfy * Math.cos(wh + hpy)
        const wh2 = hf2 * (s / STAGE_L) * TAU
        xx += hf2x * Math.sin(wh2 + hf2px)
        yy += hf2y * Math.cos(wh2 + hf2py)
        for (let k = 0; k < 3; k++) ee += ea[k] * Math.sin(ef[k] * (s / STAGE_L) * TAU + ep[k])
        x[i] = xx; y[i] = yy; e[i] = ee
    }
    // headings + curvature (per unit), smoothed over a 9-sample window
    const raw = new Float64Array(N)
    for (let i = 0; i < N; i++) {
        const i0 = (i - 1 + N) % N, i1 = (i + 1) % N
        const tx = x[i1] - x[i0], ty = y[i1] - y[i0]
        h[i] = Math.atan2(ty, tx)
    }
    for (let i = 0; i < N; i++) {
        const i0 = (i - 1 + N) % N, i1 = (i + 1) % N
        let d = h[i1] - h[i0]
        while (d > Math.PI) d -= TAU
        while (d < -Math.PI) d += TAU
        raw[i] = d / (2 * ds)
    }
    const k = new Float64Array(N)
    for (let i = 0; i < N; i++) {
        let sum = 0
        for (let w = -4; w <= 4; w++) sum += raw[(i + w + N) % N]
        k[i] = sum / 9
    }
    // corners: peaks of |k| above a gate, min gap L/40, severity by thirds
    const abs = Array.from(k, Math.abs)
    const sorted = [...abs].sort((a, b) => a - b)
    const gate = Math.max(sorted[Math.floor(N * 0.86)], 0.0011)
    const MIN_GAP = N / 40
    const peaks = []
    for (let i = 0; i < N; i++) {
        if (abs[i] < gate) continue
        const im = (i - 1 + N) % N, ip = (i + 1) % N
        if (abs[i] < abs[im] || abs[i] < abs[ip]) continue
        if (peaks.length && i - peaks[peaks.length - 1] < MIN_GAP) {
            if (abs[i] > abs[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i
            continue
        }
        peaks.push(i)
    }
    // too few corners (flat lucky seed): relax the gate until we have >= 10,
    // and the flatness floor descends as it relaxes — a corner with |k| as
    // low as 0.0002 still earns a note (the lead distance doesn't change
    // with magnitude), so the note stays honest. A "corner" under that is
    // a straight wearing a hat.
    let relax = 1
    while (peaks.length < 10 && relax < 40) {
        relax++
        const g2 = Math.max(gate * (1 - relax * 0.06), 0.0008 - relax * 0.00004)
        peaks.length = 0
        for (let i = 0; i < N; i++) {
            if (abs[i] < g2) continue
            const im = (i - 1 + N) % N, ip = (i + 1) % N
            if (abs[i] < abs[im] || abs[i] < abs[ip]) continue
            if (peaks.length && i - peaks[peaks.length - 1] < MIN_GAP) {
                if (abs[i] > abs[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i
                continue
            }
            peaks.push(i)
        }
    }
    // severity: sort peaks by magnitude, thirds → 1/2/3
    const pmag = peaks.map((i) => abs[i]).sort((a, b) => a - b)
    const t1 = pmag.length ? pmag[Math.floor(pmag.length / 3)] : 0
    const t2 = pmag.length ? pmag[Math.floor((2 * pmag.length) / 3)] : 0
    const corners = peaks.map((i) => ({
        s: i * ds,
        dir: k[i] < 0 ? -1 : 1,
        sev: abs[i] <= t1 ? 1 : abs[i] <= t2 ? 2 : 3,
    }))
    return { L: STAGE_L, N, x, y, h, e, k, len: STAGE_L, corners, ds }
}

// kappaAt(st, s) → signed curvature (per unit) at arc length s (interpolated)
export function kappaAt(st, s) {
    const f = (((s % st.L) + st.L) % st.L) / st.ds
    const i = Math.floor(f) % st.N
    const i1 = (i + 1) % st.N
    const t = f - Math.floor(f)
    return st.k[i] + (st.k[i1] - st.k[i]) * t
}

// stageAt(st, s) → { x, y, heading, elev } at arc length s (wraps, interpolates)
export function stageAt(st, s) {
    const L = st.L
    s = ((s % L) + L) % L
    const f = s / st.ds
    const i = Math.floor(f) % st.N
    const i1 = (i + 1) % st.N
    const t = f - Math.floor(f)
    // heading: interpolate the angle, not the wrap-prone value
    let dh = st.h[i1] - st.h[i]
    while (dh > Math.PI) dh -= TAU
    while (dh < -Math.PI) dh += TAU
    return {
        x: st.x[i] + (st.x[i1] - st.x[i]) * t,
        y: st.y[i] + (st.y[i1] - st.y[i]) * t,
        heading: st.h[i] + dh * t,
        elev: st.e[i] + (st.e[i1] - st.e[i]) * t,
    }
}

export function elevAt(st, s) {
    return stageAt(st, s).elev
}

// distAhead(st, s0, s1) — forward road distance from s0 to s1 (0..L)
export function distAhead(st, s0, s1) {
    const d = (((s1 - s0) % st.L) + st.L) % st.L
    return d
}

// visibleAhead(st, s0, range) → max visible forward distance (units).
// A point d ahead is visible while the sightline from the driver's eye to
// that point's road level clears every intermediate sample. This is what
// makes a crest honest: the road simply does not exist on the screen past
// the first hill that eats the line of sight.
export function visibleAhead(st, s0, range = FOG_RANGE) {
    const h0 = elevAt(st, s0) + EYE
    const STEP = 4
    let maxD = 0
    for (let d = STEP; d <= range; d += STEP) {
        const s1 = s0 + d
        const h1 = elevAt(st, s1)
        let occluded = false
        // march the sightline; the sightline to the TARGET is the question,
        // and the target is the road level at s1 (the driver looks at road)
        for (let t = 8; t < d; t += 8) {
            const hLine = h0 + (h1 - h0) * (t / d)
            if (elevAt(st, s0 + t) > hLine + 1.5) { occluded = true; break }
        }
        if (occluded) break
        maxD = d
    }
    return maxD
}

// cornerAhead(st, s0, look) → [ { s, dir, sev, d } ] upcoming corners within
// `look` units, nearest first. The co-driver's corner list and the CPU
// driver's eyes both read through this one function.
export function cornerAhead(st, s0, look = 1200) {
    const out = []
    for (const c of st.corners) {
        const d = distAhead(st, s0, c.s)
        if (d <= look) out.push({ s: c.s, dir: c.dir, sev: c.sev, d })
    }
    out.sort((a, b) => a.d - b.d)
    return out
}
