// sim.js — DOUBLE DRAGON S1 "Walnuts Street" — the pure brawler engine.
// DOM-free: Node (ddragoncheck) and the browser shell share THIS truth.
// Determinism law: every sim random derives from the seed (mulberry32);
// Math.random() may only feed juice in the shell (particles, shake).
//
// The spec (issue #2807, the original: Technōs arcade 1987):
//  - belt-scroll brawl with a depth axis (8-way walk, y = depth, draw order)
//  - weighted strikes: punch / kick / jump kick; stagger, knockdown, get-up
//  - the signature spin back-heel when surrounded
//  - one hit costs Billy a life (arcade lethal); 3 lives, respawn i-frames
//  - stick pickup extends reach and damage
//  - waves: Williams goons -> Amons (one armed) -> Abobo mini-boss
// S2 (the weapons wall, #2807): thrown knives (reusable steel), the whip
// (long multi-hit lash), smashable barrels (solid props hiding a weapon),
// one weapon in hand — contextual PUNCH: bare jab / knife throw / whip lash.
// S3 (the hideout, #2807): a second stage — the industrial yard. Knife-casting
// Williamses turn the weapons wall against you; the arcade's stage-2 boss
// Williams duels with steel; and Marian waits tied at the yard's end — the
// rescue that ends the run-loop (score carried, arcade continuation law).

export const W = 320
export const H = 224
export const DEEP_TOP = 132   // far edge of the street band (feet y)
export const DEEP_BOT = 206   // near edge of the street band
export const STAGE_W = 960     // three screens to the clear
export const PROPS_DEPTH = DEEP_BOT + 4 // foreground props sit nearer than the fight band

export const CFG = {
    walkSpeed: 1.2,
    deepSpeed: 0.9,
    jumpV: 4.7,
    jumpG: 0.23,
    punch: { startup: 4, active: 4, recover: 6, reach: 15, depth: 7, dmg: 1 },
    kick: { startup: 6, active: 5, recover: 8, reach: 21, depth: 7, dmg: 2 },
    stickPunchReach: 23,
    stickKickReach: 27,
    stickDmg: 2,
    spin: { total: 26, reach: 24, dmg: 2 },
    jumpKickDmg: 3,
    hitstun: 14,          // enemy stagger on a non-knockdown hit
    downTime: 44,         // ticks flat on the street
    getupTime: 22,        // then this many ticks of enemy i-frames
    respawnIFrames: 100,
    // #2874 first-timer readability: a life costs a VISIBLE beat — the seat
    // is knocked flat where it fell, then remounts at the usual spawn with
    // the old flicker. The HUD answers a loss with a blinking LIVES tag.
    respawnKnock: 36,
    livesFlash: 90,
    tipHold: 300,
    grabRange: 15,
    grabEscape: 3,        // presses to break free
    grabTimeout: 52,      // ticks held before the thug's knee lands (a life)
    attackersMax: 2,      // crowd law: never three at once
    lives: 3,
    clearHold: 150,       // STAGE CLEAR banner ticks before the loop re-runs
    // --- S2 weapons wall (#2807) ---
    throwK: { startup: 4, total: 14 },   // PUNCH with a knife: the delivery
    knifeSpeed: 3.6,
    knifeDmg: 4,          // a thrown blade kills a Williams outright
    whip: { startup: 8, active: 8, recover: 12, reach: 34, dmg: 2, depth: 9 },
    barrelHp: 3,
    // #2819 S2 polish beats: landed steel stands in the ground for a moment
    // before it can be picked up, the whip holds a white crack-flash on the
    // tick it connects, and the wood spits its cargo with a bouncing clatter.
    knifeStick: 20,
    whipFlash: 4,
    clatterTicks: 14,
    // --- S3 the hideout (#2807) ---
    goonKnife: { windup: 16, speed: 3.0, keep: 34 },  // aimed cast; lethal on the line; #2825 thrower's distance
    duelHp: 10, duelScore: 800, duelSpeed: 1.05, duelReach: 17,
    rescueRange: 22, rescueCuts: 2, rescueBonus: 1000, rescueCheer: 100,
    // --- #2882 chain scoring ---
    chainWindow: 180,   // a hot chain cools after this many ticks without a take (~3 s)
    chainMax: 4,        // the escalation tops out at ×4 (Abobo pays 4000 at the cap)
    // --- #2857 partner-personality juice (all render-side laws: hash-free) ---
    guardTicks: 8,      // a guardian sprint keeps its glint trail this long
    reliefTicks: 9,     // freed from a grip: arms-up relief pose
    flourishTicks: 20,  // own-hand KO: flick of the wrist, then the shoulder check
}

// --- #2891 the original's opening: the kidnapping of Marian -------------------
// Technōs 1987 opened by telling you why the fight happens: the Black Warriors
// close in on the night street, the giant takes Marian overhead, the two
// dragons charge and are swarmed — then Walnuts Street opens and you go get
// her back. This is that movie: a FIXED script riding gs.intro. It consumes
// nothing the run keeps — no gs.r, no nextId (the cast wears negative ids),
// no collisions (step() routes the whole game around it) — so the stage that
// opens after the last caption is bit-identical to a run that never played it
// (pinned: `hash` equality after the curtain). Default OFF at sim level —
// makeGame/contract/reset streams drive the law-clean run; the shell's human
// start opts in. Any input after the grace beat skips it: the movie respects
// the player, and "PRESS ANY KEY" still means play now.
export const INTRO = {
    total: 458,        // ticks of the full movie (~7.6 s; #2897: the tail walks)
    grace: 30,         // ticks before an input may skip — the start tap settles
    fleeAt: 90,        // Marian spots the gang
    grabAt: 155,       // the giant's prize
    takenAt: 300,      // "MARIAN TAKEN!" — the crime named on screen
    takenShown: 124,   // ticks the caption stands (#2897: a back-row hold)
    flash: 3,          // #2897: white frames the caption punches in on
    walkY: (DEEP_TOP + DEEP_BOT) / 2 | 0,   // the line the street reopens on
}

// the cast: negative ids keep the game's id stream byte-clean (#2891).
const mkIntroGoon = (id, kind, x, y) => ({
    id, kind, x, y, face: -1,
    hp: ENEMY_DEF[kind].hp, state: 'walk', stateT: 0, anim: 0,
    hasStick: false, stickDropped: false, hasKnife: false,
    attackCooldown: 1e9, inv: 0, spinHit: false, wob: 0,
})

// seed the movie: cast and victim stand by off-frame, stage 1 fresh.
function armIntro(gs) {
    gs.intro = {
        t: 0, takenT: 0, flashT: 0,
        marian: { x: 300, y: 160, grabbed: false, lift: 0, bubble: 0, scared: false, anim: 0 },
        goons: null,   // filled below; the script holds direct links
    }
    const g = [
        mkIntroGoon(-1, 'williams', 330, 168),
        mkIntroGoon(-2, 'amon', 330, 178),
        mkIntroGoon(-3, 'williams', 330, 158),
        mkIntroGoon(-4, 'abobo', 330, 172),
    ]
    gs.intro.goons = g
    gs.enemies.push(...g)
}

// the curtain: reset the street to exact spawn truth — same x/y/face/i-frames
// makeFighter gives, zero residue (tick is rewound so the run that watched the
// movie is bit-identical to the run that skipped everything).
export function endIntro(gs) {
    gs.intro = null
    gs.enemies.length = 0
    for (const p of fighters(gs)) {
        p.x = p.tag === 'billy' ? 40 : 24
        p.y = INTRO.walkY
        p.face = 1; p.z = 0; p.zv = 0
        p.state = 'idle'; p.stateT = 0; p.anim = 0
        p.inv = CFG.respawnIFrames
        p.grabFrom = null; p.guard = 0; p.relief = 0; p.flourish = 0
    }
    gs.waveIdx = 0; gs.waveActive = false; gs.camLock = false; gs.camX = 0
    gs.banner = 0; gs.bannerKind = null
    gs.tick = 0
    gs.events.push('stage')
}

const anyInput = (a, b) =>
    !!(a && (a.left || a.right || a.up || a.down || a.a || a.b || a.punch)) ||
    !!(b && (b.left || b.right || b.up || b.down || b.a || b.b || b.punch))

