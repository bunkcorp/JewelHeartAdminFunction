import FirebaseAuth
import GoogleSignIn
import SwiftUI
import UIKit

/// UIScene lifecycle (required going forward). Hosts the SwiftUI root in a `UIWindowScene`.
final class JewelHeartSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = UIHostingController(rootView: AuthGate())
        self.window = window
        window.makeKeyAndVisible()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for ctx in URLContexts {
            if GIDSignIn.sharedInstance.handle(ctx.url) { continue }
            JewelHeartEmailLinkHolder.ingest(ctx.url)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
           let url = userActivity.webpageURL {
            JewelHeartEmailLinkHolder.ingest(url)
        }
    }
}
