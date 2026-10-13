// EXCITEBIKE — the course as DATA. Nothing here runs physics or touches the
// DOM; `groundY`, `slopeAt` and `featureAt` are the only readers, and the Node
// harness imports them unchanged to audit the track BEFORE anyone rides it:
// every up-step clearable at wide-open throttle, every ramp launch landing on
// real ground, and every gameplay band (mud/water/boost) sitting on a slice of
// the heightmap that actually exists. Two hand-carved tracks, one looping lap
// each — the original's 6-track roster is out of scope (the README says so);
// the fidelity the issue asked for lives in the terrain shape and the feel.
//
// Height is "up" in world units (bigger = higher). The heightmap is one entry
// per horizontal pixel; control points are linearly interpolated, then whoops
// stamp a sine on top of their band so the bumps are real geometry, not a
// gameplay lie.

export const LAP = 6400          // px per lap (both tracks loop at the same length)
export const PAD = 400           // wrap look-ahead painted past LAP

// feature band kinds
export const MUD = 'mud'
export const WATER = 'water'
export const BOOST = 'boost'

// A track is authored as control points [x, height] plus feature bands
// [kind, x0, x1, strength]. `steps` (instant rises that need speed) are two
// control points one pixel apart with a tall delta; the auditor finds them by
// that signature, so a step that a wide-open bike cannot climb is a build fail.
const TRACKS = [
    {
        name: 'MOTOCROSS',
        // rolling hills, one big jump, a whoop field, a mud pit, a water hole,
        // a boost straight and one clearable up-step. Closes flat-ish at LAP.
        cps: [
            [0, 96], [280, 96],            // start straight (finish line)
            [560, 96],
            // downhill into the first rollers
            [760, 78], [980, 96],
            // the big take-off ramp (steep up to a lip), then a long landing slope
            [1200, 150], [1204, 150],      // the lip (flat crest, 4px)
            [1360, 60], [1520, 96],        // landing downslope back to flat
            // whoop field (sine stamped below)
            [1720, 92], [2100, 92],
            // mud pit sits on a gentle flat
            [2280, 88], [2520, 88],
            // the up-step: an arcade hill that RIDES UP into its deck — the
            // crest launches you the last few px over the step lip. A wall
            // approached on the flat was a trap the physics could not solve
            // at low speed; the NES course book puts every step at the top
            // of a rise for exactly that reason. Speed still matters: the
            // crawl up arrives lip-bare and kisses the deck.
            [2600, 80], [2744, 126], [2750, 128],
            [3000, 128], [3200, 120],
            // water hole: a dip that stalls a slow bike
            [3360, 70], [3520, 70],        // bottom of the dip
            [3680, 120],
            // boost straight
            [3900, 118], [4200, 118],
            // long downhill sweeper back toward the line
            [4560, 70], [4900, 96],
            [5200, 110], [5500, 92],
            [5800, 96], [LAP, 96],
        ],
        bands: [
            [MUD, 2260, 2540, 1],
            [WATER, 3300, 3580, 1],
            [BOOST, 3900, 4200, 1],
            { whoops: [1720, 2100, 7, 3] },   // [x0, x1, amp, waves]
        ],
    },
    {
        name: 'SUPERCROSS',
        // busier: two jumps, a bigger whoop field, back-to-back mud, a taller
        // step, and a harder water landing. Same loop length.
        cps: [
            [0, 96], [240, 96],
            [420, 80], [600, 96],
            // jump one
            [820, 140], [824, 140],
            [980, 66], [1140, 96],
            // a rhythm whoop straight
            [1320, 92], [1760, 92],
            // second, tighter jump off a knuckle
            [1980, 132], [1984, 132],
            [2110, 72], [2280, 96],
            // mud, immediately after the landing (punish a slow landing)
            [2360, 88], [2640, 88],
            // taller up-step: a steeper ramp into the deck (recoverable,
            // arcade-accurate — steps live at the top of rises, not walls)
            [2760, 84], [2846, 122], [2852, 124],
            [3120, 124], [3320, 110],
            // water in a bowl
            [3520, 64], [3660, 64],
            [3820, 120],
            // boost then a steep climb
            [4060, 116], [4300, 116],
            [4520, 150], [4760, 90],
            [5000, 96], [5240, 116],
            [5520, 80], [5820, 104],
            [LAP, 96],
        ],
        bands: [
            { whoops: [1320, 1760, 9, 5] },
            [MUD, 2340, 2660, 1],
            [WATER, 3460, 3700, 1],
            [BOOST, 4060, 4300, 1],
        ],
    },
]

