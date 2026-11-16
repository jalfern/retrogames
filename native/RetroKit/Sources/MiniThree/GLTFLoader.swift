// MiniThree GLTFLoader: glTF 2.0 binary (.glb), static meshes — what
// src/utils/modelShelf.js loads. Builds what three's GLTFLoader builds:
// a Group per scene, nodes with TRS (or matrix), Mesh per primitive with a
// MeshStandardMaterial (baseColorFactor in linear, vertexColors when COLOR_0,
// baseColorTexture as an sRGB texture with flipY = false, doubleSided → DoubleSide,
// alphaMode MASK → alphaTest, BLEND → transparent).

import Foundation
import ImageIO
import CoreGraphics

public enum GLTFLoader {
    public enum Failure: Error { case notGLB, badJSON, unsupported(String) }

    public static func load(url: URL) throws -> Group { try parse(Data(contentsOf: url)) }

    public static func parse(_ data: Data) throws -> Group {
        let b = [UInt8](data)
        func u32(_ o: Int) -> Int { Int(b[o]) | Int(b[o + 1]) << 8 | Int(b[o + 2]) << 16 | Int(b[o + 3]) << 24 }
        guard b.count >= 20, u32(0) == 0x46546C67 else { throw Failure.notGLB }
        var off = 12
        var json: [String: Any] = [:]
        var bin: [UInt8] = []
        while off + 8 <= b.count {
            let len = u32(off), type = u32(off + 4)
            let chunk = Array(b[(off + 8)..<min(b.count, off + 8 + len)])
            if type == 0x4E4F534A { json = (try JSONSerialization.jsonObject(with: Data(chunk))) as? [String: Any] ?? [:] }
            else if type == 0x004E4942 { bin = chunk }
            off += 8 + len
        }
        let accessors = json["accessors"] as? [[String: Any]] ?? []
        let views = json["bufferViews"] as? [[String: Any]] ?? []
        let meshes = json["meshes"] as? [[String: Any]] ?? []
        let mats = json["materials"] as? [[String: Any]] ?? []
        let nodes = json["nodes"] as? [[String: Any]] ?? []
        let textures = json["textures"] as? [[String: Any]] ?? []
        let images = json["images"] as? [[String: Any]] ?? []
        let samplersJ = json["samplers"] as? [[String: Any]] ?? []

        func num(_ a: Any?) -> Double { (a as? NSNumber)?.doubleValue ?? 0 }
        func int(_ a: Any?) -> Int { (a as? NSNumber)?.intValue ?? 0 }

        func accessor(_ i: Int) -> (data: [Float], itemSize: Int) {
            let a = accessors[i]
            let count = int(a["count"])
            let comps = ["SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16][a["type"] as? String ?? "SCALAR"] ?? 1
            let ct = int(a["componentType"])
            let normalized = (a["normalized"] as? Bool) ?? false
            guard let vi = a["bufferView"] as? NSNumber else { return ([Float](repeating: 0, count: count * comps), comps) }
            let v = views[vi.intValue]
            let base = int(v["byteOffset"]) + int(a["byteOffset"])
            let csize = ct == 5126 || ct == 5125 ? 4 : ct == 5123 || ct == 5122 ? 2 : 1
            let stride = int(v["byteStride"]) > 0 ? int(v["byteStride"]) : csize * comps
            var out = [Float](repeating: 0, count: count * comps)
            for e in 0..<count {
                for c in 0..<comps {
                    let o = base + e * stride + c * csize
                    var f: Float
                    switch ct {
                    case 5126: f = Float(bitPattern: UInt32(bin[o]) | UInt32(bin[o + 1]) << 8 | UInt32(bin[o + 2]) << 16 | UInt32(bin[o + 3]) << 24)
                    case 5125: f = Float(UInt32(bin[o]) | UInt32(bin[o + 1]) << 8 | UInt32(bin[o + 2]) << 16 | UInt32(bin[o + 3]) << 24)
                    case 5123: let v = UInt16(bin[o]) | UInt16(bin[o + 1]) << 8; f = normalized ? Float(v) / 65535 : Float(v)
                    case 5122: let v = Int16(bitPattern: UInt16(bin[o]) | UInt16(bin[o + 1]) << 8); f = normalized ? max(Float(v) / 32767, -1) : Float(v)
                    case 5121: f = normalized ? Float(bin[o]) / 255 : Float(bin[o])
                    case 5120: let v = Int8(bitPattern: bin[o]); f = normalized ? max(Float(v) / 127, -1) : Float(v)
                    default: f = 0
                    }
                    out[e * comps + c] = f
                }
            }
            return (out, comps)
        }

        var texCache: [Int: Texture] = [:]
        func texture(_ ti: Int) -> Texture? {
            if let t = texCache[ti] { return t }
            guard ti < textures.count, let src = textures[ti]["source"] as? NSNumber, src.intValue < images.count else { return nil }
            let im = images[src.intValue]
            guard let bvi = im["bufferView"] as? NSNumber else { return nil }
            let v = views[bvi.intValue]
            let o = int(v["byteOffset"]), l = int(v["byteLength"])
            guard let s = CGImageSourceCreateWithData(Data(bin[o..<(o + l)]) as CFData, nil), let cg = CGImageSourceCreateImageAtIndex(s, 0, nil) else { return nil }
            let t = Texture(cg)
            t.flipY = false
            t.colorSpace = .srgb
            if let si = textures[ti]["sampler"] as? NSNumber, si.intValue < samplersJ.count {
                let sj = samplersJ[si.intValue]
                if int(sj["magFilter"]) == 9728 { t.magFilter = .nearest }
                if [9728, 9984, 9986].contains(int(sj["minFilter"])) { t.minFilter = .nearest }
                func wrap(_ w: Int) -> Wrap { w == 33071 ? .clampToEdge : w == 33648 ? .mirroredRepeat : .repeat_ }
                t.wrapS = wrap(sj["wrapS"] == nil ? 10497 : int(sj["wrapS"])); t.wrapT = wrap(sj["wrapT"] == nil ? 10497 : int(sj["wrapT"]))
            } else { t.wrapS = .repeat_; t.wrapT = .repeat_ }
            texCache[ti] = t
            return t
        }

        func material(_ mi: Int?, vertexColors: Bool) -> Material {
            let m = MeshStandardMaterial()
            m.vertexColors = vertexColors
            guard let mi = mi, mi < mats.count else { return m }
            let j = mats[mi]
            if let pbr = j["pbrMetallicRoughness"] as? [String: Any] {
                if let f = pbr["baseColorFactor"] as? [NSNumber], f.count == 4 {
                    m.color = Color(r: f[0].doubleValue, g: f[1].doubleValue, b: f[2].doubleValue)
                    m.opacity = f[3].doubleValue
                }
                m.metalness = pbr["metallicFactor"] != nil ? num(pbr["metallicFactor"]) : 1
                m.roughness = pbr["roughnessFactor"] != nil ? num(pbr["roughnessFactor"]) : 1
                if let bt = pbr["baseColorTexture"] as? [String: Any], let ti = bt["index"] as? NSNumber { m.map = texture(ti.intValue) }
            } else { m.metalness = 1; m.roughness = 1 }
            if (j["doubleSided"] as? Bool) == true { m.side = .double }
            let mode = j["alphaMode"] as? String ?? "OPAQUE"
            if mode == "BLEND" { m.transparent = true; m.depthWrite = false }
            else if mode == "MASK" { m.alphaTest = j["alphaCutoff"] != nil ? num(j["alphaCutoff"]) : 0.5 }
            if let e = j["emissiveFactor"] as? [NSNumber], e.count == 3 { m.emissive = Color(r: e[0].doubleValue, g: e[1].doubleValue, b: e[2].doubleValue) }
            m.name = j["name"] as? String ?? ""
            return m
        }

        func buildNode(_ ni: Int) -> Object3D {
            let n = nodes[ni]
            var obj: Object3D
            if let mi = n["mesh"] as? NSNumber {
                let prims = (meshes[mi.intValue]["primitives"] as? [[String: Any]]) ?? []
                var built: [Mesh] = []
                for p in prims {
                    guard int(p["mode"] ?? 4) == 4, let attrs = p["attributes"] as? [String: Any], let pa = attrs["POSITION"] as? NSNumber else { continue }
                    let g = BufferGeometry()
                    let pos = accessor(pa.intValue)
                    g.setAttribute("position", BufferAttribute(pos.data, 3))
                    if let na = attrs["NORMAL"] as? NSNumber { g.setAttribute("normal", BufferAttribute(accessor(na.intValue).data, 3)) }
                    if let ua = attrs["TEXCOORD_0"] as? NSNumber { g.setAttribute("uv", BufferAttribute(accessor(ua.intValue).data, 2)) }
                    var vc = false
                    if let ca = attrs["COLOR_0"] as? NSNumber { let c = accessor(ca.intValue); g.setAttribute("color", BufferAttribute(c.data, c.itemSize)); vc = true }
                    if let ia = p["indices"] as? NSNumber { g.setIndex(accessor(ia.intValue).data.map { UInt32($0) }) }
                    built.append(Mesh(g, material(p["material"] as? Int, vertexColors: vc)))
                }
                if built.count == 1 { obj = built[0] }
                else { let gr = Group(); for m in built { gr.add(m) }; obj = gr }
            } else { obj = Object3D() }
            obj.name = n["name"] as? String ?? ""
            if let m = n["matrix"] as? [NSNumber], m.count == 16 {
                let (p, q, s) = Matrix4(elements: m.map(\.doubleValue)).decompose()
                obj.position = p; obj.quaternion = q; obj.scale = s
            } else {
                if let t = n["translation"] as? [NSNumber], t.count == 3 { obj.position = Vector3(t[0].doubleValue, t[1].doubleValue, t[2].doubleValue) }
                if let r = n["rotation"] as? [NSNumber], r.count == 4 { obj.quaternion = Quaternion(r[0].doubleValue, r[1].doubleValue, r[2].doubleValue, r[3].doubleValue) }
                if let s = n["scale"] as? [NSNumber], s.count == 3 { obj.scale = Vector3(s[0].doubleValue, s[1].doubleValue, s[2].doubleValue) }
            }
            for c in (n["children"] as? [NSNumber]) ?? [] { obj.add(buildNode(c.intValue)) }
            return obj
        }

        let scenes = json["scenes"] as? [[String: Any]] ?? []
        let si = int(json["scene"])
        let root = Group()
        let rootNodes: [Int] = si < scenes.count ? ((scenes[si]["nodes"] as? [NSNumber])?.map(\.intValue) ?? []) : Array(0..<nodes.count)
        for ni in rootNodes { root.add(buildNode(ni)) }
        return root
    }
}

/// three's Box3().setFromObject(root): world-space AABB over every mesh's vertices
public func box3FromObject(_ root: Object3D) -> (min: Vector3, max: Vector3) {
    root.updateWorldMatrix(updateParents: true, updateChildren: true)
    var lo = Vector3(.infinity, .infinity, .infinity), hi = Vector3(-.infinity, -.infinity, -.infinity)
    root.traverse { o in
        guard let m = o as? Mesh, let p = m.geometry.attributes["position"] else { return }
        for i in 0..<p.count {
            let v = Vector3(Double(p.array[i * 3]), Double(p.array[i * 3 + 1]), Double(p.array[i * 3 + 2])).applying(m.matrixWorld)
            lo = Vector3(min(lo.x, v.x), min(lo.y, v.y), min(lo.z, v.z)); hi = Vector3(max(hi.x, v.x), max(hi.y, v.y), max(hi.z, v.z))
        }
    }
    return (lo, hi)
}
