
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
        let safetyPollTimer = null;
        let observationRetryTimer = null;
        const BADGE_EVALUATION_DELAY_MS = 300;
        const BADGE_SAFETY_POLL_MS = 15000;
        const BADGE_OBSERVATION_RETRY_MS = 1000;

        const observeOptions = {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['aria-label', 'title', 'class']
        };

        const normalizeText = (text) => (text || '').replace(/[\u200E\u200F\u200B-\u200D]/g, '').trim();

        const safeParseInt = (text) => {
            const n = parseInt(normalizeText(text), 10);
            return Number.isFinite(n) && n > 0 ? n : 0;
        };

        const unreadLabelCount = (label, fallbackText) => {
            const normalized = normalizeText(label);
            if (!/\bunread\b/i.test(normalized)) return 0;

            const labelMatch = normalized.match(/\b(\d{1,5})\b/);
            if (labelMatch) return safeParseInt(labelMatch[1]);

            const textMatch = normalizeText(fallbackText).match(/\b(\d{1,5})\b/);
            if (textMatch) return safeParseInt(textMatch[1]);

            return 1;
        };

        const domUnreadTotal = () => {
            const sidePane = document.querySelector('#pane-side, [aria-label*="Chat list" i], [aria-label*="chat list" i]');
            if (!sidePane) return 0;

            let total = 0;
            const countedRows = new Set();
            const rowSelector = '[role="row"], [role="listitem"], [data-testid="cell-frame-container"]';
            const rows = Array.from(sidePane.querySelectorAll(rowSelector))
                .filter((row) => !row.parentElement?.closest(rowSelector));

            for (const row of rows) {
                if (countedRows.has(row)) continue;

                let rowCount = 0;
                const elements = [
                    row,
                    ...Array.from(row.querySelectorAll('[aria-label], [title]'))
                ];

                for (const element of elements) {
                    const label = element.getAttribute('aria-label') || element.getAttribute('title') || '';
                    rowCount = Math.max(rowCount, unreadLabelCount(label, element.textContent));
                }

                if (rowCount <= 0) {
                    const numericBadge = Array.from(row.querySelectorAll('*')).find((candidate) => {
                        if (candidate.children.length > 0) return false;
                        return /^\d{1,5}$/.test(normalizeText(candidate.textContent));
                    });
                    rowCount = safeParseInt(numericBadge?.textContent);
                }

                if (rowCount <= 0) continue;
                countedRows.add(row);
                total += rowCount;
            }

            return total;
        };

        const readState = () => {
            const domTotal = domUnreadTotal();
            return domTotal > 0 ? 'count:' + domTotal : 'clear';
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

        const resolveObservationTargets = () => {
            const target = document.querySelector('#pane-side, [aria-label*="Chat list" i], [aria-label*="chat list" i]')
                || document.body
                || document.documentElement;
            return target ? [target] : [];
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

        const observeTitle = () => {
            const bindTitleObserver = () => {
                const titleEl = document.querySelector('title');
                if (!titleEl || titleEl.__ferx_whatsapp_title_bound) return false;

                titleEl.__ferx_whatsapp_title_bound = true;
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
            window.__ferxSetBadgeMonitoringMode(
                window.__ferx_badge_monitoring_mode,
                enabled
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
