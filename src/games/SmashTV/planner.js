// SMASH TV — the autopilot. Drives the SAME sim the player does, with the same
// twin-stick inputs, and proves the whole arena chain is winnable. The attract
// mode replays its proven run tick-for-tick; smashcheck grades it (and grades
// it again with the slack rule: one fewer crate and zero energy cells).
//
// #496 co-op: every doctrine below is seat-aware. plan() keeps driving seat 1
// exactly as it always did (its proven run is byte-identical); planCoop() seats
// the partner at seat 2, and partnerPad() wraps the same brain as a PAD
// EMITTER — the CPU plays by human rules because pads are all it ever says.
// padToInp / inpToPad are the shared fold between pads and sim inputs, so a
// harness can replay a 2P run from seed + per-player pad streams.

import { makeGame, step, stateHash, q8, los, CFG, boardW, blockedPx, cellOf } from './sim.js'
import { exitsOf, ENEMIES, CH, HUD_H } from './levels.js'

const cx = (c) => c * 16 + 8
const cy = (r) => 24 + r * 16 + 8
const exitPos = (e) => [cx(e.c), cy(e.r)]

const seatOf = (gs, pi) => gs.players[pi] || gs.player
const stallOf = (gs, pi) => {
    gs._st = gs._st || []
    return gs._st[pi] || (gs._st[pi] = { last: null, wantMove: false, stall: 0, detour: 0, side: 1 })
}

// #2024: is this threat wedged? Tracks per-seat stillness of the enemy the
// seat is currently worried about; true once it has not budged in 30 ticks.
// (A chaser genuinely walking into a dead-end counts too — and should: by the
// time the hero notices, it is not a threat that can close.)
function pinned(st, e) {
    const rec = st.pin && st.pin.e === e ? st.pin : (st.pin = { e, x: e.x, y: e.y, t: 0 })
    rec.t = Math.hypot(e.x - rec.x, e.y - rec.y) < 0.05 ? rec.t + 1 : 0
    rec.x = e.x; rec.y = e.y
    return rec.t > 30
}

// #2491 duel target with the dead-lane ledger (see the dead-shot breaker):
// a threat whose lane proved deaf is skipped while anything else lives, so
// the seat goes about the room instead of firing into a chrome seam forever.
// When only marked bodies remain the ledger clears — the room still has to
// fall, and the walk back brings a fresh line onto them.
function pickThreat(gs, p, st) {
    const alive = gs.enemies.filter((e) => e.hp > 0)
    const open = st.dead && st.dead.size ? alive.filter((e) => !st.dead.has(e.id)) : alive
    const pool = open.length ? open : alive
    let vis = null, vd = 1e9, any = null, ad = 1e9
    for (const e of pool) {
        const d = Math.hypot(e.x - p.x, e.y - p.y)
        if (d < ad) { ad = d; any = e }
        if (d < vd && los(gs, p.x, p.y, e.x, e.y)) { vd = d; vis = e }
    }
    return vis || any || null
}

function nearestEnemy(gs, needLos, p) {
    let best = null, bd = 1e9
    for (const e of gs.enemies) {
        if (needLos && !los(gs, p.x, p.y, e.x, e.y)) continue
        const d = Math.hypot(e.x - p.x, e.y - p.y)
        if (d < bd) { bd = d; best = e }
    }
    return best
}

// #2491 volley doctrine — with no spawn shield, reading the throw is the
// pilot's own job against EVERYTHING. Rounds fly straight locked lines at fixed
// speeds, so a lane's fate is pure arithmetic: sweep it forward and see whether
// any round crosses the body (see volleyGate for the full law, including the
// slow-convergence and pin clauses). The of-8 set below is the pilot's step
// vocabulary; the chosen escape commits until it stops being safe, because a
// pilot that re-picks every tick walks back onto the line it just slipped.
// Zero randomness, same determinism as the rest of the planner.
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071]]

const openSide = (gs, p, d) => {
    const bw = boardW(gs)
    const nx = p.x + d[0] * 10, ny = p.y + d[1] * 10
    return nx > 14 && nx < bw - 14 && ny > HUD_H + 14 && ny < CH - 14 && !blockedPx(gs, nx, ny, CFG.playerR)
}

