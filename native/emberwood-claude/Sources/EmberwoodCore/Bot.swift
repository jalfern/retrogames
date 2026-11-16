// The attract / WATCH autopilot: a line-for-line port of src/games/Emberwood/bot.js
// (+ tilePath/openTile from solver.js). It plays the solver's proven route with
// real inputs — walks, bombs cracks, unlocks doors, pushes the block, arrows the
// switches, fights hit-and-run, fells the Maw and the Wyrm. The route and the
// screen graph are static, so scripts/genworld.mjs computes them from the web
// code (World.plan / World.graph, JS key order kept); everything that reads
// the live sim is here. Parity: given the same sim it must emit the same
// input as bot.js on every tick (check.sh races it over the attract run and
// the fuzz runs).

import Foundation
import RetroKit

// MARK: - solver.js: tilePath over the bot's view of the world

struct St {
    let cracked: [String: Bool], doors: [String: Bool], switches: [String: Bool], chests: [String: Bool]
    let flags: Flags
    init(_ sim: Sim) {
        cracked = sim.flags.cracked; doors = sim.flags.doorsOpen; switches = sim.flags.switchesOn
        chests = sim.flags.chestsOpen; flags = sim.flags
    }
}

func openTile(_ id: String, _ tx: Int, _ ty: Int, _ st: St) -> Bool {
    if tx < 0 || ty < 0 || tx >= SW || ty >= SH { return false }
    let s = World.screens[id]!
    if let d0 = (s.doors ?? []).first(where: { $0.x == tx && $0.y == ty }) {
        return (st.doors[d0.id] ?? false) || (d0.kind == "switch" && (st.switches[d0.switch ?? "undefined"] ?? false))
    }
    let c = tileAt(s, tx, ty)
    if c == 67 { // 'C' — solver keys cracks as "screen:id"; the bot's st keys them by id, so a crack never opens here (kept as-is)
        let cid = (s.cracks ?? []).first(where: { $0.x == tx && $0.y == ty })?.id ?? "undefined"
        return st.cracked[id + ":" + cid] ?? false
    }
    if c == 118 { return false } // 'v': the bot's st carries no ventsOff
    if c == 65 { return false }  // 'A': nor the cinderstep
    if isSolidTile(c) { return false }
    if c == 46 {
        if (s.chests ?? []).contains(where: { $0.x == tx && $0.y == ty && !(st.chests[$0.id] ?? false) && ($0.after == nil || st.flags.truthy($0.after!)) }) { return false }
        if (s.blocks ?? []).contains(where: { $0.x == tx && $0.y == ty }) { return false }
    }
    return true
}

typealias T2 = (Int, Int)

func tilePath(_ id: String, _ from: T2, _ to: T2, _ st: St) -> [T2]? {
    if !openTile(id, to.0, to.1, st) { return nil }
    @inline(__always) func key(_ x: Int, _ y: Int) -> Int { (x + 64) * 256 + (y + 64) }
    var prev: [Int: Int] = [key(from.0, from.1): -1]
    var q: [T2] = [from]
    var head = 0
    while head < q.count {
        let (x, y) = q[head]; head += 1
        if x == to.0 && y == to.1 {
            var out: [T2] = []
            var cur = key(x, y)
            while cur != -1 { out.insert((cur / 256 - 64, cur % 256 - 64), at: 0); cur = prev[cur]! }
            return out
        }
        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let nx = x + dx, ny = y + dy
            if prev[key(nx, ny)] != nil { continue }
            if !openTile(id, nx, ny, st) { continue }
            prev[key(nx, ny)] = key(x, y)
            q.append((nx, ny))
        }
    }
    return nil
}

// MARK: - bot.js

private let DIRS: [T2] = [(0, -1), (0, 1), (-1, 0), (1, 0)]
private let ENGAGE = 46.0, LEASH = 84.0, FIGHT_BUDGET = 2400

/// fight / boss state that cadenceTap counts on
protocol Cadence: AnyObject { var tap: Int { get set } }

