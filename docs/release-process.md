# Release Process

This is the exact checklist for cutting a new Ferx release. The in-app updater depends on these steps being done in order — a missed step means users either don't see the update or the updater refuses to install it.

If anything in this document drifts from reality, fix the document.

## Prerequisites (one-time setup)

Before the **first** release, the following must be in place. You only do this once per repository.

### 1. Minisign keypair

```bash
yarn tauri signer generate -w ~/.tauri/ferx_updater.key
```

- Copy the **public key** it prints to stdout and paste it into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`, replacing the `REPLACE_WITH_MINISIGN_PUBLIC_KEY` placeholder. Commit that change.
- Keep `~/.tauri/ferx_updater.key` **out of git**. It is the single thing that proves an update came from you.

### 2. GitHub Actions secrets (Repository scope)

Go to `Settings → Secrets and variables → Actions → Secrets` and add:

| Name                                   | Value                                                   |
| -------------------------------------- | ------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`            | Full contents of `~/.tauri/ferx_updater.key`            |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`   | The password you chose during `yarn tauri signer generate` |

Use **Repository** secrets, not Environment or Organization secrets. Fork PRs are intentionally blocked from these because `release.yml` triggers only on tag pushes and `workflow_dispatch`.

## Release checklist

Use this every time you cut a release. `X.Y.Z` means the new version — e.g. `0.2.0`.

### Step 1 — Start from a clean, up-to-date `main`

```bash
git checkout main
git pull --ff-only
git status   # must be clean
```

If your working tree is dirty, stash or commit it elsewhere first.

### Step 2 — Create a release branch off `main`

```bash
git checkout -b release/vX.Y.Z
```

Never tag directly from a long-lived integration branch like `develop`. Tags must point at commits that are on `main`.

### Step 3 — Bump the version everywhere

```bash
yarn bump-version X.Y.Z
```

This script updates:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

…then runs `cargo check` to refresh `src-tauri/Cargo.lock`. All four files must be committed together.

If `cargo check` fails because of an unrelated build error, rerun with:

```bash
yarn bump-version X.Y.Z --skip-cargo
# then manually refresh the lockfile once the build is green
cargo check --manifest-path src-tauri/Cargo.toml --lib
```

### Step 4 — Verify the checks still pass

Same three commands the CI runs:

```bash
yarn check
yarn test --run
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

If any of these fail, fix them before proceeding.

### Step 5 — Commit, open PR, merge

```bash
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "chore(release): X.Y.Z"
git push -u origin release/vX.Y.Z
```

- Open a PR from `release/vX.Y.Z` into `main`.
- Wait for CI (`ci.yml`) to pass.
- Merge with a plain merge/squash. No rebase surprises.

### Step 6 — Tag from `main`

After the PR is merged:

```bash
git checkout main
git pull --ff-only
git tag -a vX.Y.Z -m "Ferx X.Y.Z"
git push origin vX.Y.Z
```

The tag must:

- Start with lowercase `v` so it matches `tags: ['v*']` in `release.yml`.
- Point at the release-bump commit on `main`.

Pushing the tag immediately triggers `.github/workflows/release.yml`.

### Step 7 — Watch the release workflow

Open `https://github.com/adiwidia-dev/ferx/actions` and follow the `Release` run. It will take roughly 8–15 minutes on `macos-latest`.

If the workflow fails, the two common causes are:

- **Missing/wrong secrets** → `TAURI_SIGNING_PRIVATE_KEY` not set. Re-check Step 1 of prerequisites.
- **Lockfile out of sync** → `cargo build --frozen` fails. Re-run `yarn bump-version` locally, rebase the PR, redo Steps 5–6.

On success, the workflow has:

1. Built a universal (aarch64 + x86_64) `Ferx.app`.
2. Produced `Ferx.app.tar.gz` + `Ferx.app.tar.gz.sig` (signed with the minisign key).
3. Generated `latest.json` with the tarball URL and signature contents.
4. Created a **draft** GitHub Release and attached the DMG, tarball, `.sig`, and `latest.json`.
5. Ad-hoc signed the local bundle so future release runs keep a stable code signature identifier.

