
    (() => {
        const invoke = window.__TAURI_INTERNALS__?.invoke;
        if (typeof invoke !== 'function') return;

        if (window.__ferx_badge_observers_active) return;
        window.__ferx_badge_observers_active = true;

        window.__ferx_badge_strategy = '__FERX_STRATEGY__';
        window.__ferx_last_badge_state = '__ferx:init__';
        window.__ferx_badge_dom_timer = window.__ferx_badge_dom_timer || null;
        window.__ferx_badge_monitoring_enabled = window.__ferx_badge_monitoring_enabled ?? true;

        const normalizeTitle = (title) => (title || '').replace(/[\u200E\u200F\u200B-\u200D]/g, '').trim();
        const unsupportedTitleState = (title) => {
            const normalized = normalizeTitle(title);
            const match = normalized.match(/\((\d+)\)/) || normalized.match(/\[(\d+)\]/);
            if (!match) return 'clear';

            const count = parseInt(match[1], 10);
            if (!Number.isFinite(count) || count <= 0) return 'clear';

            return 'count:' + count;
        };

        const titleCountState = (title) => {
            const normalized = normalizeTitle(title);
            const match = normalized.match(/\((\d+)\)/) || normalized.match(/\[(\d+)\]/) || normalized.match(/^(\d+)\s*(?:unread|baru|new|messages?)/i);
            if (!match) return 'clear';

            const count = parseInt(match[1], 10);
            if (!Number.isFinite(count) || count <= 0) return 'clear';

            return 'count:' + count;
        };

        const strategies = {
            'unsupported': {
                needsDomObservation: false,
                readState: () => unsupportedTitleState(document.title)
            },
            'teams-title': {
                needsDomObservation: false,
                readState: () => titleCountState(document.title)
            },
        };

        const strategy = strategies[window.__ferx_badge_strategy] || strategies['unsupported'];
        const emitBadgeState = (nextState) => {
            let payload = nextState;
            if (payload === 'unknown') {
                payload = 'unknown';
            } else if (typeof payload === 'string' && payload.startsWith('count:')) {
                const count = payload.slice(6);
                payload = 'count:' + count;
            } else {
                payload = 'clear';
            }

            if (payload === window.__ferx_last_badge_state) return;

            window.__ferx_last_badge_state = payload;
            window.location.href = 'https://ferx.notify/' + payload;
        };

        const evaluateBadgeState = () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            try {
                emitBadgeState(strategy.readState());
            } catch (error) {
                emitBadgeState('clear');
            }
        };
        const scheduleDomEvaluation = () => {
            if (!strategy.needsDomObservation) return;
            if (!window.__ferx_badge_monitoring_enabled) return;
            if (window.__ferx_badge_dom_timer) clearTimeout(window.__ferx_badge_dom_timer);
            window.__ferx_badge_dom_timer = window.setTimeout(() => {
                window.__ferx_badge_dom_timer = null;
                evaluateBadgeState();
            }, 150);
        };

        const observeTitle = () => {
            const bindTitleObserver = () => {
                const titleEl = document.querySelector('title');
                if (!titleEl || titleEl.__ferx_title_observer_bound) return false;

                titleEl.__ferx_title_observer_bound = true;
                new MutationObserver(() => {
                    if (!window.__ferx_badge_monitoring_enabled) return;
                    evaluateBadgeState();
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
                evaluateBadgeState();
            }).observe(head, {
                childList: true
            });
        };

        const observeDom = () => {
            if (!strategy.needsDomObservation) return;

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
            evaluateBadgeState();
        };

        const start = () => {
            observeTitle();
            observeDom();
            evaluateBadgeState();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }

        window.addEventListener('focus', () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            evaluateBadgeState();
        });
        window.addEventListener('hashchange', () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            evaluateBadgeState();
        });
        window.addEventListener('popstate', () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            evaluateBadgeState();
        });
    })();