final class Fight: Cadence {
    let e: Enemy; let screen: String
    var t = 0, tt = 0, ph = "close", tap = 0, zz = 1.0, side = 1.0
    var px: Double? = nil, py = 0.0, pt = 0
    var ax: Int? = nil, sx = 0.0, sy = 0.0, mn = 0.0, hp = 0
    init(_ e: Enemy, _ screen: String) { self.e = e; self.screen = screen }
}
final class BossState: Cadence {
    let screen: String; var ph = "reposition", tt = 0, strikes = 0, tap = 0; let side: Double
    init(_ screen: String, _ side: Double) { self.screen = screen; self.side = side }
}
final class Seq {
    let kind: String, screen: String
    var t = 0, i = 0, at: Int? = nil, px: Double? = nil, py = 0.0
    var fx = 0.0, fy = 0.0
    var edgeDir = "", tile: T2? = nil, dirN = 0.0
    var m: T2 = (0, 0)
    var stall = 0, ht = ""
    init(_ kind: String, _ screen: String) { self.kind = kind; self.screen = screen }
}
struct Pending { var kind: String; var m: T2? = nil; var dir = ""; var dirN = 0.0; var tile: T2? = nil; var screen: String }

@inline(__always) private func sgn(_ x: Double) -> Double { jsSign(x) }
@inline(__always) private func or1(_ x: Double, _ d: Double) -> Double { x != 0 ? x : d } // `x || d` on a number

public final class Bot {
    var pi = 0
    var seq: Seq? = nil
    var fight: Fight? = nil
    var boss: BossState? = nil
    var fightCool = 0
    var panicT = 0, panicV: (Double, Double) = (0, 0)
    var tailT = 0, tailKey: String? = nil
    var black: [String: Bool] = [:]
    var broke = 0
    var stall = 0
    var path: [T2]? = nil
    var pending: Pending? = nil
    var wig = 0
    var pushQ: [T2]? = nil
    var pushStall = 0
    let plan = World.plan

    public init() {}

    // MARK: helpers

    func freeAt(_ sim: Sim, _ x: Double, _ y: Double) -> Bool {
        let tx = jsFloor(x / TSD), ty = jsFloor(y / TSD)
        if tx < 0 || ty < 0 || tx >= SW || ty >= SH { return false }
        let c = tileAt(World.screens[sim.screen]!, tx, ty)
        return !isSolidTile(c) && c != 67
    }
    func setMove(_ inp: inout Input, _ dx: Double, _ dy: Double) {
        inp.lx = abs(dx) >= abs(dy) ? sgn(dx) : 0
        inp.ly = abs(dy) > abs(dx) ? sgn(dy) : 0
    }
    func moveAway(_ inp: inout Input, _ dx: Double, _ dy: Double) { setMove(&inp, -dx, -dy) }
    @discardableResult
    func cadenceTap(_ f: Cadence, _ inp: inout Input, _ every: Int) -> Bool {
        f.tap += 1
        let p = f.tap % every
        if p == 1 { inp.aPressed = true }
        else if p == 2 { inp.aHeld = true }
        else if p == 3 { inp.aReleased = true; return true }
        return false
    }

    func doneAction(_ sim: Sim, _ a: PlanStep) -> Bool {
        switch a.type {
        case "chest": return sim.flags.chestsOpen[a.id] ?? false
        case "crack": return sim.flags.cracked[a.id] ?? false
        case "switch", "plate": return sim.flags.switchesOn[a.id] ?? false
        case "boss": return sim.flags.truthy(a.id)
        default: return true
        }
    }

    func metaTile(_ a: PlanStep) -> T2? {
        let s = World.screens[a.screen]!
        switch a.type {
        case "chest": return (s.chests ?? []).first { $0.id == a.id }.map { ($0.x, $0.y) }
        case "crack": return (s.cracks ?? []).first { $0.id == a.id }.map { ($0.x, $0.y) }
        case "switch": return (s.switches ?? []).first { $0.id == a.id }.map { ($0.x, $0.y) }
        case "plate": return (s.plates ?? []).first { $0.id == a.id }.map { ($0.x, $0.y) }
        default: return nil
        }
    }

    func standables(_ id: String, _ t: T2, _ st: St) -> [T2] {
        let s = World.screens[id]!
        var out: [T2] = []
        for (dx, dy) in DIRS {
            let x = t.0 + dx, y = t.1 + dy
            if x < 0 || y < 0 || x >= SW || y >= SH { continue }
            let c = tileAt(s, x, y)
            if isSolidTile(c) || c == 67 { continue }
            if (s.doors ?? []).contains(where: { $0.x == x && $0.y == y }) { continue }
            if (s.chests ?? []).contains(where: { $0.x == x && $0.y == y && !(st.chests[$0.id] ?? false) }) { continue }
            if (s.blocks ?? []).contains(where: { $0.x == x && $0.y == y }) { continue }
            out.append((x, y))
        }
        return out
    }

