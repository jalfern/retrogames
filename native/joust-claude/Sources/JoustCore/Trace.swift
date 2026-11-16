// The Joust flatten + recording fold for retrogames-trace/v1; the codec
// itself (TV, q, writeTrace, compare, the recording reader) is RetroKit's.
//
// flatten() mirrors flattenState() over the Game object graph: dotted paths,
// numbers quantized with Math.round(v * 1000), empty arrays recorded as [],
// null objects as null, `events` excluded. A path that a JS object simply
// doesn't have (e.g. `segs.0.crumble` on a non-crumble ledge) is left out —
// the decoder treats a missing path as null on both sides.

import Foundation
import RetroKit

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
    public let file: RecordingFile
    public var game: String { file.game }
    public var seed: Int { file.seed }
    public var players: Int { file.players }
    public var ticks: Int { file.ticks }
    public let hashes: [(t: Int, h: UInt32)]

    public init(data: Data) throws {
        file = try RecordingFile(data: data)
        hashes = file.hashes.map { ($0.t, UInt32($0.h) ?? 0) }
    }

    /// The pad -> sim fold, same as scripts/goldentrace.mjs's joust adapter.
    public func input(at t: Int) -> Input {
        let p1 = file.pad(0, t)
        var inp = Input(l: p1.left, r: p1.right, f: p1.a)
        if file.slots.count > 1 && t < file.slots[1].pads.count {
            let p2 = file.pad(1, t)
            inp.l2 = p2.left; inp.r2 = p2.right; inp.f2 = p2.a
        }
        return inp
    }
}

/// Replay a recording pad-only; returns the flattened state after every tick.
public func replay(_ rec: Recording) -> (states: [[String: TV]], hashMismatch: Int?) {
    let gs = Game(players: rec.players)
    var states: [[String: TV]] = []
    states.reserveCapacity(rec.ticks)
    let want = Dictionary(rec.hashes.map { ($0.t, $0.h) }, uniquingKeysWith: { a, _ in a })
    var mismatch: Int? = nil
    for t in 0..<rec.ticks {
        gs.step(rec.input(at: t))
        gs.events.removeAll() // the shell drains it every tick; never state
        var flat = flatten(gs)
        let h = gs.stateHash()
        flat["hash"] = .num(Int64(h))
        states.append(flat)
        if mismatch == nil, let w = want[t + 1], w != h { mismatch = t + 1 }
    }
    return (states, mismatch)
}

/// retrogames-trace/v1 for a replayed recording (`events` excluded)
public func writeTrace(states: [[String: TV]], rec: Recording, recName: String) -> String {
    writeTrace(states: states, game: rec.game, seed: rec.seed, players: rec.players, ticks: rec.ticks, excludes: ["events"], recName: recName)
}
