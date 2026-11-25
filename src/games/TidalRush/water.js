// TIDAL RUSH — water.js: THE BAY IS THIS TABLE.
//
// One analytic Gerstner swell field is the single source of truth for the
// whole game: the CPU samples it to float, pitch, roll and launch the hull
// (sim.js), and the very same numbers are pushed into the vertex shader every
// frame (seaGLSL + seaUniforms) that displaces the rendered mesh. What you
// ride is exactly what you draw — the issue's core demand (#3104: "the
// physics reading the same surface the renderer draws").
//
// Rung 2 made the table a VALUE, not a constant: `sunnySea()` is the still
// water of rung 1, `stormSea(seed, lap)` re-rolls the swell lap to lap
// (Wave Race 64's storm signature), and `lerpSea()` blends one into the
// other over a second. The shader carries the live table in six uniforms per
// slot × four unrolled slots — fully unrolled because `vec4[N](…)` array
// constructors are not GLSL ES 1.00 and SwiftShader (CI Chrome) rejects them
// (#3134 lesson).
//
// Pure module: Node + browser, zero deps, no clock reads. `t` rides in as
// world seconds; determinism stays with the caller. Sea tables are plain
// JSON-safe arrays, so snapshot/restore copies the ocean byte-exact too.

export const G_GRAV = 9.81

// Deep-water dispersion: omega = sqrt(g*k). Every wave computes its own
// frequency from its wavelength — the field is physically consistent, so the
// long swell arrives before the short chop, like it does on a real bay.
export const wavenumber = (len) => (Math.PI * 2) / len
export const omega = (len) => Math.sqrt(G_GRAV * wavenumber(len))

// SUNNY BAY sea state: a dominant SW swell, a cross chop, ripples on top.
// dir is the travel direction (unit), amp in metres, len in metres, steepness
// shares sum < 1 so no crest ever overhangs — foam marks the tops.
export const WAVES = [
    { dx: -0.87, dz: 0.50, amp: 1.35, len: 38.0, steep: 0.42, phase: 0.00 },
    { dx: -0.55, dz: -0.84, amp: 0.65, len: 26.0, steep: 0.30, phase: 1.90 },
    { dx: 0.35, dz: 0.94, amp: 0.30, len: 15.0, steep: 0.22, phase: 4.10 },
    { dx: 0.98, dz: -0.20, amp: 0.12, len: 8.5, steep: 0.16, phase: 2.35 },
]

export const N_SLOTS = 4

// Attach the derived constants (k, omega, Gerstner displacement weight) to a
// raw table. Every consumer — CPU sampling, uniforms, checks — reads these
// derived fields, so a table can never be half-baked.
export function deriveSea(raw) {
    return raw.map((w) => {
        const dl = Math.hypot(w.dx, w.dz) || 1
        const dx = w.dx / dl, dz = w.dz / dl
        const k = wavenumber(w.len)
        const om = omega(w.len)
        return { dx, dz, amp: w.amp, len: w.len, steep: w.steep, phase: w.phase, k, om, qa: w.steep * w.amp }
    })
}

// The rung-1 bay, as a table value. Byte-identical numbers to WAVES.
export function sunnySea() { return deriveSea(WAVES) }
const SUNNY = sunnySea()

