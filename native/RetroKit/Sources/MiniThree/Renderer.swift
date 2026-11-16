// MiniThree's renderer: WebGLRenderer's behaviour on Metal.
//
// What it keeps from three r180 (each one changes pixels):
// - render lists: opaque sorted (renderOrder, material.id, z, id), transparent
//   back to front (renderOrder, -z, id); z = object origin through projScreen.
// - a render target gets LINEAR output and no tone mapping; only the canvas
//   (target nil) gets toneMapping + the sRGB OETF (WebGLPrograms rule). The
//   clear colour follows the same rule (getUnlitUniformColorSpace).
// - sRGB-colorSpace targets/textures are *_srgb formats: the hardware encodes
//   on write, decodes on read, and blends in linear, like SRGB8_ALPHA8 in GL.
// - the shadow pass renders casters' opposite faces (shadowSide), depth only.
// - flip-sided objects (negative determinant) swap the front face.
// - blending: Normal = (SRC_ALPHA, 1-SRC_ALPHA | ONE, 1-SRC_ALPHA),
//   Additive = (SRC_ALPHA, ONE | ONE, ONE); depth func LessEqual.

import Foundation
import Metal
import CoreGraphics
import simd

public enum ToneMapping { case none, acesFilmic }

public final class ShadowMapSettings {
    public var enabled = false
    public var type = "PCFShadowMap"
}

public final class WebGLRenderer {
    public let device: MTLDevice
    public let queue: MTLCommandQueue
    public var outputColorSpace = ColorSpace.srgb
    public var toneMapping = ToneMapping.none
    public var toneMappingExposure = 1.0
    public let shadowMap = ShadowMapSettings()
    public var autoClear = true
    /// beyond the web: MSAA on the canvas itself (WebGL's `antialias`)
    public var canvasSamples = 1
    /// stats for -perf
    public private(set) var drawCalls = 0

    private var library: MTLLibrary!
    private var pipelines: [String: MTLRenderPipelineState] = [:]
    private var depthStates: [String: MTLDepthStencilState] = [:]
    private var samplers: [String: MTLSamplerState] = [:]
    private var whiteTex: MTLTexture!
    private var dummyDepth: MTLTexture!
    private var shadowTex: MTLTexture? = nil
    private var shadowSize = 0

    private var target: WebGLRenderTarget? = nil
    private var canvas: MTLTexture? = nil
    private var canvasMSAA: MTLTexture? = nil, canvasDepth: MTLTexture? = nil
    private var commandBuffer: MTLCommandBuffer? = nil
    public private(set) var width = 1, height = 1

