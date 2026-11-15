// ARENA ARCHERY — the pure duel. step(state, in1, in2) is the whole world:
// two archers, ballistic arrows, and stuck arrows that ARE terrain until
// someone walks over and pulls one back out of the wall.
//
// The discipline this file exists to keep (the lode lesson, two players):
//   - zero Math.random, zero Date.now, zero floats from the outside world;
//   - ONE input stamp per tick, applied P1-then-P2 in a fixed order, so a
//     keyboard collision (both players, same frame) resolves identically in
//     the tab, in the harness, and in a replay ten years from now;
//   - an exact arrow ledger every tick: quivers + flying + falling + stuck
//     + scored + lost == the starting total. An arrow may change state,
//     never go for a walk uncounted.
//
// The issue's two muscles:
//   - ballistics: a released arrow carries (vx, vy) with gravity; a 45°
//     lob's range is r = v²/g, which is a closed form the bot solves and
//     the harness pins to the cell. Charge sets v, stick sets angle.
//   - stuck arrows as terrain: hit stone and the arrow sticks — in the
//     AIR cell beside what it hit (floors stick one above the stone so a
//     walking archer can pull them back; walls hold their arrows until the
//     TTL recycles them). While stuck an arrow KNOCKS OUT any flying arrow
//     that crosses it: the newcomer takes the cell and the spent rival is
//     counted lost on the ledger. Stepping on a stuck arrow PULLS it out
//     into your quiver if there is room.

import { buildArena } from './levels.js'

export const CFG = {
    cell: 24,
    gravity: 0.35,
    jump: 5.8,            // apex = jump²/2g = 48 px = exactly 2 cells
    move: 2.6,
    accel: 0.55,
    chargeRate: 1 / 28,
    arrowMin: 4.0,
    arrowMax: 8.2,
    arrowGravity: 0.14,
    quiver: 6,
    winScore: 3,
    matchTicks: 3600,
    respawnTicks: 75,
    invulnTicks: 45,
    stuckTTL: 1200,
    // #2377 THE ARENA HEATS UP — dry-spell pressure. When heatTicks pass
    // without a HIT the duel goes HOT: every stuck arrow's age drains at
    // heatRot times the rate, so the barricades a defensive duel builds near
    // the wall evaporate and hoarding cover stops being a winning schedule.
    // First blood cools it the same tick. Measured (archerycheck HEAT pins):
    // the proven autopilot's longest dry spell across all arenas is 275
    // ticks, so 450 (15 s) is pressure no honest match ever feels — only a
    // stalemate does. heat:false is the test-only kill switch (mutant).
    heatTicks: 450,
    heatRot: 3,
    // test-only switches so the harness can prove each muscle is load-bearing
    heat: true,           // false: dry spells never heat the arena
    ballistics: true,     // false: arrows fly dead flat
    stick: true,          // false: arrows phase through stone
    knockout: true,       // false: arrows fly through stuck arrows
    retrieve: true,       // false: stuck arrows can never be pulled out
    ttlRelease: true,     // false: stuck arrows never expire
    // the basic bot (the "mean twin"): it shoots FLAT, keeping the foe just
    // beyond its flat-shot reach, so a miss drops on the FLOOR where a walk
    // pulls it back and the quiver economy circulates. The old version
    // LOBED and walked in point-blank: its misses silted the unreachable
    // ledges until both quivers ran dry and the duel sat frozen ~20 s
    // (#1685) — and it out-scored the weakened autopilot, failing the slack
    // rule. bot0Lobs flips it back to the lob for the mutant.
    bot0Lobs: false,      // false: flat (the fix); true: the #1685 lob
    bot0Release: 0.5,     // the basic bot's draw release — flat-shot power
    bot0Range: 130,       // stops walking in here — beyond flat-shot reach
    // #2307 the climb doctrine (TowerFall's soul): the autopilot takes the
    // high ground ON PURPOSE — walks to the base of a reachable step and
    // hops the ledge chain instead of fighting on the floor and hopping at
    // walls. false (harness mutant) parks the bot back on the flat.
    climbSeek: true,
}

export const SOLID = 1
export const EMPTY = 0
const R = 8                 // archer radius (px); a bit under half a cell

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

