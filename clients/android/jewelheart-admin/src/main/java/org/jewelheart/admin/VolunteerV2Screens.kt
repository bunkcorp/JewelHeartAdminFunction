package org.jewelheart.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
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
        composable("v2mine") { VolunteerV2MySignupsScreen(navController, repo) }
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
        topBar = { TopAppBar(title = { Text(repo.data.retreatName, fontSize = 18.sp) }) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            if (dayNum != null) {
                Text("Retreat day ${repo.dayLabel(dayNum, weekday)}", fontSize = 17.sp)
            } else {
                Text("Before retreat", fontSize = 17.sp)
            }
            Text("${myIds.size} task(s) signed up", fontSize = 16.sp)
            if (next != null) {
                Text(
                    "Next: ${next.jobTitle} · day ${next.dayNumber} · ${next.slot}",
                    fontSize = 16.sp,
                )
            } else {
                Text("No upcoming assignments", fontSize = 16.sp)
            }
            Spacer(Modifier.height(8.dp))
            V2ActionButton("Sign up for one or more tasks", SignupBlue) { nav.navigate("v2search") }
            V2ActionButton("See existing signups", SignupsRed) { nav.navigate("v2mine") }
            V2ActionButton("Check in to a task", CheckinGreen) { nav.navigate("v2checkin") }
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
            .padding(vertical = 18.dp, horizontal = 16.dp),
        fontSize = 17.sp,
        fontWeight = FontWeight.Medium,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VolunteerV2SearchScreen(nav: NavHostController, repo: RetreatV7Repository) {
  var selectedDays by remember { mutableStateOf(repo.searchableDays().toSet()) }
  var selectedJobId by remember { mutableStateOf<String?>(null) }
  val jobs = remember { repo.data.jobs.sortedBy { it.title } }

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text("Search for available tasks", fontSize = 17.sp) },
        navigationIcon = { TextButton(onClick = { nav.popBackStack() }) { Text("Back") } },
      )
    },
    containerColor = SignupBlue,
  ) { padding ->
    Column(
      Modifier
        .fillMaxSize()
        .padding(padding)
        .padding(16.dp)
        .verticalScroll(rememberScrollState()),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Text("Days (from today)", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
      repo.searchableDays().forEach { day ->
        val sample = repo.data.shifts.first { it.dayNumber == day }
        Row(verticalAlignment = Alignment.CenterVertically) {
          Checkbox(
            checked = day in selectedDays,
            onCheckedChange = { checked ->
              selectedDays =
                if (checked) selectedDays + day else selectedDays - day
            },
          )
          Text("Day ${repo.dayLabel(day, sample.weekday)}", fontSize = 16.sp)
        }
      }
      Text("Job (optional)", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
      Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = selectedJobId == null, onCheckedChange = { if (it) selectedJobId = null })
        Text("Any job", fontSize = 16.sp)
      }
      jobs.forEach { job ->
        Row(verticalAlignment = Alignment.CenterVertically) {
          Checkbox(
            checked = selectedJobId == job.id,
            onCheckedChange = { checked -> selectedJobId = if (checked) job.id else null },
          )
          Text(job.title, fontSize = 16.sp)
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
        Text("Search", fontSize = 17.sp)
      }
    }
  }
}

