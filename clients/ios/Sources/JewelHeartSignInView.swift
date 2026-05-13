import AuthenticationServices
import FirebaseAuth
import SwiftUI

/// KarmaDots-style options: Google, Apple, email, anonymous (Firebase same project as private-server).
struct JewelHeartSignInView: View {
    @State private var busy = false
    /// Google OAuth presents its own UI; avoid toggling `busy` (and `ProgressView`) during that flow — iOS can auto-cancel if another presentation is active.
    @State private var googleSigningIn = false
    @State private var message = ""
    @State private var showEmailSignIn = false
    @State private var showEmailSignUp = false
    @State private var appleNonce: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Text("JewelHeart Admin").font(.title)
                Text("Sign in with the same methods as KarmaDots. Use the Firebase project wired to api.karmadots.org.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                if !message.isEmpty {
                    Text(message).font(.caption).foregroundStyle(.red).multilineTextAlignment(.center)
                }

                googleButton
                appleButton

                Divider().padding(.vertical, 4)

                Button {
                    showEmailSignIn = true
                } label: {
                    Label("Sign in with email", systemImage: "envelope.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(googleSigningIn)

                Button {
                    showEmailSignUp = true
                } label: {
                    Label("Create account (email)", systemImage: "person.badge.plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(googleSigningIn)

                Button {
                    Task { await signInAnon() }
                } label: {
                    Label("Continue anonymously", systemImage: "person.fill.questionmark")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy || googleSigningIn)

                Text("Google: enable Google sign-in in Firebase Console and set the URL scheme to REVERSED_CLIENT_ID from GoogleService-Info (see clients/ios project settings).")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)

                if busy { ProgressView() }
            }
            .padding()
        }
        .sheet(isPresented: $showEmailSignIn) {
            JewelHeartEmailSignInSheet()
        }
        .sheet(isPresented: $showEmailSignUp) {
            JewelHeartEmailSignUpSheet()
        }
    }

    private var googleButton: some View {
        Button {
            Task { await signInWithGoogleAvoidingPresentationConflict() }
        } label: {
            Label("Sign in with Google", systemImage: "globe")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(.red)
        .disabled(busy || googleSigningIn)
    }

    private var appleButton: some View {
        SignInWithAppleButton(.signIn) { request in
            let nonce = JewelHeartFirebaseSignIn.randomNonceString()
            appleNonce = nonce
            request.requestedScopes = [.fullName, .email]
            request.nonce = JewelHeartFirebaseSignIn.sha256Hex(nonce)
        } onCompletion: { result in
            switch result {
            case .failure(let err):
                message = err.localizedDescription
            case .success(let authorization):
                guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                      let tokenData = credential.identityToken,
                      let idToken = String(data: tokenData, encoding: .utf8),
                      let rawNonce = appleNonce else {
                    message = JewelHeartFirebaseSignInError.missingAppleIDToken.localizedDescription
                    return
                }
                Task { @MainActor in
                    await run {
                        try await JewelHeartFirebaseSignIn.signInWithApple(idToken: idToken, rawNonce: rawNonce)
                    }
                }
            }
        }
        .signInWithAppleButtonStyle(.black)
        .frame(height: 48)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .disabled(busy || googleSigningIn)
    }

    @MainActor
    private func run(_ op: @escaping () async throws -> Void) async {
        busy = true
        message = ""
        do {
            try await op()
            JewelHeartLog.authInfo("sign-in ok provider=multi")
        } catch {
            message = error.localizedDescription
            JewelHeartLog.authError("sign-in FAILED: \(JewelHeartLog.describe(error))")
        }
        busy = false
    }

    /// Do not set `busy` before `GIDSignIn` presents — avoids SwiftUI `ProgressView` / layout fighting the OAuth sheet (false "cancelled" flows).
    @MainActor
    private func signInWithGoogleAvoidingPresentationConflict() async {
        guard !googleSigningIn, !busy else { return }
        message = ""
        googleSigningIn = true
        defer { googleSigningIn = false }
        do {
            try await JewelHeartFirebaseSignIn.signInWithGoogle()
            JewelHeartLog.authInfo("sign-in ok provider=google")
        } catch {
            message = error.localizedDescription
            JewelHeartLog.authError("sign-in FAILED: \(JewelHeartLog.describe(error))")
        }
    }

    private func signInAnon() async {
        await run {
            _ = try await Auth.auth().signInAnonymously()
        }
    }
}

// MARK: - Email sheets

private struct JewelHeartEmailSignInSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var errorMessage = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("Email", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                SecureField("Password", text: $password)
                    .textContentType(.password)
                if !errorMessage.isEmpty {
                    Text(errorMessage).foregroundStyle(.red).font(.caption)
                }
                Button("Sign in") {
                    Task { await submit() }
                }
                .disabled(busy || email.isEmpty || password.isEmpty)
            }
            .navigationTitle("Email sign in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    @MainActor
    private func submit() async {
        busy = true
        errorMessage = ""
        do {
            try await JewelHeartFirebaseSignIn.signInWithEmail(email: email, password: password)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        busy = false
    }
}

private struct JewelHeartEmailSignUpSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var busy = false
    @State private var errorMessage = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("Email", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                SecureField("Password", text: $password)
                    .textContentType(.newPassword)
                SecureField("Confirm password", text: $confirm)
                    .textContentType(.newPassword)
                if !errorMessage.isEmpty {
                    Text(errorMessage).foregroundStyle(.red).font(.caption)
                }
                Button("Create account") {
                    Task { await submit() }
                }
                .disabled(busy || email.isEmpty || password.isEmpty || password != confirm)
            }
            .navigationTitle("Create account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    @MainActor
    private func submit() async {
        guard password == confirm else {
            errorMessage = "Passwords don’t match."
            return
        }
        busy = true
        errorMessage = ""
        do {
            try await JewelHeartFirebaseSignIn.createUserWithEmail(email: email, password: password)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        busy = false
    }
}
