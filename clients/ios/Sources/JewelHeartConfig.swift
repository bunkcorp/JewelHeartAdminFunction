import Foundation

enum JewelHeartConfig {
    /// Single product IANA zone for retreat dates, volunteer weeks, and SDUI (DST-aware Eastern).
    static let jewelheartDefaultTimeZoneId = "America/New_York"

    /// Same Cloudflare host as KarmaDots private-server.
    static let apiHost = "api.karmadots.org"
    static let useTLS = true

    static var baseURL: URL {
        let scheme = useTLS ? "https" : "http"
        return URL(string: "\(scheme)://\(apiHost)")!
    }
}
