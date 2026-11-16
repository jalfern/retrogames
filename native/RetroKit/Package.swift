// swift-tools-version:5.9
// RetroKit = what every native port shares (README.md):
//   RetroKit     — pure Swift: V8-exact JS math, the trace codec, the
//                  recording reader, the Surface framebuffer + 3x5 font.
//                  The ports' sim cores and their Mac CLIs depend on it.
//   RetroKitApp  — the app shell pieces: the Synth voice engine, seat-based
//                  Controls, the -selfcheck runner. Apps only.
//   MiniThree    — the three.js subset the arcade's 3D games use, on Metal
//                  (README.md: what it supports, how a render.js ports).
import PackageDescription

let package = Package(
    name: "RetroKit",
    platforms: [.macOS(.v14), .iOS(.v17), .tvOS(.v17)],
    products: [
        .library(name: "RetroKit", targets: ["RetroKit"]),
        .library(name: "RetroKitApp", targets: ["RetroKitApp"]),
        .library(name: "MiniThree", targets: ["MiniThree"]),
    ],
    targets: [
        .target(name: "RetroKit"),
        .target(name: "RetroKitApp", dependencies: ["RetroKit"]),
        .target(name: "MiniThree"),
    ]
)
