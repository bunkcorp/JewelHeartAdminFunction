package org.jewelheart.admin

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

@Composable
fun VolunteerOnboardingScreen(
    draft: VolunteerBootstrapResponse,
    onComplete: () -> Unit,
) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()

    var firstName by remember(draft.volunteerId) { mutableStateOf(draft.firstName) }
    var lastName by remember(draft.volunteerId) { mutableStateOf(draft.lastName) }
    var phone by remember(draft.volunteerId) { mutableStateOf(draft.phone) }
    var code by remember { mutableStateOf("") }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var isError by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    val displayEmail = draft.authEmail.ifBlank { draft.email }

    VolunteerAuthScaffold {
        Spacer(Modifier.height(6.dp))
        VolunteerBlueBar("App onboard (NOT retreat registration)")
        Spacer(Modifier.height(10.dp))

        VolunteerGrayTextField(
            value = firstName,
            onValueChange = { firstName = it },
            placeholder = "First name.",
        )
        VolunteerGrayTextField(
            value = lastName,
            onValueChange = { lastName = it },
            placeholder = "Last name.",
        )

        if (displayEmail.isNotBlank()) {
            Text(
                displayEmail,
                color = Color.Black,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(vertical = 6.dp),
            )
        }

        VolunteerGrayTextField(
            value = phone,
            onValueChange = { phone = it },
            placeholder = "Phone #",
        )

        VolunteerMaroonButton(
            text = "Send code to phone",
            enabled = !busy,
            onClick = {
                scope.launch {
                    busy = true
                    statusMessage = null
                    isError = false
                    val normalized = VolunteerPhone.normalizeE164(phone)
                    if (normalized == null) {
                        statusMessage = "Enter a valid phone number."
                        isError = true
                        busy = false
                        return@launch
                    }
                    try {
                        val msg = repo.sendOnboardingPhoneOtp(normalized)
                        statusMessage = msg
                        isError = false
                    } catch (e: Exception) {
                        statusMessage = e.message ?: e.toString()
                        isError = true
                    } finally {
                        busy = false
                    }
                }
            },
        )

        VolunteerGrayTextField(
            value = code,
            onValueChange = { code = it },
            placeholder = "Enter code.",
        )

        VolunteerMaroonButton(
            text = "Submit code",
            enabled = !busy,
            onClick = {
                scope.launch {
                    busy = true
                    statusMessage = null
                    isError = false
                    val fn = firstName.trim()
                    val ln = lastName.trim()
                    val phoneRaw = phone.trim()
                    val normalized = VolunteerPhone.normalizeE164(phoneRaw)
                    val otp = code.trim()

                    when {
                        fn.isEmpty() -> {
                            statusMessage = "Enter your first name."
                            isError = true
                        }
                        ln.isEmpty() -> {
                            statusMessage = "Enter your last name."
                            isError = true
                        }
                        normalized == null -> {
                            statusMessage = "Enter a valid phone number."
                            isError = true
                        }
                        !Regex("^\\d{6}$").matches(otp) -> {
                            statusMessage = "Enter the 6-digit code from your text."
                            isError = true
                        }
                        displayEmail.isBlank() -> {
                            statusMessage = "Email address is missing from sign-in."
                            isError = true
                        }
                        else -> {
                            try {
                                repo.verifyOnboardingPhoneOtp(normalized, otp)
                                repo.completeOnboarding(fn, ln, displayEmail, phoneRaw)
                                onComplete()
                            } catch (e: JewelHeartRepository.HttpApiException) {
                                val body = e.body.orEmpty()
                                if (body.contains("Incorrect code", ignoreCase = true)) {
                                    statusMessage = "Incorrect code, retry"
                                    isError = true
                                } else {
                                    statusMessage = e.message
                                    isError = true
                                }
                            } catch (e: Exception) {
                                val msg = e.message.orEmpty()
                                if (msg.contains("Incorrect code", ignoreCase = true)) {
                                    statusMessage = "Incorrect code, retry"
                                } else {
                                    statusMessage = msg.ifBlank { e.toString() }
                                }
                                isError = true
                            }
                        }
                    }
                    busy = false
                }
            },
        )

        statusMessage?.let { VolunteerAuthMessage(it, isError) }

        if (busy) {
            Spacer(Modifier.height(12.dp))
            CircularProgressIndicator()
        }
    }
}

object VolunteerPhone {
    fun normalizeE164(raw: String): String? {
        val digits = raw.replace(Regex("[^0-9]"), "")
        if (digits.isEmpty()) return null
        return when {
            raw.trim().startsWith("+") -> "+$digits"
            digits.length == 10 -> "+1$digits"
            digits.length == 11 && digits.startsWith("1") -> "+$digits"
            else -> "+$digits"
        }
    }
}
