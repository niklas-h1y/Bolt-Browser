# ⚡ Bolt Browser

Bolt Browser has desktop and Android browser front ends, plus a lightweight hosted start page:

- **Desktop Chromium browser:** Electron embeds Chromium and provides page tabs, downloads, and Manifest V3 extension loading.
- **Extension library:** `extensions/` contains the supported Manifest V3 format, instructions, and a working example extension.
- **Android browser:** a native Android app in `app/` using Android System WebView (Chromium-based) with in-app navigation, tabs, bookmarks, history and downloads.
- **Hosted mobile start page:** a lightweight PWA in `mobile/`; it is not the full browser.

## Desktop

Install Node.js 20+, then:

```bash
npm install
npm start
```

Build installers:

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

## Desktop extensions

Open the Bolt menu → **Extensions** → **Load unpacked extension**, then choose a local folder containing `manifest.json`. Extensions are stored in Bolt's persistent Chromium profile. Compatibility depends on the extension's manifest version and APIs; Chrome Web Store one-click installation and every Chrome API are not guaranteed by Electron. Only install extensions you trust.

## Android browser app

The native Android project is in `app/`. Open the repository root in Android Studio, allow Gradle sync, then choose **Build → Build Bundle(s) / APK(s) → Build APK(s)**. The debug APK is created at `app/build/outputs/apk/debug/app-debug.apk` and can be installed on an Android tablet. You can also build it from a machine with Gradle 8.7 and Android SDK 35 using `gradle assembleDebug`.

The Android edition uses Android System WebView, which is Chromium-based. Its browser chrome includes a persistent address/search bar, back/forward/reload/home controls, tab strip, bookmarks, history, downloads, settings, and an Extensions information screen. It is a separate native app from the Electron desktop build. **Manifest V3 extensions in `extensions/` currently run only in the desktop Electron build; Android WebView does not include a Chrome extension runtime.**

The `mobile/` directory remains a lightweight hosted start page/PWA; see [MOBILE.md](MOBILE.md) for details.

**Important:** GitHub Pages only hosts the static start page. It does not run the native Android or desktop browser app.

## Extensions

See [`extensions/README.md`](extensions/README.md) for the supported Manifest V3 layout and the example extension. Android extension support is not claimed until a compatible runtime is integrated and tested.

## Security and notes

- Browser pages run in separate Chromium web contents with Node.js integration disabled and context isolation enabled.
- Downloads use Chromium's native download manager and save to the operating system Downloads folder.
- Treat browser extensions as trusted code and install only extensions from sources you trust.