// the of-8 step that spends the ticks given gaining the most ground from
// (ix, iy) while staying in room — one law for bullets, blasts and bodies.
// A small goal-progress term (goal = the seat's business, when it has any)
// breaks ties toward the fight: seed 0's pilot sat on a bar's east end for
// 55k ticks because pure anti-impact dodging kept handing it straight back
// to the lane puller — every dodge stepped S and every lane walk pulled N
// into the same chrome. A goal-aware escape steers the dodge around the
// obstacle, so the two masters stop cancelling each other.
function escapeDir(gs, p, ix, iy, ticks) {
    const stepPx = CFG.playerSpeed * Math.max(6, Math.min(ticks, 12))
    let best = null, bs = -1e9
    for (const d of DIRS8) {
        const nx = p.x + d[0] * stepPx, ny = p.y + d[1] * stepPx
        if (nx < 14 || nx > boardW(gs) - 14 || ny < HUD_H + 14 || ny > CH - 14) continue
        if (blockedPx(gs, nx, ny, CFG.playerR)) continue
        const dd = Math.hypot(nx - ix, ny - iy)
        if (dd > bs) { bs = dd; best = d }
    }
    return best
}

// #2491 the volley gate. Scores distance to an impact point rewards running
// INTO a bullet: for a head-on round the closest-approach spot is behind the
// runner, so "gain from the impact point" grew every tick of seed 2's fatal
// 20-tick march east into the converging volley. Sweep instead: walk the
// seat's next 26 ticks down the lane the objective chose while every round
// flies at its own speed, and call the lane dead if any round crosses the
// body (a lane into chrome pins the seat while rounds keep coming, so the
// sweep keeps simulating after the pin). Only a dead objective lane triggers
// the gate — a room walk under passing fire stays untouched. The replacement
// lane leans FORWARD (dot with the objective) and ties break on margin, so
// dodging keeps clearing the room instead of retreating forever; doomed
// lanes rank by how long they last. The commit holds while it stays safe on
// an unchanged objective — a crossfire makes a tick-by-tick re-pick flip and
// the seat walks back onto the line it just slipped. Zero randomness: same
// state, same answer, every tick.
function volleyGate(gs, p, st, inp) {
    const rs = CFG.playerR + CFG.bulletR + 1
    const near = gs.ebullets.filter((b) => Math.hypot(b.x - p.x, b.y - p.y) < 90)
    if (!near.length) { st.dk = null; return inp }
    const H = 26
    const sweep = (vx, vy) => {
        let sx = p.x, sy = p.y, margin = 1e9, pin = false
        let dH = 1e9, dH1 = 1e9 // slow-convergence detector: horizon-end gap
        for (let s = 0; s <= H; s++) {
            let minNow = 1e9
            for (const b of near) {
                const dd = Math.hypot(sx - (b.x + b.dx * s), sy - (b.y + b.dy * s))
                if (dd < rs) return { safe: false, hit: s, margin: -1, pin, close: false }
                if (dd < margin) margin = dd
                if (dd < minNow) minNow = dd
            }
            if (s === H - 1) dH1 = minNow
            if (s === H) dH = minNow
            if (!pin) {
                const nx = sx + vx, ny = sy + vy
                if (nx < 14 || nx > boardW(gs) - 14 || ny < HUD_H + 14 || ny > CH - 14 || blockedPx(gs, nx, ny, CFG.playerR)) pin = true
                else { sx = nx; sy = ny }
            }
        }
        // a round creeping closed faster than the horizon can see (seed 4
        // coasted SW 40 ticks on a commit whose killer closed 0.4 px/tick and
        // only walked into view at point-blank): if some round ends the
        // horizon within comfort AND still gaining, this lane is a slow
        // collision course, not a safe walk.
        return { safe: true, hit: H + 1, margin, pin, close: dH < rs + 26 && dH < dH1 }
    }
    const omx = inp.mx || 0, omy = inp.my || 0
    const lane = (dx, dy) => { const [qx, qy] = q8(dx, dy); return sweep(qx * CFG.playerSpeed, qy * CFG.playerSpeed) }
    if (st.dk) {
        // the commit OWNS the legs while it stays safe — returning the
        // objective's own step here (first draft's bug) put the seat right
        // back on the dead lane every other tick and it died of the fluency.
        // A pinned commit is no commit: a direction into chrome parks the
        // seat as a standing target, so it only holds while it still walks.
        const c = lane(st.dk[0], st.dk[1])
        if (c.safe && !c.pin && !c.close) {
            const [qx, qy] = q8(st.dk[0], st.dk[1])
            inp.mx = qx; inp.my = qy
            st.wantMove = true
            return inp
        }
        st.dk = null
    }
    const o = lane(omx, omy)
    if (o.safe && !o.close) { st.dk = null; return inp }
    let best = null, bk = -1, bs = -1e9
    for (const d of DIRS8) {
        const c = lane(d[0], d[1])
        const sc = d[0] * omx + d[1] * omy + (c.safe ? c.margin / 100 - (c.pin ? 0.6 : 0) - (c.close ? 1.2 : 0) : 0)
        if (c.hit > bk || (c.hit === bk && sc > bs)) { bk = c.hit; bs = sc; best = d }
    }
    st.dk = best
    const [qx, qy] = q8(best[0], best[1])
    inp.mx = qx; inp.my = qy
    st.wantMove = true
    return inp
}

