pub(crate) fn resource_usage_monitor_script() -> &'static str {
    r#"
    (() => {
        const invoke = window.__TAURI_INTERNALS__?.invoke;
        if (typeof invoke !== 'function') return;

        window.__ferxResourceUsageMonitoringEnabled = true;

        if (window.__ferx_resource_usage_monitor_active) {
            window.__ferxSetResourceUsageMonitoring?.(true);
            return;
        }

        window.__ferx_resource_usage_monitor_active = true;
        window.__ferx_resource_usage_timer = null;
        window.__ferx_resource_usage_last_network_bytes = 0;
        window.__ferx_resource_usage_upload_bytes = 0;
        window.__ferx_resource_usage_last_sample = performance.now();
        window.__ferx_resource_usage_long_task_ms = 0;
        window.__ferx_resource_usage_last_tick = performance.now();
        window.__ferx_resource_usage_cpu_estimate = null;

        const safeNumber = (value) => Number.isFinite(value) ? value : null;
        const textEncoder = new TextEncoder();
        const bodyByteLength = (body) => {
            if (body == null) return 0;
            try {
                if (typeof body === 'string') return textEncoder.encode(body).byteLength;
                if (body instanceof URLSearchParams) return textEncoder.encode(body.toString()).byteLength;
                if (body instanceof Blob) return body.size;
                if (body instanceof ArrayBuffer) return body.byteLength;
                if (ArrayBuffer.isView(body)) return body.byteLength;
                if (body instanceof FormData) {
                    let total = 0;
                    for (const [key, value] of body.entries()) {
                        total += textEncoder.encode(String(key)).byteLength;
                        if (typeof value === 'string') {
                            total += textEncoder.encode(value).byteLength;
                        } else if (value && Number.isFinite(value.size)) {
                            total += value.size;
                        }
                    }
                    return total;
                }
            } catch (_error) {
                return 0;
            }
            return 0;
        };
        const recordUploadBytes = (bytes) => {
            if (Number.isFinite(bytes) && bytes > 0) {
                window.__ferx_resource_usage_upload_bytes += bytes;
            }
        };
        const memoryEstimate = () => {
            const memory = performance.memory;
            if (!memory || !Number.isFinite(memory.usedJSHeapSize)) return null;
            return memory.usedJSHeapSize;
        };

        const totalNetworkBytes = () => {
            let total = 0;
            try {
                const entries = performance.getEntriesByType('resource');
                for (const entry of entries) {
                    const bytes = entry.transferSize || entry.encodedBodySize || entry.decodedBodySize || 0;
                    if (Number.isFinite(bytes) && bytes > 0) total += bytes;
                }
            } catch (_error) {
                return 0;
            }
            return total;
        };

        const installNetworkUploadHooks = () => {
            if (window.__ferx_resource_usage_upload_hooks_active) return;
            window.__ferx_resource_usage_upload_hooks_active = true;

            window.__ferx_resource_usage_original_fetch = window.fetch;
            if (typeof window.__ferx_resource_usage_original_fetch === 'function') {
                window.fetch = function(input, init) {
                    try {
                        const body = init && 'body' in init ? init.body : input instanceof Request ? input.body : null;
                        recordUploadBytes(bodyByteLength(body));
                    } catch (_error) {}
                    return window.__ferx_resource_usage_original_fetch.apply(this, arguments);
                };
            }

            window.__ferx_resource_usage_original_xhr_send = XMLHttpRequest.prototype.send;
            if (typeof window.__ferx_resource_usage_original_xhr_send === 'function') {
                XMLHttpRequest.prototype.send = function(body) {
                    try {
                        recordUploadBytes(bodyByteLength(body));
                    } catch (_error) {}
                    return window.__ferx_resource_usage_original_xhr_send.apply(this, arguments);
                };
            }

            window.__ferx_resource_usage_original_send_beacon = navigator.sendBeacon;
            if (typeof window.__ferx_resource_usage_original_send_beacon === 'function') {
                navigator.sendBeacon = function(url, data) {
                    try {
                        recordUploadBytes(bodyByteLength(data));
                    } catch (_error) {}
                    return window.__ferx_resource_usage_original_send_beacon.call(navigator, url, data);
                };
            }
        };

        const restoreNetworkUploadHooks = () => {
            if (!window.__ferx_resource_usage_upload_hooks_active) return;
            window.__ferx_resource_usage_upload_hooks_active = false;

            if (typeof window.__ferx_resource_usage_original_fetch === 'function') {
                window.fetch = window.__ferx_resource_usage_original_fetch;
            }
            if (typeof window.__ferx_resource_usage_original_xhr_send === 'function') {
                XMLHttpRequest.prototype.send = window.__ferx_resource_usage_original_xhr_send;
            }
            if (typeof window.__ferx_resource_usage_original_send_beacon === 'function') {
                navigator.sendBeacon = window.__ferx_resource_usage_original_send_beacon;
            }

            window.__ferx_resource_usage_original_fetch = null;
            window.__ferx_resource_usage_original_xhr_send = null;
            window.__ferx_resource_usage_original_send_beacon = null;
        };

        const installLongTaskObserver = () => {
            if (window.__ferx_resource_usage_long_task_observer) return;
            if (typeof PerformanceObserver !== 'function') return;
            try {
                window.__ferx_resource_usage_long_task_observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (Number.isFinite(entry.duration)) {
                            window.__ferx_resource_usage_long_task_ms += entry.duration;
                        }
                    }
                });
                window.__ferx_resource_usage_long_task_observer.observe({ type: 'longtask', buffered: true });
            } catch (_error) {}
        };

        const disconnectLongTaskObserver = () => {
            window.__ferx_resource_usage_long_task_observer?.disconnect();
            window.__ferx_resource_usage_long_task_observer = null;
        };

        const sample = async () => {
            if (!window.__ferxResourceUsageMonitoringEnabled) return;

            const now = performance.now();
            const elapsedMs = Math.max(1, now - window.__ferx_resource_usage_last_sample);
            const networkBytes = totalNetworkBytes();
            const networkDelta = Math.max(0, networkBytes - window.__ferx_resource_usage_last_network_bytes);
            const networkInMbps = (networkDelta * 8) / (elapsedMs / 1000) / 1000000;
            const uploadBytes = window.__ferx_resource_usage_upload_bytes;
            const networkOutMbps = (uploadBytes * 8) / (elapsedMs / 1000) / 1000000;
            const longTaskPercent = Math.min(100, (window.__ferx_resource_usage_long_task_ms / elapsedMs) * 100);

            const tickDelay = Math.max(0, now - window.__ferx_resource_usage_last_tick - 1000);
            const tickEstimate = Math.min(100, (tickDelay / elapsedMs) * 100);
            const cpuEstimatePercent = Math.max(longTaskPercent, tickEstimate);

            window.__ferx_resource_usage_last_tick = now;
            window.__ferx_resource_usage_last_sample = now;
            window.__ferx_resource_usage_last_network_bytes = networkBytes;
            window.__ferx_resource_usage_upload_bytes = 0;
            window.__ferx_resource_usage_long_task_ms = 0;
            window.__ferx_resource_usage_cpu_estimate = cpuEstimatePercent;

            const payload = JSON.stringify({
                sampledAt: Date.now(),
                cpuEstimatePercent: safeNumber(cpuEstimatePercent),
                memoryEstimateBytes: memoryEstimate(),
                networkInMbps: safeNumber(networkInMbps),
                networkOutMbps: safeNumber(networkOutMbps)
            });

            try {
                await invoke('report_resource_usage', { payload });
            } catch (_error) {}
        };

        window.__ferxSetResourceUsageMonitoring = (enabled) => {
            window.__ferxResourceUsageMonitoringEnabled = enabled;
            if (window.__ferx_resource_usage_timer) {
                clearInterval(window.__ferx_resource_usage_timer);
                window.__ferx_resource_usage_timer = null;
            }
            if (!enabled) {
                restoreNetworkUploadHooks();
                disconnectLongTaskObserver();
                return;
            }

            installNetworkUploadHooks();
            installLongTaskObserver();
            window.__ferx_resource_usage_last_sample = performance.now();
            window.__ferx_resource_usage_last_network_bytes = totalNetworkBytes();
            window.__ferx_resource_usage_timer = setInterval(() => void sample(), 1000);
            void sample();
        };

        window.__ferxSetResourceUsageMonitoring(true);
    })();
"#
}
