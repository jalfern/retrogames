// JavaScript number semantics the sim leans on, in one place.
import Foundation

/// Math.round: ties go toward +inf (Swift's .rounded() goes away from zero).
@inline(__always) public func jsRound(_ x: Double) -> Double {
    if !x.isFinite { return x }
    let f = x.rounded(.down)
    return x - f >= 0.5 ? f + 1 : f
}

/// Math.floor
@inline(__always) func jsFloor(_ x: Double) -> Int { Int(x.rounded(.down)) }

/// Math.sign (0 stays 0; NaN never reaches it here).
@inline(__always) func jsSign(_ x: Double) -> Double { x > 0 ? 1 : (x < 0 ? -1 : 0) }

/// Math.hypot exactly as V8 computes it (builtins/math.tq): divide by the
/// largest magnitude, Kahan-sum the squares, sqrt, scale back. Darwin's
/// hypot() rounds differently in the last place, and the sim normalizes every
/// step of every mover with this, so it has to be V8's.
@inline(__always) public func jsHypot(_ a: Double, _ b: Double) -> Double {
    let x = abs(a), y = abs(b)
    if x.isInfinite || y.isInfinite { return .infinity }
    if x.isNaN || y.isNaN { return .nan }
    let m = max(x, y)
    if m == 0 { return 0 }
    var sum = 0.0, comp = 0.0
    for v in [x, y] {
        let n = v / m
        let summand = n * n - comp
        let pre = sum + summand
        comp = (pre - sum) - summand
        sum = pre
    }
    return sum.squareRoot() * m
}

/// Math.sin / Math.cos. Darwin libm; V8 uses fdlibm. If a trace ever splits
/// by one ulp, swap fdlibm in here.
@inline(__always) public func jsSin(_ x: Double) -> Double { sin(x) }
@inline(__always) public func jsCos(_ x: Double) -> Double { cos(x) }

/// ECMAScript ToInt32 (`v | 0`).
@inline(__always) func toInt32(_ v: Double) -> Int32 {
    if !v.isFinite { return 0 }
    let t = v < 0 ? (-v).rounded(.down) * -1 : v.rounded(.down)
    let m = t.truncatingRemainder(dividingBy: 4294967296)
    let u = m < 0 ? m + 4294967296 : m
    return Int32(bitPattern: UInt32(u))
}
