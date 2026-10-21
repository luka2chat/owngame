import Foundation

// Pure HTTP response builder, also exercised on macOS without an iOS SDK.
enum GameHTTP {
    static let csp = "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'self' data: blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'"
    static func response(_ request: Data, root: URL, files: [GameFile], port: UInt16) -> Data {
        do {
            guard let text = String(data: request, encoding: .utf8), text.utf8.count <= 16384 else { return error(400) }
            let lines = text.components(separatedBy: "\r\n")
            let first = (lines.first ?? "").split(separator: " ")
            guard first.count == 3, ["GET", "HEAD"].contains(first[0]), first[2] == "HTTP/1.1" else { return error(400) }
            var headers = [String: String]()
            for line in lines.dropFirst() where !line.isEmpty {
                guard let split = line.firstIndex(of: ":") else { return error(400) }
                let key = line[..<split].lowercased()
                guard headers[key] == nil else { return error(400) }
                headers[key] = line[line.index(after: split)...].trimmingCharacters(in: .whitespaces)
            }
            // Protect against browser DNS rebinding and requests made for unrelated origins.
            guard headers["host"] == "localhost:\(port)", headers["origin"] == nil || headers["origin"] == "http://localhost:\(port)" else { return error(403) }
            let rawPath = String(first[1]).components(separatedBy: "?")[0]
            guard rawPath.hasPrefix("/"), let decoded = rawPath.removingPercentEncoding else { return error(400) }
            var name = String(decoded.dropFirst())
            if name.isEmpty || name.hasSuffix("/") { name += "index.html" }
            try GamePaths.safe(name)
            guard let file = files.first(where: { $0.path == name }) else { return error(404) }
            let url = try GamePaths.within(root, name)
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            guard data.count == file.bytes else { return error(404) }
            var body = data, status = "200 OK", extra = ""
            if let range = headers["range"] {
                guard range.hasPrefix("bytes="), !range.contains(",") else { return error(416) }
                let pieces = range.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
                guard pieces.count == 2 else { return error(416) }
                let start: Int, end: Int
                if pieces[0].isEmpty, let suffix = Int(pieces[1]), suffix > 0 {
                    start = max(0, data.count - suffix); end = data.count - 1
                } else if let lower = Int(pieces[0]), lower >= 0 {
                    start = lower
                    if pieces[1].isEmpty { end = data.count - 1 }
                    else if let upper = Int(pieces[1]), upper >= 0 { end = min(upper, data.count - 1) }
                    else { return error(416) }
                } else { return error(416) }
                guard start <= end && start < data.count else { return error(416) }
                body = data.subdata(in: start..<(end + 1)); status = "206 Partial Content"
                extra = "Content-Range: bytes \(start)-\(end)/\(data.count)\r\n"
            }
            let head = "HTTP/1.1 \(status)\r\nContent-Type: \(mime(name))\r\nContent-Length: \(body.count)\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: \(csp)\r\nCross-Origin-Opener-Policy: same-origin\r\nCross-Origin-Embedder-Policy: require-corp\r\n\(extra)Connection: close\r\n\r\n"
            return Data(head.utf8) + (first[0] == "HEAD" ? Data() : body)
        } catch { return self.error(403) }
    }
    static func error(_ status: Int) -> Data {
        Data("HTTP/1.1 \(status) Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".utf8)
    }
    static func mime(_ name: String) -> String {
        let types = ["html": "text/html; charset=utf-8", "js": "application/javascript", "mjs": "application/javascript",
            "css": "text/css", "json": "application/json", "wasm": "application/wasm", "svg": "image/svg+xml",
            "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "ico": "image/x-icon",
            "woff": "font/woff", "woff2": "font/woff2", "ttf": "font/ttf", "otf": "font/otf",
            "mp3": "audio/mpeg", "ogg": "audio/ogg", "wav": "audio/wav", "mp4": "video/mp4", "txt": "text/plain"]
        return types[URL(fileURLWithPath: name).pathExtension.lowercased()] ?? "application/octet-stream"
    }
}
