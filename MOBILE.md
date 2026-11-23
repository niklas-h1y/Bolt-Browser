# Bolt Browser on mobile

## Native Android browser

The native Android project in `app/` is a full browser shell powered by Mozilla GeckoView (the Firefox engine). It includes a persistent address/search bar, tab strip, back/forward/home/reload controls, bookmarks, history, and a GeckoView WebExtensions manager.

Open the repository in Android Studio and build the debug APK with **Build → Build Bundle(s) / APK(s) → Build APK(s)**. The APK output is `app/build/outputs/apk/debug/app-debug.apk`. GitHub Actions also builds a debug APK on pushes that touch the Android project.

Android extensions are installed as Mozilla-signed `.xpi` WebExtensions from the browser menu. Compatibility depends on Firefox WebExtension API support; Chrome-only APIs may not work. The existing desktop MV3 sample is not automatically compatible or installable on Android.

The Android app is not yet signed for Google Play distribution.

## Install the PWA

The `mobile/` directory remains a lightweight installable start page/PWA, not the full browser. Deploy it to an HTTPS static host and open it on your device to install it.

## iOS

The Capacitor companion can be built for iOS on macOS with Xcode, but it is a separate lightweight start page and does not use GeckoView.
