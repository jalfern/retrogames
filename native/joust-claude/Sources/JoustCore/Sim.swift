// THE SIM — a line-for-line Swift port of src/games/Joust/sim.js.
//
// The web game is the spec: every branch, every operand order and every
// integer/double distinction below mirrors sim.js so the same pad stream
// produces the same state, tick for tick (checked against the golden traces
// in public/traces by `swift run joust-trace check`). Don't "tidy" the
// arithmetic: (a + b) * c and a + b * c round differently, and the traces
// will say so.

import Foundation
import RetroKit

public let W = 256.0
public let H = 224.0
public let FIXED_DT = 1000.0 / 60.0

public enum CFG {
    public static let life = 3
    public static let gravity = 0.045
    public static let thrust = 0.112
    public static let thrustX = 0.85
    public static let dragX = 0.994
    public static let maxVX = 2.3
    public static let maxFall = 2.0
    public static let maxRise = -2.6
    public static let upright = 0.018
    public static let rotFast = 0.052
    public static let rotSlow = 0.026
    public static let tiltIdle = 0.87
    public static let safeTilt = 0.52
    public static let joustTol = 3.0
    public static let foot = 10.0
    public static let rx = 11.0
    public static let ry = 13.0
    public static let deadT = 90
    public static let invuln = 120
    public static let banner = 100
    public static let eggV = 1.8
    public static let eggHatch = 240
    public static let handRise = 70
    public static let handHold = 50
    public static let handDown = 70
    public static let crumbleT = 100
    public static func score(_ kind: String?) -> Int {
        switch kind {
        case "bounder": return 200
        case "hunter": return 400
        case "shadow": return 800
        default: return 0
        }
    }
    public static let scoreEgg = 100
    public static let scoreTerrain = 50
    public static let perfectBonus = 1000
    public static let waveBonus = 500
    public static let oneUpEvery = 10000
}

@inline(__always) func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
    v < lo ? lo : (v > hi ? hi : v)
}

// ------------------------------------------------------------------ state ----

public final class Rider {
    public var x: Double, y: Double, vx = 0.0, vy = 0.0, a = 0.0
    public var onGround = false
    public var state: String
    public var deadT = 0, invuln = 0, flapT = 0
    public var kind: String? = nil
    public var sitT = 0, delay = 0
    public var entryVY = 0.0
    init(x: Double, y: Double, isPlayer: Bool) {
        self.x = x; self.y = y
        state = isPlayer ? "alive" : "enter"
        invuln = isPlayer ? CFG.invuln : 0
    }
}

public final class Player {
    public let id: Int
    public var score = 0, lives = CFG.life
    public var out = false
    public var rider: Rider? = nil
    public var respawn: (Double, Double)? = nil
    init(id: Int) { self.id = id }
}

public final class Egg {
    public var kind: String
    public var x: Double, y: Double, fall: Double
    public var rest = false
    public var timer = CFG.eggHatch
    public var got = false
    init(kind: String, x: Double, y: Double, fall: Double) { self.kind = kind; self.x = x; self.y = y; self.fall = fall }
}

public final class Hand {
    public let x: Double, period: Int, phase: Int, outY: Double
    public var y: Double, out = false
    init(_ d: HandDef) { x = d.x; period = d.period; phase = d.phase; outY = d.outY; y = LAVA_TOP + 6 }
}

public final class Seg {
    public let x0: Double, x1: Double, y: Double, kind: String, crumble: Bool?
    public var rideT = 0, gone = false
    init(_ d: SegDef) { x0 = d.x0; x1 = d.x1; y = d.y; kind = d.kind; crumble = d.crumble }
}

public struct Pending {
    public var reason: String
    public var t: Int
    public init(reason: String, t: Int) { self.reason = reason; self.t = t }
}

