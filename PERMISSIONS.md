# Permissions, hardware APIs, and protected media

Bolt uses the persistent `persist:bolt` Electron session. The handlers live in `permissions.js`; the settings UI stores master switches in the app's user-data `settings.json`. A switch being enabled only makes a capability eligible: sensitive access still requires a per-origin prompt or a device selection.

## What is implemented

- Camera and microphone requests (`media`) are prompted separately based on the requested media types. Camera PTZ has its own switch (and also requires the camera switch) and is prompted.
- Screen capture is split into the `display-capture` permission prompt and a desktop/window source chooser using `desktopCapturer.getSources()`. System audio loopback is offered only on Windows.
- Geolocation and approximate geolocation requests are prompted and controlled by the Location switch.
- Web Bluetooth uses `webContents`'s `select-bluetooth-device` event.
- WebUSB, Web Serial, and WebHID use their Session device-selection events and `setDevicePermissionHandler`. Device grants are held in memory for the app session; they are not silently persisted across restarts.
- Clipboard read and sanitized-write requests have independent switches and consent prompts.
- WebXR VR/AR, hand tracking, NFC, accelerometer/gyroscope/magnetometer, pointer lock, keyboard lock, notifications, MIDI, local fonts, screen enumeration, and media-key-system requests are covered by master switches and request prompts when Chromium emits those permission requests.
- HTML fullscreen hides Bolt's browser chrome. Native BrowserWindow fullscreen does the same.
- Popups are allowed as child windows (with bounded dimensions and the same persistent session) so OAuth flows retain a real opener. They remain subject to Chromium's popup-blocking/user-activation rules.
- The `bolt://` scheme is registered before app readiness and resolves the bundled `newtab.html`, `extensions.html` and internal history, privacy and help pages. `bolt://quit` closes the desktop application.
- Downloads continue to use the session's `will-download` event. Each download receives its own ID so concurrent downloads do not overwrite each other's UI updates.

## Location on Windows

1. Open **Windows Settings → Privacy & security → Location**.
2. Turn on **Location services** and allow desktop apps to access location when Windows presents that control.
3. In the Bolt settings modal, enable **Precise location** or **Approximate location** as required and retry the request.
4. If Chromium's network geolocation provider still cannot resolve a location, configure a Google Cloud API key with the Geolocation API enabled and billing enabled. Set the user environment variable `BOLT_GOOGLE_API_KEY` on the Windows account that runs Bolt (for example, in PowerShell: `[Environment]::SetEnvironmentVariable('BOLT_GOOGLE_API_KEY', 'YOUR_KEY', 'User')`), then fully restart Bolt. The main process copies it to Electron's expected `GOOGLE_API_KEY`; setting it only in a build job will not configure an already-installed app. Do not commit the key to source control or bake it into a public installer. Restrict the key and monitor usage in Google Cloud.

Electron geolocation relies on Google's geolocation web service; the API key is not a replacement for the user's operating-system privacy controls. On Windows, also check **Settings → Privacy & security → Camera** and **Microphone** and allow desktop apps. On macOS, Bolt now requests the native camera/microphone TCC prompts after its in-app prompt, and the macOS build includes usage-description strings; screen capture still requires the user to grant Screen Recording in System Settings → Privacy & Security.

## WebAuthn / passkeys

- Keep sites on HTTPS (or a browser-recognized secure development origin) and do not intercept `navigator.credentials.create()` or `.get()` in the preload.
- On Windows, Chromium's platform authenticator can surface Windows Hello when the OS, hardware, relying-party configuration, and Electron/Chromium build support it. The app cannot force Windows Hello to appear if Windows or the RP does not offer it.
- Electron's `app.configureWebAuthn()` platform passkey/Touch ID integration is macOS-specific and newer than the repository's current Electron 35 dependency. It is conditionally enabled only when running a newer compatible build and when `BOLT_WEBAUTHN_KEYCHAIN_GROUP` is set. Set `BOLT_ENABLE_PLATFORM_PASSKEYS=1` to opt into Apple platform passkeys. A signed macOS app also needs the matching Keychain access-group and Associated Domains entitlements/provisioning profile; see Electron's `app.configureWebAuthn` documentation. Do not copy an arbitrary Team ID or entitlement.

## Widevine / EME protected playback

Stock Electron does not bundle Google's proprietary Widevine CDM. Enabling the `mediaKeySystem` permission cannot add the missing CDM. Bolt now waits for `components.whenReady()` when that API exists, but it is a no-op on stock Electron.

For a Widevine-enabled build, use Castlabs' Electron for Content Security (ECS):

