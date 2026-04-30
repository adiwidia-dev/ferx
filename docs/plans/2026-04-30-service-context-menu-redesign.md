# Service Context Menu Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the service right-click context menu with context-aware "Disable/Enable" labels, per-service audio muting, and a Bell/Bell-Slash DND icon.

**Architecture:** Three independent changesets flow through the stack: (1) rename `allowNotifications` → `muteAudio` in TypeScript types and wire the new per-service audio muting action; (2) add a Rust `set_service_webview_audio_muted` command and extend `show_context_menu` to accept live prefs for dynamic labels; (3) swap the DND SVG icons. Changes are additive on the Rust side (new command + new params on existing command) and a mechanical rename on the TypeScript side.

**Tech Stack:** Rust + Tauri 2 (`tauri::menu`, `tauri::webview`), SvelteKit + TypeScript (Svelte 5 runes), tauri-specta (auto-generates `src/lib/tauri-commands.ts` from Rust in debug builds).

---

## File Map

| File | Action | What Changes |
|------|--------|--------------|
| `src/lib/services/notification-prefs.ts` | Modify | Rename `allowNotifications` → `muteAudio`, invert default |
| `src/lib/services/service-config.ts` | Modify | Rename in `StoredService` type and validator |
| `src/lib/services/workspace-config-import.ts` | Modify | Rename in key iteration list |
| `src/lib/services/service-runtime.ts` | Modify | Rename in `ServiceWebviewService`, always pass `allowNotifications: true` |
| `src/lib/services/notification-prefs.test.ts` | Modify | Update fixtures (inverted semantics) |
| `src/lib/services/service-runtime.test.ts` | Modify | Update fixtures |
| `src/lib/services/webview-commands.test.ts` | Modify | Update fixture + `showServiceContextMenu` test |
| `src/lib/services/workspace-actions.test.ts` | Modify | Update fixture + assertion |
| `src/lib/services/workspace-config-import.test.ts` | Modify | Update fixtures |
| `src/lib/services/workspace-config-export.test.ts` | Modify | Update fixtures |
| `src/lib/services/service-config.test.ts` | Modify | Update fixtures |
| `src/lib/services/service-editor.svelte.test.ts` | Modify | Update fixture |
| `src/routes/page-spell-check-setting.test.ts` | Modify | Update fixture |
| `src/routes/settings/settings-page.svelte.test.ts` | Modify | Update fixtures |
| `src-tauri/src/webview_commands.rs` | Modify | Add `SingleAudioMutedPayload` + `set_service_webview_audio_muted` |
| `src-tauri/src/lib.rs` | Modify | Register new command, extend `show_context_menu` wrapper |
| `src-tauri/src/desktop_ui.rs` | Modify | Extend `show_context_menu` for dynamic labels |
| `src/lib/tauri-commands.ts` | Modify | Add new command + type, update `showContextMenu` signature |
| `src/lib/services/webview-commands.ts` | Modify | Add `setServiceWebviewAudioMuted`, extend `showServiceContextMenu` |
| `src/lib/components/workspace/workspace-sidebar.svelte` | Modify | Pass prefs to context menu, swap DND SVGs |
| `src/routes/+page.svelte` | Modify | Update context menu call, toggle-notifications handler, apply-on-open |

---

## Task 1: Rename `allowNotifications` → `muteAudio` in Source TypeScript Files

**Files:**
- Modify: `src/lib/services/notification-prefs.ts`
- Modify: `src/lib/services/service-config.ts`
- Modify: `src/lib/services/workspace-config-import.ts`
- Modify: `src/lib/services/service-runtime.ts`

- [ ] **Step 1: Update `notification-prefs.ts`**

Replace the entire file content:

