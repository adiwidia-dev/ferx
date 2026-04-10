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
- [Security Policy](./SECURITY.md)
- [License](./LICENSE)