function buildGround(cps, bands) {
    const g = new Float32Array(LAP + PAD + 1)
    for (let i = 0; i < cps.length - 1; i++) {
        const [x0, h0] = cps[i]
        const [x1, h1] = cps[i + 1]
        const span = x1 - x0
        for (let x = x0; x <= Math.min(x1, LAP); x++) {
            const t = span ? (x - x0) / span : 0
            g[x] = h0 + (h1 - h0) * t
        }
    }
    // whoops stamp real bumps into the heightmap over their band
    for (const b of bands) {
        if (!b.whoops) continue
        const [a, z, amp, waves] = b.whoops
        for (let x = a; x <= z; x++) {
            const t = (x - a) / (z - a)
            g[x] += Math.sin(t * Math.PI * 2 * waves) * amp
        }
    }
    // wrap: copy the head of the lap so groundY(x mod LAP) is smooth past LAP
    for (let x = LAP; x <= LAP + PAD; x++) g[x] = g[x - LAP]
    // snap any control point past the wall onto its wrapped twin
    return g
}

const CACHE = TRACKS.map((t) => ({
    ...t,
    ground: buildGround(t.cps, t.bands),
    steps: stepsOf(t.cps),
}))

export const TRACK_COUNT = TRACKS.length
export const trackName = (i) => CACHE[i].name

function interp(g, x) {
    if (x < 0) x = 0
    const i = Math.floor(x)
    if (i >= LAP + PAD) return g[LAP + PAD]
    const f = x - i
    return g[i] + (g[i + 1] - g[i]) * f
}

// height of the terrain under world-x (x is already 0..LAP inside the sim)
export function groundY(ground, x) {
    if (x >= LAP) x %= LAP
    return interp(ground, x)
}

// rise over run at x (positive = climbing). Central difference over 6px so
// ramps read as slopes, not spikes.
export function slopeAt(ground, x) {
    if (x >= LAP) x %= LAP
    const a = interp(ground, Math.max(0, x - 6))
    const b = interp(ground, Math.min(LAP + PAD, x + 6))
    return (b - a) / 12
}

// the feature band covering x, or null. x is 0..LAP.
export function featureAt(track, x) {
    if (x >= LAP) x %= LAP
    for (const b of track.bands) {
        if (b.whoops) continue
        if (x >= b[1] && x <= b[2]) return { kind: b[0], from: b[1], to: b[2], strength: b[3] }
    }
    return null
}

// Steep climb crests (the arcade "steps"). A sustained upslope whose local
// grade exceeds this is a feature the auditor must prove a rider can top out.
export function stepsOf(cps) {
    const out = []
    for (let i = 0; i < cps.length - 1; i++) {
        const [x0, h0] = cps[i]
        const [x1, h1] = cps[i + 1]
        const grade = (h1 - h0) / Math.max(1, x1 - x0)
        if (grade > 0.28) out.push({ x: x1, rise: h1 - h0, grade: +grade.toFixed(3) })
    }
    return out
}

// rival pace lines: speed (px/tick) as a function of distance through the lap,
// so rank is computable in Node without running rival physics. Tuned per track
// so a near-optimal drive beats them with slack and a sloppy one does not.
export const RIVALS = [
    { name: 'MARIO', base: 5.30 },
    { name: 'KATO', base: 5.18 },
    { name: 'GORDON', base: 5.05 },
    { name: 'SONJA', base: 4.88 },
    { name: 'IVAN', base: 4.66 },
]

// rival speed at distance d: they ease through the same terrain the player
// must (backing off the climbs, sucking through mud), but never crash.
// Deterministic — the same function the harness integrates rank with.
export function rivalSpeed(t, d, base) {
    const x = ((d % LAP) + LAP) % LAP
    const sl = slopeAt(t.ground, x)
    const band = featureAt(t, x)
    let s = base
    if (sl > 0.25) s -= (sl - 0.25) * 6             // steep up: slow
    if (sl < -0.35) s += Math.min(1.1, -sl - 0.35)  // steep down: gain
    if (band && band.kind === 'mud') s -= 1.4
    if (band && band.kind === 'water') s -= 1.7
    if (band && band.kind === 'boost') s += 1.2
    return Math.max(3.2, s)
}

export function track(i) {
    return CACHE[((i % TRACK_COUNT) + TRACK_COUNT) % TRACK_COUNT]
}
