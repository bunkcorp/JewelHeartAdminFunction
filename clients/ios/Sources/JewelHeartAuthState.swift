import FirebaseAuth
import FirebaseCore
import Foundation

/// Drives sign-in / sign-out UI: Firebase restores persisted sessions on launch, but SwiftUI must
/// listen for `addStateDidChangeListener` to refresh when `signOut()` runs.
@MainActor
final class JewelHeartAuthState: ObservableObject {
    @Published private(set) var user: User?
    private var handle: AuthStateDidChangeListenerHandle?

    init() {
        // `AuthGate` / scene can be constructed very early; ensure default app exists before Auth.
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        user = Auth.auth().currentUser
        handle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                self?.user = user
            }
        }
    }

    deinit {
        if let handle {
            Auth.auth().removeStateDidChangeListener(handle)
        }
    }
}
