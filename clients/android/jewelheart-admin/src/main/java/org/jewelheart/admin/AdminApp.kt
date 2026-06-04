package org.jewelheart.admin

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentWidth
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.layout.PaddingValues
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
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    val webClientId = ctx.getString(R.string.default_web_client_id)
    val gso = remember(webClientId) {
        GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(webClientId)
            .requestEmail()
            .build()
    }
    val googleClient = remember(ctx, gso) { GoogleSignIn.getClient(ctx, gso) }

    val googleLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode != Activity.RESULT_OK) {
            message =
                if (result.resultCode == Activity.RESULT_CANCELED) {
                    "Google sign-in canceled."
                } else {
                    "Google sign-in failed (result code ${result.resultCode})."
                }
            return@rememberLauncherForActivityResult
        }
        scope.launch {
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
            enabled = !busy && email.isNotBlank() && password.isNotEmpty(),
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
            enabled = !busy && email.isNotBlank() && password.length >= 6,
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
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Continue anonymously") }

        Button(
            onClick = {
                scope.launch {
                    try {
                        googleClient.signOut().await()
                    } catch (_: Exception) {
                    }
                    googleLauncher.launch(googleClient.signInIntent)
                }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Sign in with Google") }

        if (busy) CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
    }
}

@Composable
private fun AdminTabShell() {
    var tab by remember { mutableIntStateOf(0) }
    val retreatNav = rememberNavController()
    val directoryNav = rememberNavController()
    val homeSduiVm: JewelHeartViewModel = viewModel(key = "home_sdui") {
        JewelHeartViewModel(initialScreenId = "retreat.list")
    }
    val volunteerSduiVm: JewelHeartViewModel = viewModel(key = "volunteer_sdui") {
        JewelHeartViewModel(initialScreenId = "jewelheart.home")
    }

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = tab == 0,
                    onClick = { tab = 0 },
                    icon = { Icon(Icons.Filled.Home, contentDescription = null) },
                    label = { Text("Home") },
                )
                NavigationBarItem(
                    selected = tab == 1,
                    onClick = { tab = 1 },
                    icon = { Icon(Icons.Filled.List, contentDescription = null) },
                    label = { Text("Retreats") },
                )
                NavigationBarItem(
                    selected = tab == 2,
                    onClick = { tab = 2 },
                    icon = { Icon(Icons.Filled.Groups, contentDescription = null) },
                    label = { Text("Directory") },
                )
                NavigationBarItem(
                    selected = tab == 3,
                    onClick = {
                        if (tab == 3) volunteerSduiVm.resetToVolunteerHome()
                        tab = 3
                    },
                    icon = { Icon(Icons.Filled.VolunteerActivism, contentDescription = null) },
                    label = { Text("Volunteer") },
                )
                NavigationBarItem(
                    selected = tab == 4,
                    onClick = { tab = 4 },
                    icon = { Icon(Icons.Filled.Settings, contentDescription = null) },
                    label = { Text("Settings") },
                )
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (tab) {
                0 -> SduiTabContent(vm = homeSduiVm)
                1 -> RetreatNavHost(navController = retreatNav)
                2 -> DirectoryNavHost(navController = directoryNav)
                3 -> SduiTabContent(vm = volunteerSduiVm)
                4 -> MetaTabContent()
            }
        }
    }
}

