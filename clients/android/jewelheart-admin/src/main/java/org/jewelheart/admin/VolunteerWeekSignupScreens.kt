package org.jewelheart.admin

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId

private const val VolunteerPrefsName = "jewelheart"
const val SelfVolunteerIdPrefsKey = "jewelheart.selfVolunteerId"

private fun Context.volunteerPrefs() = getSharedPreferences(VolunteerPrefsName, Context.MODE_PRIVATE)

@Composable
fun VolunteerNavHost(navController: NavHostController) {
    NavHost(navController = navController, startDestination = "vlist", modifier = Modifier.fillMaxSize()) {
        composable("vlist") { VolunteerRetreatListScreen(navController) }
        composable(
            "vweek/{rid}",
            arguments = listOf(navArgument("rid") { type = NavType.StringType }),
        ) { entry ->
            RetreatVolunteerWeekSignupScreen(
                navController,
                retreatId = entry.arguments!!.getString("rid")!!,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VolunteerRetreatListScreen(nav: NavHostController) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<Retreat>>(emptyList()) }
    var err by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }

    fun load() {
        scope.launch {
            loading = true
            err = null
            try {
                items = repo.listRetreats(limit = 100).items
            } catch (e: Exception) {
                err = e.message
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Volunteer") },
                actions = {
                    TextButton(onClick = { load() }, enabled = !loading) { Text("Reload") }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 12.dp),
        ) {
            when {
                loading -> CircularProgressIndicator(Modifier.padding(16.dp))
                err != null -> Text(err!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(8.dp))
                items.isEmpty() -> Text(
                    "No retreats yet. Pull to refresh after an admin grants access.",
                    modifier = Modifier.padding(16.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                else -> {
                    Column(Modifier.verticalScroll(rememberScrollState())) {
                        items.forEach { r ->
                            Card(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                                    .clickable { nav.navigate("vweek/${r.id}") },
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                            ) {
                                Column(Modifier.padding(12.dp)) {
                                    Text(r.name, style = MaterialTheme.typography.titleMedium)
                                    Text("${r.status.name} · ${r.timezone}", style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MiniBarRow(
    axisLabel: String,
    value: Int,
    maxVal: Int,
    barColor: Color,
    modifier: Modifier = Modifier,
) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            axisLabel,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.width(52.dp),
        )
        BoxWithConstraints(
            modifier = Modifier
                .weight(1f)
                .height(16.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            val frac = if (maxVal > 0) value.coerceAtMost(maxVal).toFloat() / maxVal else 0f
            Box(
                Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(frac)
                    .background(barColor.copy(alpha = 0.58f)),
            )
        }
        Spacer(Modifier.width(8.dp))
        Text("$value", style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun FilterSectionHeader(title: String, open: Boolean, onToggle: () -> Unit) {
    TextButton(onClick = onToggle, modifier = Modifier.fillMaxWidth()) {
        Text(if (open) "▼ $title" else "▶ $title")
    }
}

private fun volunteerLoadActualAvgLabel(m: VolunteerDayLoadMetrics): String {
    val a = m.avgMinutesPerWorkerActual ?: return "—"
    val s = String.format("%.1f", a)
    return if (m.usesSlotFallbackForAvg) "~$s" else s
}

/** Prefer API webcal URL; if https-only, derive webcal:// with the same host and path. */
private fun webcalSubscribeUrl(webcal: String?, https: String?): String? {
    fun toWebcal(raw: String): String {
        val t = raw.trim()
        val l = t.lowercase()
        return when {
            l.startsWith("webcal://") -> t
            l.startsWith("https://") -> "webcal://" + t.drop(8)
            l.startsWith("http://") -> "webcal://" + t.drop(7)
            else -> t
        }
    }
    val w = webcal?.trim().orEmpty()
    if (w.isNotEmpty()) return toWebcal(w)
    val h = https?.trim().orEmpty()
    if (h.isEmpty()) return null
    return toWebcal(h)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RetreatVolunteerWeekSignupScreen(nav: NavHostController, retreatId: String) {
    val ctx = LocalContext.current
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val prefs = remember(ctx) { ctx.volunteerPrefs() }

    var retreat by remember { mutableStateOf<Retreat?>(null) }
    var linkedVolunteers by remember { mutableStateOf<List<RetreatVolunteer>>(emptyList()) }
    var weekMonday by remember { mutableStateOf<LocalDate?>(null) }
    var rows by remember { mutableStateOf<List<ScheduleDayItem>>(emptyList()) }
    var loadErr by remember { mutableStateOf<String?>(null) }
    var actionErr by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var actingTaskIds by remember { mutableStateOf(setOf<String>()) }

    var selfVolunteerId by remember {
        mutableStateOf(prefs.getString(SelfVolunteerIdPrefsKey, "") ?: "")
    }

    var includedSlotLabels by remember { mutableStateOf(setOf<String>()) }
    var includedWeekDates by remember { mutableStateOf(setOf<String>()) }
    var includedSites by remember { mutableStateOf(setOf<String>()) }
    var includedTimeBands by remember { mutableStateOf(setOf<TimeBand>()) }
    var includedDurationMinutes by remember { mutableStateOf(setOf<Int>()) }

    var slotFilterOpen by remember { mutableStateOf(false) }
    var dayFilterOpen by remember { mutableStateOf(false) }
    var siteFilterOpen by remember { mutableStateOf(false) }
    var bandFilterOpen by remember { mutableStateOf(false) }
    var durationFilterOpen by remember { mutableStateOf(false) }

    var volunteerMenuOpen by remember { mutableStateOf(false) }

    var calendarHttps by remember { mutableStateOf<String?>(null) }
    var calendarWebcal by remember { mutableStateOf<String?>(null) }
    var calendarBusy by remember { mutableStateOf(false) }
    var calendarErr by remember { mutableStateOf<String?>(null) }

    val zoneId: ZoneId = retreat?.let { retreatZoneId(it.timezone) } ?: retreatZoneId("UTC")

    fun persistSelfVolunteer(id: String) {
        prefs.edit().putString(SelfVolunteerIdPrefsKey, id).apply()
        selfVolunteerId = id
        calendarHttps = null
        calendarWebcal = null
        calendarErr = null
    }

    suspend fun fetchWeekScheduleMerged(monday: LocalDate) {
        val days = volunteerWeekDayStringsFromMonday(monday)
        val responses = coroutineScope {
            days.map { d -> async { repo.getScheduleByDay(retreatId, d) } }.awaitAll()
        }
        val merged = responses.flatMap { it.items }
        val seen = HashSet<String>()
        val deduped = merged.filter { seen.add(it.task.id) }
        val allowedMinutes = deduped.map { it.job.estimatedMinutes }.toSet()
        includedDurationMinutes = includedDurationMinutes.intersect(allowedMinutes)
        rows = deduped
        weekMonday = monday
    }

    fun loadWeek(monday: LocalDate) {
        scope.launch {
            busy = true
            loadErr = null
            try {
                fetchWeekScheduleMerged(monday)
            } catch (e: Exception) {
                loadErr = e.message
            } finally {
                busy = false
            }
        }
    }

    fun reloadAll() {
        scope.launch {
            busy = true
            loadErr = null
            actionErr = null
            try {
                val r = repo.getRetreat(retreatId)
                val vols = repo.listRetreatVolunteers(retreatId)
                retreat = r
                linkedVolunteers = vols.items
                val z = retreatZoneId(r.timezone)
                val initial = volunteerSignupInitialWeekMonday(r, z)
                weekMonday = initial
                fetchWeekScheduleMerged(initial)
            } catch (e: Exception) {
                loadErr = e.message
            } finally {
                busy = false
            }
        }
    }

    LaunchedEffect(retreatId) { reloadAll() }

    val monday = weekMonday
    if (monday == null) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Week signup") },
                    navigationIcon = {
                        IconButton(onClick = { nav.popBackStack() }) {
                            Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                        }
                    },
                )
            },
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                if (busy) CircularProgressIndicator()
            }
        }
        return
    }

    val weekIsoDays = volunteerWeekDayStringsFromMonday(monday)
    val weekTitle = run {
        val a = weekIsoDays.firstOrNull() ?: return@run "Week"
        val b = weekIsoDays.lastOrNull() ?: return@run "Week"
        "${volunteerWeekDayLabel(a, zoneId)} – ${volunteerWeekDayLabel(b, zoneId)}"
    }

    val uniqueSlotLabels = rows.map { it.slot.label }.toSet().sorted()
    val uniqueSites = rows.map { item ->
        val raw = item.slot.activityContext?.trim().orEmpty()
        if (raw.isEmpty()) "—" else raw
    }.toSet().sorted()

    val uniqueDurationMinutes = rows.map { it.job.estimatedMinutes }.toSet().sorted()
    val filteredRows = filteredVolunteerRows(
        rows,
        includedSlotLabels,
        includedWeekDates,
        includedSites,
        includedTimeBands,
        includedDurationMinutes,
    )
    val dayLoadMetrics = volunteerDayLoadMetrics(rows, weekIsoDays, zoneId)
    val maxDemand = dayLoadMetrics.maxOfOrNull { it.totalVolunteerMinutesDemand } ?: 0
    val maxFilled = dayLoadMetrics.maxOfOrNull { it.assignedPersonMinutes } ?: 0

    val selfIsLinked = selfVolunteerId.isNotBlank() && linkedVolunteers.any { it.volunteerId == selfVolunteerId }
    val hasAnyFilter =
        includedSlotLabels.isNotEmpty() || includedWeekDates.isNotEmpty() || includedSites.isNotEmpty() ||
            includedTimeBands.isNotEmpty() || includedDurationMinutes.isNotEmpty()

    var td = 0
    var ts = 0
    var tf = 0
    var tfs = 0
    dayLoadMetrics.forEach { m ->
        td += m.totalVolunteerMinutesDemand
        ts += m.volunteerSlotsDemand
        tf += m.assignedPersonMinutes
        tfs += m.filledSlotCount
    }
    val avgDemand = if (ts > 0) td.toDouble() / ts else 0.0
    val avgFilledPerSlot = if (tfs > 0) tf.toDouble() / tfs else null

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Week signup") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(onClick = { reloadAll() }, enabled = !busy) { Text("Reload") }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            fun copyCal(label: String, text: String) {
                val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText(label, text))
            }

            fun openCalendarOrSnackbar(webcalUrl: String) {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(webcalUrl))
                if (ctx !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try {
                    ctx.startActivity(intent)
                } catch (_: ActivityNotFoundException) {
                    scope.launch {
                        snackbarHostState.showSnackbar("No app found to open this calendar link")
                    }
                }
            }

            fun openBrowserOrSnackbar(httpsUrl: String) {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(httpsUrl))
                if (ctx !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try {
                    ctx.startActivity(intent)
                } catch (_: ActivityNotFoundException) {
                    scope.launch {
                        snackbarHostState.showSnackbar("No app found to open this link")
                    }
                }
            }

            loadErr?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            actionErr?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

            retreat?.let { r ->
                Text(r.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                Text(
                    "Week is interpreted in the retreat timezone (${r.timezone}).",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (!apiDateStringsOverlapRange(weekIsoDays, r.startDate, r.endDate)) {
                    Text(
                        "These dates are outside this retreat’s configured range (${r.startDate ?: "—"} … ${r.endDate ?: "—"}).",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.tertiary,
                    )
                }
            }

            Text(weekTitle, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    onClick = {
                        val nm = monday.minusDays(7)
                        loadWeek(nm)
                    },
                    enabled = !busy,
                ) { Icon(Icons.Filled.KeyboardArrowLeft, contentDescription = "Previous week") }
                TextButton(
                    onClick = {
                        val todayMonday = volunteerWeekMondayContaining(todayLocalDateInZone(zoneId))
                        loadWeek(todayMonday)
                    },
                    enabled = !busy,
                ) { Text("Today’s week") }
                IconButton(
                    onClick = {
                        val nm = monday.plusDays(7)
                        loadWeek(nm)
                    },
                    enabled = !busy,
                ) { Icon(Icons.Filled.KeyboardArrowRight, contentDescription = "Next week") }
            }
            retreat?.let { r ->
                TextButton(
                    onClick = {
                        val initial = volunteerSignupInitialWeekMonday(r, zoneId)
                        loadWeek(initial)
                    },
                    enabled = !busy && (r.startDate != null),
                ) { Text("Jump to retreat start week") }
            }

            Text("Volunteer load", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(
                "Demand matches the spreadsheet model (each task needs its own volunteers). Bars refresh when you sign up or leave a slot.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (dayLoadMetrics.all { it.volunteerSlotsDemand == 0 }) {
                Text(
                    "No tasks in this week yet — change the week or add schedule to see metrics.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Text("Person-minutes needed (jobs still want people)", style = MaterialTheme.typography.labelLarge)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    dayLoadMetrics.forEach { m ->
                        MiniBarRow(
                            m.chartAxisLabel,
                            m.totalVolunteerMinutesDemand,
                            maxOf(maxDemand, 1),
                            Color(0xFF4F46E5),
                        )
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text("Person-minutes filled (assignments so far)", style = MaterialTheme.typography.labelLarge)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    dayLoadMetrics.forEach { m ->
                        MiniBarRow(
                            m.chartAxisLabel,
                            m.assignedPersonMinutes,
                            maxOf(maxFilled, 1),
                            Color(0xFF0D9488),
                        )
                    }
                }

                Text("By day", style = MaterialTheme.typography.labelLarge)
                dayLoadMetrics.forEach { m ->
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(m.displayLabel, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                            Text("Demand (person·min): ${m.totalVolunteerMinutesDemand}", style = MaterialTheme.typography.bodySmall)
                            Text("Slots needed: ${m.volunteerSlotsDemand}", style = MaterialTheme.typography.bodySmall)
                            Text("Avg demand (min per slot): ${String.format("%.1f", m.avgMinutesPerSlotDemand)}", style = MaterialTheme.typography.bodySmall)
                            Text("Filled (person·min): ${m.assignedPersonMinutes}", style = MaterialTheme.typography.bodySmall)
                            Text(
                                "Distinct people: ${m.distinctVolunteersAssigned?.toString() ?: "—"}",
                                style = MaterialTheme.typography.bodySmall,
                            )
                            Text("Avg actual (min per person): ${volunteerLoadActualAvgLabel(m)}", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHighest)) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Week total", fontWeight = FontWeight.SemiBold)
                        Text("Demand (person·min): $td", style = MaterialTheme.typography.bodySmall)
                        Text("Slots needed: $ts", style = MaterialTheme.typography.bodySmall)
                        Text("Avg demand (min per slot): ${String.format("%.1f", avgDemand)}", style = MaterialTheme.typography.bodySmall)
                        Text("Filled (person·min): $tf", style = MaterialTheme.typography.bodySmall)
                        Text(
                            "Avg filled (min per filled slot): ${avgFilledPerSlot?.let { String.format("%.1f", it) } ?: "—"}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
                Text(
                    "Demand avg assumes no double duty. Actual avg uses distinct volunteers when the API lists them; a leading ~ means per filled slot.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Text("Signing up as", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            if (linkedVolunteers.isEmpty()) {
                Text(
                    "No volunteers are linked to this retreat yet. Ask an admin to link you under Retreat → Linked volunteers.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                val selectedName = linkedVolunteers.firstOrNull { it.volunteerId == selfVolunteerId }?.volunteer?.displayName ?: "Choose…"
                Column {
                    Text("Volunteer profile", style = MaterialTheme.typography.labelMedium)
                    Box {
                        Button(
                            onClick = { volunteerMenuOpen = true },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(selectedName, maxLines = 2) }
                        DropdownMenu(
                            expanded = volunteerMenuOpen,
                            onDismissRequest = { volunteerMenuOpen = false },
                        ) {
                            DropdownMenuItem(
                                text = { Text("Clear") },
                                onClick = {
                                    persistSelfVolunteer("")
                                    volunteerMenuOpen = false
                                },
                            )
                            linkedVolunteers.forEach { rv ->
                                DropdownMenuItem(
                                    text = { Text(rv.volunteer.displayName) },
                                    onClick = {
                                        persistSelfVolunteer(rv.volunteerId)
                                        volunteerMenuOpen = false
                                    },
                                )
                            }
                        }
                    }
                }
                if (selfVolunteerId.isNotEmpty() && !selfIsLinked) {
                    Text(
                        "Pick a volunteer that is linked to this retreat.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.tertiary,
                    )
                }
            }

            Text("Calendar feed", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(
                "Subscribe in your calendar app. The HTTPS URL is a secret — don’t share it publicly.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (calendarBusy) {
                CircularProgressIndicator(Modifier.size(24.dp))
            }
            calendarErr?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            Button(
                onClick = {
                    scope.launch {
                        calendarBusy = true
                        calendarErr = null
                        try {
                            val res = repo.mintVolunteerCalendarFeed(selfVolunteerId, regenerate = false)
                            calendarHttps = res.subscribeHttpsUrl
                            calendarWebcal = res.webcalSubscribeUrl
                        } catch (e: Exception) {
                            calendarErr = e.message
                        } finally {
                            calendarBusy = false
                        }
                    }
                },
                enabled = selfIsLinked && selfVolunteerId.isNotBlank() && !calendarBusy,
            ) { Text("Show subscribe link") }
            Button(
                onClick = {
                    scope.launch {
                        calendarBusy = true
                        calendarErr = null
                        try {
                            val res = repo.mintVolunteerCalendarFeed(selfVolunteerId, regenerate = true)
                            calendarHttps = res.subscribeHttpsUrl
                            calendarWebcal = res.webcalSubscribeUrl
                        } catch (e: Exception) {
                            calendarErr = e.message
                        } finally {
                            calendarBusy = false
                        }
                    }
                },
                enabled = selfIsLinked && selfVolunteerId.isNotBlank() && !calendarBusy,
            ) { Text("Rotate link") }
            calendarHttps?.let { url ->
                Text(url, style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { copyCal("JewelHeart calendar", url) }) { Text("Copy HTTPS URL") }
                TextButton(onClick = { openBrowserOrSnackbar(url) }) { Text("Open in browser") }
            }
            webcalSubscribeUrl(calendarWebcal, calendarHttps)?.let { webcalUrl ->
                Button(onClick = { openCalendarOrSnackbar(webcalUrl) }) { Text("Subscribe in Calendar") }
                TextButton(onClick = { copyCal("JewelHeart subscribe", webcalUrl) }) { Text("Copy subscribe link") }
            }

            Text("Filters", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(
                "Leave a group empty to show all. Otherwise only rows matching every active filter are shown.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            FilterSectionHeader("Slot label", slotFilterOpen) { slotFilterOpen = !slotFilterOpen }
            if (slotFilterOpen) {
                uniqueSlotLabels.forEach { label ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clickable {
                            includedSlotLabels =
                                if (label in includedSlotLabels) includedSlotLabels - label else includedSlotLabels + label
                        },
                    ) {
                        Checkbox(checked = label in includedSlotLabels, onCheckedChange = null)
                        Text(label, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            FilterSectionHeader("Day (this week)", dayFilterOpen) { dayFilterOpen = !dayFilterOpen }
            if (dayFilterOpen) {
                weekIsoDays.forEach { iso ->
                    val lab = volunteerWeekDayLabel(iso, zoneId)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clickable {
                            includedWeekDates =
                                if (iso in includedWeekDates) includedWeekDates - iso else includedWeekDates + iso
                        },
                    ) {
                        Checkbox(checked = iso in includedWeekDates, onCheckedChange = null)
                        Text(lab, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            FilterSectionHeader("Site / context", siteFilterOpen) { siteFilterOpen = !siteFilterOpen }
            if (siteFilterOpen) {
                uniqueSites.forEach { tag ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clickable {
                            includedSites = if (tag in includedSites) includedSites - tag else includedSites + tag
                        },
                    ) {
                        Checkbox(checked = tag in includedSites, onCheckedChange = null)
                        Text(tag, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            FilterSectionHeader("Time band", bandFilterOpen) { bandFilterOpen = !bandFilterOpen }
            if (bandFilterOpen) {
                TimeBand.entries.forEach { band ->
                    val raw = band.name.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clickable {
                            includedTimeBands =
                                if (band in includedTimeBands) includedTimeBands - band else includedTimeBands + band
                        },
                    ) {
                        Checkbox(checked = band in includedTimeBands, onCheckedChange = null)
                        Text(raw, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            FilterSectionHeader("Time commitment (job length)", durationFilterOpen) { durationFilterOpen = !durationFilterOpen }
            if (durationFilterOpen) {
                if (uniqueDurationMinutes.isEmpty()) {
                    Text(
                        "Time commitment options appear here once this week has scheduled roles.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    uniqueDurationMinutes.forEach { mins ->
                        val lab = durationMinutesFilterLabel(mins)
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.clickable {
                                includedDurationMinutes =
                                    if (mins in includedDurationMinutes) includedDurationMinutes - mins
                                    else includedDurationMinutes + mins
                            },
                        ) {
                            Checkbox(checked = mins in includedDurationMinutes, onCheckedChange = null)
                            Text(lab, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }

            if (hasAnyFilter) {
                TextButton(
                    onClick = {
                        includedSlotLabels = emptySet()
                        includedWeekDates = emptySet()
                        includedSites = emptySet()
                        includedTimeBands = emptySet()
                        includedDurationMinutes = emptySet()
                    },
                ) { Text("Clear filters") }
            }

            Text("Open roles (${filteredRows.size})", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            if (filteredRows.isEmpty()) {
                Text(
                    if (rows.isEmpty()) "Nothing scheduled for this week, or filters hide every row."
                    else "No rows match these filters.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                filteredRows.forEach { item ->
                    VolunteerTaskRow(
                        item = item,
                        zoneId = zoneId,
                        selfVolunteerId = selfVolunteerId,
                        selfIsLinked = selfIsLinked,
                        acting = item.task.id in actingTaskIds,
                        busy = busy,
                        onSignUp = {
                            if (!selfIsLinked || selfVolunteerId.isBlank()) {
                                actionErr = "Choose a linked volunteer profile first."
                                return@VolunteerTaskRow
                            }
                            scope.launch {
                                actionErr = null
                                actingTaskIds = actingTaskIds + item.task.id
                                try {
                                    repo.createAssignment(retreatId, item.task.id, selfVolunteerId)
                                    fetchWeekScheduleMerged(monday)
                                } catch (e: Exception) {
                                    actionErr = e.message
                                } finally {
                                    actingTaskIds = actingTaskIds - item.task.id
                                }
                            }
                        },
                        onLeave = { assignmentId ->
                            scope.launch {
                                actionErr = null
                                actingTaskIds = actingTaskIds + item.task.id
                                try {
                                    repo.deleteAssignment(retreatId, assignmentId)
                                    fetchWeekScheduleMerged(monday)
                                } catch (e: Exception) {
                                    actionErr = e.message
                                } finally {
                                    actingTaskIds = actingTaskIds - item.task.id
                                }
                            }
                        },
                    )
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }
}

@Composable
private fun VolunteerTaskRow(
    item: ScheduleDayItem,
    zoneId: ZoneId,
    selfVolunteerId: String,
    selfIsLinked: Boolean,
    acting: Boolean,
    busy: Boolean,
    onSignUp: () -> Unit,
    onLeave: (String) -> Unit,
) {
    val need = item.task.volunteersNeeded ?: item.job.volunteersNeeded
    val filled = item.task.assignmentCount ?: 0
    val mine = item.assignments?.firstOrNull { it.volunteerId == selfVolunteerId }
    val canAct = selfIsLinked && selfVolunteerId.isNotBlank()
    val bandRaw = item.slot.timeBand.name.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }

    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(item.job.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(
                "${item.slot.label} · ${volunteerWeekDayLabel(item.slot.slotDate, zoneId)}",
                style = MaterialTheme.typography.bodySmall,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    bandRaw,
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier
                        .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(50))
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
                Text("${item.job.estimatedMinutes} min", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("$filled/$need filled", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            item.slot.activityContext?.trim().orEmpty().takeIf { it.isNotEmpty() }?.let { site ->
                Text("Site / context: $site", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            item.task.notes?.trim().orEmpty().takeIf { it.isNotEmpty() }?.let { n ->
                Text(n, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            when {
                mine != null -> {
                    Button(
                        onClick = { onLeave(mine.id) },
                        enabled = !acting && !busy && canAct,
                    ) {
                        if (acting) {
                            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        } else {
                            Text("Leave this slot")
                        }
                    }
                }
                filled < need -> {
                    Button(
                        onClick = onSignUp,
                        enabled = !acting && !busy && canAct,
                    ) {
                        if (acting) {
                            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        } else {
                            Text("Sign up")
                        }
                    }
                }
                else -> Text("Full", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
