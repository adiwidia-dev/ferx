# Agent Instructions

This file is read automatically by AI coding agents at the start of every session.

## Critical architecture rules

### Webview lifecycle — read this before touching any webview command

Service webviews are long-lived native child windows. They must NEVER be closed except via the explicit `close_webview`, `delete_webview`, or `close_all_service_webviews` commands.

`hide_all_webviews` must only move webviews offscreen (`set_bounds` to -10000,-10000). It must NOT call `webview.close()` or `webview.hide()`. Closing a webview in `hide_all_webviews` destroys user sessions and forces every service to reload from scratch when the overlay is dismissed.

`open_service` detects existing webviews via `already_exists` and repositions them without reloading. This is the intended path after `hide_all_webviews`.

### Webview command queue

All webview operations in `+page.svelte` must go through `webviewCommands.run()`. Calling `hideAllWebviews()` directly (outside the queue) can race with a queued `open_service`, causing the service to flash visible behind an overlay.

The `hideActiveWebviewsForOverlay` function must use `await webviewCommands.run(hideAllWebviews)`, not `await hideAllWebviews()` directly.

### State mutation order

When computing derived values from a state mutation (e.g. `shouldHideWebviews`), always capture the values you need from the **pre-mutation** state before calling the mutation function. `nextState` may not equal `state` for fields that normalisation can change.

## Changelog

Always update `CHANGELOG.md` for any user-facing change: new features, bug fixes, behaviour changes, performance improvements, new settings, or dependency upgrades with runtime impact. Do not add entries for internal refactors, test changes, or comment updates.

Format:
```
## [Unreleased]
### Fixed
- Short description of what was broken and what was fixed
```

## Tauri command type safety (specta)

All Tauri commands are annotated with `#[specta::specta]` and their payload structs derive `specta::Type`. This powers automatic TypeScript generation via `tauri-specta`.

**How it works:**
- Every `cargo tauri dev` (debug build) regenerates `src/lib/tauri-commands.ts` with typed wrappers and payload interfaces that exactly mirror the Rust signatures.
- The generated file is committed to the repo so CI and release builds always have correct types without running cargo.
- `src/lib/services/service-runtime.ts` re-exports the payload types from `tauri-commands.ts` — do not redefine them there.

**When you add a new Tauri command:**
1. Add `#[specta::specta]` above `#[tauri::command]` on the Rust function.
2. Add the command to `SpectaBuilder::commands(collect_commands![...])` in `lib.rs`.
3. If the command takes a new payload struct, add `#[derive(specta::Type)]` to it.
4. Run `yarn tauri dev` once — the TypeScript file regenerates automatically.

## Module layout

### Rust (`src-tauri/src/`)

| File | Responsibility |
|---|---|
| `service_runtime.rs` | URL parsing and classification (`extract_hostname`, `microsoft_service_kind`, `badge_strategy_for_url`) |
| `service_webview.rs` | Builds the initialization script injected into each webview |
| `service_webview_badge_scripts.rs` | JS badge-monitoring engine scripts |
| `service_webview_resource_usage.rs` | JS resource-usage monitor script |
| `service_webview_runtime_scripts.rs` | JS common scripts (notifications, spellcheck, Google auth compat) |
| `webview_commands.rs` | Tauri commands for webview lifecycle (`open_service`, `hide_all_webviews`, etc.) |
| `window_layout.rs` | Physical pixel layout calculations |
| `app_state.rs` | Shared Tauri managed state (active webview, badge prefs, etc.) |
| `lib_tests.rs` | Unit tests — write behavioral tests, not source-string assertions |

`badge_strategy_for_url` lives in `service_runtime.rs`. Do not move it to `webview_commands.rs` — that creates a circular import with `service_webview.rs`.

### TypeScript (`src/`)

#### Page components

| Path | Responsibility |
|---|---|
| `src/routes/+page.svelte` | Orchestrator: wires stores, fires effects, owns top-level workspace/settings state |
| `src/routes/settings/+page.svelte` | Settings page component |

#### Page composable stores (`.svelte.ts` — use Svelte 5 runes)

| Path | Responsibility |
|---|---|
| `src/lib/services/drag-drop.svelte.ts` | Pointer drag state and handlers. Zero external deps — pure drag logic. |
| `src/lib/services/todo-panel.svelte.ts` | `todoNotes` state, panel open/close, all todo mutations, storage scheduling. |
| `src/lib/services/service-editor.svelte.ts` | Add/edit dialog state (`isOpen`, `editingService`) + the full save flow. |

#### Workspace state modules — **boundary is strict, read before touching**

```
workspace-state.ts        workspace-groups.ts
 (PageService type,         (WorkspaceGroupsState tree,
  service add/edit/delete,   workspace membership,
  startup migration)         active service, ordering)
         ↓ imports PageService
         └──────────────────────────────────┐
                                            ↓
                                workspace-actions.ts
                                 (same transforms +
                                  "which webviews to close")
```

| Path | Responsibility |
|---|---|
| `workspace-state.ts` | `PageService` type; service-level add/edit/delete (`saveServiceState`, `applySaveServiceResult`); startup migration from legacy keys. **Never imports workspace-groups** (would cycle). |
| `workspace-groups.ts` | `WorkspaceGroupsState` type; every pure transform on the multi-workspace tree. **No side effects, no invoke calls.** |
| `workspace-actions.ts` | Wraps workspace-groups transforms and computes which webviews to close/hide alongside. Returns `{ state, closeWebviewIds, … }` — the caller runs the webview commands. **Never calls invoke itself.** |

#### Other services

| Path | Responsibility |
|---|---|
| `src/lib/services/workspace-page-lifecycle.ts` | Startup state assembly, debounced storage writer, preload scheduling, flush-on-exit registration |
| `src/lib/services/webview-commands.ts` | Typed wrappers for Tauri invoke calls; `createWebviewCommandQueue` for serialised execution |
| `src/lib/tauri-commands.ts` | **Auto-generated** by specta. Typed command functions + payload interfaces mirroring Rust. Commit this file; regenerated by `yarn tauri dev`. |
| `src/lib/services/service-runtime.ts` | Re-exports payload types from `tauri-commands.ts`; payload builder helpers; `shouldPreloadService` |
| `src/lib/services/settings-page-state.ts` | Settings page helpers (`pickWorkspaceColor`) and startup state |

## Tests

Rust tests in `lib_tests.rs` must test real behavior, not source-code contents. `include_str!("foo.rs").contains("some_text")` is not a test — it breaks whenever code is reformatted and passes even when behavior is wrong (as happened with the `hide_all_webviews` bug). Write tests that call the actual functions with real inputs.

TypeScript tests use vitest + jsdom:
- Unit tests for pure functions: `src/lib/services/*.test.ts`
- Unit tests for composable stores: `src/lib/services/*.svelte.test.ts`
- Integration tests via the page component: `src/routes/page-*.test.ts`

When adding a new `.svelte.ts` composable store, add a matching `.svelte.test.ts` alongside it.