/// gs.events — the shell-drained side channel (excluded from traces).
public struct GameEvent {
    public var t: String
    public var x = 0.0, y = 0.0
    public var kind: String? = nil
    public var cause: String? = nil
    public var pts = 0
    public var by = 0
    public var wave = 0
    public var name: String? = nil
    public var bonus = 0
    public var perfect = false
}

public struct Input {
    public var l = false, r = false, f = false
    public var l2 = false, r2 = false, f2 = false
    public init(l: Bool = false, r: Bool = false, f: Bool = false, l2: Bool = false, r2: Bool = false, f2: Bool = false) {
        self.l = l; self.r = r; self.f = f; self.l2 = l2; self.r2 = r2; self.f2 = f2
    }
}

public final class Game {
    public var tick = 0, wave = 0
    public var end: String? = nil
    public var phase = "banner"
    public var phaseT = CFG.banner
    public var pending: Pending? = nil
    public var events: [GameEvent] = []
    public var total = 0
    public var nextLife = CFG.oneUpEvery
    public var players: [Player] = []
    public var riders: [Rider] = []
    public var eggs: [Egg] = []
    public var hands: [Hand] = []
    public var segs: [Seg] = []
    public var eggDrops = 0, eggsGot = 0, deaths = 0, killsThisWave = 0
    public let players2: Int

    public init(players n: Int = 1) {
        players2 = n == 2 ? 2 : 1
        for i in 0..<players2 { players.append(Player(id: i)) }
        startWave(0)
    }

    // ------------------------------------------------------------ waves ----
    func startWave(_ w: Int) {
        let def = WAVES[w]
        wave = w
        segs = def.segs.map(Seg.init)
        hands = def.hands.map(Hand.init)
        riders = []
        eggs = []
        eggDrops = 0; eggsGot = 0; deaths = 0; killsThisWave = 0
        for r in def.roster {
            riders.append(spawn(r.kind, r.x, -14, 0.55, false, r.delay))
        }
        for (i, p) in players.enumerated() {
            let s = i < def.spawns.count ? def.spawns[i] : def.spawns[0]
            p.respawn = s
            if !p.out { p.rider = Rider(x: s.0, y: s.1, isPlayer: true) }
        }
        phase = "banner"
        phaseT = CFG.banner
        events.append(GameEvent(t: "wave", wave: w, name: def.name))
    }

    func spawn(_ kind: String, _ x: Double, _ y: Double, _ vy: Double, _ hunting: Bool, _ delay: Int) -> Rider {
        let r = Rider(x: x, y: y, isPlayer: false)
        r.kind = kind
        r.entryVY = vy
        r.state = delay > 0 ? "wait" : "enter"
        r.delay = delay
        if hunting { r.state = "hunt" }
        return r
    }

    public func groundTopAt(_ x: Double) -> Seg? {
        let xi = clamp(x, 0, W - 1)
        var best: Seg? = nil
        for s in segs {
            if s.gone { continue }
            if xi >= s.x0 && xi < s.x1 {
                if best == nil || s.y < best!.y { best = s }
            }
        }
        return best
    }

    public func inPit(_ x: Double) -> Bool { groundTopAt(x) == nil }

    func advanceHand(_ h: Hand) {
        let p = (tick + h.phase) % h.period
        let top = LAVA_TOP + 6
        if p < CFG.handRise {
            h.out = true
            let u = Double(p) / Double(CFG.handRise)
            h.y = top - (top - h.outY) * u
        } else if p < CFG.handRise + CFG.handHold {
            h.out = true
            h.y = h.outY
        } else if p < CFG.handRise + CFG.handHold + CFG.handDown {
            h.out = true
            let u = Double(p - CFG.handRise - CFG.handHold) / Double(CFG.handDown)
            h.y = h.outY + (top - h.outY) * u
        } else {
            h.out = false
            h.y = top
        }
    }

    public func targetOf() -> Rider? {
        for p in players {
            if let r = p.rider, r.state == "alive" { return r }
        }
        return nil
    }

