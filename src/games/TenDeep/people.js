// TEN-DEEP — THE CREATE (stage 3 of #1127): who a hero IS.
// Wizardry (Apple II, 1981) made the party a piece of paper before it was a
// crew: race shifts the stats and closes some doors, the class gates entry and
// owns the spellbook, alignment is a real stat you pay for. All names, gates
// and numbers here are our own IP; the SHAPE of the system is the 1981 one.
// No Math.random anywhere: candidates roll on mulberry32 fed by the town seed.

import { mulberry32 } from './dungeon.js'

export const RACES = {
    VASK:    { name: 'VASK',    abbr: 'VA', hp: 2,  mp: 0,  atk: 1,  def: 0,  spd: 0,  aff: 0, gift: 'the long arm: +1 atk' },
    ELPHAME: { name: 'ELPHAME', abbr: 'EL', hp: 0,  mp: 2,  atk: 0,  def: 0,  spd: 1,  aff: 2, gift: 'old blood: +2 affinity' },
    DURROW:  { name: 'DURROW',  abbr: 'DU', hp: 2,  mp: 0,  atk: 0,  def: 2,  spd: -1, aff: -1, gift: 'stoneborn: +2 def', bans: ['MAGUS', 'OATHBOUND'] },
    KNUM:    { name: 'KNUM',    abbr: 'KN', hp: -2, mp: 4,  atk: -1, def: 0,  spd: 0,  aff: 1, gift: 'deep wells: +4 mp, -1 atk' },
    HOB:     { name: 'HOB',     abbr: 'HB', hp: -3, mp: 0,  atk: 0,  def: 0,  spd: 2,  aff: 0, gift: 'small feet: +2 spd' },
}

export const ALIGNMENTS = {
    OATH:   { name: 'OATH',   abbr: 'OA', def: 1, atk: 0,  spd: 0, desc: 'the shield first: +1 def' },
    WANDER: { name: 'WANDER', abbr: 'WN', def: 0, atk: 0,  spd: 1, desc: 'no lord, no law: +1 spd' },
    RUIN:   { name: 'RUIN',   abbr: 'RU', def: -1, atk: 2, spd: 0, desc: 'the hungry way: +2 atk, -1 def' },
}
export const ALIGN_ORDER = ['OATH', 'WANDER', 'RUIN']

// spells: cost MP, ignored armour, power scales with the caster's level.
// `kind` picks how resolveRound spends it; `noBoss` = the King cannot be
// commanded to kneel.
export const SPELLS = {
    firebolt:  { name: 'FIREBOLT',   cost: 3,  kind: 'damage', power: (l) => 10 + l * 4 },
    firestorm: { name: 'FIRESTORM',  cost: 8,  kind: 'damage', power: (l) => 22 + l * 6 },
    heal:      { name: 'HEAL',       cost: 4,  kind: 'healOne', power: (l) => 16 + l * 3 },
    prayer:    { name: 'PRAYER',     cost: 6,  kind: 'healAll', power: (l) => 6 + l * 2 },
    ward:      { name: 'WARD',       cost: 5,  kind: 'ward', power: () => 0 },
    heel:      { name: 'HEEL',       cost: 7,  kind: 'subdue', power: () => 0, noBoss: true },
}

// class = entry requirements + the spell ladder. castLvl N means the letter
// arrives in the book when the hero reaches level N — spells are EARNED.
export const CLASSES = {
    FECHT:     { name: 'FECHT',     abbr: 'FC', req: {}, reqText: 'the trained steel', hpBonus: 4, atkBonus: 1, spells: {} },
    MAGUS:     { name: 'MAGUS',     abbr: 'MS', req: { aff: 10 }, reqText: 'affinity 10', hpBonus: -2, spells: { firebolt: 1, firestorm: 5, ward: 7, heel: 9 } },
    CLERIC:    { name: 'CLERIC',    abbr: 'CR', req: { aff: 7 }, reqText: 'affinity 7', spells: { heal: 1, prayer: 4 } },
    FOOTPAD:   { name: 'FOOTPAD',   abbr: 'FP', req: { spd: 6 }, reqText: 'speed 6', spells: {} },
    OATHBOUND: { name: 'OATHBOUND', abbr: 'OB', req: { aff: 8, atk: 9 }, reqText: 'affinity 8 · atk 9', hpBonus: 2, spells: { heal: 3, firebolt: 5, ward: 7, prayer: 9 } },
}
export const CLASS_ORDER = ['FECHT', 'MAGUS', 'CLERIC', 'FOOTPAD', 'OATHBOUND']

// own-IP names, tavern bench and preset company alike
export const NAMES = [
    'THANREL', 'MIRABEL', 'OSRIC', 'GWENDA', 'BORAM', 'ELARA',
    'HALGAR', 'Yarrow', 'Nettle', 'ORIN', 'Sable', 'KESTREL', 'Bryn', 'Ashford',
    'Marrow', 'Vess', 'Cobble', 'Liorin', 'Pell', 'WREN', 'Dunstan', 'Ilsa',
    'GRIM', 'Fenwick', 'Sorrel', 'Tamsin',
]

