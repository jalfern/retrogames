// Icon generator: paints the app icons with the game's own art code
// (App/Art.swift: rider sprite, stone, lava, egg, hand, pixel font) at a
// small logical size, then scales up nearest-neighbour. Writes into
// App/Assets.xcassets. Run: native/joust-claude/tools/make-icons.sh
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "App/Assets.xcassets"

enum Layer { case back, front, all }

func lerpC(_ a: RGBA, _ b: RGBA, _ t: Double) -> RGBA {
    func ch(_ s: RGBA) -> RGBA { let x = Double((a >> s) & 0xFF), y = Double((b >> s) & 0xFF); return RGBA((x + (y - x) * t).rounded()) << s }
    return 0xFF00_0000 | ch(16) | ch(8) | ch(0)
}

/// rider at (rx, ry) = mount centre; foes = extra riders (kind, x, y, facing left)
func scene(_ w: Int, _ h: Int, _ layer: Layer, rider: (Double, Double), foes: [(String, Double, Double)] = [], title: (Double, Double, Int)? = nil) -> Surface {
    let g = Surface(w, h)
    let ground = h - 9
    if layer != .front {
        // sky
        for y in 0..<h {
            let t = Double(y) / Double(max(1, ground))
            let c = t < 0.55 ? lerpC(hex("#101038"), hex("#282868"), t / 0.55) : lerpC(hex("#282868"), hex("#503878"), min(1, (t - 0.55) / 0.45))
            g.fill(0, Double(y), Double(w), 1, c)
        }
        var s: UInt32 = 20261013
        for _ in 0..<(w * h / 90) {
            s = s &* 1103515245 &+ 12345; let x = Int(s >> 8) % w
            s = s &* 1103515245 &+ 12345; let y = Int(s >> 8) % max(1, ground - 14)
            g.fill(Double(x), Double(y), 1, 1, (s >> 31) != 0 ? hex("#f8f8f8") : hex("#a0a0c8"))
        }
        // distant ridge
        for x in 0..<w {
            let top = Double(ground) - 6 - Double(abs(((x * 7) % 23) - 11)) * 0.5
            g.fill(Double(x), top.rounded(), 1, Double(ground) - top.rounded(), hex("#1c1c48"))
        }
        // lava across the bottom, a stone ledge either side of a pit
        let pit0 = w * 3 / 8, pit1 = w * 5 / 8
        for y in ground..<h {
            let t = Double(y - ground) / Double(h - ground)
            g.fill(0, Double(y), Double(w), 1, t < 0.35 ? lerpC(hex("#f8a800"), hex("#f83800"), t / 0.35) : lerpC(hex("#f83800"), hex("#601000"), (t - 0.35) / 0.65))
        }
        g.fill(0, Double(ground), Double(w), 1, hex("#f8f800"))
        let tile = stoneTile(false, 0)
        var x = 0
        while x < w { if x + 16 <= pit0 || x >= pit1 { g.blit(tile, x, ground - 2) }; x += 16 }
        // the troll hand reaching from the pit
        let hand = handSprite()
        g.blit(hand, (pit0 + pit1) / 2 - 10, ground - 14)
    }
    if layer != .back {
        for (k, fx, fy) in foes { g.blitRotated(riderSprite(k, 2), Int(fx), Int(fy), 0.12, flip: true, ax: 20, ay: 30) }
        g.blitRotated(riderSprite("p1", 0), Int(rider.0), Int(rider.1), -0.12, flip: false, ax: 20, ay: 30)
        if let (tx, ty, sc) = title {
            text5(g, "JOUST", tx + 1, ty + 1, hex("#601000"), sc)
            text5(g, "JOUST", tx, ty, hex("#f8d800"), sc)
        }
    }
    return g
}

