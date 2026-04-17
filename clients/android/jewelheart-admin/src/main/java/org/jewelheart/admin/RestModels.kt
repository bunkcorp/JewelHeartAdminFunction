package org.jewelheart.admin

import com.google.gson.annotations.SerializedName

enum class RetreatStatus {
    draft,
    published,
    archived,
}

enum class TimeBand {
    early,
    lunchtime,
    dinnertime,
    allday,
    anytime,
}

enum class DailyReportFormat {
    pdf,
    csv,
}

data class HealthResponse(
    @SerializedName("ok") val ok: Boolean,
    @SerializedName("service") val service: String,
)

data class Retreat(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("timezone") val timezone: String,
    @SerializedName("startDate") val startDate: String?,
    @SerializedName("endDate") val endDate: String?,
    @SerializedName("status") val status: RetreatStatus,
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("updatedAt") val updatedAt: String,
)

data class RetreatCreate(
    @SerializedName("name") val name: String,
    @SerializedName("timezone") val timezone: String,
    @SerializedName("startDate") val startDate: String? = null,
    @SerializedName("endDate") val endDate: String? = null,
    @SerializedName("status") val status: RetreatStatus? = null,
)

data class RetreatPatch(
    @SerializedName("name") val name: String? = null,
    @SerializedName("timezone") val timezone: String? = null,
    @SerializedName("startDate") val startDate: String? = null,
    @SerializedName("endDate") val endDate: String? = null,
    @SerializedName("status") val status: RetreatStatus? = null,
)

data class RetreatListResponse(
    @SerializedName("items") val items: List<Retreat>,
    @SerializedName("nextCursor") val nextCursor: String?,
)

data class Subjob(
    @SerializedName("id") val id: String? = null,
    @SerializedName("sortOrder") val sortOrder: Int,
    @SerializedName("text") val text: String,
)

data class Job(
    @SerializedName("id") val id: String,
    @SerializedName("retreatId") val retreatId: String,
    @SerializedName("title") val title: String,
    @SerializedName("volunteersNeeded") val volunteersNeeded: Int,
    @SerializedName("estimatedMinutes") val estimatedMinutes: Int,
    @SerializedName("subjobs") val subjobs: List<Subjob>,
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("updatedAt") val updatedAt: String,
)

data class JobCreate(
    @SerializedName("title") val title: String,
    @SerializedName("volunteersNeeded") val volunteersNeeded: Int,
    @SerializedName("estimatedMinutes") val estimatedMinutes: Int,
    @SerializedName("subjobs") val subjobs: List<String>? = null,
)

data class JobPatch(
    @SerializedName("title") val title: String? = null,
    @SerializedName("volunteersNeeded") val volunteersNeeded: Int? = null,
    @SerializedName("estimatedMinutes") val estimatedMinutes: Int? = null,
    @SerializedName("subjobs") val subjobs: List<String>? = null,
)

data class JobListResponse(@SerializedName("items") val items: List<Job>)

data class Slot(
    @SerializedName("id") val id: String,
    @SerializedName("retreatId") val retreatId: String,
    @SerializedName("label") val label: String,
    @SerializedName("slotDate") val slotDate: String,
    @SerializedName("dayOfWeek") val dayOfWeek: String?,
    @SerializedName("activityContext") val activityContext: String?,
    @SerializedName("timeBand") val timeBand: TimeBand,
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("updatedAt") val updatedAt: String,
)

data class SlotCreate(
    @SerializedName("label") val label: String,
    @SerializedName("slotDate") val slotDate: String,
    @SerializedName("dayOfWeek") val dayOfWeek: String? = null,
    @SerializedName("activityContext") val activityContext: String? = null,
    @SerializedName("timeBand") val timeBand: TimeBand,
)

data class SlotPatch(
    @SerializedName("label") val label: String? = null,
    @SerializedName("slotDate") val slotDate: String? = null,
    @SerializedName("dayOfWeek") val dayOfWeek: String? = null,
    @SerializedName("activityContext") val activityContext: String? = null,
    @SerializedName("timeBand") val timeBand: TimeBand? = null,
)

data class SlotListResponse(@SerializedName("items") val items: List<Slot>)

data class JHTask(
    @SerializedName("id") val id: String,
    @SerializedName("retreatId") val retreatId: String,
    @SerializedName("jobId") val jobId: String,
    @SerializedName("slotId") val slotId: String,
    @SerializedName("notes") val notes: String?,
    @SerializedName("assignmentCount") val assignmentCount: Int?,
    @SerializedName("volunteersNeeded") val volunteersNeeded: Int?,
    @SerializedName("isUnderassigned") val isUnderassigned: Boolean?,
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("updatedAt") val updatedAt: String,
)

