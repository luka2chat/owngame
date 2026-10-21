import Foundation
import CryptoKit

enum GameError: Error, LocalizedError {
    case invalid(String)
    var errorDescription: String? {
        switch self { case .invalid(let message): return message }
    }
}

enum GamePaths {
    static let maxFile = 25 * 1024 * 1024
    static let maxGame = 128 * 1024 * 1024
    static func require(_ condition: Bool, _ message: String) throws {
        if !condition { throw GameError.invalid(message) }
    }
    static func matches(_ value: String, _ pattern: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }
    static func identity(_ id: String, _ version: String) throws {
        try require(matches(id, "^[a-z0-9][a-z0-9-]{0,63}$") && matches(version, "^[a-f0-9]{64}$"), AppText.text("无效的游戏版本"))
    }
    static func safe(_ path: String) throws {
        try require(!path.isEmpty && path.utf8.count <= 512 && !path.hasPrefix("/"), AppText.text("无效的文件路径"))
        try require(!path.unicodeScalars.contains { $0.value < 32 || $0.value == 127 } &&
            !path.contains(where: { "\\%?#:".contains($0) }), AppText.text("无效的文件路径"))
        try require(path.split(separator: "/", omittingEmptySubsequences: false).allSatisfy {
            !$0.isEmpty && $0 != "." && $0 != ".."
        }, AppText.text("无效的文件路径"))
    }
    static func route(_ route: String) throws {
        try require(route.hasPrefix("/"), AppText.text("无效的下载地址"))
        try safe(String(route.dropFirst()))
    }
    static func within(_ base: URL, _ path: String) throws -> URL {
        try safe(path)
        let root = base.resolvingSymlinksInPath().standardizedFileURL
        let file = base.appendingPathComponent(path).resolvingSymlinksInPath().standardizedFileURL
        try require(file.path.hasPrefix(root.path + "/"), AppText.text("文件超出游戏目录"))
        // Refuse symlinks, including ones that still point inside the game.
        var cursor = base
        for part in path.split(separator: "/") {
            cursor.appendPathComponent(String(part))
            let values = try? cursor.resourceValues(forKeys: [.isSymbolicLinkKey])
            try require(values?.isSymbolicLink != true, AppText.text("不允许符号链接"))
        }
        return file
    }
    static func sha(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
    static func canonical(_ files: [GameFile]) throws -> Data {
        let rows: [[String: Any]] = files.map { ["bytes": $0.bytes, "path": $0.path, "sha256": $0.sha256] }
        return try JSONSerialization.data(withJSONObject: rows, options: [.sortedKeys, .withoutEscapingSlashes])
    }
}

struct CatalogGame: Codable, Equatable {
    var id: String
    var title: String
    var description: String
    var category: String?
    var version: String
    var entry: String
    var manifest: String
    var bytes: Int
    var platforms: [String]? = nil
    var supportsMobile: Bool { platforms?.contains("mobile") ?? true }
    var prefix: String { "/games/\(id)/\(version)/" }
    var entrypoint: String { String(entry.dropFirst(prefix.count)) }
    func validate() throws {
        if let platforms {
            try GamePaths.require(!platforms.isEmpty && Set(platforms).count == platforms.count &&
                platforms.allSatisfy { ["mobile", "pc"].contains($0) }, AppText.text("无效的游戏平台"))
        }
        try GamePaths.identity(id, version)
        try GamePaths.require(entry.hasPrefix(prefix) && manifest == prefix + "manifest.json", AppText.text("无效的游戏地址"))
        try GamePaths.route(entry)
        try GamePaths.safe(entrypoint)
        try GamePaths.require(!title.isEmpty && title.count <= 160 && description.count <= 2000 &&
            bytes > 0 && bytes <= GamePaths.maxGame && (category?.count ?? 0) <= 80, AppText.text("无效的游戏资料"))
    }
}

extension CatalogGame {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(id: try c.decode(String.self, forKey: .id), title: try c.decode(String.self, forKey: .title),
            description: try c.decode(String.self, forKey: .description), category: try c.decodeIfPresent(String.self, forKey: .category),
            version: try c.decode(String.self, forKey: .version), entry: try c.decode(String.self, forKey: .entry),
            manifest: try c.decode(String.self, forKey: .manifest), bytes: try c.decode(Int.self, forKey: .bytes),
            platforms: c.contains(.platforms) ? try c.decode([String].self, forKey: .platforms) : nil)
    }
}

struct RemoteFile: Codable { let url: String; let bytes: Int; let sha256: String }
struct GameFile: Codable, Equatable { let path: String; let bytes: Int; let sha256: String }
struct InstalledGame: Codable, Equatable {
    var game: CatalogGame
    var files: [GameFile]
    var previous: String?
}

enum GameManifest {
    static func validate(_ data: Data, game: CatalogGame) throws -> [GameFile] {
        try game.validate()
        let remote = try JSONDecoder().decode([RemoteFile].self, from: data)
        try GamePaths.require(!remote.isEmpty && remote.count <= 4096, AppText.text("文件数量超限"))
        var names = Set<String>(), total = 0, files = [GameFile]()
        for row in remote {
            try GamePaths.require(row.url.hasPrefix(game.prefix), AppText.text("文件不属于该游戏"))
            let name = String(row.url.dropFirst(game.prefix.count))
            try GamePaths.safe(name)
            try GamePaths.require(names.insert(name).inserted && row.bytes >= 0 && row.bytes <= GamePaths.maxFile &&
                GamePaths.matches(row.sha256, "^[a-f0-9]{64}$"), AppText.text("文件清单无效"))
            total += row.bytes
            try GamePaths.require(total <= GamePaths.maxGame, AppText.text("游戏体积超限"))
            files.append(GameFile(path: name, bytes: row.bytes, sha256: row.sha256))
        }
        // A parent cannot be both a file and a directory; exclude case-insensitive collisions on Apple filesystems.
        let folded = files.map { $0.path.precomposedStringWithCanonicalMapping.lowercased() }
        try GamePaths.require(Set(folded).count == folded.count, AppText.text("文件名冲突"))
        let foldedSet = Set(folded)
        for name in folded {
            var parts = name.split(separator: "/"); parts.removeLast()
            while !parts.isEmpty {
                try GamePaths.require(!foldedSet.contains(parts.joined(separator: "/")), AppText.text("文件与目录冲突"))
                parts.removeLast()
            }
        }
        try GamePaths.require(names.contains(game.entrypoint) && total == game.bytes &&
            GamePaths.sha(try GamePaths.canonical(files)) == game.version, AppText.text("游戏清单指纹不匹配"))
        return files
    }
}
