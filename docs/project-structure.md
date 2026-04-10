# Project Structure

Use this guide for file placement questions. For platform-specific behavior and constraints, see [Architecture Notes](./architecture.md).

## Frontend Entry Point

`src/routes/+page.svelte` is the main Svelte page for the desktop UI. Keep page-level state, event handling, and composition here.

## Frontend Service Helpers

`src/lib/services/` holds frontend service helpers used by the Svelte app. Put shared browser-side service logic here instead of growing `+page.svelte`.

## Rust Backend Layout

`src-tauri/src/main.rs` is the executable entrypoint.

`src-tauri/src/lib.rs` is the main Tauri command and app wiring module. Keep it focused on wiring, and extract backend logic into sibling Rust modules.

## Where New Logic Should Go

Put new frontend service logic in `src/lib/services/` when it runs in the Svelte app and can be reused across page code.

Put backend service or webview logic in `src-tauri/src/` when it belongs to the Rust side of the app. Keep `lib.rs` as wiring and place focused implementations in separate Rust modules.
