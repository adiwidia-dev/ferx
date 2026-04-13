mod badge_payload;
mod service_runtime;
mod service_webview;

use badge_payload::{parse_badge_payload, BadgePayload};
use service_runtime::{extract_hostname, hostname_matches};
use service_webview::{service_webview_setup, user_agent_for_url};
use std::{path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager};

struct ActiveWebview(Mutex<String>);

fn session_dir_for_storage_key(app: &AppHandle, storage_key: &str) -> Option<PathBuf> {
    if storage_key.is_empty()
        || !storage_key
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return None;
    }

    app.path()
        .app_local_data_dir()
        .ok()
        .map(|dir| dir.join("sessions").join(storage_key))
}

fn data_store_identifier_for_storage_key(storage_key: &str) -> [u8; 16] {
    let mut state_a: u64 = 0xcbf29ce484222325;
    let mut state_b: u64 = 0x84222325cbf29ce4;

    for byte in storage_key.bytes() {
        state_a ^= u64::from(byte);
        state_a = state_a.wrapping_mul(0x100000001b3);

        state_b ^= u64::from(byte).wrapping_add(0x9e3779b97f4a7c15);
        state_b = state_b.wrapping_mul(0x100000001b3);
    }

    let mut identifier = [0u8; 16];
    identifier[..8].copy_from_slice(&state_a.to_be_bytes());
    identifier[8..].copy_from_slice(&state_b.to_be_bytes());
    identifier
}

#[cfg(test)]
mod tests {
    use super::{badge_strategy_for_url, data_store_identifier_for_storage_key};
    use crate::service_runtime::{extract_hostname, hostname_matches};
    use crate::service_webview::{
        external_webview_url, injected_js, service_webview_setup, user_agent_for_url,
    };

    #[test]
    fn data_store_identifier_is_stable_for_same_storage_key() {
        let identifier = data_store_identifier_for_storage_key("storage-11111111");

        assert_eq!(
            identifier,
            data_store_identifier_for_storage_key("storage-11111111")
        );
    }

    #[test]
    fn data_store_identifier_differs_for_different_storage_keys() {
        assert_ne!(
            data_store_identifier_for_storage_key("storage-11111111"),
            data_store_identifier_for_storage_key("storage-22222222")
        );
    }

    #[test]
    fn extract_hostname_returns_hostname_without_port() {
        assert_eq!(
            extract_hostname("https://user@example.com:443/inbox"),
            Some("example.com")
        );
    }

    #[test]
    fn hostname_matches_allows_subdomains_only() {
        assert!(hostname_matches("teams.microsoft.com", "microsoft.com"));
        assert!(!hostname_matches("notmicrosoft.com", "microsoft.com"));
    }

    #[test]
    fn injected_js_uses_structured_badge_payloads() {
        let script = injected_js(false);

        assert!(script.contains("payload = 'unknown'"));
        assert!(script.contains("payload = 'clear'"));
        assert!(script.contains("payload = 'count:' + count"));
        assert!(script.contains("https://ferx.notify/' + payload"));
    }

    #[test]
    fn badge_strategy_uses_explicit_hostname_mapping() {
        assert_eq!(
            badge_strategy_for_url("https://outlook.office.com/mail"),
            "outlook-folder-dom"
        );
        assert_eq!(
            badge_strategy_for_url("https://teams.microsoft.com"),
            "teams-title"
        );
        assert_eq!(
            badge_strategy_for_url("https://web.whatsapp.com"),
            "whatsapp-title"
        );
        assert_eq!(badge_strategy_for_url("https://example.com"), "unsupported");
        assert_eq!(
            badge_strategy_for_url("https://notwhatsapp.com"),
            "unsupported"
        );
        assert_eq!(
            badge_strategy_for_url("https://teams.example.com"),
            "unsupported"
        );
        assert_eq!(
            badge_strategy_for_url("https://mail.office.example.com"),
            "unsupported"
        );
    }