    // -------------------------------------------------------------- tick ----
    public func step(_ input: Input) {
        tick += 1
        for h in hands { advanceHand(h) }

        if pending != nil {
            pending!.t -= 1
            if pending!.t > 0 { return harvest() }
            let reason = pending!.reason
            pending = nil
            if reason == "dead" { end = "dead"; events.append(GameEvent(t: "over")); return harvest() }
            if reason == "win" { end = "win"; events.append(GameEvent(t: "win")); return harvest() }
            if reason == "wave" {
                if wave + 1 >= WAVES.count { pending = Pending(reason: "win", t: 1); return harvest() }
                startWave(wave + 1)
                return harvest()
            }
            return harvest()
        }

        if phase == "banner" {
            phaseT -= 1
            if phaseT > 0 { return harvest() }
            phase = "play"
            events.append(GameEvent(t: "go"))
        }

        // ---- players ----
        let pin = [(input.l, input.r, input.f), (input.l2, input.r2, input.f2)]
        for p in players {
            guard let rd = p.rider else { continue }
            if rd.state == "dead" {
                rd.deadT -= 1
                if rd.deadT <= 0 {
                    if p.lives <= 0 { p.out = true; p.rider = nil; checkAllOut() }
                    else {
                        let (sx, sy) = p.respawn!
                        p.rider = Rider(x: sx, y: sy, isPlayer: true)
                    }
                }
                continue
            }
            flyPlayer(p, rd, pin[p.id])
        }

        // ---- enemy riders ----
        for e in riders {
            if e.state == "dead" { continue }
            if e.state == "wait" { e.delay -= 1; if e.delay <= 0 { e.state = "enter" }; continue }
            if e.state == "enter" {
                e.y += e.entryVY
                if e.y >= 40 { e.state = "hunt" }
                e.x = wrapX(e.x)
                continue
            }
            let d = decide(e)
            switch d {
            case .sit:
                e.vx = 0
                e.sitT -= 1
                if e.sitT <= 0 {
                    let p = targetOf()
                    e.vy = -1.5
                    e.vx = p != nil ? clamp(wrapDelta(p!.x - e.x) * 0.05, -0.7, 0.7) : 0
                    e.onGround = false
                }
            case let .fly(ax, ay, maxVX, maxVY):
                e.vx = clamp((e.vx + ax) * CFG.dragX, -maxVX, maxVX)
                e.vy = clamp(e.vy + ay, CFG.maxRise, maxVY)
            case let .seek(ax, ay, maxV):
                e.vx = clamp((e.vx + ax) * CFG.dragX, -maxV, maxV)
                e.vy = clamp((e.vy + ay) * CFG.dragX, -maxV, maxV)
                if let g = groundTopAt(e.x), e.vy > 0, e.y + CFG.ry > g.y - 4 { e.vy = min(e.vy, 0.1) }
            case .drift, .hover:
                break
            }
            e.x = wrapX(e.x + e.vx)
            e.y += e.vy

            if e.kind == "bounder" && !e.onGround && e.vy >= 0 {
                if let g = groundTopAt(e.x), e.y + CFG.ry >= g.y && e.y + CFG.ry - e.vy < g.y + 1 {
                    e.y = g.y - CFG.ry
                    e.vy = 0
                    e.onGround = true
                    e.sitT = 40
                }
            } else if e.onGround {
                let g = groundTopAt(e.x)
                if g == nil || e.y + CFG.ry < g!.y - 1 { e.onGround = false }
            }

            if (inPit(e.x) && e.y + CFG.foot >= LAVA_TOP) || e.y > H + 16 {
                killRider(e, "terrain", nil)
            }
        }

        // ---- eggs ----
        for egg in eggs {
            egg.fall = min(egg.fall + 0.05, CFG.eggV)
            egg.y += egg.fall
            egg.x = wrapX(egg.x)
            if egg.fall >= CFG.eggV - 1e-9 {
                if let g = groundTopAt(egg.x), egg.y + 6 >= g.y {
                    egg.y = g.y - 6
                    egg.fall = 0
                    egg.rest = true
                }
            }
            if egg.rest {
                egg.timer -= 1
                if egg.timer <= 0 {
                    egg.got = true
                    if let nk = nextEggKind(egg.kind) {
                        let r = spawn(nk, egg.x, egg.y - 18, 0.55, true, 0)
                        riders.append(r)
                        events.append(GameEvent(t: "hatch", x: egg.x, y: egg.y - 18, kind: nk))
                    }
                }
            }
            if egg.y > H + 12 { egg.got = true }
            if !egg.got {
                for pl in players {
                    guard let p = pl.rider, p.state == "alive" else { continue }
                    if abs(wrapDelta(p.x - egg.x)) < 12 && abs(p.y - egg.y) < 14 {
                        egg.got = true
                        eggsGot += 1
                        pl.score += CFG.scoreEgg
                        bumpLife(pl)
                        events.append(GameEvent(t: "eggget", x: egg.x, y: egg.y, by: pl.id))
                        break
                    }
                }
            }
        }
        eggs = eggs.filter { !$0.got }

        // ---- joust rule: the LOWER rider loses ----
        for p in players {
            guard let rd = p.rider, rd.state == "alive" else { continue }
            for e in riders {
                if e.state == "dead" || e.state == "wait" || e.state == "enter" { continue }
                if abs(wrapDelta(rd.x - e.x)) > CFG.rx + CFG.rx { continue }
                if abs(rd.y - e.y) > CFG.ry + CFG.ry { continue }
                let diff = rd.y - e.y
                if rd.invuln > 0 { continue }
                if diff < -CFG.joustTol {
                    killRider(e, "joust", p)
                    rd.vy = min(rd.vy, -0.9)
                    rd.onGround = false
                    events.append(GameEvent(t: "joustwin", x: e.x, y: e.y, kind: e.kind, by: p.id))
                } else if diff > CFG.joustTol {
                    hurtPlayer(p, e.kind ?? "")
                } else {
                    killRider(e, "mutual", p)
                    hurtPlayer(p, "mutual")
                }
            }
        }

        // ---- hands and lava ----
        for p in players {
            guard let rd = p.rider, rd.state == "alive", rd.invuln <= 0 else { continue }
            for h in hands {
                if h.out && abs(wrapDelta(rd.x - h.x)) < 9 && rd.y > h.y { hurtPlayer(p, "hand"); break }
            }
            if rd.state == "alive" && rd.y + CFG.foot >= LAVA_TOP && inPit(rd.x) { hurtPlayer(p, "lava") }
        }

        // ---- wave end ----
        if pending == nil && phase == "play" {
            let foes = riders.contains { $0.state != "dead" }
            let pendingEgg = eggs.contains { $0.rest }
            if !foes && !pendingEgg {
                var bonus = CFG.waveBonus * (wave + 1)
                let perfect = eggsGot == eggDrops && deaths == 0 && eggDrops > 0
                if perfect { bonus += CFG.perfectBonus }
                var lead = players[0]
                for b in players where b.score > lead.score { lead = b }
                lead.score += bonus
                events.append(GameEvent(t: "clear", wave: wave, bonus: bonus, perfect: perfect))
                pending = Pending(reason: "wave", t: 80)
            }
        }

        total = players.reduce(0) { $0 + $1.score }
        harvest()
    }

