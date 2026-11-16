// The stage: a SpriteKit diorama over the sim, after src/games/Emberwood/render.js.
// The web draws a tilted orthographic three.js scene; here the same tilt is a
// 2.5D projection — a point at height z sits Z_TILT*z higher on screen, so
// walls show a lit top face over a shaded south face, trees and creatures are
// billboards on soft shadows, and the deep rooms are lit only by the hero's
// lantern and the torches (SKLightNode). Textures are the web's own art.js
// paint (scripts/exportart.mjs → App/Art), nearest-filtered.

import SpriteKit

let Z_TILT = 0.55
let ROOM_W = CGFloat(SW * TS), ROOM_H = CGFloat(SH * TS)

enum Tex {
    private static var cache: [String: SKTexture] = [:]
    static func get(_ name: String) -> SKTexture {
        if let t = cache[name] { return t }
        let t = SKTexture(imageNamed: name)
        t.filteringMode = .nearest
        cache[name] = t
        return t
    }
    /// a 2x-painted texture from fillRect calls (npcs, ui glyphs)
    static func paint(_ key: String, _ w: Int, _ h: Int, _ draw: (CGContext) -> Void) -> SKTexture {
        if let t = cache[key] { return t }
        let cs = CGColorSpaceCreateDeviceRGB()
        let ctx = CGContext(data: nil, width: w * 2, height: h * 2, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.interpolationQuality = .none
        ctx.translateBy(x: 0, y: CGFloat(h * 2)); ctx.scaleBy(x: 2, y: -2) // canvas coordinates: y down
        draw(ctx)
        let t = SKTexture(cgImage: ctx.makeImage()!)
        t.filteringMode = .nearest
        cache[key] = t
        return t
    }
    /// white radial falloff for additive halos (the bloom stand-in): tint with color
    static var glow: SKTexture {
        if let t = cache["glow"] { return t }
        let size = 64
        let cs = CGColorSpaceCreateDeviceRGB()
        let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        let stops: [(CGFloat, CGFloat)] = [(0, 1), (0.25, 0.55), (0.6, 0.14), (1, 0)]
        let cols = stops.map { CGColor(red: 1, green: 1, blue: 1, alpha: $0.1) } as CFArray
        let g = CGGradient(colorsSpace: cs, colors: cols, locations: stops.map(\.0))!
        let c = CGPoint(x: size / 2, y: size / 2)
        ctx.drawRadialGradient(g, startCenter: c, startRadius: 0, endCenter: c, endRadius: CGFloat(size) / 2, options: [])
        let t = SKTexture(cgImage: ctx.makeImage()!)
        cache["glow"] = t
        return t
    }
    static func soft(_ key: String, _ size: Int, _ stops: [(CGFloat, CGFloat)]) -> SKTexture {
        if let t = cache[key] { return t }
        let cs = CGColorSpaceCreateDeviceRGB()
        let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        let cols = stops.map { CGColor(red: 0, green: 0, blue: 0, alpha: $0.1) } as CFArray
        let g = CGGradient(colorsSpace: cs, colors: cols, locations: stops.map(\.0))!
        let c = CGPoint(x: size / 2, y: size / 2)
        ctx.drawRadialGradient(g, startCenter: c, startRadius: 0, endCenter: c, endRadius: CGFloat(size) / 2, options: [])
        let t = SKTexture(cgImage: ctx.makeImage()!)
        cache[key] = t
        return t
    }
}

func rgb(_ s: String) -> SKColor {
    let n = UInt32(s.dropFirst(), radix: 16) ?? 0
    return SKColor(red: CGFloat((n >> 16) & 255) / 255, green: CGFloat((n >> 8) & 255) / 255, blue: CGFloat(n & 255) / 255, alpha: 1)
}
func fill(_ g: CGContext, _ hex: String, _ x: Int, _ y: Int, _ w: Int, _ h: Int) {
    g.setFillColor(rgb(hex).cgColor); g.fill(CGRect(x: x, y: y, width: w, height: h))
}

/// npc billboards (render.js paintNpc, #968): keeper livery, the plain robe, the hooded colporter
func npcTexture(_ n: Npc) -> SKTexture {
    let key = n.id == "colporter" ? "npc:colporter" : n.kind == "shop" ? "npc:keeper" : "npc:plain"
    return Tex.paint(key, 14, 18) { g in
        if n.id == "colporter" {
            fill(g, "#463a52", 3, 6, 8, 8); fill(g, "#5c4a6a", 3, 0, 8, 6); fill(g, "#170f1b", 4, 2, 6, 4); fill(g, "#8a6a44", 8, 8, 3, 3)
        } else if n.kind == "shop" {
            fill(g, "#a04a3c", 3, 6, 8, 8); fill(g, "#e8b48a", 4, 1, 6, 5); fill(g, "#3c2c1c", 3, 0, 8, 2)
        } else {
            fill(g, "#7a6a8a", 3, 6, 8, 8); fill(g, "#e8b48a", 4, 1, 6, 5); fill(g, "#cfc8dc", 3, 0, 8, 2)
        }
    }
}

final class Stage: SKNode {
    private let ground = SKNode(), props = SKNode(), fxLayer = SKNode(), glowLayer = SKNode()
    private var glows: [SKSpriteNode] = [], glowUsed = 0
    private var torchSpots: [CGPoint] = []
    private var sig = ""
    private var dark = false
    private let lantern = SKLightNode()
    private var torches: [SKLightNode] = []
    private var lights: [SKLightNode] { [lantern] + torches }

