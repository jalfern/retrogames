// emberwood-trace — replay retrogames-rec/v1 Emberwood recordings through the
// Swift sim and check them against the web game's golden traces.
//
//   emberwood-trace check [traces-dir]           every emberwood-*.json pair (default ../../public/traces)
//   emberwood-trace trace <rec.json> <out.trace.json>
//   emberwood-trace demo <demo.json> <golden.trace.json>   the attract run (lend + inputs) vs the web's trace

import Foundation
import EmberwoodCore
import RetroKit

func load(_ p: String) throws -> Data { try Data(contentsOf: URL(fileURLWithPath: p)) }

func report(_ name: String, _ states: [[String: TV]], _ golden: Data, _ mm: Int?) throws -> Bool {
    let (ticks, fields, d) = try compare(golden: golden, port: states)
    if let d {
        print("DIVERGE \(name): first at tick \(d.tick) of \(ticks), field \"\(d.field)\": golden=\(d.golden) port=\(d.port)" + (mm.map { " (recorded hash first differs at \($0))" } ?? ""))
        return false
    }
    if let mm { print("DIVERGE \(name): fields match but recorded hash differs at tick \(mm)"); return false }
    print("MATCH   \(name): \(ticks)/\(ticks) ticks, all \(fields) fields every tick")
    return true
}

let args = Array(CommandLine.arguments.dropFirst())
switch args.first {
case "trace":
    guard args.count >= 3 else { print("usage: emberwood-trace trace <rec.json> <out.trace.json>"); exit(2) }
    let rec = try Recording(data: load(args[1]))
    let (states, mm) = replay(rec)
    let name = URL(fileURLWithPath: args[1]).lastPathComponent
    try writeTrace(states: states, game: rec.game, seed: rec.seed, ticks: rec.ticks, recName: name).write(toFile: args[2], atomically: true, encoding: .utf8)
    print("wrote \(args[2]) (\(rec.ticks) ticks)\(mm.map { "; recorded hash first differs at tick \($0)" } ?? "; every recorded hash matches")")
case "demo":
    guard args.count >= 3 else { print("usage: emberwood-trace demo <demo.json> <golden.trace.json>"); exit(2) }
    let demo = try Demo(data: load(args[1]))
    let (states, _) = demo.replay()
    var ok = try report(URL(fileURLWithPath: args[1]).lastPathComponent, states, load(args[2]), nil)
    if demo.isBotRun {
        if let d = demo.botRace() { print("DIVERGE bot: \(d)"); ok = false }
        else { print("MATCH   bot: the Swift bot said what bot.js said on all \(demo.inputs.count) ticks") }
    }
    exit(ok ? 0 : 1)
case "check", nil:
    let dir = args.count >= 2 ? args[1] : "../../public/traces"
    let names = try FileManager.default.contentsOfDirectory(atPath: dir)
        .filter { $0.hasPrefix("emberwood-") && $0.hasSuffix(".json") && !$0.hasSuffix(".trace.json") }.sorted()
    if names.isEmpty { print("no emberwood recordings in \(dir)"); exit(2) }
    var ok = true
    for n in names {
        let rec = try Recording(data: load("\(dir)/\(n)"))
        let (states, mm) = replay(rec)
        ok = try report(n, states, load("\(dir)/\(n.replacingOccurrences(of: ".json", with: ".trace.json"))"), mm) && ok
    }
    exit(ok ? 0 : 1)
default:
    print("usage: emberwood-trace check [dir] | trace <rec> <out> | demo <demo.json> <golden.trace.json>")
    exit(2)
}
