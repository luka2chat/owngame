import UIKit
import WebKit

final class LibraryViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    private var web: WKWebView!
    private var repository: GameRepository?
    private var operation: Task<Void, Never>?
    private var opening = false
    private var downloading = ""
    private var progress = 0
    private var rows = "[]"
    var pendingGame: String?
    private let defaults = UserDefaults.standard
    private var shell: URL { Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Shell")! }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Brand.paper
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "library")
        let adapter = """
        window.__appLanguage = '\(AppText.language)';
        window.__appPlatform = 'ios';
        window.__nativeGamesJSON = '[]';
        window.Owngame = { list: () => window.__nativeGamesJSON };
        ['play','download','rollback','favorite','sync','checkAppUpdate'].forEach(action => {
          window.Owngame[action] = id => window.webkit.messageHandlers.library.postMessage({action, id: id || ''});
        });
        """
        config.userContentController.addUserScript(WKUserScript(source: adapter, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self; web.isOpaque = false; web.backgroundColor = Brand.paper
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(web)
        NSLayoutConstraint.activate([web.topAnchor.constraint(equalTo: view.topAnchor), web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor)])
        do {
            let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            repository = try GameRepository(root: support.appendingPathComponent("Owngame"))
        } catch { showError(error) }
        web.loadFileURL(shell, allowingReadAccessTo: shell.deletingLastPathComponent())
    }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if let id = pendingGame { pendingGame = nil; openGame(id) }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.request.url == shell ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { await pushRows() }
        refreshIfIdle()
    }
    func refreshIfIdle() {
        guard isViewLoaded, web.url == shell, operation == nil else { return }
        perform { try await $0.refresh() }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url == shell,
              let body = message.body as? [String: String], let action = body["action"] else { return }
        let id = body["id"] ?? ""
        if !id.isEmpty && !GamePaths.matches(id, "^[a-z0-9][a-z0-9-]{0,63}$") { return }
        switch action {
        case "sync": perform { try await $0.refresh() }
        case "download":
            perform(downloading: id) { repository in
                try await repository.download(id) { [weak self] percent in
                    Task { @MainActor in self?.progress = percent; await self?.pushRows() }
                }
            }
        case "rollback":
            let alert = UIAlertController(title: AppText.text("恢复上一版？"), message: AppText.text("校验成功后切回本机保留的上一版，收藏和存档保留。"), preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: AppText.text("取消"), style: .cancel))
            alert.addAction(UIAlertAction(title: AppText.text("恢复"), style: .default) { [weak self] _ in self?.perform { try await $0.rollback(id) } })
            present(alert, animated: true)
        case "favorite": toggleFavorite(id)
        case "play": openGame(id)
        case "checkAppUpdate": status(AppText.text("iOS 测试版。请在 TestFlight 中获取更新。"))
        default: break
        }
    }
    private func perform(downloading id: String = "", _ action: @escaping (GameRepository) async throws -> Void) {
        guard operation == nil, let repository else { status(AppText.text("正在处理，请稍候")); return }
        downloading = id; progress = 0
        status(id.isEmpty ? AppText.text("正在刷新游戏库…") : AppText.text("正在下载，完成后可离线玩…"))
        operation = Task {
            await pushRows()
            do { try await action(repository); status(id.isEmpty ? AppText.text("游戏库已更新") : AppText.text("下载完成 · 没网络也能玩")) }
            catch { status(id.isEmpty ? AppText.text("操作未完成，已下载的游戏照常玩。") + error.localizedDescription : AppText.text("下载未完成，旧版保留，点下载可继续。") + error.localizedDescription) }
            downloading = ""; operation = nil; await pushRows()
        }
    }
    func toggleFavorite(_ id: String) {
        defaults.set(!defaults.bool(forKey: "favorite:" + id), forKey: "favorite:" + id)
        Task { await pushRows() }
    }
    func isFavorite(_ id: String) -> Bool { defaults.bool(forKey: "favorite:" + id) }
    func returnHome() {
        web.callAsyncJavaScript("window.goHome && window.goHome()", arguments: [:], in: nil, in: .page, completionHandler: nil)
    }
    private func pushRows() async {
        guard let repository else { return }
        do {
            let all = try await repository.libraryGames(), installed = try await repository.installed()
            let result: [[String: Any]] = all.map { game in
                let old = installed.first { $0.game.id == game.id }
                return ["id": game.id, "title": game.title, "description": game.description, "category": game.category ?? AppText.text("其他"),
                    "bytes": game.bytes, "downloaded": old != nil, "update_available": old != nil && old?.game.version != game.version,
                    "previous_version": old?.previous ?? "", "favorite": isFavorite(game.id),
                    "last_played": defaults.double(forKey: "played:" + game.id), "downloading": downloading == game.id,
                    "progress": progress, "busy": operation != nil]
            }
            rows = String(decoding: try JSONSerialization.data(withJSONObject: result), as: UTF8.self)
            web.callAsyncJavaScript("window.__appLanguage = language; window.__nativeGamesJSON = rows; window.refresh();", arguments: ["language": AppText.language, "rows": rows], in: nil, in: .page, completionHandler: nil)
        } catch { status(AppText.text("本地游戏库读取失败：") + error.localizedDescription) }
    }
    private func status(_ text: String) {
        web?.callAsyncJavaScript("window.onStatus && window.onStatus(text)", arguments: ["text": text], in: nil, in: .page, completionHandler: nil)
    }
    func openGame(_ id: String) {
        guard isViewLoaded, let repository else { pendingGame = id; return }
        guard !opening, presentedViewController == nil else { return }
        opening = true
        Task {
            defer { opening = false }
            do {
                let (delivery, root) = try await repository.playable(id)
                let player = GameViewController(delivery: delivery, root: root, library: self)
                try await player.start()
                defaults.set(Date().timeIntervalSince1970 * 1000, forKey: "played:" + id)
                player.modalPresentationStyle = .fullScreen
                present(player, animated: true)
                await pushRows()
            } catch { showError(error) }
        }
    }
    private func showError(_ error: Error) {
        let alert = UIAlertController(title: AppText.text("暂时无法打开"), message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: AppText.text("知道了"), style: .default)); present(alert, animated: true)
    }
}
