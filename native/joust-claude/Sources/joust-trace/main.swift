// joust-trace — replay a retrogames-rec/v1 Joust recording through the Swift
// sim and check it against the web game's golden trace.
//
//   swift run joust-trace check [traces-dir]        # every joust-*.json pair (default ../../public/traces)
//   swift run joust-trace trace <rec.json> <out.trace.json>
//     then: node scripts/goldentrace.mjs diff public/traces/<name>.trace.json <out.trace.json>

import Foundation
import JoustCore

func load(_ p: String) throws -> Data { try Data(contentsOf: URL(fileURLWithPath: p)) }

let args = Array(CommandLine.arguments.dropFirst())
switch args.first {
case "trace":
    guard args.count >= 3 else { print("usage: joust-trace trace <rec.json> <out.trace.json>"); exit(2) }
    let rec = try Recording(data: load(args[1]))
    let (states, mm) = replay(rec)
    let name = URL(fileURLWithPath: args[1]).lastPathComponent
    try writeTrace(states: states, rec: rec, recName: name).write(toFile: args[2], atomically: true, encoding: .utf8)
    print("wrote \(args[2]) (\(rec.ticks) ticks)\(mm.map { "; recorded hash first differs at tick \($0)" } ?? "; every recorded hash matches")")
case "check", nil:
    let dir = args.count >= 2 ? args[1] : "../../public/traces"
    let names = try FileManager.default.contentsOfDirectory(atPath: dir)
        .filter { $0.hasPrefix("joust-") && $0.hasSuffix(".json") && !$0.hasSuffix(".trace.json") }.sorted()
    if names.isEmpty { print("no joust recordings in \(dir)"); exit(2) }
    var bad = 0
    for n in names {
        let rec = try Recording(data: load("\(dir)/\(n)"))
        let (states, mm) = replay(rec)
        let golden = "\(dir)/\(n.replacingOccurrences(of: ".json", with: ".trace.json"))"
        let (ticks, d) = try compare(golden: load(golden), port: states)
        let fields = states.last?.count ?? 0
        if let d {
            bad += 1
            print("DIVERGE \(n): first at tick \(d.tick) of \(ticks), field \"\(d.field)\": golden=\(d.golden) port=\(d.port)" + (mm.map { " (recorded hash first differs at \($0))" } ?? ""))
        } else {
            print("MATCH   \(n): \(ticks)/\(ticks) ticks, all \(fields) fields every tick" + (mm == nil ? ", all recorded hashes equal" : ", BUT recorded hash differs at \(mm!)"))
            if mm != nil { bad += 1 }
        }
    }
    exit(bad == 0 ? 0 : 1)
case "autopilot":
    // planner drives every seat; one "tick hash" line per tick until the game ends or N ticks
    let players = args.count > 1 ? Int(args[1]) ?? 1 : 1
    let n = args.count > 2 ? Int(args[2]) ?? 20000 : 20000
    let idle = args.count > 3 && args[3] == "idle" // no input at all: riders settle (and crumble ledges)
    let seed = args.count > 3 ? UInt32(args[3]) ?? 0 : 0
    let startWave = args.count > 4 ? Int(args[4]) ?? 0 : 0
    let gs = Game(players: players)
    while gs.wave < startWave { gs.pending = Pending(reason: "wave", t: 1); gs.step(Input()) } // the DEV menu's NEXT WAVE
    gs.events.removeAll()
    var out = ""
    var s = seed
    for _ in 0..<n where gs.end == nil {
        var inp = idle ? Input() : gs.plan()
        if seed != 0 { // fuzz: every 4th tick on average, random pads override the planner
            s = s &* 1103515245 &+ 12345
            if (s >> 16) % 4 == 0 {
                let b = s >> 8
                inp = Input(l: b & 1 != 0, r: b & 2 != 0, f: b & 4 != 0, l2: b & 8 != 0, r2: b & 16 != 0, f2: b & 32 != 0)
            }
        }
        gs.step(inp); gs.events.removeAll()
        out += "\(gs.tick) \(gs.stateHash())\n"
    }
    FileHandle.standardOutput.write(out.data(using: .utf8)!)
default:
    print("usage: joust-trace check [traces-dir] | trace <rec.json> <out.trace.json>")
    exit(2)
}
