use std::sync::OnceLock;
use tauri::Manager;

pub(crate) fn show_context_menu(
    app: tauri::AppHandle,
    window: tauri::Window,
    id: String,
    disabled: bool,
) {
    use tauri::menu::{Menu, MenuItem};

    let reload =
        match MenuItem::with_id(&app, format!("reload:{}", id), "Reload", true, None::<&str>) {
            Ok(item) => item,
            Err(error) => {
                eprintln!("Failed to build Reload menu item: {error}");
                return;
            }
        };
    let edit = match MenuItem::with_id(&app, format!("edit:{}", id), "Edit", true, None::<&str>) {
        Ok(item) => item,
        Err(error) => {
            eprintln!("Failed to build Edit menu item: {error}");
            return;
        }
    };
    let toggle_badge = match MenuItem::with_id(
        &app,
        format!("toggle-badge:{}", id),
        "Toggle unread badge",
        true,
        None::<&str>,
    ) {
        Ok(item) => item,
        Err(error) => {
            eprintln!("Failed to build Toggle unread badge menu item: {error}");
            return;
        }
    };
    let toggle_tray = match MenuItem::with_id(
        &app,
        format!("toggle-tray:{}", id),
        "Toggle tray unread",
        true,
        None::<&str>,
    ) {
        Ok(item) => item,
        Err(error) => {
            eprintln!("Failed to build Toggle tray unread menu item: {error}");
            return;
        }
    };
    let toggle_notifications = match MenuItem::with_id(
        &app,
        format!("toggle-notifications:{}", id),
        "Toggle notifications",
        true,
        None::<&str>,
    ) {
        Ok(item) => item,
        Err(error) => {
            eprintln!("Failed to build Toggle notifications menu item: {error}");
            return;
        }
    };
    let toggle = match MenuItem::with_id(
        &app,
        format!("toggle:{}", id),
        if disabled {
            "Enable service"
        } else {
            "Disable service"
        },
        true,
        None::<&str>,
    ) {
        Ok(item) => item,
        Err(error) => {
            eprintln!("Failed to build Enable/Disable service menu item: {error}");
            return;
        }
    };
    let delete = match MenuItem::with_id(
        &app,
        format!("delete:{}", id),
        "Delete service",
        true,
        None::<&str>,
    ) {
        Ok(item) => item,
        Err(error) => {
            eprintln!("Failed to build Delete service menu item: {error}");
            return;
        }
    };

    let menu = match Menu::with_items(
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
    ) {
        Ok(menu) => menu,
        Err(error) => {
            eprintln!("Failed to build service context menu: {error}");
            return;
        }
    };
    let _ = window.popup_menu(&menu);
}

struct TrayIcons {
    normal: tauri::image::Image<'static>,
    unread: tauri::image::Image<'static>,
}

fn cached_tray_icons() -> &'static TrayIcons {
    static ICONS: OnceLock<TrayIcons> = OnceLock::new();
    ICONS.get_or_init(|| TrayIcons {
        normal: tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))
            .expect("Failed to decode tray.png"),
        unread: tauri::image::Image::from_bytes(include_bytes!("../icons/tray-unread.png"))
            .expect("Failed to decode tray-unread.png"),
    })
}

pub(crate) fn update_tray_icon(app: tauri::AppHandle, has_unread: bool) {
    if let Some(tray) = app.tray_by_id("ferx_tray") {
        let _ = tray.set_icon(Some(tray_icon(has_unread)));
    }
}

pub(crate) fn tray_icon(has_unread: bool) -> tauri::image::Image<'static> {
    let icons = cached_tray_icons();
    if has_unread {
        icons.unread.clone()
    } else {
        icons.normal.clone()
    }
}

pub(crate) fn toggle_main_window_visibility(app: &tauri::AppHandle) {
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
