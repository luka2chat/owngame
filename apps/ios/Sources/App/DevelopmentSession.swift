import Foundation

@MainActor
final class DevelopmentSession {
    let folder: URL
    private var value: [String: Any]
    private var sequence = -1
    init(folder: URL) {
        self.folder = folder
        value = ["schema": "owngame.device-receipt.v1", "requestId": folder.lastPathComponent]
    }
    static func inbox() throws -> URL {
        let fm = FileManager.default
        let documents = try fm.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let inbox = documents.appendingPathComponent("DevelopmentInbox")
        try fm.createDirectory(at: inbox, withIntermediateDirectories: true)
        var excluded = inbox, attributes = URLResourceValues(); attributes.isExcludedFromBackup = true
        try excluded.setResourceValues(attributes)
        return inbox
    }
    func installed(_ delivery: InstalledGame) {
        value["gameId"] = delivery.game.id; value["version"] = delivery.game.version
        state("installed")
    }
    func running() { state("running"); cleanupTransfer() }
    func failed(_ error: Error) { state("failed", error.localizedDescription); cleanupTransfer() }
    func logs(_ snapshot: [String: Any]) {
        guard let next = snapshot["sequence"] as? Int, next != sequence,
              let messages = snapshot["logs"] as? [[String: Any]] else { return }
        sequence = next
        value["logs"] = Array(messages.suffix(100)).map { row -> [String: Any] in
            ["level": String((row["level"] as? String ?? "log").prefix(20)),
             "message": String((row["message"] as? String ?? "").prefix(2000))]
        }
        write()
    }
    private func cleanupTransfer() {
        let folder = folder
        Task.detached {
            for name in ["files", "package.json", "ready.json"] { try? FileManager.default.removeItem(at: folder.appendingPathComponent(name)) }
        }
    }
    private func state(_ status: String, _ message: String = "") {
        value["status"] = status; value["message"] = String(message.prefix(2000)); write()
    }
    private func write() {
        value["updatedAt"] = Date().timeIntervalSince1970 * 1000
        do {
            let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
            try data.write(to: GamePaths.within(folder, "receipt.json"), options: .atomic)
        } catch { NSLog("Owngame development receipt: %@", error.localizedDescription) }
    }
    static let captureScript = """
    (() => {
      const logs = []; let sequence = 0;
      const record = (level, args) => {
        const message = args.map(arg => { try { return typeof arg === 'string' ? arg : JSON.stringify(arg) ?? String(arg); } catch { return String(arg); } }).join(' ').slice(0, 2000);
        logs.push({level, message}); if (logs.length > 100) logs.shift(); sequence++;
      };
      ['log','info','warn','error','debug'].forEach(level => {
        const original = console[level]; console[level] = (...args) => { record(level, args); original.apply(console, args); };
      });
      addEventListener('error', event => record('error', [event.message || 'Resource load error', event.filename || '', event.lineno || '']), true);
      addEventListener('unhandledrejection', event => record('error', ['Unhandled rejection', String(event.reason)]));
      window.__owngameDevelopmentRead = () => ({sequence, logs});
    })();
    """
}
