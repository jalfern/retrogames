// CONTRA — sim (pure Node, zero DOM). Jon's #1530 commission; #2779 stages.
//
// The arcade original (Konami, 1987) runs its stage at 60 Hz: this sim is the
// whole game truth, one `step(gs, pad)` per tick. Determinism law: EVERY random
// the sim consumes rides `gs.r` (mulberry32 as an integer state) — so seed +
// pad streams replay hash-identical, and snapshot/restore survive JSON (no
// functions inside gs). Math.random is banned here; it may only live in the
// shell's cosmetic particle layer.
//
// S1 (the jungle): horizontal scroll ~6 screens; 8-way run-and-gun, one-hit
// death with 3 lives + respawn mercy, the SPREAD capsule, soldiers, turrets,
// TNT barrels.
// S2 (#2779, the base): reaching the bolted gate drops the hero into the
// WATERFALL — a vertical canyon the camera ratchets up (never retreats), the
// torrent at the screen's bottom edge drowns you, one-way rock shelves zigzag
// upward with gunners firing down. The top opens on the BOSS GATE: an armored
// fortress wall with two cannons and spawn doors; the one weak point is the
// core — armored when shut, vulnerable when open. Destroy it and stage 1 is
// truly finished (#2779 "stage 1's real finish").
//
// S4 (#2779, co-op): gs.p2 — a second soldier with his own physics bank and
// his own weapon. A deterministic honest-perception brain drives the CPU seat
// (visible things only, like every autopilot law); a human takes it drop-in on
// WASD + F/G and keeps it. Enemies aim at the NEARER hero's lane — the hop
// answers aimed rounds for both seats.
// #2814 shared pool (the cabinet's law): ONE life bank serves BOTH seats. Any
// death — hero's or blue's — drains the shared `gs.lives`; a seat that dies
// with the pool empty is down for good, and GAME OVER lands the arcade way —
// the instant both seats are down. A partner can lose the run for the team,
// exactly like the machine.

export const W = 384
export const H = 224

export const CFG = {
    ground: 196,           // feet y of the jungle floor
    worldW: 2048,
    endX: 2000,           // reaching the base gate enters the waterfall (S2)
    run: 2.0,
    jumpV: -5.2,
    grav: 0.28,
    coyote: 6,            // ticks of grace after walking off a ledge
    bulletSpeed: 5.5,
    spreadSpeed: 5.0,
    spreadArc: Math.PI / 4.1,
    fireCool: 8,
    fireCoolSpread: 10,
    // S3 weapon wall: per-gun cycles and muzzle speeds
    fireCoolMachine: 3,       // the MG is a stream, not a rhythm
    fireCoolFire: 9,
    fireCoolLaser: 16,
    machineSpeed: 5.5,
    fireBallSpeed: 2.2,       // slow flame, heavy presence
    laserSpeed: 9.5,          // the fastest round in the game
    fireWob: 1.5,            // firebar vertical undulation (px/tick around its line)
    sniperSpeed: 3.2,         // the tree-line round: faster than any runner
    hopBand: 40,              // autopilot/ally hop window (px): S4 re-tune 46→40 —
                              //   with two soldiers on screen the rounds thicken and the
                              //   early hop descends into the round it jumped for; 36/36
                              //   seeds clear with the later, tighter hop
    depotHp: 10,              // S3.5 the arms depot — a shootable emplacement
    gunHp: 10,              // #2880 the gate's cannon housings — same slab law, ten rounds
    // --- #2847 pod carriers: the sky couriers (README gap 0) ---
    carrierHp: 2,
    carrierVx: -1.1,
    carrierHW: 16, carrierHH: 9,   // the airframe's hit box
    carrierFirst: 320,             // first courier of the run (ticks)
    carrierNext: 380,             // + up to 240 more, seed arithmetic (no gs.r)
    podGrav: 0.06, podFallMax: 1.6, podVx: -0.6,
    // --- #3060 the barrier capsule: the wheel's FIFTH letter (never-dry #1571) ---
    // The cabinet's B — an energy shield that swallows enemy rounds for a time.
    // Schedule, drift and duration are seed/tick arithmetic: ZERO gs.r draws,
    // the #2847 carrier precedent — every existing capsule/carrier stream and
    // every tuned autopilot byte stands; the shield bends outcomes at capture,
    // never the seed. barrFirst is tuned to 800 (#3060 sweep calibration): the
    // first death cluster of the jungle runs at t≈570-760, and a shield that
    // eats a death the autopilot was priced to take re-times the whole run —
    // seed 6's rescued death put the hero down mid-gorge, where no calibrated
    // wingman can solo the arena (#2917: bend the feature, never the brain).
    // Later than the cluster, the van still catches the runner on all 12
    // sweep seeds and swallows real rounds on 3 — the letter is live in the
    // sweep, just never at the moment it would undo a priced death.
    barrFirst: 800,             // the first drift of a run (ticks) + seed jitter
    barrJitter: 240,
    barrNext: 1400,             // re-arm after a cleared drift + tick jitter
    barrJitter2: 300,
    barrTicks: 360,            // shield life — six seconds at the world's 60 Hz, fixed
    barrWarn: 60,              // the last second blinks (the shelf's warning family)
    barrVx: -0.9,              // drifts toward the runner, below the gun-line
    barrScore: 1000,           // a letter pays like a letter (the #3057 table)
    // --- #2917 the SECOND air layer: the gate's hangar gunships ---
    // The cabinet's armed aircraft. A hangar mouth in the fortress parapet
    // grinds open (the attack is TELEGRAPHED by the door, never born on
    // screen), one gunship flies out, works the arena with lane-aimed
    // down-rounds at PINNED speed — the lane-aim law is the fairness spine:
    // a hop is always the answer — and takes three rounds to bring down.
    // Schedule and jitter are seed/tick arithmetic, ZERO gs.r draws, so the
    // tuned autopilot stream and every rng-driven law byte-for-byte stand.
    gsHp: 3,                 // airframe rounds before the hull goes up
    gsHW: 17, gsHH: 8,       // the hull's hit box
    gsVx: -1.35,             // patrol speed across the arena (tempo k, not round speed)
    gsVyMax: 1.0,            // the strafe law: a hull round never dips steeper
                             //   than this, so the hop is always the answer
    gsAlt: [52, 70],         // the sortie band — clear of the deck AND of a hero's
                             //   hop apex (feet 102 / chest 88 at the top of a jump),
                             //   so hopping an aimed round never parks you in a hull;
                             //   still well inside up-aim reach (a round flies off screen)
    gsHangarX: 262,          // the hangar mouth's centre on the parapet
    gsHangarY: 24,
    gsTelegraph: 34,         // the door grinds this long before the hull emerges
    gsGrind: 74,             // the door stands open this long (the hydraulic language)
    gsFirst: 150,            // ticks after the gate locks before the first sortie
    gsNext: 480,             // gap between sorties (+ seed jitter), both divided by k
    gsFirstShot: 40,         // the hull's first round after leaving the mouth
    gsRearm: 320,            // between its rounds — a strafe, not a torrent
                             //   (fairness by construction: the honest autopilot
                             //    clears every seed on every loop, so the sortie
                             //    never makes the gate unwinnable)
    gsScore: 400,            // the arcade's gunship purse
    // --- #3064: the gorge's rappellers (falls only) ---
    rapFirst: 30,            // ticks into the falls before the first rope drops
    rapEvery: 170,           // gap between drops (+ station jitter), by the sortieK half-ramp
    rapSlide: 0.75,          // descent pace px/tick on the wire
    rapTele: 30,           // a half-second hang before the first round — telegraph
    rapShots: 3,             // rounds per ride, then he slides off to reinforce
    rapRearm: 110,           // fixed cadence — a rappel never draws gs.r
    rapFallG: 0.22,          // tumble gravity once the rope is cut
    rapGate: 24,             // never fire straight down: |dx| at least this wide
    rapPatience: 120,        // a hanger with nobody in his band for 2 s slides off — the wire is never squatting
    rapDrop: 300,            // the cut purse — the turret tier
    // --- #3067: the cabinet's leaping infantry (jungle only) ---
    // The arcade's frogmen never walk the trail at you — they crouch, launch
    // and turn through the air in short bounds. Own zero-rng lane (#2847/
    // #3060/#3064 precedent): schedule, arc and rifle cadence are all
    // seed/tick arithmetic, so the tuned autopilot stream byte-stands.
    jlFirst: 520,            // ticks into a pass before the first drop
    jlEvery: 560,            // gap between frogmen (+ seed-keyed jitter, / k)
    jlJit: 90,               // jitter window — (seed*37 + jlN*61) % jlJit
    jlY: 138,                // the perch line — the tree-line the snipers own:
                             //   a chest-height stream (y 182) can never reach a
                             //   torso centred at 126, so the frogman is alive and
                             //   VISIBLE until he commits to the drop (the canopy
                             //   shelter the sniper law already documents)
    jlDropBand: 170,         // the seat under the perch — the ambush wakes in him
    jlCoil: 10,              // the crouch on the branch before he launches — telegraph
    jlGate: 100,             // never fire steep: while above the deck he holds his
                             //   rounds out to |dx| ≥ this, so every round he throws
                             //   keeps its hop answer (worst angle vy ≈ 1.08 at perch
                             //   height — inside the 1.2 window the hop law reads —
                             //   the rapGate/#2917 law in the vertical, pinned)
    jlRearm: 150,            // fixed cadence — a frogman never draws gs.r
    jlLand: 12,              // the deck stagger: geometry says the advancing seat
                             //   reaches the drop column ~1 tick after touchdown
                             //   (t_hit − t_land = (lead−110)/2 − ((lead−170)/2+31)
                             //   = −1 for ANY lead) — so the landing itself must
                             //   never kill. He staggers jlLand ticks (dust + up
                             //   pose), then the plain runner contact law answers.
    rapLandMin: 28,          // he never lands at his own station: past hang + this
    eBulletSpeed: 2.2,
    respawnFreeze: 50,
    invuln: 100,
    blastR: 36,           // barrel/turret kill radius
    blastPlayerR: 30,
    // --- S2: the waterfall ---
    worldH: 700,          // world y of the canyon bottom (y grows downward)
    rise: 0.22,           // the torrent pushes the camera up this fast (px/tick)
    anchor: 140,          // hero above this screen line pushes the camera
    drownAt: 16,          // feet at camY + H - drownAt are in the water
    bossFloor: 150,       // arena floor world/screen y once the gate opens
    wallX: 168,           // the gate wall face; hero patrol is x < 162
    coreX: 200, coreY: 96, coreHW: 22, coreHH: 18,
    coreHp: 8,
    coreOpen: 120,        // vulnerable window (ticks)
    coreCycle: 190,       // open, then armored shut
    doorCap: 1,           // doors never spill more than this many live runners
    // --- #2885 hanging vines: the canyon's carriers (falls phase) ---
    vinePeriod: 96,           // pendulum period (ticks) — pure tick math, zero gs.r
    vineAmp: 1.1,            // swing amplitude (rad): a rope-swing, ± ~70 px wide,
                             //   ~44 px of tip rise — enough to be a carrier
    vineHang: 26,            // rider's feet hang this far below the tip (one-armed)
    vineGrabHW: 9, vineGrabVH: 15,   // the touch box around the swinging tip
    vineCarryMin: 20,        // the carrier law: a rider is flung at least this
                             //   above where they caught the vine
    vineRideMax: 100,        // safety: no seat hangs past one full swing + margin
    vineLiftBoost: 0.5,      // the fling's extra pop at the far apex
    cascadeStep: 8,          // #2885 scripted finale: one site every 8 ticks
    // --- #3038 THE DUCK: the cabinet's three ground profiles ---
    // DOWN on the ground cycles stand -> kneel -> prone (press DOWN again), UP
    // stands. A low profile fires from a lower muzzle and shrinks the body out
    // of the tall rounds: aimed fire flies at the chest line (lane-14) locked
    // at the shot, so ducking AFTER the telegraph is the answer — the same
    // reactive dodge the hop is, priced honestly: while low the run is a crawl
    // (half speed), the ground stays lethal (blast radius is measured from the
    // belly, soldiers and barrels answer to the feet, the torrent never moved),
    // and the honest autopilot never ducks — every tuned seed still runs.
    duckSpeed: 0.5,            // low travel is a crawl — the trade for the profile
    duckMuzzle: [16, 11, 6],   // barrel height above the feet per profile — the
                               //   drawn arm lines up at the same line (art.js)
    duckCenter: [14, 9, 4.5],  // seat hit-box centre above the feet per profile
    duckHalfH: [13, 8, 4],     // ...and its half-height (top: 27 / 17 / 8.5)
    duckHalfW: [7, 7, 9],      // a prone body stretches along the road
    // --- S4 co-op: the blue seat (Jon's multiplayer rule: CPU ally by default,
    // human drop-in on the desktop keyboard) ---
    allySpawnDX: -26,     // the ally arrives at your shoulder
    // #2837 seat ceremony: the drop-in descent (ticks, px/tick toward the
    // hero-side spot) and the drop-out patience — a pad-claimed seat that
    // hears nothing for seatIdle ticks returns to the wingman brain.
    dropInT: 30,
    dropInV: 8,
    seatIdle: 600,
    // #3000 spoken wingman orders (#1711 S5): the scroll reaching a held spot
    // releases the HOLD order (the board took the position he was told to
    // keep — wingman autonomy, pinned). Spread gaps: the flank lag behind the
    // shoulder hug (allySpawnDX).
    callHoldEdge: 28,
    callSpreadGap: 78,
    callSpreadGapBoss: 70,
    // #2814: NO allyLives — the cabinet shares ONE pool (gs.lives) between both
    // seats; a blue death costs the team, and GAME OVER lands when both seats
    // are down with the pool empty.
}

// #2894 THE ARCADE LOOP — STAGE CLEAR is not the end: stage 1 returns FASTER.
// One pure multiplier drives every PRESSURE TEMPO on loop n: soldier/turret/
// sniper/depot/cannon rearm intervals, the door spill, the nade cadence, the
// walker pace, the gate's shutter cycle (coreT advances by k) and courier
// traffic. What it never touches: hero physics, round SPEEDS, the torrent, the
// weapon aid (capsule schedule), the vine laws, and the SCRIPTED finale (#2885
// cascade — byte-identical every seed, every loop). Speeds stay pinned because
// the lane-aim law is the game's fairness spine — "a hop is always the answer
// to an aimed round" — and the hop window (hopBand) is tuned to these speeds;
// raising k shrinks the number of rounds' flight TIME, not their flight PATH.
// The cap is the cabinet's shape: the heat climbs one notch per loop (+10%
// tempo) and then holds at x1.30 (loop 4+) — every seed is clearable on every
// loop (the autopilot sweep proves it against the loop bank, 3 + 1/loop, cap 5).
// k = 1 at loop 1 — every pre-loop pin stands byte-for-byte.
export const LOOP_STEP = 0.10
export const LOOP_CAP = 1.30
// the loop courtesy the classic loop cabinets pay: surviving one pass buys the
// next a spare life, banked to five. (Contra's arcade credits out; the loop
// spec this repo wrote needs the courtesy to stay humanly winnable at heat.)
export const LOOP_LIFE_BONUS = 1
export const LOOP_LIVES_MAX = 5

// #3037 THE KONAMI CODE — arcade history's most famous instruction: typed on
// the attract screen, the run starts with 30 soldiers instead of 3 (NES Contra,
// 1987 — the code that made a schoolyard legend). The detector is pure
// arithmetic: a progress counter 0..10 fed by the shell on every attract press.
// It never touches gs and never draws gs.r — the attract demo runs byte-for-byte
// whether or not a finger is typing — and the prize enters the world only at
// makeGame time, where `lives` already rides stateHash (honest replay covers it).
export const KONAMI = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a']
export const KONAMI_LIVES = 30
export function konamiFeed (progress, key) {
    if (progress >= KONAMI.length) return progress   // once typed, it stays armed until the run consumes it
    if (key === KONAMI[progress]) return progress + 1
    return key === KONAMI[0] ? 1 : 0                  // a stray UP after a slip restarts at 1 — the classic behaviour
}
export const konamiArmed = (progress) => progress >= KONAMI.length

// #3042 THE CONTINUE WINDOW — the cabinet's second chance, as pure arithmetic
// (the konamiFeed precedent: the shell owns the clock, the sim owns the law,
// and the harness pins the whole window in Node). The over screen's WORLD-tick
// clock asks one question — where does the player stand? — and gets:
//   'read'  GAME OVER speaks (CONT_READ ticks) — the sting, the score line;
//   'count' the coin is accepted — Konami's digit falls 9…0, one a second;
//   'out'   the book closes — the machine returns to the title.
// The purse (how many continues a game sells) is shell state, like IronRing's
// credits (#1103); this function answers only WHEN, never WHETHER it is paid.
export const CONT_READ = 90                            // GAME OVER reads 1.5 s
export const CONT_SECS = 9                             // the classic digit: 9…0
export const CONT_LIFE = (CONT_SECS + 1) * 60          // the whole window
export function contPhase (overT) {
    if (overT < CONT_READ) return { phase: 'read', digit: CONT_SECS }
    if (overT < CONT_READ + CONT_LIFE) {
        return { phase: 'count', digit: Math.max(0, CONT_SECS - Math.floor((overT - CONT_READ) / 60)) }
    }
    return { phase: 'out', digit: 0 }
}

// #3045 THE COUNT'S BEATS — the ceremony, also as pure arithmetic. The 1987
// machine clacks the coin into the slot BEFORE the count starts and speeds its
// beep as the seconds run out; ours had one flat tick a second. contBeat answers
// "what does this world-tick sound like?" — one of:
//   'coin'  the clack at CONT_COIN, a half-second ahead of the 9 (during read);
//   'tick'  the digit boundary — nine-plus-one, unchanged since #3042;
//   'hot'   the heat: inside the last three digits the beeps multiply —
//           2/s on the 3, 3/s on the 2, 4/s on the 1 and the 0 (rising until
//           the book slams);
//   null    silence.
// Still world ticks, never setTimeout (the #3042 law); the shell only maps
// names onto sfx.
export const CONT_COIN = CONT_READ - 30                // the clack lands 0.5 s before the 9
export function contBeat (overT) {
    if (overT === CONT_COIN) return 'coin'
    const cw = contPhase(overT)
    if (cw.phase !== 'count') return null
    const pw = contPhase(overT - 1)
    if (pw.phase !== 'count' || pw.digit !== cw.digit) return 'tick'
    if (cw.digit > 3) return null
    const gap = cw.digit === 3 ? 30 : cw.digit === 2 ? 20 : 15
    return (overT - CONT_READ) % gap === 0 ? 'hot' : null
}

// #3035 THE SOMERSAULT span: one full body-turn per jump. The arc of a normal
// jump runs `rollT` 1..37 under the sim's Euler integration — the roll completes
// exactly as the feet come back to the ground, the cabinet's snap (the arc is
// 2·|jumpV|/grav ticks of flight minus the jump tick itself, and the harness
// pins the constant to the observed arc, so physics drift cannot split them).
// Presentation arithmetic only: the seat clock (`rollT`) never enters stateHash
// and never draws gs.r.
export const SOMERSAULT_TICKS = Math.ceil(2 * Math.abs(CFG.jumpV) / CFG.grav - 1)
export function loopK (n) {
    return Math.min(LOOP_CAP, 1 + LOOP_STEP * Math.max(0, Math.floor(n) - 1))
}