1. Review the current ECS README and releases. ECS is a fork/drop-in Electron build that installs and updates the Widevine CDM through its `components` API.
2. Choose a currently supported ECS release and use the exact Electron major/minor compatible with your app. Do not install an arbitrary newer major over Electron 35 without testing the breaking changes.
3. Replace the `electron` devDependency with the corresponding GitHub release tag, following the current ECS README's npm command format (for example `https://github.com/castlabs/electron-releases#v<matching-version>+wvcus`).
4. Reinstall dependencies, build the installer with the ECS binary, and verify `components.whenReady()` completes before the browser window is created.
5. Test the actual streaming providers and license server you intend to support. Castlabs development VMP builds are not automatically production-certified for every commercial service; production VMP signing/EVS and provider requirements may apply.

ECS currently documents limitations around persistent licenses; check the selected release notes before promising offline playback. DRM availability is also subject to provider licensing, CDM version, platform, codec support, and Widevine policy. See the [Castlabs ECS README](https://github.com/castlabs/electron-releases) and [release notes](https://github.com/castlabs/electron-releases/releases).

## Hardware and Chromium limitations

- Device APIs generally require HTTPS, a supported device, a browser permission request, and a user gesture. A web page cannot use them merely because the desktop app has a switch enabled.
- WebUSB, WebHID, and Web Serial retain Chromium's protected-device blocklists. Do not globally disable these blocklists as a routine fix; doing so can expose keyboards, storage, smart cards, and other sensitive devices.
- Web NFC is not generally available in desktop Chromium/Electron builds and is commonly limited to supported Android devices. A permission handler cannot add an NFC controller or implement an API Chromium does not ship.
- WebXR requires a supported XR runtime/device, graphics stack, secure origin, and Chromium feature support. VR/AR permission handling alone does not install an OpenXR runtime or enable unsupported hardware. There is no single stable Electron switch that enables every WebXR feature; check the Chromium version bundled with the chosen Electron release and inspect that version's `about://flags` / feature metadata before adding a targeted `app.commandLine.appendSwitch('enable-features', ...)` or `experimentalFeatures` setting. Avoid globally enabling experimental web-platform features in production.
- Device Orientation/Motion APIs may be unavailable on desktops without sensors. They are more commonly useful on supported mobile hardware.
- Bluetooth, USB, serial, and HID access may additionally be restricted by Windows drivers, OS permissions, device availability, Linux udev rules, or macOS privacy/security settings.
- Pointer lock, keyboard lock, and fullscreen are permission-gated by Bolt's settings and still governed by web-platform user-activation, focus, and fullscreen rules. Bolt does not synthesize gestures or bypass those checks.

## Security model and testing

- The permission switches are master allow/deny gates. The prompt is per request; grants are held in memory for the current app run.
- Device selections are not persisted to disk. The user must select a device again after restarting Bolt.
- Test from HTTPS origins. Many APIs are unavailable on ordinary HTTP pages.
- Test camera and microphone independently and together; test screen capture separately from camera/microphone.
- Test device request and cancellation paths for each USB/HID/serial/Bluetooth device class.
- Test multiple simultaneous downloads, OAuth popup sign-in, delayed `window.open`, HTML video fullscreen, pointer lock, keyboard lock, and clipboard prompts on each target OS.
- This code is an Electron integration layer, not a guarantee that every listed API is implemented by the bundled Chromium version or supported by every OS/device.


## Ad and tracker shield

Desktop Bolt enables its request shield by default. The 🛡 toolbar button toggles blocking and displays the number of blocked requests. The filter blocks common ad networks and analytics/tracking endpoints (including DoubleClick, Google advertising/analytics, AppNexus, Taboola, Outbrain, ScorecardResearch, and others). The setting is stored in the app's user-data `settings.json`.

Android uses GeckoView's Enhanced Tracking Protection in strict mode with per-session tracking protection enabled by the shield toggle. The bottom toolbar/menu displays the blocked tracker count. This is GeckoView's built-in content blocking, not a separate third-party ad-list engine.

## Themes and Android first-run permissions

Desktop theme settings are shared through the app's persisted UI preferences and applied to the browser chrome, new-tab page, and extensions manager. Presets are Bolt Dark, Midnight Neon, OLED Pitch Black, and Clean Light, with a custom accent color.

Android stores its theme and first-run permission choice in `SharedPreferences`. The first-run dialog offers Security-Friendly Defaults (deny website permission requests) or Ask / Allow Permissions (show per-request consent dialogs). The choice is enforced by each GeckoSession's PermissionDelegate. Android supports the same four theme presets in its native browser chrome and GeckoView start page.
