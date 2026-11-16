// emberwood-render — the native half of the render-parity gate (README:
// "Render parity"). Renders the scripted moments in parity/scenes.json
// offscreen through EmberwoodRender (render.js on MiniThree, Metal), and
// compares them with the web's frames (parity/web/*.png, captured from
// render.js itself in Chrome by scripts/webframes.mjs).
//
//   emberwood-render frames [--quality web|tv] [--size WxH] [--out parity/native]
//   emberwood-render compare [--web parity/web] [--native parity/native] [--diff parity/diff]
//
// Run from native/emberwood-claude (paths are relative to it).

import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import MiniThree
import RetroKit
import EmberwoodCore
import EmberwoodRender

let args = Array(CommandLine.arguments.dropFirst())
func opt(_ n: String, _ d: String) -> String { if let i = args.firstIndex(of: n), i + 1 < args.count { return args[i + 1] }; return d }
let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
func path(_ p: String) -> URL { p.hasPrefix("/") ? URL(fileURLWithPath: p) : cwd.appendingPathComponent(p) }

func loadPNG(_ url: URL) -> CGImage? {
    guard let s = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(s, 0, nil)
}
func writePNG(_ rgba: [UInt8], _ w: Int, _ h: Int, _ url: URL) {
    var data = rgba
    let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    let img = ctx.makeImage()!
    let d = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(d, img, nil)
    CGImageDestinationFinalize(d)
}
func rgbaOf(_ img: CGImage) -> [UInt8] {
    // decode to sRGB RGBA8 exactly as stored (no colour matching: both PNGs are raw canvas bytes)
    let w = img.width, h = img.height
    var out = [UInt8](repeating: 0, count: w * h * 4)
    let ctx = CGContext(data: &out, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: img.colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    return out
}

struct Scenes: Decodable {
    struct S: Decodable { let name: String; let room: String; let at: [Int]?; let steps: Int; let t: Double; let act2: Bool? }
    let size: [Int]; let syncs: Int; let scenes: [S]
}

/// the scripted moment, exactly as scripts/webframes.mjs sets it up in JS
func makeSim(_ s: Scenes.S) -> Sim {
    let sim = Sim(seed: 11)
    if s.act2 == true {
        sim.flags.emberTaken = true; sim.flags.doorsOpen["dr-heart"] = true
        sim.items.bow = true; sim.items.arrows = 10; sim.items.gale = true; sim.items.bombs = 4
    }
    sim.spawnRoom(s.room, s.at)
    var prev = PadPrev()
    for _ in 0..<s.steps { _ = sim.step(padToInput(Pad(), &prev)) }
    sim.fx.removeAll()
    return sim
}

func makeStage(_ r: WebGLRenderer, _ w: Int, _ h: Int, _ q: Quality) -> EmberwoodRenderer {
    let artDir = cwd.appendingPathComponent("App/Art")
    let shelfDir = cwd.appendingPathComponent("../../public/models/scenery")
    let e = EmberwoodRenderer(renderer: r, lite: false, width: 480, height: 288, quality: q,
                              art: { loadPNG(artDir.appendingPathComponent("\($0).png")) },
                              shelfURL: { shelfDir.appendingPathComponent("\($0).glb") })
    e.random = { 0.5 }
    e.resize(w, h)
    return e
}

switch args.first ?? "" {
case "frames":
    let spec = try JSONDecoder().decode(Scenes.self, from: Data(contentsOf: cwd.appendingPathComponent("parity/scenes.json")))
    let q: Quality = opt("--quality", "web") == "tv" ? .tv : .web
    let sz = opt("--size", "\(spec.size[0])x\(spec.size[1])").split(separator: "x").compactMap { Int($0) }
    let out = path(opt("--out", "parity/native"))
    try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
    let only = opt("--only", "")
    for s in spec.scenes where only.isEmpty || only == s.name {
        let r = try WebGLRenderer()
        let stage = makeStage(r, sz[0], sz[1], q)
        let sim = makeSim(s)
        stage.loadTex()
        stage.attachShelf()
        stage.buildScreen(sim.screen, sim.flags, sim.cut)
        for _ in 0..<spec.syncs { stage.sync(sim, s.t) }
        stage.setFocus(sim.hero.x, sim.hero.y)
        let canvas = r.makeOffscreenCanvas(stage.bufW, stage.bufH)
        r.setCanvas(canvas)
        let t0 = Date()
        stage.draw()
        r.finish()
        let ms = Date().timeIntervalSince(t0) * 1000
        writePNG(r.readPixels(canvas), canvas.width, canvas.height, out.appendingPathComponent("\(s.name).png"))
        print(String(format: "frame %@ %dx%d (%.1f ms first frame)", s.name, canvas.width, canvas.height, ms))
    }

case "compare":
    // The metric (README "Render parity" says why these numbers):
    //   mean  = mean |web - native| over every RGB channel, 0..255
    //   bad   = share of pixels whose largest channel difference > 24
    //   blur  = mean error after a 4x4 box average of both (forgives sub-pixel edge shifts)
    // A moment passes when mean <= 0.75, bad <= 0.25 % and blur <= 0.5. The
    // measured port sits near mean 0.1 / bad 0 %; two *different* dark rooms
    // (the weakest negative control) differ by mean ~1.5, so the bar sits between.
    let web = path(opt("--web", "parity/web"))
    let nat = path(opt("--native", "parity/native"))
    let diffDir = path(opt("--diff", "parity/diff"))
    try FileManager.default.createDirectory(at: diffDir, withIntermediateDirectories: true)
    let spec = try JSONDecoder().decode(Scenes.self, from: Data(contentsOf: cwd.appendingPathComponent("parity/scenes.json")))
    let MEAN = 0.75, BAD = 0.0025, BLUR = 0.5, BADPX = 24
    var fails = 0
    for s in spec.scenes {
        guard let wi = loadPNG(web.appendingPathComponent("\(s.name).png")), let ni = loadPNG(nat.appendingPathComponent("\(s.name).png")) else {
            print("PARITY \(s.name) MISSING FRAME"); fails += 1; continue
        }
        guard wi.width == ni.width, wi.height == ni.height else { print("PARITY \(s.name) SIZE \(wi.width)x\(wi.height) vs \(ni.width)x\(ni.height)"); fails += 1; continue }
        let w = wi.width, h = wi.height
        let a = rgbaOf(wi), b = rgbaOf(ni)
        var sum = 0.0, bad = 0
        var heat = [UInt8](repeating: 0, count: w * h * 4)
        for i in 0..<(w * h) {
            var mx = 0
            for k in 0..<3 { let d = abs(Int(a[i * 4 + k]) - Int(b[i * 4 + k])); sum += Double(d); mx = max(mx, d) }
            if mx > BADPX { bad += 1 }
            let g = UInt8(min(255, Int(a[i * 4]) / 4 + Int(a[i * 4 + 1]) / 4 + Int(a[i * 4 + 2]) / 8))
            heat[i * 4] = UInt8(min(255, Int(g) + mx * 4)); heat[i * 4 + 1] = g; heat[i * 4 + 2] = g; heat[i * 4 + 3] = 255
        }
        let mean = sum / Double(w * h * 3)
        var bsum = 0.0, bn = 0
        for by in stride(from: 0, to: h - 3, by: 4) {
            for bx in stride(from: 0, to: w - 3, by: 4) {
                for k in 0..<3 {
                    var sa = 0, sb = 0
                    for dy in 0..<4 { for dx in 0..<4 { let o = ((by + dy) * w + bx + dx) * 4 + k; sa += Int(a[o]); sb += Int(b[o]) } }
                    bsum += Double(abs(sa - sb)) / 16; bn += 1
                }
            }
        }
        let blur = bsum / Double(bn)
        let badFrac = Double(bad) / Double(w * h)
        let ok = mean <= MEAN && badFrac <= BAD && blur <= BLUR
        if !ok { fails += 1 }
        writePNG(heat, w, h, diffDir.appendingPathComponent("\(s.name)-diff.png"))
        // side by side: web | native
        var sbs = [UInt8](repeating: 0, count: w * 2 * h * 4)
        for y in 0..<h { for x in 0..<w { for k in 0..<4 {
            sbs[(y * w * 2 + x) * 4 + k] = a[(y * w + x) * 4 + k]; sbs[(y * w * 2 + w + x) * 4 + k] = b[(y * w + x) * 4 + k]
        } } }
        writePNG(sbs, w * 2, h, diffDir.appendingPathComponent("\(s.name)-web-vs-native.png"))
        print(String(format: "PARITY %@ %@  mean %.2f  bad %.2f%%  blur %.2f", ok ? "MATCH" : "DIVERGE", s.name, mean, badFrac * 100, blur))
    }
    print(fails == 0 ? "PARITY ALL MATCH (\(spec.scenes.count) moments)" : "PARITY \(fails) DIVERGED")
    exit(fails == 0 ? 0 : 1)

default:
    print("usage: emberwood-render frames [--quality web|tv] [--size WxH] [--out dir] [--only name] | compare [--web dir] [--native dir] [--diff dir]")
    exit(2)
}
