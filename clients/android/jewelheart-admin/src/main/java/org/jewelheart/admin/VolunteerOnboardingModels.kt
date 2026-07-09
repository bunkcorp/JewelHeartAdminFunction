package org.jewelheart.admin

import com.google.gson.annotations.SerializedName

data class VolunteerBootstrapResponse(
    val ok: Boolean = false,
    val volunteerId: String? = null,
    val profileConfirmed: Boolean = false,
    val firstName: String = "",
    val lastName: String = "",
    val email: String = "",
    val phone: String = "",
    val authEmail: String = "",
    val authPhone: String = "",
    @SerializedName("phoneOtpRequired") val phoneOtpRequired: Boolean = true,
)
