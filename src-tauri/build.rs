use std::{env, fs, path::Path};

// The `tauri-plugin-mcp-bridge` crate is guarded behind the `devtools`
// Cargo feature (see Cargo.toml). Capability files live on disk and are
// baked into the binary by `tauri-build`, so we must make sure the
// permission that references the dev-only plugin is only present when the
// plugin itself is compiled in. Otherwise release builds fail with
// "permission mcp-bridge:default not found" and the app refuses to start.
const MCP_BRIDGE_CAPABILITY: &str = r#"{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "mcp-bridge",
  "description": "Grants the dev-only MCP bridge access to the main window.",
  "windows": ["main"],
  "permissions": ["mcp-bridge:default"]
}
"#;

fn main() {
    let capability_path = Path::new(&env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".into()))
        .join("capabilities")
        .join("mcp-bridge.json");

    // `CARGO_FEATURE_*` env vars are set by cargo for each enabled feature.
    // When the `devtools` feature is active, the mcp-bridge plugin is
    // compiled in and the matching capability must exist on disk.
    let devtools_enabled = env::var("CARGO_FEATURE_DEVTOOLS").is_ok();

    if devtools_enabled {
        // Only rewrite when the contents actually change to avoid triggering
        // needless rebuilds.
        let needs_write = match fs::read_to_string(&capability_path) {
            Ok(existing) => existing != MCP_BRIDGE_CAPABILITY,
            Err(_) => true,
        };
        if needs_write {
            if let Some(parent) = capability_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&capability_path, MCP_BRIDGE_CAPABILITY);
        }
    } else if capability_path.exists() {
        let _ = fs::remove_file(&capability_path);
    }

    println!("cargo:rerun-if-changed=capabilities");
    println!("cargo:rerun-if-env-changed=CARGO_FEATURE_DEVTOOLS");

    tauri_build::build()
}
