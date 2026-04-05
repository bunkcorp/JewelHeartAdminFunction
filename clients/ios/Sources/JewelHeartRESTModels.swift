import Foundation

// MARK: - Shared enums

enum RetreatStatus: String, Codable, CaseIterable, Identifiable, Hashable {
    case draft, published, archived
    var id: String { rawValue }
}

enum TimeBand: String, Codable, CaseIterable, Identifiable, Hashable {
    case early, lunchtime, dinnertime, allday, anytime
    var id: String { rawValue }
}

enum DailyReportFormat: String, Codable, CaseIterable, Hashable {
    case pdf, csv
}

// MARK: - Meta

struct HealthResponse: Codable, Hashable {
    let ok: Bool
    let service: String
}

// MARK: - Retreats

struct Retreat: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let timezone: String
    let startDate: String?
    let endDate: String?
    let status: RetreatStatus
    let createdAt: String
    let updatedAt: String
}

struct RetreatCreate: Codable {
    let name: String
    let timezone: String
    var startDate: String?
    var endDate: String?
    var status: RetreatStatus?
}

struct RetreatPatch: Codable {
    var name: String?
    var timezone: String?
    var startDate: String?
    var endDate: String?
    var status: RetreatStatus?
}

struct RetreatListResponse: Codable {
    let items: [Retreat]
    let nextCursor: String?
}

// MARK: - Jobs

struct Subjob: Codable, Hashable {
    var id: String?
    let sortOrder: Int
    let text: String
}

struct Job: Codable, Identifiable, Hashable {
    let id: String
    let retreatId: String
    let title: String
    let volunteersNeeded: Int
    let estimatedMinutes: Int
    let subjobs: [Subjob]
    let createdAt: String
    let updatedAt: String
}

struct JobCreate: Codable {
    let title: String
    let volunteersNeeded: Int
    let estimatedMinutes: Int
    var subjobs: [String]?
}

struct JobPatch: Codable {
    var title: String?
    var volunteersNeeded: Int?
    var estimatedMinutes: Int?
    var subjobs: [String]?
}

struct JobListResponse: Codable {
    let items: [Job]
}

// MARK: - Slots

struct Slot: Codable, Identifiable, Hashable {
    let id: String
    let retreatId: String
    let label: String
    let slotDate: String
    let dayOfWeek: String?
    let activityContext: String?
    let timeBand: TimeBand
    let createdAt: String
    let updatedAt: String
}

struct SlotCreate: Codable {
    let label: String
    let slotDate: String
    var dayOfWeek: String?
    var activityContext: String?
    let timeBand: TimeBand
}

struct SlotPatch: Codable {
    var label: String?
    var slotDate: String?
    var dayOfWeek: String?
    var activityContext: String?
    var timeBand: TimeBand?
}

struct SlotListResponse: Codable {
    let items: [Slot]
}

// MARK: - Tasks (JHTask avoids clashing with Swift.Concurrency.Task)

struct JHTask: Codable, Identifiable, Hashable {
    let id: String
    let retreatId: String
    let jobId: String
    let slotId: String
    let notes: String?
    let assignmentCount: Int?
    let volunteersNeeded: Int?
    let isUnderassigned: Bool?
    let createdAt: String
    let updatedAt: String
}

struct JHTaskCreate: Codable {
    let jobId: String
    let slotId: String
    var notes: String?
}

struct JHTaskPatch: Codable {
    var slotId: String?
    var notes: String?
}

struct JHTaskListResponse: Codable {
    let items: [JHTask]
}

struct JHTaskDetail: Codable {
    let id: String
    let retreatId: String
    let jobId: String
    let slotId: String
    let notes: String?
    let assignmentCount: Int?
    let volunteersNeeded: Int?
    let isUnderassigned: Bool?
    let createdAt: String
    let updatedAt: String
    var job: Job?
    var slot: Slot?
    var assignments: [Assignment]?
}

struct DuplicateTaskBody: Codable {
    let slotId: String
}

// MARK: - Volunteers

struct Volunteer: Codable, Identifiable, Hashable {
    let id: String
    let displayName: String
    let email: String?
    let phone: String?
    let otherDuties: String?
    let createdAt: String
    let updatedAt: String
}

struct VolunteerCreate: Codable {
    let displayName: String
    var email: String?
    var phone: String?
    var otherDuties: String?
}

struct VolunteerPatch: Codable {
    var displayName: String?
    var email: String?
    var phone: String?
    var otherDuties: String?
}

struct VolunteerListResponse: Codable {
    let items: [Volunteer]
}

struct RetreatVolunteer: Codable, Identifiable, Hashable {
    var id: String { "\(retreatId)-\(volunteerId)" }
    let retreatId: String
    let volunteerId: String
    let volunteer: Volunteer
    let linkedAt: String
}

struct RetreatVolunteerListResponse: Codable {
    let items: [RetreatVolunteer]
}

struct VolunteerImportRowError: Codable {
    let row: Int?
    let message: String?
}

struct VolunteerImportResult: Codable {
    let created: Int
    let updated: Int
    let linked: Int
    let errors: [VolunteerImportRowError]
}

struct LinkRetreatVolunteerBody: Codable {
    let volunteerId: String
}

// MARK: - Assignments

struct Assignment: Codable, Identifiable, Hashable {
    let id: String
    let taskId: String
    let volunteerId: String
    let volunteer: Volunteer?
    let createdAt: String
}

struct AssignmentCreate: Codable {
    let volunteerId: String
}

// MARK: - Schedule

struct ScheduleDayItem: Codable {
    let task: JHTask
    let slot: Slot
    let job: Job
    let assignments: [Assignment]?
}

struct ScheduleDayResponse: Codable {
    let date: String
    let items: [ScheduleDayItem]
}

// MARK: - SDUI action (OpenAPI)

struct SduiActionResponse: Codable {
    let ok: Bool?
    let message: String?
    let nextScreen: SDUIEnvelope?
    let refreshScreenId: String?
}

// MARK: - Binary downloads

struct JewelHeartDownload {
    let data: Data
    let mimeType: String
    let suggestedFilename: String
}