    // dynamic sprites
    private let heroS = SKSpriteNode(), heroShadow = SKSpriteNode()
    private let arc = SKShapeNode()
    private var enemyPool: [(SKSpriteNode, SKSpriteNode)] = []
    private var tailPool: [SKSpriteNode] = []
    private var npcNodes: [String: SKSpriteNode] = [:]
    private var pool: [String: [SKSpriteNode]] = [:]
    private var poolUsed: [String: Int] = [:]
    private var blockNodes: [SKSpriteNode] = []
    private var doorNodes: [String: [SKNode]] = [:], crackNodes: [String: [SKNode]] = [:]
    private var chestNodes: [String: SKSpriteNode] = [:]
    private var ventNodes: [(Vent, SKSpriteNode)] = []
    private var brazierNodes: [SKSpriteNode] = []
    private var grassNodes: [(SKSpriteNode, CGFloat)] = []

    private struct Part { var node: SKSpriteNode; var x, y, z, vx, vy, vz: Double; var ttl, life: Int; var mote = false }
    private var parts: [Part] = []
    private(set) var shake = 0.0

    override init() {
        super.init()
        addChild(ground); addChild(props); addChild(fxLayer); addChild(glowLayer)
        ground.zPosition = -2000; fxLayer.zPosition = 3000; glowLayer.zPosition = 3500
        heroShadow.texture = Tex.soft("shadow", 32, [(0, 0.55), (0.7, 0.3), (1, 0)])
        heroShadow.size = CGSize(width: 14, height: 6)
        props.addChild(heroShadow); props.addChild(heroS)
        arc.lineWidth = 2.6; arc.lineCap = .round; arc.blendMode = .add; arc.glowWidth = 1.5
        props.addChild(arc)
        lantern.falloff = 1.4
        lantern.lightColor = SKColor(red: 1, green: 0.78, blue: 0.5, alpha: 1)
        lantern.ambientColor = SKColor(white: 0.16, alpha: 1)
        lantern.categoryBitMask = 1
        lantern.isEnabled = false
        addChild(lantern)
        for _ in 0..<4 {
            let t = SKLightNode()
            t.falloff = 2.2; t.lightColor = SKColor(red: 1, green: 0.6, blue: 0.3, alpha: 1)
            t.ambientColor = .black; t.categoryBitMask = 1; t.isEnabled = false
            torches.append(t); addChild(t)
        }
    }
    required init?(coder: NSCoder) { fatalError() }

    // world (x, y-down, height z) -> stage point
    @inline(__always) func P(_ x: Double, _ y: Double, _ z: Double = 0) -> CGPoint {
        CGPoint(x: x, y: Double(ROOM_H) - y + z * Z_TILT)
    }
    @inline(__always) func depth(_ y: Double) -> CGFloat { CGFloat(y) }

    private func lit(_ n: SKSpriteNode) { n.lightingBitMask = dark ? 1 : 0; n.shadowCastBitMask = 0 }

    private func sprite(_ tex: String, _ w: CGFloat, _ h: CGFloat) -> SKSpriteNode {
        let s = SKSpriteNode(texture: Tex.get(tex), size: CGSize(width: w, height: h))
        lit(s)
        return s
    }

    // MARK: build

    static let tileTex: [UInt8: String] = [
        ch("."): "grass", ch("\""): "tallgrass", ch(","): "path", ch("~"): "water", ch("T"): "grass", ch("#"): "stone",
        ch("a"): "ash", ch("v"): "crag", ch("="): "grass", ch("H"): "house", ch("R"): "roof", ch("I"): "grass",
        ch("C"): "stone", ch("S"): "stairs", ch("<"): "stone", ch("A"): "cinderface", ch("b"): "bridge",
    ]
    static let solidH: [UInt8: Double] = [ch("#"): 12, ch("H"): 12, ch("R"): 12, ch("="): 5, ch("v"): 12]

    func signature(_ sim: Sim) -> String {
        "\(sim.screen)|\(sim.flags.cracked.count)|\(sim.flags.doorsOpen.count)|\(sim.flags.switchesOn.count)|\(sim.flags.chestsOpen.count)|\(sim.flags.ventsOff.count)|\(sim.cut.count)|\(sim.flags.emberTaken)"
    }

    private func box(_ x: Int, _ y: Int, _ h: Double, top: String, side: String, sideTint: SKColor, into list: inout [SKNode]) {
        let px = Double(x * TS), py = Double(y * TS)
        let lift = h * Z_TILT
        let face = sprite(side, 16, CGFloat(lift))
        face.anchorPoint = .zero
        face.position = P(px, py + 16)
        face.color = sideTint; face.colorBlendFactor = 0.45
        face.zPosition = depth(py + 16) - 0.2
        let topS = sprite(top, 16, 16)
        topS.anchorPoint = .zero
        topS.position = P(px, py + 16, h)
        topS.zPosition = depth(py + 16) - 0.1
        props.addChild(face); props.addChild(topS)
        list.append(face); list.append(topS)
    }

