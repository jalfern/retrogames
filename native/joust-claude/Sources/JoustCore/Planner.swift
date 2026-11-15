// THE AUTOPILOT — Swift port of src/games/Joust/planner.js. Scripts the
// attract demo and the WATCH mode. Deterministic: same state in, same pads out.

import Foundation

extension Game {
    func searchSolid(_ x: Double, _ dir: Double) -> Double? {
        var xx = x
        for _ in 0..<18 {
            xx = (xx + dir * 4 + W).truncatingRemainder(dividingBy: W)
            if let g = groundTopAt(xx) { return (g.x0 + g.x1) / 2 }
        }
        return nil
    }

    func nearestFoe(_ rd: Rider) -> Rider? {
        var best: Rider? = nil
        var bd = 1e9
        for e in riders where e.state == "hunt" {
            let dx = wrapDelta(e.x - rd.x)
            let d = dx * dx + (e.y - rd.y) * (e.y - rd.y)
            if d < bd { bd = d; best = e }
        }
        return best
    }

    func nearestEgg(_ rd: Rider) -> Egg? {
        var best: Egg? = nil
        var bd = 170.0 * 170.0
        for egg in eggs {
            let dx = wrapDelta(egg.x - rd.x)
            let d = dx * dx + (egg.y - rd.y) * (egg.y - rd.y)
            if d < bd { bd = d; best = egg }
        }
        return best
    }

    public func planRider(_ rider: Rider?) -> (l: Bool, r: Bool, f: Bool) {
        var out = (l: false, r: false, f: false)
        guard let rd = rider, rd.state == "alive" else { return out }
        var tx: Double? = W / 2
        var ty = 110.0

        var dodging = false
        for h in hands {
            if h.out && abs(wrapDelta(rd.x - h.x)) < 34 && rd.y > h.y - 26 {
                tx = h.x + (wrapDelta(rd.x - h.x) >= 0 ? 64 : -64)
                ty = 84
                dodging = true
            }
        }

        if !dodging && inPit(rd.x) && rd.y > 118 {
            let left = searchSolid(rd.x, -1)
            let right = searchSolid(rd.x, 1)
            let dl = left == nil ? 1e9 : abs(wrapDelta(left! - rd.x))
            let dr = right == nil ? 1e9 : abs(wrapDelta(right! - rd.x))
            tx = dl <= dr ? left : right
            if tx == nil { tx = rd.x }
            ty = min(rd.y, 118)
            dodging = true
        }

        if !dodging, let foe0 = nearestFoe(rd) {
            let fdx0 = wrapDelta(foe0.x - rd.x)
            let fdy0 = foe0.y - rd.y
            let relV = foe0.vy - rd.vy
            let threat = abs(fdx0) < 44 && ((fdy0 < -6 && fdy0 > -140 && relV > 0.25) || abs(fdy0) <= 8)
            if threat {
                let sgn: (Double) -> Double = { $0 > 0 ? 1 : ($0 < 0 ? -1 : 0) }
                let side: Double = abs(fdx0) >= 12
                    ? (fdx0 > 0 ? -1 : 1)
                    : abs(rd.vx) > 0.25
                        ? sgn(rd.vx)
                        : abs(foe0.vx) > 0.25
                            ? -sgn(foe0.vx)
                            : (foe0.x > W / 2 ? -1 : 1)
                tx = foe0.x + side * 80
                ty = fdy0 < 0
                    ? (((tick >> 4) & 1) != 0 ? rd.y - 14 : rd.y + 8)
                    : foe0.y - 40
                dodging = true
            }
        }

        if !dodging {
            let foe = nearestFoe(rd)
            if let egg = nearestEgg(rd) {
                tx = egg.x
                ty = egg.y
            } else if let foe {
                let fdx = wrapDelta(foe.x - rd.x)
                let fdy = foe.y - rd.y
                let committed = fdy > 26 && abs(fdx) < 16 && foe.vy > -0.25 && rd.vy >= -0.2
                tx = foe.x
                ty = committed ? foe.y - 8 : foe.y - 32
            }
        }

        let txv = tx!
        if !dodging {
            for h in hands {
                if h.out && ty > h.y - 12 && abs(wrapDelta(txv - h.x)) < 30 { ty = min(ty, h.y - 16) }
            }
        }

        if !dodging && rd.vy > 0.3 {
            if let g = groundTopAt(rd.x), g.y - (rd.y + CFG.foot) < 36 && abs(rd.a) > 0.12 {
                if rd.a > 0 { out.l = true } else { out.r = true }
                out.f = true
                return out
            }
        }

        if inPit(txv) { ty = min(ty, LAVA_TOP - 44) }
        if let gtx = groundTopAt(txv), ty > gtx.y - CFG.foot - 2 { ty = gtx.y - CFG.foot - 2 }

        let dx = wrapDelta(txv - rd.x)
        let desiredA = max(-0.8, min(0.8, dx * 0.02))
        if rd.a < desiredA - 0.06 { out.r = true }
        else if rd.a > desiredA + 0.06 { out.l = true }

        let predict = rd.y + rd.vy * 14
        out.f = predict > ty + 4
        if rd.onGround && abs(dx) < 30 && predict > ty - 40 { out.f = true }
        if rd.onGround && ty < rd.y - 20 { out.f = true }
        return out
    }

    public func plan() -> Input {
        let a = planRider(players[0].rider)
        var inp = Input(l: a.l, r: a.r, f: a.f)
        if players.count > 1 {
            let b = planRider(players[1].rider)
            inp.l2 = b.l; inp.r2 = b.r; inp.f2 = b.f
        }
        return inp
    }
}
