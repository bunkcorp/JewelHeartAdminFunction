package org.jewelheart.admin

object JewelHeartConfig {
    const val API_HOST = "api.karmadots.org"
    const val USE_TLS = true

    fun baseUrl(): String = if (USE_TLS) "https://$API_HOST" else "http://$API_HOST"
}
