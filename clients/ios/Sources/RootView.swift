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
            .navigationTitle("JewelHeart")
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
        guard Auth.auth().currentUser != nil else {
            await MainActor.run { error = "Sign in first." }
            return
        }
        do {
            let api = JewelHeartAPI()
            let env = try await api.fetchScreen(screenId: screenId, retreatId: retreatId, params: extraParams)
            await MainActor.run { envelope = env }
        } catch {
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
                if let d = action.payload?["date"] {
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
    @State private var busy = false
    @State private var message: String?

    var body: some View {
        Group {
            if Auth.auth().currentUser != nil {
                RootView()
            } else {
                VStack(spacing: 16) {
                    Text("JewelHeart Admin").font(.title)
                    if let message { Text(message).font(.caption).foregroundStyle(.red) }
                    Button("Sign in anonymously") {
                        Task { await signInAnon() }
                    }
                    .disabled(busy)
                    if busy { ProgressView() }
                }
                .padding()
            }
        }
    }

    private func signInAnon() async {
        await MainActor.run { busy = true; message = nil }
        do {
            _ = try await Auth.auth().signInAnonymously()
        } catch {
            await MainActor.run { message = error.localizedDescription }
        }
        await MainActor.run { busy = false }
    }
}
