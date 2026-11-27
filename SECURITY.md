# Security Policy

## Supported Versions

Security updates are provided for the latest code and release on the `main` branch. Older releases and snapshots are not guaranteed to receive fixes; users should update to the latest supported build.

| Version | Supported |
| --- | --- |
| Latest release on `main` | Yes |
| Older releases / other snapshots | No |

## Reporting a Vulnerability

Please report suspected security vulnerabilities privately. **Do not open a public GitHub Issue, discussion, or pull request for an undisclosed vulnerability.** Public reports can expose users before a fix is available.

Preferred reporting method:

1. Open the repository's **Security** tab on GitHub and select **Report a vulnerability** to submit a private report through GitHub Private Vulnerability Reporting.
2. If private reporting is unavailable, contact the repository maintainer privately through their GitHub profile. Include a way to follow up securely; do not post exploit details publicly.

Please include, where possible:

- The affected Bolt Browser version, platform, and component (desktop Electron, Android GeckoView, or hosted start page).
- A concise description, impact assessment, and steps to reproduce.
- Proof-of-concept material or logs, after removing personal data, credentials, and other secrets.

### Response expectations

- **Acknowledgement:** within 3 business days.
- **Initial triage:** within 7 calendar days, including an assessment of severity and next steps where possible.
- **Progress updates:** at least every 7 calendar days while the report remains active.

These are target timelines, not a guarantee. Investigation and remediation time depend on severity, complexity, and release requirements. Please allow the maintainer a reasonable opportunity to investigate and prepare a fix before any coordinated public disclosure. We will coordinate disclosure timing with the reporter where practical.

## Bolt Browser's Security Architecture

The following describes security controls currently implemented in the repository. It is not a guarantee that the application is free of vulnerabilities.

### Desktop (Electron)

- Browser windows and page views enable Electron `contextIsolation` and `sandbox`, and disable `nodeIntegration`. Preload scripts expose the limited application bridge rather than giving website content direct Node.js access.
- Website permissions are handled by a dedicated permission manager. Grants are scoped to the requesting origin and require an explicit user decision; device access uses a user-facing device chooser. Clipboard reading is disabled by default.
- The built-in Shield blocks requests to a maintained set of known advertising, analytics, and tracking domains. Blocking can be toggled by the user; it is not a comprehensive content filter.
- Extension installation requests display the extension's declared permissions for user review. Extensions can still receive broad access when granted, so install only extensions you trust.

### Android (Mozilla GeckoView)

- The browser uses Mozilla GeckoView with Enhanced Tracking Protection set to **Strict** and its built-in tracking protection enabled by default.
- The first-launch **Security-Friendly Defaults** permission mode denies website permission requests. Users can opt into **Ask / Allow**, which presents consent prompts for site and device permissions.
- Add-ons are installed as `.xpi` packages through GeckoView's WebExtension installation API. GeckoView validates Mozilla-signed XPI packages; unsigned ZIP files and unpacked folders are not accepted by this installation flow. Bolt also presents the add-on's requested permissions before installation.

## Scope

Please report vulnerabilities in Bolt Browser's code, build and release workflows, or security-relevant integrations. For issues in third-party engines or dependencies, report upstream as appropriate and let us know privately if Bolt's integration creates additional risk.
