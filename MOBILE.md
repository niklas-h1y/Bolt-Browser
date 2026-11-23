# Bolt Browser on mobile

The repository now contains a mobile companion at `mobile/`. It is a small installable PWA and can also be wrapped as a native Android/iOS app with Capacitor.

## Install without compiling

Deploy the repository's `mobile/` directory to any HTTPS static host (or publish the project and visit its `/mobile/` path). Then:

- **Android:** open the mobile page in Chrome and choose **Install app** or **Add to Home screen**.
- **iPhone/iPad:** open the page in Safari, tap **Share**, then **Add to Home Screen**.

The PWA is a lightweight mobile companion and start page, not a full native browser engine. Browsing arbitrary sites from an installed web app is subject to the host browser's rules and sites may prevent embedding.

## Build a native Android app

Install Node.js and Android Studio, then from the repository root:

```bash
npm install
npm run mobile:sync
npx cap open android
```

In Android Studio, build an APK or generate a signed app bundle (AAB) for Google Play. Android's System WebView is Chromium-based. This wrapper does not provide desktop Chrome extension compatibility.

## Build for iOS

On macOS with Xcode installed:

```bash
npm install
npx cap add ios
npm run mobile:sync
npx cap open ios
```

Build and sign the app in Xcode. iOS apps use Apple's WebKit engine, not Chromium.

## Desktop remains separate

Run the full Chromium desktop browser with `npm start`. Desktop extension loading is available in the desktop app; mobile extension support is not included.
