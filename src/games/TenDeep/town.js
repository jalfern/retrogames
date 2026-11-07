// TEN-DEEP — THE RIM: the hamlet on the lip of the well (stage 2 of #1127).
// Wizardry's surface (Apple II, 1981) is four services and a purse: the
// TAVERN hires replacements and seats the creation bench, the TEMPLE calls the
// dead back, the TRAINING GROUNDS spend carried XP for levels, the ALCHEMIST
// sells potions. Gold is the binding resource: kills print it, town charges it,
// and a wipe taxes the purse by half — so the cellar can never farm an
// infinite party. Stage 3 added CREATE: the bench where races, classes and
// alignments are rolled and chosen (people.js owns the people math).

// THE RIM's surface truth lives here. mulberry32 (dungeon.js) is the only dice:
// the wanderers below are seeded once from the town seed, so no rng is drawn as
// you walk and every campaign pin is untouched.
import { mulberry32 } from './dungeon.js'

export const TOWN = 'THE RIM'

// ---- the walkable street (#1751) -------------------------------------------
// THE RIM is a place you walk, not a menu: a two-lane cobbled street running
// past four facades, with the well curb blocking the near lane and hedges
// blocking the far one — so the hamlet has real routing, and every door must
// be reached on foot. Pure data + pure lookups: positions are input-driven,
// the map is fixed (no rng), so determinism is untouched and the proofs never
// touch it (makeRun({strict}) bypasses the town entirely).
export const RIM_STREET = {
    len: 32,                    // tiles across (10 px each at the game's W=320)
    doors: { T: 3, V: 9, G: 16, A: 22 },   // door tiles, all on the FAR lane
    blockedNear: [12, 13],     // the well curb — walk past on the far lane
    blockedFar: [6, 7, 18, 19],           // hedges — duck to the near lane
    start: { x: 0, lane: 1 },           // west end, at the doors' side
}

// blocked() law (AGENTS): anything that moves must ask.
export const rimBlocked = (x, lane) =>
    x < 0 || x >= RIM_STREET.len ||
    (lane ? RIM_STREET.blockedFar : RIM_STREET.blockedNear).includes(x)

// the building whose threshold you are standing on (only the far lane has doors)
export const rimDoorAt = (x, lane) =>
    lane === 1 ? Object.keys(RIM_STREET.doors).find((k) => RIM_STREET.doors[k] === x) ?? null : null

// ---- seeded wanderers (#1756) ----------------------------------------------
// New Sorpigal had townsfolk; THE RIM should not be an empty street. Three
// seeded folk stroll fixed back-and-forth patrols along the lanes. This is
// PRESENTATION LAYER ONLY: routes are pure data fixed at town-seed time on
// mulberry32 (zero new rng draws mid-run), never sim state, never in
// stateHash — so every campaign and determinism pin still stands. The shell
// paints them and barks when you share a tile; tendeecheck proves the routes
// are legal (a folk never steps into the well curb or a hedge), deterministic
// and honest.
export const RIM_FOLK_NAMES = [
    'A CROSSROADS GUARD', "BRANNOCK'S DAUGHTER", 'A TEMPLE ACOLYTE',
]
export const RIM_FOLK_BARKS = [
    'MIND THE WELL — IT KEEPS WHAT IT TAKES',
    "DON'T KEEP THE CROW WAITING",
    'THE NINTH HEARS EVEN THOSE WHO DO NOT KNEEL',
]

// a stretch of one lane that is standable ground end to end (no hedge, no curb)
const spanClear = (a, b, lane) => {
    for (let x = a; x <= b; x++) if (rimBlocked(x, lane)) return false
    return true
}

// three wanderers, each patrolling a legal span. Same seed → same street: the
// guard, the daughter and the acolyte always walk the same beats.
export function makeRimFolk (townSeed) {
    const rnd = mulberry32((townSeed >>> 0) ^ 0x5A17)
    const folk = []
    for (let i = 0; i < RIM_FOLK_NAMES.length; i++) {
        const lane = rnd() < 0.5 ? 0 : 1
        // grow a 3..7-tile patrol that stays on standable ground in this lane
        let a = 1 + Math.floor(rnd() * (RIM_STREET.len - 8))
        let b = a + 2 + Math.floor(rnd() * 5)
        if (b >= RIM_STREET.len) b = RIM_STREET.len - 2
        let guard = 0
        while (!spanClear(a, b, lane) && guard < 48) { a += 1; b += 1; if (b >= RIM_STREET.len) { a = 1; b = 3 }; guard++ }
        // final honesty: if no clean span was found, fall back to the two tiles
        // flanking the well on the far lane (guaranteed open by the map itself)
        if (!spanClear(a, b, lane)) { a = 14; b = 17 }
        folk.push({
            id: i,
            name: RIM_FOLK_NAMES[i],
            bark: RIM_FOLK_BARKS[i],
            lane,
            a, b,
            phase: Math.floor(rnd() * 8),
            speed: 1 + (i % 3),   // ticks per tile-step: a slower stroll for variety
        })
    }
    return folk
}

