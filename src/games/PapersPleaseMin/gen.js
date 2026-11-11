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

const FIRST = ['EMIL', 'KATYA', 'BORIS', 'ILIA', 'MARTA', 'ANJA', 'DRAGAN', 'VOLO', 'SERDA', 'PETR']
const LAST = ['KOSTOV', 'DRENIN', 'VASEK', 'LAGODA', 'ORLOV', 'TOLKA', 'ZEMEK', 'PALIN']

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
// the neighborhood, not a trap.
export const REGULARS = [
    {
        id: 'grubak', name: 'VOLEN GRUBAK', sex: 'M', ageYears: 47, dobM: 3, dobD: 14, height: 178, weight: 86,
        face: { skin: 2, hairC: 0, shirtC: 2, style: 1, narrow: 0, glasses: 0, must: 1, brow: 1, mouth: 0, hat: 1, uni: 1, ear: 0, gap: 0 },
        mark: 'scar',
        lines: { greet: 'GOOD DAY, GUARD.', hook: 'THE BREAD LINE WAS LONG.', again: 'BACK AGAIN, HA!', follow: 'STILL NO BREAD, HA!' },
    },
    {
        id: 'marko', name: 'MARKO DRENIN', sex: 'M', ageYears: 29, dobM: 8, dobD: 2, height: 164, weight: 61,
        face: { skin: 0, hairC: 1, shirtC: 0, style: 2, narrow: 1, glasses: 1, must: 0, brow: 0, mouth: 1, hat: 0, uni: 0, ear: 1, gap: 0 },
        mark: 'mole',
        lines: { greet: 'IS MY PAPER OK?', hook: 'I CHECKED IT TWICE.', again: 'NOTHING WRONG THIS TIME.', follow: 'I CHECKED IT THREE TIMES.' },
    },
    {
        id: 'anja', name: 'ANJA TOLKA', sex: 'F', ageYears: 55, dobM: 11, dobD: 21, height: 158, weight: 57,
        face: { skin: 4, hairC: 2, shirtC: 3, style: 0, narrow: 0, glasses: 0, must: 0, brow: 1, mouth: 0, hat: 3, uni: 0, ear: 0, gap: 1 },
        mark: 'wrinkle',
        lines: { greet: 'I VISIT MY DAUGHTER.', hook: 'HER FLAT IS IN THE CITY.', again: 'THE LINE IS SHORT TODAY.', follow: 'SHE SENDS HER THANKS.' },
    },
    {
        id: 'petr', name: 'PETR ZEMEK', sex: 'M', ageYears: 34, dobM: 5, dobD: 9, height: 171, weight: 74,
        face: { skin: 1, hairC: 4, shirtC: 1, style: 3, narrow: 1, glasses: 0, must: 1, brow: 0, mouth: 1, hat: 2, uni: 0, ear: 0, gap: 0 },
        mark: 'ear',
        lines: { greet: 'WORK IN THE CITY.', hook: 'THE TRAIN WAS LATE.', again: 'SAME BOOTH, SAME GUARD.', follow: 'THE TRAIN IS ON TIME.' },
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
    },
    {
        id: 'tadek', name: 'TADEK HRUBY', sex: 'M', ageYears: 62, dobM: 9, dobD: 30, height: 168, weight: 79,
        face: { skin: 4, hairC: 3, shirtC: 0, style: 1, narrow: 0, glasses: 1, must: 1, brow: 1, mouth: 1, hat: 0, uni: 0, ear: 0, gap: 1 },
        mark: 'patch',
        lines: { greet: 'I AM RETIRED, GUARD.', hook: 'THE PENSION BUYS LITTLE.', again: 'YOU LET ME THROUGH.', follow: 'LITTLE, BUT IT BUYS.' },
    },
]

// #1979 (amended #1997) THE ROTATING WINDOW — the cast is six, but a week
// has six cast slots (days 2-7) and the law needs FACES THAT COME BACK: a
// one-per-day walk over six seats would make every entrant a stranger.
// So each week the window of VISIT_WINDOW=4 seats rotates by the seed: the
// week meets cast[s..s+3] (mod 6), days 2,3,4,5, and seats s, s+1 RETURN on
// days 6, 7 — two recurrences a week, exactly as the original's neighborhood
// works, while different weeks meet different faces. Seed 0's week is
// byte-identical to the old cast-of-four mod-4 walk (0,1,2,3,0,1).
export const VISIT_WINDOW = 4
export const seatOff = (seed, regIdx) => (((regIdx - seed) % REGULARS.length + REGULARS.length) % REGULARS.length)
export const regularForDay = (seed, n) => (n >= 2 ? REGULARS[(seed + (n - 2) % VISIT_WINDOW) % REGULARS.length] : null)

// the day this seat FIRST walks up this week, or -1 when the window passed
// without it (the neighborhood rotates; not every face leans on the glass).
export const firstVisitDay = (seed, regIdx) => {
    const off = seatOff(seed, regIdx)
    return off < VISIT_WINDOW ? 2 + off : -1
}

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

