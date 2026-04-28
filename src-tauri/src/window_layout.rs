use crate::app_state::{
    active_resource_usage_monitoring, right_panel_width, ActiveWebview,
};
use tauri::Manager;

pub const RESIZE_DEBOUNCE_MS: u64 = 32;
const SIDEBAR_WIDTH: f64 = 79.0;
const RESOURCE_USAGE_STRIP_HEIGHT: f64 = 32.0;

pub fn sidebar_physical_width(scale_factor: f64) -> u32 {
    (SIDEBAR_WIDTH * scale_factor) as u32
}

pub fn right_panel_physical_width(scale_factor: f64, right_panel_width: f64) -> u32 {
    (right_panel_width.max(0.0) * scale_factor) as u32
}

pub fn service_content_top_offset(
    scale_factor: f64,
    resource_usage_monitoring_enabled: bool,
) -> u32 {
    if resource_usage_monitoring_enabled {
        (RESOURCE_USAGE_STRIP_HEIGHT * scale_factor) as u32
    } else {
        0
    }
}

pub fn effective_service_content_size(
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

pub fn apply_active_child_webview_bounds(
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
        active_resource_usage_monitoring(window.app_handle()),
    );
    let right_panel_width =
        right_panel_physical_width(scale_factor, right_panel_width(window.app_handle()));

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
