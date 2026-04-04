import SwiftUI
import FirebaseCore

@main
struct JewelHeartAdminApp: App {
    @UIApplicationDelegateAdaptor(JewelHeartAppDelegate.self) private var appDelegate

    init() {
        // Configure before SwiftUI builds the scene; some Firebase code runs very early.
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
    }

    var body: some Scene {
        WindowGroup {
            AuthGate()
        }
    }
}
