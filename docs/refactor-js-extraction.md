# Refactoring Plan: JS Script Extraction & Outlook Strategy Array

Two independent maintainability improvements. **Issue 1 must be completed and manually verified before starting Issue 2**, because Issue 2 targets the `.js` file that Issue 1 creates.

---

## Baseline (before starting anything)

Run both test suites and confirm 0 failures:

```bash
cd /Users/danielpanjaitan/personal-project/ferx
yarn test --run
cd src-tauri && cargo test
```

---

## Issue 1 — Extract Embedded JavaScript to `.js` Files

### What this does

Moves ~1,500 lines of JavaScript string literals out of Rust source files into real `.js` files under `src-tauri/scripts/`. Rust loads them at compile time via `include_str!()`. Runtime behavior is byte-for-byte identical — the only change is that the `.js` files can be formatted with Prettier and navigated independently.

### What NOT to touch

- `notification_script()` in `service_webview_runtime_scripts.rs` — short conditional, not worth extracting
- `spellcheck_script()` in `service_webview_runtime_scripts.rs` — same reason
- Any Rust logic, command signatures, or test assertions (no test changes needed for this issue)

### Files created

| New file | Source function |
|----------|----------------|
| `src-tauri/scripts/badge_engine.js` | `badge_engine_script()` |
| `src-tauri/scripts/outlook_badge_engine.js` | `outlook_badge_engine_script()` |
| `src-tauri/scripts/teams_badge_engine.js` | `teams_badge_engine_script()` |
| `src-tauri/scripts/resource_usage_monitor.js` | `resource_usage_monitor_script()` |
| `src-tauri/scripts/google_auth_compat.js` | `google_auth_compat_script()` |
| `src-tauri/scripts/audio_mute_controller.js` | `audio_mute_controller_script()` |
| `src-tauri/scripts/common_webview.js` | `common_webview_script()` |

### Files modified

- `src-tauri/src/service_webview_badge_scripts.rs`
- `src-tauri/src/service_webview_resource_usage.rs`
- `src-tauri/src/service_webview_runtime_scripts.rs`
- `package.json`

---

### Step 1.1 — Create the scripts directory

```bash
mkdir -p /Users/danielpanjaitan/personal-project/ferx/src-tauri/scripts
```

---

### Step 1.2 — Extract `badge_engine.js`

**Source:** `badge_engine_script()` in `service_webview_badge_scripts.rs` (lines 1–176).

**Conversion rules** (this function uses `format!(r#"..."#)` so curly braces are escaped):
- Every `{{` in the Rust string → `{` in the `.js` file
- Every `}}` in the Rust string → `}` in the `.js` file
- The single occurrence of `'{strategy_name}'` → `'__FERX_STRATEGY__'`

Copy the JS content (everything inside the `r#"..."#`) into `src-tauri/scripts/badge_engine.js`, applying those three rules. The result is clean, valid JavaScript.

Replace the function body in `service_webview_badge_scripts.rs`:

```rust
pub(crate) fn badge_engine_script(strategy_name: &str) -> String {
    include_str!("../scripts/badge_engine.js")
        .replace("__FERX_STRATEGY__", strategy_name)
}
```

---

### Step 1.3 — Extract `outlook_badge_engine.js`

**Source:** `outlook_badge_engine_script()` in `service_webview_badge_scripts.rs` (lines 178–534).

**Same conversion rules as Step 1.2** — this function also uses `format!(r#"..."#)`.
- `{{` → `{`, `}}` → `}`, `'{strategy_name}'` → `'__FERX_STRATEGY__'`

Replace the function body:

```rust
pub(crate) fn outlook_badge_engine_script(strategy_name: &str) -> String {
    include_str!("../scripts/outlook_badge_engine.js")
        .replace("__FERX_STRATEGY__", strategy_name)
}
```

---

### Step 1.4 — Extract `teams_badge_engine.js`

**Source:** `teams_badge_engine_script()` in `service_webview_badge_scripts.rs` (lines 536–821).

**No conversion needed** — this function uses a plain `r#"..."#` raw string (no `format!()`), so all braces are already literal. Copy the JS content directly.

Replace the function body:

```rust
pub(crate) fn teams_badge_engine_script() -> String {
    include_str!("../scripts/teams_badge_engine.js").to_owned()
}
```

Note: `.to_owned()` keeps the existing `String` return type so callers don't need changes.

---

### Step 1.5 — Extract `resource_usage_monitor.js`