```typescript
export interface NotificationPrefs {
  showBadge: boolean;
  affectTray: boolean;
  muteAudio: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  showBadge: true,
  affectTray: true,
  muteAudio: false,
};

type ServiceWithOptionalNotificationPrefs = {
  id: string;
  name: string;
  url: string;
  storageKey: string;
  disabled?: boolean;
  badge?: number;
  notificationPrefs?: Partial<NotificationPrefs>;
};

type ServiceWithNotificationPrefs = ServiceWithOptionalNotificationPrefs & {
  notificationPrefs: NotificationPrefs;
};

export function ensureServiceNotificationPrefs(
  services: ServiceWithOptionalNotificationPrefs[],
): {
  services: ServiceWithNotificationPrefs[];
  changed: boolean;
} {
  let changed = false;

  return {
    services: services.map((service) => {
      const notificationPrefs = {
        ...DEFAULT_NOTIFICATION_PREFS,
        ...service.notificationPrefs,
      };

      if (
        service.notificationPrefs &&
        service.notificationPrefs.showBadge !== undefined &&
        service.notificationPrefs.affectTray !== undefined &&
        service.notificationPrefs.muteAudio !== undefined
      ) {
        return {
          ...service,
          notificationPrefs,
        } as ServiceWithNotificationPrefs;
      }

      changed = true;
      return {
        ...service,
        notificationPrefs,
      };
    }),
    changed,
  };
}

export function countTrayRelevantUnreadServices(
  services: ServiceWithNotificationPrefs[],
) {
  return services.filter(
    (service) =>
      !service.disabled &&
      service.notificationPrefs.affectTray &&
      !!service.badge &&
      service.badge !== 0,
  ).length;
}
```

- [ ] **Step 2: Update `service-config.ts`**

In `StoredService`, change `allowNotifications?: boolean` to `muteAudio?: boolean`:

```typescript
notificationPrefs?: {
  showBadge?: boolean;
  affectTray?: boolean;
  muteAudio?: boolean;
};
```

In `isNotificationPrefs`, replace the `allowNotifications` check:

```typescript
function isNotificationPrefs(value: unknown): value is StoredService["notificationPrefs"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    (candidate.showBadge === undefined || typeof candidate.showBadge === "boolean") &&
    (candidate.affectTray === undefined ||
      typeof candidate.affectTray === "boolean") &&
    (candidate.muteAudio === undefined ||
      typeof candidate.muteAudio === "boolean")
  );
}
```

- [ ] **Step 3: Update `workspace-config-import.ts`**

Change the key list in `parseNotificationPrefs` (line 73):

```typescript
for (const key of ["showBadge", "affectTray", "muteAudio"] as const) {
```

- [ ] **Step 4: Update `service-runtime.ts`**

Change `ServiceWebviewService.notificationPrefs` type:

```typescript
export type ServiceWebviewService = {
  id: string;
  url: string;
  storageKey: string;
  disabled?: boolean;
  notificationPrefs: {
    showBadge?: boolean;
    affectTray?: boolean;
    muteAudio: boolean;
  };
};
```

In `createServiceWebviewPayload`, always pass `allowNotifications: true` (web notifications are no longer user-controlled):

```typescript
return {
  id: service.id,
  url: service.url,
  storageKey: service.storageKey,
  allowNotifications: true,
  badgeMonitoringEnabled,
  spellCheckEnabled,
  resourceUsageMonitoringEnabled,
};
```

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`

Expected: no errors related to `allowNotifications` or `muteAudio`. Remaining errors (if any) are in test files, which are covered in Task 2.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/notification-prefs.ts \
        src/lib/services/service-config.ts \
        src/lib/services/workspace-config-import.ts \
        src/lib/services/service-runtime.ts
git commit -m "refactor: rename allowNotifications → muteAudio in NotificationPrefs (inverted semantics)"
```

---

## Task 2: Update Test Fixtures

**Semantics reminder:** `allowNotifications: true` (old default, allowed) → `muteAudio: false` (new default, unmuted). `allowNotifications: false` (blocked) → `muteAudio: true` (muted).

**Files:**
- Modify: `src/lib/services/notification-prefs.test.ts`
- Modify: `src/lib/services/service-runtime.test.ts`
- Modify: `src/lib/services/webview-commands.test.ts`
- Modify: `src/lib/services/workspace-actions.test.ts`
- Modify: `src/lib/services/workspace-config-import.test.ts`
- Modify: `src/lib/services/workspace-config-export.test.ts`
- Modify: `src/lib/services/service-config.test.ts`
- Modify: `src/lib/services/service-editor.svelte.test.ts`
- Modify: `src/routes/page-spell-check-setting.test.ts`
- Modify: `src/routes/settings/settings-page.svelte.test.ts`

- [ ] **Step 1: Replace all `allowNotifications: true` occurrences**

In every test file listed above, replace every `allowNotifications: true` with `muteAudio: false`.

Run: `grep -rn "allowNotifications: true" src/` to find all occurrences, then edit each file.