// ping-pong along the span, a folk turns at each end. `speed` is how many ticks
// elide one tile-step (slower townsfolk read calmer); advancing one step at a
// time keeps every tile on the patrol reachable, so no wanderer ever freezes.
// Deterministic in tick — the shell advances tick with its animation clock.
export function rimFolkAt (f, tick) {
    const run = f.b - f.a
    if (run <= 0) return { x: f.a, lane: f.lane }
    const period = run * 2
    let q = (Math.floor(tick / f.speed) + f.phase) % period
    if (q < 0) q += period
    return { x: q <= run ? f.a + q : f.a + (period - q), lane: f.lane }
}

// the bark law, honestly stated: a folk answers when it shares your tile.
export const rimFolkShares = (f, tick, tx, ty) => {
    const p = rimFolkAt(f, tick)
    return p.x === tx && p.lane === ty
}

// ---- the street breathes (#1756) ---------------------------------------------
// The lamps and the well-mouth are fire, not decals: each source cycles on its
// own beat — a two-frequency braid phase-shifted per source, so the west lamp,
// the east lamp and the well never pulse in lockstep — and the cobble pool
// brightens with its flame. PRESENTATION ONLY: pure in the shell's animation
// tick (bob), zero rng, zero sim state — stateHash never sees any of it, so
// every campaign and determinism pin still stands.
export const RIM_FLAMES = [
    { x: 58, phase: 0 },        // the west lamp, under the tavern sign
    { x: 262, phase: 2.4 },     // the east lamp, by the alchemist's step
]
export const RIM_WELL_FLAME = { x: 128, phase: 1.3 }

export function rimFlame (src, tick) {
    const flare = 0.62 * Math.sin(tick / 9 + src.phase) + 0.38 * Math.sin(tick / 23 + src.phase * 1.7)
    return {
        flare,                             // -1..1 — the fire's own breath
        glow: 0.72 + 0.22 * flare,       // the flame core's brightness
        pool: 0.10 + 0.055 * flare,      // the cobbles under the lamp
        lift: flare > 0.55 ? -1 : 0,     // a strong flare tips the flame a pixel
    }
}


export const BUILDINGS = [
    { key: 'T', name: 'TAVERN', sign: 'THE DROWNING CROW' },
    { key: 'V', name: 'TEMPLE', sign: 'HOUSE OF THE Ninth' },
    { key: 'G', name: 'TRAINING GROUNDS', sign: 'THE FENCING YARD' },
    { key: 'A', name: 'ALCHEMIST', sign: 'SIXVIAL & SON' },
]

// each service names the CFG price key; `heroOk` decides which slots it
// applies to, `exec` is the whole effect — the harness re-grades the same
// table so prices and effects cannot drift from what the check asserts.
export const SERVICES = {
    T: [
        { id: 'post', label: 'POST FOR HIRE', priceKey: 'hireCost', desc: 'a seeded stranger fills the fallen slot' },
        { id: 'create', label: 'CREATE', priceKey: 'createCost', desc: 'the bench: roll race, class & alignment' },
    ],
    V: [
        { id: 'mourn', label: 'MOURN — call back (1 hp)', priceKey: 'mournCost', desc: 'the dead return at the threshold of life' },
        { id: 'restore', label: 'RESTORE — life & limb', priceKey: 'restoreCost', desc: 'the dead whole, the wounded whole' },
        { id: 'mend', label: 'MEND — fill one hero', priceKey: 'mendCost', desc: 'wounds closed, hp made full' },
        { id: 'refresh', label: 'REFRESH — fill one spirit', priceKey: 'refreshCost', desc: 'spent magic returned' },
    ],
    G: [{ id: 'train', label: 'TRAIN', priceKey: 'trainCost', desc: 'XP at the threshold + gold = one level' }],
    A: [{ id: 'potion', label: 'BUY POTION', priceKey: 'potionCost', desc: 'crimson glass, 26 hp when drunk' }],
}

export { rollRecruit } from './people.js'

// which purse slots a service may target, honestly evaluated against state.
// `vacant` = the slot holds no one: fallen, or freshly posted and waiting at
// the creation bench for a name of its own.
export function serviceHeroOk(id, h, vacant) {
    switch (id) {
        case 'post': return vacant
        case 'create': return vacant
        case 'mourn': case 'restore': return !h.alive
        case 'mend': return h.alive && h.hp < h.maxHp
        case 'refresh': return h.alive && h.mp < h.maxMp
        case 'train': return h.alive
        case 'potion': return true
        default: return false
    }
}