// #2491 doctrine — the arcade gave no spawn shield, so reading the throw is
// the pilot's own job. But WHERE a grenade blows is not where its fuse dies:
// the sim detonates the moment the body touches chrome, so a lob that sails
// past the seat still bursts against the bar behind it — fly the sim's own
// flight to find the blast spot. If that spot lands inside the ring around the
// seat (grenadeR + playerR), walk the direction that clears the ring before
// the blast; the commit (st.gr) keeps the lane until it is open, because a
// pilot that flips its mind every tick sits still at 1 px and dies under it.
function blastOf(gs, g) {
    let x = g.x, y = g.y
    for (let t = 0; t < g.t; t++) {
        x += g.dx; y += g.dy
        const [c, r] = cellOf(x, y)
        if (gs.walls.has(`${c},${r}`)) return [x, y, t + 1]
    }
    return [x, y, g.t]
}

function grenadeEscape(gs, p, st) {
    const ring = CFG.grenadeR + CFG.playerR
    let hot = null, ht = 1e9
    for (const g of gs.grenades) {
        const [lx, ly, lt] = blastOf(gs, g)
        if (Math.hypot(lx - p.x, ly - p.y) > ring + 2) continue
        if (lt < ht) { ht = lt; hot = [lx, ly] }
    }
    if (!hot) { st.gr = null; return null }
    if (st.gr && openSide(gs, p, st.gr)) return st.gr
    const v = escapeDir(gs, p, hot[0], hot[1], ht)
    st.gr = v
    return v
}

// #2491 contact guard — a graze is a body now. Throwers and heavies creep,
// and the shields used to eat what that closing walk ended; standing ground
// and trading was a shield privilege. Anything inside the touch band gets
// backed off the moment it is: the direction that gains ground from the body
// while staying in room.
function guardVec(gs, p) {
    let hot = null, hd = CFG.contactR + 5
    for (const e of gs.enemies) {
        const d = Math.hypot(e.x - p.x, e.y - p.y)
        if (d < hd) { hd = d; hot = e }
    }
    if (!hot) return null
    return escapeDir(gs, p, hot.x, hot.y, 10)
}

const aimH = (gs, inp, p, x, y) => {
    const [qx, qy] = q8(x - p.x, y - p.y)
    inp.fx = qx; inp.fy = qy
    inp.fire = true
}
const moveH = (gs, inp, p, x, y, drop = 0) => {
    let dx = x - p.x, dy = y - p.y
    if (drop) { const d = Math.hypot(dx, dy); if (d < drop) { dx = 0; dy = 0 } }
    const [qx, qy] = q8(dx, dy)
    inp.mx = qx; inp.my = qy
}

function nearestExit(gs, p) {
    let best = null, bd = 1e9
    for (const e of exitsOf((gs.roomData && gs.roomData.gw) || 16)) {
        const [x, y] = exitPos(e)
        const d = Math.hypot(x - p.x, y - p.y)
        if (d < bd) { bd = d; best = [x, y] }
    }
    return best
}

