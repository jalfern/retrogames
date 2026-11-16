// swift-tools-version:5.9
// EmberwoodCore = the pure sim + world + trace codec (shared by the app and the CLI).
// emberwood-trace = replays retrogames-rec/v1 recordings on the Mac and checks
// them against the web game's golden traces (the parity gate).
// RetroKit (../RetroKit) = the JS math, trace codec and recording reader every port shares.
// EmberwoodRender = render.js on MiniThree; emberwood-render = the render-parity gate (parity/).
import PackageDescription

let package = Package(
    name: "EmberwoodNative",
    platforms: [.macOS(.v14), .iOS(.v17), .tvOS(.v17)],
    products: [.library(name: "EmberwoodCore", targets: ["EmberwoodCore"])],
    dependencies: [.package(path: "../RetroKit")],
    targets: [
        .target(name: "EmberwoodCore", dependencies: [.product(name: "RetroKit", package: "RetroKit")]),
        .executableTarget(name: "emberwood-trace", dependencies: ["EmberwoodCore", .product(name: "RetroKit", package: "RetroKit")]),
        // the render.js port on MiniThree (the app compiles the same folder)
        .target(name: "EmberwoodRender", dependencies: ["EmberwoodCore", .product(name: "RetroKit", package: "RetroKit"), .product(name: "MiniThree", package: "RetroKit")]),
        // emberwood-render = the render-parity gate's native half (offscreen Metal frames + compare)
        .executableTarget(name: "emberwood-render", dependencies: ["EmberwoodRender", "EmberwoodCore", .product(name: "RetroKit", package: "RetroKit"), .product(name: "MiniThree", package: "RetroKit")]),
    ]
)
