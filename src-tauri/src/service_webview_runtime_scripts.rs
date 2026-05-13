pub(crate) fn google_auth_compat_script() -> &'static str {
    include_str!("../scripts/google_auth_compat.js")
}

pub(crate) fn notification_script(allow_notifications: bool) -> &'static str {
    if allow_notifications {
        r#"
    const mockNotification = Object.assign(function(title, options) {}, {
        permission: 'granted',
        requestPermission: () => Promise.resolve('granted')
    });
    Object.defineProperty(window, 'Notification', { value: mockNotification, writable: true, configurable: true });

    if (window.navigator && window.navigator.permissions) {
        const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
        window.navigator.permissions.query = (params) => {
            if (params && params.name === 'notifications') return Promise.resolve({ state: 'granted', onchange: null });
            return originalQuery(params);
        };
    }
"#
    } else {
        r#"
    const deniedNotification = Object.assign(function() {
        throw new Error('Notifications are disabled for this service');
    }, {
        permission: 'denied',
        requestPermission: () => Promise.resolve('denied')
    });
    Object.defineProperty(window, 'Notification', { value: deniedNotification, writable: true, configurable: true });

    if (window.navigator && window.navigator.permissions) {
        const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
        window.navigator.permissions.query = (params) => {
            if (params && params.name === 'notifications') return Promise.resolve({ state: 'denied', onchange: null });
            return originalQuery(params);
        };
    }
"#
    }
}

pub(crate) fn audio_mute_controller_script() -> &'static str {
    include_str!("../scripts/audio_mute_controller.js")
}

pub(crate) fn spellcheck_script(spell_check_enabled: bool) -> &'static str {
    if spell_check_enabled {
        "window.__ferxSpellcheckEnabled = true;\n"
    } else {
        r#"
    (() => {
        window.__ferxSpellcheckEnabled = false;
        if (window.__ferx_spellcheck_control_active) return;
        window.__ferx_spellcheck_control_active = true;

        const isEditable = (element) =>
            element instanceof HTMLElement &&
            (element.matches('input, textarea, [contenteditable], [role="textbox"]'));

        const disableSpellcheck = (element) => {
            if (!(element instanceof HTMLElement)) return;
            if (isEditable(element)) {
                if (element.getAttribute('spellcheck') === 'false' && element.getAttribute('autocorrect') === 'off') {
                    return;
                }
                element.spellcheck = false;
                element.setAttribute('spellcheck', 'false');
                element.setAttribute('autocorrect', 'off');
            }

            element.querySelectorAll('input, textarea, [contenteditable], [role="textbox"]').forEach((child) => {
                if (!(child instanceof HTMLElement)) return;
                if (child.getAttribute('spellcheck') === 'false' && child.getAttribute('autocorrect') === 'off') {
                    return;
                }
                child.spellcheck = false;
                child.setAttribute('spellcheck', 'false');
                child.setAttribute('autocorrect', 'off');
            });
        };

        const scanVisibleEditors = () => {
            if (document.documentElement instanceof HTMLElement) {
                disableSpellcheck(document.documentElement);
            }
        };

        const scheduleInitialScan = () => {
            const run = () => scanVisibleEditors();
            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(run, { timeout: 1500 });
            } else {
                window.setTimeout(run, 250);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', scheduleInitialScan, { once: true });
        } else {
            scheduleInitialScan();
        }

        document.addEventListener('focusin', (event) => {
            disableSpellcheck(event.target);
        }, true);
    })();
"#
    }
}

pub(crate) fn common_webview_script() -> &'static str {
    include_str!("../scripts/common_webview.js")
}
