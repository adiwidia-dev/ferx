# Changelog

All notable changes to Ferx are documented here.

Versions follow [Semantic Versioning](https://semver.org/). Dates are in YYYY-MM-DD format.

---

## [0.3.1] — 2026-04-27

### Changed

- Refactored settings page components for improved layout and behaviour consistency.

---

## [0.3.0] — 2026-04-27

### Added

- **Multiple workspace support.** A workspace switcher in the sidebar lets you create, rename, and delete named workspaces. Each workspace maintains its own set of services independently.
- **Todos panel.** A side panel for writing and managing todo notes within the workspace. Notes are persisted in local storage and survive app restarts.
- **Resource usage monitoring.** Optional per-service CPU and memory tracking, toggled from Settings. Metrics are surfaced in a strip beneath the active service view.
- **Spell check toggle.** Spell checking for service webviews can be enabled or disabled from Settings. A restart prompt is shown when the setting changes.
- **Configuration import/export.** Workspace configurations can be exported as a plain JSON file and re-imported from the Settings page. Exported files contain service names, URLs, and app settings only — no passwords, cookies, or session data.

### Changed

- Service editor and workspace components refactored for improved functionality and maintainability.
- Configuration export format updated to include workspace structure and service references with a version field.
- Local storage handling refactored to manage multi-workspace state more efficiently.

---

## [0.2.4] — 2026-04-23

### Added

- **File drag-and-drop.** Files dragged onto a service webview are forwarded to the active service, enabling attachment workflows in apps like Slack and Teams.
- **Native download dialog.** Downloads triggered inside a service webview now open a native save-file dialog instead of being silently discarded.

### Changed

- Badge monitoring improved: more reliable detection and state management across service switches.
- Background preloading can now be cancelled when switching services quickly, reducing unnecessary work.
- Vite configuration and workspace state management updated for improved build and runtime reliability.

---

## [0.2.3] — 2026-04-22

### Changed

- Release workflow updated to document and apply ad-hoc signing during bundling (`signingIdentity = "-"`), reducing repeated keychain prompts for users on macOS without an Apple Developer ID.

---

## [0.2.2] — 2026-04-22

### Fixed

- Badge monitoring scripts were not consistently enabled after a service reload; this is now enforced on every load.

---

## [0.2.1] — 2026-04-22

### Changed

- Tauri CSP configuration updated to allow additional external sources required for asset loading in certain services.

---

## [0.2.0] — 2026-04-22

### Added

- **In-app updater.** Ferx now checks GitHub Releases for new versions. Updates are downloaded, verified with a minisign signature, and applied on relaunch. No manual DMG download is needed after this version.
- **App settings page.** A dedicated Settings screen accessible from the sidebar, covering updater status, configuration backup, and future per-app preferences.
- **MIME type detection.** Download responses from service webviews now have their content type sniffed to improve downstream handling.
- **Icon background colour.** Each service can have a custom background colour applied behind its icon in the sidebar.
- **Google authentication compatibility.** User-agent handling updated so that Google sign-in flows work correctly inside service webviews.

### Changed

- Services are now auto-saved as soon as edits are confirmed, removing the need for a separate save action.
- Drag handling in the workspace page optimised to reduce redundant event processing.
- Tray icon management improved to stay in sync with workspace state.

### Notes

- v0.1.x builds do not include the updater. Users on v0.1.x must download this release manually from the GitHub Releases page. All subsequent updates are delivered in-app.

---

## [0.1.0] — 2026-04-14

### Added

- Initial public release of Ferx.
- Native webview-based workspace using Tauri multiwebview. Each service runs in its own isolated webview with no shared browser process.
- Per-service enable and disable states. Disabled services are not loaded and consume no resources.
- Background preloading. Services are preloaded in the background so switching between them is instant.
- Unread badge monitoring for Outlook and Teams. Badge counts are read from the webview DOM and surfaced on the sidebar icon.
- Native context menus on sidebar items for service actions.
- Camera and microphone access for services that require them (meeting apps).
- Service config validation and safety guardrails: invalid URLs, malformed payloads, and unsupported schemes are rejected before any state change is applied.
- CI baseline: pre-push validation runs type-check, unit tests, and Rust tests.

[0.3.1]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.3.1
[0.3.0]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.3.0
[0.2.4]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.2.4
[0.2.3]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.2.3
[0.2.2]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.2.2
[0.2.1]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.2.1
[0.2.0]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.2.0
[0.1.0]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.1.0
