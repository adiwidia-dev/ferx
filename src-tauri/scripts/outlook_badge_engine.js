
    (() => {
        const normalizeTitle = (title) => (title || '').replace(/[‎‏​-‍]/g, '').trim();

        const safeParseInt = (text) => {
            const n = parseInt((text || '').trim(), 10);
            return Number.isFinite(n) && n > 0 ? n : 0;
        };

        const uniqueElements = (elements) => {
            const seen = new Set();
            return elements.filter((element) => {
                if (!element || seen.has(element)) return false;
                seen.add(element);
                return true;
            });
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

        const resolveObservationTargets = () => uniqueElements(
            observationSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        );

        const titleCountState = (title) => {
            const normalized = normalizeTitle(title);
            const match = normalized.match(/\((\d+)\)/) || normalized.match(/\[(\d+)\]/) || normalized.match(/^(\d+)\s*(?:unread|baru|new|messages?)/i);
            if (!match) return null;
            const count = parseInt(match[1], 10);
            return Number.isFinite(count) && count > 0 ? 'count:' + count : null;
        };

        const parseOutlookInboxCount = (text) => {
            const normalized = (text || '').replace(/[‎‏​-‍]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!normalized) return null;
            if (!/(?:\bInbox\b|\bKotak Masuk\b)/i.test(normalized)) return null;

            const separator = String.raw`(?:[\s:·•\-–—|/\\()]*)`;
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

        const detectors = [
            outlookScreenReaderState,
            outlookVisibleFolderRowState,
            outlookFolderState,
            () => titleCountState(document.title),
        ];

        const readState = () => {
            for (const detect of detectors) {
                const result = detect();
                if (result !== null) return result;
            }
            return 'clear';
        };

        window.__ferxInitBadgeMonitor({
            readState,
            resolveObservationTargets,
            observeOptions: {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['aria-label', 'title', 'data-testid', 'class'],
            },
            titleBindingFlag: '__ferx_outlook_title_bound',
            tauriGuard: true,
        });
    })();
