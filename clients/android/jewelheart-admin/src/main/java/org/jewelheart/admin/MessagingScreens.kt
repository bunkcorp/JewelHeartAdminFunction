package org.jewelheart.admin

import android.content.Context
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant

private const val PREFS = "jewelheart"
private const val KEY_SELF_VOLUNTEER_ID = "jewelheart.selfVolunteerId"

fun NavGraphBuilder.volunteerMessagingRoutes(navController: NavHostController) {
    composable(
        "vmessages/{rid}",
        listOf(navArgument("rid") { type = NavType.StringType }),
    ) { e ->
        RetreatMessagingListScreen(navController, retreatId = e.arguments!!.getString("rid")!!)
    }
    composable(
        "vthread/{rid}/{cid}",
        listOf(
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
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RetreatMessagingListScreen(
    nav: NavHostController,
    retreatId: String,
    threadRoute: (retreatId: String, conversationId: String) -> String = { rid, cid -> "vthread/$rid/$cid" },
) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<ConversationSummary>>(emptyList()) }
    var err by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var showPeerPicker by remember { mutableStateOf(false) }

    fun load() {
        scope.launch {
            loading = true
            err = null
            try {
                repo.ensureRetreatRoomConversation(retreatId)
                items = repo.listRetreatConversations(retreatId).items
            } catch (e: Exception) {
                err = e.message
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(retreatId) { load() }

    if (showPeerPicker) {
        PeerPickerDialog(
            retreatId = retreatId,
            repo = repo,
            onDismiss = { showPeerPicker = false },
            onPick = { peerId ->
                scope.launch {
                    try {
                        val conv = repo.createDirectConversation(retreatId, peerId)
                        showPeerPicker = false
                        nav.navigate(threadRoute(retreatId, conv.id))
                    } catch (e: Exception) {
                        err = e.message
                    }
                }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Messages") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(onClick = { showPeerPicker = true }) {
                        Text("Message volunteer…")
                    }
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
                items.isEmpty() -> Text("No conversations yet.", modifier = Modifier.padding(16.dp))
                else -> {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(items, key = { it.id }) { c ->
                            val title =
                                when (c.kind) {
                                    "retreat_room" -> "Everyone (retreat)"
                                    else -> c.peerDisplayName?.takeIf { it.isNotBlank() } ?: "Direct"
                                }
                            Card(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 2.dp)
                                    .clickable { nav.navigate(threadRoute(retreatId, c.id)) },
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                            ) {
                                Column(Modifier.padding(12.dp)) {
                                    Text(title, style = MaterialTheme.typography.titleMedium)
                                    Text(c.kind, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
private fun PeerPickerDialog(
    retreatId: String,
    repo: JewelHeartRepository,
    onDismiss: () -> Unit,
    onPick: (String) -> Unit,
) {
    var linked by remember { mutableStateOf<List<RetreatVolunteer>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var localErr by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(retreatId) {
        busy = true
        try {
            linked = repo.listRetreatVolunteers(retreatId).items
        } catch (e: Exception) {
            localErr = e.message
        } finally {
            busy = false
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Choose volunteer") },
        text = {
            when {
                busy -> CircularProgressIndicator()
                localErr != null -> Text(localErr!!, color = MaterialTheme.colorScheme.error)
                linked.isEmpty() -> Text("No linked volunteers for this retreat.")
                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 400.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        items(linked, key = { it.volunteerId }) { row ->
                            TextButton(onClick = { onPick(row.volunteerId) }, modifier = Modifier.fillMaxWidth()) {
                                Text(row.volunteer.displayName, modifier = Modifier.fillMaxWidth())
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationThreadScreen(nav: NavHostController, @Suppress("UNUSED_PARAMETER") retreatId: String, conversationId: String) {
    val repo = remember { JewelHeartRepository() }
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    val prefs = remember { ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    var messages by remember { mutableStateOf<List<JHMessage>>(emptyList()) }
    var nextCursor by remember { mutableStateOf<String?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    var draft by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var loadingMore by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    fun selfVolunteerId(): String? = prefs.getString(KEY_SELF_VOLUNTEER_ID, null)?.takeIf { it.isNotBlank() }

    fun canRecallDelete(m: JHMessage): Boolean {
        val selfId = selfVolunteerId() ?: return false
        if (m.senderVolunteerId != selfId) return false
        return try {
            val t = Instant.parse(m.createdAt)
            Duration.between(t, Instant.now()).toMinutes() <= 15L
        } catch (_: Exception) {
            false
        }
    }

    fun reload() {
        scope.launch {
            err = null
            try {
                repo.markConversationRead(conversationId)
                val page = repo.listConversationMessages(conversationId, limit = 40)
                messages = page.items
                nextCursor = page.nextCursor
            } catch (e: Exception) {
                err = e.message
            }
        }
    }

    fun loadOlder() {
        val c = nextCursor ?: return
        if (loadingMore) return
        scope.launch {
            loadingMore = true
            err = null
            try {
                val page = repo.listConversationMessages(conversationId, limit = 40, cursor = c)
                messages = messages + page.items
                nextCursor = page.nextCursor
            } catch (e: Exception) {
                err = e.message
            } finally {
                loadingMore = false
            }
        }
    }

    LaunchedEffect(conversationId) { reload() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Thread") },
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
                .padding(horizontal = 8.dp),
        ) {
            err?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(4.dp)) }
            LazyColumn(
                state = listState,
                reverseLayout = true,
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(messages, key = { it.id }) { m ->
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .then(
                                if (canRecallDelete(m)) {
                                    Modifier.pointerInput(m.id) {
                                        detectTapGestures(
                                            onLongPress = {
                                                scope.launch {
                                                    try {
                                                        repo.deleteJewelHeartMessage(m.id)
                                                        messages = messages.filter { it.id != m.id }
                                                    } catch (e: Exception) {
                                                        err = e.message
                                                    }
                                                }
                                            },
                                        )
                                    }
                                } else {
                                    Modifier
                                },
                            ),
                    ) {
                        Text(
                            m.senderDisplayName ?: m.senderVolunteerId.take(8),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(m.body, style = MaterialTheme.typography.bodyMedium)
                    }
                }
                item(key = "older") {
                    if (nextCursor != null) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                            TextButton(onClick = { loadOlder() }, enabled = !loadingMore) {
                                Text(if (loadingMore) "Loading…" else "Load older messages")
                            }
                        }
                    }
                }
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Message") },
                    singleLine = false,
                    maxLines = 4,
                )
                Button(
                    onClick = {
                        val t = draft.trim()
                        if (t.isEmpty() || sending) return@Button
                        scope.launch {
                            sending = true
                            err = null
                            try {
                                val sent = repo.sendConversationMessage(conversationId, t)
                                draft = ""
                                messages = listOf(sent) + messages
                            } catch (e: Exception) {
                                err = e.message
                            } finally {
                                sending = false
                            }
                        }
                    },
                    enabled = !sending && draft.isNotBlank(),
                ) { Text("Send") }
            }
        }
    }
}
