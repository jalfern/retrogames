// sim.js — R-TYPE S4 "the second pilot" — the pure side-scroll engine.
// DOM-free: Node (rtypecheck) and the browser shell share THIS truth.
// Determinism law: every sim random derives from the seed (mulberry32
// riding IN gs); Math.random() may only feed juice in the shell.
//
// The spec (issue #2808, the original: Irem M-72 arcade 1987):
//  - side-scroll, right-only camera; the left edge grinds you flat
//  - one hit kills; three lives; respawn mercy-flicker; death reverts the arm
//  - armament: VULCAN stream + LASER (hold-charge lance, pierces) + WAVE
//    CANNON (hold-charge crescent, pierces a lane); capsules cycle
//    VULCAN -> LASER -> WAVE -> VULCAN
//  - THE FORCE (S2): a blue force capsule seeds the S.E.E.D. pod — attach it
//    to the nose and it plugs enemy fire and crushes soft Bydo on contact;
//    B deploys it to the screen edge (still plugging), B again recalls it;
//    armour shrugs it off and the left wall grinds a parked pod
//  - BITS (S3): a green Bit Capsule chains a drone to the hull (newest at
//    the nose, the older shoved to tail/flanks); four bits swing into a
//    rotating SHIELD that wipes rounds, hunters and soft bodies — armour
//    still refuses it. A chained hull draws extra streams from every bit
//  - the dread doubles (S3): break Phase-1 and the convoy presses on —
//    LEG 2 ends at the PHASE-2 fortress, twin cores stacked, each venting on
//    its own clock; a lost core enrages the survivor; BOTH hearts stop before
//    STAGE CLEAR
//  - Bydo dread: sine larvae divers, armour hull-segments with leading
//    turrets, a missile pod loosing slow turning hunters, and the PHASE-1
//    bio-ship: camera locks, the maw-core only takes damage while it gapes
//  - clear both dreads: STAGE CLEAR, score carries, the stage loops
//  - THE WING (S4): a second R-7 flies by default — CPU pilot out of the box,
//    a human seat via WASD+F+G (V drops out). Independent lives, arm, pod and
//    bits: one hit kills one hull, the partner keeps flying, GAME OVER only
//    when BOTH pools burn. Capsules go to seat one on a tie; Bydo guns take
//    the nearer hull, so the wing reads as bait when it crowds you.
//    gs.wing === null by default — every S1–S3 stream stays byte-identical.

export const W = 320
export const H = 224
export const FIELD_TOP = 26
export const FIELD_BOT = 214
export const SCROLL = 0.45
export const STAGE_END = 900 // camX where the Phase-1 hull locks the screen
export const STAGE_END2 = 520 // camX where the Phase-2 fortress locks (LEG 2)
export const CORE_Y = [92, 148]  // the twin cores' lanes on the Phase-2 face

export const CFG = {
    shipSpeed: 2.1,
    vulcanCd: 6,
    vulcanSpeed: 4.6,
    waveMin: 10,       // ticks of hold before a release looses anything
    waveMax: 70,
    waveSpeed: 2.7,
    waveTiers: [9, 14, 20],   // half-heights at charge <25 / <50 / max
    lives: 3,
    respawnIFrames: 110,
    dying: 70,         // ticks of wreck before respawn / game over
    clearHold: 150,    // STAGE CLEAR banner ticks, then the loop re-runs
    oneUpEvery: 20000,
    crushX: 4,         // this close to the left edge and the world kills you
    missileWarn: 30,   // pre-launch chirp ticks (the shell sounds it)
}

// the S.E.E.D. force pod (S2) + the laser arm. The pod is the issue's "bite":
// it plugs fire and rams soft Bydo, but armour pushes back and the left wall
// grinds it like everything else.
export const POD = {
    noseX: 14,          // attached: pod centre rides this far off the nose
    launch: 3.6,        // deploy speed forward
    recall: 3.2,        // retrieve speed back to the nose
    rad: 6,             // shell radius for plugging/ramming reads
    dock: 13,           // this close and the pod snaps home
    dockGrace: 10,      // #2823: ticks of air after leaving the nose — a nudge
                        // must not snap a freshly deployed shell straight back
    parkPad: 14,        // parked at camX + W - parkPad (never leaves the screen)
    laserMin: 8,        // laser: ticks of hold before a release looses anything
    laserSpeed: 6.2,
    laserTiers: [24, 42, 62],   // lance lengths at charge <25 / <50 / max
}
export const CYCLE = ['vulcan', 'laser', 'wave']

// the wing (S4): seat two's station relative to seat one. The wing holds
// BEHIND and on the OPPOSITE lane — two lanes of coverage, never a blocker.
export const WING = {
    backX: 20,        // this far behind seat one's nose
    laneGap: 44,      // requested vertical separation from seat one
    stationX: 46,     // hold here when seat one is down
    crushSafe: 24,    // panic-thrust line from the left wall
}

// the bit chain (S3): attach slots newest-first — nose, tail, top, bottom,
// as the original shoves older drones down the line when a new one docks.
// With all four aboard they stop riding the hull and ORBIT: the shield.
export const BIT = {
    slots: [[16, 0], [-16, 0], [0, -14], [0, 14]],
    rad: 8,            // deflect reach of an orbiting bit (rounds, hunters)
    crushR: 11,        // the rotating fist grinds soft bodies this close
    shieldR: 15,       // orbit radius once the chain is complete
    spin: 0.09,        // rad/tick of the orbit
}

// stage script: camX triggers -> delayed spawns (queue keeps spacing seeded-free:
// the schedule is authored, only enemy jitter draws rng).
export const WAVES = [
    { at: 60,  caps: 0, spawn: [
        { kind: 'larva', d: 0, y: 92 }, { kind: 'larva', d: 26, y: 134 },
        { kind: 'larva', d: 52, y: 60 }, { kind: 'larva', d: 78, y: 176 },
        { kind: 'larva', d: 104, y: 112 } ] },
    { at: 150, fcap: 1 },
    { at: 170, caps: 1 },
    { at: 210, spawn: [
        { kind: 'larva', d: 0, y: 70, dive: 1 }, { kind: 'larva', d: 18, y: 150 },
        { kind: 'larva', d: 36, y: 104, dive: 1 }, { kind: 'larva', d: 54, y: 186 },
        { kind: 'larva', d: 72, y: 44 }, { kind: 'larva', d: 90, y: 128, dive: 1 } ] },
    { at: 250, bcap: 1 },
    { at: 300, seg: { y0: FIELD_TOP, y1: 96, len: 130, turret: 96 } },
    { at: 380, caps: 1 },
    { at: 430, pod: { y: 64, missiles: 3 } },
    { at: 500, seg: { y0: 118, y1: FIELD_BOT, len: 150, turret: 118 } },
    { at: 520, fcap: 1 },
    { at: 560, spawn: [
        { kind: 'larva', d: 0, y: 80, dive: 1 }, { kind: 'larva', d: 20, y: 160 },
        { kind: 'larva', d: 40, y: 52, dive: 1 }, { kind: 'larva', d: 60, y: 196 },
        { kind: 'larva', d: 80, y: 120, dive: 1 }, { kind: 'larva', d: 100, y: 96 } ] },
    { at: 610, bcap: 1 },
    { at: 640, pod: { y: 168, missiles: 4 } },
    { at: 700, seg: { y0: FIELD_TOP, y1: 82, len: 170, turret: 82 } },
    { at: 770, spawn: [
        { kind: 'larva', d: 0, y: 140, dive: 1 }, { kind: 'larva', d: 22, y: 74 },
        { kind: 'larva', d: 44, y: 180, dive: 1 }, { kind: 'larva', d: 66, y: 108 } ] },
]

// LEG 2 (S3): the convoy resumes after Phase-1 falls — thinner field, two
// more bit capsules, and the run ends at the PHASE-2 fortress (STAGE_END2).
// #2835: the original's stage-2 signature CARRIERS — airborne bitpods ferry
// two-three bits; kill the hull and the cargo breaks loose as capsules.
// y/n ride the script (no rng draws: the tuned stream stays byte-identical).
export const WAVES2 = [
    { at: 40, spawn: [
        { kind: 'larva', d: 0, y: 100 }, { kind: 'larva', d: 24, y: 150, dive: 1 },
        { kind: 'larva', d: 48, y: 70 }, { kind: 'larva', d: 72, y: 182, dive: 1 } ] },
    { at: 120, bcap: 1 },
    { at: 150, bpod: { y: 74, n: 3 } },
    { at: 180, seg: { y0: FIELD_TOP, y1: 92, len: 140, turret: 92 } },
    { at: 260, pod: { y: 152, missiles: 3 } },
    { at: 330, spawn: [
        { kind: 'larva', d: 0, y: 84, dive: 1 }, { kind: 'larva', d: 26, y: 160 },
        { kind: 'larva', d: 52, y: 120, dive: 1 } ] },
    { at: 380, bpod: { y: 162, n: 2 } },
    { at: 400, bcap: 1 },
    { at: 450, seg: { y0: 126, y1: FIELD_BOT, len: 130, turret: 126 } },
]