- [ ] **Step 2: Replace all `allowNotifications: false` occurrences**

Replace every `allowNotifications: false` with `muteAudio: true`.

Run: `grep -rn "allowNotifications: false" src/` to find occurrences. Expected files: `notification-prefs.test.ts`, `service-config.test.ts`, `workspace-config-export.test.ts`.

- [ ] **Step 3: Replace `.allowNotifications` property accesses**

In `workspace-actions.test.ts` line 129, change:
```typescript
expect(nextState.servicesById.shared.notificationPrefs.allowNotifications).toBe(false);
```
to:
```typescript
expect(nextState.servicesById.shared.notificationPrefs.muteAudio).toBe(true);
```

- [ ] **Step 4: Update `webview-commands.test.ts` — service fixture**

In `createService`, change:
```typescript
notificationPrefs: {
  showBadge: true,
  affectTray: true,
  muteAudio: false,
},
```

- [ ] **Step 5: Update `webview-commands.test.ts` — `showServiceContextMenu` call and assertion**

The call at line 42 becomes:
```typescript
await showServiceContextMenu(
  "chat",
  true,
  { showBadge: true, affectTray: true, muteAudio: false },
  invokeCommand,
);
```

The assertion at lines 78-81 becomes:
```typescript
expect(invokeCommand).toHaveBeenNthCalledWith(8, "show_context_menu", {
  id: "chat",
  disabled: true,
  showBadge: true,
  affectTray: true,
  muteAudio: false,
});
```

- [ ] **Step 6: Run tests**

Run: `npm test`

Expected: all tests pass. If any test still mentions `allowNotifications`, it was missed — fix and re-run.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/notification-prefs.test.ts \
        src/lib/services/service-runtime.test.ts \
        src/lib/services/webview-commands.test.ts \
        src/lib/services/workspace-actions.test.ts \
        src/lib/services/workspace-config-import.test.ts \
        src/lib/services/workspace-config-export.test.ts \
        src/lib/services/service-config.test.ts \
        src/lib/services/service-editor.svelte.test.ts \
        src/routes/page-spell-check-setting.test.ts \
        src/routes/settings/settings-page.svelte.test.ts
git commit -m "test: update fixtures for allowNotifications → muteAudio rename"
```

---

## Task 3: Add `set_service_webview_audio_muted` Rust Command

**Files:**
- Modify: `src-tauri/src/webview_commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add `SingleAudioMutedPayload` struct to `webview_commands.rs`**

After the existing `AudioMutedPayload` struct (around line 49), add:

```rust
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SingleAudioMutedPayload {
    pub(crate) id: String,
    pub(crate) muted: bool,
}
```

- [ ] **Step 2: Add `set_service_webview_audio_muted` command to `webview_commands.rs`**

After the `set_all_service_webviews_audio_muted` function (around line 147), add:

```rust
#[tauri::command]
#[specta::specta]
pub async fn set_service_webview_audio_muted(app: AppHandle, payload: SingleAudioMutedPayload) {
    for (name, webview) in app.webviews() {
        if name == payload.id {
            set_audio_muted(&webview, payload.muted);
            break;
        }
    }
}
```

- [ ] **Step 3: Register command in `lib.rs`**

In `build_specta()`, add `webview_commands::set_service_webview_audio_muted` to `collect_commands!`:

```rust
pub(crate) fn build_specta() -> SpectaBuilder<tauri::Wry> {
    SpectaBuilder::<tauri::Wry>::new().commands(collect_commands![
        webview_commands::open_service,
        webview_commands::hide_all_webviews,
        webview_commands::set_all_service_webviews_audio_muted,
        webview_commands::set_service_webview_audio_muted,
        webview_commands::close_all_service_webviews,
        webview_commands::set_right_panel_width,
        webview_commands::save_workspace_config_export,
        webview_commands::restart_app,
        webview_commands::reload_webview,
        webview_commands::report_outlook_badge,
        webview_commands::report_teams_badge,
        webview_commands::report_resource_usage,
        webview_commands::close_webview,
        webview_commands::delete_webview,
        webview_commands::load_service,
        show_context_menu,
        update_tray_icon,
    ])
}
```

