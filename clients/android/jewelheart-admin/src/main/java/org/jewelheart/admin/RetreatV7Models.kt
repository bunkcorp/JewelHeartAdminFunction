package org.jewelheart.admin

import com.google.gson.annotations.SerializedName

data class RetreatV7Data(
    @SerializedName("retreatName") val retreatName: String,
    @SerializedName("startDate") val startDate: String,
    @SerializedName("endDate") val endDate: String,
    @SerializedName("scheduledDays") val scheduledDays: Int,
    @SerializedName("testToday") val testToday: String,
    @SerializedName("shifts") val shifts: List<RetreatV7Shift>,
    @SerializedName("jobs") val jobs: List<RetreatV7Job>,
)

data class RetreatV7Shift(
    @SerializedName("id") val id: String,
    @SerializedName("dayNumber") val dayNumber: Int,
    @SerializedName("weekday") val weekday: String,
    @SerializedName("slot") val slot: String,
    @SerializedName("site") val site: String,
    @SerializedName("activity") val activity: String,
    @SerializedName("jobTitle") val jobTitle: String,
    @SerializedName("jobId") val jobId: String,
    @SerializedName("volunteersNeeded") val volunteersNeeded: Int,
    @SerializedName("estimatedMinutes") val estimatedMinutes: Int,
)

data class RetreatV7Job(
    @SerializedName("id") val id: String,
    @SerializedName("site") val site: String,
    @SerializedName("activity") val activity: String,
    @SerializedName("title") val title: String,
    @SerializedName("instructions") val instructions: List<String> = emptyList(),
)
