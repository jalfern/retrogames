// PAPERS, PLEASE-MIN — the generator. A week of inspection days from one
// seed. Every applicant is built twice on purpose: a `person` (exactly what
// the booth will PRINT) and a `truth` (what the person really is). The
// generator's iron rule, graded by scripts/paperscheck.mjs:
//
//   whenever truth and papers disagree, the BOOTH MUST PRINT THE WITNESS
//   (the scale shows the real weight; the wanted sheet carries the real
//   name+number). A lie without a witness is an unfair paper.
//
// Structure per day: one single-break violator per ACTIVE rule (the law is
// exercised the day it wakes up), exactly one planted TRAP from day 2 — a
// legal paper a careless eye misjudges, one species per day chosen so a
// full week surfaces all six — a second trap on days divisible by three
// (the budget, and the slack rule, caps clumsy play at two strikes a day),
// and legal fill so the booth never runs dry.

import { DAY_RULES, dadd, dnum, FEATURES } from './rules.js'

export function mulberry32(seed) {
    let a = seed >>> 0
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export const COUNTRIES = ['ARSTOTZKA', 'KIRINIA', 'ANTEGRIA', 'VESKOLE', 'PARMENISTAN']
export const CITIES = {
    ARSTOTZKA: ['OR VECHNA', 'OKMAZ'],
    KIRINIA: ['SAN SOMAR', 'LOZDA'],
    ANTEGRIA: ['LESPISTA', 'VESC'],
    VESKOLE: ['ZYTNIA', 'KOLEIDA'],
    PARMENISTAN: ['HALOMAST', 'REVENN'],
}
export const CITY2C = {}
for (const c of COUNTRIES) for (const city of CITIES[c]) CITY2C[city] = c

// #1908 THE WALL THAT LIVES — the pool doubled (80 -> 192 combos). The old
// ten-times-eight name pool made the ORIGINAL its own worst enemy: three decoy
// draws a week multiplied by seven days collide by birthday math (27 repeated
// wall names per sweep — the bulletin looked stamped), and a wall name could
// walk up the window on another day as a pure memory trap. The wider pool is
// the substrate of the living-wall construction below: distinct walls per week,
// zero full-name collisions between the bulletin and the line.
const FIRST = ['EMIL', 'KATYA', 'BORIS', 'ILIA', 'MARTA', 'ANJA', 'DRAGAN', 'VOLO', 'SERDA', 'PETR', 'LUKA', 'MILA', 'YAKOV', 'ZORA', 'MILAN', 'DANA']
const LAST = ['KOSTOV', 'DRENIN', 'VASEK', 'LAGODA', 'ORLOV', 'TOLKA', 'ZEMEK', 'PALIN', 'NOVAK', 'SURIN', 'BASTA', 'VRAN']

// #1979 HAND-AUTHORED REGULARS — the original's line is made of PEOPLE:
// Jorji Costava recurs with the same bald pate, stubble and big nose, and the
// crowd gets recognizable faces. Here the combinatorial roll (skins × hairs ×
// cuts) still paints the background, but six entrants are authored end to
// end: a fixed six-feature descriptor, colors, body stats, ONE signature
// mark (scar/mole/wrinkle/big-ear/freckles/bandage) that drawFace paints at
// the counter and in the zoomed photo, and PERSONAL LINES (lines.greet on the
// first walk-up of a week, lines.again on the return — #1997). #2003 THE
// LONG CONVERSATION widens each pair into a THREAD: lines.hook rides the
// greeting (visit k opens a topic), lines.follow rides the return (visit k+1
// answers it) — the neighborhood talks across visits, like the original's
// regulars whose sagas evolve down the line. Marks and
// lines are decor — never compared, doctrine of the nose.
// A regular's PAPERS are built legal for whatever day they walk up (allowed
// list, expiry, IDREQ all rotate), so they are honest, approvable faces —
// the neighborhood, not a trap. #1988 REPERTOIRE widens each voice with
// top-level `turnAlt`/`againAlt` (the campaign-chapter alternates — see
// turnLineFor below) and `seize` (the argue line printed under the DENIED
// stamp when the arc face is turned away). All decor, all authored, zero rnd.
export const REGULARS = [
    {
        id: 'grubak', name: 'VOLEN GRUBAK', sex: 'M', ageYears: 47, dobM: 3, dobD: 14, height: 178, weight: 86,
        // #2087 REGULAR ECHOES — Jorji's cap sits tilted: authored decor, an
        // identity mark like the scar, never in FEATURES, never evidence.
        face: { skin: 2, hairC: 0, shirtC: 2, style: 1, narrow: 0, glasses: 0, must: 1, brow: 1, mouth: 0, hat: 1, uni: 1, ear: 0, gap: 0, tilt: 1 },
        mark: 'scar',
        lines: { greet: 'GOOD DAY, GUARD.', hook: 'THE BREAD LINE WAS LONG.', again: 'BACK AGAIN, HA!', follow: 'STILL NO BREAD, HA!' },
        turnAlt: '...IS MISTAKE, YES?', againAlt: 'BACK AT THE GLASS.', seize: '"I HAVE FAMILY IN OR VECHNA!"',
    },
    {
        id: 'marko', name: 'MARKO DRENIN', sex: 'M', ageYears: 29, dobM: 8, dobD: 2, height: 164, weight: 61,
        face: { skin: 0, hairC: 1, shirtC: 0, style: 2, narrow: 1, glasses: 1, must: 0, brow: 0, mouth: 1, hat: 0, uni: 0, ear: 1, gap: 0 },
        mark: 'mole',
        lines: { greet: 'IS MY PAPER OK?', hook: 'I CHECKED IT TWICE.', again: 'NOTHING WRONG THIS TIME.', follow: 'I CHECKED IT THREE TIMES.' },
        turnAlt: '...TWO WEEKS STRAIGHT!', againAlt: 'BACK AGAIN, GUARD.', seize: '"NOTHING WRONG, I TELL YOU!"',
    },
    {
        id: 'anja', name: 'ANJA TOLKA', sex: 'F', ageYears: 55, dobM: 11, dobD: 21, height: 158, weight: 57,
        face: { skin: 4, hairC: 2, shirtC: 3, style: 0, narrow: 0, glasses: 0, must: 0, brow: 1, mouth: 0, hat: 3, uni: 0, ear: 0, gap: 1 },
        mark: 'wrinkle',
        lines: { greet: 'I VISIT MY DAUGHTER.', hook: 'HER FLAT IS IN THE CITY.', again: 'THE LINE IS SHORT TODAY.', follow: 'SHE SENDS HER THANKS.' },
        turnAlt: '...I COME TO SEE FAMILY!', againAlt: 'THE LINE IS LONG AGAIN.', seize: '"YOU CANNOT DO THIS TO ME!"',
    },
    {
        id: 'petr', name: 'PETR ZEMEK', sex: 'M', ageYears: 34, dobM: 5, dobD: 9, height: 171, weight: 74,
        face: { skin: 1, hairC: 4, shirtC: 1, style: 3, narrow: 1, glasses: 0, must: 1, brow: 0, mouth: 1, hat: 2, uni: 0, ear: 0, gap: 0 },
        mark: 'ear',
        lines: { greet: 'WORK IN THE CITY.', hook: 'THE TRAIN WAS LATE.', again: 'SAME BOOTH, SAME GUARD.', follow: 'THE TRAIN IS ON TIME.' },
        turnAlt: '...WRONG MAN, COMRADE.', againAlt: 'THE TRAIN WAS LATE AGAIN.', seize: '"I CLOCK IN AT SIX, GUARD!"',
    },
    // #1997 THE FIFTH AND SIXTH — the original's neighborhood is not four:
    // a dozen faces lean on the glass across the campaign. Sonya Malak is
    // the knit-seller (freckles across the left cheek, headscarf AND the
    // gold earring — the only cast member wearing two decor families);
    // Tadek Hruby is the retired clerk (grey at 62 — color is never
    // evidence, and his honest photo carries the same grey, so the aged-photo
    // trap can never be pointed at him — plus glasses, the forehead bandage
    // of a clumsy workshop life, and a missing tooth).
    {
        id: 'sonya', name: 'SONYA MALAK', sex: 'F', ageYears: 38, dobM: 1, dobD: 7, height: 161, weight: 63,
        face: { skin: 3, hairC: 1, shirtC: 2, style: 0, narrow: 1, glasses: 0, must: 0, brow: 0, mouth: 0, hat: 3, uni: 0, ear: 1, gap: 0 },
        mark: 'freckles',
        lines: { greet: 'MY SON LIVES IN OR VECHNA.', hook: 'I SELL MY KNITS AT MARKET.', again: 'HE SAYS HELLO, YES?', follow: 'THE KNITS SOLD, GUARD.' },
        turnAlt: '...SOMETHING WRONG, YES?', againAlt: 'HELLO AGAIN, GUARD.', seize: '"MY KNITS, MY SON, PLEASE!"',
    },
    {
        id: 'tadek', name: 'TADEK HRUBY', sex: 'M', ageYears: 62, dobM: 9, dobD: 30, height: 168, weight: 79,
        face: { skin: 4, hairC: 3, shirtC: 0, style: 1, narrow: 0, glasses: 1, must: 1, brow: 1, mouth: 1, hat: 0, uni: 0, ear: 0, gap: 1 },
        mark: 'patch',
        lines: { greet: 'I AM RETIRED, GUARD.', hook: 'THE PENSION BUYS LITTLE.', again: 'YOU LET ME THROUGH.', follow: 'LITTLE, BUT IT BUYS.' },
        turnAlt: '...I AM ONLY RETIRED.', againAlt: 'THE BOOTH REMEMBERS ME.', seize: '"PAPERS ARE HONEST, GUARD!"',
    },
]

// #1908 THE WALL THAT LIVES — decoy names on the bulletin are a per-week PLAN,
// derived from the seed by an index walk over the ordered name pool. Variety is
// a construction, not a hope (this generator's own doctrine): for every seed,
// the week's twenty decoy slots (k < 3, k < 2 on the arc day 6) land on
// DISTINCT pool indices — the offset constants are verified collision-free for
// |Δday| ≤ 6 and |Δslot| ≤ 2 (paperscheck re-proves it on the sweep). The
// plan pre-seeds every day's used-set, so across a whole week no entrant, no
// planted WANTED name, and no regular can ever share a FULL name with a wall
// row — a half-remembered name at the window stays possible (token-level
// near-misses train the printed NAME *AND* NUMBER law), an identical full name
// becomes structurally impossible. Names come from the plan, not the rnd
// stream, so genDay standalone replays genWeek's day exactly, as always.
export const WALL_POOL = []
for (const l of LAST) for (const f of FIRST) {
    const nm = `${f} ${l}`
    if (!REGULARS.some((c) => c.name === nm)) WALL_POOL.push(nm) // cast combos never decorate the wall — the neighborhood is not wanted (until the arc says otherwise)
}
// the arc always rides day 6 (arcForWeek = firstVisitDay(seed, seed%LEN) + 4,
// seatOff is 0 by construction) — paperscheck pins that equality; day 6 stages
// one decoy less so the bulletin keeps its five.
export const weekDecoyCount = (n) => (n === 6 ? 2 : 3)
export const wallNameAt = (seed, n, k) => {
    const L = WALL_POOL.length
    return WALL_POOL[(((seed * 97 + n * 71 + k * 37) % L) + L) % L]
}
export const weekWallNames = (seed) => {
    const out = []
    for (let n = 1; n <= 7; n++) for (let k = 0; k < weekDecoyCount(n); k++) out.push(wallNameAt(seed, n, k))
    return out
}

// #1979 (amended #1997, #2012) THE ROTATING WINDOW + THE CROWDED RETURN —
// the cast is six, and the law needs FACES THAT COME BACK: a one-per-day walk
// over six seats would make every entrant a stranger. #1997 solved it with a
// window of four seats (days 2-5) and returns of its head two seats on days
// 6, 7 — two recurrences a week, but the week met only four of six faces.
// #2012 THE CROWDED RETURN densifies the line the way the original's does
// (several neighbors lean on the glass the same shift): the seat at offset k
// now walks EVERY week, first on day 2 + k, and offsets 0, 1 RETURN on days
// 6, 7 — so each return day hosts TWO regulars: the returning head plus the
// crowding tail (offset 4 on day 6, offset 5 on day 7), greeting its first
// walk-up of the week. Eight authored visits a week, six distinct faces,
// two recurrences — a neighborhood, not a club of four. The queue-size law
// holds because the fill loop lays one fewer random head per regular.
export const VISIT_WINDOW = 4
export const seatOff = (seed, regIdx) => (((regIdx - seed) % REGULARS.length + REGULARS.length) % REGULARS.length)
export const regularForDay = (seed, n) => (n >= 2 ? REGULARS[(seed + (n - 2) % VISIT_WINDOW) % REGULARS.length] : null)

// #2012 the day's authored walk, as a LIST: one regular on days 2-5, TWO on
// days 6, 7 (the returning head, then the crowding tail at offset n-2), none
// on day 1. The crowd seat is never the head: offsets 4, 5 vs 0, 1.
export const regularsForDay = (seed, n) => {
    if (n < 2) return []
    if (n <= VISIT_WINDOW + 1) return [regularForDay(seed, n)]
    return [regularForDay(seed, n), REGULARS[(seed + n - 2) % REGULARS.length]]
}

// #2020 THE CROWDED SHIFT SPEAKS — a day hosting TWO regulars is a crowd:
// the law is just the walk's own length, so it cannot disagree with #2012.
export const crowdedDay = (seed, n) => regularsForDay(seed, n).length >= 2

// the day this seat FIRST walks up this week — since #2012 every seat walks:
// offset k greets on day 2 + k (k = 0..5 → days 2..7), and offsets 0, 1
// walk again on days 6, 7. (Pre-#2012 the tail seats were -1, unseen; the
// crowded return retired that special case.)
export const firstVisitDay = (seed, regIdx) => 2 + seatOff(seed, regIdx)

// #1983 THE ARC — one regular per week turns wanted, Jorji-style. In the
// original the neighborhood is not safe: a familiar face can land on the
// bulletin while still handing over cheerful papers, and only the sheet
// (name AND number) convicts. Here the arc is a construction, seed-only:
// cast[seed mod LEN] sits at the head of the week's window (days 2 and 6 by
// the rotating-window law), and the TURN lands on the return — day 6, where
// WANTED has been awake since day 4. The papers stay built-legal for the
// day; the wall is the whole case. The other recurrence (cast[(seed+1) mod
// LEN], days 3 and 7) just remembers you. Across seeds, EVERY cast seat gets
// its turn on the wall — paperscheck pins that no seat is dead letter.
export function arcForWeek(seed) {
    const idx = seed % REGULARS.length
    return { id: REGULARS[idx].id, day: firstVisitDay(seed, idx) + 4 }
}

// #1988 REPERTOIRE — the original's regulars do not stand at the glass with
// one sentence welded to their face: Jorji protests differently in week two
// ("...I no do anything!" / "...Is mistake!"). The variant is CAMPAIGN
// CHAPTER, floor(seed / REGULARS.length) % 2: week 0 (seeds 0–5) speaks the
// canonical literals every existing fixture replays, week 1 meets the same
// faces saying their alternates. Seed+day parity could not do this — the
// visit law's period is six, so a face at a seat keeps parity forever and
// the repertoire would be theatre. Zero rnd: pure over the seed.
export const repChapter = (seed) => Math.floor(seed / REGULARS.length) % 2
export const TURN_CANONICAL = '...I NO DO ANYTHING.'
export const turnLineFor = (c, seed) => (repChapter(seed) ? c.turnAlt : TURN_CANONICAL)
export const againLineFor = (c, seed) => (repChapter(seed) ? c.againAlt : c.lines.again)

// Late-October start, like the original's campaign: the week crosses a REAL
// month-end (OCT 27…31, NOV 01–02). Day 6's EXPIRED test paper prints the
// first cross-month verdict the booth renders — EXPIRED OCT 31 1982 < TODAY
// NOV 01 1982 — the date arithmetic the border guard does every shift.
export const START_DATE = { y: 1982, m: 10, d: 27 }

// The trap species: six ways a careless eye convicts an innocent paper.
// Each names the rule it tempts you to misapply; a species cannot run
// before its rule wakes up.
export const TRAPS = [
    { rule: 'ALLOWED', how: 'passport country is on the list; the CITY belongs to a shut country' },
    { rule: 'EXPIRED', how: 'expiry is exactly TODAY — "before today" still lets it through' },
    { rule: 'WEIGHT', how: 'passport weight matches the scale; the ID card prints another weight (no rule reads it)' },
    { rule: 'WANTED', how: 'same NAME as a sheet entry, different passport number' },
    { rule: 'IDMATCH', how: 'ID name matches; the HEIGHT differs (height is not a rule)' },
    { rule: 'IDREQ', how: 'no ID card, but the DOB makes them a child — children are exempt' },
    { rule: 'CURFEW', how: 'valid for exactly 7 more days — curfew counts days AFTER today' },
    { rule: 'PORTRAIT', how: 'the photo shows the SAME face, years ago — grey hair; the rule compares cut, shape, glasses, facial hair, brows, mouth — never color' },
]

// #1938 PORTRAIT — the face descriptor. Every applicant gets one; the
// live face at the counter AND the passport photo of an honest paper are
// painted from the SAME descriptor (that identity is paperscheck's law).
// Structural fields (style/narrow/glasses/must/brow/mouth — the last two
// added by #1972) are the PORTRAIT rule's comparison set; colors
// (skin/hairC/shirtC) are atmosphere: the aged-photo trap moves ONLY a
// color, and no rule may convict on color.
// GREY is a hair color index, not a structural change.
export const GREY = 3

// #1989 ONE-OFF CROWD — the original's line is dozens of distinct people:
// miners in flat caps, a fur ushanka, a woman's headscarf, a thick unibrow,
// a gold earring, a missing tooth. Here those accessories ride as DECOR on
// the face descriptor (doctrine of the nose: never compared, never evidence,
// colors included). Variety is a PURE FUNCTION of the passport serial — a
// pure hash, no rnd() draw, so the whole seed stream keeps its sequence
// (names, numbers, weights, faces all replay exactly as before) and identity
// is by construction: your number decides your hat, and the SAME decor object
// is spread into `photo`, so face and photo can never disagree.
// hat: 0 none, 1 flat cap, 2 ushanka, 3 headscarf.
// #1996 THE NATIONS DRESS — the original's crowd dresses by origin: Kirinian
// workers in flat caps, Antegrian officers kept covered, Veskole fur ushankas,
// southern wraps in Parmenistan, and the women across the line favor the
// headscarf. Here that is a CORRELATION, not a uniform: the table biases hat
// KIND and coverage rate by the entrant's own country + sex, while ARSTOTZKA
// (the host nation) stays deliberately mixed and the sparse families get a
// national tint (Veskole brows, Parmenistani gold, Kirinian teeth). The serial
// law is untouched — still a pure hash, now salted by country and sex, zero
// rnd() draws, so the seed stream keeps its sequence and same number + same
// papers means same hat forever. Paperscheck grades the correlation live (per-
// nation dominance + ARSTOTZKA mixing) and a nation-blind mutant (m33) dies
// on those gates. Doctrine unchanged: decor is never in FEATURES, never
// evidence — decide never reads hat/nation.
const HAT_HOME = { KIRINIA: 1, ANTEGRIA: 1, VESKOLE: 2, PARMENISTAN: 3 }
export function accFor(pic, country, sex) {
    const ci = COUNTRIES.indexOf(country) + 1
    const h = Math.imul((pic ^ 0x5bd1e996) ^ Math.imul(ci, 0x9e3779b1) ^ (sex === 'F' ? 0x85ebca6b : 0xc2b2ae35), 0x27d4eb2f) >>> 0
    const cover = country === 'ANTEGRIA' ? 11 : country === 'VESKOLE' ? 9 : 8   // officers keep their heads covered; the north wears fur
    let hat = 0
    if ((h & 31) < cover) {
        if (sex === 'F') hat = country === 'VESKOLE' && ((h >>> 9) & 3) ? 2 : 3   // scarves across the line; Veskole wraps in fur
        else hat = HAT_HOME[country] || (1 + ((h >>> 5) % 3))                     // ARSTOTZKA rolls its mix
    }
    return {
        hat,
        uni: ((h >>> 7) & 7) === 0 || (country === 'VESKOLE' && (h >>> 19) % 5 === 0) ? 1 : 0,
        ear: ((h >>> 11) & 7) === 0 || (country === 'PARMENISTAN' && (h >>> 21) % 5 === 0) ? 1 : 0,
        gap: ((h >>> 15) & 15) < 2 || (country === 'KIRINIA' && (h >>> 23) % 7 === 0) ? 1 : 0,
        // #2087 SHADES + BODIES — the original's one-offs also show up in
        // tinted lenses and different builds. Same doctrine: decor, never in
        // FEATURES, never evidence; shades ride their OWN ink (drawFace's
        // SHADES_COL), so the compared glasses family keeps its own pixels.
        shades: ((h >>> 17) & 15) === 0 || (country === 'ANTEGRIA' && (h >>> 29) % 5 === 0) ? 1 : 0,
        body: (h >>> 3) % 3,
        post: (h >>> 27) & 1,
    }
}

// #2087 THE CROWD MURMURS — the original's line grumbles while it waits:
// one-offs get half-heard lines ("I have no papers", "My friend is waiting").
// Same doctrine as the arc speech: atmosphere the booth prints — decide never
// reads `mutter` (paperscheck verdict-twins it off every paper) — but pure by
// construction: a hash of the passport serial, ZERO rnd() draws, so the seed
// stream keeps its sequence and the same number keeps its murmur forever.
// Regulars speak in full sentences (their authored `say`), so they never
// mutter; the booth prints murmurs in dim type inside the empty bubble field,
// never on paper — the recognition bubble stays the neighborhood's own.
export const MUTTERS = [
    'I HAVE NO PAPERS.',
    'MY FRIEND IS WAITING.',
    '...COLD OUT THERE.',
    'THE LINE NEVER MOVES.',
    'IS IT MY TURN?',
    'I STOOD HERE ALL MORNING.',
    'THE MAN BEFORE ME LEFT.',
    'JUST A STAMP, GUARD.',
]
export function mutterFor(pic) {
    const h = Math.imul((pic ^ 0x2545f491) ^ Math.imul(pic >>> 7, 0x9e3779b1), 0x85ebca6b) >>> 0
    return (h & 127) < 44 ? MUTTERS[(h >>> 9) % MUTTERS.length] : null
}

let PERSON_ID = 0

// Names are UNIQUE among a day's entrants: if two entrants shared a name,
// "the name is on the wanted sheet" would frame the innocent twin, and the
// trap budget could not be honest. Callers pass the day's used-name set.
function drawName(rnd, used) {
    for (let k = 0; k < 200; k++) {
        const name = `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`
        if (!used.has(name)) { used.add(name); return name }
    }
    throw new Error('name pool exhausted')
}

// a fully legal applicant; every builder below mutates EXACTLY ONE thing
function base(rnd, date, dayRules, used, opts = {}) {
    const allowed = opts.allowed
    const country = opts.country || allowed[Math.floor(rnd() * allowed.length)]
    const cityPool = opts.city || CITIES[country]
    const adult = !opts.child
    const dob = adult
        ? { y: date.y - 19 - Math.floor(rnd() * 33), m: 1 + Math.floor(rnd() * 12), d: 1 + Math.floor(rnd() * 28) }
        : { y: date.y - 2 - Math.floor(rnd() * 15), m: 1 + Math.floor(rnd() * 12), d: 1 + Math.floor(rnd() * 28) }
    const name = drawName(rnd, used)
    const pp = {
        name,
        id: 4000 + (PERSON_ID++ % 2800),
        dob,
        sex: rnd() < 0.5 ? 'M' : 'F',
        height: 150 + Math.floor(rnd() * 40),
        weight: 52 + Math.floor(rnd() * 38),
        country,
        city: Array.isArray(cityPool) ? cityPool[Math.floor(rnd() * cityPool.length)] : cityPool,
        expiry: opts.expiry || dadd(date, 40 + Math.floor(rnd() * 400)),
    }
    const wantId = opts.idcard !== undefined ? opts.idcard : (dayRules.includes('IDREQ') || rnd() < 0.35)
    const idcard = wantId ? { name, height: pp.height, weight: pp.weight, dob } : null
    // #1938: roll the face AFTER the papers so existing seed draws keep
    // their names/numbers/weights — only the face stream is new. An honest
    // paper's photo and live face are the SAME descriptor; every later
    // mutation that touches one and not the other is by definition a
    // portrait break (or, for a color-only touch, the aged-photo trap).
    const face = {
        skin: Math.floor(rnd() * 5),
        hairC: Math.floor(rnd() * 5),
        shirtC: Math.floor(rnd() * 4),
        style: Math.floor(rnd() * 4),
        narrow: rnd() < 0.4 ? 1 : 0,
        glasses: rnd() < 0.35 ? 1 : 0,
        must: adult && rnd() < 0.3 ? 1 : 0,
        // #1972 PORTRAIT-DETAIL: two more structural features the original's
        // eye roams. Two new rnd() draws per face re-sequenced every later
        // draw, so seeds present NEW weeks (still deterministic — paperscheck
        // judges properties, not old fixtures); brow runs a little hot (0.45)
        // so the thick/thin read shows up fast on the wall.
        brow: rnd() < 0.45 ? 1 : 0,
        mouth: rnd() < 0.35 ? 1 : 0,
    }
    // #1989: the serial is rolled exactly where it was before (first draw
    // after the face) and decor is a pure hash of it — zero new draws, zero
    // re-sequencing. Attach BEFORE the photo spread: decor is born shared,
    // so face and photo carry the same hat by construction.
    const pic = Math.floor(rnd() * 1e9)
    const acc = accFor(pic, country, pp.sex)
    face.hat = acc.hat; face.uni = acc.uni; face.ear = acc.ear; face.gap = acc.gap
    // #2087 the bodies and shades attach the same way — born shared, so the
    // photo carries the same build and the same dark lenses as the counter.
    face.shades = acc.shades; face.body = acc.body; face.post = acc.post
    // #2087 THE CROWD MURMURS — one-offs grumble; the line rides the serial
    // hash (zero draws). regularApplicant clears it: a neighbor's speech is
    // authored, never muttered.
    const mutter = mutterFor(pic)
    pp.photo = { ...face }
    return {
        trap: null,
        breakRule: null,
        // #1996: `nation` is the country the CLOTHES were rolled from (the
        // truth at birth — an ALLOWED-lie paper keeps its home dress, the
        // papers lie but the coat doesn't). Pure atmosphere: decide reads no
        // more of it than of a hat (FEATURES unchanged), papersplay's
        // cross-process witness matches the browser decor against Node's
        // accFor(pic, nation, sex) with it.
        person: { pic, nation: country, mutter, face, papers: wantId ? ['passport', 'idcard'] : ['passport'], passport: pp, idcard },
        truth: {
            hasPassport: true, hasIdCard: !!idcard, trueName: name, idName: idcard ? idcard.name : null,
            country, expiry: pp.expiry, dob, trueWeight: pp.weight, wanted: false, photoMismatch: false,
        },
    }
}

function badCity(rnd, day) {
    const shut = COUNTRIES.filter((c) => !day.allowed.includes(c))
    const bad = shut[Math.floor(rnd() * shut.length)]
    return [bad, CITIES[bad][Math.floor(rnd() * 2)]]
}

// one violator per active rule — breaks EXACTLY that rule and nothing else
function violator(rule, rnd, date, dayRules, day, used) {
    const a = base(rnd, date, dayRules, used, { allowed: day.allowed })
    const pp = a.person.passport
    switch (rule) {
        case 'PASSPORT':
            a.person.papers = []
            a.person.passport = null
            a.truth.hasPassport = false
            break
        case 'ALLOWED': {
            const [bad, city] = badCity(rnd, day)
            a.person.passport = { ...pp, country: bad, city }
            a.truth.country = bad
            break
        }
        case 'EXPIRED': {
            const exp = dadd(date, -1)
            a.person.passport = { ...a.person.passport, expiry: exp }
            a.truth.expiry = exp
            break
        }
        case 'WEIGHT': {
            a.truth.trueWeight = a.person.passport.weight + 1 + Math.floor(rnd() * 7)   // the scale shows the truth
            break
        }
        case 'WANTED': {
            a.truth.wanted = true
            day.wanted.push({ name: pp.name, id: pp.id, planted: true })
            break
        }
        case 'IDMATCH': {
            if (!a.person.idcard) {
                a.person.papers = ['passport', 'idcard']
                a.person.idcard = { name: pp.name, height: pp.height, weight: pp.weight, dob: pp.dob }
                a.truth.hasIdCard = true
            }
            const li = (LAST.indexOf(a.person.idcard.name.split(' ')[1]) + 1) % LAST.length
            a.person.idcard = { ...a.person.idcard, name: `${a.person.idcard.name.split(' ')[0]} ${LAST[li]}` }
            a.truth.idName = a.person.idcard.name
            break
        }
        case 'IDREQ':
            a.person.papers = ['passport']
            a.person.idcard = null
            a.truth.hasIdCard = false
            break
        case 'CURFEW': {
            const exp = dadd(date, 1 + Math.floor(rnd() * 6))   // 1..6 days of grace: under seven
            a.person.passport = { ...a.person.passport, expiry: exp }
            a.truth.expiry = exp
            break
        }
        case 'PORTRAIT': {
            // the forged photo: the PASSPORT lies about the face while the
            // body at the counter tells the truth. Exactly ONE compared
            // feature flips; colors ride along untouched (a color-only move
            // is the aged-photo trap, not a break).
            const feat = FEATURES[Math.floor(rnd() * FEATURES.length)]
            const photo = { ...a.person.face }
            if (feat === 'style') photo.style = (photo.style + 1 + Math.floor(rnd() * 3)) % 4
            else photo[feat] = photo[feat] ? 0 : 1
            a.person.passport = { ...a.person.passport, photo }
            a.truth.photoMismatch = true
            a.breakFeature = feat
            break
        }
        default: throw new Error(`no builder for rule ${rule}`)
    }
    a.breakRule = rule
    return a
}

// one legal applicant per trap species — nothing is wrong with the papers,
// a naive eye still convicts.
function trapApplicant(species, rnd, date, dayRules, day, used) {
    const s = TRAPS[species]
    if (!dayRules.includes(s.rule)) throw new Error(`trap ${s.rule} cannot run without its rule`)
    const a = base(rnd, date, dayRules, used, {
        allowed: day.allowed,
        child: s.rule === 'IDREQ',
        idcard: s.rule === 'WEIGHT' || s.rule === 'IDMATCH' ? true : undefined,
    })
    const pp = a.person.passport
    switch (s.rule) {
        case 'ALLOWED': {
            const [, city] = badCity(rnd, day)
            a.person.passport = { ...pp, city }
            break
        }
        case 'EXPIRED':
            a.person.passport = { ...pp, expiry: { ...date } }   // expires TODAY — still valid
            a.truth.expiry = { ...date }
            break
        case 'WEIGHT':
            a.person.idcard = { ...a.person.idcard, weight: pp.weight + 3 + Math.floor(rnd() * 5) }
            break
        case 'WANTED':
            day.wanted.push({ name: pp.name, id: 7000 + Math.floor(rnd() * 800), planted: true })   // same name, other number
            break
        case 'IDMATCH':
            a.person.idcard = { ...a.person.idcard, height: pp.height + 3 + Math.floor(rnd() * 6) }
            break
        case 'IDREQ':
            a.person.papers = ['passport']
            a.person.idcard = null
            a.truth.hasIdCard = false
            break
        case 'CURFEW': {
            const exp = dadd(date, 7)   // exactly 7 days of grace: the law counts days AFTER today
            a.person.passport = { ...pp, expiry: exp }
            a.truth.expiry = exp
            break
        }
        case 'PORTRAIT': {
            // the aged photo: hair gone grey, every compared feature intact.
            // Time changes color; forgery changes the face. If the live hair
            // rolled grey too, ground it dark first (#2c2622) — colors judge
            // nothing, and the planted trap stays exactly one visible move.
            if (a.person.face.hairC === GREY) a.person.face = { ...a.person.face, hairC: 0 }
            a.person.passport = { ...pp, photo: { ...a.person.face, hairC: GREY } }
            break
        }
        default: throw new Error(`no trap builder for ${s.rule}`)
    }
    a.trap = s.rule
    return a
}

// a regular walks up with an authored face and papers that are BUILT legal
// for the day (country from the day's list, expiry past the curfew seam, the
// ID card IDREQ demands). The authored half is identity — name, body, face,
// mark; the legal half is paperwork, exactly like the original's regulars
// whose documents evolve with the campaign. photo === face: the booth's PORTRAIT
// machinery sees a perfectly honest paper, and the mark rides into the photo.
function regularApplicant(c, rnd, date, dayRules, day, used, seed, n, aged = false) {
    const a = base(rnd, date, dayRules, used, { allowed: day.allowed })
    const dob = { y: date.y - c.ageYears, m: c.dobM, d: c.dobD }
    const regIdx = REGULARS.findIndex((k) => k.id === c.id)
    // #2080 MARKS AGE — the original's regulars come back CHANGED (Jorji's
    // forged papers evolve week over week). Here the signature mark grows one
    // step on a return visit: the scar gains its fourth stitch, the mole
    // spreads, a third wrinkle prints, the freckle cluster thickens, the
    // bandage gets a fresh pad, the big ear grows taller. The step is the
    // visit index the walk law already knows (0 the first week's walk-up,
    // 1 any return) — zero rnd, so the seed stream keeps its sequence. Decor
    // by the doctrine of the nose: markStep rides face AND photo together
    // (the naive eye walks every key — an asymmetric key would plant a fake
    // trap on an honest paper, so paperscheck pins symmetry), decide reads
    // nothing, and first visits stay byte-identical to the castPix baselines.
    const visit = n > firstVisitDay(seed, regIdx) ? 1 : 0
    const face = { ...c.face, mark: c.mark, markStep: visit }
    a.person.face = face
    a.person.mark = c.mark
    a.person.regular = c.id
    // #2087: a neighbor's speech is authored (say/arc lines below) — the
    // serial-hash murmur is the one-off crowd's voice, never the cast's.
    a.person.mutter = null
    a.person.passport = { ...a.person.passport, name: c.name, sex: c.sex, dob, height: c.height, weight: c.weight, photo: { ...face } }
    if (a.person.idcard) {
        a.person.idcard = { ...a.person.idcard, name: c.name, dob, height: c.height, weight: c.weight }
        a.truth.idName = c.name
    }
    a.truth.trueName = c.name
    a.truth.dob = dob
    a.truth.trueWeight = c.weight
    // #1983 THE ARC + callback lines. `say` is atmosphere the booth prints —
    // decide never reads it (purity law); it is the player's recognition beat.
    // The arc day is the ONLY regular appearance the wall convicts: the sheet
    // pairs the authored name with the number they carry THAT day (papers are
    // rebuilt per visit, like the original's evolving documents), and the
    // truth agrees. Everything else about them stays honest — pull the sheet
    // entry and the paper approves (paperscheck's pull-the-witness pin).
    const arc = arcForWeek(seed)
    if (n === arc.day && c.id === arc.id) {
        a.person.arc = true
        a.person.recall = 'turn' // #1982 the wall interrupts the welcome — still a returning face
        // #1988 REPERTOIRE: the turn's protest rides the chapter, and the
        // person carries the argue line the booth prints when they're taken.
        a.person.say = ['YOU AGAIN.', turnLineFor(c, seed)]
        a.person.seize = c.seize
        // #1988 THE BULLETIN PRINTS A FACE: the arc's sheet entry carries the
        // authored descriptor (identity law — the mugshot IS the neighbor), so
        // the wall prints the portrait next to the name like the original.
        // Decor by doctrine: decide reads name+number only, and the fairness
        // twin strips say/seize/face and cannot flinch.
        day.wanted.push({ name: c.name, id: a.person.passport.id, planted: true, face: { ...c.face, mark: c.mark } })
        a.truth.wanted = true
    } else if (n > firstVisitDay(seed, regIdx)) {
        a.person.recall = 'again' // #1982 RECOGNITION AUDIO: the structural memory
        // behind the arrival chime — set by the visit law itself, never by
        // the words, so stripping speech can never mute the bell.
        // #1997 PERSONAL SPEECH — the returning neighbor says its own piece,
        // the booth remembers more than one phrase. #2003 THE LONG CONVERSATION
        // adds the payoff: the return answers the topic the greeting opened
        // (Grubak's long bread line is STILL breadless a visit later). Still
        // atmosphere (decide never reads it; paperscheck pins purity every day,
        // not just the arc). #1988 REPERTOIRE: the callback beat rides the
        // campaign chapter — the same neighbor, a different week, a different
        // piece of small talk (the payoff line stays: the thread it answers
        // was planted this week).
        a.person.say = ['YOU AGAIN.', againLineFor(c, seed), c.lines.follow]
    } else {
        // first walk-up of the week: the neighbor introduces itself AND opens
        // its topic (#2003 lines.hook) — the thread the return will answer.
        // The arc face's first visit is the honest walk-up remembered later —
        // and it greets too; the original's regulars never stood silent.
        // Since #2012 this branch also speaks on the CROWDED days: the tail
        // seat's first walk-up lands on a return day, so one shift carries
        // both a "YOU AGAIN." and a fresh introduction.
        a.person.recall = null // #1982 a first walk-up has no memory to ring
        a.person.say = [c.lines.greet, c.lines.hook]
    }
    // #2080 THE AGED PHOTO WEARS A NEIGHBOUR'S FACE — once a week the
    // #1938 trap rides a familiar face, not a stranger: the day-7 returning
    // head hands over the grey print of itself — same face, years ago. Color
    // never convicts, so the paper stays honest (decide AND judge approve —
    // the trap is aimed at the eye, and the recognition chime rings first:
    // the welcome IS the hiding place). Tadek cannot carry it — his authored
    // hair is already grey, and grey-on-grey is no visible move; on his week
    // the day keeps its scheduled second trap instead (genWeek), so the
    // budget stays identical.
    if (aged && n === 7 && c.id === REGULARS[(seed + 1) % REGULARS.length].id && c.face.hairC !== GREY) {
        a.person.passport = { ...a.person.passport, photo: { ...a.person.passport.photo, hairC: GREY } }
        a.trap = 'PORTRAIT'
    }
    return a
}

// #2080 THE NEIGHBOUR'S TRAP — once a week the day-7 returning head carries
// the aged photo (#1938 species) instead of a stranger. The day already hosts
// its scheduled two traps, so one must step out of the LINE — but coverage is
// a construction, not a hope: only a trap whose species the week has ALREADY
// shown (a re-run) may be demoted, preferring trap2; CURFEW (awake only here)
// can never be demoted. When both day-7 traps are their species' sole weekly
// showing, the neighbour keeps its week clean and the strangers keep the
// stage. The demoted applicant still consumes its draws and its wall row
// (burned, not deleted), so every name, number and face after it replays
// exactly as before, the queue keeps its size, and genDay(seed, 7, …)
// standalone answers the identical day. Tadek's hair is authored grey, so on
// his week the trap has nothing to age — it stays with the strangers.
export const neighbourTrapWeek = (seed) => REGULARS[(seed + 1) % REGULARS.length].face.hairC !== GREY
// which of day 7's scheduled traps vacates its line seat (null = none):
// a species already staged days 1-6 (or doubled on day 7 itself) is safely
// demoted; the neighbour then takes that seat. Pure over the seed — genDay
// consults it, so a standalone genDay replays the week's day exactly.
export function day7Demote(seed, schedule = trapSchedule(seed)) {
    if (!neighbourTrapWeek(seed)) return null
    const shown = new Set()
    for (const p of schedule) {
        if (p.n >= 7) break
        if (p.ti !== null) shown.add(p.ti)
        if (p.t2 !== null) shown.add(p.t2)
    }
    const p7 = schedule[6]
    if (p7.t2 !== null && (shown.has(p7.t2) || p7.t2 === p7.ti)) return 't2'
    if (p7.ti !== null && shown.has(p7.ti)) return 't1'
    return null
}

export function genDay(seed, n, trapIdx, trap2Idx = null) {
    PERSON_ID = n * 37 + seed * 601
    const rnd = mulberry32((seed + 1) * 100003 + n * 7919)
    const rules = DAY_RULES[n - 1]
    const date = dadd(START_DATE, n - 1)
    const dateNum = dnum(date)
    const keep = n > 4 ? 3 : 4
    const allowed = COUNTRIES.slice()
    for (let i = allowed.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [allowed[i], allowed[j]] = [allowed[j], allowed[i]] }
    const day = {
        n, date, dateNum, rules,
        allowed: allowed.slice(0, keep),
        wanted: [],
        scale: 0,
        queue: [],
    }
    const used = new Set()
    // #1979: cast names are blocked from the random pool for the whole day —
    // a generated twin of a regular would break the recurrence (two GRUBAKs
    // at one window is a forgery of the neighborhood, not the neighborhood).
    for (const c of REGULARS) used.add(c.name)
    // #1908 THE WALL THAT LIVES: the WHOLE week's bulletin rides the used-set
    // from the first draw — an entrant on any day can never carry the full name
    // of any wall row that week (the memory trap the old booth fell into: a
    // name wanted on Tuesday walking up on Friday, innocent, by construction).
    for (const nm of weekWallNames(seed)) used.add(nm)
    for (const rule of rules) day.queue.push(violator(rule, rnd, date, rules, day, used))
    // #2080 which day-7 trap vacates its line seat for the neighbour trap
    // (null on every other day — see day7Demote for the coverage law)
    const demote = n === 7 ? day7Demote(seed) : null
    if (trapIdx !== null && trapIdx !== undefined) {
        const t1 = trapApplicant(trapIdx, rnd, date, rules, day, used)
        if (demote !== 't1') day.queue.push(t1) // burned when demoted: draws and wall row stay spent (see day7Demote)
        // a second trap when the week's schedule asks for one (days 3 and 6,
        // and day 7 to close coverage) — genWeek picks it, so a standalone
        // genDay call replays EXACTLY the week's day
        if (trap2Idx !== null && trap2Idx !== undefined) {
            if (!rules.includes(TRAPS[trap2Idx].rule)) throw new Error(`trap2 ${TRAPS[trap2Idx].rule} has no rule on day ${n}`)
            const t2 = trapApplicant(trap2Idx, rnd, date, rules, day, used)
            if (demote !== 't2') day.queue.push(t2) // burned when demoted, same law (see day7Demote)
        }
    }
    // #1979: the regular walks in after the traps, before the fill — mid-line
    // like a face from the neighborhood. The queue's size law is untouched:
    // the fill loop simply lays one fewer random head per regular, so the
    // #1960 shift budget (queue x 18s) and every day-length pin stand as
    // written. #2012 THE CROWDED RETURN: days 6, 7 push TWO — the returning
    // head first, then the crowding tail greeting its first walk-up.
    for (const reg of regularsForDay(seed, n)) day.queue.push(regularApplicant(reg, rnd, date, rules, day, used, seed, n, demote !== null))
    // #2020 THE CROWDED SHIFT SPEAKS — on a crowded day the neighbors talk
    // through the line, like the original's queue where Jorji comments on
    // whoever stands ahead. Decor by doctrine: `aside` is authored here with
    // zero rnd() draws (no re-sequencing), is never in FEATURES, and is
    // never read by decide/judge — paperscheck strips it off every paper of
    // every seed and requires the verdict not to flinch. Two voices, one
    // shift: while the returning head works the glass a voice behind remarks
    // on the line; when the greeting tail arrives, the neighbor already
    // through the gate calls back — by name, so the two beats tie together.
    const regs = day.queue.filter((a) => a.person.regular)
    if (crowdedDay(seed, n) && regs.length >= 2) {
        regs[0].person.aside = { tag: 'A VOICE BEHIND YOU', line: 'THE LINE IS LONG TODAY.' }
        const headFirst = regs[0].person.passport.name.split(' ')[0]
        regs[1].person.aside = { tag: 'A VOICE FROM INSIDE', line: `${headFirst} SAYS HELLO.` }
    }
    while (day.queue.length < rules.length + 4) day.queue.push(base(rnd, date, rules, used, { allowed: day.allowed }))
    // decoy wanted entries: a wall that looks used must never frame a
    // person standing at the window — decoy names may not collide with any
    // entrant's name (a naive eye, and a careless harness, stop at names).
    // Three decoys, not two (#1902): the original bulletin carries five
    // portraits, so a day with both wanted traps plants a twin into a fuller
    // wall — planted vs printed stays honest (paperscheck pins <= 5 and the
    // fit sweep proves the fifth row lands above the scale box).
    // #1983: the arc takes a slot on its turn — the bulletin keeps the
    // original's capacity of five, so the arc day stages one decoy less.
    // #1908 THE WALL THAT LIVES: names come from the seed's week plan (distinct
    // across the week, pre-seeded into `used` so no entrant took one), ids stay
    // stream draws. The old post-hoc rewrite loop is now an assertion.
    const arcPlanted = day.queue.some((x) => x.person.arc)
    for (let k = 0; k < 3 - (arcPlanted ? 1 : 0); k++) {
        day.wanted.push({ name: wallNameAt(seed, n, k), id: 7000 + Math.floor(rnd() * 800), planted: false })
    }
    const entrants = day.queue.filter((a) => a.person.passport).map((a) => a.person.passport.name)
    for (const w of day.wanted) {
        if (w.planted) continue
        if (entrants.includes(w.name)) throw new Error(`day ${n}: decoy sheet name collides with an entrant — the living-wall plan is broken`)
    }
    // the scale is the booth's witness: it reads the TRUTH weight, per
    // entrant (the dial is weighed while the person stands on it).
    for (const a of day.queue) a.scale = a.truth.trueWeight
    day.scale = day.queue[0].scale
    const ids = day.queue.map((a) => a.person.passport && a.person.passport.id).filter(Boolean)
    if (new Set(ids).size !== ids.length) throw new Error(`day ${n}: duplicate passport numbers on one day`)
    return day
}

// The week picks the trap day first: the species whose rule is awake AND
// has not run yet, rotated by seed. By construction every species the week
// can legally stage is staged exactly once — coverage is a construction,
// not a hope. #2080 extracts the picks into trapSchedule so day7Demote can
// reason about coverage BEFORE the day is built — genWeek and genDay share
// this one schedule, so the standalone-replay law is untouched.
export function trapSchedule(seed) {
    const used = new Set()
    const plan = []
    for (let n = 1; n <= 7; n++) {
        const rules = DAY_RULES[n - 1]
        const active = TRAPS.map((t, i) => (rules.includes(t.rule) ? i : -1)).filter((i) => i >= 0)
        let trapIdx = null
        let trap2Idx = null
        if (n >= 2) {
            const open = active.filter((i) => !used.has(i))
            if (open.length) {
                trapIdx = open[(n - 2 + seed) % open.length]
                used.add(trapIdx)
            }
            // second traps: days 3 and 6 keep the clumsy run busy; day 7
            // closes coverage by taking the LAST species never staged
            if (n % 3 === 0 || n === 7) {
                const left = active.filter((i) => !used.has(i))
                trap2Idx = left.length ? left[(n + seed) % left.length] : (active.length > 1 ? active[(n + seed) % active.length] : null)
            }
        }
        plan.push({ n, ti: trapIdx, t2: trap2Idx })
    }
    return plan
}

export function genWeek(seed) {
    const plan = trapSchedule(seed)
    const days = []
    for (const p of plan) days.push(genDay(seed, p.n, p.ti, p.t2))
    return { seed, days }
}

// the booth's view of one applicant — the ONLY object decide() may read.
export function viewOf(day, a) {
    return {
        date: day.date, dateNum: day.dateNum, rules: day.rules,
        allowed: day.allowed, wanted: day.wanted, scale: a.scale,
        person: a.person,
    }
}
