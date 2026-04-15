# Settings Page Design

## Summary

Add a Settings button below the existing `Add Service` button in the left sidebar. Clicking it should navigate to a dedicated settings page that keeps the sidebar visible and shows readonly app metadata: app name, app version, and a `Check Update` button that is intentionally a no-op for now.

## Goals

- Add a stable navigation entry for settings without changing the existing sidebar model.
- Show app metadata in a dedicated page instead of a dialog or inline mode.
- Keep the first iteration readonly and avoid any update-check implementation.

## Non-Goals

- Implementing in-app updates.
- Persisting any user-editable settings.
- Refactoring the full sidebar into shared components unless the implementation requires a very small extraction.

## Existing Context

- `src/routes/+page.svelte` currently owns the main desktop UI, including the left sidebar and the empty-state content.
- The sidebar footer currently contains Do Not Disturb and `Add Service` actions.
- The app runs in SvelteKit SPA mode, so adding a `/settings` route is compatible with the current setup.
- App metadata already exists in `src-tauri/tauri.conf.json` with `productName: "Ferx"` and `version: "0.1.0"`.

## Chosen Approach

Use a real route at `src/routes/settings/+page.svelte` and keep the left sidebar visible while the main content changes.

This is preferred over an inline settings mode in `src/routes/+page.svelte` because the current page file is already large, and a separate route gives the settings screen a clear home for future growth. It is also a better match for the requirement to open a page rather than a modal.

## UI Design

### Sidebar

- Add a new Settings button directly below `Add Service` in the sidebar footer.
- Use the existing button styling language so the new control feels native to the current app.
- The button should navigate to `/settings`.
- The sidebar remains visible on the settings route so users can quickly return to service navigation.

### Settings Page Content

- Render the settings page in the main content area.
- Include a page title such as `Settings`.
- Show an app information section with readonly values for:
  - App name
  - App version
- Include a `Check Update` button inside that section.
- The button remains enabled/clickable but performs no action yet.
- Add a short static description under the app information title that says update checking is not available yet.

## Data Design

- App name and version should come from a single frontend-facing source of truth rather than being duplicated in markup.
- The initial source should reflect existing app metadata from `src-tauri/tauri.conf.json`.
- The implementation should expose this through a small frontend helper module that returns readonly display data.
- No async loading is required for the first iteration if the metadata can be provided statically at build time.

## Navigation Design

- `/` continues to represent the main service workspace page.
- `/settings` represents the app information page.
- Navigation should use normal SvelteKit routing behavior.
- The settings page should set a descriptive `<title>` so route announcements remain accessible.

## Error Handling

- There are no user-entered values in this iteration, so error handling is minimal.
- If metadata cannot be read during implementation, fall back to a small local constant rather than blocking the page.
- The `Check Update` button should not throw, navigate, or show a misleading success state.

## Testing Strategy

- Follow TDD for any new metadata helper or route-supporting logic.
- Prefer testing extracted readonly metadata logic rather than adding brittle full-component tests unless route rendering requires one.
- Run the existing test suite with `npm test`.
- Run type and Svelte checks with `npm run check`.

## Files Expected To Change

- Modify `src/routes/+page.svelte` to add the new Settings button and route navigation entry point.
- Create `src/routes/settings/+page.svelte` for the app information screen.
- Create a small frontend helper module for app metadata.
- Add or update tests for any extracted helper logic.

## Acceptance Criteria

- A Settings button appears below `Add Service` in the sidebar.
- Clicking Settings opens a dedicated settings page in the main content area.
- The left sidebar remains visible on the settings page.
- The settings page shows app name and app version as readonly information.
- The settings page includes a `Check Update` button.
- Clicking `Check Update` does nothing observable yet.
- Tests and checks pass.
