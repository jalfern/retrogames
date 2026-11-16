// JavaScript number semantics the sims lean on, in one place. Every port's
// sim calls these instead of Swift's own rounding / libm (README: porting rules).
// @inlinable so the hot ones inline across the module boundary; inlining never
// changes a result here (Swift does not contract a*b+c into an FMA by itself).
import Foundation

/// Math.round: ties go toward +inf (Swift's .rounded() goes away from zero).
@inlinable @inline(__always) public func jsRound(_ x: Double) -> Double {
    if !x.isFinite { return x }
    let f = x.rounded(.down)
    return x - f >= 0.5 ? f + 1 : f
}

/// Math.floor, as an Int.
@inlinable @inline(__always) public func jsFloor(_ x: Double) -> Int { Int(x.rounded(.down)) }

/// Math.sign (0 stays 0; NaN never reaches it here).
@inlinable @inline(__always) public func jsSign(_ x: Double) -> Double { x > 0 ? 1 : (x < 0 ? -1 : 0) }

/// Math.hypot exactly as V8 computes it (builtins/math.tq): divide by the
/// largest magnitude, Kahan-sum the squares, sqrt, scale back. Darwin's
/// hypot() rounds differently in the last place, and the sims normalize every
/// step of every mover with this, so it has to be V8's.
@inlinable @inline(__always) public func jsHypot(_ a: Double, _ b: Double) -> Double {
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

/// Math.sin / Math.cos / Math.atan2: V8's own (fdlibm built with fused
/// multiply-adds — FDLibm.swift), bit for bit; Darwin's libm differs in the
/// last place on a few percent of inputs.
@inlinable @inline(__always) public func jsSin(_ x: Double) -> Double { fdSin(x) }
@inlinable @inline(__always) public func jsCos(_ x: Double) -> Double { fdCos(x) }
@inlinable @inline(__always) public func jsAtan2(_ y: Double, _ x: Double) -> Double { fdAtan2(y, x) }

/// ECMAScript ToInt32 (`v | 0`).
@inlinable @inline(__always) public func toInt32(_ v: Double) -> Int32 {
    if !v.isFinite { return 0 }
    let t = v < 0 ? (-v).rounded(.down) * -1 : v.rounded(.down)
    let m = t.truncatingRemainder(dividingBy: 4294967296)
    let u = m < 0 ? m + 4294967296 : m
    return Int32(bitPattern: UInt32(u))
}

/// JS String(n) for the integral numbers a hash prints.
@inlinable @inline(__always) public func jsInt(_ v: Int) -> String { String(v) }

/// Number.prototype.toFixed(f) for |x| < 1e21: the EXACT binary value of x
/// rounded to f decimals, an exact tie going away from zero (printf rounds
/// ties to even), and -0 printing as "0.00". Darwin's printf prints a double's
/// exact decimal expansion, so the rounding is done on those digits.
public func jsToFixed(_ x: Double, _ f: Int) -> String {
    if x == 0 { return f == 0 ? "0" : "0." + String(repeating: "0", count: f) }
    let neg = x < 0
    let full = Array(String(format: "%.90f", abs(x)).utf8) // exact: a double's expansion ends long before 90 places at these magnitudes
    let dot = full.firstIndex(of: 46)!
    var digits = Array(full[..<dot]) + Array(full[(dot + 1)...(dot + f)]) // integer part + f decimals, as ASCII
    let next = full[dot + f + 1]
    if next >= 53 { // the first dropped digit is 5..9: >= half, ties included -> away from zero
        var i = digits.count - 1
        while i >= 0 {
            if digits[i] == 57 { digits[i] = 48; i -= 1 } else { digits[i] += 1; break }
        }
        if i < 0 { digits.insert(49, at: 0) }
    }
    let intLen = digits.count - f
    var out = String(decoding: digits[..<intLen], as: UTF8.self)
    if f > 0 { out += "." + String(decoding: digits[intLen...], as: UTF8.self) }
    return neg ? "-" + out : out
}
