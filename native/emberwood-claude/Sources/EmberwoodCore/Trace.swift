// The Emberwood flatten + recording fold for retrogames-trace/v1; the codec
// itself (TV, q, writeTrace, compare, the recording reader) is RetroKit's.
//
// flatten() mirrors flattenState() over the whole sim object, the way the
// emberwood adapter in scripts/goldentrace.mjs hands it over: dotted paths,
// numbers as Math.round(v * 1000), empty arrays as [], `fx` excluded, `rng`
// (a function) and `_`-keys skipped, empty objects contributing nothing.
// A key JS has not added yet is simply absent; decoders read absent as null.

import Foundation
import RetroKit

public func flatten(_ sim: Sim) -> [String: TV] {
    var o: [String: TV] = [:]
    o["tick"] = q(sim.tick); o["seed"] = q(Int(sim.seed)); o["screen"] = .str(sim.screen)
    let h = sim.hero
    o["hero.x"] = q(h.x); o["hero.y"] = q(h.y); o["hero.dir"] = .str(h.dir.rawValue)
    o["hero.hp"] = q(h.hp); o["hero.max"] = q(h.max); o["hero.inv"] = q(h.inv); o["hero.hurt"] = q(h.hurt)
    let it = sim.items
    o["items.sword"] = .bool(it.sword); o["items.bow"] = .bool(it.bow); o["items.shield"] = .bool(it.shield)
    o["items.blade"] = .bool(it.blade); o["items.gale"] = .bool(it.gale); o["items.step"] = .bool(it.step)
    o["items.bombs"] = q(it.bombs); o["items.arrows"] = q(it.arrows); o["items.potions"] = q(it.potions)
    o["items.keys"] = q(it.keys); o["items.bigkey"] = .bool(it.bigkey)
    o["score"] = q(sim.score)
    o["swing"] = q(sim.swing); o["swingDir"] = .str(sim.swingDir.rawValue); o["swingId"] = q(sim.swingId)
    o["cool"] = q(sim.cool); o["holdT"] = q(sim.holdT); o["drawing"] = .bool(sim.drawing)
    o["arc"] = q(sim.arc); o["arcDir"] = .str(sim.arcDir.rawValue); o["arcId"] = q(sim.arcId)
    o["bombCool"] = q(sim.bombCool); o["bHoldT"] = q(sim.bHoldT); o["pendingB"] = q(sim.pendingB)
    o["galeCool"] = q(sim.galeCool); o["galing"] = .bool(sim.galing); o["hitStop"] = q(sim.hitStop)
    o["shop.open"] = .bool(sim.shop.open); o["shop.sel"] = q(sim.shop.sel); o["shop.id"] = s(sim.shop.id)
    o["paused"] = .bool(sim.paused)
    o["death"] = .bool(sim.death); o["deathT"] = q(sim.deathT); o["win"] = .bool(sim.win)

    if sim.enemies.isEmpty { o["enemies"] = .emptyArray }
    for (i, e) in sim.enemies.enumerated() {
        let k = "enemies.\(i)."
        o[k + "type"] = .str(e.type)
        if let ii = e.i { o[k + "i"] = q(ii) }
        o[k + "drop"] = s(e.drop); o[k + "boss"] = q(e.boss)
        o[k + "x"] = q(e.x); o[k + "y"] = q(e.y)
        o[k + "hp"] = q(e.hp); o[k + "w"] = q(e.w); o[k + "h"] = q(e.h); o[k + "dmg"] = q(e.dmg)
        o[k + "t"] = q(e.t); o[k + "st"] = q(e.st); o[k + "vx"] = q(e.vx); o[k + "vy"] = q(e.vy)
        o[k + "hitT"] = q(e.hitT); o[k + "open"] = q(e.open); o[k + "stagger"] = q(e.stagger); o[k + "hidden"] = .bool(e.hidden)
        o[k + "charging"] = q(e.charging); o[k + "rest"] = q(e.rest); o[k + "chx"] = q(e.chx); o[k + "chy"] = q(e.chy); o[k + "gen"] = q(e.gen)
        o[k + "mantle"] = q(e.mantle); o[k + "summoned"] = q(e.summoned)
        if e.perch.isEmpty { o[k + "perch"] = .emptyArray }
        for (j, p) in e.perch.enumerated() { o[k + "perch.\(j).0"] = q(p.0); o[k + "perch.\(j).1"] = q(p.1) }
        o[k + "roost"] = q(e.roost)
        o[k + "fx"] = q(e.fx); o[k + "fy"] = q(e.fy); o[k + "seedOff"] = q(e.seedOff); o[k + "dead"] = .bool(e.dead)
        if e.seg.isEmpty { o[k + "seg"] = .emptyArray }
        for (j, p) in e.seg.enumerated() { o[k + "seg.\(j).x"] = q(p.0); o[k + "seg.\(j).y"] = q(p.1) }
        if let v = e.hitSwing { o[k + "hitSwing"] = q(v) }
        if let v = e.roostSet { o[k + "roostSet"] = q(v) }
        if let v = e.lockAxis { o[k + "lockAxis"] = .str(v) }
        if let v = e.dirSign { o[k + "dirSign"] = q(v) }
    }
    if sim.projectiles.isEmpty { o["projectiles"] = .emptyArray }
    for (i, p) in sim.projectiles.enumerated() {
        let k = "projectiles.\(i)."
        o[k + "kind"] = .str(p.kind); o[k + "x"] = q(p.x); o[k + "y"] = q(p.y); o[k + "vx"] = q(p.vx); o[k + "vy"] = q(p.vy)
        if let l = p.life { o[k + "life"] = q(l) }
    }
    if sim.bombs.isEmpty { o["bombs"] = .emptyArray }
    for (i, b) in sim.bombs.enumerated() { let k = "bombs.\(i)."; o[k + "x"] = q(b.x); o[k + "y"] = q(b.y); o[k + "fuse"] = q(b.fuse) }
    if sim.drops.isEmpty { o["drops"] = .emptyArray }
    for (i, d) in sim.drops.enumerated() { let k = "drops.\(i)."; o[k + "kind"] = .str(d.kind); o[k + "x"] = q(d.x); o[k + "y"] = q(d.y); o[k + "t"] = q(d.t) }
    if sim.blocks.isEmpty { o["blocks"] = .emptyArray }
    for (i, b) in sim.blocks.enumerated() { let k = "blocks.\(i)."; o[k + "id"] = .str(b.id); o[k + "x"] = q(b.x); o[k + "y"] = q(b.y); o[k + "cool"] = q(b.cool) }
    o["msg"] = s(sim.msg); o["msgT"] = q(sim.msgT)
    for (k, v) in sim.cut { o["cut.\(k)"] = .bool(v) }
    let f = sim.flags
    for (name, m) in [("cracked", f.cracked), ("doorsOpen", f.doorsOpen), ("switchesOn", f.switchesOn), ("chestsOpen", f.chestsOpen), ("ventsOff", f.ventsOff), ("killed", f.killed)] {
        for (k, v) in m { o["flags.\(name).\(k)"] = .bool(v) }
    }
    o["flags.boss1"] = .bool(f.boss1); o["flags.boss2"] = .bool(f.boss2); o["flags.boss3"] = .bool(f.boss3); o["flags.boss4"] = .bool(f.boss4)
    o["flags.emberTaken"] = .bool(f.emberTaken); o["flags.dawnheart"] = .bool(f.dawnheart)
    if let g = f.elderGifted { o["flags.elderGifted"] = .bool(g) }
    o["roomName"] = .str(sim.roomName); o["nameT"] = q(sim.nameT)
    for (k, e) in sim.lastDungeonEntry { o["lastDungeonEntry.\(k).screen"] = .str(e.screen); o["lastDungeonEntry.\(k).x"] = q(e.x); o["lastDungeonEntry.\(k).y"] = q(e.y) }
    if sim.npcs.isEmpty { o["npcs"] = .emptyArray }
    for (i, n) in sim.npcs.enumerated() {
        let k = "npcs.\(i)."
        o[k + "id"] = .str(n.id); o[k + "kind"] = .str(n.kind); o[k + "requires"] = s(n.requires)
        if let m = n.msg { o[k + "msg"] = .str(m) }
        o[k + "x"] = q(n.x); o[k + "y"] = q(n.y); o[k + "wx"] = q(n.wx); o[k + "wy"] = q(n.wy)
        for (j, p) in n.path.enumerated() { o[k + "path.\(j).0"] = q(p.0); o[k + "path.\(j).1"] = q(p.1) }
        o[k + "wi"] = q(n.wi); o[k + "dwell"] = q(n.dwell); o[k + "moving"] = .bool(n.moving)
    }
    if let m = sim.moving { o["moving"] = .bool(m) }
    if let vc = sim.ventCool { for (k, v) in vc { o["ventCool.\(k)"] = q(v) } }
    return o
}

