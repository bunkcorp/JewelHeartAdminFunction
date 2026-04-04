import Foundation
import os

/// Filter Xcode console with: subsystem:org.jewelheart.admin
enum JewelHeartLog {
    static let subsystem = "org.jewelheart.admin"
    static let api = Logger(subsystem: subsystem, category: "API")
    static let ui = Logger(subsystem: subsystem, category: "UI")
    static let auth = Logger(subsystem: subsystem, category: "Auth")

    static func describe(_ error: Error) -> String {
        if let jh = error as? JewelHeartAPIError {
            return jh.logLine
        }
        if let url = error as? URLError {
            var parts = [
                "URLError code=\(url.code.rawValue) (\(String(describing: url.code)))",
                url.localizedDescription,
            ]
            if let u = url.failureURLString { parts.append("failingURL=\(u)") }
            if let n = url.errorUserInfo[NSUnderlyingErrorKey] as? NSError {
                parts.append("underlying=\(n.domain)(\(n.code)) \(n.localizedDescription)")
            }
            return parts.joined(separator: " | ")
        }
        let ns = error as NSError
        return "\(type(of: error)): \(error.localizedDescription) | domain=\(ns.domain) code=\(ns.code)"
    }

    // MARK: - Mirror to stdout (Xcode debug console always shows print; os_log can be filtered out)

    static func apiInfo(_ message: String) {
        print("[JewelHeart][API] \(message)")
        api.info("\(message, privacy: .public)")
    }

    static func apiWarning(_ message: String) {
        print("[JewelHeart][API] \(message)")
        api.warning("\(message, privacy: .public)")
    }

    static func apiError(_ message: String) {
        print("[JewelHeart][API] \(message)")
        api.error("\(message, privacy: .public)")
    }

    static func uiInfo(_ message: String) {
        print("[JewelHeart][UI] \(message)")
        ui.info("\(message, privacy: .public)")
    }

    static func uiWarning(_ message: String) {
        print("[JewelHeart][UI] \(message)")
        ui.warning("\(message, privacy: .public)")
    }

    static func uiError(_ message: String) {
        print("[JewelHeart][UI] \(message)")
        ui.error("\(message, privacy: .public)")
    }

    static func authInfo(_ message: String) {
        print("[JewelHeart][Auth] \(message)")
        auth.info("\(message, privacy: .public)")
    }

    static func authError(_ message: String) {
        print("[JewelHeart][Auth] \(message)")
        auth.error("\(message, privacy: .public)")
    }
}
