// EMBERWOOD — HD-2D renderer: a line-for-line port of
// src/games/Emberwood/render.js onto MiniThree (RetroKit's three.js subset on
// Metal). Read render.js for the why of every number; this file keeps its
// order, names and comments' issue numbers so the two can be diffed by eye.
//
// Coordinate convention: X = east (tileX*TS), Y = south (tileY*TS), Z = height.
// The camera perches south-above and looks north-down; camera.up=(0,-1,0)
// mirrors X, so every view-space x passes through MX() — render.js calls it
// FX(); renamed here because the sim already has an FX type (#772).
//
// Native-only knobs (never used by the parity gate): `quality.tv` raises the
// shadow map and lifts the 1280-px cap to the drawable's own size. Math.random is `random` (the parity gate pins it to 0.5).

import Foundation
import CoreGraphics
import MiniThree
import RetroKit
#if canImport(EmberwoodCore)
import EmberwoodCore
#endif

let WALL_H = 12.0
@inline(__always) func MX(_ x: Double) -> Double { Double(SW * TS) - x }

// #789 living foliage — one deterministic wind field drives every plant.
public enum WIND {
    public static func gust(_ x: Double, _ y: Double, _ t: Double) -> Double { 0.55 + 0.45 * jsSin(t * 0.37 + x * 0.008 - y * 0.011) }
    public static func field(_ x: Double, _ y: Double, _ t: Double, _ sp: Double, _ ph: Double) -> Double {
        jsSin(t * sp + x * 0.05 + y * 0.03 + ph) * 0.65 + jsSin(t * sp * 0.47 - y * 0.041 + x * 0.013 + ph * 1.7) * 0.35
    }
    public static func tree(_ x: Double, _ y: Double, _ t: Double) -> Double { field(x, y, t, 1.35, 0) * gust(x, y, t) * 0.05 }
    public static func bush(_ x: Double, _ y: Double, _ t: Double) -> Double { field(x, y, t, 3.1, 1.9) * gust(x, y, t) * 0.09 }
    public static func grass(_ x: Double, _ y: Double, _ t: Double) -> Double { field(x, y, t, 2.6, 0.7) * gust(x, y, t) * 0.06 }
}

let SOLID_H: [Character: Double] = ["#": WALL_H, "T": 2, "H": WALL_H, "R": WALL_H, "=": 5, "I": 3, "v": WALL_H]

// #939 shelf pull
public enum SHELF_DECOR {
    public static let trees = ["tree_pine", "tree_oak", "tree_pine_tall"]
    public static let bush = "bush"
}

// #981 the townsfolk breathe
let NPC_IDLE = (bob: 0.035, lean: 0.1, deadband: 12.0, leanK: 0.004)
func npcRhythm(_ id: String) -> (phase: Double, spd: Double) {
    var h: Int32 = 7
    for c in id.utf16 { h = h &* 31 &+ Int32(c) }
    let a = abs(Int(h))
    return (Double(a % 628) / 100, 1.8 + Double(a % 5) * 0.12)
}
/// paintNpc's canvases are painted by Chrome (scripts/exportart.mjs runs render.js's own paintNpc)
func npcArtKey(_ id: String, _ kind: String) -> String { id == "colporter" ? "npc_colporter" : kind == "shop" ? "npc_keeper" : "npc_plain" }

// #829 crisp: device resolution capped at MAX_LONG; textures stay Nearest.
let MAX_LONG = 1280.0

public struct Quality {
    public var shadowMapSize = 1024
    public var maxLong = 1280.0
    public var canvasSamples = 1
    public static let web = Quality()
    /// beyond the web on the TV: the scene pass (4x MSAA) at the drawable's own
    /// size — 3840x2160 on a 4K set, where the web caps at 1280 — and a 4096² sun shadow map
    public static let tv = Quality(shadowMapSize: 4096, maxLong: .infinity, canvasSamples: 1)
}

/// A pooled billboard (mkBillboard)
final class Billboard {
    let mesh: Mesh, shadow: Mesh, mat: MeshBasicMaterial
    var texKey = ""
    var lastYaw = 0.0, yaw = 0.0, spd = 0.0, oriented = 0
    init(mesh: Mesh, shadow: Mesh, mat: MeshBasicMaterial) { self.mesh = mesh; self.shadow = shadow; self.mat = mat }
}

public final class EmberwoodRenderer {
    public let renderer: WebGLRenderer
    public let lite: Bool
    public var quality: Quality
    /// Math.random (particles, shake, torch flicker, vent spores)
    public var random: () -> Double = { Double.random(in: 0..<1) }
    let art: (String) -> CGImage?
    let shelfURL: (String) -> URL?
    let width: Double, height: Double

    let scene = Scene()
    public let camera: OrthographicCamera
    let hemi: HemisphereLight, sun: DirectionalLight, lantern: PointLight
    var torchLights: [PointLight] = []
    let BASE_VIEW_H = 210.0, COVER_W = 280.0
    var viewH: Double
    let CAM_Y = 88.0 + 120
    var chargeZ = 1.0

    var TEX = false
    var texCache: [String: Texture] = [:]
    let rtScene: WebGLRenderTarget, rtA: WebGLRenderTarget, rtB: WebGLRenderTarget, rtC: WebGLRenderTarget, rtD: WebGLRenderTarget
    public private(set) var bufW: Int, bufH: Int
    var samples = 0
    let quadGeo = PlaneGeometry(2, 2)
    let quadCam = OrthographicCamera(-1, 1, 1, -1, 0, 1)
    let quad: Mesh
    let quadScene = Scene()
    let brightMat: ShaderMaterial, blurMat: ShaderMaterial, compMat: ShaderMaterial

    var screenGroup = Group()
    public private(set) var currentScreen: String? = nil
    var structureSig = ""
    var staticMeshes: [Object3D] = []
    struct Canopy { let mesh: Object3D; let mats: [Material]?; let facing: String?; let x: Double; let y: Double; var o: Double }
    struct Bush { let mesh: Object3D; let mats: [Material]?; let facing: String?; let x: Double; let y: Double }
    var canopies: [Canopy] = []
    var bushes: [Bush] = []
    var grassTiles: [(tex: Texture, x: Double, y: Double)] = []
    var braziers: [(mesh: Mesh, x: Double, y: Double)] = []
    var vents: [(mesh: Mesh, id: String, x: Double, y: Double)] = []
    struct NpcPose { var requires: String?; var phase: Double; var spd: Double; var nx: Int; var ny: Int; var face: Double; var lean = 0.0 }
    var dynDoors: [String: Mesh] = [:], dynCracks: [String: Mesh] = [:], dynChests: [String: Mesh] = [:]
    var dynSwitches: [(id: String, mesh: Mesh, gustRune: Bool, phase: Double)] = []
    var dynNpcs: [(id: String, mesh: Mesh)] = []
    var npcPose: [String: NpcPose] = [:]

    // #939 shelf state
    var shelf: [String: (src: Object3D, facing: String, h: Double)]? = nil
    var lastScreenArgs: (String, Flags, [String: Bool])? = nil
    let STAND_UP = Double.pi / 2

    var npcFacing: [String: Double] = [:]

