import SwiftUI

@main
struct JewelHeartAdminApp: App {
    @UIApplicationDelegateAdaptor(JewelHeartAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            AuthGate()
        }
    }
}
