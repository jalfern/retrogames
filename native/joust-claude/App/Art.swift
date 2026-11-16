// JOUST — runtime art, ported from src/games/Joust/art.js. Everything is
// drawn in code into a 256x224 framebuffer (0xAARRGGBB, premultiplied
// alpha), the cabinet resolution, then scaled up with nearest-neighbour.
// The same pixels on Apple TV, iPhone and iPad. Surface + the font: RetroKit.

import Foundation
import RetroKit

struct Palette { let knight, plume, mount, wing, beak: RGBA }

let PAL: [String: Palette] = [
    "p1": Palette(knight: hex("#38b8f8"), plume: hex("#f8f8f8"), mount: hex("#b858f8"), wing: hex("#8828c8"), beak: hex("#f8d800")),
    "p2": Palette(knight: hex("#58f878"), plume: hex("#f8f8f8"), mount: hex("#28a858"), wing: hex("#187838"), beak: hex("#f8d800")),
    "bounder": Palette(knight: hex("#f83800"), plume: hex("#f8d800"), mount: hex("#f8a800"), wing: hex("#c06800"), beak: hex("#f8f8f8")),
    "hunter": Palette(knight: hex("#f8d800"), plume: hex("#f83800"), mount: hex("#a85800"), wing: hex("#783800"), beak: hex("#f8f8f8")),
    "shadow": Palette(knight: hex("#181818"), plume: hex("#a800cc"), mount: hex("#282850"), wing: hex("#141430"), beak: hex("#a8a8a8")),
]

private var SPR: [String: Surface] = [:]

private func sprite(_ key: String, _ w: Int, _ h: Int, _ draw: (Surface) -> Void) -> Surface {
    if let s = SPR[key] { return s }
    let s = Surface(w, h)
    draw(s)
    SPR[key] = s
    return s
}

/// A rider, origin at the mount's centre. Wings by flap frame (0 up, 1 glide, 2 down).
func riderSprite(_ kind: String, _ frame: Int) -> Surface {
    let p = PAL[kind] ?? PAL["p1"]!
    return sprite("rider-\(kind)-\(frame)", 40, 44) { g in
        let cx = 20.0, cy = 30.0
        let wy = frame == 0 ? -8.0 : frame == 2 ? 4.0 : -1.0
        g.px(cx - 17, cy - 2 + wy * 0.6, 8, 3, p.wing)
        g.px(cx + 9, cy - 2 + wy * 0.6, 8, 3, p.wing)
        g.px(cx - 13, cy + wy * 0.9, 6, 3, p.wing)
        g.px(cx + 7, cy + wy * 0.9, 6, 3, p.wing)
        g.px(cx - 15, cy - 1 + wy * 0.75, 4, 3, p.wing)
        g.px(cx + 11, cy - 1 + wy * 0.75, 4, 3, p.wing)
        g.px(cx - 9, cy - 3, 18, 6, p.mount)
        g.px(cx - 7, cy - 4, 14, 1, p.mount)
        g.px(cx - 9, cy + 3, 18, 1, p.wing)
        g.px(cx + 8, cy - 4, 4, 4, p.mount)
        g.px(cx + 12, cy - 3, 3, 2, p.beak)
        g.px(cx + 9, cy - 3, 1, 1, hex("#000000"))
        g.px(cx - 5, cy + 3, 2, 3, p.wing)
        g.px(cx + 3, cy + 3, 2, 3, p.wing)
        g.px(cx - 3, cy - 12, 6, 8, p.knight)
        g.px(cx - 4, cy - 10, 2, 5, p.knight)
        g.px(cx + 2, cy - 10, 2, 5, p.knight)
        g.px(cx - 2, cy - 16, 5, 4, hex("#c8c8d8"))
        g.px(cx + 1, cy - 15, 2, 2, hex("#101018"))
        g.px(cx - 2, cy - 18, 1, 3, p.plume)
        g.px(cx - 3, cy - 19, 2, 2, p.plume)
        g.px(cx + 3, cy - 26, 1, 16, hex("#e0d8c0"))
        g.px(cx + 2, cy - 30, 3, 4, hex("#f8f8f8"))
        g.px(cx + 3, cy - 31, 1, 2, hex("#f8f8f8"))
    }
}

