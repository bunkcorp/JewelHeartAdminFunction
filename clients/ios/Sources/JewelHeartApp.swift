import SwiftUI
import FirebaseCore

@main
struct JewelHeartAdminApp: App {
    init() {
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            AuthGate()
        }
    }
}
