// EMBERWOOD — the sim, a line-for-line port of src/games/Emberwood/sim.js.
// The web game is the spec: same seed + same pads must give the same state at
// every tick (public/traces/emberwood-*.trace.json). Keep operand order, keep
// JS loop shapes (for-of over a growing array visits the new tail), and keep
// optional fields optional: a key JS only adds later (hitSwing, ventCool,
// moving, …) is absent from the trace until JS adds it.

import Foundation
import RetroKit

// MARK: - rng

public struct Mulberry32 {
    var a: UInt32
    public init(_ seed: UInt32) { a = seed }
    public mutating func next() -> Double {
        a = a &+ 0x6d2b79f5
        var t = UInt32(bitPattern: Int32(bitPattern: a ^ (a >> 15)) &* Int32(bitPattern: 1 | a))
        t = (t &+ UInt32(bitPattern: Int32(bitPattern: t ^ (t >> 7)) &* Int32(bitPattern: 61 | t))) ^ t
        return Double(t ^ (t >> 14)) / 4294967296
    }
}

// MARK: - specs

struct Spec { let hp: Int; let w: Double; let h: Double; let dmg: Int; var phase = false; var boss = 0 }
let ENEMY_SPEC: [String: Spec] = [
    "cinderling": Spec(hp: 2, w: 11, h: 11, dmg: 1),
    "bat": Spec(hp: 1, w: 10, h: 8, dmg: 1),
    "spitter": Spec(hp: 2, w: 12, h: 12, dmg: 1),
    "husk": Spec(hp: 3, w: 13, h: 13, dmg: 1),
    "wisp": Spec(hp: 1, w: 10, h: 10, dmg: 1, phase: true),
    "sprig": Spec(hp: 1, w: 10, h: 10, dmg: 1),
    "tuskroot": Spec(hp: 3, w: 12, h: 10, dmg: 1),
    "pod": Spec(hp: 2, w: 11, h: 11, dmg: 1),
    "maw": Spec(hp: 8, w: 26, h: 26, dmg: 1, boss: 1),
    "wyrm": Spec(hp: 6, w: 22, h: 22, dmg: 1, boss: 2),
    "king": Spec(hp: 10, w: 26, h: 26, dmg: 1, boss: 3),
    "hawk": Spec(hp: 9, w: 20, h: 16, dmg: 1, boss: 4),
]

let HERO_W = 10.0, HERO_H = 8.0, HERO_SPEED = 1.45
let NUDGE = 6
let NPC_SPEED = 0.45
let NPC_HALT = 44.0
let NPC_DWELL = 90
public let ARC_DUR = 12
let TSD = Double(TS)

@inline(__always) func tileOf(_ v: Double) -> Int { jsFloor(v / TSD) }

func cornerNudge(_ free: (Double) -> Bool) -> Double {
    var up = 0, dn = 0
    for d in 1...NUDGE where free(Double(-d)) { up = d; break }
    for d in 1...NUDGE where free(Double(d)) { dn = d; break }
    if up > 0 && dn > 0 { return 0 }
    if up > 0 { return -min(Double(up), HERO_SPEED) }
    if dn > 0 { return min(Double(dn), HERO_SPEED) }
    return 0
}

public enum Dir: String { case up, down, left, right
    var v: (Double, Double) {
        switch self { case .up: return (0, -1); case .down: return (0, 1); case .left: return (-1, 0); case .right: return (1, 0) }
    }
}

// MARK: - state

public final class Hero {
    public var x = 0.0, y = 0.0, dir = Dir.up, hp = 3, max = 3, inv = 0, hurt = 0
}

public struct Items {
    public var sword = true, bow = false, shield = false, blade = false, gale = false, step = false
    public var bombs = 0, arrows = 0, potions = 0, keys = 0, bigkey = false
    public var e = 0 // items._e — the shell's ember tally ('_' keys are not state)
    public func has(_ name: String) -> Bool {
        switch name {
        case "sword": return sword; case "bow": return bow; case "shield": return shield; case "blade": return blade
        case "gale": return gale; case "step": return step; case "bigkey": return bigkey
        case "bombs": return bombs != 0; case "arrows": return arrows != 0; case "potions": return potions != 0; case "keys": return keys != 0
        default: return false
        }
    }
}

public final class Enemy {
    public var type: String, i: Int?, drop: String?, boss: Int
    public var x: Double, y: Double
    public var hp: Int, w: Double, h: Double, dmg: Int
    public var t = 0, st = 0, vx = 0.0, vy = 0.0, hitT = 0, open = 0, stagger = 0, hidden: Bool
    public var charging = 0, rest = 0, chx = 0.0, chy = 0.0, gen = 0
    public var mantle: Int, summoned = 0
    public var perch: [(Double, Double)], roost = 0
    public var fx = 0.0, fy = 1.0, seedOff: Int, dead = false
    public var seg: [(Double, Double)] = []
    // added by JS only once they happen
    public var hitSwing: Int? = nil
    public var roostSet: Int? = nil
    public var lockAxis: String? = nil
    public var dirSign: Double? = nil

    init(_ e: EnemyDef) {
        let spec = ENEMY_SPEC[e.type]!
        type = e.type; i = e.i; drop = e.drop; boss = e.boss ?? 0
        x = Double(e.x * TS) + TSD / 2; y = Double(e.y * TS) + TSD / 2 + 2
        hp = spec.hp; w = spec.w; h = spec.h; dmg = spec.dmg
        hidden = e.type == "sprig"
        mantle = e.type == "king" ? 3 : 0
        perch = (e.perch ?? []).map { (Double($0[0] * TS) + TSD / 2, Double($0[1] * TS) + TSD / 2 + 2) }
        seedOff = (e.i ?? 0) * 37 + 11
    }
}

public final class Npc {
    public var id: String, kind: String, requires: String?, msg: String?
    public var x: Double, y: Double, wx: Double, wy: Double
    public var path: [(Int, Int)], wi = 0, dwell: Int, moving = false
    init(_ sim: Sim, _ n: NpcDef) {
        id = n.id; kind = n.kind; requires = n.requires; msg = n.msg
        x = Double(n.x * TS) + 8; y = Double(n.y * TS) + 8; wx = x; wy = y
        if let w = n.wander, w.count >= 2 { path = w.map { ($0[0], $0[1]) } } else { path = [(n.x, n.y)] }
        dwell = NPC_DWELL + Int((Int64(sim.seed) + Int64(n.id.utf16.count) * 131) % 4) * 40
    }
}

public final class Projectile {
    public var kind: String, x: Double, y: Double, vx: Double, vy: Double, life: Int?
    init(_ kind: String, _ x: Double, _ y: Double, _ vx: Double, _ vy: Double, life: Int? = nil) {
        self.kind = kind; self.x = x; self.y = y; self.vx = vx; self.vy = vy; self.life = life
    }
}

public final class Bomb { public var x: Double, y: Double, fuse: Int; init(_ x: Double, _ y: Double, _ f: Int) { self.x = x; self.y = y; fuse = f } }
public final class Drop { public var kind: String, x: Double, y: Double, t = 0; init(_ k: String, _ x: Double, _ y: Double) { kind = k; self.x = x; self.y = y } }
public final class Block { public var id: String, x: Int, y: Int, cool = 0; init(_ id: String, _ x: Int, _ y: Int) { self.id = id; self.x = x; self.y = y } }

