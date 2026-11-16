// retrogames-trace/v1 for the Swift ports (spec: scripts/lib/trace.mjs): the
// value type, the quantizers, the trace writer and the golden-trace compare.
// Each port keeps its own flatten() — that is where the game's object graph
// lives — and builds it from q()/s()/TV:
//   dotted paths, numbers as Math.round(v * 1000), empty arrays as [],
//   a key JS has not added yet left absent (decoders read absent as null).

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

/// a number field: Math.round(v * 1000); non-finite → null
@inlinable @inline(__always) public func q(_ v: Double) -> TV { v.isFinite ? .num(Int64(jsRound(v * 1000))) : .null }
/// an integer field (exact, no rounding needed)
@inlinable @inline(__always) public func q(_ v: Int) -> TV { .num(Int64(v) * 1000) }
/// a string-or-null field
@inlinable @inline(__always) public func s(_ v: String?) -> TV { v.map(TV.str) ?? .null }

public enum TraceError: Error, CustomStringConvertible {
    case bad(String)
    public var description: String { if case let .bad(s) = self { return s }; return "trace error" }
}

// MARK: - writer

/// A retrogames-trace/v1 file from per-tick flattened states (fields sorted the
/// way JS's default sort does: by UTF-16 code units; rows carry only changes).
public func writeTrace(states: [[String: TV]], game: String, seed: Int, players: Int, ticks: Int, excludes: [String], recName: String) -> String {
    var keys = Set<String>()
    for st in states { keys.formUnion(st.keys) }
    let fields = keys.sorted { Array($0.utf16).lexicographicallyPrecedes(Array($1.utf16)) } // JS default sort
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
    let excl = "[" + excludes.map { TV.str($0).json }.joined(separator: ",") + "]"
    return "{\"format\":\"retrogames-trace/v1\",\"game\":\"\(game)\",\"rec\":\"\(recName)\",\"build\":\"swift-port\",\"seed\":\(seed),\"players\":\(players),\"ticks\":\(ticks),\"excludes\":\(excl),\"quant\":1000,\"fields\":\(fieldsJSON),\"consts\":{},\"rows\":[\(rows.joined(separator: ","))]}\n"
}

// MARK: - golden decoding
// Golden values are quantized integers, booleans and strings, so
// JSONSerialization's rounding never matters here (unlike recordings: Recording.swift).

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
    public let tick: Int, field: String, golden: TV, port: TV
    public init(tick: Int, field: String, golden: TV, port: TV) { self.tick = tick; self.field = field; self.golden = golden; self.port = port }
}

/// Compare port states against a golden trace. `fields` = the golden's field
/// count (fields + consts); divergence nil = every field of every tick matches
/// (a path missing on either side counts as null).
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
