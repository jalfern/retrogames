// retrogames-trace/v1 for the Swift port (spec: scripts/lib/trace.mjs).
//
// flatten() mirrors flattenState() over the whole game object, the way the
// gauntlet adapter in scripts/goldentrace.mjs hands it over: dotted paths,
// numbers as Math.round(v * 1000), empty arrays as [], `events`/`levelData`
// excluded, `_`-keys skipped, Sets/Maps contributing nothing, and each
// explored Uint8Array as indexed fields.
// A key JS has not added yet is simply absent; decoders read absent as null.

import Foundation

public enum TV: Equatable, CustomStringConvertible {
    case null, num(Int64), bool(Bool), str(String), emptyArray

    public var description: String { json }
    public var json: String {
        switch self {
        case .null: return "null"
        case let .num(n): return String(n)
        case let .bool(b): return b ? "true" : "false"
        case let .str(s):
            let d = try! JSONSerialization.data(withJSONObject: [s], options: [.withoutEscapingSlashes])
            return String(decoding: d.dropFirst().dropLast(), as: UTF8.self)
        case .emptyArray: return "[]"
        }
    }
}

@inline(__always) func q(_ v: Double) -> TV { v.isFinite ? .num(Int64(jsRound(v * 1000))) : .null }
@inline(__always) func q(_ v: Int) -> TV { .num(Int64(v) * 1000) }
@inline(__always) func s(_ v: String?) -> TV { v.map(TV.str) ?? .null }

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

// Decoded with JSONDecoder, NOT JSONSerialization: the aim lane carries
// 17-digit doubles (cos/sin of the planner's heading), and JSONSerialization
// is not correctly rounded (it reads 0.021500000000000002 as 0.0215).
// JSONDecoder is, so a recorded aim is the very double the web stepped with.
struct PadJSON: Decodable { var up, down, left, right, a, b: Bool?; var ax, ay: Double? }
struct SlotJSON: Decodable { struct Src: Decodable { var kind: String? }; var source: Src?; var pads: [PadJSON?] }
struct HashJSON: Decodable {
    var t: Int; var h: String
    enum K: String, CodingKey { case t, h }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        t = try c.decode(Int.self, forKey: .t)
        if let s = try? c.decode(String.self, forKey: .h) { h = s } else { h = String(try c.decode(Int64.self, forKey: .h)) }
    }
}
struct RecJSON: Decodable { var format: String; var game: String; var seed: Int; var players: Int; var ticks: Int; var slots: [SlotJSON]; var hashes: [HashJSON]? }

public struct Recording {
    public let game: String, seed: Int, players: Int, ticks: Int
    public let slots: [[PadRec]]
    public let seat2: Bool
    public let hashes: [(t: Int, h: String)]
    public init(data: Data) throws {
        let r = try JSONDecoder().decode(RecJSON.self, from: data)
        guard r.format == "retrogames-rec/v1" else { throw TraceError.bad("not retrogames-rec/v1") }
        game = r.game; seed = r.seed; players = r.players; ticks = r.ticks
        seat2 = r.slots.count > 1 ? (r.slots[1].source?.kind ?? "off") != "off" : false
        func clamp(_ v: Double?) -> Double { let x = v ?? 0; return abs(x) > 1 ? (x > 0 ? 1 : -1) : x }
        slots = r.slots.map { s in
            s.pads.map { m in
                var p = PadRec()
                p.up = m?.up ?? false; p.down = m?.down ?? false; p.left = m?.left ?? false; p.right = m?.right ?? false
                p.a = m?.a ?? false; p.b = m?.b ?? false; p.ax = clamp(m?.ax); p.ay = clamp(m?.ay)
                return p
            }
        }
        hashes = (r.hashes ?? []).map { ($0.t, $0.h) }
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

public enum TraceError: Error, CustomStringConvertible {
    case bad(String)
    public var description: String { if case let .bad(s) = self { return s }; return "trace error" }
}

public func writeTrace(states: [[String: TV]], game: String, seed: Int, ticks: Int, recName: String) -> String {
    var keys = Set<String>()
    for st in states { keys.formUnion(st.keys) }
    let fields = keys.sorted { Array($0.utf16).lexicographicallyPrecedes(Array($1.utf16)) } // JS default sort
    let idx = Dictionary(uniqueKeysWithValues: fields.enumerated().map { ($1, $0) })
    var prev: [String: TV] = [:]
    var rows: [String] = []
    for m in states {
        var d: [String] = []
        for k in fields {
            let v = m[k] ?? .null
            if v != (prev[k] ?? .null) { d.append("\(idx[k]!),\(v.json)"); prev[k] = v }
        }
        rows.append("[" + d.joined(separator: ",") + "]")
    }
    let fieldsJSON = "[" + fields.map { TV.str($0).json }.joined(separator: ",") + "]"
    return "{\"format\":\"retrogames-trace/v1\",\"game\":\"\(game)\",\"rec\":\"\(recName)\",\"build\":\"swift-port\",\"seed\":\(seed),\"players\":1,\"ticks\":\(ticks),\"excludes\":[\"fx\"],\"quant\":1000,\"fields\":\(fieldsJSON),\"consts\":{},\"rows\":[\(rows.joined(separator: ","))]}\n"
}

// MARK: - golden decoding

func tv(_ any: Any?) -> TV {
    guard let any, !(any is NSNull) else { return .null }
    if let n = any as? NSNumber {
        if CFGetTypeID(n) == CFBooleanGetTypeID() { return .bool(n.boolValue) }
        return .num(n.int64Value)
    }
    if let s = any as? String { return .str(s) }
    if let a = any as? [Any], a.isEmpty { return .emptyArray }
    return .null
}

public struct Divergence { public let tick: Int, field: String, golden: TV, port: TV }

/// Compare port states against a golden trace; divergence nil = every field of every tick matches.
public func compare(golden data: Data, port: [[String: TV]]) throws -> (ticks: Int, fields: Int, divergence: Divergence?) {
    guard let o = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          (o["format"] as? String) == "retrogames-trace/v1" else { throw TraceError.bad("not retrogames-trace/v1") }
    let fields = o["fields"] as? [String] ?? []
    let consts = (o["consts"] as? [String: Any] ?? [:]).mapValues(tv)
    let rows = o["rows"] as? [[Any]] ?? []
    guard rows.count == port.count else { throw TraceError.bad("tick count: golden \(rows.count), port \(port.count)") }
    var cur: [String: TV] = consts
    for f in fields { cur[f] = .null }
    for (t, row) in rows.enumerated() {
        var i = 0
        while i + 1 < row.count { cur[fields[(row[i] as? NSNumber)?.intValue ?? 0]] = tv(row[i + 1]); i += 2 }
        let mine = port[t]
        for k in Set(cur.keys).union(mine.keys).sorted() {
            let g = cur[k] ?? .null, p = mine[k] ?? .null
            if g != p { return (rows.count, fields.count + consts.count, Divergence(tick: t + 1, field: k, golden: g, port: p)) }
        }
    }
    return (rows.count, fields.count + consts.count, nil)
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
