// HOMEBODY — pure simulation (rules only; the shell is index.jsx, the look is art.js).
//
// An original people sim in the spirit of The Sims (Maxis, PC 2000) — its own IP,
// names and art. One suburban lot, two residents with five needs, a clock that
// never stops, a buy catalog, a job at the mailbox, a neighbour who wanders in,
// and a lifetime wish (60 contentment) as the win; both residents collapsed at
// once is the loss.
//
// Determinism law: every random the sim consumes comes from s.rng (mulberry32 of
// the seed). Math.random() is juice-only in the shell.

export const FIXED_DT = 1000 / 60
export const W = 640
export const H = 480
export const TILE = 32
export const COLS = 16
export const ROWS = 13
export const LOT_X = 8
export const LOT_Y = 40
export const PANEL_X = 528

export const HOUR_SEC = 5            // one sim hour = 5 real seconds (a day = 2 min)
export const WIN_CONTENT = 80
export const WORK_START = 8
export const WORK_END = 17

// --------------------------------------------------------- relationships ----
// #1817: the chat loop gains a ladder. Two meters ride the sim — `house`
// (Otto<->Mira) and `fern` (household<->the neighbour) — grown by real
// conversation minutes, four levels with unlocks, and an hourly fade so a
// neglected bond cools (the original's relationships sag too).
export const REL_MAX = 100
export const REL_EDGES = [12, 30, 60]
export const REL_NAMES = ['ACQUAINTED', 'FRIENDLY', 'FRIENDS', 'FAMILY']
export const relLevel = (v) => (v >= REL_EDGES[2] ? 3 : v >= REL_EDGES[1] ? 2 : v >= REL_EDGES[0] ? 1 : 0)
// #2070: spats & make-ups — the first *negative* relationship rule. An idle
// pair within reach with needs in the red trades barbs instead of gossip
// (bond drop, demotion visible, grudge set); while the grudge holds,
// co-presence builds nothing — the cold war. The way out is the human one:
// the same reach, both tempers up, pays the lump back. No rng in the
// triggers — every seed stays deterministic; the dialogue pick is seeded.
export const SPAT_DROP = 8         // house bond lost per spat
export const SPAT_SOCIAL = 0.12   // social sting each resident pays
export const SPAT_CD = 40         // real seconds before another spat can fire
export const MAKEUP_BOND = 6      // lump bond repaid on the make-up
// #2131: player-ordered romance — the bond law gets a handle. The resident you
// command may address the nearest other person within arm's reach (same ring as
// the co-presence chat): a compliment pays the right bond, at FAMILY tier the
// household compliment deepens into affection (double), and an insult cuts and
// sets the grudge — cold war on command, with the same human exit (#2070) as an
// organic spat. Shared cooldown so spam cannot flatten the meter; no rng in the
// triggers (the dialogue pick is seeded, as everywhere), so seeds stay exact.
export const COO_BOND = 3         // bond paid per compliment
export const AFFECTION_BOND = 6   // household compliment at FAMILY tier (relLevel 3)
export const INSULT_DROP = 4      // bond cut per insult (half an organic spat)
export const CMD_CD = 8           // real seconds between player commands
export const COURT_REACH = 2      // arm's reach, Manhattan — the chat ring
// #2143: Ivy, the market neighbour — the second point of the relationship
// triangle. She rides the #1817 law (edges, one event per crossing, hourly
// fade) with her own personality numbers: a slower burner than Fern, longer
// lingers per level, and a ladder that pays in a VISIBLE economy — from
// FRIENDS up she arrives with a market basket (household hunger), and at
// FAMILY the basket carries her honey-money too. No rng outside s.rng, so
// every seed stays exact.
export const IVY_HUE = '#a3579b'      // plum dress — nobody on the lot wears it
export const IVY_HAIR = '#5d3b63'
export const IVY_CHAT = 0.055         // rel/s while a resident chats beside her
export const IVY_SOCIAL = 0.05       // social/s the chat pays (Fern is 0.06)
export const IVY_FADE = 0.03         // rel lost per sim-hour of absence
export const IVY_GIFT_HUNGER = 0.18  // per resident, per basket
export const IVY_GIFT_CASH = 15      // the FAMILY-tier honey-money (§)

// #2197: Miso — the household cat. Adopted at the counter like a piece of
// furniture, lives by the lot's laws (every step asks walkable) and extends
// the bond law down to pet scale. A pet is affection, not a burden: the cat
// never faints, never blocks, and refusing an adoption is the only bad day.
export const PET = { name: 'Miso', price: 150 }
export const PET_DECAY = { hunger: 0.10, fun: 0.08, energy: 0.05 }   // per sim-hour, cat pace
export const PET_COOS = 6            // real seconds between coos
export const PET_SOCIAL = 0.08     // social the resident pockets per coo
export const PET_BOND = 0.5        // house bond per coo — love is a slow ladder
const PET_COO_LINES = [
    '{n} coos at Miso and the whole kitchen gets warmer.',
    'Miso headbutts {n}\u2019s ankle. Rent-free residency confirmed.',
    'Miso purrs like a small engine; {n} cannot stay mad at any of it.',
]
const SLEEP_LINES = [
    'Miso curls on the warm floorboards, a comma of cat.',
    'The house dims; Miso pours herself into a sleeping loaf.',
]

// #2203: Pip — the adopted child. The kids half of the companions tail: the
// agency worker hands the child over at the gate, and Pip lives by the lot's
// laws like the cat (every step asks walkable) — but a child is not a pet. FUN
// burns fastest (kids burn bright), PLAY is the verb: a bored Pip hunts the fun
// objects, a hungry Pip finds the fridge, night puts a child to bed. And unlike
// the cat, neglect is loud: a red-fun Pip CRIES, and the wail stings every
// resident nearby. Care is still love — tumbling beside an idle resident and a
// word on the court climb rel.kid. A child never faints and never blocks.
export const KID = { name: 'Pip', price: 150 }
export const KID_DECAY = { hunger: 0.12, fun: 0.16, energy: 0.05, social: 0.10 }  // per sim-hour — fun fastest
export const KID_PLAY = 6          // real seconds between tumble ticks (the pet law, kid scale)
export const KID_SOCIAL = 0.06    // social the resident pockets per tumble
export const KID_BOND = 0.5       // rel.kid per tumble tick — friendship, one fall at a time
export const KID_FADE = 0.015     // rel.kid lost per sim-hour of quiet (home pace — slowest)
export const KID_CRY_CD = 4       // real seconds between cries while fun stays red
export const KID_CRY_STING = 0.10 // social each nearby resident pays per wail (neglect is loud)
const KID_TUMBLE_LINES = [
    '{n} and Pip chase each other in tight circles until one falls over giggling.',
    'Pip tackles {n}\u2019s legs; it counts as wrestling and as love.',
    'Pip shows {n} a rock that is definitely valuable. Both agree it is.',
]
const KID_PLAY_LINES = [
    'Pip works the radio dial like it owes money. The cartoons win.',
    'Pip presses a nose almost into the screen. The pictures are that good.',
    'Pip builds a fort out of nothing and defends it brilliantly.',
]
const KID_SNACK_LINES = [
    'Pip negotiates with the fridge and wins twice.',
    'A snack acquired the way children acquire everything: decisively.',
]
const KID_CRY_LINES = [
    'Pip is crying, and the whole house hears it.',
    'Someone forgot a child is a person with feelings — Pip says so, loudly.',
]
const KID_BED_LINES = [
    'Pip curls up on the floorboards, still halfway to a game.',
    'The house dims; a child folds up small and sleeps like only children do.',
]
const ADOPT_KID_LINE = 'The agency worker hands over a backpack and a small person — Pip claims the lot, already grinning.'

export const COLLAPSE_AT = 16       // seconds a red need may go unanswered
export const FAINT_SEC = 14        // how long a faint lasts
export const RED_AT = 0.12         // a need at/below this reads red (and alarms the gem)

// Per-need satisfaction signature: a distinct frequency, timbre and short note
// sequence (crunch / snooze / giggle / chatter / splash) plus an optional noise
// texture, so satisfying hunger never sounds like topping off energy. Consumed
// by the shell's handleEvents; a pure data table so peoplecheck can prove the
// five are actually distinct.
export const SFX = {
    hunger: { f: 660, type: 'square', seq: [1, 1.5, 1.25], noise: 0.07 },   // crunch
    energy: { f: 330, type: 'sine', seq: [1, 0.75, 0.5] },                   // snooze (falling)
    fun: { f: 523, type: 'triangle', seq: [1, 1.26, 1.5, 2] },               // giggle (arpeggio)
    social: { f: 700, type: 'triangle', seq: [1, 1.5, 1, 1.5] },            // chatter (alternating)
    bladder: { f: 600, type: 'sine', seq: [1, 0.66], noise: 0.06 },          // splash
}

// ---------------------------------------------------------------- map --------
// . grass   p path   F house floor   # wall   D door/gate (walkable)
export const MAP = [
    '................',
    '.###########....',
    '.#FFFFFFFFF#....',
    '.#FFFFFFFFF#....',
    '.#FFFFFFFFF#....',
    '.#F#####F###....',
    '.#FFFFF#FFF#....',
    '.#FFFFF#FFF#....',
    '.####D######....',
    '.....p..........',
    '.....p..........',
    '.....p..........',
    '#####D##########',
]

export const cellChar = (r, c) => (r < 0 || r >= ROWS || c < 0 || c >= COLS ? '#' : MAP[r][c])
export const groundAt = (r, c) => {
    const ch = cellChar(r, c)
    return ch === '.' ? 'grass' : ch === 'p' ? 'path' : ch === 'F' || ch === 'D' ? 'floor' : 'wall'
}

export const tileX = (c) => LOT_X + c * TILE
export const tileY = (r) => LOT_Y + r * TILE
export const tileOf = (px, py) => {
    const c = Math.floor((px - LOT_X) / TILE)
    const r = Math.floor((py - LOT_Y) / TILE)
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null
    return { r, c }
}

// ------------------------------------------------------------- catalog ------
// solid pieces block walking; décor pieces don't. `need`/`amt`/`dur` drive use.
export const CATALOG = [
    { id: 'bed', name: 'Cozy Bed', price: 210, h: 1, solid: true, need: 'energy', amt: 0.3, dur: 9 },
    { id: 'fridge', name: 'Fridge', price: 160, h: 1, solid: true, need: 'hunger', amt: 0.5, dur: 3 },
    { id: 'stove', name: 'Stove', price: 200, h: 1, solid: true, need: 'hunger', amt: 0.9, dur: 6 },
    { id: 'toilet', name: 'Porcelain Throne', price: 120, h: 1, solid: true, need: 'bladder', amt: 0.95, dur: 3 },
    { id: 'tv', name: 'Box TV', price: 250, h: 1, solid: true, need: 'fun', amt: 0.55, dur: 5 },
    { id: 'radio', name: 'Radio', price: 90, h: 1, solid: true, need: 'fun', amt: 0.35, dur: 4 },
    { id: 'book', name: 'Bookshelf', price: 120, h: 1, solid: true, need: 'fun', amt: 0.4, dur: 5 },
    { id: 'phone', name: 'Wall Phone', price: 110, h: 1, solid: true, need: 'social', amt: 0.55, dur: 4 },
    { id: 'shower', name: 'Shower Cubby', price: 150, h: 1, solid: true, need: 'bladder', amt: 0.2, dur: 4 },
    { id: 'sofa', name: 'Puffed Sofa', price: 180, h: 1, solid: true, need: 'fun', amt: 0.3, dur: 4, social: true },
    { id: 'plant', name: 'Potted Fern', price: 40, h: 1, solid: false, decor: true },
    { id: 'rug', name: 'Round Rug', price: 60, h: 1, solid: false, decor: true },
    { id: 'lamp', name: 'Floor Lamp', price: 80, h: 1, solid: false, decor: true },
    { id: 'roomkit', name: 'Spare Room', price: 300, h: 1, solid: false, room: true },
    { id: 'petkit', name: 'Adopt a Cat', price: PET.price, h: 1, solid: false, pet: true },
    { id: 'kidkit', name: 'Adopt a Child', price: KID.price, h: 1, solid: false, kid: true },
]
export const DEF = Object.fromEntries(CATALOG.map((d) => [d.id, d]))
export const NEEDS = ['hunger', 'energy', 'fun', 'social', 'bladder']
export const PHYS = ['hunger', 'energy', 'bladder']
export const DECOR = ['plant', 'rug', 'lamp', 'book', 'sofa', 'tv', 'radio', 'phone']

