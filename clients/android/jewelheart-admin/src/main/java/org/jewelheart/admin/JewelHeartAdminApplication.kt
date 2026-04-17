package org.jewelheart.admin

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class JewelHeartAdminApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseApp.initializeApp(
                this,
                FirebaseOptions.Builder()
                    .setApplicationId(getString(R.string.firebase_app_id))
                    .setApiKey(getString(R.string.firebase_api_key))
                    .setProjectId(getString(R.string.firebase_project_id))
                    .setGcmSenderId(getString(R.string.firebase_gcm_sender_id))
                    .setStorageBucket(getString(R.string.firebase_storage_bucket))
                    .build(),
            )
        }
    }
}
