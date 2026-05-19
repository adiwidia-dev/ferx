use crate::app_state::{
    badge_monitoring_pref, clear_active_webview, clear_badge_monitoring_prefs, get_active_webview,
    remove_badge_monitoring_pref, service_audio_muted, set_active_resource_usage_monitoring,
    set_active_webview, set_badge_monitoring_pref, set_service_audio_muted,
    set_stored_right_panel_width,
};
use crate::download_dialog::handle_service_webview_download;
use crate::file_drop::register_file_drop_handler;
use crate::navigation_bridge::emit_badge_update;
use crate::navigation_bridge::handle_special_navigation;
use crate::service_storage::{data_store_identifier_for_storage_key, session_dir_for_storage_key};
use crate::service_webview::{
    resource_usage_monitor_eval_script, service_webview_setup_with_resource_monitoring,
    user_agent_for_url,
};
use crate::window_layout::{
    apply_active_child_webview_bounds, effective_service_content_size, right_panel_physical_width,
    service_content_top_offset, sidebar_physical_width,
};
use serde::Deserialize;
use tauri::webview::Color;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebviewIdPayload {
    pub(crate) id: String,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteWebviewPayload {
    pub(crate) id: String,
    pub(crate) storage_key: String,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RightPanelWidthPayload {
    pub(crate) width: f64,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AudioMutedPayload {
    pub(crate) muted: bool,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SingleAudioMutedPayload {
    pub(crate) id: String,
    pub(crate) muted: bool,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServiceWebviewCommandPayload {
    pub(crate) id: String,
    pub(crate) url: String,
    pub(crate) storage_key: String,
    pub(crate) allow_notifications: bool,
    pub(crate) badge_monitoring_enabled: bool,
    pub(crate) spell_check_enabled: bool,
    pub(crate) resource_usage_monitoring_enabled: bool,
}

#[derive(Clone, Copy)]
pub(crate) enum BadgeMonitoringMode {
    Active,
    Background,
}

impl BadgeMonitoringMode {
    fn as_js_literal(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Background => "background",
        }
    }
}

pub(crate) fn badge_monitoring_eval_script(enabled: bool, mode: BadgeMonitoringMode) -> String {
    let enabled_literal = if enabled { "true" } else { "false" };
    let mode_literal = mode.as_js_literal();
    format!(
        "if (window.__ferxSetBadgeMonitoringMode) {{ window.__ferxSetBadgeMonitoringMode('{mode_literal}', {enabled_literal}); }} else {{ window.__ferxSetBadgeMonitoring?.({enabled_literal}); }}"
    )
}

fn set_badge_monitoring_mode(webview: &tauri::Webview, enabled: bool, mode: BadgeMonitoringMode) {
    if let Err(e) = webview.eval(badge_monitoring_eval_script(enabled, mode)) {
        eprintln!("badge monitoring eval failed for {}: {e}", webview.label());
    }
}

fn set_audio_muted(webview: &tauri::Webview, muted: bool) {
    let muted_literal = if muted { "true" } else { "false" };
    if let Err(e) = webview.eval(format!("window.__ferxSetAudioMuted?.({muted_literal});")) {
        eprintln!("audio muted eval failed for {}: {e}", webview.label());
    }
}

fn set_resource_usage_monitoring(webview: &tauri::Webview, enabled: bool) {
    if let Err(e) = webview.eval(resource_usage_monitor_eval_script(enabled)) {
        eprintln!("resource monitor eval failed for {}: {e}", webview.label());
    }
}

fn activate_service_webview(
    app: &AppHandle,
    webview: &tauri::Webview,
    id: &str,
    position: tauri::PhysicalPosition<i32>,
    size: tauri::PhysicalSize<u32>,
    resource_usage_monitoring_enabled: bool,
) {
    set_badge_monitoring_mode(
        webview,
        badge_monitoring_pref(app, id),
        BadgeMonitoringMode::Active,
    );
    set_audio_muted(webview, service_audio_muted(app));
    set_resource_usage_monitoring(webview, resource_usage_monitoring_enabled);
    let _ = webview.set_bounds(tauri::Rect {
        position: tauri::Position::Physical(position),
        size: tauri::Size::Physical(size),
    });
    let _ = webview.show();
    let _ = webview.set_focus();
}

fn move_service_webview_to_background(
    app: &AppHandle,
    webview: &tauri::Webview,
    id: &str,
    position: tauri::PhysicalPosition<i32>,
    size: tauri::PhysicalSize<u32>,
) {
    set_badge_monitoring_mode(
        webview,
        badge_monitoring_pref(app, id),
        BadgeMonitoringMode::Background,
    );
    set_resource_usage_monitoring(webview, false);
    let _ = webview.set_bounds(tauri::Rect {
        position: tauri::Position::Physical(position),
        size: tauri::Size::Physical(size),
    });
}

fn move_previous_active_webview_to_background(
    app: &AppHandle,
    previous_active_to_hide: Option<&str>,
    position: tauri::PhysicalPosition<i32>,
    size: tauri::PhysicalSize<u32>,
) {
    let Some(previous_id) = previous_active_to_hide else {
        return;
    };
    if let Some(previous_webview) = app.get_webview(previous_id) {
        move_service_webview_to_background(app, &previous_webview, previous_id, position, size);
    }
}

// Builder inputs map 1:1 to the service webview command payload fields; a
// params struct here would just mirror that payload without adding clarity.
#[allow(clippy::too_many_arguments)]
fn service_webview_builder(
    app: &AppHandle,
    command_name: &str,
    id: &str,
    url: &str,
    storage_key: &str,
    allow_notifications: bool,
    spell_check_enabled: bool,
    resource_usage_monitoring_enabled: bool,
) -> Option<tauri::WebviewBuilder<tauri::Wry>> {
    let Some((webview_url, initialization_script)) = service_webview_setup_with_resource_monitoring(
        url,
        allow_notifications,
        spell_check_enabled,
        resource_usage_monitoring_enabled,
    ) else {
        eprintln!("Invalid external url for {command_name}: {url}");
        let _ = app.emit("show-toast", "Invalid service URL");
        return None;
    };

    let app_handle = app.clone();
    let service_id = id.to_string();
    let mut builder =
        tauri::WebviewBuilder::new(id, webview_url).background_color(Color(255, 255, 255, 255));

    #[cfg(target_os = "macos")]
    {
        if session_dir_for_storage_key(&app_handle, storage_key).is_none() {
            eprintln!("Invalid storage_key for {command_name}: {storage_key}");
            return None;
        }

        builder = builder.data_store_identifier(data_store_identifier_for_storage_key(storage_key));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let Some(data_dir) = session_dir_for_storage_key(&app_handle, storage_key) else {
            eprintln!("Invalid storage_key for {command_name}: {storage_key}");
            return None;
        };
        let _ = std::fs::create_dir_all(&data_dir);
        builder = builder.data_directory(data_dir);
    }

    let builder = if let Some(user_agent) = user_agent_for_url(url) {
        builder.user_agent(user_agent)
    } else {
        builder
    }
    .initialization_script(initialization_script)
    .on_navigation(move |url| handle_special_navigation(&app_handle, &service_id, url))
    .on_download(handle_service_webview_download);

    Some(builder)
}

fn close_service_webviews(app: &AppHandle) {
    clear_active_webview(app);
    clear_badge_monitoring_prefs(app);
    set_active_resource_usage_monitoring(app, false);

    for (name, webview) in app.webviews() {
        if name != "main" {
            let _ = webview.close();
        }
    }
}

pub(crate) fn safe_export_file_name(default_filename: &str) -> String {
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

pub(crate) fn previous_active_webview_to_hide(
    previous_active_id: &str,
    next_active_id: &str,
) -> Option<String> {
    if previous_active_id.is_empty() || previous_active_id == next_active_id {
        return None;
    }

    Some(previous_active_id.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn hide_all_webviews(app: AppHandle) {
    use tauri::PhysicalPosition;

    // Only the active webview is ever on-screen / in active badge mode — every
    // other child webview is already parked offscreen in background mode (see
    // `move_service_webview_to_background` / `load_service`). So hiding all
    // webviews only needs to touch the single active one. This keeps overlay
    // open (workspace switcher / editor / todos) O(1) instead of O(N).
    let previous_active_id = get_active_webview(&app);
    clear_active_webview(&app);
    set_active_resource_usage_monitoring(&app, false);

    if previous_active_id.is_empty() {
        return;
    }

    if let Some(window) = app.get_window("main") {
        let Some(webview) = app.get_webview(&previous_active_id) else {
            return;
        };

        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let physical_size = window.inner_size().unwrap_or_default();
        let sidebar_width = sidebar_physical_width(scale_factor);
        let right_panel_width =
            right_panel_physical_width(scale_factor, crate::app_state::right_panel_width(&app));
        let offscreen_size =
            effective_service_content_size(physical_size, sidebar_width, 0, right_panel_width);

        set_badge_monitoring_mode(
            &webview,
            badge_monitoring_pref(&app, &previous_active_id),
            BadgeMonitoringMode::Background,
        );
        let _ = webview.set_bounds(tauri::Rect {
            position: tauri::Position::Physical(PhysicalPosition::new(-10000, -10000)),
            size: tauri::Size::Physical(offscreen_size),
        });
    }
}

#[tauri::command]
#[specta::specta]
pub async fn set_all_service_webviews_audio_muted(app: AppHandle, payload: AudioMutedPayload) {
    set_service_audio_muted(&app, payload.muted);

    for (name, webview) in app.webviews() {
        if name != "main" {
            set_audio_muted(&webview, payload.muted);
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn set_service_webview_audio_muted(app: AppHandle, payload: SingleAudioMutedPayload) {
    for (name, webview) in app.webviews() {
        if name == payload.id {
            set_audio_muted(&webview, payload.muted);
            break;
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn close_all_service_webviews(app: AppHandle) {
    close_service_webviews(&app);
}

#[tauri::command]
#[specta::specta]
pub async fn set_right_panel_width(app: AppHandle, payload: RightPanelWidthPayload) {
    set_stored_right_panel_width(&app, payload.width);

    if let Some(window) = app.get_window("main") {
        let physical_size = window.inner_size().unwrap_or_default();
        apply_active_child_webview_bounds(&window, physical_size);
    }
}

#[tauri::command]
#[specta::specta]
pub async fn save_workspace_config_export(
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
#[specta::specta]
pub async fn restart_app(app: AppHandle) -> Result<(), String> {
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
#[specta::specta]
pub async fn reload_webview(app: AppHandle, payload: WebviewIdPayload) {
    let WebviewIdPayload { id } = payload;

    if let Some(webview) = app.get_webview(&id) {
        let _ = webview.reload();
    }
}

#[tauri::command]
#[specta::specta]
pub fn report_outlook_badge(app: AppHandle, webview: tauri::Webview, payload: String) {
    emit_badge_update(&app, webview.label(), &payload);
}

#[tauri::command]
#[specta::specta]
pub fn report_teams_badge(app: AppHandle, webview: tauri::Webview, payload: String) {
    emit_badge_update(&app, webview.label(), &payload);
}

#[tauri::command]
#[specta::specta]
pub fn report_resource_usage(app: AppHandle, webview: tauri::Webview, payload: String) {
    if let Err(e) = app.emit(
        "resource-usage-update",
        format!("{}:{payload}", webview.label()),
    ) {
        eprintln!("resource-usage-update emit failed: {e}");
    }
}

#[tauri::command]
#[specta::specta]
pub async fn close_webview(app: AppHandle, payload: WebviewIdPayload) {
    let WebviewIdPayload { id } = payload;

    if let Some(webview) = app.get_webview(&id) {
        let _ = webview.close();
    }
    remove_badge_monitoring_pref(&app, &id);

    let state = app.state::<crate::app_state::ActiveWebview>();
    if let Ok(mut active) = state.0.lock() {
        if *active == id {
            *active = String::new();
            set_active_resource_usage_monitoring(&app, false);
        }
    };
}

#[tauri::command]
#[specta::specta]
pub async fn delete_webview(app: AppHandle, payload: DeleteWebviewPayload) {
    let DeleteWebviewPayload { id, storage_key } = payload;

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
#[specta::specta]
pub async fn open_service(app: tauri::AppHandle, payload: ServiceWebviewCommandPayload) {
    use tauri::PhysicalPosition;

    let ServiceWebviewCommandPayload {
        id,
        url,
        storage_key,
        allow_notifications,
        badge_monitoring_enabled,
        spell_check_enabled,
        resource_usage_monitoring_enabled,
    } = payload;

    let Some(builder) = service_webview_builder(
        &app,
        "open_service",
        &id,
        &url,
        &storage_key,
        allow_notifications,
        spell_check_enabled,
        resource_usage_monitoring_enabled,
    ) else {
        return;
    };

    let previous_active_id = get_active_webview(&app);
    let previous_active_to_hide = previous_active_webview_to_hide(&previous_active_id, &id);
    set_active_webview(&app, id.clone());
    set_badge_monitoring_pref(&app, &id, badge_monitoring_enabled);
    set_active_resource_usage_monitoring(&app, resource_usage_monitoring_enabled);

    if let Some(window) = app.get_window("main") {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let physical_size = window.inner_size().unwrap_or_default();
        let sidebar_width = sidebar_physical_width(scale_factor);
        let top_offset =
            service_content_top_offset(scale_factor, resource_usage_monitoring_enabled);
        let right_panel_width =
            right_panel_physical_width(scale_factor, crate::app_state::right_panel_width(&app));

        let active_pos = PhysicalPosition::new(sidebar_width as i32, top_offset as i32);
        let active_size = effective_service_content_size(
            physical_size,
            sidebar_width,
            top_offset,
            right_panel_width,
        );
        let offscreen_pos = PhysicalPosition::new(-10000, -10000);

        if let Some(active_webview) = app.get_webview(&id) {
            activate_service_webview(
                &app,
                &active_webview,
                &id,
                active_pos,
                active_size,
                resource_usage_monitoring_enabled,
            );
            move_previous_active_webview_to_background(
                &app,
                previous_active_to_hide.as_deref(),
                offscreen_pos,
                active_size,
            );
            return;
        }

        match window.add_child(builder, active_pos, active_size) {
            Ok(webview) => {
                register_file_drop_handler(&webview);
                activate_service_webview(
                    &app,
                    &webview,
                    &id,
                    active_pos,
                    active_size,
                    resource_usage_monitoring_enabled,
                );
                move_previous_active_webview_to_background(
                    &app,
                    previous_active_to_hide.as_deref(),
                    offscreen_pos,
                    active_size,
                );
            }
            Err(error) => {
                eprintln!("open_service: webview creation failed for {id}: {error}");
                let _ = app.emit("show-toast", format!("Failed to open service: {error}"));
            }
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn load_service(app: tauri::AppHandle, payload: ServiceWebviewCommandPayload) {
    use tauri::PhysicalPosition;

    let ServiceWebviewCommandPayload {
        id,
        url,
        storage_key,
        allow_notifications,
        badge_monitoring_enabled,
        spell_check_enabled,
        resource_usage_monitoring_enabled,
    } = payload;

    if app.get_webview(&id).is_some() {
        return;
    }
    set_badge_monitoring_pref(&app, &id, badge_monitoring_enabled);

    if let Some(window) = app.get_window("main") {
        let Some(builder) = service_webview_builder(
            &app,
            "load_service",
            &id,
            &url,
            &storage_key,
            allow_notifications,
            spell_check_enabled,
            resource_usage_monitoring_enabled,
        ) else {
            return;
        };

        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let physical_size = window.inner_size().unwrap_or_default();
        let sidebar_width = sidebar_physical_width(scale_factor);
        let right_panel_width =
            right_panel_physical_width(scale_factor, crate::app_state::right_panel_width(&app));

        match window.add_child(
            builder,
            PhysicalPosition::new(-10000, -10000),
            effective_service_content_size(physical_size, sidebar_width, 0, right_panel_width),
        ) {
            Ok(webview) => {
                register_file_drop_handler(&webview);
                set_badge_monitoring_mode(
                    &webview,
                    badge_monitoring_enabled,
                    BadgeMonitoringMode::Background,
                );
                set_audio_muted(&webview, service_audio_muted(&app));
            }
            Err(error) => {
                eprintln!("load_service: webview creation failed for {id}: {error}");
                let _ = app.emit("show-toast", format!("Failed to preload service: {error}"));
            }
        }
    }
}
