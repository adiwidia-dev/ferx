// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import scaffoldScript from "../../../src-tauri/scripts/badge_engine_scaffold.js?raw";

function installMutationObserverMock() {
  class MockMutationObserver {
    callback: MutationCallback;
    observations: { target: Node; options?: MutationObserverInit }[] = [];
    disconnected = false;
    constructor(callback: MutationCallback) {
      this.callback = callback;
    }
    observe(target: Node, options?: MutationObserverInit) {
      this.observations.push({ target, options });
    }
    disconnect() {
      this.disconnected = true;
    }
    takeRecords() { return []; }
  }
  Object.defineProperty(window, "MutationObserver", {
    configurable: true,
    value: MockMutationObserver,
  });
  Object.defineProperty(globalThis, "MutationObserver", {
    configurable: true,
    value: MockMutationObserver,
  });
}

function runScaffold(config: Record<string, unknown>) {
  vi.useFakeTimers();
  document.body.innerHTML = "";
  installMutationObserverMock();
  const reports: string[] = [];
  window.__ferxBadgeReports = reports;

  const patched = scaffoldScript.replace(
    "window.location.href = 'https://ferx.notify/' + payload;",
    "window.__ferxBadgeReports.push(payload);",
  );
  window.eval(patched);
  (window as Window & { __ferxInitBadgeMonitor?: (c: unknown) => void }).__ferxInitBadgeMonitor?.(config);
  document.dispatchEvent(new Event("DOMContentLoaded"));
  return { reports };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  delete (window as Window & { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__;
  delete window.__ferxBadgeReports;
  delete window.__ferx_badge_observers_active;
  delete window.__ferx_last_badge_state;
  delete window.__ferx_badge_dom_timer;
  delete window.__ferx_badge_monitoring_enabled;
  delete window.__ferx_badge_monitoring_mode;
  delete (window as Window & { __ferxInitBadgeMonitor?: unknown }).__ferxInitBadgeMonitor;
  delete window.__ferxSetBadgeMonitoringMode;
});

describe("badge_engine_scaffold", () => {
  it("exposes window.__ferxInitBadgeMonitor after scaffold evaluation", () => {
    document.body.innerHTML = "";
    installMutationObserverMock();
    window.eval(scaffoldScript);
    expect(typeof (window as Window & { __ferxInitBadgeMonitor?: unknown }).__ferxInitBadgeMonitor).toBe("function");
  });

  it("sets __ferx_badge_observers_active guard on first init", () => {
    runScaffold({
      readState: () => "clear",
      resolveObservationTargets: () => [],
      observeOptions: {},
      titleBindingFlag: "__ferx_test_title_bound",
    });
    expect(window.__ferx_badge_observers_active).toBe(true);
  });

  it("returns early when tauriGuard is true and __TAURI_INTERNALS__ is missing", () => {
    const { reports } = runScaffold({
      readState: () => "count:42",
      resolveObservationTargets: () => [],
      observeOptions: {},
      titleBindingFlag: "__ferx_test_title_bound",
      tauriGuard: true,
    });
    expect(reports).toHaveLength(0);
    expect(window.__ferx_badge_observers_active).toBeUndefined();
  });

  it("proceeds when tauriGuard is true and __TAURI_INTERNALS__ is present", async () => {
    (window as Window & { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__ = {};
    const { reports } = runScaffold({
      readState: () => "count:42",
      resolveObservationTargets: () => [],
      observeOptions: {},
      titleBindingFlag: "__ferx_test_title_bound",
      tauriGuard: true,
    });
    await flush();
    expect(reports).toContain("count:42");
  });

  it("emits the count payload via the navigation transport", async () => {
    const { reports } = runScaffold({
      readState: () => "count:5",
      resolveObservationTargets: () => [],
      observeOptions: {},
      titleBindingFlag: "__ferx_test_title_bound",
    });
    await flush();
    expect(reports.at(-1)).toBe("count:5");
  });

  it("dedups consecutive identical states", async () => {
    const { reports } = runScaffold({
      readState: () => "count:5",
      resolveObservationTargets: () => [],
      observeOptions: {},
      titleBindingFlag: "__ferx_test_title_bound",
    });
    await flush();
    await flush();
    const fives = reports.filter((p) => p === "count:5");
    expect(fives.length).toBe(1);
  });

  it("falls back to clear on readState exception", async () => {
    const { reports } = runScaffold({
      readState: () => { throw new Error("boom"); },
      resolveObservationTargets: () => [],
      observeOptions: {},
      titleBindingFlag: "__ferx_test_title_bound",
    });
    await flush();
    expect(reports.at(-1)).toBe("clear");
  });

  it("supports async readState", async () => {
    const { reports } = runScaffold({
      readState: async () => "count:7",
      resolveObservationTargets: () => [],
      observeOptions: {},
      titleBindingFlag: "__ferx_test_title_bound",
    });
    await flush();
    expect(reports.at(-1)).toBe("count:7");
  });

  it("debounces rapid evaluation requests", async () => {
    let callCount = 0;
    const config = {
      readState: () => { callCount += 1; return "count:" + callCount; },
      resolveObservationTargets: () => [],
      observeOptions: {},
      titleBindingFlag: "__ferx_test_title_bound",
    };
    runScaffold(config);
    window.__ferxSetBadgeMonitoringMode?.("background", true);
    window.__ferxSetBadgeMonitoringMode?.("background", true);
    window.__ferxSetBadgeMonitoringMode?.("background", true);
    await flush();
    expect(callCount).toBeLessThanOrEqual(2);
  });
});

async function flush() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
  }
}

declare global {
  interface Window {
    __ferxBadgeReports?: string[];
    __ferx_badge_observers_active?: boolean;
    __ferx_last_badge_state?: string;
    __ferx_badge_dom_timer?: number | null;
    __ferx_badge_monitoring_enabled?: boolean;
    __ferx_badge_monitoring_mode?: "active" | "background";
    __ferxSetBadgeMonitoringMode?: (mode: "active" | "background", enabled?: boolean) => void;
  }
}
