use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;

pub struct ActiveWebview(pub Mutex<String>);
pub struct ActiveResourceUsageMonitoring(pub Mutex<bool>);
pub struct BadgeMonitoringPrefs(pub Mutex<HashMap<String, bool>>);
pub struct RightPanelWidth(pub Mutex<f64>);

/// Coalesces rapid `Resized` events: only the latest resize may apply `set_bounds` (see debounce in `on_window_event`).
pub struct MainWindowResizeGen(pub AtomicU64);

pub fn set_badge_monitoring_pref(app: &AppHandle, service_id: &str, enabled: bool) {
    let prefs = app.state::<BadgeMonitoringPrefs>();
    if let Ok(mut map) = prefs.0.lock() {
        map.insert(service_id.to_string(), enabled);
    };
}

pub fn remove_badge_monitoring_pref(app: &AppHandle, service_id: &str) {
    let prefs = app.state::<BadgeMonitoringPrefs>();
    if let Ok(mut map) = prefs.0.lock() {
        map.remove(service_id);
    };
}

pub fn clear_badge_monitoring_prefs(app: &AppHandle) {
    let prefs = app.state::<BadgeMonitoringPrefs>();
    if let Ok(mut prefs) = prefs.0.lock() {
        prefs.clear();
    };
}

pub fn badge_monitoring_pref(app: &AppHandle, service_id: &str) -> bool {
    let prefs = app.state::<BadgeMonitoringPrefs>();
    let result = if let Ok(map) = prefs.0.lock() {
        map.get(service_id).copied().unwrap_or(true)
    } else {
        true
    };
    result
}

pub fn set_active_resource_usage_monitoring(app: &AppHandle, enabled: bool) {
    let state = app.state::<ActiveResourceUsageMonitoring>();
    if let Ok(mut active) = state.0.lock() {
        *active = enabled;
    };
}

pub fn active_resource_usage_monitoring(app: &AppHandle) -> bool {
    let state = app.state::<ActiveResourceUsageMonitoring>();
    state.0.lock().map(|active| *active).unwrap_or(false)
}

pub fn set_stored_right_panel_width(app: &AppHandle, width: f64) {
    let state = app.state::<RightPanelWidth>();
    if let Ok(mut stored_width) = state.0.lock() {
        *stored_width = width.max(0.0);
    };
}

pub fn right_panel_width(app: &AppHandle) -> f64 {
    let state = app.state::<RightPanelWidth>();
    state.0.lock().map(|width| *width).unwrap_or(0.0)
}

pub fn clear_active_webview(app: &AppHandle) {
    let state = app.state::<ActiveWebview>();
    if let Ok(mut active) = state.0.lock() {
        *active = String::new();
    };
}

pub fn set_active_webview(app: &AppHandle, service_id: String) {
    let state = app.state::<ActiveWebview>();
    if let Ok(mut active) = state.0.lock() {
        *active = service_id;
    };
}
