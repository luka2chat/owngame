import Foundation

actor GameRepository {
    let root: URL
    private let transport: any GameTransport
    private var busy = false
    private let fm = FileManager.default
    init(root: URL, transport: any GameTransport = PublicTransport()) throws {
        self.root = root; self.transport = transport
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        var excluded = root
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try excluded.setResourceValues(values)
    }
    private func load<T: Decodable>(_ path: String, fallback: T) throws -> T {
        let url = try GamePaths.within(root, path)
        if !fm.fileExists(atPath: url.path) { return fallback }
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        try GamePaths.require(size <= 4 * 1024 * 1024, AppText.text("本地目录体积超限"))
        return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
    }
    private func save<T: Encodable>(_ value: T, _ path: String) throws {
        try write(JSONEncoder().encode(value), path)
    }
    private func write(_ data: Data, _ path: String) throws {
        let url = try GamePaths.within(root, path)
        try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
    }
    func catalog() throws -> [CatalogGame] { try load("remote.json", fallback: [CatalogGame]()) }
    func installed() throws -> [InstalledGame] { try load("installed.json", fallback: [InstalledGame]()) }
    func libraryGames() throws -> [CatalogGame] {
        let remote = try catalog()
        let ids = Set(remote.map(\.id))
        return remote.filter(\.supportsMobile) + (try installed()).map(\.game).filter { !ids.contains($0.id) && $0.supportsMobile }
    }
    func refresh() async throws {
        try GamePaths.require(!busy, AppText.text("已有下载或刷新正在进行"))
        busy = true; defer { busy = false }
        let response = try await transport.get("/catalog.json", limit: 2 * 1024 * 1024, range: nil)
        try GamePaths.require(response.status == 200 && response.data.count <= 2 * 1024 * 1024, AppText.text("目录下载失败"))
        let games = try JSONDecoder().decode([CatalogGame].self, from: response.data)
        try GamePaths.require(games.count <= 500 && Set(games.map(\.id)).count == games.count, AppText.text("游戏目录无效"))
        for game in games { try game.validate() }
        try Task.checkCancellation()
        try save(games, "remote.json")
    }
    private func validFile(_ url: URL, _ file: GameFile) -> Bool {
        // URL resource values may cache the size observed before FileHandle writes.
        guard let values = try? fm.attributesOfItem(atPath: url.path),
              values[.type] as? FileAttributeType == .typeRegular, values[.size] as? Int == file.bytes,
              let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { return false }
        return GamePaths.sha(data) == file.sha256
    }
    private func fetchFile(game: CatalogGame, file: GameFile, progress: @Sendable (Int) -> Void) async throws {
        let relative = "games/\(game.id)/\(game.version)/files/\(file.path)"
        let destination = try GamePaths.within(root, relative)
        if validFile(destination, file) { progress(file.bytes); return }
        let partPath = "games/\(game.id)/\(game.version)/partial/\(file.path).part"
        let partial = try GamePaths.within(root, partPath)
        try fm.createDirectory(at: partial.deletingLastPathComponent(), withIntermediateDirectories: true)
        if !fm.fileExists(atPath: partial.path) { try Data().write(to: partial) }
        let size = try fm.attributesOfItem(atPath: partial.path)[.size] as? Int ?? 0
        var offset = size <= file.bytes ? size : 0
        let output = try FileHandle(forWritingTo: partial)
        defer { try? output.close() }
        if offset == 0 { try output.truncate(atOffset: 0) }
        try output.seek(toOffset: UInt64(offset))
        progress(offset)
        while offset < file.bytes {
            try Task.checkCancellation()
            let end = min(offset + 256 * 1024, file.bytes)
            // A CDN may ignore Range; accept a bounded full response, verify it below, and store once.
            let response = try await transport.get(game.prefix + file.path, limit: file.bytes, range: offset..<end)
            if response.status == 200 {
                try GamePaths.require(response.data.count == file.bytes, AppText.text("下载文件不完整"))
                try output.truncate(atOffset: 0); try output.seek(toOffset: 0)
                try output.write(contentsOf: response.data); offset = file.bytes
            } else {
                let expected = "bytes \(offset)-\(end - 1)/\(file.bytes)"
                try GamePaths.require(response.status == 206 && response.contentRange == expected &&
                    response.data.count == end - offset, AppText.text("断点下载响应无效"))
                try output.write(contentsOf: response.data); offset = end
            }
            try output.synchronize(); progress(offset)
        }
        guard validFile(partial, file) else {
            try? fm.removeItem(at: partial)
            throw GameError.invalid(AppText.text("下载指纹不匹配，请重试"))
        }
        try fm.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        // File replacement stays within a single volume. No published pointer changes here.
        if fm.fileExists(atPath: destination.path) { _ = try fm.replaceItemAt(destination, withItemAt: partial) }
        else { try fm.moveItem(at: partial, to: destination) }
    }
    func download(_ id: String, progress: @Sendable (Int) -> Void = { _ in }) async throws {
        try GamePaths.require(!busy, AppText.text("已有下载或刷新正在进行"))
        busy = true; defer { busy = false }
        guard let game = try catalog().first(where: { $0.id == id }) else { throw GameError.invalid(AppText.text("请先刷新游戏库")) }
        try GamePaths.require(game.supportsMobile, AppText.text("这款游戏仅支持 PC"))
        let response = try await transport.get(game.manifest, limit: 2 * 1024 * 1024, range: nil)
        try GamePaths.require(response.status == 200 && response.data.count <= 2 * 1024 * 1024, AppText.text("清单下载失败"))
        let files = try GameManifest.validate(response.data, game: game)
        var complete = 0
        progress(0)
        for file in files {
            let done = complete
            try await fetchFile(game: game, file: file) { bytes in progress((done + bytes) * 100 / game.bytes) }
            complete += file.bytes
        }
        try Task.checkCancellation()
        var all = try installed()
        let old = all.first { $0.game.id == id }
        let previous = old?.game.version == game.version ? old?.previous : old?.game.version
        let delivery = InstalledGame(game: game, files: files, previous: previous)
        try save(delivery, "games/\(id)/\(game.version)/delivery.json")
        all.removeAll { $0.game.id == id }; all.append(delivery)
        try save(all, "installed.json")
    }
    func rollback(_ id: String) throws {
        try GamePaths.require(!busy, AppText.text("已有下载或刷新正在进行"))
        var all = try installed()
        guard let current = all.first(where: { $0.game.id == id }), let previous = current.previous else {
            throw GameError.invalid(AppText.text("没有可恢复的上一版"))
        }
        try GamePaths.identity(id, previous)
        let path = "games/\(id)/\(previous)/delivery.json"
        let data = try Data(contentsOf: GamePaths.within(root, path))
        var delivery = try JSONDecoder().decode(InstalledGame.self, from: data)
        try GamePaths.require(delivery.game.id == id && delivery.game.version == previous, AppText.text("上一版资料无效"))
        _ = try verifiedRoot(delivery)
        delivery.previous = nil
        all.removeAll { $0.game.id == id }; all.append(delivery)
        try save(all, "installed.json")
    }
    func playable(_ id: String) throws -> (InstalledGame, URL) {
        guard let delivery = try installed().first(where: { $0.game.id == id }) else {
            throw GameError.invalid(AppText.text("请先下载游戏"))
        }
        let latest = try catalog().first { $0.id == id }
        try GamePaths.require((latest ?? delivery.game).supportsMobile, AppText.text("这款游戏仅支持 PC"))
        return (delivery, try verifiedRoot(delivery))
    }
    private func verifiedRoot(_ delivery: InstalledGame) throws -> URL {
        try delivery.game.validate()
        try GamePaths.require(GamePaths.sha(try GamePaths.canonical(delivery.files)) == delivery.game.version &&
            delivery.files.contains { $0.path == delivery.game.entrypoint }, AppText.text("本地清单损坏"))
        let base = try GamePaths.within(root, "games/\(delivery.game.id)/\(delivery.game.version)/files")
        for file in delivery.files {
            try GamePaths.require(file.bytes >= 0 && file.bytes <= GamePaths.maxFile &&
                validFile(try GamePaths.within(base, file.path), file), AppText.text("本地游戏损坏，请重新下载"))
        }
        return base
    }
}