    // entity billboards
    var billboards: [Billboard] = []
    var heroBB: Billboard! = nil
    let ARC_DUR = 12.0
    let ARC_DIRS: [Dir: Double] = [.up: 0, .right: Double.pi / 2, .down: Double.pi, .left: -Double.pi / 2]
    let ARC_DIRV: [Dir: (Double, Double)] = [.up: (0, -1), .down: (0, 1), .left: (-1, 0), .right: (1, 0)]
    var arcMat: MeshBasicMaterial! = nil
    var arcMesh: Mesh! = nil
    var bbPool: [Billboard] = [], projPool: [Billboard] = [], dropPool: [Billboard] = [], tailPool: [Billboard] = [], bombPool: [Billboard] = [], blockBBs: [Billboard] = []
    var tailLive = 0

    // particles
    let PARTS = 90
    struct Part { let m: Mesh; var life = 0.0, vx = 0.0, vy = 0.0, vz = 0.0 }
    var parts: [Part] = []
    var partIdx = 0
    let partGeo = PlaneGeometry(3, 3)
    var shake = 0.0

    var simFocus = (128.0, 88.0)
    var waterTime = 0.0

    public init(renderer: WebGLRenderer, lite: Bool = false, width: Int = 480, height: Int = 288, quality: Quality = .web,
                art: @escaping (String) -> CGImage?, shelfURL: @escaping (String) -> URL?) {
        self.renderer = renderer; self.lite = lite; self.quality = quality
        self.art = art; self.shelfURL = shelfURL
        self.width = Double(width); self.height = Double(height)
        renderer.setSize(width, height)
        renderer.shadowMap.enabled = !lite
        renderer.shadowMap.type = "PCFShadowMap"
        renderer.outputColorSpace = .srgb
        renderer.toneMapping = .acesFilmic
        renderer.toneMappingExposure = 1.35
        renderer.canvasSamples = quality.canvasSamples

        scene.background = Color("#1a1626")
        let aspect = Double(width) / Double(height)
        viewH = max(BASE_VIEW_H, COVER_W / aspect)
        camera = OrthographicCamera(-viewH * aspect / 2, viewH * aspect / 2, viewH / 2, -viewH / 2, 1, 900)
        camera.position.set(128, CAM_Y, 150)
        camera.up.set(0, -1, 0)
        camera.lookAt(128, 88, 2)

        hemi = HemisphereLight(0xbfd8ff, 0x3c3226, 1.15)
        scene.add(hemi)
        sun = DirectionalLight(0xffd9a0, 2.4)
        sun.position.set(MX(-80), 200, 150)
        sun.target.position.set(128, 88, 0)
        if !lite {
            sun.castShadow = true
            sun.shadow.mapSize = Vector2(Double(quality.shadowMapSize), Double(quality.shadowMapSize))
            sun.shadow.camera.left = -180; sun.shadow.camera.right = 180
            sun.shadow.camera.top = 180; sun.shadow.camera.bottom = -180
            sun.shadow.camera.near = 1; sun.shadow.camera.far = 600
            sun.shadow.bias = -0.0018
        }
        scene.add(sun); scene.add(sun.target)
        lantern = PointLight(0xffb36b, 0, 90, 1.4)
        scene.add(lantern)
        for _ in 0..<4 {
            let l = PointLight(0xff9a3c, 0, 72, 1.3)
            scene.add(l); torchLights.append(l)
        }

        bufW = width; bufH = height
        rtScene = WebGLRenderTarget(width, height, samples: 4, colorSpace: .srgb)
        rtA = WebGLRenderTarget(width / 2, height / 2)
        rtB = WebGLRenderTarget(width / 2, height / 2)
        rtC = WebGLRenderTarget(width / 2, height / 2)
        rtD = WebGLRenderTarget(width / 2, height / 2)
        samples = lite ? 0 : 4

        quad = Mesh(quadGeo, MeshBasicMaterial())
        quadScene.add(quad)
        // GLSL → MSL by hand; same constants, same order of operations
        brightMat = ShaderMaterial(uniforms: [("tSrc", .texture(nil))], fragmentShader: """
            vec3 c = texture2D(tSrc, vUv).rgb; float l = dot(c, vec3(.25, .6, .15)); return vec4(c * smoothstep(0.55, 0.92, l), 1.0);
            """)
        blurMat = ShaderMaterial(uniforms: [("tSrc", .texture(nil)), ("dir", .vec2(Vector2(1, 0))), ("r", .float(1.0)), ("res", .vec2(Vector2(Double(width), Double(height))))], fragmentShader: """
            vec2 px = dir * r / res; vec3 s = texture2D(tSrc, vUv).rgb * 0.227;
            s += texture2D(tSrc, vUv + px * 1.384).rgb * 0.316; s += texture2D(tSrc, vUv - px * 1.384).rgb * 0.316;
            s += texture2D(tSrc, vUv + px * 3.230).rgb * 0.070; s += texture2D(tSrc, vUv - px * 3.230).rgb * 0.070;
            return vec4(s, 1.0);
            """)
        compMat = ShaderMaterial(uniforms: [("tScene", .texture(nil)), ("tBloom", .texture(nil)), ("tSoft", .texture(nil)), ("focus", .vec2(Vector2(0.5, 0.5))), ("vig", .float(0))], fragmentShader: """
            vec3 c = texture2D(tScene, vUv).rgb;
            c += texture2D(tBloom, vUv).rgb * 0.7;
            float f = smoothstep(0.16, 0.42, distance(vUv, focus));
            c = mix(c, texture2D(tSoft, vUv).rgb, f * 0.5);
            float v = 1.0 - (0.4 + vig) * pow(length(vUv - 0.5) * 1.42, 2.2);
            c *= clamp(v, 0.55, 1.0);
            // lin2srgb (#773: the scene RT samples back linear; encode here)
            c = clamp(c, 0.0, 1.0);
            c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
            return vec4(c, 1.0);
            """)

        scene.add(screenGroup)

        // ---- entity billboards (creation order kept: object ids break sort ties) ----
        heroBB = mkBillboard(16, 18)
        arcMat = MeshBasicMaterial(map: nil, transparent: true, depthWrite: false, blending: .additive)
        arcMat.opacity = 0
        arcMat.map = art("fx_arc").map(makeTex) // render.js paints it on a canvas; exportart.mjs runs that code
        arcMesh = Mesh(PlaneGeometry(26, 26), arcMat)
        arcMesh.quaternion = camera.quaternion
        arcMesh.visible = false
        scene.add(arcMesh)
        for _ in 0..<12 { bbPool.append(mkBillboard(16, 16)) }
        for _ in 0..<10 { projPool.append(mkBillboard(12, 8)) }
        for _ in 0..<14 { dropPool.append(mkBillboard(10, 10)) }
        // #888 the Wyrm tail gets its own shingled segment billboards
        for _ in 0..<20 { tailPool.append(mkBillboard(12, 12)) }
        for _ in 0..<4 { bombPool.append(mkBillboard(10, 12)) }
        for _ in 0..<2 {
            let b = mkBillboard(14, 14)
            b.mat.map = art("fx_block").map(makeTex) // #1511 the push-block rides the 2x pass too
            blockBBs.append(b)
        }

        for _ in 0..<PARTS {
            let m = Mesh(partGeo, MeshBasicMaterial(transparent: true, depthWrite: false))
            m.visible = false
            scene.add(m)
            parts.append(Part(m: m))
        }
    }

