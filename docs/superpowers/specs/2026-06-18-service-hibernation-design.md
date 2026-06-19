# Service Hibernation Design

Date: 2026-06-18
Status: Implemented

## Goal

Add an optional per-service hibernation setting for users who want Ferx to free memory and CPU for services they are not actively using. The option appears in Add Service and Edit Service as a checkbox named "Hibernate when inactive". It defaults off.

When enabled, Ferx closes that service's native webview after it has been inactive for 60 seconds. Closing is non-destructive: the service configuration, workspace membership, notification preferences, icon color, and storage key remain intact. The next time the user selects or reveals the service, Ferx opens the webview normally with the same storage key.

## Behavior

Hibernation differs from existing service states:

- Disabled means the user has turned the service off. It is not selectable as an active service, not preloaded, not counted for tray unread state, and its webview is closed without deleting session storage.
- Deleted means the user removed the service. Ferx removes it from workspace state and deletes its webview data store/session storage.
- Hibernated means the service is still enabled and selectable, but its inactive webview has been closed to save resources. Ferx keeps the service config and session storage and reloads it automatically when needed.

Ferx schedules hibernation for a service only when all of these are true:

- The service has `hibernateWhenInactive` enabled.
- The service is enabled and belongs to the relevant workspace state.
- The service was active/visible and then became inactive.
- It remains inactive for the full 60 second delay.

The timer starts when:

- The user switches from that service to another service.
- The user switches away from the workspace that contains the active service.
- Ferx becomes hidden or minimized while that service is active.

The timer is cancelled when:

- The service becomes active/visible again before 60 seconds.
- The service is disabled or deleted.
- The workspace is disabled or deleted.
- The page unmounts.

Opening overlays inside Ferx, such as Add/Edit Service, the workspace switcher, settings overlays, or the todo panel, does not count as hibernation inactivity by itself. Existing overlay behavior continues to move active webviews offscreen so user sessions are preserved while the user is still working in Ferx.

## User Experience

The Add/Edit Service dialog adds a checkbox below the URL/icon controls:

Label: "Hibernate when inactive"

Helper copy: "Closes this service after 60 seconds in the background. Saves resources, but background badges and tray unread pause until the service is opened again."

New services default to unchecked. Editing a service shows the current value and saves changes with the rest of the service form.

There is no separate hibernated placeholder screen. If the user selects a hibernated service, Ferx immediately opens the webview using the existing open-service path. The user may see the normal service load time, but no extra click is required.

When hibernation has actually completed, the service tile shows an enabled hibernated state in the sidebar. This state uses a subtle cool-tinted tile background/ring plus a small bottom-right cyan status dot. It must not use disabled styling: no heavy opacity, no grayscale, and no visual treatment that suggests the service cannot be selected. The service title/tooltip changes to "[Service] is hibernated. Click to wake." so hover/focus gives the exact state and action.

## Data Model

Add `hibernateWhenInactive?: boolean` to `PageService`.

The field is persisted in workspace state and included in configuration export/import. Legacy services without the field behave as `false`.

The field is not sent to Rust webview commands because Rust only needs to open, close, hide, or delete webviews. Scheduling decisions stay in the Svelte workspace page.

The current hibernated status is runtime-only. It is not persisted, exported, or written into `PageService`, because hibernation is an effect of the current app session and should be recomputed after restart.

## Architecture

Create a focused Svelte 5 composable store, `src/lib/services/service-hibernation.svelte.ts`, with a matching `.svelte.test.ts`.

The store owns:

- The set of currently hibernated service IDs.
- The pending timer for each service ID.
- Helpers to schedule, cancel, mark hibernated, clear hibernated, and clean up all timers.

The page remains the orchestrator:

- It observes active service/workspace changes and app visibility.
- It asks the hibernation store to schedule or cancel timers.
- When a timer fires, it runs `closeServiceWebview(serviceId)` through `webviewCommands.run(...)`.
- When a hibernated service becomes active/visible, it clears that runtime state and uses the existing `openServiceWebview(...)` path.