    func flyPlayer(_ p: Player, _ rd: Rider, _ inp: (Bool, Bool, Bool)) {
        if rd.invuln > 0 { rd.invuln -= 1 }
        let (l, r, flap) = inp
        let rate = flap ? CFG.rotFast : CFG.rotSlow
        if l { rd.a -= rate }
        else if r { rd.a += rate }
        else if abs(rd.a) <= CFG.upright { rd.a = 0 }
        else { rd.a -= (rd.a > 0 ? 1.0 : -1.0) * CFG.upright }
        if !flap { rd.a = clamp(rd.a, -CFG.tiltIdle, CFG.tiltIdle) }
        if rd.a > Double.pi { rd.a -= Double.pi * 2 }
        if rd.a < -Double.pi { rd.a += Double.pi * 2 }

        if flap && rd.onGround {
            rd.onGround = false
            rd.vy = -0.6
        }
        var ax = 0.0
        var ay = CFG.gravity
        if flap {
            ax += jsSin(rd.a) * CFG.thrust * CFG.thrustX
            ay -= jsCos(rd.a) * CFG.thrust
            rd.flapT += 1
        } else {
            ax += jsSin(rd.a) * CFG.gravity * 0.75
            rd.flapT = 0
        }
        rd.vx = clamp((rd.vx + ax) * CFG.dragX, -CFG.maxVX, CFG.maxVX)
        rd.vy = clamp(rd.vy + ay, CFG.maxRise, CFG.maxFall)
        rd.x = wrapX(rd.x + rd.vx)
        rd.y += rd.vy

        if rd.y < 12 { rd.y = 12; rd.vy = max(rd.vy, 0) }

        if rd.vy >= 0 {
            let feet = rd.y + CFG.foot
            var land: Seg? = nil
            for s in segs {
                if s.gone { continue }
                let xi = clamp(rd.x, 0, W - 1)
                if xi < s.x0 || xi >= s.x1 { continue }
                if feet < s.y || feet - s.y > 24 { continue }
                if rd.y > s.y + CFG.ry { continue }
                if land == nil || s.y < land!.y { land = s }
            }
            if let land {
                if abs(rd.a) > CFG.safeTilt {
                    hurtPlayer(p, "crash")
                } else {
                    rd.y = land.y - CFG.foot
                    rd.vy = 0
                    rd.onGround = true
                    rd.a = 0
                    if land.crumble == true {
                        land.rideT += 1
                        if land.rideT >= CFG.crumbleT {
                            land.gone = true
                            rd.onGround = false
                            events.append(GameEvent(t: "crumble", x: (land.x0 + land.x1) / 2, y: land.y))
                        }
                    }
                }
            } else if rd.onGround {
                rd.onGround = false
            }
        }
        if rd.y + CFG.foot >= LAVA_TOP && inPit(rd.x) { hurtPlayer(p, "lava") }
    }

