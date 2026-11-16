// MiniThree math: three.js r180's Vector2/3, Quaternion, Euler, Matrix4 and
// Color, ported routine for routine. The CPU side keeps JS doubles (like
// three); only the GPU upload narrows to Float, as WebGL's uniforms do.
// Matrix4 keeps three's column-major `elements`.

import Foundation
import simd

public struct Vector2: Equatable {
    public var x: Double, y: Double
    public init(_ x: Double = 0, _ y: Double = 0) { self.x = x; self.y = y }
    public mutating func set(_ x: Double, _ y: Double) { self.x = x; self.y = y }
    var f: SIMD2<Float> { SIMD2(Float(x), Float(y)) }
}

public struct Vector3: Equatable {
    public var x: Double, y: Double, z: Double
    public init(_ x: Double = 0, _ y: Double = 0, _ z: Double = 0) { self.x = x; self.y = y; self.z = z }
    public mutating func set(_ x: Double, _ y: Double, _ z: Double) { self.x = x; self.y = y; self.z = z }
    public mutating func setScalar(_ s: Double) { x = s; y = s; z = s }
    public static func + (a: Vector3, b: Vector3) -> Vector3 { Vector3(a.x + b.x, a.y + b.y, a.z + b.z) }
    public static func - (a: Vector3, b: Vector3) -> Vector3 { Vector3(a.x - b.x, a.y - b.y, a.z - b.z) }
    public static func * (a: Vector3, s: Double) -> Vector3 { Vector3(a.x * s, a.y * s, a.z * s) }
    public var lengthSq: Double { x * x + y * y + z * z }
    public var length: Double { (x * x + y * y + z * z).squareRoot() }
    /// three: divideScalar(length || 1)
    public func normalized() -> Vector3 { let l = length; return self * (1 / (l == 0 ? 1 : l)) }
    public func dot(_ v: Vector3) -> Double { x * v.x + y * v.y + z * v.z }
    public func cross(_ b: Vector3) -> Vector3 {
        Vector3(y * b.z - z * b.y, z * b.x - x * b.z, x * b.y - y * b.x)
    }
    /// applyMatrix4 with the perspective divide
    public func applying(_ m: Matrix4) -> Vector3 {
        let e = m.elements
        let w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15])
        return Vector3((e[0] * x + e[4] * y + e[8] * z + e[12]) * w,
                       (e[1] * x + e[5] * y + e[9] * z + e[13]) * w,
                       (e[2] * x + e[6] * y + e[10] * z + e[14]) * w)
    }
    /// transformDirection: upper 3x3 then normalize
    public func transformDirection(_ m: Matrix4) -> Vector3 {
        let e = m.elements
        return Vector3(e[0] * x + e[4] * y + e[8] * z, e[1] * x + e[5] * y + e[9] * z, e[2] * x + e[6] * y + e[10] * z).normalized()
    }
    /// Vector3.project(camera): world → NDC (WebGL convention: x, y in [-1, 1])
    public func project(_ camera: Camera) -> Vector3 {
        applying(camera.matrixWorldInverse).applying(camera.projectionMatrixGL)
    }
    public static func fromMatrixPosition(_ m: Matrix4) -> Vector3 { Vector3(m.elements[12], m.elements[13], m.elements[14]) }
    var f: SIMD3<Float> { SIMD3(Float(x), Float(y), Float(z)) }
}

