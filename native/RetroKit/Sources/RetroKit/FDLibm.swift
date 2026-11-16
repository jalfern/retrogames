// Math.sin / Math.cos / Math.atan2 exactly as V8 computes them: fdlibm
// (V8 src/base/ieee754.cc) AS CLANG COMPILES IT — with -ffp-contract=on, so
// every `a*b + c` inside one expression is a fused multiply-add (clang fuses
// the left-hand product first). Plain fdlibm misses V8 on ~0.4% of sin/cos
// and ~0.2% of atan2 inputs; with the fusions it matches bit for bit. Darwin's libm rounds some
// results differently in the last place (sin(-1.1151806735836653): V8
// -0.8979903015775141, Darwin -0.897990301577514), and the pilot's aim and
// every 8-way step go through these, so the port has to be V8's.
// gauntlet-claude/check.sh (`gauntlet-trace math`) fuzzes all three against
// Node's Math.* on 300k inputs each; Joust, Emberwood and Gauntlet all use it.
// All @inlinable: each app compiles it at its own optimization level (the
// package itself builds -Onone in Debug). Same bits either way: Swift never
// fuses a*b+c on its own, so only the explicit fma() calls fuse.

import Foundation

@inlinable @inline(__always) func hi(_ x: Double) -> Int32 { Int32(bitPattern: UInt32(truncatingIfNeeded: x.bitPattern >> 32)) }
@inlinable @inline(__always) func lo(_ x: Double) -> UInt32 { UInt32(truncatingIfNeeded: x.bitPattern) }
@inlinable @inline(__always) func words(_ h: UInt32, _ l: UInt32) -> Double { Double(bitPattern: UInt64(h) << 32 | UInt64(l)) }

@inlinable func kSin(_ x: Double, _ y: Double, _ iy: Int) -> Double {
    let S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04
    let S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10
    let ix = hi(x) & 0x7fffffff
    if ix < 0x3e400000 { if Int(x) == 0 { return x } }
    let z = x * x
    let v = z * x
    let r = fma(z, fma(z, fma(z, fma(z, S6, S5), S4), S3), S2)
    if iy == 0 { return fma(v, fma(z, r, S1), x) }
    return x - fma(-v, S1, fma(z, fma(0.5, y, -(v * r)), -y))
}

@inlinable func kCos(_ x: Double, _ y: Double) -> Double {
    let C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05
    let C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11
    let ix = hi(x) & 0x7fffffff
    if ix < 0x3e400000 { if Int(x) == 0 { return 1.0 } }
    let z = x * x
    let r = z * fma(z, fma(z, fma(z, fma(z, fma(z, C6, C5), C4), C3), C2), C1)
    if ix < 0x3fd33333 { return 1.0 - fma(0.5, z, -fma(z, r, -(x * y))) }
    let qx: Double = ix > 0x3fe90000 ? 0.28125 : words(UInt32(bitPattern: ix - 0x00200000), 0)
    let hz = fma(0.5, z, -qx)
    let a = 1.0 - qx
    return a - (hz - fma(z, r, -(x * y)))
}

@usableFromInline let npio2hw: [Int32] = [
    0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C,
    0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C,
    0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A,
    0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C,
    0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
    0x404858EB, 0x404921FB,
]

/// __ieee754_rem_pio2 for |x| <= 2^19*pi/2 (every angle the games make);
/// nil beyond, where the caller falls back to libm.
@inlinable func remPio2(_ x: Double) -> (n: Int32, y0: Double, y1: Double)? {
    let invpio2 = 6.36619772367581382433e-01
    let pio2_1 = 1.57079632673412561417e+00, pio2_1t = 6.07710050650619224932e-11
    let pio2_2 = 6.07710050630396597660e-11, pio2_2t = 2.02226624879595063154e-21
    let pio2_3 = 2.02226624871116645580e-21, pio2_3t = 8.47842766036889956997e-32
    let hx = hi(x)
    let ix = hx & 0x7fffffff
    if ix <= 0x3fe921fb { return (0, x, 0) }
    if ix < 0x4002d97c {
        if hx > 0 {
            var z = x - pio2_1
            if ix != 0x3ff921fb { let y0 = z - pio2_1t; return (1, y0, (z - y0) - pio2_1t) }
            z -= pio2_2; let y0 = z - pio2_2t; return (1, y0, (z - y0) - pio2_2t)
        } else {
            var z = x + pio2_1
            if ix != 0x3ff921fb { let y0 = z + pio2_1t; return (-1, y0, (z - y0) + pio2_1t) }
            z += pio2_2; let y0 = z + pio2_2t; return (-1, y0, (z - y0) + pio2_2t)
        }
    }
    if ix <= 0x413921fb {
        var t = abs(x)
        let n = Int32(fma(t, invpio2, 0.5))
        let fn = Double(n)
        var r = fma(-fn, pio2_1, t)
        var w = fn * pio2_1t
        var y0: Double
        if n < 32 && ix != npio2hw[Int(n) - 1] {
            y0 = r - w
        } else {
            let j = ix >> 20
            y0 = r - w
            var i = j - ((hi(y0) >> 20) & 0x7ff)
            if i > 16 {
                t = r
                w = fn * pio2_2
                r = t - w
                w = fma(fn, pio2_2t, -((t - r) - w))
                y0 = r - w
                i = j - ((hi(y0) >> 20) & 0x7ff)
                if i > 49 {
                    t = r
                    w = fn * pio2_3
                    r = t - w
                    w = fma(fn, pio2_3t, -((t - r) - w))
                    y0 = r - w
                }
            }
        }
        let y1 = (r - y0) - w
        if hx < 0 { return (-n, -y0, -y1) }
        return (n, y0, y1)
    }
    return nil
}