**Source:** `resource_usage_monitor_script()` in `service_webview_resource_usage.rs`.

**No conversion needed** — plain `r#"..."#`, copy directly.

Replace the function body:

```rust
pub(crate) fn resource_usage_monitor_script() -> &'static str {
    include_str!("../scripts/resource_usage_monitor.js")
}
```

---

### Step 1.6 — Extract `google_auth_compat.js`, `audio_mute_controller.js`, `common_webview.js`

**Source:** `service_webview_runtime_scripts.rs`.

All three functions use plain `r#"..."#` — no conversion needed, copy content directly.

Replace each function body:

```rust
pub(crate) fn google_auth_compat_script() -> &'static str {
    include_str!("../scripts/google_auth_compat.js")
}

pub(crate) fn audio_mute_controller_script() -> &'static str {
    include_str!("../scripts/audio_mute_controller.js")
}

pub(crate) fn common_webview_script() -> &'static str {
    include_str!("../scripts/common_webview.js")
}
```

---

### Step 1.7 — Update `package.json` Prettier scope

In `package.json`, find the `lint` or `format` script that runs Prettier. Add `src-tauri/scripts/*.js` to it so the new files get auto-formatted. The exact change depends on how Prettier is configured — look for any `prettier --write` or `prettier --check` invocation and add the glob.

---

### Step 1.8 — Verify tests pass

```bash
cd /Users/danielpanjaitan/personal-project/ferx
yarn test --run
cd src-tauri && cargo test
```

Expected: same pass counts as baseline (270 JS tests, 78 Rust tests). No changes to any test files should be needed.

---

### ✅ MANUAL VERIFICATION CHECKPOINT 1

**Stop here. Do not start Issue 2 until you have verified all of the following manually.**

Run the app:
```bash
yarn tauri dev
```

| Check | How to test | Expected |
|-------|-------------|----------|
| Outlook badge | Open Outlook with unread emails | Badge count appears on sidebar icon |
| Teams badge | Have unread Teams notification | Badge count appears on sidebar icon |
| WhatsApp badge | Have unread WhatsApp messages | Badge count appears on sidebar icon |
| Audio mute | Right-click a service → disable audio | Service audio goes silent |
| Resource monitor | Settings → enable resource monitor | CPU/memory strip appears below active service |
| Google auth | Add a service that requires Google sign-in | Sign-in flow completes without errors |
| Keyboard input | Type in a chat field inside any service | No box characters (□), key repeat works |
| Service switching | Switch between two services rapidly | Both services show correct content |

If any check fails, the `.js` file content for that script was not copied correctly. Compare the extracted file against the original Rust string literal to find the discrepancy.

**Commit Issue 1 as its own commit before proceeding.**

---

## Issue 2 — Outlook Strategy Array Refactor

### What this does

Replaces the hardcoded `||` evaluation chain in `outlook_badge_engine.js` with an array of detector functions. The change makes adding a new DOM detector a one-line append instead of modifying the evaluation loop. Runtime behavior is identical — same evaluation order, same short-circuit semantics.

### Prerequisite

Issue 1 must be complete. This issue modifies `src-tauri/scripts/outlook_badge_engine.js`.

### Files modified

- `src-tauri/scripts/outlook_badge_engine.js` (created in Issue 1)

### No Rust changes. No test file changes (expected).

---

### Step 2.1 — Update `titleCountState` return values

In `outlook_badge_engine.js`, find `titleCountState`:

**Before:**
```javascript
const titleCountState = (title) => {
    const normalized = normalizeTitle(title);
    const match = normalized.match(/\((\d+)\)/) || normalized.match(/\[(\d+)\]/) || normalized.match(/^(\d+)\s*(?:unread|baru|new|messages?)/i);
    if (!match) return 'clear';
    const count = parseInt(match[1], 10);
    return Number.isFinite(count) && count > 0 ? 'count:' + count : 'clear';
};
```

**After:**
```javascript
const titleCountState = (title) => {
    const normalized = normalizeTitle(title);
    const match = normalized.match(/\((\d+)\)/) || normalized.match(/\[(\d+)\]/) || normalized.match(/^(\d+)\s*(?:unread|baru|new|messages?)/i);
    if (!match) return null;
    const count = parseInt(match[1], 10);
    return Number.isFinite(count) && count > 0 ? 'count:' + count : null;
};
```

