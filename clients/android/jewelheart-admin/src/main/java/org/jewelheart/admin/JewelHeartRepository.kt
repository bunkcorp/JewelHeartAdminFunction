package org.jewelheart.admin

import com.google.firebase.auth.FirebaseAuth
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class JewelHeartRepository(private val gson: Gson = Gson()) {

    class HttpApiException(val code: Int, val body: String?) : Exception(userMessage(code, body)) {
        companion object {
            fun userMessage(code: Int, body: String?): String = when (code) {
                403 -> "JewelHeart admin access required (HTTP 403). Add your Firebase UID to Postgres: jewelheart_admins or jewelheart_retreat_admins."
                530 -> "HTTP 530 — Cloudflare tunnel may be down. Wake the host running cloudflared."
                502 -> "HTTP 502 — API origin unreachable."
                503 -> "HTTP 503 — service unavailable."
                else -> {
                    val b = body?.take(400)?.replace("\n", " ")?.trim()
                    if (b.isNullOrEmpty()) "HTTP $code" else "HTTP $code: $b"
                }
            }
        }
    }

    private suspend fun idToken(): String {
        val user = FirebaseAuth.getInstance().currentUser ?: error("Not signed in")
        return user.getIdToken(false).await().token ?: error("No ID token")
    }

    private fun buildUrl(path: String, query: Map<String, String?> = emptyMap()): URL {
        val base = JewelHeartConfig.baseUrl().trimEnd('/')
        val p = path.trimStart('/')
        val q = query.filterValues { it != null && it.isNotEmpty() }
            .entries.joinToString("&") { (k, v) ->
                "${URLEncoder.encode(k, Charsets.UTF_8.name())}=${URLEncoder.encode(v!!, Charsets.UTF_8.name())}"
            }
        val full = if (q.isEmpty()) "$base/$p" else "$base/$p?$q"
        return URL(full)
    }

    private suspend fun rawRequest(
        method: String,
        path: String,
        query: Map<String, String?> = emptyMap(),
        bearer: Boolean,
        body: ByteArray? = null,
        contentType: String? = null,
    ): Pair<Int, ByteArray> = withContext(Dispatchers.IO) {
        val conn = (buildUrl(path, query).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            if (bearer) {
                setRequestProperty("Authorization", "Bearer ${idToken()}")
            }
            if (body != null) {
                setRequestProperty("Content-Type", contentType ?: "application/json")
                doOutput = true
                outputStream.use { it.write(body) }
            }
        }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val bytes = stream?.readBytes() ?: ByteArray(0)
        conn.disconnect()
        code to bytes
    }

    private suspend fun jsonRequest(
        method: String,
        path: String,
        query: Map<String, String?> = emptyMap(),
        jsonBody: Any? = null,
    ): ByteArray {
        val body = jsonBody?.let { gson.toJson(it).toByteArray(Charsets.UTF_8) }
        val (code, data) = rawRequest(method, path, query, bearer = true, body = body, contentType = "application/json")
        if (code !in 200..299) {
            throw HttpApiException(code, data.toString(Charsets.UTF_8).takeIf { it.isNotBlank() })
        }
        return data
    }

    private suspend fun voidRequest(method: String, path: String, query: Map<String, String?> = emptyMap(), jsonBody: Any? = null) {
        val body = jsonBody?.let { gson.toJson(it).toByteArray(Charsets.UTF_8) }
        val (code, data) = rawRequest(method, path, query, bearer = true, body = body, contentType = "application/json")
        if (code !in 200..299) {
            throw HttpApiException(code, data.toString(Charsets.UTF_8).takeIf { it.isNotBlank() })
        }
    }

    suspend fun getHealth(): HealthResponse {
        val (code, data) = rawRequest("GET", "jewelheart/health", bearer = false)
        if (code != 200) throw HttpApiException(code, data.toString(Charsets.UTF_8))
        return gson.fromJson(data.toString(Charsets.UTF_8), HealthResponse::class.java)
    }

    suspend fun fetchScreen(screenId: String, retreatId: String?, params: Map<String, String>): SduiEnvelope {
        val jo = JsonObject().apply {
            addProperty("screenId", screenId)
            if (retreatId != null) addProperty("retreatId", retreatId)
            if (params.isNotEmpty()) {
                val p = JsonObject()
                params.forEach { (k, v) -> p.addProperty(k, v) }
                add("params", p)
            }
        }
        val bytes = jsonRequest("POST", "jewelheart/sdui/screen", jsonBody = jo)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), SduiEnvelope::class.java)
    }

    suspend fun listRetreats(cursor: String? = null, limit: Int? = null): RetreatListResponse {
        val q = buildMap {
            cursor?.let { put("cursor", it) }
            limit?.let { put("limit", it.toString()) }
        }
        val bytes = jsonRequest("GET", "jewelheart/retreats", query = q)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), RetreatListResponse::class.java)
    }

    suspend fun createRetreat(body: RetreatCreate): Retreat {
        val bytes = jsonRequest("POST", "jewelheart/retreats", jsonBody = body)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), Retreat::class.java)
    }

    suspend fun getRetreat(retreatId: String): Retreat {
        val bytes = jsonRequest("GET", "jewelheart/retreats/$retreatId")
        return gson.fromJson(bytes.toString(Charsets.UTF_8), Retreat::class.java)
    }

    suspend fun updateRetreat(retreatId: String, patch: RetreatPatch): Retreat {
        val bytes = jsonRequest("PATCH", "jewelheart/retreats/$retreatId", jsonBody = patch)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), Retreat::class.java)
    }

    suspend fun deleteRetreat(retreatId: String) {
        voidRequest("DELETE", "jewelheart/retreats/$retreatId")
    }

    suspend fun listJobs(retreatId: String): JobListResponse {
        val bytes = jsonRequest("GET", "jewelheart/retreats/$retreatId/jobs")
        return gson.fromJson(bytes.toString(Charsets.UTF_8), JobListResponse::class.java)
    }

    suspend fun createJob(retreatId: String, body: JobCreate): Job {
        val bytes = jsonRequest("POST", "jewelheart/retreats/$retreatId/jobs", jsonBody = body)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), Job::class.java)
    }

    suspend fun getJob(retreatId: String, jobId: String): Job {
        val bytes = jsonRequest("GET", "jewelheart/retreats/$retreatId/jobs/$jobId")
        return gson.fromJson(bytes.toString(Charsets.UTF_8), Job::class.java)
    }

    suspend fun updateJob(retreatId: String, jobId: String, patch: JobPatch): Job {
        val bytes = jsonRequest("PATCH", "jewelheart/retreats/$retreatId/jobs/$jobId", jsonBody = patch)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), Job::class.java)
    }

    suspend fun deleteJob(retreatId: String, jobId: String) {
        voidRequest("DELETE", "jewelheart/retreats/$retreatId/jobs/$jobId")
    }

    suspend fun listSlots(retreatId: String, date: String? = null): SlotListResponse {
        val q = if (date != null) mapOf("date" to date) else emptyMap()
        val bytes = jsonRequest("GET", "jewelheart/retreats/$retreatId/slots", query = q)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), SlotListResponse::class.java)
    }

    suspend fun createSlot(retreatId: String, body: SlotCreate): Slot {
        val bytes = jsonRequest("POST", "jewelheart/retreats/$retreatId/slots", jsonBody = body)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), Slot::class.java)
    }

    suspend fun getSlot(retreatId: String, slotId: String): Slot {
        val bytes = jsonRequest("GET", "jewelheart/retreats/$retreatId/slots/$slotId")
        return gson.fromJson(bytes.toString(Charsets.UTF_8), Slot::class.java)
    }

    suspend fun updateSlot(retreatId: String, slotId: String, patch: SlotPatch): Slot {
        val bytes = jsonRequest("PATCH", "jewelheart/retreats/$retreatId/slots/$slotId", jsonBody = patch)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), Slot::class.java)
    }

    suspend fun deleteSlot(retreatId: String, slotId: String) {
        voidRequest("DELETE", "jewelheart/retreats/$retreatId/slots/$slotId")
    }

    suspend fun listTasks(
        retreatId: String,
        slotId: String? = null,
        unassignedOnly: Boolean? = null,
        underassignedOnly: Boolean? = null,
    ): JHTaskListResponse {
        val q = buildMap<String, String> {
            slotId?.let { put("slotId", it) }
            unassignedOnly?.let { put("unassignedOnly", if (it) "true" else "false") }
            underassignedOnly?.let { put("underassignedOnly", if (it) "true" else "false") }
        }
        val bytes = jsonRequest("GET", "jewelheart/retreats/$retreatId/tasks", query = q)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), JHTaskListResponse::class.java)
    }

    suspend fun createTask(retreatId: String, body: JHTaskCreate): JHTask {
        val bytes = jsonRequest("POST", "jewelheart/retreats/$retreatId/tasks", jsonBody = body)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), JHTask::class.java)
    }

    suspend fun getTask(retreatId: String, taskId: String): JHTaskDetail {
        val bytes = jsonRequest("GET", "jewelheart/retreats/$retreatId/tasks/$taskId")
        return gson.fromJson(bytes.toString(Charsets.UTF_8), JHTaskDetail::class.java)
    }

    suspend fun updateTask(retreatId: String, taskId: String, patch: JHTaskPatch): JHTask {
        val bytes = jsonRequest("PATCH", "jewelheart/retreats/$retreatId/tasks/$taskId", jsonBody = patch)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), JHTask::class.java)
    }

    suspend fun deleteTask(retreatId: String, taskId: String) {
        voidRequest("DELETE", "jewelheart/retreats/$retreatId/tasks/$taskId")
    }

    suspend fun duplicateTask(retreatId: String, taskId: String, newSlotId: String): JHTask {
        val bytes = jsonRequest("POST", "jewelheart/retreats/$retreatId/tasks/$taskId/duplicate", jsonBody = DuplicateTaskBody(newSlotId))
        return gson.fromJson(bytes.toString(Charsets.UTF_8), JHTask::class.java)
    }

    suspend fun searchVolunteers(q: String? = null, limit: Int? = null): VolunteerListResponse {
        val query = buildMap<String, String> {
            if (!q.isNullOrBlank()) put("q", q)
            limit?.let { put("limit", it.toString()) }
        }
        val bytes = jsonRequest("GET", "jewelheart/volunteers", query = query)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), VolunteerListResponse::class.java)
    }

    suspend fun createVolunteer(body: VolunteerCreate): Volunteer {
        val bytes = jsonRequest("POST", "jewelheart/volunteers", jsonBody = body)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), Volunteer::class.java)
    }

    suspend fun getVolunteer(volunteerId: String): Volunteer {
        val bytes = jsonRequest("GET", "jewelheart/volunteers/$volunteerId")
        return gson.fromJson(bytes.toString(Charsets.UTF_8), Volunteer::class.java)
    }

    suspend fun updateVolunteer(volunteerId: String, patch: VolunteerPatch): Volunteer {
        val bytes = jsonRequest("PATCH", "jewelheart/volunteers/$volunteerId", jsonBody = patch)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), Volunteer::class.java)
    }

    suspend fun deleteVolunteer(volunteerId: String) {
        voidRequest("DELETE", "jewelheart/volunteers/$volunteerId")
    }

    suspend fun listRetreatVolunteers(retreatId: String): RetreatVolunteerListResponse {
        val bytes = jsonRequest("GET", "jewelheart/retreats/$retreatId/volunteers")
        return gson.fromJson(bytes.toString(Charsets.UTF_8), RetreatVolunteerListResponse::class.java)
    }

    suspend fun linkRetreatVolunteer(retreatId: String, volunteerId: String): RetreatVolunteer {
        val bytes = jsonRequest("POST", "jewelheart/retreats/$retreatId/volunteers", jsonBody = LinkRetreatVolunteerBody(volunteerId))
        return gson.fromJson(bytes.toString(Charsets.UTF_8), RetreatVolunteer::class.java)
    }

    suspend fun importRetreatVolunteersCsv(retreatId: String, csvBytes: ByteArray, filename: String = "import.csv"): VolunteerImportResult {
        val boundary = "Boundary-${System.currentTimeMillis()}"
        val crlf = "\r\n"
        val head = buildString {
            append("--$boundary$crlf")
            append("Content-Disposition: form-data; name=\"file\"; filename=\"$filename\"$crlf")
            append("Content-Type: text/csv$crlf$crlf")
        }
        val tail = "$crlf--$boundary--$crlf"
        val body = head.toByteArray(Charsets.UTF_8) + csvBytes + tail.toByteArray(Charsets.UTF_8)
        val (code, data) = rawRequest(
            method = "POST",
            path = "jewelheart/retreats/$retreatId/volunteers/import",
            bearer = true,
            body = body,
            contentType = "multipart/form-data; boundary=$boundary",
        )
        if (code != 200) throw HttpApiException(code, data.toString(Charsets.UTF_8).takeIf { it.isNotBlank() })
        return gson.fromJson(data.toString(Charsets.UTF_8), VolunteerImportResult::class.java)
    }

    suspend fun unlinkRetreatVolunteer(retreatId: String, volunteerId: String) {
        voidRequest("DELETE", "jewelheart/retreats/$retreatId/volunteers/$volunteerId")
    }

    suspend fun createAssignment(retreatId: String, taskId: String, volunteerId: String): Assignment {
        val bytes = jsonRequest(
            "POST",
            "jewelheart/retreats/$retreatId/tasks/$taskId/assignments",
            jsonBody = AssignmentCreate(volunteerId),
        )
        return gson.fromJson(bytes.toString(Charsets.UTF_8), Assignment::class.java)
    }

    suspend fun deleteAssignment(retreatId: String, assignmentId: String) {
        voidRequest("DELETE", "jewelheart/retreats/$retreatId/assignments/$assignmentId")
    }

    suspend fun getScheduleByDay(retreatId: String, date: String): ScheduleDayResponse {
        val bytes = jsonRequest("GET", "jewelheart/retreats/$retreatId/schedule", query = mapOf("date" to date))
        return gson.fromJson(bytes.toString(Charsets.UTF_8), ScheduleDayResponse::class.java)
    }

    suspend fun getPosterPdf(retreatId: String, date: String): DownloadResult {
        val (code, data) = rawRequest("GET", "jewelheart/retreats/$retreatId/reports/poster", query = mapOf("date" to date), bearer = true)
        if (code != 200) throw HttpApiException(code, data.toString(Charsets.UTF_8).takeIf { it.isNotBlank() })
        return DownloadResult(data, "application/pdf", "jewelheart-poster-$date.pdf")
    }

    suspend fun getDailyReport(retreatId: String, date: String, format: DailyReportFormat = DailyReportFormat.pdf): DownloadResult {
        val (code, data) = rawRequest(
            "GET",
            "jewelheart/retreats/$retreatId/reports/daily",
            query = mapOf("date" to date, "format" to format.name),
            bearer = true,
        )
        if (code != 200) throw HttpApiException(code, data.toString(Charsets.UTF_8).takeIf { it.isNotBlank() })
        val mime = if (format == DailyReportFormat.csv) "text/csv" else "application/pdf"
        val ext = if (format == DailyReportFormat.csv) "csv" else "pdf"
        return DownloadResult(data, mime, "jewelheart-daily-$date.$ext")
    }

    suspend fun postSduiAction(actionId: String, retreatId: String? = null, payload: Map<String, Any>? = null): SduiActionResponse {
        val jo = JsonObject().apply {
            addProperty("actionId", actionId)
            if (retreatId != null) addProperty("retreatId", retreatId)
            if (payload != null) {
                val p = JsonObject()
                payload.forEach { (k, v) ->
                    when (v) {
                        is String -> p.addProperty(k, v)
                        is Number -> p.addProperty(k, v)
                        is Boolean -> p.addProperty(k, v)
                        else -> p.addProperty(k, v.toString())
                    }
                }
                add("payload", p)
            }
        }
        val bytes = jsonRequest("POST", "jewelheart/sdui/action", jsonBody = jo)
        return gson.fromJson(bytes.toString(Charsets.UTF_8), SduiActionResponse::class.java)
    }
}
