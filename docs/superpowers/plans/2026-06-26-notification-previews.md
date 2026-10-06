# Notification Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show native OS notifications with message preview text captured from service Web Notification API calls.

**Architecture:** Capture `new Notification(title, options)` in the existing injected notification shim, pass sanitized preview data through the Rust navigation bridge, and send the native notification from the Svelte shell. Keep unread-count notifications as fallback with a short duplicate guard.

**Tech Stack:** Tauri v2, `@tauri-apps/plugin-notification`, Svelte 5, Vitest, Rust unit tests.

---

### Task 1: TypeScript Preview Notification Helpers

**Files:**
- Modify: `src/lib/services/native-notifications.ts`
- Test: `src/lib/services/native-notifications.test.ts`

- [ ] Write failing tests for parsing preview payloads, building native preview notifications, and skipping previews when DND/service state disables them.
- [ ] Run `yarn test --run src/lib/services/native-notifications.test.ts` and confirm the new tests fail because the helpers do not exist.
- [ ] Add `WebNotificationPreview`, `parseNativeNotificationPreviewPayload`, `shouldSendNativeNotificationPreview`, and `buildNativeNotificationPreview`.
- [ ] Rerun `yarn test --run src/lib/services/native-notifications.test.ts` and confirm the file passes.

### Task 2: Rust Navigation Bridge Event

**Files:**
- Modify: `src-tauri/src/navigation_bridge.rs`

- [ ] Write failing Rust tests for `native_notification_preview_event_payload`, including valid data, empty data rejection, malformed JSON rejection, and truncation.
- [ ] Run `cargo test navigation_bridge::tests::native_notification_preview` from `src-tauri` and confirm the tests fail because the helper does not exist.
- [ ] Implement payload structs, text normalization/truncation, and `ferx.notification` handling that emits `native-notification-preview`.
- [ ] Rerun the focused Rust tests and confirm they pass.

### Task 3: Injected Web Notification Interception

**Files:**
- Modify: `src-tauri/src/service_webview_runtime_scripts.rs`
- Test: `src-tauri/src/lib_tests.rs`

- [ ] Write failing Rust script tests proving allowed notification shim emits `https://ferx.notification/` and denied notification shim does not.
- [ ] Run the focused Rust tests and confirm they fail.
- [ ] Update the allowed notification shim to report `title`, `options.body`, and `options.tag` through the bridge while keeping permission shims.
- [ ] Rerun the focused Rust tests and confirm they pass.

### Task 4: Svelte Page Integration

**Files:**
- Modify: `src/routes/+page.svelte`
- Test: `src/routes/page-workspace-switching.test.ts`

- [ ] Write failing integration tests for sending a preview notification, respecting DND/native notification preferences, and suppressing the badge-count fallback after a preview.
- [ ] Run `yarn test --run src/routes/page-workspace-switching.test.ts` and confirm the new tests fail.
- [ ] Add the `native-notification-preview` listener, preview sender, duplicate guard, and cleanup path.
- [ ] Run Svelte autofixer against the modified `+page.svelte`.
- [ ] Rerun `yarn test --run src/routes/page-workspace-switching.test.ts` and confirm it passes.

### Task 5: Changelog And Full Verification

**Files:**
- Modify: `CHANGELOG.md`

- [ ] Add an Unreleased entry for native notification previews.
- [ ] Run `yarn run check`.
- [ ] Run `yarn test --run`.
- [ ] Run `cargo test` from `src-tauri`.
- [ ] Review `git diff --stat` and commit the completed change.
