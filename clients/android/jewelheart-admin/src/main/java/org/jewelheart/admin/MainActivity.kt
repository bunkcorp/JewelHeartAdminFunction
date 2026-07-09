package org.jewelheart.admin

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        EmailLinkIntentHolder.ingest(intent)
        enableEdgeToEdge()
        setContent {
            JewelHeartTheme {
                Surface(Modifier.fillMaxSize()) {
                    JewelHeartAdminApp()
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        EmailLinkIntentHolder.ingest(intent)
    }
}
