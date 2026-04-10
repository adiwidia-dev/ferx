# Project Structure

Use this guide for file placement questions. For platform-specific behavior and constraints, see [Architecture Notes](./architecture.md).

## Frontend Entry Point

`src/routes/+page.svelte` is the main Svelte page for the desktop UI. It owns the shell-level page state and wires user actions to the frontend service helpers and Tauri commands.

## Frontend Service Helpers

`src/lib/services/` holds small frontend-focused modules that support the page layer. Put shared browser-side logic here when it prepares service data, storage keys, notification preferences, badge strategy selection, or other UI-facing service state.

## Rust Backend Entry Point

`src-tauri/src/lib.rs` is the Rust entry point for Tauri commands and application setup. Keep it focused on wiring modules together, and extract reusable backend behavior into sibling Rust modules such as `service_runtime.rs`, `service_webview.rs`, and future focused files.

## Where New Logic Should Go

Put new frontend service logic in `src/lib/services/` when it runs in the Svelte app and supports page state or browser-side data handling.

Put backend service or webview logic in `src-tauri/src/` when it touches Tauri commands, native webview setup, platform permissions, badge delivery, or other native integration concerns.