func eggSprite(_ kind: String, _ cracked: Bool) -> Surface {
    let col = hex(kind == "bounder" ? "#58d8f8" : kind == "hunter" ? "#f8b800" : "#a058f8")
    let dark = hex(kind == "bounder" ? "#2088a8" : kind == "hunter" ? "#a86800" : "#6018a0")
    return sprite("egg-\(kind)-\(cracked ? 1 : 0)", 12, 14) { g in
        g.px(3, 1, 6, 1, col)
        g.px(2, 2, 8, 8, col)
        g.px(1, 3, 10, 6, col)
        g.px(3, 10, 6, 2, dark)
        g.px(2, 4, 2, 4, dark)
        g.px(4, 3, 2, 2, hex("#f8f8f8"))
        if cracked {
            let k = hex("#101010")
            g.px(5, 2, 1, 3, k); g.px(6, 5, 1, 2, k); g.px(4, 6, 1, 2, k); g.px(6, 7, 2, 1, k)
        }
    }
}

func handSprite() -> Surface {
    sprite("hand", 20, 34) { g in
        let g1 = hex("#b8b8c8"), g2 = hex("#787888")
        g.px(7, 12, 6, 22, g1)
        g.px(7, 12, 2, 22, g2)
        g.px(3, 4, 3, 10, g1); g.px(8, 2, 3, 12, g1); g.px(13, 5, 3, 9, g1)
        g.px(3, 4, 1, 10, g2); g.px(8, 2, 1, 12, g2); g.px(13, 5, 1, 9, g2)
        g.px(3, 3, 3, 2, g1); g.px(8, 1, 3, 2, g1); g.px(13, 4, 3, 2, g1)
        g.px(2, 12, 15, 4, g2)
    }
}

/// Stone slab: brick with mortar, highlight cap, speckle; cracked + warm (crumbling) variants.
func stoneTile(_ cracked: Bool, _ warm: Double) -> Surface {
    sprite("stone-\(cracked ? 1 : 0)-\(warm)", 16, 8) { g in
        let base = hex(warm != 0 ? "#6c5848" : "#58606c")
        let lite = hex(warm != 0 ? "#b09878" : "#a0b0c0")
        g.px(0, 0, 16, 8, base)
        g.px(0, 0, 16, 2, lite)
        g.px(0, 7, 16, 1, hex("#28303c"))
        g.px(7, 2, 1, 5, hex("#303840"))
        g.px(0, 4, 16, 1, hex("#404854"))
        g.px(3, 3, 1, 1, lite)
        g.px(11, 5, 2, 1, hex("#38404c"))
        if cracked {
            let k = hex("#181c22")
            g.px(4, 2, 1, 3, k); g.px(5, 5, 1, 2, k); g.px(10, 1, 1, 4, k); g.px(11, 4, 2, 1, k)
        }
        if warm > 0 { g.fill(0, 6, 16, 1, 0xFFF8_7800, 0.25 * warm) }
    }
}

// The 3x5 pixel font, Surface and text5 are RetroKit's (Surface.swift).
func centered(_ g: Surface, _ str: String, _ y: Double, _ color: RGBA, _ scale: Int = 1, alpha: Double = 1) {
    text5(g, str, 128 - textWidth(str, scale) / 2, y, color, scale, alpha: alpha)
}

// deterministic starfield — the same LCG as art.js, double arithmetic and all
// (s * 1103515245 overflows 2^53 in JS; the rounding is part of the sky).
let STARS: [(Int, Int, Bool)] = {
    var out: [(Int, Int, Bool)] = []
    var s = 20261013.0
    func next() { s = Double(toUint32(s * 1103515245 + 12345)) }
    for _ in 0..<42 {
        next(); let x = (UInt32(s) >> 8) % 256
        next(); let y = (UInt32(s) >> 8) % 110
        next()
        out.append((Int(x), Int(y) + 4, (UInt32(s) >> 31) != 0))
    }
    return out
}()

func toUint32(_ v: Double) -> UInt32 {
    let m = v.truncatingRemainder(dividingBy: 4294967296)
    return UInt32(truncatingIfNeeded: Int64(m < 0 ? m + 4294967296 : m))
}

