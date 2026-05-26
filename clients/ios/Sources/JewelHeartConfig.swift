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

    /// Volunteer tab: walking-skeleton redesign from Retreat_Volunteer_Schedule v7.
    static let volunteerV2Redesign = true

    /// When true, "today" is retreat_v7.json testToday (Jul 21 2026 = retreat day 2).
    static let volunteerV2UseTestToday = true
}