export function makeGame(arena, opts = {}) {
    const a = arena || buildArena(0)
    const mk = (id, sp) => ({
        id, x: sp.x * CFG.cell + CFG.cell / 2, y: sp.y * CFG.cell + CFG.cell / 2 + (CFG.cell / 2 - R),
        vx: 0, vy: 0, face: id === 0 ? 1 : -1, grounded: true,
        charge: 0, firing: false, firePrev: false,
        aimX: id === 0 ? 1 : -1, aimY: 0,
        quiver: opts.quiver ?? CFG.quiver, quiverMax: opts.quiverMax ?? CFG.quiver,
        score: id === 1 ? (opts.p2Gift || 0) : 0,
        alive: true, deadT: 0, invuln: 0,
        // #2307 climb commitment (plain data — cloneGame/DebugKit carry it):
        // the step cell this archer is mid-climb toward, the lateral it holds
        // until landing, the tick it may next re-pick after an abort, and the
        // centre-row at lift-off (landing minus lift = the rows gained).
        climbTo: -1, climbDir: 0, climbHoldUntil: 0, climbCooldown: 0, liftRow: -1, climbAir: false, climbNo: -1, climbAim: 0, climbOff: 0, climbTried: -99,
        spawnX: sp.x * CFG.cell + CFG.cell / 2, spawnY: sp.y * CFG.cell + CFG.cell / 2 + (CFG.cell / 2 - R),
    })
    const g = {
        name: a.name, W: a.W, H: a.H, grid: a.grid.slice(),
        p: [mk(0, a.p1), mk(1, a.p2)],
        arrows: [], stuck: [],
        ledger: { hit: 0, lost: 0 },
        // #2377 dry-spell bookkeeping: the tick of the last HIT and whether
        // the arena is currently HOT (plain data — cloneGame/DebugKit carry
        // it; stateHash mixes neither, so the replay contract is untouched).
        lastHit: 0, heat: false,
        // #1739 pure bookkeeping: every quiver GAIN per player (pull, dryout,
        // respawn resupply). Lets a harness assert the exact economy identity
        // `quiver = start - loosed + receipts` — the pull-back the #1685 fix
        // added can land on the tick after a release, so a bare `quiver - 1`
        // sample no longer proves the shot. Never read by the sim itself;
        // stateHash stays what it was (the hash is the replay contract).
        receipts: [0, 0],
        tick: 0, end: null, winner: -1, events: [], cmds: [], arrowSeq: 0,
        total: 2 * (opts.quiver ?? CFG.quiver), supplied: 0,
    }
    return g
}

const solidAt = (g, px, py) => {
    const cx = Math.floor(px / CFG.cell), cy = Math.floor(py / CFG.cell)
    if (cx < 0 || cy < 0 || cx >= g.W || cy >= g.H) return true
    return g.grid[cy * g.W + cx] === SOLID
}

const groundedAt = (g, p) => solidAt(g, p.x - R + 2, p.y + R + 1) || solidAt(g, p.x + R - 2, p.y + R + 1)

function moveBody(g, p) {
    // axis-separated, sub-stepped so nothing tunnels through a 24 px cell
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) / 6))
    for (let s = 0; s < steps; s++) {
        p.x += p.vx / steps
        if (solidAt(g, p.x - R, p.y) || solidAt(g, p.x + R, p.y) ||
            solidAt(g, p.x - R, p.y - R + 2) || solidAt(g, p.x + R, p.y - R + 2) ||
            solidAt(g, p.x - R, p.y + R - 2) || solidAt(g, p.x + R, p.y + R - 2)) {
            p.x -= p.vx / steps
            p.vx = 0
        }
        p.y += p.vy / steps
        if (solidAt(g, p.x, p.y - R) || solidAt(g, p.x - R + 2, p.y - R) || solidAt(g, p.x + R - 2, p.y - R)) {
            p.y -= p.vy / steps
            p.vy = 0
        } else if (solidAt(g, p.x, p.y + R) || solidAt(g, p.x - R + 2, p.y + R) || solidAt(g, p.x + R - 2, p.y + R)) {
            p.y -= p.vy / steps
            if (p.vy > 0) p.vy = 0
        }
    }
    p.grounded = groundedAt(g, p)
    if (p.grounded && p.vy > 0) p.vy = 0
}

function looseArrow(g, p) {
    if (p.quiver <= 0) { g.events.push({ type: 'dry', who: p.id }); return }
    let ax = p.aimX, ay = p.aimY
    const m = Math.hypot(ax, ay) || 1
    ax /= m; ay /= m
    const v = CFG.arrowMin + (CFG.arrowMax - CFG.arrowMin) * p.charge
    g.arrows.push({
        id: ++g.arrowSeq, owner: p.id,
        x: p.x + ax * (R + 6), y: p.y + ay * (R + 6),
        vx: ax * v, vy: ay * v, state: 'fly', age: 0, cell: -1,
    })
    p.quiver--
    g.events.push({ type: 'loose', who: p.id, charge: p.charge })
}

function stickArrow(g, ar) {
    const cx = Math.floor(ar.x / CFG.cell), cy = Math.floor(ar.y / CFG.cell)
    let cell = cy * g.W + cx
    // A stuck arrow lives in AIR: an arrow nosing into a floor sticks in
    // the air cell above it — the cell a walking archer shares, and the
    // only place the pull-back economy can reach. A wall stays a wall
    // cell (visible, knocks, recycles on the TTL; you cannot pull an
    // arrow out of the middle of a wall you cannot touch).
    if (solidAt(g, ar.x, ar.y) && cy > 0 && !solidAt(g, ar.x, ar.y - CFG.cell)) cell = (cy - 1) * g.W + cx
    const old = g.stuck.find((s) => s.cell === cell)
    if (old) {
        // the newcomer replaces its rival in the cell — the old arrow is
        // spent (the ledger counts it lost), never dropped into a loop
        g.stuck.splice(g.stuck.indexOf(old), 1)
        const k = g.arrows.indexOf(old)
        if (k >= 0) g.arrows.splice(k, 1)
        g.ledger.lost++
    }
    ar.state = 'stuck'
    ar.cell = cell
    ar.ang = Math.atan2(ar.vy, ar.vx)
    ar.vx = 0; ar.vy = 0
    g.stuck.push(ar)
    g.events.push({ type: 'stick', who: ar.owner, cell })
}

