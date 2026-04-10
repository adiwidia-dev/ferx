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

## Current Status

Ferx is source-first and usable for development, with public-release cleanup still in progress across metadata and docs.

## Platform Support

Current development and support are macOS-focused. Other platforms may build with additional work, but they are not yet treated as first-class supported targets.

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
- [GitHub Issues](https://github.com/adiwidia-dev/ferx/issues)
- [Repository](https://github.com/adiwidia-dev/ferx)
- [Security Policy](./SECURITY.md)
- [License](./LICENSE)
