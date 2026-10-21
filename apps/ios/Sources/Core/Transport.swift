import Foundation

struct GameResponse { let data: Data; let status: Int; let contentRange: String? }
protocol GameTransport: Sendable {
    func get(_ route: String, limit: Int, range: Range<Int>?) async throws -> GameResponse
}

// Reuse connections across ranges; each task still has its own bounded delegate.
// Cookies, credentials and URL caching remain disabled.
final class PublicTransport: GameTransport, @unchecked Sendable {
    private let session = URLSession(configuration: BoundedRequest.configuration())
    deinit { session.invalidateAndCancel() }
    func get(_ route: String, limit: Int, range: Range<Int>? = nil) async throws -> GameResponse {
        try GamePaths.route(route)
        let url = URL(string: "https://owngame.dev" + route)!
        var request = URLRequest(url: url)
        request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if let range { request.setValue("bytes=\(range.lowerBound)-\(range.upperBound - 1)", forHTTPHeaderField: "Range") }
        let body = BoundedRequest(limit: limit)
        return try await body.run(request, using: session)
    }
}

final class BoundedRequest: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private let limit: Int
    private var bytes = Data()
    private var response: HTTPURLResponse?
    private var continuation: CheckedContinuation<GameResponse, Error>?
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var failure: Error?
    private var redirects = 0
    private let lock = NSLock()
    private var cancelled = false
    private var ownsSession = true
    init(limit: Int) { self.limit = limit }
    static func configuration() -> URLSessionConfiguration {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 25
        config.timeoutIntervalForResource = 90
        config.httpShouldSetCookies = false
        config.httpCookieStorage = nil
        config.urlCredentialStorage = nil
        config.urlCache = nil
        return config
    }
    func run(_ request: URLRequest, using reusableSession: URLSession? = nil) async throws -> GameResponse {
        try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { continuation in
                lock.lock(); defer { lock.unlock() }
                if cancelled { continuation.resume(throwing: CancellationError()); return }
                self.continuation = continuation
                ownsSession = reusableSession == nil
                let session = reusableSession ?? URLSession(configuration: Self.configuration(), delegate: self, delegateQueue: nil)
                self.session = session
                let task = session.dataTask(with: request)
                if reusableSession != nil { task.delegate = self }
                self.task = task; task.resume()
            }
        }, onCancel: {
            self.lock.lock(); self.cancelled = true; self.task?.cancel(); self.lock.unlock()
        })
    }
    static func allowedRedirect(from: URL, to: URL) -> Bool {
        from.path.hasSuffix("/index.html") && to.scheme == "https" && to.host == "owngame.dev" &&
        to.port == nil && to.user == nil && to.password == nil && to.query == nil && to.fragment == nil &&
        URLComponents(url: to, resolvingAgainstBaseURL: false)?.percentEncodedPath ==
            URLComponents(url: from, resolvingAgainstBaseURL: false)?.percentEncodedPath.replacingOccurrences(of: "index.html", with: "", options: .backwards, range: nil)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        redirects += 1
        guard redirects <= 3, let from = response.url, let to = request.url, Self.allowedRedirect(from: from, to: to) else {
            failure = GameError.invalid(AppText.text("拒绝不受信任的重定向")); completionHandler(nil); return
        }
        completionHandler(request)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse, [200, 206].contains(http.statusCode),
              response.expectedContentLength <= Int64(limit) else {
            failure = GameError.invalid(AppText.text("下载响应无效或体积超限")); completionHandler(.cancel); return
        }
        self.response = http; completionHandler(.allow)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard bytes.count + data.count <= limit else {
            failure = GameError.invalid(AppText.text("下载体积超限")); dataTask.cancel(); return
        }
        bytes.append(data)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        defer {
            if ownsSession { session.finishTasksAndInvalidate() }
            lock.lock(); self.session = nil; self.task = nil; lock.unlock()
        }
        if let error = failure ?? error { continuation?.resume(throwing: error) }
        else if let response {
            continuation?.resume(returning: GameResponse(data: bytes, status: response.statusCode,
                contentRange: response.value(forHTTPHeaderField: "Content-Range")))
        } else { continuation?.resume(throwing: GameError.invalid(AppText.text("没有下载响应"))) }
        continuation = nil
    }
}
