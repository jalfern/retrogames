// The cabinet view, ported from src/games/Gauntlet/index.jsx drawView /
// drawPanel / draw onto a 320x240 framebuffer: the overhead maze (256x200,
// camera = the sim's own shared viewRect), the torch-lit two-tone brick
// courses, floor grain, doors, stairs, warp arches, teleport swirls, stun and
// trap floors, items, pulsing generators, shots, beasts, both heroes with the
// facing dagger and the sword's light-arc trail, then the vignette, low-HP
// throb and Death's green flush; the side panel (explored map, portrait,
// health, keys, gold, the 2P card) and the HUD band (hall, 1UP, HI, lives).

import Foundation
import RetroKit

let VWI = 256, VHI = 200, PW = 64, HT = 40, CW = VWI + PW, CH = VHI + HT

/// index.jsx hash2: per-cell floor grain
func hash2(_ x: Int, _ y: Int) -> Double {
    var h = Int32(truncatingIfNeeded: x &* 374761393 &+ y &* 668265263)
    h = Int32(truncatingIfNeeded: Int64(h ^ Int32(bitPattern: UInt32(bitPattern: h) >> 13)) &* 1274126177)
    return Double(UInt32(bitPattern: h ^ Int32(bitPattern: UInt32(bitPattern: h) >> 16))) / 4294967296
}

func rgb3(_ c: (Int, Int, Int)) -> RGBA { 0xFF00_0000 | RGBA(c.0) << 16 | RGBA(c.1) << 8 | RGBA(c.2) }
/// walls.js torch + litColor
func torch(_ dx: Double, _ dy: Double) -> Double { max(0, min(1, 1 - jsHypot(dx, dy) / Double(CFG.torchReach))) }
func lit(_ stone: String, _ light: Double) -> RGBA {
    let c = hex(stone)
    let m = 0.28 + (1 - 0.28) * light
    func ch(_ s: RGBA) -> Int { Int(jsRound(Double((c >> s) & 0xFF) * m)) }
    return rgb3((ch(16), ch(8), ch(0)))
}

final class Painter {
    let fb = Surface(CW, CH)
    struct Part { var x, y, vx, vy: Double; var t: Int; var col: RGBA }
    struct Debris { var x, y, vx, vy, g: Double; var t: Int }
    var parts: [Part] = [], debris: [Debris] = []
    var shake = 0.0, flash = 0.0, wflash = 0.0
    var toast = 0, toastMsg = ""
    var revealAt: [Int: Int] = [:]
    var hi = 0
    var onReveal: (() -> Void)? = nil

    func burst(_ px: Double, _ py: Double, _ n: Int, _ col: String) {
        for _ in 0..<n {
            let a = Double.random(in: 0..<(2 * .pi)), sp = 0.5 + Double.random(in: 0..<2.2)
            parts.append(Part(x: px, y: py, vx: cos(a) * sp, vy: sin(a) * sp, t: 0, col: hex(col)))
        }
    }

    // MARK: drawView