    func makeTex(_ img: CGImage) -> Texture {
        let t = CanvasTexture(img)
        t.magFilter = .nearest
        t.minFilter = .nearest
        t.generateMipmaps = false
        t.colorSpace = .srgb
        return t
    }
    /// T('hero/up/w1') — the Chrome-painted art.js canvases, by path
    func T(_ key: String) -> Texture? {
        if !TEX { return nil }
        if let t = texCache[key] { return t }
        guard let img = art(key.replacingOccurrences(of: "/", with: "_")) else { return nil }
        let t = makeTex(img)
        texCache[key] = t
        return t
    }

    func mkBillboard(_ w: Double, _ h: Double) -> Billboard {
        let mat = MeshBasicMaterial(transparent: true, depthWrite: false)
        let m = Mesh(PlaneGeometry(w, h), mat)
        m.quaternion = camera.quaternion
        scene.add(m)
        let shadow = Mesh(PlaneGeometry(w * 0.8, h * 0.5), MeshBasicMaterial(color: Color(r: 0, g: 0, b: 0), transparent: true, opacity: 0.3, depthWrite: false))
        scene.add(shadow)
        let b = Billboard(mesh: m, shadow: shadow, mat: mat)
        billboards.append(b)
        return b
    }

    /// #829: the drawing buffer follows the drawable (capped at maxLong); the
    /// web reads the canvas's CSS size × dpr — the host hands us pixels.
    public func resize(_ cw: Int, _ ch: Int) {
        var bw: Int, bh: Int
        if lite {
            let bar = Double(cw) / Double(ch)
            if bar >= 1 { bw = Int(width); bh = Int(jsRound(width / bar)) } else { bh = 640; bw = Int(jsRound(640 * bar)) }
        } else {
            bw = cw; bh = ch
            let long = Double(max(bw, bh))
            if long > quality.maxLong {
                let k = quality.maxLong / long
                bw = Int(jsRound(Double(bw) * k)); bh = Int(jsRound(Double(bh) * k))
            }
        }
        bw = max(2, bw); bh = max(2, bh)
        if bw == bufW && bh == bufH { return }
        bufW = bw; bufH = bh
        renderer.setSize(bw, bh)
        rtScene.setSize(bw, bh)
        let hw = max(1, Int(jsRound(Double(bw) / 2))), hh = max(1, Int(jsRound(Double(bh) / 2)))
        rtA.setSize(hw, hh); rtB.setSize(hw, hh); rtC.setSize(hw, hh); rtD.setSize(hw, hh)
        let ar = Double(bw) / Double(bh)
        viewH = max(BASE_VIEW_H, COVER_W / ar)
        camera.left = -viewH * ar / 2; camera.right = viewH * ar / 2
        camera.top = viewH / 2; camera.bottom = -viewH / 2
        camera.updateProjectionMatrix()
    }

    public func attachShelf() {
        let ids = Array(Set(SHELF_DECOR.trees + [SHELF_DECOR.bush])).sorted()
        var map: [String: (src: Object3D, facing: String, h: Double)] = [:]
        for id in ids {
            guard let u = shelfURL(id), let root = try? GLTFLoader.load(url: u) else { return }
            let box = box3FromObject(root)
            let size = box.max - box.min
            let src = root.clone(true)
            map[id] = (src, "radial", size.y != 0 ? size.y : (size.z != 0 ? size.z : 1)) // shelf.json: all four are 'radial'
        }
        shelf = map
        if currentScreen != nil, let a = lastScreenArgs { buildScreen(a.0, a.1, a.2) }
    }

    func putShelfProp(_ id: String, _ x: Double, _ y: Double, _ targetH: Double, _ yaw: Double) -> (group: Group, mats: [Material], facing: String)? {
        guard let t = shelf?[id] else { return nil }
        let src = t.src.clone(true)
        var mats: [Material] = []
        src.traverse { o in
            guard let m = o as? Mesh else { return }
            m.material = m.material.clone()
            mats.append(m.material)
            if !self.lite { m.castShadow = true }
        }
        src.scale.setScalar(targetH / t.h)
        if t.facing == "+z" { src.quaternion = camera.quaternion }
        else { src.rotation = Euler(STAND_UP, 0, yaw) }
        let g = Group()
        g.add(src)
        g.position.set(MX(x), y, 0)
        screenGroup.add(g); staticMeshes.append(g)
        return (g, mats, t.facing)
    }

    func tileTexKey(_ ch: Character) -> String {
        ([".": "grass", "\"": "tallgrass", ",": "path", "~": "water", "T": "grass", "#": "stone", "a": "ash", "v": "crag",
          "=": "grass", "H": "house", "R": "roof", "I": "grass", "C": "stone", "S": "stairs", "<": "stone", "A": "cinderface"] as [Character: String])[ch] ?? "grass"
    }
    func tile(_ s: Screen, _ x: Int, _ y: Int) -> Character { Character(UnicodeScalar(tileAt(s, x, y))) }

