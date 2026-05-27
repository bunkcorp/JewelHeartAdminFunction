package org.jewelheart.admin

/** Shared compact copy/formatting for volunteer v2 screens. */
object VolunteerV2Format {
    /** One-line shift label: "Site, activity · slot" (comma instead of em dash). */
    fun shiftLine(shift: RetreatV7Shift): String {
        val job = "${shift.site}, ${shift.activity}"
        val slot = compactSlotLabel(shift.slot)
        return if (slot.isEmpty()) job else "$job · $slot"
    }

    /** Short slot label for list rows (not full timing sentence). */
    fun compactSlotLabel(slot: String): String =
        when (slot) {
            "Any time" -> "any time"
            "Start day" -> "start of day"
            "End day" -> "end of day"
            else -> slot
        }

    /** Full timing sentence for shift detail screen. */
    fun slotTimingText(slot: String): String =
        when (slot) {
            "Any time" -> "Can be done at any time throughout the day"
            "Start day" -> "Do this at start of day"
            "End day" -> "Do this at end of day"
            else -> "Do this at $slot"
        }

    fun dayHeader(dayNumber: Int): String = "Day $dayNumber"

    fun groupByDay(shifts: List<RetreatV7Shift>): List<Pair<Int, List<RetreatV7Shift>>> =
        shifts
            .groupBy { it.dayNumber }
            .toSortedMap()
            .map { (day, list) -> day to list }
}