    #[test]
    fn unsupported_strategy_stays_conservative() {
        let script = injected_js(false);

        assert!(script.contains("const unsupportedTitleState = (title) =>"));
        assert!(script.contains("readState: () => unsupportedTitleState(document.title)"));
        assert!(!script.contains("unsupportedTitleState(title) => {{\n            const normalized = normalizeTitle(title);\n            const match = normalized.match(/\\((\\d+)\\)/) || normalized.match(/\\[(\\d+)\\]/) || normalized.match(/^(\\d+)\\s*(?:unread|baru|new|messages?)/i);"));
        assert!(!script.contains("title.includes(\"*\")"));
        assert!(!script.contains("title.includes(\"•\")"));
        assert!(!script.contains("new message"));
    }

    #[test]
    fn injected_js_builds_observer_driven_badge_engine() {
        let script = injected_js(false);

        assert!(script.contains("window.__ferx_badge_strategy = 'unsupported'"));
        assert!(script.contains("window.__ferx_last_badge_state"));
        assert!(script.contains("new MutationObserver"));
        assert!(script.contains("document.title"));
        assert!(script.contains("outlook-folder-dom"));
        assert!(script.contains("teams-title"));
        assert!(script.contains("whatsapp-title"));
        assert!(!script.contains("setInterval(() =>"));
    }

    #[test]
    fn title_observer_watches_head_subtree() {
        let script = injected_js(false);

        assert!(script.contains("const target = document.head || document.documentElement;"));
        assert!(!script.contains("const titleNode = document.querySelector('title');"));
    }

    #[test]
    fn badge_evaluation_contains_strategy_errors() {
        let script = injected_js(false);

        assert!(script.contains("try {"));
        assert!(script.contains("emitBadgeState(strategy.readState())"));
        assert!(script.contains("catch (error) {"));
        assert!(script.contains("emitBadgeState('clear')"));
    }

    #[test]
    fn external_webview_url_accepts_https_urls() {
        let webview_url = external_webview_url("https://example.com/inbox");

        assert!(matches!(webview_url, Some(tauri::WebviewUrl::External(_))));
    }

    #[test]
    fn external_webview_url_rejects_invalid_urls() {
        assert!(external_webview_url("not a url").is_none());
    }

    #[test]
    fn service_webview_setup_accepts_valid_external_urls() {
        let setup = service_webview_setup("https://teams.microsoft.com", false);

        let Some((tauri::WebviewUrl::External(_), initialization_script)) = setup else {
            panic!("expected valid external webview setup");
        };

        assert!(!initialization_script.contains("Object.defineProperty(window, 'Notification'"));
        assert!(!initialization_script.contains("https://ferx.notify/"));
    }

    #[test]
    fn service_webview_setup_skips_notification_shim_for_microsoft_apps() {
        let Some((_, teams_script)) = service_webview_setup("https://teams.microsoft.com", false)
        else {
            panic!("expected valid teams setup");
        };
        let Some((_, outlook_script)) =
            service_webview_setup("https://outlook.office.com/mail", true)
        else {
            panic!("expected valid outlook setup");
        };

        assert!(!teams_script.contains("Object.defineProperty(window, 'Notification'"));
        assert!(!teams_script.contains("window.navigator.permissions.query ="));
        assert!(!outlook_script.contains("Object.defineProperty(window, 'Notification'"));
        assert!(!outlook_script.contains("window.navigator.permissions.query ="));
    }

    #[test]
    fn service_webview_setup_skips_badge_navigation_for_microsoft_apps() {
        let Some((_, teams_script)) = service_webview_setup("https://teams.microsoft.com", false)
        else {
            panic!("expected valid teams setup");
        };
        let Some((_, outlook_script)) =
            service_webview_setup("https://outlook.office.com/mail", true)
        else {
            panic!("expected valid outlook setup");
        };

        assert!(!teams_script.contains("https://ferx.notify/"));
        assert!(!teams_script.contains("new MutationObserver"));
        assert!(!outlook_script.contains("https://ferx.notify/"));
        assert!(!outlook_script.contains("new MutationObserver"));
    }

