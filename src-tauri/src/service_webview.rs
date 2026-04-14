use crate::service_runtime::{
    extract_hostname, hostname_matches, microsoft_service_kind, MicrosoftServiceKind,
};

pub(crate) fn external_webview_url(raw: &str) -> Option<tauri::WebviewUrl> {
    raw.parse().ok().map(tauri::WebviewUrl::External)
}

const SPOOFED_CHROME_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const TEAMS_EDGE_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0";

fn is_teams_service(url: &str) -> bool {
    let hostname = extract_hostname(url)
        .unwrap_or_default()
        .to_ascii_lowercase();

    hostname_matches(&hostname, "teams.microsoft.com")
        || hostname_matches(&hostname, "teams.cloud.microsoft")
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

fn notification_script(allow_notifications: bool) -> &'static str {
    if allow_notifications {
        r#"
    const mockNotification = Object.assign(function(title, options) {}, {
        permission: 'granted',
        requestPermission: () => Promise.resolve('granted')
    });
    Object.defineProperty(window, 'Notification', { value: mockNotification, writable: true, configurable: true });

    if (window.navigator && window.navigator.permissions) {
        const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
        window.navigator.permissions.query = (params) => {
            if (params && params.name === 'notifications') return Promise.resolve({ state: 'granted', onchange: null });
            return originalQuery(params);
        };
    }
"#
    } else {
        r#"
    const deniedNotification = Object.assign(function() {
        throw new Error('Notifications are disabled for this service');
    }, {
        permission: 'denied',
        requestPermission: () => Promise.resolve('denied')
    });
    Object.defineProperty(window, 'Notification', { value: deniedNotification, writable: true, configurable: true });

    if (window.navigator && window.navigator.permissions) {
        const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
        window.navigator.permissions.query = (params) => {
            if (params && params.name === 'notifications') return Promise.resolve({ state: 'denied', onchange: null });
            return originalQuery(params);
        };
    }
"#
    }
}

fn common_webview_script() -> &'static str {
    r#"
    document.addEventListener('click', (e) => {
        let a = e.target.closest('a');
        if (a && a.href && a.href.startsWith('http') && (a.hasAttribute('download') || a.target === '_blank')) {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = 'https://ferx.download/?url=' + encodeURIComponent(a.href);
        }
    }, true);

    window.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
            const key = parseInt(e.key);
            if (!isNaN(key) && key >= 1 && key <= 9) {
                e.preventDefault();
                window.location.href = 'https://ferx.shortcut/' + key;
            }
        }
    });
"#
}

