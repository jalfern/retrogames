// The autopilot, a line-for-line port of src/games/Gauntlet/planner.js:
// decide() drives seat 1 (attract + WATCH), partnerPad() is the CPU partner
// seat — a pad emitter that says only what a pad can say. Their `_`-scratch
// (locked threat, turn latch, hero-velocity smoothing) lives on Game, as it
// lives on gs on the web. The voice-call doctrine (#1249) is not ported: with
// no spoken command the web takes the same follow path this does.
// Parity: check.sh races both against planner.js tick for tick.

import Foundation
import RetroKit

extension Game {
    func cellWalk(_ c: Int, _ r: Int) -> Bool {
        let g = levelData.g[r][c]
        return !(g == 35 || g == ch("B") || g == ch("T"))
    }

    func planBfs(_ sr: Int, _ sc: Int, _ tr: Int, _ tc: Int, _ pass: (Int, Int) -> Bool) -> [(Int, Int)] {
        var prev: [Int: Int] = [:]
        var q: [(Int, Int)] = [(sr, sc)], head = 0
        var seen: Set<Int> = [sr * W + sc]
        while head < q.count {
            let (r, c) = q[head]; head += 1
            if r == tr && c == tc {
                var path: [(Int, Int)] = []
                var k = tr * W + tc
                while k != sr * W + sc {
                    path.insert((k % W, k / W), at: 0)
                    guard let p = prev[k] else { return [] }
                    k = p
                }
                return path
            }
            for (dr, dc) in [(0, 1), (0, -1), (1, 0), (-1, 0)] {
                let nr = r + dr, nc = c + dc
                let key = nr * W + nc
                if seen.contains(key) || nr < 0 || nc < 0 || nr >= H || nc >= W { continue }
                if !pass(nc, nr) { continue }
                seen.insert(key); prev[key] = r * W + c; q.append((nr, nc))
            }
        }
        return []
    }

    func locksBetween(_ sr: Int, _ sc: Int, _ tr: Int, _ tc: Int) -> Int {
        var prev: [Int: Int] = [:]
        var q: [(Int, Int)] = [(sr, sc)], head = 0
        var seen: Set<Int> = [sr * W + sc]
        while head < q.count {
            let (r, c) = q[head]; head += 1
            if r == tr && c == tc {
                var n = 0, k = tr * W + tc
                while k != sr * W + sc {
                    if levelData.g[k / W][k % W] == ch("L") { n += 1 }
                    k = prev[k]!
                }
                return n
            }
            for (dr, dc) in [(0, 1), (0, -1), (1, 0), (-1, 0)] {
                let nr = r + dr, nc = c + dc
                let key = nr * W + nc
                if seen.contains(key) || nr < 0 || nc < 0 || nr >= H || nc >= W { continue }
                if !cellWalk(nc, nr) { continue }
                seen.insert(key); prev[key] = r * W + c; q.append((nr, nc))
            }
        }
        return Int.max
    }

    func planLosClear(_ x0: Double, _ y0: Double, _ x1: Double, _ y1: Double) -> Bool {
        let d = jsHypot(x1 - x0, y1 - y0)
        let steps = Int((d / 0.25).rounded(.up))
        if steps > 1 { for i in 1..<steps {
            let t = Double(i) / Double(steps)
            let c = jsFloor(x0 + (x1 - x0) * t), r = jsFloor(y0 + (y1 - y0) * t)
            let g = levelData.g[r][c]
            if g == 35 || g == ch("B") || g == ch("T") { return false }
        } }
        return true
    }

