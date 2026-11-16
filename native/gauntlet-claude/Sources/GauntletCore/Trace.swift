// The Gauntlet flatten + recording fold for retrogames-trace/v1, and the
// planner races; the codec itself (TV, q, writeTrace, compare, the recording
// reader) is RetroKit's.
//
// flatten() mirrors flattenState() over the whole game object, the way the
// gauntlet adapter in scripts/goldentrace.mjs hands it over: dotted paths,
// numbers as Math.round(v * 1000), empty arrays as [], `events`/`levelData`
// excluded, `_`-keys skipped, Sets/Maps contributing nothing, and each
// explored Uint8Array as indexed fields.
// A key JS has not added yet is simply absent; decoders read absent as null.

import Foundation
import RetroKit


public func flatten(_ g: Game) -> [String: TV] {
    var o: [String: TV] = [:]
    o["seed"] = q(g.seed); o["heroKey"] = .str(g.heroKey); o["partnerKey"] = s(g.partnerKey)
    o["slack"] = .bool(g.slack); o["partnerOn"] = .bool(g.partnerOn); o["topDown"] = .bool(g.topDown)
    o["partnerHuman"] = .bool(g.partnerHuman); o["levelCount"] = q(g.levelCount)
    if let m = g.partnerMode { o["partnerMode"] = .str(m) }
    o["rng"] = q(Int(g.rng)); o["tick"] = q(g.tick); o["playT"] = q(g.playT); o["level"] = q(g.level)
    o["lives"] = q(g.lives); o["score"] = q(g.score); o["gold"] = q(g.gold); o["keys"] = q(g.keys)
    o["end"] = s(g.end); o["upTo"] = q(g.upTo)
    o["deathSpawned"] = .bool(g.deathSpawned); o["foodWarnT"] = q(g.foodWarnT); o["deaths"] = q(g.deaths)
    if let ov = g.heroHpOverride { o["heroHpOverride"] = ov.map { q($0) } ?? .null }
    if let pd = g.partnerDone { o["partnerDone"] = .bool(pd) }
    let h = g.hero!
    o["hero.x"] = q(h.x); o["hero.y"] = q(h.y); o["hero.a"] = q(h.a); o["hero.hp"] = q(h.hp); o["hero.maxHp"] = q(h.maxHp)
    o["hero.speed"] = q(h.speed); o["hero.power"] = q(h.power); o["hero.arrowRange"] = q(h.arrowRange)
    o["hero.name"] = .str(h.name); o["hero.who"] = .str(h.who)
    o["hero.deadT"] = q(h.deadT); o["hero.atkT"] = q(h.atkT); o["hero.atkAnim"] = q(h.atkAnim); o["hero.arrowT"] = q(h.arrowT)
    o["hero.swingId"] = q(h.swingId); o["hero.walk"] = q(h.walk); o["hero.hitT"] = q(h.hitT); o["hero.stunT"] = q(h.stunT)
    if let p = g.partner {
        o["partner.x"] = q(p.x); o["partner.y"] = q(p.y); o["partner.a"] = q(p.a); o["partner.hp"] = q(p.hp); o["partner.maxHp"] = q(p.maxHp)
        o["partner.speed"] = q(p.speed); o["partner.power"] = q(p.power); o["partner.name"] = .str(p.name)
        o["partner.atkT"] = q(p.atkT); o["partner.down"] = .bool(p.down)
        if let st = p.stunT { o["partner.stunT"] = q(st) }
    } else { o["partner"] = .null }
    if g.monsters.isEmpty { o["monsters"] = .emptyArray }
    for (i, m) in g.monsters.enumerated() {
        let k = "monsters.\(i)."
        o[k + "id"] = q(m.id); o[k + "kind"] = .str(m.kind); o[k + "x"] = q(m.x); o[k + "y"] = q(m.y); o[k + "hp"] = q(m.hp)
        o[k + "atkT"] = q(m.atkT); o[k + "castT"] = q(m.castT); o[k + "repathT"] = q(m.repathT); o[k + "drainT"] = q(m.drainT)
        if m.path.isEmpty { o[k + "path"] = .emptyArray }
        for (j, p) in m.path.enumerated() { o[k + "path.\(j).0"] = q(p.0); o[k + "path.\(j).1"] = q(p.1) }
    }
    if g.shots.isEmpty { o["shots"] = .emptyArray }
    for (i, x) in g.shots.enumerated() {
        let k = "shots.\(i)."
        o[k + "id"] = q(x.id); o[k + "mine"] = .bool(x.mine); o[k + "kind"] = .str(x.kind); o[k + "x"] = q(x.x); o[k + "y"] = q(x.y)
        o[k + "dx"] = q(x.dx); o[k + "dy"] = q(x.dy); o[k + "dist"] = q(x.dist); o[k + "range"] = q(x.range); o[k + "dmg"] = q(x.dmg)
        if let w = x.overWalls { o[k + "overWalls"] = .bool(w) }
        if let d = x.done { o[k + "done"] = .bool(d) }
    }
    if g.items.isEmpty { o["items"] = .emptyArray }
    for (i, it) in g.items.enumerated() {
        let k = "items.\(i)."
        o[k + "id"] = q(it.id); o[k + "t"] = .str(it.t); o[k + "x"] = q(it.x); o[k + "y"] = q(it.y)
        if let t = it.taken { o[k + "taken"] = .bool(t) }
    }
    if g.gens.isEmpty { o["gens"] = .emptyArray }
    for (i, x) in g.gens.enumerated() {
        let k = "gens.\(i)."
        o[k + "id"] = q(x.id); o[k + "x"] = q(x.x); o[k + "y"] = q(x.y); o[k + "hp"] = q(x.hp); o[k + "alive"] = .bool(x.alive)
        o[k + "t"] = q(x.t); o[k + "charge"] = q(x.charge)
    }
    if g.doors.isEmpty { o["doors"] = .emptyArray }
    for (i, d) in g.doors.enumerated() {
        let k = "doors.\(i)."
        o[k + "x"] = q(d.x); o[k + "y"] = q(d.y); o[k + "locked"] = .bool(d.locked); o[k + "open"] = .bool(d.open)
        o[k + "broken"] = .bool(d.broken); o[k + "closeT"] = q(d.closeT)
        if let hh = d.hits { o[k + "hits"] = q(hh) }
    }
    if g.trapCells.isEmpty { o["trapCells"] = .emptyArray }
    for (i, c) in g.trapCells.enumerated() { o["trapCells.\(i).0"] = q(c.0); o["trapCells.\(i).1"] = q(c.1) }
    for (l, m) in g.explored.enumerated() { for (j, v) in m.enumerated() { o["explored.\(l).\(j)"] = q(Int(v)) } }
    return o
}

