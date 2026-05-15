
    (() => {
        const normalizeText = (text) => (text || '').replace(/[‎‏​-‍]/g, '').trim();

        const safeParseInt = (text) => {
            const n = parseInt(normalizeText(text), 10);
            return Number.isFinite(n) && n > 0 ? n : 0;
        };

        const firstPositiveCount = (text) => {
            const match = normalizeText(text).match(/\b(\d{1,5})\b/);
            if (!match) return 0;
            return safeParseInt(match[1]);
        };

        const unreadLabelCount = (label, fallbackText) => {
            const normalized = normalizeText(label);
            if (!/\bunread\b/i.test(normalized)) return 0;

            const fromLabel = firstPositiveCount(normalized);
            if (fromLabel > 0) return fromLabel;

            const fromText = firstPositiveCount(fallbackText);
            return fromText > 0 ? fromText : 1;
        };

        const rowSelector = '[role="listitem"], [role="treeitem"], [role="link"], [data-item-id], [data-conversation-id], [data-space-id]';
        const sectionSelector = '[aria-label*="Direct messages" i], [aria-label*="Spaces" i]';

        const unreadCountFromElementLabels = (root) => {
            let maxNumericCount = 0;
            let hasUnreadMarker = false;
            const elements = [
                root,
                ...Array.from(root.querySelectorAll?.('[aria-label], [title]') || [])
            ];

            for (const element of elements) {
                const label = element.getAttribute('aria-label') || element.getAttribute('title') || '';
                const count = unreadLabelCount(label, element.textContent);
                if (count <= 0) continue;

                hasUnreadMarker = true;
                maxNumericCount = Math.max(maxNumericCount, count);
            }

            return maxNumericCount > 0 ? maxNumericCount : (hasUnreadMarker ? 1 : 0);
        };

        const numericBadgeCount = (root) => {
            const numericBadge = Array.from(root.querySelectorAll?.('*') || []).find((candidate) => {
                if (candidate.children.length > 0) return false;
                return /^\d{1,5}$/.test(normalizeText(candidate.textContent));
            });
            return safeParseInt(numericBadge?.textContent);
        };

        const sectionHeaderCount = (section) => {
            const headings = Array.from(section.querySelectorAll('[role="heading"], h1, h2, h3, h4, h5, h6'));
            for (const heading of headings) {
                const text = normalizeText(heading.textContent);
                if (!/\b(?:direct messages|spaces)\b/i.test(text)) continue;

                const count = numericBadgeCount(heading);
                if (count > 0) return count;
            }

            return 0;
        };

        const rowUnreadCount = (row) => {
            const labelCount = unreadCountFromElementLabels(row);
            const numericCount = numericBadgeCount(row);

            return Math.max(labelCount, numericCount);
        };

        const sectionUnreadCount = (section) => {
            const headerCount = sectionHeaderCount(section);
            if (headerCount > 0) return headerCount;

            let total = 0;
            const countedRows = new Set();
            const rows = section.querySelectorAll(rowSelector);
            for (const row of rows) {
                if (countedRows.has(row)) continue;
                countedRows.add(row);

                total += rowUnreadCount(row);
            }

            return total;
        };

        const sectionKind = (section) => {
            const label = normalizeText(section.getAttribute('aria-label') || section.textContent);
            if (/\bdirect messages\b/i.test(label)) return 'direct';
            if (/\bspaces\b/i.test(label)) return 'spaces';
            return 'other';
        };

        const modernUnreadCount = () => {
            const sections = Array.from(document.querySelectorAll(sectionSelector));
            if (sections.length > 0) {
                const maxByKind = {
                    direct: 0,
                    spaces: 0,
                    other: 0
                };

                for (const section of sections) {
                    const kind = sectionKind(section);
                    maxByKind[kind] = Math.max(maxByKind[kind], sectionUnreadCount(section));
                }

                return maxByKind.direct + maxByKind.spaces + maxByKind.other;
            }

            const nav = document.querySelector('aside[aria-label*="Chat" i], [role="navigation"], nav');
            if (!nav) return 0;

            let total = 0;
            const rows = nav.querySelectorAll(rowSelector);
            for (const row of rows) {
                total += rowUnreadCount(row);
            }

            return total;
        };

        const legacyFerdiumUnreadCount = () => {
            const directCount = document.querySelectorAll(
                'link[href^="https://ssl.gstatic.com/ui/v1/icons/mail/images/favicon_chat_new_notif_"][href$=".ico"]'
            ).length;

            const indirectCount = safeParseInt(
                document.querySelector('div.V6.CL.V2.X9.Y2 span.akt span.XU')?.textContent
            );

            return directCount + indirectCount;
        };

        const titleCount = () => {
            const title = normalizeText(document.title);
            const match = title.match(/\((\d+)\)/)
                || title.match(/\[(\d+)\]/)
                || title.match(/^(\d+)\s+(?:new|notification|notifications|unread|message|messages)\b/i);
            if (!match) return 0;
            return safeParseInt(match[1]);
        };

        window.__ferxInitBadgeMonitor({
            readState: () => {
                const modernTotal = modernUnreadCount();
                if (modernTotal > 0) return 'count:' + modernTotal;
                const legacyTotal = legacyFerdiumUnreadCount();
                if (legacyTotal > 0) return 'count:' + legacyTotal;
                const titleTotal = titleCount();
                return titleTotal > 0 ? 'count:' + titleTotal : 'clear';
            },
            resolveObservationTargets: () => {
                const targets = Array.from(document.querySelectorAll(
                    'aside[aria-label*="Chat" i], [role="navigation"], nav, [aria-label*="Direct messages" i], [aria-label*="Spaces" i]'
                ));
                if (targets.length > 0) return targets;
                const fallback = document.body || document.documentElement;
                return fallback ? [fallback] : [];
            },
            observeOptions: {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['aria-label', 'title', 'class', 'href'],
            },
            titleBindingFlag: '__ferx_google_chat_title_bound',
        });
    })();