// #1712 S2 — the arcade loop AS REPLAYABLE LAW. The core goes dust, stage 1
// returns hotter carrying score, the classic loop courtesy (one spare life,
// banked to five) and the gun the run carried. #2894 lived this in the shell;
// lifting it into the sim is what lets shell, harness and the Node dataset
// adapter (#1712) rebuild a loop-up byte-identically — a PLAICRAFT take is the
// SESSION, so it must span loops the way the cabinet run does.
// #3041 SCORE EXTEND — the cabinet pays an extra life for score. The first
// mark is the Konami instruction card's 30,000-point extend; the repeat rung
// is the era-typical Konami staircase (+50,000) — the exact repeat interval is
// not documented in the repo, recorded as a fidelity note per the #237 rule.
// Pure arithmetic: zero gs.r draws, `nextExt` rides stateHash (a replay that
// silently skips an extend diverges loudly), and the threshold is a RUN
// property — arcadeLoop carries it with the score, never resets it.
export const EXT_FIRST = 30000
export const EXT_STEP = 50000

// #3042 seam on the #3041 law: the mark belongs to the RUN — so an entry that
// arrives with a bank already past a rung (a paid CONTINUE carrying score)
// starts at the first rung that bank has NOT crossed, never re-sells one it
// bought. Default score 0 => EXT_FIRST: byte-for-byte the pre-#3041 world.
export function extMark (score) {
    let ne = EXT_FIRST
    while (score >= ne) ne += EXT_STEP
    return ne
}

// #3061 THE HALL — the cabinet never forgets. Konami's era kept a top-score
// table in attract (the GK-lineage of Gradius and Life Force: ranks in gold),
// and this game's progress ladder is the LOOP (#2894), so an entry stamps how
// far the run rode. Pure data laws, OUTSIDE the referee: the helpers never
// touch gs, consume zero gs.r, and add no hash surface — the store round-trip
// is the shell's (localStorage); Node audits these functions directly.
// Entries {score, loop, t}: t is RUN data (the shell stamps it), never a
// clock read here — same input, same board, byte-for-byte.
export const HALL_CAP = 5
export const HALL_ROWS = 3
export const HALL_RANKS = ['1st', '2nd', '3rd', '4th', '5th']

// #3066: a row may carry a signed name. An entry WITHOUT `who` is legal —
// that is the legacy board (pre-signing stores keep reading; the shell paints
// those rows `???`). An entry with a MALFORMED who is corruption: drop it,
// the same never-repair law the score fields obey.
function hallOk (e) {
    return !!e && Number.isInteger(e.score) && e.score >= 0 &&
        Number.isInteger(e.loop) && e.loop >= 1 && Number.isFinite(e.t) &&
        (e.who === undefined || whoOk(e.who))
}

// Read whatever the store handed back and trust only what the law allows:
// score and loop are integers, t finite; corrupt entries drop (never repair
// silently). Sort is score-desc, and a tie keeps the OLDER run up the board —
// the first to earn the mark keeps it.
export function hallRead (raw) {
    if (!Array.isArray(raw)) return []
    return raw.filter(hallOk)
        .sort((a, b) => b.score - a.score || a.t - b.t)
        .slice(0, HALL_CAP)
}

// Bank one ended run. A zero-score fall is not a raid — the board is for runs
// that paid. `record` is true when the entry outscored everything the board
// held: that is the NEW RECORD moment, and it belongs to the BOARD's best,
// not the live HI tracker (the two share the same honest end-of-run gate,
// but the board is what the player reads ranks off).
export function hallAdd (hall, entry) {
    if (!hallOk(entry) || entry.score <= 0) return { hall, record: false }
    const best = hall.length ? hall[0].score : 0
    return { hall: hallRead([...hall, entry]), record: entry.score > best }
}

// ---- #3066 NAME YOUR RANK — the GK lineage signs its board ----------------
// Gradius (Konami, 1985) stops the game the moment you make the board and
// asks you to NAME your ship: three initials, joystick scheme, a finite count,
// a default that commits itself. TOP SOLDIERS (#3061) claimed that lineage
// out loud but left every rank anonymous — this is the ceremony it missed.
// All of it lives OUTSIDE the referee: `who` never enters gs/stateHash, these
// helpers consume zero gs.r and take no clock (the shell ticks the count).
export const NAME_LEN = 3
export const WHO_DEFAULT = 'AAA'                    // the era default, commit-able as-is
export const NAME_SECS = 9                          // #3042's single-digit idiom
export const NAME_HOLD = NAME_SECS * 60             // world ticks the ask stands
export const BOARD_HOLD = 150                       // the signed board reads before the title

export const whoOk = (who) => typeof who === 'string' && who.length === NAME_LEN && /^[A-Z]+$/.test(who)

// The count the shell paints beside the slots: 9…0, `out` when the window
// closes — contPhase's shape, the cabinet's own digit.
export function namePhase (t) {
    const left = Math.max(0, NAME_SECS - Math.floor(t / 60))
    return { phase: t >= NAME_HOLD ? 'out' : 'hold', digit: left }
}

// A–Z wrap in both directions; the cursor law never leaves the three slots.
export function nameCycle (ch, dir) {
    return String.fromCharCode(65 + (ch.charCodeAt(0) - 65 + (dir > 0 ? 1 : 25)) % 26)
}

export const nameCommit = (slots) => slots.join('')

// One act per press: L/R move the cursor (wraps), U/D cycle the standing slot
// only, B confirms-and-advances (and commits past the last slot), A commits
// whatever stands. Returns { st } to keep typing, or { done } when named.
export function nameStep (st, act) {
    if (!st) return null
    let { slots, cur } = st
    if (act === 'L') cur = (cur + NAME_LEN - 1) % NAME_LEN
    else if (act === 'R') cur = (cur + 1) % NAME_LEN
    else if (act === 'U' || act === 'D') slots = slots.map((c, i) => (i === cur ? nameCycle(c, act === 'U' ? 1 : -1) : c))
    else if (act === 'B') {
        cur += 1
        if (cur >= NAME_LEN) return { st: null, done: nameCommit(slots) }
    }
    else if (act === 'A') return { st: null, done: nameCommit(slots) }
    else return { st }
    return { st: { slots, cur, t: st.t } }
}

// Stamp the rows THIS session earned and left unsigned. Only timestamps the
// caller presents get a name — rows from earlier sessions, or rows that
// already wear one, stand untouched; nothing touched, nothing returned new.
export function hallStamp (hall, ids, who) {
    if (!whoOk(who) || !(ids instanceof Set) || ids.size === 0) return hall
    let touched = false
    const next = hall.map((e) => {
        if (!ids.has(e.t) || e.who) return e
        touched = true
        return { ...e, who }
    })
    return touched ? next : hall
}

// Pure decision the shell obeys when the over screen closes its business:
// the cabinet asks a PERSON, never the machine, and only when the book holds
// unsigned rows of its own and the CONTINUE window is shut.
export const askSign = ({ auto = false, unsigned = 0, counting = false } = {}) =>
    !auto && unsigned > 0 && !counting

export function arcadeLoop (gs) {
    const carryScore = gs.score
    // #3037: the bank-to-five clamps the COURTESY, not the pool — a Konami 30
    // marches through the loop un-clamped. For pools of 5 or less (every pool a
    // pre-Konami run can hold) the expression is identical value-for-value.
    const carryLives = gs.lives > LOOP_LIVES_MAX ? gs.lives : Math.min(LOOP_LIVES_MAX, gs.lives + LOOP_LIFE_BONUS)
    const carryGun = gs.p.weapon
    const carryGun2 = gs.p2.weapon   // #3056 the run carries TWO guns in co-op
    const next = makeGame(gs.seed, gs.loop + 1, carryLives)
    next.score = carryScore
    next.lives = carryLives
    next.nextExt = gs.nextExt   // #3041 the extend mark belongs to the run, not the stage
    if (carryGun !== 'rifle') next.p.weapon = carryGun
    // #3056 THE SEAT CARRY — the loop carried the hero's gun but rebuilt the
    // blue seat as a rifle, so a wingman's captured SPREAD died at STAGE CLEAR
    // while the hero's marched on. That broke the game's own laws: capsules
    // are per seat, the structural law says whatever the hero obeys the blue
    // seat obeys, and #2894's spec ("the gun the run carried carries too")
    // describes a run with two guns. The carry is the hero's rule verbatim —
    // and it can only ever move a legitimately-held gun, because both seats'
    // death-revert laws (the clean rifle at respawn, #2814) already ran on
    // any seat that fell short of the boundary. Zero gs.r; p2.weapon already
    // rides stateHash, so replays pin the carry with no new hash surface.
    if (carryGun2 !== 'rifle') next.p2.weapon = carryGun2
    return next
}

// #2917 THE SORTIE CADENCE LAW — the arcade-loop fairness spine applied to the
// gunship layer. The loop is allowed to raise sortie CADENCE (how often the
// hangar cycles), never flight paths or round speeds. But the honest autopilot
// — the calibration standard this game tunes against — clears loops 2/3 with
// the cadence ramped by the full tempo k, yet DIES on seeds 6 and 9 at the
// capped k≥1.3 when the hangar joins the cannons' already-hot rearm. A threat
// that needs a new brain answer is a threat that needs a softer cadence, so
// the sortie layer ramps at HALF the tempo (1 + (k−1)/2): every pass still
// flies sorties sooner than the last, the loop 1 pass is untouched (k=1 → 1),
// and the bank clears 12/12 at every pass including the ceiling. The threat
// bends toward the brain; the brain never changes.
export function sortieK (k) {
    return 1 + (k - 1) * 0.5
}

// #2902 THE LOOP SPEAKS — the presentation law of the resume. Every value the
// player SEES or HEARS as "round two" is a pure function of the pass number:
// the shell derives banner length, sky heat and voice pitch from gs.loop, so
// no cue can desync from the tempo the sim actually runs at (the sim can't
// lie about the heat — and none of this touches gs, gs.r or the hash).
export const LOOP_FX = 110           // banner ticks: bar wipe-in, the slam, the read, two quiet beats
export const LOOP_SKY_HOT = 3       // the jungle sky reddens from this pass (one notch, capped at loop 4)
export const LOOP_VOICE_HOT = 2     // enemy reports rise in pitch from this pass
// voice pitch for enemy gun reports on loop n: +6% a pass, capped with the
// tempo (holds from loop 4, mirroring loopK's ceiling).
export function loopVoice (n) {
    return Math.min(1 + 0.06 * 3, 1 + 0.06 * (Math.max(1, Math.floor(n)) - 1))
}

// #3047 THE BED LAW (never-dry stage — the cabinet drives its march under the
// run). Pure derivations the harness can pin, the loopVoice precedent above:
// the sim owns what the stage SOUNDS like, the shell only maps names onto the
// music engine. bedFor names the bed a phase drives under — the fortress gets
// the variation-up, the jungle and the waterfall share the march (the section
// break is a camera turn, not a song change). liftStep is the tempo a bed is
// voiced at: the resting step divided by the loop heat, pinned with the tempo
// (the march never runs faster than LOOP_CAP — the same ceiling loopK holds).
// Both consume nothing: zero gs.r, no state touched, no hash surface — the
// presentation-is-outside-the-referee law (#3035 rollT), every pre-bed pin,
// twin stream, autopilot sweep and PLAICRAFT take byte-stands.
export function bedFor (phase) {
    return phase === 'boss' ? 'contraGate' : 'contra'
}
export function liftStep (baseStep, k) {
    return baseStep / Math.max(1, Math.min(LOOP_CAP, k || 1))
}

const PAD0 = { left: false, right: false, up: false, down: false, a: false, b: false }