private func lerp(_ a: RGBA, _ b: RGBA, _ t: Double) -> RGBA {
    func ch(_ s: RGBA) -> RGBA {
        let x = Double((a >> s) & 0xFF), y = Double((b >> s) & 0xFF)
        return RGBA((x + (y - x) * t).rounded()) << s
    }
    return 0xFF00_0000 | ch(16) | ch(8) | ch(0)
}

private func gradient(_ stops: [(Double, RGBA)], _ t: Double) -> RGBA {
    if t <= stops[0].0 { return stops[0].1 }
    for i in 1..<stops.count where t <= stops[i].0 {
        let (t0, c0) = stops[i - 1], (t1, c1) = stops[i]
        return lerp(c0, c1, (t - t0) / (t1 - t0))
    }
    return stops.last!.1
}

/// fill a polyline-topped silhouette: canvas path moveTo(0,base) → pts → lineTo(W,base)
private func ridge(_ g: Surface, _ pts: [(Double, Double)], _ base: Double, _ c: RGBA) {
    for x in 0..<256 {
        let fx = Double(x) + 0.5
        var top = base
        for i in 1..<pts.count where fx <= pts[i].0 {
            let (x0, y0) = pts[i - 1], (x1, y1) = pts[i]
            top = y0 + (y1 - y0) * (fx - x0) / (x1 - x0)
            break
        }
        // pixel row y is inside when its centre y+0.5 is below the ridge line
        var y = Int((top - 0.5).rounded(.up))
        if y < 0 { y = 0 }
        if y < Int(base) { g.fill(Double(x), Double(y), 1, base - Double(y), c) }
    }
}

func paintSky(_ g: Surface, _ groundY: Double, _ t: Int) {
    let stops: [(Double, RGBA)] = [(0, hex("#101038")), (0.55, hex("#282868")), (1, hex("#503878"))]
    for y in 0..<Int(groundY) {
        g.fill(0, Double(y), 256, 1, gradient(stops, (Double(y) + 0.5) / groundY))
    }
    for (x, y, b) in STARS {
        let on = ((t >> 5) + x + y) % 7 != 0
        if on { g.px(Double(x), Double(y), 1, 1, b ? hex("#f8f8f8") : hex("#a0a0c8")) }
    }
    var p1: [(Double, Double)] = [(0, groundY)]
    for x in stride(from: 0, through: 256, by: 16) { p1.append((Double(x), groundY - 14 - Double(abs(((x * 7919) % 37) - 18)) * 0.8)) }
    p1.append((256, groundY))
    ridge(g, p1, groundY, hex("#1c1c48"))
    var p2: [(Double, Double)] = [(0, groundY)]
    for x in stride(from: 0, through: 256, by: 12) { p2.append((Double(x), groundY - 6 - Double(abs(((x * 104729) % 23) - 11)) * 0.6)) }
    p2.append((256, groundY))
    ridge(g, p2, groundY, hex("#251c50"))
}

func paintLava(_ g: Surface, _ x0: Int, _ x1: Int, _ top: Int, _ H: Int, _ t: Int) {
    let stops: [(Double, RGBA)] = [(0, hex("#f8a800")), (0.35, hex("#f83800")), (1, hex("#601000"))]
    for y in top..<H {
        g.fill(Double(x0), Double(y), Double(x1 - x0), 1, gradient(stops, (Double(y - top) + 0.5) / Double(H - top)))
    }
    for x in stride(from: x0, to: x1, by: 6) {
        let ph = ((x * 31 + t) >> 3) % 5
        if ph == 0 { g.px(Double(x), Double(top + 1 + (((x + t) >> 4) % 3) * 2), 4, 1, hex("#f8e000")) }
        else if ph == 3 { g.px(Double(x + 2), Double(top + 4 + (((x * 7 + t) >> 5) % 4) * 2), 3, 1, hex("#a02000")) }
    }
    g.px(Double(x0), Double(top), x1 - x0, 1, hex("#f8f800"))
}

func lifeGlyph(_ g: Surface, _ x: Double, _ y: Double, _ col: RGBA) {
    g.px(x, y + 2, 7, 3, col)
    g.px(x + 2, y, 3, 2, hex("#c8c8d8"))
    g.px(x - 2, y + 3, 2, 1, col)
    g.px(x + 7, y + 3, 2, 1, col)
}