// MARK: - recordings + the pad lane (plaicraft-export makeReplayDriver)

public struct PadRec { public var up = false, down = false, left = false, right = false, a = false, b = false; public var ax = 0.0, ay = 0.0; public init() {} }

/// heroFromPad: buttons are levels; aim from the ax/ay lane
public func heroFromPad(_ p: PadRec) -> Input {
    var i = Input(left: p.left, right: p.right, fwd: p.up, back: p.down, sword: p.a, arrow: p.b)
    if p.ax != 0 || p.ay != 0 { i.aim = jsAtan2(p.ay, p.ax) }
    return i
}
/// p2FromPad: seat 2's cpu lane
public func p2FromPad(_ p: PadRec) -> Input { Input(left: p.left, right: p.right, fwd: p.up, back: p.down, sword: p.a) }

/// plaicraft-export newGame: warrior + (elf partner when seat 2 is held), overhead, partnerMode cpu
public func newGame(_ seed: Int, partner: Bool, hero: String = "warrior", partnerKey: String = "elf") -> Game {
    let g = Game(seed: seed, hero: hero, partner: partner, partnerKey: partnerKey, topDown: true)
    g.partnerOn = partner
    g.partnerMode = "cpu"
    return g
}

// Read by RetroKit's RecordingFile (JSONDecoder: correctly rounded, so a
// recorded aim is the very double the web stepped with); |ax|,|ay| clamp to 1.
public struct Recording {
    public let game: String, seed: Int, players: Int, ticks: Int
    public let slots: [[PadRec]]
    public let seat2: Bool
    public let hashes: [(t: Int, h: String)]
    public init(data: Data) throws {
        let r = try RecordingFile(data: data)
        game = r.game; seed = r.seed; players = r.players; ticks = r.ticks
        seat2 = r.slots.count > 1 ? (r.slots[1].source ?? "off") != "off" : false
        func clamp(_ x: Double) -> Double { abs(x) > 1 ? (x > 0 ? 1 : -1) : x }
        slots = r.slots.map { s in
            s.pads.map { m in
                var p = PadRec()
                p.up = m.up; p.down = m.down; p.left = m.left; p.right = m.right
                p.a = m.a; p.b = m.b; p.ax = clamp(m.ax); p.ay = clamp(m.ay)
                return p
            }
        }
        hashes = r.hashes
    }
}

