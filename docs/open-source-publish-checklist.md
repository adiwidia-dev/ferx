# Open Source Publish Checklist

## Local Repo Sanity

- Confirm `git status` is clean before the public push.
- Confirm no local machine artifacts, credentials, or throwaway files are tracked.
- Confirm the branch is `main` and contains the intended merged cleanup work only.

## Manual Validation

- Run the local manual smoke-test pass for the current macOS-focused app behavior.
- Confirm the invalid service URL path fails safely.
- Confirm editing a service URL updates the live service behavior.
- Confirm disabling a service unloads it rather than leaving it live in the background.
- Confirm persisted service state still recovers correctly after restart.

## CI Expectations

- Confirm `.github/workflows/ci.yml` exists and targets `main` on `push` and `pull_request`.
- Confirm the CI workflow runs `yarn check`, `yarn test --run`, and `cargo test --manifest-path src-tauri/Cargo.toml --lib`.
- If CI is already enabled on GitHub, confirm the latest run is green before announcing the repo push as ready.

## GitHub Settings

- Confirm Dependabot alerts are enabled for the repository.
- Confirm secret scanning is enabled if available for the current account or plan.
- Confirm GitHub private vulnerability reporting is enabled and matches `SECURITY.md`.
- Confirm the issue template and pull request template are visible and appropriate for public contributors.
- Confirm the repository description, homepage URL, and GitHub issue URL match the intended public repo metadata.

## Public-Facing Docs And Metadata

- Re-read `README.md` for naming, link, and platform-support consistency.
- Confirm `LICENSE`, `CONTRIBUTING.md`, and `SECURITY.md` are present and still accurate.
- Confirm `docs/architecture.md` and `docs/project-structure.md` are appropriate for public contributors.
- Confirm `package.json` still uses the public repo URLs and remains `private: true`.
- Confirm `src-tauri/Cargo.toml` still reflects the intended public project metadata.
- Confirm `.github/dependabot.yml` still covers npm and cargo, and the bug report and pull request templates still match the current contributor flow.