### Step 8 — Fill in release notes and publish

Go to `https://github.com/adiwidia-dev/ferx/releases` and edit the draft named `Ferx vX.Y.Z`:

1. Write the release notes in the description body. These are rendered inside the app's Settings page when users hit "Check for Updates," because the updater reads them from `update.body`.
2. Make sure **Set as the latest release** is checked. This is what makes `https://github.com/adiwidia-dev/ferx/releases/latest/download/latest.json` resolve to the new manifest — which is the URL `tauri.conf.json` points at.
3. Leave **Set as a pre-release** unchecked unless this is genuinely a beta.
4. Click **Publish release**.

The moment you publish, any existing install can discover the update.

### Step 9 — Smoke test the in-app update

On a Mac with a previous version of Ferx installed:

1. Open Ferx → Settings → **Check for Updates**.
2. You should see `Version X.Y.Z is available` with the release notes you wrote.
3. Click **Download and Install**. Watch the progress bar.
4. Click **Relaunch Now**.
5. After relaunch, Settings should show the new version number and `You're up to date`.

If it doesn't work, debug in this order:

1. `curl -L https://github.com/adiwidia-dev/ferx/releases/latest/download/latest.json` → must return the JSON you just published.
2. Verify `plugins.updater.pubkey` in `tauri.conf.json` matches the public half of `TAURI_SIGNING_PRIVATE_KEY` in Actions secrets.
3. Re-check the running install's version against `tauri.conf.json` on that release — the updater compares semver, not file hashes.

## Special cases

### The v0.1.x → v0.2.0 migration

v0.1.x builds **do not contain the updater plugin**. Users on those versions cannot auto-update to any version, because there is no updater client code in their binary. They must download the new DMG manually from the release page once. Add this note to the v0.2.0 release body:

> **One-time manual update required.** v0.1.x builds do not include the in-app updater. Please download this release from the GitHub release page. All future updates will be delivered in-app.

After v0.2.0 is in the wild, this caveat no longer applies.

### Hotfix on top of a release

Treat it as another release: branch from `main`, bump to `X.Y.(Z+1)`, follow the checklist. There is no "amend a published release" flow — the updater only understands forward version motion.

### Pulling a bad release back

If a release is broken and shouldn't be installed:

1. Edit the draft/published release on GitHub and toggle **Set as the latest release** OFF. Pick the previous good release as latest.
2. This immediately re-points `/releases/latest/download/latest.json` back at the older manifest, so new update checks go back to the old version.
3. Cut a proper fix release (`X.Y.(Z+1)`) as soon as possible. The updater won't ever downgrade a user's installed version.

### Rotating the signing key

You probably won't need to do this, but if the private key is leaked:

1. Generate a new keypair.
2. Update `plugins.updater.pubkey` in `tauri.conf.json`.
3. Update the Actions secrets.
4. Cut a new release. Clients that already installed the new version will trust the new key from that point forward.
5. Clients still on older versions trust the **old** public key. They cannot be updated with the new key until they manually install a version signed with it. Plan the rotation like an OS migration, not a hotfix.

## Reference commands

For when you just want to copy-paste:

```bash
# One-command version bump (all 3 files + Cargo.lock)
yarn bump-version X.Y.Z

# Full release from a clean main
git checkout main && git pull --ff-only
git checkout -b release/vX.Y.Z
yarn bump-version X.Y.Z
yarn check && yarn test --run && cargo test --manifest-path src-tauri/Cargo.toml --lib
git commit -am "chore(release): X.Y.Z"
git push -u origin release/vX.Y.Z
# ...open PR, merge to main...
git checkout main && git pull --ff-only
git tag -a vX.Y.Z -m "Ferx X.Y.Z"
git push origin vX.Y.Z
```

## Related docs

- [Architecture Notes](./architecture.md) — section 6 describes the updater internals.
- [`.github/workflows/release.yml`](../.github/workflows/release.yml) — the actual release workflow.
- [`scripts/bump-version.mjs`](../scripts/bump-version.mjs) — the version bump script.
