# Architecture Notes

These notes are for contributors and maintainers working on Ferx internals.

Ferx relies on native webviews and a few deliberate platform-specific workarounds. Read this document before changing Rust windowing logic, badge plumbing, permission shims, or webview sizing behavior.

The current build intentionally targets direct distribution rather than the Mac App Store. Ferx depends on Tauri multiwebview support and macOS private APIs for the current UX, so do not remove those flags casually without re-evaluating the windowing model.

## 1. Native Context Menus And Webview Layering

- Do not replace sidebar context menus with HTML overlays.
- Native Tauri webviews render above normal HTML layers, so HTML menus can be clipped beneath the active webview.
- Sidebar menu actions should continue to flow through the Rust backend and native menu APIs.

## 2. Badge Updates And CSP Constraints

- External webviews cannot rely on normal Tauri IPC in all cases because some apps enforce restrictive CSP rules.
- Badge and resource-usage scripts report state through navigation URLs, not direct `invoke()` calls:
  - unread badges use `https://ferx.notify/<payload>`;
  - resource usage uses `https://ferx.resource/?data=<payload>`.
- `src-tauri/src/navigation_bridge.rs` intercepts those URLs, normalizes payloads, and emits frontend events such as `update-badge` and `resource-usage-update`.
- Do not reintroduce service-specific `report_*` Tauri commands for remote webviews unless the navigation bridge is proven insufficient for a specific service.
- Be conservative when changing badge behavior because regressions are likely to appear only in specific third-party services.

## 3. Notification Permission Overrides

- WhatsApp Web assumes notifications are blocked if the platform prompt is unavailable.
- Ferx intentionally overrides parts of the notification and permissions surface to avoid a persistent in-app warning banner.
- Do not remove or simplify this behavior without re-testing the affected services.

## 4. Retina Sizing And Coordinate Spaces

- Webview sizing must account for the difference between logical and physical pixels.
- Changes to sidebar width, resize handling, or window metrics can easily break webview bounds on retina displays.
- Keep sizing logic aligned with the backend's scale-factor-aware calculations.

## 5. Webview Lifecycle And Command Queue

- Service webviews are long-lived native child windows. Overlay flows must move webviews offscreen; they must not close or hide service webviews unless the caller explicitly requested `close_webview`, `delete_webview`, or `close_all_service_webviews`.
- `hide_all_webviews` only parks the active webview. Background webviews are already offscreen and in background badge mode, so re-parking every service creates avoidable O(N) latency.
- All webview operations from `src/routes/+page.svelte` should go through `createWebviewCommandQueue` in `src/lib/services/webview-commands.ts`. Directly invoking hide/open helpers can race with queued service switches.
- `open_service` should commit active-webview state only after the target child webview exists and has been activated. If a switch fails, the previous active state must remain valid so later overlay hides still target the visible webview.

## 6. Frontend Conventions

- Ferx uses Svelte 5 runes.
- Follow the existing Svelte 5 patterns already used in the project instead of introducing older Svelte 4 state syntax.
- `$state` objects and arrays are deeply reactive. In-place property updates are acceptable for existing `$state` maps where the code intentionally relies on Svelte 5 proxy reactivity.
- Keep generated Tauri command types in `src/lib/tauri-commands.ts`. Frontend services should import payload types from there through `src/lib/services/service-runtime.ts`, not redefine Rust command payloads.

## 7. In-App Updates

- Updates are delivered via `tauri-plugin-updater` against a static `latest.json` manifest hosted on GitHub Releases (`/releases/latest/download/latest.json`).
- Artifact integrity is verified with a **minisign** keypair, not an Apple Developer ID certificate. The public key lives in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`; the private key lives only in CI as `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Release builds are ad-hoc signed during bundling via `bundle.macOS.signingIdentity = "-"` in `src-tauri/tauri.conf.json`. This keeps the shipped app identity stable across versions, but does not provide Developer ID trust or notarization.
- First-run Gatekeeper friction is expected. Ferx intentionally does not target notarization or the Mac App Store (see the top-level note about distribution).
- The updater download stage uses `bundle.createUpdaterArtifacts: true` in `tauri.conf.json` to emit `Ferx.app.tar.gz` + `.sig` alongside the DMG. The DMG is for first-time installs; the tarball is what the updater consumes.
- When changing the updater UI, mock `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` in tests — both are wrapped in `src/lib/services/updater.ts` to keep the Svelte components free of direct plugin imports.

## 8. Config Import And Export

- Current workspace state is stored in `localStorage` under `ferx-workspaces-state`.
- Legacy keys `ferx-workspace-services` and `ferx-workspace-active-id` are still read during startup/import migration, but new runtime writes should target the grouped workspace state.
- App settings are stored under `ferx-app-settings`; todo notes are stored under `ferx-todo-notes`.
- Config exports use format `ferx-workspace-config` version `1` and contain only service metadata/preferences plus app settings. Runtime badges are stripped.
- Imports validate the full JSON file before writing any `localStorage` keys. The replacement flow closes all non-main service webviews via `close_all_service_webviews`, writes the new workspace/app config, clears legacy service keys, then reloads the main workspace in Tauri.
- Config import/export is intentionally not a full profile backup. It does not include service cookies, service-local storage, passwords, or webview data stores. Replacing configuration also does not prune old service session data from disk.
