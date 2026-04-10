# Contributing

Thanks for contributing to Ferx.

## Local Setup

```bash
yarn install
yarn tauri dev
```

## Checks Before Opening Changes

Run the checks that match the area you changed. For general changes, start with:

```bash
yarn check
yarn test --run
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

## Working Style

- Follow the existing Svelte 5 and Rust patterns already in the repo.
- Keep changes focused and avoid unrelated refactors.
- Review the architecture notes before touching webview, badge, sizing, or permission behavior.

## Related Docs

- [Architecture Notes](./docs/architecture.md)
- [Security Policy](./SECURITY.md)
- [License](./LICENSE)
