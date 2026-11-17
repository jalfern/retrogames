// MAGIC CARPET — attract captions (#2449 item 4, POLISH #2568).
//
// docs/ART.md bar 6: "The attract mode shows the game off… one message at a
// time, cycling." The attract already flies the REAL sim with the REAL
// autopilot (#1637 lineage) — the story is on screen every frame. What was
// wrong: nine rule lines stacked under the title, read over the demo like a
// wall. This module turns the wall into ONE caption line that narrates what
// the live demo is DOING: sim events map to short rules, one at a time;
// quiet spells cycle a small fallback list, one at a time.
//
// Presentation-only, and provably so: this file never imports the sim, nothing
// here is read by sim.js/hash/autopilot (carpetcheck pins that). Texts stay
// under 44 monospace chars so a phone-width attract never wraps to two lines
// (two lines on screen = bar 6 broken again).

// Story beats, keyed by sim event type. Meanings verified against sim.js at
// writing: pickup = a pearl reached the carpet; bankIn = mana entered the
// vault; learn = the vault's growth taught a spell; equip = a spell took a
// hand; tribute = an allied hut pays; bite = a wolf's strike; wizfire /
// towerFire / rocksling = the world shooting back; boom = an explosion
// scorched the ground; absorb = a sibling caster pocketed a pearl (his death
// spills the hoard back); stage = YOUR castle grew a part; wizGrow / sibGrow =
// the rivals' towers rise; coven = sibling casters wake.
export const CAPTIONS = {
    pickup: 'A MANA PEARL — BANK IT AT THE CASTLE',
    bankIn: 'MANA IN THE VAULT — THE BOOK SELLS POWER',
    learn: 'A SPELL LEARNED — B OPENS THE BOOK AT HOME',
    equip: 'A SPELL RIDES YOUR HAND',
    tribute: 'ALLIED VILLAGES PAY TRIBUTE IN PEARLS',
    bite: 'WOLVES RUN THESE LANDS — CLIMB OR VEIL',
    wizfire: 'THE WIZARD ANSWERS WITH FIRE',
    towerFire: 'HIS CASTLE SHOOTS BACK — KEEP YOUR DISTANCE',
    rocksling: 'A GIANT HURLS STONES — GET ABOVE THEM',
    boom: 'FIRE SCORCHES THE LAND IT FELL ON',
    absorb: 'WIZARD HOARDS PEARLS — KILL HIM, THEY FALL',
    stage: 'YOUR CASTLE GROWS — WALL, TURRETS, KEEP',
    wizGrow: 'THE WIZARD BUILDS HIS TOWER',
    sibGrow: 'A SIBLING CASTLE RISES BESIDE IT',
    coven: 'THE COVEN STIRS — SIBLING CASTERS WAKE',
}

// The villager event carries a `what`; only three of its four beats are story.
export const VILLAGER_CAPS = {
    grab: 'A VILLAGER IN YOUR GRIP — CARRY IT HOME',
    convert: 'THE VILLAGE RAISES YOUR FLAG',
    settle: 'THE VILLAGER SETTLES UNDER YOUR WALL',
}

// Quiet-spell fallback: the core rules the demo may not be showing right now,
// cycled ONE at a time (this is what replaces the wall).
export const FALLBACKS = [
    'ARROWS STEER — THE CARPET NEVER CRASHES',
    'A AND X CAST · B OPENS THE BOOK AT HOME',
    'FORTY-FIVE WORLDS — FILL EVERY VAULT',
    'DIE CARRYING MANA AND THE LOAD IS LOST',
    'FIRE BREEDS WOLVES · THE VEIL HIDES YOU',
]

// Hold timings (wall-clock ms): an event caption owns the line for CAP_HOLD_MS
// unless a new beat lands; after that the fallback cadence resumes.
export const CAP_HOLD_MS = 4000
export const FALLBACK_MS = 3000

// The one law: what does the attract caption say for this sim event?
// Returns null for events that are not story beats — never an empty line.
export function attractCaption(ev) {
    if (!ev || typeof ev !== 'object') return null
    if (ev.type === 'villager') return VILLAGER_CAPS[ev.what] || null
    return CAPTIONS[ev.type] || null
}