public struct Flags {
    public var cracked: [String: Bool] = [:], doorsOpen: [String: Bool] = [:], switchesOn: [String: Bool] = [:]
    public var chestsOpen: [String: Bool] = [:], ventsOff: [String: Bool] = [:], killed: [String: Bool] = [:]
    public var boss1 = false, boss2 = false, boss3 = false, boss4 = false, emberTaken = false, dawnheart = false
    public var elderGifted: Bool? = nil
    /// sim.flags[name] read as a truthy test (chest `after`).
    func truthy(_ name: String) -> Bool {
        switch name {
        case "boss1": return boss1; case "boss2": return boss2; case "boss3": return boss3; case "boss4": return boss4
        case "emberTaken": return emberTaken; case "dawnheart": return dawnheart; case "elderGifted": return elderGifted ?? false
        case "cracked", "doorsOpen", "switchesOn", "chestsOpen", "ventsOff", "killed": return true
        default: return false
        }
    }
}

public struct Shop { public var open = false, sel = 0, id: String? = nil }

public struct DungeonEntry { public var screen: String, x: Double, y: Double }

/// One fx journal entry (cosmetic: the shell drains it for sound + particles).
public struct FX {
    public let k: String, x: Double, y: Double
    public var dir: Dir? = nil, type: String? = nil, boss: Int = 0, item: String? = nil, z: Double = 0
    public var dirx = 0.0, diry = 0.0 // the dust puffs' drift (render only; fx is not traced)
}

public struct Input {
    public var lx = 0.0, ly = 0.0
    public var aHeld = false, aPressed = false, aReleased = false
    public var bPressed = false, bHeld = false, bReleased = false
    public var cPressed = false, upPressed = false, downPressed = false, startPressed = false
    public init() {}
}

/// input.js padToInput — `prev` is the per-seat edge memory, mutated.
public struct PadPrev { public var a = false, b = false, b2 = false, up = false, down = false; public init() {} }
public struct Pad {
    public var up = false, down = false, left = false, right = false, a = false, b = false, b2 = false
    public init(up: Bool = false, down: Bool = false, left: Bool = false, right: Bool = false, a: Bool = false, b: Bool = false, b2: Bool = false) {
        self.up = up; self.down = down; self.left = left; self.right = right; self.a = a; self.b = b; self.b2 = b2
    }
}
public func padToInput(_ pad: Pad, _ prev: inout PadPrev) -> Input {
    let lx = Double((pad.right ? 1 : 0) - (pad.left ? 1 : 0))
    let ly = Double((pad.down ? 1 : 0) - (pad.up ? 1 : 0))
    var inp = Input()
    inp.lx = abs(lx) > 0.15 ? lx : 0; inp.ly = abs(ly) > 0.15 ? ly : 0
    inp.aHeld = pad.a; inp.aPressed = pad.a && !prev.a; inp.aReleased = !pad.a && prev.a
    inp.bPressed = pad.b && !prev.b; inp.bHeld = pad.b; inp.bReleased = !pad.b && prev.b
    inp.cPressed = pad.b2 && !prev.b2
    inp.upPressed = pad.up && !prev.up; inp.downPressed = pad.down && !prev.down
    prev.a = pad.a; prev.b = pad.b; prev.b2 = pad.b2; prev.up = pad.up; prev.down = pad.down
    return inp
}

// MARK: - sim

public final class Sim {
    public var tick = 0
    public let seed: UInt32
    var rng: Mulberry32
    public var screen = "ow-11"
    public let hero = Hero()
    public var items = Items()
    public var score = 0
    public var swing = 0, swingDir = Dir.down, swingId = 0, cool = 0, holdT = 0, drawing = false
    public var arc = 0, arcDir = Dir.down, arcId = 0
    public var bombCool = 0
    public var bHoldT = 0, pendingB = 0, galeCool = 0, galing = false
    public var hitStop = 0
    public var shop = Shop()
    public var paused = false
    public var death = false, deathT = 0, win = false
    public var enemies: [Enemy] = [], projectiles: [Projectile] = [], bombs: [Bomb] = [], drops: [Drop] = [], blocks: [Block] = []
    public var fx: [FX] = []
    public var msg: String? = nil, msgT = 0
    public var cut: [String: Bool] = [:]
    public var flags = Flags()
    public var roomName = "", nameT = 0
    public var lastDungeonEntry: [String: DungeonEntry] = [:]
    public var npcs: [Npc] = []
    public var moving: Bool? = nil           // JS adds it on the first live step
    public var ventCool: [String: Int]? = nil // JS adds it on the first vent screen

    public init(seed: UInt32 = 1) {
        self.seed = seed
        rng = Mulberry32(seed)
        hero.x = Double(5 * TS + 8); hero.y = Double(6 * TS + 6)
        spawnRoom("ow-11", nil)
    }

    var scr: Screen { World.screens[screen]! }

    func say(_ text: String?, _ t: Int = 180) { msg = text; msgT = t } // npc.msg may be undefined in JS: then msg is absent
    func emit(_ k: String, _ x: Double, _ y: Double, _ f: ((inout FX) -> Void)? = nil) {
        var e = FX(k: k, x: x, y: y); f?(&e); fx.append(e)
    }

    func stepAmbient() {
        let s = scr
        guard s.req == "emberTaken" else { return }
        if tick % 6 != 0 { return }
        let r: (Int) -> Double = { n in let x = jsSin(Double(self.tick * 7 + n) * 12.9898) * 43758.5453; return x - x.rounded(.down) }
        let z = 5 + r(3) * 11
        emit("mote", 12 + r(1) * 232, 12 + r(2) * 152) { $0.z = z }
    }

    // MARK: collision

    func blocked(_ x: Double, _ y: Double, _ w: Double, _ h: Double, _ phase: Bool = false, _ climb: Bool = false) -> Bool {
        if phase { return false }
        let s = scr
        let x0 = tileOf(x - w / 2), x1 = tileOf(x + w / 2 - 0.001)
        let y0 = tileOf(y - h / 2), y1 = tileOf(y + h / 2 - 0.001)
        if y0 > y1 || x0 > x1 { return false }
        for ty in y0...y1 {
            for tx in x0...x1 {
                let c = tileAt(s, tx, ty)
                if let d = doorAt(s, tx, ty) {
                    if !doorOpen(d) { return true }
                    continue
                }
                if c == 67 /* C */ {
                    if !(crackAt(s, tx, ty).map { flags.cracked[$0.id] ?? false } ?? false) { return true }
                } else if c == 118 /* v */ {
                    let vt = (s.vents ?? []).first { $0.x == tx && $0.y == ty }
                    if !(vt != nil && (flags.ventsOff[vt!.id] ?? false)) { return true }
                } else if c == 65 /* A */ {
                    if !climb { return true }
                } else if isSolidTile(c) { return true }
                else if c == 46 /* . */ {
                    if chestAt(tx, ty) != nil { return true }
                    if blocks.contains(where: { $0.x == tx && $0.y == ty }) { return true }
                }
            }
        }
        return false
    }

    func crackAt(_ s: Screen, _ tx: Int, _ ty: Int) -> Crack? { (s.cracks ?? []).first { $0.x == tx && $0.y == ty } }
    func doorAt(_ s: Screen, _ tx: Int, _ ty: Int) -> Door? { (s.doors ?? []).first { $0.x == tx && $0.y == ty } }
    func chestAt(_ tx: Int, _ ty: Int) -> Chest? {
        (scr.chests ?? []).first { $0.x == tx && $0.y == ty && !(flags.chestsOpen[$0.id] ?? false) && ($0.after == nil || flags.truthy($0.after!)) }
    }
    func plateAt(_ s: Screen, _ tx: Int, _ ty: Int) -> Plate? { (s.plates ?? []).first { $0.x == tx && $0.y == ty } }
    func warpAt(_ s: Screen, _ tx: Int, _ ty: Int) -> Warp? { (s.warps ?? []).first { $0.x == tx && $0.y == ty } }