func write(_ s: Surface, _ W: Int, _ H: Int, _ path: String, opaque: Bool) {
    var px = [RGBA](repeating: 0, count: W * H)
    for y in 0..<H { for x in 0..<W { px[y * W + x] = s.pix[(y * s.h / H) * s.w + (x * s.w / W)] } }
    let data = px.withUnsafeBufferPointer { Data(buffer: $0) } as CFData
    let info = CGBitmapInfo.byteOrder32Little.rawValue | (opaque ? CGImageAlphaInfo.noneSkipFirst : CGImageAlphaInfo.premultipliedFirst).rawValue
    let img = CGImage(width: W, height: H, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: W * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                      bitmapInfo: CGBitmapInfo(rawValue: info), provider: CGDataProvider(data: data)!, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
    try? FileManager.default.createDirectory(atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
    let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, img, nil)
    CGImageDestinationFinalize(dest)
}

func json(_ path: String, _ s: String) {
    try? FileManager.default.createDirectory(atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
    try! s.write(toFile: path, atomically: true, encoding: .utf8)
}
let INFO = "\"info\" : { \"author\" : \"xcode\", \"version\" : 1 }"

json("\(out)/Contents.json", "{ \(INFO) }\n")

// ---- iPhone / iPad: one 1024 icon, opaque ----
let ios = scene(64, 64, .all, rider: (32, 34))
write(ios, 1024, 1024, "\(out)/AppIcon.appiconset/icon-1024.png", opaque: true)
json("\(out)/AppIcon.appiconset/Contents.json", """
{ "images" : [ { "filename" : "icon-1024.png", "idiom" : "universal", "platform" : "ios", "size" : "1024x1024" } ], \(INFO) }

""")

// ---- Apple TV: layered (parallax) icon + top shelf ----
let ba = "\(out)/App Icon & Top Shelf Image.brandassets"
json("\(ba)/Contents.json", """
{ "assets" : [
  { "filename" : "App Icon - App Store.imagestack", "idiom" : "tv", "role" : "primary-app-icon", "size" : "1280x768" },
  { "filename" : "App Icon.imagestack", "idiom" : "tv", "role" : "primary-app-icon", "size" : "400x240" },
  { "filename" : "Top Shelf Image Wide.imageset", "idiom" : "tv", "role" : "top-shelf-image-wide", "size" : "2320x720" },
  { "filename" : "Top Shelf Image.imageset", "idiom" : "tv", "role" : "top-shelf-image", "size" : "1920x720" }
], \(INFO) }

""")

func stack(_ name: String, _ sizes: [(Int, Int, String)]) {
    let dir = "\(ba)/\(name).imagestack"
    json("\(dir)/Contents.json", "{ \"layers\" : [ { \"filename\" : \"Front.imagestacklayer\" }, { \"filename\" : \"Back.imagestacklayer\" } ], \(INFO) }\n")
    for (layer, lname) in [(Layer.front, "Front"), (Layer.back, "Back")] {
        let ldir = "\(dir)/\(lname).imagestacklayer"
        json("\(ldir)/Contents.json", "{ \(INFO) }\n")
        let s = scene(100, 60, layer, rider: (50, 34), foes: [])
        var imgs: [String] = []
        for (W, H, scale) in sizes {
            let f = "\(lname.lowercased())-\(W)x\(H).png"
            write(s, W, H, "\(ldir)/Content.imageset/\(f)", opaque: layer == .back)
            imgs.append("{ \"filename\" : \"\(f)\", \"idiom\" : \"tv\", \"scale\" : \"\(scale)\" }")
        }
        json("\(ldir)/Content.imageset/Contents.json", "{ \"images\" : [ \(imgs.joined(separator: ", ")) ], \(INFO) }\n")
    }
}
stack("App Icon", [(400, 240, "1x"), (800, 480, "2x")])
stack("App Icon - App Store", [(1280, 768, "1x")])

func shelf(_ name: String, _ w: Int, _ h: Int, _ W: Int, _ H: Int) {
    let dir = "\(ba)/\(name).imageset"
    let s = scene(w, h, .all, rider: (Double(w) * 0.22, 34), foes: [("bounder", Double(w) * 0.8, 40)], title: (Double(w) / 2 - textWidth("JOUST", 3) / 2, 14, 3))
    write(s, W, H, "\(dir)/shelf-1x.png", opaque: true)
    write(s, W * 2, H * 2, "\(dir)/shelf-2x.png", opaque: true)
    json("\(dir)/Contents.json", "{ \"images\" : [ { \"filename\" : \"shelf-1x.png\", \"idiom\" : \"tv\", \"scale\" : \"1x\" }, { \"filename\" : \"shelf-2x.png\", \"idiom\" : \"tv\", \"scale\" : \"2x\" } ], \(INFO) }\n")
}
shelf("Top Shelf Image", 160, 60, 1920, 720)
shelf("Top Shelf Image Wide", 232, 72, 2320, 720)
print("icons written to \(out)")