// mulberry32 as pure state-in/state-out: the rng is just an integer on gs.
export function rnd (gs) {
    gs.r = (gs.r + 0x6d2b79f5) >>> 0
    let t = gs.r
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// One solid-topped platform list (jump through from below, land from above).
export const PLATFORMS = [
    { x: 320, y: 150, w: 96 },
    { x: 560, y: 140, w: 80 },
    { x: 800, y: 152, w: 110 },
    { x: 1180, y: 142, w: 90 },
    { x: 1520, y: 150, w: 120 },
    { x: 1760, y: 138, w: 80 },
]

// The waterfall shelves — zigzag, each one reachable from the one below:
// rise <= 44 (jump apex ~48) and edge gap <= 55 (one jump travels ~74px).
// The last entry is the boss arena floor, full width.
export const FALLS_LEDGES = [
    { x: 110, y: 662, w: 160 },  // the lip you land on entering
    { x: 30, y: 618, w: 110 },
    { x: 170, y: 574, w: 170 },
    { x: 40, y: 530, w: 150 },
    { x: 230, y: 486, w: 130 },
    { x: 70, y: 442, w: 140 },
    { x: 250, y: 398, w: 120 },
    { x: 90, y: 354, w: 130 },
    { x: 260, y: 310, w: 110 },
    { x: 80, y: 266, w: 150 },
    { x: 230, y: 222, w: 140 },
    { x: 80, y: 186, w: 150 },    // last lip before the arena floor
    { x: 0, y: 150, w: 384 },     // the arena floor before the gate
]

const SOLDIERS = [
    { x: 300, y: 196, hold: false },
    { x: 600, y: 140, hold: true },   // platform gunner on the walkways
    { x: 760, y: 196, hold: false },
    { x: 855, y: 152, hold: true },
    { x: 1120, y: 196, hold: false },
    { x: 1225, y: 142, hold: true },
    { x: 1400, y: 196, hold: false },
    { x: 1580, y: 150, hold: true },
    { x: 1900, y: 196, hold: false },
    // S3 grenade soldiers: runners that lob arcing bombs on the approach
    { x: 700, y: 196, hold: false, nade: true },
    { x: 1150, y: 196, hold: false, nade: true },
    { x: 1750, y: 196, hold: false, nade: true },
]
const TURRET_AT = [470, 1050, 1650]
const BARREL_AT = [640, 662, 980, 1300, 1840]

// S3 tree-line snipers: elevated, long range, and the fastest aimed round the
// jungle throws. The flashing scope glint (t < 40) is the telegraph — the round
// always announces itself before it flies. #2905: they are no longer fixed —
// each nest owns three canopy perches and walks to the next after every shot,
// the cabinet's crossfire shifting between volleys.
const SNIPERS = [
    { x: 520, y: 150 },
    { x: 905, y: 136 },
    { x: 1270, y: 132 },
    { x: 1800, y: 126 },
    // S3.5: one rides the arms depot roof (y = slab top) — blown off when it
    // falls. Exempt from the drift: its x === dp.x identity IS the roof law.
    { x: 1700, y: 152, roof: true },
]

// #2905 perch drift — perches are offsets around the nest on a FIXED rotation
// (zero new gs.r draws, the courier/cascade law reused): same seed, same
// crossfire. The relocation rides gs.lk (loop tempo, like the walker pace) and
// fits strictly inside the reload: RELOC 30 ticks vs a cooldown of at least
// 150/k — at the hottest k = 1.3 it still settles ~50 ticks before the glint,
// so the aim is always frozen while the telegraph is flashing.
const PERCH_OFF = [[0, 0], [-34, 6], [30, -7]]
const PERCH_RELOC = 30

// S3 capsule wheel — the letters that fly. Deterministic draw on spawn.
const CAP_KINDS = ['spread', 'machine', 'fire', 'laser']
// #3060: the cabinet's wheel has a FIFTH letter — B, the barrier. It is not a
// gun (the shield coexists with whatever barrel you hold), so it rides its own
// capsule entity gs.bcap on its own zero-rng lane — CAP_KINDS stays the four
// guns and every letter draw the schedule makes byte-stands.
const CAP_ALT = [124, 148, 172]  // low (stand), hop, full jump
const WCODE = { rifle: 0, spread: 1, machine: 2, fire: 3, laser: 4 }
const KCODE = { r: 0, s: 1, m: 2, f: 3, l: 4 }

// #2847 pod carriers — the flight band sits ABOVE the gun-line (a plane never
// eats a round aimed at the ground; deliberate up-aim or a hop takes it), yet
// low enough that a grounded 45° climbs to it within ~20 px of travel.
export const CARRIER_ALT = [150, 164]

// Gunners holding the waterfall shelves (y = their shelf top).
const FALLS_GUNNERS = [
    { x: 260, y: 574 },
    { x: 300, y: 486 },
    { x: 310, y: 398 },
    { x: 315, y: 310 },
    { x: 300, y: 222 },
]

// #3064 RAPPELLERS — the gorge's missing reinforcement: the cliff drops men
// down ropes into the climb. Three stations (left wall, centre overhang, right
// wall) rotate on the drop counter; the hang offset is measured below the
// view top at spawn, so every rappel descends out of rock into the player's
// screen the way the cabinet's did. The schedule is seed/tick arithmetic
// (the courier/sortie law verbatim — ZERO gs.r draws).
export const RAP_STATIONS = [
    { x: 44, hang: 54 },
    { x: 196, hang: 42 },
    { x: 340, hang: 62 },
]

// #3067 THE FROGMEN stations: three boughs on a wheel, measured as leads ahead
// of the camera (the courier/sortie/rappel one-at-a-time law verbatim; leads
// are camera-arithmetic so the wheel is seed-stable in replay). At jlDropBand
// the seat walks into the man's column; the coil+drop (~31 t) lands him ~54 px
// short of the arriving hero — visible, readable, and never a free hit.
export const JL_STATIONS = [
    { lead: 170 },
    { lead: 230 },
    { lead: 290 },
]

// The gate: two cannon emplacements and two spawn doors (world == screen y
// once the camera locks at 0). The wall itself is armor — only the core hurts
// the gate; but each housing is a depot slab: ten rounds cave one (#2880).
const GUNS = [{ x: 190, y: 36 }, { x: 330, y: 60 }]
const DOORS = [{ x: 250, y: 150 }, { x: 16, y: 150 }]

// #2885 SCRIPTED FINALE — the original's gate dies position-by-position, not
// as random noise around the wall. The chain walks the fortress: the guns are
// silenced first, then the wall comes apart in tiers, bottom to top, and the
// heart goes last. Same sites on EVERY seed (zero gs.r — a replay and a fresh
// fight show the identical fire), same sites the wall art draws.
export const CASCADE = [
    { x: GUNS[0].x, y: GUNS[0].y - 4 },          // the near gun blows out
    { x: 210, y: 134 },                           // wall foot, left tier
    { x: 250, y: 118 },                           // under the spawn arch
    { x: GUNS[1].x, y: GUNS[1].y - 4 },          // the far gun follows
    { x: 306, y: 122 },
    { x: 354, y: 138 },                           // foot tier complete
    { x: 222, y: 62 },                            // second tier, beside the core
    { x: 288, y: 50 },
    { x: 342, y: 76 },
    { x: 214, y: 26 },                            // top tier along the parapet
    { x: 300, y: 22 },
    { x: CFG.gsHangarX, y: CFG.gsHangarY + 2 },   // #2917 the hangar mouth blows out
    { x: 368, y: 42 },
    { x: 186, y: 110 },                           // the core housing cracks
    { x: 200, y: 96 },                            // and the heart goes last
]

// #2885 hanging vines — the original put the odd vine on the way up. Each
// hangs from a canyon overhang so its LOW point sits at chest height over a
// shelf's middle; swinging (pure tick arithmetic, zero gs.r) the tip sweeps
// ± ~70 px across the shelf and rises ~44 px. A hero who catches a tip
// AIRBORNE rides the arc; the vine flings its rider at least vineCarryMin
// above the catch — the gorge's carriers, an alternate line up the climb.
// The torrent still takes a low-hanging rider: hazard law untouched.
export const VINES = [
    { x: 190, y: 568, len: 80, ph: 0 },                 // above the entry lip
    { x: 140, y: 348, len: 80, ph: Math.PI / 2 },       // mid-gorge, left face
    { x: 315, y: 224, len: 72, ph: Math.PI },           // right face, upper third
    { x: 155, y: 100, len: 72, ph: Math.PI * 1.5 },     // below the arena floor
]

const VINE_W0 = Math.PI * 2 / CFG.vinePeriod

export function vineTheta (gs, i) {
    return CFG.vineAmp * Math.sin(gs.tick * VINE_W0 + VINES[i].ph)
}
export function vineOmega (gs) {
    return CFG.vineAmp * VINE_W0 * Math.cos(gs.tick * VINE_W0)
}
export function vineTip (gs, i) {
    const v = VINES[i]
    const th = CFG.vineAmp * Math.sin(gs.tick * VINE_W0 + v.ph)
    const w = CFG.vineAmp * VINE_W0 * Math.cos(gs.tick * VINE_W0 + v.ph)
    return { x: v.x + Math.sin(th) * v.len, y: v.y + Math.cos(th) * v.len, vy: -Math.sin(th) * w * v.len }
}

// one soldier shape, one place (S3 adds the nade flag; throws ride a
// deterministic per-x cadence so makeGame never touches gs.r)
function mkSoldier (d) {
    return {
        x: d.x, y: d.y, hold: d.hold, hp: d.nade ? 2 : 1, awake: false, t: 0, walk: 0, walkDir: -1,
        dead: false, flash: 0, nade: !!d.nade, throwT: d.nade ? 8 + ((d.x * 31) >>> 3) % 12 : 0,
    }
}

// S4 aim target: enemies lead the NEARER live hero's lane (both seats answer
// the hop law — a jump dodges for whoever the round was aimed at).
function aimTarget (gs, x) {
    const p = gs.p, q = gs.p2
    const hp = !p.out && p.dead === 0
    const hq = !q.out && q.dead === 0
    if (hp && hq) return Math.abs(p.x - x) <= Math.abs(q.x - x) ? p : q
    if (hp) return p
    if (hq) return q
    return null
}

// The seat law (S4): BOTH heroes run this same function — run, 8-way aim,
// coyote, one-way ledges, drop-through, the fire cadence. Identical physics
// is structural here, not copy-pasted: whatever law the hero obeys, the blue
// seat obeys, because it's the same load-bearing code.
function seatStep (gs, h, pad, ledges, floorY, owner) {
    const jumpEdge = pad.a && !h.prevA
    h.prevA = pad.a
    // #3038 THE DUCK — the cabinet's ground profiles. DOWN on the ground cycles
    // stand -> kneel -> prone (the second press); UP stands from either. A jump
    // stands you (you somersault from your feet), and being airborne clears the
    // profile — mid-air you are never ducked. Latched state, edge-driven, zero
    // gs.r: the same pads replay the same posture, and it rides stateHash below
    // because profile is sim truth (it moves the hit box and the muzzle).
    if (h.onGround && !jumpEdge) {
        if (pad.down && !h.prevD && h.posture < 2) { h.posture += 1; gs.ev.push({ type: 'duck', o: owner, post: h.posture }) }
        else if (pad.up && !h.prevU && h.posture > 0) { h.posture = 0; gs.ev.push({ type: 'duck', o: owner, post: 0 }) }
    } else if (h.posture > 0) h.posture = 0
    h.prevD = pad.down; h.prevU = pad.up
    const aim = aimFrom(pad, h)
    h.ax = aim.ax; h.ay = aim.ay
    const runDir = (pad.right ? 1 : 0) - (pad.left ? 1 : 0)
    if (runDir) { h.x += runDir * (h.posture > 0 ? CFG.run * CFG.duckSpeed : CFG.run); h.walk += 1 }
    if (gs.phase === 'jungle') h.x = Math.max(4, Math.min(CFG.worldW - 4, h.x))
    else h.x = Math.max(8, Math.min(gs.phase === 'boss' ? CFG.wallX - 10 : W - 8, h.x))
    h.px = h.x

    if (h.onGround) h.coyote = CFG.coyote
    else if (h.coyote > 0) h.coyote -= 1
    // #3035 THE SOMERSAULT (ART bar 2 — falls animate): the cabinet turns the
    // hero a full revolution through a jump. The clock is presentation, like
    // `walk` — it never enters stateHash and never draws gs.r, so physics and
    // every determinism pin are byte-identical. Only a real jump arms it (the
    // line below); ground and a vine catch clear it. Stepping off a ledge or
    // dropping through a platform rides the arc upright, as the cabinet does.
    if (h.onGround) h.rollT = 0
    else if (h.rollT > 0) h.rollT += 1

    // #2885 hanging vines (falls): a seat that catches a swinging tip AIRBORNE
    // rides the arc — no steering on the rope (the cabinet's drop law), but the
    // trigger still answers. The vine FLINGS its rider at the far apex, at least
    // vineCarryMin above the catch — the canyon's carrier. Jump releases early
    // with the swing's momentum. It lives in seatStep, so the blue seat rides
    // under the identical law — structural, not copy-pasted.
    if (gs.phase === 'falls' && h.vine >= 0) {
        const tp = vineTip(gs, h.vine)
        h.x = Math.max(8, Math.min(W - 8, tp.x))
        h.y = tp.y + CFG.vineHang
        h.vx = 0; h.vy = 0; h.onGround = false
        h.face = tp.vy < 0 ? 1 : -1 // read the swing: rising faces the climb
        if (pad.b && h.cool === 0) { fire(gs, h, owner); h.cool = coolOf(h.weapon) }
        if (h.inv > 0) h.inv -= 1
        h.rideT += 1
        const lifted = h.vineAtY - h.y
        const apexFling = lifted >= CFG.vineCarryMin && tp.vy < -0.05
        if (jumpEdge || apexFling || h.rideT > CFG.vineRideMax) {
            const v = VINES[h.grabI]
            const thG = CFG.vineAmp * Math.sin(gs.tick * VINE_W0 + v.ph)
            const wG = CFG.vineAmp * VINE_W0 * Math.cos(gs.tick * VINE_W0 + v.ph)
            h.vine = -1; h.grabI = -1; h.rideT = 0
            h.vx = Math.max(-2.4, Math.min(2.4, Math.cos(thG) * wG * v.len))
            h.vy = Math.min(-1.8, -Math.sin(thG) * wG * v.len - CFG.vineLiftBoost)
            gs.ev.push({ type: 'unvine', o: owner })
        }
        return
    }
    if (jumpEdge && h.onGround) {
        const onPlat = ledges.some((pl) => h.px >= pl.x && h.px <= pl.x + pl.w && Math.abs(h.y - pl.y) < 2)
        if (pad.down && onPlat) { h.drop = 12; h.y += 2; h.onGround = false; h.vy = 0.5 }
        else { h.vy = CFG.jumpV; h.onGround = false; h.rollT = 1; gs.ev.push({ type: 'jump', o: owner }) }
    }
    if (h.drop > 0) h.drop -= 1

    // #2885 fling momentum: horizontal carry after a vine release, decaying —
    // the swing keeps pushing you after you let go, then the run takes over.
    if (h.vx) { h.x = Math.max(8, Math.min(gs.phase === 'boss' ? CFG.wallX - 10 : W - 8, h.x + h.vx)); h.vx *= 0.92; if (Math.abs(h.vx) < 0.08) h.vx = 0 }
    h.vy += CFG.grav
    h.y += h.vy
    h.onGround = false
    if (h.y >= floorY) { h.y = floorY; h.vy = 0; h.onGround = true }
    else if (h.vy > 0 && h.drop === 0) {
        h.px = h.x
        for (const pl of ledges) {
            if (h.px >= pl.x - 3 && h.px <= pl.x + pl.w + 3 && h.y >= pl.y && h.y - h.vy <= pl.y + 1) {
                h.y = pl.y; h.vy = 0; h.onGround = true; break
            }
        }
    }
    if (h.onGround) { h.lane = h.y; h.vx = 0 }   // the lane enemies lead: the ground you run on

    // #2885 grab: airborne, REACHING (the jump key held — a punch of intent,
    // the same law the cabinet's rope grabs obey), body inside the box around a
    // swinging tip. Grounded contact never takes the vine — the climb keeps its
    // own two feet.
    if (gs.phase === 'falls' && !h.onGround && h.vine < 0 && pad.a) {
        for (let vi = 0; vi < VINES.length; vi++) {
            const tp = vineTip(gs, vi)
            if (Math.abs(h.x - tp.x) <= CFG.vineGrabHW && Math.abs((h.y - 14) - tp.y) <= CFG.vineGrabVH) {
                h.vine = vi; h.grabI = vi; h.rideT = 0; h.vineAtY = h.y
                h.vx = 0; h.vy = 0
                h.rollT = 0   // #3035 a hanging rider does not tumble
                gs.ev.push({ type: 'vine', o: owner })
                break
            }
        }
    }

    if (h.cool > 0) h.cool -= 1
    if (pad.b && h.cool === 0) {
        fire(gs, h, owner)
        h.cool = coolOf(h.weapon)
    }
    if (h.inv > 0) h.inv -= 1
}

// S4 CPU seat: deterministic honest perception (visible things only — the same
// law the autopilot lives by, and no rng: the brain is a pure function of gs).
// He rides YOUR shoulder, not a fixed post: an arcade partner stays in frame
// with P1, and it matters mechanically — a teammate parked on another lane
// steals aim and threads rounds through the hero's line. Shadowing behind keeps
// the nearer-hero law mostly on the hero (as if he were solo), while the blue
// gun still adds firepower, takes capsules that reach him, and hops the same
// threats. Falls: he climbs the hero's shelf-line. Boss: he shadows the band.
// #3000 THE AIM SHOUT rides above every phase's own aiming: "AIM UP" pins the
// diagonal (the cabinet's anti-air), "AIM DOWN" the airborne down-angle
// (aimFrom keeps down mid-air-only, the cabinet law), "AIM LEVEL" hands the
// barrel back to the brain's own uses (capsule reach, core diagonals). The
// feet and the dodges stay the brain's — an order moves the gun, not the hop
// window; the fairness spine is pad-and-threat only. Dead/out/over: stance
// waits (no cosmetic hash churn on a frozen seat).
function allyBrain (gs) {
    const pad = allyBrainBase(gs)
    if (gs.end || gs.p2.dead > 0 || gs.p2.out) return pad
    const aim = gs.orderAim || 'level'
    if (aim === 'up') { pad.up = true; pad.down = false }
    else if (aim === 'down') { pad.up = false; pad.down = true }
    return pad
}

function allyBrainBase (gs) {
    const q = gs.p2
    const pad = { left: false, right: false, up: false, down: false, a: false, b: true }
    if (q.dead > 0 || q.out || gs.end) { pad.b = false; return pad }
    const p = gs.p
    const heroLive = !p.out && p.dead === 0

    if (gs.phase === 'falls') {
        // #3000: formation orders do NOT steer the falls climb — the torrent
        // law outranks the shout (pinned: a HELD seat climbs the identical
        // line as the un-spoken twin; ignoring an order that means "drown" is
        // the wingman's standing law, same family as the spawn-door bounds).
        pad.right = false; pad.left = false
        // climb the hero's line — when the torrent has him in the low third,
        // skip straight to the hero's own shelf and jump at every footfall;
        // a lagging partner re-joins the climb or the water takes him
        const desperate = q.y > gs.camY + H - 90
        const foot = q.onGround ? q.y : q.lane
        let ti = heroLive && gs.apT != null && gs.apT >= 0 ? (desperate ? gs.apT : Math.max(0, gs.apT - 1)) : q.tIdx
        let t = ti >= 0 && ti < FALLS_LEDGES.length ? FALLS_LEDGES[ti] : null
        // Reachability is measured from his FEET, not his airborne body: a
        // shelf more than one jump (apex ~48) above the rock he stands on is a
        // lie. Chasing the hero's shelf from mid-air steered him right across
        // the x140-170 gap on the descent — the same grave at x=172,y=640 on
        // every seed (#2798: repeated identical ally drown = brain bug).
        const reach = (sh) => !!sh && sh.y < foot - 4 && sh.y >= foot - 52
        if (!reach(t)) {
            const cand = FALLS_LEDGES.filter((l) => l.y < foot - 4 && l.y >= gs.camY - 20)
            t = cand.length ? cand.reduce((a, b) => (a.y > b.y ? a : b)) : null
            ti = t ? FALLS_LEDGES.indexOf(t) : -1
        }
        q.tIdx = ti
        if (t) {
            if (q.x < t.x + 4) pad.right = true
            else if (q.x > t.x + t.w - 4) pad.left = true
            if (q.onGround) {
                const inBand = q.x >= t.x - 6 && q.x <= t.x + t.w + 6
                // the hero's edge law: when the target lies past the edge of my
                // own shelf, leap at the last step — a shelf across a gap is
                // jumped, never walked off (the autopilot climbs exactly this way)
                const sup = FALLS_LEDGES.find((l) => Math.abs(q.y - l.y) < 2 && q.x >= l.x - 3 && q.x <= l.x + l.w + 3)
                const offEdgeSoon = sup && ((t.x + t.w > sup.x + sup.w + 6 && q.x + CFG.run >= sup.x + sup.w - 1) || (t.x < sup.x - 6 && q.x - CFG.run <= sup.x + 1))
                if (inBand || offEdgeSoon) pad.a = true
            }
        }
        if (desperate && q.onGround && !pad.a && !t) {
            // panic-hop only when NOTHING reachable is above him. While a
            // target exists, walk to it — the edge law jumps it at the last
            // step. An early hop under an across-gap shelf wastes the run-up:
            // seed 2's ally launched 14px before shelf 3's edge, grazed the
            // apex ~2px short of shelf 4 and hit the torrent in the
            // x190-230 gap (the same grave at x=234,y=511 on most seeds).
            pad.a = true
        }
        return pad
    }

    if (gs.phase === 'boss') {
        pad.right = false; pad.left = false
        // shadow the hero's patrol, clamped off the left spawn-door step —
        // #3000 formation orders bend the anchor: SPREAD takes the far flank,
        // HOLD stands at the post he was given (never into the spawn-door step).
        const form = gs.orderForm || 'follow'
        let anchor
        if (form === 'spread') anchor = heroLive ? Math.max(90, p.x - CFG.callSpreadGapBoss) : 100
        else if (form === 'hold') anchor = Math.max(gs.holdX || q.x, 90)
        else anchor = heroLive ? Math.max(90, p.x - 24) : 100
        const d = anchor - q.x
        pad.right = d > 8; pad.left = d < -8
        pad.up = gs.tick % 140 < 78          // diagonals reach the core from the band
        const runner = gs.soldiers.filter((s) => !s.dead && s.awake).sort((a, b) => Math.abs(a.x - q.x) - Math.abs(b.x - q.x))[0]
        if (runner) { pad.up = false; pad.right = runner.x > q.x + 2; pad.left = runner.x < q.x - 2 }
        for (const b of gs.eb) {
            const dx = b.x - q.x
            const toward = (dx > 0 && b.vx < -0.3) || (dx < 0 && b.vx > 0.3) || (b.vy > 0.5 && Math.abs(dx) < 14)
            if (toward && Math.abs(b.y - (q.y - 14)) < 34 && Math.abs(dx) < 60 && Math.abs(b.vy) < 1.2 && q.onGround) { pad.a = true; break }
        }
        // Never fall back into a round still in the road: once a shot is
        // inbound on his side, drive away from its nose until it passes behind
        // — but the left spawn-door step stays out of bounds: the arcade answer
        // to a shot from the left while cornered is the hop, not a retreat into
        // the gunners' door (the #2798 sweep saw him retreat to x=10 and take
        // the next round point-blank).
        for (const b of gs.eb) {
            if (b.gr || Math.abs(b.y - (q.y - 14)) > 30) continue
            const dx = b.x - q.x
            if (dx > 0 && b.vx < -0.3 && dx < 70) {
                if (q.x > 90) { pad.right = false; pad.left = true } else { pad.a = true }
                break
            }
            if (dx < 0 && b.vx > 0.3 && dx > -70) {
                if (q.x > 40) { pad.left = false; pad.right = true } else { pad.a = true }
                break
            }
        }
        return pad
    }

    // jungle: ride the hero's shoulder (or press on when the pool is gone) —
    // #3000 formation orders bend the anchor: SPREAD takes the lagging flank,
    // HOLD stands at the post he was given, and the post is RELEASED when the
    // scroll reaches it (the board took the spot; chasing resumes — pinned).
    const form = gs.orderForm || 'follow'
    let anchor
    if (form === 'spread') anchor = heroLive ? p.x - CFG.callSpreadGap : gs.cam + 60
    else if (form === 'hold') {
        anchor = Math.max(gs.holdX || q.x, gs.cam + CFG.callHoldEdge)
        if (q.x < gs.cam + CFG.callHoldEdge + 4) { gs.orderForm = 'follow'; anchor = heroLive ? p.x - 26 : gs.cam + 60 }
    } else anchor = heroLive ? p.x - 26 : gs.cam + 60
    const d = anchor - q.x
    pad.right = d > 8; pad.left = d < -8
    // #2814 stay-in-line law: a partner never outruns a live hero into the
    // uncleared kill zone (seed 1's grave at x=1726 was two bodies past the
    // line — the prize is not worth the pool).
    if (heroLive && p.dead === 0 && q.x > p.x + 4) { pad.right = false; pad.left = true }
    // #2814 watch-your-back law: the honest killer of a trailing partner is
    // the walker that got behind the nose gun (seed 1: two contact deaths from
    // his blind side). A fair player turns and shoots — so does he.
    let behind = null
    for (const s of gs.soldiers) {
        if (s.dead || !s.awake) continue
        const sdx = s.x - q.x
        if (sdx < 0 && sdx > -90 && Math.abs(s.y - q.y) < 20 && (!behind || s.x > behind.x)) behind = s
    }
    if (behind) { pad.right = false; pad.left = true }
    for (const br of gs.barrels) if (!br.gone && br.x > q.x - 6 && br.x - q.x < 22 && q.onGround) pad.a = true
    if (!pad.a) for (const b of gs.eb) {
        if (b.gr) {
            if (b.vy > 0 && q.onGround && Math.abs(b.x - q.x) < 34 && b.y > CFG.ground - 110) { pad.a = true; break }
            continue
        }
        const dx = b.x - q.x
        const toward = (dx > 4 && dx < CFG.hopBand) || (dx < -4 && dx > -CFG.hopBand && b.vx < -0.3)
        // #2814 hop the ARC, not the line: turret and sniper rounds curve
        // (vy 0.5-1.0), so judge the round's HEIGHT AT ARRIVAL, not where it
        // sits now — seed 1's ally died at dx=8 because the flat window only
        // opened when the hop could no longer lift his chest.
        const eta = Math.abs(dx) / Math.max(0.5, Math.abs(b.vx))
        const pred = Math.abs(b.y + b.vy * Math.min(eta, 16) - (q.y - 14))
        if (q.onGround && toward && b.vy < 1.2 && pred < 12) { pad.a = true; break }
    }
    const c = gs.capsule
    if (c && Math.abs(c.x - q.x) < 60 && c.x <= p.x + 10) {
        // the capsule is fair game when the hero isn't already at it
        if (!pad.a && c.y < q.y - 22 && q.onGround) pad.a = true
        if (Math.abs(c.x - q.x) < 16 && c.y < q.y - 26) pad.up = true
    }
    const v = gs.vc.concat(gs.pods).filter((k) => k.x > q.x - 6).sort((a, b) => a.x - b.x)[0]
    if (!pad.a && v && v.x - q.x < 40 && v.y < q.y - 22) pad.a = true
    return pad
}

export function makeGame (seed, loop = 1, lives = 3, score = 0) {
    const lp = Math.max(1, Math.floor(loop) || 1)   // #2894 arcade loop: pass n>1 to run stage 1 faster
    // #3037: the Konami prize enters HERE and nowhere else — default 3 keeps every
    // pre-Konami run byte-identical (lives already enters stateHash, so armed runs
    // are honestly replayable too). Clamped to the HUD's numeric form (99).
    const lv = Math.max(1, Math.min(99, Math.floor(lives) || 3))
    // #3042 the CONTINUE carry: a paid continue re-enters the fight with the score
    // it earned. Default 0 keeps every pre-continue run byte-identical, and score
    // already rides stateHash — a replay that silently wipes the carry diverges loudly.
    const sc = Math.max(0, Math.floor(score) || 0)
    const gs = {
        seed: seed >>> 0,
        r: (seed >>> 0) ^ 0x9e3779b9,
        tick: 0,
        loop: lp,                   // #2894 which pass of stage 1 this is (1 = first)
        lk: loopK(lp),            // #2894 the pressure multiplier this run lives under (pure fn of loop)
        cam: 0,
        camY: 0,
        phase: 'jungle',            // jungle | falls | boss
        score: sc,                  // #3042 CONTINUE carry — the score a paid continue re-enters with
        lives: lv,
        nextExt: extMark(sc),   // #3041 the score mark the next extend pays at; #3042 — derived from the
                                //   entry bank so a carried continue starts above the rung it already bought
        end: null,                  // 'dead' | 'win'
        p: {
            x: 40, y: CFG.ground, vy: 0, onGround: true, face: 1,
            lane: CFG.ground,       // last grounded feet-y — enemies aim the LANE, not the airborne hero
            ax: 1, ay: 0,            // normalized 8-way aim (ax = straight ahead by default)
            cool: 0, weapon: 'rifle', // the wheel: rifle|spread|machine|fire|laser — the weapon dies with you
            inv: 120,               // spawn-in grace
            dead: 0,                // freeze ticks after a hit
            coyote: 0, drop: 0,     // coyote frames; ignore-platform frames
            walk: 0,                // animation phase (world ticks)
            rollT: 0,               // #3035 somersault clock — presentation, like walk
            posture: 0,           // #3038 ground profile: 0 stand | 1 kneel | 2 prone
            barr: 0,              // #3060 barrier ticks left — the shield eats rounds,
                                  //   so it is sim truth (it rides stateHash)
            out: false,             // pool spent on this seat — the run goes on without it
            prevA: false,           // jump latch (edge-detect for taps)
            prevD: false, prevU: false,  // #3038 duck latches — the profile cycles on EDGES
            // #2885 vine law: vine = tip being ridden (-1 free), grabI keeps the
            // index through the release tick; vx is the fling's decayed momentum.
            vine: -1, grabI: -1, rideT: 0, vineAtY: 0, vx: 0,
        },
        // S4 the second seat: mirror of p — #2814: no bank of his own, his
        // deaths drain the shared gs.lives pool like the hero's. CPU-brained
        // until a human takes it drop-in (q.human). Same physics laws — both
        // seats run through the same seatStep, so the hop-law/lane law is
        // structural.
        p2: {
            x: 40 + CFG.allySpawnDX, y: CFG.ground, vy: 0, onGround: true, face: 1,
            lane: CFG.ground, ax: 1, ay: 0,
            cool: 0, weapon: 'rifle',
            inv: 120, dead: 0, coyote: 0, drop: 0, walk: 0, out: false,
            rollT: 0,               // #3035 the somersault is structural — both seats
            posture: 0,           // #3038 the duck is structural too — same seatStep
            barr: 0,              // #3060 the barrier is structural too — same laws
            human: false, tIdx: -1, zz: 1, prevA: false,
            prevD: false, prevU: false,
            // #2837: padClaim marks a seat a HUMAN claimed at the keyboard (the
            // auto-release law watches it, so harness shortcuts stay pinned);
            // enterT counts the arrival descent; idle the drop-out patience.
            enterT: 0, idle: 0, padClaim: false,
            // #2885: the same vine law, structurally — seatStep carries it
            vine: -1, grabI: -1, rideT: 0, vineAtY: 0, vx: 0,
            safe: { x: 40 + CFG.allySpawnDX, y: CFG.ground },
        },
        safe: { x: 40, y: CFG.ground },   // respawn point (last ground/shelf touched)
        prevA: false,
        pb: [],                     // player bullets {x,y,vx,vy,k[,ph,hits]}
        eb: [],                     // enemy bullets (gr = lobbed grenade)
        soldiers: SOLDIERS.map(mkSoldier),
        rapT: 0,                    // #3064 next rappel drop (falls-only schedule)
        rapN: 0,                    // #3064 drop counter — which station is next
        jlT: CFG.jlFirst + ((seed * 37) % CFG.jlJit),   // #3067 next frogman onto the trail (seed-keyed, zero gs.r — the #2847 multiplication-first lesson)
        jlN: 0,                     // #3067 bound counter
        snipers: SNIPERS.map((d) => ({ x: d.x, y: d.y, hp: 1, awake: false, t: 0, aim: Math.PI, flash: 0, dead: false, bx: d.x, by: d.y, roof: !!d.roof, pi: 0, rx: d.x, ry: d.y, relocT: 0, dir: 0 })),
        turrets: TURRET_AT.map((x, i) => ({ x, y: CFG.ground, hp: 2, aim: Math.PI, t: 40 + i * 27, dead: false })),
        barrels: BARREL_AT.map((x) => ({ x, y: CFG.ground, gone: false })),
        capsule: null,              // {x,y,vx} — flies in from the right edge
        nextCapsule: 240,
        // #2847 pod carriers: low gunships ferrying one lettered pod each.
        // ZERO gs.r draws — schedule, altitude and letter ride seed/tick
        // arithmetic (the R-TYPE S3 lesson #2835: the tuned stream stands).
        carriers: [],             // {x,y,vx,hp,kind}
        pods: [],               // released cargo {x,y,vx,vy,kind} — falls, settles, collectable
        nextCarrier: CFG.carrierFirst,
        carrierN: 0,            // courier index for this run (letter/alt seed)
        // #3060 the barrier capsule: the wheel's fifth letter drifts low over
        // the deck on seed/tick arithmetic (zero gs.r — the carrier precedent).
        bcap: null,             // {x,y,vx} while a B capsule is on screen
        nextBarr: CFG.barrFirst + ((((seed >>> 0) * 2654435761) >>> 19) % CFG.barrJitter),   // #3060 — the naive (seed^const)>>>21 was constant for the harness seed set (seeds differ only in low bits); multiply first, then harvest high bits
        depot: { x: 1700, y: CFG.ground, hp: CFG.depotHp, aim: Math.PI, t: 70, dead: false, spawnT: 240 },
        vc: [],                     // S3.5 volley capsules — the depot's payout {x,y,vx,kind}
        // #2917 the gate's gunships live only in the arena (see makeBoss); the
        // fields exist from the drop so art/hash never meet an undefined sky.
        gunships: [],           // {x,y,ty,vx,hp,t,n,dead,flash} — one sortie at a time
        sortieT: 0,             // tick the next sortie is due (0 = arena not armed)
        sortieN: 0,             // sortie index for this run (altitude/jitter seed)
        // #3000 spoken wingman orders (applyCall) — two channels, defaults are
        // today's standing behaviour (level barrel, shoulder hug), so an
        // un-spoken run is the pre-#3000 game byte-for-byte. Rebuilt stages
        // reset them (arcadeLoop calls makeGame): a new stage starts with no
        // orders said.
        orderAim: 'level', orderForm: 'follow', holdX: 0,
        // #2885 hanging vines live only in the falls; riders ride the seat fields
        // (p.vine / p2.vine), the tips are pure tick math — nothing mutable here.
        vines: [],
        boss: null,                 // the gate, once the arena opens (see makeBoss)
        ev: [],                     // effect events (shell drains; not hashed)
    }
    return gs
}

function aimFrom (pad, h) {
    const dx = pad.right ? 1 : pad.left ? -1 : 0
    let dy = 0
    if (pad.up) dy = -1
    else if (pad.down && !h.onGround) dy = 1 // aim down only in mid-air, as on the cabinet
    if (h.posture > 0) dy = 0 // #3038 a ducked profile fires LEVEL off the deck —
                               // the cabinet's kneel/prone rifle never points down,
                               // and UP is spent standing back up, not lifting the barrel
    let ax = dx, ay = dy
    if (dx === 0 && dy === 0) { ax = h.face; ay = 0 }
    else if (dx !== 0) { h.face = dx }
    const m = Math.hypot(ax, ay) || 1
    return { ax: ax / m, ay: ay / m }
}

// owner: 0 = the hero's round, 1 = the ally's (rides the bullet so the harness
// can name which seat fired; also hashed — the two guns are sim truth).
function fire (gs, h = gs.p, owner = 0) {
    const p = h
    // #3038 the muzzle comes down with the body — a kneel or prone round leaves
    // low off the deck, exactly where the drawn arm lines up (see duckMuzzle).
    const o = { x: p.x + p.ax * 10, y: p.y - (CFG.duckMuzzle[p.posture | 0] || 16) + p.ay * 10 }
    if (p.weapon === 'spread') {
        const base = Math.atan2(p.ay, p.ax)
        for (let k = -2; k <= 2; k++) {
            const a = base + k * (CFG.spreadArc / 2)
            gs.pb.push({ x: o.x, y: o.y, vx: Math.cos(a) * CFG.spreadSpeed, vy: Math.sin(a) * CFG.spreadSpeed, k: 's', o: owner })
        }
        gs.ev.push({ type: 'spread', o: owner })
    } else if (p.weapon === 'machine') {
        gs.pb.push({ x: o.x, y: o.y, vx: p.ax * CFG.machineSpeed, vy: p.ay * CFG.machineSpeed, k: 'm', o: owner })
        gs.ev.push({ type: 'shot', k: 'machine', o: owner })
    } else if (p.weapon === 'fire') {
        // the firebar: a slow flame that undulates along its line and pierces
        gs.pb.push({ x: o.x, y: o.y, vx: p.ax * CFG.fireBallSpeed, vy: p.ay * CFG.fireBallSpeed, vy0: p.ay * CFG.fireBallSpeed, k: 'f', ph: (Math.abs(Math.round(o.x)) % 64) / 64 * Math.PI * 2, hits: [], o: owner })
        gs.ev.push({ type: 'fshot', o: owner })
    } else if (p.weapon === 'laser') {
        gs.pb.push({ x: o.x, y: o.y, vx: p.ax * CFG.laserSpeed, vy: p.ay * CFG.laserSpeed, k: 'l', hits: [], o: owner })
        gs.ev.push({ type: 'lshot', o: owner })
    } else {
        gs.pb.push({ x: o.x, y: o.y, vx: p.ax * CFG.bulletSpeed, vy: p.ay * CFG.bulletSpeed, k: 'r', o: owner })
        gs.ev.push({ type: 'shot', o: owner })
    }
}

// cycle length of the current gun — one place so the harness can name it
function coolOf (weapon) {
    return weapon === 'spread' ? CFG.fireCoolSpread
        : weapon === 'machine' ? CFG.fireCoolMachine
            : weapon === 'fire' ? CFG.fireCoolFire
                : weapon === 'laser' ? CFG.fireCoolLaser
                    : CFG.fireCool
}

// kind rides the (unhashed, cosmetic) event so the shell can size the blast:
// 'tnt' = barrel/turret demolition, 'kill' = a soldier dropped, 'death' = hero.
function boom (gs, x, y, hurtTurrets, kind) {
    gs.ev.push({ type: 'boom', x, y, kind: kind || 'tnt' })
    for (const s of gs.soldiers) if (!s.dead && Math.hypot(s.x - x, s.y - y - 12) < CFG.blastR) killSoldier(gs, s)
    if (hurtTurrets) for (const t of gs.turrets) if (!t.dead && Math.hypot(t.x - x, t.y - 18 - y) < CFG.blastR) hitTurret(gs, t)
    // #3038 the blast meets the BELLY, which sits lower with the profile — but
    // an explosion at the deck still takes a prone hero (distance ~2.5 of the
    // 30 px radius): you cannot duck a blast that IS the ground.
    if (gs.p.dead === 0 && gs.p.inv <= 0 && !gs.p.out && Math.hypot(gs.p.x - x, gs.p.y - ((CFG.duckCenter[gs.p.posture | 0] || 14) - 2) - y) < CFG.blastPlayerR) killPlayer(gs)
    // co-op: the blast is symmetric — it takes the blue seat too (#2779 S4)
    if (gs.p2.dead === 0 && gs.p2.inv <= 0 && !gs.p2.out && Math.hypot(gs.p2.x - x, gs.p2.y - ((CFG.duckCenter[gs.p2.posture | 0] || 14) - 2) - y) < CFG.blastPlayerR) killAlly(gs)
}

// #3057 SCORE POPUPS: every point the game pays rides the (unhashed, cosmetic)
// event stream with its value, so the shell can stamp `+n` where it was earned.
// Presentation outside the referee (#3035 class): events never enter stateHash
// (Joust law), pop() draws zero gs.r, and physics never reads a pop.
function pop (gs, x, y, v) {
    gs.ev.push({ type: 'pop', x, y, v })
}

function killSoldier (gs, s) {
    // #3064 the cut law, at the single kill chokepoint (the pop() law shape):
    // a round or a blast on a hanger severs the ride rather than dropping a
    // corpse — the ambush is ended where it hung and pays the turret tier.
    if (s.rap === 1 || s.rap === 2) { cutRap(gs, s); return }
    s.dead = true
    gs.score += 100
    gs.ev.push({ type: 'boom', x: s.x, y: s.y - 12, kind: 'kill' })
    pop(gs, s.x, s.y - 20, 100)
}

// #3064 cutRap — the rope parts and he tumbles: the torrent takes him, or
// rock below hands him back as a rifle gunner who keeps the fight on foot.
// The purse is paid at the cut (the neutralising hit); what he becomes after
// lands in the tiers it already is (a drowned man owes nothing more; the
// shelf gunner his landing recruits is worth the rifle's +100 as ever).
function cutRap (gs, s) {
    s.rap = 3
    s.vy = 0
    gs.score += CFG.rapDrop
    gs.ev.push({ type: 'boom', x: s.x, y: s.y - 12, kind: 'kill' })
    pop(gs, s.x, s.y - 20, CFG.rapDrop)
}

// #3064 where a rope ride ends below its station: any ledge top the fall
// CROSSES this tick (y grows down — rock below is bigger y), past hang +
// rapLandMin (he never lands at his own post). Returns the ledge, the drown
// line's verdict ("water"), or null to keep riding down.
function rapSettle (gs, s) {
    const stepY = s.vy > 0 ? s.vy : CFG.rapSlide
    const prevY = s.y - stepY
    if (s.y > s.hangY + CFG.rapLandMin) {
        const l = FALLS_LEDGES.find((d) => s.x >= d.x - 2 && s.x <= d.x + d.w + 2 && d.y >= prevY - 1 && d.y <= s.y + 2 && d.y > s.hangY + CFG.rapLandMin)
        if (l) {
            s.y = l.y
            s.rap = 0
            s.vy = 0
            s.awake = true
            s.t = CFG.rapTele
            gs.ev.push({ type: 'dust', x: s.x, y: l.y })
            return l
        }
    }
    if (s.y >= gs.camY + H - CFG.drownAt) {
        s.dead = true
        s.rap = 0
        gs.ev.push({ type: 'drown', x: s.x, y: gs.camY + H - CFG.drownAt - 6 })
        return 'water'
    }
    return null
}

function hitTurret (gs, t) {
    t.hp -= 1
    gs.ev.push({ type: 'spark', x: t.x, y: t.y - 18 })
    if (t.hp <= 0) { t.dead = true; gs.score += 300; gs.ev.push({ type: 'boom', x: t.x, y: t.y - 18, kind: 'tnt' }); pop(gs, t.x, t.y - 26, 300) }
}

// #2814 the cabinet's law: ONE pool serves both seats. A seat is DOWN when it
// dies with the pool empty; GAME OVER lands the arcade way — the instant both
// seats are down. A hero who pays the last life leaves his partner running the
// run alone, and the partner's next death ends it (nothing left to respawn on).
function seatsDown (gs) {
    return gs.p.out && gs.p2.out
}

function killPlayer (gs) {
    const p = gs.p
    p.barr = 0   // #3060 death outranks the shield — the guard falls with the guarder
    gs.ev.push({ type: 'boom', x: p.x, y: p.y - 12, kind: 'death' })
    if (gs.lives > 0) gs.lives -= 1
    if (gs.lives <= 0) {
        // pool empty: this seat goes down for good — no freeze (the run goes on
        // under whoever still stands)
        gs.lives = 0; p.out = true
        // #3060 a seat that goes DOWN mid-vine must still be released — the
        // respawn path (#2885) releases the dead who come back, but the dead who
        // stay hung the vine forever: a corpse frozen in the air, and the falls
        // check below kept drowning it every tick, holding the stage hostage.
        p.vine = -1; p.grabI = -1; p.rideT = 0; p.vx = 0; p.vy = 0
        gs.ev.push({ type: 'pdown' })
        if (seatsDown(gs)) { gs.end = 'dead'; gs.ev.push({ type: 'gameover' }) }
        return
    }
    p.dead = CFG.respawnFreeze
}

// The blue seat dies WITHOUT freezing the world (the hero is still playing):
// his tumble counts down inside the live step, then he respawns at his own
// last safe ground, weapon lost, flashing — the same mercy laws the hero gets.
// #2814: his death pays from the SHARED pool — the partner who volunteers can
// cost the team a life, exactly like the cabinet.
function killAlly (gs) {
    const q = gs.p2
    q.barr = 0   // #3060 structural law — the blue seat's shield falls with him too
    gs.ev.push({ type: 'boom', x: q.x, y: q.y - 12, kind: 'death', o: 1 })
    if (gs.lives > 0) gs.lives -= 1
    if (gs.lives <= 0) {
        gs.lives = 0; q.out = true
        gs.ev.push({ type: 'p2down' })
        if (seatsDown(gs)) { gs.end = 'dead'; gs.ev.push({ type: 'gameover' }) }
        return
    }
    q.dead = CFG.respawnFreeze
}

// #2837 the arcade-drop-in spot: the side of the hero, not where the seat
// fell (the law the respawn branch already kept — extracted so the arrival
// drop and the death respawn choose the same shoulder, phase-clamped).
function allySideSpot (gs) {
    const p = gs.p
    const q = gs.p2
    const heroLive = !p.out && p.dead === 0 && p.onGround
    if (heroLive) {
        return {
            x: Math.max(8, Math.min(gs.phase === 'jungle' ? CFG.worldW - 4 : gs.phase === 'boss' ? CFG.wallX - 10 : W - 8, p.x + CFG.allySpawnDX)),
            y: p.lane,
        }
    }
    return { x: q.safe.x, y: q.safe.y }
}

// #2837 drop-in ceremony: the human doesn't hijack the standing wingman where
// he is — the wingman pulls out and a fresh blue soldier rappels in at the
// hero's side (the cabinet's entry: helicopter drop / respawn are arrivals, the
// same mercy laws: inv, clean rifle). Arriving also beats the death tumble:
// the player at the keys never waits out the CPU respawn timer.
// #3000 THE ORDER SEAT (#1711 S5) — a spoken call becomes wingman state.
// Determinism by construction: zero gs.r draws (pinned), the two channels
// replace independently (a height never cancels a formation), and every value
// rides stateHash so a replay cannot silently drop a shout mid-run. HOLD pins
// a world spot, clamped to the live screen — an order is always keepable at
// least to the visible line. Recognition lives in voicecalls.js (the pure
// grammar); this is the seam the browser mic path and the harness share.
export const ORDER_AIMS = ['up', 'down', 'level']
export const ORDER_FORMS = ['follow', 'hold', 'spread']
export function applyCall (gs, intent) {
    if (!intent || typeof intent !== 'object') return { ok: false, why: 'NO CALL' }
    if (gs.end) return { ok: false, why: 'RUN OVER' }
    if (intent.kind === 'aim') {
        if (!ORDER_AIMS.includes(intent.dir)) return { ok: false, why: 'NO CALL' }
        gs.orderAim = intent.dir
        return { ok: true }
    }
    if (intent.kind === 'formation') {
        if (!ORDER_FORMS.includes(intent.dir)) return { ok: false, why: 'NO CALL' }
        gs.orderForm = intent.dir
        if (intent.dir === 'hold') gs.holdX = Math.max(gs.p2.x, gs.cam + CFG.callHoldEdge)
        return { ok: true }
    }
    return { ok: false, why: 'NO CALL' }
}

export function dropIn (gs) {
    const q = gs.p2
    if (q.out || gs.end || q.human) return false
    q.human = true
    q.padClaim = true
    q.dead = 0
    q.enterT = CFG.dropInT
    q.idle = 0
    q.prevA = false
    q.posture = 0; q.prevD = false; q.prevU = false   // #3038 the arriving soldier stands; fresh duck latches
    q.barr = 0                                       // #3060 a fresh soldier arrives unshielded
    q.x = allySideSpot(gs).x
    q.y = (gs.phase === 'jungle' ? 0 : gs.camY) - 6      // above the camera — the sky
    q.vy = 0; q.onGround = false; q.drop = 0; q.coyote = 0
    q.weapon = 'rifle'
    q.inv = CFG.invuln + CFG.dropInT                       // descent + the usual grace
    gs.ev.push({ type: 'p2join' })
    return true
}

// #2837 drop-out: a pad-claimed seat nobody is driving returns to the wingman
// brain — the port's default state (Jon's rule: CPU ally is the seat's idle
// face). Costs nothing from the shared pool; keeps ground and gun; a short
// mercy window so handing over mid-line doesn't read as a cheap death.
// Direct sim-claims (harness shortcuts, no padClaim) are never auto-released.
export function releaseSeat (gs) {
    const q = gs.p2
    if (!q.human || !q.padClaim) return false
    q.human = false
    q.padClaim = false
    q.idle = 0
    if (q.inv < 60) q.inv = 60
    gs.ev.push({ type: 'p2gone' })
    return true
}

// --- S2: entering the waterfall. The gate swallows the run: fresh vertical
// space, fresh gunners, the weapon (the fight is not your reward for dying). ---
function enterFalls (gs) {
    gs.phase = 'falls'
    gs.cam = 0
    gs.camY = CFG.worldH - H
    const p = gs.p
    p.x = 190; p.y = 662; p.vy = 0; p.onGround = true; p.drop = 0; p.coyote = 0
    gs.safe = { x: 190, y: 662 }
    // co-op: the blue seat follows the run into the canyon (spawn grace so the
    // first gunner doesn't get him free on arrival)
    const q = gs.p2
    if (!q.out) {
        q.x = 210; q.y = 662; q.vy = 0; q.onGround = true; q.drop = 0; q.coyote = 0
        q.lane = q.y; q.inv = Math.max(q.inv, 60); q.tIdx = -1
        q.safe = { x: 210, y: 662 }
    }
    gs.soldiers = FALLS_GUNNERS.map((d) => ({ x: d.x, y: d.y, hold: true, hp: 1, awake: false, t: 0, walk: 0, walkDir: -1, dead: false, flash: 0, nade: false, throwT: 0 }))
    gs.snipers = []   // the tree line stays in the jungle
    gs.vc.length = 0  // the depot's payout flies in the jungle too
    gs.carriers.length = 0; gs.pods.length = 0   // #2847: the canyon owns the vertical — no sky couriers below the falls
    gs.gunships.length = 0; gs.sortieT = 0       // #2917: the hangar belongs to the arena, not the gorge
    if (gs.boss) { gs.boss.hangar.open = 0; gs.boss.hangar.launchAt = 0 }   // the door's grind dies at the falls too
    gs.pb.length = 0; gs.eb.length = 0; gs.capsule = null
    gs.rapT = gs.tick + CFG.rapFirst   // #3064 fresh gorge, fresh first drop (the station wheel keeps turning across passes)
    gs.bcap = null   // #3060 the drift letter flies in the jungle too (a held shield survives the turn — the falls' gunners still throw rounds at it)
    // #2885: the vines live here — the gorge's carriers, both seats unhooked.
    gs.vines = VINES.map((v, i) => ({ ...v, i }))
    p.vine = -1; p.grabI = -1; p.rideT = 0; p.vx = 0
    if (!q.out) { q.vine = -1; q.grabI = -1; q.rideT = 0; q.vx = 0 }
    gs.ev.push({ type: 'enter' })
}

function makeBoss (gs) {
    gs.phase = 'boss'
    gs.camY = 0
    const p = gs.p
    p.x = 60; p.y = CFG.bossFloor; p.vy = 0; p.onGround = true
    gs.safe = { x: 60, y: CFG.bossFloor }
    const q = gs.p2
    if (!q.out) {
        q.x = 34; q.y = CFG.bossFloor; q.vy = 0; q.onGround = true; q.drop = 0; q.coyote = 0
        q.lane = q.y; q.inv = Math.max(q.inv, 60); q.zz = 1
        q.safe = { x: 34, y: CFG.bossFloor }
    }
    gs.soldiers = []
    gs.pb.length = 0; gs.eb.length = 0
    gs.vines.length = 0          // #2885: the arena has no canopy — the fight is on the deck
    p.vine = -1; p.grabI = -1; p.rideT = 0; p.vx = 0
    q.vine = -1; q.grabI = -1; q.rideT = 0; q.vx = 0
    gs.boss = {
        core: CFG.coreHp,
        coreT: 30,                                  // start armored; first opening soon
        dying: 0,                                   // cascade countdown after the core falls
        guns: GUNS.map((g, i) => ({ x: g.x, y: g.y, t: 90 + i * 55, hp: CFG.gunHp, dead: false })),
        doors: DOORS.map((d, i) => ({ x: d.x, y: d.y, t: 150 + i * 120 })),
        // #2917 the hangar: `open` is the grind left on the door, `launchAt`
        // the tick the hull is due to appear in the mouth (0 = nothing armed).
        hangar: { open: 0, launchAt: 0 },
    }
    // #2917 the second air layer: one sortie at a time, scheduled on seed/tick
    // arithmetic (zero gs.r — the courier law #2847 verbatim).
    gs.gunships = []
    gs.sortieT = gs.tick + Math.round(CFG.gsFirst / sortieK(gs.lk))
    gs.sortieN = 0
    gs.ev.push({ type: 'enter' })
}

export function step (gs, pad = PAD0, pad2 = PAD0) {
    if (gs.end) { gs.tick += 1; return }
    const p = gs.p
    const q = gs.p2
    gs.tick += 1
    // #3041 SCORE EXTEND — crossing the mark buys a life (the cabinet's 1UP).
    // One mark per tick: score only moves on kills and the biggest single award
    // (+5000, the core) cannot outrun a 50,000 rung; if it ever did, consecutive
    // ticks pay it. The pool caps at the HUD's numeric form (99, makeGame's
    // clamp) — at the cap the mark still advances, and no salute is owed.
    if (gs.score >= gs.nextExt) {
        gs.nextExt += EXT_STEP
        if (gs.lives < 99) { gs.lives += 1; gs.ev.push({ type: 'extra' }) }
    }
    // #3060 the shield's life runs on the world clock, symmetric for both
    // seats — the hero-death freeze stops it like everything else (a frozen
    // world cannot burn a six-second fuse).
    if (p.barr > 0) p.barr -= 1
    if (q.barr > 0) q.barr -= 1
    if (p.dead > 0) {
        p.dead -= 1
        if (p.dead === 0) {           // respawn at the last safe ground (arcade checkpoints),
            p.x = gs.safe.x           // weapon lost, flashing
            p.y = gs.safe.y; p.vy = 0; p.onGround = true
            p.lane = p.y
            p.weapon = 'rifle'; p.inv = CFG.invuln
            p.posture = 0          // #3038 a seat comes back on its feet
            p.barr = 0             // #3060 and clean of any shield
            p.vine = -1; p.grabI = -1; p.rideT = 0; p.vx = 0   // #2885 the vine lets go of the dead
            gs.eb.length = 0
            gs.ev.push({ type: 'respawn' })
        }
        return
    }

    const ledges = gs.phase === 'jungle' ? PLATFORMS : FALLS_LEDGES
    const floorY = gs.phase === 'jungle' ? CFG.ground : (gs.phase === 'boss' ? CFG.bossFloor : Infinity)

    // --- player: run, aim, jump, fire (the seat stays out once the pool is spent) ---
    if (!p.out) {
        seatStep(gs, p, pad, ledges, floorY, 0)
        if (p.onGround) gs.safe = { x: p.x, y: p.y }
    }

    // --- S4 the blue seat: his tumble counts down inside the live step (only
    // the hero's death freezes the world), then he respawns at his own last
    // safe ground — weapon lost, flashing, same mercy laws as the hero. ---
    if (!q.out) {
        if (q.enterT > 0) {
            // #2837 the arrival descent: rappelling toward the hero-side spot.
            // The pad is silent while he's on the rope (the cabinet gives you
            // no steering mid-drop); presses still count as presence so a
            // passenger who never left is never auto-released. If the ceremony
            // timer runs out before touchdown (hero climbed while he fell),
            // ordinary gravity finishes the job the next tick.
            q.enterT -= 1
            const spot = allySideSpot(gs)
            q.x = spot.x
            q.y = Math.min(spot.y, q.y + CFG.dropInV)
            if (q.inv > 0) q.inv -= 1
            if (pad2.left || pad2.right || pad2.up || pad2.down || pad2.a || pad2.b) q.idle = 0
            if (q.y >= spot.y) {                 // touchdown — the seat is live
                q.enterT = 0                     // no leftover rope ticks: patience starts here
                q.vy = 0; q.onGround = true
                q.drop = 0; q.coyote = 0; q.lane = q.y
                // never land below the torrent (the respawn law, same canyon)
                if (gs.phase === 'falls' && q.y > gs.camY + H - CFG.drownAt - 40) {
                    q.y = gs.camY + 60
                    q.x = Math.max(20, Math.min(W - 20, p.out ? q.x : p.x))
                }
                gs.ev.push({ type: 'respawn', o: 1 })
            }
        } else if (q.dead > 0) {
            q.dead -= 1
            if (q.dead === 0) {
                // arcade drop-in: the partner re-enters at your side, not
                // wherever he fell (#2837: same spot law the arrival drop uses,
                // so both entrances of the blue seat share one shoulder rule)
                const spot = allySideSpot(gs)
                q.x = spot.x; q.y = spot.y
                q.vy = 0; q.onGround = true
                q.drop = 0; q.coyote = 0; q.lane = q.y
                q.weapon = 'rifle'; q.inv = CFG.invuln
                q.posture = 0      // #3038 the blue seat comes back on his feet too
                q.barr = 0         // #3060 and clean of any shield
                q.vine = -1; q.grabI = -1; q.rideT = 0; q.vx = 0   // #2885 same release for the blue seat
                // never respawn below the torrent — the arcade puts you back on
                // the climb, not back in the water
                if (gs.phase === 'falls' && q.y > gs.camY + H - CFG.drownAt - 40) {
                    q.y = gs.camY + 60
                    q.x = Math.max(20, Math.min(W - 20, p.out ? q.x : p.x))
                }
                gs.ev.push({ type: 'respawn', o: 1 })
            }
            // #2837 patience runs through the tumble too: a passenger who
            // stood up mid-death leaves no puppet behind when he comes back.
            if (q.padClaim) {
                if (pad2.left || pad2.right || pad2.up || pad2.down || pad2.a || pad2.b) q.idle = 0
                else q.idle += 1
                if (q.idle > CFG.seatIdle) releaseSeat(gs)
            }
        } else {
            seatStep(gs, q, q.human ? pad2 : allyBrain(gs), ledges, floorY, 1)
            if (q.onGround) q.safe = { x: q.x, y: q.y }
            // #2837 drop-out: a pad-claimed seat that hears nothing (no held
            // key, no tap) for seatIdle ticks returns to the wingman brain.
            if (q.padClaim) {
                if (pad2.left || pad2.right || pad2.up || pad2.down || pad2.a || pad2.b) q.idle = 0
                else q.idle += 1
                if (q.idle > CFG.seatIdle) releaseSeat(gs)
            }
        }
    }

    // --- camera + stage progression per phase ---
    if (gs.phase === 'jungle') {
        gs.cam = Math.max(0, Math.min(CFG.worldW - W, p.x - 110))
        if (p.x >= CFG.endX) { enterFalls(gs); return }
    } else if (gs.phase === 'falls') {
        // #3060 the carrier: the torrent and the stage-top call follow the seat
        // that still stands. #2814's own law — "the partner who pays the last
        // life leaves the run alone" — was only half-written: the camera and
        // the boss anchor kept serving the DOWNED hero, so if he fell mid-air
        // the view hung on his corpse and the solo ally could never reach the
        // boss. The arcade hands the stage to the survivor.
        const carrier = !p.out ? p : (!q.out && q.dead === 0 ? q : null)
        // ratchet camera: the torrent rises, and climbing pushes it further;
        // it NEVER comes back down — retreating into the water is how you drown.
        gs.camY -= CFG.rise
        const anchorY = (carrier ? carrier.y : p.y) - CFG.anchor
        if (anchorY < gs.camY) gs.camY = anchorY
        if (gs.camY < 0) gs.camY = 0
        // co-op: the torrent takes both seats (the hero check keeps its freeze
        // and its return — the blue seat's drown is local, the fight goes on)
        if (q.dead === 0 && !q.out && q.y >= gs.camY + H - CFG.drownAt) {
            gs.ev.push({ type: 'drown', o: 1 })
            killAlly(gs)
        }
        if (p.y >= gs.camY + H - CFG.drownAt && !p.out) {   // the torrent takes you — a seat already down owes the water nothing (#3060: the drowning-corpse loop froze the whole stage)
            gs.ev.push({ type: 'drown' })
            killPlayer(gs)
            return
        }
        if (carrier && carrier.onGround && carrier.y <= CFG.bossFloor + 2) { makeBoss(gs); return }
    }

    // --- bullets ---
    gs.pb = gs.pb.filter((b) => {
        b.x += b.vx; b.y += b.vy
        if (b.k === 'f') { b.ph += 0.42; b.vy = b.vy0 + Math.sin(b.ph) * CFG.fireWob } // firebar undulation
        if (b.x < gs.cam - 8 || b.x > gs.cam + W + 8 || b.y < gs.camY - 8 || b.y > gs.camY + H + 8) return false
        // S3: fire and laser are piercing — each body takes them once
        const pierce = b.k === 'f' || b.k === 'l'
        const hs = pierce ? (b.hits || (b.hits = [])) : null
        if (gs.phase === 'boss' && gs.boss && gs.boss.dying === 0) {
            // the gate: armor takes rounds with a spark but never dents; the
            // core is the ONE weak point — and only while its shutter is open.
            const bo = gs.boss
            if (Math.abs(b.x - CFG.coreX) <= CFG.coreHW && Math.abs(b.y - CFG.coreY) <= CFG.coreHH) {
                const open = (bo.coreT % CFG.coreCycle) < CFG.coreOpen
                if (open) {
                    bo.core -= 1
                    gs.score += 100
                    gs.ev.push({ type: 'coreHit', x: CFG.coreX, y: CFG.coreY })
                    pop(gs, CFG.coreX, CFG.coreY - 14, 100)
                    if (bo.core <= 0) { bo.core = 0; bo.dying = CASCADE.length * CFG.cascadeStep; gs.score += 5000; gs.ev.push({ type: 'roar' }); pop(gs, CFG.coreX, CFG.coreY - 26, 5000) }
                } else {
                    gs.ev.push({ type: 'spark', x: b.x, y: b.y })
                }
                return false
            }
            // cannon housings take rounds with a spark (the wall itself is just
            // scenery behind the play plane — arcade planes don't block shots).
            // #2854 gate pierce law: a piercing round sparks through a housing
            // and keeps flying — one take per beam, the bodies law verbatim
            // (soldiers, turrets, snipers, #2847 carriers). Ordinary rounds
            // still spark and stop dead: the armour law of the wall stands, and
            // the shuttered core above stays the ONE weak point — untouched.
            // #2880 the depot slab law reaches the gate: ten rounds cave a
            // housing — spark per hit, then a named blast and +300, and that
            // gun is silent for the rest of the fight. A caved housing stops
            // intercepting rounds entirely (the mount was the armour, not the
            // wall), pierce "one take" included; the core stays the only win.
            // Mutant anchor line (`gate-armor-forever`).
            for (const [gi, g] of bo.guns.entries()) {
                if (g.dead) continue
                if (Math.abs(b.x - g.x) <= 9 && Math.abs(b.y - g.y) <= 8) {
                    if (pierce && hs.includes('g' + gi)) continue
                    g.hp -= 1
                    gs.ev.push({ type: 'spark', x: b.x, y: b.y })
                    if (g.hp <= 0) {
                        g.hp = 0; g.dead = true
                        gs.score += 300
                        gs.ev.push({ type: 'boom', x: g.x, y: g.y - 6, kind: 'tnt' })
                        pop(gs, g.x, g.y - 14, 300)
                    }
                    if (pierce) { hs.push('g' + gi); continue }
                    return false
                }
            }
        }
        // S3.5 arms depot: the slab eats every round — pierce included, walls
        // are walls. Ten hits cave it and the arcade's guns-and-prizes moment
        // pays: a volley of M/F/L capsules at three altitudes. Mutant anchor line.
        const dp = gs.depot
        if (gs.phase === 'jungle' && dp && !dp.dead && Math.abs(b.x - dp.x) <= 18 && Math.abs(b.y - (dp.y - 14)) <= 22) {
            dp.hp -= 1; gs.ev.push({ type: 'spark', x: b.x, y: b.y })
            if (dp.hp <= 0) {
                dp.hp = 0; dp.dead = true; gs.score += 1000
                gs.ev.push({ type: 'boom', x: dp.x, y: dp.y - 16, kind: 'tnt' })
                pop(gs, dp.x, dp.y - 24, 1000)
                const roof = gs.snipers.find((sn) => sn.x === dp.x && !sn.dead)
                if (roof) { roof.dead = true; gs.score += 150; pop(gs, dp.x + 10, dp.y - 44, 150) }
                gs.vc = [
                    { x: dp.x + 22, y: CAP_ALT[2], vx: -1.2, kind: 'machine' },
                    { x: dp.x + 36, y: CAP_ALT[1], vx: -1.2, kind: 'fire' },
                    { x: dp.x + 50, y: CAP_ALT[0], vx: -1.2, kind: 'laser' },
                ]
                gs.ev.push({ type: 'volley' })
            }
            return false
        }
        // #2847 pod carriers: the airframe takes two rounds — spark, then the
        // courier falls in a named boom and jettisons its pod (the original's
        // power-up courier: the prize is earned with aim). Mutant anchor line
        // (`cargo-jettison`). The band rides above the gun-line, so this box
        // never intercepts ground fire — hitting it is a deliberate up-aim.
        for (const [ci, cr] of gs.carriers.entries()) {
            if (!cr.dead && Math.abs(b.x - cr.x) <= CFG.carrierHW && Math.abs(b.y - cr.y) <= CFG.carrierHH) {
                if (pierce && hs.includes('c' + ci)) continue
                cr.hp -= 1
                gs.ev.push({ type: 'spark', x: b.x, y: b.y })
                if (cr.hp <= 0) {
                    cr.dead = true
                    gs.score += 500
                    gs.ev.push({ type: 'boom', x: cr.x, y: cr.y, kind: 'kill' })
                    pop(gs, cr.x, cr.y - 10, 500)
                    gs.pods.push({ x: cr.x, y: cr.y + 12, vx: CFG.podVx, vy: 0, kind: cr.kind, recoil: 6, puff: 0 })
                    if (gs.pods.length > 4) gs.pods.shift()
                    gs.ev.push({ type: 'cargo', k: cr.kind })
                }
                if (pierce) { hs.push('c' + ci); continue }
                return false
            }
        }
        // #2917 the hangar gunship: three rounds take the hull — spark per hit,
        // then a named fireball and the arcade's purse. The pierce law applies
        // verbatim (one take per hull per beam — the carriers/guns law), and the
        // band sits above the deck so ground fire aimed at the wall never hits
        // it for free: taking it is a deliberate up-aim. Mutant anchor line
        // (`gunship-impervious`).
        for (const [si, sh] of gs.gunships.entries()) {
            if (!sh.dead && Math.abs(b.x - sh.x) <= CFG.gsHW && Math.abs(b.y - sh.y) <= CFG.gsHH) {
                if (pierce && hs.includes('s' + si)) continue
                sh.hp -= 1
                sh.flash = 4
                gs.ev.push({ type: 'spark', x: b.x, y: b.y })
                if (sh.hp <= 0) {
                    sh.dead = true
                    gs.score += CFG.gsScore
                    gs.ev.push({ type: 'boom', x: sh.x, y: sh.y, kind: 'kill' })
                    pop(gs, sh.x, sh.y - 10, CFG.gsScore)
                }
                if (pierce) { hs.push('s' + si); continue }
                return false
            }
        }
        for (const [bi, br] of gs.barrels.entries()) {
            if (!br.gone && Math.hypot(b.x - br.x, b.y - (br.y - 10)) < 12) {
                br.gone = true; gs.score += 500; boom(gs, br.x, br.y - 10, true); pop(gs, br.x, br.y - 18, 500)
                if (pierce) { hs.push('b' + bi); continue }
                return false
            }
        }
        for (const [si, s] of gs.soldiers.entries()) {
            if (!s.dead && s.awake && Math.abs(b.x - s.x) < 8 && Math.abs(b.y - (s.y - 12)) < 13) {
                if (pierce && hs.includes('s' + si)) continue
                if (s.hp > 1) {
                    // armour vest (the grenadier takes two rounds): spark, keep running
                    s.hp -= 1; gs.ev.push({ type: 'spark', x: s.x, y: s.y - 12 })
                } else killSoldier(gs, s)
                if (pierce) { hs.push('s' + si); continue }
                return false
            }
        }
        for (const [ti, t] of gs.turrets.entries()) {
            if (!t.dead && Math.abs(b.x - t.x) < 10 && Math.abs(b.y - (t.y - 16)) < 14) {
                if (pierce && hs.includes('t' + ti)) continue
                hitTurret(gs, t)
                if (pierce) { hs.push('t' + ti); continue }
                return false
            }
        }
        for (const [ni, sn] of gs.snipers.entries()) {
            if (!sn.dead && sn.awake && Math.abs(b.x - sn.x) < 9 && Math.abs(b.y - (sn.y - 12)) < 13) {
                if (pierce && hs.includes('n' + ni)) continue
                sn.dead = true; gs.score += 150; gs.ev.push({ type: 'boom', x: sn.x, y: sn.y - 12, kind: 'kill' }); pop(gs, sn.x, sn.y - 20, 150)
                if (pierce) { hs.push('n' + ni); continue }
                return false
            }
        }
        return true
    })

    // --- #3064 rappellers: the gorge's missing reinforcement. One drop on
    // the wire at a time (the courier/sortie law verbatim), scheduled on
    // seed/tick arithmetic — zero gs.r, so every tuned stream and every
    // rng-driven law keeps its exact shape with the ropes running. ---
    if (gs.phase === 'falls' && gs.tick >= gs.rapT && !gs.soldiers.some((sd) => !sd.dead && sd.rap)) {
        const st = RAP_STATIONS[gs.rapN % RAP_STATIONS.length]
        const jit = (gs.seed * 37 + gs.rapN * 61) % 110
        gs.soldiers.push({
            x: st.x, y: gs.camY - 12, hold: true, hp: 1, awake: true, t: CFG.rapTele,
            walk: 0, walkDir: -1, dead: false, flash: 0, nade: false, throwT: 0,
            rap: 1, vy: 0, shots: 0, hangT: 0, hangY: gs.camY + st.hang,
        })
        gs.rapN += 1
        gs.rapT = gs.tick + Math.round((CFG.rapEvery + jit) / sortieK(gs.lk))
        gs.ev.push({ type: 'rapdrop' })
    }

    // --- #3067 frogmen: the cabinet's infantry come AT you out of the canopy,
    // not around it. ONE leaper on the trail at a time (the courier/sortie/
    // rappel law verbatim), perched at a fixed station on the tree line, then
    // coil — launch — drop — and the deck makes him a plain runner. Schedule
    // is seed/tick arithmetic — zero gs.r, so every tuned stream and every
    // rng-driven law keeps its exact shape with the perches armed. ---
    if (gs.phase === 'jungle' && gs.tick >= gs.jlT && !gs.soldiers.some((sd) => !sd.dead && sd.leap)) {
        const st = JL_STATIONS[gs.jlN % JL_STATIONS.length]
        const sx = Math.min(CFG.worldW - 8, gs.cam + st.lead)
        gs.soldiers.push({
            x: sx, y: CFG.jlY, hold: true, hp: 1, awake: true, t: 10 ** 9,   // silent on the bough: the drop is the whole attack (a perched gunner would add rounds the tuned seed economy can't price — seed 7 proved it; the canopy shooter is a different stage's fantasy)
            walk: 0, walkDir: -1, dead: false, flash: 0, nade: false, throwT: 0,
            leap: true, drop: 0, vy: 0, jlCd: 0,
        })
        gs.jlN += 1
        gs.jlT = gs.tick + Math.round((CFG.jlEvery + ((gs.seed * 37 + gs.jlN * 61) % CFG.jlJit)) / gs.lk)
        gs.ev.push({ type: 'jlin', x: sx, y: CFG.jlY })
    }

    // --- soldiers: wake just inside the view (the spawn-shield law spans both
    // axes: x past cam + W - 4 OR y past camY + H - 4 is beyond bullet reach),
    // open fire within a third of a second, runners close in, gunners hold the
    // walkways and shelves and shoot down-diagonals like the original's snipers. ---
    for (const s of gs.soldiers) {
        if (s.dead) continue
        if (!s.awake) {
            if (s.x < gs.cam + W - 4 && s.y < gs.camY + H - 4) { s.awake = true; s.t = 10 + Math.floor(rnd(gs) * 25) }
            continue
        }
        const tgt = aimTarget(gs, s.x)
        const dx = tgt ? tgt.x - s.x : 9999
        const dy = tgt ? (tgt.lane - 14) - (s.y - 12) : 9999   // aim the lane; a jump is the answer (lane-aim law)
        s.walk += 1
        if (s.flash > 0) s.flash -= 1
        // #3064 the rope ride — a rappeller's own clock: 1 slides down the
        // wire, 2 hangs and guns, 3 tumbles (cut), 4 retires down the rope to
        // reinforce (or drowns). Settling is shared: rock recruits, the
        // torrent buries.
        if (s.rap === 1) {
            s.y += CFG.rapSlide
            if (s.y >= s.hangY) { s.y = s.hangY; s.rap = 2 }
        } else if (s.rap === 2) {
            s.hangT += 1
            if (s.hangT >= CFG.rapPatience) s.rap = 4   // nobody in his band — slide off, free the wire
        } else if (s.rap === 3) {
            s.vy += CFG.rapFallG
            s.y += s.vy
            rapSettle(gs, s)
        } else if (s.rap === 4) {
            s.y += CFG.rapSlide
            rapSettle(gs, s)
        }
        if (!s.hold && tgt && Math.abs(dx) > 26 && (!s.leap || s.drop === 3)) { s.x += Math.sign(dx) * 1.1 * gs.lk; s.walkDir = Math.sign(dx) }
        // #3067 THE DROP — the canopy let go of him. Phases on the soldier:
        // 0 perched (a canopy gunner the flat stream cannot answer — the
        // sniper's shelter, nothing new), 1 coil (jlCoil ticks of crouch — the
        // telegraph, as the door grind is for the gunship), 2 falling (pure
        // gravity at his station x — he never steers toward the seat, the
        // landing column is readable the moment he commits), 3 the deck — and
        // the deck makes him a plain rifle runner: identity, purse, contact
        // law and all. Zero gs.r: every number here is fixed arithmetic.
        if (s.leap) {
            if (s.drop === 0) {
                if (tgt && tgt.onGround && Math.abs(dx) < CFG.jlDropBand && s.y > gs.camY) { s.drop = 1; s.jlCd = CFG.jlCoil; gs.ev.push({ type: 'coil', x: s.x, y: s.y }) }
            } else if (s.drop === 1) {
                s.jlCd -= 1
                if (s.jlCd <= 0) { s.drop = 2; gs.ev.push({ type: 'drop', x: s.x, y: s.y }) }
            } else if (s.drop === 2) {
                s.y += s.vy; s.vy += CFG.grav
                if (s.y >= CFG.ground) { s.y = CFG.ground; s.vy = 0; s.hold = false; s.drop = 3; s.jlLand = CFG.jlLand; s.t = Math.min(s.t, 60); gs.ev.push({ type: 'bound', x: s.x, y: s.y, land: true }) }
            }
            if (s.jlLand > 0) s.jlLand -= 1
        }
        s.t -= 1
        const range = s.hold ? (gs.phase === 'falls' ? 210 : 280) : 220
        const inCamX = gs.cam < s.x && s.x < gs.cam + W + 4
        const inCamY = s.y > gs.camY - 4 && s.y < gs.camY + H + 4
        // S3 grenade lob: on the approach band, not too close, never off-screen
        if (s.nade && s.throwT > 0) s.throwT -= 1
        if (s.nade && s.throwT === 0 && !s.hold && tgt && Math.abs(dx) > 50 && Math.abs(dx) < 320 && inCamX && inCamY) {
            gs.eb.push({ x: s.x, y: s.y - 18, vx: Math.sign(dx) * 1.9, vy: -3.4, gr: true })
            gs.ev.push({ type: 'throw' })
            s.throwT = Math.round((150 + ((s.x * 37) >>> 3) % 90) / gs.lk)
        }
        // #2905 lob-only law: the cabinet's vest grenadiers throw and carry no
        // rifle — the bandolier never answers with a flat round. The vest, the
        // advance and the lob cadence stand untouched.
        // #3064 a hanger guns only from the hang, and never straight down:
        // |dx| ≥ rapGate keeps every round's lateral answer in play (the falls
        // sidestep is the whole dodge). Its rearm is fixed arithmetic — the
        // rnd stream never feels a rappel.
        if (!s.nade && tgt && s.t <= 0 && Math.abs(dx) < range && Math.abs(dy) < range * 0.9 && inCamX && inCamY &&
            (!s.rap || (s.rap === 2 && Math.abs(dx) >= CFG.rapGate)) &&
            (!s.leap || s.drop === 3 || Math.abs(dx) >= CFG.jlGate)) {   // #3067 steep-angle gate — while above the deck a frogman holds his rounds out to |dx| ≥ jlGate, so every round keeps its hop answer (worst-angle vy ≈ 1.06 < the 1.2 window)
            const a = Math.atan2(dy, dx)
            const sp = s.hold ? (gs.phase === 'falls' ? 1.8 : CFG.eBulletSpeed) : CFG.eBulletSpeed
            gs.eb.push({ x: s.x + Math.cos(a) * 8, y: s.y - 12 + Math.sin(a) * 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp })
            gs.ev.push({ type: 'efire' })
            s.flash = 4
            if (s.leap) { s.t = Math.round(CFG.jlRearm / gs.lk) }   // #3067 fixed cadence — the rnd stream never feels a frogman
            else if (s.rap) {
                s.t = Math.round(CFG.rapRearm / gs.lk)
                s.shots += 1
                s.hangT = 0
                if (s.shots >= CFG.rapShots) s.rap = 4   // ride spent — slide off to reinforce
            } else {
                s.t = Math.round(((s.hold ? (gs.phase === 'falls' ? 100 : 40) : 45) + Math.floor(rnd(gs) * 60)) / gs.lk)   // #2894 loop n: rearm faster
            }
        }
        // touching a live runner is a hit, as on the cabinet — and it takes
        // either seat (S4: the blue soldier can be rushed too)
        if (!s.hold && !s.jlLand && p.inv <= 0 && !p.out && Math.abs(p.x - s.x) < 9 && Math.abs(p.y - s.y) < 20) killPlayer(gs)
        if (!s.hold && !s.jlLand && q.inv <= 0 && !q.out && q.dead === 0 && Math.abs(q.x - s.x) < 9 && Math.abs(q.y - s.y) < 20) killAlly(gs)
        if (p.dead > 0) break
    }

    // --- turrets: scan, fire aimed bursts while in range (at the nearer hero) ---
    for (const t of gs.turrets) {
        if (t.dead) continue
        const tgt = aimTarget(gs, t.x)
        const dx = tgt ? tgt.x - t.x : 9999
        const inCam = t.x > gs.cam && t.x < gs.cam + W
        t.aim = tgt ? Math.atan2((tgt.lane - 14) - (t.y - 18), dx) : Math.PI
        t.t -= 1
        if (t.t <= 0 && inCam && tgt && Math.abs(dx) < 260) {
            gs.eb.push({ x: t.x + Math.cos(t.aim) * 12, y: t.y - 18 + Math.sin(t.aim) * 12, vx: Math.cos(t.aim) * CFG.eBulletSpeed, vy: Math.sin(t.aim) * CFG.eBulletSpeed })
            gs.ev.push({ type: 'efire', big: true })
            t.t = Math.round(85 / gs.lk)   // #2894 loop n: the turret cycles faster
        }
    }

    // --- S3 snipers: perched in the tree line, long range, the fast aimed
    // round. The scope glint flashes while t < 40 — telegraph, then shot.
    // #2905: after every shot the nest WALKS to its next perch (three canopy
    // positions on a fixed rotation) — the crossfire moves between volleys,
    // and the relocation always finishes before the next glint lights. ---
    for (const sn of gs.snipers) {
        if (sn.dead) continue
        if (!sn.awake) {
            if (sn.x < gs.cam + W - 4 && sn.y < gs.camY + H - 4) { sn.awake = true; sn.t = 40 + Math.floor(rnd(gs) * 50) }
            continue
        }
        if (sn.relocT > 0) {   // mid-shift along the branch toward perch pi
            sn.relocT -= gs.lk  // loop n: the shuffle quickens with the tempo
            const p = PERCH_OFF[sn.pi]
            if (sn.relocT <= 0) { sn.relocT = 0; sn.x = sn.bx + p[0]; sn.y = sn.by + p[1] }
            else {
                const f = 1 - sn.relocT / PERCH_RELOC
                sn.x = sn.rx + (sn.bx + p[0] - sn.rx) * f
                sn.y = sn.ry + (sn.by + p[1] - sn.ry) * f
            }
        }
        const tgt = aimTarget(gs, sn.x)
        sn.aim = tgt ? Math.atan2((tgt.lane - 14) - (sn.y - 14), tgt.x - sn.x) : Math.PI
        if (sn.flash > 0) sn.flash -= 1
        sn.t -= 1
        const inCam = sn.x > gs.cam && sn.x < gs.cam + W
        // fairness law: the sniper waits for a GROUNDED target — its fast round
        // is aimed at the lane, and the answer is the same hop the cabinet
        // teaches for every flat shot. Shooting at airborne heroes would make
        // the fastest round in the game undodgeable. (S4: either seat's hop
        // answers — the round chases the nearer hero's lane.)
        if (sn.t <= 0 && inCam && tgt && tgt.onGround && Math.abs(tgt.x - sn.x) < 340) {
            gs.eb.push({ x: sn.x + Math.cos(sn.aim) * 12, y: sn.y - 14 + Math.sin(sn.aim) * 12, vx: Math.cos(sn.aim) * CFG.sniperSpeed, vy: Math.sin(sn.aim) * CFG.sniperSpeed })
            gs.ev.push({ type: 'sniper', bx: sn.bx, x: sn.x, reloc: sn.relocT })
            sn.flash = 8
            sn.t = Math.round((150 + Math.floor(rnd(gs) * 90)) / gs.lk)
            if (!sn.roof) {   // the roof gun is nailed to the depot slab; the canopy walks
                sn.pi = (sn.pi + 1) % PERCH_OFF.length
                sn.rx = sn.x; sn.ry = sn.y
                sn.relocT = PERCH_RELOC
                sn.dir = Math.sign(sn.bx + PERCH_OFF[sn.pi][0] - sn.rx)
            }
        }
    }

    // --- S3.5 the arms depot: an armored emplacement with an aimed slit gun
    // and a supply hatch that spills exactly one live grenadier at a time (the
    // door law reused) — and only with the spill point inside the view (the
    // spawn-shield law spans every way a soldier can arrive). ---
    const dp2 = gs.depot
    if (gs.phase === 'jungle' && dp2 && !dp2.dead) {
        const tgt = aimTarget(gs, dp2.x)
        dp2.aim = tgt ? Math.atan2((tgt.lane - 14) - (dp2.y - 14), tgt.x - dp2.x) : Math.PI
        dp2.t -= 1
        const onScreen = dp2.x > gs.cam && dp2.x < gs.cam + W + 8
        if (dp2.t <= 0 && onScreen && tgt && Math.abs(tgt.x - dp2.x) < 300 && tgt.x < dp2.x) {
            gs.eb.push({ x: dp2.x + Math.cos(dp2.aim) * 14, y: dp2.y - 14 + Math.sin(dp2.aim) * 14, vx: Math.cos(dp2.aim) * 2.2, vy: Math.sin(dp2.aim) * 2.2 })
            gs.ev.push({ type: 'dfire' })
            dp2.t = Math.round(95 / gs.lk)   // #2894 loop n: the slit gun bites faster
        }
        dp2.spawnT -= 1
        const liveNade = gs.soldiers.some((s) => !s.dead && s.nade)
        if (dp2.spawnT <= 0 && !liveNade && dp2.x + 26 < gs.cam + W - 4) {
            gs.soldiers.push(mkSoldier({ x: dp2.x + 26, y: CFG.ground, hold: false, nade: true }))
            gs.soldiers[gs.soldiers.length - 1].awake = true
            gs.ev.push({ type: 'door' })
            dp2.spawnT = Math.round(320 / gs.lk)   // #2894 loop n: the hatch spills faster
        }
    }

    // --- barrels sitting on the ground: step into them and they go off (
    // either soldier's boots light the fuse) ---
    if (gs.phase === 'jungle') {
        for (const br of gs.barrels) {
            if (!br.gone && Math.abs(p.out ? 9999 : p.x - br.x) < 10 && p.y > br.y - 24) { br.gone = true; gs.score += 500; boom(gs, br.x, br.y - 10, true); pop(gs, br.x, br.y - 18, 500) }
            if (!br.gone && !q.out && q.dead === 0 && Math.abs(q.x - br.x) < 10 && q.y > br.y - 24) { br.gone = true; gs.score += 500; boom(gs, br.x, br.y - 10, true); pop(gs, br.x, br.y - 18, 500) }
        }
    }

    // --- the flying capsule: Contra's signature weapon courier (jungle runs).
    // S3: the wheel — every capsule draws its letter and its altitude. ---
    if (gs.phase === 'jungle') {
        if (!gs.capsule && gs.tick >= gs.nextCapsule) {
            gs.capsule = {
                x: gs.cam + W + 10, y: CAP_ALT[Math.floor(rnd(gs) * CAP_ALT.length)], vx: -1.4,
                kind: CAP_KINDS[Math.floor(rnd(gs) * CAP_KINDS.length)],
            }
        }
    }
    if (gs.capsule) {
        gs.capsule.x += gs.capsule.vx
        const c = gs.capsule
        const kind = c.kind || 'spread'
        if (p.inv >= 0 && !p.out && Math.abs(p.x - c.x) < 12 && Math.abs(p.y - 14 - c.y) < 16) {
            gs.capsule = null
            gs.nextCapsule = gs.tick + 600 + Math.floor(rnd(gs) * 300)
            if (p.weapon !== kind) { p.weapon = kind; gs.score += 1000; gs.ev.push({ type: 'pickup', k: kind }); pop(gs, c.x, c.y - 10, 1000) }
            else gs.ev.push({ type: 'pickup', k: kind })
        } else if (q.inv >= 0 && !q.out && q.dead === 0 && Math.abs(q.x - c.x) < 12 && Math.abs(q.y - 14 - c.y) < 16) {
            // co-op: the capsule goes to whoever touches it first — capture is
            // per-seat, and the blue seat's wheel is his own
            gs.capsule = null
            gs.nextCapsule = gs.tick + 600 + Math.floor(rnd(gs) * 300)
            if (q.weapon !== kind) { q.weapon = kind; gs.score += 1000; gs.ev.push({ type: 'pickup', k: kind, o: 1 }); pop(gs, c.x, c.y - 10, 1000) }
            else gs.ev.push({ type: 'pickup', k: kind, o: 1 })
        } else if (c.x < gs.cam - 16) {
            gs.capsule = null
            gs.nextCapsule = gs.tick + 300
        }
    }

    // --- #3060 THE BARRIER — the wheel's fifth letter (never-dry stage #1571).
    // The cabinet's B capsule drifts low over the jungle deck and is taken on
    // contact, per seat (the capsule law verbatim). Schedule, drift and the
    // shield's duration are seed/tick arithmetic — ZERO gs.r draws (the #2847
    // carrier precedent): every letter the rnd schedule draws, every courier it
    // books and every tuned autopilot byte stand. The shield keeps whatever gun
    // the seat holds (in the cabinet it is not a gun) — capture pays +1000
    // through the #3057 pop chokepoint; a refresh while it already holds pays
    // nothing, the duplicate-capture law of the wheel. ---
    if (gs.phase === 'jungle' && !gs.bcap && gs.tick >= gs.nextBarr) {
        gs.bcap = { x: gs.cam + W + 10, y: CFG.ground - 12, vx: CFG.barrVx }
    }
    if (gs.bcap) {
        gs.bcap.x += gs.bcap.vx
        const c = gs.bcap
        const resched = () => {
            gs.bcap = null
            gs.nextBarr = gs.tick + CFG.barrNext + (((gs.seed ^ (gs.tick * 2654435761)) >>> 19) % CFG.barrJitter2)
        }
        if (!p.out && p.dead === 0 && Math.abs(p.x - c.x) < 12 && Math.abs(p.y - 14 - c.y) < 16) {
            // the shield never lands on a body — a frozen seat is not a catcher
            if (p.barr <= 0) { gs.score += CFG.barrScore; pop(gs, c.x, c.y - 10, CFG.barrScore) }
            p.barr = CFG.barrTicks
            gs.ev.push({ type: 'barr', o: 0 })
            resched()
        } else if (!q.out && q.dead === 0 && Math.abs(q.x - c.x) < 12 && Math.abs(q.y - 14 - c.y) < 16) {
            // co-op: the drift goes to whoever touches it first — per seat, the
            // wingman's shield is his own (the capsule law, structural)
            if (q.barr <= 0) { gs.score += CFG.barrScore; pop(gs, c.x, c.y - 10, CFG.barrScore) }
            q.barr = CFG.barrTicks
            gs.ev.push({ type: 'barr', o: 1 })
            resched()
        } else if (c.x < gs.cam - 16) {
            resched()   // it drifted out of the jungle unclaimed — the road reschedules
        }
    }

    // --- #2847 pod carriers: one courier in the sky at a time (the capsule
    // law — the jungle sends its guns one honest flight at a time). Schedule,
    // altitude and letter are seed/tick arithmetic — zero gs.r draws, so the
    // tuned stream is untouched; the courier is non-lethal on contact (it is
    // a delivery, not an attacker) and an untouched run escapes with its pod,
    // rescheduling the next flight. ---
    if (gs.phase === 'jungle' && gs.carriers.length === 0 && gs.tick >= gs.nextCarrier) {
        const pick = (gs.seed + gs.carrierN) % CAP_KINDS.length
        const band = gs.seed + gs.carrierN * 7
        gs.carriers.push({
            x: gs.cam + W + 18,
            y: CARRIER_ALT[band & 1],
            vx: CFG.carrierVx * gs.lk, hp: CFG.carrierHp,   // #2894 loop n: quicker fly-past
            kind: CAP_KINDS[pick],
            dead: false,
        })
        gs.carrierN += 1
        gs.ev.push({ type: 'flyin', k: gs.carriers[0].kind })
    }
    if (gs.carriers.length) {
        let reschedule = 0
        for (const cr of gs.carriers) {
            cr.x += cr.vx
            if (cr.dead || cr.x < gs.cam - 20) reschedule = gs.tick
        }
        gs.carriers = gs.carriers.filter((cr) => !cr.dead && cr.x >= gs.cam - 20)
        if (reschedule) gs.nextCarrier = reschedule + Math.round(CFG.carrierNext / gs.lk) + (((gs.seed ^ (reschedule * 2654435761)) >>> 19) % 240)   // #2894 loop n: courier traffic thicker
    }

    // --- #2847 released pods: cargo falls (light chute gravity), settles on
    // the deck, and obeys the capsule's pickup law verbatim — per-seat, same
    // touch box, capture kills the wheel. Despawn is the scroll, as ever. ---
    gs.pods = gs.pods.filter((c) => {
        c.x += c.vx
        if (c.recoil > 0) c.recoil -= 1                     // #2852 the cable snap holds the load a beat
        else if (c.y < CFG.ground - 2) {
            c.vy = Math.min(CFG.podFallMax, c.vy + CFG.podGrav)
            c.y = Math.min(CFG.ground - 2, c.y + c.vy)
            if (c.y >= CFG.ground - 2) {
                if (c.vy > 0) { c.puff = 12; gs.ev.push({ type: 'dust', k: c.kind }) } // #2852 sand kick on touchdown
                c.vy = 0
            }
        }
        if (c.puff > 0) c.puff -= 1
        if (p.inv >= 0 && !p.out && Math.abs(p.x - c.x) < 12 && Math.abs(p.y - 14 - c.y) < 16) {
            if (p.weapon !== c.kind) { p.weapon = c.kind; gs.score += 1000; gs.ev.push({ type: 'pickup', k: c.kind }); pop(gs, c.x, c.y - 10, 1000) }
            else gs.ev.push({ type: 'pickup', k: c.kind })
            return false
        }
        if (q.inv >= 0 && !q.out && q.dead === 0 && Math.abs(q.x - c.x) < 12 && Math.abs(q.y - 14 - c.y) < 16) {
            if (q.weapon !== c.kind) { q.weapon = c.kind; gs.score += 1000; gs.ev.push({ type: 'pickup', k: c.kind, o: 1 }); pop(gs, c.x, c.y - 10, 1000) }
            else gs.ev.push({ type: 'pickup', k: c.kind, o: 1 })
            return false
        }
        return c.x > gs.cam - 16
    })

    // --- S3.5 volley capsules (the depot's payout): they fly the same honest
    // line with their letters already stamped; same pickup, same despawn. ---
    gs.vc = gs.vc.filter((c) => {
        c.x += c.vx
        if (p.inv >= 0 && !p.out && Math.abs(p.x - c.x) < 12 && Math.abs(p.y - 14 - c.y) < 16) {
            if (p.weapon !== c.kind) { p.weapon = c.kind; gs.score += 1000; gs.ev.push({ type: 'pickup', k: c.kind }); pop(gs, c.x, c.y - 10, 1000) }
            else gs.ev.push({ type: 'pickup', k: c.kind })
            return false
        }
        if (q.inv >= 0 && !q.out && q.dead === 0 && Math.abs(q.x - c.x) < 12 && Math.abs(q.y - 14 - c.y) < 16) {
            if (q.weapon !== c.kind) { q.weapon = c.kind; gs.score += 1000; gs.ev.push({ type: 'pickup', k: c.kind, o: 1 }); pop(gs, c.x, c.y - 10, 1000) }
            else gs.ev.push({ type: 'pickup', k: c.kind, o: 1 })
            return false
        }
        return c.x > gs.cam - 16
    })

    // --- the boss gate: shutter cycle, cannon fire, door spill, death cascade ---
    if (gs.phase === 'boss' && gs.boss) {
        const bo = gs.boss
        bo.coreT += gs.lk   // #2894 loop n: the shutter cycle runs at tempo — open AND shut windows shrink by k, the duty ratio stands
        if (bo.dying > 0) {
            // the core fell — the gate comes apart at SCRIPTED sites (#2885):
            // guns first, then the wall in tiers bottom-to-top, the heart last.
            // Zero gs.r — the same finale on every seed, the original's choreo.
            bo.dying -= 1
            if (bo.dying % CFG.cascadeStep === 0) {
                const site = CASCADE[CASCADE.length - 1 - bo.dying / CFG.cascadeStep]
                boom(gs, site.x, site.y, false, 'tnt')
            }
            if (bo.dying === 0) { gs.end = 'win'; gs.ev.push({ type: 'clear' }) }
            gs.eb.length = 0
            gs.gunships.length = 0   // #2917: with the heart gone the sky empties too
        } else {
            const open = (bo.coreT % CFG.coreCycle) < CFG.coreOpen
            if (open && !bo.wasOpen) gs.ev.push({ type: 'unlock' })
            bo.wasOpen = open
            const tgt = aimTarget(gs, CFG.wallX)
            for (const g of bo.guns) {
                if (g.dead) continue // #2880 a caved housing is silent — and unlit
                g.t -= 1
                if (g.t <= 0 && tgt) {
                    const a = Math.atan2((tgt.lane - 14) - g.y, tgt.x - g.x)
                    gs.eb.push({ x: g.x + Math.cos(a) * 12, y: g.y + Math.sin(a) * 12, vx: Math.cos(a) * 2.0, vy: Math.sin(a) * 2.0 })
                    gs.ev.push({ type: 'cannon' })
                    g.t = Math.round((170 + Math.floor(rnd(gs) * 110)) / gs.lk)   // #2894 loop n: the cannons answer faster
                }
            }
            const live = gs.soldiers.reduce((n, s) => n + (s.dead ? 0 : 1), 0)
            for (const d of bo.doors) {
                d.t -= 1
                if (d.t <= 0 && live < CFG.doorCap) {
                    gs.soldiers.push({ x: d.x, y: d.y, hold: false, hp: 1, awake: true, t: 30, walk: 0, walkDir: d.x > 192 ? -1 : 1, dead: false, flash: 0, nade: false, throwT: 0 })
                    gs.ev.push({ type: 'door' })
                    d.t = Math.round((300 + Math.floor(rnd(gs) * 150)) / gs.lk)   // #2894 loop n: the doors spit faster
                }
            }
            // --- #2917 THE SECOND AIR LAYER: the hangar sortie. The door grinds
            // open FIRST (the telegraph — nothing is ever born from a shut door),
            // the hull drops out of the mouth into its band, patrols left across
            // the arena and works the deck with lane-aimed down-rounds at PINNED
            // speed: the lane-aim law verbatim, the hop is always the answer.
            // One sortie at a time — the courier law (#2847): the gate sends its
            // guns one honest flight at a time. Zero gs.r: schedule, altitude and
            // rearm jitter are seed/tick arithmetic, so the tuned autopilot
            // stream and every rng-driven law byte-for-byte stand. The hangar
            // itself is wall armour — the shuttered core stays the ONE weak
            // point (#2880 law: guns are an answer, not a second door).
            const hg = bo.hangar
            if (hg.open > 0) hg.open -= 1
            if (hg.open === 0 && hg.launchAt === 0 && gs.tick >= gs.sortieT) {
                hg.open = CFG.gsGrind
                hg.launchAt = gs.tick + CFG.gsTelegraph
                gs.sortieN += 1
                gs.ev.push({ type: 'hangar' })
            }
            if (hg.launchAt > 0 && gs.tick >= hg.launchAt && gs.gunships.length === 0) {
                hg.launchAt = 0
                gs.gunships.push({
                    x: CFG.gsHangarX - 6, y: CFG.gsHangarY + 10,
                    ty: CFG.gsAlt[(gs.seed >> (gs.sortieN % 8)) & 1],
                    vx: CFG.gsVx * gs.lk,          // loop n: crossings quicken, rounds never do
                    hp: CFG.gsHp, t: CFG.gsFirstShot, n: gs.sortieN,
                    dead: false, flash: 0,
                })
                gs.ev.push({ type: 'lift' })
            }
            let sortieGone = 0
            for (const sh of gs.gunships) {
                if (sh.flash > 0) sh.flash -= 1
                if (sh.y < sh.ty) sh.y = Math.min(sh.ty, sh.y + 0.8)   // out of the mouth, then level
                sh.x += sh.vx
                const tgt = aimTarget(gs, sh.x)
                sh.t -= 1
                // the spawn-shield law spans both axes: no round leaves a hull
                // outside the view. And the strafe comes from OVER THE FORTRESS
                // (x > wallX), never from directly overhead — the beam gets the
                // long flight so the hop window the game already teaches is
                // always enough to answer it. The hull also waits for a GROUNDED
                // target, the snipers' fairness law verbatim: an aimed round is
                // answered by the hop, so firing at a hero who has already made
                // the move the game teaches is not a shot, it's a tax.
                if (sh.t <= 0 && tgt && tgt.onGround && sh.x > CFG.wallX && sh.x < gs.cam + W - 8) {
                    let a = Math.atan2((tgt.lane - 14) - (sh.y + 7), tgt.x - sh.x)
                    let vx = Math.cos(a) * CFG.eBulletSpeed, vy = Math.sin(a) * CFG.eBulletSpeed
                    // THE STRAFE LAW (fairness by construction): a hull's round
                    // flies SHALLOW — vy capped at CFG.gsVyMax — so it always
                    // lands in the flat-shot family the game already teaches the
                    // answer to. The autopilot's hop window is `|vy| < 1.2`; a
                    // steep drop-shot instead demands a sideways dodge, and the
                    // gate's firing band is 22 px wide with the wall at one end
                    // — there is no road there. Speed stays capped at the aimed-
                    // round speed of the whole game (#2894 loop law: pressure
                    // compresses flight TIME, never flight paths).
                    if (vy > CFG.gsVyMax) {
                        vy = CFG.gsVyMax
                        vx = -Math.sqrt(Math.max(0.25, CFG.eBulletSpeed * CFG.eBulletSpeed - vy * vy))
                    }
                    gs.eb.push({ x: sh.x + Math.cos(a) * 10, y: sh.y + 7 + Math.sin(a) * 10, vx, vy, gs: true })
                    gs.ev.push({ type: 'gsfire' })
                    sh.flash = 4
                    sh.t = Math.round(CFG.gsRearm / sortieK(gs.lk)) + ((gs.seed ^ (sh.n * 40503)) >>> 21) % 60
                }
                // the hull is a weapon, not cargo — contact is a hit for either
                // seat (the runner law verbatim). The box is the hull itself, not
                // its wake: a hero who hops an aimed round under the sortie stays
                // alive (the band is set so an apex chest clears it by design).
                // #3038 posture-aware centre: the hull band lives far above even a
                // standing chest, so this law is byte-identical in play — the duck
                // simply moves the whole body further from the sky's threat.
                if (p.inv <= 0 && p.dead === 0 && !p.out && Math.abs(p.x - sh.x) < CFG.gsHW - 6 && Math.abs(p.y - (CFG.duckCenter[p.posture | 0] || 14) - sh.y) < CFG.gsHH) killPlayer(gs)
                if (q.inv <= 0 && q.dead === 0 && !q.out && Math.abs(q.x - sh.x) < CFG.gsHW - 6 && Math.abs(q.y - (CFG.duckCenter[q.posture | 0] || 14) - sh.y) < CFG.gsHH) killAlly(gs)
                if (sh.dead || sh.x < gs.cam - 24) sortieGone = gs.tick
            }
            gs.gunships = gs.gunships.filter((sh) => !sh.dead && sh.x >= gs.cam - 24)
            if (sortieGone) gs.sortieT = sortieGone + Math.round(CFG.gsNext / sortieK(gs.lk)) + (((gs.seed ^ (sortieGone * 2654435761)) >>> 19) % 220)
        }
    }

    // --- enemy bullets: one hit kills (inv frames aside). S3 grenades ride
    // the same stream with a gravity arc and detonate where they land. ---
    gs.eb = gs.eb.filter((b) => {
        b.x += b.vx; b.y += b.vy
        if (b.gr) {
            b.vy += 0.16
            if (gs.phase === 'jungle' && b.y >= CFG.ground - 2) {
                // #3060 a bomb the ring swallowed lands dead: the field ate its
                // fuse — a spark on the deck where the fireball would have been.
                if (b.eatP || b.eatQ) { gs.ev.push({ type: 'spark', x: b.x, y: CFG.ground - 4 }); return false }
                boom(gs, b.x, CFG.ground - 4, true, 'tnt'); return false
            }
        }
        if (b.x < gs.cam - 8 || b.x > gs.cam + W + 8 || b.y < gs.camY - 8 || b.y > gs.camY + H + 8) return false
        // #3038 the hit box shrinks with the profile: an aimed round rides the
        // chest line (lane-14), so a kneel still eats it and a prone body lies
        // under it — the cabinet's duck, earned by reacting to the telegraph.
        const pc = CFG.duckCenter[p.posture | 0] || 14
        const qc = CFG.duckCenter[q.posture | 0] || 14
        // #3060 THE ABSORB LAW — while a seat's shield holds, enemy rounds
        // (rifle, turret, sniper, cannon, sortie, grenade-in-flight) spark out
        // at the ring around the body and are spent. ROUNDS only: soldier
        // contact, the hull, blast radius and the torrent keep their laws
        // verbatim — hazards outrank shields (the torrent precedent). A spent
        // round is MARKED, not deleted: the stream keeps every round in it, so
        // the honest autopilot and the ally brain read the same table they
        // always did (#2917's lesson, run backwards — an aid that hides rounds
        // from the brains breaks seeds too; the first cut deleted eaten rounds
        // and re-timed 5 and 8). The honest cost of the law lives one floor
        // down: a swallowed GRENADE cannot burst where it lands (it sparks),
        // and a blast that never happens can spare a turret — fidelity first
        // (the shield eats the round, blast included), the 12/12 sweep carries
        // the proof. The shell draws spent rounds out at the spark; a round
        // already at the ring cannot be stopped by the fuse dying this tick.
        if (p.barr > 0 && p.dead === 0 && !p.out && !b.eatP && Math.abs(b.x - p.x) < (CFG.duckHalfW[p.posture | 0] || 7) + 7 && Math.abs(b.y - (p.y - pc)) < (CFG.duckHalfH[p.posture | 0] || 13) + 7) { b.eatP = 1; gs.ev.push({ type: 'absorb', x: b.x, y: b.y, o: 0 }) }
        if (q.barr > 0 && q.dead === 0 && !q.out && !b.eatQ && Math.abs(b.x - q.x) < (CFG.duckHalfW[q.posture | 0] || 7) + 7 && Math.abs(b.y - (q.y - qc)) < (CFG.duckHalfH[q.posture | 0] || 13) + 7) { b.eatQ = 1; gs.ev.push({ type: 'absorb', x: b.x, y: b.y, o: 1 }) }
        if (p.inv <= 0 && p.dead === 0 && !p.out && !b.eatP && Math.abs(b.x - p.x) < (CFG.duckHalfW[p.posture | 0] || 7) && Math.abs(b.y - (p.y - pc)) < (CFG.duckHalfH[p.posture | 0] || 13)) { killPlayer(gs); return false }
        if (q.inv <= 0 && q.dead === 0 && !q.out && !b.eatQ && Math.abs(b.x - q.x) < (CFG.duckHalfW[q.posture | 0] || 7) && Math.abs(b.y - (q.y - qc)) < (CFG.duckHalfH[q.posture | 0] || 13)) { killAlly(gs); return false }
        return true
    })
}

// --- S2 hazards warp helpers (DEV harness/DebugKit): drop straight into a
// vertical phase with fully constructed state (no cheat physics). ---
export function warpFalls (gs) { enterFalls(gs) }
export function warpBoss (gs) { enterFalls(gs); makeBoss(gs) }

// --- attract autopilot: the demo drives the seat, and so does the harness's
// "it can be won" leg. Honest-percept law: reads only what a player on the
// screen can see (own position, visible enemies/bullets/capsules). ---
export function autopilot (gs) {
    const p = gs.p
    const pad = { right: true, a: false, b: true, up: false, down: false, left: false }
    if (p.dead > 0 || gs.end) return pad

    if (gs.phase === 'jungle') {
        // barrels: the lane discipline a thumb learns fast — easing off the trigger
        // short of a barrel avoids blowing yourself up with your own catch, and a
        // hop clears the body itself (touch is death).
        for (const br of gs.barrels) {
            if (!br.gone && br.x > p.x - 6) {
                if (br.x - p.x < 110) pad.b = false
                if (p.onGround && br.x - p.x < 22) pad.a = true
            }
        }
        // dodge: jump when a bullet is bearing down on the lane ahead of the
        // knees — from EITHER side (the sniper round is faster than a retreat,
        // so running away never outruns it; the hop is the answer). #2814:
        // judge the round's height AT ARRIVAL (rounds curve) — the ally and
        // the autopilot obey the same arc law, structural fairness.
        if (!pad.a) for (const b of gs.eb) {
            if (b.gr) continue
            const dx = b.x - p.x
            const toward = (dx > 4 && dx < CFG.hopBand) || (dx < -4 && dx > -CFG.hopBand && b.vx < -0.3)
            const eta = Math.abs(dx) / Math.max(0.5, Math.abs(b.vx))
            const pred = Math.abs(b.y + b.vy * Math.min(eta, 16) - (p.y - 14))
            if (p.onGround && toward && b.vy < 1.2 && pred < 12) { pad.a = true; break }
        }
        // S3 grenades: a bomb dropping into the lane gets hopped — the blast
        // sits on the ground, so being airborne over it is the whole answer.
        if (!pad.a) for (const b of gs.eb) {
            if (b.gr && b.vy > 0 && p.onGround && Math.abs(b.x - p.x) < 34 && b.y > CFG.ground - 110) { pad.a = true; break }
        }
        // the capsule is the prize: chase its altitude
        if (!pad.a && gs.capsule) {
            const c = gs.capsule
            if (c.x - p.x > 0 && c.x - p.x < 30 && c.y < p.y - 22) pad.a = true
        }
        // aim up at the capsule while firing, or up the tree line at nothing? no —
        // aim up only when the capsule is level with the gun
        if (gs.capsule && Math.abs(gs.capsule.x - p.x) < 14 && gs.capsule.y < p.y - 26) { pad.up = true }
        // S3.5 volley: the depot's payout is the prize too — line up and hop
        // into the arc; the low one comes to a run, the high ones want the jump.
        if (!pad.a && gs.vc.length) {
            const c = gs.vc.filter((v) => v.x > p.x - 6).sort((a, b) => a.x - b.x)[0]
            if (c && c.x - p.x < 34 && c.y < p.y - 22) pad.a = true
        }
        // #2847 released pods ride the same prize law — hop the ones still
        // falling, run down the ones settling on the deck.
        if (!pad.a && gs.pods.length) {
            const c = gs.pods.filter((v) => v.x > p.x - 6).sort((a, b) => a.x - b.x)[0]
            if (c && c.x - p.x < 34 && c.y < p.y - 22) pad.a = true
        }
        return pad
    }

    // --- S2 waterfall: climb the zigzag. The shelf above is the whole plan:
    // line up with it, jump the moment the feet touch, keep firing upward at
    // whatever holds the high ground. The torrent is why you never stop. ---
    if (gs.phase === 'falls') {
        // Persistent target: lock onto the shelf above and keep driving at it
        // until the feet LAND somewhere on it (re-picking per-tick by "nearest
        // above" flips the plan mid-jump the moment the feet near the line).
        let t = gs.apT != null && gs.apT >= 0 ? FALLS_LEDGES[gs.apT] : null
        const landedHere = t && p.onGround && Math.abs(p.y - t.y) < 2
        const fellWayBelow = t && p.y > t.y + 60
        if (!t || landedHere || fellWayBelow) {
            const cand = FALLS_LEDGES.filter((l) => l.y < p.y - 4 && l.y >= gs.camY - 20)
            t = cand.length ? cand.reduce((a, b) => (a.y > b.y ? a : b)) : null
            gs.apT = t ? FALLS_LEDGES.indexOf(t) : -1
        }
        pad.right = false; pad.left = false
        if (t) {
            if (p.x < t.x + 4) pad.right = true
            else if (p.x > t.x + t.w - 4) pad.left = true
            pad.up = p.y - t.y > 34 && Math.abs(p.x - (t.x + t.w / 2)) < t.w / 2 + 30 // gun the shelves
            // Jump when lined up under (or level with) the shelf — or at the
            // last moment before running off my own edge toward it: a shelf
            // across a gap is never reachable by walking, only by leaping.
            if (p.onGround) {
                const inBand = p.x >= t.x - 6 && p.x <= t.x + t.w + 6
                const sup = FALLS_LEDGES.find((l) => Math.abs(p.y - l.y) < 2 && p.x >= l.x - 3 && p.x <= l.x + l.w + 3)
                const offEdgeSoon = sup && ((t.x + t.w > sup.x + sup.w + 6 && p.x + CFG.run >= sup.x + sup.w - 1) || (t.x < sup.x - 6 && p.x - CFG.run <= sup.x + 1))
                if (inBand || offEdgeSoon) pad.a = true
            }
        }
        // dodge: shelf gunners drop aimed shots — when one falls onto you,
        // sidestep away from its line (a thumb learns to zigzag, not stand still).
        for (const b of gs.eb) {
            const dx = b.x - p.x
            if (b.vy > 0 && p.y - b.y > 6 && p.y - b.y < 70 && Math.abs(dx) < 16) {
                pad.right = dx < 0; pad.left = dx > 0
                break
            }
        }
        return pad
    }

    // --- boss gate: hug the wall face, put 45-degree fire into the core while
    // the shutter is open, drop runners before they close, and run away from
    // anything aimed at you. ---
    const bo = gs.boss
    pad.right = false; pad.left = false
    if (!bo) return pad
    if (bo.dying > 0) { pad.b = false; return pad }
    const open = (bo.coreT % CFG.coreCycle) < CFG.coreOpen
    const runner = gs.soldiers.filter((s) => !s.dead).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0]
    // Never stand in an aimed round's road: patrol the firing band (x 136..158,
    // where the 45-degree line reaches the core) in a constant zigzag — the
    // cabinet lesson that an aimed round only hits the thumb that rests.
    if (gs.apDir === undefined) gs.apDir = 1
    if (!runner) {
        // Never turn back INTO a round still in the road: when a shot is
        // inbound from the right, keep running left until it passes behind.
        if (p.x >= 158) gs.apDir = -1
        else if (p.x <= 136) gs.apDir = 1
        pad.right = gs.apDir > 0; pad.left = gs.apDir < 0
        pad.up = open && gs.apDir > 0 // the core lies right: fire lives in the rightward phase
    } else {
        // a charger: face it and keep the trigger down — a runner is one hit,
        // and fleeing only points your gun the wrong way (the arcade read:
        // shoot through the rush, never back-pedal from it)
        const dx = runner.x - p.x
        pad.right = dx > 0; pad.left = dx < 0
    }
    // dodge: an aimed shot closing on the chest — HOP the flat ones (the
    // cabinet answer; run-away never outruns an aimed round) and slip the
    // steep drop-shots sideways.
    for (const b of gs.eb) {
        const dx = b.x - p.x
        const toward = (dx > 0 && b.vx < -0.3) || (dx < 0 && b.vx > 0.3) || (b.vy > 0.5 && Math.abs(dx) < 14)
        if (!toward) continue
        const adx = Math.abs(dx)
        const ady = Math.abs(b.y - (p.y - 14))
        if (ady < 34 && adx < 60) {
            if (Math.abs(b.vy) < 1.2) { if (p.onGround) pad.a = true }
            else { pad.left = dx > 0; pad.right = dx < 0 }
            break
        }
    }
    return pad
}