    func drawView(_ gs: Game) {
        let g = fb
        let h = gs.hero!
        let mat = MATERIALS[gs.levelData.material]!
        let (camX, camY) = Game.viewRect(gs.hero.x, gs.hero.y, gs.partner)
        g.fill(0, 0, Double(VWI), Double(VHI), hex("#05050c"))
        let c0 = jsFloor(camX / PX), r0 = jsFloor(camY / PX)
        let c1 = min(W - 1, c0 + Int((VW / PX).rounded(.up)) + 1), r1 = min(H - 1, r0 + Int((VH / PX).rounded(.up)) + 1)
        let P = Int(PX), Pd = PX
        for r in r0...r1 {
            for c in c0...c1 {
                let cv = gs.visualChar(c, r)
                if cv == 35 { continue }
                let x = jsRound(Double(c) * PX - camX), y = jsRound(Double(r) * PX - camY)
                let n = hash2(c, r)
                g.fill(x, y, Pd, Pd, hex(n < 0.5 ? "#1a1723" : "#171420"))
                g.fill(x + 2, y + 2, Pd - 4, 1, 0xFFFF_FFFF, 0.035)
                if n > 0.82 { g.fill(x + 3 + Double(jsFloor(n * 9)), y + 6 + Double(jsFloor(n * 7)), 2, 1, 0xFF00_0000, 0.4) }
                if gs.levelData.g[r][c] == ch("h") && gs.revealed.contains(r * W + c) {
                    let rk = gs.level * W * H + r * W + c
                    if revealAt[rk] == nil { revealAt[rk] = gs.tick; onReveal?() }
                    let op = max(0, 1 - Double(gs.tick - revealAt[rk]! + 1) / 3)
                    if op > 0 {
                        let L = torch(Double(c) + 0.5 - h.x, Double(r) + 0.5 - h.y)
                        g.fill(x, y, Pd, Pd, lit((c + r) % 2 == 0 ? mat.dark : mat.base, L), op)
                        g.fill(x, y + 8, Pd, 1, lit(mat.mortar, L), op)
                    }
                }
                if cv == ch("X") {
                    g.fill(x + 2, y + 2, Pd - 4, Pd - 4, hex("#0e2e42"))
                    for st in 0..<3 {
                        g.fill(x + 3 + Double(st * 3), y + Pd - 5 - Double(st * 4), Pd - 6 - Double(st * 2), 3, hex(st == (gs.tick >> 3) % 3 ? "#54c8ff" : "#1d5a7d"))
                    }
                }
                if cv == ch("W") {
                    let wd = gs.levelData.warps.first { $0.x == c && $0.y == r }
                    let live = wd != nil && wd!.to < gs.levelCount
                    let glow = 0.5 - 0.5 * cos(Double(gs.tick % 48) / 48 * .pi * 2)
                    g.fill(x + 1, y + 1, Pd - 2, Pd - 2, hex(live ? "#123528" : "#241d12"))
                    let edge = hex(live ? "#2f9d5f" : "#4a3f2a")
                    g.fill(x + 2, y + 2, Pd - 4, 2, edge); g.fill(x + 2, y + 2, 2, Pd - 4, edge); g.fill(x + Pd - 4, y + 2, 2, Pd - 4, edge)
                    if live {
                        g.fill(x + 4, y + 5, Pd - 8, Pd - 8, hex("#05150c"))
                        g.fill(x + 4, y + 5, Pd - 8, Pd - 8, hex("#5dff8f"), 0.2 + glow * 0.5)
                        g.fill(x + 6, y + 7 + Double((gs.tick >> 3) % 2), Pd - 12, 2, hex("#5dff8f"))
                        text(g, "\(wd!.to + 1)", x + Pd / 2, y - 2, 5, hex(glow > 0.5 ? "#aaffc8" : "#5dff8f"))
                    }
                }
                if cv == ch("P") || cv == ch("p") {
                    let q = (gs.tick / 2) % 8
                    let col = hex(cv == ch("p") ? "#fff0ff" : "#e08fff")
                    for k in 0..<4 {
                        let a = Double(q + k * 2) * .pi / 4
                        g.fill(x + Pd / 2 + jsRound(cos(a) * 4) - 1, y + Pd / 2 + jsRound(sin(a) * 4) - 1, 2, 2, k % 2 != 0 ? col : hex("#7a3fb0"))
                    }
                }
                if cv == ch("S") {
                    let col = hex((gs.tick >> 3) % 2 != 0 ? "#ffe27a" : "#b08a20")
                    g.fill(x + 3, y + 3, 2, 2, col); g.fill(x + Pd - 5, y + 4, 2, 2, col)
                    g.fill(x + 5, y + Pd - 5, 2, 2, col); g.fill(x + Pd - 7, y + Pd - 7, 2, 2, col)
                    g.fill(x + 2, y + 2, Pd - 4, Pd - 4, hex("#ffe27a"), 0.25)
                }
                if cv == ch("t") {
                    if let t = gs.levelData.trap {
                        let frac = (gs.playT + t.phase) % t.period
                        if frac < t.open && Double(t.open - frac) <= Double(t.open) * 0.3 && (gs.tick / 4) % 2 == 0 { g.fill(x, y, Pd, Pd, hex("#ff9646"), 0.4) }
                    }
                    let col = hex("#ff9646")
                    g.fill(x + 1, y + 1, Pd - 2, 1, col, 0.5); g.fill(x + 1, y + Pd - 2, Pd - 2, 1, col, 0.5)
                    g.fill(x + 1, y + 1, 1, Pd - 2, col, 0.5); g.fill(x + Pd - 2, y + 1, 1, Pd - 2, col, 0.5)
                }
                if cv == ch("D") || cv == ch("L") {
                    let d = gs.doorAt(c, r)
                    if let d, d.broken {
                        for k in 0..<5 { g.fill(x + 2 + Double((k * 5) % 12), y + Pd - 4 - Double((k % 2) * 2), 4, 3, hex("#3d2a12")) }
                    } else if let d, d.open {
                        let col = hex("#6b4a22")
                        g.fill(x, y, Pd, 2, col, 0.9); g.fill(x, y, 2, Pd, col, 0.9); g.fill(x + Pd - 2, y, 2, Pd, col, 0.9)
                    } else {
                        g.fill(x + 1, y + 1, Pd - 2, Pd - 2, hex("#6b4a22"))
                        g.fill(x + 1, y + 1, Pd - 2, 2, hex("#9c7038"))
                        var my = y + 4
                        while my < y + Pd - 2 { g.fill(x + 2, my, Pd - 4, 1, hex("#3d2a12")); my += 3 }
                        if cv == ch("L") { g.fill(x + Pd / 2 - 2, y + Pd / 2 - 2, 4, 4, hex("#ffd23f")) }
                        else { g.fill(x + Pd / 2 - 1, y + 3, 2, 3, hex("#20180e")); g.fill(x + Pd / 2 - 1, y + Pd - 6, 2, 3, hex("#20180e")) }
                    }
                }
            }
        }
        // the torch-lit wall courses
        for r in r0...r1 {
            for c in c0...c1 {
                if gs.visualChar(c, r) != 35 { continue }
                let wb = gs.levelData.g[r][c]
                let x = jsRound(Double(c) * PX - camX), y = jsRound(Double(r) * PX - camY)
                let L = torch(Double(c) + 0.5 - h.x, Double(r) + 0.5 - h.y)
                let rec = lit(mat.mortar, L), bev = lit(mat.lite, L)
                let body = lit((c + r) % 2 == 0 ? mat.dark : mat.base, L)
                g.fill(x + 2, y + 3, Pd, Pd, 0xFF00_0000, 0.55)
                g.fill(x, y, Pd, 2, bev)
                g.fill(x, y + 2, Pd, Pd - 2, body)
                g.fill(x, y + 8, Pd, 1, rec)
                g.fill(x, y + 9, Pd, 1, bev)
                g.fill(x + 8, y + 2, 1, 6, rec)
                g.fill(x + 4, y + 10, 1, 6, rec); g.fill(x + 12, y + 10, 1, 6, rec)
                if wb == ch("B") {
                    for (a, b, w2, h2) in [(3.0, 4.0, 1.0, 5.0), (4, 9, 1, 4), (11, 2, 1, 4), (10, 6, 1, 6)] { g.fill(x + a, y + b, w2, h2, 0xFF00_0000, 0.6) }
                    g.fill(x + 3, y + 3, 6, 1, 0xFFFF_FFFF, 0.14)
                }
                if wb == ch("T") {
                    let col = hex((gs.tick >> 4) % 2 != 0 ? "#ff8a3f" : "#7d3d14")
                    g.fill(x + Pd / 2 - 3, y + Pd / 2 - 1, 6, 2, col); g.fill(x + Pd / 2 - 1, y + Pd / 2 - 3, 2, 6, col)
                }
            }
        }
        _ = P
        let sx = { (wx: Double) in jsRound(wx * PX - camX) }, sy = { (wy: Double) in jsRound(wy * PX - camY) }
        for it in gs.items where !(it.taken ?? false) {
            let bob = sin(Double(gs.tick) / 9 + it.x) * 1.5
            Sprites.draw(g, it.t, sx(it.x), sy(it.y) + bob, it.t == "food" ? 10 : 9, tick: gs.tick, wob: false)
        }
        for gen in gs.gens where gen.alive {
            let p = gen.charge > 0 ? 1 - Double(gen.charge) / Double(CFG.genPulse) : 0
            let pulse = 1 + 0.5 * p + sin(Double(gs.tick) / 2) * 0.25 * p
            if p > 0.5 { let rr = 7 + p * 7; g.fill(sx(gen.x) - rr, sy(gen.y) - rr, rr * 2, rr * 2, hex("#ffa046"), (p - 0.5) * 0.5) }
            g.fill(sx(gen.x) - 9, sy(gen.y) - 9, 18, 18, hex(p > 0.66 ? "#ffb03f" : "#ff4f4f"), 0.12 + 0.05 * sin(Double(gs.tick) / 6))
            Sprites.draw(g, "gen", sx(gen.x), sy(gen.y), 12 * pulse, tick: gs.tick, wob: false)
        }
        for s in gs.shots {
            let col = hex(s.kind == "arrow" ? "#e8eef8" : s.kind == "fire" ? "#ff8a3f" : "#8d99b5")
            let px = sx(s.x), py = sy(s.y)
            g.fill(px - jsRound(s.dx * 3) - 2, py - jsRound(s.dy * 3) - 2, 5, 5, col, 0.25)
            g.fill(px - jsRound(s.dx * 3) - 1, py - jsRound(s.dy * 3) - 1, 3, 3, col)
            g.fill(px - jsRound(s.dx * 5) - 1, py - jsRound(s.dy * 5) - 1, 2, 2, col)
        }
        for m in gs.monsters.sorted(by: { $0.y < $1.y }) {
            let big: Double = m.kind == "death" ? 15 : m.kind == "demon" ? 13 : 11
            if m.kind == "death" { g.fill(sx(m.x) - 10, sy(m.y) - 10, 20, 20, hex("#8fff9f"), 0.15) }
            Sprites.draw(g, m.kind, sx(m.x), sy(m.y), big, tick: gs.tick)
        }
        if let o = gs.partner, !o.down { Sprites.draw(g, o.name.lowercased(), sx(o.x), sy(o.y), 11, tick: gs.tick) }
        // facing dagger + the sword's light-arc trail
        let hx = sx(h.x), hy = sy(h.y)
        for k in 5...10 { g.fill(jsRound(hx + cos(h.a) * Double(k)), jsRound(hy + sin(h.a) * Double(k)), 1, 1, hex("#e8eef8"), 0.35) }
        if h.atkAnim > 0 {
            let t = 1 - Double(h.atkAnim) / Double(CFG.swordCool)
            let lead = -CFG.swordArc + t * CFG.swordArc * 2, alpha = 0.85 * (1 - 0.6 * t), reach = 12 + 5 * (1 - t)
            for k in 0..<3 {
                let aa = max(0, alpha - Double(k) * 0.25)
                var a = h.a + lead - Double(k) * 0.14 - 0.32
                while a <= h.a + lead - Double(k) * 0.14 + 0.32 {
                    let px = hx + cos(a) * reach, py = hy + sin(a) * reach
                    g.fill(jsRound(px) - 1, jsRound(py) - 1, 3, 3, hex("#dfeeff"), aa * 0.25)
                    g.fill(jsRound(px), jsRound(py), max(1, 2.6 - Double(k)), max(1, 2.6 - Double(k)), hex("#dfeeff"), aa)
                    a += 0.04
                }
            }
        }
        let key = gs.heroKey
        if h.deadT > 0 {
            let dp = 1 - Double(h.deadT) / Double(CFG.deathFreeze)
            let fr = Sprites.frames(key)
            if let img = fr.first { g.blitRotated(img, Int(hx), Int(hy), dp * .pi * 2, flip: false, ax: Double(img.w) / 2 * max(0.05, 1 - dp), ay: Double(img.h) / 2 * max(0.05, 1 - dp)) }
        } else {
            let wf = (h.walk / 8) % max(1, Sprites.frames(key).count)
            Sprites.draw(g, key, hx, hy, 12, tick: gs.tick, frame: wf)
            if h.hitT > 0 { Sprites.draw(g, key, hx, hy, 12, tick: gs.tick, frame: wf, white: true, alpha: Double(h.hitT) / Double(CFG.hitFlash)) }
        }
        if h.stunT > 0 && (gs.tick >> 2) % 3 != 2 {
            let spin = Double(gs.tick >> 1) * .pi / 6
            for k in 0..<3 {
                let a = spin + Double(k) * .pi * 2 / 3
                g.fill(hx + jsRound(cos(a) * 6) - 1, hy - 7 + jsRound(sin(a) * 2), 2, 2, hex("#ffe27a"))
            }
        }
        for i in parts.indices {
            parts[i].x += parts[i].vx; parts[i].y += parts[i].vy; parts[i].t += 1
            let p = parts[i]
            if p.t < 18 { g.fill(Double(VWI) / 2 + p.x, Double(VHI) / 2 + p.y, 2, 2, p.col, 1 - Double(p.t) / 18) }
        }
        parts.removeAll { $0.t >= 18 }
        for i in debris.indices {
            debris[i].x += debris[i].vx; debris[i].y += debris[i].vy; debris[i].vy += debris[i].g; debris[i].t += 1
            let d = debris[i]
            if d.t < 18 { g.fill(sx(d.x), sy(d.y), 2, 2, hex(d.t % 2 != 0 ? "#9a94a8" : "#6f6a80"), 1 - Double(d.t) / 18) }
        }
        debris.removeAll { $0.t >= 18 }
        radial(g, Double(VWI) / 2, Double(VHI) / 2, Double(VHI) * 0.34, Double(VHI) * 0.72, 0xFF00_0000, 0.62, w: VWI, h: VHI)
        if Double(h.hp) < Double(h.maxHp) * 0.3 && h.maxHp > 0 {
            let low = 0.5 - 0.5 * cos(Double(gs.tick % 48) / 48 * .pi * 2)
            radial(g, Double(VWI) / 2, Double(VHI) / 2, Double(VHI) * 0.3, Double(VHI) * 0.8, hex("#960a0a"), low * 0.5, w: VWI, h: VHI)
        }
        if let d = gs.monsters.first(where: { $0.kind == "death" }), jsHypot(d.x - h.x, d.y - h.y) < 0.75 {
            let t = Double(gs.tick % 40) / 40
            g.fill(0, 0, Double(VWI), Double(VHI), hex("#3cbe5f"), (0.35 + 0.4 * (0.5 - 0.5 * cos(t * .pi * 2))) * 0.2)
        }
    }

