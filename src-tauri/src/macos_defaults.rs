use objc2_foundation::{ns_string, NSUserDefaults};

#[cfg(test)]
const PRESS_AND_HOLD_DEFAULT_KEY: &str = "ApplePressAndHoldEnabled";

pub(crate) fn disable_press_and_hold_key_popup() {
    let defaults = NSUserDefaults::standardUserDefaults();
    defaults.setBool_forKey(false, ns_string!("ApplePressAndHoldEnabled"));
}

#[cfg(test)]
pub(crate) fn press_and_hold_key_popup_enabled() -> bool {
    let defaults = NSUserDefaults::standardUserDefaults();
    defaults.boolForKey(ns_string!("ApplePressAndHoldEnabled"))
}

#[cfg(test)]
mod tests {
    #[test]
    fn runtime_default_key_matches_plist_key() {
        assert_eq!(super::PRESS_AND_HOLD_DEFAULT_KEY, "ApplePressAndHoldEnabled");
    }
}
