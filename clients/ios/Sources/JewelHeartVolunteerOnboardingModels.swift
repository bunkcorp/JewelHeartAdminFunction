import Foundation

struct VolunteerBootstrapResponse: Codable, Sendable {
    var ok: Bool = false
    var volunteerId: String?
    var profileConfirmed: Bool = false
    var firstName: String = ""
    var lastName: String = ""
    var email: String = ""
    var phone: String = ""
    var authEmail: String = ""
    var authPhone: String = ""
    var phoneOtpRequired: Bool = true
}

struct VolunteerOtpMessageResponse: Codable, Sendable {
    var ok: Bool?
    var message: String?
}