// ------------------------------------------------------- paper route (#2238) --
// The neighbourhood keeps a clock (the original's daily rhythm, The Sims, PC
// 2000): every morning the paper boy sweeps past the gate and the daily lands
// on the path — hour-scheduled life nobody commands. It is not a catalog
// piece (nobody buys the news), so DEF gains one owner-free entry: walkable
// (solid:false) and usable (fun) — which lets tryUse, the tap route and BFS
// treat it exactly like an appliance the lot owns. One paper a day; morning
// replaces yesterday's — news rots.
export const PAPER = { id: 'paper', name: 'Daily Paper', price: 0, h: 1, solid: false, decor: true, need: 'fun', amt: 0.24, dur: 2.8 }
DEF.paper = PAPER
export const PAPER_LATE = 10          // the route is over by 10:00
export const PAPER_LINES = [
    'The paper boy sweeps past the gate — today\'s edition lands on the path.',
    'Fresh news hits the step: the funny pages face up.',
    'The morning edition sails in, comics on top.',
    'Somebody\'s crossword waits on the path, pencil-sharp.',
]

// ------------------------------------------------- catalog shelves (#2222) ----
// The original people-sim never showed a flat wall of goods: buy mode is a
// catalog with category tabs — flip shelves, each shelf few big cards.
// Union of these shelves covers CATALOG exactly, no duplicates (STORES gate).
export const CAT_TABS = [
    { id: 'HOME', ids: ['bed', 'fridge', 'stove', 'toilet', 'shower', 'phone'] },
    { id: 'FUN', ids: ['tv', 'radio', 'book', 'sofa'] },
    { id: 'DECOR', ids: ['plant', 'rug', 'lamp'] },
    { id: 'SPECIAL', ids: ['roomkit', 'petkit', 'kidkit'] },
]
export const TAB_CARDS = CAT_TABS.map((t) => t.ids.map((id) => CATALOG.findIndex((d) => d.id === id)))
export const TAB_OF = {}
TAB_CARDS.forEach((cards, t) => cards.forEach((i) => { TAB_OF[i] = t }))

export function tabCards(s) { return TAB_CARDS[s.tab] || [] }

// Selecting a card follows its shelf and remembers it per shelf.
export function setSel(s, i) {
    if (i < 0 || i >= CATALOG.length) return false
    s.sel = i
    const t = TAB_OF[i]
    if (t !== undefined) { s.tab = t; s.tabSel[t] = i }
    return true
}

// Flip shelves (±1, cycling); selection lands on that shelf's remembered card.
export function flipTab(s, dir) {
    return selectTab(s, (s.tab + dir + CAT_TABS.length) % CAT_TABS.length)
}

export function selectTab(s, t) {
    if (t < 0 || t >= CAT_TABS.length) return false
    s.tab = t
    const cards = TAB_CARDS[t]
    const mem = s.tabSel[t]
    s.sel = cards.includes(mem) ? mem : cards[0]
    return true
}

// digits 1-9 pick WITHIN the open shelf — with the flip, every one of the
// 16 cards is reachable by shelf+digit (#2209's card-16 worry, answered).
export function digitCard(s, n) {
    const cards = tabCards(s)
    return n >= 1 && n <= cards.length ? cards[n - 1] : -1
}

// ------------------------------------------------------------ speed (#2227) --
// The original's dial (The Sims, PC 2000): pause, normal, fast, fastest. The
// dial is sim state — it rides the hash, so replays pin the speed timeline.
// Multiplying steps per frame is the shell's job; every extra step is a plain
// advance, so decay, schedules, visits, cries and purrs all ride one law.
// The loop keeps exactly ONE driver: the fixed timestep never changes, only
// how many world steps one frame tick buys.
export const SPEED_MULT = [0, 1, 2, 4]          // world steps per frame tick
export const SPEED_NAMES = ['PAUSED', 'NORMAL', 'FAST', 'FASTEST']

export function setSpeed(s, n) {
    const v = Math.max(0, Math.min(SPEED_MULT.length - 1, Math.round(n)))
    const changed = s.speed !== v
    s.speed = v
    return changed
}

export function cycleSpeed(s, dir) {
    return setSpeed(s, (s.speed + dir + SPEED_MULT.length) % SPEED_MULT.length)
}

// The marquee teaching: the attract demo rushes the morning-chores stretch
// (8h–10h) and eases back — the dial visibly turns in the demo, teaching the
// mechanic without a word. Never returns 0: an attract that stands still
// reads as a broken page, not as a feature.
export const attractSpeed = (s) => (s.hour >= 8 && s.hour < 10 ? 2 : 1)

// ------------------------------------------------------- spare room (#1806) --
// The lot grows once: buy the Spare Room kit and the house's east wall gains a
// 3×4 room — plank floor, brick band walls, a doorway punched into the shared
// wall at (4,11), windows in the east wall. The layer never edits MAP: it rides
// `s.ext`, and `groundOf` is the single honest ground question for every
// sim-side walker and guard (keepsOpen sees the new walls for free).
export const EXT_ROOM = {
    price: 300,
    floor: [[3, 12], [3, 13], [3, 14], [4, 12], [4, 13], [4, 14], [5, 12], [5, 13], [5, 14], [6, 12], [6, 13], [6, 14]],
    walls: [[2, 12], [2, 13], [2, 14], [2, 15], [3, 15], [4, 15], [5, 15], [6, 15], [7, 12], [7, 13], [7, 14], [7, 15], [3, 11], [6, 11], [7, 11]],
    door: [4, 11],
    windows: [[4, 15], [6, 15]],   // #1814: one source — the bake paints them, nightTint lights them
}

// #1814 move-in reactions: the hammer falls and the residents react once.
// Preferred glance cells inside the wing (any free room cell as fallback);
// lines for the moment they arrive.
export const ROOM_REACT = [[4, 13], [6, 13]]
export const ROOM_SEE_LINES = [
    'The new room smells like fresh paint.',
    '{p} takes a victory lap through the new room.',
    '{p} tries the new floorboards — they creak approvingly.',
]
const extFloor = new Set(EXT_ROOM.floor.map(([r, c]) => `${r},${c}`))
const extWall = new Set(EXT_ROOM.walls.map(([r, c]) => `${r},${c}`))
export function groundOf(s, r, c) {
    if (s && s.ext) {
        const k = `${r},${c}`
        if (extWall.has(k)) return 'wall'
        if (extFloor.has(k) || k === `${EXT_ROOM.door[0]},${EXT_ROOM.door[1]}`) return 'floor'
    }
    return groundAt(r, c)
}

// decay per sim hour, straight from the original's five motives
export const DECAY = { hunger: 0.15, energy: 0.055, fun: 0.115, social: 0.1, bladder: 0.14 }
export const NIGHT_ENERGY = 0.22    // energy drains faster after dark

// ---------------------------------------------------------------- rng -------
export function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// ------------------------------------------------------------- people -------
const person = (name, r, c, hue, worksOn) => ({
    name, r, c, x: tileX(c) + TILE / 2, y: tileY(r) + TILE / 2,
    hue,
    worksOn,
    needs: { hunger: 0.82, energy: 0.84, fun: 0.8, social: 0.75, bladder: 0.85 },
    queue: [], path: null, goal: null,
    use: null,             // { obj, def, t, dur }
    faintT: 0, redT: {},  // per-need seconds spent fully red
    workedToday: false, working: false,
    mood: 1, walkPhase: 0, face: 1,
    chatT: 0, alarmT: 0, wasRed: {},
    roomSeen: false,             // #1814: one move-in glance per resident
})

export function newRun(seed) {
    const s = {
        seed: seed >>> 0,
        rng: mulberry32((seed >>> 0) ^ 0x4b0bb0d1),
        tick: 0, sec: 0, hour: 7, day: 1,
        money: 520, rank: 1, workDays: 0, content: 0,
        build: false, sel: 0,
        tab: 0,                                     // #2222: open catalog shelf
        speed: 1,                                   // #2227: the dial sits at normal on move-in
        tabSel: TAB_CARDS.map((c) => c[0]),       // last pick remembered per shelf
        cursor: { r: 6, c: 8 },          // build cursor
        cursorA: { r: 2, c: 3 },        // dpad "use" cursor
        items: [
            { uid: 1, id: 'bed', r: 6, c: 4 },
            { uid: 2, id: 'fridge', r: 2, c: 9 },
            { uid: 3, id: 'toilet', r: 6, c: 9 },
            { uid: 4, id: 'mail', r: 11, c: 6 },
            { uid: 5, id: 'radio', r: 3, c: 2 },
        ],
        nextUid: 6,
        people: [person('Otto', 3, 3, '#e2574c', 1), person('Mira', 3, 8, '#3f7fd1', 0)],
        active: 0,
        visitor: null,                  // { name, x, y, path, state, t }
        visitAfter: null,             // hour of next visit
        visitGap: 0,
        ivy: null,                    // #2143: second neighbour, same shape as `visitor` (+ gift)
        ivyAfter: null,             // hour of Ivy's next visit
        ivyGap: 0,
        triTell: 0,                 // #2154: world seconds until the next three-way choreography tell
        triHits: 0,                 // #2154: three-way tells fired this run (the line variant rides it)
        pet: null,                  // #2197: the household cat, once adopted
        kid: null,                  // #2203: the adopted child, once the agency calls
        paper: null,                // #2238: today's news on the step (item ref | null)
        paperDay: 0,              // #2238: day stamp of the last delivery (rides the hash)
        paperAfter: 0,            // #2238: hour the route is due today
        rel: { house: 0, fern: 0, ivy: 0, kid: 0 },   // #1817/#2143/#2203 conversation ladders (0..REL_MAX)
        spats: 0,                 // #2070: quarrels this run (rides the hash)
        grudge: 0,                // #2070: 1 = cold war until the pair makes up
        spatCd: 0,                // #2070: real seconds until the next spat may fire
        spatFx: 0,                // #2076: seconds left of the storm-puff tell over the pair
        cooFx: 0,                 // #2131: seconds left of the sparkle/hearts tell over the pair
        cmdCd: 0,                 // #2131: real seconds until the next player command lands
        holdT: -1,                // #2171: armed thumb-court hold (world ms; -1 = no press pending)
        houseLineCd: 6,               // co-presence chat line cooldown (s)
        lastToast: 0,               // day of last shared payday toast
        thoughts: [], thoughtT: 0,
        events: [],
        fastT: 0,                      // "AT WORK" overlay seconds left
        done: null, endMsg: '',
        demo: false,
        ext: 0,
        roomReact: 0,            // #1814: residents still owed a move-in glance
        ambience: 0, happyHours: 0,
    }
    scheduleVisit(s)
    scheduleIvy(s)
    schedulePaper(s)
    return s
}

function scheduleVisit(s) {
    // #1817: the better the bond with Fern, the sooner she's back (−1 h/level, floor 8)
    const lv = relLevel(s.rel ? s.rel.fern : 0)
    s.visitAfter = Math.max(8, 9 + Math.floor(s.rng() * 5) - lv)
    s.visitGap = s.rng()
}

// #2143: Ivy keeps her own market-hours — she starts later than Fern and the
// better the bond, the sooner she's back (−1 h/level, floor 12).
function scheduleIvy(s) {
    const lv = relLevel(s.rel ? s.rel.ivy : 0)
    s.ivyAfter = Math.max(12, 14 + Math.floor(s.rng() * 6) - lv)
    s.ivyGap = s.rng()
}

// #2238: the paper route keeps its hours — news lands between ~06:30 and
// ~08:00, seeded, whether anyone is awake or not. This is the clause the
// README kept calling cosmetic: the lot now schedules by the hour on its own.
function schedulePaper(s) { s.paperAfter = 6.5 + s.rng() * 1.5 }

