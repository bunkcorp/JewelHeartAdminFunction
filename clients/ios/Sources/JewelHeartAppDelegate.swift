import UIKit
import SwiftUI
import FirebaseCore

/// UIKit app entry (`@main`) so `UIApplication.shared.delegate` is a real `UIApplicationDelegate`.
/// This matches what Firebase/GoogleUtilities expect and removes SwiftUI-adaptor delegate warnings.
@objc(JewelHeartAppDelegate)
@main
final class JewelHeartAppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }

        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = UIHostingController(rootView: AuthGate())
        self.window = window
        window.makeKeyAndVisible()
        return true
    }
}
