# Bolt Browser extensions

This folder is the repository's extension library. Add each extension in its own subfolder.

## Supported format

The desktop Electron edition reads **unpacked Chromium extensions using Manifest V3**:

- A `manifest.json` file at the extension folder root.
- `manifest_version: 3`.
- Content scripts declared with `content_scripts`.
- Static assets (JavaScript, CSS, icons) referenced with paths relative to the extension folder.

Example structure:

```
extensions/
  example/
    manifest.json
    content.js
```

For desktop testing, open Bolt → menu → Extensions → Load extension, then select the extension's folder. The selected folder must contain `manifest.json` directly.

## Compatibility and safety

- The desktop app uses Electron's Chromium extension loader. Compatibility depends on the APIs Electron supports; not every Chrome extension API or Chrome Web Store extension is guaranteed to work.
- **Android WebView does not provide a Chrome extension runtime.** These Manifest V3 packages are not currently installable in the Android app. Android needs a separate compatible extension engine before these packages can run there.
- iOS/WebKit has the same limitation.
- Install only extensions whose source you trust. Extensions can read or modify pages when their permissions allow it.

## Adding an extension

1. Create a folder under `extensions/`.
2. Add a valid Manifest V3 `manifest.json` and its referenced files.
3. Document any required permissions and supported platforms in that extension's README.
4. Test it in the desktop Electron app before marking it supported.