    func build(_ sim: Sim) {
        ground.removeAllChildren(); props.removeAllChildren()
        props.addChild(heroShadow); props.addChild(heroS); props.addChild(arc)
        enemyPool = []; tailPool = []; npcNodes = [:]; pool = [:]; blockNodes = []
        doorNodes = [:]; crackNodes = [:]; chestNodes = [:]; ventNodes = []; brazierNodes = []; grassNodes = []
        let s = World.screens[sim.screen]!
        dark = s.dark
        lantern.isEnabled = dark
        lit(heroS); lit(heroShadow)
        // torches: doors, chests and two corners of a dark room (render.js buildScreen)
        var spots: [(Int, Int)] = []
        if dark {
            for d in s.doors ?? [] { spots.append((d.x, d.y == 0 ? 1 : d.y - 1)) }
            for c in s.chests ?? [] { spots.append((c.x, c.y == 0 ? 1 : c.y - 1)) }
            spots.append((2, 1)); spots.append((13, 9))
        }
        torchSpots = []
        for (i, t) in torches.enumerated() {
            if dark && i < spots.count {
                t.isEnabled = true
                t.position = P(Double(spots[i].0 * TS + 8), Double(spots[i].1 * TS + 8), 8)
                torchSpots.append(t.position)
            } else { t.isEnabled = false }
        }
        var reserved = Set<Int>()
        func res(_ x: Int, _ y: Int) { reserved.insert(y * 64 + x) }
        for d in s.doors ?? [] { res(d.x, d.y) }; for c in s.chests ?? [] { res(c.x, c.y) }
        for w in s.switches ?? [] { res(w.x, w.y) }; for p in s.plates ?? [] { res(p.x, p.y) }
        for c in s.cracks ?? [] { res(c.x, c.y) }; for n in s.npcs ?? [] { res(n.x, n.y) }
        for g in s.signs ?? [] { res(g.x, g.y) }; for w in s.warps ?? [] { res(w.x, w.y) }
        for e in s.enemies ?? [] { res(e.x, e.y) }
        if let sp = s.spawn { res(sp[0], sp[1]) }

        for y in 0..<SH {
            for x in 0..<SW {
                let c = tileAt(s, x, y)
                let px = Double(x * TS), py = Double(y * TS)
                var tex = Stage.tileTex[c] ?? "grass"
                if s.dark && tex == "grass" { tex = "floor" }
                if c == ch("\"") { tex = "grass" } // tall grass stands up as a prop over plain ground
                let g = sprite(tex, 16, 16)
                g.anchorPoint = .zero
                g.position = P(px, py + 16)
                if c == ch("~") { g.color = rgb("#9fc8e8"); g.colorBlendFactor = 0.25 }
                ground.addChild(g)
                if c == ch("\"") && !(sim.cut["\(sim.screen):\(x),\(y)"] ?? false) {
                    let tg = sprite("tallgrass", 16, 16)
                    tg.anchorPoint = CGPoint(x: 0.5, y: 0)
                    tg.position = P(px + 8, py + 15)
                    tg.zPosition = depth(py + 15)
                    props.addChild(tg)
                    grassNodes.append((tg, CGFloat(x * 7 + y * 3)))
                }
                if c == ch("T") {
                    let tr = sprite("tree", 24, 30)
                    tr.anchorPoint = CGPoint(x: 0.5, y: 0.04)
                    tr.position = P(px + 8, py + 14)
                    tr.zPosition = depth(py + 14)
                    let sh = SKSpriteNode(texture: Tex.soft("shadow", 32, [(0, 0.5), (0.7, 0.25), (1, 0)]), size: CGSize(width: 22, height: 9))
                    sh.position = P(px + 9, py + 13); sh.zPosition = -1500
                    lit(sh)
                    props.addChild(sh); props.addChild(tr)
                }
                if c == ch(".") && !s.dark {
                    let nearTree = [tileAt(s, x - 1, y), tileAt(s, x + 1, y), tileAt(s, x, y - 1), tileAt(s, x, y + 1)].contains(ch("T"))
                    if nearTree && x > 0 && y > 0 && x < SW - 1 && y < SH - 1 && !reserved.contains(y * 64 + x) && (x * 7 + y * 13) % 3 == 0 {
                        let bu = sprite("bush", 14, 10)
                        bu.anchorPoint = CGPoint(x: 0.5, y: 0.1)
                        bu.position = P(px + 8, py + 13); bu.zPosition = depth(py + 13)
                        props.addChild(bu)
                    }
                }
                if c == ch("I") {
                    let sg = sprite("sign", 16, 16)
                    sg.anchorPoint = CGPoint(x: 0.5, y: 0.05)
                    sg.position = P(px + 8, py + 14); sg.zPosition = depth(py + 14)
                    props.addChild(sg)
                }
                if c == ch("<") {
                    let pt = sprite("portal", 14, 14)
                    pt.position = P(px + 8, py + 8); pt.zPosition = -1400; pt.blendMode = .add
                    pt.run(.repeatForever(.rotate(byAngle: .pi * 2, duration: 4)))
                    props.addChild(pt)
                }
                if let h = Stage.solidH[c] {
                    let top = c == ch("#") ? "wallTop" : (c == ch("H") || c == ch("R")) ? "roof" : c == ch("=") ? "fence" : "crag"
                    let side = c == ch("#") ? "wall" : c == ch("=") ? "fence" : c == ch("v") ? "crag" : "house"
                    var l: [SKNode] = []
                    box(x, y, h, top: top, side: side, sideTint: rgb("#3a3248"), into: &l)
                } else if c == ch("A") {
                    var l: [SKNode] = []
                    box(x, y, 7, top: "cinderface", side: "cinderface", sideTint: rgb("#2a1a14"), into: &l)
                }
            }
        }
        for p in s.plates ?? [] {
            let r = sprite("plate", 14, 14); r.position = P(Double(p.x * TS + 8), Double(p.y * TS + 8)); r.zPosition = -1400
            r.color = rgb("#c9a24a"); r.colorBlendFactor = (sim.flags.switchesOn[p.id] ?? false) ? 0.8 : 0
            props.addChild(r)
        }
        for w in s.switches ?? [] {
            let on = sim.flags.switchesOn[w.id] ?? false
            let r = sprite(w.via == "gust" ? "runeGust" : "switchP", 12, 12)
            r.position = P(Double(w.x * TS + 8), Double(w.y * TS + 8), 8); r.zPosition = depth(Double(w.y * TS + 16))
            if on { r.color = rgb("#ffd27a"); r.colorBlendFactor = 0.6 }
            props.addChild(r)
        }
        for c in s.chests ?? [] {
            let cs = sprite((sim.flags.chestsOpen[c.id] ?? false) ? "chest_open" : "chest_closed", 14, 12)
            cs.anchorPoint = CGPoint(x: 0.5, y: 0.1)
            cs.position = P(Double(c.x * TS + 8), Double(c.y * TS + 14)); cs.zPosition = depth(Double(c.y * TS + 14))
            props.addChild(cs); chestNodes[c.id] = cs
        }
        for d in s.doors ?? [] where !sim.doorOpen(d) {
            var l: [SKNode] = []
            let t = d.kind == "bigkey" ? "doorBig" : d.kind == "heart" ? "doorHeart" : "door"
            box(d.x, d.y, 12, top: t, side: t, sideTint: rgb("#2a2030"), into: &l)
            doorNodes[d.id] = l
        }
        for c in s.cracks ?? [] where !(sim.flags.cracked[c.id] ?? false) {
            var l: [SKNode] = []
            box(c.x, c.y, 12, top: "crack", side: "crack", sideTint: rgb("#2a2030"), into: &l)
            crackNodes[c.id] = l
        }
        for b in s.braziers ?? [] {
            let bz = sprite("brazier_0", 12, 16)
            bz.anchorPoint = CGPoint(x: 0.5, y: 0.05)
            bz.position = P(Double(b.x * TS + 8), Double(b.y * TS + 14)); bz.zPosition = depth(Double(b.y * TS + 14))
            props.addChild(bz); brazierNodes.append(bz)
        }
        for v in s.vents ?? [] {
            let vn = sprite("vent", 14, 12)
            vn.position = P(Double(v.x * TS + 8), Double(v.y * TS + 8), 6); vn.zPosition = depth(Double(v.y * TS + 16)) + 0.1
            props.addChild(vn); ventNodes.append((v, vn))
        }
        sig = signature(sim)
        parts.forEach { $0.node.removeFromParent() }; parts = []
        flashes = []
    }

