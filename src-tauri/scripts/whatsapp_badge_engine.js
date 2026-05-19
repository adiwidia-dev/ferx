
    (() => {
        const hostnameMatches = (hostname, expectedHost) => {
            const host = (hostname || '').toLowerCase();
            return host === expectedHost || host.endsWith('.' + expectedHost);
        };
        if (!hostnameMatches(window.location.hostname, 'web.whatsapp.com')) return;

        const {
            normalizeText,
            safePositiveInt: safeParseInt,
            isTimestampLikeElement
        } = window.__ferxBadgeUtils;

        const sidePaneSelector = '#pane-side, [aria-label*="Chat list" i], [aria-label*="chat list" i]';
        const sidePane = () => document.querySelector(sidePaneSelector);

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
            const pane = sidePane();
            if (!pane) return 0;
            let total = 0;
            const countedRows = new Set();
            const rowSelector = '[role="row"], [role="listitem"], [data-testid="cell-frame-container"]';
            const rows = Array.from(pane.querySelectorAll(rowSelector))
                .filter((row) => !row.parentElement?.closest(rowSelector));
            for (const row of rows) {
                if (countedRows.has(row)) continue;
                let rowCount = 0;
                const elements = [row, ...Array.from(row.querySelectorAll('[aria-label], [title]'))];
                for (const element of elements) {
                    const label = element.getAttribute('aria-label') || element.getAttribute('title') || '';
                    rowCount = Math.max(rowCount, unreadLabelCount(label, element.textContent));
                }
                if (rowCount <= 0) {
                    const numericBadge = Array.from(row.querySelectorAll('*')).find((candidate) => {
                        if (isTimestampLikeElement(candidate)) return false;
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

        window.__ferxInitBadgeMonitor({
            readState: () => {
                if (!sidePane()) return 'pending';
                const domTotal = domUnreadTotal();
                return domTotal > 0 ? 'count:' + domTotal : 'clear';
            },
            resolveObservationTargets: () => {
                const target = sidePane()
                    || document.body
                    || document.documentElement;
                return target ? [target] : [];
            },
            observeOptions: {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['aria-label', 'title', 'class'],
            },
            titleBindingFlag: '__ferx_whatsapp_title_bound',
        });
    })();
