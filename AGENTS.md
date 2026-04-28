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
