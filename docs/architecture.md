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
- Badge scraping and delivery must preserve the current bridge strategy used by Ferx's injected scripts and backend event handling.
- Be conservative when changing badge behavior because regressions are likely to appear only in specific third-party services.

## 3. Notification Permission Overrides

- WhatsApp Web assumes notifications are blocked if the platform prompt is unavailable.
- Ferx intentionally overrides parts of the notification and permissions surface to avoid a persistent in-app warning banner.
- Do not remove or simplify this behavior without re-testing the affected services.

## 4. Retina Sizing And Coordinate Spaces

- Webview sizing must account for the difference between logical and physical pixels.
- Changes to sidebar width, resize handling, or window metrics can easily break webview bounds on retina displays.
- Keep sizing logic aligned with the backend's scale-factor-aware calculations.

## 5. Frontend Conventions

- Ferx uses Svelte 5 runes.
- Follow the existing Svelte 5 patterns already used in the project instead of introducing older Svelte 4 state syntax.

## 6. In-App Updates

- Updates are delivered via `tauri-plugin-updater` against a static `latest.json` manifest hosted on GitHub Releases (`/releases/latest/download/latest.json`).
- Artifact integrity is verified with a **minisign** keypair, not an Apple Developer ID certificate. The public key lives in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`; the private key lives only in CI as `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Release builds are ad-hoc signed during bundling via `bundle.macOS.signingIdentity = "-"` in `src-tauri/tauri.conf.json`. This keeps the shipped app identity stable across versions, but does not provide Developer ID trust or notarization.
- First-run Gatekeeper friction is expected. Ferx intentionally does not target notarization or the Mac App Store (see the top-level note about distribution).
- The updater download stage uses `bundle.createUpdaterArtifacts: true` in `tauri.conf.json` to emit `Ferx.app.tar.gz` + `.sig` alongside the DMG. The DMG is for first-time installs; the tarball is what the updater consumes.
- When changing the updater UI, mock `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` in tests — both are wrapped in `src/lib/services/updater.ts` to keep the Svelte components free of direct plugin imports.
