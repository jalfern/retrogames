// EXCITEBIKE — the course as DATA. Nothing here runs physics or touches the
// DOM; `groundY`, `slopeAt` and `featureAt` are the only readers, and the Node
// harness imports them unchanged to audit the track BEFORE anyone rides it:
// every up-step clearable at wide-open throttle, every ramp launch landing on
// real ground, and every gameplay band (mud/water/boost) sitting on a slice of
// the heightmap that actually exists. Six hand-carved tracks, one looping lap
// each — the original's 6-track roster (#2563), picked from the splash
// screen; EDIT TRACK remains the honest gap (README). The fidelity the
// issue asked for lives in the terrain shape and the feel.
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
        bite: 1,
        pace: 0,        // #2573 PER-COURSE LEAGUE: later circuits run the
        // original's faster pack (see PACK_TIER below). MOTOCROSS and
        // SUPERCROSS are the calibration courses at pace 0 — every shipped
        // receipt (CRASH LEAGUE, CONTACT, PACK, attract replay) stands
        // byte-honest there, and the bite ramps +0.02..+0.06 after them.
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
        pace: 0,
        bite: 2,
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
    {
        name: 'SAND CROSS',
        pace: 0.02,
        bite: 3,
        // the desert course: long rolling dunes, one mid lip, a WIDE whoop
        // field, a long sand-mud flat (the longest drag in the roster), the
        // standard step-atop-a-rise and a boost straight home. No water — the
        // sand bites through mud instead. Slower names, real terrain.
        cps: [
            [0, 96], [300, 96],             // start straight (finish line)
            [480, 84], [680, 98],          // dune
            [860, 84], [1080, 98],        // dune two
            [1300, 140], [1304, 140],     // mid lip (climb, 4px crest)
            [1440, 66], [1600, 96],       // landing slope back to flat
            [1720, 94], [2400, 94],       // wide whoop field (sine stamped below)
            [2460, 88], [2940, 88],       // the long sand flat (mud band below)
            [3020, 84], [3164, 130], [3170, 132],   // step at the top of its rise
            [3400, 132], [3600, 124],
            [3900, 74], [4200, 96],       // downhill sweeper
            [4400, 116], [4700, 116],     // boost straight
            [4980, 86], [5260, 100],      // rollers home
            [5540, 88], [5800, 96],
            [LAP, 96],
        ],
        bands: [
            { whoops: [1720, 2400, 6, 4] },
            [MUD, 2440, 2960, 1],
            [BOOST, 4400, 4700, 1],
        ],
    },
    {
        name: 'SLALOM CROSS',
        pace: 0.03,
        bite: 4,
        // the rhythm course: three knuckles strung close together (the landing
        // of one sets the take-off of the next), a tight whoop straight between
        // knuckles two and three, mud immediately after the big third landing
        // (punish the slow arrival), the step, and the longest boost straight
        // in the roster home. No water — speed is this course's whole argument.
        // Every feature asks for a decision.
        cps: [
            [0, 96], [260, 96],
            [440, 124], [444, 124],       // knuckle one
            [560, 76], [720, 96],
            [840, 120], [844, 120],      // knuckle two, tight on its landing
            [950, 84], [1140, 92],
            [1180, 92], [1560, 92],      // whoop rhythm straight (stamped below)
            [1780, 132], [1784, 132],    // knuckle three, the big one
            [1930, 64], [2100, 96],
            [2200, 88], [2440, 88],      // mud right off the landing
            [2520, 82], [2664, 128], [2670, 130],   // step at the top of its rise
            [2900, 130], [3100, 120],
            [3260, 84], [3420, 84],      // fast dip (the crossing reads clean at speed)
            [3580, 118],
            [3800, 114], [4400, 114],    // the long boost home
            [4560, 146], [4720, 96],
            [4900, 84], [5180, 98],      // rollers home
            [5460, 86], [5700, 100],
            [5800, 96], [LAP, 96],
        ],
        bands: [
            { whoops: [1180, 1560, 7, 4] },
            [MUD, 2180, 2460, 1],
            [BOOST, 3800, 4400, 1],
            [BOOST, 2940, 3080, 1],      // a second arrow strip after the step
        ],
    },
    {
        name: 'BIG AIR',
        pace: 0.04,
        bite: 5,
        // two tall lips with long glides and a water crossing in between (the
        // recovery section), then a whoop run, mud, the step, and a boost
        // straight onto the fast home sweep. Height over density: the air is
        // where this course lives.
        cps: [
            [0, 96], [320, 96],
            [560, 156], [564, 156],      // big one: long climb, tall lip
            [760, 56], [960, 96],       // long landing slope
            [1000, 96], [1200, 96],     // boost arrows right off the landing
            [1380, 82], [1540, 96],     // shallow roller
            [1680, 70], [1820, 70],     // water between the giants
            [1980, 118],
            [2200, 152], [2204, 152],   // big two
            [2420, 58], [2620, 96],
            [2740, 92], [3280, 92],     // whoop run (stamped below)
            [3360, 86], [3540, 86],     // mud after the whoops
            [3620, 80], [3764, 126], [3770, 128],   // step at the top of its rise
            [4000, 128], [4220, 118],
            [4480, 116], [4880, 116],   // boost straight
            [5160, 84], [5380, 96],     // fast home sweep
            [5540, 88], [5740, 98],
            [5800, 96], [LAP, 96],
        ],
        bands: [
            [BOOST, 1000, 1200, 1],
            [WATER, 1620, 1880, 1],
            { whoops: [2740, 3280, 7, 4] },
            [MUD, 3340, 3560, 1],
            [BOOST, 4480, 4880, 1],
        ],
    },
    {
        name: 'K.O. CROSS',
        pace: 0.06,
        bite: 6,
        // the whole roster at full stretch: three big lips, TWO whoop fields,
        // back-to-back mud, the tallest step in the game, a deep water bowl,
        // a boost into a climb that launches lip three. Everything the
        // cartridge taught, in one lap, in order.
        cps: [
            [0, 96], [220, 96],
            [420, 148], [424, 148],      // lip one
            [580, 62], [740, 96],
            [860, 90], [1220, 90],      // whoop field one (stamped below)
            [1420, 144], [1424, 144],   // lip two, tight off the whoops
            [1580, 60], [1760, 96],
            [1840, 86], [2260, 86],     // back-to-back mud
            [2340, 80], [2486, 132], [2492, 134],   // tallest step, at its rise
            [2720, 134], [2920, 122],
            [3080, 60], [3260, 60],     // deep bowl
            [3420, 118],
            [3620, 116], [3860, 116],   // boost then the climb
            [4080, 150], [4320, 88],
            [4520, 146], [4524, 146],   // lip three off the far side
            [4680, 62], [4860, 96],
            [4980, 92], [5380, 92],     // whoop field two (stamped below)
            [5600, 86], [5800, 96],
            [LAP, 96],
        ],
        bands: [
            { whoops: [860, 1220, 10, 4] },
            [MUD, 1820, 2280, 1],
            [WATER, 3020, 3320, 1],
            [BOOST, 3620, 3860, 1],
            { whoops: [4980, 5380, 9, 3] },
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
export const trackBite = (i) => CACHE[i].bite || i + 1

// The splash cursor's movement law, in data land so the shell and the
// harness read the SAME wrap (#2563): arrows step the selection by ±1 and
// it cycles the roster — the NES menu law, pinned by excitecheck SPLASH.
// #2576: the roster GROWS — EDIT TRACK customs register after the six, and
// the shell passes the grown n; the shipped-roster pins stay at n=6.
export const nextSel = (i, dir, n = TRACK_COUNT) => ((i + dir) % n + n) % n

// ---- EDIT TRACK customs (#2576) ---------------------------------------------
// A compiled draft becomes a roster member: build its ground the same way the
// shipped courses get theirs, splice it into CACHE right after the six, and
// every index-driven reader (sim, planner, rival pace, renderer, harness)
// rides it unchanged. Slot is dense (0..CUSTOM_MAX-1); re-saving a slot
// replaces it. TRACK_COUNT keeps meaning SIX — the shipped roster is pinned.
export function buildTrack(t) {
    return { ...t, ground: buildGround(t.cps, t.bands), steps: stepsOf(t.cps) }
}
export function registerCustom(built, slot) {
    if (!(slot >= 0 && slot < 3)) return -1
    const i = TRACKS.length + slot
    if (slot > customCount()) return -1
    CACHE[i] = built
    return i
}
export const customCount = () => Math.max(0, CACHE.length - TRACKS.length)

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
// `skill` (0..1) is the rider, not the engine: attitude control in the air.
// The front of the pack reads the landing early and lands clean; the tail
// reacts late and eats the rising ground after the big ramps (see rivalTick
// in sim.js — the landing law is the player's own, with a skill-scaled
// window). Skill tiers, pinned receipts: scripts/excitecheck.mjs CRASH LEAGUE.
export const RIVALS = [
    { name: 'MARIO', base: 5.30, skill: 1.00 },
    { name: 'KATO', base: 5.18, skill: 0.92 },
    { name: 'GORDON', base: 5.05, skill: 0.80 },
    { name: 'SONJA', base: 4.88, skill: 0.66 },
    { name: 'IVAN', base: 4.66, skill: 0.52 },
]

// #2573 PER-COURSE LEAGUE — the original's later circuits bite harder: the
// pack's front ranks carry the course's pace bonus, the tail rides the
// baseline. The bonus per course lives on the track table (`pace`); its cap
// is measured, not guessed — +0.15 on the leader ate the autopilot's FIRST
// margin to 3.1px and broke the SLACK law, so K.O. CROSS tops out at +0.06
// (+0.06/+0.04/+0.02 front ranks). Customs/TEST drafts carry no `pace`
// field and ride generic baseline pace (the honest remainder, README).
export const PACK_TIER = [1, 2 / 3, 1 / 3, 0, 0]

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

// ---- the TEST lap (#2587) --------------------------------------------------
// The bay's TEST tool seats a draft that was never SAVED: it must not enter
// CACHE (the splash roster is built from CACHE density — a phantom row would
// lie about what exists), so the draft lives under one transient alias that
// track() resolves BEFORE the CACHE wrap. The sim, planner, rival pace lines
// and renderer all read courses through track(gs.track), so seating a draft
// at TRANSIENT drives every reader honestly with one line of law. One test at
// a time; clearing it restores track(-1) to the plain roster wrap it always
// was (no shipped behaviour moved: nothing passed -1 before #2587).
export const TRANSIENT = -1
let transient = null
export const setTestTrack = (built) => { transient = built }
export const clearTestTrack = () => { transient = null }
export const hasTestTrack = () => transient != null

// #2603 OWN TERRAIN — whose course is this ride. The bay's TEST draft and every
// registered custom are YOURS: they owe you an exit back to the bay (the pad's
// EXIT button / Esc, index.jsx). Tracks 1-6 are the league's - the full-race
// commitment stands there. The law lives in one pure line so excitecheck can
// pin it, and it never mutates anything: it only reads the roster density.
export const ownTerrain = (i) => i === TRANSIENT || (i >= TRACK_COUNT && i < TRACK_COUNT + customCount())

export function track(i) {
    if (i === TRANSIENT && transient) return transient
    // #2576: the roster includes registered EDIT TRACK customs — wrap over the
    // GROWN cache, not the shipped six. With zero customs this is the same
    // law as before (CACHE.length === TRACK_COUNT), so every shipped pin holds.
    const n = CACHE.length
    return CACHE[((i % n) + n) % n]
}
