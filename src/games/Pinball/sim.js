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
// substeps (240 Hz) of circle-vs-segment/capsule collision, gravity, and
// moving-surface (flipper) response with proper ω×r surface velocity, so flip
// timing decides aim — the rung-1 brief's "get the ball feel right here".

export const W = 360;
export const H = 600;
export const BALL_R = 9;
export const GRAV = 900;              // px/s² — arcade-fast but readable in portrait
export const SUB = 4;                // physics substeps per 60 Hz tick (240 Hz)
export const WALL_E = 0.52;          // wall restitution
export const WALL_FR = 0.06;        // wall tangential friction

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
    // kicker that rockets the ball back into play.
    outlaneGuide: { x1: 52, y1: 420, x2: 30, y2: 505 },
    spinner: { xMax: 46, yFrom: 440, yTo: 496, pxPerTurn: 22 },
    kicker: { xMax: 46, yAt: 498, vx: 300, vy: -540 },
    // ---- rung 2 primitives (data; the engine only knows the shapes) ----
    // RAMP rollovers: crossed UPWARD inside the launch lane (x 326..346).
    rampRollovers: [{ y: 250 }, { y: 330 }],
    // LANE rollovers: crossed DOWNWARD inside the firelane (x 302..318).
    laneRollovers: [{ y: 250 }, { y: 310 }, { y: 370 }],
    laneX: { x1: 302, x2: 318 },
    // Lock tower mouth: a ball descending through it is captured.
    lock: { x1: 298, x2: 322, yAt: 440, need: 3 },
    // Multiball release: three balls kicked from the tower top, arcing left
    // over the dome (deterministic — no rng in the kick).
    mbKick: [
        { x: 308, y: 165, vx: -60, vy: -140 },
        { x: 314, y: 175, vx: -30, vy: -100 },
        { x: 302, y: 155, vx: -90, vy: -170 },
    ],
    // Ball-save: the first drain within this window of MULTIBALL auto-relaunches.
    saveTicks: 300,
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
        spinner: 10, kicker: 100, bonusPerTarget: 50, multCap: 5,
        ramp: 25, rampSet: 500, lane: 25, laneSweep: 100,
        lock: 500, multiball: 1000, mbDouble: 2,
    },
};

