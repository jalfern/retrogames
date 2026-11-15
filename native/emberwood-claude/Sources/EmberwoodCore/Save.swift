// saveState / loadState from sim.js (#952 "the vale remembers"): plain fields
// only — the rng is rebuilt from the seed, enemies respawn on load exactly as
// on re-entry, pushed blocks and strolling townsfolk resume where they stood.
import Foundation

public struct SaveData: Codable {
    public struct H: Codable { var x, y: Double; var dir: String; var hp, max, inv, hurt: Int }
    public struct I: Codable { var sword, bow, shield, blade, gale, step: Bool; var bombs, arrows, potions, keys: Int; var bigkey: Bool }
    public struct F: Codable {
        var cracked, doorsOpen, switchesOn, chestsOpen, ventsOff, killed: [String: Bool]
        var boss1, boss2, boss3, boss4, emberTaken, dawnheart, elderGifted: Bool
    }
    public struct E: Codable { var screen: String; var x, y: Double }
    public struct B: Codable { var id: String; var x, y: Int }
    public struct N: Codable { var id: String; var x, y: Double; var wi, dwell: Int }
    var v = 1
    var seed: UInt32, tick: Int, screen: String
    var hero: H, items: I, score: Int, flags: F
    var cut: [String: Bool], lastDungeonEntry: [String: E]
    var blocks: [B], npcs: [N], win: Bool
}

public extension Sim {
    func save() -> SaveData {
        let f = flags, it = items
        return SaveData(
            seed: seed, tick: tick, screen: screen,
            hero: .init(x: hero.x, y: hero.y, dir: hero.dir.rawValue, hp: hero.hp, max: hero.max, inv: hero.inv, hurt: hero.hurt),
            items: .init(sword: it.sword, bow: it.bow, shield: it.shield, blade: it.blade, gale: it.gale, step: it.step,
                         bombs: it.bombs, arrows: it.arrows, potions: it.potions, keys: it.keys, bigkey: it.bigkey),
            score: score,
            flags: .init(cracked: f.cracked, doorsOpen: f.doorsOpen, switchesOn: f.switchesOn, chestsOpen: f.chestsOpen,
                         ventsOff: f.ventsOff, killed: f.killed, boss1: f.boss1, boss2: f.boss2, boss3: f.boss3, boss4: f.boss4,
                         emberTaken: f.emberTaken, dawnheart: f.dawnheart, elderGifted: f.elderGifted ?? false),
            cut: cut, lastDungeonEntry: lastDungeonEntry.mapValues { .init(screen: $0.screen, x: $0.x, y: $0.y) },
            blocks: blocks.map { .init(id: $0.id, x: $0.x, y: $0.y) },
            npcs: npcs.map { .init(id: $0.id, x: $0.x, y: $0.y, wi: $0.wi, dwell: $0.dwell) },
            win: win)
    }

    static func load(_ d: SaveData) -> Sim? {
        guard d.v == 1, World.screens[d.screen] != nil else { return nil }
        let s = Sim(seed: d.seed)
        s.tick = d.tick
        let i = d.items
        s.items.sword = i.sword; s.items.bow = i.bow; s.items.shield = i.shield; s.items.blade = i.blade
        s.items.gale = i.gale; s.items.step = i.step; s.items.bombs = i.bombs; s.items.arrows = i.arrows
        s.items.potions = i.potions; s.items.keys = i.keys; s.items.bigkey = i.bigkey
        let f = d.flags
        s.flags.cracked = f.cracked; s.flags.doorsOpen = f.doorsOpen; s.flags.switchesOn = f.switchesOn
        s.flags.chestsOpen = f.chestsOpen; s.flags.ventsOff = f.ventsOff; s.flags.killed = f.killed
        s.flags.boss1 = f.boss1; s.flags.boss2 = f.boss2; s.flags.boss3 = f.boss3; s.flags.boss4 = f.boss4
        s.flags.emberTaken = f.emberTaken; s.flags.dawnheart = f.dawnheart; s.flags.elderGifted = f.elderGifted
        s.cut = d.cut
        for (k, e) in d.lastDungeonEntry { s.lastDungeonEntry[k] = DungeonEntry(screen: e.screen, x: e.x, y: e.y) }
        s.score = d.score
        s.win = d.win
        s.spawnRoom(d.screen, nil)
        for sb in d.blocks { if let b = s.blocks.first(where: { $0.id == sb.id }) { b.x = sb.x; b.y = sb.y } }
        for sn in d.npcs { if let n = s.npcs.first(where: { $0.id == sn.id }) { n.x = sn.x; n.y = sn.y; n.wi = sn.wi; n.dwell = sn.dwell } }
        let h = d.hero
        s.hero.x = h.x; s.hero.y = h.y; s.hero.dir = Dir(rawValue: h.dir) ?? .up
        s.hero.hp = h.hp; s.hero.max = h.max; s.hero.inv = h.inv; s.hero.hurt = h.hurt
        return s
    }
}
