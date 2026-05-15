// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import scaffoldScript from "../../../src-tauri/scripts/badge_engine_scaffold.js?raw";
import {
  cleanupBadgeTestGlobals,
  flushBadgeAsync,
  installMutationObserverMock,
} from "./badge-engine-test-utils";

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

afterEach(cleanupBadgeTestGlobals);

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
    await flushBadgeAsync();
    expect(reports).toContain("count:42");
  });

  it("emits the count payload via the navigation transport", async () => {
    const { reports } = runScaffold({
      readState: () => "count:5",
      resolveObservationTargets: () => [],
      observeOptions: {},
      titleBindingFlag: "__ferx_test_title_bound",
    });
    await flushBadgeAsync();
    expect(reports.at(-1)).toBe("count:5");
  });

  it("dedups consecutive identical states", async () => {
    const { reports } = runScaffold({
      readState: () => "count:5",
      resolveObservationTargets: () => [],
      observeOptions: {},
      titleBindingFlag: "__ferx_test_title_bound",
    });
    await flushBadgeAsync();
    await flushBadgeAsync();
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
    await flushBadgeAsync();
    expect(reports.at(-1)).toBe("clear");
  });

  it("supports async readState", async () => {
    const { reports } = runScaffold({
      readState: async () => "count:7",
      resolveObservationTargets: () => [],
      observeOptions: {},
      titleBindingFlag: "__ferx_test_title_bound",
    });
    await flushBadgeAsync();
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
    await flushBadgeAsync();
    expect(callCount).toBeLessThanOrEqual(2);
  });

  it("starts safety poll on init and fires evaluation every 15s", async () => {
    let callCount = 0;
    runScaffold({
      readState: () => { callCount += 1; return "clear"; },
      resolveObservationTargets: () => [],
      observeOptions: {},
      titleBindingFlag: "__ferx_test_title_bound",
    });
    await flushBadgeAsync();
    const initial = callCount;
    await vi.advanceTimersByTimeAsync(15000);
    await flushBadgeAsync();
    expect(callCount).toBeGreaterThan(initial);
  });

  it("stops safety poll when monitoring is disabled", async () => {
    let callCount = 0;
    runScaffold({
      readState: () => { callCount += 1; return "clear"; },
      resolveObservationTargets: () => [],
      observeOptions: {},
      titleBindingFlag: "__ferx_test_title_bound",
    });
    await flushBadgeAsync();
    window.__ferxSetBadgeMonitoringMode?.("background", false);
    const before = callCount;
    await vi.advanceTimersByTimeAsync(20000);
    await flushBadgeAsync();
    expect(callCount).toBe(before);
  });

  it("attaches MutationObserver to resolved targets in active mode", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="watch-me"></div>';
    const target = document.querySelector("#watch-me");
    let observed: Node | null = null;
    class CaptureObserver {
      observe(t: Node) { observed = t; }
      disconnect() {}
      takeRecords() { return []; }
    }
    Object.defineProperty(window, "MutationObserver", {
      configurable: true,
      value: CaptureObserver,
    });
    Object.defineProperty(globalThis, "MutationObserver", {
      configurable: true,
      value: CaptureObserver,
    });
    const reports: string[] = [];
    window.__ferxBadgeReports = reports;
    const patched = scaffoldScript.replace(
      "window.location.href = 'https://ferx.notify/' + payload;",
      "window.__ferxBadgeReports.push(payload);",
    );
    window.eval(patched);
    (window as Window & { __ferxInitBadgeMonitor?: (c: unknown) => void }).__ferxInitBadgeMonitor?.({
      readState: () => "clear",
      resolveObservationTargets: () => target ? [target] : [],
      observeOptions: { childList: true },
      titleBindingFlag: "__ferx_test_title_bound",
    });
    window.__ferxSetBadgeMonitoringMode?.("active", true);
    await flushBadgeAsync();
    expect(observed).toBe(target);
  });

  it("retries observation when targets are not yet available", async () => {
    let callsToResolve = 0;
    runScaffold({
      readState: () => "clear",
      resolveObservationTargets: () => { callsToResolve += 1; return []; },
      observeOptions: {},
      titleBindingFlag: "__ferx_test_title_bound",
    });
    window.__ferxSetBadgeMonitoringMode?.("active", true);
    await flushBadgeAsync();
    const before = callsToResolve;
    await vi.advanceTimersByTimeAsync(1100);
    await flushBadgeAsync();
    expect(callsToResolve).toBeGreaterThan(before);
  });

  it("uses config.titleBindingFlag to mark the title element", async () => {
    document.head.innerHTML = "<title>App</title>";
    runScaffold({
      readState: () => "clear",
      resolveObservationTargets: () => [],
      observeOptions: {},
      titleBindingFlag: "__ferx_marker_title_bound",
    });
    await flushBadgeAsync();
    const titleEl = document.querySelector("title") as HTMLTitleElement & Record<string, unknown>;
    expect(titleEl.__ferx_marker_title_bound).toBe(true);
  });

  it("re-evaluates on focus, hashchange, and popstate events", async () => {
    let callCount = 0;
    runScaffold({
      readState: () => { callCount += 1; return "clear"; },
      resolveObservationTargets: () => [],
      observeOptions: {},
      titleBindingFlag: "__ferx_test_title_bound",
    });
    await flushBadgeAsync();
    const initial = callCount;
    window.dispatchEvent(new Event("focus"));
    await flushBadgeAsync();
    window.dispatchEvent(new Event("hashchange"));
    await flushBadgeAsync();
    window.dispatchEvent(new Event("popstate"));
    await flushBadgeAsync();
    expect(callCount).toBeGreaterThan(initial);
  });
});
