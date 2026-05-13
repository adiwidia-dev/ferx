// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import resourceUsageMonitorScript from "../../../src-tauri/scripts/resource_usage_monitor.js?raw";

function runResourceUsageMonitorScript(readyState = "complete") {
  vi.useFakeTimers();
  Object.defineProperty(document, "readyState", {
    configurable: true,
    value: readyState,
  });

  const reports: string[] = [];
  window.__TAURI_INTERNALS__ = {};
  window.__ferxResourceReports = reports;

  const script = resourceUsageMonitorScript.replace(
    "window.location.href = 'https://ferx.resource/?data=' + encodeURIComponent(payload);",
    "window.__ferxResourceReports.push(payload);",
  );

  window.eval(script);

  return reports;
}

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, "readyState", {
    configurable: true,
    value: "complete",
  });
  delete window.__TAURI_INTERNALS__;
  delete window.__ferxResourceReports;
  delete window.__ferxResourceUsageMonitoringEnabled;
  delete window.__ferx_resource_usage_monitor_active;
  delete window.__ferx_resource_usage_timer;
  delete window.__ferx_resource_usage_upload_hooks_active;
  delete window.__ferx_resource_usage_original_fetch;
  delete window.__ferx_resource_usage_original_xhr_send;
  delete window.__ferx_resource_usage_original_send_beacon;
  delete window.__ferx_resource_usage_long_task_observer;
});

describe("resource usage monitor script", () => {
  it("waits before reporting so initialization cannot interrupt the service navigation", () => {
    const reports = runResourceUsageMonitorScript();

    expect(reports).toHaveLength(0);

    vi.advanceTimersByTime(1000);

    expect(reports).toHaveLength(1);
  });

  it("waits for the service page load before starting resource reports", () => {
    const reports = runResourceUsageMonitorScript("loading");

    vi.advanceTimersByTime(5000);
    expect(reports).toHaveLength(0);

    window.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(999);
    expect(reports).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(reports).toHaveLength(1);
  });
});

declare global {
  interface Window {
    __TAURI_INTERNALS__?: object;
    __ferxResourceReports?: string[];
    __ferxResourceUsageMonitoringEnabled?: boolean;
    __ferx_resource_usage_monitor_active?: boolean;
    __ferx_resource_usage_timer?: number | null;
    __ferx_resource_usage_upload_hooks_active?: boolean;
    __ferx_resource_usage_original_fetch?: typeof fetch | null;
    __ferx_resource_usage_original_xhr_send?: XMLHttpRequest["send"] | null;
    __ferx_resource_usage_original_send_beacon?: Navigator["sendBeacon"] | null;
    __ferx_resource_usage_long_task_observer?: PerformanceObserver | null;
  }
}