    #[test]
    fn teams_setup_skips_common_navigation_hooks() {
        let Some((_, teams_script)) = service_webview_setup("https://teams.microsoft.com", false)
        else {
            panic!("expected valid teams setup");
        };

        assert!(!teams_script.contains("https://ferx.download/"));
        assert!(!teams_script.contains("https://ferx.shortcut/"));
    }

    #[test]
    fn cloud_teams_setup_uses_teams_safeguards() {
        let Some((_, teams_script)) = service_webview_setup("https://teams.cloud.microsoft/", false)
        else {
            panic!("expected valid cloud teams setup");
        };

        assert!(!teams_script.contains("Object.defineProperty(window, 'Notification'"));
        assert!(!teams_script.contains("https://ferx.notify/"));
        assert!(!teams_script.contains("https://ferx.download/"));
        assert!(!teams_script.contains("https://ferx.shortcut/"));
        assert_eq!(
            user_agent_for_url("https://teams.cloud.microsoft/"),
            Some(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0"
            )
        );
        assert_eq!(badge_strategy_for_url("https://teams.cloud.microsoft/"), "teams-title");
    }

    #[test]
    fn service_webview_setup_keeps_notification_shim_for_supported_apps() {
        let Some((_, script)) = service_webview_setup("https://discord.com/channels/@me", false)
        else {
            panic!("expected valid discord setup");
        };

        assert!(script.contains("permission: 'denied'"));
        assert!(script.contains("Object.defineProperty(window, 'Notification'"));
    }

    #[test]
    fn microsoft_apps_do_not_use_spoofed_chrome_user_agent() {
        assert_eq!(user_agent_for_url("https://outlook.office.com/mail"), None);
    }

    #[test]
    fn teams_apps_use_supported_edge_user_agent() {
        assert_eq!(
            user_agent_for_url("https://teams.microsoft.com"),
            Some(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0"
            )
        );
        assert_eq!(
            user_agent_for_url("https://teams.cloud.microsoft/"),
            Some(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0"
            )
        );
    }

    #[test]
    fn non_microsoft_apps_keep_spoofed_chrome_user_agent() {
        assert_eq!(
            user_agent_for_url("https://discord.com/channels/@me"),
            Some(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
            )
        );
    }

    #[test]
    fn service_webview_setup_rejects_invalid_external_urls() {
        assert!(service_webview_setup("not a url", false).is_none());
    }
}

#[tauri::command]
async fn hide_all_webviews(app: AppHandle) {
    use tauri::{Manager, PhysicalPosition, PhysicalSize};

    {
        let state = app.state::<ActiveWebview>();
        *state.0.lock().unwrap() = String::new();
    }

    if let Some(window) = app.get_window("main") {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let physical_size = window.inner_size().unwrap_or_default();
        let sidebar_width = (79.0 * scale_factor) as u32;

        let active_size = PhysicalSize::new(
            physical_size.width.saturating_sub(sidebar_width),
            physical_size.height,
        );
        let offscreen_pos = PhysicalPosition::new(-10000, -10000);

        for (name, webview) in app.webviews() {
            if name != "main" {
                let _ = webview.set_bounds(tauri::Rect {
                    position: tauri::Position::Physical(offscreen_pos),
                    size: tauri::Size::Physical(active_size),
                });
            }
        }
    }
}

#[tauri::command]
async fn reload_webview(app: AppHandle, id: String) {
    if let Some(webview) = app.get_webview(&id) {
        let _ = webview.eval("window.location.reload()");
    }
}

#[tauri::command]
async fn delete_webview(app: AppHandle, id: String, storage_key: String) {
    if let Some(webview) = app.get_webview(&id) {
        let _ = webview.close();
    }

    #[cfg(target_os = "macos")]
    {
        if session_dir_for_storage_key(&app, &storage_key).is_none() {
            eprintln!("Invalid storage_key for delete_webview: {storage_key}");
            return;
        }

        let _ = app
            .remove_data_store(data_store_identifier_for_storage_key(&storage_key))
            .await;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let Some(session_dir) = session_dir_for_storage_key(&app, &storage_key) else {
            eprintln!("Invalid storage_key for delete_webview: {storage_key}");
            return;
        };

        let _ = std::fs::remove_dir_all(session_dir);
    }
}