// #1817: every conversation minute stacks the meter; crossing an edge is a
// moment — one thought-log line, a small contentment bonus, one harness event.
function relAdd(s, k, n) {
    const before = s.rel[k]
    if (before >= REL_MAX) return
    s.rel[k] = Math.min(REL_MAX, s.rel[k] + n)
    const al = relLevel(s.rel[k])
    if (al > relLevel(before)) {
        s.content = Math.min(WIN_CONTENT, s.content + 2)
        s.events.push({ t: 'rel-up', k, level: al })
        think(s, pick(s, REL_UP_LINES[k][al - 1]))
    }
}
const REL_UP_LINES = {
    fern: {
        1: ['Fern waves at the gate like an old friend now.', 'Fern hums a tune on the way in — the good kind of neighbour.'],
        2: ['Fern lets herself in with her own story already started.', 'Fern and the household swap stories before the kettle is on.'],
        3: ['Fern is practically family — she brings two casseroles now.'],
    },
    house: {
        1: ['Otto and Mira have started finishing each other\u2019s sentences.', 'The two have fallen into an easy rhythm.'],
        2: ['Otto and Mira laugh at the same joke from two different rooms.', 'Friends under one roof — the house feels bigger and smaller at once.'],
        3: ['Otto and Mira — soulmates of this little household.'],
    },
    // #2143: the second neighbour climbs the same ladder, in her own voice.
    ivy: {
        1: ['Ivy waves at the gate like she means to stay a while.', 'Ivy knows which gate creaks now — she uses the quiet one.'],
        2: ['Ivy lets herself in with a basket and an opinion about the tomatoes.', 'Ivy and the household swap market news before the kettle is on.'],
        3: ['Ivy is practically family — two baskets now, one for each side of the house.'],
    },
    // #2203: a child's ladder climbs fastest of all — kids give their whole
    // friendship, no installments.
    kid: {
        1: ['Pip picked this one. Pip tells everyone so, unprompted.', 'Pip follows you room to room like a small determined shadow.'],
        2: ['Pip saved you the good seat, the one with the best view of the radio.', 'Pip shows you their secret cave under the stairs. You are sworn to secrecy.'],
        3: ['Pip signed your drawing — "BEST FRIENDS FOREVER" — and framed it on the fridge.'],
    },
}

// #2070: the mirror of relAdd — a bond can FALL, and crossing an edge downward
// is a visible moment: one rel-down event, one pip off the panel.
function relSub(s, k, n) {
    const before = s.rel[k]
    s.rel[k] = Math.max(0, before - n)
    const al = relLevel(s.rel[k])
    if (al < relLevel(before)) s.events.push({ t: 'rel-down', k, level: al })
}

const SPAT_LINES = [
    'Otto and Mira bite each other\u2019s heads off over nothing at all.',
    'A spat cracks through the house. Plates rattle; feelings take longer.',
    'Somebody snaps, the other snaps back, and nobody was winning anyway.',
]
const MAKEUP_LINES = [
    'Otto and Mira make up over the kitchen table, the way they always do.',
    'The grudge thaws — somebody puts the kettle on for two.',
    'A sigh, a shrug, a hand on the arm: the spat is over, for now.',
]
// #2135: the cooling beat — between the crack and the thaw the sourness speaks.
export const GRUDGE_FIRST_CD = 8      // s after the crack before the first sour line
export const GRUDGE_COOL_CD = 14     // s between sour lines while the cold war holds
export const COOL_LINES = [
    'The kitchen is still sour — nobody starts the first sentence.',
    'The cold war holds. Two chairs, one table, not a word.',
    'Somebody sighs loudly; the other pretends not to hear.',
]
export const HOUSE_LINES = [
    'Otto and Mira trade gossip nobody else is home to hear.',
    'A shared joke bounces between the two of them.',
    'Otto and Mira plan the weekend out loud, together.',
]

// #2131: player-ordered romance. Who is within arm's reach of the commanded
// resident — partner first by distance, Fern while she hangs about. Fainted
// folks are not company (their own and yours).
export function courtTarget(s) {
    const me = s.people[s.active]
    if (!me || me.faintT > 0) return null
    const cand = []
    const partner = s.people[1 - s.active]
    if (partner && partner !== me && partner.faintT <= 0) cand.push({ p: partner, k: 'house' })
    if (s.visitor && s.visitor.state !== 'leaving') cand.push({ p: s.visitor, k: 'fern' })
    if (s.ivy && s.ivy.state !== 'leaving') cand.push({ p: s.ivy, k: 'ivy' })   // #2143
    if (s.kid) cand.push({ p: s.kid, k: 'kid' })   // #2203: the court reaches children too
    let best = null, bd = COURT_REACH + 1
    for (const c of cand) {
        const d = Math.abs(me.r - c.p.r) + Math.abs(me.c - c.p.c)
        if (d <= COURT_REACH && d < bd) { bd = d; best = c }
    }
    return best
}

const COO_LINES = [
    'You tell Mira she runs this house like a five-star hotel. She preens.',
    'A compliment, spoken aloud, on purpose. Otto takes it like sunshine.',
    'You say the kind thing out loud; the kitchen warms a degree.',
]
const COO_LINES_FERN = [
    'You tell Fern her stories get better every visit. She beams behind the teacup.',
    'A compliment across the tea table — Fern laughs like it was her birthday.',
]
const COO_LINES_IVY = [
    'You tell Ivy her garden is the best on the street. She glows plum-bright.',
    'A compliment about the roses — Ivy takes it like sunlight on leaves.',
]
// #2203: a word to a child lands like sunshine — and a scold lands harder.
const COO_LINES_KID = [
    'You tell Pip they are the bravest kid on the street. They believe you, completely.',
    'A kind word to a child — Pip beams like a lighthouse.',
]
const AFFECTION_LINES = [
    'Otto and Mira — the whole house watches the two of you mean it.',
    'Affection, unashamed, mid-chore. The little lot glows.',
    'A hand on the cheek, a forehead to forehead: FAMILY means this.',
]
const INSULT_LINES = [
    'You say the cruel thing. It lands like a plate on tile.',
    'A low blow, aimed and loose — words do not walk back.',
    'You sneer; the room goes quiet in the bad way.',
]

export function court(s, kind) {
    if (s.cmdCd > 0) return null
    const t = courtTarget(s)
    if (!t) return null
    const me = s.people[s.active], other = t.p, k = t.k
    const mx = (me.x + other.x) / 2, my = (me.y + other.y) / 2
    if (kind === 'coo') {
        const deep = k === 'house' && relLevel(s.rel.house) >= 3
        relAdd(s, k, deep ? AFFECTION_BOND : COO_BOND)
        me.needs.social = Math.min(1, me.needs.social + 0.05)
        if (other.needs && other.needs.social !== undefined) other.needs.social = Math.min(1, other.needs.social + 0.05)
        if (k === 'kid') other.needs.fun = Math.min(1, other.needs.fun + 0.15)   // #2203: a kind word cheers a child
        s.cooFx = deep ? 2.6 : 1.8   // sparkle/hearts over the pair (index paint)
        s.cooAt = { x: mx, y: my }
        s.cooDeep = deep
        s.events.push({ t: deep ? 'affection' : 'coo', k, x: mx, y: my })
        think(s, pick(s, deep ? AFFECTION_LINES : k === 'fern' ? COO_LINES_FERN : k === 'ivy' ? COO_LINES_IVY : k === 'kid' ? COO_LINES_KID : COO_LINES))
        s.cmdCd = CMD_CD
        return { deep, k }
    }
    if (kind === 'insult') {
        relSub(s, k, INSULT_DROP)
        if (k === 'house') { s.grudge = 1; s.houseLineCd = GRUDGE_FIRST_CD }   // cold war on command; the #2070 exit still ends it (#2135: its sour beats included)
        if (other.needs && other.needs.social !== undefined) other.needs.social = Math.max(0, other.needs.social - SPAT_SOCIAL)
        if (k === 'kid') other.needs.fun = Math.max(0, other.needs.fun - 0.2)   // #2203: a scold puts out a child's play-fire (no house grudge — Ivy's rule)
        me.needs.social = Math.max(0, me.needs.social - SPAT_SOCIAL / 2)
        s.spatFx = 2.4                      // the storm puff rides the #2076 tell
        s.events.push({ t: 'insult', k, x: mx, y: my })
        think(s, pick(s, INSULT_LINES))
        s.cmdCd = CMD_CD
        return { k }
    }
    return null
}

// #2171 — the THUMB COURT. The pad has no third button (AGENTS.md), so the
// second order rides press-DURATION on the first: an A press that lands on a
// person arms the hold; releasing resolves the compliment, holding past
// HOLD_INSULT_MS hurls the insult mid-hold. The clock is WORLD ms fed one SIM
// step at a time (like cmdCd, it freezes with the sim) — a throttled browser
// and a Node gate run the same law. The keyboard keeps its dedicated C/X.
export const HOLD_INSULT_MS = 600
export function courtHoldArm(s) {          // A press with no object in reach
    if (courtTarget(s) === null) return false
    s.holdT = 0
    return true
}
export function courtTick(s, ms) {        // every live play step
    if (s.holdT < 0) return null
    s.holdT += ms
    if (s.holdT >= HOLD_INSULT_MS) {
        s.holdT = -1
        const r = court(s, 'insult')
        return r ? { fired: 'insult', ...r } : { refused: true }
    }
    return null
}
export function courtTap(s) {           // release before the threshold
    if (s.holdT < 0) return null
    s.holdT = -1
    const r = court(s, 'coo')
    return r ? { fired: 'coo', ...r } : { refused: true }
}

// ------------------------------------------------------------- occupancy -------
// occupancy of solid cells: the cells a placed item physically blocks
export function cellItem(s, r, c) {
    for (const it of s.items) {
        if (it.id === 'mail') { if (it.r === r && it.c === c) return it; continue }
        const d = DEF[it.id]
        if (!d) continue
        const h = d.h || 1
        if (it.c === c && r >= it.r && r < it.r + h) return it
    }
    return null
}

export function solidAt(s, r, c) {
    if (groundOf(s, r, c) === 'wall') return true
    const it = cellItem(s, r, c)
    if (!it) return false
    const d = DEF[it.id]
    return d ? d.solid !== false : true
}

export function walkable(s, r, c) {
    return groundOf(s, r, c) !== 'wall' && !solidAt(s, r, c)
}

// target tiles for an item: walkable neighbours
export function targetsOf(s, it) {
    const out = []
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const rr = it.r + dr, cc = it.c + dc
        if (walkable(s, rr, cc)) out.push({ r: rr, c: cc })
    }
    return out
}

// ------------------------------------------------------------- path -------
export function bfsPath(s, from, to) {
    if (!to.length) return null
    const q = [from]
    const prev = new Map()
    const seen = new Set([`${from.r},${from.c}`])
    const goalKey = new Set(to.map((t) => `${t.r},${t.c}`))
    while (q.length) {
        const cur = q.shift()
        if (goalKey.has(`${cur.r},${cur.c}`)) {
            const path = [cur]
            let k = `${cur.r},${cur.c}`
            while (prev.has(k)) {
                const p = prev.get(k)
                path.unshift(p)
                k = `${p.r},${p.c}`
            }
            path.shift()
            return path
        }
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = cur.r + dr, nc = cur.c + dc
            const key = `${nr},${nc}`
            if (seen.has(key) || !walkable(s, nr, nc)) continue
            seen.add(key)
            prev.set(key, cur)
            q.push({ r: nr, c: nc })
        }
    }
    return null
}

// --------------------------------------------------------- commands -------
export function findNearest(s, p, type) {
    let best = null, bd = 1e9
    for (const it of s.items) {
        if (it.id !== type) continue
        const tg = targetsOf(s, it)
        if (!tg.length) continue
        const d = Math.min(...tg.map((t) => Math.abs(t.r - p.r) + Math.abs(t.c - p.c)))
        if (d < bd) { bd = d; best = { it, tg } }
    }
    return best
}

export function cmdUse(s, p, it) {
    const tg = targetsOf(s, it)
    if (!tg.length) return false
    const path = bfsPath(s, { r: p.r, c: p.c }, tg)
    if (!path) return false
    p.path = path
    p.goal = { kind: 'use', it }
    return true
}

export function cmdWork(s, p) {
    const mail = s.items.find((it) => it.id === 'mail')
    if (!mail || p.working || p.faintT > 0) return false
    if (s.hour < WORK_START || s.hour >= WORK_END - 1 || p.workedToday || p.worksOn !== s.day % 2) return false
    return cmdUse(s, p, mail)
}

export function cmdWalk(s, p, r, c) {
    if (!walkable(s, r, c)) return false
    const path = bfsPath(s, { r: p.r, c: p.c }, [{ r, c }])
    if (!path) return false
    p.path = path
    p.goal = null
    return true
}

