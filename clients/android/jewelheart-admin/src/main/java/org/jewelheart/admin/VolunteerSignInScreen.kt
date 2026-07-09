package org.jewelheart.admin

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Text
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.auth.api.signin.GoogleSignInStatusCodes
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.api.ApiException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

@Composable
fun VolunteerSignInScreen(
    pendingEmailLink: String?,
    onSignedIn: () -> Unit,
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf(VolunteerAuthEmail.loadPendingEmail(ctx).orEmpty()) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var emailSentMessage by remember { mutableStateOf<String?>(null) }
    var isError by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    val webClientId = ctx.getString(R.string.default_web_client_id)
    val gso = remember(webClientId) {
        GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(webClientId)
            .requestEmail()
            .build()
    }
    val googleClient = remember(ctx, gso) { GoogleSignIn.getClient(ctx, gso) }

    fun refreshEmailButtonEnabled(): Boolean = VolunteerAuthEmail.describeEmailError(email) == null

    val googleLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode != Activity.RESULT_OK) {
            if (result.resultCode != Activity.RESULT_CANCELED) {
                statusMessage = "Google sign-in failed (result code ${result.resultCode})."
                isError = true
            }
            return@rememberLauncherForActivityResult
        }
        scope.launch {
            busy = true
            statusMessage = null
            isError = false
            try {
                val account = GoogleSignIn.getSignedInAccountFromIntent(result.data)
                    .getResult(ApiException::class.java)
                val token = account.idToken
                if (token.isNullOrEmpty()) {
                    statusMessage =
                        "Google returned no ID token. Register SHA-1 in Firebase for \"${ctx.packageName}\"."
                    isError = true
                    return@launch
                }
                val cred = GoogleAuthProvider.getCredential(token, null)
                FirebaseAuth.getInstance().signInWithCredential(cred).await()
                onSignedIn()
            } catch (e: ApiException) {
                statusMessage = when (e.statusCode) {
                    GoogleSignInStatusCodes.SIGN_IN_CANCELLED -> null
                    ConnectionResult.DEVELOPER_ERROR ->
                        "Google Play services config error (code 10). Add Android app SHA-1 in Firebase."
                    else -> "Google sign-in error ${e.statusCode}: ${e.message}"
                }
                isError = statusMessage != null
            } catch (e: Exception) {
                statusMessage = e.message ?: e.toString()
                isError = true
            } finally {
                busy = false
            }
        }
    }

    LaunchedEffect(pendingEmailLink) {
        val link = pendingEmailLink ?: return@LaunchedEffect
        busy = true
        statusMessage = "Completing sign-in from email link…"
        isError = false
        try {
            VolunteerAuthEmail.completeEmailLinkIfPresent(ctx, link, email)
            emailSentMessage = null
            statusMessage = null
            onSignedIn()
        } catch (e: Exception) {
            statusMessage = VolunteerAuthEmail.formatAuthError(e)
            isError = true
        } finally {
            busy = false
        }
    }

    VolunteerAuthScaffold {
        Spacer(Modifier.height(6.dp))
        VolunteerBlueBar("Choose sign-in method:")
        Spacer(Modifier.height(6.dp))

        VolunteerMaroonButton(
            text = "By Google",
            enabled = !busy,
            onClick = {
                scope.launch {
                    runCatching { googleClient.signOut().await() }
                    googleLauncher.launch(googleClient.signInIntent)
                }
            },
        )

        Spacer(Modifier.height(10.dp))

        VolunteerGrayTextField(
            value = email,
            onValueChange = {
                email = it
                emailSentMessage = null
                val err = VolunteerAuthEmail.describeEmailError(it)
                if (err != null && it.isNotBlank()) {
                    statusMessage = err
                    isError = true
                } else {
                    statusMessage = null
                    isError = false
                }
            },
            placeholder = "Enter email address",
        )

        VolunteerMaroonButton(
            text = "By email",
            enabled = !busy && refreshEmailButtonEnabled(),
            onClick = {
                scope.launch {
                    busy = true
                    statusMessage = null
                    isError = false
                    emailSentMessage = null
                    val normalized = VolunteerAuthEmail.normalizeEmail(email)
                    val fmtErr = VolunteerAuthEmail.describeEmailError(normalized)
                    if (fmtErr != null) {
                        statusMessage = fmtErr
                        isError = true
                        busy = false
                        return@launch
                    }
                    try {
                        VolunteerAuthEmail.sendSignInLink(ctx, normalized)
                        email = normalized
                        emailSentMessage = VolunteerAuthEmail.emailSentMessage()
                        statusMessage = null
                        isError = false
                    } catch (e: Exception) {
                        statusMessage = VolunteerAuthEmail.formatAuthError(e)
                        isError = true
                    } finally {
                        busy = false
                    }
                }
            },
        )

        emailSentMessage?.let { sent ->
            Text(
                sent,
                color = Color.Black,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 8.dp),
            )
        }

        statusMessage?.let { VolunteerAuthMessage(it, isError) }

        if (busy) {
            Spacer(Modifier.height(12.dp))
            CircularProgressIndicator()
        }
    }
}