    public init(device: MTLDevice? = nil) throws {
        guard let d = device ?? MTLCreateSystemDefaultDevice() else { throw NSError(domain: "MiniThree", code: 1, userInfo: [NSLocalizedDescriptionKey: "no Metal device"]) }
        self.device = d
        queue = d.makeCommandQueue()!
        library = try d.makeLibrary(source: MSL_COMMON + MSL_MAIN, options: nil)
        let td = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: 1, height: 1, mipmapped: false)
        whiteTex = d.makeTexture(descriptor: td)!
        whiteTex.replace(region: MTLRegionMake2D(0, 0, 1, 1), mipmapLevel: 0, withBytes: [UInt8](repeating: 255, count: 4), bytesPerRow: 4)
        let dd = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .depth32Float, width: 1, height: 1, mipmapped: false)
        dd.usage = [.shaderRead, .renderTarget]; dd.storageMode = .private
        dummyDepth = d.makeTexture(descriptor: dd)!
    }

    public func setSize(_ w: Int, _ h: Int) { width = max(1, w); height = max(1, h) }
    public func setRenderTarget(_ rt: WebGLRenderTarget?) { target = rt }
    public func getRenderTarget() -> WebGLRenderTarget? { target }

    /// the canvas for this frame (a drawable's texture or an offscreen texture);
    /// its pixel format must be non-sRGB (the shader encodes, like the web canvas)
    public func setCanvas(_ tex: MTLTexture) {
        canvas = tex
        if canvasSamples > 1 {
            if canvasMSAA == nil || canvasMSAA!.width != tex.width || canvasMSAA!.height != tex.height || canvasMSAA!.pixelFormat != tex.pixelFormat {
                let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: tex.pixelFormat, width: tex.width, height: tex.height, mipmapped: false)
                d.textureType = .type2DMultisample; d.sampleCount = canvasSamples; d.usage = .renderTarget; d.storageMode = .private
                canvasMSAA = device.makeTexture(descriptor: d)
                let dd = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .depth32Float, width: tex.width, height: tex.height, mipmapped: false)
                dd.textureType = .type2DMultisample; dd.sampleCount = canvasSamples; dd.usage = .renderTarget; dd.storageMode = .private
                canvasDepth = device.makeTexture(descriptor: dd)
            }
        } else if canvasDepth == nil || canvasDepth!.width != tex.width || canvasDepth!.height != tex.height || canvasDepth!.textureType != .type2D {
            canvasMSAA = nil
            let dd = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .depth32Float, width: tex.width, height: tex.height, mipmapped: false)
            dd.usage = .renderTarget; dd.storageMode = .private
            canvasDepth = device.makeTexture(descriptor: dd)
        }
    }

    /// the command buffer frames encode into; commit it with `present` / `finish`
    var cb: MTLCommandBuffer {
        if let c = commandBuffer { return c }
        let c = queue.makeCommandBuffer()!
        commandBuffer = c
        return c
    }
    public func present(_ drawable: MTLDrawable?) {
        if let d = drawable { cb.present(d) }
        cb.commit()
        commandBuffer = nil
    }
    public func finish() {
        let c = cb
        c.commit(); c.waitUntilCompleted()
        commandBuffer = nil
    }

    // MARK: textures

    private func upload(_ t: Texture) -> MTLTexture {
        if let m = t.source.mtl { return m }
        var w = 0, h = 0
        var bytes: [UInt8]
        if let r = t.source.rgba { w = r.w; h = r.h; bytes = r.data }
        else if let img = t.source.image { (w, h, bytes) = straightRGBA(img) }
        else { return whiteTex }
        let mip = t.generateMipmaps && t.minFilter == .linear
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: w, height: h, mipmapped: mip)
        d.usage = [.shaderRead, .pixelFormatView]
        let tex = device.makeTexture(descriptor: d)!
        tex.replace(region: MTLRegionMake2D(0, 0, w, h), mipmapLevel: 0, withBytes: bytes, bytesPerRow: w * 4)
        if mip, let c = queue.makeCommandBuffer(), let b = c.makeBlitCommandEncoder() {
            b.generateMipmaps(for: tex); b.endEncoding(); c.commit(); c.waitUntilCompleted()
        }
        t.source.mtl = tex
        return tex
    }
    private func mtl(_ t: Texture) -> MTLTexture {
        let base = upload(t)
        guard t.colorSpace == .srgb, base.pixelFormat == .rgba8Unorm else { return base }
        if let s = t.source.mtlSRGB { return s }
        let s = base.makeTextureView(pixelFormat: .rgba8Unorm_srgb)!
        t.source.mtlSRGB = s
        return s
    }
    private func sampler(_ t: Texture?) -> MTLSamplerState {
        let mag = t?.magFilter ?? .nearest, min_ = t?.minFilter ?? .nearest
        let mip = (t?.generateMipmaps ?? false) && min_ == .linear && t?.source.mtl?.mipmapLevelCount ?? 1 > 1
        let ws = t?.wrapS ?? .clampToEdge, wt = t?.wrapT ?? .clampToEdge
        let key = "\(mag)\(min_)\(mip)\(ws)\(wt)"
        if let s = samplers[key] { return s }
        let d = MTLSamplerDescriptor()
        d.magFilter = mag == .nearest ? .nearest : .linear
        d.minFilter = min_ == .nearest ? .nearest : .linear
        d.mipFilter = mip ? .linear : .notMipmapped
        func addr(_ w: Wrap) -> MTLSamplerAddressMode { w == .clampToEdge ? .clampToEdge : w == .repeat_ ? .repeat : .mirrorRepeat }
        d.sAddressMode = addr(ws); d.tAddressMode = addr(wt)
        let s = device.makeSamplerState(descriptor: d)!
        samplers[key] = s
        return s
    }

    // MARK: render targets

    private func prepare(_ rt: WebGLRenderTarget) {
        guard rt.dirty || rt.colorTex == nil else { return }
        let fmt: MTLPixelFormat = rt.texture.colorSpace == .srgb ? .rgba8Unorm_srgb : .rgba8Unorm
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: fmt, width: rt.width, height: rt.height, mipmapped: false)
        d.usage = [.renderTarget, .shaderRead]; d.storageMode = .private
        rt.colorTex = device.makeTexture(descriptor: d)
        rt.texture.source.mtl = rt.colorTex
        rt.texture.source.mtlSRGB = rt.colorTex
        if rt.samples > 0 {
            let m = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: fmt, width: rt.width, height: rt.height, mipmapped: false)
            m.textureType = .type2DMultisample; m.sampleCount = rt.samples; m.usage = .renderTarget; m.storageMode = .private
            rt.msaaTex = device.makeTexture(descriptor: m)
        } else { rt.msaaTex = nil }
        if rt.depthBuffer {
            let dd = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .depth32Float, width: rt.width, height: rt.height, mipmapped: false)
            if rt.samples > 0 { dd.textureType = .type2DMultisample; dd.sampleCount = rt.samples }
            dd.usage = .renderTarget; dd.storageMode = .private
            rt.depthTex = device.makeTexture(descriptor: dd)
        } else { rt.depthTex = nil }
        rt.dirty = false
    }

    // MARK: pipelines

    private func pipeline(vertex: String, fragment: String, color: MTLPixelFormat, samples: Int, blending: Blending, depth: Bool, lib: MTLLibrary? = nil, keyExtra: String = "") -> MTLRenderPipelineState {
        let key = "\(vertex)|\(fragment)|\(color.rawValue)|\(samples)|\(blending)|\(depth)|\(keyExtra)"
        if let p = pipelines[key] { return p }
        let d = MTLRenderPipelineDescriptor()
        let l = lib ?? library!
        d.vertexFunction = (lib == nil ? library : l).makeFunction(name: vertex) ?? library.makeFunction(name: vertex)
        d.fragmentFunction = l.makeFunction(name: fragment)
        d.rasterSampleCount = samples
        if color != .invalid {
            let a = d.colorAttachments[0]!
            a.pixelFormat = color
            switch blending {
            case .none: a.isBlendingEnabled = false
            case .normal:
                a.isBlendingEnabled = true
                a.sourceRGBBlendFactor = .sourceAlpha; a.destinationRGBBlendFactor = .oneMinusSourceAlpha
                a.sourceAlphaBlendFactor = .one; a.destinationAlphaBlendFactor = .oneMinusSourceAlpha
            case .additive:
                a.isBlendingEnabled = true
                a.sourceRGBBlendFactor = .sourceAlpha; a.destinationRGBBlendFactor = .one
                a.sourceAlphaBlendFactor = .one; a.destinationAlphaBlendFactor = .one
            }
        }
        if depth { d.depthAttachmentPixelFormat = .depth32Float }
        let p = try! device.makeRenderPipelineState(descriptor: d)
        pipelines[key] = p
        return p
    }
    private func depthState(test: Bool, write: Bool) -> MTLDepthStencilState {
        let key = "\(test)\(write)"
        if let s = depthStates[key] { return s }
        let d = MTLDepthStencilDescriptor()
        d.depthCompareFunction = test ? .lessEqual : .always
        d.isDepthWriteEnabled = write
        let s = device.makeDepthStencilState(descriptor: d)!
        depthStates[key] = s
        return s
    }

    private func gpu(_ g: BufferGeometry) -> (MTLBuffer, MTLBuffer?, Int) {
        let ver = g.attributes.values.reduce(0) { $0 + $1.version }
        if g.gpu == nil || g.gpuVersion != ver {
            let pos = g.attributes["position"]!
            let n = pos.count
            var data = [Float](repeating: 0, count: max(1, n) * 12)
            let nor = g.attributes["normal"], uv = g.attributes["uv"], col = g.attributes["color"]
            for i in 0..<n {
                let o = i * 12
                data[o] = pos.array[i * 3]; data[o + 1] = pos.array[i * 3 + 1]; data[o + 2] = pos.array[i * 3 + 2]
                if let nr = nor { data[o + 3] = nr.array[i * 3]; data[o + 4] = nr.array[i * 3 + 1]; data[o + 5] = nr.array[i * 3 + 2] } else { data[o + 5] = 1 }
                if let u = uv { data[o + 6] = u.array[i * 2]; data[o + 7] = u.array[i * 2 + 1] }
                if let c = col {
                    data[o + 8] = c.array[i * c.itemSize]; data[o + 9] = c.array[i * c.itemSize + 1]; data[o + 10] = c.array[i * c.itemSize + 2]
                    data[o + 11] = c.itemSize == 4 ? c.array[i * 4 + 3] : 1
                } else { data[o + 8] = 1; data[o + 9] = 1; data[o + 10] = 1; data[o + 11] = 1 }
            }
            g.gpu = device.makeBuffer(bytes: data, length: data.count * 4)
            if let idx = g.index { g.gpuIndex = device.makeBuffer(bytes: idx, length: max(4, idx.count * 4)) } else { g.gpuIndex = nil }
            g.gpuVersion = ver
        }
        return (g.gpu!, g.gpuIndex, g.index?.count ?? g.attributes["position"]!.count)
    }

    // MARK: render

    private struct Item { let obj: Object3D; let material: Material; let z: Double }

    /// renderer.render(scene, camera)
    public func render(_ scene: Object3D, _ camera: Camera) {
        scene.updateMatrixWorld()
        if camera.parent == nil { camera.updateMatrixWorld() }
        let projScreen = camera.projectionMatrixGL * camera.matrixWorldInverse

        // projectObject: lights + render items (visible chain only)
        var lights: [Light] = []
        var opaque: [Item] = [], transparent: [Item] = []
        func project(_ o: Object3D) {
            guard o.visible else { return }
            if let l = o as? Light { lights.append(l) }
            var mat: Material? = nil
            if let m = o as? Mesh { mat = m.material } else if let s = o as? Sprite { mat = s.material }
            else if let p = o as? Points { mat = p.material } else if let l = o as? Line { mat = l.material }
            if let m = mat, m.visible {
                let z = Vector3.fromMatrixPosition(o.matrixWorld).applying(projScreen).z
                if m.transparent { transparent.append(Item(obj: o, material: m, z: z)) } else { opaque.append(Item(obj: o, material: m, z: z)) }
            }
            for c in o.children { project(c) }
        }
        project(scene)
        opaque.sort { a, b in
            if a.obj.renderOrder != b.obj.renderOrder { return a.obj.renderOrder < b.obj.renderOrder }
            if a.material.id != b.material.id { return a.material.id < b.material.id }
            if a.z != b.z { return a.z < b.z }
            return a.obj.id < b.obj.id
        }
        transparent.sort { a, b in
            if a.obj.renderOrder != b.obj.renderOrder { return a.obj.renderOrder < b.obj.renderOrder }
            if a.z != b.z { return a.z > b.z }
            return a.obj.id < b.obj.id
        }

        // lights → FrameU (view space, as WebGLLights.setupView)
        let view = camera.matrixWorldInverse
        var F = FrameU()
        F.projection = camera.projectionMatrix.f
        F.view = view.f
        var nd = 0, np = 0, nh = 0
        var amb = Color(r: 0, g: 0, b: 0)
        var shadowLight: DirectionalLight? = nil
        F.counts.w = -1
        for l in lights {
            if let a = l as? AmbientLight { amb = Color(r: amb.r + a.color.r * a.intensity, g: amb.g + a.color.g * a.intensity, b: amb.b + a.color.b * a.intensity); continue }
            if let d = l as? DirectionalLight, nd < 4 {
                let lp = Vector3.fromMatrixPosition(d.matrixWorld), tp = Vector3.fromMatrixPosition(d.target.matrixWorld)
                let dir = (lp - tp).transformDirection(view)
                withUnsafeMutablePointer(to: &F.dir) { p in
                    p.withMemoryRebound(to: DirLightU.self, capacity: 4) { $0[nd] = DirLightU(direction: SIMD4(dir.f, 0), color: SIMD4((d.color * d.intensity).f, 0)) }
                }
                if d.castShadow && shadowMap.enabled && shadowLight == nil { shadowLight = d; F.counts.w = Int32(nd) }
                nd += 1
            } else if let p = l as? PointLight, np < 8 {
                let pos = Vector3.fromMatrixPosition(p.matrixWorld).applying(view)
                withUnsafeMutablePointer(to: &F.point) { ptr in
                    ptr.withMemoryRebound(to: PointLightUS.self, capacity: 8) { $0[np] = PointLightUS(position: SIMD4(pos.f, 1), color: SIMD4((p.color * p.intensity).f, 0), distDecay: SIMD4(Float(p.distance), Float(p.decay), 0, 0)) }
                }
                np += 1
            } else if let h = l as? HemisphereLight, nh < 2 {
                let dir = Vector3.fromMatrixPosition(h.matrixWorld).normalized().transformDirection(view)
                withUnsafeMutablePointer(to: &F.hemi) { ptr in
                    ptr.withMemoryRebound(to: HemiLightU.self, capacity: 2) { $0[nh] = HemiLightU(direction: SIMD4(dir.f, 0), sky: SIMD4((h.color * h.intensity).f, 0), ground: SIMD4((h.groundColor * h.intensity).f, 0)) }
                }
                nh += 1
            }
        }
        F.counts.x = Int32(nd); F.counts.y = Int32(np); F.counts.z = Int32(nh)
        F.ambient = SIMD4(amb.f, 0)
        let toCanvas = target == nil
        F.output = SIMD4(toCanvas && toneMapping == .acesFilmic ? 1 : 0, toCanvas && outputColorSpace == .srgb ? 1 : 0, camera is OrthographicCamera ? 1 : 0, 0)
        F.exposure = SIMD4(Float(toneMappingExposure), 0, 0, 0)
        if let sc = scene as? Scene {
            if let f = sc.fog { F.fogColor = SIMD4(f.color.f, 1); F.fogParams = SIMD4(Float(f.near), Float(f.far), 0, 0) }
            else if let f = sc.fogExp2 { F.fogColor = SIMD4(f.color.f, 2); F.fogParams = SIMD4(0, 0, Float(f.density), 0) }
        }

        // shadow pass (WebGLShadowMap.render)
        if let sl = shadowLight { renderShadow(sl, scene: scene, frame: &F) }

        // main pass
        let rpd = MTLRenderPassDescriptor()
        let colorFmt: MTLPixelFormat, samples: Int, w: Int, h: Int
        if let rt = target {
            prepare(rt)
            colorFmt = rt.colorTex!.pixelFormat; samples = max(1, rt.samples); w = rt.width; h = rt.height
            if let m = rt.msaaTex {
                rpd.colorAttachments[0].texture = m
                rpd.colorAttachments[0].resolveTexture = rt.colorTex
                rpd.colorAttachments[0].storeAction = .multisampleResolve
            } else {
                rpd.colorAttachments[0].texture = rt.colorTex
                rpd.colorAttachments[0].storeAction = .store
            }
            if let d = rt.depthTex { rpd.depthAttachment.texture = d; rpd.depthAttachment.loadAction = .clear; rpd.depthAttachment.clearDepth = 1; rpd.depthAttachment.storeAction = .dontCare }
        } else {
            guard let c = canvas else { return }
            colorFmt = c.pixelFormat; samples = canvasMSAA != nil ? canvasSamples : 1; w = c.width; h = c.height
            if let m = canvasMSAA {
                rpd.colorAttachments[0].texture = m
                rpd.colorAttachments[0].resolveTexture = c
                rpd.colorAttachments[0].storeAction = .multisampleResolve
            } else {
                rpd.colorAttachments[0].texture = c
                rpd.colorAttachments[0].storeAction = .store
            }
            rpd.depthAttachment.texture = canvasDepth; rpd.depthAttachment.loadAction = .clear; rpd.depthAttachment.clearDepth = 1; rpd.depthAttachment.storeAction = .dontCare
        }
        F.viewport = SIMD4(Float(w), Float(h), 0, 0)
        let hasDepth = rpd.depthAttachment.texture != nil
        if autoClear {
            var bg = (scene as? Scene)?.background ?? Color(r: 0, g: 0, b: 0)
            if toCanvas && outputColorSpace == .srgb { bg = Color(r: Color.linearToSRGB(bg.r), g: Color.linearToSRGB(bg.g), b: Color.linearToSRGB(bg.b)) }
            rpd.colorAttachments[0].loadAction = .clear
            rpd.colorAttachments[0].clearColor = MTLClearColor(red: bg.r, green: bg.g, blue: bg.b, alpha: 1)
        } else { rpd.colorAttachments[0].loadAction = .load }

        guard let enc = cb.makeRenderCommandEncoder(descriptor: rpd) else { return }
        enc.setVertexBytes(&F, length: MemoryLayout<FrameU>.stride, index: 1)
        enc.setFragmentBytes(&F, length: MemoryLayout<FrameU>.stride, index: 1)
        enc.setFragmentTexture(shadowTex ?? dummyDepth, index: 1)
        enc.setFragmentSamplerState(sampler(nil), index: 1)
        for list in [opaque, transparent] {
            for it in list { draw(it, enc: enc, camera: camera, colorFmt: colorFmt, samples: samples, hasDepth: hasDepth) }
        }
        enc.endEncoding()
    }

    private func objUniforms(_ o: Object3D, _ m: Material, _ camera: Camera) -> ObjU {
        var U = ObjU()
        U.model = o.matrixWorld.f
        let mv = camera.matrixWorldInverse * o.matrixWorld
        U.modelView = mv.f
        let nm = mv.normalMatrix
        U.normalM0 = SIMD4(nm.columns.0, 0); U.normalM1 = SIMD4(nm.columns.1, 0); U.normalM2 = SIMD4(nm.columns.2, 0)
        U.diffuse = SIMD4(m.color.f, Float(m.opacity))
        var model: Int32 = 0
        var rough = 1.0, metal = 0.0
        if let l = m as? MeshLambertMaterial { model = 1; U.emissive = SIMD4(l.emissive.f, 0) }
        if let s = m as? MeshStandardMaterial { model = 2; rough = s.roughness; metal = s.metalness; U.emissive = SIMD4(s.emissive.f, 0) }
        var size = 1.0, atten = 1
        if let p = m as? PointsMaterial { size = p.size; atten = p.sizeAttenuation ? 1 : 0 }
        if let s = m as? SpriteMaterial { atten = s.sizeAttenuation ? 1 : 0 }
        U.pbr = SIMD4(Float(rough), Float(metal), Float(m.alphaTest), Float(size))
        let g = (o as? Mesh)?.geometry ?? (o as? Points)?.geometry ?? (o as? Line)?.geometry
        let vc: Int32 = m.vertexColors ? ((g?.attributes["color"]?.itemSize ?? 3) == 4 ? 4 : 3) : 0
        U.flags = SIMD4(model, m.map != nil ? 1 : 0, vc, m.transparent ? 1 : 0)
        U.flags2 = SIMD4(o.receiveShadow ? 1 : 0, m.side == .double ? 1 : 0, m.fog ? 1 : 0, m.toneMapped ? 1 : 0)
        U.flags3 = SIMD4(m.map?.flipY ?? false ? 1 : 0, Int32(atten), 0, 0)
        if let t = m.map { let (r0, r1) = t.uvTransform; U.uv0 = SIMD4(r0, 0); U.uv1 = SIMD4(r1, 0) }
        else { U.uv0 = SIMD4(1, 0, 0, 0); U.uv1 = SIMD4(0, 1, 0, 0) }
        if let s = o as? Sprite { U.sprite = SIMD4(Float(s.center.x), Float(s.center.y), 0, 0) }
        return U
    }

    private func draw(_ it: Item, enc: MTLRenderCommandEncoder, camera: Camera, colorFmt: MTLPixelFormat, samples: Int, hasDepth: Bool) {
        let o = it.obj, m = it.material
        let blend: Blending = m.transparent ? m.blending : (m.blending == .additive ? .additive : .none)
        if let sm = m as? ShaderMaterial {
            drawPost(o as! Mesh, sm, enc: enc, colorFmt: colorFmt, samples: samples, hasDepth: hasDepth)
            return
        }
        var U = objUniforms(o, m, camera)
        enc.setDepthStencilState(depthState(test: m.depthTest && hasDepth, write: m.depthWrite && hasDepth))
        let flip = o.matrixWorld.determinant < 0
        enc.setFrontFacing(flip ? .clockwise : .counterClockwise)
        switch m.side { case .front: enc.setCullMode(.back); case .back: enc.setCullMode(.front); case .double: enc.setCullMode(.none) }
        enc.setFragmentTexture(m.map.map { mtl($0) } ?? whiteTex, index: 0)
        enc.setFragmentSamplerState(sampler(m.map), index: 0)
        enc.setVertexBytes(&U, length: MemoryLayout<ObjU>.stride, index: 2)
        enc.setFragmentBytes(&U, length: MemoryLayout<ObjU>.stride, index: 2)
        drawCalls += 1
        if o is Sprite {
            enc.setRenderPipelineState(pipeline(vertex: "spriteVertex", fragment: "meshFragment", color: colorFmt, samples: samples, blending: blend, depth: hasDepth))
            enc.setCullMode(.none)
            enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 6)
            return
        }
        if let p = o as? Points {
            let (vb, _, n) = gpu(p.geometry)
            enc.setRenderPipelineState(pipeline(vertex: "pointsVertex", fragment: "pointsFragment", color: colorFmt, samples: samples, blending: blend, depth: hasDepth))
            enc.setVertexBuffer(vb, offset: 0, index: 0)
            enc.drawPrimitives(type: .point, vertexStart: 0, vertexCount: n)
            return
        }
        let g: BufferGeometry
        var lineType: MTLPrimitiveType? = nil
        if let l = o as? Line { g = l.geometry; lineType = l.segments ? .line : .lineStrip }
        else { g = (o as! Mesh).geometry }
        let (vb, ib, n) = gpu(g)
        enc.setRenderPipelineState(pipeline(vertex: "meshVertex", fragment: "meshFragment", color: colorFmt, samples: samples, blending: blend, depth: hasDepth))
        enc.setVertexBuffer(vb, offset: 0, index: 0)
        var instanced: Int32 = 0, count = 1
        if let im = o as? InstancedMesh {
            instanced = 1; count = im.count
            var mats = im.instanceMatrix.prefix(count).map { $0.f }
            if mats.isEmpty { return }
            enc.setVertexBytes(&mats, length: mats.count * MemoryLayout<simd_float4x4>.stride, index: 3)
            var cols = (im.instanceColor ?? Array(repeating: Color(), count: count)).prefix(count).map { SIMD4<Float>($0.f, 1) }
            enc.setVertexBytes(&cols, length: cols.count * 16, index: 4)
            if im.instanceColor != nil { U.flags.z = 3; enc.setVertexBytes(&U, length: MemoryLayout<ObjU>.stride, index: 2) }
        } else {
            enc.setVertexBuffer(vb, offset: 0, index: 3); enc.setVertexBuffer(vb, offset: 0, index: 4)
        }
        enc.setVertexBytes(&instanced, length: 4, index: 5)
        if let lt = lineType {
            enc.setCullMode(.none)
            if let ib = ib { enc.drawIndexedPrimitives(type: lt, indexCount: n, indexType: .uint32, indexBuffer: ib, indexBufferOffset: 0) }
            else { enc.drawPrimitives(type: lt, vertexStart: 0, vertexCount: n) }
            return
        }
        if let ib = ib { enc.drawIndexedPrimitives(type: .triangle, indexCount: n, indexType: .uint32, indexBuffer: ib, indexBufferOffset: 0, instanceCount: count) }
        else { enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: n, instanceCount: count) }
    }

    // ShaderMaterial: compile the GLSL-shaped MSL body once per material
    private var postLibs: [Int: MTLLibrary] = [:]
    private func drawPost(_ mesh: Mesh, _ sm: ShaderMaterial, enc: MTLRenderCommandEncoder, colorFmt: MTLPixelFormat, samples: Int, hasDepth: Bool) {
        var floats: [Float] = []
        var texNames: [String] = []
        for n in sm.uniformOrder {
            switch sm.uniforms[n]! {
            case .float(let v): floats += [Float(v), 0, 0, 0]
            case .vec2(let v): floats += [Float(v.x), Float(v.y), 0, 0]
            case .vec3(let v): floats += [Float(v.x), Float(v.y), Float(v.z), 0]
            case .vec4(let a, let b, let c, let d): floats += [Float(a), Float(b), Float(c), Float(d)]
            case .texture: texNames.append(n)
            }
        }
        let lib: MTLLibrary
        if let l = postLibs[sm.id] { lib = l } else {
            var src = MSL_POST_PRELUDE
            var fields = "", defines = "", params = ""
            for n in sm.uniformOrder {
                switch sm.uniforms[n]! {
                case .float: fields += "float4 \(n)_v;"; defines += "#define \(n) (u_.\(n)_v.x)\n"
                case .vec2: fields += "float4 \(n)_v;"; defines += "#define \(n) (u_.\(n)_v.xy)\n"
                case .vec3: fields += "float4 \(n)_v;"; defines += "#define \(n) (u_.\(n)_v.xyz)\n"
                case .vec4: fields += "float4 \(n)_v;"; defines += "#define \(n) (u_.\(n)_v)\n"
                case .texture: break
                }
            }
            if fields.isEmpty { fields = "float4 _pad;" }
            for (i, n) in texNames.enumerated() { params += ", texture2d<float> \(n)_ [[texture(\(i))]], sampler \(n)_s [[sampler(\(i))]]" }
            src += "struct U { \(fields) };\n\(defines)\n"
            src += "fragment float4 postFragment(PostOut in [[stage_in]], constant U& u_ [[buffer(0)]]\(params)) {\n float2 vUv = in.vUv;\n\(sm.fragmentShader)\n}\n"
            src += "vertex PostOut postVertex(uint vid [[vertex_id]], const device float* verts [[buffer(0)]]) { const device float* v = verts + vid * 12; PostOut o; o.pos = float4(v[0], v[1], 0.0, 1.0); o.vUv = float2(v[6], v[7]); return o; }\n"
            lib = try! device.makeLibrary(source: src, options: nil)
            postLibs[sm.id] = lib
        }
        let ps = pipeline(vertex: "postVertex", fragment: "postFragment", color: colorFmt, samples: samples, blending: sm.blending, depth: hasDepth, lib: lib, keyExtra: "post\(sm.id)")
        enc.setRenderPipelineState(ps)
        enc.setDepthStencilState(depthState(test: false, write: false))
        enc.setCullMode(.none)
        let (vb, ib, n) = gpu(mesh.geometry)
        enc.setVertexBuffer(vb, offset: 0, index: 0)
        if floats.isEmpty { floats = [0, 0, 0, 0] }
        enc.setFragmentBytes(floats, length: floats.count * 4, index: 0)
        for (i, name) in texNames.enumerated() {
            if case .texture(let t?) = sm.uniforms[name]! {
                enc.setFragmentTexture(mtl(t), index: i); enc.setFragmentSamplerState(sampler(t), index: i)
            } else { enc.setFragmentTexture(whiteTex, index: i); enc.setFragmentSamplerState(sampler(nil), index: i) }
        }
        drawCalls += 1
        if let ib = ib { enc.drawIndexedPrimitives(type: .triangle, indexCount: n, indexType: .uint32, indexBuffer: ib, indexBufferOffset: 0) }
        else { enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: n) }
        // the shared FrameU/ObjU slots are rebound by the next mesh draw
    }

    // MARK: shadows

    private func renderShadow(_ light: DirectionalLight, scene: Object3D, frame F: inout FrameU) {
        let s = light.shadow
        let size = Int(s.mapSize.x)
        if shadowTex == nil || shadowSize != size {
            let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .depth32Float, width: size, height: Int(s.mapSize.y), mipmapped: false)
            d.usage = [.renderTarget, .shaderRead]; d.storageMode = .private
            shadowTex = device.makeTexture(descriptor: d)
            shadowSize = size
        }
        // DirectionalLightShadow.updateMatrices
        let cam = s.camera
        cam.updateProjectionMatrix()
        cam.position = Vector3.fromMatrixPosition(light.matrixWorld)
        cam.lookAt(Vector3.fromMatrixPosition(light.target.matrixWorld).x, Vector3.fromMatrixPosition(light.target.matrixWorld).y, Vector3.fromMatrixPosition(light.target.matrixWorld).z)
        cam.updateMatrixWorld()
        // bias maps x, y to [0, 1]; z is already [0, 1] in the Metal projection
        let bias = Matrix4(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1)
        let lightVP = cam.projectionMatrix * cam.matrixWorldInverse
        s.matrix = bias * lightVP
        F.shadowMatrix = s.matrix.f
        F.shadowParams = SIMD4(Float(s.bias), Float(s.radius), Float(s.intensity), Float(size))

        let rpd = MTLRenderPassDescriptor()
        rpd.depthAttachment.texture = shadowTex
        rpd.depthAttachment.loadAction = .clear; rpd.depthAttachment.clearDepth = 1; rpd.depthAttachment.storeAction = .store
        guard let enc = cb.makeRenderCommandEncoder(descriptor: rpd) else { return }
        enc.setDepthStencilState(depthState(test: true, write: true))
        enc.setRenderPipelineState(pipeline(vertex: "depthVertex", fragment: "depthFragment", color: .invalid, samples: 1, blending: .none, depth: true))
        var vp = lightVP.f
        enc.setVertexBytes(&vp, length: MemoryLayout<simd_float4x4>.stride, index: 1)
        func visit(_ o: Object3D) {
            guard o.visible else { return }
            if let m = o as? Mesh, o.castShadow, m.material.visible, !(m.material is ShaderMaterial) {
                var U = objUniforms(o, m.material, cam)
                let side = m.material.shadowSide ?? (m.material.side == .front ? .back : m.material.side == .back ? .front : .double)
                enc.setFrontFacing(o.matrixWorld.determinant < 0 ? .clockwise : .counterClockwise)
                switch side { case .front: enc.setCullMode(.back); case .back: enc.setCullMode(.front); case .double: enc.setCullMode(.none) }
                enc.setVertexBytes(&U, length: MemoryLayout<ObjU>.stride, index: 2)
                enc.setFragmentBytes(&U, length: MemoryLayout<ObjU>.stride, index: 2)
                enc.setFragmentTexture(m.material.map.map { mtl($0) } ?? whiteTex, index: 0)
                enc.setFragmentSamplerState(sampler(m.material.map), index: 0)
                let (vb, ib, n) = gpu(m.geometry)
                enc.setVertexBuffer(vb, offset: 0, index: 0)
                var instanced: Int32 = 0, count = 1
                if let im = m as? InstancedMesh {
                    instanced = 1; count = im.count
                    var mats = im.instanceMatrix.prefix(count).map { $0.f }
                    if !mats.isEmpty { enc.setVertexBytes(&mats, length: mats.count * MemoryLayout<simd_float4x4>.stride, index: 3) }
                } else { enc.setVertexBuffer(vb, offset: 0, index: 3) }
                enc.setVertexBytes(&instanced, length: 4, index: 5)
                if count > 0 {
                    if let ib = ib { enc.drawIndexedPrimitives(type: .triangle, indexCount: n, indexType: .uint32, indexBuffer: ib, indexBufferOffset: 0, instanceCount: count) }
                    else { enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: n, instanceCount: count) }
                }
            }
            for c in o.children { visit(c) }
        }
        visit(scene)
        enc.endEncoding()
    }

    // MARK: readback (offscreen parity frames)

    /// read an rgba8/bgra8 texture back as straight RGBA rows (top first)
    public func readPixels(_ tex: MTLTexture) -> [UInt8] {
        let w = tex.width, h = tex.height
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: tex.pixelFormat, width: w, height: h, mipmapped: false)
        d.storageMode = .shared
        let staging = device.makeTexture(descriptor: d)!
        let c = queue.makeCommandBuffer()!
        let b = c.makeBlitCommandEncoder()!
        b.copy(from: tex, to: staging)
        b.endEncoding(); c.commit(); c.waitUntilCompleted()
        var out = [UInt8](repeating: 0, count: w * h * 4)
        staging.getBytes(&out, bytesPerRow: w * 4, from: MTLRegionMake2D(0, 0, w, h), mipmapLevel: 0)
        if tex.pixelFormat == .bgra8Unorm || tex.pixelFormat == .bgra8Unorm_srgb {
            for i in stride(from: 0, to: out.count, by: 4) { out.swapAt(i, i + 2) }
        }
        return out
    }
    public func makeOffscreenCanvas(_ w: Int, _ h: Int) -> MTLTexture {
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: w, height: h, mipmapped: false)
        d.usage = [.renderTarget, .shaderRead]; d.storageMode = .private
        return device.makeTexture(descriptor: d)!
    }
}

