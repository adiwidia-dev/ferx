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
- Multiple workspace support with create, rename, and delete
- In-workspace todo notes panel with local storage persistence
- Resource usage monitoring per active service (opt-in from Settings)
- Spell check toggle for service webviews (opt-in from Settings)
- File drag-and-drop into service webviews
- Native file download dialog for downloads triggered inside services
- Config-only backup and restore from Settings, exported as plain JSON

## Current Status

Ferx is usable today and still early in its public release, with core desktop workflows already in place.

Configuration exports contain workspace service names, URLs, and app settings only. They do not include passwords, cookies, or logged-in service sessions, and the JSON file is not encrypted.

## Installation

Download the latest release from the [GitHub Releases page](https://github.com/adiwidia-dev/ferx/releases). Choose the `.dmg` file for macOS.

### macOS

1. Open the downloaded `.dmg` file.
2. Drag Ferx into your Applications folder.
3. On first launch, macOS will block the app because it is not notarized with an Apple Developer ID.
4. Open **System Settings → Privacy & Security**, scroll down to the security prompt, and click **Open Anyway**.
5. Subsequent launches and in-app updates do not re-prompt.

### In-app updates

Once installed, Ferx checks GitHub Releases for new versions automatically. When an update is available you will be notified inside the app. The updater verifies the download with a minisign signature before applying it. The update is applied on the next relaunch.

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
