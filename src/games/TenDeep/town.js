// TEN-DEEP — THE RIM: the hamlet on the lip of the well (stage 2 of #1127).
// Wizardry's surface (Apple II, 1981) is four services and a purse: the
// TAVERN hires replacements and seats the creation bench, the TEMPLE calls the
// dead back, the TRAINING GROUNDS spend carried XP for levels, the ALCHEMIST
// sells potions. Gold is the binding resource: kills print it, town charges it,
// and a wipe taxes the purse by half — so the cellar can never farm an
// infinite party. Stage 3 added CREATE: the bench where races, classes and
// alignments are rolled and chosen (people.js owns the people math).

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
