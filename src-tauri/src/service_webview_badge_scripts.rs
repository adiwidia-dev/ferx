pub(crate) fn badge_engine_script(strategy_name: &str) -> String {
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

pub(crate) fn outlook_badge_engine_script(strategy_name: &str) -> String {
    format!(
        r#"
    (() => {{
        if (!window.__TAURI_INTERNALS__) return;

        if (window.__ferx_badge_observers_active) return;
        window.__ferx_badge_observers_active = true;

        window.__ferx_badge_strategy = '{strategy_name}';
        window.__ferx_last_badge_state = '__ferx:init__';
        window.__ferx_badge_dom_timer = window.__ferx_badge_dom_timer || null;
        window.__ferx_badge_monitoring_enabled = window.__ferx_badge_monitoring_enabled ?? true;
        let observer = null;
        let evaluationTimer = null;
        let safetyPollTimer = null;
        const BADGE_EVALUATION_DELAY_MS = 300;
        const BADGE_SAFETY_POLL_MS = 15000;

        const observeOptions = {{
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['aria-label', 'title', 'data-testid', 'class']
        }};

        const observationSelectors = [
            '[role="tree"]',
            '[role="navigation"]',
            'nav',
            '[aria-label*="Folder"]',
            '[aria-label*="Folders"]',
            '[aria-label*="Mail"]',
            '[data-app-section="Mail"]'
        ];

        const uniqueElements = (elements) => {{
            const seen = new Set();
            return elements.filter((element) => {{
                if (!element || seen.has(element)) {{
                    return false;
                }}
                seen.add(element);
                return true;
            }});
        }};

        const resolveObservationTargets = () => {{
            const roots = uniqueElements(
                observationSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
            );

            if (roots.length > 0) {{
                return roots;
            }}

            return [document.body || document.documentElement].filter(Boolean);
        }};

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

        const parseOutlookInboxCount = (text) => {{
            const normalized = (text || '').replace(/[\u200E\u200F\u200B-\u200D]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!normalized) return null;
            if (!/(?:\bInbox\b|\bKotak Masuk\b)/i.test(normalized)) return null;

            const afterFolder = normalized.match(/(?:\bInbox\b|\bKotak Masuk\b)\D{{0,80}}?(\d{{1,5}})\b/i);
            const beforeFolder = normalized.match(/\b(\d{{1,5}})\D{{0,80}}?(?:\bInbox\b|\bKotak Masuk\b)/i);
            const match = afterFolder || beforeFolder;
            if (!match) return null;

            const count = parseInt(match[1], 10);
            return Number.isFinite(count) && count > 0 ? count : null;
        }};

        const isCompactVisibleElement = (element, text) => {{
            if (!element || !text || text.length > 160) return false;
            const rect = element.getBoundingClientRect?.();
            if (rect && (rect.width <= 0 || rect.height <= 0)) return false;
            const style = window.getComputedStyle?.(element);
            if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
            return true;
        }};

        const hasSmallerInboxCandidate = (element, text) => {{
            for (const child of Array.from(element.children || [])) {{
                const childText = (child.innerText || child.textContent || '').trim();
                if (!childText || childText.length >= text.length) continue;
                if (parseOutlookInboxCount(childText) !== null) return true;
            }}
            return false;
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

                    const simpleMatch = childText.match(/(?:Inbox|Kotak Masuk)\D*?(\d+)/i);
                    if (simpleMatch) {{
                        const count = parseInt(simpleMatch[1], 10);
                        if (Number.isFinite(count) && count > 0) return 'count:' + count;
                    }}

                    return null;
                }}
            }}

            return null;
        }};

        const outlookFolderState = () => {{
            const items = document.querySelectorAll([
                '[role="treeitem"]',
                '[role="option"]',
                '[role="button"]',
                '[role="link"]',
                '[role="listitem"]',
                '[data-folder-name]',
                '[data-testid*="folder"]',
                '[aria-label*="Inbox"]',
                '[title*="Inbox"]'
            ].join(', '));
            let bestCount = null;
            for (const item of items) {{
                const texts = [
                    item.getAttribute('aria-label'),
                    item.getAttribute('title'),
                    item.getAttribute('data-folder-name'),
                    (item.innerText || item.textContent || ''),
                ].filter((v) => typeof v === 'string' && v.trim());

                for (const text of texts) {{
                    const count = parseOutlookInboxCount(text);
                    if (count !== null) {{
                        bestCount = Math.max(bestCount || 0, count);
                    }}
                }}
            }}
            return bestCount !== null ? 'count:' + bestCount : null;
        }};

        const outlookVisibleFolderRowState = () => {{
            const roots = resolveObservationTargets();
            const candidates = uniqueElements(roots.flatMap((root) =>
                Array.from(root.querySelectorAll('div, span, a, button, li, [tabindex]'))
            ));
            let bestCount = null;

            for (const candidate of candidates) {{
                const text = (candidate.innerText || candidate.textContent || '').trim();
                if (!isCompactVisibleElement(candidate, text)) continue;
                if (hasSmallerInboxCandidate(candidate, text)) continue;

                const count = parseOutlookInboxCount(text);
                if (count !== null) {{
                    bestCount = Math.max(bestCount || 0, count);
                }}
            }}

            return bestCount !== null ? 'count:' + bestCount : null;
        }};

        const emitBadgeState = (nextState) => {{
            let payload;
            if (nextState === 'unknown') {{
                payload = 'unknown';
            }} else if (typeof nextState === 'string' && nextState.startsWith('count:')) {{
                payload = nextState;
            }} else {{
                payload = 'clear';
            }}

            if (payload === window.__ferx_last_badge_state) return;
            window.__ferx_last_badge_state = payload;
            window.location.href = 'https://ferx.notify/' + payload;
        }};

        const evaluateBadgeState = () => {{
            if (!window.__ferx_badge_monitoring_enabled) return;
            let nextState = 'clear';
            try {{
                // Short-circuit from cheapest to most expensive.
                nextState =
                    outlookScreenReaderState()
                    || outlookFolderState()
                    || outlookVisibleFolderRowState()
                    || titleCountState(document.title);
            }} catch (_error) {{
                nextState = 'clear';
            }}

            emitBadgeState(nextState);
        }};

        const runBadgeEvaluation = () => {{
            if (!window.__ferx_badge_monitoring_enabled) return;
            evaluateBadgeState();
        }};

        const scheduleBadgeEvaluation = () => {{
            if (!window.__ferx_badge_monitoring_enabled) return;

            if (evaluationTimer !== null) {{
                clearTimeout(evaluationTimer);
            }}

            evaluationTimer = setTimeout(() => {{
                evaluationTimer = null;
                window.__ferx_badge_dom_timer = null;
                runBadgeEvaluation();
            }}, BADGE_EVALUATION_DELAY_MS);
            window.__ferx_badge_dom_timer = evaluationTimer;
        }};

        const startSafetyPoll = () => {{
            if (safetyPollTimer !== null) {{
                clearInterval(safetyPollTimer);
            }}

            safetyPollTimer = setInterval(() => {{
                runBadgeEvaluation();
            }}, BADGE_SAFETY_POLL_MS);
        }};

        const stopSafetyPoll = () => {{
            if (safetyPollTimer !== null) {{
                clearInterval(safetyPollTimer);
                safetyPollTimer = null;
            }}
        }};

        const observeTitle = () => {{
            const bindTitleObserver = () => {{
                const titleEl = document.querySelector('title');
                if (!titleEl || titleEl.__ferx_title_observer_bound) return false;

                titleEl.__ferx_title_observer_bound = true;
                new MutationObserver(() => {{
                    if (!window.__ferx_badge_monitoring_enabled) return;
                    runBadgeEvaluation();
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
                runBadgeEvaluation();
            }}).observe(head, {{
                childList: true
            }});
        }};

        const observeDom = () => {{
            if (observer) {{
                observer.disconnect();
            }}

            observer = new MutationObserver(() => {{
                scheduleBadgeEvaluation();
            }});

            for (const target of resolveObservationTargets()) {{
                observer.observe(target, observeOptions);
            }}
        }};

        window.__ferxSetBadgeMonitoring = (enabled) => {{
            window.__ferx_badge_monitoring_enabled = enabled;
            if (!enabled) {{
                if (observer) {{
                    observer.disconnect();
                    observer = null;
                }}

                if (evaluationTimer !== null) {{
                    clearTimeout(evaluationTimer);
                    evaluationTimer = null;
                    window.__ferx_badge_dom_timer = null;
                }}

                stopSafetyPoll();
                return;
            }}

            observeDom();
            startSafetyPoll();
            runBadgeEvaluation();
        }};

        const start = () => {{
            observeTitle();
            observeDom();
            startSafetyPoll();
            runBadgeEvaluation();
        }};

        if (document.readyState === 'loading') {{
            document.addEventListener('DOMContentLoaded', start, {{ once: true }});
        }} else {{
            start();
        }}

        window.addEventListener('focus', () => {{
            if (!window.__ferx_badge_monitoring_enabled) return;
            runBadgeEvaluation();
        }});
        window.addEventListener('hashchange', () => {{
            if (!window.__ferx_badge_monitoring_enabled) return;
            runBadgeEvaluation();
        }});
        window.addEventListener('popstate', () => {{
            if (!window.__ferx_badge_monitoring_enabled) return;
            runBadgeEvaluation();
        }});
    }})();
"#
    )
}

