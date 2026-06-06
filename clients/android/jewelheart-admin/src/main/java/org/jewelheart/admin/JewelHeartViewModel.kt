package org.jewelheart.admin

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class JewelHeartViewModel(
    private val repo: JewelHeartRepository = JewelHeartRepository(),
    initialScreenId: String = "jewelheart.home",
) : ViewModel() {
    var screenId by mutableStateOf(initialScreenId)
        private set
    var retreatId by mutableStateOf<String?>(null)
        private set
    var extraParams by mutableStateOf(mapOf<String, String>())

    var envelope by mutableStateOf<SduiEnvelope?>(null)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var loading by mutableStateOf(false)
        private set

    fun signInAnonymously(onDone: (Throwable?) -> Unit) {
        viewModelScope.launch {
            try {
                FirebaseAuth.getInstance().signInAnonymously().await()
                onDone(null)
                load()
            } catch (e: Throwable) {
                onDone(e)
            }
        }
    }

    /** Return to volunteer home SDUI (e.g. when re-opening the Volunteer tab). */
    fun resetToVolunteerHome() {
        screenId = "jewelheart.home"
        retreatId = null
        extraParams = emptyMap()
        load()
    }

    fun load() {
        viewModelScope.launch {
            if (FirebaseAuth.getInstance().currentUser == null) {
                envelope = null
                error = "Sign in first"
                return@launch
            }
            loading = true
            error = null
            try {
                envelope = repo.fetchScreen(screenId, retreatId, extraParams)
            } catch (e: Throwable) {
                error = e.message ?: e.toString()
                envelope = null
            } finally {
                if (screenId == "jewelheart.volunteer.checkin") {
                    extraParams = extraParams.toMutableMap().apply { remove("checkinOp") }
                }
                loading = false
            }
        }
    }

    fun onAction(action: SduiAction) {
        when (action.type) {
            "navigate" -> {
                action.target?.let { screenId = it }
                action.payload?.get("retreatId")?.let { retreatId = it }
                    ?: run {
                        if (screenId == "retreat.list" || screenId == "jewelheart.home") retreatId = null
                    }
                when (screenId) {
                    "jewelheart.volunteer.search", "jewelheart.volunteer.assign",
                    "jewelheart.volunteer.checkin", "jewelheart.volunteer.messages",
                    "jewelheart.volunteer.mine", "jewelheart.volunteer.account",
                    "jewelheart.volunteer.preferences" -> {
                        action.payload?.get("retreatId")?.takeIf { it.isNotBlank() }?.let { retreatId = it }
                        val days = action.payload?.get("selectedDays")
                        val jobs = action.payload?.get("selectedJobs")
                        val taskId = action.payload?.get("taskId")
                        val checkinOp = action.payload?.get("checkinOp")
                        val returnTo = action.payload?.get("returnTo")
                        extraParams = extraParams.toMutableMap().apply {
                            if (days != null) put("selectedDays", days) else if (screenId == "jewelheart.volunteer.search") remove("selectedDays")
                            if (jobs != null) put("selectedJobs", jobs) else if (screenId == "jewelheart.volunteer.search") remove("selectedJobs")
                            if (taskId != null) put("taskId", taskId) else if (screenId == "jewelheart.volunteer.checkin") remove("taskId")
                            if (checkinOp != null) put("checkinOp", checkinOp)
                            else if (screenId == "jewelheart.volunteer.checkin") remove("checkinOp")
                            if (returnTo != null) put("returnTo", returnTo)
                            else if (screenId == "jewelheart.home") remove("returnTo")
                        }
                    }
                    "retreat.schedule", "retreat.home", "retreat.list", "jewelheart.home" ->
                        extraParams = extraParams.filterKeys {
                            it != "day" && it != "weekMonday" && it != "selectedDays" && it != "selectedJobs" && it != "taskId" && it != "returnTo" && it != "checkinOp"
                        }
                    "retreat.schedule.day" -> {
                        val d = action.payload?.get("day")?.takeIf { it.isNotBlank() }
                        extraParams = if (d != null) {
                            extraParams.filterKeys { it != "weekMonday" } + ("day" to d)
                        } else {
                            extraParams.filterKeys { it != "day" }
                        }
                    }
                    "retreat.volunteer.week" -> {
                        val wm = action.payload?.get("weekMonday")?.takeIf { it.isNotBlank() }
                        extraParams = if (wm != null) {
                            extraParams.filterKeys { it != "day" } + ("weekMonday" to wm)
                        } else {
                            extraParams.filterKeys { it != "weekMonday" }
                        }
                    }
                }
                action.payload?.get("date")?.takeIf { it.isNotBlank() }?.let { d ->
                    extraParams = extraParams + ("date" to d)
                }
                load()
            }
        }
    }
}
