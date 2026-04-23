# Ferx

> All-in-one desktop workspace for messaging and productivity web apps.

Ferx is a lightweight desktop application for running services like WhatsApp, Slack, Discord, and Teams inside one native workspace. It is built with Tauri and native OS webviews to keep resource usage lower than heavier Electron-based wrappers.

## Why Ferx

- Native webviews instead of embedded browser shells
- Lower overhead than many Electron-based alternatives
- One workspace for messaging and collaboration services
- Project structure designed around desktop integration and service isolation

## Current Features

- Native webview-based service hosting
- Background preloading for fast switching
- Per-service enable and disable states
- Custom unread badge handling
- Native context menus for sidebar actions
- Camera and microphone support for meeting-oriented services
- Config-only backup and restore from Settings, exported as plain JSON

## Current Status

Ferx is usable today and still early in its public release, with core desktop workflows already in place.

Application updates are installed in-app. The updater checks GitHub Releases, verifies the download with a minisign signature, and swaps the bundle on relaunch. Because Ferx is not notarized with an Apple Developer ID, macOS will still ask you to approve the app the first time you install it; subsequent in-app updates do not re-prompt.

Configuration exports contain workspace service names, URLs, and app settings only. They do not include passwords, cookies, or logged-in service sessions, and the JSON file is not encrypted.

## Platform Support

Current development and support are macOS-focused. Other platforms may build with additional work, but they are not yet treated as first-class supported targets.

The current desktop implementation also relies on Tauri multiwebview support and macOS private APIs for the intended UX. App Store distribution is not a target for the current build.

## Prerequisites

- Node.js
- Yarn
- Rust
- macOS developer tools

## Development Setup

```bash
yarn install
yarn tauri dev
```

## Project Docs

- [Contributing](./CONTRIBUTING.md)
- [Architecture Notes](./docs/architecture.md)
- [Release Process](./docs/release-process.md)
- [Project Structure](./docs/project-structure.md)
- [GitHub Issues](https://github.com/adiwidia-dev/ferx/issues)
- [Repository](https://github.com/adiwidia-dev/ferx)
- [Security Policy](./SECURITY.md)
- [License](./LICENSE)
