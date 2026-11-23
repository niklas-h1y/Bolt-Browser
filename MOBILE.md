# Bolt Browser on mobile

## Native Android browser

A native Android browser project is now included in `app/`. It uses Android System WebView for in-app browsing and includes navigation controls, multiple tabs, bookmarks, history, and downloads. Open the repository in Android Studio and build the debug APK with **Build → Build Bundle(s) / APK(s) → Build APK(s)**. The APK output is `app/build/outputs/apk/debug/app-debug.apk`. A GitHub Actions workflow also builds a debug APK on pushes that touch the Android project; download it from the workflow run's Artifacts section.

The Android app is distinct from the lightweight PWA described below. It is not yet signed for Google Play distribution.

The repository includes a mobile companion at `mobile/`. It can be installed as a Progressive Web App (PWA), or wrapped as a native Android/iOS app with Capacitor.

## Install the PWA

Deploy the contents of the `mobile/` directory to an HTTPS static host, then open the deployed page on your phone:

- **Android:** open it in Chrome and choose **Install app** or **Add to Home screen**.
- **iPhone/iPad:** open it in Safari, tap **Share**, then **Add to Home Screen**.

This mobile companion is a lightweight installable start page, not yet a full-featured mobile browser. Arbitrary sites may restrict navigation or embedding in installed web apps.

## Build a native Android app

Install Node.js 20+ and Android Studio. From the repository root:

```bash
npm install
npm run mobile:add:android
npm run mobile:sync
npx cap open android
```

In Android Studio, build an APK for direct installation or generate a signed AAB for Google Play. The app uses Android System WebView, which is Chromium-based.

## Build for iOS

On macOS with Xcode installed:

```bash
npm install
npm run mobile:add:ios
npm run mobile:sync
npx cap open ios
```

Build and sign the app in Xcode. iOS apps use Apple's WebKit engine, not Chromium.

## Mobile limitations

- The mobile companion does not currently have desktop-style tabs, full browser controls, or Chromium extension installation.
- Desktop extensions do not automatically work in Android WebView or iOS WebKit.
- Android WebView is Chromium-derived, but it is not the same as shipping the full desktop Chromium browser.
- For a production mobile browser, a dedicated native navigation/tab layer, downloads handling, permissions, and privacy controls still need to be implemented and tested.
