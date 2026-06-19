# Hibernated Sidebar State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make runtime-hibernated services visibly distinguishable in the sidebar without making them look disabled.

**Architecture:** The existing hibernation runtime state is already projected into `displayServices` as `service.hibernated`. `WorkspaceSidebar` will render that runtime flag as a subtle enabled-state tile treatment, a small cyan status dot, and explicit title text. No new persistence or native webview behavior is needed.

**Tech Stack:** Svelte 5, Tailwind utility classes, Vitest/jsdom component tests.

---

### Task 1: Sidebar Tests

**Files:**
- Modify: `src/lib/components/workspace/workspace-sidebar.svelte.test.ts`

- [x] **Step 1: Write failing component tests**

Add tests that mount the sidebar with a service containing `hibernated: true`, then assert:
- the service button title says the service is hibernated and clickable to wake
- the hibernated button gets a hibernation state class
- a small status dot is rendered
- disabled styling remains distinct from hibernated styling

- [x] **Step 2: Run test to verify it fails**

Run: `yarn test --run src/lib/components/workspace/workspace-sidebar.svelte.test.ts`

Expected: FAIL because the component does not yet render hibernation state.

### Task 2: Sidebar UI

**Files:**
- Modify: `src/lib/components/workspace/workspace-sidebar.svelte`

- [x] **Step 1: Add hibernated service typing**

Define a local `SidebarService = PageService & { hibernated?: boolean }` and use it for the `services` prop and context menu helper.

- [x] **Step 2: Render enabled hibernated state**

For `service.hibernated === true` and `!service.disabled`, render:
- title: `${service.name} is hibernated. Click to wake.`
- subtle cyan/cool background and ring classes on the service button
- slightly cooler inner icon surface
- small bottom-right cyan status dot with `aria-hidden="true"` and `data-testid="service-hibernation-indicator"`

Disabled services continue to use opacity/grayscale and must not get the hibernation state treatment.

- [x] **Step 3: Run focused sidebar test**

Run: `yarn test --run src/lib/components/workspace/workspace-sidebar.svelte.test.ts`

Expected: PASS.

### Task 3: Docs And Changelog

**Files:**
- Modify: `docs/superpowers/specs/2026-06-18-service-hibernation-design.md`
- Modify: `CHANGELOG.md`

- [x] **Step 1: Update design doc**

Replace the old non-goal saying no sidebar indicator with the approved sidebar state behavior.

- [x] **Step 2: Update changelog**

Add an `[Unreleased]` entry noting that hibernated services now show a visible enabled sidebar state and hover/title text.

### Task 4: Verification And Commit

**Files:**
- All modified files

- [x] **Step 1: Run verification**

Run:
- `yarn svelte-check --tsconfig ./tsconfig.json`
- `yarn test --run src/lib/components/workspace/workspace-sidebar.svelte.test.ts src/routes/page-service-state.test.ts src/routes/page-workspace-switching.test.ts`
- `git diff --check`

Expected: all pass.

- [x] **Step 2: Commit**

Stage the modified files and force-add this ignored plan file.

Commit message: `feat: show hibernated services in sidebar`