// --- state hash: FNV-1a over the rounded sim truth (not events, not art). ---
// #3000 order codes for the hash — what the wingman was TOLD is sim truth
// (two channels + the held post), so a replay that dropped a shout diverges.
const ORDER_FORM_C = { follow: 1, hold: 2, spread: 3 }
const ORDER_AIM_C = { level: 0, up: 1, down: 2 }

export function stateHash (gs) {
    let h = 0x811c9dc5
    const put = (v) => {
        let x = Math.round(v * 100)
        x = (x + 0x7fffffff) >>> 0
        const s = String(x)
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
        h ^= 0x2c; h = Math.imul(h, 0x01000193)
    }
    put(gs.tick); put(gs.cam); put(gs.camY); put(gs.score); put(gs.lives); put(gs.nextExt); put(gs.seed); put(gs.r)
    put(gs.loop); put(gs.lk)   // #2894 which pass of stage 1, and the tempo it runs at, are sim truth
    put(gs.phase === 'jungle' ? 0 : gs.phase === 'falls' ? 1 : 2)
    put(gs.safe.x); put(gs.safe.y)
    put(gs.p.x); put(gs.p.y); put(gs.p.vy); put(gs.p.onGround ? 1 : 0); put(gs.p.face); put(gs.p.lane)
    put(gs.p.ax); put(gs.p.ay); put(gs.p.cool); put(WCODE[gs.p.weapon] || 0)
    put(gs.p.inv); put(gs.p.dead); put(gs.p.prevA ? 1 : 0); put(gs.p.out ? 1 : 0)
    put(gs.p.posture); put(gs.p2.posture)   // #3038 the profile is sim truth — it moves
                                           // hit boxes and muzzles, so a replay that
                                           // silently un-ducks a seat diverges loudly
    put(gs.p.barr); put(gs.p2.barr)     // #3060 the shield is sim truth too — it eats
                                        //   rounds, so a replay that silently drops it
                                        //   from either seat diverges loudly
    put(gs.p.vine); put(gs.p2.vine)   // #2885 who rides a vine is sim truth
    for (let vi = 0; vi < VINES.length; vi++) { const tp = vineTip(gs, vi); put(tp.x); put(tp.y) }
    // S4 the blue seat is sim truth — his position and wheel ride the hash;
    // #2814 his lives ARE gs.lives (the shared pool hashes above)
    put(gs.p2.x); put(gs.p2.y); put(gs.p2.vy); put(gs.p2.onGround ? 1 : 0); put(gs.p2.face); put(gs.p2.lane)
    put(gs.p2.ax); put(gs.p2.ay); put(gs.p2.cool); put(WCODE[gs.p2.weapon] || 0)
    put(gs.p2.inv); put(gs.p2.dead); put(gs.p2.prevA ? 1 : 0); put(gs.p2.out ? 1 : 0); put(gs.p2.human ? 1 : 0)
    // #2837 ceremony state is sim truth too — descent and drop-out patience
    // must ride the hash or a replay could silently diverge mid-rope.
    put(gs.p2.enterT); put(gs.p2.idle); put(gs.p2.padClaim ? 1 : 0)
    // #3000 the spoken orders ride the hash — see ORDER_FORM_C above.
    put(ORDER_FORM_C[gs.orderForm] ?? 1); put(ORDER_AIM_C[gs.orderAim] ?? 0); put(gs.holdX || 0)
    for (const b of gs.pb) { put(b.x); put(b.y); put(b.vx); put(b.vy); put(KCODE[b.k] || 0); put(b.hits ? b.hits.length : 0); put(b.o || 0) }
    for (const b of gs.eb) { put(b.x); put(b.y); put(b.vx); put(b.vy); put(b.gr ? 1 : 0) }
    for (const s of gs.soldiers) { put(s.awake ? 1 : 0); put(s.dead ? 1 : 0); put(s.x); put(s.y); put(s.t); put(s.walk); put(s.nade ? 1 : 0); put(s.hp); put(s.rap || 0); put(s.shots || 0); put(s.hangT || 0); put(s.rap === 3 ? s.vy : 0); put(s.leap ? 1 : 0); put(s.leap ? (s.drop || 0) : 0); put(s.leap ? s.vy : 0); put(s.leap ? (s.jlLand || 0) : 0) }   // #3064 who's on a rope, how many rounds he's spent, his patience and the speed of a cut fall are sim truth; #3067 and which canopy man has committed to the drop, and how fast he's falling
    for (const sn of gs.snipers) { put(sn.awake ? 1 : 0); put(sn.dead ? 1 : 0); put(sn.x); put(sn.y); put(sn.t); put(sn.aim); put(sn.pi); put(sn.relocT) }   // #2905 which perch, and the shift mid-leg, are sim truth
    for (const t of gs.turrets) { put(t.dead ? 1 : 0); put(t.hp); put(t.aim); put(t.t) }
    for (const br of gs.barrels) put(br.gone ? 1 : 0)
    put(gs.capsule ? gs.capsule.x : -9999); put(gs.nextCapsule)
    put(gs.capsule ? (CAP_KINDS.indexOf(gs.capsule.kind) + 1) : 0)
    // #2847 the sky couriers are sim truth — schedule, airframes and pods ride
    // the hash (a replay that dropped a carrier must diverge loudly).
    put(gs.nextCarrier); put(gs.carrierN)
    put(gs.bcap ? gs.bcap.x : -9999); put(gs.nextBarr)   // #3060 the drift letter and its
                                        //   schedule are sim truth (the capsule line above, verbatim)
    for (const cr of gs.carriers) { put(cr.x); put(cr.y); put(cr.hp); put(CAP_KINDS.indexOf(cr.kind) + 1) }
    for (const c of gs.pods) { put(c.x); put(c.y); put(c.vy); put(CAP_KINDS.indexOf(c.kind) + 1) }
    // #2917 the gate's sorties are sim truth — schedule and airframe ride the
    // hash (a replay that let a gunship overfly the arena must diverge loudly).
    put(gs.sortieT); put(gs.sortieN)
    put(gs.rapT); put(gs.rapN)   // #3064 the rappel schedule is sim truth too — a replay that skipped a drop diverges loudly
    put(gs.jlT); put(gs.jlN)     // #3067 the frogman schedule is sim truth — a replay that let a bound off the trail un-counted diverges loudly
    for (const sh of gs.gunships) { put(sh.x); put(sh.y); put(sh.hp); put(sh.t); put(sh.flash) }
    put(gs.depot ? gs.depot.hp : -1); put(gs.depot ? (gs.depot.dead ? 1 : 0) : -1); put(gs.depot ? gs.depot.t : -1); put(gs.depot ? gs.depot.spawnT : -1)
    for (const c of gs.vc) put(c.x)
    if (gs.boss) {
        put(gs.boss.core); put(gs.boss.coreT); put(gs.boss.dying)
        // #2880: housing damage is sim truth — a replay that caved a gun must
        // diverge loudly, so hp/dead ride the hash alongside the cadence.
        for (const g of gs.boss.guns) { put(g.t); put(g.hp); put(g.dead ? 1 : 0) }
        for (const d of gs.boss.doors) put(d.t)
        put(gs.boss.hangar.open); put(gs.boss.hangar.launchAt)   // #2917 the door's grind is sim truth
    } else put(-1)
    put(gs.end ? (gs.end === 'win' ? 2 : 1) : 0)
    return (h >>> 0)
}
