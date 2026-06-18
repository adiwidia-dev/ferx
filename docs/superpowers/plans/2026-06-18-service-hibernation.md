# Service Hibernation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add an optional per-service "Hibernate when inactive" setting that closes inactive service webviews after 60 seconds without deleting service storage.

**Architecture:** Persist `hibernateWhenInactive?: boolean` on `PageService` and keep current hibernation status runtime-only in a new `service-hibernation.svelte.ts` store. `+page.svelte` remains the orchestrator: it schedules timers on service/workspace/window inactivity, runs `close_webview` through `webviewCommands.run`, and wakes hibernated active services through the existing `open_service` path. Preload and tray-count helpers treat hibernation-enabled/runtime-hibernated services specially.

**Tech Stack:** Svelte 5 runes, SvelteKit, Vitest/jsdom, Tauri v2 `@tauri-apps/api/window`, existing Tauri webview commands.

---

### Task 1: Persist Service Hibernation Setting

**Files:**
- Modify: `src/lib/services/workspace-state.ts`
- Modify: `src/lib/services/service-config.ts`
- Modify: `src/lib/services/workspace-config-import.ts`
- Modify: `src/lib/services/service-runtime.ts`
- Test: `src/routes/page-service-state.test.ts`
- Test: `src/lib/services/service-config.test.ts`
- Test: `src/lib/services/workspace-config-import.test.ts`
- Test: `src/lib/services/service-runtime.test.ts`

- [x] **Step 1: Write failing tests**

Add expectations that:
- `saveServiceState` creates a new service with `hibernateWhenInactive` only when true.
- `saveServiceState` preserves/updates the field on edit.
- stored services and imported configs accept a boolean `hibernateWhenInactive` and reject non-booleans.
- `shouldPreloadService` returns `false` for services with `hibernateWhenInactive: true`.

Run: `yarn test --run src/routes/page-service-state.test.ts src/lib/services/service-config.test.ts src/lib/services/workspace-config-import.test.ts src/lib/services/service-runtime.test.ts`
Expected: FAIL because `hibernateWhenInactive` is not part of the model yet.

- [x] **Step 2: Implement model support**

Add `hibernateWhenInactive?: boolean` to `PageService`, `StoredService`, imported service drafts, and `ServiceWebviewService`. Add `newHibernateWhenInactive: boolean` to `saveServiceState`, store the field as `true` when enabled and omit it otherwise, and preserve it through edit saves.

- [x] **Step 3: Verify tests pass**

Run: `yarn test --run src/routes/page-service-state.test.ts src/lib/services/service-config.test.ts src/lib/services/workspace-config-import.test.ts src/lib/services/service-runtime.test.ts`
Expected: PASS.

### Task 2: Add Editor Checkbox

**Files:**
- Modify: `src/lib/components/workspace/service-editor-dialog.svelte`
- Modify: `src/lib/services/service-editor.svelte.ts`
- Test: `src/lib/components/workspace/service-editor-dialog.svelte.test.ts`
- Test: `src/lib/services/service-editor.svelte.test.ts`

- [x] **Step 1: Write failing tests**

Add component tests that the add dialog renders an unchecked `input[type="checkbox"][name="hibernate-when-inactive"]`, edit mode initializes it from the service, and save payload includes `hibernateWhenInactive`.

Run: `yarn test --run src/lib/components/workspace/service-editor-dialog.svelte.test.ts src/lib/services/service-editor.svelte.test.ts`
Expected: FAIL because the checkbox and payload field do not exist.

- [x] **Step 2: Implement editor UI and store plumbing**

Extend `ServiceEditorInput` and `ServiceEditorService` with `hibernateWhenInactive?: boolean`. Add a local `$state(false)` checkbox value, sync it from `editingService`, and send it in `onSave`. In `service-editor.svelte.ts`, include the field in `openForEdit` and pass `newHibernateWhenInactive: input.hibernateWhenInactive === true` to `saveServiceState`.

- [x] **Step 3: Verify tests pass**

Run: `yarn test --run src/lib/components/workspace/service-editor-dialog.svelte.test.ts src/lib/services/service-editor.svelte.test.ts`
Expected: PASS.

### Task 3: Add Runtime Hibernation Store

**Files:**
- Create: `src/lib/services/service-hibernation.svelte.ts`
- Test: `src/lib/services/service-hibernation.svelte.test.ts`

