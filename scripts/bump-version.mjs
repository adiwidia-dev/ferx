#!/usr/bin/env node
// Bumps the Ferx version string across every file that tracks it:
//   - package.json              (`version`)
//   - src-tauri/Cargo.toml      (top-level `version`)
//   - src-tauri/tauri.conf.json (`version`)
//
// After the edits it runs `cargo check` to refresh `src-tauri/Cargo.lock`
// so CI's `--frozen-lockfile` flags don't trip on release prep.
//
// Usage:
//   node scripts/bump-version.mjs 0.2.0
//   yarn bump-version 0.2.0
//
// The version must be plain semver `MAJOR.MINOR.PATCH` with no `v` prefix
// and no pre-release suffix. We keep this narrow on purpose so the updater
// version comparison and tag format stay predictable.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const packageJsonPath = resolve(repoRoot, "package.json");
const cargoTomlPath = resolve(repoRoot, "src-tauri", "Cargo.toml");
const tauriConfPath = resolve(repoRoot, "src-tauri", "tauri.conf.json");

function die(message) {
  console.error(`bump-version: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const skipCargo = args.includes("--skip-cargo");
  const positional = args.filter((arg) => !arg.startsWith("--"));

  if (positional.length !== 1) {
    die("expected exactly one positional argument: <version>");
  }

  const version = positional[0];
  if (!SEMVER_RE.test(version)) {
    die(`"${version}" is not a valid MAJOR.MINOR.PATCH version (no pre-release suffixes)`);
  }

  return { version, skipCargo };
}

function bumpPackageJson(version) {
  const raw = readFileSync(packageJsonPath, "utf8");
  const data = JSON.parse(raw);
  const previous = data.version;
  if (previous === version) return previous;

  data.version = version;
  // Preserve trailing newline the file already has.
  const serialized = JSON.stringify(data, null, 2) + (raw.endsWith("\n") ? "\n" : "");
  writeFileSync(packageJsonPath, serialized);
  return previous;
}

function bumpTauriConf(version) {
  const raw = readFileSync(tauriConfPath, "utf8");
  const data = JSON.parse(raw);
  const previous = data.version;
  if (previous === version) return previous;

  data.version = version;
  const serialized = JSON.stringify(data, null, 2) + (raw.endsWith("\n") ? "\n" : "");
  writeFileSync(tauriConfPath, serialized);
  return previous;
}

function bumpCargoToml(version) {
  // `src-tauri/Cargo.toml` has a single top-level `[package]` table. We do a
  // targeted regex replace on the first `version = "..."` that appears
  // before any other `[section]` header, which is always the package version.
  const raw = readFileSync(cargoTomlPath, "utf8");

  const headerMatch = raw.match(/^\[package\][\s\S]*?(?=^\[)/m);
  if (!headerMatch) die(`could not locate [package] section in ${cargoTomlPath}`);

  const packageSection = headerMatch[0];
  const versionLineMatch = packageSection.match(/^version\s*=\s*"([^"]+)"/m);
  if (!versionLineMatch) die(`could not locate version in [package] section of ${cargoTomlPath}`);

  const previous = versionLineMatch[1];
  if (previous === version) return previous;

  const updatedPackageSection = packageSection.replace(
    /^(version\s*=\s*")[^"]+(")/m,
    `$1${version}$2`,
  );
  writeFileSync(cargoTomlPath, raw.replace(packageSection, updatedPackageSection));
  return previous;
}

function refreshCargoLock() {
  // `cargo check` is enough to rewrite Cargo.lock with the new package
  // version. We target the lib so we don't need full bundle prerequisites.
  try {
    execSync(`cargo check --manifest-path ${cargoTomlPath} --lib --quiet`, {
      stdio: "inherit",
    });
  } catch (error) {
    die(
      `cargo check failed while refreshing Cargo.lock. Fix the build error, then rerun with --skip-cargo if you've already refreshed the lockfile.\n${error.message}`,
    );
  }
}

function main() {
  const { version, skipCargo } = parseArgs(process.argv);

  const previousPackage = bumpPackageJson(version);
  const previousTauri = bumpTauriConf(version);
  const previousCargo = bumpCargoToml(version);

  console.log(`package.json              : ${previousPackage} -> ${version}`);
  console.log(`src-tauri/tauri.conf.json : ${previousTauri} -> ${version}`);
  console.log(`src-tauri/Cargo.toml      : ${previousCargo} -> ${version}`);

  if (skipCargo) {
    console.log("Skipping Cargo.lock refresh (--skip-cargo).");
  } else {
    console.log("Refreshing Cargo.lock via cargo check...");
    refreshCargoLock();
  }

  console.log(`\nDone. Review the diff, commit, and tag:`);
  console.log(
    `  git commit -am "chore(release): ${version}"\n  git tag -a v${version} -m "Ferx ${version}"\n  git push origin HEAD v${version}`,
  );
}

main();
