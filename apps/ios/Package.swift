// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "OwngameCore",
    platforms: [.macOS(.v14), .iOS(.v16)],
    products: [.library(name: "OwngameCore", targets: ["OwngameCore"])],
    targets: [
        .target(name: "OwngameCore", path: "Sources/Core"),
        .testTarget(name: "OwngameCoreTests", dependencies: ["OwngameCore"], path: "Tests")
    ]
)
