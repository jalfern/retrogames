// The diorama host: an MTKView that draws src/games/Emberwood/render.js
// (Sources/EmberwoodRender, a line-for-line port onto MiniThree) under the
// transparent SpriteKit HUD. GameScene drives it from its own update, so the
// sim step, the 3D frame and the HUD share one clock (the view is paused and
// drawn on demand). The Apple TV renders `.tv` quality: the drawable's own
// size (4K on a 4K set; the web caps at 1280 px), the 4x-MSAA scene pass at
// that size, and a 4096² sun shadow map (the web's is 1024²).

import UIKit
import MetalKit
import ImageIO
import MiniThree
import RetroKit

final class Diorama: NSObject, MTKViewDelegate {
    let view: MTKView
    let renderer: WebGLRenderer
    let stage: EmberwoodRenderer
    private var built = false
    /// -perf: CPU time spent syncing + encoding the last frame, and the GPU's
    private(set) var cpuMs = 0.0, gpuMs = 0.0

    init?(frame: CGRect) {
        guard let r = try? WebGLRenderer() else { return nil }
        renderer = r
        view = MTKView(frame: frame, device: r.device)
        view.colorPixelFormat = .bgra8Unorm
        view.depthStencilPixelFormat = .invalid
        view.framebufferOnly = true
        view.isPaused = true
        view.enableSetNeedsDisplay = false
        view.autoResizeDrawable = true
        view.backgroundColor = .black
        #if os(tvOS)
        let q = Quality.tv
        #else
        let q = Quality.web
        #endif
        stage = EmberwoodRenderer(renderer: r, lite: false, width: 480, height: 288, quality: q,
                                  art: Diorama.art, shelfURL: { Bundle.main.url(forResource: $0, withExtension: "glb", subdirectory: "models") })
        super.init()
        view.delegate = self
        stage.loadTex()
        stage.attachShelf()
    }

    private static var artCache: [String: CGImage] = [:]
    static func art(_ name: String) -> CGImage? {
        if let c = artCache[name] { return c }
        guard let u = Bundle.main.url(forResource: name, withExtension: "png"),
              let s = CGImageSourceCreateWithURL(u as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(s, 0, nil) else { return nil }
        artCache[name] = img
        return img
    }

    /// a new sim (attract lap, new game, continue): rebuild the room now
    func build(_ sim: Sim) {
        stage.buildScreen(sim.screen, sim.flags, sim.cut)
        built = true
    }

    func onFx(_ fx: [FX]) { stage.onFx(fx) }

    /// index.jsx's frame: sync(sim, now), setFocus(hero), draw()
    func frame(_ sim: Sim, _ clock: Double) {
        let t0 = CACurrentMediaTime()
        stage.sync(sim, clock)
        stage.setFocus(sim.hero.x, sim.hero.y)
        view.draw()
        cpuMs = (CACurrentMediaTime() - t0) * 1000
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    func draw(in view: MTKView) {
        let sz = view.drawableSize
        guard sz.width > 0, sz.height > 0, let drawable = view.currentDrawable else { return }
        stage.resize(Int(sz.width), Int(sz.height))
        // the canvas is the drawable; the stage's buffer may be smaller (capped), then it scales up
        renderer.setCanvas(drawable.texture)
        stage.draw()
        let cb = renderer.currentCommandBuffer
        cb.addCompletedHandler { [weak self] c in
            let ms = (c.gpuEndTime - c.gpuStartTime) * 1000
            DispatchQueue.main.async { self?.gpuMs = ms }
        }
        renderer.present(drawable)
    }
}
