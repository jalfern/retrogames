// Math.sin / Math.cos as the web build computes them: V8's fdlibm as clang
// compiles it (fused multiply-adds) — FDLibm.swift, shared with the Gauntlet
// port, bit-exact against Node on 1M+ inputs. Darwin's libm differs in the
// last place on ~3% of inputs.
import Foundation

@inline(__always) public func jsSin(_ x: Double) -> Double { fdSin(x) }
@inline(__always) public func jsCos(_ x: Double) -> Double { fdCos(x) }
