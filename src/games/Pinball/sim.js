// PINBALL — CABINET ONE — pure simulation (issue #3103, rung 1).
// Zero DOM, zero Math.random: every physics constant, the table layout and the
// rules are plain data so scripts/pinballcheck.mjs proves the game in Node.
//
// The engine is TABLE-DRIVEN (issue spec: "tables are data on that engine"):
// `stepGame` knows only primitive elements — walls, circles (pop bumpers),
// slings, drop targets, a spinner zone, a kicker zone, flippers, a plunger,
// drains — and scores them through the table's `rules` map. A new cabinet must
// never need new physics; that is the whole contract of the shared engine.
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

// ------------------------------------------------------------ rng ----
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
export const TABLE = {
    id: 'cabinet-one',
    balls: 3,
    // Outer shell. oneWay:true collides only from the side the (dy,-dx)
    // normal faces — used so a launched ball leaves the lane over the arc but
    // the lane's inner wall stays solid for the ball riding up it.
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
    },
};

// ----------------------------------------------------- game state ----
export function makeGame(seed = 1) {
    const gs = {
        seed: seed >>> 0, rng: mulberry32((seed >>> 0) ^ 0x9e3779b9),
        tick: 0, score: 0, balls: TABLE.balls, done: false, phase: 'play',
        bx: TABLE.plunger.x, by: TABLE.plunger.restY, vx: 0, vy: 0,
        launched: false, plungerHold: false, power: 0, laneIdle: 0, laneCurved: false,
        ang: { L: TABLE.flippers.L.rest, R: TABLE.flippers.R.rest },
        angV: { L: 0, R: 0 },
        bumperCd: TABLE.bumpers.map(() => 0), slingCd: TABLE.slings.map(() => 0),
        targetDown: TABLE.targets.map(() => false),
        bankLit: false, bankHits: 0, banksThisBall: 0, mult: 1,
        spinnerSpin: 0, spinnerTurns: 0, spinnerArm: true,
        kickCd: 0,
        nudgeMeter: 0, nudgeDecay: 0, tilt: false,
        lastBonus: 0, drainFx: 0,
        lastLeft: false, lastRight: false, lastB: false,
        events: [],
    };
    return gs;
}

export function resetBall(gs) {
    gs.bx = TABLE.plunger.x; gs.by = TABLE.plunger.restY; gs.vx = 0; gs.vy = 0;
    gs.launched = false; gs.power = 0; gs.laneIdle = 0; gs.plungerHold = false; gs.laneCurved = false;
    gs.targetDown = TABLE.targets.map(() => false); gs.bankLit = false;
    gs.spinnerSpin = 0; gs.spinnerArm = true; gs.tilt = false;
    gs.nudgeMeter = 0; gs.nudgeDecay = 0; gs.mult = 1; gs.banksThisBall = 0;
}

const deg = Math.PI / 180;

