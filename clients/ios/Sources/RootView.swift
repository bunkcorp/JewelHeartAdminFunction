import SwiftUI
import FirebaseAuth
import UIKit

struct RootView: View {
    @State private var error: String?
    @State private var screenId = "jewelheart.home"
    @State private var retreatId: String?
    @State private var extraParams: [String: String] = [:]
    @State private var envelope: SDUIEnvelope?

    var body: some View {
        NavigationStack {
            Group {
                if let e = envelope {
                    SDUIRoot(screen: e.screen) { action in
                        await handle(action)
                    }
                } else if let error {
                    Text(error).foregroundStyle(.red).padding()
                } else {
                    ProgressView("Loading…")
                }
            }
            .navigationTitle(envelope?.screen.title ?? "Home")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Reload") { Task { await load() } }
                }
            }
        }
        .task { await load() }
        .onChange(of: Auth.auth().currentUser?.uid) { _, _ in
            Task { await load() }
        }
    }

    private func load() async {
        await MainActor.run {
            error = nil
            envelope = nil
        }
        guard Auth.auth().currentUser?.uid != nil else {
            JewelHeartLog.uiWarning("load blocked: not signed in")
            await MainActor.run { error = "Sign in first." }
            return
        }
        JewelHeartLog.uiInfo("load start screenId=\(self.screenId) uid=\(String((Auth.auth().currentUser?.uid ?? "").prefix(8)))…")
        do {
            let api = JewelHeartAPI()
            let env = try await api.fetchScreen(screenId: screenId, retreatId: retreatId, params: extraParams)
            JewelHeartLog.uiInfo("load ok screen.id=\(env.screen.id) schema=\(env.schemaVersion)")
            await MainActor.run { envelope = env }
        } catch {
            let line = JewelHeartLog.describe(error)
            JewelHeartLog.uiError("load FAILED: \(line)")
            await MainActor.run { self.error = error.localizedDescription }
        }
    }

    private func handle(_ action: SDUIAction) async {
        switch action.type {
        case "navigate":
            guard let target = action.target else { return }
            await MainActor.run {
                screenId = target
                if let r = action.payload?["retreatId"] {
                    retreatId = r
                } else if target == "retreat.list" || target == "jewelheart.home" {
                    retreatId = nil
                }
                switch target {
                case "retreat.schedule", "retreat.home", "retreat.list", "jewelheart.home":
                    extraParams.removeValue(forKey: "day")
                    extraParams.removeValue(forKey: "weekMonday")
                case "retreat.schedule.day":
                    extraParams.removeValue(forKey: "weekMonday")
                    if let d = action.payload?["day"], !d.isEmpty {
                        extraParams["day"] = d
                    } else {
                        extraParams.removeValue(forKey: "day")
                    }
                case "retreat.volunteer.week":
                    extraParams.removeValue(forKey: "day")
                    if let wm = action.payload?["weekMonday"], !wm.isEmpty {
                        extraParams["weekMonday"] = wm
                    } else {
                        extraParams.removeValue(forKey: "weekMonday")
                    }
                default:
                    break
                }
                if let d = action.payload?["date"], !d.isEmpty {
                    extraParams["date"] = d
                }
            }
            await load()
        case "openUrl":
            guard let t = action.target, let url = URL(string: t) else { return }
            await MainActor.run { UIApplication.shared.open(url) }
        default:
            break
        }
    }
}

struct AuthGate: View {
    @StateObject private var auth = JewelHeartAuthState()

    var body: some View {
        Group {
            if auth.user != nil {
                AdminRootTabView()
            } else {
                JewelHeartSignInView()
            }
        }
    }
}
