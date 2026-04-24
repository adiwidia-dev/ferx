mod badge_payload;
mod desktop_ui;
mod download_dialog;
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
use service_webview::{
    resource_usage_monitor_eval_script, service_webview_setup_with_resource_monitoring,
    user_agent_for_url,
};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::webview::Color;
use tauri::{AppHandle, Emitter, Manager};

use download_dialog::handle_service_webview_download;

struct ActiveWebview(Mutex<String>);
struct ActiveResourceUsageMonitoring(Mutex<bool>);
struct BadgeMonitoringPrefs(Mutex<HashMap<String, bool>>);
struct RightPanelWidth(Mutex<f64>);

/// Coalesces rapid `Resized` events: only the latest resize may apply `set_bounds` (see debounce in `on_window_event`).
struct MainWindowResizeGen(AtomicU64);

const RESIZE_DEBOUNCE_MS: u64 = 32;
const SIDEBAR_WIDTH: f64 = 79.0;
const RESOURCE_USAGE_STRIP_HEIGHT: f64 = 32.0;

fn set_badge_monitoring(webview: &tauri::Webview, enabled: bool) {
    let enabled_literal = if enabled { "true" } else { "false" };
    let _ = webview.eval(format!(
        "window.__ferxSetBadgeMonitoring?.({enabled_literal});"
    ));
}

fn set_badge_monitoring_pref(app: &AppHandle, service_id: &str, enabled: bool) {
    let prefs = app.state::<BadgeMonitoringPrefs>();
    if let Ok(mut map) = prefs.0.lock() {
        map.insert(service_id.to_string(), enabled);
    };
}

fn remove_badge_monitoring_pref(app: &AppHandle, service_id: &str) {
    let prefs = app.state::<BadgeMonitoringPrefs>();
    if let Ok(mut map) = prefs.0.lock() {
        map.remove(service_id);
    };
}

fn badge_monitoring_pref(app: &AppHandle, service_id: &str) -> bool {
    let prefs = app.state::<BadgeMonitoringPrefs>();
    let result = if let Ok(map) = prefs.0.lock() {
        map.get(service_id).copied().unwrap_or(true)
    } else {
        true
    };
    result
}

fn set_active_resource_usage_monitoring(app: &AppHandle, enabled: bool) {
    let state = app.state::<ActiveResourceUsageMonitoring>();
    if let Ok(mut active) = state.0.lock() {
        *active = enabled;
    };
}

fn active_resource_usage_monitoring(app: &AppHandle) -> bool {
    let state = app.state::<ActiveResourceUsageMonitoring>();
    state.0.lock().map(|active| *active).unwrap_or(false)
}

fn set_stored_right_panel_width(app: &AppHandle, width: f64) {
    let state = app.state::<RightPanelWidth>();
    if let Ok(mut stored_width) = state.0.lock() {
        *stored_width = width.max(0.0);
    };
}

fn right_panel_width(app: &AppHandle) -> f64 {
    let state = app.state::<RightPanelWidth>();
    state.0.lock().map(|width| *width).unwrap_or(0.0)
}

fn sidebar_physical_width(scale_factor: f64) -> u32 {
    (SIDEBAR_WIDTH * scale_factor) as u32
}

fn right_panel_physical_width(scale_factor: f64, right_panel_width: f64) -> u32 {
    (right_panel_width.max(0.0) * scale_factor) as u32
}

fn service_content_top_offset(scale_factor: f64, resource_usage_monitoring_enabled: bool) -> u32 {
    if resource_usage_monitoring_enabled {
        (RESOURCE_USAGE_STRIP_HEIGHT * scale_factor) as u32
    } else {
        0
    }
}

fn effective_service_content_size(
    physical_size: tauri::PhysicalSize<u32>,
    sidebar_width: u32,
    top_offset: u32,
    right_panel_width: u32,
) -> tauri::PhysicalSize<u32> {
    tauri::PhysicalSize::new(
        physical_size
            .width
            .saturating_sub(sidebar_width)
            .saturating_sub(right_panel_width),
        physical_size.height.saturating_sub(top_offset),
    )
}

