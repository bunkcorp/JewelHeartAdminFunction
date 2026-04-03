import UIKit
import FirebaseCore

/// Satisfies Firebase `GoogleUtilities/AppDelegateSwizzler` (SwiftUI `@main` apps have no UIAppDelegate by default).
final class JewelHeartAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        return true
    }
}
