# Changelog

All notable changes to Bolt Browser are documented here.

This project is actively developed. Entries describe repository changes and do not imply that every feature has received independent security review.

## Unreleased

### Added
- **Built-in Bolt pages:** added `bolt://history`, `bolt://privacy` and `bolt://help`, plus `bolt://quit` to close the desktop application. History is stored locally, limited to the latest 500 visits, and excludes incognito tabs.
- **Isolated workspace storage:** each named workspace now uses its own persistent Chromium session partition. Cookies, local storage, cache and other site data are separated between workspaces. The Personal workspace retains the existing `persist:bolt` data partition.
- **Incognito tabs:** open a private tab from the toolbar or the three-dots menu. Each private tab uses a non-persistent in-memory Electron session.
- **Private-tab indicators:** incognito tabs are visibly marked in the tab strip.
- **Privacy-preserving session handling:** incognito tabs are excluded from automatic session restoration and browser backup exports.
- **Workspace session restoration:** restored tabs are assigned to their saved workspace partition.
- **Refreshed mobile PWA start page:** redesigned `mobile/index.html` with a modern dark interface, lime accent styling, responsive mobile-first layout, live clock/date and time-based greeting.
- **Updated mobile navigation and shortcuts:** added a polished search/address field, quick-access website tiles and a slide-up menu for common actions.
- **Improved saved-page and install presentation:** added a dedicated saved-pages panel and clearer PWA installation affordance while retaining the existing manifest and service-worker integration.

### Fixed
- **Custom tab context menu:** right-clicking a tab now opens Bolt’s own themed menu above the browser view, temporarily hiding the Chromium view so the menu remains visible. Added duplicate, close, close-other, close-to-right, create-group and group-selection actions.
- **Extension context-menu session mismatch:** only pass Personal-workspace WebContents using the extension manager's configured browser session to `ElectronChromeExtensions`; isolated workspace and private tabs now safely skip extension context-menu and tab-selection calls, preventing an uncaught main-process exception.
- **Tab context-menu and workspace dialog stability:** replaced the shared native HTML dialog API with a serialized in-app overlay, preventing right-click tab grouping and workspace creation from invoking an unstable dialog path. Workspace creation now initializes its isolated session explicitly and rolls back cleanly if setup fails.
- **Chrome Web Store navigation:** explicitly preserves official `https://chromewebstore.google.com/` address-bar URLs as ordinary HTTPS navigation targets, bypassing internal-page handling.
- **Workspace creation and restoration:** corrected over-escaped workspace-name validation so ordinary names are accepted consistently when creating, loading, restoring and importing workspaces.
- **Reader mode:** replaced the page-wide recoloring-only behavior with main-content detection and focused reading styles. Unrelated page sections are hidden while article text and relevant images remain visible.
- **Unsupported native prompts:** replaced `prompt()` calls in the tab-group context menu, workspace picker and extension installer with in-app dialogs, preventing right-click and related actions from throwing in Electron.
- **Tab strip overflow:** made tabs a fixed-width horizontal scroller with hidden native scrollbars and moved the New Tab button outside the scrolling region so it remains visible.
- **Settings markup:** removed literal `\\n` text around the Browser backup section.
- **Crashed-tab recovery:** when a tab renderer exits unexpectedly, Bolt now loads a recovery page with actions to retry the previous web address or open a new tab. This provides a visible recovery path for Chrome Web Store renderer failures; it does not claim to prevent every underlying Chromium renderer crash.
- **Missing extension icons:** added a Bolt icon fallback for installed extensions whose toolbar action has no usable icon, avoiding failed `crx://extension-icon` responses.

### Security and privacy notes
- Incognito sessions do not persist cookies, site storage or cache after the private tab is closed. Incognito does not make a user anonymous to websites, employers, schools, internet providers or network operators.
- Files deliberately downloaded from an incognito tab remain on disk. Downloads are not automatically deleted.
- Incognito tabs do not load installed browser extensions.
- Workspaces isolate Chromium website storage, but they still run inside the same Bolt application process and operating-system user account. They are not operating-system sandboxes.
- Browser backup files exclude cookies, passwords, extension data and incognito tabs.
- Extension toolbar actions and extension management remain available in the Personal workspace. Other workspaces use separate website storage and do not load those extensions.

### Notes
- The existing tab groups, session restore, privacy dashboard, reading view, resource monitor, website permission controls, custom New Tab backgrounds and backup/import tools remain part of the application.
- Resource figures are estimates; Chromium tabs can share renderer processes.
- The built-in tracker shield uses a maintained-in-code domain list and is not a complete tracker audit.
