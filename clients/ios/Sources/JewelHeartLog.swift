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
}
