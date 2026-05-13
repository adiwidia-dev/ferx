
    (() => {
        if (window.__ferx_macos_navigation_input_guard_active) return;
        window.__ferx_macos_navigation_input_guard_active = true;

        const macosNavigationChars = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uF700-\uF8FF]/g;
        const hasMacosNavigationChars = (value) =>
            typeof value === 'string' && /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uF700-\uF8FF]/.test(value);
        const stripMacosNavigationChars = (value) => value.replace(macosNavigationChars, '');
        const textInputTypes = new Set(['', 'email', 'password', 'search', 'tel', 'text', 'url']);

        const isTextInput = (element) =>
            element instanceof HTMLInputElement && textInputTypes.has(element.type);

        const editableElementFromTarget = (target) => {
            const element = target instanceof Element ? target : target?.parentElement;
            const editable = element?.closest?.('input, textarea, [contenteditable], [role="textbox"]');
            if (!editable) return null;
            if (
                isTextInput(editable) ||
                editable instanceof HTMLTextAreaElement ||
                editable.isContentEditable ||
                editable.getAttribute('role') === 'textbox'
            ) {
                return editable;
            }
            return null;
        };

        const removedBeforeOffset = (value, offset) =>
            value.slice(0, offset).length - stripMacosNavigationChars(value.slice(0, offset)).length;

        const sanitizeTextControl = (element) => {
            if (!hasMacosNavigationChars(element.value)) return;

            const value = element.value;
            const selectionStart = element.selectionStart;
            const selectionEnd = element.selectionEnd;
            element.value = stripMacosNavigationChars(value);

            if (selectionStart !== null && selectionEnd !== null) {
                element.setSelectionRange(
                    Math.max(0, selectionStart - removedBeforeOffset(value, selectionStart)),
                    Math.max(0, selectionEnd - removedBeforeOffset(value, selectionEnd)),
                );
            }
        };

        const sanitizeContentEditable = (element) => {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            const textNodes = [];
            let node = walker.nextNode();
            while (node) {
                textNodes.push(node);
                node = walker.nextNode();
            }

            textNodes.forEach((textNode) => {
                if (hasMacosNavigationChars(textNode.nodeValue)) {
                    textNode.nodeValue = stripMacosNavigationChars(textNode.nodeValue);
                }
            });
        };

        const sanitizeEditable = (editable) => {
            if (!editable) return;
            if (isTextInput(editable) || editable instanceof HTMLTextAreaElement) {
                sanitizeTextControl(editable);
            } else {
                sanitizeContentEditable(editable);
            }
        };

        document.addEventListener('beforeinput', (event) => {
            if (!hasMacosNavigationChars(event.data)) return;
            if (!editableElementFromTarget(event.target)) return;
            event.preventDefault();
        }, true);

        document.addEventListener('keypress', (event) => {
            if (event.key.length !== 1 || !hasMacosNavigationChars(event.key)) return;
            if (!editableElementFromTarget(event.target)) return;
            event.preventDefault();
        }, true);

        document.addEventListener('input', (event) => {
            sanitizeEditable(editableElementFromTarget(event.target));
        }, true);

        document.addEventListener('focusin', (event) => {
            sanitizeEditable(editableElementFromTarget(event.target));
        }, true);

        sanitizeEditable(editableElementFromTarget(document.activeElement));
    })();

    document.addEventListener('click', (e) => {
        let a = e.target.closest('a');
        if (a && a.href && a.href.startsWith('http') && (a.hasAttribute('download') || a.target === '_blank')) {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = 'https://ferx.download/?url=' + encodeURIComponent(a.href);
        }
    }, true);

    window.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
            const key = parseInt(e.key);
            if (!isNaN(key) && key >= 1 && key <= 9) {
                e.preventDefault();
                window.location.href = 'https://ferx.shortcut/' + key;
            }
        }
    });
