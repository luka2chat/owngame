import Foundation

struct DevelopmentPackage: Decodable {
    static let schema = "owngame.device-package.v1"
    let schema: String
    let requestId: String
    let game: CatalogGame
    let files: [GameFile]
    struct Ready: Decodable { let schema: String; let requestId: String; let packageSha256: String }
    static func isRequest(_ value: String) -> Bool {
        GamePaths.matches(value, "^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$")
    }
    static func read(_ folder: URL) throws -> DevelopmentPackage {
        let request = folder.lastPathComponent
        try GamePaths.require(isRequest(request), "Invalid development request")
        func read(_ name: String, _ max: Int) throws -> Data {
            let file = try GamePaths.within(folder, name)
            let values = try file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
            try GamePaths.require(values.isRegularFile == true && (values.fileSize ?? Int.max) <= max, "Development metadata too large")
            return try Data(contentsOf: file)
        }
        let ready = try JSONDecoder().decode(Ready.self, from: read("ready.json", 4096))
        let data = try read("package.json", 2 * 1024 * 1024)
        try GamePaths.require(ready.schema == schema && ready.requestId == request && ready.packageSha256 == GamePaths.sha(data), "Development package incomplete")
        let package = try JSONDecoder().decode(DevelopmentPackage.self, from: data)
        try GamePaths.require(package.schema == schema && package.requestId == request && package.game.isDevelopment, "Invalid development package identity")
        let remote = package.files.map { RemoteFile(url: package.game.prefix + $0.path, bytes: $0.bytes, sha256: $0.sha256) }
        _ = try GameManifest.validate(JSONEncoder().encode(remote), game: package.game)
        return package
    }
}
