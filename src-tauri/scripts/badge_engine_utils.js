
    (() => {
        if (window.__ferxBadgeUtils) return;

        const normalizeText = (text) => (text || '').replace(/[\u200E\u200F\u200B-\u200D]/g, '').trim();

        const safePositiveInt = (text) => {
            const n = parseInt(normalizeText(text), 10);
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

        const isTimestampLikeElement = (element) => {
            if (!element) return false;
            if (element.closest?.('time')) return true;
            const label = normalizeText(element.getAttribute?.('aria-label') || element.getAttribute?.('title'));
            const testId = normalizeText(element.getAttribute?.('data-testid'));
            return /\b(?:time|date)\b/i.test(label) || /\b(?:time|date)\b/i.test(testId);
        };

        window.__ferxBadgeUtils = {
            normalizeText,
            safePositiveInt,
            uniqueElements,
            isTimestampLikeElement,
        };
    })();
