// JOUST — the five waves, ported verbatim from src/games/Joust/waves.js.
// Terrain is data: segments, hands, rosters, spawn points.

public let LAVA_TOP = 212.0
public let GROUND_Y = 204.0

public struct SegDef { public let x0, x1, y: Double; public let kind: String; public let crumble: Bool? }
public struct HandDef { public let x: Double; public let period, phase: Int; public let outY: Double }
public struct RosterDef { public let kind: String; public let x: Double; public let delay: Int }
public struct WaveDef {
    public let name: String
    public let segs: [SegDef]
    public let hands: [HandDef]
    public let roster: [RosterDef]
    public let spawns: [(Double, Double)]
}

private func g(_ x0: Double, _ x1: Double) -> SegDef { SegDef(x0: x0, x1: x1, y: 204, kind: "ground", crumble: nil) }
private func p(_ x0: Double, _ x1: Double, _ y: Double, crumble: Bool? = nil) -> SegDef { SegDef(x0: x0, x1: x1, y: y, kind: "plat", crumble: crumble) }
private func h(_ x: Double, _ period: Int, _ phase: Int, _ outY: Double) -> HandDef { HandDef(x: x, period: period, phase: phase, outY: outY) }
private func r(_ kind: String, _ x: Double, _ delay: Int) -> RosterDef { RosterDef(kind: kind, x: x, delay: delay) }

public let WAVES: [WaveDef] = [
    WaveDef(name: "WAVE 1",
            segs: [g(0, 104), g(152, 256), p(48, 96, 152), p(160, 208, 152)],
            hands: [h(72, 360, 0, 150), h(184, 360, 180, 150)],
            roster: [r("bounder", 64, 60), r("bounder", 128, 260), r("bounder", 192, 460)],
            spawns: [(72, 120), (184, 120)]),
    WaveDef(name: "WAVE 2",
            segs: [g(0, 40), g(88, 168), g(216, 256), p(104, 152, 136)],
            hands: [h(64, 320, 40, 150), h(192, 320, 200, 150)],
            roster: [r("bounder", 56, 60), r("bounder", 128, 240), r("bounder", 200, 420), r("bounder", 96, 640)],
            spawns: [(24, 120), (232, 120)]),
    WaveDef(name: "WAVE 3",
            segs: [g(0, 96), g(160, 256), p(24, 80, 146, crumble: true), p(176, 232, 146, crumble: true)],
            hands: [h(52, 280, 0, 150), h(128, 280, 93, 150), h(204, 280, 186, 150)],
            roster: [r("bounder", 64, 60), r("bounder", 192, 240), r("bounder", 128, 420), r("hunter", 40, 640), r("hunter", 216, 760)],
            spawns: [(48, 120), (204, 120)]),
    WaveDef(name: "WAVE 4",
            segs: [g(0, 32), g(72, 184), g(224, 256), p(96, 160, 132, crumble: true)],
            hands: [h(52, 240, 0, 146), h(128, 240, 80, 146), h(204, 240, 160, 146)],
            roster: [r("bounder", 104, 60), r("bounder", 152, 240), r("hunter", 48, 420), r("hunter", 208, 600), r("hunter", 128, 780)],
            spawns: [(16, 120), (240, 120)]),
    WaveDef(name: "WAVE 5",
            segs: [g(0, 104), g(152, 256), p(48, 96, 150, crumble: true), p(160, 208, 150, crumble: true), p(104, 152, 96)],
            hands: [h(72, 210, 0, 140), h(128, 210, 70, 140), h(184, 210, 140, 140)],
            roster: [r("bounder", 64, 60), r("bounder", 192, 220), r("hunter", 48, 380), r("hunter", 208, 540), r("shadow", 128, 760), r("shadow", 96, 1000)],
            spawns: [(128, 60), (128, 84)]),
]