function seatDrive(gs, pi = 0) {
    const p = seatOf(gs, pi)
    if (!p || p.deadT > 0 || p.out || gs.end) return {}
    const st = stallOf(gs, pi)

    // stuck breaker: if we are trying to walk but barely moved, detour
    // sideways for a spell.
    if (st.last && st.wantMove) {
        // #2491 windowed stall. The per-tick test let a ±1 px oscillation
        // reset the counter every other tick — seed 0 paced against a bar end
        // for 55k ticks (dodge pushed south, the lane pulled north, and every
        // step counted as "moving"). Judge travel over a window instead: if
        // the seat has not actually gone anywhere, it is stalled.
        const moved = Math.hypot(p.x - st.last[0], p.y - st.last[1])
        st.hist = st.hist || []
        st.hist.push([p.x, p.y])
        if (st.hist.length > 24) st.hist.shift()
        if (st.hist.length >= 24) {
            const [ox, oy] = st.hist[0]
            st.stall = Math.hypot(p.x - ox, p.y - oy) < 4 ? st.stall + 1 : 0
        } else st.stall = moved < 0.3 ? st.stall + 1 : 0
    } else st.hist = []
    if (st.rn !== gs.room) { st.rn = gs.room; st.streak = 0; st.hist = [] }
    st.last = [p.x, p.y]
    st.wantMove = false
    const inp = {}
    // #2491: outranks even a stall-break — a detour that walks into a blast
    // ring is no break at all. Leave the ring first, then everything else.
    const gvec = grenadeEscape(gs, p, st)
    if (gvec) {
        const [qx, qy] = q8(gvec[0], gvec[1])
        inp.mx = qx; inp.my = qy
        st.wantMove = true; st.gx = qx; st.gy = qy
        const th = nearestEnemy(gs, true, p)
        if (th) aimH(gs, inp, p, th.x, th.y)
        return inp
    }
    // #2491: then the body-graze guard — one touch is a life spent, and the
    // duel branches below only stop at arm's length for the kinds that duel.
    const gv = guardVec(gs, p)
    if (gv) {
        const [qx, qy] = q8(gv[0], gv[1])
        inp.mx = qx; inp.my = qy
        st.wantMove = true; st.gx = qx; st.gy = qy
        const th = nearestEnemy(gs, true, p)
        if (th) aimH(gs, inp, p, th.x, th.y)
        return inp
    }
    // #2491 volley gate at the END of the chain: the room decides where the
    // legs want to go, and the gate only overrules the legs when arithmetic
    // says a round crosses that lane — objective still owns the aim, and the
    // dodge itself leans forward (see volleyGate).
    return volleyGate(gs, p, st, objectiveDrive(gs, pi, st, p))
}

