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
}
