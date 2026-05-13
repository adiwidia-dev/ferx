
    (function() {
        document.addEventListener('securitypolicyviolation', function(e) {
            if (e.blockedURI && (e.blockedURI.indexOf('ipc:') !== -1 || e.blockedURI.indexOf('tauri:') !== -1)) {
                e.stopImmediatePropagation();
            }
        }, true);

        try {
            Object.defineProperty(window, 'webkit', {
                value: Object.create(null),
                configurable: true,
                writable: true
            });
        } catch(_) {
            try {
                Object.defineProperty(window.webkit, 'messageHandlers', {
                    value: undefined,
                    configurable: true,
                    writable: true
                });
            } catch(_) {}
        }

        try { Object.defineProperty(navigator, 'vendor', { get: function() { return 'Google Inc.'; }, configurable: true }); } catch(_) {}
        try { Object.defineProperty(navigator, 'webdriver', { get: function() { return false; }, configurable: true }); } catch(_) {}
        try { Object.defineProperty(navigator, 'pdfViewerEnabled', { get: function() { return true; }, configurable: true }); } catch(_) {}

        var pluginNames = ['PDF Viewer','Chrome PDF Viewer','Chromium PDF Viewer','Microsoft Edge PDF Viewer','WebKit built-in PDF'];
        var fakePlugins = { length: pluginNames.length, item: function(i) { return this[i] || null; }, namedItem: function(n) { for (var i = 0; i < this.length; i++) { if (this[i] && this[i].name === n) return this[i]; } return null; }, refresh: function() {} };
        for (var i = 0; i < pluginNames.length; i++) fakePlugins[i] = Object.freeze({ name: pluginNames[i], filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 });
        try { Object.defineProperty(navigator, 'plugins', { get: function() { return fakePlugins; }, configurable: true }); } catch(_) {}
        try { Object.defineProperty(navigator, 'mimeTypes', { get: function() { var m = { length: 1, item: function(i) { return this[i]||null; }, namedItem: function(n) { return this[0] && this[0].type===n ? this[0] : null; } }; m[0] = { type:'application/pdf', suffixes:'pdf', description:'Portable Document Format' }; return m; }, configurable: true }); } catch(_) {}

        if (!window.chrome) {
            try {
                Object.defineProperty(window, 'chrome', {
                    value: { app: { isInstalled: false, InstallState: {DISABLED:'disabled',INSTALLED:'installed',NOT_INSTALLED:'not_installed'}, RunningState: {CANNOT_RUN:'cannot_run',READY_TO_RUN:'ready_to_run',RUNNING:'running'} }, runtime: { OnInstalledReason:{CHROME_UPDATE:'chrome_update',INSTALL:'install',SHARED_MODULE_UPDATE:'shared_module_update',UPDATE:'update'}, OnRestartRequiredReason:{APP_UPDATE:'app_update',OS_UPDATE:'os_update',PERIODIC:'periodic'}, PlatformArch:{ARM:'arm',ARM64:'arm64',X86_32:'x86-32',X86_64:'x86-64'}, PlatformOs:{ANDROID:'android',CROS:'cros',LINUX:'linux',MAC:'mac',WIN:'win'}, RequestUpdateCheckStatus:{NO_UPDATE:'no_update',THROTTLED:'throttled',UPDATE_AVAILABLE:'update_available'} }, csi: function(){return {};}, loadTimes: function(){return {};} },
                    writable: true, configurable: true
                });
            } catch(_) {}
        }

        if (!navigator.userAgentData) {
            var isMac = !(navigator.platform && navigator.platform.startsWith('Win'));
            var brands = Object.freeze([
                Object.freeze({ brand: 'Google Chrome', version: '135' }),
                Object.freeze({ brand: 'Not-A.Brand', version: '8' }),
                Object.freeze({ brand: 'Chromium', version: '135' })
            ]);
            try {
                Object.defineProperty(navigator, 'userAgentData', {
                    value: Object.freeze({
                        brands: brands, mobile: false,
                        platform: isMac ? 'macOS' : 'Windows',
                        getHighEntropyValues: function() {
                            return Promise.resolve({ brands: brands, mobile: false,
                                platform: isMac ? 'macOS' : 'Windows', platformVersion: isMac ? '15.0.0' : '10.0.0',
                                architecture: isMac ? 'arm' : 'x86', model: '', uaFullVersion: '135.0.0.0',
                                fullVersionList: [{ brand: 'Google Chrome', version: '135.0.0.0' }, { brand: 'Chromium', version: '135.0.0.0' }]
                            });
                        },
                        toJSON: function() { return { brands: brands, mobile: false, platform: isMac ? 'macOS' : 'Windows' }; }
                    }),
                    configurable: true, enumerable: true
                });
            } catch(_) {}
        }

        window.addEventListener('unhandledrejection', function(e) {
            if (e.reason && String(e.reason).indexOf('messageHandlers') !== -1) {
                e.preventDefault();
            }
        });
    })();