// the roll before alignment: base bands + the race's shifts. Never empty.
export function rollBody(rnd) {
    const roll = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
    const race = Object.keys(RACES)[Math.floor(rnd() * 5)]
    const r = RACES[race]
    const stats = {
        race,
        aff: Math.max(1, roll(3, 8) + r.aff),
        hp: Math.max(6, roll(22, 38) + r.hp),
        mp: Math.max(0, roll(2, 14) + r.mp),
        atk: Math.max(1, roll(5, 10) + r.atk),
        def: Math.max(0, roll(1, 5) + r.def),
        spd: Math.max(1, roll(3, 8) + r.spd),
    }
    // every bench sits within one level of the company it joins: Wizardry
    // refused to make a fresh recruit mightier than the survivors.
    const cls = CLASS_ORDER[Math.floor(rnd() * CLASS_ORDER.length)]
    const name = NAMES[Math.floor(rnd() * NAMES.length)]
    return { name, cls, ...stats }
}

// alignment is chosen at the bench, so composition is a pure function of the
// rolled paper + the chosen way — shift the way, watch the paper recompute.
export function compose(body, ali) {
    const c = CLASSES[body.cls]
    const a = ALIGNMENTS[ali]
    return {
        name: body.name, race: body.race, cls: body.cls, ali,
        aff: body.aff,
        hp: Math.max(6, body.hp + (c.hpBonus || 0)),
        mp: body.mp,
        atk: Math.max(1, body.atk + (c.atkBonus || 0) + a.atk),
        def: Math.max(0, body.def + a.def),
        spd: Math.max(1, body.spd + a.spd),
    }
}

export function classOk(body, cls) {
    const c = CLASSES[cls]
    const r = RACES[body.race]
    if (r.bans && r.bans.includes(cls)) return false
    const req = c.req
    if (req.aff !== undefined && body.aff < req.aff) return false
    if (req.atk !== undefined && body.atk < req.atk) return false
    if (req.spd !== undefined && body.spd < req.spd) return false
    return true
}

export const classOkHero = (h, cls) => classOk({ race: h.race, aff: h.aff, atk: h.atk, spd: h.spd }, cls)

// six papers per roll. If the company holds no one who can work magic, the
// bench always has a MAGUS among it — creation is the repair for a wizardless
// grave — and that paper passes its own gate.
export function rollCandidates(rnd, party) {
    const magicless = !party.some(h => h.alive && Object.keys(CLASSES[h.cls].spells).length > 0)
    const six = []
    let magusAt = -1
    for (let i = 0; i < 6; i++) {
        six.push(rollBody(rnd))
        if (six[i].cls === 'MAGUS' && classOk(six[i], 'MAGUS') && magusAt < 0) magusAt = i
    }
    if (magicless && magusAt < 0) {
        // construct a legal MAGUS paper — the bench keeps its promise by making
        // one, not by gambling on the dice (still seeded, still honest)
        const race = 'VASK'
        const roll = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
        six[Math.floor(rnd() * 6)] = {
            name: NAMES[Math.floor(rnd() * NAMES.length)], cls: 'MAGUS', race,
            aff: 10 + roll(0, 4), hp: Math.max(6, roll(20, 34) + RACES[race].hp),
            mp: Math.max(0, roll(6, 14) + RACES[race].mp),
            atk: Math.max(1, roll(5, 8) + RACES[race].atk), def: Math.max(0, roll(1, 4)), spd: Math.max(1, roll(3, 8)),
        }
    }
    return six.map(b => ({
        ...b,
        pass: classOk(b, b.cls),
        raceName: RACES[b.race].name,
        className: CLASSES[b.cls].name,
    }))
}

// the instant spellbook: letters this hero can work RIGHT NOW
export const spellsFor = (h) => Object.entries(CLASSES[h.cls].spells)
    .filter(([, lvl]) => h.lvl >= lvl)
    .map(([id]) => id)

export const canCast = (h, id) => {
    const lvl = CLASSES[h.cls].spells[id]
    return lvl !== undefined && h.lvl >= lvl && h.alive && h.mp >= SPELLS[id].cost
}

// the tavern's instant hire: a seeded roll, class chosen honestly against its
// own gate, so a hire's book is as real as a created hero's
export function rollRecruit(rnd) {
    let body = rollBody(rnd)
    if (!classOk(body, body.cls)) {
        let ok = null
        for (let tries = 0; tries < 24 && !ok; tries++) {
            const b = rollBody(rnd)
            if (classOk(b, b.cls)) ok = b
        }
        if (ok) body = ok
    }
    const ali = ALIGN_ORDER[Math.floor(rnd() * 3)]
    return compose(body, ali)
}

// mulberry32 re-exported so the shell/harness can seed the same dice the sim uses
export { mulberry32 }
