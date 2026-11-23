# Bolt Example Extension

A tiny Manifest V3 content-script extension used to verify the extension folder layout.

- **Format:** Chromium Manifest V3
- **Platform:** Bolt desktop (Electron), subject to Electron API compatibility
- **Permissions:** No special permissions requested
- **Match pattern:** `https://example.com/*`

Load this folder through Bolt's Extensions menu. It displays a small temporary badge on example.com.

Android WebView and iOS WebKit do not currently run this extension package.
