// The ten halls, heroes and monsters, decoded from LevelData.swift (generated
// from levels.js by scripts/genlevels.mjs).
import Foundation
import RetroKit

public struct Start: Decodable { public let x: Double, y: Double, a: Double }
public struct DoorDef: Decodable { public let x: Int, y: Int; public let lock: String? }
public struct GenDef: Decodable { public let comp: [String]; public let cap: Int; public let every: Int }
public struct TrapDef: Decodable { public let period: Int, open: Int, phase: Int }
public struct WarpDef: Decodable { public let x: Int, y: Int, to: Int }
public struct Prop: Decodable {
    public let t: String, x: Double, y: Double
    public init(from d: Decoder) throws {
        var c = try d.unkeyedContainer()
        t = try c.decode(String.self); x = try c.decode(Double.self); y = try c.decode(Double.self)
    }
}
public struct Level: Decodable {
    public let idx: Int, name: String, material: String
    public let grid: [String]
    public let start: Start
    public let exit: [Int]
    public let doors: [DoorDef]
    public let props: [Prop]
    public let gen: GenDef
    public let deathAt: Int
    public let trap: TrapDef?
    public let tele: [[Int]]
    public let warps: [WarpDef]
    /// grid bytes [r][c]
    public var g: [[UInt8]] = []
    enum CodingKeys: String, CodingKey { case idx, name, material, grid, start, exit, doors, props, gen, deathAt, trap, tele, warps }
}
public struct HeroDef: Decodable { public let name: String, who: String, hp: Int; public let speed: Double; public let power: Int, arrow: Int; public let label: String }
public struct MonsterDef: Decodable {
    public let hp: Int, dmg: Int; public let speed: Double; public let ghost: Bool; public let pts: Int
    public let casts: String?; public let drain: Bool?
}
public struct SpriteDef: Decodable { public let pal: [String: String]; public let frames: [[String]] }
public struct Material: Decodable { public let base, lite, dark, mortar, accent: String }
struct LevelFile: Decodable {
    let W: Int, H: Int, VW: Double, VH: Double, PX: Double
    let LEVELS: [Level]
    let HEROES: [String: HeroDef]
    let HERO_ORDER: [String]
    let MONSTERS: [String: MonsterDef]
    let SPRITES: [String: SpriteDef]
    let MATERIALS: [String: Material]
}

public enum Data_ {
    static let file: LevelFile = {
        var f = try! JSONDecoder().decode(LevelFile.self, from: Data(base64Encoded: levelJSONBase64)!)
        var lv = f.LEVELS
        for i in lv.indices { lv[i].g = lv[i].grid.map { Array($0.utf8) } }
        f = LevelFile(W: f.W, H: f.H, VW: f.VW, VH: f.VH, PX: f.PX, LEVELS: lv, HEROES: f.HEROES, HERO_ORDER: f.HERO_ORDER, MONSTERS: f.MONSTERS, SPRITES: f.SPRITES, MATERIALS: f.MATERIALS)
        return f
    }()
}
public let W = 24, H = 24
public var LEVELS: [Level] { Data_.file.LEVELS }
public var HEROES: [String: HeroDef] { Data_.file.HEROES }
public var HERO_ORDER: [String] { Data_.file.HERO_ORDER }
public var MONSTERS: [String: MonsterDef] { Data_.file.MONSTERS }
public var SPRITES: [String: SpriteDef] { Data_.file.SPRITES }
public var MATERIALS: [String: Material] { Data_.file.MATERIALS }
public let VW = 256.0, VH = 200.0, PX = 16.0
public let VWC = VW / PX, VHC = VH / PX

@inline(__always) public func ch(_ c: Character) -> UInt8 { c.asciiValue! }
