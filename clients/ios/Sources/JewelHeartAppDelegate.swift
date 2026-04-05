import UIKit
import FirebaseCore
import GoogleSignIn

/// `@main` must be this class (not a wrapper `enum`) so GoogleUtilities/AppDelegateSwizzler sees a
/// real `UIApplicationDelegate`. Use `NSObject` (not `UIResponder`) so the Objective-C runtime
/// exposes the delegate the swizzler expects. Firebase is also configured in
/// `JewelHeartFirebaseEarlyConfigure.m` before `UIApplicationMain`.
@objc(JewelHeartAppDelegate)
@main
final class JewelHeartAppDelegate: NSObject, UIApplicationDelegate {

    override init() {
        // Configure before `super.init()` (cannot call instance methods on `self` yet). Avoid
        // `[FIRApp configure]` in ObjC `+load` / `constructor` — that runs before UIApplicationDelegate exists.
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        JewelHeartFirebaseBootstrapTouch()
        super.init()
    }

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
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        GIDSignIn.sharedInstance.handle(url)
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
