import SwiftUI
import UIKit
import FirebaseAuth

/// Signed-in shell: SDUI tab plus REST admin tabs covering OpenAPI v0.1.0.
struct AdminRootTabView: View {
    var body: some View {
        TabView {
            RootView()
                .tabItem { Label("Home", systemImage: "rectangle.3.group") }

            NavigationStack {
                RetreatAdminListView()
            }
            .tabItem { Label("Retreats", systemImage: "mountain.2.fill") }

            NavigationStack {
                GlobalVolunteersAdminView()
            }
            .tabItem { Label("Directory", systemImage: "person.3.fill") }

            NavigationStack {
                if JewelHeartConfig.volunteerV2Redesign {
                    VolunteerV2RootView()
                } else {
                    VolunteerSelfServiceRootView()
                }
            }
            .tabItem { Label("Volunteer", systemImage: "calendar.badge.plus") }

            NavigationStack {
                MetaAdminView()
            }
            .tabItem { Label("Settings", systemImage: "wrench.and.screwdriver") }
        }
    }
}

// MARK: - Share / export

struct ActivityShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Meta (health + SDUI action)

struct MetaAdminView: View {
    private let api = JewelHeartAPI()
    @State private var health: HealthResponse?
    @State private var healthError: String?
    @State private var busy = false

    @State private var actionId = "refresh"
    @State private var actionRetreatId = ""
    @State private var actionPayloadKey = ""
    @State private var actionPayloadValue = ""
    @State private var actionResult: String?
    @State private var actionError: String?
    @State private var signOutError: String?

    var body: some View {
        List {
            Section("Signed-in (ACL)") {
                LabeledContent("Status") {
                    Text(jewelheartAuthStatus(Auth.auth().currentUser))
                }
                LabeledContent("Firebase UID") {
                    Text(Auth.auth().currentUser?.uid ?? "—")
                        .font(.caption.monospaced())
                        .textSelection(.enabled)
                }
                Text("Add this value to Postgres jewelheart_admins (or jewelheart_retreat_admins) for directory access. Each anonymous sign-in uses a new UID.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let signOutError {
                    Text(signOutError).font(.caption).foregroundStyle(.red)
                }
                Button("Sign out", role: .destructive) {
                    signOutError = nil
                    do {
                        try Auth.auth().signOut()
                    } catch {
                        signOutError = error.localizedDescription
                    }
                }
            }

            Section("Health (no auth)") {
                if let h = health {
                    LabeledContent("ok") { Text(h.ok ? "yes" : "no") }
                    LabeledContent("service") { Text(h.service) }
                }
                if let healthError {
                    Text(healthError).foregroundStyle(.red)
                }
                Button("Ping GET /jewelheart/health") {
                    Task { await pingHealth() }
                }
                .disabled(busy)
            }

            Section("SDUI action (POST /jewelheart/sdui/action)") {
                TextField("actionId", text: $actionId)
                TextField("retreatId (optional)", text: $actionRetreatId)
                TextField("payload key (optional)", text: $actionPayloadKey)
                TextField("payload value (optional)", text: $actionPayloadValue)
                Button("Send action") {
                    Task { await sendAction() }
                }
                .disabled(busy)
                if let actionResult {
                    Text(actionResult).font(.caption.monospaced())
                }
                if let actionError {
                    Text(actionError).foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Settings")
    }

    private func pingHealth() async {
        await MainActor.run { busy = true; healthError = nil; health = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            let h = try await api.getHealth()
            await MainActor.run { health = h }
        } catch {
            await MainActor.run { healthError = error.localizedDescription }
        }
    }

    private func sendAction() async {
        await MainActor.run { busy = true; actionError = nil; actionResult = nil }
        defer { Task { @MainActor in busy = false } }
        do {
            var payload: [String: Any]?
            if !actionPayloadKey.isEmpty {
                payload = [actionPayloadKey: actionPayloadValue]
            }
            let rid = actionRetreatId.trimmingCharacters(in: .whitespacesAndNewlines)
            let res = try await api.postSduiAction(
                actionId: actionId.trimmingCharacters(in: .whitespacesAndNewlines),
                retreatId: rid.isEmpty ? nil : rid,
                payload: payload
            )
            var lines: [String] = []
            if let ok = res.ok { lines.append("ok: \(ok)") }
            if let m = res.message { lines.append("message: \(m)") }
            if let r = res.refreshScreenId { lines.append("refreshScreenId: \(r)") }
            if res.nextScreen != nil { lines.append("nextScreen: <envelope present>") }
            let text = lines.isEmpty ? "(empty response body fields)" : lines.joined(separator: "\n")
            await MainActor.run { actionResult = text }
        } catch {
            await MainActor.run { actionError = error.localizedDescription }
        }
    }
}

private func jewelheartAuthStatus(_ user: User?) -> String {
    guard let user else { return "Signed out" }
    if user.isAnonymous { return "Signed in · Anonymous" }
    let ids = user.providerData.map(\.providerID)
    if ids.contains("apple.com") { return "Signed in · Apple" }
    if ids.contains("google.com") { return "Signed in · Google" }
    if ids.contains("password") { return "Signed in · Email" }
    if let first = ids.first { return "Signed in · \(first)" }
    return "Signed in"
}