- [x] **Step 1: Write failing tests**

Test that `createServiceHibernationStore({ delayMs: 60000 })` schedules a hibernation callback only after the delay, cancels pending timers, records hibernated IDs, clears hibernation with a wake generation increment, and cleans up all timers.

Run: `yarn test --run src/lib/services/service-hibernation.svelte.test.ts`
Expected: FAIL because the store file does not exist.

- [x] **Step 2: Implement store**

Implement a small rune store with methods `schedule(serviceId, onHibernate)`, `cancel(serviceId)`, `cancelAll()`, `markHibernated(serviceId)`, `clearHibernated(serviceId)`, `isHibernated(serviceId)`, `wakeGenerationFor(serviceId)`, and readonly snapshots for tests.

- [x] **Step 3: Verify tests pass**

Run: `yarn test --run src/lib/services/service-hibernation.svelte.test.ts`
Expected: PASS.

### Task 4: Tray Count and Display Projection

**Files:**
- Modify: `src/lib/services/notification-prefs.ts`
- Modify: `src/lib/services/workspace-page-lifecycle.ts`
- Test: `src/lib/services/notification-prefs.test.ts`
- Test: `src/lib/services/workspace-page-lifecycle.test.ts`

- [x] **Step 1: Write failing tests**

Add `hibernated?: boolean` to projected display services and assert `countTrayRelevantUnreadServices` excludes services with `hibernated: true` while preserving sidebar badge data.

Run: `yarn test --run src/lib/services/notification-prefs.test.ts src/lib/services/workspace-page-lifecycle.test.ts`
Expected: FAIL because projected services and tray counting do not know about hibernation.

- [x] **Step 2: Implement runtime projection support**

Extend `DisplayService` with `hibernated?: boolean`, let `createDisplayServicesProjector` accept a `hibernatedServices` record, include it in cache keys/output, and exclude hibernated services from tray count.

- [x] **Step 3: Verify tests pass**

Run: `yarn test --run src/lib/services/notification-prefs.test.ts src/lib/services/workspace-page-lifecycle.test.ts`
Expected: PASS.

### Task 5: Page Orchestration and Window Inactivity

**Files:**
- Modify: `src/routes/+page.svelte`
- Test: `src/routes/page-workspace-switching.test.ts`

- [x] **Step 1: Write failing page tests**

Mock `@tauri-apps/api/window` and add tests that:
- switching from a hibernation-enabled service schedules `close_webview` after 60 seconds;
- switching back before 60 seconds cancels the close;
- document/native hidden or minimized state schedules hibernation for the active service;
- returning visible after hibernation wakes the active service with `open_service`.

Run: `yarn test --run src/routes/page-workspace-switching.test.ts`
Expected: FAIL because page orchestration does not schedule hibernation.

- [x] **Step 2: Implement page orchestration**

Import the store and Tauri `getCurrentWindow`. Track the last active visible service ID, app inactive state, and hibernation wake generation. Schedule hibernation for the previous active service on service/workspace switch, schedule current active service when app becomes hidden/minimized, cancel when service becomes active/visible, and run hibernation close commands through `webviewCommands.run`.

- [x] **Step 3: Verify tests pass**

Run: `yarn test --run src/routes/page-workspace-switching.test.ts`
Expected: PASS.

### Task 6: Release Notes and Verification

**Files:**
- Modify: `CHANGELOG.md`

- [x] **Step 1: Add changelog entry**

Add an `[Unreleased]` feature entry for optional service hibernation after 60 seconds inactive.

- [x] **Step 2: Run focused verification**

Run: `yarn test --run src/lib/services/service-runtime.test.ts src/lib/services/service-hibernation.svelte.test.ts src/lib/services/notification-prefs.test.ts src/lib/services/workspace-page-lifecycle.test.ts src/lib/components/workspace/service-editor-dialog.svelte.test.ts src/lib/services/service-editor.svelte.test.ts src/routes/page-service-state.test.ts src/routes/page-workspace-switching.test.ts src/lib/services/service-config.test.ts src/lib/services/workspace-config-import.test.ts`
Expected: PASS.

- [x] **Step 3: Run type/UI verification**

Run: `yarn check`
Expected: PASS.

- [x] **Step 4: Commit implementation**

Commit all code, tests, changelog, and this plan file.
