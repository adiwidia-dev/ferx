
    (() => {
        const hostnameMatches = (hostname, expectedHost) => {
            const host = (hostname || '').toLowerCase();
            return host === expectedHost || host.endsWith('.' + expectedHost);
        };
        if (!hostnameMatches(window.location.hostname, 'web.telegram.org')) return;

        const { safePositiveInt: safeParseInt, uniqueElements, normalizeText } = window.__ferxBadgeUtils;

        const isMutedElement = (element) => Boolean(
            element?.matches?.('.is-muted, .muted') ||
            element?.closest?.('.is-muted, .muted')
        );

        const observationSelectors = [
            '.chatlist',
            '.chat-list',
            '#LeftColumn',
            '.im_dialogs_wrap',
            '.dialogs-list',
            '.sidebar-left',
        ];
        const appShellSelectors = [
            ...observationSelectors,
            '#root',
            '.unread-count',
        ];
        const hasTelegramAppShell = () => appShellSelectors.some((selector) => document.querySelector(selector));

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

        const webAReactCount = () => {
            const el = document.querySelector('.unread-count.active');
            if (!el) return 0;
            return safeParseInt(el.textContent);
        };

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

        const titleCount = () => {
            const title = normalizeText(document.title);
            const match = title.match(/\((\d+)\)/)
                || title.match(/\[(\d+)\]/)
                || title.match(/^(\d+)\s+(?:new|notification|notifications|unread|message|messages)\b/i);
            if (!match) return 0;
            const n = parseInt(match[1], 10);
            return Number.isFinite(n) && n > 0 ? n : 0;
        };

        window.__ferxInitBadgeMonitor({
            readState: () => {
                const total = webKCount() + webAReactCount() + webZCount() + webogramCount();
                if (total > 0) return 'count:' + total;
                const titleTotal = titleCount();
                if (titleTotal > 0) return 'count:' + titleTotal;
                return hasTelegramAppShell() ? 'clear' : 'pending';
            },
            resolveObservationTargets: () => uniqueElements(
                observationSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))),
            ),
            observeOptions: {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['class', 'data-peer-id'],
            },
            titleBindingFlag: '__ferx_telegram_title_bound',
        });
    })();
