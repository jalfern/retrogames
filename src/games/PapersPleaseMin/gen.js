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

import { DAY_RULES, dadd, dnum } from './rules.js'

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

export const START_DATE = { y: 1982, m: 10, d: 11 }

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
]

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
    return {
        trap: null,
        breakRule: null,
        person: { pic: Math.floor(rnd() * 1e9), papers: wantId ? ['passport', 'idcard'] : ['passport'], passport: pp, idcard },
        truth: {
            hasPassport: true, hasIdCard: !!idcard, trueName: name, idName: idcard ? idcard.name : null,
            country, expiry: pp.expiry, dob, trueWeight: pp.weight, wanted: false,
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
        default: throw new Error(`no trap builder for ${s.rule}`)
    }
    a.trap = s.rule
    return a
}

export function genDay(seed, n, trapIdx) {
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
    for (const rule of rules) day.queue.push(violator(rule, rnd, date, rules, day, used))
    const activeTrapIdx = TRAPS.map((t, i) => (rules.includes(t.rule) ? i : -1)).filter((i) => i >= 0)
    if (trapIdx !== null && trapIdx !== undefined) {
        day.queue.push(trapApplicant(trapIdx, rnd, date, rules, day, used))
        // a second trap on days divisible by three — only from species whose
        // RULE is awake (a trap for a sleeping law is a phantom, not a trap)
        if (n % 3 === 0 && activeTrapIdx.length > 1) {
            const i2 = (activeTrapIdx.indexOf(trapIdx) + 1 + Math.floor(rnd() * (activeTrapIdx.length - 1))) % activeTrapIdx.length
            day.queue.push(trapApplicant(activeTrapIdx[i2], rnd, date, rules, day, used))
        }
    }
    while (day.queue.length < rules.length + 4) day.queue.push(base(rnd, date, rules, used, { allowed: day.allowed }))
    // decoy wanted entries: a wall that looks used must never frame a
    // person standing at the window — decoy names may not collide with any
    // entrant's name (a naive eye, and a careless harness, stop at names).
    for (let k = 0; k < 2; k++) {
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
        let trapIdx = null
        if (n >= 2) {
            const open = TRAPS.map((t, i) => (rules.includes(t.rule) && !used.has(i) ? i : -1)).filter((i) => i >= 0)
            if (open.length) {
                trapIdx = open[(n - 2 + seed) % open.length]
                used.add(trapIdx)
            }
        }
        days.push(genDay(seed, n, trapIdx))
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
