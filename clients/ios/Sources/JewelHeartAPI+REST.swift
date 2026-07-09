import Foundation

extension JewelHeartAPI {
    // MARK: - Meta

    func getHealth() async throws -> HealthResponse {
        let (data, _) = try await publicDataRequest(path: "jewelheart/health", method: "GET")
        return try jsonDecoder().decode(HealthResponse.self, from: data)
    }

    // MARK: - Retreats

    func listRetreats(cursor: String? = nil, limit: Int? = nil) async throws -> RetreatListResponse {
        var q: [URLQueryItem] = []
        if let cursor { q.append(URLQueryItem(name: "cursor", value: cursor)) }
        if let limit { q.append(URLQueryItem(name: "limit", value: String(limit))) }
        let data = try await authorizedCachedDataRequest(
            path: "jewelheart/retreats",
            method: "GET",
            queryItems: q,
            cacheNamespace: JewelHeartReadCacheNamespace.retreats,
            cacheKey: Self.cacheKey(path: "jewelheart/retreats", queryItems: q),
            ttl: JewelHeartReadCacheTTL.standard
        )
        return try jsonDecoder().decode(RetreatListResponse.self, from: data)
    }

    func createRetreat(_ body: RetreatCreate) async throws -> Retreat {
        let enc = try jsonEncoder().encode(body)
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
        let retreat = try jsonDecoder().decode(Retreat.self, from: data)
        await invalidateReadCaches([JewelHeartReadCacheNamespace.retreats, JewelHeartReadCacheNamespace.sduiScreens])
        return retreat
    }

    func getRetreat(retreatId: String) async throws -> Retreat {
        let (data, _) = try await authorizedDataRequest(path: "jewelheart/retreats/\(retreatId)", method: "GET")
        return try jsonDecoder().decode(Retreat.self, from: data)
    }