function stuckAt(g, px, py) {
    const cell = Math.floor(py / CFG.cell) * g.W + Math.floor(px / CFG.cell)
    return g.stuck.find((s) => s.cell === cell) || null
}

function scoreHit(g, ar, victim) {
    const scorer = g.p[ar.owner]
    scorer.score++
    g.ledger.hit++
    g.lastHit = g.tick   // #2377 first blood breaks the dry spell
    if (CFG.heat && g.heat) {
        g.heat = false
        g.events.push({ type: 'cool', tick: g.tick })
    }
    victim.alive = false
    victim.deadT = CFG.respawnTicks
    victim.charge = 0
    g.events.push({ type: 'hit', who: scorer.id, victim: victim.id, score: scorer.score })
    if (scorer.score >= CFG.winScore) { g.end = 'win'; g.winner = scorer.id }
}

function stepPlayer(g, p, inp) {
    if (!p.alive) {
        p.deadT--
        if (p.deadT <= 0) {
            p.alive = true; p.x = p.spawnX; p.y = p.spawnY
            p.vx = 0; p.vy = 0; p.invuln = CFG.invulnTicks
            // the falconer's pouch: a risen archer always gets two fresh
            // shafts — an empty-quiver corner is otherwise un-winnable for
            // ever, and a rule the harness cannot count is a rule it will
            // silently break. Supplied arrows join the ledger's right side.
            const add = Math.min(p.quiverMax, p.quiver + 2) - p.quiver
            p.quiver += add
            g.supplied += add
            g.receipts[p.id] += add
            g.events.push({ type: 'respawn', who: p.id, resupply: add })
        }
        return
    }
    if (p.invuln > 0) p.invuln--
    const mx = inp ? clamp(inp.mx, -1, 1) : 0
    const my = inp ? clamp(inp.my, -1, 1) : 0
    const fire = inp ? !!inp.fire : false

    p.vx += (mx * CFG.move - p.vx) * CFG.accel
    if (mx > 0) p.face = 1
    else if (mx < 0) p.face = -1

    if (my > 0 && p.grounded) {
        p.vy = -CFG.jump
        p.grounded = false
        g.events.push({ type: 'jump', who: p.id })
    } else {
        p.vy += CFG.gravity
    }


    // the draw is one STATE MACHINE, one place: `firing` must be false
    // once a release loosed, or the NEXT tick looses a second arrow from
    // the same nock (and replays a stream the live game never played).
    // A release that shares its tick with a jump still looses: the arrow
    // leaves before any vertical state matters.
    if (fire) {
        p.firing = true
        p.charge = clamp(p.charge + CFG.chargeRate, 0, 1)
        // a stick only gives 8 directions, and straight up is a jump, not
        // a shot: up-with-no-sideways aims the 45° lob toward the facing.
        // A solver may take the stick off the aim entirely and name it.
        if (inp && inp.aim) { p.aimX = inp.aim.x; p.aimY = inp.aim.y }
        else if (mx !== 0) { p.aimX = mx; p.aimY = my !== 0 ? -Math.sign(my) : 0 }
        else if (my > 0) { p.aimX = p.face; p.aimY = -1 }
    } else if (p.firing) {
        // release: a level stick fires level at the facing; a solver-named
        // aim wins over the stick
        if (inp && inp.aim) { p.aimX = inp.aim.x; p.aimY = inp.aim.y }
        else { if (mx !== 0) p.aimX = mx; p.aimY = -my }
        looseArrow(g, p)
        p.firing = false
        p.charge = 0
    } else if (mx !== 0 || my !== 0) {
        p.aimX = mx
        p.aimY = my > 0 ? -1 : my < 0 ? 1 : 0
    }
    p.firePrev = fire

    moveBody(g, p)

    // pulling a stuck arrow out of the terrain (first body to touch wins)
    if (CFG.retrieve && p.quiver < p.quiverMax) {
        const s = stuckAt(g, p.x, p.y) || stuckAt(g, p.x, p.y + R - 2) || stuckAt(g, p.x, p.y - R + 2)
        if (s) {
            g.stuck.splice(g.stuck.indexOf(s), 1)
            const k = g.arrows.indexOf(s)
            if (k >= 0) g.arrows.splice(k, 1)
            p.quiver++
            g.receipts[p.id]++
            g.events.push({ type: 'pull', who: p.id, cell: s.cell })
        }
    }
}