// Where the seat wants to go: the whole business of the room — stall-break,
// detour, bonus hunt, crate run, exit walk, duel. The legs it composes get
// audited by volleyGate before the sim sees them.
function objectiveDrive(gs, pi, st, p) {
    const room = gs.roomData
    const inp = {}
    const threat = pickThreat(gs, p, st)
    if (st.stall > 15) {
        st.streak = (st.streak || 0) + 1
        // #2007: a fixed 30-tick break spans ~36px — less than the no-go band
        // between two bar columns on a 24-wide board (~45px), so the exit walk
        // ping-ponged across the same blocked corridor forever (seed 6 sat in
        // room 3 for 59k ticks). Grow the break with consecutive stalls until
        // the sweep clears any finite band; the streak resets each room.
        st.detour = Math.min(30 * st.streak, 150)
        st.det0 = st.detour
        st.stall = 0
        // #2491 rotate-and-scan break. The old break was (axis, side) parity:
        // side flips every break, axis flips on a schedule — and wedged in a
        // corner that cycle only ever visits TWO of the four ways, and when
        // those two are chrome the seat braces against the wall forever (seed 5
        // braced against [3,9]/[4,10] for 57k ticks; seeds 7/8 jitter the same
        // way against bar corners). Instead: rotate the starting direction one
        // notch per break (seat 1 starts horizontal, the partner vertical, per
        // #508) and take the first cardinal a sim-sized step says is open;
        // only when all four cards are chrome does the break go diagonal.
        {
            const CARDS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
            if (st.ri == null) st.ri = pi === 0 ? -1 : 1 // rotation start: horiz-first / vert-first
            st.ri = (st.ri + 1) % 4
            let pickd = null
            for (let k = 0; k < 4; k++) {
                const d = CARDS[(st.ri + k) % 4]
                if (!blockedPx(gs, p.x + d[0] * 4, p.y + d[1] * 4, CFG.playerR)) { pickd = d; st.ri = (st.ri + k) % 4; break }
            }
            if (!pickd) {
                for (const d of [[0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071]]) {
                    if (!blockedPx(gs, p.x + d[0] * 4, p.y + d[1] * 4, CFG.playerR)) { pickd = d; break }
                }
            }
            if (!pickd) pickd = CARDS[0] // a pocket with no exit: brace anyway, the streak keeps growing
            st.dmx = pickd[0]; st.dmy = pickd[1]
        }
    }
    if (st.detour > 0) {
        st.detour--
        inp.mx = st.dmx || 0; inp.my = st.dmy || 0
        // #2007 DIRECTED break: slide until the way the goal WANTED to go is
        // actually open again. A fixed-length break spans ~36px — less than the
        // no-go band between two bar columns on a 24-wide board (~45px), so
        // the exit walk ping-ponged across the same blocked corridor forever
        // (seed 6 sat in room 3 for 59k ticks). Release at the gap.
        const gx = st.gx || 0, gy = st.gy || 0
        // #2491 dwell: release only after the slide has actually travelled.
        // Seed 1 sat exactly midway between two exits and the exit walk
        // oscillated 1.2 px; the old instant release unmade every break the
        // moment the wobble said the goal way was open again, forever.
        if ((gx || gy) && st.det0 - st.detour >= 10 && !blockedPx(gs, p.x + gx * 6, p.y + gy * 6, CFG.playerR + 1)) st.detour = 0
        const th = nearestEnemy(gs, true, p)
        if (th) aimH(gs, inp, p, th.x, th.y)
        st.wantMove = true
        return inp
    }

    const aimAt = (x, y) => aimH(gs, inp, p, x, y)
    const moveToward = (x, y, drop = 0) => { moveH(gs, inp, p, x, y, drop); if (inp.mx || inp.my) { st.wantMove = true; st.gx = inp.mx; st.gy = inp.my } }

    if (room.bonus) {
        let civ = null, bd = 1e9
        for (const v of gs.civilians) {
            const d = Math.hypot(v.x - p.x, v.y - p.y)
            if (d < bd) { bd = d; civ = v }
        }
        // Once the clock has opened the exits, the show moves on when the
        // door is walked. A hero still hunting a civilian that ghosts behind
        // chrome pins the whole arena in the bonus room (#508 gave the partner
        // this law; #2007 gives it to seat 1 too — a 24-column floor grew the
        // ghosting space, and seat 1 shot into a bar corner for 58k ticks while
        // the exits stood open).
        if (civ && !gs.cleared) { aimAt(civ.x + (civ.dx || 0) * 8, civ.y + (civ.dy || 0) * 8); moveToward(civ.x, civ.y, 4) }
        else if (gs.cleared) { const e = nearestExit(gs, p); if (e) moveToward(e[0], e[1]) }
        return inp
    }

    // firebombs when they pay: 3+ live non-boss enemies and spare energy.
    // #1973: at THE ANNOUNCER one add is already worth the bomb — it denies
    // the swarm while the hero duels, and his attrition fights were where the
    // reshuffled big-room seeds bled out (seed 3 / slack seed 1 died twin-
    // pistols-to-the-fan with full power meters sitting unused)
    if (gs.enemies.filter((e) => e.kind !== 'boss').length >= (gs.roomData.boss ? 1 : 3) && gs.energy >= CFG.firebombCost + 20 && p.invuln <= 0 && pi === 0) inp.bomb = true

    // upgrade run: while no threat is close and we still have the stock twin
    // pistols, smash the nearest crate and grab the gun inside.
    // #2491 dry-tank reload: LASER burns 2 energy a shot and the sim answers
    // an underfunded trigger with silence — a dry pilot is scenery with a gun
    // (seeds 2/5 strafed THE ANNOUNCER for thousands of ticks at energy 0).
    // When the tank runs low, the business of the room becomes the reload:
    // walk the nearest cell, drop or crate that puts lead back in the gun
    // (energy tops the tank; a crate hands over an energy-free iron), and
    // keep the aim on the threat while walking — the guard and the gate own
    // the body.
    const dry = p.weapon === 'laser' && gs.energy < 30
    const refuel = dry
        ? (gs.items.find((k) => k.t === 'energy') ||
           gs.items.find((k) => k.t === 'weapon' && k.w !== 'laser' && k.w !== 'flame') ||
           gs.crates.find((k) => k.hp > 0 && k.weapon && k.weapon !== 'laser' && k.weapon !== 'flame'))
        : null
    if (refuel) {
        const th = nearestEnemy(gs, true, p)
        if (th) aimAt(th.x, th.y)
        moveToward(refuel.x, refuel.y, 4)
        return inp
    }
    const crate = gs.crates.find((k) => k.hp > 0 && k.weapon !== p.weapon)
    if (!gs.cleared && !room.boss && crate && (p.weapon === 'twin' || p.weapon === 'spread') && (!threat || Math.hypot(threat.x - p.x, threat.y - p.y) > 45)) {
        aimAt(crate.x, crate.y)
        moveToward(crate.x, crate.y, 26)
        return inp
    }

    if (gs.cleared) {
        const e = nearestExit(gs, p)
        if (e) moveToward(e[0], e[1])
        if (threat && Math.hypot(threat.x - p.x, threat.y - p.y) < 90) aimAt(threat.x, threat.y)
        return inp
    }

    if (threat) {
        const d = Math.hypot(threat.x - p.x, threat.y - p.y)
        aimAt(threat.x, threat.y)
        if (threat.kind === 'boss') {
            // #2491: keep the floor. THE ANNOUNCER's fan is aim-locked to where
            // the seat STANDS, and with no spawn shield the last-moment jink and
            // the 40px hold under his perch only survived on what the shield
            // could eat (seeds 2/3/4 all attritioned out under the fan). A seat
            // in steady lateral sweep never stands where he aims: pace the width,
            // flip at chrome, close on him while crossing, let the predictive
            // volley-dodge at the top of seatDrive cover the rounds that time
            // onto the lane anyway.
            if (st.sw == null) st.sw = p.x < boardW(gs) / 2 ? 1 : -1
            if (blockedPx(gs, p.x + st.sw * 18, p.y, CFG.playerR + 1) || p.x + st.sw * 18 < 24 || p.x + st.sw * 18 > boardW(gs) - 24) st.sw = -st.sw
            inp.mx = st.sw
            inp.my = p.y < CH - 64 ? 1 : 0
            st.wantMove = true
            return inp
        }
        // Fleeing is for the chaser that can reach you. A chaser on the far
        // side of a wall cannot, and running "away" from it is what parks the
        // partner in a pocket, pacing the 42 px threshold forever (#508): with
        // no line the partner walks TO the threat instead and lets the stuck
        // breaker detour it around the bar.
        // #2024 made the discriminator stronger than sight: a chaser wedged into
        // chrome does not move — it cannot reach anyone at ANY range, and on the
        // wide boards a pinned runner sits exactly ON the flee threshold, so the
        // hero ran when it came closer and walked back when it didn't, firing
        // past the pinned camera forever (seed 1 orbited (169,138) for 56k
        // ticks in room 8). A chaser that has not budged in half a second is
        // scenery: stop fleeing, walk the lane onto it, and let the shot land.
        const pin = ENEMIES[threat.kind].kind === 'chaser' && pinned(st, threat)
        if (ENEMIES[threat.kind].kind === 'chaser' && d < 42 && !pin && (pi === 0 || los(gs, p.x, p.y, threat.x, threat.y))) { inp.mx = -Math.sign(threat.x - p.x) || (p.x < boardW(gs) / 2 ? 1 : -1); inp.my = -Math.sign(threat.y - p.y) || (p.y < CH / 2 ? 1 : -1); return inp }
        // The 8-way aim only lands what its line crosses, so a partner walks
        // ONTO the camera's row or column and empties the clip down the lane:
        // null out one axis at a time, stop at arm's length, and the shot that
        // follows cannot miss. (Seat 1 keeps its proven hold-and-shoot game.)
        if (pi !== 0 && threat.kind !== 'boss') {
            const dx = threat.x - p.x, dy = threat.y - p.y
            const canSee = los(gs, p.x, p.y, threat.x, threat.y)
            if (!canSee) moveToward(threat.x, threat.y)
            else if (threat.kind === 'turret' || threat.kind === 'walkcam') {
                if (d > 14) {
                    inp.mx = Math.abs(dx) > 5 ? Math.sign(dx) : 0
                    inp.my = Math.abs(dy) > 5 ? Math.sign(dy) : 0
                    st.wantMove = true
                }
            } else if (d > 80) {
                moveToward(threat.x, threat.y)
            } else {
                // lobbers and heavies punish a charge: hold a duelling distance
                // and walk the lane straight on without crossing it
                inp.mx = Math.abs(dx) > 40 ? Math.sign(dx) : 0
                inp.my = Math.abs(dy) > 40 ? Math.sign(dy) : 0
                if (inp.mx || inp.my) st.wantMove = true
            }
            aimAt(threat.x, threat.y)
            return inp
        }
        if (d > 80 || !los(gs, p.x, p.y, threat.x, threat.y)) moveToward(threat.x, threat.y)
        else {
            // #1973: the snap-aim only lands what its line crosses. A wide-room
            // add can pin itself against a bar corner just off the lane, and a
            // hold-and-shoot hero fires past it forever (seed 5 held a duel
            // with a pinned walkcam for 56k ticks). Same doctrine #508 gave the
            // partner: walk the minor axis until the line sweeps onto the shot.
            const [qx, qy] = q8(threat.x - p.x, threat.y - p.y)
            const perp = (threat.x - p.x) * qy - (threat.y - p.y) * qx
            if (Math.abs(perp) > 4 && d > 24) {
                // #2491 lane-sound duel — never align onto a lane chrome owns.
                // The perp walk blindly drags the body onto the threat's row or
                // column even when the aligned lane is walled (and the aligned
                // STAND unreachable): seed 4 nailed itself onto the (12,10)
                // corner twice a cycle — align north into chrome, volley-commit
                // east under the turret's throw, drift back west, repeat — while
                // the open column beneath the turret sat unclaimed. Probe both
                // cardinal lanes from the would-be stand; when the wanted one is
                // blocked and its sibling is clear, take the sibling: walk the
                // OTHER axis and let the gun come onto the lane that can fire.
                // duelists that hold ground (turret, heavy). Lobbers throw
                // arcs at where you STAND and chasers close the lane themselves
                // — for them the proven perp/dodge doctrine keeps the floor
                // (an unscoped draft cost seed 5: lane-walking into a thrower
                // pair traded positions the volley gate was built to refuse).
                const staticDuel = threat.kind === 'turret' || threat.kind === 'heavy'
                const hOpen = los(gs, p.x, threat.y, threat.x, threat.y)
                const vOpen = los(gs, threat.x, p.y, threat.x, threat.y)
                if (staticDuel && Math.abs(qx) > Math.abs(qy) && !hOpen && vOpen) {
                    inp.mx = Math.sign(threat.x - p.x); inp.my = 0
                } else if (staticDuel && Math.abs(qy) >= Math.abs(qx) && !vOpen && hOpen) {
                    inp.mx = 0; inp.my = Math.sign(threat.y - p.y)
                } else if (Math.abs(qy) >= Math.abs(qx)) {
                    inp.mx = Math.sign(perp * qy) || Math.sign(threat.x - p.x) || 1
                } else {
                    inp.my = -Math.sign(perp * qx) || Math.sign(threat.y - p.y) || 1
                }
                st.wantMove = true
            } else {
                // #2491 dead-shot breaker: aligned and firing, yet the body has
                // not flinched in two full clips — the lane is not actually open.
                // Where two chrome cells meet at a corner, the twin barrels clip
                // the seam while the 5px LOS sample slips past it, and seed 8
                // stood on exactly such a seam firing nothing for 58k ticks.
                // Give up the lane, not the target: mark it and go about the
                // rest of the room (which drags the seat across the floor);
                // when the marked body is ALL that is left, take it back — the
                // fresh approach line comes onto it from its open side.
                if (st.dz && st.dz.id === threat.id && st.dz.hp === threat.hp) st.dz.t++
                else st.dz = { id: threat.id, hp: threat.hp, t: 0 }
                if (st.dz.t > 26) {
                    st.dead = st.dead || new Set()
                    st.dead.add(threat.id)
                    st.dz = null
                    if (!gs.enemies.some((e) => e.hp > 0 && !st.dead.has(e.id))) st.dead.clear()
                    return inp
                }
                inp.mx = 0; inp.my = 0
            }
        }
        return inp
    }

    // no threat visible and not clear: hold center, wait for the wave
    // #2491 spawn-lean parking — the shield that used to eat a wave landing
    // on the hero's head is gone. The cabinet telegraphs the landing for a
    // human's eye (the #1978 spawn cue); the pilot reads the queue itself:
    // slack seed 1 room 1 queued a walkcam on the entry cell and it
    // materialised on the hero's crown — instant death, three lives, room 1.
    // Never loiter inside a queued landing ring: stand off the nearest one.
    let hot = null, hd = 1e9
    for (const s of (room.spawns || [])) {
        const d = Math.hypot(cx(s.c) - p.x, cy(s.r) - p.y)
        if (d < hd) { hd = d; hot = [cx(s.c), cy(s.r)] }
    }
    if (hot && hd < 40) {
        const [qx, qy] = q8(p.x - hot[0], p.y - hot[1])
        if (qx || qy) {
            inp.mx = qx; inp.my = qy
            st.wantMove = true
            return inp
        }
    }
    moveToward(boardW(gs) / 2, CH - 48, 24)
    // the partner gives its twin room on the same sheet of chrome
    if (pi === 1) {
        const other = seatOf(gs, 0)
        if (other && Math.hypot(other.x - p.x, other.y - p.y) < 14) {
            inp.mx = Math.sign(p.x - other.x) || -1
            inp.my = 0
        }
    }
    return inp
}

