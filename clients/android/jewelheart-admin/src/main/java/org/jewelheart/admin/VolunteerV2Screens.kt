package org.jewelheart.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.google.firebase.auth.FirebaseAuth

private val SignupBlue = Color(0xFFD6EBFF)
private val SignupsRed = Color(0xFFFFE0E0)
private val CheckinGreen = Color(0xFFDFF5E4)
private val CompactBody = 15.sp
private val CompactLabel = 14.sp
private val RowPadV = 3.dp
private val SectionGap = 8.dp

@Composable
fun VolunteerV2NavHost(navController: NavHostController) {
    val context = LocalContext.current
    val repo = remember { RetreatV7Repository(context) }

    NavHost(navController = navController, startDestination = "v2home", modifier = Modifier.fillMaxSize()) {
        composable("v2home") { VolunteerV2HomeScreen(navController, repo) }
        composable("v2search") { VolunteerV2SearchScreen(navController, repo) }
        composable("v2available") { VolunteerV2AvailableScreen(navController, repo) }
        composable(
            "v2shift/{shiftId}",
            arguments = listOf(navArgument("shiftId") { type = NavType.StringType }),
        ) { entry ->
            VolunteerV2ShiftScreen(
                navController,
                repo,
                shiftId = entry.arguments!!.getString("shiftId")!!,
            )
        }
        composable("v2mine") { VolunteerV2MyAssignmentsScreen(navController, repo) }
        composable("v2checkin") { VolunteerV2CheckInScreen(navController, repo) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VolunteerV2HomeScreen(nav: NavHostController, repo: RetreatV7Repository) {
    val myIds by repo.myShiftIds.collectAsState()
    val dayNum = repo.currentDayNumber()
    val weekday = repo.data.shifts.firstOrNull { it.dayNumber == dayNum }?.weekday ?: ""
    val name = FirebaseAuth.getInstance().currentUser?.displayName ?: "Volunteer"
    val next = repo.nextAssignment()

    Scaffold(
        topBar = { TopAppBar(title = { Text(repo.data.retreatName, fontSize = 17.sp) }) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(SectionGap),
        ) {
            Text(name, style = MaterialTheme.typography.titleMedium, fontSize = 17.sp)
            if (dayNum != null) {
                Text("Retreat day ${repo.dayLabel(dayNum, weekday)}", fontSize = CompactBody)
            } else {
                Text("Before retreat", fontSize = CompactBody)
            }
            Text("${myIds.size} assignment(s)", fontSize = CompactBody)
            if (next != null) {
                Text(
                    "Next: ${VolunteerV2Format.shiftLine(next)}",
                    fontSize = CompactBody,
                )
            } else {
                Text("No upcoming assignments", fontSize = CompactBody)
            }
            Spacer(Modifier.height(4.dp))
            V2ActionButton("Sign up for shifts", SignupBlue) { nav.navigate("v2search") }
            V2ActionButton("My assignments", SignupsRed) { nav.navigate("v2mine") }
            V2ActionButton("Check in", CheckinGreen) { nav.navigate("v2checkin") }
        }
    }
}

@Composable
private fun V2ActionButton(label: String, color: Color, onClick: () -> Unit) {
    Text(
        label,
        modifier = Modifier
            .fillMaxWidth()
            .background(color)
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp, horizontal = 12.dp),
        fontSize = CompactBody,
    )
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun VolunteerV2SearchScreen(nav: NavHostController, repo: RetreatV7Repository) {
    var selectedDays by remember { mutableStateOf(repo.searchableDays().toSet()) }
    var selectedJobId by remember { mutableStateOf<String?>(null) }
    val jobs = remember { repo.data.jobs.sortedBy { it.title } }
    val searchable = remember { repo.searchableDays() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Search shifts", fontSize = 16.sp) },
                navigationIcon = { TextButton(onClick = { nav.popBackStack() }) { Text("Back", fontSize = CompactLabel) } },
            )
        },
        containerColor = SignupBlue,
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 12.dp, vertical = 8.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(SectionGap),
        ) {
            Text("Days from today", fontSize = CompactLabel)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                searchable.forEach { day ->
                    val sample = repo.data.shifts.first { it.dayNumber == day }
                    val label = "${day}${sample.weekday.take(1)}"
                    FilterChip(
                        selected = day in selectedDays,
                        onClick = {
                            selectedDays =
                                if (day in selectedDays) selectedDays - day else selectedDays + day
                        },
                        label = { Text(label, fontSize = CompactLabel) },
                    )
                }
            }
            Text("Job (optional)", fontSize = CompactLabel)
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { selectedJobId = null }) {
                RadioButton(selected = selectedJobId == null, onClick = { selectedJobId = null })
                Text("Any job", fontSize = CompactBody, modifier = Modifier.padding(start = 4.dp))
            }
            jobs.forEach { job ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { selectedJobId = job.id },
                ) {
                    RadioButton(selected = selectedJobId == job.id, onClick = { selectedJobId = job.id })
                    Text(job.title, fontSize = CompactBody, modifier = Modifier.padding(start = 4.dp))
                }
            }
            Button(
                onClick = {
                    VolunteerV2SearchState.selectedDays = selectedDays
                    VolunteerV2SearchState.selectedJobId = selectedJobId
                    nav.navigate("v2available")
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = selectedDays.isNotEmpty(),
            ) {
                Text("Search", fontSize = CompactBody)
            }
        }
    }
}

