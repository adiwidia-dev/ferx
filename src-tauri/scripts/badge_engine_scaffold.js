
    window.__ferxInitBadgeMonitor = (config) => {
        if (config && config.tauriGuard === true && !window.__TAURI_INTERNALS__) return;
        if (window.__ferx_badge_observers_active) return;
        window.__ferx_badge_observers_active = true;

        window.__ferx_last_badge_state = '__ferx:init__';
        window.__ferx_badge_dom_timer = null;
        window.__ferx_badge_monitoring_enabled = window.__ferx_badge_monitoring_enabled ?? true;
        window.__ferx_badge_monitoring_mode = window.__ferx_badge_monitoring_mode || 'background';

        const readState = config.readState;

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
                emitBadgeState(await readState());
            } catch (_error) {
                emitBadgeState('clear');
            }
        };

        void evaluateBadgeState();
    };
