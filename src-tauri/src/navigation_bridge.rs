use crate::badge_payload::{parse_badge_payload, BadgePayload};
use tauri::{AppHandle, Emitter};

pub(crate) fn badge_update_event_payload(label: &str, payload: &str) -> Option<String> {
    let normalized = match parse_badge_payload(payload)? {
        BadgePayload::Count(count) => count.to_string(),
        BadgePayload::Unknown => "-1".to_string(),
        BadgePayload::Clear => "0".to_string(),
    };

    Some(format!("{}:{}", label, normalized))
}

pub(crate) fn emit_badge_update(app: &AppHandle, label: &str, payload: &str) {
    if let Some(event_payload) = badge_update_event_payload(label, payload) {
        let _ = app.emit("update-badge", event_payload);
    }
}

pub(crate) fn validated_external_open_target(raw: &str) -> Option<String> {
    let url = url::Url::parse(raw).ok()?;
    let scheme = url.scheme();

    if !matches!(scheme, "http" | "https") {
        return None;
    }

    if url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() {
        return None;
    }

    Some(url.to_string())
}

pub(crate) fn handle_special_navigation(
    app_handle: &AppHandle,
    service_id: &str,
    url: &url::Url,
) -> bool {
    if url.host_str() == Some("ferx.notify") {
        if let Some(payload_str) = url.path().strip_prefix('/') {
            emit_badge_update(app_handle, service_id, payload_str);
        }
        return false;
    }

    if url.host_str() == Some("ferx.shortcut") {
        if let Some(key_str) = url.path().strip_prefix('/') {
            let _ = app_handle.emit("switch-shortcut", key_str);
        }
        return false;
    }

    if url.host_str() == Some("ferx.download") {
        let query = url.query_pairs().find(|(key, _)| key == "url");

        match query.and_then(|(_, target_url)| validated_external_open_target(&target_url)) {
            Some(target_url) => {
                use tauri_plugin_opener::OpenerExt;
                let _ = app_handle.opener().open_url(target_url, None::<&str>);
                let _ = app_handle.emit("show-toast", "Opening download in your browser...");
            }
            None => {
                let _ = app_handle.emit("show-toast", "Blocked invalid external link.");
            }
        }

        return false;
    }

    true
}

#[cfg(test)]
mod tests {
    use super::{badge_update_event_payload, validated_external_open_target};

    #[test]
    fn badge_update_event_payload_normalizes_reported_badges() {
        assert_eq!(
            badge_update_event_payload("outlook", "count:7"),
            Some("outlook:7".to_string())
        );
        assert_eq!(
            badge_update_event_payload("outlook", "unknown"),
            Some("outlook:-1".to_string())
        );
        assert_eq!(
            badge_update_event_payload("outlook", "clear"),
            Some("outlook:0".to_string())
        );
        assert_eq!(badge_update_event_payload("outlook", "bogus"), None);
    }

    #[test]
    fn validated_external_open_target_allows_normal_http_urls() {
        assert_eq!(
            validated_external_open_target("https://github.com/adiwidia-dev/ferx/releases"),
            Some("https://github.com/adiwidia-dev/ferx/releases".to_string())
        );
        assert_eq!(
            validated_external_open_target("http://example.com/download.dmg"),
            Some("http://example.com/download.dmg".to_string())
        );
    }

    #[test]
    fn validated_external_open_target_rejects_unsafe_urls() {
        assert_eq!(validated_external_open_target("javascript:alert(1)"), None);
        assert_eq!(validated_external_open_target("file:///tmp/app.dmg"), None);
        assert_eq!(
            validated_external_open_target("https://user:pass@example.com/private"),
            None
        );
        assert_eq!(validated_external_open_target("https://"), None);
    }
}
