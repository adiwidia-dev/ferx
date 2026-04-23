use crate::service_runtime::{
    extract_hostname, hostname_matches, microsoft_service_kind, MicrosoftServiceKind,
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

fn google_auth_compat_script() -> &'static str {
    r#"
    (function() {
        document.addEventListener('securitypolicyviolation', function(e) {
            if (e.blockedURI && (e.blockedURI.indexOf('ipc:') !== -1 || e.blockedURI.indexOf('tauri:') !== -1)) {
                e.stopImmediatePropagation();
            }
        }, true);

        try {
            Object.defineProperty(window, 'webkit', {
                value: Object.create(null),
                configurable: true,
                writable: true
            });
        } catch(_) {
            try {
                Object.defineProperty(window.webkit, 'messageHandlers', {
                    value: undefined,
                    configurable: true,
                    writable: true
                });
            } catch(_) {}
        }

        try { Object.defineProperty(navigator, 'vendor', { get: function() { return 'Google Inc.'; }, configurable: true }); } catch(_) {}
        try { Object.defineProperty(navigator, 'webdriver', { get: function() { return false; }, configurable: true }); } catch(_) {}
        try { Object.defineProperty(navigator, 'pdfViewerEnabled', { get: function() { return true; }, configurable: true }); } catch(_) {}

        var pluginNames = ['PDF Viewer','Chrome PDF Viewer','Chromium PDF Viewer','Microsoft Edge PDF Viewer','WebKit built-in PDF'];
        var fakePlugins = { length: pluginNames.length, item: function(i) { return this[i] || null; }, namedItem: function(n) { for (var i = 0; i < this.length; i++) { if (this[i] && this[i].name === n) return this[i]; } return null; }, refresh: function() {} };
        for (var i = 0; i < pluginNames.length; i++) fakePlugins[i] = Object.freeze({ name: pluginNames[i], filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 });
        try { Object.defineProperty(navigator, 'plugins', { get: function() { return fakePlugins; }, configurable: true }); } catch(_) {}
        try { Object.defineProperty(navigator, 'mimeTypes', { get: function() { var m = { length: 1, item: function(i) { return this[i]||null; }, namedItem: function(n) { return this[0] && this[0].type===n ? this[0] : null; } }; m[0] = { type:'application/pdf', suffixes:'pdf', description:'Portable Document Format' }; return m; }, configurable: true }); } catch(_) {}

        if (!window.chrome) {
            try {
                Object.defineProperty(window, 'chrome', {
                    value: { app: { isInstalled: false, InstallState: {DISABLED:'disabled',INSTALLED:'installed',NOT_INSTALLED:'not_installed'}, RunningState: {CANNOT_RUN:'cannot_run',READY_TO_RUN:'ready_to_run',RUNNING:'running'} }, runtime: { OnInstalledReason:{CHROME_UPDATE:'chrome_update',INSTALL:'install',SHARED_MODULE_UPDATE:'shared_module_update',UPDATE:'update'}, OnRestartRequiredReason:{APP_UPDATE:'app_update',OS_UPDATE:'os_update',PERIODIC:'periodic'}, PlatformArch:{ARM:'arm',ARM64:'arm64',X86_32:'x86-32',X86_64:'x86-64'}, PlatformOs:{ANDROID:'android',CROS:'cros',LINUX:'linux',MAC:'mac',WIN:'win'}, RequestUpdateCheckStatus:{NO_UPDATE:'no_update',THROTTLED:'throttled',UPDATE_AVAILABLE:'update_available'} }, csi: function(){return {};}, loadTimes: function(){return {};} },
                    writable: true, configurable: true
                });
            } catch(_) {}
        }

        if (!navigator.userAgentData) {
            var isMac = !(navigator.platform && navigator.platform.startsWith('Win'));
            var brands = Object.freeze([
                Object.freeze({ brand: 'Google Chrome', version: '135' }),
                Object.freeze({ brand: 'Not-A.Brand', version: '8' }),
                Object.freeze({ brand: 'Chromium', version: '135' })
            ]);
            try {
                Object.defineProperty(navigator, 'userAgentData', {
                    value: Object.freeze({
                        brands: brands, mobile: false,
                        platform: isMac ? 'macOS' : 'Windows',
                        getHighEntropyValues: function() {
                            return Promise.resolve({ brands: brands, mobile: false,
                                platform: isMac ? 'macOS' : 'Windows', platformVersion: isMac ? '15.0.0' : '10.0.0',
                                architecture: isMac ? 'arm' : 'x86', model: '', uaFullVersion: '135.0.0.0',
                                fullVersionList: [{ brand: 'Google Chrome', version: '135.0.0.0' }, { brand: 'Chromium', version: '135.0.0.0' }]
                            });
                        },
                        toJSON: function() { return { brands: brands, mobile: false, platform: isMac ? 'macOS' : 'Windows' }; }
                    }),
                    configurable: true, enumerable: true
                });
            } catch(_) {}
        }

        window.addEventListener('unhandledrejection', function(e) {
            if (e.reason && String(e.reason).indexOf('messageHandlers') !== -1) {
                e.preventDefault();
            }
        });
    })();
"#
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

fn spellcheck_script(spell_check_enabled: bool) -> &'static str {
    if spell_check_enabled {
        "window.__ferxSpellcheckEnabled = true;\n"
    } else {
        r#"
    (() => {
        window.__ferxSpellcheckEnabled = false;
        if (window.__ferx_spellcheck_control_active) return;
        window.__ferx_spellcheck_control_active = true;

        const isEditable = (element) =>
            element instanceof HTMLElement &&
            (element.matches('input, textarea, [contenteditable], [role="textbox"]'));

        const disableSpellcheck = (element) => {
            if (!(element instanceof HTMLElement)) return;
            if (isEditable(element)) {
                if (element.getAttribute('spellcheck') === 'false' && element.getAttribute('autocorrect') === 'off') {
                    return;
                }
                element.spellcheck = false;
                element.setAttribute('spellcheck', 'false');
                element.setAttribute('autocorrect', 'off');
            }

            element.querySelectorAll('input, textarea, [contenteditable], [role="textbox"]').forEach((child) => {
                if (!(child instanceof HTMLElement)) return;
                if (child.getAttribute('spellcheck') === 'false' && child.getAttribute('autocorrect') === 'off') {
                    return;
                }
                child.spellcheck = false;
                child.setAttribute('spellcheck', 'false');
                child.setAttribute('autocorrect', 'off');
            });
        };

        const scanVisibleEditors = () => {
            if (document.documentElement instanceof HTMLElement) {
                disableSpellcheck(document.documentElement);
            }
        };

        const scheduleInitialScan = () => {
            const run = () => scanVisibleEditors();
            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(run, { timeout: 1500 });
            } else {
                window.setTimeout(run, 250);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', scheduleInitialScan, { once: true });
        } else {
            scheduleInitialScan();
        }

        document.addEventListener('focusin', (event) => {
            disableSpellcheck(event.target);
        }, true);
    })();
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

        if (window.__ferx_badge_observers_active) return;
        window.__ferx_badge_observers_active = true;

        window.__ferx_badge_strategy = '{strategy_name}';
        window.__ferx_last_badge_state = '__ferx:init__';
        window.__ferx_badge_dom_timer = window.__ferx_badge_dom_timer || null;
        window.__ferx_badge_monitoring_enabled = window.__ferx_badge_monitoring_enabled ?? true;

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
            if (!window.__ferx_badge_monitoring_enabled) return;
            try {{
                emitBadgeState(strategy.readState());
            }} catch (error) {{
                emitBadgeState('clear');
            }}
        }};
        const scheduleDomEvaluation = () => {{
            if (!strategy.needsDomObservation) return;
            if (!window.__ferx_badge_monitoring_enabled) return;
            if (window.__ferx_badge_dom_timer) clearTimeout(window.__ferx_badge_dom_timer);
            window.__ferx_badge_dom_timer = window.setTimeout(() => {{
                window.__ferx_badge_dom_timer = null;
                evaluateBadgeState();
            }}, 150);
        }};

        const observeTitle = () => {{
            const bindTitleObserver = () => {{
                const titleEl = document.querySelector('title');
                if (!titleEl || titleEl.__ferx_title_observer_bound) return false;

                titleEl.__ferx_title_observer_bound = true;
                new MutationObserver(() => {{
                    if (!window.__ferx_badge_monitoring_enabled) return;
                    evaluateBadgeState();
                }}).observe(titleEl, {{
                    childList: true,
                    subtree: true,
                    characterData: true
                }});
                return true;
            }};

            bindTitleObserver();

            const head = document.head || document.documentElement;
            if (!head) return;

            new MutationObserver(() => {{
                const didBind = bindTitleObserver();
                if (!didBind) return;
                if (!window.__ferx_badge_monitoring_enabled) return;
                evaluateBadgeState();
            }}).observe(head, {{
                childList: true
            }});
        }};

        const observeDom = () => {{
            if (!strategy.needsDomObservation) return;

            const target = document.body || document.documentElement;
            if (!target) return;

            new MutationObserver(() => {{
                if (!window.__ferx_badge_monitoring_enabled) return;
                scheduleDomEvaluation();
            }}).observe(target, {{
                childList: true,
                subtree: true,
                characterData: true
            }});
        }};

        window.__ferxSetBadgeMonitoring = (enabled) => {{
            window.__ferx_badge_monitoring_enabled = enabled;
            if (window.__ferx_badge_dom_timer) {{
                clearTimeout(window.__ferx_badge_dom_timer);
                window.__ferx_badge_dom_timer = null;
            }}

            if (!enabled) return;
            evaluateBadgeState();
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

        window.addEventListener('focus', () => {{
            if (!window.__ferx_badge_monitoring_enabled) return;
            evaluateBadgeState();
        }});
        window.addEventListener('hashchange', () => {{
            if (!window.__ferx_badge_monitoring_enabled) return;
            evaluateBadgeState();
        }});
        window.addEventListener('popstate', () => {{
            if (!window.__ferx_badge_monitoring_enabled) return;
            evaluateBadgeState();
        }});
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

        if (window.__ferx_badge_observers_active) return;
        window.__ferx_badge_observers_active = true;

        window.__ferx_badge_strategy = '{strategy_name}';
        window.__ferx_last_badge_state = '__ferx:init__';
        window.__ferx_badge_dom_timer = window.__ferx_badge_dom_timer || null;
        window.__ferx_badge_monitoring_enabled = window.__ferx_badge_monitoring_enabled ?? true;

        const normalizeTitle = (title) => (title || '').replace(/[\u200E\u200F\u200B-\u200D]/g, '').trim();
        const titleCountState = (title) => {{
            const normalized = normalizeTitle(title);
            const match = normalized.match(/\((\d+)\)/) || normalized.match(/\[(\d+)\]/) || normalized.match(/^(\d+)\s*(?:unread|baru|new|messages?)/i);
            if (!match) return 'clear';

            const count = parseInt(match[1], 10);
            return Number.isFinite(count) && count > 0 ? 'count:' + count : 'clear';
        }};

        const safeParseInt = (text) => {{
            const n = parseInt((text || '').trim(), 10);
            return Number.isFinite(n) && n > 0 ? n : 0;
        }};

        const outlookScreenReaderState = () => {{
            const trees = document.querySelectorAll('div[role=tree]');
            if (trees.length === 0) return null;

            for (const tree of trees) {{
                const children = tree.children;
                for (const child of children) {{
                    const childText = (child.textContent || '');
                    const lower = childText.toLowerCase();
                    if (!lower.includes('inbox') && !lower.includes('kotak masuk')) continue;

                    const srSpans = child.querySelectorAll('span.screenReaderOnly');
                    for (const sr of srSpans) {{
                        if (!sr.previousSibling) continue;
                        const count = safeParseInt(sr.previousSibling.textContent);
                        if (count > 0) return 'count:' + count;
                    }}

                    const match = childText.match(/(?:Inbox|Kotak Masuk)\D*?(\d+)/i);
                    if (match) {{
                        const count = parseInt(match[1], 10);
                        if (Number.isFinite(count) && count > 0) return 'count:' + count;
                    }}

                    return 'clear';
                }}
            }}

            return null;
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

        const emitBadgeState = async (nextState) => {{
            let payload;
            if (nextState === 'unknown') {{
                payload = 'unknown';
            }} else if (typeof nextState === 'string' && nextState.startsWith('count:')) {{
                payload = nextState;
            }} else {{
                payload = 'clear';
            }}

            if (payload === window.__ferx_last_badge_state) return;

            try {{
                await invoke('report_outlook_badge', {{ payload }});
                window.__ferx_last_badge_state = payload;
            }} catch (_e) {{
                // Swallow; next MutationObserver tick will retry.
            }}
        }};

        const evaluateBadgeState = async () => {{
            if (!window.__ferx_badge_monitoring_enabled) return;
            let nextState = 'clear';
            try {{
                // Short-circuit from cheapest to most expensive.
                nextState =
                    outlookScreenReaderState()
                    || outlookFolderState()
                    || titleCountState(document.title);
            }} catch (_error) {{
                nextState = 'clear';
            }}

            await emitBadgeState(nextState);
        }};

        const scheduleDomEvaluation = () => {{
            if (!window.__ferx_badge_monitoring_enabled) return;
            if (window.__ferx_badge_dom_timer) clearTimeout(window.__ferx_badge_dom_timer);
            window.__ferx_badge_dom_timer = window.setTimeout(() => {{
                window.__ferx_badge_dom_timer = null;
                void evaluateBadgeState();
            }}, 250);
        }};

        const observeTitle = () => {{
            const bindTitleObserver = () => {{
                const titleEl = document.querySelector('title');
                if (!titleEl || titleEl.__ferx_title_observer_bound) return false;

                titleEl.__ferx_title_observer_bound = true;
                new MutationObserver(() => {{
                    if (!window.__ferx_badge_monitoring_enabled) return;
                    void evaluateBadgeState();
                }}).observe(titleEl, {{
                    childList: true,
                    subtree: true,
                    characterData: true
                }});
                return true;
            }};

            bindTitleObserver();

            const head = document.head || document.documentElement;
            if (!head) return;

            new MutationObserver(() => {{
                const didBind = bindTitleObserver();
                if (!didBind) return;
                if (!window.__ferx_badge_monitoring_enabled) return;
                void evaluateBadgeState();
            }}).observe(head, {{
                childList: true
            }});
        }};

        const observeDom = () => {{
            const target = document.body || document.documentElement;
            if (!target) return;

            new MutationObserver(() => {{
                if (!window.__ferx_badge_monitoring_enabled) return;
                scheduleDomEvaluation();
            }}).observe(target, {{
                childList: true,
                subtree: true,
                characterData: true
            }});
        }};

        window.__ferxSetBadgeMonitoring = (enabled) => {{
            window.__ferx_badge_monitoring_enabled = enabled;
            if (window.__ferx_badge_dom_timer) {{
                clearTimeout(window.__ferx_badge_dom_timer);
                window.__ferx_badge_dom_timer = null;
            }}

            if (!enabled) return;
            void evaluateBadgeState();
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
            if (!window.__ferx_badge_monitoring_enabled) return;
            void evaluateBadgeState();
        }});
        window.addEventListener('hashchange', () => {{
            if (!window.__ferx_badge_monitoring_enabled) return;
            void evaluateBadgeState();
        }});
        window.addEventListener('popstate', () => {{
            if (!window.__ferx_badge_monitoring_enabled) return;
            void evaluateBadgeState();
        }});
    }})();
