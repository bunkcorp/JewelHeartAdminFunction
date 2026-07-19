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

    private val navHistory = ArrayDeque<NavSnapshot>()

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

    fun resetToVolunteerHome() {
        screenId = "jewelheart.home"
        retreatId = null
        extraParams = emptyMap()
        navHistory.clear()
        load()
    }

    fun canGoBack(): Boolean = navHistory.isNotEmpty()

    fun actionTargetsVolunteerHome(action: SduiAction?): Boolean {
        if (action == null) return false
        if (action.type == "navigate" && action.target == "jewelheart.home") return true
        if (action.type == "navBack") {
            val top = navHistory.lastOrNull() ?: return false
            return top.screenId == "jewelheart.home"
        }
        return false
    }

    fun goBack() {
        val prev = navHistory.removeLastOrNull() ?: return
        screenId = prev.screenId
        retreatId = prev.retreatId
        extraParams = prev.extraParams
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
                envelope?.screen?.let { syncFilterStateFromMetadata(it) }
            } catch (e: Throwable) {
                error = e.message ?: e.toString()
            } finally {
                if (
                    screenId == "jewelheart.volunteer.checkin" ||
                    screenId == "jewelheart.volunteer.shiftDetail" ||
                    screenId == "jewelheart.volunteer.shift" ||
                    screenId == "jewelheart.volunteer.mine"
                ) {
                    extraParams = extraParams.toMutableMap().apply {
                        remove("checkinOp")
                    }
                }
                loading = false
            }
        }
    }

    private fun snapshotForStack(): NavSnapshot {
        val historyParams = extraParams.toMutableMap().apply { remove("checkinOp") }
        return NavSnapshot(screenId, retreatId, historyParams)
    }

    private fun restoreStackEntry(entry: NavSnapshot) {
        screenId = entry.screenId
        retreatId = entry.retreatId
        extraParams = entry.extraParams
    }

    private fun payloadValue(payload: Map<String, String>?, key: String): String? {
        if (payload == null || !payload.containsKey(key)) return null
        return payload[key]
    }

    private fun normalizePayload(payload: Map<String, Any>?): Map<String, String>? {
        if (payload == null) return null
        return payload.mapValues { (_, value) ->
            when (value) {
                null -> ""
                is String -> value
                is Number -> {
                    val asDouble = value.toDouble()
                    if (asDouble == asDouble.toLong().toDouble()) asDouble.toLong().toString()
                    else value.toString()
                }
                is Boolean -> if (value) "1" else "0"
                else -> value.toString()
            }
        }
    }

    private fun applyFindFilterPayload(payload: Map<String, String>?) {
        if (payload == null) return
        if (payload["filterReset"] == "1") {
            extraParams = extraParams.toMutableMap().apply {
                remove("daysAll")
                remove("selectedDays")
                remove("daysPrev")
                remove("jobsAll")
                remove("selectedJobs")
                remove("jobsPrev")
                remove("filterReset")
                put("daysAll", "1")
                put("selectedDays", "")
                put("daysPrev", "")
                put("jobsAll", "1")
                put("selectedJobs", "")
                put("jobsPrev", "")
            }
            return
        }
        extraParams = extraParams.toMutableMap().apply {
            remove("filterReset")
            if (payload.containsKey("daysAll")) {
                put("daysAll", payloadValue(payload, "daysAll").orEmpty())
            }
            if (payload.containsKey("jobsAll")) {
                put("jobsAll", payloadValue(payload, "jobsAll").orEmpty())
            }
            for (key in listOf("selectedDays", "daysPrev", "selectedJobs", "jobsPrev")) {
                if (!payload.containsKey(key)) continue
                val v = payloadValue(payload, key).orEmpty()
                if (v.isBlank()) remove(key) else put(key, v)
            }
        }
    }

    private fun syncFilterStateFromMetadata(screen: SduiScreen) {
        if (screenId != "jewelheart.volunteer.search") return
        val fs = screen.metadata?.filterState ?: return
        extraParams = extraParams.toMutableMap().apply {
            fs.daysAll?.let { put("daysAll", it) }
            fs.jobsAll?.let { put("jobsAll", it) }
            listOf(
                "selectedDays" to fs.selectedDays,
                "daysPrev" to fs.daysPrev,
                "selectedJobs" to fs.selectedJobs,
                "jobsPrev" to fs.jobsPrev,
            ).forEach { (key, value) ->
                if (!value.isNullOrBlank()) put(key, value) else remove(key)
            }
        }
    }

    private fun applyVolunteerPayload(target: String, payload: Map<String, String>?) {
        payload?.get("retreatId")?.let { retreatId = it }
            ?: run {
                if (target == "retreat.list" || target == "jewelheart.home") retreatId = null
            }
        when (target) {
            "jewelheart.home" -> {
                extraParams = extraParams.toMutableMap().apply {
                    remove("daysAll")
                    remove("selectedDays")
                    remove("daysPrev")
                    remove("jobsAll")
                    remove("selectedJobs")
                    remove("jobsPrev")
                    remove("jobType")
                    remove("typeJobPrefs")
                    remove("returnTo")
                }
            }
            "jewelheart.volunteer.search", "jewelheart.volunteer.assign" -> {
                payload?.get("retreatId")?.takeIf { it.isNotBlank() }?.let { retreatId = it }
                applyFindFilterPayload(payload)
                payload?.get("returnTo")?.takeIf { it.isNotBlank() }?.let { rt ->
                    extraParams = extraParams + ("returnTo" to rt)
                }
            }
            "jewelheart.volunteer.searchByType", "jewelheart.volunteer.searchByDay", "jewelheart.volunteer.shift", "jewelheart.volunteer.shiftDetail", "jewelheart.volunteer.checkin",
            "jewelheart.volunteer.messages", "jewelheart.volunteer.mine", "jewelheart.volunteer.account",
            "jewelheart.volunteer.preferences", "jewelheart.volunteer.manage", "jewelheart.volunteer.admin" -> {
                payload?.get("retreatId")?.takeIf { it.isNotBlank() }?.let { retreatId = it }
                extraParams = extraParams.toMutableMap().apply {
                    payload?.get("daysAll")?.takeIf { it.isNotBlank() }?.let { put("daysAll", it) }
                        ?: run {
                            if (target == "jewelheart.volunteer.searchByType") remove("daysAll")
                        }
                    payload?.get("selectedDays")?.let { put("selectedDays", it) }
                        ?: run {
                            if (target == "jewelheart.volunteer.searchByType") remove("selectedDays")
                        }
                    payload?.get("selectedDay")?.takeIf { it.isNotBlank() }?.let { put("selectedDay", it) }
                        ?: run {
                            if (target == "jewelheart.volunteer.searchByDay") remove("selectedDay")
                        }
                    payload?.get("jobsAll")?.takeIf { it.isNotBlank() }?.let { put("jobsAll", it) }
                        ?: run {
                            if (target == "jewelheart.volunteer.searchByType") remove("jobsAll")
                        }
                    payload?.get("selectedJobs")?.let { put("selectedJobs", it) }
                        ?: run {
                            if (target == "jewelheart.volunteer.searchByType") remove("selectedJobs")
                        }
                    payload?.get("jobType")?.let { put("jobType", it) }
                        ?: run {
                            if (target == "jewelheart.volunteer.searchByType" || target == "jewelheart.volunteer.searchByDay" || target == "jewelheart.volunteer.assign") remove("jobType")
                        }
                    payload?.get("typeJobPrefs")?.let { put("typeJobPrefs", it) }
                        ?: run {
                            if (target == "jewelheart.volunteer.searchByType" || target == "jewelheart.volunteer.searchByDay" || target == "jewelheart.volunteer.assign") remove("typeJobPrefs")
                        }
                    val taskId = payload?.get("taskId")
                    val checkinOp = payload?.get("checkinOp")
                    val returnTo = payload?.get("returnTo")
                    val shiftOp = payload?.get("shiftOp")
                    val jobId = payload?.get("jobId")
                    val dayIso = payload?.get("dayIso")
                    val volunteerId = payload?.get("volunteerId")
                    val expandCheckin = payload?.get("expandCheckin")
                    val expandInstructions = payload?.get("expandInstructions")
                    val shiftMode = payload?.get("shiftMode")
                    if (taskId != null) put("taskId", taskId)
                    else if (target == "jewelheart.volunteer.checkin" || target == "jewelheart.volunteer.shiftDetail" || target == "jewelheart.volunteer.shift") remove("taskId")
                    if (shiftMode != null) put("shiftMode", shiftMode)
                    else if (target != "jewelheart.volunteer.shiftDetail") remove("shiftMode")
                    if (checkinOp != null) put("checkinOp", checkinOp)
                    else if (
                        target == "jewelheart.volunteer.checkin" || target == "jewelheart.volunteer.shiftDetail" || target == "jewelheart.volunteer.shift" ||
                        target == "jewelheart.volunteer.mine"
                    ) remove("checkinOp")
                    if (shiftOp != null) put("shiftOp", shiftOp) else if (target != "jewelheart.volunteer.shift") remove("shiftOp")
                    if (jobId != null) put("jobId", jobId) else if (target != "jewelheart.volunteer.shift" && target != "jewelheart.volunteer.shiftDetail") remove("jobId")
                    if (dayIso != null) put("dayIso", dayIso) else if (target != "jewelheart.volunteer.shift" && target != "jewelheart.volunteer.shiftDetail") remove("dayIso")
                    if (volunteerId != null) put("volunteerId", volunteerId) else if (target != "jewelheart.volunteer.shift") remove("volunteerId")
                    if (expandCheckin != null) put("expandCheckin", expandCheckin) else if (target == "jewelheart.volunteer.shift") remove("expandCheckin")
                    if (expandInstructions != null) put("expandInstructions", expandInstructions)
                    else if (target == "jewelheart.volunteer.shift") remove("expandInstructions")
                    if (returnTo != null) put("returnTo", returnTo)
                }
            }
            "retreat.schedule", "retreat.home", "retreat.list" ->
                extraParams = extraParams.filterKeys {
                    it != "day" && it != "weekMonday" && it != "selectedDays" && it != "selectedJobs" &&
                        it != "taskId" && it != "returnTo" && it != "checkinOp" &&
                        it != "daysAll" && it != "jobsAll"
                }
            "retreat.schedule.day" -> {
                val d = payload?.get("day")?.takeIf { it.isNotBlank() }
                extraParams = if (d != null) {
                    extraParams.filterKeys { it != "weekMonday" } + ("day" to d)
                } else {
                    extraParams.filterKeys { it != "day" }
                }
            }
            "retreat.volunteer.week" -> {
                val wm = payload?.get("weekMonday")?.takeIf { it.isNotBlank() }
                extraParams = if (wm != null) {
                    extraParams.filterKeys { it != "day" } + ("weekMonday" to wm)
                } else {
                    extraParams.filterKeys { it != "weekMonday" }
                }
            }
        }
        payload?.get("date")?.takeIf { it.isNotBlank() }?.let { d ->
            extraParams = extraParams + ("date" to d)
        }
    }

    fun onAction(action: SduiAction) {
        when (action.type) {
            "navBack" -> goBack()
            "adminWorkspace" -> {
                navHistory.addLast(snapshotForStack())
                screenId = "jewelheart.volunteer.admin"
                load()
            }
            "navigate" -> {
                val target = action.target ?: return
                val payload = normalizePayload(action.payload)

                if (target == "jewelheart.home") {
                    navHistory.clear()
                    screenId = target
                    applyVolunteerPayload(target, payload)
                    load()
                    return
                }

                if (target == "jewelheart.volunteer.search" && screenId == "jewelheart.home") {
                    val resetPayload = (payload?.toMutableMap() ?: mutableMapOf()).apply {
                        put("filterReset", "1")
                    }
                    navHistory.addLast(snapshotForStack())
                    screenId = target
                    applyVolunteerPayload(target, resetPayload)
                    load()
                    return
                }

                if (target == screenId) {
                    applyVolunteerPayload(target, payload)
                    load()
                    return
                }

                val stackTop = navHistory.lastOrNull()
                if (stackTop != null && stackTop.screenId == target) {
                    val prev = navHistory.removeLast()
                    restoreStackEntry(prev)
                    screenId = target
                    applyVolunteerPayload(target, payload)
                    load()
                    return
                }

                navHistory.addLast(snapshotForStack())
                screenId = target
                applyVolunteerPayload(target, payload)
                load()
            }
        }
    }
}
