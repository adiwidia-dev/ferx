# Notification Previews Design

## Goal

Ferx should show native OS notifications with the sender/message preview text supplied by service web apps when they use the browser Web Notification API. The existing unread-count notification remains a fallback for services that do not provide a web notification.

## Scope

This change only covers notification previews. It does not add the startup preload limit setting; that will be handled separately.

## Architecture

Service webviews already receive a notification shim from `src-tauri/src/service_webview_runtime_scripts.rs`. When notifications are allowed, that shim will capture calls to `new Notification(title, options)` and forward a sanitized payload through a special navigation URL, `https://ferx.notification/?data=...`.

`src-tauri/src/navigation_bridge.rs` will parse and validate the payload, cap text lengths, and emit a `native-notification-preview` event containing `serviceId`, `title`, `body`, and optional `tag`.

`src/routes/+page.svelte` will listen for that event. If the service is enabled, not hibernated, native notifications are enabled, and Do Not Disturb is off, it will send a Tauri native notification using `@tauri-apps/plugin-notification`. Count-based badge notifications remain in place, but a short duplicate guard suppresses the fallback count notification immediately after a preview notification for the same service.

## Privacy And Behavior

The existing per-service `showNativeNotifications` preference controls both count notifications and message previews. No new setting is added in this first pass.

Preview text is best effort. It works when a service calls the Web Notification API and supplies useful title/body content. Services that never call `new Notification(...)`, or services whose shim is intentionally skipped, continue to use unread-count fallback behavior.

## Data Flow

1. Service page calls `new Notification(title, options)`.
2. Injected shim serializes `{ title, body, tag }`.
3. Webview navigates to `https://ferx.notification/?data=<encoded-json>`.
4. Rust navigation bridge blocks the navigation, validates the JSON, and emits `native-notification-preview`.
5. Svelte page finds the matching service and sends a native notification.
6. Badge-count fallback is skipped briefly for that service to avoid duplicate notifications.

## Error Handling

Malformed preview payloads are ignored. Empty title/body payloads are ignored. Oversized text is truncated before it reaches the Svelte shell. Notification permission failures are handled by the existing permission guard and logged without crashing the app.

## Testing

Rust unit tests cover preview payload parsing, truncation, and malformed input rejection in the navigation bridge.

TypeScript unit tests cover preview notification builder and send/skip policy.

Svelte page integration tests cover receiving `native-notification-preview`, respecting Do Not Disturb and service preferences, and suppressing the count fallback after a preview.

Rust script tests cover the injected shim including the `ferx.notification` bridge.