    func killRider(_ e: Rider, _ cause: String, _ owner: Player?) {
        if e.state == "dead" { return }
        e.state = "dead"
        let pts = cause == "terrain" ? CFG.scoreTerrain : CFG.score(e.kind)
        let cred: Player?
        if cause == "terrain" {
            let t = targetOf()
            cred = players.first { $0.rider === t }
        } else {
            cred = owner
        }
        if let cred {
            cred.score += pts
            bumpLife(cred)
        }
        killsThisWave += 1
        events.append(GameEvent(t: "kill", x: e.x, y: e.y, kind: e.kind, cause: cause, pts: pts))
        if nextEggKind(e.kind) != nil && cause != "terrain" {
            eggDrops += 1
            eggs.append(Egg(kind: e.kind!, x: e.x, y: e.y + 6, fall: 0.6))
            events.append(GameEvent(t: "eggdrop", x: e.x, y: e.y + 6, kind: e.kind))
        }
    }

    func hurtPlayer(_ p: Player, _ cause: String) {
        guard let rd = p.rider, rd.state == "alive" else { return }
        rd.state = "dead"
        rd.deadT = CFG.deadT
        p.lives -= 1
        deaths += 1
        events.append(GameEvent(t: "death", x: rd.x, y: rd.y, cause: cause, by: p.id))
        if p.lives <= 0 { checkAllOut() }
    }

    func checkAllOut() {
        if pending != nil { return }
        if players.allSatisfy({ $0.out }) { pending = Pending(reason: "dead", t: 60) }
    }