// ----------------------------------------------------- game state ----
export function makeGame(seed = 1) {
    const p0 = newPuck(TABLE.plunger.x, TABLE.plunger.restY, 0, 0);
    const gs = {
        seed: seed >>> 0, rng: mulberry32((seed >>> 0) ^ 0x9e3779b9),
        tick: 0, score: 0, balls: TABLE.balls, done: false, phase: 'play',
        pucks: [p0],
        launched: false, plungerHold: false, power: 0, laneIdle: 0, laneCurved: false,
        ang: { L: TABLE.flippers.L.rest, R: TABLE.flippers.R.rest },
        angV: { L: 0, R: 0 },
        bumperCd: TABLE.bumpers.map(() => 0), slingCd: TABLE.slings.map(() => 0),
        targetDown: TABLE.targets.map(() => false),
        bankLit: false, bankHits: 0, banksThisBall: 0, mult: 1,
        spinnerTurns: 0,   // per-puck spin/spinArm live on gs.pucks[i]
        kickCd: 0,
        nudgeMeter: 0, nudgeDecay: 0, tilt: false,
        lastBonus: 0, drainFx: 0,
        lastLeft: false, lastRight: false, lastB: false,
        // ---- rung 2 ----
        locks: 0, multiball: false, extraBall: 0, saveT: 0, saveUsed: false,
        rampHits: 0, rampLit: false,
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
    return { bx: x, by: y, vx, vy, prevY: y, launched: false, laneCurved: false, spin: 0, spinArm: true, laneHits: 0 };
}

export function resetBall(gs) {
    gs.pucks = [newPuck(TABLE.plunger.x, TABLE.plunger.restY, 0, 0)];
    gs.launched = false; gs.power = 0; gs.laneIdle = 0; gs.plungerHold = false; gs.laneCurved = false;
    gs.targetDown = TABLE.targets.map(() => false); gs.bankLit = false;
    gs.spinnerTurns = 0; gs.tilt = false;
    gs.nudgeMeter = 0; gs.nudgeDecay = 0; gs.mult = 1; gs.banksThisBall = 0;
    // rung 2: the tower drops its locks with the ball; the pack ends with it
    gs.locks = 0; gs.multiball = false; gs.saveT = 0; gs.saveUsed = false;
    gs.rampHits = 0; gs.rampLit = false;
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
    const f = TABLE.flippers;
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
function add(gs, pts) { gs.score += pts * (gs.multiball ? TABLE.rules.mbDouble : 1); }

function substep(gs, dt) {
    // flippers animate once per substep (game-wide), then the pack collides.
    const f = TABLE.flippers;
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
}

function substepBall(gs, b, dt) {
    b.vy += GRAV * dt;
    b.bx += b.vx * dt;
    b.by += b.vy * dt;

    // static walls (incl. rung-2 one-way gates/guides)
    for (const w of TABLE.walls) segHit(b, w.x1, w.y1, w.x2, w.y2, 0, w.e ?? WALL_E, WALL_FR, w.oneWay);
    // top arc as sampled segments
    const arc = TABLE.arc;
    for (let i = 0; i < arc.segs; i++) {
        const a1 = arc.from + (arc.to - arc.from) * (i / arc.segs);
        const a2 = arc.from + (arc.to - arc.from) * ((i + 1) / arc.segs);
        segHit(b, arc.cx + Math.cos(a1) * arc.rx, arc.cy + Math.sin(a1) * arc.ry,
            arc.cx + Math.cos(a2) * arc.rx, arc.cy + Math.sin(a2) * arc.ry, 0, WALL_E, WALL_FR);
    }
    // outlane guide
    const og = TABLE.outlaneGuide;
    segHit(b, og.x1, og.y1, og.x2, og.y2, 0, WALL_E, WALL_FR);

    // pop bumpers
    TABLE.bumpers.forEach((bp, i) => {
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
        add(gs, TABLE.rules.bumper); gs.bankHits += 1;
        gs.events.push({ type: 'bumper', i, x: bp.x, y: bp.y });
    });

    // slingshots
    TABLE.slings.forEach((s, i) => {
        if (gs.slingCd[i] > 0) { gs.slingCd[i] -= 1; return; }
        const hit = segHit(b, s.x1, s.y1, s.x2, s.y2, 3, 0.55, 0.02);
        if (hit && !hit.grazed && hit.vn < 0) {
            b.vx += hit.nx * 240; b.vy += hit.ny * 240 - 40;
            gs.slingCd[i] = 4;
            add(gs, TABLE.rules.sling);
            gs.events.push({ type: 'sling', i, x: b.bx, y: b.by });
        }
    });

    // drop targets
    if (!gs.bankLit) {
        TABLE.targets.forEach((tp, i) => {
            if (gs.targetDown[i]) return;
            const hit = segHit(b, tp.x1, TABLE.targetY, tp.x2, TABLE.targetY, 2, 0.4, 0.02);
            if (hit && !hit.grazed && hit.vn < 0) {
                gs.targetDown[i] = true;
                add(gs, TABLE.rules.target); gs.bankHits += 1;
                gs.events.push({ type: 'target', i, x: (tp.x1 + tp.x2) / 2, y: TABLE.targetY });
                if (gs.targetDown.every(Boolean)) {
                    gs.bankLit = true; gs.banksThisBall += 1;
                    gs.mult = Math.min(TABLE.rules.multCap, 1 + gs.banksThisBall);
                    add(gs, TABLE.rules.bankClear);
                    gs.events.push({ type: 'bank', x: 187, y: TABLE.targetY });
                }
            }
        });
    }

    // spinner in the left outlane: ticks as the ball rolls down past it
    const sp = TABLE.spinner;
    if (b.bx < sp.xMax && b.by > sp.yFrom && b.by < sp.yTo) {
        if (b.spinArm) { b.spin = 0; b.spinArm = false; }
        if (b.vy > 0) {
            b.spin += b.vy * dt;
            while (b.spin >= sp.pxPerTurn) {
                b.spin -= sp.pxPerTurn; gs.spinnerTurns += 1;
                add(gs, TABLE.rules.spinner);
                gs.events.push({ type: 'spinner', x: sp.xMax - 8, y: b.by });
            }
        }
    } else b.spinArm = true;

    // outlane kicker
    const k = TABLE.kicker;
    if (gs.kickCd > 0) gs.kickCd -= 1;
    else if (b.bx < k.xMax && b.by > k.yAt && b.vy > 0) {
        b.vx = k.vx; b.vy = k.vy; gs.kickCd = 20;
        add(gs, TABLE.rules.kicker);
        gs.events.push({ type: 'kicker', x: b.bx, y: b.by });
    }

    // flipper collision (animation is game-wide, see substep; dead while tilted
    // — they hang limp)
    ;['L', 'R'].forEach((side) => {
        if (gs.tilt) flipperDead(gs, b, side); else flipperHit(gs, b, side);
    });
}

function flipperDead(gs, b, side) {   // tilted: flippers limp, still solid
    const f = TABLE.flippers;
    const px = side === 'L' ? f.L.px : f.R.px, py = f.pivotY;
    const a = gs.ang[side] * deg;
    segHit(b, px, py, px + Math.cos(a) * f.len, py + Math.sin(a) * f.len, f.halfW, 0.2, 0.1);
}

// ------------------------------------------------------ one tick ----
export function stepGame(gs, pad = {}) {
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
        gs.nudgeMeter += 1; gs.nudgeDecay = TABLE.tilt.decayTicks;
        gs.events.push({ type: 'nudge' });
        if (gs.nudgeMeter >= TABLE.tilt.max) {
            gs.tilt = true; gs.events.push({ type: 'tilt' });
        } else if (gs.nudgeMeter === TABLE.tilt.max - 1) gs.events.push({ type: 'tiltwarn' });
    }
    gs.lastB = !!pad.b;
    if (gs.nudgeDecay > 0) { gs.nudgeDecay -= 1; if (gs.nudgeDecay === 0 && !gs.tilt) gs.nudgeMeter = 0; }

    // ball-save window of the pack
    if (gs.saveT > 0) gs.saveT -= 1;

    // remember each ball's height for rollover cross-detection, then run physics
    for (const p of gs.pucks) p.prevY = p.by;

    // plunger: hold a/down with a ball in the lane, release to fire.
    // The auto-plunge clock counts ALL ticks a ball sits in the lane — a few
    // frantic taps must never lock out the auto-plunger forever (a ball that
    // never launches is not a game).
    for (const p of gs.pucks) {
        const inLane = p.bx > 322 && p.by > 515 && p.vy > -50;
        if (inLane) {
            p.launched = false; p.laneCurved = false; gs.laneIdle += 1;
            const hold = !!pad.a || !!pad.down;
            if (hold) { gs.power = Math.min(1, gs.power + TABLE.plunger.chargeRate / 60); gs.plungerHold = true; }
            else {
                if (gs.plungerHold && gs.power > 0.06) fire(gs, p);
                gs.plungerHold = false;
            }
            if (!hold && gs.laneIdle > TABLE.plunger.autoTicks) fire(gs, p, TABLE.plunger.autoPower);
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
        if (p.launched && p.bx > 322 && p.by < 170 && p.vy < 0 && !p.laneCurved) { p.vx -= 150; p.laneCurved = true; }

        // ---- rung 2: RAMP rollovers (crossed upward in the launch lane) ----
        for (const rr of TABLE.rampRollovers) {
            if (p.prevY > rr.y && p.by <= rr.y && p.bx > 326 && p.bx < 346) {
                gs.rampHits += 1; gs.rampFlash = 8;
                add(gs, TABLE.rules.ramp);
                gs.events.push({ type: 'ramp', x: 336, y: rr.y });
                if (gs.rampHits >= 3) {
                    gs.rampHits = 0; gs.rampLit = true;
                    add(gs, TABLE.rules.rampSet);
                    gs.events.push({ type: 'rampset', x: 336, y: 250 });
                }
            }
        }

        // ---- rung 2: LANE rollovers (crossed downward in the firelane) ----
        const { x1, x2 } = TABLE.laneX;
        if (p.bx > x1 && p.bx < x2) {
            // re-arm the sweep counter as a ball enters the lane top
            if (p.prevY < 230 && p.by >= 230 && p.vy > 0) p.laneHits = 0;
            TABLE.laneRollovers.forEach((lr, li) => {
                if (p.prevY < lr.y && p.by >= lr.y && p.vy > 0) {
                    p.laneHits += 1; gs.laneFlash[li] = 8;
                    add(gs, TABLE.rules.lane);
                    gs.events.push({ type: 'lane', i: li, y: lr.y });
                    if (p.laneHits >= TABLE.laneRollovers.length) {
                        p.laneHits = 0;
                        add(gs, TABLE.rules.laneSweep);
                        gs.events.push({ type: 'lanesweep', x: 310, y: lr.y });
                    }
                }
            });
        }

        // ---- rung 2: lock tower capture (the tower takes the ball; it is
        // NOT a drain — the lane feeds again, the ball is not lost) ----
        const L = TABLE.lock;
        if (p.bx > L.x1 && p.bx < L.x2 && p.by > L.yAt && p.by < L.yAt + 40 && p.vy > 0) {
            p.cap = true;
            lockBall(gs);
            return;
        }

        // drain
        if (p.by > TABLE.drainY) p.drain = true;
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
    gs.laneFlash = gs.laneFlash.map((v) => Math.max(0, v - 1));
    if (gs.lockFlash > 0) gs.lockFlash -= 1;
    if (gs.mbFlash > 0) gs.mbFlash -= 1;
    if (gs.drainFx > 0) gs.drainFx -= 1;
    return gs;
}

function fire(gs, p, pw = gs.power) {
    p.vy = -(TABLE.plunger.minV + (TABLE.plunger.maxV - TABLE.plunger.minV) * pw);
    p.vx = 0; p.launched = true; p.laneCurved = false;
    gs.power = 0; gs.laneIdle = 0; gs.plungerHold = false;
    gs.events.push({ type: 'plunge', power: pw });
}

function feedBall(gs) {
    gs.pucks.push(newPuck(TABLE.plunger.x, TABLE.plunger.restY, 0, 0));
    gs.plungerHold = false; gs.power = 0; gs.laneIdle = 0;
    gs.events.push({ type: 'feed' });
}

// ---- rung 2: lock / multiball ----
function lockBall(gs) {
    add(gs, TABLE.rules.lock);
    gs.lockFlash = 12;
    if (gs.multiball) {
        // a lock DURING multiball banks an extra ball for the end of the pack
        gs.extraBall += 1;
        gs.events.push({ type: 'extraball', willPay: gs.extraBall });
        return;
    }
    gs.locks += 1;
    gs.events.push({ type: 'lock', n: gs.locks });
    if (gs.locks >= TABLE.lock.need) startMultiball(gs);
}

function startMultiball(gs) {
    gs.locks = 0;
    gs.multiball = true; gs.saveUsed = false; gs.saveT = TABLE.saveTicks;
    gs.mbFlash = 60;
    add(gs, TABLE.rules.multiball);
    for (const k of TABLE.mbKick) {
        const p = newPuck(k.x, k.y, k.vx, k.vy);
        p.launched = true;
        gs.pucks.push(p);
    }
    gs.events.push({ type: 'multiball' });
}

// a drain while the pack is down: the ball is lost but NOT the game ball;
// the first drain inside the save window relaunches instead.
function packDrain(gs, idx) {
    gs.pucks.splice(idx, 1);
    if (!gs.saveUsed && gs.saveT > 0) {
        gs.saveUsed = true;
        const p = newPuck(TABLE.plunger.x, 500, 0, -950);
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
    // bonus pays the drop-target ladder this ball collected, × mult
    const bonus = gs.bankHits * TABLE.rules.bonusPerTarget * gs.mult;
    gs.lastBonus = bonus; gs.score += bonus; gs.bankHits = 0;
    if (bonus > 0) gs.events.push({ type: 'bonus', value: bonus });
    gs.events.push({ type: 'drain' });
    gs.balls -= 1; gs.drainFx = 30;
    if (gs.balls <= 0) {
        gs.balls = 0; gs.done = true; gs.phase = 'over';
        gs.pucks = [];
        gs.events.push({ type: 'gameover' });
    } else {
        resetBall(gs);
        gs.events.push({ type: 'ballstart', ball: gs.balls });
    }
}

// -------------------------------------------------- state & hash ----
export function stateOf(gs) {
    return {
        tick: gs.tick, score: gs.score, done: gs.done,
        seed: gs.seed >>> 0,      // #3103 seed pin: reports must carry the seed
        balls: gs.balls, phase: gs.done ? 'over' : 'play',
        mult: gs.mult, tilt: gs.tilt, nudge: gs.nudgeMeter,
        targetsDown: gs.targetDown.filter(Boolean).length,
        spinnerTurns: gs.spinnerTurns, launched: gs.launched,
        // ---- rung 2 ----
        liveBalls: gs.pucks.length, locks: gs.locks,
        multiball: gs.multiball, extraBall: gs.extraBall,
        rampHits: gs.rampHits, saveT: gs.saveT,
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
        gs.locks, gs.multiball ? 1 : 0, gs.extraBall, gs.rampHits, gs.saveUsed ? 1 : 0,
        gs.seed >>> 0];
    let h = 0x811c9dc5;
    const s = parts.join(',');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
}