    // MARK: per-frame

    private func take(_ kind: String, _ tex: String, _ w: CGFloat, _ h: CGFloat) -> SKSpriteNode {
        var list = pool[kind] ?? []
        let i = poolUsed[kind] ?? 0
        if i >= list.count {
            let s = sprite(tex, w, h)
            props.addChild(s); list.append(s); pool[kind] = list
        }
        poolUsed[kind] = i + 1
        let s = list[i]
        s.isHidden = false
        s.texture = Tex.get(tex); s.size = CGSize(width: w, height: h)
        lit(s)
        return s
    }

    /// an additive halo at a stage point: the HD-2D bloom, done as light sprites
    private func glow(_ p: CGPoint, _ r: CGFloat, _ col: SKColor, _ a: CGFloat) {
        if glowUsed >= glows.count {
            let g = SKSpriteNode(texture: Tex.glow)
            g.blendMode = .add; g.colorBlendFactor = 1
            glowLayer.addChild(g); glows.append(g)
        }
        let g = glows[glowUsed]; glowUsed += 1
        g.isHidden = false
        g.position = p; g.size = CGSize(width: r * 2, height: r * 2)
        g.color = col; g.alpha = a
    }

    private func glows(_ sim: Sim, _ t: Double) {
        glowUsed = 0
        let warm = rgb("#ff9a3c"), gold = rgb("#ffd27a"), cyan = rgb("#8ce0ff")
        let flick = 0.85 + 0.15 * sin(t * 11) * sin(t * 7.3)
        for (i, p) in torchSpots.enumerated() { glow(p, 30, warm, CGFloat(0.46 * flick + 0.05 * sin(t * 5 + Double(i)))) }
        for bz in brazierNodes { glow(CGPoint(x: bz.position.x, y: bz.position.y + 12), 22, warm, CGFloat(0.5 * flick)) }
        if dark { glow(P(sim.hero.x, sim.hero.y, 6), 34, rgb("#ffc070"), 0.22) }
        let s = World.screens[sim.screen]!
        for v in s.vents ?? [] where !(sim.flags.ventsOff[v.id] ?? false) {
            glow(P(Double(v.x * TS + 8), Double(v.y * TS + 8), 6), 14, warm, CGFloat(0.25 + 0.2 * sin(t * 3.2 + Double(v.x))))
        }
        for y in 0..<SH { for x in 0..<SW where tileAt(s, x, y) == ch("<") { glow(P(Double(x * TS + 8), Double(y * TS + 8)), 14, cyan, CGFloat(0.3 + 0.1 * sin(t * 2))) } }
        for d in sim.drops where d.kind == "ember" { glow(P(d.x, d.y, 3), 7, gold, 0.55) }
        for p in sim.projectiles {
            if p.kind == "orb" { glow(P(p.x, p.y, 6), 9, cyan, 0.7) }
            else if p.kind == "gust" { glow(P(p.x, p.y, 6), 14, rgb("#bff2ff"), CGFloat(0.35 * min(1, Double(p.life ?? 0) / 12))) }
        }
        for b in sim.bombs where b.fuse < 30 { glow(P(b.x, b.y, 8), CGFloat(8 + (30 - b.fuse) / 3), rgb("#ff5a2a"), CGFloat(0.25 + 0.35 * Double((b.fuse / 3) % 2))) }
        for e in sim.enemies where !e.dead && !e.hidden {
            switch e.type {
            case "wyrm": glow(P(e.x, e.y, 4), e.stagger > 0 ? 30 : 22, e.stagger > 0 ? gold : warm, e.open != 0 || e.stagger > 0 ? 0.8 : 0.32)
            case "king": glow(P(e.x, e.y, 4), e.mantle <= 0 ? 26 : 16, e.mantle <= 0 ? rgb("#ffb238") : warm, e.mantle <= 0 ? CGFloat(0.55 + 0.1 * sin(t * 6)) : 0.2)
            case "maw": if e.open != 0 { glow(P(e.x, e.y, 4), 18, rgb("#c96a4a"), 0.3) }
            case "wisp": glow(P(e.x, e.y, 6), 10, cyan, 0.35)
            case "cinderling", "pod": glow(P(e.x, e.y, 3), 10, warm, 0.32)
            default: break
            }
            if e.hitT > 0 { glow(P(e.x, e.y, 4), 14, .white, CGFloat(Double(e.hitT) / 8 * 0.5)) }
        }
        if sim.arc > 0 { glow(P(sim.hero.x, sim.hero.y, 4), 16, sim.items.blade ? warm : gold, CGFloat(Double(sim.arc) / Double(ARC_DUR) * 0.3)) }
        for f in flashes { glow(f.p, f.r, f.c, CGFloat(Double(f.ttl) / Double(f.life)) * f.a) }
        flashes = flashes.compactMap { var f = $0; f.ttl -= 1; return f.ttl > 0 ? f : nil }
        for i in glowUsed..<glows.count { glows[i].isHidden = true }
    }
    private struct Flash { var p: CGPoint; var r: CGFloat; var c: SKColor; var a: CGFloat; var ttl: Int; let life: Int }
    private var flashes: [Flash] = []
    private func flash(_ x: Double, _ y: Double, _ r: CGFloat, _ c: String, _ a: CGFloat, _ ttl: Int) {
        flashes.append(Flash(p: P(x, y, 4), r: r, c: rgb(c), a: a, ttl: ttl, life: ttl))
    }