    func npcNear(_ tx: Int, _ ty: Int) -> Npc? {
        let px = Double(tx * TS + 8), py = Double(ty * TS + 8)
        var best: Npc? = nil, bd = 14.0
        for n in npcs {
            if let r = n.requires, !items.has(r) { continue }
            let d = jsHypot(n.x - px, n.y - py)
            if d < bd { bd = d; best = n }
        }
        if best != nil { return best }
        bd = 24
        for n in npcs {
            if let r = n.requires, !items.has(r) { continue }
            let d = jsHypot(n.x - hero.x, n.y - hero.y)
            if d < bd { bd = d; best = n }
        }
        return best
    }

    public func doorOpen(_ d: Door) -> Bool {
        if d.kind == "switch" { return (flags.switchesOn[d.switch ?? "undefined"] ?? false) || (flags.doorsOpen[d.id] ?? false) }
        if d.kind == "heart" { return flags.emberTaken }
        return flags.doorsOpen[d.id] ?? false
    }

    public func spawnRoom(_ id: String, _ entry: [Int]?) {
        let s = World.screens[id]!
        screen = id
        enemies = (s.enemies ?? []).map { Enemy($0) }
        projectiles = []
        bombs = []
        drops = []
        blocks = (s.blocks ?? []).map { Block($0.id, $0.x, $0.y) }
        npcs = (s.npcs ?? []).map { Npc(self, $0) }
        let sp = entry ?? s.spawn ?? [5, 6]
        hero.x = Double(sp[0] * TS) + TSD / 2
        hero.y = Double(sp[1] * TS) + TSD / 2 + 4
        roomName = s.name
        nameT = 140
        swing = 0; drawing = false; holdT = 0
        arc = 0
        shop.open = false
        shop.id = nil
    }

    func moveEnemy(_ e: Enemy, _ dx: Double, _ dy: Double, _ speed: Double) {
        var len = jsHypot(dx, dy); if len == 0 { len = 1 }
        let vx = (dx / len) * speed
        let vy = (dy / len) * speed
        e.fx = dx / len; e.fy = dy / len
        let spec = ENEMY_SPEC[e.type]!
        if !blocked(e.x + vx, e.y, spec.w, spec.h, spec.phase) { e.x += vx }
        if !blocked(e.x, e.y + vy, spec.w, spec.h, spec.phase) { e.y += vy }
        e.x = max(TSD, min(Double(SW * TS) - TSD, e.x))
        e.y = max(TSD, min(Double(SH * TS) - TSD, e.y))
    }

    // MARK: step

    @discardableResult
    public func step(_ inp: Input) -> Sim {
        tick += 1
        if hitStop > 0 { hitStop -= 1; return self }
        if msgT > 0 { msgT -= 1 }
        if nameT > 0 { nameT -= 1 }
        if fx.count > 400 { fx.removeFirst(fx.count - 400) }

        if death {
            deathT += 1
            if deathT > 90 && inp.aPressed { revive() }
            fx.removeAll()
            return self
        }
        if win { return self }

        if shop.open { stepShop(inp); stepPickups(); return self }

        let h = hero
        if h.inv > 0 { h.inv -= 1 }
        if h.hurt > 0 { h.hurt -= 1 }
        if cool > 0 { cool -= 1 }
        if bombCool > 0 { bombCool -= 1 }
        if galeCool > 0 { galeCool -= 1 }
        for b in blocks where b.cool > 0 { b.cool -= 1 }

        // movement
        var lx = inp.lx, ly = inp.ly
        if abs(lx) < 0.15 { lx = 0 }
        if abs(ly) < 0.15 { ly = 0 }
        let mv = lx != 0 || ly != 0
        moving = mv
        if mv {
            let len = jsHypot(lx, ly)
            let vx = (lx / len) * HERO_SPEED
            let vy = (ly / len) * HERO_SPEED
            let climb = items.step
            if !blocked(h.x + vx, h.y, HERO_W, HERO_H, false, climb) { h.x += vx }
            else if vx != 0 { h.y += cornerNudge { d in !self.blocked(h.x + vx, h.y + d, HERO_W, HERO_H, false, climb) && !self.blocked(h.x, h.y + d, HERO_W, HERO_H, false, climb) } }
            if !blocked(h.x, h.y + vy, HERO_W, HERO_H, false, climb) { h.y += vy }
            else if vy != 0 { h.x += cornerNudge { d in !self.blocked(h.x + d, h.y + vy, HERO_W, HERO_H, false, climb) && !self.blocked(h.x + d, h.y, HERO_W, HERO_H, false, climb) } }
            if abs(lx) >= abs(ly) { h.dir = lx > 0 ? .right : .left }
            else { h.dir = ly > 0 ? .down : .up }
            tryPush(lx, ly)
        }

        // A: tap = sword/interact, hold = draw bow
        if inp.aPressed { holdT = 1 } else if inp.aHeld && holdT > 0 {
            holdT += 1
            if holdT == 12 {
                if items.bow && items.arrows > 0 { drawing = true; emit("draw", h.x, h.y) }
                else { say("THE BOW NEEDS ARROWS", 90) }
            }
        } else if inp.aReleased {
            if drawing { fireArrow() }
            else if cool == 0 { primaryAction() }
            holdT = 0; drawing = false
        }

        if swing > 0 { swing -= 1; swordHits() }
        if arc > 0 { arc -= 1 }

        // B: tap = bomb, hold >= 12 + release = gale gust
        if inp.bPressed { pendingB = 1; bHoldT = 1 }
        else if inp.bHeld && bHoldT > 0 {
            bHoldT += 1
            pendingB = 0
            if bHoldT == 12 && items.gale && galeCool == 0 {
                galing = true
                emit("galecharge", h.x, h.y)
            }
        } else if pendingB > 0 {
            if items.bombs > 0 && bombCool == 0 {
                items.bombs -= 1
                bombCool = 30
                bombs.append(Bomb(h.x, h.y + 4, 70))
                emit("placebomb", h.x, h.y)
            }
            pendingB = 0; bHoldT = 0
        }
        if inp.bReleased {
            if galing { castGale() }
            galing = false
            pendingB = 0; bHoldT = 0
        }

        // C: potion
        if inp.cPressed && items.potions > 0 && h.hp < h.max {
            items.potions -= 1; h.hp = h.max
            emit("potion", h.x, h.y)
        }

        stepBombs()
        stepProjectiles()
        stepVents()
        stepNpcs()
        stepEnemies()
        stepAmbient()
        stepPickups()
        checkTransitions()

        if h.hp <= 0 {
            h.hp = 0; death = true; deathT = 0
            emit("heroDeath", h.x, h.y)
        }
        return self
    }

