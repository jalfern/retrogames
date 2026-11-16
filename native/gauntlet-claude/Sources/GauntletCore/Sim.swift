// GAUNTLET — the sim, a line-for-line port of src/games/Gauntlet/sim.js (and
// viewRect/viewBounds from minimap.js, which the sim uses as a rule). The web
// game is the spec: public/traces/gauntlet-*.trace.json, every field, every
// tick. Port rules that matter here:
//  - JS `for (const m of gs.monsters)` keeps walking the ORIGINAL array when a
//    kill reassigns gs.monsters — iterate a Swift value copy, reassign freely.
//  - keys JS adds later stay optional (door.hits, item.taken, shot.done,
//    partner.stunT, partnerDone, heroHpOverride).
//  - the hash is a string (toFixed + join + FNV-1a over UTF-16), so jsToFixed.

import Foundation
import RetroKit

public struct CFG {
    public static let turn = 0.042, walk = 0.045, radius = 0.28
    public static let drainEvery = 60, foodHeal = 45, swordCool = 18
    public static let swordReach = 1.15, swordArc = 0.4
    public static let arrowCool = 22, arrowSpeed = 0.30
    public static let genHp = 10, genPulse = 36, torchReach = 11
    public static let slamClose = 40, slamForce = 2, lockForce = 1, smashForce = 2
    public static let trapDmg = 8, stunTicks = 75, stunFactor = 0.4, contactR = 0.52
    public static let monsterAtkCd = 90, castCd = 150, fireSpeed = 0.16, rockSpeed = 0.12
    public static let deathDrainEvery = 8, deathFreeze = 100, hitFlash = 12
    public static let lives = 3, extraLife = 20000, levelBonus = 1000
}

public final class Hero {
    public var x: Double, y: Double, a: Double
    public var hp: Int, maxHp: Int; public var speed: Double; public var power: Int
    public var arrowRange: Int; public var name: String, who: String
    public var deadT = 0, atkT = 0, atkAnim = 0, arrowT = 0, swingId = 0, walk = 0, hitT = 0, stunT = 0
    init(_ s: Start, _ h: HeroDef, hp: Int) {
        x = s.x; y = s.y; a = s.a; self.hp = hp; maxHp = h.hp; speed = h.speed; power = h.power
        arrowRange = h.arrow; name = h.name; who = h.who
    }
}
public final class Partner {
    public var x: Double, y: Double, a: Double, hp: Int, maxHp: Int; public var speed: Double
    public var power: Int; public var name: String; public var atkT = 0; public var down = false
    public var stunT: Int? = nil
    init(_ s: Start, _ p: HeroDef) { x = s.x; y = s.y; a = s.a; hp = p.hp; maxHp = p.hp; speed = p.speed; power = p.power; name = p.name }
}
public final class Monster {
    public let id: Int, kind: String
    public var x: Double, y: Double, hp: Int, atkT = 0, castT: Int
    public var path: [(Int, Int)] = [], repathT = 0, drainT = 0
    init(id: Int, kind: String, x: Double, y: Double, hp: Int, castT: Int) { self.id = id; self.kind = kind; self.x = x; self.y = y; self.hp = hp; self.castT = castT }
}
public final class Shot {
    public let id: Int; public let mine: Bool; public let kind: String
    public var x: Double, y: Double; public let dx: Double, dy: Double
    public var dist = 0.0; public let range: Double; public let dmg: Int
    public let overWalls: Bool? // enemy shots only
    public var done: Bool? = nil
    init(id: Int, mine: Bool, kind: String, x: Double, y: Double, dx: Double, dy: Double, range: Double, dmg: Int, overWalls: Bool?) {
        self.id = id; self.mine = mine; self.kind = kind; self.x = x; self.y = y; self.dx = dx; self.dy = dy; self.range = range; self.dmg = dmg; self.overWalls = overWalls
    }
}
public final class Item { public let id: Int, t: String; public let x: Double, y: Double; public var taken: Bool? = nil
    init(id: Int, t: String, x: Double, y: Double) { self.id = id; self.t = t; self.x = x; self.y = y } }
public final class Gen { public let id: Int; public let x: Double, y: Double; public var hp: Int, alive = true, t: Int, charge = 0
    init(id: Int, x: Double, y: Double, hp: Int, t: Int) { self.id = id; self.x = x; self.y = y; self.hp = hp; self.t = t } }
public final class Door { public let x: Int, y: Int, locked: Bool; public var open = false, broken = false, closeT = -1; public var hits: Int? = nil
    init(x: Int, y: Int, locked: Bool) { self.x = x; self.y = y; self.locked = locked } }

/// sim input (topDown): left/right/fwd/back move 8-way; aim = absolute pilot heading
public struct Input {
    public var left = false, right = false, fwd = false, back = false, sword = false, arrow = false
    public var aim: Double? = nil
    public init(left: Bool = false, right: Bool = false, fwd: Bool = false, back: Bool = false, sword: Bool = false, arrow: Bool = false, aim: Double? = nil) {
        self.left = left; self.right = right; self.fwd = fwd; self.back = back; self.sword = sword; self.arrow = arrow; self.aim = aim
    }
}

public struct Event { public let type: String; public var x = 0.0, y = 0.0; public var kind = "", target = "", t = "", text = ""; public var v = 0; public var partner = false, potion = false, hit = false; public var warp: Int? = nil; public var level = 0 }

