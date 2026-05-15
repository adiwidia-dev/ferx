
    (() => {
        const safeParseInt = (text) => {
            const n = parseInt((text || '').trim(), 10);
            return Number.isFinite(n) && n > 0 ? n : 0;
        };

        const normalizeTitle = (title) => (title || '').replace(/[‎‏​-‍]/g, '').trim();

        const uniqueElements = (elements) => {
            const seen = new Set();
            return elements.filter((element) => {
                if (!element || seen.has(element)) return false;
                seen.add(element);
                return true;
            });
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

        const queryUnique = (selectors) => uniqueElements(
            selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        );

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

        window.__ferxInitBadgeMonitor({
            readState: () => {
                const domState = teamsDomState();
                if (domState) return domState;
                const titleState = titleCountState(document.title);
                if (titleState) return 'count:' + titleState;
                return 'clear';
            },
            resolveObservationTargets: () => uniqueElements(
                observationSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))),
            ),
            observeOptions: {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['aria-label', 'title', 'data-testid', 'class'],
            },
            titleBindingFlag: '__ferx_teams_title_bound',
        });
    })();
