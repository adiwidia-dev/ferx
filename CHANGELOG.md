# Changelog

All notable changes to Ferx are documented here.

Versions follow [Semantic Versioning](https://semver.org/). Dates are in YYYY-MM-DD format.

---

## [Unreleased]

---

## [0.8.0] — 2026-06-23

### Added

- Added a centralized Services section in Settings for searching and filtering services across workspaces, toggling badge/tray/sound/native-notification/hibernation settings, disabling services, and deleting services with confirmation.
- Added an Appearance setting with System, Light, and Dark modes for the Ferx shell UI.
- Added native OS unread notifications for services, with a per-service context-menu toggle and Do Not Disturb suppression.

### Changed

- Refined the dark appearance palette toward neutral VS Code Dark Modern-style shell colors.
- Updated Svelte, SvelteKit, Tauri, Vitest, Lucide, serde_json, and the Tauri MCP bridge dependency versions from Dependabot maintenance updates.
- Updated transitive Undici and Rust tar dependencies to patched versions for Dependabot security advisories.

### Fixed

- Added the macOS Continuity Camera plist opt-in to suppress the `AVCaptureDeviceTypeExternal` deprecation warning during development and camera-capable service use.
- Fixed the Settings Services table layout so it uses the available width instead of forcing horizontal scrolling at normal desktop sizes.
- Fixed workspace deletion so services that only belonged to the deleted workspace are removed from configuration and their webview storage is deleted, preventing inaccessible orphan services from appearing in Settings.
- Clarified the workspace deletion confirmation so it warns when exclusive services and their local webview data will also be deleted.
- Fixed the Services workspace filter dropdown styling so it matches the rest of the Settings controls instead of using the native platform gradient.
- Added an explicit Ferx app icon hint to native unread notifications for platforms that honor notification icons.

---

## [0.7.0] — 2026-06-19

### Added

- Added Linux release artifacts for AppImage, Debian, and RPM packages.
- Added an optional per-service hibernation setting that closes inactive service webviews after 60 seconds to reduce background resource usage while preserving service storage.
- Added a visible enabled sidebar state for hibernated services, including a subtle status dot and hover/title text that says the service can be clicked to wake.

### Fixed

- Reduced active-service badge monitoring work during heavy DOM churn in services such as Outlook, Teams, and WhatsApp by coalescing mutation-triggered badge scans for longer.
- Fixed hibernation state accuracy so services are only marked hibernated after native webview close succeeds, queued hibernation closes are skipped if the service is woken first, and newly enabled inactive services are scheduled for hibernation.
- Improved service switching responsiveness by skipping redundant active webview re-activation, reducing overlay hide work to the active webview, and preserving the previous active webview state if a switch fails.

---

## [0.6.1] — 2026-05-19

### Fixed

- Fixed service webviews opening to a blank page during sign-in or app startup by delaying the first unread badge clear event until the page is ready, preventing the badge notification bridge from interrupting initial service navigation.
- Kept unread badge monitoring quiet on loading and sign-in pages for WhatsApp, Telegram, Google Chat, Outlook, and Teams until each service's real app shell is detected, so startup pages no longer emit premature badge clear events.

---

## [0.6.0] — 2026-05-15

### Added

- Added unread badge support for Google Chat direct messages and spaces.
- Added unread badge support for Telegram on `web.telegram.org`.
- Added a dedicated WhatsApp unread badge monitor that sums unread message counts.

### Fixed

- Fixed Google Chat and WhatsApp unread badges so numeric timestamps in read rows are not counted as unread messages.
- Improved unread badge reliability for services that render navigation elements late by adding observation retry and safety polling.
- Kept sidebar utility controls visible by making the service icon list scroll independently when many services are added.
- Let Google Chat use the same Google sign-in compatibility path as Gmail to avoid unsupported-browser sign-in failures.
- Fixed Microsoft Teams badges on `teams.cloud.microsoft` by reporting badge updates through the navigation bridge when remote-webview IPC is unavailable.
- Fixed Microsoft Teams badge counts being doubled when Teams renders duplicate badge nodes for one navigation item.
- Upgraded Svelte to 5.55.7 to address Dependabot-reported XSS vulnerabilities in Svelte.

---

## [0.5.0] — 2026-05-14

### Changed

- Updated Tauri to 2.11.1 or later to fix local-origin IPC checks for remote webview pages on Windows and Android.
- Synced the JavaScript Tauri API and CLI packages with the Rust Tauri 2.11 runtime so `yarn tauri dev` no longer reports a package-version mismatch.

### Fixed

- Reduced hidden Outlook and Teams badge monitoring overhead while keeping background badge and tray unread updates active for loaded services.
- Kept unread badge monitoring active for background services while overlays hide service webviews offscreen.
- Let Gmail and Google sign-in hosts use a Ferdium-style Chrome user agent without the Chrome version and without the Chrome compatibility shim, reducing Google unsupported-browser sign-in failures.
- Delayed resource usage reporting until service pages finish loading so the monitoring bridge cannot interrupt initial webview navigation.
- Restored startup background preloading for all enabled inactive services after fixing the resource usage navigation race.
- Fixed Outlook unread badges getting stuck when unrelated Microsoft app navigation counts appeared near the Inbox folder label.
- Fixed Outlook unread badges for newer folder list rows where the Inbox count is visible but not exposed as a tree item.
- Fixed Outlook unread badge not updating on Tauri 2.11 by switching from the IPC invoke bridge to the navigation bridge used by all other services.
- Fixed disabled service icons so their right-click menu remains available for enabling or deleting the service.
- Fixed service reload menu actions to use the native webview reload API and made service disable close the webview without deleting session storage.

---

## [0.4.2] — 2026-05-11

### Fixed

- Fixed Windows service webviews staying blank until manual reload after startup or adding a service.

---

## [0.4.1] — 2026-05-11

### Added

- Release CI now builds unsigned Windows NSIS installers alongside the macOS DMG and includes Windows entries in the in-app updater manifest.

### Fixed

- Removed the duplicate Check updates button from the Settings page header.
- Reduced todo panel render and textarea resize work for larger todo lists.
- Reduced resource usage monitor sampling cost during long service sessions.
- Reduced native webview work during service switching so large workspaces remain more responsive.
- Serialized startup service preloading through the webview command queue to avoid races with service switching and overlays.
- Reduced Outlook and Teams badge monitoring work while preserving unread badge detection.

---

## [0.4.0] — 2026-05-07

### Added

- **Do Not Disturb.** The workspace can suppress unread tray state and mute service webview audio while DND is enabled.
- **Per-service audio muting.** Service context menus now include per-service audio controls and dynamic Enable/Disable labels.
- CI now verifies that `src/lib/tauri-commands.ts` matches the current Rust command signatures; a stale generated file fails the build with a clear error message.

### Changed

- Updated the tray unread indicator icon design.

### Fixed

- Fixed service right-click context menus failing to open for users with saved notification preferences from before the per-service audio muting rename
- Restored the Add Service dialog, Edit Service dialog, workspace picker, and service context menu so they appear correctly above active service webviews
- Fixed all services reloading from scratch every time an overlay (modal, workspace switcher, settings) was dismissed — `hide_all_webviews` was accidentally closing webviews instead of moving them offscreen
- Fixed a race condition where dismissing an overlay could flash service content briefly behind it before the overlay finished closing
- Fixed remaining webview command sequencing gaps for todo panel resizing, service add/edit saves, and page cleanup
- Fixed Add Service and workspace switcher overlays so one click opens them after active service webviews are moved offscreen
- Fixed service notification badges disappearing from the sidebar after opening Settings
- Fixed macOS arrow/navigation key private-use characters appearing as boxes in service chat fields and todo inputs
- Fixed long todo item text being clipped by wrapping item text across multiple lines
- Fixed long-pressing letter keys on macOS inserting only one character instead of repeating

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

[0.8.0]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.8.0
[0.7.0]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.7.0
[0.6.1]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.6.1
[0.6.0]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.6.0
[0.5.0]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.5.0
[0.4.2]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.4.2
[0.4.1]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.4.1
[0.4.0]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.4.0
[0.3.1]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.3.1
[0.3.0]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.3.0
[0.2.4]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.2.4
[0.2.3]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.2.3
[0.2.2]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.2.2
[0.2.1]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.2.1
[0.2.0]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.2.0
[0.1.0]: https://github.com/adiwidia-dev/ferx/releases/tag/v0.1.0