function stepArrows(g) {
    for (let i = g.arrows.length - 1; i >= 0; i--) {
        const ar = g.arrows[i]
        if (ar.state === 'stuck') continue
        ar.age++
        if (CFG.ballistics) ar.vy += CFG.arrowGravity
        if (ar.state === 'fall') {
            // a dropped arrow sticks wherever it lands
            ar.x += ar.vx
            ar.y += ar.vy
            if (solidAt(g, ar.x, ar.y + 1) || ar.age > 400) {
                stickArrow(g, ar)
            }
            continue
        }
        const steps = Math.max(1, Math.ceil(Math.hypot(ar.vx, ar.vy) / 6))
        let done = false
        for (let s = 0; s < steps && !done; s++) {
            ar.x += ar.vx / steps
            ar.y += ar.vy / steps
            if (!CFG.stick && solidAt(g, ar.x, ar.y)) {
                // mutant path: no sticking — the arrow leaves the world
                g.arrows.splice(i, 1); g.ledger.lost++; done = true; break
            }
            if (solidAt(g, ar.x, ar.y)) { stickArrow(g, ar); done = true; break }
            if (CFG.knockout) {
                const s2 = stuckAt(g, ar.x, ar.y)
                if (s2) {
                    g.events.push({ type: 'knockout', who: ar.owner, cell: s2.cell })
                    stickArrow(g, ar)
                    done = true
                    break
                }
            }
            for (const q of g.p) {
                if (!q.alive || q.id === ar.owner || q.invuln > 0) continue
                if (Math.hypot(q.x - ar.x, q.y - ar.y) < R + 3) {
                    scoreHit(g, ar, q)
                    g.arrows.splice(i, 1)
                    done = true
                    break
                }
            }
        }
        if (!done && (ar.x < -40 || ar.x > g.W * CFG.cell + 40 || ar.y > g.H * CFG.cell + 40)) {
            g.arrows.splice(i, 1); g.ledger.lost++
        }
    }
    // stuck arrows dry out and walk home on their own. #2377: while the
    // arena is HOT every stuck arrow's age drains at heatRot times the rate
    // here, and the 1-per-tick `age++` in step() stays 1× — so a hot tick
    // advances stuck-age by 1 + heatRot where a cool tick adds 1 + 1. An
    // arrow keeps its flight age when it sticks, so the dryout tick is
    // (age at stick) + the ticks it takes the drain to cross stuckTTL:
    // measured under constant rot, hot cover lasts half a cool lifetime
    // (~20 s of wall armour → ~10 s). The harness pins the dryout tick to
    // exact arithmetic off the observed age, not vibes.
    if (CFG.ttlRelease) {
        const rot = g.heat ? CFG.heatRot : 1
        for (let i = g.stuck.length - 1; i >= 0; i--) {
            const s = g.stuck[i]
            s.age += rot
            if (s.age > CFG.stuckTTL) {
                g.stuck.splice(i, 1)
                const k = g.arrows.indexOf(s)
                if (k >= 0) g.arrows.splice(k, 1)
                const owner = g.p[s.owner]
                if (owner.quiver < owner.quiverMax) { owner.quiver++; g.receipts[s.owner]++ }
                else g.ledger.lost++
                g.events.push({ type: 'dryout', who: s.owner, cell: s.cell })
            }
        }
    }
}

// one world tick: P1 acts, then P2 (the ORDER is the input stamp), then the
// world resolves. Anything sampled by two players in one frame meets here.
export function step(g, in1 = null, in2 = null) {
    if (g.end) return
    // #2377 gate runs BEFORE the players and arrows resolve: the hot flag a
    // frame uses is decided by the dry spell at its start, so an arrow that
    // sticks on the very tick heat begins already rots at the hot rate
    // (scoreHit cools it synchronously the tick blood is drawn).
    if (CFG.heat) {
        const hot = g.tick - g.lastHit >= CFG.heatTicks
        if (hot && !g.heat) { g.heat = true; g.events.push({ type: 'heat', tick: g.tick }) }
        else if (!hot && g.heat) { g.heat = false; g.events.push({ type: 'cool', tick: g.tick }) }
    }
    stepPlayer(g, g.p[0], in1)
    stepPlayer(g, g.p[1], in2)
    stepArrows(g)
    for (const s of g.stuck) s.age++
    g.tick++
    if (!g.end && g.tick >= CFG.matchTicks) {
        g.end = 'time'
        g.winner = g.p[0].score === g.p[1].score ? -1 : g.p[0].score > g.p[1].score ? 0 : 1
    }
    if (g.end) g.events.push({ type: 'over', winner: g.winner, why: g.end })
}

// ---------------------------------------------------------------- solver ----
// forward-simulate the ACTUAL Euler trajectory the released arrow will fly
// (muzzle offset, substeps, gravity — all included), and only call it a
// shot if it passes within reach of the led point before terrain eats it.
// Straight-line LOS was the naive gate and it lied: the lob bulges above
// the chord and stuck under CROSSGLOVE's canopies for a whole stage.
function predictHit(g, me, tx, ty, ax, ay, charge) {
    const v = CFG.arrowMin + (CFG.arrowMax - CFG.arrowMin) * charge
    const m = Math.hypot(ax, ay) || 1
    let x = me.x + (ax / m) * (R + 6)
    let y = me.y + (ay / m) * (R + 6)
    const vx = (ax / m) * v
    let vy = (ay / m) * v
    for (let t = 0; t < 140; t++) {
        // the exact integrator stepArrows runs: gravity first, then two
        // half-moves with terrain AND stuck-arrow checks — a prediction
        // that ignores the arrows already in the wall promises shots the
        // duel will never allow
        vy += CFG.arrowGravity
        for (let s = 0; s < 2; s++) {
            x += vx / 2
            y += vy / 2
            if (solidAt(g, x, y)) return -1
            if (CFG.knockout && stuckAt(g, x, y)) return -1
        }
        if (Math.hypot(x - tx, y - ty) < R + 3) return t
        if (x < 0 || x > g.W * CFG.cell) return -1
    }
    return -1
}

