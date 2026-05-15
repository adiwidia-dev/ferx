
    (() => {
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

        const appBadgeSelectors = [
            '[data-tid="app-layout-area--sidebar"] .fui-Badge',
            '[data-tid*="app-bar"] .fui-Badge',
            '[data-tid*="rail"] .fui-Badge',
            '[role="navigation"] .fui-Badge',
            'nav .fui-Badge',
            '[class*="app-bar"] .fui-Badge',
            '[class*="AppBar"] .fui-Badge'
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

        const queryUnique = (selectors) => uniqueElements(
            selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
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

        const ownerForBadge = (badge) => badge.closest?.([
            '[role="treeitem"]',
            '[role="button"]',
            'button',
            'a',
            'li'
        ].join(', ')) || badge.parentElement?.closest?.([
            '[data-tid*="app-bar"]',
            '[data-tid*="rail"]',
            '[data-tid]'
        ].join(', ')) || badge;

        const normalizedOwnerValue = (owner, attribute) => {
            const value = owner?.getAttribute?.(attribute);
            return value ? value.trim().toLowerCase() : '';
        };

        const ownerKeyForBadge = (badge) => {
            const owner = ownerForBadge(badge);
            const semanticKey = [
                ['data-tid', normalizedOwnerValue(owner, 'data-tid')],
                ['data-testid', normalizedOwnerValue(owner, 'data-testid')],
                ['aria-label', normalizedOwnerValue(owner, 'aria-label')],
                ['title', normalizedOwnerValue(owner, 'title')],
                ['id', normalizedOwnerValue(owner, 'id')]
            ].find(([, value]) => value);

            if (semanticKey) {
                return `${owner.tagName?.toLowerCase() || 'element'}:${semanticKey[0]}:${semanticKey[1]}`;
            }

            return owner;
        };

        const countUniqueBadges = (badges) => {
            const countsByOwner = new Map();
            for (const badge of badges) {
                const count = safeParseInt(badge.textContent);
                if (count <= 0) continue;

                const owner = ownerKeyForBadge(badge);
                countsByOwner.set(owner, Math.max(countsByOwner.get(owner) || 0, count));
            }

            let total = 0;
            for (const count of countsByOwner.values()) {
                total += count;
            }
            return total;
        };

        const teamsDomState = () => {
            const appBadges = queryUnique(appBadgeSelectors);
            const appTotal = countUniqueBadges(appBadges);

            if (appTotal > 0) return 'count:' + appTotal;

            const fuiBadges = Array.from(document.querySelectorAll('.fui-Badge'));
            const total = countUniqueBadges(fuiBadges);

            if (total > 0) return 'count:' + total;

            const legacyBadges = document.querySelectorAll(
                '.activity-badge.dot-activity-badge .activity-badge'
            );
            const legacyTotal = countUniqueBadges(legacyBadges);

            if (legacyTotal > 0) return 'count:' + legacyTotal;

            return null;
        };

        const readState = () => {
            const domState = teamsDomState();
            if (domState) return domState;

            const titleState = titleCountState(document.title);
            if (titleState) return 'count:' + titleState;

            return 'clear';
        };

        const emitBadgeState = (nextState) => {
            const payload = (typeof nextState === 'string' && nextState.startsWith('count:'))
                ? nextState
                : 'clear';

            if (payload === window.__ferx_last_badge_state) return;

            window.__ferx_last_badge_state = payload;
            window.location.href = 'https://ferx.notify/' + payload;
        };

        const evaluateBadgeState = async () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            try {
                emitBadgeState(readState());
            } catch (_error) {
                emitBadgeState('clear');
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
