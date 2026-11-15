// The vale's map data, decoded from WorldData.swift (generated from world.js).
import Foundation

public let TS = 16
public let SW = 16
public let SH = 11

public struct Exit: Decodable { public let to: String; public let x: Int; public let y: Int }
public struct Exits: Decodable { public let n: Exit?; public let e: Exit?; public let s: Exit?; public let w: Exit? }
public struct Warp: Decodable { public let x: Int; public let y: Int; public let to: String; public let sx: Int; public let sy: Int }
public struct Door: Decodable {
    public let id: String; public let x: Int; public let y: Int; public let kind: String
    public let `switch`: String?; public let to: String?; public let entry: [Int]?
}
public struct Crack: Decodable { public let id: String; public let x: Int; public let y: Int; public let reveal: String?; public let amount: Int? }
public struct Chest: Decodable { public let id: String; public let x: Int; public let y: Int; public let item: String; public let after: String? }
public struct Sign: Decodable { public let x: Int; public let y: Int; public let msg: String; public let bossHint: Bool? }
public struct EnemyDef: Decodable {
    public let type: String; public let x: Int; public let y: Int; public let i: Int?
    public let drop: String?; public let boss: Int?; public let perch: [[Int]]?
}
public struct NpcDef: Decodable {
    public let id: String; public let kind: String; public let x: Int; public let y: Int
    public let msg: String?; public let requires: String?; public let wander: [[Int]]?
}
public struct BlockDef: Decodable { public let id: String; public let x: Int; public let y: Int }
public struct Plate: Decodable { public let id: String; public let x: Int; public let y: Int; public let opens: String? }
public struct Switch: Decodable { public let id: String; public let x: Int; public let y: Int; public let via: String?; public let opens: String? }
public struct Vent: Decodable { public let id: String; public let x: Int; public let y: Int }
public struct Brazier: Decodable { public let x: Int; public let y: Int }

public struct Screen: Decodable {
    public let id: String
    public let name: String
    public let rows: [String]
    public let dark: Bool
    public let req: String?
    public let exits: Exits?
    public let warps: [Warp]?
    public let doors: [Door]?
    public let cracks: [Crack]?
    public let chests: [Chest]?
    public let signs: [Sign]?
    public let enemies: [EnemyDef]?
    public let npcs: [NpcDef]?
    public let blocks: [BlockDef]?
    public let plates: [Plate]?
    public let switches: [Switch]?
    public let vents: [Vent]?
    public let braziers: [Brazier]?
    public let spawn: [Int]?

    /// rows as bytes, [y][x]
    public var grid: [[UInt8]] = []
    enum CodingKeys: String, CodingKey {
        case id, name, rows, dark, req, exits, warps, doors, cracks, chests, signs, enemies, npcs, blocks, plates, switches, vents, braziers, spawn
    }
}

public struct Offer: Decodable { public let item: String; public let label: String; public let price: Int }

struct WorldFile: Decodable {
    let SCREENS: [String: Screen]
    let SHOP: [Offer]
    let SECRET_SHOP: [Offer]
}

public enum World {
    public static let data: (screens: [String: Screen], shop: [Offer], secret: [Offer]) = {
        let raw = Data(base64Encoded: worldJSONBase64)!
        let f = try! JSONDecoder().decode(WorldFile.self, from: raw)
        var screens = f.SCREENS
        for (k, var s) in screens {
            s.grid = s.rows.map { Array($0.utf8) }
            precondition(s.grid.count == SH && s.grid.allSatisfy { $0.count == SW }, "screen \(k) is not \(SW)x\(SH) ASCII")
            screens[k] = s
        }
        return (screens, f.SHOP, f.SECRET_SHOP)
    }()
    public static var screens: [String: Screen] { data.screens }
    public static var shop: [Offer] { data.shop }
    public static var secretShop: [Offer] { data.secret }
}

@inline(__always) public func ch(_ c: Character) -> UInt8 { c.asciiValue! }

public func tileAt(_ s: Screen?, _ x: Int, _ y: Int) -> UInt8 {
    guard let s, x >= 0, y >= 0, x < SW, y < SH else { return 35 } // '#'
    return s.grid[y][x]
}

private let SOLID: Set<UInt8> = Set("T#HR=~IAv".utf8)
public func isSolidTile(_ c: UInt8) -> Bool { SOLID.contains(c) }