// #2032: the seat does not equip the FLAMER, not even by accident. Stray fire
// can break the crate for you, and the dropped barrel then sits in the lane —
// a trap for this doctrine (seed 4 picked it up in the bonus room and walked a
// 45 px reach into THE ANNOUNCER's fan). The seat steers around the dropped
// barrel; a human thumb steps onto it freely, because the law lives in the
// brain, never in the sim.
export function decide(gs, pi = 0) {
    const inp = seatDrive(gs, pi)
    const p = seatOf(gs, pi)
    if (p.out || p.weapon === 'flame') return inp
    const it = gs.items.find((k) => k.t === 'weapon' && k.w === 'flame')
    if (!it) return inp
    const dx = p.x - it.x, dy = p.y - it.y
    const d = Math.hypot(dx, dy)
    if (d > 16) return inp
    const ux = dx / (d || 1), uy = dy / (d || 1)
    for (const [vx, vy] of [[ux, uy], [uy, -ux], [-uy, ux], [ux, 0], [0, uy]]) {
        const mx = Math.round(vx), my = Math.round(vy)
        if (!mx && !my) continue
        if (!blockedPx(gs, p.x + mx * 10, p.y + my * 10, CFG.playerR)) { inp.mx = mx; inp.my = my; break }
    }
    return inp
}

