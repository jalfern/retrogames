// HUD art helpers: SpriteKit textures for the HUD/overlay icons (the web's
// own art.js paint, scripts/exportart.mjs → App/Art, nearest-filtered) and
// colour parsing. The diorama itself is Diorama.swift (render.js on MiniThree).

import SpriteKit

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