public final class Game {
    public let seed: Int
    public let heroKey: String
    public let partnerKey: String?
    public let slack: Bool
    public var partnerOn: Bool
    public let topDown: Bool
    public var partnerHuman = false
    public var partnerMode: String? = nil
    public let levelCount: Int
    public var rng: Int32
    public var tick = 0, playT = 0, level = 0
    public var lives = CFG.lives, score = 0, gold = 0, keys = 0
    public var end: String? = nil
    public var events: [Event] = []
    var nextId = 1
    public var upTo = CFG.extraLife
    public var hero: Hero!
    public var partner: Partner? = nil
    public var monsters: [Monster] = [], shots: [Shot] = [], items: [Item] = [], gens: [Gen] = [], doors: [Door] = []
    public var smashed = Set<Int>(), revealed = Set<Int>()
    var bHits: [Int: Int] = [:]
    var tele: [Int: (Double, Double)] = [:]
    public var trapCells: [(Int, Int)] = []
    var trapOpenFlag = true, trapInit = false
    var hCell: Int? = nil, pCell: Int? = nil
    public var explored: [[UInt8]]
    public var deathSpawned = false, foodWarnT = 0, deaths = 0
    var fwd = false
    public var levelData: Level!
    public var heroHpOverride: Int?? = nil // absent until the first respawn, then null
    public var partnerDone: Bool? = nil
    // planner scratch (`_`-keys on the web: never state)
    public var pHX: Double? = nil, pHY: Double? = nil, pVX: Double? = nil, pVY: Double? = nil
    public var pThreat: Int? = nil, pThreatAt: Int? = nil, pTurn: Int? = nil

    public init(seed: Int = 0, hero heroKey: String = "warrior", partner: Bool = false, partnerKey: String? = nil, topDown: Bool = false, slack: Bool = false, levelCount: Int? = nil) {
        self.seed = seed; self.heroKey = heroKey; self.partnerKey = partnerKey; self.slack = slack
        partnerOn = partner; self.topDown = topDown
        self.levelCount = levelCount ?? LEVELS.count
        rng = Int32(truncatingIfNeeded: seed)
        explored = LEVELS.map { _ in [UInt8](repeating: 0, count: W * H) }
        loadLevel(0)
    }

    // MARK: cells

    public var trapOpen: Bool {
        guard let t = levelData?.trap else { return true }
        return ((playT + t.phase) % t.period) < t.open
    }
    func resolveCell(_ base: UInt8, _ c: Int, _ r: Int) -> UInt8 {
        if base == 35 { return 35 }
        if base == ch("B") { return smashed.contains(r * W + c) ? 46 : 35 }
        if base == ch("T") { return trapOpen ? 46 : 35 }
        if base == ch("h") { return 46 }
        return base
    }
    func cellChar(_ x: Double, _ y: Double) -> UInt8 {
        let c = jsFloor(x), r = jsFloor(y)
        if c < 0 || r < 0 || c >= W || r >= H || levelData == nil { return 35 }
        return resolveCell(levelData.g[r][c], c, r)
    }
    public func logicChar(_ c: Int, _ r: Int) -> UInt8 {
        if c < 0 || r < 0 || c >= W || r >= H { return 35 }
        return resolveCell(levelData.g[r][c], c, r)
    }
    /// what the camera sees: hidden passages read as stone until revealed; open trap walls read 't'
    public func visualChar(_ c: Int, _ r: Int) -> UInt8 {
        if c < 0 || r < 0 || c >= W || r >= H { return 35 }
        let base = levelData.g[r][c]
        if base == ch("h") { return revealed.contains(r * W + c) ? 46 : 35 }
        if base == ch("B") { return smashed.contains(r * W + c) ? 46 : 35 }
        if base == ch("T") { return trapOpen ? ch("t") : 35 }
        return base
    }
    func gridAt(_ c: Int, _ r: Int) -> UInt8? { (r >= 0 && r < H) ? (c >= 0 && c < W ? levelData.g[r][c] : nil) : nil }
    public func doorAt(_ c: Int, _ r: Int) -> Door? { doors.first { $0.x == c && $0.y == r } }

    public func blocked(_ x: Double, _ y: Double) -> Bool {
        let c = cellChar(x, y)
        if c == 35 { return true }
        if c == ch("D") || c == ch("L") {
            let d = doorAt(jsFloor(x), jsFloor(y))
            return d != nil && !d!.open && !d!.broken
        }
        return false
    }
    func walkable(_ c: Int, _ r: Int) -> Bool {
        let g = levelData.g[r][c]
        if g == 35 { return false }
        if g == ch("D") || g == ch("L") { let d = doorAt(c, r); return d != nil && (d!.open || d!.broken) }
        return true
    }

    // MARK: setup

    public func loadLevel(_ idx: Int) {
        let lv = LEVELS[idx]
        level = idx
        levelData = lv
        smashed = []
        bHits = [:]
        trapInit = true
        trapCells = []
        for r in 0..<H { for c in 0..<W where lv.g[r][c] == ch("T") { trapCells.append((c, r)) } }
        tele = [:]
        for t in lv.tele { tele[t[1] * W + t[0]] = (Double(t[2]) + 0.5, Double(t[3]) + 0.5) }
        hCell = nil; pCell = nil
        trapOpenFlag = trapOpen
        doors = lv.doors.map { Door(x: $0.x, y: $0.y, locked: $0.lock != nil) }
        items = []; gens = []; monsters = []; shots = []
        deathSpawned = false
        playT = 0
        var foodCut = slack ? 1 : 0, potionCut = slack ? 1 : 0
        for p in lv.props {
            if p.t == "food" && foodCut > 0 { foodCut -= 1; continue }
            if p.t == "potion" && potionCut > 0 { potionCut -= 1; continue }
            if p.t == "generator" { gens.append(Gen(id: nextId, x: p.x, y: p.y, hp: CFG.genHp, t: lv.gen.every / 2)); nextId += 1; continue }
            if MONSTERS[p.t] != nil { spawnMonster(p.t, p.x, p.y); continue }
            items.append(Item(id: nextId, t: p.t, x: p.x, y: p.y)); nextId += 1
        }
        let h = HEROES[heroKey]!
        let hp: Int
        if let o = heroHpOverride, let v = o { hp = v } else { hp = h.hp }
        hero = Hero(lv.start, h, hp: hp)
        if partnerOn && !(partnerDone ?? false) {
            let p = partnerKey == "valkyrie" && heroKey == "valkyrie" ? HEROES["warrior"]! : HEROES[partnerKey ?? "valkyrie"]!
            partner = Partner(lv.start, p)
        } else { partner = nil }
        markExplored()
    }

    func spawnMonster(_ kind: String, _ x: Double, _ y: Double) {
        let m = MONSTERS[kind]!
        monsters.append(Monster(id: nextId, kind: kind, x: x, y: y, hp: m.hp, castT: tick % 60))
        nextId += 1
    }

