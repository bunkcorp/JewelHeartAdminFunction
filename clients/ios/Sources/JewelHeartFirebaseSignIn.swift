import AuthenticationServices
import CryptoKit
import FirebaseAuth
import Foundation
import GoogleSignIn
import Security
import UIKit

enum JewelHeartFirebaseSignInError: LocalizedError {
    case noPresentingViewController
    case missingGoogleServicePlist
    case missingGoogleIDToken
    case missingAppleIDToken

    var errorDescription: String? {
        switch self {
        case .noPresentingViewController:
            return "Could not find a view controller to present sign-in."
        case .missingGoogleServicePlist:
            return "Add GoogleService-Info.plist with a real CLIENT_ID (Firebase Console → iOS app)."
        case .missingGoogleIDToken:
            return "Google Sign-In did not return an ID token."
        case .missingAppleIDToken:
            return "Sign in with Apple did not return an identity token."
        }
    }
}

enum JewelHeartFirebaseSignIn {
    @MainActor
    static func signInWithGoogle() async throws {
        guard let clientID = Bundle.main.jewelheartGoogleServiceClientID else {
            throw JewelHeartFirebaseSignInError.missingGoogleServicePlist
        }
        guard let presenting = JewelHeartRootPresenter.topViewController() else {
            throw JewelHeartFirebaseSignInError.noPresentingViewController
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenting)
        guard let idToken = result.user.idToken?.tokenString else {
            throw JewelHeartFirebaseSignInError.missingGoogleIDToken
        }
        let accessToken = result.user.accessToken.tokenString
        let credential = GoogleAuthProvider.credential(withIDToken: idToken, accessToken: accessToken)
        _ = try await Auth.auth().signIn(with: credential)
    }

    @MainActor
    static func signInWithApple(idToken: String, rawNonce: String) async throws {
        let credential = OAuthProvider.credential(providerID: AuthProviderID.apple, idToken: idToken, rawNonce: rawNonce)
        _ = try await Auth.auth().signIn(with: credential)
    }

    @MainActor
    static func signInWithEmail(email: String, password: String) async throws {
        _ = try await Auth.auth().signIn(withEmail: email, password: password)
    }

    @MainActor
    static func createUserWithEmail(email: String, password: String) async throws {
        _ = try await Auth.auth().createUser(withEmail: email, password: password)
    }

    @MainActor
    static func sendSignInLink(toEmail email: String) async throws {
        let settings = ActionCodeSettings()
        settings.url = URL(string: "https://gettingstoned-4aee3.firebaseapp.com/finishSignIn")
        settings.handleCodeInApp = true
        if let bundleId = Bundle.main.bundleIdentifier {
            settings.setIOSBundleID(bundleId)
        }
        try await Auth.auth().sendSignInLink(toEmail: email, actionCodeSettings: settings)
        JewelHeartVolunteerAuthEmail.savePendingEmail(email)
    }

    @MainActor
    static func completeSignInWithEmailLink(_ link: String, fallbackEmail: String) async throws {
        let auth = Auth.auth()
        guard auth.isSignIn(withEmailLink: link) else { return }
        let email = JewelHeartVolunteerAuthEmail.loadPendingEmail()
            ?? JewelHeartVolunteerAuthEmail.normalizeEmail(fallbackEmail)
        guard !email.isEmpty else {
            throw NSError(
                domain: "JewelHeartAuth",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Error: enter the same email address you used for the link, fix & retry."]
            )
        }
        _ = try await auth.signIn(withEmail: email, link: link)
        JewelHeartVolunteerAuthEmail.clearPendingEmail()
    }

    // MARK: - Apple nonce (Firebase requirement)

    static func randomNonceString(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length
        while remaining > 0 {
            var random: UInt8 = 0
            let status = SecRandomCopyBytes(kSecRandomDefault, 1, &random)
            guard status == errSecSuccess else {
                fatalError("SecRandomCopyBytes failed: \(status)")
            }
            if random < charset.count {
                result.append(charset[Int(random)])
                remaining -= 1
            }
        }
        return result
    }

    static func sha256Hex(_ input: String) -> String {
        let data = Data(input.utf8)
        let hashed = SHA256.hash(data: data)
        return hashed.map { String(format: "%02x", $0) }.joined()
    }
}