@Composable
fun SduiTabContent(vm: JewelHeartViewModel) {
    val ctx = LocalContext.current
    androidx.compose.runtime.LaunchedEffect(FirebaseAuth.getInstance().currentUser?.uid) {
        vm.load()
    }
    Column(Modifier.fillMaxSize()) {
        when {
            vm.loading -> CircularProgressIndicator(
                Modifier
                    .align(Alignment.CenterHorizontally)
                    .padding(horizontal = 16.dp),
            )
            vm.error != null -> Text(
                vm.error!!,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
            vm.envelope != null -> {
                val s = vm.envelope!!.screen
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    s.components?.forEach { SduiComponentView(it, vm, ctx) }
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
            val inner: @Composable () -> Unit = {
                if (c.layout == "row") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(spacing, Alignment.CenterHorizontally),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        c.children?.forEach { SduiComponentView(it, vm, ctx) }
                    }
                } else {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(spacing),
                    ) {
                        c.children?.forEach { SduiComponentView(it, vm, ctx) }
                    }
                }
            }
            val bg = sduiBackgroundColor(c.style?.backgroundColor)
            if (bg != null) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(bg)
                        .padding(sduiBarPadding(c.style)),
                ) {
                    inner()
                }
            } else {
                val alignH = when (c.textStyle?.textAlign?.lowercase()) {
                    "center" -> Alignment.CenterHorizontally
                    "right", "trailing" -> Alignment.End
                    else -> Alignment.Start
                }
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = alignH,
                ) {
                    inner()
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
            val align = when (c.textStyle?.textAlign?.lowercase()) {
                "center" -> TextAlign.Center
                "right", "trailing" -> TextAlign.End
                else -> TextAlign.Start
            }
            val fg = sduiTextForegroundColor(c, MaterialTheme.colorScheme.onSurface)
            val bg = sduiBackgroundColor(c.style?.backgroundColor)
            val pad = sduiBarPadding(c.style)
            val mod = Modifier
                .fillMaxWidth()
                .then(if (bg != null) Modifier.background(bg).padding(pad) else Modifier.padding(horizontal = 16.dp))
            val textModifier = c.action?.let { action ->
                mod.clickable {
                    if (action.type == "openUrl" && action.target != null) {
                        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(action.target)))
                    } else {
                        vm.onAction(action)
                    }
                }
            } ?: mod
            Text(
                text = c.content ?: "",
                modifier = textModifier,
                fontSize = size,
                fontWeight = weight,
                color = fg,
                textAlign = align,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        "button" -> {
            val bg = sduiBackgroundColor(c.style?.backgroundColor)
            val fg = sduiTextForegroundColor(c, MaterialTheme.colorScheme.onPrimary)
            val pad = sduiBarPadding(c.style)
            val centered = c.textStyle?.textAlign?.lowercase() == "center"
            val onClick: () -> Unit = {
                val a = c.action
                if (a != null) {
                    if (a.type == "openUrl" && a.target != null) {
                        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(a.target)))
                    } else {
                        vm.onAction(a)
                    }
                }
            }
            val label = c.label ?: c.content ?: "Button"
            val textWeight = when (c.textStyle?.fontWeight?.lowercase()) {
                "bold" -> FontWeight.Bold
                "semibold" -> FontWeight.SemiBold
                else -> FontWeight.Normal
            }
            val textAlign = when (c.textStyle?.textAlign?.lowercase()) {
                "center" -> TextAlign.Center
                "right", "trailing" -> TextAlign.End
                else -> TextAlign.Start
            }
            if (bg != null) {
                val radius = (c.style?.borderRadius ?: 8.0).dp
                val shape = androidx.compose.foundation.shape.RoundedCornerShape(radius)
                val buttonModifier = Modifier
                    .wrapContentWidth()
                    .background(bg, shape)
                    .padding(pad)
                val rowModifier = if (centered) {
                    Modifier.fillMaxWidth()
                } else {
                    Modifier.fillMaxWidth()
                }
                Box(modifier = rowModifier, contentAlignment = Alignment.Center) {
                    TextButton(
                        onClick = onClick,
                        modifier = buttonModifier,
                        contentPadding = PaddingValues(0.dp),
                    ) {
                        Text(
                            label,
                            color = fg,
                            fontSize = (c.textStyle?.fontSize ?: 16.0).sp,
                            fontWeight = textWeight,
                            textAlign = textAlign,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.wrapContentWidth(),
                        )
                    }
                }
            } else {
                Button(
                    onClick = onClick,
                    modifier = Modifier.padding(vertical = 4.dp),
                ) {
                    Text(label)
                }
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

private fun sduiParseHexColor(hex: String?): Color? {
    if (hex.isNullOrBlank() || !hex.startsWith("#")) return null
    return runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrNull()
}

private fun sduiBackgroundColor(hex: String?): Color? = sduiParseHexColor(hex)

private fun sduiTextForegroundColor(c: UiComponent, defaultOnSurface: Color): Color {
    sduiParseHexColor(c.textStyle?.color)?.let { return it }
    val content = c.content.orEmpty()
    if (content.contains("does not exist", ignoreCase = true)) return JewelHeartColors.ErrorRed
    if (content.contains("Demo schedule", ignoreCase = true)) return JewelHeartColors.DemoNoteGray
    return defaultOnSurface
}

private fun sduiBarPadding(style: ComponentStyle?): PaddingValues {
    val p = style?.padding ?: return PaddingValues(0.dp)
    return PaddingValues(
        start = (p.left ?: p.all ?: 8.0).dp,
        top = (p.top ?: p.all ?: 10.0).dp,
        end = (p.right ?: p.all ?: 8.0).dp,
        bottom = (p.bottom ?: p.all ?: 10.0).dp,
    )
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