    func addScore(_ pts: Int, _ kind: String? = nil) {
        score += pts
        if score >= upTo { lives += 1; upTo += CFG.extraLife; events.append(Event(type: "1up")) }
        if let k = kind { var e = Event(type: "score"); e.v = pts; e.kind = k; events.append(e) }
    }
    func say(_ text: String) { var e = Event(type: "say"); e.text = text; events.append(e) }
    func ev(_ type: String, _ f: (inout Event) -> Void = { _ in }) { var e = Event(type: type); f(&e); events.append(e) }

    func markExplored() {
        let hc = jsFloor(hero.x), hr = jsFloor(hero.y)
        for r in (hr - 2)...(hr + 2) {
            for c in (hc - 2)...(hc + 2) {
                if c < 0 || r < 0 || c >= W || r >= H { continue }
                explored[level][r * W + c] = 1
                if abs(c - hc) <= 1 && abs(r - hr) <= 1 && levelData.g[r][c] == ch("h") { revealed.insert(r * W + c) }
            }
        }
    }

    // MARK: hero

    func killHero(_ how: String) {
        if hero.deadT > 0 || end != nil { return }
        hero.deadT = CFG.deathFreeze
        lives -= 1
        deaths += 1
        say("\(hero.who) IS DEAD")
        ev("death") { $0.kind = how; $0.v = self.lives }
    }

    func losClear(_ x0: Double, _ y0: Double, _ x1: Double, _ y1: Double) -> Bool {
        let d = jsHypot(x1 - x0, y1 - y0)
        let steps = Int((d / 0.25).rounded(.up))
        if steps > 1 { for i in 1..<steps {
            let t = Double(i) / Double(steps)
            if cellChar(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) == 35 { return false }
        } }
        return true
    }

    func moveHero(_ ux: Double, _ uy: Double, _ sp: Double) {
        let h = hero!, R = CFG.radius
        func stone(_ x: Double, _ y: Double) -> Bool { cellChar(x, y) == 35 }
        let nx = h.x + ux * sp, ny = h.y + uy * sp
        let sx = jsSign(ux), sy = jsSign(uy)
        let okX = !stone(nx + sx * R, ny) && (sy == 0 || !stone(nx + sx * R, h.y))
        let okY = !stone(nx, ny + sy * R) && (sx == 0 || !stone(h.x, ny + sy * R))
        var mx = okX ? nx : h.x
        var my = okY ? ny : h.y
        let cc = jsFloor(mx), cr = jsFloor(my)
        let oc = jsFloor(h.x), or_ = jsFloor(h.y)
        if cc != oc || cr != or_, cr >= 0, cr < H {
            let g = cc >= 0 && cc < W ? levelData.g[cr][cc] : 0
            if g == ch("D") || g == ch("L") {
                if !tryDoors(mx, my) {
                    if cc != oc { mx = h.x }
                    if cr != or_ { my = h.y }
                }
            }
        }
        h.x = mx; h.y = my
    }

    func heroHits() {
        let h = hero!
        h.atkAnim = CFG.swordCool
        var hitAny = false
        for m in monsters {
            let dx = m.x - h.x, dy = m.y - h.y
            let d = jsHypot(dx, dy)
            if d > CFG.swordReach + 0.4 { continue }
            if d > 0.6 {
                let dot = (dx * jsCos(h.a) + dy * jsSin(h.a)) / d
                if dot < CFG.swordArc { continue }
                if !losClear(h.x, h.y, m.x, m.y) { continue }
            }
            damageMonster(m, h.power + 1, "sword")
            hitAny = true
        }
        for g in gens {
            if !g.alive { continue }
            let dx = g.x - h.x, dy = g.y - h.y
            let d = jsHypot(dx, dy)
            if d > CFG.swordReach + 0.3 { continue }
            let dot = (dx * jsCos(h.a) + dy * jsSin(h.a)) / (d != 0 ? d : 1)
            if dot < CFG.swordArc { continue }
            g.hp -= h.power + 2
            ev("genHit") { $0.x = g.x; $0.y = g.y }
            if g.hp <= 0 {
                g.alive = false
                let pts = 500 + level * 100
                addScore(pts, "generator")
                ev("genKill") { $0.x = g.x; $0.y = g.y; $0.v = pts }
                say("THE GENERATOR SHATTERS")
            }
            hitAny = true
        }
        smashWalls(h.x, h.y, h.a, CFG.swordArc)
        ev("sword") { $0.hit = hitAny }
    }

    static let DIRS8: [(Int, Int)] = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
    func smashWalls(_ px: Double, _ py: Double, _ pa: Double, _ arc: Double) {
        let hc = jsFloor(px), hr = jsFloor(py)
        for (dx, dy) in Game.DIRS8 {
            let c = hc + dx, r = hr + dy
            if c < 1 || r < 1 || c >= W - 1 || r >= H - 1 { continue }
            if levelData.g[r][c] != ch("B") || smashed.contains(r * W + c) { continue }
            let d = jsHypot(Double(dx), Double(dy))
            if (Double(dx) * jsCos(pa) + Double(dy) * jsSin(pa)) / d < arc { continue }
            let k = r * W + c
            bHits[k] = (bHits[k] ?? 0) + 1
            ev("wallHit") { $0.x = Double(c); $0.y = Double(r) }
            if bHits[k]! >= CFG.smashForce {
                smashed.insert(k)
                ev("wallBreak") { $0.x = Double(c); $0.y = Double(r) }
                say("THE WALL CRUMBLES")
            }
        }
    }

    func damageMonster(_ m: Monster, _ dmg: Int, _ via: String) {
        m.hp -= dmg
        ev("monsterHit") { $0.kind = m.kind; $0.t = via; $0.x = m.x; $0.y = m.y }
        if m.hp <= 0 {
            let pts = MONSTERS[m.kind]!.pts
            if pts > 0 { addScore(pts, m.kind) }
            ev("kill") { $0.kind = m.kind; $0.v = pts; $0.x = m.x; $0.y = m.y }
            monsters = monsters.filter { $0.id != m.id }
        }
    }

