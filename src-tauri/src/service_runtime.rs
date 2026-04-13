pub(crate) fn extract_hostname(url: &str) -> Option<&str> {
    let remainder = url.split_once("://")?.1;
    let host_port = remainder.split(['/', '?', '#']).next()?;
    let host_port = host_port.rsplit('@').next().unwrap_or(host_port);

    if host_port.is_empty() {
        return None;
    }

    Some(host_port.split(':').next().unwrap_or(host_port))
}

pub(crate) fn hostname_matches(hostname: &str, expected_host: &str) -> bool {
    hostname == expected_host || hostname.ends_with(&format!(".{expected_host}"))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MicrosoftServiceKind {
    Outlook,
    Teams,
}

pub(crate) fn microsoft_service_kind(url: &str) -> Option<MicrosoftServiceKind> {
    let hostname = extract_hostname(url)?.to_ascii_lowercase();

    if matches!(
        hostname.as_str(),
        "outlook.office.com" | "outlook.live.com" | "office.com" | "www.office.com"
    ) {
        Some(MicrosoftServiceKind::Outlook)
    } else if hostname_matches(&hostname, "teams.microsoft.com")
        || hostname_matches(&hostname, "teams.cloud.microsoft")
    {
        Some(MicrosoftServiceKind::Teams)
    } else {
        None
    }
}
