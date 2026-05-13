package org.jewelheart.admin

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.material3.Button
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.rememberNavController
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.auth.api.signin.GoogleSignInStatusCodes
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.api.ApiException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.io.File

@Composable
fun JewelHeartAdminApp() {
    val auth = FirebaseAuth.getInstance()
    var user by remember { mutableStateOf(auth.currentUser) }
    DisposableEffect(Unit) {
        val listener = FirebaseAuth.AuthStateListener { a -> user = a.currentUser }
        auth.addAuthStateListener(listener)
        onDispose { auth.removeAuthStateListener(listener) }
    }

    if (user == null) {
        SignInScreen(onSignedIn = { user = auth.currentUser })
    } else {
        AdminTabShell()
    }
}

@Composable
private fun SignInScreen(onSignedIn: () -> Unit) {
    val ctx = LocalContext.current
    val activity = ctx as? ComponentActivity
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    /** Google account picker is a separate Activity; guard double-taps and avoid overlapping auth UI (stale session / false "cancelled"). */
    var googleSigningIn by remember { mutableStateOf(false) }

    val webClientId = ctx.getString(R.string.default_web_client_id)
    // Explicit ID-token options (Firebase). Avoid wrapping DEFAULT_SIGN_IN — without google-services.json in this
    // module, DEFAULT_SIGN_IN can disagree with the Web client ID you pass here on some devices.
    val gso = remember(webClientId) {
        GoogleSignInOptions.Builder()
            .requestIdToken(webClientId)
            .requestEmail()
            .requestProfile()
            .build()
    }
    val googleClient =
        remember(activity, gso) {
            if (activity != null) GoogleSignIn.getClient(activity, gso) else null
        }

    val googleLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        scope.launch {
            try {
                if (result.resultCode != Activity.RESULT_OK) {
                    message =
                        if (result.resultCode == Activity.RESULT_CANCELED) {
                            "Google sign-in closed before completing. If you did not cancel, check: Play Services " +
                                "updated, device online, and in Firebase Console the Android app " +
                                "\"${ctx.packageName}\" has this build’s SHA-1/SHA-256; then try again."
                        } else {
                            "Google sign-in failed (result code ${result.resultCode})."
                        }
                    return@launch
                }
                googleSigningIn = false
                busy = true
                message = null
                try {
                    val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
                    val account = task.getResult(ApiException::class.java)
                    val token = account.idToken
                    if (token.isNullOrEmpty()) {
                        message =
                            "Google returned no ID token for this app. In Firebase Console → Project settings → Your apps, " +
                                "add Android app \"${ctx.packageName}\" and register your debug/release SHA-1 fingerprints, " +
                                "then download google-services.json into the jewelheart-admin module (or rebuild after saving)."
                        return@launch
                    }
                    val cred = GoogleAuthProvider.getCredential(token, null)
                    FirebaseAuth.getInstance().signInWithCredential(cred).await()
                    onSignedIn()
                } catch (e: ApiException) {
                    message =
                        when (e.statusCode) {
                            GoogleSignInStatusCodes.SIGN_IN_CANCELLED -> "Google sign-in canceled."
                            ConnectionResult.DEVELOPER_ERROR ->
                                "Google Play services config error (code 10). Add Android app \"${ctx.packageName}\" " +
                                    "in the same Firebase project and register your signing SHA-1/SHA-256, then sync."
                            else -> "Google sign-in error ${e.statusCode}: ${e.message}"
                        }
                } catch (e: Exception) {
                    message = e.message ?: e.toString()
                } finally {
                    busy = false
                }
            } finally {
                googleSigningIn = false
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("JewelHeart Admin", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Same Firebase project as KarmaDots. Sign in like the iOS app.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        message?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

        OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = password, onValueChange = { password = it }, label = { Text("Password") }, singleLine = true, modifier = Modifier.fillMaxWidth())

        Button(
            onClick = {
                scope.launch {
                    busy = true
                    message = null
                    try {
                        FirebaseAuth.getInstance().signInWithEmailAndPassword(email.trim(), password).await()
                        onSignedIn()
                    } catch (e: Exception) {
                        message = e.message
                    } finally {
                        busy = false
                    }
                }
            },
            enabled = !busy && !googleSigningIn && email.isNotBlank() && password.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Sign in with email") }

        Button(
            onClick = {
                scope.launch {
                    busy = true
                    message = null
                    try {
                        FirebaseAuth.getInstance().createUserWithEmailAndPassword(email.trim(), password).await()
                        onSignedIn()
                    } catch (e: Exception) {
                        message = e.message
                    } finally {
                        busy = false
                    }
                }
            },
            enabled = !busy && !googleSigningIn && email.isNotBlank() && password.length >= 6,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Create account (email)") }

        Button(
            onClick = {
                scope.launch {
                    busy = true
                    message = null
                    try {
                        FirebaseAuth.getInstance().signInAnonymously().await()
                        onSignedIn()
                    } catch (e: Exception) {
                        message = e.message
                    } finally {
                        busy = false
                    }
                }
            },
            enabled = !busy && !googleSigningIn,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Continue anonymously") }

        Button(
            onClick = {
                scope.launch {
                    if (googleSigningIn || busy) return@launch
                    val client = googleClient
                    if (client == null || activity == null) {
                        message =
                            "Google Sign-In needs an Activity context. If this persists, reinstall the app or open it from the launcher (not a deep link preview)."
                        return@launch
                    }
                    googleSigningIn = true
                    message = null
                    try {
                        // Do not call signOut() immediately before signInIntent — on many devices that yields
                        // RESULT_CANCELED / false “user canceled” (RN iOS workaround does not always apply to Play Services).
                        googleLauncher.launch(client.signInIntent)
                    } catch (e: Exception) {
                        googleSigningIn = false
                        message = e.message ?: e.toString()
                    }
                }
            },
            enabled = !busy && !googleSigningIn && googleClient != null,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Sign in with Google") }

        if (busy) CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
    }
}

@Composable
private fun AdminTabShell() {
    val single = JewelHeartConfig.singleRetreatDevMode
    var tab by remember { mutableIntStateOf(0) }
    var homeSection by remember { mutableIntStateOf(0) }
    val retreatNav = rememberNavController()
    val directoryNav = rememberNavController()
    val volunteerNav = rememberNavController()
    val sduiVm: JewelHeartViewModel = viewModel()

    var resolvedRetreatId by remember { mutableStateOf<String?>(null) }
    var resolvedRetreatName by remember { mutableStateOf<String?>(null) }
    var retreatResolveErr by remember { mutableStateOf<String?>(null) }

    androidx.compose.runtime.LaunchedEffect(single, FirebaseAuth.getInstance().currentUser?.uid) {
        if (!single) return@LaunchedEffect
        retreatResolveErr = null
        resolvedRetreatId = null
        resolvedRetreatName = null
        val repo = JewelHeartRepository()
        val fixed = JewelHeartConfig.singleRetreatId?.trim()?.takeIf { it.isNotEmpty() }
        if (fixed != null) {
            resolvedRetreatId = fixed
            try {
                resolvedRetreatName = repo.getRetreat(fixed).name
            } catch (_: Exception) {
                resolvedRetreatName = "Summer retreat"
            }
            return@LaunchedEffect
        }
        try {
            val items = repo.listRetreats(limit = 100).items
            val terms = JewelHeartConfig.singleRetreatNameMatchers
            val match = items.firstOrNull { r -> terms.all { t -> r.name.contains(t, ignoreCase = true) } }
            resolvedRetreatId = match?.id
            resolvedRetreatName = match?.name
            if (resolvedRetreatId == null) {
                retreatResolveErr =
                    "No retreat matched ${terms.joinToString(" + ")}. Set JewelHeartConfig.singleRetreatId to the retreat UUID."
            }
        } catch (e: Exception) {
            retreatResolveErr = e.message ?: e.toString()
        }
    }

    val directoryTab = if (single) 1 else 2
    val volunteerTab = if (single) 2 else 3
    val settingsTab = if (single) 3 else 4

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = tab == 0,
                    onClick = { tab = 0 },
                    icon = { Icon(Icons.Filled.Home, contentDescription = null) },
                    label = { Text("Home") },
                )
                if (!single) {
                    NavigationBarItem(
                        selected = tab == 1,
                        onClick = { tab = 1 },
                        icon = { Icon(Icons.Filled.List, contentDescription = null) },
                        label = { Text("Retreats") },
                    )
                }
                NavigationBarItem(
                    selected = tab == directoryTab,
                    onClick = { tab = directoryTab },
                    icon = { Icon(Icons.Filled.Groups, contentDescription = null) },
                    label = { Text("Directory") },
                )
                NavigationBarItem(
                    selected = tab == volunteerTab,
                    onClick = { tab = volunteerTab },
                    icon = { Icon(Icons.Filled.VolunteerActivism, contentDescription = null) },
                    label = { Text("Volunteer") },
                )
                NavigationBarItem(
                    selected = tab == settingsTab,
                    onClick = { tab = settingsTab },
                    icon = { Icon(Icons.Filled.Settings, contentDescription = null) },
                    label = { Text("Settings") },
                )
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (tab) {
                0 -> {
                    if (single) {
                        Column(Modifier.fillMaxSize()) {
                            val retreatLabel = resolvedRetreatName ?: "Summer retreat"
                            TabRow(selectedTabIndex = homeSection) {
                                Tab(
                                    selected = homeSection == 0,
                                    onClick = { homeSection = 0 },
                                    text = { Text("Home") },
                                )
                                Tab(
                                    selected = homeSection == 1,
                                    onClick = { homeSection = 1 },
                                    text = { Text(retreatLabel, maxLines = 1) },
                                )
                            }
                            retreatResolveErr?.let {
                                Text(
                                    it,
                                    color = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.padding(8.dp),
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                            Box(Modifier.weight(1f).fillMaxWidth()) {
                                when (homeSection) {
                                    0 -> SduiTabContent(vm = sduiVm)
                                    1 -> {
                                        val rid = resolvedRetreatId
                                        if (rid != null) {
                                            RetreatNavHost(navController = retreatNav, startRetreatDetailId = rid)
                                        } else {
                                            CircularProgressIndicator(Modifier.align(Alignment.Center))
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        SduiTabContent(vm = sduiVm)
                    }
                }
                1 -> {
                    if (single) {
                        DirectoryNavHost(navController = directoryNav)
                    } else {
                        RetreatNavHost(navController = retreatNav)
                    }
                }
                2 -> {
                    if (single) {
                        VolunteerNavHost(navController = volunteerNav)
                    } else {
                        DirectoryNavHost(navController = directoryNav)
                    }
                }
                3 -> {
                    if (single) {
                        MetaTabContent()
                    } else {
                        VolunteerNavHost(navController = volunteerNav)
                    }
                }
                4 -> {
                    if (!single) {
                        MetaTabContent()
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SduiTabContent(vm: JewelHeartViewModel) {
    val ctx = LocalContext.current
    androidx.compose.runtime.LaunchedEffect(FirebaseAuth.getInstance().currentUser?.uid) {
        vm.load()
    }
    val topTitle =
        when {
            vm.loading || vm.envelope == null -> "Home"
            else -> vm.envelope!!.screen.title ?: "Home"
        }
    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text(topTitle) },
                actions = { TextButton(onClick = { vm.load() }) { Text("Reload") } },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp)) {
            when {
                vm.loading -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
                vm.error != null -> Text(vm.error!!, color = MaterialTheme.colorScheme.error)
                vm.envelope != null -> {
                    val s = vm.envelope!!.screen
                    Column(Modifier.verticalScroll(rememberScrollState())) {
                        // `screen.title` is only in the top app bar (matches iOS nav title).
                        s.components?.forEach { SduiComponentView(it, vm, ctx) }
                    }
                }
            }
        }
    }
}

@Composable
private fun SduiComponentView(
    c: UiComponent,
    vm: JewelHeartViewModel,
    ctx: android.content.Context,
) {
    when (c.type) {
        "container" -> {
            val spacing = (c.spacing ?: 16.0).dp
            if (c.layout == "row") {
                Row(horizontalArrangement = Arrangement.spacedBy(spacing)) {
                    c.children?.forEach { SduiComponentView(it, vm, ctx) }
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(spacing)) {
                    c.children?.forEach { SduiComponentView(it, vm, ctx) }
                }
            }
        }
        "text" -> {
            val size = (c.textStyle?.fontSize ?: 16.0).sp
            val weight = when (c.textStyle?.fontWeight?.lowercase()) {
                "bold" -> FontWeight.Bold
                "semibold" -> FontWeight.SemiBold
                else -> FontWeight.Normal
            }
            Text(c.content ?: "", fontSize = size, fontWeight = weight)
        }
        "button" -> {
            Button(
                onClick = {
                    val a = c.action ?: return@Button
                    if (a.type == "openUrl" && a.target != null) {
                        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(a.target)))
                    } else {
                        vm.onAction(a)
                    }
                },
                modifier = Modifier.padding(vertical = 4.dp),
            ) {
                Text(c.label ?: c.content ?: "Button")
            }
        }
        "spacer" -> {
            val h = c.style?.height?.value ?: 12.0
            Spacer(Modifier.height(h.dp))
        }
        "card" -> {
            Column(Modifier.padding(12.dp)) {
                c.children?.forEach { SduiComponentView(it, vm, ctx) }
            }
        }
        else -> Text("[${c.type}]", style = MaterialTheme.typography.labelSmall)
    }
}

fun shareDownload(ctx: android.content.Context, download: DownloadResult) {
    val f = File(ctx.cacheDir, download.filename.replace("/", "-"))
    f.writeBytes(download.data)
    val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", f)
    val send = Intent(Intent.ACTION_SEND).apply {
        type = download.mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    ctx.startActivity(Intent.createChooser(send, "Share"))
}
