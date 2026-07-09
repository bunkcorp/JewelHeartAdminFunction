package org.jewelheart.admin

import android.content.Context
import com.google.firebase.auth.ActionCodeSettings
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.tasks.await
import java.text.DateFormat
import java.util.Date
import java.util.Locale

object VolunteerAuthEmail {
    const val PREFS = "jh_volunteer_auth"
    const val KEY_PENDING_EMAIL = "email_for_link"
    const val MAGIC_LINK_TTL_MINUTES = 60

    fun normalizeEmail(raw: String): String {
        val s = raw.trim().lowercase(Locale.US)
        return if (s.contains('@')) s else ""
    }

    fun isValidEmailFormat(raw: String): Boolean {
        val s = normalizeEmail(raw)
        if (s.isEmpty()) return false
        return Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(s)
    }

    fun describeEmailError(raw: String): String? {
        val s = raw.trim()
        if (s.isEmpty()) return "Enter your email address."
        if (s.any { it.isWhitespace() }) return "Error: remove spaces from the email address, fix & retry."
        if (!s.contains('@')) return "Error: email address must include @, fix & retry."
        val parts = s.split('@')
        if (parts.size != 2 || parts[0].isEmpty() || parts[1].isEmpty()) {
            return "Error: email address format is invalid, fix & retry."
        }
        if (!parts[1].contains('.')) {
            return "Error: domain looks incomplete (missing .), fix & retry."
        }
        if (isValidEmailFormat(s)) return null
        return "Error: email address format is invalid, fix & retry."
    }

    fun formatMagicLinkExpiry(): String {
        val expires = Date(System.currentTimeMillis() + MAGIC_LINK_TTL_MINUTES * 60_000L)
        return DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT, Locale.getDefault()).format(expires)
    }

    fun emailSentMessage(): String =
        "Email sent, click link in it, expires ${formatMagicLinkExpiry()}"

    fun savePendingEmail(ctx: Context, email: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_PENDING_EMAIL, email)
            .apply()
    }

    fun loadPendingEmail(ctx: Context): String? =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_PENDING_EMAIL, null)
            ?.let { normalizeEmail(it) }
            ?.takeIf { it.isNotEmpty() }

    fun clearPendingEmail(ctx: Context) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_PENDING_EMAIL)
            .apply()
    }

    fun buildActionCodeSettings(packageName: String): ActionCodeSettings =
        ActionCodeSettings.newBuilder()
            .setUrl("https://gettingstoned-4aee3.firebaseapp.com/finishSignIn")
            .setHandleCodeInApp(true)
            .setAndroidPackageName(packageName, true, null)
            .build()

    fun formatAuthError(e: Exception): String {
        val msg = e.message ?: return e.toString()
        return when {
            msg.contains("OPERATION_NOT_ALLOWED", ignoreCase = true) ->
                "Error: email link sign-in is not enabled in Firebase yet. Ask the organizers."
            msg.contains("invalid-email", ignoreCase = true) ->
                "Error: email address format is invalid, fix & retry."
            msg.contains("too-many-requests", ignoreCase = true) ->
                "Error: too many sign-in attempts. Wait a few minutes, fix & retry."
            msg.contains("invalid-action-code", ignoreCase = true) ->
                "Error: sign-in link expired or already used. Request a new link, fix & retry."
            else -> "Error: $msg, fix & retry"
        }
    }

    suspend fun sendSignInLink(ctx: Context, email: String) {
        val settings = buildActionCodeSettings(ctx.packageName)
        FirebaseAuth.getInstance().sendSignInLinkToEmail(email, settings).await()
        savePendingEmail(ctx, email)
    }

    suspend fun completeEmailLinkIfPresent(ctx: Context, link: String, fallbackEmail: String): Boolean {
        val auth = FirebaseAuth.getInstance()
        if (!auth.isSignInWithEmailLink(link)) return false
        val email = loadPendingEmail(ctx) ?: normalizeEmail(fallbackEmail)
        if (email.isEmpty()) error("Error: enter the same email address you used for the link, fix & retry.")
        auth.signInWithEmailLink(email, link).await()
        clearPendingEmail(ctx)
        return true
    }
}
