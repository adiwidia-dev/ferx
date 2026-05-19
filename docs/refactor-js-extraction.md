# Webview Script Layout

This document describes the current injected JavaScript layout for service webviews.

Ferx keeps larger injected scripts as real `.js` files under `src-tauri/scripts/`. Rust loads those files at compile time with `include_str!()` from the focused loader modules in `src-tauri/src/`.

## Script Files

| Script | Purpose | Rust loader |
| --- | --- | --- |
| `src-tauri/scripts/badge_engine.js` | Generic fallback badge engine for services without a custom strategy. | `badge_engine_script()` in `service_webview_badge_scripts.rs` |
| `src-tauri/scripts/badge_engine_utils.js` | Shared badge payload/reporting helpers. | `badge_engine_utils_script()` |
| `src-tauri/scripts/badge_engine_scaffold.js` | Shared monitor lifecycle: init guard, evaluation queue, DOM/title observers, safety poll, mode switching, and start sequence. | `badge_engine_scaffold_script()` |
| `src-tauri/scripts/outlook_badge_engine.js` | Outlook-specific unread detection helpers. | `outlook_badge_engine_script()` |
| `src-tauri/scripts/teams_badge_engine.js` | Teams-specific unread detection helpers. | `teams_badge_engine_script()` |
| `src-tauri/scripts/google_chat_badge_engine.js` | Google Chat-specific unread detection helpers. | `google_chat_badge_engine_script()` |
| `src-tauri/scripts/telegram_badge_engine.js` | Telegram-specific unread detection helpers. | `telegram_badge_engine_script()` |
| `src-tauri/scripts/whatsapp_badge_engine.js` | WhatsApp-specific unread detection helpers. | `whatsapp_badge_engine_script()` |
| `src-tauri/scripts/resource_usage_monitor.js` | Service page resource-usage sampler. | `resource_usage_monitor_script()` in `service_webview_resource_usage.rs` |
| `src-tauri/scripts/google_auth_compat.js` | Google sign-in compatibility adjustments. | `google_auth_compat_script()` in `service_webview_runtime_scripts.rs` |
| `src-tauri/scripts/audio_mute_controller.js` | Media/WebAudio muting hooks. | `audio_mute_controller_script()` |
| `src-tauri/scripts/common_webview.js` | Common service webview hooks such as shortcut/download navigation handling. | `common_webview_script()` |

## Badge Engine Composition

Service-specific badge engines are intentionally thin. The Rust loader prepends the shared runtime before the service-specific file:

```rust
format!(
    "{}\n{}",
    badge_engine_runtime_script(),
    include_str!("../scripts/outlook_badge_engine.js"),
)
```

`badge_engine_runtime_script()` currently combines:

1. `badge_engine_utils.js`
2. `badge_engine_scaffold.js`

Each service-specific file then calls `window.__ferxInitBadgeMonitor(config)` with its detector logic and monitoring-mode options.

The generic fallback `badge_engine.js` is separate because it predates the scaffold and serves simple title/strategy-based badge cases.

## Reporting Bridge

Remote service pages should not rely on Tauri IPC `invoke()` for badge or resource reporting. Some third-party apps enforce restrictive CSP rules or run in origins where direct IPC is unreliable.

Current reporting path:

- Badge scripts call the shared reporting helper, which navigates to `https://ferx.notify/<payload>`.
- `resource_usage_monitor.js` navigates to `https://ferx.resource/?data=<payload>`.
- `src-tauri/src/navigation_bridge.rs` intercepts those URLs in `handle_special_navigation`, prevents the real navigation, normalizes payloads, and emits frontend events.

Do not add new `report_outlook_badge`, `report_teams_badge`, or `report_resource_usage` commands. Those IPC commands were removed; the navigation bridge is the current supported transport.

## Editing Rules

- Keep large injected JavaScript in `src-tauri/scripts/`, not inline Rust string literals.
- Add a narrow Rust loader for any new script and include it in the relevant setup path.
- Keep service-specific badge logic inside the service-specific script; put shared lifecycle/reporting behavior in `badge_engine_utils.js` or `badge_engine_scaffold.js`.
- Preserve monitoring modes:
  - `active` mode may attach full DOM observers for fast foreground updates;
  - `background` mode should keep lightweight title/safety-poll behavior without broad subtree observers;
  - disabled monitoring should stop reports.
- Update or add script-focused Vitest coverage in `src/lib/services/*-badge-engine-script.test.ts` or `resource-usage-monitor-script.test.ts` when changing script behavior.
- Run `yarn test --run` and `cargo test --manifest-path src-tauri/Cargo.toml --lib` after script changes.

## Manual Checks For Script Changes

When changing injected scripts, manually verify the affected runtime behavior in `yarn tauri dev`:

| Area | Check |
| --- | --- |
| Badges | Open affected services with unread items; badges appear, update, and clear. |
| Background badges | Switch away from the service; unread state still updates without foregrounding it. |
| Audio mute | Toggle service audio mute from the context menu; media and WebAudio output go silent/resume. |
| Resource monitor | Enable resource usage monitoring in Settings; the active-service strip updates without interrupting page navigation. |
| Google auth | Add/sign into a Google-backed service; the sign-in flow is not rejected as an unsupported browser. |
| Common hooks | Keyboard shortcuts, external download handling, and typing inside service pages still work. |
