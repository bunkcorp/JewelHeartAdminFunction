package org.jewelheart.admin

import android.content.Intent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** Holds the latest email sign-in deep link until the sign-in screen consumes it. */
object EmailLinkIntentHolder {
    var link by mutableStateOf<String?>(null)

    fun ingest(intent: Intent?) {
        val uri = intent?.data?.toString() ?: return
        if (uri.contains("firebaseapp.com", ignoreCase = true) ||
            uri.contains("oobCode=", ignoreCase = true) ||
            uri.contains("mode=signIn", ignoreCase = true)
        ) {
            link = uri
        }
    }

    fun consume(): String? {
        val value = link
        link = null
        return value
    }
}
