// swift-tools-version:5.9
// EmberwoodCore = the pure sim + world + trace codec (shared by the app and the CLI).
// emberwood-trace = replays retrogames-rec/v1 recordings on the Mac and checks
// them against the web game's golden traces (the parity gate).
import PackageDescription

let package = Package(
    name: "EmberwoodNative",
    platforms: [.macOS(.v14), .iOS(.v17), .tvOS(.v17)],
    products: [.library(name: "EmberwoodCore", targets: ["EmberwoodCore"])],
    targets: [
        .target(name: "EmberwoodCore"),
        .executableTarget(name: "emberwood-trace", dependencies: ["EmberwoodCore"]),
    ]
)