    func primaryAction() {
        let h = hero
        let (dvx, dvy) = h.dir.v
        let tx = tileOf(h.x + dvx * (TSD * 0.9))
        let ty = tileOf(h.y + dvy * (TSD * 0.9))
        let s = scr
        if let npc = npcNear(tx, ty) {
            if npc.kind == "shop" { shop.open = true; shop.sel = 0; shop.id = npc.id; emit("ui", 0, 0) }
            else if npc.id == "elder" && !(flags.elderGifted ?? false) {
                flags.elderGifted = true
                grant("potion")
                say("THE ELDER PRESSES A SMOULDERING POTION INTO YOUR HAND", 320)
                return
            } else { say(npc.msg, 320) }
            return
        }
        if let sg = (s.signs ?? []).first(where: { $0.x == tx && $0.y == ty }) { say(sg.msg, 340); emit("read", h.x, h.y); return }
        if let chest = chestAt(tx, ty) ?? chestAt(tileOf(h.x), tileOf(h.y) + (dvy != 0 ? Int(dvy) : 0)),
           jsHypot(Double(chest.x * TS + 8) - h.x, Double(chest.y * TS + 8) - h.y) < TSD * 1.8 { openChest(chest); return }
        if let d = doorAt(s, tx, ty), !doorOpen(d) { tryDoor(d); return }
        if cool == 0 {
            swing = 10; cool = 16; swingDir = h.dir; swingId += 1
            arc = ARC_DUR; arcDir = h.dir; arcId = swingId
            let dir = h.dir
            emit("sword", h.x, h.y) { $0.dir = dir }
        }
    }

    func tryDoor(_ d: Door) {
        let cx = Double(d.x * TS + 8), cy = Double(d.y * TS + 8)
        if d.kind == "key" {
            if items.keys > 0 { items.keys -= 1; flags.doorsOpen[d.id] = true; emit("unlock", cx, cy) }
            else { say("A LOCKED DOOR — YOU NEED A KEY", 120) }
        } else if d.kind == "bigkey" {
            if items.bigkey { flags.doorsOpen[d.id] = true; emit("unlock", cx, cy) }
            else { say("A MOSSY DOOR — A GREATER KEY LURKS NEARBY", 140) }
        } else if d.kind == "heart" {
            if flags.emberTaken { flags.doorsOpen[d.id] = true; emit("unlock", cx, cy) }
            else { say("ASHFELL GATE — IT OPENS ONLY FOR ONE WHO CARRIES THE EMBER HEART", 180) }
        }
    }

    func openChest(_ c: Chest) {
        flags.chestsOpen[c.id] = true
        grant(c.item)
        emit("chest", Double(c.x * TS + 8), Double(c.y * TS + 8))
    }

    func grant(_ item: String) {
        let h = hero
        switch item {
        case "key": items.keys += 1
        case "bigkey": items.bigkey = true
        case "heart": h.max += 1; h.hp = h.max; say("HEART CONTAINER — HEART UP!", 160)
        case "emberheart": h.max += 2; h.hp = h.max; win = true; flags.emberTaken = true; say("THE EMBER HEART — THE WOOD IS SAFE", 600)
        case "dawnheart": h.max += 2; h.hp = h.max; win = true; flags.dawnheart = true; say("DAWN OVER EMBERWOOD — THE VALE IS FREE AT LAST", 700)
        case "gale": items.gale = true; say("THE GALE CHARM! HOLD B, RELEASE TO LOOSE THE WIND", 260)
        case "cinderstep": items.step = true; say("THE CINDERSTEP! BURNED STONE REMEMBERS FOOTFALLS — THE FACE YIELDS", 280)
        case "bow": items.bow = true; items.arrows += 10; say("THE ELDER BOW! HOLD A TO DRAW, RELEASE TO LOOSE", 240)
        case "arrows": items.arrows += 10
        case "shield": items.shield = true
        case "blade": items.blade = true; say("THE EMBER BLADE — TEMPERED IN WYRMFIRE, EVERY SLASH BITES TWICE", 240)
        case "potion": items.potions += 1
        case "bombs": items.bombs += 1
        default: break
        }
        emit("grant", h.x, h.y) { $0.item = item }
    }

    func fireArrow() {
        if !(items.bow && items.arrows > 0) { return }
        items.arrows -= 1
        let (dx, dy) = hero.dir.v
        projectiles.append(Projectile("arrow", hero.x + dx * 8, hero.y + dy * 8, dx * 3.2, dy * 3.2))
        emit("shoot", hero.x, hero.y)
    }

    func castGale() {
        if !items.gale { return }
        galeCool = 24
        let (dx, dy) = hero.dir.v
        projectiles.append(Projectile("gust", hero.x + dx * 10, hero.y + dy * 10, dx * 1.9, dy * 1.9, life: 34))
        let dir = hero.dir
        emit("gust", hero.x, hero.y) { $0.dir = dir }
    }

    func swordHits() {
        let (dx, dy) = swingDir.v
        let hx = hero.x + dx * 13, hy = hero.y + dy * 13
        let hw: Double = dx != 0 ? 14 : 16, hh: Double = dy != 0 ? 14 : 16
        let s = scr
        var ty = tileOf(hy - hh / 2)
        while ty <= tileOf(hy + hh / 2) {
            var tx = tileOf(hx - hw / 2)
            while tx <= tileOf(hx + hw / 2) {
                if tileAt(s, tx, ty) == 34 /* " */ {
                    let key = "\(screen):\(tx),\(ty)"
                    if !(cut[key] ?? false) {
                        cut[key] = true
                        let cx = Double(tx * TS + 8), cy = Double(ty * TS + 8)
                        emit("cut", cx, cy)
                        let r = rng.next()
                        if r < 0.3 { spawnDrop(cx, cy, "ember") }
                        else if r < 0.38 { spawnDrop(cx, cy, "heart") }
                    }
                }
                tx += 1
            }
            ty += 1
        }
        var i = 0
        while i < enemies.count {
            let e = enemies[i]; i += 1
            if e.dead || e.hidden || e.hitSwing == swingId { continue }
            if abs(e.x - hx) < (hw + e.w) / 2 && abs(e.y - hy) < (hh + e.h) / 2 {
                e.hitSwing = swingId
                hurtEnemy(e, items.blade ? 2 : 1, dx, dy)
            }
        }
    }

    func hurtEnemy(_ e: Enemy, _ dmg: Int, _ dx: Double, _ dy: Double) {
        if e.type == "husk" {
            let toward = (dx * -e.fx) + (dy * -e.fy)
            if toward > 0.5 { emit("clank", e.x, e.y); say("THE HUSK\u{2019}S FRONT DEFLECTS STEEL", 90); return }
        }
        if e.type == "maw" && e.open <= 0 { emit("clank", e.x, e.y); return }
        if e.type == "wyrm" && e.stagger <= 0 { emit("clank", e.x, e.y); say("THE SCALECLOAK SHRUGS IT OFF — USE ARROWS!", 120); return }
        if e.type == "king" && e.mantle > 0 { emit("clank", e.x, e.y); say("CINDER MANTLE — LOOSE THE WIND TO STRIP IT", 120); return }
        if e.type == "hawk" && e.charging > 0 { emit("clank", e.x, e.y); say("STEEL WILL NOT CATCH THE HAWK — STRIKE AT THE ROOST", 140); return }
        e.hp -= dmg
        e.hitT = 8
        if e.stagger > 0 && e.hp <= 0 { e.stagger = 0 }
        e.x += dx * 5; e.y += dy * 5
        emit("hit", e.x, e.y)
        if e.hp <= 0 { killEnemy(e) }
    }

    func killKey(_ e: Enemy) -> String { "\(screen):\(e.i.map(String.init) ?? "undefined")" }

