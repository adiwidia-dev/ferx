pub(crate) fn external_webview_url(raw: &str) -> Option<tauri::WebviewUrl> {
    raw.parse().ok().map(tauri::WebviewUrl::External)
}

pub(crate) fn service_webview_setup(
    url: &str,
    initialization_script: String,
) -> Option<(tauri::WebviewUrl, String)> {
    Some((external_webview_url(url)?, initialization_script))
}