- [ ] **Step 4: Cargo check**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/webview_commands.rs src-tauri/src/lib.rs
git commit -m "feat(rust): add set_service_webview_audio_muted command for per-service audio muting"
```

---

## Task 4: Extend `show_context_menu` for Dynamic Labels

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/desktop_ui.rs`

- [ ] **Step 1: Update `show_context_menu` wrapper in `lib.rs`**

Replace the existing wrapper (lines 26-28):

```rust
#[tauri::command]
#[specta::specta]
fn show_context_menu(
    app: tauri::AppHandle,
    window: tauri::Window,
    id: String,
    disabled: bool,
    show_badge: bool,
    affect_tray: bool,
    mute_audio: bool,
) {
    desktop_ui::show_context_menu(app, window, id, disabled, show_badge, affect_tray, mute_audio);
}
```

- [ ] **Step 2: Update `show_context_menu` signature in `desktop_ui.rs`**

Change the function signature (line 4):

```rust
pub(crate) fn show_context_menu(
    app: tauri::AppHandle,
    window: tauri::Window,
    id: String,
    disabled: bool,
    show_badge: bool,
    affect_tray: bool,
    mute_audio: bool,
) {
```

- [ ] **Step 3: Replace `toggle_badge` label with dynamic label**

Change the `MenuItem::with_id` call for `toggle_badge` (lines 27-38):

```rust
let toggle_badge = match MenuItem::with_id(
    &app,
    format!("toggle-badge:{}", id),
    if show_badge { "Disable Unread Badge" } else { "Enable Unread Badge" },
    true,
    None::<&str>,
) {
    Ok(item) => item,
    Err(error) => {
        eprintln!("Failed to build Disable/Enable Unread Badge menu item: {error}");
        return;
    }
};
```

- [ ] **Step 4: Replace `toggle_tray` label with dynamic label**

Change the `MenuItem::with_id` call for `toggle_tray` (lines 40-51):

```rust
let toggle_tray = match MenuItem::with_id(
    &app,
    format!("toggle-tray:{}", id),
    if affect_tray { "Disable Unread Tray" } else { "Enable Unread Tray" },
    true,
    None::<&str>,
) {
    Ok(item) => item,
    Err(error) => {
        eprintln!("Failed to build Disable/Enable Unread Tray menu item: {error}");
        return;
    }
};
```

- [ ] **Step 5: Replace `toggle_notifications` label with dynamic label**

Change the `MenuItem::with_id` call for `toggle_notifications` (lines 53-65):

```rust
let toggle_notifications = match MenuItem::with_id(
    &app,
    format!("toggle-notifications:{}", id),
    if mute_audio { "Enable Notification Sound" } else { "Disable Notification Sound" },
    true,
    None::<&str>,
) {
    Ok(item) => item,
    Err(error) => {
        eprintln!("Failed to build Disable/Enable Notification Sound menu item: {error}");
        return;
    }
};
```

- [ ] **Step 6: Cargo check**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: compiles without errors.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/desktop_ui.rs
git commit -m "feat(rust): extend show_context_menu with dynamic Disable/Enable labels"
```

---

## Task 5: Update `tauri-commands.ts`

This file is auto-generated by tauri-specta in debug builds. We update it manually here to keep CI happy; the CI test (`tauri_commands_typescript_is_up_to_date`) verifies the file matches what specta would generate.

**Files:**
- Modify: `src/lib/tauri-commands.ts`

- [ ] **Step 1: Add `SingleAudioMutedPayload` type**

After the `AudioMutedPayload` type (line 79):

```typescript
export type SingleAudioMutedPayload = { id: string; muted: boolean }
```

- [ ] **Step 2: Add `setServiceWebviewAudioMuted` command**

In the `commands` object, after `setAllServiceWebviewsAudioMuted`:

```typescript
async setServiceWebviewAudioMuted(payload: SingleAudioMutedPayload) : Promise<void> {
    await TAURI_INVOKE("set_service_webview_audio_muted", { payload });
},
```

- [ ] **Step 3: Update `showContextMenu` signature**

Replace:
```typescript
async showContextMenu(id: string, disabled: boolean) : Promise<void> {
    await TAURI_INVOKE("show_context_menu", { id, disabled });
},
```
With:
```typescript
async showContextMenu(id: string, disabled: boolean, showBadge: boolean, affectTray: boolean, muteAudio: boolean) : Promise<void> {
    await TAURI_INVOKE("show_context_menu", { id, disabled, showBadge, affectTray, muteAudio });
},
```

- [ ] **Step 4: Verify with Rust test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml tauri_commands_typescript_is_up_to_date`

