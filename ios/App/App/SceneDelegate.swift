import UIKit
import Capacitor
import FirebaseAuth
import FirebaseCore

// Lets the iOS edge swipe walk the web view's history; React Router handles the popstate.
// The tabs (Home and My bets) are roots with nothing to swipe to, so the swipe is
// off while one shows. The JS side already keeps a tab first in the back list
// (mobile/navigation.js goToRoot); this also blocks the forward swipe into
// entries a tab unwound past. `url` KVO fires for pushState/replaceState too.
class MainViewController: CAPBridgeViewController {
    // Keep in sync with src/platform/tabRoots.js.
    private static let tabRoots: Set<String> = ["/", "/bets"]
    private var urlObservation: NSKeyValueObservation?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        urlObservation = webView?.observe(\.url, options: [.initial, .new]) { webView, _ in
            let path = webView.url?.path ?? "/"
            webView.allowsBackForwardNavigationGestures = !MainViewController.tabRoots.contains(path.isEmpty ? "/" : path)
        }
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        let remaining = Set(URLContexts.filter { context in
            FirebaseApp.app() == nil || !Auth.auth().canHandle(context.url)
        })
        if !remaining.isEmpty {
            SceneDelegateProxy.shared.scene(scene, openURLContexts: remaining)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