// One policy, two skills. The autopilot drives P1 in the attract demo and
// in the harness; the basic bot is its mean twin. Pure over the game state:
// no RNG, ties break by id, and the lob aim is the closed 45° form the
// harness pins to the cell — so a hit here is the SAME hit on screen.

// ---------------------------------------------- deliberate climbing (#2307) ----
// TowerFall doctrine: the high ground is the soul of the duel, and the
// levels contract guarantees every chain step is <= the jump apex (exactly
// 2 cells). So a climb is a NAMEABLE move, not a hopeful hop.
// Standing geometry, verified tick-by-tick against moveBody/groundedAt:
// an archer's CENTRE row equals the row it stands at — on the floor the
// centre is in the floor's own border row; on a one-row slab of row S the
// centre rests in row S (feet on the slab's top face, edge probes into the
// slab's end cells). A step is therefore: slab row = cur - gain (gain >= 1,
// <= apex 2 rows), that row stone at the landing column, the headroom row
// above open, and an unobstructed walk to the take-off at the body's row
// now. Take-off discipline (same empirical run): jump when the landing
// column centre is ~1.5 cells ahead — closer grazes the lip, further
// arrives below it.
function reachableStep(g, p, prefCx, maxRise, maxCols, banCell = -1, grants = null) {
    if (!p.grounded) return null
    const cur = Math.floor(p.y / CFG.cell)
    const c0 = Math.floor(p.x / CFG.cell)
    const open = (cx, r) => cx >= 1 && cx <= g.W - 2 && r >= 1 && r <= g.H - 2 && g.grid[r * g.W + cx] === 0
    const stone = (cx, r) => cx >= 0 && cx <= g.W - 1 && r >= 0 && r <= g.H - 1 && g.grid[r * g.W + cx] === SOLID
    // a stuck arrow is solid to the flying arrow AND to the jumping body:
    // its cell at head height (the row the head occupies above the feet)
    // turns the hop into a ceiling-bump. The route must be sky-clear.
    const sky = (cx, r) => !g.stuck.some((s) => s.cell === r * g.W + cx)
    const cand = []
    for (let gain = 1; gain <= maxRise; gain++) {
        const slab = cur - gain
        if (slab < 2) break
        const lo = Math.max(1, c0 - maxCols), hi = Math.min(g.W - 2, c0 + maxCols)
        for (let cx = lo; cx <= hi; cx++) {
            if (!stone(cx, slab)) continue                        // the slab you land on
            if (!open(cx, slab - 1)) continue                     // headroom above the slab
            if (slab * g.W + cx === banCell) continue
            if (!sky(cx, slab) || !sky(cx, slab - 1)) continue   // landing approach clear
            if (prefCx != null && cx !== prefCx) continue
            const dir = cx > c0 ? 1 : cx < c0 ? -1 : 0
            if (dir === 0) continue                              // straight-up cannot cross a riser
            // walking to the take-off must be clear at the body's row now,
            // and the two columns before the riser need head-room sky too
            let blocked = false
            for (let c = Math.min(c0, cx) + (dir > 0 ? 1 : 0); dir > 0 ? c < cx : c > cx; c += dir) {
                if (!open(c, cur) || !sky(c, cur) || !sky(c, cur - 1)) { blocked = true; break }
            }
            if (blocked) continue
            const d = Math.abs(cx - c0) * CFG.cell + gain * 2
            cand.push({ d, cell: slab * g.W + cx, cx, stand: slab, gain, dir })
        }
    }
    // nearest-first, but only a hop the integrator grants may win
    cand.sort((a, b) => a.d - b.d)
    for (const c of cand) if (!grants || grants(c)) return c
    return null
}

// Physics, not optimism: before committing, replay the hop's own legs
// through moveBody on a body-shaped clone (read-only over g — the clone
// carries the live grid and stuck list). A step is climbable when the real
// integrator says so: the clone leaves the ground, and next lands with its
// centre a row ABOVE the lift-off. 15 candidates x ~40 cheap steps at pick
// time only; this is also what makes the receipts honest — the doctrine
// commits ONLY to hops the world will grant.
function hopGrants(g, p, cx, slabRow, dir, out) {
    // Physics of a granted hop: a jump taken AT SPEED near the slab's near
    // edge puts the apex above the slab's top face, and the ~17 airborne
    // ticks at 2.6 px glide the body ONTO the slab before the descent
    // finishes. The plan is (near edge, off, aim): sweep aim 1..2 cells
    // into the slab and take-off 2..5 cells out on the approach side; the
    // first combination the real moveBody lands high is the plan.
    const slabAt = (c) => c >= 0 && c <= g.W - 1 && g.grid[slabRow * g.W + c] === SOLID
    let near = cx
    for (let k = 0; k < 8; k++) if (slabAt(near - dir)) near -= dir
    const startRow = Math.floor(p.y / CFG.cell)
    for (let into = 1; into <= 2; into++) {
        const aim = near + dir * into
        const lx = aim * CFG.cell + CFG.cell / 2
        for (let off = 2; off <= 5; off++) {
            const tx = lx - dir * off * CFG.cell
            if ((tx - p.x) * dir < -CFG.cell / 2) continue   // behind the bot for this approach
            const sim = {
                W: g.W, H: g.H, grid: g.grid, stuck: g.stuck,
                p: [{ id: p.id, x: p.x, y: p.y, vx: 0, vy: 0, grounded: true }],
            }
            const b = sim.p[0]
            let air = false
            let ok = false
            for (let t = 0; t < 52; t++) {
                const to = (tx - b.x) * dir
                if (b.grounded) {
                    if (air) { ok = Math.floor(b.y / CFG.cell) <= startRow - 1; break }
                    b.vx += ((to > 0.5 * CFG.cell ? dir * CFG.move : 0) - b.vx) * CFG.accel
                    if (to <= 0.5 * CFG.cell) b.vy = -CFG.jump
                    else b.vy += CFG.gravity
                } else {
                    b.vx += ((dir * CFG.move) - b.vx) * CFG.accel
                    b.vy += CFG.gravity
                }
                moveBody(sim, b)
                if (!b.grounded) air = true
            }
            if (ok) { if (out) { out.off = off; out.ax = aim; out.near = near } return true }
        }
    }
    return false
}