// --- pads: the only language a CPU seat speaks (#494 doctrine) --------------

// raw pad from a brain decision — what a human's thumbs would produce
export function decidePad(gs, pi = 0) {
    const d = decide(gs, pi)
    const mx = d.mx || 0, my = d.my || 0
    return {
        left: mx < 0, right: mx > 0, up: my < 0, down: my > 0,
        ax: d.fx || 0, ay: d.fy || 0,
        a: !!d.fire, b: !!d.bomb,
    }
}

// fold a pad back into a sim input — the game's shell does exactly this for
// every seat, human or model; the harness uses it to replay pad streams.
export function padToInp(pad) {
    const p = pad || {}
    const mx = (p.right ? 1 : 0) - (p.left ? 1 : 0)
    const my = (p.down ? 1 : 0) - (p.up ? 1 : 0)
    let fx = (p.aimRight ? 1 : 0) - (p.aimLeft ? 1 : 0)
    let fy = (p.aimDown ? 1 : 0) - (p.aimUp ? 1 : 0)
    if (!fx && !fy) { fx = Math.sign(p.ax || 0); fy = Math.sign(p.ay || 0) }
    return { mx, my, fx, fy, fire: !!p.a || !!(fx || fy), bomb: !!p.b }
}

// fold a sim input into a pad (the replay path proves both folds are inverse
// enough for the pilot's decision space: aim and fire always arrive together)
export function inpToPad(inp) {
    const i = inp || {}
    const mx = i.mx || 0, my = i.my || 0
    const fx = i.fx || 0, fy = i.fy || 0
    return {
        left: mx < 0, right: mx > 0, up: my < 0, down: my > 0,
        aimLeft: fx < 0, aimRight: fx > 0, aimUp: fy < 0, aimDown: fy > 0,
        ax: fx, ay: fy,
        a: !!i.fire || !!(fx || fy), b: !!i.bomb,
    }
}