    public func buildScreen(_ id: String, _ flags: Flags, _ cut: [String: Bool]) {
        disposeScreen()
        currentScreen = id
        lastScreenArgs = (id, flags, cut)
        let s = World.screens[id]!
        let dark = s.dark
        scene.background = Color(dark ? "#0d0b14" : "#22305a")
        hemi.intensity = dark ? 0.5 : 1.15
        sun.intensity = dark ? 0.12 : 2.4
        lantern.intensity = dark ? 4 : 0
        var spots: [(Int, Int)] = []
        if dark {
            for d in s.doors ?? [] { spots.append((d.x, d.y == 0 ? 1 : d.y - 1)) }
            for c in s.chests ?? [] { spots.append((c.x, c.y == 0 ? 1 : c.y - 1)) }
            spots.append((2, 1)); spots.append((13, 9))
        }
        for (i, p) in spots.prefix(4).enumerated() {
            torchLights[i].position.set(MX(Double(p.0 * TS + 8)), Double(p.1 * TS + 8), 10)
            torchLights[i].intensity = dark ? 7 : 0
        }

        let floorGeo = PlaneGeometry(Double(TS), Double(TS))
        var reserved = Set<String>()
        let xy: [(Int, Int)] = (s.doors ?? []).map { ($0.x, $0.y) } + (s.chests ?? []).map { ($0.x, $0.y) } + (s.switches ?? []).map { ($0.x, $0.y) }
            + (s.plates ?? []).map { ($0.x, $0.y) } + (s.cracks ?? []).map { ($0.x, $0.y) } + (s.npcs ?? []).map { ($0.x, $0.y) }
            + (s.signs ?? []).map { ($0.x, $0.y) } + (s.warps ?? []).map { ($0.x, $0.y) } + (s.enemies ?? []).map { ($0.x, $0.y) }
        for (x, y) in xy { reserved.insert("\(x),\(y)") }
        if let sp = s.spawn { reserved.insert("\(sp[0]),\(sp[1])") }
        for y in 0..<SH {
            for x in 0..<SW {
                let ch = tile(s, x, y)
                let tex = T(tileTexKey(ch))
                let z0 = ch == "~" ? -0.6 : 0
                let mat = MeshLambertMaterial(map: tex)
                let m = Mesh(floorGeo, mat)
                m.position.set(MX(Double(x * TS + 8)), Double(y * TS + 8), z0)
                m.receiveShadow = !lite
                if ch == "~" { m.material.color.set("#9fc8e8") }
                if ch == "\"" && cut["\(id):\(x),\(y)"] == true { m.material.map = T("grass") }
                else if ch == "\"", let tg = T("tallgrass") {
                    let cl = tg.clone()
                    cl.wrapS = .mirroredRepeat; cl.wrapT = .mirroredRepeat
                    m.material.map = cl
                    grassTiles.append((cl, Double(x * TS + 8), Double(y * TS + 8)))
                }
                screenGroup.add(m); staticMeshes.append(m)
                if ch == "." {
                    let nearTree = tile(s, x - 1, y) == "T" || tile(s, x + 1, y) == "T" || tile(s, x, y - 1) == "T" || tile(s, x, y + 1) == "T"
                    if nearTree && x > 0 && y > 0 && x < SW - 1 && y < SH - 1 && !reserved.contains("\(x),\(y)") && (x * 7 + y * 13) % 3 == 0 && T("bush") != nil {
                        let px = Double(x * TS + 8), py = Double(y * TS + 8)
                        if let sp = putShelfProp(SHELF_DECOR.bush, px, py, 10, Double((x * 11 + y * 5) % 12) * Double.pi / 6) {
                            bushes.append(Bush(mesh: sp.group, mats: sp.mats, facing: sp.facing, x: px, y: py))
                        } else {
                            let bu = Mesh(PlaneGeometry(14, 10), MeshLambertMaterial(map: T("bush"), transparent: true, alphaTest: 0.4))
                            bu.quaternion = camera.quaternion
                            bu.position.set(MX(px), py, 5)
                            screenGroup.add(bu); staticMeshes.append(bu)
                            bushes.append(Bush(mesh: bu, mats: nil, facing: nil, x: px, y: py))
                        }
                    }
                }
                if ch == "T" {
                    let px = Double(x * TS + 8), py = Double(y * TS + 8)
                    if let sp = putShelfProp(SHELF_DECOR.trees[(x * 7 + y * 13) % SHELF_DECOR.trees.count], px, py + 4, 30, Double((x * 5 + y * 7) % 12) * Double.pi / 6) {
                        canopies.append(Canopy(mesh: sp.group, mats: sp.mats, facing: sp.facing, x: px, y: py, o: 1))
                    } else {
                        let tr = Mesh(PlaneGeometry(24, 30), MeshLambertMaterial(map: T("tree"), transparent: true, alphaTest: 0.4))
                        tr.quaternion = camera.quaternion
                        tr.position.set(MX(px), py + 6, 12)
                        screenGroup.add(tr); staticMeshes.append(tr)
                        canopies.append(Canopy(mesh: tr, mats: nil, facing: nil, x: px, y: py, o: 1))
                    }
                }
                if ch == "I" {
                    let sg = Mesh(PlaneGeometry(16, 16), MeshLambertMaterial(map: T("sign"), transparent: true, alphaTest: 0.4))
                    sg.quaternion = camera.quaternion
                    sg.position.set(MX(Double(x * TS + 8)), Double(y * TS + 6), 8)
                    screenGroup.add(sg); staticMeshes.append(sg)
                }
                if ch == "<" {
                    let pt = Mesh(PlaneGeometry(14, 14), MeshBasicMaterial(map: T("portal"), transparent: true))
                    pt.position.set(MX(Double(x * TS + 8)), Double(y * TS + 8), 0.2)
                    screenGroup.add(pt); staticMeshes.append(pt)
                }
                if let h = SOLID_H[ch], ch != "T" && ch != "I" && ch != "<" && ch != "C" {
                    let topKey = ch == "#" ? "wallTop" : (ch == "H" || ch == "R" ? "roof" : (ch == "=" ? "fence" : "rock"))
                    let box = Mesh(BoxGeometry(Double(TS), Double(TS), h), MeshLambertMaterial(map: ch == "#" ? T("wall") : (ch == "=" ? T("fence") : T(topKey)), color: ch == "#" ? Color("#9a95ad") : Color(0xffffff)))
                    box.position.set(MX(Double(x * TS + 8)), Double(y * TS + 8), h / 2)
                    if !lite { box.castShadow = true; box.receiveShadow = true }
                    screenGroup.add(box); staticMeshes.append(box)
                }
            }
        }
        for p in s.plates ?? [] {
            let ring = Mesh(PlaneGeometry(14, 14), MeshBasicMaterial(map: T("plate"), color: Color(0xc9a24a), transparent: true))
            ring.position.set(MX(Double(p.x * TS + 8)), Double(p.y * TS + 8), 0.15)
            screenGroup.add(ring); staticMeshes.append(ring)
        }
        for sw in s.switches ?? [] {
            let plaque = Mesh(PlaneGeometry(12, 12), MeshLambertMaterial(map: T(sw.via == "gust" ? "runeGust" : "switchP")))
            plaque.position.set(MX(Double(sw.x * TS + 8)), Double(sw.y * TS + 8), 8)
            // #1063 the wind-rune flutters with the vale's wind
            screenGroup.add(plaque); staticMeshes.append(plaque)
            dynSwitches.append((sw.id, plaque, sw.via == "gust", Double((sw.x * 31 + sw.y * 17) % 13)))
        }
        for c in s.chests ?? [] {
            let ch2 = Mesh(PlaneGeometry(14, 12), MeshLambertMaterial(map: T("chest/closed"), transparent: true, alphaTest: 0.4))
            ch2.quaternion = camera.quaternion
            ch2.position.set(MX(Double(c.x * TS + 8)), Double(c.y * TS + 8), 6)
            screenGroup.add(ch2); staticMeshes.append(ch2)
            dynChests[c.id] = ch2
        }
        for d in s.doors ?? [] {
            let box = Mesh(BoxGeometry(Double(TS), Double(TS), WALL_H), MeshLambertMaterial(map: T(d.kind == "bigkey" ? "doorBig" : (d.kind == "heart" ? "doorHeart" : "door"))))
            box.position.set(MX(Double(d.x * TS + 8)), Double(d.y * TS + 8), WALL_H / 2)
            if !lite { box.castShadow = true }
            screenGroup.add(box); staticMeshes.append(box)
            dynDoors[d.id] = box
        }
        for cr in s.cracks ?? [] {
            let box = Mesh(BoxGeometry(Double(TS), Double(TS), WALL_H), MeshLambertMaterial(map: T("crack")))
            box.position.set(MX(Double(cr.x * TS + 8)), Double(cr.y * TS + 8), WALL_H / 2)
            if !lite { box.castShadow = true }
            screenGroup.add(box); staticMeshes.append(box)
            dynCracks[cr.id] = box
        }
        braziers.removeAll()
        for b in s.braziers ?? [] {
            // T('brazier') is the frame pair, not an image: no map until sync picks a frame
            let mb = Mesh(PlaneGeometry(12, 16), MeshLambertMaterial(map: nil, transparent: true, alphaTest: 0.4))
            mb.quaternion = camera.quaternion
            mb.position.set(MX(Double(b.x * TS + 8)), Double(b.y * TS + 8), 8)
            screenGroup.add(mb); staticMeshes.append(mb)
            braziers.append((mb, Double(b.x * TS + 8), Double(b.y * TS + 8)))
        }
        vents.removeAll()
        for v in s.vents ?? [] {
            let mv = Mesh(PlaneGeometry(14, 12), MeshLambertMaterial(map: T("vent"), transparent: true, alphaTest: 0.4))
            mv.position.set(MX(Double(v.x * TS + 8)), Double(v.y * TS + 8), 0.2)
            screenGroup.add(mv); staticMeshes.append(mv)
            vents.append((mv, v.id, Double(v.x * TS + 8), Double(v.y * TS + 8)))
        }
        for n in s.npcs ?? [] {
            let nn = Mesh(PlaneGeometry(14, 18), MeshLambertMaterial(map: art(npcArtKey(n.id, n.kind)).map(makeTex), transparent: true, alphaTest: 0.4))
            nn.quaternion = camera.quaternion
            nn.position.set(MX(Double(n.x * TS + 8)), Double(n.y * TS + 8), 9)
            if n.requires != nil { nn.visible = false }
            let r = npcRhythm(n.id)
            npcPose[n.id] = NpcPose(requires: n.requires, phase: r.phase, spd: r.spd, nx: n.x, ny: n.y, face: npcFacing[n.id] ?? 1)
            screenGroup.add(nn); staticMeshes.append(nn)
            dynNpcs.append((n.id, nn))
        }
    }

