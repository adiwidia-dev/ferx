pub(crate) fn badge_engine_script(strategy_name: &str) -> String {
    include_str!("../scripts/badge_engine.js").replace("__FERX_STRATEGY__", strategy_name)
}

pub(crate) fn outlook_badge_engine_script() -> String {
    format!(
        "{}\n{}",
        badge_engine_runtime_script(),
        include_str!("../scripts/outlook_badge_engine.js"),
    )
}

pub(crate) fn teams_badge_engine_script() -> String {
    format!(
        "{}\n{}",
        badge_engine_runtime_script(),
        include_str!("../scripts/teams_badge_engine.js"),
    )
}

pub(crate) fn telegram_badge_engine_script() -> String {
    format!(
        "{}\n{}",
        badge_engine_runtime_script(),
        include_str!("../scripts/telegram_badge_engine.js"),
    )
}

pub(crate) fn google_chat_badge_engine_script() -> String {
    format!(
        "{}\n{}",
        badge_engine_runtime_script(),
        include_str!("../scripts/google_chat_badge_engine.js"),
    )
}

pub(crate) fn whatsapp_badge_engine_script() -> String {
    format!(
        "{}\n{}",
        badge_engine_runtime_script(),
        include_str!("../scripts/whatsapp_badge_engine.js"),
    )
}

pub(crate) fn badge_engine_scaffold_script() -> String {
    include_str!("../scripts/badge_engine_scaffold.js").to_owned()
}

pub(crate) fn badge_engine_utils_script() -> String {
    include_str!("../scripts/badge_engine_utils.js").to_owned()
}

fn badge_engine_runtime_script() -> String {
    format!(
        "{}\n{}",
        badge_engine_utils_script(),
        badge_engine_scaffold_script(),
    )
}
