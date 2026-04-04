import UIKit
import FirebaseCore

/// Registered with ObjC runtime for Firebase; `@MainActor` matches `UIApplicationDelegate` in current SDKs.
@objc(JewelHeartAppDelegate)
@MainActor
final class JewelHeartAppDelegate: NSObject, UIApplicationDelegate {

    func application(
        _ application: UIApplication,
        willFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        configureFirebaseIfNeeded()
        return true
    }

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        configureFirebaseIfNeeded()
        return true
    }

    private func configureFirebaseIfNeeded() {
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
    }
}
