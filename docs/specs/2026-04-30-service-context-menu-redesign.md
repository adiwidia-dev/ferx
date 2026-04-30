# Service Context Menu Redesign

**Date:** 2026-04-30
**Status:** Approved

## Overview

Redesign the right-click service context menu to show context-aware "Disable/Enable" labels instead of generic "Toggle" labels, add per-service notification sound muting, and replace the Do Not Disturb icon with a modern Bell/Bell-Slash.

## Scope

Three independent changes:
1. Dynamic context menu labels (Disable/Enable instead of Toggle)
2. Per-service audio muting replacing the current "Toggle notifications" behavior
3. DND icon swap (moon → bell/bell-slash)

---

## Section 1: Context Menu Dynamic Labels

### Payload Extension

Extend the `show_context_menu` Tauri command payload from `{ id, disabled }` to:

```typescript
{
  id: string,
  disabled: boolean,
  showBadge: boolean,   // from notificationPrefs.showBadge
  affectTray: boolean,  // from notificationPrefs.affectTray
  muteAudio: boolean,   // renamed from notificationPrefs.allowNotifications (inverted semantics)
}
```

### Label Rules

| Field value | Menu label |
|-------------|------------|
| `showBadge: true` | "Disable Unread Badge" |
| `showBadge: false` | "Enable Unread Badge" |
| `affectTray: true` | "Disable Unread Tray" |
| `affectTray: false` | "Enable Unread Tray" |
| `muteAudio: false` | "Disable Notification Sound" |
| `muteAudio: true` | "Enable Notification Sound" |

### Files Changed

- `src-tauri/src/desktop_ui.rs` — read new payload fields, set item labels dynamically
- `src/lib/components/workspace/workspace-sidebar.svelte` — pass prefs when calling `onOpenServiceContextMenu`
- `src/routes/+page.svelte` — forward prefs through to the Tauri command call

### NotificationPrefs Rename

`allowNotifications: boolean` → `muteAudio: boolean` (inverted: `true` = muted, `false` = audio enabled).

Update all references across:
- `src/lib/services/notification-prefs.ts`
- `src/routes/+page.svelte` (menu action handler)
- Any other consumer of `allowNotifications`

---

## Section 2: Per-Service Audio Muting

### Behavior Change

"Toggle notifications" is **replaced** by "Disable/Enable Notification Sound". Instead of toggling Web Notifications API access, this mutes audio for that specific service's webview only.

### New Tauri Command

```rust
// src-tauri/src/webview_commands.rs
pub async fn set_service_webview_audio_muted(app: AppHandle, payload: SingleAudioMutedPayload) {
    for (name, webview) in app.webviews() {
        if name == payload.id {
            set_audio_muted(&webview, payload.muted);
            break;
        }
    }
}

pub struct SingleAudioMutedPayload {
    pub id: String,
    pub muted: bool,
}
```

Register in `src-tauri/src/lib.rs` alongside `set_all_service_webviews_audio_muted`.

### Frontend Flow

When `toggle-notifications:{serviceId}` menu action fires:
1. Toggle `muteAudio` on the service's `NotificationPrefs`
2. Call `setServiceWebviewAudioMuted({ id: serviceId, muted: newMuteAudio })` Tauri command
3. No reload required — takes effect immediately
4. Remove the existing toast "Notification setting will apply after reload"

### Apply on Service Open / Reload

After a service webview is opened or reloaded (in the `$effect` in `+page.svelte` that calls `openService`), if `service.notificationPrefs.muteAudio` is true, immediately call `setServiceWebviewAudioMuted({ id, muted: true })`. This ensures the mute state survives reloads.

### DND Interaction

Global DND (`set_all_service_webviews_audio_muted`) overrides all webviews at the webview level regardless of per-service `muteAudio`. Per-service mute is independent — a service muted individually stays muted after DND is turned off.

### tauri-commands.ts Sync

Add `setServiceWebviewAudioMuted` to the generated/maintained `tauri-commands.ts` file per project convention (CI checks for staleness).

---

## Section 3: DND Icon Replacement

### Change

Replace the inline moon SVG pair in `workspace-sidebar.svelte` with Bell/Bell-Slash (Lucide-style). No behavior, styling, or logic changes.

**DND off:**
```svg
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
</svg>
```

**DND on:**
```svg
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  <path d="M18.63 13A17.89 17.89 0 0 1 18 8"/>
  <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/>
  <path d="M18 8a6 6 0 0 0-9.33-5"/>
  <line x1="2" y1="2" x2="22" y2="22"/>
</svg>
```

Button styling unchanged: inactive = `text-muted-foreground hover:bg-foreground/5`, active = `bg-red-500/10 text-red-500 hover:bg-red-500/20`.

---

## Files Touched Summary

| File | Change |
|------|--------|
| `src-tauri/src/desktop_ui.rs` | Extend payload struct, dynamic menu labels |
| `src-tauri/src/webview_commands.rs` | Add `set_service_webview_audio_muted` |
| `src-tauri/src/lib.rs` | Register new Tauri command |
| `src/lib/services/notification-prefs.ts` | Rename `allowNotifications` → `muteAudio` |
| `src/lib/components/workspace/workspace-sidebar.svelte` | Pass prefs to context menu, swap DND icon SVGs |
| `src/routes/+page.svelte` | Forward prefs to Tauri call, update toggle-notifications handler |
| `src/lib/tauri-commands.ts` | Add `setServiceWebviewAudioMuted` |