    func fireArrow() {
        let h = hero!
        shots.append(Shot(id: nextId, mine: true, kind: "arrow", x: h.x, y: h.y, dx: jsCos(h.a), dy: jsSin(h.a), range: Double(h.arrowRange), dmg: h.power + 1, overWalls: nil))
        nextId += 1
        ev("shoot")
    }

    func losToHero(_ x: Double, _ y: Double, _ range: Double) -> Bool {
        let h = hero!
        let dx = h.x - x, dy = h.y - y
        let d = jsHypot(dx, dy)
        if d > range { return false }
        let steps = Int((d / 0.25).rounded(.up))
        if steps > 1 { for i in 1..<steps {
            let t = Double(i) / Double(steps)
            if cellChar(x + dx * t, y + dy * t) == 35 { return false }
        } }
        return d > 1
    }

    // MARK: doors

    @discardableResult
    func tryDoors(_ nx: Double, _ ny: Double) -> Bool {
        let c = jsFloor(nx), r = jsFloor(ny)
        let g: UInt8 = (r >= 0 && r < H) ? (c >= 0 && c < W ? levelData.g[r][c] : 0) : 35
        if g != ch("D") && g != ch("L") { return true }
        guard let d = doorAt(c, r), !d.open, !d.broken else { return true }
        if g == ch("L") {
            if keys >= CFG.lockForce {
                keys -= CFG.lockForce
                d.open = true
                ev("keyUsed") { $0.x = Double(c); $0.y = Double(r) }
                say("THE LOCK YIELDS")
                return true
            }
            say("A LOCKED DOOR — FIND A KEY")
            return false
        }
        d.open = true
        d.closeT = -1
        ev("doorOpen") { $0.x = Double(c); $0.y = Double(r) }
        return true
    }

    func updateSlamDoors() {
        let hc = jsFloor(hero.x), hr = jsFloor(hero.y)
        for d in doors {
            if d.locked || d.broken { continue }
            if d.open && d.closeT < 0 && !(d.x == hc && d.y == hr) { d.closeT = CFG.slamClose }
            if d.closeT > 0 { d.closeT -= 1 }
            else if d.closeT == 0 {
                d.open = false
                d.closeT = -1
                ev("slam") { $0.x = Double(d.x); $0.y = Double(d.y) }
                say("\(hero.who): CORRIDOR SEALED BEHIND YOU!")
            }
            if !d.open && !d.locked && hero.atkAnim == CFG.swordCool {
                let dx = Double(d.x) + 0.5 - hero.x, dy = Double(d.y) + 0.5 - hero.y
                if jsHypot(dx, dy) < CFG.swordReach + 0.6 {
                    d.hits = (d.hits ?? 0) + 1
                    if d.hits! >= CFG.slamForce { d.broken = true; ev("doorSmash") { $0.x = Double(d.x); $0.y = Double(d.y) } }
                }
            }
        }
    }

    // MARK: monsters

    func bfsPath(_ sc: Int, _ sr: Int, _ tc: Int, _ tr: Int) -> [(Int, Int)] {
        if !walkable(tc, tr) { return [] }
        var prev: [Int: Int] = [:]
        var q: [(Int, Int)] = [(sr, sc)], head = 0
        var seen: Set<Int> = [sr * W + sc]
        while head < q.count {
            let (r, c) = q[head]; head += 1
            if r == tr && c == tc {
                var path: [(Int, Int)] = []
                var k = tr * W + tc
                while k != sr * W + sc {
                    path.insert((k % W, k / W), at: 0)
                    guard let p = prev[k] else { return [] }
                    k = p
                }
                return path
            }
            for (dr, dc) in [(0, 1), (0, -1), (1, 0), (-1, 0)] {
                let nr = r + dr, nc = c + dc
                let key = nr * W + nc
                if seen.contains(key) || nr < 0 || nc < 0 || nr >= H || nc >= W { continue }
                if !walkable(nc, nr) { continue }
                seen.insert(key); prev[key] = r * W + c; q.append((nr, nc))
            }
        }
        return []
    }

    func moveMonster(_ m: Monster, _ speed: Double) {
        let h = hero!
        let kind = MONSTERS[m.kind]!
        if kind.ghost {
            var dx = h.x - m.x, dy = h.y - m.y
            var d = jsHypot(dx, dy)
            if d < 0.05 { dx = jsCos(Double(tick)); dy = jsSin(Double(tick)); d = 1 }
            m.x += (dx / d) * speed
            m.y += (dy / d) * speed
            return
        }
        m.repathT -= 1
        if m.repathT <= 0 || m.path.isEmpty {
            m.path = bfsPath(jsFloor(m.x), jsFloor(m.y), jsFloor(h.x), jsFloor(h.y))
            m.repathT = 24
        }
        let (tc, tr) = m.path.first ?? (jsFloor(h.x), jsFloor(h.y))
        let tx = Double(tc) + 0.5, ty = Double(tr) + 0.5
        let dx = tx - m.x, dy = ty - m.y
        let d = jsHypot(dx, dy)
        if d < 0.08 { if !m.path.isEmpty { m.path.removeFirst() }; return }
        m.x += (dx / d) * speed
        m.y += (dy / d) * speed
    }

    func partnerTakes(_ dmg: Int) {
        guard let p = partner else { return }
        p.hp -= dmg
        if p.hp <= 0 { p.down = true; ev("partnerDown"); partnerDone = true }
    }