"#
    )
}

fn teams_badge_engine_script() -> String {
    r#"
    (() => {
        const invoke = window.__TAURI_INTERNALS__?.invoke;
        if (typeof invoke !== 'function') return;

        if (window.__ferx_badge_observers_active) return;
        window.__ferx_badge_observers_active = true;

        window.__ferx_last_badge_state = '__ferx:init__';
        window.__ferx_badge_dom_timer = null;
        window.__ferx_badge_monitoring_enabled = window.__ferx_badge_monitoring_enabled ?? true;

        const safeParseInt = (text) => {
            const n = parseInt((text || '').trim(), 10);
            return Number.isFinite(n) && n > 0 ? n : 0;
        };

        const normalizeTitle = (title) => (title || '').replace(/[\u200E\u200F\u200B-\u200D]/g, '').trim();

        const titleCountState = (title) => {
            const normalized = normalizeTitle(title);
            const match = normalized.match(/\((\d+)\)/) || normalized.match(/\[(\d+)\]/);
            if (!match) return null;

            const count = parseInt(match[1], 10);
            return Number.isFinite(count) && count > 0 ? count : null;
        };

        const teamsDomState = () => {
            let total = 0;

            const fuiBadges = document.querySelectorAll('.fui-Badge');
            for (const badge of fuiBadges) {
                total += safeParseInt(badge.textContent);
            }

            if (total > 0) return 'count:' + total;

            const legacyBadges = document.querySelectorAll(
                '.activity-badge.dot-activity-badge .activity-badge'
            );
            for (const badge of legacyBadges) {
                total += safeParseInt(badge.textContent);
            }

            if (total > 0) return 'count:' + total;

            return null;
        };

        const readState = () => {
            const domState = teamsDomState();
            if (domState) return domState;

            const titleState = titleCountState(document.title);
            if (titleState) return 'count:' + titleState;

            return 'clear';
        };

        const emitBadgeState = async (nextState) => {
            const payload = (typeof nextState === 'string' && nextState.startsWith('count:'))
                ? nextState
                : 'clear';

            if (payload === window.__ferx_last_badge_state) return;

            try {
                await invoke('report_teams_badge', { payload });
                window.__ferx_last_badge_state = payload;
            } catch (_e) {
                // Swallow; the next observer tick will retry.
            }
        };

        const evaluateBadgeState = async () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            try {
                await emitBadgeState(readState());
            } catch (_error) {
                await emitBadgeState('clear');
            }
        };

        const scheduleDomEvaluation = () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            if (window.__ferx_badge_dom_timer) clearTimeout(window.__ferx_badge_dom_timer);
            window.__ferx_badge_dom_timer = setTimeout(() => {
                window.__ferx_badge_dom_timer = null;
                void evaluateBadgeState();
            }, 250);
        };

        const observeTitle = () => {
            const bindTitleObserver = () => {
                const titleEl = document.querySelector('title');
                if (!titleEl || titleEl.__ferx_title_observer_bound) return false;

                titleEl.__ferx_title_observer_bound = true;
                new MutationObserver(() => {
                    if (!window.__ferx_badge_monitoring_enabled) return;
                    void evaluateBadgeState();
                }).observe(titleEl, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
                return true;
            };

            bindTitleObserver();

            const head = document.head || document.documentElement;
            if (!head) return;

            new MutationObserver(() => {
                const didBind = bindTitleObserver();
                if (!didBind) return;
                if (!window.__ferx_badge_monitoring_enabled) return;
                void evaluateBadgeState();
            }).observe(head, {
                childList: true
            });
        };

        const observeDom = () => {
            const target = document.body || document.documentElement;
            if (!target) return;

            new MutationObserver(() => {
                if (!window.__ferx_badge_monitoring_enabled) return;
                scheduleDomEvaluation();
            }).observe(target, {
                childList: true,
                subtree: true,
                characterData: true
            });
        };

        window.__ferxSetBadgeMonitoring = (enabled) => {
            window.__ferx_badge_monitoring_enabled = enabled;
            if (window.__ferx_badge_dom_timer) {
                clearTimeout(window.__ferx_badge_dom_timer);
                window.__ferx_badge_dom_timer = null;
            }

            if (!enabled) return;
            void evaluateBadgeState();
        };

        const start = () => {
            observeTitle();
            observeDom();
            void evaluateBadgeState();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }

        window.addEventListener('focus', () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            void evaluateBadgeState();
        });
        window.addEventListener('hashchange', () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            void evaluateBadgeState();
        });
        window.addEventListener('popstate', () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            void evaluateBadgeState();
        });
    })();
"#.to_string()
}

fn injected_js_for_url(url: &str, allow_notifications: bool, spell_check_enabled: bool) -> String {
    let strategy_name = crate::badge_strategy_for_url(url);
    let microsoft_service = microsoft_service_kind(url);
    let google_compat = if is_google_service(url) {
        google_auth_compat_script()
    } else {
        ""
    };

    format!(
        "{}{}{}{}{}",
        google_compat,
        if should_skip_notification_shim(url) {
            ""
        } else {
            notification_script(allow_notifications)
        },
        spellcheck_script(spell_check_enabled),
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
    injected_js_for_url("", allow_notifications, true)
}

#[cfg(test)]
pub(crate) fn service_webview_setup(
    url: &str,
    allow_notifications: bool,
) -> Option<(tauri::WebviewUrl, String)> {
    service_webview_setup_with_spellcheck(url, allow_notifications, true)
}

pub(crate) fn service_webview_setup_with_spellcheck(
    url: &str,
    allow_notifications: bool,
    spell_check_enabled: bool,
) -> Option<(tauri::WebviewUrl, String)> {
    Some((
        external_webview_url(url)?,
        injected_js_for_url(url, allow_notifications, spell_check_enabled),
    ))
}
