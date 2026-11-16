// retrogames-rec/v1 recordings (spec: src/utils/recording.js), read
// correctly rounded. Each port folds RecPad into its own sim Input.
//
// Decoded with JSONDecoder, NOT JSONSerialization: Gauntlet's aim lane carries
// 17-digit doubles (cos/sin of the planner's heading), and JSONSerialization
// is not correctly rounded (it reads 0.021500000000000002 as 0.0215).
// JSONDecoder is, so a recorded double is the very double the web stepped with.

import Foundation

/// One recorded pad: the buttons as levels, plus the analog aim lane (0 when absent).
public struct RecPad: Equatable {
    public var up = false, down = false, left = false, right = false, a = false, b = false
    public var ax = 0.0, ay = 0.0
    public init() {}
}

public struct RecSlot {
    /// slot.source.kind ("human", "planner", "off", …; nil when the file has none)
    public let source: String?
    /// one pad per tick; a null pad reads as all-up
    public let pads: [RecPad]
}

public struct RecordingFile {
    public let game: String, seed: Int, players: Int, ticks: Int
    public let slots: [RecSlot]
    /// recorded state hashes; numbers are kept as their decimal string
    public let hashes: [(t: Int, h: String)]

    private struct PadJSON: Decodable { var up, down, left, right, a, b: Bool?; var ax, ay: Double? }
    private struct SlotJSON: Decodable { struct Src: Decodable { var kind: String? }; var source: Src?; var pads: [PadJSON?]? }
    private struct HashJSON: Decodable {
        var t: Int; var h: String
        enum K: String, CodingKey { case t, h }
        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: K.self)
            t = try c.decode(Int.self, forKey: .t)
            if let s = try? c.decode(String.self, forKey: .h) { h = s } else { h = String(try c.decode(Int64.self, forKey: .h)) }
        }
    }
    private struct RecJSON: Decodable { var format: String?; var game: String?; var seed: Int?; var players: Int?; var ticks: Int?; var slots: [SlotJSON]?; var hashes: [HashJSON]? }

    public init(data: Data) throws {
        let r = try JSONDecoder().decode(RecJSON.self, from: data)
        guard r.format == "retrogames-rec/v1" else { throw TraceError.bad("not retrogames-rec/v1") }
        game = r.game ?? ""; seed = r.seed ?? 0; players = r.players ?? 1; ticks = r.ticks ?? 0
        slots = (r.slots ?? []).map { s in
            RecSlot(source: s.source?.kind, pads: (s.pads ?? []).map { m in
                var p = RecPad()
                p.up = m?.up ?? false; p.down = m?.down ?? false; p.left = m?.left ?? false; p.right = m?.right ?? false
                p.a = m?.a ?? false; p.b = m?.b ?? false; p.ax = m?.ax ?? 0; p.ay = m?.ay ?? 0
                return p
            })
        }
        hashes = (r.hashes ?? []).map { ($0.t, $0.h) }
    }

    /// slot `slot`'s pad at tick `t`; all-up past the end or for a missing slot
    public func pad(_ slot: Int, _ t: Int) -> RecPad {
        slot < slots.count && t < slots[slot].pads.count ? slots[slot].pads[t] : RecPad()
    }
}