public struct Quaternion: Equatable {
    public var x = 0.0, y = 0.0, z = 0.0, w = 1.0
    public init() {}
    public init(_ x: Double, _ y: Double, _ z: Double, _ w: Double) { self.x = x; self.y = y; self.z = z; self.w = w }
    public static func axisAngle(_ axis: Vector3, _ angle: Double) -> Quaternion {
        let h = angle / 2, s = sin(h)
        return Quaternion(axis.x * s, axis.y * s, axis.z * s, cos(h))
    }
    /// multiplyQuaternions(self, b)
    public func multiplied(_ b: Quaternion) -> Quaternion {
        let qax = x, qay = y, qaz = z, qaw = w
        let qbx = b.x, qby = b.y, qbz = b.z, qbw = b.w
        return Quaternion(qax * qbw + qaw * qbx + qay * qbz - qaz * qby,
                          qay * qbw + qaw * qby + qaz * qbx - qax * qbz,
                          qaz * qbw + qaw * qbz + qax * qby - qay * qbx,
                          qaw * qbw - qax * qbx - qay * qby - qaz * qbz)
    }
    public static func fromEuler(_ e: Euler) -> Quaternion {
        // three's default order XYZ
        let c1 = cos(e.x / 2), c2 = cos(e.y / 2), c3 = cos(e.z / 2)
        let s1 = sin(e.x / 2), s2 = sin(e.y / 2), s3 = sin(e.z / 2)
        return Quaternion(s1 * c2 * c3 + c1 * s2 * s3,
                          c1 * s2 * c3 - s1 * c2 * s3,
                          c1 * c2 * s3 + s1 * s2 * c3,
                          c1 * c2 * c3 - s1 * s2 * s3)
    }
    /// setFromRotationMatrix (upper 3x3 assumed unscaled)
    public static func fromRotationMatrix(_ m: Matrix4) -> Quaternion {
        let te = m.elements
        let m11 = te[0], m12 = te[4], m13 = te[8]
        let m21 = te[1], m22 = te[5], m23 = te[9]
        let m31 = te[2], m32 = te[6], m33 = te[10]
        let trace = m11 + m22 + m33
        if trace > 0 {
            let s = 0.5 / (trace + 1.0).squareRoot()
            return Quaternion((m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s)
        } else if m11 > m22 && m11 > m33 {
            let s = 2.0 * (1.0 + m11 - m22 - m33).squareRoot()
            return Quaternion(0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s)
        } else if m22 > m33 {
            let s = 2.0 * (1.0 + m22 - m11 - m33).squareRoot()
            return Quaternion((m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s)
        } else {
            let s = 2.0 * (1.0 + m33 - m11 - m22).squareRoot()
            return Quaternion((m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s)
        }
    }
}

/// XYZ-order Euler, as three's default
public struct Euler: Equatable {
    public var x = 0.0, y = 0.0, z = 0.0
    public init(_ x: Double = 0, _ y: Double = 0, _ z: Double = 0) { self.x = x; self.y = y; self.z = z }
    public static func fromQuaternion(_ q: Quaternion) -> Euler {
        let m = Matrix4.rotation(q)
        let te = m.elements
        let m11 = te[0], m12 = te[4], m13 = te[8]
        let m22 = te[5], m23 = te[9]
        let m32 = te[6], m33 = te[10]
        let y = asin(min(max(m13, -1), 1))
        if abs(m13) < 0.9999999 {
            return Euler(atan2(-m23, m33), y, atan2(-m12, m11))
        } else {
            return Euler(atan2(m32, m22), y, 0)
        }
    }
}

public struct Matrix4: Equatable {
    /// column-major, as three's Matrix4.elements
    public var elements: [Double] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    public init() {}
    public init(elements: [Double]) { self.elements = elements }
    /// row-major setter, as three's Matrix4.set
    public init(_ n11: Double, _ n12: Double, _ n13: Double, _ n14: Double,
                _ n21: Double, _ n22: Double, _ n23: Double, _ n24: Double,
                _ n31: Double, _ n32: Double, _ n33: Double, _ n34: Double,
                _ n41: Double, _ n42: Double, _ n43: Double, _ n44: Double) {
        elements = [n11, n21, n31, n41, n12, n22, n32, n42, n13, n23, n33, n43, n14, n24, n34, n44]
    }
    public static let identity = Matrix4()

    /// multiplyMatrices(a, b)
    public static func * (a: Matrix4, b: Matrix4) -> Matrix4 {
        let ae = a.elements, be = b.elements
        let a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12]
        let a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13]
        let a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14]
        let a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15]
        let b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12]
        let b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13]
        let b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14]
        let b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15]
        var te = [Double](repeating: 0, count: 16)
        te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41
        te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42
        te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43
        te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44
        te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41
        te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42
        te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43
        te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44
        te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41
        te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42
        te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43
        te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44
        te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41
        te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42
        te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43
        te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44
        return Matrix4(elements: te)
    }

    public static func compose(_ p: Vector3, _ q: Quaternion, _ s: Vector3) -> Matrix4 {
        let x = q.x, y = q.y, z = q.z, w = q.w
        let x2 = x + x, y2 = y + y, z2 = z + z
        let xx = x * x2, xy = x * y2, xz = x * z2
        let yy = y * y2, yz = y * z2, zz = z * z2
        let wx = w * x2, wy = w * y2, wz = w * z2
        let sx = s.x, sy = s.y, sz = s.z
        return Matrix4(elements: [
            (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
            (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
            (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
            p.x, p.y, p.z, 1,
        ])
    }
    public static func rotation(_ q: Quaternion) -> Matrix4 { compose(Vector3(), q, Vector3(1, 1, 1)) }

    /// three's Matrix4.lookAt (rotation part only)
    public static func lookAt(_ eye: Vector3, _ target: Vector3, _ up: Vector3) -> Matrix4 {
        var z = eye - target
        if z.lengthSq == 0 { z.z = 1 }
        z = z.normalized()
        var x = up.cross(z)
        if x.lengthSq == 0 {
            if abs(up.z) == 1 { z.x += 0.0001 } else { z.z += 0.0001 }
            z = z.normalized()
            x = up.cross(z)
        }
        x = x.normalized()
        let y = z.cross(x)
        var m = Matrix4()
        m.elements[0] = x.x; m.elements[4] = y.x; m.elements[8] = z.x
        m.elements[1] = x.y; m.elements[5] = y.y; m.elements[9] = z.y
        m.elements[2] = x.z; m.elements[6] = y.z; m.elements[10] = z.z
        return m
    }

    public static func orthographic(_ left: Double, _ right: Double, _ top: Double, _ bottom: Double, _ near: Double, _ far: Double, webgpu: Bool) -> Matrix4 {
        let x = 2 / (right - left), y = 2 / (top - bottom)
        let a = -(right + left) / (right - left), b = -(top + bottom) / (top - bottom)
        let c = webgpu ? -1 / (far - near) : -2 / (far - near)
        let d = webgpu ? -near / (far - near) : -(far + near) / (far - near)
        return Matrix4(x, 0, 0, a, 0, y, 0, b, 0, 0, c, d, 0, 0, 0, 1)
    }
    public static func perspective(_ left: Double, _ right: Double, _ top: Double, _ bottom: Double, _ near: Double, _ far: Double, webgpu: Bool) -> Matrix4 {
        let x = 2 * near / (right - left), y = 2 * near / (top - bottom)
        let a = (right + left) / (right - left), b = (top + bottom) / (top - bottom)
        let c = webgpu ? -far / (far - near) : -(far + near) / (far - near)
        let d = webgpu ? (-far * near) / (far - near) : (-2 * far * near) / (far - near)
        return Matrix4(x, 0, a, 0, 0, y, b, 0, 0, 0, c, d, 0, 0, -1, 0)
    }

    public var determinant: Double {
        let te = elements
        let n11 = te[0], n12 = te[4], n13 = te[8], n14 = te[12]
        let n21 = te[1], n22 = te[5], n23 = te[9], n24 = te[13]
        let n31 = te[2], n32 = te[6], n33 = te[10], n34 = te[14]
        let n41 = te[3], n42 = te[7], n43 = te[11], n44 = te[15]
        let t1 = n41 * (+n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34)
        let t2 = n42 * (+n11 * n23 * n34 - n11 * n24 * n33 + n14 * n21 * n33 - n13 * n21 * n34 + n13 * n24 * n31 - n14 * n23 * n31)
        let t3 = n43 * (+n11 * n24 * n32 - n11 * n22 * n34 - n14 * n21 * n32 + n12 * n21 * n34 + n14 * n22 * n31 - n12 * n24 * n31)
        let t4 = n44 * (-n13 * n22 * n31 - n11 * n23 * n32 + n11 * n22 * n33 + n13 * n21 * n32 - n12 * n21 * n33 + n12 * n23 * n31)
        return t1 + t2 + t3 + t4
    }

    /// three's Matrix4.invert (zero matrix when singular)
    public func inverted() -> Matrix4 {
        let te = elements
        let n11 = te[0], n21 = te[1], n31 = te[2], n41 = te[3]
        let n12 = te[4], n22 = te[5], n32 = te[6], n42 = te[7]
        let n13 = te[8], n23 = te[9], n33 = te[10], n43 = te[11]
        let n14 = te[12], n24 = te[13], n34 = te[14], n44 = te[15]
        let t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44
        let t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44
        let t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44
        let t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34
        let det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14
        if det == 0 { return Matrix4(elements: [Double](repeating: 0, count: 16)) }
        let d = 1 / det
        var o = [Double](repeating: 0, count: 16)
        o[0] = t11 * d
        o[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * d
        o[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * d
        o[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * d
        o[4] = t12 * d
        o[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * d
        o[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * d
        o[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * d
        o[8] = t13 * d
        o[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * d
        o[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * d
        o[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * d
        o[12] = t14 * d
        o[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * d
        o[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * d
        o[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * d
        return Matrix4(elements: o)
    }

    /// decompose → (position, quaternion, scale), as three's Matrix4.decompose
    public func decompose() -> (Vector3, Quaternion, Vector3) {
        let te = elements
        var sx = Vector3(te[0], te[1], te[2]).length
        let sy = Vector3(te[4], te[5], te[6]).length
        let sz = Vector3(te[8], te[9], te[10]).length
        if determinant < 0 { sx = -sx }
        var m = self
        let isx = 1 / sx, isy = 1 / sy, isz = 1 / sz
        m.elements[0] *= isx; m.elements[1] *= isx; m.elements[2] *= isx
        m.elements[4] *= isy; m.elements[5] *= isy; m.elements[6] *= isy
        m.elements[8] *= isz; m.elements[9] *= isz; m.elements[10] *= isz
        return (Vector3(te[12], te[13], te[14]), Quaternion.fromRotationMatrix(m), Vector3(sx, sy, sz))
    }

    var f: simd_float4x4 {
        let e = elements.map(Float.init)
        return simd_float4x4(SIMD4(e[0], e[1], e[2], e[3]), SIMD4(e[4], e[5], e[6], e[7]),
                             SIMD4(e[8], e[9], e[10], e[11]), SIMD4(e[12], e[13], e[14], e[15]))
    }
    /// three's normalMatrix.getNormalMatrix(modelViewMatrix): inverse-transpose of the 3x3
    var normalMatrix: simd_float3x3 {
        let te = elements
        // Matrix3.setFromMatrix4 → invert → transpose
        let n11 = te[0], n21 = te[1], n31 = te[2]
        let n12 = te[4], n22 = te[5], n32 = te[6]
        let n13 = te[8], n23 = te[9], n33 = te[10]
        let t11 = n33 * n22 - n32 * n23, t12 = n32 * n13 - n33 * n12, t13 = n23 * n12 - n22 * n13
        let det = n11 * t11 + n21 * t12 + n31 * t13
        if det == 0 { return simd_float3x3(0) }
        let d = 1 / det
        // inverse (column-major me[]), then transpose
        let i0 = t11 * d, i1 = (n31 * n23 - n33 * n21) * d, i2 = (n32 * n21 - n31 * n22) * d
        let i3 = t12 * d, i4 = (n33 * n11 - n31 * n13) * d, i5 = (n31 * n12 - n32 * n11) * d
        let i6 = t13 * d, i7 = (n21 * n13 - n23 * n11) * d, i8 = (n22 * n11 - n21 * n12) * d
        // transpose: columns become rows
        return simd_float3x3(SIMD3(Float(i0), Float(i3), Float(i6)), SIMD3(Float(i1), Float(i4), Float(i7)), SIMD3(Float(i2), Float(i5), Float(i8)))
    }
}

/// three's Color: components live in the linear working space; hex and CSS
/// strings are sRGB and convert on the way in (ColorManagement enabled).
public struct Color: Equatable {
    public var r = 1.0, g = 1.0, b = 1.0
    public init() {}
    public init(_ hex: Int) { setHex(hex) }
    public init(_ style: String) { setStyle(style) }
    public init(r: Double, g: Double, b: Double) { self.r = r; self.g = g; self.b = b }

    public static func srgbToLinear(_ c: Double) -> Double {
        c < 0.04045 ? c * 0.0773993808 : pow(c * 0.9478672986 + 0.0521327014, 2.4)
    }
    public static func linearToSRGB(_ c: Double) -> Double {
        c < 0.0031308 ? c * 12.92 : 1.055 * pow(c, 0.41666) - 0.055
    }
    public mutating func setHex(_ hex: Int) {
        r = Color.srgbToLinear(Double((hex >> 16) & 255) / 255)
        g = Color.srgbToLinear(Double((hex >> 8) & 255) / 255)
        b = Color.srgbToLinear(Double(hex & 255) / 255)
    }
    /// '#rrggbb' / '#rgb' only (all the arcade uses)
    public mutating func setStyle(_ s: String) {
        var h = s.hasPrefix("#") ? String(s.dropFirst()) : s
        if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
        setHex(Int(h, radix: 16) ?? 0)
    }
    public mutating func set(_ s: String) { setStyle(s) }
    public mutating func set(_ hex: Int) { setHex(hex) }
    /// setRGB in the working (linear) space — no conversion
    public mutating func setRGB(_ r: Double, _ g: Double, _ b: Double) { self.r = r; self.g = g; self.b = b }
    public static func * (c: Color, s: Double) -> Color { Color(r: c.r * s, g: c.g * s, b: c.b * s) }
    var f: SIMD3<Float> { SIMD3(Float(r), Float(g), Float(b)) }
}
