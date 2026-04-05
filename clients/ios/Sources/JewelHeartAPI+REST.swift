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
        let (data, _) = try await authorizedDataRequest(path: "jewelheart/retreats", method: "GET", queryItems: q)
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
        return try jsonDecoder().decode(Retreat.self, from: data)
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
        return try jsonDecoder().decode(Retreat.self, from: data)
    }

    func deleteRetreat(retreatId: String) async throws {
        let (_, _) = try await authorizedDataRequest(path: "jewelheart/retreats/\(retreatId)", method: "DELETE")
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
        let (data, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/volunteers",
            method: "GET"
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
        return try jsonDecoder().decode(RetreatVolunteer.self, from: data)
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
        return try jsonDecoder().decode(VolunteerImportResult.self, from: data)
    }

    func unlinkRetreatVolunteer(retreatId: String, volunteerId: String) async throws {
        let (_, _) = try await authorizedDataRequest(
            path: "jewelheart/retreats/\(retreatId)/volunteers/\(volunteerId)",
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
        return try jsonDecoder().decode(SduiActionResponse.self, from: data)
    }
}