object VolunteerV2SearchState {
    var selectedDays: Set<Int> = emptySet()
    var selectedJobId: String? = null
}

@Composable
private fun DaySectionHeader(dayNumber: Int) {
    Spacer(Modifier.height(10.dp))
    Text(
        VolunteerV2Format.dayHeader(dayNumber),
        fontSize = CompactLabel,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(2.dp))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VolunteerV2AvailableScreen(nav: NavHostController, repo: RetreatV7Repository) {
    val results =
        remember(VolunteerV2SearchState.selectedDays, VolunteerV2SearchState.selectedJobId) {
            repo.searchShifts(VolunteerV2SearchState.selectedDays, VolunteerV2SearchState.selectedJobId)
        }
    val grouped = remember(results) { VolunteerV2Format.groupByDay(results) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Available shifts", fontSize = 16.sp) },
                navigationIcon = {
                    TextButton(onClick = { nav.popBackStack("v2home", false) }) {
                        Text("Cancel", fontSize = CompactLabel)
                    }
                },
            )
        },
        containerColor = SignupBlue,
    ) { padding ->
        if (results.isEmpty()) {
            Column(
                Modifier.fillMaxSize().padding(padding).padding(12.dp),
                verticalArrangement = Arrangement.Center,
            ) {
                Text("No open shifts match your search.", fontSize = CompactBody)
            }
        } else {
            LazyColumn(
                Modifier.fillMaxSize().padding(padding).padding(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                grouped.forEach { (day, shifts) ->
                    item(key = "hdr-$day") { DaySectionHeader(day) }
                    items(shifts, key = { it.id }) { shift ->
                        Text(
                            VolunteerV2Format.shiftLine(shift),
                            fontSize = CompactBody,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { nav.navigate("v2shift/${shift.id}") }
                                .padding(vertical = RowPadV),
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VolunteerV2ShiftScreen(
    nav: NavHostController,
    repo: RetreatV7Repository,
    shiftId: String,
) {
    val shift = repo.shiftById(shiftId) ?: return
    val job = repo.jobForShift(shift)
    val myIds by repo.myShiftIds.collectAsState()
    val assigned = shiftId in myIds
    var dialog by remember { mutableStateOf<String?>(null) }
    var showDropWarning by remember { mutableStateOf(false) }

    if (dialog != null) {
        AlertDialog(
            onDismissRequest = { dialog = null },
            confirmButton = { TextButton(onClick = { dialog = null }) { Text("OK") } },
            text = { Text(dialog!!, fontSize = CompactBody) },
        )
    }
    if (showDropWarning) {
        AlertDialog(
            onDismissRequest = { showDropWarning = false },
            title = { Text("Short notice", fontSize = CompactBody) },
            text = {
                Text(
                    "This assignment is today or tomorrow. Please recruit someone else if you can.",
                    fontSize = CompactBody,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showDropWarning = false
                    repo.unassign(shiftId)
                    dialog = "Assignment removed"
                }) { Text("Remove anyway") }
            },
            dismissButton = { TextButton(onClick = { showDropWarning = false }) { Text("Keep") } },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Shift", fontSize = 16.sp) },
                navigationIcon = { TextButton(onClick = { nav.popBackStack() }) { Text("Back", fontSize = CompactLabel) } },
            )
        },
        containerColor = SignupBlue,
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 12.dp, vertical = 8.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                "${VolunteerV2Format.dayHeader(shift.dayNumber)} · ~${shift.estimatedMinutes} min",
                fontSize = CompactBody,
            )
            Text(VolunteerV2Format.shiftLine(shift), fontSize = CompactBody)
            Text(VolunteerV2Format.slotTimingText(shift.slot), fontSize = CompactBody)
            Spacer(Modifier.height(4.dp))
            val steps = job?.instructions?.filter { !it.isNullOrBlank() }.orEmpty()
            if (steps.isEmpty()) {
                Text("(No instructions listed)", fontSize = CompactLabel, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                steps.forEach { step ->
                    Text("• $step", fontSize = CompactBody, modifier = Modifier.padding(vertical = 1.dp))
                }
            }
            Spacer(Modifier.height(8.dp))
            if (assigned) {
                OutlinedButton(
                    onClick = {
                        val day = repo.currentDayNumber()
                        if (day != null && shift.dayNumber <= day + 1) {
                            showDropWarning = true
                        } else {
                            repo.unassign(shiftId)
                            dialog = "Assignment removed"
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Remove assignment", fontSize = CompactBody)
                }
            } else {
                Button(
                    onClick = {
                        if (repo.assignToMe(shiftId)) {
                            dialog = "Assigned"
                        } else {
                            dialog = "NOT assigned — someone else may have taken it"
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Assign to me", fontSize = CompactBody)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VolunteerV2MyAssignmentsScreen(nav: NavHostController, repo: RetreatV7Repository) {
    val myIds by repo.myShiftIds.collectAsState()
    val mine = remember(myIds) { repo.myShiftsFromToday() }
    val grouped = remember(mine) { VolunteerV2Format.groupByDay(mine) }
    var markedForDelete by remember { mutableStateOf(setOf<String>()) }

    fun toggleMark(id: String) {
        markedForDelete =
            if (id in markedForDelete) markedForDelete - id else markedForDelete + id
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My assignments", fontSize = 16.sp) },
                navigationIcon = { TextButton(onClick = { nav.popBackStack() }) { Text("Back", fontSize = CompactLabel) } },
            )
        },
        containerColor = SignupsRed,
        bottomBar = {
            if (markedForDelete.isNotEmpty()) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(SignupsRed)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(
                        onClick = { markedForDelete = emptySet() },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Don't delete", fontSize = CompactLabel)
                    }
                    Button(
                        onClick = {
                            markedForDelete.forEach { repo.unassign(it) }
                            markedForDelete = emptySet()
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Delete marked", fontSize = CompactLabel)
                    }
                }
            }
        },
    ) { padding ->
        if (mine.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(padding).padding(12.dp)) {
                Text("No assignments from today onward.", fontSize = CompactBody)
                Spacer(Modifier.height(12.dp))
                Button(onClick = { nav.navigate("v2search") }) {
                    Text("Sign up for shifts", fontSize = CompactBody)
                }
            }
        } else {
            Column(Modifier.fillMaxSize().padding(padding)) {
                Text(
                    "Check to mark for removal, then Delete marked.",
                    fontSize = CompactLabel,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                )
                LazyColumn(
                    Modifier.fillMaxSize().padding(horizontal = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(0.dp),
                ) {
                    grouped.forEach { (day, shifts) ->
                        item(key = "hdr-$day") { DaySectionHeader(day) }
                        items(shifts, key = { it.id }) { shift ->
                            val marked = shift.id in markedForDelete
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .clickable { toggleMark(shift.id) }
                                    .alpha(if (marked) 0.55f else 1f)
                                    .padding(vertical = RowPadV),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Checkbox(
                                    checked = marked,
                                    onCheckedChange = { toggleMark(shift.id) },
                                )
                                Text(
                                    VolunteerV2Format.shiftLine(shift),
                                    fontSize = CompactBody,
                                    textDecoration = if (marked) TextDecoration.LineThrough else TextDecoration.None,
                                    modifier = Modifier.padding(start = 4.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VolunteerV2CheckInScreen(nav: NavHostController, repo: RetreatV7Repository) {
    val myIds by repo.myShiftIds.collectAsState()
    val todayShifts = remember(myIds) { repo.todaysMyShifts() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Check in", fontSize = 16.sp) },
                navigationIcon = { TextButton(onClick = { nav.popBackStack() }) { Text("Back", fontSize = CompactLabel) } },
            )
        },
        containerColor = CheckinGreen,
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(SectionGap),
        ) {
            if (todayShifts.isEmpty()) {
                Text("No assignments for today.", fontSize = CompactBody)
            } else {
                todayShifts.forEach { shift ->
                    Text(
                        VolunteerV2Format.shiftLine(shift),
                        fontSize = CompactBody,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { nav.navigate("v2shift/${shift.id}") }
                            .padding(vertical = RowPadV),
                    )
                }
            }
        }
    }
}