// One climb decision per tick: hold a committed step, or pick a new one.
// Writes ONLY the p.climb* bookkeeping (plain data; the sim never reads it),
// and returns { mx, my } when the climb owns the feet this tick.
function climbStep(g, p) {
    // a commitment ends only after real airtime: the pick tick itself is
    // still grounded (the jump executes inside step, after this returned),
    // and a release without lift was a mis-read, not a landing
    if (p.climbTo >= 0 && p.grounded && p.climbAir) {
        const gained = p.liftRow - Math.floor(p.y / CFG.cell)
        p.climbNo = gained <= 0 ? p.climbTo : -1
        p.climbTo = -1; p.liftRow = -1; p.climbHoldUntil = 0; p.climbAir = false
        if (gained <= 0) p.climbCooldown = g.tick + 20   // the riser won: park the plan, keep the duel
    }
    // A committed climb owns the feet outright — the shot/distance blocks
    // must not steal the input mid-hop (they still solve and FIRE above:
    // only the legs are spoken for). Take-off discipline: walk until the
    // landing column is ~1.5 cells ahead, then jump — a jump taken from too
    // far arrives at the slab below its lip, and one taken from under it is
    // a hop against a wall.
    if (p.climbTo >= 0) {
        const lx = p.climbAim * CFG.cell + CFG.cell / 2
        const tx = lx - p.climbDir * p.climbOff * CFG.cell
        if (!p.grounded) { p.climbHoldUntil = g.tick; p.climbAir = true }
        const to = (tx - p.x) * p.climbDir
        const mx = p.grounded ? (to > 0.5 * CFG.cell ? p.climbDir : 0) : p.climbDir
        const jump = !p.grounded ? 1 : (to <= 0.5 * CFG.cell ? 1 : 0)
        return { mx, my: jump }
    }
    if (!p.grounded || !CFG.climbSeek || g.tick < p.climbCooldown) return null
    // the oracle is not cheap; re-plan at most every 12 ticks — a window
    // the duel can afford, and far below the 30 Hz frame budget
    if (g.tick - p.climbTried < 12) return null
    p.climbTried = g.tick
    const prefer = Math.floor(g.p[1 - p.id].x / CFG.cell)
    const plan = {}
    const step = reachableStep(g, p, prefer, 2, 6, p.climbNo, (c) => hopGrants(g, p, c.cx, c.stand, c.dir, plan))
        || reachableStep(g, p, null, 1, 6, p.climbNo, (c) => hopGrants(g, p, c.cx, c.stand, c.dir, plan))
    if (!step) return null
    p.climbTo = step.cell
    p.climbAim = plan.ax
    p.climbOff = plan.off
    p.climbDir = step.dir
    p.liftRow = Math.floor(p.y / CFG.cell)
    p.climbAir = false
    return { mx: step.dir, my: 0 }
}

