# Contributing to Bolt Browser

Thanks for your interest in contributing to Bolt Browser! Contributions of all kinds are welcome, including bug reports, compatibility fixes, documentation, accessibility improvements, and new features.

Bolt aims to be a practical browser for everyday browsing and development. Changes should prioritize reliability, performance, security, and a straightforward user experience.

## Project areas

Bolt currently includes several parts:

- **Desktop browser:** Electron and Chromium, located primarily in the repository root.
- **Android browser:** Native Android application using Mozilla GeckoView, located in `app/`.
- **Hosted start page:** Lightweight PWA located in `mobile/`.

Please make changes in the component relevant to your contribution. Keep desktop Chromium behavior and Android GeckoView behavior distinct where their APIs or extension compatibility differ.

## Getting started

### Desktop

1. Install Node.js 20 or newer.
2. Clone the repository:
   ```sh
   git clone https://github.com/niklas-h1y/Bolt-Browser.git
   cd Bolt-Browser
   ```
3. Install dependencies:
   ```sh
   npm install
   ```
4. Start Bolt:
   ```sh
   npm start
   ```

### Android

1. Open the repository in Android Studio.
2. Allow Gradle to sync and download the required dependencies.
3. Build and run the Android app on an emulator or device.

See the root [README](README.md) for current build and project details.

## Making a contribution

1. Check existing issues and discussions to see whether the work is already being tracked.
2. For a substantial change, open an issue first to discuss the approach.
3. Create a branch for your work.
4. Make focused changes that are easy to review.
5. Test the affected component where possible.
6. Submit a pull request describing what changed, why it is useful, and how you tested it.

Small documentation fixes and straightforward bug fixes can be submitted directly as pull requests.

## Code and design guidelines

- Keep changes focused; avoid unrelated refactoring.
- Follow the existing code style and patterns in the affected component.
- Prefer simple, maintainable solutions over unnecessary complexity.
- Preserve existing browser functionality unless a change is intentional and documented.
- Treat website content and extension code as untrusted.
- Keep Electron security protections enabled. Do not expose Node.js APIs to website content.
- Validate IPC senders and inputs when adding or changing privileged IPC handlers.
- Request only the permissions a feature actually needs.
- Do not claim that user-agent spoofing makes Chromium behave like Firefox or Safari. Be clear about the limits of engine compatibility.
- Do not commit credentials, signing keys, tokens, private user data, or generated build artifacts.

## Testing

Test the component you changed before submitting whenever possible.

- **Desktop:** Run `npm start` and check the affected browser workflow.
- **Android:** Build and run the app using Android Studio or the available Gradle tasks.
- **PWA:** Test the affected pages and behavior in a browser.

If you cannot run a test, say so in your pull request and describe any checks you did perform. Do not describe code inspection as a successful runtime test.

## Bug reports and feature requests

When reporting a bug, include:

- The operating system and Bolt version, if known.
- Whether the issue affects desktop, Android, or the hosted PWA.
- Clear steps to reproduce the issue.
- What you expected to happen and what actually happened.
- Relevant logs or screenshots, after removing passwords, tokens, and other private information.

For feature requests, explain the problem the feature would solve and who would benefit from it.

## Security issues

Please do not publish exploitable security vulnerabilities or sensitive details in a public issue. Follow the private reporting guidance in [SECURITY.md](SECURITY.md).

## Pull request checklist

Before submitting, please check that:

- [ ] The change has a clear purpose and is limited to the intended scope.
- [ ] Existing functionality has been preserved or intentional changes are explained.
- [ ] Relevant tests or manual checks have been performed, or limitations are disclosed.
- [ ] Documentation has been updated if behavior or setup instructions changed.
- [ ] No secrets, credentials, or personal data have been included.

Thank you for helping make Bolt Browser better!
