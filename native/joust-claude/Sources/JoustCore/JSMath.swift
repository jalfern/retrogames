// Math.sin / Math.cos as the web build computes them. Starts on the platform
// libm; if the traces ever disagree in the last ulp, this is the one place
// to swap in V8's fdlibm port.
import Foundation

@inline(__always) public func jsSin(_ x: Double) -> Double { sin(x) }
@inline(__always) public func jsCos(_ x: Double) -> Double { cos(x) }
