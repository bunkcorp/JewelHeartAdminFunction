import Foundation

extension Bundle {
    /// `CLIENT_ID` from `GoogleService-Info.plist` (iOS OAuth client). Used for Google Sign-In.
    var jewelheartGoogleServiceClientID: String? {
        guard let url = url(forResource: "GoogleService-Info", withExtension: "plist"),
              let dict = NSDictionary(contentsOf: url) as? [String: Any],
              let id = dict["CLIENT_ID"] as? String,
              !id.isEmpty,
              !id.contains("YOUR_") else { return nil }
        return id
    }

    /// `REVERSED_CLIENT_ID` from the same plist (must match URL scheme in Info).
    var jewelheartGoogleServiceReversedClientID: String? {
        guard let url = url(forResource: "GoogleService-Info", withExtension: "plist"),
              let dict = NSDictionary(contentsOf: url) as? [String: Any],
              let id = dict["REVERSED_CLIENT_ID"] as? String,
              !id.isEmpty,
              !id.contains("YOUR_") else { return nil }
        return id
    }
}
