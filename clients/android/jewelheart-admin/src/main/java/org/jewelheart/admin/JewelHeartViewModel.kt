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
) : ViewModel() {
    var screenId by mutableStateOf("jewelheart.home")
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
                    "retreat.schedule", "retreat.home", "retreat.list", "jewelheart.home" ->
                        extraParams = extraParams.filterKeys { it != "day" && it != "weekMonday" }
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