data class JHTaskCreate(
    @SerializedName("jobId") val jobId: String,
    @SerializedName("slotId") val slotId: String,
    @SerializedName("notes") val notes: String? = null,
)

data class JHTaskPatch(
    @SerializedName("slotId") val slotId: String? = null,
    @SerializedName("notes") val notes: String? = null,
)

data class JHTaskListResponse(@SerializedName("items") val items: List<JHTask>)

data class JHTaskDetail(
    @SerializedName("id") val id: String,
    @SerializedName("retreatId") val retreatId: String,
    @SerializedName("jobId") val jobId: String,
    @SerializedName("slotId") val slotId: String,
    @SerializedName("notes") val notes: String?,
    @SerializedName("assignmentCount") val assignmentCount: Int?,
    @SerializedName("volunteersNeeded") val volunteersNeeded: Int?,
    @SerializedName("isUnderassigned") val isUnderassigned: Boolean?,
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("updatedAt") val updatedAt: String,
    @SerializedName("job") val job: Job? = null,
    @SerializedName("slot") val slot: Slot? = null,
    @SerializedName("assignments") val assignments: List<Assignment>? = null,
)

data class DuplicateTaskBody(@SerializedName("slotId") val slotId: String)

data class Volunteer(
    @SerializedName("id") val id: String,
    @SerializedName("displayName") val displayName: String,
    @SerializedName("email") val email: String?,
    @SerializedName("phone") val phone: String?,
    @SerializedName("otherDuties") val otherDuties: String?,
    @SerializedName("createdAt") val createdAt: String,
    @SerializedName("updatedAt") val updatedAt: String,
)

data class VolunteerCreate(
    @SerializedName("displayName") val displayName: String,
    @SerializedName("email") val email: String? = null,
    @SerializedName("phone") val phone: String? = null,
    @SerializedName("otherDuties") val otherDuties: String? = null,
)

data class VolunteerPatch(
    @SerializedName("displayName") val displayName: String? = null,
    @SerializedName("email") val email: String? = null,
    @SerializedName("phone") val phone: String? = null,
    @SerializedName("otherDuties") val otherDuties: String? = null,
)

data class VolunteerListResponse(@SerializedName("items") val items: List<Volunteer>)

data class RetreatVolunteer(
    @SerializedName("retreatId") val retreatId: String,
    @SerializedName("volunteerId") val volunteerId: String,
    @SerializedName("volunteer") val volunteer: Volunteer,
    @SerializedName("linkedAt") val linkedAt: String,
)

data class RetreatVolunteerListResponse(@SerializedName("items") val items: List<RetreatVolunteer>)

data class VolunteerImportRowError(
    @SerializedName("row") val row: Int?,
    @SerializedName("message") val message: String?,
)

data class VolunteerImportResult(
    @SerializedName("created") val created: Int,
    @SerializedName("updated") val updated: Int,
    @SerializedName("linked") val linked: Int,
    @SerializedName("errors") val errors: List<VolunteerImportRowError>,
)

data class LinkRetreatVolunteerBody(@SerializedName("volunteerId") val volunteerId: String)

data class Assignment(
    @SerializedName("id") val id: String,
    @SerializedName("taskId") val taskId: String,
    @SerializedName("volunteerId") val volunteerId: String,
    @SerializedName("volunteer") val volunteer: Volunteer?,
    @SerializedName("createdAt") val createdAt: String,
)

data class AssignmentCreate(@SerializedName("volunteerId") val volunteerId: String)

data class ScheduleDayItem(
    @SerializedName("task") val task: JHTask,
    @SerializedName("slot") val slot: Slot,
    @SerializedName("job") val job: Job,
    @SerializedName("assignments") val assignments: List<Assignment>?,
)

data class ScheduleDayResponse(
    @SerializedName("date") val date: String,
    @SerializedName("items") val items: List<ScheduleDayItem>,
)

data class SduiActionResponse(
    @SerializedName("ok") val ok: Boolean?,
    @SerializedName("message") val message: String?,
    @SerializedName("nextScreen") val nextScreen: SduiEnvelope?,
    @SerializedName("refreshScreenId") val refreshScreenId: String?,
)

data class DownloadResult(
    val data: ByteArray,
    val mimeType: String,
    val filename: String,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as DownloadResult
        return data.contentEquals(other.data) && mimeType == other.mimeType && filename == other.filename
    }

    override fun hashCode(): Int {
        var result = data.contentHashCode()
        result = 31 * result + mimeType.hashCode()
        result = 31 * result + filename.hashCode()
        return result
    }
}
