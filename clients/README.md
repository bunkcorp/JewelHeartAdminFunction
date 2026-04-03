# JewelHeart mobile clients

Minimal **iOS (SwiftUI)** and **Android (Compose)** shells that talk to the same backend as KarmaDots:

- **Base URL:** `https://api.karmadots.org`
- **API prefix:** `/jewelheart`
- **Auth:** Firebase ID token → `Authorization: Bearer <token>`
- **SDUI:** `POST /jewelheart/sdui/screen` with `{ "screenId", "retreatId?", "params?" }`  
  Response matches KarmaDots `schemaVersion` + `screen.components` (see `../shared/sdui-schema/examples/home-screen.json`).

## iOS

1. Xcode → **App** → Product Name **JewelHeartAdmin**, Interface **SwiftUI**.
2. Add Swift Package: **Firebase** (Auth; optionally Analytics).
3. Add `GoogleService-Info.plist` from your Firebase project (same project as KarmaDots is fine; add an iOS app with your new bundle ID).
4. Drag all files from **`clients/ios/Sources/`** into the app target.
5. Set **Signing** and a unique **Bundle ID** (e.g. `org.jewelheart.admin`).
6. In `JewelHeartConfig.swift`, confirm `apiHost` if you use a different tunnel host.

## Android

1. Open the **KarmaDots** `android/` Gradle project in Android Studio.
2. Run the **`jewelheart-admin`** configuration (installs `org.jewelheart.admin`).
3. Add **`jewelheart-admin/google-services.json`**: in Firebase Console create an Android app with package **`org.jewelheart.admin`**, download config, or merge a second client into your existing JSON.
4. Sync Gradle; build **`:jewelheart-admin`**.

## ACL reminder

After sign-in, create a retreat (REST or SDUI action `mutations.createRetreat`) or insert a row in `jewelheart_admins` for your Firebase UID so `/jewelheart/*` returns data.