    func reqOK(_ k: String, _ flags: Flags) -> Bool {
        guard let s = World.screens[k], let r = s.req else { return true }
        return flags.truthy(r)
    }

    func screenRoute(_ from: String, _ to: String, _ flags: Flags) -> Edge? {
        if from == to { return nil }
        var prev: [String: (String, Edge)?] = [from: nil]
        var q = [from], head = 0
        while head < q.count {
            let id = q[head]; head += 1
            for e in World.graph[id] ?? [] {
                if prev[e.to] != nil || !reqOK(e.to, flags) { continue }
                prev[e.to] = (id, e)
                if e.to == to {
                    var cur = to
                    while prev[cur]!!.0 != from { cur = prev[cur]!!.0 }
                    return prev[cur]!!.1
                }
                q.append(e.to)
            }
        }
        return nil
    }

    func screenReachable(_ from: String, _ to: String, _ flags: Flags) -> Bool {
        if from == to { return true }
        var seen: Set<String> = [from]
        var q = [from], head = 0
        while head < q.count {
            let id = q[head]; head += 1
            for e in World.graph[id] ?? [] {
                if !reqOK(e.to, flags) { continue }
                if e.to == to { return true }
                if !seen.contains(e.to) { seen.insert(e.to); q.append(e.to) }
            }
        }
        return false
    }

    func floorTile(_ s: Screen, _ x: Int, _ y: Int) -> Bool {
        x >= 0 && y >= 0 && x < SW && y < SH && tileAt(s, x, y) == 46 &&
            !(s.doors ?? []).contains(where: { $0.x == x && $0.y == y }) && !(s.chests ?? []).contains(where: { $0.x == x && $0.y == y })
    }

    /// sokoban-lite BFS over (hero, block): directions that push the block onto the plate
    func pushPlan(_ sim: Sim, _ block: Block) -> [T2]? {
        let s = World.screens[sim.screen]!
        guard let plate = s.plates?.first else { return nil }
        func key(_ a: Int, _ b: Int, _ c: Int, _ d: Int) -> Int { ((a + 8) * 64 + (b + 8)) * 4096 + (c + 8) * 64 + (d + 8) }
        let start = (jsFloor(sim.hero.x / TSD), jsFloor(sim.hero.y / TSD), block.x, block.y)
        var prev: [Int: (Int, T2)?] = [key(start.0, start.1, start.2, start.3): nil]
        var q = [start], head = 0
        while head < q.count {
            let (hx, hy, bx, by) = q[head]; head += 1
            if bx == plate.x && by == plate.y {
                var dirs: [T2] = []
                var cur = key(hx, hy, bx, by)
                while let p = prev[cur], let pp = p { dirs.insert(pp.1, at: 0); cur = pp.0 }
                return dirs
            }
            for (dx, dy) in DIRS {
                let nhx = hx + dx, nhy = hy + dy
                var nbx = bx, nby = by
                if nhx == bx && nhy == by {
                    nbx = bx + dx; nby = by + dy
                    if !floorTile(s, nbx, nby) { continue }
                    if nbx == bx && nby == by { continue }
                } else if !floorTile(s, nhx, nhy) { continue }
                if nbx == nhx && nby == nhy { continue }
                let k = key(nhx, nhy, nbx, nby)
                if prev[k] != nil { continue }
                prev[k] = (key(hx, hy, bx, by), (dx, dy))
                q.append((nhx, nhy, nbx, nby))
            }
        }
        return nil
    }

    // MARK: combat

    func dodgeTick(_ sim: Sim, _ inp: inout Input) -> Bool {
        let h = sim.hero
        var threat: Enemy? = nil, tBest = 1e9
        for e in sim.enemies {
            if e.dead || e.type != "tuskroot" { continue }
            if !(e.st > 0 || e.charging > 0) { continue }
            let d = jsHypot(e.x - h.x, e.y - h.y)
            if d < 120 && d < tBest { tBest = d; threat = e }
        }
        guard let th = threat else { return false }
        var nx: Double, ny: Double
        if th.charging > 0 { nx = th.chx; ny = th.chy }
        else { let l = or1(tBest, 1); nx = (h.x - th.x) / l; ny = (h.y - th.y) / l }
        let px = -ny, py = nx
        var side: Double = th.seedOff % 2 != 0 ? 1 : -1
        if !freeAt(sim, h.x + px * side * 16, h.y + py * side * 16) { side = -side }
        if freeAt(sim, h.x + px * side * 16, h.y + py * side * 16) {
            inp.lx = sgn(px * side); inp.ly = sgn(py * side)
        } else { moveAway(&inp, nx, ny) }
        return true
    }

