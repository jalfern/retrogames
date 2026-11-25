// PINBALL — CABINET ONE — pure simulation (issue #3103 rung 1, extended by
// #3169 rung 2: right ramp, firelane, lock tower, MULTIBALL).
// Zero DOM, zero Math.random: every physics constant, the table layout and the
// rules are plain data so scripts/pinballcheck.mjs proves the game in Node.
//
// The engine is TABLE-DRIVEN (issue spec: "tables are data on that engine"):
// `stepGame` knows only primitive elements — walls (incl. one-way gates),
// circles (pop bumpers), slings, drop targets, a spinner zone, a kicker zone,
// rollover lanes, a capture pocket, flippers, a plunger, drains — and scores
// them through the table's `rules` map. A new cabinet must never need new
// physics; that is the whole contract of the shared engine. Rung 2 grew the
// ENGINE with the generic primitives (one-way gate, rollover, capture pocket,
// multi-ball loop); CABINET ONE only instantiates them from data.
//
// Physics: fine fixed timestep. The shell ticks at 60 Hz; each tick runs SUB=4
// substeps (240 Hz) of circle-vs-segment/capsule/ball collision, gravity, and
// moving-surface (flipper) response with proper ω×r surface velocity, so flip
// timing decides aim — the rung-1 brief's "get the ball feel right here".
// Ball-vs-ball (#3217): steel never shares space with steel — the pack resolves
// pairwise contacts inside the same substep loop (see packCollide).

export const W = 360;
export const H = 600;
export const BALL_R = 9;
export const GRAV = 900;              // px/s² — arcade-fast but readable in portrait
export const SUB = 4;                // physics substeps per 60 Hz tick (240 Hz)
export const WALL_E = 0.52;          // wall restitution
export const WALL_FR = 0.06;        // wall tangential friction
export const BALL_E = 0.8;           // steel-on-steel restitution (#3217) — hard,
                                     // not perfect: a clack loses a little of itself

// ------------------------------------------------------- rng ----
export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ------------------------------------------------------- the table ----
// CABINET ONE: an early solid-state style table (Black Knight, Williams 1978 —
// our own look, own name): 3 pop bumpers, 2 slingshots, a 4-target drop bank
// feeding a bonus ladder, a spinner + kicker left outlane, plunge lane right,
// two flippers, nudge with tilt-out. 3 balls.
// Rung 2 (#3169, the Firepower idiom): RAMP rollovers in the launch lane
// (shoot the lane upward), a descending FIRELANE down the dome's right flank
// behind a one-way gate, three LANE rollovers into a LOCK TOWER — lock 3 and
// the tower kicks MULTIBALL.
export const TABLE = {
    id: 'cabinet-one',
    balls: 3,
    // Outer shell. oneWay:true collides only from the side the (dy,-dx)
    // normal faces — a ball on the other side passes freely. Used for the
    // firelane top gate (descending balls enter the lane, rising balls bounce
    // back down it) and the firelane inner guide (playfield balls cross over
    // the lane mouth; lane balls stay roped).
    walls: [
        // left wall
        { x1: 10, y1: 160, x2: 10, y2: 540 },
        // bottom-left apron to the flipper pivot
        { x1: 10, y1: 540, x2: 112, y2: 552 },
        // right (lane outer) wall
        { x1: 350, y1: 160, x2: 350, y2: 562 },
        // lane bottom (plunger tip rest) — e=0: the ball sits on it
        { x1: 322, y1: 564, x2: 350, y2: 564, e: 0.0 },
        // lane inner wall, solid; the ball leaves the lane ABOVE it over the arc
        { x1: 322, y1: 160, x2: 322, y2: 545 },
        // apron from the right flipper pivot back to the lane
        { x1: 256, y1: 552, x2: 322, y2: 545 },
        // ---- rung 2: firelane (descending lane, x 298..322, dome's right flank)
        // inner guide — solid both sides: the lane is entered only from the top
        // (around the dome), never crossed sideways off the playfield.
        { x1: 298, y1: 195, x2: 298, y2: 470 },
        // top gate — one-way: collides only from BELOW (a rising lane ball
        // bounces back down the lane); a ball descending from the dome passes.
        { x1: 322, y1: 190, x2: 298, y2: 190, oneWay: true },
        // ---- rung 3: orbit channel guide (x=40, parallel to the left wall).
        // The gap x 10..40 is one lane, two directions: downward it stays the
        // spinner/kicker outlane; upward it is the orbit's climbing rail.
        { x1: 40, y1: 320, x2: 40, y2: 415 },
    ],
    // Top arc: ellipse centre (180,160), rx 170, ry 150, sampled θ = π → 2π.
    arc: { cx: 180, cy: 160, rx: 170, ry: 150, from: Math.PI, to: 2 * Math.PI, segs: 14 },
    // Pop bumpers — kick + flash + pop, per-hit cooldown so one touch scores once
    bumpers: [
        { x: 115, y: 185, r: 15 },
        { x: 180, y: 150, r: 15 },
        { x: 245, y: 185, r: 15 },
    ],
    // Slingshots — the classic V of rubbers above the flippers
    slings: [
        { x1: 75, y1: 452, x2: 128, y2: 500 },
        { x1: 285, y1: 452, x2: 232, y2: 500 },
    ],
    // Drop-target bank: 4 targets in a row at y=300
    targets: [
        { x1: 118, x2: 148 }, { x1: 154, x2: 184 },
        { x1: 190, x2: 220 }, { x1: 226, x2: 256 },
    ],
    targetY: 300,
    // Left outlane: guide wall, spinner zone (ticks per fall-through),
    // kicker that rockets the ball back into play. Rung 3: the kicker aims
    // up the orbit channel — outlane rescue feeds the wrap (classic loop).
    outlaneGuide: { x1: 52, y1: 420, x2: 30, y2: 505 },
    // side: +1 = the zone lies LEFT of xMax (classic left outlane); -1 reads
    // it as RIGHT of xMax (#3232: CABINET TWO runs the outlane on the right).
    spinner: { xMax: 46, side: 1, yFrom: 440, yTo: 496, pxPerTurn: 22 },
    kicker: { xMax: 46, side: 1, yAt: 498, vx: 10, vy: -880 },
    // KICKBACK (#3250): the free ball-saver at the RIGHT half of the drain
    // mouth — past-the-right-tip misses die here on a lane-side table (Eight
    // Ball Deluxe idiom — Williams 1981). One free save per ball: a ball
    // descending fast through the gap column is fired back up the field
    // instead of draining, pays its own price, and the device stays spent
    // until the next ball (minVy keeps resting balls off the plunger).
    kb: { x1: 190, x2: 205, yFrom: 552, yTo: 604, minVy: 150, vx: -40, vy: -900 },
    // ---- rung 2 primitives (data; the engine only knows the shapes) ----
    // RAMP rollovers: crossed UPWARD inside the launch lane (x 326..346).
    rampRollovers: [{ y: 250 }, { y: 330 }],
    // LANE rollovers: crossed DOWNWARD inside the firelane (x 302..318).
    laneRollovers: [{ y: 250 }, { y: 310 }, { y: 370 }],
    laneX: { x1: 302, x2: 318 },
    // Lock tower mouth: a ball descending through it is captured.
    lock: { x1: 298, x2: 322, yAt: 440, need: 3 },
    // LAUNCH LANE geometry (#3232): the engine's lane literals (in-lane test,
    // guide-curl, RAMP rollover zone) read from here so a cabinet may run the
    // lane on either flank. side +1 = lane RIGHT of innerX (classic);
    // curlVx pushes a launched ball toward the dome (negative = leftward).
    lane: { innerX: 322, side: 1, bottomY: 515, mouthY: 170, curlVx: -150, rampZone: { x1: 326, x2: 346 } },
    // Multiball release: three balls kicked from the tower onto the OPEN
    // playfield left of the lane guide (never back into the firelane), arcing
    // left over the bumper cluster. Deterministic — no rng in the kick.
    mbKick: [
        { x: 285, y: 170, vx: -80, vy: -160 },
        { x: 276, y: 152, vx: -110, vy: -130 },
        { x: 286, y: 185, vx: -50, vy: -190 },
    ],
    // Ball-save: the first drain within this window of MULTIBALL auto-relaunches.
    saveTicks: 300,
    // ---- rung 3 primitives (data; the engine only knows the shapes) ----
    // ORBIT: a directional pad pair + a flank curl. Crossing the arm pad
    // UPWARD inside the left channel arms the loop; the curl (mirrors the
    // launch-lane guide-curl law) sails the ball over the dome apex; crossing
    // the done pad DOWNWARD on the right flank completes it and the descent
    // lands on the firelane top gate — an orbit chains straight into locks.
    // A short wrap falls back down the channel into the spinner/kicker: retry.
    orbit: {
        armPad: { x: 40, y: 120 }, armW: 26,
        donePad: { x: 290, y: 120 }, doneW: 45,
        // curl side: +1 = the assist fires LEFT of xMax (climbing the left
        // flank); -1 mirrors it for a right-flank climb (#3232).
        curl: { xMax: 110, side: 1, yAt: 160, vx: 280 },
        // ch: the climbing channel — centre x + side (+1 hugs the LEFT wall).
        ch: { cx: 25, side: 1 },
        need: 3,
    },
    // MAGNET: a charged post. While charged, a ball inside `field` is pulled
    // to the post (MAG_PULL px/s²), clamped at its face and held `hold`
    // ticks; release pays. The charge dies with the hold and re-arms only
    // when a ball that touched the field drains — magnet play costs risk.
    // Sitting right-mid between bank and slings, it snares dome-rebounds and
    // firelane spills, and its 33 px reach is clear of every rung-1/2 probe
    // lane, the orbit channel and the DMD insert.
    magnet: { x: 240, y: 350, r: 10, field: 24, hold: 72, pull: 1500 },
    // Flippers: pivots, length, half thickness, rest/up angles (degrees).
    flippers: {
        pivotY: 552, len: 58, halfW: 7,
        L: { px: 112, rest: 30, up: -32 },
        R: { px: 256, rest: 150, up: 212 },
        upRate: 45, downRate: 30,          // degrees per 60 Hz tick
    },
    // Plunger: power varies how HARD the ball arrives (860..1010 px/s) — every
    // committed release clears the lane, the way a real spring plunger feeds the
    // 1-ball. Sub-threshold taps don't fire; an idle lane auto-plunges.
    plunger: { x: 336, restY: 555, chargeRate: 1.35, minV: 860, maxV: 1010, autoTicks: 240, autoPower: 0.9 },
    drainY: 610,
    tilt: { max: 3, decayTicks: 54 },     // 3 nudges → tilt; ~0.9 s between allowed
    rules: {                            // scoring through the ladder, all literals live in the check
        bumper: 100, sling: 25, target: 50, bankClear: 250,
        spinner: 10, kicker: 100, kb: 100, bonusPerTarget: 50, multCap: 5,
        ramp: 25, rampSet: 500, lane: 25, laneSweep: 100,
        lock: 500, multiball: 1000, mbDouble: 2,
        orbit: 100, orbitSet: 500, magnet: 50,
    },
};

