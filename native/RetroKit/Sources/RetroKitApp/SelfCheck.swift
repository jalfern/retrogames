// `-selfcheck YES`: replay the bundled golden traces ON THE DEVICE and print
// MATCH/DIVERGE lines (log + stdout + the game's own screen) — parity on the
// real hardware. Each Xcode project bundles public/traces/<game>-*.json into
// <app>/traces with a build phase; the game supplies the replay.

import Foundation
import RetroKit

public enum SelfCheck {
    /// One golden's replay: the port's flattened state after every tick, the
    /// first recorded-hash mismatch (nil = all equal), and any extra lines the
    /// game wants printed after the golden's own line (e.g. a planner race).
    public struct Run {
        public var states: [[String: TV]], hashMismatch: Int?, extra: [String]
        public init(states: [[String: TV]], hashMismatch: Int?, extra: [String] = []) { self.states = states; self.hashMismatch = hashMismatch; self.extra = extra }
    }

    /// If launched with `-selfcheck YES`: show "SELF-CHECK RUNNING...", run
    /// `check` off the main thread, log every line as "<TAG> SELFCHECK <line>",
    /// then hand the lines to `show` on the main thread.
    public static func startIfAsked(tag: String, check: @escaping () -> [String], show: @escaping ([String]) -> Void) {
        guard UserDefaults.standard.bool(forKey: "selfcheck") else { return }
        show(["SELF-CHECK RUNNING..."])
        DispatchQueue.global(qos: .userInitiated).async {
            let lines = check()
            for l in lines { NSLog("\(tag) SELFCHECK %@", l); print("\(tag) SELFCHECK \(l)") }
            fflush(stdout)
            DispatchQueue.main.async { show(lines) }
        }
    }

    /// Every bundled recording in <app>/traces against its .trace.json.
    public static func goldens(_ replay: (_ name: String, _ recording: Data) throws -> Run) -> [String] {
        guard let dir = Bundle.main.resourceURL?.appendingPathComponent("traces"),
              let names = try? FileManager.default.contentsOfDirectory(atPath: dir.path) else { return ["NO BUNDLED TRACES"] }
        var out: [String] = []
        for n in names.filter({ !$0.hasSuffix(".trace.json") }).sorted() {
            do {
                let r = try replay(n, Data(contentsOf: dir.appendingPathComponent(n)))
                let g = try Data(contentsOf: dir.appendingPathComponent(n.replacingOccurrences(of: ".json", with: ".trace.json")))
                let (ticks, fields, d) = try compare(golden: g, port: r.states)
                if let d { out.append("DIVERGE \(n) TICK \(d.tick) \(d.field) GOLDEN \(d.golden) PORT \(d.port)") }
                else { out.append("MATCH \(n) \(ticks)/\(ticks) TICKS, \(fields) FIELDS" + (r.hashMismatch.map { " HASH DIFF \($0)" } ?? "")) }
                out += r.extra
            } catch { out.append("ERROR \(n) \(error)") }
        }
        return out
    }
}
