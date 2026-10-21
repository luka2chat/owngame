import UIKit
import WebKit

final class GameViewController: UIViewController, WKNavigationDelegate {
    private let delivery: InstalledGame
    private let root: URL
    private weak var library: LibraryViewController?
    private let server = LocalGameServer()
    private var web: WKWebView!
    private var port: UInt16 = 0
    private var rules: WKContentRuleList?
    private let capsule = UIStackView()
    private let orientationHint = UILabel()
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    private var address: URL { URL(string: "http://localhost:\(port)/\(delivery.game.entrypoint)")! }
    init(delivery: InstalledGame, root: URL, library: LibraryViewController) {
        self.delivery = delivery; self.root = root; self.library = library
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }
    func start() async throws {
        // A separate persistent origin per game isolates Web storage and keeps saves across updates and relaunches.
        let defaults = UserDefaults.standard
        var ports = defaults.dictionary(forKey: "game-ports") as? [String: Int] ?? [:]
        let existing = ports[delivery.game.id]
        let chosen = existing ?? (20000..<60000).first { !ports.values.contains($0) }
        guard let chosen, let port = UInt16(exactly: chosen) else { throw GameError.invalid(AppText.text("没有可用的本机游戏端口")) }
        self.port = port
        try await server.start(root: root, files: delivery.files, port: port)
        do {
            let originPattern = "^http://localhost:\(port)/"
            let json: [[String: Any]] = [
                ["trigger": ["url-filter": ".*"], "action": ["type": "block"]],
                // WebKit's filter grammar does not support regex alternation.
                ["trigger": ["url-filter": "^data:"], "action": ["type": "ignore-previous-rules"]],
                ["trigger": ["url-filter": "^blob:"], "action": ["type": "ignore-previous-rules"]],
                ["trigger": ["url-filter": originPattern], "action": ["type": "ignore-previous-rules"]]
            ]
            let encoded = String(decoding: try JSONSerialization.data(withJSONObject: json), as: UTF8.self)
            rules = try await WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "owngame-\(port)", encodedContentRuleList: encoded)
            ports[delivery.game.id] = chosen; defaults.set(ports, forKey: "game-ports")
        } catch { server.stop(); throw error }
    }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        // Deliberately no script message handlers or native API bridge in a game WebView.
        if let rules { config.userContentController.add(rules) }
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self; web.scrollView.contentInsetAdjustmentBehavior = .never
        web.isOpaque = false; web.backgroundColor = .black; web.scrollView.backgroundColor = .black
        web.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.topAnchor), web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        // Match Android's floating more / close capsule without reserving a toolbar.
        capsule.axis = .horizontal; capsule.alignment = .center; capsule.distribution = .fill
        capsule.backgroundColor = UIColor(red: 20/255, green: 23/255, blue: 26/255, alpha: 175/255)
        capsule.layer.cornerRadius = 22; capsule.layer.borderWidth = 1
        capsule.layer.borderColor = UIColor.white.withAlphaComponent(0.35).cgColor
        let more = GameCapsuleButton(close: false)
        more.accessibilityLabel = AppText.text("更多游戏操作"); more.addTarget(self, action: #selector(menu), for: .touchUpInside)
        let close = GameCapsuleButton(close: true)
        close.accessibilityLabel = AppText.text("关闭游戏，返回首页"); close.addTarget(self, action: #selector(closeGame), for: .touchUpInside)
        let divider = UIView(); divider.backgroundColor = .white.withAlphaComponent(0.3)
        [more, divider, close].forEach(capsule.addArrangedSubview)
        NSLayoutConstraint.activate([more.widthAnchor.constraint(equalTo: close.widthAnchor),
            more.heightAnchor.constraint(equalToConstant: 44), close.heightAnchor.constraint(equalToConstant: 44),
            divider.widthAnchor.constraint(equalToConstant: 1), divider.heightAnchor.constraint(equalToConstant: 20)])
        view.addSubview(capsule)
        orientationHint.text = AppText.text("横屏显示不完整时，请竖屏游玩")
        orientationHint.accessibilityIdentifier = "game-orientation-hint"
        orientationHint.textColor = .white; orientationHint.font = .systemFont(ofSize: 13, weight: .medium)
        orientationHint.textAlignment = .center; orientationHint.numberOfLines = 2
        orientationHint.backgroundColor = UIColor.black.withAlphaComponent(0.78)
        orientationHint.layer.cornerRadius = 12; orientationHint.clipsToBounds = true
        view.addSubview(orientationHint)
        view.tintColor = Brand.red
        web.load(URLRequest(url: address))
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let safe = view.safeAreaInsets
        capsule.frame = CGRect(x: view.bounds.maxX - safe.right - 124, y: max(12, safe.top + 6), width: 112, height: 44)
        orientationHint.isHidden = view.bounds.width <= view.bounds.height
        orientationHint.frame = CGRect(x: safe.left + 24, y: view.bounds.maxY - safe.bottom - 54,
            width: max(0, view.bounds.width - safe.left - safe.right - 48), height: 42)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        let allowed = url?.scheme == "http" && url?.host == "localhost" && url?.port == Int(port) &&
            url?.user == nil && url?.password == nil && navigationAction.targetFrame != nil
        decisionHandler(allowed ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        info(AppText.text("加载失败"), error.localizedDescription + AppText.text("。请返回游戏库后重新打开。"))
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        info(AppText.text("游戏已暂停"), AppText.text("系统释放了游戏内存。点击右上角菜单「重新打开」继续，已保存的进度保留。"))
    }
    @objc private func closeGame() {
        web.stopLoading(); server.stop(); library?.returnHome(); dismiss(animated: true)
    }
    @objc private func menu() {
        var actions: [(String, () -> Void)] = [(AppText.text("继续游戏"), {})]
        actions.append((library?.isFavorite(delivery.game.id) == true ? AppText.text("★  已收藏 · 取消收藏") : AppText.text("☆  收藏游戏"), { [weak self] in
            guard let self else { return }; self.library?.toggleFavorite(self.delivery.game.id)
        }))
        actions.append((AppText.text("加入 App 快速操作"), { [weak self] in self?.addShortcut() }))
        actions.append((AppText.text("重新打开"), { [weak self] in
            guard let self else { return }
            let confirm = UIAlertController(title: AppText.text("重新打开游戏？"), message: AppText.text("当前未保存的进度可能丢失。"), preferredStyle: .alert)
            confirm.addAction(UIAlertAction(title: AppText.text("继续玩"), style: .cancel))
            confirm.addAction(UIAlertAction(title: AppText.text("重新打开"), style: .default) { [weak self] _ in self?.web.reload() })
            self.present(confirm, animated: true)
        }))
        actions.append((AppText.text("写下评价"), { [weak self] in
            guard let self else { return }
            self.present(UINavigationController(rootViewController: ReviewViewController(game: self.delivery.game)), animated: true)
        }))
        actions.append((AppText.text("游戏信息"), { [weak self] in
            guard let self else { return }; self.info(AppText.title(self.delivery.game.id, self.delivery.game.title), AppText.description(self.delivery.game.id, self.delivery.game.description) + AppText.text("\n\n版本：") + self.delivery.game.version.prefix(12))
        }))
        actions.append((AppText.text("许可与素材说明"), { [weak self] in self?.licenses() }))
        actions.append((AppText.text("返回 owngame 首页"), { [weak self] in self?.closeGame() }))
        let menu = GameMenuViewController(gameTitle: AppText.title(delivery.game.id, delivery.game.title), actions: actions)
        present(menu, animated: true)
    }
    private func addShortcut() {
        var items = UIApplication.shared.shortcutItems ?? []
        items.removeAll { $0.userInfo?["game"] as? String == delivery.game.id }
        items.insert(UIApplicationShortcutItem(type: "dev.owngame.play", localizedTitle: AppText.title(delivery.game.id, delivery.game.title),
            localizedSubtitle: AppText.text("离线开玩"), icon: UIApplicationShortcutIcon(type: .play), userInfo: ["game": delivery.game.id as NSString]), at: 0)
        UIApplication.shared.shortcutItems = Array(items.prefix(4))
        info(AppText.text("已加入快速操作"), AppText.text("长按 owngame 的 App 图标即可选择游戏，最多保留最近添加的四款。"))
    }
    private func info(_ title: String, _ message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: AppText.text("知道了"), style: .default)); present(alert, animated: true)
    }
    private func licenses() {
        var text = AppText.text("owngame iOS 客户端自有代码采用 MIT 许可证。游戏与素材保留各自许可，详见下列随包文件。\n\n")
        if let shell = Bundle.main.url(forResource: "THIRD_PARTY_NOTICES", withExtension: "md", subdirectory: "Shell"),
           let notices = try? String(contentsOf: shell) { text += notices + "\n\n" }
        if let licenses = Bundle.main.resourceURL?.appendingPathComponent("Shell/LICENSES"),
           let files = try? FileManager.default.contentsOfDirectory(at: licenses, includingPropertiesForKeys: nil) {
            for url in files.sorted(by: { $0.path < $1.path }) {
                if let body = try? String(contentsOf: url) { text += "\n\n" + url.lastPathComponent + "\n" + body }
            }
        }
        for file in delivery.files where file.path.lowercased().contains("license") || file.path.lowercased().contains("third_party") {
            if file.bytes < 200000, let url = try? GamePaths.within(root, file.path), let body = try? String(contentsOf: url) {
                text += "\n\n" + file.path + "\n" + body
            }
        }
        let controller = UIViewController(); controller.title = AppText.text("许可与素材说明"); controller.view.backgroundColor = Brand.paper
        let view = UITextView(); view.isEditable = false; view.text = text; view.font = .systemFont(ofSize: 14); view.backgroundColor = Brand.paper
        controller.view = view
        controller.navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(closeSheet))
        present(UINavigationController(rootViewController: controller), animated: true)
    }
    @objc private func closeSheet() { presentedViewController?.dismiss(animated: true) }
    deinit { server.stop() }
}