object VolunteerV2SearchState {
  var selectedDays: Set<Int> = emptySet()
  var selectedJobId: String? = null
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VolunteerV2AvailableScreen(nav: NavHostController, repo: RetreatV7Repository) {
  val results =
    remember(VolunteerV2SearchState.selectedDays, VolunteerV2SearchState.selectedJobId) {
      repo.searchShifts(VolunteerV2SearchState.selectedDays, VolunteerV2SearchState.selectedJobId)
    }

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text("Available tasks", fontSize = 17.sp) },
        navigationIcon = { TextButton(onClick = { nav.popBackStack("v2home", false) }) { Text("Cancel") } },
      )
    },
    containerColor = SignupBlue,
  ) { padding ->
    if (results.isEmpty()) {
      Column(
        Modifier.fillMaxSize().padding(padding).padding(16.dp),
        verticalArrangement = Arrangement.Center,
      ) {
        Text("No open tasks match your search.", fontSize = 16.sp)
      }
    } else {
      LazyColumn(Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp)) {
        items(results, key = { it.id }) { shift ->
          Column(
            Modifier
              .fillMaxWidth()
              .clickable { nav.navigate("v2shift/${shift.id}") }
              .padding(vertical = 12.dp),
          ) {
            Text(shift.jobTitle, fontWeight = FontWeight.Medium, fontSize = 16.sp)
            Text(
              "Day ${shift.dayNumber} (${shift.weekday}) · ${shift.slot}",
              fontSize = 15.sp,
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
      text = { Text(dialog!!, fontSize = 16.sp) },
    )
  }
  if (showDropWarning) {
    AlertDialog(
      onDismissRequest = { showDropWarning = false },
      title = { Text("Short notice") },
      text = {
        Text(
          "This task is today or tomorrow. Please recruit someone else if you can.",
          fontSize = 16.sp,
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
        title = { Text(shift.jobTitle, fontSize = 17.sp) },
        navigationIcon = { TextButton(onClick = { nav.popBackStack() }) { Text("Back") } },
      )
    },
    containerColor = SignupBlue,
  ) { padding ->
    Column(
      Modifier
        .fillMaxSize()
        .padding(padding)
        .padding(16.dp)
        .verticalScroll(rememberScrollState()),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Text(shift.site, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
      Text(shift.activity, fontSize = 16.sp)
      Text("Day ${repo.dayLabel(shift.dayNumber, shift.weekday)}", fontSize = 16.sp)
      Text("Slot: ${shift.slot}", fontSize = 16.sp)
      Text("About ${shift.estimatedMinutes} min", fontSize = 15.sp)
      Text("Instructions", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
      val steps = job?.instructions?.filter { it.isNotBlank() }.orEmpty()
      if (steps.isEmpty()) {
        Text("(No instructions listed)", fontSize = 15.sp)
      } else {
        steps.forEach { step -> Text("• $step", fontSize = 16.sp) }
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
          Text("Remove my assignment", fontSize = 17.sp)
        }
      } else {
        Button(
          onClick = {
            if (repo.assignToMe(shiftId)) {
              dialog = "Assigned"
            } else {
              dialog = "NOT assigned — looks like someone else just grabbed it (or technical problem?)"
            }
          },
          modifier = Modifier.fillMaxWidth(),
        ) {
          Text("Assign to me", fontSize = 17.sp)
        }
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VolunteerV2MySignupsScreen(nav: NavHostController, repo: RetreatV7Repository) {
  val myIds by repo.myShiftIds.collectAsState()
  val mine = remember(myIds) { repo.myShiftsFromToday() }

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text("My signups", fontSize = 17.sp) },
        navigationIcon = { TextButton(onClick = { nav.popBackStack() }) { Text("Back") } },
      )
    },
    containerColor = SignupsRed,
  ) { padding ->
    if (mine.isEmpty()) {
      Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
        Text("No signups from today onward.", fontSize = 16.sp)
        Spacer(Modifier.height(16.dp))
        Button(onClick = { nav.navigate("v2search") }) { Text("Sign up for another") }
      }
    } else {
      LazyColumn(Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp)) {
        items(mine, key = { it.id }) { shift ->
          Column(
            Modifier
              .fillMaxWidth()
              .clickable { nav.navigate("v2shift/${shift.id}") }
              .padding(vertical = 12.dp),
          ) {
            Text(shift.jobTitle, fontWeight = FontWeight.Medium, fontSize = 16.sp)
            Text("Day ${shift.dayNumber} (${shift.weekday}) · ${shift.slot}", fontSize = 15.sp)
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
        title = { Text("Check in", fontSize = 17.sp) },
        navigationIcon = { TextButton(onClick = { nav.popBackStack() }) { Text("Back") } },
      )
    },
    containerColor = CheckinGreen,
  ) { padding ->
    Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
      if (todayShifts.isEmpty()) {
        Text("No assignments for today.", fontSize = 16.sp)
      } else {
        Text("Today's assignments:", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        Spacer(Modifier.height(8.dp))
        todayShifts.forEach { shift ->
          Button(
            onClick = { nav.navigate("v2shift/${shift.id}") },
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
          ) {
            Text("${shift.jobTitle} · ${shift.slot}", fontSize = 16.sp)
          }
        }
      }
    }
  }
}