    func killEnemy(_ e: Enemy) {
        e.dead = true
        hitStop = max(hitStop, e.boss != 0 ? 6 : 3)
        let type = e.type, boss = e.boss
        emit("die", e.x, e.y) { $0.type = type; $0.boss = boss }
        let wasKey = e.drop == "key" && !(flags.killed[killKey(e)] ?? false)
        flags.killed[killKey(e)] = true
        if e.type == "pod" && e.gen == 0 {
            emit("split", e.x, e.y)
            for off in [-10.0, 10.0] {
                let kid = Enemy(EnemyDef(type: "cinderling", x: 0, y: 0, i: 90 + (e.i ?? 0) * 2 + (off < 0 ? 0 : 1), drop: "ember", boss: nil, perch: nil))
                kid.hp = 1; kid.gen = 1
                kid.x = e.x + off; kid.y = e.y; kid.t = e.t
                kid.hitSwing = swingId
                if blocked(kid.x, kid.y, kid.w, kid.h) { kid.x = e.x }
                if blocked(kid.x, kid.y, kid.w, kid.h) { kid.y = e.y - 10 }
                enemies.append(kid)
            }
        }
        if wasKey { spawnDrop(e.x, e.y, "key") }
        else if e.boss != 0 {
            if e.boss == 1 { flags.boss1 = true; say("THE BRAMBLE MAW FALLS", 200) }
            if e.boss == 2 { flags.boss2 = true; say("THE CINDER WYRM BREAKS INTO EMBERS", 240) }
            if e.boss == 3 { flags.boss3 = true; say("THE HOLLOW KING COLLAPSES INTO ASH", 260) }
            if e.boss == 4 { flags.boss4 = true; say("THE CINDERHAWK FOLDS — THE MESA IS YOURS", 240) }
            spawnDrop(e.x, e.y, "heart"); spawnDrop(e.x + 8, e.y + 4, "heart")
        } else {
            let r = rng.next()
            if r < 0.45 { spawnDrop(e.x, e.y, "ember") }
            else if r < 0.6 { spawnDrop(e.x, e.y, "heart") }
        }
    }

    func spawnDrop(_ x: Double, _ y: Double, _ kind: String) { drops.append(Drop(kind, x, y)) }

    func stepPickups() {
        let h = hero
        var i = drops.count - 1
        while i >= 0 {
            let p = drops[i]
            p.t += 1
            let dx = h.x - p.x, dy = h.y - p.y
            let d2 = dx * dx + dy * dy
            if d2 < 20 * 20 { p.x += dx * 0.18; p.y += dy * 0.18 }
            if d2 < 8 * 8 {
                if p.kind == "ember" { score += 1; items.e += 1; emit("coin", p.x, p.y) }
                else if p.kind == "heart" { h.hp = min(h.max, h.hp + 1); emit("heart", p.x, p.y) }
                else if p.kind == "key" { items.keys += 1; emit("key", p.x, p.y) }
                drops.remove(at: i)
            }
            i -= 1
        }
    }

    func trip(_ id: String, _ opens: String?, _ x: Double, _ y: Double) {
        flags.switchesOn[id] = true
        if let o = opens { flags.doorsOpen[o] = true }
        emit("switch", x, y)
        say("A MECHANISM GRINDS OPEN", 120)
    }

    func stepProjectiles() {
        let s = scr
        var i = projectiles.count - 1
        while i >= 0 {
            defer { i -= 1 }
            let p = projectiles[i]
            p.x += p.vx; p.y += p.vy
            let tx = tileOf(p.x), ty = tileOf(p.y)
            if let sw = (s.switches ?? []).first(where: { $0.x == tx && $0.y == ty }) {
                if (p.kind == "gust") == (sw.via == "gust") {
                    if !(flags.switchesOn[sw.id] ?? false) { trip(sw.id, sw.opens, p.x, p.y) }
                    projectiles.remove(at: i); continue
                }
            }
            if p.kind == "gust" {
                p.life! -= 1
                if p.life! <= 0 { projectiles.remove(at: i); continue }
                if let vt = (s.vents ?? []).first(where: { $0.x == tx && $0.y == ty }), !(flags.ventsOff[vt.id] ?? false) {
                    flags.ventsOff[vt.id] = true
                    emit("seal", p.x, p.y)
                    say("THE GUST SEALS THE VENT — THE SPORE THINS", 120)
                    projectiles.remove(at: i); continue
                }
                if let bk = blocks.first(where: { $0.x == tx && $0.y == ty }) {
                    if bk.cool == 0 {
                        let bx = Int(jsSign(p.vx)), by = Int(jsSign(p.vy))
                        let nx = bk.x + bx, ny = bk.y + by
                        let chT = tileAt(s, nx, ny)
                        let free = chT == 46 && doorAt(s, nx, ny) == nil && chestAt(nx, ny) == nil &&
                            !blocks.contains(where: { $0 !== bk && $0.x == nx && $0.y == ny })
                        if free {
                            bk.x = nx; bk.y = ny; bk.cool = 8
                            emit("push", Double(nx * TS + 8), Double(ny * TS + 8))
                            if let plate = plateAt(s, nx, ny), !(flags.switchesOn[plate.id] ?? false) {
                                trip(plate.id, plate.opens, Double(nx * TS + 8), Double(ny * TS + 8))
                            }
                        }
                    }
                    projectiles.remove(at: i); continue
                }
                if let king = enemies.first(where: { $0.type == "king" && !$0.dead && jsHypot($0.x - p.x, $0.y - p.y) < 20 }) {
                    let allSealed = (s.vents ?? []).allSatisfy { flags.ventsOff[$0.id] ?? false }
                    if king.mantle > 0 {
                        if allSealed {
                            king.mantle -= 1
                            emit("mantle", king.x, king.y)
                            say(king.mantle > 0 ? "A LAYER OF CINDER PEELS AWAY" : "THE MANTLE FALLS — THE CORE IS BARE!", 140)
                        } else { emit("clank", king.x, king.y); say("THE MANTLE HOLDS — SEAL THE SPORE VENTS FIRST", 130) }
                    }
                    projectiles.remove(at: i); continue
                }
                var j = 0
                while j < enemies.count {
                    let e = enemies[j]; j += 1
                    if e.dead || e.hidden || e.boss != 0 { continue }
                    if jsHypot(e.x - p.x, e.y - p.y) < 16 {
                        let kx = jsSign(p.vx) * 10, ky = jsSign(p.vy) * 10
                        let ph = ENEMY_SPEC[e.type]!.phase
                        if !blocked(e.x + kx, e.y + ky, e.w, e.h, ph) { e.x += kx; e.y += ky }
                        else if !blocked(e.x + kx, e.y, e.w, e.h, ph) { e.x += kx }
                        if e.type != "husk" {
                            let sx = jsSign(p.vx), sy = jsSign(p.vy)
                            hurtEnemy(e, 1, sx != 0 ? sx : 1, sy)
                        } else { emit("clank", e.x, e.y) }
                    }
                }
                continue
            }
            let pch = tileAt(s, tx, ty)
            if (pch == 35 || pch == 67 || isSolidTile(pch)) && pch != 65 {
                emit("thunk", p.x, p.y)
                projectiles.remove(at: i); continue
            }
            if p.kind == "arrow" {
                var gone = false
                var j = 0
                while j < enemies.count {
                    let e = enemies[j]; j += 1
                    if e.dead || e.hidden { continue }
                    if e.type == "wyrm" {
                        if e.open > 0 && jsHypot(e.x - p.x, e.y - p.y) < 14 {
                            e.stagger = 110; e.open = 0
                            emit("stagger", e.x, e.y)
                            say("THE WYRM STAGGERS — ITS CORE IS BARE!", 140)
                            gone = true; break
                        }
                        continue
                    }
                    if e.type == "husk" {
                        let fromFront = (p.vx * e.fx + p.vy * e.fy) > 0
                        if fromFront && jsHypot(e.x - p.x, e.y - p.y) < 12 { emit("clank", e.x, e.y); gone = true; break }
                    }
                    if abs(e.x - p.x) < (e.w + 4) / 2 && abs(e.y - p.y) < (e.h + 4) / 2 {
                        hurtEnemy(e, 1, jsSign(p.vx), jsSign(p.vy))
                        gone = true; break
                    }
                }
                if gone { projectiles.remove(at: i); continue }
            } else {
                let h = hero
                if jsHypot(h.x - p.x, h.y - p.y) < 9 {
                    if items.shield {
                        let (dx, dy) = h.dir.v
                        if p.vx * -dx + p.vy * -dy < 0 { emit("clank", p.x, p.y); projectiles.remove(at: i); continue }
                    }
                    hurtHero(1)
                    projectiles.remove(at: i); continue
                }
            }
            if p.x < 0 || p.y < 0 || p.x >= Double(SW * TS) || p.y >= Double(SH * TS) { projectiles.remove(at: i) }
        }
    }

