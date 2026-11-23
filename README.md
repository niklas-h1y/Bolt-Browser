# ⚡ Bolt Browser

Bolt Browser has two front ends:

- **Desktop Chromium browser:** Electron embeds Chromium and provides native page tabs, downloads, and an interface for loading unpacked Chromium extensions.
- **Mobile companion:** an installable PWA in `mobile/`, with an optional Capacitor wrapper for Android and iOS.

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

## Mobile installation

See [MOBILE.md](MOBILE.md). The mobile PWA can be installed from Chrome on Android or Safari on iOS. A Capacitor project configuration and dependencies are included for building native wrappers. Android uses Chromium-based Android System WebView; iOS uses WebKit. Mobile does not currently support desktop Chromium extensions.

**Important:** GitHub Pages hosting does not run the native desktop app. The PWA/mobile companion is a separate web experience; deploy the `mobile/` directory to an HTTPS static host to install it directly.

## Security and notes

- Browser pages run in separate Chromium web contents with Node.js integration disabled and context isolation enabled.
- Downloads use Chromium's native download manager and save to the operating system Downloads folder.
- Treat browser extensions as trusted code and install only extensions from sources you trust.
