import SwiftUI

struct JewelHeartSignInView: View {
    @State private var email = JewelHeartVolunteerAuthEmail.loadPendingEmail() ?? ""
    @State private var statusMessage = ""
    @State private var emailSentMessage = ""
    @State private var isError = false
    @State private var busy = false

    var body: some View {
        VolunteerAuthScaffold {
            VolunteerBlueBar(text: "Choose sign-in method:")
                .padding(.top, 6)

            VolunteerMaroonButton(title: "By Google", enabled: !busy) {
                Task { await signInWithGoogle() }
            }

            VolunteerGrayTextField(placeholder: "Enter email address", text: $email)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .onChange(of: email) { _, newValue in
                    emailSentMessage = ""
                    if let err = JewelHeartVolunteerAuthEmail.describeEmailError(newValue), !newValue.isEmpty {
                        statusMessage = err
                        isError = true
                    } else {
                        statusMessage = ""
                        isError = false
                    }
                }

            VolunteerMaroonButton(
                title: "By email",
                enabled: !busy && JewelHeartVolunteerAuthEmail.describeEmailError(email) == nil
            ) {
                Task { await sendMagicLink() }
            }

            if !emailSentMessage.isEmpty {
                Text(emailSentMessage)
                    .font(.system(size: 15, weight: .bold))
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)
            }

            if !statusMessage.isEmpty {
                VolunteerAuthMessage(text: statusMessage, isError: isError)
            }

            if busy {
                ProgressView()
                    .padding(.top, 12)
            }
        }
        .task {
            await completeMagicLinkIfPresent()
        }
        .onReceive(NotificationCenter.default.publisher(for: .jewelheartEmailLinkReceived)) { _ in
            Task { await completeMagicLinkIfPresent() }
        }
    }

    @MainActor
    private func signInWithGoogle() async {
        busy = true
        statusMessage = ""
        isError = false
        do {
            try await JewelHeartFirebaseSignIn.signInWithGoogle()
            JewelHeartLog.authInfo("sign-in ok provider=google")
        } catch {
            statusMessage = error.localizedDescription
            isError = true
            JewelHeartLog.authError("google sign-in FAILED: \(JewelHeartLog.describe(error))")
        }
        busy = false
    }

    @MainActor
    private func sendMagicLink() async {
        busy = true
        statusMessage = ""
        emailSentMessage = ""
        isError = false
        let normalized = JewelHeartVolunteerAuthEmail.normalizeEmail(email)
        if let err = JewelHeartVolunteerAuthEmail.describeEmailError(normalized) {
            statusMessage = err
            isError = true
            busy = false
            return
        }
        do {
            try await JewelHeartFirebaseSignIn.sendSignInLink(toEmail: normalized)
            email = normalized
            emailSentMessage = JewelHeartVolunteerAuthEmail.emailSentMessage()
        } catch {
            statusMessage = JewelHeartVolunteerAuthEmail.formatAuthError(error)
            isError = true
        }
        busy = false
    }

    @MainActor
    private func completeMagicLinkIfPresent() async {
        guard let link = JewelHeartEmailLinkHolder.consume() else { return }
        busy = true
        statusMessage = "Completing sign-in from email link…"
        isError = false
        do {
            try await JewelHeartFirebaseSignIn.completeSignInWithEmailLink(link, fallbackEmail: email)
            emailSentMessage = ""
            statusMessage = ""
            JewelHeartLog.authInfo("sign-in ok provider=email-link")
        } catch {
            statusMessage = JewelHeartVolunteerAuthEmail.formatAuthError(error)
            isError = true
        }
        busy = false
    }
}

extension Notification.Name {
    static let jewelheartEmailLinkReceived = Notification.Name("jewelheartEmailLinkReceived")
}

enum JewelHeartEmailLinkHolder {
    private static var pending: String?

    static func ingest(_ url: URL?) {
        guard let url else { return }
        let s = url.absoluteString
        if s.localizedCaseInsensitiveContains("firebaseapp.com") ||
            s.localizedCaseInsensitiveContains("oobcode=") ||
            s.localizedCaseInsensitiveContains("mode=signin") {
            pending = s
            NotificationCenter.default.post(name: .jewelheartEmailLinkReceived, object: nil)
        }
    }

    static func consume() -> String? {
        defer { pending = nil }
        return pending
    }
}
