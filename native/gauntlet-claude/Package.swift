// swift-tools-version:5.9
// GauntletCore = the pure sim + halls + trace codec (shared by the app and the CLI).
// gauntlet-trace = replays retrogames-rec/v1 recordings on the Mac and checks
// them against the web game's golden traces (the parity gate).
// RetroKit (../RetroKit) = the JS math, trace codec and recording reader every port shares.
import PackageDescription

let package = Package(
    name: "GauntletNative",
    platforms: [.macOS(.v14), .iOS(.v17), .tvOS(.v17)],
    products: [.library(name: "GauntletCore", targets: ["GauntletCore"])],
    dependencies: [.package(path: "../RetroKit")],
    targets: [
        .target(name: "GauntletCore", dependencies: [.product(name: "RetroKit", package: "RetroKit")]),
        .executableTarget(name: "gauntlet-trace", dependencies: ["GauntletCore", .product(name: "RetroKit", package: "RetroKit")]),
    ]
)
