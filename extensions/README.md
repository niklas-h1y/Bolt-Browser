# Bolt Browser extensions

This folder is the repository's extension library. Add each extension in its own subfolder.

## Supported formats

### Desktop (Electron / Chromium)

The desktop edition loads **unpacked Chromium extensions using Manifest V3** and uses [`electron-chrome-extensions`](https://github.com/samuelmaddock/electron-browser-shell/tree/master/packages/electron-chrome-extensions) to provide browser-style extension integration:

- A `manifest.json` file at the extension folder root.
- `manifest_version: 3`.
- Content scripts declared with `content_scripts`.
- Browser action icons and popups in Bolt's toolbar, including per-tab badges and dynamic action state.
- Common extension APIs including `chrome.tabs`, `chrome.runtime`, `chrome.storage`, `chrome.cookies`, `chrome.contextMenus`, `chrome.notifications`, and `chrome.webNavigation`, subject to the library's supported API list and Electron limitations. Basic `chrome.windows` queries are provided by the library; `chrome.windows.create` is not yet connected to Bolt's single-window UI.
- Extension-created tabs are integrated with Bolt's tab strip; action context-menu items are shown in the page context menu.
- Static assets (JavaScript, CSS, icons) referenced with paths relative to the extension folder.

Open `chrome://extensions` or `bolt://extensions` in the desktop address bar to open Bolt's built-in Extensions manager. Choose **Load unpacked** and select the folder containing `manifest.json`. The manager lists each loaded extension's name, version, ID and description and lets you remove it. Manually loaded extension folder paths are saved in Electron's user data directory and restored when Bolt starts again. Bolt displays the declared permissions before installation and asks again when an extension requests optional permissions.

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

- Desktop compatibility depends on the extension APIs supported by the version of Electron bundled with Bolt and by `electron-chrome-extensions`; not every Chrome extension API or Chrome Web Store extension is guaranteed to work.
- The extension integration package is MIT-licensed. Its preload bundle is built automatically before development launches and desktop packaging.
- Install only extensions whose source you trust. Extensions can read or modify pages when their permissions allow it.

## Adding an extension

1. Create a folder under `extensions/`.
2. Add a valid Manifest V3 `manifest.json` and its referenced files for desktop, or prepare a Mozilla-signed XPI for Android.
3. Document any required permissions and supported platforms in that extension's README.
4. Test the package on each platform you intend to support.
