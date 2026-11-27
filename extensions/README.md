# Bolt Browser extensions

This folder is the repository's extension library. Add each extension in its own subfolder.

## Supported formats

### Desktop (Electron / Chromium)

The desktop edition loads **unpacked Chromium extensions using Manifest V3**:

- A `manifest.json` file at the extension folder root.
- `manifest_version: 3`.
- Content scripts declared with `content_scripts`.
- Static assets (JavaScript, CSS, icons) referenced with paths relative to the extension folder.

Open `chrome://extensions` or `bolt://extensions` in the desktop address bar to open Bolt's built-in Extensions manager. Choose **Load unpacked** and select the folder containing `manifest.json`. The manager lists each loaded extension's name, version, ID and description and lets you remove it. Manually loaded extension folder paths are saved in Electron's user data directory and restored when Bolt starts again.

### Android (Mozilla GeckoView / Firefox engine)

The Android browser uses **Mozilla GeckoView**, not Android WebView. GeckoView runs Firefox-compatible WebExtensions distributed as Mozilla-signed `.xpi` packages:

- Use the Android menu's **Install extension (.xpi)** action to select a signed XPI.
- Open `chrome://extensions` or `bolt://extensions` in the address bar to open the existing Android Extensions manager, where installed add-ons can be listed and uninstalled.
- GeckoView validates XPI signatures and Bolt asks before granting requested permissions. Installed extensions persist across app restarts.
- GeckoView supports Firefox WebExtensions, not every Chrome-only extension API. Unpacked Chromium extension folders and unsigned ZIP files are not installable through GeckoView's normal add-on installation API.

The Chromium Manifest V3 sample format used by the desktop app is not directly interchangeable with Android GeckoView add-ons.

### iOS / WebKit

iOS/WebKit does not provide the same Chromium or GeckoView extension runtime. Desktop and Android packages are not automatically compatible.

## Compatibility and safety

- Desktop compatibility depends on the extension APIs supported by the version of Electron bundled with Bolt; not every Chrome extension API or Chrome Web Store extension is guaranteed to work.
- Install only extensions whose source you trust. Extensions can read or modify pages when their permissions allow it.

## Adding an extension

1. Create a folder under `extensions/`.
2. Add a valid Manifest V3 `manifest.json` and its referenced files for desktop, or prepare a Mozilla-signed XPI for Android.
3. Document any required permissions and supported platforms in that extension's README.
4. Test the package on each platform you intend to support.