// the "A button" use: nearest usable object adjacent to the person
export function tryUse(s, p) {
    let best = null, bd = 3
    for (const it of s.items) {
        if (it.id === 'mail') {
            if (!p.workedToday && !p.working && s.day % 2 === p.worksOn && s.hour >= WORK_START && s.hour < WORK_END - 1
                && Math.abs(it.r - p.r) + Math.abs(it.c - p.c) <= 2) return cmdWork(s, p)
            continue
        }
        const d = DEF[it.id]
        if (!d || !d.need) continue
        const near = Math.min(...targetsOf(s, it).map((t) => Math.abs(t.r - p.r) + Math.abs(t.c - p.c)))
        if (near < bd) { bd = near; best = it }
    }
    if (best) return cmdUse(s, p, best)
    return false
}

// ---------------------------------------------------------- building ------
export function canPlace(s, def, r, c) {
    if (r < 0 || c < 0 || r + def.h - 1 >= ROWS || c >= COLS) return false
    for (let rr = r; rr < r + def.h; rr++) {
        if (groundOf(s, rr, c) === 'wall') return false
        if (solidAt(s, rr, c)) return false
    }
    if (def.decor && groundOf(s, r, c) === 'wall') return false
    return true
}

// a solid piece may never wall in a person, the gate, or any solid item's use
function keepsOpen(s, r, c) {
    const test = (rr, cc) => (rr === r && cc === c) || solidAt(s, rr, cc)
    if (test(8, 5)) return false
    const seen = new Set(['8,5'])
    const q = [[8, 5]]
    while (q.length) {
        const [a, b] = q.shift()
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = a + dr, nc = b + dc, k = `${nr},${nc}`
            if (seen.has(k) || nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue
            if (test(nr, nc)) continue
            seen.add(k)
            q.push([nr, nc])
        }
    }
    if (!seen.has('12,5')) return false
    for (const p of s.people) if (!seen.has(`${p.r},${p.c}`)) return false
    for (const it of s.items) {
        const d = DEF[it.id]
        if (!d || d.decor || !d.solid) continue
        if (!targetsOf(s, it).some((t) => seen.has(`${t.r},${t.c}`))) return false
    }
    return true
}

// can the expansion stand? the footprint must be free of residents, the
// visitor and any placed piece — the lawn under the future room is still lawn
// until the hammer falls
function roomClear(s) {
    if (s.done || s.ext) return false
    for (const [r, c] of EXT_ROOM.floor) {
        if (cellItem(s, r, c)) return false
        if (s.people.some((p) => p.r === r && p.c === c)) return false
    }
    if (s.visitor && EXT_ROOM.floor.some(([r, c]) => r === s.visitor.r && c === s.visitor.c)) return false
    if (s.ivy && EXT_ROOM.floor.some(([r, c]) => r === s.ivy.r && c === s.ivy.c)) return false   // #2143: Ivy stands where the wing would rise
    return true
}

export function buildRoom(s) {
    if (!roomClear(s) || s.money < EXT_ROOM.price) return false
    s.money -= EXT_ROOM.price
    s.ext = 1
    s.roomReact = s.people.length   // #1814: the wing gets its move-in reactions
    s.events.push({ t: 'room' })
    think(s, 'The east wall rolls open and a spare room rises — plank floor, two windows, room to grow.')
    return true
}

export function buildRoomOk(s) { return roomClear(s) && s.money >= EXT_ROOM.price }

export function place(s, r, c) {
    const def = CATALOG[s.sel]
    if (!def) return false
    if (def.room) {
        if (buildRoom(s)) return true
        s.events.push({ t: 'refuse', r: EXT_ROOM.door[0], c: EXT_ROOM.door[1] })
        return false
    }
    // #2197: the adoption counter — the cat arrives through the gate, so the
    // refusal speaks at the gate, not at the cursor
    if (def.pet) {
        if (adoptPet(s)) return true
        s.events.push({ t: 'refuse', r: 12, c: 5 })
        return false
    }
    // #2203: the same counter law for kids — the agency worker comes to the gate
    if (def.kid) {
        if (adoptKid(s)) return true
        s.events.push({ t: 'refuse', r: 12, c: 5 })
        return false
    }
    // #1823: a refused placement speaks — the view flashes the ghost cell red
    if (s.money < def.price || !canPlace(s, def, r, c)) { s.events.push({ t: 'refuse', r, c }); return false }
    if (def.solid && !keepsOpen(s, r, c)) { s.events.push({ t: 'refuse', r, c }); return false }
    s.money -= def.price
    // #2238: furniture landing on the step tucks yesterday's news away —
    // the paper reference must never dangle under a bookshelf.
    if (s.paper && s.paper.r === r && s.paper.c === c) { s.items = s.items.filter((x) => x !== s.paper); s.paper = null }
    s.items.push({ uid: s.nextUid++, id: def.id, r, c })
    s.events.push({ t: 'place', r, c, id: def.id })
    reflow(s)
    return true
}

export function placeOk(s, r, c) {
    const def = CATALOG[s.sel]
    if (!def) return false
    if (def.room) return buildRoomOk(s)
    if (def.pet) return adoptOk(s)
    if (def.kid) return adoptKidOk(s)
    if (s.money < def.price || !canPlace(s, def, r, c)) return false
    if (def.solid && !keepsOpen(s, r, c)) return false
    return true
}

export function sellAt(s, r, c) {
    const it = cellItem(s, r, c)
    if (!it || it.id === 'mail' || it.id === 'paper') return false   // #2238: the mailbox belongs to the lot, the news to the route
    const def = DEF[it.id]
    s.items = s.items.filter((x) => x !== it)
    s.money += Math.floor(def.price / 2)
    s.events.push({ t: 'sell', r: it.r, c: it.c, id: it.id })
    reflow(s)
    return true
}

// if a person is standing on a just-placed solid, nudge them to a free neighbour
function reflow(s) {
    for (const p of s.people) {
        if (solidAt(s, p.r, p.c)) {
            for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1]]) {
                if (walkable(s, p.r + dr, p.c + dc)) { p.r += dr; p.c += dc; p.path = null; p.goal = null; return }
            }
        }
    }
}

// -------------------------------------------------------- autonomy --------
function needTarget(s, p, need) {
    let best = null, bd = 1e9
    for (const it of s.items) {
        const d = DEF[it.id]
        if (!d || d.need !== need) continue
        const tg = targetsOf(s, it)
        if (!tg.length) continue
        const dist = bfsPath(s, { r: p.r, c: p.c }, tg)
        if (!dist) continue
        if (dist.length < bd) { bd = dist.length; best = { it, path: dist } }
    }
    return best
}

function autonomous(s, p) {
    if (p.faintT > 0 || p.use || p.path || p.goal) return
    if (s.demo && !p.workedToday && !p.working && s.day % 2 === p.worksOn && s.hour >= WORK_START && s.hour < WORK_END - 1) {
        if (cmdWork(s, p)) return
    }
    let worst = null, wv = 1e9
    for (const n of NEEDS) if (p.needs[n] < wv) { wv = p.needs[n]; worst = n }
    if (s.demo && worst && p.needs[worst] < 0.55) {
        // #2203: urgency order, not lowest-only. Serve the lowest need that
        // HAS a target, then step up the list — when social is the bottom but
        // nobody is home to talk to, the stomach still gets its turn. (The cry
        // law keeps social pinned low; under strict lowest-only a lonely Sim
        // moped through the x8 work clock straight into a faint.)
        const order = [...NEEDS].sort((a, b) => p.needs[a] - p.needs[b])
        for (const n of order) {
            if (p.needs[n] >= 0.55) break
            const t = needTarget(s, p, n)
            if (t) { p.path = t.path; p.goal = { kind: 'use', it: t.it }; return }
            if (n === 'social') {           // #2143: chat with whichever neighbour is around
                const nv = nearestVisitor(s)
                if (nv) {
                    const cell = nearestFreeTo(s, nv.v.r, nv.v.c)
                    if (cell) { const path = bfsPath(s, { r: p.r, c: p.c }, [cell]); if (path) { p.path = path; p.goal = { kind: 'chat', v: nv.k }; return } }
                }
            }
        }
    }
    // idle wander (seeded)
    if (s.rng() < 0.006) {
        const opts = []
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (walkable(s, p.r + dr, p.c + dc)) opts.push({ r: p.r + dr, c: p.c + dc })
        if (opts.length) {
            const t = opts[Math.floor(s.rng() * opts.length)]
            const path = bfsPath(s, { r: p.r, c: p.c }, [t])
            if (path) p.path = path
        }
    }
}

function hasVisitor(s) { return !!s.visitor && s.visitor.state !== 'leaving' }
// #2143: two neighbours may share the lot — these are the honest questions
// the rest of the sim asks when it doesn't care WHICH one, only that company
// is around (sofa bonus, autonomy target).
function hasIvy(s) { return !!s.ivy && s.ivy.state !== 'leaving' }
function visitorForKey(s, k) { return k === 'ivy' ? (hasIvy(s) ? s.ivy : null) : (hasVisitor(s) ? s.visitor : null) }
function nearestVisitor(s) {
    const cand = []
    if (hasVisitor(s)) cand.push({ v: s.visitor, k: 'fern' })
    if (hasIvy(s)) cand.push({ v: s.ivy, k: 'ivy' })
    if (!cand.length) return null
    const p = s.people[s.active] || s.people[0]
    cand.sort((a, b) => (Math.abs(p.r - a.v.r) + Math.abs(p.c - a.v.c)) - (Math.abs(p.r - b.v.r) + Math.abs(p.c - b.v.c)))
    return cand[0]
}
function nearestFreeTo(s, r, c) {
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) if (walkable(s, r + dr, c + dc)) return { r: r + dr, c: c + dc }
    return null
}

// ------------------------------------------------ visitor choreography (#2154) ---
// The politeness law. While hanging on the lot a visitor chats with the
// NEAREST eligible resident — not the last one the array happened to offer —
// a resident pays only ONE visitor per tick, and when both neighbours reach
// the same person, the contested resident pays the CLOSER visitor; the loser
// falls back to its own next-nearest unclaimed resident. A tie gives Fern,
// the first neighbour, the ear (#2143's order). When arbitration actually
// splits a pair, a three-way thought line sells the neighbourhood as one
// scene instead of two timers — throttled so the beat stays punctuation.
export const TRI_TELL_CD = 7   // world seconds between three-way tells
export const TRI_LINES = [
    'Fern and Ivy both want a word — the house learns to take turns.',
    'Two neighbours, one listening ear: the closer foot gets the first word.',
]
function eligibleNear(s, v) {
    return s.people
        .map((p, i) => ({ p, i, d: Math.abs(p.r - v.r) + Math.abs(p.c - v.c) }))
        .filter((e) => e.d <= 2 && e.p.faintT <= 0 && !e.p.working)
        .sort((a, b) => (a.d - b.d) || (a.i - b.i))
        .map((e) => e.p)
}
function arbitrateVisitors(s) {
    const fv = hasVisitor(s) && s.visitor.state === 'hang' ? s.visitor : null
    const iv = hasIvy(s) && s.ivy.state === 'hang' ? s.ivy : null
    if (fv) fv.claim = null
    if (iv) iv.claim = null
    if (!fv && !iv) return
    const fNear = fv ? eligibleNear(s, fv) : []
    const iNear = iv ? eligibleNear(s, iv) : []
    if (fv && fNear.length) fv.claim = fNear[0]
    if (iv && iNear.length) iv.claim = iNear[0]
    if (fv && iv && fv.claim && fv.claim === iv.claim) {
        const df = Math.abs(fv.claim.r - fv.r) + Math.abs(fv.claim.c - fv.c)
        const di = Math.abs(iv.claim.r - iv.r) + Math.abs(iv.claim.c - iv.c)
        if (di < df) fv.claim = fNear[1] || null     // Ivy stands closer — Fern yields
        else iv.claim = iNear[1] || null               // Fern closer, or a tie: first neighbour wins
        if (s.triTell <= 0) {
            s.triHits += 1                             // #2154: tells alternate wording, cleanly
            think(s, TRI_LINES[s.triHits % TRI_LINES.length])
            s.triTell = TRI_TELL_CD
        }
    }
}

