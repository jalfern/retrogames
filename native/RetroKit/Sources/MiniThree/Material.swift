// MiniThree textures and materials, three.js r180 names and defaults.

import Foundation
import Metal
import CoreGraphics

public enum Filter { case nearest, linear }
public enum Wrap { case clampToEdge, repeat_, mirroredRepeat }
public enum ColorSpace { case srgb, linear }
public enum Side { case front, back, double }
public enum Blending { case none, normal, additive }

/// Texture / CanvasTexture: an image + sampler state + uv transform. clone()
/// shares the image (one MTLTexture) and copies the sampler/transform, as three.
public final class Texture {
    public var magFilter = Filter.linear
    public var minFilter = Filter.linear
    public var generateMipmaps = true
    public var wrapS = Wrap.clampToEdge, wrapT = Wrap.clampToEdge
    public var offset = Vector2(), `repeat` = Vector2(1, 1), center = Vector2()
    public var rotation = 0.0
    public var colorSpace = ColorSpace.linear
    /// WebGL's UNPACK_FLIP_Y: true for canvases/images, false for glTF and render targets
    public var flipY = true
    final class Source {
        var image: CGImage?
        var rgba: (w: Int, h: Int, data: [UInt8])?
        var mtl: MTLTexture?
        var mtlSRGB: MTLTexture?
        init(image: CGImage?) { self.image = image }
    }
    let source: Source
    public var width: Int { source.mtl?.width ?? source.image?.width ?? source.rgba?.w ?? 0 }
    public var height: Int { source.mtl?.height ?? source.image?.height ?? source.rgba?.h ?? 0 }

    public init(_ image: CGImage) { source = Source(image: image) }
    /// raw straight-alpha RGBA8 pixels, row 0 = top (a canvas's getImageData)
    public init(rgba: [UInt8], width: Int, height: Int) { source = Source(image: nil); source.rgba = (width, height, rgba) }
    init(mtl: MTLTexture) { source = Source(image: nil); source.mtl = mtl; flipY = false }
    init(source: Source) { self.source = source }

    public func clone() -> Texture {
        let t = Texture(source: source)
        t.magFilter = magFilter; t.minFilter = minFilter; t.generateMipmaps = generateMipmaps
        t.wrapS = wrapS; t.wrapT = wrapT; t.offset = offset; t.repeat = `repeat`; t.center = center
        t.rotation = rotation; t.colorSpace = colorSpace; t.flipY = flipY
        return t
    }
    public var needsUpdate: Bool { get { false } set {} }

    /// three's Matrix3.setUvTransform(offset, repeat, rotation, center) → rows
    var uvTransform: (SIMD3<Float>, SIMD3<Float>) {
        let c = cos(rotation), s = sin(rotation)
        let sx = `repeat`.x, sy = `repeat`.y, cx = center.x, cy = center.y, tx = offset.x, ty = offset.y
        let r0 = SIMD3(Float(sx * c), Float(sx * s), Float(-sx * (c * cx + s * cy) + cx + tx))
        let r1 = SIMD3(Float(-sy * s), Float(sy * c), Float(-sy * (-s * cx + c * cy) + cy + ty))
        return (r0, r1)
    }
    public func dispose() {}
}
public typealias CanvasTexture = Texture

nonisolated(unsafe) private var nextUniformObjectId = 1

open class Material {
    public let id: Int
    public var name = ""
    public var transparent = false
    public var opacity = 1.0
    public var alphaTest = 0.0
    public var depthTest = true
    public var depthWrite = true
    public var side = Side.front
    public var shadowSide: Side? = nil
    public var blending = Blending.normal
    public var color = Color()
    public var map: Texture? = nil
    public var vertexColors = false
    public var toneMapped = true
    public var fog = true
    public var visible = true
    public var needsUpdate: Bool { get { false } set {} }
    public init() { id = nextMaterialId; nextMaterialId += 1 }
    open func clone() -> Material { fatalError("clone") }
    func copyBase(to m: Material) {
        m.transparent = transparent; m.opacity = opacity; m.alphaTest = alphaTest; m.depthTest = depthTest
        m.depthWrite = depthWrite; m.side = side; m.shadowSide = shadowSide; m.blending = blending; m.color = color
        m.map = map; m.vertexColors = vertexColors; m.toneMapped = toneMapped; m.fog = fog; m.visible = visible
    }
    public func dispose() {}
}