    func reachableThreat(_ sim: Sim, _ st: St) -> Enemy? {
        let h = sim.hero
        var best: Enemy? = nil, bd = ENGAGE
        for e in sim.enemies {
            if e.dead || e.hidden || e.boss != 0 { continue }
            if black["\(sim.screen):\(e.i.map(String.init) ?? "undefined")"] ?? false { continue }
            let d = jsHypot(e.x - h.x, e.y - h.y)
            if d < bd { bd = d; best = e }
        }
        guard let b = best else { return nil }
        let p = tilePath(sim.screen, (jsFloor(h.x / TSD), jsFloor(h.y / TSD)), (jsFloor(b.x / TSD), jsFloor(b.y / TSD)), st)
        return p != nil && p!.count <= 20 ? b : nil
    }

    func fightTick(_ sim: Sim, _ inp: inout Input) -> Bool {
        let h = sim.hero
        guard let f = fight else { return false }
        let e = f.e
        if e.dead { fight = nil; return false }
        let dx = e.x - h.x, dy = e.y - h.y
        let dist = jsHypot(dx, dy)
        let blacken = { self.black["\(sim.screen):\(e.i.map(String.init) ?? "undefined")"] = true; self.fight = nil; self.fightCool = 60 }
        if dist > LEASH { blacken(); return false }
        f.t += 1
        if f.t > FIGHT_BUDGET {
            broke += 1
            if broke > 2 { blacken() } else { fight = nil; fightCool = 60 }
            return false
        }
        if f.px == nil { f.px = h.x; f.py = h.y; f.pt = 0 }
        f.pt += 1
        if f.pt > 60 {
            if jsHypot(h.x - f.px!, h.y - f.py) < 2 && e.type != "tuskroot" { blacken(); return false }
            f.px = h.x; f.py = h.y; f.pt = 0
        }
        f.tt += 1

        if e.type == "tuskroot" {
            if e.rest > 0 {
                if dist > 20 { setMove(&inp, dx, dy); return true }
                cadenceTap(f, &inp, 8)
                return true
            }
            if dist < 36 { moveAway(&inp, dx, dy) } else if dist > 52 { setMove(&inp, dx, dy) }
            else { let s = f.side; inp.lx = or1(sgn(-dy), s); inp.ly = or1(sgn(dx), s) }
            return true
        }

        if e.type == "husk" {
            if f.ax == nil {
                let horiz = abs(dx) >= abs(dy)
                f.ax = horiz ? 1 : 0
                f.sx = horiz ? or1(sgn(dx), 1) : 1
                f.sy = horiz ? 1 : or1(sgn(dy), 1)
                f.mn = e.seedOff % 2 != 0 ? 1 : -1
            }
            let mx = Double(f.ax!), my = 1 - mx
            let s0 = mx != 0 ? f.sx : f.sy
            let poseX = e.x + mx * s0 * 4 + (1 - mx) * f.mn * 13.5
            let poseY = e.y + my * s0 * 4 + mx * f.mn * 13.5
            if f.ph == "close" {
                let minorDelta = mx != 0 ? (h.y - e.y) : (h.x - e.x)
                if minorDelta * f.mn < 0 {
                    if mx != 0 { inp.ly = f.mn } else { inp.lx = f.mn }
                    return true
                }
                if jsHypot(h.x - poseX, h.y - poseY) > 5 { setMove(&inp, poseX - h.x, poseY - h.y); return true }
                f.ph = "aim"; f.tt = 0
                return true
            }
            if f.ph == "aim" {
                inp.lx = -mx * s0; inp.ly = -my * s0
                if f.tt > 0 { f.ph = "strike"; f.tt = 0; f.hp = e.hp }
                return true
            }
            if f.ph == "strike" {
                if f.tt == 1 { inp.aPressed = true }
                else if f.tt == 2 { inp.aHeld = true }
                else if f.tt == 3 { inp.aReleased = true }
                if f.tt > 4 {
                    if e.dead { fight = nil; return false }
                    if !(e.hp < f.hp) { f.mn = -f.mn }
                    f.ph = "close"; f.tt = 0
                }
                return true
            }
            return true
        }

        if f.ph == "close" {
            if e.type == "spitter" && f.t % 12 < 6 { inp.lx = or1(f.zz, 1); inp.ly = 0 }
            if dist > 20 { setMove(&inp, dx, dy); return true }
            f.ph = "strike"; f.tt = 0
            return true
        }
        if f.ph == "strike" {
            cadenceTap(f, &inp, 6)
            if f.tt > 4 { f.ph = "back"; f.tt = 0; f.zz = -or1(f.zz, 1) }
            return true
        }
        moveAway(&inp, dx, dy)
        if f.tt > 12 { f.ph = "close"; f.tt = 0 }
        return true
    }