// ------------------------------------------------------- paper route ------
// #2238: the lot's first hourly citizen. The boy rides past off-screen; only
// the news and a flutter arrive, on schedule, with nobody home or not. The
// landing spot is the path just inside the gate (the gravel run the mail and
// the neighbours already walk); a blocked step falls back to its free edge.
function updatePaper(s) {
    // one paper a day, full stop: reading it early must not re-arm the route
    // inside the window (the day stamp is the law; newDay clears it afresh).
    if (s.paper || s.paperDay === s.day || s.hour < s.paperAfter || s.hour >= PAPER_LATE) return
    const spot = walkable(s, 10, 5) ? { r: 10, c: 5 } : nearestFreeTo(s, 10, 5)
    if (!spot) return
    const it = { uid: s.nextUid++, id: 'paper', r: spot.r, c: spot.c }
    s.items.push(it)
    s.paper = it
    s.paperDay = s.day
    s.events.push({ t: 'paper', r: spot.r, c: spot.c })
    think(s, pick(s, PAPER_LINES))
}

// ----------------------------------------------------------- visitor ------
function updateVisitor(s, dt) {
    const v = s.visitor
    if (!v) {
        if (s.hour >= s.visitAfter + s.visitGap && s.hour < 19) {
            const room = s.items.find((it) => it.id === 'sofa')
            const dest = room ? targetsOf(s, room)[0] : { r: 3, c: 4 }
            const path = dest && walkable(s, 12, 5) ? bfsPath(s, { r: 12, c: 5 }, [dest]) : null
            if (path) {
                s.visitor = {
                    name: 'Fern', r: 12, c: 5, x: tileX(5) + TILE / 2, y: tileY(12) + TILE / 2,
                    path, state: 'enter', t: 0, hue: '#4fae5f', face: 1, walkPhase: 0, chatT: 0,
                    hangUntil: 45 + s.rng() * 45 + 6 * relLevel(s.rel.fern),   // #1817: friends linger
                }
                s.events.push({ t: 'visit', name: 'Fern' })
                think(s, 'A neighbour rings the bell. Fern drifts in through the gate.')
            }
        }
        return
    }
    v.t += dt
    walkAlong(s, v, dt, 44)
    if (v.path && !v.path.length) v.path = null
    if (v.state === 'enter' && !v.path) { v.state = 'hang'; v.t = 0 }
    if (v.state === 'hang') {
        // #2154 choreography law: chat with the NEAREST resident; when both
        // neighbours reach the same person the contested one pays the closer
        // visitor (claims settle in arbitrateVisitors, once per tick).
        const partner = v.claim || null
        if (partner) {
            partner.chatT += dt
            v.chatT += dt
            partner.needs.social = Math.min(1, partner.needs.social + 0.06 * dt)
            relAdd(s, 'fern', 0.07 * dt)   // #1817: the bond climbs while they talk
            // #2135: the crossing check read 0.06·dt (the social rate, a typo) —
            // with a fixed dt the line NEVER fired. Ivy's law was the honest one.
            if (partner.chatT > 2.4 && partner.chatT - dt <= 2.4) {
                think(s, chatLine(s, partner))
                s.events.push({ t: 'chat', k: 'fern', x: (v.x + partner.x) / 2, y: (v.y + partner.y) / 2 })   // #2135: the bubble rides over the pair
            }
        }
        if (s.hour > 19 || v.t > v.hangUntil) { v.state = 'leaving'; v.path = bfsPath(s, { r: v.r, c: v.c }, [{ r: 12, c: 5 }]) }
    } else if (v.state === 'leaving' && !v.path) {
        s.visitor = null
        s.events.push({ t: 'visit-end' })
        scheduleVisit(s)
        return
    }
    // if furniture changed around them, re-home toward the living room
    if (v.state === 'hang' && !v.path && !partnerNear(s, v) && !v.repathT) {
        v.repathT = 3
    }
    if (v.repathT) {
        v.repathT -= dt
        if (v.repathT <= 0 && !v.path) {
            const sofa = s.items.find((it) => it.id === 'sofa')
            const dest = sofa ? targetsOf(s, sofa)[0] : { r: 3, c: 4 }
            if (dest) v.path = bfsPath(s, { r: v.r, c: v.c }, [dest])
        }
    }
}
function partnerNear(s, v) {
    for (const p of s.people) if (Math.abs(p.r - v.r) + Math.abs(p.c - v.c) <= 3) return true
    return false
}

// ------------------------------------------------------------- ivy (#2143) ---
// The second neighbour, on her own clock. Fern is untouched — both may share
// the lot. Ivy enters through the gate toward the kitchen (she shops for a
// living), chats on the same reach law, and lingers/returns by her own
// ladder math. From FRIENDS up she arrives with a market basket — a gift the
// whole household eats — and the FAMILY basket adds her honey-money. Every
// random comes from s.rng, so seeds stay exact.
function updateIvy(s, dt) {
    const v = s.ivy
    if (!v) {
        if (s.hour >= s.ivyAfter + s.ivyGap && s.hour < 19) {
            const kitchen = s.items.find((it) => it.id === 'stove') || s.items.find((it) => it.id === 'fridge')
            const dest = kitchen ? targetsOf(s, kitchen)[0] : { r: 5, c: 2 }
            const path = dest && walkable(s, 12, 5) ? bfsPath(s, { r: 12, c: 5 }, [dest]) : null
            if (path) {
                const lv = relLevel(s.rel.ivy)
                const gift = lv >= 2
                s.ivy = {
                    name: 'Ivy', r: 12, c: 5, x: tileX(5) + TILE / 2, y: tileY(12) + TILE / 2,
                    path, state: 'enter', t: 0, hue: IVY_HUE, face: 1, walkPhase: 0, chatT: 0,
                    hangUntil: 40 + s.rng() * 40 + 8 * lv,   // friends linger — harder per level than Fern
                    gift,
                }
                s.events.push({ t: 'visit', name: 'Ivy' })
                think(s, gift
                    ? 'Ivy drifts in through the gate, market basket already swinging.'
                    : 'Ivy stops by on the way back from the market — empty basket for now.')
                if (gift) {
                    for (const p of s.people) p.needs.hunger = Math.min(1, p.needs.hunger + IVY_GIFT_HUNGER)
                    s.content = Math.min(WIN_CONTENT, s.content + 1)
                    let money = 0
                    if (lv >= 3) {
                        money = IVY_GIFT_CASH
                        s.money += money
                        s.content = Math.min(WIN_CONTENT, s.content + 1)
                    }
                    s.events.push({ t: 'gift', lv, money })
                    think(s, money
                        ? `Ivy leaves greens AND a jar of her honey — the till jingles with §${money}.`
                        : 'Ivy leaves a basket of market greens on the kitchen step.')
                }
            }
        }
        return
    }
    v.t += dt
    walkAlong(s, v, dt, 44)
    if (v.path && !v.path.length) v.path = null
    if (v.state === 'enter' && !v.path) { v.state = 'hang'; v.t = 0 }
    if (v.state === 'hang') {
        // chat on the #2154 choreography law — nearest resident, contested
        // residents pay the closer visitor; claim settles once per tick.
        const partner = v.claim || null
        if (partner) {
            partner.chatT += dt
            v.chatT += dt
            partner.needs.social = Math.min(1, partner.needs.social + IVY_SOCIAL * dt)
            relAdd(s, 'ivy', IVY_CHAT * dt)   // a slower burner than Fern, by design
            if (partner.chatT > 2.4 && partner.chatT - dt <= 2.4) {
                think(s, chatLine(s, partner, 'ivy'))
                s.events.push({ t: 'chat', k: 'ivy', x: (v.x + partner.x) / 2, y: (v.y + partner.y) / 2 })   // #2135
            }
        }
        if (s.hour > 19 || v.t > v.hangUntil) { v.state = 'leaving'; v.path = bfsPath(s, { r: v.r, c: v.c }, [{ r: 12, c: 5 }]) }
    } else if (v.state === 'leaving' && !v.path) {
        s.ivy = null
        s.events.push({ t: 'visit-end', who: 'ivy' })
        scheduleIvy(s)
        return
    }
    // if furniture changed around them, re-home toward the kitchen
    if (v.state === 'hang' && !v.path && !partnerNear(s, v) && !v.repathT) v.repathT = 3
    if (v.repathT) {
        v.repathT -= dt
        if (v.repathT <= 0 && !v.path) {
            const kitchen = s.items.find((it) => it.id === 'stove') || s.items.find((it) => it.id === 'fridge')
            const dest = kitchen ? targetsOf(s, kitchen)[0] : { r: 5, c: 2 }
            if (dest) v.path = bfsPath(s, { r: v.r, c: v.c }, [dest])
        }
    }
}

// #1817: two residents idling within arm's reach share the moment — the
// household bond climbs on co-presence chat (the original raises relationship
// bars just by talking), on its own slower tick with its own small talk.
// -------------------------------------------------------------- pet (#2197) --
// Miso lives by the lot's laws: every move asks walkable() (walls, solids and
// the #1806 wing for free), she never blocks anything, and night curls her up
// asleep on the nearest free floor tile. Hunger walks her to the fridge's use
// spots. The bond law reaches pet scale: a resident standing in arm's reach
// coos — fun, social trickle, a slow house-bond climb, sparks. She can never
// faint: neglect costs a cat embarrassment, never a run.
const FLOOR_CELLS = []
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (MAP[r][c] === 'F') FLOOR_CELLS.push([r, c])

function nearestFloorCell(s, r, c) {
    let best = null, bd = 1e9
    for (const [rr, cc] of FLOOR_CELLS) {
        if (!walkable(s, rr, cc)) continue
        const d = Math.abs(rr - r) + Math.abs(cc - c)
        if (d < bd) { bd = d; best = { r: rr, c: cc } }
    }
    return best
}

export function adoptOk(s) {
    if (s.done || s.pet || s.money < PET.price) return false
    const dest = nearestFloorCell(s, 6, 7)
    return !!dest && walkable(s, 12, 5) && !!bfsPath(s, { r: 12, c: 5 }, [dest])
}

export function adoptPet(s) {
    if (!adoptOk(s)) return false
    s.money -= PET.price
    const dest = nearestFloorCell(s, 6, 7)
    s.pet = {
        name: PET.name, r: 12, c: 5, x: tileX(5) + TILE / 2, y: tileY(12) + TILE / 2,
        path: bfsPath(s, { r: 12, c: 5 }, [dest]), state: 'enter', t: 0, face: 1, walkPhase: 0,
        needs: { hunger: 0.8, fun: 0.75, energy: 0.85 },
        asleep: false, cd: 0, purrT: 0, wanderT: 2, food: false, bedT: 0, stepDist: 0,
    }
    s.events.push({ t: 'pet', name: PET.name, x: s.pet.x, y: s.pet.y })
    think(s, 'The carrier clicks open at the gate — Miso stretches, claims the lot, and trots inside.')
    return true
}