fn apply_active_child_webview_bounds(
    window: &tauri::Window,
    physical_size: tauri::PhysicalSize<u32>,
) {
    let state = window.state::<ActiveWebview>();
    let active_id = state
        .0
        .lock()
        .map(|active| active.clone())
        .unwrap_or_default();

    if active_id.is_empty() {
        return;
    }

    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let sidebar_width = sidebar_physical_width(scale_factor);
    let top_offset = service_content_top_offset(
        scale_factor,
        active_resource_usage_monitoring(&window.app_handle()),
    );
    let right_panel_width =
        right_panel_physical_width(scale_factor, right_panel_width(&window.app_handle()));

    if let Some(webview) = window.get_webview(&active_id) {
        let _ = webview.set_bounds(tauri::Rect {
            position: tauri::Position::Physical(tauri::PhysicalPosition::new(
                sidebar_width as i32,
                top_offset as i32,
            )),
            size: tauri::Size::Physical(effective_service_content_size(
                physical_size,
                sidebar_width,
                top_offset,
                right_panel_width,
            )),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::{
        badge_strategy_for_url, report_outlook_badge, report_resource_usage, report_teams_badge,
        AppHandle,
    };
    use crate::service_runtime::{
        extract_hostname, hostname_matches, microsoft_service_kind, MicrosoftServiceKind,
    };
    use crate::service_webview::{
        external_webview_url, injected_js, service_webview_setup,
        service_webview_setup_with_resource_monitoring, service_webview_setup_with_spellcheck,
        user_agent_for_url,
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
        let Some((_, script)) =
            service_webview_setup("https://outlook.office.com/mail", false)
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
    fn tauri_conf_enables_updater_with_github_endpoint() {
        let config = include_str!("../tauri.conf.json");

        assert!(config.contains("\"createUpdaterArtifacts\": true"));
        assert!(config.contains("\"signingIdentity\": \"-\""));
        assert!(config.contains("\"updater\""));
        assert!(config.contains("\"pubkey\""));
        assert!(config.contains("github.com/adiwidia-dev/ferx/releases"));
        assert!(config.contains("latest.json"));
    }

    #[test]
    fn default_capability_grants_updater_and_process_restart() {
        let capability = include_str!("../capabilities/default.json");

        assert!(capability.contains("updater:default"));
        assert!(capability.contains("process:default"));
        assert!(capability.contains("process:allow-restart"));
    }

    #[test]
    fn close_all_service_webviews_command_exists() {
        let source = include_str!("lib.rs");
        let _command = super::close_all_service_webviews;

        assert!(source.contains("close_all_service_webviews,"));
    }

    #[test]
    fn save_workspace_config_export_command_exists() {
        let source = include_str!("lib.rs");
        let _command = super::save_workspace_config_export;

        assert!(source.contains("save_workspace_config_export,"));
    }

    #[test]
    fn report_resource_usage_command_exists() {
        let source = include_str!("lib.rs");
        let _command = report_resource_usage;

        assert!(source.contains("report_resource_usage,"));
    }

    #[test]
    fn safe_export_file_name_removes_paths_and_ensures_json_extension() {
        assert_eq!(
            super::safe_export_file_name("../ferx-workspace-config-2026-04-23"),
            "ferx-workspace-config-2026-04-23.json"
        );
        assert_eq!(
            super::safe_export_file_name("/tmp/ferx-workspace-config.json"),
            "ferx-workspace-config.json"
        );
        assert_eq!(super::safe_export_file_name("   "), "ferx-workspace-config.json");
    }

    #[test]
    fn effective_service_content_size_excludes_sidebar_top_offset_and_right_panel() {
        assert_eq!(
            super::effective_service_content_size(
                tauri::PhysicalSize::new(1200, 800),
                80,
                32,
                360,
            ),
            tauri::PhysicalSize::new(760, 768)
        );
    }

    #[test]
    fn effective_service_content_size_preserves_current_width_without_right_panel() {
        assert_eq!(
            super::effective_service_content_size(
                tauri::PhysicalSize::new(1200, 800),
                80,
                0,
                0,
            ),
            tauri::PhysicalSize::new(1120, 800)
        );
    }

    #[test]
    fn effective_service_content_size_saturates_when_chrome_exceeds_window_size() {
        assert_eq!(
            super::effective_service_content_size(
                tauri::PhysicalSize::new(300, 120),
                80,
                150,
                360,
            ),
            tauri::PhysicalSize::new(0, 0)
        );
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
    fn title_observer_binds_to_title_then_tracks_head_child_list() {
        let script = injected_js(false);

        assert!(script.contains("const titleEl = document.querySelector('title');"));
        assert!(script.contains("titleEl.__ferx_title_observer_bound"));
        assert!(script.contains("const head = document.head || document.documentElement;"));
        assert!(script.contains("childList: true"));
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
        let Some((_, script)) =
            service_webview_setup("https://outlook.office.com/mail", false)
        else {
            panic!("expected valid outlook setup");
        };

        assert!(script.contains("span.screenReaderOnly"));
        assert!(script.contains("div[role=tree]"));
        assert!(script.contains("outlookScreenReaderState"));
        assert!(script.contains("outlookFolderState"));
        assert!(script.contains(
            "window.__ferx_badge_monitoring_enabled = window.__ferx_badge_monitoring_enabled ?? true;"
        ));
        assert!(!script.contains("console.info"));
    }

    #[test]
    fn service_webview_setup_skips_notification_shim_for_microsoft_apps() {
        let Some((_, teams_script)) =
            service_webview_setup("https://teams.microsoft.com", false)
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
        let Some((_, teams_script)) =
            service_webview_setup("https://teams.microsoft.com", false)
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
        let Some((_, teams_script)) =
            service_webview_setup("https://teams.microsoft.com", false)
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
        let Some((_, script)) =
            service_webview_setup("https://discord.com/channels/@me", false)
        else {
            panic!("expected valid discord setup");
        };

        assert!(script.contains("permission: 'denied'"));
        assert!(script.contains("Object.defineProperty(window, 'Notification'"));
    }

    #[test]
    fn service_webview_setup_disables_spellcheck_when_requested() {
        let Some((_, script)) =
            service_webview_setup_with_spellcheck("https://discord.com/channels/@me", false, false)
        else {
            panic!("expected valid discord setup");
        };

        assert!(script.contains("window.__ferxSpellcheckEnabled = false;"));
        assert!(script.contains("window.__ferx_spellcheck_control_active"));
        assert!(script.contains("element.spellcheck = false;"));
        assert!(script.contains("element.getAttribute('spellcheck') === 'false'"));
        assert!(script.contains("requestIdleCallback"));
        assert!(!script.contains("attributes: true"));
        assert!(!script.contains("attributeFilter: ['contenteditable', 'spellcheck']"));
        assert!(!script.contains("mutation.addedNodes"));
        assert!(!script.contains("observe(document.documentElement"));
    }

    #[test]
    fn service_webview_setup_injects_resource_usage_monitor_when_enabled() {
        let Some((_, script)) = service_webview_setup_with_resource_monitoring(
            "https://discord.com/channels/@me",
            false,
            true,
            true,
        ) else {
            panic!("expected valid discord setup");
        };

        assert!(script.contains("window.__ferxResourceUsageMonitoringEnabled = true"));
        assert!(script.contains("report_resource_usage"));
        assert!(script.contains("networkInMbps"));
        assert!(script.contains("networkOutMbps: safeNumber(networkOutMbps)"));
        assert!(script.contains("window.fetch = function"));
        assert!(script.contains("XMLHttpRequest.prototype.send"));
        assert!(script.contains("navigator.sendBeacon = function"));
    }

    #[test]
    fn service_webview_setup_skips_resource_usage_monitor_when_disabled() {
        let Some((_, script)) = service_webview_setup_with_resource_monitoring(
            "https://discord.com/channels/@me",
            false,
            true,
            false,
        ) else {
            panic!("expected valid discord setup");
        };

        assert!(!script.contains("report_resource_usage"));
        assert!(!script.contains("__ferxResourceUsageMonitoringEnabled = true"));
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
        let Some((_, script)) = service_webview_setup("https://music.youtube.com/", false)
        else {
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
        let Some((_, script)) =
            service_webview_setup("https://discord.com/channels/@me", false)
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
    use tauri::PhysicalPosition;

    {
        let state = app.state::<ActiveWebview>();
        if let Ok(mut active) = state.0.lock() {
            *active = String::new();
        };
    }
    set_active_resource_usage_monitoring(&app, false);

    if let Some(window) = app.get_window("main") {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let physical_size = window.inner_size().unwrap_or_default();
        let sidebar_width = sidebar_physical_width(scale_factor);
        let right_panel_width = right_panel_physical_width(scale_factor, right_panel_width(&app));

        let active_size =
            effective_service_content_size(physical_size, sidebar_width, 0, right_panel_width);
        let offscreen_pos = PhysicalPosition::new(-10000, -10000);

        for (name, webview) in app.webviews() {
            if name != "main" {
                set_badge_monitoring(&webview, false);
                let _ = webview.set_bounds(tauri::Rect {
                    position: tauri::Position::Physical(offscreen_pos),
                    size: tauri::Size::Physical(active_size),
                });
            }
        }
    }
}

fn close_service_webviews(app: &AppHandle) {
    {
        let state = app.state::<ActiveWebview>();
        if let Ok(mut active) = state.0.lock() {
            *active = String::new();
        };
    }
    {
        let prefs = app.state::<BadgeMonitoringPrefs>();
        if let Ok(mut prefs) = prefs.0.lock() {
            prefs.clear();
        };
    }
    set_active_resource_usage_monitoring(app, false);

    for (name, webview) in app.webviews() {
        if name != "main" {
            let _ = webview.close();
        }
    }
}

fn safe_export_file_name(default_filename: &str) -> String {
    let trimmed = default_filename.trim();
    let fallback = "ferx-workspace-config.json";
    let without_paths = trimmed
        .rsplit(['/', '\\'])
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or(fallback);

    if without_paths.ends_with(".json") {
        without_paths.to_string()
    } else {
        format!("{without_paths}.json")
    }
}

#[tauri::command]
async fn close_all_service_webviews(app: AppHandle) {
    close_service_webviews(&app);
}

#[tauri::command]
async fn set_right_panel_width(app: AppHandle, width: f64) {
    set_stored_right_panel_width(&app, width);

    if let Some(window) = app.get_window("main") {
        let physical_size = window.inner_size().unwrap_or_default();
        apply_active_child_webview_bounds(&window, physical_size);
    }
}

#[tauri::command]
async fn save_workspace_config_export(
    contents: String,
    default_filename: String,
) -> Result<bool, String> {
    let file_name = safe_export_file_name(&default_filename);
    let Some(path) = rfd::FileDialog::new()
        .add_filter("JSON", &["json"])
        .set_file_name(file_name)
        .save_file()
    else {
        return Ok(false);
    };

    std::fs::write(path, contents).map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
async fn restart_app(app: AppHandle) -> Result<(), String> {
    if tauri::is_dev() {
        close_service_webviews(&app);
        let Some(webview) = app.get_webview("main") else {
            return Err("Main webview is not available".to_string());
        };
        webview
            .eval("window.location.replace(window.location.origin + '/')")
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    app.restart();
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
fn report_resource_usage(app: AppHandle, webview: tauri::Webview, payload: String) {
    let _ = app.emit("resource-usage-update", format!("{}:{payload}", webview.label()));
}

#[tauri::command]
async fn delete_webview(app: AppHandle, id: String, storage_key: String) {
    if let Some(webview) = app.get_webview(&id) {
        let _ = webview.close();
    }
    remove_badge_monitoring_pref(&app, &id);

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
    badge_monitoring_enabled: bool,
    spell_check_enabled: bool,
    resource_usage_monitoring_enabled: bool,
) {
    use tauri::PhysicalPosition;

    let Some((webview_url, initialization_script)) = service_webview_setup_with_resource_monitoring(
        &url,
        allow_notifications,
        spell_check_enabled,
        resource_usage_monitoring_enabled,
    )
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
    set_badge_monitoring_pref(&app, &id, badge_monitoring_enabled);
    set_active_resource_usage_monitoring(&app, resource_usage_monitoring_enabled);

    if let Some(window) = app.get_window("main") {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let physical_size = window.inner_size().unwrap_or_default();
        let sidebar_width = sidebar_physical_width(scale_factor);
        let top_offset =
            service_content_top_offset(scale_factor, resource_usage_monitoring_enabled);
        let right_panel_width = right_panel_physical_width(scale_factor, right_panel_width(&app));

        let active_pos = PhysicalPosition::new(sidebar_width as i32, top_offset as i32);
        let active_size = effective_service_content_size(
            physical_size,
            sidebar_width,
            top_offset,
            right_panel_width,
        );
        let offscreen_pos = PhysicalPosition::new(-10000, -10000);

        let mut already_exists = false;

        for (name, webview) in app.webviews() {
            if name != "main" {
                if name == id {
                    set_badge_monitoring(&webview, badge_monitoring_pref(&app, &id));
                    let _ = webview.eval(resource_usage_monitor_eval_script(
                        resource_usage_monitoring_enabled,
                    ));
                    let _ = webview.set_bounds(tauri::Rect {
                        position: tauri::Position::Physical(active_pos),
                        size: tauri::Size::Physical(active_size),
                    });
                    let _ = webview.show();
                    let _ = webview.set_focus();
                    already_exists = true;
                } else {
                    set_badge_monitoring(&webview, badge_monitoring_pref(&app, &name));
                    let _ = webview.eval(resource_usage_monitor_eval_script(false));
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
        .on_navigation(move |url| handle_special_navigation(&app_handle, &service_id, url))
        .on_download(handle_service_webview_download);

        match window.add_child(builder, active_pos, active_size) {
            Ok(webview) => {
                register_file_drop_handler(&webview);
                set_badge_monitoring(&webview, badge_monitoring_pref(&app, &id));
            }
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
    badge_monitoring_enabled: bool,
    spell_check_enabled: bool,
    resource_usage_monitoring_enabled: bool,
) {
    use tauri::PhysicalPosition;

    if app.get_webview(&id).is_some() {
        return;
    }
    set_badge_monitoring_pref(&app, &id, badge_monitoring_enabled);

    if let Some(window) = app.get_window("main") {
        let app_handle = app.clone();
        let service_id = id.clone();

        let Some((webview_url, initialization_script)) =
            service_webview_setup_with_resource_monitoring(
                &url,
                allow_notifications,
                spell_check_enabled,
                resource_usage_monitoring_enabled,
            )
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
        .on_navigation(move |url| handle_special_navigation(&app_handle, &service_id, url))
        .on_download(handle_service_webview_download);

        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let physical_size = window.inner_size().unwrap_or_default();
        let sidebar_width = sidebar_physical_width(scale_factor);
        let right_panel_width = right_panel_physical_width(scale_factor, right_panel_width(&app));

        if let Ok(webview) = window.add_child(
            builder,
            PhysicalPosition::new(-10000, -10000),
            effective_service_content_size(physical_size, sidebar_width, 0, right_panel_width),
        ) {
            register_file_drop_handler(&webview);
            set_badge_monitoring(&webview, badge_monitoring_enabled);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ActiveWebview(Mutex::new(String::new())))
        .manage(ActiveResourceUsageMonitoring(Mutex::new(false)))
        .manage(BadgeMonitoringPrefs(Mutex::new(HashMap::new())))
        .manage(RightPanelWidth(Mutex::new(0.0)))
        .manage(MainWindowResizeGen(AtomicU64::new(0)));

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
                        desktop_ui::toggle_main_window_visibility(app);
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
                        desktop_ui::toggle_main_window_visibility(app);
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Resized(_) => {
                let debounce = window.state::<MainWindowResizeGen>();
                let my_gen = debounce.0.fetch_add(1, Ordering::SeqCst) + 1;
                let app = window.app_handle().clone();
                let window_label = window.label().to_string();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_millis(RESIZE_DEBOUNCE_MS)).await;
                    let debounce = app.state::<MainWindowResizeGen>();
                    if debounce.0.load(Ordering::SeqCst) != my_gen {
                        return;
                    }
                    let Some(w) = app.get_window(&window_label) else {
                        return;
                    };
                    let physical_size = w.inner_size().unwrap_or_default();
                    apply_active_child_webview_bounds(&w, physical_size);
                });
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
            close_all_service_webviews,
            set_right_panel_width,
            save_workspace_config_export,
            restart_app,
            reload_webview,
            report_outlook_badge,
            report_teams_badge,
            report_resource_usage,
            delete_webview,
            show_context_menu,
            load_service,
            update_tray_icon
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
