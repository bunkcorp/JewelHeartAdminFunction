package org.jewelheart.admin

import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Monday-start week containing `date` (ISO local date in retreat calendar). */
fun volunteerWeekMondayContaining(date: LocalDate): LocalDate {
    val dow = date.dayOfWeek.value // Mon=1 … Sun=7
    val daysFromMonday = (dow + 6) % 7
    return date.minusDays(daysFromMonday.toLong())
}

fun volunteerWeekDayStringsFromMonday(monday: LocalDate): List<String> =
    (0..6).map { monday.plusDays(it.toLong()).toString() }

fun retreatZoneId(timezone: String): ZoneId =
    runCatching { ZoneId.of(timezone) }.getOrDefault(ZoneId.of(JewelHeartConfig.jewelheartDefaultTimeZoneId))

fun todayLocalDateInZone(zoneId: ZoneId): LocalDate =
    ZonedDateTime.now(zoneId).toLocalDate()

fun volunteerWeekDayLabel(iso: String, zoneId: ZoneId, locale: Locale = Locale.getDefault()): String {
    val d = runCatching { LocalDate.parse(iso) }.getOrNull() ?: return iso
    val z = d.atTime(12, 0).atZone(zoneId)
    return z.format(DateTimeFormatter.ofPattern("EEE M/d", locale))
}

fun volunteerLoadChartAxisLabel(iso: String, zoneId: ZoneId, locale: Locale = Locale.getDefault()): String {
    val d = runCatching { LocalDate.parse(iso) }.getOrNull() ?: return "?"
    val z = d.atTime(12, 0).atZone(zoneId)
    return z.format(DateTimeFormatter.ofPattern("EEE d", locale))
}

data class VolunteerDayLoadMetrics(
    val id: String,
    val dateISO: String,
    val displayLabel: String,
    val chartAxisLabel: String,
    val totalVolunteerMinutesDemand: Int,
    val volunteerSlotsDemand: Int,
    val assignedPersonMinutes: Int,
    val distinctVolunteersAssigned: Int?,
    val filledSlotCount: Int,
) {
    val avgMinutesPerSlotDemand: Double
        get() = if (volunteerSlotsDemand > 0) totalVolunteerMinutesDemand.toDouble() / volunteerSlotsDemand else 0.0

    val avgMinutesPerWorkerActual: Double?
        get() {
            if (assignedPersonMinutes <= 0) return null
            val d = distinctVolunteersAssigned
            if (d != null && d > 0) return assignedPersonMinutes.toDouble() / d
            if (filledSlotCount > 0) return assignedPersonMinutes.toDouble() / filledSlotCount
            return null
        }

    val usesSlotFallbackForAvg: Boolean
        get() = (distinctVolunteersAssigned ?: 0) == 0 && filledSlotCount > 0 && assignedPersonMinutes > 0
}

fun volunteerDayLoadMetrics(
    rows: List<ScheduleDayItem>,
    weekDates: List<String>,
    zoneId: ZoneId,
    locale: Locale = Locale.getDefault(),
): List<VolunteerDayLoadMetrics> {
    val inWeek = rows.filter { weekDates.contains(it.slot.slotDate) }
    val grouped = inWeek.groupBy { it.slot.slotDate }
    return weekDates.map { iso ->
        val seenTask = HashSet<String>()
        val items = (grouped[iso] ?: emptyList()).filter { seenTask.add(it.task.id) }

        var demandMinutes = 0
        var demandSlots = 0
        var assignedMinutes = 0
        val volunteerIds = HashSet<String>()
        var filledSlots = 0

        for (item in items) {
            val need = item.task.volunteersNeeded ?: item.job.volunteersNeeded
            val mins = item.job.estimatedMinutes
            demandMinutes += need * mins
            demandSlots += need

            val assigns = item.assignments.orEmpty()
            val ac = if (assigns.isEmpty()) item.task.assignmentCount ?: 0 else assigns.size
            filledSlots += ac
            assignedMinutes += ac * mins
            for (a in assigns) {
                volunteerIds.add(a.volunteerId)
            }
        }

        val distinct: Int? = if (volunteerIds.isEmpty()) null else volunteerIds.size
        VolunteerDayLoadMetrics(
            id = iso,
            dateISO = iso,
            displayLabel = volunteerWeekDayLabel(iso, zoneId, locale),
            chartAxisLabel = volunteerLoadChartAxisLabel(iso, zoneId, locale),
            totalVolunteerMinutesDemand = demandMinutes,
            volunteerSlotsDemand = demandSlots,
            assignedPersonMinutes = assignedMinutes,
            distinctVolunteersAssigned = distinct,
            filledSlotCount = filledSlots,
        )
    }
}

fun apiDateStringsOverlapRange(weekDays: List<String>, start: String?, end: String?): Boolean {
    if (start == null || end == null) return true
    val first = weekDays.firstOrNull() ?: return true
    val last = weekDays.lastOrNull() ?: return true
    return !(last < start || first > end)
}

fun volunteerSignupInitialWeekMonday(retreat: Retreat, zoneId: ZoneId): LocalDate {
    val today = todayLocalDateInZone(zoneId)
    val start = retreat.startDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    if (start != null) return volunteerWeekMondayContaining(start)
    val end = retreat.endDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    if (end != null) return volunteerWeekMondayContaining(end)
    return volunteerWeekMondayContaining(today)
}

private val timeBandSortOrder: List<TimeBand> = listOf(
    TimeBand.early,
    TimeBand.lunchtime,
    TimeBand.dinnertime,
    TimeBand.allday,
    TimeBand.anytime,
)

/** Site/context: `slot.activityContext`, then `task.slotActivityContext` when the nested slot omits it (parity with iOS). */
fun effectiveActivityContext(item: ScheduleDayItem): String {
    val slot = item.slot.activityContext?.trim().orEmpty()
    if (slot.isNotEmpty()) return slot
    return item.task.slotActivityContext?.trim().orEmpty()
}

fun filteredVolunteerRows(
    rows: List<ScheduleDayItem>,
    includedSlotLabels: Set<String>,
    includedWeekDates: Set<String>,
    includedSites: Set<String>,
    includedTimeBands: Set<TimeBand>,
    includedDurationMinutes: Set<Int>,
): List<ScheduleDayItem> {
    return rows
        .filter { item ->
            if (includedSlotLabels.isNotEmpty() && item.slot.label !in includedSlotLabels) return@filter false
            if (includedWeekDates.isNotEmpty() && item.slot.slotDate !in includedWeekDates) return@filter false
            val siteRaw = effectiveActivityContext(item)
            val siteTag = if (siteRaw.isEmpty()) "—" else siteRaw
            if (includedSites.isNotEmpty() && siteTag !in includedSites) return@filter false
            if (includedTimeBands.isNotEmpty() && item.slot.timeBand !in includedTimeBands) return@filter false
            if (includedDurationMinutes.isNotEmpty() && item.job.estimatedMinutes !in includedDurationMinutes) return@filter false
            true
        }
        .sortedWith(compareBy<ScheduleDayItem> { it.slot.slotDate }
            .thenBy { timeBandSortOrder.indexOf(it.slot.timeBand).let { i -> if (i < 0) 99 else i } }
            .thenBy { it.job.title.lowercase(Locale.getDefault()) })
}

fun durationMinutesFilterLabel(minutes: Int): String =
    if (minutes >= 60 && minutes % 60 == 0) {
        val h = minutes / 60
        "$minutes min ($h hr)"
    } else {
        "$minutes min"
    }