// ------------------------------------------------- CABINET TWO (#3232) ----
// EMBER RIDER — the left-lane mirror build of the SAME primitive set. Every
// coordinate is W-x of CABINET ONE's (endpoints swapped where a one-way
// normal or index mapping matters); physics is x-mirror equivariant, so the
// machine is proven by the mirror runs in pinballcheck, not re-tuned. What
// differs by DESIGN: its own economy (hotter spins/ramps/orbit, bigger
// jackpot, tighter tilt and a shorter ball-save), its left-hand launch and an
// ember/amber skin. Adds data, never physics (#3103 contract).
export const TABLE_TWO = {
    id: 'ember-rider',
    balls: 3,
    walls: [
        // right wall (cab-one's left)
        { x1: 350, y1: 160, x2: 350, y2: 540 },
        // bottom-right apron to the right flipper pivot
        { x1: 350, y1: 540, x2: 248, y2: 552 },
        // left (lane outer) wall
        { x1: 10, y1: 160, x2: 10, y2: 562 },
        // lane bottom (plunger tip rest) — e=0: the ball sits on it
        { x1: 10, y1: 564, x2: 38, y2: 564, e: 0.0 },
        // lane inner wall, solid; the ball leaves the lane ABOVE it over the arc
        { x1: 38, y1: 160, x2: 38, y2: 545 },
        // apron from the left flipper pivot back to the lane
        { x1: 104, y1: 552, x2: 38, y2: 545 },
        // ---- firelane (descending lane, x 38..62, dome's LEFT flank)
        // inner guide — solid both sides: entered only from the top.
        { x1: 62, y1: 195, x2: 62, y2: 470 },
        // top gate — one-way (endpoint swap flips the (dy,-dx) face to match
        // cab-one's downward-facing gate under mirroring).
        { x1: 62, y1: 190, x2: 38, y2: 190, oneWay: true },
        // ---- orbit channel guide (x=320): the lane, two directions — down
        // the spinner/kicker outlane, up the climbing rail.
        { x1: 320, y1: 320, x2: 320, y2: 415 },
    ],
    arc: { cx: 180, cy: 160, rx: 170, ry: 150, from: Math.PI, to: 2 * Math.PI, segs: 14 },
    bumpers: [
        { x: 245, y: 185, r: 15 },
        { x: 180, y: 150, r: 15 },
        { x: 115, y: 185, r: 15 },
    ],
    slings: [
        { x1: 285, y1: 452, x2: 232, y2: 500 },
        { x1: 75, y1: 452, x2: 128, y2: 500 },
    ],
    targets: [
        { x1: 212, x2: 242 }, { x1: 176, x2: 206 },
        { x1: 140, x2: 170 }, { x1: 104, x2: 134 },
    ],
    targetY: 300,
    outlaneGuide: { x1: 308, y1: 420, x2: 330, y2: 505 },
    spinner: { xMax: 314, side: -1, yFrom: 440, yTo: 496, pxPerTurn: 22 },
    kicker: { xMax: 314, side: -1, yAt: 498, vx: -10, vy: -880 },
    // kickback, exact W-x mirror of CABINET ONE's pocket (#3250, #3103 contract)
    kb: { x1: 155, x2: 170, yFrom: 552, yTo: 604, minVy: 150, vx: 40, vy: -900 },
    rampRollovers: [{ y: 250 }, { y: 330 }],
    laneRollovers: [{ y: 250 }, { y: 310 }, { y: 370 }],
    laneX: { x1: 42, x2: 58 },
    lane: { innerX: 38, side: -1, bottomY: 515, mouthY: 170, curlVx: 150, rampZone: { x1: 14, x2: 34 } },
    lock: { x1: 38, x2: 62, yAt: 440, need: 3 },
    mbKick: [
        { x: 75, y: 170, vx: 80, vy: -160 },
        { x: 84, y: 152, vx: 110, vy: -130 },
        { x: 74, y: 185, vx: 50, vy: -190 },
    ],
    saveTicks: 240,
    orbit: {
        armPad: { x: 320, y: 120 }, armW: 26,
        donePad: { x: 70, y: 120 }, doneW: 45,
        curl: { xMax: 250, side: -1, yAt: 160, vx: -280 },
        ch: { cx: 335, side: -1 },
        need: 3,
    },
    magnet: { x: 120, y: 350, r: 10, field: 24, hold: 72, pull: 1500 },
    flippers: {
        pivotY: 552, len: 58, halfW: 7,
        L: { px: 104, rest: 30, up: -32 },
        R: { px: 248, rest: 150, up: 212 },
        upRate: 45, downRate: 30,
    },
    plunger: { x: 24, restY: 555, chargeRate: 1.35, minV: 860, maxV: 1010, autoTicks: 210, autoPower: 0.9 },
    drainY: 610,
    tilt: { max: 3, decayTicks: 42 },     // hotter table tilts sooner (~0.7 s)
    rules: {
        bumper: 75, sling: 30, target: 50, bankClear: 300,
        spinner: 15, kicker: 75, kb: 75, bonusPerTarget: 50, multCap: 4,
        ramp: 30, rampSet: 600, lane: 30, laneSweep: 150,
        lock: 400, multiball: 1200, mbDouble: 2,
        orbit: 150, orbitSet: 600, magnet: 75,
    },
};

export const CABINETS = [TABLE, TABLE_TWO];
export const cabIndexOf = (id) => Math.max(0, CABINETS.findIndex((t) => t.id === id));

// ---- view geometry (presentation-only, derived once from table DATA) ----
// Every point the shell/art layer used to hardcode for a right-lane table is
// computed here from the table's own primitives, so both cabinets draw
// correctly from one shared renderer. side: +1 lane/channel on the right
// (lane) or hugging the left wall (orbit ch) per each field's comment.
function buildView(tb) {
    const S = tb.lane.side
    const O = tb.orbit.ch
    const bank = tb.targets
    // #3284: a smithed table may skip the bank — its presentation anchors
    // collapse to the field centre (nothing draws against an empty bank).
    const bankMin = bank.length ? Math.min(bank[0].x1, bank[bank.length - 1].x1) : 180
    const bankMax = bank.length ? Math.max(bank[0].x2, bank[bank.length - 1].x2) : 180
    return {
        laneCx: (tb.laneX.x1 + tb.laneX.x2) / 2,
        rampCx: (tb.lane.rampZone.x1 + tb.lane.rampZone.x2) / 2,
        bankCx: (bankMin + bankMax) / 2,
        meterX: tb.plunger.x - 36 * S,                    // plunger power bar
        towerX1: tb.lock.x1 - 2, towerX2: tb.lock.x2 + 2,
        towerIn1: tb.lock.x1 + 4, towerIn2: tb.lock.x2 - 4,
        lockCx: (tb.lock.x1 + tb.lock.x2) / 2, lockTop: tb.lock.yAt - 6, lockBase: tb.lock.yAt + 30,
        lampX0: (tb.lock.x1 + tb.lock.x2) / 2 - 7, lampY: tb.lock.yAt + 12,
        railCx: O.cx, railOut: O.cx - 15 * O.side, railIn: O.cx + 15 * O.side,
        chevSplay: 10, chevSplay2: 9,
        spinnerX: O.cx - 1 * O.side,
        outMouthX1: O.cx - 15 * O.side, outMouthX2: O.cx + 19 * O.side, outMouthTip: O.cx + 1 * O.side,
        orbitLampX0: O.side === 1 ? 150 : W - 150 - (tb.orbit.need - 1) * 12,
        laneBedX: Math.min(tb.laneX.x1, tb.laneX.x2) - 4, laneBedW: Math.abs(tb.laneX.x2 - tb.laneX.x1) + 8,
        railBedX: O.cx - 12, railBedW: 24,
        railX1: O.cx - 15 * O.side + 2, railX2: O.cx + 15 * O.side - 2,
        chTop: 128, chBot: 415,               // the climbing channel's art band
        lockGlowY: tb.lock.yAt + 5,
        lockLampStep: 7, lockLampR: 2.6,
    }
}
TABLE.view = buildView(TABLE)
TABLE_TWO.view = buildView(TABLE_TWO)