**Why this is safe:** In the current `||` chain, `titleCountState` returning `'clear'` acts as the terminal fallback — a truthy value that stops the chain and sets `nextState = 'clear'`. In the new loop, `null` means "this detector found nothing, keep looking". The loop's initial `let nextState = 'clear'` provides the identical fallback when all detectors return null.

---

### Step 2.2 — Define the detectors array

Find the line `const evaluateBadgeState = () => {` and insert the following **immediately before it**:

```javascript
const detectors = [
    outlookScreenReaderState,
    outlookFolderState,
    outlookVisibleFolderRowState,
    () => titleCountState(document.title),
];
```

Order matters — preserve the original evaluation order (cheapest to most expensive DOM query).

---

### Step 2.3 — Replace the `||` chain inside `evaluateBadgeState`

**Before:**
```javascript
const evaluateBadgeState = () => {
    if (!window.__ferx_badge_monitoring_enabled) return;
    let nextState = 'clear';
    try {
        // Short-circuit from cheapest to most expensive.
        nextState =
            outlookScreenReaderState()
            || outlookFolderState()
            || outlookVisibleFolderRowState()
            || titleCountState(document.title);
    } catch (_error) {
        nextState = 'clear';
    }
    emitBadgeState(nextState);
};
```

**After:**
```javascript
const evaluateBadgeState = () => {
    if (!window.__ferx_badge_monitoring_enabled) return;
    let nextState = 'clear';
    try {
        for (const detect of detectors) {
            const result = detect();
            if (result !== null) { nextState = result; break; }
        }
    } catch (_error) {
        nextState = 'clear';
    }
    emitBadgeState(nextState);
};
```

---

### Step 2.4 — Verify tests pass

```bash
cd /Users/danielpanjaitan/personal-project/ferx
yarn test --run
cd src-tauri && cargo test
```

Expected: same pass counts as before. If a Rust test fails because it asserts on the literal `||` chain text, update only that specific assertion to match the new `detectors` array pattern.

---

### ✅ MANUAL VERIFICATION CHECKPOINT 2

**Stop here. Verify the Outlook badge specifically.**

Run the app:
```bash
yarn tauri dev
```

| Check | How to test | Expected |
|-------|-------------|----------|
| Badge appears | Open Outlook with unread emails | Badge count on sidebar icon |
| Badge clears | Mark all emails as read | Badge disappears |
| Badge updates in background | Receive a new email while another service is active | Badge updates without switching to Outlook |
| Title fallback | (Optional) Verify title-based detection still fires if DOM approach finds nothing | Badge shows count from page title like "(5) Inbox" |

If any check fails, compare the modified `evaluateBadgeState` against the original `||` chain to verify the detector order and the `result !== null` condition are correct.

**Commit Issue 2 as its own commit.**

---

## Execution Summary

```
Before starting  →  yarn test --run + cargo test  (baseline)
                           │
                    Issue 1, Steps 1.1–1.7
                           │
                    yarn test --run + cargo test
                           │
              ✅ MANUAL VERIFICATION CHECKPOINT 1
              (badges, audio, resource monitor, Google auth)
                           │
                    git commit (Issue 1 only)
                           │
                    Issue 2, Steps 2.1–2.3
                           │
                    yarn test --run + cargo test
                           │
              ✅ MANUAL VERIFICATION CHECKPOINT 2
              (Outlook badge: appears, clears, updates in background)
                           │
                    git commit (Issue 2 only)
```

---

## Key Technical Notes for the Executor

| Topic | Detail |
|-------|--------|
| `include_str!` path | From `src-tauri/src/*.rs`, scripts live at `../scripts/*.js` |
| Brace escaping | Only `badge_engine.js` and `outlook_badge_engine.js` need `{{` → `{` conversion (they use `format!()`). All other scripts use raw `r#"..."#` — copy as-is. |
| `__FERX_STRATEGY__` | Appears exactly once per parametric file. The replacement value is always a safe internal constant like `"whatsapp-title"` or `"outlook"` — never user input. |
| Teams uses IPC invoke | `teams_badge_engine.js` uses `invoke('report_teams_badge', ...)` — **do not change this to the navigation bridge**. Teams runs at `teams.microsoft.com` which is treated as a local-origin page by the Teams desktop app, so IPC works there. |
| Resource usage uses IPC invoke | Same story — `invoke('report_resource_usage', ...)` — **do not change**. |
| Return types | `teams_badge_engine_script()` currently returns `String`. Use `.to_owned()` after `include_str!()` to preserve the return type without touching callers. |