    /// the pilot (planner.js decide)
    public func decide() -> Input {
        var inp = Input()
        guard let h = hero, h.deadT <= 0, end == nil else { return inp }
        func norm(_ a0: Double) -> Double { var a = a0; while a > .pi { a -= 2 * .pi }; while a < -.pi { a += 2 * .pi }; return a }

        var threat = monsters.first { $0.id == pThreat }
        if let t = threat {
            let d = jsHypot(t.x - h.x, t.y - h.y)
            let drain = MONSTERS[t.kind]!.drain ?? false
            if d > 7 || !planLosClear(h.x, h.y, t.x, t.y) || (!drain && d > 2.4 && tick > (pThreatAt ?? 0) + 90) { threat = nil }
        }
        if threat == nil {
            var drain: Monster? = nil, dd = 1e9, front: Monster? = nil, fs = 1e9
            for m in monsters {
                let d = jsHypot(m.x - h.x, m.y - h.y)
                if d > 7 || !planLosClear(h.x, h.y, m.x, m.y) { continue }
                if MONSTERS[m.kind]!.drain ?? false { if d < dd { drain = m; dd = d }; continue }
                let diff = abs(norm(jsAtan2(m.y - h.y, m.x - h.x) - h.a))
                if d < 1.45 || (diff < 0.35 && d <= Double(h.arrowRange)) {
                    let s = d + diff * 4
                    if s < fs { front = m; fs = s }
                }
            }
            threat = front ?? drain
        }
        pThreat = threat?.id ?? 0
        if threat != nil { pThreatAt = tick }
        if let t = threat {
            let dx = t.x - h.x, dy = t.y - h.y
            let d = jsHypot(dx, dy)
            if d < 0.65 { inp.sword = true; return inp }
            let want = jsAtan2(dy, dx)
            let diff = norm(want - h.a)
            if topDown {
                if abs(diff) > 2.2 && d < 3.2 { inp.aim = want + .pi; inp.fwd = true; return inp }
                inp.aim = want
                if d < 1.45 { inp.sword = true; return inp }
                if d <= Double(h.arrowRange) {
                    inp.arrow = true
                    if (MONSTERS[t.kind]!.drain ?? false) && d < 4.5 { inp.back = true } else { inp.fwd = d > 3 }
                }
                return inp
            }
            let aiming = abs(diff) <= 0.18
            if aiming && d < 1.45 { inp.sword = true; return inp }
            if aiming && d <= Double(h.arrowRange) {
                inp.arrow = true
                if (MONSTERS[t.kind]!.drain ?? false) && d < 4.5 { inp.back = true } else { inp.fwd = d > 3 }
                return inp
            }
            if aiming { inp.arrow = true; return inp }
            if abs(diff) > 2.2 && d < 3.2 { inp.fwd = true; return inp }
            inp.left = diff < 0; inp.right = diff > 0
            return inp
        }

        let hc = jsFloor(h.x), hr = jsFloor(h.y)
        let ex = levelData.exit[0], ey = levelData.exit[1]
        func near(_ t: String) -> (Int, Int)? {
            var bd = 1e9; var goal: (Int, Int)? = nil
            for it in items where !(it.taken ?? false) && it.t == t {
                let d = abs(it.x - h.x) + abs(it.y - h.y)
                if d < bd { bd = d; goal = (jsFloor(it.x), jsFloor(it.y)) }
            }
            return goal
        }
        var goal: (Int, Int)? = nil
        if Double(h.hp) < Double(h.maxHp) * 0.7 { goal = near("food") ?? near("potion") }
        let locks = locksBetween(hr, hc, ey, ex)
        if keys < locks { goal = goal ?? near("key") }
        let g = goal ?? (ex, ey)
        let path = planBfs(hr, hc, g.1, g.0) { self.cellWalk($0, $1) }
        if path.isEmpty { inp.fwd = true; return inp }
        let (pc, pr) = path[0]
        let straight = path.count > 1 && abs(path[1].0 - pc) + abs(path[1].1 - pr) == 2
        let (tc, tr) = straight ? path[1] : path[0]
        let want = jsAtan2(Double(tr) + 0.5 - h.y, Double(tc) + 0.5 - h.x)
        if topDown { inp.aim = want; inp.fwd = true; return inp }
        let diff = norm(want - h.a)
        if abs(diff) > 0.1 {
            let dir = diff < 0 ? -1 : 1
            if let pt = pTurn, pt != 0, pt != dir, abs(diff) < 0.35 { inp.left = pt < 0; inp.right = pt > 0 }
            else { pTurn = dir; inp.left = dir < 0; inp.right = dir > 0 }
        } else { inp.fwd = true }
        return inp
    }

    // MARK: the CPU partner seat

