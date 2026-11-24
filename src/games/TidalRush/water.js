// TIDAL RUSH — water.js: THE BAY IS THIS TABLE.
//
// One analytic Gerstner swell field is the single source of truth for the
// whole game: the CPU samples it to float, pitch, roll and launch the hull
// (sim.js), and the very same numbers are emitted into the vertex shader
// (waterGLSL) that displaces the rendered mesh. What you ride is exactly what
// you draw — the issue's core demand (#3104: "the physics reading the same
// surface the renderer draws").
//
// Pure module: Node + browser, zero deps, no clock reads. `t` rides in as
// world seconds; determinism stays with the caller.

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

// Precompute k / omega / phase-speed constants once per table.
const K = WAVES.map((w) => {
    const k = wavenumber(w.len)
    const om = omega(w.len)
    return { k, om, c: om / k, qa: w.steep * w.amp, nx: w.dx, nz: w.dz, amp: w.amp, ph: w.phase }
})

// Signed surface height (metres) at nominal (x, z) and time t. Horizontal
// Gerstner drift is included so crest lines crowd (and foam reads thicker)
// on the forward face — the CPU integrates the SAME expression.
export function waterHeight(x, z, t) {
    let y = 0
    let hx = 0
    let hz = 0
    for (let i = 0; i < K.length; i++) {
        const w = K[i]
        const f = w.k * (w.nx * x + w.nz * z) - w.om * t + w.ph
        const s = Math.sin(f)
        const c = Math.cos(f)
        y += w.amp * s
        hx += w.qa * w.nx * c
        hz += w.qa * w.nz * c
    }
    return { y, dx: hx, dz: hz }
}

// Height only (the common hot path in the sim).
export function heightAt(x, z, t) {
    let y = 0
    for (let i = 0; i < K.length; i++) {
        const w = K[i]
        y += w.amp * Math.sin(w.k * (w.nx * x + w.nz * z) - w.om * t + w.ph)
    }
    return y
}

// Vertical velocity of the surface at (x, z): dY/dt of the same sum. The hull
// rides a crest down by matching this; a crest that drops past LAUNCH_VY while
// the craft carries speed is a kicker — the craft flies.
export function surfaceVy(x, z, t) {
    let vy = 0
    for (let i = 0; i < K.length; i++) {
        const w = K[i]
        vy += -w.amp * w.om * Math.cos(w.k * (w.nx * x + w.nz * z) - w.om * t + w.ph)
    }
    return vy
}

// Numerical surface normal (cheap, exact enough for hull attitude on CPU).
export function surfaceNormal(x, z, t) {
    const e = 0.6
    const hl = heightAt(x - e, z, t)
    const hr = heightAt(x + e, z, t)
    const hd = heightAt(x, z - e, t)
    const hu = heightAt(x, z + e, t)
    const nx = hl - hr
    const nz = hd - hu
    const ny = 2 * e
    const inv = 1 / Math.hypot(nx, ny, nz)
    return { x: nx * inv, y: ny * inv, z: nz * inv }
}

// Crest height threshold for whitening foam (sunny bay reads mostly clean).
export const CREST_FOAM = 0.78

// The GLSL chunk: generated FROM WAVES so the shader can never drift from the
// CPU field. Same loop order, same constants, same arithmetic order.
export function waterGLSL() {
    const lines = ['// generated from water.js WAVES — do not hand-edit']
    for (const w of WAVES) {
        const k = wavenumber(w.len).toFixed(6)
        const om = omega(w.len).toFixed(6)
        lines.push(
            `  f = ${k} * (${w.dx.toFixed(4)} * pos.x + ${w.dz.toFixed(4)} * pos.y) - ${om} * uT + ${w.phase.toFixed(4)};`,
            `  h += ${w.amp.toFixed(4)} * sin(f);`,
            `  disp += vec2(${(w.steep * w.amp * w.dx).toFixed(6)}, ${(w.steep * w.amp * w.dz).toFixed(6)}) * cos(f);`,
        )
    }
    return `
float waveHeight(vec2 pos, float uT, out vec2 disp) {
  float h = 0.0; disp = vec2(0.0); float f;
${lines.join('\n')}
  return h;
}`
}
