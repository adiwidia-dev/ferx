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