function updatePet(s, dt) {
    const p = s.pet
    if (!p) return
    p.t += dt
    if (p.cd > 0) p.cd = Math.max(0, p.cd - dt)
    if (p.purrT > 0) p.purrT = Math.max(0, p.purrT - dt)
    const dh = dt / HOUR_SEC
    p.needs.hunger = Math.max(0, p.needs.hunger - PET_DECAY.hunger * dh)
    p.needs.fun = Math.max(0, p.needs.fun - PET_DECAY.fun * dh * (p.asleep ? 0.3 : 1))
    const night = isNight(s)
    if (p.asleep) p.needs.energy = Math.min(1, p.needs.energy + 0.34 * dh * 8)
    else p.needs.energy = Math.max(0, p.needs.energy - PET_DECAY.energy * dh)

    // the coo law: a resident in arm's reach pays love both ways
    if (p.cd === 0) {
        let partner = null
        for (const q of s.people) if (q.faintT <= 0 && !q.working && Math.abs(q.r - p.r) + Math.abs(q.c - p.c) <= 1) partner = q
        if (partner) {
            partner.needs.social = Math.min(1, partner.needs.social + PET_SOCIAL)
            p.needs.fun = Math.min(1, p.needs.fun + 0.25)
            relAdd(s, 'house', PET_BOND)
            s.content = Math.min(WIN_CONTENT, s.content + 1)
            p.cd = PET_COOS
            p.purrT = 1.4
            s.events.push({ t: 'pet-coo', name: partner.name, x: p.x, y: p.y })
            if (s.rng() < 0.5) think(s, pick(s, PET_COO_LINES).replace('{n}', partner.name))
        }
    }

    if (p.asleep) {
        if (!night) { p.asleep = false; p.state = 'roam'; think(s, 'Miso unspools at dawn and stretches down the whole hallway.') }
        return
    }
    // night: find a warm floor tile and pour herself into a loaf
    if (night) {
        if (p.state === 'bed' && p.path && p.path.length) { walkAlong(s, p, dt, 44); return }
        if (p.state === 'bed') { p.asleep = true; p.state = 'sleep'; if (s.rng() < 0.6) think(s, pick(s, SLEEP_LINES)); return }
        p.bedT -= dt
        if (p.bedT <= 0) {
            p.bedT = 1
            const cell = nearestFloorCell(s, p.r, p.c)
            const path = cell ? bfsPath(s, { r: p.r, c: p.c }, [cell]) : null
            if (path) { p.path = path; p.state = 'bed' } else { p.asleep = true; p.state = 'sleep' }
        }
        return
    }
    // kibble: a hungry cat works the fridge (or whatever the kitchen offers)
    if (!p.food && p.needs.hunger < 0.3) {
        const fr = findNearest(s, p, 'fridge') || findNearest(s, p, 'stove')
        if (fr) {
            const path = bfsPath(s, { r: p.r, c: p.c }, fr.tg)
            if (path) { p.path = path; p.food = true; p.state = 'food' }
        }
    }
    if (p.food && !p.path) {
        p.food = false
        p.needs.hunger = Math.min(1, p.needs.hunger + 0.55)
        p.state = 'roam'
        s.events.push({ t: 'pet-eat', name: p.name, x: p.x, y: p.y })
        think(s, 'Miso works the fridge latch like a puzzle toy. Kibble: acquired.')
    }
    // wander the lot — every pick asks walkable AND reachable, every seed the same
    if (!p.path) {
        p.wanderT -= dt
        if (p.wanderT <= 0) {
            p.wanderT = 3 + s.rng() * 4
            const rr = Math.max(0, Math.min(ROWS - 1, p.r + Math.floor(s.rng() * 7) - 3))
            const cc = Math.max(0, Math.min(COLS - 1, p.c + Math.floor(s.rng() * 7) - 3))
            if (walkable(s, rr, cc)) {
                const path = bfsPath(s, { r: p.r, c: p.c }, [{ r: rr, c: cc }])
                if (path) p.path = path
            }
            p.state = 'roam'
        }
    }
    walkAlong(s, p, dt, 48)
    if (p.path && !p.path.length) p.path = null
}

// -------------------------------------------------------------- kid (#2203) --
// Pip lives by the lot's laws exactly like the cat — every pick asks walkable
// AND pathfinds before committing, nothing is ever blocked — but by a child's
// rules: FUN burns fastest, PLAY is the verb (a bored child hunts the fun
// objects), night puts the child to bed, and neglect is LOUD: red fun means a
// wail every KID_CRY_CD that stings the social of every resident in earshot.
// Love is a law too: an idle resident within arm's reach tumbles into play on
// the pet's cooldown (fun, social, rel.kid, content), and the court (C/X or
// the held thumb) speaks kind or cruel. A child never faints — the same engine
// doctrine as the cat: sad and bored is life, not death.
export function adoptKidOk(s) {
    if (s.done || s.kid || s.money < KID.price) return false
    const dest = nearestFloorCell(s, 5, 5)
    return !!dest && walkable(s, 12, 5) && !!bfsPath(s, { r: 12, c: 5 }, [dest])
}

export function adoptKid(s) {
    if (!adoptKidOk(s)) return false
    s.money -= KID.price
    const dest = nearestFloorCell(s, 5, 5)
    s.kid = {
        name: KID.name, r: 12, c: 5, x: tileX(5) + TILE / 2, y: tileY(12) + TILE / 2,
        path: bfsPath(s, { r: 12, c: 5 }, [dest]), state: 'enter', t: 0, face: 1, walkPhase: 0,
        needs: { hunger: 0.8, fun: 0.7, energy: 0.85, social: 0.75 },
        asleep: false, cd: 0, giggleT: 0, cryT: 0, wanderT: 2, food: false, playObj: false, bedT: 0, stepDist: 0,
    }
    s.events.push({ t: 'kid', name: KID.name, x: s.kid.x, y: s.kid.y })
    think(s, ADOPT_KID_LINE)
    return true
}

// the nearest item whose use feeds FUN — whatever the living room offers
function funTarget(s, k) {
    let best = null, bd = 1e9
    for (const it of s.items) {
        const d = DEF[it.id]
        if (!d || d.need !== 'fun') continue
        const tg = targetsOf(s, it)
        if (!tg.length) continue
        const dist = Math.min(...tg.map((t) => Math.abs(t.r - k.r) + Math.abs(t.c - k.c)))
        if (dist < bd) { bd = dist; best = { it, tg } }
    }
    return best
}

function updateKid(s, dt) {
    const k = s.kid
    if (!k) return
    k.t += dt
    if (k.cd > 0) k.cd = Math.max(0, k.cd - dt)
    if (k.giggleT > 0) k.giggleT = Math.max(0, k.giggleT - dt)
    if (k.cryT > 0) k.cryT = Math.max(0, k.cryT - dt)
    const dh = dt / HOUR_SEC
    k.needs.hunger = Math.max(0, k.needs.hunger - KID_DECAY.hunger * dh)
    k.needs.fun = Math.max(0, k.needs.fun - KID_DECAY.fun * dh * (k.asleep ? 0.3 : 1))
    k.needs.social = Math.max(0, k.needs.social - KID_DECAY.social * dh)
    const night = isNight(s)
    if (k.asleep) k.needs.energy = Math.min(1, k.needs.energy + 0.34 * dh * 8)
    else k.needs.energy = Math.max(0, k.needs.energy - KID_DECAY.energy * dh)

    // the tumble law: an idle resident in arm's reach drops into play — the
    // pet coo at kid scale, one fall of friendship per cooldown
    if (k.cd === 0 && !k.asleep && k.needs.fun > RED_AT) {
        let partner = null
        for (const q of s.people) if (q.faintT <= 0 && !q.working && Math.abs(q.r - k.r) + Math.abs(q.c - k.c) <= 1) partner = q
        if (partner) {
            partner.needs.social = Math.min(1, partner.needs.social + KID_SOCIAL)
            k.needs.fun = Math.min(1, k.needs.fun + 0.3)
            k.needs.social = Math.min(1, k.needs.social + 0.12)
            relAdd(s, 'kid', KID_BOND)
            s.content = Math.min(WIN_CONTENT, s.content + 1)
            k.cd = KID_PLAY
            k.giggleT = 1.2
            s.events.push({ t: 'kid-tumble', name: partner.name, x: k.x, y: k.y })
            if (s.rng() < 0.5) think(s, pick(s, KID_TUMBLE_LINES).replace('{n}', partner.name))
        }
    }

    // the cry law: a red-fun child wails, and the wail stings everyone within
    // earshot — neglect made audible. Never fatal; attention (a tumble, a coo,
    // a play session) lifts fun over RED_AT and the crying stops.
    if (k.needs.fun <= RED_AT && !k.asleep && k.cryT === 0) {
        k.cryT = KID_CRY_CD
        for (const q of s.people) if (q.faintT <= 0 && !q.working && Math.abs(q.r - k.r) + Math.abs(q.c - k.c) <= 3) q.needs.social = Math.max(0, q.needs.social - KID_CRY_STING)
        s.events.push({ t: 'kid-cry', name: k.name, x: k.x, y: k.y })
        if (s.rng() < 0.6) think(s, pick(s, KID_CRY_LINES))
    }

    if (k.asleep) {
        if (!night) { k.asleep = false; k.state = 'roam'; think(s, 'Pip wakes with the sun, already planning the day.') }
        return
    }
    // bedtime: night finds the nearest free floor tile, and a child folds up small
    if (night) {
        if (k.state === 'bed' && k.path && k.path.length) { walkAlong(s, k, dt, 44); return }
        if (k.state === 'bed') { k.asleep = true; k.state = 'sleep'; if (s.rng() < 0.6) think(s, pick(s, KID_BED_LINES)); return }
        k.bedT -= dt
        if (k.bedT <= 0) {
            k.bedT = 1
            const cell = nearestFloorCell(s, k.r, k.c)
            const path = cell ? bfsPath(s, { r: k.r, c: k.c }, [cell]) : null
            if (path) { k.path = path; k.state = 'bed' } else { k.asleep = true; k.state = 'sleep' }
        }
        return
    }
    // snacks: a hungry child works the fridge (or whatever the kitchen offers)
    if (!k.food && k.needs.hunger < 0.3) {
        const fr = findNearest(s, k, 'fridge') || findNearest(s, k, 'stove')
        if (fr) {
            const path = bfsPath(s, { r: k.r, c: k.c }, fr.tg)
            if (path) { k.path = path; k.food = true; k.state = 'food' }
        }
    }
    if (k.food && !k.path) {
        k.food = false
        k.needs.hunger = Math.min(1, k.needs.hunger + 0.5)
        k.state = 'roam'
        s.events.push({ t: 'kid-eat', name: k.name, x: k.x, y: k.y })
        think(s, pick(s, KID_SNACK_LINES))
    }
    // play: a bored child hunts the fun objects — the kid's own need loop
    if (!k.playObj && !k.food && k.needs.fun < 0.3) {
        const ft = funTarget(s, k)
        if (ft) {
            const path = bfsPath(s, { r: k.r, c: k.c }, ft.tg)
            if (path) { k.path = path; k.playObj = true; k.state = 'play' }
        }
    }
    if (k.playObj && !k.path) {
        k.playObj = false
        k.needs.fun = Math.min(1, k.needs.fun + 0.45)
        k.state = 'roam'
        k.giggleT = 1.4
        s.events.push({ t: 'kid-play', name: k.name, x: k.x, y: k.y })
        think(s, pick(s, KID_PLAY_LINES))
    }
    // scamper the lot — every pick asks walkable AND reachable, every seed the same
    if (!k.path) {
        k.wanderT -= dt
        if (k.wanderT <= 0) {
            k.wanderT = 2.5 + s.rng() * 3.5
            const rr = Math.max(0, Math.min(ROWS - 1, k.r + Math.floor(s.rng() * 9) - 4))
            const cc = Math.max(0, Math.min(COLS - 1, k.c + Math.floor(s.rng() * 9) - 4))
            if (walkable(s, rr, cc)) {
                const path = bfsPath(s, { r: k.r, c: k.c }, [{ r: rr, c: cc }])
                if (path) k.path = path
            }
            k.state = 'roam'
        }
    }
    walkAlong(s, k, dt, 52)
    if (k.path && !k.path.length) k.path = null
}

