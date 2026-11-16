// gauntlet-trace — replay retrogames-rec/v1 Gauntlet recordings through the
// Swift sim and check them against the web game's golden traces.
//
//   gauntlet-trace check [traces-dir]      every gauntlet-*.json pair (default ../../public/traces)
//   gauntlet-trace trace <rec.json> <out.trace.json>

import Foundation
import GauntletCore

func load(_ p: String) throws -> Data { try Data(contentsOf: URL(fileURLWithPath: p)) }

let args = Array(CommandLine.arguments.dropFirst())
switch args.first {
case "trace":
    guard args.count >= 3 else { print("usage: gauntlet-trace trace <rec.json> <out.trace.json>"); exit(2) }
    let rec = try Recording(data: load(args[1]))
    let (states, mm) = replay(rec)
    try writeTrace(states: states, game: rec.game, seed: rec.seed, ticks: rec.ticks, recName: URL(fileURLWithPath: args[1]).lastPathComponent)
        .replacingOccurrences(of: "\"players\":1", with: "\"players\":\(rec.players)")
        .write(toFile: args[2], atomically: true, encoding: .utf8)
    print("wrote \(args[2]) (\(rec.ticks) ticks)\(mm.map { "; recorded hash first differs at tick \($0)" } ?? "; every recorded hash matches")")
case "race": // race <rec.json> <trace.json>
    let rec = try Recording(data: load(args[1]))
    let (states, mm) = replay(rec)
    let (ticks, fields, d) = try compare(golden: load(args[2]), port: states)
    if let d { print("DIVERGE race: first at tick \(d.tick) of \(ticks), field \"\(d.field)\": golden=\(d.golden) port=\(d.port)"); exit(1) }
    if let mm { print("DIVERGE race: recorded hash differs at tick \(mm)"); exit(1) }
    print("MATCH   race: \(ticks)/\(ticks) ticks, all \(fields) fields every tick")
    if args.count >= 4 {
        if let d = try plannerRace(rec, botJSON: load(args[3])) { print("DIVERGE planner: \(d)"); exit(1) }
        print("MATCH   planner: pilot\(rec.players > 1 ? " + partner seat" : "") said what planner.js said on all \(rec.ticks) ticks")
    }
case "math": // math <rows.bin> <tofixed.json>: V8's trig and toFixed, bit for bit
    let d = try load(args[1])
    let a = d.withUnsafeBytes { Array($0.bindMemory(to: Double.self)) }
    var bad = 0
    for i in stride(from: 0, to: a.count, by: 6) {
        if jsSin(a[i]).bitPattern != a[i + 1].bitPattern || jsCos(a[i]).bitPattern != a[i + 2].bitPattern || jsAtan2(a[i + 3], a[i + 4]).bitPattern != a[i + 5].bitPattern { bad += 1 }
    }
    struct TF: Decodable { let v: Double; let s: [String]; init(from dd: Decoder) throws { var c = try dd.unkeyedContainer(); v = try c.decode(Double.self); s = [try c.decode(String.self), try c.decode(String.self), try c.decode(String.self)] } }
    let tf = try JSONDecoder().decode([TF].self, from: load(args[2]))
    var badF = 0
    for t in tf { for f in 1...3 where jsToFixed(t.v, f) != t.s[f - 1] { badF += 1 } }
    print((bad + badF == 0 ? "MATCH   " : "DIVERGE ") + "math: sin/cos/atan2 on \(a.count / 6) inputs (\(bad) differ), toFixed on \(tf.count * 3) (\(badF) differ)")
    exit(bad + badF == 0 ? 0 : 1)
case "parts": // parts <rec.json> <tick>: the hash input string after that tick
    let rec = try Recording(data: load(args[1]))
    let g = newGame(rec.seed, partner: rec.players > 1)
    for t in 0..<(Int(args[2]) ?? 1) {
        let p1 = t < rec.slots[0].count ? rec.slots[0][t] : PadRec()
        let p2 = rec.slots.count > 1 && t < rec.slots[1].count ? rec.slots[1][t] : PadRec()
        g.step(heroFromPad(p1), p2FromPad(p2))
    }
    print(g.hashInput())
case "check", nil:
    let dir = args.count >= 2 ? args[1] : "../../public/traces"
    let names = try FileManager.default.contentsOfDirectory(atPath: dir)
        .filter { $0.hasPrefix("gauntlet-") && $0.hasSuffix(".json") && !$0.hasSuffix(".trace.json") }.sorted()
    if names.isEmpty { print("no gauntlet recordings in \(dir)"); exit(2) }
    var ok = true
    for n in names {
        let rec = try Recording(data: load("\(dir)/\(n)"))
        let (states, mm) = replay(rec)
        let (ticks, fields, d) = try compare(golden: load("\(dir)/\(n.replacingOccurrences(of: ".json", with: ".trace.json"))"), port: states)
        if let d { ok = false; print("DIVERGE \(n): first at tick \(d.tick) of \(ticks), field \"\(d.field)\": golden=\(d.golden) port=\(d.port)" + (mm.map { " (recorded hash first differs at \($0))" } ?? "")) }
        else if let mm { ok = false; print("DIVERGE \(n): fields match but recorded hash differs at tick \(mm)") }
        else { print("MATCH   \(n): \(ticks)/\(ticks) ticks, all \(fields) fields every tick") }
    }
    exit(ok ? 0 : 1)
default:
    print("usage: gauntlet-trace check [dir] | trace <rec> <out>"); exit(2)
}