All native webview operations still go through `webviewCommands.run(...)`. Hibernation must never call `deleteServiceWebview(...)` or `delete_webview`; it uses `close_webview` only.

The activation key must include the active service's hibernation wake generation. Clearing hibernation increments that generation, which forces exactly one `open_service` command even when the active service ID did not change.

Queued hibernation close callbacks must be cancellation-safe. The implementation keeps a per-service version counter so a timer that fired before the user wakes the service cannot mark the service hibernated after a later cancellation. The page also re-checks service eligibility before entering the command queue and again inside the queued close command.

## App Visibility

Ferx already hides the main window from Rust for tray toggle and close-request behavior. The frontend should treat the app as inactive when the main window is hidden or minimized.

Implementation should use a small helper that combines:

- `document.visibilitychange` for webview/page visibility.
- Tauri v2 `getCurrentWindow().isVisible()` and `getCurrentWindow().isMinimized()` for native window state checks.
- Tauri v2 `getCurrentWindow().onFocusChanged(...)` only as a prompt to re-check state, not as the sole hibernation signal, because blur alone should not hibernate a service while Ferx is still visible.

Context7 check: Tauri v2 documents `getCurrentWindow().isVisible()`, `getCurrentWindow().isMinimized()`, and `getCurrentWindow().onFocusChanged(...)` in `@tauri-apps/api/window`.

When Ferx becomes hidden/minimized, schedule hibernation for the active hibernation-enabled service. When Ferx becomes visible/restored, cancel the active service's pending timer if it has not fired, or reopen the active hibernated service if it has fired.

## Preloading, Badges, And Tray

Background preloading must skip services with `hibernateWhenInactive` enabled. Preloading those services in the background would defeat the feature.

When a service hibernates:

- Keep the last known sidebar badge value in `runtimeBadges`.
- Stop live badge monitoring naturally because the webview is closed.
- Exclude the service from tray unread counting while it is hibernated.

When the user opens the service again, badge monitoring resumes through the normal webview initialization scripts.

## Failure Handling

If `close_webview` fails during hibernation, leave the service non-hibernated in runtime state and log the command failure through the existing webview command queue behavior. Do not show a user toast for this version; failure means Ferx simply keeps the service loaded. The native `close_webview` command must propagate `webview.close()` errors so the frontend can avoid marking a still-live webview as hibernated.

If `open_service` fails while waking a hibernated service, existing open-service failure behavior remains responsible for preserving or reporting state. The hibernated runtime flag should be cleared before or during the wake attempt so a retry can run through the normal activation path.

## Testing

Add focused tests for:

- Service editor input/state saves and restores `hibernateWhenInactive`.
- New services default `hibernateWhenInactive` to false/undefined.
- Workspace storage/import/export accepts and preserves the field.
- `shouldPreloadService` skips hibernation-enabled inactive services.
- Tray unread count excludes runtime-hibernated services while leaving disabled behavior unchanged.
- Hibernation store schedules after 60 seconds, cancels on reactivation, and cleans up timers.
- Page integration: switching services schedules close after 60 seconds for the previous service.
- Page integration: switching back before 60 seconds cancels the close.
- Page integration: hidden/minimized app state schedules hibernation for the active service.
- Page integration: showing Ferx after the timer fired wakes the active hibernated service.

Manual verification should cover:

- Existing disabled behavior still closes without deleting service storage.
- Existing delete behavior still deletes service storage.
- Overlay open/close still preserves active webview sessions.
- A hibernated service reloads with the same login/session when reopened.

## Release Notes

Update `CHANGELOG.md` under `[Unreleased]` with a new feature entry for optional service hibernation and the 60 second inactive delay.

## Non-Goals

- No global hibernation setting.
- No configurable delay in this release.
- No background badge polling for hibernated services.
- No Rust-side hibernation scheduler.
