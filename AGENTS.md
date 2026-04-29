# Agent Instructions

This file is read automatically by AI coding agents (OpenCode, Claude Code, Codex, etc.) at the start of every session. Follow these instructions for all tasks in this repository.

## Changelog

**Always update `CHANGELOG.md` when making user-facing changes.**

### When to add a changelog entry

Add an entry for anything a user or developer would notice:

- New features or UI additions
- Bug fixes
- Behaviour changes (even if the code looks like a refactor)
- Performance improvements that are observable
- New settings or configuration options
- Dependency upgrades that change runtime behaviour

Do **not** add entries for:

- Pure internal refactors with no external impact
- Test-only changes
- CI/tooling changes
- Documentation-only changes

### How to write an entry

1. Find the **Unreleased** section at the top of `CHANGELOG.md`. If it does not exist, add it directly below the header:

   ```markdown
   ## [Unreleased]

   ### Added
   ### Changed
   ### Fixed
   ```

2. Place your change under the correct sub-heading:
   - **Added** — new features or capabilities
   - **Changed** — changes to existing behaviour
   - **Fixed** — bug fixes
   - **Removed** — things that were removed

3. Write one line per change. Start with a capital letter, no trailing period. Be specific enough that a user reading the release notes understands what changed without looking at code.

   **Good:** `Added spell check toggle for service webviews in Settings`
   **Bad:** `Updated settings page`

4. Keep entries in the **Unreleased** section until a release commit (`chore(release): X.Y.Z`) is made. At that point, rename **Unreleased** to the new version and date:

   ```markdown
   ## [X.Y.Z] — YYYY-MM-DD
   ```

   And add a reference link at the bottom of the file:

   ```markdown
   [X.Y.Z]: https://github.com/adiwidia-dev/ferx/releases/tag/vX.Y.Z
   ```

## Code style

- Use TypeScript for all new frontend code.
- Follow existing Svelte 5 runes patterns — do not introduce Svelte 4 syntax.
- Run `yarn check` and `yarn test --run` before declaring work complete.

## Architecture guardrails

These rules exist to keep the codebase readable and safe to change. AI coding agents should treat them as default constraints, not suggestions.

### Page file boundaries

- `src/routes/+page.svelte` and `src/routes/settings/+page.svelte` are orchestration and composition files.
- Do not add new domain logic, storage logic, or Tauri command payload construction directly into page files unless there is a strong, explicit reason.
- Prefer extracting logic into `src/lib/services/*` and keeping page files focused on wiring state, events, and UI composition.

### Frontend logic placement

- Workspace, service, settings, storage, and command logic should live in focused modules under `src/lib/services/`.
- When adding behavior to an existing feature area, first look for the owning service module and extend it there instead of adding new ad hoc helpers in a component.
- Keep tests close to the logic they protect: if you add or change a service module, add or update its matching `*.test.ts`.

### Tauri and Rust module boundaries

- `src-tauri/src/lib.rs` should stay focused on app bootstrap, plugin setup, command registration, and high-level runtime wiring.
- Do not move command implementation details, layout math, or injected script logic back into `lib.rs`.
- Put new Tauri command logic in focused Rust modules, following the current split such as `webview_commands.rs`, `window_layout.rs`, and `service_webview_*`.

### Command contract rules

- Do not pass loose, ad hoc payload objects from Svelte pages into Tauri commands.
- Frontend command calls should go through typed helpers in `src/lib/services/`.
- New command payloads should have explicit TypeScript types/builders on the frontend and explicit Rust payload structs on the backend.
- Rust command payload structs should deserialize camelCase frontend payloads explicitly.
- Keep command names stable unless a behavior change is intentionally coordinated across frontend, backend, and tests.

### Service webview and notification badge safety

- Treat notification badge behavior as a protected feature.
- Do not rewrite badge detection, injected badge scripts, or service webview initialization casually.
- Keep injected webview scripts split by concern:
  - runtime/common hooks
  - resource usage monitoring
  - badge engines
- Any change touching badge behavior or injected scripts must include targeted regression coverage.

### Refactor discipline

- Prefer small, behavior-preserving slices.
- Avoid broad "while I'm here" refactors mixed into feature work.
- If a change touches UI, storage, Tauri commands, and injected scripts all at once, stop and narrow the scope unless that breadth is truly required.
- Keep commits focused so rollback is possible without losing unrelated work.

### Review and verification expectations

- Before declaring work complete, run the relevant verification commands for the touched areas.
- For normal app changes, the default verification bar is:
  - `yarn check`
  - `yarn test --run`
- For changes that touch Tauri/Rust code, also run:
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- For changes that affect shipped frontend behavior, also run:
  - `yarn run build`
- Do not claim success if tests passed but the run still exits with unhandled errors.

### Protected warning signs

If you are about to do any of the following, stop and extract first:

- Add more business logic directly into a page file
- Add new direct `invoke()` usage in a page file
- Add new runtime logic into `src-tauri/src/lib.rs`
- Recombine split `service_webview_*` modules into a single logic bucket
- Change command payload shapes without updating the owning helpers and tests