function updateHouseBond(s, dt) {
    const [a, b] = s.people
    const idle = (p) => p.faintT <= 0 && !p.working && !p.use
    if (s.spatCd > 0) s.spatCd = Math.max(0, s.spatCd - dt)
    if (!idle(a) || !idle(b) || Math.abs(a.r - b.r) + Math.abs(a.c - b.c) > 2) {
        if (s.houseLineCd > 0) s.houseLineCd -= dt
        return
    }
    // #2070: spat — needs in the red, tempers lower, and nothing nearby to
    // distract them: the pair trades barbs once per window instead of gossip.
    if (!s.grudge && s.spatCd <= 0 && moodOf(a) === 0 && moodOf(b) === 0) {
        s.grudge = 1
        s.spats++
        s.spatCd = SPAT_CD
        s.spatFx = 2.4   // #2076: the pair argues ON the lot — storm puff over their heads
        s.houseLineCd = GRUDGE_FIRST_CD   // #2135: the sour beats start after the crack, not on top of it
        a.needs.social = Math.max(0, a.needs.social - SPAT_SOCIAL)
        b.needs.social = Math.max(0, b.needs.social - SPAT_SOCIAL)
        relSub(s, 'house', SPAT_DROP)
        s.events.push({ t: 'spat', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
        think(s, pick(s, SPAT_LINES))
        return
    }
    // #2070: cold war — while a grudge holds, company builds nothing (the bond
    // still cools by absence). The one exit: the same reach, tempers both up.
    if (s.grudge) {
        if (moodOf(a) === 2 && moodOf(b) === 2) {
            s.grudge = 0
            relAdd(s, 'house', MAKEUP_BOND)
            s.content = Math.min(WIN_CONTENT, s.content + 1)
            s.events.push({ t: 'makeup', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
            think(s, pick(s, MAKEUP_LINES))
        } else if (s.houseLineCd <= 0) {
            // #2135: the cold war is not silent — the sourness speaks on a clock
            s.houseLineCd = GRUDGE_COOL_CD
            think(s, pick(s, COOL_LINES))
            s.events.push({ t: 'grudge-cool', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
        } else s.houseLineCd -= dt
        return
    }
    a.needs.social = Math.min(1, a.needs.social + 0.03 * dt)
    b.needs.social = Math.min(1, b.needs.social + 0.03 * dt)
    relAdd(s, 'house', 0.05 * dt)
    if (s.houseLineCd <= 0) {
        s.houseLineCd = 11
        think(s, pick(s, HOUSE_LINES))
    } else s.houseLineCd -= dt
}

// ----------------------------------------------------------- walking ------
// #1823: walk-surface feel — one 'step' event per footfall (~18 px travelled),
// carrying the ground underfoot so planks, lawn and path get distinct timbres.
const STEP_PX = 18
function footstep(s, p, moved) {
    p.stepDist = (p.stepDist || 0) + moved
    while (p.stepDist >= STEP_PX) {
        p.stepDist -= STEP_PX
        s.events.push({ t: 'step', surf: groundOf(s, p.r, p.c) })
    }
}

function walkAlong(s, p, dt, spd) {
    if (!p.path || !p.path.length) return
    let step = spd * dt
    const budget = step
    while (step > 0 && p.path.length) {
        const t = p.path[0]
        const tx = tileX(t.c) + TILE / 2, ty = tileY(t.r) + TILE / 2
        const dx = tx - p.x, dy = ty - p.y
        const d = Math.hypot(dx, dy)
        p.face = dx >= 0 ? 1 : -1
        if (d <= step) {
            p.x = tx; p.y = ty; p.r = t.r; p.c = t.c
            p.path.shift()
            step -= d
        } else {
            p.x += (dx / d) * step; p.y += (dy / d) * step
            step = 0
        }
        p.walkPhase += dt * 9
    }
    footstep(s, p, budget - step)
}

const moodMul = (p) => (p.needs.energy < 0.2 ? 0.6 : p.needs.hunger < 0.2 ? 0.75 : p.mood > 0.7 ? 1.12 : 1)

// --------------------------------------------------------- interactions ----
function finishUse(s, p) {
    const { def } = p.use
    const it = p.use.it
    const before = p.needs[def.need]
    p.needs[def.need] = Math.min(1, p.needs[def.need] + def.amt)
    p.use = null
    // #2238: the news is read once — today's paper folds away with the last page.
    if (def.id === 'paper' && s.paper === it) { s.items = s.items.filter((x) => x !== it); s.paper = null }
    const quality = avg(p) > 0.55
    let n = quality ? 2 : 1
    if (def.social && (hasVisitor(s) || hasIvy(s))) { p.needs.social = Math.min(1, p.needs.social + 0.25); n += 1 }   // #2143: any company counts
    s.content = Math.min(WIN_CONTENT, s.content + n)
    s.events.push({ t: 'content', n, id: def.id })
    s.events.push({ t: 'satisfied', need: def.need, name: p.name })
    think(s, doneLine(s, p, def, before))
}

// -------------------------------------------------------------- work ------
function startWork(s, p) {
    p.working = true
    p.workedToday = true
    s.fastT = Math.max(s.fastT, 6)
    s.events.push({ t: 'work-go', name: p.name })
    s.fastT = 1.5
    think(s, `${p.name} heads off to work — the day pays the bills.`)
}
function endWork(s, p) {
    p.working = false
    const pay = 60 + s.rank * 40
    s.money += pay
    s.workDays++
    s.rank = Math.min(3, 1 + Math.floor(s.workDays / 2))
    s.content = Math.min(WIN_CONTENT, s.content + 3)
    s.events.push({ t: 'pay', pay, rank: s.rank })
    think(s, pick(s, [
        `${p.name} clocks out with §${pay} jingling in their pocket.`,
        `A decent day at work — §${pay} richer, a little prouder.`,
    ]))
    // #1817: close friends toast the payday together — once per day, a bonus beat
    if (s.rel.house >= REL_EDGES[1] && s.lastToast !== s.day) {
        s.lastToast = s.day
        s.content = Math.min(WIN_CONTENT, s.content + 1)
        s.events.push({ t: 'content', n: 1, id: 'toast' })
        think(s, pick(s, [
            'Payday! Otto and Mira clink mugs across the kitchen table.',
            'The payday toast tastes better with a friend in the house.',
        ]))
    }
    const mail = s.items.find((it) => it.id === 'mail')
    if (mail) { const t = targetsOf(s, mail)[0]; if (t) { p.r = t.r; p.c = t.c; p.x = tileX(t.c) + TILE / 2; p.y = tileY(t.r) + TILE / 2; p.path = null } }
}

// ------------------------------------------------------------ thoughts ----
function think(s, line) {
    s.thoughts.unshift({ text: line, t: 7 })
    if (s.thoughts.length > 4) s.thoughts.length = 4
}
function pick(s, opts) { return Array.isArray(opts) ? opts[Math.floor(s.rng() * opts.length)] : opts }
// #1817: the topics pool widens with the bond — a fresh neighbour gets small
// talk; FAMILY gets the running jokes. Tier membership is the unlock.
export function chatPool(s) {
    const lv = relLevel(s.rel.fern)
    const base = [
        `{p} and Fern swap stories about the weather.`,
        `Fern brings over a casserole nobody asked for.`,
        `{p} laughs at Fern's terrible jokes.`,
        `They argue, gently, about garden gnomes.`,
    ]
    if (lv >= 1) base.push(`Fern and {p} compare garden notes — the tomato grudge continues.`)
    if (lv >= 2) base.push(`Fern confides the neighbourhood secrets to {p}.`, `{p} saves Fern a seat by the radio.`)
    if (lv >= 3) base.push(`Fern and {p} finish each other's sentences about the weather.`, `Family business: Fern and {p} plan the street's next potluck.`)
    return base
}
function chatLine(s, p, k = 'fern') {
    const pool = k === 'ivy' ? ivyChatPool(s) : chatPool(s)
    return pick(s, pool).replace(/\{p\}/g, p.name)
}
// #2143: Ivy's topics — the market runs, the garden, the neighbourhood's
// economics. Her pool widens on the same tier law as Fern's: the ladder IS
// the unlock, twice proven.
export function ivyChatPool(s) {
    const lv = relLevel(s.rel.ivy)
    const base = [
        `Ivy and {p} haggle over tomato prices — the market has its sports.`,
        `{p} sniffs Ivy's rosemary; she gives sprigs away like confetti.`,
        `Ivy trades gossip from three streets over.`,
    ]
    if (lv >= 1) base.push(`Ivy saves {p} the ugly-but-delicious zucchinis.`)
    if (lv >= 2) base.push(`Ivy and {p} plan the garden out loud, rows and all.`, `Ivy slips {p} cuttings wrapped in a wet paper towel.`)
    if (lv >= 3) base.push(`Ivy and {p} are garden conspirators now — the fence has secrets.`, `Family business: Ivy picks the household's winter stores.`)
    return base
}
function doneLine(s, p, def, before) {
    if (def.id === 'bed') return pick(s, [`${p.name} sleeps like a log.`, `${p.name} dreamed about flying.`])
    if (def.id === 'mail') return ''
    if (def.id === 'paper') return pick(s, [`${p.name} reads the funny pages, front to back.`, `${p.name} does the crossword in two minutes flat.`, `${p.name} folds the paper with the comics left out.`])
    if (def.id === 'phone') return `${p.name} chats for ages on the phone.`
    if (def.id === 'toilet') return `${p.name} feels enormously relieved.`
    if (before < 0.25) return pick(s, [`${p.name} needed that.`, `${p.name} sighs with relief.`])
    return pick(s, [`${p.name} hums a little tune.`, `${p.name} feels quite accomplished.`, `${p.name} enjoys a small pleasure.`])
}
function idleThought(s, p) {
    if (p.needs.hunger < 0.3) return pick(s, [`${p.name} is dreaming about cheese.`, `${p.name}'s stomach rumbles loudly.`])
    if (p.needs.energy < 0.3) return `${p.name} can barely keep their eyes open.`
    if (p.needs.fun < 0.3) return `${p.name} wishes there was more to do out here.`
    if (p.needs.social < 0.3) return `${p.name} waves at no one in particular.`
    if (p.needs.bladder < 0.25) return `${p.name} does a little dance. Not that kind.`
    if (avg(p) > 0.85) return pick(s, [`${p.name} is feeling wonderful.`, `${p.name} twirls once for joy.`])
    return pick(s, [`${p.name} watches a cloud shaped like a hat.`, `${p.name} hums a tune nobody knows.`, `${p.name} wonders what's for dinner.`])
}

export const avg = (p) => NEEDS.reduce((a, n) => a + p.needs[n], 0) / NEEDS.length
export const isNight = (s) => s.hour >= 22 || s.hour < 6
export const moodOf = (p) => { const a = avg(p); return p.faintT > 0 ? 0 : a > 0.7 ? 2 : a > 0.4 ? 1 : 0 }

// -------------------------------------------------------------- clock -----
function applyHourAt(s, hh) {
    const night = hh >= 22 || hh < 6
    for (const p of s.people) {
        if (p.working) continue
        const sleeping = !!(p.use && p.use.def.id === 'bed')
        for (const n of NEEDS) {
            if (sleeping) {
                if (n === 'energy') p.needs.energy = Math.min(1, p.needs.energy + 0.13)
                continue
            }
            let d = DECAY[n]
            if (night) d *= 0.5
            if (n === 'energy' && night) d = NIGHT_ENERGY
            p.needs[n] = Math.max(0, p.needs[n] - d)
        }
    }
    if (!night) {
        const allHappy = s.people.every((p) => !p.working && avg(p) > 0.65)
        if (allHappy && ambienceOf(s) > 0.45) {
            s.content = Math.min(WIN_CONTENT, s.content + 1)
            s.happyHours++
            s.events.push({ t: 'content', n: 2, id: 'home' })
            think(s, pick(s, ['A happy hour passes over the little house.', 'The household hums along contentedly.']))
        }
    }
    // #1817: bonds fade when nobody invests — absence from Fern stings faster.
    // Per-hour values (an hour is only 5 real seconds on this clock): kept well
    // under the per-second chat growth so attention beats entropy at 1x AND x8.
    // #2076: the fade rides relSub — a bond sinking below an edge from absence
    // demotes through the SAME event a spat uses (one rel-down per crossing,
    // not per hour; below the zero floor relSub stays silent).
    relSub(s, 'house', 0.02)
    relSub(s, 'fern', 0.035)
    relSub(s, 'ivy', IVY_FADE)     // #2143: Ivy cools slower than Fern, faster than home
    relSub(s, 'kid', KID_FADE)     // #2203: a child at home barely cools at all — but silence still counts
}
function newDay(s) {
    for (const p of s.people) p.workedToday = false
    // #2238: yesterday's news rots — the stale edition goes out before the
    // fresh route is due, so the step never stacks up a week of papers.
    if (s.paper) { s.items = s.items.filter((it) => it !== s.paper); s.paper = null }
    schedulePaper(s)
    s.day++
    s.events.push({ t: 'day', day: s.day })
}

export function ambienceOf(s) {
    let d = 0
    for (const it of s.items) if (DECOR.includes(it.id)) d++
    return Math.min(1, d * 0.12)
}

// ------------------------------------------------------------- tick -------
export function advance(s, dt) {
    if (s.done) return
    s.tick++
    s.sec += dt
    if (s.spatFx > 0) s.spatFx = Math.max(0, s.spatFx - dt)   // #2076: the sprite tell fades on the real clock
    if (s.cooFx > 0) s.cooFx = Math.max(0, s.cooFx - dt)       // #2131: the warm tell too
    if (s.cmdCd > 0) s.cmdCd = Math.max(0, s.cmdCd - dt)       // #2131: command cooldown rides the real clock
    if (s.triTell > 0) s.triTell = Math.max(0, s.triTell - dt) // #2154: the three-way tell throttles on the world clock
    if (s.build) return     // time stands still in buy mode
    if (s.fastT > 0) s.fastT = Math.max(0, s.fastT - dt)
    const anyWork = s.people.some((p) => p.working)
    const simDt = dt * (anyWork ? 8 : 1)
    const dh = simDt / HOUR_SEC
    const b0 = Math.floor(s.hour)
    s.hour += dh
    let b = b0 + 1
    while (b <= Math.floor(s.hour)) {
        if (b >= 24) { s.hour -= 24; newDay(s) }
        applyHourAt(s, b % 24)
        b++
    }

    arbitrateVisitors(s)   // #2154: settle the chat claims before either visitor pays
    updateVisitor(s, simDt)
    updateIvy(s, simDt)
    updatePaper(s)          // #2238: the route rides the same world clock
    updatePet(s, simDt)
    updateKid(s, simDt)
    updateHouseBond(s, simDt)

    for (const p of s.people) {
        p.mood = avg(p)
        if (p.alarmT > 0) p.alarmT = Math.max(0, p.alarmT - simDt)
        if (p.working) {
            if (s.hour >= WORK_END - 1e-9) endWork(s, p)
            continue
        }
        if (p.faintT > 0) {
            p.faintT = Math.max(0, p.faintT - simDt)
            if (p.faintT === 0) {
                for (const n of NEEDS) p.needs[n] = Math.max(p.needs[n], 0.32)
                p.redT = {}
                s.events.push({ t: 'wake', name: p.name })
                think(s, `${p.name} comes to on the floor. Embarrassing, but survivable.`)
            }
            continue
        }
        // emergencies: only PHYSICAL needs unattended collapse into a faint
        // (sad and bored is life, not death — like the original)
        const asleep = !!(p.use && p.use.def.id === 'bed')
        // any need crossing into red raises a one-shot alarm pulse on the mood gem
        // (advisory only — collapse is still governed by PHYS redT below)
        if (asleep) { for (const n of NEEDS) p.wasRed[n] = false }
        else {
            for (const n of NEEDS) {
                if (p.needs[n] <= RED_AT && !p.wasRed[n]) {
                    p.wasRed[n] = true
                    p.alarmT = 1.3
                    s.events.push({ t: 'redcross', need: n, name: p.name })
                } else if (p.needs[n] > RED_AT + 0.03) p.wasRed[n] = false
            }
        }
        for (const n of PHYS) {
            if (asleep) { p.redT[n] = 0; continue }
            if (p.needs[n] <= 0.02) {
                p.redT[n] = (p.redT[n] || 0) + simDt
                if (p.redT[n] > COLLAPSE_AT) {
                    p.faintT = FAINT_SEC
                    p.path = null; p.goal = null; p.use = null
                    s.events.push({ t: 'faint', name: p.name, x: p.x, y: p.y })
                    think(s, `${p.name} collapses! Someone, help!`)
                }
            } else p.redT[n] = 0
        }
        if (p.faintT > 0) continue

        // #2203: a chat plan bows to a physical emergency — the x8 work clock
        // makes a long hang at Fern's sofa fatally expensive, and a lonely
        // resident can visit after eating. Walks (whatever their goal) and
        // in-hand uses are never interrupted; walkAlong already asks walkable.
        if (s.demo && !p.use && p.goal && p.goal.kind === 'chat' && (p.needs.hunger <= 0.15 || p.needs.energy <= 0.15 || p.needs.bladder <= 0.15)) {
            p.path = null; p.goal = null
        }

        // executing an interaction
        if (p.use) {
            p.use.t += simDt
            if (p.use.def.id === 'bed') p.needs.energy = Math.min(1, p.needs.energy + 0.03 * simDt)
            const done = p.use.def.id === 'bed' ? (p.use.night ? (s.hour >= 6 && s.hour < 22) : p.use.t >= p.use.dur) : p.use.t >= p.use.dur
            if (done) finishUse(s, p)
            continue
        }
        // walking toward a goal
        if (p.path && p.path.length) { walkAlong(s, p, simDt, 55 * moodMul(p)); continue }
        p.path = null
        if (p.goal && p.goal.kind === 'use') {
            const it = p.goal.it
            p.goal = null
            const d = DEF[it.id]
            if (it.id === 'mail') { startWork(s, p); continue }
            if (d && d.need) p.use = { it, def: d, t: 0, dur: d.dur, night: isNight(s) }
            continue
        }
        if (p.goal && p.goal.kind === 'chat') {
            const k = p.goal.v || 'fern'     // #2143: which neighbour the walk was for
            p.goal = null
            const v = visitorForKey(s, k)
            if (v) {
                p.needs.social = Math.min(1, p.needs.social + 0.3)
                s.content = Math.min(WIN_CONTENT, s.content + 1)
                s.events.push({ t: 'content', n: 1, id: 'chat' })
                think(s, chatLine(s, p, k))
            }
            continue
        }
        // #1814: arrived at the new wing — one glance, one line, a small lift
        if (p.goal && p.goal.kind === 'room') {
            p.goal = null
            p.roomSeen = true
            s.roomReact = Math.max(0, s.roomReact - 1)
            p.needs.fun = Math.min(1, p.needs.fun + 0.15)
            s.events.push({ t: 'room-see', name: p.name })
            think(s, pick(s, ROOM_SEE_LINES).replace(/\{p\}/g, p.name))
            continue
        }
        // #1814: the hammer fell and this resident hasn't looked yet — send
        // them through the doorway; re-offered if the player interrupts the walk
        if (s.ext && s.roomReact > 0 && !p.roomSeen) {
            const pref = ROOM_REACT[s.people.indexOf(p) % ROOM_REACT.length]
            const tg = (walkable(s, pref[0], pref[1]) ? [pref] : EXT_ROOM.floor)
                .map(([r, c]) => ({ r, c }))
            const path = bfsPath(s, { r: p.r, c: p.c }, tg)
            if (path) { p.path = path; p.goal = { kind: 'room' } }
        }
        autonomous(s, p)
        // idle flavour
        s.thoughtT += simDt
        if (s.thoughtT > 9) { s.thoughtT = 0; think(s, idleThought(s, p)) }
    }

    if (s.thoughts.length) for (const t of s.thoughts) t.t -= dt
    s.thoughts = s.thoughts.filter((t) => t.t > 0)

    if (s.people.every((p) => p.faintT > 0)) {
        s.done = 'lose'
        s.endMsg = 'Both residents collapsed — the household falls into chaos.'
    }
    if (s.content >= WIN_CONTENT) {
        s.done = 'win'
        s.endMsg = 'The lifetime wish comes true: a happy, humming little home.'
    }
}

// ---------------------------------------------------------- manual move ----
// direct d-pad/stick control of one resident (pointer routes use cmdWalk).
// Continuous pixels with tile permission — everything that moves asks first.
export function manualMove(s, p, dx, dy, dt) {
    if (p.faintT > 0 || p.working || p.use) return false
    if (!dx && !dy) return false
    p.path = null; p.goal = null
    const spd = 52 * moodMul(p) * dt
    const ox = p.x, oy = p.y
    if (dx) p.face = dx > 0 ? 1 : -1
    const nx = p.x + (dx ? Math.sign(dx) * spd : 0)
    const ny = p.y + (dy ? Math.sign(dy) * spd : 0)
    const tileAt = (px, py) => ({ r: Math.floor((py - LOT_Y) / TILE), c: Math.floor((px - LOT_X) / TILE) })
    if (dx) {
        const t = tileAt(nx + Math.sign(dx) * 6, p.y)
        if (walkable(s, t.r, t.c)) p.x = nx
    }
    if (dy) {
        const t = tileAt(p.x, ny + Math.sign(dy) * 6)
        if (walkable(s, t.r, t.c)) p.y = ny
    }
    const c = tileAt(p.x, p.y)
    p.r = c.r; p.c = c.c
    p.walkPhase += dt * 11
    footstep(s, p, Math.abs(p.x - ox) + Math.abs(p.y - oy))
    return true
}

// ------------------------------------------------------------- bot --------
// attract autopilot + harness brain: buys like a player; the residents' own
// autonomy (needs, work, chatting) does the rest.
const KEEP_CELLS = new Set(['8,5', '5,2', '5,8', '12,5'])   // doors and the gate

export function bot(s) {
    if (s.done) return
    const p = s.people[0]
    if (p.working || p.faintT > 0 || p.path || p.use) return
    // #2238: the attract bot reads the paper left on the step — the demo
    // teaches the route without a word. If the walk can't be had, carry on.
    if (s.paper) { if (cmdUse(s, p, s.paper)) return }
    if (s.money > 300 && s.content < WIN_CONTENT) {
        const wants = ['phone', 'roomkit', 'petkit', 'kidkit', 'stove', 'tv', 'sofa', 'radio', 'book', 'shower', 'plant', 'lamp', 'rug']
        for (const id of wants) {
            const def = DEF[id]
            // #1814: the attract build grows the lot so the demo sells the
            // reflow — the room owns itself via `ext`, and only buys when the
            // footprint is honestly clear (never wedge the bot on a refusal)
            if (id === 'roomkit') {
                if (s.ext || s.money < EXT_ROOM.price || !roomClear(s)) continue
                const keep = s.sel
                setSel(s, CATALOG.findIndex((d) => d.id === 'roomkit'))   // #2222: the shelf follows the pick
                place(s, 0, 0)   // the room ignores the cursor; the lot owns the spot
                setSel(s, keep)
                return
            }
            // #2197: the cat owns herself — no cursor, no cell, just the counter
            if (id === 'petkit') {
                if (s.pet || s.money < PET.price) continue
                const keep = s.sel
                setSel(s, CATALOG.findIndex((d) => d.id === 'petkit'))   // #2222
                place(s, 0, 0)
                setSel(s, keep)
                return
            }
            // #2203: so does the child — same counter law, right behind the cat
            if (id === 'kidkit') {
                if (s.kid || s.money < KID.price) continue
                const keep = s.sel
                setSel(s, CATALOG.findIndex((d) => d.id === 'kidkit'))   // #2222
                place(s, 0, 0)
                setSel(s, keep)
                return
            }
            if (s.items.some((it) => it.id === id) || s.money < def.price) continue
            for (let r = 1; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (KEEP_CELLS.has(`${r},${c}`)) continue
                    const g = groundOf(s, r, c)
                    if (g === 'wall' || g === 'path') continue
                    if (def.solid && g !== 'floor') continue
                    if (!canPlace(s, def, r, c)) continue
                    const keep = s.sel
                    setSel(s, CATALOG.findIndex((d) => d.id === id))   // #2222: the shelf follows the pick
                    place(s, r, c)
                    setSel(s, keep)
                    return
                }
            }
        }
    }
}

export function autoStep(s, dt) {
    s.demo = true
    bot(s)
    advance(s, dt)
}

// ------------------------------------------------------------- hash -------
export function stateHash(s) {
    let h = 2166136261
    const mix = (v) => { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 16777619) }
    mix(s.tick); mix(s.day); mix(s.hour); mix(s.money); mix(s.content); mix(s.rank)
    mix(s.ext)
    mix(s.tab)                       // #2222: the open catalog shelf is state too
    mix(s.speed)                     // #2227: so is the speed dial — replays pin it
    mix(s.rel.house); mix(s.rel.fern)   // #1817: bonds ride the hash
    mix(s.rel.ivy)                     // #2143: so does the second neighbour's
    mix(s.rel.kid)                     // #2203: and the child's
    mix(s.spats); mix(s.grudge)        // #2070: quarrels and grudges ride it too
    mix(s.cmdCd)                       // #2131: the command cooldown rides it too
    mix(s.holdT)                       // #2171: so does the pending thumb-court hold (-1 = none)
    mix(s.triTell); mix(s.triHits)   // #2154: the choreography tell and its beat count ride it too
    mix(s.paperDay)                    // #2238: today's route stamps the day it landed
    for (const p of s.people) {
        mix(p.r); mix(p.c)
        for (const n of NEEDS) mix(p.needs[n])
        mix(p.faintT); mix(p.working ? 1 : 0); mix(p.queue.length)
    }
    mix(s.items.length)
    for (const it of s.items) { mix(it.r); mix(it.c) }
    mix(s.visitor ? 1 : 0)
    mix(s.ivy ? 1 : 0)                                // #2143
    mix(s.ivy && s.ivy.gift ? 1 : 0)                // the basket is state too
    mix(s.pet ? 1 : 0)                              // #2197: so is the cat
    if (s.pet) {
        mix(s.pet.r); mix(s.pet.c)
        mix(s.pet.needs.hunger); mix(s.pet.needs.fun); mix(s.pet.needs.energy)
        mix(s.pet.asleep ? 1 : 0); mix(s.pet.cd)
    }
    mix(s.kid ? 1 : 0)                              // #2203: so is the child
    if (s.kid) {
        mix(s.kid.r); mix(s.kid.c)
        mix(s.kid.needs.hunger); mix(s.kid.needs.fun); mix(s.kid.needs.energy); mix(s.kid.needs.social)
        mix(s.kid.asleep ? 1 : 0); mix(s.kid.cd)
    }
    return h >>> 0
}
