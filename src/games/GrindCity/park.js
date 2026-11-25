// GRIND CITY — the park. One analytic height field that BOTH the renderer
// triangulates and the sim rides (the SSX #638 lesson: painted == ridden).
// Pure module: Node + browser, zero dependencies, zero randomness.
//
// Layout (metres, y up, park bounded to ±48):
//   Plaza            flat y=0 everywhere the features don't reach
//   Upper deck       y=3.2 north strip; front edge = long grindable coping
//   Drop-in          ramp deck -> plaza (the speed-maker)
//   Halfpipe         west, parabolic, 2.8 m deep, open both ends
//   Bowl             east, rounded, 5 m deep
//   Trench           the "gap of the day" south of the plaza (fly it +z)
//   South wall       quarterpipe (west section)
//   Kicker           launch wedge at the gap
//   Rails            drop-in rail, flat plaza rail

export const BOUND = 48

const ss = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
}
const band = (x, a, b, c, d) => ss(a, b, x) * (1 - ss(c, d, x))

export const DECK_Y = 3.2

// The SECOND LINE (#3246): carry speed into the south quarterpipe, crest it
// and ride a deck along the wall top. Optional by design — the win line
// never needs it; it is where the roof gems live.
export const ROOF_Y = 2.5

// The SECRET SPOT (#3246): a hidden bowl east of the plaza, off every line —
// reward for players who skate past the edge of the map they can see.
export const SECRET = { x: 26, z: 6, r: 4.5, floor: -2.4 }

/** Park surface height at (x, z). Every feature blends to its neighbours. */
export function parkHeight(x, z) {
    let h = 0
    // Upper deck (north strip, solid slab to its z=-31 wall)
    if (z <= -31) h += DECK_Y * band(x, -12, -10, 30, 32)
    // Drop-in ramp: the deck's rideable way down (continuous with the slab edge)
    if (z < -17 && z > -31) h += DECK_Y * ss(0, 1, (-z - 17) / 14) * band(x, -1, 0.5, 11.5, 13)
    // Halfpipe (west): parabola u=(x+35)/10, floor -2.8
    const u = (x + 35) / 10
    if (Math.abs(u) < 1) h += -2.8 * (1 - u * u) * band(z, -22, -20, 8, 10)
    // Bowl (east): rounded, 5 m deep
    const r2 = ((x - 38) / 8) ** 2 + ((z + 7) / 9) ** 2
    if (r2 < 1) h += -5 * Math.pow(1 - r2, 0.7)
    // Trench (the gap of the day, crossed along +z)
    h += -2.2 * band(x, -3, -1.5, 11.5, 13) * band(z, 4, 5, 9, 10)
    // South quarterpipe wall (west section). Fades out exactly where the
    // roof deck rises (#3246) — same curve, complementary — so the crest
    // holds a constant ROOF_Y instead of stacking into a hump.
    h += 2.5 * Math.pow(ss(8, 14, z), 2.2) * (1 - ss(14, 14.6, z)) * band(x, -32, -30, -6, -4)
    // Roof deck (#3246) — the SECOND LINE along the wall crest. Reach it by
    // carrying the trench landing into the quarterpipe at speed; it runs west
    // with a grindable coping, and its east end is a long ramp back to plaza.
    h += ROOF_Y * ss(14, 14.6, z) * (1 - ss(22, 23.5, z)) * band(x, -32, -30, -6, 2)
    // Kicker K1 — launches you over the trench (faces +z)
    if (z > 1 && z < 4.5) h += 1.0 * Math.pow(ss(1, 4, z), 2) * band(x, -1, 0.5, 8.5, 10)
    // Kicker K2 (plaza toy, faces -z)
    if (z < -3.5 && z > -6.5) h += 0.8 * Math.pow(ss(0, 1, (-z - 3.5) / 3), 2) * band(x, -20, -19, -15, -14)
    // Secret bowl (#3246) — hidden east of the plaza, off every driven line
    const r3 = ((x - SECRET.x) / SECRET.r) ** 2 + ((z - SECRET.z) / SECRET.r) ** 2
    if (r3 < 1) h += SECRET.floor * Math.pow(1 - r3, 0.7)
    return h
}

