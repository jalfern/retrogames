// swift-tools-version:5.9
// JoustCore = the pure sim (shared by the app and the trace tool).
// joust-trace = replays a retrogames-rec/v1 recording on the Mac and checks /
// writes a retrogames-trace/v1 trace (the parity gate against the web game).
import PackageDescription

let package = Package(
    name: "JoustNative",
    platforms: [.macOS(.v14), .iOS(.v17), .tvOS(.v17)],
    products: [.library(name: "JoustCore", targets: ["JoustCore"])],
    targets: [
        .target(name: "JoustCore"),
        .executableTarget(name: "joust-trace", dependencies: ["JoustCore"]),
    ]
)
