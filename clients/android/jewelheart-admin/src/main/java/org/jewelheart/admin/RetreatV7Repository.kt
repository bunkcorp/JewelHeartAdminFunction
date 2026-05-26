package org.jewelheart.admin

import android.content.Context
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

class RetreatV7Repository(context: Context) {
    val data: RetreatV7Data = loadData(context)

    private fun loadData(context: Context): RetreatV7Data {
        val raw =
            context.assets.open("retreat_v7.json").bufferedReader().use { it.readText() }
                .removePrefix("\uFEFF")
        return RetreatV7Json.gson.fromJson(raw, RetreatV7Data::class.java)
            ?: error("retreat_v7.json did not parse")
    }

    private val jobsById = data.jobs.associateBy { it.id }
    private val shiftsById = data.shifts.associateBy { it.id }

    private val _myShiftIds = MutableStateFlow<Set<String>>(emptySet())
    val myShiftIds: StateFlow<Set<String>> = _myShiftIds.asStateFlow()

    private val dateFmt = DateTimeFormatter.ISO_LOCAL_DATE

    fun today(): LocalDate =
        if (JewelHeartConfig.volunteerV2UseTestToday) {
            LocalDate.parse(data.testToday, dateFmt)
        } else {
            LocalDate.now()
        }

    fun retreatStart(): LocalDate = LocalDate.parse(data.startDate, dateFmt)

    fun currentDayNumber(): Int? {
        val days = ChronoUnit.DAYS.between(retreatStart(), today()).toInt() + 1
        return days.takeIf { it in 1..data.scheduledDays }
    }

    fun dayLabel(dayNumber: Int, weekday: String): String = "$dayNumber ($weekday)"

    fun searchableDays(): List<Int> {
        val from = currentDayNumber() ?: 1
        return (from..data.scheduledDays).toList()
    }

    fun jobForShift(shift: RetreatV7Shift): RetreatV7Job? = jobsById[shift.jobId]

    fun shiftById(id: String): RetreatV7Shift? = shiftsById[id]

    fun isAssignedToMe(shiftId: String): Boolean = shiftId in _myShiftIds.value

    fun isAvailable(shift: RetreatV7Shift): Boolean = !isAssignedToMe(shift.id)

    fun searchShifts(dayNumbers: Set<Int>, jobId: String?): List<RetreatV7Shift> {
        val fromDay = currentDayNumber() ?: 1
        return data.shifts
            .filter { it.dayNumber in dayNumbers && it.dayNumber >= fromDay }
            .filter { jobId.isNullOrBlank() || it.jobId == jobId }
            .filter { isAvailable(it) }
            .sortedWith(compareBy({ it.dayNumber }, { slotOrder(it.slot) }, { it.jobTitle }))
    }

    fun myShiftsFromToday(): List<RetreatV7Shift> {
        val fromDay = currentDayNumber() ?: 1
        return data.shifts
            .filter { it.id in _myShiftIds.value && it.dayNumber >= fromDay }
            .sortedWith(compareBy({ it.dayNumber }, { slotOrder(it.slot) }, { it.jobTitle }))
    }

    fun todaysMyShifts(): List<RetreatV7Shift> {
        val day = currentDayNumber() ?: return emptyList()
        return data.shifts.filter { it.id in _myShiftIds.value && it.dayNumber == day }
    }

    fun nextAssignment(): RetreatV7Shift? {
        val fromDay = currentDayNumber() ?: return null
        return data.shifts
            .filter { it.id in _myShiftIds.value && it.dayNumber >= fromDay }
            .sortedWith(compareBy({ it.dayNumber }, { slotOrder(it.slot) }))
            .firstOrNull()
    }

    fun assignToMe(shiftId: String): Boolean {
        val shift = shiftsById[shiftId] ?: return false
        if (isAssignedToMe(shiftId)) return true
        if (!isAvailable(shift)) return false
        _myShiftIds.update { it + shiftId }
        return true
    }

    fun unassign(shiftId: String) {
        _myShiftIds.update { it - shiftId }
    }

    fun completedCount(): Int = _myShiftIds.value.size

    private fun slotOrder(slot: String): Int =
        when (slot) {
            "Start day" -> 0
            "Morning break" -> 1
            "Lunch break" -> 2
            "Afternoon break" -> 3
            "Dinner break" -> 4
            "End day" -> 5
            "Any time" -> 6
            else -> 7
        }
}