    func sync(_ sim: Sim, _ t: Double) {
        if signature(sim) != sig { build(sim) }
        for k in poolUsed.keys { poolUsed[k] = 0 }
        glows(sim, t)
        let anim = Int(t * 7) % 2
        let h = sim.hero

        // hero
        let pose = sim.swing > 0 ? "slash" : sim.drawing ? "draw" : (sim.moving ?? false) ? "w\(anim + 1)" : "w1"
        heroS.texture = Tex.get("hero_\(h.dir.rawValue)_\(pose)")
        heroS.size = CGSize(width: 16, height: 18)
        heroS.anchorPoint = CGPoint(x: 0.5, y: 0.12)
        heroS.position = P(h.x, h.y + 4)
        heroS.zPosition = depth(h.y + 4)
        let flick = h.hurt > 0 && Int(t * 14) % 2 == 0
        heroS.color = flick ? rgb("#ff5c5c") : .white
        heroS.colorBlendFactor = flick ? 0.8 : 0
        heroS.alpha = h.inv > 0 && Int(t * 20) % 2 == 0 ? 0.55 : 1
        heroShadow.position = P(h.x, h.y + 4)
        heroShadow.zPosition = -1500
        lantern.position = P(h.x, h.y, 10)

        // swipe arc (render.js arcMesh): a crescent sweeping past the blade
        if sim.arc > 0 {
            let af = Double(sim.arc) / Double(ARC_DUR)
            let (vx, vy) = sim.arcDir == .up ? (0.0, -1.0) : sim.arcDir == .down ? (0, 1) : sim.arcDir == .left ? (-1, 0) : (1, 0)
            let base = atan2(-vy, vx)
            let sweep = (0.5 - af) * 0.9
            let path = CGMutablePath()
            let r = 11 * (0.82 + (1 - af) * 0.4)
            path.addArc(center: .zero, radius: r, startAngle: base - 1.0 + sweep, endAngle: base + 1.0 + sweep, clockwise: false)
            arc.path = path
            arc.position = P(h.x, h.y, 4)
            arc.zPosition = depth(h.y + 6)
            arc.strokeColor = sim.items.blade ? SKColor(red: 1, green: 0.62, blue: 0.3, alpha: af) : SKColor(red: 1, green: 0.95, blue: 0.75, alpha: af)
            arc.isHidden = false
        } else { arc.isHidden = true }

        // enemies
        while enemyPool.count < sim.enemies.count {
            let s = sprite("cinder_0", 14, 14)
            let sh = SKSpriteNode(texture: Tex.soft("shadow", 32, [(0, 0.5), (0.7, 0.28), (1, 0)]), size: CGSize(width: 12, height: 5))
            lit(sh)
            props.addChild(sh); props.addChild(s)
            enemyPool.append((s, sh))
        }
        for (i, (s, sh)) in enemyPool.enumerated() {
            guard i < sim.enemies.count, !sim.enemies[i].dead, !sim.enemies[i].hidden else { s.isHidden = true; sh.isHidden = true; continue }
            let e = sim.enemies[i]
            s.isHidden = false; sh.isHidden = false
            var key: String, sz = CGSize(width: 14, height: 14), lift = 0.0
            switch e.type {
            case "bat": key = "bat_\(anim)"; sz = CGSize(width: 14, height: 10); lift = 6
            case "spitter": key = "spitter_\(e.t % 60 < 8 ? 1 : 0)"
            case "husk": key = "husk_\(anim)"; sz = CGSize(width: 16, height: 16)
            case "wisp": key = "wisp_\(anim)"; sz = CGSize(width: 12, height: 12); lift = 6
            case "sprig": key = "sprig_1"; sz = CGSize(width: 12, height: 14)
            case "tuskroot": key = "tuskroot_\(e.charging > 0 ? 3 : e.st > 0 ? 2 : anim)"; sz = CGSize(width: 16, height: 16)
            case "pod": key = "pod_\(e.t % 70 < 26 ? 1 : 0)"; sz = CGSize(width: 12, height: 12)
            case "maw": key = "maw_\(e.open != 0 ? "open" : "closed")"; sz = CGSize(width: 28, height: 28)
            case "wyrm": key = "wyrm_\(e.open != 0 ? "open" : "closed")"; sz = CGSize(width: 24, height: 20)
            case "king": key = "king_\(e.mantle <= 0 ? "core" : (e.t % 30 < 15 ? "mantle0" : "mantle1"))"; sz = CGSize(width: 28, height: 28)
            case "hawk": key = "hawk_\(e.charging > 0 ? "stoop" : e.st > 0 ? "call" : e.rest > 0 ? "perch" : "glide")"; sz = CGSize(width: 22, height: 18); lift = e.rest <= 0 ? 5 : 0
            default: key = "cinder_\(anim)"
            }
            s.texture = Tex.get(key); s.size = sz
            s.anchorPoint = CGPoint(x: 0.5, y: 0.2)
            s.position = P(e.x, e.y + 3, lift)
            s.zPosition = depth(e.y + 3)
            s.xScale = e.fx > 0.1 ? -1 : 1
            s.colorBlendFactor = e.hitT > 0 ? 0.85 : (e.stagger > 0 ? 0.4 : 0)
            s.color = e.hitT > 0 ? .white : rgb("#ffb238")
            s.alpha = e.type == "wisp" ? 0.65 + 0.3 * sin(t * 6 + Double(e.i ?? 0)) : 1
            lit(s)
            sh.position = P(e.x, e.y + 4); sh.zPosition = -1500
            sh.setScale(e.boss != 0 ? 2 : 1)
        }
        // the Cinder Wyrm's tail (#888): plates along the spine, every 3rd point
        let wyrm = sim.enemies.first { $0.type == "wyrm" && !$0.dead }
        let segs = wyrm.map { w in stride(from: 3, to: w.seg.count, by: 3).map { w.seg[$0] } } ?? []
        while tailPool.count < segs.count { let p = sprite("wyrm_seg", 14, 14); props.addChild(p); tailPool.append(p) }
        for (i, p) in tailPool.enumerated() {
            guard i < segs.count, let w = wyrm else { p.isHidden = true; continue }
            p.isHidden = false
            let (sx, sy) = segs[i]
            let k = 1 - Double(i) / Double(max(1, segs.count)) * 0.55
            p.texture = Tex.get(i % 2 == 0 ? "wyrm_seg" : "wyrm_segB")
            p.size = CGSize(width: 14 * k, height: 14 * k)
            p.position = P(sx, sy + 2, 2)
            p.zPosition = depth(sy) - 0.5 - CGFloat(i) * 0.01
            p.colorBlendFactor = w.hitT > 0 ? 0.85 : (w.stagger > 0 ? 0.4 : 0)
            p.color = w.hitT > 0 ? .white : rgb("#ffb238")
            lit(p)
        }

        // npcs: keep facing the hero, breathe
        for n in sim.npcs {
            let node: SKSpriteNode
            if let ex = npcNodes[n.id] { node = ex } else {
                node = SKSpriteNode(texture: npcTexture(n), size: CGSize(width: 14, height: 18))
                node.anchorPoint = CGPoint(x: 0.5, y: 0.05); lit(node)
                props.addChild(node); npcNodes[n.id] = node
            }
            let hidden = n.requires.map { r in !(r == "blade" ? sim.items.blade : false) } ?? false
            node.alpha = hidden ? 0.55 : 1 // the colporter keeps his hood up until you carry the blade
            node.position = P(n.x, n.y + 6)
            node.zPosition = depth(n.y + 6)
            if abs(h.x - n.x) > 12 { node.xScale = h.x > n.x ? 1 : -1 }
            node.yScale = 1 + 0.035 * sin(t * 2 + Double(n.id.count))
        }

        // blocks
        while blockNodes.count < sim.blocks.count { let b = sprite("rock", 16, 16); props.addChild(b); blockNodes.append(b) }
        for (i, b) in blockNodes.enumerated() {
            guard i < sim.blocks.count else { b.isHidden = true; continue }
            let bl = sim.blocks[i]
            b.isHidden = false
            b.anchorPoint = .zero
            b.position = P(Double(bl.x * TS), Double(bl.y * TS + 16), 6)
            b.zPosition = depth(Double(bl.y * TS + 16))
        }

        // drops, bombs, projectiles
        for d in sim.drops {
            let (tex, w, hh): (String, CGFloat, CGFloat) = d.kind == "ember" ? ("ember_\((d.t / 8) % 2)", 8, 8) : d.kind == "heart" ? ("heart", 10, 9) : ("key", 10, 10)
            let s = take("drop", tex, w, hh)
            s.position = P(d.x, d.y, 3 + 1.5 * sin(Double(d.t) * 0.15))
            s.zPosition = depth(d.y)
            if d.kind == "ember" { s.blendMode = .alpha }
        }
        for b in sim.bombs {
            let s = take("bomb", "bomb", 10, 12)
            s.position = P(b.x, b.y, 3)
            s.zPosition = depth(b.y)
            let hot = b.fuse < 24 && (b.fuse / 3) % 2 == 0
            s.color = .red; s.colorBlendFactor = hot ? 0.7 : 0
        }
        for p in sim.projectiles {
            let s: SKSpriteNode
            if p.kind == "arrow" {
                s = take("arrow", "arrow", 12, 4)
                s.zRotation = atan2(-p.vy, p.vx)
            } else if p.kind == "gust" {
                s = take("gust", "gust", 16, 16)
                s.alpha = CGFloat(min(1, Double(p.life ?? 0) / 12)); s.blendMode = .add
                s.zRotation = CGFloat(t * 8)
            } else {
                s = take("orb", "orb", 8, 8); s.blendMode = .add
            }
            s.position = P(p.x, p.y, 6)
            s.zPosition = depth(p.y) + 1
        }
        for (k, list) in pool { for (i, s) in list.enumerated() where i >= (poolUsed[k] ?? 0) { s.isHidden = true } }

        for (i, bz) in brazierNodes.enumerated() { bz.texture = Tex.get("brazier_\((anim + i) % 2)") }
        for (v, vn) in ventNodes {
            let off = sim.flags.ventsOff[v.id] ?? false
            vn.texture = Tex.get(off ? "ventSealed" : "vent")
            if off { vn.colorBlendFactor = 0 } else {
                let k = 0.5 + 0.5 * sin(t * 3.2 + Double(v.x) * 0.13)
                vn.color = SKColor(red: 1, green: 0.5 + 0.3 * k, blue: 0.2, alpha: 1); vn.colorBlendFactor = 0.5
            }
        }
        for (g, ph) in grassNodes { g.zRotation = CGFloat(0.06 * sin(t * 2.2 + Double(ph) * 0.4)) }

        // particles
        var i = 0
        while i < parts.count {
            var p = parts[i]
            p.ttl -= 1
            if p.ttl <= 0 { p.node.removeFromParent(); parts.remove(at: i); continue }
            p.x += p.vx; p.y += p.vy; p.z += p.vz
            if p.mote { p.vz = 0.12 } else { p.vz -= 0.18; if p.z < 0 { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6 } }
            p.node.position = P(p.x, p.y, p.z)
            p.node.alpha = CGFloat(min(1, Double(p.ttl) / Double(max(1, p.life)) * 1.6))
            parts[i] = p
            i += 1
        }
        if shake > 0.2 {
            position = CGPoint(x: Double.random(in: -0.5...0.5) * shake, y: Double.random(in: -0.5...0.5) * shake)
            shake *= 0.82
        } else { position = .zero }
    }

