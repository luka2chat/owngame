import Foundation
import Testing
@testable import OwngameCore

private actor FixtureTransport: GameTransport {
    var bodies = [String: Data]()
    var failures = Set<String>()
    var failAfter: Int?
    var fullResponse = false
    var invalidRange = false
    var requests = [(String, Int)]()
    func put(_ route: String, _ data: Data) { bodies[route] = data }
    func setFailure(_ route: String) { failures.insert(route) }
    func clearFailures() { failures.removeAll(); failAfter = nil }
    func interrupt(at offset: Int) { failAfter = offset }
    func mode(full: Bool = false, badRange: Bool = false) { fullResponse = full; invalidRange = badRange }
    func get(_ route: String, limit: Int, range: Range<Int>?) async throws -> GameResponse {
        requests.append((route, range?.lowerBound ?? 0))
        if failures.contains(route) || (range != nil && (range?.lowerBound ?? 0) >= (failAfter ?? Int.max)) {
            throw GameError.invalid("fixture offline")
        }
        guard let data = bodies[route] else { throw GameError.invalid("fixture missing") }
        if let range, !fullResponse {
            return GameResponse(data: data.subdata(in: range), status: 206,
                contentRange: invalidRange ? "bytes 0-1/2" : "bytes \(range.lowerBound)-\(range.upperBound - 1)/\(data.count)")
        }
        return GameResponse(data: data, status: 200, contentRange: nil)
    }
}

private struct Fixture {
    let root: URL
    let transport: FixtureTransport
    let repo: GameRepository
    init() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("owngame-test-" + UUID().uuidString)
        transport = FixtureTransport()
        repo = try GameRepository(root: root, transport: transport)
    }
    func clean() { try? FileManager.default.removeItem(at: root) }
    func version(_ content: Data, id: String = "sample") async throws -> CatalogGame {
        let files = [GameFile(path: "index.html", bytes: content.count, sha256: GamePaths.sha(content))]
        let version = GamePaths.sha(try GamePaths.canonical(files))
        let prefix = "/games/\(id)/\(version)/"
        let game = CatalogGame(id: id, title: "测试", description: "测试游戏", category: "益智", version: version,
            entry: prefix + "index.html", manifest: prefix + "manifest.json", bytes: content.count)
        let manifest = [RemoteFile(url: prefix + "index.html", bytes: content.count, sha256: files[0].sha256)]
        await transport.put(game.manifest, try JSONEncoder().encode(manifest))
        await transport.put(game.entry, content)
        await transport.put("/catalog.json", try JSONEncoder().encode([game]))
        return game
    }
}

@Test func rejectsUnsafePathsAndSymlinks() throws {
    for path in ["", "/index.html", "../file", "a/../b", "a//b", "a/", "a\\b", "a%2fb", "a?b", "a#b", "a:b", "a\nb"] {
        #expect(throws: (any Error).self) { try GamePaths.safe(path) }
    }
    let f = try Fixture(); defer { f.clean() }
    try FileManager.default.createSymbolicLink(at: f.root.appendingPathComponent("link"), withDestinationURL: f.root)
    #expect(throws: (any Error).self) { try GamePaths.within(f.root, "link/file") }
}

@Test func pcGamesStayOutOfMobileLibraryWithoutDeletingInstalls() async throws {
    let f = try Fixture(); defer { f.clean() }
    var game = try await f.version(Data("platform test".utf8))
    try await f.repo.refresh(); try await f.repo.download(game.id)
    #expect(try await f.repo.libraryGames().count == 1)
    game.platforms = ["pc"]
    await f.transport.put("/catalog.json", try JSONEncoder().encode([game])); try await f.repo.refresh()
    #expect(try await f.repo.libraryGames().isEmpty)
    #expect(try await f.repo.installed().count == 1)
    await #expect(throws: (any Error).self) { try await f.repo.download(game.id) }
    await #expect(throws: (any Error).self) { try await f.repo.playable(game.id) }
    for targets in [[], ["pc", "pc"], ["desktop"]] as [[String]] {
        game.platforms = targets
        await f.transport.put("/catalog.json", try JSONEncoder().encode([game]))
        await #expect(throws: (any Error).self) { try await f.repo.refresh() }
        #expect(try await f.repo.libraryGames().isEmpty)
    }
    game.platforms = ["mobile"]
    await f.transport.put("/catalog.json", try JSONEncoder().encode([game])); try await f.repo.refresh()
    #expect(try await f.repo.libraryGames().count == 1)
    #expect(try await f.repo.playable(game.id).0.game.platforms == nil)
    try await f.repo.download(game.id)
    #expect(try await f.repo.installed().first?.game.platforms == ["mobile"])
    await f.transport.put("/catalog.json", Data("[]".utf8)); try await f.repo.refresh()
    #expect(try await f.repo.libraryGames().count == 1)
}

