
    window.__ferxInitBadgeMonitor = (config) => {
        if (config && config.tauriGuard === true && !window.__TAURI_INTERNALS__) return;
        if (window.__ferx_badge_observers_active) return;
        window.__ferx_badge_observers_active = true;

        window.__ferx_last_badge_state = '__ferx:init__';
        window.__ferx_badge_dom_timer = null;
        window.__ferx_badge_monitoring_enabled = window.__ferx_badge_monitoring_enabled ?? true;
        window.__ferx_badge_monitoring_mode = window.__ferx_badge_monitoring_mode || 'background';

        let evaluationTimer = null;
        let evaluationInFlight = false;
        let evaluationQueued = false;
        const BADGE_EVALUATION_DELAY_MS = 300;
        const BADGE_SAFETY_POLL_MS = 15000;
        const BADGE_OBSERVATION_RETRY_MS = 1000;
        let safetyPollTimer = null;
        let observer = null;
        let observationRetryTimer = null;

        const resolveObservationTargets = config.resolveObservationTargets;
        const observeOptions = config.observeOptions;

        const readState = config.readState;

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
                emitBadgeState(await readState());
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
            if (evaluationTimer !== null) clearTimeout(evaluationTimer);
            evaluationTimer = setTimeout(() => {
                evaluationTimer = null;
                window.__ferx_badge_dom_timer = null;
                void runBadgeEvaluation();
            }, BADGE_EVALUATION_DELAY_MS);
            window.__ferx_badge_dom_timer = evaluationTimer;
        };

        const startSafetyPoll = () => {
            if (safetyPollTimer !== null) clearInterval(safetyPollTimer);
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

        const observeDom = () => {
            disconnectDomObserver();
            if (!window.__ferx_badge_monitoring_enabled || !isActiveMonitoringMode()) return;
            const targets = resolveObservationTargets();
            if (targets.length === 0) {
                scheduleObservationRetry();
                return;
            }
            observer = new MutationObserver(() => {
                if (!window.__ferx_badge_monitoring_enabled) return;
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
                if (evaluationTimer !== null) {
                    clearTimeout(evaluationTimer);
                    evaluationTimer = null;
                    window.__ferx_badge_dom_timer = null;
                }
                evaluationQueued = false;
                disconnectDomObserver();
                stopSafetyPoll();
                emitBadgeState('clear');
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
            window.__ferxSetBadgeMonitoringMode(window.__ferx_badge_monitoring_mode, enabled === true);
        };

        const observeTitle = () => {
            const flag = config.titleBindingFlag;
            const bindTitleObserver = () => {
                const titleEl = document.querySelector('title');
                if (!titleEl || titleEl[flag]) return false;
                titleEl[flag] = true;
                new MutationObserver(() => {
                    if (!window.__ferx_badge_monitoring_enabled) return;
                    scheduleBadgeEvaluation();
                }).observe(titleEl, { childList: true, subtree: true, characterData: true });
                return true;
            };
            bindTitleObserver();
            const head = document.head || document.documentElement;
            if (!head) return;
            new MutationObserver(() => {
                if (!bindTitleObserver()) return;
                if (!window.__ferx_badge_monitoring_enabled) return;
                scheduleBadgeEvaluation();
            }).observe(head, { childList: true });
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
    };
