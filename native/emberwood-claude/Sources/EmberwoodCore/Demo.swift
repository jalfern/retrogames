// The attract run. The web attract plays bot.js on createSim(11); bot.js lends
// the demo hero provisions every tick (attractBot's first lines) and returns a
// sim input. scripts/demo.mjs records those inputs; the app replays them as
// its attract + WATCH demo (lend, then step), and check.sh compares the
// replay against the web's own per-tick trace of the same run — a 7000-tick
// parity test through both dungeons and both act-one bosses.

import Foundation

public struct Demo {
    public let seed: UInt32
    public let inputs: [Input]
    let setup: [String: Any]?
    /// the web sim's hashState after every tick of this run (for the on-device check)
    public let hashes: [UInt32]
    /// bot.js's own output per tick (fuzz runs, where pads override it); for a
    /// plain attract run the inputs ARE the bot's output
    let botOut: [Input]?

    public init(data: Data) throws {
        guard let o = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              (o["format"] as? String) == "emberwood-demo/v1" else { throw TraceError.bad("not emberwood-demo/v1") }
        seed = (o["seed"] as? NSNumber)?.uint32Value ?? 11
        setup = o["setup"] as? [String: Any]
        hashes = (o["hashes"] as? [NSNumber] ?? []).map(\.uint32Value)
        inputs = Demo.decode(o["inputs"])
        botOut = o["bot"] == nil ? nil : Demo.decode(o["bot"])
    }

    static func decode(_ any: Any?) -> [Input] {
        (any as? [[String: Any]] ?? []).map { m in
            var i = Input()
            func b(_ k: String) -> Bool { (m[k] as? NSNumber)?.boolValue ?? false }
            i.lx = (m["lx"] as? NSNumber)?.doubleValue ?? 0
            i.ly = (m["ly"] as? NSNumber)?.doubleValue ?? 0
            i.aHeld = b("aHeld"); i.aPressed = b("aPressed"); i.aReleased = b("aReleased")
            i.bPressed = b("bPressed"); i.bHeld = b("bHeld"); i.bReleased = b("bReleased")
            i.cPressed = b("cPressed"); i.upPressed = b("upPressed"); i.downPressed = b("downPressed")
            return i
        }
    }

    static func same(_ a: Input, _ b: Input) -> Bool {
        a.lx == b.lx && a.ly == b.ly && a.aHeld == b.aHeld && a.aPressed == b.aPressed && a.aReleased == b.aReleased &&
            a.bPressed == b.bPressed && a.bHeld == b.bHeld && a.bReleased == b.bReleased && a.cPressed == b.cPressed
    }
    static func show(_ i: Input) -> String {
        var p: [String] = []
        if i.lx != 0 { p.append("lx:\(i.lx)") }; if i.ly != 0 { p.append("ly:\(i.ly)") }
        if i.aPressed { p.append("aPressed") }; if i.aHeld { p.append("aHeld") }; if i.aReleased { p.append("aReleased") }
        if i.bPressed { p.append("bPressed") }
        return "{" + p.joined(separator: ",") + "}"
    }

    /// The Swift bot against bot.js: replay the run, ask the Swift bot every
    /// tick (it lends, as attractBot does), compare with what bot.js said, then
    /// step with the recorded input. nil = identical on every tick.
    public func botRace() -> String? {
        guard setup == nil else { return nil }
        let want = botOut ?? inputs
        let sim = Sim(seed: seed), bot = Bot()
        for (t, inp) in inputs.enumerated() {
            let mine = bot.tick(sim)
            if !Demo.same(mine, want[t]) { return "tick \(t + 1) on \(sim.screen): bot.js \(Demo.show(want[t])) swift \(Demo.show(mine))" }
            sim.step(inp); sim.fx.removeAll()
        }
        return nil
    }

    /// attractBot's loan, applied before every attract tick.
    public var isBotRun: Bool { setup == nil }

    public static func lend(_ sim: Sim) {
        sim.items.bow = true
        sim.items.blade = true
        sim.items.bombs = max(sim.items.bombs, 3)
        sim.items.arrows = max(sim.items.arrows, 12)
        sim.items.keys = max(sim.items.keys, 5)
        sim.hero.max = max(sim.hero.max, 4)
        sim.hero.hp = max(sim.hero.hp, 4)
    }

    /// The fuzz's room+kit start (scripts/demo.mjs --setup), applied in the same order.
    func apply(_ st: [String: Any], _ sim: Sim) {
        for (k, v) in st["items"] as? [String: Any] ?? [:] {
            let b = (v as? NSNumber)?.boolValue ?? false, n = (v as? NSNumber)?.intValue ?? 0
            switch k {
            case "bow": sim.items.bow = b; case "blade": sim.items.blade = b; case "shield": sim.items.shield = b
            case "gale": sim.items.gale = b; case "step": sim.items.step = b; case "bigkey": sim.items.bigkey = b
            case "bombs": sim.items.bombs = n; case "arrows": sim.items.arrows = n; case "potions": sim.items.potions = n; case "keys": sim.items.keys = n
            default: break
            }
        }
        if let sc = (st["score"] as? NSNumber)?.intValue, sc != 0 { sim.score = sc }
        let fl = st["flags"] as? [String: Any] ?? [:]
        for (k, v) in fl where k != "ventsOff" {
            let b = (v as? NSNumber)?.boolValue ?? false
            switch k {
            case "emberTaken": sim.flags.emberTaken = b; case "boss1": sim.flags.boss1 = b; case "boss2": sim.flags.boss2 = b
            case "boss3": sim.flags.boss3 = b; case "boss4": sim.flags.boss4 = b; case "dawnheart": sim.flags.dawnheart = b
            default: break
            }
        }
        for (k, _) in fl["ventsOff"] as? [String: Any] ?? [:] { sim.flags.ventsOff[k] = true }
        let entry = (st["entry"] as? [NSNumber])?.map(\.intValue)
        sim.spawnRoom(st["screen"] as! String, entry)
    }

    /// Replay hashing only (cheap enough for the device): first tick whose
    /// hash differs from the web's, or nil.
    public func hashCheck() -> Int? {
        let sim = Sim(seed: seed)
        if let setup { apply(setup, sim) }
        for (t, inp) in inputs.enumerated() {
            Demo.lend(sim); sim.step(inp); sim.fx.removeAll()
            if t < hashes.count, sim.hashState() != hashes[t] { return t + 1 }
        }
        return hashes.count == inputs.count ? nil : -1
    }

    public func replay() -> (states: [[String: TV]], sim: Sim) {
        let sim = Sim(seed: seed)
        if let setup { apply(setup, sim) }
        var states: [[String: TV]] = []
        for inp in inputs {
            Demo.lend(sim)
            sim.step(inp)
            sim.fx.removeAll()
            var f = flatten(sim)
            f["hash"] = .num(Int64(sim.hashState()))
            states.append(f)
        }
        return (states, sim)
    }
}
