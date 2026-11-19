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

// #2588: neighbours who meet — the web, not the spoke. Fern and Ivy share the
// lot most afternoons, but every bond here is anchored to the household. The
// Sims' social web is PAIRS: two guests form their own opinion of each other
// while they share the visit. No rng here either — the whole law is rotation
// and proximity, so every seed stays deterministic.
export const NEIGH_CHAT = 0.05        // rel/s while BOTH hang unclaimed within the pair ring
export const NEIGH_GLANCE = 0.02      // rel/s while only one is claimed but they're close
export const NEIGH_FADE = 0.02        // rel lost per sim-hour of ordinary absence (softest)
export const NEIGH_REACH = 2          // the pair ring mirrors the household co-presence law
export const NEIGH_GLANCE_REACH = 4   // gossip carries across the room, walk-talk does not
export const NEIGH_MEET_CD = 3        // s between meet-up walk retries (the repathT pattern)
export const NEIGH_COOL_CD = 11       // s between exchanged lines (the #2135 cooling-beat pattern)
export const NEIGH_WARM = 1.25        // friendship warms: each neighbour chats 25% deeper
export const NEIGH_WARM_AT = 1        // with the household once the pair is on speaking terms
// #2604: neighbours SPAT — the web's dark half. The #2070 cold war is household
// only, so Fern and Ivy could be ignored patiently forever. New law: while both
// hang and exactly one has an ear, the watched-but-unheard minutes sour. Ignore
// long enough and the pair SPAT — the bond falls and the pair's own grudge sets:
// proximity builds nothing until absence thaws it and reunion pays. No rng in the
// triggers, like every spat. Individual chats with residents are untouched —
// the grudge is the pair's own.
export const NEIGH_IGNORE_T = 30      // s of one-ear waiting that sours the pair
export const NEIGH_SPAT_DROP = 4      // rel.neigh lost per pair spat (SPAT_DROP scaled soft)
export const NEIGH_MAKEUP = 2         // the reunion pays after absence thaws (softest thaw)
export const NEIGH_SPAT_CD = 40      // s before another pair spat can fire (SPAT_CD mirror)
export const NEIGH_MURMUR_CD = 24    // #2599 handoff 2: s between the pair's sour murmurs while the cold war holds (household GRUDGE_COOL_CD scaled long — the fence carries less than a kitchen)
export const NEIGH_STROLL_T = 12     // #2611: s of free pair-chat banked before the pair walks the lot
// #2672 MEDIATORS: a cold war between two grown-ups is only the grown-ups'
// problem while the room is empty. An awake Miso or Pip standing within reach
// of BOTH of them cracks the tension on the spot: a soft pay lands at once
// and the pair enters #2604's mending lane, so the reunion pays its way too.
// Once per spat (the neiMediated ledger), deterministic, and it never waives
// the offence — mediation softens the recovery, not the fall.
export const NEIGH_MEDIATE_REACH = 3      // tiles from the mediator to EACH of the pair
export const NEIGH_MEDIATE_PAY = 1        // half the reunion's grace — thawed faster, not forgiven
// #2611: the pair's circuit — fixed hang spots the lot actually offers (front
// path beside the gravel run, east lawn beyond the fence line, back lawn above
// the house). Rotation is a counter, never rng: every seed walks the same lap.
export const NEIGH_SPOTS = [
    { r: 10, c: 6 },    // front path, just off the gravel run
    { r: 5, c: 13 },    // east lawn, past the fence's end
    { r: 0, c: 8 },     // back lawn, above the roof line
]

// #2240: THE GIFT LANDS. FRIENDS+ used to pay hunger with a toast and nothing
// physical; now the basket Ivy carried in gets SET DOWN when she reaches the
// kitchen — visible on the ground beside the fridge (else stove, else the front
// step, else her own cell) for a few seconds, and at FAMILY the honey jar rides
// along. View-only staging like spatFx/cooFx — the pay at arrival (#2143) is
// untouched; this is the beat the eye was owed.
export const GIFT_LAND_T = 5         // real seconds the set-down basket stays

// #2240: VISITOR TIMBRES. Fern and Ivy once shared the doorbell register
// (660/880 vs 587/988 was a start). Each now owns a call motif AND an
// entrance flourish: Fern the classic two-note rising dinger with two light,
// quick, even footfall pats; Ivy a three-note lilt that lands DOWN (a
// gardener's bell) with a slower, heavier, lower pair — steps carrying a
// basket. The shell plays these tables verbatim; peoplecheck pins that the
// motifs differ in note count, pitch set and spacing. [freq, dur, delayMs]
export const VISIT_TIMBRE = {
    Fern: { call: [[660, 0.14, 0], [880, 0.18, 150]], steps: [[300, 0.05, 430], [262, 0.05, 500]] },
    Ivy: { call: [[587, 0.12, 0], [988, 0.10, 140], [740, 0.16, 260]], steps: [[208, 0.07, 460], [165, 0.09, 585]] },
}

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
// #2200 polish: kibble must be SEEN, and the neighbours must notice the cat
// they keep walking past. One tan bowl at the eat spot, and a greeting law:
// a hanging visitor within CAT_MEET_DIST of Miso greets her once per visit —
// a tiny bond bump, and the meet line warms with the ladder.
export const PET_FEED_T = 2.2        // world seconds the bowl + crumbs linger

