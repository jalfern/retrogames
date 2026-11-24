// SKYWARD — the island. Pure, seed-deterministic: this file is the ONE surface
// truth. terrainHeight()/waterHeightAt() answer for the sim (ground clearance,
// wave skim, the swell the belt rides) AND for the renderer (the same Gerstner
// table is emitted into the water vertex shader, the terrain mesh is baked from
// terrainHeight). What you fly over is exactly what you draw — the forge's ocean
// lesson (ocean/SHORE demos, #3104) lifted into the air.

export const G = 9.81

// mulberry32 — the family's seeded RNG (same generator as the other games)
function mulberry32(a) {
    return function () {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// --- seeded value noise ------------------------------------------------------
function noiseFactory(seed) {
    const s = seed >>> 0
    const hash2 = (x, y) => {
        let h = Math.imul(Math.round(x * 57) ^ Math.round(y * 91) ^ s, 0x27d4eb2d)
        h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b)
        h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35)
        h ^= h >>> 16
        return (h >>> 0) / 4294967296
    }
    return function fbm(x, y, oct = 4) {
        let a = 0.5, acc = 0
        for (let i = 0; i < oct; i++) {
            const ix = Math.floor(x), iy = Math.floor(y)
            const fx = x - ix, fy = y - iy
            const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
            const n00 = hash2(ix, iy), n10 = hash2(ix + 1, iy)
            const n01 = hash2(ix, iy + 1), n11 = hash2(ix + 1, iy + 1)
            acc += a * (n00 + (n10 - n00) * ux + (n01 - n00) * uy + (n00 - n10 - n01 + n11) * ux * uy)
            x = x * 2.13 + 5.1; y = y * 2.13 + 1.7
            a *= 0.5
        }
        return acc
    }
}

const bell = (d, r) => Math.exp(-(d * d) / (r * r) * 1.6)

