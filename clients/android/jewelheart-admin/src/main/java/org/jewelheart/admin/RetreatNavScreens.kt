package org.jewelheart.admin

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** One subjob per non-empty line (matches OpenAPI JobCreate / JobPatch). */
private fun parseSubjobLines(raw: String): List<String> =
    raw.split("\n").map { it.trim() }.filter { it.isNotEmpty() }

@Composable
fun RetreatNavHost(navController: NavHostController) {
    NavHost(navController = navController, startDestination = "rlist", modifier = Modifier.fillMaxSize()) {
        composable("rlist") { RetreatListScreen(navController) }
        composable(
            "rdetail/{rid}",
            arguments = listOf(navArgument("rid") { type = NavType.StringType }),
        ) { entry ->
            RetreatDetailScreen(navController, retreatId = entry.arguments!!.getString("rid")!!)
        }
        composable("rjobs/{rid}", arguments = listOf(navArgument("rid") { type = NavType.StringType })) { e ->
            JobsScreen(navController, e.arguments!!.getString("rid")!!)
        }
        composable("rslots/{rid}", arguments = listOf(navArgument("rid") { type = NavType.StringType })) { e ->
            SlotsScreen(navController, e.arguments!!.getString("rid")!!)
        }
        composable("rtasks/{rid}", arguments = listOf(navArgument("rid") { type = NavType.StringType })) { e ->
            TasksScreen(navController, e.arguments!!.getString("rid")!!)
        }
        composable("rvols/{rid}", arguments = listOf(navArgument("rid") { type = NavType.StringType })) { e ->
            RetreatVolunteersScreen(navController, e.arguments!!.getString("rid")!!)
        }
        composable("rsched/{rid}", arguments = listOf(navArgument("rid") { type = NavType.StringType })) { e ->
            ScheduleScreen(navController, e.arguments!!.getString("rid")!!)
        }
        composable("rreports/{rid}", arguments = listOf(navArgument("rid") { type = NavType.StringType })) { e ->
            ReportsScreen(navController, e.arguments!!.getString("rid")!!)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RetreatListScreen(nav: NavHostController) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<Retreat>>(emptyList()) }
    var err by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var showCreate by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var tz by remember { mutableStateOf("America/New_York") }

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
        topBar = { TopAppBar(title = { Text("Retreats") }) },
        floatingActionButton = {
            FloatingActionButton(onClick = { showCreate = true }) { Text("+") }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = 8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = { load() }) { Text("Reload") }
            }
            when {
                loading -> CircularProgressIndicator()
                err != null -> Text(err!!, color = MaterialTheme.colorScheme.error)
                else -> LazyColumn {
                    items(items, key = { it.id }) { r ->
                        Card(
                            Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .clickable { nav.navigate("rdetail/${r.id}") },
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

    if (showCreate) {
        AlertDialog(
            onDismissRequest = { showCreate = false },
            title = { Text("New retreat") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = tz, onValueChange = { tz = it }, label = { Text("IANA timezone") }, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                repo.createRetreat(RetreatCreate(name = name.trim(), timezone = tz.trim()))
                                showCreate = false
                                name = ""
                                load()
                            } catch (e: Exception) {
                                err = e.message
                            }
                        }
                    },
                    enabled = name.isNotBlank(),
                ) { Text("Create") }
            },
            dismissButton = { TextButton(onClick = { showCreate = false }) { Text("Cancel") } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RetreatDetailScreen(nav: NavHostController, retreatId: String) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var retreat by remember { mutableStateOf<Retreat?>(null) }
    var err by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(retreatId) {
        try {
            retreat = repo.getRetreat(retreatId)
        } catch (e: Exception) {
            err = e.message
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(retreat?.name ?: "Retreat") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            retreat?.let { r ->
                Text("Status: ${r.status.name}")
                Text("Timezone: ${r.timezone}")
                Spacer(Modifier.height(8.dp))
                NavButton("Jobs") { nav.navigate("rjobs/$retreatId") }
                NavButton("Slots") { nav.navigate("rslots/$retreatId") }
                NavButton("Tasks") { nav.navigate("rtasks/$retreatId") }
                NavButton("Linked volunteers") { nav.navigate("rvols/$retreatId") }
                NavButton("Schedule (by day)") { nav.navigate("rsched/$retreatId") }
                NavButton("Reports (PDF/CSV)") { nav.navigate("rreports/$retreatId") }
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = {
                        scope.launch {
                            try {
                                repo.deleteRetreat(retreatId)
                                nav.popBackStack("rlist", inclusive = false)
                            } catch (e: Exception) {
                                err = e.message
                            }
                        }
                    },
                ) { Text("Delete retreat") }
            }
        }
    }
}

@Composable
private fun NavButton(label: String, onClick: () -> Unit) {
    Button(onClick = onClick, modifier = Modifier.fillMaxWidth()) { Text(label) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun JobsScreen(nav: NavHostController, retreatId: String) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<Job>>(emptyList()) }
    var err by remember { mutableStateOf<String?>(null) }
    var showAdd by remember { mutableStateOf(false) }
    var title by remember { mutableStateOf("") }
    var vn by remember { mutableStateOf("1") }
    var em by remember { mutableStateOf("30") }
    var subjobLinesCreate by remember { mutableStateOf("") }
    var editingJob by remember { mutableStateOf<Job?>(null) }

    fun load() {
        scope.launch {
            try {
                items = repo.listJobs(retreatId).items
            } catch (e: Exception) {
                err = e.message
            }
        }
    }

    LaunchedEffect(retreatId) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Jobs") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
        floatingActionButton = { FloatingActionButton(onClick = { showAdd = true }) { Text("+") } },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            err?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(8.dp)) }
            LazyColumn {
                items(items, key = { it.id }) { j ->
                    Card(
                        Modifier
                            .fillMaxWidth()
                            .padding(8.dp)
                            .clickable { editingJob = j },
                    ) {
                        Column(Modifier.padding(12.dp)) {
                            Text(j.title, style = MaterialTheme.typography.titleSmall)
                            Text("Needed: ${j.volunteersNeeded} · ${j.estimatedMinutes} min")
                            if (j.subjobs.isNotEmpty()) {
                                Text(
                                    "${j.subjobs.size} subjobs · tap to edit",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.secondary,
                                )
                            } else {
                                Text(
                                    "Tap to edit · add subjobs (one per line)",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.secondary,
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAdd) {
        AlertDialog(
            onDismissRequest = { showAdd = false },
            title = { Text("New job") },
            text = {
                Column(
                    Modifier
                        .heightIn(max = 480.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("Title") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = vn, onValueChange = { vn = it }, label = { Text("Volunteers needed") })
                    OutlinedTextField(value = em, onValueChange = { em = it }, label = { Text("Est. minutes") })
                    OutlinedTextField(
                        value = subjobLinesCreate,
                        onValueChange = { subjobLinesCreate = it },
                        label = { Text("Subjobs (one per line, optional)") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3,
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                val lines = parseSubjobLines(subjobLinesCreate)
                                repo.createJob(
                                    retreatId,
                                    JobCreate(
                                        title = title.trim(),
                                        volunteersNeeded = vn.toIntOrNull() ?: 1,
                                        estimatedMinutes = em.toIntOrNull() ?: 0,
                                        subjobs = lines.takeIf { it.isNotEmpty() },
                                    ),
                                )
                                showAdd = false
                                title = ""
                                subjobLinesCreate = ""
                                load()
                            } catch (e: Exception) {
                                err = e.message
                            }
                        }
                    },
                ) { Text("Create") }
            },
            dismissButton = { TextButton(onClick = { showAdd = false }) { Text("Cancel") } },
        )
    }

    editingJob?.let { job ->
        EditJobDialog(
            job = job,
            retreatId = retreatId,
            repo = repo,
            scope = scope,
            onDismiss = { editingJob = null },
            onAfterMutation = { load(); editingJob = null },
            onError = { err = it },
        )
    }
}

@Composable
private fun EditJobDialog(
    job: Job,
    retreatId: String,
    repo: JewelHeartRepository,
    scope: CoroutineScope,
    onDismiss: () -> Unit,
    onAfterMutation: () -> Unit,
    onError: (String?) -> Unit,
) {
    var title by remember(job.id) { mutableStateOf(job.title) }
    var vn by remember(job.id) { mutableStateOf(job.volunteersNeeded.toString()) }
    var em by remember(job.id) { mutableStateOf(job.estimatedMinutes.toString()) }
    var subLines by remember(job.id) { mutableStateOf(job.subjobs.joinToString("\n") { it.text }) }
    var localErr by remember(job.id) { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit job") },
        text = {
            Column(
                Modifier
                    .heightIn(max = 480.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                localErr?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                OutlinedTextField(value = title, onValueChange = { title = it; localErr = null }, label = { Text("Title") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = vn, onValueChange = { vn = it; localErr = null }, label = { Text("Volunteers needed") })
                OutlinedTextField(value = em, onValueChange = { em = it; localErr = null }, label = { Text("Est. minutes") })
                OutlinedTextField(
                    value = subLines,
                    onValueChange = { subLines = it; localErr = null },
                    label = { Text("Subjobs (replace all, one per line)") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 4,
                )
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                repo.deleteJob(retreatId, job.id)
                                onError(null)
                                onAfterMutation()
                            } catch (e: Exception) {
                                localErr = e.message
                                onError(e.message)
                            }
                        }
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text("Delete job") }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    scope.launch {
                        try {
                            val lines = parseSubjobLines(subLines)
                            repo.updateJob(
                                retreatId,
                                job.id,
                                JobPatch(
                                    title = title.trim(),
                                    volunteersNeeded = vn.toIntOrNull() ?: 1,
                                    estimatedMinutes = em.toIntOrNull() ?: 0,
                                    subjobs = lines,
                                ),
                            )
                            onError(null)
                            onAfterMutation()
                        } catch (e: Exception) {
                            localErr = e.message
                            onError(e.message)
                        }
                    }
                },
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SlotsScreen(nav: NavHostController, retreatId: String) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<Slot>>(emptyList()) }
    var err by remember { mutableStateOf<String?>(null) }
    var showAdd by remember { mutableStateOf(false) }
    var label by remember { mutableStateOf("") }
    var dateStr by remember { mutableStateOf(java.time.LocalDate.now().toString()) }
    var band by remember { mutableStateOf(TimeBand.early) }
    var bandMenu by remember { mutableStateOf(false) }

    fun load() {
        scope.launch {
            try {
                items = repo.listSlots(retreatId).items
            } catch (e: Exception) {
                err = e.message
            }
        }
    }

    LaunchedEffect(retreatId) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Slots") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
        floatingActionButton = { FloatingActionButton(onClick = { showAdd = true }) { Text("+") } },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            err?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(8.dp)) }
            LazyColumn {
                items(items, key = { it.id }) { s ->
                    Card(Modifier.fillMaxWidth().padding(8.dp)) {
                        Column(Modifier.padding(12.dp)) {
                            Text(s.label, style = MaterialTheme.typography.titleSmall)
                            Text("${s.slotDate} · ${s.timeBand.name}")
                        }
                    }
                }
            }
        }
    }

    if (showAdd) {
        AlertDialog(
            onDismissRequest = { showAdd = false },
            title = { Text("New slot") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = label, onValueChange = { label = it }, label = { Text("Label") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = dateStr, onValueChange = { dateStr = it }, label = { Text("Date yyyy-MM-dd") })
                    Box {
                        Button(onClick = { bandMenu = true }) { Text("Time band: ${band.name}") }
                        DropdownMenu(expanded = bandMenu, onDismissRequest = { bandMenu = false }) {
                            TimeBand.entries.forEach { b ->
                                DropdownMenuItem(text = { Text(b.name) }, onClick = { band = b; bandMenu = false })
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                repo.createSlot(retreatId, SlotCreate(label = label.trim(), slotDate = dateStr.trim(), timeBand = band))
                                showAdd = false
                                label = ""
                                load()
                            } catch (e: Exception) {
                                err = e.message
                            }
                        }
                    },
                    enabled = label.isNotBlank(),
                ) { Text("Create") }
            },
            dismissButton = { TextButton(onClick = { showAdd = false }) { Text("Cancel") } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TasksScreen(nav: NavHostController, retreatId: String) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<JHTask>>(emptyList()) }
    var err by remember { mutableStateOf<String?>(null) }
    var showAdd by remember { mutableStateOf(false) }
    var jobId by remember { mutableStateOf("") }
    var slotId by remember { mutableStateOf("") }

    fun load() {
        scope.launch {
            try {
                items = repo.listTasks(retreatId).items
            } catch (e: Exception) {
                err = e.message
            }
        }
    }

    LaunchedEffect(retreatId) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Tasks") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
        floatingActionButton = { FloatingActionButton(onClick = { showAdd = true }) { Text("+") } },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            err?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(8.dp)) }
            LazyColumn {
                items(items, key = { it.id }) { t ->
                    Card(Modifier.fillMaxWidth().padding(8.dp)) {
                        Column(Modifier.padding(12.dp)) {
                            Text("Task ${t.id.take(8)}…", style = MaterialTheme.typography.titleSmall)
                            Text("Assignments: ${t.assignmentCount ?: 0} / need ${t.volunteersNeeded ?: "?"}")
                        }
                    }
                }
            }
        }
    }

    if (showAdd) {
        AlertDialog(
            onDismissRequest = { showAdd = false },
            title = { Text("New task") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = jobId, onValueChange = { jobId = it }, label = { Text("Job ID (UUID)") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = slotId, onValueChange = { slotId = it }, label = { Text("Slot ID (UUID)") }, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                repo.createTask(retreatId, JHTaskCreate(jobId = jobId.trim(), slotId = slotId.trim()))
                                showAdd = false
                                jobId = ""
                                slotId = ""
                                load()
                            } catch (e: Exception) {
                                err = e.message
                            }
                        }
                    },
                ) { Text("Create") }
            },
            dismissButton = { TextButton(onClick = { showAdd = false }) { Text("Cancel") } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RetreatVolunteersScreen(nav: NavHostController, retreatId: String) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    var items by remember { mutableStateOf<List<RetreatVolunteer>>(emptyList()) }
    var err by remember { mutableStateOf<String?>(null) }
    var linkId by remember { mutableStateOf("") }
    var importSummary by remember { mutableStateOf<String?>(null) }

    val pickCsv = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            try {
                val bytes = ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes() }
                val res = repo.importRetreatVolunteersCsv(retreatId, bytes)
                importSummary = "created=${res.created} updated=${res.updated} linked=${res.linked} errors=${res.errors.size}"
                items = repo.listRetreatVolunteers(retreatId).items
            } catch (e: Exception) {
                err = e.message
            }
        }
    }

    fun load() {
        scope.launch {
            try {
                items = repo.listRetreatVolunteers(retreatId).items
            } catch (e: Exception) {
                err = e.message
            }
        }
    }

    LaunchedEffect(retreatId) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Retreat volunteers") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            importSummary?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(value = linkId, onValueChange = { linkId = it }, label = { Text("Volunteer UUID") }, modifier = Modifier.weight(1f))
                Button(
                    onClick = {
                        scope.launch {
                            try {
                                repo.linkRetreatVolunteer(retreatId, linkId.trim())
                                linkId = ""
                                load()
                            } catch (e: Exception) {
                                err = e.message
                            }
                        }
                    },
                ) { Text("Link") }
            }
            Button(onClick = { pickCsv.launch("text/*") }, modifier = Modifier.fillMaxWidth()) { Text("Import CSV") }
            LazyColumn {
                items(items, key = { it.volunteerId }) { rv ->
                    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                        Column(Modifier.padding(12.dp)) {
                            Text(rv.volunteer.displayName, style = MaterialTheme.typography.titleSmall)
                            Text(rv.volunteer.email ?: "—", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ScheduleScreen(nav: NavHostController, retreatId: String) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var dateStr by remember { mutableStateOf(java.time.LocalDate.now().toString()) }
    var sched by remember { mutableStateOf<ScheduleDayResponse?>(null) }
    var err by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Schedule") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = dateStr, onValueChange = { dateStr = it }, label = { Text("Date yyyy-MM-dd") }, modifier = Modifier.fillMaxWidth())
            Button(onClick = {
                scope.launch {
                    try {
                        sched = repo.getScheduleByDay(retreatId, dateStr.trim())
                        err = null
                    } catch (e: Exception) {
                        err = e.message
                        sched = null
                    }
                }
            }) { Text("Load day") }
            err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            sched?.let { s ->
                Text("${s.items.size} items", style = MaterialTheme.typography.titleSmall)
                LazyColumn {
                    items(s.items) { row ->
                        Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Column(Modifier.padding(8.dp)) {
                                Text(row.job.title, style = MaterialTheme.typography.titleSmall)
                                Text(row.slot.label + " · " + row.slot.slotDate)
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
private fun ReportsScreen(nav: NavHostController, retreatId: String) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    var dateStr by remember { mutableStateOf(java.time.LocalDate.now().toString()) }
    var err by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Reports") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = dateStr, onValueChange = { dateStr = it }, label = { Text("Date yyyy-MM-dd") }, modifier = Modifier.fillMaxWidth())
            err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                onClick = {
                    scope.launch {
                        try {
                            shareDownload(ctx, repo.getPosterPdf(retreatId, dateStr.trim()))
                        } catch (e: Exception) {
                            err = e.message
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Poster PDF (share)") }
            Button(
                onClick = {
                    scope.launch {
                        try {
                            shareDownload(ctx, repo.getDailyReport(retreatId, dateStr.trim(), DailyReportFormat.pdf))
                        } catch (e: Exception) {
                            err = e.message
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Daily report PDF (share)") }
            Button(
                onClick = {
                    scope.launch {
                        try {
                            shareDownload(ctx, repo.getDailyReport(retreatId, dateStr.trim(), DailyReportFormat.csv))
                        } catch (e: Exception) {
                            err = e.message
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Daily report CSV (share)") }
        }
    }
}

@Composable
fun DirectoryTabContent() {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var q by remember { mutableStateOf("") }
    var items by remember { mutableStateOf<List<Volunteer>>(emptyList()) }
    var err by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Global directory", style = MaterialTheme.typography.titleLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(value = q, onValueChange = { q = it }, label = { Text("Search") }, modifier = Modifier.weight(1f))
            Button(
                onClick = {
                    scope.launch {
                        loading = true
                        err = null
                        try {
                            items = repo.searchVolunteers(q = q.takeIf { it.isNotBlank() }, limit = 100).items
                        } catch (e: Exception) {
                            err = e.message
                        } finally {
                            loading = false
                        }
                    }
                },
            ) { Text("Search") }
        }
        err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (loading) CircularProgressIndicator()
        LazyColumn(Modifier.weight(1f)) {
            items(items, key = { it.id }) { v ->
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text(v.displayName, style = MaterialTheme.typography.titleSmall)
                        Text(v.email ?: "—")
                    }
                }
            }
        }
    }
}

@Composable
fun MetaTabContent() {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    val user = FirebaseAuth.getInstance().currentUser
    var health by remember { mutableStateOf<String?>(null) }
    var actionId by remember { mutableStateOf("refresh") }
    var actionResult by remember { mutableStateOf<String?>(null) }
    var err by remember { mutableStateOf<String?>(null) }

    Column(
        Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Settings", style = MaterialTheme.typography.titleLarge)
        Text("Firebase UID:\n${user?.uid ?: "—"}", style = MaterialTheme.typography.bodySmall)
        Button(
            onClick = {
                scope.launch {
                    try {
                        val h = repo.getHealth()
                        health = "ok=${h.ok} service=${h.service}"
                    } catch (e: Exception) {
                        health = e.message
                    }
                }
            },
        ) { Text("GET /jewelheart/health") }
        health?.let { Text(it) }
        OutlinedTextField(value = actionId, onValueChange = { actionId = it }, label = { Text("SDUI actionId") }, modifier = Modifier.fillMaxWidth())
        Button(
            onClick = {
                scope.launch {
                    try {
                        val r = repo.postSduiAction(actionId.trim())
                        actionResult = listOfNotNull(r.ok?.let { "ok=$it" }, r.message, r.refreshScreenId?.let { "refresh=$it" }).joinToString("\n")
                        err = null
                    } catch (e: Exception) {
                        err = e.message
                        actionResult = null
                    }
                }
            },
        ) { Text("POST /jewelheart/sdui/action") }
        actionResult?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = { FirebaseAuth.getInstance().signOut() },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Sign out") }
    }
}
