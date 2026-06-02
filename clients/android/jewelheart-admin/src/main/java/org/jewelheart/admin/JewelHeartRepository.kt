package org.jewelheart.admin

import android.content.Context
import com.google.firebase.auth.FirebaseAuth
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest

class JewelHeartRepository(
    private val gson: Gson = Gson(),
    context: Context? = JewelHeartAdminApplication.appContextOrNull,
) {
    private val cache = JewelHeartReadCache(context?.applicationContext, gson)

    private companion object {
        const val CACHE_TTL_STANDARD_MS = 60_000L
        const val CACHE_TTL_MESSAGES_MS = 30_000L

        const val CACHE_RETREATS = "retreats"
        const val CACHE_RETREAT_VOLUNTEERS = "retreatVolunteers"
        const val CACHE_SDUI_SCREENS = "sduiScreens"
        const val CACHE_CONVERSATIONS = "conversations"
        const val CACHE_MESSAGES = "messages"
    }

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

    private suspend fun cachedJsonRead(
        namespace: String,
        key: String,
        ttlMillis: Long,
        block: suspend () -> ByteArray,
    ): ByteArray {
        val scopedKey = authScopedCacheKey(key)
        cache.getFresh(namespace, scopedKey, ttlMillis)?.let { return it }
        return try {
            val data = block()
            cache.put(namespace, scopedKey, data)
            data
        } catch (e: Exception) {
            if (canServeStaleCache(e)) {
                cache.getStale(namespace, scopedKey)?.let { return it }
            }
            throw e
        }
    }

    private fun authScopedCacheKey(key: String): String {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: error("Not signed in")
        return "$uid|${JewelHeartConfig.baseUrl()}|$key"
    }

    private fun readCacheKey(path: String, query: Map<String, String?> = emptyMap()): String {
        val q = query
            .filterValues { !it.isNullOrEmpty() }
            .entries
            .sortedBy { "${it.key}=${it.value.orEmpty()}" }
            .joinToString("&") { (k, v) -> "$k=$v" }
        return if (q.isEmpty()) path else "$path?$q"
    }

    private fun sduiCacheKey(screenId: String, retreatId: String?, params: Map<String, String>): String {
        val p = params.entries
            .sortedBy { "${it.key}=${it.value}" }
            .joinToString("&") { (k, v) -> "$k=$v" }
        return "jewelheart/sdui/screen|screenId=$screenId|retreatId=${retreatId.orEmpty()}|params=$p"
    }

    private fun canServeStaleCache(e: Exception): Boolean =
        e is IOException || (e is HttpApiException && e.code in setOf(-1, 502, 503, 530))

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
        val bytes = cachedJsonRead(
            namespace = CACHE_SDUI_SCREENS,
            key = sduiCacheKey(screenId, retreatId, params),
            ttlMillis = CACHE_TTL_STANDARD_MS,
        ) {
            jsonRequest("POST", "jewelheart/sdui/screen", jsonBody = jo)
        }
        return gson.fromJson(bytes.toString(Charsets.UTF_8), SduiEnvelope::class.java)
    }

    suspend fun listRetreats(cursor: String? = null, limit: Int? = null): RetreatListResponse {
        val q = buildMap {
            cursor?.let { put("cursor", it) }
            limit?.let { put("limit", it.toString()) }
        }
        val bytes = cachedJsonRead(
            namespace = CACHE_RETREATS,
            key = readCacheKey("jewelheart/retreats", q),
            ttlMillis = CACHE_TTL_STANDARD_MS,
        ) {
            jsonRequest("GET", "jewelheart/retreats", query = q)
        }
        return gson.fromJson(bytes.toString(Charsets.UTF_8), RetreatListResponse::class.java)
    }

    suspend fun createRetreat(body: RetreatCreate): Retreat {
        val bytes = jsonRequest("POST", "jewelheart/retreats", jsonBody = body)
        val retreat = gson.fromJson(bytes.toString(Charsets.UTF_8), Retreat::class.java)
        cache.invalidate(CACHE_RETREATS)
        cache.invalidate(CACHE_SDUI_SCREENS)
        return retreat
    }

    suspend fun getRetreat(retreatId: String): Retreat {
        val bytes = jsonRequest("GET", "jewelheart/retreats/$retreatId")
        return gson.fromJson(bytes.toString(Charsets.UTF_8), Retreat::class.java)
    }

    suspend fun updateRetreat(retreatId: String, patch: RetreatPatch): Retreat {
        val bytes = jsonRequest("PATCH", "jewelheart/retreats/$retreatId", jsonBody = patch)
        val retreat = gson.fromJson(bytes.toString(Charsets.UTF_8), Retreat::class.java)
        cache.invalidate(CACHE_RETREATS)
        cache.invalidate(CACHE_SDUI_SCREENS)
        return retreat
    }

    suspend fun deleteRetreat(retreatId: String) {
        voidRequest("DELETE", "jewelheart/retreats/$retreatId")
        cache.invalidate(CACHE_RETREATS)
        cache.invalidate(CACHE_RETREAT_VOLUNTEERS)
        cache.invalidate(CACHE_SDUI_SCREENS)
        cache.invalidate(CACHE_CONVERSATIONS)
        cache.invalidate(CACHE_MESSAGES)
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
        val path = "jewelheart/retreats/$retreatId/volunteers"
        val bytes = cachedJsonRead(
            namespace = CACHE_RETREAT_VOLUNTEERS,
            key = readCacheKey(path),
            ttlMillis = CACHE_TTL_STANDARD_MS,
        ) {
            jsonRequest("GET", path)
        }
        return gson.fromJson(bytes.toString(Charsets.UTF_8), RetreatVolunteerListResponse::class.java)
    }

    suspend fun linkRetreatVolunteer(retreatId: String, volunteerId: String): RetreatVolunteer {
        val bytes = jsonRequest("POST", "jewelheart/retreats/$retreatId/volunteers", jsonBody = LinkRetreatVolunteerBody(volunteerId))
        val row = gson.fromJson(bytes.toString(Charsets.UTF_8), RetreatVolunteer::class.java)
        cache.invalidate(CACHE_RETREAT_VOLUNTEERS)
        cache.invalidate(CACHE_SDUI_SCREENS)
        return row
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
        val result = gson.fromJson(data.toString(Charsets.UTF_8), VolunteerImportResult::class.java)
        cache.invalidate(CACHE_RETREAT_VOLUNTEERS)
        cache.invalidate(CACHE_SDUI_SCREENS)
        return result
    }

    suspend fun unlinkRetreatVolunteer(retreatId: String, volunteerId: String) {
        voidRequest("DELETE", "jewelheart/retreats/$retreatId/volunteers/$volunteerId")
        cache.invalidate(CACHE_RETREAT_VOLUNTEERS)
        cache.invalidate(CACHE_SDUI_SCREENS)
    }

    suspend fun mintVolunteerCalendarFeed(volunteerId: String, regenerate: Boolean = false): VolunteerCalendarFeedResponse {
        val bytes = jsonRequest(
            "POST",
            "jewelheart/volunteers/$volunteerId/calendar-feed",
            jsonBody = VolunteerCalendarFeedMintRequest(regenerate = regenerate),
        )
        return gson.fromJson(bytes.toString(Charsets.UTF_8), VolunteerCalendarFeedResponse::class.java)
    }

    suspend fun revokeVolunteerCalendarFeed(volunteerId: String) {
        voidRequest("DELETE", "jewelheart/volunteers/$volunteerId/calendar-feed")
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
        val response = gson.fromJson(bytes.toString(Charsets.UTF_8), SduiActionResponse::class.java)
        cache.invalidate(CACHE_SDUI_SCREENS)
        return response
    }

    // --- Messaging (see openapi/jewelheart.yaml tag Messaging) ---

    suspend fun ensureRetreatRoomConversation(retreatId: String): ConversationSummary {
        val bytes = jsonRequest(
            "POST",
            "jewelheart/retreats/$retreatId/conversations",
            jsonBody = ConversationCreateRequest(kind = "retreat_room"),
        )
        val conversation = gson.fromJson(bytes.toString(Charsets.UTF_8), ConversationSummary::class.java)
        cache.invalidate(CACHE_CONVERSATIONS)
        return conversation
    }

    suspend fun createDirectConversation(retreatId: String, peerVolunteerId: String): ConversationSummary {
        val bytes = jsonRequest(
            "POST",
            "jewelheart/retreats/$retreatId/conversations",
            jsonBody = ConversationCreateRequest(kind = "direct", peerVolunteerId = peerVolunteerId),
        )
        val conversation = gson.fromJson(bytes.toString(Charsets.UTF_8), ConversationSummary::class.java)
        cache.invalidate(CACHE_CONVERSATIONS)
        return conversation
    }

    suspend fun listRetreatConversations(retreatId: String): ConversationListResponse {
        val path = "jewelheart/retreats/$retreatId/conversations"
        val bytes = cachedJsonRead(
            namespace = CACHE_CONVERSATIONS,
            key = readCacheKey(path),
            ttlMillis = CACHE_TTL_STANDARD_MS,
        ) {
            jsonRequest("GET", path)
        }
        return gson.fromJson(bytes.toString(Charsets.UTF_8), ConversationListResponse::class.java)
    }

    suspend fun listConversationMessages(
        conversationId: String,
        limit: Int? = null,
        cursor: String? = null,
        includeDeleted: Boolean = false,
    ): MessageListResponse {
        val q = buildMap<String, String> {
            limit?.let { put("limit", it.toString()) }
            cursor?.let { put("cursor", it) }
            if (includeDeleted) put("include_deleted", "true")
        }
        val path = "jewelheart/conversations/$conversationId/messages"
        val bytes = cachedJsonRead(
            namespace = CACHE_MESSAGES,
            key = readCacheKey(path, q),
            ttlMillis = CACHE_TTL_MESSAGES_MS,
        ) {
            jsonRequest("GET", path, query = q)
        }
        return gson.fromJson(bytes.toString(Charsets.UTF_8), MessageListResponse::class.java)
    }

    suspend fun sendConversationMessage(conversationId: String, body: String): JHMessage {
        val bytes = jsonRequest(
            "POST",
            "jewelheart/conversations/$conversationId/messages",
            jsonBody = ConversationMessageSendBody(body = body),
        )
        val message = gson.fromJson(bytes.toString(Charsets.UTF_8), JHMessage::class.java)
        cache.invalidate(CACHE_MESSAGES)
        cache.invalidate(CACHE_CONVERSATIONS)
        return message
    }

    suspend fun markConversationRead(conversationId: String): ConversationReadResponse {
        val bytes = jsonRequest("POST", "jewelheart/conversations/$conversationId/read")
        val response = gson.fromJson(bytes.toString(Charsets.UTF_8), ConversationReadResponse::class.java)
        cache.invalidate(CACHE_CONVERSATIONS)
        return response
    }

    suspend fun deleteJewelHeartMessage(messageId: String) {
        voidRequest("DELETE", "jewelheart/messages/$messageId")
        cache.invalidate(CACHE_MESSAGES)
        cache.invalidate(CACHE_CONVERSATIONS)
    }
}