pub(crate) fn teams_badge_engine_script() -> String {
    r#"
    (() => {
        const invoke = window.__TAURI_INTERNALS__?.invoke;
        if (typeof invoke !== 'function') return;

        if (window.__ferx_badge_observers_active) return;
        window.__ferx_badge_observers_active = true;

        window.__ferx_last_badge_state = '__ferx:init__';
        window.__ferx_badge_dom_timer = null;
        window.__ferx_badge_monitoring_enabled = window.__ferx_badge_monitoring_enabled ?? true;
        let observer = null;
        let evaluationTimer = null;
        let evaluationInFlight = false;
        let evaluationQueued = false;
        let safetyPollTimer = null;
        const BADGE_EVALUATION_DELAY_MS = 300;
        const BADGE_SAFETY_POLL_MS = 15000;

        const observeOptions = {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['aria-label', 'title', 'data-testid', 'class']
        };

        const observationSelectors = [
            '[data-tid="app-layout-area--sidebar"]',
            '[data-tid*="rail"]',
            '[role="navigation"]',
            'nav',
            '[class*="app-bar"]',
            '[class*="AppBar"]',
            '[class*="activity"]',
            '[class*="Activity"]'
        ];

        const uniqueElements = (elements) => {
            const seen = new Set();
            return elements.filter((element) => {
                if (!element || seen.has(element)) {
                    return false;
                }
                seen.add(element);
                return true;
            });
        };

        const resolveObservationTargets = () => {
            const roots = uniqueElements(
                observationSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
            );

            if (roots.length > 0) {
                return roots;
            }

            return [document.body || document.documentElement].filter(Boolean);
        };

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

        const runBadgeEvaluation = async () => {
            if (!window.__ferx_badge_monitoring_enabled) return;

            if (evaluationInFlight) {
                evaluationQueued = true;
                return;
            }

            evaluationInFlight = true;

            try {
                await evaluateBadgeState();
            } finally {
                evaluationInFlight = false;

                if (evaluationQueued) {
                    evaluationQueued = false;
                    scheduleBadgeEvaluation();
                }
            }
        };

        const scheduleBadgeEvaluation = () => {
            if (!window.__ferx_badge_monitoring_enabled) return;

            if (evaluationTimer !== null) {
                clearTimeout(evaluationTimer);
            }

            evaluationTimer = setTimeout(() => {
                evaluationTimer = null;
                window.__ferx_badge_dom_timer = null;
                void runBadgeEvaluation();
            }, BADGE_EVALUATION_DELAY_MS);
            window.__ferx_badge_dom_timer = evaluationTimer;
        };

        const startSafetyPoll = () => {
            if (safetyPollTimer !== null) {
                clearInterval(safetyPollTimer);
            }

            safetyPollTimer = setInterval(() => {
                void runBadgeEvaluation();
            }, BADGE_SAFETY_POLL_MS);
        };

        const stopSafetyPoll = () => {
            if (safetyPollTimer !== null) {
                clearInterval(safetyPollTimer);
                safetyPollTimer = null;
            }
        };

        const observeTitle = () => {
            const bindTitleObserver = () => {
                const titleEl = document.querySelector('title');
                if (!titleEl || titleEl.__ferx_title_observer_bound) return false;

                titleEl.__ferx_title_observer_bound = true;
                new MutationObserver(() => {
                    if (!window.__ferx_badge_monitoring_enabled) return;
                    void runBadgeEvaluation();
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
                void runBadgeEvaluation();
            }).observe(head, {
                childList: true
            });
        };

        const observeDom = () => {
            if (observer) {
                observer.disconnect();
            }

            observer = new MutationObserver(() => {
                scheduleBadgeEvaluation();
            });

            for (const target of resolveObservationTargets()) {
                observer.observe(target, observeOptions);
            }
        };

        window.__ferxSetBadgeMonitoring = (enabled) => {
            window.__ferx_badge_monitoring_enabled = enabled;
            if (!enabled) {
                if (observer) {
                    observer.disconnect();
                    observer = null;
                }

                if (evaluationTimer !== null) {
                    clearTimeout(evaluationTimer);
                    evaluationTimer = null;
                    window.__ferx_badge_dom_timer = null;
                }

                evaluationQueued = false;
                stopSafetyPoll();
                return;
            }

            observeDom();
            startSafetyPoll();
            void runBadgeEvaluation();
        };

        const start = () => {
            observeTitle();
            observeDom();
            startSafetyPoll();
            void runBadgeEvaluation();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }

        window.addEventListener('focus', () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            void runBadgeEvaluation();
        });
        window.addEventListener('hashchange', () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            void runBadgeEvaluation();
        });
        window.addEventListener('popstate', () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            void runBadgeEvaluation();
        });
    })();
"#.to_string()
}
