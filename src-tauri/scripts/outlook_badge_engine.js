
    (() => {
        if (!window.__TAURI_INTERNALS__) return;

        if (window.__ferx_badge_observers_active) return;
        window.__ferx_badge_observers_active = true;

        window.__ferx_badge_strategy = '__FERX_STRATEGY__';
        window.__ferx_last_badge_state = '__ferx:init__';
        window.__ferx_badge_dom_timer = window.__ferx_badge_dom_timer || null;
        window.__ferx_badge_monitoring_enabled = window.__ferx_badge_monitoring_enabled ?? true;
        window.__ferx_badge_monitoring_mode = window.__ferx_badge_monitoring_mode || 'background';
        let observer = null;
        let evaluationTimer = null;
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
            '[role="tree"]',
            '[role="navigation"]',
            'nav',
            '[aria-label*="Folder"]',
            '[aria-label*="Folders"]',
            '[aria-label*="Mail"]',
            '[data-app-section="Mail"]'
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

        const normalizeTitle = (title) => (title || '').replace(/[\u200E\u200F\u200B-\u200D]/g, '').trim();
        const titleCountState = (title) => {
            const normalized = normalizeTitle(title);
            const match = normalized.match(/\((\d+)\)/) || normalized.match(/\[(\d+)\]/) || normalized.match(/^(\d+)\s*(?:unread|baru|new|messages?)/i);
            if (!match) return null;

            const count = parseInt(match[1], 10);
            return Number.isFinite(count) && count > 0 ? 'count:' + count : null;
        };

        const safeParseInt = (text) => {
            const n = parseInt((text || '').trim(), 10);
            return Number.isFinite(n) && n > 0 ? n : 0;
        };

        const parseOutlookInboxCount = (text) => {
            const normalized = (text || '').replace(/[\u200E\u200F\u200B-\u200D]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!normalized) return null;
            if (!/(?:\bInbox\b|\bKotak Masuk\b)/i.test(normalized)) return null;

            const separator = String.raw`(?:[\s:·•\-\u2013\u2014|/\\()]*)`;
            const afterFolder = normalized.match(new RegExp(String.raw`(?:\bInbox\b|\bKotak Masuk\b)${separator}(\d{1,5})\b`, 'i'));
            const beforeFolder = normalized.match(new RegExp(String.raw`\b(\d{1,5})${separator}(?:\bInbox\b|\bKotak Masuk\b)`, 'i'));
            const match = afterFolder || beforeFolder;
            if (!match) return null;

            const count = parseInt(match[1], 10);
            return Number.isFinite(count) && count > 0 ? count : null;
        };

        const isCompactVisibleElement = (element, text) => {
            if (!element || !text || text.length > 160) return false;
            const rect = element.getBoundingClientRect?.();
            if (rect && (rect.width <= 0 || rect.height <= 0)) return false;
            const style = window.getComputedStyle?.(element);
            if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
            return true;
        };

        const hasSmallerInboxCandidate = (element, text) => {
            for (const child of Array.from(element.children || [])) {
                const childText = (child.innerText || child.textContent || '').trim();
                if (!childText || childText.length >= text.length) continue;
                if (parseOutlookInboxCount(childText) !== null) return true;
            }
            return false;
        };

        const isLikelyFolderRow = (element) => {
            if (!element) return false;
            if (element.matches?.([
                '[role="treeitem"]',
                '[role="option"]',
                '[role="button"]',
                '[role="link"]',
                '[role="listitem"]',
                '[data-folder-name]',
                '[data-testid*="folder"]',
                '[aria-label*="Inbox"]',
                '[aria-label*="Kotak Masuk"]',
                '[title*="Inbox"]',
                '[title*="Kotak Masuk"]'
            ].join(', '))) {
                return true;
            }

            return !element.querySelector?.([
                'button',
                'a',
                '[role="button"]',
                '[role="link"]',
                '[role="treeitem"]',
                '[role="option"]',
                '[role="listitem"]'
            ].join(', '));
        };

        const outlookScreenReaderState = () => {
            const trees = document.querySelectorAll('div[role=tree]');
            if (trees.length === 0) return null;

            for (const tree of trees) {
                const children = tree.children;
                for (const child of children) {
                    const childText = (child.textContent || '');
                    const lower = childText.toLowerCase();
                    if (!lower.includes('inbox') && !lower.includes('kotak masuk')) continue;

                    const srSpans = child.querySelectorAll('span.screenReaderOnly');
                    for (const sr of srSpans) {
                        if (!sr.previousSibling) continue;
                        const count = safeParseInt(sr.previousSibling.textContent);
                        if (count > 0) return 'count:' + count;
                    }

                    return null;
                }
            }

            return null;
        };

        const outlookFolderState = () => {
            const items = document.querySelectorAll([
                '[role="treeitem"]',
                '[role="option"]',
                '[role="listitem"]',
                '[data-folder-name]',
                '[data-testid*="folder"]',
                '[aria-label*="Inbox"]',
                '[title*="Inbox"]'
            ].join(', '));
            let bestCount = null;
            for (const item of items) {
                const rect = item.getBoundingClientRect?.();
                if (rect && (rect.width <= 0 || rect.height <= 0)) continue;
                const style = window.getComputedStyle?.(item);
                if (style && (style.display === 'none' || style.visibility === 'hidden')) continue;

                const visibleText = (item.innerText || '').trim();
                const textsToCheck = visibleText
                    ? [visibleText]
                    : [
                        item.getAttribute('aria-label'),
                        item.getAttribute('title'),
                        item.getAttribute('data-folder-name'),
                    ].filter((v) => typeof v === 'string' && v.trim());

                for (const text of textsToCheck) {
                    const count = parseOutlookInboxCount(text);
                    if (count !== null) {
                        bestCount = Math.max(bestCount || 0, count);
                    }
                }
            }
            return bestCount !== null ? 'count:' + bestCount : null;
        };

        const outlookVisibleFolderRowState = () => {
            const roots = resolveObservationTargets();
            if (roots.length === 0) return null;

            const candidates = uniqueElements(roots.flatMap((root) =>
                Array.from(root.querySelectorAll('div, span, a, button, li, [tabindex]'))
            ));
            let bestCount = null;
            let sawInboxFolder = false;

            for (const candidate of candidates) {
                const text = (candidate.innerText || candidate.textContent || '').trim();
                if (!isCompactVisibleElement(candidate, text)) continue;
                if (!isLikelyFolderRow(candidate)) continue;
                if (hasSmallerInboxCandidate(candidate, text)) continue;
                if (/(?:\bInbox\b|\bKotak Masuk\b)/i.test(text)) {
                    sawInboxFolder = true;
                }

                const count = parseOutlookInboxCount(text);
                if (count !== null) {
                    bestCount = Math.max(bestCount || 0, count);
                }
            }

            if (bestCount !== null) return 'count:' + bestCount;
            return sawInboxFolder ? 'clear' : null;
        };

        const emitBadgeState = (nextState) => {
            let payload;
            if (nextState === 'unknown') {
                payload = 'unknown';
            } else if (typeof nextState === 'string' && nextState.startsWith('count:')) {
                payload = nextState;
            } else {
                payload = 'clear';
            }

            if (payload === window.__ferx_last_badge_state) return;
            window.__ferx_last_badge_state = payload;
            window.location.href = 'https://ferx.notify/' + payload;
        };

        const detectors = [
            outlookScreenReaderState,
            outlookVisibleFolderRowState,
            outlookFolderState,
            () => titleCountState(document.title),
        ];

        const evaluateBadgeState = () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            let nextState = 'clear';
            try {
                for (const detect of detectors) {
                    const result = detect();
                    if (result !== null) { nextState = result; break; }
                }
            } catch (_error) {
                nextState = 'clear';
            }

            emitBadgeState(nextState);
        };

        const runBadgeEvaluation = () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            evaluateBadgeState();
        };

        const scheduleBadgeEvaluation = () => {
            if (!window.__ferx_badge_monitoring_enabled) return;

            if (evaluationTimer !== null) {
                clearTimeout(evaluationTimer);
            }

            evaluationTimer = setTimeout(() => {
                evaluationTimer = null;
                window.__ferx_badge_dom_timer = null;
                runBadgeEvaluation();
            }, BADGE_EVALUATION_DELAY_MS);
            window.__ferx_badge_dom_timer = evaluationTimer;
        };

        const startSafetyPoll = () => {
            if (safetyPollTimer !== null) {
                clearInterval(safetyPollTimer);
            }

            safetyPollTimer = setInterval(() => {
                runBadgeEvaluation();
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
                    runBadgeEvaluation();
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
                runBadgeEvaluation();
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

                stopSafetyPoll();
                return;
            }

            startSafetyPoll();
            if (isActiveMonitoringMode()) {
                observeDom();
            } else {
                disconnectDomObserver();
            }
            runBadgeEvaluation();
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
            runBadgeEvaluation();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }

        window.addEventListener('focus', () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            runBadgeEvaluation();
        });
        window.addEventListener('hashchange', () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            runBadgeEvaluation();
        });
        window.addEventListener('popstate', () => {
            if (!window.__ferx_badge_monitoring_enabled) return;
            runBadgeEvaluation();
        });
    })();