    func updateRetreat(retreatId: String, patch: RetreatPatch) async throws -> Retreat {
        let enc = try jsonEncoder().encode(patch)
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)",
            method: "PATCH",
            httpBody: enc,
            contentType: "application/json"
        )
        let retreat = try jsonDecoder().decode(Retreat.self, from: data)
        await invalidateReadCaches([JewelHeartReadCacheNamespace.retreats, JewelHeartReadCacheNamespace.sduiScreens])
        return retreat
    }

    func deleteRetreat(retreatId: String) async throws {
        let (_, _) = try await authorizedDataRequest(path: "jewelheart/retreats/\(retreatId)", method: "DELETE")
        await invalidateReadCaches([
            JewelHeartReadCacheNamespace.retreats,
            JewelHeartReadCacheNamespace.retreatVolunteers,
            JewelHeartReadCacheNamespace.sduiScreens,
            JewelHeartReadCacheNamespace.conversations,
            JewelHeartReadCacheNamespace.messages,
        ])
    }

    // MARK: - Jobs

    func listJobs(retreatId: String) async throws -> JobListResponse {
        let (data, _) = try await authorizedDataRequest(path: "jewelheart/retreats/\(retreatId)/jobs", method: "GET")
        return try jsonDecoder().decode(JobListResponse.self, from: data)
    }

    func createJob(retreatId: String, body: JobCreate) async throws -> Job {
        let enc = try jsonEncoder().encode(body)
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/jobs",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
        return try jsonDecoder().decode(Job.self, from: data)
    }

    func getJob(retreatId: String, jobId: String) async throws -> Job {
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/jobs/\(jobId)",
            method: "GET"
        )
        return try jsonDecoder().decode(Job.self, from: data)
    }

    func updateJob(retreatId: String, jobId: String, patch: JobPatch) async throws -> Job {
        let enc = try jsonEncoder().encode(patch)
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/jobs/\(jobId)",
            method: "PATCH",
            httpBody: enc,
            contentType: "application/json"
        )
        return try jsonDecoder().decode(Job.self, from: data)
    }

    func deleteJob(retreatId: String, jobId: String) async throws {
        let (_, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/jobs/\(jobId)",
            method: "DELETE"
        )
    }

    // MARK: - Slots

    func listSlots(retreatId: String, date: String? = nil) async throws -> SlotListResponse {
        var q: [URLQueryItem] = []
        if let date { q.append(URLQueryItem(name: "date", value: date)) }
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/slots",
            method: "GET",
            queryItems: q
        )
        return try jsonDecoder().decode(SlotListResponse.self, from: data)
    }

    func createSlot(retreatId: String, body: SlotCreate) async throws -> Slot {
        let enc = try jsonEncoder().encode(body)
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/slots",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
        return try jsonDecoder().decode(Slot.self, from: data)
    }

    func getSlot(retreatId: String, slotId: String) async throws -> Slot {
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/slots/\(slotId)",
            method: "GET"
        )
        return try jsonDecoder().decode(Slot.self, from: data)
    }

    func updateSlot(retreatId: String, slotId: String, patch: SlotPatch) async throws -> Slot {
        let enc = try jsonEncoder().encode(patch)
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/slots/\(slotId)",
            method: "PATCH",
            httpBody: enc,
            contentType: "application/json"
        )
        return try jsonDecoder().decode(Slot.self, from: data)
    }

    func deleteSlot(retreatId: String, slotId: String) async throws {
        let (_, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/slots/\(slotId)",
            method: "DELETE"
        )
    }

    // MARK: - Tasks

    func listTasks(
        retreatId: String,
        slotId: String? = nil,
        unassignedOnly: Bool? = nil,
        underassignedOnly: Bool? = nil
    ) async throws -> JHTaskListResponse {
        var q: [URLQueryItem] = []
        if let slotId { q.append(URLQueryItem(name: "slotId", value: slotId)) }
        if let unassignedOnly { q.append(URLQueryItem(name: "unassignedOnly", value: unassignedOnly ? "true" : "false")) }
        if let underassignedOnly { q.append(URLQueryItem(name: "underassignedOnly", value: underassignedOnly ? "true" : "false")) }
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/tasks",
            method: "GET",
            queryItems: q
        )
        return try jsonDecoder().decode(JHTaskListResponse.self, from: data)
    }

    func createTask(retreatId: String, body: JHTaskCreate) async throws -> JHTask {
        let enc = try jsonEncoder().encode(body)
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/tasks",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
        return try jsonDecoder().decode(JHTask.self, from: data)
    }

    func getTask(retreatId: String, taskId: String) async throws -> JHTaskDetail {
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/tasks/\(taskId)",
            method: "GET"
        )
        return try jsonDecoder().decode(JHTaskDetail.self, from: data)
    }

    func updateTask(retreatId: String, taskId: String, patch: JHTaskPatch) async throws -> JHTask {
        let enc = try jsonEncoder().encode(patch)
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/tasks/\(taskId)",
            method: "PATCH",
            httpBody: enc,
            contentType: "application/json"
        )
        return try jsonDecoder().decode(JHTask.self, from: data)
    }

    func deleteTask(retreatId: String, taskId: String) async throws {
        let (_, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/tasks/\(taskId)",
            method: "DELETE"
        )
    }

    func duplicateTask(retreatId: String, taskId: String, newSlotId: String) async throws -> JHTask {
        let enc = try jsonEncoder().encode(DuplicateTaskBody(slotId: newSlotId))
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/tasks/\(taskId)/duplicate",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
        return try jsonDecoder().decode(JHTask.self, from: data)
    }

    // MARK: - Volunteers (global)

    func searchVolunteers(q query: String? = nil, limit: Int? = nil) async throws -> VolunteerListResponse {
        var qItems: [URLQueryItem] = []
        if let query, !query.isEmpty { qItems.append(URLQueryItem(name: "q", value: query)) }
        if let limit { qItems.append(URLQueryItem(name: "limit", value: String(limit))) }
        let (data, _) = try await authorizedDataRequest(path: "jewelheart/volunteers", method: "GET", queryItems: qItems)
        return try jsonDecoder().decode(VolunteerListResponse.self, from: data)
    }

    func createVolunteer(_ body: VolunteerCreate) async throws -> Volunteer {
        let enc = try jsonEncoder().encode(body)
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/volunteers",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
        return try jsonDecoder().decode(Volunteer.self, from: data)
    }

    func getVolunteer(volunteerId: String) async throws -> Volunteer {
        let (data, _) = try await authorizedDataRequest(path: "jewelheart/volunteers/\(volunteerId)", method: "GET")
        return try jsonDecoder().decode(Volunteer.self, from: data)
    }

    func updateVolunteer(volunteerId: String, patch: VolunteerPatch) async throws -> Volunteer {
        let enc = try jsonEncoder().encode(patch)
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/volunteers/\(volunteerId)",
            method: "PATCH",
            httpBody: enc,
            contentType: "application/json"
        )
        return try jsonDecoder().decode(Volunteer.self, from: data)
    }

    func deleteVolunteer(volunteerId: String) async throws {
        let (_, _) = try await authorizedDataRequest(path: "jewelheart/volunteers/\(volunteerId)", method: "DELETE")
    }

    // MARK: - Retreat volunteers

    func listRetreatVolunteers(retreatId: String) async throws -> RetreatVolunteerListResponse {
        let data = try await authorizedCachedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/volunteers",
            method: "GET",
            cacheNamespace: JewelHeartReadCacheNamespace.retreatVolunteers,
            cacheKey: Self.cacheKey(path: "jewelheart/retreats/\(retreatId)/volunteers"),
            ttl: JewelHeartReadCacheTTL.standard
        )
        return try jsonDecoder().decode(RetreatVolunteerListResponse.self, from: data)
    }

    func linkRetreatVolunteer(retreatId: String, volunteerId: String) async throws -> RetreatVolunteer {
        let enc = try jsonEncoder().encode(LinkRetreatVolunteerBody(volunteerId: volunteerId))
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/volunteers",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
        let row = try jsonDecoder().decode(RetreatVolunteer.self, from: data)
        await invalidateReadCaches([JewelHeartReadCacheNamespace.retreatVolunteers, JewelHeartReadCacheNamespace.sduiScreens])
        return row
    }

    func importRetreatVolunteersCsv(retreatId: String, csvData: Data, filename: String = "import.csv") async throws -> VolunteerImportResult {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        func append(_ s: String) {
            body.append(s.data(using: .utf8)!)
        }
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n")
        append("Content-Type: text/csv\r\n\r\n")
        body.append(csvData)
        append("\r\n--\(boundary)--\r\n")
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/volunteers/import",
            method: "POST",
            httpBody: body,
            contentType: "multipart/form-data; boundary=\(boundary)"
        )
        let result = try jsonDecoder().decode(VolunteerImportResult.self, from: data)
        await invalidateReadCaches([JewelHeartReadCacheNamespace.retreatVolunteers, JewelHeartReadCacheNamespace.sduiScreens])
        return result
    }

    func unlinkRetreatVolunteer(retreatId: String, volunteerId: String) async throws {
        let (_, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/volunteers/\(volunteerId)",
            method: "DELETE"
        )
        await invalidateReadCaches([JewelHeartReadCacheNamespace.retreatVolunteers, JewelHeartReadCacheNamespace.sduiScreens])
    }

    // MARK: - Calendar feed

    func mintVolunteerCalendarFeed(volunteerId: String, regenerate: Bool = false) async throws -> VolunteerCalendarFeedResponse {
        let enc = try jsonEncoder().encode(VolunteerCalendarFeedMintRequest(regenerate: regenerate))
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/volunteers/\(volunteerId)/calendar-feed",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
        return try jsonDecoder().decode(VolunteerCalendarFeedResponse.self, from: data)
    }

    func revokeVolunteerCalendarFeed(volunteerId: String) async throws {
        let (_, _) = try await authorizedDataRequest(
            path: "jewelheart/volunteers/\(volunteerId)/calendar-feed",
            method: "DELETE"
        )
    }

    // MARK: - Assignments

    func createAssignment(retreatId: String, taskId: String, body: AssignmentCreate) async throws -> Assignment {
        let enc = try jsonEncoder().encode(body)
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/tasks/\(taskId)/assignments",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
        return try jsonDecoder().decode(Assignment.self, from: data)
    }

    func deleteAssignment(retreatId: String, assignmentId: String) async throws {
        let (_, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/assignments/\(assignmentId)",
            method: "DELETE"
        )
    }

    // MARK: - Schedule

    func getScheduleByDay(retreatId: String, date: String) async throws -> ScheduleDayResponse {
        let q = [URLQueryItem(name: "date", value: date)]
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/schedule",
            method: "GET",
            queryItems: q
        )
        return try jsonDecoder().decode(ScheduleDayResponse.self, from: data)
    }

    // MARK: - Reports

    func getPosterPdf(retreatId: String, date: String) async throws -> JewelHeartDownload {
        let q = [URLQueryItem(name: "date", value: date)]
        let (data, http) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/reports/poster",
            method: "GET",
            queryItems: q
        )
        let mime = http.value(forHTTPHeaderField: "Content-Type") ?? "application/pdf"
        return JewelHeartDownload(data: data, mimeType: mime, suggestedFilename: "poster-\(date).pdf")
    }

    func getDailyReport(retreatId: String, date: String, format: DailyReportFormat = .pdf) async throws -> JewelHeartDownload {
        let q = [
            URLQueryItem(name: "date", value: date),
            URLQueryItem(name: "format", value: format.rawValue),
        ]
        let (data, http) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/reports/daily",
            method: "GET",
            queryItems: q
        )
        let mime = http.value(forHTTPHeaderField: "Content-Type")
            ?? (format == .csv ? "text/csv" : "application/pdf")
        let ext = format == .csv ? "csv" : "pdf"
        return JewelHeartDownload(data: data, mimeType: mime, suggestedFilename: "daily-\(date).\(ext)")
    }

    // MARK: - SDUI action

    func postSduiAction(actionId: String, retreatId: String? = nil, payload: [String: Any]? = nil) async throws -> SduiActionResponse {
        var body: [String: Any] = ["actionId": actionId]
        if let retreatId { body["retreatId"] = retreatId }
        if let payload { body["payload"] = payload }
        let enc = try JSONSerialization.data(withJSONObject: body)
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/sdui/action",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
        let response = try jsonDecoder().decode(SduiActionResponse.self, from: data)
        await invalidateReadCache(namespace: JewelHeartReadCacheNamespace.sduiScreens)
        return response
    }

    // MARK: - Messaging

    func ensureRetreatRoomConversation(retreatId: String) async throws -> ConversationSummary {
        let enc = try jsonEncoder().encode(ConversationCreateRequest(kind: .retreat_room, peerVolunteerId: nil))
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/conversations",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
        let conversation = try jsonDecoder().decode(ConversationSummary.self, from: data)
        await invalidateReadCache(namespace: JewelHeartReadCacheNamespace.conversations)
        return conversation
    }

    func createDirectConversation(retreatId: String, peerVolunteerId: String) async throws -> ConversationSummary {
        let enc = try jsonEncoder().encode(ConversationCreateRequest(kind: .direct, peerVolunteerId: peerVolunteerId))
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/conversations",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
        let conversation = try jsonDecoder().decode(ConversationSummary.self, from: data)
        await invalidateReadCache(namespace: JewelHeartReadCacheNamespace.conversations)
        return conversation
    }

    func listRetreatConversations(retreatId: String) async throws -> ConversationListResponse {
        let data = try await authorizedCachedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/conversations",
            method: "GET",
            cacheNamespace: JewelHeartReadCacheNamespace.conversations,
            cacheKey: Self.cacheKey(path: "jewelheart/retreats/\(retreatId)/conversations"),
            ttl: JewelHeartReadCacheTTL.standard
        )
        return try jsonDecoder().decode(ConversationListResponse.self, from: data)
    }

    func listConversationMessages(
        conversationId: String,
        limit: Int? = nil,
        cursor: String? = nil,
        includeDeleted: Bool = false
    ) async throws -> MessageListResponse {
        var q: [URLQueryItem] = []
        if let limit { q.append(URLQueryItem(name: "limit", value: String(limit))) }
        if let cursor, !cursor.isEmpty { q.append(URLQueryItem(name: "cursor", value: cursor)) }
        if includeDeleted { q.append(URLQueryItem(name: "include_deleted", value: "true")) }
        let data = try await authorizedCachedDataRequest(
            path: "jewelheart/conversations/\(conversationId)/messages",
            method: "GET",
            queryItems: q,
            cacheNamespace: JewelHeartReadCacheNamespace.messages,
            cacheKey: Self.cacheKey(path: "jewelheart/conversations/\(conversationId)/messages", queryItems: q),
            ttl: JewelHeartReadCacheTTL.messages
        )
        return try jsonDecoder().decode(MessageListResponse.self, from: data)
    }

    func sendConversationMessage(conversationId: String, body: String) async throws -> ChatMessage {
        let enc = try jsonEncoder().encode(MessageSendRequest(body: body))
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/conversations/\(conversationId)/messages",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
        let message = try jsonDecoder().decode(ChatMessage.self, from: data)
        await invalidateReadCaches([JewelHeartReadCacheNamespace.messages, JewelHeartReadCacheNamespace.conversations])
        return message
    }

    func markConversationRead(conversationId: String) async throws -> ConversationReadResponse {
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/conversations/\(conversationId)/read",
            method: "POST"
        )
        let response = try jsonDecoder().decode(ConversationReadResponse.self, from: data)
        await invalidateReadCache(namespace: JewelHeartReadCacheNamespace.conversations)
        return response
    }

    func deleteJewelHeartMessage(messageId: String) async throws {
        let (_, _) = try await authorizedDataRequest(path: "jewelheart/messages/\(messageId)", method: "DELETE")
        await invalidateReadCaches([JewelHeartReadCacheNamespace.messages, JewelHeartReadCacheNamespace.conversations])
    }

    // MARK: - Volunteer bootstrap + onboarding

    func volunteerBootstrap() async throws -> VolunteerBootstrapResponse {
        let body = try jsonEncoder().encode([String: String]())
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/volunteer/bootstrap",
            method: "POST",
            httpBody: body,
            contentType: "application/json"
        )
        return try jsonDecoder().decode(VolunteerBootstrapResponse.self, from: data)
    }

    func sendOnboardingPhoneOtp(phone: String) async throws -> String {
        struct Body: Encodable {
            let channel = "phone"
            let phone: String
        }
        let enc = try jsonEncoder().encode(Body(phone: phone))
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/volunteer/onboarding/send-otp",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
        let decoded = try jsonDecoder().decode(VolunteerOtpMessageResponse.self, from: data)
        return decoded.message ?? "Code sent."
    }

    func verifyOnboardingPhoneOtp(phone: String, code: String) async throws {
        struct Body: Encodable {
            let channel = "phone"
            let phone: String
            let code: String
        }
        let enc = try jsonEncoder().encode(Body(phone: phone, code: code))
        let (_, _) = try await authorizedDataRequest(
            path: "jewelheart/volunteer/onboarding/verify-otp",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
    }

    func completeOnboarding(firstName: String, lastName: String, email: String, phone: String) async throws {
        struct Body: Encodable {
            let firstName: String
            let lastName: String
            let email: String
            let phone: String
        }
        let enc = try jsonEncoder().encode(Body(firstName: firstName, lastName: lastName, email: email, phone: phone))
        let (_, _) = try await authorizedDataRequest(
            path: "jewelheart/volunteer/onboarding/complete",
            method: "POST",
            httpBody: enc,
            contentType: "application/json"
        )
    }
}
