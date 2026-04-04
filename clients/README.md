# JewelHeart mobile clients

Minimal **iOS (SwiftUI)** and **Android (Compose)** shells that talk to the same backend as KarmaDots:

- **Base URL:** `https://api.karmadots.org`
- **API prefix:** `/jewelheart`
- **Auth:** Firebase ID token → `Authorization: Bearer <token>`
- **SDUI:** `POST /jewelheart/sdui/screen` with `{ "screenId", "retreatId?", "params?" }`  
  Response matches KarmaDots `schemaVersion` + `screen.components` (see `../shared/sdui-schema/examples/home-screen.json`).

## iOS

The repo includes a generated Xcode project under **`clients/ios/`** (Firebase via SPM: **FirebaseAuth** + **FirebaseCore**). The **`@main`** entry point is **`JewelHeartAppDelegate`** (`UIApplicationDelegate`); **`JewelHeartSceneDelegate`** (`UIWindowSceneDelegate`) creates the window and hosts SwiftUI via **`UIHostingController`**. Do not add a second `@main`.

1. Install [XcodeGen](https://github.com/yonaskolb/XcodeGen) if you change `project.yml`:  
   `cd clients/ios && xcodegen generate`
2. Open **`clients/ios/JewelHeartAdmin.xcodeproj`** in Xcode.
3. **Run on your iPhone “KAW” (not the simulator):** Connect **KAW** with USB (or use a device already paired for wireless debugging). Unlock the phone and tap **Trust** if asked. In the Xcode toolbar, click the **destination** control next to the scheme **JewelHeartAdmin** and select **KAW** under **iOS Device**. Avoid any **Simulator** entry. Then press **⌘R**. If KAW is missing, on the iPhone enable **Developer Mode** (Settings → Privacy & Security) and confirm the Mac is trusted.
4. Let Xcode **resolve packages** (File → Packages → Resolve Package Versions). If resolution fails with *“already exists in file system”*, reset caches: **File → Packages → Reset Package Caches**, or remove stale dirs under `~/Library/Caches/org.swift.swiftpm/artifacts/`.
5. **Firebase config (not in git):** Copy **`clients/ios/GoogleService-Info.plist.example`** → **`clients/ios/GoogleService-Info.plist`**, then replace every placeholder with values from Firebase Console (Project settings → Your apps → iOS `org.jewelheart.admin`, or download **GoogleService-Info.plist** and drop it in **`clients/ios/`**). The Xcode target already includes that filename in **Copy Bundle Resources**.
6. Set **Signing & Capabilities** for your team.
7. In `JewelHeartConfig.swift`, confirm `apiHost` if you use a different API host.

**Command-line build for KAW** (device must be visible to `xcodebuild`; same signing as Xcode):

`./clients/ios/scripts/xcodebuild-kaw.sh build`  
Override with `JEWELHEART_IOS_DEST='platform=iOS,name=Other iPhone' ./clients/ios/scripts/xcodebuild-kaw.sh build`.

**Console diagnostics:** Every diagnostic is also **`print`**’d as **`[JewelHeart][API|UI|Auth] …`** so it always shows in Xcode’s debug console. The same lines go to **`os.Logger`** (subsystem **`org.jewelheart.admin`**) for Console.app / filtering. Failed requests include HTTP status, **cf-ray**, and a truncated body.

**GitHub / leaked plist:** If a real plist was ever pushed, GitHub flags the **API_KEY**. After removing it from the repo, **purge it from git history** (e.g. [`git filter-repo`](https://github.com/newren/git-filter-repo)) or GitHub’s guidance for exposed secrets, then **restrict or rotate** the key in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (API key restrictions; Firebase may issue a new plist if you regenerate).

## Android

1. Open the **KarmaDots** `android/` Gradle project in Android Studio.
2. Run the **`jewelheart-admin`** configuration (installs `org.jewelheart.admin`).
3. Add **`jewelheart-admin/google-services.json`**: in Firebase Console create an Android app with package **`org.jewelheart.admin`**, download config, or merge a second client into your existing JSON.
4. Sync Gradle; build **`:jewelheart-admin`**.

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