    func stepBombs() {
        let s = scr
        var i = bombs.count - 1
        while i >= 0 {
            defer { i -= 1 }
            let b = bombs[i]
            b.fuse -= 1
            if b.fuse > 0 { continue }
            bombs.remove(at: i)
            emit("boom", b.x, b.y)
            hitStop = max(hitStop, 4)
            for ty in tileOf(b.y - 24)...tileOf(b.y + 24) {
                for tx in tileOf(b.x - 24)...tileOf(b.x + 24) {
                    if jsHypot(Double(tx * TS + 8) - b.x, Double(ty * TS + 8) - b.y) > 28 { continue }
                    if let c = crackAt(s, tx, ty), !(flags.cracked[c.id] ?? false) {
                        flags.cracked[c.id] = true
                        let cx = Double(tx * TS + 8), cy = Double(ty * TS + 8)
                        emit("crack", cx, cy)
                        switch c.reveal {
                        case "embers": for _ in 0..<(c.amount ?? 0) { spawnDrop(cx, cy, "ember") }
                        case "bow": grant("bow")
                        case "heart": grant("heart")
                        case "arrows": grant("arrows")
                        case "cinderstep": grant("cinderstep")
                        default: break
                        }
                    }
                }
            }
            var j = 0
            while j < enemies.count {
                let e = enemies[j]; j += 1
                if e.dead || e.hidden { continue }
                if jsHypot(e.x - b.x, e.y - b.y) < 30 {
                    let sx = jsSign(e.x - b.x)
                    hurtEnemy(e, e.boss != 0 ? 2 : 3, sx != 0 ? sx : 1, jsSign(e.y - b.y))
                }
            }
        }
    }

    func tryPush(_ lx: Double, _ ly: Double) {
        let dx = jsSign(lx), dy = jsSign(ly)
        let hx = hero.x + dx * 8, hy = hero.y + dy * 8
        let tx = tileOf(hx + dx * 4), ty = tileOf(hy + dy * 4)
        for b in blocks {
            if b.cool > 0 { continue }
            if b.x == tx && b.y == ty {
                let nx = b.x + Int(dx), ny = b.y + Int(dy)
                let s = scr
                let c = tileAt(s, nx, ny)
                let free = c == 46 && doorAt(s, nx, ny) == nil && chestAt(nx, ny) == nil && !blocked(Double(nx * TS + 8), Double(ny * TS + 8 + 4), HERO_W, HERO_H)
                if free {
                    b.x = nx; b.y = ny; b.cool = 8
                    emit("push", Double(nx * TS + 8), Double(ny * TS + 8))
                    if let plate = plateAt(s, nx, ny), !(flags.switchesOn[plate.id] ?? false) {
                        trip(plate.id, plate.opens, Double(nx * TS + 8), Double(ny * TS + 8))
                    }
                }
            }
        }
    }

    func hurtHero(_ dmg: Int) {
        let h = hero
        if h.inv > 0 { return }
        h.inv = 45; h.hurt = 12
        h.hp -= dmg
        emit("hurt", h.x, h.y)
    }

    func stepVents() {
        let s = scr
        let vents = s.vents ?? []
        if vents.isEmpty { return }
        if ventCool == nil { ventCool = [:] }
        for v in vents {
            ventCool![v.id] = (ventCool![v.id] ?? 0) - 1
            if flags.ventsOff[v.id] ?? false { continue }
            if jsHypot(hero.x - Double(v.x * TS + 8), hero.y - Double(v.y * TS + 8)) < 22 && ventCool![v.id]! <= 0 {
                ventCool![v.id] = 60
                emit("spore", Double(v.x * TS + 8), Double(v.y * TS + 8))
                hurtHero(1)
            }
        }
        if let king = enemies.first(where: { $0.type == "king" && !$0.dead }),
           king.mantle < 3 && vents.contains(where: { !(flags.ventsOff[$0.id] ?? false) }) && tick % 300 == 0 {
            king.mantle += 1
            emit("mantle", king.x, king.y)
        }
    }

    func stepNpcs() {
        let h = hero
        for n in npcs {
            if n.path.count < 2 { continue }
            if jsHypot(h.x - n.x, h.y - n.y) < NPC_HALT { n.moving = false; continue }
            if !n.moving {
                n.dwell -= 1
                if n.dwell > 0 { continue }
                n.wi = (n.wi + 1) % n.path.count
                let (tx, ty) = n.path[n.wi]
                n.wx = Double(tx * TS + 8); n.wy = Double(ty * TS + 8)
                n.moving = true
            }
            let dx = n.wx - n.x, dy = n.wy - n.y
            let d = jsHypot(dx, dy)
            if d <= NPC_SPEED {
                n.x = n.wx; n.y = n.wy
                n.moving = false
                n.dwell = NPC_DWELL + ((n.wi * 97 + Int(n.id.utf16.first ?? 0) * 31) % 3) * 40
            } else {
                let vx = (dx / d) * NPC_SPEED, vy = (dy / d) * NPC_SPEED
                if !blocked(n.x + vx, n.y, 10, 10) { n.x += vx }
                if !blocked(n.x, n.y + vy, 10, 10) { n.y += vy }
                if blocked(n.x + dx * 0.1, n.y + dy * 0.1, 10, 10) {
                    n.wi = (n.wi + 1) % n.path.count
                    let (tx, ty) = n.path[n.wi]
                    n.wx = Double(tx * TS + 8); n.wy = Double(ty * TS + 8)
                }
            }
        }
    }

