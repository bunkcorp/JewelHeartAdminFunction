package org.jewelheart.admin

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
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
        composable("rschedmatrix/{rid}", arguments = listOf(navArgument("rid") { type = NavType.StringType })) { e ->
            ScheduleMatrixScreen(navController, e.arguments!!.getString("rid")!!)
        }
        composable(
            "rtaskdetail/{rid}/{tid}",
            arguments = listOf(
                navArgument("rid") { type = NavType.StringType },
                navArgument("tid") { type = NavType.StringType },
            ),
        ) { entry ->
            TaskDetailScreen(
                navController,
                retreatId = entry.arguments!!.getString("rid")!!,
                taskId = entry.arguments!!.getString("tid")!!,
            )
        }
        composable(
            "rslotdetail/{rid}/{sid}",
            arguments = listOf(
                navArgument("rid") { type = NavType.StringType },
                navArgument("sid") { type = NavType.StringType },
            ),
        ) { entry ->
            SlotDetailScreen(
                navController,
                retreatId = entry.arguments!!.getString("rid")!!,
                slotId = entry.arguments!!.getString("sid")!!,
            )
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
                                Text(r.status.name, style = MaterialTheme.typography.bodySmall)
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
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                repo.createRetreat(
                                    RetreatCreate(name = name.trim(), timezone = JewelHeartConfig.jewelheartDefaultTimeZoneId),
                                )
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
                Spacer(Modifier.height(8.dp))
                NavButton("Jobs") { nav.navigate("rjobs/$retreatId") }
                NavButton("Slots") { nav.navigate("rslots/$retreatId") }
                NavButton("Tasks") { nav.navigate("rtasks/$retreatId") }
                NavButton("Linked volunteers") { nav.navigate("rvols/$retreatId") }
                NavButton("Schedule (by day)") { nav.navigate("rsched/$retreatId") }
                NavButton("Schedule matrix (slot × day)") { nav.navigate("rschedmatrix/$retreatId") }
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

private fun jhTaskListTitle(
    t: JHTask,
    jobTitleById: Map<String, String> = emptyMap(),
    slotLabelById: Map<String, String> = emptyMap(),
): String {
    val jFromTask = t.jobTitle?.trim().orEmpty()
    val sFromTask = t.slotLabel?.trim().orEmpty()
    val jFromLookup = jobTitleById[t.jobId]?.trim().orEmpty()
    val sFromLookup = slotLabelById[t.slotId]?.trim().orEmpty()
    val j = if (jFromTask.isNotEmpty()) jFromTask else jFromLookup
    val s = if (sFromTask.isNotEmpty()) sFromTask else sFromLookup
    val primary =
        when {
            j.isNotEmpty() && s.isNotEmpty() -> "$j — $s"
            j.isNotEmpty() -> j
            s.isNotEmpty() -> s
            else -> {
                val n = t.notes?.trim().orEmpty()
                if (n.isNotEmpty()) {
                    if (n.length > 56) n.take(56) + "…" else n
                } else {
                    "Volunteer task"
                }
            }
        }
    val ctx = t.slotActivityContext?.trim().orEmpty()
    if (ctx.isNotEmpty() && !primary.contains(ctx, ignoreCase = true)) {
        return "$primary · $ctx"
    }
    return primary
}

private fun jhTaskListSubtitle(t: JHTask): String? {
    val needed = t.volunteersNeeded ?: return null
    val c = t.assignmentCount ?: 0
    return "$c of $needed volunteer spots filled"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TasksScreen(nav: NavHostController, retreatId: String) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<JHTask>>(emptyList()) }
    var jobTitleById by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var slotLabelById by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var err by remember { mutableStateOf<String?>(null) }
    var showAdd by remember { mutableStateOf(false) }
    var jobId by remember { mutableStateOf("") }
    var slotId by remember { mutableStateOf("") }

    fun load() {
        scope.launch {
            try {
                coroutineScope {
                    val tasksDef = async { repo.listTasks(retreatId) }
                    val jobsDef = async { runCatching { repo.listJobs(retreatId) }.getOrNull() }
                    val slotsDef = async { runCatching { repo.listSlots(retreatId) }.getOrNull() }
                    items = tasksDef.await().items
                    jobTitleById = jobsDef.await()?.items?.associate { it.id to it.title } ?: emptyMap()
                    slotLabelById = slotsDef.await()?.items?.associate { it.id to it.label } ?: emptyMap()
                }
                err = null
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
                            Text(jhTaskListTitle(t, jobTitleById, slotLabelById), style = MaterialTheme.typography.titleSmall)
                            jhTaskListSubtitle(t)?.let { sub ->
                                Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            if (t.isUnderassigned == true) {
                                Text(
                                    "Still needs volunteers",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color(0xFFE65100),
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
                OutlinedTextField(value = linkId, onValueChange = { linkId = it }, label = { Text("Volunteer to link") }, modifier = Modifier.weight(1f))
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
    var suggestedDates by remember { mutableStateOf<List<String>>(emptyList()) }

    fun loadDay() {
        scope.launch {
            try {
                sched = repo.getScheduleByDay(retreatId, dateStr.trim())
                err = null
            } catch (e: Exception) {
                err = e.message
                sched = null
            }
        }
    }

    LaunchedEffect(retreatId) {
        try {
            suggestedDates = repo.listSlots(retreatId).items.map { it.slotDate }.distinct().sorted()
        } catch (_: Exception) {
            suggestedDates = emptyList()
        }
    }

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
            if (suggestedDates.isNotEmpty()) {
                Text("Days with slots", style = MaterialTheme.typography.labelMedium)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
                    suggestedDates.forEach { d ->
                        TextButton(
                            onClick = {
                                dateStr = d
                                loadDay()
                            },
                        ) { Text(d) }
                    }
                }
            }
            OutlinedTextField(value = dateStr, onValueChange = { dateStr = it }, label = { Text("Date yyyy-MM-dd") }, modifier = Modifier.fillMaxWidth())
            Button(onClick = { loadDay() }) { Text("Load day") }
            err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            sched?.let { s ->
                val volMin = s.items.sumOf { it.job.volunteersNeeded * it.job.estimatedMinutes }
                Text("${s.items.size} task(s) · ~$volMin volunteer-minutes", style = MaterialTheme.typography.titleSmall)
                LazyColumn {
                    items(s.items) { row ->
                        Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Column(Modifier.padding(8.dp)) {
                                Text(row.job.title, style = MaterialTheme.typography.titleSmall)
                                Text(
                                    "${row.slot.label} · ${row.slot.slotDate} · ${row.job.volunteersNeeded}v × ${row.job.estimatedMinutes}m",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                val ac = row.task.assignmentCount ?: 0
                                val need = row.task.volunteersNeeded ?: row.job.volunteersNeeded
                                Text("Assigned $ac / $need", style = MaterialTheme.typography.labelSmall)
                                row.assignments?.takeIf { it.isNotEmpty() }?.let { assigns ->
                                    val line =
                                        assigns.mapNotNull { it.volunteer?.displayName?.takeIf { n -> n.isNotBlank() } }.joinToString(", ")
                                    if (line.isNotEmpty()) {
                                        Text(line, style = MaterialTheme.typography.bodySmall)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private data class ScheduleMatrixRowDef(
    val id: String,
    val label: String,
    val timeBand: TimeBand,
    val sortDate: String,
)

private data class ScheduleMatrixCellPick(
    val slot: Slot,
    val tasks: List<JHTask>,
    val jobTitleByJobId: Map<String, String>,
)

private fun matrixColumnHeader(iso: String): String =
    try {
        val d = java.time.LocalDate.parse(iso)
        d.format(java.time.format.DateTimeFormatter.ofPattern("EEE M/d", java.util.Locale.getDefault()))
    } catch (_: Exception) {
        iso
    }

private fun slotAt(slots: List<Slot>, row: ScheduleMatrixRowDef, date: String): Slot? =
    slots.firstOrNull { it.label == row.label && it.timeBand == row.timeBand && it.slotDate == date }

private fun matrixCellSummary(tasks: List<JHTask>, jobTitleByJobId: Map<String, String>): String =
    when {
        tasks.isEmpty() -> "No tasks yet\nTap for slot"
        else ->
            tasks.take(3).joinToString("\n") { t ->
                jobTitleByJobId[t.jobId] ?: t.jobTitle ?: "Task"
            } + if (tasks.size > 3) "\n+${tasks.size - 3} more" else ""
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ScheduleMatrixScreen(nav: NavHostController, retreatId: String) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var dates by remember { mutableStateOf<List<String>>(emptyList()) }
    var rows by remember { mutableStateOf<List<ScheduleMatrixRowDef>>(emptyList()) }
    var slots by remember { mutableStateOf<List<Slot>>(emptyList()) }
    var tasks by remember { mutableStateOf<List<JHTask>>(emptyList()) }
    var jobTitleByJobId by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var err by remember { mutableStateOf<String?>(null) }
    var pick by remember { mutableStateOf<ScheduleMatrixCellPick?>(null) }
    val hScroll = rememberScrollState()
    val vScroll = rememberScrollState()

    fun load() {
        scope.launch {
            try {
                coroutineScope {
                    val sl = async { repo.listSlots(retreatId) }
                    val tk = async { repo.listTasks(retreatId) }
                    val jb = async { repo.listJobs(retreatId) }
                    val slotItems = sl.await().items
                    val taskItems = tk.await().items
                    val jm = jb.await().items.associate { it.id to it.title }
                    val dateCols = slotItems.map { it.slotDate }.distinct().sorted()
                    val grouped = slotItems.groupBy { "${it.label}|${it.timeBand.name}" }
                    val rowModels = grouped.values.mapNotNull { group ->
                        val any = group.firstOrNull() ?: return@mapNotNull null
                        val minD = group.minOfOrNull { it.slotDate } ?: any.slotDate
                        ScheduleMatrixRowDef(
                            id = "${any.label}|${any.timeBand.name}",
                            label = any.label,
                            timeBand = any.timeBand,
                            sortDate = minD,
                        )
                    }.sortedWith { a, b ->
                        when {
                            a.sortDate != b.sortDate -> a.sortDate.compareTo(b.sortDate)
                            else -> {
                                val ia = TimeBand.entries.indexOf(a.timeBand)
                                val ib = TimeBand.entries.indexOf(b.timeBand)
                                when {
                                    ia != ib -> ia.compareTo(ib)
                                    else -> a.label.compareTo(b.label, ignoreCase = true)
                                }
                            }
                        }
                    }
                    dates = dateCols
                    rows = rowModels
                    slots = slotItems
                    tasks = taskItems
                    jobTitleByJobId = jm
                }
                err = null
            } catch (e: Exception) {
                err = e.message
            }
        }
    }

    LaunchedEffect(retreatId) { load() }

    pick?.let { p ->
        AlertDialog(
            onDismissRequest = { pick = null },
            title = { Text(p.slot.label) },
            text = {
                Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState())) {
                    Text("${p.slot.slotDate} · ${p.slot.timeBand.name}", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    if (p.tasks.isEmpty()) {
                        Text("No tasks for this slot yet.", style = MaterialTheme.typography.bodyMedium)
                    } else {
                        p.tasks.forEach { t ->
                            val title = p.jobTitleByJobId[t.jobId] ?: t.jobTitle ?: "Task"
                            TextButton(
                                onClick = {
                                    pick = null
                                    nav.navigate("rtaskdetail/$retreatId/${t.id}")
                                },
                            ) { Text(title, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    TextButton(
                        onClick = {
                            pick = null
                            nav.navigate("rslotdetail/$retreatId/${p.slot.id}")
                        },
                    ) { Text("Open slot details") }
                }
            },
            confirmButton = {
                TextButton(onClick = { pick = null }) { Text("Close") }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Slot × day") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    TextButton(onClick = { load() }) { Text("Reload") }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(vScroll),
        ) {
            err?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp)) }
            when {
                err != null -> {}
                dates.isEmpty() -> {
                    Text(
                        "No slots yet. Add slots for this retreat, then tasks.",
                        modifier = Modifier.padding(16.dp),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
                else -> {
                    Column(Modifier.horizontalScroll(hScroll)) {
                        Row(Modifier.height(IntrinsicSize.Min)) {
                            Column(
                                Modifier
                                    .width(160.dp)
                                    .background(MaterialTheme.colorScheme.surfaceContainerHigh),
                            ) {
                                Text(
                                    "Slot / time",
                                    style = MaterialTheme.typography.labelLarge,
                                    modifier = Modifier.padding(10.dp),
                                )
                                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f))
                                rows.forEachIndexed { index, row ->
                                    Column(
                                        Modifier
                                            .fillMaxWidth()
                                            .background(
                                                if (index % 2 == 0) {
                                                    MaterialTheme.colorScheme.surface
                                                } else {
                                                    MaterialTheme.colorScheme.surfaceContainerLow
                                                },
                                            )
                                            .padding(10.dp),
                                    ) {
                                        Text(row.label, style = MaterialTheme.typography.bodySmall, maxLines = 3, overflow = TextOverflow.Ellipsis)
                                        Text(
                                            row.timeBand.name,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
                                }
                            }
                            VerticalDivider(Modifier.fillMaxHeight(), thickness = 1.dp, color = MaterialTheme.colorScheme.outline.copy(alpha = 0.45f))
                            dates.forEachIndexed { dateIndex, date ->
                                Column(Modifier.width(112.dp)) {
                                    Text(
                                        matrixColumnHeader(date),
                                        style = MaterialTheme.typography.labelLarge,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                                            .padding(10.dp),
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f))
                                    rows.forEachIndexed { index, row ->
                                        val slot = slotAt(slots, row, date)
                                        val cellTasks = if (slot != null) tasks.filter { it.slotId == slot.id } else emptyList()
                                        val stripe = if (index % 2 == 0) {
                                            MaterialTheme.colorScheme.surface
                                        } else {
                                            MaterialTheme.colorScheme.surfaceContainerLow
                                        }
                                        Box(
                                            Modifier
                                                .fillMaxWidth()
                                                .background(stripe)
                                                .padding(6.dp),
                                        ) {
                                            if (slot != null) {
                                                Card(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .clickable {
                                                            pick = ScheduleMatrixCellPick(slot, cellTasks, jobTitleByJobId)
                                                        },
                                                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                                                    border = BorderStroke(
                                                        1.dp,
                                                        MaterialTheme.colorScheme.outline.copy(alpha = 0.5f),
                                                    ),
                                                ) {
                                                    Row(
                                                        Modifier.padding(10.dp),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                    ) {
                                                        Text(
                                                            matrixCellSummary(cellTasks, jobTitleByJobId),
                                                            style = MaterialTheme.typography.labelSmall,
                                                            modifier = Modifier.weight(1f),
                                                            maxLines = 6,
                                                            overflow = TextOverflow.Ellipsis,
                                                        )
                                                        Text("›", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.outline)
                                                    }
                                                }
                                            } else {
                                                Card(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceDim.copy(alpha = 0.35f)),
                                                    border = BorderStroke(
                                                        1.dp,
                                                        MaterialTheme.colorScheme.outline.copy(alpha = 0.35f),
                                                    ),
                                                ) {
                                                    Text(
                                                        "—",
                                                        modifier = Modifier.padding(12.dp),
                                                        style = MaterialTheme.typography.bodyMedium,
                                                        color = MaterialTheme.colorScheme.outline,
                                                    )
                                                }
                                            }
                                        }
                                        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f))
                                    }
                                }
                                if (dateIndex < dates.lastIndex) {
                                    VerticalDivider(
                                        Modifier.fillMaxHeight(),
                                        thickness = 1.dp,
                                        color = MaterialTheme.colorScheme.outline.copy(alpha = 0.45f),
                                    )
                                }
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
private fun TaskDetailScreen(nav: NavHostController, retreatId: String, taskId: String) {
    val repo = remember { JewelHeartRepository() }
    var detail by remember { mutableStateOf<JHTaskDetail?>(null) }
    var err by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(retreatId, taskId) {
        try {
            detail = repo.getTask(retreatId, taskId)
            err = null
        } catch (e: Exception) {
            err = e.message
            detail = null
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Task") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            detail?.let { d ->
                Text(d.job?.title ?: d.jobTitle ?: "Job", style = MaterialTheme.typography.titleLarge)
                Text(
                    listOfNotNull(d.slot?.label ?: d.slotLabel, d.slot?.slotDate).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                (d.slot?.activityContext ?: d.slotActivityContext)?.takeIf { it.isNotBlank() }?.let { ctx ->
                    Text("Site / context: $ctx", style = MaterialTheme.typography.bodySmall)
                }
                val need = d.volunteersNeeded ?: d.job?.volunteersNeeded
                val ac = d.assignmentCount ?: 0
                Text("Assigned $ac / ${need ?: "?"}", style = MaterialTheme.typography.titleSmall)
                d.notes?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                d.assignments?.takeIf { it.isNotEmpty() }?.let { list ->
                    Text("Volunteers", style = MaterialTheme.typography.labelLarge)
                    list.forEach { a ->
                        Text(
                            a.volunteer?.displayName?.takeIf { it.isNotBlank() } ?: "Unnamed volunteer",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SlotDetailScreen(nav: NavHostController, retreatId: String, slotId: String) {
    val repo = remember { JewelHeartRepository() }
    var slot by remember { mutableStateOf<Slot?>(null) }
    var err by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(retreatId, slotId) {
        try {
            slot = repo.getSlot(retreatId, slotId)
            err = null
        } catch (e: Exception) {
            err = e.message
            slot = null
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(slot?.label ?: "Slot") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            slot?.let { s ->
                Text("Date: ${s.slotDate}", style = MaterialTheme.typography.bodyLarge)
                Text("Time band: ${s.timeBand.name}", style = MaterialTheme.typography.bodyMedium)
                s.dayOfWeek?.takeIf { it.isNotBlank() }?.let { Text("Day of week: $it") }
                s.activityContext?.takeIf { it.isNotBlank() }?.let { Text("Context: $it") }
                Text("id: ${s.id}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
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
