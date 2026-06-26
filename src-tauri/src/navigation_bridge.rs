use crate::badge_payload::{parse_badge_payload, BadgePayload};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

const NOTIFICATION_PREVIEW_MAX_DATA_BYTES: usize = 4096;
const NOTIFICATION_PREVIEW_MAX_TITLE_CHARS: usize = 120;
const NOTIFICATION_PREVIEW_MAX_BODY_CHARS: usize = 240;
const NOTIFICATION_PREVIEW_MAX_TAG_CHARS: usize = 120;

#[derive(Debug, Deserialize)]
struct RawNotificationPreviewPayload {
    title: String,
    body: String,
    tag: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeNotificationPreviewEventPayload {
    pub(crate) service_id: String,
    pub(crate) title: String,
    pub(crate) body: String,
    pub(crate) tag: Option<String>,
}

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
        if let Err(e) = app.emit("update-badge", event_payload) {
            eprintln!("update-badge emit failed for {label}: {e}");
        }
    }
}

fn normalize_preview_text(value: &str, max_chars: usize) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max_chars)
        .collect()
}

pub(crate) fn native_notification_preview_event_payload(
    service_id: &str,
    data: &str,
) -> Option<NativeNotificationPreviewEventPayload> {
    if service_id.is_empty() || data.len() > NOTIFICATION_PREVIEW_MAX_DATA_BYTES {
        return None;
    }

    let raw: RawNotificationPreviewPayload = serde_json::from_str(data).ok()?;
    let title = normalize_preview_text(&raw.title, NOTIFICATION_PREVIEW_MAX_TITLE_CHARS);
    let body = normalize_preview_text(&raw.body, NOTIFICATION_PREVIEW_MAX_BODY_CHARS);
    let tag = raw
        .tag
        .map(|value| normalize_preview_text(&value, NOTIFICATION_PREVIEW_MAX_TAG_CHARS))
        .filter(|value| !value.is_empty());

    if title.is_empty() && body.is_empty() {
        return None;
    }

    Some(NativeNotificationPreviewEventPayload {
        service_id: service_id.to_string(),
        title,
        body,
        tag,
    })
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

    if url.host_str() == Some("ferx.resource") {
        if let Some(data) = url
            .query_pairs()
            .find(|(k, _)| k == "data")
            .map(|(_, v)| v.into_owned())
        {
            if let Err(e) =
                app_handle.emit("resource-usage-update", format!("{}:{}", service_id, data))
            {
                eprintln!("resource-usage-update emit failed for {service_id}: {e}");
            }
        }
        return false;
    }

    if url.host_str() == Some("ferx.notification") {
        if let Some(data) = url
            .query_pairs()
            .find(|(k, _)| k == "data")
            .map(|(_, v)| v.into_owned())
        {
            if let Some(payload) = native_notification_preview_event_payload(service_id, &data) {
                if let Err(e) = app_handle.emit("native-notification-preview", payload) {
                    eprintln!("native-notification-preview emit failed for {service_id}: {e}");
                }
            }
        }
        return false;
    }

    if url.host_str() == Some("ferx.shortcut") {
        if let Some(key_str) = url.path().strip_prefix('/') {
            if let Err(e) = app_handle.emit("switch-shortcut", key_str) {
                eprintln!("switch-shortcut emit failed: {e}");
            }
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
    use super::{
        badge_update_event_payload, native_notification_preview_event_payload,
        validated_external_open_target,
    };

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
    fn native_notification_preview_event_payload_accepts_valid_data() {
        assert_eq!(
            native_notification_preview_event_payload(
                "messenger",
                r#"{"title":"Jane Doe","body":"Can you check this?","tag":"thread-123"}"#,
            ),
            Some(super::NativeNotificationPreviewEventPayload {
                service_id: "messenger".to_string(),
                title: "Jane Doe".to_string(),
                body: "Can you check this?".to_string(),
                tag: Some("thread-123".to_string()),
            })
        );
    }

    #[test]
    fn native_notification_preview_event_payload_rejects_empty_or_malformed_data() {
        assert_eq!(
            native_notification_preview_event_payload("", r#"{"title":"Jane"}"#),
            None
        );
        assert_eq!(
            native_notification_preview_event_payload("messenger", r#"{"title":"","body":""}"#),
            None
        );
        assert_eq!(
            native_notification_preview_event_payload("messenger", "not-json"),
            None
        );
        assert_eq!(
            native_notification_preview_event_payload("messenger", r#"{"title":42,"body":""}"#),
            None
        );
    }

    #[test]
    fn native_notification_preview_event_payload_normalizes_and_truncates_text() {
        let long_body = "x".repeat(260);
        let raw = format!(
            r#"{{"title":"  Jane\nDoe  ","body":"{}","tag":"  thread\n123  "}}"#,
            long_body
        );
        let payload = native_notification_preview_event_payload("messenger", &raw)
            .expect("expected preview payload");

        assert_eq!(payload.title, "Jane Doe");
        assert_eq!(payload.body.chars().count(), 240);
        assert_eq!(payload.tag, Some("thread 123".to_string()));
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