    // MARK: the tick (attractBot)

    /// One autopilot tick: lends the demo kit (attractBot's loan), then returns the input.
    public func tick(_ sim: Sim) -> Input {
        var inp = Input()
        Demo.lend(sim)
        if sim.death || sim.win { pi = 0; seq = nil; fight = nil; boss = nil; return inp }
        if let f = fight, f.screen != sim.screen { fight = nil }
        if let b = boss, b.screen != sim.screen { boss = nil }
        if fightCool > 0 { fightCool -= 1 }
        if dodgeTick(sim, &inp) { return inp }
        if panicT > 0 { panicT -= 1; inp.lx = panicV.0; inp.ly = panicV.1; return inp }
        do {
            let h0 = sim.hero
            var tail: Enemy? = nil, td = 26.0
            for e in sim.enemies {
                if e.dead || e.hidden || e.boss != 0 { continue }
                let d = jsHypot(e.x - h0.x, e.y - h0.y)
                if d < td { td = d; tail = e }
            }
            let key = tail.map { "\(sim.screen):\($0.i.map(String.init) ?? "undefined")" }
            tailT = tail != nil && tailKey == key ? tailT + 1 : 0
            tailKey = key
            if let tl = tail, tailT > 48 {
                tailT = 0
                let ax = h0.x - tl.x, ay = h0.y - tl.y
                let cands: [(Double, Double)] = abs(ax) >= abs(ay)
                    ? [(or1(sgn(ax), 1), 0), (0, or1(sgn(ay), 1)), (0, -or1(sgn(ay), 1)), (or1(-sgn(ax), 1), 0)]
                    : [(0, or1(sgn(ay), 1)), (or1(sgn(ax), 1), 0), (or1(-sgn(ax), 1), 0), (0, or1(-sgn(ay), 1))]
                for v in cands where freeAt(sim, h0.x + v.0 * 20, h0.y + v.1 * 20) { panicV = v; panicT = 26; break }
            }
        }
        let st = St(sim)
        if fight == nil && (seq == nil || seq!.kind == "walk") && fightCool == 0 {
            if let t = reachableThreat(sim, st) { fight = Fight(t, sim.screen) }
        }
        if fight != nil && fightTick(sim, &inp) { return inp }
        while pi < plan.count && doneAction(sim, plan[pi]) { pi += 1; seq = nil }
        func phase(_ s: String) -> Int { s.hasPrefix("d1") ? 1 : s.hasPrefix("d2") ? 2 : (s.hasPrefix("d4") || s == "ow-41") ? 3 : 0 }
        var ti = -1
        for (i, a) in plan.enumerated() where !doneAction(sim, a) && a.screen == sim.screen { ti = i; break }
        if ti < 0 {
            var bestPhase = 9
            for (i, a) in plan.enumerated() {
                if doneAction(sim, a) { continue }
                let ph = phase(a.screen)
                if ph < bestPhase && screenReachable(sim.screen, a.screen, sim.flags) { bestPhase = ph; ti = i }
            }
        }
        if ti < 0 { pi = 0; seq = nil; return inp }
        pi = ti
        let a = plan[ti]

        if let s = seq, s.screen != sim.screen { seq = nil }
        if seq != nil { return runSeq(sim, st, &inp) }

        let cur = (jsFloor(sim.hero.x / TSD), jsFloor(sim.hero.y / TSD))
        if a.screen == sim.screen && a.type == "boss" { return bossTick(sim, &inp, a.id) }

        var dest: [T2]? = nil
        if a.screen == sim.screen {
            if a.type == "plate", let block = sim.blocks.first {
                pushQ = pushPlan(sim, block) ?? []
                let sq = Seq("push", sim.screen)
                sq.ht = "\(jsFloor(sim.hero.x / TSD)),\(jsFloor(sim.hero.y / TSD))"
                seq = sq
                return runSeq(sim, st, &inp)
            }
            if let m = metaTile(a) {
                var stands = standables(sim.screen, m, st)
                if a.type == "crack" {
                    let cx = Double(m.0 * TS) + TSD / 2, cy = Double(m.1 * TS) + TSD / 2
                    stands = stands.filter { jsHypot(cx - (Double($0.0 * TS) + TSD / 2), cy - (Double($0.1 * TS) + TSD / 2 + 4)) <= 24 }
                }
                dest = bestPath(sim, cur, stands, st)
                pending = Pending(kind: a.type, m: m, screen: sim.screen)
            }
        } else {
            guard let e = screenRoute(sim.screen, a.screen, sim.flags) else { return inp }
            let s = World.screens[sim.screen]!
            if e.via == "edge" {
                var open: [T2] = []
                let d = e.dir ?? ""
                if d == "n" { for x in 0..<SW where tileAt(s, x, 0) == 46 { open.append((x, 0)) } }
                if d == "s" { for x in 0..<SW where tileAt(s, x, SH - 1) == 46 { open.append((x, SH - 1)) } }
                if d == "w" { for y in 0..<SH where tileAt(s, 0, y) == 46 { open.append((0, y)) } }
                if d == "e" { for y in 0..<SH where tileAt(s, SW - 1, y) == 46 { open.append((SW - 1, y)) } }
                dest = bestPath(sim, cur, open, st)
                pending = Pending(kind: "edge", dir: d, tile: dest?.last, screen: sim.screen)
            } else if e.via == "warp" {
                let t = (e.tile![0], e.tile![1])
                dest = bestPath(sim, cur, [t], st)
                pending = Pending(kind: "warp", screen: sim.screen)
            } else {
                let t = (e.tile![0], e.tile![1])
                let sw = (s.doors ?? []).first(where: { $0.id == e.did })?.switch ?? "undefined"
                let isOpen = (st.doors[e.did ?? "undefined"] ?? false) || (e.kind == "switch" && (st.switches[sw] ?? false))
                let stands = standables(sim.screen, t, st)
                dest = bestPath(sim, cur, stands, st)
                let dn: Double = t.1 == 0 ? -1 : t.1 >= SH - 1 ? 1 : t.0 == 0 ? 1 : -1
                pending = Pending(kind: isOpen ? "enter" : "unlock", dirN: dn, tile: t, screen: sim.screen)
            }
        }

        guard let d = dest else {
            stall += 1
            if stall > 60 { stall = 0; path = nil }
            return wiggle(&inp)
        }
        stall = 0
        path = Array(d.dropFirst())
        seq = Seq("walk", sim.screen)
        return walkTick(sim, &inp)
    }