fn badge_engine_script(strategy_name: &str) -> String {
    format!(
        r#"
    (() => {{
        const invoke = window.__TAURI_INTERNALS__?.invoke;
        if (typeof invoke !== 'function') return;

        window.__ferx_badge_strategy = '{strategy_name}';
        window.__ferx_last_badge_state = window.__ferx_last_badge_state || '__ferx:init__';
        window.__ferx_badge_dom_timer = window.__ferx_badge_dom_timer || null;

        const normalizeTitle = (title) => (title || '').replace(/[\u200E\u200F\u200B-\u200D]/g, '').trim();
        const unsupportedTitleState = (title) => {{
            const normalized = normalizeTitle(title);
            const match = normalized.match(/\((\d+)\)/) || normalized.match(/\[(\d+)\]/);
            if (!match) return 'clear';

            const count = parseInt(match[1], 10);
            if (!Number.isFinite(count) || count <= 0) return 'clear';

            return 'count:' + count;
        }};

        const titleCountState = (title) => {{
            const normalized = normalizeTitle(title);
            const match = normalized.match(/\((\d+)\)/) || normalized.match(/\[(\d+)\]/) || normalized.match(/^(\d+)\s*(?:unread|baru|new|messages?)/i);
            if (!match) return 'clear';

            const count = parseInt(match[1], 10);
            if (!Number.isFinite(count) || count <= 0) return 'clear';

            return 'count:' + count;
        }};

        const parseFolderCount = (text, label) => {{
            const collapsed = (text || '').replace(/\s+/g, ' ').trim();
            const escapedLabel = label.replace(/[.*+?^${{}}()|[\]\\]/g, '\\$&');
            const match = collapsed.match(new RegExp('(?:^|\\b)' + escapedLabel + '\\s*(\\d+)(?:\\b|$)', 'i'));
            if (!match) return null;

            const count = parseInt(match[1], 10);
            return Number.isFinite(count) && count > 0 ? count : 0;
        }};

        const parseLooseFolderCount = (text, label) => {{
            const collapsed = (text || '').replace(/\s+/g, ' ').trim();
            const escapedLabel = label.replace(/[.*+?^${{}}()|[\]\\]/g, '\\$&');
            const match = collapsed.match(new RegExp(escapedLabel + '.*?(\\d+)', 'i'))
                || collapsed.match(new RegExp('(\\d+).*?' + escapedLabel, 'i'));
            if (!match) return null;

            const count = parseInt(match[1], 10);
            return Number.isFinite(count) && count > 0 ? count : 0;
        }};

        const parseUnreadCount = (text, label) => {{
            const collapsed = (text || '').replace(/\s+/g, ' ').trim();
            const escapedLabel = label.replace(/[.*+?^${{}}()|[\]\\]/g, '\\$&');
            const match = collapsed.match(new RegExp(escapedLabel + '.*?\\((\\d+)\\s*unread\\)', 'i'))
                || collapsed.match(new RegExp(escapedLabel + '.*?(\\d+)\\s*unread', 'i'))
                || collapsed.match(new RegExp('(\\d+)\\s*unread.*?' + escapedLabel, 'i'));
            if (!match) return null;

            const count = parseInt(match[1], 10);
            return Number.isFinite(count) && count > 0 ? count : 0;
        }};

        const parseLooseFolderCount = (text, label) => {{
            const collapsed = (text || '').replace(/\s+/g, ' ').trim();
            const escapedLabel = label.replace(/[.*+?^${{}}()|[\]\\]/g, '\\$&');
            const match = collapsed.match(new RegExp(escapedLabel + '.*?(\\d+)', 'i'))
                || collapsed.match(new RegExp('(\\d+).*?' + escapedLabel, 'i'));
            if (!match) return null;

            const count = parseInt(match[1], 10);
            return Number.isFinite(count) && count > 0 ? count : 0;
        }};

        const parseUnreadCount = (text, label) => {{
            const collapsed = (text || '').replace(/\s+/g, ' ').trim();
            const escapedLabel = label.replace(/[.*+?^${{}}()|[\]\\]/g, '\\$&');
            const match = collapsed.match(new RegExp(escapedLabel + '.*?\\((\\d+)\\s*unread\\)', 'i'))
                || collapsed.match(new RegExp(escapedLabel + '.*?(\\d+)\\s*unread', 'i'))
                || collapsed.match(new RegExp('(\\d+)\\s*unread.*?' + escapedLabel, 'i'));
            if (!match) return null;

            const count = parseInt(match[1], 10);
            return Number.isFinite(count) && count > 0 ? count : 0;
        }};

        const isVisibleNode = (node) => {{
            if (!node || typeof node.getBoundingClientRect !== 'function') return false;
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        }};

        const outlookFolderState = () => {{
            const rows = Array.from(document.querySelectorAll('[role="treeitem"], [role="option"]'));
            let bestCount = null;
            for (const row of rows) {{
                if (!isVisibleNode(row)) continue;

                const text = (row.innerText || row.textContent || '').trim();
                if (!text) continue;

                const lower = text.toLowerCase();
                if (!lower.includes('inbox') && !lower.includes('kotak masuk')) continue;

                const count = parseFolderCount(text, 'Inbox') ?? parseFolderCount(text, 'Kotak Masuk');
                if (count === null) continue;

                bestCount = Math.max(bestCount || 0, count);
            }}

            if (bestCount === null) return null;
            return bestCount > 0 ? 'count:' + bestCount : 'clear';
        }};

        const strategies = {{
            'unsupported': {{
                needsDomObservation: false,
                readState: () => unsupportedTitleState(document.title)
            }},
            'teams-title': {{
                needsDomObservation: false,
                readState: () => titleCountState(document.title)
            }},
            'whatsapp-title': {{
                needsDomObservation: false,
                readState: () => titleCountState(document.title)
            }},
            'outlook-folder-dom': {{
                needsDomObservation: true,
                readState: () => outlookFolderState() || titleCountState(document.title)
            }}
        }};

        const strategy = strategies[window.__ferx_badge_strategy] || strategies['unsupported'];
        const emitBadgeState = (nextState) => {{
            let payload = nextState;
            if (payload === 'unknown') {{
                payload = 'unknown';
            }} else if (typeof payload === 'string' && payload.startsWith('count:')) {{
                const count = payload.slice(6);
                payload = 'count:' + count;
            }} else {{
                payload = 'clear';
            }}

            if (payload === window.__ferx_last_badge_state) return;

            window.__ferx_last_badge_state = payload;
            window.location.href = 'https://ferx.notify/' + payload;
        }};

        const evaluateBadgeState = () => {{
            try {{
                emitBadgeState(strategy.readState());
            }} catch (error) {{
                emitBadgeState('clear');
            }}
        }};
        const scheduleDomEvaluation = () => {{
            if (!strategy.needsDomObservation) return;
            if (window.__ferx_badge_dom_timer) clearTimeout(window.__ferx_badge_dom_timer);
            window.__ferx_badge_dom_timer = window.setTimeout(() => {{
                window.__ferx_badge_dom_timer = null;
                evaluateBadgeState();
            }}, 150);
        }};

        const observeTitle = () => {{
            const target = document.head || document.documentElement;
            if (!target) return;

            new MutationObserver(() => evaluateBadgeState()).observe(target, {{
                childList: true,
                subtree: true,
                characterData: true
            }});
        }};

        const observeDom = () => {{
            if (!strategy.needsDomObservation) return;

            const target = document.body || document.documentElement;
            if (!target) return;

            new MutationObserver(() => scheduleDomEvaluation()).observe(target, {{
                childList: true,
                subtree: true,
                characterData: true
            }});
        }};

        const start = () => {{
            observeTitle();
            observeDom();
            evaluateBadgeState();
        }};

        if (document.readyState === 'loading') {{
            document.addEventListener('DOMContentLoaded', start, {{ once: true }});
        }} else {{
            start();
        }}

        window.addEventListener('focus', evaluateBadgeState);
        window.addEventListener('hashchange', evaluateBadgeState);
        window.addEventListener('popstate', evaluateBadgeState);
    }})();
"#
    )
}