#[tauri::command]
fn show_context_menu(app: tauri::AppHandle, window: tauri::Window, id: String, disabled: bool) {
    use tauri::menu::{Menu, MenuItem};

    let reload =
        MenuItem::with_id(&app, format!("reload:{}", id), "Reload", true, None::<&str>).unwrap();
    let edit = MenuItem::with_id(&app, format!("edit:{}", id), "Edit", true, None::<&str>).unwrap();
    let toggle_badge = MenuItem::with_id(
        &app,
        format!("toggle-badge:{}", id),
        "Toggle unread badge",
        true,
        None::<&str>,
    )
    .unwrap();
    let toggle_tray = MenuItem::with_id(
        &app,
        format!("toggle-tray:{}", id),
        "Toggle tray unread",
        true,
        None::<&str>,
    )
    .unwrap();
    let toggle_notifications = MenuItem::with_id(
        &app,
        format!("toggle-notifications:{}", id),
        "Toggle notifications",
        true,
        None::<&str>,
    )
    .unwrap();
    let toggle = MenuItem::with_id(
        &app,
        format!("toggle:{}", id),
        if disabled {
            "Enable service"
        } else {
            "Disable service"
        },
        true,
        None::<&str>,
    )
    .unwrap();
    let delete = MenuItem::with_id(
        &app,
        format!("delete:{}", id),
        "Delete service",
        true,
        None::<&str>,
    )
    .unwrap();

    let menu = Menu::with_items(
        &app,
        &[
            &reload,
            &edit,
            &toggle_badge,
            &toggle_tray,
            &toggle_notifications,
            &toggle,
            &delete,
        ],
    )
    .unwrap();
    let _ = window.popup_menu(&menu);
}

#[tauri::command]
fn update_tray_icon(app: tauri::AppHandle, has_unread: bool) {
    if let Some(tray) = app.tray_by_id("ferx_tray") {
        let icon_bytes = if has_unread {
            include_bytes!("../icons/tray-unread.png").as_slice()
        } else {
            include_bytes!("../icons/tray.png").as_slice()
        };

        if let Ok(image) = tauri::image::Image::from_bytes(icon_bytes) {
            let _ = tray.set_icon(Some(image));
        }
    }
}

fn badge_strategy_for_url(url: &str) -> &'static str {
    let hostname = extract_hostname(url)
        .unwrap_or_default()
        .to_ascii_lowercase();

    if hostname_matches(&hostname, "outlook.office.com")
        || hostname_matches(&hostname, "office.com")
        || hostname_matches(&hostname, "outlook.live.com")
    {
        "outlook-folder-dom"
    } else if hostname_matches(&hostname, "teams.microsoft.com")
        || hostname_matches(&hostname, "teams.cloud.microsoft")
    {
        "teams-title"
    } else if hostname_matches(&hostname, "web.whatsapp.com") {
        "whatsapp-title"
    } else {
        "unsupported"
    }
}