// the movie, beat by beat (pure function of t — no rng, no physics).
function stepIntro(gs, pad, pad2) {
    const I = gs.intro
    if (I.t > INTRO.grace && anyInput(pad, pad2)) { endIntro(gs); return gs }
    I.t += 1
    const t = I.t
    const seg = (t0, t1) => Math.max(0, Math.min(1, (t - t0) / (t1 - t0)))
    const at = (t0) => t === t0
    const [w1, am, w2, ab] = I.goons
    const m = I.marian

    // — the dragons stroll the street (they have nowhere to be yet)
    const b = gs.billy
    if (t < 80) { b.x = 8 + 0.5 * t; b.state = 'walk'; b.face = 1; b.anim += 1 }
    else if (t < 190) { b.x = 48; b.state = 'idle' }
    else if (t < 236) { b.x = 48 + 2.2 * (t - 190); b.state = 'walk'; b.face = 1; b.anim += 1 }
    else if (t < 252) { b.x = 150; if (b.state !== 'punch') { b.state = 'punch'; b.stateT = 0 } else b.stateT += 1 }
    else if (t < 268) { b.x = 150 + 0.8 * (t - 252); b.state = 'walk'; b.anim += 1 }
    else if (t < 294) { if (b.state !== 'dying') { b.state = 'dying'; b.stateT = 0 } else b.stateT += 1 }
    else if (t < 360) { b.state = 'down'; b.stateT += 1 }
    else { b.x = 163 - (163 - 40) * seg(360, INTRO.total - 10); b.state = t < INTRO.total - 10 ? 'walk' : 'idle'; b.face = -1; b.anim += 1 }

    const j = gs.jimmy
    if (j) {
        if (t < 80) { j.x = -6 + 0.5 * t; j.state = 'walk'; j.face = 1; j.anim += 1 }
        else if (t < 192) { j.x = 34; j.state = 'idle' }
        else if (t < 254) { j.x = 36 + (130 - 36) * seg(192, 254); j.state = 'walk'; j.face = 1; j.anim += 1 }
        else if (t < 270) { j.x = 130; if (j.state !== 'punch') { j.state = 'punch'; j.stateT = 0 } else j.stateT += 1 }
        else if (t < 276) { j.state = 'idle' }
        else if (t < 302) { if (j.state !== 'dying') { j.state = 'dying'; j.stateT = 0 } else j.stateT += 1 }
        else if (t < 370) { j.state = 'down'; j.stateT += 1 }
        else { j.x = 130 - (130 - 24) * seg(370, INTRO.total - 10); j.state = t < INTRO.total - 10 ? 'walk' : 'idle'; j.face = -1; j.anim += 1 }
    }

    // — Marian: a walk with nowhere to be, then the running, then the lift
    if (!m.grabbed) {
        if (t < INTRO.fleeAt) { m.x = 300 - 0.8 * t; m.scared = false }
        else { m.x = 236 - 1.1 * (t - INTRO.fleeAt); m.scared = true }
        m.anim += 1
    }
    if (t >= INTRO.grabAt && !m.grabbed) { m.grabbed = true; m.bubble = INTRO.takenShown; gs.events.push('grabbed') }
    if (m.grabbed) { m.lift = Math.round(22 * seg(INTRO.grabAt, INTRO.grabAt + 10)); if (m.bubble > 0) m.bubble -= 1 }

    // — the Black Warriors close in: Williams, Amon, Williams, then the giant
    if (t === 80) gs.events.push('wave')
    if (t === 95 || t === 158 || t === 166) gs.events.push('scream')
    if (t < 112) { w1.x = 330 - (330 - 250) * seg(80, 112); w1.state = 'walk'; w1.anim += 1 }
    else if (t < 160) w1.state = 'idle'
    else if (t < 236) { w1.x = 250 - (250 - 212) * seg(160, 236); w1.state = 'walk'; w1.anim += 1 }
    else if (t < 240) w1.state = 'windup'
    else if (t === 240) { w1.state = 'dying'; w1.stateT = 0; gs.events.push('ko') }   // Billy's answer
    else if (w1.state === 'dying' && w1.stateT <= 30) w1.stateT += 1

    if (t < 120) { am.x = 330 - (330 - 272) * seg(80, 120); am.state = 'walk'; am.anim += 1 }
    else if (t < 160) am.state = 'idle'
    else if (t < 240) { am.x = 272 - (272 - 216) * seg(160, 240); am.state = 'walk'; am.anim += 1 }
    else if (t < 258) { am.state = 'idle' }
    else if (t < 268) { am.state = 'windup' }
    else if (t === 268) { am.state = 'attack'; gs.events.push('hit_hard') }             // the swarm lands
    else if (t < 276) { am.state = 'walk'; am.x = 216 - (216 - 195) * seg(268, 276); am.anim += 1 }
    else if (t === 276) { am.state = 'attack'; gs.events.push('hit_hard') }             // and again
    else if (t < 300) am.state = 'idle'
    else { am.x = 195 + 175 * seg(300, INTRO.total - 6); am.state = 'walk'; am.face = 1; am.anim += 1 }   // #2897: the straggler — mid-exit as the caption clears, gone six ticks before the curtain

    if (t < 128) { w2.x = 330 - (330 - 294) * seg(80, 128); w2.state = 'walk'; w2.anim += 1 }
    else if (t < 160) w2.state = 'idle'
    else if (t < 254) { w2.x = 294 - (294 - 258) * seg(160, 254); w2.state = 'walk'; w2.anim += 1 }
    else if (t < 258) w2.state = 'windup'
    else if (t === 258) { w2.state = 'dying'; w2.stateT = 0; gs.events.push('ko') }    // Jimmy's answer
    else if (w2.state === 'dying' && w2.stateT <= 30) w2.stateT += 1

    // Abobo: in heavy, take the prize, walk east with the prize — he never
    // fights; he never has to.
    if (t < 150) { ab.x = 330 - (330 - 178) * seg(80, 150); ab.state = 'walk'; ab.anim += 1 }
    else if (t < 170) { ab.state = 'grab'; ab.anim += 1 }
    else { ab.x = 178 + (330 + 40 - 178) * seg(170, 300); ab.state = 'walk'; ab.face = 1; ab.anim += 1 }
    // the prize rides the shoulder EXACTLY — Marian samples Abobo AFTER he
    // moves this tick, so they never drift a pixel apart on the carry east.
    if (m.grabbed) { m.x = ab.x; m.y = ab.y }

    if (I.flashT > 0) I.flashT -= 1   // #2897: the white beat under the caption decays
    if (at(INTRO.takenAt)) { I.takenT = INTRO.takenShown; I.flashT = INTRO.flash; gs.events.push('taken') }
    if (I.takenT > 0) I.takenT -= 1

    if (t >= INTRO.total) endIntro(gs)
    return gs
}

export const ENEMY_DEF = {
    williams: { hp: 4, speed: 0.85, score: 200, reach: 16, tall: 32, color: 'williams' },
    amon: { hp: 6, speed: 0.95, score: 300, reach: 17, tall: 36, color: 'amon' },
    abobo: { hp: 14, speed: 0.7, score: 1000, reach: 20, tall: 44, color: 'abobo' },
    // S3 duel: Williams the lieutenant (the arcade's stage-2 boss) — faster,
    // tougher than his cap-wearing namesakes, and he fights with steel.
    duel: { hp: CFG.duelHp, speed: CFG.duelSpeed, score: CFG.duelScore, reach: CFG.duelReach, tall: 34, color: 'duel' },
}

export const WAVES = [
    { triggerX: 90, spawns: [{ kind: 'williams', side: 'left' }, { kind: 'williams', side: 'right' }] },
    { triggerX: 340, spawns: [{ kind: 'amon', side: 'right', stick: true }, { kind: 'amon', side: 'left' }] },
    { triggerX: 560, spawns: [{ kind: 'abobo', side: 'right' }, { kind: 'williams', side: 'left' }, { kind: 'williams', side: 'right' }] },
]

// S3 — the hideout: casters first (the arcade stage-2 trademark), then the
// duel with Williams himself. No third wheel in the duel: one man, one lie.
export const WAVES_S2 = [
    { triggerX: 90, spawns: [{ kind: 'williams', side: 'left' }, { kind: 'williams', side: 'right' }] },
    { triggerX: 360, spawns: [{ kind: 'williams', side: 'left', knife: true }, { kind: 'williams', side: 'right' }] },
    { triggerX: 620, spawns: [{ kind: 'duel', side: 'right', knife: true }] },
]
export const wavesFor = (gs) => (gs.stage === 2 ? WAVES_S2 : WAVES)

