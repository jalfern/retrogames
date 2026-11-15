// retrogames-trace/v1 for the Swift port (spec: scripts/lib/trace.mjs).
//
// flatten() mirrors flattenState() over the Game object graph: dotted paths,
// numbers quantized with Math.round(v * 1000), empty arrays recorded as [],
// null objects as null, `events` excluded. A path that a JS object simply
// doesn't have (e.g. `segs.0.crumble` on a non-crumble ledge) is left out —
// the decoder treats a missing path as null on both sides.

import Foundation

public enum TV: Equatable, CustomStringConvertible {
    case null
    case num(Int64)
    case bool(Bool)
    case str(String)
    case emptyArray

    public var description: String { json }
    public var json: String {
        switch self {
        case .null: return "null"
        case let .num(n): return String(n)
        case let .bool(b): return b ? "true" : "false"
        case let .str(s): return "\"" + s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
        case .emptyArray: return "[]"
        }
    }
}

public let QUANT = 1000.0

@inline(__always) func q(_ v: Double) -> TV { v.isFinite ? .num(Int64(jsRound(v * QUANT))) : .null }
@inline(__always) func q(_ v: Int) -> TV { .num(Int64(v) * 1000) }

public func flatten(_ gs: Game) -> [String: TV] {
    var out: [String: TV] = [:]
    func rider(_ r: Rider?, _ p: String) {
        guard let r else { out[p] = .null; return }
        out[p + ".x"] = q(r.x); out[p + ".y"] = q(r.y)
        out[p + ".vx"] = q(r.vx); out[p + ".vy"] = q(r.vy); out[p + ".a"] = q(r.a)
        out[p + ".onGround"] = .bool(r.onGround)
        out[p + ".state"] = .str(r.state)
        out[p + ".deadT"] = q(r.deadT); out[p + ".invuln"] = q(r.invuln); out[p + ".flapT"] = q(r.flapT)
        out[p + ".kind"] = r.kind.map(TV.str) ?? .null
        out[p + ".sitT"] = q(r.sitT); out[p + ".delay"] = q(r.delay)
        out[p + ".entryVY"] = q(r.entryVY)
    }
    out["tick"] = q(gs.tick)
    out["wave"] = q(gs.wave)
    out["end"] = gs.end.map(TV.str) ?? .null
    out["phase"] = .str(gs.phase)
    out["phaseT"] = q(gs.phaseT)
    if let pd = gs.pending { out["pending.reason"] = .str(pd.reason); out["pending.t"] = q(pd.t) } else { out["pending"] = .null }
    out["total"] = q(gs.total)
    out["nextLife"] = q(gs.nextLife)
    if gs.players.isEmpty { out["players"] = .emptyArray }
    for (i, p) in gs.players.enumerated() {
        let k = "players.\(i)"
        out[k + ".id"] = q(p.id); out[k + ".score"] = q(p.score); out[k + ".lives"] = q(p.lives)
        out[k + ".out"] = .bool(p.out)
        rider(p.rider, k + ".rider")
        if let (x, y) = p.respawn { out[k + ".respawn.0"] = q(x); out[k + ".respawn.1"] = q(y) } else { out[k + ".respawn"] = .null }
    }
    if gs.riders.isEmpty { out["riders"] = .emptyArray }
    for (i, r) in gs.riders.enumerated() { rider(r, "riders.\(i)") }
    if gs.eggs.isEmpty { out["eggs"] = .emptyArray }
    for (i, e) in gs.eggs.enumerated() {
        let k = "eggs.\(i)"
        out[k + ".kind"] = .str(e.kind); out[k + ".x"] = q(e.x); out[k + ".y"] = q(e.y)
        out[k + ".fall"] = q(e.fall); out[k + ".rest"] = .bool(e.rest); out[k + ".timer"] = q(e.timer)
        out[k + ".got"] = .bool(e.got)
    }
    if gs.hands.isEmpty { out["hands"] = .emptyArray }
    for (i, h) in gs.hands.enumerated() {
        let k = "hands.\(i)"
        out[k + ".x"] = q(h.x); out[k + ".period"] = q(h.period); out[k + ".phase"] = q(h.phase)
        out[k + ".outY"] = q(h.outY); out[k + ".y"] = q(h.y); out[k + ".out"] = .bool(h.out)
    }
    out["eggDrops"] = q(gs.eggDrops); out["eggsGot"] = q(gs.eggsGot)
    out["deaths"] = q(gs.deaths); out["killsThisWave"] = q(gs.killsThisWave)
    out["players2"] = q(gs.players2)
    if gs.segs.isEmpty { out["segs"] = .emptyArray }
    for (i, s) in gs.segs.enumerated() {
        let k = "segs.\(i)"
        out[k + ".x0"] = q(s.x0); out[k + ".x1"] = q(s.x1); out[k + ".y"] = q(s.y)
        out[k + ".kind"] = .str(s.kind)
        if let c = s.crumble { out[k + ".crumble"] = .bool(c) }
        out[k + ".rideT"] = q(s.rideT); out[k + ".gone"] = .bool(s.gone)
    }
    return out
}