    func bestPath(_ sim: Sim, _ cur: T2, _ stands: [T2], _ st: St) -> [T2]? {
        var best: [T2]? = nil
        for t in stands {
            if t.0 == cur.0 && t.1 == cur.1 { return [cur] }
            if let p = tilePath(sim.screen, cur, t, st), best == nil || p.count < best!.count { best = p }
        }
        return best
    }

    func wiggle(_ inp: inout Input) -> Input {
        wig += 1
        inp.lx = jsSin(Double(wig) * 0.7) > 0 ? 1 : -1
        inp.ly = jsCos(Double(wig) * 0.55) > 0 ? 1 : -1
        return inp
    }

    func walkTick(_ sim: Sim, _ inp: inout Input) -> Input {
        let sq = seq!
        guard let p = path, sq.i < p.count else {
            let pd = pending; pending = nil; arrive(sim, pd); return inp
        }
        let wp = p[sq.i]
        let tx = Double(wp.0 * TS) + TSD / 2, ty = Double(wp.1 * TS) + TSD / 2
        let h = sim.hero
        let dx = tx - h.x, dy = ty - h.y
        if jsHypot(dx, dy) < 2.5 { sq.i += 1; sq.at = 0; sq.px = h.x; sq.py = h.y; return walkTick(sim, &inp) }
        if sq.px == nil { sq.px = h.x; sq.py = h.y }
        let moved = jsHypot(h.x - sq.px!, h.y - sq.py)
        if moved > 2 { sq.at = (sq.at ?? 0) + (moved > 8 ? 2 : 1); sq.px = h.x; sq.py = h.y }
        let ax = abs(dx) > 1.2 ? sgn(dx) : 0
        let ay = abs(dy) > 1.2 ? sgn(dy) : 0
        inp.lx = ax; inp.ly = ay
        if (sq.at ?? 0) > 22 { path = nil; seq = nil }
        return inp
    }