// mulberry32 — the one seeded rng the sim consumes.
export function mulberry32(seed) {
    let a = seed >>> 0
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// S4 (#2807, co-op): a seat is a fighter — Billy and Jimmy share the exact
// physics bank (strikes, lethal law, weapons, pickups). `tag` names the seat
// for events/hash; `human` is the Contra S4 drop-in flag (a first touch of a
// P2 key hands the CPU seat to a person for the rest of the run); `out` means
// the pool is empty — the seat goes dark until a second wind at the next stage.
function makeFighter(tag) {
    return {
        tag,
        x: tag === 'billy' ? 40 : 24, y: (DEEP_TOP + DEEP_BOT) / 2 | 0, face: 1,
        z: 0, zv: 0,
        state: 'idle',    // idle|walk|jump|punch|kick|spin|throw|whip|grabbed|dying
        stateT: 0, anim: 0,
        attackHit: null,  // set of enemy ids hit by the current swing
        inv: CFG.respawnIFrames, // merciful flicker at the start
        weapon: null,     // null | 'stick'
        grabFrom: null,   // enemy id holding him
        presses: 0, pressCooldown: 0,
        lash: 0,          // #2819: white crack-flash ticks left on the whip
        lives: CFG.lives,
        human: false,
        out: false,
        backAt: -9999, // #2833: tick a drained seat returned on second wind (HUD flash window)
        guard: 0,      // #2857: ticks left wearing the guardian glint (sprinting the holder)
        relief: 0,     // #2857: ticks left of the freed-seat arms-up pose
        flourish: 0,   // #2857: ticks left of the post-KO flourish (flick → shoulder check)
        knock: 0,      // #2874: ticks left flat on the boards after losing a life
    }
}

const makeBilly = () => makeFighter('billy')

// The dragons on the street: always Billy; Jimmy when the co-op seat exists.
// Seats with empty pools (out) don't fight, breathe or get targeted.
export function fighters(gs) {
    return gs.jimmy ? [gs.billy, gs.jimmy] : [gs.billy]
}
const activeFighters = (gs) => fighters(gs).filter((p) => !p.out && p.state !== 'dying')

// Crowd law (S4): two thugs pile on one lone dragon; three when the street
// holds two — the arcade's co-op crowds are visibly deeper.
const attackerCap = (gs) => (gs.coop ? CFG.attackersMax + 1 : CFG.attackersMax)

// Commitment with hysteresis: a goon works the nearest dragon and only
// switches when the other gets 24px meaningfully closer — no dithering
// between two men standing side by side.
function targetOf(gs, e) {
    const cands = activeFighters(gs)
    if (cands.length === 0) return gs.billy
    const dist = (p) => Math.abs(p.x - e.x) + Math.abs(p.y - e.y) * 0.6
    let cur = cands.find((p) => p.tag === e.tgt)
    // mid-action, the commitment holds: a grab, a swing or a committed cast
    // never teleports to the other dragon half-way through
    if (cur && COMMITTED.has(e.state)) return cur
    let best = cands[0]
    for (const p of cands) if (dist(p) < dist(best)) best = p
    if (!cur || dist(best) + 24 < dist(cur)) { e.tgt = best.tag; return best }
    return cur
}

// states where the thug is committed to its chosen dragon
const COMMITTED = new Set(['windup', 'chargewind', 'charge', 'aim', 'cast', 'attack', 'grab'])

// #2874: the arcade cabinet marquee told you which keys bit; our screen said
// nothing. One strip, the cabinet's own wording, shown on the attract screen
// and for the first seconds of 1-1. Lives in the sim so the check can pin the
// words themselves, not just that something drew.
export const TIP = 'ARROWS WALK  Z PUNCH  X KICK  SPACE JUMP'

export function makeGame(seed = 1, opts = {}) {
    // rng rides IN the state so snapshot/restore is byte-exact (#391):
    // a JSON deep-copy of gs carries the generator integer, not a closure.
    // S4: co-op is a GAME option — the shell plays co-op by default (Jon's
    // multiplayer rule), the sim defaults solo so every S1..S3 law fixture
    // still drives exactly one dragon.
    const coop = opts.coop === true
    const gs = {
        seed: seed >>> 0, rngState: seed >>> 0, nextId: 1,
        tick: 0, mode: 'play',   // play | clear | gameover
        score: 0, hi: 0,
        cleared: false,
        stage: 1,               // 1 Walnuts Street · 2 the hideout (#2807 S3)
        camX: 0, camLock: false,
        coop,                   // S4: Jimmy Lee fights beside Billy (#2807)
        billy: makeBilly(),
        jimmy: coop ? makeFighter('jimmy') : null,
        enemies: [],
        pickups: [],
        barrels: makeBarrels(1),   // stage props: barrels out front, crates in the yard
        projectiles: [],
        waveIdx: 0, waveActive: false, banner: 0,
        duelIntro: 0,       // #2825: the lieutenant announces himself (banner + held pose)
        marian: null,           // set when stage 2 opens — tied at the yard's end
        rescueT: 0,             // cheer ticks after the ropes part
        scoreFlash: null, // { v, t } — HUD score delta on a KO/pickup (juice, not scored state)
        livesFx: null,  // #2874 { tag, t } — a seat just lost a life; the HUD blinks its LIVES
        tipT: CFG.tipHold, // #2874 ticks left showing the key strip at play's start
        tipText: TIP,   // #2874 the strip itself (a sim constant so checks can pin its words)
        fx: null,       // { x, y } — where the last barrel splintered (shell shard spawn, juice)
        gripFx: null,   // #2857 { x, y } — where a grip just broke (shell impact flash, juice)
        events: [],   // one-shot cues drained by the shell (sound/juice only)
        chain: 0,     // #2882: consecutive takes; the payout rides min(chain, chainMax)
        chainT: 0,    // ticks left in the chain window — a lapse cools the chain to 0
        intro: null,  // #2891: the opening movie (null in every law fixture — opt-in)
    }
    if (opts.intro === true) armIntro(gs)
    return gs
}

function spawnEnemy(gs, kind, side, stick) {
    const def = ENEMY_DEF[kind]
    const e = {
        id: gs.nextId++, kind,
        // #2810 item 5: spawn well off-screen so the enter FSM is actually
        // SEEN marching in — the old ±20 px faded in at the very pixel edge.
        x: side === 'left' ? gs.camX - 44 : gs.camX + W + 44,
        y: DEEP_TOP + Math.floor(rng(gs) * (DEEP_BOT - DEEP_TOP)),
        face: side === 'left' ? 1 : -1,
        hp: def.hp, state: 'enter', stateT: 0, anim: Math.floor(rng(gs) * 8),
        hasStick: !!stick, stickDropped: false,
        hasKnife: false, castCooldown: 0,   // S3: steel in a goon's hand
        tgt: null,                          // S4: which dragon this thug works
        attackCooldown: 30 + Math.floor(rng(gs) * 60),
        inv: 0, spinHit: false,
        wob: 0,                             // #2857: stagger wobble juice (never hashed)
    }
    gs.enemies.push(e)
    return e
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

// --------------------------------------------------------- S2 solid props ---
// Three barrels squat on Walnuts Street. They are OBSTACLES: anything that
// moves asks blocked() (the lamppost law) — Billy walks around them or hops
// the waist-high ones; goons slide the depth axis to get round them. Three
// clean hits splinter one and it gives up the steel inside.
// S3: the hideout yard stacks CRATES instead — same solidity law (the props
// array keeps its name; `kind` only steers the art), laid out for the duel.
export function makeBarrels(stage = 1) {
    if (stage === 2) {
        return [
            { id: 1, x: 240, y: DEEP_BOT - 10, hp: CFG.barrelHp, shake: 0, kind: 'crate' },
            { id: 2, x: 420, y: DEEP_TOP + 10, hp: CFG.barrelHp, shake: 0, kind: 'crate' },
            { id: 3, x: 540, y: DEEP_BOT - 6, hp: CFG.barrelHp, shake: 0, kind: 'crate' },
        ]
    }
    return [
        { id: 1, x: 250, y: DEEP_TOP + 8, hp: CFG.barrelHp, shake: 0 },
        { id: 2, x: 430, y: 168, hp: CFG.barrelHp, shake: 0 },
        { id: 3, x: 700, y: DEEP_BOT - 8, hp: CFG.barrelHp, shake: 0 },
    ]
}

export function blocked(gs, x, y, radius = 0) {
    return gs.barrels.some((bar) => Math.abs(bar.x - x) <= 10 + radius && Math.abs(bar.y - y) <= 11 + radius)
}

// axis-separated move so a snagged x never eats the y (and vice versa).
// If a wanted x-step is denied by a prop, k-slip depth to the nearest open
// lane — real thugs walk AROUND the barrels, they do not lean on them.
function moveEntity(gs, ent, dx, dy, radius = 0) {
    let movedX = false
    if (dx && !blocked(gs, ent.x + dx, ent.y, radius)) { ent.x += dx; movedX = true }
    if (dy && !blocked(gs, ent.x, ent.y + dy, radius)) ent.y += dy
    if (dx && !movedX) {
        // k-slip: the wanted x was refused — open the depth axis toward the
        // direction the body ALREADY wanted (dy). Down-first k-slip fought
        // depthSlip's up-pull over a crate corner and froze both dragons and a
        // Williams in a tug-of-war for 57,000 ticks (the S4 co-op seed-2 stall).
        for (let k = 2; k <= 32; k++) {
            const dn = clamp(ent.y + k, DEEP_TOP, DEEP_BOT), up = clamp(ent.y - k, DEEP_TOP, DEEP_BOT)
            const first = dy < 0 ? [up, dn] : [dn, up]
            if (first[0] !== ent.y && !blocked(gs, ent.x, first[0], radius)) { ent.y = first[0]; return }
            if (first[1] !== ent.y && !blocked(gs, ent.x, first[1], radius)) { ent.y = first[1]; return }
        }
    }
}

// Corner deadlock: a body pressed into a footprint corner can have BOTH axes
// blocked (every single-step destination is still inside). Slide the depth
// axis outward to the nearest open lane — nobody freezes on a barrel.
function stuckFree(gs, ent, radius = 0) {
    if (!blocked(gs, ent.x, ent.y, radius)) return
    for (let k = 1; k <= 32; k++) {
        const dn = ent.y + k, up = ent.y - k
        if (dn <= DEEP_BOT && !blocked(gs, ent.x, dn, radius)) { ent.y = dn; return }
        if (up >= DEEP_TOP && !blocked(gs, ent.x, up, radius)) { ent.y = up; return }
    }
    ent.x += ent.x <= gs.camX + W / 2 ? -12 : 12
}

// The barrel-law shared by every walking branch: when a body wants to step
// but wood owns the destination, slide the DEPTH axis until the lane opens.
// Keep the chosen direction while the road stays shut (re-derived dirs
// ping-pong on the mid-line); flip when the clamp eats the step (the pocket
// at DEEP_BOT under barrel 3 — the Abobo freeze); k-slip out if ±0.9 can't
// clear the band at this x at all. Seeds 1..24 pin every shape of this.
function depthSlip(gs, ent, radius = 0) {
    if (gs.barrels.length === 0) return
    const bar = gs.barrels.reduce((a, q) => (Math.abs(q.x - ent.x) < Math.abs(a.x - ent.x) ? q : a), gs.barrels[0])
    let dir = ent.dodge || (ent.y >= bar.y ? CFG.deepSpeed : -CFG.deepSpeed)
    let ny = clamp(ent.y + dir, DEEP_TOP, DEEP_BOT)
    if (ny === ent.y || blocked(gs, ent.x, ny, radius)) {
        const f = -dir
        const fy = clamp(ent.y + f, DEEP_TOP, DEEP_BOT)
        if (fy !== ny && !blocked(gs, ent.x, fy, radius)) { dir = f; ny = fy }
    }
    ent.dodge = ny !== ent.y ? dir : 0
    if (ny !== ent.y && !blocked(gs, ent.x, ny, radius)) ent.y = ny
    if (ent.dodge === 0) {
        for (let k = 2; k <= 32; k++) {
            const dn = clamp(ent.y + k, DEEP_TOP, DEEP_BOT), up = clamp(ent.y - k, DEEP_TOP, DEEP_BOT)
            if (dn !== ent.y && !blocked(gs, ent.x, dn, radius)) { ent.y = dn; ent.dodge = CFG.deepSpeed; break }
            if (up !== ent.y && !blocked(gs, ent.x, up, radius)) { ent.y = up; ent.dodge = -CFG.deepSpeed; break }
        }
    }
}

function rollWeaponDrop(gs, x, y, clatter = 0) {
    const roll = rng(gs)
    const kind = roll < 0.4 ? 'knife' : roll < 0.8 ? 'whip' : 'stick'
    gs.pickups.push({ x: clamp(x, 8, STAGE_W - 8), y, kind, bob: 0, clatter })
}

// #2882 chain scoring — the arcade pays flurries. Every takedown (a fighter
// KO, a barrel/crate splinter) is a TAKE: consecutive takes multiply the base
// payout ×2, ×3, capped at ×4. Damage (playerDies) or a window lapse cools it.
// The escalation is sim truth — chain/chainT ride stateHash; the ×N tag on the
// popup is juice. Zero gs.r: pure arithmetic on existing per-KO values.
function payTakedown(gs, base) {
    const mult = Math.min(gs.chain + 1, CFG.chainMax)
    gs.score += base * mult
    gs.hi = Math.max(gs.hi, gs.score)
    gs.chain = mult
    gs.chainT = CFG.chainWindow
    if (mult > 1) gs.events.push('chain')
    return base * mult
}

// a swing/blade met a barrel — hp down, splinter when empty
// #2825: the yard's crates report their own events — pine takes the blows
// with a heavier thud and splits louder than the street's barrels.
function hurtBarrel(gs, bar) {
    bar.hp -= 1
    bar.shake = 6
    gs.events.push(bar.kind === 'crate' ? 'crate_hit' : 'barrel_hit')
    if (bar.hp <= 0) {
        gs.barrels = gs.barrels.filter((q) => q !== bar)
        const v = payTakedown(gs, 100)
        gs.scoreFlash = { v, t: 48, m: gs.chain }
        gs.fx = { x: bar.x, y: bar.y }   // #2819: the shell throws wood shards here
        gs.events.push(bar.kind === 'crate' ? 'crate_break' : 'barrel_break')
        rollWeaponDrop(gs, bar.x, bar.y, CFG.clatterTicks)
    }
}

// #2833: the blue seat sounds blue. Seat-centric sounds take a `_b` suffix
// when Jimmy is the one swinging — the shell detunes them so the two dragons
// sit apart at an ear. Nothing here rides stateHash (events are juice).
const blue = (seat, ev) => (seat === 'jimmy' ? ev + '_b' : ev)

function throwKnife(gs, p) {
    gs.projectiles.push({ id: gs.nextId++, x: p.x + p.face * 10, y: p.y, vx: p.face * CFG.knifeSpeed, spin: 0, side: p.tag })
    gs.events.push(blue(p.tag, 'throw'))
}

// S3: a Williams lets one fly — flat down its own lane, the arcade's stage-2
// cast. The depth law is the only answer: same lane, it takes the life.
function goonCast(gs, e) {
    gs.projectiles.push({ id: gs.nextId++, x: e.x + e.face * 10, y: e.y, vx: e.face * CFG.goonKnife.speed, spin: 0, side: 'goon' })
    gs.events.push('goon_throw')
}

// A seat takes a hit that costs a life. Arcade lethal stands for BOTH dragons;
// game over only when every pool is empty (S4: the partner carries on).
function playerDies(gs, p) {
    p.lives -= 1
    p.weapon = null
    // #2882: damage is the full stop — whoever eats the blow, the shared
    // score board cools its chain (the arcade rewards pressing on untouched).
    gs.chain = 0; gs.chainT = 0
    gs.events.push(p.tag === 'billy' ? 'billy_die' : 'jimmy_die')
    if (p.lives <= 0) {
        p.out = true
        p.state = 'dying'; p.stateT = 0
        gs.livesFx = { tag: p.tag, t: CFG.livesFlash } // #2874: show the cost
        if (activeFighters(gs).length === 0) { gs.mode = 'gameover'; return }
        gs.events.push('seat_down')
        return
    }
    // #2874: the arcade knocked you flat before it put you back — a seat
    // losing a life drops where it fell for a beat (no input, no hits), then
    // remounts at the spawn point with the old i-frame flicker. Newcomers
    // read *why* the screen moved; the lethal law itself is untouched.
    p.state = 'down'; p.stateT = 0; p.z = 0; p.zv = 0
    p.knock = CFG.respawnKnock
    p.inv = CFG.respawnIFrames
    p.grabFrom = null
    gs.livesFx = { tag: p.tag, t: CFG.livesFlash }
    gs.enemies.forEach((e) => { if (e.state === 'grab' && e.tgt === p.tag) { e.state = 'stagger'; e.stateT = CFG.hitstun } })
}

// hit an enemy; returns true if it died
function hurtEnemy(gs, e, dmg, knockdown, onDowned, seat, kind) {
    if (e.inv > 0 || e.state === 'dying' || e.state === 'getup') return false
    if (e.state === 'down' && !onDowned) return false
    e.hp -= dmg
    // #2857 cadence readability: the blue seat's bare jab bites with its own
    // voice — a snap, not a slam — so technique reads apart from power at an
    // ear. Billy's sounds and every knockdown keep the shared hit/hit_hard.
    const jab = seat === 'jimmy' && kind === 'punch' && !knockdown
    gs.events.push(blue(seat, jab ? 'jab' : knockdown ? 'hit_hard' : 'hit'))
    if (e.hp <= 0) {
        e.state = 'dying'; e.stateT = 0
        const v = payTakedown(gs, ENEMY_DEF[e.kind].score)
        gs.scoreFlash = { v, t: 48, m: gs.chain } // #2810 item 6, #2882 rides the tag
        gs.events.push('ko')
        // #2857 post-KO flair: the seat that dropped him poses over the body —
        // the arcade strut. A barrel's splinter pays score but never the pose.
        const hero = fighters(gs).find((pp) => pp.tag === seat)
        if (hero) { hero.flourish = CFG.flourishTicks; gs.events.push(blue(seat, 'flair')) }
        if (e.hasStick && !e.stickDropped) {
            e.hasStick = false
            gs.pickups.push({ x: e.x, y: e.y, kind: 'stick', bob: 0 })
        }
        // S3: armed goons pay out their steel when they go down
        if (e.hasKnife) {
            e.hasKnife = false
            gs.pickups.push({ x: e.x, y: e.y, kind: 'knife', bob: 0 })
        }
        return true
    }
    if (knockdown) { e.state = 'down'; e.stateT = 0 }
    else {
        e.state = 'stagger'; e.stateT = CFG.hitstun
        // #2857: the technician's jabs leave a wider wobble on the man they
        // rock — the blue seat's hits read bigger at a glance than the red's.
        e.wob = seat === 'jimmy' ? 7 : 4
    }
    e.flash = 6 // #2874: every landed blow lights the man white — hits SHOW
    return false
}

function fighterAttack(gs, p, kind) {
    if (p.state === 'punch' || p.state === 'kick' || p.state === 'spin' || p.state === 'throw' || p.state === 'whip') return
    // the signature spin back-heel: a swing asked for while surrounded —
    // surround counts radially (the heel boots BOTH ways), unlike a aimed swing
    const grounded = gs.enemies.filter((e) => e.state !== 'dying' && e.state !== 'down' && e.inv <= 0)
    const near = grounded.filter((e) => Math.abs(e.x - p.x) <= CFG.spin.reach + 6 && Math.abs(e.y - p.y) <= 10)
    if (p.z === 0 && near.length >= 2) {
        p.state = 'spin'; p.stateT = 0; p.attackHit = new Set()
        gs.events.push(blue(p.tag, 'whoosh'))
        return
    }
    // contextual PUNCH — the weapons wall (#2807): the knife is thrown, not
    // waved; the whip lashes. KICK stays a kick whatever you hold.
    if (kind === 'punch' && p.z === 0 && p.weapon === 'knife') {
        p.weapon = null
        p.state = 'throw'; p.stateT = 0
        return
    }
    if (kind === 'punch' && p.z === 0 && p.weapon === 'whip') {
        p.state = 'whip'; p.stateT = 0; p.attackHit = new Set()
        gs.events.push(blue(p.tag, 'whip'))
        return
    }
    if (p.z > 0) { p.state = kind === 'punch' ? 'punch' : 'kick'; p.attackHit = new Set(); gs.events.push(blue(p.tag, 'whoosh')); return }
    p.state = kind
    p.stateT = 0
    p.attackHit = new Set()
    gs.events.push(blue(p.tag, 'whoosh'))
}

function reachFor(p, kind) {
    if (kind === 'whip') return CFG.whip.reach
    const stick = p.weapon === 'stick'
    if (kind === 'punch') return stick ? CFG.stickPunchReach : CFG.punch.reach
    return stick ? CFG.stickKickReach : CFG.kick.reach
}

function applySwing(gs, p) {
    const cfg = CFG[p.state]
    if (!cfg) return
    if (p.stateT < cfg.startup || p.stateT >= cfg.startup + cfg.active) return
    const reach = reachFor(p, p.state)
    const stick = p.weapon === 'stick'
    const dmg = stick ? CFG.stickDmg : p.state === 'whip' ? CFG.whip.dmg : cfg.dmg
    const down = p.state === 'kick' || stick || p.state === 'whip'
    const tol = p.state === 'whip' ? CFG.whip.depth : CFG.punch.depth + 2
    for (const e of gs.enemies) {
        if (p.attackHit.has(e.id)) continue
        if (e.state === 'dying') continue
        if (e.state === 'down') continue   // standing swings do not stomp
        const dx = (e.x - p.x) * p.face
        if (dx > -6 && dx <= reach && Math.abs(e.y - p.y) <= tol) {
            p.attackHit.add(e.id)
            hurtEnemy(gs, e, dmg, down, undefined, p.tag, p.state)
            if (p.state === 'whip') p.lash = CFG.whipFlash   // #2819: crack on the bite tick
        }
    }
    // barrels take the blows too — that is how the steel comes out
    for (const bar of gs.barrels) {
        const key = 'b' + bar.id
        if (p.attackHit.has(key)) continue
        const dx = (bar.x - p.x) * p.face
        if (dx > -6 && dx <= reach && Math.abs(bar.y - p.y) <= tol) {
            p.attackHit.add(key)
            hurtBarrel(gs, bar)
            if (p.state === 'whip') p.lash = CFG.whipFlash
        }
    }
}

function applyJumpKick(gs, p) {
    if (p.z <= 2) return
    for (const e of gs.enemies) {
        if (p.attackHit.has(e.id) || e.state === 'dying' || e.state === 'down') continue
        if (Math.abs(e.x - p.x) <= 18 && Math.abs(e.y - p.y) <= CFG.punch.depth) {
            p.attackHit.add(e.id)
            hurtEnemy(gs, e, CFG.jumpKickDmg, true, undefined, p.tag, 'jumpkick')
        }
    }
}

function applySpin(gs, p) {
    for (const e of gs.enemies) {
        if (p.attackHit.has(e.id) || e.state === 'dying' || e.state === 'down') continue
        const dx = Math.abs(e.x - p.x)
        if (dx <= CFG.spin.reach && Math.abs(e.y - p.y) <= 10) {
            p.attackHit.add(e.id)
            hurtEnemy(gs, e, CFG.spin.dmg, true, undefined, p.tag, 'spin')
        }
    }
    for (const bar of gs.barrels) {
        const key = 'b' + bar.id
        if (p.attackHit.has(key)) continue
        if (Math.abs(bar.x - p.x) <= CFG.spin.reach && Math.abs(bar.y - p.y) <= 10) {
            p.attackHit.add(key)
            hurtBarrel(gs, bar)
        }
    }
}

function applyStomp(gs, p) {
    if (p.z > 0) return
    for (const e of gs.enemies) {
        if (e.state !== 'down' || p.attackHit.has(e.id)) continue
        if (Math.abs(e.x - p.x) <= reachFor(p, 'kick') && Math.abs(e.y - p.y) <= 9) {
            p.attackHit.add(e.id)
            e.inv = 0
            hurtEnemy(gs, e, 1, false, true, p.tag, 'stomp')
            if (e.hp > 0) { e.state = 'down'; e.stateT = Math.floor(CFG.downTime / 2) }
            gs.events.push('stomp')
        }
    }
}

export function updateFighter(gs, p, pad) {
    // #2819: a bitten whip keeps its crack-flash a beat past the bite tick
    if (p.lash > 0) p.lash -= 1
    if (p.out) { if (p.state === 'dying') p.stateT += 1; return }
    if (p.state === 'dying') { p.stateT += 1; return }
    // #2874 knockdown beat: flat on the boards, off the input stream, until
    // the beat ends — then the old spawn rule remounts the seat.
    if (p.knock > 0) {
        p.knock -= 1
        if (p.knock === 0) {
            p.state = 'idle'; p.stateT = 0
            p.x = clamp(gs.camX + (p.tag === 'billy' ? 30 : 44), 8, STAGE_W - 8)
            let nudge = 0
            while (blocked(gs, p.x, p.y) && nudge++ < 60) p.x = clamp(p.x + 8, 8, STAGE_W - 8)
        }
        return
    }
    // #2857 juice beats: the relief pose and the KO flourish fade on their own
    // clocks; the glint fades with the sprint (re-stamped while closing).
    if (p.relief > 0) p.relief -= 1
    if (p.flourish > 0) p.flourish -= 1
    const px0 = p.x, py0 = p.y
    if (p.inv > 0) p.inv -= 1
    if (p.pressCooldown > 0) p.pressCooldown -= 1

    // grabbed: mash B (kick) to break free
    if (p.state === 'grabbed') {
        p.guard = 0   // #2857: a seat in grips is the rescue's problem, not a glint's
        p.stateT += 1
        if (pad.b && p.pressCooldown <= 0) { p.presses += 1; p.pressCooldown = 6; gs.events.push(blue(p.tag, 'struggle')) }
        const holder = gs.enemies.find((e) => e.state === 'grab' && e.tgt === p.tag)
        // #2851 release law: a grip is only as strong as the thug holding it.
        // When a partner's fists stagger or drop the holder, his prize comes
        // loose — the arcade freed you when the grabber took a hit. Short
        // i-frames so the next windup can't re-steal the seat mid-relief.
        // (matched by grip, not id: the harness fixtures reuse ids; the law
        // must read the same truth the eye sees — who is holding me?)
        if (!holder) {
            // #2857 grip-break juice: the impact reports where it landed (the
            // shell flashes steel-blue there) and the freed seat throws his
            // arms up — relief you can read across the yard.
            const gone = gs.enemies.find((q) => q.tgt === p.tag && q.state !== 'grab')
            gs.gripFx = { x: gone ? gone.x : p.x, y: gone ? gone.y : p.y }
            p.state = 'idle'; p.stateT = 0; p.presses = 0; p.grabFrom = null
            p.inv = Math.max(p.inv, 24)
            p.relief = CFG.reliefTicks
            gs.events.push(blue(p.tag, 'escape'))
            return
        }
        if (p.presses >= CFG.grabEscape) {
            p.state = 'idle'; p.stateT = 0; p.presses = 0; p.grabFrom = null
            if (holder) { holder.state = 'stagger'; holder.stateT = CFG.hitstun; holder.attackCooldown = 80; gs.gripFx = { x: holder.x, y: holder.y } }
            p.relief = CFG.reliefTicks
            gs.events.push(blue(p.tag, 'escape'))
        } else if (p.stateT >= CFG.grabTimeout) {
            p.state = 'idle'; p.presses = 0; p.grabFrom = null
            playerDies(gs, p)
        }
        return
    }

    // attack state machines
    if (p.state === 'punch' || p.state === 'kick' || p.state === 'whip') {
        p.stateT += 1
        const cfg = CFG[p.state]
        applySwing(gs, p)
        if (p.state !== 'whip') { applyJumpKick(gs, p); applyStomp(gs, p) }
        if (p.stateT >= cfg.startup + cfg.active + cfg.recover) { p.state = p.z > 0 ? 'jump' : 'idle'; p.stateT = 0 }
    } else if (p.state === 'throw') {
        p.stateT += 1
        if (p.stateT === CFG.throwK.startup) throwKnife(gs, p)
        if (p.stateT >= CFG.throwK.total) { p.state = 'idle'; p.stateT = 0 }
    } else if (p.state === 'spin') {
        p.stateT += 1
        applySpin(gs, p)
        if (p.stateT >= CFG.spin.total) { p.state = 'idle'; p.stateT = 0 }
    }

    // new attack inputs
    if (pad.b) fighterAttack(gs, p, 'kick')
    else if (pad.punch) fighterAttack(gs, p, 'punch')

    // jump: the A verb (Space / pad.a). ArrowUp/Down are the DEPTH axis —
    // in a belt-scroller the stick walks the street, the buttons do the tricks.
    if ((pad.a || pad.jump) && p.z === 0 && p.state !== 'punch' && p.state !== 'kick' && p.state !== 'spin' && p.state !== 'throw' && p.state !== 'whip') {
        p.z = 0.001; p.zv = CFG.jumpV
        p.state = 'jump'; p.stateT = 0
        gs.events.push(blue(p.tag, 'jump'))
    }
    if (p.z > 0 || p.zv > 0) {
        p.z += p.zv
        p.zv -= CFG.jumpG
        if (p.z <= 0) {
            p.z = 0; p.zv = 0
            if (p.state === 'jump') { p.state = 'idle'; p.stateT = 0 }
            gs.events.push(blue(p.tag, 'land'))
        }
    }

    // walking (locked out mid-swing on the ground; air keeps drift).
    // Barrels are solid to grounded bodies — walk round them, hop over them.
    let moving = false
    const canWalk = p.z > 0 || p.state === 'idle' || p.state === 'walk'
    const solid = p.z <= 8
    if (canWalk) {
        if (pad.left) { p.face = -1; if (!(solid && blocked(gs, p.x - CFG.walkSpeed, p.y))) { p.x -= CFG.walkSpeed; moving = true } }
        if (pad.right) { p.face = 1; if (!(solid && blocked(gs, p.x + CFG.walkSpeed, p.y))) { p.x += CFG.walkSpeed; moving = true } }
        if (pad.up && p.z === 0 && !(blocked(gs, p.x, p.y - CFG.deepSpeed))) { p.y -= CFG.deepSpeed; moving = true }
        if (pad.down && p.z === 0 && !(blocked(gs, p.x, p.y + CFG.deepSpeed))) { p.y += CFG.deepSpeed; moving = true }
    }
    p.x = clamp(p.x, 8, STAGE_W - 8)
    p.y = clamp(p.y, DEEP_TOP, DEEP_BOT)
    if (p.z <= 8) stuckFree(gs, p)
    if (p.z === 0) p.state = moving ? 'walk' : (p.state === 'walk' ? 'idle' : p.state)
    if (moving || p.state !== 'idle') p.anim += 1

    // #2857 guardian telegraph: a dragon sprinting the thug who holds his
    // brother wears a glint trail — help is visibly on the way before it
    // lands. Honest by construction: it stamps only when boots actually move
    // toward the holder this tick, so a seat ignoring the grip earns no
    // promise. Juice only — the trail never touches stateHash.
    if (gs.jimmy) {
        const ally = p === gs.billy ? gs.jimmy : gs.billy
        const holder = ally && !ally.out && ally.state === 'grabbed'
            ? gs.enemies.find((e) => e.state === 'grab' && e.tgt === ally.tag) : null
        const mx = p.x - px0, my = p.y - py0
        if (holder && (holder.x - px0) * mx + (holder.y - py0) * my > 0) p.guard = CFG.guardTicks
        else if (p.guard > 0) p.guard -= 1
    }

    // weapon pickups — one in hand, the original carries no armoury. First
    // dragon home takes the steel (S4: both seats may arm, never one seat two).
    for (let i = gs.pickups.length - 1; i >= 0; i--) {
        const q = gs.pickups[i]
        q.bob += 1
        if (q.clatter > 0) q.clatter -= 1
        if (q.stick > 0) { q.stick -= 1; continue }   // still standing in the asphalt
        if (Math.abs(q.x - p.x) <= 10 && Math.abs(q.y - p.y) <= 8 && !p.weapon) {
            gs.pickups.splice(i, 1)
            p.weapon = q.kind
            gs.score += 100
            gs.scoreFlash = { v: 100, t: 48 }
            gs.events.push(blue(p.tag, 'pickup'))
        }
    }
}

function attackerCount(gs) {
    return gs.enemies.filter((e) => e.state === 'attack' || e.state === 'windup').length
}

function nearestEnemy(gs, self) {
    let best = null, bd = 1e9
    for (const e of gs.enemies) {
        if (e.state === 'dying' || e.state === 'enter') continue
        const d = Math.abs(e.x - self.x) + Math.abs(e.y - self.y) * 0.6
        if (d < bd) { bd = d; best = e }
    }
    return best
}

function updateEnemy(gs, e) {
    // S4: a thug works the nearest dragon (commitment + hysteresis above),
    // not Billy by name — with two seats on the street the crowd splits.
    const b = targetOf(gs, e)
    const def = ENEMY_DEF[e.kind]
    // Solidity is center-line: a body-radius INFLATES the footprint until the
    // pocket between barrel and street-edge has no open step — bodies re-pin
    // (seeds 7/8/10/19/21/23 all froze this way). Center-line + k-slip keeps
    // the street flowing; a few px of sprite overlap at the rim is the honest
    // arcade abstraction.
    const rad = e.kind === 'abobo' ? 8 : e.kind === 'amon' || e.kind === 'duel' ? 5 : 4
    if (e.inv > 0) e.inv -= 1
    e.anim += 1
    if (e.wob > 0) e.wob -= 1   // #2857: the stagger wobble settles as he recovers
    if (e.flash > 0) e.flash -= 1 // #2874: the hit-light fades fast — a flash, not a glow

    // #2825 item 4: the duel intro — the lieutenant holds his pose at the
    // frame edge while the banner says his name. He marches IN (the arcade
    // entrance), but nothing else until the announce is done.
    if (e.kind === 'duel' && gs.duelIntro > 0 && e.state !== 'enter' && e.state !== 'dying') {
        e.face = Math.sign(b.x - e.x) || e.face
        return
    }

    switch (e.state) {
    case 'enter': {
        // walk onto the street from the spawn side (#2810 item 5: the walk-in
        // runs deep into the frame — 70 px of visible march, not a edge-fade)
        const tx = e.x < b.x ? gs.camX + 26 : gs.camX + W - 26
        const dx = Math.sign(tx - e.x)
        const sp = def.speed + 0.5
        if (dx > 0 && !blocked(gs, e.x + sp, e.y, rad)) { e.x += sp; e.dodge = 0 }
        else if (dx < 0 && !blocked(gs, e.x - sp, e.y, rad)) { e.x -= sp; e.dodge = 0 }
        else {
            // slip AWAY from the blocking barrel lane, and keep the direction
            // while the road stays shut. Three traps, all pinned by seeds 1..24:
            // re-deriving dir from the current y ping-pongs on the mid-line; a
            // clamp at the depth edge returns ny === e.y (a vacuous dodge - the
            // Abobo freeze at barrel 3 near lip); and at rad 8 the barrel band
            // can cover the whole pocket, so the only open lane may be the
            // barrels own side - hence try both directions, keep the first one
            // that actually moves.
            const bar = gs.barrels.reduce((a, q) => (Math.abs(q.x - e.x) < Math.abs(a.x - e.x) ? q : a), gs.barrels[0])
            let dir = e.dodge || (e.y >= bar.y ? CFG.deepSpeed : -CFG.deepSpeed)
            let ny = clamp(e.y + dir, DEEP_TOP, DEEP_BOT)
            if (ny === e.y || blocked(gs, e.x, ny, rad)) {
                const f = -dir
                const fy = clamp(e.y + f, DEEP_TOP, DEEP_BOT)
                if (fy !== ny && !blocked(gs, e.x, fy, rad)) { dir = f; ny = fy }
            }
            e.dodge = ny !== e.y ? dir : 0
            if (ny !== e.y && !blocked(gs, e.x, ny, rad)) e.y = ny
            // still pinned (deep body in a shallow pocket: floor + barrel):
            // k-slip depth to the nearest lane that truly opens
            if (e.dodge === 0) {
                for (let k = 2; k <= 32; k++) {
                    const dn = clamp(e.y + k, DEEP_TOP, DEEP_BOT), up = clamp(e.y - k, DEEP_TOP, DEEP_BOT)
                    if (dn !== e.y && !blocked(gs, e.x, dn, rad)) { e.y = dn; e.dodge = CFG.deepSpeed; break }
                    if (up !== e.y && !blocked(gs, e.x, up, rad)) { e.y = up; e.dodge = -CFG.deepSpeed; break }
                }
            }
        }
        e.face = Math.sign(b.x - e.x) || 1
        if ((dx > 0 && e.x >= gs.camX + 26 && !blocked(gs, e.x, e.y, rad)) || (dx < 0 && e.x <= gs.camX + W - 26 && !blocked(gs, e.x, e.y, rad))) { e.state = 'walk'; e.stateT = 0 }
        break
    }
    case 'walk': {
        if (b.state === 'dying' || gs.mode === 'gameover') break
        e.face = Math.sign(b.x - e.x) || 1
        const dx = b.x - e.x
        const dy = b.y - e.y
        const adx = Math.abs(dx)
        if (e.attackCooldown > 0) e.attackCooldown -= 1
        if (e.castCooldown > 0) e.castCooldown -= 1

        // Abobo's shoulder charge (#2810 item 3): from mid-distance the giant
        // telegraphs two beats of run-up, then body-checks the lane. Telegraph
        // first, depth still decides (a lane over, it whooses past).
        if (e.kind === 'abobo' && adx >= 40 && adx <= 150 && Math.abs(dy) <= 14
            && e.attackCooldown <= 0 && attackerCount(gs) < attackerCap(gs)) {
            e.state = 'chargewind'; e.stateT = 0
            gs.events.push('chargewind')
            break
        }

        // S3: the casters. Steel stays steel at range — an armed goon holds its
        // ground mid-field and aims a throw down the lane (16 ticks of readable
        // windup; the depth axis is the dodge). Close men fight with fists.
        if (e.hasKnife && b.z === 0 && b.inv <= 0 && b.state !== 'dying'
            && adx >= 34 && adx <= 130 && Math.abs(dy) <= 12
            && e.castCooldown <= 0 && attackerCount(gs) < attackerCap(gs)) {
            e.state = 'aim'; e.stateT = 0
            gs.events.push('aim')
            break
        }

        // #2825 item 3: throwers keep thrower's distance. An armed Williams at
        // punching range back-pedals to a fresh angle instead of idling into
        // the fist fight (the arcade's casters dance). A spinner with its
        // reload still up closes to brawl; cornered ones always swing — the
        // retreat only holds while the yard leaves them room.
        if (e.hasKnife && (e.kind === 'duel' || e.castCooldown <= 0)
            && adx < CFG.goonKnife.keep && !(e.kind === 'amon' || e.kind === 'abobo')) {
            const retreat = -Math.sign(dx || 1)
            const nx = e.x + retreat * def.speed * 0.9
            if (nx >= gs.camX + 16 && nx <= gs.camX + W - 16 && !blocked(gs, nx, e.y, rad)) {
                const px = e.x, py = e.y
                const strafe = Math.abs(dy) > 3
                    ? clamp(dy, -def.speed * 0.5, def.speed * 0.5)
                    : (gs.tick % 60 < 30 ? CFG.deepSpeed : -CFG.deepSpeed)
                moveEntity(gs, e, retreat * def.speed * 0.9, strafe, rad)
                if ((e.x === px) || (strafe !== 0 && e.y === py)) depthSlip(gs, e, rad)
                break
            }
        }

        // grab attempt (grounded, uninvited Billy)
        const grabOk = (e.kind === 'amon' || e.kind === 'abobo')
        if (grabOk && b.z === 0 && b.inv <= 0 && b.state !== 'grabbed'
            && b.state !== 'dying' && adx <= CFG.grabRange && Math.abs(dy) <= 5 && e.attackCooldown <= 0
            && attackerCount(gs) < attackerCap(gs)) {
            e.state = 'grab'; e.stateT = 0
            b.state = 'grabbed'; b.stateT = 0; b.presses = 0; b.grabFrom = e.id
            gs.events.push('grabbed')
            break
        }

        // attack decision
        const inRange = adx <= def.reach && Math.abs(dy) <= 6 && b.state !== 'dying'
        if (inRange && e.attackCooldown <= 0 && attackerCount(gs) < attackerCap(gs)) {
            e.state = 'windup'; e.stateT = 0
            break
        }
        // approach: close x and match depth; back-row thugs hang slightly off
        const slot = gs.enemies.filter((o) => o !== e && o.state !== 'dying' && Math.sign(o.x - b.x) === Math.sign(e.x - b.x) && Math.abs(o.x - b.x) < 26).length
        const wantX = b.x - Math.sign(dx || 1) * (def.reach - 4 + slot * 14)
        const stepX = Math.abs(wantX - e.x) > 3 ? clamp(wantX - e.x, -def.speed, def.speed) : 0
        const stepY = Math.abs(dy) > 2 ? clamp(dy, -def.speed * 0.8, def.speed * 0.8) : 0
        const px = e.x, py = e.y
        moveEntity(gs, e, stepX, stepY, rad)
        if ((stepX !== 0 && e.x === px) || (stepY !== 0 && e.y === py)) depthSlip(gs, e, rad)
        else if (stepX !== 0) e.dodge = 0
        break
    }
    case 'windup': {
        e.stateT += 1
        e.face = Math.sign(b.x - e.x) || e.face
        if (e.stateT >= 12) { e.state = 'attack'; e.stateT = 0 }
        break
    }
    case 'chargewind': {
        // two running frames + a dip — the read before the body-check lands
        e.stateT += 1
        e.face = Math.sign(b.x - e.x) || e.face
        if (Math.abs(b.y - e.y) > 2) e.y += clamp(b.y - e.y, -def.speed * 0.6, def.speed * 0.6)
        e.y = clamp(e.y, DEEP_TOP, DEEP_BOT)
        stuckFree(gs, e, rad)
        if (e.stateT >= 16) { e.state = 'charge'; e.stateT = 0; gs.events.push('charge') }
        break
    }
    case 'charge': {
        e.stateT += 1
        const dash = e.face * 2.8
        if (blocked(gs, e.x + dash, e.y, rad)) {
            // the shoulder meets wood — Abobo splinters it (#2807 props law)
            const bar = gs.barrels.find((q) => Math.abs(q.x - (e.x + dash)) <= 10 + rad && Math.abs(q.y - e.y) <= 11 + rad)
            if (bar) hurtBarrel(gs, bar)
        } else e.x += dash
        if (e.stateT > 2) {
            const hit = b.z <= 6 && Math.abs(e.x - b.x) <= 16 && Math.abs(e.y - b.y) <= 8 && b.state !== 'grabbed'
            if (hit && b.inv <= 0 && b.state !== 'dying' && gs.mode === 'play') {
                playerDies(gs, b)
                e.state = 'back'; e.stateT = 0; e.attackCooldown = 90
                break
            }
        }
        const off = e.x < gs.camX - 10 || e.x > gs.camX + W + 10
        if (e.stateT >= 60 || off) { e.state = 'back'; e.stateT = 0; e.attackCooldown = 70 + Math.floor(rng(gs) * 40) }
        break
    }
    case 'aim': {
        // the read before the cast: feet planted, blade cocked, depth drifts
        // onto Billy's lane so a lazy lane-share still gets punished
        e.stateT += 1
        e.face = Math.sign(b.x - e.x) || e.face
        if (Math.abs(b.y - e.y) > 3) {
            const stepY = clamp(b.y - e.y, -def.speed * 0.5, def.speed * 0.5)
            if (!blocked(gs, e.x, e.y + stepY, rad)) e.y += stepY
        }
        e.y = clamp(e.y, DEEP_TOP, DEEP_BOT)
        if (e.stateT >= CFG.goonKnife.windup) { e.state = 'cast'; e.stateT = 0 }
        break
    }
    case 'cast': {
        e.stateT += 1
        if (e.stateT === 3) {
            goonCast(gs, e)
            // Williams spends the knife he threw; the lieutenant carries a belt
            // full (the arcade duel never runs dry) — cooldown is his reload
            if (e.kind !== 'duel') e.hasKnife = false
            e.castCooldown = e.kind === 'duel' ? 80 + Math.floor(rng(gs) * 50) : 70 + Math.floor(rng(gs) * 50)
        }
        if (e.stateT >= 14) { e.state = 'back'; e.stateT = 0; e.attackCooldown = 40 }
        break
    }
    case 'attack': {
        e.stateT += 1
        if (e.stateT === 3) {
            const hit = b.z <= 8 && Math.abs(e.x - b.x) <= def.reach + 4 && Math.abs(e.y - b.y) <= 8 && b.state !== 'grabbed'
            if (hit && b.inv <= 0 && b.state !== 'dying' && gs.mode === 'play') {
                playerDies(gs, b)
            }
        }
        if (e.stateT >= 14) { e.state = 'back'; e.stateT = 0; e.attackCooldown = 50 + Math.floor(rng(gs) * 50) }
        break
    }
    case 'back': {
        e.stateT += 1
        moveEntity(gs, e, -e.face * def.speed * 0.7, 0, rad)
        if (e.stateT >= 24) { e.state = 'walk'; e.stateT = 0 }
        break
    }
    case 'grab': {
        // holding Billy; the escape/timeout is resolved in updateBilly
        e.face = Math.sign(b.x - e.x) || e.face
        const drag = clamp(b.x - e.face * 10 - e.x, -1, 1)
        if (!blocked(gs, e.x + drag, e.y, rad)) e.x += drag
        break
    }
    case 'stagger': {
        e.stateT -= 1
        moveEntity(gs, e, -e.face * 0.4, 0, rad)
        if (e.stateT <= 0) { e.state = 'walk'; e.stateT = 0 }
        break
    }
    case 'down': {
        e.stateT += 1
        if (e.stateT >= CFG.downTime) { e.state = 'getup'; e.stateT = 0; e.inv = CFG.getupTime }
        break
    }
    case 'getup': {
        e.stateT += 1
        if (e.stateT >= CFG.getupTime) { e.state = 'walk'; e.stateT = 0; e.attackCooldown = 20 }
        break
    }
    case 'dying': {
        e.stateT += 1
        break
    }
    }
    e.y = clamp(e.y, DEEP_TOP, DEEP_BOT)
    if (e.state !== 'dying' && e.state !== 'down' && e.state !== 'getup') stuckFree(gs, e, rad)
}

// ------------------------------------------------------------ S3 the yard ---
// The hideout (issue #2807 stage 3): a fresh industrial field, crates where
// the barrels were, Marian tied at the far end. Winning the duel unlocks the
// rescue; freeing her loops the whole run with `cleared` earned.
function clearField(gs) {
    gs.waveIdx = 0
    gs.waveActive = false
    gs.camLock = false
    gs.enemies = []
    gs.pickups = []
    gs.projectiles = []
    gs.camX = 0
    // S4 second wind: when the road opens a fresh stage, a drained seat
    // returns with one life — the dragons enter the next street together.
    // #2833: the return stamps `backAt` so the cabinet can blink the seat
    // home — a revived bank should read at a glance, not whisper.
    for (const p of fighters(gs)) {
        if (p.out) p.backAt = gs.tick
        p.out = false
        p.lives = Math.max(p.lives, 1)
        p.state = 'idle'; p.stateT = 0; p.z = 0; p.zv = 0
        p.knock = 0 // #2874: the second wind walks on immediately — no stale beat
        p.inv = CFG.respawnIFrames
        p.grabFrom = null
        p.x = p.tag === 'billy' ? 40 : 24
    }
}

export function enterStage2(gs) {
    gs.stage = 2
    clearField(gs)
    gs.chain = 0; gs.chainT = 0   // #2882: the road carries the score, not the chain
    gs.barrels = makeBarrels(2)
    gs.marian = { x: 912, y: 170, freed: false, cuts: 0, cutT: 0, cheer: 0 }
    gs.bannerKind = 'stage2'
    gs.banner = 90   // the yard announces itself for a beat and a half
    gs.mode = 'play'
    gs.events.push('stage')
}

function loopRun(gs) {
    gs.mode = 'play'
    gs.cleared = true
    gs.stage = 1
    gs.marian = null
    gs.rescueT = 0
    gs.chain = 0; gs.chainT = 0   // #2882: the run carries the score, not the chain
    clearField(gs)
    gs.barrels = makeBarrels(1)
    gs.bannerKind = null
}

export function rescueReady(gs) {
    return gs.stage === 2 && gs.mode === 'play' && !!gs.marian && !gs.marian.freed &&
        gs.waveIdx >= WAVES_S2.length && gs.enemies.length === 0
}

export function step(gs, pad = {}, pad2 = {}) {
    gs.tick += 1
    if (gs.mode === 'play' && gs.banner > 0) gs.banner -= 1
    if (gs.duelIntro > 0) gs.duelIntro -= 1
    if (gs.scoreFlash && --gs.scoreFlash.t <= 0) gs.scoreFlash = null
    if (gs.livesFx && --gs.livesFx.t <= 0) gs.livesFx = null // #2874
    if (gs.tipT > 0 && !gs.intro && gs.mode === 'play') gs.tipT -= 1 // #2874
    if (gs.chainT > 0 && --gs.chainT <= 0) gs.chain = 0   // #2882: the window lapses, the chain cools

    // #2891: the movie owns the street — waves, physics and the collision laws
    // stay behind this gate until the curtain lifts (or a hand skips it).
    if (gs.intro) return stepIntro(gs, pad, pad2)

    if (gs.mode === 'clear') {
        gs.banner -= 1
        if (gs.banner <= 0) {
            if (gs.stage === 1) enterStage2(gs)          // the road runs on: the hideout
            else loopRun(gs)                             // Marian freed — Walnuts again, score carried
        }
        return gs
    }
    if (gs.mode === 'gameover') {
        updateFighter(gs, gs.billy, {})
        if (gs.jimmy) updateFighter(gs, gs.jimmy, {})
        gs.enemies.forEach((e) => updateEnemy(gs, e))
        return gs
    }

    updateFighter(gs, gs.billy, pad)
    // S4: the blue seat runs on its own honest-percept brain until a human
    // takes it drop-in (Contra S4 law) — the shell passes pad2 only then.
    const jpad = gs.jimmy ? (gs.jimmy.human ? pad2 : jimmyBrain(gs)) : null
    if (gs.jimmy) updateFighter(gs, gs.jimmy, jpad)

    // camera: the front dragon leads, then lock while a wave lives
    const active = activeFighters(gs)
    const leadX = active.reduce((m, p) => Math.max(m, p.x), gs.billy.x)
    if (!gs.camLock) {
        const target = clamp(leadX - Math.floor(W * 0.45), 0, STAGE_W - W)
        gs.camX += clamp(target - gs.camX, -3, 3)
    }
    for (const p of active) p.x = clamp(p.x, gs.camX + 8, gs.camX + W - 8)

    // wave triggers (the front dragon opens the next fight)
    if (!gs.waveActive && gs.waveIdx < wavesFor(gs).length && leadX >= wavesFor(gs)[gs.waveIdx].triggerX) {
        const w = wavesFor(gs)[gs.waveIdx]
        gs.waveActive = true
        gs.camLock = true
        w.spawns.forEach((s) => {
            const e = spawnEnemy(gs, s.kind, s.side, s.stick)
            if (s.knife) e.hasKnife = true
            // #2825 item 4: the boss wave announces itself — WILLIAMS rides the
            // banner while he holds his pose at the frame edge, then the duel.
            if (s.kind === 'duel') { gs.duelIntro = 90; gs.events.push('duel') }
        })
        gs.events.push('wave')
    }

    gs.enemies.forEach((e) => updateEnemy(gs, e))
    gs.enemies = gs.enemies.filter((e) => !(e.state === 'dying' && e.stateT > 30))

    // thrown blades: flat flight down the lane; steel is reusable — a knife
    // that hits (or leaves the frame) lands as a pickup again.
    // S3: blades now have a side. Billy's cut the enemy line; a Williams'
    // cast cuts Billy's — lethal ON the lane, harmless off it (depth law),
    // stopped by wood, and landing as pickable steel either way.
    for (let i = gs.projectiles.length - 1; i >= 0; i--) {
        const pr = gs.projectiles[i]
        pr.x += pr.vx
        pr.spin += 1
        let done = false
        if (pr.side === 'goon') {
            for (const bar of gs.barrels) {
                if (Math.abs(pr.x - bar.x) <= 10 && Math.abs(pr.y - bar.y) <= 11) {
                    hurtBarrel(gs, bar)
                    gs.events.push('blade_wood')
                    done = true
                    break
                }
            }
            if (!done && gs.mode === 'play') {
                for (const p of activeFighters(gs)) {
                    if (p.inv <= 0 && p.z <= 6 && Math.abs(pr.x - p.x) <= 10 && Math.abs(pr.y - p.y) <= 7) {
                        playerDies(gs, p)
                        gs.events.push('blade_hit')
                        done = true
                        break
                    }
                }
            }
            if (!done && (pr.x < gs.camX - 24 || pr.x > gs.camX + W + 24)) done = true
        } else {
            for (const e of gs.enemies) {
                if (e.state === 'dying' || e.state === 'down' || e.inv > 0) continue
                if (Math.abs(pr.x - e.x) <= 10 && Math.abs(pr.y - e.y) <= 7) {
                    hurtEnemy(gs, e, CFG.knifeDmg, true, undefined, pr.side)
                    gs.events.push(blue(pr.side, 'knife_hit'))
                    done = true
                    break
                }
            }
            if (!done && (pr.x < 8 || pr.x > STAGE_W - 8)) done = true
        }
        if (done) {
            gs.projectiles.splice(i, 1)
            // #2819 item 1: the cabinet sticks the blade in the dirt — it
            // quivers there for a beat before it becomes grabbable steel.
            gs.pickups.push({ x: clamp(pr.x, 8, STAGE_W - 8), y: pr.y, kind: 'knife', bob: 0, stick: CFG.knifeStick })
            gs.events.push('blade_stick')
        }
    }
    gs.barrels.forEach((bar) => { if (bar.shake > 0) bar.shake -= 1 })

    // wave cleared?
    if (gs.waveActive && gs.enemies.length === 0 && gs.mode === 'play') {
        gs.waveActive = false
        gs.camLock = false
        gs.waveIdx += 1
        if (gs.waveIdx >= wavesFor(gs).length) {
            if (gs.stage === 1) {
                gs.mode = 'clear'
                gs.banner = CFG.clearHold
                gs.bannerKind = 'stage1'
                gs.score += 500
                gs.hi = Math.max(gs.hi, gs.score)
                gs.events.push('clear')
            }
            // stage 2: the duel is won — the ropes are next (see rescue below)
        }
    }

    // S3 the hideout — Marian. Ropes hold until the duel is answered; two
    // punches cut them. Then the cheer, and the yard sets the whole run free.
    // S4: either dragon's fists count — the rescue is a two-man job now.
    if (gs.marian) {
        const m = gs.marian
        if (m.cutT > 0) m.cutT -= 1
        if (!m.freed && rescueReady(gs)) {
            const punchers = [{ p: gs.billy, v: pad.punch }]
            if (gs.jimmy) punchers.push({ p: gs.jimmy, v: jpad && jpad.punch })
            const hit = punchers.find((c) => !c.p.out && c.p.state !== 'grabbed' && c.v &&
                Math.abs(c.p.x - m.x) <= CFG.rescueRange && Math.abs(c.p.y - m.y) <= 8)
            if (hit && m.cutT <= 0) {
                m.cuts += 1
                m.cutT = 10
                gs.events.push('rope')
                if (m.cuts >= CFG.rescueCuts) {
                    m.freed = true
                    gs.rescueT = CFG.rescueCheer
                    gs.score += CFG.rescueBonus
                    gs.hi = Math.max(gs.hi, gs.score)
                    gs.scoreFlash = { v: CFG.rescueBonus, t: 48 }
                    gs.events.push('rescue')
                }
            }
        }
        if (m.freed) {
            m.cheer += 1
            if (gs.rescueT > 0 && --gs.rescueT <= 0) {
                gs.mode = 'clear'
                gs.banner = CFG.clearHold
                gs.bannerKind = 'rescue'
                gs.events.push('clear')
            }
        }
    }
    return gs
}

// The honest-percept brain: reads the same truth the screen shows, for
// WHICHEVER dragon it drives. Powers the attract demo and the harness
// WINNABLE proof (Billy's seat), and Jimmy's CPU seat in co-op (#2807 S4) —
// both seats play by the same percept law, no cheat sheet.
export function dragonBrain(gs, b, ally = null) {
    const pad = { left: false, right: false, up: false, down: false, a: false, b: false, punch: false }
    const mate = ally && !ally.out && ally.state !== 'dying' && ally.state !== 'grabbed' ? ally : null
    if (gs.mode !== 'play' || b.state === 'grabbed') {
        if (b.state === 'grabbed' && gs.tick % 4 === 0) pad.b = true // mash free
        return pad
    }
    // S3: the duel is won and the ropes are waiting — walk to Marian and cut
    if (gs.stage === 2 && rescueReady(gs)) {
        const m = gs.marian
        // #2833: the ropes are no excuse to walk into steel. The duel's last
        // blades can still be in the air when the field empties (rescueReady
        // means no live goons — a cast knife outruns its thrower), so the
        // cutter answers flying steel before it walks to the post. A cocked
        // blade on the doorstep never gates here: rescueReady already proves
        // every goon is down — guard-holding lives in the waves, where the
        // hang-back law keeps the blue seat circling in beside its brother.
        const fly = gs.projectiles.some((pr) => pr.side === 'goon' && Math.abs(pr.y - b.y) <= 9 &&
            ((pr.vx > 0 && pr.x < b.x + 8 && pr.x > b.x - 64) || (pr.vx < 0 && pr.x > b.x - 8 && pr.x < b.x + 64)))
        if (!fly) {
            const dxm = m.x - b.x; const dym = m.y - b.y
            if (Math.abs(dxm) > 14 || Math.abs(dym) > 3) {
                pad.right = dxm > 0; pad.left = dxm < 0
                if (Math.abs(dym) > 3) { pad.up = dym < 0; pad.down = dym > 0 }
                return laneChange(gs, b, pad)
            }
            if (gs.tick % 12 < 2) pad.punch = true
            return pad
        }
    }
    // S3: steel in the air is the first thing a fair player answers — slip off
    // the blade's lane before it arrives (the depth law, thrown edition)
    const blade = gs.projectiles.find((pr) => pr.side === 'goon' &&
        ((pr.vx > 0 && pr.x < b.x + 8) || (pr.vx < 0 && pr.x > b.x - 8)) &&
        Math.abs(pr.y - b.y) <= 9 && Math.abs(pr.x - b.x) < 64)
    if (blade && b.z === 0) {
        let dir = blade.y < b.y ? 1 : blade.y > b.y ? -1 : (b.y > (DEEP_TOP + DEEP_BOT) / 2 ? -1 : 1)
        if (b.y + dir * 14 < DEEP_TOP || b.y + dir * 14 > DEEP_BOT) dir = -dir
        pad[dir > 0 ? 'down' : 'up'] = true
        return pad
    }
    // #2851 guardian law: a brother in a thug's grip outranks my own nearest
    // target — the ally seat sprints the holder and works him off (the arcade
    // freed you when the grabber took a hit; the seat's job is landing that
    // hit). Billy's solo autopilot passes no ally, so the attract demo and
    // the harness WINNABLE stream keep the old law and their hashes.
    let target = nearestEnemy(gs, b)
    if (ally && ally.state === 'grabbed') {
        const holder = gs.enemies.find((e) => e.state === 'grab' && e.tgt === ally.tag)
        if (holder) target = holder
    }
    if (!target) {
        pad.right = true
        // #2833: on the quiet street the blue dragon falls in beside his
        // brother — match his depth, keep a shoulder's width behind him.
        if (mate) {
            const gy = mate.y - b.y
            if (Math.abs(gy) > 3) { pad.up = gy < 0; pad.down = gy > 0 }
            if (mate.x - b.x < 16) pad.right = false
        }
        return laneChange(gs, b, pad)
    }
    const dx = target.x - b.x
    const dy = target.y - b.y
    const adx = Math.abs(dx)
    // bail out of a windup about to land near us — Abobo's charge telegraph
    // reads from further off, so the sidestep window is wider (#2810 item 3);
    // an armed Williams' aim reads at cast range.
    const threat = gs.enemies.find((e) => (
        ((e.state === 'windup' || e.state === 'attack') && Math.abs(e.x - b.x) < 30 && Math.abs(e.y - b.y) <= 7)
        || ((e.state === 'chargewind' || e.state === 'charge') && Math.abs(e.x - b.x) < 60 && Math.abs(e.y - b.y) <= 14)
        || (e.state === 'aim' && Math.abs(e.x - b.x) < 140 && Math.abs(e.y - b.y) <= 12)))
    if (threat && b.z === 0) {
        if (threat.state === 'chargewind' || threat.state === 'charge') {
            // a shouldering giant outruns boots — slip off the lane, don't flee down it
            let dir = b.y > threat.y ? 1 : b.y < threat.y ? -1 : 1
            const ny = b.y + dir * 16
            if (ny < DEEP_TOP || ny > DEEP_BOT) dir = -dir
            pad[dir < 0 ? 'up' : 'down'] = true
            return pad
        }
        if (threat.state === 'aim') {
            // the cast is aimed at THIS lane — leave before the blade answers
            let dir = b.y > threat.y ? 1 : b.y < threat.y ? -1 : (b.y > (DEEP_TOP + DEEP_BOT) / 2 ? -1 : 1)
            if (b.y + dir * 14 < DEEP_TOP || b.y + dir * 14 > DEEP_BOT) dir = -dir
            pad[dir > 0 ? 'down' : 'up'] = true
            return pad
        }
        if (gs.tick % 3 === 0) pad.up = gs.tick % 6 === 0
        pad.left = threat.x > b.x
        pad.right = threat.x < b.x
        return laneChange(gs, b, pad)
    }
    if (Math.abs(dy) > 3) { pad.up = dy < 0; pad.down = dy > 0 }
    // #2833: half a beat behind the first dragon — when the seatmate is
    // already locked onto MY closest goon and I'm still outside the scrap,
    // circle in beside him instead of piling in early.
    const mateFighting = mate && target.state !== 'dying' && target.state !== 'down' &&
        Math.abs(target.x - mate.x) <= 30 && Math.abs(target.y - mate.y) <= 12
    if (mateFighting && adx > 20) {
        const gy = mate.y - b.y
        if (Math.abs(gy) > 4) { pad.up = gy < 0; pad.down = gy > 0 }
        const sx = mate.x - 30
        pad.right = b.x < sx - 2; pad.left = b.x > sx + 8
        return laneChange(gs, b, pad)
    }
    // close BOTH axes: a target 20px deep across a crate is not in kick range —
    // mashing depth into wood is the stall the co-op seeds found. Walk to the
    // target's side of the prop, then the lane opens underneath you.
    if (adx > 16 || Math.abs(dy) > 10) { pad.right = dx > 0; pad.left = dx < 0 }
    else {
        // #2833: the blue seat goes for the showy spin a notch sooner than the
        // player's own brain would, and snaps it out faster — flamboyant, but
        // the heel still only boots when two are genuinely within reach.
        const surroundPad = ally ? 14 : 6
        const surrounded = gs.enemies.filter((e) => e.state !== 'dying' && e.state !== 'down' && Math.abs(e.x - b.x) <= CFG.spin.reach + surroundPad && Math.abs(e.y - b.y) <= 10).length >= 2
        if (!surrounded && ally) {
            // #2851 technician's cadence: the arcade duo split by school —
            // Billy=power (the 9-beat hammer-kick), Jimmy=technique. The blue
            // seat jabs-jabs-crosses on a 13-beat; 13 ⊥ 9, so the dragons
            // interleave instead of swinging the same bar in lockstep.
            const ph = gs.tick % 13
            if (ph < 2 || (ph >= 3 && ph < 5)) pad.punch = true
            else if (ph >= 6 && ph < 8) pad.b = true
        }
        else if (!surrounded && gs.tick % 9 < 2) pad.b = true // kick (kicks knock down)
        else if (surrounded && gs.tick % (ally ? 5 : 7) < 2) pad.b = true // spin back-heel
    }
    return laneChange(gs, b, pad)
}

// The two seats' default drivers: Billy's autopilot (attract demo + harness
// WINNABLE proof) and Jimmy's CPU seat (S4) — the same brain, different dragon.
export const autopilot = (gs) => dragonBrain(gs, gs.billy)
// #2833: the same brain, wearing an ally's manners — half a beat behind, a
// showier spin, a habit of drifting toward his brother (see dragonBrain ally).
export const jimmyBrain = (gs) => dragonBrain(gs, gs.jimmy || gs.billy, gs.jimmy ? gs.billy : null)

// The weapons wall final pass (#2807): if the direction being pressed runs
// into a barrel on our own lane, change lanes instead — solid props are
// part of the road.
function laneChange(gs, b, pad) {
    const pressX = pad.right ? 1 : pad.left ? -1 : 0
    if (!pressX || b.z !== 0 || pad.b) return pad
    const bar = gs.barrels.find((q) => Math.abs(q.y - b.y) <= 12 && (q.x - b.x) * pressX > 0 && Math.abs(q.x - b.x) < 24)
    if (!bar) return pad
    pad.right = pad.left = false
    let dir = b.y > bar.y ? 1 : b.y < bar.y ? -1 : (bar.y > (DEEP_TOP + DEEP_BOT) / 2 ? -1 : 1)
    if (b.y + dir * 14 < DEEP_TOP || b.y + dir * 14 > DEEP_BOT) dir = -dir
    if (dir < 0) pad.down = false
    else pad.up = false
    pad[dir < 0 ? 'up' : 'down'] = true
    return pad
}

export function rng(gs) {
    gs.rngState = (gs.rngState + 0x6D2B79F5) | 0
    let t = Math.imul(gs.rngState ^ (gs.rngState >>> 15), 1 | gs.rngState)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function stateHash(gs) {
    let h = 2166136261
    const mix = (v) => { h ^= Math.round(v * 1000) & 0xffffffff; h = Math.imul(h, 16777619) }
    mix(gs.tick)
    mix(gs.score)
    mix(gs.chain); mix(gs.chainT)   // #2882: the chain is sim truth
    mix(gs.mode === 'play' ? 1 : gs.mode === 'clear' ? 2 : 3)
    mix(gs.camX)
    mix(gs.waveIdx)
    mix(gs.stage)
    mix(gs.marian ? (gs.marian.freed ? 2 : 1) : 0)
    mix(gs.coop ? 1 : 0)
    const mixFighter = (p) => {
        mix(p.x); mix(p.y); mix(p.z); mix(p.lives)
        mix(p.state.length); mix(p.face); mix(p.weapon ? 1 : 0); mix(p.out ? 1 : 0)
    }
    mixFighter(gs.billy)
    mix(gs.jimmy ? 1 : 0)
    if (gs.jimmy) mixFighter(gs.jimmy)
    mix(gs.enemies.length)
    for (const e of gs.enemies) {
        mix(e.id); mix(e.x); mix(e.y); mix(e.hp); mix(e.state.length); mix(e.inv)
    }
    return h >>> 0
}