private class JewelHeartReadCache(
    private val context: Context?,
    private val gson: Gson,
) {
    private data class Entry(
        val savedAtMillis: Long,
        val payload: String,
    )

    suspend fun getFresh(namespace: String, key: String, ttlMillis: Long): ByteArray? =
        withContext(Dispatchers.IO) {
            val entry = readEntry(namespace, key) ?: return@withContext null
            if (System.currentTimeMillis() - entry.savedAtMillis > ttlMillis) return@withContext null
            entry.payload.toByteArray(Charsets.UTF_8)
        }

    suspend fun getStale(namespace: String, key: String): ByteArray? =
        withContext(Dispatchers.IO) {
            readEntry(namespace, key)?.payload?.toByteArray(Charsets.UTF_8)
        }

    suspend fun put(namespace: String, key: String, data: ByteArray) {
        withContext(Dispatchers.IO) {
            val file = file(namespace, key) ?: return@withContext
            val entry = Entry(
                savedAtMillis = System.currentTimeMillis(),
                payload = data.toString(Charsets.UTF_8),
            )
            runCatching {
                file.parentFile?.mkdirs()
                file.writeText(gson.toJson(entry), Charsets.UTF_8)
            }
        }
    }

    suspend fun invalidate(namespace: String) {
        withContext(Dispatchers.IO) {
            val dir = directory() ?: return@withContext
            dir.listFiles { file -> file.name.startsWith("$namespace-") }
                ?.forEach { runCatching { it.delete() } }
        }
    }

    private fun readEntry(namespace: String, key: String): Entry? {
        val file = file(namespace, key) ?: return null
        if (!file.exists()) return null
        return runCatching {
            gson.fromJson(file.readText(Charsets.UTF_8), Entry::class.java)
        }.getOrNull()
    }

    private fun file(namespace: String, key: String): File? =
        directory()?.resolve("$namespace-${sha256(key)}.json")

    private fun directory(): File? =
        context?.cacheDir?.resolve("jewelheart-read-cache")

    private fun sha256(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }
}
