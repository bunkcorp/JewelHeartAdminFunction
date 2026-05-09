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
    let jobTitle: String?
    let slotLabel: String?
    let slotActivityContext: String?
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
    let jobTitle: String?
    let slotLabel: String?
    let slotActivityContext: String?
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
    /// Mirrors `notify_email`; absent legacy payloads behave as `true`.
    let notifyEmail: Bool?
    /// Mirrors `notify_sms`; absent legacy payloads behave as `false`.
    let notifySms: Bool?
    let createdAt: String
    let updatedAt: String
}

struct VolunteerCreate: Codable {
    let displayName: String
    var email: String? = nil
    var phone: String? = nil
    var otherDuties: String? = nil
    var notifyEmail: Bool? = nil
    var notifySms: Bool? = nil
}

struct VolunteerPatch: Codable {
    var displayName: String?
    var email: String?
    var phone: String?
    var otherDuties: String?
    var notifyEmail: Bool?
    var notifySms: Bool?
}

struct VolunteerCalendarFeedMintRequest: Codable {
    var regenerate: Bool?
}

struct VolunteerCalendarFeedResponse: Codable {
    let subscribeHttpsUrl: String
    let webcalSubscribeUrl: String?
    let lastRotatedAt: String?
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

// MARK: - Messaging (in-app MVP)

enum ConversationKind: String, Codable, CaseIterable, Hashable {
    case direct
    case retreat_room
}

struct ConversationSummary: Codable, Identifiable, Hashable {
    let id: String
    let retreatId: String
    let kind: ConversationKind
    let updatedAt: String
    let lastReadAt: String?
    let peerVolunteerId: String?
    let peerDisplayName: String?
}

struct ConversationListResponse: Codable {
    let items: [ConversationSummary]
}

struct ChatMessage: Codable, Identifiable, Hashable {
    let id: String
    let conversationId: String
    let senderVolunteerId: String
    let senderDisplayName: String?
    let body: String
    let createdAt: String
    /// Present when a global admin lists messages with `include_deleted=true`.
    let deletedAt: String?
}

struct MessageListResponse: Codable {
    let items: [ChatMessage]
    let nextCursor: String?
}

struct ConversationCreateRequest: Codable {
    let kind: ConversationKind
    var peerVolunteerId: String?
}

struct MessageSendRequest: Codable {
    let body: String
}

struct ConversationReadResponse: Codable {
    let ok: Bool
    let lastReadAt: String
}

// MARK: - Binary downloads

struct JewelHeartDownload {
    let data: Data
    let mimeType: String
    let suggestedFilename: String
}