    // MARK: drawPanel + HUD

    func drawPanel(_ gs: Game) {
        let g = fb
        let V = Double(VWI), P = Double(PW)
        g.fill(V, 0, P, Double(VHI), hex("#0b0e18"))
        g.fill(V, 0, P, 1, hex("#2b3348")); g.fill(V, Double(VHI) - 1, P, 1, hex("#2b3348"))
        g.fill(V, 0, 1, Double(VHI), hex("#2b3348")); g.fill(V + P - 1, 0, 1, Double(VHI), hex("#2b3348"))
        let px = V + 8, py = 8.0, s = 2.0
        g.fill(px - 2, py - 2, Double(W) * s + 4, Double(H) * s + 4, hex("#05050c"))
        let h = gs.hero!
        let map = gs.explored[gs.level]
        for r in 0..<H {
            for c in 0..<W where map[r * W + c] != 0 {
                let chh = gs.levelData.g[r][c]
                var col: String
                if chh == ch("X") {
                    if gs.keys > 0 {
                        let p = 0.5 - 0.5 * cos(Double(gs.tick % 40) / 40 * .pi * 2)
                        if p > 0.75 { g.fill(px + Double(c) * s - 1, py + Double(r) * s - 1, s + 2, s + 2, hex("#ffd23f"), 0.55) }
                        col = p > 0.75 ? "#fff2b0" : p > 0.25 ? "#ffd23f" : "#8a5f16"
                    } else { col = (gs.tick >> 3) % 2 == 0 ? "#54c8ff" : "#1d5a7d" }
                } else {
                    switch chh {
                    case 35: col = "#4a5568"
                    case ch("W"): col = (gs.tick >> 3) % 2 == 0 ? "#5dff8f" : "#2f7d4f"
                    case ch("D"): col = "#c96a3a"
                    case ch("L"): col = "#ffd23f"
                    case ch("P"), ch("p"): col = "#e08fff"
                    case ch("S"): col = "#ffe27a"
                    case ch("t"): col = "#7d5233"
                    default: col = "#1a2436"
                    }
                }
                g.fill(px + Double(c) * s, py + Double(r) * s, s, s, hex(col))
            }
        }
        let (camX, camY) = Game.viewRect(gs.hero.x, gs.hero.y, gs.partner)
        for m in gs.monsters where m.x * PX >= camX && m.x * PX <= camX + VW && m.y * PX >= camY && m.y * PX <= camY + VH {
            g.fill(px + m.x * s - 1, py + m.y * s - 1, s, s, hex(m.kind == "death" ? "#8fff9f" : "#ff5d5d"))
        }
        g.fill(px + h.x * s - 1, py + h.y * s - 1, 2, 2, hex("#ff5d5d"))
        if let o = gs.partner, !o.down { g.fill(px + o.x * s - 1, py + o.y * s - 1, 2, 2, hex("#54c8ff")) }
        let hy = Double(VHI) - 58
        Sprites.draw(g, gs.heroKey, V + P / 2, hy, 20, tick: gs.tick, wob: false)
        text(g, HEROES[gs.heroKey]!.name, V + P / 2, hy + 16, 5, hex("#ffd23f"))
        g.fill(V + 8, hy + 22, P - 16, 5, hex("#301010"))
        let hcol = Double(h.hp) > Double(h.maxHp) * 0.3 ? "#e83a3a" : (gs.tick >> 2) % 2 != 0 ? "#ff8a5d" : "#7d1414"
        g.fill(V + 8, hy + 22, (P - 16) * max(0, Double(h.hp) / Double(h.maxHp)), 5, hex(hcol))
        text(g, "HEALTH", V + P / 2, hy + 33, 5, hex("#8fa3d8"))
        text(g, "KEYS \(gs.keys)", V + P / 2, hy + 44, 5, hex("#ffd23f"))
        text(g, "GOLD \(gs.gold)", V + P / 2, hy + 53, 5, hex("#c9d4ea"))
        if let o = gs.partner, !o.down {
            text(g, gs.partnerHuman ? "2P" : "CPU", V + P / 2, 72, 5, hex(gs.partnerHuman ? "#ff5d5d" : "#54c8ff"))
            Sprites.draw(g, o.name.lowercased(), V + P / 2, 92, 18, tick: gs.tick, wob: false)
            g.fill(V + 10, 104, P - 20, 3, hex("#301010"))
            let oc = Double(o.hp) > Double(o.maxHp) * 0.3 ? "#e83a3a" : (gs.tick >> 2) % 2 != 0 ? "#ff8a5d" : "#7d1414"
            g.fill(V + 10, 104, (P - 20) * max(0, Double(o.hp) / Double(o.maxHp)), 3, hex(oc))
        }
    }

