# ⚡ Bolt Browser
[Download Android APK](https://github.com/niklas-h1y/Bolt-Browser/releases/download/v0.1-debug/Bolt_Browser.apk)
Bolt Browser has a desktop Electron browser, an Android browser, and a lightweight hosted start page.

- **Desktop:** Electron + Chromium, tabs, downloads, workspaces, reader mode, browsing history, privacy tools and Manifest V3 extension loading. Built-in pages include `bolt://history`, `bolt://privacy`, `bolt://help` and `bolt://quit`.
- **Android:** native browser chrome powered by Mozilla GeckoView (the Firefox engine), with tabs, navigation, bookmarks, history and GeckoView WebExtensions.
- **Hosted start page:** lightweight PWA in `mobile/`.

## Android browser

The native Android project is in `app/`. It uses Mozilla's stable GeckoView Maven artifact rather than Android System WebView. GeckoView is a browser engine intended for embedding in Android browsers.

Open the repository in Android Studio and build **Build → Build Bundle(s) / APK(s) → Build APK(s)**. The debug APK is at `app/build/outputs/apk/debug/app-debug.apk`. GitHub Actions also builds it on Android project changes.

The Android browser keeps its own top address bar, tab strip and bottom navigation controls. GeckoView renders website content underneath those controls.

## Android extensions

Open the menu → **Install extension (.xpi)** to choose a Mozilla-signed WebExtension package. Open **Extensions** to see installed add-ons and uninstall them. GeckoView validates the XPI signature and Bolt asks before granting the extension's requested permissions.

Important compatibility notes:
- GeckoView supports Firefox WebExtensions, not every Chrome-only extension API.
- The Android installer accepts Mozilla-signed `.xpi` packages. Unpacked extension folders and unsigned ZIP files are not installable through GeckoView's normal add-on installation API.
- The existing `extensions/` sample is a Chromium Manifest V3 desktop example; it may need changes and Mozilla signing before it can run on Android.
- Extensions installed through GeckoView persist across app restarts.

## Desktop

**Windows (easy install):** Download `Bolt-Browser-Setup-*.exe` from the latest successful [Windows installer workflow](https://github.com/niklas-h1y/Bolt-Browser/actions/workflows/windows.yml), open it, and Bolt Browser will install with desktop and Start Menu shortcuts. No separate Node.js installation is needed. New pushes to `main` and published releases build a fresh setup file automatically. The installer keeps browser data when the app is uninstalled.

**Automatic updates:** Windows desktop builds check GitHub Releases in the background, download published updates automatically, and show a **Restart & install** button in **Menu → About** when an update is ready. Install the latest updater-enabled setup once from the Windows installer workflow; older installations do not contain the updater and need this one-time reinstall. Future versions are delivered without rerunning the setup file. To publish an update, increment `version` in `package.json`, push a matching version tag such as `v1.0.2`, and the tagged-release workflow builds and publishes the installer plus `latest.yml` update metadata. Updates are currently enabled for packaged Windows builds (NSIS); development builds and macOS/Linux are not auto-updated.

For development, install Node.js 20+, then run `npm install` and `npm start`. See `extensions/README.md` for desktop extension instructions.

## Hosted start page

The `mobile/` directory is a lightweight PWA, not the Android browser itself. See [MOBILE.md](MOBILE.md).

**Important:** GitHub Pages hosts only static files; it does not run the native Android or desktop browser app.

## Google Play Store Android App Bundle

GitHub Actions builds the debug APK and a separate release Android App Bundle (AAB). Download the `bolt-browser-playstore-aab` artifact from the Android workflow run. The release bundle is signed when all four repository secrets below are configured; without them, the workflow still produces an unsigned AAB for testing. The existing `bolt-browser-android-debug` APK artifact remains available.

To enable release signing, create an upload keystore and add these under **Repository → Settings → Secrets and variables → Actions → New repository secret**:

- `ANDROID_KEYSTORE_BASE64` — the keystore file encoded as a single base64 string.
- `ANDROID_KEYSTORE_PASSWORD` — the keystore password.
- `ANDROID_KEY_ALIAS` — the key alias.
- `ANDROID_KEY_PASSWORD` — the key password.

Generate a keystore and its base64 value in one line (replace the sample alias and use a strong password):

```sh
keytool -genkeypair -v -keystore release.keystore -alias bolt-upload -keyalg RSA -keysize 2048 -validity 10000 && base64 -w 0 release.keystore
```

Copy the base64 output into `ANDROID_KEYSTORE_BASE64`, and save the exact keystore password, alias, and key password in the other three secrets. Keep `release.keystore` and all passwords private; do not commit them. For production distribution, enroll in Google Play App Signing and retain a secure backup of your upload key.