Expected: PASS. If FAIL, the generated output will show what specta expected — diff and fix `tauri-commands.ts` accordingly.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tauri-commands.ts
git commit -m "chore: sync tauri-commands.ts — add setServiceWebviewAudioMuted, extend showContextMenu"
```

---

## Task 6: Update `webview-commands.ts` and Its Test

**Files:**
- Modify: `src/lib/services/webview-commands.ts`
- Modify: `src/lib/services/webview-commands.test.ts` (already partially updated in Task 2)

- [ ] **Step 1: Extend `showServiceContextMenu` to accept prefs**

Replace the existing `showServiceContextMenu` function:

```typescript
export function showServiceContextMenu(
  id: string,
  disabled: boolean,
  notificationPrefs: { showBadge: boolean; affectTray: boolean; muteAudio: boolean },
  invokeCommand: InvokeCommand = invoke,
) {
  return invokeCommand("show_context_menu", {
    id,
    disabled,
    showBadge: notificationPrefs.showBadge,
    affectTray: notificationPrefs.affectTray,
    muteAudio: notificationPrefs.muteAudio,
  });
}
```

- [ ] **Step 2: Add `setServiceWebviewAudioMuted`**

After `setAllServiceWebviewsAudioMuted`:

```typescript
export function setServiceWebviewAudioMuted(
  id: string,
  muted: boolean,
  invokeCommand: InvokeCommand = invoke,
) {
  return invokeCommand("set_service_webview_audio_muted", {
    payload: { id, muted },
  });
}
```

- [ ] **Step 3: Add test coverage for `setServiceWebviewAudioMuted` in `webview-commands.test.ts`**

In the `"keeps native command names and payloads explicit"` test, add after the `showServiceContextMenu` call:

```typescript
await setServiceWebviewAudioMuted("chat", true, invokeCommand);
```

And add the assertion:
```typescript
expect(invokeCommand).toHaveBeenNthCalledWith(9, "set_service_webview_audio_muted", {
  payload: { id: "chat", muted: true },
});
```

Also add `setServiceWebviewAudioMuted` to the import at the top of the test file:

```typescript
import {
  closeServiceWebview,
  createWebviewCommandQueue,
  deleteServiceWebview,
  hideAllWebviews,
  openServiceWebview,
  preloadBackgroundServices,
  reloadServiceWebview,
  setAllServiceWebviewsAudioMuted,
  setServiceWebviewAudioMuted,
  setRightPanelWidth,
  showServiceContextMenu,
} from "./webview-commands";
```

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: all tests pass including the updated webview-commands test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/webview-commands.ts src/lib/services/webview-commands.test.ts
git commit -m "feat: extend showServiceContextMenu with prefs, add setServiceWebviewAudioMuted"
```

---

## Task 7: Update `workspace-sidebar.svelte` — Props and DND Icon

**Files:**
- Modify: `src/lib/components/workspace/workspace-sidebar.svelte`

- [ ] **Step 1: Update `onOpenServiceContextMenu` prop type**

In the `interface Props` block, change:

```typescript
onOpenServiceContextMenu: (input: {
  id: string;
  disabled: boolean;
  showBadge: boolean;
  affectTray: boolean;
  muteAudio: boolean;
}) => void;
```

- [ ] **Step 2: Update context menu call in the template**

In the `oncontextmenu` handler (around line 111-117), change:

```svelte
oncontextmenu={(event) => {
  event.preventDefault();
  onOpenServiceContextMenu({
    id: service.id,
    disabled: !!service.disabled,
    showBadge: service.notificationPrefs.showBadge,
    affectTray: service.notificationPrefs.affectTray,
    muteAudio: service.notificationPrefs.muteAudio,
  });
}}
```

- [ ] **Step 3: Swap the DND-off SVG (moon → bell)**

In the `{:else}` branch of the DND button (around line 186-200), replace the SVG:

```svelte
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="20"
  height="20"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
</svg>
```

- [ ] **Step 4: Swap the DND-on SVG (moon-slash → bell-slash)**

In the `{#if isDnd}` branch (around line 171-185), replace the SVG:

