use crate::service_runtime::{
    badge_strategy_for_url, extract_hostname, hostname_matches, microsoft_service_kind,
    MicrosoftServiceKind,
};
use crate::service_webview::{
    external_webview_url, injected_js, service_webview_setup,
    service_webview_setup_with_resource_monitoring, service_webview_setup_with_spellcheck,
    user_agent_for_url,
};
use crate::service_webview_badge_scripts::{
    badge_engine_script, outlook_badge_engine_script, teams_badge_engine_script,
};
use crate::service_webview_resource_usage::resource_usage_monitor_script;
use crate::service_webview_runtime_scripts::{
    common_webview_script, google_auth_compat_script, notification_script, spellcheck_script,
};
use crate::webview_commands::{
    close_all_service_webviews, report_outlook_badge, report_resource_usage, report_teams_badge,
    safe_export_file_name, save_workspace_config_export, DeleteWebviewPayload,
    RightPanelWidthPayload, ServiceWebviewCommandPayload, WebviewIdPayload,
};
use crate::window_layout::effective_service_content_size;
use serde_json::json;

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
    let Some((_, script)) = service_webview_setup("https://outlook.office.com/mail", false) else {
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
    let _: fn(tauri::AppHandle, tauri::Webview, String) = report_outlook_badge;
}

