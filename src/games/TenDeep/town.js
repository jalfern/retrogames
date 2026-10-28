// TEN-DEEP — THE RIM: the hamlet on the lip of the well (stage 2 of #1127).
// Wizardry's surface (Apple II, 1981) is four services and a purse: the
// TAVERN hires replacements, the TEMPLE calls the dead back, the TRAINING
// GROUNDS spend carried XP for levels, the ALCHEMIST sells potions. Gold is
// the binding resource: kills print it, town charges it, and a wipe taxes the
// purse by half — so the cellar can never farm an infinite party.
//
// Pure data + seeded rolls. No Math.random here either: recruits roll on
// mulberry32 driven by the run's town seed (sim.js owns the counter).

export const TOWN = 'THE RIM'

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
    T: [{ id: 'post', label: 'POST FOR HIRE', priceKey: 'hireCost', desc: 'replace a fallen hero with a fresh roll' }],
    V: [
        { id: 'mourn', label: 'MOURN — call back (1 hp)', priceKey: 'mournCost', desc: 'the dead return at the threshold of life' },
        { id: 'restore', label: 'RESTORE — life & limb', priceKey: 'restoreCost', desc: 'the dead whole, the wounded whole' },
        { id: 'mend', label: 'MEND — fill one hero', priceKey: 'mendCost', desc: 'wounds closed, hp made full' },
        { id: 'refresh', label: 'REFRESH — fill one spirit', priceKey: 'refreshCost', desc: 'spent magic returned' },
    ],
    G: [{ id: 'train', label: 'TRAIN', priceKey: 'trainCost', desc: 'XP at the threshold + gold = one level' }],
    A: [{ id: 'potion', label: 'BUY POTION', priceKey: 'potionCost', desc: 'crimson glass, 26 hp when drunk' }],
}

// own-IP names + stat bands for tavern hires (the preset six live in sim.js)
export const RECRUIT_NAMES = [
    'HALGAR', 'Yarrow', 'Nettle', 'ORIN', 'Sable', 'KESTREL', 'Bryn', 'Ashford',
    'Marrow', 'Vess', 'Cobble', 'Liorin', 'Pell', 'WREN', 'Dunstan', 'Ilsa',
    'GRIM', 'Fenwick', 'Sorrel', 'Tamsin',
]

export function rollRecruit(rnd) {
    const pick = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
    const name = RECRUIT_NAMES[Math.floor(rnd() * RECRUIT_NAMES.length)]
    // NOTE: no gold here — a hire arrives empty-pursed but never burns the
    // coin the fallen hero was still carrying; conservation is sacred.
    return {
        name,
        hp: pick(22, 38), mp: pick(2, 16),
        atk: pick(5, 10), def: pick(1, 5), spd: pick(3, 8),
    }
}

// which purse slots a service may target, honestly evaluated against state
export function serviceHeroOk(id, h) {
    switch (id) {
        case 'post': return !h.alive
        case 'mourn': case 'restore': return !h.alive
        case 'mend': return h.alive && h.hp < h.maxHp
        case 'refresh': return h.alive && h.mp < h.maxMp
        case 'train': return h.alive
        case 'potion': return true
        default: return false
    }
}