public final class MeshBasicMaterial: Material {
    public init(map: Texture? = nil, color: Color = Color(), transparent: Bool = false, opacity: Double = 1, alphaTest: Double = 0, depthWrite: Bool = true, blending: Blending = .normal) {
        super.init()
        self.map = map; self.color = color; self.transparent = transparent; self.opacity = opacity
        self.alphaTest = alphaTest; self.depthWrite = depthWrite; self.blending = blending
    }
    public override func clone() -> Material { let m = MeshBasicMaterial(); copyBase(to: m); return m }
}

public final class MeshLambertMaterial: Material {
    public var emissive = Color(r: 0, g: 0, b: 0)
    public init(map: Texture? = nil, color: Color = Color(), transparent: Bool = false, alphaTest: Double = 0) {
        super.init()
        self.map = map; self.color = color; self.transparent = transparent; self.alphaTest = alphaTest
    }
    public override func clone() -> Material { let m = MeshLambertMaterial(); copyBase(to: m); m.emissive = emissive; return m }
}

public final class MeshStandardMaterial: Material {
    public var roughness = 1.0, metalness = 0.0
    public var emissive = Color(r: 0, g: 0, b: 0)
    public override init() { super.init() }
    public override func clone() -> Material {
        let m = MeshStandardMaterial(); copyBase(to: m); m.roughness = roughness; m.metalness = metalness; m.emissive = emissive; return m
    }
}

public final class SpriteMaterial: Material {
    public var sizeAttenuation = true
    public override init() { super.init(); transparent = true }
    public override func clone() -> Material { let m = SpriteMaterial(); copyBase(to: m); m.sizeAttenuation = sizeAttenuation; return m }
}
public final class PointsMaterial: Material {
    public var size = 1.0, sizeAttenuation = true
    public override init() { super.init() }
    public override func clone() -> Material { let m = PointsMaterial(); copyBase(to: m); m.size = size; m.sizeAttenuation = sizeAttenuation; return m }
}
public final class LineBasicMaterial: Material {
    public override init() { super.init() }
    public override func clone() -> Material { let m = LineBasicMaterial(); copyBase(to: m); return m }
}

/// ShaderMaterial: a GLSL post/mesh shader hand-ported to MSL. The body is
/// GLSL-shaped: `vUv` (WebGL convention, v = 0 at the bottom), `texture2D(tName, uv)`,
/// vec2/vec3/vec4, and every uniform by its own name; it must `return` a float4
/// (gl_FragColor). The vertex stage is `gl_Position = vec4(position.xy, 0., 1.)`.
public final class ShaderMaterial: Material {
    public enum Uniform { case float(Double), vec2(Vector2), vec3(Vector3), vec4(Double, Double, Double, Double), texture(Texture?) }
    public let uniformOrder: [String]
    public var uniforms: [String: Uniform]
    public let fragmentShader: String
    public init(uniforms: [(String, Uniform)], fragmentShader: String) {
        uniformOrder = uniforms.map(\.0)
        self.uniforms = Dictionary(uniqueKeysWithValues: uniforms)
        self.fragmentShader = fragmentShader
        super.init()
        depthTest = false; depthWrite = false; blending = .none
    }
    public func set(_ name: String, _ v: Uniform) { uniforms[name] = v }
    var pipeline: Any? = nil
}

/// WebGLRenderTarget: color texture (+ depth), optional MSAA, colorSpace
public final class WebGLRenderTarget {
    public private(set) var width: Int, height: Int
    public let samples: Int
    public let texture: Texture
    public var depthBuffer: Bool
    var colorTex: MTLTexture? = nil, msaaTex: MTLTexture? = nil, depthTex: MTLTexture? = nil
    var dirty = true
    public init(_ width: Int, _ height: Int, samples: Int = 0, colorSpace: ColorSpace = .linear, minFilter: Filter = .linear, magFilter: Filter = .linear, depthBuffer: Bool = true) {
        self.width = width; self.height = height; self.samples = samples; self.depthBuffer = depthBuffer
        texture = Texture(source: Texture.Source(image: nil))
        texture.colorSpace = colorSpace; texture.minFilter = minFilter; texture.magFilter = magFilter
        texture.flipY = true; texture.generateMipmaps = false // sampled like a GL framebuffer: v runs up
    }
    public func setSize(_ w: Int, _ h: Int) { if w != width || h != height { width = w; height = h; dirty = true } }
    public func dispose() { colorTex = nil; msaaTex = nil; depthTex = nil; dirty = true }
}