// --- island: Gullwing Isle ---------------------------------------------------
// Two volcanic cores joined by a saddle, an east cape, and a school flat on the
// southern beach. Anything below 0 is the sea floor; the coast is where h = 0.
export function makeWorld(seed) {
    const fbm = noiseFactory(seed)
    const r = seed >>> 0
    // steady sea-breeze drift — the sim's only global wind, from the seed
    const wind = { x: ((r & 255) / 255 - 0.5) * 4.4, z: (((r >>> 8) & 255) / 255 - 0.5) * 4.4 }

    // course layout first: the terrain carves flats for these exact spots
    const rings = []
    for (let i = 0; i < 8; i++) {
        rings.push({
            x: Math.round(Math.sin(i * 0.95 + ((r & 15) / 15) * 0.5) * 118),
            y: 11 + Math.round(4 * Math.sin(i * 1.25 + 0.6)),
            z: 470 + i * 66,
        })
    }
    const rng = mulberry32(seed ^ 0x5bf0)
    const targets = [
        { x: 196 + (rng() - 0.5) * 22, z: 30 + (rng() - 0.5) * 26 },
        { x: 226 + (rng() - 0.5) * 22, z: -80 + (rng() - 0.5) * 26 },
        { x: 168 + (rng() - 0.5) * 22, z: -180 + (rng() - 0.5) * 26 },
    ]
    const pad = { x: 60, z: 175 }          // spot-landing bullseye on the beach
    const school = { x: 0, z: 150 }       // dock + markers
    const launch = { x: -28, z: -120 }    // glider takeoff, off the saddle

    // The island: an explicit coastal shelf (never noise-dependent, so the
    // course spots are always dry) plus a volcano, ridges and fbm grain.
    function terrainHeight(x, z) {
        const rr = Math.hypot(x * 0.85, (z + 40) * 0.9)
        const land = clamp01((252 - rr) / 46)
        let h = -8 + 14 * land                       // sea floor → beach shelf
        h += 112 * bell(Math.hypot(x, z + 250), 175)     // north volcano
        h += 60 * bell(Math.hypot(x + 150, z + 60), 115)  // west ridge
        h += 46 * bell(Math.hypot(x - 170, z + 20), 105)  // east knuckle
        h += (fbm(x * 0.0065, z * 0.0065, 4) - 0.5) * 30 * land * land
        // carve the bay: soften the southern approach into a schoolyard
        h *= 1 - 0.5 * bell(x, 140) * bell(z - 150, 180)
        // explicit flats: school apron, the landing pad, the drop pads —
        // each with a WIDE gentle apron first so no step-wall catches a
        // low approach (a flat carved below the surrounding beach is a crater)
        h = flatW(h, x, z, school.x, school.z, 150, 4.0, 0.7)
        h = flat(h, x, z, school.x, school.z, 80, 2.8)
        h = flatW(h, x, z, pad.x, pad.z, 110, 3.6, 0.6)
        h = flat(h, x, z, pad.x, pad.z, 55, 2.6)
        for (const t of targets) { h = flatW(h, x, z, t.x, t.z, 46, 2.6, 0.5); h = flat(h, x, z, t.x, t.z, 16, 1.8) }
        // the supply route: a low corridor the belt can fly at mast height
        // from the dock to every target — carved as a smooth trench so no
        // hill ever stands between two waypoints
        {
            let ceil = 99
            const pts = [{ x: school.x + 30, z: school.z + 40 }, ...targets, { x: school.x + 30, z: school.z + 40 }]
            for (let i = 0; i < pts.length - 1; i++) {
                const d = distSeg(x, z, pts[i], pts[i + 1])
                const c = 3.4 + d * 0.5
                if (c < ceil) ceil = c
            }
            if (ceil < h) h = ceil
        }
        if (h < -26) h = -26
        return h
    }
    function distSeg(x, z, a, b) {
        const abx = b.x - a.x, abz = b.z - a.z
        const t = clamp01(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz))
        return Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t))
    }
    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }
    // squared-falloff flat carved around a spot; strong enough that the course
    // pads are always dry sand, never a coin-flip against the noise field
    function flat(h, x, z, cx, cz, rad, target) {
        const d = Math.hypot(x - cx, z - cz)
        if (d >= rad) return h
        const k = 1 - d / rad
        const w = k * k
        return h * (1 - w) + target * w
    }
    // a softer, wider flat at partial weight — the approach apron
    function flatW(h, x, z, cx, cz, rad, target, w0) {
        const d = Math.hypot(x - cx, z - cz)
        if (d >= rad) return h
        const k = 1 - d / rad
        const w = w0 * k * k
        return h * (1 - w) + target * w
    }

    // fair-weather thermals — the glider's elevator, under the cumuli.
    // Rung 2: the columns drift with the sea-breeze (til A) and breathe
    // side-to-side (til B); thermalPos(c, t) is the ONE answer — sim lift,
    // the autopilot's target and the painted cumulus all read it, so the
    // cloud you see is the lift you get.
    const thermals = [
        { x: -70, z: -110, r: 36, phase: 0.0 },
        { x: 55, z: -165, r: 32, phase: 2.1 },
        { x: -130, z: -185, r: 30, phase: 4.2 },
        { x: 120, z: -40, r: 30, phase: 1.1 },
    ]
    function thermalPos(c, t) {
        const drift = Math.sin(t * 0.021 + c.phase) * 12 + wind.x * Math.sin(t * 0.05 + c.phase * 0.7) * 1.6
        const dz = Math.cos(t * 0.017 + c.phase * 1.3) * 10 + wind.z * Math.sin(t * 0.05 + c.phase * 0.7) * 1.6
        return { x: c.x + drift, z: c.z + dz }
    }
    function thermalLift(x, z, t) {
        let lift = 0
        for (const c of thermals) {
            const p = thermalPos(c, t)
            const d = Math.hypot(x - p.x, z - p.z)
            if (d > c.r) continue
            const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.32 + c.phase))
            lift += 3.6 * bell(d, c.r * 0.72) * pulse
        }
        return lift
    }

    // the storm cell, east of the isle — gusts, a core downdraft, a rising edge
    const storm = { x: 560, z: -40, r: 300 }
    function stormAt(x, z, t) {
        const d = Math.hypot(x - storm.x, z - storm.z)
        if (d > storm.r * 1.25) return { s: 0, gust: { x: 0, z: 0 }, vy: 0 }
        const s = bell(d, storm.r)
        const ring = Math.abs(d - storm.r * 0.86) < 55 ? 1.4 : 0
        const gx = (fbm(x * 0.02 + t * 0.55, z * 0.02, 3) - 0.5) * 2
        const gz = (fbm(x * 0.02, z * 0.02 + t * 0.5, 3) - 0.5) * 2
        return { s, gust: { x: gx * 5.2 * s, z: gz * 5.2 * s }, vy: (ring * 1.9 - s * 2.2) }
    }
    // THUNDERPASS (rung 2): the storm as a course. Five gates drive through
    // the cell — in at the west edge (rising ring), dip the core downdraft,
    // out the east exit — placed from the cell itself so the line stays
    // aligned with the weather on every seed. All gates sit over open sea.
    const passStart = { x: storm.x - 352, z: storm.z - 30 }   // (208, −70)
    const passRings = [
        { x: storm.x - 240, y: 24, z: storm.z + 20 },   // rising west edge
        { x: storm.x - 115, y: 17, z: storm.z + 95 },    // into the downslant
        { x: storm.x + 15, y: 12, z: storm.z - 15 },     // the core — the dip
        { x: storm.x + 140, y: 22, z: storm.z - 100 },   // easing out
        { x: storm.x + 250, y: 28, z: storm.z - 30 },     // rising east exit
    ]

    function stormFlash(t) {
        const f = (t * 0.61 + (r & 1023) / 97) % 7
        return f < 0.05 ? 1 : f > 0.09 && f < 0.13 ? 0.55 : 0
    }

    // --- the swell: one Gerstner table for CPU and GPU ----------------------
    const waves = [
        { dx: 0.92, dz: 0.39, wl: 92, steep: 0.20 },
        { dx: -0.34, dz: 0.94, wl: 61, steep: 0.17 },
        { dx: 0.71, dz: -0.70, wl: 37, steep: 0.13 },
        { dx: -0.80, dz: -0.60, wl: 24, steep: 0.09 },
    ].map((w) => {
        const k = (Math.PI * 2) / w.wl
        return { ...w, k, c: Math.sqrt((G * w.wl) / (Math.PI * 2)), a: Math.min(w.steep / k, w.wl / 8) }
    })

    // swell damps where the sea shoals — depth from the same terrain field
    function damp(x, z) {
        const dep = -terrainHeight(x, z)
        if (dep > 6) return 1
        if (dep < 0) return 0.3
        return 0.3 + 0.7 * (dep / 6)
    }
    function waterHeightAt(x, z, t) {
        const d = damp(x, z)
        let y = 0
        for (const w of waves) {
            y += w.a * Math.sin(w.k * (w.dx * x + w.dz * z - w.c * t))
        }
        return y * d
    }
    function waterVy(x, z, t) {
        const d = damp(x, z)
        let vy = 0
        for (const w of waves) {
            vy += w.a * w.k * w.c * Math.cos(w.k * (w.dx * x + w.dz * z - w.c * t))
        }
        return vy * d
    }

    // the SAME table, as GLSL constants — the vertex shader displaces the mesh
    // with these exact numbers (hash-equal intent, the #3104 discipline).
    function waterGLSL() {
        // ES 1.00 portable: no array constructors — declare one const per wave
        // and unroll the Gerstner sum in a helper the mesh shaders call.
        const decls = waves.map((w, i) =>
            `const vec4 WAVE${i} = vec4(${w.dx.toFixed(4)}, ${w.dz.toFixed(4)}, ${w.k.toFixed(5)}, ${w.a.toFixed(4)}); // c=${w.c.toFixed(3)}`
        ).join('\n')
        const body = waves.map((w, i) => `    { vec4 wv = WAVE${i};
        float k = wv.z; float a = wv.w * damp;
        float ph = k * (dot(wv.xy, xz) - sqrt(9.8 / k) * t);
        h += a * sin(ph);
        float ds = a * k * cos(ph);
        sx += ds * wv.x; sz += ds * wv.y; }`
        ).join('\n')
        return `${decls}\nconst int NW = ${waves.length};\nvoid waveSum(vec2 xz, float damp, float t, out float h, out float sx, out float sz){\n    h = 0.0; sx = 0.0; sz = 0.0;\n${body}\n}`
    }

    return {
        seed: seed >>> 0, wind, terrainHeight, thermalLift, thermalPos, stormAt, stormFlash,
        waves, waterHeightAt, waterVy, waterGLSL, thermals, storm,
        rings, targets, pad, school, launch, passStart, passRings,
    }
}
