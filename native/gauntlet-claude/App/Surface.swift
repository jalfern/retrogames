// GAUNTLET — the framebuffer the shell paints into (0xAARRGGBB), the cabinet's
// 320x240 canvas (256x200 view + 64px side panel + 40px HUD band), scaled up
// nearest-neighbour. Surface + the 3x5 pixel font come from the Joust port.

import Foundation
typealias RGBA = UInt32

@inline(__always) func hex(_ s: String) -> RGBA {
    var v: UInt64 = 0
    Scanner(string: String(s.dropFirst())).scanHexInt64(&v)
    return 0xFF00_0000 | RGBA(v & 0xFF_FFFF)
}

/// A drawing surface: the screen, or a cached sprite.
final class Surface {
    let w: Int, h: Int
    var pix: [RGBA]
    var ox = 0, oy = 0 // translation (screen shake)
    init(_ w: Int, _ h: Int) { self.w = w; self.h = h; pix = Array(repeating: 0, count: w * h) }

    @inline(__always) func blend(_ i: Int, _ c: RGBA, _ alpha: Double) {
        if alpha >= 1 { pix[i] = c; return }
        let d = pix[i]
        let a = alpha
        func ch(_ s: Int) -> RGBA {
            let sc = Double((c >> RGBA(s)) & 0xFF), dc = Double((d >> RGBA(s)) & 0xFF)
            return RGBA(min(255, max(0, (sc * a + dc * (1 - a)).rounded()))) << RGBA(s)
        }
        let da = Double((d >> 24) & 0xFF) / 255
        let outA = RGBA(min(255, ((a + da * (1 - a)) * 255).rounded())) << 24
        pix[i] = outA | ch(16) | ch(8) | ch(0)
    }

    /// canvas fillRect with integer-snapped corners
    func fill(_ x: Double, _ y: Double, _ w: Double, _ h: Double, _ c: RGBA, _ alpha: Double = 1) {
        let x0 = max(0, Int(x.rounded(.down)) + ox), y0 = max(0, Int(y.rounded(.down)) + oy)
        let x1 = min(self.w, Int((x + w).rounded(.down)) + ox), y1 = min(self.h, Int((y + h).rounded(.down)) + oy)
        if x0 >= x1 || y0 >= y1 { return }
        for yy in y0..<y1 { for xx in x0..<x1 { blend(yy * self.w + xx, c, alpha) } }
    }

    /// art.js `px`: Math.round the corner, integer size
    func px(_ x: Double, _ y: Double, _ w: Int, _ h: Int, _ c: RGBA) {
        fill(jsRound(x), jsRound(y), Double(w), Double(h), c)
    }

    func blit(_ s: Surface, _ dx: Int, _ dy: Int) { blitScaled(s, dx, dy, s.w, s.h) }

    func blitScaled(_ s: Surface, _ dx: Int, _ dy: Int, _ dw: Int, _ dh: Int, alpha: Double = 1) {
        for y in 0..<dh {
            let ty = dy + y + oy
            if ty < 0 || ty >= h { continue }
            let sy = (y * s.h) / dh
            for x in 0..<dw {
                let tx = dx + x + ox
                if tx < 0 || tx >= w { continue }
                let c = s.pix[sy * s.w + (x * s.w) / dw]
                if c >> 24 != 0 { blend(ty * w + tx, c, Double(c >> 24) / 255 * alpha) }
            }
        }
    }

    /// drawImage under translate(cx,cy) · rotate(a) · scale(flip ? -1 : 1, 1), image at (-ax,-ay)
    func blitRotated(_ s: Surface, _ cx: Int, _ cy: Int, _ a: Double, flip: Bool, ax: Double, ay: Double) {
        let ca = cos(a), sa = sin(a)
        let r = Int((Double(s.w * s.w + s.h * s.h)).squareRoot()) + 2
        for py in (cy - r)...(cy + r) {
            let ty = py + oy
            if ty < 0 || ty >= h { continue }
            for px in (cx - r)...(cx + r) {
                let tx = px + ox
                if tx < 0 || tx >= w { continue }
                let dx = Double(px - cx) + 0.5, dy = Double(py - cy) + 0.5
                var lx = dx * ca + dy * sa
                let ly = -dx * sa + dy * ca
                if flip { lx = -lx }
                let sx = Int((lx + ax).rounded(.down)), sy = Int((ly + ay).rounded(.down))
                if sx < 0 || sy < 0 || sx >= s.w || sy >= s.h { continue }
                let c = s.pix[sy * s.w + sx]
                if c >> 24 != 0 { blend(ty * w + tx, c, Double(c >> 24) / 255) }
            }
        }
    }

