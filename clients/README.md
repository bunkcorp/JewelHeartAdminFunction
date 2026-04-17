# JewelHeart mobile clients

Minimal **iOS (SwiftUI)** and **Android (Compose)** shells that talk to the same backend as KarmaDots:

- **Base URL:** `https://api.karmadots.org`
- **API prefix:** `/jewelheart`
- **Auth:** Firebase ID token → `Authorization: Bearer <token>`
- **SDUI:** `POST /jewelheart/sdui/screen` with `{ "screenId", "retreatId?", "params?" }`  
  Response matches KarmaDots `schemaVersion` + `screen.components` (see `../shared/sdui-schema/examples/home-screen.json`).

## iOS

The repo includes a generated Xcode project under **`clients/ios/`** (SPM: **FirebaseAuth**, **FirebaseCore**, **GoogleSignIn**). Sign-in matches **KarmaDots**: Google, Sign in with Apple, email (sign in + create account), and anonymous. The **`@main`** entry point is **`JewelHeartAppDelegate`**; **`JewelHeartSceneDelegate`** hosts SwiftUI. Do not add a second `@main`.

1. Install [XcodeGen](https://github.com/yonaskolb/XcodeGen) if you change `project.yml`:  
   `cd clients/ios && xcodegen generate`
2. Open **`clients/ios/JewelHeartAdmin.xcodeproj`** in Xcode.
3. **Run on your iPhone “KAW” (not the simulator):** Connect **KAW** with USB (or use a device already paired for wireless debugging). Unlock the phone and tap **Trust** if asked. In the Xcode toolbar, click the **destination** control next to the scheme **JewelHeartAdmin** and select **KAW** under **iOS Device**. Avoid any **Simulator** entry. Then press **⌘R**. If KAW is missing, on the iPhone enable **Developer Mode** (Settings → Privacy & Security) and confirm the Mac is trusted.
4. Let Xcode **resolve packages** (File → Packages → Resolve Package Versions). If resolution fails with *“already exists in file system”*, reset caches: **File → Packages → Reset Package Caches**, or remove stale dirs under `~/Library/Caches/org.swift.swiftpm/artifacts/`.
5. **Firebase config (not in git):** Copy **`clients/ios/GoogleService-Info.plist.example`** → **`clients/ios/GoogleService-Info.plist`**, then use real values from Firebase Console (iOS app **`org.jewelheart.admin`**). In **Firebase → Authentication → Sign-in method**, enable **Google**, **Apple**, and **Email/Password** (same as KarmaDots).
6. **Google Sign-In URL scheme:** In **`clients/ios/project.yml`**, set **`GOOGLE_REVERSED_CLIENT_ID`** to the **`REVERSED_CLIENT_ID`** string from **`GoogleService-Info.plist`** (then `xcodegen generate`). That value is merged via **`Supporting/GoogleURLScheme.plist`** so the OAuth redirect works.
7. **Sign in with Apple (device builds):** The target uses **`JewelHeartAdmin.entitlements`**. In [Apple Developer](https://developer.apple.com) → Identifiers → **`org.jewelheart.admin`** → enable **Sign in with Apple**, then refresh your provisioning profile (Xcode **Signing & Capabilities**). Without this, **device** builds can fail; Simulator builds may still succeed.
8. Set **Signing & Capabilities** for your team.
9. In `JewelHeartConfig.swift`, confirm `apiHost` if you use a different API host.

**Command-line build for KAW** (device must be visible to `xcodebuild`; same signing as Xcode):

`./clients/ios/scripts/xcodebuild-kaw.sh build`  
Override with `JEWELHEART_IOS_DEST='platform=iOS,name=Other iPhone' ./clients/ios/scripts/xcodebuild-kaw.sh build`.

**Console diagnostics:** Every diagnostic is also **`print`**’d as **`[JewelHeart][API|UI|Auth] …`** so it always shows in Xcode’s debug console. The same lines go to **`os.Logger`** (subsystem **`org.jewelheart.admin`**) for Console.app / filtering. Failed requests include HTTP status, **cf-ray**, and a truncated body.

**GitHub / leaked plist:** If a real plist was ever pushed, GitHub flags the **API_KEY**. After removing it from the repo, **purge it from git history** (e.g. [`git filter-repo`](https://github.com/newren/git-filter-repo)) or GitHub’s guidance for exposed secrets, then **restrict or rotate** the key in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (API key restrictions; Firebase may issue a new plist if you regenerate).

## Android

Module: **`clients/android/jewelheart-admin`** (standalone Gradle project in this repo; no KarmaDots `:app` required).

1. Open **`clients/android/`** in Android Studio (root **`JewelHeartAdminAndroid`**). Use **JDK 17+** for Gradle (Android Studio’s embedded JDK is fine).
2. Ensure the Android SDK is configured: Android Studio usually creates **`local.properties`** with `sdk.dir=…`. From the command line, set **`ANDROID_HOME`** or copy **`local.properties.example`** → **`local.properties`** and edit the path.
3. Add **`jewelheart-admin/google-services.json`** (Firebase Android app **`org.jewelheart.admin`**). The file is gitignored; see **`jewelheart-admin/README.md`**.
4. **`strings.xml`** includes **`default_web_client_id`** for Google Sign-In; adjust if you use another Firebase / OAuth client.
5. Run **`jewelheart-admin`** — bottom tabs match the iOS shell: **SDUI**, **Retreats** (Navigation Compose: jobs, slots, tasks, linked volunteers, CSV import, schedule, reports), **Directory** (global volunteer search), **Meta** (health, UID, SDUI action, sign out). Auth: email, anonymous, Google (same as iOS).
6. From **`clients/android/`**: `./gradlew :jewelheart-admin:assembleDebug` (with **`JAVA_HOME`** pointing at JDK 17+ if your default `java` is older).

A copy of the same module also remains in **`buddhist-stone-ios-app/android/jewelheart-admin`** if you prefer building inside the KarmaDots Android monorepo; keep them in sync when you change one.

## Production private-server sync

From a machine that can SSH to the host:

```bash
export JEWELHEART_DEPLOY_SSH="you@your-server"
export JEWELHEART_PRIVATE_SERVER_SRC="$HOME/path/to/buddhist-stone-ios-app/private-server"
./scripts/rsync-private-server-to-prod.sh
```

Then on the server: `cd ~/private-server && npm ci` and restart your process (pm2/systemd/etc.).

## ACL reminder

After sign-in, create a retreat (REST or SDUI action `mutations.createRetreat`) or run `scripts/sql/insert-jewelheart-admin-global.sql` (edit UID) so `/jewelheart/*` returns data for global admins.