// ------------------------------------------------------------ recordings ----

public struct Recording {
    public let game: String
    public let seed: Int
    public let players: Int
    public let ticks: Int
    public let pads: [[[String: Bool]]] // [slot][tick] -> pad
    public let hashes: [(t: Int, h: UInt32)]

    public init(data: Data) throws {
        guard let o = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw TraceError.bad("recording is not an object") }
        guard (o["format"] as? String) == "retrogames-rec/v1" else { throw TraceError.bad("not retrogames-rec/v1") }
        game = o["game"] as? String ?? ""
        seed = (o["seed"] as? NSNumber)?.intValue ?? 0
        players = (o["players"] as? NSNumber)?.intValue ?? 1
        ticks = (o["ticks"] as? NSNumber)?.intValue ?? 0
        let slots = o["slots"] as? [[String: Any]] ?? []
        pads = slots.map { s in
            (s["pads"] as? [[String: Any]] ?? []).map { p in p.compactMapValues { ($0 as? NSNumber)?.boolValue } }
        }
        hashes = (o["hashes"] as? [[String: Any]] ?? []).map { ((($0["t"] as? NSNumber)?.intValue ?? 0), (($0["h"] as? NSNumber)?.uint32Value ?? 0)) }
    }

    /// The pad -> sim fold, same as scripts/goldentrace.mjs's joust adapter.
    public func input(at t: Int, players2: Int) -> Input {
        let p1 = pads.count > 0 && t < pads[0].count ? pads[0][t] : [:]
        var inp = Input(l: p1["left"] ?? false, r: p1["right"] ?? false, f: p1["a"] ?? false)
        if pads.count > 1 && t < pads[1].count {
            let p2 = pads[1][t]
            inp.l2 = p2["left"] ?? false; inp.r2 = p2["right"] ?? false; inp.f2 = p2["a"] ?? false
        }
        _ = players2
        return inp
    }
}

public enum TraceError: Error, CustomStringConvertible {
    case bad(String)
    public var description: String { if case let .bad(s) = self { return s }; return "trace error" }
}

/// Replay a recording pad-only; returns the flattened state after every tick.
public func replay(_ rec: Recording) -> (states: [[String: TV]], hashMismatch: Int?) {
    let gs = Game(players: rec.players)
    var states: [[String: TV]] = []
    states.reserveCapacity(rec.ticks)
    let want = Dictionary(rec.hashes.map { ($0.t, $0.h) }, uniquingKeysWith: { a, _ in a })
    var mismatch: Int? = nil
    for t in 0..<rec.ticks {
        gs.step(rec.input(at: t, players2: gs.players2))
        gs.events.removeAll() // the shell drains it every tick; never state
        var flat = flatten(gs)
        let h = gs.stateHash()
        flat["hash"] = .num(Int64(h))
        states.append(flat)
        if mismatch == nil, let w = want[t + 1], w != h { mismatch = t + 1 }
    }
    return (states, mismatch)
}

// ---------------------------------------------------------- trace writer ----

public func writeTrace(states: [[String: TV]], rec: Recording, recName: String) -> String {
    var keys = Set<String>()
    for s in states { keys.formUnion(s.keys) }
    let fields = keys.sorted()
    let idx = Dictionary(uniqueKeysWithValues: fields.enumerated().map { ($1, $0) })
    var prev: [String: TV] = [:]
    var rows: [String] = []
    rows.reserveCapacity(states.count)
    for m in states {
        var d: [String] = []
        for k in fields {
            let v = m[k] ?? .null
            if v != (prev[k] ?? .null) { d.append("\(idx[k]!),\(v.json)"); prev[k] = v }
        }
        rows.append("[" + d.joined(separator: ",") + "]")
    }
    let fieldsJSON = "[" + fields.map { TV.str($0).json }.joined(separator: ",") + "]"
    return """
    {"format":"retrogames-trace/v1","game":"\(rec.game)","rec":"\(recName)","build":"swift-port","seed":\(rec.seed),"players":\(rec.players),"ticks":\(rec.ticks),"excludes":["events"],"quant":1000,"fields":\(fieldsJSON),"consts":{},"rows":[\(rows.joined(separator: ","))]}

    """
}

// ------------------------------------------------- golden trace decoding ----

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

public struct Divergence {
    public let tick: Int
    public let field: String
    public let golden: TV
    public let port: TV
}

/// Compare port states against a golden trace; nil = every field of every tick matches.
public func compare(golden data: Data, port: [[String: TV]]) throws -> (ticks: Int, divergence: Divergence?) {
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
        while i + 1 < row.count {
            let fi = (row[i] as? NSNumber)?.intValue ?? 0
            cur[fields[fi]] = tv(row[i + 1])
            i += 2
        }
        let mine = port[t]
        let keys = Set(cur.keys).union(mine.keys).sorted()
        for k in keys {
            let g = cur[k] ?? .null
            let p = mine[k] ?? .null
            if g != p { return (rows.count, Divergence(tick: t + 1, field: k, golden: g, port: p)) }
        }
    }
    return (rows.count, nil)
}
