use crate::service_runtime::{
    extract_hostname, hostname_matches, microsoft_service_kind, MicrosoftServiceKind,
};
use crate::service_webview_badge_scripts::{
    badge_engine_script, outlook_badge_engine_script, teams_badge_engine_script,
};
use crate::service_webview_resource_usage::resource_usage_monitor_script;
use crate::service_webview_runtime_scripts::{
    common_webview_script, google_auth_compat_script, notification_script,
    spellcheck_script,
};

pub(crate) fn external_webview_url(raw: &str) -> Option<tauri::WebviewUrl> {
    raw.parse().ok().map(tauri::WebviewUrl::External)
}

const SPOOFED_CHROME_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const TEAMS_EDGE_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0";

fn is_teams_service(url: &str) -> bool {
    let hostname = extract_hostname(url)
        .unwrap_or_default()
        .to_ascii_lowercase();

    hostname_matches(&hostname, "teams.microsoft.com")
        || hostname_matches(&hostname, "teams.cloud.microsoft")
}

fn is_google_service(url: &str) -> bool {
    let hostname = extract_hostname(url)
        .unwrap_or_default()
        .to_ascii_lowercase();

    hostname_matches(&hostname, "youtube.com")
        || hostname_matches(&hostname, "google.com")
        || hostname_matches(&hostname, "gmail.com")
        || hostname_matches(&hostname, "googlevideo.com")
}

fn should_skip_notification_shim(url: &str) -> bool {
    matches!(
        microsoft_service_kind(url),
        Some(MicrosoftServiceKind::Outlook | MicrosoftServiceKind::Teams)
    )
}

pub(crate) fn user_agent_for_url(url: &str) -> Option<&'static str> {
    if is_teams_service(url) {
        Some(TEAMS_EDGE_USER_AGENT)
    } else if matches!(
        microsoft_service_kind(url),
        Some(MicrosoftServiceKind::Outlook)
    ) {
        None
    } else {
        Some(SPOOFED_CHROME_USER_AGENT)
    }
}

pub(crate) fn resource_usage_monitor_eval_script(enabled: bool) -> &'static str {
    if enabled {
        resource_usage_monitor_script()
    } else {
        "window.__ferxSetResourceUsageMonitoring?.(false);"
    }
}

fn injected_js_for_url(
    url: &str,
    allow_notifications: bool,
    spell_check_enabled: bool,
    resource_usage_monitoring_enabled: bool,
) -> String {
    let strategy_name = crate::webview_commands::badge_strategy_for_url(url);
    let microsoft_service = microsoft_service_kind(url);
    let google_compat = if is_google_service(url) {
        google_auth_compat_script()
    } else {
        ""
    };

    format!(
        "{}{}{}{}{}{}",
        google_compat,
        if should_skip_notification_shim(url) {
            ""
        } else {
            notification_script(allow_notifications)
        },
        spellcheck_script(spell_check_enabled),
        resource_usage_monitor_eval_script(resource_usage_monitoring_enabled),
        common_webview_script(),
        match microsoft_service {
            Some(MicrosoftServiceKind::Outlook) => outlook_badge_engine_script(strategy_name),
            Some(MicrosoftServiceKind::Teams) => teams_badge_engine_script(),
            None => badge_engine_script(strategy_name),
        }
    )
}

#[cfg(test)]
pub(crate) fn injected_js(allow_notifications: bool) -> String {
    injected_js_for_url("", allow_notifications, true, false)
}

#[cfg(test)]
pub(crate) fn service_webview_setup(
    url: &str,
    allow_notifications: bool,
) -> Option<(tauri::WebviewUrl, String)> {
    service_webview_setup_with_spellcheck(url, allow_notifications, true)
}

#[cfg(test)]
pub(crate) fn service_webview_setup_with_spellcheck(
    url: &str,
    allow_notifications: bool,
    spell_check_enabled: bool,
) -> Option<(tauri::WebviewUrl, String)> {
    service_webview_setup_with_resource_monitoring(
        url,
        allow_notifications,
        spell_check_enabled,
        false,
    )
}

pub(crate) fn service_webview_setup_with_resource_monitoring(
    url: &str,
    allow_notifications: bool,
    spell_check_enabled: bool,
    resource_usage_monitoring_enabled: bool,
) -> Option<(tauri::WebviewUrl, String)> {
    Some((
        external_webview_url(url)?,
        injected_js_for_url(
            url,
            allow_notifications,
            spell_check_enabled,
            resource_usage_monitoring_enabled,
        ),
    ))
}