    // MARK: fx → particles + shake (render.js onFx)

    private func spawn(_ x: Double, _ y: Double, _ cols: [String], _ n: Int, _ sp: Double = 2.2, _ up: Double = 1.6) {
        for k in 0..<n {
            let node = SKSpriteNode(color: rgb(cols[k % cols.count]), size: CGSize(width: 1.6, height: 1.6))
            node.blendMode = .add
            fxLayer.addChild(node)
            let a = Double.random(in: 0..<(2 * .pi)), v = Double.random(in: 0.3...1) * sp * 0.5
            let life = Int.random(in: 18...34)
            parts.append(Part(node: node, x: x, y: y, z: 4, vx: cos(a) * v, vy: sin(a) * v * 0.7, vz: Double.random(in: 0.4...1) * up, ttl: life, life: life))
        }
        if parts.count > 600 { let drop = parts.prefix(parts.count - 600); drop.forEach { $0.node.removeFromParent() }; parts.removeFirst(parts.count - 600) }
    }

    func onFx(_ list: [FX]) {
        for e in list {
            switch e.k {
            case "sword":
                let (dx, dy) = e.dir == .left ? (-8.0, 0.0) : e.dir == .right ? (8, 0) : e.dir == .up ? (0, -8) : (0, 8)
                spawn(e.x + dx, e.y + dy, ["#ffffff", "#ffd87a"], 3, 1.4, 1)
            case "hit": spawn(e.x, e.y, ["#ffd27a", "#ff9a3c", "#fff3cf"], 7); shake = max(shake, 3)
            case "die": spawn(e.x, e.y, ["#8a4030", "#5c2f2f", "#c96a4a"], 12); shake = max(shake, 4); flash(e.x, e.y, e.boss != 0 ? 50 : 18, "#ff9a3c", 0.6, e.boss != 0 ? 40 : 10)
            case "cut": spawn(e.x, e.y, ["#8cc45f", "#6fae4e", "#b7e08a"], 6, 1.8, 1.2)
            case "boom": spawn(e.x, e.y, ["#ffd27a", "#ff9a3c", "#ff5a2a", "#ffe9c9"], 26, 4.5, 3); shake = max(shake, 7); flash(e.x, e.y, 44, "#ffb238", 0.9, 16)
            case "crack": spawn(e.x, e.y, ["#8d8999", "#4e4a5a", "#ffd27a"], 16, 3.5, 2.4)
            case "coin": spawn(e.x, e.y, ["#ffe08a", "#ffb238"], 4, 1.2, 1.4)
            case "heart": spawn(e.x, e.y, ["#ff8896", "#e8384a"], 5, 1.4, 1.4)
            case "key", "unlock": spawn(e.x, e.y, ["#e8c24a", "#fff3cf"], 8, 2, 1.6)
            case "switch": spawn(e.x, e.y, ["#c9a24a", "#ffe08a"], 10, 2.2, 1.8)
            case "shoot": spawn(e.x, e.y, ["#e8e2d0"], 2, 1, 0.6)
            case "spit": spawn(e.x, e.y, ["#8ce0ff", "#bff2ff", "#5d9cc4"], 4, 1.6, 1)
            case "hurt": shake = max(shake, 6)
            case "clank": spawn(e.x, e.y, ["#ffffff", "#cfd6e6"], 5, 2, 1.2)
            case "stagger": spawn(e.x, e.y, ["#ff9a3c", "#ffd27a", "#ffffff"], 22, 4, 3); shake = max(shake, 8); flash(e.x, e.y, 34, "#ffd27a", 0.8, 18)
            case "pop": spawn(e.x, e.y, ["#8cc45f", "#6fae4e", "#b7e08a"], 6, 2, 1.4)
            case "dust": spawn(e.x, e.y + 3, ["#9b8254", "#8a714a", "#6e5a3a", "#b09468"], 3, 1, 0.5)
            case "split": spawn(e.x, e.y, ["#7c3d30", "#5c2f2f", "#c9613a"], 10, 3.2, 2); spawn(e.x, e.y, ["#ff9a3c", "#ffd87a"], 6, 2, 2.4); shake = max(shake, 3)
            case "warp": spawn(e.x, e.y, ["#8ce0ff", "#bff2ff"], 12, 2.4, 2); flash(e.x, e.y, 24, "#8ce0ff", 0.6, 14)
            case "grant": spawn(e.x, e.y, ["#ffd27a", "#fff3cf", "#8ce0ff"], 14, 2.6, 2.2); flash(e.x, e.y, 30, "#fff3cf", 0.7, 30)
            case "gust", "galecharge": spawn(e.x, e.y, ["#e8f4ff", "#8ce0ff", "#bff2ff"], 8, 2.6, 1.4)
            case "seal": spawn(e.x, e.y, ["#8cc45f", "#cfd6e6", "#6fae4e"], 12, 2.4, 1.8)
            case "spore": spawn(e.x, e.y, ["#8cc45f", "#4c8438"], 6, 2, 1.2)
            case "mantle": spawn(e.x, e.y, ["#57506a", "#2c2733", "#ff7a3c"], 14, 3.2, 2.2); shake = max(shake, 5); flash(e.x, e.y, 34, "#ff7a3c", 0.7, 16)
            case "roar": spawn(e.x, e.y, ["#ff9a3c", "#ffd27a"], 18, 3.6, 2.6); shake = max(shake, 7)
            case "mote":
                let node = SKSpriteNode(color: rgb("#ffb238"), size: CGSize(width: 1.4, height: 1.4))
                node.blendMode = .add; fxLayer.addChild(node)
                parts.append(Part(node: node, x: e.x, y: e.y, z: e.z, vx: 0.05, vy: 0, vz: 0.12, ttl: 120, life: 120, mote: true))
            default: break
            }
        }
    }
}