    func updateMonsters() {
        let h = hero!
        for m in monsters {
            let kind = MONSTERS[m.kind]!
            if m.atkT > 0 { m.atkT -= 1 }
            let speed = kind.speed * (1 + Double(level) * 0.06)
            if kind.drain ?? false {
                moveMonster(m, speed)
                let d = jsHypot(m.x - h.x, m.y - h.y)
                if d < 0.75 {
                    m.drainT += 1
                    if m.drainT % CFG.deathDrainEvery == 0 {
                        h.hp -= 1
                        ev("drain") { $0.x = m.x; $0.y = m.y }
                        if h.hp <= 0 { killHero("death"); return }
                    }
                }
                continue
            }
            moveMonster(m, speed)
            var tx = h.x, ty = h.y, target = "hero"
            if let p = partner, !p.down {
                let dp = jsHypot(m.x - p.x, m.y - p.y)
                if dp < jsHypot(m.x - h.x, m.y - h.y) { tx = p.x; ty = p.y; target = "partner" }
            }
            if m.atkT <= 0 && jsHypot(m.x - tx, m.y - ty) < CFG.contactR {
                m.atkT = CFG.monsterAtkCd
                ev("hit") { $0.kind = m.kind; $0.target = target }
                if target == "hero" {
                    h.hp -= kind.dmg
                    h.hitT = CFG.hitFlash
                    if h.hp <= 0 { killHero(m.kind); return }
                } else { partnerTakes(kind.dmg) }
            }
            if let casts = kind.casts {
                m.castT -= 1
                if m.castT <= 0 && losToHero(m.x, m.y, casts == "fire" ? 8 : 7) {
                    m.castT = CFG.castCd
                    let dx = h.x - m.x, dy = h.y - m.y
                    var d = jsHypot(dx, dy); if d == 0 { d = 1 }
                    shots.append(Shot(id: nextId, mine: false, kind: casts, x: m.x, y: m.y, dx: dx / d, dy: dy / d, range: d + 1, dmg: kind.dmg, overWalls: casts == "rock"))
                    nextId += 1
                    ev("cast") { $0.kind = casts; $0.x = m.x; $0.y = m.y }
                }
            }
        }
    }

    static func speed(_ k: String) -> Double { k == "arrow" ? CFG.arrowSpeed : k == "fire" ? CFG.fireSpeed : CFG.rockSpeed }

    func updateShots() {
        let h = hero!
        for s in shots {
            let sp = Game.speed(s.kind)
            s.x += s.dx * sp
            s.y += s.dy * sp
            s.dist += sp
            if s.dist > s.range { s.done = true; continue }
            if !(s.overWalls ?? false) && cellChar(s.x, s.y) == 35 { s.done = true; continue }
            if s.mine {
                for m in monsters where jsHypot(m.x - s.x, m.y - s.y) < 0.42 {
                    damageMonster(m, s.dmg, "arrow")
                    s.done = true
                    break
                }
                if s.done != true {
                    for g in gens where g.alive && jsHypot(g.x - s.x, g.y - s.y) < 0.5 {
                        g.hp -= s.dmg + 1
                        ev("genHit") { $0.x = g.x; $0.y = g.y }
                        if g.hp <= 0 {
                            g.alive = false
                            addScore(500 + level * 100, "generator")
                            ev("genKill") { $0.x = g.x; $0.y = g.y }
                        }
                        s.done = true
                        break
                    }
                }
            } else if h.deadT == 0 && jsHypot(h.x - s.x, h.y - s.y) < CFG.contactR {
                h.hp -= s.dmg
                h.hitT = CFG.hitFlash
                s.done = true
                ev("hit") { $0.kind = s.kind; $0.target = "hero" }
                if h.hp <= 0 { killHero(s.kind); return }
            } else if let p = partner, !p.down, jsHypot(p.x - s.x, p.y - s.y) < CFG.contactR {
                s.done = true
                partnerTakes(s.dmg)
            }
        }
        shots = shots.filter { $0.done != true }
    }

    // MARK: generators

    func rand() -> Double {
        rng = rng &+ 0x6d2b79f5
        var t = UInt32(bitPattern: rng)
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        return Double(t ^ (t >> 14)) / 4294967296
    }

    func updateGens() {
        let lv = levelData!
        for g in gens {
            if !g.alive { continue }
            if g.charge > 0 {
                g.charge -= 1
                if g.charge == 0 && monsters.count < lv.gen.cap {
                    let kind = lv.gen.comp[jsFloor(rand() * Double(lv.gen.comp.count))]
                    spawnMonster(kind, g.x, g.y)
                    ev("spawn") { $0.kind = kind; $0.x = g.x; $0.y = g.y }
                    g.t = lv.gen.every
                }
                continue
            }
            g.t -= 1
            if g.t <= 0 && monsters.count < lv.gen.cap { g.charge = CFG.genPulse }
        }
    }

    // MARK: items

    static let GOLD = [50, 100, 200, 500]

    func updateItems() {
        let h = hero!
        let pt: Partner? = partnerOn && partner != nil && !partner!.down ? partner : nil
        for it in items {
            if it.taken ?? false { continue }
            let forHero = jsHypot(it.x - h.x, it.y - h.y) <= 0.5
            let forP = pt != nil && !forHero && it.t != "potion" && jsHypot(it.x - pt!.x, it.y - pt!.y) <= 0.5
            if !forHero && !forP { continue }
            if forP && it.t == "key" {
                it.taken = true; keys += 1; addScore(200, "key")
                ev("pickup") { $0.t = "key"; $0.partner = true }
                continue
            }
            if forP && it.t == "food" {
                it.taken = true
                pt!.hp = min(pt!.maxHp, pt!.hp + CFG.foodHeal)
                addScore(500, "food")
                ev("pickup") { $0.t = "food"; $0.partner = true }
                continue
            }
            if forP {
                let v = Game.GOLD[jsFloor(rand() * 4)]
                it.taken = true; gold += v; addScore(v, "gold")
                ev("pickup") { $0.t = "gold"; $0.v = v; $0.partner = true }
                continue
            }
            it.taken = true
            if it.t == "key" {
                keys += 1; addScore(200, "key"); say("A KEY!")
                ev("pickup") { $0.t = "key" }
            } else if it.t == "food" {
                h.hp = min(h.maxHp, h.hp + CFG.foodHeal)
                addScore(500, "food"); say("\(h.who) IS RESTORED")
                ev("pickup") { $0.t = "food" }
            } else if it.t == "potion" {
                // (taken is already set: a potion grabbed while healthy and calm is spent for nothing — kept as the web has it)
                if Double(h.hp) > Double(h.maxHp) * 0.6 && monsters.filter({ !(MONSTERS[$0.kind]!.drain ?? false) }).count < 3 { continue }
                var cleared = 0
                for m in monsters.filter({ !(MONSTERS[$0.kind]!.drain ?? false) }) {
                    addScore(MONSTERS[m.kind]!.pts, m.kind)
                    ev("kill") { $0.kind = m.kind; $0.v = MONSTERS[m.kind]!.pts; $0.x = m.x; $0.y = m.y; $0.potion = true }
                    cleared += 1
                }
                monsters = monsters.filter { MONSTERS[$0.kind]!.drain ?? false }
                addScore(0)
                say("THE POTION FLARES — THE HALLS CLEAR!")
                ev("pickup") { $0.t = "potion"; $0.v = cleared }
            } else if it.t == "gold" {
                let v = Game.GOLD[jsFloor(rand() * 4)]
                gold += v; addScore(v, "gold")
                ev("pickup") { $0.t = "gold"; $0.v = v }
            }
        }
    }

