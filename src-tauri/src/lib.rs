mod badge_payload;
mod desktop_ui;
mod file_drop;
mod navigation_bridge;
mod service_runtime;
mod service_storage;
mod service_webview;

use file_drop::register_file_drop_handler;
use navigation_bridge::{emit_badge_update, handle_special_navigation};
use service_runtime::{
    extract_hostname, hostname_matches, microsoft_service_kind, MicrosoftServiceKind,
};
use service_storage::{data_store_identifier_for_storage_key, session_dir_for_storage_key};
use service_webview::{service_webview_setup, user_agent_for_url};
use std::sync::Mutex;
use tauri::webview::Color;
use tauri::{AppHandle, Emitter, Manager};

struct ActiveWebview(Mutex<String>);

#[cfg(test)]
mod tests {
    use super::{badge_strategy_for_url, report_outlook_badge, report_teams_badge, AppHandle};
    use crate::service_runtime::{
        extract_hostname, hostname_matches, microsoft_service_kind, MicrosoftServiceKind,
    };
    use crate::service_webview::{
        external_webview_url, injected_js, service_webview_setup, user_agent_for_url,
    };

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
    fn outlook_badge_script_uses_command_bridge_payloads() {
        let Some((_, script)) = service_webview_setup("https://outlook.office.com/mail", false)
        else {
            panic!("expected valid outlook setup");
        };

        assert!(script.contains("payload = 'unknown'"));
        assert!(script.contains("payload = 'clear'"));
        assert!(script.contains("window.__TAURI_INTERNALS__?.invoke"));
        assert!(script.contains("await invoke('report_outlook_badge', { payload })"));
        assert!(!script.contains("ferx://notify/"));
        assert!(!script.contains("await emitBadgeState('clear')"));
        assert!(!script.contains("console.info"));
        assert!(!script.contains("console.warn"));
    }

    #[test]
    fn report_outlook_badge_uses_child_webview_context_type() {
        let _: fn(AppHandle, tauri::Webview, String) = report_outlook_badge;
    }

    #[test]
    fn report_teams_badge_uses_child_webview_context_type() {
        let _: fn(AppHandle, tauri::Webview, String) = report_teams_badge;
    }

    #[test]
    fn default_capability_allows_remote_microsoft_origins() {
        let capability = include_str!("../capabilities/default.json");

        assert!(capability.contains("\"remote\""));
        assert!(!capability.contains("allow-report-outlook-badge"));
        assert!(capability.contains("https://outlook.office.com/*"));
        assert!(capability.contains("https://outlook.office365.com/*"));
        assert!(capability.contains("https://outlook.cloud.microsoft/*"));
        assert!(capability.contains("https://office.com/*"));
        assert!(capability.contains("https://www.office.com/*"));
        assert!(capability.contains("https://outlook.live.com/*"));
        assert!(capability.contains("https://teams.microsoft.com/*"));
        assert!(capability.contains("https://teams.cloud.microsoft/*"));
    }

    #[test]
    fn app_command_acl_experiment_is_not_present() {
        let permission_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("permissions")
            .join("report_outlook_badge.toml");

        assert!(!permission_path.exists());
    }

    #[test]
    fn tauri_conf_keeps_csp_enabled_and_global_api_disabled() {
        let config = include_str!("../tauri.conf.json");

        assert!(config.contains("\"withGlobalTauri\": false"));
        assert!(!config.contains("\"csp\": null"));
        assert!(config.contains("\"default-src\""));
        assert!(config.contains("\"ipc:\""));
    }

    #[test]
    fn microsoft_service_kind_centralizes_outlook_and_teams_host_matching() {
        assert_eq!(
            microsoft_service_kind("https://outlook.office.com/mail"),
            Some(MicrosoftServiceKind::Outlook)
        );
        assert_eq!(
            microsoft_service_kind("https://outlook.office365.com/mail"),
            Some(MicrosoftServiceKind::Outlook)
        );
        assert_eq!(
            microsoft_service_kind("https://outlook.cloud.microsoft/mail"),
            Some(MicrosoftServiceKind::Outlook)
        );
        assert_eq!(
            microsoft_service_kind("https://office.com/mail"),
            Some(MicrosoftServiceKind::Outlook)
        );
        assert_eq!(
            microsoft_service_kind("https://teams.microsoft.com"),
            Some(MicrosoftServiceKind::Teams)
        );
        assert_eq!(
            microsoft_service_kind("https://teams.cloud.microsoft/"),
            Some(MicrosoftServiceKind::Teams)
        );
        assert_eq!(microsoft_service_kind("https://example.com"), None);
    }

