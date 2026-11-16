// art.js punch(): every monster, item, generator and hero portrait is a pixel
// string from SPRITE_DATA (generated from art.js into LevelData.swift) punched
// into a small Surface at load — plus a white silhouette per frame for the
// hit flash. No image assets.

import Foundation
import RetroKit

enum Sprites {
    private static var cache: [String: [Surface]] = [:]

    static func frames(_ name: String, white: Bool = false) -> [Surface] {
        let key = white ? name + "!" : name
        if let f = cache[key] { return f }
        guard let def = SPRITES[name] else { return [] }
        let out = def.frames.map { rows -> Surface in
            let w = rows.map(\.count).max() ?? 1, h = rows.count
            let s = Surface(w, h)
            for (y, row) in rows.enumerated() {
                for (x, c) in row.enumerated() where c != " " {
                    guard let col = def.pal[String(c)] else { continue }
                    s.pix[y * w + x] = white ? 0xFFFF_FFFF : hex(col)
                }
            }
            return s
        }
        cache[key] = out
        return out
    }

    /// the web's sprite(name, wx, wy, size, wob, frame, white): scaled to `size`
    /// px tall around (wx, wy), the walk wobble on (tick >> 3)
    static func draw(_ g: Surface, _ name: String, _ wx: Double, _ wy: Double, _ size: Double, tick: Int, wob: Bool = true, frame: Int = -1, white: Bool = false, alpha: Double = 1) {
        let fr = frames(name, white: white)
        guard !fr.isEmpty else { return }
        let img = frame >= 0 ? fr[min(frame, fr.count - 1)] : fr[wob ? (tick >> 3) % fr.count : 0]
        let s = size / Double(img.h)
        let w = Int(jsRound(Double(img.w) * s)), h = Int(jsRound(Double(img.h) * s))
        if w <= 0 || h <= 0 { return }
        g.blitScaled(img, Int(jsRound(wx - Double(img.w) * s / 2)), Int(jsRound(wy - Double(img.h) * s / 2)), w, h, alpha: alpha)
    }
}