@inlinable public func fdSin(_ x: Double) -> Double {
    let ix = hi(x) & 0x7fffffff
    if ix <= 0x3fe921fb { return kSin(x, 0, 0) }
    if ix >= 0x7ff00000 { return x - x }
    guard let (n, y0, y1) = remPio2(x) else { return sin(x) }
    switch n & 3 {
    case 0: return kSin(y0, y1, 1)
    case 1: return kCos(y0, y1)
    case 2: return -kSin(y0, y1, 1)
    default: return -kCos(y0, y1)
    }
}

@inlinable public func fdCos(_ x: Double) -> Double {
    let ix = hi(x) & 0x7fffffff
    if ix <= 0x3fe921fb { return kCos(x, 0) }
    if ix >= 0x7ff00000 { return x - x }
    guard let (n, y0, y1) = remPio2(x) else { return cos(x) }
    switch n & 3 {
    case 0: return kCos(y0, y1)
    case 1: return -kSin(y0, y1, 1)
    case 2: return -kCos(y0, y1)
    default: return kSin(y0, y1, 1)
    }
}

@usableFromInline let atanhi = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00]
@usableFromInline let atanlo = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17]
@usableFromInline let aT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
                  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
                  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02]

@inlinable public func fdAtan(_ x0: Double) -> Double {
    var x = x0
    let hx = hi(x)
    let ix = hx & 0x7fffffff
    var id: Int
    if ix >= 0x44100000 {
        if ix > 0x7ff00000 || (ix == 0x7ff00000 && lo(x) != 0) { return x + x }
        return hx > 0 ? atanhi[3] + atanlo[3] : -atanhi[3] - atanlo[3]
    }
    if ix < 0x3fdc0000 {
        if ix < 0x3e400000 { if 1.0e300 + x > 1.0 { return x } }
        id = -1
    } else {
        x = abs(x)
        if ix < 0x3ff30000 {
            if ix < 0x3fe60000 { id = 0; x = fma(2.0, x, -1.0) / (2.0 + x) }
            else { id = 1; x = (x - 1.0) / (x + 1.0) }
        } else {
            if ix < 0x40038000 { id = 2; x = (x - 1.5) / fma(1.5, x, 1.0) }
            else { id = 3; x = -1.0 / x }
        }
    }
    let z = x * x
    let w = z * z
    let s1 = z * fma(w, fma(w, fma(w, fma(w, fma(w, aT[10], aT[8]), aT[6]), aT[4]), aT[2]), aT[0])
    let s2 = w * fma(w, fma(w, fma(w, fma(w, aT[9], aT[7]), aT[5]), aT[3]), aT[1])
    if id < 0 { return fma(-x, s1 + s2, x) }
    let zz = atanhi[id] - (fma(x, s1 + s2, -atanlo[id]) - x)
    return hx < 0 ? -zz : zz
}

@inlinable public func fdAtan2(_ y: Double, _ x: Double) -> Double {
    let pi_o_2 = 1.5707963267948965580e+00, pi = 3.1415926535897931160e+00, pi_lo = 1.2246467991473531772e-16
    if x.isNaN || y.isNaN { return x + y }
    let hx = hi(x), hy = hi(y)
    let lx = lo(x), ly = lo(y)
    let ix = hx & 0x7fffffff, iy = hy & 0x7fffffff
    if (UInt32(bitPattern: hx &- 0x3ff00000) | lx) == 0 { return fdAtan(y) }
    var m = Int((hy >> 31) & 1) | Int((hx >> 30) & 2)
    if (UInt32(bitPattern: iy) | ly) == 0 {
        switch m {
        case 0, 1: return y
        case 2: return pi
        default: return -pi
        }
    }
    if (UInt32(bitPattern: ix) | lx) == 0 { return hy < 0 ? -pi_o_2 : pi_o_2 }
    if ix == 0x7ff00000 || iy == 0x7ff00000 { return atan2(y, x) } // infinities never reach the games
    let k = (iy - ix) >> 20
    var z: Double
    if k > 60 { z = pi_o_2 + 0.5 * pi_lo; m &= 1 }
    else if hx < 0 && k < -60 { z = 0.0 }
    else { z = fdAtan(abs(y / x)) }
    switch m {
    case 0: return z
    case 1: return -z
    case 2: return pi - (z - pi_lo)
    default: return (z - pi_lo) - pi
    }
}
