// THE AUTOPILOT — a deterministic rider: same world state in, same inputs
// out, tick for tick. It scripts the attract demo AND proves the game can be
// won (scripts/joustcheck.mjs drives five waves with nothing but these
// inputs). Rules, in strict order: dodge the hand, escape the lava, grab the
// egg, joust the rider — and the joust only ever from above, because the
// lower lance loses.

import { W, LAVA_TOP, CFG, wrapDelta, groundTopAt } from './sim.js'

const inPit = (gs, x) => groundTopAt(gs, x) === null

function searchSolid(gs, x, dir) {
    let xx = x
    for (let i = 0; i < 18; i++) {
        xx = (xx + dir * 4 + W) % W
        const g = groundTopAt(gs, xx)
        if (g) return (g.x0 + g.x1) / 2
    }
    return null
}

function nearestFoe(gs, rd) {
    let best = null
    let bd = 1e9
    for (const e of gs.riders) {
        if (e.state !== 'hunt') continue
        const dx = wrapDelta(e.x - rd.x)
        const d = dx * dx + (e.y - rd.y) * (e.y - rd.y)
        if (d < bd) { bd = d; best = e }
    }
    return best
}

function nearestEgg(gs, rd) {
    let best = null
    let bd = 170 * 170
    for (const egg of gs.eggs) {
        const dx = wrapDelta(egg.x - rd.x)
        const d = dx * dx + (egg.y - rd.y) * (egg.y - rd.y)
        if (d < bd) { bd = d; best = egg }
    }
    return best
}

export function planRider(gs, rd) {
    const out = { l: false, r: false, f: false }
    if (!rd || rd.state !== 'alive') return out
    let tx = W / 2
    let ty = 110

    // 1. hands: the troll hand eats riders standing under it
    let dodging = false
    for (const h of gs.hands) {
        if (h.out && Math.abs(wrapDelta(rd.x - h.x)) < 34 && rd.y > h.y - 26) {
            tx = h.x + (wrapDelta(rd.x - h.x) >= 0 ? 64 : -64)
            ty = 84
            dodging = true
        }
    }

    // 2. lava: if the floor under us is a pit and we are low, bail up and
    // sideways toward the nearest solid
    if (!dodging && inPit(gs, rd.x) && rd.y > 118) {
        const left = searchSolid(gs, rd.x, -1)
        const right = searchSolid(gs, rd.x, 1)
        const dl = left === null ? 1e9 : Math.abs(wrapDelta(left - rd.x))
        const dr = right === null ? 1e9 : Math.abs(wrapDelta(right - rd.x))
        tx = dl <= dr ? left : right
        if (tx === null) tx = rd.x
        ty = Math.min(rd.y, 118)
        dodging = true
    }

    // 3. threat: a rider that will arrive AT or ABOVE our lance. Geometry:
    // dropping in on us from above (losing), or level with us (mutual).
    // A rider below us is not a threat — it is a point on the scoreboard,
    // and dodging away from it is what kept the first builds off the eggs.
    if (!dodging) {
        const foe0 = nearestFoe(gs, rd)
        if (foe0) {
            const fdx0 = wrapDelta(foe0.x - rd.x)
            const fdy0 = foe0.y - rd.y
            const relV = foe0.vy - rd.vy
            const threat = Math.abs(fdx0) < 44 && (
                (fdy0 < -6 && fdy0 > -140 && relV > 0.25) ||
                Math.abs(fdy0) <= 8
            )
            if (threat) {
                // latch one escape side: flipping tx every tick (an earlier
                // build's bug) pins the mount in the column it must leave.
                const side = Math.abs(fdx0) >= 12
                    ? (fdx0 > 0 ? -1 : 1)
                    : Math.abs(rd.vx) > 0.25
                        ? Math.sign(rd.vx)
                        : Math.abs(foe0.vx) > 0.25
                            ? -Math.sign(foe0.vx)
                            : (foe0.x > W / 2 ? -1 : 1)
                tx = foe0.x + side * 80
                ty = fdy0 < 0
                    ? ((((gs.tick >> 4) & 1) ? rd.y - 14 : rd.y + 8))
                    : foe0.y - 40
                dodging = true
            }
        }
    }

    // 4. eggs, then 5. the joust from above. Eggs come FIRST: a resting
    // egg is a next-wave monster on a timer, and collecting every one is
    // the difference between five waves and a hatchery.
    if (!dodging) {
        const foe = nearestFoe(gs, rd)
        const egg = nearestEgg(gs, rd)
        if (egg) {
            tx = egg.x
            ty = egg.y
        } else if (foe) {
            const fdx = wrapDelta(foe.x - rd.x)
            const fdy = foe.y - rd.y
            const committed = fdy > 26 && Math.abs(fdx) < 16 && foe.vy > -0.25 && rd.vy >= -0.2
            tx = foe.x
            ty = committed ? foe.y - 8 : foe.y - 32
        }
    }

    // never finish a vector BELOW an outstretched hand: hold above its tip
    // and dive when it sinks (detouring sideways lost eggs; hovering above
    // the column is safe — the hand only eats riders below the tip)
    if (!dodging) {
        for (const h of gs.hands) {
            if (h.out && ty > h.y - 12 && Math.abs(wrapDelta(tx - h.x)) < 30) ty = Math.min(ty, h.y - 16)
        }
    }

    // 5. never land crooked: when the floor is close and falling, unwind
    // the tilt with a counter-press before the feet arrive
    if (!dodging && rd.vy > 0.3) {
        const g = groundTopAt(gs, rd.x)
        if (g && g.y - (rd.y + CFG.foot) < 36 && Math.abs(rd.a) > 0.12) {
            if (rd.a > 0) { out.l = true } else { out.r = true }
            out.f = true
            return out
        }
    }

    // never aim below the lava line, and never into a pit edge
    if (inPit(gs, tx)) ty = Math.min(ty, LAVA_TOP - 44)
    const gtx = groundTopAt(gs, tx)
    if (gtx && ty > gtx.y - CFG.foot - 2) ty = gtx.y - CFG.foot - 2

    const dx = wrapDelta(tx - rd.x)
    // travel like the original: sideways happens on a lean — glide down the
    // tilt, flap only when the target is ABOVE us. (An earlier build flapped
    // to steer and the net lift pinned the mount to the ceiling: it hovered
    // at y=12 for a whole wave while eggs fell past it.)
    const desiredA = Math.max(-0.8, Math.min(0.8, dx * 0.02))
    if (rd.a < desiredA - 0.06) out.r = true
    else if (rd.a > desiredA + 0.06) out.l = true

    const predict = rd.y + rd.vy * 14
    out.f = predict > ty + 4
    if (rd.onGround && Math.abs(dx) < 30 && predict > ty - 40) out.f = true
    if (rd.onGround && ty < rd.y - 20) out.f = true
    return out
}

export function plan(gs) {
    const inp = {}
    const p1 = gs.players[0]
    const r1 = p1 && p1.rider
    const a = planRider(gs, r1)
    inp.l = a.l; inp.r = a.r; inp.f = a.f
    const p2 = gs.players[1]
    if (p2) {
        const b = planRider(gs, p2.rider)
        inp.l2 = b.l; inp.r2 = b.r; inp.f2 = b.f
    }
    return inp
}