```svelte
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="20"
  height="20"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
  <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
  <path d="M18 8a6 6 0 0 0-9.33-5" />
  <line x1="2" y1="2" x2="22" y2="22" />
</svg>
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/workspace/workspace-sidebar.svelte
git commit -m "feat: pass prefs to context menu, swap DND icon to Bell/Bell-Slash"
```

---

## Task 8: Update `+page.svelte` — Context Menu Handler and Audio Muting

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Add `setServiceWebviewAudioMuted` to imports**

In the import block for `webview-commands` (around line 15-26), add `setServiceWebviewAudioMuted`:

```typescript
import {
  closeServiceWebview,
  createWebviewCommandQueue,
  deleteServiceWebview,
  hideAllWebviews,
  openServiceWebview,
  preloadBackgroundServices,
  preloadServiceWebview,
  reloadServiceWebview,
  setAllServiceWebviewsAudioMuted,
  setServiceWebviewAudioMuted,
  setRightPanelWidth,
  showServiceContextMenu,
} from "$lib/services/webview-commands";
```

- [ ] **Step 2: Update `openServiceContextMenu` to forward prefs**

Replace the existing function (around line 444-446):

```typescript
async function openServiceContextMenu(input: {
  id: string;
  disabled: boolean;
  showBadge: boolean;
  affectTray: boolean;
  muteAudio: boolean;
}) {
  await showServiceContextMenu(input.id, input.disabled, {
    showBadge: input.showBadge,
    affectTray: input.affectTray,
    muteAudio: input.muteAudio,
  });
}
```

- [ ] **Step 3: Update `toggle-notifications` handler**

In the `menu-action` listener (around line 294-300), replace:

```typescript
if (action === "toggle-notifications") {
  updateServiceNotificationPrefs(targetId, (prefs) => ({
    ...prefs,
    allowNotifications: !prefs.allowNotifications,
  }));
  toastMessage = "Notification setting will apply after reload";
}
```

with:

```typescript
if (action === "toggle-notifications") {
  let newMuteAudio = false;
  updateServiceNotificationPrefs(targetId, (prefs) => {
    newMuteAudio = !prefs.muteAudio;
    return { ...prefs, muteAudio: newMuteAudio };
  });
  void webviewCommands.run(() => setServiceWebviewAudioMuted(targetId, newMuteAudio));
}
```

- [ ] **Step 4: Apply per-service mute after opening a service**

In the `$effect` that calls `openServiceWebview` (around line 194-208), add a queued mute call after the open:

```typescript
$effect(() => {
  if (
    serviceEditor.isOpen ||
    isWorkspaceSwitcherOpen ||
    isCurrentWorkspaceDisabled ||
    (activeService && activeService.disabled)
  ) {
    webviewCommands.run(hideAllWebviews);
  } else if (activeService && !activeService.disabled) {
    const service = activeService;
    webviewCommands.run(
      () => openServiceWebview(service, spellCheckEnabled, resourceUsageMonitoringEnabled),
      { interruptible: true },
    );
    if (service.notificationPrefs.muteAudio) {
      void webviewCommands.run(() => setServiceWebviewAudioMuted(service.id, true));
    }
  }
});
```

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Run full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: wire per-service audio muting and dynamic context menu from frontend"
```

---

## Self-Review Checklist

- [x] **Spec § 1 (dynamic labels):** Covered — Task 4 (Rust labels), Task 6 (TS function), Tasks 7–8 (frontend wiring)
- [x] **Spec § 2 (per-service audio muting):** Covered — Task 3 (Rust command), Task 8 (toggle-notifications handler + apply-on-open)
- [x] **Spec § 2 (muteAudio persists/survives reload):** Covered — Task 8 Step 4 re-applies mute after `openServiceWebview`
- [x] **Spec § 3 (DND icon):** Covered — Task 7 Steps 3–4
- [x] **NotificationPrefs rename:** Covered — Tasks 1–2 (source + tests)
- [x] **tauri-commands.ts CI check:** Covered — Task 5 Step 4 runs the staleness test
- [x] **Toast removal:** Covered — Task 8 Step 3 removes the "Notification setting will apply after reload" toast
- [x] **No new persistence layer needed:** `muteAudio` lives in `NotificationPrefs` which is already persisted in localStorage

---

## Execution Options

**Plan complete and saved to `docs/plans/2026-04-30-service-context-menu-redesign.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