    // MARK: stairs, warps, hazards

    func checkStairs() {
        let ex = levelData.exit[0], ey = levelData.exit[1]
        if jsFloor(hero.x) != ex || jsFloor(hero.y) != ey { return }
        let pts = CFG.levelBonus * (level + 1)
        addScore(pts, "levelBonus")
        ev("levelClear") { $0.level = self.level; $0.v = pts }
        if level + 1 >= levelCount {
            end = "win"
            say("THE GAUNTLET IS DONE!")
            ev("win")
            return
        }
        say(LEVELS[level + 1].name)
        if partnerHuman { partnerDone = false }
        loadLevel(level + 1)
        ev("level") { $0.level = self.level }
    }

    static let PUSH_DIRS: [(Int, Int)] = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)]
    func shoveOut(_ x: inout Double, _ y: inout Double) {
        let c = jsFloor(x), r = jsFloor(y)
        for (dx, dy) in Game.PUSH_DIRS {
            let nx = Double(c + dx) + 0.5, ny = Double(r + dy) + 0.5
            if !blocked(nx, ny) { x = nx; y = ny; return }
        }
    }

    func updateTraps() {
        guard levelData.trap != nil else { return }
        let open = trapOpen
        if trapInit { trapInit = false; trapOpenFlag = open; return }
        if open == trapOpenFlag { return }
        trapOpenFlag = open
        if open { ev("trapOpen"); return }
        ev("trapClose")
        for (c, r) in trapCells {
            let h = hero!
            if h.deadT == 0 && jsFloor(h.x) == c && jsFloor(h.y) == r {
                h.hp -= CFG.trapDmg
                h.hitT = CFG.hitFlash
                shoveOut(&h.x, &h.y)
                ev("hit") { $0.kind = "trap"; $0.target = "hero" }
                if h.hp <= 0 { killHero("trap"); return }
            }
            if let p = partner, !p.down, jsFloor(p.x) == c && jsFloor(p.y) == r {
                p.hp -= CFG.trapDmg
                shoveOut(&p.x, &p.y)
                ev("hit") { $0.kind = "trap"; $0.target = "partner" }
                if p.hp <= 0 { p.down = true; ev("partnerDown"); partnerDone = true }
            }
            for m in monsters {
                if MONSTERS[m.kind]!.ghost { continue }
                if jsFloor(m.x) == c && jsFloor(m.y) == r { shoveOut(&m.x, &m.y) }
            }
        }
    }

    func tileEffects(hero isHero: Bool) {
        let x = isHero ? hero.x : partner!.x, y = isHero ? hero.y : partner!.y
        let c = jsFloor(x), r = jsFloor(y)
        let k = r * W + c
        let prev = isHero ? hCell : pCell
        if prev == k { return }
        if isHero { hCell = k } else { pCell = k }
        let base = gridAt(c, r) ?? 35
        if base == ch("S") {
            if isHero { hero.stunT = CFG.stunTicks } else { partner!.stunT = CFG.stunTicks }
            ev("stun") { $0.target = isHero ? "hero" : "partner" }
            if isHero { say("THE FLOOR SPARKS — LEGS OF JELLY!") }
        } else if base == ch("P") {
            if let t = tele[k] {
                if isHero { hero.x = t.0; hero.y = t.1 } else { partner!.x = t.0; partner!.y = t.1 }
                ev("teleport") { $0.target = isHero ? "hero" : "partner" }
                if isHero { say("THE STONE SWALLOWS YOU!") }
            }
        }
    }

    func checkWarps() {
        for w in levelData.warps {
            if w.to >= levelCount || w.to <= level { continue }
            if jsFloor(hero.x) != w.x || jsFloor(hero.y) != w.y { continue }
            let pts = CFG.levelBonus * (level + 1)
            addScore(pts, "levelBonus")
            ev("levelClear") { $0.level = self.level; $0.v = pts; $0.warp = w.to }
            say("A WARP DOOR — \(LEVELS[w.to].name)!")
            if partnerHuman { partnerDone = false }
            loadLevel(w.to)
            ev("level") { $0.level = self.level }
            return
        }
    }

    // MARK: step

    public func step(_ inp: Input, _ partnerInp: Input? = nil) {
        tick += 1
        if end != nil { return }
        foodWarnT = max(0, foodWarnT - 1)

        let h = hero!
        if h.deadT > 0 {
            h.deadT -= 1
            if h.deadT == 0 {
                if lives <= 0 { end = "over"; ev("over"); return }
                heroHpOverride = .some(max(80, Int((Double(h.maxHp) * 0.6).rounded(.down))))
                loadLevel(level)
                heroHpOverride = .some(nil)
                ev("respawn")
            }
            return
        }

        playT += 1
        if h.stunT > 0 { h.stunT -= 1 }
        let stunMul = h.stunT > 0 ? CFG.stunFactor : 1
        let wx0 = h.x, wy0 = h.y
        if topDown {
            let vx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0)
            let vy = (inp.back ? 1 : 0) - (inp.fwd ? 1 : 0)
            let sp = CFG.walk * h.speed * stunMul
            if let aim = inp.aim {
                h.a = aim
                if inp.fwd { moveHero(jsCos(aim), jsSin(aim), sp) }
                else if inp.back { moveHero(-jsCos(aim), -jsSin(aim), sp * 0.6) }
            } else if vx != 0 || vy != 0 {
                let a = jsAtan2(Double(vy), Double(vx))
                h.a = a
                moveHero(jsCos(a), jsSin(a), sp)
            }
        } else {
            if inp.left { h.a -= CFG.turn }
            if inp.right { h.a += CFG.turn }
            var mv = 0.0
            if inp.fwd { mv = 1 } else if inp.back { mv = -0.6 }
            if mv != 0 {
                let sp = CFG.walk * h.speed * mv * stunMul
                let nx = h.x + jsCos(h.a) * sp
                let ny = h.y + jsSin(h.a) * sp
                let R = CFG.radius
                func stone(_ x: Double, _ y: Double) -> Bool { cellChar(x, y) == 35 }
                let wallHit = stone(nx + jsSign(jsCos(h.a)) * R, ny) || stone(nx, ny + jsSign(jsSin(h.a)) * R) ||
                    stone(nx + jsSign(jsCos(h.a)) * R, ny + jsSign(jsSin(h.a)) * R)
                if !wallHit {
                    let cc = jsFloor(nx), cr = jsFloor(ny)
                    let g = levelData.g[cr][cc]
                    if (g == ch("D") || g == ch("L")) && mv > 0 { if tryDoors(nx, ny) { h.x = nx; h.y = ny } }
                    else if (g == ch("D") || g == ch("L")) && mv < 0 {
                        if doors.contains(where: { $0.x == cc && $0.y == cr && ($0.open || $0.broken) }) { h.x = nx; h.y = ny }
                    } else { h.x = nx; h.y = ny }
                }
            }
        }
        if jsHypot(h.x - wx0, h.y - wy0) > 1e-6 { h.walk += 1 }
        fwd = inp.fwd
        markExplored()
        tileEffects(hero: true)

        if tick % CFG.drainEvery == 0 {
            h.hp -= 1
            if h.hp <= 0 { killHero("starved"); return }
        }
        if Double(h.hp) < Double(h.maxHp) * 0.3 && foodWarnT == 0 {
            foodWarnT = 600
            say("\(h.name) NEEDS FOOD, BADLY!")
        }

        if h.atkT > 0 { h.atkT -= 1 }
        if h.atkAnim > 0 { h.atkAnim -= 1 }
        if h.arrowT > 0 { h.arrowT -= 1 }
        if h.hitT > 0 { h.hitT -= 1 }
        if inp.sword && h.atkT <= 0 { h.atkT = CFG.swordCool; heroHits() }
        if inp.arrow && h.arrowT <= 0 { h.arrowT = CFG.arrowCool; fireArrow() }

        updateSlamDoors()
        updateTraps()
        if end != nil || hero.deadT > 0 { return }
        updateMonsters()
        if end != nil || hero.deadT > 0 { return }
        updateShots()
        if end != nil || hero.deadT > 0 { return }
        updateGens()
        updatePartner(partnerInp)
        if let p = partner, !p.down { tileEffects(hero: false) }
        clampToSharedView()
        updateItems()
        checkStairs()
        checkWarps()

        if !deathSpawned && playT >= levelData.deathAt {
            deathSpawned = true
            let corners: [(Double, Double)] = [(1.5, 1.5), (Double(W) - 1.5, 1.5), (1.5, Double(H) - 1.5), (Double(W) - 1.5, Double(H) - 1.5)]
            var best = corners[0], bd = -1.0
            for c in corners {
                let d = jsHypot(c.0 - hero.x, c.1 - hero.y)
                if d > bd { bd = d; best = c }
            }
            spawnMonster("death", best.0, best.1)
            ev("deathSpawn") { $0.x = best.0; $0.y = best.1 }
            say("DEATH WALKS THE MAZE!")
        }
    }

    func moveHuman(_ p: Partner, _ dx: Double, _ dy: Double) {
        let nx = p.x + dx, ny = p.y + dy
        if !blocked(nx, ny) { p.x = nx; p.y = ny }
        else if !blocked(nx, p.y) { p.x = nx }
        else if !blocked(p.x, ny) { p.y = ny }
    }

    /// minimap.js viewRect (pull 0) — the shared cabinet window, in px
    public static func viewRect(_ hx: Double, _ hy: Double, _ partner: Partner?) -> (camX: Double, camY: Double) {
        let p = partner != nil && !partner!.down ? partner : nil
        let ax = p != nil ? (hx + p!.x) / 2 + ((p!.x - hx) / 2) * 0 : hx
        let ay = p != nil ? (hy + p!.y) / 2 + ((p!.y - hy) / 2) * 0 : hy
        var camX = ax * PX - VW / 2
        var camY = ay * PX - VH / 2
        camX = max(0, min(Double(W) * PX - VW, camX))
        camY = max(0, min(Double(H) * PX - VH, camY))
        return (camX, camY)
    }

    func clampToSharedView() {
        if !topDown { return }
        let r = Game.viewRect(hero.x, hero.y, partner)
        let minx = r.camX / PX, miny = r.camY / PX, maxx = r.camX / PX + VWC, maxy = r.camY / PX + VHC
        func seat(_ x: inout Double, _ y: inout Double) {
            let pullX = x < minx ? minx : x > maxx ? maxx : x
            let pullY = y < miny ? miny : y > maxy ? maxy : y
            if pullX != x && !blocked(pullX, y) { x = pullX }
            if pullY != y && !blocked(x, pullY) { y = pullY }
        }
        if hero.deadT <= 0 { seat(&hero.x, &hero.y) }
        if let p = partner, !p.down { seat(&p.x, &p.y) }
    }

    func closedSlamAt(_ x: Double, _ y: Double) -> Door? {
        let c = jsFloor(x), r = jsFloor(y)
        let g: UInt8 = (r >= 0 && r < H) ? (c >= 0 && c < W ? levelData.g[r][c] : 0) : 35
        if g != ch("D") { return nil }
        guard let d = doorAt(c, r), !d.open, !d.broken, !d.locked else { return nil }
        return d
    }
    @discardableResult
    func openSlamInWay(_ p: Partner, _ ux: Double, _ uy: Double) -> Bool {
        if let here = closedSlamAt(p.x, p.y) { tryDoors(Double(here.x) + 0.5, Double(here.y) + 0.5); return true }
        if let ahead = closedSlamAt(p.x + ux, p.y + uy) { tryDoors(Double(ahead.x) + 0.5, Double(ahead.y) + 0.5); return true }
        return false
    }
    func closedDoorOnPath(_ x0: Double, _ y0: Double, _ x1: Double, _ y1: Double) -> Bool {
        let len = jsHypot(x1 - x0, y1 - y0)
        let n = max(1, Int((len / 0.2).rounded(.up)))
        if n > 1 { for i in 1..<n {
            let t = Double(i) / Double(n)
            let c = jsFloor(x0 + (x1 - x0) * t), r = jsFloor(y0 + (y1 - y0) * t)
            let g: UInt8 = (r >= 0 && r < H) ? (c >= 0 && c < W ? levelData.g[r][c] : 0) : 35
            if g == ch("D") || g == ch("L") { if let d = doorAt(c, r), !d.open && !d.broken { return true } }
        } }
        return false
    }

    func updatePartner(_ partnerInp: Input?) {
        guard let p = partner, !p.down else { return }
        if (p.stunT ?? 0) > 0 { p.stunT! -= 1 }
        let stunMul = (p.stunT ?? 0) > 0 ? CFG.stunFactor : 1
        if let pi = partnerInp {
            let sp = CFG.walk * p.speed * stunMul
            if topDown {
                let vx = (pi.right ? 1 : 0) - (pi.left ? 1 : 0)
                let vy = (pi.back ? 1 : 0) - (pi.fwd ? 1 : 0)
                if vx != 0 || vy != 0 {
                    let a = jsAtan2(Double(vy), Double(vx))
                    p.a = a
                    openSlamInWay(p, jsCos(a), jsSin(a))
                    moveHuman(p, jsCos(a) * sp, jsSin(a) * sp)
                }
            } else {
                if pi.left { p.a -= CFG.turn }
                if pi.right { p.a += CFG.turn }
                if pi.fwd { openSlamInWay(p, jsCos(p.a), jsSin(p.a)); moveHuman(p, jsCos(p.a) * sp, jsSin(p.a) * sp) }
                else if pi.back { moveHuman(p, -jsCos(p.a) * sp * 0.6, -jsSin(p.a) * sp * 0.6) }
            }
            if p.atkT > 0 { p.atkT -= 1; return }
            if pi.sword && p.atkT <= 0 {
                p.atkT = CFG.swordCool
                for m in monsters where jsHypot(m.x - p.x, m.y - p.y) < 1.25 {
                    damageMonster(m, p.power, "partner")
                    ev("partnerHit") { $0.x = p.x; $0.y = p.y }
                    break
                }
                smashWalls(p.x, p.y, p.a, 0)
            }
            return
        }
        let h = hero!
        let tx = h.x - jsCos(h.a) * 1.1
        let ty = h.y - jsSin(h.a) * 1.1
        let dx = tx - p.x, dy = ty - p.y
        let d = jsHypot(dx, dy)
        if d > 1e-6 {
            let ux = dx / d, uy = dy / d
            let sp = CFG.walk * p.speed * 1.15 * stunMul
            let nx = p.x + ux * sp, ny = p.y + uy * sp
            openSlamInWay(p, ux, uy)
            let differentCell = jsFloor(p.x) != jsFloor(tx) || jsFloor(p.y) != jsFloor(ty)
            if d > 0.5 || (differentCell && !closedDoorOnPath(p.x, p.y, tx, ty)) {
                if !blocked(nx, ny) { p.x = nx; p.y = ny }
                else if !blocked(nx, p.y) { p.x = nx }
                else if !blocked(p.x, ny) { p.y = ny }
            }
        }
        if p.atkT > 0 { p.atkT -= 1; return }
        for m in monsters where jsHypot(m.x - p.x, m.y - p.y) < 1.25 {
            p.atkT = 30
            damageMonster(m, p.power, "partner")
            ev("partnerHit") { $0.x = p.x; $0.y = p.y }
            break
        }
    }

    // MARK: hash

    public func stateHash() -> String {
        var f: UInt32 = 0x811c9dc5
        for u in hashInput().utf16 { f ^= UInt32(u); f = f &* 0x01000193 }
        return String(f, radix: 16)
    }

    /// the string sim.js stateHash feeds FNV-1a
    public func hashInput() -> String {
        let h = hero!
        var parts: [String] = [
            jsInt(tick), jsInt(level), jsInt(levelCount), jsInt(lives), jsInt(score), jsInt(keys), jsInt(gold), end ?? "-", jsInt(playT),
            jsToFixed(h.x, 2), jsToFixed(h.y, 2), jsToFixed(h.a, 3), jsInt(h.hp), jsInt(h.deadT), jsInt(h.stunT),
            trapOpenFlag ? "1" : "0",
            smashed.sorted().map(String.init).joined(separator: ","),
            revealed.sorted().map(String.init).joined(separator: ","),
            deathSpawned ? "1" : "0",
            explored.map { String($0.reduce(0) { $0 + Int($1) }) }.joined(separator: ","),
        ]
        parts += items.map { "\($0.t)\(jsToFixed($0.x, 1)),\(jsToFixed($0.y, 1))\(($0.taken ?? false) ? "T" : "")" }
        parts += gens.map { "\($0.id)\($0.alive ? 1 : 0)\($0.hp)" }
        parts += doors.map { "\($0.x),\($0.y)\($0.open ? "O" : "")\($0.broken ? "B" : "")" }
        parts += monsters.map { "\($0.id)\($0.kind)\(jsToFixed($0.x, 2)),\(jsToFixed($0.y, 2)),h\($0.hp)" }
        parts += shots.map { "\($0.id)\($0.kind)\(jsToFixed($0.x, 2)),\(jsToFixed($0.y, 2))" }
        return parts.joined(separator: "|")
    }
}