    func clear(_ c: RGBA) { for i in pix.indices { pix[i] = c } }
}

let FONT: [Character: [String]] = [
    "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
    "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
    "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
    "A": ["010", "101", "111", "101", "101"], "B": ["110", "101", "110", "101", "110"],
    "C": ["011", "100", "100", "100", "011"], "D": ["110", "101", "101", "101", "110"],
    "E": ["111", "100", "111", "100", "111"], "F": ["111", "100", "111", "100", "100"],
    "G": ["011", "100", "101", "101", "011"], "H": ["101", "101", "111", "101", "101"],
    "I": ["111", "010", "010", "010", "111"], "J": ["001", "001", "001", "101", "010"],
    "K": ["101", "110", "100", "110", "101"], "L": ["100", "100", "100", "100", "111"],
    "M": ["101", "111", "111", "101", "101"], "N": ["101", "111", "111", "111", "101"],
    "O": ["010", "101", "101", "101", "010"], "P": ["110", "101", "110", "100", "100"],
    "Q": ["010", "101", "101", "110", "011"], "R": ["110", "101", "110", "110", "101"],
    "S": ["011", "000", "010", "001", "110"], "T": ["111", "010", "010", "010", "010"],
    "U": ["101", "101", "101", "101", "111"], "V": ["101", "101", "101", "101", "010"],
    "W": ["101", "101", "111", "111", "101"], "X": ["101", "101", "010", "101", "101"],
    "Y": ["101", "101", "010", "010", "010"], "Z": ["111", "001", "010", "100", "111"],
    "-": ["000", "000", "111", "000", "000"], ":": ["000", "010", "000", "010", "000"],
    ".": ["000", "000", "000", "000", "010"], "!": ["010", "010", "010", "000", "010"],
    " ": ["000", "000", "000", "000", "000"], "?": ["110", "001", "010", "000", "010"],
    "+": ["000", "010", "111", "010", "000"], "/": ["001", "001", "010", "100", "100"],
    ",": ["000", "000", "000", "010", "100"], "·": ["000", "000", "010", "000", "000"],
    "'": ["010", "010", "000", "000", "000"], "\"": ["101", "101", "000", "000", "000"], "(": ["001", "010", "010", "010", "001"],
    ")": ["100", "010", "010", "010", "100"], "—": ["000", "000", "111", "000", "000"], "<": ["001", "010", "100", "010", "001"],
    ">": ["100", "010", "001", "010", "100"], "=": ["000", "111", "000", "111", "000"], "#": ["101", "111", "101", "111", "101"],
]

@discardableResult
func text5(_ g: Surface, _ str: String, _ x: Double, _ y: Double, _ color: RGBA = 0xFFFF_FFFF, _ scale: Int = 1, alpha: Double = 1) -> Double {
    var cx = jsRound(x)
    let yy = jsRound(y)
    let sc = Double(scale)
    for ch in str.uppercased() {
        let glyph = FONT[ch] ?? FONT[" "]!
        for (r, row) in glyph.enumerated() {
            for (c, bit) in row.enumerated() where bit == "1" {
                g.fill(cx + Double(c) * sc, yy + Double(r) * sc, sc, sc, color, alpha)
            }
        }
        cx += 4 * sc
    }
    return cx
}

func textWidth(_ str: String, _ scale: Int = 1) -> Double { Double(str.count * 4 * scale - scale) }

/// the web's text(s, x, y, size, col, glow, align): a monospace line at px
/// size ~5*scale, x anchored by align, y the baseline
func text(_ g: Surface, _ str: String, _ x: Double, _ y: Double, _ size: Double, _ col: RGBA, align: String = "center", alpha: Double = 1) {
    let scale = max(1, Int((size / 5).rounded()))
    let w = textWidth(str, scale)
    let x0 = align == "left" ? x : align == "right" ? x - w : x - w / 2
    text5(g, str, x0, y - Double(5 * scale), col, scale, alpha: alpha)
}

/// a soft radial darkening/tint over a rect (the canvas radialGradient fills)
func radial(_ g: Surface, _ cx: Double, _ cy: Double, _ r0: Double, _ r1: Double, _ col: RGBA, _ a1: Double, w: Int, h: Int) {
    for y in 0..<h { for x in 0..<w {
        let d = ((Double(x) + 0.5 - cx) * (Double(x) + 0.5 - cx) + (Double(y) + 0.5 - cy) * (Double(y) + 0.5 - cy)).squareRoot()
        if d <= r0 { continue }
        let t = min(1, (d - r0) / (r1 - r0))
        g.blend(y * g.w + x, col, t * a1)
    } }
}