@Test func installsOfflineAndSurvivesRepositoryRestart() async throws {
    let f = try Fixture(); defer { f.clean() }
    let game = try await f.version(Data("<h1>play</h1>".utf8))
    try await f.repo.refresh(); try await f.repo.download(game.id)
    await f.transport.setFailure("/catalog.json")
    await #expect(throws: (any Error).self) { try await f.repo.refresh() }
    let restarted = try GameRepository(root: f.root, transport: f.transport)
    let (installed, root) = try await restarted.playable(game.id)
    #expect(installed.game == game)
    #expect(try String(contentsOf: root.appendingPathComponent("index.html")) == "<h1>play</h1>")
}

@Test func brokenUpdateRetainsOldVersionThenRollsBack() async throws {
    let f = try Fixture(); defer { f.clean() }
    let old = try await f.version(Data("old".utf8)); try await f.repo.refresh(); try await f.repo.download(old.id)
    let new = try await f.version(Data("new".utf8)); try await f.repo.refresh()
    await f.transport.put(new.entry, Data("bad".utf8))
    await #expect(throws: (any Error).self) { try await f.repo.download(new.id) }
    #expect(try await f.repo.installed().first?.game.version == old.version)
    await f.transport.put(new.entry, Data("new".utf8)); try await f.repo.download(new.id)
    #expect(try await f.repo.installed().first?.previous == old.version)
    try await f.repo.rollback(new.id)
    #expect(try await f.repo.installed().first?.game.version == old.version)
}

@Test func damagedPreviousVersionCannotReplaceCurrent() async throws {
    let f = try Fixture(); defer { f.clean() }
    let old = try await f.version(Data("old".utf8)); try await f.repo.refresh(); try await f.repo.download(old.id)
    let new = try await f.version(Data("new".utf8)); try await f.repo.refresh(); try await f.repo.download(new.id)
    try Data("bad".utf8).write(to: f.root.appendingPathComponent("games/sample/\(old.version)/files/index.html"))
    await #expect(throws: (any Error).self) { try await f.repo.rollback(new.id) }
    #expect(try await f.repo.installed().first?.game.version == new.version)
}

@Test func resumesInterruptedDownload() async throws {
    let f = try Fixture(); defer { f.clean() }
    let game = try await f.version(Data(repeating: 65, count: 600000)); try await f.repo.refresh()
    await f.transport.interrupt(at: 262144)
    await #expect(throws: (any Error).self) { try await f.repo.download(game.id) }
    #expect(try await f.repo.installed().isEmpty)
    await f.transport.clearFailures(); try await f.repo.download(game.id)
    let requests = await f.transport.requests
    #expect(requests.filter { $0.0 == game.entry && $0.1 == 0 }.count == 1)
    #expect(try await f.repo.installed().first?.game.version == game.version)
}

@Test func supportsCDNThatIgnoresRange() async throws {
    let f = try Fixture(); defer { f.clean() }
    let game = try await f.version(Data(repeating: 66, count: 600000)); try await f.repo.refresh()
    await f.transport.mode(full: true); try await f.repo.download(game.id)
    #expect(try await f.repo.installed().count == 1)
}

@Test func rejectsIncorrectContentRange() async throws {
    let f = try Fixture(); defer { f.clean() }
    let game = try await f.version(Data("hello".utf8)); try await f.repo.refresh()
    await f.transport.mode(badRange: true)
    await #expect(throws: (any Error).self) { try await f.repo.download(game.id) }
    #expect(try await f.repo.installed().isEmpty)
}

@Test func unlistedGameRemainsInstalled() async throws {
    let f = try Fixture(); defer { f.clean() }
    let game = try await f.version(Data("play".utf8)); try await f.repo.refresh(); try await f.repo.download(game.id)
    await f.transport.put("/catalog.json", Data("[]".utf8)); try await f.repo.refresh()
    #expect(try await f.repo.catalog().isEmpty)
    #expect(try await f.repo.playable(game.id).0.game == game)
}

@Test func badCatalogDoesNotReplaceCachedCatalog() async throws {
    let f = try Fixture(); defer { f.clean() }
    let game = try await f.version(Data("play".utf8)); try await f.repo.refresh()
    await f.transport.put("/catalog.json", try JSONEncoder().encode([game, game]))
    await #expect(throws: (any Error).self) { try await f.repo.refresh() }
    #expect(try await f.repo.catalog() == [game])
}

@Test func manifestCannotChangeVersionOrEscapeDirectory() async throws {
    let f = try Fixture(); defer { f.clean() }
    let game = try await f.version(Data("play".utf8))
    for route in ["/other/index.html", game.prefix + "../index.html", game.prefix + "index.html"] {
        let bad = [RemoteFile(url: route, bytes: 4, sha256: String(repeating: "0", count: 64))]
        #expect(throws: (any Error).self) { try GameManifest.validate(JSONEncoder().encode(bad), game: game) }
    }
}