// Late-October start, like the original's campaign: the week crosses a REAL
// month-end (OCT 27…31, NOV 01–02). Day 6's EXPIRED test paper prints the
// first cross-month verdict the booth renders — EXPIRED 1982.10.31 < TODAY
// 1982.11.01 — the date arithmetic the border guard does every shift.
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
export function accFor(pic) {
    const h = Math.imul(pic ^ 0x5bd1e996, 0x27d4eb2f) >>> 0
    return {
        hat: (h & 31) < 8 ? 1 + ((h >>> 5) % 3) : 0,   // 25% wear a head, kind spread
        uni: ((h >>> 7) & 7) === 0 ? 1 : 0,             // unibrow
        ear: ((h >>> 11) & 7) === 0 ? 1 : 0,            // gold earring
        gap: ((h >>> 15) & 15) < 2 ? 1 : 0,             // missing tooth
    }
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
    const acc = accFor(pic)
    face.hat = acc.hat; face.uni = acc.uni; face.ear = acc.ear; face.gap = acc.gap
    pp.photo = { ...face }
    return {
        trap: null,
        breakRule: null,
        person: { pic, face, papers: wantId ? ['passport', 'idcard'] : ['passport'], passport: pp, idcard },
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
function regularApplicant(c, rnd, date, dayRules, day, used, seed, n) {
    const a = base(rnd, date, dayRules, used, { allowed: day.allowed })
    const dob = { y: date.y - c.ageYears, m: c.dobM, d: c.dobD }
    const face = { ...c.face, mark: c.mark }
    a.person.face = face
    a.person.mark = c.mark
    a.person.regular = c.id
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
    const regIdx = REGULARS.findIndex((k) => k.id === c.id)
    const arc = arcForWeek(seed)
    if (n === arc.day && c.id === arc.id) {
        a.person.arc = true
        a.person.say = ['YOU AGAIN.', '...I NO DO ANYTHING.']
        day.wanted.push({ name: c.name, id: a.person.passport.id, planted: true })
        a.truth.wanted = true
    } else if (n > firstVisitDay(seed, regIdx)) {
        // #1997 PERSONAL SPEECH — the returning neighbor says its own piece,
        // the booth remembers more than one phrase. #2003 THE LONG CONVERSATION
        // adds the payoff: the return answers the topic the greeting opened
        // (Grubak's long bread line is STILL breadless a visit later). Still
        // atmosphere (decide never reads it; paperscheck pins purity every day,
        // not just the arc).
        a.person.say = ['YOU AGAIN.', c.lines.again, c.lines.follow]
    } else {
        // first walk-up of the week: the neighbor introduces itself AND opens
        // its topic (#2003 lines.hook) — the thread the return will answer.
        // The arc face's first visit is the honest walk-up remembered later —
        // and it greets too; the original's regulars never stood silent.
        a.person.say = [c.lines.greet, c.lines.hook]
    }
    return a
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
    for (const rule of rules) day.queue.push(violator(rule, rnd, date, rules, day, used))
    if (trapIdx !== null && trapIdx !== undefined) {
        day.queue.push(trapApplicant(trapIdx, rnd, date, rules, day, used))
        // a second trap when the week's schedule asks for one (days 3 and 6,
        // and day 7 to close coverage) — genWeek picks it, so a standalone
        // genDay call replays EXACTLY the week's day
        if (trap2Idx !== null && trap2Idx !== undefined) {
            if (!rules.includes(TRAPS[trap2Idx].rule)) throw new Error(`trap2 ${TRAPS[trap2Idx].rule} has no rule on day ${n}`)
            day.queue.push(trapApplicant(trap2Idx, rnd, date, rules, day, used))
        }
    }
    // #1979: the regular walks in after the traps, before the fill — mid-line
    // like a face from the neighborhood. The queue's size law is untouched:
    // the fill loop simply lays one fewer random head, so the #1960 shift
    // budget (queue x 18s) and every day-length pin stand as written.
    const reg = regularForDay(seed, n)
    if (reg) day.queue.push(regularApplicant(reg, rnd, date, rules, day, used, seed, n))
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
    const arcPlanted = day.queue.some((x) => x.person.arc)
    for (let k = 0; k < 3 - (arcPlanted ? 1 : 0); k++) {
        day.wanted.push({ name: `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`, id: 7000 + Math.floor(rnd() * 800), planted: false })
    }
    const entrants = day.queue.filter((a) => a.person.passport).map((a) => a.person.passport.name)
    for (const w of day.wanted) {
        if (w.planted) continue
        let guard = 0
        while (entrants.includes(w.name) && guard++ < 60) {
            w.name = `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`
        }
        if (entrants.includes(w.name)) throw new Error(`day ${n}: decoy sheet name collides with an entrant — trap budget cannot be honest`)
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
// not a hope.
export function genWeek(seed) {
    const used = new Set()
    const days = []
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
        days.push(genDay(seed, n, trapIdx, trap2Idx))
    }
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
