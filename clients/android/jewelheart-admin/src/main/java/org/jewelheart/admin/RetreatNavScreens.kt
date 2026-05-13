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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
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
        composable("rvweek/{rid}", arguments = listOf(navArgument("rid") { type = NavType.StringType })) { e ->
            RetreatVolunteerWeekSignupScreen(
                nav = navController,
                retreatId = e.arguments!!.getString("rid")!!,
            )
        }
        composable("rmessages/{rid}", arguments = listOf(navArgument("rid") { type = NavType.StringType })) { e ->
            val rid = e.arguments!!.getString("rid")!!
            RetreatMessagingListScreen(
                navController,
                retreatId = rid,
                threadRoute = { r, cid -> "rthread/$r/$cid" },
            )
        }
        composable(
            "rthread/{rid}/{cid}",
            arguments = listOf(
                navArgument("rid") { type = NavType.StringType },
                navArgument("cid") { type = NavType.StringType },
            ),
        ) { entry ->
            ConversationThreadScreen(
                navController,
                retreatId = entry.arguments!!.getString("rid")!!,
                conversationId = entry.arguments!!.getString("cid")!!,
            )
        }
        composable(
            "rjobdetail/{rid}/{jid}",
            arguments = listOf(
                navArgument("rid") { type = NavType.StringType },
                navArgument("jid") { type = NavType.StringType },
            ),
        ) { entry ->
            JobDetailScreen(
                navController,
                retreatId = entry.arguments!!.getString("rid")!!,
                jobId = entry.arguments!!.getString("jid")!!,
            )
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
    var showEdit by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var editName by remember { mutableStateOf("") }
    var editStatus by remember { mutableStateOf(RetreatStatus.draft) }
    var editHasStart by remember { mutableStateOf(false) }
    var editHasEnd by remember { mutableStateOf(false) }
    var editStartDate by remember { mutableStateOf("") }
    var editEndDate by remember { mutableStateOf("") }
    var editBusy by remember { mutableStateOf(false) }
    var editErr by remember { mutableStateOf<String?>(null) }

    fun refreshRetreat() {
        scope.launch {
            try {
                retreat = repo.getRetreat(retreatId)
                err = null
            } catch (e: Exception) {
                err = e.message
            }
        }
    }

    LaunchedEffect(retreatId) { refreshRetreat() }

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
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            retreat?.let { r ->
                Text("Status: ${r.status.name}")
                r.startDate?.takeIf { it.isNotBlank() }?.let { Text("Start: $it", style = MaterialTheme.typography.bodyMedium) }
                r.endDate?.takeIf { it.isNotBlank() }?.let { Text("End: $it", style = MaterialTheme.typography.bodyMedium) }
                Text("id: ${r.id}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                Spacer(Modifier.height(8.dp))
                NavButton("Jobs") { nav.navigate("rjobs/$retreatId") }
                NavButton("Slots") { nav.navigate("rslots/$retreatId") }
                NavButton("Tasks") { nav.navigate("rtasks/$retreatId") }
                NavButton("Linked volunteers") { nav.navigate("rvols/$retreatId") }
                NavButton("Schedule (by day)") { nav.navigate("rsched/$retreatId") }
                NavButton("Schedule matrix (slot × day)") { nav.navigate("rschedmatrix/$retreatId") }
                NavButton("Volunteer week (load chart, signup)") { nav.navigate("rvweek/$retreatId") }
                NavButton("Reports (PDF/CSV)") { nav.navigate("rreports/$retreatId") }
                NavButton("Messages") { nav.navigate("rmessages/$retreatId") }
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = {
                        editName = r.name
                        editStatus = r.status
                        editHasStart = !r.startDate.isNullOrBlank()
                        editHasEnd = !r.endDate.isNullOrBlank()
                        editStartDate = r.startDate.orEmpty()
                        editEndDate = r.endDate.orEmpty()
                        editErr = null
                        showEdit = true
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Edit retreat") }
                Button(
                    onClick = { showDeleteConfirm = true },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                ) { Text("Delete retreat") }
            }
        }
    }

    if (showEdit && retreat != null) {
        AlertDialog(
            onDismissRequest = { if (!editBusy) showEdit = false },
            title = { Text("Edit retreat") },
            text = {
                Column(
                    Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = editName,
                        onValueChange = { editName = it },
                        label = { Text("Name") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Text("Status", style = MaterialTheme.typography.labelMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        RetreatStatus.entries.forEach { s ->
                            FilterChip(
                                selected = editStatus == s,
                                onClick = { editStatus = s },
                                label = { Text(s.name) },
                            )
                        }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("Start date")
                        Switch(checked = editHasStart, onCheckedChange = { editHasStart = it })
                    }
                    if (editHasStart) {
                        OutlinedTextField(
                            value = editStartDate,
                            onValueChange = { editStartDate = it },
                            label = { Text("Start yyyy-MM-dd") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("End date")
                        Switch(checked = editHasEnd, onCheckedChange = { editHasEnd = it })
                    }
                    if (editHasEnd) {
                        OutlinedTextField(
                            value = editEndDate,
                            onValueChange = { editEndDate = it },
                            label = { Text("End yyyy-MM-dd") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                    }
                    editErr?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            editBusy = true
                            editErr = null
                            try {
                                val patch = RetreatPatch(
                                    name = editName.trim(),
                                    timezone = JewelHeartConfig.jewelheartDefaultTimeZoneId,
                                    status = editStatus,
                                    startDate = if (editHasStart) editStartDate.trim().ifEmpty { null } else null,
                                    endDate = if (editHasEnd) editEndDate.trim().ifEmpty { null } else null,
                                )
                                retreat = repo.updateRetreat(retreatId, patch)
                                showEdit = false
                            } catch (e: Exception) {
                                editErr = e.message
                            } finally {
                                editBusy = false
                            }
                        }
                    },
                    enabled = !editBusy && editName.isNotBlank(),
                ) { Text("Save") }
            },
            dismissButton = {
                TextButton(onClick = { if (!editBusy) showEdit = false }, enabled = !editBusy) { Text("Cancel") }
            },
        )
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete retreat?") },
            text = { Text("This removes the retreat and nested data. This cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                repo.deleteRetreat(retreatId)
                                showDeleteConfirm = false
                                nav.popBackStack("rlist", inclusive = false)
                            } catch (e: Exception) {
                                err = e.message
                                showDeleteConfirm = false
                            }
                        }
                    },
                ) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") } },
        )
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
                            .clickable { nav.navigate("rjobdetail/$retreatId/${j.id}") },
                    ) {
                        Column(Modifier.padding(12.dp)) {
                            Text(j.title, style = MaterialTheme.typography.titleSmall)
                            Text("Needed: ${j.volunteersNeeded} · ${j.estimatedMinutes} min")
                            if (j.subjobs.isNotEmpty()) {
                                Text(
                                    "${j.subjobs.size} subjobs · tap for details",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.secondary,
                                )
                            } else {
                                Text(
                                    "Tap for details · add subjobs (one per line) from edit",
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
private fun JobDetailScreen(nav: NavHostController, retreatId: String, jobId: String) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var job by remember { mutableStateOf<Job?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    var showEdit by remember { mutableStateOf(false) }
    var showDelete by remember { mutableStateOf(false) }

    fun load() {
        scope.launch {
            try {
                job = repo.getJob(retreatId, jobId)
                err = null
            } catch (e: Exception) {
                err = e.message
                job = null
            }
        }
    }

    LaunchedEffect(retreatId, jobId) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(job?.title ?: "Job") },
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
            job?.let { j ->
                Text("Volunteers needed: ${j.volunteersNeeded}", style = MaterialTheme.typography.bodyLarge)
                Text("Est. minutes: ${j.estimatedMinutes}", style = MaterialTheme.typography.bodyLarge)
                if (j.subjobs.isNotEmpty()) {
                    Text("Subjobs", style = MaterialTheme.typography.labelLarge)
                    j.subjobs.sortedBy { it.sortOrder }.forEach { s ->
                        Text("${s.sortOrder}. ${s.text}", style = MaterialTheme.typography.bodyMedium)
                    }
                }
                Spacer(Modifier.height(16.dp))
                Button(onClick = { showEdit = true }, modifier = Modifier.fillMaxWidth()) { Text("Edit job") }
                Button(
                    onClick = { showDelete = true },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                ) { Text("Delete job") }
            }
        }
    }

    job?.let { j ->
        if (showEdit) {
            EditJobDialog(
                job = j,
                retreatId = retreatId,
                repo = repo,
                scope = scope,
                onDismiss = { showEdit = false },
                onAfterMutation = {
                    showEdit = false
                    load()
                },
                onError = { err = it },
            )
        }
    }

    if (showDelete && job != null) {
        AlertDialog(
            onDismissRequest = { showDelete = false },
            title = { Text("Delete job?") },
            text = { Text("This cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            try {
                                repo.deleteJob(retreatId, job!!.id)
                                showDelete = false
                                nav.popBackStack()
                            } catch (e: Exception) {
                                err = e.message
                                showDelete = false
                            }
                        }
                    },
                ) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showDelete = false }) { Text("Cancel") } },
        )
    }
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
                    Card(
                        Modifier
                            .fillMaxWidth()
                            .padding(8.dp)
                            .clickable { nav.navigate("rslotdetail/$retreatId/${s.id}") },
                    ) {
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

private fun applyTaskListFilters(
    tasks: List<JHTask>,
    unassignedOnly: Boolean,
    underassignedOnly: Boolean,
): List<JHTask> {
    var out = tasks
    if (unassignedOnly) {
        out = out.filter { (it.assignmentCount ?: 0) == 0 }
    }
    if (underassignedOnly) {
        out = out.filter { t ->
            val need = t.volunteersNeeded
            if (need != null) {
                val c = t.assignmentCount ?: 0
                c < need
            } else {
                t.isUnderassigned == true
            }
        }
    }
    return out
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
    var rawTasks by remember { mutableStateOf<List<JHTask>>(emptyList()) }
    var jobTitleById by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var slotLabelById by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var err by remember { mutableStateOf<String?>(null) }
    var showAdd by remember { mutableStateOf(false) }
    var jobId by remember { mutableStateOf("") }
    var slotId by remember { mutableStateOf("") }
    var filterUnassigned by remember { mutableStateOf(false) }
    var filterUnderassigned by remember { mutableStateOf(false) }

    val items = remember(rawTasks, filterUnassigned, filterUnderassigned) {
        applyTaskListFilters(rawTasks, filterUnassigned, filterUnderassigned)
    }

    fun load() {
        scope.launch {
            try {
                coroutineScope {
                    val tasksDef = async { repo.listTasks(retreatId) }
                    val jobsDef = async { runCatching { repo.listJobs(retreatId) }.getOrNull() }
                    val slotsDef = async { runCatching { repo.listSlots(retreatId) }.getOrNull() }
                    rawTasks = tasksDef.await().items
                    jobTitleById = jobsDef.await()?.items?.associate { it.id to it.title } ?: emptyMap()
                    slotLabelById = slotsDef.await()?.items?.associate { it.id to it.label } ?: emptyMap()
                }
                err = null
            } catch (e: Exception) {
                err = e.message
            }
        }
    }

    LaunchedEffect(retreatId, filterUnassigned, filterUnderassigned) { load() }

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
            Column(Modifier.padding(horizontal = 12.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Only tasks with no volunteers yet", style = MaterialTheme.typography.bodySmall)
                    Switch(checked = filterUnassigned, onCheckedChange = { filterUnassigned = it })
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Only tasks that still need more people", style = MaterialTheme.typography.bodySmall)
                    Switch(checked = filterUnderassigned, onCheckedChange = { filterUnderassigned = it })
                }
            }
            if (items.isEmpty() && (filterUnassigned || filterUnderassigned)) {
                Text(
                    "No matching tasks. Try turning off a filter, or add assignments from a task’s detail screen.",
                    modifier = Modifier.padding(16.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyColumn(modifier = Modifier.weight(1f)) {
                    items(items, key = { it.id }) { t ->
                        Card(
                            Modifier
                                .fillMaxWidth()
                                .padding(8.dp)
                                .clickable { nav.navigate("rtaskdetail/$retreatId/${t.id}") },
                        ) {
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
    var showLinkSearch by remember { mutableStateOf(false) }
    var linkQuery by remember { mutableStateOf("") }
    var searchResults by remember { mutableStateOf<List<Volunteer>>(emptyList()) }
    var searchBusy by remember { mutableStateOf(false) }
    var searchErr by remember { mutableStateOf<String?>(null) }
    var importSummaryAlert by remember { mutableStateOf<String?>(null) }

    val pickCsv = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            try {
                val bytes = ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes() }
                val res = repo.importRetreatVolunteersCsv(retreatId, bytes)
                importSummaryAlert =
                    "created=${res.created} updated=${res.updated} linked=${res.linked} errors=${res.errors.size}"
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

    fun runVolunteerSearch() {
        scope.launch {
            searchBusy = true
            searchErr = null
            try {
                val q = linkQuery.trim().ifEmpty { null }
                searchResults = repo.searchVolunteers(q = q, limit = 100).items
            } catch (e: Exception) {
                searchErr = e.message
                searchResults = emptyList()
            } finally {
                searchBusy = false
            }
        }
    }

    LaunchedEffect(retreatId) { load() }

    LaunchedEffect(showLinkSearch) {
        if (!showLinkSearch) return@LaunchedEffect
        linkQuery = ""
        searchErr = null
        searchBusy = true
        try {
            searchResults = repo.searchVolunteers(q = null, limit = 100).items
        } catch (e: Exception) {
            searchErr = e.message
            searchResults = emptyList()
        } finally {
            searchBusy = false
        }
    }

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
            Button(onClick = { showLinkSearch = true }, modifier = Modifier.fillMaxWidth()) { Text("Link volunteer…") }
            Button(onClick = { pickCsv.launch("text/*") }, modifier = Modifier.fillMaxWidth()) { Text("Import CSV") }
            LazyColumn(modifier = Modifier.weight(1f)) {
                items(items, key = { it.volunteerId }) { rv ->
                    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(rv.volunteer.displayName, style = MaterialTheme.typography.titleSmall)
                                Text(rv.volunteer.email ?: "—", style = MaterialTheme.typography.bodySmall)
                            }
                            TextButton(
                                onClick = {
                                    scope.launch {
                                        try {
                                            repo.unlinkRetreatVolunteer(retreatId, rv.volunteerId)
                                            load()
                                        } catch (e: Exception) {
                                            err = e.message
                                        }
                                    }
                                },
                            ) { Text("Unlink") }
                        }
                    }
                }
            }
        }
    }

    if (showLinkSearch) {
        AlertDialog(
            onDismissRequest = { showLinkSearch = false },
            title = { Text("Link volunteer") },
            text = {
                Column(Modifier.heightIn(max = 520.dp)) {
                    OutlinedTextField(
                        value = linkQuery,
                        onValueChange = { linkQuery = it },
                        label = { Text("Name or email") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { runVolunteerSearch() }),
                    )
                    TextButton(onClick = { runVolunteerSearch() }, enabled = !searchBusy) { Text("Search") }
                    when {
                        searchBusy -> CircularProgressIndicator(Modifier.padding(8.dp))
                        searchErr != null -> Text(searchErr!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        searchResults.isEmpty() -> Text(
                            "No volunteers in this list. Search by name or email, or leave blank for recent directory entries.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        else -> {
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .heightIn(max = 320.dp)
                                    .verticalScroll(rememberScrollState()),
                            ) {
                                searchResults.forEach { v ->
                                    TextButton(
                                        onClick = {
                                            scope.launch {
                                                try {
                                                    repo.linkRetreatVolunteer(retreatId, v.id)
                                                    showLinkSearch = false
                                                    load()
                                                } catch (e: Exception) {
                                                    searchErr = e.message
                                                }
                                            }
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Column(Modifier.fillMaxWidth()) {
                                            Text(v.displayName)
                                            v.email?.let { em ->
                                                Text(em, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showLinkSearch = false }) { Text("Done") }
            },
        )
    }

    importSummaryAlert?.let { summary ->
        AlertDialog(
            onDismissRequest = { importSummaryAlert = null },
            title = { Text("Import result") },
            text = { Text(summary) },
            confirmButton = {
                TextButton(onClick = { importSummaryAlert = null }) { Text("OK") }
            },
        )
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
                        Card(
                            Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .clickable { nav.navigate("rtaskdetail/$retreatId/${row.task.id}") },
                        ) {
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
    val scope = rememberCoroutineScope()
    var detail by remember { mutableStateOf<JHTaskDetail?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var showDelete by remember { mutableStateOf(false) }
    var showAssign by remember { mutableStateOf(false) }
    var showEdit by remember { mutableStateOf(false) }
    var showDup by remember { mutableStateOf(false) }
    var slotsPick by remember { mutableStateOf<List<Slot>>(emptyList()) }
    var linkedPick by remember { mutableStateOf<List<RetreatVolunteer>>(emptyList()) }
    var editSlotId by remember { mutableStateOf("") }
    var editNotes by remember { mutableStateOf("") }
    var dupSlotId by remember { mutableStateOf("") }
    var dialogErr by remember { mutableStateOf<String?>(null) }

    fun reload() {
        scope.launch {
            try {
                detail = repo.getTask(retreatId, taskId)
                err = null
            } catch (e: Exception) {
                err = e.message
                detail = null
            }
        }
    }

    LaunchedEffect(retreatId, taskId) { reload() }

    fun loadSlots() {
        scope.launch {
            try {
                slotsPick = repo.listSlots(retreatId, null).items
            } catch (e: Exception) {
                dialogErr = e.message
                slotsPick = emptyList()
            }
        }
    }

    fun loadLinked() {
        scope.launch {
            try {
                linkedPick = repo.listRetreatVolunteers(retreatId).items
            } catch (e: Exception) {
                dialogErr = e.message
                linkedPick = emptyList()
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(detail?.job?.title ?: detail?.jobTitle ?: "Task") },
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
            if (busy) CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
            detail?.let { d ->
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
                Text("Volunteers", style = MaterialTheme.typography.labelLarge)
                val assignedIds = d.assignments.orEmpty().map { it.volunteerId }.toSet()
                d.assignments.orEmpty().forEach { a ->
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            a.volunteer?.displayName?.takeIf { it.isNotBlank() } ?: "Unnamed volunteer",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(
                            onClick = {
                                scope.launch {
                                    busy = true
                                    try {
                                        repo.deleteAssignment(retreatId, a.id)
                                        reload()
                                    } catch (e: Exception) {
                                        err = e.message
                                    } finally {
                                        busy = false
                                    }
                                }
                            },
                            enabled = !busy,
                        ) { Text("Remove") }
                    }
                }
                if (d.assignments.isNullOrEmpty()) {
                    Text("None yet", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
                }
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = {
                        dialogErr = null
                        loadLinked()
                        showAssign = true
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !busy,
                ) { Text("Assign volunteer…") }
                Button(
                    onClick = {
                        dialogErr = null
                        editSlotId = d.slotId
                        editNotes = d.notes.orEmpty()
                        loadSlots()
                        showEdit = true
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !busy,
                ) { Text("Edit task") }
                Button(
                    onClick = {
                        dialogErr = null
                        dupSlotId = ""
                        loadSlots()
                        showDup = true
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !busy,
                ) { Text("Duplicate to another slot…") }
                Button(
                    onClick = { showDelete = true },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !busy,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                ) { Text("Delete task") }

                if (showAssign) {
                    val available = linkedPick.filter { it.volunteerId !in assignedIds }
                    AlertDialog(
                        onDismissRequest = { if (!busy) showAssign = false },
                        title = { Text("Assign volunteer") },
                        text = {
                            Column(Modifier.heightIn(max = 400.dp).verticalScroll(rememberScrollState())) {
                                if (available.isEmpty()) {
                                    Text(
                                        "No linked volunteers left to assign, or none are linked to this retreat.",
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                } else {
                                    available.forEach { rv ->
                                        TextButton(
                                            onClick = {
                                                scope.launch {
                                                    busy = true
                                                    try {
                                                        repo.createAssignment(retreatId, taskId, rv.volunteerId)
                                                        showAssign = false
                                                        reload()
                                                    } catch (e: Exception) {
                                                        dialogErr = e.message
                                                    } finally {
                                                        busy = false
                                                    }
                                                }
                                            },
                                            enabled = !busy,
                                            modifier = Modifier.fillMaxWidth(),
                                        ) {
                                            Text(rv.volunteer.displayName.ifBlank { rv.volunteerId })
                                        }
                                    }
                                }
                                dialogErr?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                            }
                        },
                        confirmButton = {
                            TextButton(onClick = { showAssign = false }, enabled = !busy) { Text("Close") }
                        },
                    )
                }

                if (showEdit) {
                    AlertDialog(
                        onDismissRequest = { if (!busy) showEdit = false },
                        title = { Text("Edit task") },
                        text = {
                            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                                OutlinedTextField(
                                    value = editNotes,
                                    onValueChange = { editNotes = it },
                                    label = { Text("Notes") },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                Text("Slot", style = MaterialTheme.typography.labelMedium)
                                slotsPick.forEach { s ->
                                    Row(
                                        Modifier
                                            .fillMaxWidth()
                                            .clickable { editSlotId = s.id },
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        RadioButton(selected = editSlotId == s.id, onClick = { editSlotId = s.id })
                                        Text("${s.label} (${s.slotDate})")
                                    }
                                }
                                dialogErr?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                            }
                        },
                        confirmButton = {
                            TextButton(
                                onClick = {
                                    scope.launch {
                                        busy = true
                                        dialogErr = null
                                        try {
                                            repo.updateTask(
                                                retreatId,
                                                taskId,
                                                JHTaskPatch(
                                                    slotId = editSlotId.takeIf { it.isNotBlank() },
                                                    notes = editNotes.trim().ifBlank { null },
                                                ),
                                            )
                                            showEdit = false
                                            reload()
                                        } catch (e: Exception) {
                                            dialogErr = e.message
                                        } finally {
                                            busy = false
                                        }
                                    }
                                },
                                enabled = !busy && editSlotId.isNotBlank(),
                            ) { Text("Save") }
                        },
                        dismissButton = {
                            TextButton(onClick = { if (!busy) showEdit = false }, enabled = !busy) { Text("Cancel") }
                        },
                    )
                }

                if (showDup) {
                    AlertDialog(
                        onDismissRequest = { if (!busy) showDup = false },
                        title = { Text("Duplicate task") },
                        text = {
                            Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                                Text("Target slot", style = MaterialTheme.typography.labelMedium)
                                slotsPick.forEach { s ->
                                    Row(
                                        Modifier
                                            .fillMaxWidth()
                                            .clickable { dupSlotId = s.id },
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        RadioButton(selected = dupSlotId == s.id, onClick = { dupSlotId = s.id })
                                        Text("${s.label} (${s.slotDate})")
                                    }
                                }
                                dialogErr?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                            }
                        },
                        confirmButton = {
                            TextButton(
                                onClick = {
                                    scope.launch {
                                        busy = true
                                        dialogErr = null
                                        try {
                                            val created = repo.duplicateTask(retreatId, taskId, dupSlotId)
                                            showDup = false
                                            nav.navigate("rtaskdetail/$retreatId/${created.id}") {
                                                popUpTo("rtaskdetail/$retreatId/$taskId") { inclusive = true }
                                            }
                                        } catch (e: Exception) {
                                            dialogErr = e.message
                                        } finally {
                                            busy = false
                                        }
                                    }
                                },
                                enabled = !busy && dupSlotId.isNotBlank(),
                            ) { Text("Duplicate") }
                        },
                        dismissButton = {
                            TextButton(onClick = { if (!busy) showDup = false }, enabled = !busy) { Text("Cancel") }
                        },
                    )
                }

                if (showDelete) {
                    AlertDialog(
                        onDismissRequest = { showDelete = false },
                        title = { Text("Delete task?") },
                        text = { Text("This cannot be undone.") },
                        confirmButton = {
                            TextButton(
                                onClick = {
                                    scope.launch {
                                        busy = true
                                        try {
                                            repo.deleteTask(retreatId, taskId)
                                            showDelete = false
                                            nav.popBackStack()
                                        } catch (e: Exception) {
                                            err = e.message
                                            showDelete = false
                                        } finally {
                                            busy = false
                                        }
                                    }
                                },
                            ) { Text("Delete", color = MaterialTheme.colorScheme.error) }
                        },
                        dismissButton = { TextButton(onClick = { showDelete = false }) { Text("Cancel") } },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SlotDetailScreen(nav: NavHostController, retreatId: String, slotId: String) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var slot by remember { mutableStateOf<Slot?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var showEdit by remember { mutableStateOf(false) }
    var showDelete by remember { mutableStateOf(false) }
    var editLabel by remember { mutableStateOf("") }
    var editDate by remember { mutableStateOf("") }
    var editBand by remember { mutableStateOf(TimeBand.anytime) }
    var editErr by remember { mutableStateOf<String?>(null) }

    fun reload() {
        scope.launch {
            try {
                slot = repo.getSlot(retreatId, slotId)
                err = null
            } catch (e: Exception) {
                err = e.message
                slot = null
            }
        }
    }

    LaunchedEffect(retreatId, slotId) { reload() }

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
            if (busy) CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
            slot?.let { s ->
                Text("Date: ${s.slotDate}", style = MaterialTheme.typography.bodyLarge)
                Text("Time band: ${s.timeBand.name}", style = MaterialTheme.typography.bodyMedium)
                s.dayOfWeek?.takeIf { it.isNotBlank() }?.let { Text("Day of week: $it") }
                s.activityContext?.takeIf { it.isNotBlank() }?.let { Text("Context: $it") }
                Text("id: ${s.id}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = {
                        editLabel = s.label
                        editDate = s.slotDate
                        editBand = s.timeBand
                        editErr = null
                        showEdit = true
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !busy,
                ) { Text("Edit slot") }
                Button(
                    onClick = { showDelete = true },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !busy,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                ) { Text("Delete slot") }
            }
        }
    }

    if (showEdit && slot != null) {
        AlertDialog(
            onDismissRequest = { if (!busy) showEdit = false },
            title = { Text("Edit slot") },
            text = {
                Column(Modifier.heightIn(max = 400.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = editLabel, onValueChange = { editLabel = it }, label = { Text("Label") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = editDate, onValueChange = { editDate = it }, label = { Text("Date yyyy-MM-dd") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    Text("Time band", style = MaterialTheme.typography.labelMedium)
                    TimeBand.entries.forEach { b ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable { editBand = b },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = editBand == b, onClick = { editBand = b })
                            Text(b.name)
                        }
                    }
                    editErr?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            busy = true
                            editErr = null
                            try {
                                repo.updateSlot(
                                    retreatId,
                                    slotId,
                                    SlotPatch(label = editLabel.trim().ifEmpty { null }, slotDate = editDate.trim().ifEmpty { null }, timeBand = editBand),
                                )
                                showEdit = false
                                reload()
                            } catch (e: Exception) {
                                editErr = e.message
                            } finally {
                                busy = false
                            }
                        }
                    },
                    enabled = !busy && editLabel.isNotBlank() && editDate.isNotBlank(),
                ) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { if (!busy) showEdit = false }, enabled = !busy) { Text("Cancel") } },
        )
    }

    if (showDelete) {
        AlertDialog(
            onDismissRequest = { showDelete = false },
            title = { Text("Delete slot?") },
            text = { Text("This cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            busy = true
                            try {
                                repo.deleteSlot(retreatId, slotId)
                                showDelete = false
                                nav.popBackStack()
                            } catch (e: Exception) {
                                err = e.message
                                showDelete = false
                            } finally {
                                busy = false
                            }
                        }
                    },
                ) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showDelete = false }) { Text("Cancel") } },
        )
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
fun DirectoryNavHost(navController: NavHostController) {
    NavHost(navController = navController, startDestination = "dlist", modifier = Modifier.fillMaxSize()) {
        composable("dlist") { GlobalVolunteersListScreen(navController) }
        composable(
            "dvol/{vid}",
            arguments = listOf(navArgument("vid") { type = NavType.StringType }),
        ) { entry ->
            VolunteerDetailScreen(navController, volunteerId = entry.arguments!!.getString("vid")!!)
        }
        composable("dcreate") { VolunteerCreateScreen(navController) }
        composable(
            "dedit/{vid}",
            arguments = listOf(navArgument("vid") { type = NavType.StringType }),
        ) { entry ->
            VolunteerEditScreen(navController, volunteerId = entry.arguments!!.getString("vid")!!)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GlobalVolunteersListScreen(nav: NavHostController) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var q by remember { mutableStateOf("") }
    var items by remember { mutableStateOf<List<Volunteer>>(emptyList()) }
    var err by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }

    fun submitSearch() {
        scope.launch {
            loading = true
            err = null
            try {
                val trimmed = q.trim()
                items = repo.searchVolunteers(q = trimmed.takeIf { it.isNotEmpty() }, limit = 100).items
            } catch (e: Exception) {
                err = e.message
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { submitSearch() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.directory_nav_title)) },
                actions = {
                    TextButton(onClick = { submitSearch() }, enabled = !loading) {
                        Text(stringResource(R.string.action_search))
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { nav.navigate("dcreate") }) {
                Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.volunteer_new_title))
            }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedTextField(
                value = q,
                onValueChange = { q = it },
                label = { Text(stringResource(R.string.volunteer_search_prompt)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { submitSearch() }),
            )
            if (loading) {
                CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
            }
            when {
                err != null -> Text(err!!, color = MaterialTheme.colorScheme.error)
                else -> {
                    LazyColumn(
                        Modifier
                            .fillMaxSize()
                            .weight(1f, fill = true),
                    ) {
                        items(items, key = { it.id }) { v ->
                            ListItem(
                                headlineContent = {
                                    Text(v.displayName, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                },
                                supportingContent =
                                    if (v.email != null) {
                                        {
                                            Text(
                                                v.email,
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                        }
                                    } else {
                                        null
                                    },
                                modifier = Modifier.clickable { nav.navigate("dvol/${v.id}") },
                            )
                            HorizontalDivider()
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VolunteerDetailScreen(nav: NavHostController, volunteerId: String) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var volunteer by remember { mutableStateOf<Volunteer?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }

    fun load() {
        scope.launch {
            busy = true
            err = null
            try {
                volunteer = repo.getVolunteer(volunteerId)
            } catch (e: Exception) {
                err = e.message
                volunteer = null
            } finally {
                busy = false
            }
        }
    }

    LaunchedEffect(volunteerId) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        volunteer?.displayName ?: stringResource(R.string.directory_nav_title),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
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
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when {
                busy && volunteer == null -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
                err != null -> Text(err!!, color = MaterialTheme.colorScheme.error)
                volunteer != null -> {
                    val v = volunteer!!
                    v.email?.let { labeledRow(stringResource(R.string.label_email), it) }
                    v.phone?.let { labeledRow(stringResource(R.string.label_phone), it) }
                    v.otherDuties?.let { labeledRow(stringResource(R.string.label_other), it) }
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { nav.navigate("dedit/${v.id}") },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(stringResource(R.string.action_edit)) }
                    Button(
                        onClick = { confirmDelete = true },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error,
                            contentColor = MaterialTheme.colorScheme.onError,
                        ),
                    ) { Text(stringResource(R.string.label_delete)) }
                }
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(stringResource(R.string.volunteer_delete_title)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmDelete = false
                        scope.launch {
                            try {
                                repo.deleteVolunteer(volunteerId)
                                nav.popBackStack()
                            } catch (e: Exception) {
                                err = e.message
                            }
                        }
                    },
                ) { Text(stringResource(R.string.label_delete)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}

@Composable
private fun labeledRow(label: String, value: String) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyLarge)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VolunteerCreateScreen(nav: NavHostController) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var displayName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var other by remember { mutableStateOf("") }
    var err by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.volunteer_new_title)) },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    TextButton(
                        onClick = {
                            scope.launch {
                                busy = true
                                err = null
                                try {
                                    val body =
                                        VolunteerCreate(
                                            displayName = displayName.trim(),
                                            email = email.trim().takeIf { it.isNotEmpty() },
                                            phone = phone.trim().takeIf { it.isNotEmpty() },
                                            otherDuties = other.trim().takeIf { it.isNotEmpty() },
                                        )
                                    repo.createVolunteer(body)
                                    nav.popBackStack()
                                } catch (e: Exception) {
                                    err = e.message
                                } finally {
                                    busy = false
                                }
                            }
                        },
                        enabled = !busy && displayName.isNotBlank(),
                    ) { Text(stringResource(R.string.action_create)) }
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
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            OutlinedTextField(
                value = displayName,
                onValueChange = { displayName = it },
                label = { Text(stringResource(R.string.label_display_name)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text(stringResource(R.string.label_email_optional)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = phone,
                onValueChange = { phone = it },
                label = { Text(stringResource(R.string.label_phone_optional)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = other,
                onValueChange = { other = it },
                label = { Text(stringResource(R.string.label_other_duties_optional)) },
                modifier = Modifier.fillMaxWidth(),
            )
            if (busy) CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VolunteerEditScreen(nav: NavHostController, volunteerId: String) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var displayName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var other by remember { mutableStateOf("") }
    var notifyEmail by remember { mutableStateOf(true) }
    var notifySms by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var loaded by remember { mutableStateOf(false) }

    LaunchedEffect(volunteerId) {
        try {
            val v = repo.getVolunteer(volunteerId)
            displayName = v.displayName
            email = v.email ?: ""
            phone = v.phone ?: ""
            other = v.otherDuties ?: ""
            notifyEmail = v.notifyEmail ?: true
            notifySms = v.notifySms ?: false
            loaded = true
        } catch (e: Exception) {
            err = e.message
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.volunteer_edit_title)) },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    TextButton(
                        onClick = {
                            scope.launch {
                                busy = true
                                err = null
                                try {
                                    val patch =
                                        VolunteerPatch(
                                            displayName = displayName.trim(),
                                            email = email.trim().takeIf { it.isNotEmpty() },
                                            phone = phone.trim().takeIf { it.isNotEmpty() },
                                            otherDuties = other.trim().takeIf { it.isNotEmpty() },
                                            notifyEmail = notifyEmail,
                                            notifySms = notifySms,
                                        )
                                    repo.updateVolunteer(volunteerId, patch)
                                    nav.popBackStack()
                                } catch (e: Exception) {
                                    err = e.message
                                } finally {
                                    busy = false
                                }
                            }
                        },
                        enabled = loaded && !busy,
                    ) { Text(stringResource(R.string.action_save)) }
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
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            OutlinedTextField(
                value = displayName,
                onValueChange = { displayName = it },
                label = { Text(stringResource(R.string.label_display_name)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text(stringResource(R.string.label_email)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = phone,
                onValueChange = { phone = it },
                label = { Text(stringResource(R.string.label_phone)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = other,
                onValueChange = { other = it },
                label = { Text(stringResource(R.string.label_other_duties)) },
                modifier = Modifier.fillMaxWidth(),
            )
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(stringResource(R.string.notify_via_email))
                Switch(checked = notifyEmail, onCheckedChange = { notifyEmail = it })
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(stringResource(R.string.notify_via_sms))
                Switch(checked = notifySms, onCheckedChange = { notifySms = it })
            }
            if (busy) CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
        }
    }
}

private fun jewelheartAuthStatus(user: com.google.firebase.auth.FirebaseUser?): String {
    if (user == null) return "Signed out"
    if (user.isAnonymous) return "Signed in · Anonymous"
    val ids = user.providerData.map { it.providerId }
    return when {
        ids.contains("google.com") -> "Signed in · Google"
        ids.contains("password") -> "Signed in · Email"
        ids.contains("apple.com") -> "Signed in · Apple"
        else -> ids.firstOrNull()?.let { "Signed in · $it" } ?: "Signed in"
    }
}

@Composable
fun MetaTabContent() {
    val auth = remember { FirebaseAuth.getInstance() }
    var user by remember { mutableStateOf(auth.currentUser) }
    androidx.compose.runtime.DisposableEffect(Unit) {
        val listener = FirebaseAuth.AuthStateListener { u -> user = u.currentUser }
        auth.addAuthStateListener(listener)
        onDispose { auth.removeAuthStateListener(listener) }
    }
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var health by remember { mutableStateOf<String?>(null) }
    var actionId by remember { mutableStateOf("refresh") }
    var actionRetreatId by remember { mutableStateOf("") }
    var actionPayloadKey by remember { mutableStateOf("") }
    var actionPayloadValue by remember { mutableStateOf("") }
    var actionResult by remember { mutableStateOf<String?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var signOutErr by remember { mutableStateOf<String?>(null) }

    Column(
        Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Settings", style = MaterialTheme.typography.titleLarge)
        Text("Signed-in (ACL)", style = MaterialTheme.typography.titleSmall)
        Text(jewelheartAuthStatus(user), style = MaterialTheme.typography.bodyMedium)
        Text("Firebase UID:\n${user?.uid ?: "—"}", style = MaterialTheme.typography.bodySmall)
        Text(
            "Add this UID to Postgres jewelheart_admins (or jewelheart_retreat_admins) for directory access. " +
                "Each anonymous sign-in uses a new UID.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        signOutErr?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Button(
            onClick = {
                signOutErr = null
                try {
                    auth.signOut()
                } catch (e: Exception) {
                    signOutErr = e.message
                }
            },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
        ) { Text("Sign out") }
        Spacer(Modifier.height(8.dp))
        Text("Health (no auth)", style = MaterialTheme.typography.titleSmall)
        Button(
            onClick = {
                scope.launch {
                    busy = true
                    try {
                        val h = repo.getHealth()
                        health = "ok=${h.ok} service=${h.service}"
                        err = null
                    } catch (e: Exception) {
                        health = null
                        err = e.message
                    } finally {
                        busy = false
                    }
                }
            },
            enabled = !busy,
        ) { Text("Ping GET /jewelheart/health") }
        health?.let { Text(it) }
        err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Spacer(Modifier.height(8.dp))
        Text("SDUI action (POST /jewelheart/sdui/action)", style = MaterialTheme.typography.titleSmall)
        OutlinedTextField(value = actionId, onValueChange = { actionId = it }, label = { Text("actionId") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(
            value = actionRetreatId,
            onValueChange = { actionRetreatId = it },
            label = { Text("retreatId (optional)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        OutlinedTextField(
            value = actionPayloadKey,
            onValueChange = { actionPayloadKey = it },
            label = { Text("payload key (optional)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        OutlinedTextField(
            value = actionPayloadValue,
            onValueChange = { actionPayloadValue = it },
            label = { Text("payload value (optional)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        Button(
            onClick = {
                scope.launch {
                    busy = true
                    actionResult = null
                    err = null
                    try {
                        val rid = actionRetreatId.trim()
                        val payload =
                            if (actionPayloadKey.isNotBlank()) {
                                mapOf<String, Any>(actionPayloadKey.trim() to actionPayloadValue)
                            } else {
                                null
                            }
                        val r = repo.postSduiAction(
                            actionId.trim(),
                            retreatId = rid.takeIf { it.isNotEmpty() },
                            payload = payload,
                        )
                        val lines = listOfNotNull(
                            r.ok?.let { "ok=$it" },
                            r.message?.let { "message=$it" },
                            r.refreshScreenId?.let { "refreshScreenId=$it" },
                            if (r.nextScreen != null) "nextScreen: <envelope present>" else null,
                        )
                        actionResult = if (lines.isEmpty()) "(empty response body fields)" else lines.joinToString("\n")
                    } catch (e: Exception) {
                        err = e.message
                        actionResult = null
                    } finally {
                        busy = false
                    }
                }
            },
            enabled = !busy,
        ) { Text("Send action") }
        actionResult?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        if (busy) CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
    }
}