// MARK: - recordings

public struct Recording {
    public let game: String, seed: Int, players: Int, ticks: Int
    public let pads: [Pad]
    public let hashes: [(t: Int, h: UInt32)]

    public init(data: Data) throws {
        let f = try RecordingFile(data: data)
        game = f.game; seed = f.seed; players = f.players; ticks = f.ticks
        pads = (f.slots.first?.pads ?? []).map { Pad(up: $0.up, down: $0.down, left: $0.left, right: $0.right, a: $0.a, b: $0.b) }
        hashes = f.hashes.map { ($0.t, UInt32($0.h) ?? 0) }
    }
}

/// Replay a recording pad-only (the goldentrace emberwood adapter: padToInput
/// with fresh edge memory, then stepSim); the flattened state after every tick.
public func replay(_ rec: Recording) -> (states: [[String: TV]], hashMismatch: Int?) {
    let sim = Sim(seed: UInt32(truncatingIfNeeded: rec.seed))
    var prev = PadPrev()
    var states: [[String: TV]] = []
    states.reserveCapacity(rec.ticks)
    let want = Dictionary(rec.hashes.map { ($0.t, $0.h) }, uniquingKeysWith: { a, _ in a })
    var mismatch: Int? = nil
    for t in 0..<rec.ticks {
        sim.step(padToInput(t < rec.pads.count ? rec.pads[t] : Pad(), &prev))
        var flat = flatten(sim)
        let h = sim.hashState()
        flat["hash"] = .num(Int64(h))
        states.append(flat)
        if mismatch == nil, let w = want[t + 1], w != h { mismatch = t + 1 }
    }
    return (states, mismatch)
}

/// retrogames-trace/v1 for a replayed recording (`fx` excluded)
public func writeTrace(states: [[String: TV]], game: String, seed: Int, ticks: Int, recName: String) -> String {
    writeTrace(states: states, game: game, seed: seed, players: 1, ticks: ticks, excludes: ["fx"], recName: recName)
}