/// Replay pad-only, exactly the goldentrace gauntlet adapter: the flattened state after every tick.
public func replay(_ rec: Recording) -> (states: [[String: TV]], hashMismatch: Int?) {
    let g = newGame(rec.seed, partner: rec.players > 1)
    var states: [[String: TV]] = []
    let want = Dictionary(rec.hashes.map { ($0.t, $0.h) }, uniquingKeysWith: { a, _ in a })
    var mismatch: Int? = nil
    for t in 0..<rec.ticks {
        let p1 = rec.slots.count > 0 && t < rec.slots[0].count ? rec.slots[0][t] : PadRec()
        let p2 = rec.slots.count > 1 && t < rec.slots[1].count ? rec.slots[1][t] : PadRec()
        g.step(heroFromPad(p1), p2FromPad(p2))
        g.events.removeAll()
        var f = flatten(g)
        let h = g.stateHash()
        f["hash"] = .str(h)
        states.append(f)
        if mismatch == nil, let w = want[t + 1], w != h { mismatch = t + 1 }
    }
    return (states, mismatch)
}

/// retrogames-trace/v1 for a replayed recording (`fx` excluded)
public func writeTrace(states: [[String: TV]], game: String, seed: Int, ticks: Int, recName: String) -> String {
    writeTrace(states: states, game: game, seed: seed, players: 1, ticks: ticks, excludes: ["fx"], recName: recName)
}

// MARK: - planner race (check.sh): the Swift pilot + partner seat against planner.js

public func padsEqual(_ a: PadRec, _ b: PadRec) -> Bool {
    a.up == b.up && a.down == b.down && a.left == b.left && a.right == b.right && a.a == b.a && a.b == b.b && a.ax == b.ax && a.ay == b.ay
}
public func showPad(_ p: PadRec) -> String {
    var s: [String] = []
    if p.up { s.append("up") }; if p.down { s.append("down") }; if p.left { s.append("left") }; if p.right { s.append("right") }
    if p.a { s.append("a") }; if p.b { s.append("b") }
    if p.ax != 0 || p.ay != 0 { s.append("ax:\(p.ax) ay:\(p.ay)") }
    return "{" + s.joined(separator: ",") + "}"
}

/// Replay the recording; every tick ask the Swift pilot (and partner seat) first,
/// compare with what the web said (bot.json), then step with the recorded pads.
public func plannerRace(_ rec: Recording, botJSON: Data) throws -> String? {
    struct P: Decodable { var up, down, left, right, a, b: Bool?; var ax, ay: Double? }
    let said = try JSONDecoder().decode([[P]].self, from: botJSON)
    func pr(_ p: P) -> PadRec { var r = PadRec(); r.up = p.up ?? false; r.down = p.down ?? false; r.left = p.left ?? false; r.right = p.right ?? false; r.a = p.a ?? false; r.b = p.b ?? false; r.ax = p.ax ?? 0; r.ay = p.ay ?? 0; return r }
    let g = newGame(rec.seed, partner: rec.players > 1)
    var prevA = false
    for t in 0..<rec.ticks {
        let mine = toPad(g.decide())
        if !padsEqual(mine, pr(said[t][0])) { return "tick \(t + 1) hall \(g.level + 1): pilot planner.js \(showPad(pr(said[t][0]))) swift \(showPad(mine))" }
        if rec.players > 1 {
            let mp = g.partnerPad(prevA: prevA)
            prevA = mp.a
            if !padsEqual(mp, pr(said[t][1])) { return "tick \(t + 1) hall \(g.level + 1): partner planner.js \(showPad(pr(said[t][1]))) swift \(showPad(mp))" }
        }
        let p1 = t < rec.slots[0].count ? rec.slots[0][t] : PadRec()
        let p2 = rec.slots.count > 1 && t < rec.slots[1].count ? rec.slots[1][t] : PadRec()
        g.step(heroFromPad(p1), p2FromPad(p2))
        g.events.removeAll()
    }
    return nil
}

/// On-device planner race: a planner-driven golden's pads ARE planner.js's
/// answers (no fuzz), so the recording itself is the expected output.
public func plannerRaceOwnPads(_ rec: Recording) -> String? {
    let g = newGame(rec.seed, partner: rec.players > 1)
    var prevA = false
    for t in 0..<rec.ticks {
        let p1 = t < rec.slots[0].count ? rec.slots[0][t] : PadRec()
        let p2 = rec.slots.count > 1 && t < rec.slots[1].count ? rec.slots[1][t] : PadRec()
        let mine = toPad(g.decide())
        if !padsEqual(mine, p1) { return "TICK \(t + 1) PILOT WEB \(showPad(p1)) SWIFT \(showPad(mine))" }
        if rec.players > 1 {
            let mp = g.partnerPad(prevA: prevA)
            prevA = mp.a
            if !padsEqual(mp, p2) { return "TICK \(t + 1) PARTNER WEB \(showPad(p2)) SWIFT \(showPad(mp))" }
        }
        g.step(heroFromPad(p1), p2FromPad(p2))
        g.events.removeAll()
    }
    return nil
}