    func alignThen(_ sim: Sim, _ sq: Seq, _ inp: inout Input, _ d: (Double, Double)) {
        guard let t = sq.tile else { inp.lx = d.0; inp.ly = d.1; return }
        let cx = Double(t.0 * TS) + TSD / 2, cy = Double(t.1 * TS) + TSD / 2
        if d.0 != 0 {
            let dy = cy - sim.hero.y
            if abs(dy) > 1.2 { inp.ly = sgn(dy) } else { inp.lx = d.0 }
        } else {
            let dx = cx - sim.hero.x
            if abs(dx) > 1.2 { inp.lx = sgn(dx) } else { inp.ly = d.1 }
        }
    }

    func arrive(_ sim: Sim, _ pd: Pending?) {
        guard let pd else { return }
        switch pd.kind {
        case "chest", "unlock":
            let t = pd.kind == "chest" ? pd.m! : pd.tile!
            let dx = Double(t.0 * TS) + TSD / 2 - sim.hero.x, dy = Double(t.1 * TS) + TSD / 2 - sim.hero.y
            let s = Seq("face", sim.screen)
            s.fx = abs(dx) >= abs(dy) ? sgn(dx) : 0
            s.fy = abs(dy) > abs(dx) ? sgn(dy) : 0
            seq = s
        case "crack": seq = Seq("bomb", sim.screen)
        case "warp": seq = nil
        case "edge": let s = Seq("edge", sim.screen); s.edgeDir = pd.dir; s.tile = pd.tile; seq = s
        case "enter": let s = Seq("enter", sim.screen); s.dirN = pd.dirN; s.tile = pd.tile; seq = s
        case "switch": fireSetup(sim, pd.m!)
        default: break
        }
    }

    func fireSetup(_ sim: Sim, _ m: T2) {
        let s = World.screens[sim.screen]!
        let faceUp = m.1 <= 1
        var sy = -1
        if m.1 + 1 < SH { for y in (m.1 + 1)..<SH { if tileAt(s, m.0, y) != 46 { break }; sy = y } }
        if sy < 0 { return }
        let q = Seq("aim", sim.screen); q.m = m; q.dirN = faceUp ? -1 : 1
        seq = q
    }

    func runSeq(_ sim: Sim, _ st: St, _ inp: inout Input) -> Input {
        let sq = seq!
        sq.t += 1
        switch sq.kind {
        case "walk": return walkTick(sim, &inp)
        case "face":
            inp.lx = sq.fx; inp.ly = sq.fy
            if sq.t > 3 { seq = Seq("tap", sq.screen) }
            return inp
        case "tap":
            if sq.t == 1 { inp.aPressed = true } else if sq.t == 2 { inp.aHeld = true } else if sq.t == 3 { inp.aReleased = true }
            if sq.t > 3 { seq = nil }
            return inp
        case "bomb":
            if sq.t == 2 { inp.bPressed = true }
            if sq.t > 95 { seq = nil }
            return inp
        case "edge":
            let d: (Double, Double) = sq.edgeDir == "n" ? (0, -1) : sq.edgeDir == "s" ? (0, 1) : sq.edgeDir == "w" ? (-1, 0) : (1, 0)
            alignThen(sim, sq, &inp, d)
            if sq.t > 80 { seq = nil }
            return inp
        case "enter":
            alignThen(sim, sq, &inp, (0, sq.dirN))
            if sq.t > 80 { seq = nil }
            return inp
        case "aim":
            let cx = Double(sq.m.0 * TS) + TSD / 2
            let dx = cx - sim.hero.x
            if abs(dx) > 1 { inp.lx = sgn(dx); inp.ly = sq.dirN * -1; return inp }
            if sq.t < 3 { inp.ly = sq.dirN; return inp }
            if sq.t == 3 { inp.aPressed = true }
            else if sq.t < 20 { inp.aHeld = true }
            else if sq.t == 20 { inp.aReleased = true; seq = nil }
            return inp
        case "push":
            guard let block = sim.blocks.first, let plate = World.screens[sim.screen]!.plates?.first else { seq = nil; return inp }
            if block.x == plate.x && block.y == plate.y { seq = nil; return inp }
            if pushQ == nil || pushQ!.isEmpty {
                pushQ = pushPlan(sim, block) ?? []
                if pushQ!.isEmpty { seq = nil; return inp }
                sq.ht = "\(jsFloor(sim.hero.x / TSD)),\(jsFloor(sim.hero.y / TSD))"
            }
            let (dx, dy) = pushQ![0]
            inp.lx = Double(dx); inp.ly = Double(dy)
            let ht = "\(jsFloor(sim.hero.x / TSD)),\(jsFloor(sim.hero.y / TSD))"
            if ht != sq.ht { pushQ!.removeFirst(); sq.ht = ht; sq.stall = 0; pushStall = 0 }
            else {
                sq.stall += 1
                if sq.stall > 28 {
                    sq.stall = 0
                    pushStall += 1
                    if pushStall > 12 { seq = nil; pushStall = 0 }
                    else { pushQ = pushPlan(sim, block) ?? pushQ }
                }
            }
            return inp
        default:
            seq = nil; return inp
        }
    }

