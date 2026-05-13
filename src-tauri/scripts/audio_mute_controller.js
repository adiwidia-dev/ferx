
    (() => {
        if (window.__ferx_audio_mute_controller_installed) return;
        window.__ferx_audio_mute_controller_installed = true;

        let audioMuted = false;
        const mediaState = new WeakMap();
        const audioContexts = new Set();

        const safeCall = (operation) => {
            try {
                const result = operation();
                if (result && typeof result.catch === 'function') result.catch(() => {});
            } catch (_) {}
        };

        const isMediaElement = (element) =>
            typeof HTMLMediaElement !== 'undefined' && element instanceof HTMLMediaElement;

        const applyMediaElement = (element) => {
            if (!isMediaElement(element)) return;

            if (audioMuted) {
                if (!mediaState.has(element)) {
                    mediaState.set(element, {
                        muted: element.muted,
                        volume: element.volume
                    });
                }
                element.muted = true;
                return;
            }

            const previous = mediaState.get(element);
            if (!previous) return;
            element.muted = previous.muted;
            element.volume = previous.volume;
            mediaState.delete(element);
        };

        const applyTree = (root) => {
            if (!root) return;
            applyMediaElement(root);
            if (typeof root.querySelectorAll === 'function') {
                root.querySelectorAll('audio, video').forEach(applyMediaElement);
            }
        };

        const patchContext = (context) => {
            if (!context || context.__ferx_audio_mute_patched) return context;
            context.__ferx_audio_mute_patched = true;
            audioContexts.add(context);

            if (typeof context.resume === 'function') {
                const originalResume = context.resume.bind(context);
                context.__ferx_audio_mute_original_resume = originalResume;
                context.resume = function() {
                    if (audioMuted) return Promise.resolve();
                    return originalResume();
                };
            }

            if (audioMuted && typeof context.suspend === 'function') {
                safeCall(() => context.suspend());
            }

            return context;
        };

        const setContextMuted = (context, muted) => {
            if (!context) return;
            if (muted && typeof context.suspend === 'function') {
                safeCall(() => context.suspend());
            } else if (!muted) {
                const resume = context.__ferx_audio_mute_original_resume || context.resume;
                if (typeof resume === 'function') safeCall(() => resume.call(context));
            }
        };

        const patchAudioContextConstructor = (name) => {
            const Original = window[name];
            if (typeof Original !== 'function' || Original.__ferx_audio_mute_wrapped) return;

            const WrappedAudioContext = function(...args) {
                return patchContext(new Original(...args));
            };
            WrappedAudioContext.prototype = Original.prototype;
            Object.setPrototypeOf(WrappedAudioContext, Original);
            WrappedAudioContext.__ferx_audio_mute_wrapped = true;

            try {
                Object.defineProperty(window, name, {
                    value: WrappedAudioContext,
                    writable: true,
                    configurable: true
                });
            } catch (_) {}
        };

        if (typeof HTMLMediaElement !== 'undefined' && !HTMLMediaElement.prototype.__ferx_audio_mute_play_patched) {
            const originalPlay = HTMLMediaElement.prototype.play;
            HTMLMediaElement.prototype.__ferx_audio_mute_play_patched = true;
            HTMLMediaElement.prototype.play = function(...args) {
                applyMediaElement(this);
                return originalPlay.apply(this, args);
            };
        }

        patchAudioContextConstructor('AudioContext');
        patchAudioContextConstructor('webkitAudioContext');

        const observer = new MutationObserver((mutations) => {
            for (const record of mutations) {
                record.addedNodes.forEach(applyTree);
            }
        });

        const observe = () => {
            if (document.documentElement) {
                const rootElement = document.documentElement;
                observer.observe(rootElement, {
                    childList: true,
                    subtree: true
                });
                applyTree(rootElement);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', observe, { once: true });
        } else {
            observe();
        }

        window.__ferxSetAudioMuted = (muted) => {
            audioMuted = muted === true;
            applyTree(document.documentElement);
            audioContexts.forEach((context) => setContextMuted(context, audioMuted));
        };
    })();