    func bumpLife(_ p: Player) {
        while total >= nextLife {
            nextLife += CFG.oneUpEvery
            p.lives = min(5, p.lives + 1)
            events.append(GameEvent(t: "1up", by: p.id))
        }
    }

    func harvest() {
        if events.count > 300 { events.removeFirst(events.count - 300) }
    }

    // ------------------------------------------------------ behaviour ----
    enum Decision {
        case sit
        case drift
        case hover
        case fly(ax: Double, ay: Double, maxVX: Double, maxVY: Double)
        case seek(ax: Double, ay: Double, maxV: Double)
    }

    func decide(_ e: Rider) -> Decision {
        switch e.kind {
        case "bounder":
            if e.sitT > 0 { return .sit }
            guard let p = targetOf() else { return .drift }
            let dx = wrapDelta(p.x - e.x)
            return .fly(ax: clamp(dx * 0.0022, -0.012, 0.012), ay: 0.016, maxVX: 0.9, maxVY: 1.1)
        case "hunter":
            guard let p = targetOf() else { return .hover }
            let ax = clamp(wrapDelta(p.x - e.x) * 0.003, -0.03, 0.03)
            let ay = clamp((p.y - e.y) * 0.003, -0.03, 0.03)
            return .seek(ax: ax, ay: ay, maxV: 1.7)
        case "shadow":
            guard let p = targetOf() else { return .hover }
            let tx = p.x + p.vx * 12
            let ty = p.y + p.vy * 12
            let ax = clamp(wrapDelta(tx - e.x) * 0.005, -0.05, 0.05)
            let ay = clamp((ty - e.y) * 0.005, -0.05, 0.05)
            return .seek(ax: ax, ay: ay, maxV: 2.7)
        default:
            return .hover
        }
    }

    // ------------------------------------------------------------ hash ----
    public func stateHash() -> UInt32 {
        let rstate: [String: Double] = ["wait": 0, "enter": 1, "hunt": 2, "dead": 3]
        var nums: [Double] = [Double(tick), Double(wave), Double(total), phase == "play" ? 1 : 0, end != nil ? 1 : 0, Double(pending?.t ?? 0), Double(eggs.count)]
        for p in players {
            let r = p.rider
            nums.append(contentsOf: [
                Double(p.score), Double(p.lives), p.out ? 1 : 0,
                r != nil ? jsRound(r!.x * 8) : -1,
                r != nil ? jsRound(r!.y * 8) : -1,
                rstate[r?.state ?? "dead"] ?? 0,
                r != nil ? jsRound(r!.a * 100) : 0,
                Double(r?.invuln ?? 0),
            ])
        }
        for e in riders { nums.append(contentsOf: [rstate[e.state]!, jsRound(e.x * 8), jsRound(e.y * 8)]) }
        for egg in eggs { nums.append(contentsOf: [jsRound(egg.x * 8), jsRound(egg.y * 8), egg.rest ? Double(egg.timer) : -1]) }
        for h in hands { nums.append(contentsOf: [jsRound(h.y * 8), h.out ? 1 : 0]) }
        for s in segs { nums.append(contentsOf: [s.gone ? 1 : 0, Double(s.rideT)]) }
        var h = Int32(bitPattern: 2166136261)
        for n in nums {
            h ^= toInt32(jsRound(n * 1000))
            h = h &* 16777619
        }
        return UInt32(bitPattern: h)
    }
}

public func wrapDelta(_ d0: Double) -> Double {
    var d = d0
    if d > W / 2 { d -= W }
    if d < -W / 2 { d += W }
    return d
}

@inline(__always) func wrapX(_ x: Double) -> Double {
    if x < 0 { return x + W }
    if x >= W { return x - W }
    return x
}

public func nextEggKind(_ kind: String?) -> String? {
    kind == "bounder" ? "hunter" : (kind == "hunter" ? "shadow" : nil)
}