    func padPassable(_ c: Int, _ r: Int) -> Bool {
        guard r >= 0, r < H, c >= 0, c < W else { return false }
        let g = levelData.g[r][c]
        if g == 35 || g == ch("B") || g == ch("T") { return false }
        if g == ch("L") { let d = doorAt(c, r); return d != nil && (d!.open || d!.broken) }
        return true
    }
    func padPath(_ sr: Int, _ sc: Int, _ tr: Int, _ tc: Int) -> [(Int, Int)] {
        if !padPassable(sc, sr) || !padPassable(tc, tr) { return [] }
        if sr == tr && sc == tc { return [] }
        return planBfs(sr, sc, tr, tc) { self.padPassable($0, $1) }
    }

    /// planner.js partnerPad: direction booleans + an `a` pulse, nothing else
    public func partnerPad(prevA: Bool) -> PadRec {
        var pad = PadRec()
        guard let p = partner, !p.down, end == nil, let h = hero, h.deadT <= 0 else { return pad }
        var cut = false
        for m in monsters where jsHypot(m.x - p.x, m.y - p.y) < 1.25 { cut = true; break }
        if cut { pad.a = !prevA }
        let vx = h.x - (pHX ?? h.x), vy = h.y - (pHY ?? h.y)
        pHX = h.x; pHY = h.y
        pVX = (pVX ?? 0) * 0.4 + vx * 0.6
        pVY = (pVY ?? 0) * 0.4 + vy * 0.6
        let vs = jsHypot(pVX!, pVY!)
        var tx: Double, ty: Double
        if vs > 0.012 {
            let look = min(1.8, vs * 24)
            tx = h.x + (pVX! / vs) * look
            ty = h.y + (pVY! / vs) * look
        } else {
            tx = h.x - jsCos(h.a) * 1.0
            ty = h.y - jsSin(h.a) * 1.0
        }
        func steer(_ gx: Double, _ gy: Double, _ dead: Double) {
            let dx = gx - p.x, dy = gy - p.y
            if jsHypot(dx, dy) <= dead { return }
            pad.left = dx < -0.18; pad.right = dx > 0.18; pad.up = dy < -0.18; pad.down = dy > 0.18
        }
        func steerOnPath(_ path: [(Int, Int)], _ dead: Double) {
            let (wc, wr) = path[0]
            let dx = Double(wc) + 0.5 - p.x, dy = Double(wr) + 0.5 - p.y
            if jsHypot(dx, dy) <= dead { return }
            pad.left = dx < -0.18; pad.right = dx > 0.18; pad.up = dy < -0.18; pad.down = dy > 0.18
        }
        if Double(p.hp) < Double(p.maxHp) * 0.55 {
            var bd = 20.0; var goal: (Int, Int)? = nil
            for it in items where !(it.taken ?? false) && it.t == "food" {
                let d = abs(it.x - p.x) + abs(it.y - p.y)
                if d < bd { bd = d; goal = (jsFloor(it.x), jsFloor(it.y)) }
            }
            if let g = goal {
                let path = padPath(jsFloor(p.y), jsFloor(p.x), g.1, g.0)
                if !path.isEmpty { steerOnPath(path, 0.3); return pad }
            }
        }
        let pr = jsFloor(p.y), pc = jsFloor(p.x)
        var path = padPath(pr, pc, jsFloor(ty), jsFloor(tx))
        if path.isEmpty { path = padPath(pr, pc, jsFloor(h.y), jsFloor(h.x)) }
        if !path.isEmpty { steerOnPath(path, 0.25); return pad }
        func nearCell(_ gx: Double, _ gy: Double) -> Bool { jsFloor(gy) == pr && jsFloor(gx) == pc }
        if nearCell(tx, ty) { steer(tx, ty, 0.45) }
        else if nearCell(h.x, h.y) { steer(h.x - jsCos(h.a) * 1.0, h.y - jsSin(h.a) * 1.0, 0.45) }
        return pad
    }
}

/// makeHeroPadCodec().toPad: the pilot's answer on THE one pad (aim on ax/ay)
public func toPad(_ inp: Input) -> PadRec {
    var p = PadRec()
    if let a = inp.aim { p.ax = jsCos(a); p.ay = jsSin(a) }
    p.up = inp.fwd; p.down = inp.back; p.left = inp.left; p.right = inp.right
    p.a = inp.sword; p.b = inp.arrow
    return p
}