// STORM BAY: re-rolled per lap. Base skeleton keeps the sunny field's shape
// (a dominant swell + cross chop + two short seas) but every lap grows the
// main swell and rotates the directions, so lap 3 is another sea. Seeded
// mulberry32 — the whole storm is a pure function of (seed, lap).
export function stormSea(seed, lap) {
    let s = ((seed >>> 0) ^ Math.imul(lap, 0x9e3779b1)) >>> 0
    const rnd = () => {
        s = (s + 0x6d2b79f5) >>> 0
        let t = s
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const BASE = [
        { dx: -0.87, dz: 0.50, amp: 1.75, len: 44.0, steep: 0.44 },
        { dx: -0.55, dz: -0.84, amp: 1.05, len: 27.0, steep: 0.30 },
        { dx: 0.35, dz: 0.94, amp: 0.62, len: 17.0, steep: 0.24 },
        { dx: 0.98, dz: -0.20, amp: 0.34, len: 10.0, steep: 0.18 },
    ]
    const grow = 1 + (lap - 1) * 0.12 // lap 3 rides a third taller than lap 1
    const raw = BASE.map((b) => {
        const rot = (rnd() - 0.5) * 0.9 // heading of the swell wanders up to ±26°
        const c = Math.cos(rot), sn = Math.sin(rot)
        return {
            dx: b.dx * c - b.dz * sn,
            dz: b.dx * sn + b.dz * c,
            amp: b.amp * grow * (0.85 + rnd() * 0.3),
            len: b.len * (0.85 + rnd() * 0.3),
            steep: b.steep * (0.9 + rnd() * 0.2),
            phase: rnd() * Math.PI * 2,
        }
    })
    // keep the Gerstner sum shy of overhang: scale steepness if crests crowd
    let qk = 0
    for (const w of raw) qk += w.steep * w.amp * wavenumber(w.len)
    if (qk > 0.55) { const s2 = 0.55 / qk; for (const w of raw) w.steep *= s2 }
    return deriveSea(raw)
}

// Blend two tables (must be same slot count). Directions renormalise so the
// field stays honest mid-transition; k/omega derive from the blended len.
export function lerpSea(a, b, k) {
    return a.map((w, i) => {
        const o = b[i]
        let dx = w.dx + (o.dx - w.dx) * k
        let dz = w.dz + (o.dz - w.dz) * k
        const dl = Math.hypot(dx, dz) || 1
        dx /= dl; dz /= dl
        return deriveSea([{
            dx, dz,
            amp: w.amp + (o.amp - w.amp) * k,
            len: w.len + (o.len - w.len) * k,
            steep: w.steep + (o.steep - w.steep) * k,
            phase: w.phase + (o.phase - w.phase) * k,
        }])[0]
    })
}

// Signed surface height (metres) at nominal (x, z) and time t, plus the
// horizontal Gerstner drift so crest lines crowd (and foam reads thicker) on
// the forward face — the CPU integrates the SAME expression.
export function waterHeight(x, z, t, sea = SUNNY) {
    let y = 0
    let hx = 0
    let hz = 0
    for (let i = 0; i < sea.length; i++) {
        const w = sea[i]
        const f = w.k * (w.dx * x + w.dz * z) - w.om * t + w.phase
        const s = Math.sin(f)
        const c = Math.cos(f)
        y += w.amp * s
        hx += w.qa * w.dx * c
        hz += w.qa * w.dz * c
    }
    return { y, dx: hx, dz: hz }
}

// Height only (the common hot path in the sim).
export function heightAt(x, z, t, sea = SUNNY) {
    let y = 0
    for (let i = 0; i < sea.length; i++) {
        const w = sea[i]
        y += w.amp * Math.sin(w.k * (w.dx * x + w.dz * z) - w.om * t + w.phase)
    }
    return y
}

// Vertical velocity of the surface at (x, z): dY/dt of the same sum. The hull
// rides a crest down by matching this; a crest that drops past LAUNCH_VY while
// the craft carries speed is a kicker — the craft flies.
export function surfaceVy(x, z, t, sea = SUNNY) {
    let vy = 0
    for (let i = 0; i < sea.length; i++) {
        const w = sea[i]
        vy += -w.amp * w.om * Math.cos(w.k * (w.dx * x + w.dz * z) - w.om * t + w.phase)
    }
    return vy
}

// Numerical surface normal (cheap, exact enough for hull attitude on CPU).
export function surfaceNormal(x, z, t, sea = SUNNY) {
    const e = 0.6
    const hl = heightAt(x - e, z, t, sea)
    const hr = heightAt(x + e, z, t, sea)
    const hd = heightAt(x, z - e, t, sea)
    const hu = heightAt(x, z + e, t, sea)
    const nx = hl - hr
    const nz = hd - hu
    const ny = 2 * e
    const inv = 1 / Math.hypot(nx, ny, nz)
    return { x: nx * inv, y: ny * inv, z: nz * inv }
}

// Crest height threshold for whitening foam (sunny bay reads mostly clean).
export const CREST_FOAM = 0.78

// --- rung 3: the SQUALL FRONT -------------------------------------------------
// Rung 2 re-rolled the storm swell as an instant whole-bay blend. Rung 3 makes
// the new swell TRAVEL: a band `FRONT_BAND` metres wide sweeps along the new
// sea's travel direction at squall speed; behind it lies the new sea, ahead of
// it the old, and every consumer (hull sampling on CPU, vertex shader on GPU)
// cross-fades the two tables by the SAME weight — drawn ≡ ridden now holds
// across the front, not just within one table. #3323 made that cross-fade
// PER WAVE (equal-power √ gains, see frontGains): the band beats like a real
// crossing sea instead of flattening both swells at once.
//
// `front.h` is the ellipse half-span along the travel direction, so the front
// starts fully off the bay (origin at −h·dir) and finishes fully across it.
// Squall speed (26 m/s) is deliberately faster than physical group velocity so
// the shift resolves inside a lap — race pacing beats textbook dispersion, and
// the README says so.
export const FRONT_BAND = 34
export const FRONT_SPEED = 26

export function frontSpan(dx, dz, rx, rz) { return Math.hypot(dx * rx, dz * rz) }

// A front aimed along the dominant swell of `sea`, covering bay radii rx/rz.
export function makeFront(sea, rx, rz) {
    const w = sea[0]
    return { dx: w.dx, dz: w.dz, h: frontSpan(w.dx, w.dz, rx, rz), prog: 0, band: FRONT_BAND }
}

// Weight of the NEW sea at (x, z) — 1 behind the advancing front (the sea it
// has already crossed, measured along the travel direction), 0 ahead of it,
// smoothstep inside the band. `fr` null/undefined ⇒ no front (pure old sea).
// The GLSL `frontWeight` below is the byte-for-byte twin of this function.
export function frontW(x, z, fr) {
    if (!fr) return 0
    const d = x * fr.dx + z * fr.dz + fr.h
    let t = ((fr.prog + 0.5 * fr.band) - d) / fr.band
    t = t < 0 ? 0 : t > 1 ? 1 : t
    return t * t * (3 - 2 * t)
}

// #3323 PER-WAVE CROSS-FADE — the band BEATS. Mixing two whole-bay tables by
// weight (a + (b − a)·w) is a convex blend: inside the band both swells shrink
// at once and the surface can never exceed either table — real crossing seas do
// exactly the opposite. They superpose at full phase and BEAT (crests stack
// where they align, patches go glassy where they oppose), and wave energy
// transfers in POWER (amp²), not linearly. So per slot the outgoing wave decays
// at ga = √(1−w) and its incoming partner rises at gb = √w — equal power
// (ga² + gb² ≡ 1), both summed at their OWN phases. Edges unchanged: w ≤ 0 is
// table A, w ≥ 1 is table B, byte-exact; the GLSL twin below mirrors this
// scaling, term for term, in the same order.
export function frontGains(w) {
    return { ga: Math.sqrt(1 - w), gb: Math.sqrt(w) }
}
export function mixHeight(x, z, t, a, b, w) {
    if (w <= 0) return heightAt(x, z, t, a)
    if (w >= 1) return heightAt(x, z, t, b)
    const { ga, gb } = frontGains(w)
    let y = 0
    for (let i = 0; i < a.length; i++) {
        const u = a[i], v = b[i]
        y += u.amp * Math.sin(u.k * (u.dx * x + u.dz * z) - u.om * t + u.phase) * ga
        y += v.amp * Math.sin(v.k * (v.dx * x + v.dz * z) - v.om * t + v.phase) * gb
    }
    return y
}
export function mixVy(x, z, t, a, b, w) {
    if (w <= 0) return surfaceVy(x, z, t, a)
    if (w >= 1) return surfaceVy(x, z, t, b)
    const { ga, gb } = frontGains(w)
    let vy = 0
    for (let i = 0; i < a.length; i++) {
        const u = a[i], v = b[i]
        vy += -u.amp * u.om * Math.cos(u.k * (u.dx * x + u.dz * z) - u.om * t + u.phase) * ga
        vy += -v.amp * v.om * Math.cos(v.k * (v.dx * x + v.dz * z) - v.om * t + v.phase) * gb
    }
    return vy
}
export function mixWater(x, z, t, a, b, w) {
    if (w <= 0) return waterHeight(x, z, t, a)
    if (w >= 1) return waterHeight(x, z, t, b)
    const { ga, gb } = frontGains(w)
    let y = 0, hx = 0, hz = 0
    for (let i = 0; i < a.length; i++) {
        const u = a[i], v = b[i]
        const fa = u.k * (u.dx * x + u.dz * z) - u.om * t + u.phase
        const fb = v.k * (v.dx * x + v.dz * z) - v.om * t + v.phase
        y += u.amp * Math.sin(fa) * ga; y += v.amp * Math.sin(fb) * gb
        hx += u.qa * u.dx * Math.cos(fa) * ga; hx += v.qa * v.dx * Math.cos(fb) * gb
        hz += u.qa * u.dz * Math.cos(fa) * ga; hz += v.qa * v.dz * Math.cos(fb) * gb
    }
    return { y, dx: hx, dz: hz }
}

// Uniform names the shader declares — one set per slot. tidalcheck parses
// seaGLSL() for these and asserts the live sea maps into them exactly, so
// "drawn sea ≡ ridden sea" holds for EVERY table, not just the sunny one.
export const SEA_UNIFORMS = []
for (let i = 0; i < N_SLOTS; i++) SEA_UNIFORMS.push(`uDir${i}`, `uK${i}`, `uO${i}`, `uA${i}`, `uQ${i}`, `uPh${i}`)

// The rung-3 sets: `B` carries the second (incoming) table; `uF*` the front.
export const SEA_UNIFORMS_B = SEA_UNIFORMS.map((n) => n + 'B')
export const FRONT_UNIFORMS = ['uFN', 'uFP', 'uFH', 'uFW']

// Map a live sea table onto those uniform values. This single function is the
// whole CPU→GPU bridge; the checks re-derive it and compare field by field.
// `suffix` picks the A set ('', byte-identical to rung 2) or the B set ('B').
export function seaUniforms(sea, suffix = '') {
    const u = {}
    for (let i = 0; i < N_SLOTS; i++) {
        const w = sea[i]
        u[`uDir${i}${suffix}`] = [w.dx, w.dz]
        u[`uK${i}${suffix}`] = w.k
        u[`uO${i}${suffix}`] = w.om
        u[`uA${i}${suffix}`] = w.amp
        u[`uQ${i}${suffix}`] = w.qa
        u[`uPh${i}${suffix}`] = w.phase
    }
    return u
}

// Front → uniforms. An inactive front (null) parks the band far off-bay so the
// weight is 0 everywhere — the bay rides the A table untouched (sunny days,
// pre-shift storm).
export function frontUniforms(fr) {
    if (!fr) return { uFN: [0, 1], uFP: -1e4, uFH: 0, uFW: 1 }
    return { uFN: [fr.dx, fr.dz], uFP: fr.prog, uFH: fr.h, uFW: fr.band }
}

// The GLSL chunk: declares the slot uniforms, four fully-unrolled Gerstner
// terms — same loop ORDER as waterHeight, same arithmetic, values at runtime.
// One Gerstner slot term at a time; `hVar`/`dVar` name the accumulators so the
// A-set, B-set and single-table variants share the exact arithmetic.
function unroll(prefix, hVar = 'h', dVar = 'disp') {
    const lines = []
    for (let i = 0; i < N_SLOTS; i++) {
        lines.push(
            `  f = uK${i}${prefix} * (uDir${i}${prefix}.x * pos.x + uDir${i}${prefix}.y * pos.y) - uO${i}${prefix} * uT + uPh${i}${prefix};`,
            `  ${hVar} += uA${i}${prefix} * sin(f);`,
            `  ${dVar} += uQ${i}${prefix} * uDir${i}${prefix} * cos(f);`,
        )
    }
    return lines
}
function declare(prefix) {
    const decl = []
    for (let i = 0; i < N_SLOTS; i++) decl.push(`uniform vec2 uDir${i}${prefix}; uniform float uK${i}${prefix}, uO${i}${prefix}, uA${i}${prefix}, uQ${i}${prefix}, uPh${i}${prefix};`)
    return decl
}

export function seaGLSL() {
    return `
${declare('').join('\n')}
float waveHeight(vec2 pos, float uT, out vec2 disp) {
  float h = 0.0; disp = vec2(0.0); float f;
${unroll('').join('\n')}
  return h;
}`
}

// Rung-3 chunk: two unrolled table sets + the squall front. `frontWeight` is
// the GLSL twin of frontW() — same clamp, same smoothstep, same order. #3323:
// `heightFront` is the per-wave equal-power cross-fade — slot i of the outgoing
// table scaled by wa = sqrt(1−w), slot i of the incoming by wb = sqrt(w), the
// eight terms summed at their OWN phases in the exact CPU order (A_i then B_i
// per slot). Same terms, same order, same scaling — heightFront ≡ mixHeight(),
// vertex for vertex, wave for wave, beating included.
export function seaGLSLFront() {
    const terms = []
    for (let i = 0; i < N_SLOTS; i++) {
        terms.push(
            `  f = uK${i} * (uDir${i}.x * pos.x + uDir${i}.y * pos.y) - uO${i} * uT + uPh${i};`,
            `  h += uA${i} * sin(f) * wa;`,
            `  d += uQ${i} * uDir${i} * cos(f) * wa;`,
            `  f = uK${i}B * (uDir${i}B.x * pos.x + uDir${i}B.y * pos.y) - uO${i}B * uT + uPh${i}B;`,
            `  h += uA${i}B * sin(f) * wb;`,
            `  d += uQ${i}B * uDir${i}B * cos(f) * wb;`,
        )
    }
    return `
${declare('').join('\n')}
${declare('B').join('\n')}
uniform vec2 uFN; uniform float uFP, uFH, uFW;
float frontWeight(vec2 pos) {
  float d = dot(pos, uFN) + uFH;
  float t = clamp(((uFP + 0.5 * uFW) - d) / uFW, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
float heightFront(vec2 pos, float uT, out vec2 disp) {
  float h = 0.0; vec2 d = vec2(0.0); float f;
  float w = frontWeight(pos);
  float wa = sqrt(1.0 - w); float wb = sqrt(w);
${terms.join('\n')}
  disp = d;
  return h;
}
float waveHeight(vec2 pos, float uT, out vec2 disp) { return heightFront(pos, uT, disp); }`
}

// rung-1 name kept as an alias (checks/README reference it)
export const waterGLSL = seaGLSL