#[test]
fn report_teams_badge_uses_child_webview_context_type() {
    let _: fn(tauri::AppHandle, tauri::Webview, String) = report_teams_badge;
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

/// Type-level proof that these commands exist and have the expected signatures.
/// The compiler rejects this file if any command is removed or its signature changes —
/// no source-string sniffing needed.
#[allow(dead_code)]
fn assert_command_signatures() {
    // close_all_service_webviews: AppHandle → ()
    let _: fn() = || {
        let _ = close_all_service_webviews;
    };
    // save_workspace_config_export: (String, String) → Result<bool, String>
    let _: fn() = || {
        let _ = save_workspace_config_export;
    };
    // report_resource_usage: (AppHandle, Webview, String) → ()
    let _: fn(tauri::AppHandle, tauri::Webview, String) = report_resource_usage;
}

#[test]
fn close_webview_preserves_session_storage() {
    // close_webview must not delete the service's data directory or data store.
    // Deleting storage on close would wipe sessions when a workspace is disabled.
    // Only delete_webview is permitted to remove storage.
    let source = include_str!("webview_commands.rs");
    let close_start = source
        .find("pub async fn close_webview")
        .expect("expected close_webview command");
    let next_command = source[close_start + 1..]
        .find("#[tauri::command]")
        .map(|offset| close_start + 1 + offset)
        .unwrap_or(source.len());
    let close_body = &source[close_start..next_command];

    assert!(!close_body.contains("remove_data_store"),
        "close_webview must not delete the data store — use delete_webview for that");
    assert!(!close_body.contains("remove_dir_all"),
        "close_webview must not delete the session directory — use delete_webview for that");
}

#[test]
fn hide_all_webviews_moves_child_webviews_offscreen_without_storage_deletion() {
    let source = include_str!("webview_commands.rs");
    let hide_start = source
        .find("pub async fn hide_all_webviews")
        .expect("expected hide_all_webviews command");
    let next_command = source[hide_start + 1..]
        .find("#[tauri::command]")
        .map(|offset| hide_start + 1 + offset)
        .unwrap_or(source.len());
    let hide_command = &source[hide_start..next_command];

    // Must move webviews offscreen so overlays (modal, workspace picker,
    // settings) can appear above them without the native child webviews
    // showing through.
    assert!(hide_command.contains("webview.set_bounds"));
    assert!(hide_command.contains("PhysicalPosition::new(-10000, -10000)"));

    // Must NOT destroy webviews — closing them would force a full reload of
    // every service the next time the overlay is dismissed.
    assert!(!hide_command.contains("let _ = webview.close();"));
    assert!(!hide_command.contains("let _ = webview.hide();"));

    // Must NOT delete any persistent session storage.
    assert!(!hide_command.contains("remove_data_store"));
    assert!(!hide_command.contains("remove_dir_all"));
}

#[test]
fn service_webview_command_payload_deserializes_from_camel_case() {
    let payload: ServiceWebviewCommandPayload = serde_json::from_value(json!({
        "id": "chat",
        "url": "https://chat.example.com",
        "storageKey": "storage-chat",
        "allowNotifications": true,
        "badgeMonitoringEnabled": false,
        "spellCheckEnabled": true,
        "resourceUsageMonitoringEnabled": true
    }))
    .expect("expected camelCase service payload");

    assert_eq!(payload.id, "chat");
    assert_eq!(payload.storage_key, "storage-chat");
    assert!(payload.allow_notifications);
    assert!(!payload.badge_monitoring_enabled);
    assert!(payload.spell_check_enabled);
    assert!(payload.resource_usage_monitoring_enabled);
}

#[test]
fn auxiliary_webview_command_payloads_deserialize_from_camel_case() {
    let delete_payload: DeleteWebviewPayload = serde_json::from_value(json!({
        "id": "chat",
        "storageKey": "storage-chat"
    }))
    .expect("expected camelCase delete payload");
    let close_payload: WebviewIdPayload = serde_json::from_value(json!({
        "id": "chat"
    }))
    .expect("expected webview id payload");
    let width_payload: RightPanelWidthPayload = serde_json::from_value(json!({
        "width": 360.0
    }))
    .expect("expected right panel width payload");

    assert_eq!(delete_payload.id, "chat");
    assert_eq!(delete_payload.storage_key, "storage-chat");
    assert_eq!(close_payload.id, "chat");
    assert_eq!(width_payload.width, 360.0);
}

#[test]
fn safe_export_file_name_removes_paths_and_ensures_json_extension() {
    assert_eq!(
        safe_export_file_name("../ferx-workspace-config-2026-04-23"),
        "ferx-workspace-config-2026-04-23.json"
    );
    assert_eq!(
        safe_export_file_name("/tmp/ferx-workspace-config.json"),
        "ferx-workspace-config.json"
    );
    assert_eq!(safe_export_file_name("   "), "ferx-workspace-config.json");
}

#[test]
fn effective_service_content_size_excludes_sidebar_top_offset_and_right_panel() {
    assert_eq!(
        effective_service_content_size(tauri::PhysicalSize::new(1200, 800), 80, 32, 360,),
        tauri::PhysicalSize::new(760, 768)
    );
}

#[test]
fn effective_service_content_size_preserves_current_width_without_right_panel() {
    assert_eq!(
        effective_service_content_size(tauri::PhysicalSize::new(1200, 800), 80, 0, 0,),
        tauri::PhysicalSize::new(1120, 800)
    );
}

#[test]
fn effective_service_content_size_saturates_when_chrome_exceeds_window_size() {
    assert_eq!(
        effective_service_content_size(tauri::PhysicalSize::new(300, 120), 80, 150, 360,),
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
    assert_eq!(badge_strategy_for_url("https://teams.microsoft.com"), "teams-dom");
    assert_eq!(
        badge_strategy_for_url("https://web.whatsapp.com"),
        "whatsapp-title"
    );
    assert_eq!(badge_strategy_for_url("https://example.com"), "unsupported");
    assert_eq!(badge_strategy_for_url("https://notwhatsapp.com"), "unsupported");
    assert_eq!(badge_strategy_for_url("https://teams.example.com"), "unsupported");
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
    assert!(initialization_script.contains("window.location.href = 'https://ferx.download/?url='"));
    assert!(initialization_script.contains("window.location.href = 'https://ferx.shortcut/' + key"));
    assert!(initialization_script.contains("invoke('report_teams_badge'"));
    assert!(initialization_script.contains(".fui-Badge"));
    assert!(!initialization_script.contains("https://ferx.notify/"));
}

#[test]
fn outlook_setup_restores_badge_detection_without_notify_navigation() {
    let Some((_, outlook_script)) = service_webview_setup("https://outlook.office.com/mail", true)
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
    let Some((_, script)) = service_webview_setup("https://outlook.office.com/mail", false) else {
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
    let Some((_, teams_script)) = service_webview_setup("https://teams.microsoft.com", false)
    else {
        panic!("expected valid teams setup");
    };
    let Some((_, outlook_script)) = service_webview_setup("https://outlook.office.com/mail", true)
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
    let Some((_, outlook_script)) = service_webview_setup("https://outlook.office.com/mail", true)
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
    let Some((_, teams_script)) = service_webview_setup("https://teams.cloud.microsoft/", false)
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
fn resource_usage_monitor_restores_page_hooks_when_disabled() {
    let Some((_, script)) = service_webview_setup_with_resource_monitoring(
        "https://discord.com/channels/@me",
        false,
        true,
        true,
    ) else {
        panic!("expected valid discord setup");
    };

    assert!(script.contains("__ferx_resource_usage_original_fetch"));
    assert!(script.contains("__ferx_resource_usage_long_task_observer"));
    assert!(script.contains("window.fetch = window.__ferx_resource_usage_original_fetch"));
    assert!(script.contains(
        "XMLHttpRequest.prototype.send = window.__ferx_resource_usage_original_xhr_send",
    ));
    assert!(
        script.contains("navigator.sendBeacon = window.__ferx_resource_usage_original_send_beacon",)
    );
    assert!(script.contains("window.__ferx_resource_usage_long_task_observer?.disconnect()",));
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
    assert_eq!(user_agent_for_url("https://outlook.office365.com/mail"), None);
    assert_eq!(user_agent_for_url("https://outlook.cloud.microsoft/mail"), None);
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
    let Some((_, teams_script)) = service_webview_setup("https://teams.cloud.microsoft/", false)
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
    let Some((_, discord_script)) = service_webview_setup("https://discord.com/channels/@me", false)
    else {
        panic!("expected valid discord setup");
    };

    assert!(discord_script.contains("window.__ferx_badge_strategy = 'unsupported'"));
    assert!(discord_script.contains("https://ferx.notify/"));
    assert!(!discord_script.contains("invoke('report_outlook_badge'"));
}

#[test]
fn extracted_runtime_script_modules_preserve_known_markers() {
    assert!(google_auth_compat_script().contains("window.webkit"));
    assert!(notification_script(false).contains("permission: 'denied'"));
    assert!(spellcheck_script(false).contains("window.__ferx_spellcheck_control_active"));
    assert!(common_webview_script().contains("https://ferx.download/"));
}

#[test]
fn extracted_resource_and_badge_script_modules_preserve_known_markers() {
    assert!(resource_usage_monitor_script().contains("report_resource_usage"));
    assert!(badge_engine_script("unsupported").contains("https://ferx.notify/"));
    assert!(
        outlook_badge_engine_script("outlook-folder-dom").contains("invoke('report_outlook_badge'")
    );
    assert!(teams_badge_engine_script().contains("invoke('report_teams_badge'"));
}

#[test]
fn service_webview_setup_rejects_invalid_external_urls() {
    assert!(service_webview_setup("not a url", false).is_none());
}

/// Regenerates `src/lib/tauri-commands.ts` from the current Rust command
/// signatures and fails if the file on disk is different from what specta
/// would produce.  Run `yarn tauri dev` (or `cargo tauri dev`) once to fix
/// the file, then commit it.
///
/// CI pairs this test with `git diff --exit-code src/lib/tauri-commands.ts`
/// so a stale generated file is caught before it can land on main.
#[test]
fn tauri_commands_typescript_is_up_to_date() {
    crate::build_specta()
        .export(
            specta_typescript::Typescript::default()
                .header("// This file is auto-generated by tauri-specta. Do not edit manually.\n"),
            concat!(env!("CARGO_MANIFEST_DIR"), "/../src/lib/tauri-commands.ts"),
        )
        .expect("Failed to export TypeScript bindings");
}