private final class GameCapsuleButton: UIButton {
    private let close: Bool
    init(close: Bool) {
        self.close = close
        super.init(frame: .zero)
        isAccessibilityElement = true
        accessibilityTraits = .button
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }
    override var isHighlighted: Bool { didSet { setNeedsDisplay() } }
    override func draw(_ rect: CGRect) {
        UIColor.white.withAlphaComponent(isHighlighted ? 0.55 : 1).set()
        let center = CGPoint(x: bounds.midX, y: bounds.midY)
        if close {
            let ring = UIBezierPath(ovalIn: CGRect(x: center.x - 8, y: center.y - 8, width: 16, height: 16))
            ring.lineWidth = 2; ring.stroke()
            UIBezierPath(ovalIn: CGRect(x: center.x - 3, y: center.y - 3, width: 6, height: 6)).fill()
        } else {
            for offset in [-7, 0, 7] {
                UIBezierPath(ovalIn: CGRect(x: center.x + CGFloat(offset) - 2, y: center.y - 2, width: 4, height: 4)).fill()
            }
        }
    }
}

private final class GameMenuViewController: UIViewController {
    private let gameTitle: String
    private let actions: [(String, () -> Void)]
    init(gameTitle: String, actions: [(String, () -> Void)]) {
        self.gameTitle = gameTitle; self.actions = actions
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .pageSheet
        sheetPresentationController?.detents = [.custom { min(690, $0.maximumDetentValue) }]
        sheetPresentationController?.preferredCornerRadius = 24
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }
    override var prefersStatusBarHidden: Bool { true }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Brand.paper
        view.layer.borderWidth = 2; view.layer.borderColor = Brand.ink.cgColor
        let scroll = UIScrollView(); scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        let stack = UIStackView(); stack.axis = .vertical; stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false; scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.topAnchor), scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 24),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -26),
            stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 22),
            stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -22),
            stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -44)
        ])
        let title = UILabel(); title.text = gameTitle; title.font = .boldSystemFont(ofSize: 21); title.textColor = Brand.ink
        let note = UILabel(); note.text = AppText.text("你的游戏，随时开玩。"); note.font = .systemFont(ofSize: 14)
        note.textColor = UIColor(red: 110/255, green: 104/255, blue: 91/255, alpha: 1)
        stack.addArrangedSubview(title); stack.addArrangedSubview(note); stack.setCustomSpacing(15, after: note)
        for (label, action) in actions {
            var config = UIButton.Configuration.plain()
            config.title = label; config.baseForegroundColor = Brand.ink
            config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20)
            config.background.backgroundColor = Brand.paper
            config.background.cornerRadius = 12; config.background.strokeColor = Brand.ink; config.background.strokeWidth = 2
            let button = UIButton(configuration: config)
            button.contentHorizontalAlignment = .leading
            button.titleLabel?.font = .boldSystemFont(ofSize: 16)
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 52).isActive = true
            button.addAction(UIAction { [weak self] _ in self?.dismiss(animated: true, completion: action) }, for: .touchUpInside)
            stack.addArrangedSubview(button)
        }
    }
}