// ------------------------------------------------------- yarn ball (#2256) ----
// The original lets you ORDER play with the pet (The Sims, PC 2000: a cat toy
// the Sim dangles). The yarn ball is the lot's first cat-only piece: a decor
// toy whose play rewards pay the CAT first. A resident may order the play (tap
// the ball) while Miso is home and rested — the walk ends with both paid and
// the bond climbing; without a cat the order refuses honestly at the ball.
// Generic fun-seeking (autonomy, the bored-kid hunt, pad-A) skips cat-only
// pieces: nobody parks on a cat toy. A bored awake cat hunts the ball herself.
export const YARN_CD = 8             // world seconds between ordered play sessions
export const YARN_CAT_FUN = 0.45    // fun Miso pockets from a dangled ball
export const YARN_SOCIAL = 0.1      // social the resident pockets mid-play
export const YARN_BOND = 1          // house bond per played session
export const YARN_REACH = 3         // tiles the cat must be within at the finish
export const YARN_PLAY_T = 2.2      // world seconds the ball spins + paws bat (view-only)
export const PET_SELF_FUN = 0.5     // fun the cat bats out of the ball unasked
export const PET_BORED = 0.3        // cat fun under this, she hunts the yarn herself
export const YARN_LINES = [
    '{n} dangles the yarn ball in slow arcs — Miso\'s paws answer every arc.',
    'String magic: {n} winds the tail of yarn and Miso does the rest.',
    'The ball rolls, the tabby pounces, the household laughs out loud.',
]
export const YARN_NOCAT_LINES = [
    'The yarn ball sits unspooled — a toy is only half a game without a cat.',
    'Nobody to play with; the yarn waits for a cat at the gate.',
]
export const YARN_LOST_LINES = [
    'Miso drifts off mid-wiggle — the offer stands, but the paws are elsewhere.',
    'The ball spins once, twice — no cat nearby to catch it.',
]
export const PET_PLAY_LINES = [
    'Miso finds the yarn ball and bats it under the sofa, then out, then under again.',
    'A private game of string — nobody ordered it, everybody enjoyed it.',
]
export const CAT_MEET_DIST = 2      // Manhattan reach of the greeting
export const CAT_MEET_BOND = 0.5    // a small nod, not a ladder jump
const CAT_MEET_LINES = [
    '{n} crouches at the door; Miso sizes her up from the hall, tail high.',
    '{n} and Miso trade a proper greeting — a sniff, a slow blink.',
    'Miso weaves straight into {n}\u2019s ankles — the household votes her in.',
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
// #2253: the first-time player pass. A need at/below AMBER reads the worried
// colour on the gem — the one-shot `amber` event names the fix BEFORE the red
// alarm, while there is still time to act. And the whole first day decays at
// DAY1_GRACE: day 1 is the tutorial, not a starvation race (a cold start lost
// both residents in ~2 min with nothing on screen saying what to do).
export const AMBER_AT = 0.45
export const DAY1_GRACE = 0.5
export const NEED_HINT = {
    hunger: 'tap the FRIDGE',
    energy: 'tap a BED',
    fun: 'tap the TV',
    social: 'tap the PHONE',
    bladder: 'tap the TOILET',
}

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
    { id: 'bed', name: 'Cozy Bed', price: 210, h: 1, solid: true, need: 'energy', amt: 0.3, dur: 9, sleep: true, cozy: 0.03 },
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
    { id: 'yarn', name: 'Yarn Ball', price: 60, h: 1, solid: false, decor: true, need: 'fun', amt: 0.25, dur: 3, catOnly: true },   // #2256: card 17, the cat's own toy
    { id: 'canopy', name: 'Canopy Bed', price: 260, h: 1, solid: true, need: 'energy', amt: 0.3, dur: 9, sleep: true, cozy: 0.055, wingOnly: true },   // #2272: card 18, the wing's bedroom bed — sleeps deeper, fits nowhere else
    { id: 'alarm', name: 'Burglar Alarm', price: 90, h: 1, solid: false, decor: true },   // #2520: card 19 — the night gets an answer; a box by the phone that keeps the whole street honest
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

// ------------------------------------------------------------- meals (#2244) --
// The day/night clause keeps its hours. The original's day turns on meals
// (The Sims, Maxis, PC 2000): breakfast, lunch, dinner. Three bells a day
// set a plate by the kitchen whether anyone is awake or not — hour-scheduled
// life nobody commands, the clause's second true citizen after the paper
// route. Like the news, nobody buys dinner: MEAL joins DEF but never
// CATALOG — walkable (solid:false) and usable (hunger), so tryUse, the tap
// route and BFS treat it exactly like an appliance the lot owns, and the
// sale refuses. And unlike the news, a meal is a TABLE law: when both
// residents eat the same plate they sat down together — social, bond, hearts.
export const MEAL = { id: 'meal', name: 'Home Meal', price: 0, h: 1, solid: false, decor: true, need: 'hunger', amt: 0.55, dur: 3.6 }
DEF.meal = MEAL
export const MEAL_NAMES = ['BREAKFAST', 'LUNCH', 'DINNER']
// #2264: MEAL TIMBRES. The original keyed the three bells apart — one dinger
// three times a day reads as a loop, not a clock. Breakfast stays the historic
// bright rising strike (07:00 energy); lunch is a quick bright ascending
// triplet (midday, lighter); dinner is an evening swell and fall — four notes,
// the lowest start, the longest toll. The shell plays these tables verbatim —
// #2240's VISIT_TIMBRE pattern. [freq, dur, delayMs]
export const MEAL_TIMBRE = [
    { call: [[1046, 0.16, 0], [1318, 0.22, 170]] },
    { call: [[880, 0.10, 0], [1174, 0.10, 110], [1568, 0.26, 220]] },
    { call: [[784, 0.18, 0], [988, 0.14, 210], [659, 0.24, 430], [523, 0.34, 640]] },
]
// due windows [earliest, latest] per bell — seeded inside them on s.rng, so
// every day keeps hours but no two days land on the same minute.
export const MEAL_DUE = [[7, 7.75], [12.5, 13.25], [18.5, 19.25]]
export const MEAL_WINDOW = 2.5   // sim-hours the food stays warm; after that it goes cold
export const MEAL_SOCIAL = 0.15  // social each resident pockets at the shared table
export const MEAL_BOND = 2       // house bond per shared table
export const MEAL_LINES = [
    'The breakfast bell rings — a plate waits by the kitchen, still steaming.',
    'The lunch bell rings — something warm appeared on the counter while nobody looked.',
    'The supper bell rings — a home plate lands where the kitchen is busiest.',
]
export const SHARED_MEAL_LINES = [
    '{m} shared at the same plate, elbow to elbow — the table beats the menu.',
    'Two forks, one {m}: the little kitchen hums.',
    'A {m} eaten together is worth two eaten alone — the household agrees.',
]
export const MEAL_COLD_LINES = [
    'The plate went cold — nobody came to the table.',
    'The clock beat the appetite; the meal goes to the cold shelf.',
]
// #2264: the shared-table arpeggio rotates by plate (mealSerial % 3). Three
// repeat days once rang the identical C-major triad, which felt looped; three
// tables, three shapes — straight up, up-then-over, and a warmer sixth. The
// shell plays the table verbatim; the pattern stays pure and deterministic.
export const SHARED_TABLE_CHORDS = [
    [[523, 0.07], [659, 0.07], [784, 0.14]],
    [[659, 0.07], [784, 0.07], [523, 0.14]],
    [[523, 0.07], [659, 0.07], [880, 0.14]],
]
export const sharedChord = (serial) => SHARED_TABLE_CHORDS[Math.max(0, serial | 0) % SHARED_TABLE_CHORDS.length]

// #2264: the night level from the hour — the exact curve nightTint paints
// with, hoisted to one source (art.js re-uses it) so the steam law, the
// plate glow and the tint can never drift apart. 0 at day, 0.42 at deep dark.
export const nightLevel = (hour) => hour >= 19 ? Math.min(0.42, (hour - 19) / 3 * 0.42)
    : hour < 7 ? (hour < 5 ? 0.42 : (7 - hour) / 2 * 0.42) : 0

// ------------------------------------------------------ garbage day (#2303) --
// The day/night clause's third hour-scheduled citizen after the paper route
// and the meal bells (The Sims, PC 2000: the truck keeps the street). Nobody
// buys a bin: BIN joins DEF but never CATALOG — walkable (solid:false) and
// usable (binOnly), so the tap route and BFS treat it as an appliance the lot
// owns, generic self-service skips it (a chore, not a need), and the sale
// refuses. The law has three beats: the eve ARMS it (bin waiting to be set
// out, truck hour seeded for dawn), a resident WHEELS it to the curb (an
// order, and in demo an autonomous route — roster-free residents keep the
// day), and at dawn the truck either COLLECTS (clean lot, small honest pay —
// the win economy is untouched: fun, social and one contentment, never more)
// or, if the bin never made the curb, SKIPS the lot honestly and visibly:
// the waste sits out all day, and the missed collection rides the roster for
// a whole cycle. Cadence: every third day, never banked, newDay re-seeds.
export const BIN = { id: 'bin', name: 'Garbage Bin', price: 0, h: 1, solid: false, decor: true, need: 'fun', amt: 0, dur: 2.4, binOnly: true }
DEF.bin = BIN
export const BIN_HOME = { r: 11, c: 5 }      // by the gate post, where the bin lives
export const BIN_CURB = { r: 12, c: 5 }      // the curb cell at the gate — the truck's stop
export const GARBAGE_EVERY = 3               // the truck keeps the street every third day
export const TRUCK_DUE = [5, 7]             // dawn window: the truck hour is seeded inside it
export const SET_OUT_EARLY = 18             // the set-out window opens after supper…
export const SET_OUT_LATE = 20.5           // …and closes at a civil hour (night is no time for chores)
export const BIN_SET_SOCIAL = 0.08         // the wheeler's small satisfaction of a chore done
export const BIN_FUN = 0.1                 // a clean lot lifts everyone a little
export const BIN_BOND = 1                  // house bond per collection — a kept rhythm
export const BIN_PICK_LINES = [
    'The truck rumbles past at dawn — the bin is empty again, the lot is clean.',
    'Collection morning: the lid lifts, the bin tips, the street keeps its rhythm.',
    'The garbage truck takes the bin\'s whole load and rolls on down the street.',
]
export const BIN_SKIP_LINES = [
    'The truck passed our gate and did not stop — the bin never made the curb.',
    'No collect today: the bin sits by the road all day, full and unargued with.',
    'The truck driver saw the empty curb and drove on. Somebody forgot the chore.',
]
export const BIN_SET_LINES = [
    '{p} wheels the bin down to the curb — tomorrow the truck takes it.',
    'Bin at the curb, lid shut tight. The morning shift can find it now.',
    'The bin rolls out to the street corner, and the lot keeps its hours.',
]
export const BIN_EVE_LINES = [
    'Evening news on the lot: garbage tomorrow. The bin waits to go out.',
    'The street-cries say collection at dawn — somebody owes the bin a trip to the curb.',
]
export const BIN_NIGHT_LINES = [
    'The bin goes out the evening BEFORE the truck, not at midnight.',
    'The truck comes at dawn — the curb waits for morning, not for night.',
]
export const BIN_OUT_LINES = [
    'The bin is already at the curb, waiting for the truck.',
    'Two trips to the curb is one too many — the bin stands at the road.',
]

// The one honest voice for "can the bin order stand": eve only, bin at home,
// not yet set today. Placement/sale never consult it; only a human ordering
// the chore does (the yarnOrderOk pattern, #2256).
export function binOrderOk(s) {
    return s.binAt === 'home' && s.binAuto && s.binSetDay !== s.day
        && !isNight(s) && s.hour >= SET_OUT_EARLY && s.hour <= SET_OUT_LATE
}

// #2303: the truck is a day away — the eve owns the arm. The dawn hour seeds
// when the evening window opens, once per cycle, so the schedule stays
// deterministic.
function binEve(s) { return s.day + 1 === s.collectionDay }

// ------------------------------------------------------ ice-cream truck (#2503) --
// The clause's fourth hour-scheduled citizen after the paper, the bells and the
// garbage truck (The Sims, PC 1990/2000: the ice-cream man rolls down the
// street on warm afternoons and the young ones run out with money in hand).
// Nobody stocks a soft-serve stand: CONE joins DEF but never CATALOG —
// walkable (solid:false) and usable (fun), so the tap route and BFS treat it
// as an appliance the lot hosts for an hour, while generic self-service skips
// it (truckOnly — a paid treat is not a free need-stop) and the sale refuses
// it. The law has three beats: the TRUCK ARRIVES (a cone lands at the curb,
// jingle, day stamp), someone BUYS it (an order pays CONE_PRICE from the till
// — broke refuses honestly in words — and the cone is one serving: whoever
// reaches it first eats it), and the TRUCK MOVES ON (window closed, the cone
// goes with the truck — never banked, never sold late). One truck a day: the
// day stamp is the law, and the pass hour is arithmetic off the day, never
// s.rng (#2303/#2240: an extra draw per cycle re-phases the seeded autopilot
// and the WINNABLE seeds win by a hair). Children chase it: while a cone
// stands, Pip routes to the curb before the toy box (the kid's own law, the
// cook-beats-snacking precedent at ice-cream scale) — the demo visibly chases
// the truck.
export const CONE = { id: 'cone', name: 'Ice Cream Cone', price: 0, h: 1, solid: false, decor: true, need: 'fun', amt: 0, dur: 2.0, truckOnly: true }
DEF.cone = CONE
export const ICE_DUE = [14, 16]             // warm-afternoon window: the pass hour sits inside it
export const ICE_WINDOW = 2                // sim-hours the truck idles on the street — sized so the walk from the far rooms still lands inside it (the #2244 lesson)
export const CONE_PRICE = 2                // §2 from the till — a small luxury, honest cost
export const ICE_FUN = 0.4                // an adult's cone
export const ICE_KID_FUN = 0.5            // a child's cone (sugar, at kid scale)
export const KID_ICE_FLOOR = 0.85         // a child chases the truck unless joy already overflows
// The jingle — five rising notes on a music box, the truck's own voice. The
// shell plays this table verbatim (#2240 VISIT_TIMBRE, #2264 MEAL_TIMBRE
// pattern). [freq, dur, delayMs]
export const ICE_TIMBRE = [[659, 0.12, 0], [784, 0.12, 140], [1046, 0.14, 280], [784, 0.12, 430], [1046, 0.24, 570]]
// #2508 item 2: the call VARIES — two ending bars follow the motif, chosen by
// pass parity off iceSerial (odd → A, even → B — the serial stamps before the
// event drains), so no two passes jingle the same
// twice. Offsets continue past the motif's last note (570+240 = 810 ms). The
// shell swells each note with the truck's approach (the swell lives there) —
// presentation only; the sim's scheduling and economy are untouched.
export const ICE_ENDINGS = [
    [[1318, 0.10, 840], [1046, 0.10, 950], [1318, 0.22, 1060]],   // A — the high flourish
    [[880, 0.10, 840], [1175, 0.10, 950], [1318, 0.22, 1060]],    // B — the rising close
]
export const ICE_ARRIVE_LINES = [
    'The ice-cream man rounds the corner — the jingle rolls down the empty street.',
    'A pastel truck crests the hill: cones at the curb while the engine idles.',
    'The jingle comes before the truck does — soft-serve o\'clock on our street.',
]
export const ICE_BROKE_LINES = [
    'Empty pockets — the till says no to the cone.',
    'The cone waits, the purse does not: a treat costs §2 the ice-cream man never learned to take IOUs.',
]
export const ICE_OUT_LINES = [
    'The last cone is already melting in someone\'s hand — the truck has one of each.',
    'One cone per stop, and the stop is spent. The truck moves on empty.',
]
export const ICE_GONE_LINES = [
    'The jingle fades down the street — the truck moved on without us.',
    'The ice-cream man waves and rolls away; the curb is just a curb again.',
]
export const ICE_KID_LINES = [
    '{k} runs back with a cone twice as tall as their worries.',
    'Sugar victory: {k} beats the melting clock all the way home.',
    '{k} licks the drip before it lands — a professional at work.',
]
export const ICE_SAVOR_LINES = [
    '{n} pays the man and catches the cone — licking first, walking later.',
    'A cold cone at the hot hour: {n} considers the afternoon officially saved.',
    '{n} trades §2 for the smallest, sweetest luxury on the street.',
]

// The pass hour: arithmetic off the day, the truckHour mix (#2303's own
// recipe) — deterministic, and no rng stream touched.
export const icePassHour = (day) => ICE_DUE[0] + ((Math.imul(day, 2654435761) >>> 9) % 200) / 100

// #2508 item 3: the eat beat — the original keeps the cone IN HAND while the
// buyer strolls home licking it; ours used to delete the glyph at the tap.
// View-only staging like feedT/giftFx/#2240: the timer rides the WORLD clock
// (freezes at gear ||, compresses on the dial), never stateHash, and pays no
// sim rule — the fun landed at the sale; the hold is only the sight of it.
// The drip ticks are arithmetic off the countdown (#2303's no-rng lesson):
// ICE_DRIPS drops at evenly spaced thirds of the hold.
export const ICE_HOLD_T = 12             // world seconds the treat stays in hand
export const ICE_DRIPS = 2              // melt ticks per cone (at ⅓ and ⅔ elapsed)
export const coneDripCount = (left) => Math.min(ICE_DRIPS, Math.floor((ICE_HOLD_T - left) / (ICE_HOLD_T / (ICE_DRIPS + 1))))

// One tick of a held cone (resident or kid): count the countdown down and let
// each drip tick speak once — a soft ice-drip event the shell voices as a blip.
function holdConeTick(s, e, dt) {
    if (e.coneHold <= 0) return
    e.coneHold = Math.max(0, e.coneHold - dt)
    const n = coneDripCount(e.coneHold)
    while (e.coneDrips < n) {
        e.coneDrips++
        s.events.push({ t: 'ice-drip', name: e.name, x: Math.round(e.x), y: Math.round(e.y) })
    }
}

// The one honest voice for "can the cone order stand": a cone is standing
// (the truck is here) and the till can pay. Placement/sale never consult it;
// only a human ordering the treat does (the binOrderOk pattern, #2303).
export function coneOrderOk(s) { return !!s.cone && s.money >= CONE_PRICE }

// -------------------------------------------------- sneak in the night (#2520) --
// The day/night tail gets its NIGHT citizen (The Sims, PC 2000: burglars prowl
// the small hours, and the burglar alarm is the buyable answer — the till
// finally has something worth guarding). Same doctrines as the paper, the
// truck and the bells: the due hour is arithmetic off the day, never an rng
// draw (#2303/#2503 — an extra draw per cycle re-phases the seeded autopilot);
// the day stamp is the law — one sneak a night, never banked; the window sits
// wholly before midnight so the night owns one day number; and he never shows
// his face in daylight (`hour >= SNEAK_DUE` alone proves it — 23:00 is night
// by the lot's own clock). He is visitor-shaped: BFS from the gate cell,
// walkAlong at a loiterer's pace, non-solid (a prowler must never fence anyone
// in — #2508's truck law applies to him too). He crosses to the door-step,
// lifts SNEAK_TAKE from the till (empty pockets is an honest line, the till
// floors at zero), and walks back out. A PLACED alarm is the answer: he never
// sets foot past the gate post — siren, scare stamp, and the hedge keeps him.
export const SNEAK_DUE = 23               // the window opens 23:00 — the lot is asleep, the street is quiet
export const SNEAK_WINDOW = 1           // one watched hour, closed at midnight by construction
// He takes POSSESSIONS, not savings — the original's burglar lifts an object,
// and HOMEBODY's economy stays whole (the starter lot's wish-planning margin is
// razor-thin; taxing it would tax the demo's wing beat too). Loose ornaments
// only: nothing with a need attached, nothing the lot runs on.
export const SNEAK_LOOT = ['plant', 'rug', 'lamp']
export const sneakNightDue = (day) => day % 2 === 1   // odd nights, Otto's own alternation — quiet, arithmetic, checkable
export const SNEAK_CREEP = [[196, 0.28, 0], [185, 0.28, 300], [175, 0.4, 600]]        // three falling low steps — boots on gravel
export const SNEAK_SIREN = [[880, 0.14, 0], [660, 0.14, 170], [880, 0.14, 340], [660, 0.14, 510]]   // the tin two-tone, urgent
export const SNEAK_TAKE_SFX = [[220, 0.1, 0], [147, 0.22, 120]]                       // the thunk of an armful leaving
export const SNEAK_IN_LINES = [
    'A shadow slips past the gate post — someone is on the lot, and the house sleeps on.',
    'The street-light catches a dark coat at the path: a prowler, choosing the odd hours.',
    'Boots on the gravel, soft as regret — the lot has company at the unkindest hour.',
]
export const SNEAK_TAKE_LINES = [
    'The shelf comes up light — the sneak walked straight to the ornament and pocketed it.',
    'One knick-knack quieter: the sneak only ever takes what the day left loose.',
    'The crate, the step, the gate — the sneak does the whole round in minutes.',
]
export const SNEAK_EMPTY_LINES = [
    'Nothing loose, nothing lifted — the sneak leaves nothing behind but a dent in the pride.',
    'A tidy lot outfoxed the prowler: he came for ornaments and found a model home.',
]
export const SNEAK_SCARE_LINES = [
    'The alarm wakes the street — the never-set foot turns back at the gate post.',
    'A tin siren and the hedge keeps him: the alarm did its one job, perfectly.',
    'The sneak heard the alarm three houses away and took the long way round the world.',
]
export const SNEAK_GONE_LINES = [
    'The dark coat melts past the gate — the lot sleeps on, plundered but unbroken.',
    'He leaves the way he came, whistling tunelessly; the night keeps its secret.',
]

// One honest voice for "does the lot keep a dog with a siren": placed alarm,
// anywhere on the lot. The law and the view and the harness all read this.
export function hasAlarm(s) { return s.items.some((it) => it.id === 'alarm') }

// ------------------------------------------------ even-night prowl (#2532) ----
// The day/night tail's second night citizen, the sneak's MIRROR (The Sims, PC
// 2000: the household cat is a night creature — let out after dark it works
// the lawn, and nobody's out past midnight). Same doctrines as the sneak:
// parity off the day (arithmetic, never an rng draw — #2303/#2503/#2520), a
// day stamp (one prowl a night, never banked), a window wholly before
// midnight, and a midnight send-home. The parities are complementary and can
// never overlap: odd nights boots on the gravel, even nights cat paws — a
// sneak and a prowling Miso never share a dark. She walks the lot's own edge
// (visitor-shaped BFS, non-solid per the truck law) and home to the nearest
// warm floor cell; the prowl pays CAT-scale fun and nothing else — never
// s.money, never s.lost (the #2520 win-margin law: night features must not
// touch the attract's thin wish margin). No cat, quiet night: honest absence,
// no event, no fake Miso.
export const PROWL_DUE = 23                 // the same unkind hour the sneak chose - the lawn is Miso's country then
export const PROWL_WINDOW = 1               // one watched hour, closed at midnight by construction
export const prowlNightDue = (day) => day % 2 === 0   // even nights — the sneak took the odd ones; the lot keeps both
export const PET_PROWL_FUN = 0.30         // cat-scale pay: a night's hunt is play, not money
export const PROWL_OUT_LINES = [
    'Miso slips out under the hedge — even nights are hers, and the lawn keeps no secrets from those paws.',
    'The cat pours through the flap at eleven; the garden fills with small purposeful footsteps.',
    'Even nights Miso walks the fence line, tail up, reading the neighbourhood by smell.',
]
export const PROWL_HOME_LINES = [
    'Home by midnight — Miso shakes the dew off and pours herself into the loaf.',
    'The prowl ends at the flap: whatever the garden held, the cat keeps.',
    'Miso returns before midnight, unbothered by mice or by parity.',
]
export const PROWL_PADS = [[392, 0.06, 0], [330, 0.06, 130], [262, 0.08, 260]]      // three soft rising pads — paws on dew
export const PROWL_HOME_SFX = [[262, 0.1, 0], [392, 0.14, 120]]                       // the little way home, up two notes

// scenario setup (the ringSneak pattern): retire whatever prowls and send one
// now, any night. Harness and F1 cheat only — the clock's own law never reads it.
export function ringProwl(s) {
    if (!s.pet) return 'no cat on the lot — nothing to let out'
    s.prowl = null
    s.prowlNight = Math.min(s.prowlNight, s.day - 1)   // tonight's prowl (if any) is retired — the law may land again
    s.prowlNow = Math.max(0, s.hour - 0.01)
    return 'the flap swings open — Miso is due'
}

// the walk home lands, or midnight catches her: one honest close for both.
function finishProwl(s) {
    s.prowl = null
    const p = s.pet
    if (p) {
        p.state = 'roam'
        p.needs.fun = Math.min(1, p.needs.fun + PET_PROWL_FUN)
    }
    s.events.push({ t: 'prowl-home' })
    think(s, PROWL_HOME_LINES[s.prowlNight % PROWL_HOME_LINES.length])
}

function updateProwl(s, dt) {
    const p = s.pet
    if (!p) {   // no cat: the rig expires inside its window, the law stays silent
        if (s.prowlNow !== null && s.hour >= s.prowlNow + PROWL_WINDOW) s.prowlNow = null
        return
    }
    if (s.prowl) {
        const w = s.prowl
        w.t += dt
        walkAlong(s, p, dt, 40)
        if (w.state === 'out' && !p.path) {
            const cell = nearestFloorCell(s, p.r, p.c)
            const bp = cell && walkable(s, cell.r, cell.c) ? bfsPath(s, { r: p.r, c: p.c }, [cell]) : null
            if (bp) { p.path = bp; w.state = 'home' }   // a blocked flap retries — the window is the deadline
        } else if (w.state === 'home' && !p.path) {
            finishProwl(s)
        }
        return
    }
    // one prowl a night — the day stamp is the law; a blocked route retries
    // inside the window (the paper doctrine) and an unused window is gone
    // honestly, never banked for tomorrow.
    const due = s.prowlNow !== null ? s.prowlNow : PROWL_DUE
    if (s.prowlNight === s.day || (s.prowlNow === null && !prowlNightDue(s.day)) || s.hour < due || s.hour >= due + PROWL_WINDOW) return
    // the far side of her own lawn — the farthest walkable lot cell from the gate,
    // deterministic by scan (the cat always gets the same country, seed or no seed).
    let dest = null, bd = -1
    for (let r = 2; r <= ROWS - 3; r++) {
        for (let c = 1; c <= COLS - 2; c++) {
            if (!walkable(s, r, c)) continue
            const d = Math.abs(r - 12) + Math.abs(c - 5)
            if (d > bd) { bd = d; dest = { r, c } }
        }
    }
    const path = dest && bfsPath(s, { r: p.r, c: p.c }, [dest])
    if (!path) return
    if (p.asleep) { p.asleep = false; p.stretchT = 0.9 }   // the wake-and-slip
    p.state = 'prowl'
    p.path = path
    s.prowl = { state: 'out', t: 0 }
    s.prowlNight = s.day
    s.prowlNow = null
    s.prowlSerial++
    s.events.push({ t: 'prowl-out', r: p.r, c: p.c })
    think(s, PROWL_OUT_LINES[s.prowlSerial % PROWL_OUT_LINES.length])
}

// scenario setup (the ringTruck pattern): retire whatever prowls and send one
// now, alarm or not. Harness and F1 cheat only — the clock's own law never reads it.
export function ringSneak(s) {
    s.sneak = null
    s.sneakNight = Math.min(s.sneakNight, s.day - 1)   // tonight's visit (if any) is retired — the law may land again
    s.sneakNow = Math.max(0, s.hour - 0.01)
    return 'boots on the gravel — the sneak is due'
}

function updateSneak(s, dt) {
    if (s.sneak) {
        const k = s.sneak
        k.t += dt
        walkAlong(s, k, dt, 52)
        if (k.path && !k.path.length) k.path = null
        if (k.state === 'enter' && !k.path) { k.state = 'grab'; k.t = 0 }
        if (k.state === 'grab' && k.t > 0.6) {   // a beat at the door-step — the drama is the point
            const gone = s.items.find((it) => SNEAK_LOOT.includes(it.id))
            if (gone) {
                s.items = s.items.filter((x) => x !== gone)
                s.lost += 1
                s.events.push({ t: 'sneak-take', id: gone.id, r: gone.r, c: gone.c })
                reflow(s)
                think(s, SNEAK_TAKE_LINES[s.sneakSerial % SNEAK_TAKE_LINES.length])
            } else {
                s.events.push({ t: 'sneak-empty' })
                think(s, SNEAK_EMPTY_LINES[s.sneakSerial % SNEAK_EMPTY_LINES.length])
            }
            k.state = 'leaving'
            k.path = bfsPath(s, { r: k.r, c: k.c }, [{ r: 12, c: 5 }])
        } else if (k.state === 'leaving' && !k.path) {
            s.sneak = null
            s.events.push({ t: 'sneak-gone' })
            think(s, SNEAK_GONE_LINES[s.sneakNight % SNEAK_GONE_LINES.length])
        }
        return
    }
    // one sneak a night — the day stamp is the law; a blocked approach retries
    // inside the window (the paper doctrine) and a window that ran out is gone
    // honestly, never banked for tomorrow.
    const due = s.sneakNow !== null ? s.sneakNow : SNEAK_DUE
    if (s.sneakNight === s.day || (s.sneakNow === null && !sneakNightDue(s.day)) || s.hour < due || s.hour >= due + SNEAK_WINDOW) return
    if (hasAlarm(s)) {    // the answer: he never crosses the gate post
        s.sneakNight = s.day
        s.scareDay = s.day
        s.sneakNow = null
        s.sneakSerial++
        s.events.push({ t: 'sneak-scared' })
        think(s, SNEAK_SCARE_LINES[s.scareDay % SNEAK_SCARE_LINES.length])
        return
    }
    const gate = { r: 12, c: 5 }      // the gate cell — Fern's own door, the honest way in
    const step = { r: 10, c: 5 }      // the door-step the paper and the mail already know
    const dest = walkable(s, step.r, step.c) ? step : nearestFreeTo(s, step.r, step.c)
    const path = dest && walkable(s, gate.r, gate.c) ? bfsPath(s, gate, [dest]) : null
    if (!path) return
    s.sneak = {
        name: 'Sneak', r: gate.r, c: gate.c, x: tileX(gate.c) + TILE / 2, y: tileY(gate.r) + TILE / 2,
        path, state: 'enter', t: 0, hue: '#3c3348', face: 1, walkPhase: 0, sneak: true,
    }
    s.sneakNight = s.day
    s.sneakNow = null
    s.sneakSerial++
    s.events.push({ t: 'sneak-in', r: gate.r, c: gate.c })
    think(s, SNEAK_IN_LINES[s.sneakSerial % SNEAK_IN_LINES.length])
}



// ------------------------------------------------- catalog shelves (#2222) ----
// The original people-sim never showed a flat wall of goods: buy mode is a
// catalog with category tabs — flip shelves, each shelf few big cards.
// Union of these shelves covers CATALOG exactly, no duplicates (STORES gate).
export const CAT_TABS = [
    { id: 'HOME', ids: ['bed', 'fridge', 'stove', 'toilet', 'shower', 'phone', 'canopy'] },
    { id: 'FUN', ids: ['tv', 'radio', 'book', 'sofa', 'yarn'] },
    { id: 'DECOR', ids: ['plant', 'rug', 'lamp'] },
    { id: 'SPECIAL', ids: ['roomkit', 'petkit', 'kidkit', 'alarm'] },   // #2520: the alarm joins the special shelf — the night's answer
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
// The lot grows: buy the Spare Room kit and the house's east wall gains a
// 3×4 room — plank floor, brick band walls, a doorway punched into the shared
// wall, windows in the east wall. The layer never edits MAP: it rides
// `s.wings` (and `s.ext`, the count), and `groundOf` is the single honest
// ground question for every sim-side walker and guard (keepsOpen sees the new
// walls for free).
// #2689 deepens it: the wing's anchor row is the player's to choose — point
// the ghost at the east lawn; a site is legal exactly where its punched door
// meets real house floor. A second kit raises the Garden Room on the back
// lawn, door punched through the house's south wall. `EAST_ANCHORS` is derived
// from that door law, not a taste table: rows r0 where the house floor sits at
// (r0+2, 10) — rows 2,3,4,6,7 of the east wall.
export const EXT_ROOM = {
    id: 'east', r0: 2,
    price: 300,
    floor: [[3, 12], [3, 13], [3, 14], [4, 12], [4, 13], [4, 14], [5, 12], [5, 13], [5, 14], [6, 12], [6, 13], [6, 14]],
    walls: [[2, 12], [2, 13], [2, 14], [2, 15], [3, 15], [4, 15], [5, 15], [6, 15], [7, 12], [7, 13], [7, 14], [7, 15], [3, 11], [6, 11], [7, 11]],
    door: [4, 11],
    links: [[4, 10]],   // #2689: the door qualifies onto this house-floor cell (eastWing(2) is this instance cell-for-cell)
    windows: [[4, 15], [6, 15]],   // #1814: one source — the bake paints them, nightTint lights them
    react: [[4, 13], [6, 13]],
}

// The east-column sites the door law admits, top to bottom. Row 3 is out: the
// house wall there has no floor west of it — a door there opens onto bricks.
export const EAST_ANCHORS = [0, 1, 2, 4, 5]
export const DEFAULT_ANCHOR = 2   // muscle memory, the attract marquee and the autopilot all keep the classic row

// The wing that rises when the kit lands at anchor row r0 (walls listed without
// duplicates; the classic r0=2 instance is EXT_ROOM's cell-for-cell).
export function eastWing(r0) {
    const floor = []
    for (let r = r0 + 1; r <= r0 + 4; r++) for (let c = 12; c <= 14; c++) floor.push([r, c])
    const walls = []
    const pushW = (r, c) => { if (!walls.some(([wr, wc]) => wr === r && wc === c)) walls.push([r, c]) }
    for (let c = 12; c <= 15; c++) pushW(r0, c)            // north wall
    for (let r = r0; r <= r0 + 5; r++) pushW(r, 15)         // east wall — the lot line
    for (let c = 11; c <= 15; c++) pushW(r0 + 5, c)         // south wall
    pushW(r0 + 1, 11); pushW(r0 + 4, 11); pushW(r0 + 5, 11) // west segments against the house
    return {
        id: 'east', r0, price: 300, floor, walls,
        door: [r0 + 2, 11],
        links: [[r0 + 2, 10]],   // #2689: the anchor law — the door qualifies only onto these house-floor cells
        windows: [[r0 + 2, 15], [r0 + 4, 15]],
        react: [[r0 + 2, 13], [r0 + 4, 13]],
    }
}

// #2689: the second room. A garden cottage on the back lawn — 2×4 planks, a
// door punched through the house's south wall at (8,2) (real floor at (7,2)),
// windows on its east wall, the lot edge on the west. It stands clear of the
// back gate at (8,5), the path and the mail, and clear of every legal east
// anchor — the two rooms never touch, and the west lawn lane stays open.
export const GARDEN = {
    id: 'garden',
    // #2721: the cottage is a lean-to kit — 8 planks against the wing's 12, a
    // door punched through a wall that already stands, no brick band — and it is
    // the jar's own kit: one round's money raises it (§ ROUTE / JAR_CAP).
    price: 90,
    floor: [[9, 0], [9, 1], [9, 2], [9, 3], [10, 0], [10, 1], [10, 2], [10, 3]],
    walls: [[8, 0], [8, 1], [8, 3], [8, 4], [9, 4], [10, 4], [11, 0], [11, 1], [11, 2], [11, 3], [11, 4]],
    door: [8, 2],
    links: [[7, 2]],   // #2689: the punched south door qualifies onto the house floor north of it
    windows: [[9, 4], [10, 4]],
    react: [[9, 2], [10, 2]],
}

export const WINGS_MAX = 2

// #2721: the kit-two economy window. The wall was measured, not guessed: the
// honest winning tour (§520 start + two §100 paydays = §720) spends every coin
// on phone+pet+kid+kit one (§710) and wins with §8–10 in the till — a second
// §300 never arrives before the wish. Rather than launder the till with a
// grant (the win economy is the proof the game can be won, so it must not be
// topped up), the second kit gets its OWN honest purse: Pip's morning paper
// round (§ ROUTE.cash a day, paid while a child lives on the lot) pours into
// an earmarked garden jar that buys NOTHING else. The till is never touched,
// so every shipped tour, twin seed and thin margin stays byte-identical up to
// the hammer — and kit two then lands inside a winning run with its garden
// ripening on screen (TEND_HOURS of sun after the hammer).
export const ROUTE = { cash: 90, hour: 7 }        // the round: one beat per morning, from the day after Pip arrives
export const JAR_CAP = GARDEN.price               // the jar reads FULL when the kit is buyable — no over-saving theatre

// #2695: rooms with purpose — a room earns its keep by being USED, not by
// standing. Purpose state lives ON the wing records (it joins the existing
// `s.wings` hash loop, so a lot with no rooms hashes exactly as before —
// the #2689 empty-loop hygiene). The garden room ripens in the sun: tending
// accrues only through daylit hours, and at ripeness it harvests — the
// hungriest resident eats what was picked, the house takes the pride. At
// night the garden sleeps: no growth, but a ripening bed waits. The Spare
// Room law is lodging: sleep the night through on a bed standing INSIDE the
// east wing and the morning pays a rested joy (once-per-day the room keeps
// its tally — one lodging per night, whoever wakes in it).
export const TEND_HOURS = 2      // daylit sim-hours a garden needs to ripen a harvest
export const HARVEST_FOOD = 0.18 // the hungriest resident eats what the garden picked
export const HARVEST_FUN = 0.06
export const LODGE_FUN = 0.10    // waking rested in a room that lodged you well
const HARVEST_LINES = [
    '{p} picks supper from the garden room — the basket nearly overflows.',
    'The garden room ripens; {p} carries in tomatoes still warm from the sun.',
    'Beans, herbs, and one very fat courgette — the garden room pays for itself.',
]
const LODGE_LINES = [
    '{p} wakes in the wing stretched and grinning — the room kept the night kind.',
    'Sunlight finds the wing first; {p} rises rested, the room having done its job.',
]

// #2736: rooms with a personality — the purpose tail's next floor. A wing
// reads its OWN furniture and becomes the kind of room it is furnished as,
// the way the original graded rec rooms and libraries by what stood in them.
// Two laws beyond the sun (#2695) and the bed:
//   • THE STUDY READS — a Bookshelf standing on a wing's floorboards makes
//     that room a study; every read that ENDS there turns a page, and at
//     PAGES_INSIGHT the room pays: the reader surfaces wiser and lighter,
//     the house takes one quiet pride. A bookshelf in the living room stays
//     a plain bookshelf — the clause only exists on room floorboards.
//   • THE PLAYROOM PLAYS — a TV or radio on the wing floor makes it a
//     playroom, and the child gravitates: the funnel-fun pick prefers the
//     in-room toy over nearer house things (the cone-before-toys doctrine,
//     #2503, at room scale). Every fun session that ENDS at the in-room toy
//     pays a play; at PLAYS_DELIGHT the room cashes in — giggles, a deeper
//     kid bond, one pride.
// Like #2695, no purpose line draws rng for its timing; tallies ride the
// wing records and join stateHash inside the existing wings loop, so a lot
// with no rooms gains no new mixes at all.
export const PAGES_INSIGHT = 3    // finished reads in the study that make one insight
export const READ_INSIGHT_FUN = 0.15
export const PLAYS_DELIGHT = 3    // finished kid plays in the playroom that make one delight
export const KID_ROOM_FUN = 0.20
export const KID_ROOM_BOND = 0.5
const STUDY_LINES = [
    '{p} closes the last cover mid-sentence — the study keeps what it learned.',
    'Three books deep in the study; {p} comes up smarter and quieter.',
    'The study adds its quiet interest to the house; {p} could talk about this for hours.',
]
const ROOM_LAUGH_LINES = [
    '{n} giggles where the room hums — the playroom keeps the volume.',
    'Cartoons in the playroom; {n} cannot stop laughing at the good parts.',
    'The playroom pays its rent in giggles, and {n} is rich.',
]

// geometry for a placed wing record ({ id, r0 }) — and the lookup sets.
export function wingGeom(w) { return w.id === 'garden' ? GARDEN : eastWing(w.r0) }
const wingSetCache = new Map()
export function wingSets(g) {   // #2705: exported for the purpose view — the panes ask the room's own floor who sleeps inside it
    const k = `${g.id}:${g.r0 ?? -1}`
    let s = wingSetCache.get(k)
    if (!s) {
        s = {
            floor: new Set(g.floor.map(([r, c]) => `${r},${c}`)),
            wall: new Set(g.walls.map(([r, c]) => `${r},${c}`)),
            door: `${g.door[0]},${g.door[1]}`,
        }
        wingSetCache.set(k, s)
    }
    return s
}

// #2736: which standing wing (if any) owns this cell's floorboards? The
// personality laws ask the GEOMETRY, never an item id — the same question
// the lodging law asks of beds (#2695), pointed at furniture instead.
export function onWingFloor(s, r, c) {
    if (!s || !s.ext) return null
    const k = `${r},${c}`
    for (const w of s.wings) if (wingSets(wingGeom(w)).floor.has(k)) return w
    return null
}

// The room's name from what stands on it — view-only, like every #2705 tell.
// Priority bedroom > study > playroom: the bed law (#2695/#2272) already
// owns the sleeping room; a room full of everything is called by its deepest
// purpose. Null on a bare floor — an empty room has earned no name.
export function archetypeOf(s, w) {
    if (!s || !s.ext || !w) return null
    let bed = 0, study = 0, play = 0
    const g = wingSets(wingGeom(w))
    for (const it of s.items) {
        if (!g.floor.has(`${it.r},${it.c}`)) continue
        const d = DEF[it.id]
        if (!d) continue
        if (d.sleep) bed = 1
        else if (it.id === 'book') study = 1
        else if (it.id === 'tv' || it.id === 'radio') play = 1
    }
    return bed ? 'bedroom' : study ? 'study' : play ? 'playroom' : null
}

// #1814 move-in reactions: the hammer falls and the residents react once.
// Preferred glance cells live on each wing's geometry (`react`) — #2689 moved
// them with the sites; the lines below stay the shared voice of the move-in.
export const ROOM_SEE_LINES = [
    'The new room smells like fresh paint.',
    '{p} takes a victory lap through the new room.',
    '{p} tries the new floorboards — they creak approvingly.',
]
export function groundOf(s, r, c) {
    if (s && s.ext) {
        const k = `${r},${c}`
        for (const w of s.wings) {
            const g = wingSets(wingGeom(w))
            if (g.wall.has(k)) return 'wall'
            if (g.floor.has(k) || k === g.door) return 'floor'
        }
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
    owner: null,          // #2470: who placed the errand in flight — 'human' orders earn the queue, AI wander gets preempted
    use: null,             // { obj, def, t, dur }
    faintT: 0, redT: {},  // per-need seconds spent fully red
    workedToday: false, working: false,
    mood: 1, walkPhase: 0, face: 1,
    chatT: 0, chatWith: null, alarmT: 0, wasRed: {},   // #2240: chatT re-arms per guest
    coneHold: 0, coneDrips: 0,   // #2508 item 3: the eat beat — a bought cone rides in the hand (view-only, off the hash)
    wasAmber: {},                // #2253: one-shot amber prompt per need crossing
    roomSeen: false,             // #1814: one move-in glance per resident
    mealTaken: 0,              // #2244: serial of the last plate this resident ate
})

export function newRun(seed) {
    const s = {
        seed: seed >>> 0,
        rng: mulberry32((seed >>> 0) ^ 0x4b0bb0d1),
        tick: 0, sec: 0, hour: 7, day: 1,
        money: 520, rank: 1, workDays: 0, content: 0,
        jar: 0, routeDay: -1,     // #2721: Pip's earmarked garden fund (the till stays the tour's)
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
            { uid: 6, id: 'bin', r: BIN_HOME.r, c: BIN_HOME.c },   // #2303: the lot owns its bin — parked by the gate post
        ],
        nextUid: 7,
        people: [person('Otto', 3, 3, '#e2574c', 1), person('Mira', 3, 8, '#3f7fd1', 0)],
        active: 0,
        visitor: null,                  // { name, x, y, path, state, t }
        visitAfter: null,             // hour of next visit
        visitGap: 0,
        ivy: null,                    // #2143: second neighbour, same shape as `visitor` (+ gift)
        ivyAfter: null,             // hour of Ivy's next visit
        ivyGap: 0,
        giftFx: 0,                // #2240: real seconds left of the set-down basket on the ground
        giftAt: null,             // #2240: {x,y} where it landed (px, lot space)
        giftHoney: false,         // #2240: FAMILY tier — the honey jar lands too
        demoIvy: 0,               // #2240: the attract has rung (or saw) Ivy this run
        triTell: 0,                 // #2154: world seconds until the next three-way choreography tell
        triHits: 0,                 // #2154: three-way tells fired this run (the line variant rides it)
        neighTell: 0,               // #2588: world seconds until the next exchanged neighbour line
        neighHits: 0,              // #2588: neighbour exchanges fired this run (line variant rides it)
        neiIgnore: 0,             // #2604: seconds one neighbour has been watched-but-unheard (clock, not hash)
        neiSpats: 0,              // #2604: pair quarrels this run (rides the hash)
        neiGrudge: 0,             // #2604: 1 = the pair is in cold war until absence thaws (rides the hash)
        neiMending: 0,            // #2604: thawed by absence — the next shared moment makes up (rides the hash)
        neiMediated: 0,           // #2672: 1 = a mediator already broke THIS spat's cold war (rides the hash; a new spat clears it)
        neiStroll: 0,             // #2611: free-chat seconds banked toward the next pair stroll (clock, not hash)
        neiWalk: 0,              // #2611: next spot on the pair's circuit (discrete, rides the hash)
        neiSpatCd: 0,             // #2604: real seconds until the next pair spat may fire (clock, not hash)
    neiMurmurCd: 0,           // #2599 handoff 2: seconds until the pair's next sour murmur (clock, not hash)
    neiMurrs: 0,              // #2599 handoff 2: rotation position through NEIGH_SOUR_LINES (clock, not hash)
    neiMeds: 0,               // #2672: rotation position through NEIGH_MEDIATE_LINES (clock, not hash)
        pet: null,                  // #2197: the household cat, once adopted
        kid: null,                  // #2203: the adopted child, once the agency calls
        paper: null,                // #2238: today's news on the step (item ref | null)
        paperDay: 0,              // #2238: day stamp of the last delivery (rides the hash)
        paperAfter: 0,            // #2238: hour the route is due today
        meal: null,                 // #2244: the plate the kitchen set (item ref | null)
        mealDay: 0,               // #2244: day stamp of the last served plate (rides the hash)
        mealSlot: 0,              // #2244: index of the next bell due today (3 = all rung)
        mealSerial: 0,            // #2244: counts plates ever served (per-plate identity)
        mealEaten: [],            // #2244: people who have eaten the CURRENT plate
        mealAt: 0,                // #2244: hour the current plate landed (window expiry)
        mealAfter: [7, 12.5, 18.5],   // #2244: today's seeded bell hours
        binAt: 'home',            // #2303: 'home' by the gate or 'curb' at the road
        binAuto: false,           // #2303: eve armed — the chore route stands until done
        binSetDay: 0,             // #2303: day stamp of the last trip to the curb
        collectionDay: GARBAGE_EVERY,   // #2303: day the truck is next due
        truckHour: 6,             // #2303: dawn hour the truck passes, seeded on the eve
        collections: 0,           // #2303: bins the truck ever took (rides the hash)
        skips: 0,                 // #2303: honest skips — the missed days on the roster
        cone: null,               // #2503: the cone the truck set at the curb (item ref | null)
        iceDay: 0,              // #2503: day stamp of the last stop (rides the hash)
        iceSerial: 0,           // #2503: cones the street ever set (per-cone identity)
        treats: 0,              // #2503: cones ever eaten (rides the hash)
        iceAt: 0,               // #2503: hour the current cone landed (window expiry)
        iceNow: null,           // #2503: a rigged pass hour (ringTruck) — one-shot, never the law
        sneak: null,            // #2520: the prowler on the lot (visitor-shaped | null)
        sneakNight: 0,          // #2520: day stamp — one visit a night, the day-stamp doctrine (rides the hash)
        scareDay: 0,            // #2520: day the alarm last turned him at the gate (rides the hash)
        sneakSerial: 0,         // #2520: visits ever made (line variant rides it, the iceSerial way)
        lost: 0,                // #2520: § ever lifted from the till (rides the hash)
        sneakNow: null,         // #2520: a rigged due hour (ringSneak) — one-shot, never the law
        prowl: null,            // #2532: {state:'out'|'home'} while Miso works the lawn (her own feet carry it)
        prowlNight: 0,          // #2532: day stamp — one prowl a night, the day-stamp doctrine (rides the hash)
        prowlSerial: 0,         // #2532: prowl visits ever made (line variant rides it, the sneakSerial way)
        prowlNow: null,         // #2532: a rigged due hour (ringProwl) — one-shot, never the law
        orderPing: { x: 0, y: 0, label: '', t: 0 },   // #2253: the last issued order (the view rings its target while t > 0)
        mealName: '',             // #2244: name of the current plate (a word is state the view reads)
        rel: { house: 0, fern: 0, ivy: 0, kid: 0, neigh: 0 },   // #1817/#2143/#2203/#2588 conversation ladders (0..REL_MAX)
        spats: 0,                 // #2070: quarrels this run (rides the hash)
        grudge: 0,                // #2070: 1 = cold war until the pair makes up
        spatCd: 0,                // #2070: real seconds until the next spat may fire
        spatFx: 0,                // #2076: seconds left of the storm-puff tell over the pair
        cooFx: 0,                 // #2131: seconds left of the sparkle/hearts tell over the pair
        cmdCd: 0,                 // #2131: real seconds until the next player command lands
        yarnCd: 0,                // #2256: world seconds until the next ordered yarn play
        holdT: -1,                // #2171: armed thumb-court hold (world ms; -1 = no press pending)
        courtPick: null,          // #2235: preferred addressee while it stays in the reach ring
        houseLineCd: 6,               // co-presence chat line cooldown (s)
        lastToast: 0,               // day of last shared payday toast
        thoughts: [], thoughtT: 0,
        events: [],
        fastT: 0,                      // "AT WORK" overlay seconds left
        done: null, endMsg: '',
        demo: false,
        ext: 0,
        roomReact: 0,            // #1814: residents still owed a move-in glance
        wings: [],               // #2689: the wings the lot has grown (ext is the count)
        ambience: 0, happyHours: 0,
    }
    scheduleVisit(s)
    scheduleIvy(s)
    schedulePaper(s)
    scheduleMeals(s)
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

// #2244: the bells keep their hours — breakfast, lunch and dinner each land
// inside their window, seeded, so the lot's day has three fixed meals exactly
// like the original's. The kitchen needs a kitchen (a fridge or a stove);
// without one the bells are honestly skipped, not silently eaten.
export function scheduleMeals(s) { s.mealAfter = MEAL_DUE.map(([a, b]) => a + s.rng() * (b - a)) }

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
    // #2588: the third-party ladder — the neighbours climb it between
    // themselves, with nobody from the house on the rung.
    neigh: {
        1: ['Fern and Ivy nod at each other by the gate now, like it is planned.', 'The two neighbours save each other a seat at the kitchen table without asking.'],
        2: ['Fern and Ivy arrive an hour apart and still finish each other\u2019s market news.', 'Ivy brings a spare basket; Fern brought one last week. This is a thing now.'],
        3: ['Fern and Ivy — the neighbourhood\u2019s other household, two gardens and one gossip line.'],
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
export function courtReach(s, speakerIdx = s.active) {   // #2235: everyone the word can find, partner pushed first; #2683: the go-say errand speaks as ITSELF, not the seated hand
    const me = s.people[speakerIdx]
    if (!me || me.faintT > 0) return []
    const cand = []
    const partner = s.people[1 - s.active]
    if (partner && partner !== me && partner.faintT <= 0) cand.push({ p: partner, k: 'house' })
    if (s.visitor && s.visitor.state !== 'leaving') cand.push({ p: s.visitor, k: 'fern' })
    if (s.ivy && s.ivy.state !== 'leaving') cand.push({ p: s.ivy, k: 'ivy' })   // #2143
    if (s.kid) cand.push({ p: s.kid, k: 'kid' })   // #2203: the court reaches children too
    return cand.filter((c) => Math.abs(me.r - c.p.r) + Math.abs(me.c - c.p.c) <= COURT_REACH)
}

export function courtTarget(s, speakerIdx = s.active) {
    const cand = courtReach(s, speakerIdx)
    if (!cand.length) return null
    if (s.courtPick) {   // #2235: the chosen ear outranks the nearest while it shares the ring (expiry: courtTick)
        const p = cand.find((c) => c.k === s.courtPick)
        if (p) return p   // stale pick (they left/fainted) simply falls through to the old law
    }
    const me = s.people[speakerIdx]
    let best = cand[0], bd = COURT_REACH + 1   // partner-first on ties: cand[0] is the partner
    for (const c of cand) {
        const d = Math.abs(me.r - c.p.r) + Math.abs(me.c - c.p.c)
        if (d < bd) { bd = d; best = c }   // cand is already reach-filtered by courtReach
    }
    return best
}

// #2235 — CHOOSE YOUR COURT TARGET. When others share the reach ring, a tap on
// one of them makes that person the preferred addressee until they leave the
// ring (courtTick expires the pick; the view owns tap priority). The pick rides
// the hash so replays pin it like every other law.
export function courtPickSet(s, k) {
    const cand = courtReach(s)
    if (cand.length < 2) return false   // nothing to choose — the solo idiom stays switch/walk
    if (!cand.some((c) => c.k === k)) return false
    s.courtPick = k
    return true
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

export function court(s, kind, speakerIdx = s.active) {
    if (s.cmdCd > 0) return null
    const t = courtTarget(s, speakerIdx)
    if (!t) return null
    const me = s.people[speakerIdx], other = t.p, k = t.k
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
    if (s.courtPick && !courtReach(s).some((c) => c.k === s.courtPick)) s.courtPick = null   // #2235: the pick lasts until they leave the ring
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

// #2683 — GO-SAY: CHOOSE WHICH TWO SHARE THE RING. #2235 let the hand pick
// the ear inside a crowded ring; the promise that the pair be chosen ACROSS
// the lot stayed unbuilt — the word only reached whoever already shared the
// speaker's 2-tile ring. This is the original's idiom (The Sims, PC 2000):
// click the person you want to talk to and your Sim walks over and does it.
// A tap on Fern/Ivy/Pip beyond COURT_REACH issues a walk-to-them errand;
// the tick the two actually share the ring, the coo lands through court()
// unchanged — bond, sparkle, cooldown, lines, all existing law. Arrival
// converts the promise into the #2235 pick, so even a crowd pays the chosen
// ear. An ear that leaves, faints or falls asleep takes the promise with it
// (fainted-folks-are-not-company law); a target that slips away mid-walk
// is chased GO_SAY_CHASE re-paths, then the word waits for another day.
// The partner keeps the historic switch idiom (tap a resident = change hand),
// so GO-SAY rides the visitors and the child. Nothing here draws on rng at
// issue, and the attract bot never go-says — old demos stay byte-identical.
export const GO_SAY_CHASE = 3
// #2697 tail 1: the arrival settle beat (Sims social pause). Reaching the ring
// is not the meeting — the two hold for one breath (0.3 s of world ticks) before
// the coo lands. A cooldown hold FREEZES the breath (the promise already waits);
// a repath discards it; the hold is deterministic, spends no rng.
export const GO_SAY_SETTLE = 18
const GO_SAY_ISSUE_LINE = 'You cross the lot to say the thing you mean.'
const GO_SAY_BLOCKED_LINE = 'The way over is shut — the kind word waits for another day.'
const GO_SAY_LOST_LINES = [
    'The one you meant to thank has gone — the kind word waits for another day.',
    'You arrive where someone was; they are elsewhere now, and the errand folds.',
]

function goSayArrive(s, p) {
    const k = p.goal.k
    const v = goSayTarget(s, k)
    if (!v || v.faintT > 0) {
        p.goal = null
        p.settleT = undefined   // #2697: the breath dies with the errand
        s.events.push({ t: 'go-say', k, stage: 'lost', name: p.name })
        think(s, pick(s, GO_SAY_LOST_LINES))
        return
    }
    const d = Math.abs(p.r - v.r) + Math.abs(p.c - v.c)
    if (d <= COURT_REACH) {
        if (s.cmdCd > 0) return   // a word just landed elsewhere — the promise waits for the cooldown to clear
        // #2697 tail 1: the face-and-breath — first arrival at the ring starts the
        // hold; the word lands only when the breath ends. No rng, pure cadence.
        if (p.settleT === undefined) p.settleT = GO_SAY_SETTLE
        if (--p.settleT > 0) return
        p.settleT = 0
        s.courtPick = k           // arrival makes it a #2235 pick: the crowd pays the chosen ear
        const pi = s.people.indexOf(p)
        court(s, 'coo', pi)
        p.goal = null
        s.events.push({ t: 'go-say', k, stage: 'fire', name: p.name })
        return
    }
    if (p.goal.tries >= GO_SAY_CHASE) {
        p.goal = null
        p.settleT = undefined
        s.events.push({ t: 'go-say', k, stage: 'lost', name: p.name })
        think(s, `${v.name} is keeping you walking — the word waits for another day.`)
        return
    }
    p.goal.tries++
    p.settleT = undefined        // #2697: a repath discards the breath — the meeting starts over
    const tg = goSayCells(s, v)
    const path = tg.length ? bfsPath(s, { r: p.r, c: p.c }, tg) : null
    if (!path) {
        p.goal = null
        s.events.push({ t: 'go-say', k, stage: 'lost', name: p.name })
        think(s, GO_SAY_BLOCKED_LINE)   // #2697 tail 2: every lost stage speaks honestly (fixed text — no rng spend)
        return
    }
    p.path = path
    p.walkN0 = path.length
}

// the person the promise is addressed to — valid while they're on the lot,
// not leaving, not asleep. The partner is deliberately absent (switch idiom).
export function goSayTarget(s, k) {
    if (k === 'fern') return s.visitor && s.visitor.state !== 'leaving' ? s.visitor : null
    if (k === 'ivy') return s.ivy && s.ivy.state !== 'leaving' ? s.ivy : null
    if (k === 'kid') return s.kid && !s.kid.asleep ? s.kid : null
    return null
}

// #2708 tail 5 (desktop far-tap): the ears the keyboard can address, in the
// pointer's own tap order. Tab is the resident switch (#1806) — the desktop
// go-say idiom gets its OWN key (KeyT cycles the ear, C says it), never a
// second on-screen pad (Jon's rule: one pad, keyboard parity on desktop).
export const FAR_EARS = ['fern', 'ivy', 'kid']

// the next addressable ear after `from` ('' / null = first press) — ears that
// are off the lot, leaving or asleep are skipped; null when none can hear.
// Pure: reads, never spends rng, never mutates (the hint is view state).
export function farCycle(s, from) {
    const start = FAR_EARS.indexOf(from)
    for (let i = 1; i <= FAR_EARS.length; i++) {
        const k = FAR_EARS[(start + i + FAR_EARS.length) % FAR_EARS.length]
        if (goSayTarget(s, k)) return k
    }
    return null
}

// cells you can stand on to share the ring — the neighbours' tiles (d = 1 is
// inside COURT_REACH 2 even if the target shifts a step on arrival)
function goSayCells(s, v) {
    const out = []
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue
            if (walkable(s, v.r + dr, v.c + dc)) out.push({ r: v.r + dr, c: v.c + dc })
        }
    }
    return out
}

export function cmdGoSay(s, p, k) {
    if (!s.people.includes(p) || p.faintT > 0 || p.working) return false
    const v = goSayTarget(s, k)
    if (!v) return false
    if (Math.abs(p.r - v.r) + Math.abs(p.c - v.c) <= COURT_REACH) return false   // same-ring: the #2235 pick idiom keeps the tap
    const tg = goSayCells(s, v)
    const path = tg.length ? bfsPath(s, { r: p.r, c: p.c }, tg) : null
    if (!path) return false
    p.path = path
    p.goal = { kind: 'gosay', k, tries: 0 }
    p.settleT = undefined       // #2697: a fresh errand carries no stale breath
    p.owner = 'human'
    p.walkN0 = path.length
    s.orderPing.x = v.x
    s.orderPing.y = v.y
    s.orderPing.label = `GO SAY IT — ${v.name.toUpperCase()}`
    s.orderPing.t = 1.6
    think(s, GO_SAY_ISSUE_LINE)   // #2697 tail 2: the errand names itself at issue (fixed text — no rng spend)
    return true
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

// #2256: the yarn ball is cat business — the order stands while Miso is home
// and awake and the play cooldown has closed. Placement/sale never consult
// this; only a human ordering play does.
export function yarnOrderOk(s) {
    return !!s.pet && !s.pet.asleep && s.yarnCd === 0 && !isNight(s)
}

export function cmdUse(s, p, it) {
    if (DEF[it.id] && DEF[it.id].catOnly && !yarnOrderOk(s)) {
        if (!s.pet) s.events.push({ t: 'refuse', r: it.r, c: it.c })
        return false
    }
    // #2303: the bin takes the set-out order only while the eve stands —
    // out of season or already at the curb, the refusal is honest and seen.
    if (DEF[it.id] && DEF[it.id].binOnly && !binOrderOk(s)) {
        s.events.push({ t: 'refuse', r: it.r, c: it.c })
        return false
    }
    // #2503: the cone takes the order while the truck idles AND the till can
    // pay — a broke order refuses at the tap, in words (the treat costs what
    // the treat costs); a tap after the truck moved on refuses in silence it
    // cannot mistake (no cone, no order, refuse flash at the empty curb).
    if (DEF[it.id] && DEF[it.id].truckOnly && !coneOrderOk(s)) {
        s.events.push({ t: 'refuse', r: it.r, c: it.c })
        think(s, pick(s, s.cone ? ICE_BROKE_LINES : ICE_GONE_LINES))
        return false
    }
    const tg = targetsOf(s, it)
    if (!tg.length) return false
    const path = bfsPath(s, { r: p.r, c: p.c }, tg)
    if (!path) return false
    p.path = path
    p.goal = { kind: 'use', it }
    p.owner = 'human'   // #2470: a cmd* order is a PLAYER order (autonomy assigns its own paths directly)
    p.walkN0 = path.length   // #2474: view-only (never mixed into stateHash) — the walk's length at
                             // issue, so the panel can show the errand draining as steps are spent
    // #2253: an issued order must be *visible* the instant it lands — the view
    // rings the target (and the shell names it) so a registered tap never looks
    // like a dropped one. The cell arrives with the path's last step; an
    // already-there order (bfsPath returns []) rings where the person stands.
    const last = path.length ? path[path.length - 1] : { r: p.r, c: p.c }
    s.orderPing.x = LOT_X + last.c * TILE + TILE / 2
    s.orderPing.y = LOT_Y + last.r * TILE + TILE / 2
    s.orderPing.label = it.id === 'mail' ? 'WORK' : (DEF[it.id] ? DEF[it.id].name.toUpperCase() : 'OBJECT')
    s.orderPing.t = 1.6
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
    p.owner = 'human'   // #2470: player orders own the resident; AI orders never do
    p.walkN0 = path.length   // #2474: see cmdUse — the walk's issue-time length for the chip wipe
    return true
}

// the "A button" use: nearest usable object adjacent to the person
function nearestUse(s, p) {
    let best = null, bd = 3
    for (const it of s.items) {
        if (it.id === 'mail') {
            if (!p.workedToday && !p.working && s.day % 2 === p.worksOn && s.hour >= WORK_START && s.hour < WORK_END - 1
                && Math.abs(it.r - p.r) + Math.abs(it.c - p.c) <= 2) return { it, work: true }
            continue
        }
        const d = DEF[it.id]
        if (!d || !d.need) continue
        if (d.catOnly && !yarnOrderOk(s)) continue   // #2256: pad-A takes the play order only while it stands
        if (d.binOnly && !binOrderOk(s)) continue   // #2303: pad-A takes the set-out only while the eve stands
        if (d.truckOnly && !coneOrderOk(s)) continue   // #2503: pad-A takes the treat only while the truck idles and the till pays
        const near = Math.min(...targetsOf(s, it).map((t) => Math.abs(t.r - p.r) + Math.abs(t.c - p.c)))
        if (near < bd) { bd = near; best = it }
    }
    return best ? { it: best } : null
}

export function tryUse(s, p) {
    const n = nearestUse(s, p)
    if (!n) return false
    return n.work ? cmdWork(s, p) : cmdUse(s, p, n.it)
}

// #2470: pad-A parity — A rides the same queue law as a tap: an idle resident
// issues now; a resident busy with one of the PLAYER's own errands appends the
// nearest usable object to the resident's list. An AI wander (owner !== 'human')
// is always preemptible — free will never outranks the hand on the screen.
export function tryUseOrQueue(s, p) {
    const n = nearestUse(s, p)
    if (!n) return false
    if (!(orderBusy(s, p) && p.owner === 'human')) return n.work ? cmdWork(s, p) : cmdUse(s, p, n.it)
    return n.work ? cmdQueue(s, p, { kind: 'work' }) : cmdQueue(s, p, { kind: 'use', it: n.it })
}

// ---------------------------------------------------------- queue -------
// #2470: the original's action queue (The Sims, PC 2000) — while a resident
// is busy, a new order lands in THEIR queue instead of silently replacing the
// errand in flight; when the current order ends, the next one re-issues from
// wherever the resident stands. Idle taps keep today's instant issue, so the
// attract bot (which never orders while busy, see autonomous) and every older
// gate play byte-identical.

export const QUEUE_MAX = 3

// #2474: PER-GLYPH QUEUE TIMBRES. The original gave each action category its
// own append sound; #2470 shipped one 660 Hz blip for every chip. Keyed by
// the chip's glyph (art.js queueGlyphFor): distinct first frequency, note
// count and shape per category — the panel LISTENING is as legible as the
// panel looking. The shell plays these tables verbatim (#2240 VISIT_TIMBRE,
// #2264 MEAL_TIMBRE pattern). [freq, dur, delayMs]
export const QUEUE_TIMBRE = {
    fork: [[620, 0.05, 0], [784, 0.07, 60]],        // hunger — a warm two-note fork
    moon: [[300, 0.11, 0]],                          // energy — one soft low hum
    star: [[880, 0.04, 0], [1174, 0.05, 55], [1568, 0.06, 110]],   // fun — a bright triple bounce
    chat: [[740, 0.04, 0], [988, 0.05, 50]],        // social — a chirpy pair
    gosay: [[740, 0.04, 0], [988, 0.05, 50], [460, 0.035, 110]],   // #2704 tail 3: the promised word — the chat pair plus one step (the errand walks over)
    drop: [[520, 0.07, 0]],                          // bladder — a single droplet
    case: [[220, 0.07, 0], [165, 0.10, 70]],        // work — a briefcase thunk, down
    arrow: [[460, 0.035, 0]],                        // walk — one soft step
}
export const QUEUE_TIMBRE_FALLBACK = [[660, 0.04, 0]]   // unknown glyph — the historic blip

export function orderBusy(s, p) {
    return p.faintT > 0 || p.working || !!p.use || !!(p.path && p.path.length) || !!p.goal
}

export function cmdQueue(s, p, o) {
    if (p.faintT > 0 || p.working) return false
    if (p.queue.length >= QUEUE_MAX) {
        s.events.push({ t: 'queue-full', name: p.name })
        return false
    }
    p.queue.push(o)
    s.events.push({ t: 'queued', name: p.name, id: o.kind === 'use' ? o.it.id : o.kind })
    return true
}

// #2474 item 3: DRAG-TO-FRONT. The original let you pull a queued action to
// the head of the list; a phone thumb gets the same law via press-and-pull-left
// (index.jsx chipDrag). Only order moves — the order still re-validates at
// issue time like any other queued errand, and the head-in-flight is untouched.
export function queuePromote(s, p, i) {
    if (i <= 0 || i >= p.queue.length) return null
    const o = p.queue.splice(i, 1)[0]
    p.queue.unshift(o)
    s.events.push({ t: 'queue-promote', name: p.name, id: o.kind === 'use' ? o.it.id : o.kind })
    return o
}

export function queueCancel(s, p, i) {
    if (i < 0 || i >= p.queue.length) return null
    const o = p.queue.splice(i, 1)[0]
    s.events.push({ t: 'queue-cancel', name: p.name, id: o.kind === 'use' ? o.it.id : o.kind })
    return o
}

// an order is re-validated at ISSUE time, never trusted from tap time: the
// object may have been sold, the cat may have lost interest, the mail window
// may have closed — each honest refusal is seen (cmdUse/cmdWork refuse with
// their own events) and the next item gets its turn.
function issueOrder(s, p, o) {
    if (p.faintT > 0 || p.working) return false
    if (o.kind === 'walk') return cmdWalk(s, p, o.r, o.c)
    if (o.kind === 'work') return cmdWork(s, p)
    if (o.kind === 'gosay') return cmdGoSay(s, p, o.k)   // #2683: the promised ear re-validates at issue too — Fern may have gone home since the tap
    if (!s.items.includes(o.it)) return false   // sold or moved on — drop it
    return cmdUse(s, p, o.it)
}

// ---------------------------------------------------------- building ------
export function canPlace(s, def, r, c) {
    if (r < 0 || c < 0 || r + def.h - 1 >= ROWS || c >= COLS) return false
    // #2272: the wing's bedroom bed — it fits ONLY on a wing's floorboards
    // (#2689: any wing — east or garden — is a bedroom floorboards home).
    if (def.wingOnly && !(s.ext && s.wings.some((w) => wingSets(wingGeom(w)).floor.has(`${r},${c}`)))) return false
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
// until the hammer falls. #2689: two rooms never share a cell, and the lot
// holds WINGS_MAX.
function roomClear(s, g) {
    if (s.done || s.ext >= WINGS_MAX) return false
    if (!g.links.every(([r, c]) => groundAt(r, c) === 'floor')) return false   // #2689: a door onto bricks is no door — the anchor law in one line
    for (const [r, c] of g.floor) {
        if (cellItem(s, r, c)) return false
        if (s.people.some((p) => p.r === r && p.c === c)) return false
    }
    if (s.visitor && g.floor.some(([r, c]) => r === s.visitor.r && c === s.visitor.c)) return false
    if (s.ivy && g.floor.some(([r, c]) => r === s.ivy.r && c === s.ivy.c)) return false   // #2143: Ivy stands where the wing would rise
    for (const w of s.wings) {
        const o = wingSets(wingGeom(w))
        if (g.floor.some(([r, c]) => o.floor.has(`${r},${c}`) || o.wall.has(`${r},${c}`))) return false
        if (o.floor.has(`${g.door[0]},${g.door[1]}`)) return false
    }
    return true
}

// #2689: the hammer's honest guard — new walls may not seal anyone out. Flood
// the lot with the wing's walls counted as solid; the kerb gate, every resident
// and every solid piece's use cell must still answer. (The classic kit skipped
// this because its lawn sat clear; a chosen row and the garden cottage must ask.)
function keepsWing(s, g) {
    const wall = wingSets(g).wall
    const test = (rr, cc) => solidAt(s, rr, cc) || wall.has(`${rr},${cc}`)
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

// the site the kit ghost shows for cursor (r, c): the second kit has one home
// (the garden); the first slides its anchor to the cursor once it points at
// the east column, snapping an illegal row (3 — bricks west of the door) to
// its nearest legal neighbour. Cursor west of the lawn keeps the classic row.
export function wingPick(s, r, c) {
    if (s.ext >= 1) return GARDEN
    if (c < 11) return eastWing(DEFAULT_ANCHOR)
    let r0 = Math.max(0, Math.min(EAST_ANCHORS[EAST_ANCHORS.length - 1], r - 2))
    if (!EAST_ANCHORS.includes(r0)) {
        r0 = EAST_ANCHORS.reduce((best, a) => (Math.abs(a - (r - 2)) < Math.abs(best - (r - 2)) ? a : best), EAST_ANCHORS[0])
    }
    return eastWing(r0)
}

export function buildRoom(s, g) {
    const geom = g || (s.ext >= 1 ? GARDEN : eastWing(DEFAULT_ANCHOR))
    // #2721: the garden cottage is the jar's kit — Pip's round money pays it
    // first and the till covers only what the fund cannot. The east wing never
    // touches the jar: the fund is earmarked, so the till's honest margins
    // (#2209's tour, the thin WINNABLE seeds) are provably untouched.
    const fund = geom.id === 'garden' ? s.jar : 0
    if (!roomClear(s, geom) || s.money + fund < geom.price) return false
    if (!keepsWing(s, geom)) return false
    const fromJar = Math.min(fund, geom.price)
    s.jar -= fromJar
    s.money -= geom.price - fromJar
    s.wings.push(geom.id === 'garden'
        ? { id: 'garden', tend: 0, herbs: 0, pages: 0, insights: 0, plays: 0, delights: 0 }              // #2695: the ripening ledger rides the room; #2736: so do the personality tallies
        : { id: 'east', r0: geom.r0, sleptWell: 0, lodgeDay: -1, pages: 0, insights: 0, plays: 0, delights: 0 })   // #2695: and so does the lodging one; #2736: and the personality tallies
    s.ext = s.wings.length
    s.roomReact = s.people.length   // #1814: the wing gets its move-in reactions
    s.events.push({ t: 'room', w: geom.id, jar: fromJar })
    think(s, geom.id === 'garden'
        ? 'The back lawn rolls open and a garden room rises — planks, a south door, morning on the planks by noon.'
        : 'The east wall rolls open and a spare room rises — plank floor, two windows, room to grow.')
    return true
}

export function buildRoomOk(s, g) {
    const geom = g || (s.ext >= 1 ? GARDEN : eastWing(DEFAULT_ANCHOR))
    // #2721: the garden buys with the jar plus the till; the wing with the till
    const fund = geom.id === 'garden' ? s.jar : 0
    return roomClear(s, geom) && s.money + fund >= geom.price && keepsWing(s, geom)
}

export function place(s, r, c) {
    const def = CATALOG[s.sel]
    if (!def) return false
    if (def.room) {
        const g = wingPick(s, r, c)
        if (buildRoom(s, g)) return true
        s.events.push({ t: 'refuse', r: g.door[0], c: g.door[1] })
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
    // #2244: same law for a plate — no meal may be buried under furniture.
    if (s.meal && s.meal.r === r && s.meal.c === c) { s.items = s.items.filter((x) => x !== s.meal); s.meal = null; s.mealEaten = [] }
    // #2743: the naming beat — the piece that GIVES a room its name speaks.
    // Ask the room who it was before the piece lands and who it is after; a
    // wing that newly reads study/playroom pushes a `room-named` event at its
    // own doorstep. Pure derivation (the #2736 doctrine): no rng, no ledger
    // write — the beat only tells what archetypeOf already knows.
    const nbWas = (() => { const w = onWingFloor(s, r, c); return w ? archetypeOf(s, w) : null })()
    s.items.push({ uid: s.nextUid++, id: def.id, r, c })
    const nbW = onWingFloor(s, r, c)
    const nbIs = nbW ? archetypeOf(s, nbW) : null
    s.events.push({ t: 'place', r, c, id: def.id })
    if ((nbIs === 'study' || nbIs === 'playroom') && nbIs !== nbWas) {
        const nbD = wingGeom(nbW).door
        s.events.push({ t: 'room-named', r: nbD[0], c: nbD[1], kind: nbIs })
    }
    reflow(s)
    return true
}

export function placeOk(s, r, c) {
    const def = CATALOG[s.sel]
    if (!def) return false
    if (def.room) return buildRoomOk(s, wingPick(s, r, c))
    if (def.pet) return adoptOk(s)
    if (def.kid) return adoptKidOk(s)
    if (s.money < def.price || !canPlace(s, def, r, c)) return false
    if (def.solid && !keepsOpen(s, r, c)) return false
    return true
}

export function sellAt(s, r, c) {
    const it = cellItem(s, r, c)
    if (!it || it.id === 'mail' || it.id === 'paper' || it.id === 'meal' || it.id === 'bin' || it.id === 'cone') return false   // #2303/#2238/#2244/#2503: the mailbox belongs to the lot, the news to the route, the meal to the table, the bin to the kerb, the cone to the truck
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
        if (!d || d.need !== need || d.catOnly || d.binOnly || d.truckOnly) continue   // #2256: self-service never parks on the cat toy; #2303: nor on the lot's chore; #2503: nor spends the till on a treat nobody ordered
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
    // #2244: cooked beats snacking — while a plate is warm and this resident
    // hasn't had their helping, they head for the table before the generic
    // need scan (the original prioritises a home-cooked meal over the fridge).
    // #2303: the eve chore lives BELOW the need scan (see autonomous) — here
    // only the table law outranks it, and the scan and the chat always do.
    if (s.demo && s.meal && p.needs.hunger < 0.75 && p.mealTaken !== s.mealSerial) {
        const tg = targetsOf(s, s.meal)
        const path = tg.length ? bfsPath(s, { r: p.r, c: p.c }, tg) : null
        if (path) { p.path = path; p.goal = { kind: 'use', it: s.meal }; p.owner = 'ai'; return }
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
            if (t) { p.path = t.path; p.goal = { kind: 'use', it: t.it }; p.owner = 'ai'; return }
            if (n === 'social') {           // #2143: chat with whichever neighbour is around
                const nv = nearestVisitor(s)
                if (nv) {
                    const cell = nearestFreeTo(s, nv.v.r, nv.v.c)
                    if (cell) { const path = bfsPath(s, { r: p.r, c: p.c }, [cell]); if (path) { p.path = path; p.goal = { kind: 'chat', v: nv.k }; p.owner = 'ai'; return } }
                }
            }
        }
    }
    // #2303: the eve chore — while the bin waits for its morning, a resident
    // with every need in hand and nobody on the lot to talk to wheels it to
    // the curb (the lot keeps its hours). It replaces what a seeded idle
    // stroll would have spent, never a need-scan or a chat minute — the
    // WINNABLE seeds are the guard and the bot never borrows for the chore
    // either (#2240's lesson, learned again here: every earlier placement
    // that outranked the scan or the till tipped seeds 7/1234/20261023).
    if (s.demo && s.binAuto && s.binAt === 'home' && s.binSetDay !== s.day && s.hour >= SET_OUT_EARLY && s.hour <= SET_OUT_LATE
        && !hasVisitor(s) && !hasIvy(s)) {
        const bin = s.items.find((it) => it.id === 'bin')
        if (bin && cmdUse(s, p, bin)) return
    }
    // idle wander (seeded)
    // #2253: s.noWander is a test-only hold (peoplecheck). The gate below the
    // FEEL walk asserts stillness makes no sound, but the stroll roll depends
    // on the rng phase at move-in — every feature since has re-phased it, and
    // the gate has been re-lit by luck four times. Pin it.
    if (!s.noWander && s.rng() < 0.006) {
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
// #2588: the pair's own conversation — spoken when the pair-ring is warm
// enough for company, rotated on the throttle like the three-way tells.
export const NEIGH_LINES = [
    'Fern and Ivy swap market news — tomatoes, weather, and nobody\u2019s business.',
    'Ivy shows Fern a seed packet; Fern pretends to be appalled and asks for two.',
    'Fern hums a bar; Ivy finishes the tune. Both pretend that was an accident.',
]
// #2604: the quarrel, the thaw, the reunion — the pair's own weather.
export const NEIGH_SPAT_LINES = [
    'Fern and Ivy SPAT — something about the tomatoes, and years of being second.',
    'Two neighbours, one ear: the waiting minutes finally catch fire.',
    'Ivy says it plain, Fern says it back — the gate goes quiet.',
]
// #2599 handoff 2: the cold war is not silent between neighbours either — the
// pair murmur one short sour line on a long cooldown (the #2135 household beat,
// scaled to the fence). Rotated on a counter, never rng: seeded timelines hold.
export const NEIGH_SOUR_LINES = [
    'Something sour hangs over the fence; neither of them says it twice.',
    'A gate closes a little too firmly on the NEIGH street.',
    'Two waves almost happen across the lawn. Almost.',
    'The hedge between the two lots seems taller this afternoon.',
]
export const NEIGH_THAW_LINES = [
    'One gate closed, and the quarrel has nobody left to perform for.',
    'With half the pair gone home, the sour air thins off the porch.',
]
export const NEIGH_MAKEUP_LINES = [
    'Fern and Ivy meet at the gate mid-sentence — fine, FINE, it is over.',
    'A sigh, a shrug, two sprigs of rosemary: the neighbours are neighbours again.',
]
// #2672: the mediation beat — the kid or the cat breaks it up. Each mediator
// has its own voice; rotation rides a counter, never rng (the #2154 pattern).
export const NEIGH_MEDIATE_LINES = {
    pet: [
        'Miso weaves figure-eights through two pairs of ankles; neither can keep a straight face.',
        'Miso sits down fair in the middle of the argument and starts grooming. The volume drops.',
    ],
    kid: [
        'Pip grabs one hand in each and pulls — the argument loses the thread mid-sentence.',
        'A small intervention at the gate: somebody dropped a crayon, and the war is forgotten.',
    ],
}
// #2611: the circuit, beat by beat — one line per spot on the lap.
export const NEIGH_STROLL_LINES = [
    'Fern takes the gossip down to the front path — Ivy falls in at her heels.',
    'The pair strolls the east lawn, still talking; the fence keeps the private parts.',
    'Fern leads the conversation around behind the house — the back lawn earns its quiet.',
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
    // #2240: the hello re-arms per guest — chatT belongs to the company you
    // are with now, so Ivy's ring speaks even when Fern already spent the
    // crossing. Meters never relied on the bubble and keep ticking as before.
    for (const p of s.people) {
        const who = fv && fv.claim === p ? 'fern' : iv && iv.claim === p ? 'ivy' : p.chatWith
        if (who !== p.chatWith) { p.chatT = 0; p.chatWith = who }
    }
}

// ------------------------------------------------- neighbours (#2588) ------
// The third-party bond: Fern and Ivy form their own opinion of each other
// while they share the lot. Both unclaimed within the pair ring — the full
// chat. Exactly one claimed — the waiting neighbour still rides the gossip
// at glance rate, close across the room. Both hosts busy — the pair says
// nothing; attention is where the ear is. Meet-up etiquette honours #2154's
// tie law: the FIRST neighbour stays at home and the newcomer crosses the
// room — Ivy walks, Fern waits.
function freeCellNear(s, r, c) {
    for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        if (walkable(s, r + dr, c + dc)) return { r: r + dr, c: c + dc }
    }
    return null
}
// #2672: who could mediate? An awake pet or kid standing within the mediation
// ring of BOTH quarrellers. The cat is asked before the kid — Miso arrived
// first (#2197 precedes #2203), so the order is the shelf's own, not a coin.
function mediatorNear(s, fv, iv) {
    for (const m of [s.pet, s.kid]) {
        if (!m || m.asleep) continue
        const dF = Math.abs(m.r - fv.r) + Math.abs(m.c - fv.c)
        const dI = Math.abs(m.r - iv.r) + Math.abs(m.c - iv.c)
        if (dF <= NEIGH_MEDIATE_REACH && dI <= NEIGH_MEDIATE_REACH) return m
    }
    return null
}
function updateNeighbours(s, dt) {
    if (s.neighTell > 0) s.neighTell = Math.max(0, s.neighTell - dt)
    if (s.neiSpatCd > 0) s.neiSpatCd = Math.max(0, s.neiSpatCd - dt)
    const fv = hasVisitor(s) && s.visitor.state === 'hang' ? s.visitor : null
    const iv = hasIvy(s) && s.ivy.state === 'hang' ? s.ivy : null
    if (!fv || !iv) {
        // #2604: apart, nothing accumulates — and absence is the ONLY thing that
        // cools a pair grudge. While one is gone the quarrel thaws; the pay
        // waits for the reunion (no rng, mirrors the household's exit-by-absence).
        s.neiIgnore = 0
        s.neiStroll = 0   // #2611: and absence resets the walk — a new visit starts at the gate
        if (s.neiGrudge) {
            s.neiGrudge = 0
            s.neiMending = 1
            think(s, pick(s, NEIGH_THAW_LINES))
        }
        return
    }
    if (iv.neighT > 0) iv.neighT = Math.max(0, iv.neighT - dt)
    const d = Math.abs(fv.r - iv.r) + Math.abs(fv.c - iv.c)
    // #2604 cold war: proximity builds NOTHING — no chat, no glance, no meet-up
    // walk. The household doctrine verbatim; the pair stand where they stand.
    // #2599 handoff 2: silence gets one crack in it — a sour murmur on a long
    // cooldown (the #2135 household beat, scaled). Lines and a clock only: the
    // murmur builds nothing, pays nothing, and never rides the hash.
    if (s.neiGrudge) {
        // #2672 THE KID BROKE IT UP: before the murmur, before the absence — if an
        // awake mediator stands between the pair, the cold war cracks here and now.
        // The pair drops into #2604's mending lane (so the reunion still pays), and
        // a soft warmth lands at once. Once per spat; the offence itself stands.
        if (!s.neiMediated) {
            const med = mediatorNear(s, fv, iv)
            if (med) {
                s.neiMediated = 1
                s.neiGrudge = 0
                s.neiMending = 1
                relAdd(s, 'neigh', NEIGH_MEDIATE_PAY)
                s.events.push({ t: 'mediate', who: 'neigh', med: med === s.pet ? 'pet' : 'kid', x: (fv.x + iv.x) / 2, y: (fv.y + iv.y) / 2 })
                think(s, NEIGH_MEDIATE_LINES[med === s.pet ? 'pet' : 'kid'][s.neiMeds++ % 2])
                return
            }
        }
        if (s.neiMurmurCd <= 0) {
            s.neiMurmurCd = NEIGH_MURMUR_CD
            think(s, NEIGH_SOUR_LINES[s.neiMurrs++ % NEIGH_SOUR_LINES.length])   // rotation, not rng (#2154 pattern) — seeded timelines hold
            s.events.push({ t: 'grudge-cool', who: 'neigh', x: (fv.x + iv.x) / 2, y: (fv.y + iv.y) / 2 })
        } else s.neiMurmurCd -= dt
        return
    }
    if (s.neiMending && !fv.claim && !iv.claim && d <= NEIGH_REACH) {
        // #2604: the thaw pays at the first unclaimed moment back in the ring —
        // softest on the panel, and no content: the win economy is the household's.
        s.neiMending = 0
        relAdd(s, 'neigh', NEIGH_MAKEUP)
        s.events.push({ t: 'makeup', who: 'neigh', x: (fv.x + iv.x) / 2, y: (fv.y + iv.y) / 2 })
        think(s, pick(s, NEIGH_MAKEUP_LINES))
        return
    }
    if (!fv.claim && !iv.claim) {
        s.neiIgnore = 0   // nobody waits: together they talk, apart they walk
        if (d > NEIGH_REACH) {
            // the meet-up: nobody to talk to, so the newcomer crosses the room
            if (!iv.path && iv.neighT <= 0) {
                const spot = freeCellNear(s, fv.r, fv.c)
                if (spot) iv.path = bfsPath(s, { r: iv.r, c: iv.c }, [spot])
                iv.neighT = NEIGH_MEET_CD
            }
            return
        }
        // #2611 NEIGH STROLL: a conversation worth having is a conversation worth
        // walking — after long enough together the pair takes the lot. Fern leads
        // (this is HER street) to the next fixed circuit spot; Ivy follows the host
        // to a free cell beside it — the #2588 etiquette, Ivy's legs doing the
        // crossing. Only mobile chat banks the walk (a mid-stride conversation never
        // queues another), and the chat law itself stays #2588's: proximity pays.
        // Claims and meet distance carry the bank; a spat or an absence zeroes it.
        // Rotation is a counter, never rng.
        if (!fv.path && !iv.path) {
            s.neiStroll += dt
            if (s.neiStroll >= NEIGH_STROLL_T) {
                s.neiStroll = 0
                const idx = s.neiWalk
                s.neiWalk = (s.neiWalk + 1) % NEIGH_SPOTS.length
                const spot = NEIGH_SPOTS[idx]
                const dest = walkable(s, spot.r, spot.c) ? spot : nearestFreeTo(s, spot.r, spot.c)
                const fpath = dest ? bfsPath(s, { r: fv.r, c: fv.c }, [dest]) : null
                if (fpath) {
                    fv.path = fpath
                    const near = freeCellNear(s, dest.r, dest.c) || dest
                    const ipath = bfsPath(s, { r: iv.r, c: iv.c }, [near])
                    if (ipath) iv.path = ipath
                    s.events.push({ t: 'neigh-stroll', i: idx, x: (fv.x + iv.x) / 2, y: (fv.y + iv.y) / 2 })
                    think(s, NEIGH_STROLL_LINES[idx])
                }
            }
        }
        relAdd(s, 'neigh', NEIGH_CHAT * dt)
        if (relLevel(s.rel.neigh) >= NEIGH_WARM_AT && s.neighTell <= 0) {
            s.neighHits += 1                             // lines rotate, cleanly (#2154 pattern)
            think(s, NEIGH_LINES[s.neighHits % NEIGH_LINES.length])
            s.events.push({ t: 'neigh', x: (fv.x + iv.x) / 2, y: (fv.y + iv.y) / 2 })
            s.neighTell = NEIGH_COOL_CD
        }
        return
    }
    if (fv.claim === null ? iv.claim !== null : iv.claim === null) {
        if (d <= NEIGH_GLANCE_REACH) {
            relAdd(s, 'neigh', NEIGH_GLANCE * dt)   // gossip carries further than walk-talk
            // #2604: but gossip is not being HEARD. Watched-but-unheard minutes
            // sour, and a long enough stretch of them cracks the pair.
            s.neiIgnore += dt
            if (s.neiIgnore >= NEIGH_IGNORE_T && s.neiSpatCd <= 0) {
                s.neiIgnore = 0
                s.neiStroll = 0   // #2611: the walk dies with the quarrel
                s.neiSpatCd = NEIGH_SPAT_CD
                s.neiGrudge = 1
                s.neiMediated = 0   // #2672: a fresh spat earns a fresh chance at mediation
                s.neiMurmurCd = GRUDGE_FIRST_CD   // #2599 handoff 2: the first sour murmur comes after the crack, not on top of it (#2135 mirror)
                s.neiSpats += 1
                relSub(s, 'neigh', NEIGH_SPAT_DROP)
                s.events.push({ t: 'spat', who: 'neigh', x: (fv.x + iv.x) / 2, y: (fv.y + iv.y) / 2 })
                think(s, pick(s, NEIGH_SPAT_LINES))
            }
        } else s.neiIgnore = 0   // out of gossip reach — distance is not neglect
        return
    }
    s.neiIgnore = 0   // both have an ear — nobody is watching
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

// ------------------------------------------------------------- meal bells ------
// #2244: the day/night clause's second citizen. Three bells a day set a warm
// plate beside the kitchen — breakfast, lunch, dinner — on schedule, with
// nobody home or not (the paper route's law, at the table). One plate per
// bell: the day+serial stamps are the law; a bell missed because the kitchen
// was blocked or the hour ran out is skipped honestly, never banked. The
// table is where the clause pays socially: when both residents have eaten
// the SAME plate the household sat down together — social, bond, hearts.
function updateMeals(s) {
    if (s.meal) {
        if (s.hour >= s.mealAt + MEAL_WINDOW) {
            const it = s.meal
            s.items = s.items.filter((x) => x !== it)
            s.meal = null
            s.mealEaten = []
            s.events.push({ t: 'meal-cold', name: s.mealName, r: it.r, c: it.c })
            think(s, pick(s, MEAL_COLD_LINES))
        }
        return
    }
    // skipped bells: a bell whose late bound passed is gone (never re-rung
    // late into the day, never banked for tomorrow)
    while (s.mealSlot < 3 && s.hour >= s.mealAfter[s.mealSlot] + MEAL_WINDOW) s.mealSlot++
    if (s.mealSlot >= 3 || s.hour < s.mealAfter[s.mealSlot]) return
    const kitchen = s.items.find((it) => it.id === 'stove') || s.items.find((it) => it.id === 'fridge')
    if (!kitchen) { s.mealSlot++; return }   // no kitchen, no cooked meal — honestly skipped
    const spot = targetsOf(s, kitchen)[0] || nearestFreeTo(s, kitchen.r, kitchen.c)
    if (!spot) return   // every approach blocked — retry inside the window rather than wall the law into a silent skip
    const slot = s.mealSlot
    const it = { uid: s.nextUid++, id: 'meal', r: spot.r, c: spot.c }
    s.items.push(it)
    s.meal = it
    s.mealDay = s.day
    s.mealSlot = slot + 1
    s.mealSerial++
    s.mealEaten = []
    s.mealAt = s.hour
    s.mealName = MEAL_NAMES[slot]
    s.events.push({ t: 'meal', slot, name: s.mealName, r: spot.r, c: spot.c })
    think(s, pick(s, MEAL_LINES))
}

// ------------------------------------------------------- garbage day ------
// #2303: the clause's third citizen. Two beats on the world clock: the eve
// arms the chore (announce once, seed the dawn hour), and dawn resolves the
// cycle — COLLECTED if the bin stands at the curb, honestly SKIPPED if it
// never made it. The truck never waits and the day is never banked: a missed
// set-out costs the whole cycle, the same way a cold plate costs the meal.
function updateBin(s) {
    if (s.day === s.collectionDay) {
        if (s.hour < s.truckHour) return
        if (s.binAt === 'curb') {
            s.binAt = 'home'
            const it = s.items.find((x) => x.id === 'bin')
            if (it) { it.r = BIN_HOME.r; it.c = BIN_HOME.c }
            s.binAuto = false
            s.collections++
            for (const q of s.people) q.needs.fun = Math.min(1, q.needs.fun + BIN_FUN)
            relAdd(s, 'house', BIN_BOND)
            s.content = Math.min(WIN_CONTENT, s.content + 1)
            s.events.push({ t: 'garbage-collected', x: tileX(BIN_CURB.c) + TILE / 2, y: tileY(BIN_CURB.r) + TILE / 2 })
            think(s, BIN_PICK_LINES[s.collections % BIN_PICK_LINES.length])
        } else {
            s.skips++
            s.binAuto = false
            s.events.push({ t: 'garbage-skipped', r: BIN_CURB.r, c: BIN_CURB.c })
            think(s, BIN_SKIP_LINES[s.skips % BIN_SKIP_LINES.length])
        }
        s.collectionDay += GARBAGE_EVERY
        return
    }
    // the eve: one announcement, one dawn hour, once per cycle. Both the hour
    // and the wording are arithmetic, never s.rng — the truck must not re-phase
    // the seeded autopilot's stream (the #2240 lesson: WINNABLE seeds win by a
    // hair, and an extra rng draw per cycle moves every roll after it).
    if (binEve(s) && !s.binAuto && s.binSetDay !== s.day && s.hour >= SET_OUT_EARLY && s.hour <= SET_OUT_LATE) {
        s.truckHour = TRUCK_DUE[0] + ((Math.imul(s.collectionDay, 2654435761) >>> 9) % 200) / 100
        s.binAuto = true
        s.events.push({ t: 'bin-eve', r: BIN_HOME.r, c: BIN_HOME.c })
        think(s, BIN_EVE_LINES[s.collectionDay % BIN_EVE_LINES.length])
    }
}

// ---------------------------------------------------- ice cream truck (#2503) --
// The clause's fourth citizen: two beats on the world clock, no rng anywhere
// on the schedule. A cone lands when the pass hour comes; whoever reaches it
// while the truck idles pays for it; the window closes and the rest of the
// tray goes home with the truck.
function updateIceCream(s) {
    if (s.cone) {
        if (s.hour >= s.iceAt + ICE_WINDOW) {
            const it = s.cone
            s.items = s.items.filter((x) => x !== it)
            s.cone = null
            s.events.push({ t: 'ice-gone', r: it.r, c: it.c })
            think(s, ICE_GONE_LINES[s.iceSerial % ICE_GONE_LINES.length])
        }
        return
    }
    // one truck a day — the day stamp is the law (the paper doctrine); a stop
    // whose approaches were blocked retries inside the window rather than wall
    // the law into a silent skip, and a window that ran out is gone honestly,
    // never banked for tomorrow.
    const due = s.iceNow !== null ? s.iceNow : icePassHour(s.day)
    if (s.iceDay === s.day || s.hour < due || s.hour >= due + ICE_WINDOW) return
    const curb = { r: 12, c: 4 }     // the curb by the gate — the truck's pull-in spot
    const spot = walkable(s, curb.r, curb.c) ? curb : nearestFreeTo(s, curb.r, curb.c)
    if (!spot) return
    const it = { uid: s.nextUid++, id: 'cone', r: spot.r, c: spot.c }
    s.items.push(it)
    s.cone = it
    s.iceDay = s.day
    s.iceSerial++
    s.iceAt = s.hour
    s.iceNow = null
    s.events.push({ t: 'ice-truck', r: spot.r, c: spot.c })
    think(s, ICE_ARRIVE_LINES[s.iceDay % ICE_ARRIVE_LINES.length])
}

// scenario setup (the ringMeal/ringIvy pattern): retire whatever cone stands
// and open a stop right now. Harness and F1 cheat only — the clock's own law
// above never reads it.
export function ringTruck(s) {
    if (s.cone) { s.items = s.items.filter((x) => x !== s.cone); s.cone = null }
    s.iceDay = Math.min(s.iceDay, s.day - 1)   // today's stop (if any) is retired — the law may land again
    s.iceNow = Math.max(0, s.hour - 0.01)
    return 'the jingle is due — a cone hits the curb'
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
                    metCat: false,   // #2200: the greeting re-arms with every visit
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
            // #2588: cross-warmth — a neighbour at peace with the other guest
            // chats deeper with the house (friend of my friend, ×1.25).
            if (relLevel(s.rel.neigh) >= NEIGH_WARM_AT) relAdd(s, 'fern', 0.07 * (NEIGH_WARM - 1) * dt)
            // #2135: the crossing check read 0.06·dt (the social rate, a typo) —
            // with a fixed dt the line NEVER fired. Ivy's law was the honest one.
            if (partner.chatT > 2.4 && partner.chatT - dt <= 2.4) {
                think(s, chatLine(s, partner))
                s.events.push({ t: 'chat', k: 'fern', x: (v.x + partner.x) / 2, y: (v.y + partner.y) / 2 })   // #2135: the bubble rides over the pair
            }
        }
        meetCat(s, v, 'fern')   // #2200: the cat on the lot is not furniture
        if (s.hour > 19 || v.t > v.hangUntil) { v.state = 'leaving'; v.path = bfsPath(s, { r: v.r, c: v.c }, [{ r: 12, c: 5 }]) }
    } else if (v.state === 'leaving' && !v.path) {
        s.visitor = null
        s.events.push({ t: 'visit-end' })
        scheduleVisit(s)
        return
    }
    // if furniture changed around them, re-home toward the living room
    // (#2588: not while the pair hang out — company beats the sofa; the
    // newcomers' visit is the destination when nobody needs an ear.)
    if (v.state === 'hang' && !v.path && !partnerNear(s, v) && !v.repathT &&
        !(s.ivy && s.ivy.state === 'hang' && !s.ivy.claim && !v.claim)) {
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

// #2200: the greeting law — a hanging visitor who stands within the cat's
// reach says hello to the cat ONCE per visit: a tiny bond bump (the ladder
// still climbs by talking, this is a nod), a thought line that warms with the
// level, and an event the shell voices. No rng — every seed stays exact.
function meetCat(s, v, key) {
    const p = s.pet
    if (!p || v.metCat) return
    if (Math.abs(v.r - p.r) + Math.abs(v.c - p.c) > CAT_MEET_DIST) return
    v.metCat = true
    const lv = Math.min(2, relLevel(s.rel[key]))
    relAdd(s, key, CAT_MEET_BOND)
    s.events.push({ t: 'cat-meet', name: v.name, x: (v.x + p.x) / 2, y: (v.y + p.y) / 2 })
    think(s, CAT_MEET_LINES[lv].replace('{n}', v.name))
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
                    gift, metCat: false,   // #2200: the greeting re-arms with every visit
                    honey: lv >= 3,       // #2240: FAMILY is decided at the door — the meter can drift below the edge mid-walk
                    neighT: 0,            // #2588: meet-up walk retry throttle
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
    // #2240: the gift lands. When the basket-carrier arrives at her kitchen
    // destination, the basket gets PHYSICALLY set down — cell priority fridge →
    // stove → front step → her own cell — with a soft set-down thunk (distinct
    // from the arrival ring, which already rang at the gate). The honey jar
    // rides the FAMILY tier. View-only staging; nothing here re-pays hunger.
    if (v.state === 'hang' && v.gift && !v.landed) {
        v.landed = true
        const pantry = s.items.find((it) => it.id === 'fridge') || s.items.find((it) => it.id === 'stove')
        let spot = pantry ? (targetsOf(s, pantry).find((t) => walkable(s, t.r, t.c)) || nearestFreeTo(s, pantry.r, pantry.c)) : null
        if (!spot && walkable(s, 10, 5)) spot = { r: 10, c: 5 }
        if (!spot) spot = { r: v.r, c: v.c }
        s.giftFx = GIFT_LAND_T
        s.giftAt = { x: LOT_X + spot.c * TILE + TILE / 2, y: LOT_Y + spot.r * TILE + TILE / 2 }
        s.giftHoney = !!v.honey
        s.events.push({ t: 'gift-land', x: s.giftAt.x, y: s.giftAt.y, honey: s.giftHoney })
    }
    if (v.state === 'hang') {
        // chat on the #2154 choreography law — nearest resident, contested
        // residents pay the closer visitor; claim settles once per tick.
        const partner = v.claim || null
        if (partner) {
            partner.chatT += dt
            v.chatT += dt
            partner.needs.social = Math.min(1, partner.needs.social + IVY_SOCIAL * dt)
            relAdd(s, 'ivy', IVY_CHAT * dt)   // a slower burner than Fern, by design
            if (relLevel(s.rel.neigh) >= NEIGH_WARM_AT) relAdd(s, 'ivy', IVY_CHAT * (NEIGH_WARM - 1) * dt)   // #2588: cross-warmth, same law as Fern's block
            // #2240: a resident's bubble re-arms EVERY visit (the lifetime
            // crossing below belongs to Fern whenever she came first, which
            // left Ivy's ring silent however long they hung). Resetting the
            // clock for the visitor switch keeps the honest dt check (#2135)
            // and gives each guest their own hello; the meters never cared.
            if (partner.chatT > 2.4 && partner.chatT - dt <= 2.4) {
                think(s, chatLine(s, partner, 'ivy'))
                s.events.push({ t: 'chat', k: 'ivy', x: (v.x + partner.x) / 2, y: (v.y + partner.y) / 2 })   // #2135
            }
        }
        meetCat(s, v, 'ivy')   // #2200: the gardener has a favourite ankle
        if (s.hour > 19 || v.t > v.hangUntil) { v.state = 'leaving'; v.path = bfsPath(s, { r: v.r, c: v.c }, [{ r: 12, c: 5 }]) }
    } else if (v.state === 'leaving' && !v.path) {
        s.ivy = null
        s.events.push({ t: 'visit-end', who: 'ivy' })
        scheduleIvy(s)
        return
    }
    // if furniture changed around them, re-home toward the kitchen
    if (v.state === 'hang' && !v.path && !partnerNear(s, v) && !v.repathT &&
        !(s.visitor && s.visitor.state === 'hang' && !s.visitor.claim && !v.claim)) v.repathT = 3   // #2588: company beats the stove
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

// #2200: the panel's paw row reads her MOOD, not a ladder — the average of
// the three cat needs, 0..1. Pure, so peoplecheck can pin it; art maps it to
// four pips and the red alarm.
export function petMood(s) {
    const p = s.pet
    if (!p) return null
    return Math.max(0, Math.min(1, (p.needs.hunger + p.needs.fun + p.needs.energy) / 3))
}

export function adoptPet(s) {
    if (!adoptOk(s)) return false
    s.money -= PET.price
    const dest = nearestFloorCell(s, 6, 7)
    s.pet = {
        name: PET.name, r: 12, c: 5, x: tileX(5) + TILE / 2, y: tileY(12) + TILE / 2,
        path: bfsPath(s, { r: 12, c: 5 }, [dest]), state: 'enter', t: 0, face: 1, walkPhase: 0,
        needs: { hunger: 0.8, fun: 0.75, energy: 0.85 },
        asleep: false, cd: 0, purrT: 0, wanderT: 2, food: false, bedT: 0, stepDist: 0, feedT: 0, play: false, playT: 0, sitT: 0, stretchT: 0,
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
    if (p.feedT > 0) p.feedT = Math.max(0, p.feedT - dt)   // #2200: the bowl fades on the world clock
    if (p.playT > 0) p.playT = Math.max(0, p.playT - dt)   // #2256: the bat-spin fades the same way
    if (p.stretchT > 0) p.stretchT = Math.max(0, p.stretchT - dt)
    // #2256 sprite states (view-only): settled cats sit; walking cats reset.
    if (!p.path && !p.play && !p.asleep && !p.food) p.sitT = Math.min(4, p.sitT + dt)
    else p.sitT = 0
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
        if (!night) { p.asleep = false; p.state = 'roam'; p.stretchT = 0.9; think(s, 'Miso unspools at dawn and stretches down the whole hallway.'); return }
        return
    }
    // #2532: while the prowl is live the prowl owns her feet — the loaf waits
    // for midnight (finishProwl sets her roaming again and this branch beds her).
    if (night && s.prowl) return
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
        p.feedT = PET_FEED_T   // #2200: the kibble moment paints a bowl + crumbs
        s.events.push({ t: 'pet-eat', name: p.name, x: p.x, y: p.y })
        think(s, 'Miso works the fridge latch like a puzzle toy. Kibble: acquired.')
    }
    // #2256 yarn law: a bored cat hunts the ball herself — the toy earns its
    // keep even when nobody orders the play (mirrors the kibble law above).
    if (!p.food && !p.play && p.needs.fun < PET_BORED) {
        const y = findNearest(s, p, 'yarn')
        if (y) {
            const path = bfsPath(s, { r: p.r, c: p.c }, y.tg)
            if (path) { p.path = path; p.play = true; p.state = 'play' }
        }
    }
    if (p.play && !p.path) {
        p.play = false
        p.needs.fun = Math.min(1, p.needs.fun + PET_SELF_FUN)
        p.state = 'roam'
        p.playT = YARN_PLAY_T
        s.events.push({ t: 'pet-play', name: p.name, x: p.x, y: p.y, self: true })
        think(s, pick(s, PET_PLAY_LINES))
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
        asleep: false, cd: 0, giggleT: 0, cryT: 0, wanderT: 2, food: false, playObj: false, treat: false, bedT: 0, stepDist: 0,
        coneHold: 0, coneDrips: 0,   // #2508 item 3: the eat beat — view-only, off the hash
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
        if (!d || d.need !== 'fun' || d.catOnly || d.binOnly || d.truckOnly) continue   // #2256: Pip doesn't play with the cat's ball; #2303: nor wheels anyone's bin; #2503: the treat gets its own chase-law below, with money in hand
        const tg = targetsOf(s, it)
        if (!tg.length) continue
        const dist = Math.min(...tg.map((t) => Math.abs(t.r - k.r) + Math.abs(t.c - k.c)))
        // #2736: the playroom pull — a TV or radio standing IN a room is the
        // rec room of the original: the child crosses the lot for it while
        // nearer house things wait. A 1000-point pull outranks any distance
        // the map can offer; only toys count, a study's book is for grown-ups.
        const pull = s.ext && (it.id === 'tv' || it.id === 'radio') && onWingFloor(s, it.r, it.c) ? 1000 : 0
        if (dist - pull < bd) { bd = dist - pull; best = { it, tg } }
    }
    return best
}

function updateKid(s, dt) {
    const k = s.kid
    if (!k) return
    k.t += dt
    if (k.cd > 0) k.cd = Math.max(0, k.cd - dt)
    if (k.giggleT > 0) k.giggleT = Math.max(0, k.giggleT - dt)
    holdConeTick(s, k, dt)   // #2508 item 3: the cone in her hand melts on the world clock
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
    if (!k.food && !k.treat && k.needs.hunger < 0.3) {
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
    // #2503 the ice-cream law: while the truck idles, the till can pay, and
    // joy has not yet overflowed, the child runs to the curb BEFORE the toy
    // box (the original's kids drop everything for the jingle). The arrival
    // pays from the till; a cone that got eaten first or a till gone short
    // mid-walk refuses at the curb — the wasted steps are the cost, the same
    // doctrine as the adult's walk. One kid-serving per cone: the treats
    // ledger counts every cone the street ever sold.
    if (!k.food && !k.playObj && !k.treat && s.cone && s.money >= CONE_PRICE && k.needs.fun < KID_ICE_FLOOR) {
        const tg = targetsOf(s, s.cone)
        if (tg.length) {
            const path = bfsPath(s, { r: k.r, c: k.c }, tg)
            if (path) { k.path = path; k.treat = true; k.state = 'treat' }
        }
    }
    if (k.treat && !k.path) {
        k.treat = false
        const it = s.cone
        if (it && s.money >= CONE_PRICE) {
            s.money -= CONE_PRICE
            k.needs.fun = Math.min(1, k.needs.fun + ICE_KID_FUN)
            s.treats++
            s.items = s.items.filter((x) => x !== it)
            s.cone = null
            k.giggleT = 1.4
            k.coneHold = ICE_HOLD_T; k.coneDrips = 0   // #2508 item 3: the kid's cone rides home in her hand too — same view-only beat
            s.events.push({ t: 'kid-ice', name: k.name, x: k.x, y: k.y })
            think(s, ICE_KID_LINES[s.treats % ICE_KID_LINES.length].replace('{k}', k.name))
        } else {
            s.events.push({ t: 'refuse', r: k.r, c: k.c })
            think(s, (it ? ICE_BROKE_LINES : ICE_OUT_LINES)[s.iceSerial % 2])   // arithmetic pick — the clock's own paths never draw rng (#2303's lesson)
        }
    }
    // play: a bored child hunts the fun objects — the kid's own need loop
    if (!k.playObj && !k.food && !k.treat && k.needs.fun < 0.3) {
        const ft = funTarget(s, k)
        if (ft) {
            const path = bfsPath(s, { r: k.r, c: k.c }, ft.tg)
            if (path) { k.path = path; k.playObj = true; k.playIt = ft.it; k.state = 'play' }   // #2736: the errand remembers WHICH toy it walked to
        }
    }
    if (k.playObj && !k.path) {
        k.playObj = false
        const toy = k.playIt
        k.playIt = null
        k.needs.fun = Math.min(1, k.needs.fun + 0.45)
        k.state = 'roam'
        k.giggleT = 1.4
        s.events.push({ t: 'kid-play', name: k.name, x: k.x, y: k.y })
        think(s, pick(s, KID_PLAY_LINES))
        // #2736: the playroom pays. Fun finished at a TV or radio standing ON
        // the room's own floorboards counts as a play for the room; every
        // third play is a delight — extra giggles, a deeper kid bond, one
        // house pride. A toy sold or carried off mid-walk leaves the room
        // unpaid (the errand was honest; the room just wasn't there) — the
        // same walk-cost doctrine as the adult's.
        if (s.ext && toy && s.items.includes(toy) && (toy.id === 'tv' || toy.id === 'radio')) {
            const w = onWingFloor(s, toy.r, toy.c)
            if (w) {
                w.plays = (w.plays || 0) + 1
                if (w.plays >= PLAYS_DELIGHT) {
                    w.plays = 0
                    w.delights = (w.delights || 0) + 1
                    k.needs.fun = Math.min(1, k.needs.fun + KID_ROOM_FUN)
                    relAdd(s, 'kid', KID_ROOM_BOND)
                    s.content = Math.min(WIN_CONTENT, s.content + 1)
                    k.giggleT = 1.6
                    s.events.push({ t: 'kid-laugh', name: k.name, x: k.x, y: k.y, room: archetypeOf(s, w) || 'playroom' })   // #2743: the banner names the room that paid
                    think(s, pick(s, ROOM_LAUGH_LINES).replace('{n}', k.name))
                }
            }
        }
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
    const nightSleep = !!p.use.night   // #2695: the lodging law asks whether the night was spent here
    // #2244: one helping per bell — the plate this resident already ate (or a
    // phantom whose plate went cold, shared away or rotted out from under the
    // walk) feeds nothing; the wasted steps are the cost, the stamp is the law.
    if (def.id === 'meal' && (s.meal !== it || p.mealTaken === s.mealSerial)) { p.use = null; return }
    // #2303: the set-out. The walk to the bin ends in the chore while the eve
    // still stands — the bin rolls to the curb and waits for dawn. A bin that
    // already made the trip (or left season) refuses at the cell: the wasted
    // walk is the cost, the stamp is the law (the meal-serial doctrine, at
    // the kerb). No content here — the payoff lands at the truck, honest size.
    if (def.id === 'bin') {
        p.use = null
        if (s.binAt === 'curb' || s.binSetDay === s.day) {
            s.events.push({ t: 'refuse', r: it.r, c: it.c })
            think(s, pick(s, BIN_OUT_LINES))
            return
        }
        p.needs.social = Math.min(1, p.needs.social + BIN_SET_SOCIAL)
        s.binAt = 'curb'
        it.r = BIN_CURB.r; it.c = BIN_CURB.c
        s.binSetDay = s.day
        s.binAuto = false
        s.events.push({ t: 'bin-out', name: p.name, r: BIN_CURB.r, c: BIN_CURB.c })
        think(s, BIN_SET_LINES[s.binSetDay % BIN_SET_LINES.length].replace('{p}', p.name))
        return
    }
    // #2503: the walk to the curb ends in the buy while the truck still idles
    // and the till can pay — money leaves the till, fun lands, and the cone
    // leaves the street with the sale: one serving per stop, whoever reaches
    // first eats it (the wasted walk is the cost, the gone item is the law —
    // the meal-serial doctrine at ice-cream scale). No content on the way:
    // the win economy is untouched; the joy is the fun bar and the heart.
    if (def.id === 'cone') {
        p.use = null
        if (s.cone !== it) {
            s.events.push({ t: 'refuse', r: it.r, c: it.c })
            think(s, pick(s, ICE_OUT_LINES))
            return
        }
        if (s.money < CONE_PRICE) {
            s.events.push({ t: 'refuse', r: it.r, c: it.c })
            think(s, pick(s, ICE_BROKE_LINES))
            return
        }
        s.money -= CONE_PRICE
        p.needs.fun = Math.min(1, p.needs.fun + ICE_FUN)
        s.treats++
        s.items = s.items.filter((x) => x !== it)
        s.cone = null
        s.events.push({ t: 'ice-cream', name: p.name, x: tileX(it.c) + TILE / 2, y: tileY(it.r) + TILE / 2 })
        p.coneHold = ICE_HOLD_T; p.coneDrips = 0   // #2508 item 3: the cone leaves the street IN HIS HAND — the eat beat starts at the curb
        think(s, pick(s, ICE_SAVOR_LINES).replace('{n}', p.name))
        return
    }
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
    // #2695: the lodging law. A bed that stands INSIDE the Spare Room and
    // carried a resident through the night pays a rested joy at waking —
    // the room earning its keep, distinct from the canopy's deeper sleep
    // (that law owns the energy curve; this one owns the morning's spirits
    // and the room's tally). One lodging counts per night, whoever wakes
    // in it — the day stamp is the law, the fun lands for every waker.
    if (def.sleep && nightSleep && s.ext) {
        for (const w of s.wings) {
            if (w.id !== 'east') continue
            if (!wingSets(wingGeom(w)).floor.has(`${it.r},${it.c}`)) continue
            p.needs.fun = Math.min(1, p.needs.fun + LODGE_FUN)
            if (w.lodgeDay !== s.day) { w.lodgeDay = s.day; w.sleptWell = (w.sleptWell || 0) + 1 }
            s.events.push({ t: 'lodged', name: p.name })
            think(s, pick(s, LODGE_LINES).replace('{p}', p.name))
            break
        }
    }
    // #2736: the study law. A read that ENDS in a room carrying its own
    // bookshelf turns a page ON THE ROOM; every third page is an insight —
    // the reader surfaces lighter, the house takes the quiet pride. The
    // question is the furniture's standing cell, never who read or where
    // the walk started: a living-room bookshelf stays a plain bookshelf.
    if (def.id === 'book' && s.ext) {
        const w = onWingFloor(s, it.r, it.c)
        if (w) {
            w.pages = (w.pages || 0) + 1
            if (w.pages >= PAGES_INSIGHT) {
                w.pages = 0
                w.insights = (w.insights || 0) + 1
                p.needs.fun = Math.min(1, p.needs.fun + READ_INSIGHT_FUN)
                s.content = Math.min(WIN_CONTENT, s.content + 1)
                s.events.push({ t: 'studied', name: p.name, r: it.r, c: it.c, room: archetypeOf(s, w) || 'study' })   // #2743: the banner names the room that paid
                think(s, pick(s, STUDY_LINES).replace('{p}', p.name))
            }
        }
    }
    // #2244: the table law. A plate is claimed by the household, not by one
    // stomach — when EVERY resident has eaten the same plate they sat down
    // together: social all round, the house bond climbs, one contentment,
    // hearts. Once per plate (the eaten list is the law).
    // #2264: the hearts anchor over the EATER CLUSTER — where the residents
    // actually stood the moment the last fork landed — not over the kitchen,
    // so the law is seen, not just felt (the #2076 pair-tell doctrine).
    if (def.id === 'meal' && s.meal === it) {
        p.mealTaken = s.mealSerial
        if (!s.mealEaten.includes(p)) s.mealEaten.push(p)
        if (s.mealEaten.length >= s.people.length) {
            for (const q of s.people) q.needs.social = Math.min(1, q.needs.social + MEAL_SOCIAL)
            relAdd(s, 'house', MEAL_BOND)
            s.content = Math.min(WIN_CONTENT, s.content + 1)
            let cx = 0, cy = 0
            for (const q of s.mealEaten) { cx += q.x; cy += q.y }
            cx /= s.mealEaten.length; cy /= s.mealEaten.length
            s.events.push({ t: 'meal-shared', name: s.mealName, serial: s.mealSerial, x: cx, y: cy })   // #2264: serial picks the chord variant
            think(s, pick(s, SHARED_MEAL_LINES).replace(/\{m\}/g, s.mealName.toLowerCase()))
            s.items = s.items.filter((x) => x !== it)
            s.meal = null
            s.mealEaten = []
        }
    }
    // #2256: the ordered play. The walk to the ball ends in a session while
    // Miso answers within YARN_REACH — both are paid, the bond climbs, the
    // ball spins (item + cat staging is view-only, like feedT). A cat that
    // wandered off, slept, or lost the cooldown slot makes the offer refuse —
    // the ball's own fun already paid is the consolation.
    if (def.id === 'yarn') {
        const cat = s.pet
        const near = cat && !cat.asleep && s.yarnCd === 0 && Math.abs(cat.r - p.r) + Math.abs(cat.c - p.c) <= YARN_REACH
        if (near) {
            cat.needs.fun = Math.min(1, cat.needs.fun + YARN_CAT_FUN)
            p.needs.social = Math.min(1, p.needs.social + YARN_SOCIAL)
            relAdd(s, 'house', YARN_BOND)
            s.content = Math.min(WIN_CONTENT, s.content + 1)
            s.yarnCd = YARN_CD
            it.playT = YARN_PLAY_T
            cat.playT = YARN_PLAY_T
            cat.play = false
            const cells = []
            for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const rr = p.r + dr, cc = p.c + dc
                if (walkable(s, rr, cc)) cells.push({ r: rr, c: cc })
            }
            const cpath = bfsPath(s, { r: cat.r, c: cat.c }, cells)
            if (cpath && cpath.length) { cat.path = cpath; cat.state = 'play'; cat.food = false }
            s.events.push({ t: 'pet-play', name: p.name, x: tileX(it.c) + TILE / 2, y: tileY(it.r) + TILE / 2 })
            think(s, pick(s, YARN_LINES).replace('{n}', p.name))
        } else {
            s.events.push({ t: 'refuse', r: it.r, c: it.c })
            think(s, cat ? pick(s, YARN_LOST_LINES) : pick(s, YARN_NOCAT_LINES))
        }
    }
}

// -------------------------------------------------------------- work ------
function startWork(s, p) {
    p.working = true
    p.workedToday = true
    p.queue.length = 0   // #2470: off the lot for eight hours — the list goes with the commuter
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
    if (def.id === 'canopy') return pick(s, [`${p.name} sleeps under the canopy — deep, dark, wonderful.`, `${p.name} wakes slow; the canopy kept the morning out.`, `${p.name} comes down from the wing stretched and grinning.`])
    if (def.sleep) return pick(s, [`${p.name} sleeps like a log.`, `${p.name} dreamed about flying.`])
    if (def.id === 'mail') return ''
    if (def.id === 'paper') return pick(s, [`${p.name} reads the funny pages, front to back.`, `${p.name} does the crossword in two minutes flat.`, `${p.name} folds the paper with the comics left out.`])
    if (def.id === 'meal') return pick(s, [`${p.name} eats every bite, fingers and all.`, `${p.name} licks the plate — the bells outdid themselves.`, `${p.name} sits down and gets up slower and happier.`])
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
        const sleeping = !!(p.use && p.use.def.sleep)
        for (const n of NEEDS) {
            if (sleeping) {
                if (n === 'energy') p.needs.energy = Math.min(1, p.needs.energy + 0.13)
                continue
            }
            let d = DECAY[n]
            if (night) d *= 0.5
            if (n === 'energy' && night) d = NIGHT_ENERGY
            // #2253: the learning window — day 1's morning (move-in is 07:00)
            // decays half pace, enough minutes to learn the taps. It stops at
            // noon so the afternoon/x8 work clock runs on the normal law: a
            // whole-day halving re-phases the seeded autopilot's day and can
            // strand an evening without errands (seed 20261023 lost its wish).
            if (s.day === 1 && s.hour < 12) d *= DAY1_GRACE
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
    relSub(s, 'neigh', NEIGH_FADE) // #2588: the softest bond of all — a shared afternoon is never far away
}
function newDay(s) {
    for (const p of s.people) p.workedToday = false
    // #2238: yesterday's news rots — the stale edition goes out before the
    // fresh route is due, so the step never stacks up a week of papers.
    if (s.paper) { s.items = s.items.filter((it) => it !== s.paper); s.paper = null }
    schedulePaper(s)
    // #2244: and forgotten plates go out with the night — the table resets,
    // the slot stamps start over, and tomorrow's bells re-seed.
    if (s.meal) { s.items = s.items.filter((it) => it !== s.meal); s.meal = null; s.mealEaten = [] }
    s.mealSlot = 0
    scheduleMeals(s)
    // #2503: midnight takes any cone the window somehow kept (a rigged late
    // stop in the harness) — the truck is home, nothing waits for tomorrow.
    if (s.cone) { s.items = s.items.filter((it) => it !== s.cone); s.cone = null }
    // #2520: and midnight sends whatever prowls home — the window owns only
    // the hours before it; the stamp was set the moment he crossed the post.
    if (s.sneak) { s.sneak = null; s.events.push({ t: 'sneak-gone' }) }
    // #2532: and midnight calls the cat in, however far she got — the window
    // owns only the hours before it (the sneak's own midnight rule, mirrored).
    if (s.prowl) finishProwl(s)
    s.day++
    s.events.push({ t: 'day', day: s.day })
}

// #2721: the morning round. While a child lives on the lot, the paper round
// goes out at ROUTE.hour and the subs money comes home into the jar — the
// garden fund, never the till. One beat per day (the day stamp is the law,
// #2238's idiom); a fixed line, so the rng stream is untouched and every
// stored twin hash survives to the re-sample.
function updateRoute(s) {
    if (!s.kid || s.routeDay === s.day || s.hour < ROUTE.hour) return
    s.routeDay = s.day
    const cash = Math.min(ROUTE.cash, JAR_CAP - s.jar)
    if (cash <= 0) return
    s.jar += cash
    s.events.push({ t: 'route', cash, jar: s.jar })
    think(s, `Pip comes back from the paper round, pockets heavy — §${cash} into the garden jar.`)
}

// #2752: THE JAR'S SURPLUS CLAUSE. Once both kits stand, the fund has paid
// its only kit — yet Pip's round keeps coming, so the jar refills toward a
// FULL it can never spend. That dead surplus now buys the wing ONE radio:
// charged to the jar, the till untouched byte-for-byte (the #2721 invariant
// that keeps every stored tour hash alive — the till never affords a toy in a
// winning run anyway; the measured peak after kit two is §10), and ONCE per
// run — the once-guard derives from what stands on wing floorboards
// (`wingToyOn`), so no new state rides the hash and a lot that never grows
// two kits never hears of this clause at all. The radio lands on a standing
// wing that has earned no name yet, so place()'s #2743 beat fires at the
// doorstep, the badge (#2736) hangs there through the win, and the playroom
// funnel starts earning plays toward giggles. Where the win outruns the
// surplus (measured: seeds 42/99) the clause never fires — honest absence,
// the #2240 quiet-night pattern.
export function wingToyOn(s) {
    if (!s || !s.ext) return false
    for (const it of s.items) if ((it.id === 'radio' || it.id === 'tv' || it.id === 'book') && onWingFloor(s, it.r, it.c)) return true
    return false
}
export function surplusToyOk(s) {
    return !!s && !s.done && s.ext >= WINGS_MAX && s.jar >= DEF.radio.price && !wingToyOn(s)
}
export function buyWingToy(s) {
    if (!surplusToyOk(s)) return false
    const def = DEF.radio
    for (const w of s.wings) {
        const g = wingGeom(w)
        if (archetypeOf(s, w)) continue   // a named wing (a canopy bedroom, a furnished study) already sells itself
        const set = wingSets(g)
        for (const [r, c] of g.floor) {
            if (`${r},${c}` === set.door) continue
            if (cellItem(s, r, c)) continue
            if (!canPlace(s, def, r, c) || !keepsOpen(s, r, c)) continue
            s.jar -= def.price
            s.money += def.price   // place() pays from the till; the jar fronts it inside this one tick, so the till never moves
            const keep = s.sel
            setSel(s, CATALOG.findIndex((d) => d.id === 'radio'))   // #2222: the shelf follows the pick
            const ok = place(s, r, c)
            setSel(s, keep)
            if (!ok) { s.money -= def.price; s.jar += def.price; return false }   // the refusal costs nothing
            s.events.push({ t: 'wing-toy', id: 'radio', r, c, jar: s.jar })
            think(s, "Pip's paper money buys the new room a radio — a playroom, then.")
            return true
        }
    }
    return false
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
    if (s.giftFx > 0) s.giftFx = Math.max(0, s.giftFx - dt)    // #2240: the set-down basket fades too
    if (s.cmdCd > 0) s.cmdCd = Math.max(0, s.cmdCd - dt)       // #2131: command cooldown rides the real clock
    if (s.yarnCd > 0) s.yarnCd = Math.max(0, s.yarnCd - dt)     // #2256: so does the yarn play cooldown
    if (s.triTell > 0) s.triTell = Math.max(0, s.triTell - dt) // #2154: the three-way tell throttles on the world clock
    if (s.orderPing.t > 0) s.orderPing.t = Math.max(0, s.orderPing.t - dt)   // #2253: the order ring fades on the real clock
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
    updatePet(s, simDt)
    updateKid(s, simDt)
    updateHouseBond(s, simDt)
    updateNeighbours(s, simDt)   // #2588: the pair's own bond forms over the top of the choreography (kept behind the documented five-deep chain)
    updatePaper(s)          // #2238: the route rides the same world clock, kept behind the documented five-deep chain
    updateMeals(s)          // #2244: so do the bells, right behind the news
    updateBin(s)            // #2303: and the truck — the eve arms, dawn resolves
    updateIceCream(s)       // #2503: and the jingle — the cone lands, the window runs out
    updateSneak(s, dt)      // #2520: and the night — odd nights a shadow tries the gate, the alarm answers
    updateProwl(s, simDt)     // #2532: and Miso keeps the even ones — the parities are the lot's night watch
    updateRoute(s)            // #2721: and Pip's morning round fills the garden jar

    // #2695: the sun law. Tending accrues only through daylit hours, and a
    // ripe bed harvests without waiting for hands: the hungriest resident
    // eats what the garden picked (ties go to the roster order — fixed, pure),
    // the whole house takes the pride (one contentment, the meal-table
    // pattern). Night stops the clock; a ripening bed waits for morning.
    // The payoff rides the wing record, so a lot with no garden is untouched.
    function updatePurpose(st, hrs) {
        if (!st.ext) return
        for (const w of st.wings) {
            if (w.id !== 'garden') continue
            if (isNight(st)) continue
            w.tend = (w.tend || 0) + hrs
            if (w.tend < TEND_HOURS) continue
            w.tend = 0
            w.herbs = (w.herbs || 0) + 1
            let eater = null
            for (const q of st.people) if (!eater || q.needs.hunger < eater.needs.hunger) eater = q
            if (eater) {
                eater.needs.hunger = Math.min(1, eater.needs.hunger + HARVEST_FOOD)
                eater.needs.fun = Math.min(1, eater.needs.fun + HARVEST_FUN)
                st.events.push({ t: 'harvest', name: eater.name, r: GARDEN.door[0], c: GARDEN.door[1] })
                think(st, pick(st, HARVEST_LINES).replace('{p}', eater.name))
            }
            st.content = Math.min(WIN_CONTENT, st.content + 1)
            st.events.push({ t: 'content', n: 1, id: 'garden' })
        }
    }
    updatePurpose(s, dh)      // #2695: and the rooms earn their keep — the garden ripens while the sun is up

    for (const p of s.people) {
        p.mood = avg(p)
        if (p.alarmT > 0) p.alarmT = Math.max(0, p.alarmT - simDt)
        holdConeTick(s, p, simDt)   // #2508 item 3: the cone in hand melts on the world clock (faints and commutes let it drip too — it is only a sight)
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
        const asleep = !!(p.use && p.use.def.sleep)
        // any need crossing into red raises a one-shot alarm pulse on the mood gem
        // (advisory only — collapse is still governed by PHYS redT below)
        if (asleep) { for (const n of NEEDS) p.wasRed[n] = false }
        else {
            for (const n of NEEDS) {
                // #2253: the amber warning fires while the need is still saveable
                // — a separate one-shot stamp from the red alarm, one event per
                // crossing, re-arming only when the need recovers past 0.5.
                if (p.needs[n] <= AMBER_AT && p.needs[n] > RED_AT && !p.wasAmber[n]) {
                    p.wasAmber[n] = true
                    s.events.push({ t: 'amber', need: n, name: p.name })
                } else if (p.needs[n] > 0.5) p.wasAmber[n] = false
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
                    p.queue.length = 0   // #2470: collapsed on the floor — the list dies with the knees
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
            if (p.use.def.sleep) p.needs.energy = Math.min(1, p.needs.energy + p.use.def.cozy * simDt)
            const done = p.use.def.sleep ? (p.use.night ? (s.hour >= 6 && s.hour < 22) : p.use.t >= p.use.dur) : p.use.t >= p.use.dur
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
        // #2683: the go-say errand — the word lands the tick the two actually
        // share the ring; the wait, the chase and the honest loss live there.
        if (p.goal && p.goal.kind === 'gosay') { goSayArrive(s, p); continue }
        // #1814: the hammer fell and this resident hasn't looked yet — send
        // them through the doorway; re-offered if the player interrupts the walk
        if (s.ext && s.roomReact > 0 && !p.roomSeen) {
            const g = wingGeom(s.wings[s.wings.length - 1])   // #2689: the newest room gets the first look
            const pref = g.react[s.people.indexOf(p) % g.react.length]
            const tg = (walkable(s, pref[0], pref[1]) ? [pref] : g.floor)
                .map(([r, c]) => ({ r, c }))
            const path = bfsPath(s, { r: p.r, c: p.c }, tg)
            if (path) { p.path = path; p.goal = { kind: 'room' }; p.owner = 'ai' }
        }
        // #2470: the queue plays its turn before the resident drifts back to
        // their own devices — the tick a delivered order leaves them idle, the
        // head of the list re-issues from wherever they stand (re-validated;
        // stale orders drop honestly, and the next item gets its turn).
        if (p.queue.length && !p.path && !p.goal && !p.use) {
            let ok = false
            while (p.queue.length && !ok) {
                const o = p.queue.shift()
                ok = issueOrder(s, p, o)
                if (!ok) s.events.push({ t: 'queue-drop', name: p.name, id: o.kind === 'use' ? o.it.id : o.kind })
            }
            if (ok) continue
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
    // #2240: attract sells Ivy — ring the second neighbour ONCE per demo (an
    // organic visit counts as the ring). Without the pull, the demo leaned on
    // Fern's schedule and Ivy's window (12:00–19:00, own rng, floor 12h) often
    // fell outside what the loop showed. The stroll half of the issue ships as
    // autonomy's OWN #2143 law — a lonely resident already routes to the
    // NEAREST visitor, Ivy included. A forced nudged walk was built and tested
    // too, and it broke three WINNABLE gates (seed 7's buy-economy wins main by
    // exactly §10; borrowing even a lonely resident shifts chat/content timing
    // enough to tip it): the ring, the arrival, the basket landing and the
    // lonely-chat all sell her honestly — a staging beat never outranks the
    // economy that proves the game can be won.
    if (!s.demoIvy) {
        if (s.ivy) s.demoIvy = 1
        else if (s.hour >= 12 && s.hour < 19 && s.ivyAfter != null && s.ivyAfter + s.ivyGap >= 19) {
            // her own schedule can no longer land inside her window (the roll
            // said 19:00 and the gap pushes past it — nothing re-rolls until a
            // visit ends, so she would stand the whole run invisible): ring her
            // in at noon instead. Seeds whose Ivy already comes reach her on
            // their own clock, untouched.
            s.ivyAfter = Math.floor(s.hour); s.ivyGap = 0; s.demoIvy = 1
        }
    }
    // #2752: the jar's surplus clause (see buyWingToy) — once the cottage has
    // paid and the fund refills, the demo names a room: radio onto a standing
    // wing's floorboards, doorstep sparkles, badge through the win. Jar money
    // only, and no walk rides it, so it answers to the clock, not to the
    // busy-resident guard below (measured: the morning commute eats the whole
    // surplus window on two of the three surplus seeds). The till's shipped
    // tour economy never moves.
    if (buyWingToy(s)) return
    const p = s.people[0]
    if (p.working || p.faintT > 0 || p.path || p.use) return
    // #2238: the attract bot reads the paper left on the step — the demo
    // teaches the route without a word. If the walk can't be had, carry on.
    if (s.paper) { if (cmdUse(s, p, s.paper)) return }
    // #2244: and eats what the kitchen served — a hungry resident walks to
    // the plate, so the attract teaches the bells the same silent way.
    if (s.meal && p.needs.hunger < 0.75 && p.mealTaken !== s.mealSerial) { if (cmdUse(s, p, s.meal)) return }
    // #2721: thrift until the NEXT kit is honestly in reach — the east wing
    // from the till (exactly the shipped §300 bar), the garden from Pip's jar
    // plus whatever the till can add. Items still pay from the till alone.
    const kit = s.ext === 0 ? EXT_ROOM : s.ext === 1 ? GARDEN : null
    const purse = s.money + (kit && kit.id === 'garden' ? s.jar : 0)
    if (purse > (kit ? kit.price : 300) && s.content < WIN_CONTENT) {
        // #2209: the till sells the family first — cat, child, then roof (the
        // issue's own tour). Roomkit used to eat the whole register at daybreak,
        // the cat ate the next payday, and the §300 wall starved the kid card
        // out of every demo: 9/9 seeds won with Pip unadopted (README gap).
        const wants = ['phone', 'petkit', 'kidkit', 'roomkit', 'canopy', 'stove', 'tv', 'sofa', 'radio', 'book', 'shower', 'plant', 'lamp', 'rug']
        for (const id of wants) {
            const def = DEF[id]
            // #1814: the attract build grows the lot so the demo sells the
            // reflow — the room owns itself via `ext`, and only buys when the
            // footprint is honestly clear (never wedge the bot on a refusal)
            if (id === 'roomkit') {
                // #2721: the lot may grow TWICE on the bot's own money now — kit
                // one from the till, kit two (the cottage) from the jar. The
                // site law is the shipped one, via buildRoomOk (kit two has one
                // home, the back lawn).
                if (s.ext >= WINGS_MAX) continue
                if (!buildRoomOk(s, s.ext === 0 ? eastWing(DEFAULT_ANCHOR) : GARDEN)) continue
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
    // #2303: the bot never borrows for the chore — a bin walk mid-evening
    // steals chat minutes the WINNABLE seeds win by (built, tested, cut:
    // seeds 7/1234/20261023 all fell). Autonomy is the route; the marquee
    // and the eve banner teach the player to order it themselves.
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
    mix(s.jar)                       // #2721: the garden fund is state — a round saved is a room standing
    mix(s.ext)
    for (const w of s.wings) {
        mix(w.id === 'garden' ? -7777 : w.r0 + 1)   // #2689: which wing stood where rides it too
        mix(Math.round((w.tend || 0) * 1000))        // #2695: purpose rides with the room it belongs to —
        mix(w.herbs || 0)                            //     a lot with no wings gains no new mixes at all
        mix(w.sleptWell || 0); mix((w.lodgeDay ?? -1) + 1)
        mix(w.pages || 0); mix(w.insights || 0)     // #2736: personality tallies ride the same room loop —
        mix(w.plays || 0); mix(w.delights || 0)     //     still zero new mixes on a lot with no rooms
    }
    mix(s.tab)                       // #2222: the open catalog shelf is state too
    mix(s.speed)                     // #2227: so is the speed dial — replays pin it
    mix(s.rel.house); mix(s.rel.fern)   // #1817: bonds ride the hash
    mix(s.rel.ivy)                     // #2143: so does the second neighbour's
    mix(s.rel.kid)                     // #2203: and the child's
    mix(s.rel.neigh)                 // #2588: and the neighbours' own opinion of each other
    mix(s.spats); mix(s.grudge)        // #2070: quarrels and grudges ride it too
    mix(s.cmdCd)                       // #2131: the command cooldown rides it too
    mix(s.holdT)                       // #2171: so does the pending thumb-court hold (-1 = none)
    mix(s.courtPick === 'house' ? 1 : s.courtPick === 'fern' ? 2 : s.courtPick === 'ivy' ? 3 : s.courtPick === 'kid' ? 4 : 0)   // #2235: so does the preferred addressee
    mix(s.triTell); mix(s.triHits)   // #2154: the choreography tell and its beat count ride it too
    mix(s.neighTell); mix(s.neighHits)   // #2588: so do the pair's own exchange throttle and beat count
    mix(s.neiSpats); mix(s.neiGrudge); mix(s.neiMending)   // #2604: the pair's quarrel ledger rides it (the timers don't — clocks like spatCd stay off)
    mix(s.neiMediated)                                       // #2672: the mediation flag rides with the ledger
    mix(s.neiWalk)                                           // #2611: the circuit beat rides it; the bank (neiStroll) is a clock and stays off
    mix(s.paperDay)                    // #2238: today's route stamps the day it landed
    mix(s.mealDay)                     // #2244: so do the bells — the day the plate landed
    mix(s.mealSlot); mix(s.mealSerial) // and which bell rang, and how many ever rang
    mix(s.mealEaten.length)            // who has sat down at the current plate
    mix(s.meal ? 1 : 0)              // the plate itself is state (its cell rides the items loop)
    mix(s.yarnCd)                    // #2256: the ordered-play cooldown rides it too
    mix(s.collectionDay)             // #2303: the truck's roster rides it — the view tells off the hash
    mix(Math.round(s.truckHour * 100) | 0)   // and the seeded dawn hour it passes at
    mix(s.binAt === 'curb' ? 1 : 0) // where the bin stands is state (its cell rides the items loop)
    mix(s.binAuto ? 1 : 0)
    mix(s.binSetDay); mix(s.collections); mix(s.skips)
    mix(s.iceDay); mix(s.iceSerial); mix(s.treats)   // #2503: the street's stops and the cone ledger ride it
    mix(s.cone ? 1 : 0)     // the cone itself is state (its cell rides the items loop)
    mix(s.sneakNight); mix(s.scareDay); mix(s.sneakSerial); mix(s.lost)   // #2520: the night's ledger rides it too
    mix(s.prowl ? 1 : 0); mix(s.prowlNight); mix(s.prowlSerial)           // #2532: and the cat's parity ledger
    mix(s.sneak ? 1 : 0)    // and the prowler on the lot is state, exactly the visitor law
    for (const p of s.people) {
        mix(p.r); mix(p.c)
        for (const n of NEEDS) mix(p.needs[n])
        mix(p.faintT); mix(p.working ? 1 : 0); mix(p.queue.length)
        for (const o of p.queue) {   // #2470: plans are state — a queued list changes the hash
            if (o.kind === 'walk') { mix(o.r * COLS + o.c + 1); continue }
            if (o.kind === 'work') { mix(-1000); continue }
            if (o.kind === 'gosay') { mix(o.k === 'fern' ? -4001 : o.k === 'ivy' ? -4002 : -4003); continue }   // #2683: a promised ear is a plan
            mix(-(s.items.indexOf(o.it) + 2))   // sold since enqueue reads as its own value (-1)
        }
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
        mix(s.pet.play ? 1 : 0)      // #2256: a cat mid-hunt toward the yarn is state
    }
    mix(s.kid ? 1 : 0)                              // #2203: so is the child
    if (s.kid) {
        mix(s.kid.r); mix(s.kid.c)
        mix(s.kid.needs.hunger); mix(s.kid.needs.fun); mix(s.kid.needs.energy); mix(s.kid.needs.social)
        mix(s.kid.asleep ? 1 : 0); mix(s.kid.cd)
    }
    return h >>> 0
}