fn outlook_badge_engine_script(strategy_name: &str) -> String {
    format!(
        r#"
    (() => {{
        const invoke = window.__TAURI_INTERNALS__?.invoke;
        if (typeof invoke !== 'function') return;

        window.__ferx_badge_strategy = '{strategy_name}';
        window.__ferx_last_badge_state = window.__ferx_last_badge_state || '__ferx:init__';
        window.__ferx_badge_dom_timer = window.__ferx_badge_dom_timer || null;

        const normalizeTitle = (title) => (title || '').replace(/[\u200E\u200F\u200B-\u200D]/g, '').trim();
        const titleCountState = (title) => {{
            const normalized = normalizeTitle(title);
            const match = normalized.match(/\((\d+)\)/) || normalized.match(/\[(\d+)\]/);
            if (!match) return 'clear';

            const count = parseInt(match[1], 10);
            return Number.isFinite(count) && count > 0 ? 'count:' + count : 'clear';
        }};

        const safeParseInt = (text) => {{
            const n = parseInt((text || '').trim(), 10);
            return Number.isFinite(n) && n > 0 ? n : 0;
        }};

        const collectTreeCounts = (selector) => {{
            let count = 0;
            const el = document.querySelector(selector);
            if (!el) return 0;
            const spans = el.querySelectorAll('span.screenReaderOnly');
            for (const span of spans) {{
                if (span.previousSibling) {{
                    count += safeParseInt(span.previousSibling.textContent);
                }}
            }}
            return count;
        }};

        const outlookScreenReaderState = () => {{
            let count = collectTreeCounts('div[role=tree]:nth-child(1)');
            if (count > 0) return 'count:' + count;

            count = collectTreeCounts('div[role=tree]:nth-child(2)');
            if (count > 0) return 'count:' + count;

            const trees = document.querySelectorAll('div[role=tree]');
            let total = 0;
            for (const tree of trees) {{
                const spans = tree.querySelectorAll('span.screenReaderOnly');
                for (const span of spans) {{
                    if (span.previousSibling) {{
                        total += safeParseInt(span.previousSibling.textContent);
                    }}
                }}
            }}
            return total > 0 ? 'count:' + total : null;
        }};

        const outlookFolderState = () => {{
            const items = document.querySelectorAll('[role="treeitem"], [role="option"]');
            let bestCount = null;
            for (const item of items) {{
                const texts = [
                    item.getAttribute('aria-label'),
                    item.getAttribute('title'),
                    (item.innerText || item.textContent || ''),
                ].filter((v) => typeof v === 'string' && v.trim());

                for (const text of texts) {{
                    const lower = text.toLowerCase();
                    if (!lower.includes('inbox') && !lower.includes('kotak masuk')) continue;

                    const match = text.match(/(\d+)/);
                    if (match) {{
                        const count = parseInt(match[1], 10);
                        if (Number.isFinite(count) && count > 0) {{
                            bestCount = Math.max(bestCount || 0, count);
                        }}
                    }}
                }}
            }}
            return bestCount !== null ? 'count:' + bestCount : null;
        }};

        const outlookPageTextState = () => {{
            const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
            if (!bodyText) return null;

            const patterns = [
                /\bInbox\s+(\d+)\b/i,
                /\bKotak Masuk\s+(\d+)\b/i,
                /\bInbox\s*\((\d+)\)/i,
                /\bKotak Masuk\s*\((\d+)\)/i,
                /\bInbox\b[^.]*?(\d+)\s*unread/i,
                /\bKotak Masuk\b[^.]*?(\d+)\s*(?:belum dibaca|baru)/i,
            ];

            for (const re of patterns) {{
                const match = bodyText.match(re);
                if (match) {{
                    const count = parseInt(match[1], 10);
                    if (Number.isFinite(count) && count > 0) return 'count:' + count;
                }}
            }}

            return null;
        }};

        const emitBadgeState = async (nextState) => {{
            let payload = nextState;
            if (payload === 'unknown') {{
                payload = 'unknown';
            }} else if (typeof payload === 'string' && payload.startsWith('count:')) {{
                payload = payload;
            }} else {{
                payload = 'clear';
            }}

            if (payload === window.__ferx_last_badge_state) return;

            window.__ferx_last_badge_state = payload;
            console.info('Ferx Outlook badge payload', payload);
            await invoke('report_outlook_badge', {{ payload }});
        }};

        const evaluateBadgeState = async () => {{
            let nextState = 'clear';
            try {{
                const screenReaderState = outlookScreenReaderState();
                const folderState = outlookFolderState();
                const pageTextState = outlookPageTextState();
                const titleState = titleCountState(document.title);
                console.info('Ferx Outlook state sources', {{
                    screenReaderState,
                    folderState,
                    pageTextState,
                    titleState,
                    treesFound: document.querySelectorAll('div[role=tree]').length,
                    screenReadersFound: document.querySelectorAll('span.screenReaderOnly').length,
                }});

                nextState = screenReaderState || folderState || pageTextState || titleState;
            }} catch (_error) {{
                nextState = 'clear';
            }}

            await emitBadgeState(nextState);
        }};

        const scheduleDomEvaluation = () => {{
            if (window.__ferx_badge_dom_timer) clearTimeout(window.__ferx_badge_dom_timer);
            window.__ferx_badge_dom_timer = window.setTimeout(() => {{
                window.__ferx_badge_dom_timer = null;
                void evaluateBadgeState();
            }}, 250);
        }};

        const observeTitle = () => {{
            const target = document.head || document.documentElement;
            if (!target) return;

            new MutationObserver(() => {{
                void evaluateBadgeState();
            }}).observe(target, {{
                childList: true,
                subtree: true,
                characterData: true
            }});
        }};

        const observeDom = () => {{
            const target = document.body || document.documentElement;
            if (!target) return;

            new MutationObserver(() => scheduleDomEvaluation()).observe(target, {{
                childList: true,
                subtree: true,
                characterData: true
            }});
        }};

        const start = () => {{
            observeTitle();
            observeDom();
            void evaluateBadgeState();
        }};

        if (document.readyState === 'loading') {{
            document.addEventListener('DOMContentLoaded', start, {{ once: true }});
        }} else {{
            start();
        }}

        window.addEventListener('focus', () => {{
            void evaluateBadgeState();
        }});
        window.addEventListener('hashchange', () => {{
            void evaluateBadgeState();
        }});
        window.addEventListener('popstate', () => {{
            void evaluateBadgeState();
        }});
    }})();
"#
    )
}

fn injected_js_for_url(url: &str, allow_notifications: bool) -> String {
    let strategy_name = crate::badge_strategy_for_url(url);
    let microsoft_service = microsoft_service_kind(url);

    if matches!(microsoft_service, Some(MicrosoftServiceKind::Teams)) {
        String::new()
    } else {
        format!(
            "{}{}{}",
            if should_skip_notification_shim(url) {
                ""
            } else {
                notification_script(allow_notifications)
            },
            common_webview_script(),
            match microsoft_service {
                Some(MicrosoftServiceKind::Outlook) => outlook_badge_engine_script(strategy_name),
                Some(MicrosoftServiceKind::Teams) => String::new(),
                None => badge_engine_script(strategy_name),
            }
        )
    }
}

#[cfg(test)]
pub(crate) fn injected_js(allow_notifications: bool) -> String {
    injected_js_for_url("", allow_notifications)
}

pub(crate) fn service_webview_setup(
    url: &str,
    allow_notifications: bool,
) -> Option<(tauri::WebviewUrl, String)> {
    Some((
        external_webview_url(url)?,
        injected_js_for_url(url, allow_notifications),
    ))
}