function segHit(gs, x1, y1, x2, y2, halfW, e, fr) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1e-9;
    let t = ((gs.bx - x1) * dx + (gs.by - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + dx * t, py = y1 + dy * t;
    let nx = gs.bx - px, ny = gs.by - py;
    const d2 = nx * nx + ny * ny;
    const rr = BALL_R + halfW;
    if (d2 >= rr * rr || d2 < 1e-12) return null;
    const d = Math.sqrt(d2);
    nx /= d; ny /= d;
    gs.bx = px + nx * rr; gs.by = py + ny * rr;
    const vn = gs.vx * nx + gs.vy * ny;
    if (vn >= 0) return { nx, ny, t, grazed: true };
    gs.vx -= (1 + e) * vn * nx; gs.vy -= (1 + e) * vn * ny;
    // tangential friction
    const tx = -ny, ty = nx;
    const vt = gs.vx * tx + gs.vy * ty;
    gs.vx -= vt * fr * tx; gs.vy -= vt * fr * ty;
    return { nx, ny, t, vn };
}

function flipperHit(gs, side) {
    const f = TABLE.flippers;
    const px = side === 'L' ? f.L.px : f.R.px;
    const py = f.pivotY;
    const a = gs.ang[side] * deg;
    const tipX = px + Math.cos(a) * f.len, tipY = py + Math.sin(a) * f.len;
    const dx = tipX - px, dy = tipY - py;
    const len2 = dx * dx + dy * dy;
    let t = ((gs.bx - px) * dx + (gs.by - py) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = px + dx * t, cy = py + dy * t;
    let nx = gs.bx - cx, ny = gs.by - cy;
    const d2 = nx * nx + ny * ny;
    const rr = BALL_R + f.halfW;
    if (d2 >= rr * rr || d2 < 1e-12) return;
    const d = Math.sqrt(d2);
    nx /= d; ny /= d;
    gs.bx = cx + nx * rr; gs.by = cy + ny * rr;
    // moving-surface response: surface velocity = ω × r, all in px/s.
    // angV is degrees/SUBSTEP → rad/s is angV·(π/180)·60·SUB.
    const w = gs.angV[side] * deg * 60 * SUB;            // rad/s
    const rx = cx - px, ry = cy - py;
    const svx = -w * ry, svy = w * rx;
    const rvx = gs.vx - svx, rvy = gs.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    const e = 0.45;
    let nvx = rvx - (1 + e) * vn * nx;
    let nvy = rvy - (1 + e) * vn * ny;
    // extra flip impulse where the swing meets the ball, scaled by lever arm
    const lever = Math.sqrt(rx * rx + ry * ry);
    const kick = Math.abs(w) * lever * 0.10;
    nvx += nx * kick; nvy += ny * kick;
    gs.vx = Math.max(-1600, Math.min(1600, nvx));
    gs.vy = Math.max(-1600, Math.min(1600, nvy));
}

function substep(gs, dt) {
    gs.vy += GRAV * dt;
    gs.bx += gs.vx * dt;
    gs.by += gs.vy * dt;

    // static walls
    for (const w of TABLE.walls) segHit(gs, w.x1, w.y1, w.x2, w.y2, 0, w.e ?? WALL_E, WALL_FR);
    // top arc as sampled segments
    const arc = TABLE.arc;
    for (let i = 0; i < arc.segs; i++) {
        const a1 = arc.from + (arc.to - arc.from) * (i / arc.segs);
        const a2 = arc.from + (arc.to - arc.from) * ((i + 1) / arc.segs);
        segHit(gs, arc.cx + Math.cos(a1) * arc.rx, arc.cy + Math.sin(a1) * arc.ry,
            arc.cx + Math.cos(a2) * arc.rx, arc.cy + Math.sin(a2) * arc.ry, 0, WALL_E, WALL_FR);
    }
    // outlane guide
    const og = TABLE.outlaneGuide;
    segHit(gs, og.x1, og.y1, og.x2, og.y2, 0, WALL_E, WALL_FR);

    // pop bumpers
    TABLE.bumpers.forEach((b, i) => {
        if (gs.bumperCd[i] > 0) { gs.bumperCd[i] -= 1; return; }
        const nx = gs.bx - b.x, ny = gs.by - b.y;
        const rr = BALL_R + b.r;
        const d2 = nx * nx + ny * ny;
        if (d2 >= rr * rr || d2 < 1e-12) return;
        const d = Math.sqrt(d2);
        const ux = nx / d, uy = ny / d;
        gs.bx = b.x + ux * rr; gs.by = b.y + uy * rr;
        gs.vx = ux * 420; gs.vy = uy * 420 - 60;
        gs.bumperCd[i] = 5;
        gs.score += TABLE.rules.bumper; gs.bankHits += 1;
        gs.events.push({ type: 'bumper', i, x: b.x, y: b.y });
    });

    // slingshots
    TABLE.slings.forEach((s, i) => {
        if (gs.slingCd[i] > 0) { gs.slingCd[i] -= 1; return; }
        const hit = segHit(gs, s.x1, s.y1, s.x2, s.y2, 3, 0.55, 0.02);
        if (hit && !hit.grazed && hit.vn < 0) {
            gs.vx += hit.nx * 240; gs.vy += hit.ny * 240 - 40;
            gs.slingCd[i] = 4;
            gs.score += TABLE.rules.sling;
            gs.events.push({ type: 'sling', i, x: gs.bx, y: gs.by });
        }
    });

    // drop targets
    if (!gs.bankLit) {
        TABLE.targets.forEach((tp, i) => {
            if (gs.targetDown[i]) return;
            const hit = segHit(gs, tp.x1, TABLE.targetY, tp.x2, TABLE.targetY, 2, 0.4, 0.02);
            if (hit && !hit.grazed && hit.vn < 0) {
                gs.targetDown[i] = true;
                gs.score += TABLE.rules.target; gs.bankHits += 1;
                gs.events.push({ type: 'target', i, x: (tp.x1 + tp.x2) / 2, y: TABLE.targetY });
                if (gs.targetDown.every(Boolean)) {
                    gs.bankLit = true; gs.banksThisBall += 1;
                    gs.mult = Math.min(TABLE.rules.multCap, 1 + gs.banksThisBall);
                    gs.score += TABLE.rules.bankClear;
                    gs.events.push({ type: 'bank', x: 187, y: TABLE.targetY });
                }
            }
        });
    }

    // spinner in the left outlane: ticks as the ball rolls down past it
    const sp = TABLE.spinner;
    if (gs.bx < sp.xMax && gs.by > sp.yFrom && gs.by < sp.yTo) {
        if (gs.spinnerArm) { gs.spinnerSpin = 0; gs.spinnerArm = false; }
        if (gs.vy > 0) {
            gs.spinnerSpin += gs.vy * dt;
            while (gs.spinnerSpin >= sp.pxPerTurn) {
                gs.spinnerSpin -= sp.pxPerTurn; gs.spinnerTurns += 1;
                gs.score += TABLE.rules.spinner;
                gs.events.push({ type: 'spinner', x: sp.xMax - 8, y: gs.by });
            }
        }
    } else gs.spinnerArm = true;

    // outlane kicker
    const k = TABLE.kicker;
    if (gs.kickCd > 0) gs.kickCd -= 1;
    else if (gs.bx < k.xMax && gs.by > k.yAt && gs.vy > 0) {
        gs.vx = k.vx; gs.vy = k.vy; gs.kickCd = 20;
        gs.score += TABLE.rules.kicker;
        gs.events.push({ type: 'kicker', x: gs.bx, y: gs.by });
    }

    // flippers: animate per substep, then collide (dead while tilted — they hang limp)
    const f = TABLE.flippers;
    ;['L', 'R'].forEach((side) => {
        const held = side === 'L' ? gs.padL : gs.padR;
        const target = held ? f[side].up : f[side].rest;
        const rate = (held ? f.upRate : f.downRate) / SUB;
        const prev = gs.ang[side];
        if (prev < target) gs.ang[side] = Math.min(target, prev + rate);
        else if (prev > target) gs.ang[side] = Math.max(target, prev - rate);
        gs.angV[side] = gs.ang[side] - prev;
        if (gs.tilt) flipperDead(gs, side); else flipperHit(gs, side);
    });
}

function flipperDead(gs, side) {   // tilted: flippers limp, still solid
    const f = TABLE.flippers;
    const px = side === 'L' ? f.L.px : f.R.px, py = f.pivotY;
    const a = gs.ang[side] * deg;
    segHit(gs, px, py, px + Math.cos(a) * f.len, py + Math.sin(a) * f.len, f.halfW, 0.2, 0.1);
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
        gs.vy -= 200; gs.vx += (gs.rng() - 0.5) * 90;
        gs.nudgeMeter += 1; gs.nudgeDecay = TABLE.tilt.decayTicks;
        gs.events.push({ type: 'nudge' });
        if (gs.nudgeMeter >= TABLE.tilt.max) {
            gs.tilt = true; gs.events.push({ type: 'tilt' });
        } else if (gs.nudgeMeter === TABLE.tilt.max - 1) gs.events.push({ type: 'tiltwarn' });
    }
    gs.lastB = !!pad.b;
    if (gs.nudgeDecay > 0) { gs.nudgeDecay -= 1; if (gs.nudgeDecay === 0 && !gs.tilt) gs.nudgeMeter = 0; }

    // plunger: hold a/down with the ball in the lane, release to fire.
    // The auto-plunge clock counts ALL ticks the ball sits in the lane — a few
    // frantic taps must never lock out the auto-plunger forever (a ball that
    // never launches is not a game).
    const inLane = gs.bx > 322 && gs.by > 515 && gs.vy > -50
    if (inLane) {
        gs.launched = false
        gs.laneCurved = false
        gs.laneIdle += 1
        const hold = !!pad.a || !!pad.down
        if (hold) { gs.power = Math.min(1, gs.power + TABLE.plunger.chargeRate / 60); gs.plungerHold = true }
        else {
            if (gs.plungerHold && gs.power > 0.06) fire(gs)
            gs.plungerHold = false
        }
        if (!hold && gs.laneIdle > TABLE.plunger.autoTicks) fire(gs, TABLE.plunger.autoPower)
    }

    // flippers (animated INSIDE the substep loop so a 2700°/s sweep can never
    // jump past the ball between collision checks)
    gs.padL = !gs.tilt && !!pad.left
    gs.padR = !gs.tilt && !!pad.right
    for (let i = 0; i < SUB; i++) substep(gs, 1 / (60 * SUB));

    // lane guide curl: a launched ball crossing the lane mouth is steered left,
    // the way a real launch-lane guide curls it toward the arc apex instead of
    // letting it rain straight back down the lane.
    if (gs.launched && gs.bx > 322 && gs.by < 170 && gs.vy < 0 && !gs.laneCurved) { gs.vx -= 150; gs.laneCurved = true; }

    // drain
    if (gs.by > TABLE.drainY) drain(gs);

    if (gs.drainFx > 0) gs.drainFx -= 1;
    return gs;
}

function fire(gs, pw = gs.power) {
    gs.vy = -(TABLE.plunger.minV + (TABLE.plunger.maxV - TABLE.plunger.minV) * pw);
    gs.vx = 0; gs.launched = true; gs.power = 0; gs.laneIdle = 0; gs.plungerHold = false;
    gs.events.push({ type: 'plunge', power: pw });
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
        balls: gs.balls, phase: gs.done ? 'over' : 'play',
        mult: gs.mult, tilt: gs.tilt, nudge: gs.nudgeMeter,
        targetsDown: gs.targetDown.filter(Boolean).length,
        spinnerTurns: gs.spinnerTurns, launched: gs.launched,
        hash: stateHash(gs),
    };
}

export function stateHash(gs) {
    const q = (v) => Math.round(v * 4);   // 0.25 px / px·s⁻¹ resolution
    const parts = [q(gs.bx), q(gs.by), q(gs.vx), q(gs.vy),
        q(gs.ang.L), q(gs.ang.R), gs.tick, gs.score, gs.balls,
        gs.targetDown.map((d) => (d ? 1 : 0)).join(''), gs.mult, gs.tilt ? 1 : 0,
        gs.spinnerTurns, gs.launched ? 1 : 0, gs.seed >>> 0];
    let h = 0x811c9dc5;
    const s = parts.join(',');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
}