    func draw(_ gs: Game) {
        fb.ox = 0; fb.oy = 0
        fb.clear(hex("#05050c"))
        if shake > 0 { fb.ox = Int(jsRound((Double.random(in: 0..<1) - 0.5) * shake)); fb.oy = Int(jsRound((Double.random(in: 0..<1) - 0.5) * shake)); shake -= 0.5 }
        drawView(gs)
        fb.ox = 0; fb.oy = 0
        if flash > 0 { fb.fill(0, 0, Double(VWI), Double(VHI), hex("#ff2828"), flash * 0.03); flash -= 0.5 }
        if wflash > 0 { fb.fill(0, 0, Double(VWI), Double(VHI), 0xFFFF_FFFF, wflash * 0.028); wflash -= 0.5 }
        drawPanel(gs)
        fb.fill(0, Double(VHI), Double(CW), Double(HT), hex("#07070f"))
        fb.fill(0, Double(VHI), Double(CW), 1, hex("#2b3348"))
        let name = LEVELS[gs.level].name
        text(fb, name, Double(CW) / 2, Double(VHI) + 12, 5, hex("#8fa3d8"))
        text(fb, "1UP " + String(repeating: "0", count: max(0, 6 - String(gs.score).count)) + String(gs.score), 8, Double(VHI) + 12, 5, hex("#ff5d5d"), align: "left")
        let hiS = String(max(gs.score, hi))
        text(fb, "HI " + String(repeating: "0", count: max(0, 6 - hiS.count)) + hiS, Double(CW) - 8, Double(VHI) + 12, 5, hex("#ffd23f"), align: "right")
        for i in 0..<max(0, gs.lives) { fb.fill(9 + Double(i) * 11, Double(VHI) + 25, 7, 7, hex("#ff5d5d")) }
        text(fb, "LVL \(gs.level + 1)/\(gs.levelCount)", Double(CW) - 8, Double(VHI) + 30, 5, hex("#8fb0ff"), align: "right")
        if toast > 0 { text(fb, toastMsg, Double(CW) / 2, Double(VHI) + 34, 5, hex("#e9f7ff")); toast -= 1 }
    }
}