export function botInput(g, meId, skill) {
    const me = g.p[meId], foe = g.p[1 - meId]
    if (!me.alive) return { mx: 0, my: 0, fire: false }
    let mx = 0, my = 0, fire = false
    let climbed = false
    const above = foe.alive && foe.y < me.y - CFG.cell / 2

    // a low-ammo archer is a scavenger: nearest PULLABLE stuck arrow,
    // first. The pull probes the bot's centre row, and this bot never
    // climbs ledge chains, so only an arrow in the bot's OWN row is a
    // target — anything else is scenery until the TTL frees it. The old
    // pick was nearest-by-X alone: a ledge arrow four rows up pinned a
    // whole duel (both bots stood under their own ammo with zero input,
    // #1685), and a two-row-up arrow under a capped shaft became a
    // hop-forever bounce loop that never got its centre into the cell.
    let scavenging = false
    let dry = false
    if (foe.alive && (me.quiver === 0 || (skill > 0 && me.quiver < 2))) {
        const myRow = Math.floor(me.y / CFG.cell)
        let best = null, bd = 1e9
        for (const s of g.stuck) {
            if (g.grid[s.cell] === SOLID) continue
            if (Math.floor(s.cell / g.W) !== myRow) continue
            const sx = (s.cell % g.W) * CFG.cell + CFG.cell / 2
            const d = Math.abs(sx - me.x)
            if (d < bd) { bd = d; best = sx }
        }
        if (best !== null && (me.quiver === 0 || bd < 260)) {
            scavenging = true
            if (Math.abs(best - me.x) > 10) mx = Math.sign(best - me.x)
        } else if (me.quiver === 0) {
            dry = true   // no ammo and nothing in reach: the feet still move
        }
    }

    // #2307 climb phase A: the feet belong to the chain before the duel
    // distances are considered — a committed hop that dodges sideways is
    // not climbing the ledge it committed to. But climbing is TEMPO, not
    // survival: a perched bot cannot reach floor-level stuck arrows, so a
    // thinning quiver (≤ 2) releases the climb and the feet go back to the
    // ground economy — the slack rule (#1685 lineage) would otherwise lose
    // matches by sitting high on dry ammo.
    if (!scavenging && !dry && foe.alive && skill > 0 && me.quiver > 2) {
        const c = climbStep(g, me)
        if (c) {
            climbed = true
            mx = c.mx
            my = c.my
        }
    }

    if (!scavenging && !climbed && foe.alive) {
        // autopilot keeps a fighting distance and steps aside from fire
        const dx = foe.x - me.x, adx = Math.abs(dx)
        if (skill > 0) {
            if (adx < 110) mx = -Math.sign(dx || 1)
            else if (adx > 210) mx = Math.sign(dx)
            for (const ar of g.arrows) {
                if (ar.state !== 'fly' || ar.owner === meId) continue
                const rx = me.x - ar.x, ry = me.y - ar.y
                if (rx * ar.vx + ry * ar.vy > 0 && Math.hypot(rx, ry) < 60) mx = ar.vx >= 0 ? -1 : 1
            }
        } else if (adx > CFG.bot0Range) mx = Math.sign(dx)
    }

    // the shot: lead once, solve both angles, forward-simulate each, take
    // whichever arc actually reaches the foe
    let want = null, aimUp = 1, aim = null
    // #2307 perched honesty: once the bot stands above the foe, only a
    // SOLVED arc (rain included) may burn an arrow — the floor habits
    // (blind flat misses, hopeful lobs at the canopy) waste ammo upward.
    const hopelessHigh = above && !me.firing
    if (!scavenging && !climbed && !hopelessHigh && foe.alive && me.quiver > 0 && skill > 0) {
        const t = 26
        let tx = foe.x + foe.vx * t
        const mk = (v) => clamp((v - CFG.arrowMin) / (CFG.arrowMax - CFG.arrowMin), 0.04, 1)
        // two lead passes: solve -> simulate -> re-lead at the measured
        // flight time -> solve again. One fixed lead walked itself out of
        // every shot while the foe closed at 2.6 px/tick.
        const solve = (ltx, lty) => {
            const ldx = ltx - me.x, ladx = Math.abs(ldx), lrise = me.y - lty
            const out = []
            // flat first: a level arc lands on the floor where a walking
            // archer can PULL it back, keeping the quiver economy
            // circulating; the high lob is the fallback for over the
            // cover. Lobbing first dumped every missed arrow onto the
            // unreachable ledges and the duel dried out (#1685).
            if (lty - me.y > -6 && ladx > 8) {
                const drop = Math.max(2, lty - me.y)
                out.push({ up: 0, c: mk(ladx * Math.sqrt(CFG.arrowGravity / (2 * drop))) })
            }
            if (ladx > 30 && ladx - lrise > 10) out.push({ up: 1, c: mk(Math.sqrt(CFG.arrowGravity * ((ladx * ladx) / (ladx - lrise)))) })
            // #2307 the rain shot: from the high ground the foe sits BELOW,
            // and the 45° up-lob's own range r = v²/g covers the chord
            // (2*down at full charge = 96 px). The arcade duelist on the
            // balcony does not lob over the tower — it rains down.
            if (lrise > CFG.cell && ladx > 8 && 2 * lrise < (CFG.arrowMax * CFG.arrowMax) / CFG.arrowGravity - 8) {
                out.push({ up: 2, c: mk(Math.sqrt(CFG.arrowGravity * (ladx * ladx) / (2 * lrise))) })
            }
            return out
        }
        // iterate the lead on the arrow's OWN measured flight time: solve,
        // simulate, re-aim at (foe now + foe velocity x flight), solve again.
        // A fixed lead walked itself out of every shot against a moving foe.
        let px = foe.x, py = foe.y, pt = 26
        for (let pass = 0; pass < 3 && want === null; pass++) {
            for (const cd of solve(px, py)) {
                const ax = cd.up === 1 ? (px >= me.x ? 1 : -1) : (Math.sign(px - me.x) || 1)
                const ay = cd.up === 1 ? -1 : cd.up === 2 ? 1 : 0
                const v = CFG.arrowMin + (CFG.arrowMax - CFG.arrowMin) * cd.c
                if (v < CFG.arrowMin || v > CFG.arrowMax) continue
                if (predictHit(g, me, px, py, ax, ay, cd.c) >= 0) { want = cd.c; aimUp = cd.up; break }
            }
            if (want !== null) break
            const th = pt
            px = foe.x + foe.vx * th
            py = foe.y + foe.vy * th * 0.4
            pt = Math.max(8, th * 0.7)
        }
        if (want !== null) {
            // plant for the lob (release the frame both feet are down and
            // the solver still agrees); walk the flat shot INTO the line;
            // the rain shot plants too — a balcony archer holds its ground
            fire = !me.firing || me.charge < want || ((aimUp === 1 || aimUp === 2) && !me.grounded && me.charge < 1)
            mx = aimUp === 0 ? (tx > me.x ? 1 : -1) : 0
            my = 0
            aim = {
                x: tx > me.x ? 1 : -1,
                y: aimUp === 1 ? -1 : aimUp === 2 ? 1 : 0,
            }
        } else if (me.firing && !(above && climbed)) {
            // A released draw can never be un-nocked: once the string is
            // drawn it holds until the solver agrees or the draw is full.
            // (An "abort" here used to spit unaimed point-blank junk.)
            // #2307 exception: a draw committed while sprinting at a shot
            // that died may be dropped UNLESS the foe is above and the feet
            // belong to a climb — firing-up during a hop spits junk at the
            // ceiling, and the climb should finish before the next solve.
            fire = me.charge < 1
            if (fire && !aimUp) mx = tx > me.x ? 1 : -1
        } else if (!climbed && skill > 0 && !fire && mx === 0) {
            // nothing to shoot and nothing to walk: footwork. Sweeping the
            // floor in tick-parity direction beats parking in a geometry
            // dead spot forever — the arena always reopens eventually.
            // (#2307: the old in-place hop at a perched foe lives here no
            // more — climb phase A routes that duel up the ledge chain.)
            mx = Math.floor(g.tick / 45) % 2 ? 1 : -1
        }
    } else if (!scavenging && foe.alive && me.quiver > 0 && skill === 0) {
        // the basic bot shoots the foe — FLAT when the foe is at its own
        // height, so a miss drops on the FLOOR where a walk pulls it back
        // and the quiver economy keeps circulating. It only LOBS (and
        // jumps) to reach a foe on another level or clear cover; a lobbed
        // miss may stick on a ledge until the TTL. The old version always
        // lobbed, and its six misses silted every ledge until both archers
        // were empty-handed and the duel sat frozen for ~20 s (#1685).
        const adx0 = Math.abs(foe.x - me.x)
        const sameRow = Math.abs(foe.y - me.y) < CFG.cell
        const flat = !CFG.bot0Lobs && sameRow   // flat: a miss drops on the floor
        fire = !me.firing ? adx0 < 240 : me.charge < CFG.bot0Release
        if (fire) my = flat ? 0 : 1
        if (fire || me.firing) aim = { x: foe.x >= me.x ? 1 : -1, y: flat ? 0 : -1 }
    }
    // a dry scavenger with nothing in reach keeps its feet moving:
    // standing still under an unreachable arrow is how a duel dies (#1685)
    if (dry && mx === 0 && my === 0) mx = Math.floor(g.tick / 45) % 2 ? 1 : -1
    return { mx, my, fire, aim }
}