    func disposeScreen() {
        scene.remove(screenGroup)
        screenGroup = Group()
        scene.add(screenGroup)
        staticMeshes.removeAll(); canopies.removeAll(); bushes.removeAll(); grassTiles.removeAll()
        braziers.removeAll(); vents.removeAll()
        dynDoors.removeAll(); dynCracks.removeAll(); dynChests.removeAll(); dynSwitches.removeAll(); dynNpcs.removeAll()
    }

    func setTex(_ b: Billboard, _ key: String) {
        if b.texKey == key { return }
        if let t = T(key) { b.mat.map = t; b.texKey = key }
    }

    // ---- particles ----
    func spawnParts(_ x: Double, _ y: Double, _ colors: [String], _ n: Int, _ spread: Double = 2.4, _ up: Double = 1.6) {
        for _ in 0..<n {
            var p = parts[partIdx]; let pi = partIdx; partIdx = (partIdx + 1) % PARTS
            p.m.visible = true
            p.m.material.color.set(colors[Int(jsFloor(random() * Double(colors.count)))])
            p.m.position.set(MX(x), y, 6 + random() * 8)
            p.vx = (random() - 0.5) * spread
            p.vy = (random() - 0.5) * spread
            p.vz = random() * up
            p.life = 18 + random() * 18
            parts[pi] = p
        }
    }
    let JUICE: [String: [String]] = ["hit": ["#ffd27a", "#ff9a3c"], "blood": ["#8a4030", "#c96a4a"], "cut": ["#8cc45f", "#b7e08a"], "boom": ["#ffd27a", "#ff9a3c", "#ff5a2a"], "coin": ["#ffe08a", "#ffb238"], "magic": ["#8ce0ff", "#bff2ff"], "dust": ["#9b8254", "#8a714a", "#6e5a3a"], "shard": ["#7c3d30", "#5c2f2f", "#c9613a"], "mote": ["#ffd27a", "#ff9a3c", "#ffb238"]]

    func spawnDust(_ x: Double, _ y: Double, _ dirx: Double, _ diry: Double, _ n: Int) {
        for _ in 0..<n {
            var p = parts[partIdx]; let pi = partIdx; partIdx = (partIdx + 1) % PARTS
            p.m.visible = true
            let c = JUICE["dust"]!
            p.m.material.color.set(c[Int(jsFloor(random() * Double(c.count)))])
            p.m.position.set(MX(x + (random() - 0.5) * 4), y + (random() - 0.5) * 3, 1 + random() * 2)
            p.vx = dirx * 0.5 + (random() - 0.5) * 0.7
            p.vy = diry * 0.5 + (random() - 0.5) * 0.7
            p.vz = 0.15 + random() * 0.35
            p.life = 12 + random() * 10
            parts[pi] = p
        }
    }
    func spawnMotes(_ x: Double, _ y: Double, _ z: Double) {
        for _ in 0..<2 {
            var p = parts[partIdx]; let pi = partIdx; partIdx = (partIdx + 1) % PARTS
            p.m.visible = true
            let c = JUICE["mote"]!
            p.m.material.color.set(c[Int(jsFloor(random() * Double(c.count)))])
            p.m.position.set(MX(x + (random() - 0.5) * 12), y + (random() - 0.5) * 12, (z != 0 ? z : 6) + (random() - 0.5) * 6)
            p.vx = (random() - 0.5) * 0.35
            p.vy = -(0.15 + random() * 0.25)
            p.vz = (random() - 0.5) * 0.15
            p.life = 55 + random() * 45
            parts[pi] = p
        }
    }

    public func onFx(_ events: [FX]) {
        for e in events {
            switch e.k {
            case "sword": spawnParts(e.x + (e.dir == .left ? -8 : e.dir == .right ? 8 : 0), e.y + (e.dir == .down ? 8 : e.dir == .up ? -8 : 0), ["#ffffff", "#ffd87a"], 3, 1.4, 1)
            case "hit": spawnParts(e.x, e.y, JUICE["hit"]!, 7); shake = max(shake, 3)
            case "die": spawnParts(e.x, e.y, JUICE["blood"]!, 12); shake = max(shake, 4)
            case "cut": spawnParts(e.x, e.y, JUICE["cut"]!, 6, 1.8, 1.2)
            case "boom": spawnParts(e.x, e.y, JUICE["boom"]!, 26, 4.5, 3); shake = max(shake, 7)
            case "crack": spawnParts(e.x, e.y, ["#8d8999", "#4e4a5a", "#ffd27a"], 16, 3.5, 2.4)
            case "coin": spawnParts(e.x, e.y, JUICE["coin"]!, 4, 1.2, 1.4)
            case "heart": spawnParts(e.x, e.y, ["#ff8896", "#e8384a"], 5, 1.4, 1.4)
            case "key", "unlock": spawnParts(e.x, e.y, ["#e8c24a", "#fff3cf"], 8, 2, 1.6)
            case "switch": spawnParts(e.x, e.y, ["#c9a24a", "#ffe08a"], 10, 2.2, 1.8)
            case "shoot": spawnParts(e.x, e.y, ["#e8e2d0"], 2, 1, 0.6)
            case "spit": spawnParts(e.x, e.y, JUICE["magic"]!, 4, 1.6, 1)
            case "hurt": shake = max(shake, 6)
            case "clank": spawnParts(e.x, e.y, ["#ffffff", "#cfd6e6"], 5, 2, 1.2)
            case "stagger": spawnParts(e.x, e.y, ["#ff9a3c", "#ffd27a", "#ffffff"], 22, 4, 3); shake = max(shake, 8)
            case "pop": spawnParts(e.x, e.y, JUICE["cut"]!, 6, 2, 1.4)
            case "dust": spawnDust(e.x, e.y + 3, e.dirx, e.diry, 3)
            case "split": spawnParts(e.x, e.y, JUICE["shard"]!, 10, 3.2, 2); spawnParts(e.x, e.y, ["#ff9a3c", "#ffd87a"], 6, 2, 2.4); shake = max(shake, 3)
            case "warp": spawnParts(e.x, e.y, ["#8ce0ff", "#bff2ff"], 12, 2.4, 2)
            case "grant": spawnParts(e.x, e.y, ["#ffd27a", "#fff3cf", "#8ce0ff"], 14, 2.6, 2.2)
            case "gust", "galecharge": spawnParts(e.x, e.y, ["#e8f4ff", "#8ce0ff", "#bff2ff"], 8, 2.6, 1.4)
            case "mote": spawnMotes(e.x, e.y, e.z)
            case "seal": spawnParts(e.x, e.y, ["#8cc45f", "#cfd6e6", "#6fae4e"], 12, 2.4, 1.8)
            case "spore": spawnParts(e.x, e.y, ["#8cc45f", "#4c8438"], 6, 2, 1.2)
            case "mantle": spawnParts(e.x, e.y, ["#57506a", "#2c2733", "#ff7a3c"], 14, 3.2, 2.2); shake = max(shake, 5)
            case "roar": spawnParts(e.x, e.y, ["#ff9a3c", "#ffd27a"], 18, 3.6, 2.6); shake = max(shake, 7)
            default: break
            }
        }
    }