// ----------------------------------------------------- game state ----
export function makeGame(seed = 1, cab = 0) {
    // #3284: `cab` may also BE the table — a player-built cabinet from the
    // TABLE SMITH editor enters the same game factory as a shelf index.
    const tb = cab && typeof cab === 'object' ? cab : (CABINETS[cab] || TABLE)
    const p0 = newPuck(tb.plunger.x, tb.plunger.restY, 0, 0);
    const gs = {
        seed: seed >>> 0, rng: mulberry32((seed >>> 0) ^ 0x9e3779b9),
        table: tb,
        tick: 0, score: 0, balls: tb.balls, done: false, phase: 'play',
        pucks: [p0],
        launched: false, plungerHold: false, power: 0, plungerNotch: 0, powerZone: 0, laneIdle: 0, laneCurved: false,
        ang: { L: tb.flippers.L.rest, R: tb.flippers.R.rest },
        angV: { L: 0, R: 0 },
        bumperCd: tb.bumpers.map(() => 0), slingCd: tb.slings.map(() => 0),
        targetDown: tb.targets.map(() => false),
        bankLit: false, bankHits: 0, banksThisBall: 0, mult: 1,
        spinnerTurns: 0,   // per-puck spin/spinArm live on gs.pucks[i]
        kickCd: 0,
        kbUsed: false, kbFlash: 0,   // #3250: the kickback save — one per ball
        bbCd: 0,           // steel-clack event cooldown in substeps (#3217)
        nudgeMeter: 0, nudgeDecay: 0, tilt: false,
        lastBonus: 0, drainFx: 0,
        lastLeft: false, lastRight: false, lastB: false,
        // ---- rung 2 ----
        locks: 0, multiball: false, extraBall: 0, saveT: 0, saveUsed: false,
        rampHits: 0, rampLit: false,
        // ---- rung 3 ----
        orbits: 0, orbitBank: 0, orbitLit: false, orbitFlash: 0, orbitArmFlash: 0,
        magCharge: 1, magHold: 0, magTouched: false, magFlash: 0, magFreeFlash: 0,
        // DMD message state lives in the SIM so Node can pin the text (#3199)
        msg: { text: '', t: 0, T: 0 },
        // rung-2 flash mirrors (0 until lit; the shell reads these for lamps)
        rampFlash: 0, laneFlash: [0, 0, 0], lockFlash: 0, mbFlash: 0,
        events: [],
    };
    // gs.bx/by/vx/vy/launched/laneCurved stay the PRIMARY-BALL accessors
    // (rung-1 checks and the shell read them): they proxy puck #0.
    proxyBall(gs, 'bx'); proxyBall(gs, 'by'); proxyBall(gs, 'vx'); proxyBall(gs, 'vy');
    proxyFlag(gs, 'launched'); proxyFlag(gs, 'laneCurved');
    return gs;
}

function proxyBall(gs, key) {
    Object.defineProperty(gs, key, {
        get() { return gs.pucks.length ? gs.pucks[0][key] : 0; },
        set(v) { if (gs.pucks.length) gs.pucks[0][key] = v; },
        enumerable: true, configurable: true,
    });
}
function proxyFlag(gs, key) {
    Object.defineProperty(gs, key, {
        get() { return gs.pucks.length ? gs.pucks[0][key] : false; },
        set(v) { for (const p of gs.pucks) p[key] = v; },   // legacy scripts set it game-wide
        enumerable: true, configurable: true,
    });
}

function newPuck(x, y, vx, vy) {
    return { bx: x, by: y, vx, vy, prevY: y, launched: false, laneCurved: false, spin: 0, spinArm: true, laneHits: 0, orbitArmed: false, orbitCurled: false, magHeld: false };
}

export function resetBall(gs) {
    const T = gs.table;
    gs.pucks = [newPuck(T.plunger.x, T.plunger.restY, 0, 0)];
    gs.launched = false; gs.power = 0; gs.plungerNotch = 0; gs.powerZone = 0; gs.laneIdle = 0; gs.plungerHold = false; gs.laneCurved = false;
    gs.targetDown = T.targets.map(() => false); gs.bankLit = false;
    gs.spinnerTurns = 0; gs.tilt = false;
    gs.nudgeMeter = 0; gs.nudgeDecay = 0; gs.mult = 1; gs.banksThisBall = 0;
    gs.kbUsed = false;   // the kickback re-arms with every new ball
    gs.bbCd = 0;
    // rung 2: the tower drops its locks with the ball; the pack ends with it
    gs.locks = 0; gs.multiball = false; gs.saveT = 0; gs.saveUsed = false;
    gs.rampHits = 0; gs.rampLit = false;
    // rung 3: the orbit bank resets with the ball; the magnet re-arms fresh
    gs.orbitBank = 0; gs.orbitLit = false; gs.magCharge = 1; gs.magHold = 0; gs.magTouched = false;
}

const deg = Math.PI / 180;

