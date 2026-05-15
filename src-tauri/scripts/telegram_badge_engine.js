
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
            attributeFilter: ['class', 'data-peer-id']
        };

        const observationSelectors = [
            '.chatlist',          // Web K
            '.chat-list',         // Web A React and Web Z
            '#LeftColumn',        // Web A React (stable ID for sidebar)
            '.im_dialogs_wrap',   // Webogram (legacy AngularJS)
            '.dialogs-list',
            '.sidebar-left',
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

        const isMutedElement = (element) => Boolean(
            element?.matches?.('.is-muted, .muted') ||
            element?.closest?.('.is-muted, .muted')
        );

        // Telegram Web K (web.telegram.org/k/ — tweb).
        // Each chat row contains multiple .dialog-subtitle-badge elements (pinned,
        // mention, reaction, unread). Only the unread badge carries the count,
        // identified by the .dialog-subtitle-badge-unread modifier. The .is-visible
        // class is toggled by the show/hide animation so badges with count 0 keep
        // their DOM node but lose .is-visible.
        const webKCount = () => {
            let total = 0;
            const badges = document.querySelectorAll(
                '.dialog-subtitle-badge-unread.is-visible'
            );

            for (const badge of badges) {
                if (isMutedElement(badge)) continue;
                total += safeParseInt(badge.textContent);
            }

            return total;
        };

        // Telegram Web A (web.telegram.org/a/ — React/Teact, current default)
        // Uses CSS modules with SHA1-hashed class names, so chat-level badge selectors
        // are unstable across builds. However the UnreadCounter component renders a
        // <div class="unread-count active">N</div> with a stable non-hashed class
        // containing the total notification count.
        // When running inside a Tauri webview, Web A detects __TAURI_INTERNALS__ and
        // skips updating document.title, so the title fallback is also unavailable.
        const webAReactCount = () => {
            const el = document.querySelector('.unread-count.active');
            if (!el) return 0;
            return safeParseInt(el.textContent);
        };

        // Telegram Web Z (web.telegram.org/z/ — legacy React, redirects to /a/)
        const webZCount = () => {
            let total = 0;
            const badges = document.querySelectorAll(
                '.chat-list .ListItem .ChatBadge.unread:not(.muted)'
            );

            for (const badge of badges) {
                if (isMutedElement(badge)) continue;
                total += safeParseInt(badge.textContent);
            }

            return total;
        };

        // Webogram (web.telegram.org/ — legacy AngularJS)
        const webogramCount = () => {
            let total = 0;
            const badges = document.querySelectorAll(
                '.im_dialog_badge:not(.im_dialog_badge_muted):not(.ng-hide)'
            );

            for (const badge of badges) {
                total += safeParseInt(badge.textContent);
            }

            return total;
        };

        // Title fallback covers multiple Telegram variants:
        //   - Webogram updates the tab title to "(N) Telegram Web"
        //   - Web K (tweb) uses I18n "Notifications.Count" → "N notifications"
        //     (or "N notification" for count=1). The change is gated by idle state,
        //     so the title may lag DOM updates by several seconds.
        //   - Web A in Tauri webviews skips title updates entirely (IS_TAURI branch)
        const titleCount = () => {
            const title = (document.title || '').replace(/[‎‏​-‍]/g, '').trim();
            const match = title.match(/\((\d+)\)/)
                || title.match(/\[(\d+)\]/)
                || title.match(/^(\d+)\s+(?:new|notification|notifications|unread|message|messages)\b/i);
            if (!match) return 0;
            const n = parseInt(match[1], 10);
            return Number.isFinite(n) && n > 0 ? n : 0;
        };

        const readState = () => {
            // The Telegram URL resolves to different clients depending on redirects
            // and stored user preferences (Webogram → Web K, Web Z → Web A). Try all
            // detectors so the script keeps working across variants without needing
            // brittle URL-based variant detection. Only one variant's DOM exists at
            // a time so summing is equivalent to picking the live one.
            const total = webKCount()
                + webAReactCount()
                + webZCount()
                + webogramCount();
            if (total > 0) return 'count:' + total;

            // Title fallback — covers Web K which updates the tab title with
            // "(N) Telegram Web" before the chat list DOM has finished rendering.
            // Not available on Web A in Tauri webviews (IS_TAURI skips title updates).
            const titleTotal = titleCount();
            return titleTotal > 0 ? 'count:' + titleTotal : 'clear';
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

        // Observes <title> changes for immediate badge updates when Telegram K/Z updates
        // the tab title with a new unread count before the chat list DOM is rendered.
        const observeTitle = () => {
            const bindTitleObserver = () => {
                const titleEl = document.querySelector('title');
                if (!titleEl || titleEl.__ferx_telegram_title_bound) return false;

                titleEl.__ferx_telegram_title_bound = true;
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