/** Central-difference surface gradient {gx,gz}. */
export function gradAt(x, z) {
    const e = 0.22
    return {
        gx: (parkHeight(x + e, z) - parkHeight(x - e, z)) / (2 * e),
        gz: (parkHeight(x, z + e) - parkHeight(x, z - e)) / (2 * e),
    }
}

// ── Grindable lines ──────────────────────────────────────────────────────
export const RAILS = [
    { id: 'deckedge', ax: -8, ay: DECK_Y + 0.7, az: -29.5, bx: 20, by: DECK_Y + 0.7, bz: -29.5, kind: 'coping' },
    { id: 'dropin', ax: 11, ay: DECK_Y + 0.72, az: -29, bx: 11, by: 0.72, bz: -17.5, kind: 'rail' },
    { id: 'plaza', ax: -14, ay: 0.72, az: -6, bx: -4, by: 0.72, bz: 2, kind: 'rail' },
    { id: 'pipe-near', ax: -25, ay: 0.06, az: -20, bx: -25, by: 0.06, bz: 8, kind: 'coping' },
    { id: 'pipe-far', ax: -45, ay: 0.06, az: -20, bx: -45, by: 0.06, bz: 8, kind: 'coping' },
    { id: 'roof', ax: -26, ay: ROOF_Y + 0.7, az: 14.3, bx: -10, by: ROOF_Y + 0.7, bz: 14.3, kind: 'coping' },
]

export function railAt(rail, t) {
    return {
        x: rail.ax + (rail.bx - rail.ax) * t,
        y: rail.ay + (rail.by - rail.ay) * t,
        z: rail.az + (rail.bz - rail.az) * t,
    }
}
export function railLen(rail) {
    return Math.hypot(rail.bx - rail.ax, rail.bz - rail.az)
}

/** Closest point on a rail's horizontal projection; t is the parametre. */
export function railClosest(rail, x, z) {
    const dx = rail.bx - rail.ax, dz = rail.bz - rail.az
    const L2 = dx * dx + dz * dz
    let t = L2 === 0 ? 0 : ((x - rail.ax) * dx + (z - rail.az) * dz) / L2
    t = Math.max(0, Math.min(1, t))
    const px = rail.ax + dx * t, pz = rail.az + dz * t
    return { t, d: Math.hypot(x - px, z - pz) }
}

// ── Letters S-K-A-T-E, laid on the loop line around the park ─────────────
export const LETTERS = [
    { k: 'S', x: 6, z: -30.5, y: DECK_Y + 1.1 },
    { k: 'K', x: -35, z: -3.8, y: -2.8 + 1.1 },
    { k: 'A', x: -12, z: -1, y: 1.1 },
    { k: 'T', x: 4, z: -4, y: 1.1 },
    { k: 'E', x: 5, z: 13, y: 1.1 },
]

// The gap of the day: fly the trench along +z without touching it.
export const GAP = { x0: -3.5, x1: 13.5, z0: 4, z1: 10.5, floor: -1.0 }

// ── GEMS (#3246) — score-mode objects, +100 each ──────────────────────────
// Optional points off the win line, laid in three clusters: four along the
// roof (the second line's prize), six packed inside the secret bowl, four
// tucked at the far corners of the plaza. The win law never needs one.
export const GEM_PTS = 100
const gem = (x, z) => ({ x, z, y: parkHeight(x, z) + 1.0 })
export const GEMS = [
    // the roof line
    gem(-26, 18), gem(-21, 18), gem(-16, 18), gem(-11, 18),
    // the secret hoard
    gem(26, 6), gem(28, 6), gem(24, 6), gem(26, 8), gem(26, 4), gem(27.4, 7.4),
    // far corners of the plaza
    gem(-40, -16), gem(18, -14), gem(-16, 9), gem(30, 14),
]
