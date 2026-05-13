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
        // Clear stale Google session so repeat sign-in does not immediately return "cancelled"
        // (same idea as signOut() before signIn on @react-native-google-signin).
        GIDSignIn.sharedInstance.signOut()
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
