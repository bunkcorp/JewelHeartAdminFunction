import Foundation

enum JewelHeartConfig {
    /// Same Cloudflare host as KarmaDots private-server.
    static let apiHost = "api.karmadots.org"
    static let useTLS = true

    static var baseURL: URL {
        let scheme = useTLS ? "https" : "http"
        return URL(string: "\(scheme)://\(apiHost)")!
    }
}
