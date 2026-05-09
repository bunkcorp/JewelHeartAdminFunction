package org.jewelheart.admin

object JewelHeartConfig {
    /** Single product IANA zone for retreat dates and volunteer weeks (DST-aware Eastern). */
    const val jewelheartDefaultTimeZoneId = "America/New_York"

    const val API_HOST = "api.karmadots.org"
    const val USE_TLS = true

    fun baseUrl(): String = if (USE_TLS) "https://$API_HOST" else "http://$API_HOST"
}
