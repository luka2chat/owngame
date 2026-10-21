import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Library", sessionRole: session.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    var library: LibraryViewController?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        let library = LibraryViewController()
        self.window = window; self.library = library
        if let shortcut = options.shortcutItem,
           let id = shortcut.userInfo?["game"] as? String { library.pendingGame = id }
        window.rootViewController = library; window.makeKeyAndVisible()
    }
    func sceneDidBecomeActive(_ scene: UIScene) {
        UIApplication.shared.shortcutItems = (UIApplication.shared.shortcutItems ?? []).map { original in
            guard let item = original.mutableCopy() as? UIMutableApplicationShortcutItem else { return original }
            if let id = item.userInfo?["game"] as? String {
                item.localizedTitle = AppText.title(id, item.localizedTitle)
                item.localizedSubtitle = AppText.text("离线开玩")
            }
            return item
        }
        library?.refreshIfIdle()
    }
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        guard let id = shortcutItem.userInfo?["game"] as? String else { completionHandler(false); return }
        library?.openGame(id); completionHandler(true)
    }
}

enum Brand {
    static let paper = UIColor(red: 250/255, green: 245/255, blue: 232/255, alpha: 1)
    static let ink = UIColor(red: 34/255, green: 37/255, blue: 31/255, alpha: 1)
    static let red = UIColor(red: 238/255, green: 61/255, blue: 38/255, alpha: 1)
}
