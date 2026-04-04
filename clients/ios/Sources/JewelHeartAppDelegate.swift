import UIKit
import FirebaseCore

/// App entry (`@main`). Firebase configures here before any scene connects.
@objc(JewelHeartAppDelegate)
@main
final class JewelHeartAppDelegate: UIResponder, UIApplicationDelegate {

    func application(
        _ application: UIApplication,
        willFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        configureFirebaseIfNeeded()
        return true
    }

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        configureFirebaseIfNeeded()
        return true
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let name = "Default Configuration"
        let config = UISceneConfiguration(name: name, sessionRole: connectingSceneSession.role)
        config.delegateClass = JewelHeartSceneDelegate.self
        return config
    }

    private func configureFirebaseIfNeeded() {
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
    }
}