// mulberry32 as a state-carried step (snapshot/restore stays byte-exact).
export function rng(gs) {
    gs.rngState = (gs.rngState + 0x6D2B79F5) | 0
    let t = Math.imul(gs.rngState ^ (gs.rngState >>> 15), 1 | gs.rngState)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

function makeShip() {
    return {
        x: 60, y: 120, dead: false, out: false,
        inv: CFG.respawnIFrames,
        weapon: 'vulcan',   // vulcan | wave
        charge: 0,
        cd: 0,
        anim: 0,
    }
}

// seat two (S4): a full pilot — own lives, arm, pod and bit chain. Lives and
// the seat flag ride the object; `out` means the ticket burned (dark seat).
function makeWing(gs) {
    const s = gs.ship
    const anchor = s.dead || s.out ? gs.camX + W - 30 : s.x
    return {
        ...makeShip(),
        x: clamp(anchor - WING.backX, gs.camX + 26, gs.camX + W - 40),
        y: clamp((s.dead || s.out ? 120 : s.y) < 120 ? 164 : 76, FIELD_TOP + 8, FIELD_BOT - 8),
        lives: CFG.lives,
        dyingT: 0,
        human: false,
        pod: null,
        bits: [],
        bHeld: false,
    }
}

// The shell opts co-op in at the seat (and in the attract); the S1–S3 sim,
// hash and winnability floor stay untouched while gs.wing is null.
export function enableCoop(gs) {
    if (!gs.wing) { gs.wing = makeWing(gs); gs.wingAt = gs.tick }
    return gs.wing
}

export function makeGame(seed = 1) {
    return {
        seed: seed >>> 0, rngState: seed >>> 0, nextId: 1,
        tick: 0, mode: 'play',       // play | clear | gameover
        score: 0, hi: 0, cleared: false,
        camX: 0, camLock: false,
        ship: makeShip(),
        lives: CFG.lives, dyingT: 0,
        weaponName: 'vulcan',           // mirror of ship.weapon for HUD/state
        pod: null,                     // S2 force pod: {id,state,x,y} attached|fly|park|return
        bHeld: false,                  // edge-detector for the POD button
        bits: [],                      // S3 bit chain: [{id,px,py}] newest-first; 4 => shield
        leg: 1,                        // S3: 1 until Phase-1 falls, then 2 (the twin-core leg)
        legAt: 0,                      // tick LEG 2 opened (banner timing)
        p2: null,                      // S3 Phase-2 fortress: {x,cores:[{hp,mouth,mouthT,enraged}],dyingT,at}
        wing: null,                    // S4 seat two: null until enableCoop — full pilot object when live
        wingAt: 0,                     // tick the wing joined (banner timing)
        shots: [],                   // player: {id,x,y,kind,size,hit[]}
        bullets: [],               // enemy: {id,x,y,vx,vy}
        missiles: [],              // {id,x,y,a,spd,t}
        enemies: [],               // larva | turret | pod | hullseg
        caps: [],                  // {id,x,y,baseY,bob}
        pending: [],               // {t,run} — run is authored, not serialized: keep ids
        schedule: WAVES.map((w, i) => ({ ...w, idx: i, fired: false })),
        waveIdx: 0,
        banner: 0,
        p1: null,                  // Phase-1 hull
        next1up: CFG.oneUpEvery,
        events: [],
    }
}

// ---- spawning ------------------------------------------------------------

function spawnLarva(gs, y, dive) {
    gs.enemies.push({
        id: gs.nextId++, kind: 'larva',
        x: gs.camX + W + 18, y,
        baseY: y, sine: rng(gs) * Math.PI * 2,
        dive: !!dive, state: dive ? 'enter' : 'sine', stateT: dive ? 70 + Math.floor(rng(gs) * 40) : 0,
        vx: -1.15, vy: 0, hp: 1, anim: Math.floor(rng(gs) * 4), inv: 0,
    })
}

function spawnCaps(gs) {
    const y = 60 + Math.floor(rng(gs) * 120)
    gs.caps.push({ id: gs.nextId++, x: gs.camX + W + 14, y, baseY: y, bob: rng(gs) * 6, type: 'weapon' })
}

function spawnForceCap(gs) {
    const y = 70 + Math.floor(rng(gs) * 100)
    gs.caps.push({ id: gs.nextId++, x: gs.camX + W + 14, y, baseY: y, bob: rng(gs) * 6, type: 'force' })
}

function spawnBitCap(gs) {
    const y = 60 + Math.floor(rng(gs) * 120)
    gs.caps.push({ id: gs.nextId++, x: gs.camX + W + 14, y, baseY: y, bob: rng(gs) * 6, type: 'bit' })
}

// The bit carrier (#2835): an armoured hull ferrying n bits. It eases into a
// station like the missile pod (no rng — bob derives from id), bobs, and the
// camera grinds it if the pilot never cuts it down. Its cargo law lives in
// releaseBits: the bits only ever reach the pilot through the WRECK, so the
// set-piece is "shoot the pod, chain the bits" — the original's stage-2 beat.
function spawnBitPod(gs, y, n) {
    gs.enemies.push({
        id: gs.nextId++, kind: 'bitpod', x: gs.camX + W + 18, y,
        baseY: y, bob: ((gs.nextId * 37) % 100) / 25, hp: 7, n,
        vx: -0.7, inv: 0, anim: 0, holdT: 0,
        anchorX: gs.camX + 238, state: 'enter',
    })
}

// cargo spills as bit capsules — held in a tight, collectable cluster
// (capsules bob ±16; a wider fan would shake the far bits out of reach)
function releaseBits(gs, e) {
    for (let i = 0; i < e.n; i++) {
        const y = clamp(e.y + (i - (e.n - 1) / 2) * 10, FIELD_TOP + 6, FIELD_BOT - 6)
        gs.caps.push({ id: gs.nextId++, x: e.x - 4 - i * 7, y, baseY: y, bob: ((e.id + i * 13) % 100) / 25, type: 'bit' })
    }
    gs.events.push('bitfree')
}

// Where bit i rides THIS tick: chained at its slot, or swinging the shield
// orbit when the chain is complete. The sim writes px/py once per tick, so
// the draw layer and every collision read the same truth. Seat-parameterised
// (S4): seat one's chain rides gs.ship/gs.bits; the wing carries its own.
export function bitPosAt(ship, bits, tick, i) {
    if (bits.length === 4) {
        const a = tick * BIT.spin + (i * Math.PI) / 2
        return { x: ship.x + Math.cos(a) * BIT.shieldR, y: ship.y + Math.sin(a) * BIT.shieldR }
    }
    const sl = BIT.slots[i]
    return { x: ship.x + sl[0], y: ship.y + sl[1] }
}
export function bitPos(gs, i) { return bitPosAt(gs.ship, gs.bits, gs.tick, i) }
export const shieldOn = (gs) => gs.bits.length === 4
export const shieldOnAt = (host) => host.bits.length === 4

// px/py are written once per tick so drawing and collision never disagree.
// flash (#2831) is a juice countdown the draw layer reads — never hashed, so
// contract replays are untouched by the feedback pass.
function refreshBits(gs) { refreshBitsOn(gs.ship, gs.bits, gs.tick) }
function refreshBitsOn(ship, bits, tick) {
    for (let i = 0; i < bits.length; i++) {
        const p = bitPosAt(ship, bits, tick, i)
        bits[i].px = p.x; bits[i].py = p.y
        if (bits[i].flash > 0) bits[i].flash -= 1
    }
}

// Chain a bit to the hull — newest at the nose, the rest shoved down the
// line (the original's attach order). The fourth completes the shield.
function addBit(gs) { return addBitOn(gs, gs.ship, gs.bits, false) }
function addBitOn(gs, ship, bits, isWing) {
    if (bits.length >= 4) return false
    bits.unshift({ id: gs.nextId++ })
    refreshBitsOn(ship, bits, gs.tick)
    addScore(gs, 500)
    gs.events.push(bits.length === 4 ? (isWing ? 'wshield' : 'shield') : (isWing ? 'wbit' : 'bit'))
    return true
}

function spawnSeg(gs, cfg) {
    const id = gs.nextId++
    gs.enemies.push({
        id, kind: 'hullseg', x: gs.camX + W + 20, y0: cfg.y0, y1: cfg.y1, len: cfg.len,
        vx: 0, hp: Infinity, inv: Infinity,
    })
    const topSeg = cfg.y1 < (FIELD_TOP + FIELD_BOT) / 2   // slab hangs from the top?
    gs.enemies.push({
        id: gs.nextId++, kind: 'turret', on: id,
        x: gs.camX + W + 20 + 30 + Math.floor(rng(gs) * (cfg.len - 60)),
        y: topSeg ? cfg.y1 + 9 : cfg.y0 - 9,               // gun protrudes toward the open lane
        face: -1, hp: 3, cd: 60 + Math.floor(rng(gs) * 60), anim: 0, inv: 0,
        edgeUp: topSeg,
    })
}

function spawnPod(gs, y, missiles) {
    gs.enemies.push({
        id: gs.nextId++, kind: 'pod', x: gs.camX + W + 16, y,
        baseY: y, bob: rng(gs) * 4, hp: 6, cd: 90, shots: missiles,
        state: 'enter', vx: -0.9, inv: 0, anim: 0, anchorX: gs.camX + 252, hover: 0,
    })
}

function startPhase1(gs) {
    gs.camLock = true
    // the dreadnought's arrival clears the field: stray hull-plates and their
    // guns fall away (leaving them would freeze the station on a slab the lock ends)
    gs.enemies = gs.enemies.filter((e) => e.kind !== 'hullseg' && typeof e.on !== 'number')
    gs.bullets.length = 0
    gs.missiles.length = 0
    const hx = gs.camX + 170   // hull face anchors mid-right of screen
    gs.p1 = {
        x: gs.camX + W + 150, targetX: hx, vx: -0.9,
        coreHp: 12, coreMax: 12,
        mouth: 'closed', mouthT: 140,          // first gape after 140 ticks
        dyingT: 0,
    }
    // onboard guns ride the hull (on: 'p1')
    gs.enemies.push({ id: gs.nextId++, kind: 'turret', on: 'p1', ox: 50, oy: 52,
        x: gs.p1.x + 50, y: 52, face: -1, hp: 3, cd: 80, anim: 0, inv: 0, edgeUp: true })
    gs.enemies.push({ id: gs.nextId++, kind: 'turret', on: 'p1', ox: 95, oy: 196,
        x: gs.p1.x + 95, y: 196, face: -1, hp: 3, cd: 130, anim: 0, inv: 0, edgeUp: false })
    gs.enemies.push({ id: gs.nextId++, kind: 'pod', on: 'p1', ox: 44, oy: 172,
        x: gs.p1.x + 44, y: 172, baseY: 172, bob: 2, hp: 6, cd: 200, shots: 5,
        state: 'hold', vx: 0, inv: 0, anim: 0 })
}

// The PHASE-2 fortress (S3): the original's stage-1 twin hearts. Each core
// vents on its own clock (the stagger makes the double-gape a real window);
// a flank gun pair and a hunter battery ride the plating.
function startPhase2(gs) {
    gs.camLock = true
    gs.enemies = gs.enemies.filter((e) => e.kind !== 'hullseg' && typeof e.on !== 'number')
    gs.bullets.length = 0
    gs.missiles.length = 0
    gs.p2 = {
        x: gs.camX + W + 170, targetX: gs.camX + 176, vx: -0.9,
        cores: [
            { hp: 8, max: 8, mouth: 'closed', mouthT: 130, enraged: false },
            { hp: 8, max: 8, mouth: 'closed', mouthT: 185, enraged: false },
        ],
        dyingT: 0, at: gs.tick,
        // #2835 offense/death: the mass sways (whole face, no rng — pure tick
        // sine), ports alternate the aimed 3-shot salvo (port 0 speaks first),
        // and the wreck walks port-to-port from the heart that fell LAST.
        port: 0, swayOff: 0, lastCore: -1, cascade: 380, flashT: 0, flashCi: 0,
    }
    gs.enemies.push({ id: gs.nextId++, kind: 'turret', on: 'p2', ox: 46, oy: 46,
        x: gs.p2.x + 46, y: 46, face: -1, hp: 4, cd: 90, anim: 0, inv: 0, edgeUp: true })
    gs.enemies.push({ id: gs.nextId++, kind: 'turret', on: 'p2', ox: 92, oy: 196,
        x: gs.p2.x + 92, y: 196, face: -1, hp: 4, cd: 150, anim: 0, inv: 0, edgeUp: false })
    gs.enemies.push({ id: gs.nextId++, kind: 'pod', on: 'p2', ox: 118, oy: 176,
        x: gs.p2.x + 118, y: 176, baseY: 176, bob: 2, hp: 7, cd: 220, shots: 4,
        state: 'hold', vx: 0, inv: 0, anim: 0 })
    gs.events.push('p2arrive')
}

// one core's vent cycle; an enraged core runs its clock at double speed.
// #2835: a port that gapes on ITS turn answers with a telegraphed 3-shot —
// the horn of the opening (30 ticks) is the warning, the salvo lands as the
// throat clears. Ports alternate volleys, so a double-gape means the OFF
// port sits quiet — pick your side of the face.
function fireSalvo(gs, ci) {
    const p2 = gs.p2
    const px = p2.x + 8, py = CORE_Y[ci] + p2.swayOff
    const tp = nearestPilot(gs, px, py)
    const base = Math.atan2(tp.y - py, tp.x - px)
    for (const off of [-0.18, 0, 0.18]) {
        gs.bullets.push({ id: gs.nextId++, x: px, y: py, vx: Math.cos(base + off) * 1.35, vy: Math.sin(base + off) * 1.35 })
    }
    p2.flashT = 7; p2.flashCi = ci
    gs.events.push('p2salvo')
}

function vent(core, gs, ci) {
    core.mouthT -= core.enraged ? 2 : 1
    if (core.mouthT <= 0) {
        if (core.mouth === 'closed') { core.mouth = 'opening'; core.mouthT = 30; gs.events.push('p2open') }
        else if (core.mouth === 'opening') {
            core.mouth = 'open'; core.mouthT = 110
            if (gs.p2.port === ci) { fireSalvo(gs, ci); gs.p2.port = 1 - ci }
        }
        else if (core.mouth === 'open') { core.mouth = 'closing'; core.mouthT = 30 }
        else { core.mouth = 'closed'; core.mouthT = 150 + ((gs.tick * 7) % 50); gs.events.push('p2shut') }
    }
}

// Phase-1's wreck hands the convoy onward: the field resets, LEG 2 scrolls
// toward the twin-core fortress.
function startLeg2(gs) {
    gs.leg = 2
    gs.camX = 0
    gs.camLock = false
    gs.enemies.length = 0
    gs.bullets.length = 0
    gs.missiles.length = 0
    gs.shots.length = 0
    gs.caps.length = 0
    gs.pending.length = 0
    gs.schedule = WAVES2.map((w, i) => ({ ...w, idx: 50 + i, fired: false }))
    gs.banner = 0
    if (gs.pod && gs.pod.state === 'park') gs.pod.x = gs.camX + W - POD.parkPad
    if (gs.wing && gs.wing.pod && gs.wing.pod.state === 'park') gs.wing.pod.x = gs.camX + W - POD.parkPad
    gs.legAt = gs.tick
    gs.events.push('leg2')
}

// ---- death / clear ---------------------------------------------------------

// One law per hull (S4): a hit kills, the attached shell burns, the chain
// comes off. host === gs is seat one (lives on gs.lives, timer on gs.dyingT);
// gs.wing carries its own pool, timer, pod and bits.
function killShip(gs, s, host, why) {
    if (s.dead || s.inv > 0 || gs.mode !== 'play') return false
    s.dead = true
    const wing = host !== gs
    if (wing) { s.dyingT = CFG.dying; host.lives -= 1; gs.lastWreckX = s.x; gs.lastWreckY = s.y }
    else { gs.dyingT = CFG.dying; gs.lives -= 1 }
    gs.events.push(wing ? 'wingdie' : 'die')
    gs.lastDeath = why
    // an attached shell burns with its pilot; one parked out front survives
    if (host.pod && host.pod.state === 'attached') host.pod = null
    // the bit chain is power armour — it comes off with the pilot (S3)
    if (host.bits.length) { host.bits.length = 0; gs.events.push(wing ? 'wbitslost' : 'bitslost') }
    return true
}
const killWing = (gs, s, why) => killShip(gs, s, s, why)

function respawn(gs) {
    gs.ship = makeShip()
    gs.ship.x = gs.camX + 34
    gs.ship.y = 120
}

// the wing returns under the same mercy, on the opposite side of seat one
function respawnWing(gs) {
    const w = gs.wing
    const s = gs.ship
    const fresh = makeShip()
    fresh.x = gs.camX + 26
    fresh.y = clamp((s.dead || s.out ? 120 : s.y) < 120 ? 164 : 76, FIELD_TOP + 8, FIELD_BOT - 8)
    Object.assign(w, fresh) // lives / human / out stay on the seat object
    gs.events.push('wingin')
}

// GAME OVER only when both tickets burn (S4): solo semantics preserved —
// gs.wing null means seat two never existed.
function seatsGone(gs) {
    const p1 = gs.ship.out || (gs.ship.dead && gs.dyingT <= 0 && gs.lives <= 0)
    if (!p1) return false
    if (!gs.wing) return true
    const w = gs.wing
    return w.out || (w.dead && w.dyingT <= 0 && w.lives <= 0)
}

// Bydo guns take the NEAREST live hull (S4) — no wing, same old target range.
function nearestPilot(gs, x, y) {
    const s = gs.ship
    if (!gs.wing) return s
    const dp = s.dead || s.out ? Infinity : Math.hypot(s.x - x, s.y - y)
    const dw = gs.wing.dead || gs.wing.out ? Infinity : Math.hypot(gs.wing.x - x, gs.wing.y - y)
    return dw < dp ? gs.wing : s
}

function addScore(gs, n) {
    gs.score += n
    if (gs.score >= gs.next1up) { gs.lives += 1; gs.next1up += CFG.oneUpEvery; gs.events.push('1up') }
    if (gs.score > gs.hi) gs.hi = gs.score
}

function stageClear(gs) {
    gs.mode = 'clear'
    gs.cleared = true
    gs.banner = CFG.clearHold
    addScore(gs, 5000)
    gs.events.push('clear')
}

function loopStage(gs) {
    gs.mode = 'play'
    gs.camX = 0
    gs.camLock = false
    gs.enemies.length = 0
    gs.bullets.length = 0
    gs.missiles.length = 0
    gs.shots.length = 0
    gs.caps.length = 0
    gs.pending.length = 0
    gs.p1 = null
    gs.p2 = null
    gs.leg = 1
    gs.schedule = WAVES.map((w, i) => ({ ...w, idx: i, fired: false }))
    gs.waveIdx = 0
    gs.banner = 0
    if (gs.lives > 0) respawn(gs) // (S4) a dark seat is not reborn by a clear
    else gs.ship.dead = true
    gs.ship.inv = CFG.respawnIFrames
    if (gs.pod) { gs.pod.state = 'attached'; gs.pod.x = gs.ship.x + POD.noseX; gs.pod.y = gs.ship.y }
    // seat two carries (S4): tickets carry, the hull re-seats beside the leader
    if (gs.wing && !gs.wing.out && gs.wing.lives > 0) {
        const fresh = makeShip()
        fresh.x = gs.camX + 26
        fresh.y = 76
        Object.assign(gs.wing, fresh)
        if (gs.wing.pod) { gs.wing.pod.state = 'attached'; gs.wing.pod.x = fresh.x + POD.noseX; gs.wing.pod.y = fresh.y }
    }
    // the loop re-runs Walnuts-style: score and lives carry, the arm stays
}

// ---- the step --------------------------------------------------------------

export function step(gs, pad, pad2) {
    gs.events.length = 0
    if (gs.mode === 'gameover') return
    gs.tick += 1

    if (gs.mode === 'clear') {
        gs.banner -= 1
        if (gs.banner <= 0) loopStage(gs)
        return
    }

    // --- dying pause: the wreck hangs, then mercy or curtain. In co-op the
    // living partner keeps working — the world only stands still when BOTH
    // cockpits hang (solo semantics byte-identical: wing null ⇒ frozen).
    if (gs.ship.dead) {
        gs.dyingT -= 1
        const wc = !!gs.wing && !gs.wing.out && gs.wing.lives > 0
        runWorld(gs, pad, !wc, pad2)
        if (gs.dyingT <= 0) {
            if (gs.lives > 0) respawn(gs)
            else gs.ship.out = true // dark seat: the wing carries the run
        }
        if (gs.mode === 'play' && seatsGone(gs)) gs.mode = 'gameover'
        return
    }

    runWorld(gs, pad, false, pad2)
    if (gs.mode === 'play' && seatsGone(gs)) gs.mode = 'gameover'
}

function runWorld(gs, pad, frozen, pad2) {
    const s = gs.ship
    const sAlive = !s.dead // S4: seat one may hang while the wing works
    const bPress = !!pad.b && !gs.bHeld   // POD button is edge-triggered
    gs.bHeld = !!pad.b
    refreshBits(gs)

    // --- camera: right only, ever; LEG 2 ends at the twin-core fortress
    if (!gs.camLock) {
        gs.camX += SCROLL
        const end = gs.leg === 2 ? STAGE_END2 : STAGE_END
        if (gs.camX >= end) {
            gs.camX = end
            if (gs.leg === 2) startPhase2(gs)
            else startPhase1(gs)
        }
    }
    if (s.x < gs.camX + 2) s.x = gs.camX + 2
    if (s.x > gs.camX + W - 10) s.x = gs.camX + W - 10
    if (!frozen && sAlive && s.x - CFG.crushX <= gs.camX && killShip(gs, s, gs, 'crush')) return

    // --- ship
    if (!frozen && sAlive) {
        if (pad.left) s.x -= CFG.shipSpeed
        if (pad.right) s.x += CFG.shipSpeed
        if (pad.up) s.y -= CFG.shipSpeed
        if (pad.down) s.y += CFG.shipSpeed
        s.y = clamp(s.y, FIELD_TOP + 6, FIELD_BOT - 4)
        if (s.inv > 0) s.inv -= 1
        s.anim += 1
        gs.weaponName = s.weapon

        // fire / charge
        if (s.cd > 0) s.cd -= 1
        if (s.weapon === 'vulcan') {
            if (pad.a && s.cd <= 0) {
                gs.shots.push({ id: gs.nextId++, x: s.x + 12, y: s.y - 1, kind: 'v', size: 0, pierce: false, hit: [], vy: 0 })
                // a chained hull outguns the convoy: every bit draws its own
                // stream from where it rides. #2831 bit×arm matrix: the streams
                // FAN — a bit off the hull line shoots outward in proportion to
                // its offset, so the chain buys lanes, not just volume (the
                // original's spread). Orbiting bits sweep their fan as they spin.
                for (const bt of gs.bits) {
                    const by = bt.py ?? s.y
                    gs.shots.push({ id: gs.nextId++, x: (bt.px ?? s.x) + 10, y: by - 1, kind: 'v', size: 0, pierce: false, hit: [], vy: clamp((by - s.y) * 0.045, -0.5, 0.5) })
                }
                s.cd = CFG.vulcanCd
                gs.events.push('shot')
            }
        } else if (s.weapon === 'laser') {
            // charge-and-release per the issue: the lance scales with the hold
            if (pad.a) { if (s.charge < CFG.waveMax) s.charge += 1 }
            else if (s.charge > 0) {
                if (s.charge >= POD.laserMin) {
                    const tier = s.charge >= 50 ? 2 : s.charge >= 25 ? 1 : 0
                    // #2831 matrix: every bit riding the chain widens the lance
                    gs.shots.push({ id: gs.nextId++, x: s.x + 12, y: s.y - 1, kind: 'l', size: tier, pierce: true, hit: [], wy: gs.bits.length })
                    gs.events.push('laser')
                }
                s.charge = 0
            }
        } else {
            if (pad.a) { if (s.charge < CFG.waveMax) s.charge += 1 }
            else if (s.charge > 0) {
                if (s.charge >= CFG.waveMin) {
                    const tier = s.charge >= 50 ? 2 : s.charge >= 25 ? 1 : 0
                    // #2831 matrix: every bit broadens the crescent's sweep
                    gs.shots.push({ id: gs.nextId++, x: s.x + 10, y: s.y, kind: 'w', size: tier, pierce: true, hit: [], hx: gs.bits.length })
                    gs.events.push('wave')
                }
                s.charge = 0
            }
        }
    }

    // --- seat two (S4): full pilot — move, fire, shell, chain, own death rite
    runWing(gs, pad2, frozen)

    // --- stage schedule
    if (!gs.camLock) {
        for (const wv of gs.schedule) {
            if (wv.fired || gs.camX < wv.at) continue
            wv.fired = true
            gs.waveIdx = wv.idx + 1
            if (wv.caps) spawnCaps(gs)
            if (wv.fcap) spawnForceCap(gs)
            if (wv.bcap) spawnBitCap(gs)
            if (wv.seg) spawnSeg(gs, wv.seg)
            if (wv.pod) spawnPod(gs, wv.pod.y, wv.pod.missiles)
            if (wv.bpod) spawnBitPod(gs, wv.bpod.y, wv.bpod.n)
            if (wv.spawn) {
                for (const it of wv.spawn) gs.pending.push({ t: gs.tick + it.d, kind: it.kind, y: it.y, dive: it.dive })
            }
        }
    }
    for (let i = gs.pending.length - 1; i >= 0; i--) {
        const p = gs.pending[i]
        if (gs.tick >= p.t) { spawnLarva(gs, p.y, p.dive); gs.pending.splice(i, 1) }
    }

    // --- capsules
    for (let i = gs.caps.length - 1; i >= 0; i--) {
        const c = gs.caps[i]
        c.x -= 0.85; c.bob += 0.06; c.y = c.baseY + Math.sin(c.bob) * 16
        if (c.x < gs.camX - 20) { gs.caps.splice(i, 1); continue }
        let taken = false
        if (!frozen && sAlive && Math.abs(c.x - s.x) < 12 && Math.abs(c.y - s.y) < 12) {
            gs.caps.splice(i, 1)
            taken = true
            if (c.type === 'force') {
                if (!gs.pod) {
                    gs.pod = { id: gs.nextId++, state: 'attached', x: s.x + POD.noseX, y: s.y, grace: 0 }
                    addScore(gs, 500)
                    gs.events.push('force')
                } else if (!addBit(gs)) {
                    addScore(gs, 1000) // four bits and a shell? now it pays points
                    gs.events.push('capsule')
                }
                // NOTE (S3): a spare S.E.E.D. converts to a BIT, as the original
                // converts a spare capsule into the bit chain — not a second shell.
                continue
            }
            if (c.type === 'bit') {
                if (!addBit(gs)) {
                    addScore(gs, 1000) // a fifth bit is pure points
                    gs.events.push('capsule')
                }
                continue
            }
            s.weapon = CYCLE[(CYCLE.indexOf(s.weapon) + 1) % CYCLE.length]
            s.charge = 0
            gs.weaponName = s.weapon
            addScore(gs, 500)
            gs.events.push('capsule')
        }
        // seat two takes what seat one yields (S4): tie goes to seat one
        const w = gs.wing
        if (!taken && !frozen && w && !w.out && !w.dead && Math.abs(c.x - w.x) < 12 && Math.abs(c.y - w.y) < 12) {
            gs.caps.splice(i, 1)
            if (c.type === 'force') {
                if (!w.pod) {
                    w.pod = { id: gs.nextId++, state: 'attached', x: w.x + POD.noseX, y: w.y, grace: 0 }
                    addScore(gs, 500)
                    gs.events.push('wforce')
                } else if (!addBitOn(gs, w, w.bits, true)) {
                    addScore(gs, 1000)
                    gs.events.push('capsule')
                }
                continue // spare S.E.E.D. law applies per hull
            }
            if (c.type === 'bit') {
                if (!addBitOn(gs, w, w.bits, true)) { addScore(gs, 1000); gs.events.push('capsule') }
                continue
            }
            w.weapon = CYCLE[(CYCLE.indexOf(w.weapon) + 1) % CYCLE.length]
            w.charge = 0
            addScore(gs, 500)
            gs.events.push('capsule')
        }
    }

    // --- Phase-1 hull
    const p1 = gs.p1
    if (p1 && p1.dyingT === 0) {
        if (p1.x > p1.targetX) p1.x += p1.vx
        // maw cycle: closed -> opening -> open -> closing
        p1.mouthT -= 1
        if (p1.mouthT <= 0) {
            if (p1.mouth === 'closed') { p1.mouth = 'opening'; p1.mouthT = 30; gs.events.push('mawopen') }
            else if (p1.mouth === 'opening') { p1.mouth = 'open'; p1.mouthT = 110 }
            else if (p1.mouth === 'open') { p1.mouth = 'closing'; p1.mouthT = 30 }
            else { p1.mouth = 'closed'; p1.mouthT = 170 + Math.floor(rng(gs) * 60); gs.events.push('mawshut') }
        }
    } else if (p1 && p1.dyingT > 0) {
        p1.dyingT -= 1
        // death cascade (#2818): the stricken hull recoils into the dark,
        // shuddering, its own armour raking apart along the whole face.
        // Positions derive from tick arithmetic (not gs.rng) so the sim's
        // random stream stays exactly where the tuned baseline left it.
        p1.x += 0.5
        if (gs.tick % 5 === 0) {
            gs.lastHitX = p1.x + 12 + ((gs.tick * 37) % 131)
            gs.lastHitY = 40 + ((gs.tick * 61) % 156)
            gs.events.push('boom')
        }
        if (p1.dyingT <= 0) { gs.p1 = null; startLeg2(gs) }
    }

    // --- Phase-2 fortress (S3): twin cores, staggered vents, enraged survivor
    const p2 = gs.p2
    if (p2 && p2.dyingT === 0) {
        if (p2.x > p2.targetX) p2.x += p2.vx
        // #2835: the whole mass sways — pure tick sine, no rng; rides the
        // core hit windows, the guns and the draw. Cores stay OFF the
        // mid-line, so the wall laws hold through the sway.
        p2.swayOff = Math.sin(gs.tick * 0.013) * 6
        if (p2.flashT > 0) p2.flashT -= 1
        p2.cores.forEach((c, ci) => { if (c.hp > 0) vent(c, gs, ci) })
    } else if (p2 && p2.dyingT > 0) {
        p2.dyingT -= 1
        p2.x += 0.5
        // #2835 walking death: the fire starts at the port that fell LAST,
        // crosses the face to its twin, and the plating sheds in rows behind
        // it. ~2× Phase-1's roll — the dread takes its time going under.
        const k = p2.cascade - p2.dyingT
        if (gs.tick % 3 === 0) {
            const lane = k < p2.cascade / 2 ? Math.max(0, p2.lastCore) : 1 - Math.max(0, p2.lastCore)
            gs.lastHitX = p2.x + 10 + Math.floor(k * 0.34) + ((k * 41) % 9)
            gs.lastHitY = CORE_Y[lane] + ((k * 67) % 13) - 6
            gs.events.push('boom')
        }
        if (p2.dyingT <= 0) { gs.p2 = null; stageClear(gs) }
    }

    // --- force pod (S2): attached rides the nose; B deploys to the edge; B
    // again (or touching it) recalls; armour rejects it; the wall grinds it
    if (gs.pod) {
        const pd = gs.pod
        if (pd.grace > 0) pd.grace -= 1 // #2823: the deploy/recall rhythm
        if (!frozen && sAlive && bPress) {
            if (pd.state === 'attached') { pd.state = 'fly'; pd.grace = POD.dockGrace; gs.events.push('podlaunch') }
            else if (pd.state !== 'return') pd.state = 'return'
        }
        if (pd.state === 'attached') { pd.x = s.x + POD.noseX; pd.y = s.y }
        else if (pd.state === 'fly') {
            pd.x += POD.launch
            if (pd.x >= gs.camX + W - POD.parkPad) { pd.x = gs.camX + W - POD.parkPad; pd.state = 'park' }
        }
        if (!frozen && sAlive && (pd.state === 'fly' || pd.state === 'park') && !(pd.grace > 0) &&
            Math.hypot(pd.x - s.x, pd.y - s.y) <= POD.dock) { pd.state = 'attached'; gs.events.push('poddock') }
        if (pd.state === 'return') {
            const dx = s.x + POD.noseX - pd.x, dy = s.y - pd.y
            const m = Math.max(1e-6, Math.hypot(dx, dy))
            if (m <= POD.dock) { pd.state = 'attached'; gs.events.push('poddock') }
            else { pd.x += (dx / m) * POD.recall; pd.y += (dy / m) * POD.recall }
        }
        if (pd.state !== 'attached') {
            // armour shrugs the shell off — the pod cannot push a dread forward
            for (const e of gs.enemies) {
                if (e.kind !== 'hullseg') continue
                if (pd.x + POD.rad > e.x && pd.y > e.y0 - 4 && pd.y < e.y1 + 4) {
                    gs.events.push('strain') // #2823: the refusal grunts (shell throttles the cadence)
                    pd.x = e.x - POD.rad
                    if (pd.state === 'fly') pd.state = 'park'
                }
            }
            if (p1 && p1.dyingT === 0 && pd.x + POD.rad > p1.x && pd.y > 34 && pd.y < 200) { gs.events.push('strain'); pd.x = p1.x - POD.rad }
            if (pd.x < gs.camX - 6) { gs.pod = null; gs.events.push('podlost') }
        }
    }

    // --- enemies
    for (let i = gs.enemies.length - 1; i >= 0; i--) {
        const e = gs.enemies[i]
        e.anim += 1
        if (e.inv > 0) e.inv -= 1
        if (e.on === 'p1' || e.on === 'p2') {
            const host = e.on === 'p1' ? p1 : p2
            if (host && host.dyingT === 0) { e.x = host.x + e.ox; e.y = e.oy + (host.swayOff || 0) + (e.kind === 'pod' ? Math.sin(gs.tick * 0.05) * 3 : 0) }
            else if (host) { gs.enemies.splice(i, 1); continue }
        }
        if (e.kind === 'larva') {
            if (e.state === 'dive') { e.x += e.vx; e.y += e.vy }
            else if (e.state === 'windup') {
                e.stateT -= 1
                e.x -= 0.35
                if (e.stateT <= 0) {
                    const tp = nearestPilot(gs, e.x, e.y) // S4 decoy law: divers take the nearest hull
                    const dx = tp.x - e.x, dy = tp.y - e.y
                    const m = Math.max(1e-6, Math.hypot(dx, dy))
                    e.vx = (dx / m) * 1.9; e.vy = (dy / m) * 1.9
                    e.state = 'dive'; gs.events.push('warn')
                }
            } else {
                e.x += e.vx
                e.sine += 0.08
                e.y = e.baseY + Math.sin(e.sine) * 22
                if (e.dive && e.x < gs.camX + W - 60 && !frozen) { e.state = 'windup'; e.stateT = 42 }
            }
            if (e.x < gs.camX - 24) { gs.enemies.splice(i, 1); continue }
        } else if (e.kind === 'turret') {
            const tp = nearestPilot(gs, e.x, e.y) // S4: the guns take the nearer hull
            e.aim = Math.atan2(tp.y - e.y, tp.x - e.x)
            e.cd -= 1
            if (e.cd <= 0 && !frozen && e.x > gs.camX && e.x < gs.camX + W + 10) {
                const dx = tp.x - e.x, dy = tp.y - e.y
                const m = Math.max(1e-6, Math.hypot(dx, dy))
                gs.bullets.push({ id: gs.nextId++, x: e.x, y: e.y + (e.edgeUp ? -6 : 6), vx: (dx / m) * 1.3, vy: (dy / m) * 1.3 })
                e.cd = 95 + Math.floor(rng(gs) * 55)
                e.anim = 0
                gs.events.push('tsfire')
            }
        } else if (e.kind === 'pod') {
            if (e.state === 'enter') {
                // ease into the station: the arcade pod bleeds speed as it
                // reaches its post, it does not hit a wall and stop (#2818).
                // Approach speed never exceeds the old steady 0.9 — the polish
                // must not pull the volley clock earlier than the script meant.
                e.x -= Math.max(0.22, Math.min(0.9, (e.x - e.anchorX) * 0.05))
                if (e.x <= e.anchorX) { e.state = 'hold'; e.baseY = e.y; e.bob = 0; e.hover = 0 }
            } else if (e.state === 'hold') {
                // lazy hover: the bob eases in over ~¾ s from the settle
                e.hover = (e.hover || 0) + 1
                e.y = e.baseY + Math.sin((e.bob += 0.045)) * 10 * Math.min(1, e.hover / 45)
                e.cd -= 1
                if (e.cd <= 0 && e.shots > 0 && !frozen && e.x > gs.camX + 10 && e.x < gs.camX + W + 10) {
                    gs.missiles.push({ id: gs.nextId++, x: e.x - 6, y: e.y, a: Math.PI, spd: 0.75, t: 300 })
                    e.shots -= 1
                    // staggered cadence: a fixed 170-tick volley reads metronomic
                    // (#2818). Arithmetic on (id, shots) — NOT gs.rng — so the
                    // stream stays byte-identical to the tuned baseline: the
                    // autopilot law stays an honest, stable measure.
                    e.cd = 152 + ((e.id * 17 + e.shots * 41) % 36); gs.events.push('missile')
                    if (e.shots <= 0) { e.state = 'flee'; e.vx = -1.4 }
                }
            } else { e.x += e.vx }
            if (e.x < gs.camX - 22) { gs.enemies.splice(i, 1); continue }
        } else if (e.kind === 'bitpod') {
            // carrier: eases into its station, bobs, creeps west; the camera
            // grinds it down if nobody answers the invitation
            if (e.state === 'enter') {
                e.x -= Math.max(0.2, Math.min(0.9, (e.x - e.anchorX) * 0.05))
                if (e.x <= e.anchorX) { e.state = 'hold'; e.holdT = 0 }
            } else {
                e.holdT += 1
                e.x += e.vx
            }
            e.y = e.baseY + Math.sin((e.bob += 0.04)) * 7 * Math.min(1, (e.holdT || 0) / 40)
            if (e.x < gs.camX - 24) { gs.enemies.splice(i, 1); continue }
        }
        // hullseg: anchored to world; scrolls out of life behind the camera
        if (e.kind === 'hullseg' && e.x + e.len < gs.camX - 8) { gs.enemies.splice(i, 1); continue }
    }

    // --- player shots
    const lance = (q) => (q.kind === 'l' ? POD.laserTiers[q.size] : 0)
    for (let i = gs.shots.length - 1; i >= 0; i--) {
        const q = gs.shots[i]
        q.x += q.kind === 'v' ? CFG.vulcanSpeed : q.kind === 'l' ? POD.laserSpeed : CFG.waveSpeed
        if (q.vy) {
            q.y += q.vy // fanned bit-streams drift outward; gone when they leave the field
            if (q.y < FIELD_TOP || q.y > FIELD_BOT) { gs.shots.splice(i, 1); continue }
        }
        if (q.x > gs.camX + W + 20) { gs.shots.splice(i, 1); continue }
        let dead = false

        // vs missiles (any shot can down a hunter)
        for (let m = gs.missiles.length - 1; m >= 0; m--) {
            const ms = gs.missiles[m]
            if (ms.x > q.x - 8 && ms.x < q.x + lance(q) + 8 && Math.abs(ms.y - q.y) < (q.kind === 'w' ? CFG.waveTiers[q.size] + (q.hx ?? 0) : q.kind === 'l' ? 5 + (q.wy ?? 0) : 6)) {
                gs.missiles.splice(m, 1); addScore(gs, 50); gs.events.push('boom')
                if (!q.pierce) dead = true
                break
            }
        }

        // vs enemies / hull armour
        if (!dead) {
            for (let m = gs.enemies.length - 1; m >= 0; m--) {
                const e = gs.enemies[m]
                if (q.hit.includes(e.id)) continue
                let struck = false
                if (e.kind === 'hullseg') struck = q.x + lance(q) + 2 > e.x && q.x < e.x + e.len && q.y > e.y0 && q.y < e.y1
                else if (e.kind === 'larva') struck = q.kind === 'l'
                    ? e.x > q.x - 5 && e.x < q.x + lance(q) + 5 && Math.abs(e.y - q.y) < 6 + (q.wy ?? 0) * 2
                    : Math.abs(e.x - q.x) < 9 && Math.abs(e.y - q.y) < (q.kind === 'w' ? CFG.waveTiers[q.size] + 4 + (q.hx ?? 0) * 2 : 6)
                else if (e.kind === 'turret') struck = q.kind === 'l'
                    ? e.x > q.x - 5 && e.x < q.x + lance(q) + 5 && Math.abs(e.y - q.y) < 7 + (q.wy ?? 0) * 2
                    : Math.abs(e.x - q.x) < 9 && Math.abs(e.y - q.y) < (q.kind === 'w' ? CFG.waveTiers[q.size] + 4 + (q.hx ?? 0) * 2 : 7)
                else if (e.kind === 'pod') struck = q.kind === 'l'
                    ? e.x > q.x - 7 && e.x < q.x + lance(q) + 7 && Math.abs(e.y - q.y) < 8 + (q.wy ?? 0) * 2
                    : Math.abs(e.x - q.x) < 11 && Math.abs(e.y - q.y) < (q.kind === 'w' ? CFG.waveTiers[q.size] + 4 + (q.hx ?? 0) * 2 : 8)
                else if (e.kind === 'bitpod') struck = q.kind === 'l'
                    ? e.x > q.x - 9 && e.x < q.x + lance(q) + 9 && Math.abs(e.y - q.y) < 10 + (q.wy ?? 0) * 2
                    : Math.abs(e.x - q.x) < 13 && Math.abs(e.y - q.y) < (q.kind === 'w' ? CFG.waveTiers[q.size] + 5 + (q.hx ?? 0) * 2 : 10)
                if (!struck) continue
                if (e.kind === 'hullseg') { gs.events.push('clank'); dead = true; break } // armour eats it
                gs.lastHitX = e.x; gs.lastHitY = e.y
                e.hp -= q.kind === 'w' ? 2 : q.kind === 'l' ? q.size + 1 : 1
                q.hit.push(e.id)
                gs.events.push('hit')
                if (e.hp <= 0) {
                    gs.enemies.splice(m, 1)
                    addScore(gs, e.kind === 'larva' ? 100 : e.kind === 'turret' ? 200 : e.kind === 'bitpod' ? 400 : 300)
                    gs.events.push('boom')
                    if (e.kind === 'bitpod') releaseBits(gs, e) // #2835: the cargo breaks loose
                }
                if (!q.pierce) { dead = true }
                break
            }
        }

        // vs Phase-1: armour unless the maw gapes
        if (!dead && p1 && p1.dyingT === 0 && q.x + lance(q) >= p1.x) {
            const coreY = 120
            if (p1.mouth === 'open' && Math.abs(q.y - coreY) < 16) {
                p1.coreHp -= q.kind === 'w' ? 2 : q.kind === 'l' ? q.size + 1 : 1
                gs.events.push('corehit')
                if (p1.coreHp <= 0) {
                    p1.dyingT = 170
                    addScore(gs, 2000)
                    gs.events.push('bigboom')
                    gs.enemies = gs.enemies.filter((e) => !(e.on === 'p1'))
                    gs.bullets.length = 0
                    gs.missiles.length = 0
                }
                dead = true // the blast stops at the armor — even the wave spends itself in the maw
            } else {
                gs.events.push('clank')
                dead = true
            }
        }
        // vs Phase-2: plating eats fire; the twin cores only open on their vents
        if (!dead && p2 && p2.dyingT === 0 && q.x + lance(q) >= p2.x) {
            let struckCore = -1
            for (let ci = 0; ci < 2; ci++) {
                const c = p2.cores[ci]
                if (c.hp > 0 && c.mouth === 'open' && Math.abs(q.y - (CORE_Y[ci] + p2.swayOff)) < 16) { struckCore = ci; break }
            }
            if (struckCore >= 0) {
                const c = p2.cores[struckCore]
                c.hp -= q.kind === 'w' ? 2 : q.kind === 'l' ? q.size + 1 : 1
                gs.lastHitX = p2.x + 14; gs.lastHitY = CORE_Y[struckCore] + p2.swayOff
                gs.events.push('corehit')
                if (c.hp <= 0) {
                    c.hp = 0
                    addScore(gs, 1500)
                    gs.events.push('coredown')
                    const other = p2.cores[1 - struckCore]
                    if (other.hp > 0) {
                        if (!other.enraged) { other.enraged = true; other.mouthT = Math.ceil(other.mouthT / 2); gs.events.push('enrage') }
                        gs.p2.port = 1 - struckCore // #2835: the survivor inherits the salvo turn — a burned port never silences the face
                    } else {
                        p2.dyingT = p2.cascade // #2835: double-length cascade, it walks the ports
                        p2.lastCore = struckCore
                        addScore(gs, 2000)
                        gs.events.push('bigboom')
                        gs.enemies = gs.enemies.filter((e) => e.on !== 'p2')
                        gs.bullets.length = 0
                        gs.missiles.length = 0
                    }
                }
            } else {
                gs.events.push('clank')
            }
            dead = true // the blast dies on the plating, gape or not
        }
        if (dead) gs.shots.splice(i, 1)
    }

    // --- enemy bullets
    for (let i = gs.bullets.length - 1; i >= 0; i--) {
        const b = gs.bullets[i]
        b.x += b.vx; b.y += b.vy
        if (b.x < gs.camX - 8 || b.x > gs.camX + W + 8 || b.y < FIELD_TOP - 4 || b.y > FIELD_BOT + 4) { gs.bullets.splice(i, 1); continue }
        if (!frozen && gs.pod && Math.abs(b.x - gs.pod.x) < 8 && Math.abs(b.y - gs.pod.y) < 7) { gs.bullets.splice(i, 1); gs.lastHitX = b.x; gs.lastHitY = b.y; gs.events.push('plug'); continue }
        // the completed bit chain is a rotating wall: lead does not get through
        if (!frozen && shieldOn(gs)) {
            let deflected = false
            for (const bt of gs.bits) {
                if (Math.abs(b.x - bt.px) < BIT.rad && Math.abs(b.y - bt.py) < BIT.rad) {
                    bt.flash = 8 // #2831: the bit that ate the round flashes white + shudders
                    gs.bullets.splice(i, 1); gs.lastHitX = b.x; gs.lastHitY = b.y; gs.events.push('deflect'); deflected = true; break
                }
            }
            if (deflected) continue
        }
        // seat two plugs too (S4): the wing's shell and orbit eat their own lead
        if (!frozen && gs.wing && !gs.wing.out && gs.wing.pod && Math.abs(b.x - gs.wing.pod.x) < 8 && Math.abs(b.y - gs.wing.pod.y) < 7) { gs.bullets.splice(i, 1); gs.lastHitX = b.x; gs.lastHitY = b.y; gs.events.push('plug'); continue }
        if (!frozen && gs.wing && !gs.wing.out && shieldOnAt(gs.wing)) {
            let dfl = false
            for (const bt of gs.wing.bits) {
                if (Math.abs(b.x - bt.px) < BIT.rad && Math.abs(b.y - bt.py) < BIT.rad) {
                    bt.flash = 8 // #2831 feedback generalizes to seat two
                    gs.bullets.splice(i, 1); gs.lastHitX = b.x; gs.lastHitY = b.y; gs.events.push('deflect'); dfl = true; break
                }
            }
            if (dfl) continue
        }
        if (!frozen && sAlive && s.inv <= 0 && Math.abs(b.x - s.x) < 5 && Math.abs(b.y - s.y) < 4) { gs.bullets.splice(i, 1); killShip(gs, s, gs, 'bullet'); return }
        const wgB = gs.wing
        if (!frozen && wgB && !wgB.out && !wgB.dead && wgB.inv <= 0 && Math.abs(b.x - wgB.x) < 5 && Math.abs(b.y - wgB.y) < 4) { gs.bullets.splice(i, 1); killWing(gs, wgB, 'bullet') }
    }

    // --- homing missiles: strong hunt at launch, then they straighten and
    // fly PAST — a hunter that looped forever could never be left behind
    for (let i = gs.missiles.length - 1; i >= 0; i--) {
        const m = gs.missiles[i]
        m.t -= 1
        if (!frozen && m.t > 240) {
            const th = nearestPilot(gs, m.x, m.y) // S4: hunters chase the nearer hull
            const want = Math.atan2(th.y - m.y, th.x - m.x)
            let da = want - m.a
            while (da > Math.PI) da -= Math.PI * 2
            while (da < -Math.PI) da += Math.PI * 2
            m.a += clamp(da, -0.035, 0.035)
            if (m.spd < 1.35) m.spd += 0.0032
        }
        m.x += Math.cos(m.a) * m.spd
        m.y += Math.sin(m.a) * m.spd
        if (m.t <= 0 || m.x < gs.camX - 14 || m.x > gs.camX + W + 14 || m.y < FIELD_TOP - 6 || m.y > FIELD_BOT + 6) { gs.missiles.splice(i, 1); continue }
        if (!frozen && gs.pod && Math.abs(m.x - gs.pod.x) < 9 && Math.abs(m.y - gs.pod.y) < 8) { gs.missiles.splice(i, 1); gs.lastHitX = m.x; gs.lastHitY = m.y; gs.events.push('plug'); continue }
        if (!frozen && shieldOn(gs)) {
            let deflected = false
            for (const bt of gs.bits) {
                if (Math.abs(m.x - bt.px) < BIT.rad + 1 && Math.abs(m.y - bt.py) < BIT.rad) {
                    // #2831: a hunter swatted out of the sky bursts AT THE BIT —
                    // cyan ring at the point of the hit, and the bit strains white
                    bt.flash = 10
                    gs.missiles.splice(i, 1); gs.lastHitX = bt.px; gs.lastHitY = bt.py; gs.events.push('deflect'); gs.events.push('hunterring'); deflected = true; break
                }
            }
            if (deflected) continue
        }
        if (!frozen && gs.wing && !gs.wing.out && gs.wing.pod && Math.abs(m.x - gs.wing.pod.x) < 9 && Math.abs(m.y - gs.wing.pod.y) < 8) { gs.missiles.splice(i, 1); gs.lastHitX = m.x; gs.lastHitY = m.y; gs.events.push('plug'); continue }
        if (!frozen && gs.wing && !gs.wing.out && shieldOnAt(gs.wing)) {
            let dfl = false
            for (const bt of gs.wing.bits) {
                if (Math.abs(m.x - bt.px) < BIT.rad + 1 && Math.abs(m.y - bt.py) < BIT.rad) {
                    bt.flash = 10 // #2831: the ring belongs to the bit, both seats
                    gs.missiles.splice(i, 1); gs.lastHitX = bt.px; gs.lastHitY = bt.py; gs.events.push('deflect'); gs.events.push('hunterring'); dfl = true; break
                }
            }
            if (dfl) continue
        }
        if (!frozen && sAlive && s.inv <= 0 && Math.abs(m.x - s.x) < 7 && Math.abs(m.y - s.y) < 6) { gs.missiles.splice(i, 1); killShip(gs, s, gs, 'missile'); return }
        const wgM = gs.wing
        if (!frozen && wgM && !wgM.out && !wgM.dead && wgM.inv <= 0 && Math.abs(m.x - wgM.x) < 7 && Math.abs(m.y - wgM.y) < 6) { gs.missiles.splice(i, 1); killWing(gs, wgM, 'missile') }
    }

    // --- pod ram: the shell crushes soft Bydo before they reach the pilot;
    // armour was already refused the pod above and stays untouched
    if (!frozen && gs.pod) podRamInto(gs, gs.pod)
    if (!frozen && gs.wing && !gs.wing.out && !gs.wing.dead && gs.wing.pod) podRamInto(gs, gs.wing.pod)

    // --- the shield also grinds: soft Bydo meet the rotating fist and break
    if (!frozen && shieldOn(gs)) shieldGrind(gs, gs.ship, gs.bits)
    if (!frozen && gs.wing && !gs.wing.out && !gs.wing.dead && shieldOnAt(gs.wing)) shieldGrind(gs, gs.wing, gs.wing.bits)

    // --- bodies vs the ship (tiny core hitbox, honest dread)
    if (!frozen && sAlive && s.inv <= 0) {
        for (const e of gs.enemies) {
            let hit = false
            if (e.kind === 'larva') hit = Math.abs(e.x - s.x) < 9 && Math.abs(e.y - s.y) < 7
            else if (e.kind === 'turret') hit = Math.abs(e.x - s.x) < 9 && Math.abs(e.y - s.y) < 8
            else if (e.kind === 'pod') hit = Math.abs(e.x - s.x) < 11 && Math.abs(e.y - s.y) < 9
            else if (e.kind === 'bitpod') hit = Math.abs(e.x - s.x) < 12 && Math.abs(e.y - s.y) < 10
            else if (e.kind === 'hullseg') hit = s.x + 5 > e.x && s.x - 5 < e.x + e.len && s.y + 4 > e.y0 && s.y - 4 < e.y1
            if (hit) { if (killShip(gs, s, gs, 'body:' + e.kind)) return }
        }
        if (p1 && p1.dyingT === 0 && p1.x < gs.camX + W - 4 && s.x + 5 > p1.x + 4) {
            // the bio-ship's flank is a death wall, top to bottom
            if (killShip(gs, s, gs, 'hull')) return
        }
        if (p2 && p2.dyingT === 0 && p2.x < gs.camX + W - 4 && s.x + 5 > p2.x + 4) {
            // the fortress keeps the same law: its face is a wall
            if (killShip(gs, s, gs, 'fortress')) return
        }
    }
    // ...and the same walls hold for seat two (S4) — its death hangs its own
    // wreck, never the run
    const wgBody = gs.wing
    if (!frozen && wgBody && !wgBody.out && !wgBody.dead && wgBody.inv <= 0) {
        for (const e of gs.enemies) {
            let hit = false
            if (e.kind === 'larva') hit = Math.abs(e.x - wgBody.x) < 9 && Math.abs(e.y - wgBody.y) < 7
            else if (e.kind === 'turret') hit = Math.abs(e.x - wgBody.x) < 9 && Math.abs(e.y - wgBody.y) < 8
            else if (e.kind === 'pod') hit = Math.abs(e.x - wgBody.x) < 11 && Math.abs(e.y - wgBody.y) < 9
            else if (e.kind === 'bitpod') hit = Math.abs(e.x - wgBody.x) < 12 && Math.abs(e.y - wgBody.y) < 10
            else if (e.kind === 'hullseg') hit = wgBody.x + 5 > e.x && wgBody.x - 5 < e.x + e.len && wgBody.y + 4 > e.y0 && wgBody.y - 4 < e.y1
            if (hit) { killWing(gs, wgBody, 'body:' + e.kind); break }
        }
        if (wgBody.dead) return // the wing hung — its hull reads the same walls
        if (p1 && p1.dyingT === 0 && p1.x < gs.camX + W - 4 && wgBody.x + 5 > p1.x + 4) killWing(gs, wgBody, 'hull')
        else if (p2 && p2.dyingT === 0 && p2.x < gs.camX + W - 4 && wgBody.x + 5 > p2.x + 4) killWing(gs, wgBody, 'fortress')
    }
}

// ---- seat two (S4) ----------------------------------------------------------
// Reusable per-hull laws, shared by the shell and the wing so the two pilots
// obey exactly the same physics the S1–S3 pins established.

function podRamInto(gs, pd) {
    for (let i = gs.enemies.length - 1; i >= 0; i--) {
        const e = gs.enemies[i]
        if (e.kind === 'hullseg') continue
        const rx = e.kind === 'larva' ? 10 : e.kind === 'pod' ? 12 : e.kind === 'bitpod' ? 13 : 10
        const ry = e.kind === 'larva' ? 8 : e.kind === 'bitpod' ? 10 : 9
        if (Math.abs(e.x - pd.x) < rx && Math.abs(e.y - pd.y) < ry) {
            e.hp -= 3
            gs.lastHitX = e.x; gs.lastHitY = e.y; gs.events.push('ram')
            if (e.hp <= 0) {
                gs.enemies.splice(i, 1)
                addScore(gs, e.kind === 'larva' ? 100 : e.kind === 'turret' ? 200 : e.kind === 'bitpod' ? 400 : 300)
                gs.events.push('boom')
                if (e.kind === 'bitpod') releaseBits(gs, e) // shell-down carriers spill too
            }
        }
    }
}

function shieldGrind(gs, ship, bits) {
    for (let i = gs.enemies.length - 1; i >= 0; i--) {
        const e = gs.enemies[i]
        if (e.kind !== 'larva') continue
        for (const bt of bits) {
            if (Math.abs(e.x - bt.px) < BIT.crushR && Math.abs(e.y - bt.py) < BIT.crushR) {
                bt.flash = Math.max(bt.flash ?? 0, 5) // #2831: grinding a body, the bit visibly strains
                e.hp -= 3
                gs.lastHitX = e.x; gs.lastHitY = e.y; gs.events.push('ram')
                if (e.hp <= 0) {
                    gs.enemies.splice(i, 1)
                    addScore(gs, 100)
                    gs.events.push('boom')
                }
                break
            }
        }
    }
}

// The wing's whole turn: its own death rite, station-keeping, fire discipline,
// shell and chain. Runs whether or not seat one is breathing — only the both-
// cockpit wipe freezes it (frozen), and even then its wreck keeps counting.
function runWing(gs, pad2, frozen) {
    const w = gs.wing
    if (!w) return
    if (w.dead && !w.out) {
        w.dyingT -= 1
        if (w.dyingT <= 0) {
            if (w.lives > 0) respawnWing(gs)
            else { w.out = true; gs.events.push('winglost'); gs.wingLostAt = gs.tick }
        }
        return
    }
    if (w.out) return
    refreshBitsOn(w, w.bits, gs.tick)
    if (w.x < gs.camX + 2) w.x = gs.camX + 2
    if (w.x > gs.camX + W - 10) w.x = gs.camX + W - 10
    if (!frozen && w.x - CFG.crushX <= gs.camX && killWing(gs, w, 'crush')) return

    const pad = w.human && pad2 ? pad2 : wingBrain(gs)
    const wB = !!pad.b && !w.bHeld // pod is a press-verb here too
    w.bHeld = !!pad.b
    if (w.inv > 0) w.inv -= 1
    w.anim += 1
    if (w.cd > 0) w.cd -= 1

    if (!frozen) {
        if (pad.left) w.x -= CFG.shipSpeed
        if (pad.right) w.x += CFG.shipSpeed
        if (pad.up) w.y -= CFG.shipSpeed
        if (pad.down) w.y += CFG.shipSpeed
        w.y = clamp(w.y, FIELD_TOP + 6, FIELD_BOT - 4)
        w.x = clamp(w.x, gs.camX + 2, gs.camX + W - 10)

        if (w.weapon === 'vulcan') {
            if (pad.a && w.cd <= 0) {
                gs.shots.push({ id: gs.nextId++, x: w.x + 12, y: w.y - 1, kind: 'v', size: 0, pierce: false, hit: [], vy: 0 })
                // the #2831 bit×arm matrix generalizes to seat two: the wing's
                // chain fans and widens its own streams
                for (const bt of w.bits) {
                    const by = bt.py ?? w.y
                    gs.shots.push({ id: gs.nextId++, x: (bt.px ?? w.x) + 10, y: by - 1, kind: 'v', size: 0, pierce: false, hit: [], vy: clamp((by - w.y) * 0.045, -0.5, 0.5) })
                }
                w.cd = CFG.vulcanCd
                gs.events.push('shot')
            }
        } else if (w.weapon === 'laser') {
            if (pad.a) { if (w.charge < CFG.waveMax) w.charge += 1 }
            else if (w.charge > 0) {
                if (w.charge >= POD.laserMin) {
                    const tier = w.charge >= 50 ? 2 : w.charge >= 25 ? 1 : 0
                    gs.shots.push({ id: gs.nextId++, x: w.x + 12, y: w.y - 1, kind: 'l', size: tier, pierce: true, hit: [], wy: w.bits.length })
                    gs.events.push('laser')
                }
                w.charge = 0
            }
        } else {
            if (pad.a) { if (w.charge < CFG.waveMax) w.charge += 1 }
            else if (w.charge > 0) {
                if (w.charge >= CFG.waveMin) {
                    const tier = w.charge >= 50 ? 2 : w.charge >= 25 ? 1 : 0
                    gs.shots.push({ id: gs.nextId++, x: w.x + 10, y: w.y, kind: 'w', size: tier, pierce: true, hit: [], hx: w.bits.length })
                    gs.events.push('wave')
                }
                w.charge = 0
            }
        }
    }

    // its own S.E.E.D.: the same state machine as seat one — plug, deploy,
    // park, recall, armour refusal, and the wall grinding a shell left behind
    const pd = w.pod
    if (pd) {
        if (pd.grace > 0) pd.grace -= 1
        if (!frozen && wB) {
            if (pd.state === 'attached') { pd.state = 'fly'; pd.grace = POD.dockGrace; gs.events.push('podlaunch') }
            else if (pd.state !== 'return') pd.state = 'return'
        }
        if (pd.state === 'attached') { pd.x = w.x + POD.noseX; pd.y = w.y }
        else if (pd.state === 'fly') {
            pd.x += POD.launch
            if (pd.x >= gs.camX + W - POD.parkPad) { pd.x = gs.camX + W - POD.parkPad; pd.state = 'park' }
        }
        if (!frozen && (pd.state === 'fly' || pd.state === 'park') && !(pd.grace > 0) &&
            Math.hypot(pd.x - w.x, pd.y - w.y) <= POD.dock) { pd.state = 'attached'; gs.events.push('poddock') }
        if (pd.state === 'return') {
            const dx = w.x + POD.noseX - pd.x, dy = w.y - pd.y
            const m = Math.max(1e-6, Math.hypot(dx, dy))
            if (m <= POD.dock) { pd.state = 'attached'; gs.events.push('poddock') }
            else { pd.x += (dx / m) * POD.recall; pd.y += (dy / m) * POD.recall }
        }
        if (pd.state !== 'attached') {
            for (const e of gs.enemies) {
                if (e.kind !== 'hullseg') continue
                if (pd.x + POD.rad > e.x && pd.y > e.y0 - 4 && pd.y < e.y1 + 4) {
                    gs.events.push('strain'); pd.x = e.x - POD.rad
                    if (pd.state === 'fly') pd.state = 'park'
                }
            }
            if (gs.p1 && gs.p1.dyingT === 0 && pd.x + POD.rad > gs.p1.x && pd.y > 34 && pd.y < 200) { gs.events.push('strain'); pd.x = gs.p1.x - POD.rad }
            if (gs.p2 && gs.p2.dyingT === 0 && pd.x + POD.rad > gs.p2.x && pd.y > 34 && pd.y < 200) { gs.events.push('strain'); pd.x = gs.p2.x - POD.rad }
            if (pd.x < gs.camX - 6) { w.pod = null; gs.events.push('podlost') }
        }
    }
}

// The default wing pilot (S4): station behind seat one, opposite lane, lanes
// scored the same potential-field way the attract brain uses — but PURE tick
// arithmetic, zero gs.rng draws: the tuned stream and every S1–S3 law stay
// byte-identical the moment a co-op run starts.
export function wingBrain(gs) {
    const pad = { left: false, right: false, up: false, down: false, a: false, b: false }
    const w = gs.wing
    if (!w || w.out || w.dead || w.human || gs.mode !== 'play') return pad
    const s = gs.ship
    const p1down = s.dead || s.out
    const tx = p1down ? gs.camX + WING.stationX : s.x - WING.backX
    const sy = p1down ? 120 : s.y
    const ty0 = clamp(sy < 120 ? sy + WING.laneGap : sy - WING.laneGap, FIELD_TOP + 8, FIELD_BOT - 8)

    const riskAt = (y) => {
        let risk = 999
        const consider = (t) => { if (t > 0 && t < risk) risk = t }
        for (const b of gs.bullets) {
            if (b.x - w.x < -4 || b.vx >= 0) continue
            const t = (w.x - b.x) / (-b.vx + 0.45)
            if (t < 34 && Math.abs(b.y + b.vy * t - y) < 10) consider(t)
        }
        for (const e of gs.enemies) {
            if (e.kind === 'larva') {
                if (e.state === 'dive' && e.vx < 0 && e.x > w.x - 6) {
                    const t = (w.x - e.x) / (-e.vx + 0.45)
                    if (t < 40 && Math.abs(e.y + e.vy * t - y) < 12) consider(t)
                } else if (e.x > w.x) {
                    const t = (e.x - w.x) / 1.6
                    if (t < 44 && Math.abs(e.baseY + Math.sin(e.sine + t * 0.08) * 22 - y) < 10) consider(t)
                }
            }
            if (e.kind === 'hullseg' && w.x + 6 > e.x - 16 && w.x < e.x + e.len && y > e.y0 - 12 && y < e.y1 + 12) consider(0.5)
            if ((e.kind === 'turret' || e.kind === 'pod' || e.kind === 'bitpod') && Math.abs(e.x - w.x) < 30 && Math.abs(e.y - y) < 22) consider(0.5)
        }
        for (const m of gs.missiles) {
            const dx = m.x - w.x
            if (dx < -6) { consider(Math.max(1, -dx / (m.spd + 0.6))); continue }
            if (dx > 150) continue
            const t = dx / m.spd
            if (t < 40 && Math.abs(m.y - y) < 12 + t * 0.06) consider(t * 0.7)
        }
        return risk
    }

    const cands = [ty0, w.y]
    if (riskAt(ty0) < 14) {
        cands.push(clamp(w.y + (w.y < sy ? -24 : 24), FIELD_TOP + 8, FIELD_BOT - 8))
        cands.push(clamp(ty0 + (ty0 < 120 ? 34 : -34), FIELD_TOP + 8, FIELD_BOT - 8))
    }
    let bestY = ty0, bestV = -Infinity
    for (const cy of cands) {
        const v = riskAt(cy) - Math.abs(cy - ty0) * 0.15
        if (v > bestV) { bestV = v; bestY = cy }
    }
    const dy = bestY - w.y
    pad.up = dy < -1.2
    pad.down = dy > 1.2

    const dxw = w.x - tx
    pad.right = dxw < -4
    pad.left = dxw > 4
    if (w.x - gs.camX < WING.crushSafe) { pad.right = true; pad.left = false }
    if (gs.p1 && gs.p1.dyingT === 0 && gs.p1.x - w.x < 84) pad.right = false
    if (gs.p2 && gs.p2.dyingT === 0 && gs.p2.x - w.x < 84) pad.right = false

    // trigger discipline: vulcan streams; charge arms loose when its lane breathes
    pad.a = w.weapon === 'vulcan' ? true : riskAt(w.y) > 18
    return pad
}

// ---- autopilot: the attract pilot; harness proves against the same code ----
// Lane potential field: score the lanes three lanes wide against EVERY threat
// (leading bullets, locked divers, curving hunters, parked bodies, slabs) and
// steer to the safest — never into the lane the last dodge forgot.

export function autopilot(gs) {
    const pad = { left: false, right: false, up: false, down: false, a: false, b: false }
    const s = gs.ship
    if (gs.mode !== 'play' || s.dead) return pad
    const px = s.x, py = s.y
    const p1 = gs.p1
    const p2 = gs.p2

    const lanes = []
    for (const off of [-30, 0, 30]) {
        const y = py + off
        if (y < FIELD_TOP + 8 || y > FIELD_BOT - 6) continue
        let risk = 999
        const consider = (t) => { if (t > 0 && t < risk) risk = t }
        for (const b of gs.bullets) {
            if (b.x - px < -4 || b.vx >= 0) continue
            const t = (px - b.x) / (-b.vx + 0.45)
            if (t < 40 && Math.abs(b.y + b.vy * t - y) < 10) consider(t)
        }
        for (const e of gs.enemies) {
            if (e.kind === 'larva') {
                if (e.state === 'dive' && e.vx < 0 && e.x > px - 6) {
                    const t = (px - e.x) / (-e.vx + 0.45) // closure rides the camera push too
                    if (t < 48 && Math.abs(e.y + e.vy * t - y) < 12) consider(t)
                } else if (e.x > px) {
                    const t = (e.x - px) / 1.6 // closure = its drift + the camera push; the swing keeps swinging
                    if (t < 50 && Math.abs(e.baseY + Math.sin(e.sine + t * 0.08) * 22 - y) < 10) consider(t)
                }
            }
            if (e.kind === 'hullseg' && px + 6 > e.x - 16 && px < e.x + e.len && y > e.y0 - 12 && y < e.y1 + 12) consider(0.5)
            if ((e.kind === 'turret' || e.kind === 'pod' || e.kind === 'bitpod') && Math.abs(e.x - px) < 34 && Math.abs(e.y - y) < 24) consider(0.5)
        }
        for (const m of gs.missiles) {
            const dx = m.x - px
            if (dx < -6) { consider(Math.max(1, -dx / (m.spd + 0.6))); continue }
            if (dx > 160) continue
            const t = dx / m.spd
            if (t < 42 && Math.abs(m.y - y) < 12 + t * 0.06) consider(t * 0.7)
        }
        lanes.push({ y, risk })
    }
    const safe = lanes.filter((l) => l.risk >= 20)
    // an approaching slab owns the station soon: commit to its open side early
    const slab = gs.enemies.find((e) => e.kind === 'hullseg' && px < e.x + e.len + 6 && e.x - px < 56)
    let lane
    if (!safe.length) {
        lane = lanes.reduce((a, b) => (b.risk > a.risk ? b : a), lanes[0] || { y: 118, risk: 0 })
        if (slab) lane = { y: (slab.y0 + slab.y1) / 2 >= 120 ? FIELD_TOP + 10 : FIELD_BOT - 10, risk: lane.risk }
    } else {
        // the great ship: ride the maw lane — hunters curve to you there.
        // in the field: hold a live launcher's lane and cut its birds at the
        // source; chasing individual hunters leaves the gun to stream forever
        let targetY = 118
        let incMis = null
        for (const m of gs.missiles) if (m.x - px > 4 && m.x - px < 170 && (!incMis || m.x < incMis.x)) incMis = m
        let launcher = null
        for (const e of gs.enemies) if (e.kind === 'pod' && e.state !== 'flee' && e.x > px - 6 && (!launcher || e.x < launcher.x)) launcher = e
        if (p1 && p1.dyingT === 0) targetY = 120
        else if (p2 && p2.dyingT === 0) {
            // hunt the open vent; hold mid when both seals hold
            const oi = p2.cores.findIndex((c) => c.hp > 0 && c.mouth === 'open')
            targetY = oi >= 0 ? CORE_Y[oi] + (p2.swayOff || 0) : 120
        }
        else if (launcher) targetY = launcher.y
        else if (incMis) targetY = incMis.y
        else {
            let bestD = 1e9
            for (const e of gs.enemies) {
                if (e.kind === 'hullseg' || e.x <= px + 8) continue
                const d = e.x - px + Math.abs(e.y - py) * 2
                if (d < bestD) { bestD = d; targetY = e.y }
            }
        }
        const pick = [...safe].sort((a, b) => Math.abs(a.y - targetY) - Math.abs(b.y - targetY) || b.risk - a.risk)
        lane = pick[0]
    }

    const dy = lane.y - py
    pad.up = dy < -1.5
    pad.down = dy > 1.5

    // before the great ship: never stand still in the firing solution —
    // strafe the maw lane while vulcan works; dive only when a lane must go
    if (p1 && p1.dyingT === 0 && lane.risk > 20) {
        let dir = gs.tick % 84 < 42 ? -1 : 1
        if (py < FIELD_TOP + 14) dir = 1
        if (py > FIELD_BOT - 12) dir = -1
        pad.up = dir < 0
        pad.down = dir > 0
    }

    // station: hold mid-lead, never drift into the grinder, never board the hull
    const want = gs.camX + (p1 && p1.dyingT === 0 ? 52 : 62)
    pad.right = px - want < -5
    pad.left = px - want > 5
    if (px - gs.camX < 26) { pad.right = true; pad.left = false }
    if (p1 && p1.dyingT === 0 && p1.x - px < 80) pad.right = false
    if (p2 && p2.dyingT === 0 && p2.x - px < 80) pad.right = false

    // trigger discipline: vulcan streams; the charge arms fire when the lane breathes
    if (s.weapon === 'wave' || s.weapon === 'laser') pad.a = lane.risk > 18
    else pad.a = true
    return pad
}

// ---- hash -------------------------------------------------------------------

export function stateHash(gs) {
    let h = 2166136261
    const mix = (v) => { h ^= Math.round(v * 1000) & 0xffffffff; h = Math.imul(h, 16777619) }
    mix(gs.tick); mix(gs.score)
    mix(gs.mode === 'play' ? 1 : gs.mode === 'clear' ? 2 : 3)
    mix(gs.camX); mix(gs.waveIdx)
    const s = gs.ship
    mix(s.x); mix(s.y); mix(gs.lives)
    mix({ vulcan: 0, laser: 1, wave: 2 }[s.weapon] ?? 3); mix(s.charge); mix(s.inv); mix(s.dead ? 1 : 0)
    const pd = gs.pod
    mix(pd ? 1 : 0)
    if (pd) { mix(pd.x); mix(pd.y); mix(pd.state.length); mix(pd.state.charCodeAt(0)) }
    mix(gs.bits.length)
    for (const bt of gs.bits) { mix(bt.px ?? 0); mix(bt.py ?? 0) }
    mix(gs.leg)
    mix(gs.shots.length)
    for (const q of gs.shots) { mix(q.x); mix(q.y); mix(q.kind === 'w' ? q.size + 1 : q.kind === 'l' ? q.size + 4 : 0) }
    mix(gs.bullets.length)
    for (const b of gs.bullets) { mix(b.x); mix(b.y) }
    mix(gs.missiles.length)
    for (const m of gs.missiles) { mix(m.x); mix(m.y); mix(m.a) }
    mix(gs.enemies.length)
    for (const e of gs.enemies) { mix(e.id); mix(e.x); mix(e.y); mix(e.hp === Infinity ? -1 : e.hp); mix(e.state ? e.state.length : 0) }
    mix(gs.caps.length)
    for (const c of gs.caps) { mix(c.x); mix(c.y) }
    mix(gs.p1 ? 1 : 0)
    if (gs.p1) { mix(gs.p1.x); mix(gs.p1.coreHp); mix(gs.p1.mouth.length) }
    mix(gs.p2 ? 1 : 0)
    if (gs.p2) {
        mix(gs.p2.x)
        mix(gs.p2.swayOff); mix(gs.p2.port) // #2835: offense is state — the hash covers it
        for (const c of gs.p2.cores) { mix(c.hp); mix(c.mouth.length); mix(c.enraged ? 1 : 0) }
    }
    const wg = gs.wing // S4 seat two (null => solo: one mix, old-era shape)
    mix(wg ? 1 : 0)
    if (wg) {
        mix(wg.x); mix(wg.y); mix(wg.lives); mix(wg.dead ? 1 : 0); mix(wg.out ? 1 : 0); mix(wg.human ? 1 : 0)
        mix({ vulcan: 0, laser: 1, wave: 2 }[wg.weapon] ?? 3); mix(wg.inv)
        mix(wg.bits.length)
        for (const bt of wg.bits) { mix(bt.px ?? 0); mix(bt.py ?? 0) }
        mix(wg.pod ? 1 : 0)
        if (wg.pod) { mix(wg.pod.x); mix(wg.pod.y); mix(wg.pod.state.length) }
    }
    return h >>> 0
}