export function runMatch(opts = {}) {
    const g = makeGame(buildArena(opts.arena || 0), opts)
    const skills = opts.skills || [1, 0]
    const cap = opts.maxTicks || CFG.matchTicks + 200
    while (!g.end && g.tick < cap) {
        step(g, botInput(g, 0, skills[0]), botInput(g, 1, skills[1]))
    }
    return g
}

export function stateHash(g) {
    let h = 0x811c9dc5
    const mix = (n) => {
        let v = Math.round(n * 256) | 0
        h ^= v & 0xff; h = Math.imul(h, 0x01000193)
        h ^= (v >>> 8) & 0xff; h = Math.imul(h, 0x01000193)
        h ^= (v >>> 16) & 0xff; h = Math.imul(h, 0x01000193)
    }
    mix(g.tick); mix(g.p[0].x); mix(g.p[0].y); mix(g.p[1].x); mix(g.p[1].y)
    mix(g.p[0].quiver); mix(g.p[1].quiver); mix(g.p[0].score); mix(g.p[1].score)
    mix(g.arrows.length); mix(g.stuck.length); mix(g.ledger.hit); mix(g.ledger.lost)
    for (const ar of g.arrows) { mix(ar.id); mix(ar.x); mix(ar.y) }
    for (const s of g.stuck) mix(s.cell)
    return (h >>> 0).toString(16)
}

export function replay(arena, cmds, opts = {}) {
    const g = makeGame(arena, opts)
    const byTick = new Map()
    for (const c of cmds) byTick.set(c.tick, c)
    const max = opts.maxTicks ?? CFG.matchTicks + 200
    while (!g.end && g.tick < max) {
        const c = byTick.get(g.tick)
        step(g, c ? c.p1 : null, c ? c.p2 : null)
    }
    return g
}

export function recordMatch(opts = {}) {
    const g = makeGame(buildArena(opts.arena || 0), opts)
    const skills = opts.skills || [1, 0]
    const cap = opts.maxTicks || CFG.matchTicks + 200
    while (!g.end && g.tick < cap) {
        const i1 = botInput(g, 0, skills[0])
        const i2 = botInput(g, 1, skills[1])
        g.cmds.push({ tick: g.tick, p1: i1, p2: i2 })
        step(g, i1, i2)
    }
    return g
}

// deep copy for the DebugKit's PROGNOSIS: re-run the autopilot against the
// LIVE mutated state and answer "can this still be won from here?"
export function cloneGame(g) {
    return structuredClone(g)
}
