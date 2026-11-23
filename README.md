# ⚡ Bolt Browser
[Download Android APK](https://github.com/niklas-h1y/Bolt-Browser/releases/download/v0.1-debug/Bolt_Browser.apk)
Bolt Browser has a desktop Electron browser, an Android browser, and a lightweight hosted start page.

- **Desktop:** Electron + Chromium, tabs, downloads and Manifest V3 extension loading.
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

Install Node.js 20+, then run `npm install` and `npm start`. See `extensions/README.md` for desktop extension instructions.

## Hosted start page

The `mobile/` directory is a lightweight PWA, not the Android browser itself. See [MOBILE.md](MOBILE.md).

**Important:** GitHub Pages hosts only static files; it does not run the native Android or desktop browser app.