function segHit(b, x1, y1, x2, y2, halfW, e, fr, oneWay) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1e-9;
    if (oneWay) {
        // Collide only from the side the (dy,-dx) normal faces. A ball on the
        // other side (or crossing away from the face) passes through freely —
        // the gate/guide semantic the rung-1 doc comment always promised.
        const nx0 = dy, ny0 = -dx;
        const side = (b.bx - x1) * nx0 + (b.by - y1) * ny0;
        if (side <= 0) return null;
    }
    let t = ((b.bx - x1) * dx + (b.by - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + dx * t, py = y1 + dy * t;
    let nx = b.bx - px, ny = b.by - py;
    const d2 = nx * nx + ny * ny;
    const rr = BALL_R + halfW;
    if (d2 >= rr * rr || d2 < 1e-12) return null;
    const d = Math.sqrt(d2);
    nx /= d; ny /= d;
    b.bx = px + nx * rr; b.by = py + ny * rr;
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return { nx, ny, t, grazed: true };
    b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
    // tangential friction
    const tx = -ny, ty = nx;
    const vt = b.vx * tx + b.vy * ty;
    b.vx -= vt * fr * tx; b.vy -= vt * fr * ty;
    return { nx, ny, t, vn };
}

function flipperHit(gs, b, side) {
    const T = gs.table;
    const f = T.flippers;
    const px = side === 'L' ? f.L.px : f.R.px;
    const py = f.pivotY;
    const a = gs.ang[side] * deg;
    const tipX = px + Math.cos(a) * f.len, tipY = py + Math.sin(a) * f.len;
    const dx = tipX - px, dy = tipY - py;
    const len2 = dx * dx + dy * dy;
    let t = ((b.bx - px) * dx + (b.by - py) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = px + dx * t, cy = py + dy * t;
    let nx = b.bx - cx, ny = b.by - cy;
    const d2 = nx * nx + ny * ny;
    const rr = BALL_R + f.halfW;
    if (d2 >= rr * rr || d2 < 1e-12) return;
    const d = Math.sqrt(d2);
    nx /= d; ny /= d;
    b.bx = cx + nx * rr; b.by = cy + ny * rr;
    // moving-surface response: surface velocity = ω × r, all in px/s.
    // angV is degrees/SUBSTEP → rad/s is angV·(π/180)·60·SUB.
    const w = gs.angV[side] * deg * 60 * SUB;            // rad/s
    const rx = cx - px, ry = cy - py;
    const svx = -w * ry, svy = w * rx;
    const rvx = b.vx - svx, rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    const e = 0.45;
    let nvx = rvx - (1 + e) * vn * nx;
    let nvy = rvy - (1 + e) * vn * ny;
    // extra flip impulse where the swing meets the ball, scaled by lever arm
    const lever = Math.sqrt(rx * rx + ry * ry);
    const kick = Math.abs(w) * lever * 0.10;
    nvx += nx * kick; nvy += ny * kick;
    b.vx = Math.max(-1600, Math.min(1600, nvx));
    b.vy = Math.max(-1600, Math.min(1600, nvy));
}

// multiball doubles all playfield scoring (#3169); with the pack down, every
// literal is the rung-1 number again.
function add(gs, pts) { gs.score += pts * (gs.multiball ? gs.table.rules.mbDouble : 1); }

// DMD message (rung 3): the strip's text is SIM state so pinballcheck can
// pin what the display says at any tick. Tick-driven decay; a newer message
// simply replaces the old one.
function say(gs, text, ticks = 110) { gs.msg = { text, t: ticks, T: ticks }; }

function substep(gs, dt) {
    const T = gs.table;
    // flippers animate once per substep (game-wide), then the pack collides.
    const f = T.flippers;
    ['L', 'R'].forEach((side) => {
        const held = side === 'L' ? gs.padL : gs.padR;
        const target = held ? f[side].up : f[side].rest;
        const rate = (held ? f.upRate : f.downRate) / SUB;
        const prev = gs.ang[side];
        if (prev < target) gs.ang[side] = Math.min(target, prev + rate);
        else if (prev > target) gs.ang[side] = Math.max(target, prev - rate);
        gs.angV[side] = gs.ang[side] - prev;
    });
    // pop bumpers/slings share one global cooldown per element (element-level
    // debounce, like real switches); per-ball physics runs down the pack.
    for (const b of gs.pucks) substepBall(gs, b, dt);
    if (gs.bbCd > 0) gs.bbCd -= 1;
    // every ball has integrated this substep — now make steel refuse steel.
    packCollide(gs);
}

function substepBall(gs, b, dt) {
    const T = gs.table;
    // held by the magnet: the post owns this puck's motion — pinned at the
    // clamp anchor, no gravity, no collisions, but the world clock keeps
    // running (a hold is a hold, not a pause).
    if (b.magHeld) {
        b.bx = b.magX; b.by = b.magY; b.vx = 0; b.vy = 0;
        return;
    }
    b.vy += GRAV * dt;
    b.bx += b.vx * dt;
    b.by += b.vy * dt;

    // static walls (incl. rung-2 one-way gates/guides)
    for (const w of T.walls) segHit(b, w.x1, w.y1, w.x2, w.y2, 0, w.e ?? WALL_E, WALL_FR, w.oneWay);
    // top arc as sampled segments
    const arc = T.arc;
    for (let i = 0; i < arc.segs; i++) {
        const a1 = arc.from + (arc.to - arc.from) * (i / arc.segs);
        const a2 = arc.from + (arc.to - arc.from) * ((i + 1) / arc.segs);
        segHit(b, arc.cx + Math.cos(a1) * arc.rx, arc.cy + Math.sin(a1) * arc.ry,
            arc.cx + Math.cos(a2) * arc.rx, arc.cy + Math.sin(a2) * arc.ry, 0, WALL_E, WALL_FR);
    }
    // outlane guide
    const og = T.outlaneGuide;
    segHit(b, og.x1, og.y1, og.x2, og.y2, 0, WALL_E, WALL_FR);

    // pop bumpers
    T.bumpers.forEach((bp, i) => {
        if (gs.bumperCd[i] > 0) { gs.bumperCd[i] -= 1; return; }
        const nx = b.bx - bp.x, ny = b.by - bp.y;
        const rr = BALL_R + bp.r;
        const d2 = nx * nx + ny * ny;
        if (d2 >= rr * rr || d2 < 1e-12) return;
        const d = Math.sqrt(d2);
        const ux = nx / d, uy = ny / d;
        b.bx = bp.x + ux * rr; b.by = bp.y + uy * rr;
        b.vx = ux * 420; b.vy = uy * 420 - 60;
        gs.bumperCd[i] = 5;
        add(gs, T.rules.bumper); gs.bankHits += 1;
        gs.events.push({ type: 'bumper', i, x: bp.x, y: bp.y });
    });

    // slingshots
    T.slings.forEach((s, i) => {
        if (gs.slingCd[i] > 0) { gs.slingCd[i] -= 1; return; }
        const hit = segHit(b, s.x1, s.y1, s.x2, s.y2, 3, 0.55, 0.02);
        if (hit && !hit.grazed && hit.vn < 0) {
            b.vx += hit.nx * 240; b.vy += hit.ny * 240 - 40;
            gs.slingCd[i] = 4;
            add(gs, T.rules.sling);
            gs.events.push({ type: 'sling', i, x: b.bx, y: b.by });
        }
    });

    // drop targets
    if (!gs.bankLit) {
        T.targets.forEach((tp, i) => {
            if (gs.targetDown[i]) return;
            const hit = segHit(b, tp.x1, T.targetY, tp.x2, T.targetY, 2, 0.4, 0.02);
            if (hit && !hit.grazed && hit.vn < 0) {
                gs.targetDown[i] = true;
                add(gs, T.rules.target); gs.bankHits += 1;
                gs.events.push({ type: 'target', i, x: (tp.x1 + tp.x2) / 2, y: T.targetY });
                if (gs.targetDown.every(Boolean)) {
                    gs.bankLit = true; gs.banksThisBall += 1;
                    gs.mult = Math.min(T.rules.multCap, 1 + gs.banksThisBall);
                    add(gs, T.rules.bankClear);
                    say(gs, `MULT x${gs.mult}`);
                    gs.events.push({ type: 'bank', x: T.view.bankCx, y: T.targetY });
                }
            }
        });
    }

    // spinner in the left outlane: ticks as the ball rolls down past it
    const sp = T.spinner;
    if ((b.bx - sp.xMax) * sp.side < 0 && b.by > sp.yFrom && b.by < sp.yTo) {
        if (b.spinArm) { b.spin = 0; b.spinArm = false; }
        if (b.vy > 0) {
            b.spin += b.vy * dt;
            while (b.spin >= sp.pxPerTurn) {
                b.spin -= sp.pxPerTurn; gs.spinnerTurns += 1;
                add(gs, T.rules.spinner);
                gs.events.push({ type: 'spinner', x: sp.xMax - 8 * sp.side, y: b.by });
            }
        }
    } else b.spinArm = true;

    // outlane kicker
    const k = T.kicker;
    if (gs.kickCd > 0) gs.kickCd -= 1;
    else if ((b.bx - k.xMax) * k.side < 0 && b.by > k.yAt && b.vy > 0) {
        b.vx = k.vx; b.vy = k.vy; gs.kickCd = 20;
        add(gs, T.rules.kicker);
        gs.events.push({ type: 'kicker', x: b.bx, y: b.by });
    }

    // ---- rung 3: MAGNET (generic primitive: charged post, pull, clamp/hold) ----
    // Any ball inside the field marks the table touched (the recharge law);
    // while held, the pinned puck's motion is owned by the hold (see the top
    // of this function's magnet block in stepGame's pre-pass too).
    const MG = T.magnet;
    if (MG) {                                        // #3284: a smithed table may skip the magnet
        const mdx = MG.x - b.bx, mdy = MG.y - b.by;
        const md = Math.hypot(mdx, mdy);
        if (md < MG.field + BALL_R) {
            if (!gs.magTouched) gs.magTouched = true;
            if (!b.magHeld && gs.magCharge > 0 && gs.magHold === 0) {
                // pull toward the post along the field
                if (md > 0.001) { b.vx += (mdx / md) * MG.pull * dt; b.vy += (mdy / md) * MG.pull * dt; }
                // clamp at the post face → held (velocity dies at the clamp)
                const holdR = MG.r + BALL_R;
                if (md < holdR && md > 0.001) {
                    b.bx = MG.x - (mdx / md) * holdR; b.by = MG.y - (mdy / md) * holdR;
                    b.magX = b.bx; b.magY = b.by;
                    b.vx = 0; b.vy = 0; b.magHeld = true;
                    gs.magHold = MG.hold; gs.magCharge = 0; gs.magFlash = 14;
                    say(gs, 'MAGNET!', 90);
                    gs.events.push({ type: 'maggrab', x: MG.x, y: MG.y });
                }
            }
        }
    }

    // flipper collision (animation is game-wide, see substep; dead while tilted
    // — they hang limp)
    ;['L', 'R'].forEach((side) => {
        if (gs.tilt) flipperDead(gs, b, side); else flipperHit(gs, b, side);
    });
}

// ---- BALL-BALL COLLISION (#3217) ---------------------------------------------
// A real table has never let two balls share a spot: steel deflects steel, and
// a held pack deflects *through* itself — hit the front ball, the one behind
// flies off. Rung 2 shipped MULTIBALL on an engine that let balls pass through
// each other (README honest gap #0); this closes it. Pairwise resolution runs
// inside the 240 Hz substep loop, so even opposing max-speed balls approach at
// ≤ 13.3 px/substep — far below the 18 px contact distance, no tunnelling.
// A magnet-pinned ball becomes a post: the free ball bounces off it and the
// pin does not move (the #3199 hold clause stays intact). Physics + feel only:
// no scoring rule lives here; the lamp-set pack read is untouched.
function packCollide(gs) {
    const P = gs.pucks;
    const rr = BALL_R * 2;
    for (let i = 0; i < P.length - 1; i++) {
        for (let j = i + 1; j < P.length; j++) {
            const a = P[i], b = P[j];
            if (a.magHeld && b.magHeld) continue;
            let nx = b.bx - a.bx, ny = b.by - a.by;      // contact normal, a→b
            const d2 = nx * nx + ny * ny;
            if (d2 >= rr * rr) continue;
            let d = Math.sqrt(d2);
            if (d < 1e-6) { nx = 0; ny = -1; d = 1e-6; }  // exact stack: deterministic vertical split
            nx /= d; ny /= d;
            const pen = rr - d;
            if (a.magHeld || b.magHeld) {
                // the pinned ball is the post; n from post → free ball:
                const free = a.magHeld ? b : a;
                const s = a.magHeld ? 1 : -1;
                free.bx += nx * pen * s; free.by += ny * pen * s;
                const vn = (free.vx * nx + free.vy * ny) * s;
                if (vn < 0) {
                    free.vx -= (1 + BALL_E) * vn * nx * s; free.vy -= (1 + BALL_E) * vn * ny * s;
                    ballHit(gs, -vn, free.bx - nx * BALL_R * s, free.by - ny * BALL_R * s);
                }
                continue;
            }
            // equal-mass pair: split the correction, exchange the impulse.
            a.bx -= nx * pen * 0.5; a.by -= ny * pen * 0.5;
            b.bx += nx * pen * 0.5; b.by += ny * pen * 0.5;
            const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (vn < 0) {
                const imp = -(1 + BALL_E) * vn * 0.5;
                b.vx += imp * nx; b.vy += imp * ny;
                a.vx -= imp * nx; a.vy -= imp * ny;
                ballHit(gs, -vn, a.bx + nx * BALL_R, a.by + ny * BALL_R);
            }
        }
    }
}

// The clack: diegetic feedback, not a switch — the event carries the impact
// speed so the shell can voice it. Silent below a soft tap (rolling packs
// whisper, they don't clack); the substep cooldown stops a contact lasting
// several steps from firing on every one.
function ballHit(gs, speed, x, y) {
    if (gs.bbCd > 0 || speed < 60) return;
    gs.bbCd = 4;
    gs.events.push({ type: 'ballhit', x, y, v: speed });
}

function flipperDead(gs, b, side) {
    const T = gs.table;   // tilted: flippers limp, still solid
    const f = T.flippers;
    const px = side === 'L' ? f.L.px : f.R.px, py = f.pivotY;
    const a = gs.ang[side] * deg;
    segHit(b, px, py, px + Math.cos(a) * f.len, py + Math.sin(a) * f.len, f.halfW, 0.2, 0.1);
}

// ------------------------------------------------------ one tick ----
export function stepGame(gs, pad = {}) {
    const T = gs.table;
    gs.tick += 1;
    if (gs.done) return gs;   // game over freezes the sim — a dead ball must
                              // never keep falling, re-draining and re-scoring

    // flipper press-edge events (animation itself runs per-substep, see substep)
    if (pad.left && gs.lastLeft === false && !gs.tilt) gs.events.push({ type: 'flip', side: 'L' });
    if (pad.right && gs.lastRight === false && !gs.tilt) gs.events.push({ type: 'flip', side: 'R' });
    gs.lastLeft = !!pad.left; gs.lastRight = !!pad.right;

    // nudge / tilt (rising edge of b)
    if (pad.b && gs.lastB === false && !gs.tilt) {
        for (const p of gs.pucks) p.vy -= 200;
        gs.pucks[0].vx += (gs.rng() - 0.5) * 90;
        gs.nudgeMeter += 1; gs.nudgeDecay = T.tilt.decayTicks;
        gs.events.push({ type: 'nudge' });
        if (gs.nudgeMeter >= T.tilt.max) {
            gs.tilt = true; say(gs, 'TILT!', 140); gs.events.push({ type: 'tilt' });
        } else if (gs.nudgeMeter === T.tilt.max - 1) { say(gs, 'CAREFUL...', 70); gs.events.push({ type: 'tiltwarn' }); }
    }
    gs.lastB = !!pad.b;
    if (gs.nudgeDecay > 0) { gs.nudgeDecay -= 1; if (gs.nudgeDecay === 0 && !gs.tilt) gs.nudgeMeter = 0; }

    // ball-save window of the pack
    if (gs.saveT > 0) gs.saveT -= 1;

    // magnet hold clock — decremented on the WORLD clock (a hold bites time
    // off the magnet, never off the game); at zero the puck drops free.
    if (gs.magHold > 0) {
        gs.magHold -= 1;
        if (gs.magHold === 0) {
            const hp = gs.pucks.find((p) => p.magHeld);
            if (hp) {
                hp.magHeld = false;
                add(gs, T.rules.magnet);
                gs.magFreeFlash = 12;
                say(gs, `SNAP! +${T.rules.magnet}`);
                gs.events.push({ type: 'magfree', x: hp.bx, y: hp.by });
            }
        }
    }

    // remember each ball's height for rollover cross-detection, then run physics
    for (const p of gs.pucks) p.prevY = p.by;

    // plunger: hold a/down with a ball in the lane, release to fire.
    // The auto-plunge clock counts ALL ticks a ball sits in the lane — a few
    // frantic taps must never lock out the auto-plunger forever (a ball that
    // never launches is not a game).
    for (const p of gs.pucks) {
        const inLane = (p.bx - T.lane.innerX) * T.lane.side > 0 && p.by > T.lane.bottomY && p.vy > -50;
        if (inLane) {
            p.launched = false; p.laneCurved = false; gs.laneIdle += 1;
            const hold = !!pad.a || !!pad.down;
            if (hold) {
                gs.power = Math.min(1, gs.power + T.plunger.chargeRate / 60); gs.plungerHold = true;
                // #3146 juice: mechanical ratchet clicks as the plunger pulls back
                // (the notches a real auto-plunger makes). Audio/fx only — physics
                // of the charge and release are untouched.
                const notch = Math.floor(gs.power * 16);
                if (notch > gs.plungerNotch) { gs.plungerNotch = notch; gs.events.push({ type: 'ratchet', power: gs.power }); }
                // #3297: three coarse power zones (LIGHT / FIRM / MAX) — a deeper
                // mechanical tick at each boundary so the pull reads in three steps
                // without sound. Feedback only: charge/release physics untouched.
                const zone = gs.power >= 0.999 ? 3 : gs.power >= 2 / 3 ? 2 : gs.power >= 1 / 3 ? 1 : 0;
                if (zone > gs.powerZone) { gs.powerZone = zone; gs.events.push({ type: 'powerzone', zone, power: gs.power }); }
            }
            else {
                if (gs.plungerHold && gs.power > 0.06) fire(gs, p);
                gs.plungerHold = false;
            }
            if (!hold && gs.laneIdle > T.plunger.autoTicks) fire(gs, p, T.plunger.autoPower);
        }
    }

    // flippers (animated INSIDE the substep loop so a 2700°/s sweep can never
    // jump past the ball between collision checks)
    gs.padL = !gs.tilt && !!pad.left;
    gs.padR = !gs.tilt && !!pad.right;
    for (let i = 0; i < SUB; i++) substep(gs, 1 / (60 * SUB));

    // per-ball rules after physics: flag captures/drains, resolve after.
    gs.pucks.forEach((p) => { p.cap = false; p.drain = false; });
    gs.pucks.forEach((p) => {
        // lane guide curl: a launched ball crossing the lane mouth is steered left,
        // the way a real launch-lane guide curls it toward the arc apex instead of
        // letting it rain straight back down the lane.
        if (p.launched && (p.bx - T.lane.innerX) * T.lane.side > 0 && p.by < T.lane.mouthY && p.vy < 0 && !p.laneCurved) { p.vx += T.lane.curlVx; p.laneCurved = true; }

        // ---- rung 2: RAMP rollovers (crossed upward in the launch lane) ----
        for (const rr of T.rampRollovers) {
            const rz = T.lane.rampZone;
            if (p.prevY > rr.y && p.by <= rr.y && p.bx > rz.x1 && p.bx < rz.x2) {
                gs.rampHits += 1; gs.rampFlash = 8;
                add(gs, T.rules.ramp);
                gs.events.push({ type: 'ramp', x: T.view.rampCx, y: rr.y });
                if (gs.rampHits >= 3) {
                    gs.rampHits = 0; gs.rampLit = true;
                    add(gs, T.rules.rampSet);
                    say(gs, `RAMP SET! +${T.rules.rampSet}`);
                    gs.events.push({ type: 'rampset', x: T.view.rampCx, y: T.rampRollovers[0].y });
                }
            }
        }

        // ---- rung 2: LANE rollovers (crossed downward in the firelane) ----
        const { x1, x2 } = T.laneX;
        if (p.bx > x1 && p.bx < x2) {
            // re-arm the sweep counter as a ball enters the lane top
            if (p.prevY < 230 && p.by >= 230 && p.vy > 0) p.laneHits = 0;
            T.laneRollovers.forEach((lr, li) => {
                if (p.prevY < lr.y && p.by >= lr.y && p.vy > 0) {
                    p.laneHits += 1; gs.laneFlash[li] = 8;
                    add(gs, T.rules.lane);
                    gs.events.push({ type: 'lane', i: li, y: lr.y });
                    if (p.laneHits >= T.laneRollovers.length) {
                        p.laneHits = 0;
                        add(gs, T.rules.laneSweep);
                        say(gs, 'LANE SWEEP!');
                        gs.events.push({ type: 'lanesweep', x: T.view.laneCx, y: lr.y });
                    }
                }
            });
        }

        // ---- rung 2: lock tower capture (the tower takes the ball; it is
        // NOT a drain — the lane feeds again, the ball is not lost) ----
        const L = T.lock;
        if (p.bx > L.x1 && p.bx < L.x2 && p.by > L.yAt && p.by < L.yAt + 40 && p.vy > 0) {
            p.cap = true;
            lockBall(gs);
            return;
        }

        // ---- #3250: KICKBACK — one free save per ball at the lane-side
        // drain-mouth pocket. Fires only on a fast descent (a past-the-tip
        // miss), never on rests (minVy) — the ball-search law stays intact.
        const KB = T.kb;
        if (!gs.kbUsed && p.vy > KB.minVy &&
            p.bx > KB.x1 && p.bx < KB.x2 && p.by > KB.yFrom && p.by < KB.yTo) {
            gs.kbUsed = true; gs.kbFlash = 18;
            p.vx = KB.vx; p.vy = KB.vy; p.stall = 0;
            add(gs, T.rules.kb);
            say(gs, `KICKBACK! +${T.rules.kb}`, 90);
            gs.events.push({ type: 'kickback', x: p.bx, y: p.by });
        }

        // ---- rung 3: ORBIT — flank curl assist (mirrors the lane-guide curl
        // law): a launched ball climbing the left flank gets pushed toward
        // the apex so the wrap is a learnable line, not a prayer. ----
        const O = T.orbit;
        if (p.launched && !p.orbitCurled && (p.bx - O.curl.xMax) * O.curl.side < 0 &&
            p.prevY >= O.curl.yAt && p.by < O.curl.yAt && p.vy < 0) {
            p.vx += O.curl.vx; p.orbitCurled = true;
            gs.events.push({ type: 'curl', x: p.bx, y: p.by });
        }
        // arm: cross the left-flank pad UPWARD inside the channel
        const ap = O.armPad;
        if (!p.orbitArmed && p.prevY > ap.y && p.by <= ap.y && Math.abs(p.bx - ap.x) < O.armW + BALL_R) {
            p.orbitArmed = true; gs.orbitArmFlash = 8;
            gs.events.push({ type: 'orbitarm', x: ap.x, y: ap.y });
        }
        // complete: cross the right-flank pad DOWNWARD — the descent lands on
        // the firelane top gate, chaining the orbit into the lock idiom.
        const dp = O.donePad;
        if (p.orbitArmed && p.prevY < dp.y && p.by >= dp.y && Math.abs(p.bx - dp.x) < O.doneW + BALL_R) {
            p.orbitArmed = false; p.orbitCurled = false;
            gs.orbits += 1; gs.orbitBank += 1; gs.orbitFlash = 14;
            add(gs, T.rules.orbit);
            say(gs, `ORBIT! +${T.rules.orbit}`);
            gs.events.push({ type: 'orbit', n: gs.orbits, x: dp.x, y: dp.y });
            if (gs.orbitLit) {
                // the set is lit: a completed orbit banks a lock outright —
                // the orbit lane is CABINET ONE's second route to MULTIBALL.
                gs.orbitLit = false;
                say(gs, 'ORBIT LOCK!');
                gs.events.push({ type: 'orbitlock' });
                lockBall(gs);
            } else if (gs.orbitBank >= O.need) {
                gs.orbitBank = 0; gs.orbitLit = true;
                add(gs, T.rules.orbitSet);
                say(gs, 'ORBIT SET!');
                gs.events.push({ type: 'orbitset' });
            }
        }

        // BALL SEARCH (authentic cabinet behaviour): a live ball sitting
        // basically motionless away from the plunger lane and the magnet is a
        // dead stall — real machines shudder until it drops. Counted on the
        // world clock; after 20 world-seconds the search ends the ball, so no
        // rest position (rare mirrored geometry included) can wedge a game
        // open forever. Deterministic: no rng, pure state.
        const stallExempt = gs.magHold > 0 || p.cap || ((p.bx - T.lane.innerX) * T.lane.side > 0 && p.by > T.lane.bottomY)
        if (!stallExempt && Math.hypot(p.vx, p.vy) < 18) p.stall = (p.stall || 0) + 1
        else p.stall = 0
        if (p.stall > 1200) p.drain = true;

        // drain
        if (p.by > T.drainY) p.drain = true;
    });

    // resolve losses. A drain outside the pack ends the ball; while the pack
    // is down drains cost balls-on-playfield only (plus the save window), and
    // captures just leave the tower holding them until the count pays.
    if (gs.pucks.some((p) => p.drain) && !gs.multiball) {
        drain(gs);
    } else {
        for (let i = gs.pucks.length - 1; i >= 0; i--) {
            if (gs.pucks[i].drain) packDrain(gs, i);
        }
        for (let i = gs.pucks.length - 1; i >= 0; i--) {
            if (gs.pucks[i].cap) {
                gs.pucks.splice(i, 1);
                if (gs.multiball && gs.pucks.length <= 1) endMultiball(gs);
            }
        }
    }
    // the table must never sit empty: an empty playfield feeds a fresh ball
    // from the plunger (a locked ball costs nothing — the lane feeds again).
    if (!gs.done && gs.pucks.length === 0) feedBall(gs);

    if (gs.rampFlash > 0) gs.rampFlash -= 1;
    if (gs.kbFlash > 0) gs.kbFlash -= 1;
    gs.laneFlash = gs.laneFlash.map((v) => Math.max(0, v - 1));
    if (gs.lockFlash > 0) gs.lockFlash -= 1;
    if (gs.mbFlash > 0) gs.mbFlash -= 1;
    if (gs.drainFx > 0) gs.drainFx -= 1;
    // rung 3 mirrors
    if (gs.orbitFlash > 0) gs.orbitFlash -= 1;
    if (gs.orbitArmFlash > 0) gs.orbitArmFlash -= 1;
    if (gs.magFlash > 0) gs.magFlash -= 1;
    if (gs.magFreeFlash > 0) gs.magFreeFlash -= 1;
    if (gs.msg.t > 0) gs.msg.t -= 1;
    return gs;
}

function fire(gs, p, pw = gs.power) {
    const T = gs.table;
    p.vy = -(T.plunger.minV + (T.plunger.maxV - T.plunger.minV) * pw);
    p.vx = 0; p.launched = true; p.laneCurved = false;
    gs.power = 0; gs.plungerNotch = 0; gs.powerZone = 0; gs.laneIdle = 0; gs.plungerHold = false;
    gs.events.push({ type: 'plunge', power: pw });
}

function feedBall(gs) {
    const T = gs.table;
    gs.pucks.push(newPuck(T.plunger.x, T.plunger.restY, 0, 0));
    gs.plungerHold = false; gs.power = 0; gs.plungerNotch = 0; gs.powerZone = 0; gs.laneIdle = 0;
    gs.events.push({ type: 'feed' });
}

// ---- rung 2: lock / multiball ----
function lockBall(gs) {
    const T = gs.table;
    add(gs, T.rules.lock);
    gs.lockFlash = 12;
    if (gs.multiball) {
        // a lock DURING multiball banks an extra ball for the end of the pack
        gs.extraBall += 1;
        say(gs, 'EXTRA BALL');
        gs.events.push({ type: 'extraball', willPay: gs.extraBall });
        return;
    }
    gs.locks += 1;
    say(gs, `LOCK ${gs.locks}/${T.lock.need}`);
    gs.events.push({ type: 'lock', n: gs.locks });
    if (gs.locks >= T.lock.need) startMultiball(gs);
}

function startMultiball(gs) {
    const T = gs.table;
    gs.locks = 0;
    add(gs, T.rules.multiball);   // award at pack-off odds, before the x2 is live
    gs.multiball = true; gs.saveUsed = false; gs.saveT = T.saveTicks;
    gs.mbFlash = 60;
    say(gs, 'MULTIBALL!', 170);
    for (const k of T.mbKick) {
        const p = newPuck(k.x, k.y, k.vx, k.vy);
        p.launched = true;
        gs.pucks.push(p);
    }
    gs.events.push({ type: 'multiball' });
}

// a drain while the pack is down: the ball is lost but NOT the game ball;
// the first drain inside the save window relaunches instead.
function packDrain(gs, idx) {
    const T = gs.table;
    gs.pucks.splice(idx, 1);
    // the magnet re-arms when a ball that touched its field drains (rule 5
    // of the design: magnet play costs risk, pack drains pay the recharge)
    if (gs.magTouched && gs.magCharge === 0 && gs.magHold === 0) {
        gs.magCharge = 1; gs.magTouched = false; gs.events.push({ type: 'magready' });
    }
    if (!gs.saveUsed && gs.saveT > 0) {
        gs.saveUsed = true;
        say(gs, 'BALL SAVE!');
        const p = newPuck(T.plunger.x, 500, 0, -950);
        p.launched = true;
        gs.pucks.push(p);
        gs.events.push({ type: 'save' });
        return;
    }
    gs.events.push({ type: 'packdrain' });
    if (gs.pucks.length <= 1) endMultiball(gs);
}

function endMultiball(gs) {
    gs.multiball = false; gs.saveT = 0;
    if (gs.extraBall > 0) {
        gs.balls += gs.extraBall;
        gs.events.push({ type: 'extraballpaid', n: gs.extraBall });
        gs.extraBall = 0;
    }
    gs.locks = 0;
    gs.events.push({ type: 'packend' });
}

function drain(gs) {
    const T = gs.table;
    // bonus pays the drop-target ladder this ball collected, × mult
    const bonus = gs.bankHits * T.rules.bonusPerTarget * gs.mult;
    gs.lastBonus = bonus; gs.score += bonus; gs.bankHits = 0;
    if (bonus > 0) { say(gs, `BONUS +${bonus}`); gs.events.push({ type: 'bonus', value: bonus }); }
    gs.events.push({ type: 'drain' });
    gs.balls -= 1; gs.drainFx = 30;
    if (gs.balls <= 0) {
        gs.balls = 0; gs.done = true; gs.phase = 'over';
        gs.pucks = [];
        gs.events.push({ type: 'gameover' });
    } else {
        resetBall(gs);
        say(gs, `BALL ${T.balls - gs.balls + 1}`, 90);
        gs.events.push({ type: 'ballstart', ball: gs.balls });
    }
}

// -------------------------------------------------- attract demo bot ----
// #3237 attract show-off: the attract mode plays the machine with the ONE
// line the check script already proves human-winnable — a 4-tick medium
// plunge every 90 ticks rounds the dome, rolls the firelane and locks;
// three locks ignite MULTIBALL (pinballcheck HUMAN LINE, both cabinets).
// Pure: a function of gs + tick, no RNG — the demo is deterministic and
// Node-pinnable exactly as the browser runs it.
export function demoPad(gs, tick) {
    const p = gs.pucks[0];
    const atPlunger = gs.pucks.length === 1 && p && !p.launched && p.by > 540;
    return atPlunger && tick % 90 < 4 ? { down: true } : {};
}
// One demo run ends when the game ends, or a beat after the pack lands —
// the MULTIBALL money shot is the showpiece; then re-deal fresh.
export function demoOver(gs, mbSeen, ticksSinceMb) {
    return Boolean(gs.done) || (mbSeen && ticksSinceMb > 420);
}

// -------------------------------------------------- solo bed law ----
// #3304 — the SOLO bed: single-ball play is no longer dry (#3178 left the
// music to MULTIBALL only). Pure law over gs, so the level/swell is replay-
// deterministic and Node-pinnable; the caller (index.jsx) quantizes to 0.02
// audible steps so heat never spams the music bus per frame. The pack stays
// exclusive to pinballMb: multiball answers 0 here, and the #3178 seam is
// untouched. A tilted cabinet reads thin — the music slumps like the flippers.
export const SOLO_FLOOR = 0.10; // quiet breath between balls, mid-run
export const SOLO_BASE = 0.16;  // a ball is live and the run just started
export const SOLO_CAP = 0.30;   // red-heat ceiling — still well under the mb bed (0.55)
export const SOLO_HEAT_AT = 25000; // score at which the swell is full
export function soloBed(gs) {
    if (gs.done || gs.multiball) return 0;
    if (gs.tilt) return SOLO_FLOOR / 2;
    if (gs.pucks.length === 0) return gs.score > 0 ? SOLO_FLOOR : 0;
    const heat = Math.min(1, gs.score / SOLO_HEAT_AT);
    return SOLO_BASE + (SOLO_CAP - SOLO_BASE) * heat;
}

// -------------------------------------------------- state & hash ----
export function stateOf(gs) {
    return {
        tick: gs.tick, score: gs.score, done: gs.done,
        cab: gs.table.id,   // #3232: which cabinet this run is on
        seed: gs.seed >>> 0,      // #3103 seed pin: reports must carry the seed
        balls: gs.balls, phase: gs.done ? 'over' : 'play',
        mult: gs.mult, tilt: gs.tilt, nudge: gs.nudgeMeter,
        targetsDown: gs.targetDown.filter(Boolean).length,
        spinnerTurns: gs.spinnerTurns, launched: gs.launched,
        // #3146: the charge itself is part of the observable state — a held
        // plunger must read as motion to the juice audit, not just look like it.
        power: gs.power,
        // ---- rung 2 ----
        liveBalls: gs.pucks.length, locks: gs.locks,
        multiball: gs.multiball, extraBall: gs.extraBall,
        rampHits: gs.rampHits, saveT: gs.saveT, kbUsed: gs.kbUsed,
        // ---- rung 3 ----
        orbits: gs.orbits, orbitBank: gs.orbitBank, orbitLit: gs.orbitLit,
        magCharge: gs.magCharge, magHold: gs.magHold, magTouched: gs.magTouched,
        // what the DMD strip reads this tick (deterministic — Node can pin it)
        dmd: { text: gs.msg.t > 0 ? gs.msg.text : '', t: gs.msg.t, T: gs.msg.T || 0 },
        hash: stateHash(gs),
    };
}

export function stateHash(gs) {
    const q = (v) => Math.round(v * 4);   // 0.25 px / px·s⁻¹ resolution
    const parts = [
        gs.pucks.map((p) => `${q(p.bx)},${q(p.by)},${q(p.vx)},${q(p.vy)}`).join(';'),
        q(gs.ang.L), q(gs.ang.R), gs.tick, gs.score, gs.balls,
        gs.targetDown.map((d) => (d ? 1 : 0)).join(''), gs.mult, gs.tilt ? 1 : 0,
        gs.spinnerTurns, gs.launched ? 1 : 0,
        gs.locks, gs.multiball ? 1 : 0, gs.extraBall, gs.rampHits, gs.saveUsed ? 1 : 0, gs.kbUsed ? 1 : 0,
        gs.orbitBank, gs.orbitLit ? 1 : 0, gs.magCharge, gs.magHold, gs.magTouched ? 1 : 0,
        gs.seed >>> 0];
    let h = 0x811c9dc5;
    const s = parts.join(',');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
}

// ═══════════════════════════════════════════════ TABLE SMITH (#3284) ═════
// The table editor's COMPILER — the #3103 contract made playable: the player
// composes a cabinet from the primitive set the engine already knows, and this
// function turns that layout into a full table object. Zero new physics: every
// part compiles into existing data primitives, so the same 240 Hz sim, the
// same scoring ladder, the same renderer run a player-built machine as-is.
//
// The chassis is fixed (outer shell, dome arc, launch lane + firelane + lock
// tower + orbit + left outlane, flippers, plunger, drain) — it is the part a
// cabinet must not get wrong. The player owns the PLAYFIELD FEATURES:
//   bumpers  ≤3     slingL / slingR   bank (4-target drop bank)   magnet
//
// compileTable(def) is pure, deterministic and total: it ALWAYS returns the
// geometry (the editor paints the draft), plus `error` — a short all-caps
// reason — when the layout is illegal to play. pinballcheck pins the legality
// boundary, the determinism and that every reference layout plays: leaves the
// lane, scores something, and never wedges (BALL SEARCH, engine-level, is the
// no-stuck guarantee every custom table inherits).
//
// Zones are authored so legality is checkable, not vibes:
//  • bumpers ride inside the dome — the arc's ellipse shrunk by post+ball+2 —
//    clamped clear of the orbit channel (x>82) and the firelane column (x<268),
//    pairwise far enough apart for a ball to thread (≥54 between centres).
//  • slings anchor in their half; the tip is the stock 53×48 run, and the tip
//    stops short of the flipper gap's centre line (left tip ≤150 / right tip
//    ≥210) so flippers are always reachable. Right anchors clear the firelane.
//  • the bank stays between dome and slings (y 210..290), span inside the
//    rails; magnet keeps clear of lane, tower, guides and its neighbours.

export const SMITH_LIMITS = {
    bumperMax: 3, bumperR: 15, bumpGap: 54,          // dome ellipse rx/ry 144/124
    domX: [82, 268], domY: [70, 270],                // clamps vs channel + firelane
    bankX: [128, 220], bankY: [210, 290], bankSpan: 72,
    slingX: { L: [73, 97], R: [263, 287] }, slingY: [380, 470],
    slingRun: 53, slingDrop: 48,
    magX: [70, 286], magY: [250, 470], magNear: 38,  // vs bumper centre; 26 vs bank/sling/guide
};

// Coerce untrusted JSON (localStorage) into a clean def; drops junk entries.
export function sanitizeDef(raw) {
    const ok = (v) => Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);
    const def = { name: '', bumpers: [], slingL: null, slingR: null, bank: null, magnet: null };
    if (!raw || typeof raw !== 'object') return def;
    if (typeof raw.name === 'string') def.name = raw.name.slice(0, 14).replace(/[^\w '!.+]/g, '').toUpperCase();
    if (Array.isArray(raw.bumpers)) def.bumpers = raw.bumpers.filter(ok).map((p) => [p[0], p[1]]).slice(0, SMITH_LIMITS.bumperMax);
    if (ok(raw.slingL)) def.slingL = [raw.slingL[0], raw.slingL[1]];
    if (ok(raw.slingR)) def.slingR = [raw.slingR[0], raw.slingR[1]];
    if (ok(raw.bank)) def.bank = [raw.bank[0], raw.bank[1]];
    if (ok(raw.magnet)) def.magnet = [raw.magnet[0], raw.magnet[1]];
    return def;
}

const ptSeg = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
    return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
};

// Geometry that the editor paints whether or not the layout is legal; the
// strict pass adds the legality verdict on top of the same shape.
// One source for the bumper zone law — the compiler's validator and the
// editor's live ghost both call this, so green cursor == accepted placement.
export const bumperZoneOk = (L, x, y) =>
    x >= L.domX[0] && x <= L.domX[1] && y >= L.domY[0] && y <= L.domY[1] &&
    ((x - 180) / 144) ** 2 + ((y - 160) / 124) ** 2 <= 1

export function compileTable(defRaw) {
    const def = sanitizeDef(defRaw);
    const L = SMITH_LIMITS;
    const slings = [];
    if (def.slingL) slings.push({ x1: def.slingL[0], y1: def.slingL[1], x2: def.slingL[0] + L.slingRun, y2: def.slingL[1] + L.slingDrop });
    if (def.slingR) slings.push({ x1: def.slingR[0], y1: def.slingR[1], x2: def.slingR[0] - L.slingRun, y2: def.slingR[1] + L.slingDrop });
    const targets = def.bank
        ? [0, 1, 2, 3].map((i) => ({ x1: def.bank[0] - L.bankSpan + i * 36, x2: def.bank[0] - L.bankSpan + i * 36 + 30 }))
        : [];
    const tb = {
        id: 'my-table',
        label: def.name || 'MY TABLE',
        balls: TABLE.balls,
        walls: TABLE.walls,                       // chassis: shared, read-only
        arc: TABLE.arc,
        bumpers: def.bumpers.map((p) => ({ x: p[0], y: p[1], r: L.bumperR })),
        slings,
        targets,
        targetY: def.bank ? def.bank[1] : 999,   // no bank → off-field (loops over [])
        outlaneGuide: TABLE.outlaneGuide,
        spinner: TABLE.spinner,
        kicker: TABLE.kicker,
        kb: TABLE.kb,
        rampRollovers: TABLE.rampRollovers,
        laneRollovers: TABLE.laneRollovers,
        laneX: TABLE.laneX,
        lock: TABLE.lock,
        lane: TABLE.lane,
        mbKick: TABLE.mbKick,
        saveTicks: TABLE.saveTicks,
        orbit: TABLE.orbit,
        magnet: def.magnet ? { x: def.magnet[0], y: def.magnet[1], r: 10, field: 24, hold: 72, pull: 1500 } : null,
        flippers: TABLE.flippers,
        plunger: TABLE.plunger,
        drainY: TABLE.drainY,
        tilt: TABLE.tilt,
        rules: TABLE.rules,
    };
    tb.view = buildView(tb);
    return { tb, error: validateSmith(def) };
}

function validateSmith(def) {
    const L = SMITH_LIMITS;
    if (!def.bumpers.length) return 'PLACE A BUMPER';
    if (def.bumpers.length > L.bumperMax) return 'MAX 3 BUMPS';
    for (const [x, y] of def.bumpers) {
        if (x < L.domX[0] || x > L.domX[1] || y < L.domY[0] || y > L.domY[1]) return 'BUMPER OUT OF ZONE';
        if (!bumperZoneOk(L, x, y)) return 'BUMPER OUT OF DOME';
    }
    for (let i = 0; i < def.bumpers.length; i++) {
        for (let j = i + 1; j < def.bumpers.length; j++) {
            if (Math.hypot(def.bumpers[i][0] - def.bumpers[j][0], def.bumpers[i][1] - def.bumpers[j][1]) < L.bumpGap) return 'BUMPER OVERLAP';
        }
    }
    const slingAnchors = [];
    for (const [key, limit] of [['slingL', L.slingX.L], ['slingR', L.slingX.R]]) {
        const s = def[key];
        if (!s) continue;
        // The zone clamp IS the flipper-gap law: left anchor ≤97 puts the tip
        // (anchor + 53) at ≤150, right tip ≥210 — a 60 px centre corridor is
        // always open and right anchors stay clear of the firelane wall.
        if (s[0] < limit[0] || s[0] > limit[1] || s[1] < L.slingY[0] || s[1] > L.slingY[1]) return 'SLING OUT OF ZONE';
        slingAnchors.push({ key, x: s[0], y: s[1], tipX: key === 'slingL' ? s[0] + L.slingRun : s[0] - L.slingRun, tipY: s[1] + L.slingDrop });
    }
    if (def.bank) {
        const [cx, by] = def.bank;
        if (cx < L.bankX[0] || cx > L.bankX[1] || by < L.bankY[0] || by > L.bankY[1]) return 'BANK OUT OF ZONE';
    }
    if (def.magnet && (def.magnet[0] < L.magX[0] || def.magnet[0] > L.magX[1] || def.magnet[1] < L.magY[0] || def.magnet[1] > L.magY[1])) return 'MAGNET OUT OF ZONE';
    // cross-part clearance — the parts must leave the ball room to travel.
    // (Zone clamps keep the bumper band above y=270 and slings below y=380,
    // so bank↔sling and bumper↔sling cannot meet — no dead checks here.)
    const near = (px, py, other) => Math.hypot(px - other[0], py - other[1]);
    if (def.bank) {
        const [cx, by] = def.bank;
        const inSpan = (px) => Math.abs(px - cx) <= L.bankSpan + 19;
        for (const [x, y] of def.bumpers) if (inSpan(x) && Math.abs(y - by) < 34) return 'BUMPER ON BANK';
        if (def.magnet && inSpan(def.magnet[0]) && Math.abs(def.magnet[1] - by) < 26) return 'MAGNET ON BANK';
    }
    if (def.magnet) {
        for (const [x, y] of def.bumpers) if (near(def.magnet[0], def.magnet[1], [x, y]) < L.magNear) return 'MAGNET ON BUMPER';
        for (const s of slingAnchors) if (ptSeg(def.magnet[0], def.magnet[1], s.x, s.y, s.tipX, s.tipY) < 26) return 'MAGNET ON SLING';
        if (ptSeg(def.magnet[0], def.magnet[1], TABLE.outlaneGuide.x1, TABLE.outlaneGuide.y1, TABLE.outlaneGuide.x2, TABLE.outlaneGuide.y2) < 26) return 'MAGNET ON GUIDE';
    }
    return null;
}

// Reference layouts — pinballcheck drives each one LIVE through the sim:
// launch, score, drain, no wedge. They double as the editor's starting table.
export const SMITH_REFS = {
    nova: { name: 'NOVA RIDER', bumpers: [[115, 170], [180, 140], [245, 170]], slingL: [75, 452], slingR: [285, 452], bank: [180, 290], magnet: null },
    lone: { name: 'LONE STAR', bumpers: [[180, 150]], slingL: null, slingR: [285, 440], bank: [150, 250], magnet: [240, 380] },
    wild: { name: 'WILD TIDE', bumpers: [[100, 200], [180, 130], [262, 195]], slingL: [80, 400], slingR: [268, 460], bank: null, magnet: [180, 330] },
};

// #3237 TILT-TO-NUDGE — a phone lean becomes a cabinet nudge. The law is pure
// (pinballcheck pins it; the shell feeds it screen-rotated lean from
// padTypes.tiltVec): crossing `fire` nudges ONCE and latches, so holding the
// phone sideways can never farm the 3-strike tilt-out — the same honesty the
// button nudge earns. Re-arm only happens when the phone returns inside the
// dead zone, so one lean-and-return = exactly one nudge. Both directions fire
// (the cabinet does not care which way you nudge).
export const TILT_NUDGE = { fire: 0.55, rearm: 0.12 } // ≈8° to fire, ≈1.7° to re-arm (TILT_MAX_DEG 14)
export function tiltImpulse(x, latched, law = TILT_NUDGE) {
    let fire = false;
    if (!latched && Math.abs(x) >= law.fire) { fire = true; latched = true; }
    else if (latched && Math.abs(x) <= law.rearm) latched = false;
    return { fire, latched };
}
