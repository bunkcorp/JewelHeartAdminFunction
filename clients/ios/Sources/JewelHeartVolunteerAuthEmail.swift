import FirebaseAuth
import Foundation

enum JewelHeartVolunteerAuthEmail {
    static let pendingEmailKey = "jh_volunteer_email_for_link"
    static let magicLinkTtlMinutes = 60

    static func normalizeEmail(_ raw: String) -> String {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return s.contains("@") ? s : ""
    }

    static func describeEmailError(_ raw: String) -> String? {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return "Enter your email address." }
        if s.contains(where: { $0.isWhitespace }) {
            return "Error: remove spaces from the email address, fix & retry."
        }
        if !s.contains("@") { return "Error: email address must include @, fix & retry." }
        let parts = s.split(separator: "@", omittingEmptySubsequences: false).map(String.init)
        if parts.count != 2 || parts[0].isEmpty || parts[1].isEmpty {
            return "Error: email address format is invalid, fix & retry."
        }
        if !parts[1].contains(".") {
            return "Error: domain looks incomplete (missing .), fix & retry."
        }
        let pattern = #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#
        if s.range(of: pattern, options: .regularExpression) != nil { return nil }
        return "Error: email address format is invalid, fix & retry."
    }

    static func emailSentMessage() -> String {
        let expires = Date().addingTimeInterval(TimeInterval(magicLinkTtlMinutes * 60))
        let formatted = expires.formatted(date: .abbreviated, time: .shortened)
        return "Email sent, click link in it, expires \(formatted)"
    }

    static func savePendingEmail(_ email: String) {
        UserDefaults.standard.set(email, forKey: pendingEmailKey)
    }

    static func loadPendingEmail() -> String? {
        guard let raw = UserDefaults.standard.string(forKey: pendingEmailKey) else { return nil }
        let normalized = normalizeEmail(raw)
        return normalized.isEmpty ? nil : normalized
    }

    static func clearPendingEmail() {
        UserDefaults.standard.removeObject(forKey: pendingEmailKey)
    }

    static func formatAuthError(_ error: Error) -> String {
        let ns = error as NSError
        if ns.domain == AuthErrorDomain, let code = AuthErrorCode(rawValue: ns.code) {
            switch code {
            case .operationNotAllowed:
                return "Error: email link sign-in is not enabled in Firebase yet. Ask the organizers."
            case .invalidEmail:
                return "Error: email address format is invalid, fix & retry."
            case .tooManyRequests:
                return "Error: too many sign-in attempts. Wait a few minutes, fix & retry."
            case .invalidActionCode:
                return "Error: sign-in link expired or already used. Request a new link, fix & retry."
            default:
                break
            }
        }
        return "Error: \(error.localizedDescription), fix & retry"
    }
}

enum JewelHeartVolunteerPhone {
    static func normalizeE164(_ raw: String) -> String? {
        let digits = raw.filter(\.isNumber)
        if digits.isEmpty { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("+") { return "+\(digits)" }
        if digits.count == 10 { return "+1\(digits)" }
        if digits.count == 11, digits.hasPrefix("1") { return "+\(digits)" }
        return "+\(digits)"
    }
}
