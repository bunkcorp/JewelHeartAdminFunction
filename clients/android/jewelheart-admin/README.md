# JewelHeart Admin (Android)

1. Firebase Console → your project → add Android app with package **`org.jewelheart.admin`**.
2. Download **`google-services.json`** into this folder (`clients/android/jewelheart-admin/` in the JewelHeartAdminFunction repo).
3. Sync Gradle; run configuration **jewelheart-admin**.

If the file is missing, the `google-services` plugin is not applied and Firebase Auth will not initialize.
