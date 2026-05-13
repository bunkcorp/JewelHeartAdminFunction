package org.jewelheart.admin

object JewelHeartConfig {
    /** Single product IANA zone for retreat dates and volunteer weeks (DST-aware Eastern). */
    const val jewelheartDefaultTimeZoneId = "America/New_York"

    const val API_HOST = "api.karmadots.org"
    const val USE_TLS = true

    fun baseUrl(): String = if (USE_TLS) "https://$API_HOST" else "http://$API_HOST"

    /**
     * Dev shell: hide the bottom "Retreats" tab and assume a single retreat.
     * Retreat admin is under **Home** (second segment: SDUI vs this retreat).
     */
    const val singleRetreatDevMode: Boolean = true

    /**
     * If non-null, this retreat id is used and no list lookup runs.
     * Paste the UUID from the API or Firebase if name matching is ambiguous.
     */
    val singleRetreatId: String? = null

    /**
     * When [singleRetreatId] is null, the first retreat in `listRetreats` whose [Retreat.name]
     * contains every substring (case-insensitive) wins. Tuned for "Summer retreat – Jul 20 …".
     */
    val singleRetreatNameMatchers: List<String> = listOf("summer", "jul")
}
