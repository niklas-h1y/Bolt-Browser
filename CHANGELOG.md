# Changelog

All notable changes to Bolt Browser are documented here.

This project is actively developed. Entries describe repository changes and do not imply that every feature has received independent security review.

## Unreleased

### Added
- **Isolated workspace storage:** each named workspace now uses its own persistent Chromium session partition. Cookies, local storage, cache and other site data are separated between workspaces. The Personal workspace retains the existing `persist:bolt` data partition.
- **Incognito tabs:** open a private tab from the toolbar or the three-dots menu. Each private tab uses a non-persistent in-memory Electron session.
- **Private-tab indicators:** incognito tabs are visibly marked in the tab strip.
- **Privacy-preserving session handling:** incognito tabs are excluded from automatic session restoration and browser backup exports.
- **Workspace session restoration:** restored tabs are assigned to their saved workspace partition.

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
