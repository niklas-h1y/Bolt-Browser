# ⚡ Bolt Browser

Bolt Browser is a desktop browser built on **Electron and Chromium**. It is no longer limited to an iframe-based PWA: pages run in native Chromium web contents, with independent tabs, browser navigation, downloads, and support for loading unpacked Chromium extensions.

## Run locally

Install Node.js 20. Add dependencies and launch:

```bash
npm install
npm start
```

## Build installers

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Installers are written to `dist/`.

## Extensions

Open the Bolt menu and choose **Extensions** → **Load unpacked extension**, then select a folder containing a `manifest.json`. Bolt uses Electron's Chromium session extension loader. Extensions must be unpacked locally; Chrome Web Store one-click installation and every Chrome API are not guaranteed by Electron. Extension compatibility depends on the extension's manifest version and APIs used. Only install extensions you trust.

Extensions are stored in Bolt's persistent Chromium profile and remain installed between launches.

## Notes

- This is a desktop Electron app that bundles Chromium. Hosting the repository on GitHub Pages will still serve the legacy web/PWA experience; it cannot run the native desktop browser or load desktop extensions.
- Downloads use Chromium's native download manager and are saved to the operating system Downloads folder.
- Browser UI runs with context isolation and no Node.js integration. Page contents run in isolated Chromium web contents.