export function plan(seed = 0, opts = {}) {
    const gs = makeGame(seed, opts)
    const script = []
    let deaths = 0
    const max = opts.maxTicks || 60000
    while (!gs.end && script.length < max) {
        const inp = decide(gs)
        script.push(inp)
        step(gs, inp)
        if (gs.events.some((e) => e.type === 'death')) deaths++
        gs.events.length = 0
    }
    return { won: gs.end === 'win', deaths, score: gs.score, script, hash: stateHash(gs), gs }
}

// #496: the co-op autopilot. Seat 1 runs the proven solo doctrine; seat 2 is
// driven ONLY through pads (decidePad → padToInp), the same fold a human or a
// remote player gets — the CPU never touches more than a pad can say.
export function planCoop(seed = 0, opts = {}) {
    const gs = makeGame(seed, { ...opts, players: 2 })
    const script = []
    let deaths = 0
    const max = opts.maxTicks || 60000
    while (!gs.end && script.length < max) {
        const i1 = decide(gs, 0)
        const pad2 = decidePad(gs, 1)
        script.push([i1, pad2])
        step(gs, i1, padToInp(pad2))
        if (gs.events.some((e) => e.type === 'death')) deaths++
        gs.events.length = 0
    }
    return {
        won: gs.end === 'win', deaths, score: gs.score, score2: gs.players[1].score,
        script, hash: stateHash(gs), gs,
    }
}
