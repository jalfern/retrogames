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
//   - stuck arrows as terrain: hit stone and the arrow sticks in the last
//     air cell; while stuck it KNOCKS OUT any flying arrow that crosses it
//     (the knockout drops straight down and sticks at the floor — ammo for
//     whoever reaches it first) and blocks nothing that walks: stepping on
//     a stuck arrow PULLS it out into your quiver if there is room.

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
    // test-only switches so the harness can prove each muscle is load-bearing
    ballistics: true,     // false: arrows fly dead flat
    stick: true,          // false: arrows phase through stone
    knockout: true,       // false: arrows fly through stuck arrows
    retrieve: true,       // false: stuck arrows can never be pulled out
    ttlRelease: true,     // false: stuck arrows never expire
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
        quiver: opts.quiver ?? CFG.quiver,
        score: id === 1 ? (opts.p2Gift || 0) : 0,
        alive: true, deadT: 0, invuln: 0,
        spawnX: sp.x * CFG.cell + CFG.cell / 2, spawnY: sp.y * CFG.cell + CFG.cell / 2 + (CFG.cell / 2 - R),
    })
    const g = {
        name: a.name, W: a.W, H: a.H, grid: a.grid.slice(),
        p: [mk(0, a.p1), mk(1, a.p2)],
        arrows: [], stuck: [],
        ledger: { hit: 0, lost: 0 },
        tick: 0, end: null, winner: -1, events: [], cmds: [], arrowSeq: 0,
        total: 2 * (opts.quiver ?? CFG.quiver),
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
    const cell = Math.floor(ar.y / CFG.cell) * g.W + Math.floor(ar.x / CFG.cell)
    const old = g.stuck.find((s) => s.cell === cell)
    if (old) {
        // the cell is already held by another stuck arrow: the newcomer
        // lands nose-first against it and drops at its foot instead
        ar.state = 'fall'
        ar.vx = 0; ar.vy = 0.5
        return
    }
    ar.state = 'stuck'
    ar.cell = cell
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
            g.events.push({ type: 'respawn', who: p.id })
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

    if (fire) {
        p.firing = true
        p.charge = clamp(p.charge + CFG.chargeRate, 0, 1)
        // a stick only gives 8 directions, and straight up is a jump, not
        // a shot: up-with-no-sideways aims the 45° lob toward the facing.
        // A solver may take the stick off the aim entirely and name it.
        if (inp && inp.aim) { p.aimX = inp.aim.x; p.aimY = inp.aim.y }
        else if (mx !== 0) { p.aimX = mx; p.aimY = my !== 0 ? -Math.sign(my) : 0 }
        else if (my > 0) { p.aimX = p.face; p.aimY = -1 }
    } else {
        if (p.firing) {
            // releasing with a level stick fires level at the facing;
            // a solver-named aim wins over the stick
            if (inp && inp.aim) { p.aimX = inp.aim.x; p.aimY = inp.aim.y }
            else { if (mx !== 0) p.aimX = mx; p.aimY = -my }
            looseArrow(g, p)
            p.firing = false
            p.charge = 0
        }
        if (mx !== 0 || my !== 0) { p.aimX = mx; p.aimY = my > 0 ? -1 : 0 }
    }
    p.firePrev = fire

    moveBody(g, p)

    // pulling a stuck arrow out of the terrain (first body to touch wins)
    if (CFG.retrieve && p.quiver < CFG.quiver) {
        const s = stuckAt(g, p.x, p.y) || stuckAt(g, p.x, p.y + R - 2) || stuckAt(g, p.x, p.y - R + 2)
        if (s) {
            g.stuck.splice(g.stuck.indexOf(s), 1)
            const k = g.arrows.indexOf(s)
            if (k >= 0) g.arrows.splice(k, 1)
            p.quiver++
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
            // a knocked-out arrow just drops and sticks wherever it lands
            ar.x += ar.vx
            ar.y += ar.vy
            if (solidAt(g, ar.x, ar.y + 1) || ar.age > 400) {
                if (solidAt(g, ar.x, ar.y)) ar.y -= 2
                stickArrow(g, ar)
                if (ar.state !== 'stuck') { g.arrows.splice(i, 1); g.ledger.lost++ }
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
                    s2.knocks = (s2.knocks || 0) + 1
                    ar.state = 'fall'
                    ar.vx = 0; ar.vy = 0.5
                    g.events.push({ type: 'knockout', who: ar.owner, cell: s2.cell })
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
    // stuck arrows dry out and walk home on their own
    if (CFG.ttlRelease) {
        for (let i = g.stuck.length - 1; i >= 0; i--) {
            const s = g.stuck[i]
            if (++s.age > CFG.stuckTTL) {
                g.stuck.splice(i, 1)
                const k = g.arrows.indexOf(s)
                if (k >= 0) g.arrows.splice(k, 1)
                const owner = g.p[s.owner]
                if (owner.quiver < CFG.quiver) owner.quiver++
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

export function botInput(g, meId, skill) {
    const me = g.p[meId], foe = g.p[1 - meId]
    if (!me.alive) return { mx: 0, my: 0, fire: false }
    let mx = 0, my = 0, fire = false

    // a dry archer is a scavenger: nearest stuck arrow, first
    let scavenging = false
    if (foe.alive && (me.quiver === 0 || (skill > 0 && me.quiver < 2))) {
        let best = null, bestY = 0, bd = 1e9
        for (const s of g.stuck) {
            const sx = (s.cell % g.W) * CFG.cell + CFG.cell / 2
            const d = Math.abs(sx - me.x)
            if (d < bd) { bd = d; best = sx; bestY = Math.floor(s.cell / g.W) * CFG.cell + CFG.cell / 2 }
        }
        if (best !== null && (me.quiver === 0 || bd < 260)) {
            scavenging = true
            // walk under it and hop — arrows that stick on ledges are only
            // reachable from above, and a scavenger that never jumps will
            // stand under its own ammo forever (this freeze was real)
            if (Math.abs(best - me.x) > 10) mx = Math.sign(best - me.x)
            else if (bestY > me.y + 20 && me.grounded) my = 1
        }
    }

    if (!scavenging && foe.alive) {
        // autopilot keeps a fighting distance and steps aside from fire
        const dx = foe.x - me.x, adx = Math.abs(dx)
        if (skill > 0) {
            if (adx < 110) mx = -Math.sign(dx || 1)
            else if (adx > 300) mx = Math.sign(dx)
            for (const ar of g.arrows) {
                if (ar.state !== 'fly' || ar.owner === meId) continue
                const rx = me.x - ar.x, ry = me.y - ar.y
                if (rx * ar.vx + ry * ar.vy > 0 && Math.hypot(rx, ry) < 60) mx = ar.vx >= 0 ? -1 : 1
            }
        } else if (adx > 90) mx = Math.sign(dx)
    }

    // the shot: lead once, solve both angles, forward-simulate each, take
    // whichever arc actually reaches the foe
    let want = null, aimUp = 1, aim = null
    if (!scavenging && foe.alive && me.quiver > 0 && skill > 0) {
        const t = 26
        let tx = foe.x + foe.vx * t, ty = foe.y + foe.vy * t * 0.5
        const mk = (v) => clamp((v - CFG.arrowMin) / (CFG.arrowMax - CFG.arrowMin), 0.04, 1)
        // two lead passes: solve -> simulate -> re-lead at the measured
        // flight time -> solve again. One fixed lead walked itself out of
        // every shot while the foe closed at 2.6 px/tick.
        const solve = (ltx, lty) => {
            const ldx = ltx - me.x, ladx = Math.abs(ldx), lrise = me.y - lty
            const out = []
            if (ladx > 30 && ladx - lrise > 10) out.push({ up: 1, c: mk(Math.sqrt(CFG.arrowGravity * ((ladx * ladx) / (ladx - lrise)))) })
            if (lty - me.y > 6 && ladx > 20) out.push({ up: 0, c: mk(ladx * Math.sqrt(CFG.arrowGravity / (2 * (lty - me.y)))) })
            return out
        }
        // iterate the lead on the arrow's OWN measured flight time: solve,
        // simulate, re-aim at (foe now + foe velocity x flight), solve again.
        // A fixed lead walked itself out of every shot against a moving foe.
        let px = foe.x, py = foe.y, pt = 26
        for (let pass = 0; pass < 3 && want === null; pass++) {
            for (const cd of solve(px, py)) {
                const ax = cd.up ? (px >= me.x ? 1 : -1) : Math.sign(px - me.x) || 1
                const ay = cd.up ? -1 : 0
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
        void tx; void ty
        if (want !== null) {
            // plant for the lob (release the frame both feet are down and
            // the solver still agrees); walk the flat shot INTO the line
            fire = !me.firing || me.charge < want || (aimUp && !me.grounded && me.charge < 1)
            mx = aimUp ? 0 : (tx > me.x ? 1 : -1)
            my = 0
            aim = { x: aimUp ? (tx >= me.x ? 1 : -1) : (tx > me.x ? 1 : -1), y: aimUp ? -1 : 0 }
        } else if (me.firing) {
            // A released draw can never be un-nocked: once the string is
            // drawn it holds until the solver agrees or the draw is full.
            // (An "abort" here used to spit unaimed point-blank junk.)
            fire = me.charge < 1
            if (fire && !aimUp) mx = tx > me.x ? 1 : -1
        } else if (skill > 0 && foe.alive && me.grounded && foe.y < me.y - 24 &&
                   Math.abs(foe.x - me.x) < 150) {
            // foe perched high and close: neither stick angle solves from
            // the floor — hop, and let the airborne solver find the arc
            my = 1
        } else if (skill > 0 && !fire && mx === 0) {
            // nothing to shoot and nothing to walk: footwork. Sweeping the
            // floor in tick-parity direction beats parking in a geometry
            // dead spot forever — the arena always reopens eventually.
            mx = Math.floor(g.tick / 45) % 2 ? 1 : -1
        }
    } else if (!scavenging && foe.alive && me.quiver > 0 && skill === 0) {
        // the basic bot just lobs at whatever it sees
        fire = !me.firing || me.charge < 0.55
        if (fire) my = 1
        if (fire || me.firing) aim = { x: foe.x >= me.x ? 1 : -1, y: -1 }
    }
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