    // MARK: bosses

    func bossTick(_ sim: Sim, _ inp: inout Input, _ id: String) -> Input {
        guard let e = sim.enemies.first(where: { (id == "boss1" ? $0.type == "maw" : id == "boss4" ? $0.type == "hawk" : $0.type == "wyrm") && !$0.dead }) else { return inp }
        let h = sim.hero
        let s = boss ?? BossState(sim.screen, e.seedOff % 2 != 0 ? 1 : -1)
        boss = s
        s.tt += 1
        let dx = e.x - h.x, dy = e.y - h.y
        let dist = jsHypot(dx, dy)
        let horiz = abs(dx) >= abs(dy)
        let px = horiz ? 0 : or1(sgn(dx), s.side)
        let py = horiz ? or1(sgn(dy), s.side) : 0

        if id == "boss1" {
            if e.open > 0 {
                if s.ph != "window" && s.ph != "bounce" { s.ph = "window"; s.tt = 0; s.strikes = 0 }
                if s.ph == "window" {
                    if dist > 24 { setMove(&inp, dx, dy); return inp }
                    cadenceTap(s, &inp, 8)
                    if dist < 28 && s.tap % 8 == 3 { s.strikes += 1 }
                    if s.strikes >= 2 { s.ph = "bounce"; s.tt = 0 }
                    return inp
                }
                if dist < 52 { moveAway(&inp, dx, dy); return inp }
            }
            if s.ph != "orbit" { s.ph = "orbit"; s.tt = 0; s.strikes = 0 }
            if dist < 40 { moveAway(&inp, dx, dy) }
            else if dist > 54 { setMove(&inp, dx, dy) }
            else { inp.lx = px; inp.ly = py }
            return inp
        }

        if id == "boss4" {
            if e.charging > 0 {
                if e.lockAxis == "x" { inp.ly = -or1(sgn(dy), s.side) } else { inp.lx = -or1(sgn(dx), s.side) }
                return inp
            }
            if e.rest > 0 && e.st <= 0 {
                if dist > 20 { setMove(&inp, dx, dy); return inp }
                cadenceTap(s, &inp, 8)
                return inp
            }
            if dist < 46 { moveAway(&inp, dx, dy) }
            return inp
        }

        if e.stagger > 0 {
            if s.ph != "rush" && s.ph != "pulse" { s.ph = "rush"; s.tt = 0 }
            if s.ph == "rush" {
                if dist > 22 { setMove(&inp, dx, dy); return inp }
                cadenceTap(s, &inp, 10)
                if s.tap % 10 == 3 { s.ph = "pulse"; s.tt = 0 }
                return inp
            }
            moveAway(&inp, dx, dy)
            if s.tt > 10 { s.ph = "rush"; s.tt = 0 }
            return inp
        }
        if e.open > 0 {
            if !["align", "face", "draw", "retreat"].contains(s.ph) { s.ph = "align"; s.tt = 0 }
            if s.ph == "align" {
                if dist > 70 { setMove(&inp, dx, dy); return inp }
                let minor = horiz ? dy : dx
                if abs(minor) > 8 { if horiz { inp.ly = sgn(minor) } else { inp.lx = sgn(minor) }; return inp }
                s.ph = "face"; s.tt = 0
                return inp
            }
            if s.ph == "face" {
                setMove(&inp, dx, dy)
                if s.tt > 1 { s.ph = "draw"; s.tt = 0 }
                return inp
            }
            if s.ph == "draw" {
                if s.tt == 1 { inp.aPressed = true }
                else if s.tt < 15 { inp.aHeld = true }
                else { inp.aReleased = true; s.ph = "retreat"; s.tt = 0 }
                return inp
            }
            moveAway(&inp, dx, dy)
            if s.tt > 14 { s.ph = "align"; s.tt = 0 }
            return inp
        }
        if dist < 48 { moveAway(&inp, dx, dy) }
        else if dist > 78 { setMove(&inp, dx, dy) }
        else { inp.lx = px; inp.ly = py }
        return inp
    }
}