/// CGImage → straight-alpha RGBA8 rows (top first), as a canvas's getImageData
public func straightRGBA(_ img: CGImage) -> (Int, Int, [UInt8]) {
    let w = img.width, h = img.height
    var out = [UInt8](repeating: 0, count: w * h * 4)
    let ai = img.alphaInfo
    let order = img.bitmapInfo.intersection(.byteOrderMask)
    if img.bitsPerComponent == 8, img.bitsPerPixel == 32, (ai == .last || ai == .noneSkipLast), order == [] || order == .byteOrder32Big,
       let data = img.dataProvider?.data, let p = CFDataGetBytePtr(data) {
        let bpr = img.bytesPerRow
        for y in 0..<h { for x in 0..<w { for k in 0..<4 { out[(y * w + x) * 4 + k] = p[y * bpr + x * 4 + k] } } }
        if ai == .noneSkipLast { for i in stride(from: 3, to: out.count, by: 4) { out[i] = 255 } }
        return (w, h, out)
    }
    // fallback: draw premultiplied, then unpremultiply
    let cs = CGColorSpaceCreateDeviceRGB()
    let ctx = CGContext(data: &out, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    for i in stride(from: 0, to: out.count, by: 4) {
        let a = Int(out[i + 3])
        if a > 0 && a < 255 { for k in 0..<3 { out[i + k] = UInt8(min(255, (Int(out[i + k]) * 255 + a / 2) / a)) } }
    }
    return (w, h, out)
}

// MARK: GPU structs (layout must match MSL_COMMON)

struct DirLightU { var direction = SIMD4<Float>(); var color = SIMD4<Float>() }
struct PointLightUS { var position = SIMD4<Float>(); var color = SIMD4<Float>(); var distDecay = SIMD4<Float>() }
struct HemiLightU { var direction = SIMD4<Float>(); var sky = SIMD4<Float>(); var ground = SIMD4<Float>() }

struct FrameU {
    var projection = matrix_identity_float4x4
    var view = matrix_identity_float4x4
    var shadowMatrix = matrix_identity_float4x4
    var dir = (DirLightU(), DirLightU(), DirLightU(), DirLightU())
    var point = (PointLightUS(), PointLightUS(), PointLightUS(), PointLightUS(), PointLightUS(), PointLightUS(), PointLightUS(), PointLightUS())
    var hemi = (HemiLightU(), HemiLightU())
    var ambient = SIMD4<Float>()
    var fogColor = SIMD4<Float>()
    var fogParams = SIMD4<Float>()
    var shadowParams = SIMD4<Float>()
    var counts = SIMD4<Int32>()
    var output = SIMD4<Int32>()
    var exposure = SIMD4<Float>()
    var viewport = SIMD4<Float>()
}
struct ObjU {
    var model = matrix_identity_float4x4
    var modelView = matrix_identity_float4x4
    var normalM0 = SIMD4<Float>(), normalM1 = SIMD4<Float>(), normalM2 = SIMD4<Float>()
    var diffuse = SIMD4<Float>()
    var emissive = SIMD4<Float>()
    var uv0 = SIMD4<Float>(), uv1 = SIMD4<Float>()
    var pbr = SIMD4<Float>()
    var flags = SIMD4<Int32>()
    var flags2 = SIMD4<Int32>()
    var flags3 = SIMD4<Int32>()
    var sprite = SIMD4<Float>()
}