@Test func redirectPolicyAllowsOnlySameDirectoryIndexRedirect() {
    let from = URL(string: "https://owngame.dev/games/a/v/index.html")!
    #expect(BoundedRequest.allowedRedirect(from: from, to: URL(string: "https://owngame.dev/games/a/v/")!))
    for value in ["http://owngame.dev/games/a/v/", "https://evil.test/games/a/v/", "https://owngame.dev/other/",
                  "https://owngame.dev:443/games/a/v/", "https://owngame.dev/games/a/v/?x=y", "https://user@owngame.dev/games/a/v/"] {
        #expect(!BoundedRequest.allowedRedirect(from: from, to: URL(string: value)!))
    }
}

@Test func httpServesOnlyAllowedGameAndSupportsRanges() throws {
    let f = try Fixture(); defer { f.clean() }
    let data = Data("0123456789".utf8)
    try data.write(to: f.root.appendingPathComponent("index.html"))
    try Data("private".utf8).write(to: f.root.appendingPathComponent("private.json"))
    let files = [GameFile(path: "index.html", bytes: data.count, sha256: GamePaths.sha(data))]
    func response(_ path: String, host: String = "localhost:20000", method: String = "GET", header: String = "") -> String {
        String(decoding: GameHTTP.response(Data("\(method) \(path) HTTP/1.1\r\nHost: \(host)\r\n\(header)\r\n".utf8), root: f.root, files: files, port: 20000), as: UTF8.self)
    }
    #expect(response("/").hasSuffix("0123456789"))
    #expect(response("/", header: "Range: bytes=2-4\r\n").hasSuffix("234"))
    #expect(response("/", header: "Range: bytes=-3\r\n").hasSuffix("789"))
    #expect(response("/", header: "Range: bytes=999-\r\n").contains("416 Error"))
    #expect(response("/", method: "HEAD").hasSuffix("\r\n\r\n"))
    #expect(response("/private.json").contains("404 Error"))
    #expect(response("/../private.json").contains("403 Error"))
    #expect(response("/%2e%2e/private.json").contains("403 Error"))
    #expect(response("/", host: "evil.test:20000").contains("403 Error"))
    #expect(response("/", header: "Origin: https://evil.test\r\n").contains("403 Error"))
    #expect(response("/").contains("Content-Security-Policy:"))
    #expect(GameHTTP.mime("game.wasm") == "application/wasm")
}

@Test func realLoopbackServerAndBoundedNetworkDownload() async throws {
    let f = try Fixture(); defer { f.clean() }
    let data = Data("offline game body".utf8)
    try data.write(to: f.root.appendingPathComponent("index.html"))
    let files = [GameFile(path: "index.html", bytes: data.count, sha256: GamePaths.sha(data))]
    let server = LocalGameServer(); defer { server.stop() }
    let port = UInt16.random(in: 61000..<63000)
    try await server.start(root: f.root, files: files, port: port)
    let request = URLRequest(url: URL(string: "http://localhost:\(port)/index.html")!)
    let response = try await BoundedRequest(limit: 100).run(request)
    #expect(response.status == 200 && response.data == data)
    await #expect(throws: (any Error).self) { try await BoundedRequest(limit: 2).run(request) }
    let session = URLSession(configuration: BoundedRequest.configuration())
    defer { session.invalidateAndCancel() }
    await #expect(throws: (any Error).self) { try await BoundedRequest(limit: 2).run(request, using: session) }
    let afterLimitFailure = try await BoundedRequest(limit: 100).run(request, using: session)
    #expect(afterLimitFailure.status == 200 && afterLimitFailure.data == data)
}

@Test func damagedInstalledFileIsRefusedAndCanBeRepaired() async throws {
    let f = try Fixture(); defer { f.clean() }
    let game = try await f.version(Data("game".utf8)); try await f.repo.refresh(); try await f.repo.download(game.id)
    let file = f.root.appendingPathComponent("games/sample/\(game.version)/files/index.html")
    try Data("bad!".utf8).write(to: file)
    await #expect(throws: (any Error).self) { try await f.repo.playable(game.id) }
    try await f.repo.download(game.id)
    #expect(try await f.repo.playable(game.id).0.game.version == game.version)
}

// Optional, explicitly invoked public-network contract check. Downloads only the catalogue and manifests.
@Test(.enabled(if: ProcessInfo.processInfo.environment["OWNGAME_IOS_LIVE"] == "1"))
func currentPublicManifestsMatchCanonicalFingerprint() async throws {
    let transport = PublicTransport()
    let response = try await transport.get("/catalog.json", limit: 2 * 1024 * 1024)
    let games = try JSONDecoder().decode([CatalogGame].self, from: response.data)
    #expect(!games.isEmpty)
    for game in games {
        let manifest = try await transport.get(game.manifest, limit: 2 * 1024 * 1024)
        let files = try GameManifest.validate(manifest.data, game: game)
        #expect(files.contains { $0.path == game.entrypoint })
    }
}