    func probeLight(_ x: Double, _ y: Double, _ dark: Bool) -> Double {
        if !dark { return 1 }
        var v = 0.5
        for l in torchLights {
            if l.intensity <= 0 { continue }
            let d = jsHypot(l.position.x - MX(x), l.position.y - y)
            v += max(0, 1 - d / 70) * 1.6
        }
        let dl = jsHypot(lantern.position.x - MX(x), lantern.position.y - y)
        v += max(0, 1 - dl / 66) * 0.9
        return min(1.3, v)
    }

    public func sync(_ sim: Sim, _ tSec: Double) {
        if !TEX { return }
        let dark = World.screens[sim.screen]?.dark ?? false
        let sig = "\(sim.screen)|\(sim.flags.cracked.count)|\(sim.flags.doorsOpen.count)|\(sim.flags.chestsOpen.count)|\(sim.flags.ventsOff.count)"
        if sig != structureSig || sim.screen != currentScreen {
            buildScreen(sim.screen, sim.flags, sim.cut)
            structureSig = sig
            for (cid, mesh) in dynChests where sim.flags.chestsOpen[cid] == true { mesh.material.map = T("chest/open") }
            for (did, mesh) in dynDoors where sim.flags.doorsOpen[did] == true { mesh.visible = false }
            for (kid, mesh) in dynCracks where sim.flags.cracked[kid] == true { mesh.visible = false }
            for sw in dynSwitches where sim.flags.switchesOn[sw.id] == true { sw.mesh.material.color.set("#4aff7a") }
            for vt in vents where sim.flags.ventsOff[vt.id] == true { vt.mesh.material.map = T("ventSealed") }
        }
        let s = World.screens[sim.screen]!
        for d in s.doors ?? [] {
            guard let mesh = dynDoors[d.id] else { continue }
            let open = d.kind == "switch" ? (sim.flags.switchesOn[d.switch ?? ""] ?? false) : (sim.flags.doorsOpen[d.id] ?? false)
            mesh.visible = !open
        }
        let hx = sim.hero.x, hy = sim.hero.y
        var nmap: [String: Npc] = [:]
        for n in sim.npcs { nmap[n.id] = n }
        for (npcId, mesh) in dynNpcs {
            var u = npcPose[npcId]!
            if let r = u.requires { mesh.visible = sim.items.has(r) }
            if !mesh.visible { continue }
            let n = nmap[npcId]
            // #994 the townsfolk stroll
            let bx = n?.x ?? Double(u.nx * TS + 8)
            let by = n?.y ?? Double(u.ny * TS + 8)
            let breathe = jsSin(tSec * u.spd + u.phase)
            let gait = (n?.moving ?? false) ? jsSin(tSec * 11 + u.phase * 7) * 0.045 : 0
            let sc = 1 + breathe * NPC_IDLE.bob + gait
            let dxp = hx - bx
            if let n = n, n.moving, (n.wx - n.x) != 0 { u.face = n.wx > n.x ? 1 : -1 }
            else if dxp > NPC_IDLE.deadband { u.face = 1 }
            else if dxp < -NPC_IDLE.deadband { u.face = -1 }
            npcFacing[npcId] = u.face
            let lean = max(-NPC_IDLE.lean, min(NPC_IDLE.lean, dxp * NPC_IDLE.leanK))
            u.lean = lean
            mesh.quaternion = camera.quaternion
            mesh.rotateZ(lean)
            mesh.scale.set(u.face, sc, 1)
            mesh.position.x = MX(bx)
            mesh.position.y = by
            mesh.position.z = 9 * sc
            npcPose[npcId] = u
        }
        for i in canopies.indices {
            var cp = canopies[i]
            let under = abs(hx - cp.x) < 11 && hy > cp.y - 10 && hy < cp.y + 12
            cp.o += ((under ? 0.5 : 1) - cp.o) * 0.25
            if let mats = cp.mats {
                let faded = cp.o < 0.999
                for m in mats {
                    m.opacity = cp.o
                    m.transparent = faded
                    m.depthWrite = !faded
                }
                cp.mesh.rotation.x = STAND_UP + WIND.tree(cp.x, cp.y, tSec)
            } else {
                (cp.mesh as! Mesh).material.opacity = cp.o
                cp.mesh.quaternion = camera.quaternion
                cp.mesh.rotateZ(WIND.tree(cp.x, cp.y, tSec))
            }
            canopies[i] = cp
        }
        for b in bushes {
            if b.mats != nil {
                b.mesh.rotation.x = STAND_UP + WIND.bush(b.x, b.y, tSec)
            } else {
                b.mesh.quaternion = camera.quaternion
                b.mesh.rotateZ(WIND.bush(b.x, b.y, tSec))
            }
            b.mesh.position.x = MX(b.x) + jsSin(tSec * 4.7 + b.x * 0.11) * WIND.gust(b.x, b.y, tSec) * 0.35
        }
        for gt in grassTiles { gt.tex.offset.x = WIND.grass(gt.x, gt.y, tSec) }
        let anim = Int(jsFloor(tSec * 7)) % 2
        for bz in braziers {
            // #1063 the brazier flame is a two-frame animation
            if let lit = T("brazier/\(anim)") { bz.mesh.material.map = lit }
            bz.mesh.material.color.setRGB(1 + (anim != 0 ? 0.25 : 0), 1 + (anim != 0 ? 0.1 : 0), 1)
        }
        for vt in vents {
            let off = sim.flags.ventsOff[vt.id] ?? false
            vt.mesh.material.map = T(off ? "ventSealed" : "vent")
            if off { vt.mesh.material.color.setRGB(1, 1, 1) }
            else {
                // #1063 an unsealed vent pulses amber
                let k = 0.5 + 0.5 * jsSin(tSec * 3.2 + vt.x * 0.13 + vt.y * 0.07)
                vt.mesh.material.color.setRGB(1.2, 0.6 + 0.3 * k, 0.25 + 0.15 * k)
            }
            if !off && random() < 0.06 { spawnParts(vt.x, vt.y, ["#8cc45f", "#6fae4e", "#b7e08a"], 1, 1.2, 1.1) }
        }
        for sw in dynSwitches where sw.gustRune {
            let w = WIND.gust(sw.mesh.position.x, sw.mesh.position.y, tSec)
            sw.mesh.rotation.z = jsSin(tSec * 1.7 + sw.phase) * 0.12 * w
            sw.mesh.position.z = 8 + jsSin(tSec * 2.3 + sw.phase) * 0.4 * w
        }
        camera.position.x += (MX(128 + (hx - 128) * 0.5) - camera.position.x) * 0.08
        camera.position.y += ((CAM_Y + (hy - 88) * 0.5) - camera.position.y) * 0.08
        let lookX = camera.position.x, lookY = camera.position.y - 120
        camera.lookAt(lookX, lookY, 2)
        // #1063 the gust charge squeezes the stage
        chargeZ += ((sim.galing ? 0.94 : 1) - chargeZ) * (sim.galing ? 0.2 : 0.05)
        let ar2 = Double(bufW) / Double(bufH)
        let vh2 = max(BASE_VIEW_H, COVER_W / ar2)
        camera.left = -vh2 * ar2 / 2 / chargeZ; camera.right = vh2 * ar2 / 2 / chargeZ
        camera.top = vh2 / 2 / chargeZ; camera.bottom = -vh2 / 2 / chargeZ
        camera.updateProjectionMatrix()
        compMat.set("vig", .float((1 - chargeZ) * 5.5))
        if shake > 0.2 {
            camera.position.x += (random() - 0.5) * shake
            camera.position.y += (random() - 0.5) * shake
            shake *= 0.82
        }
        lantern.position.set(MX(hx), hy, 12)

        let pose = sim.swing > 0 ? "slash" : (sim.drawing ? "draw" : ((sim.moving ?? false) ? "w\(anim + 1)" : "w1"))
        setTex(heroBB, "hero/\(sim.hero.dir.rawValue)/\(pose)")
        heroBB.mesh.position.set(MX(hx), hy, 9)
        heroBB.mesh.scale.x = 1
        let hl = probeLight(hx, hy, dark)
        heroBB.mat.color.setRGB(hl, hl, hl)
        if sim.hero.hurt > 0 && Int(jsFloor(tSec * 14)) % 2 == 0 { heroBB.mat.color.set("#ff5c5c") }
        heroBB.shadow.position.set(MX(hx), hy, 0.12)

        if sim.arc > 0 {
            let af = Double(sim.arc) / ARC_DUR
            let (avx, avy) = ARC_DIRV[sim.arcDir] ?? (0, -1)
            arcMesh.visible = true
            arcMesh.quaternion = camera.quaternion
            arcMesh.rotateZ((ARC_DIRS[sim.arcDir] ?? 0) + (0.5 - af) * 0.9)
            arcMesh.position.set(MX(hx + avx * 11), hy + avy * 11, 10)
            let grow = 0.82 + (1 - af) * 0.4
            arcMesh.scale.set(grow, grow, 1)
            arcMat.opacity = af
            if sim.items.blade { arcMat.color.setRGB(1.25, 0.72, 0.38) } else { arcMat.color.setRGB(1.15, 1.0, 0.72) }
        } else {
            arcMesh.visible = false
        }

        for i in 0..<bbPool.count {
            let b = bbPool[i]
            let e: Enemy? = i < sim.enemies.count ? sim.enemies[i] : nil
            guard let e = e, !e.dead, !e.hidden else { b.mesh.visible = false; b.shadow.visible = false; continue }
            b.mesh.visible = true; b.shadow.visible = true
            let key: String
            switch e.type {
            case "bat": key = "bat/\(anim)"
            case "spitter": key = "spitter/\(e.t % 60 < 8 ? 1 : 0)"
            case "husk": key = "husk/\(anim)"
            case "wisp": key = "wisp/\(anim)"
            case "sprig": key = "sprig/\(e.hidden ? 0 : 1)"
            case "tuskroot": key = "tuskroot/\(e.charging > 0 ? 3 : e.st > 0 ? 2 : anim)"
            case "pod": key = "pod/\(e.t % 70 < 26 ? 1 : 0)"
            case "maw": key = "maw/\(e.open != 0 ? "open" : "closed")"
            case "wyrm": key = "wyrm/\(e.open != 0 ? "open" : "closed")"
            case "king": key = "king/\(e.mantle <= 0 ? "core" : (e.t % 30 < 15 ? "mantle0" : "mantle1"))"
            case "hawk": key = "hawk/\(e.charging > 0 ? "stoop" : e.st > 0 ? "call" : e.rest > 0 ? "perch" : "glide")"
            default: key = "cinder/\(anim)"
            }
            setTex(b, key)
            b.mesh.scale.set(1, 1, 1)
            if e.type == "maw" { b.mesh.scale.set(28.0 / 16, 28.0 / 16, 1) }
            if e.type == "wyrm" { b.mesh.scale.set(24.0 / 16, 20.0 / 16, 1) }
            if e.type == "king" { b.mesh.scale.set(28.0 / 16, 28.0 / 16, 1) }
            if e.type == "hawk" { b.mesh.scale.set(22.0 / 16, 18.0 / 16, 1) }
            b.mesh.position.set(MX(e.x), e.y, 8 + (e.type == "bat" || e.type == "wisp" ? 6 : (e.type == "hawk" && e.rest <= 0 ? 5 : 0)))
            b.mesh.scale.x *= (e.fx > 0.1 ? -1 : 1)
            let el = e.hitT > 0 ? 1.7 : probeLight(e.x, e.y, dark)
            b.mat.color.setRGB(min(1.6, el), e.hitT > 0 ? 1.1 : el, e.hitT > 0 ? 1.1 : el)
            b.mat.opacity = e.type == "wisp" ? 0.65 + 0.3 * jsSin(tSec * 6 + (e.i.map(Double.init) ?? .nan)) : 1
            b.shadow.position.set(MX(e.x), e.y, 0.12)
            b.shadow.scale.setScalar(e.boss != 0 ? 2 : 1)
        }
        let wyrm = sim.enemies.first { $0.type == "wyrm" && !$0.dead }
        tailLive = 0
        for i in 0..<tailPool.count {
            let t = tailPool[i]
            let si = (wyrm != nil && !wyrm!.seg.isEmpty) ? i * 3 + 1 : -1
            guard let w = wyrm, si >= 0 && si < w.seg.count else { t.mesh.visible = false; t.shadow.visible = false; continue }
            let p = w.seg[si]
            let pa = w.seg[si - 1]
            let pb = w.seg[min(w.seg.count - 1, si + 1)]
            tailLive += 1
            t.mesh.visible = true
            setTex(t, i % 2 != 0 ? "wyrm/segB" : "wyrm/seg")
            let tx = MX(pa.0) - MX(pb.0)
            let ty = pa.1 - pb.1
            if abs(tx) + abs(ty) > 0.01 { t.lastYaw = jsAtan2(ty, tx); t.oriented = 1 }
            t.mesh.quaternion = camera.quaternion
            t.mesh.rotateZ(t.lastYaw)
            let spd = jsHypot(p.0 - pb.0, p.1 - pb.1) / 3
            let taper = 1 - Double(i) * 0.038
            t.mesh.scale.set(taper * (1 + min(0.16, spd * 0.16)), taper * (1 - min(0.22, spd * 0.2)), 1)
            t.mesh.position.set(MX(p.0), p.1, 7.4 - Double(i) * 0.17 + min(1.1, spd * 1.3) * (1 - Double(i) / Double(tailPool.count)))
            let wl = probeLight(p.0, p.1, dark)
            if w.hitT > 0 { t.mat.color.setRGB(1.7, 1.2, 1.2) }
            else if w.stagger > 0 && (i + Int(jsFloor(tSec * 12))) % 3 == 0 { t.mat.color.setRGB(1.5, 0.85, 0.4) }
            else { t.mat.color.setRGB(wl, wl, wl) }
            t.shadow.visible = false
            t.yaw = t.lastYaw
            t.spd = spd
        }
        for i in 0..<dropPool.count {
            let d = dropPool[i]
            guard i < sim.drops.count else { d.mesh.visible = false; d.shadow.visible = false; continue }
            let dr = sim.drops[i]
            d.mesh.visible = true; d.shadow.visible = true
            setTex(d, dr.kind == "ember" ? "ember/\(anim)" : dr.kind)
            d.mesh.position.set(MX(dr.x), dr.y, 5 + jsSin(tSec * 5 + Double(dr.t) * 0.1) * 1.5)
            let dl2 = probeLight(dr.x, dr.y, dark)
            d.mat.color.setRGB(dl2, dl2, dl2)
            d.shadow.position.set(MX(dr.x), dr.y, 0.12)
        }
        for i in 0..<projPool.count {
            let p = projPool[i]
            guard i < sim.projectiles.count else { p.mesh.visible = false; p.shadow.visible = false; continue }
            let pr = sim.projectiles[i]
            p.mesh.visible = true
            setTex(p, pr.kind == "arrow" ? "arrow" : (pr.kind == "gust" ? "gust" : "orb"))
            p.mat.opacity = pr.kind == "gust" ? max(0.2, min(1, Double(pr.life ?? 0) / 24)) : 1
            p.mesh.position.set(MX(pr.x), pr.y, 8)
            p.mesh.rotation.z = jsAtan2(pr.vy, pr.vx)
            let pl = probeLight(pr.x, pr.y, dark)
            p.mat.color.setRGB(pl, pl, pl)
            p.shadow.visible = false
        }
        for i in 0..<bombPool.count {
            let b = bombPool[i]
            guard i < sim.bombs.count else { b.mesh.visible = false; b.shadow.visible = false; continue }
            let bb = sim.bombs[i]
            b.mesh.visible = true; setTex(b, "bomb")
            let puls = bb.fuse < 22 && Int(jsFloor(tSec * 10)) % 2 == 0
            b.mesh.position.set(MX(bb.x), bb.y, 6)
            b.mat.color.setRGB(puls ? 2 : 1, puls ? 1.2 : 1, puls ? 1.2 : 1)
            b.shadow.position.set(MX(bb.x), bb.y, 0.12)
        }
        for i in 0..<blockBBs.count {
            let b = blockBBs[i]
            guard i < sim.blocks.count else { b.mesh.visible = false; b.shadow.visible = false; continue }
            let bk = sim.blocks[i]
            b.mesh.visible = true
            b.mesh.position.set(MX(Double(bk.x * TS + 8)), Double(bk.y * TS + 8), 7)
            let bl = probeLight(Double(bk.x * TS + 8), Double(bk.y * TS + 8), dark)
            b.mat.color.setRGB(bl, bl, bl)
            b.shadow.position.set(MX(Double(bk.x * TS + 8)), Double(bk.y * TS + 8), 0.12)
        }
        for i in parts.indices {
            var p = parts[i]
            if p.life <= 0 { p.m.visible = false; continue }
            p.life -= 1
            p.m.position.x += p.vx
            p.m.position.y += p.vy
            p.m.position.z += p.vz
            p.vz -= 0.06
            p.m.material.opacity = min(1, p.life / 14)
            p.m.quaternion = camera.quaternion
            parts[i] = p
        }
        for l in torchLights where l.intensity > 0 { l.intensity = 6.5 + jsSin(tSec * 11 + l.position.x) * 0.25 + random() * 0.12 }
    }

