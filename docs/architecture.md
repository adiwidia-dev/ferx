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