#[tauri::command]
async fn open_service(
    app: tauri::AppHandle,
    id: String,
    url: String,
    storage_key: String,
    allow_notifications: bool,
) {
    use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize};

    let Some((webview_url, initialization_script)) =
        service_webview_setup(&url, allow_notifications)
    else {
        eprintln!("Invalid external url for open_service: {url}");
        let _ = app.emit("show-toast", "Invalid service URL");
        return;
    };

    {
        let state = app.state::<ActiveWebview>();
        *state.0.lock().unwrap() = id.clone();
    }

    if let Some(window) = app.get_window("main") {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let physical_size = window.inner_size().unwrap_or_default();
        let sidebar_width = (79.0 * scale_factor) as u32;

        let active_pos = PhysicalPosition::new(sidebar_width as i32, 0);
        let active_size = PhysicalSize::new(
            physical_size.width.saturating_sub(sidebar_width),
            physical_size.height,
        );
        let offscreen_pos = PhysicalPosition::new(-10000, -10000);

        let mut already_exists = false;

        for (name, webview) in app.webviews() {
            if name != "main" {
                if name == id {
                    let _ = webview.set_bounds(tauri::Rect {
                        position: tauri::Position::Physical(active_pos),
                        size: tauri::Size::Physical(active_size),
                    });
                    let _ = webview.show();
                    let _ = webview.set_focus();
                    already_exists = true;
                } else {
                    let _ = webview.set_bounds(tauri::Rect {
                        position: tauri::Position::Physical(offscreen_pos),
                        size: tauri::Size::Physical(active_size),
                    });
                }
            }
        }

        if already_exists {
            return;
        }

        let app_handle = app.clone();
        let service_id = id.clone();
        let mut builder = tauri::WebviewBuilder::new(&id, webview_url);

        #[cfg(target_os = "macos")]
        {
            if session_dir_for_storage_key(&app_handle, &storage_key).is_none() {
                eprintln!("Invalid storage_key for open_service: {storage_key}");
                return;
            }

            builder =
                builder.data_store_identifier(data_store_identifier_for_storage_key(&storage_key));
        }

        #[cfg(not(target_os = "macos"))]
        {
            let Some(data_dir) = session_dir_for_storage_key(&app_handle, &storage_key) else {
                eprintln!("Invalid storage_key for open_service: {storage_key}");
                return;
            };
            let _ = std::fs::create_dir_all(&data_dir);
            builder = builder.data_directory(data_dir);
        }

        let builder = if let Some(user_agent) = user_agent_for_url(&url) {
            builder.user_agent(user_agent)
        } else {
            builder
        }
        .initialization_script(&initialization_script)
        .on_navigation(move |url| {
                if url.host_str() == Some("ferx.notify") {
                    if let Some(payload_str) = url.path().strip_prefix('/') {
                        if let Some(payload) = parse_badge_payload(payload_str) {
                            let normalized = match payload {
                                BadgePayload::Count(count) => count.to_string(),
                                BadgePayload::Unknown => "-1".to_string(),
                                BadgePayload::Clear => "0".to_string(),
                            };
                            let _ = app_handle.emit("update-badge", format!("{}:{}", service_id, normalized));
                        }
                    }
                    return false;
                }
                if url.host_str() == Some("ferx.shortcut") {
                    if let Some(key_str) = url.path().strip_prefix('/') {
                        let _ = app_handle.emit("switch-shortcut", key_str);
                    }
                    return false;
                }
                if url.host_str() == Some("ferx.download") {
                    let query = url.query_pairs().find(|(k, _)| k == "url");
                    if let Some((_, target_url)) = query {
                        // THE FIX: Use the new OpenerExt to silence the deprecation warning
                        use tauri_plugin_opener::OpenerExt;
                        let _ = app_handle.opener().open_url(target_url.to_string(), None::<&str>);
                        let _ = app_handle.emit("show-toast", "Opening download in your browser...");
                    }
                    return false;
                }
                true
            });

        let result = window.add_child(builder, active_pos, active_size);
        if let Err(e) = result {
            println!("Webview failed: {}", e);
        }
    }
}