    /// draw(): the scene into rtScene, then bright → blur → bloom, the soft
    /// blur, and the composite (tilt-shift focus, vignette, sRGB) to the canvas
    public func draw() {
        if !TEX { return }
        waterTime += 0.01
        if let wt = texCache["water"] { wt.offset.x = jsSin(waterTime) * 0.06; wt.offset.y = waterTime * 0.05 }
        if lite {
            renderer.setRenderTarget(nil)
            renderer.render(scene, camera)
            return
        }
        renderer.setRenderTarget(rtScene); renderer.render(scene, camera)
        quad.material = brightMat; brightMat.set("tSrc", .texture(rtScene.texture))
        renderer.setRenderTarget(rtA); renderer.render(quadScene, quadCam)
        quad.material = blurMat
        blurMat.set("r", .float(1))
        blurMat.set("tSrc", .texture(rtA.texture)); blurMat.set("dir", .vec2(Vector2(1, 0)))
        renderer.setRenderTarget(rtB); renderer.render(quadScene, quadCam)
        blurMat.set("tSrc", .texture(rtB.texture)); blurMat.set("dir", .vec2(Vector2(0, 1)))
        renderer.setRenderTarget(rtA); renderer.render(quadScene, quadCam)
        blurMat.set("r", .float(2.2))
        blurMat.set("tSrc", .texture(rtScene.texture)); blurMat.set("dir", .vec2(Vector2(1, 0)))
        renderer.setRenderTarget(rtC); renderer.render(quadScene, quadCam)
        blurMat.set("tSrc", .texture(rtC.texture)); blurMat.set("dir", .vec2(Vector2(0, 1)))
        renderer.setRenderTarget(rtD); renderer.render(quadScene, quadCam)
        quad.material = compMat
        compMat.set("tScene", .texture(rtScene.texture))
        compMat.set("tBloom", .texture(rtA.texture))
        compMat.set("tSoft", .texture(rtD.texture))
        let v = Vector3(MX(simFocus.0), simFocus.1, 0).project(camera)
        compMat.set("focus", .vec2(Vector2((v.x + 1) / 2, (v.y + 1) / 2)))
        renderer.setRenderTarget(nil)
        renderer.render(quadScene, quadCam)
    }

    public func setFocus(_ x: Double, _ y: Double) { simFocus = (x, y) }
    public func screenPos(_ x: Double, _ y: Double, _ z: Double = 0) -> (x: Double, y: Double) {
        let v = Vector3(MX(x), y, z).project(camera)
        return ((v.x + 1) / 2, (1 - v.y) / 2)
    }
    public func loadTex() { TEX = true; texCache.removeAll() }
}
