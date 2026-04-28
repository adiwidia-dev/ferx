use crate::app_state::{
    badge_monitoring_pref, clear_active_webview, clear_badge_monitoring_prefs,
    remove_badge_monitoring_pref, set_active_resource_usage_monitoring, set_active_webview,
    set_badge_monitoring_pref, set_stored_right_panel_width,
};
use crate::download_dialog::handle_service_webview_download;
use crate::file_drop::register_file_drop_handler;
use crate::navigation_bridge::emit_badge_update;
use crate::navigation_bridge::handle_special_navigation;
use crate::service_runtime::{
    extract_hostname, hostname_matches, microsoft_service_kind, MicrosoftServiceKind,
};
use crate::service_storage::{
    data_store_identifier_for_storage_key, session_dir_for_storage_key,
};
use crate::service_webview::{
    resource_usage_monitor_eval_script, service_webview_setup_with_resource_monitoring,
    user_agent_for_url,
};
use crate::window_layout::{
    apply_active_child_webview_bounds, effective_service_content_size,
    right_panel_physical_width, service_content_top_offset, sidebar_physical_width,
};
use serde::Deserialize;
use tauri::webview::Color;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebviewIdPayload {
    pub(crate) id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteWebviewPayload {
    pub(crate) id: String,
    pub(crate) storage_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RightPanelWidthPayload {
    pub(crate) width: f64,
}

#[derive(Debug, Clone, Deserialize)]
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

fn set_badge_monitoring(webview: &tauri::Webview, enabled: bool) {
    let enabled_literal = if enabled { "true" } else { "false" };
    let _ = webview.eval(format!(
        "window.__ferxSetBadgeMonitoring?.({enabled_literal});"
    ));
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

pub(crate) fn badge_strategy_for_url(url: &str) -> &'static str {
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
pub async fn hide_all_webviews(app: AppHandle) {
    use tauri::PhysicalPosition;

    clear_active_webview(&app);
    set_active_resource_usage_monitoring(&app, false);

    if let Some(window) = app.get_window("main") {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let physical_size = window.inner_size().unwrap_or_default();
        let sidebar_width = sidebar_physical_width(scale_factor);
        let right_panel_width =
            right_panel_physical_width(scale_factor, crate::app_state::right_panel_width(&app));

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

#[tauri::command]
pub async fn close_all_service_webviews(app: AppHandle) {
    close_service_webviews(&app);
}

#[tauri::command]
pub async fn set_right_panel_width(app: AppHandle, payload: RightPanelWidthPayload) {
    set_stored_right_panel_width(&app, payload.width);

    if let Some(window) = app.get_window("main") {
        let physical_size = window.inner_size().unwrap_or_default();
        apply_active_child_webview_bounds(&window, physical_size);
    }
}

#[tauri::command]
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
pub async fn reload_webview(app: AppHandle, payload: WebviewIdPayload) {
    let WebviewIdPayload { id } = payload;

    if let Some(webview) = app.get_webview(&id) {
        let _ = webview.eval("window.location.reload()");
    }
}

#[tauri::command]
pub fn report_outlook_badge(app: AppHandle, webview: tauri::Webview, payload: String) {
    emit_badge_update(&app, webview.label(), &payload);
}

#[tauri::command]
pub fn report_teams_badge(app: AppHandle, webview: tauri::Webview, payload: String) {
    emit_badge_update(&app, webview.label(), &payload);
}

#[tauri::command]
pub fn report_resource_usage(app: AppHandle, webview: tauri::Webview, payload: String) {
    let _ = app.emit(
        "resource-usage-update",
        format!("{}:{payload}", webview.label()),
    );
}

#[tauri::command]
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

    let Some((webview_url, initialization_script)) = service_webview_setup_with_resource_monitoring(
        &url,
        allow_notifications,
        spell_check_enabled,
        resource_usage_monitoring_enabled,
    ) else {
        eprintln!("Invalid external url for open_service: {url}");
        let _ = app.emit("show-toast", "Invalid service URL");
        return;
    };

    set_active_webview(&app, id.clone());
    set_badge_monitoring_pref(&app, &id, badge_monitoring_enabled);
    set_active_resource_usage_monitoring(&app, resource_usage_monitoring_enabled);

    if let Some(window) = app.get_window("main") {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let physical_size = window.inner_size().unwrap_or_default();
        let sidebar_width = sidebar_physical_width(scale_factor);
        let top_offset =
            service_content_top_offset(scale_factor, resource_usage_monitoring_enabled);
        let right_panel_width = right_panel_physical_width(
            scale_factor,
            crate::app_state::right_panel_width(&app),
        );

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
            Err(error) => println!("Webview failed: {}", error),
        }
    }
}

#[tauri::command]
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
        let right_panel_width = right_panel_physical_width(
            scale_factor,
            crate::app_state::right_panel_width(&app),
        );

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