    #[test]
    fn badge_strategy_uses_explicit_hostname_mapping() {
        assert_eq!(
            badge_strategy_for_url("https://outlook.office.com/mail"),
            "outlook-folder-dom"
        );
        assert_eq!(
            badge_strategy_for_url("https://outlook.office365.com/mail"),
            "outlook-folder-dom"
        );
        assert_eq!(
            badge_strategy_for_url("https://outlook.cloud.microsoft/mail"),
            "outlook-folder-dom"
        );
        assert_eq!(
            badge_strategy_for_url("https://office.com/mail"),
            "outlook-folder-dom"
        );
        assert_eq!(
            badge_strategy_for_url("https://teams.microsoft.com"),
            "teams-dom"
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
    fn unrelated_office_host_does_not_resolve_as_outlook() {
        assert_eq!(microsoft_service_kind("https://config.office.com"), None);
        assert_eq!(
            badge_strategy_for_url("https://config.office.com"),
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
        assert!(script.contains("window.__ferxSetBadgeMonitoring = (enabled) =>"));
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
        assert!(
            initialization_script.contains("window.location.href = 'https://ferx.download/?url='")
        );
        assert!(
            initialization_script.contains("window.location.href = 'https://ferx.shortcut/' + key")
        );
        assert!(initialization_script.contains("invoke('report_teams_badge'"));
        assert!(initialization_script.contains(".fui-Badge"));
        assert!(!initialization_script.contains("https://ferx.notify/"));
    }

    #[test]
    fn outlook_setup_restores_badge_detection_without_notify_navigation() {
        let Some((_, outlook_script)) =
            service_webview_setup("https://outlook.office.com/mail", true)
        else {
            panic!("expected valid outlook setup");
        };

        assert!(outlook_script.contains("window.__ferx_badge_strategy = 'outlook-folder-dom'"));
        assert!(outlook_script.contains("new MutationObserver"));
        assert!(outlook_script.contains("invoke('report_outlook_badge'"));
        assert!(!outlook_script.contains("ferx://notify/"));
    }

    #[test]
    fn outlook_badge_script_uses_screen_reader_and_folder_fallbacks() {
        let Some((_, script)) = service_webview_setup("https://outlook.office.com/mail", false)
        else {
            panic!("expected valid outlook setup");
        };

        assert!(script.contains("span.screenReaderOnly"));
        assert!(script.contains("div[role=tree]"));
        assert!(script.contains("outlookScreenReaderState"));
        assert!(script.contains("outlookFolderState"));
        assert!(script.contains("outlookPageTextState"));
        assert!(!script.contains("console.info"));
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
        assert!(teams_script.contains("new MutationObserver"));
        assert!(teams_script.contains("invoke('report_teams_badge'"));
        assert!(outlook_script.contains("invoke('report_outlook_badge'"));
        assert!(outlook_script.contains("new MutationObserver"));
    }

    #[test]
    fn teams_setup_keeps_common_navigation_hooks() {
        let Some((_, teams_script)) = service_webview_setup("https://teams.microsoft.com", false)
        else {
            panic!("expected valid teams setup");
        };

        assert!(teams_script.contains("https://ferx.download/"));
        assert!(teams_script.contains("https://ferx.shortcut/"));
    }

    #[test]
    fn cloud_teams_setup_uses_teams_safeguards() {
        let Some((_, teams_script)) =
            service_webview_setup("https://teams.cloud.microsoft/", false)
        else {
            panic!("expected valid cloud teams setup");
        };

        assert!(!teams_script.contains("Object.defineProperty(window, 'Notification'"));
        assert!(!teams_script.contains("https://ferx.notify/"));
        assert!(teams_script.contains("https://ferx.download/"));
        assert!(teams_script.contains("https://ferx.shortcut/"));
        assert_eq!(
            user_agent_for_url("https://teams.cloud.microsoft/"),
            Some(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0"
            )
        );
        assert_eq!(
            badge_strategy_for_url("https://teams.cloud.microsoft/"),
            "teams-dom"
        );
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
        assert_eq!(
            user_agent_for_url("https://outlook.office365.com/mail"),
            None
        );
        assert_eq!(
            user_agent_for_url("https://outlook.cloud.microsoft/mail"),
            None
        );
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
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
            )
        );
    }

    #[test]
    fn youtube_music_setup_includes_google_auth_compat() {
        let Some((_, script)) = service_webview_setup("https://music.youtube.com/", false) else {
            panic!("expected valid youtube music setup");
        };

        assert!(script.contains("window.webkit"));
        assert!(script.contains("messageHandlers"));
        assert!(script.contains("'webdriver'"));
        assert!(script.contains("Google Inc."));
        assert!(script.contains("Google Chrome"));
        assert!(script.contains("window.chrome"));
        assert!(script.contains("navigator.userAgentData"));
        assert!(script.contains("unhandledrejection"));
    }

    #[test]
    fn google_services_use_chrome_user_agent() {
        assert_eq!(
            user_agent_for_url("https://music.youtube.com/"),
            Some(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
            )
        );
    }

    #[test]
    fn non_google_setup_omits_google_auth_compat() {
        let Some((_, script)) = service_webview_setup("https://discord.com/channels/@me", false)
        else {
            panic!("expected valid discord setup");
        };

        assert!(!script.contains("messageHandlers"));
    }

    #[test]
    fn teams_cloud_setup_keeps_supported_edge_user_agent_and_badge_detection() {
        let Some((_, teams_script)) =
            service_webview_setup("https://teams.cloud.microsoft/", false)
        else {
            panic!("expected valid teams setup");
        };

        assert_eq!(
            user_agent_for_url("https://teams.cloud.microsoft/"),
            Some(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0"
            )
        );
        assert!(!teams_script.is_empty());
        assert!(teams_script.contains("https://ferx.download/"));
        assert!(!teams_script.contains("https://ferx.notify/"));
        assert!(teams_script.contains("invoke('report_teams_badge'"));
        assert!(teams_script.contains(".fui-Badge"));
    }

    #[test]
    fn discord_setup_keeps_existing_badge_transport() {
        let Some((_, discord_script)) =
            service_webview_setup("https://discord.com/channels/@me", false)
        else {
            panic!("expected valid discord setup");
        };

        assert!(discord_script.contains("window.__ferx_badge_strategy = 'unsupported'"));
        assert!(discord_script.contains("https://ferx.notify/"));
        assert!(!discord_script.contains("invoke('report_outlook_badge'"));
    }

    #[test]
    fn service_webview_setup_rejects_invalid_external_urls() {
        assert!(service_webview_setup("not a url", false).is_none());
    }

}

#[tauri::command]
async fn hide_all_webviews(app: AppHandle) {
    use tauri::{PhysicalPosition, PhysicalSize};

    {
        let state = app.state::<ActiveWebview>();
        if let Ok(mut active) = state.0.lock() {
            *active = String::new();
        };
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
fn report_outlook_badge(app: AppHandle, webview: tauri::Webview, payload: String) {
    emit_badge_update(&app, webview.label(), &payload);
}

#[tauri::command]
fn report_teams_badge(app: AppHandle, webview: tauri::Webview, payload: String) {
    emit_badge_update(&app, webview.label(), &payload);
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
    desktop_ui::show_context_menu(app, window, id, disabled);
}

#[tauri::command]
fn update_tray_icon(app: tauri::AppHandle, has_unread: bool) {
    desktop_ui::update_tray_icon(app, has_unread);
}

fn badge_strategy_for_url(url: &str) -> &'static str {
    if matches!(
        microsoft_service_kind(url),
        Some(MicrosoftServiceKind::Outlook)
    ) {
        "outlook-folder-dom"
    } else if matches!(
        microsoft_service_kind(url),
        Some(MicrosoftServiceKind::Teams)
    ) {
        "teams-dom"
    } else if hostname_matches(
        &extract_hostname(url)
            .unwrap_or_default()
            .to_ascii_lowercase(),
        "web.whatsapp.com",
    ) {
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
    use tauri::{PhysicalPosition, PhysicalSize};

    let Some((webview_url, initialization_script)) =
        service_webview_setup(&url, allow_notifications)
    else {
        eprintln!("Invalid external url for open_service: {url}");
        let _ = app.emit("show-toast", "Invalid service URL");
        return;
    };

    {
        let state = app.state::<ActiveWebview>();
        if let Ok(mut active) = state.0.lock() {
            *active = id.clone();
        };
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
        let mut builder = tauri::WebviewBuilder::new(&id, webview_url)
            .background_color(Color(255, 255, 255, 255));

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
        .on_navigation(move |url| handle_special_navigation(&app_handle, &service_id, url));

        match window.add_child(builder, active_pos, active_size) {
            Ok(webview) => register_file_drop_handler(&webview),
            Err(e) => println!("Webview failed: {}", e),
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
    use tauri::{PhysicalPosition, PhysicalSize};

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
        let mut builder = tauri::WebviewBuilder::new(&id, webview_url)
            .background_color(Color(255, 255, 255, 255));

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
        .on_navigation(move |url| handle_special_navigation(&app_handle, &service_id, url));

        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let physical_size = window.inner_size().unwrap_or_default();
        let sidebar_width = (79.0 * scale_factor) as u32;

        if let Ok(webview) = window.add_child(
            builder,
            PhysicalPosition::new(-10000, -10000),
            PhysicalSize::new(
                physical_size.width.saturating_sub(sidebar_width),
                physical_size.height,
            ),
        ) {
            register_file_drop_handler(&webview);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ActiveWebview(Mutex::new(String::new())));

    #[cfg(feature = "devtools")]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
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
                .icon(desktop_ui::tray_icon(false))
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit_app" => {
                        app.exit(0);
                    }
                    "toggle_window" => {
                        desktop_ui::toggle_main_window_visibility(&app);
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
                        desktop_ui::toggle_main_window_visibility(&app);
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Resized(physical_size) => {
                let state = window.state::<ActiveWebview>();
                let active_id = state
                    .0
                    .lock()
                    .map(|active| active.clone())
                    .unwrap_or_default();

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
            report_outlook_badge,
            report_teams_badge,
            delete_webview,
            show_context_menu,
            load_service,
            update_tray_icon
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
