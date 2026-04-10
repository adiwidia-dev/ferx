#[derive(Debug, PartialEq, Eq)]
pub enum BadgePayload {
    Count(i32),
    Unknown,
    Clear,
}

pub fn parse_badge_payload(input: &str) -> Option<BadgePayload> {
    match input {
        "unknown" => Some(BadgePayload::Unknown),
        "clear" => Some(BadgePayload::Clear),
        _ => input
            .strip_prefix("count:")
            .and_then(|value| value.parse::<i32>().ok())
            .filter(|count| *count >= 0)
            .map(BadgePayload::Count),
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_badge_payload, BadgePayload};

    #[test]
    fn parses_count_payloads() {
        assert_eq!(parse_badge_payload("count:5"), Some(BadgePayload::Count(5)));
    }

    #[test]
    fn parses_unknown_payloads() {
        assert_eq!(parse_badge_payload("unknown"), Some(BadgePayload::Unknown));
    }

    #[test]
    fn parses_clear_payloads() {
        assert_eq!(parse_badge_payload("clear"), Some(BadgePayload::Clear));
    }

    #[test]
    fn rejects_malformed_payloads() {
        assert_eq!(parse_badge_payload("count:-1"), None);
        assert_eq!(parse_badge_payload("bogus"), None);
    }
}