#[tauri::command]
async fn load_service(
    app: tauri::AppHandle,
    id: String,
    url: String,
    storage_key: String,
    allow_notifications: bool,
) {
    use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize};

    if app.get_webview(&id).is_some() {
        return;
    }

    if let Some(window) = app.get_window("main") {
        let app_handle = app.clone();
        let service_id = id.clone();

        let Some((webview_url, initialization_script)) =
            service_webview_setup(&url, allow_notifications)
        else {
            eprintln!("Invalid external url for load_service: {url}");
            let _ = app.emit("show-toast", "Invalid service URL");
            return;
        };
        let mut builder = tauri::WebviewBuilder::new(&id, webview_url);

        #[cfg(target_os = "macos")]
        {
            if session_dir_for_storage_key(&app_handle, &storage_key).is_none() {
                eprintln!("Invalid storage_key for load_service: {storage_key}");
                return;
            }

            builder =
                builder.data_store_identifier(data_store_identifier_for_storage_key(&storage_key));
        }

        #[cfg(not(target_os = "macos"))]
        {
            let Some(data_dir) = session_dir_for_storage_key(&app_handle, &storage_key) else {
                eprintln!("Invalid storage_key for load_service: {storage_key}");
                return;
            };
            let _ = std::fs::create_dir_all(&data_dir);
            builder = builder.data_directory(data_dir);
        }

        let builder = if let Some(user_agent) = user_agent_for_url(&url) {
            builder.user_agent(user_agent)
        } else {
            builder
        }
        .initialization_script(&initialization_script)
        .on_navigation(move |url| {
                if url.host_str() == Some("ferx.notify") {
                    if let Some(payload_str) = url.path().strip_prefix('/') {
                        if let Some(payload) = parse_badge_payload(payload_str) {
                            let normalized = match payload {
                                BadgePayload::Count(count) => count.to_string(),
                                BadgePayload::Unknown => "-1".to_string(),
                                BadgePayload::Clear => "0".to_string(),
                            };
                            let _ = app_handle.emit("update-badge", format!("{}:{}", service_id, normalized));
                        }
                    }
                    return false;
                }
                if url.host_str() == Some("ferx.shortcut") {
                    if let Some(key_str) = url.path().strip_prefix('/') {
                        let _ = app_handle.emit("switch-shortcut", key_str);
                    }
                    return false;
                }
                if url.host_str() == Some("ferx.download") {
                    let query = url.query_pairs().find(|(k, _)| k == "url");
                    if let Some((_, target_url)) = query {
                        // THE FIX: Use the new OpenerExt here too
                        use tauri_plugin_opener::OpenerExt;
                        let _ = app_handle.opener().open_url(target_url.to_string(), None::<&str>);
                        let _ = app_handle.emit("show-toast", "Opening download in your browser...");
                    }
                    return false;
                }
                true
            });

        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let physical_size = window.inner_size().unwrap_or_default();
        let sidebar_width = (79.0 * scale_factor) as u32;

        let _ = window.add_child(
            builder,
            PhysicalPosition::new(-10000, -10000),
            PhysicalSize::new(
                physical_size.width.saturating_sub(sidebar_width),
                physical_size.height,
            ),
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init()) // NEW: Register the opener plugin!
        .manage(ActiveWebview(Mutex::new(String::new())))
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
            use tauri::Emitter;

            let app_handle = app.handle().clone();

            app.on_menu_event(move |_app, event| {
                let action_id = event.id.as_ref();
                let _ = app_handle.emit("menu-action", action_id);
            });

            let toggle_i =
                MenuItem::with_id(app, "toggle_window", "Show / Hide Ferx", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit_app", "Quit Ferx", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&toggle_i, &quit_i])?;

            let _tray = TrayIconBuilder::with_id("ferx_tray")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .icon(
                    tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))
                        .expect("Failed to load icon"),
                )
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit_app" => {
                        app.exit(0);
                    }
                    "toggle_window" => {
                        if let Some(window) = app.get_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Resized(physical_size) => {
                let state = window.state::<ActiveWebview>();
                let active_id = state.0.lock().unwrap().clone();

                if !active_id.is_empty() {
                    let scale_factor = window.scale_factor().unwrap_or(1.0);
                    let sidebar_width = (79.0 * scale_factor) as u32;

                    if let Some(webview) = window.get_webview(&active_id) {
                        let _ = webview.set_bounds(tauri::Rect {
                            position: tauri::Position::Physical(tauri::PhysicalPosition::new(
                                sidebar_width as i32,
                                0,
                            )),
                            size: tauri::Size::Physical(tauri::PhysicalSize::new(
                                physical_size.width.saturating_sub(sidebar_width),
                                physical_size.height,
                            )),
                        });
                    }
                }
            }
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            open_service,
            hide_all_webviews,
            reload_webview,
            delete_webview,
            show_context_menu,
            load_service,
            update_tray_icon
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
