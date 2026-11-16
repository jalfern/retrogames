// MiniThree geometry: BufferGeometry with three's attribute names, and the
// PlaneGeometry / BoxGeometry generators vertex for vertex (uv layout
// matters: box faces and planes sample their textures exactly as three's).

import Foundation
import Metal

public final class BufferAttribute {
    public var array: [Float]
    public let itemSize: Int
    public var count: Int { array.count / itemSize }
    var version = 0
    public init(_ array: [Float], _ itemSize: Int) { self.array = array; self.itemSize = itemSize }
    public func needsUpdate() { version += 1 }
}

public final class BufferGeometry {
    public var attributes: [String: BufferAttribute] = [:]
    public var index: [UInt32]? = nil
    public var drawRange = 0..<Int.max
    public init() {}
    public func setAttribute(_ name: String, _ a: BufferAttribute) { attributes[name] = a }
    public func setIndex(_ i: [UInt32]) { index = i }

    // GPU mirror: interleaved position3 normal3 uv2 color4 (stride 48)
    var gpu: MTLBuffer? = nil, gpuIndex: MTLBuffer? = nil, gpuVersion = -1
    var hasColors: Bool { attributes["color"] != nil }

    /// boundingBox over position (three's computeBoundingBox)
    public func boundingBox() -> (min: Vector3, max: Vector3) {
        guard let p = attributes["position"], p.count > 0 else { return (Vector3(), Vector3()) }
        var lo = Vector3(.infinity, .infinity, .infinity), hi = Vector3(-.infinity, -.infinity, -.infinity)
        for i in 0..<p.count {
            let x = Double(p.array[i * 3]), y = Double(p.array[i * 3 + 1]), z = Double(p.array[i * 3 + 2])
            lo = Vector3(min(lo.x, x), min(lo.y, y), min(lo.z, z)); hi = Vector3(max(hi.x, x), max(hi.y, y), max(hi.z, z))
        }
        return (lo, hi)
    }
    public func dispose() { gpu = nil; gpuIndex = nil }
}

/// three's PlaneGeometry(width, height, widthSegments, heightSegments)
public func PlaneGeometry(_ width: Double = 1, _ height: Double = 1, _ widthSegments: Int = 1, _ heightSegments: Int = 1) -> BufferGeometry {
    let wh = width / 2, hh = height / 2
    let gx = widthSegments, gy = heightSegments, gx1 = gx + 1, gy1 = gy + 1
    let sw = width / Double(gx), sh = height / Double(gy)
    var pos: [Float] = [], nor: [Float] = [], uv: [Float] = [], idx: [UInt32] = []
    for iy in 0..<gy1 {
        let y = Double(iy) * sh - hh
        for ix in 0..<gx1 {
            let x = Double(ix) * sw - wh
            pos += [Float(x), Float(-y), 0]; nor += [0, 0, 1]
            uv += [Float(Double(ix) / Double(gx)), Float(1 - Double(iy) / Double(gy))]
        }
    }
    for iy in 0..<gy {
        for ix in 0..<gx {
            let a = UInt32(ix + gx1 * iy), b = UInt32(ix + gx1 * (iy + 1)), c = UInt32(ix + 1 + gx1 * (iy + 1)), d = UInt32(ix + 1 + gx1 * iy)
            idx += [a, b, d, b, c, d]
        }
    }
    let g = BufferGeometry()
    g.setAttribute("position", BufferAttribute(pos, 3)); g.setAttribute("normal", BufferAttribute(nor, 3)); g.setAttribute("uv", BufferAttribute(uv, 2))
    g.setIndex(idx)
    return g
}

/// three's BoxGeometry(width, height, depth) — six buildPlane calls in three's order
public func BoxGeometry(_ width: Double = 1, _ height: Double = 1, _ depth: Double = 1, _ ws: Int = 1, _ hs: Int = 1, _ ds: Int = 1) -> BufferGeometry {
    var pos: [Float] = [], nor: [Float] = [], uv: [Float] = [], idx: [UInt32] = []
    var counter = 0
    func buildPlane(_ u: Int, _ v: Int, _ w: Int, _ udir: Double, _ vdir: Double, _ width: Double, _ height: Double, _ depth: Double, _ gx: Int, _ gy: Int) {
        let sw = width / Double(gx), sh = height / Double(gy)
        let wh = width / 2, hh = height / 2, dh = depth / 2
        let gx1 = gx + 1, gy1 = gy + 1
        var n = 0
        for iy in 0..<gy1 {
            let y = Double(iy) * sh - hh
            for ix in 0..<gx1 {
                let x = Double(ix) * sw - wh
                var vec = [0.0, 0.0, 0.0], nv = [0.0, 0.0, 0.0]
                vec[u] = x * udir; vec[v] = y * vdir; vec[w] = dh
                nv[w] = depth > 0 ? 1 : -1
                pos += vec.map(Float.init); nor += nv.map(Float.init)
                uv += [Float(Double(ix) / Double(gx)), Float(1 - Double(iy) / Double(gy))]
                n += 1
            }
        }
        for iy in 0..<gy {
            for ix in 0..<gx {
                let a = UInt32(counter + ix + gx1 * iy), b = UInt32(counter + ix + gx1 * (iy + 1))
                let c = UInt32(counter + ix + 1 + gx1 * (iy + 1)), d = UInt32(counter + ix + 1 + gx1 * iy)
                idx += [a, b, d, b, c, d]
            }
        }
        counter += n
    }
    let X = 0, Y = 1, Z = 2
    buildPlane(Z, Y, X, -1, -1, depth, height, width, ds, hs)   // px
    buildPlane(Z, Y, X, 1, -1, depth, height, -width, ds, hs)   // nx
    buildPlane(X, Z, Y, 1, 1, width, depth, height, ws, ds)     // py
    buildPlane(X, Z, Y, 1, -1, width, depth, -height, ws, ds)   // ny
    buildPlane(X, Y, Z, 1, -1, width, height, depth, ws, hs)    // pz
    buildPlane(X, Y, Z, -1, -1, width, height, -depth, ws, hs)  // nz
    let g = BufferGeometry()
    g.setAttribute("position", BufferAttribute(pos, 3)); g.setAttribute("normal", BufferAttribute(nor, 3)); g.setAttribute("uv", BufferAttribute(uv, 2))
    g.setIndex(idx)
    return g
}