    func stepEnemies() {
        let h = hero
        var idx = 0
        while idx < enemies.count {
            let e = enemies[idx]; idx += 1
            if e.dead { continue }
            e.t += 1
            if e.hitT > 0 { e.hitT -= 1; continue }
            let dx = h.x - e.x, dy = h.y - e.y
            let dist = jsHypot(dx, dy)
            let distOr1 = dist != 0 ? dist : 1

            switch e.type {
            case "cinderling":
                moveEnemy(e, dx, dy, 0.55 + 0.15 * jsSin(Double(e.t + e.seedOff) * 0.12))
            case "bat":
                let phase = (e.t + e.seedOff) % 75
                if phase < 45 { e.vx = 0; e.vy = 0 }
                else if phase == 45 { e.vx = dx / distOr1; e.vy = dy / distOr1 }
                else {
                    e.x += e.vx * 1.15; e.y += e.vy * 1.15 + jsSin(Double(e.t) * 0.5) * 0.6
                    if blocked(e.x, e.y, e.w, e.h) { e.x -= e.vx * 1.15; e.vy = 0 }
                }
            case "spitter":
                if dist > 80 { moveEnemy(e, dx, dy, 0.5) }
                else if dist < 52 { moveEnemy(e, -dx, -dy, 0.55) }
                if (e.t + e.seedOff) % 100 == 0 && dist < 120 {
                    let ax = abs(dx) > abs(dy) ? jsSign(dx) : 0
                    let ay = ax == 0 ? jsSign(dy) : 0
                    projectiles.append(Projectile("orb", e.x, e.y, ax * 1.35, ay * 1.35))
                    emit("spit", e.x, e.y)
                }
            case "husk":
                e.fx = dx / distOr1; e.fy = dy / distOr1
                if dist > 20 { moveEnemy(e, dx, dy, 0.5) }
            case "wisp":
                moveEnemy(e, dx, dy, 0.6 + 0.2 * jsSin(Double(e.t) * 0.2))
            case "sprig":
                if e.hidden { if dist < 34 { e.hidden = false; e.st = 14; emit("pop", e.x, e.y) } }
                else if e.st > 0 { e.st -= 1 }
                else if e.st == 0 && e.t % 90 < 28 { moveEnemy(e, dx, dy, 1.7) }
                else if e.t % 90 >= 28 && dist < 34 { e.st = 10 }
            case "tuskroot":
                if e.st > 0 {
                    e.st -= 1
                    if e.st == 0 { e.chx = dx / distOr1; e.chy = dy / distOr1; e.charging = 42 }
                    else if e.st == 34 { let fx = e.fx, fy = e.fy; emit("dust", e.x - e.fx * 5, e.y - e.fy * 5 + 3) { $0.dirx = -fx; $0.diry = -fy } }
                    break
                }
                if e.charging > 0 {
                    e.charging -= 1
                    let nx = e.x + e.chx * 2.7, ny = e.y + e.chy * 2.7
                    if e.charging == 0 || blocked(nx, e.y, e.w, e.h) || blocked(e.x, ny, e.w, e.h) {
                        e.charging = 0; e.rest = 55
                    } else {
                        e.fx = e.chx; e.fy = e.chy; e.x = nx; e.y = ny
                        if (e.t + e.seedOff) % 6 == 0 { let cx = e.chx, cy = e.chy; emit("dust", e.x - e.chx * 7, e.y - e.chy * 7) { $0.dirx = -cx; $0.diry = -cy } }
                    }
                    break
                }
                if e.rest > 0 { e.rest -= 1; break }
                if dist < 92 && (e.t + e.seedOff) % 80 == 0 { e.st = 36; emit("grunt", e.x, e.y); break }
                moveEnemy(e, dx, dy, 0.32)
            case "pod":
                if e.t % 70 < 26 { moveEnemy(e, dx, dy, 0.5) }
            case "maw":
                let cyc = (e.t + e.seedOff) % 220
                e.open = cyc < 80 ? 1 : 0
                let sp = e.open != 0 ? 0.35 : 1.25
                if e.vx == 0 && e.vy == 0 { e.vx = 1; e.vy = 0.8 }
                let nx = e.x + e.vx * sp, ny = e.y + e.vy * sp
                if blocked(nx, e.y, e.w, e.h) { e.vx = -e.vx }
                if blocked(e.x, ny, e.w, e.h) { e.vy = -e.vy }
                if !blocked(e.x + e.vx * sp, e.y + e.vy * sp, e.w, e.h) { e.x += e.vx * sp; e.y += e.vy * sp }
            case "wyrm":
                e.seg.insert((e.x, e.y), at: 0)
                if e.seg.count > 60 { e.seg.removeLast() }
                let cyc = (e.t + e.seedOff) % 300
                e.open = cyc >= 200 && e.stagger <= 0 ? 1 : 0
                if e.stagger > 0 { e.stagger -= 1 }
                else {
                    let chase = jsSin(Double(e.t) * 0.02) * 0.5 + 0.5
                    let wob = jsSin(Double(e.t) * 0.05)
                    let spd = 0.85
                    moveEnemy(e, dx / distOr1 * chase + wob * 0.8, dy / distOr1 * chase + jsCos(Double(e.t) * 0.05) * 0.8, spd)
                }
            case "king":
                e.open = e.mantle <= 0 ? 1 : 0
                if e.hp <= 5 && e.summoned == 0 {
                    e.summoned = 1
                    emit("roar", e.x, e.y)
                    for off in [-14.0, 14.0] {
                        let kid = Enemy(EnemyDef(type: "pod", x: 0, y: 0, i: 70 + (off < 0 ? 0 : 1), drop: nil, boss: nil, perch: nil))
                        kid.x = e.x + off; kid.y = e.y + 6; kid.t = e.t
                        if blocked(kid.x, kid.y, kid.w, kid.h) { kid.x = e.x }
                        enemies.append(kid)
                    }
                }
                if e.st > 0 {
                    e.st -= 1
                    if e.st == 0 { e.chx = dx / distOr1; e.chy = dy / distOr1; e.charging = 34 }
                    break
                }
                if e.charging > 0 {
                    e.charging -= 1
                    let nx = e.x + e.chx * 2.3, ny = e.y + e.chy * 2.3
                    if e.charging == 0 || blocked(nx, e.y, e.w, e.h) || blocked(e.x, ny, e.w, e.h) { e.charging = 0; e.rest = 50 }
                    else { e.fx = e.chx; e.fy = e.chy; e.x = nx; e.y = ny }
                    break
                }
                if e.rest > 0 { e.rest -= 1; break }
                if dist < 110 && (e.t + e.seedOff) % 110 == 0 { e.st = 30; emit("grunt", e.x, e.y); break }
                moveEnemy(e, dx, dy, 0.72)
            case "hawk":
                if e.roostSet == nil || e.roostSet == 0 {
                    e.roostSet = 1
                    e.x = e.perch[0].0; e.y = e.perch[0].1
                    e.rest = 70; e.roost = 0
                }
                if e.st > 0 {
                    e.st -= 1
                    if e.st == 0 {
                        e.lockAxis = abs(dx) >= abs(dy) ? "x" : "y"
                        let sg = e.lockAxis == "x" ? jsSign(dx) : jsSign(dy)
                        e.dirSign = sg != 0 ? sg : 1
                        e.charging = 56
                        emit("dust", e.x, e.y)
                    }
                    break
                }
                if e.charging > 0 {
                    e.charging -= 1
                    let sp = 2.4
                    let ds = e.dirSign ?? .nan
                    let nx = e.lockAxis == "x" ? e.x + ds * sp : e.x
                    let ny = e.lockAxis == "y" ? e.y + ds * sp : e.y
                    if e.charging == 0 || blocked(nx, ny, e.w, e.h) {
                        e.charging = 0
                        e.roost = (e.roost + 1) % e.perch.count
                    } else {
                        e.x = nx; e.y = ny
                        e.fx = e.lockAxis == "x" ? ds : 0
                        e.fy = e.lockAxis == "y" ? ds : 0
                    }
                    break
                }
                let p = e.perch[e.roost]
                let gx = p.0 - e.x, gy = p.1 - e.y
                let gd = jsHypot(gx, gy)
                if gd > 2.5 {
                    e.x += (gx / gd) * 1.5; e.y += (gy / gd) * 1.5
                    e.fx = gx / gd; e.fy = gy / gd
                } else {
                    e.x = p.0; e.y = p.1
                    if e.rest <= 0 { e.rest = 70 }
                    e.rest -= 1
                    if e.rest == 0 && dist < 140 { e.st = 24; emit("roar", e.x, e.y) }
                }
            default: break
            }

            // contact damage
            if !e.hidden && abs(h.x - e.x) < (HERO_W + e.w) / 2 && abs(h.y - e.y) < (HERO_H + e.h) / 2 + 2 {
                hurtHero(e.dmg)
                var l = jsHypot(dx, dy); if l == 0 { l = 1 }
                let kx = (dx / l) * 7, ky = (dy / l) * 7
                if !blocked(h.x + kx, h.y + ky, HERO_W, HERO_H) { h.x += kx; h.y += ky }
                else if !blocked(h.x + kx, h.y, HERO_W, HERO_H) { h.x += kx }
                else if !blocked(h.x, h.y + ky, HERO_W, HERO_H) { h.y += ky }
            }
        }
        if tick % 30 == 0 { enemies = enemies.filter { !$0.dead } }
    }

