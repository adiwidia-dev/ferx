pub(crate) fn badge_engine_script(strategy_name: &str) -> String {
    include_str!("../scripts/badge_engine.js").replace("__FERX_STRATEGY__", strategy_name)
}

pub(crate) fn outlook_badge_engine_script(strategy_name: &str) -> String {
    include_str!("../scripts/outlook_badge_engine.js").replace("__FERX_STRATEGY__", strategy_name)
}

pub(crate) fn teams_badge_engine_script() -> String {
    include_str!("../scripts/teams_badge_engine.js").to_owned()
}

pub(crate) fn telegram_badge_engine_script() -> String {
    include_str!("../scripts/telegram_badge_engine.js").to_owned()
}
