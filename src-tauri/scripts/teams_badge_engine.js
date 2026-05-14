
    (() => {
        const invoke = window.__TAURI_INTERNALS__?.invoke;
        if (typeof invoke !== 'function') return;

        if (window.__ferx_badge_observers_active) return;
        window.__ferx_badge_observers_active = true;

        window.__ferx_last_badge_state = '__ferx:init__';
        window.__ferx_badge_dom_timer = null;
        window.__ferx_badge_monitoring_enabled = window.__ferx_badge_monitoring_enabled ?? true;
        window.__ferx_badge_monitoring_mode = window.__ferx_badge_monitoring_mode || 'background';
        let observer = null;
        let evaluationTimer = null;
        let evaluationInFlight = false;
        let evaluationQueued = false;
        let observationRetryTimer = null;
        let safetyPollTimer = null;
        const BADGE_EVALUATION_DELAY_MS = 300;
        const BADGE_OBSERVATION_RETRY_MS = 1000;
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

        const resolveObservationTargets = () => uniqueElements(
            observationSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        );

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

        const isActiveMonitoringMode = () => window.__ferx_badge_monitoring_mode === 'active';

        const clearObservationRetry = () => {
            if (observationRetryTimer !== null) {
                clearTimeout(observationRetryTimer);
                observationRetryTimer = null;
            }
        };

        const disconnectDomObserver = () => {
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            clearObservationRetry();
        };

        const scheduleObservationRetry = () => {
            if (!window.__ferx_badge_monitoring_enabled || !isActiveMonitoringMode()) return;
            if (observationRetryTimer !== null) return;

            observationRetryTimer = setTimeout(() => {
                observationRetryTimer = null;
                observeDom();
            }, BADGE_OBSERVATION_RETRY_MS);
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
            disconnectDomObserver();

            if (!window.__ferx_badge_monitoring_enabled || !isActiveMonitoringMode()) return;

            const targets = resolveObservationTargets();
            if (targets.length === 0) {
                scheduleObservationRetry();
                return;
            }

            observer = new MutationObserver(() => {
                scheduleBadgeEvaluation();
            });

            for (const target of targets) {
                observer.observe(target, observeOptions);
            }
        };

        window.__ferxSetBadgeMonitoringMode = (mode, enabled = true) => {
            window.__ferx_badge_monitoring_mode = mode === 'active' ? 'active' : 'background';
            window.__ferx_badge_monitoring_enabled = enabled === true;
            if (!window.__ferx_badge_monitoring_enabled) {
                disconnectDomObserver();

                if (evaluationTimer !== null) {
                    clearTimeout(evaluationTimer);
                    evaluationTimer = null;
                    window.__ferx_badge_dom_timer = null;
                }

                evaluationQueued = false;
                stopSafetyPoll();
                return;
            }

            startSafetyPoll();
            if (isActiveMonitoringMode()) {
                observeDom();
            } else {
                disconnectDomObserver();
            }
            void runBadgeEvaluation();
        };

        window.__ferxSetBadgeMonitoring = (enabled) => {
            window.__ferxSetBadgeMonitoringMode(
                window.__ferx_badge_monitoring_mode,
                enabled === true
            );
        };

        const start = () => {
            observeTitle();
            startSafetyPoll();
            if (isActiveMonitoringMode()) {
                observeDom();
            }
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