    func checkTransitions() {
        let s = scr
        let h = hero
        let tx = tileOf(h.x), ty = tileOf(h.y)
        if let w = warpAt(s, tx, ty) {
            if w.to.hasPrefix("d") { lastDungeonEntry[String(w.to.prefix(4))] = DungeonEntry(screen: screen, x: h.x, y: h.y) }
            spawnRoom(w.to, [w.sx, w.sy])
            emit("warp", h.x, h.y)
            return
        }
        if let dr = doorAt(s, tx, ty), let to = dr.to, doorOpen(dr) {
            if to.hasPrefix("d") { lastDungeonEntry[String(to.prefix(4))] = DungeonEntry(screen: screen, x: h.x, y: h.y) }
            spawnRoom(to, dr.entry ?? World.screens[to]!.spawn ?? [7, 8])
            emit("warp", h.x, h.y)
            return
        }
        let cx = tileOf(h.x), cy = tileOf(h.y)
        var ex: Exit? = nil
        if cy < 0 || h.y <= 8 { ex = s.exits?.n }
        else if cy >= SH || h.y >= Double(SH * TS) - 8 { ex = s.exits?.s }
        else if cx < 0 || h.x <= 8 { ex = s.exits?.w }
        else if cx >= SW || h.x >= Double(SW * TS) - 8 { ex = s.exits?.e }
        if let ex {
            spawnRoom(ex.to, nil)
            hero.x = Double(ex.x * TS) + TSD / 2
            hero.y = Double(ex.y * TS) + TSD / 2 + 4
            if ex.y == 0 { hero.y = TSD + 6 }
            if ex.y == SH - 1 { hero.y = Double((SH - 1) * TS) - 4 }
            if ex.x == 0 { hero.x = TSD + 4 }
            if ex.x == SW - 1 { hero.x = Double((SW - 1) * TS) - 4 }
            emit("warp", hero.x, hero.y)
        }
    }

    func revive() {
        death = false
        hero.hp = min(hero.max, 3)
        let m: String? = screen.hasPrefix("d3-") ? "d3-e0" : screen.hasPrefix("d2-") ? "d2-f0" : screen.hasPrefix("d1-") ? "d1-e0" : screen.hasPrefix("d4-") ? "d4-0" : nil
        if let m { spawnRoom(m, World.screens[m]!.spawn) }
        else { spawnRoom("ow-11", nil) }
        emit("revive", hero.x, hero.y)
    }

    public var menu: [Offer] { shop.id == "colporter" ? World.secretShop : World.shop }

    func stepShop(_ inp: Input) {
        let menu = self.menu
        if inp.aPressed {
            let offer = menu[shop.sel]
            if offer.item == "shield" && items.shield { say("YE ALREADY CARRY A SHIELD", 100); return }
            if offer.item == "blade" && items.blade { say("YE ALREADY CARRY THE EMBER BLADE", 100); return }
            if score >= offer.price {
                score -= offer.price
                if offer.item == "arrows" { grant("arrows"); if shop.id == "colporter" { items.arrows += 10 } }
                else if offer.item == "bombs" { grant("bombs"); items.bombs += 3 }
                else { grant(offer.item) }
                emit("buy", 0, 0)
            } else { say("NOT ENOUGH EMBERS", 90) }
        }
        if inp.bPressed || inp.startPressed { shop.open = false }
        if inp.upPressed { shop.sel = (shop.sel + menu.count - 1) % menu.count }
        if inp.downPressed { shop.sel = (shop.sel + 1) % menu.count }
    }

    // MARK: hash

    func itemBits() -> Int32 {
        (items.sword ? 1 : 0) | (items.bow ? 2 : 0) | (items.shield ? 4 : 0) | (items.bigkey ? 8 : 0) | (items.gale ? 16 : 0)
    }

    func flagBits() -> Int32 {
        var f: Int32 = 0
        // Object.keys(flags) minus killed/chestsOpen/cracked/doorsOpen/switchesOn:
        // ventsOff (an object: always truthy) + the booleans; bit = charCode % 8
        f |= 1 << (118 % 8) // 'v'entsOff
        if flags.boss1 || flags.boss2 || flags.boss3 || flags.boss4 { f |= 1 << (98 % 8) }
        if flags.emberTaken || (flags.elderGifted ?? false) { f |= 1 << (101 % 8) }
        if flags.dawnheart { f |= 1 << (100 % 8) }
        f |= Int32(truncatingIfNeeded: flags.cracked.count) << 8
        f |= Int32(truncatingIfNeeded: flags.doorsOpen.count) << 12
        f |= Int32(truncatingIfNeeded: flags.switchesOn.count) << 16
        f |= Int32(truncatingIfNeeded: flags.chestsOpen.count) << 20
        f |= Int32(truncatingIfNeeded: cut.count) << 24
        return f | (Int32(truncatingIfNeeded: items.keys) << 4)
    }

    public func hashState() -> UInt32 {
        var h = Int32(bitPattern: 2166136261)
        func mix(_ v: Int32) { h ^= v; h = h &* 16777619 }
        func mixD(_ v: Double) { mix(toInt32(v)) }
        mix(Int32(truncatingIfNeeded: tick)); mix(Int32(truncatingIfNeeded: score)); mix(Int32(truncatingIfNeeded: hero.hp)); mix(Int32(truncatingIfNeeded: hero.max))
        mix(Int32(bitPattern: seed))
        mixD(jsRound(hero.x * 4)); mixD(jsRound(hero.y * 4))
        mix(Int32(screen.utf16.reduce(0) { $0 + Int($1) }))
        mix(itemBits()); mix(flagBits())
        mixD(enemies.reduce(0.0) { $0 + Double($1.dead ? 1 : 0) * 7 + jsRound($1.x) + jsRound($1.y) * 3 })
        mixD(npcs.reduce(0.0) { $0 + jsRound($1.x) + jsRound($1.y) * 3 })
        mix(Int32(flags.ventsOff.count))
        mix(death ? 1 : 0); mix(win ? 1 : 0)
        return UInt32(bitPattern: h)
    }
}
